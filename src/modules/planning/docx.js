const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE = 0;
const ZIP_DEFLATE = 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function writeUint16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function getUint16(view, offset) {
  return view.getUint16(offset, true);
}

function getUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (getUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("Die DOCX-Datei konnte nicht gelesen werden.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Dieser Browser unterstützt die DOCX-ZIP-Dekompression nicht.");
  }
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  } catch (_error) {
    throw new Error("Dieser Browser unterstützt die DOCX-ZIP-Dekompression nicht.");
  }
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(input) {
  const sourceBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(sourceBytes);
  const entryCount = getUint16(view, eocdOffset + 10);
  let centralOffset = getUint32(view, eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (getUint32(view, centralOffset) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new Error("Die DOCX-ZIP-Struktur ist ungültig.");
    }
    const flags = getUint16(view, centralOffset + 8);
    const method = getUint16(view, centralOffset + 10);
    const compressedSize = getUint32(view, centralOffset + 20);
    const uncompressedSize = getUint32(view, centralOffset + 24);
    const nameLength = getUint16(view, centralOffset + 28);
    const extraLength = getUint16(view, centralOffset + 30);
    const commentLength = getUint16(view, centralOffset + 32);
    const localOffset = getUint32(view, centralOffset + 42);
    const nameBytes = sourceBytes.slice(centralOffset + 46, centralOffset + 46 + nameLength);
    const name = textDecoder.decode(nameBytes);
    if (getUint32(view, localOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error("Die DOCX-ZIP-Struktur ist ungültig.");
    }
    const localNameLength = getUint16(view, localOffset + 26);
    const localExtraLength = getUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = sourceBytes.slice(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === ZIP_STORE) {
      data = compressedData;
    } else if (method === ZIP_DEFLATE) {
      data = await inflateRaw(compressedData);
    } else {
      throw new Error("Diese DOCX-Komprimierung wird nicht unterstützt.");
    }
    if (uncompressedSize && data.length !== uncompressedSize) {
      throw new Error("Die DOCX-Datei konnte nicht vollständig gelesen werden.");
    }
    entries.push({ name, data, flags });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = String(entry.name || "");
    const nameBytes = textEncoder.encode(name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, ZIP_LOCAL_FILE_HEADER);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, ZIP_UTF8_FLAG);
    writeUint16(local, 8, ZIP_STORE);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, ZIP_CENTRAL_FILE_HEADER);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, ZIP_UTF8_FLAG);
    writeUint16(central, 10, ZIP_STORE);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const localBytes = concatBytes(localParts);
  const centralBytes = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, ZIP_END_OF_CENTRAL_DIRECTORY);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralBytes.length);
  writeUint32(end, 16, localBytes.length);
  writeUint16(end, 20, 0);
  return concatBytes([localBytes, centralBytes, end]);
}

function isWordXmlPart(name) {
  const normalized = String(name || "");
  return normalized.startsWith("word/") && normalized.endsWith(".xml");
}

function getWordTextElements(doc) {
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "t");
}

function getChildElementsByLocalName(element, localName) {
  return Array.from(element?.children || [])
    .filter((child) => child.localName === localName);
}

function getWordElementText(element) {
  return getWordTextElements(element)
    .map((textElement) => textElement.textContent || "")
    .join("");
}

function normalizeWordCellText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getWordNamespace(doc) {
  return doc.documentElement?.lookupNamespaceURI("w")
    || "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
}

function setWordTextElementText(doc, textElement, value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!text.includes("\n")) {
    textElement.textContent = text;
    return;
  }
  const run = textElement.parentNode;
  if (!run) {
    textElement.textContent = text;
    return;
  }
  const namespace = getWordNamespace(doc);
  const lines = text.split("\n");
  textElement.textContent = lines[0] || "";
  let anchor = textElement;
  lines.slice(1).forEach((line) => {
    const breakElement = doc.createElementNS(namespace, "w:br");
    const nextTextElement = doc.createElementNS(namespace, "w:t");
    nextTextElement.textContent = line;
    run.insertBefore(breakElement, anchor.nextSibling);
    run.insertBefore(nextTextElement, breakElement.nextSibling);
    anchor = nextTextElement;
  });
}

function setWordCellText(doc, cell, value) {
  const textElements = getWordTextElements(cell);
  const text = String(value ?? "");
  if (textElements.length) {
    textElements.forEach((textElement, index) => {
      setWordTextElementText(doc, textElement, index === 0 ? text : "");
    });
    return;
  }
  const namespace = getWordNamespace(doc);
  const paragraph = getChildElementsByLocalName(cell, "p")[0] || doc.createElementNS(namespace, "w:p");
  const run = getChildElementsByLocalName(paragraph, "r")[0] || doc.createElementNS(namespace, "w:r");
  const textElement = doc.createElementNS(namespace, "w:t");
  textElement.textContent = text;
  if (!run.parentNode) {
    paragraph.append(run);
  }
  run.append(textElement);
  if (!paragraph.parentNode) {
    cell.append(paragraph);
  }
}

