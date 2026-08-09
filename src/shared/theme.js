export const THEME_PREFERENCE_STORAGE_KEY = 'teachhelper:theme-preference';
export const THEME_PREFERENCE_CHANGE_EVENT = 'classroom:theme-preference-change';
export const THEME_APPLY_EVENT = 'classroom:theme-apply';

export const THEME_PREFERENCES = Object.freeze(['dark', 'light', 'system']);

export function normalizeThemePreference(value, fallback = 'dark') {
  return THEME_PREFERENCES.includes(value) ? value : fallback;
}

export function resolveTheme(preference, systemPrefersDark = false) {
  const normalized = normalizeThemePreference(preference);
  return normalized === 'system' ? (systemPrefersDark ? 'dark' : 'light') : normalized;
}

function resolveStorage(storage = null, owner = globalThis) {
  if (storage) return storage;
  try {
    return owner?.localStorage || null;
  } catch {
    return null;
  }
}

export function readThemePreference(storage = null) {
  try {
    return normalizeThemePreference(resolveStorage(storage)?.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

export function writeThemePreference(preference, storage = null) {
  const normalized = normalizeThemePreference(preference);
  try {
    resolveStorage(storage)?.setItem(THEME_PREFERENCE_STORAGE_KEY, normalized);
  } catch {
    // A private or restricted browser context still receives the live theme.
  }
  return normalized;
}

export function applyDocumentTheme(theme, documentRef = globalThis?.document) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  const root = documentRef?.documentElement;
  if (!root) return resolved;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = documentRef.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f4f7fb' : '#0f172a';
  return resolved;
}

export function createThemeController({ windowRef = globalThis?.window, documentRef = globalThis?.document } = {}) {
  const mediaQuery = windowRef?.matchMedia?.('(prefers-color-scheme: dark)') || null;
  const storage = resolveStorage(null, windowRef);
  const listeners = new Set();
  let preference = readThemePreference(storage);
  let resolved = resolveTheme(preference, Boolean(mediaQuery?.matches));

  const notify = () => {
    applyDocumentTheme(resolved, documentRef);
    const detail = { preference, theme: resolved };
    listeners.forEach((listener) => listener(detail));
    windowRef?.dispatchEvent?.(new CustomEvent(THEME_APPLY_EVENT, { detail }));
  };

  const onSystemChange = () => {
    if (preference !== 'system') return;
    resolved = resolveTheme(preference, Boolean(mediaQuery?.matches));
    notify();
  };

  if (mediaQuery?.addEventListener) mediaQuery.addEventListener('change', onSystemChange);
  else mediaQuery?.addListener?.(onSystemChange);
  notify();

  return {
    getPreference: () => preference,
    getTheme: () => resolved,
    setPreference(nextPreference) {
      preference = writeThemePreference(nextPreference, storage);
      resolved = resolveTheme(preference, Boolean(mediaQuery?.matches));
      notify();
      return { preference, theme: resolved };
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener({ preference, theme: resolved });
      return () => listeners.delete(listener);
    },
    dispose() {
      if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', onSystemChange);
      else mediaQuery?.removeListener?.(onSystemChange);
      listeners.clear();
    },
  };
}
