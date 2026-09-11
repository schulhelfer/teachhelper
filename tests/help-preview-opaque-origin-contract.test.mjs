import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const MODULE_BRIDGES = [
  ['planning', '../src/modules/planning/bridge.js'],
  ['grades', '../src/modules/grades/bridge.js'],
  ['seatplan', '../src/modules/seatplan/app.js'],
];

test('der Hilfe-Vorschaurahmen läuft mit opaker Origin wie die übrigen Tool-Frames', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  const match = bridge.match(/HELP_PREVIEW_FRAME_SANDBOX = '([^']*)'/);
  assert.ok(match, 'HELP_PREVIEW_FRAME_SANDBOX fehlt');
  const tokens = match[1].split(/\s+/).filter(Boolean);
  assert.ok(tokens.includes('allow-scripts'), 'die Vorschau braucht allow-scripts');
  assert.ok(
    !tokens.includes('allow-same-origin'),
    `HELP_PREVIEW_FRAME_SANDBOX muss opaque bleiben: ${match[1]}`,
  );
});

test('der Vorschaukontext stuft keine Sandbox-Profile mehr herauf', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  assert.doesNotMatch(bridge, /resolvePreviewSandboxTokens/);
  assert.doesNotMatch(bridge, /isHelpPreviewContext/);
  assert.doesNotMatch(bridge, /`\$\{sandboxTokens\} allow-same-origin`/);
});

test('die Opazität wird über window.origin erkannt, nicht über location.origin allein', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  assert.match(
    bridge,
    /return window\.origin === 'null' \|\| window\.location\.origin === 'null';/,
    'in einer Sandbox liefert location.origin weiterhin die Server-Origin; nur window.origin meldet "null"',
  );
});

test('eine Nonce-Antwort wird auch aus einem selbst opaken Elternteil akzeptiert', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  const trust = bridge.match(/export function isTrustedModuleMessage[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(trust, 'isTrustedModuleMessage nicht gefunden');
  assert.match(
    trust,
    /\(event\.origin === 'null' \|\| event\.origin === origin\)/,
    'ist der Empfänger selbst opaque, meldet das Kind seine echte Origin statt "null"',
  );
  assert.match(trust, /data\.frameNonce === frameNonce/, 'die Nonce bleibt der eigentliche Nachweis');
});

test('createModuleFrame erkennt geerbte Opazität und vergibt auch dort eine Nonce', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  assert.match(bridge, /function isOpaqueOriginContext\(\)/);
  const factory = bridge.match(/export function createModuleFrame\([\s\S]*?\r?\n  return frame;\r?\n\}/)?.[0] || '';
  assert.ok(factory, 'createModuleFrame nicht gefunden');
  assert.match(
    factory,
    /usesOpaqueOriginSandbox = isOpaqueOriginContext\(\)/,
    'createModuleFrame muss die Opazität des eigenen Kontexts berücksichtigen',
  );
  assert.match(factory, /frame\.dataset\.moduleOpaqueOrigin = '1'/);
  assert.match(factory, /frame\.dataset\.moduleFrameNonce = frameNonce/);
});

test('kein Modul außerhalb der Bridge fordert allow-same-origin an', async () => {
  const sourceRoot = new URL('../src/', import.meta.url);
  const bridgePath = path.resolve(fileURLToPath(new URL('../src/shared/module-frame-bridge.js', import.meta.url)));
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const offenders = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(js|html)$/.test(entry.name)) continue;
    const filePath = path.join(entry.parentPath ?? entry.path, entry.name);
    if (path.resolve(filePath) === bridgePath) continue;
    const body = await readFile(filePath, 'utf8');
    if (body.includes('allow-same-origin')) offenders.push(filePath);
  }
  assert.deepEqual(offenders, [], `allow-same-origin darf nur in der Bridge geprüft werden: ${offenders.join(', ')}`);
});

