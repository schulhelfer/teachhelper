import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('EWH-Druckbutton wird erst nach vollständigem Export aktiviert und kopiert den passenden Befehl', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  for (const platform of ['Windows', 'macOS', 'Linux']) {
    await t.test(platform, async () => {
      const result = await evaluate(async (platform) => {
        Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform } });
        Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: platform });
        const { createEwhDocxExportApp } = await import('/tests/helpers/ewh-docx.mjs');
        const { app, downloads } = await createEwhDocxExportApp(1);
        window.ewhPrintFixture = app;
        const copies = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => copies.push(value) } });
        await app.openExpectationHorizonDialog();
        const initiallyDisabled = app.refs.expectationHorizonPrintCopy.disabled;
        const exporting = app.generateExpectationHorizons();
        const generatingDisabled = app.refs.expectationHorizonPrintCopy.disabled;
        await exporting;
        const enabled = !app.refs.expectationHorizonPrintCopy.disabled;
        if (enabled) {
          app.refs.expectationHorizonPrintCopy.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const result = {
          initiallyDisabled, generatingDisabled, enabled,
          open: app.refs.expectationHorizonDialog.open, downloads: downloads.length,
          copied: copies[0] || '', command: app.expectationHorizonPrintExport.command,
          folderName: app.expectationHorizonPrintExport.folderName,
          help: app.refs.expectationHorizonPrintHelp.textContent,
          status: app.refs.expectationHorizonStatus.textContent,
          ariaLabel: app.refs.expectationHorizonPrintCopy.getAttribute('aria-label'),
          tooltip: app.refs.expectationHorizonPrintCopy.dataset.tooltip,
        };
        app.closeExpectationHorizonDialog();
        await app.openExpectationHorizonDialog();
        result.disabledOnReopen = app.refs.expectationHorizonPrintCopy.disabled;
        return result;
      }, platform);
      assert.ok(result.initiallyDisabled && result.generatingDisabled && result.open && result.disabledOnReopen);
      assert.equal(result.downloads, 1);
      assert.equal(result.folderName, 'KA-Mathematik 11-11-1-2');
      assert.equal(result.enabled, platform !== 'Linux');
      assert.equal(result.ariaLabel, 'Druckbefehl kopieren');
      assert.equal(result.tooltip, 'Druckbefehl kopieren');
      assert.equal(result.copied, result.command);
      if (platform === 'Windows') assert.match(result.copied, /^echo [\s\S]*cscript[\s\S]*&& exit$/);
      if (platform === 'macOS') assert.match(result.copied, /^\/bin\/sh -c [\s\S]*&& exit$/);
      if (result.enabled) {
        assert.match(result.help, platform === 'Windows' ? /CMD \(Eingabeaufforderung\)/ : /Terminal/);
        assert.match(result.help, /Download vollständig abwarten/);
        assert.match(result.help, /Nach erfolgreicher Übergabe werden das ZIP, die Druckskripte und die Dateiliste gelöscht/);
        assert.match(result.help, /Der entpackte Ordner mit DOCX-Dateien bleibt erhalten/);
        assert.equal(result.status, 'Druckbefehl kopiert.');
      }
    });
  }
});

test('EWH zeigt bei Zwischenablagefehlern einen markierten schreibgeschützten Druckbefehl', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'Windows' } });
    const { createEwhDocxExportApp } = await import('/tests/helpers/ewh-docx.mjs');
    const { app } = await createEwhDocxExportApp(1);
    await app.openExpectationHorizonDialog();
    await app.generateExpectationHorizons();
    const results = [];
    for (const clipboard of [undefined, { writeText: async () => { throw new DOMException('Gesperrt', 'NotAllowedError'); } }]) {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
      await app.copyExpectationHorizonPrintCommand();
      const field = app.refs.expectationHorizonPrintCommand;
      results.push({
        visible: !field.hidden && getComputedStyle(field).display !== 'none',
        readonly: field.readOnly, focused: document.activeElement === field,
        selected: field.selectionStart === 0 && field.selectionEnd === field.value.length,
        correct: field.value === app.expectationHorizonPrintExport.command,
        enabled: !app.refs.expectationHorizonPrintCopy.disabled,
        status: app.refs.expectationHorizonStatus.textContent,
      });
    }
    await app.openExpectationHorizonDialog();
    return { results, reset: app.refs.expectationHorizonPrintCommand.hidden && app.refs.expectationHorizonPrintCommand.value === '' };
  });
  for (const copy of result.results) {
    assert.ok(copy.visible && copy.readonly && copy.focused && copy.selected && copy.correct && copy.enabled);
    assert.match(copy.status, /Strg\+C/);
  }
  assert.ok(result.reset);
});

