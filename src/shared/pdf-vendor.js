const PDF_LIB_URL = new URL("../vendor/pdf-lib/1.17.1/pdf-lib.min.js", import.meta.url);
const PDF_JS_URL = new URL("../vendor/pdfjs-dist/6.1.200/build/pdf.mjs", import.meta.url);
const PDF_JS_WORKER_URL = new URL("../vendor/pdfjs-dist/6.1.200/build/pdf.worker.mjs", import.meta.url);

let pdfLibLoadPromise = null;
let pdfJsLoadPromise = null;

function hasPdfLibLoaded() {
  return Boolean(
    typeof window !== "undefined"
    && window.PDFLib
    && window.PDFLib.PDFDocument
  );
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || !document.head) {
      reject(new Error("PDF-Library kann in dieser Umgebung nicht geladen werden."));
      return;
    }

    const script = document.createElement("script");
    script.src = url.href;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`PDF-Library konnte nicht geladen werden: ${url.pathname}`));
    };
    document.head.append(script);
  });
}

export async function ensurePdfLibLoaded() {
  if (hasPdfLibLoaded()) return window.PDFLib;
  if (!pdfLibLoadPromise) {
    pdfLibLoadPromise = loadScript(PDF_LIB_URL)
      .then(() => {
        if (!hasPdfLibLoaded()) {
          throw new Error("PDF-Library wurde geladen, ist aber unvollständig.");
        }
        return window.PDFLib;
      })
      .catch((error) => {
        pdfLibLoadPromise = null;
        throw error;
      });
  }
  return pdfLibLoadPromise;
}

export async function ensurePdfJsLoaded() {
  if (!pdfJsLoadPromise) {
    pdfJsLoadPromise = import(PDF_JS_URL.href)
      .then((pdfjsLib) => {
        if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
          throw new Error("PDF-Vorschau-Library wurde geladen, ist aber unvollständig.");
        }
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL.href;
        }
        return pdfjsLib;
      })
      .catch((error) => {
        pdfJsLoadPromise = null;
        throw error;
      });
  }
  return pdfJsLoadPromise;
}
