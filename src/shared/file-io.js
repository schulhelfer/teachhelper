export function sanitizeExportFileName(name) {
  const raw = typeof name === 'string' ? name : '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[\\/:*?"<>|]/g, '-');
}

export function ensureFileExtension(name, extension, fallbackName = 'download') {
  const normalizedName = (typeof name === 'string' ? name : '').trim()
    || (typeof fallbackName === 'string' ? fallbackName : '').trim()
    || 'download';
  const rawExtension = (typeof extension === 'string' ? extension : '').trim();
  if (!rawExtension) return normalizedName;
  const normalizedExtension = rawExtension.startsWith('.') ? rawExtension : `.${rawExtension}`;
  return normalizedName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
    ? normalizedName
    : `${normalizedName}${normalizedExtension}`;
}

export function stripFileExtension(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return raw;
  return raw.slice(0, idx);
}

export function dataTransferHasFiles(dataTransfer) {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  const types = dataTransfer.types;
  if (!types) return false;
  if (typeof types.includes === 'function') return types.includes('Files');
  if (typeof types.contains === 'function') return types.contains('Files');
  return Array.from(types).includes('Files');
}

export function isCsvFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.csv')
    || type.includes('text/csv')
    || type.includes('application/csv')
    || type.includes('application/vnd.ms-excel');
}

export function isJsonFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.json')
    || type.includes('application/json')
    || type.includes('text/json');
}

export function triggerBlobDownload(blob, filename, options = {}) {
  const {
    defaultName = 'download',
    cleanupDelay = 1200,
    onErrorMessage = null,
  } = options;
  const finalName = (typeof filename === 'string' ? filename : '').trim() || defaultName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalName;
  link.rel = 'noopener';
  link.style.display = 'none';
  const parent = document.body || document.documentElement;
  if (parent) {
    parent.appendChild(link);
  }
  try {
    if (typeof link.click === 'function') {
      link.click();
    } else {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      link.dispatchEvent(event);
    }
  } catch (err) {
    if (onErrorMessage) {
      console.warn(onErrorMessage, err);
    } else {
      console.warn('Download konnte nicht gestartet werden:', err);
    }
  }
  const cleanup = () => {
    if (link.parentNode) {
      link.remove();
    }
    URL.revokeObjectURL(url);
  };
  setTimeout(cleanup, cleanupDelay);
}
