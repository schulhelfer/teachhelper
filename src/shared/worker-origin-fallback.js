const blobUrlCache = new Map();

function supportsBlobWorkerUrls() {
  return typeof Blob === "function" && typeof URL?.createObjectURL === "function";
}

function createModuleShimSource(url) {
  return [
    "const queued = [];",
    "const buffer = (event) => queued.push(event);",
    'self.addEventListener("message", buffer);',
    `import(${JSON.stringify(url.href)}).then(() => {`,
    '  self.removeEventListener("message", buffer);',
    "  for (const event of queued.splice(0)) {",
    '    self.dispatchEvent(new MessageEvent("message", { data: event.data }));',
    "  }",
    "}).catch((error) => {",
    '  self.postMessage({ type: "error", message: String(error?.message || error) });',
    "});",
  ].join("\n");
}

function createBlobWorkerUrl(url, type) {
  const cacheKey = `${type}:${url.href}`;
  const cached = blobUrlCache.get(cacheKey);
  if (cached) return cached;
  const source = type === "module"
    ? createModuleShimSource(url)
    : `self.__teachhelperWorkerBaseUrl = ${JSON.stringify(url.href)};\nimportScripts(${JSON.stringify(url.href)});`;
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  blobUrlCache.set(cacheKey, blobUrl);
  return blobUrl;
}

function isOpaqueOriginContext() {
  try {
    return window.origin === "null" || window.location.origin === "null";
  } catch {
    return false;
  }
}

export function createWorkerWithOriginFallback(url, { type = "classic", workerFactory } = {}) {
  const factory = workerFactory || ((workerUrl, options) => new Worker(workerUrl, options));
  const options = type === "module" ? { type: "module" } : undefined;
  const createBlobWorker = () => factory(createBlobWorkerUrl(url, type), undefined);
  if (!workerFactory && isOpaqueOriginContext() && supportsBlobWorkerUrls()) {
    return createBlobWorker();
  }
  try {
    return factory(url, options);
  } catch (error) {
    if (error?.name !== "SecurityError" || !supportsBlobWorkerUrls()) throw error;
    return createBlobWorker();
  }
}
