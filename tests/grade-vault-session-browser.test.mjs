import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('automatic locking clears focused grade UI and restores uncommitted dialogs', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const markup = await fetch('/src/modules/grades/app.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(markup, 'text/html');
    fixture.querySelectorAll('script').forEach((script) => script.remove());
    document.body.replaceChildren(...fixture.body.childNodes);
    const [{ GradesApp }, { WorkspaceStore }, { WorkspaceRuntime }, { createWorkspacePublicApi }] = await Promise.all([
      import('/src/modules/grades/app.js?dom-test'), import('/src/modules/workspace/store.js'),
      import('/src/modules/workspace/runtime.js'), import('/src/modules/workspace/public-api.js'),
    ]);
    const app = new GradesApp();
    const store = new WorkspaceStore();
    const runtime = new WorkspaceRuntime(store, { ephemeral: true, eventTarget: new EventTarget() });
    try {
      const courseId = store.createCourse(store.getActiveSchoolYear().id, 'Sicherheitskurs');
      await runtime.runGradeCourseMutation(courseId, () => {
        store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Privater', lastName: 'Schuelername' }]);
      }, { skipAutoSave: true });
      await runtime.setupGradeVault('sicheres-test-passwort');
      runtime.persistence.commitPersistedVaultContainer((await runtime.buildContainer('seed')).bytes);
      runtime.courseRepository.completeSave();
      const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
      app.unregisterWorkspaceClient?.();
      app.workspaceClient = { ...api, getSnapshot: (scope) => runtime.createWorkspaceSnapshot(scope), getRevision: () => 0 };
      app.store = api.data;
      app.promptGradeVaultUnlockForInitialCourse = () => {};
      app.presentGradeVaultAutoLockNotice = async () => {};
      runtime.bindController({
        markChanged(scope) {
          app.handleWorkspaceState({ scope, revision: 1, ready: true, hydrated: true, snapshot: runtime.createWorkspaceSnapshot(scope) });
        },
        publish() {},
      });
      runtime.registerFeatureClient('grades', {
        captureVaultSession: () => app.captureVaultSession(),
        prepareVaultSessionLock: () => app.prepareVaultSessionLock(),
        clearVaultSession: () => app.clearVaultSession(),
        restoreVaultSession: (state) => app.restoreVaultSession(state),
        finishVaultSessionLock: () => app.finishVaultSessionLock(),
      });
      app.currentView = 'grades';
      app.gradesSubView = 'entry';
      app.selectedCourseId = courseId;
      app.gradesEntryDraft = { ...app.getGradesEntryDraft(courseId), title: 'Unfertige Leistung' };
      app.gradesEntryDraftDirty = true;
      app.courseDialogDraft = app.buildCourseDialogDraft(store.state.courses.find((course) => course.id === courseId));
      app.courseDialogDraft.students[0].firstName = 'Nichtgespeichert';
      app.refs.courseStudentsDialogId.value = String(courseId);
      app.renderCourseDialogStudents();
      app.openDialog(app.refs.courseStudentsDialog);
      const control = app.refs.courseDialogStudentsList.querySelector('input');
      control.focus();
      app.pendingGradesEntryControlInteractionUntil = Date.now() + 60000;
      const captured = app.captureVaultSession();
      const locked = await runtime.handleGradeVaultAutoLockTimeout();
      const during = {
        locked, unlocked: runtime.isGradeVaultUnlocked(), inert: document.body.inert,
        dialogOpen: app.refs.courseStudentsDialog.open,
        draft: app.courseDialogDraft,
        names: document.body.textContent.includes('Schuelername')
          || [...document.querySelectorAll('input, textarea')].some((input) => /Schuelername|Nichtgespeichert/.test(input.value)),
        unsaved: app.getWorkspaceUnsavedState().gradesDirty,
      };
      await runtime.unlockGradeVault('sicheres-test-passwort');
      const restoredGradeDraft = app.gradesEntryDraft?.title;
      const restoredGradeDirty = app.gradesEntryDraftDirty;
      runtime.vault.kdf = { invalid: true };
      const failedLock = await runtime.handleGradeVaultAutoLockTimeout();
      return {
        during,
        restoredName: app.courseDialogDraft?.students[0]?.firstName,
        reopened: app.refs.courseStudentsDialog.open,
        inputName: [...app.refs.courseDialogStudentsList.querySelectorAll('input')].some((input) => input.value === 'Nichtgespeichert'),
        savedName: store.listGradeStudents(courseId)[0].firstName,
        dirtyCourseCount: runtime.dirtyCourseIds.size,
        expectedName: captured.courseDialogDraft.students[0].firstName,
        restoredGradeDraft,
        restoredGradeDirty,
        failedLock,
        stillUnlocked: runtime.isGradeVaultUnlocked(),
        stillInteractive: !document.body.inert,
        transferTitle: app.refs.gradeTransferDialog.querySelector('h3').textContent,
      };
    } finally {
      runtime.disposeGradeVaultSession();
    }
  });
  assert.deepEqual(result.during, { locked: true, unlocked: false, inert: false, dialogOpen: false, draft: null, names: false, unsaved: true });
  assert.equal(result.restoredName, result.expectedName);
  assert.equal(result.reopened, true);
  assert.equal(result.inputName, true);
  assert.equal(result.savedName, 'Privater');
  assert.equal(result.dirtyCourseCount, 0);
  assert.equal(result.restoredGradeDraft, 'Unfertige Leistung');
  assert.equal(result.restoredGradeDirty, true);
  assert.equal(result.failedLock, false);
  assert.equal(result.stillUnlocked, true);
  assert.equal(result.stillInteractive, true);
  assert.equal(result.transferTitle, 'Noten in Schulmanager/AbiWeb übertragen');
});
