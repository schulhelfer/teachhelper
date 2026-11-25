import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

async function openNachschreiber(t, withWorkspace = false) {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1800, height: 900 } });
  await evaluate(async (withWorkspace) => {
    const html = await fetch('/index.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.head.append(...fixture.querySelectorAll('link[rel="stylesheet"]'));
    document.body.replaceChildren(...fixture.body.childNodes);
    sessionStorage.setItem('teachhelper:pwa-install-prompt-dismissed', '1');
    if (withWorkspace) {
      const { installWorkspaceController } = await import('/src/modules/workspace/index.js');
      installWorkspaceController(window, { ephemeral: true });
    }
    await import('/src/main.js');
  }, withWorkspace);
  return evaluate;
}

test('Nachschreiber verarbeitet die Dateiauswahl und die Dropzone im regulären Tab', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t);
  const result = await evaluate(async () => {
    const byId = (id) => document.getElementById(id);
    const waitFor = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('Erwarteter Zustand wurde zu spät erreicht.');
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    const root = byId('nachschreiber-shell');
    const tab = byId('tab-nachschreiber');
    const dropZone = byId('nachschreiber-drop-zone');
    const fileInput = byId('nachschreiber-file');
    const duration = byId('nachschreiber-duration');
    const startDate = byId('nachschreiber-start-date');
    const endDate = byId('nachschreiber-end-date');
    const submit = byId('nachschreiber-submit');
    const status = byId('nachschreiber-csv-status');
    const sourceList = byId('nachschreiber-file-list');
    const importErrors = byId('nachschreiber-file-errors');
    const resultStatus = byId('nachschreiber-result-status');
    const getRows = () => Array.from(byId('nachschreiber-result-rows').rows, (row) => Array.from(row.cells, (cell) => (
      cell.querySelector('.nachschreiber-result-time')?.textContent ?? cell.textContent
    )).slice(0, -1));

    await waitFor(() => byId('app').classList.contains('app-js-ready'));
    const hiddenBeforeActivation = root.hidden;
    tab.click();
    await waitFor(() => tab.getAttribute('aria-selected') === 'true' && !root.hidden);
    const initialDisabled = submit.disabled;
    const initialStatus = status.classList.contains('empty-state-box') ? status.textContent.trim() : '';
    const emptyStartDate = !startDate.required && startDate.value === '' && startDate.min === endDate.min;
    const initialDuration = duration.value;
    const durationOptions = Array.from(duration.options, (option) => [option.value, option.textContent]);
    const januaryFourth = new Date(Date.UTC(new Date().getFullYear() + 2, 0, 4));
    const monday = new Date(januaryFourth);
    monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourth.getUTCDay() || 7) + 1);
    const isoAt = (offset) => {
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const csvDate = (offset) => isoAt(offset).split('-').reverse().join('.');
    const header = 'Titel;KW;Datum;Start;Ende;Gruppen;Lehrkraft';
    const transfers = (...lines) => {
      const data = new DataTransfer();
      data.items.add(new File([[header, ...lines].join('\n')], 'arbeiten.csv', { type: 'text/csv' }));
      return data;
    };
    let pickerOpened = false;
    fileInput.addEventListener('click', (event) => {
      pickerOpened = true;
      event.preventDefault();
    });
    const initialDropZoneHeight = dropZone.getBoundingClientRect().height;
    dropZone.querySelector('label[for="nachschreiber-file"]').click();
    fileInput.files = transfers(
      `"Mathe; <em>Teil 1</em>";1;${csvDate(1)};08:45:00;09:30:00;5a;<em>Kürzel A</em>`,
      `Testarbeit;1;${csvDate(1)};10:00;11:30;5b;Kürzel E`,
      `;1;${csvDate(1)};;;13e;Kürzel F`,
      `;1;${csvDate(2)};10:00;11:30;5b;Kürzel G`,
      `;1;${csvDate(0)};;;Jahrgang.9;Kürzel B`,
      `;1;${csvDate(0)};11:00:00;11:45:00;10a;Kürzel C`,
    ).files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !submit.disabled);
    const importMessage = status.textContent;
    const dropZoneHeightAfterImport = dropZone.getBoundingClientRect().height;
    const statusInsideDropZone = dropZone.contains(status) && !status.classList.contains('empty-state-box');
    byId('nachschreiber-year').value = '9';
    byId('nachschreiber-class').value = 'b';
    byId('nachschreiber-end-calendar').click();
    const calendarYear = byId('nachschreiber-calendar-year');
    calendarYear.value = isoAt(1).slice(0, 4);
    calendarYear.dispatchEvent(new Event('change', { bubbles: true }));
    const calendarMonth = byId('nachschreiber-calendar-month');
    calendarMonth.value = Number(isoAt(1).slice(5, 7)) - 1;
    calendarMonth.dispatchEvent(new Event('change', { bubbles: true }));
    byId('nachschreiber-calendar-grid').querySelector(`[data-date="${isoAt(1)}"]`).click();
    submit.click();
    const pickerRows = getRows();
    const treatedNameAsText = !byId('nachschreiber-result-rows').querySelector('em');
    duration.value = '2';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    const clearedAfterDurationChange = byId('nachschreiber-results').hidden && getRows().length === 0;
    submit.click();
    const longerDurationRows = getRows();
    endDate.value = '';
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    const rowsWithoutEndDate = getRows();
    const headings = Array.from(byId('nachschreiber-results').querySelectorAll('th'), (cell) => cell.textContent);

    startDate.value = isoAt(2);
    startDate.dispatchEvent(new Event('input', { bubbles: true }));
    const clearedAfterStartDateChange = byId('nachschreiber-results').hidden && getRows().length === 0;
    submit.click();
    const rowsFromStartDate = getRows();
    endDate.value = isoAt(2);
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    const rowsForOneDay = getRows();
    endDate.value = isoAt(1);
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    const invalidEndDate = endDate.validity.rangeUnderflow && getRows().length === 0
      && document.activeElement === byId('nachschreiber-end-calendar');
    startDate.value = '2000-01-01';
    startDate.dispatchEvent(new Event('input', { bubbles: true }));
    const invalidStartDate = startDate.validity.rangeUnderflow;
    startDate.value = '';
    startDate.dispatchEvent(new Event('input', { bubbles: true }));
    endDate.value = '';
    endDate.dispatchEvent(new Event('input', { bubbles: true }));

    dropZone.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: transfers(`;1;${csvDate(1)};09:00;10:30;13e;Kürzel D`),
    }));
    await waitFor(() => status.textContent === '2 Dateien · 7 Klausuren');
    submit.click();
    const appendedRows = getRows();
    sourceList.querySelector('button').click();
    const clearedAfterRemoval = byId('nachschreiber-results').hidden;
    const remainingSummary = status.textContent;
    submit.click();
    const dropRows = getRows();
    endDate.value = isoAt(0);
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    const emptyMessage = resultStatus.textContent;
    endDate.value = '';
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();

    dropZone.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: transfers(`;2;${csvDate(1)};;;13e;Kürzel D`),
    }));
    await waitFor(() => !importErrors.hidden && !submit.disabled);
    const rowsAfterError = getRows();
    byId('tab-planning').click();
    await waitFor(() => root.hidden);

    return {
      hiddenBeforeActivation, initialDisabled, initialDuration, durationOptions, pickerOpened, importMessage, statusInsideDropZone, initialStatus,
      initialDropZoneHeight, dropZoneHeightAfterImport,
      pickerRows, longerDurationRows, clearedAfterDurationChange, rowsWithoutEndDate, appendedRows, dropRows, treatedNameAsText,
      clearedAfterRemoval, remainingSummary, rowsAfterError, emptyMessage, errorMessage: importErrors.textContent,
      disabledAfterError: submit.disabled, expectedDate: `Di, ${csvDate(1)}`,
      expectedLaterDate: `Mi, ${csvDate(2)}`, emptyStartDate, headings, clearedAfterStartDateChange, rowsFromStartDate,
      rowsForOneDay, invalidEndDate, invalidStartDate,
    };
  });

  assert.equal(result.hiddenBeforeActivation, true);
  assert.equal(result.initialDisabled, true);
  assert.equal(result.emptyStartDate, true);
  assert.equal(result.initialDuration, '1');
  assert.deepEqual(result.durationOptions, [
    ['1', '1 Std. (45 min)'], ['2', '2 Std. (90 min)'], ['3', '3 Std. (135 min)'], ['4', '4 Std. (180 min)'],
  ]);
  assert.equal(result.pickerOpened, true);
  assert.equal(result.importMessage, '1 Datei · 6 Klausuren');
  assert.equal(result.dropZoneHeightAfterImport, result.initialDropZoneHeight);
  assert.equal(result.statusInsideDropZone, true);
  assert.equal(result.initialStatus, 'Noch keine Datei');
  const longerExam = [result.expectedDate, '10:00–11:30', 'Testarbeit', '5b', 'Kürzel E', '1'];
  const laterExam = [result.expectedLaterDate, '10:00–11:30', '–', '5b', 'Kürzel G', '1'];
  assert.deepEqual(result.pickerRows, [
    [result.expectedDate, '08:45–09:30', 'Mathe; <em>Teil 1</em>', '5a', '<em>Kürzel A</em>', '1'], longerExam,
  ]);
  assert.equal(result.clearedAfterDurationChange, true);
  assert.deepEqual(result.longerDurationRows, [longerExam]);
  assert.deepEqual(result.rowsWithoutEndDate, [longerExam, laterExam]);
  assert.deepEqual(result.headings, ['Datum', 'Stunde', 'Titel', 'Gruppe', 'Aufsicht', 'Bereits eingetragene Arbeiten in der KW', 'Nachrichten']);
  assert.equal(result.clearedAfterStartDateChange, true);
  assert.deepEqual(result.rowsFromStartDate, [laterExam]);
  assert.deepEqual(result.rowsForOneDay, [laterExam]);
  assert.equal(result.invalidEndDate, true);
  assert.equal(result.invalidStartDate, true);
  assert.equal(result.treatedNameAsText, true);
  const droppedExam = [result.expectedDate, '09:00–10:30', '–', '13e', 'Kürzel D', '0'];
  assert.deepEqual(result.appendedRows, [[...droppedExam.slice(0, -1), '1'], longerExam, laterExam]);
  assert.equal(result.clearedAfterRemoval, true);
  assert.equal(result.remainingSummary, '1 Datei · 1 Klausur');
  assert.deepEqual(result.dropRows, [droppedExam]);
  assert.match(result.emptyMessage, /keine passenden Termine/);
  assert.match(result.errorMessage, /arbeiten\.csv.*Kalenderwoche in CSV-Zeile 2/);
  assert.equal(result.disabledAfterError, false);
  assert.deepEqual(result.rowsAfterError, result.dropRows);

  await evaluate.setViewport({ width: 420, height: 760 });
  const overflow = await evaluate(async () => {
    const item = document.querySelector('[data-more-tools-target="nachschreiber"]');
    const trigger = document.getElementById('more-tools-trigger');
    const root = document.getElementById('nachschreiber-shell');
    const deadline = performance.now() + 5000;
    while (item.hidden && performance.now() < deadline) await new Promise((done) => requestAnimationFrame(done));
    trigger.click();
    item.click();
    while (root.hidden && performance.now() < deadline) await new Promise((done) => requestAnimationFrame(done));
    return {
      selected: item.getAttribute('aria-checked'),
      visible: !root.hidden && root.getBoundingClientRect().width > 0,
      menuClosed: document.getElementById('more-tools-menu').hidden,
    };
  });
  assert.deepEqual(overflow, { selected: 'true', visible: true, menuClosed: true });
});

