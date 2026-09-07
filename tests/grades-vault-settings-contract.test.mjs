import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, appSource, helpCenterSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/help-center.js', import.meta.url), 'utf8'),
]);

function gradeMethod(name) {
  const start = appSource.search(new RegExp(`\\n  (?:async )?${name}\\(`)) + 1;
  assert.ok(start > 0, `${name} must exist`);
  const next = appSource.slice(start).search(/\n  (?:async )?\w+\(/);
  assert.ok(next > 0, `${name} must have a following method`);
  return Function('WORKSPACE_COMMAND_APPLY_SETTINGS', `return ({${appSource.slice(start, start + next)}}).${name};`)('apply-settings');
}

test('der Verschlüsselungs-Tab gruppiert Verschlüsselung, Sperre und Passwort klar', () => {
  assert.match(html, /id="grade-vault-encryption-title"[^>]*>\s*Verschlüsselung\s*</);
  assert.match(html, /<fieldset id="grade-vault-auto-lock-settings" class="grade-vault-settings-group">/);
  assert.match(html, /<legend class="grade-vault-settings-group-title">Automatische Sperre</);
  assert.match(html, /id="grade-vault-password-settings" class="grade-vault-settings-group"/);
  assert.match(html, /id="grade-vault-password-title" class="grade-vault-settings-group-title">Passwort</);
  assert.match(html, /id="grade-vault-encryption-enabled" type="checkbox" role="switch"/);
  assert.match(html, /id="grade-vault-auto-lock-on-background" type="checkbox" role="switch"/);
  assert.match(html, /id="grade-vault-auto-save-before-lock" type="checkbox" role="switch"/);
  assert.match(html, /id="grade-vault-settings-action-btn" type="button">Passwort ändern</);
  assert.doesNotMatch(html, /grade-vault-settings-(?:status|hint)/);
  assert.doesNotMatch(appSource, /gradeVaultSettings(?:Status|Hint)/);
});

test('autosave before locking requires a direct connection and explains which changes it saves', () => {
  const toggle = html.match(/<input id="grade-vault-auto-save-before-lock"[^>]*>/)?.[0];
  assert.ok(toggle);
  assert.doesNotMatch(toggle, /\bchecked\b/);
  assert.match(toggle, /aria-describedby="grade-vault-auto-save-before-lock-hint"/);
  assert.match(html, /Offene Eingabeentwürfe werden\s+nicht übernommen/);
  assert.match(appSource, /const autoSaveDisabled = autoLockSettingsDisabled \|\| unsupported \|\| !persistenceSyncState\.fileHandle;/);
  assert.match(appSource, /gradeVaultAutoSaveBeforeLock\.disabled = autoSaveDisabled/);
});

test('applying only the autosave toggle saves the setting and leaves grade input drafts untouched', async () => {
  const apply = gradeMethod('applyGradeVaultEncryptionSettingsDraft');
  const commands = [];
  let saved = 0;
  let persistedOption = false;
  const inputDraft = { title: 'Offener Entwurf' };
  const app = {
    gradeVaultEncryptionDraft: null,
    gradeVaultAutoLockMinutesDraft: null,
    gradeVaultAutoLockOnBackgroundDraft: null,
    gradeVaultAutoSaveBeforeLockDraft: true,
    gradesEntryDraft: inputDraft,
    gradesEntryDraftDirty: true,
    settingsDraftRevision: 4,
    isGradeVaultEncryptionEnabled: () => true,
    store: {
      getGradeVaultAutoLockMinutes: () => 30,
      getGradeVaultAutoLockOnBackground: () => false,
      getGradeVaultAutoSaveBeforeLock: () => persistedOption,
    },
    async executeWorkspaceCommand(command, payload, options) {
      commands.push({ command, payload, options });
      persistedOption = payload.settings.gradeVaultAutoSaveBeforeLock;
      return { ok: true, revision: 5 };
    },
    async persistExplicitDatabaseSave() { saved += 1; },
    buildSettingsDraftFromStore: () => ({ gradeVaultAutoSaveBeforeLock: persistedOption }),
    refreshSettingsDirtyState() {},
    renderGradeVaultSettings() {},
    saveCurrentGradesEntry() { assert.fail('open inputs must not be adopted'); },
  };
  assert.equal(await apply.call(app), true);
  assert.deepEqual(commands, [{
    command: 'apply-settings',
    payload: { settings: { gradeVaultAutoLockMinutes: 30, gradeVaultAutoLockOnBackground: false, gradeVaultAutoSaveBeforeLock: true } },
    options: { baseRevision: 4 },
  }]);
  assert.equal(saved, 1);
  assert.equal(app.gradeVaultAutoSaveBeforeLockDraft, null);
  assert.equal(app.settingsDraft.gradeVaultAutoSaveBeforeLock, true);
  assert.equal(app.gradesEntryDraft, inputDraft);
  assert.equal(app.gradesEntryDraftDirty, true);

  app.gradeVaultAutoSaveBeforeLockDraft = false;
  app.executeWorkspaceCommand = async () => ({ ok: false, message: 'Datenstand geändert' });
  app.showInfoMessage = async (message) => assert.equal(message, 'Datenstand geändert');
  assert.equal(await apply.call(app), false);
  assert.equal(app.gradeVaultAutoSaveBeforeLockDraft, false);
  assert.equal(persistedOption, true);
  assert.equal(saved, 1);
});

test('the autosave draft marks settings dirty and can be discarded without writing', () => {
  const isDirty = gradeMethod('isSettingsDraftDirty');
  const cancel = gradeMethod('cancelSettingsDraftChanges');
  const app = {
    settingsDraft: {},
    settingsDirty: true,
    gradeVaultEncryptionDraft: null,
    gradeVaultAutoLockMinutesDraft: null,
    gradeVaultAutoLockOnBackgroundDraft: null,
    gradeVaultAutoSaveBeforeLockDraft: true,
    activeSettingsTab: 'encryption',
    workspaceRevision: 3,
    store: { getGradeVaultAutoSaveBeforeLock: () => false },
    buildSettingsDraftFromStore: () => ({ gradeVaultAutoSaveBeforeLock: false }),
    switchSettingsTab(tab) { assert.equal(tab, 'encryption'); },
    updateSettingsActionButtons() {},
    dispatchGradesUnsavedState() {},
  };
  assert.equal(isDirty.call(app), true);
  cancel.call(app);
  assert.equal(app.gradeVaultAutoSaveBeforeLockDraft, null);
  assert.equal(app.settingsDraft.gradeVaultAutoSaveBeforeLock, false);
  assert.equal(app.settingsDirty, false);
  assert.equal(app.settingsDraftRevision, 3);
});

test('dokumentiert den begrenzten Verschlüsselungsumfang in Einstellungen und Hilfe', () => {
  const scopeHint = 'Die Verschlüsselung schützt Notendaten und zugehörige Daten im Notenmodul. Andere Inhalte der Datenbank werden nicht verschlüsselt.';
  assert.match(html, /Die Verschlüsselung schützt Notendaten und zugehörige Daten im\s+Notenmodul\. Andere Inhalte der Datenbank werden nicht verschlüsselt\./);
  assert.match(helpCenterSource, new RegExp(scopeHint));
  assert.match(css, /\.grade-vault-scope-hint\s*\{/);
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