test('planning, grades und seatplan lösen ihren Eltern-Origin opaque-fähig auf', async () => {
  for (const [label, modulePath] of MODULE_BRIDGES) {
    const source = await read(modulePath);
    assert.doesNotMatch(
      source,
      /const TRUSTED_PARENT_ORIGIN = window\.location\.origin;/,
      `${label}: nackter window.location.origin bricht unter opaker Origin`,
    );
    assert.match(
      source,
      /const TRUSTED_PARENT_ORIGIN = \(window\.origin === 'null' \|\| window\.location\.origin === 'null'\)/,
      `${label}: die Opazität muss über window.origin erkannt werden`,
    );
    assert.match(source, /moduleFrameNonce/, `${label}: Nonce wird nicht gelesen`);
    assert.match(
      source,
      /const PARENT_MESSAGE_TARGET = \(window\.origin === 'null' \|\| window\.location\.origin === 'null'\) \? '\*' : TRUSTED_PARENT_ORIGIN;/,
      `${label}: ausgehende Nachrichten brauchen ein opaque-fähiges Ziel`,
    );
    assert.match(
      source,
      /const EXPECTED_PARENT_ORIGIN = MODULE_FRAME_NONCE \? '' : TRUSTED_PARENT_ORIGIN;/,
      `${label}: bei vorhandener Nonce authentifiziert diese statt der Origin`,
    );
    assert.match(
      source,
      /EXPECTED_PARENT_ORIGIN && event\.origin !== EXPECTED_PARENT_ORIGIN/,
      `${label}: die Origin-Prüfung muss bei Nonce-Betrieb entfallen`,
    );
    assert.doesNotMatch(
      source,
      /postMessage\([^;]*, TRUSTED_PARENT_ORIGIN\)/,
      `${label}: postMessage muss über PARENT_MESSAGE_TARGET laufen`,
    );
  }
});

test('planning, grades und seatplan beantworten die Tutorial-Rect-Anfrage per postMessage', async () => {
  for (const [label, modulePath] of MODULE_BRIDGES) {
    const source = await read(modulePath);
    assert.match(
      source,
      /TUTORIAL_TARGET_RECT_REQUEST_EVENT = 'classroom:tutorial-target-rect-request'/,
      `${label}: Anfrage-Event fehlt`,
    );
    assert.match(
      source,
      /TUTORIAL_TARGET_RECT_RESPONSE_EVENT = 'classroom:tutorial-target-rect-response'/,
      `${label}: Antwort-Event fehlt`,
    );
    assert.match(source, /function respondWithTutorialTargetRect\(detail\)/, `${label}: Responder fehlt`);
    assert.match(
      source,
      /if \(data\.type === TUTORIAL_TARGET_RECT_REQUEST_EVENT\) \{/,
      `${label}: Anfrage wird nicht verteilt`,
    );
    assert.match(
      source,
      /withModuleFrameNonce\(\{\s*\n?\s*type: TUTORIAL_TARGET_RECT_RESPONSE_EVENT/,
      `${label}: die Antwort trägt keine Nonce`,
    );
  }
});

test('die Vorschau bleibt flüchtig, damit die opake Origin keine Daten anlegt', async () => {
  const bootstrap = await read('../src/app/bootstrap.js');
  assert.match(bootstrap, /ephemeral: moduleWindowRequest\.isModuleWindow \|\| Boolean\(helpPreviewRequest\)/);
  const main = await read('../src/app/app-runtime.js');
  assert.match(main, /const serviceWorkerUpdates = helpPreviewRequest \? null/);
  assert.match(main, /const trustedParentOrigin = \(window\.origin === 'null' \|\| window\.location\.origin === 'null'\) \? '\*' : window\.location\.origin;/);
});

test('gemeinsame Frame-Skripte posten an ein opaque-fähiges Ziel', async () => {
  const sidebar = await read('../src/shared/sidebar-resize.js');
  assert.match(
    sidebar,
    /const PARENT_MESSAGE_TARGET = \(window\.origin === 'null' \|\| moduleFrameNonce\) \? '\*' : TRUSTED_PARENT_ORIGIN;/,
  );
  assert.match(sidebar, /postMessage\(withModuleFrameNonce\(\{ type, detail \}\), PARENT_MESSAGE_TARGET\);/);

  const hint = await read('../src/shared/tutorial-entry-hint.js');
  assert.match(
    hint,
    /const parentMessageTarget = \(window\.origin === 'null' \|\| moduleFrameNonce\) \? '\*' : parentOrigin;/,
  );
  assert.doesNotMatch(
    hint,
    /\}, parentOrigin\);/,
    'die Nachricht muss über parentMessageTarget laufen, sonst verwirft der Browser sie',
  );
});
