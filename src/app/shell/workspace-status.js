import {
  GRADES_GRADE_VAULT_STATE_EVENT,
  GRADES_MANUAL_SAVE_STATE_EVENT,
  GRADES_READY_EVENT,
  GRADES_UNSAVED_STATE_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_UNSAVED_STATE_EVENT,
} from '../../shell/tabs.js';
import { WORKSPACE_STATE_EVENT } from '../../shared/school-data/messages.js';

const VALID_VAULT_MODES = new Set(['off', 'unlock', 'ready', 'setup']);

function createInitialPlanningState() {
  return {
    ready: false,
    initialPaintPending: true,
    accessReady: false,
    hasCourse: false,
    hasSlot: false,
  };
}

function createInitialGradesState() {
  return {
    ready: false,
    initialPaintPending: true,
  };
}

function createInitialManualSaveState() {
  return {
    isManualMode: false,
    dirty: false,
    title: 'Datenbank speichern',
    ariaLabel: 'Datenbank speichern',
  };
}

function createInitialUnsavedState() {
  return {
    dirty: false,
    planningDirty: false,
    planningSettingsDirty: false,
    gradesDirty: false,
    gradesSettingsDirty: false,
    dirtyGradeCourseIds: [],
  };
}

function createInitialVaultState() {
  return {
    ready: false,
    mode: 'setup',
    dbConnected: false,
    backupConnected: false,
    hasGradeCourse: false,
    hasGradeStudents: false,
    configured: false,
    unlocked: false,
    encryptionEnabled: false,
    showGradeStudentPortraits: false,
    showNameLearningModule: false,
    nameLearningDueCount: null,
    setupRequired: false,
  };
}

