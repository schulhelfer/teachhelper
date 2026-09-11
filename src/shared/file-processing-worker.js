import { FILE_LIMITS, exceedsZipCompressionRatio } from "./file-guards.js";
import { prepareDocxTemplate } from "./docx-template.js";

const PDF_LIB_URL = new URL("../vendor/cantoo-pdf-lib/2.11.0/pdf-lib.min.js", import.meta.url);
const JSZIP_URL = new URL("../vendor/jszip/3.10.2/jszip.min.js", import.meta.url);

async function pdfLib() {
  if (!globalThis.PDFLib?.PDFDocument) await import(PDF_LIB_URL.href);
  if (!globalThis.PDFLib?.PDFDocument) throw new Error("PDF-Library konnte nicht geladen werden.");
  return globalThis.PDFLib;
}

async function jsZip() {
  if (!globalThis.JSZip?.loadAsync) await import(JSZIP_URL.href);
  if (!globalThis.JSZip?.loadAsync) throw new Error("ZIP-Library konnte nicht geladen werden.");
  return globalThis.JSZip;
}

function assertPageCount(count) {
  if (!Number.isInteger(count) || count < 1) throw new Error("Die PDF enthält keine Seiten.");
  if (count > FILE_LIMITS.PDF_MAX_PAGES) throw new Error(`Die PDF enthält zu viele Seiten. Maximal erlaubt: ${FILE_LIMITS.PDF_MAX_PAGES}.`);
}

function bytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value || []);
}

async function readEntry(entry, maxBytes, total) {
  const stream = entry.internalStream("uint8array");
  const chunks = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (error) => {
      if (done) return;
      done = true;
      try { stream.pause(); } catch (_error) {}
      reject(error);
    };
    stream.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes || total + size > FILE_LIMITS.ZIP_TOTAL_UNCOMPRESSED_BYTES) {
        fail(new Error("Das ZIP ist entpackt zu groß."));
        return;
      }
      chunks.push(chunk);
    }).on("error", fail).on("end", () => {
      if (done) return;
      done = true;
      const output = new Uint8Array(size);
      let offset = 0;
      chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
      resolve(output);
    }).resume();
  });
}

function imageMime(name) {
  if (/\.(jpe?g|jfif|pjpeg|pjp)$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.bmp$/i.test(name)) return "image/bmp";
  if (/\.svg$/i.test(name)) return "image/svg+xml";
  return "";
}

async function handle(task, payload) {
  if (task === "pdf-page-count") {
    const PDFLib = await pdfLib();
    const document = await PDFLib.PDFDocument.load(bytes(payload.data));
    const count = document.getPageCount();
    assertPageCount(count);
    return { count };
  }
  if (task === "pdf-merge") {
    const PDFLib = await pdfLib();
    const output = await PDFLib.PDFDocument.create();
    let pageCount = 0;
    for (const input of payload.files || []) {
      const source = await PDFLib.PDFDocument.load(bytes(input));
      pageCount += source.getPageCount();
      assertPageCount(pageCount);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
    }
    return { data: await output.save({ useObjectStreams: false }) };
  }
  if (task === "pdf-rotate") {
    const PDFLib = await pdfLib();
    const document = await PDFLib.PDFDocument.load(bytes(payload.data));
    assertPageCount(document.getPageCount());
    (payload.rotations || []).forEach((rotation, index) => {
      const page = document.getPage(index);
      if (!page) return;
      page.setRotation(PDFLib.degrees(((page.getRotation().angle + Number(rotation || 0)) % 360 + 360) % 360));
    });
    return { data: await document.save({ useObjectStreams: false }) };
  }
  if (task === "pdf-split") {
    const PDFLib = await pdfLib();
    const source = await PDFLib.PDFDocument.load(bytes(payload.data));
    assertPageCount(source.getPageCount());
    const outputs = [];
    for (const indexes of payload.groups || []) {
      const output = await PDFLib.PDFDocument.create();
      const pages = await output.copyPages(source, indexes);
      pages.forEach((page) => output.addPage(page));
      outputs.push(await output.save({ useObjectStreams: false }));
    }
    return { outputs };
  }
  if (task === "docx-prepare") {
    return { prepared: await prepareDocxTemplate(bytes(payload.template)) };
  }
  if (task === "zip-analyze") {
    const JSZip = await jsZip();
    const archive = await JSZip.loadAsync(bytes(payload.data));
    const entries = Object.values(archive.files || {}).filter((entry) => entry && !entry.dir);
    if (!entries.length) throw new Error("Das ZIP enthält keine Dateien.");
    if (entries.length > FILE_LIMITS.ZIP_MAX_ENTRIES) throw new Error(`Das ZIP enthält zu viele Dateien. Maximal erlaubt: ${FILE_LIMITS.ZIP_MAX_ENTRIES}.`);
    const records = [];
    let total = 0;
    for (const entry of entries) {
      const compressed = Number(entry?._data?.compressedSize);
      const output = await readEntry(entry, FILE_LIMITS.ZIP_ENTRY_BYTES, total);
      if (Number.isFinite(compressed) && exceedsZipCompressionRatio(compressed, output.byteLength)) throw new Error(`"${entry.name}" ist verdächtig stark komprimiert.`);
      total += output.byteLength;
      records.push({ name: entry.name, size: output.byteLength, mime: imageMime(entry.name), data: imageMime(entry.name) ? output : null });
    }
    return { records };
  }
  throw new Error("Unbekannte Dateiverarbeitung.");
}

self.onmessage = async ({ data }) => {
  try {
    const value = await handle(data?.task, data?.payload || {});
    const transfer = [];
    const collect = (item) => {
      if (item instanceof Uint8Array) transfer.push(item.buffer);
      else if (Array.isArray(item)) item.forEach(collect);
      else if (item && typeof item === "object") Object.values(item).forEach(collect);
    };
    collect(value);
    self.postMessage({ type: "result", value }, transfer);
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Dateiverarbeitung ist fehlgeschlagen." });
  }
};
