import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
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

const { navigateToGradesOverviewCourse } = Function(
  `"use strict"; return ({${extractClassMethod('navigateToGradesOverviewCourse')}});`,
)();
const { openGradesOverviewForCourse } = Function(
  `"use strict"; return ({${extractClassMethod('openGradesOverviewForCourse')}});`,
)();
const { requestGradesEntryView } = Function(
  `"use strict"; return ({${extractClassMethod('requestGradesEntryView')}});`,
)();
const { promptGradeVaultUnlockForInitialCourse } = Function(
  `"use strict"; return ({${extractClassMethod('promptGradeVaultUnlockForInitialCourse')}});`,
)();
const { setGradeVaultEncryptionEnabledFromSettings } = Function(
  `"use strict"; return ({${extractClassMethod('setGradeVaultEncryptionEnabledFromSettings')}});`,
)();
const { resumeAfterGradeVaultUnlock } = Function(
  `"use strict"; return ({${extractClassMethod('resumeAfterGradeVaultUnlock')}});`,
)();
const { applyGradeVaultEncryptionSettingsDraft } = Function(
  `"use strict"; return ({${extractClassMethod('applyGradeVaultEncryptionSettingsDraft')}});`,
)();
const { captureGradeVaultAutoLockNotice } = Function(
  `"use strict"; return ({${extractClassMethod('captureGradeVaultAutoLockNotice')}});`,
)();
const { presentGradeVaultAutoLockNotice } = Function(
  `"use strict"; return ({${extractClassMethod('presentGradeVaultAutoLockNotice')}});`,
)();
const { requestGradeVaultUnlockFromForegroundMenu } = Function(
  `"use strict"; return ({${extractClassMethod('requestGradeVaultUnlockFromForegroundMenu')}});`,
)();

test('öffnet beim Start mit gewähltem Notenkurs einmalig den Entsperrdialog', () => {
  let dialogMode = '';
  let queuedAction = null;
  const app = {
    gradeVaultStartupUnlockPromptResolved: false,
    tutorialDemoMode: '',
    activeSchoolYear: { id: 7 },
    selectedCourseId: 42,
    store: {
      listCourses(yearId) {
        assert.equal(yearId, 7);
        return [{ id: 42, noLesson: false, noGrades: false }];
      },
    },
    normalizeGradesSubView() { return 'overview'; },
    queueGradeVaultContinuation(action) { queuedAction = action; },
    courseAllowsGrades(course) {
      return !course.noLesson && !course.noGrades;
    },
    getGradeVaultStatusMode() { return 'unlock'; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
  };

  assert.equal(promptGradeVaultUnlockForInitialCourse.call(app), true);
  assert.equal(dialogMode, 'unlock');
  assert.deepEqual(queuedAction, {
    type: 'grades-navigation',
    detail: { courseId: 42, subview: 'overview' },
  });
  assert.equal(app.gradeVaultStartupUnlockPromptResolved, true);
  assert.equal(promptGradeVaultUnlockForInitialCourse.call(app), false);
});

test('wartet beim Start ohne gewählten Notenkurs und fragt nicht bei einem entsperrten Vault', () => {
  const app = {
    gradeVaultStartupUnlockPromptResolved: false,
    tutorialDemoMode: '',
    activeSchoolYear: { id: 7 },
    selectedCourseId: null,
    store: { listCourses() { return [{ id: 42, noLesson: false, noGrades: false }]; } },
    courseAllowsGrades() { return true; },
    getGradeVaultStatusMode() { return 'unlock'; },
    openGradeVaultDialog() { assert.fail('no course must not trigger an unlock dialog'); },
  };
  assert.equal(promptGradeVaultUnlockForInitialCourse.call(app), false);
  assert.equal(app.gradeVaultStartupUnlockPromptResolved, false);

  app.selectedCourseId = 42;
  app.getGradeVaultStatusMode = () => 'ready';
  assert.equal(promptGradeVaultUnlockForInitialCourse.call(app), false);
  assert.equal(app.gradeVaultStartupUnlockPromptResolved, true);
});

test('fordert beim Ausschalten einer gesperrten Verschlüsselung zuerst das Passwort an', async () => {
  let dialogMode = '';
  let renderCount = 0;
  const app = {
    pendingGradeVaultEncryptionDisable: false,
    getWorkspaceOwnerApp() {
      return {
        async setGradeVaultEncryptionEnabledFromSettings() {
          assert.fail('die Verschlüsselung darf vor dem Entsperren nicht deaktiviert werden');
        },
      };
    },
    isGradeVaultEncryptionEnabled() { return true; },
    canAccessGradeVault() { return false; },
    hasGradeVaultUnlockConfig() { return true; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
    renderGradeVaultSettings() { renderCount += 1; },
  };
  const result = await setGradeVaultEncryptionEnabledFromSettings.call(app, false);

  assert.equal(result, false);
  assert.equal(dialogMode, 'unlock');
  assert.equal(renderCount, 1);
  assert.equal(app.pendingGradeVaultEncryptionDisable, true);
});

test('deaktiviert die Verschlüsselung nach erfolgreichem Entsperren dauerhaft', () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const calls = [];
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    const app = {
      pendingGradeVaultEncryptionDisable: true,
      applyGradeVaultEncryptionSettingsDraft() { calls.push('apply-draft'); },
    };

    resumeAfterGradeVaultUnlock.call(app, { focusDefault: false });

    assert.equal(app.pendingGradeVaultEncryptionDisable, false);
    assert.deepEqual(calls, ['apply-draft']);
  } finally {
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
  }
});

