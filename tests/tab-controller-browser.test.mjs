import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('alte PDF-Tools-Modulfenster öffnen die Planung ohne das entfernte Modul', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await fetch('/index.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    window.history.replaceState(null, '', '/index.html?tab=merger&window=module');
    await import('/src/app/bootstrap.js');
    const deadline = performance.now() + 5000;
    while (!document.getElementById('app').classList.contains('app-js-ready') && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      ready: document.getElementById('app').classList.contains('app-js-ready'),
      activeTab: document.querySelector('.tab-button.active[data-tab-target]')?.dataset.tabTarget,
      pdfTab: Boolean(document.getElementById('tab-merger')),
      pdfFrames: document.querySelectorAll('iframe[src*="/merger/"]').length,
    };
  });
  assert.deepEqual(result, { ready: true, activeTab: 'planning', pdfTab: false, pdfFrames: 0 });
});

test('tab transitions settle rapid and overflow navigation on the latest requested tab', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, {
    viewport: { width: 1800, height: 900, mobile: false },
  });
  const result = await evaluate(async ({ token }) => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const waitFor = async (condition, description) => {
      const deadline = performance.now() + 4000;
      while (!condition()) {
        if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
        await nextFrame();
      }
    };
    const html = await fetch('/index.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    const css = await Promise.all(
      [...fixture.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => fetch(link.getAttribute('href')).then((response) => response.text()))
    );
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.append(style);
    document.body.replaceChildren(...fixture.body.childNodes);
    sessionStorage.setItem('teachhelper:pwa-install-prompt-dismissed', '1');
    await import(`/src/main.js?tab-controller-browser=${token}`);

    const app = document.getElementById('app');
    const nav = document.querySelector('.tab-nav');
    const indicator = document.querySelector('.tab-indicator');
    const trigger = document.getElementById('more-tools-trigger');
    const menu = document.getElementById('more-tools-menu');
    const planningButton = document.getElementById('tab-planning');
    const duplicateCheckButton = document.getElementById('tab-duplicate-check');
    const qrMenuItem = menu.querySelector('[data-more-tools-target="qr"]');
    const activeTab = () => nav.querySelector('.tab-button.active[data-tab-target]')?.dataset.tabTarget || '';
    const transitionClasses = () => [...app.children]
      .filter((element) => element.classList.contains('tab-switch-enter') || element.classList.contains('tab-switch-leave'))
      .length;
    const indicatorMatches = (element) => {
      const indicatorRect = indicator.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      return Math.abs(indicatorRect.left - elementRect.left) < 2
        && Math.abs(indicatorRect.top - elementRect.top) < 2
        && Math.abs(indicatorRect.width - elementRect.width) < 2
        && Math.abs(indicatorRect.height - elementRect.height) < 2;
    };
    const transitionIdle = () => !app.classList.contains('is-tab-switching') && transitionClasses() === 0;
    const tabSettled = (target, indicatorTarget) => (
      activeTab() === target && transitionIdle() && indicatorMatches(indicatorTarget)
    );

    await waitFor(() => app.classList.contains('app-js-ready') && activeTab() === 'planning', 'planning startup');

    nav.style.flex = '0 0 1400px';
    nav.style.width = '1400px';
    nav.style.maxWidth = '1400px';
    window.dispatchEvent(new Event('resize'));
    await waitFor(() => !nav.classList.contains('is-tools-condensed') && tabSettled('planning', planningButton), 'wide tab layout');

    document.getElementById('tab-groups').click();
    document.getElementById('tab-qr').click();
    duplicateCheckButton.click();
    await waitFor(() => tabSettled('duplicate-check', duplicateCheckButton), 'the last of the rapid tab switches');
    const rapid = {
      activeTab: activeTab(),
      appClass: app.classList.contains('app-tab-duplicate-check'),
      switching: app.classList.contains('is-tab-switching'),
      transitionClasses: transitionClasses(),
      indicatorMatches: indicatorMatches(duplicateCheckButton),
    };

    duplicateCheckButton.click();
    await nextFrame();
    await waitFor(() => tabSettled('duplicate-check', duplicateCheckButton), 'reselection of the active tab');
    const repeated = {
      activeTab: activeTab(),
      switching: app.classList.contains('is-tab-switching'),
      transitionClasses: transitionClasses(),
    };

    nav.style.flex = '0 0 430px';
    nav.style.width = '430px';
    nav.style.maxWidth = '430px';
    window.visualViewport?.dispatchEvent(new Event('resize'));
    await waitFor(() => !qrMenuItem.hidden && trigger.classList.contains('active')
      && tabSettled('duplicate-check', trigger), 'the QR tab in the overflow menu');
    trigger.click();
    await waitFor(() => !menu.hidden, 'the open overflow menu');
    const qrWasOverflowed = !qrMenuItem.hidden;
    qrMenuItem.click();
    await waitFor(() => menu.hidden && trigger.classList.contains('active')
      && tabSettled('qr', trigger), 'QR navigation from the overflow menu');
    const overflow = {
      qrWasOverflowed,
      activeTab: activeTab(),
      menuClosed: menu.hidden,
      triggerActive: trigger.classList.contains('active'),
      switching: app.classList.contains('is-tab-switching'),
      transitionClasses: transitionClasses(),
      indicatorMatches: indicatorMatches(trigger),
    };

    return { rapid, repeated, overflow };
  }, { token: Date.now() });

  assert.deepEqual(result.rapid, {
    activeTab: 'duplicate-check',
    appClass: true,
    switching: false,
    transitionClasses: 0,
    indicatorMatches: true,
  });
  assert.deepEqual(result.repeated, {
    activeTab: 'duplicate-check',
    switching: false,
    transitionClasses: 0,
  });
  assert.deepEqual(result.overflow, {
    qrWasOverflowed: true,
    activeTab: 'qr',
    menuClosed: true,
    triggerActive: true,
    switching: false,
    transitionClasses: 0,
    indicatorMatches: true,
  });
});
