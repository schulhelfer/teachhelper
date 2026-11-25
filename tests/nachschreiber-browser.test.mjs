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
    await waitFor(() => status.textContent === 'arbeiten\n1 Klassenarbeit');
    submit.click();
    const dropRows = getRows();
    endDate.value = isoAt(0);
    endDate.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    const emptyMessage = resultStatus.textContent;

    dropZone.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: transfers(`;2;${csvDate(1)};;;13e;Kürzel D`),
    }));
    await waitFor(() => status.classList.contains('is-error'));
    byId('tab-planning').click();
    await waitFor(() => root.hidden);

    return {
      hiddenBeforeActivation, initialDisabled, initialDuration, durationOptions, pickerOpened, importMessage, statusInsideDropZone, initialStatus,
      pickerRows, longerDurationRows, clearedAfterDurationChange, rowsWithoutEndDate, dropRows, treatedNameAsText,
      emptyMessage, errorMessage: status.textContent, disabledAfterError: submit.disabled, expectedDate: `Di, ${csvDate(1)}`,
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
  assert.equal(result.importMessage, 'arbeiten\n6 Klassenarbeiten');
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
  assert.deepEqual(result.dropRows, [[result.expectedDate, '09:00–10:30', '–', '13e', 'Kürzel D', '0']]);
  assert.match(result.emptyMessage, /keine passenden Termine/);
  assert.match(result.errorMessage, /Kalenderwoche in CSV-Zeile 2/);
  assert.equal(result.disabledAfterError, true);

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
  const evaluate = await openNachschreiber(t);
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
      .map((id) => steps.indexOf(byId(`nachschreiber-${id}`).closest('li')) + 1);
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
    'Klausurenplan importieren', 'Lerngruppe auswählen', 'Wöchentliche Freistunden (optional)',
    'Dauer der Nachschreibklausur', 'Name des Prüflings (optional)', 'Datumsfilter (optional)', 'Eigener Name (optional)',
  ]);
  assert.deepEqual(desktop.controlSteps, [1, 2, 2, 2, 3, 4, 5, 6, 6, 7]);
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
    return {
      stacked: sideBounds.bottom <= mainBounds.top + 1,
      fullWidth: Math.abs(sideBounds.width - mainBounds.width) < 2 && sideBounds.width >= 418,
      sidebarVisible: document.getElementById('nachschreiber-form').getBoundingClientRect().width > 0,
      resultsVisible: document.getElementById('nachschreiber-results-title').getBoundingClientRect().width > 0,
      iservControlsSideBySide: linkBounds.left > inputBounds.right && linkBounds.top === inputBounds.top
        && Math.abs(linkBounds.width - inputBounds.width) < 1 && emptyInputWidth === inputBounds.width,
    };
  });
  assert.deepEqual(mobile, {
    stacked: true, fullWidth: true, sidebarVisible: true, resultsVisible: true, iservControlsSideBySide: true,
  });
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
    const weekday = byId('nachschreiber-period-weekday');
    const lesson = byId('nachschreiber-period-lesson');
    const add = byId('nachschreiber-add-period');
    const editor = byId('nachschreiber-period-editor');
    const save = byId('nachschreiber-period-save');
    const cancel = byId('nachschreiber-period-cancel');
    const remove = byId('nachschreiber-period-delete');
    const selected = byId('nachschreiber-period-list');
    const duration = byId('nachschreiber-duration');
    const submit = byId('nachschreiber-submit');
    const csvSource = byId('nachschreiber-csv-source');
    const iservPrefix = byId('nachschreiber-iserv-prefix');
    const iservLink = byId('nachschreiber-iserv-link');
    const iservHint = byId(iservPrefix.getAttribute('aria-describedby'));
    const link = byId('nachschreiber-class-source');
    const setValue = (select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setPeriod = (day, hour) => {
      setValue(weekday, day);
      setValue(lesson, hour);
    };
    const periods = () => [...selected.querySelectorAll('button[data-period-key]')].map((button) => [
      button.dataset.periodKey, ...Array.from(button.children, (child) => child.textContent),
    ]);

    byId('tab-nachschreiber').click();
    await waitFor(() => !root.hidden && lesson.options[1]?.textContent.includes('08:50'));
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
    const options = [...lesson.options].slice(1).map((option) => option.textContent);
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
    add.click();
    const openWithFocus = !editor.hidden && byId('nachschreiber-sidebar').contains(editor)
      && editor.closest('dialog') === null && document.activeElement === weekday && remove.hidden
      && add.getAttribute('aria-expanded') === 'true';
    save.click();
    const emptyEditorRemainsOpen = !editor.hidden && selected.hidden
      && byId('nachschreiber-period-error').textContent === 'Wähle einen Wochentag.';
    const searchWithDraft = suggestions();
    setPeriod('2', '3');
    save.click();
    const focusAfterAdding = document.activeElement === add && editor.hidden && add.getAttribute('aria-expanded') === 'false';
    add.click();
    setPeriod('2', '2');
    save.click();
    const withBoth = suggestions();
    const lessonsWithBoth = [...byId('nachschreiber-result-rows').rows].map((row) => [
      row.cells[4].textContent, row.querySelector('.nachschreiber-result-time').textContent,
    ]);
    const borderlessPeriods = getComputedStyle(selected.closest('.nachschreiber-free-periods')).borderTopWidth === '0px'
      && getComputedStyle(selected.querySelector('button')).borderTopWidth === '0px'
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
    await waitFor(() => noticeStatus.textContent === 'Text kopiert.');
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
    await waitFor(() => noticeStatus.textContent === 'Text kopiert.');
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
    await waitFor(() => noticeStatus.textContent === 'Text kopiert.');
    noticeClose.click();
    setStudentName('');
    const studentNoticeWithoutName = readStudentNotice(coveredStudentTrigger);
    const senderName = byId('nachschreiber-sender-name');
    senderName.value = '  Lehrkraft Z  ';
    senderName.dispatchEvent(new Event('input', { bubbles: true }));
    const signedNotices = [noticeTrigger, coveredRequestTrigger, coveredStudentTrigger]
      .map((button) => readStudentNotice(button).split('\n').slice(-2));
    senderName.value = '';
    senderName.dispatchEvent(new Event('input', { bubbles: true }));

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
    add.click();
    setPeriod('2', '2');
    save.click();
    const duplicateError = byId('nachschreiber-period-error').textContent;
    const duplicateKeptEditorOpen = !editor.hidden && periods().length === 2;
    cancel.click();
    const cancelKeptResults = editor.hidden && !byId('nachschreiber-results').hidden;

    selected.querySelector('[data-period-key="2-2"]').click();
    const editValues = [weekday.value, lesson.value, remove.hidden];
    setPeriod('3', '2');
    save.click();
    const edited = {
      labels: periods(),
      resultsHidden: byId('nachschreiber-results').hidden,
      focusedEntry: document.activeElement.dataset.periodKey,
    };
    const afterEditing = suggestions();
    selected.querySelector('[data-period-key="3-2"]').click();
    setPeriod('1', '2');
    weekday.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escapeDiscardedDraft = editor.hidden && document.activeElement === selected.querySelector('[data-period-key="3-2"]')
      && !selected.querySelector('[data-period-key="1-2"]');
    selected.querySelector('[data-period-key="3-2"]').click();
    remove.click();
    const remainingLabels = periods();
    const afterRemoving = suggestions();

    data.setLessonTimes([{ lesson: 3, start: '11:10', end: '11:55' }]);
    await waitFor(() => lesson.options[1]?.textContent.includes('11:10'));
    const hiddenAfterChange = byId('nachschreiber-results').hidden;
    const afterRasterChange = suggestions();
    data.setLessonTimes([]);
    await waitFor(() => lesson.disabled);
    const noRaster = {
      hint: byId('nachschreiber-period-hint').textContent,
      labels: periods(),
      addDisabled: add.disabled,
      suggestions: suggestions(),
    };
    const noRasterStudentNotice = readStudentNotice(messageButtons(resultRows.rows[0]).at(-1));
    const noRasterRequest = readStudentNotice(messageButtons(resultRows.rows[0])[0]);
    selected.querySelector('button').click();
    const canDeleteWithoutRaster = !editor.hidden && !remove.hidden && save.disabled;
    remove.click();
    const allRemoved = selected.hidden && editor.hidden;
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
      emptyEditorRemainsOpen, searchWithDraft, focusAfterAdding, selectedLabels, withoutSelection, withBoth, lessonsWithBoth, lessonsWithLongerDuration, borderlessPeriods, duplicateError,
      duplicateKeptEditorOpen, cancelKeptResults, editValues, edited, afterEditing, escapeDiscardedDraft,
      remainingLabels, afterRemoving, hiddenAfterChange, afterRasterChange, noRaster, canDeleteWithoutRaster, allRemoved,
      noticeOpen, initialNotice, editedNotice, copies, manualCopy, noticeClosed, expectedNoticeDate: `Dienstag, ${csvDate(tuesday)}`,
      noticesWithBoth, noticesWithLongerDuration, teacherNoticeTitle, requestTitle, partialRequest, coveredRequest, editedRequest,
      studentNoticeTitle, partialStudentNotice, coveredStudentNotice, editedStudentNotice, longerStudentNotice,
      studentNoticeWithoutName, fullNoticeVisible, signedNotices, noRasterStudentNotice, noRasterRequest, expectedMondayDate: `Montag, ${csvDate(monday)}`,
    };
  });

  assert.equal(result.csvSource, 'IServ-Randleiste → Alle Module → Klausurenplan → Exportieren');
  assert.deepEqual(result.iservLink, {
    target: '_blank',
    rel: 'noopener noreferrer',
    label: 'Klausurenplan in IServ öffnen',
    text: 'Öffnen',
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
  assert.deepEqual(result.options, ['2. Stunde (08:50–09:35)', '3. Stunde (09:40–10:25)', '4. Stunde (10:25–11:10)']);
  assert.equal(result.openWithFocus, true);
  assert.equal(result.emptyEditorRemainsOpen, true);
  assert.deepEqual(result.searchWithDraft, result.withoutSelection);
  assert.equal(result.focusAfterAdding, true);
  assert.equal(result.borderlessPeriods, true);
  const tuesdayThirdLesson = ['2-3', 'Dienstag', '3. Stunde · 09:40–10:25'];
  assert.deepEqual(result.selectedLabels, [['2-2', 'Dienstag', '2. Stunde · 08:50–09:35'], tuesdayThirdLesson]);
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
    'Hallo [Name der Lehrkraft],',
    `am ${result.expectedNoticeDate} würde ich gerne Lernperson A (9b) in der 2. Stunde eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    'Da der Nachschreibtermin in deinen Unterricht fällt, würde ich dich bitten, das Fehlen für diesen Zeitraum zu entschuldigen.',
    'Vielen Dank und viele Grüße',
    '[Absender]',
  ].join('\n'));
  const expectedRequest = (firstName, lesson, groups, studentName) => [
    `Hallo ${firstName},`,
    `am ${result.expectedNoticeDate} würde ich gerne in der ${lesson} eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    `Wäre es möglich, dass ${studentName} (9b) die Arbeit parallel zu deiner schriftlichen Arbeit in der Lerngruppe „${groups}“ unter deiner Aufsicht nachschreibt? Falls ja, in welchem Raum schreibst du die Arbeit?`,
    'Vielen Dank und viele Grüße',
    '[Absender]',
  ].join('\n');
  assert.equal(result.requestTitle, 'Aufsicht anfragen');
  assert.equal(result.partialRequest, expectedRequest('Vorname-B', '2. Stunde', '5b, Jahrgang.5', 'Lernperson B'));
  assert.equal(result.coveredRequest, expectedRequest('Vorname-C', '3. Stunde', '6c, Jahrgang.6', 'Lernperson C'));
  assert.deepEqual(result.copies, [result.editedNotice, result.editedRequest, result.editedStudentNotice]);
  const expectedStudentNotice = (date, lastName, lesson, includesTeacherNotice, studentName = '[Prüflingsname]') => [
    `Hallo ${studentName},`,
    'hoffentlich geht es Dir bald wieder besser!',
    `Für das Nachschreiben Deiner versäumten schriftlichen Arbeit habe ich Dich für einen Termin angemeldet, an dem Herr/Frau ${lastName} bereits eine schriftliche Arbeit in einer anderen Lerngruppe durchführt. Du erhältst dort Deine Arbeit und schreibst diese unter der Aufsicht der Lehrkraft nach.`,
    ...(includesTeacherNotice ? [
      'Die Lehrkraft, bei der Du zu diesem Zeitpunkt regulär Unterricht hättest, habe ich bereits informiert. Dennoch würde ich Dich bitten, sie auch selbst über Deinen Nachschreibtermin in Kenntnis zu setzen.',
    ] : []),
    `Dein Nachschreibtermin:\n\n- Datum: ${date}\n- Raum: [XXX]\n- Stunde: ${lesson}`,
    'Bitte denk daran, dass Du in der Sekundarstufe I (Jahrgänge 5–10) eine schriftliche Entschuldigung bzw. in der Sekundarstufe II (Jahrgänge 11–13) eine ärztliche Bescheinigung vorlegen musst, um nachschreiben zu können.',
    'Viele Grüße\n[Absender]',
  ].join('\n\n');
  assert.equal(result.studentNoticeTitle, 'Prüfling informieren');
  assert.equal(result.fullNoticeVisible, true);
  assert.equal(result.partialStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'Nachname-B', '2. Stunde', true, 'Lernperson C'));
  assert.equal(result.coveredStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. Stunde', false, 'Lernperson D'));
  assert.equal(result.studentNoticeWithoutName, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. Stunde', false));
  assert.deepEqual(result.signedNotices, [
    ['Vielen Dank und viele Grüße', 'Lehrkraft Z'], ['Vielen Dank und viele Grüße', 'Lehrkraft Z'], ['Viele Grüße', 'Lehrkraft Z'],
  ]);
  assert.equal(result.longerStudentNotice, expectedStudentNotice(result.expectedNoticeDate, 'von Nachname-C', '3. und 4. Stunde', true));
  assert.equal(result.noRasterRequest, expectedRequest('Kürzel', '[XXX]. Stunde', '5a', '[Prüflingsname]').replace(result.expectedNoticeDate, result.expectedMondayDate));
  assert.equal(result.noRasterStudentNotice, expectedStudentNotice(result.expectedMondayDate, '[Nachname der Lehrkraft]', '[Stunde]', true));
  assert.equal(result.manualCopy, result.editedNotice);
  assert.equal(result.noticeClosed, true);
  assert.match(result.duplicateError, /bereits eingetragen/);
  assert.equal(result.duplicateKeptEditorOpen, true);
  assert.equal(result.cancelKeptResults, true);
  assert.deepEqual(result.editValues, ['2', '2', false]);
  assert.deepEqual(result.edited, {
    labels: [tuesdayThirdLesson, ['3-2', 'Mittwoch', '2. Stunde · 08:50–09:35']],
    resultsHidden: true,
    focusedEntry: '3-2',
  });
  const onlyThirdLessonMatches = [
    ['Vorname-C von Nachname-C', 'Überschneidung mit Freistunde (3. Stunde)'], ['Kürzel', ''], ['Vorname-B Nachname-B', ''],
  ];
  assert.deepEqual(result.afterEditing, onlyThirdLessonMatches);
  assert.equal(result.escapeDiscardedDraft, true);
  assert.deepEqual(result.remainingLabels, [tuesdayThirdLesson]);
  assert.deepEqual(result.afterRemoving, onlyThirdLessonMatches);
  assert.equal(result.hiddenAfterChange, true);
  assert.deepEqual(result.afterRasterChange, chronological);
  assert.equal(result.noRaster.hint, 'Für Freistunden werden hinterlegte Unterrichtszeiten benötigt.');
  assert.deepEqual(result.noRaster.labels, [['2-3', 'Dienstag', '3. Stunde (ohne Uhrzeit)']]);
  assert.equal(result.noRaster.addDisabled, true);
  assert.deepEqual(result.noRaster.suggestions, chronological);
  assert.equal(result.canDeleteWithoutRaster, true);
  assert.equal(result.allRemoved, true);
});