function normalizeTableColumnReplacements(tableColumnReplacements) {
  const source = Array.isArray(tableColumnReplacements)
    ? tableColumnReplacements
    : (tableColumnReplacements ? [tableColumnReplacements] : []);
  return source
    .map((replacement) => {
      const item = replacement && typeof replacement === "object" ? replacement : {};
      const header = normalizeWordCellText(item.header);
      if (!header) {
        return null;
      }
      return {
        header,
        values: Array.isArray(item.values) ? item.values.map((value) => String(value ?? "")) : []
      };
    })
    .filter(Boolean);
}

function applyTableColumnReplacements(doc, tableColumnReplacements) {
  const replacements = normalizeTableColumnReplacements(tableColumnReplacements);
  if (!replacements.length) {
    return;
  }
  const tables = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "tbl");
  tables.forEach((table) => {
    const rows = getChildElementsByLocalName(table, "tr");
    const [headerRow, ...bodyRows] = rows;
    if (!headerRow || !bodyRows.length) {
      return;
    }
    const headerCells = getChildElementsByLocalName(headerRow, "tc");
    if (!headerCells.length) {
      return;
    }
    replacements.forEach((replacement) => {
      const columnIndex = headerCells.findIndex(
        (cell) => normalizeWordCellText(getWordElementText(cell)) === replacement.header
      );
      if (columnIndex < 0) {
        return;
      }
      bodyRows.slice(0, replacement.values.length).forEach((row, rowIndex) => {
        const cell = getChildElementsByLocalName(row, "tc")[columnIndex];
        if (cell) {
          setWordCellText(doc, cell, replacement.values[rowIndex]);
        }
      });
    });
  });
}

function replacePlaceholderInTextElements(doc, textElements, placeholder, replacement) {
  const needle = String(placeholder || "");
  if (!needle) {
    return;
  }
  const value = String(replacement ?? "");
  while (true) {
    let combined = "";
    const records = textElements.map((element) => {
      const text = element.textContent || "";
      const start = combined.length;
      combined += text;
      return { element, text, start, end: combined.length };
    });
    const matchStart = combined.indexOf(needle);
    if (matchStart < 0) {
      break;
    }
    const matchEnd = matchStart + needle.length;
    const first = records.find((record) => record.start <= matchStart && record.end > matchStart);
    const last = records.find((record) => record.start < matchEnd && record.end >= matchEnd);
    if (!first || !last) {
      break;
    }
    if (first === last) {
      const localStart = matchStart - first.start;
      const localEnd = matchEnd - first.start;
      setWordTextElementText(
        doc,
        first.element,
        `${first.text.slice(0, localStart)}${value}${first.text.slice(localEnd)}`
      );
      continue;
    }
    setWordTextElementText(doc, first.element, `${first.text.slice(0, matchStart - first.start)}${value}`);
    let inside = false;
    records.forEach((record) => {
      if (record === first) {
        inside = true;
        return;
      }
      if (record === last) {
        inside = false;
        setWordTextElementText(doc, record.element, record.text.slice(matchEnd - record.start));
        return;
      }
      if (inside) {
        setWordTextElementText(doc, record.element, "");
      }
    });
  }
}

function replaceXmlPlaceholders(xml, replacements, options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Ein XML-Teil der DOCX-Datei konnte nicht gelesen werden.");
  }
  Object.entries(replacements || {}).forEach(([placeholder, replacement]) => {
    replacePlaceholderInTextElements(doc, getWordTextElements(doc), placeholder, replacement);
  });
  applyTableColumnReplacements(doc, options.tableColumnReplacements);
  return new XMLSerializer().serializeToString(doc);
}

export function isDocxZipSupported() {
  return typeof DOMParser === "function"
    && typeof XMLSerializer === "function"
    && typeof TextEncoder === "function"
    && typeof TextDecoder === "function"
    && typeof Blob === "function"
    && typeof Response === "function"
    && typeof DecompressionStream === "function";
}

export async function createDocxFromTemplate(templateBytes, replacements = {}, options = {}) {
  const entries = await readZipEntries(templateBytes);
  const nextEntries = entries.map((entry) => {
    if (!isWordXmlPart(entry.name)) {
      return entry;
    }
    const xml = textDecoder.decode(entry.data);
    const replaced = replaceXmlPlaceholders(xml, replacements, options);
    return {
      ...entry,
      data: textEncoder.encode(replaced)
    };
  });
  return buildZip(nextEntries);
}

export function createZipArchive(files = []) {
  return buildZip(files.map((file) => ({
    name: String(file.name || "Datei"),
    data: file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || [])
  })));
}
