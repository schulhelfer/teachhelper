import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {
  createExpectationHorizonPrintBundle,
  detectExpectationHorizonPrintPlatform,
} from '../src/modules/grades/expectation-horizon-print.js';

const batchId = '0123456789abcdef0123456789abcdef';
const names = ['Änne & O\'Neil %TEMP% ! $(echo test).docx', 'Ben (2).docx'];
const folderName = "KA-Mathematik Ä & O'Neil %TEMP% ! $(echo test) 😀-11-1-2";
const bundle = (platform = 'windows', fileNames = names, desiredFolderName = folderName) => createExpectationHorizonPrintBundle({
  batchId, platform, fileNames, folderName: desiredFolderName, zipFileName: 'Erwartungshorizonte - Kurs.zip',
});
const helperText = (printBundle, extension) => new TextDecoder().decode(
  printBundle.helperFiles.find((file) => file.name.endsWith(extension)).data,
);

class Enumerator {
  constructor(items) { this.items = items; this.index = 0; }
  atEnd() { return this.index >= this.items.length; }
  moveNext() { this.index += 1; }
  item() { return this.items[this.index]; }
}

function runWindowsScript(options = {}) {
  const printBundle = bundle();
  const root = 'C:\\Downloads\\TeachHelper-EWH-test';
  const events = [];
  const output = [];
  let activeDocument = null;
  let dialogCalls = 0;
  let exitCode = 0;
  const nativeExit = {};
  const error = Object.assign(new Error('Nicht unterstützt'), { number: -2147352573 });
  const printDialog = {
    PrintToFile: options.printToFile || false,
    DuplexPrint: options.manualDuplex || false,
    NumCopies: 1,
    Display() {
      dialogCalls += 1;
      if (options.dialogUnavailable) throw error;
      if (options.dialogDenied) throw Object.assign(new Error('Gesperrt'), { number: -2147024891 });
      this.NumCopies = 2;
      return options.cancel ? 0 : -1;
    },
    Execute() {
      if (options.executeUnavailable) throw error;
      if (options.executeUnavailableSecond && activeDocument.name === names[1]) throw error;
      assert.equal(this.Background, 0);
      assert.equal(this.FileName, activeDocument.FullName);
      if (options.failSecond && activeDocument.name === names[1]) throw new Error('Druckerfehler');
      events.push(['print', activeDocument.name, this.NumCopies]);
    },
  };
  const word = {
    Options: {},
    get BackgroundPrintingStatus() { return options.timeout ? 1 : 0; },
    Dialogs: { Item(id) {
      if (id === 97) return { Execute() { events.push(['default-printer', this.Printer, this.DoNotSetAsSysDefault]); } };
      return printDialog;
    } },
    Documents: { Open(path, confirm, readonly, recent) {
      assert.equal(readonly, true);
      assert.equal(recent, false);
      const name = path.slice(root.length + 1);
      if (options.openFailure) throw new Error('Word-Zugriff verweigert');
      const document = {
        name,
        FullName: path,
        Activate() { activeDocument = this; events.push(['activate', name]); },
        PrintOut(...parameters) {
          assert.equal(parameters[0], false);
          assert.equal(parameters[2], 0);
          assert.equal(parameters[7], 1);
          events.push(['print', name, 1]);
        },
        Close(save) { assert.equal(save, 0); events.push(['close', name]); },
      };
      events.push(['open', name]);
      return document;
    } },
    Quit(save) { assert.equal(save, 0); events.push(['quit-owned-word']); },
  };
  const manifest = helperText(printBundle, '.txt');
  const fso = {
    GetParentFolderName: () => root,
    BuildPath: (directory, name) => `${directory}\\${name}`,
    GetFolder: () => ({ Files: (options.actualNames || names).map((Name) => ({ Name })) }),
    FileExists: (path) => !(options.missingFile && path.endsWith(names[1])),
    CreateTextFile() { return { Write(message) { events.push(['error-log', message]); }, Close() {} }; },
  };
  const stream = {
    Open() {}, LoadFromFile() {}, ReadText: () => options.invalidManifest ? 'Falscher Export' : manifest, Close() {},
  };
  let now = 0;
  const context = {
    ActiveXObject: function (id) {
      if (id === 'Scripting.FileSystemObject') return fso;
      if (id === 'ADODB.Stream') return stream;
      if (id === 'Word.Application') { events.push(['create-word']); return word; }
      throw new Error(id);
    },
    Enumerator,
    GetObject: () => ({ ExecQuery: () => options.noPrinter ? [] : [{ Name: options.printerName || 'Standarddrucker' }] }),
    WScript: {
      ScriptFullName: `${root}\\TeachHelper-Drucken.js`,
      Echo: (message) => output.push(message),
      StdOut: { Write: (message) => output.push(message) },
      StdIn: { ReadLine: () => options.answer || 'j' },
      Sleep() {},
      Quit(code) { exitCode = code; throw nativeExit; },
    },
    Date: options.timeout ? class { getTime() { now += 500000; return now; } } : Date,
  };
  try { vm.runInNewContext(helperText(printBundle, '.js'), context); }
  catch (error) { if (error !== nativeExit) throw error; }
  return { events, output, exitCode, dialogCalls, word };
}

