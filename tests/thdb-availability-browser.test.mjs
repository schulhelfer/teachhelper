import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('THDB import yields to browser timers with native crypto and its fallback', async (t) => {
  const evaluate = await openDomBrowser(t);
  const results = await evaluate(async () => {
    const thdb = await import('/src/shared/school-data/thdb.js');
    const built = thdb.buildThdb1ContainerBytes({
      schema: 'teachhelper-db-v2',
      startupShellText: '{}',
      planningPublicText: ' '.repeat(2 * 1024 * 1024) + '{"courses":[]}',
      gradeVaultConfigText: '{}',
    });
    const expected = thdb.parseThdb1ContainerBytes(built.bytes).contentHash;
    const results = [];
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      for (const fallback of [false, true]) {
        if (fallback) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
        let ticks = 0;
        const timer = setInterval(() => { ticks += 1; }, 0);
        try {
          const parsed = await thdb.parseThdb1ContainerBytesAsync(built.bytes);
          results.push({ ticks, matches: parsed.contentHash === expected, publicState: JSON.parse(parsed.planningPublicText) });
        } finally {
          clearInterval(timer);
        }
      }
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else delete globalThis.crypto;
    }
    return results;
  });
  for (const result of results) {
    assert.ok(result.ticks > 1);
    assert.equal(result.matches, true);
    assert.deepEqual(result.publicState, { courses: [] });
  }
});
