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
