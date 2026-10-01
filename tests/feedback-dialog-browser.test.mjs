import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('feedback presentation is reversible and preserves existing controls and labels', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { applyFeedbackDialog } = await import('/src/shared/feedback-dialog.js');
    const dialog = document.createElement('dialog');
    const content = document.createElement('form');
    const title = document.createElement('h3');
    const body = document.createElement('p');
    const actions = document.createElement('div');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Behalten';
    body.textContent = '<img src=x onerror=alert(1)>\nZweite Zeile';
    let clicks = 0;
    button.addEventListener('click', () => { clicks += 1; });
    actions.append(button);
    content.append(title, body, actions);
    dialog.append(content);
    document.body.append(dialog);
    const options = { dialog, content, title, body, actions: [actions] };
    for (const variant of ['warn', 'error', 'warn']) {
      applyFeedbackDialog({ ...options, variant });
    }
    const styled = {
      icons: dialog.querySelectorAll('.feedback-dialog-icon').length,
      icon: dialog.querySelector('.feedback-dialog-icon').textContent,
      hiddenIcon: dialog.querySelector('.feedback-dialog-icon').getAttribute('aria-hidden'),
      titleLabel: dialog.getAttribute('aria-labelledby') === title.id,
      bodyLabel: dialog.getAttribute('aria-describedby') === body.id,
      role: dialog.getAttribute('role'),
      safe: !body.querySelector('img'),
    };
    applyFeedbackDialog({ ...options, variant: 'info' });
    button.click();
    const restored = {
      classes: dialog.className,
      icons: dialog.querySelectorAll('.feedback-dialog-icon').length,
      titleId: title.hasAttribute('id'),
      role: dialog.hasAttribute('role'),
      clicks,
      children: content.children.length,
      text: body.textContent,
    };
    title.id = 'existing-title';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('role', 'dialog');
    applyFeedbackDialog({ ...options, variant: 'error' });
    applyFeedbackDialog({ ...options, variant: 'info' });
    return { styled, restored, originalLabel: dialog.getAttribute('aria-labelledby'), originalRole: dialog.getAttribute('role') };
  });
  assert.deepEqual(result.styled, {
    icons: 1, icon: '⚠️', hiddenIcon: 'true', titleLabel: true, bodyLabel: true, role: 'alertdialog', safe: true,
  });
  assert.deepEqual(result.restored, {
    classes: '', icons: 0, titleId: false, role: false, clicks: 1, children: 3, text: '<img src=x onerror=alert(1)>\nZweite Zeile',
  });
  assert.equal(result.originalLabel, 'existing-title');
  assert.equal(result.originalRole, 'dialog');
});

