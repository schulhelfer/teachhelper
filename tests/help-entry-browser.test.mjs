import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('the Grades help button opens the shared shell help entry', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async ({ token }) => {
    const waitFor = async (resolve, timeout = 15000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = resolve();
        if (value) return value;
        await new Promise(done => window.setTimeout(done, 25));
      }
      throw new Error('Timed out waiting for Grades help entry');
    };
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    await import(`/src/main.js?help-entry-browser=${token}`);
    document.getElementById('tab-grades').click();
    const frame = await waitFor(() => document.querySelector('#grades-host iframe'));
    await new Promise(done => {
      frame.addEventListener('load', done, { once: true });
      frame.src = `/?help-entry-frame=${token}`;
    });
    const gradesHtml = await fetch('/src/modules/grades/app.html').then(response => response.text());
    const gradesFixture = new DOMParser().parseFromString(gradesHtml, 'text/html');
    gradesFixture.querySelectorAll('script').forEach(script => script.remove());
    const frameDocument = frame.contentDocument;
    frameDocument.body.replaceChildren(
      ...Array.from(gradesFixture.body.childNodes, node => frameDocument.importNode(node, true))
    );
    await frame.contentWindow.eval(`import('/src/modules/grades/app.js?help-entry-browser=${token}')`);
    await waitFor(() => (
      frame.contentWindow?.__teachhelperGradesTutorial
      || frame.contentDocument?.body?.dataset?.initializationError
    ));
    if (!frame.contentWindow?.__teachhelperGradesTutorial) {
      throw new Error(
        `Grades initialization failed: ${frame.contentDocument?.body?.dataset?.initializationError || 'unknown'}`
      );
    }
    const helpButton = await waitFor(() => frame.contentDocument?.getElementById('view-tutorial-btn'));
    helpButton.click();
    const dialog = await waitFor(() => {
      const candidate = document.getElementById('help-entry-dialog');
      return candidate?.open || candidate?.hasAttribute('open') ? candidate : null;
    });
    const tutorialAction = document.getElementById('help-entry-tutorial');
    const helpAction = document.getElementById('help-entry-help');
    return {
      dialogOpen: Boolean(dialog.open || dialog.hasAttribute('open')),
      dialogTitle: document.getElementById('help-entry-dialog-title')?.textContent,
      tutorialActionAvailable: Boolean(tutorialAction && !tutorialAction.hidden),
      helpActionAvailable: Boolean(helpAction && !helpAction.hidden),
    };
  }, { token: Date.now() });

  assert.equal(result.dialogOpen, true);
  assert.equal(result.dialogTitle, 'Hilfe');
  assert.equal(result.tutorialActionAvailable, true);
  assert.equal(result.helpActionAvailable, true);
});
