import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [iconsSource, shellSource, gradesSource, gradesHtml, indexHtml, serviceWorkerSource] = await Promise.all([
  readFile(new URL('../src/shared/grade-vault-lock-icons.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('grade vault lock icons are inline SVGs with independent gradients', () => {
  assert.match(iconsSource, /GRADE_VAULT_LOCKED_ICON/);
  assert.match(iconsSource, /GRADE_VAULT_UNLOCKED_ICON/);
  assert.equal((iconsSource.match(/viewBox="0 0 1024 1024"/g) || []).length, 1);
  assert.match(iconsSource, /grade-vault-locked-body/);
  assert.match(iconsSource, /grade-vault-unlocked-body/);
  assert.doesNotMatch(iconsSource, /<filter|feDropShadow/);
});

test('grade vault controls use SVG icons instead of lock emoji text', () => {
  assert.match(shellSource, /innerHTML = locked \? GRADE_VAULT_LOCKED_ICON : GRADE_VAULT_UNLOCKED_ICON/);
  assert.match(gradesSource, /GRADE_VAULT_UNLOCKED_ICON/);
  assert.match(gradesSource, /button\.innerHTML = formMode === normalizedMode \? GRADE_VAULT_UNLOCKED_ICON : ""/);
  assert.doesNotMatch(indexHtml, /tab-grades-unlock[\s\S]*?🔒/);
  assert.doesNotMatch(gradesHtml, /grades-empty-unlock[\s\S]*?🔓/);
  assert.doesNotMatch(gradesHtml, /grade-vault-dialog-submit[\s\S]*?🔓/);
  assert.match(serviceWorkerSource, /'\.\/src\/shared\/grade-vault-lock-icons\.js'/);
});
