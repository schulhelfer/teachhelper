export const BYTES_PER_MIB = 1024 * 1024;

export const FILE_LIMITS = Object.freeze({
  PDF_BYTES: 100 * BYTES_PER_MIB,
  PDF_MERGE_TOTAL_BYTES: 300 * BYTES_PER_MIB,
  ZIP_BYTES: 250 * BYTES_PER_MIB,
  DOCX_TEMPLATE_BYTES: 50 * BYTES_PER_MIB,
  ZIP_ENTRY_BYTES: 100 * BYTES_PER_MIB,
  ZIP_TOTAL_UNCOMPRESSED_BYTES: 750 * BYTES_PER_MIB,
  ZIP_MAX_ENTRIES: 2000,
});

export const FILE_TIMEOUTS = Object.freeze({
  READ_MS: 15_000,
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
