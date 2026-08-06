import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, appSource, shellHtml, shellSource, mainSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('das Entsperrformular ist semantisch sichtbar und wird nur per Modus-CSS umgeschaltet', () => {
  assert.match(
    html,
    /id="grade-vault-dialog"[^>]*data-grade-vault-mode="unlock"/,
  );
  assert.match(html, /<label id="grade-vault-dialog-current-row">/);
  assert.match(html, /<label id="grade-vault-dialog-confirm-row">/);
  assert.doesNotMatch(html, /id="grade-vault-dialog-(?:current|password|confirm)-row"[^>]*\shidden(?:\s|>)/);

  assert.match(
    css,
    /\.grade-vault-dialog\[data-grade-vault-mode="unlock"\] #grade-vault-dialog-password-row/,
  );
  assert.match(appSource, /gradeVaultDialog\.dataset\.gradeVaultMode = normalizedMode/);
  assert.doesNotMatch(appSource, /gradeVaultDialog(?:Current|Password|Confirm)Row\.hidden\s*=/);
});

test('der Entsperrmodus macht die Grades-Shell vor dem Öffnen des Dialogs technisch sichtbar', () => {
  const methodStart = appSource.indexOf('  openGradeVaultDialog(mode = "unlock")');
  const methodEnd = appSource.indexOf('\n  closeGradeVaultDialog()', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'openGradeVaultDialog must exist');
  const methodSource = appSource.slice(methodStart, methodEnd);
  const overlayIndex = methodSource.indexOf('this.notifyParentGradeVaultOverlay(true)');
  const dialogIndex = methodSource.indexOf('this.openDialog(this.refs.gradeVaultDialog)');

  assert.ok(overlayIndex >= 0, 'unlock must reveal the semantic grades overlay');
  assert.ok(dialogIndex > overlayIndex, 'the shell must be revealed before opening the dialog');
});

test('der Entsperrdialog wartet auf die Datenbank- und Backup-Ordner-Einrichtung', () => {
  const promptStart = appSource.indexOf('  promptGradeVaultUnlockForInitialCourse()');
  const promptEnd = appSource.indexOf('\n  getShellGradeVaultStatusMode()', promptStart);
  assert.ok(promptStart >= 0 && promptEnd > promptStart, 'promptGradeVaultUnlockForInitialCourse must exist');
  const promptSource = appSource.slice(promptStart, promptEnd);
  const startupGuard = promptSource.indexOf('this.lockReason === "backupDirRequired"');
  const resolvedMarker = promptSource.indexOf('this.gradeVaultStartupUnlockPromptResolved = true');

  assert.ok(startupGuard >= 0, 'the automatic unlock prompt must wait for the backup folder');
  assert.ok(startupGuard < resolvedMarker, 'the deferred prompt must remain available after setup');

  const dialogStart = appSource.indexOf('  openGradeVaultDialog(mode = "unlock")');
  const dialogEnd = appSource.indexOf('\n  closeGradeVaultDialog()', dialogStart);
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, 'openGradeVaultDialog must exist');
  const dialogSource = appSource.slice(dialogStart, dialogEnd);
  const backupGuard = dialogSource.indexOf('this.lockReason === "backupDirRequired"');
  const dialogOpen = dialogSource.indexOf('this.openDialog(this.refs.gradeVaultDialog)');

  assert.ok(backupGuard >= 0, 'manual unlock actions must also wait for the backup folder');
  assert.ok(backupGuard < dialogOpen, 'the backup guard must run before opening the dialog');
});

test('das Einrichten der Verschlüsselung speichert die Datenbank direkt danach', () => {
  const methodStart = appSource.indexOf('  async submitGradeVaultDialog()');
  const methodEnd = appSource.indexOf('\n  async saveGradeVaultChanges()', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'submitGradeVaultDialog must exist');
  const methodSource = appSource.slice(methodStart, methodEnd);

  assert.match(methodSource, /mode === "setup"/);
  assert.match(methodSource, /await this\.saveGradeVaultChanges\(\)/);
});

test('ein manueller Sperrversuch mit ungespeicherten Noten wird abgefangen und erklärt', () => {
  const listenerStart = appSource.indexOf('window.addEventListener("classroom:grades-grade-vault-request"');
  const listenerEnd = appSource.indexOf('window.addEventListener("classroom:grades-course-seatplan-save-request"', listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart, 'grade-vault request listener must exist');
  const listenerSource = appSource.slice(listenerStart, listenerEnd);

  assert.match(listenerSource, /await this\.lockGradeVaultSession\(\)/);
  assert.match(listenerSource, /catch \(error\)/);
  assert.match(listenerSource, /WORKSPACE_ERROR_VAULT_DIRTY/);
  assert.match(listenerSource, /resolveDirtyGradeVaultLock\(\)/);
  assert.match(listenerSource, /notifyParentGradeVaultOverlay\(false\)/);
  assert.doesNotMatch(listenerSource, /void this\.lockGradeVaultSession\(\)\.finally/);

  const resolutionStart = appSource.indexOf('  async resolveDirtyGradeVaultLock()');
  const resolutionEnd = appSource.indexOf('\n  ensureGradeVaultReadyForGradesEntryMutation', resolutionStart);
  assert.ok(resolutionStart >= 0 && resolutionEnd > resolutionStart, 'dirty vault lock resolution must exist');
  const resolutionSource = appSource.slice(resolutionStart, resolutionEnd);
  assert.match(resolutionSource, /okText: "Speichern & sperren"/);
  assert.match(resolutionSource, /cancelText: "Abbrechen"/);
  assert.match(resolutionSource, /alternateText: "Verwerfen & sperren"/);
  assert.match(resolutionSource, /dangerAlternate: true/);
  assert.match(resolutionSource, /saveGradeVaultChanges\(\)/);
  assert.match(resolutionSource, /discardGradeVaultChanges\(\)/);
  assert.match(resolutionSource, /lockGradeVaultSession\(\)/);
});

test('Sitzplan, Gruppen und Picker verwenden keinen hidden-Vorfahren für das Vault-Formular', () => {
  assert.match(shellHtml, /<section id="grades-shell" class="grades-shell" aria-label="Noten">/);
  assert.doesNotMatch(shellHtml, /id="grades-shell"[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(shellSource, /gradesShell\.hidden\s*=/);
  assert.doesNotMatch(mainSource, /gradesShell(?:\?\.)?\.hidden\s*=/);
  assert.match(mainSource, /gradeVaultOverlayRevealedGradesShell = isOpen && !gradesTabIsActive/);

  const overlayStart = appSource.indexOf('  notifyParentGradeVaultOverlay(open)');
  const overlayEnd = appSource.indexOf('\n  notifyParentTutorialStartRequest()', overlayStart);
  const overlaySource = appSource.slice(overlayStart, overlayEnd);
  assert.match(overlaySource, /window\.parent\.dispatchEvent\(new window\.parent\.CustomEvent/);
});
