export const BYTES_PER_MIB = 1024 * 1024;

export const FILE_LIMITS = Object.freeze({
  CSV_BYTES: 5 * BYTES_PER_MIB,
  CSV_MAX_ROWS: 1000,
  CSV_MAX_COLUMNS: 64,
  CSV_MAX_CELL_CHARS: 4096,
  JSON_BYTES: 5 * BYTES_PER_MIB,
  JSON_MAX_NESTING: 64,
  JSON_MAX_CONTAINER_ITEMS: 10000,
  IMAGE_BYTES: 25 * BYTES_PER_MIB,
  IMAGE_MAX_PIXELS: 48 * 1024 * 1024,
  CANVAS_MAX_PIXELS: 4_000_000,
  CANVAS_MAX_EDGE: 4096,
  LATEX_BYTES: 5 * BYTES_PER_MIB,
  PDF_BYTES: 100 * BYTES_PER_MIB,
  PDF_MERGE_TOTAL_BYTES: 150 * BYTES_PER_MIB,
  PDF_RESULT_OPEN_BYTES: 150 * BYTES_PER_MIB,
  PDF_FALLBACK_PARSE_BYTES: 10 * BYTES_PER_MIB,
  PDF_MAX_PAGES: 500,
  HEAVY_PARSER_MAX_PARALLEL: 1,
  ZIP_BYTES: 250 * BYTES_PER_MIB,
  THDB_BYTES: 250 * BYTES_PER_MIB,
  DOCX_TEMPLATE_BYTES: 15 * BYTES_PER_MIB,
  DOCX_ENTRY_BYTES: 25 * BYTES_PER_MIB,
  DOCX_TOTAL_UNCOMPRESSED_BYTES: 100 * BYTES_PER_MIB,
  DOCX_MAX_ENTRIES: 256,
  ZIP_ENTRY_BYTES: 25 * BYTES_PER_MIB,
  ZIP_TOTAL_UNCOMPRESSED_BYTES: 300 * BYTES_PER_MIB,
  ZIP_MAX_ENTRIES: 2000,
  ZIP_MAX_COMPRESSION_RATIO: 200,
  ZIP_RATIO_CHECK_MIN_BYTES: BYTES_PER_MIB,
});

export const FILE_TIMEOUTS = Object.freeze({
  READ_MS: 15_000,
  QR_DECODE_MS: 8_000,
  PDF_PROBE_MS: 25_000,
  PDF_OPERATION_MS: 60_000,
  ZIP_LOAD_MS: 45_000,
  ZIP_ANALYSIS_MS: 90_000,
});

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_SIGNATURES = new Set(["504b0304", "504b0506", "504b0708"]);

export function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function createFileValidationError(message) {
  const error = new Error(message);
  error.name = "FileValidationError";
  return error;
}

export function withTimeout(task, timeoutMs, message = "Der Vorgang hat zu lange gedauert.", options = {}) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
  const signal = options.signal || null;
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  if (!ms) {
    return typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task);
  }

  let timeoutId = 0;
  let abortHandler = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    if (signal) {
      abortHandler = () => reject(createAbortError());
      signal.addEventListener("abort", abortHandler, { once: true });
    }
  });

  return Promise.race([
    typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task),
    timeoutPromise,
  ]).finally(() => {
    clearTimeout(timeoutId);
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  });
}

export async function readFileArrayBufferWithTimeout(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw createFileValidationError("Datei konnte nicht gelesen werden.");
  }
  return withTimeout(
    () => file.arrayBuffer(),
    options.timeoutMs ?? FILE_TIMEOUTS.READ_MS,
    options.timeoutMessage || "Datei konnte nicht rechtzeitig gelesen werden.",
    { signal: options.signal }
  );
}

export async function readFileHeader(file, byteLength = 8, options = {}) {
  if (!file || typeof file.slice !== "function") {
    throw createFileValidationError("Datei konnte nicht gelesen werden.");
  }
  const size = Math.max(0, Math.min(Number(file.size) || 0, byteLength));
  const buffer = await withTimeout(
    () => file.slice(0, size).arrayBuffer(),
    options.timeoutMs ?? FILE_TIMEOUTS.READ_MS,
    options.timeoutMessage || "Dateikopf konnte nicht rechtzeitig gelesen werden.",
    { signal: options.signal }
  );
  return new Uint8Array(buffer);
}

export function assertImageDimensionsAtMost(dimensions, label = "Bild") {
  const width = Math.floor(Number(dimensions?.width) || 0);
  const height = Math.floor(Number(dimensions?.height) || 0);
  if (width < 1 || height < 1) {
    throw createFileValidationError(`${label} konnte nicht gelesen werden.`);
  }
  if (width > FILE_LIMITS.CANVAS_MAX_EDGE * 16 || height > FILE_LIMITS.CANVAS_MAX_EDGE * 16 || width * height > FILE_LIMITS.IMAGE_MAX_PIXELS) {
    throw createFileValidationError(`${label} hat zu viele Bildpunkte. Maximal erlaubt: ${Math.round(FILE_LIMITS.IMAGE_MAX_PIXELS / 1_000_000)} Megapixel.`);
  }
  return { width, height };
}

