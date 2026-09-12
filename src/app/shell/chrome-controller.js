const CHROME_TOGGLE_EXPAND_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 6H6V2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 2L6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 10H10V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 14L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const CHROME_TOGGLE_COLLAPSE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 2H2V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 2L6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 14H14V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 14L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

function parseCssTimeToMs(value) {
  if (!value) return 0;
  const normalized = String(value).trim();
  if (!normalized) return 0;
  if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || 0;
  if (normalized.endsWith('s')) return (Number.parseFloat(normalized) || 0) * 1000;
  return Number.parseFloat(normalized) || 0;
}

export function createChromeController({
  app = null,
  header = null,
  tabNav = null,
  sidebar = null,
  headerToggle = null,
  overlayToggle = null,
  documentRef = null,
  ElementClass = null,
  additionalCollapseFocusContainers = [],
  additionalCollapseFocusTargets = [],
  initialCollapsed = false,
  isIOSDevice = false,
  requestAnimationFrame: requestFrame = null,
  cancelAnimationFrame: cancelFrame = null,
  setTimeout: setTimer = null,
  clearTimeout: clearTimer = null,
  matchMedia = null,
  getComputedStyle = null,
  onResetSidebarWidth = () => {},
  onCloseNavigationMenu = () => {},
  onQueueNavigationLayoutSync = () => {},
  onQueueSettledIndicatorUpdate = () => {},
  onTutorialEntryVisibilityChange = () => {},
  onRefreshLayouts = () => {},
  onRenderManualSaveControl = () => {},
  onRenderVaultControl = () => {},
} = {}) {
  let disposed = false;
  let collapsed = Boolean(initialCollapsed);
  let transitionState = 'idle';
  let transitionTimer = null;
  const bindings = [];
  const scheduledFrames = new Set();
  const scheduledTimers = new Set();

  function bind(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    bindings.push([target, type, listener]);
  }

  function scheduleFrame(callback) {
    if (disposed) return null;
    if (typeof requestFrame !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledFrames.add(scheduled);
    scheduled.id = requestFrame(() => {
      scheduledFrames.delete(scheduled);
      if (!disposed) callback();
    });
    return scheduled;
  }

  function scheduleTimer(callback, delay) {
    if (disposed) return null;
    if (typeof setTimer !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledTimers.add(scheduled);
    scheduled.id = setTimer(() => {
      scheduledTimers.delete(scheduled);
      if (!disposed) callback();
    }, delay);
    return scheduled;
  }

  function cancelTimer(scheduled) {
    if (!scheduled) return;
    scheduledTimers.delete(scheduled);
    if (typeof clearTimer === 'function') clearTimer(scheduled.id);
  }

  function clearTransitionTimer() {
    if (!transitionTimer) return;
    cancelTimer(transitionTimer);
    transitionTimer = null;
  }

  function getTransitionDuration() {
    if (typeof matchMedia !== 'function') return 320;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 1;
    const styleHost = app || documentRef?.documentElement;
    const computed = typeof getComputedStyle === 'function' && styleHost
      ? getComputedStyle(styleHost)
      : null;
    const durations = [
      computed?.getPropertyValue?.('--chrome-transition-duration'),
      computed?.getPropertyValue?.('--chrome-transition-duration-medium'),
      computed?.getPropertyValue?.('--chrome-transition-duration-short'),
    ].map(parseCssTimeToMs).filter((duration) => duration > 0);
    return (durations.length ? Math.max(...durations) : 280) + 40;
  }

  function setRegionVisibility(hidden) {
    if (disposed) return;
    [tabNav, sidebar].forEach((region) => {
      if (!region) return;
      region.hidden = Boolean(hidden);
      if (hidden) {
        region.setAttribute('aria-hidden', 'true');
      } else {
        region.removeAttribute('aria-hidden');
      }
      if ('inert' in region) region.inert = Boolean(hidden);
    });
    if (hidden) {
      onCloseNavigationMenu();
    } else {
      onQueueNavigationLayoutSync();
    }
  }

  function setHeaderVisibility(hidden) {
    if (disposed || !header) return;
    header.hidden = Boolean(hidden);
    if (hidden) {
      header.setAttribute('aria-hidden', 'true');
      if ('inert' in header) header.inert = true;
      return;
    }
    header.removeAttribute('aria-hidden');
    if ('inert' in header) header.inert = false;
  }

  function setOverlayVisibility(visible, interactive = visible) {
    if (disposed || !overlayToggle) return;
    overlayToggle.hidden = !visible;
    overlayToggle.disabled = !interactive;
    if (visible) {
      overlayToggle.removeAttribute('aria-hidden');
      return;
    }
    overlayToggle.setAttribute('aria-hidden', 'true');
  }

  function focusControl(target) {
    if (!target || target.hidden || target.disabled) return false;
    try {
      target.focus({ preventScroll: true });
    } catch (_error) {
      try {
        target.focus();
      } catch (_focusError) {
        return false;
      }
    }
    return documentRef?.activeElement === target;
  }

  function isElement(value) {
    return typeof ElementClass === 'function'
      ? value instanceof ElementClass
      : Boolean(value && typeof value === 'object');
  }

  function moveFocusOutBeforeHide() {
    const active = documentRef?.activeElement;
    if (!isElement(active)) return;
    const hiddenContainers = [header, tabNav, sidebar, ...additionalCollapseFocusContainers]
      .filter(Boolean);
    const shouldMoveFocus = hiddenContainers.some((container) => container.contains(active))
      || additionalCollapseFocusTargets.includes(active);
    if (!shouldMoveFocus) return;
    if (focusControl(overlayToggle)) return;
    active.blur?.();
  }

  function moveFocusOutOfOverlayBeforeHide() {
    const active = documentRef?.activeElement;
    if (!isElement(active)) return;
    if (!overlayToggle?.contains(active) && active !== overlayToggle) return;
    if (focusControl(headerToggle)) return;
    active.blur?.();
  }

  function applyVisibility(nextCollapsed) {
    if (nextCollapsed) {
      setOverlayVisibility(true, true);
      moveFocusOutBeforeHide();
      onTutorialEntryVisibilityChange(false);
      setRegionVisibility(true);
      setHeaderVisibility(true);
      return;
    }
    setRegionVisibility(false);
    setHeaderVisibility(false);
    onTutorialEntryVisibilityChange(true);
    moveFocusOutOfOverlayBeforeHide();
    setOverlayVisibility(false, false);
  }

  function updateToggleUI({ preserveHeaderIcon = false, preserveOverlayIcon = false } = {}) {
    if (disposed) return;
    const label = collapsed ? 'Randleiste anzeigen' : 'Hauptansicht im Vollbild';
    [headerToggle, overlayToggle].forEach((button) => {
      if (!button) return;
      button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      if (
        (button === headerToggle && preserveHeaderIcon)
        || (button === overlayToggle && preserveOverlayIcon)
      ) {
        return;
      }
      button.innerHTML = collapsed ? CHROME_TOGGLE_EXPAND_ICON : CHROME_TOGGLE_COLLAPSE_ICON;
    });
  }

  function finalizeTransition(nextCollapsed) {
    if (disposed) return;
    clearTransitionTimer();
    transitionState = 'idle';
    const settleChromeLayout = !nextCollapsed && app;
    if (settleChromeLayout) app.classList.add('is-chrome-layout-settling');
    if (app) {
      app.classList.remove('is-collapsing', 'is-expanding');
      app.classList.toggle('chrome-collapsed', nextCollapsed);
    }
    updateToggleUI();
    applyVisibility(nextCollapsed);
    onRenderVaultControl();
    onRenderManualSaveControl();
    onRefreshLayouts();
    onQueueSettledIndicatorUpdate();
    if (settleChromeLayout) {
      if (typeof requestFrame === 'function') {
        scheduleFrame(() => app?.classList.remove('is-chrome-layout-settling'));
      } else {
        app.classList.remove('is-chrome-layout-settling');
      }
    }
  }

  function queueTransition(callback) {
    if (typeof requestFrame === 'function') {
      if (isIOSDevice) {
        scheduleFrame(callback);
        return;
      }
      scheduleFrame(() => scheduleFrame(callback));
      return;
    }
    scheduleTimer(callback, 0);
  }

  function setCollapsed(nextValue, { resetSidebarWidth = true } = {}) {
    if (disposed || transitionState !== 'idle') return;
    const nextCollapsed = Boolean(nextValue);
    if (resetSidebarWidth && !nextCollapsed && collapsed) onResetSidebarWidth();
    if (
      collapsed === nextCollapsed
      && !app?.classList.contains('is-collapsing')
      && !app?.classList.contains('is-expanding')
    ) {
      applyVisibility(nextCollapsed);
      updateToggleUI();
      onRenderManualSaveControl();
      onRefreshLayouts();
      return;
    }
    collapsed = nextCollapsed;
    if (!app) {
      updateToggleUI();
      applyVisibility(nextCollapsed);
      onRenderManualSaveControl();
      onRefreshLayouts();
      return;
    }
    updateToggleUI(nextCollapsed
      ? { preserveHeaderIcon: true }
      : { preserveOverlayIcon: true });
    clearTransitionTimer();
    setRegionVisibility(false);
    setHeaderVisibility(false);
    setOverlayVisibility(true, nextCollapsed);
    onTutorialEntryVisibilityChange(false);
    onRenderManualSaveControl();
    if (nextCollapsed) {
      transitionState = 'collapsing';
      app.classList.remove('chrome-collapsed', 'is-expanding');
      queueTransition(() => {
        if (transitionState !== 'collapsing' || !app) return;
        app.classList.add('is-collapsing');
        onRefreshLayouts();
        transitionTimer = scheduleTimer(() => finalizeTransition(true), getTransitionDuration());
      });
      return;
    }
    transitionState = 'expanding';
    app.classList.remove('is-collapsing');
    app.classList.add('chrome-collapsed');
    queueTransition(() => {
      if (transitionState !== 'expanding' || !app) return;
      app.classList.add('is-expanding');
      onRefreshLayouts();
      transitionTimer = scheduleTimer(() => finalizeTransition(false), getTransitionDuration());
    });
  }

  function toggle() {
    if (disposed || transitionState !== 'idle') return;
    setCollapsed(!collapsed);
  }

  function isCollapsed() {
    return collapsed;
  }

  function getTransitionState() {
    return transitionState;
  }

  function sync() {
    if (disposed) return;
    updateToggleUI();
    setRegionVisibility(collapsed);
    setHeaderVisibility(collapsed);
    setOverlayVisibility(collapsed, collapsed);
    onRenderVaultControl();
    onRenderManualSaveControl();
  }

  function handleDocumentKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!collapsed || transitionState !== 'idle') return;
    if (documentRef?.querySelector?.('dialog[open]')) return;
    setCollapsed(false);
  }

  bind(headerToggle, 'click', toggle);
  bind(overlayToggle, 'click', toggle);
  bind(documentRef, 'keydown', handleDocumentKeydown);

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTransitionTimer();
    bindings.splice(0).forEach(([target, type, listener]) => {
      target.removeEventListener?.(type, listener);
    });
    scheduledFrames.forEach(({ id }) => {
      if (typeof cancelFrame === 'function') cancelFrame(id);
    });
    scheduledFrames.clear();
    scheduledTimers.forEach(({ id }) => {
      if (typeof clearTimer === 'function') clearTimer(id);
    });
    scheduledTimers.clear();
    transitionState = 'idle';
    app?.classList.remove('is-collapsing', 'is-expanding', 'is-chrome-layout-settling');
  }

  return {
    setCollapsed,
    toggle,
    isCollapsed,
    getTransitionState,
    getTransitionDuration,
    sync,
    updateToggleUI,
    setRegionVisibility,
    setHeaderVisibility,
    setOverlayVisibility,
    dispose,
  };
}
