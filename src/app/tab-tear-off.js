import { isTearOffTab } from './module-window.js';

const DRAG_ACTIVATION_DISTANCE_PX = 6;
const WINDOW_EDGE_THRESHOLD_PX = 1;
const DRAG_IMAGE_ANCHOR_X = 130;
const DRAG_IMAGE_ANCHOR_Y = 16;

const NAME_SIZE_MIN_PX = 24;
const NAME_SIZE_MAX_PX = 64;
const NAME_SIZE_BUDGET_PX = 340;

export function resolveTearNameFontSize(label) {
  const length = String(label || '').trim().length;
  if (!length) return NAME_SIZE_MIN_PX;
  return Math.round(
    Math.min(NAME_SIZE_MAX_PX, Math.max(NAME_SIZE_MIN_PX, NAME_SIZE_BUDGET_PX / length)),
  );
}

export function createTabTearOff({ els, onTearOff } = {}) {
  const nav = els?.tabNav;
  if (!nav || typeof onTearOff !== 'function') return null;

  let dragState = null;
  let suppressNextClick = false;

  const resolveTabButton = (target) => {
    const button = target instanceof Element
      ? target.closest('.tab-button[data-tab-target]')
      : null;
    if (!button || !nav.contains(button)) return null;
    return isTearOffTab(button.dataset.tabTarget) ? button : null;
  };

  const updateLastPoint = (state, event) => {
    state.lastScreenX = event.screenX;
    state.lastScreenY = event.screenY;
    if (state.preview) {
      state.preview.style.transform = `translate3d(${event.clientX - DRAG_IMAGE_ANCHOR_X}px, ${event.clientY - DRAG_IMAGE_ANCHOR_Y}px, 0)`;
    }
  };

  const createDragPreview = (button) => {
    const label = (button.textContent || '').trim();
    const preview = document.createElement('div');
    preview.className = 'tab-tear-ghost';
    preview.setAttribute('aria-hidden', 'true');

    const bar = document.createElement('div');
    bar.className = 'tab-tear-ghost-bar';
    const dots = document.createElement('span');
    dots.className = 'tab-tear-ghost-dots';
    for (let index = 0; index < 3; index += 1) {
      dots.append(document.createElement('i'));
    }
    bar.append(dots);

    const name = document.createElement('div');
    name.className = 'tab-tear-ghost-name';
    name.style.setProperty('--tear-name-size', `${resolveTearNameFontSize(label)}px`);
    name.textContent = label;

    preview.append(bar, name);
    document.body.append(preview);
    return preview;
  };

  const createPointerLayer = () => {
    const layer = document.createElement('div');
    layer.className = 'tab-tear-pointer-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    return layer;
  };

  const hasMovedFarEnough = (state, event) => {
    const distanceX = event.clientX - state.startClientX;
    const distanceY = event.clientY - state.startClientY;
    return (distanceX ** 2) + (distanceY ** 2) >= DRAG_ACTIVATION_DISTANCE_PX ** 2;
  };

  const hasLeftPwaWindow = (event) => (
    event.clientX <= 0
    || event.clientY <= 0
    || event.clientX >= window.innerWidth
    || event.clientY >= window.innerHeight
  );

  const isAtPwaWindowEdge = (event) => (
    event.clientX <= WINDOW_EDGE_THRESHOLD_PX
    || event.clientY <= WINDOW_EDGE_THRESHOLD_PX
    || event.clientX >= window.innerWidth - WINDOW_EDGE_THRESHOLD_PX
    || event.clientY >= window.innerHeight - WINDOW_EDGE_THRESHOLD_PX
  );

  const endDrag = (state, { suppressClick = false } = {}) => {
    state.pointerLayer?.remove();
    state.preview?.remove();
    state.button.classList.remove('is-tearing');
    dragState = null;
    if (suppressClick) suppressNextClick = true;
  };

  const tearOffAtLastPoint = (state, event) => {
    updateLastPoint(state, event);
    endDrag(state, { suppressClick: true });
    onTearOff(state.tab, { screenX: state.lastScreenX, screenY: state.lastScreenY });
  };

  nav.querySelectorAll('.tab-button[data-tab-target]').forEach((button) => {
    if (isTearOffTab(button.dataset.tabTarget)) {
      button.classList.add('is-tearable');
    }
  });

  nav.addEventListener('pointerdown', (event) => {
    suppressNextClick = false;
    if (!event.isPrimary || !['mouse', 'pen'].includes(event.pointerType) || event.button !== 0) {
      return;
    }
    const button = resolveTabButton(event.target);
    if (!button) return;
    if (dragState) endDrag(dragState);
    dragState = {
      button,
      tab: button.dataset.tabTarget,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      hasMoved: false,
      preview: null,
      pointerLayer: null,
    };
  });

  window.addEventListener('pointermove', (event) => {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    updateLastPoint(state, event);
    if (!state.hasMoved && hasMovedFarEnough(state, event)) {
      state.hasMoved = true;
      state.button.classList.add('is-tearing');
      state.pointerLayer = createPointerLayer();
      state.preview = createDragPreview(state.button);
      updateLastPoint(state, event);
    }
    if (state.hasMoved && isAtPwaWindowEdge(event)) {
      tearOffAtLastPoint(state, event);
    }
  });

  window.addEventListener('pointerout', (event) => {
    const state = dragState;
    if (
      !state
      || event.pointerId !== state.pointerId
      || !state.hasMoved
      || event.relatedTarget
      || !hasLeftPwaWindow(event)
    ) return;
    tearOffAtLastPoint(state, event);
  });

  window.addEventListener('pointerleave', (event) => {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId || !state.hasMoved) return;
    tearOffAtLastPoint(state, event);
  });

  const finishPointerDrag = (event) => {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    endDrag(state, { suppressClick: state.hasMoved });
  };
  window.addEventListener('pointerup', finishPointerDrag);
  window.addEventListener('pointercancel', finishPointerDrag);

  nav.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  return {
    isDragging: () => Boolean(dragState),
  };
}
