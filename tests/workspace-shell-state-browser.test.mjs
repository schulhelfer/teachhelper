import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('workspace shell state preserves bootstrap, vault, unsaved, and warning behavior', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async ({ token }) => {
    const wait = (delay = 0) => new Promise(done => window.setTimeout(done, delay));
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    const initialSnapshot = {
      ready: true,
      unsaved: {
        dirty: false,
        planningDirty: false,
        gradesDirty: false,
      },
      vault: {
        mode: 'ready',
        dbConnected: true,
        configured: true,
        unlocked: true,
        encryptionEnabled: false,
        showGradeStudentPortraits: true,
        showNameLearningModule: true,
        nameLearningDueCount: 2,
        setupRequired: false,
        autoLockWarning: { active: false, blockedAt: 0, retryAt: 0, message: '' },
      },
    };
    Object.defineProperty(window, '__teachhelperWorkspaceController', {
      configurable: true,
      value: {
        getSnapshot: (scope) => scope === 'shell' ? structuredClone(initialSnapshot) : null,
        getOwner: () => null,
        getLifecycle: () => ({ owner: false, hydrated: true, ready: true, revision: 0 }),
        getRevision: () => 0,
        isHydrated: () => true,
        isReady: () => true,
      },
    });
    const { WORKSPACE_STATE_EVENT } = await import('/src/shared/school-data/messages.js');
    await import(`/src/main.js?workspace-shell-state-browser=${token}`);
    const nameLearningTab = document.getElementById('tab-name-learning');
    const dueNodes = [...document.querySelectorAll('[data-name-learning-due-count]')];
    const initial = {
      hidden: nameLearningTab.hidden,
      dueCounts: dueNodes.map(node => ({ hidden: node.hidden, text: node.textContent })),
    };
    const dispatchState = (scope, snapshot) => window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_EVENT, {
      detail: { revision: 1, scope, ready: true, hydrated: true, snapshot },
    }));
    dispatchState('grades', {
      unsaved: { dirty: true, planningDirty: true, gradesDirty: true },
      vault: {
        ...initialSnapshot.vault,
        showNameLearningModule: false,
        nameLearningDueCount: 9,
      },
    });
    const afterForeignScope = {
      hidden: nameLearningTab.hidden,
      dueCounts: dueNodes.map(node => node.textContent),
    };
    const warningSnapshot = {
      unsaved: { dirty: false, planningDirty: false, gradesDirty: false },
      vault: {
        ...initialSnapshot.vault,
        nameLearningDueCount: 4,
        autoLockWarning: {
          active: true,
          blockedAt: 1234,
          retryAt: Date.now() + 600000,
          message: 'Bitte zuerst speichern.',
        },
      },
    };
    dispatchState('shell', warningSnapshot);
    dispatchState('shell', warningSnapshot);
    const afterShellState = {
      hidden: nameLearningTab.hidden,
      dueCounts: dueNodes.map(node => ({ hidden: node.hidden, text: node.textContent })),
      warnings: document.querySelectorAll('#message-stack .message-warn').length,
      warningText: document.querySelector('#message-stack .message-warn .message-body')?.textContent || '',
    };
    document.querySelector('#message-stack .message-close')?.click();
    await wait(250);
    nameLearningTab.click();
    await wait(450);
    const nameLearningActive = document.getElementById('app').classList.contains('app-tab-name-learning');
    dispatchState('shell', {
      unsaved: {
        dirty: true,
        planningDirty: true,
        planningSettingsDirty: true,
        gradesDirty: false,
      },
      vault: {
        ...initialSnapshot.vault,
        showNameLearningModule: false,
        nameLearningDueCount: 0,
      },
    });
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    return {
      initial,
      afterForeignScope,
      afterShellState,
      nameLearningActive,
      fallbackTab: document.getElementById('app').classList.contains('app-tab-planning'),
      nameLearningHidden: nameLearningTab.hidden,
      unsavedProtected: beforeUnload.defaultPrevented,
      unsavedDialogOpen: document.getElementById('unsaved-data-dialog').open,
    };
  }, { token: Date.now() });

  assert.deepEqual(result.initial, {
    hidden: false,
    dueCounts: [
      { hidden: false, text: ' (2)' },
      { hidden: false, text: ' (2)' },
    ],
  });
  assert.deepEqual(result.afterForeignScope, {
    hidden: false,
    dueCounts: [' (2)', ' (2)'],
  });
  assert.deepEqual(result.afterShellState.dueCounts, [
    { hidden: false, text: ' (4)' },
    { hidden: false, text: ' (4)' },
  ]);
  assert.equal(result.afterShellState.hidden, false);
  assert.equal(result.afterShellState.warnings, 1);
  assert.match(result.afterShellState.warningText, /Bitte zuerst speichern\./);
  assert.equal(result.nameLearningActive, true);
  assert.equal(result.fallbackTab, true);
  assert.equal(result.nameLearningHidden, true);
  assert.equal(result.unsavedProtected, true);
  assert.equal(result.unsavedDialogOpen, false);
});
