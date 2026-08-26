import { installAppTooltips } from './app-tooltips.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from './tutorial-entry-state.js';

const DELAY_MS = 420;

export function installTutorialEntryHint(button, moduleKey, moduleName, root = document) {
  if (!button || !moduleKey) return;
  const tooltips = installAppTooltips(root);
  const moduleFrameNonce = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
  const moduleOrigin = new URL(import.meta.url).origin;
  const parentOrigin = window.location.origin === 'null' ? moduleOrigin : window.location.origin;
  const embedded = window.parent && window.parent !== window;
  const label = `Tutorial oder Hilfe für das Modul ${moduleName}`;
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
  let hintSeen = hasTutorialEntryHintBeenSeen();
  let timer = 0;
  const clearHint = () => {
    hintSeen = true;
    window.clearTimeout(timer);
    button.classList.remove('tutorial-attention-pulse');
    tooltips?.hide?.();
  };
  const isTrustedParentMessage = (event) => (
    embedded
    && event?.source === window.parent
    && event?.origin === parentOrigin
    && event?.data?.type === TUTORIAL_ENTRY_HINT_SYNC_EVENT
    && (!moduleFrameNonce || event.data.frameNonce === moduleFrameNonce)
  );
  const handleParentHintSync = (event) => {
    if (!isTrustedParentMessage(event) || event.data.detail?.seen !== true) return;
    markTutorialEntryHintSeen();
    clearHint();
  };
  window.addEventListener('message', handleParentHintSync);
  if (embedded) {
    try {
      window.parent.postMessage({
        type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
        detail: { action: 'request' },
        ...(moduleFrameNonce ? { frameNonce: moduleFrameNonce } : {}),
      }, parentOrigin);
    } catch {
    }
  }
  if (hintSeen) return;
  button.classList.add('tutorial-attention-pulse');
  let attempts = 0;
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
    markTutorialEntryHintSeen();
    clearHint();
  }, { once: true });
}
