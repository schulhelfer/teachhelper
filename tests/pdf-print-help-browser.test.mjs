import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

const command = 'defaults write com.microsoft.Edge UseSystemPrintDialog -bool true';
const chromeCommand = 'defaults write com.google.Chrome DisablePrintPreview -bool true';

test('Info-Button öffnet Shell-Dialog, kopiert mit Nutzeraktivierung und gibt bei Schließen und Escape den Fokus zurück', async (t) => {
  const evaluate = await openDomBrowser(t);
  const initial = await evaluate(async () => {
    const html = await (await fetch('/index.html')).text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.append(document.importNode(parsed.getElementById('pdf-print-help-dialog'), true));
    for (const path of ['/src/shared/theme.css', '/src/app/shell.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
        document.head.append(link);
      });
    }
    const { mountMerger } = await import('/src/modules/merger/index.js');
    const host = document.createElement('div');
    document.body.append(host);
    host.appendChild = (frame) => {
      frame.removeAttribute('sandbox');
      frame.style.width = '100%';
      frame.style.height = '900px';
      return Element.prototype.appendChild.call(host, frame);
    };
    const mounted = mountMerger({ host });
    const frame = mounted.frame;
    const waitFor = async (condition) => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Druckhinweis wurde nicht rechtzeitig bereit.');
    };
    await waitFor(() => frame.contentWindow.__teachhelperMergerApp);
    const { createIframeModuleShellBindings } = await import('/src/app/iframe-module-shell-bindings.js');
    const { createModuleMessageRouter } = await import('/src/app/module-message-router.js');
    const cleanups = [];
    const bindings = createIframeModuleShellBindings({ documentRef: document, view: window, appEl: host, registerCleanup: (cleanup) => cleanups.push(cleanup) });
    const router = createModuleMessageRouter({ messageTarget: window, modules: [{ role: 'merger', getFrame: () => frame }], handlers: bindings.handlers });
    const copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => copies.push({ text, active: navigator.userActivation.isActive }) } });
    const button = frame.contentDocument.getElementById('layoutPrintHelpButton');
    const dialog = document.getElementById('pdf-print-help-dialog');
    button.click();
    await waitFor(() => dialog.open);
    const copyButton = document.getElementById('pdf-print-help-copy');
    const bounds = copyButton.getBoundingClientRect();
    window.printHelpTest = { frame, button, dialog, copies, waitFor, mounted, cleanups, router };
    const printBounds = button.previousElementSibling.getBoundingClientRect();
    const infoBounds = button.getBoundingClientRect();
    const commandBounds = document.getElementById('pdf-print-help-command').getBoundingClientRect();
    const closeButton = document.getElementById('pdf-print-help-close');
    return {
      infoText: button.textContent,
      infoUnderPrint: infoBounds.top >= printBounds.bottom,
      infoCentered: Math.abs(infoBounds.x + infoBounds.width / 2 - printBounds.x - printBounds.width / 2) < 1,
      infoSmall: parseFloat(frame.contentWindow.getComputedStyle(button).fontSize) <= 14,
      copyText: copyButton.textContent,
      copyRightOfCode: bounds.x >= commandBounds.right,
      compactCode: commandBounds.height < 100,
      closeInHeader: Boolean(closeButton.closest('.dialog-header')),
      closeText: closeButton.textContent,
      noNumbering: !dialog.querySelector('ol'),
      noGlobalNote: !dialog.textContent.includes('Die Einstellung gilt für Druckvorgänge in Edge.'),
      chromeCommand: document.getElementById('pdf-print-help-chrome-command').value,
      besidePrint: button.previousElementSibling.id === 'layoutPrintButton',
      outsideLabel: !button.closest('label'),
      title: document.getElementById('pdf-print-help-title').textContent,
      command: document.getElementById('pdf-print-help-command').value,
      readonly: document.getElementById('pdf-print-help-command').readOnly,
      clipboardDeniedInModule: frame.getAttribute('allow').includes("clipboard-write 'none'"),
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  });
  assert.equal(initial.besidePrint, true);
  assert.equal(initial.outsideLabel, true);
  assert.equal(initial.title, 'macOS-Systemdruckdialog');
  assert.equal(initial.chromeCommand, chromeCommand);
  assert.equal(initial.infoText, 'ℹ️');
  assert.equal(initial.infoUnderPrint, true);
  assert.equal(initial.infoCentered, true);
  assert.equal(initial.infoSmall, true);
  assert.equal(initial.copyText, '📋');
  assert.equal(initial.copyRightOfCode, true);
  assert.equal(initial.compactCode, true);
  assert.equal(initial.closeInHeader, true);
  assert.equal(initial.closeText, '❌');
  assert.equal(initial.noNumbering, true);
  assert.equal(initial.noGlobalNote, true);
  assert.equal(initial.command, command);
  assert.equal(initial.readonly, true);
  assert.equal(initial.clipboardDeniedInModule, true);
  await evaluate.dispatchMouseEvent({ type: 'mousePressed', x: initial.x, y: initial.y, button: 'left', clickCount: 1 });
  await evaluate.dispatchMouseEvent({ type: 'mouseReleased', x: initial.x, y: initial.y, button: 'left', clickCount: 1 });
  const chromeBounds = await evaluate(async () => {
    await window.printHelpTest.waitFor(() => document.getElementById('pdf-print-help-status').textContent === 'Befehl kopiert.');
    const bounds = document.getElementById('pdf-print-help-chrome-copy').getBoundingClientRect();
    const codeBounds = document.getElementById('pdf-print-help-chrome-command').getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, rightOfCode: bounds.x >= codeBounds.right };
  });
  assert.equal(chromeBounds.rightOfCode, true);
  await evaluate.dispatchMouseEvent({ type: 'mousePressed', x: chromeBounds.x, y: chromeBounds.y, button: 'left', clickCount: 1 });
  await evaluate.dispatchMouseEvent({ type: 'mouseReleased', x: chromeBounds.x, y: chromeBounds.y, button: 'left', clickCount: 1 });
  const copied = await evaluate(async () => {
    const { frame, button, dialog, copies, waitFor } = window.printHelpTest;
    await waitFor(() => copies.length === 2 && document.getElementById('pdf-print-help-status').textContent === 'Befehl kopiert.');
    const remainsOpen = dialog.open;
    document.getElementById('pdf-print-help-close').click();
    await waitFor(() => frame.contentDocument.activeElement === button);
    const focusReturned = document.activeElement === frame;
    frame.contentDocument.getElementById('tool-tab-merge').click();
    window.printHelpTest.button = frame.contentDocument.getElementById('mergePrintHelpButton');
    window.printHelpTest.button.click();
    await waitFor(() => dialog.open);
    return { copies, remainsOpen, focusReturned, statusReset: document.getElementById('pdf-print-help-status').textContent === '' };
  });
  assert.deepEqual(copied.copies, [{ text: command, active: true }, { text: chromeCommand, active: true }]);
  assert.equal(copied.remainsOpen, true);
  assert.equal(copied.focusReturned, true);
  assert.equal(copied.statusReset, true);
  await evaluate.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await evaluate.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escaped = await evaluate(async () => {
    const { frame, button, dialog, waitFor, mounted, cleanups, router } = window.printHelpTest;
    await waitFor(() => !dialog.open && frame.contentDocument.activeElement === button);
    const result = { closed: !dialog.open, focusReturned: document.activeElement === frame };
    const toolFocus = [];
    for (const tool of ['layout', 'merge', 'rotate', 'split']) {
      frame.contentDocument.getElementById(`tool-tab-${tool}`).click();
      const helpButton = frame.contentDocument.getElementById(`${tool}PrintHelpButton`);
      helpButton.click();
      await waitFor(() => dialog.open);
      document.getElementById('pdf-print-help-close').click();
      await waitFor(() => frame.contentDocument.activeElement === helpButton);
      toolFocus.push(document.activeElement === frame && helpButton.previousElementSibling.id === `${tool}PrintButton`);
    }
    result.toolFocus = toolFocus;
    frame.contentDocument.getElementById('tool-tab-merge').click();
    button.click();
    await waitFor(() => dialog.open);
    router.dispose();
    cleanups.forEach((cleanup) => cleanup());
    result.disposedClosed = !dialog.open;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    result.disposedStaysClosed = !dialog.open;
    mounted.dispose();
    return result;
  });
  assert.deepEqual(escaped, { closed: true, focusReturned: true, toolFocus: [true, true, true, true], disposedClosed: true, disposedStaysClosed: true });
});