test('Nachschreiber nutzt die Picker-Seitenleiste auf Desktop und Mobilgeräten', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t, true);
  const divider = await evaluate(async () => {
    const app = document.getElementById('app');
    const tab = document.getElementById('tab-nachschreiber');
    const side = app.querySelector('.side');
    const handle = document.getElementById('sidebar-resize-handle');
    handle.addEventListener('pointerdown', (event) => {
      handle.dataset.testPointerId = String(event.pointerId);
    }, { once: true });
    tab.click();
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const bounds = handle.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + Math.min(bounds.height / 2, 160);
      if (tab.getAttribute('aria-selected') === 'true' && !app.classList.contains('is-tab-switching')
        && bounds.width > 0 && document.elementFromPoint(x, y) === handle) {
        return { x, y, width: side.getBoundingClientRect().width };
      }
      await new Promise((done) => requestAnimationFrame(done));
    }
    throw new Error('Die Größenänderung der Seitenleiste ist nicht erreichbar.');
  });
  await evaluate.dispatchMouseEvent({ type: 'mouseMoved', x: divider.x, y: divider.y });
  await evaluate.dispatchMouseEvent({ type: 'mousePressed', x: divider.x, y: divider.y, button: 'left', buttons: 1, clickCount: 1 });
  await evaluate(({ x, y }) => {
    const handle = document.getElementById('sidebar-resize-handle');
    const pointerId = Number(handle.dataset.testPointerId);
    const pointer = { pointerId, pointerType: 'mouse', clientX: x + 64, clientY: y, cancelable: true };
    handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, buttons: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, button: 0 }));
  }, divider);
  await evaluate.dispatchMouseEvent({ type: 'mouseReleased', x: divider.x + 64, y: divider.y, button: 'left', clickCount: 1 });

  const desktop = await evaluate(async () => {
    const byId = (id) => document.getElementById(id);
    const app = byId('app');
    const sidebar = byId('nachschreiber-sidebar');
    const side = sidebar.closest('aside');
    const results = byId('nachschreiber-shell');
    const main = results.closest('main');
    const picker = byId('tab-random-picker');
    const nachschreiber = byId('tab-nachschreiber');
    const selectTab = async (tab) => {
      tab.click();
      await waitFor(() => tab.getAttribute('aria-selected') === 'true' && !app.classList.contains('is-tab-switching'));
    };
    const waitFor = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('Der Ansichtswechsel wurde nicht abgeschlossen.');
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    const storedWidth = Number(localStorage.getItem('teachhelper:sidebar-width:other'));
    await waitFor(() => Math.abs(side.getBoundingClientRect().width - storedWidth) < 0.01);
    const width = side.getBoundingClientRect().width;
    const classSource = byId('nachschreiber-class-source');
    const sourceBounds = classSource.getBoundingClientRect();
    const classFieldsBounds = sidebar.querySelector('.nachschreiber-class-fields').getBoundingClientRect();
    const layout = {
      sideBySide: side.getBoundingClientRect().right <= main.getBoundingClientRect().left,
      inputsInSidebar: ['file', 'year', 'class', 'student-name', 'add-period', 'duration', 'start-calendar', 'end-calendar', 'submit']
        .every((id) => sidebar.contains(byId(`nachschreiber-${id}`))),
      resultsInMain: main.contains(byId('nachschreiber-results')),
      pickerInputsHidden: byId('csv-drop-zone').getBoundingClientRect().width === 0,
      classSourceCenteredBelow: sourceBounds.top > classFieldsBounds.bottom
        && Math.abs(sourceBounds.left + sourceBounds.right - classFieldsBounds.left - classFieldsBounds.right) < 1,
    };
    const steps = [...sidebar.querySelectorAll('.steps-list > li')];
    const stepTitles = steps.map((step) => step.querySelector(':scope > :is(strong, label)').textContent);
    const controlSteps = ['drop-zone', 'year', 'class', 'class-source', 'add-period', 'duration', 'student-name', 'start-calendar', 'end-calendar', 'sender-name']
      .map((id) => steps.findIndex((step) => step.contains(byId(`nachschreiber-${id}`))) + 1);
    const fieldLabels = ['year', 'class', 'duration', 'student-name', 'start-calendar', 'end-calendar', 'sender-name']
      .map((id) => byId(`nachschreiber-${id}`).labels[0].textContent);

    byId('nachschreiber-year').value = '9';
    byId('nachschreiber-class').value = 'b';
    byId('nachschreiber-duration').value = '2';

    await selectTab(picker);
    const pickerLayout = {
      sidebarWidth: side.getBoundingClientRect().width,
      nachschreiberHidden: sidebar.hidden && results.hidden,
      pickerVisible: byId('csv-drop-zone').getBoundingClientRect().width > 0 && !byId('random-picker-host').hidden,
    };
    await selectTab(nachschreiber);
    const restoredValues = ['year', 'class', 'duration'].map((id) => byId(`nachschreiber-${id}`).value);

    byId('nachschreiber-duration').focus();
    byId('toggle-chrome').click();
    await waitFor(() => app.classList.contains('chrome-collapsed') && side.hidden && !app.classList.contains('is-collapsing'));
    const overlay = byId('toggle-chrome-overlay');
    const collapsed = {
      sidebarInert: side.inert,
      fullWidth: Math.abs(main.getBoundingClientRect().width - app.getBoundingClientRect().width) < 2,
      overlayFocused: document.activeElement === overlay,
    };
    overlay.click();
    await waitFor(() => !app.classList.contains('chrome-collapsed') && !app.classList.contains('is-expanding') && !side.hidden);
    const sidebarReopened = !side.inert && sidebar.getBoundingClientRect().width > 0;
    return { width, storedWidth, layout, stepTitles, controlSteps, fieldLabels, classSourceLabel: classSource.textContent,
      collapsed, pickerLayout, restoredValues, sidebarReopened };
  });
  assert.ok(desktop.width >= divider.width + 60, `Seitenleiste ${divider.width} → ${desktop.width} px`);
  assert.equal(desktop.storedWidth, Math.round(desktop.width));
  assert.deepEqual(desktop.layout, {
    sideBySide: true, inputsInSidebar: true, resultsInMain: true, pickerInputsHidden: true, classSourceCenteredBelow: true,
  });
  assert.deepEqual(desktop.stepTitles, [
    'Klausurenplan importieren', 'Prüflinge eintragen', 'Gemeinsame wöchentliche Freistunden (optional)',
    'Dauer der Nachschreibklausur', 'Datumsfilter (optional)', 'Eigener Name (optional)',
  ]);
  assert.deepEqual(desktop.controlSteps, [1, 2, 2, 2, 3, 4, 2, 5, 5, 6]);
  assert.equal(desktop.classSourceLabel, 'Prüflingsdaten im Schulmanager');
  assert.deepEqual(desktop.fieldLabels, [
    'Jahrgang', 'Klasse', 'Dauer der Nachschreibklausur', 'Name des Prüflings (optional)',
    'Von einschließlich', 'Bis einschließlich', 'Eigener Name (optional)',
  ]);
  assert.deepEqual(desktop.collapsed, { sidebarInert: true, fullWidth: true, overlayFocused: true });
  assert.deepEqual(desktop.pickerLayout, { sidebarWidth: desktop.width, nachschreiberHidden: true, pickerVisible: true });
  assert.deepEqual(desktop.restoredValues, ['9', 'b', '2']);
  assert.equal(desktop.sidebarReopened, true);

  await evaluate.setViewport({ width: 420, height: 760 });
  const mobile = await evaluate(async () => {
    const side = document.querySelector('aside.side');
    const main = document.querySelector('main.main');
    const deadline = performance.now() + 5000;
    while (side.getBoundingClientRect().bottom > main.getBoundingClientRect().top + 1 && performance.now() < deadline) {
      await new Promise((done) => requestAnimationFrame(done));
    }
    const sideBounds = side.getBoundingClientRect();
    const mainBounds = main.getBoundingClientRect();
    const iservPrefix = document.getElementById('nachschreiber-iserv-prefix');
    const iservLink = document.getElementById('nachschreiber-iserv-link');
    const emptyInputWidth = iservPrefix.getBoundingClientRect().width;
    iservPrefix.value = 'schule';
    iservPrefix.dispatchEvent(new Event('input', { bubbles: true }));
    const inputBounds = iservPrefix.getBoundingClientRect();
    const linkBounds = iservLink.getBoundingClientRect();
    const { getWorkspaceClient } = await import('/src/modules/workspace/client.js');
    getWorkspaceClient().data.setLessonTimes([{ lesson: 1, start: '08:00', end: '08:45' }]);
    const addPeriod = document.getElementById('nachschreiber-add-period');
    addPeriod.click();
    const row = document.querySelector('.nachschreiber-period-row');
    const [weekday, lesson, remove] = [...row.querySelectorAll('select, button')].map((element) => element.getBoundingClientRect());
    const centerY = (bounds) => bounds.top + bounds.height / 2;
    const addStudent = document.getElementById('nachschreiber-add-student');
    addStudent.click();
    const lastStudent = document.getElementById('nachschreiber-student-list').lastElementChild;
    const studentControls = [...lastStudent.querySelectorAll('input, select, button')];
    const studentsFit = studentControls.every((control) => {
      const bounds = control.getBoundingClientRect();
      return bounds.left >= sideBounds.left && bounds.right <= sideBounds.right && bounds.width > 0;
    });
    return {
      stacked: sideBounds.bottom <= mainBounds.top + 1,
      fullWidth: Math.abs(sideBounds.width - mainBounds.width) < 2 && sideBounds.width >= 418,
      sidebarVisible: document.getElementById('nachschreiber-form').getBoundingClientRect().width > 0,
      resultsVisible: document.getElementById('nachschreiber-results-title').getBoundingClientRect().width > 0,
      iservControlsSideBySide: linkBounds.left > inputBounds.right && linkBounds.top === inputBounds.top
        && Math.abs(linkBounds.width - inputBounds.width) < 1 && emptyInputWidth === inputBounds.width,
      periodControlsSideBySide: weekday.right < lesson.left && lesson.right < remove.left
        && Math.abs(centerY(weekday) - centerY(remove)) < 1 && Math.abs(centerY(lesson) - centerY(remove)) < 1
        && remove.right <= sideBounds.right && addPeriod.getBoundingClientRect().top > row.getBoundingClientRect().bottom,
      studentsFit: studentsFit && addStudent.getBoundingClientRect().top > lastStudent.getBoundingClientRect().bottom,
    };
  });
  assert.deepEqual(mobile, {
    stacked: true, fullWidth: true, sidebarVisible: true, resultsVisible: true, iservControlsSideBySide: true,
    periodControlsSideBySide: true, studentsFit: true,
  });
});

