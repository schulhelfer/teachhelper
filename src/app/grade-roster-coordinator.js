import { STUDENTS_SYNC_SOURCE_GRADES } from '../shared/student-sync-bus.js';
import {
  GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  TAB_GROUPS,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
} from '../shell/tabs.js';

export function createGradeRosterCoordinator({
  documentBus = typeof document !== 'undefined' ? document : null,
  view = typeof window !== 'undefined' ? window : null,
  elements = {},
  bridge = null,
  getActiveTab = () => '',
  setActiveTab = () => {},
  getRosterLabel = () => '',
  isRandomPickerActive = () => false,
  isTutorialDemoActive = () => false,
  normalizePickerWeight = (value) => value,
  showMessage = () => {},
  onPickerBindingChange = () => {},
} = {}) {
  const {
    gradeRosterImportMenu,
    gradeRosterImportTrigger,
    gradeRosterPills,
    randomPickerCourseReset,
    resizeTarget,
  } = elements;
  let requestSequence = 0;
  let pendingCoursesRequestId = '';
  let pendingImportRequestId = '';
  let courses = [];
  let coursesState = 'idle';
  let hasAvailableCourses = true;
  let selectedCourseId = 0;
  let selectedCourseName = '';
  let pickerBinding = null;
  let pickerSaveSequence = 0;
  let resizeObserver = null;
  const pendingPickerSaveRequestIds = new Set();
  const listeners = [];

  const bind = (target, type, listener) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  };

  const getEventDetail = (event) => {
    const CustomEventType = view?.CustomEvent;
    if (typeof CustomEventType === 'function' && !(event instanceof CustomEventType)) return null;
    return event?.detail && typeof event.detail === 'object' ? event.detail : null;
  };

  const createRequestId = () => `shell-grade-roster-${Date.now()}-${++requestSequence}`;

  const closeImportMenu = () => {
    if (!gradeRosterImportMenu) return;
    gradeRosterImportMenu.hidden = true;
    gradeRosterImportMenu.replaceChildren();
    gradeRosterImportTrigger?.setAttribute('aria-expanded', 'false');
  };

  const showImportMessage = (message) => {
    if (!gradeRosterImportMenu || !documentBus?.createElement) return;
    gradeRosterImportMenu.replaceChildren();
    const row = documentBus.createElement('div');
    row.className = 'grade-roster-import-message';
    row.textContent = message;
    gradeRosterImportMenu.append(row);
  };

  const updatePickerBindingUi = () => {
    const bound = Boolean(pickerBinding);
    if (!randomPickerCourseReset) return;
    randomPickerCourseReset.hidden = !bound || !isRandomPickerActive();
    randomPickerCourseReset.title = bound
      ? `Kursbindung zu „${pickerBinding.courseName}“ lösen`
      : 'Kursbindung lösen';
  };

  const getPickerConfig = () => {
    if (!pickerBinding) return null;
    return {
      weightsByStudentId: Object.fromEntries(pickerBinding.students.map((student) => [
        String(student.id),
        normalizePickerWeight(student.randomWeight),
      ])),
      autoDisableSelected: Boolean(pickerBinding.autoDisableSelected),
    };
  };

  const savePickerConfig = ({ deferSave = false } = {}) => {
    if (deferSave) return false;
    const binding = pickerBinding;
    const config = getPickerConfig();
    if (!binding || !config) return false;
    const requestId = `shell-grade-picker-${Date.now()}-${++pickerSaveSequence}`;
    pendingPickerSaveRequestIds.add(requestId);
    bridge?.requestGradePickerConfigSave?.({
      requestId,
      courseId: binding.courseId,
      rosterToken: binding.rosterToken,
      config,
    });
    return true;
  };

  const syncImportHeight = () => {
    gradeRosterPills?.parentElement?.style.removeProperty('height');
  };

  const setImportSurfaceVisible = (visible) => {
    const surface = gradeRosterPills?.parentElement;
    const row = gradeRosterPills?.closest('.roster-import-row');
    if (surface) surface.hidden = !visible;
    row?.classList.toggle('grade-roster-import-unavailable', !visible);
  };

  const setImportColumns = (coursePercent = 50) => {
    const row = gradeRosterPills?.closest('.roster-import-row');
    if (!row) return;
    const normalizedCoursePercent = Math.max(50, Math.min(200 / 3, Number(coursePercent) || 50));
    row.style.setProperty('--grade-roster-csv-column', `${100 - normalizedCoursePercent}fr`);
    row.style.setProperty('--grade-roster-course-column', `${normalizedCoursePercent}fr`);
  };

  const getPillRowCount = () => {
    if (!gradeRosterPills?.children.length) return 0;
    return new Set([...gradeRosterPills.children].map((pill) => Math.round(pill.offsetTop))).size;
  };

  const fitImportColumns = () => {
    if (!gradeRosterPills || gradeRosterPills.clientWidth < 1 || gradeRosterPills.clientHeight < 1) return;
    if (view?.matchMedia?.('(max-width: 420px)').matches) {
      setImportColumns(50);
      return;
    }
    const candidates = [...Array.from({ length: 17 }, (_, index) => 50 + index), 200 / 3];
    let bestPercent = 50;
    setImportColumns(bestPercent);
    let bestRows = getPillRowCount();
    for (const coursePercent of candidates.slice(1)) {
      setImportColumns(coursePercent);
      const rows = getPillRowCount();
      if (rows < bestRows) {
        bestRows = rows;
        bestPercent = coursePercent;
      }
    }
    setImportColumns(bestPercent);
  };

  const importCourse = (courseId) => {
    if (isTutorialDemoActive()) {
      showMessage('Demo: Importe aus dem Notenmodul verändern die Beispieldaten nicht.', 'info');
      return;
    }
    const requestId = createRequestId();
    pendingImportRequestId = requestId;
    bridge?.requestGradeRosterImport?.({
      requestId,
      courseId: Number(courseId || 0),
      mode: isRandomPickerActive() ? 'picker' : 'roster',
      returnTab: getActiveTab(),
    });
  };

  const renderCoursePills = () => {
    if (!gradeRosterPills || !gradeRosterImportTrigger || !documentBus?.createElement) return;
    const hasNoAvailableCourses = coursesState === 'ready' && !hasAvailableCourses;
    setImportSurfaceVisible(!hasNoAvailableCourses);
    if (hasNoAvailableCourses) {
      gradeRosterPills.replaceChildren();
      gradeRosterPills.hidden = true;
      gradeRosterImportTrigger.hidden = true;
      closeImportMenu();
      setImportColumns(50);
      return;
    }
    syncImportHeight();
    gradeRosterPills.replaceChildren();
    gradeRosterImportTrigger.hidden = true;
    if (coursesState === 'loading') {
      setImportColumns(50);
      const loading = documentBus.createElement('span');
      loading.className = 'grade-roster-pills-loading';
      loading.textContent = 'Notenkurse werden geladen …';
      gradeRosterPills.append(loading);
      gradeRosterPills.hidden = false;
      return;
    }
    if (coursesState !== 'ready' || !courses.length) {
      setImportColumns(50);
      gradeRosterPills.hidden = true;
      gradeRosterImportTrigger.hidden = false;
      return;
    }
    courses.forEach((course) => {
      const button = documentBus.createElement('button');
      const color = String(course?.color || '#475569');
      button.type = 'button';
      button.className = 'grade-roster-pill';
      button.textContent = String(course?.name || 'Kurs');
      button.style.background = color;
      button.style.color = '#000000';
      const courseName = String(course?.name || '').trim();
      const courseId = Number(course?.id || 0);
      const isSelected = isRandomPickerActive()
        ? Boolean(pickerBinding) && courseId === pickerBinding.courseId
        : (
          (selectedCourseId > 0 && courseId === selectedCourseId)
          || Boolean(selectedCourseName && courseName === selectedCourseName)
          || (Boolean(courseName) && getRosterLabel() === `${courseName} (Notenmodul)`)
        );
      button.classList.toggle('is-imported', isSelected);
      if (isSelected) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => importCourse(course?.id));
      gradeRosterPills.append(button);
    });
    gradeRosterPills.hidden = false;
    if (gradeRosterPills.clientWidth < 1 || gradeRosterPills.clientHeight < 1) return;
    fitImportColumns();
    if (
      gradeRosterPills.scrollHeight > gradeRosterPills.clientHeight + 1
      || gradeRosterPills.scrollWidth > gradeRosterPills.clientWidth + 1
    ) {
      gradeRosterPills.hidden = true;
      gradeRosterImportTrigger.hidden = false;
    }
  };

  const renderImportCourses = (nextCourses) => {
    if (!gradeRosterImportMenu || !documentBus?.createElement) return;
    gradeRosterImportMenu.replaceChildren();
    if (!Array.isArray(nextCourses) || nextCourses.length === 0) {
      showImportMessage('Keine Notenkurse mit Lernenden vorhanden.');
      return;
    }
    nextCourses.forEach((course) => {
      const button = documentBus.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = String(course?.name || 'Kurs');
      button.addEventListener('click', () => {
        showImportMessage('Namensliste wird importiert …');
        importCourse(course?.id);
      });
      gradeRosterImportMenu.append(button);
    });
  };

  const requestCourses = ({ interactive = false, unlock = false } = {}) => {
    if (!interactive && pendingCoursesRequestId) return false;
    const requestId = createRequestId();
    pendingCoursesRequestId = requestId;
    if (interactive) {
      coursesState = 'loading';
      renderCoursePills();
    }
    bridge?.requestGradeRosterCourses?.({
      requestId,
      returnTab: getActiveTab(),
      interactive,
      unlock,
      restoreTabAfterUnlock: true,
    });
    return true;
  };

  const handleImportTriggerClick = () => {
    if (isTutorialDemoActive()) {
      showMessage('Demo: Importe aus dem Notenmodul verändern die Beispieldaten nicht.', 'info');
      return;
    }
    if (!gradeRosterImportMenu) return;
    if (!gradeRosterImportMenu.hidden) {
      closeImportMenu();
      return;
    }
    gradeRosterImportMenu.hidden = false;
    gradeRosterImportTrigger?.setAttribute('aria-expanded', 'true');
    if (coursesState === 'ready' && courses.length) {
      renderImportCourses(courses);
      return;
    }
    showImportMessage('Notenkurse werden geladen …');
    requestCourses({ interactive: true });
  };

  const handleCoursesResult = (event) => {
    const detail = getEventDetail(event);
    if (!detail || String(detail.requestId || '') !== pendingCoursesRequestId) return;
    pendingCoursesRequestId = '';
    if (detail.locked) {
      courses = Array.isArray(detail.courses) ? detail.courses : [];
      hasAvailableCourses = detail.hasCourses !== false;
      coursesState = 'ready';
      closeImportMenu();
      renderCoursePills();
      return;
    }
    if (!detail.ok) {
      if (detail.unlockRequired || detail.unlockCancelled) {
        closeImportMenu();
        return;
      }
      showImportMessage(detail.message || 'Notenkurse konnten nicht geladen werden.');
      courses = [];
      coursesState = 'error';
      renderCoursePills();
      return;
    }
    courses = Array.isArray(detail.courses) ? detail.courses : [];
    hasAvailableCourses = detail.hasCourses !== false;
    coursesState = 'ready';
    closeImportMenu();
    renderCoursePills();
  };

  const handleImportResult = (event) => {
    const detail = getEventDetail(event);
    if (!detail || String(detail.requestId || '') !== pendingImportRequestId) return;
    pendingImportRequestId = '';
    if (!detail.ok) {
      if (detail.unlockRequired || detail.unlockCancelled) {
        closeImportMenu();
        return;
      }
      const message = detail.message || 'Namensliste konnte nicht importiert werden.';
      if (gradeRosterImportMenu?.hidden) {
        showMessage(message, 'warn');
      } else {
        showImportMessage(message);
      }
      requestCourses();
      return;
    }
    if (detail.mode === 'picker') {
      const storedConfig = detail.pickerConfig && typeof detail.pickerConfig === 'object'
        ? detail.pickerConfig
        : {};
      const storedWeights = storedConfig.weightsByStudentId && typeof storedConfig.weightsByStudentId === 'object'
        ? storedConfig.weightsByStudentId
        : {};
      pickerBinding = {
        courseId: Number(detail.courseId || 0),
        courseName: String(detail.courseName || '').trim(),
        rosterToken: String(detail.rosterToken || ''),
        autoDisableSelected: storedConfig.autoDisableSelected === true,
        students: (Array.isArray(detail.students) ? detail.students : []).map((student) => ({
          ...student,
          randomWeight: normalizePickerWeight(storedWeights[String(student?.id || '')]),
        })),
      };
      updatePickerBindingUi();
      onPickerBindingChange();
    } else {
      selectedCourseId = Number(detail.courseId || 0);
      selectedCourseName = String(detail.courseName || '').trim();
    }
    renderCoursePills();
    closeImportMenu();
    showMessage(detail.mode === 'picker'
      ? `Picker mit „${detail.courseName}“ verbunden.`
      : `${Number(detail.students?.length || 0)} Lernende aus „${detail.courseName}“ importiert.`, 'success', { presentation: 'toast' });
    requestCourses();
  };

  const restoreReturnTab = (event) => {
    const detail = getEventDetail(event);
    if (!detail?.restoreTabAfterUnlock) return;
    const returnTab = String(detail.returnTab || '');
    if (![TAB_GROUPS, TAB_RANDOM_PICKER, TAB_SEATPLAN].includes(returnTab)) return;
    setActiveTab(returnTab);
  };

  const handlePickerSaveResult = (event) => {
    const detail = getEventDetail(event);
    if (!detail || !pendingPickerSaveRequestIds.delete(String(detail.requestId || ''))) return;
    if (detail.ok || detail.unlockRequired || detail.unlockCancelled) return;
    showMessage(detail.message || 'Picker-Konfiguration konnte nicht gespeichert werden.', 'warn');
  };

  const handleDocumentClick = (event) => {
    const ElementType = view?.Element;
    if (typeof ElementType === 'function' && event.target instanceof ElementType
      && !event.target.closest('.grade-roster-import')) {
      closeImportMenu();
    }
  };

  const clearPickerBinding = () => {
    if (!pickerBinding) return false;
    pickerBinding = null;
    updatePickerBindingUi();
    onPickerBindingChange();
    renderCoursePills();
    return true;
  };

  const updateSharedRosterSelection = (detail) => {
    if (!detail || typeof detail !== 'object') return;
    selectedCourseId = detail.source === STUDENTS_SYNC_SOURCE_GRADES
      ? Number(detail.gradeCourseId || 0)
      : 0;
    selectedCourseName = detail.source === STUDENTS_SYNC_SOURCE_GRADES
      ? String(detail.gradeCourseName || '').trim()
      : '';
  };

  const getPickerStudents = (fallbackStudents) => pickerBinding?.students || fallbackStudents;

  const getPickerAutoDisableSelected = (fallbackValue) => (
    pickerBinding?.autoDisableSelected ?? fallbackValue
  );

  const setPickerAutoDisableSelected = (value, { deferSave = false } = {}) => {
    if (!pickerBinding) return false;
    pickerBinding.autoDisableSelected = value;
    savePickerConfig({ deferSave });
    return true;
  };

  const refreshLayout = () => {
    renderCoursePills();
  };

  const dispose = () => {
    listeners.splice(0).forEach((remove) => remove());
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    pendingPickerSaveRequestIds.clear();
  };

  bind(gradeRosterImportTrigger, 'click', handleImportTriggerClick);
  bind(randomPickerCourseReset, 'click', clearPickerBinding);
  bind(documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, handleCoursesResult);
  bind(documentBus, GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, handleImportResult);
  bind(documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, restoreReturnTab);
  bind(documentBus, GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, restoreReturnTab);
  bind(documentBus, GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, handlePickerSaveResult);
  bind(documentBus, 'click', handleDocumentClick);

  const ResizeObserverType = view?.ResizeObserver;
  if (typeof ResizeObserverType === 'function' && resizeTarget) {
    resizeObserver = new ResizeObserverType(refreshLayout);
    resizeObserver.observe(resizeTarget);
  }

  return {
    requestCourses,
    updateSharedRosterSelection,
    getPickerStudents,
    getPickerAutoDisableSelected,
    setPickerAutoDisableSelected,
    savePickerConfig,
    clearPickerBinding,
    refreshLayout,
    dispose,
  };
}
