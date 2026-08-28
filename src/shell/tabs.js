export const TAB_MERGER = 'merger';
export const TAB_DUPLICATE_CHECK = 'duplicate-check';
export const TAB_PLANNING = 'planning';
export const TAB_GRADES = 'grades';
export const TAB_GROUPS = 'groups';
export const TAB_RANDOM_PICKER = 'random-picker';
export const TAB_SEATPLAN = 'seatplan';
export const TAB_NAME_LEARNING = 'name-learning';
export const TAB_WORK_PHASE = 'work-phase';
export const TAB_QR = 'qr';
export const TAB_MONITOR = 'monitor';
export const TAB_WORK_ORDER = 'work-order';
export const TAB_TIMER = 'timer';

export const PLANNING_MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';
export const PLANNING_MANUAL_SAVE_REQUEST_EVENT = 'classroom:planning-manual-save-request';
export const PLANNING_UNSAVED_STATE_EVENT = 'classroom:planning-unsaved-state';
export const PLANNING_TAB_LEAVE_REQUEST_EVENT = 'classroom:planning-tab-leave-request';
export const PLANNING_TAB_LEAVE_RESULT_EVENT = 'classroom:planning-tab-leave-result';
export const PLANNING_VIEW_REQUEST_EVENT = 'classroom:planning-view-request';
export const PLANNING_TUTORIAL_START_REQUEST_EVENT = 'classroom:planning-tutorial-start-request';
export const PLANNING_READY_EVENT = 'classroom:planning-ready';
export const PLANNING_COURSE_SEATPLAN_OPEN_EVENT = 'classroom:planning-course-seatplan-open';
export const PLANNING_COURSE_CONTEXT_EVENT = 'classroom:planning-course-context';




export const GRADES_MANUAL_SAVE_STATE_EVENT = 'classroom:grades-manual-save-state';
export const GRADES_MANUAL_SAVE_REQUEST_EVENT = 'classroom:grades-manual-save-request';
export const GRADES_UNSAVED_STATE_EVENT = 'classroom:grades-unsaved-state';
export const GRADES_TAB_LEAVE_REQUEST_EVENT = 'classroom:grades-tab-leave-request';
export const GRADES_TAB_LEAVE_RESULT_EVENT = 'classroom:grades-tab-leave-result';
export const GRADES_VIEW_REQUEST_EVENT = 'classroom:grades-view-request';
export const GRADES_NAVIGATE_EVENT = 'classroom:grades-navigate';
export const GRADES_TUTORIAL_START_REQUEST_EVENT = 'classroom:grades-tutorial-start-request';
export const GRADES_READY_EVENT = 'classroom:grades-ready';
export const GRADES_GRADE_VAULT_STATE_EVENT = 'classroom:grades-grade-vault-state';
export const GRADES_GRADE_VAULT_REQUEST_EVENT = 'classroom:grades-grade-vault-request';
export const GRADES_GRADE_VAULT_OVERLAY_EVENT = 'classroom:grades-grade-vault-overlay';
export const GRADES_GRADE_VAULT_ACTIVITY_EVENT = 'classroom:grades-grade-vault-activity';
export const GRADES_COURSE_SEATPLAN_OPEN_EVENT = 'classroom:grades-course-seatplan-open';
export const GRADES_COURSE_CONTEXT_EVENT = 'classroom:grades-course-context';
export const GRADES_COURSE_SEATPLAN_SAVE_REQUEST_EVENT = 'classroom:grades-course-seatplan-save-request';
export const GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT = 'classroom:grades-course-seatplan-save-result';
export const GRADES_COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:grades-course-grade-config-request';
export const GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT = 'classroom:grades-course-grade-config-result';
export const GRADES_COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:grades-course-grade-save-request';
export const GRADES_COURSE_GRADE_SAVE_RESULT_EVENT = 'classroom:grades-course-grade-save-result';
export const GRADES_GRADE_ROSTER_COURSES_REQUEST_EVENT = 'classroom:grades-grade-roster-courses-request';
export const GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT = 'classroom:grades-grade-roster-courses-result';
export const GRADES_GRADE_ROSTER_IMPORT_REQUEST_EVENT = 'classroom:grades-grade-roster-import-request';
export const GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT = 'classroom:grades-grade-roster-import-result';
export const GRADES_NAME_LEARNING_DATA_REQUEST_EVENT = 'classroom:grades-name-learning-data-request';
export const GRADES_NAME_LEARNING_DATA_RESULT_EVENT = 'classroom:grades-name-learning-data-result';
export const GRADES_NAME_LEARNING_REVIEW_REQUEST_EVENT = 'classroom:grades-name-learning-review-request';
export const GRADES_NAME_LEARNING_REVIEW_RESULT_EVENT = 'classroom:grades-name-learning-review-result';
export const SEATPLAN_COURSE_CONTEXT_EVENT = 'classroom:seatplan-course-context';
export const SEATPLAN_COURSE_SAVE_REQUEST_EVENT = 'classroom:seatplan-course-save-request';
export const SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:seatplan-course-grade-config-request';
export const SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:seatplan-course-grade-save-request';
export const SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT = 'classroom:seatplan-grade-roster-courses-request';
export const SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT = 'classroom:seatplan-grade-roster-import-request';
export const NAME_LEARNING_DATA_REQUEST_EVENT = 'classroom:name-learning-data-request';
export const NAME_LEARNING_REVIEW_REQUEST_EVENT = 'classroom:name-learning-review-request';
export const NAME_LEARNING_SHELL_LAYOUT_EVENT = 'classroom:name-learning-shell-layout';
export const MERGER_SHELL_LAYOUT_EVENT = 'classroom:merger-shell-layout';
export const MERGER_TOOL_REQUEST_EVENT = 'classroom:merger-tool-request';
export const MERGER_OPEN_RESULT_REQUEST_EVENT = 'classroom:merger-open-result-request';
export const DUPLICATE_CHECK_SHELL_LAYOUT_EVENT = 'classroom:duplicate-check-shell-layout';
export const QR_SHELL_LAYOUT_EVENT = 'classroom:qr-shell-layout';
export const MODULE_OPEN_EXTERNAL_REQUEST_EVENT = 'classroom:module-open-external-request';
export const PLANNING_SHELL_LAYOUT_EVENT = 'classroom:planning-shell-layout';
export const GRADES_SHELL_LAYOUT_EVENT = 'classroom:grades-shell-layout';

export function normalizeTab(tab) {
  if (tab === TAB_MERGER) return TAB_MERGER;
  if (tab === TAB_DUPLICATE_CHECK) return TAB_DUPLICATE_CHECK;
  if (tab === TAB_PLANNING) return TAB_PLANNING;
  if (tab === TAB_GRADES) return TAB_GRADES;
  if (tab === TAB_RANDOM_PICKER) return TAB_RANDOM_PICKER;
  if (tab === TAB_SEATPLAN) return TAB_SEATPLAN;
  if (tab === TAB_NAME_LEARNING) return TAB_NAME_LEARNING;
  if (tab === TAB_QR) return TAB_QR;
  if (tab === TAB_WORK_PHASE || tab === TAB_MONITOR || tab === TAB_WORK_ORDER || tab === TAB_TIMER) {
    return TAB_WORK_PHASE;
  }
  return TAB_GROUPS;
}