export function fitCanvasSize(width, height, maxPixels = FILE_LIMITS.CANVAS_MAX_PIXELS, maxEdge = FILE_LIMITS.CANVAS_MAX_EDGE) {
  const sourceWidth = Number(width) || 0;
  const sourceHeight = Number(height) || 0;
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw createFileValidationError("Bildgröße ist ungültig.");
  }
  const scale = Math.min(1, maxEdge / sourceWidth, maxEdge / sourceHeight, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

function hasImageSignature(data, signature, offset = 0) {
  return data.length >= offset + signature.length && signature.every((value, index) => data[offset + index] === value);
}

function detectRasterImageType(data) {
  if (hasImageSignature(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (hasImageSignature(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasImageSignature(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";
  if (hasImageSignature(data, [0x42, 0x4d])) return "image/bmp";
  if (hasImageSignature(data, [0x52, 0x49, 0x46, 0x46]) && hasImageSignature(data, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (hasImageSignature(data, [0xff, 0xd8])) return "image/jpeg";
  return "";
}

function isJpegStartOfFrameMarker(marker) {
  return (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function isJpegStandaloneMarker(marker) {
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7);
}

function readJpegDimensions(data, view) {
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) return null;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;
    const marker = data[offset];
    offset += 1;
    if (marker === 0x00) return null;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (isJpegStandaloneMarker(marker)) continue;
    if (offset + 2 > data.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > data.length) return null;
    if (isJpegStartOfFrameMarker(marker)) {
      if (length < 8) return null;
      const componentCount = data[offset + 7];
      if (componentCount < 1 || length < 8 + 3 * componentCount) return null;
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
  return null;
}

export function readImageDimensions(bytes, mimeType = "") {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const declaredType = String(mimeType || "").toLowerCase();
  const type = detectRasterImageType(data) || (declaredType === "image/svg+xml" ? declaredType : "");
  if (type === "image/png" && data.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/gif" && data.length >= 10) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (type === "image/bmp" && data.length >= 26) {
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  }
  if (type === "image/webp" && data.length >= 30) {
    const chunk = String.fromCharCode(...data.slice(12, 16));
    if (chunk === "VP8X") return { width: 1 + data[24] + (data[25] << 8) + (data[26] << 16), height: 1 + data[27] + (data[28] << 8) + (data[29] << 16) };
    if (chunk === "VP8L" && data.length >= 25) {
      const value = view.getUint32(21, true);
      return { width: 1 + (value & 0x3fff), height: 1 + ((value >>> 14) & 0x3fff) };
    }
    if (chunk === "VP8 " && data.length >= 30) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (type === "image/jpeg") return readJpegDimensions(data, view);
  if (type === "image/svg+xml") {
    const text = new TextDecoder().decode(data.slice(0, 64 * 1024));
    const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    const width = text.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
    const height = text.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
    if (width && height) return { width: Number(width[1]), height: Number(height[1]) };
  }
  return null;
}

export async function assertImageFilePixelsAtMost(file, options = {}) {
  const bytes = await readFileHeader(file, Math.min(Number(file?.size) || 0, 512 * 1024), options);
  const label = options.label || "Bild";
  const mimeType = options.mimeType || file?.type;
  const detectedType = detectRasterImageType(bytes);
  let dimensions = readImageDimensions(bytes, mimeType);
  if (!dimensions && detectedType === "image/jpeg" && Number(file?.size) > bytes.length) {
    assertFileSizeAtMost(file, FILE_LIMITS.IMAGE_BYTES, label);
    const fullBytes = await readFileHeader(file, Number(file.size), options);
    dimensions = readImageDimensions(fullBytes, mimeType);
  }
  return assertImageDimensionsAtMost(dimensions, label);
}

export function exceedsZipCompressionRatio(compressedSize, uncompressedSize) {
  if (compressedSize == null || uncompressedSize == null) {
    return false;
  }
  const compressed = Number(compressedSize);
  const uncompressed = Number(uncompressedSize);
  if (!Number.isFinite(compressed) || !Number.isFinite(uncompressed)) {
    return false;
  }
  if (uncompressed <= FILE_LIMITS.ZIP_RATIO_CHECK_MIN_BYTES) {
    return false;
  }
  if (compressed <= 0) {
    return true;
  }
  return uncompressed / compressed > FILE_LIMITS.ZIP_MAX_COMPRESSION_RATIO;
}

export function assertFileSizeAtMost(file, limitBytes, label) {
  const size = Number(file?.size);
  if (Number.isFinite(size) && size > limitBytes) {
    throw createFileValidationError(
      `${label} ist zu groß: max. ${formatFileSize(limitBytes)}.`
    );
  }
}

export function assertTotalSizeAtMost(files, limitBytes, label) {
  const total = Array.from(files || []).reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
  if (total > limitBytes) {
    throw createFileValidationError(
      `${label} ist zu groß: max. ${formatFileSize(limitBytes)} gesamt.`
    );
  }
}

export function assertJsonNestingAtMost(text, maxNesting = FILE_LIMITS.JSON_MAX_NESTING, label = "JSON-Datei") {
  const source = String(text ?? "");
  const limit = Math.max(1, Number(maxNesting) || FILE_LIMITS.JSON_MAX_NESTING);
  const maxContainerItems = FILE_LIMITS.JSON_MAX_CONTAINER_ITEMS;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const containers = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
      if (depth > limit) {
        throw createFileValidationError(`${label} ist zu tief verschachtelt: maximal ${limit} Ebenen.`);
      }
      containers.push({ commas: 0 });
    } else if (char === ",") {
      const container = containers[containers.length - 1];
      if (container) {
        container.commas += 1;
        if (container.commas >= maxContainerItems) {
          throw createFileValidationError(`${label} enthält zu viele Einträge in einem Objekt oder einer Liste: maximal ${maxContainerItems}.`);
        }
      }
    } else if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      containers.pop();
    }
  }
}

export async function validatePdfFile(file, options = {}) {
  if (!file) {
    throw createFileValidationError("Bitte eine PDF-Datei auswählen.");
  }
  assertFileSizeAtMost(file, options.maxBytes ?? FILE_LIMITS.PDF_BYTES, "PDF");
  const name = String(file.name || "");
  const type = String(file.type || "").trim().toLowerCase();
  const hasPdfName = /\.pdf$/i.test(name);
  const hasAllowedType = !type || type === "application/pdf" || type === "application/x-pdf" || type === "application/octet-stream";
  if (!hasPdfName || !hasAllowedType) {
    throw createFileValidationError("Bitte eine gültige PDF-Datei auswählen.");
  }
  const header = await readFileHeader(file, PDF_SIGNATURE.length, {
    timeoutMs: options.timeoutMs ?? FILE_TIMEOUTS.READ_MS,
    signal: options.signal,
  });
  if (!bytesStartWith(header, PDF_SIGNATURE)) {
    throw createFileValidationError("Die Datei ist keine gültige PDF-Datei.");
  }
  return file;
}

export async function validateZipFile(file, options = {}) {
  if (!file) {
    throw createFileValidationError("Bitte eine ZIP-Datei auswählen.");
  }
  assertFileSizeAtMost(file, options.maxBytes ?? FILE_LIMITS.ZIP_BYTES, "ZIP");
  const name = String(file.name || "");
  const type = String(file.type || "").trim().toLowerCase();
  const hasZipName = /\.zip$/i.test(name);
  const hasAllowedType = !type
    || type === "application/zip"
    || type === "application/x-zip-compressed"
    || type === "application/octet-stream";
  if (!hasZipName || !hasAllowedType) {
    throw createFileValidationError("Bitte eine gültige ZIP-Datei auswählen.");
  }
  await assertZipSignature(file, options);
  return file;
}

export async function validateDocxTemplateFile(file, options = {}) {
  if (!file) {
    throw createFileValidationError("Bitte eine DOCX-Datei auswählen.");
  }
  assertFileSizeAtMost(file, options.maxBytes ?? FILE_LIMITS.DOCX_TEMPLATE_BYTES, "DOCX-Vorlage");
  const name = String(file.name || "");
  const type = String(file.type || "").trim().toLowerCase();
  const hasDocxName = /\.docx$/i.test(name);
  const hasAllowedType = !type
    || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || type === "application/zip"
    || type === "application/octet-stream";
  if (!hasDocxName || !hasAllowedType) {
    throw createFileValidationError("Bitte eine gültige DOCX-Datei auswählen.");
  }
  await assertZipSignature(file, options);
  return file;
}

export async function assertZipSignature(file, options = {}) {
  const header = await readFileHeader(file, 4, {
    timeoutMs: options.timeoutMs ?? FILE_TIMEOUTS.READ_MS,
    signal: options.signal,
  });
  const hex = Array.from(header).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!ZIP_SIGNATURES.has(hex)) {
    throw createFileValidationError("Die Datei ist kein gültiger ZIP-Container.");
  }
}

function bytesStartWith(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function createAbortError() {
  try {
    return new DOMException("Der Vorgang wurde abgebrochen.", "AbortError");
  } catch (_error) {
    const error = new Error("Der Vorgang wurde abgebrochen.");
    error.name = "AbortError";
    return error;
  }
}
