const VIEWPORT_MARGIN = 14;
const TARGET_GAP = 14;
const REPOSITION_DELAY_MS = 460;
const REPOSITION_LONG_DELAY_MS = 1100;
const TARGET_RESOLVE_ATTEMPTS = 30;
const TARGET_RESOLVE_INTERVAL_MS = 50;
const TUTORIAL_MORPH_DURATION_MS = 600;
const TUTORIAL_STARTED_TABS_STORAGE_KEY = 'teachhelper:tutorial-started-tabs:v1';
const CONTEXT_HELP_PROMPT_DELAY_MS = 420;

function isHtmlElement(element) {
  return Boolean(
    element
    && element.nodeType === 1
    && typeof element.getBoundingClientRect === 'function'
  );
}

function isElementVisible(element) {
  if (!isHtmlElement(element)) return false;
  if (element.hidden) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const ownerWindow = element.ownerDocument?.defaultView || window;
  const style = ownerWindow.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function resolveFrameTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const frame = typeof target.frame === 'function' ? target.frame() : target.frame;
  if (!(frame instanceof HTMLIFrameElement) || !isElementVisible(frame)) {
    return null;
  }
  let frameDoc = null;
  try {
    frameDoc = frame.contentDocument;
  } catch {
    return null;
  }
  if (!frameDoc) return null;
  const selectors = Array.isArray(target.selector) ? target.selector : [target.selector];
  const element = selectors
    .map((selector) => (typeof selector === 'string' && selector ? frameDoc.querySelector(selector) : null))
    .find((candidate) => isElementVisible(candidate));
  if (!element) return null;
  return { element, frame };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getSafeViewportSize() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0,
    height: viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0,
    offsetLeft: viewport?.offsetLeft || 0,
    offsetTop: viewport?.offsetTop || 0,
  };
}