test('übernimmt die Verschlüsselungsänderung erst beim Speichern der Einstellungen', async () => {
  let requestedMode = null;
  const app = {
    gradeVaultEncryptionDraft: false,
    isGradeVaultEncryptionEnabled() { return true; },
    async setGradeVaultEncryptionEnabledFromSettings(enabled) {
      requestedMode = enabled;
      return true;
    },
  };

  assert.equal(await applyGradeVaultEncryptionSettingsDraft.call(app), true);
  assert.equal(requestedMode, false);
});

test('nutzt nach Bestätigung des Auto-Lock-Hinweises den Entsperrpfad des Vordergrund-Menüs', async () => {
  const foregroundRequests = [];
  const noticeCalls = [];
  const app = {
    gradeVaultAutoLockNoticeHandledId: '',
    gradeVaultAutoLockNoticePending: null,
    isGradesTopTabActive() { return true; },
    getGradeVaultStatusMode() { return 'unlock'; },
    async showConfirmMessage(...args) {
      noticeCalls.push(args);
      args[1].onConfirm();
      return true;
    },
    requestGradeVaultUnlockFromForegroundMenu(...args) { foregroundRequests.push(args); },
  };

  assert.equal(captureGradeVaultAutoLockNotice.call(app, { id: 'auto-lock-1' }), true);
  assert.equal(await presentGradeVaultAutoLockNotice.call(app), true);
  assert.equal(noticeCalls[0][0], 'Der Notenbereich wurde aus Sicherheitsgründen automatisch gesperrt.');
  assert.equal(noticeCalls[0][1].title, 'Notenbereich automatisch gesperrt');
  assert.equal(noticeCalls[0][1].okText, 'Jetzt entsperren');
  assert.equal(noticeCalls[0][1].cancelText, 'Später');
  assert.equal(typeof noticeCalls[0][1].onConfirm, 'function');
  assert.deepEqual(foregroundRequests, [[]]);
  assert.equal(await presentGradeVaultAutoLockNotice.call(app), false);
  assert.equal(captureGradeVaultAutoLockNotice.call(app, { id: 'auto-lock-1' }), false);
});

