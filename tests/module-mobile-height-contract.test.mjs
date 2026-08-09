import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shellSource = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');

test('Planung und Noten füllen im schmalen Shell-Layout die verbleibende Viewport-Höhe', () => {
  assert.match(
    shellSource,
    /\.app\.app-tab-planning,\s+\.app\.app-tab-grades \{\s+grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-planning>\.planning-shell,\s+\.app\.app-tab-grades>\.grades-shell \{\s+grid-row: 2;[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-planning #planning-host>\.planning-frame,[\s\S]*?flex: 1 1 auto;[\s\S]*?height: 100%;/,
  );
});