function makeButton(className, text, ariaLabel = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  if (ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
  return button;
}

export function createFirstRunTutorial({
  els = {},
  getContextualSteps = () => [],
  getActiveTab = () => '',
  setActiveTab = () => {},
  isChromeCollapsed = () => false,
  setChromeCollapsed = () => {},
  tooltipController = null,
} = {}) {
  let activeSteps = [];
  let active = false;
  let stepIndex = 0;
  let previousTab = '';
  let previousChromeCollapsed = false;
  let repositionTimer = 0;
  let longRepositionTimer = 0;
  let positionTrackingCleanup = null;
  let bubble = null;
  let highlight = null;
  let contentNode = null;
  let titleNode = null;
  let copyNode = null;
  let countNode = null;
  let prevButton = null;
  let nextButton = null;
  let endButton = null;
  let demoChoiceDialog = null;
  let sessionCleanup = null;
  let renderToken = 0;
  let stepTransitioning = false;
  let bubbleMotionAnimation = null;
  let contentAnimations = [];
  let contentGhost = null;
  let contextHelpPromptTimer = 0;

  function clearContextHelpPromptTimer() {
    if (!contextHelpPromptTimer) return;
    window.clearTimeout(contextHelpPromptTimer);
    contextHelpPromptTimer = 0;
  }

  function readStartedTabs() {
    try {
      const stored = window.localStorage?.getItem(TUTORIAL_STARTED_TABS_STORAGE_KEY);
      const values = JSON.parse(stored || '[]');
      return new Set(Array.isArray(values) ? values.filter((tab) => typeof tab === 'string' && tab) : []);
    } catch {
      return new Set();
    }
  }

  const startedTabs = readStartedTabs();

  function markActiveTabStarted() {
    clearContextHelpPromptTimer();
    els.firstRunTutorialStart?.classList.remove('tutorial-attention-pulse');
    tooltipController?.hide?.();
    const tab = String(getActiveTab() || '');
    if (!tab || startedTabs.has(tab)) return;
    startedTabs.add(tab);
    try {
      window.localStorage?.setItem(TUTORIAL_STARTED_TABS_STORAGE_KEY, JSON.stringify([...startedTabs]));
    } catch {
      
    }
  }

  const clearRepositionTimer = () => {
    if (!repositionTimer) return;
    window.clearTimeout(repositionTimer);
    repositionTimer = 0;
  };

  const clearLongRepositionTimer = () => {
    if (!longRepositionTimer) return;
    window.clearTimeout(longRepositionTimer);
    longRepositionTimer = 0;
  };

  const clearPositionTracking = () => {
    const cleanup = positionTrackingCleanup;
    positionTrackingCleanup = null;
    try { cleanup?.(); } catch (error) { console.error(error); }
  };

  const resolveTarget = (step) => {
    if (!step) return null;
    const target = typeof step.target === 'function'
      ? step.target(els)
      : step.target;
    const frameTarget = resolveFrameTarget(target);
    if (frameTarget) {
      return frameTarget;
    }
    if (target && typeof target === 'object' && !(target instanceof HTMLElement) && target.fallback) {
      return typeof target.fallback === 'function' ? target.fallback(els) : target.fallback;
    }
    return target || null;
  };

  const resolveContextualDefinition = () => {
    const definition = typeof getContextualSteps === 'function'
      ? getContextualSteps({
        els,
        activeTab: getActiveTab(),
      })
      : [];
    if (Array.isArray(definition)) return { steps: definition };
    if (definition && typeof definition === 'object') return definition;
    return { steps: [] };
  };

  const setStepSet = (nextSteps = []) => {
    activeSteps = Array.isArray(nextSteps) ? nextSteps : [];
  };

  const clearMorphArtifacts = () => {
    bubbleMotionAnimation?.cancel?.();
    bubbleMotionAnimation = null;
    contentAnimations.forEach((animation) => animation?.cancel?.());
    contentAnimations = [];
    contentGhost?.remove?.();
    contentGhost = null;
    if (contentNode) contentNode.style.opacity = '';
    if (bubble) {
      bubble.style.transformOrigin = '';
      bubble.removeAttribute('aria-busy');
    }
  };

  const setStepNavigationBusy = (busy) => {
    stepTransitioning = busy;
    if (prevButton) {
      prevButton.disabled = busy || stepIndex === 0;
      prevButton.setAttribute('aria-disabled', prevButton.disabled ? 'true' : 'false');
    }
    if (nextButton) {
      nextButton.disabled = busy;
      nextButton.setAttribute('aria-disabled', busy ? 'true' : 'false');
    }
    if (bubble) {
      if (busy) bubble.setAttribute('aria-busy', 'true');
      else bubble.removeAttribute('aria-busy');
    }
  };

  const ensureNodes = () => {
    if (bubble && highlight) return;

    highlight = document.createElement('div');
    highlight.className = 'tutorial-highlight';
    highlight.setAttribute('aria-hidden', 'true');

    bubble = document.createElement('section');
    bubble.className = 'tutorial-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-live', 'polite');
    bubble.setAttribute('aria-modal', 'false');

    endButton = makeButton('tutorial-close-button', '❌', 'Tutorial beenden');

    titleNode = document.createElement('h2');
    titleNode.className = 'tutorial-title';

    copyNode = document.createElement('p');
    copyNode.className = 'tutorial-copy';

    contentNode = document.createElement('div');
    contentNode.className = 'tutorial-content';
    contentNode.append(titleNode, copyNode);

    const actions = document.createElement('div');
    actions.className = 'tutorial-actions';

    countNode = document.createElement('span');
    countNode.className = 'tutorial-count';

    prevButton = makeButton('tutorial-prev-button', '⬅️', 'Vorheriger Tipp');
    nextButton = makeButton('tutorial-next-button', '➡️', 'Nächster Tipp');

    actions.append(prevButton, countNode, nextButton);
    bubble.append(endButton, contentNode, actions);
    document.body.append(highlight, bubble);

    endButton.addEventListener('click', finish);
    prevButton.addEventListener('click', goPrevious);
    nextButton.addEventListener('click', goNext);
    window.addEventListener('resize', positionCurrentStep);
    window.addEventListener('scroll', positionCurrentStep, true);
    window.visualViewport?.addEventListener('resize', positionCurrentStep);
    window.visualViewport?.addEventListener('scroll', positionCurrentStep);
    document.addEventListener('keydown', handleKeydown);
  };

  const removeDemoChoiceDialog = () => {
    if (!demoChoiceDialog) return;
    if (demoChoiceDialog.open && typeof demoChoiceDialog.close === 'function') demoChoiceDialog.close();
    demoChoiceDialog.remove();
    demoChoiceDialog = null;
  };

  const runSessionCleanup = () => {
    const cleanup = sessionCleanup;
    sessionCleanup = null;
    try { cleanup?.(); } catch (error) { console.error(error); }
  };

  const beginContextualSteps = (nextSteps) => {
    setStepSet(nextSteps);
    ensureNodes();
    renderStep();
    nextButton?.focus({ preventScroll: true });
  };

  const activateContextualDefinition = (definition) => {
    if (typeof definition?.activate !== 'function') return;
    try {
      const result = definition.activate() || {};
      if (Array.isArray(result.steps)) {
        setStepSet(result.steps);
      }
      sessionCleanup = typeof result.cleanup === 'function'
        ? result.cleanup
        : (typeof definition.cleanup === 'function' ? definition.cleanup : sessionCleanup);
    } catch (error) {
      console.error(error);
      runSessionCleanup();
    }
  };

  const activateDemoDefinition = (definition) => {
    try {
      const result = definition.demo.activate?.() || {};
      sessionCleanup = typeof result.cleanup === 'function' ? result.cleanup : definition.demo.cleanup;
      setStepSet(result.steps || definition.demo.steps || definition.steps);
      return true;
    } catch (error) {
      console.error(error);
      runSessionCleanup();
      setStepSet(definition.steps);
      return false;
    }
  };

  const showDemoChoice = (definition) => {
    removeDemoChoiceDialog();
    demoChoiceDialog = document.createElement('dialog');
    demoChoiceDialog.className = 'tutorial-demo-choice-dialog';
    const title = document.createElement('h2');
    title.textContent = 'Tutorial starten';
    const copy = document.createElement('p');
    copy.textContent = 'Für die vollständige Einführung fehlen noch Daten. Die Beispieldaten laufen nur für dieses Tutorial in einer isolierten Vorschau: Sie werden nicht gespeichert und überschreiben keine eigenen Daten.';
    const actions = document.createElement('div');
    actions.className = 'tutorial-demo-choice-actions';
    const demoButton = makeButton('tutorial-demo-choice-button', 'Mit Beispieldaten ansehen');
    const ownButton = makeButton('tutorial-demo-own-button', 'Mit eigenen Daten fortfahren');
    demoButton.addEventListener('click', () => {
      removeDemoChoiceDialog();
      activateDemoDefinition(definition);
      beginContextualSteps(activeSteps);
    });
    ownButton.addEventListener('click', () => {
      removeDemoChoiceDialog();
      activateContextualDefinition(definition);
      beginContextualSteps(definition.steps);
    });
    demoChoiceDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish();
    });
    actions.append(demoButton, ownButton);
    demoChoiceDialog.append(title, copy, actions);
    document.body.append(demoChoiceDialog);
    if (typeof demoChoiceDialog.showModal === 'function') demoChoiceDialog.showModal();
    else demoChoiceDialog.setAttribute('open', '');
    demoButton.focus({ preventScroll: true });
  };

  const removeNodes = () => {
    clearRepositionTimer();
    clearLongRepositionTimer();
    clearPositionTracking();
    window.removeEventListener('resize', positionCurrentStep);
    window.removeEventListener('scroll', positionCurrentStep, true);
    window.visualViewport?.removeEventListener('resize', positionCurrentStep);
    window.visualViewport?.removeEventListener('scroll', positionCurrentStep);
    document.removeEventListener('keydown', handleKeydown);
    clearMorphArtifacts();
    stepTransitioning = false;
    bubble?.remove();
    highlight?.remove();
    bubble = null;
    highlight = null;
    contentNode = null;
    titleNode = null;
    copyNode = null;
    countNode = null;
    prevButton = null;
    nextButton = null;
    endButton = null;
  };

  function setSidebarHelpButtonLabel(label) {
    if (!els.firstRunTutorialStart) return;
    els.firstRunTutorialStart.setAttribute('aria-label', label);
    els.firstRunTutorialStart.dataset.tooltip = label;
    els.firstRunTutorialStart.removeAttribute('title');
  }

  function getActiveModuleName() {
    const activeTab = String(getActiveTab() || '');
    const tabButton = Array.from(els.tabNav?.querySelectorAll?.('[data-tab-target]') || [])
      .find((button) => button.dataset.tabTarget === activeTab);
    return tabButton?.textContent?.trim() || 'dieses Modul';
  }

  function showContextHelp({ prompt = false } = {}) {
    setSidebarHelpButtonLabel(`Tutorial für das Modul ${getActiveModuleName()}`);
    const activeTab = String(getActiveTab() || '');
    if (!prompt || active || !activeTab || startedTabs.has(activeTab)) return;
    clearContextHelpPromptTimer();
    els.firstRunTutorialStart?.classList.add('tutorial-attention-pulse');
    contextHelpPromptTimer = window.setTimeout(() => {
      contextHelpPromptTimer = 0;
      if (active || getActiveTab() !== activeTab || startedTabs.has(activeTab)) {
        els.firstRunTutorialStart?.classList.remove('tutorial-attention-pulse');
        return;
      }
      tooltipController?.show?.(els.firstRunTutorialStart, {
        persistUntilInteraction: true,
        onHide: () => els.firstRunTutorialStart?.classList.remove('tutorial-attention-pulse'),
      });
    }, CONTEXT_HELP_PROMPT_DELAY_MS);
  }

  function choosePlacement(rect, bubbleRect, preferredPlacement) {
    const viewport = getSafeViewportSize();
    const available = {
      top: rect.top - viewport.offsetTop,
      bottom: viewport.offsetTop + viewport.height - rect.bottom,
      left: rect.left - viewport.offsetLeft,
      right: viewport.offsetLeft + viewport.width - rect.right,
    };
    const preferred = ['top', 'bottom', 'left', 'right'].includes(preferredPlacement)
      ? preferredPlacement
      : '';
    const fitsPlacement = (placement) => {
      const requiredSize = placement === 'left' || placement === 'right'
        ? bubbleRect.width
        : bubbleRect.height;
      return available[placement] >= requiredSize + TARGET_GAP + VIEWPORT_MARGIN;
    };
    if (preferred && fitsPlacement(preferred)) {
      return preferred;
    }
    const fallback = ['bottom', 'top', 'right', 'left']
      .sort((a, b) => available[b] - available[a])
      .find((placement) => fitsPlacement(placement));
    return fallback || 'center';
  }

  function applyFallbackPosition() {
    if (!bubble || !highlight) return;
    const viewport = getSafeViewportSize();
    const bubbleRect = bubble.getBoundingClientRect();
    const left = viewport.offsetLeft + clamp(
      (viewport.width - bubbleRect.width) / 2,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewport.width - bubbleRect.width - VIEWPORT_MARGIN)
    );
    const top = viewport.offsetTop + clamp(
      (viewport.height - bubbleRect.height) / 2,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewport.height - bubbleRect.height - VIEWPORT_MARGIN)
    );
    bubble.dataset.placement = 'center';
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.setProperty('--tutorial-arrow-left', '50%');
    bubble.style.setProperty('--tutorial-arrow-top', '50%');
    highlight.hidden = true;
  }

  function getTargetRect(target) {
    if (isHtmlElement(target?.element) && target?.frame instanceof HTMLIFrameElement) {
      const frameRect = target.frame.getBoundingClientRect();
      const elementRect = target.element.getBoundingClientRect();
      const frameWidth = target.frame.offsetWidth || frameRect.width || 1;
      const frameHeight = target.frame.offsetHeight || frameRect.height || 1;
      const scaleX = frameRect.width / frameWidth;
      const scaleY = frameRect.height / frameHeight;
      const contentLeft = frameRect.left + (target.frame.clientLeft || 0) * scaleX;
      const contentTop = frameRect.top + (target.frame.clientTop || 0) * scaleY;
      const left = contentLeft + elementRect.left * scaleX;
      const top = contentTop + elementRect.top * scaleY;
      const width = elementRect.width * scaleX;
      const height = elementRect.height * scaleY;
      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
      };
    }
    if (isElementVisible(target)) {
      return target.getBoundingClientRect();
    }
    return null;
  }

  function revealTarget(target) {
    if (isHtmlElement(target?.element) && target?.frame instanceof HTMLIFrameElement) {
      const elementRect = target.element.getBoundingClientRect();
      const frameWindow = target.frame.contentWindow;
      const viewportWidth = frameWindow?.innerWidth || target.frame.clientWidth || 0;
      const viewportHeight = frameWindow?.innerHeight || target.frame.clientHeight || 0;
      const isOutsideViewport = elementRect.top < 0
        || elementRect.left < 0
        || elementRect.bottom > viewportHeight
        || elementRect.right > viewportWidth;
      if (isOutsideViewport) {
        target.element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      return;
    }
    if (!isHtmlElement(target)) return;
    const rect = target.getBoundingClientRect();
    const viewport = getSafeViewportSize();
    const viewportRight = viewport.offsetLeft + viewport.width;
    const viewportBottom = viewport.offsetTop + viewport.height;
    const isOutsideViewport = rect.top < viewport.offsetTop
      || rect.left < viewport.offsetLeft
      || rect.bottom > viewportBottom
      || rect.right > viewportRight;
    if (isOutsideViewport) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }
  }

  function applyTargetPosition(target, preferredPlacement, anchor = 'center', offsetX = 0, offsetY = 0, highlightPadding = 7) {
    if (!bubble || !highlight) return;
    revealTarget(target);
    const rect = getTargetRect(target);
    if (!rect) {
      applyFallbackPosition();
      return;
    }

    const viewport = getSafeViewportSize();
    const bubbleRect = bubble.getBoundingClientRect();
    const placement = choosePlacement(rect, bubbleRect, preferredPlacement);
    const minLeft = viewport.offsetLeft + VIEWPORT_MARGIN;
    const maxLeft = viewport.offsetLeft + viewport.width - bubbleRect.width - VIEWPORT_MARGIN;
    const minTop = viewport.offsetTop + VIEWPORT_MARGIN;
    const maxTop = viewport.offsetTop + viewport.height - bubbleRect.height - VIEWPORT_MARGIN;

    let left = anchor === 'start'
      ? rect.left + offsetX
      : rect.left + (rect.width - bubbleRect.width) / 2 + offsetX;
    let top = rect.bottom + TARGET_GAP + offsetY;
    if (placement === 'center') {
      left = viewport.offsetLeft + (viewport.width - bubbleRect.width) / 2;
      top = viewport.offsetTop + (viewport.height - bubbleRect.height) / 2;
    } else if (placement === 'top') {
      top = rect.top - bubbleRect.height - TARGET_GAP + offsetY;
    } else if (placement === 'left') {
      left = rect.left - bubbleRect.width - TARGET_GAP;
      top = rect.top + (rect.height - bubbleRect.height) / 2 + offsetY;
    } else if (placement === 'right') {
      left = rect.right + TARGET_GAP;
      top = rect.top + (rect.height - bubbleRect.height) / 2 + offsetY;
    }

    left = clamp(left, minLeft, Math.max(minLeft, maxLeft));
    top = clamp(top, minTop, Math.max(minTop, maxTop));

    const targetCenterX = anchor === 'start'
      ? rect.left + 18
      : rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const arrowLeft = clamp(targetCenterX - left, 18, bubbleRect.width - 18);
    const arrowTop = clamp(targetCenterY - top, 18, bubbleRect.height - 18);

    bubble.dataset.placement = placement;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.setProperty('--tutorial-arrow-left', `${Math.round(arrowLeft)}px`);
    bubble.style.setProperty('--tutorial-arrow-top', `${Math.round(arrowTop)}px`);

    const padding = Number.isFinite(Number(highlightPadding)) ? Number(highlightPadding) : 7;
    highlight.hidden = false;
    highlight.style.left = `${Math.round(rect.left - padding)}px`;
    highlight.style.top = `${Math.round(rect.top - padding)}px`;
    highlight.style.width = `${Math.round(rect.width + padding * 2)}px`;
    highlight.style.height = `${Math.round(rect.height + padding * 2)}px`;
    highlight.style.borderRadius = `${Math.min(22, Math.max(12, rect.height / 3))}px`;
  }

  function positionCurrentStep() {
    if (!active || !bubble) return;
    const step = activeSteps[stepIndex];
    applyTargetPosition(
      resolveTarget(step),
      step?.placement,
      step?.anchor,
      step?.offsetX,
      step?.offsetY,
      step?.highlightPadding
    );
  }

  function trackCurrentTarget() {
    clearPositionTracking();
    if (!active || !bubble) return;
    const target = resolveTarget(activeSteps[stepIndex]);
    const cleanups = [];
    const reposition = () => positionCurrentStep();
    if (isHtmlElement(target?.element) && target?.frame instanceof HTMLIFrameElement) {
      const frameDocument = target.element.ownerDocument;
      const frameWindow = frameDocument?.defaultView;
      frameDocument?.addEventListener('scroll', reposition, true);
      frameWindow?.addEventListener('resize', reposition);
      cleanups.push(() => frameDocument?.removeEventListener('scroll', reposition, true));
      cleanups.push(() => frameWindow?.removeEventListener('resize', reposition));
      if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver(reposition);
        try {
          resizeObserver.observe(target.frame);
          resizeObserver.observe(target.element);
          cleanups.push(() => resizeObserver.disconnect());
        } catch (_error) {
          resizeObserver.disconnect();
        }
      }
      if (typeof MutationObserver === 'function' && frameDocument?.body) {
        const mutationObserver = new MutationObserver(reposition);
        mutationObserver.observe(frameDocument.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'hidden', 'style'],
        });
        cleanups.push(() => mutationObserver.disconnect());
      }
    } else if (isHtmlElement(target) && typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(reposition);
      resizeObserver.observe(target);
      cleanups.push(() => resizeObserver.disconnect());
      if (typeof MutationObserver === 'function' && target.parentElement) {
        const mutationObserver = new MutationObserver(reposition);
        mutationObserver.observe(target.parentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'hidden', 'style'],
        });
        cleanups.push(() => mutationObserver.disconnect());
      }
    }
    positionTrackingCleanup = () => cleanups.forEach((cleanup) => cleanup());
  }

  function schedulePositionRefresh() {
    clearRepositionTimer();
    clearLongRepositionTimer();
    positionCurrentStep();
    trackCurrentTarget();
    repositionTimer = window.setTimeout(() => {
      positionCurrentStep();
      trackCurrentTarget();
    }, REPOSITION_DELAY_MS);
    longRepositionTimer = window.setTimeout(() => {
      positionCurrentStep();
      trackCurrentTarget();
    }, REPOSITION_LONG_DELAY_MS);
  }

  function waitForStepTarget(step, currentRenderToken, attempts = TARGET_RESOLVE_ATTEMPTS) {
    return new Promise((resolve) => {
      const check = (remainingAttempts) => {
        if (!active || currentRenderToken !== renderToken) {
          resolve(null);
          return;
        }
        const target = resolveTarget(step);
        if (getTargetRect(target)) {
          resolve(target);
          return;
        }
        if (remainingAttempts <= 0) {
          resolve(null);
          return;
        }
        window.setTimeout(() => check(remainingAttempts - 1), TARGET_RESOLVE_INTERVAL_MS);
      };
      check(attempts);
    });
  }

  function removeUnavailableStep(currentRenderToken) {
    if (!active || currentRenderToken !== renderToken) return;
    activeSteps.splice(stepIndex, 1);
    if (!activeSteps.length) {
      finish();
      return;
    }
    stepIndex = Math.min(stepIndex, activeSteps.length - 1);
    renderStep();
  }

  function updateStepContent(step) {
    titleNode.textContent = step.title || '';
    copyNode.textContent = step.copy || '';
    countNode.textContent = `${stepIndex + 1}/${activeSteps.length}`;
    nextButton.textContent = '➡️';
    nextButton.setAttribute(
      'aria-label',
      stepIndex === activeSteps.length - 1 ? 'Tutorial abschließen' : 'Nächster Tipp'
    );
  }

  function completeStepTransition(currentRenderToken) {
    if (!active || currentRenderToken !== renderToken) return;
    clearMorphArtifacts();
    setStepNavigationBusy(false);
    nextButton?.focus({ preventScroll: true });
  }

  function morphToPreparedStep(previousRect, previousContent, currentRenderToken) {
    bubble.hidden = false;
    positionCurrentStep();
    const nextRect = bubble.getBoundingClientRect();
    bubble.dataset.rendered = 'true';
    schedulePositionRefresh();

    const canMorph = previousRect
      && previousRect.width > 0
      && previousRect.height > 0
      && nextRect.width > 0
      && nextRect.height > 0
      && typeof bubble.animate === 'function';
    if (!canMorph) {
      completeStepTransition(currentRenderToken);
      return;
    }

    const scaleX = previousRect.width / nextRect.width;
    const scaleY = previousRect.height / nextRect.height;
    const middleLeft = previousRect.left + (nextRect.left - previousRect.left) * 0.55;
    const middleTop = previousRect.top + (nextRect.top - previousRect.top) * 0.55 - 10;
    const middleScaleX = scaleX + (1 - scaleX) * 0.55;
    const middleScaleY = scaleY + (1 - scaleY) * 0.55;
    bubble.style.transformOrigin = 'top left';
    bubble.style.animation = 'none';
    contentNode.style.opacity = '0';

    if (previousContent) {
      contentGhost = previousContent;
      contentGhost.classList.add('tutorial-content-ghost');
      contentGhost.setAttribute('aria-hidden', 'true');
      bubble.append(contentGhost);
    }

    const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    bubbleMotionAnimation = bubble.animate([
      {
        left: `${previousRect.left}px`,
        top: `${previousRect.top}px`,
        transform: `scale(${scaleX}, ${scaleY})`,
      },
      {
        left: `${middleLeft}px`,
        top: `${middleTop}px`,
        transform: `scale(${middleScaleX}, ${middleScaleY})`,
        offset: 0.55,
      },
      {
        left: `${nextRect.left}px`,
        top: `${nextRect.top}px`,
        transform: 'scale(1, 1)',
      },
    ], {
      duration: TUTORIAL_MORPH_DURATION_MS,
      easing,
      fill: 'both',
    });

    if (contentGhost?.animate) {
      contentAnimations.push(contentGhost.animate([
        { opacity: 1 },
        { opacity: 0 },
      ], {
        duration: 140,
        easing: 'ease-out',
        fill: 'forwards',
      }));
    }
    contentAnimations.push(contentNode.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], {
      duration: 160,
      delay: 80,
      easing: 'ease-out',
      fill: 'forwards',
    }));

    Promise.allSettled([
      bubbleMotionAnimation.finished,
      ...contentAnimations.map((animation) => animation.finished),
    ]).then(() => completeStepTransition(currentRenderToken));
  }

  function renderStep() {
    if (!active || !bubble || !activeSteps.length) return;
    const step = activeSteps[stepIndex];
    const hadRenderedStep = bubble.dataset.rendered === 'true' && !bubble.hidden;
    const previousRect = hadRenderedStep ? bubble.getBoundingClientRect() : null;
    const previousContent = hadRenderedStep ? contentNode.cloneNode(true) : null;
    clearMorphArtifacts();
    setStepNavigationBusy(true);
    clearPositionTracking();
    if (step?.tab) {
      setActiveTab(step.tab);
    }
    if (step?.expandChrome && isChromeCollapsed()) {
      setChromeCollapsed(false);
    }
    const currentRenderToken = ++renderToken;
    let preparation = null;
    if (typeof step?.beforeRender === 'function') {
      try {
        preparation = step.beforeRender(els);
      } catch (error) {
        console.error(error);
      }
    }
    const skipIfMissing = step?.skipIfMissing === true;
    if (!hadRenderedStep) bubble.hidden = skipIfMissing;
    highlight.hidden = true;

    const showPreparedStep = async () => {
      try {
        await Promise.resolve(preparation);
      } catch (error) {
        console.error(error);
      }
      if (!active || currentRenderToken !== renderToken) return;
      if (skipIfMissing) {
        const target = await waitForStepTarget(step, currentRenderToken);
        if (!active || currentRenderToken !== renderToken) return;
        if (!target) {
          removeUnavailableStep(currentRenderToken);
          return;
        }
      }
      updateStepContent(step);
      morphToPreparedStep(previousRect, previousContent, currentRenderToken);
    };

    void showPreparedStep();
  }

  function goPrevious() {
    if (!active || stepTransitioning || stepIndex <= 0) return;
    stepIndex -= 1;
    renderStep();
  }

  function goNext() {
    if (!active || stepTransitioning) return;
    if (stepIndex >= activeSteps.length - 1) {
      finish();
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function handleKeydown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Enter') {
      if (document.activeElement === endButton || document.activeElement === prevButton) return;
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevious();
    }
  }

  function start() {
    if (active) {
      removeDemoChoiceDialog();
      runSessionCleanup();
    }
    const contextualDefinition = resolveContextualDefinition();
    setStepSet(contextualDefinition.steps);
    if (!activeSteps.length) return false;
    if (active) {
      stepIndex = 0;
      renderStep();
      return true;
    }
    previousTab = getActiveTab();
    previousChromeCollapsed = isChromeCollapsed();
    active = true;
    stepIndex = 0;
    if (contextualDefinition?.demo?.activate) {
      if (contextualDefinition.demo.auto) {
        activateDemoDefinition(contextualDefinition);
        ensureNodes();
        renderStep();
        nextButton?.focus({ preventScroll: true });
        return true;
      }
      showDemoChoice(contextualDefinition);
      return true;
    }
    activateContextualDefinition(contextualDefinition);
    ensureNodes();
    renderStep();
    nextButton?.focus({ preventScroll: true });
    return true;
  }

  function finish() {
    if (!active) return;
    active = false;
    renderToken += 1;
    removeDemoChoiceDialog();
    removeNodes();
    runSessionCleanup();
    if (previousTab) {
      setActiveTab(previousTab);
    }
    if (isChromeCollapsed() !== previousChromeCollapsed) {
      setChromeCollapsed(previousChromeCollapsed);
    }
    showContextHelp();
    els.firstRunTutorialStart?.blur?.();
  }

  function startFromEntry() {
    markActiveTabStarted();
    start();
  }

  els.firstRunTutorialStart?.addEventListener('click', () => {
    startFromEntry();
  });
  els.firstRunTutorialStart?.addEventListener('pointerenter', showContextHelp);
  els.firstRunTutorialStart?.addEventListener('focus', showContextHelp);

  window.addEventListener('pagehide', runSessionCleanup);
  window.addEventListener('beforeunload', runSessionCleanup);

  return {
    start,
    startFromEntry,
    finish,
    showContextHelp,
    clearContextHelpPrompt: () => {
      clearContextHelpPromptTimer();
      els.firstRunTutorialStart?.classList.remove('tutorial-attention-pulse');
      tooltipController?.hide?.();
    },
    isActive: () => active,
  };
}