test('Nachschreiber sucht einen gemeinsamen Termin und adressiert einzelne Nachrichten getrennt', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t);
  const observed = await evaluate(async () => {
    const { getIsoWeek } = await import('/src/modules/nachschreiber/schedule.js');
    const byId = (name) => document.getElementById(`nachschreiber-${name}`);
    const waitFor = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('Erwarteter Zustand wurde zu spät erreicht.');
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    const base = new Date(Date.UTC(new Date().getUTCFullYear() + 2, 4, 15));
    base.setUTCDate(base.getUTCDate() + (8 - base.getUTCDay()) % 7);
    const csvDay = (offset) => new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10).split('-').reverse().join('.');
    const week = getIsoWeek(base).weekNumber;
    const csv = [
      'Titel;KW;Datum;Start;Ende;Gruppen;Lehrkraft',
      `Eigene Klausur A;${week};${csvDay(0)};;;9b;TEST-Aufsicht`,
      `Eigene Klausur B;${week};${csvDay(1)};;;11c;TEST-Aufsicht`,
      `Termin A;${week};${csvDay(0)};08:10;08:55;7a;TEST Aufsicht`,
      `Termin B;${week};${csvDay(1)};08:10;08:55;7a;TEST Aufsicht`,
      `Gemeinsamer Termin;${week};${csvDay(2)};08:10;08:55;7a;TEST Aufsicht`,
    ].join('\n');
    const students = byId('student-list');
    const add = byId('add-student');
    const submit = byId('submit');
    const resultRows = byId('result-rows');
    const noticeText = byId('notice-text');
    const noticeRecipient = byId('notice-student');
    const noticeCopy = byId('notice-copy');
    const select = (control, value) => {
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const fill = (row, name, year, classLetter) => {
      row.querySelector('input').value = name;
      const [yearField, classField] = row.querySelectorAll('select');
      select(yearField, year);
      select(classField, classLetter);
    };
    const search = () => {
      submit.click();
      return Array.from(resultRows.rows, (row) => [row.cells[2].textContent, row.cells[5].textContent]);
    };
    const openNotice = (label) => {
      Array.from(resultRows.rows[0].querySelectorAll('button')).find((button) => button.textContent === label).click();
    };
    const chooseRecipient = (key) => {
      noticeRecipient.value = key;
      noticeRecipient.dispatchEvent(new Event('change', { bubbles: true }));
      return noticeText.value;
    };
    const closeNotice = () => byId('notice-close').click();
    document.getElementById('tab-nachschreiber').click();
    await waitFor(() => !byId('shell').hidden);
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], 'gemeinsame-suche.csv', { type: 'text/csv' }));
    byId('file').files = transfer.files;
    byId('file').dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !submit.disabled);

    const first = students.firstElementChild;
    fill(first, 'Prüfperson Alpha', '9', 'b');
    const singleRows = search();
    add.click();
    const second = students.lastElementChild;
    const focusAfterAdd = document.activeElement === second.querySelector('input');
    const clearedOnAdd = resultRows.rows.length === 0;
    const incompleteRows = search();
    const incompleteInvalid = !second.querySelector('select').validity.valid;
    fill(second, 'Prüfperson Beta', '11', 'c');
    add.click();
    const third = students.lastElementChild;
    fill(third, '', '9', 'b');
    const controls = [...students.querySelectorAll('input, select')];
    const validLabels = new Set(controls.map((control) => control.id)).size === controls.length
      && controls.every((control) => control.labels[0]?.control === control);
    const sharedRows = search();
    const sharedCountHeading = byId('own-exam-count').textContent;

    openNotice('Aufsicht anfragen');
    const supervision = { text: noticeText.value, selectorHidden: byId('notice-student-field').hidden };
    closeNotice();
    openNotice('Reguläre Lehrkraft informieren');
    const noRecipient = { text: noticeText.value, copyDisabled: noticeCopy.disabled, focused: document.activeElement === noticeRecipient };
    const teacherBeta = chooseRecipient('1');
    closeNotice();
    openNotice('Prüfling informieren');
    const options = [...noticeRecipient.options].slice(1).map((option) => option.textContent);
    const studentAlpha = chooseRecipient('0');
    noticeText.value += '\nEntwurf für Alpha';
    const studentBeta = chooseRecipient('1');
    const restoredAlpha = chooseRecipient('0');
    const studentUnnamed = chooseRecipient('2');
    closeNotice();
    const clearedNotice = noticeText.value === '' && noticeRecipient.options.length === 1;

    select(second.querySelector('select'), '12');
    const clearedOnGroupChange = resultRows.rows.length === 0;
    select(second.querySelector('select'), '11');
    search();
    first.querySelector('button').click();
    const clearedOnRemove = resultRows.rows.length === 0;
    third.querySelector('button').click();
    const lastCannotBeRemoved = students.children.length === 1 && second.querySelector('button').hidden;
    const remainingRows = search();
    openNotice('Prüfling informieren');
    const remainingNotice = { text: noticeText.value, selectorHidden: byId('notice-student-field').hidden };
    closeNotice();
    return {
      singleRows, focusAfterAdd, clearedOnAdd, incompleteRows, incompleteInvalid, validLabels, sharedRows, sharedCountHeading,
      supervision, noRecipient, teacherBeta, options, studentAlpha, studentBeta, restoredAlpha, studentUnnamed, clearedNotice,
      clearedOnGroupChange, clearedOnRemove, lastCannotBeRemoved, remainingRows, remainingNotice,
    };
  });
  assert.deepEqual(observed.singleRows, [['Termin B', '1'], ['Gemeinsamer Termin', '1']]);
  assert.equal(observed.focusAfterAdd, true);
  assert.equal(observed.clearedOnAdd, true);
  assert.deepEqual(observed.incompleteRows, []);
  assert.equal(observed.incompleteInvalid, true);
  assert.equal(observed.validLabels, true);
  assert.deepEqual(observed.sharedRows, [['Gemeinsamer Termin', '1']]);
  assert.match(observed.sharedCountHeading, /höchste Anzahl/);
  assert.equal(observed.supervision.selectorHidden, true);
  assert.match(observed.supervision.text, /Prüfperson Alpha \(9b\), Prüfperson Beta \(11c\) und \[Prüflingsname 3\] \(9b\)/);
  assert.deepEqual(observed.noRecipient, { text: '', copyDisabled: true, focused: true });
  assert.match(observed.teacherBeta, /Prüfperson Beta \(11c\)/);
  assert.doesNotMatch(observed.teacherBeta, /Prüfperson Alpha|Prüflingsname|\(9b\)/);
  assert.deepEqual(observed.options, ['Prüfperson Alpha (9b)', 'Prüfperson Beta (11c)', 'Prüfling 3 (9b)']);
  assert.match(observed.studentAlpha, /^Hallo Prüfperson Alpha,/);
  assert.doesNotMatch(observed.studentAlpha, /Prüfperson Beta/);
  assert.match(observed.studentBeta, /^Hallo Prüfperson Beta,/);
  assert.doesNotMatch(observed.studentBeta, /Prüfperson Alpha|Entwurf für Alpha/);
  assert.equal(observed.restoredAlpha, `${observed.studentAlpha}\nEntwurf für Alpha`);
  assert.match(observed.studentUnnamed, /^Hallo \[Prüflingsname\],/);
  assert.equal(observed.clearedNotice, true);
  assert.equal(observed.clearedOnGroupChange, true);
  assert.equal(observed.clearedOnRemove, true);
  assert.equal(observed.lastCannotBeRemoved, true);
  assert.deepEqual(observed.remainingRows, [['Termin A', '1'], ['Gemeinsamer Termin', '1']]);
  assert.equal(observed.remainingNotice.selectorHidden, true);
  assert.match(observed.remainingNotice.text, /^Hallo Prüfperson Beta,/);
});

