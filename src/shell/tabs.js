export const TAB_MERGER = 'merger';
export const TAB_DUPLICATE_CHECK = 'duplicate-check';
export const TAB_PLANNING = 'planning';
export const TAB_GRADES = 'grades';
export const TAB_GROUPS = 'groups';
export const TAB_RANDOM_PICKER = 'random-picker';
export const TAB_SEATPLAN = 'seatplan';
export const TAB_WORK_PHASE = 'work-phase';
export const TAB_MONITOR = 'monitor';
export const TAB_WORK_ORDER = 'work-order';
export const TAB_TIMER = 'timer';

export const PLANNING_MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';
export const PLANNING_MANUAL_SAVE_REQUEST_EVENT = 'classroom:planning-manual-save-request';
export const PLANNING_VIEW_REQUEST_EVENT = 'classroom:planning-view-request';
export const PLANNING_READY_EVENT = 'classroom:planning-ready';
export const PLANNING_GRADE_VAULT_STATE_EVENT = 'classroom:planning-grade-vault-state';
export const PLANNING_GRADE_VAULT_REQUEST_EVENT = 'classroom:planning-grade-vault-request';
export const PLANNING_COURSE_SEATPLAN_OPEN_EVENT = 'classroom:planning-course-seatplan-open';
export const PLANNING_COURSE_SEATPLAN_SAVE_REQUEST_EVENT = 'classroom:planning-course-seatplan-save-request';
export const PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT = 'classroom:planning-course-seatplan-save-result';
export const PLANNING_COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:planning-course-grade-config-request';
export const PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT = 'classroom:planning-course-grade-config-result';
export const PLANNING_COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:planning-course-grade-save-request';
export const PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT = 'classroom:planning-course-grade-save-result';
export const SEATPLAN_COURSE_CONTEXT_EVENT = 'classroom:seatplan-course-context';
export const SEATPLAN_COURSE_SAVE_REQUEST_EVENT = 'classroom:seatplan-course-save-request';
export const SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:seatplan-course-grade-config-request';
export const SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:seatplan-course-grade-save-request';
export const MERGER_SHELL_LAYOUT_EVENT = 'classroom:merger-shell-layout';
export const DUPLICATE_CHECK_SHELL_LAYOUT_EVENT = 'classroom:duplicate-check-shell-layout';
export const PLANNING_SHELL_LAYOUT_EVENT = 'classroom:planning-shell-layout';

export function normalizeTab(tab) {
  if (tab === TAB_MERGER) return TAB_MERGER;
  if (tab === TAB_DUPLICATE_CHECK) return TAB_DUPLICATE_CHECK;
  if (tab === TAB_PLANNING) return TAB_PLANNING;
  if (tab === TAB_GRADES) return TAB_GRADES;
  if (tab === TAB_RANDOM_PICKER) return TAB_RANDOM_PICKER;
  if (tab === TAB_SEATPLAN) return TAB_SEATPLAN;
  if (tab === TAB_WORK_PHASE || tab === TAB_MONITOR || tab === TAB_WORK_ORDER || tab === TAB_TIMER) {
    return TAB_WORK_PHASE;
  }
  return TAB_GROUPS;
}
