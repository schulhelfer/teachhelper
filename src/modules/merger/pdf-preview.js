import { fitCanvasSize } from '../../shared/file-guards.js';

export const PDF_PREVIEW_PREFERRED_SCALE = 0.28;
export const PDF_PREVIEW_MAX_EDGE = 256;
export const PDF_PREVIEW_MAX_PIXELS = 65_536;
export const PDF_PREVIEW_MAX_TOTAL_PIXELS = 20_000_000;

export function getPdfPreviewPagePixelBudget(pageCount) {
  const count = Number(pageCount);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Die PDF enthält keine gültige Seitenanzahl.');
  }
  return Math.max(1, Math.min(
    PDF_PREVIEW_MAX_PIXELS,
    Math.floor(PDF_PREVIEW_MAX_TOTAL_PIXELS / count),
  ));
}

function readValidViewportDimensions(viewport) {
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Die PDF-Seite hat ungültige Abmessungen.');
  }
  return { width, height };
}

export function createPdfPreviewRenderSpec(page, pageCount) {
  if (!page || typeof page.getViewport !== 'function') {
    throw new Error('Die PDF-Seite konnte nicht gelesen werden.');
  }

  const preferredViewport = page.getViewport({ scale: PDF_PREVIEW_PREFERRED_SCALE });
  const preferredSize = readValidViewportDimensions(preferredViewport);
  const requestedWidth = Math.max(1, Math.round(preferredSize.width));
  const requestedHeight = Math.max(1, Math.round(preferredSize.height));
  const canvasSize = fitCanvasSize(
    requestedWidth,
    requestedHeight,
    getPdfPreviewPagePixelBudget(pageCount),
    PDF_PREVIEW_MAX_EDGE,
  );

  if (canvasSize.width === requestedWidth && canvasSize.height === requestedHeight) {
    return { viewport: preferredViewport, ...canvasSize };
  }

  const scaleRatio = Math.min(
    canvasSize.width / preferredSize.width,
    canvasSize.height / preferredSize.height,
  );
  const scale = PDF_PREVIEW_PREFERRED_SCALE * scaleRatio;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('Die PDF-Seite hat ungültige Abmessungen.');
  }

  const viewport = page.getViewport({ scale });
  const boundedSize = readValidViewportDimensions(viewport);
  if (boundedSize.width > canvasSize.width + 0.01 || boundedSize.height > canvasSize.height + 0.01) {
    throw new Error('Die PDF-Vorschau konnte nicht sicher skaliert werden.');
  }
  return { viewport, ...canvasSize };
}

export function createCanvasPngObjectUrl(canvas, urlApi = URL) {
  if (!canvas || typeof canvas.toBlob !== 'function') {
    return Promise.reject(new Error('Die PDF-Vorschau konnte nicht gespeichert werden.'));
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Die PDF-Vorschau konnte nicht gespeichert werden.'));
          return;
        }
        try {
          resolve(urlApi.createObjectURL(blob));
        } catch (error) {
          reject(error);
        }
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

export function revokePdfPreviewUrls(urls, urlApi = URL) {
  const uniqueUrls = new Set(Array.isArray(urls) ? urls.filter(Boolean) : []);
  uniqueUrls.forEach((url) => {
    try {
      urlApi.revokeObjectURL(url);
    } catch (_error) {
    }
  });
}

export function replacePdfPreviewUrls(state, urls, urlApi = URL) {
  const nextUrls = Array.isArray(urls) ? urls : [];
  const previousUrls = Array.isArray(state?.previewUrls) ? state.previewUrls : [];
  if (state) state.previewUrls = nextUrls;
  revokePdfPreviewUrls(previousUrls.filter((url) => !nextUrls.includes(url)), urlApi);
  return nextUrls;
}
