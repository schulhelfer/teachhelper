import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('planning starts and edits courses and slots through the current sidebar and dialogs', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const waitFor = async (read, label) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = read();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out: ${label}`);
    };
    const errors = [];
    window.addEventListener('error', event => errors.push(event.message));
    window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const html = await fetch('/src/modules/planning/app.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    fixture.querySelectorAll('script').forEach(script => script.remove());
    document.body.replaceChildren(...fixture.body.childNodes);
    const style = document.createElement('style');
    style.textContent = await fetch('/src/modules/planning/app.css').then(response => response.text());
    document.head.append(style);
    await import('/src/modules/planning/app.js');
    const app = window.__teachhelperPlannerApp;
    check(app, `Planning startup failed: ${document.body.dataset.initializationError}`);
    check(app.refs.viewSettings.parentElement === app.refs.settingsShell, 'Settings shell is mounted');
    check([...document.querySelector('.settings-tab-content').children].every(element => element.classList.contains('settings-panel')), 'Settings contain only active panels');

    const saves = [];
    const messages = [];
    app.getWorkspacePersistenceStatus = () => ({ presentationSupported: true, connected: true, backupConnected: true });
    app.persistExplicitDatabaseSave = async reason => { saves.push(reason); return true; };
    app.showInfoMessage = async message => { messages.push(message); };
    app.showConfirmMessage = async () => true;
    app.showPromptMessage = async () => 'Biologie 8b';
    const year = app.store.listSchoolYears().find(item => item.startDate === '2026-08-01') || app.store.createSchoolYear(2026);
    app.store.setActiveSchoolYear(year.id);
    app.weekStartIso = '2026-09-14';
    app.renderAll();
    check(!app.locked, `Planning remains locked: ${app.lockReason}`);
    await app.switchView('week');

    app.refs.sidebarCourseList.querySelector('[data-add-course]').click();
    await waitFor(() => app.refs.courseDialog.open, 'course creation dialog');
    app.refs.courseDialogName.value = 'Biologie 8a';
    app.refs.courseDialogSubject.value = 'Biologie';
    app.refs.courseDialogForm.requestSubmit();
    const course = await waitFor(() => !app.refs.courseDialog.open && app.store.listCourses(year.id).find(item => item.name === 'Biologie 8a'), 'course saved');
    const courseButton = () => app.refs.sidebarCourseList.querySelector(`button[data-course-id="${course.id}"]`);
    check(courseButton(), 'Saved course is in the sidebar');
    courseButton().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 }));
    const rename = [...app.refs.contextMenu.querySelectorAll('button')].find(button => button.textContent.includes('Kursname bearbeiten'));
    check(rename, 'Sidebar course menu offers rename');
    rename.click();
    await waitFor(() => courseButton()?.textContent.includes('Biologie 8b'), 'course renamed');
    courseButton().click();
    await waitFor(() => app.currentView === 'course', 'course timeline');
    await app.switchView('week');
    const emptyCell = app.refs.weekTable.querySelector('[data-week-empty="1"][data-day="1"][data-hour="2"]');
    check(emptyCell, 'Empty timetable cell is available');
    emptyCell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    emptyCell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await waitFor(() => app.refs.slotDialog.open, 'slot creation dialog');
    app.refs.slotDialogEnd.value = '2026-10-02';
    app.refs.slotDialogForm.requestSubmit();
    const slot = await waitFor(() => !app.refs.slotDialog.open && app.store.listSlotsForYear(year.id).find(item => item.courseId === course.id), 'slot saved');
    check(slot.startDate === '2026-09-14' && slot.duration === 2, 'Slot dates and duration are persisted');

    await app.openSlotDialogForEdit(slot);
    app.refs.slotDialogEnd.value = '2026-10-03';
    await app.submitSlotDialog();
    check(app.refs.slotDialog.open && messages.pop() === 'Das Enddatum muss auf einen Schultag (Montag bis Freitag) fallen.', 'Weekend date is rejected without closing the dialog');
    check(app.store.getSlot(slot.id).endDate === '2026-10-02', 'Invalid date does not mutate the slot');
    app.refs.slotDialogEnd.value = '2026-10-02';
    app.refs.slotDialogEndHour.value = '4';
    app.refs.slotDialogForm.requestSubmit();
    await waitFor(() => !app.refs.slotDialog.open, 'slot edited');
    check(app.store.getSlot(slot.id).duration === 3, 'Entire series is updated');

    await app.openSlotDialogForEdit(app.store.getSlot(slot.id), '2026-09-21');
    check(app.refs.slotDialogStart.hidden && app.refs.slotDialogStartText.textContent, 'Partial series shows the fixed start date');
    app.refs.slotDialogDay.value = '2';
    app.refs.slotDialogForm.requestSubmit();
    await waitFor(() => !app.refs.slotDialog.open, 'partial series edited');
    const series = app.store.listSlotsForYear(year.id).filter(item => item.courseId === course.id);
    check(series.length === 2 && series.some(item => item.dayOfWeek === 2), 'Partial edit splits the series');

    await app.openBreakSupervisionDialog(3, 2);
    app.refs.slotDialogBreakName.value = 'Pausenhof';
    app.refs.slotDialogEnd.value = '2026-10-02';
    app.refs.slotDialogForm.requestSubmit();
    const supervision = await waitFor(() => !app.refs.slotDialog.open && app.store.listSlotsForYear(year.id).find(item => item.placement === 'break'), 'break supervision saved');
    check(supervision.label === 'Pausenhof' && supervision.startHour === 2, 'Break supervision keeps its placement and label');

    const surfaces = ['courseCreate', 'slotCreate', 'slotEdit'];
    for (const surface of surfaces) {
      await window.__teachhelperPlanningTutorial.showSurface(surface);
      const dialog = surface === 'courseCreate' ? app.refs.courseDialog : app.refs.slotDialog;
      check(dialog.open, `Tutorial surface is available: ${surface}`);
      window.__teachhelperPlanningTutorial.cleanup();
      check(!dialog.open, `Tutorial surface closes: ${surface}`);
    }

    await app.openSlotDialogForEdit(supervision);
    app.refs.slotDialogDelete.click();
    await waitFor(() => !app.refs.slotDialog.open, 'break supervision deleted');
    check(!app.store.getSlot(supervision.id), 'Break supervision is removed');
    await app.openSlotDialogForEdit(series[0]);
    app.refs.slotDialogDelete.click();
    await waitFor(() => !app.refs.slotDialog.open, 'lesson series deleted');
    check(!app.store.getSlot(series[0].id), 'Lesson series is removed');
    courseButton().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 }));
    const deleteCourse = [...app.refs.contextMenu.querySelectorAll('button')].find(button => button.textContent.trim() === 'Löschen');
    check(deleteCourse, 'Sidebar course menu offers deletion');
    deleteCourse.click();
    await waitFor(() => !courseButton(), 'course deleted');
    check(!app.store.listSlotsForYear(year.id).some(item => item.courseId === course.id), 'Course deletion removes remaining slots');
    check(messages.length === 0, `Unexpected messages: ${messages.join('; ')}`);
    return { errors, saves, surfaces };
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.surfaces, ['courseCreate', 'slotCreate', 'slotEdit']);
  assert.equal(result.saves.filter(reason => reason === 'planning-course-save').length, 1);
  assert.equal(result.saves.filter(reason => reason === 'planning-course-name-save').length, 1);
  assert.equal(result.saves.filter(reason => reason === 'planning-slot-series-save').length, 4);
});
