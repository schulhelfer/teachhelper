import { postToModule } from '../shared/module-frame-bridge.js';
import {
  TAB_DUPLICATE_CHECK,
  TAB_GRADES,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_SEATPLAN,
} from '../shell/tabs.js';
import { SIDEBAR_WIDTH_SCOPE_OTHER, SIDEBAR_WIDTH_SCOPE_PLANNING } from './module-message-router.js';

export function createIframeModuleAdapters({ frames, getBridgeController, els }) {
  const definitions = [
    { id: TAB_MERGER, role: 'merger', getFrame: frames.getMergerFrame,
      initError: 'PDF-Tools konnten nicht initialisiert werden.' },
    { id: TAB_DUPLICATE_CHECK, role: 'duplicateCheck', getFrame: frames.getDuplicateCheckFrame,
      initError: 'DuplikatCheck konnte nicht initialisiert werden.' },
    { id: TAB_QR, role: 'qr', getFrame: frames.getQrFrame,
      initError: 'QR-Tools konnten nicht initialisiert werden.' },
    { id: TAB_NAME_LEARNING, role: 'nameLearning', getFrame: frames.getNameLearningFrame,
      initError: 'Planungs-Modul konnte nicht initialisiert werden.' },
    { id: TAB_GRADES, role: 'grades', getFrame: frames.getGradesFrame,
      sidebarScope: SIDEBAR_WIDTH_SCOPE_PLANNING, initError: 'Noten-Modul konnte nicht initialisiert werden.',
      errorHost: els.gradesHost, errorText: 'Noten konnten nicht geladen werden.' },
    { id: TAB_PLANNING, role: 'planning', getFrame: frames.getPlanningFrame,
      sidebarScope: SIDEBAR_WIDTH_SCOPE_PLANNING, initError: 'Planungs-Modul konnte nicht initialisiert werden.',
      errorHost: els.planningHost, errorText: 'Planung konnte nicht geladen werden.' },
    { id: TAB_SEATPLAN, role: 'seatplan', getFrame: frames.getSeatplanFrame,
      initError: 'Sitzplan-Modul konnte nicht initialisiert werden.' },
  ];
  return definitions.map(({ getFrame, errorHost, errorText, ...definition }) => {
    let disposed = false;
    return Object.freeze({
      sidebarScope: SIDEBAR_WIDTH_SCOPE_OTHER,
      ...definition,
      getFrame: () => disposed ? null : getFrame?.() || null,
      ensureInitialized() {
        if (disposed) return;
        return getBridgeController()?.ensureTabInitialized(definition.id);
      },
      applyShellLayout(context) {
        if (disposed) return;
        return getBridgeController()?.applyModuleShellLayout(definition.id, context);
      },
      postMessage(payload) {
        if (disposed) return false;
        return postToModule(getFrame?.(), payload);
      },
      showInitializationError() {
        if (!disposed && errorHost) errorHost.textContent = errorText;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        getBridgeController()?.disposeModule(definition.id);
      },
    });
  });
}
