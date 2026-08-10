const DEFAULT_DELAY_MS = 500;
const DEFAULT_MOVE_TOLERANCE_PX = 12;
const DEFAULT_SUPPRESSION_MS = 750;

function isMatchingTarget(expected, actual) {
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  return Boolean(
    (typeof expected.contains === "function" && expected.contains(actual))
    || (typeof actual.contains === "function" && actual.contains(expected))
  );
}

/**
 * Opens an existing contextual action after a stationary touch hold while keeping
 * the subsequent synthetic click and native context menu from reaching the UI.
 */
export function installTouchLongPress(root, options = {}) {
  if (!root || typeof root.addEventListener !== "function") {
    return () => {};
  }

  const getTarget = typeof options.getTarget === "function" ? options.getTarget : () => null;
  const onLongPress = typeof options.onLongPress === "function" ? options.onLongPress : () => {};
  const delayMs = Math.max(0, Number(options.delayMs) || DEFAULT_DELAY_MS);
  const moveTolerancePx = Math.max(0, Number(options.moveTolerancePx) || DEFAULT_MOVE_TOLERANCE_PX);
  const suppressionMs = Math.max(0, Number(options.suppressionMs) || DEFAULT_SUPPRESSION_MS);
  const ownerDocument = root.ownerDocument || globalThis.document;
  let active = null;
  let suppression = null;
  let suppressionTimer = 0;

  const clearActive = () => {
    if (!active) return;
    clearTimeout(active.timer);
    active = null;
  };

  const clearSuppression = () => {
    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
      suppressionTimer = 0;
    }
    suppression = null;
  };

  const suppressFollowUpEvents = (target) => {
    clearSuppression();
    suppression = {
      target,
      expiresAt: Date.now() + suppressionMs,
    };
    suppressionTimer = setTimeout(clearSuppression, suppressionMs);
  };

  const shouldSuppress = (event) => {
    if (!suppression || Date.now() > suppression.expiresAt) {
      clearSuppression();
      return false;
    }
    return isMatchingTarget(suppression.target, event.target);
  };

  const onPointerDown = (event) => {
    if (
      event.pointerType !== "touch"
      || event.isPrimary === false
      || event.button !== 0
    ) {
      return;
    }
    const target = getTarget(event);
    if (!target) return;

    clearActive();
    const state = {
      pointerId: event.pointerId,
      target,
      startX: Number(event.clientX) || 0,
      startY: Number(event.clientY) || 0,
      opened: false,
      timer: 0,
    };
    state.timer = setTimeout(() => {
      if (active !== state) return;
      state.opened = true;
      suppressFollowUpEvents(state.target);
      onLongPress({
        target: state.target,
        clientX: state.startX,
        clientY: state.startY,
        originalEvent: event,
      });
    }, delayMs);
    active = state;
  };

  const onPointerMove = (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const distance = Math.hypot(
      (Number(event.clientX) || 0) - active.startX,
      (Number(event.clientY) || 0) - active.startY,
    );
    if (distance > moveTolerancePx) {
      clearActive();
    }
  };

  const onPointerEnd = (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const opened = active.opened;
    clearActive();
    if (opened && event.cancelable) {
      event.preventDefault();
    }
  };

  const onFollowUpEvent = (event) => {
    if (!shouldSuppress(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
  };

  const onScroll = () => clearActive();

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("click", onFollowUpEvent, true);
  root.addEventListener("contextmenu", onFollowUpEvent, true);
  root.addEventListener("scroll", onScroll, true);
  ownerDocument?.addEventListener?.("pointermove", onPointerMove, true);
  ownerDocument?.addEventListener?.("pointerup", onPointerEnd, true);
  ownerDocument?.addEventListener?.("pointercancel", onPointerEnd, true);

  return () => {
    clearActive();
    clearSuppression();
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("click", onFollowUpEvent, true);
    root.removeEventListener("contextmenu", onFollowUpEvent, true);
    root.removeEventListener("scroll", onScroll, true);
    ownerDocument?.removeEventListener?.("pointermove", onPointerMove, true);
    ownerDocument?.removeEventListener?.("pointerup", onPointerEnd, true);
    ownerDocument?.removeEventListener?.("pointercancel", onPointerEnd, true);
  };
}