test('all six dialog integrations share their appearance across themes and viewport sizes', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 860, height: 740 } });
  const snapshots = new Map();
  for (const module of ['shell', 'seatplan', 'planning', 'grades', 'qr', 'merger']) {
    await evaluate(async ({ module }) => {
      const path = module === 'shell' ? '/index.html' : `/src/modules/${module}/app.html`;
      const source = await fetch(path).then(response => response.text());
      const fixture = new DOMParser().parseFromString(source, 'text/html');
      document.body.replaceChildren(...fixture.body.childNodes);
      document.head.querySelectorAll('style').forEach(style => style.remove());
      for (const link of fixture.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.getAttribute('href'), new URL(path, location.origin));
        const style = document.createElement('style');
        style.textContent = await fetch(url).then(response => response.text());
        document.head.append(style);
      }
      const slowTransitions = document.createElement('style');
      slowTransitions.textContent = '.feedback-dialog, .feedback-dialog button { transition-duration: 2s !important; transition-delay: 100ms !important; }';
      document.head.append(slowTransitions);
      const { createMessageApi } = await import('/src/shared/messages.js');
      const { applyFeedbackDialog } = await import('/src/shared/feedback-dialog.js');
      const payload = '<img src=x onerror=alert(1)>\n' + 'Lange Fehlermeldung '.repeat(35);
      if (module === 'shell') {
        const api = createMessageApi(document);
        api.showMessage(payload, 'warn');
      } else if (module === 'seatplan') {
        const script = await fetch('/src/modules/seatplan/app.js').then(response => response.text());
        const start = script.indexOf('          const MESSAGE_VARIANTS = {');
        const end = script.indexOf('          const nowMs =', start);
        const showMessage = Function('createMessageApi', 'applyFeedbackDialog', script.slice(start, end) + '\nreturn showMessage;')(createMessageApi, applyFeedbackDialog);
        showMessage(payload, 'warn');
      } else if (module === 'planning' || module === 'grades') {
        const exports = await import(`/src/modules/${module}/app.js?dom-test`);
        const App = exports[module === 'planning' ? 'PlanningApp' : 'GradesApp'];
        const app = Object.create(App.prototype);
        app.refs = Object.fromEntries([...document.querySelectorAll('[id^="message-dialog"]')].map(element => [
          element.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), element,
        ]));
        app.openDialog = dialog => dialog.showModal();
        app.closeDialog = dialog => dialog.close();
        app.refs.messageDialogForm.addEventListener('submit', event => {
          event.preventDefault();
          app._resolveMessageDialog('ok');
        });
        window.feedbackTestApp = app;
        window.feedbackTestPromise = app.showInfoMessage(payload, 'Hinweis', { variant: 'warn' });
      } else if (module === 'qr') {
        await import('/src/modules/qr/app.js');
        document.getElementById('generatorLinkInput').value = '';
        document.getElementById('generateButton').click();
        document.getElementById('messageText').textContent = payload;
      } else {
        await import('/src/modules/merger/app.js');
        document.getElementById('mergeStartButton').dispatchEvent(new Event('click'));
        document.getElementById('resultMessage').textContent = payload;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { module });
    for (const width of [860, 320]) {
      await evaluate.setViewport({ width, height: 740 });
      for (const theme of ['light', 'dark']) {
        const snapshot = await evaluate(async ({ theme, module }) => {
          document.documentElement.dataset.theme = theme;
          const dialog = document.querySelector('.feedback-dialog');
          if (!dialog?.open) throw new Error(`${module}: Feedback dialog must be open; dialogs=${[...document.querySelectorAll('dialog')].map(node => `${node.id}:${node.open}:${node.className}`).join(',')}`);
          for (const animation of dialog.getAnimations({ subtree: true })) {
            if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish();
          }
          await new Promise(resolve => requestAnimationFrame(resolve));
          const body = dialog.querySelector('.feedback-dialog-body');
          const button = dialog.querySelector('button.feedback-dialog-actions, .feedback-dialog-actions button:not([hidden]):not(.hidden)');
          const icon = dialog.querySelector('.feedback-dialog-icon');
          const style = getComputedStyle(dialog);
          const bodyStyle = getComputedStyle(body);
          const buttonStyle = getComputedStyle(button);
          const rect = dialog.getBoundingClientRect();
          return {
            width: rect.width, radius: style.borderRadius, background: style.backgroundColor,
            border: style.borderTopColor, font: bodyStyle.fontSize, lineHeight: bodyStyle.lineHeight,
            textColor: bodyStyle.color, buttonBackgroundImage: buttonStyle.backgroundImage,
            buttonBackgroundColor: buttonStyle.backgroundColor,
            buttonRadius: buttonStyle.borderRadius, buttonFont: buttonStyle.fontSize,
            iconSize: getComputedStyle(icon).fontSize, icon: icon.textContent,
            iconCount: dialog.querySelectorAll('.feedback-dialog-icon').length,
            safe: !body.querySelector('img'), fits: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          };
        }, { theme, module });
        assert.equal(snapshot.icon, '⚠️', module);
        assert.equal(snapshot.iconCount, 1, module);
        assert.equal(snapshot.safe, true, module);
        assert.equal(snapshot.fits, true, module);
        const key = `${width}-${theme}`;
        if (!snapshots.has(key)) snapshots.set(key, snapshot);
        else assert.deepEqual(snapshot, snapshots.get(key), `${module}: ${key}`);
      }
    }
    await evaluate(async ({ module }) => {
      const dialog = document.querySelector('.feedback-dialog');
      if (module === 'planning' || module === 'grades') {
        document.getElementById('message-dialog-ok').click();
        await window.feedbackTestPromise;
        const choice = window.feedbackTestApp.showChoiceMessage('Entwurf behalten oder verwerfen?', {
          warning: true, alternateText: 'Verwerfen', dangerAlternate: true,
        });
        if (dialog.querySelectorAll('.feedback-dialog-icon').length !== 1) throw new Error('Warning choices need one icon');
        if (!document.getElementById('message-dialog-discard-top').classList.contains('danger-action')) {
          throw new Error('Destructive action must preserve its original styling');
        }
        window.feedbackTestApp._resolveMessageDialog('discard');
        if (await choice !== 'discard') throw new Error('Choice return value must be preserved');
        window.feedbackTestPromise = window.feedbackTestApp.showInfoMessage('Information');
        if (dialog.classList.contains('feedback-dialog') || dialog.querySelector('.feedback-dialog-icon')) {
          throw new Error('Information must restore the original presentation');
        }
        document.getElementById('message-dialog-ok').click();
        await window.feedbackTestPromise;
      } else {
        dialog.querySelector('button.feedback-dialog-actions, .feedback-dialog-actions button:not([hidden]):not(.hidden)').click();
        await new Promise(resolve => setTimeout(resolve, 260));
      }
      if (dialog.open) throw new Error('Dialog must close through its existing controls');
      if (module === 'qr') {
        window.__teachhelperQrApp.activateTutorialDemo();
        const originalOpen = window.open;
        let opened = '';
        window.open = url => { opened = url; return null; };
        document.getElementById('decodedLink').click();
        const openButton = document.getElementById('externalLinkOpenButton');
        const closeButton = document.getElementById('messageCloseButton');
        if (!dialog.open || openButton.classList.contains('hidden')) throw new Error('Link action must remain available');
        if (dialog.querySelectorAll('.feedback-dialog-icon').length !== 1) throw new Error('Repeated warning must not duplicate the icon');
        if (getComputedStyle(openButton).backgroundImage === getComputedStyle(closeButton).backgroundImage) {
          throw new Error('Link action must retain its primary color');
        }
        openButton.click();
        window.open = originalOpen;
        if (opened !== 'https://www.tagesschau.de/' || dialog.open) throw new Error('Link action must open the selected URL and close the dialog');
      }
    }, { module });
  }
});

