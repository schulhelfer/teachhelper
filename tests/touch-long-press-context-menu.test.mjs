import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperSource = await readFile(
  new URL('../src/shared/touch-long-press.js', import.meta.url),
  'utf8',
);
const [planningSource, gradesSource, serviceWorkerSource] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);
const { installTouchLongPress } = await import(
  `data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`,
);

function createPointerEvent(type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.entries(properties).forEach(([key, value]) => {
    Object.defineProperty(event, key, { value });
  });
  return event;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('Long-Press öffnet nach der Haltezeit und unterdrückt Folgeevents', async () => {
  const root = new EventTarget();
  const ownerDocument = new EventTarget();
  Object.defineProperty(root, 'ownerDocument', { value: ownerDocument });
  let opens = 0;
  const dispose = installTouchLongPress(root, {
    delayMs: 5,
    getTarget: () => root,
    onLongPress: () => { opens += 1; },
  });

  root.dispatchEvent(createPointerEvent('pointerdown', {
    pointerType: 'touch', isPrimary: true, button: 0, pointerId: 1, clientX: 20, clientY: 30,
  }));
  await wait(15);
  ownerDocument.dispatchEvent(createPointerEvent('pointerup', { pointerId: 1 }));

  const click = new Event('click', { cancelable: true });
  const contextMenu = new Event('contextmenu', { cancelable: true });
  root.dispatchEvent(click);
  root.dispatchEvent(contextMenu);

  assert.equal(opens, 1);
  assert.equal(click.defaultPrevented, true);
  assert.equal(contextMenu.defaultPrevented, true);
  dispose();
});

test('Bewegung, Abbruch und Maus-Pointer lösen keinen Long-Press aus', async () => {
  const root = new EventTarget();
  const ownerDocument = new EventTarget();
  Object.defineProperty(root, 'ownerDocument', { value: ownerDocument });
  let opens = 0;
  const dispose = installTouchLongPress(root, {
    delayMs: 5,
    moveTolerancePx: 12,
    getTarget: () => root,
    onLongPress: () => { opens += 1; },
  });

  root.dispatchEvent(createPointerEvent('pointerdown', {
    pointerType: 'touch', isPrimary: true, button: 0, pointerId: 2, clientX: 0, clientY: 0,
  }));
  ownerDocument.dispatchEvent(createPointerEvent('pointermove', { pointerId: 2, clientX: 13, clientY: 0 }));
  await wait(15);

  root.dispatchEvent(createPointerEvent('pointerdown', {
    pointerType: 'touch', isPrimary: true, button: 0, pointerId: 3, clientX: 0, clientY: 0,
  }));
  ownerDocument.dispatchEvent(createPointerEvent('pointercancel', { pointerId: 3 }));
  await wait(15);

  root.dispatchEvent(createPointerEvent('pointerdown', {
    pointerType: 'mouse', isPrimary: true, button: 0, pointerId: 4, clientX: 0, clientY: 0,
  }));
  await wait(15);

  assert.equal(opens, 0);
  dispose();
});

test('Planung, Noten und der Offline-Cache binden die gemeinsame Long-Press-Hilfe ein', () => {
  assert.match(planningSource, /import \{ installTouchLongPress \} from "\.\.\/\.\.\/shared\/touch-long-press\.js";/);
  assert.match(planningSource, /bindTouchContextMenus\(\)/);
  assert.match(planningSource, /\.lesson-block\[data-lesson-id\]/);
  assert.match(planningSource, /tr\[data-lesson-id\]/);
  assert.match(gradesSource, /import \{ installTouchLongPress \} from "\.\.\/\.\.\/shared\/touch-long-press\.js";/);
  assert.match(gradesSource, /this\.refs\.sidebarCourseList/);
  assert.match(serviceWorkerSource, /'\.\/src\/shared\/touch-long-press\.js'/);
});
