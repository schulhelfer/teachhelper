const TUTORIAL_COMPLETED_STORAGE_KEY = 'teachhelper:first-run-tutorial-completed';
const TUTORIAL_RESUME_STEP_STORAGE_KEY = 'teachhelper:first-run-tutorial-resume-step';
const VIEWPORT_MARGIN = 14;
const TARGET_GAP = 14;
const REPOSITION_DELAY_MS = 460;
const REPOSITION_LONG_DELAY_MS = 1100;
const TARGET_RESOLVE_ATTEMPTS = 30;
const TARGET_RESOLVE_INTERVAL_MS = 50;
const TUTORIAL_MORPH_DURATION_MS = 600;

function readTutorialCompleted() {
  try {
    return window.localStorage?.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTutorialCompleted() {
  try {
    window.localStorage?.setItem(TUTORIAL_COMPLETED_STORAGE_KEY, '1');
  } catch {
    // The tutorial still works; it just cannot remember dismissal.
  }
}

function readResumeStep(maxStepIndex) {
  try {
    const raw = window.localStorage?.getItem(TUTORIAL_RESUME_STEP_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const parsed = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(parsed)) return null;
    return clamp(parsed, 0, Math.max(0, maxStepIndex));
  } catch {
    return null;
  }
}

function writeResumeStep(step) {
  try {
    window.localStorage?.setItem(TUTORIAL_RESUME_STEP_STORAGE_KEY, String(Math.max(0, step)));
  } catch {
    // Ignore storage errors; the visible resume button can still restart the tour.
  }
}

function clearResumeStep() {
  try {
    window.localStorage?.removeItem(TUTORIAL_RESUME_STEP_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

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
    button.title = ariaLabel;
  }
  return button;
}

export function createFirstRunTutorial({
  els = {},
  steps = [],
  getContextualSteps = () => [],
  getActiveTab = () => '',
  setActiveTab = () => {},
  prepareOverviewIntro = () => {},
  isChromeCollapsed = () => false,
  setChromeCollapsed = () => {},
} = {}) {
  const overviewSteps = Array.isArray(steps) ? steps : [];
  let activeSteps = overviewSteps;
  let activeTourKind = 'overview';
  let active = false;
  let stepIndex = 0;
  let previousTab = '';
  let previousChromeCollapsed = false;
  let repositionTimer = 0;
  let longRepositionTimer = 0;
  let positionTrackingCleanup = null;
  let completedInSession = readTutorialCompleted();
  let bubble = null;
  let highlight = null;
  let contentNode = null;
  let titleNode = null;
  let copyNode = null;
  let countNode = null;
  let prevButton = null;
  let nextButton = null;
  let endButton = null;
  let introDialog = null;
  let demoChoiceDialog = null;
  let sessionCleanup = null;
  let renderToken = 0;
  let stepTransitioning = false;
  let bubbleMotionAnimation = null;
  let contentAnimations = [];
  let contentGhost = null;

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

  const getCurrentStepCount = () => activeSteps.length;

  const getStoredResumeStep = () => readResumeStep(getCurrentStepCount() - 1) ?? 0;

  const hasTutorialCompleted = () => completedInSession || readTutorialCompleted();

  const rememberTutorialCompleted = () => {
    completedInSession = true;
    markTutorialCompleted();
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
    return { steps: overviewSteps };
  };

  const setStepSet = (nextSteps = overviewSteps) => {
    activeSteps = Array.isArray(nextSteps) && nextSteps.length ? nextSteps : overviewSteps;
  };

  const setChromeOnlyPresentation = (enabled) => {
    els.app?.classList?.toggle('tutorial-chrome-only', Boolean(enabled));
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

    endButton.addEventListener('click', () => finish({ persist: true, resumePrompt: true }));
    prevButton.addEventListener('click', goPrevious);
    nextButton.addEventListener('click', goNext);
    window.addEventListener('resize', positionCurrentStep);
    window.addEventListener('scroll', positionCurrentStep, true);
    window.visualViewport?.addEventListener('resize', positionCurrentStep);
    window.visualViewport?.addEventListener('scroll', positionCurrentStep);
    document.addEventListener('keydown', handleKeydown);
  };

  const removeIntroDialog = () => {
    if (!introDialog) return;
    if (introDialog.open) {
      introDialog.close();
    }
    introDialog.remove();
    introDialog = null;
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
      sessionCleanup = typeof result.cleanup === 'function'
        ? result.cleanup
        : (typeof definition.cleanup === 'function' ? definition.cleanup : sessionCleanup);
    } catch (error) {
      console.error(error);
      runSessionCleanup();
    }
  };

  const showDemoChoice = (definition) => {
    removeDemoChoiceDialog();
    demoChoiceDialog = document.createElement('dialog');
    demoChoiceDialog.className = 'tutorial-intro-dialog tutorial-demo-choice-dialog';
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
      try {
        const result = definition.demo.activate?.() || {};
        sessionCleanup = typeof result.cleanup === 'function' ? result.cleanup : definition.demo.cleanup;
        beginContextualSteps(result.steps || definition.demo.steps || definition.steps);
      } catch (error) {
        console.error(error);
        runSessionCleanup();
        beginContextualSteps(definition.steps);
      }
    });
    ownButton.addEventListener('click', () => {
      removeDemoChoiceDialog();
      activateContextualDefinition(definition);
      beginContextualSteps(definition.steps);
    });
    demoChoiceDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish({ persist: false });
    });
    actions.append(demoButton, ownButton);
    demoChoiceDialog.append(title, copy, actions);
    document.body.append(demoChoiceDialog);
    if (typeof demoChoiceDialog.showModal === 'function') demoChoiceDialog.showModal();
    else demoChoiceDialog.setAttribute('open', '');
    demoButton.focus({ preventScroll: true });
  };

  const beginTutorialSteps = () => {
    if (!active) return;
    removeIntroDialog();
    ensureNodes();
    renderStep();
    nextButton?.focus({ preventScroll: true });
  };

  const showIntroDialog = () => {
    removeIntroDialog();

    introDialog = document.createElement('dialog');
    introDialog.className = 'tutorial-intro-dialog';
    introDialog.setAttribute('aria-labelledby', 'tutorial-intro-title');
    introDialog.setAttribute('aria-describedby', 'tutorial-intro-copy');

    const icon = document.createElement('div');
    icon.className = 'tutorial-intro-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'ℹ️';

    const title = document.createElement('h2');
    title.id = 'tutorial-intro-title';
    title.textContent = 'Erste Schritte';

    const copy = document.createElement('p');
    copy.id = 'tutorial-intro-copy';
    copy.textContent = 'In der allgemeinen Einführung wird dir der TeachHelper im Überblick gezeigt.';

    const startButton = makeButton(
      'tutorial-intro-start-button',
      '➡️',
      'Allgemeine Einführung starten'
    );
    startButton.addEventListener('click', beginTutorialSteps);
    introDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish({ persist: true });
    });

    introDialog.append(icon, title, copy, startButton);
    document.body.append(introDialog);
    if (typeof introDialog.showModal === 'function') {
      introDialog.showModal();
    } else {
      introDialog.setAttribute('open', '');
    }
    startButton.focus({ preventScroll: true });
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

  function hideResumePrompt() {
    els.firstRunTutorialStart?.classList?.remove('has-tutorial-attention');
    setSidebarHelpButtonLabel('Tutorial starten');
  }

  function setSidebarHelpButtonLabel(label) {
    if (!els.firstRunTutorialStart) return;
    els.firstRunTutorialStart.setAttribute('aria-label', label);
    els.firstRunTutorialStart.dataset.tooltip = label;
    els.firstRunTutorialStart.removeAttribute('title');
  }

  function updateSidebarHelpButton(label) {
    if (!els.firstRunTutorialStart) return;
    els.firstRunTutorialStart.classList.add('has-tutorial-attention');
    setSidebarHelpButtonLabel(label);
  }

  function getActiveModuleName() {
    const activeTab = String(getActiveTab() || '');
    const tabButton = Array.from(els.tabNav?.querySelectorAll?.('[data-tab-target]') || [])
      .find((button) => button.dataset.tabTarget === activeTab);
    return tabButton?.textContent?.trim() || 'dieses Modul';
  }

  function showResumePrompt() {
    hideResumePrompt();
    updateSidebarHelpButton('Tutorial fortsetzen');
  }

  function showContextHelp() {
    if (!hasTutorialCompleted()) return;
    const resumeIndex = readResumeStep(overviewSteps.length - 1);
    if (resumeIndex !== null) {
      showResumePrompt();
      return;
    }
    hideResumePrompt();
    updateSidebarHelpButton(`Einführung für ${getActiveModuleName()}`);
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
    if (preferred && available[preferred] >= (preferred === 'left' || preferred === 'right' ? bubbleRect.width : bubbleRect.height) + TARGET_GAP) {
      return preferred;
    }
    return ['bottom', 'top', 'right', 'left']
      .sort((a, b) => available[b] - available[a])[0];
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

  function applyTargetPosition(target, preferredPlacement, anchor = 'center', offsetX = 0) {
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
    let top = rect.bottom + TARGET_GAP;
    if (placement === 'top') {
      top = rect.top - bubbleRect.height - TARGET_GAP;
    } else if (placement === 'left') {
      left = rect.left - bubbleRect.width - TARGET_GAP;
      top = rect.top + (rect.height - bubbleRect.height) / 2;
    } else if (placement === 'right') {
      left = rect.right + TARGET_GAP;
      top = rect.top + (rect.height - bubbleRect.height) / 2;
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

    const padding = 7;
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
    applyTargetPosition(resolveTarget(step), step?.placement, step?.anchor, step?.offsetX);
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
      finish({ persist: false });
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
    nextButton.title = nextButton.getAttribute('aria-label');
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
    setChromeOnlyPresentation(activeTourKind === 'overview' && step?.chromeOnly === true);
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
      finish({ persist: true });
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function handleKeydown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish({ persist: true });
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

  function start({
    force = false,
    resume = false,
    contextual = false,
    resumeSteps = null,
    resumeIndex = null,
    resumeKind = 'overview',
  } = {}) {
    if (!force && hasTutorialCompleted()) return false;
    if (active) {
      removeDemoChoiceDialog();
      runSessionCleanup();
    }
    let contextualDefinition = null;
    if (contextual) {
      contextualDefinition = resolveContextualDefinition();
      setStepSet(contextualDefinition.steps);
      activeTourKind = 'contextual';
    } else if (resumeSteps) {
      setStepSet(resumeSteps);
      activeTourKind = resumeKind;
    } else {
      setStepSet(overviewSteps);
      activeTourKind = 'overview';
    }
    if (!activeSteps.length) return false;
    hideResumePrompt();
    if (active) {
      stepIndex = resume ? clamp(resumeIndex ?? getStoredResumeStep(), 0, activeSteps.length - 1) : 0;
      renderStep();
      return true;
    }
    previousTab = getActiveTab();
    previousChromeCollapsed = isChromeCollapsed();
    active = true;
    stepIndex = resume ? clamp(resumeIndex ?? getStoredResumeStep(), 0, activeSteps.length - 1) : 0;
    if (activeTourKind === 'overview' && !resume) {
      setChromeOnlyPresentation(true);
      try {
        prepareOverviewIntro(els);
      } catch (error) {
        console.error(error);
      }
      showIntroDialog();
      return true;
    }
    if (contextualDefinition?.demo?.activate) {
      showDemoChoice(contextualDefinition);
      return true;
    }
    activateContextualDefinition(contextualDefinition);
    ensureNodes();
    renderStep();
    nextButton?.focus({ preventScroll: true });
    return true;
  }

  function finish({ persist = false, resumePrompt = false } = {}) {
    if (!active) return;
    const shouldShowResumePrompt = persist && resumePrompt;
    const resumeSteps = activeSteps.slice();
    const resumeIndex = stepIndex;
    const resumeKind = activeTourKind;
    if (persist) {
      rememberTutorialCompleted();
      if (shouldShowResumePrompt && resumeKind === 'overview') {
        writeResumeStep(stepIndex);
      } else {
        clearResumeStep();
      }
    }
    active = false;
    renderToken += 1;
    setChromeOnlyPresentation(false);
    removeIntroDialog();
    removeDemoChoiceDialog();
    removeNodes();
    runSessionCleanup();
    if (previousTab) {
      setActiveTab(previousTab);
    }
    if (isChromeCollapsed() !== previousChromeCollapsed) {
      setChromeCollapsed(previousChromeCollapsed);
    }
    if (shouldShowResumePrompt) {
      showResumePrompt({ resumeSteps, resumeIndex, resumeKind });
      return;
    }
    if (persist) {
      showContextHelp();
      return;
    }
    els.firstRunTutorialStart?.focus?.({ preventScroll: true });
  }

  els.firstRunTutorialStart?.addEventListener('click', () => {
    const resumeStep = readResumeStep(overviewSteps.length - 1);
    if (resumeStep !== null) {
      start({ force: true, resume: true, resumeIndex: resumeStep });
      return;
    }
    start({
      force: true,
      contextual: hasTutorialCompleted(),
    });
  });
  els.firstRunTutorialStart?.addEventListener('pointerenter', showContextHelp);
  els.firstRunTutorialStart?.addEventListener('focus', showContextHelp);

  window.addEventListener('pagehide', runSessionCleanup);
  window.addEventListener('beforeunload', runSessionCleanup);

  return {
    start,
    finish,
    showContextHelp,
    isActive: () => active,
    storageKey: TUTORIAL_COMPLETED_STORAGE_KEY,
    resumeStorageKey: TUTORIAL_RESUME_STEP_STORAGE_KEY,
  };
}
