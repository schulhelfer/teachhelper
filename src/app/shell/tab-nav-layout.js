const TAB_NAV_MODE_HYSTERESIS = 8;
const VIEWPORT_RESIZE_SETTLE_DELAY = 160;

export function fitTabNavItems({
  widths = [],
  gap = 0,
  triggerWidth = 0,
  available = 0,
  minimumVisibleCount = 0,
  previousVisibleCount = null,
  hysteresis = 0,
} = {}) {
  const epsilon = 0.5;
  const floor = Math.min(Math.max(minimumVisibleCount, 0), widths.length);
  const fitWithin = (budget) => {
    let used = 0;
    let count = 0;
    for (let index = 0; index < widths.length; index += 1) {
      const next = used + (count > 0 ? gap : 0) + widths[index];
      if (count >= floor && next > budget + epsilon) break;
      used = next;
      count += 1;
    }
    return count;
  };
  const fitRow = (budget) => (
    fitWithin(budget) === widths.length
      ? widths.length
      : fitWithin(budget - gap - triggerWidth)
  );
  let visibleCount = fitRow(available);
  if (Number.isFinite(previousVisibleCount) && visibleCount > previousVisibleCount) {
    visibleCount = Math.max(previousVisibleCount, fitRow(available - hysteresis));
  }
  return visibleCount;
}