test('Nachschreiber bietet für beide Datumsgrenzen einen Minikalender an', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t);
  const selection = await evaluate(async () => {
    const byId = (suffix) => document.getElementById(`nachschreiber-${suffix}`);
    const deadline = performance.now() + 5000;
    document.getElementById('tab-nachschreiber').click();
    while (byId('shell').hidden && performance.now() < deadline) await new Promise((done) => requestAnimationFrame(done));
    const start = byId('start-calendar');
    const end = byId('end-calendar');
    const startDate = byId('start-date');
    const endDate = byId('end-date');
    const dialog = byId('date-calendar');
    const month = byId('calendar-month');
    const year = byId('calendar-year');
    const next = byId('calendar-next');
    const prev = byId('calendar-prev');
    const clear = byId('calendar-clear');
    const dateButton = (date) => dialog.querySelector(`[data-date="${date}"]`);
    const rangeFitsViewport = () => {
      const { left, right, top, bottom } = dialog.getBoundingClientRect();
      return left >= 7 && right <= innerWidth - 7 && top >= 7 && bottom <= innerHeight - 7;
    };

    start.scrollIntoView({ block: 'center' });
    start.click();
    const minimum = new Date(`${startDate.min}T00:00:00Z`);
    const initialMonth = month.value === String(minimum.getUTCMonth()) && year.value === String(minimum.getUTCFullYear());
    const disabledDays = prev.disabled && clear.disabled
      && [...dialog.querySelectorAll('[data-date]')].every((button) => button.disabled === (button.dataset.date < startDate.min));
    const desktopFit = rangeFitsViewport();
    next.click();
    const nextMonth = month.value !== String(minimum.getUTCMonth());
    const monthStart = new Date(Date.UTC(Number(year.value), Number(month.value), 1));
    const firstSaturday = new Date(monthStart);
    firstSaturday.setUTCDate(1 + (6 - monthStart.getUTCDay() + 7) % 7);
    const saturday = firstSaturday.toISOString().slice(0, 10);
    firstSaturday.setUTCDate(firstSaturday.getUTCDate() + 1);
    const sunday = firstSaturday.toISOString().slice(0, 10);
    const weekHeading = dialog.querySelector('thead th').textContent;
    dateButton(saturday).click();
    const setStart = !dialog.open && startDate.value === saturday && document.activeElement === start;

    end.click();
    const sameDayAllowed = endDate.min === saturday && !dateButton(saturday).disabled
      && [...dialog.querySelectorAll('[data-date]')].some((button) => button.dataset.date < saturday && button.disabled);
    dateButton(saturday).click();
    const setEnd = endDate.value === saturday && end.textContent === saturday.split('-').reverse().join('.');

    start.click();
    const selectedDay = dateButton(saturday).getAttribute('aria-pressed') === 'true'
      && document.activeElement === dateButton(saturday);
    dateButton(sunday).click();
    const invalidEnd = endDate.value === saturday && endDate.validity.rangeUnderflow
      && end.getAttribute('aria-invalid') === 'true' && !byId('end-date-error').hidden;
    end.click();
    const disabledEnd = dateButton(saturday).disabled;
    clear.click();
    const clearedEnd = endDate.value === '' && byId('end-date-error').hidden && document.activeElement === end;
    start.click();
    clear.click();
    const clearedStart = startDate.value === '' && endDate.min === startDate.min;
    return {
      initialMonth, disabledDays, desktopFit, nextMonth, weekHeading, setStart, sameDayAllowed, setEnd, selectedDay,
      invalidEnd, disabledEnd, clearedEnd, clearedStart, removedHint: !byId('form').textContent.includes('Ohne Startdatum'),
    };
  });
  assert.deepEqual(selection, {
    initialMonth: true, disabledDays: true, desktopFit: true, nextMonth: true, weekHeading: 'KW', setStart: true,
    sameDayAllowed: true, setEnd: true, selectedDay: true, invalidEnd: true, disabledEnd: true,
    clearedEnd: true, clearedStart: true, removedHint: true,
  });

  await evaluate.setViewport({ width: 350, height: 500 });
  const mobile = await evaluate(async () => {
    const start = document.getElementById('nachschreiber-start-calendar');
    start.scrollIntoView({ block: 'center' });
    start.click();
    await new Promise((done) => requestAnimationFrame(done));
    const dialog = document.getElementById('nachschreiber-date-calendar');
    const rect = dialog.getBoundingClientRect();
    return dialog.open && rect.left >= 7 && rect.top >= 7 && rect.right <= innerWidth - 7 && rect.bottom <= innerHeight - 7
      && dialog.scrollWidth <= dialog.clientWidth;
  });
  assert.equal(mobile, true);
  await evaluate.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await evaluate.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escaped = await evaluate(() => !document.getElementById('nachschreiber-date-calendar').open
    && document.activeElement.id === 'nachschreiber-start-calendar');
  assert.equal(escaped, true);
});

test('Nachschreiber speichert den Standard-Absender in der Datenbank bei gesperrtem Notenbereich', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t, true);
  const result = await evaluate(async () => {
    const [{ WORKSPACE_GLOBAL_KEY }, { parseThdb1ContainerBytes }] = await Promise.all([
      import('/src/modules/workspace/index.js'), import('/src/shared/school-data/thdb.js'),
    ]);
    const runtime = window[WORKSPACE_GLOBAL_KEY].getOwner();
    runtime.isManualPersistenceMode = () => true;
    let exportedBytes;
    runtime.persistence.downloadBytes = (bytes) => { exportedBytes = bytes.slice(); };
    const byId = (id) => document.getElementById(`nachschreiber-${id}`);
    const dialog = byId('settings-dialog');
    const trigger = byId('settings-trigger');
    const input = byId('default-sender-name');
    const save = byId('settings-save');
    const cancel = byId('settings-cancel');
    const override = byId('sender-name');
    const waitFor = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('Erwarteter Zustand wurde zu spät erreicht.');
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    document.getElementById('tab-nachschreiber').click();
    await waitFor(() => !byId('shell').hidden);
    trigger.click();
    const noDatabase = dialog.open && save.disabled && !byId('settings-database-hint').hidden;
    cancel.click();

    await runtime.setupGradeVault('test-passwort-ohne-personendaten');
    const { bytes } = await runtime.buildContainer('test');
    const loadFile = (value) => runtime.loadManualDatabaseFromFile(new File([value], 'Test-Datenbank.json'));
    await loadFile(bytes);
    trigger.click();
    const initial = { name: input.value, focused: document.activeElement === input, locked: !runtime.isGradeVaultUnlocked() };
    input.value = '  Test-Absender  ';
    save.click();
    await waitFor(() => !dialog.open);
    const exportedName = () => JSON.parse(parseThdb1ContainerBytes(exportedBytes).planningPublicText).settings.nachschreiberDefaultSenderName;
    const saved = { name: exportedName(), placeholder: override.placeholder, focused: document.activeElement === trigger };

    await loadFile(bytes);
    const oldDatabasePlaceholder = override.placeholder;
    await loadFile(exportedBytes);
    trigger.click();
    const reopened = { name: input.value, placeholder: override.placeholder, locked: !runtime.isGradeVaultUnlocked() };
    input.value = 'Verworfener Entwurf';
    cancel.click();
    trigger.click();
    const afterCancel = input.value;
    input.value = '   ';
    save.click();
    await waitFor(() => !dialog.open);
    const cleared = { name: exportedName(), placeholder: override.placeholder };
    trigger.click();
    input.value = 'Weiterer verworfener Entwurf';
    return { noDatabase, initial, saved, oldDatabasePlaceholder, reopened, afterCancel, cleared };
  });
  assert.equal(result.noDatabase, true);
  assert.deepEqual(result.initial, { name: '', focused: true, locked: true });
  assert.deepEqual(result.saved, { name: 'Test-Absender', placeholder: 'Test-Absender', focused: true });
  assert.equal(result.oldDatabasePlaceholder, '');
  assert.deepEqual(result.reopened, { name: 'Test-Absender', placeholder: 'Test-Absender', locked: true });
  assert.equal(result.afterCancel, 'Test-Absender');
  assert.deepEqual(result.cleared, { name: '', placeholder: '' });

  await evaluate.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await evaluate.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escaped = await evaluate(() => {
    const dialog = document.getElementById('nachschreiber-settings-dialog');
    const trigger = document.getElementById('nachschreiber-settings-trigger');
    const closed = !dialog.open && document.activeElement === trigger;
    trigger.click();
    return closed && document.getElementById('nachschreiber-default-sender-name').value === '';
  });
  assert.equal(escaped, true);
});