test('EWH verwirft veraltete Kopieraktionen und schaltet den Druckbutton nach einem Generierungsfehler aus', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'macOS' } });
    const { createEwhDocxExportApp } = await import('/tests/helpers/ewh-docx.mjs');
    const { app, records, downloads } = await createEwhDocxExportApp(1);
    await app.openExpectationHorizonDialog();
    await app.generateExpectationHorizons();
    let rejectCopy;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { rejectCopy = reject; }) } });
    const copying = app.copyExpectationHorizonPrintCommand();
    const copyingDisabled = app.refs.expectationHorizonPrintCopy.disabled;
    app.closeExpectationHorizonDialog();
    await app.openExpectationHorizonDialog();
    rejectCopy(new Error('Zu spät'));
    await copying;
    const ignored = app.refs.expectationHorizonStatus.textContent === '' && app.refs.expectationHorizonPrintCommand.hidden;
    await app.generateExpectationHorizons();
    Object.defineProperty(records[1], 'replacements', { configurable: true, get() { throw new Error('DOCX-Erzeugung fehlgeschlagen.'); } });
    const before = downloads.length;
    await app.generateExpectationHorizons();
    return {
      copyingDisabled, ignored, disabled: app.refs.expectationHorizonPrintCopy.disabled,
      noPartialDownload: before === downloads.length,
      noExport: app.expectationHorizonPrintExport === null,
      status: app.refs.expectationHorizonStatus.textContent,
    };
  });
  assert.ok(result.copyingDisabled && result.ignored && result.disabled && result.noPartialDownload && result.noExport);
  assert.equal(result.status, 'DOCX-Erzeugung fehlgeschlagen.');
});

test('EWH-Dateinamen behandeln Windows-Gerätenamen, Unicode und Kollisionen mit vorhandenen Nummern', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const app = Object.create(GradesApp.prototype);
    return app.makeUniqueExpectationHorizonFileNames(['CON', 'com¹', 'Anna', 'Anna', 'Anna (2)', 'A\u0308nne', 'Änne', 'x\n/y'].map((name) => ({ name }))).map((record) => record.fileName);
  });
  assert.deepEqual(result, ['_CON.docx', '_com¹.docx', 'Anna.docx', 'Anna (2).docx', 'Anna (2) (2).docx', 'Änne.docx', 'Änne (2).docx', 'x__y.docx']);
});

test('EWH-Ordner übernimmt Kurs und aktuelle BE-Werte mit Platzhaltern und sicheren Dateinamen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const app = Object.create(GradesApp.prototype);
    const contexts = [
      { course: { name: 'Mathematik', gradeLevel: 10 }, values: { yearLevel: 11, halfYear: 'h1', assessmentNumber: 2 } },
      { course: { name: 'Deutsch' }, values: { yearLevel: 12, halfYear: 'h2', assessmentNumber: 3 } },
      { course: { name: '' }, values: { yearLevel: null, halfYear: 'h1', assessmentNumber: null } },
      { course: { name: 'Ma/the: <11>' }, values: { yearLevel: 11, halfYear: 'h2', assessmentNumber: 0 } },
      { course: { name: "A\u0308nne & O'Neil %TEMP% ! $(echo test) 😀" }, values: { yearLevel: 13, halfYear: 'h2', assessmentNumber: '04' } },
    ];
    const longName = app.buildExpectationHorizonPrintFolderName({ course: { name: '物'.repeat(120) }, values: { yearLevel: 11, halfYear: 'h2', assessmentNumber: 2 } });
    return {
      names: contexts.map((context) => app.buildExpectationHorizonPrintFolderName(context)),
      longName, longBytes: new TextEncoder().encode(longName).length,
    };
  });
  assert.deepEqual(result.names, [
    'KA-Mathematik-11-1-2', 'KA-Deutsch-12-2-3', 'KA-Kurs-unbekannt-1-unbekannt',
    'KA-Ma_the_ _11_-11-2-0', "KA-Änne & O'Neil %TEMP% ! $(echo test) 😀-13-2-4",
  ]);
  assert.ok(result.longBytes <= 240);
  assert.match(result.longName, /^KA-物+-11-2-2$/);
});

test('Erneuter EWH-Export verwendet geänderte BE-Werte für den Ordner und behält den bisherigen ZIP-Namen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'Windows' } });
    const { createEwhDocxExportApp } = await import('/tests/helpers/ewh-docx.mjs');
    const { app, context, downloads } = await createEwhDocxExportApp(1);
    await app.openExpectationHorizonDialog();
    const originalZipName = app.buildExpectationHorizonZipFileName(context).replace(/\.zip$/, '');
    await app.generateExpectationHorizons();
    const first = app.expectationHorizonPrintExport;
    Object.assign(context.values, { yearLevel: 12, halfYear: 'h2', assessmentNumber: 4 });
    await app.generateExpectationHorizons();
    return { first: first.folderName, next: app.expectationHorizonPrintExport.folderName, differentCommands: first.command !== app.expectationHorizonPrintExport.command, zipNames: downloads.map((file) => file.name), originalZipName };
  });
  assert.equal(result.first, 'KA-Mathematik 11-11-1-2');
  assert.equal(result.next, 'KA-Mathematik 11-12-2-4');
  assert.ok(result.differentCommands);
  for (const name of result.zipNames) {
    assert.ok(name.startsWith(`${result.originalZipName}-TH-EWH-`));
    assert.match(name, /-TH-EWH-[a-f0-9]{32}\.zip$/);
  }
});
