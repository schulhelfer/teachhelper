import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);
const appHtml = await readFile(
  new URL('../src/modules/grades/app.html', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`, 'g');
  const match = matcher.exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const signatureEnd = appSource.indexOf(') {', start);
  assert.ok(signatureEnd > start, `method ${name} must have a body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

function loadMethod(name) {
  return Function(`"use strict"; return ({${extractClassMethod(name)}});`)()[name];
}

test('BE-Eingabe bietet Sidebar-Button und Info-Dialog für Nachbereitungen', () => {
  assert.match(appHtml, /<div id="sidebar-grade-deficit-followup-section"[\s\S]*?<button id="sidebar-grade-deficit-followup-btn"/);
  assert.match(appHtml, /<dialog id="grade-deficit-followup-dialog"[\s\S]*?id="grade-deficit-followup-dialog-close"[\s\S]*?id="grade-deficit-followup-list"/);
  assert.match(
    extractClassMethod('updateSidebarGradeDeficitFollowUpButtonState'),
    /section\.hidden = !isGradesEntry \|\| !isTestMode;/,
  );
});

test('nur explizites Speichern der BE-Eingabe zeigt anschließend die Nachbereitungen', () => {
  const save = extractClassMethod('saveCurrentGradesEntry');
  assert.match(save, /const showDeficitFollowUps = options\.showDeficitFollowUps === true;/);
  assert.equal(
    save.match(/if \(showDeficitFollowUps\) \{\s*this\.showGradeDeficitFollowUpsAfterSave\(savedCourseId, assessment\.id\);\s*\}/g)?.length,
    2,
  );
  assert.ok(
    save.indexOf('this.showGradeDeficitFollowUpsAfterSave(') > save.indexOf('this.notifyParentToast("Noten gespeichert");'),
    'der Dialog darf erst nach erfolgreichem Speichern erscheinen',
  );
  assert.match(appSource, /button\[data-grades-entry-save\]"\);\s*if \(saveEntryButton\) \{\s*event\.stopPropagation\(\);\s*await this\.saveCurrentGradesEntry\(\{ showDeficitFollowUps: true \}\);/);
  assert.match(extractClassMethod('resolveUnsavedGradesEntryNavigation'), /return this\.saveCurrentGradesEntry\(\);/);
  assert.match(extractClassMethod('prepareEmptyDatabaseRestart'), /!await this\.saveCurrentGradesEntry\(\)\)/);
});

test('Entsperren vor dem Speichern behält den Nachbereitungswunsch bei', () => {
  const app = {
    pendingGradeVaultContinuation: null,
    canAccessGradeVault: () => false,
    isGradeVaultConfigured: () => true,
    openGradeVaultDialog() {},
    isGradeVaultUnlocked: () => true,
    saveOptions: [],
    saveCurrentGradesEntry(options) { this.saveOptions.push(options); },
    queueGradeVaultContinuation: loadMethod('queueGradeVaultContinuation'),
    ensureGradeVaultReadyForGradesEntryMutation: loadMethod('ensureGradeVaultReadyForGradesEntryMutation'),
    runPendingGradeVaultContinuation: loadMethod('runPendingGradeVaultContinuation'),
  };

  assert.equal(app.ensureGradeVaultReadyForGradesEntryMutation({ queueSave: true, showDeficitFollowUps: true }), false);
  assert.deepEqual(app.pendingGradeVaultContinuation, { type: 'grades-entry-save', showDeficitFollowUps: true });
  assert.equal(app.runPendingGradeVaultContinuation(), true);

  app.ensureGradeVaultReadyForGradesEntryMutation({ queueSave: true });
  assert.equal(app.runPendingGradeVaultContinuation(), true);

  assert.deepEqual(app.saveOptions, [{ showDeficitFollowUps: true }, { showDeficitFollowUps: false }]);
});