function runWindowsLauncher(options = {}) {
  const printBundle = bundle();
  const source = printBundle.command.slice(5, printBundle.command.indexOf('>"%TEMP%')).replace(/\^(.)/g, '$1');
  assert.doesNotMatch(source, /["%!]/);
  const downloads = 'C:\\Users\\Änne ! %TEMP% & test\\Downloads';
  const archive = `${downloads}\\${printBundle.zipFileName}`;
  const events = [];
  const output = [];
  let exitCode = 0;
  const nativeExit = {};
  const files = (options.archiveNames || [printBundle.zipFileName]).map((Name) => ({ Name, Path: `${downloads}\\${Name}` }));
  const remainingFiles = new Set([...files.map((file) => file.Path), ...(options.existingFiles || []).map((name) => `${downloads}\\${name}`)]);
  const directories = new Set((options.existingFolders || []).map((name) => `${downloads}\\${name}`));
  const baseFolder = `${downloads}\\${printBundle.folderName}`;
  let raced = false;
  let folder = '';
  const fso = {
    GetFolder: () => ({ Files: files }),
    BuildPath: (root, name) => `${root}\\${name}`,
    FolderExists: (path) => directories.has(path),
    CreateFolder(path) {
      if (options.createFailure) throw new Error('Kein Schreibzugriff');
      if (options.folderRace && !raced) {
        raced = true;
        directories.add(path);
        throw Object.assign(new Error('Ordner inzwischen angelegt'), { number: -2146828230 });
      }
      assert.ok(!directories.has(path) && !remainingFiles.has(path));
      directories.add(path);
      folder = path;
      events.push(['mkdir', path]);
    },
    CopyFile(from, to, overwrite) { remainingFiles.add(to); events.push(['stage', from, to, overwrite]); },
    FileExists: (path) => remainingFiles.has(path) || (path.endsWith('TeachHelper-Druckfehler.txt') && Boolean(options.log)),
    OpenTextFile: () => ({ ReadAll: () => options.log, Close() {} }),
    DeleteFolder() { assert.fail('Der entpackte Ordner darf nicht gelöscht werden.'); },
    DeleteFile(path) {
      const staged = path === `${folder}\\TeachHelper-Archiv.zip`;
      const scriptName = ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript'].find((name) => path === `${folder}\\${name}`);
      const manifest = path === `${folder}\\TeachHelper-Dateiliste.txt`;
      events.push([scriptName ? 'delete-print-script' : manifest ? 'delete-manifest' : staged ? 'delete-staged-zip' : 'delete-zip', path]);
      if (scriptName && options.scriptCleanupFailure === scriptName) throw new Error('Druckskript gesperrt');
      if (manifest && options.manifestCleanupFailure) throw new Error('Dateiliste gesperrt');
      if (options.cleanupFailure && staged) throw new Error('Temporäre Archivkopie gesperrt');
      if (options.deleteZipFailure && !staged && !scriptName && !manifest) throw new Error('Download-ZIP gesperrt');
      remainingFiles.delete(path);
    },
  };
  const shell = {
    CurrentDirectory: 'C:\\Start',
    RegRead: () => downloads,
    ExpandEnvironmentStrings: (value) => value,
    Environment: () => ({ Item: () => 'C:\\Windows' }),
    Run(command) {
      assert.ok(!command.includes(downloads));
      assert.ok(!command.includes(names[0]));
      if (command.includes('tar.exe')) {
        events.push(['extract']);
        if (options.extractFailure) return 1;
        for (const name of [...names, ...printBundle.helperFiles.map((file) => file.name)]) remainingFiles.add(`${folder}\\${name}`);
        return 0;
      }
      events.push(['print']);
      return options.printFailure ? 1 : 0;
    },
  };
  try {
    vm.runInNewContext(source, {
      Enumerator,
      ActiveXObject: function (id) { return id === 'WScript.Shell' ? shell : fso; },
      WScript: { Echo: (message) => output.push(message), Quit(code) { exitCode = code; throw nativeExit; } },
    });
  } catch (error) { if (error !== nativeExit) throw error; }
  return { archive, folder, baseFolder, directories, remainingFiles, events, output, exitCode, directory: shell.CurrentDirectory };
}

test('Betriebssystemerkennung berücksichtigt Desktop-Browser und schließt Mobilgeräte aus', () => {
  for (const platform of ['Windows', 'Win32', 'Win64']) assert.equal(detectExpectationHorizonPrintPlatform({ platform }), 'windows');
  for (const platform of ['macOS', 'MacIntel', 'Macintosh']) assert.equal(detectExpectationHorizonPrintPlatform({ platform }), 'macos');
  assert.equal(detectExpectationHorizonPrintPlatform({ platform: 'Linux', userAgentData: { platform: 'Windows' } }), 'windows');
  assert.equal(detectExpectationHorizonPrintPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'windows');
  assert.equal(detectExpectationHorizonPrintPlatform({ platform: 'MacIntel', maxTouchPoints: 5 }), null);
  assert.equal(detectExpectationHorizonPrintPlatform({ platform: 'Linux', userAgent: 'Android' }), null);
  assert.equal(detectExpectationHorizonPrintPlatform({ platform: 'Linux' }), null);
  assert.equal(detectExpectationHorizonPrintPlatform({ userAgent: 'iPhone' }), null);
});

test('Exportpakete sind eindeutig, portabel und enthalten Daten ausschließlich als Dateiliste', () => {
  const windows = bundle();
  const mac = bundle('macos');
  assert.match(windows.zipFileName, new RegExp(`-TH-EWH-${batchId}\\.zip$`));
  assert.equal(windows.folderName, folderName);
  assert.deepEqual(windows.helperFiles.map((file) => file.name), ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript', 'TeachHelper-Dateiliste.txt']);
  assert.equal(helperText(windows, '.txt'), `TeachHelper-EWH ${batchId}\n${names.join('\n')}\n`);
  assert.ok(windows.command.length < 8191);
  assert.ok(!/[\r\n]/.test(windows.command));
  assert.ok(!/[\r\n]/.test(mac.command));
  assert.doesNotMatch(windows.command, /powershell|pwsh|https?:/i);
  assert.doesNotMatch(mac.command, /curl|https?:|python|node/i);
  assert.ok(!windows.command.includes(names[0]));
  assert.ok(!mac.command.includes(names[0]));
  assert.ok(!windows.command.includes(folderName));
  assert.ok(!mac.command.includes(folderName));
  assert.equal(bundle(null).command, '');
  const first = createExpectationHorizonPrintBundle({ fileNames: names, platform: null });
  const second = createExpectationHorizonPrintBundle({ fileNames: names, platform: null });
  assert.notEqual(first.batchId, second.batchId);
});

test('Ungültige IDs, unsichere Dateinamen und Namen mit gleichen Dateisystemschlüsseln werden abgelehnt', () => {
  assert.throws(() => createExpectationHorizonPrintBundle({ batchId: '$(evil)', fileNames: names }), /ID/);
  for (const fileNames of [[], ['../Anna.docx'], ['CON.docx'], ['Anna\n.docx'], ['Anna.docx', 'ANNA.docx'], ['Ä.docx', 'A\u0308.docx']]) {
    assert.throws(() => bundle('windows', fileNames));
  }
  for (const name of ['', '.', '..', '../KA', 'KA/A', 'KA\\A', 'CON', 'KA\nA', 'KA.', 'KA ', 'Ä'.repeat(121)]) {
    assert.throws(() => bundle('windows', names, name), /Ordnername/);
  }
});

test('Windows druckt die richtige Reihenfolge und übernimmt den ersten Dialog einschließlich Kopienzahl', () => {
  const result = runWindowsScript();
  assert.equal(result.exitCode, 0);
  assert.equal(result.dialogCalls, 1);
  assert.deepEqual(result.events.filter(([type]) => type === 'print'), names.map((name) => ['print', name, 2]));
  assert.deepEqual(result.events.filter(([type]) => type === 'close'), names.map((name) => ['close', name]));
  assert.deepEqual(result.events.filter(([type]) => type === 'default-printer'), [['default-printer', 'Standarddrucker', 1]]);
  assert.equal(result.word.AutomationSecurity, 3);
  assert.equal(result.word.Options.PrintBackground, undefined);
  assert.deepEqual(result.events.at(-1), ['quit-owned-word']);
});

test('Windows bietet Standardwerte nur bei nicht unterstützter Dialogsteuerung und vor dem ersten Druck an', () => {
  const accepted = runWindowsScript({ dialogUnavailable: true });
  assert.equal(accepted.exitCode, 0);
  assert.deepEqual(accepted.events.filter(([type]) => type === 'print'), names.map((name) => ['print', name, 1]));
  const declined = runWindowsScript({ dialogUnavailable: true, answer: 'n' });
  assert.equal(declined.exitCode, 1);
  assert.ok(!declined.events.some(([type]) => type === 'print'));
  const denied = runWindowsScript({ dialogDenied: true });
  assert.equal(denied.exitCode, 1);
  assert.ok(!denied.output.some((message) => message.includes('[j/N]')));
  const unavailable = runWindowsScript({ executeUnavailable: true });
  assert.equal(unavailable.exitCode, 0);
  assert.deepEqual(unavailable.events.filter(([type]) => type === 'print'), names.map((name) => ['print', name, 1]));
  const partiallyPrinted = runWindowsScript({ executeUnavailableSecond: true });
  assert.equal(partiallyPrinted.exitCode, 1);
  assert.deepEqual(partiallyPrinted.events.filter(([type]) => type === 'print'), [['print', names[0], 2]]);
  assert.ok(!partiallyPrinted.output.some((message) => message.includes('[j/N]')));
});

test('Windows meldet Abbruch, fehlende Dateien, Druckfehler und Zeitüberschreitungen mit Fortschritt', () => {
  for (const options of [{ cancel: true }, { printToFile: true }, { manualDuplex: true }, { missingFile: true }, { invalidManifest: true }, { actualNames: [...names, 'Fremd.docx'] }, { noPrinter: true }, { openFailure: true }, { printerName: 'Microsoft Print to PDF' }]) {
    const result = runWindowsScript(options);
    assert.equal(result.exitCode, 1);
    assert.ok(!result.events.some(([type]) => type === 'print'));
  }
  const failure = runWindowsScript({ failSecond: true });
  assert.equal(failure.exitCode, 1);
  assert.match(failure.output.join('\n'), /Ben \(2\)\.docx[\s\S]*1 von 2/);
  assert.deepEqual(failure.events.filter(([type]) => type === 'print'), [['print', names[0], 2]]);
  const timeout = runWindowsScript({ timeout: true });
  assert.equal(timeout.exitCode, 1);
  assert.match(timeout.output.join('\n'), /5 Minuten/);
});

test('Windows-Launcher behält DOCX-Dateien und entfernt Druckskripte und Dateiliste vor den ZIP-Dateien', () => {
  const result = runWindowsLauncher();
  assert.equal(result.exitCode, 0);
  assert.equal(result.folder, result.baseFolder);
  assert.deepEqual(result.events.map(([type]) => type), ['mkdir', 'stage', 'extract', 'print', 'delete-print-script', 'delete-print-script', 'delete-manifest', 'delete-staged-zip', 'delete-zip']);
  assert.equal(result.events.at(-1)[1], result.archive);
  for (const name of names) assert.ok(result.remainingFiles.has(`${result.folder}\\${name}`));
  for (const name of ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript', 'TeachHelper-Dateiliste.txt']) assert.ok(!result.remainingFiles.has(`${result.folder}\\${name}`));
  assert.ok(!result.remainingFiles.has(`${result.folder}\\TeachHelper-Archiv.zip`));
  assert.ok(!result.remainingFiles.has(result.archive));
  assert.ok(result.output.join('\n').includes(`Ordner bleibt erhalten: ${result.folder}`));
  assert.equal(result.directory, 'C:\\Start');
  const renamed = runWindowsLauncher({ archiveNames: [bundle().zipFileName.replace('.zip', ' (1).zip')] });
  assert.equal(renamed.exitCode, 0);
  assert.match(renamed.events.at(-1)[1], / \(1\)\.zip$/);
  assert.ok(!renamed.remainingFiles.has(renamed.events.at(-1)[1]));
});

test('Windows legt nummerierte Ordner an und erhält vorhandene Ordner und Dateien auch bei gleichzeitiger Erstellung', () => {
  const result = runWindowsLauncher({ existingFolders: [folderName, `${folderName} (3)`], existingFiles: [`${folderName} (2)`] });
  assert.equal(result.exitCode, 0);
  assert.equal(result.folder, `${result.baseFolder} (4)`);
  assert.ok(result.directories.has(result.baseFolder));
  assert.ok(result.directories.has(`${result.baseFolder} (3)`));
  assert.ok(result.remainingFiles.has(`${result.baseFolder} (2)`));
  assert.ok(result.output.join('\n').includes(`Ordner bleibt erhalten: ${result.folder}`));
  const race = runWindowsLauncher({ folderRace: true });
  assert.equal(race.exitCode, 0);
  assert.equal(race.folder, `${race.baseFolder} (2)`);
  assert.ok(race.directories.has(race.baseFolder));
  const denied = runWindowsLauncher({ createFailure: true });
  assert.equal(denied.exitCode, 1);
  assert.ok(denied.remainingFiles.has(denied.archive));
  assert.ok(!denied.events.some(([type]) => ['stage', 'extract', 'print'].includes(type)));
});

test('Windows-Launcher behält alle Exportdateien bei Fehlern und das ZIP bei Bereinigungsfehlern', () => {
  for (const options of [{ extractFailure: true }, { printFailure: true, log: 'Ben (2).docx: 1 von 2 Auftraegen uebergeben.' }, { archiveNames: [] }, { archiveNames: [bundle().zipFileName, bundle().zipFileName.replace('.zip', ' (1).zip')] }, { archiveNames: [`${bundle().zipFileName}.crdownload`] }]) {
    const result = runWindowsLauncher(options);
    assert.equal(result.exitCode, 1);
    assert.ok(!result.events.some(([type]) => type.startsWith('delete')));
    assert.equal(result.directory, 'C:\\Start');
    if (options.extractFailure || options.printFailure) {
      assert.ok(result.remainingFiles.has(result.archive));
      assert.ok(result.remainingFiles.has(`${result.folder}\\TeachHelper-Archiv.zip`));
    }
    if (options.printFailure) {
      for (const name of [...names, ...bundle().helperFiles.map((file) => file.name)]) assert.ok(result.remainingFiles.has(`${result.folder}\\${name}`));
    }
    if (options.log) assert.ok(result.output.join('\n').includes(options.log));
  }
  const cleanup = runWindowsLauncher({ cleanupFailure: true });
  assert.equal(cleanup.exitCode, 1);
  assert.ok(!cleanup.events.some(([type]) => type === 'delete-zip'));
  assert.ok(cleanup.remainingFiles.has(cleanup.archive));
  assert.ok(cleanup.remainingFiles.has(`${cleanup.folder}\\TeachHelper-Archiv.zip`));
  const zipFailure = runWindowsLauncher({ deleteZipFailure: true });
  assert.equal(zipFailure.exitCode, 1);
  assert.ok(zipFailure.remainingFiles.has(zipFailure.archive));
  assert.ok(!zipFailure.remainingFiles.has(`${zipFailure.folder}\\TeachHelper-Archiv.zip`));
  for (const result of [cleanup, zipFailure]) {
    for (const name of names) assert.ok(result.remainingFiles.has(`${result.folder}\\${name}`));
    for (const name of ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript', 'TeachHelper-Dateiliste.txt']) assert.ok(!result.remainingFiles.has(`${result.folder}\\${name}`));
    assert.ok(result.output.join('\n').includes(result.folder));
  }
  const manifestFailure = runWindowsLauncher({ manifestCleanupFailure: true });
  assert.equal(manifestFailure.exitCode, 1);
  assert.ok(manifestFailure.remainingFiles.has(manifestFailure.archive));
  assert.ok(manifestFailure.remainingFiles.has(`${manifestFailure.folder}\\TeachHelper-Archiv.zip`));
  for (const name of [...names, 'TeachHelper-Dateiliste.txt']) assert.ok(manifestFailure.remainingFiles.has(`${manifestFailure.folder}\\${name}`));
  for (const name of ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript']) assert.ok(!manifestFailure.remainingFiles.has(`${manifestFailure.folder}\\${name}`));
  assert.ok(!manifestFailure.events.some(([type]) => type === 'delete-staged-zip' || type === 'delete-zip'));
  assert.match(manifestFailure.output.join('\n'), /Dateiliste gesperrt/);
  for (const scriptName of ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript']) {
    const failure = runWindowsLauncher({ scriptCleanupFailure: scriptName });
    assert.equal(failure.exitCode, 1);
    assert.ok(failure.remainingFiles.has(failure.archive));
    assert.ok(failure.remainingFiles.has(`${failure.folder}\\TeachHelper-Archiv.zip`));
    assert.ok(failure.remainingFiles.has(`${failure.folder}\\${scriptName}`));
    for (const name of [...names, 'TeachHelper-Dateiliste.txt']) assert.ok(failure.remainingFiles.has(`${failure.folder}\\${name}`));
    assert.ok(!failure.events.some(([type]) => type === 'delete-staged-zip' || type === 'delete-zip'));
  }
});

test('macOS-Befehl behält DOCX und entfernt Druckskripte, Dateiliste und ZIP ausschließlich nach Erfolg', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-Shell erforderlich');
  const command = bundle('macos').command;
  const script = command.slice('/bin/sh -c \''.length, -'\' && exit'.length).replaceAll("'\\''", "'");
  const syntax = spawnSync('/bin/sh', ['-n', '-c', script], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const root = await mkdtemp(join(tmpdir(), 'ewh-native-print-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const downloads = join(root, "Downloads Ä & O'Neil %test% !");
  const { mkdir } = await import('node:fs/promises');
  await mkdir(downloads);
  const log = join(root, 'actions');
  const osascript = join(root, 'osascript');
  const ditto = join(root, 'ditto');
  const remove = join(root, 'remove');
  const printedFolderFile = join(root, 'printed-folder');
  await writeFile(osascript, '#!/bin/sh\nif [ "$1" = "-e" ]; then printf "%s/\\n" "$EWH_DOWNLOADS"; else printf "print\\n" >> "$EWH_LOG"; printf "%s" "$2" > "$EWH_FOLDER_FILE"; if [ -n "${EWH_PRINT_ERROR:-}" ]; then printf "%s\\n" "$EWH_PRINT_ERROR" >&2; fi; exit "$EWH_PRINT_CODE"; fi\n', { mode: 0o700 });
  await writeFile(ditto, '#!/bin/sh\nprintf "extract\\n" >> "$EWH_LOG"\nprintf "Mock DOCX" > "$4/Anna.docx"\nprintf "Mock script" > "$4/TeachHelper-Drucken.applescript"\nprintf "Mock script" > "$4/TeachHelper-Drucken.js"\nprintf "Mock manifest" > "$4/TeachHelper-Dateiliste.txt"\n', { mode: 0o700 });
  await writeFile(remove, '#!/bin/sh\nprintf "delete %s\\n" "$*" >> "$EWH_LOG"\ncase "$2" in *.zip) target=zip ;; */TeachHelper-Dateiliste.txt) target=manifest ;; *) target=scripts ;; esac\nif [ "${EWH_REMOVE_TARGET:-scripts}" = "$target" ] && [ "${EWH_REMOVE_CODE:-0}" != "0" ]; then exit "$EWH_REMOVE_CODE"; fi\nexec /bin/rm "$@"\n', { mode: 0o700 });
  const simulated = script.replaceAll('/usr/bin/osascript', osascript).replaceAll('/usr/bin/ditto', ditto).replaceAll('/bin/rm', remove)
    .replaceAll('/usr/bin/base64 -D', process.platform === 'darwin' ? '/usr/bin/base64 -D' : '/usr/bin/base64 -d');
  const env = { ...process.env, EWH_DOWNLOADS: downloads, EWH_LOG: log, EWH_PRINT_CODE: '1', EWH_FOLDER_FILE: printedFolderFile };
  const retainedFolder = async (scriptsRemain = true, manifestRemains = scriptsRemain) => {
    const folder = await readFile(printedFolderFile, 'utf8');
    assert.ok((await stat(folder)).isDirectory());
    assert.equal(await readFile(join(folder, 'Anna.docx'), 'utf8'), 'Mock DOCX');
    if (manifestRemains) assert.equal(await readFile(join(folder, 'TeachHelper-Dateiliste.txt'), 'utf8'), 'Mock manifest');
    else await assert.rejects(readFile(join(folder, 'TeachHelper-Dateiliste.txt')), { code: 'ENOENT' });
    for (const scriptName of ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript']) {
      if (scriptsRemain) assert.equal(await readFile(join(folder, scriptName), 'utf8'), 'Mock script');
      else await assert.rejects(readFile(join(folder, scriptName)), { code: 'ENOENT' });
    }
    return folder;
  };
  const archive = join(downloads, bundle('macos').zipFileName.replace('.zip', ' (1).zip'));
  await writeFile(archive, 'ZIP');
  const failure = spawnSync('/bin/sh', ['-c', simulated], { env, encoding: 'utf8' });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /FEHLER[\s\S]*ZIP:[\s\S]*Ordner:/);
  assert.equal(await readFile(log, 'utf8'), 'extract\nprint\n');
  assert.equal(await readFile(archive, 'utf8'), 'ZIP');
  const failureFolder = await retainedFolder();
  assert.equal(failureFolder, join(downloads, folderName));
  await writeFile(join(downloads, `${folderName} (2)`), 'Vorhandene Datei');
  await writeFile(log, '');
  const success = spawnSync('/bin/sh', ['-c', simulated], { env: { ...env, EWH_PRINT_CODE: '0' }, encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  const successFolder = await retainedFolder(false);
  assert.equal(successFolder, join(downloads, `${folderName} (3)`));
  assert.equal(await readFile(join(downloads, `${folderName} (2)`), 'utf8'), 'Vorhandene Datei');
  assert.equal(await readFile(join(failureFolder, 'Anna.docx'), 'utf8'), 'Mock DOCX');
  assert.equal(await readFile(join(failureFolder, 'TeachHelper-Drucken.applescript'), 'utf8'), 'Mock script');
  const scriptDeletion = (folder) => `delete -- ${folder}/TeachHelper-Drucken.js ${folder}/TeachHelper-Drucken.applescript\n`;
  const manifestDeletion = (folder) => `delete -- ${folder}/TeachHelper-Dateiliste.txt\n`;
  assert.equal(await readFile(log, 'utf8'), `extract\nprint\n${scriptDeletion(successFolder)}${manifestDeletion(successFolder)}delete -- ${archive}\n`);
  assert.ok(success.stdout.includes(`Ordner bleibt erhalten: ${successFolder}`));
  await assert.rejects(readFile(archive), { code: 'ENOENT' });
  await writeFile(archive, 'ZIP');
  await writeFile(log, '');
  const shutdownFailure = spawnSync('/bin/sh', ['-c', simulated], {
    env: { ...env, EWH_PRINT_ERROR: 'Word konnte nach dem Druck nicht beendet werden: Zeitüberschreitung. 2 von 2 Aufträgen übergeben.' },
    encoding: 'utf8',
  });
  assert.equal(shutdownFailure.status, 1);
  assert.match(shutdownFailure.stderr, /Word konnte nach dem Druck nicht beendet werden:[\s\S]*2 von 2/);
  assert.equal(await readFile(log, 'utf8'), 'extract\nprint\n');
  assert.equal(await readFile(archive, 'utf8'), 'ZIP');
  await retainedFolder();
  await writeFile(log, '');
  const cleanup = spawnSync('/bin/sh', ['-c', simulated], { env: { ...env, EWH_PRINT_CODE: '0', EWH_REMOVE_CODE: '1' }, encoding: 'utf8' });
  assert.equal(cleanup.status, 1);
  assert.equal(await readFile(archive, 'utf8'), 'ZIP');
  const cleanupFolder = await retainedFolder();
  assert.equal(await readFile(log, 'utf8'), `extract\nprint\n${scriptDeletion(cleanupFolder)}`);
  await writeFile(log, '');
  const manifestFailure = spawnSync('/bin/sh', ['-c', simulated], { env: { ...env, EWH_PRINT_CODE: '0', EWH_REMOVE_CODE: '1', EWH_REMOVE_TARGET: 'manifest' }, encoding: 'utf8' });
  assert.equal(manifestFailure.status, 1);
  assert.equal(await readFile(archive, 'utf8'), 'ZIP');
  const manifestFailureFolder = await retainedFolder(false, true);
  assert.equal(await readFile(log, 'utf8'), `extract\nprint\n${scriptDeletion(manifestFailureFolder)}${manifestDeletion(manifestFailureFolder)}`);
  assert.match(manifestFailure.stderr, /FEHLER[\s\S]*ZIP:[\s\S]*Ordner:/);
  await writeFile(log, '');
  const zipFailure = spawnSync('/bin/sh', ['-c', simulated], { env: { ...env, EWH_PRINT_CODE: '0', EWH_REMOVE_CODE: '1', EWH_REMOVE_TARGET: 'zip' }, encoding: 'utf8' });
  assert.equal(zipFailure.status, 1);
  assert.equal(await readFile(archive, 'utf8'), 'ZIP');
  const zipFailureFolder = await retainedFolder(false);
  assert.equal(zipFailureFolder, join(downloads, `${folderName} (7)`));
  assert.equal(await readFile(log, 'utf8'), `extract\nprint\n${scriptDeletion(zipFailureFolder)}${manifestDeletion(zipFailureFolder)}delete -- ${archive}\n`);
  await writeFile(log, '');
  await writeFile(join(downloads, bundle('macos').zipFileName), 'zweites ZIP');
  const ambiguous = spawnSync('/bin/sh', ['-c', simulated], { env, encoding: 'utf8' });
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /2 Treffer/);
  assert.equal(await readFile(log, 'utf8'), '');
});
