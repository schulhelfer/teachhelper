import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

const cases = [
  { label: 'desktop', viewport: { width: 1366, height: 900, mobile: false }, ios: false },
  { label: 'iOS mobile', viewport: { width: 390, height: 844, mobile: true }, ios: true },
];

for (const config of cases) {
  test(`shell layout refreshes remain stable on ${config.label}`, { timeout: 60000 }, async (t) => {
    const evaluate = await openDomBrowser(t, { viewport: config.viewport });
    const result = await evaluate(async ({ token, ios }) => {
      const wait = (delay = 0) => new Promise(done => window.setTimeout(done, delay));
      if (ios) {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone)' });
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
      }
      const html = await fetch('/index.html').then(response => response.text());
      const fixture = new DOMParser().parseFromString(html, 'text/html');
      document.querySelector('meta[name="viewport"]')?.remove();
      document.head.append(fixture.querySelector('meta[name="viewport"]').cloneNode(true));
      const css = await Promise.all(
        [...fixture.querySelectorAll('link[rel="stylesheet"]')]
          .map(link => fetch(link.getAttribute('href')).then(response => response.text()))
      );
      const style = document.createElement('style');
      style.textContent = css.join('\n');
      document.head.append(style);
      document.body.replaceChildren(...fixture.body.childNodes);
      await import(`/src/main.js?layout-refresh-browser=${token}`);
      const csv = [
        ';Nachname;Vorname',
        ';Adler;Anna',
        ';Berg;Ben',
        ';Claus;Cara',
        ';Dorf;Dino',
        ';Eich;Eva',
        ';Feld;Finn',
      ].join('\n');
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], 'Layout.csv', { type: 'text/csv' }));
      const csvInput = document.getElementById('csv');
      csvInput.files = transfer.files;
      csvInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(120);
      if (document.getElementById('pwa-install-dialog')?.open) {
        document.getElementById('pwa-install-dialog-later')?.click();
        await wait(20);
      }

      const activate = async (tab) => {
        document.getElementById(`tab-${tab}`).click();
        await wait(520);
      };
      const triggerResize = async () => {
        window.dispatchEvent(new Event('resize'));
        window.visualViewport?.dispatchEvent(new Event('resize'));
        await wait(320);
      };
      const chromeStates = [];
      const cycleChrome = async (readMetric) => {
        const expanded = readMetric();
        const app = document.getElementById('app');
        const header = document.querySelector('.app-header');
        const tabNav = document.querySelector('.tab-nav');
        const sidebar = document.querySelector('.side');
        const headerToggle = document.getElementById('toggle-chrome');
        const overlayToggle = document.getElementById('toggle-chrome-overlay');
        headerToggle.focus();
        headerToggle.click();
        await wait(720);
        const collapsed = readMetric();
        const collapsedChrome = {
          appCollapsed: app.classList.contains('chrome-collapsed'),
          headerHidden: header.hidden,
          headerAriaHidden: header.getAttribute('aria-hidden'),
          tabNavHidden: tabNav.hidden,
          tabNavInert: tabNav.inert,
          sidebarHidden: sidebar.hidden,
          overlayHidden: overlayToggle.hidden,
          overlayDisabled: overlayToggle.disabled,
          activeElementId: document.activeElement?.id || '',
        };
        overlayToggle.click();
        await wait(720);
        const expandedChrome = {
          appCollapsed: app.classList.contains('chrome-collapsed'),
          headerHidden: header.hidden,
          tabNavHidden: tabNav.hidden,
          tabNavInert: tabNav.inert,
          sidebarHidden: sidebar.hidden,
          overlayHidden: overlayToggle.hidden,
          overlayDisabled: overlayToggle.disabled,
          activeElementId: document.activeElement?.id || '',
        };
        chromeStates.push({ collapsed: collapsedChrome, expanded: expandedChrome });
        await triggerResize();
        const restored = readMetric();
        return { expanded, collapsed, restored };
      };

      await activate('groups');
      const groups = await cycleChrome(() => ({
        scale: document.getElementById('groups-grid').style.getPropertyValue('--group-fit-scale'),
        width: document.getElementById('groups-grid').getBoundingClientRect().width,
        height: document.getElementById('groups-grid').getBoundingClientRect().height,
      }));

      await activate('random-picker');
      const picker = await cycleChrome(() => ({
        width: document.getElementById('random-picker-wheel').style.getPropertyValue('--random-picker-wheel-static-width'),
        center: document.querySelector('[data-random-slot="3"]')?.textContent || '',
      }));

      await activate('work-phase');
      const overlay = document.getElementById('work-order-hint-overlay');
      overlay.classList.add('visible');
      await triggerResize();
      const workPhase = await cycleChrome(() => ({
        lightSize: document.querySelector('.monitor-ampel').style.getPropertyValue('--monitor-light-fit-size'),
        overlayLeft: overlay.style.left,
        overlayTop: overlay.style.top,
      }));

      return {
        width: window.innerWidth,
        height: window.innerHeight,
        iosClass: document.getElementById('app').classList.contains('app-ios-optimized'),
        activeWorkPhase: document.getElementById('app').classList.contains('app-tab-work-phase'),
        chromeRestored: !document.getElementById('app').classList.contains('chrome-collapsed'),
        chromeStates,
        groups,
        picker,
        workPhase,
      };
    }, { token: `${config.label}-${Date.now()}`, ios: config.ios });

    assert.equal(result.width, config.viewport.width);
    assert.equal(result.height, config.viewport.height);
    assert.equal(result.iosClass, config.ios);
    assert.equal(result.activeWorkPhase, true);
    assert.equal(result.chromeRestored, true);
    assert.equal(result.chromeStates.length, 3);
    result.chromeStates.forEach(({ collapsed, expanded }) => {
      assert.equal(collapsed.appCollapsed, true);
      assert.equal(collapsed.headerHidden, true);
      assert.equal(collapsed.headerAriaHidden, 'true');
      assert.equal(collapsed.tabNavHidden, true);
      assert.equal(collapsed.tabNavInert, true);
      assert.equal(collapsed.sidebarHidden, true);
      assert.equal(collapsed.overlayHidden, false);
      assert.equal(collapsed.overlayDisabled, false);
      assert.equal(collapsed.activeElementId, 'toggle-chrome-overlay');
      assert.equal(expanded.appCollapsed, false);
      assert.equal(expanded.headerHidden, false);
      assert.equal(expanded.tabNavHidden, false);
      assert.equal(expanded.tabNavInert, false);
      assert.equal(expanded.sidebarHidden, false);
      assert.equal(expanded.overlayHidden, true);
      assert.equal(expanded.overlayDisabled, true);
      assert.notEqual(expanded.activeElementId, 'toggle-chrome-overlay');
    });
    for (const state of Object.values(result.groups)) {
      assert.ok(Number.parseFloat(state.scale) > 0);
      assert.ok(state.width > 0);
      assert.ok(state.height > 0);
    }
    for (const state of Object.values(result.picker)) {
      assert.ok(Number.parseFloat(state.width) > 0);
      assert.ok(state.center.length > 0);
    }
    for (const state of Object.values(result.workPhase)) {
      assert.ok(Number.parseFloat(state.lightSize) > 0);
      assert.ok(Number.isFinite(Number.parseFloat(state.overlayLeft)));
      assert.ok(Number.isFinite(Number.parseFloat(state.overlayTop)));
    }
  });
}