export function createWorkspaceStatusController({
  view = null,
  CustomEventClass = view?.CustomEvent,
  planningTabTarget = 'planning',
  gradesTabTarget = 'grades',
  planningTabTargets = [planningTabTarget, gradesTabTarget],
  gradeVaultStatusTabTargets = [planningTabTarget, gradesTabTarget],
  getActiveTab = () => planningTabTarget,
  getTabTransitionState = () => 'idle',
  getChromeCollapsed = () => false,
  getChromeTransitionState = () => 'idle',
  supportsExternalFileSync = false,
  isModuleWindow = () => false,
  onChange = () => {},
} = {}) {
  let disposed = false;
  let planningState = createInitialPlanningState();
  let gradesState = createInitialGradesState();
  let manualSaveState = createInitialManualSaveState();
  let unsavedState = createInitialUnsavedState();
  let vaultState = createInitialVaultState();
  const planningTargets = new Set(planningTabTargets);
  const vaultStatusTargets = new Set(gradeVaultStatusTabTargets);
  const bindings = [];

  function bind(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    bindings.push([target, type, listener]);
  }

  function notify(type, detail = {}) {
    if (!disposed) onChange({ type, ...detail });
  }

  function getEventDetail(event) {
    return typeof CustomEventClass === 'function' && event instanceof CustomEventClass
      ? event.detail
      : null;
  }

  function getPlanningState() {
    return { ...planningState };
  }

  function getGradesState() {
    return {
      ...gradesState,
      hasCourse: vaultState.hasGradeCourse,
      hasStudents: vaultState.hasGradeStudents,
      vaultReady: vaultState.ready,
    };
  }

  function getManualSaveState() {
    return { ...manualSaveState };
  }

  function getUnsavedState() {
    return {
      ...unsavedState,
      dirtyGradeCourseIds: [...unsavedState.dirtyGradeCourseIds],
    };
  }

  function getVaultState() {
    return { ...vaultState };
  }

  function getUnsavedAreaLabel() {
    if (unsavedState.planningDirty && unsavedState.gradesDirty) {
      return 'Planung und Noten';
    }
    if (unsavedState.planningDirty) return 'Planung';
    if (unsavedState.gradesDirty) return 'Noten';
    return 'Planung oder Noten';
  }

  function getLeaveGuard(nextTab, options = {}) {
    if (options.skipUnsavedPrompt) return null;
    const activeTab = getActiveTab();
    if (
      activeTab === gradesTabTarget
      && nextTab !== gradesTabTarget
      && (unsavedState.gradesDirty || unsavedState.gradesSettingsDirty)
    ) {
      return 'grades';
    }
    if (
      planningTargets.has(activeTab)
      && !planningTargets.has(nextTab)
      && unsavedState.planningSettingsDirty
    ) {
      return 'planning';
    }
    return null;
  }

  function shouldPromptVaultUnlock(nextTab) {
    return nextTab === gradesTabTarget
      && getActiveTab() === planningTabTarget
      && vaultState.ready
      && vaultState.dbConnected
      && vaultState.configured
      && !vaultState.unlocked
      && !vaultState.setupRequired
      && vaultState.mode === 'unlock';
  }

  function shouldBlockBeforeUnload() {
    return !isModuleWindow() && unsavedState.dirty;
  }

  function canShowNameLearning() {
    return vaultState.showGradeStudentPortraits && vaultState.showNameLearningModule;
  }

  function getManualSaveControlState() {
    const shouldShow = planningTargets.has(getActiveTab())
      && manualSaveState.isManualMode
      && !supportsExternalFileSync;
    const hasChanges = manualSaveState.dirty;
    const chromeTransitionIdle = getChromeTransitionState() === 'idle';
    const title = shouldShow && !hasChanges
      ? 'Keine zu speichernden Änderungen'
      : manualSaveState.title;
    return {
      shouldShow,
      hidden: !shouldShow,
      hasChanges,
      visible: shouldShow && !getChromeCollapsed() && chromeTransitionIdle,
      disabled: !shouldShow || !hasChanges || !chromeTransitionIdle,
      attention: shouldShow && hasChanges,
      collapsed: shouldShow && getChromeCollapsed() && chromeTransitionIdle,
      title,
      ariaLabel: shouldShow && !hasChanges ? 'Keine zu speichernden Änderungen' : manualSaveState.ariaLabel,
      canRequest: planningTargets.has(getActiveTab())
        && manualSaveState.isManualMode
        && manualSaveState.dirty,
    };
  }

  function getVaultControlState() {
    const activeTab = getActiveTab();
    const activeStatusTab = vaultStatusTargets.has(activeTab);
    const statusAvailable = activeStatusTab && vaultState.ready && vaultState.dbConnected;
    const locked = vaultState.configured
      && !vaultState.unlocked
      && !vaultState.setupRequired
      && vaultState.mode === 'unlock';
    const shouldShow = statusAvailable
      && vaultState.configured
      && !vaultState.setupRequired
      && (locked || vaultState.unlocked);
    const canRequest = activeStatusTab
      && vaultState.ready
      && vaultState.dbConnected
      && vaultState.configured
      && !vaultState.setupRequired
      && (locked || vaultState.unlocked)
      && getTabTransitionState() === 'idle'
      && getChromeTransitionState() === 'idle';
    return {
      statusAvailable,
      locked,
      shouldShow,
      canRequest,
      action: locked ? 'unlock' : 'lock',
      actionLabel: locked ? 'Notenmodul entsperren' : 'Notenmodul sperren',
      label: locked ? 'Notenmodul gesperrt' : 'Notenmodul entsperrt',
    };
  }

  function setManualSaveState(detail = null) {
    if (disposed) return;
    const title = detail && typeof detail.title === 'string' && detail.title.trim()
      ? detail.title.trim()
      : 'Datenbank speichern';
    const ariaLabel = detail && typeof detail.ariaLabel === 'string' && detail.ariaLabel.trim()
      ? detail.ariaLabel.trim()
      : title;
    manualSaveState = {
      isManualMode: Boolean(detail && detail.isManualMode),
      dirty: Boolean(detail && detail.dirty),
      title,
      ariaLabel,
    };
    notify('manual-save');
  }

  function setUnsavedState(detail = null) {
    if (disposed) return;
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const planningDirty = Boolean(nextDetail.planningDirty);
    const gradesDirty = Boolean(nextDetail.gradesDirty);
    const planningSettingsDirty = Boolean(nextDetail.planningSettingsDirty);
    const gradesSettingsDirty = Boolean(nextDetail.gradesSettingsDirty);
    unsavedState = {
      dirty: Boolean(
        nextDetail.dirty
        || planningDirty
        || gradesDirty
        || planningSettingsDirty
        || gradesSettingsDirty
      ),
      planningDirty,
      planningSettingsDirty,
      gradesDirty,
      gradesSettingsDirty,
      dirtyGradeCourseIds: Array.isArray(nextDetail.dirtyGradeCourseIds)
        ? nextDetail.dirtyGradeCourseIds.map((id) => String(id)).filter(Boolean)
        : [],
    };
    notify('unsaved');
  }

  function setVaultState(detail = null) {
    if (disposed) return;
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const hasNameLearningDueCount = Object.hasOwn(nextDetail, 'nameLearningDueCount');
    vaultState = {
      ready: Boolean(nextDetail.ready ?? vaultState.ready),
      mode: VALID_VAULT_MODES.has(nextDetail.mode) ? nextDetail.mode : 'off',
      dbConnected: Boolean(nextDetail.dbConnected),
      backupConnected: Boolean(nextDetail.backupConnected),
      hasGradeCourse: Boolean(nextDetail.hasGradeCourse),
      hasGradeStudents: Boolean(nextDetail.hasGradeStudents),
      configured: Boolean(nextDetail.configured),
      unlocked: Boolean(nextDetail.unlocked),
      encryptionEnabled: Boolean(nextDetail.encryptionEnabled),
      showGradeStudentPortraits: Boolean(nextDetail.showGradeStudentPortraits),
      showNameLearningModule: Boolean(nextDetail.showNameLearningModule),
      nameLearningDueCount: hasNameLearningDueCount
        ? (Number.isInteger(nextDetail.nameLearningDueCount) && nextDetail.nameLearningDueCount >= 0
          ? nextDetail.nameLearningDueCount
          : null)
        : vaultState.nameLearningDueCount,
      setupRequired: Boolean(nextDetail.setupRequired),
    };
    notify('vault');
  }

  function markPlanningReady(detail = null) {
    if (disposed) return;
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const initialReadyTransition = planningState.initialPaintPending;
    planningState = {
      ready: true,
      initialPaintPending: false,
      accessReady: Boolean(nextDetail.planningAccessReady ?? planningState.accessReady),
      hasCourse: Boolean(nextDetail.hasPlanningCourse ?? planningState.hasCourse),
      hasSlot: Boolean(nextDetail.hasPlanningSlot ?? planningState.hasSlot),
    };
    notify('planning-ready', { initialReadyTransition });
  }

  function markGradesReady(detail = null) {
    if (disposed) return;
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const initialReadyTransition = gradesState.initialPaintPending;
    vaultState = {
      ...vaultState,
      ready: true,
      mode: VALID_VAULT_MODES.has(nextDetail.gradeVaultMode) ? nextDetail.gradeVaultMode : 'off',
      dbConnected: Boolean(nextDetail.gradeVaultDbConnected ?? vaultState.dbConnected),
      backupConnected: Boolean(nextDetail.gradeBackupConnected ?? vaultState.backupConnected),
      hasGradeCourse: Boolean(nextDetail.hasGradeCourse ?? vaultState.hasGradeCourse),
      hasGradeStudents: Boolean(nextDetail.hasGradeStudents ?? vaultState.hasGradeStudents),
      configured: Boolean(nextDetail.gradeVaultUnlockConfigured ?? vaultState.configured),
      unlocked: Boolean(nextDetail.gradeVaultUnlocked ?? vaultState.unlocked),
      encryptionEnabled: Boolean(nextDetail.gradeVaultEncryptionEnabled ?? vaultState.encryptionEnabled),
      setupRequired: Boolean(nextDetail.gradeVaultSetupRequired ?? vaultState.setupRequired),
    };
    gradesState = {
      ready: true,
      initialPaintPending: false,
    };
    notify('grades-ready', { initialReadyTransition });
  }

  function handleWorkspaceState(event) {
    const detail = getEventDetail(event);
    if (!detail || detail.scope !== 'shell' || !detail.snapshot) return;
    if (detail.snapshot.unsaved) setUnsavedState(detail.snapshot.unsaved);
    const vault = detail.snapshot.vault;
    if (vault && typeof vault === 'object') {
      setVaultState({
        ...vault,
        ready: Boolean(detail.snapshot.ready),
      });
    }
  }

  function handleBeforeUnload(event) {
    if (!shouldBlockBeforeUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  bind(view, PLANNING_MANUAL_SAVE_STATE_EVENT, (event) => setManualSaveState(getEventDetail(event)));
  bind(view, GRADES_MANUAL_SAVE_STATE_EVENT, (event) => setManualSaveState(getEventDetail(event)));
  bind(view, PLANNING_UNSAVED_STATE_EVENT, (event) => setUnsavedState(getEventDetail(event)));
  bind(view, GRADES_UNSAVED_STATE_EVENT, (event) => setUnsavedState(getEventDetail(event)));
  bind(view, WORKSPACE_STATE_EVENT, handleWorkspaceState);
  bind(view, GRADES_GRADE_VAULT_STATE_EVENT, (event) => setVaultState(getEventDetail(event)));
  bind(view, PLANNING_READY_EVENT, (event) => markPlanningReady(getEventDetail(event)));
  bind(view, GRADES_READY_EVENT, (event) => markGradesReady(getEventDetail(event)));
  bind(view, 'beforeunload', handleBeforeUnload);

  function dispose() {
    if (disposed) return;
    disposed = true;
    bindings.splice(0).forEach(([target, type, listener]) => {
      target.removeEventListener?.(type, listener);
    });
  }

  return {
    getPlanningState,
    getGradesState,
    getManualSaveState,
    getUnsavedState,
    getVaultState,
    getUnsavedAreaLabel,
    getLeaveGuard,
    shouldPromptVaultUnlock,
    shouldBlockBeforeUnload,
    canShowNameLearning,
    getManualSaveControlState,
    getVaultControlState,
    setManualSaveState,
    setUnsavedState,
    setVaultState,
    markPlanningReady,
    markGradesReady,
    dispose,
  };
}
