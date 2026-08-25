import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('der Verschlüsselungs-Tab gruppiert Verschlüsselung, Sperre und Passwort klar', () => {
  assert.match(html, /id="grade-vault-encryption-title"[^>]*>\s*Verschlüsselung\s*</);
  assert.match(html, /<fieldset id="grade-vault-auto-lock-settings" class="grade-vault-settings-group">/);
  assert.match(html, /<legend class="grade-vault-settings-group-title">Automatische Sperre</);
  assert.match(html, /id="grade-vault-password-settings" class="grade-vault-settings-group"/);
  assert.match(html, /id="grade-vault-password-title" class="grade-vault-settings-group-title">Passwort</);
  assert.match(html, /id="grade-vault-encryption-enabled" type="checkbox" role="switch"/);
  assert.match(html, /id="grade-vault-auto-lock-on-background" type="checkbox" role="switch"/);
  assert.match(html, /id="grade-vault-settings-action-btn" type="button">Passwort ändern</);
  assert.doesNotMatch(html, /grade-vault-settings-(?:status|hint)/);
  assert.doesNotMatch(appSource, /gradeVaultSettings(?:Status|Hint)/);
});

test('abhängige Vault-Einstellungen folgen dem ungespeicherten Verschlüsselungsentwurf', () => {
  assert.match(appSource, /const effectiveEncryptionEnabled = Boolean\(this\.gradeVaultEncryptionDraft \?\? encryptionEnabled\);/);
  assert.match(appSource, /gradeVaultAutoLockSettings\.disabled = autoLockSettingsDisabled/);
  assert.match(appSource, /gradeVaultAutoLockSettings\.classList\.toggle\("is-disabled", autoLockSettingsDisabled\)/);
  assert.match(appSource, /const passwordSettingsDisabled = !effectiveEncryptionEnabled \|\| mode === "off" \|\| !databaseConnected;/);
  assert.match(appSource, /gradeVaultPasswordSettings\?\.classList\.toggle\("is-disabled", passwordSettingsDisabled\)/);
  assert.match(appSource, /gradeVaultEncryptionDraft = enabled;[\s\S]*?renderGradeVaultSettings\(\);/);
  assert.doesNotMatch(appSource, /gradeVaultAutoLockSettings\.hidden\s*=/);
});

test('das Deaktivieren wird nach einer nötigen Entsperrung bestätigt und kann abgebrochen werden', () => {
  const methodStart = appSource.indexOf('  async setGradeVaultEncryptionEnabledFromSettings(enabled, { persist = true } = {})');
  const methodEnd = appSource.indexOf('\n  async applyGradeVaultEncryptionSettingsDraft()', methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, 'setGradeVaultEncryptionEnabledFromSettings must exist');
  const methodSource = appSource.slice(methodStart, methodEnd);

  const unlockIndex = methodSource.indexOf('this.openGradeVaultDialog("unlock")');
  const confirmIndex = methodSource.indexOf('await this.showConfirmMessage(');
  assert.ok(unlockIndex >= 0 && confirmIndex > unlockIndex, 'die Bestätigung folgt erst nach der Entsperrprüfung');
  assert.match(methodSource, /Die Verschlüsselung wird aufgehoben\. Notendaten werden künftig unverschlüsselt gespeichert\./);
  assert.match(methodSource, /title: "Verschlüsselung deaktivieren"/);
  assert.match(methodSource, /okText: "Verschlüsselung deaktivieren"/);
  assert.match(methodSource, /dangerOk: true/);
  assert.match(methodSource, /if \(!confirmed\) \{[\s\S]*?gradeVaultEncryptionDraft = null;[\s\S]*?renderGradeVaultSettings\(\);/);

  const closeStart = appSource.indexOf('  closeGradeVaultDialog()');
  const closeEnd = appSource.indexOf('\n  clearGradeVaultDialogSecrets()', closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart, 'closeGradeVaultDialog must exist');
  const closeSource = appSource.slice(closeStart, closeEnd);
  assert.match(closeSource, /const cancelledGradeVaultEncryptionDisable = this\.pendingGradeVaultEncryptionDisable;/);
  assert.match(closeSource, /if \(cancelledGradeVaultEncryptionDisable\) \{[\s\S]*?gradeVaultEncryptionDraft = null;/);

  const resumeStart = appSource.indexOf('  resumeAfterGradeVaultUnlock(options = {})');
  const resumeEnd = appSource.indexOf('\n  prepareGradesOverviewAutoScrollAfterVaultUnlock()', resumeStart);
  assert.ok(resumeStart >= 0 && resumeEnd > resumeStart, 'resumeAfterGradeVaultUnlock must exist');
  const resumeSource = appSource.slice(resumeStart, resumeEnd);
  assert.match(resumeSource, /pendingGradeVaultEncryptionDisable[\s\S]*?applyGradeVaultEncryptionSettingsDraft\(\)/);
});

test('die Vault-Gruppen nutzen klare Abstände ohne Trennlinie und einen sichtbaren Disabled-Zustand', () => {
  assert.match(css, /\.grade-vault-settings-layout\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /\.grade-vault-settings-group \+ \.grade-vault-settings-group\s*\{[^}]*padding-top:\s*0\.95rem/);
  assert.doesNotMatch(css, /\.grade-vault-settings-group \+ \.grade-vault-settings-group\s*\{[^}]*border-top:/);
  assert.match(css, /\.grade-vault-settings-group-title\s*\{[\s\S]*?font-size:\s*var\(--settings-font-heading\)/);
  assert.match(css, /\.grade-vault-settings-group\.is-disabled\s*\{[\s\S]*?opacity:\s*0\.5/);
});
