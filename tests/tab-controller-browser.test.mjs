import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('tab transitions settle rapid and overflow navigation on the latest requested tab', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, {
    viewport: { width: 1800, height: 900, mobile: false },
  });
  const result = await evaluate(async ({ token }) => {
    const wait = (delay = 0) => new Promise((done) => window.setTimeout(done, delay));
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
    await wait(320);

    const app = document.getElementById('app');
    const nav = document.querySelector('.tab-nav');
    const indicator = document.querySelector('.tab-indicator');
    const trigger = document.getElementById('more-tools-trigger');
    const menu = document.getElementById('more-tools-menu');
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

    nav.style.flex = '0 0 1400px';
    nav.style.width = '1400px';
    nav.style.maxWidth = '1400px';
    window.dispatchEvent(new Event('resize'));
    await wait(240);

    document.getElementById('tab-merger').click();
    document.getElementById('tab-qr').click();
    document.getElementById('tab-duplicate-check').click();
    await wait(850);
    const rapid = {
      activeTab: activeTab(),
      appClass: app.classList.contains('app-tab-duplicate-check'),
      switching: app.classList.contains('is-tab-switching'),
      transitionClasses: transitionClasses(),
      indicatorMatches: indicatorMatches(document.getElementById('tab-duplicate-check')),
    };

    document.getElementById('tab-duplicate-check').click();
    await wait(240);
    const repeated = {
      activeTab: activeTab(),
      switching: app.classList.contains('is-tab-switching'),
      transitionClasses: transitionClasses(),
    };

    nav.style.flex = '0 0 430px';
    nav.style.width = '430px';
    nav.style.maxWidth = '430px';
    window.visualViewport?.dispatchEvent(new Event('resize'));
    await wait(240);
    trigger.click();
    const qrMenuItem = menu.querySelector('[data-more-tools-target="qr"]');
    const qrWasOverflowed = Boolean(qrMenuItem && !qrMenuItem.hidden);
    qrMenuItem?.click();
    await wait(520);
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
