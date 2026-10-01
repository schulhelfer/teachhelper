import { getWorkspaceClient } from '../modules/workspace/client.js';
import { createQrCameraController } from './qr-camera-controller.js';
import { createPdfPrintController } from './pdf-print-controller.js';
import { createPdfPrintHelpController } from './pdf-print-help-controller.js';
import {
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  PLANNING_TUTORIAL_START_REQUEST_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
  QR_CAMERA_RESULT_EVENT,
  QR_CAMERA_STATE_EVENT,
  TAB_GRADES,
  TAB_PLANNING,
  TAB_QR,
  TAB_SEATPLAN,
} from '../shell/tabs.js';

export function createIframeModuleShellBindings({
  documentRef: document,
  view: window,
  appEl,
  moduleRegistry,
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
  getCourseContext,
  openHelpEntry,
  showMessage,
}) {
  let qrCameraController = null;
  let pdfPrintController = null;
  let pdfPrintHelpController = null;
  registerCleanup(() => pdfPrintController?.dispose());
  registerCleanup(() => pdfPrintHelpController?.dispose());
  const printModuleResult = (detail) => {
    if (appEl?.dataset?.helpPreview === 'true') return;
    pdfPrintController ||= createPdfPrintController({ documentRef: document, view: window, showMessage });
    void pdfPrintController.print(detail);
  };
  const postToQrFrame = (type, detail) => {
    moduleRegistry.get(TAB_QR)?.postMessage({ type, detail });
  };
  const getQrCameraController = () => {
    if (qrCameraController) return qrCameraController;
    qrCameraController = createQrCameraController({
      documentRef: document,
      view: window,
      getHost: () => moduleRegistry.get(TAB_QR)?.getFrame()?.parentElement || null,
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

  return {
    bindMessages,
    bindVaultOverlay,
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
      onOpenExternalRequest: (detail) => {
        openExternalUrlForModule(detail?.url);
      },
      onMergerPrintResultRequest: (detail) => {
        printModuleResult(detail);
      },
      onMergerPrintHelpRequest: ({ frame }) => {
        if (appEl?.dataset?.helpPreview === 'true') return;
        pdfPrintHelpController ||= createPdfPrintHelpController({ documentRef: document, view: window });
        pdfPrintHelpController.open(frame);
      },
      onQrCameraRequest: (detail) => {
        if (detail.action === 'stop') {
          qrCameraController?.stop();
          return;
        }
        if (!appEl.classList.contains('app-tab-qr')) return;
        void getQrCameraController().start();
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
      onSeatplanChromeRequest: (detail) => {
        const collapsed = detail.collapsed === true;
        if (collapsed && getActiveTab() !== TAB_SEATPLAN) return;
        requestSeatplanChromeCollapsed(collapsed);
      },
    },
  };
}
