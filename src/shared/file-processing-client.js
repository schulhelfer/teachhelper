import { FILE_LIMITS } from "./file-guards.js";

const pending = [];
let activeCount = 0;

function abortError() {
  return new DOMException("Der Vorgang wurde abgebrochen.", "AbortError");
}

function collectTransferables(value, result = new Set()) {
  if (value instanceof ArrayBuffer) result.add(value);
  else if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) result.add(value.buffer);
  else if (Array.isArray(value)) value.forEach((item) => collectTransferables(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectTransferables(item, result));
  return [...result];
}

function runNext() {
  if (activeCount >= FILE_LIMITS.HEAVY_PARSER_MAX_PARALLEL || !pending.length) return;
  const job = pending.shift();
  if (job.signal?.aborted) {
    job.reject(abortError());
    runNext();
    return;
  }
  activeCount += 1;
  const worker = job.workerFactory(new URL("./file-processing-worker.js", import.meta.url), { type: "module" });
  let finished = false;
  let timeout = 0;
  const finish = (error, result) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    job.signal?.removeEventListener("abort", abort);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    activeCount -= 1;
    if (error) job.reject(error);
    else job.resolve(result);
    runNext();
  };
  const abort = () => finish(abortError());
  worker.onmessage = ({ data }) => {
    if (data?.type === "progress") {
      job.onProgress?.(data.value);
      return;
    }
    if (data?.type === "result") finish(null, data.value);
    else finish(new Error(data?.message || "Dateiverarbeitung ist fehlgeschlagen."));
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    finish(new Error("Die lokale Dateiverarbeitung konnte nicht ausgeführt werden."));
  };
  job.signal?.addEventListener("abort", abort, { once: true });
  timeout = setTimeout(() => finish(new Error(job.timeoutMessage || "Die Dateiverarbeitung hat zu lange gedauert.")), job.timeoutMs);
  try {
    const transfer = job.transfer ? collectTransferables(job.payload) : [];
    worker.postMessage({ task: job.task, payload: job.payload }, transfer);
  } catch (error) {
    finish(error);
  }
}

export function runFileProcessingTask(task, payload, options = {}) {
  if (typeof Worker !== "function" && !options.workerFactory) {
    return Promise.reject(new Error("Dieser Browser unterstützt die sichere Dateiverarbeitung im Worker nicht."));
  }
  return new Promise((resolve, reject) => {
    pending.push({
      task,
      payload,
      resolve,
      reject,
      signal: options.signal,
      onProgress: options.onProgress,
      timeoutMs: options.timeoutMs || 60_000,
      timeoutMessage: options.timeoutMessage,
      transfer: options.transfer !== false,
      workerFactory: options.workerFactory || ((url, workerOptions) => new Worker(url, workerOptions)),
    });
    runNext();
  });
}
