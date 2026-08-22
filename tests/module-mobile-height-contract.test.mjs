import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shellSource = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');

test('Alle iframe-Module füllen im schmalen Shell-Layout die verbleibende Viewport-Höhe', () => {
  assert.match(
    shellSource,
    /\.app\.app-tab-merger,\s+\.app\.app-tab-duplicate-check,\s+\.app\.app-tab-qr,\s+\.app\.app-tab-planning,\s+\.app\.app-tab-grades,\s+\.app\.app-tab-name-learning \{\s+grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-merger>\.merger-shell,\s+\.app\.app-tab-duplicate-check>\.duplicate-check-shell,\s+\.app\.app-tab-qr>\.qr-shell,\s+\.app\.app-tab-planning>\.planning-shell,\s+\.app\.app-tab-grades>\.grades-shell,\s+\.app\.app-tab-name-learning>\.name-learning-shell \{\s+grid-row: 2;[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-merger \.merger-host,\s+\.app\.app-tab-duplicate-check \.duplicate-check-host,\s+\.app\.app-tab-qr \.qr-host,\s+\.app\.app-tab-planning \.planning-host,\s+\.app\.app-tab-grades \.grades-host,\s+\.app\.app-tab-name-learning \.name-learning-host,/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-merger #merger-host>\.merger-frame,\s+\.app\.app-tab-duplicate-check #duplicate-check-host>\.duplicate-check-frame,\s+\.app\.app-tab-qr #qr-host>\.qr-frame,\s+\.app\.app-tab-planning #planning-host>\.planning-frame,\s+\.app\.app-tab-grades #grades-host>\.grades-frame,\s+\.app\.app-tab-name-learning #name-learning-host>\.name-learning-frame \{\s+display: flex;\s+flex: 1 1 auto;\s+min-height: 0;\s+height: 100%;/,
  );
});

test('Der Sitzplan füllt im schmalen Shell-Layout die verbleibende Viewport-Höhe', () => {
  assert.match(
    shellSource,
    /\.app\.app-tab-seatplan \{\s+grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-seatplan>\.main \{\s+grid-column: 1;\s+grid-row: 2;[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    shellSource,
    /\.app\.app-tab-seatplan #seatplan-main-host,\s+\.app\.app-tab-seatplan\.app-seatplan-full #seatplan-main-host,\s+\.app\.app-tab-seatplan #seatplan-main-host>\.seatplan-frame \{[\s\S]*?flex: 1 1 auto;\s+min-height: 0;\s+height: 100%;/,
  );
});
