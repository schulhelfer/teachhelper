import { STUDENTS_UPDATED_EVENT } from '../../shared/student-sync-bus.js';
import {
  createModuleFrame,
  isTrustedModuleMessage,
  postToModule,
} from '../../shared/module-frame-bridge.js';
import {
  PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT,
  PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT,
  PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT,
  PLANNING_GRADE_ROSTER_COURSES_RESULT_EVENT,
  PLANNING_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  SEATPLAN_COURSE_CONTEXT_EVENT,
  SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT,
  SEATPLAN_COURSE_SAVE_REQUEST_EVENT,
  SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT,
  SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT,
} from '../../shell/tabs.js';

const SEATPLAN_URL = new URL('./app.html', import.meta.url);
const SEATPLAN_SHELL_LAYOUT_EVENT = 'classroom:seatplan-shell-layout';

export function mountSeatplan({ sideHost, mainHost, dialogHost, bus = document }) {
  if (!mainHost || mainHost.dataset.initialized === '1') return mainHost?._seatplanController || null;

  if (sideHost) sideHost.textContent = '';
  mainHost.textContent = '';
  if (dialogHost) {
    dialogHost.textContent = '';
    dialogHost.hidden = true;
    dialogHost.setAttribute('aria-hidden', 'true');
  }

  const frame = createModuleFrame({
    className: 'seatplan-frame',
    loading: 'lazy',
    src: SEATPLAN_URL,
  });

  let ready = false;
  let pendingDetail = null;
  let pendingShellLayout = null;
  let pendingCourseContext = null;
  let pendingCourseSaveResult = null;
  let pendingCourseGradeConfigResult = null;
  let pendingCourseGradeSaveResult = null;
  let pendingGradeRosterCoursesResult = null;
  let pendingGradeRosterImportResult = null;
  let disposed = false;

  const send = (detail) => {
    if (disposed) return;
    if (!detail) return;
    if (!ready || !frame.contentWindow) {
      pendingDetail = detail;
      return;
    }
    postToModule(frame, { type: STUDENTS_UPDATED_EVENT, detail });
  };

  const applyShellLayout = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    postToModule(frame, { type: SEATPLAN_SHELL_LAYOUT_EVENT, detail });
  };

  const sendCourseContext = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseContext = detail;
      return;
    }
    postToModule(frame, { type: SEATPLAN_COURSE_CONTEXT_EVENT, detail });
  };

  const sendCourseSaveResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseSaveResult = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT, detail });
  };

  const sendCourseGradeConfigResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseGradeConfigResult = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT, detail });
  };

  const sendCourseGradeSaveResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseGradeSaveResult = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT, detail });
  };

  const sendGradeRosterCoursesResult = (detail) => {
    if (disposed || !detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingGradeRosterCoursesResult = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_GRADE_ROSTER_COURSES_RESULT_EVENT, detail });
  };

  const sendGradeRosterImportResult = (detail) => {
    if (disposed || !detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingGradeRosterImportResult = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_GRADE_ROSTER_IMPORT_RESULT_EVENT, detail });
  };

  const onWindowMessage = (event) => {
    if (disposed) return;
    if (!isTrustedModuleMessage(event, frame)) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === SEATPLAN_COURSE_SAVE_REQUEST_EVENT) {
      bus.dispatchEvent(new CustomEvent(SEATPLAN_COURSE_SAVE_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT) {
      bus.dispatchEvent(new CustomEvent(SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT) {
      bus.dispatchEvent(new CustomEvent(SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT) {
      bus.dispatchEvent(new CustomEvent(SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT) {
      bus.dispatchEvent(new CustomEvent(SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type !== STUDENTS_UPDATED_EVENT) return;
    bus.dispatchEvent(new CustomEvent(STUDENTS_UPDATED_EVENT, {
      detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
    }));
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    if (pendingDetail) {
      send(pendingDetail);
      pendingDetail = null;
    }
    if (pendingShellLayout) {
      applyShellLayout(pendingShellLayout);
      pendingShellLayout = null;
    }
    if (pendingCourseContext) {
      sendCourseContext(pendingCourseContext);
      pendingCourseContext = null;
    }
    if (pendingCourseSaveResult) {
      sendCourseSaveResult(pendingCourseSaveResult);
      pendingCourseSaveResult = null;
    }
    if (pendingCourseGradeConfigResult) {
      sendCourseGradeConfigResult(pendingCourseGradeConfigResult);
      pendingCourseGradeConfigResult = null;
    }
    if (pendingCourseGradeSaveResult) {
      sendCourseGradeSaveResult(pendingCourseGradeSaveResult);
      pendingCourseGradeSaveResult = null;
    }
    if (pendingGradeRosterCoursesResult) {
      sendGradeRosterCoursesResult(pendingGradeRosterCoursesResult);
      pendingGradeRosterCoursesResult = null;
    }
    if (pendingGradeRosterImportResult) {
      sendGradeRosterImportResult(pendingGradeRosterImportResult);
      pendingGradeRosterImportResult = null;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pendingDetail = null;
    pendingShellLayout = null;
    pendingCourseContext = null;
    pendingCourseSaveResult = null;
    pendingCourseGradeConfigResult = null;
    pendingCourseGradeSaveResult = null;
    pendingGradeRosterCoursesResult = null;
    pendingGradeRosterImportResult = null;
    frame.removeEventListener('load', onFrameLoad);
    window.removeEventListener('message', onWindowMessage);
    if (frame.isConnected) {
      frame.remove();
    }
    if (sideHost) {
      delete sideHost.dataset.initialized;
    }
    delete mainHost.dataset.initialized;
    if (dialogHost) {
      delete dialogHost.dataset.initialized;
      dialogHost.hidden = true;
      dialogHost.setAttribute('aria-hidden', 'true');
      dialogHost.textContent = '';
    }
    if (mainHost._seatplanController === controller) {
      delete mainHost._seatplanController;
    }
  };

  const controller = {
    frame,
    send,
    applyShellLayout,
    sendCourseContext,
    sendCourseSaveResult,
    sendCourseGradeConfigResult,
    sendCourseGradeSaveResult,
    sendGradeRosterCoursesResult,
    sendGradeRosterImportResult,
    isReady: () => ready,
    dispose
  };

  frame.addEventListener('load', onFrameLoad, { once: true });
  window.addEventListener('message', onWindowMessage);
  mainHost.appendChild(frame);
  if (sideHost) sideHost.dataset.initialized = '1';
  mainHost.dataset.initialized = '1';
  if (dialogHost) dialogHost.dataset.initialized = '1';
  mainHost._seatplanController = controller;
  return mainHost._seatplanController;
}
