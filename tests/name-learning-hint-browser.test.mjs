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

test('the open hint overlay covers the front and yields again after the reveal', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1280, height: 900 } });
  await mountPractice(evaluate);
  const result = await evaluate(() => {
    const choices = document.getElementById('hint-choices');
    choices.hidden = false;
    for (const name of ['Maximiliane Schwarzenbergerhausen', 'Alan Turing', 'Grace Hopper', 'Nils Vorlage']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hint-choice';
      button.dataset.hintName = name;
      button.textContent = name;
      choices.append(button);
    }
    const front = document.getElementById('flip-card').getBoundingClientRect();
    const overlay = choices.getBoundingClientRect();
    const tiles = [...choices.querySelectorAll('.hint-choice')].map((tile) => {
      const box = tile.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        fits: tile.scrollWidth <= tile.clientWidth && tile.scrollHeight <= tile.clientHeight,
      };
    });
    const center = window.hitFront(0.5, 0.5);
    document.getElementById('flashcard').classList.add('is-revealed');
    return {
      center,
      columns: new Set(tiles.map((tile) => tile.left)).size,
      rows: new Set(tiles.map((tile) => tile.top)).size,
      allFit: tiles.every((tile) => tile.fits),
      coversFront: overlay.width >= front.width - 1 && overlay.height >= front.height - 1,
      revealedChoices: getComputedStyle(choices).visibility,
      revealedHint: getComputedStyle(document.getElementById('hint')).visibility,
    };
  });
  assert.match(result.center, /hint-choice/, 'open tiles take over the card front');
  assert.equal(result.coversFront, true);
  assert.equal(result.columns, 2);
  assert.equal(result.rows, 2);
  assert.equal(result.allFit, true, 'long names wrap inside their tile');
  assert.equal(result.revealedChoices, 'hidden', 'tiles disappear once the answer is shown');
  assert.equal(result.revealedHint, 'hidden');
});
