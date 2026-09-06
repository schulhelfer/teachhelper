import {
  HELP_PREVIEW_COMMAND_EVENT,
  HELP_PREVIEW_STATE_EVENT,
  getHelpPreviewConfig,
} from './help-preview.js';
import {
  HELP_PREVIEW_FRAME_SANDBOX,
  createModuleFrame,
  isTrustedModuleMessage,
  postToModule,
} from '../shared/module-frame-bridge.js';

export const HELP_VISUAL_FRAME_INTERVAL_MS = 3600;

const HELP_VISUAL_IDS = new Set([
  'allgemein', 'grades', 'planning', 'seatplan', 'name-learning', 'groups',
  'random-picker', 'merger', 'duplicate-check', 'work-phase', 'qr',
]);
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const PREVIEW_CROP_WIDTH = 960;
const PREVIEW_CROP_HEIGHT = 540;
const PREVIEW_TIMEOUT_MS = 12_000;

export function isHelpVisualId(value) {
  return HELP_VISUAL_IDS.has(String(value || ''));
}

export function hasHelpPreview(articleId) {
  return Boolean(getHelpPreviewConfig(articleId));
}

let visualSequence = 0;

function makeElement(doc, tagName, className = '', text = '') {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createArrow(doc, markerId) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(namespace, 'svg');
  svg.classList.add('help-visual-arrow');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const defs = doc.createElementNS(namespace, 'defs');
  const marker = doc.createElementNS(namespace, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const arrowHead = doc.createElementNS(namespace, 'path');
  arrowHead.setAttribute('d', 'M0,0 L7,3.5 L0,7 z');
  arrowHead.setAttribute('class', 'help-visual-arrow-head');
  marker.append(arrowHead);
  defs.append(marker);
  const path = doc.createElementNS(namespace, 'path');
  path.setAttribute('class', 'help-visual-arrow-path');
  path.setAttribute('marker-end', `url(#${markerId})`);
  svg.append(defs, path);
  return { svg, path };
}

function previewSource(articleId) {
  const url = new URL('../../index.html', import.meta.url);
  url.searchParams.set('help-preview', articleId);
  return url;
}

export function createHelpVisual(articleItem, { doc = document } = {}) {
  const config = getHelpPreviewConfig(articleItem?.id);
  if (!config || !doc) return { element: null, destroy: () => {} };

  const frameDefinitions = config.frames;
  const figure = makeElement(doc, 'figure', 'help-visual');
  figure.dataset.visualId = articleItem.visualId || config.tab;
  figure.dataset.helpPreview = 'loading';
  const canvas = makeElement(doc, 'div', 'help-visual-canvas');
  const stage = makeElement(doc, 'div', 'help-visual-stage');
  stage.setAttribute('aria-hidden', 'true');
  // ESM-Module der PWA benötigen im eingebetteten Dokument eine gleiche Origin.
  // Die Isolation der Daten erfolgt daher im expliziten, ephemeren Preview-Modus.
  const frame = createModuleFrame({
    className: 'help-preview-frame',
    loading: 'eager',
    src: previewSource(articleItem.id),
    title: '',
    sandbox: HELP_PREVIEW_FRAME_SANDBOX,
  });
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  const spotlight = makeElement(doc, 'span', 'help-visual-spotlight');
  const callout = makeElement(doc, 'span', 'help-visual-callout');
  const markerId = `help-visual-arrow-${++visualSequence}`;
  const { svg: arrow, path: arrowPath } = createArrow(doc, markerId);
  stage.append(frame, spotlight, arrow, callout);

  const toolbar = makeElement(doc, 'div', 'help-visual-toolbar');
  const toggle = makeElement(doc, 'button', 'ghost help-visual-action', '⏸');
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', 'false');
  const restart = makeElement(doc, 'button', 'ghost help-visual-action', '↺');
  restart.type = 'button';
  restart.setAttribute('aria-label', 'Erneut abspielen');
  restart.dataset.tooltip = 'Erneut abspielen';
  toolbar.append(toggle, restart);
  const status = makeElement(doc, 'span', 'help-visual-status', 'Vorschau wird geladen …');
  status.setAttribute('role', 'status');
  canvas.append(stage, toolbar, status);
  figure.append(canvas);

  const previewWindow = doc.defaultView || window;
  const reduceMotion = Boolean(previewWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let frameIndex = 0;
  let requestedStepTitle = frameDefinitions[0]?.stepTitle || '';
  let targetRect = null;
  let interval = 0;
  let timeout = previewWindow.setTimeout(() => {
    if (figure.dataset.helpPreview !== 'ready') {
      figure.dataset.helpPreview = 'error';
      status.textContent = 'Vorschau konnte nicht geladen werden.';
    }
  }, PREVIEW_TIMEOUT_MS);
  let paused = reduceMotion;
  let resizeObserver = null;

  const setFrame = (nextIndex, { send = true } = {}) => {
    frameIndex = (nextIndex + frameDefinitions.length) % frameDefinitions.length;
    const definition = frameDefinitions[frameIndex];
    requestedStepTitle = definition.stepTitle;
    figure.dataset.helpVisualFrame = String(frameIndex + 1);
    callout.textContent = definition.label;
    if (send && figure.dataset.helpPreview === 'ready') {
      postToModule(frame, {
        type: HELP_PREVIEW_COMMAND_EVENT,
        detail: { action: 'show-frame', stepTitle: requestedStepTitle },
      });
    }
  };

  const layoutPreview = () => {
    const bounds = canvas.getBoundingClientRect?.();
    if (!bounds || !bounds.width || !bounds.height) return;
    const scale = Math.max(bounds.width / PREVIEW_CROP_WIDTH, bounds.height / PREVIEW_CROP_HEIGHT);
    const focusX = targetRect ? targetRect.left + targetRect.width / 2 : PREVIEW_CROP_WIDTH / 2;
    const focusY = targetRect ? targetRect.top + targetRect.height / 2 : PREVIEW_CROP_HEIGHT / 2;
    const cropX = clamp(focusX - PREVIEW_CROP_WIDTH / 2, 0, PREVIEW_WIDTH - PREVIEW_CROP_WIDTH);
    const cropY = clamp(focusY - PREVIEW_CROP_HEIGHT / 2, 0, PREVIEW_HEIGHT - PREVIEW_CROP_HEIGHT);
    frame.style.transform = `translate(${-cropX * scale}px, ${-cropY * scale}px) scale(${scale})`;
    if (!targetRect) return;
    const pointX = (targetRect.left + targetRect.width / 2 - cropX) * scale;
    const pointY = (targetRect.top + targetRect.height / 2 - cropY) * scale;
    spotlight.style.setProperty('--help-visual-x', `${pointX}px`);
    spotlight.style.setProperty('--help-visual-y', `${pointY}px`);
    const x = clamp((pointX / bounds.width) * 100, 4, 96);
    const y = clamp((pointY / bounds.height) * 100, 7, 93);
    arrowPath.setAttribute('d', `M 11 18 C 28 20, 42 30, ${x} ${y}`);
  };

  const stop = () => {
    if (!interval) return;
    previewWindow.clearInterval(interval);
    interval = 0;
  };
  const play = () => {
    if (reduceMotion || paused || interval || figure.dataset.helpPreview !== 'ready') return;
    interval = previewWindow.setInterval(() => setFrame(frameIndex + 1), HELP_VISUAL_FRAME_INTERVAL_MS);
  };
  const syncToggle = () => {
    const label = paused ? 'Animation fortsetzen' : 'Animation pausieren';
    toggle.textContent = paused ? '▶' : '⏸';
    toggle.setAttribute('aria-label', label);
    toggle.dataset.tooltip = label;
    toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
    figure.dataset.helpVisualMotion = paused ? 'paused' : 'playing';
  };

  const onMessage = (event) => {
    if (!isTrustedModuleMessage(event, frame)) return;
    const message = event.data;
    if (!message || message.type !== HELP_PREVIEW_STATE_EVENT) return;
    const detail = message.detail || {};
    if (detail.articleId !== articleItem.id) return;
    if (detail.state === 'ready') {
      figure.dataset.helpPreview = 'ready';
      previewWindow.clearTimeout(timeout);
      timeout = 0;
      status.hidden = true;
      setFrame(frameIndex);
      return;
    }
    if (detail.state === 'frame' && detail.stepTitle === requestedStepTitle) {
      const rect = detail.rect;
      if (![rect?.left, rect?.top, rect?.width, rect?.height].every(Number.isFinite)) return;
      targetRect = rect;
      layoutPreview();
      if (!reduceMotion) play();
      return;
    }
    if (detail.state === 'error') {
      figure.dataset.helpPreview = 'error';
      status.textContent = 'Vorschau konnte nicht geladen werden.';
      stop();
    }
  };
  previewWindow.addEventListener('message', onMessage);
  if (typeof previewWindow.ResizeObserver === 'function') {
    resizeObserver = new previewWindow.ResizeObserver(layoutPreview);
    resizeObserver.observe(canvas);
  } else {
    previewWindow.addEventListener('resize', layoutPreview);
  }

  setFrame(0, { send: false });
  layoutPreview();
  if (reduceMotion) {
    figure.dataset.helpVisualMotion = 'reduced';
    toggle.disabled = true;
    toggle.setAttribute('aria-label', 'Animation bei reduzierter Bewegung deaktiviert');
    toggle.dataset.tooltip = 'Reduzierte Bewegung aktiv';
  } else {
    syncToggle();
  }
  toggle.addEventListener('click', () => {
    if (reduceMotion || figure.dataset.helpPreview !== 'ready') return;
    paused = !paused;
    if (paused) stop();
    else play();
    syncToggle();
  });
  restart.addEventListener('click', () => {
    targetRect = null;
    setFrame(0);
    if (!reduceMotion && paused) {
      paused = false;
      syncToggle();
      play();
    }
  });

  return {
    element: figure,
    destroy: () => {
      stop();
      if (timeout) previewWindow.clearTimeout(timeout);
      previewWindow.removeEventListener('message', onMessage);
      if (resizeObserver) resizeObserver.disconnect();
      else previewWindow.removeEventListener('resize', layoutPreview);
      frame.remove();
    },
  };
}
