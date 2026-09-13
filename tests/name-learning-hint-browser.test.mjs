import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

async function mountPractice(evaluate) {
  return evaluate(async () => {
    const html = await fetch('/src/modules/name-learning/app.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    const sheets = [...fixture.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => new URL(link.getAttribute('href'), 'http://x/src/modules/name-learning/').pathname);
    for (const href of sheets) {
      const style = document.createElement('style');
      style.textContent = await fetch(href).then((response) => response.text());
      document.head.append(style);
    }
    document.querySelector('meta[name="viewport"]')?.remove();
    const viewport = fixture.querySelector('meta[name="viewport"]');
    if (viewport) document.head.append(viewport.cloneNode(true));
    document.body.className = fixture.body.className;
    document.body.style.margin = '0';
    document.body.innerHTML = fixture.body.innerHTML;
    for (const script of document.body.querySelectorAll('script')) script.remove();
    document.getElementById('practice').hidden = false;
    document.getElementById('hint').hidden = false;
    window.hitFront = (dx, dy) => {
      const box = document.getElementById('flip-card').getBoundingClientRect();
      const element = document.elementFromPoint(
        Math.round(box.left + box.width * dx),
        Math.round(box.top + box.height * dy),
      );
      return element ? (element.id || element.className) : null;
    };
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

test('the idle hint overlay never intercepts clicks meant for the portrait', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await mountPractice(evaluate);
  const result = await evaluate(() => {
    const choices = document.getElementById('hint-choices');
    const front = document.getElementById('flip-card');
    let flips = 0;
    front.addEventListener('click', () => { flips += 1; });
    const box = front.getBoundingClientRect();
    document
      .elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      hidden: choices.hidden,
      display: getComputedStyle(choices).display,
      hint: getComputedStyle(document.getElementById('hint')).visibility,
      flips,
      center: window.hitFront(0.5, 0.5),
      corner: window.hitFront(0.15, 0.15),
      lower: window.hitFront(0.5, 0.8),
    };
  });
  assert.equal(result.hidden, true);
  assert.equal(result.display, 'none', 'a hidden tile overlay must not stay laid out over the photo');
  assert.equal(result.center, 'portrait');
  assert.equal(result.corner, 'portrait');
  assert.equal(result.lower, 'portrait');
  assert.equal(result.flips, 1, 'clicking the card reaches the flip button');
  assert.equal(result.hint, 'visible', 'the hint button stays offered on the card front');
});

test('the open hint tiles sit below the card panel without covering the photo', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await mountPractice(evaluate);
  const result = await evaluate(() => {
    const choices = document.getElementById('hint-choices');
    document.getElementById('hint').hidden = true;
    choices.hidden = false;
    for (const name of ['Maximiliane Schwarzenbergerhausen', 'Alan Turing', 'Grace Hopper', 'Nils Vorlage']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hint-choice';
      button.dataset.hintName = name;
      button.textContent = name;
      choices.append(button);
    }
    const panel = document.getElementById('practice').getBoundingClientRect();
    const overlay = choices.getBoundingClientRect();
    const card = document.getElementById('flashcard').getBoundingClientRect();
    const tiles = [...choices.querySelectorAll('.hint-choice')].map((tile) => {
      const box = tile.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        fits: tile.scrollWidth <= tile.clientWidth && tile.scrollHeight <= tile.clientHeight,
      };
    });
    const main = document.querySelector('.main');
    return {
      center: window.hitFront(0.5, 0.5),
      belowPanel: Math.round(overlay.top) >= Math.round(panel.bottom),
      widthMatchesCard: Math.round(overlay.width) === Math.round(card.width),
      columns: new Set(tiles.map((tile) => tile.left)).size,
      rows: new Set(tiles.map((tile) => tile.top)).size,
      allFit: tiles.every((tile) => tile.fits),
      overflows: main.scrollHeight > main.clientHeight,
    };
  });
  assert.equal(result.center, 'portrait', 'the photo stays clickable while the tiles are open');
  assert.equal(result.belowPanel, true, 'tiles render underneath the card panel, not over it');
  assert.equal(result.widthMatchesCard, true, 'tiles line up with the card width');
  assert.equal(result.columns, 2);
  assert.equal(result.rows, 2);
  assert.equal(result.allFit, true, 'long names wrap inside their tile');
  assert.equal(result.overflows, false, 'the tiles do not push the practice area into a scroll');
});

test('opening the hint never shifts the photo or the card panel', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await mountPractice(evaluate);
  const result = await evaluate(async () => {
    const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
    const before = { card: top('flashcard'), panel: top('practice'), photo: top('portrait') };
    const choices = document.getElementById('hint-choices');
    document.getElementById('hint').hidden = true;
    for (const name of ['Maximiliane Schwarzenbergerhausen', 'Alan Turing', 'Grace Hopper', 'Nils Vorlage']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hint-choice';
      button.dataset.hintName = name;
      button.textContent = name;
      choices.append(button);
    }
    choices.hidden = false;
    await settle();
    const after = { card: top('flashcard'), panel: top('practice'), photo: top('portrait') };
    return { before, after };
  });
  assert.deepEqual(result.after, result.before, 'the reserved hint slot keeps the layout fixed when the tiles appear');
});

test('the hint button sits below the card panel and is centred on it', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await mountPractice(evaluate);
  const result = await evaluate(() => {
    const panel = document.getElementById('practice').getBoundingClientRect();
    const hint = document.getElementById('hint').getBoundingClientRect();
    return {
      belowPanel: Math.round(hint.top) >= Math.round(panel.bottom),
      centred: Math.abs((hint.left + hint.right) / 2 - (panel.left + panel.right) / 2) <= 1,
      insidePanelWidth: hint.left >= panel.left && hint.right <= panel.right,
    };
  });
  assert.equal(result.belowPanel, true, 'the hint button is outside the card panel');
  assert.equal(result.centred, true);
  assert.equal(result.insidePanelWidth, true);
});

test('the hint tiles stack into one readable column on a phone', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 390, height: 844, mobile: true } });
  await mountPractice(evaluate);
  const result = await evaluate(() => {
    const choices = document.getElementById('hint-choices');
    document.getElementById('hint').hidden = true;
    choices.hidden = false;
    for (const name of ['Maximiliane Schwarzenbergerhausen', 'Alan Turing', 'Grace Hopper', 'Nils Vorlage']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hint-choice';
      button.dataset.hintName = name;
      button.textContent = name;
      choices.append(button);
    }
    const box = choices.getBoundingClientRect();
    const tiles = [...choices.querySelectorAll('.hint-choice')];
    return {
      columns: new Set(tiles.map((tile) => Math.round(tile.getBoundingClientRect().left))).size,
      allFit: tiles.every((tile) => tile.scrollWidth <= tile.clientWidth && tile.scrollHeight <= tile.clientHeight),
      withinViewport: box.left >= 0 && box.right <= 390,
      horizontalScroll: document.documentElement.scrollWidth > 390,
    };
  });
  assert.equal(result.columns, 1, 'tiles stack vertically on a narrow screen');
  assert.equal(result.allFit, true, 'a long name still fits its tile on a phone');
  assert.equal(result.withinViewport, true);
  assert.equal(result.horizontalScroll, false, 'the tiles never cause sideways scrolling');
});
