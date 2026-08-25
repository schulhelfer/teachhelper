import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');

function classMethod(name, nextName) {
  const start = appSource.indexOf(`  ${name}(`);
  const end = appSource.indexOf(`\n  ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} must exist before ${nextName}`);
  return appSource.slice(start, end);
}

const formatTaskList = Function(`"use strict"; return ({${classMethod(
  'formatExpectationHorizonTaskNumberList',
  'buildExpectationHorizonComment'
)}}).formatExpectationHorizonTaskNumberList;`)();

const buildComment = Function(`"use strict"; return ({${classMethod(
  'buildExpectationHorizonComment',
  'buildExpectationHorizonStudentComment'
)}}).buildExpectationHorizonComment;`)();

test('der einzelne Aufgabenlisten-Platzhalter formatiert deutsche Aufgabenreihen vollständig', () => {
  assert.equal(formatTaskList.call({}, [1]), 'Aufgabe 1');
  assert.equal(formatTaskList.call({}, [1, 3]), 'Aufgaben 1 und 3');
  assert.equal(formatTaskList.call({}, [1, 3, 7]), 'Aufgaben 1, 3 und 7');
});

test('alte Kommentarvorlagen mit Aufgabenlabel bleiben ohne veralteten Platzhalter lesbar', () => {
  const template = 'Übe (<<Aufgabenlabel>> <<Aufgabenliste>>). Einzelnes: <<Aufgabenlabel>>.';
  const result = buildComment.call({
    formatExpectationHorizonTaskNumberList: formatTaskList,
    store: { getExpectationHorizonCommentTemplate: () => template },
  }, [1, 3]);

  assert.equal(result, 'Übe (Aufgaben 1 und 3). Einzelnes: .');
});

test('die eingebaute Standardvorlage und die Einstellungsbeschriftung verwenden nur Aufgabenliste', () => {
  assert.match(appSource, /\(<<Aufgabenliste>>\):/);
  assert.doesNotMatch(appSource.slice(0, 300), /<<Aufgabenlabel>>/);
  assert.match(appSource, /\/<<\\s\*Aufgabenlabel\\s\*>>\\s\*<<\\s\*Aufgabenliste\\s\*>>\/g/);
});
