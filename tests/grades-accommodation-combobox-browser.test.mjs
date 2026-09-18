import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('die NTA-Namenssuche filtert, wählt aus und sperrt vergebene Namen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');

    document.body.innerHTML = `
      <div id="grade-accommodation-list" class="grade-accommodation-list"></div>
      <button id="grade-accommodation-add"></button>
      <p id="grade-accommodation-status"></p>
    `;
    const list = document.querySelector('#grade-accommodation-list');

    const app = Object.create(GradesApp.prototype);
    app.refs = {
      gradeAccommodationList: list,
      gradeAccommodationAdd: document.querySelector('#grade-accommodation-add'),
      gradeAccommodationStatus: document.querySelector('#grade-accommodation-status'),
    };
    list.addEventListener('input', (event) => app.handleGradeAccommodationDialogInput(event));
    list.addEventListener('click', (event) => app.handleGradeAccommodationDialogClick(event));
    list.addEventListener('focusin', (event) => app.handleGradeAccommodationDialogFocusIn(event));
    list.addEventListener('focusout', (event) => app.handleGradeAccommodationDialogFocusOut(event));
    list.addEventListener('keydown', (event) => app.handleGradeAccommodationDialogKeydown(event));
    list.addEventListener('mousedown', (event) => app.handleGradeAccommodationDialogPointerDown(event));

    const students = [
      { id: 1, firstName: 'Anna', lastName: 'Müller' },
      { id: 2, firstName: 'Ben', lastName: 'Schmidt' },
      { id: 3, firstName: 'Tim', lastName: 'Mueller-Lang' },
    ];
    app.gradeAccommodationDialogDraft = {
      courseId: 7,
      students,
      nameOrder: 'last',
      rows: [
        { uid: 'a', studentId: 0, text: '', updatedAt: '' },
        { uid: 'b', studentId: 2, text: 'Zeitzuschlag', updatedAt: '' },
      ],
      ui: new Map(),
    };

    app.renderGradeAccommodationDialog();

    const cardA = list.querySelector('[data-accommodation-uid="a"]');
    const cardB = list.querySelector('[data-accommodation-uid="b"]');
    const inputA = cardA.querySelector('input[data-grade-accommodation-student="1"]');
    const inputB = cardB.querySelector('input[data-grade-accommodation-student="1"]');

    const markup = {
      noSelect: list.querySelectorAll('select').length,
      role: inputA.getAttribute('role'),
      listboxRole: cardA.querySelector('.grade-accommodation-options').getAttribute('role'),
      expandedInitially: inputA.getAttribute('aria-expanded'),
      preselectedName: inputB.value,
    };

    const rowA = app.gradeAccommodationDialogDraft.rows[0];
    app.openGradeAccommodationCombobox(cardA, rowA, '');
    const openState = {
      expanded: inputA.getAttribute('aria-expanded'),
      optionCount: cardA.querySelectorAll('.grade-accommodation-option').length,
      takenLabels: [...cardA.querySelectorAll('.grade-accommodation-option.is-taken')].map((o) => o.textContent),
    };

    inputA.value = 'mul';
    inputA.dispatchEvent(new Event('input', { bubbles: true }));
    const umlautSearch = [...cardA.querySelectorAll('.grade-accommodation-option')].map((o) => o.textContent);

    inputA.value = 'zzz';
    inputA.dispatchEvent(new Event('input', { bubbles: true }));
    const noMatch = {
      empty: cardA.querySelector('.grade-accommodation-option-empty')?.textContent ?? null,
    };

    inputA.value = 'schmidt';
    inputA.dispatchEvent(new Event('input', { bubbles: true }));
    const takenOption = cardA.querySelector('.grade-accommodation-option');
    const takenBlocked = {
      isTaken: takenOption.classList.contains('is-taken'),
      ariaDisabled: takenOption.getAttribute('aria-disabled'),
    };
    takenOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const afterTakenClick = {
      studentId: app.gradeAccommodationDialogDraft.rows[0].studentId,
      status: app.refs.gradeAccommodationStatus.textContent,
    };

    inputA.value = 'mueller-lang';
    inputA.dispatchEvent(new Event('input', { bubbles: true }));
    const freshCardA = list.querySelector('[data-accommodation-uid="a"]');
    const pick = freshCardA.querySelector('.grade-accommodation-option');
    const pickLabel = pick.textContent;
    pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const afterSelect = {
      studentId: app.gradeAccommodationDialogDraft.rows[0].studentId,
      inputValue: list
        .querySelector('[data-accommodation-uid="a"] input[data-grade-accommodation-student="1"]')
        .value,
      listHidden: list.querySelector('[data-accommodation-uid="a"] .grade-accommodation-options').hidden,
    };

    const reopenInput = list.querySelector('[data-accommodation-uid="a"] input[data-grade-accommodation-student="1"]');
    reopenInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const reopenByClick = {
      hidden: list.querySelector('[data-accommodation-uid="a"] .grade-accommodation-options').hidden,
    };
    const reopenCard = list.querySelector('[data-accommodation-uid="a"]');
    app.closeGradeAccommodationCombobox(reopenCard, app.gradeAccommodationDialogDraft.rows[0]);

    const keyboardCard = list.querySelector('[data-accommodation-uid="b"]');
    const keyboardRow = app.gradeAccommodationDialogDraft.rows[1];
    const keyboardInput = keyboardCard.querySelector('input[data-grade-accommodation-student="1"]');
    app.openGradeAccommodationCombobox(keyboardCard, keyboardRow, '');
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    keyboardInput.dispatchEvent(down);
    const activeAfterDown = keyboardCard.querySelector('.grade-accommodation-option.is-active')?.textContent ?? null;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    keyboardInput.dispatchEvent(enter);
    const keyboard = {
      arrowPrevented: down.defaultPrevented,
      activeAfterDown,
      enterPrevented: enter.defaultPrevented,
      studentId: app.gradeAccommodationDialogDraft.rows[1].studentId,
    };

    const escCard = list.querySelector('[data-accommodation-uid="b"]');
    const escRow = app.gradeAccommodationDialogDraft.rows[1];
    const escInput = escCard.querySelector('input[data-grade-accommodation-student="1"]');
    app.openGradeAccommodationCombobox(escCard, escRow, '');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    escInput.dispatchEvent(esc);
    const escape = {
      prevented: esc.defaultPrevented,
      hidden: escCard.querySelector('.grade-accommodation-options').hidden,
      restoredValue: escInput.value,
    };

    const clearInput = list.querySelector('[data-accommodation-uid="b"] input[data-grade-accommodation-student="1"]');
    clearInput.value = '';
    clearInput.dispatchEvent(new Event('input', { bubbles: true }));
    const cleared = { studentId: app.gradeAccommodationDialogDraft.rows[1].studentId };

    return {
      markup, openState, umlautSearch, noMatch, takenBlocked, afterTakenClick,
      pickLabel, afterSelect, reopenByClick, keyboard, escape, cleared,
    };
  });

  assert.equal(result.markup.noSelect, 0, 'kein <select> mehr im Dialog');
  assert.equal(result.markup.role, 'combobox');
  assert.equal(result.markup.listboxRole, 'listbox');
  assert.equal(result.markup.expandedInitially, 'false');
  assert.equal(result.markup.preselectedName, 'Schmidt, Ben', 'gesetzte Zeile zeigt ihren Namen');

  assert.equal(result.openState.expanded, 'true');
  assert.equal(result.openState.optionCount, 3, 'ohne Eingabe erscheinen alle Namen');
  assert.deepEqual(result.openState.takenLabels, ['Schmidt, Ben (bereits vergeben)']);

  assert.deepEqual(result.umlautSearch, ['Müller, Anna', 'Mueller-Lang, Tim'], 'mul findet Müller und Mueller');
  assert.equal(result.noMatch.empty, 'Kein Treffer');

  assert.equal(result.takenBlocked.isTaken, true);
  assert.equal(result.takenBlocked.ariaDisabled, 'true');
  assert.equal(result.afterTakenClick.studentId, 0, 'vergebener Name wird nicht übernommen');
  assert.match(result.afterTakenClick.status, /bereits eine Kachel/);

  assert.equal(result.pickLabel, 'Mueller-Lang, Tim');
  assert.equal(result.afterSelect.studentId, 3);
  assert.equal(result.afterSelect.inputValue, 'Mueller-Lang, Tim');
  assert.equal(result.afterSelect.listHidden, true, 'Liste bleibt auch nach dem Refokussieren geschlossen');
  assert.equal(result.reopenByClick.hidden, false, 'ein Klick öffnet die Liste wieder');

  assert.equal(result.keyboard.arrowPrevented, true, 'Pfeiltaste scrollt den Dialog nicht');
  assert.equal(result.keyboard.activeAfterDown, 'Müller, Anna');
  assert.equal(result.keyboard.enterPrevented, true, 'Enter schickt das Formular nicht ab');
  assert.equal(result.keyboard.studentId, 1, 'Enter übernimmt den aktiven Treffer');

  assert.equal(result.escape.prevented, true);
  assert.equal(result.escape.hidden, true, 'Escape schließt nur die Liste');
  assert.equal(result.escape.restoredValue, 'Müller, Anna', 'Escape stellt den gültigen Namen wieder her');

  assert.equal(result.cleared.studentId, 0, 'geleertes Feld löst die Zuordnung');
});
