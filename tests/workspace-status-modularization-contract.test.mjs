import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [shell, tabController, workspaceStatus, runtime, serviceWorker, audit] = await Promise.all([
  read('../src/app/shell.js'),
  read('../src/app/shell/tab-controller.js'),
  read('../src/app/shell/workspace-status.js'),
  read('../src/app/app-runtime.js'),
  read('../sw.js'),
  read('../scripts/audit.py'),
]);

test('shell delegates workspace status while retaining dialogs and UI', () => {
  assert.match(shell, /import \{ createWorkspaceStatusController \} from '\.\/shell\/workspace-status\.js';/);
  assert.equal((shell.match(/createWorkspaceStatusController\(\{/g) || []).length, 1);
  assert.match(shell, /onChange: handleWorkspaceStatusChange,/);
  assert.match(tabController, /workspaceStatus\?\.getLeaveGuard\?\.\(nextTab, options\)/);
  assert.match(tabController, /Promise\.resolve\(resolver\(\)\)/);
  assert.match(shell, /function showUnsavedTabLeaveDialog\(\) \{/);
  assert.match(shell, /function renderPlanningManualSaveButton\(\) \{/);
  assert.match(shell, /function renderPlanningGradeVaultUnlockButton\(\) \{/);
  assert.match(shell, /createTabController\(\{/);
  assert.doesNotMatch(shell, /state\.(?:planningInitialPaintPending|gradesInitialPaintPending|planningManualSaveState|planningGradeVaultState|planningUnsavedState)/);
  assert.doesNotMatch(shell, /window\.addEventListener\((?:PLANNING|GRADES|WORKSPACE)_/);
  assert.doesNotMatch(shell, /function handleBeforeUnload\(/);
});

test('workspace status controller owns normalization, decisions, events and cleanup', () => {
  assert.match(workspaceStatus, /export function createWorkspaceStatusController\(\{/);
  assert.match(workspaceStatus, /function getLeaveGuard\(nextTab, options = \{\}\) \{/);
  assert.match(workspaceStatus, /function shouldPromptVaultUnlock\(nextTab\) \{/);
  assert.match(workspaceStatus, /function getManualSaveControlState\(\) \{/);
  assert.match(workspaceStatus, /function getVaultControlState\(\) \{/);
  assert.match(workspaceStatus, /bind\(view, WORKSPACE_STATE_EVENT, handleWorkspaceState\);/);
  assert.match(workspaceStatus, /bind\(view, 'beforeunload', handleBeforeUnload\);/);
  assert.match(workspaceStatus, /detail\.scope !== 'shell'/);
  assert.match(workspaceStatus, /bindings\.splice\(0\)\.forEach/);
  assert.match(workspaceStatus, /target\.removeEventListener\?\.\(type, listener\);/);
  assert.doesNotMatch(workspaceStatus, /src\/modules|modules\/planning|modules\/grades/);
});

test('runtime keeps only shell orchestration state and the module is offline protected', () => {
  const shellState = runtime.slice(
    runtime.indexOf('const shellState = {'),
    runtime.indexOf('\n  let bridgeController', runtime.indexOf('const shellState = {')),
  );
  assert.doesNotMatch(shellState, /planningInitialPaintPending|gradesInitialPaintPending/);
  assert.doesNotMatch(shellState, /planningManualSaveState|planningGradeVaultState|planningUnsavedState/);
  assert.match(runtime, /shellController\.setPlanningGradeVaultState\(\{/);
  assert.match(shell, /registerCleanup\(\(\) => workspaceStatus\.dispose\(\)\);/);
  assert.match(serviceWorker, /'\.\/src\/app\/shell\/workspace-status\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'shell' \/ 'workspace-status\.js'/);
});