test('Nachschreiber kombiniert synthetische PDF-Wochenraster und CSV-Dateien', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t, true);
  const observed = await evaluate(async () => {
    const [{ getWorkspaceClient }, { ensurePdfLibLoaded }, { getIsoWeek }] = await Promise.all([
      import('/src/modules/workspace/client.js'), import('/src/shared/pdf-vendor.js'), import('/src/modules/nachschreiber/schedule.js'),
    ]);
    const { PDFDocument, StandardFonts } = await ensurePdfLibLoaded();
    const { data } = getWorkspaceClient();
    const byId = (suffix) => document.getElementById(`nachschreiber-${suffix}`);
    const fileInput = byId('file');
    const submit = byId('submit');
    const status = byId('csv-status');
    const sourceList = byId('file-list');
    const importErrors = byId('file-errors');
    const resultStatus = byId('result-status');
    const results = byId('result-rows');
    const waitFor = async (condition) => {
      const deadline = performance.now() + 12000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error(`Zeitlimit beim PDF-Test. ${status.textContent}`);
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    const base = new Date(Date.UTC(new Date().getUTCFullYear() + 3, 3, 5));
    base.setUTCDate(base.getUTCDate() + (8 - base.getUTCDay()) % 7);
    const day = (offset) => new Date(base.getTime() + offset * 86400000);
    const dateText = (date) => date.toISOString().slice(0, 10).split('-').reverse().join('.');
    const lessonTimes = [
      { lesson: 1, start: '07:15', end: '08:00' },
      { lesson: 2, start: '08:10', end: '08:55' },
      { lesson: 3, start: '09:10', end: '09:55' },
      { lesson: 4, start: '10:05', end: '10:50' },
    ];
    const createPdf = async (variant) => {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const addPage = (left, columnWidth) => {
        const page = pdf.addPage([920, 500]);
        const draw = (text, x, y) => page.drawText(text, { x, y, font, size: 9 });
        ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'].forEach((heading, column) => {
          draw(heading, left + (column + 0.5) * columnWidth - font.widthOfTextAtSize(heading, 9) / 2, 435);
        });
        draw('KW', 18, 435);
        draw('Datum', 52, 435);
        return {
          week(offset, y) {
            draw(String(getIsoWeek(day(offset)).weekNumber), 18, y);
            draw(`${dateText(day(offset)).slice(0, 6)} – ${dateText(day(offset + 4))}`, 52, y);
          },
          exam(text, column, y) { draw(text, left + column * columnWidth + 12, y); },
          note(text, y) { draw(text, 26, y); },
        };
      };
      if (variant === 'image-like') {
        pdf.addPage().drawRectangle({ x: 22, y: 22, width: 35, height: 55 });
      } else if (variant === 'unrelated') {
        pdf.addPage().drawText('Synthetisches Dokument ohne Wochenraster', { x: 24, y: 440, font, size: 12 });
      } else {
        const first = addPage(190, 130);
        first.week(0, 390);
        first.exam('1.–3. 9b-TEST-A (127)', 0, 390);
        first.exam('1. 9b-TEST-B (55)', 0, 372);
        first.exam('2.–4. 9b-TEST-C', 1, 390);
        first.exam('(95 Minuten)', 1, 378);
        first.exam('Allgemeiner Hinweis', 2, 390);
        first.exam('2. Rasterkurs Beispiel', 2, 375);
        first.week(7, 310);
        first.exam('2.–3. TEST-D (105)', 3, 310);
        if (variant === 'zusatzhinweis') first.note('Sonderzeit laut Aushang um 18:37 Uhr', 249);
        if (variant === 'weiterer-plan') {
          first.week(21, 240);
          first.exam('1.–2. PDF-NEU (110)', 0, 240);
        }
        const second = addPage(224, 118);
        second.week(14, 400);
        second.exam('2.–4. SYN7 SYN8', 0, 400);
        if (variant === 'ambiguous') {
          second.exam('1.–4. TEST-E', 4, 400);
          second.exam('(unklare Dauer)', 4, 388);
        } else {
          second.exam('1.–4. TEST-E (180)', 4, 400);
        }
      }
      return new File([await pdf.save()], `${variant}.pdf`, { type: 'application/pdf' });
    };
    const importFiles = (files, drop = false) => {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      if (drop) byId('drop-zone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      else {
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    const waitForImport = () => waitFor(() => status.textContent !== 'Dateien werden gelesen …');
    const loadedFiles = () => [...sourceList.querySelectorAll('.nachschreiber-file-name')].map((name) => name.textContent);
    const removeFile = (name) => {
      [...sourceList.children].find((row) => row.querySelector('.nachschreiber-file-name').textContent === name).querySelector('button').click();
    };
    const csvRow = (offset, title, groups, start = '', end = '') => (
      `${title};${getIsoWeek(day(offset)).weekNumber};${dateText(day(offset))};${start};${end};${groups};Lehrkraft TEST`
    );
    const csvFile = (name, lines) => new File([
      ['Titel;KW;Datum;Start;Ende;Gruppen;Lehrkraft', ...lines].join('\n'),
    ], `${name}.csv`, { type: 'text/csv' });
    const readSuggestions = () => {
      submit.click();
      return [...results.rows].map((row) => Array.from(row.cells, (cell) => cell.textContent).slice(0, 6));
    };
    const readNotice = (action, course) => {
      const row = course ? [...results.rows].find((entry) => entry.cells[3].textContent === course) : results.rows[0];
      [...row.querySelectorAll('button')].find((button) => button.textContent === action).click();
      const message = byId('notice-text').value;
      byId('notice-close').click();
      return message;
    };

    data.setLessonTimes(lessonTimes);
    document.getElementById('tab-nachschreiber').click();
    await waitFor(() => !byId('shell').hidden);
    byId('year').value = '9';
    byId('class').value = 'b';
    importFiles([await createPdf('erkannt')], true);
    await waitForImport();
    const imported = status.textContent;
    const oneLesson = readSuggestions();
    byId('duration').value = '2';
    const twoLessons = readSuggestions();
    const request = readNotice('Aufsicht anfragen');
    const notice = readNotice('Prüfling informieren');
    const requestsByCourse = ['SYN7', 'SYN8'].map((course) => readNotice('Aufsicht anfragen', course));
    byId('duration').value = '3';
    const threeLessons = readSuggestions();
    byId('duration').value = '2';
    data.setLessonTimes([]);
    const noRasterRows = readSuggestions();
    const noRasterHint = resultStatus.textContent;
    data.setLessonTimes(lessonTimes);
    const restored = readSuggestions();

    const originalCsvRows = [
      csvRow(0, 'CSV-EIGEN-A', '9b'),
      csvRow(0, 'CSV-TAGESSPERRE', '7a', '07:15', '08:45'),
      csvRow(3, 'CSV-KANDIDAT', '7a', '07:15', '08:45'),
      csvRow(14, '', 'SYN7', '08:10', '09:55'),
    ];
    const mixedFiles = [
      await createPdf('zusatzhinweis'),
      csvFile('test-a', originalCsvRows),
      await createPdf('ambiguous'),
      await createPdf('weiterer-plan'),
      csvFile('test-b', [originalCsvRows[0], csvRow(2, 'CSV-EIGEN-B', '9b')]),
    ];
    importFiles(mixedFiles);
    const busyDuringSelection = submit.disabled;
    await waitForImport();
    const selectedSources = { summary: status.textContent, files: loadedFiles(), error: importErrors.textContent };
    const timingNoteStatus = resultStatus.textContent;
    const combined = readSuggestions();
    const sourceTooltips = {
      csv: [...results.rows].find((row) => row.cells[2].textContent === 'CSV-KANDIDAT')?.title,
      pdf: [...results.rows].find((row) => row.cells[3].textContent === 'PDF-NEU')?.title,
    };
    const timingNoteAfterSearch = resultStatus.textContent;

    importFiles([
      await createPdf('kopie-a'),
      csvFile('test-c', [csvRow(4, 'CSV-EIGEN-C', '9b')]),
      await createPdf('kopie-b'),
      csvFile('test-d', originalCsvRows),
    ], true);
    importFiles([csvFile('test-e', originalCsvRows)]);
    await waitForImport();
    const droppedSources = { summary: status.textContent, files: loadedFiles(), rows: readSuggestions(), errorsCleared: importErrors.hidden };

    removeFile('test-c.csv');
    removeFile('zusatzhinweis.pdf');
    removeFile('test-a.csv');
    const afterRemovingDuplicates = {
      summary: status.textContent, note: resultStatus.textContent, rows: readSuggestions(),
    };
    removeFile('weiterer-plan.pdf');
    const afterRemovingUnique = { summary: status.textContent, rows: readSuggestions() };
    for (const name of loadedFiles()) removeFile(name);
    const afterRemovingAll = { summary: status.textContent, blocked: submit.disabled && results.rows.length === 0 && sourceList.hidden };

    importFiles([await createPdf('image-like'), await createPdf('unrelated')]);
    await waitForImport();
    const invalidFiles = { errors: [...importErrors.children].map((item) => item.textContent), blocked: submit.disabled };
    return {
      acceptsPdf: fileInput.accept.includes('.pdf'), multiple: fileInput.multiple,
      imported, oneLesson, twoLessons, threeLessons, request, notice, requestsByCourse,
      uploadLabel: byId('drop-zone').querySelector('.file-trigger-copy').innerText,
      noRasterRows, noRasterHint, restored, selectedSources, timingNoteStatus, timingNoteAfterSearch, busyDuringSelection,
      combined, sourceTooltips, droppedSources, afterRemovingDuplicates, afterRemovingUnique, afterRemovingAll, invalidFiles,
      dates: [[0, 'Mo'], [1, 'Di'], [10, 'Do'], [14, 'Mo'], [18, 'Fr'], [21, 'Mo']].map(([offset, prefix]) => `${prefix}, ${dateText(day(offset))}`),
    };
  });
  assert.equal(observed.acceptsPdf, true);
  assert.equal(observed.multiple, true);
  assert.equal(observed.uploadLabel, 'Auswählen\noder\nAblegen');
  assert.equal(observed.imported, '1 Datei · 8 Klausuren');
  assert.deepEqual(observed.oneLesson.map((row) => row[3]), [
    '9b-TEST-A', '9b-TEST-B', '9b-TEST-C', 'Rasterkurs Beispiel', 'TEST-D', 'SYN7', 'SYN8', 'TEST-E',
  ]);
  assert.deepEqual(observed.twoLessons, [
    [observed.dates[0], '1–2', '–', '9b-TEST-A', '–', '–'],
    [observed.dates[1], '2–3', '–', '9b-TEST-C', '–', '–'],
    [observed.dates[2], '2–3', '–', 'TEST-D', '–', '–'],
    [observed.dates[3], '2–3', '–', 'SYN7', '–', '–'],
    [observed.dates[3], '2–3', '–', 'SYN8', '–', '–'],
    [observed.dates[4], '1–2', '–', 'TEST-E', '–', '–'],
  ]);
  assert.deepEqual(observed.threeLessons.map((row) => row[3]), ['SYN7', 'SYN8', 'TEST-E']);
  assert.match(observed.request, /^Hallo \[Lehrkraftname\],/);
  assert.match(observed.request, /mit Deinem Kurs „9b-TEST-A“, für den Du/);
  assert.match(observed.notice, /\[Nachname der Lehrkraft\]/);
  assert.match(observed.requestsByCourse[0], /mit Deinem Kurs „SYN7“, für den Du/);
  assert.match(observed.requestsByCourse[1], /mit Deinem Kurs „SYN8“, für den Du/);
  assert.deepEqual(observed.noRasterRows, []);
  assert.match(observed.noRasterHint, /passende Unterrichtszeiten/);
  assert.deepEqual(observed.restored, observed.twoLessons);
  assert.equal(observed.busyDuringSelection, true);
  assert.equal(observed.selectedSources.summary, '5 Dateien · 14 Klausuren');
  assert.deepEqual(observed.selectedSources.files, ['erkannt.pdf', 'zusatzhinweis.pdf', 'test-a.csv', 'weiterer-plan.pdf', 'test-b.csv']);
  assert.match(observed.selectedSources.error, /ambiguous\.pdf.*PDF-Seite 2.*nicht eindeutig lesbar/);
  assert.match(observed.timingNoteStatus, /zusätzliche Uhrzeithinweise.*Zeiten aus der Planung/);
  assert.equal(observed.timingNoteAfterSearch, observed.timingNoteStatus);
  assert.deepEqual(observed.sourceTooltips, { csv: 'test-a.csv', pdf: 'weiterer-plan.pdf' });
  const additionalPdf = [observed.dates[5], '1–2', '–', 'PDF-NEU', '–', '–'];
  assert.deepEqual(observed.combined.filter((row) => row[5] === '–'), [...observed.twoLessons, additionalPdf]);
  assert.deepEqual(observed.combined.filter((row) => row[5] !== '–').map((row) => row.slice(2)), [
    ['–', 'SYN7', 'Lehrkraft TEST', '0'], ['CSV-KANDIDAT', '7a', 'Lehrkraft TEST', '2'],
  ]);
  assert.equal(observed.droppedSources.summary, '10 Dateien · 15 Klausuren');
  assert.deepEqual(observed.droppedSources.files.slice(5), ['kopie-a.pdf', 'test-c.csv', 'kopie-b.pdf', 'test-d.csv', 'test-e.csv']);
  assert.equal(observed.droppedSources.errorsCleared, true);
  assert.deepEqual(observed.droppedSources.rows, observed.combined.filter((row) => row[2] !== 'CSV-KANDIDAT'));
  assert.deepEqual(observed.afterRemovingDuplicates, { summary: '7 Dateien · 14 Klausuren', note: '', rows: observed.combined });
  assert.deepEqual(observed.afterRemovingUnique, {
    summary: '6 Dateien · 13 Klausuren', rows: observed.combined.filter((row) => row[3] !== 'PDF-NEU'),
  });
  assert.deepEqual(observed.afterRemovingAll, { summary: 'Noch keine Datei', blocked: true });
  assert.equal(observed.invalidFiles.blocked, true);
  assert.match(observed.invalidFiles.errors[0], /image-like\.pdf.*keinen lesbaren Text/);
  assert.match(observed.invalidFiles.errors[1], /unrelated\.pdf.*kein Wochenraster/);
});

