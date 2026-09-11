import {
  assertFileSizeAtMost,
  FILE_LIMITS,
} from '../shared/file-guards.js';
import {
  ensureFileExtension,
  triggerBlobDownload,
} from '../shared/file-io.js';
import {
  deserializePlan,
  serializePlan,
} from './plan-format.js';

export async function loadPlan(file) {
  if (!file) return null;
  assertFileSizeAtMost(file, FILE_LIMITS.JSON_BYTES, 'JSON-Datei');
  const text = await file.text();
  return deserializePlan(text);
}

export async function savePlan(plan, options = {}) {
  const {
    filename,
    fallbackName = 'Gruppen',
    directoryHandle = null,
    pickerDescription = 'Gruppen JSON',
    cleanupDelay = 1200,
  } = options;
  const finalName = ensureFileExtension(filename, '.json', fallbackName);
  const blob = new Blob([serializePlan(plan)], { type: 'application/json' });
  const view = typeof window !== 'undefined' ? window : null;
  const canUsePicker = typeof view?.showSaveFilePicker === 'function';
  if (canUsePicker) {
    try {
      const handle = await view.showSaveFilePicker({
        suggestedName: finalName,
        startIn: directoryHandle || 'downloads',
        types: [{
          description: pickerDescription,
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: 'saved', handle };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { status: 'aborted', handle: null };
      }
      console.warn('Fallback auf Download, Speichern via Picker fehlgeschlagen:', error);
    }
  }
  triggerBlobDownload(blob, finalName, { cleanupDelay });
  return { status: 'downloaded', handle: null };
}

export async function pickPlanFile(options = {}) {
  const { directoryHandle = null } = options;
  const view = typeof window !== 'undefined' ? window : null;
  const canPick = typeof view?.showOpenFilePicker === 'function';
  if (!canPick) return { supported: false };
  try {
    const [handle] = await view.showOpenFilePicker({
      multiple: false,
      startIn: directoryHandle || 'downloads',
      types: [{
        description: 'Gruppen JSON',
        accept: { 'application/json': ['.json'] },
      }],
      excludeAcceptAllOption: true,
    });
    if (!handle) return { supported: true, aborted: true };
    const file = await handle.getFile();
    if (!file) return { supported: true, aborted: true };
    return { supported: true, file, handle };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { supported: true, aborted: true };
    }
    console.warn('showOpenFilePicker fehlgeschlagen, fallback auf klassische Datei-Auswahl', error);
    return { supported: true, aborted: true };
  }
}
