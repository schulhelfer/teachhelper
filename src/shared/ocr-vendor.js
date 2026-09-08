export function recognizeLocalNames(image, { signal, onProgress, workerFactory = (url) => new Worker(url) } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Abgebrochen", "AbortError"));
      return;
    }
    const worker = workerFactory(new URL("./ocr-worker.js", import.meta.url));
    let settled = false;
    const finish = (error, text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(text);
    };
    const abort = () => finish(new DOMException("Abgebrochen", "AbortError"));
    const timeout = setTimeout(() => finish(new Error("Die Texterkennung dauert zu lange. Bitte einen kleineren Ausschnitt versuchen.")), 120_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data?.type === "progress") onProgress?.(data);
      else if (data?.type === "result") finish(null, String(data.text || ""));
      else if (data?.type === "error") finish(new Error("Die lokale Texterkennung konnte nicht ausgeführt werden. Bitte erneut versuchen. Offline müssen die OCR-Dateien zuvor vollständig geladen worden sein."));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(new Error("Die lokale Texterkennung konnte nicht geladen werden. Bitte die Anwendung einmal online vollständig laden und erneut versuchen."));
    };
    try {
      worker.postMessage(image, [image]);
    } catch (error) {
      finish(error);
    }
  });
}
