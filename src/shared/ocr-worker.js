const vendorUrl = (path) => new URL(`../vendor/${path}`, self.location.href).href;
self.onmessage = async ({ data }) => {
  self.onmessage = null;
  let worker;
  try {
    importScripts(vendorUrl("tesseract.js/7.0.0/tesseract.min.js"));
    worker = await self.Tesseract.createWorker("deu", 1, {
      workerPath: vendorUrl("tesseract.js/7.0.0/worker.min.js"),
      corePath: vendorUrl("tesseract.js-core/7.0.0"),
      langPath: vendorUrl("tesseract.js-data-deu/1.0.0"),
      workerBlobURL: false,
      cacheMethod: "none",
      gzip: true,
      logger: ({ status, progress }) => self.postMessage({ type: "progress", status, progress }),
      errorHandler: () => self.postMessage({ type: "error" }),
    });
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const result = await worker.recognize(new Uint8Array(data));
    self.postMessage({ type: "result", text: result.data.text });
  } catch (_error) {
    self.postMessage({ type: "error" });
  } finally {
    await worker?.terminate();
    self.close();
  }
};
