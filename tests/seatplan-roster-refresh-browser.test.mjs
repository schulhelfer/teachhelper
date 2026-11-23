import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('saving the grades roster updates the linked seatplan without replacing its working layout', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1400, height: 1000 } });
  const result = await evaluate(async () => {
    const { installWorkspaceController } = await import('/src/modules/workspace/index.js');
    const { createWorkspaceClient } = await import('/src/modules/workspace/client.js');
    const { createPlanningSeatplanBridge } = await import('/src/app/planning-seatplan-bridge.js');
    const {
      GRADES_COURSE_SEATPLAN_OPEN_EVENT,
      GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
      SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT,
    } = await import('/src/shell/tabs.js');
    const controller = installWorkspaceController(window, { ephemeral: true });
    const client = createWorkspaceClient(controller, 'grades');
    const { data, operations } = client;
    const sharedRoster = [];
    const { id: yearId } = data.getActiveSchoolYear();
    const courseId = data.createCourse(yearId, 'Testkurs A');
    const otherCourseId = data.createCourse(yearId, 'Testkurs B');
    await operations.setGradeVaultEncryptionEnabledFromSettings(false);
    const makePlan = (seats, preferences = {}, teacherDistances = []) => ({
      grid: { rows: 10, cols: 10 }, activeSeats: Object.keys(seats), seats, preferences,
      conditions: { teacherDistances },
    });
    const [kept, removed] = await operations.runGradeCourseMutation(courseId, () => {
      const [first, second] = data.replaceGradeStudentsForCourse(courseId, [
        { firstName: 'Lernperson A' }, { firstName: 'Lernperson B' },
      ]);
      data.createGradeSeatPlan(courseId, makePlan(
        { '1-1': String(first.id), '1-2': String(second.id), '1-3': null, '2-1': 'TEACHER' },
        { [first.id]: { prefersAlone: true, buddies: [String(second.id)] } },
        [{ studentId: String(first.id), maxDistance: 3 }, { studentId: String(second.id), maxDistance: 4 }],
      ));
      data.createGradeSeatPlan(courseId, makePlan({
        '1-1': String(second.id), '1-2': String(first.id),
      }));
      return [first, second];
    });
    await operations.runGradeCourseMutation(otherCourseId, () => {
      data.replaceGradeStudentsForCourse(otherCourseId, [{ firstName: 'Lernperson D' }]);
    });

    const createHost = () => document.body.appendChild(document.createElement('div'));
    const els = {
      gradesHost: createHost(),
      seatplanSideHost: createHost(),
      seatplanMainHost: createHost(),
      seatplanDialogHost: createHost(),
    };
    const bridge = createPlanningSeatplanBridge({
      els,
      getChromeCollapsed: () => false,
      rosterStore: { dispatch: (detail) => sharedRoster.push(detail) },
    });
    let otherImports = 0;
    document.addEventListener(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, () => { otherImports += 1; });
    window.addEventListener(GRADES_COURSE_SEATPLAN_OPEN_EVENT, (event) => {
      bridge.sendCourseSeatplanContext(event.detail);
    });
    bridge.ensureTabInitialized('grades');
    bridge.ensureTabInitialized('seatplan');
    const gradesFrame = els.gradesHost.querySelector('iframe');
    const seatplanFrame = els.seatplanMainHost.querySelector('iframe');
    gradesFrame.loading = seatplanFrame.loading = 'eager';
    const waitFor = async (message, condition) => {
      const deadline = performance.now() + 8000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error(message);
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    };
    await waitFor('Modules did not load', () => gradesFrame.contentWindow.__teachhelperGradesApp?.frame
      && seatplanFrame.contentDocument.querySelector('#app'));
    const grades = gradesFrame.contentWindow.__teachhelperGradesApp.frame;
    const seatplan = seatplanFrame.contentDocument;
    const setTab = (activeTab) => bridge.applyModuleShellLayout('seatplan', { activeTab });
    const seat = (id) => seatplan.querySelector(`[data-seat="${id}"]`);
    const seatName = (id) => seat(id)?.querySelector('.seat-name-lines')?.textContent.trim() || '';
    const unseated = () => seatplan.querySelector('#unseated').textContent;
    const openCourse = (id) => operations.withTemporaryGradeCourse(id, () => grades.dispatchCourseSeatplanOpen(id));
    const view = seatplanFrame.contentWindow;
    function nextRosterRefresh() {
      return new Promise(resolve => view.addEventListener('message', function onMessage(event) {
        if (event.data?.type !== GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT || event.data?.detail?.mode !== 'seatplan-refresh') return;
        view.removeEventListener('message', onMessage);
        resolve(event.data.detail);
      }));
    }
    async function saveRoster(edit) {
      await grades.openCourseStudentsDialog(courseId);
      const draft = grades.courseDialogDraft;
      draft.students = edit(draft.students);
      draft.confirmedRemovedStudentIds = draft.baseStudentIds.filter(id => !draft.students.some(student => student.id === id));
      await grades.submitCourseStudentsDialog();
      if (grades.courseDialogDraft) throw new Error('Grades roster was not saved');
    }

    setTab('seatplan');
    await openCourse(courseId);
    await waitFor('Saved course plan was not loaded', () => seatName('1-1') === 'Lernperson A');
    const transfer = new view.DataTransfer();
    seat('1-1').querySelector('.seat-content').dispatchEvent(new view.DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer: transfer,
    }));
    seat('1-3').dispatchEvent(new view.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    seat('1-4').click();
    await waitFor('Seat was not moved', () => seatName('1-3') === 'Lernperson A');

    setTab('grades');
    await saveRoster(students => [
      { ...students.find(student => student.id === kept.id), rufname: 'Rufname A' },
      { firstName: 'Lernperson C' },
    ]);
    const hiddenName = seatName('1-3');
    setTab('seatplan');
    await waitFor('Refreshed roster was not displayed', () =>
      seatName('1-3') === 'Rufname A' && unseated().includes('Lernperson C'));
    const working = {
      previousSeat: seatName('1-1'),
      removedSeat: seatName('1-2'),
      addedSeat: seat('1-4').classList.contains('active'),
      teacherSeat: seat('2-1').querySelector('.teacher-label')?.textContent.trim(),
    };
    seatplan.querySelector('#export-plan').click();
    seatplan.querySelector('#course-save-dialog-grades').click();
    await waitFor('Refreshed plan could not be saved', () =>
      seatplan.querySelectorAll('.course-seatplan-item').length === 3);
    const saved = (await operations.getGradeCourseStateSnapshot(courseId)).gradeSeatPlans
      .find(row => row.plan.seats['1-3'] === String(kept.id)).plan;
    seatplan.querySelector('.course-seatplan-item.is-current button').click();
    await waitFor('Saved variant did not adopt the updated roster', () => seatName('1-1') === 'Rufname A');
    const savedVariant = { first: seatName('1-1'), removed: seatName('1-2'), unseated: unseated() };

    setTab('grades');
    await saveRoster(() => []);
    const canAccessGradeVault = grades.canAccessGradeVault.bind(grades);
    grades.canAccessGradeVault = () => false;
    const lockedResponse = nextRosterRefresh();
    setTab('seatplan');
    const lockedResult = await lockedResponse;
    const locked = {
      ok: lockedResult.ok,
      sentStudents: Object.hasOwn(lockedResult, 'students'),
      name: seatName('1-1'),
      unlockDialogOpened: grades.refs.gradeVaultDialog.open,
    };
    grades.canAccessGradeVault = canAccessGradeVault;
    controller.markChanged('grades');
    await waitFor('Empty course roster was ignored', () => seatName('1-1') === '' && !unseated().includes('Lernperson C'));
    seatplan.querySelector('.course-seatplan-item:not(.is-current) button').click();
    const rosterUpdateMadePlanDirty = seatplan.querySelector('#course-seatplan-confirm-dialog').open;

    let delayed;
    let delayedRequests = 0;
    const respond = grades.respondWithCourseSeatplanRoster.bind(grades);
    grades.respondWithCourseSeatplanRoster = (detail) => new Promise(resolve => {
      delayedRequests += 1;
      delayed = () => {
        grades.dispatchGradeRosterImportResult({
          ...detail, ok: true, students: [{ id: String(removed.id), first: 'Veraltete Liste' }],
        });
        resolve();
      };
    });
    controller.markChanged('grades');
    await waitFor('No refresh request could be delayed', () => delayed);
    controller.markChanged('grades');
    controller.markChanged('grades');
    await openCourse(otherCourseId);
    await waitFor('Course switch failed', () => unseated().includes('Lernperson D'));
    grades.respondWithCourseSeatplanRoster = respond;
    const lateResult = nextRosterRefresh();
    delayed();
    await lateResult;
    const afterLateResponse = unseated();

    seatplan.querySelector('#course-roster-reset-button').click();
    seatplan.querySelector('#course-roster-reset-dialog-confirm').click();
    await waitFor('Course roster was not reset', () => !unseated().includes('Lernperson D'));
    view.postMessage({
      type: 'classroom:students-updated',
      detail: { source: 'groups', students: [{ id: 'csv-1', first: 'CSV-Lernperson' }], csvName: 'Testliste.csv' },
    }, location.origin);
    await waitFor('CSV roster was not displayed', () => unseated().includes('CSV-Lernperson'));
    let csvRefreshRequests = 0;
    document.addEventListener(SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT, event => {
      if (event.detail?.mode === 'seatplan-refresh') csvRefreshRequests += 1;
    });
    const invalidation = new Promise(resolve => view.addEventListener('message', function onMessage(event) {
      if (event.data?.type !== 'classroom:seatplan-grade-roster-courses-outdated') return;
      view.removeEventListener('message', onMessage);
      setTimeout(resolve, 0);
    }));
    controller.markChanged('grades');
    await invalidation;
    const csvRoster = unseated();
    bridge.dispose();
    return {
      hiddenName, working, saved, savedVariant, rosterUpdateMadePlanDirty, afterLateResponse, csvRefreshRequests,
      csvRoster, locked, delayedRequests, sharedRoster, otherImports, keptId: String(kept.id), removedId: String(removed.id),
    };
  });
  assert.equal(result.hiddenName, 'Lernperson A');
  assert.deepEqual(result.working, { previousSeat: '', removedSeat: '', addedSeat: true, teacherSeat: 'Lehrkraft' });
  assert.equal(result.saved.seats['1-3'], result.keptId);
  assert.equal(result.saved.seats['1-2'], null);
  assert.equal(result.saved.preferences[result.keptId].prefersAlone, true);
  assert.deepEqual(result.saved.preferences[result.keptId].buddies, []);
  assert.equal(result.removedId in result.saved.preferences, false);
  assert.deepEqual(result.saved.conditions.teacherDistances, [{ studentId: result.keptId, maxDistance: 3 }]);
  assert.equal(result.savedVariant.first, 'Rufname A');
  assert.equal(result.savedVariant.removed, '');
  assert.match(result.savedVariant.unseated, /Lernperson C/);
  assert.equal(result.rosterUpdateMadePlanDirty, false);
  assert.deepEqual(result.locked, { ok: false, sentStudents: false, name: 'Rufname A', unlockDialogOpened: false });
  assert.equal(result.delayedRequests, 1);
  assert.match(result.afterLateResponse, /Lernperson D/);
  assert.doesNotMatch(result.afterLateResponse, /Veraltete Liste/);
  assert.equal(result.csvRefreshRequests, 0);
  assert.match(result.csvRoster, /CSV-Lernperson/);
  assert.deepEqual(result.sharedRoster, []);
  assert.equal(result.otherImports, 0);
});