test('leitet den Auto-Lock-Entsperrwunsch an dieselbe Shell-Anforderung wie der Menübutton weiter', () => {
  const previousWindow = globalThis.window;
  const requests = [];
  globalThis.window = {
    location: { origin: 'https://teachhelper.test' },
    parent: {
      postMessage(message, origin) {
        requests.push({ message, origin });
      },
    },
  };
  try {
    assert.equal(requestGradeVaultUnlockFromForegroundMenu.call({}), true);
    assert.deepEqual(requests, [{
      message: {
        type: 'classroom:grades-grade-vault-request',
        detail: { action: 'unlock', overlay: false, preserveSourceTab: false },
      },
      origin: 'https://teachhelper.test',
    }]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('„Später“ zeigt denselben Auto-Lock-Hinweis nicht erneut', async () => {
  let notices = 0;
  const app = {
    gradeVaultAutoLockNoticeHandledId: '',
    gradeVaultAutoLockNoticePending: null,
    isGradesTopTabActive() { return true; },
    getGradeVaultStatusMode() { return 'unlock'; },
    async showConfirmMessage() { notices += 1; return false; },
    openGradeVaultDialog() { assert.fail('unlock must require confirmation'); },
  };

  captureGradeVaultAutoLockNotice.call(app, { id: 'auto-lock-2' });
  assert.equal(await presentGradeVaultAutoLockNotice.call(app), true);
  assert.equal(await presentGradeVaultAutoLockNotice.call(app), false);
  assert.equal(captureGradeVaultAutoLockNotice.call(app, { id: 'auto-lock-2' }), false);
  assert.equal(notices, 1);
});

test('speichert die Datenbank beim dauerhaften Aufheben der Verschlüsselung sofort', async () => {
  let saved = 0;
  const app = {
    gradeVaultEncryptionDraft: false,
    settingsDirty: true,
    getWorkspaceOwnerApp() {
      return {
        async setGradeVaultEncryptionEnabledFromSettings(enabled) {
          assert.equal(enabled, false);
          return true;
        },
      };
    },
    isGradeVaultEncryptionEnabled() { return true; },
    canAccessGradeVault() { return true; },
    async showConfirmMessage() { return true; },
    async saveGradeVaultChanges() { saved += 1; return true; },
    async showInfoMessage() { assert.fail('der erfolgreiche Speichervorgang darf keine Warnung zeigen'); },
    renderGradeVaultSettings() {},
    updateSettingsActionButtons() {},
  };

  assert.equal(await setGradeVaultEncryptionEnabledFromSettings.call(app, false), true);
  assert.equal(saved, 1);
  assert.equal(app.gradeVaultEncryptionDraft, null);
});

test('öffnet beim Sidebar-Kurswechsel den Entsperrdialog vor dem Laden des Notenkurses', async () => {
  let queuedAction = null;
  let dialogMode = '';
  const result = await navigateToGradesOverviewCourse.call({
    canAccessGradeVault() { return false; },
    queueGradeVaultContinuation(action) { queuedAction = action; },
    isGradeVaultConfigured() { return true; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
    async resolveUnsavedGradesEntryNavigation() {
      assert.fail('a locked vault must prompt before resolving or loading navigation');
    },
    beginGradeCourseNavigationLoad() {
      assert.fail('a locked vault must not start a course load');
    },
  }, 42, {
    assessmentId: 7,
    lessonId: 13,
    lessonDate: '2026-07-31',
  });

  assert.equal(result, false);
  assert.equal(dialogMode, 'unlock');
  assert.deepEqual(queuedAction, {
    type: 'grades-navigation',
    detail: {
      courseId: 42,
      assessmentId: 7,
      lessonId: 13,
      lessonDate: '2026-07-31',
      subview: 'overview',
    },
  });
});

test('schützt auch direkte Aufrufe der Kursansicht mit dem Entsperrdialog', () => {
  let queuedAction = null;
  let dialogMode = '';
  const result = openGradesOverviewForCourse.call({
    canAccessGradeVault() { return false; },
    queueGradeVaultContinuation(action) { queuedAction = action; },
    isGradeVaultConfigured() { return true; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
  }, 42, {
    assessmentId: 7,
    lessonId: 13,
    lessonDate: '2026-07-31',
  });

  assert.equal(result, false);
  assert.equal(dialogMode, 'unlock');
  assert.deepEqual(queuedAction, {
    type: 'grades-navigation',
    detail: {
      courseId: 42,
      assessmentId: 7,
      lessonId: 13,
      lessonDate: '2026-07-31',
      subview: 'overview',
    },
  });
});

test('Sidebar-Kurse verwenden ausschließlich die geschützte Noten-Navigation', () => {
  const handlerStart = appSource.indexOf('this.refs.sidebarCourseList?.addEventListener("click"');
  const handlerEnd = appSource.indexOf('this.refs.sidebarCourseList?.addEventListener("contextmenu"', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'sidebar course click handler must exist');
  const handlerSource = appSource.slice(handlerStart, handlerEnd);

  assert.match(handlerSource, /await this\.navigateToGradesOverviewCourse\(courseId\)/);
  assert.doesNotMatch(handlerSource, /isGradesTopTabActive|switchView\("course"\)/);
});

test('Abbruch einer gesperrten Kursnavigation lässt keine leere Notenansicht zurück', () => {
  const closeStart = appSource.indexOf('  closeGradeVaultDialog()');
  const closeEnd = appSource.indexOf('\n  clearGradeVaultDialogSecrets()', closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart, 'closeGradeVaultDialog must exist');
  const closeSource = appSource.slice(closeStart, closeEnd);

  assert.match(closeSource, /continuation\?\.type === "grades-navigation"/);
  assert.match(closeSource, /this\.notifyParentGradesViewRequest\("planning"\)/);
  assert.match(closeSource, /this\.switchView\("settings"\)/);

  const switchStart = appSource.indexOf('  switchView(viewName)');
  const switchEnd = appSource.indexOf('\n  switchSettingsTab(', switchStart);
  const switchSource = appSource.slice(switchStart, switchEnd);
  assert.match(switchSource, /!this\.canAccessGradeVault\(\).*this\.selectedCourseId/s);
  assert.match(switchSource, /void this\.navigateGrades\(/);
});

test('Noteneingabe öffnet bei gesperrtem Vault den Entsperrdialog und setzt die Navigation fort', async () => {
  let queuedAction = null;
  let dialogMode = '';
  const result = await requestGradesEntryView.call({
    selectedCourseId: 42,
    async resolveUnsavedSettingsNavigation() { return true; },
    canAccessGradeVault() { return false; },
    queueGradeVaultContinuation(action) { queuedAction = action; },
    isGradeVaultConfigured() { return true; },
    openGradeVaultDialog(mode) { dialogMode = mode; },
    switchGradesSubView() {
      assert.fail('the entry view must remain protected until the vault is unlocked');
    },
  });

  assert.equal(result, false);
  assert.equal(dialogMode, 'unlock');
  assert.deepEqual(queuedAction, {
    type: 'grades-navigation',
    detail: {
      courseId: 42,
      subview: 'entry',
    },
  });
});

test('Noteneingabe wechselt bei entsperrtem Vault direkt in die Eingabe', async () => {
  let selectedSubview = '';
  const result = await requestGradesEntryView.call({
    async resolveUnsavedSettingsNavigation() { return true; },
    canAccessGradeVault() { return true; },
    switchGradesSubView(subview) {
      selectedSubview = subview;
      return true;
    },
  });

  assert.equal(result, true);
  assert.equal(selectedSubview, 'entry');
});
