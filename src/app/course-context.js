import {
  GRADES_COURSE_CONTEXT_EVENT,
  GRADES_COURSE_SEATPLAN_OPEN_EVENT,
  PLANNING_COURSE_CONTEXT_EVENT,
  PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
  TAB_GRADES,
  TAB_PLANNING,
  TAB_SEATPLAN,
} from '../shell/tabs.js';

export function createCourseContext({
  eventTarget = typeof window !== 'undefined' ? window : null,
  view = eventTarget || globalThis,
  now = () => Date.now(),
  getActiveTab = () => '',
  setActiveTab = () => {},
  dispatchGradesNavigation = () => {},
  dispatchPlanningViewRequest = () => {},
  ensureSeatplanInitialized = () => {},
  sendCourseSeatplanContext = () => {},
} = {}) {
  let sharedCourseContextId = 0;
  let planningCourseViewCourseId = 0;
  let gradesAutoSelectSuppressedUntil = 0;
  let pendingSeatplanContext = null;
  let pendingSeatplanContextFrame = 0;
  let disposed = false;

  const rememberSharedCourseContext = (event) => {
    const courseId = Number(event?.detail?.courseId || 0);
    if (courseId) sharedCourseContextId = courseId;
    if (event?.type === PLANNING_COURSE_CONTEXT_EVENT) {
      planningCourseViewCourseId = event?.detail?.courseViewOpen && courseId ? courseId : 0;
    }
  };

  const deliverPendingSeatplanContext = () => {
    pendingSeatplanContextFrame = 0;
    if (!pendingSeatplanContext || getActiveTab() !== TAB_SEATPLAN) return;
    const detail = pendingSeatplanContext;
    pendingSeatplanContext = null;
    ensureSeatplanInitialized();
    sendCourseSeatplanContext(detail);
  };

  const schedulePendingSeatplanContext = (attempt = 0) => {
    if (!pendingSeatplanContext || pendingSeatplanContextFrame) return;
    if (getActiveTab() === TAB_SEATPLAN) {
      deliverPendingSeatplanContext();
      return;
    }
    if (attempt >= 120) return;
    if (typeof view?.requestAnimationFrame === 'function') {
      pendingSeatplanContextFrame = view.requestAnimationFrame(() => {
        pendingSeatplanContextFrame = 0;
        schedulePendingSeatplanContext(attempt + 1);
      });
      return;
    }
    if (typeof view?.setTimeout === 'function') {
      pendingSeatplanContextFrame = view.setTimeout(() => {
        pendingSeatplanContextFrame = 0;
        schedulePendingSeatplanContext(attempt + 1);
      }, 16);
    }
  };

  const openCourseSeatplan = (event) => {
    const CustomEventType = view?.CustomEvent;
    const detail = typeof CustomEventType === 'function' && event instanceof CustomEventType
      ? event.detail
      : null;
    if (!detail || typeof detail !== 'object') return;
    pendingSeatplanContext = detail;
    ensureSeatplanInitialized();
    if (getActiveTab() === TAB_SEATPLAN) {
      schedulePendingSeatplanContext();
      return;
    }
    setActiveTab(TAB_SEATPLAN);
  };

  const suppressGradesAutoSelect = () => {
    gradesAutoSelectSuppressedUntil = now() + 2000;
  };

  const handleTabActivating = (tab) => {
    if (tab === TAB_GRADES) {
      if (planningCourseViewCourseId) {
        dispatchGradesNavigation({
          courseId: planningCourseViewCourseId,
          source: 'course-context',
        });
      } else if (now() >= gradesAutoSelectSuppressedUntil) {
        dispatchGradesNavigation({
          autoSelectCourse: true,
          source: 'course-context',
        });
      }
    } else if (tab === TAB_PLANNING && sharedCourseContextId) {
      dispatchPlanningViewRequest({
        view: 'course',
        courseId: sharedCourseContextId,
        source: 'course-context',
      });
    }
    if (tab === TAB_SEATPLAN) schedulePendingSeatplanContext();
  };

  const bindings = [
    [PLANNING_COURSE_CONTEXT_EVENT, rememberSharedCourseContext],
    [GRADES_COURSE_CONTEXT_EVENT, rememberSharedCourseContext],
    [PLANNING_COURSE_SEATPLAN_OPEN_EVENT, openCourseSeatplan],
    [GRADES_COURSE_SEATPLAN_OPEN_EVENT, openCourseSeatplan],
  ];
  bindings.forEach(([type, listener]) => eventTarget?.addEventListener?.(type, listener));

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    bindings.forEach(([type, listener]) => eventTarget?.removeEventListener?.(type, listener));
    if (pendingSeatplanContextFrame) {
      if (typeof view?.cancelAnimationFrame === 'function') {
        view.cancelAnimationFrame(pendingSeatplanContextFrame);
      } else {
        view?.clearTimeout?.(pendingSeatplanContextFrame);
      }
    }
    pendingSeatplanContextFrame = 0;
    pendingSeatplanContext = null;
  };

  return {
    suppressGradesAutoSelect,
    handleTabActivating,
    dispose,
  };
}