test('fehlende oder gesperrte Zwischenablage markiert den festen Befehl; verspätete Kopierantworten verändern den Dialog nicht', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await (await fetch('/index.html')).text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.append(document.importNode(parsed.getElementById('pdf-print-help-dialog'), true));
    const { createPdfPrintHelpController } = await import('/src/app/pdf-print-help-controller.js');
    const controller = createPdfPrintHelpController({ documentRef: document, view: window });
    const dialog = document.getElementById('pdf-print-help-dialog');
    const status = document.getElementById('pdf-print-help-status');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    const failures = [];
    for (const [inputId, copyId] of [['pdf-print-help-command', 'pdf-print-help-copy'], ['pdf-print-help-chrome-command', 'pdf-print-help-chrome-copy']]) {
      const input = document.getElementById(inputId);
      const button = document.getElementById(copyId);
      for (const clipboard of [undefined, { writeText: async () => { throw new DOMException('Gesperrt', 'NotAllowedError'); } }]) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        controller.open(null);
        button.click();
        await settle();
        failures.push({ selected: input.value.slice(input.selectionStart, input.selectionEnd), focused: document.activeElement === input, message: status.textContent, enabled: !button.disabled, open: dialog.open });
        dialog.close();
        await settle();
      }
    }
    const button = document.getElementById('pdf-print-help-copy');
    let resolveCopy;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve) => { resolveCopy = resolve; }) } });
    controller.open(null);
    button.click();
    dialog.close();
    await settle();
    controller.open(null);
    resolveCopy();
    await settle();
    const reopenStatus = status.textContent;
    button.click();
    controller.dispose();
    resolveCopy();
    await settle();
    controller.open(null);
    return { failures, reopenStatus, disposedClosed: !dialog.open, disposedStatus: status.textContent };
  });
  for (const [index, failure] of result.failures.entries()) {
    assert.equal(failure.selected, index < 2 ? command : chromeCommand);
    assert.equal(failure.focused, true);
    assert.equal(failure.message, 'Bitte den markierten Befehl manuell kopieren (auf dem Mac mit ⌘C).');
    assert.equal(failure.enabled, true);
    assert.equal(failure.open, true);
  }
  assert.equal(result.reopenStatus, '');
  assert.equal(result.disposedClosed, true);
  assert.equal(result.disposedStatus, '');
});
