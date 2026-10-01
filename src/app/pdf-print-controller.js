import { FILE_LIMITS, FILE_TIMEOUTS, fitCanvasSize, withTimeout } from '../shared/file-guards.js';
import { ensurePdfJsLoaded } from '../shared/pdf-vendor.js';

const PRINT_RESOLUTION = 150;
const PDF_POINTS_PER_INCH = 72;
const PRINT_FAILURE_MESSAGE = 'Drucken konnte nicht gestartet werden. Bitte erneut versuchen oder die PDF über „Speichern“ herunterladen.';

function isMacOS(view) {
  const platform = view.navigator?.userAgentData?.platform || view.navigator?.platform || '';
  return /^mac/i.test(platform) && Number(view.navigator?.maxTouchPoints || 0) <= 1;
}

function validateOutputs(outputs) {
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > FILE_LIMITS.PDF_MAX_PAGES) {
    throw new Error('Ungültiger Druckauftrag.');
  }
  let totalBytes = 0;
  for (const output of outputs) {
    if (!(output?.bytes instanceof ArrayBuffer) || !output.bytes.byteLength) {
      throw new Error('Ungültige PDF-Daten.');
    }
    totalBytes += output.bytes.byteLength;
    if (totalBytes > FILE_LIMITS.PDF_MERGE_TOTAL_BYTES) {
      throw new Error('Die PDFs sind zu groß für den Druck.');
    }
  }
  return outputs;
}

export function createPdfPrintController({
  documentRef: document,
  view: window,
  showMessage,
  loadPdfJs = ensurePdfJsLoaded,
}) {
  let activeJob = null;
  let disposed = false;

  function warn(message = PRINT_FAILURE_MESSAGE) {
    showMessage(message, 'warn', { presentation: 'toast' });
  }

  function release(job) {
    if (!job || job.cancelled) return;
    job.cancelled = true;
    job.renderTask?.cancel();
    job.renderTask = null;
    if (job.loadingTask) {
      Promise.resolve(job.loadingTask.destroy()).catch(() => {});
      job.loadingTask = null;
    }
    if (job.canvas) {
      job.canvas.width = 0;
      job.canvas.height = 0;
      job.canvas = null;
    }
    for (const url of job.urls) window.URL.revokeObjectURL(url);
    job.urls.length = 0;
    job.area.replaceChildren();
    job.area.remove();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== job.sheet);
    job.sheet.replaceSync('');
    job.rules.length = 0;
    document.documentElement.classList.remove('pdf-printing');
    if (activeJob === job) activeJob = null;
  }

  function afterPrint() {
    if (activeJob?.printing) release(activeJob);
  }

  window.addEventListener('afterprint', afterPrint);

  function assertCurrent(job) {
    if (disposed || job.cancelled || activeJob !== job) throw new Error('Druckauftrag abgebrochen.');
  }

  async function renderPage(job, page, pageIndex) {
    const size = page.getViewport({ scale: 1 });
    if (![size.width, size.height].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Ungültiges Seitenformat.');
    }
    const desired = page.getViewport({ scale: PRINT_RESOLUTION / PDF_POINTS_PER_INCH });
    const bounds = fitCanvasSize(desired.width, desired.height);
    const scale = Math.min(bounds.width / size.width, bounds.height / size.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    job.canvas = canvas;
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Die Druckseite konnte nicht vorbereitet werden.');
    job.renderTask = page.render({ canvasContext: context, viewport, intent: 'print', background: 'rgb(255,255,255)' });
    await withTimeout(() => job.renderTask.promise, FILE_TIMEOUTS.PDF_OPERATION_MS);
    job.renderTask = null;
    assertCurrent(job);
    const blob = await withTimeout(() => new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Die Druckseite konnte nicht gespeichert werden.')), 'image/png');
    }), FILE_TIMEOUTS.PDF_OPERATION_MS);
    assertCurrent(job);
    const url = window.URL.createObjectURL(blob);
    job.urls.push(url);
    const image = document.createElement('img');
    image.alt = '';
    image.src = url;
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-print-page';
    wrapper.dataset.pageFormat = String(pageIndex);
    wrapper.append(image);
    job.area.append(wrapper);
    const pageName = `th-pdf-page-${pageIndex}`;
    const dimensions = `${size.width}pt ${size.height}pt`;
    if (pageIndex === 0) job.rules.push(`@page { size: ${dimensions}; margin: 0; }`);
    job.rules.push(`@page ${pageName} { size: ${dimensions}; margin: 0; }`);
    job.rules.push(`.pdf-printing .pdf-print-page[data-page-format="${pageIndex}"] { page: ${pageName}; width: ${size.width}pt; height: ${size.height}pt; }`);
    await withTimeout(() => image.decode(), FILE_TIMEOUTS.PDF_OPERATION_MS);
    assertCurrent(job);
    canvas.width = 0;
    canvas.height = 0;
    job.canvas = null;
    page.cleanup();
  }

  async function print(detail) {
    if (disposed) return false;
    if (activeJob) {
      warn('Ein Druckauftrag ist bereits geöffnet oder wird vorbereitet. Bitte diesen zuerst abschließen.');
      return false;
    }
    let job = null;
    try {
      const outputs = validateOutputs(detail?.outputs);
      if (typeof window.print !== 'function') throw new Error('Drucken wird nicht unterstützt.');
      job = {
        cancelled: false,
        printing: false,
        area: document.createElement('section'),
        sheet: new window.CSSStyleSheet(),
        urls: [],
        rules: [],
        canvas: null,
        loadingTask: null,
        renderTask: null,
      };
      job.area.className = 'pdf-print-area';
      job.area.setAttribute('aria-hidden', 'true');
      activeJob = job;
      document.body.append(job.area);
      const pdfjsLib = await withTimeout(loadPdfJs, FILE_TIMEOUTS.PDF_OPERATION_MS);
      assertCurrent(job);
      let pageCount = 0;
      for (const output of outputs) {
        job.loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(output.bytes), useWasm: false });
        const pdf = await withTimeout(() => job.loadingTask.promise, FILE_TIMEOUTS.PDF_OPERATION_MS);
        assertCurrent(job);
        if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1 || pageCount + pdf.numPages > FILE_LIMITS.PDF_MAX_PAGES) {
          throw new Error('Zu viele oder ungültige Druckseiten.');
        }
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await withTimeout(() => pdf.getPage(pageNumber), FILE_TIMEOUTS.PDF_OPERATION_MS);
          assertCurrent(job);
          await renderPage(job, page, pageCount++);
        }
        await job.loadingTask.destroy();
        job.loadingTask = null;
        assertCurrent(job);
      }
      job.sheet.replaceSync(`@media print { ${job.rules.join('\n')} }`);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, job.sheet];
      document.documentElement.classList.add('pdf-printing');
      if (isMacOS(window)) {
        try {
          window.focus?.();
        } catch {}
      }
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      assertCurrent(job);
      job.printing = true;
      window.print();
      if (!disposed) showMessage('Druckdialog geöffnet.', 'success', { presentation: 'toast' });
      return true;
    } catch (_error) {
      const cancelled = disposed || job?.cancelled;
      release(job);
      if (!cancelled) warn();
      return false;
    }
  }

  return {
    print,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('afterprint', afterPrint);
      release(activeJob);
    },
  };
}
