import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('grade database presentation uses connection flags and names without handles', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const markup = await fetch('/src/modules/grades/app.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(markup, 'text/html');
    fixture.querySelectorAll('script').forEach(script => script.remove());
    document.body.replaceChildren(...fixture.body.childNodes);
    const { installWorkspaceComponents } = await import('/src/modules/workspace/client.js');
    installWorkspaceComponents(document);
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const app = new GradesApp();
    const view = {
      sync: { supported: true, initialized: true, connected: false, pending: true, fileName: 'School.json', pendingFileName: '' },
      backup: { connected: false, pending: true, directoryName: '', pendingDirectoryName: '' },
      meta: { fileName: 'School.json' },
      manual: { fileName: '', dirty: false },
    };
    app.workspaceClient.operations = { ...app.workspaceClient.operations, getPersistenceView: () => structuredClone(view) };
    app.isExternalFileSyncPresentationSupported = () => true;
    app.getWorkspacePersistenceStatus = () => ({ presentationSupported: true, connected: view.sync.connected, backupConnected: view.backup.connected });
    app.currentView = 'settings';
    app.activeSettingsTab = 'database';
    app.updateAccessLock();
    app.renderDatabaseSection();
    const pending = { name: app.refs.syncFileName.textContent, status: app.refs.syncFileStatus.textContent, lock: app.lockReason };
    view.sync.connected = true;
    app.updateAccessLock();
    app.renderDatabaseSection();
    app.renderBackupSection();
    const connected = { name: app.refs.syncFileName.textContent, lock: app.lockReason };
    view.backup.connected = true;
    view.backup.directoryName = 'Backups';
    app.updateAccessLock();
    app.renderBackupSection();
    const ready = { lock: app.lockReason, backupName: app.refs.backupDirName.textContent };
    return { pending, connected, ready };
  });
  assert.deepEqual(result.pending, {
    name: 'Datenbankdatei: School.json (Zugriff ausstehend)',
    status: 'Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben.',
    lock: 'databaseRequired',
  });
  assert.deepEqual(result.connected, { name: 'Datenbankdatei: School.json', lock: 'backupDirRequired' });
  assert.deepEqual(result.ready, { lock: '', backupName: 'Backup-Ordner: Backups' });
});

for (const module of ['planning', 'grades']) {
  test(`${module} requests stored database access from a click and keeps file selection available`, { timeout: 60000 }, async (t) => {
    const evaluate = await openDomBrowser(t);
    const pending = await evaluate(async (module) => {
      const { installWorkspaceController } = await import('/src/modules/workspace/index.js');
      const controller = installWorkspaceController(window);
      const runtime = controller.getOwner();
      const state = { permission: 'prompt', missing: false, requests: [], selections: [], messages: [], runtime };
      const { bytes } = runtime.buildEmptyDatabaseContainer('test');
      const file = new File([bytes], 'Database.json', { type: 'application/json' });
      const fileHandle = {
        name: file.name,
        async queryPermission() { return state.permission; },
        async requestPermission({ mode }) {
          state.requests.push({ mode, activated: navigator.userActivation.isActive });
          return state.permission;
        },
        async getFile() {
          if (state.missing) throw new DOMException('File missing', 'NotFoundError');
          return file;
        },
      };
      const backupHandle = { name: 'Backups', async queryPermission() { return 'granted'; } };
      runtime.persistence.loadStoredHandle = async (key) => key === 'sync-file' ? fileHandle : backupHandle;
      runtime.persistence.storeHandle = async () => true;
      window.databaseTest = state;

      const frame = document.createElement('iframe');
      frame.style.cssText = 'width: 100%; height: 95vh';
      await new Promise((resolve) => {
        frame.addEventListener('load', resolve, { once: true });
        frame.src = `/src/modules/${module}/app.html`;
        document.body.append(frame);
      });
      const view = frame.contentWindow;
      const app = module === 'planning' ? view.__teachhelperPlannerApp : view.__teachhelperGradesApp.frame;
      app.showInfoMessage = async (message) => { state.messages.push(message); };
      view.showOpenFilePicker = async () => {
        state.selections.push(view.navigator.userActivation.isActive);
        throw new DOMException('Cancelled', 'AbortError');
      };
      return {
        grantShown: !app.refs.dbGrantAccessBtn.hidden,
        pickerShown: !app.refs.dbSelectExistingBtn.hidden,
        requests: state.requests.length,
      };
    }, module);
    assert.deepEqual(pending, { grantShown: true, pickerShown: true, requests: 0 });

    async function activateButton(id) {
      const point = await evaluate((id) => {
        const frame = document.querySelector('iframe');
        const button = frame.contentDocument.getElementById(id);
        button.scrollIntoView({ block: 'center' });
        const frameRect = frame.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        if (button.disabled || !rect.width || !rect.height) return null;
        return {
          x: frameRect.left + frame.clientLeft + rect.left + rect.width / 2,
          y: frameRect.top + frame.clientTop + rect.top + rect.height / 2,
        };
      }, id);
      assert.ok(point, id);
      await evaluate.dispatchMouseEvent({ ...point, type: 'mousePressed', button: 'left', clickCount: 1 });
      await evaluate.dispatchMouseEvent({ ...point, type: 'mouseReleased', button: 'left', clickCount: 1 });
      return evaluate(async () => {
        const { runtime, messages, requests, selections } = window.databaseTest;
        await runtime.syncReconnectInFlight?.catch(() => undefined);
        const button = document.querySelector('iframe').contentDocument.getElementById('db-grant-access-btn');
        return {
          messages,
          requests,
          selections,
          grantShown: !button.hidden,
          grantEnabled: !button.disabled,
          connected: runtime.databaseLoaded,
          backupName: runtime.backupDirectoryHandle?.name,
        };
      });
    }

    const picker = await activateButton('db-select-existing-btn');
    assert.deepEqual(picker.selections, [true]);
    assert.deepEqual(picker.requests, []);
    assert.deepEqual(picker.messages, []);

    const denied = await activateButton('db-grant-access-btn');
    assert.deepEqual(denied.requests, [{ mode: 'readwrite', activated: true }]);
    assert.match(denied.messages.at(-1), /Zugriff .* wurde nicht erteilt/);
    assert.equal(denied.connected, false);
    assert.equal(denied.grantEnabled, true);
    assert.deepEqual(denied.selections, [true]);

    await evaluate(() => {
      window.databaseTest.permission = 'granted';
      window.databaseTest.missing = true;
    });
    const missing = await activateButton('db-grant-access-btn');
    assert.match(missing.messages.at(-1), /wurde nicht gefunden.*erneut aus/);
    assert.equal(missing.connected, false);
    assert.equal(missing.grantEnabled, true);

    await evaluate(() => { window.databaseTest.missing = false; });
    const granted = await activateButton('db-grant-access-btn');
    assert.equal(granted.connected, true);
    assert.equal(granted.grantShown, false);
    assert.equal(granted.backupName, 'Backups');
  });
}
