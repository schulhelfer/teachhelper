import { installAppTooltips } from './app-tooltips.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
} from './tutorial-entry-state.js';

const DELAY_MS = 420;

export function installTutorialEntryHint(button, moduleKey, moduleName, root = document) {
  if (!button || !moduleKey) return;
  const tooltips = installAppTooltips(root);
  const label = `Tutorial für das Modul ${moduleName}`;
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
  if (hasTutorialEntryHintBeenSeen()) return;
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
    markTutorialEntryHintSeen();
    button.classList.remove('tutorial-attention-pulse');
    tooltips?.hide?.();
  }, { once: true });
}
