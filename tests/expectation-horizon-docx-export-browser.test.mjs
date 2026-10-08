import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

function assertDocuments(entries, taskCount) {
  assert.deepEqual(entries.map((entry) => entry.name), ['Anna Beispiel.docx', 'Ben Beispiel.docx']);
  for (const entry of entries) {
    assert.equal(entry.rows.length, taskCount + 2);
    assert.deepEqual(entry.rows[0], ['Nr.', 'Erwartete Prüfungsleistungen', 'AFB', 'BE1', 'BE2']);
    for (let index = 0; index < taskCount; index += 1) {
      const row = entry.rows[index + 1];
      assert.deepEqual([row[0], ...row.slice(2)], [`(${index + 1})`, ['I', 'II', 'III'][index % 3], String(index + 2), String(index + 1)]);
      assert.equal(row[1], index === 0 ? 'Eigene Erwartung mit Formel: ' : `Eigene Erwartung ${index + 1}: Aufgabe vollständig bearbeiten.`);
    }
    const sum = entry.rows.at(-1);
    assert.deepEqual([sum[0], ...sum.slice(2)], ['∑', '', String(taskCount * (taskCount + 3) / 2), String(taskCount * (taskCount + 1) / 2)]);
    assert.match(entry.text, /Gut bearbeitet\./);
    assert.ok(entry.text.includes(`Individueller Kommentar für ${entry.name.replace(/\.docx$/, '')}.`));
    assert.match(entry.text, /Prozentgrenze90%75%60%/);
    assert.deepEqual(entry.math, [1, 2, 1]);
    assert.ok(entry.bold > 0);
    assert.ok(entry.imageDescriptions.includes('Prozentrang 75'));
    assert.ok(entry.images.some((signature) => JSON.stringify(signature) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10])));
  }
}

test('EWH exportiert vollständige DOCX-Dateien mit eigenen Inhalten im ZIP', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  for (const taskCount of [1, 9, 13]) {
    await t.test(`${taskCount} Aufgaben mit Formeln, Kommentaren und Prozentrang`, async () => {
      const result = await evaluate(async (count) => {
        const { createEwhDocxExportApp, readEwhDocx } = await import('/tests/helpers/ewh-docx.mjs');
        const { prepareDocxTemplate } = await import('/src/shared/docx-template.js');
        const fixture = await createEwhDocxExportApp(count);
        window.ewhExportFixture = fixture;
        const { app, downloads, context } = fixture;
        await app.openExpectationHorizonDialog();
        const radioGroups = [...new Set([...app.refs.expectationHorizonDialog.querySelectorAll('input[type="radio"]')].map((input) => input.name))];
        const exporting = app.generateExpectationHorizons();
        const disabled = app.refs.expectationHorizonGenerate.disabled;
        await exporting;
        const [download] = downloads;
        const archive = await prepareDocxTemplate(download.data);
        const entries = [];
        for (const entry of archive.entries.filter((entry) => entry.name.endsWith('.docx'))) entries.push({ name: entry.name, ...await readEwhDocx(entry.data) });
        return {
          entries, radioGroups, disabled, enabled: !app.refs.expectationHorizonGenerate.disabled,
          open: app.refs.expectationHorizonDialog.open, downloads: downloads.length,
          helpers: archive.entries.filter((entry) => !entry.name.endsWith('.docx')).map((entry) => entry.name),
          name: download.name, expectedName: app.expectationHorizonPrintExport.zipFileName,
          type: download.type, status: app.refs.expectationHorizonStatus.textContent,
        };
      }, taskCount);
      assertDocuments(result.entries, taskCount);
      assert.deepEqual(result.radioGroups, ['expectation-horizon-percent-boundary-mode']);
      assert.equal(result.downloads, 1);
      assert.equal(result.name, result.expectedName);
      assert.equal(result.type, 'application/zip');
      assert.ok(result.disabled && result.enabled && result.open);
      assert.deepEqual(result.helpers, ['TeachHelper-Drucken.js', 'TeachHelper-Drucken.applescript', 'TeachHelper-Dateiliste.txt']);
      assert.match(result.name, /-TH-EWH-[a-f0-9]{32}\.zip$/);
      assert.equal(result.status, '2 DOCX-Dateien als ZIP-Download gestartet.');
    });
  }
  await t.test('Fehler beim zweiten Dokument verhindert einen unvollständigen Download und erlaubt Wiederholung', async () => {
    const result = await evaluate(async () => {
      const { app, downloads, records } = window.ewhExportFixture;
      await app.openExpectationHorizonDialog();
      downloads.length = 0;
      const replacements = records[1].replacements;
      const statuses = [];
      const originalStatus = app.setExpectationHorizonStatus;
      app.setExpectationHorizonStatus = function (message, type) {
        statuses.push(message);
        originalStatus.call(this, message, type);
      };
      Object.defineProperty(records[1], 'replacements', { configurable: true, get() { throw new Error('DOCX-Erzeugung fehlgeschlagen.'); } });
      let failure;
      try {
        await app.generateExpectationHorizons();
        failure = {
          downloads: downloads.length, open: app.refs.expectationHorizonDialog.open,
          error: app.refs.expectationHorizonStatus.classList.contains('is-error'),
          message: app.refs.expectationHorizonStatus.textContent,
          enabled: !app.refs.expectationHorizonGenerate.disabled,
          generating: app.expectationHorizonGenerating,
          firstDocumentCompleted: statuses.includes('Erzeuge DOCX-Dateien... 1/2'),
        };
      } finally {
        Object.defineProperty(records[1], 'replacements', { configurable: true, writable: true, value: replacements });
        app.setExpectationHorizonStatus = originalStatus;
      }
      await app.generateExpectationHorizons();
      return { failure, downloads: downloads.length, open: app.refs.expectationHorizonDialog.open };
    });
    assert.deepEqual(result.failure, {
      downloads: 0, open: true, error: true, message: 'DOCX-Erzeugung fehlgeschlagen.',
      enabled: true, generating: false, firstDocumentCompleted: true,
    });
    assert.equal(result.downloads, 1);
    assert.equal(result.open, true);
  });
  await t.test('Vorlagendownload liefert die bearbeitete DOCX-Vorlage mit Summenplatzhaltern', async () => {
    const result = await evaluate(async () => {
      const { readEwhDocx } = await import('/tests/helpers/ewh-docx.mjs');
      const { app, downloads } = window.ewhExportFixture;
      await app.openExpectationHorizonDialog();
      downloads.length = 0;
      await app.downloadCurrentExpectationHorizonDialogTemplate();
      const [file] = downloads;
      return { name: file.name, type: file.type, signature: [...file.data.slice(0, 2)], ...await readEwhDocx(file.data) };
    });
    assert.equal(result.name, 'Eigene Vorlage.docx');
    assert.equal(result.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.deepEqual(result.signature, [80, 75]);
    assert.equal(result.rows.length, 15);
    assert.deepEqual(result.rows.at(-1).slice(3), ['<< BE1 >>', '<< BE2 >>']);
    assert.ok(result.rows.slice(1, -1).every((row) => row[1].startsWith('Eigene Erwartung') && row[4] === ''));
    assert.deepEqual(result.math, [1, 2, 1]);
  });
});