test('shared modal errors stay above open dialogs, restore focus and preserve the queue and toast path', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createMessageApi } = await import('/src/shared/messages.js');
    const underlying = document.createElement('dialog');
    const input = document.createElement('input');
    underlying.append(input);
    document.body.append(underlying);
    underlying.showModal();
    input.focus();
    const api = createMessageApi(document);
    const first = api.showMessage('Erster Fehler', 'error');
    api.showMessage('Zweite Warnung', 'warn', { enqueue: true });
    const initial = {
      modal: first.matches(':modal'), focus: document.activeElement === first.querySelector('button'),
      underlyingOpen: underlying.open, count: document.querySelectorAll('.feedback-dialog').length,
    };
    first.querySelector('button').click();
    await new Promise(resolve => setTimeout(resolve, 260));
    const second = document.querySelector('.feedback-dialog');
    const queued = { text: second.querySelector('.message-body').textContent, modal: second.matches(':modal') };
    second.dispatchEvent(new Event('cancel', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 260));
    const restored = { focus: document.activeElement === input, underlyingOpen: underlying.open, count: document.querySelectorAll('.feedback-dialog').length };
    underlying.close();
    const toast = api.showMessage('Toast-Warnung', 'warn', { presentation: 'toast', durationMs: 5000 });
    const info = api.showMessage('Reine Information', 'info');
    return {
      initial, queued, restored,
      toast: { className: toast.className, icon: toast.querySelector('.toast-icon').textContent, feedback: toast.classList.contains('feedback-dialog') },
      info: { tag: info.tagName, icon: info.querySelector('.message-icon').textContent, feedback: info.classList.contains('feedback-dialog') },
    };
  });
  assert.deepEqual(result.initial, { modal: true, focus: true, underlyingOpen: true, count: 1 });
  assert.deepEqual(result.queued, { text: 'Zweite Warnung', modal: true });
  assert.deepEqual(result.restored, { focus: true, underlyingOpen: true, count: 0 });
  assert.deepEqual(result.toast, { className: 'toast-message message-warn', icon: '⚠️', feedback: false });
  assert.deepEqual(result.info, { tag: 'DIV', icon: 'ℹ️', feedback: false });
});
