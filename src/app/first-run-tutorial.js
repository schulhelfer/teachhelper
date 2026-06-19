const TUTORIAL_COMPLETED_STORAGE_KEY = 'teachhelper:first-run-tutorial-completed';
const TUTORIAL_RESUME_STEP_STORAGE_KEY = 'teachhelper:first-run-tutorial-resume-step';
const VIEWPORT_MARGIN = 14;
const TARGET_GAP = 14;
const REPOSITION_DELAY_MS = 460;
const REPOSITION_LONG_DELAY_MS = 1100;

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
  let completedInSession = readTutorialCompleted();
  let bubble = null;
  let highlight = null;
  let titleNode = null;
  let copyNode = null;
  let countNode = null;
  let prevButton = null;
  let nextButton = null;
  let endButton = null;
  let introDialog = null;

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

  const resolveContextualSteps = () => {
    const nextSteps = typeof getContextualSteps === 'function'
      ? getContextualSteps({
        els,
        activeTab: getActiveTab(),
      })
      : [];
    return Array.isArray(nextSteps) && nextSteps.length ? nextSteps : overviewSteps;
  };

  const setStepSet = (nextSteps = overviewSteps) => {
    activeSteps = Array.isArray(nextSteps) && nextSteps.length ? nextSteps : overviewSteps;
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

    const actions = document.createElement('div');
    actions.className = 'tutorial-actions';

    countNode = document.createElement('span');
    countNode.className = 'tutorial-count';

    prevButton = makeButton('tutorial-prev-button', '⬅️', 'Vorheriger Tipp');
    nextButton = makeButton('tutorial-next-button', '➡️', 'Nächster Tipp');

    actions.append(prevButton, countNode, nextButton);
    bubble.append(endButton, titleNode, copyNode, actions);
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
    window.removeEventListener('resize', positionCurrentStep);
    window.removeEventListener('scroll', positionCurrentStep, true);
    window.visualViewport?.removeEventListener('resize', positionCurrentStep);
    window.visualViewport?.removeEventListener('scroll', positionCurrentStep);
    document.removeEventListener('keydown', handleKeydown);
    bubble?.remove();
    highlight?.remove();
    bubble = null;
    highlight = null;
    titleNode = null;
    copyNode = null;
    countNode = null;
    prevButton = null;
    nextButton = null;
    endButton = null;
  };

  function hideResumePrompt() {
    els.firstRunTutorialStart?.classList?.remove('has-tutorial-attention');
    els.firstRunTutorialStart?.setAttribute?.('aria-label', 'Tutorial starten');
    if (els.firstRunTutorialStart) {
      els.firstRunTutorialStart.title = 'Tutorial starten';
    }
  }

  function updateSidebarHelpButton(label) {
    if (!els.firstRunTutorialStart) return;
    els.firstRunTutorialStart.classList.add('has-tutorial-attention');
    els.firstRunTutorialStart.setAttribute('aria-label', label);
    els.firstRunTutorialStart.title = label;
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
    updateSidebarHelpButton('Einführung für aktuelles Modul');
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
      const frameWidth = target.frame.clientWidth || frameRect.width || 1;
      const frameHeight = target.frame.clientHeight || frameRect.height || 1;
      const scaleX = frameRect.width / frameWidth;
      const scaleY = frameRect.height / frameHeight;
      const left = frameRect.left + elementRect.left * scaleX;
      const top = frameRect.top + elementRect.top * scaleY;
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
      const isOutsideViewport = elementRect.bottom < 0
        || elementRect.right < 0
        || elementRect.top > viewportHeight
        || elementRect.left > viewportWidth;
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
    const isOutsideViewport = rect.bottom < viewport.offsetTop
      || rect.right < viewport.offsetLeft
      || rect.top > viewportBottom
      || rect.left > viewportRight;
    if (isOutsideViewport) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }
  }

  function applyTargetPosition(target, preferredPlacement) {
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

    let left = rect.left + (rect.width - bubbleRect.width) / 2;
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

    const targetCenterX = rect.left + rect.width / 2;
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
    applyTargetPosition(resolveTarget(step), step?.placement);
  }

  function schedulePositionRefresh() {
    clearRepositionTimer();
    clearLongRepositionTimer();
    positionCurrentStep();
    repositionTimer = window.setTimeout(positionCurrentStep, REPOSITION_DELAY_MS);
    longRepositionTimer = window.setTimeout(positionCurrentStep, REPOSITION_LONG_DELAY_MS);
  }

  function renderStep() {
    if (!active || !bubble || !activeSteps.length) return;
    const step = activeSteps[stepIndex];
    if (step?.tab) {
      setActiveTab(step.tab);
    }
    if (step?.expandChrome && isChromeCollapsed()) {
      setChromeCollapsed(false);
    }
    if (typeof step?.beforeRender === 'function') {
      step.beforeRender(els);
    }
    titleNode.textContent = step.title || '';
    copyNode.textContent = step.copy || '';
    countNode.textContent = `${stepIndex + 1}/${activeSteps.length}`;
    prevButton.disabled = stepIndex === 0;
    prevButton.setAttribute('aria-disabled', stepIndex === 0 ? 'true' : 'false');
    nextButton.textContent = '➡️';
    nextButton.setAttribute(
      'aria-label',
      stepIndex === activeSteps.length - 1 ? 'Tutorial abschließen' : 'Nächster Tipp'
    );
    nextButton.title = nextButton.getAttribute('aria-label');
    schedulePositionRefresh();
  }

  function goPrevious() {
    if (!active || stepIndex <= 0) return;
    stepIndex -= 1;
    renderStep();
  }

  function goNext() {
    if (!active) return;
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
    if (contextual) {
      setStepSet(resolveContextualSteps());
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
      showIntroDialog();
      return true;
    }
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
    removeIntroDialog();
    removeNodes();
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

  return {
    start,
    finish,
    showContextHelp,
    isActive: () => active,
    storageKey: TUTORIAL_COMPLETED_STORAGE_KEY,
    resumeStorageKey: TUTORIAL_RESUME_STEP_STORAGE_KEY,
  };
}