test('EWH-DOCX-Erzeugung funktioniert unter echter CSP offline aus dem PWA-Cache', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  await evaluate(async () => {
    const { createEwhDocxExportApp } = await import('/tests/helpers/ewh-docx.mjs');
    window.ewhExportFixture = await createEwhDocxExportApp(13);
    window.offlineDocxViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.offlineDocxViolations.push(event.violatedDirective));
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const required = [
      '/src/shared/file-processing-worker.js', '/src/shared/docx-template.js',
      '/src/shared/file-guards.js', '/src/shared/worker-origin-fallback.js',
      '/src/modules/grades/expectation-horizon-template.docx',
      '/src/modules/grades/expectation-horizon-print.js',
    ];
    const deadline = Date.now() + 15000;
    while (!(await Promise.all(required.map((url) => caches.match(url)))).every(Boolean)) {
      if (Date.now() > deadline) throw new Error('DOCX-Dateien wurden nicht vom Service Worker vorab gespeichert.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
  await evaluate.setNetworkOffline(true);
  try {
    const result = await evaluate(async () => {
      const { prepareDocxTemplate } = await import('/src/shared/docx-template.js');
      const { readEwhDocx } = await import('/tests/helpers/ewh-docx.mjs');
      const { app, downloads } = window.ewhExportFixture;
      const bundledTemplate = await fetch('/src/modules/grades/expectation-horizon-template.docx');
      await app.openExpectationHorizonDialog();
      await app.generateExpectationHorizons();
      const archive = await prepareDocxTemplate(downloads[0].data);
      const entries = [];
      for (const entry of archive.entries.filter((entry) => entry.name.endsWith('.docx'))) entries.push({ name: entry.name, ...await readEwhDocx(entry.data) });
      return {
        offline: !navigator.onLine, templateAvailable: bundledTemplate.ok,
        entries, downloads: downloads.length, violations: window.offlineDocxViolations,
      };
    });
    assert.ok(result.offline && result.templateAvailable);
    assert.equal(result.downloads, 1);
    assertDocuments(result.entries, 13);
    assert.deepEqual(result.violations, []);
  } finally {
    await evaluate.setNetworkOffline(false);
  }
});
