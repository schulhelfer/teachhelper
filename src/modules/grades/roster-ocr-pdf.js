import { ensurePdfJsLoaded } from "../../shared/pdf-vendor.js";
import { validatePdfFile, readFileArrayBufferWithTimeout, withTimeout, FILE_TIMEOUTS } from "../../shared/file-guards.js";
import { ocrOutputSize } from "./roster-ocr-data.js";

// One local PDF document and one rasterized page, owned by the import dialog.
export function createOcrPdfSession({ createCanvas, loadPdfJs = ensurePdfJsLoaded }) {
  let loadingTask = null;
  let document = null;
  let renderTask = null;
  let pageCanvas = null;
  let disposed = false;
  let renderGeneration = 0;

  const clearPage = () => {
    renderGeneration += 1;
    renderTask?.cancel();
    renderTask = null;
    if (pageCanvas) pageCanvas.width = pageCanvas.height = 0;
    pageCanvas = null;
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    clearPage();
    // The loading task also owns the PDF worker and the loaded document.
    void loadingTask?.destroy().catch(() => {});
    loadingTask = null;
    document = null;
  };
  const checkActive = (signal) => {
    if (disposed || signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
  };

  return {
    destroy,
    async load(file, { signal } = {}) {
      try {
        await validatePdfFile(file, { signal });
        const bytes = await readFileArrayBufferWithTimeout(file, { signal });
        const pdfjs = await withTimeout(loadPdfJs(), FILE_TIMEOUTS.PDF_PROBE_MS, "PDF-Vorschau konnte nicht geladen werden. Offline müssen die PDF-Dateien der Anwendung zuvor geladen worden sein.", { signal });
        checkActive(signal);
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWasm: false });
        const loaded = await withTimeout(loadingTask.promise, FILE_TIMEOUTS.PDF_PROBE_MS, "Die PDF-Datei konnte nicht rechtzeitig geöffnet werden.", { signal });
        checkActive(signal);
        document = loaded;
        return document.numPages;
      } catch (error) {
        destroy();
        if (error?.name === "PasswordException") throw new Error("Diese PDF ist passwortgeschützt. Bitte eine entsperrte Kopie auswählen.");
        throw error;
      }
    },
    async render(pageNumber, { signal } = {}) {
      checkActive(signal);
      if (!document || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
        throw new Error("Bitte eine gültige PDF-Seite auswählen.");
      }
      clearPage();
      const token = renderGeneration;
      let page;
      let task;
      let output;
      const checkPageActive = () => {
        checkActive(signal);
        if (token !== renderGeneration) throw new DOMException("Abgebrochen", "AbortError");
      };
      const abort = () => task?.cancel();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        page = await withTimeout(document.getPage(pageNumber), FILE_TIMEOUTS.PDF_PROBE_MS, "Die PDF-Seite konnte nicht geladen werden.", { signal });
        checkPageActive();
        const base = page.getViewport({ scale: 1 });
        const size = ocrOutputSize(base.width * 3, base.height * 3);
        const viewport = page.getViewport({ scale: Math.min(size.width / base.width, size.height / base.height) });
        output = createCanvas();
        pageCanvas = output;
        output.width = Math.max(1, Math.floor(viewport.width));
        output.height = Math.max(1, Math.floor(viewport.height));
        task = page.render({ canvasContext: output.getContext("2d"), viewport, background: "rgb(255,255,255)" });
        renderTask = task;
        await withTimeout(task.promise, FILE_TIMEOUTS.PDF_OPERATION_MS, "Die PDF-Seite konnte nicht rechtzeitig dargestellt werden.", { signal });
        checkPageActive();
        renderTask = null;
        return output;
      } catch (error) {
        task?.cancel();
        if (output) output.width = output.height = 0;
        if (pageCanvas === output) pageCanvas = null;
        if (renderTask === task) renderTask = null;
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
        page?.cleanup();
      }
    },
  };
}
