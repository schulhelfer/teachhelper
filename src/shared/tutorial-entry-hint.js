import { installAppTooltips } from './app-tooltips.js';

const STORAGE_KEY = 'teachhelper:module-sidebar-tutorial-started-tabs:v1';
const DELAY_MS = 420;

export function installTutorialEntryHint(button, moduleKey, moduleName, root = document) {
  if (!button || !moduleKey) return;
  const tooltips = installAppTooltips(root);
  const label = `Tutorial für das Modul ${moduleName}`;
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
  let seen = new Set();
  try {
    const stored = JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || '[]');
    seen = new Set(Array.isArray(stored) ? stored : []);
  } catch {  }
  if (seen.has(moduleKey)) return;
  button.classList.add('tutorial-attention-pulse');
  let attempts = 0;
  let timer = 0;
  const showWhenVisible = () => {
    const rect = button.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && attempts < 20) {
      attempts += 1;
      timer = window.setTimeout(showWhenVisible, 100);
      return;
    }
    if (rect.width <= 0 || rect.height <= 0) return;
    tooltips?.show?.(button, { persistUntilInteraction: true });
  };
  timer = window.setTimeout(showWhenVisible, DELAY_MS);
  button.addEventListener('click', () => {
    window.clearTimeout(timer);
    seen.add(moduleKey);
    try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...seen])); } catch {  }
    button.classList.remove('tutorial-attention-pulse');
    tooltips?.hide?.();
  }, { once: true });
}
