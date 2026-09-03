import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const SCROLL_BLOCKING_EVENTS = ['touchstart', 'touchmove', 'wheel', 'mousewheel'];
const EVENT_LITERAL = new RegExp(`['"](?:${SCROLL_BLOCKING_EVENTS.join('|')})['"]`);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      return entry.name === 'vendor' ? [] : collectSourceFiles(path);
    }
    return entry.name.endsWith('.js') ? [path] : [];
  }));
  return files.flat();
}

function readBalanced(source, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return { start: openIndex + 1, end: index };
    }
  }
  return null;
}

function readLoopBody(source, afterHeaderIndex) {
  const braceIndex = source.indexOf('{', afterHeaderIndex);
  const statementEnd = source.indexOf(';', afterHeaderIndex);
  if (braceIndex >= 0 && (statementEnd < 0 || braceIndex < statementEnd)) {
    return readBalanced(source, braceIndex, '{', '}');
  }
  return statementEnd < 0 ? null : { start: afterHeaderIndex, end: statementEnd };
}

function findScrollBlockingRegions(source) {
  const regions = [];
  const addForEachRegion = (index) => {
    const parenIndex = source.indexOf('(', index);
    if (parenIndex < 0) return;
    const region = readBalanced(source, parenIndex, '(', ')');
    if (region) regions.push(region);
  };

  for (const array of source.matchAll(/\[[^[\]]*\]/g)) {
    if (!EVENT_LITERAL.test(array[0])) continue;
    const arrayEnd = array.index + array[0].length;
    const tail = source.slice(arrayEnd, arrayEnd + 40);
    const inlineForEach = tail.match(/^\s*\.forEach\s*\(/);
    if (inlineForEach) {
      addForEachRegion(arrayEnd);
      continue;
    }
    const head = source.slice(Math.max(0, array.index - 120), array.index);
    const binding = head.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
    if (!binding) continue;
    const name = binding[1];
    for (const loop of source.matchAll(new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s+of\\s+${name}\\s*\\)`, 'g'))) {
      const body = readLoopBody(source, loop.index + loop[0].length);
      if (body) regions.push(body);
    }
    for (const call of source.matchAll(new RegExp(`\\b${name}\\s*\\.forEach\\s*\\(`, 'g'))) {
      addForEachRegion(call.index + call[0].length - 1);
    }
  }
  return regions;
}

function findMissingPassiveRegistrations(source) {
  const regions = findScrollBlockingRegions(source);
  const offenders = [];
  for (const call of source.matchAll(/addEventListener\s*\(/g)) {
    const parenIndex = call.index + call[0].length - 1;
    const span = readBalanced(source, parenIndex, '(', ')');
    if (!span) continue;
    const args = source.slice(span.start, span.end);
    const firstArgument = args.split(',')[0].trim();
    const registersScrollBlocking = EVENT_LITERAL.test(firstArgument)
      || regions.some((region) => call.index > region.start && call.index < region.end);
    if (!registersScrollBlocking || /\bpassive\b/.test(args)) continue;
    offenders.push({
      line: source.slice(0, call.index).split('\n').length,
      snippet: args.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return offenders;
}

test('scroll-blocking listeners always declare passive explicitly', async () => {
  const files = await collectSourceFiles(new URL('../src/', import.meta.url));
  assert.ok(files.length > 10, 'die Quelldateien müssen gefunden werden');

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const offender of findMissingPassiveRegistrations(source)) {
      offenders.push(`${file.pathname.split('/src/')[1]}:${offender.line} → ${offender.snippet}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `touchstart/touchmove/wheel brauchen eine ausdrückliche passive-Angabe:\n${offenders.join('\n')}`,
  );
});

test('the passive-listener scanner sees through event-name loops without leaking names', () => {
  const inlineLoop = `
    ["pointerdown", "touchstart"].forEach((eventName) => {
      dialog.addEventListener(eventName, handler, { capture: true });
    });
  `;
  assert.equal(findMissingPassiveRegistrations(inlineLoop).length, 1);

  const deferredLoop = `
    const types = ['pointerdown', 'keydown', 'touchstart'];
    for (const type of types) {
      target.addEventListener(type, onGesture);
    }
  `;
  assert.equal(findMissingPassiveRegistrations(deferredLoop).length, 1);

  const direct = `element.addEventListener('wheel', zoom);`;
  assert.equal(findMissingPassiveRegistrations(direct).length, 1);

  const deliberate = `element.addEventListener('touchmove', drag, { passive: false });`;
  assert.deepEqual(findMissingPassiveRegistrations(deliberate), []);

  const unrelated = `element.addEventListener('click', run);`;
  assert.deepEqual(findMissingPassiveRegistrations(unrelated), []);

  const reusedLoopVariable = `
    ["pointerover", "touchstart"].forEach((eventName) => {
      dialog.addEventListener(eventName, cancel, { capture: true, passive: true });
    });
    for (const eventName of ["pointerup", "blur"]) {
      button.addEventListener(eventName, clearHold);
    }
  `;
  assert.deepEqual(
    findMissingPassiveRegistrations(reusedLoopVariable),
    [],
    'ein gleichnamiger Schleifenparameter ohne Scroll-Events darf nicht mitgemeldet werden',
  );
});
