export const WORKSPACE_COMMAND_EVENT = 'classroom:workspace-command';
export const WORKSPACE_RESULT_EVENT = 'classroom:workspace-result';
export const WORKSPACE_STATE_EVENT = 'classroom:workspace-state';
export const WORKSPACE_OWNER_READY_EVENT = 'classroom:workspace-owner-ready';

export const WORKSPACE_CLIENT_SHELL = 'shell';
export const WORKSPACE_CLIENT_PLANNING = 'planning';
export const WORKSPACE_CLIENT_GRADES = 'grades';
export const WORKSPACE_CLIENT_SEATPLAN = 'seatplan';

export const WORKSPACE_ERROR_STALE_STATE = 'STALE_STATE';
export const WORKSPACE_ERROR_NOT_READY = 'WORKSPACE_NOT_READY';
export const WORKSPACE_ERROR_VAULT_LOCKED = 'VAULT_LOCKED';
export const WORKSPACE_ERROR_VAULT_DIRTY = 'VAULT_DIRTY';
export const WORKSPACE_ERROR_PERSISTENCE_CONFLICT = 'PERSISTENCE_CONFLICT';
export const WORKSPACE_ERROR_USER_CANCELLED = 'USER_CANCELLED';
export const WORKSPACE_ERROR_UNSUPPORTED = 'UNSUPPORTED';

export const WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE = 'replace-public-state';
export const WORKSPACE_COMMAND_GET_SNAPSHOT = 'get-snapshot';
export const WORKSPACE_COMMAND_OWNER_ACTION = 'owner-action';
export const WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX = 'get-performance-index';
export const WORKSPACE_COMMAND_GET_GRADE_ASSESSMENT_INDEX = WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX;
export const WORKSPACE_COMMAND_CREATE_COURSE = 'create-course';
export const WORKSPACE_COMMAND_UPDATE_COURSE = 'update-course';
export const WORKSPACE_COMMAND_DELETE_COURSE = 'delete-course';
export const WORKSPACE_COMMAND_REORDER_COURSES = 'reorder-courses';
export const WORKSPACE_COMMAND_APPLY_SETTINGS = 'apply-settings';
export const WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY = 'delete-occurrence-category';

export const WORKSPACE_OPERATION_GROUPS = Object.freeze({
  public: Object.freeze([
    'school-years', 'courses', 'slots', 'lessons', 'holidays', 'public-settings',
  ]),
  grades: Object.freeze([
    'participants', 'structure', 'assessments', 'entries', 'overrides', 'accommodations', 'seatplan-grades',
  ]),
  vault: Object.freeze([
    'setup', 'unlock', 'lock', 'change-password', 'encryption-mode',
  ]),
  persistence: Object.freeze([
    'connect', 'create', 'import', 'save', 'backup',
  ]),
});

export function createWorkspaceRequestId(prefix = 'workspace') {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${String(prefix || 'workspace')}:${randomPart}`;
}

export function normalizeWorkspaceClient(value) {
  const client = String(value || '').trim().toLowerCase();
  if (
    client === WORKSPACE_CLIENT_PLANNING
    || client === WORKSPACE_CLIENT_GRADES
    || client === WORKSPACE_CLIENT_SEATPLAN
    || client === WORKSPACE_CLIENT_SHELL
  ) {
    return client;
  }
  return WORKSPACE_CLIENT_SHELL;
}

export function normalizeWorkspaceCommandRequest(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    type: WORKSPACE_COMMAND_EVENT,
    requestId: String(source.requestId || createWorkspaceRequestId()),
    client: normalizeWorkspaceClient(source.client),
    command: String(source.command || '').trim(),
    payload: source.payload && typeof source.payload === 'object' ? source.payload : null,
    baseRevision: source.baseRevision !== null
      && source.baseRevision !== undefined
      && Number.isFinite(Number(source.baseRevision))
      ? Math.max(0, Number(source.baseRevision))
      : null,
  };
}
