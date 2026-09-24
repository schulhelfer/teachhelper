import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('visible menu tabs receive pointer input across viewport breakpoints', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await evaluate(async () => {
    const html = await fetch('/index.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    const css = await Promise.all([...fixture.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => fetch(link.getAttribute('href')).then((response) => response.text())));
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.append(style);
    document.body.replaceChildren(...fixture.body.childNodes);
    sessionStorage.setItem('teachhelper:pwa-install-prompt-dismissed', '1');
    await import('/src/main.js');
  });

  async function pointAt(selector) {
    const point = await evaluate((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
    await evaluate.dispatchMouseEvent({ type: 'mouseMoved', ...point });
    assert.equal(await evaluate((selector) => document.querySelector(selector).matches(':hover'), selector), true, selector);
    return point;
  }

  async function clickAt(selector) {
    const point = await pointAt(selector);
    await evaluate.dispatchMouseEvent({ type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await evaluate.dispatchMouseEvent({ type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await evaluate(() => new Promise((done) => setTimeout(done, 400)));
  }

  for (const width of [1280, 1181, 1180, 1000, 641, 640, 480, 640, 641, 1180, 1181, 1280]) {
    await evaluate.setViewport({ width, height: 900 });
    const state = await evaluate(async () => {
      await new Promise((done) => setTimeout(done, 400));
      const buttons = [...document.querySelectorAll('.tab-nav .tab-button')]
        .filter((button) => button.getClientRects().length > 0);
      return {
        tabs: buttons.map((button) => ({
          id: button.id,
          reachable: [0.25, 0.5, 0.75].every((fraction) => {
            const rect = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(rect.left + rect.width * fraction, rect.top + rect.height / 2));
          }),
        })),
        hasMenu: buttons.some((button) => button.id === 'more-tools-trigger'),
      };
    });
    assert.ok(state.tabs.some((tab) => tab.id === 'tab-grades'));
    assert.ok(state.tabs.some((tab) => tab.id === 'tab-planning'));
    for (const tab of state.tabs) {
      assert.equal(tab.reachable, true, `${tab.id} at ${width}px`);
      await pointAt(`#${tab.id}`);
    }
    if (state.hasMenu) {
      await clickAt('#more-tools-trigger');
      assert.equal(await evaluate(() => document.getElementById('more-tools-menu').hidden), false);
      await clickAt('[data-more-tools-target="qr"]');
      assert.equal(await evaluate(() => document.getElementById('tab-qr').classList.contains('active')), true);
      assert.equal(await evaluate(() => document.getElementById('more-tools-menu').hidden), true);
    }
    await clickAt('#tab-planning');
    assert.equal(await evaluate(() => document.getElementById('tab-planning').classList.contains('active')), true);
  }
});

test('responsive tab layout keeps overflow, menu focus and indicator aligned', { timeout: 60000 }, async (t) => {
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
    await import(`/src/main.js?tab-nav-layout-browser=${token}`);
    await wait(300);

    const nav = document.querySelector('.tab-nav');
    const trigger = document.getElementById('more-tools-trigger');
    const menu = document.getElementById('more-tools-menu');
    const indicator = document.querySelector('.tab-indicator');
    const overflowTargets = () => [...nav.querySelectorAll('[data-tab-target][data-tab-overflow]')]
      .map((tab) => tab.dataset.tabTarget);
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
    const wide = {
      condensed: nav.classList.contains('is-tools-condensed'),
      overflow: overflowTargets(),
      indicatorReady: indicator.classList.contains('is-ready'),
      indicatorMatchesPlanning: indicatorMatches(document.getElementById('tab-planning')),
    };

    document.getElementById('tab-qr').click();
    await wait(240);
    nav.style.flex = '0 0 430px';
    nav.style.width = '430px';
    nav.style.maxWidth = '430px';
    window.visualViewport?.dispatchEvent(new Event('resize'));
    await wait(240);
    const qrMenuItem = menu.querySelector('[data-more-tools-target="qr"]');
    const narrow = {
      condensed: nav.classList.contains('is-tools-condensed'),
      overflow: overflowTargets(),
      gradesOverflowed: document.getElementById('tab-grades').hasAttribute('data-tab-overflow'),
      planningOverflowed: document.getElementById('tab-planning').hasAttribute('data-tab-overflow'),
      triggerActive: trigger.classList.contains('active'),
      triggerSelected: trigger.getAttribute('aria-selected'),
      qrMenuActive: qrMenuItem.classList.contains('is-active'),
      indicatorMatchesTrigger: indicatorMatches(trigger),
    };

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait(60);
    const firstFocusedTarget = document.activeElement?.dataset?.moreToolsTarget || '';
    const firstFocusState = {
      target: firstFocusedTarget,
      activeId: document.activeElement?.id || '',
      activeTag: document.activeElement?.tagName || '',
      menuHidden: menu.hidden,
      expanded: trigger.getAttribute('aria-expanded'),
      visibleItems: [...menu.querySelectorAll('[data-more-tools-target]')]
        .filter((item) => !item.hidden)
        .map((item) => item.dataset.moreToolsTarget),
    };
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const endFocusedTarget = document.activeElement?.dataset?.moreToolsTarget || '';
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const escape = {
      closed: menu.hidden,
      triggerFocused: document.activeElement === trigger,
    };

    trigger.click();
    const mergerMenuItem = menu.querySelector('[data-more-tools-target="merger"]');
    mergerMenuItem.click();
    await wait(260);
    const selectedThroughMenu = {
      activeTab: nav.querySelector('.tab-button.active[data-tab-target]')?.dataset.tabTarget || '',
      menuClosed: menu.hidden,
      triggerActive: trigger.classList.contains('active'),
      indicatorMatchesTrigger: indicatorMatches(trigger),
    };

    nav.style.flex = '0 0 1400px';
    nav.style.width = '1400px';
    nav.style.maxWidth = '1400px';
    window.dispatchEvent(new Event('resize'));
    await wait(320);
    const mergerTab = document.getElementById('tab-merger');
    const restored = {
      condensed: nav.classList.contains('is-tools-condensed'),
      overflow: overflowTargets(),
      menuClosed: menu.hidden,
      expanded: trigger.getAttribute('aria-expanded'),
      mergerActive: mergerTab.classList.contains('active'),
      indicatorMatchesMerger: indicatorMatches(mergerTab),
    };
    return { wide, narrow, firstFocusState, endFocusedTarget, escape, selectedThroughMenu, restored };
  }, { token: Date.now() });

  assert.equal(result.wide.condensed, false);
  assert.deepEqual(result.wide.overflow, []);
  assert.equal(result.wide.indicatorReady, true);
  assert.equal(result.wide.indicatorMatchesPlanning, true);
  assert.equal(result.narrow.condensed, true);
  assert.ok(result.narrow.overflow.includes('qr'));
  assert.equal(result.narrow.gradesOverflowed, false);
  assert.equal(result.narrow.planningOverflowed, false);
  assert.equal(result.narrow.triggerActive, true);
  assert.equal(result.narrow.triggerSelected, 'true');
  assert.equal(result.narrow.qrMenuActive, true);
  assert.equal(result.narrow.indicatorMatchesTrigger, true);
  assert.ok(result.firstFocusState.target, JSON.stringify(result.firstFocusState));
  assert.equal(result.endFocusedTarget, 'qr');
  assert.deepEqual(result.escape, { closed: true, triggerFocused: true });
  assert.equal(result.selectedThroughMenu.activeTab, 'merger');
  assert.equal(result.selectedThroughMenu.menuClosed, true);
  assert.equal(result.selectedThroughMenu.triggerActive, true);
  assert.equal(result.selectedThroughMenu.indicatorMatchesTrigger, true);
  assert.equal(result.restored.condensed, false);
  assert.deepEqual(result.restored.overflow, []);
  assert.equal(result.restored.menuClosed, true);
  assert.equal(result.restored.expanded, 'false');
  assert.equal(result.restored.mergerActive, true);
  assert.equal(result.restored.indicatorMatchesMerger, true);
});
