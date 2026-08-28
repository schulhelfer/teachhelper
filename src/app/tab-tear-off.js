import { isTearOffTab } from './module-window.js';

const TEAR_OFF_DISTANCE = 48;
const TEAR_DRAG_MIME = 'application/x-teachhelper-tab';
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

  const createDragImage = (button) => {
    const label = (button.textContent || '').trim();
    const ghost = document.createElement('div');
    ghost.className = 'tab-tear-ghost';
    ghost.setAttribute('aria-hidden', 'true');

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

    ghost.append(bar, name);
    document.body.append(ghost);
    return ghost;
  };

  const isTornOff = (clientX, clientY) => {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    if (
      clientX < 0
      || clientY < 0
      || clientX > window.innerWidth
      || clientY > window.innerHeight
    ) {
      return true;
    }
    const bounds = nav.getBoundingClientRect();
    return clientY > bounds.bottom + TEAR_OFF_DISTANCE
      || clientY < bounds.top - TEAR_OFF_DISTANCE;
  };

  const readDropPoint = (state, event) => (
    event.clientX === 0 && event.clientY === 0
      ? { clientX: state.lastClientX, clientY: state.lastClientY, screenX: state.lastScreenX, screenY: state.lastScreenY }
      : {
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
      }
  );

  const endDrag = (state) => {
    state.button.classList.remove('is-tearing');
    nav.classList.remove('is-tearing-tab');
    dragState = null;
  };

  nav.querySelectorAll('.tab-button[data-tab-target]').forEach((button) => {
    if (isTearOffTab(button.dataset.tabTarget)) {
      button.draggable = true;
    }
  });

  nav.addEventListener('mousedown', () => {
    suppressNextClick = false;
  });

  nav.addEventListener('dragstart', (event) => {
    const button = resolveTabButton(event.target);
    if (!button || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const tab = button.dataset.tabTarget;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(TEAR_DRAG_MIME, tab);
    const ghost = createDragImage(button);
    event.dataTransfer.setDragImage(ghost, DRAG_IMAGE_ANCHOR_X, DRAG_IMAGE_ANCHOR_Y);
    window.setTimeout(() => ghost.remove(), 0);
    dragState = {
      button,
      tab,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
    };
    button.classList.add('is-tearing');
    nav.classList.add('is-tearing-tab');
  });

  document.addEventListener('dragover', (event) => {
    if (!dragState) return;
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
    dragState.lastScreenX = event.screenX;
    dragState.lastScreenY = event.screenY;
  });

  nav.addEventListener('dragend', (event) => {
    const state = dragState;
    if (!state) return;
    endDrag(state);
    suppressNextClick = true;
    const point = readDropPoint(state, event);
    if (!isTornOff(point.clientX, point.clientY)) return;
    onTearOff(state.tab, { screenX: point.screenX, screenY: point.screenY });
  });

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
