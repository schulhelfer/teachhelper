import { isTrustedModuleMessage } from '../shared/module-frame-bridge.js';
import { THEME_PREFERENCE_CHANGE_EVENT } from '../shared/theme.js';
import { TUTORIAL_ENTRY_HINT_SYNC_EVENT } from '../shared/tutorial-entry-state.js';
import {
  GRADES_GRADE_VAULT_ACTIVITY_EVENT,
  GRADES_GRADE_VAULT_REQUEST_EVENT,
  GRADES_NAVIGATE_EVENT,
  MERGER_OPEN_RESULT_REQUEST_EVENT,
  MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
  NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT,
  NAME_LEARNING_DATA_REQUEST_EVENT,
  NAME_LEARNING_MANAGE_STUDENTS_REQUEST_EVENT,
  NAME_LEARNING_REVIEW_REQUEST_EVENT,
  NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
} from '../shell/tabs.js';

export const SIDEBAR_WIDTH_SCOPE_PLANNING = 'planning';
export const SIDEBAR_WIDTH_SCOPE_OTHER = 'other';
export const SIDEBAR_WIDTH_SYNC_EVENT = 'classroom:sidebar-width-sync';

const SIDEBAR_WIDTH_REQUEST_EVENT = 'classroom:sidebar-width-request';
const SIDEBAR_WIDTH_COMMIT_EVENT = 'classroom:sidebar-width-commit';
const SIDEBAR_COLLAPSE_REQUEST_EVENT = 'classroom:sidebar-collapse-request';
const SEATPLAN_CHROME_REQUEST_EVENT = 'classroom:seatplan-chrome-request';
const MORE_TOOLS_DISMISS_EVENT = 'classroom:more-tools-dismiss';
const TOAST_REQUEST_EVENT = 'classroom:toast-request';
const HELP_ENTRY_REQUEST_EVENT = 'classroom:help-entry-request';

const NAME_LEARNING_REQUEST_EVENTS = new Set([
  NAME_LEARNING_DATA_REQUEST_EVENT,
  NAME_LEARNING_REVIEW_REQUEST_EVENT,
  NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT,
  NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT,
]);

const FRAME_ROLES = [
  ['planning', 'getPlanningFrame'],
  ['grades', 'getGradesFrame'],
  ['merger', 'getMergerFrame'],
  ['duplicateCheck', 'getDuplicateCheckFrame'],
  ['qr', 'getQrFrame'],
  ['seatplan', 'getSeatplanFrame'],
  ['nameLearning', 'getNameLearningFrame'],
];

export function createModuleMessageRouter({
  messageTarget,
  frames = {},
  handlers = {},
} = {}) {
  let disposed = false;

  const invoke = (name, ...args) => {
    const handler = handlers[name];
    if (typeof handler !== 'function') return false;
    handler(...args);
    return true;
  };

  const resolveTrustedFrame = (event) => {
    for (const [role, getterName] of FRAME_ROLES) {
      const frame = frames[getterName]?.();
      if (frame && isTrustedModuleMessage(event, frame)) return { frame, role };
    }
    return null;
  };

  const normalizeSidebarScope = (detail) => (
    detail?.scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER
  );

  const handleMessage = (event) => {
    if (disposed) return false;
    const source = resolveTrustedFrame(event);
    if (!source) return false;
    const data = event?.data;
    if (!data || typeof data !== 'object') return false;
    const { frame, role } = source;
    const metadata = { frame, role };

    if (data.type === PLANNING_VIEW_REQUEST_EVENT) {
      if (role !== 'seatplan') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
      if (!detail || detail.source !== 'iframe') return false;
      return invoke('onPlanningViewRequest', detail, metadata);
    }
    if (NAME_LEARNING_REQUEST_EVENTS.has(data.type)) {
      if (role !== 'nameLearning') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
      return invoke('onNameLearningRequest', data.type, detail, metadata);
    }
    if (data.type === NAME_LEARNING_MANAGE_STUDENTS_REQUEST_EVENT) {
      if (role !== 'nameLearning') return false;
      return invoke('onNameLearningManageStudentsRequest', data.detail, metadata);
    }
    if (data.type === THEME_PREFERENCE_CHANGE_EVENT) {
      if (role !== 'planning' && role !== 'grades') return false;
      return invoke('onThemePreferenceChange', data.detail, metadata);
    }
    if (data.type === TOAST_REQUEST_EVENT) {
      if (role !== 'planning' && role !== 'grades') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
      if (!detail || detail.source !== 'iframe') return false;
      return invoke('onToastRequest', detail, metadata);
    }
    if (data.type === MORE_TOOLS_DISMISS_EVENT) {
      return invoke('onMoreToolsDismiss', data.detail, metadata);
    }
    if (data.type === MODULE_OPEN_EXTERNAL_REQUEST_EVENT) {
      if (role !== 'qr') return false;
      return invoke('onOpenExternalRequest', data.detail, metadata);
    }
    if (data.type === MERGER_OPEN_RESULT_REQUEST_EVENT) {
      if (role !== 'merger') return false;
      return invoke('onMergerOpenResultRequest', data.detail, metadata);
    }
    if (data.type === GRADES_NAVIGATE_EVENT) {
      if (role !== 'planning') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
      return invoke('onGradesNavigate', detail, metadata);
    }
    if (data.type === GRADES_GRADE_VAULT_ACTIVITY_EVENT) {
      if (role !== 'grades') return false;
      return invoke('onGradeVaultActivity', data.detail, metadata);
    }
    if (data.type === GRADES_GRADE_VAULT_REQUEST_EVENT) {
      if (role !== 'grades') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
      return invoke('onGradeVaultRequest', detail, metadata);
    }
    if (data.type === SIDEBAR_WIDTH_REQUEST_EVENT || data.type === SIDEBAR_WIDTH_COMMIT_EVENT) {
      const scope = normalizeSidebarScope(data.detail);
      const expectedScope = role === 'planning' || role === 'grades'
        ? SIDEBAR_WIDTH_SCOPE_PLANNING
        : SIDEBAR_WIDTH_SCOPE_OTHER;
      if (scope !== expectedScope) return false;
      return invoke(
        data.type === SIDEBAR_WIDTH_REQUEST_EVENT ? 'onSidebarWidthRequest' : 'onSidebarWidthCommit',
        data.detail,
        { ...metadata, scope }
      );
    }
    if (data.type === SIDEBAR_COLLAPSE_REQUEST_EVENT) {
      const scope = normalizeSidebarScope(data.detail);
      return invoke('onSidebarCollapseRequest', data.detail, { ...metadata, scope });
    }
    if (data.type === SEATPLAN_CHROME_REQUEST_EVENT) {
      if (role !== 'seatplan') return false;
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
      if (!detail || detail.source !== 'iframe') return false;
      return invoke('onSeatplanChromeRequest', detail, metadata);
    }
    if (data.type === TUTORIAL_ENTRY_HINT_SYNC_EVENT) {
      if (data.detail?.action !== 'seen' && data.detail?.action !== 'request') return false;
      return invoke('onTutorialEntryHint', data.detail, metadata);
    }
    if (data.type === HELP_ENTRY_REQUEST_EVENT) {
      return invoke('onHelpEntryRequest', data.detail, metadata);
    }
    return false;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    messageTarget?.removeEventListener?.('message', handleMessage);
  };

  messageTarget?.addEventListener?.('message', handleMessage);

  return { handleMessage, dispose };
}
