import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('printed-list classes can be reviewed and are persisted only when the participant dialog is saved', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { createRosterOcrDialog } = await import('/src/modules/grades/roster-ocr-dialog.js');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { createWorkspacePublicApi } = await import('/src/modules/workspace/public-api.js');
    const page = new DOMParser().parseFromString(await (await fetch('/src/modules/grades/app.html')).text(), 'text/html');
    document.body.replaceChildren(...page.body.childNodes);
    for (const href of ['/src/modules/grades/app.css', '/src/shared/theme.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      const loaded = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
      document.head.append(link);
      await loaded;
    }
    const store = new WorkspaceStore();
    const year = store.getActiveSchoolYear();
    const courseId = store.createCourse(year.id, 'OCR-Kurs');
    const course = store.listCourses(year.id).find((item) => item.id === courseId);
    store.replaceGradeStudentsForCourse(courseId, [{ lastName: 'Bestehend', firstName: 'Alex', classFlair: 'c' }]);
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data,
      refs: { courseStudentsDialogId: document.querySelector('#course-students-dialog-id') },
      getGradeCourseRevision: () => 1,
      canAccessGradeVault: () => true,
      runGradeCourseMutation: async (id, callback) => callback(),
      persistExplicitDatabaseSave: async () => {},
      closeCourseStudentsDialog() { this.courseDialogDraft = null; },
      renderAll() {},
      showInfoMessage: async (message) => { throw new Error(message); },
    });
    app.refs.courseStudentsDialogId.value = courseId;
    app.courseDialogDraft = app.buildCourseDialogDraft(course);
    const dialog = document.querySelector('#course-ocr-dialog');
    const ocr = createRosterOcrDialog({
      dialog,
      openDialog: (node) => node.showModal(),
      closeDialog: (node) => node.close(),
      recognize: async () => 'Müller  Anna Maria  7a\n11 B  von Berg  Max\nBestehend  Alex  7g',
    });
    let summary;
    ocr.open((rows) => { summary = app.appendCourseDialogStudents(rows); return summary; });
    const source = document.createElement('canvas');
    source.width = 800;
    source.height = 300;
    const image = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
    const transfer = new DataTransfer();
    transfer.items.add(new File([image], 'klassenliste.png', { type: 'image/png' }));
    const fileInput = dialog.querySelector('[data-ocr="file"]');
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change'));
    const waitFor = async (condition) => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(dialog.querySelector('[data-ocr="status"]').textContent || 'OCR did not finish');
    };
    const recognize = dialog.querySelector('[data-ocr="recognize"]');
    await waitFor(() => !recognize.disabled);
    recognize.click();
    await waitFor(() => dialog.querySelectorAll('.course-ocr-row select').length === 3);
    const selects = [...dialog.querySelectorAll('.course-ocr-row select')];
    const recognized = selects.map((select) => select.value);
    document.documentElement.dataset.theme = 'dark';
    const darkColor = getComputedStyle(selects[0]).color;
    document.documentElement.dataset.theme = 'light';
    await waitFor(() => getComputedStyle(selects[0]).color === 'rgb(22, 101, 52)');
    const lightColor = getComputedStyle(selects[0]).color;
    const visible = selects.every((select) => select.getBoundingClientRect().width > 0);
    selects[0].value = 'f';
    selects[0].dispatchEvent(new Event('change'));
    selects[1].value = '';
    selects[1].dispatchEvent(new Event('change'));
    const draft = ocr.captureDraft();
    ocr.close();
    ocr.open((rows) => { summary = app.appendCourseDialogStudents(rows); return summary; });
    ocr.restoreDraft(draft);
    dialog.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    const beforeSave = store.listGradeStudents(courseId).length;
    const pending = app.courseDialogDraft.students.map(({ firstName, classFlair }) => ({ firstName, classFlair }));
    await app.submitCourseStudentsDialog();
    store.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
    const saved = store.listGradeStudents(courseId).map(({ firstName, classFlair }) => ({ firstName, classFlair }));
    return { recognized, visible, darkColor, lightColor, summary, beforeSave, pending, saved };
  });
  assert.deepEqual(result.recognized, ['a', 'b', 'g']);
  assert.equal(result.visible, true);
  assert.equal(result.darkColor, 'rgb(187, 247, 208)');
  assert.equal(result.lightColor, 'rgb(22, 101, 52)');
  assert.deepEqual(result.summary, { added: 2, skipped: 1, classesAdded: 0 });
  assert.equal(result.beforeSave, 1);
  assert.deepEqual(result.pending, [
    { firstName: 'Alex', classFlair: 'c' },
    { firstName: 'Anna Maria', classFlair: 'f' },
    { firstName: 'Max', classFlair: '' },
  ]);
  assert.deepEqual(result.saved, result.pending);
});
