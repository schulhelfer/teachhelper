import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE saving uses one verified write and keeps drafts on errors and conflicts', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const results = await evaluate(async () => {
    const [{ GradesApp }, { WorkspaceStore }, { WorkspaceRuntime }, { createWorkspacePublicApi }, { parseThdb1ContainerBytes, getThdb1FileHashAsync }] = await Promise.all([
      import('/src/modules/grades/app.js?dom-test'),
      import('/src/modules/workspace/store.js'),
      import('/src/modules/workspace/runtime.js'),
      import('/src/modules/workspace/public-api.js'),
      import('/src/shared/school-data/thdb.js'),
    ]);
    const results = [];
    for (const scenario of ['existing', 'new', 'encrypted', 'manual', 'verification', 'conflict', 'revision', 'fingerprint', 'invalid']) {
      const store = new WorkspaceStore();
      const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
      runtime.isManualPersistenceMode = () => false;
      const year = store.getActiveSchoolYear();
      const courseId = store.createCourse(year.id, 'Testkurs', '#336699');
      const otherCourseId = store.createCourse(year.id, 'Weiterer Kurs', '#336699');
      const testTasks = Array.from({ length: 20 }, (_, index) => ({
        id: `task-${index}`, title: `Aufgabe ${index + 1}`, maxBe: 10, afb: 'I',
      }));
      let assessmentId;
      for (const id of [otherCourseId, courseId]) {
        await runtime.runGradeCourseMutation(id, () => {
          store.replaceGradeStudentsForCourse(id, Array.from({ length: id === courseId ? 30 : 2 }, (_, index) => ({
            firstName: `Person ${index + 1}`, lastName: 'Test',
          })));
          const categoryId = store.getGradeStructureForPeriod(id, 'h1').categories[0].id;
          const createdId = store.createGradeAssessment(id, {
            title: 'Test', mode: 'test', halfYear: 'h1', categoryId, testTasks, testScale: 'sek2',
          });
          for (const student of store.listGradeStudents(id)) {
            store.setGradeTestEntry(student.id, createdId, Object.fromEntries(testTasks.map((task) => [task.id, 5])), {
              expectationHorizonComment: 'Individueller Kommentar',
            });
          }
          if (id === courseId) assessmentId = createdId;
        }, { skipAutoSave: true });
      }
      if (scenario === 'encrypted') await runtime.setupGradeVault('ausreichend-sicheres-passwort');
      let bytes = (await runtime.buildContainer('seed')).bytes;
      const initialBytes = bytes.slice();
      const initialSegments = parseThdb1ContainerBytes(bytes, { includeGradeCourseSegments: true }).gradeCourseSegments;
      let writes = 0;
      let corruptNextWrite = scenario === 'verification';
      let signalWriteStarted;
      let releaseWrite;
      const writeStarted = new Promise((resolve) => { signalWriteStarted = resolve; });
      const writeReleased = new Promise((resolve) => { releaseWrite = resolve; });
      const handle = {
        name: 'test.json',
        async getFile() {
          const current = bytes.slice();
          return { size: current.length, async arrayBuffer() { return current.buffer; } };
        },
        async createWritable() {
          let pending;
          return {
            async write(value) { pending = new Uint8Array(value).slice(); },
            async close() {
              writes += 1;
              signalWriteStarted();
              await writeReleased;
              bytes = pending;
              if (corruptNextWrite) {
                corruptNextWrite = false;
                bytes[bytes.length - 1] ^= 1;
              }
            },
            async abort() {},
          };
        },
      };
      runtime.fileHandle = handle;
      runtime.databaseLoaded = true;
      runtime.knownFileHash = await getThdb1FileHashAsync(bytes);
      runtime.commitPersistedVaultContainer(bytes);
      runtime.courseRepository.completeSave({ clearDeleted: true });
      if (scenario === 'manual') {
        runtime.isManualPersistenceMode = () => true;
        runtime.manualLoaded = true;
        runtime.persistence.downloadBytes = (value) => { bytes = value.slice(); writes += 1; };
      }
      const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
      const content = document.createElement('div');
      content.id = 'grades-entry-content';
      document.body.replaceChildren(content);
      const messages = [];
      const toasts = [];
      let baselineReads = 0;
      let contextReads = 0;
      const app = Object.create(GradesApp.prototype);
      Object.assign(app, {
        refs: { gradesEntryContent: content }, workspaceClient: api,
        store: {
          ...api.data,
          listGradeEntries() { baselineReads += 1; return api.data.listGradeEntries(); },
          createGradeAssessmentSnapshot(id) { baselineReads += 1; return api.data.createGradeAssessmentSnapshot(id); },
        },
        selectedCourseId: courseId, selectedGradesEntryAssessmentId: scenario === 'new' ? null : assessmentId,
        currentView: 'grades', gradesSubView: 'entry', gradeDeficitThreshold: 5,
        getSortedGradeStudentsForNameOrder: (students) => students,
        getGradeStudentDisplayName: (student) => student.firstName,
        getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraitPlaceholders: () => false,
        getCurrentGradeOverviewDisplaySystem: () => 'points', getCurrentGradeOverviewPredicateSuffixes: () => true,
        ensureGradeVaultReadyForGradesEntryMutation: () => true,
        confirmGradesEntryAfbRequirementsBeforeSave: async () => true,
        confirmGradesEntryAssessmentDestructiveChanges: async () => true,
        showInfoMessage: async (message) => { messages.push(message); },
        notifyParentToast: (message) => { toasts.push(message); },
        updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {},
        renderGradesEntryDistributionOverlay() {}, syncSegmentControlSlideStates() {},
        renderGradesView() {}, refreshOpenExpectationHorizonDialogTemplate() {}, focusGradeAssessmentInput() {},
        openGradesOverviewForCourse: () => true, hideGradePicker() {},
        getGradeTestInputContext(input) {
          contextReads += 1;
          return GradesApp.prototype.getGradeTestInputContext.call(this, input);
        },
      });
      const assessment = scenario === 'new' ? null : api.data.getGradeAssessment(assessmentId);
      if (!assessment) {
        app.gradesEntryDraft = { ...app.getGradesEntryDraft(courseId), title: 'Neuer Test', mode: 'test', testTasks };
      }
      const draft = assessment ? app.getGradesEntryAssessmentDraft(assessment) : app.getGradesEntryDraft(courseId);
      const originalBaseline = { revision: draft.baseCourseRevision, fingerprint: draft.baseFingerprint };
      const students = api.data.listGradeStudents(courseId);
      content.append(app.buildGradesTestEntryTable(api.data.getCourse(courseId), students, assessment, draft));
      const inputs = [...content.querySelectorAll('[data-grade-test-score]')];
      for (const input of inputs) input.value = '10';
      if (scenario === 'invalid') inputs[inputs.length - 1].value = '11';
      if (scenario === 'revision') {
        await runtime.runGradeCourseMutation(courseId, () => store.updateGradeAssessment(assessmentId, { title: 'Extern geändert' }), { skipAutoSave: true });
      }
      if (scenario === 'fingerprint') store.getGradeAssessment(assessmentId).title = 'Extern geändert';
      if (scenario === 'conflict') {
        const changed = new Uint8Array(bytes.length + 1);
        changed.set(bytes);
        bytes = changed;
      }
      const bytesBeforeSave = bytes.slice();
      baselineReads = contextReads = 0;
      const committed = app.commitGradesEntryInputsBeforeRerender({ requireTestTaskValues: true });
      const commitBaselineReads = baselineReads;
      const commitContextReads = contextReads;
      const keptBaseline = app.gradesEntryDraft.baseCourseRevision === originalBaseline.revision
        && app.gradesEntryDraft.baseFingerprint === originalBaseline.fingerprint;
      let saved;
      let reportedSuccessBeforeClose = false;
      if (committed) {
        const save = app.saveCurrentGradesEntry();
        if (['existing', 'new', 'encrypted', 'verification'].includes(scenario)) {
          await writeStarted;
          reportedSuccessBeforeClose = toasts.includes('Noten gespeichert') || !app.gradesEntryDraftDirty;
        }
        releaseWrite();
        saved = await save;
        await runtime.operationTail;
      } else {
        releaseWrite();
        saved = await app.saveCurrentGradesEntry();
      }
      const persisted = saved ? parseThdb1ContainerBytes(bytes, { includeGradeCourseSegments: true }).gradeCourseSegments : [];
      const savedAssessmentId = scenario === 'new'
        ? api.data.listGradeAssessments(courseId).find((item) => item.title === 'Neuer Test')?.id
        : assessmentId;
      const currentEntries = api.data.listGradeEntries().filter((entry) => Number(entry.assessmentId) === Number(savedAssessmentId));
      const otherSegment = (segments) => segments.find((segment) => segment.courseId === otherCourseId)?.text;
      let reopenedEntries = [];
      if (saved) {
        const reopenedStore = new WorkspaceStore();
        const reopenedRuntime = new WorkspaceRuntime(reopenedStore, { eventTarget: new EventTarget() });
        await reopenedRuntime.loadBytes(bytes, 'manual');
        if (scenario === 'encrypted') await reopenedRuntime.unlockGradeVault('ausreichend-sicheres-passwort');
        await reopenedRuntime.ensureGradeCourseLoaded(courseId);
        reopenedEntries = reopenedStore.gradeVaultState.gradeEntries.filter((entry) => Number(entry.assessmentId) === Number(savedAssessmentId));
      }
      results.push({
        scenario, saved, committed, writes, commitBaselineReads, commitContextReads, keptBaseline,
        dirty: Boolean(app.gradesEntryDraftDirty), courseDirty: runtime.dirtyCourseIds.has(courseId),
        reportedSuccessBeforeClose, messages: [...messages], toasts: [...toasts],
        fileUnchanged: bytes.length === bytesBeforeSave.length && bytes.every((byte, index) => byte === bytesBeforeSave[index]),
        initialFileRestored: bytes.length === initialBytes.length && bytes.every((byte, index) => byte === initialBytes[index]),
        otherCourseUnchanged: saved && otherSegment(persisted) === otherSegment(initialSegments),
        entryCount: currentEntries.length, reopenedCount: reopenedEntries.length,
        allScoresSaved: reopenedEntries.every((entry) => testTasks.every((task) => entry.testScores[task.id] === 10)),
        commentsPreserved: reopenedEntries.every((entry) => entry.expectationHorizonComment === (scenario === 'new' ? '' : 'Individueller Kommentar')),
        draftScoresPreserved: students.every((student) => testTasks.every((task) => app.gradesEntryDraft?.entries?.[student.id]?.testScores?.[task.id] === 10)),
        invalidMarked: inputs[inputs.length - 1].getAttribute('aria-invalid') === 'true',
      });
      if (scenario === 'verification') {
        const result = results[results.length - 1];
        const writesBeforeRetry = writes;
        result.retrySaved = await app.saveCurrentGradesEntry();
        await runtime.operationTail;
        result.retryWrites = writes - writesBeforeRetry;
        result.retryDirty = Boolean(app.gradesEntryDraftDirty || runtime.dirtyCourseIds.has(courseId));
        const retrySegments = parseThdb1ContainerBytes(bytes, { includeGradeCourseSegments: true }).gradeCourseSegments;
        const retryState = JSON.parse(retrySegments.find((segment) => segment.courseId === courseId).text);
        result.retryEntryCount = retryState.gradeEntries.length;
        result.retryScoresSaved = retryState.gradeEntries.every((entry) => testTasks.every((task) => entry.testScores[task.id] === 10));
        result.retryOtherCourseUnchanged = otherSegment(retrySegments) === otherSegment(initialSegments);
      }
    }
    return results;
  });

  for (const result of results) {
    assert.equal(result.keptBaseline, true, result.scenario);
    assert.equal(result.commitBaselineReads, 0, result.scenario);
    assert.ok(result.commitContextReads <= 30, result.scenario);
    assert.equal(result.reportedSuccessBeforeClose, false, result.scenario);
    if (['existing', 'new', 'encrypted', 'manual'].includes(result.scenario)) {
      assert.equal(result.saved, true, result.scenario);
      assert.equal(result.writes, 1, result.scenario);
      assert.equal(result.dirty, false, result.scenario);
      assert.equal(result.courseDirty, false, result.scenario);
      assert.equal(result.otherCourseUnchanged, true, result.scenario);
      assert.equal(result.entryCount, 30, result.scenario);
      assert.equal(result.reopenedCount, 30, result.scenario);
      assert.equal(result.allScoresSaved, true, result.scenario);
      assert.equal(result.commentsPreserved, true, result.scenario);
      assert.deepEqual(result.toasts, ['Noten gespeichert'], result.scenario);
    } else {
      assert.equal(result.saved, false, result.scenario);
      assert.equal(result.toasts.includes('Noten gespeichert'), false, result.scenario);
      assert.equal(result.fileUnchanged, true, result.scenario);
      if (result.scenario === 'verification') {
        assert.equal(result.writes, 2);
        assert.equal(result.initialFileRestored, true);
        assert.equal(result.retrySaved, true);
        assert.equal(result.retryWrites, 1);
        assert.equal(result.retryDirty, false);
        assert.equal(result.retryEntryCount, 30);
        assert.equal(result.retryScoresSaved, true);
        assert.equal(result.retryOtherCourseUnchanged, true);
      } else {
        assert.equal(result.writes, 0, result.scenario);
      }
      if (result.scenario === 'invalid') {
        assert.equal(result.committed, false);
        assert.equal(result.invalidMarked, true);
      } else {
        assert.equal(result.dirty, true, result.scenario);
        assert.equal(result.draftScoresPreserved, true, result.scenario);
        assert.ok(result.messages.length > 0, result.scenario);
      }
    }
  }
});