test('direct Work Phase module startup receives an initial layout refresh', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, {
    viewport: { width: 1024, height: 768, mobile: false },
  });
  const result = await evaluate(async ({ token }) => {
    history.replaceState({}, '', '/index.html?tab=work-phase&window=module');
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.querySelector('meta[name="viewport"]')?.remove();
    document.head.append(fixture.querySelector('meta[name="viewport"]').cloneNode(true));
    const css = await Promise.all(
      [...fixture.querySelectorAll('link[rel="stylesheet"]')]
        .map(link => fetch(link.getAttribute('href')).then(response => response.text()))
    );
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.append(style);
    document.body.replaceChildren(...fixture.body.childNodes);
    await import(`/src/main.js?layout-refresh-module-browser=${token}`);
    await new Promise(done => window.setTimeout(done, 120));
    const overlay = document.getElementById('work-order-hint-overlay');
    overlay.classList.add('visible');
    window.dispatchEvent(new Event('resize'));
    await new Promise(done => window.setTimeout(done, 80));
    return {
      moduleWindow: document.getElementById('app').dataset.moduleWindow,
      active: document.getElementById('app').classList.contains('app-tab-work-phase'),
      lightSize: document.querySelector('.monitor-ampel').style.getPropertyValue('--monitor-light-fit-size'),
      overlayLeft: overlay.style.left,
      overlayTop: overlay.style.top,
    };
  }, { token: Date.now() });

  assert.equal(result.moduleWindow, 'true');
  assert.equal(result.active, true);
  assert.ok(Number.parseFloat(result.lightSize) > 0);
  assert.ok(Number.isFinite(Number.parseFloat(result.overlayLeft)));
  assert.ok(Number.isFinite(Number.parseFloat(result.overlayTop)));
});
