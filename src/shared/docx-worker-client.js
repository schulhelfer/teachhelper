import { FILE_TIMEOUTS } from "./file-guards.js";
import { runFileProcessingTask } from "./file-processing-client.js";

function copyBytes(value) {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  return source.slice();
}

export async function prepareDocxTemplateInWorker(template, options = {}) {
  const result = await runFileProcessingTask("docx-prepare", { template: copyBytes(template) }, {
    signal: options.signal,
    timeoutMs: options.timeoutMs || FILE_TIMEOUTS.ZIP_LOAD_MS,
    timeoutMessage: "Die DOCX-ZIP-Dekompression hat zu lange gedauert.",
  });
  return result.prepared;
}