test('Nachschreiber verwaltet Freistunden und bietet die zum Termin passenden Kopiervorlagen an', { timeout: 60000 }, async (t) => {
  const evaluate = await openNachschreiber(t, true);
  const result = await evaluate(async () => {
    const { getWorkspaceClient } = await import('/src/modules/workspace/client.js');
    const { data } = getWorkspaceClient();
    const byId = (id) => document.getElementById(id);
    const waitFor = async (condition) => {
      const deadline = performance.now() + 5000;
      while (!condition()) {
        if (performance.now() > deadline) throw new Error('Erwarteter Zustand wurde zu spät erreicht.');
        await new Promise((done) => requestAnimationFrame(done));
      }
    };
    const lessonTimes = [
      { lesson: 2, start: '08:50', end: '09:35' },
      { lesson: 3, start: '09:40', end: '10:25' },
      { lesson: 4, start: '10:25', end: '11:10' },
    ];
    data.setLessonTimes(lessonTimes);
    const root = byId('nachschreiber-shell');
    const add = byId('nachschreiber-add-period');
    const selected = byId('nachschreiber-period-list');
    const duration = byId('nachschreiber-duration');
    const submit = byId('nachschreiber-submit');
    const results = byId('nachschreiber-results');
    const csvSource = byId('nachschreiber-csv-source');
    const iservPrefix = byId('nachschreiber-iserv-prefix');
    const iservLink = byId('nachschreiber-iserv-link');
    const iservHint = byId(iservPrefix.getAttribute('aria-describedby'));
    const link = byId('nachschreiber-class-source');
    const setValue = (select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const addRow = () => {
      add.click();
      const element = selected.lastElementChild;
      const [weekday, lesson, remove] = element.querySelectorAll('select, button');
      return { element, weekday, lesson, remove, error: element.querySelector('[role="alert"]') };
    };
    const setPeriod = (row, day, hour) => {
      setValue(row.weekday, day);
      setValue(row.lesson, hour);
    };
    const periods = () => [...selected.children].map((row) => [...row.querySelectorAll('select')].map((select) => select.value));

    byId('tab-nachschreiber').click();
    await waitFor(() => !root.hidden && !add.disabled);
    const iservLinkState = () => ({
      href: iservLink.getAttribute('href'),
      hidden: iservLink.hidden,
      hintHidden: iservHint.hidden,
      invalid: iservPrefix.getAttribute('aria-invalid'),
    });
    const initialIservLink = iservLinkState();
    const enterIservPrefix = (value) => {
      iservPrefix.value = value;
      iservPrefix.dispatchEvent(new Event('input', { bubbles: true }));
      return iservLinkState();
    };
    const validIservLink = enterIservPrefix('schule.iserv');
    const pastedIservLink = enterIservPrefix('  schule.de  ');
    const invalidIservLink = enterIservPrefix('schule.de/pfad');
    const clearedIservLink = enterIservPrefix('');
    const januaryFourth = new Date(Date.UTC(new Date().getFullYear() + 2, 0, 4));
    const monday = new Date(januaryFourth);
    monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourth.getUTCDay() || 7) + 1);
    const tuesday = new Date(monday);
    tuesday.setUTCDate(monday.getUTCDate() + 1);
    const iso = (date) => date.toISOString().slice(0, 10);
    const csvDate = (date) => iso(date).split('-').reverse().join('.');
    const csv = [
      'Nr.;KW;Datum;Start;Ende;Gruppen;Lehrkraft',
      `;1;${csvDate(monday)};08:50;09:35;5a;Kürzel`,
      `;1;${csvDate(tuesday)};08:10;08:55;5b, Jahrgang.5;Vorname-B Nachname-B`,
      `;1;${csvDate(tuesday)};09:40;11:10;6c, Jahrgang.6;Vorname-C von Nachname-C`,
    ].join('\n');
    const input = byId('nachschreiber-file');
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], 'arbeiten.csv', { type: 'text/csv' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !submit.disabled);
    byId('nachschreiber-year').value = '9';
    byId('nachschreiber-class').value = 'b';
    byId('nachschreiber-end-date').value = iso(tuesday);
    const suggestions = () => {
      submit.click();
      return [...byId('nachschreiber-result-rows').rows].map((row) => [
        row.cells[4].textContent, row.querySelector('.nachschreiber-period-match')?.textContent ?? '',
      ]);
    };
    const withoutSelection = suggestions();
    const third = addRow();
    const options = [third.weekday, third.lesson].map((select) => [...select.options].slice(1).map((option) => option.textContent));
    const openWithFocus = document.activeElement === third.weekday && third.weekday.value === '' && third.lesson.value === '';
    setValue(third.weekday, '2');
    add.click();
    const reusedDraft = selected.children.length === 1 && document.activeElement === third.lesson && !results.hidden;
    const searchWithDraft = suggestions();
    setValue(third.lesson, '3');
    const autoAdded = results.hidden && document.activeElement === third.lesson;
    const second = addRow();
    second.lesson.focus();
    setPeriod(second, '2', '2');
    const focusAfterSorting = document.activeElement === second.lesson;
    const [weekdayBounds, lessonBounds, removeBounds] = [second.weekday, second.lesson, second.remove].map((field) => field.getBoundingClientRect());
    const periodLayout = weekdayBounds.right < lessonBounds.left && lessonBounds.right < removeBounds.left
      && Math.abs(weekdayBounds.bottom - lessonBounds.bottom) < 1 && Math.abs(lessonBounds.bottom - removeBounds.bottom) < 1
      && add.getBoundingClientRect().top > third.element.getBoundingClientRect().bottom;
    const withBoth = suggestions();
    const lessonsWithBoth = [...byId('nachschreiber-result-rows').rows].map((row) => [
      row.cells[4].textContent, row.querySelector('.nachschreiber-result-time').textContent,
    ]);
    const borderlessPeriods = getComputedStyle(selected.closest('.nachschreiber-free-periods')).borderTopWidth === '0px'
      && byId('nachschreiber-period-hint').hidden;
    const resultRows = byId('nachschreiber-result-rows');
    const messageButtons = (row) => Array.from(row.querySelectorAll('.nachschreiber-notice-trigger'));
    const noticeButtons = () => Array.from(resultRows.rows, (row) => [
      row.cells[4].textContent, messageButtons(row).map((button) => button.textContent),
    ]);
    const noticesWithBoth = noticeButtons();
    const [partialRow, coveredRow] = resultRows.rows;
    const [partialRequestTrigger, noticeTrigger, partialStudentTrigger] = messageButtons(partialRow);
    const [coveredRequestTrigger, coveredStudentTrigger] = messageButtons(coveredRow);
    const noticeDialog = byId('nachschreiber-notice-dialog');
    const noticeTitle = byId('nachschreiber-notice-title');
    const noticeText = byId('nachschreiber-notice-text');
    const noticeStatus = byId('nachschreiber-notice-status');
    const noticeCopy = byId('nachschreiber-notice-copy');
    const noticeClose = byId('nachschreiber-notice-close');
    const studentName = byId('nachschreiber-student-name');
    const setStudentName = (name) => {
      studentName.value = name;
      studentName.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const readStudentNotice = (button) => {
      button.click();
      const text = noticeText.value;
      noticeClose.click();
      return text;
    };
    setStudentName('  Lernperson A  ');
    noticeTrigger.focus();
    noticeTrigger.click();
    const noticeOpen = noticeDialog.open;
    const teacherNoticeTitle = noticeTitle.textContent;
    const initialNotice = noticeText.value;
    const editedNotice = `${initialNotice}\nErgänzung`;
    noticeText.value = editedNotice;
    noticeText.dispatchEvent(new Event('input', { bubbles: true }));
    const copies = [];
    const clipboard = { writeText: async (text) => copies.push(text) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    noticeCopy.click();
    await waitFor(() => noticeCopy.textContent === '✓' && noticeCopy.getAttribute('aria-label') === 'Text kopiert' && !noticeStatus.textContent);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Gesperrt', 'NotAllowedError'); } },
    });
    noticeCopy.click();
    await waitFor(() => noticeStatus.textContent.includes('manuell'));
    const manualCopy = document.activeElement === noticeText
      ? noticeText.value.slice(noticeText.selectionStart, noticeText.selectionEnd)
      : '';
    noticeClose.click();
    const noticeClosed = !noticeDialog.open && document.activeElement === noticeTrigger;

    setStudentName('Lernperson B');
    partialRequestTrigger.click();
    const partialRequest = noticeText.value;
    noticeClose.click();
    setStudentName('Lernperson C');
    coveredRequestTrigger.click();
    const requestTitle = noticeTitle.textContent;
    const coveredRequest = noticeText.value;
    const editedRequest = `${coveredRequest}\nErgänzung`;
    noticeText.value = editedRequest;
    noticeText.dispatchEvent(new Event('input', { bubbles: true }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    noticeCopy.click();
    await waitFor(() => noticeCopy.textContent === '✓' && noticeCopy.getAttribute('aria-label') === 'Text kopiert' && !noticeStatus.textContent);
    noticeClose.click();

    const partialStudentNotice = readStudentNotice(partialStudentTrigger);
    setStudentName('Lernperson D');
    coveredStudentTrigger.click();
    const studentNoticeTitle = noticeTitle.textContent;
    const dialogBounds = noticeDialog.getBoundingClientRect();
    const fullNoticeVisible = noticeText.scrollHeight <= noticeText.clientHeight
      && (dialogBounds.bottom <= innerHeight || noticeDialog.scrollHeight > noticeDialog.clientHeight);
    const coveredStudentNotice = noticeText.value;
    const editedStudentNotice = coveredStudentNotice.replace('[XXX]', 'Test-Raum');
    noticeText.value = editedStudentNotice;
    noticeText.dispatchEvent(new Event('input', { bubbles: true }));
    noticeCopy.click();
    await waitFor(() => noticeCopy.textContent === '✓' && noticeCopy.getAttribute('aria-label') === 'Text kopiert' && !noticeStatus.textContent);
    noticeClose.click();
    setStudentName('');
    const studentNoticeWithoutName = readStudentNotice(coveredStudentTrigger);
    const senderName = byId('nachschreiber-sender-name');
    const senderNotices = [noticeTrigger, coveredRequestTrigger, coveredStudentTrigger];
    data.setSetting('nachschreiberDefaultSenderName', 'Test-Absender');
    const defaultSenders = senderNotices.map((button) => readStudentNotice(button).split('\n').at(-1));
    senderName.value = '  Lehrkraft Z  ';
    senderName.dispatchEvent(new Event('input', { bubbles: true }));
    const signedNotices = senderNotices.map((button) => readStudentNotice(button).split('\n').slice(-2));
    const savedSenderAfterOverride = data.getSetting('nachschreiberDefaultSenderName');
    senderName.value = '';
    senderName.dispatchEvent(new Event('input', { bubbles: true }));
    data.setSetting('nachschreiberDefaultSenderName', '');

    duration.value = '2';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    suggestions();
    const noticesWithLongerDuration = noticeButtons();
    const lessonsWithLongerDuration = Array.from(resultRows.rows, (row) => row.querySelector('.nachschreiber-result-time').textContent);
    const longerStudentNotice = readStudentNotice(messageButtons(resultRows.rows[0]).at(-1));
    duration.value = '1';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    suggestions();
    const selectedLabels = periods();
    const duplicate = addRow();
    setPeriod(duplicate, '2', '2');
    const duplicateError = duplicate.error.textContent;
    const draftMarkedInvalid = duplicate.lesson.getAttribute('aria-invalid') === 'true';
    duplicate.remove.click();
    const removingDraftKeptResults = !results.hidden && selected.children.length === 2;

    second.lesson.focus();
    setValue(second.lesson, '3');
    const duplicateEditError = second.error.textContent;
    const duplicateKeptResults = !results.hidden;
    const afterDuplicateEdit = suggestions();
    second.lesson.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escapeDiscardedDraft = second.lesson.value === '2' && second.error.textContent === '' && !results.hidden;
    second.weekday.focus();
    setValue(second.weekday, '3');
    const edited = {
      labels: periods(),
      resultsHidden: results.hidden,
      focused: document.activeElement === second.weekday,
    };
    const afterEditing = suggestions();
    second.remove.click();
    const remainingLabels = periods();
    const deletionResetResults = results.hidden && document.activeElement === third.weekday;
    const afterRemoving = suggestions();

    data.setLessonTimes([{ lesson: 3, start: '11:10', end: '11:55' }]);
    await waitFor(() => third.lesson.options.length === 2);
    const hiddenAfterChange = results.hidden;
    const afterRasterChange = suggestions();
    data.setLessonTimes([]);
    await waitFor(() => third.lesson.disabled);
    const noRaster = {
      hint: byId('nachschreiber-period-hint').textContent,
      labels: periods(),
      addDisabled: add.disabled,
      unavailableOption: third.lesson.selectedOptions[0].disabled,
      suggestions: suggestions(),
    };
    const noRasterStudentNotice = readStudentNotice(messageButtons(resultRows.rows[0]).at(-1));
    const noRasterRequest = readStudentNotice(messageButtons(resultRows.rows[0])[0]);
    data.setLessonTimes(lessonTimes);
    await waitFor(() => !third.lesson.disabled);
    const afterRasterRestored = suggestions();
    const replacement = addRow();
    setPeriod(replacement, '2', '3');
    third.remove.click();
    const freedDuplicateApplied = replacement.error.textContent === '' && results.hidden
      && replacement.lesson.getAttribute('aria-invalid') === null && selected.children.length === 1;
    const afterFreedDuplicate = suggestions();
    const disposable = addRow();
    disposable.weekday.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escapeRemovedEmptyDraft = selected.children.length === 1 && !results.hidden;
    data.setLessonTimes([]);
    await waitFor(() => replacement.lesson.disabled);
    const canDeleteWithoutRaster = !replacement.remove.disabled && replacement.weekday.disabled;
    replacement.remove.click();
    const allRemoved = selected.hidden && document.activeElement === duration;
    return {
      csvSource: csvSource.textContent,
      iservLink: {
        target: iservLink.target,
        rel: iservLink.rel,
        label: iservLink.getAttribute('aria-label'),
        text: iservLink.textContent,
        placeholder: iservPrefix.placeholder,
        belowPath: csvSource.nextElementSibling.contains(iservPrefix)
          && csvSource.nextElementSibling.contains(iservLink),
      },
      initialIservLink, validIservLink, pastedIservLink, invalidIservLink, clearedIservLink,
      href: link.getAttribute('href'), target: link.target, rel: link.rel, options, openWithFocus,
      reusedDraft, searchWithDraft, autoAdded, focusAfterSorting, periodLayout, selectedLabels, withoutSelection, withBoth,
      lessonsWithBoth, lessonsWithLongerDuration, borderlessPeriods, duplicateError, draftMarkedInvalid, removingDraftKeptResults,
      duplicateEditError, duplicateKeptResults, afterDuplicateEdit, edited, afterEditing, escapeDiscardedDraft, remainingLabels,
      deletionResetResults, afterRemoving, hiddenAfterChange, afterRasterChange, noRaster, afterRasterRestored,
      freedDuplicateApplied, afterFreedDuplicate, escapeRemovedEmptyDraft, canDeleteWithoutRaster, allRemoved,
      noticeOpen, initialNotice, editedNotice, copies, manualCopy, noticeClosed, expectedNoticeDate: `Dienstag, ${csvDate(tuesday)}`,
      noticesWithBoth, noticesWithLongerDuration, teacherNoticeTitle, requestTitle, partialRequest, coveredRequest, editedRequest,
      studentNoticeTitle, partialStudentNotice, coveredStudentNotice, editedStudentNotice, longerStudentNotice,
      studentNoticeWithoutName, fullNoticeVisible, signedNotices, defaultSenders, savedSenderAfterOverride,
      noRasterStudentNotice, noRasterRequest, expectedMondayDate: `Montag, ${csvDate(monday)}`,
    };
  });

  assert.equal(result.csvSource, 'IServ-Randleiste → Alle Module → Klausurenplan → Exportieren');
  assert.deepEqual(result.iservLink, {
    target: '_blank',
    rel: 'noopener noreferrer',
    label: 'IServ-Klausurenplan',
    text: 'IServ-Klausurenplan',
    placeholder: 'mein-iserv',
    belowPath: true,
  });
  const emptyIservLink = { href: null, hidden: true, hintHidden: true, invalid: null };
  assert.deepEqual(result.initialIservLink, emptyIservLink);
  assert.deepEqual(result.validIservLink, {
    href: 'https://schule.iserv.de/iserv/examplan?filter%5BTyp%5D%5B%5D=1',
    hidden: false, hintHidden: true, invalid: null,
  });
  assert.deepEqual(result.pastedIservLink, {
    href: 'https://schule.de/iserv/examplan?filter%5BTyp%5D%5B%5D=1',
    hidden: false, hintHidden: true, invalid: null,
  });
  assert.deepEqual(result.invalidIservLink, { href: null, hidden: true, hintHidden: false, invalid: 'true' });
  assert.deepEqual(result.clearedIservLink, emptyIservLink);
  assert.equal(result.href, 'https://login.schulmanager-online.de/#/modules/schedules/view/student/');
  assert.equal(result.target, '_blank');
  assert.match(result.rel, /\bnoopener\b/);
  assert.deepEqual(result.options, [['Mo', 'Di', 'Mi', 'Do', 'Fr'], ['2', '3', '4']]);
  assert.equal(result.openWithFocus, true);
  assert.equal(result.reusedDraft, true);
  assert.deepEqual(result.searchWithDraft, result.withoutSelection);
  assert.equal(result.autoAdded, true);
  assert.equal(result.focusAfterSorting, true);
  assert.equal(result.periodLayout, true);
  assert.equal(result.borderlessPeriods, true);
  const tuesdayThirdLesson = ['2', '3'];
  assert.deepEqual(result.selectedLabels, [['2', '2'], tuesdayThirdLesson]);
  const chronological = [['Kürzel', ''], ['Vorname-B Nachname-B', ''], ['Vorname-C von Nachname-C', '']];
  assert.deepEqual(result.withoutSelection, chronological);
  assert.deepEqual(result.withBoth, [
    ['Vorname-B Nachname-B', 'Überschneidung mit Freistunde (2. Stunde)'],
    ['Vorname-C von Nachname-C', 'Überschneidung mit Freistunde (3. Stunde)'],
    ['Kürzel', ''],
  ]);
  assert.deepEqual(result.lessonsWithBoth, [
    ['Vorname-B Nachname-B', '2'], ['Vorname-C von Nachname-C', '3'], ['Kürzel', '2'],
  ]);
  assert.deepEqual(result.lessonsWithLongerDuration, ['3–4']);
  const allActions = ['Aufsicht anfragen', 'Reguläre Lehrkraft informieren', 'Prüfling informieren'];
  assert.deepEqual(result.noticesWithBoth, [
    ['Vorname-B Nachname-B', allActions], ['Vorname-C von Nachname-C', ['Aufsicht anfragen', 'Prüfling informieren']], ['Kürzel', allActions],
  ]);
  assert.deepEqual(result.noticesWithLongerDuration, [['Vorname-C von Nachname-C', allActions]]);
  assert.equal(result.noticeOpen, true);
  assert.equal(result.teacherNoticeTitle, 'Reguläre Lehrkraft informieren');
  assert.equal(result.initialNotice, [
    'Hallo [Lehrkraftname],',
    `am ${result.expectedNoticeDate.replace(', ', ', den ')}, würde ich gerne Lernperson A (9b) in der 2. Stunde eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    'Da der Nachschreibtermin in Deinen Unterricht fällt, möchte ich Dich fragen, ob Du damit einverstanden wärst, dass Lernperson A in dieser Stunde die Arbeit nachschreibt.',
    'Viele Grüße',
    '[Absender]',
  ].join('\n'));
  const expectedRequest = (firstName, lesson, groups, studentName, date = result.expectedNoticeDate) => [
    `Hallo ${firstName},`,
    `am ${date.replace(', ', ', den ')}, würde ich gerne in der ${lesson} eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    `Wäre es möglich, dass ${studentName} (9b) unter Deiner Aufsicht zusammen mit Deiner Lerngruppe „${groups}“, für die Du zu diesem Termin eine schriftliche Arbeit angesetzt hast, die Arbeit nachschreibt?`,
    'Viele Grüße',
    '[Absender]',
  ].join('\n');
  assert.equal(result.requestTitle, 'Aufsicht anfragen');
  assert.equal(result.partialRequest, expectedRequest('Vorname-B', '2. Stunde', '5b, Jahrgang.5', 'Lernperson B'));
  assert.equal(result.coveredRequest, expectedRequest('Vorname-C', '3. Stunde', '6c, Jahrgang.6', 'Lernperson C'));
  assert.deepEqual(result.copies, [result.editedNotice, result.editedRequest, result.editedStudentNotice]);
  const expectedStudentNotice = (date, lastName, lesson, includesTeacherNotice, studentName = '[Prüflingsname]') => [
    `Hallo ${studentName},`,
    'hoffentlich geht es Dir bald wieder besser!',
    `Für das Nachschreiben Deiner versäumten schriftlichen Arbeit habe ich Dich für einen Termin angemeldet, an dem die Lehrkraft ${lastName} bereits eine schriftliche Arbeit in einer anderen Lerngruppe durchführt. Du erhältst dort Deine Arbeit und schreibst diese unter der Aufsicht der Lehrkraft nach.`,
    ...(includesTeacherNotice ? [
      'Die Lehrkraft, bei der Du zu diesem Zeitpunkt regulär Unterricht hättest, habe ich bereits informiert. Dennoch würde ich Dich bitten, sie auch selbst über Deinen Nachschreibtermin in Kenntnis zu setzen.',
    ] : []),
    `Dein Nachschreibtermin:\n\n- Datum: ${date}\n- Raum: [XXX]\n- Zeit: ${lesson}`,
    'Bitte denk daran, dass Du in der Sekundarstufe I (Jahrgänge 5–10) eine schriftliche Entschuldigung bzw. in der Sekundarstufe II (Jahrgänge 11–13) eine ärztliche Bescheinigung vorlegen musst, um nachschreiben zu können.',
    'Viele Grüße\n[Absender]',
  ].join('\n\n');
  assert.equal(result.studentNoticeTitle, 'Prüfling informieren');
  assert.equal(result.fullNoticeVisible, true);
  assert.equal(result.partialStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'Nachname-B', '2. Stunde', true, 'Lernperson C'));
  assert.equal(result.coveredStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. Stunde', false, 'Lernperson D'));
  assert.equal(result.studentNoticeWithoutName, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. Stunde', false));
  assert.deepEqual(result.defaultSenders, ['Test-Absender', 'Test-Absender', 'Test-Absender']);
  assert.equal(result.savedSenderAfterOverride, 'Test-Absender');
  assert.deepEqual(result.signedNotices, [
    ['Viele Grüße', 'Lehrkraft Z'], ['Viele Grüße', 'Lehrkraft Z'], ['Viele Grüße', 'Lehrkraft Z'],
  ]);
  assert.equal(result.longerStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. und 4. Stunde', true));
  assert.equal(result.noRasterRequest, expectedRequest('Kürzel', '[XXX]. Stunde', '5a', '[Prüflingsname]', result.expectedMondayDate));
  assert.equal(result.noRasterStudentNotice, expectedStudentNotice(result.expectedMondayDate, '[Nachname der Lehrkraft]', '[Stunde]', true));
  assert.equal(result.manualCopy, result.editedNotice);
  assert.equal(result.noticeClosed, true);
  assert.match(result.duplicateError, /bereits eingetragen/);
  assert.equal(result.draftMarkedInvalid, true);
  assert.equal(result.removingDraftKeptResults, true);
  assert.match(result.duplicateEditError, /bisherige Auswahl gilt weiter/);
  assert.equal(result.duplicateKeptResults, true);
  assert.deepEqual(result.afterDuplicateEdit, result.withBoth);
  assert.deepEqual(result.edited, {
    labels: [tuesdayThirdLesson, ['3', '2']],
    resultsHidden: true,
    focused: true,
  });
  const onlyThirdLessonMatches = [
    ['Vorname-C von Nachname-C', 'Überschneidung mit Freistunde (3. Stunde)'], ['Kürzel', ''], ['Vorname-B Nachname-B', ''],
  ];
  assert.deepEqual(result.afterEditing, onlyThirdLessonMatches);
  assert.equal(result.escapeDiscardedDraft, true);
  assert.deepEqual(result.remainingLabels, [tuesdayThirdLesson]);
  assert.equal(result.deletionResetResults, true);
  assert.deepEqual(result.afterRemoving, onlyThirdLessonMatches);
  assert.equal(result.hiddenAfterChange, true);
  assert.deepEqual(result.afterRasterChange, chronological);
  assert.equal(result.noRaster.hint, 'Für Freistunden werden hinterlegte Unterrichtszeiten benötigt.');
  assert.deepEqual(result.noRaster.labels, [tuesdayThirdLesson]);
  assert.equal(result.noRaster.addDisabled, true);
  assert.equal(result.noRaster.unavailableOption, true);
  assert.deepEqual(result.noRaster.suggestions, chronological);
  assert.deepEqual(result.afterRasterRestored, onlyThirdLessonMatches);
  assert.equal(result.freedDuplicateApplied, true);
  assert.deepEqual(result.afterFreedDuplicate, onlyThirdLessonMatches);
  assert.equal(result.escapeRemovedEmptyDraft, true);
  assert.equal(result.canDeleteWithoutRaster, true);
  assert.equal(result.allRemoved, true);
});
