const blobUrlCache = new Map();

function supportsBlobWorkerUrls() {
  return typeof Blob === "function" && typeof URL?.createObjectURL === "function";
}

function createBlobWorkerUrl(url, type) {
  const cacheKey = `${type}:${url.href}`;
  const cached = blobUrlCache.get(cacheKey);
  if (cached) return cached;
  const source = type === "module"
    ? `await import(${JSON.stringify(url.href)});`
    : `self.__teachhelperWorkerBaseUrl = ${JSON.stringify(url.href)};\nimportScripts(${JSON.stringify(url.href)});`;
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  blobUrlCache.set(cacheKey, blobUrl);
  return blobUrl;
}

export function createWorkerWithOriginFallback(url, { type = "classic", workerFactory } = {}) {
  const factory = workerFactory || ((workerUrl, options) => new Worker(workerUrl, options));
  const options = type === "module" ? { type: "module" } : undefined;
  try {
    return factory(url, options);
  } catch (error) {
    if (error?.name !== "SecurityError" || !supportsBlobWorkerUrls()) throw error;
    return factory(createBlobWorkerUrl(url, type), options);
  }
}
