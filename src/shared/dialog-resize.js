(function installTeachHelperDialogResize() {
  const VIEWPORT_MARGIN = 24;
  const RESIZE_STEP = 40;
  const MIN_FLOOR = 220;
  const MIN_HEIGHT_CAP = 320;
  const AXIS_LOCK_RATIO = 0.34;

  const grips = new WeakMap();
  const natural = new WeakMap();
  const keys = new WeakMap();
  const explicitHeights = new WeakSet();
  const sizes = new Map();
  let ordinal = 0;

  function resolveAxis(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < ay * AXIS_LOCK_RATIO) return 'y';
    if (ay < ax * AXIS_LOCK_RATIO) return 'x';
    return 'both';
  }

  function dialogKey(dialog) {
    const cached = keys.get(dialog);
    if (cached) return cached;
    const key = dialog.id
      || (dialog.className ? `class:${dialog.className}` : '')
      || `ordinal:${(ordinal += 1)}`;
    keys.set(dialog, key);
    return key;
  }

  function usesFixedHeight(dialog) {
    return dialog.dataset.dialogResizeHeight === 'fixed';
  }

  function limits(dialog) {
    const base = natural.get(dialog) || { width: MIN_FLOOR, height: MIN_FLOOR };
    const maxWidth = Math.max(MIN_FLOOR, window.innerWidth - VIEWPORT_MARGIN);
    const maxHeight = Math.max(MIN_FLOOR, window.innerHeight - VIEWPORT_MARGIN);
    return {
      minWidth: Math.min(Math.max(MIN_FLOOR, base.width), maxWidth),
      minHeight: Math.min(Math.max(MIN_FLOOR, Math.min(base.height, MIN_HEIGHT_CAP)), maxHeight),
      maxWidth,
      maxHeight,
    };
  }

  function applySize(dialog, size) {
    if (!size) return;
    const hasWidth = Number.isFinite(size.width);
    const hasHeight = Number.isFinite(size.height);
    if (!hasWidth && !hasHeight) return;
    const bound = limits(dialog);
    const stored = sizes.get(dialogKey(dialog)) || {};
    const next = { ...stored };
    if (hasWidth) {
      next.width = Math.round(Math.min(Math.max(size.width, bound.minWidth), bound.maxWidth));
      dialog.style.width = `${next.width}px`;
      dialog.style.maxWidth = `${next.width}px`;
    }
    if (hasHeight) {
      next.height = Math.round(Math.min(Math.max(size.height, bound.minHeight), bound.maxHeight));
      if (usesFixedHeight(dialog) || explicitHeights.has(dialog)) dialog.style.height = `${next.height}px`;
      dialog.style.maxHeight = `${next.height}px`;
    }
    dialog.classList.add('is-dialog-resized');
    sizes.set(dialogKey(dialog), next);
  }

  function resetSize(dialog) {
    sizes.delete(dialogKey(dialog));
    explicitHeights.delete(dialog);
    dialog.style.width = '';
    dialog.style.maxWidth = '';
    dialog.style.height = '';
    dialog.style.maxHeight = '';
    dialog.classList.remove('is-dialog-resized');
  }

  function startResize(dialog, grip, event) {
    if (event.button > 0) return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    dialog.classList.add('is-dialog-resizing');
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      
    }

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const axis = resolveAxis(dx, dy);
      const size = {};
      if (axis !== 'y') size.width = startWidth + (dx * 2);
      if (axis !== 'x') {
        size.height = startHeight + (dy * 2);
        explicitHeights.add(dialog);
      }
      applySize(dialog, size);
    };
    const finish = (endEvent) => {
      if (endEvent && endEvent.pointerId !== event.pointerId) return;
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', finish);
      grip.removeEventListener('pointercancel', finish);
      grip.removeEventListener('lostpointercapture', finish);
      dialog.classList.remove('is-dialog-resizing');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    grip.addEventListener('lostpointercapture', finish);
  }

  const STEPS = {
    ArrowRight: [RESIZE_STEP, 0],
    ArrowLeft: [-RESIZE_STEP, 0],
    ArrowDown: [0, RESIZE_STEP],
    ArrowUp: [0, -RESIZE_STEP],
  };

  function handleKeys(dialog, event) {
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    const size = {};
    if (step[0]) size.width = rect.width + step[0];
    if (step[1]) {
      size.height = rect.height + step[1];
      explicitHeights.add(dialog);
    }
    applySize(dialog, size);
  }

  function ensureGrip(dialog) {
    const existing = grips.get(dialog);
    if (existing) {
      if (existing.parentNode !== dialog) dialog.append(existing);
      return existing;
    }
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'dialog-resize-grip';
    grip.setAttribute('aria-label', 'Dialoggröße ändern');
    grip.addEventListener('pointerdown', (event) => startResize(dialog, grip, event));
    grip.addEventListener('keydown', (event) => handleKeys(dialog, event));
    grip.addEventListener('dblclick', () => resetSize(dialog));
    dialog.append(grip);
    dialog.classList.add('has-dialog-resize');
    grips.set(dialog, grip);
    return grip;
  }

  function handleOpen(dialog) {
    if (dialog.dataset.dialogResize === 'off') return;
    if (!natural.has(dialog)) {
      const rect = dialog.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        natural.set(dialog, { width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
    ensureGrip(dialog);
    const stored = sizes.get(dialogKey(dialog));
    if (stored) applySize(dialog, stored);
  }

  function initialize() {
    const root = document.body || document.documentElement;
    if (!root) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (target instanceof HTMLDialogElement && target.open) handleOpen(target);
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['open'] });
    for (const dialog of document.querySelectorAll('dialog[open]')) handleOpen(dialog);
    window.addEventListener('resize', () => {
      for (const dialog of document.querySelectorAll('dialog[open].is-dialog-resized')) {
        const stored = sizes.get(dialogKey(dialog));
        if (stored) applySize(dialog, stored);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}());
