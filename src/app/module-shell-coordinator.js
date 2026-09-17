import { getWorkspaceClient } from '../modules/workspace/client.js';
import {
  createModuleMessageRouter,
  SIDEBAR_WIDTH_SCOPE_OTHER,
  SIDEBAR_WIDTH_SCOPE_PLANNING,
  SIDEBAR_WIDTH_SYNC_EVENT,
} from './module-message-router.js';
import { postToModule } from '../shared/module-frame-bridge.js';
import { createQrCameraController } from './qr-camera-controller.js';
import { FILE_LIMITS, formatFileSize } from '../shared/file-guards.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from '../shared/tutorial-entry-state.js';
import {
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  PLANNING_TUTORIAL_START_REQUEST_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
  QR_CAMERA_RESULT_EVENT,
  QR_CAMERA_STATE_EVENT,
  TAB_GRADES,
  TAB_PLANNING,
  TAB_SEATPLAN,
} from '../shell/tabs.js';

export function createModuleShellCoordinator({
  documentRef: document,
  view: window,
  appEl,
  frames: {
    getPlanningFrame,
    getGradesFrame,
    getMergerFrame,
    getDuplicateCheckFrame,
    getQrFrame,
    getSeatplanFrame,
    getNameLearningFrame,
  },
  themeController,
  bindRuntime,
  registerCleanup,
  setRuntimeTimeout,
  clearRuntimeTimeout,
  requestRuntimeFrame,
  cancelRuntimeSchedule,
  getActiveTab,
  setActiveTab,
  getChromeTransitionState,
  setChromeCollapsed,
  getBridgeController,
  getShellController,
  getCourseContext,
  getFirstRunTutorial,
  syncTutorialEntryHintToModules,
  openHelpEntry,
  showMessage,
}) {
  let moduleMessageRouter = null;
  let qrCameraController = null;
  const postToQrFrame = (type, detail) => {
    const frame = getQrFrame();
    if (!frame) return;
    postToModule(frame, { type, detail });
  };
  const getQrCameraController = () => {
    if (qrCameraController) return qrCameraController;
    qrCameraController = createQrCameraController({
      documentRef: document,
      view: window,
      getHost: () => getQrFrame()?.parentElement || null,
      onResult: (value) => {
        postToQrFrame(QR_CAMERA_RESULT_EVENT, { value });
      },
      onState: (state) => {
        postToQrFrame(QR_CAMERA_STATE_EVENT, state);
      },
    });
    return qrCameraController;
  };
  const openExternalUrlForModule = (value) => {
    let url;
    try {
      url = new URL(String(value || ''));
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  };
  const openModuleResultPdf = (detail) => {
    const buffer = detail?.bytes;
    if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength) return;
    if (buffer.byteLength > FILE_LIMITS.PDF_RESULT_OPEN_BYTES) {
      showMessage(
        `Das Ergebnis ist zu groß für die Vorschau (max. ${formatFileSize(FILE_LIMITS.PDF_RESULT_OPEN_BYTES)}). Bitte die Datei herunterladen.`,
        'warn',
        { presentation: 'toast' }
      );
      return;
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    registerCleanup(() => URL.revokeObjectURL(url));
    setRuntimeTimeout(() => URL.revokeObjectURL(url), 120_000);
  };
  const getSidebarWidthScopeForTab = (tab) => (
    tab === TAB_PLANNING || tab === TAB_GRADES
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER
  );
  const getFramesForSidebarWidthScope = (scope) => (
    scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? [getPlanningFrame(), getGradesFrame()]
      : [getMergerFrame(), getDuplicateCheckFrame(), getQrFrame(), getSeatplanFrame(), getNameLearningFrame()]
  );
  const syncSidebarWidthToModules = (scope, width) => {
    const normalizedScope = scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER;
    getFramesForSidebarWidthScope(normalizedScope).forEach((frame) => {
      postToModule(frame, {
        type: SIDEBAR_WIDTH_SYNC_EVENT,
        detail: { scope: normalizedScope, width },
      });
    });
  };
  let pendingSeatplanChromeCollapsed = null;
  let pendingSeatplanChromeFrame = 0;
  registerCleanup(() => {
    pendingSeatplanChromeCollapsed = null;
    if (!pendingSeatplanChromeFrame) return;
    cancelRuntimeSchedule(pendingSeatplanChromeFrame);
    pendingSeatplanChromeFrame = 0;
  });

  const applyPendingSeatplanChrome = (attempt = 0) => {
    pendingSeatplanChromeFrame = 0;
    if (pendingSeatplanChromeCollapsed === null) return;
    if (getChromeTransitionState() === 'idle') {
      const collapsed = pendingSeatplanChromeCollapsed;
      pendingSeatplanChromeCollapsed = null;
      setChromeCollapsed(collapsed, { resetSidebarWidth: false });
      return;
    }
    if (attempt >= 60) {
      pendingSeatplanChromeCollapsed = null;
      return;
    }
    if (typeof window.requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestRuntimeFrame(() => applyPendingSeatplanChrome(attempt + 1));
      return;
    }
    if (typeof window.setTimeout === 'function') {
      pendingSeatplanChromeFrame = setRuntimeTimeout(() => applyPendingSeatplanChrome(attempt + 1), 16);
    }
  };

  const requestSeatplanChromeCollapsed = (collapsed) => {
    pendingSeatplanChromeCollapsed = Boolean(collapsed);
    if (pendingSeatplanChromeFrame) return;
    if (typeof window.requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestRuntimeFrame(() => applyPendingSeatplanChrome());
      return;
    }
    if (typeof window.setTimeout === 'function') {
      pendingSeatplanChromeFrame = setRuntimeTimeout(() => applyPendingSeatplanChrome(), 16);
    }
  };

  let gradeVaultOverlayRevealedGradesShell = false;
  let gradeVaultOverlayReturnTab = '';
  let gradeVaultOverlayRestoreTimer = 0;
  let gradeVaultOverlayNavigationReturnTab = '';
  let gradeVaultOverlayNavigationSuppressedUntil = 0;
  let gradeVaultOverlayPreservesSourceTab = false;
  function bindMessages() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      moduleMessageRouter = createModuleMessageRouter({
        messageTarget: window,
        frames: {
          getPlanningFrame,
          getGradesFrame,
          getMergerFrame,
          getDuplicateCheckFrame,
          getQrFrame,
          getSeatplanFrame,
          getNameLearningFrame,
        },
        handlers: {
          onPlanningViewRequest: (detail) => {
            window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, { detail }));
          },
          onNameLearningRequest: (type, detail) => {
            getWorkspaceClient(window)?.operations.recordGradeVaultActivity?.();
            document.dispatchEvent(new CustomEvent(type, { detail }));
          },
          onNameLearningManageStudentsRequest: (detail) => {
            const courseId = Number(detail?.courseId || 0);
            const studentId = Number(detail?.studentId || 0);
            if (!courseId) return;
            getCourseContext().suppressGradesAutoSelect();
            getBridgeController()?.dispatchGradesNavigation?.({
              courseId,
              action: 'manage-students',
              ...(studentId ? { studentId } : {}),
              subview: 'overview',
              source: 'name-learning',
            });
            setActiveTab(TAB_GRADES);
          },
          onThemePreferenceChange: (detail) => {
            themeController.setPreference(detail?.preference);
          },
          onToastRequest: (detail) => {
            const message = String(detail.message || '').trim();
            if (!message) return;
            const variant = detail.variant === 'error' ? 'error' : 'success';
            showMessage(message, variant, { presentation: 'toast' });
          },
          onMoreToolsDismiss: () => {
            getShellController()?.closeMoreToolsMenu();
          },
          onOpenExternalRequest: (detail) => {
            openExternalUrlForModule(detail?.url);
          },
          onQrCameraRequest: (detail) => {
            if (detail.action === 'stop') {
              qrCameraController?.stop();
              return;
            }
            if (!appEl.classList.contains('app-tab-qr')) return;
            void getQrCameraController().start();
          },
          onMergerOpenResultRequest: (detail) => {
            openModuleResultPdf(detail);
          },
          onGradesNavigate: (detail) => {
            getCourseContext().suppressGradesAutoSelect();
            getBridgeController()?.dispatchGradesNavigation?.(detail);
          },
          onGradeVaultActivity: () => {
            getWorkspaceClient(window)?.operations.recordGradeVaultActivity?.();
          },
          onGradeVaultRequest: (detail) => {
            getBridgeController()?.requestGradeVault?.(detail);
          },
          onSidebarWidthRequest: ({ frame, scope }) => {
            postToModule(frame, {
              type: SIDEBAR_WIDTH_SYNC_EVENT,
              detail: {
                scope,
                width: getShellController()?.getSidebarWidth(scope)
                  ?? (scope === SIDEBAR_WIDTH_SCOPE_PLANNING ? 220 : 360),
              },
            });
          },
          onSidebarWidthCommit: (detail, { scope }) => {
            getShellController()?.setSidebarWidth(scope, detail?.width);
          },
          onSidebarCollapseRequest: ({ scope }) => {
            if (scope !== getSidebarWidthScopeForTab(getActiveTab())) return;
            setChromeCollapsed(true);
          },
          onSeatplanChromeRequest: (detail) => {
            const collapsed = detail.collapsed === true;
            if (collapsed && getActiveTab() !== TAB_SEATPLAN) return;
            requestSeatplanChromeCollapsed(collapsed);
          },
          onTutorialEntryHint: (detail, { frame }) => {
            if (detail.action === 'seen') {
              markTutorialEntryHintSeen();
              getFirstRunTutorial()?.clearContextHelpPrompt?.();
              syncTutorialEntryHintToModules();
              return;
            }
            postToModule(frame, {
              type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
              detail: { seen: hasTutorialEntryHintBeenSeen() },
            });
          },
          onHelpEntryRequest: () => {
            openHelpEntry();
          },
        },
      });
      registerCleanup(() => moduleMessageRouter?.dispose?.());
      registerCleanup(() => qrCameraController?.dispose?.());
      if (typeof window.MutationObserver === 'function' && appEl) {
        const qrTabObserver = new window.MutationObserver(() => {
          if (!qrCameraController?.isActive()) return;
          if (appEl.classList.contains('app-tab-qr')) return;
          qrCameraController.stop();
          postToQrFrame(QR_CAMERA_STATE_EVENT, { active: false });
        });
        qrTabObserver.observe(appEl, { attributes: true, attributeFilter: ['class'] });
        registerCleanup(() => qrTabObserver.disconnect());
      }
      bindRuntime(window, PLANNING_VIEW_REQUEST_EVENT, (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        if (!detail || typeof detail !== 'object' || detail.source !== 'iframe') {
          return;
        }
        if (detail.view === 'grades') {
          getCourseContext().suppressGradesAutoSelect();
          getBridgeController()?.dispatchGradesNavigation?.(detail);
          setActiveTab(TAB_GRADES);
          return;
        }
        setActiveTab(TAB_PLANNING);
        if (detail.returnNotice) {
          showMessage(String(detail.returnNotice), 'success', { presentation: 'toast' });
        }
      });
      bindRuntime(window, GRADES_VIEW_REQUEST_EVENT, (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        if (!detail || typeof detail !== 'object' || detail.source !== 'iframe') {
          return;
        }
        if (
          detail.view !== 'planning'
          && gradeVaultOverlayNavigationReturnTab
          && Date.now() < gradeVaultOverlayNavigationSuppressedUntil
        ) {
          if (getActiveTab() !== gradeVaultOverlayNavigationReturnTab) {
            setActiveTab(gradeVaultOverlayNavigationReturnTab);
          }
          return;
        }
        if (detail.view !== 'planning') {
          getCourseContext().suppressGradesAutoSelect();
        }
        setActiveTab(detail.view === 'planning' ? TAB_PLANNING : TAB_GRADES);
      });
      bindRuntime(window, PLANNING_TUTORIAL_START_REQUEST_EVENT, openHelpEntry);
    }
  }

  function bindVaultOverlay() {
    registerCleanup(() => {
      clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
      gradeVaultOverlayRestoreTimer = 0;
    });
    bindRuntime(window, GRADES_GRADE_VAULT_OVERLAY_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const isOpen = Boolean(detail?.open);
      const preserveSourceTab = detail?.preserveSourceTab !== false;
      const gradesTabIsActive = appEl.classList.contains('app-tab-grades');

      if (isOpen) {
        gradeVaultOverlayPreservesSourceTab = preserveSourceTab;
        if (preserveSourceTab && !gradesTabIsActive) {
          gradeVaultOverlayReturnTab = getActiveTab();
          gradeVaultOverlayNavigationReturnTab = gradeVaultOverlayReturnTab;
          gradeVaultOverlayNavigationSuppressedUntil = Date.now() + 1500;
        } else if (!preserveSourceTab) {
          gradeVaultOverlayReturnTab = '';
          gradeVaultOverlayNavigationReturnTab = '';
          gradeVaultOverlayNavigationSuppressedUntil = 0;
          if (gradeVaultOverlayRestoreTimer) {
            clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
            gradeVaultOverlayRestoreTimer = 0;
          }
        }
      }
      gradeVaultOverlayRevealedGradesShell = isOpen && !gradesTabIsActive;

      appEl.classList.toggle('grade-vault-overlay', isOpen);
      appEl.classList.toggle(
        'grade-vault-overlay-revealed-grades',
        isOpen && gradeVaultOverlayRevealedGradesShell
      );
      if (!isOpen && gradeVaultOverlayPreservesSourceTab && gradeVaultOverlayReturnTab) {
        const returnTab = gradeVaultOverlayReturnTab;
        gradeVaultOverlayReturnTab = '';
        gradeVaultOverlayNavigationReturnTab = returnTab;
        gradeVaultOverlayNavigationSuppressedUntil = Date.now() + 1500;
        const restoreSourceTab = () => {
          if (getActiveTab() === TAB_GRADES && returnTab !== TAB_GRADES) {
            setActiveTab(returnTab);
          }
        };
        restoreSourceTab();
        if (gradeVaultOverlayRestoreTimer) {
          clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
        }
        gradeVaultOverlayRestoreTimer = setRuntimeTimeout(() => {
          gradeVaultOverlayRestoreTimer = 0;
          restoreSourceTab();
        }, 360);
      }
      if (!isOpen) {
        gradeVaultOverlayPreservesSourceTab = false;
      }
    });
  }

  return { bindMessages, bindVaultOverlay, syncSidebarWidthToModules };
}