export function createTabNavLayoutController({
  app = null,
  tabNav = null,
  tabIndicator = null,
  moreTools = null,
  moreToolsTrigger = null,
  moreToolsMenu = null,
  view = null,
  documentRef = null,
  ResizeObserverClass = view?.ResizeObserver,
  HTMLElementClass = view?.HTMLElement,
  ElementClass = view?.Element,
  NodeClass = view?.Node,
  protectedTabTargets = [],
  getActiveTab = () => '',
  getTabTransitionState = () => 'idle',
  getIndicatorSettleDelay = () => 320,
  onTabRequest = () => {},
} = {}) {
  let disposed = false;
  let tabNavResizeObserver = null;
  let moreToolsSyncFrame = null;
  let tabIndicatorFrame = null;
  let viewportResizeTimer = null;
  let tabIndicatorSettleTimer = null;
  let lastViewportSignature = '';
  let overflowTargets = new Set();
  let lastFit = { itemCount: 0, visibleCount: 0 };
  const protectedTargets = new Set(protectedTabTargets);
  const bindings = [];
  const scheduledFrames = new Set();
  const scheduledTimers = new Set();

  function isHTMLElement(value) {
    return typeof HTMLElementClass === 'function'
      ? value instanceof HTMLElementClass
      : Boolean(value && typeof value === 'object');
  }

  function isElement(value) {
    return typeof ElementClass === 'function'
      ? value instanceof ElementClass
      : Boolean(value && typeof value.closest === 'function');
  }

  function isNode(value) {
    return typeof NodeClass === 'function'
      ? value instanceof NodeClass
      : Boolean(value && typeof value === 'object');
  }

  function bind(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    bindings.push([target, type, listener]);
  }

  function requestFrame(callback) {
    if (typeof view?.requestAnimationFrame !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledFrames.add(scheduled);
    scheduled.id = view.requestAnimationFrame(() => {
      scheduledFrames.delete(scheduled);
      if (!disposed) callback();
    });
    return scheduled;
  }

  function cancelFrame(scheduled) {
    if (!scheduled) return;
    scheduledFrames.delete(scheduled);
    view?.cancelAnimationFrame?.(scheduled.id);
  }

  function requestTimer(callback, delay) {
    if (typeof view?.setTimeout !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledTimers.add(scheduled);
    scheduled.id = view.setTimeout(() => {
      scheduledTimers.delete(scheduled);
      if (!disposed) callback();
    }, delay);
    return scheduled;
  }

  function cancelTimer(scheduled) {
    if (!scheduled) return;
    scheduledTimers.delete(scheduled);
    view?.clearTimeout?.(scheduled.id);
  }

  function getMenuItems() {
    if (!moreToolsMenu) return [];
    return Array.from(moreToolsMenu.querySelectorAll('[data-more-tools-target]'));
  }

  function getFocusableMenuItems() {
    return getMenuItems().filter((item) => !item.hidden);
  }

  function setMenuOpen(open, options = {}) {
    if (disposed) return;
    const canOpen = Boolean(
      open
      && tabNav?.classList.contains('is-tools-condensed')
      && moreToolsTrigger
      && moreToolsMenu
    );
    if (moreToolsMenu) moreToolsMenu.hidden = !canOpen;
    if (moreToolsTrigger) {
      moreToolsTrigger.setAttribute('aria-expanded', canOpen ? 'true' : 'false');
    }
    if (canOpen && options.focusFirst) {
      const focusFirst = () => getFocusableMenuItems()[0]?.focus();
      if (typeof view?.requestAnimationFrame === 'function') {
        requestFrame(focusFirst);
      } else {
        requestTimer(focusFirst, 0);
      }
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function isTabOverflowed(tab) {
    return overflowTargets.has(tab);
  }

  function updateNavigationState() {
    const isCondensed = Boolean(tabNav?.classList.contains('is-tools-condensed'));
    const hasActiveTool = isTabOverflowed(getActiveTab());
    if (moreToolsTrigger) {
      const isActive = isCondensed && hasActiveTool;
      moreToolsTrigger.classList.toggle('active', isActive);
      moreToolsTrigger.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    getMenuItems().forEach((item) => {
      const isActive = item.dataset.moreToolsTarget === getActiveTab();
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-checked', isActive ? 'true' : 'false');
      if (isActive) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
    if (!isCondensed) closeMenu();
  }

  function clearOverflowMarkers() {
    Array.from(tabNav.children).forEach((child) => {
      if (isHTMLElement(child)) child.removeAttribute('data-tab-overflow');
    });
  }

  function measureFit() {
    const navStyle = view.getComputedStyle(tabNav);
    const paddingLeft = Number.parseFloat(navStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(navStyle.paddingRight) || 0;
    const items = Array.from(tabNav.children).filter((child) => (
      isHTMLElement(child)
      && child !== tabIndicator
      && child !== moreTools
      && child.offsetParent !== null
    ));
    let minimumVisibleCount = 0;
    for (let index = 0; index < items.length; index += 1) {
      const target = items[index].dataset?.tabTarget;
      if (target && !protectedTargets.has(target)) break;
      minimumVisibleCount = index + 1;
    }
    return {
      items,
      minimumVisibleCount,
      gap: Number.parseFloat(navStyle.columnGap) || 0,
      widths: items.map((item) => item.getBoundingClientRect().width),
      triggerWidth: moreTools ? moreTools.getBoundingClientRect().width : 0,
      available: tabNav.clientWidth - paddingLeft - paddingRight,
    };
  }

  function applyOverflow(items, visibleCount) {
    const nextTargets = new Set();
    let focusEscaped = false;
    items.forEach((item, index) => {
      const target = item.dataset?.tabTarget;
      if (target && index >= visibleCount) {
        if (item === documentRef?.activeElement) focusEscaped = true;
        item.setAttribute('data-tab-overflow', '1');
        nextTargets.add(target);
      } else {
        item.removeAttribute('data-tab-overflow');
      }
    });
    tabNav.classList.toggle('is-tools-condensed', nextTargets.size > 0);
    getMenuItems().forEach((menuItem) => {
      menuItem.hidden = !nextTargets.has(menuItem.dataset.moreToolsTarget);
    });
    return { overflowTargets: nextTargets, focusEscaped };
  }

  function haveSameTargets(before, after) {
    if (before.size !== after.size) return false;
    return Array.from(before).every((target) => after.has(target));
  }

  function syncNavigation() {
    if (disposed || !tabNav || tabNav.hidden || tabNav.clientWidth <= 0) return false;
    const previousTargets = overflowTargets;
    tabNav.classList.add('is-measuring-full-tabs');
    clearOverflowMarkers();
    tabNav.getBoundingClientRect();
    const measurement = measureFit();
    const visibleCount = fitTabNavItems({
      ...measurement,
      previousVisibleCount: lastFit.itemCount === measurement.items.length
        ? lastFit.visibleCount
        : null,
      hysteresis: TAB_NAV_MODE_HYSTERESIS,
    });
    const applied = applyOverflow(measurement.items, visibleCount);
    tabNav.classList.remove('is-measuring-full-tabs');
    overflowTargets = applied.overflowTargets;
    lastFit = { itemCount: measurement.items.length, visibleCount };
    const overflowChanged = !haveSameTargets(previousTargets, applied.overflowTargets);
    if (overflowChanged) closeMenu();
    if (applied.focusEscaped) moreToolsTrigger?.focus?.({ preventScroll: true });
    updateNavigationState();
    return overflowChanged;
  }

  function positionActiveIndicator(options = {}) {
    if (disposed || !tabNav || !tabIndicator) return;
    const instant = Boolean(options?.instant);
    const activeButton = Array.from(tabNav.querySelectorAll('.tab-button.active'))
      .find((button) => isHTMLElement(button) && button.offsetParent !== null);
    if (!isHTMLElement(activeButton) || tabNav.hidden) {
      tabIndicator.classList.remove('is-ready');
      return;
    }
    const useLocalOffsets = activeButton.offsetParent === tabNav;
    const navRect = useLocalOffsets ? null : tabNav.getBoundingClientRect();
    const buttonRect = useLocalOffsets ? null : activeButton.getBoundingClientRect();
    const width = useLocalOffsets ? activeButton.offsetWidth : buttonRect.width;
    const height = useLocalOffsets ? activeButton.offsetHeight : buttonRect.height;
    if (
      !width
      || !height
      || (!useLocalOffsets && (!navRect.width || !navRect.height))
    ) {
      tabIndicator.classList.remove('is-ready');
      return;
    }
    const x = useLocalOffsets
      ? activeButton.offsetLeft
      : buttonRect.left - navRect.left + tabNav.scrollLeft;
    const y = useLocalOffsets
      ? activeButton.offsetTop
      : buttonRect.top - navRect.top + tabNav.scrollTop;
    if (instant) {
      tabIndicator.style.transition = 'none';
      tabIndicator.getBoundingClientRect();
    }
    tabIndicator.style.setProperty('--tab-indicator-x', `${x.toFixed(2)}px`);
    tabIndicator.style.setProperty('--tab-indicator-y', `${y.toFixed(2)}px`);
    tabIndicator.style.setProperty('--tab-indicator-width', `${width.toFixed(2)}px`);
    tabIndicator.style.setProperty('--tab-indicator-height', `${height.toFixed(2)}px`);
    tabIndicator.classList.add('is-ready');
    if (instant) {
      tabIndicator.getBoundingClientRect();
      if (typeof view?.requestAnimationFrame === 'function') {
        requestFrame(() => {
          tabIndicator.style.transition = '';
        });
      } else {
        tabIndicator.style.transition = '';
      }
    }
  }

  function runLayoutSync() {
    moreToolsSyncFrame = null;
    const navigationModeChanged = syncNavigation();
    if (tabIndicatorFrame) {
      cancelFrame(tabIndicatorFrame);
      tabIndicatorFrame = null;
    }
    positionActiveIndicator({
      instant: navigationModeChanged || getTabTransitionState() === 'idle',
    });
  }

  function queueLayoutSync(options = {}) {
    if (disposed || !tabNav) return;
    if (moreToolsSyncFrame) {
      cancelFrame(moreToolsSyncFrame);
      moreToolsSyncFrame = null;
    }
    if (options?.immediate || typeof view?.requestAnimationFrame !== 'function') {
      runLayoutSync();
      return;
    }
    moreToolsSyncFrame = requestFrame(runLayoutSync);
  }

  function queueIndicatorUpdate(options = {}) {
    if (disposed || !tabIndicator) return;
    const instant = Boolean(options?.instant);
    if (tabIndicatorFrame) cancelFrame(tabIndicatorFrame);
    if (typeof view?.requestAnimationFrame !== 'function') {
      positionActiveIndicator({ instant });
      return;
    }
    tabIndicatorFrame = requestFrame(() => {
      tabIndicatorFrame = null;
      positionActiveIndicator({ instant });
    });
  }

  function queueSettledIndicatorUpdate() {
    if (disposed) return;
    if (tabIndicatorFrame) {
      cancelFrame(tabIndicatorFrame);
      tabIndicatorFrame = null;
    }
    positionActiveIndicator({ instant: true });
    if (typeof view?.requestAnimationFrame === 'function') {
      requestFrame(() => {
        requestFrame(() => {
          queueIndicatorUpdate({ instant: true });
        });
      });
    }
    if (tabIndicatorSettleTimer) cancelTimer(tabIndicatorSettleTimer);
    tabIndicatorSettleTimer = requestTimer(() => {
      tabIndicatorSettleTimer = null;
      queueIndicatorUpdate({ instant: true });
    }, getIndicatorSettleDelay());
  }

  function syncAfterTabRender() {
    const navigationModeChanged = syncNavigation();
    if (navigationModeChanged) {
      queueSettledIndicatorUpdate();
    } else {
      queueIndicatorUpdate();
    }
  }

  function endViewportResizeSession() {
    viewportResizeTimer = null;
    app?.classList.remove('is-viewport-resizing');
  }

  function readViewportSignature() {
    if (!view) return '';
    const visual = view.visualViewport;
    return [
      view.innerWidth,
      view.innerHeight,
      visual ? Math.round(visual.width) : '',
      visual ? Math.round(visual.height) : '',
    ].join('x');
  }

  function handleViewportResize() {
    if (disposed || !view) return;
    const signature = readViewportSignature();
    const viewportChanged = signature !== lastViewportSignature;
    lastViewportSignature = signature;
    if (!viewportChanged) {
      queueLayoutSync();
      return;
    }
    app?.classList.add('is-viewport-resizing');
    if (viewportResizeTimer) cancelTimer(viewportResizeTimer);
    viewportResizeTimer = requestTimer(endViewportResizeSession, VIEWPORT_RESIZE_SETTLE_DELAY);
    queueLayoutSync({ immediate: true });
  }

  function handleMoreToolsTriggerClick() {
    setMenuOpen(moreToolsMenu?.hidden !== false);
  }

  function handleMoreToolsTriggerKeydown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setMenuOpen(true, { focusFirst: true });
  }

  function handleMoreToolsMenuClick(event) {
    const target = isElement(event.target)
      ? event.target.closest('[data-more-tools-target]')
      : null;
    if (!isHTMLElement(target)) return;
    const tabTarget = target.dataset.moreToolsTarget;
    closeMenu();
    onTabRequest(tabTarget);
  }

  function handleMoreToolsMenuKeydown(event) {
    const items = getFocusableMenuItems();
    const currentIndex = items.indexOf(documentRef?.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      moreToolsTrigger?.focus();
      return;
    }
    if (!items.length || currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function handleDocumentPointerDown(event) {
    if (!moreToolsMenu || moreToolsMenu.hidden) return;
    if (!isNode(event.target) || !moreTools?.contains(event.target)) closeMenu();
  }

  function handleDocumentKeydown(event) {
    if (event.key !== 'Escape' || moreToolsMenu?.hidden) return;
    closeMenu();
    moreToolsTrigger?.focus();
  }

  function initialize() {
    bind(moreToolsTrigger, 'click', handleMoreToolsTriggerClick);
    bind(moreToolsTrigger, 'keydown', handleMoreToolsTriggerKeydown);
    bind(moreToolsMenu, 'click', handleMoreToolsMenuClick);
    bind(moreToolsMenu, 'keydown', handleMoreToolsMenuKeydown);
    bind(documentRef, 'pointerdown', handleDocumentPointerDown);
    bind(documentRef, 'keydown', handleDocumentKeydown);
    if (view) {
      lastViewportSignature = readViewportSignature();
      bind(view, 'resize', handleViewportResize);
      bind(view.visualViewport, 'resize', handleViewportResize);
      bind(documentRef, 'fullscreenchange', handleViewportResize);
      bind(documentRef, 'webkitfullscreenchange', handleViewportResize);
      if (typeof ResizeObserverClass === 'function' && tabNav) {
        tabNavResizeObserver = new ResizeObserverClass(() => queueLayoutSync());
        tabNavResizeObserver.observe(tabNav);
      }
      queueLayoutSync();
    }
  }

  function dispose() {
    if (disposed) return;
    closeMenu();
    app?.classList.remove('is-viewport-resizing');
    tabNav?.classList.remove('is-measuring-full-tabs');
    if (tabIndicator) tabIndicator.style.transition = '';
    disposed = true;
    bindings.splice(0).forEach(([target, type, listener]) => {
      target.removeEventListener?.(type, listener);
    });
    tabNavResizeObserver?.disconnect?.();
    tabNavResizeObserver = null;
    scheduledFrames.forEach(({ id }) => view?.cancelAnimationFrame?.(id));
    scheduledFrames.clear();
    scheduledTimers.forEach(({ id }) => view?.clearTimeout?.(id));
    scheduledTimers.clear();
    moreToolsSyncFrame = null;
    tabIndicatorFrame = null;
    viewportResizeTimer = null;
    tabIndicatorSettleTimer = null;
  }

  initialize();

  return {
    syncAfterTabRender,
    queueLayoutSync,
    queueSettledIndicatorUpdate,
    closeMenu,
    isTabOverflowed,
    dispose,
  };
}
