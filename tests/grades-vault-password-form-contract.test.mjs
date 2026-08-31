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

test('die drei Passwortabläufe haben feste, getrennte Browserformulare', () => {
  assert.match(
    html,
    /id="grade-vault-dialog"[^>]*data-grade-vault-mode="unlock"/,
  );
  assert.match(html, /<form id="grade-vault-unlock-form"[^>]*action="\.\/app\.html"/);
  assert.match(html, /<form id="grade-vault-setup-form"[^>]*action="\.\/app\.html"/);
  assert.match(html, /<form id="grade-vault-change-form"[^>]*action="\.\/app\.html"/);
  assert.match(html, /id="grade-vault-unlock-password"[^>]*autocomplete="current-password"/);
  assert.match(html, /id="grade-vault-setup-password"[^>]*autocomplete="new-password"/);
  assert.match(html, /id="grade-vault-change-current-password"[^>]*autocomplete="current-password"/);
  assert.match(html, /id="grade-vault-change-password"[^>]*autocomplete="new-password"/);
  assert.match(html, /<form id="grade-vault-unlock-form"[\s\S]*?<button type="submit" class="dialog-icon-button grade-vault-dialog-submit"/);
  assert.match(html, /<form id="grade-vault-setup-form"[\s\S]*?<button type="submit" class="dialog-icon-button grade-vault-dialog-submit"/);
  assert.match(html, /<form id="grade-vault-change-form"[\s\S]*?<button type="submit" class="dialog-icon-button grade-vault-dialog-submit"/);
  assert.match(html, /data-grade-vault-autofill-username/);

  assert.match(
    css,
    /\.grade-vault-dialog\[data-grade-vault-mode="unlock"\] #grade-vault-unlock-form/,
  );
  assert.match(css, /\.grade-vault-dialog\[data-grade-vault-mode="setup"\] #grade-vault-setup-form/);
  assert.match(css, /\.grade-vault-dialog\[data-grade-vault-mode="change"\] #grade-vault-change-form/);
  assert.match(css, /\.grade-vault-dialog-content\s*\{[\s\S]*?padding:\s*0\.9rem/);
  assert.match(css, /\.grade-vault-dialog \.grade-vault-dialog-form\s*\{[\s\S]*?padding:\s*0/);
  assert.match(appSource, /gradeVaultDialog\.dataset\.gradeVaultMode = normalizedMode/);
  const vaultStart = appSource.indexOf('  openGradeVaultDialog(mode = "unlock")');
  const vaultEnd = appSource.indexOf('\n  closeGradeVaultDialog()', vaultStart);
  assert.ok(vaultStart >= 0 && vaultEnd > vaultStart, 'der Vault-Dialog-Code muss vorhanden sein');
  const vaultDialogSource = appSource.slice(vaultStart, vaultEnd);
  assert.doesNotMatch(vaultDialogSource, /rebuildGradeVaultDialogInput|\.cloneNode\(false\)/);
});

test('neue Vault-Passwörter müssen mindestens zwölf Zeichen haben', async () => {
  const runtimeSource = await readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8');

  assert.match(appSource, /const GRADE_VAULT_PASSWORD_MIN_LENGTH = 12;/);
  assert.match(html, /id="grade-vault-unlock-password"[^>]*minlength="10"/);
  assert.match(html, /id="grade-vault-setup-password"[^>]*minlength="12"/);
  assert.match(html, /id="grade-vault-setup-confirm-password"[^>]*minlength="12"/);
  assert.match(html, /id="grade-vault-change-password"[^>]*minlength="12"/);
  assert.match(html, /id="grade-vault-change-confirm-password"[^>]*minlength="12"/);
  assert.match(runtimeSource, /String\(password \|\| ''\)\.length < 12/);
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

const vaultSource = (fromMarker, toMarker) => {
  const start = appSource.indexOf(fromMarker);
  const end = appSource.indexOf(toMarker, start);
  assert.ok(start >= 0 && end > start, `${fromMarker} .. ${toMarker} must exist`);
  return appSource.slice(start, end);
};

test('der sichtbare Dialog verwendet die festen Formulare ohne Passwortfeld-Mutationen', () => {
  const openSource = vaultSource(
    '  openGradeVaultDialog(mode = "unlock")',
    '  getGradeVaultDialogForm(mode)',
  );
  const dialogIndex = openSource.indexOf('this.openDialog(this.refs.gradeVaultDialog)');
  const focusIndex = openSource.indexOf('this.focusGradeVaultDialogFieldWhenVisible(normalizedMode)');

  assert.match(openSource, /Object\.entries\(this\.refs\.gradeVaultDialogForms \|\| \{\}\)\.forEach/);
  assert.match(openSource, /formMode === normalizedMode \? GRADE_VAULT_UNLOCKED_ICON : ""/);
  assert.ok(dialogIndex >= 0 && focusIndex > dialogIndex, 'der Fokus folgt auf das Öffnen');
  assert.doesNotMatch(openSource, /cloneNode|replaceChild|\.remove\(\)/);
});

test('die technische Kennung wird einmalig in feste Formularfelder gesetzt', () => {
  const identitySource = vaultSource(
    '  syncGradeVaultDialogAutofillIdentity()',
    '  focusGradeVaultDialogFieldWhenVisible(mode, attempt = 0)',
  );

  assert.match(identitySource, /getGradeVaultAutofillMetadata\(\)\.identity/);
  assert.match(identitySource, /gradeVaultDialogUsernameInputs\?\.forEach/);
  assert.match(identitySource, /input\.value = identity/);
  assert.doesNotMatch(identitySource, /store\.set|localStorage|indexedDB|this\.store/);
});

test('der Fokus wartet auf den sichtbaren Dialog, ohne Formularfelder zu verändern', () => {
  const focusSource = vaultSource(
    '  focusGradeVaultDialogFieldWhenVisible(mode, attempt = 0)',
    '\n  closeGradeVaultDialog()',
  );

  assert.match(focusSource, /isElementRendered\(dialog\)/);
  assert.match(focusSource, /attempt < GRADE_VAULT_DIALOG_FOCUS_MAX_FRAMES/);
  assert.match(focusSource, /document\.activeElement === focusTarget/);
  assert.doesNotMatch(focusSource, /cloneNode|replaceChild|\.remove\(/);
});

test('ein erfolgreicher Vault-Vorgang meldet die Zugangsdaten explizit an den Browser', () => {
  const submitSource = vaultSource(
    '  async submitGradeVaultDialog()',
    '\n  async saveGradeVaultChanges()',
  );
  const storeIndex = submitSource.indexOf('await this.storeGradeVaultCredential(');
  const closeIndex = submitSource.indexOf('this.closeDialog(this.refs.gradeVaultDialog)');

  assert.ok(storeIndex >= 0, 'der Erfolgspfad meldet die Zugangsdaten');
  assert.ok(closeIndex > storeIndex, 'die Meldung erfolgt, solange der Dialog noch offen ist');
  assert.match(submitSource, /storeGradeVaultCredential\(mode, mode === "unlock" \? currentPassword : password\)/);

  const storeSource = vaultSource(
    '  async storeGradeVaultCredential(mode, password)',
    '\n  hasUnsavedGradeVaultRuntimeChanges()',
  );

  assert.match(storeSource, /const form = this\.getGradeVaultDialogForm\(mode\)/);
  assert.match(storeSource, /new CredentialCtor\(form\)/);
  assert.match(storeSource, /let credentialId = getGradeVaultAutofillMetadata\(\)\.identity/);
  assert.match(storeSource, /name: "Noten-Datenbank"/);
  assert.match(storeSource, /typeof CredentialCtor !== "function"/);
  assert.match(storeSource, /typeof window\.navigator\?\.credentials\?\.store !== "function"/);
  assert.match(storeSource, /catch \(_error\) \{\s*return false;/);
});

test('das Leeren der Passwortfelder rahmt Erfolg und Abbruch bewusst unterschiedlich ein', () => {
  const closeSource = vaultSource(
    '  closeGradeVaultDialog()',
    '\n  clearGradeVaultDialogSecrets()',
  );
  const clearOnCancel = closeSource.indexOf('this.clearGradeVaultDialogSecrets()');
  const closeOnCancel = closeSource.indexOf('this.closeDialog(this.refs.gradeVaultDialog)');
  assert.ok(clearOnCancel >= 0 && closeOnCancel > clearOnCancel, 'Abbruch leert vor dem Schließen');

  const submitSource = vaultSource(
    '  async submitGradeVaultDialog()',
    '\n  async saveGradeVaultChanges()',
  );
  const closeOnSuccess = submitSource.indexOf('this.closeDialog(this.refs.gradeVaultDialog)');
  const clearOnSuccess = submitSource.indexOf('this.scheduleGradeVaultDialogSecretClear()');
  assert.ok(closeOnSuccess >= 0 && clearOnSuccess > closeOnSuccess, 'Erfolg leert nach dem Schließen');
  assert.doesNotMatch(submitSource, /this\.clearGradeVaultDialogSecrets\(\)/);

  const scheduleSource = vaultSource(
    '  scheduleGradeVaultDialogSecretClear()',
    '\n  discardRejectedGradeVaultPassword(mode)',
  );
  assert.match(scheduleSource, /if \(this\.refs\.gradeVaultDialog\?\.open\)/);
  assert.match(scheduleSource, /requestAnimationFrame\(run\)/);
});

test('ein vom Vault abgelehntes Passwort bleibt nicht im Feld stehen', () => {
  const submitSource = vaultSource(
    '  async submitGradeVaultDialog()',
    '\n  async saveGradeVaultChanges()',
  );
  assert.match(submitSource, /this\.discardRejectedGradeVaultPassword\(mode\);\s*throw error;/);

  const commandIndex = submitSource.indexOf('await this.executeWorkspaceCommand("owner-action"');
  const lengthCheckIndex = submitSource.indexOf('GRADE_VAULT_PASSWORD_MIN_LENGTH} Zeichen lang sein.');
  assert.ok(lengthCheckIndex >= 0 && lengthCheckIndex < commandIndex);

  const discardSource = vaultSource(
    '  discardRejectedGradeVaultPassword(mode)',
    '\n  async storeGradeVaultCredential(mode, password)',
  );
  assert.match(discardSource, /if \(mode === "setup"\)/);
  assert.match(discardSource, /this\.getGradeVaultDialogFields\(mode\)\.currentPassword/);
  assert.match(discardSource, /focusGradeVaultDialogField\(field\)/);
  assert.doesNotMatch(discardSource, /gradeVaultDialog(?:Setup|Change|Unlock)Password/);
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
