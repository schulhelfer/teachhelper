import { STUDENTS_UPDATED_EVENT } from '../../shared/student-sync-bus.js';
import {
  PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT,
  PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT,
  PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT,
  SEATPLAN_COURSE_CONTEXT_EVENT,
  SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT,
  SEATPLAN_COURSE_SAVE_REQUEST_EVENT,
} from '../../shell/tabs.js';

const SEATPLAN_URL = new URL('./app.html', import.meta.url);
const SEATPLAN_SHELL_LAYOUT_EVENT = 'classroom:seatplan-shell-layout';

export function mountSeatplan({ sideHost, mainHost, dialogHost, bus = document }) {
  if (!mainHost || mainHost.dataset.initialized === '1') return mainHost?._seatplanController || null;

  const targetOrigin = SEATPLAN_URL.origin;
  if (sideHost) sideHost.textContent = '';
  mainHost.textContent = '';
  if (dialogHost) {
    dialogHost.textContent = '';
    dialogHost.hidden = true;
    dialogHost.setAttribute('aria-hidden', 'true');
  }

  const frame = document.createElement('iframe');
  frame.className = 'seatplan-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = SEATPLAN_URL.href;

  let ready = false;
  let pendingDetail = null;
  let pendingShellLayout = null;
  let pendingCourseContext = null;
  let pendingCourseSaveResult = null;
  let pendingCourseGradeConfigResult = null;
  let pendingCourseGradeSaveResult = null;
  let disposed = false;

  const send = (detail) => {
    if (disposed) return;
    if (!detail) return;
    if (!ready || !frame.contentWindow) {
      pendingDetail = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: STUDENTS_UPDATED_EVENT, detail }, targetOrigin);
  };

  const applyShellLayout = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: SEATPLAN_SHELL_LAYOUT_EVENT, detail }, targetOrigin);
  };

  const sendCourseContext = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseContext = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: SEATPLAN_COURSE_CONTEXT_EVENT, detail }, targetOrigin);
  };

  const sendCourseSaveResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseSaveResult = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT, detail }, targetOrigin);
  };

  const sendCourseGradeConfigResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseGradeConfigResult = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT, detail }, targetOrigin);
  };

  const sendCourseGradeSaveResult = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingCourseGradeSaveResult = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT, detail }, targetOrigin);
  };

  const onWindowMessage = (event) => {
    if (disposed) return;
    if (event.source !== frame.contentWindow) return;
    if (event.origin !== targetOrigin) return;
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
