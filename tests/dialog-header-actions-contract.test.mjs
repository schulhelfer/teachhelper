import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceEntries = await Promise.all([
  ['Hauptansicht', '../index.html'],
  ['Planung', '../src/modules/planning/app.html'],
  ['Noten', '../src/modules/grades/app.html'],
  ['Sitzplan', '../src/modules/seatplan/app.html'],
  ['Arbeitsbereich', '../src/modules/workspace/components.js'],
].map(async ([name, path]) => [
  name,
  await readFile(new URL(path, import.meta.url), 'utf8'),
]));

const actionStyles = await readFile(
  new URL('../src/shared/app-action-icons.css', import.meta.url),
  'utf8',
);

function extractBalancedElement(source, start, tagName) {
  const matcher = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  matcher.lastIndex = start;
  let depth = 0;
  let openingIndex = -1;
  for (let match = matcher.exec(source); match; match = matcher.exec(source)) {
    const closing = match[0].startsWith('</');
    if (!closing) {
      if (depth === 0) openingIndex = match.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && openingIndex >= 0) {
        return source.slice(openingIndex, matcher.lastIndex);
      }
    }
  }
  return '';
}

function extractDialogs(source) {
  const dialogs = [];
  const matcher = /<dialog\b[^>]*>/gi;
  for (let match = matcher.exec(source); match; match = matcher.exec(source)) {
    const dialog = extractBalancedElement(source, match.index, 'dialog');
    if (dialog) dialogs.push(dialog);
  }
  return dialogs;
}

function getAttribute(markup, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(markup);
  return match?.[1] || '';
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function getHeaderActionGroup(dialog) {
  const headerMatch = /<div\b[^>]*class="[^"]*\bdialog-header\b[^"]*"[^>]*>/i.exec(dialog);
  if (!headerMatch) return '';
  const header = extractBalancedElement(dialog, headerMatch.index, 'div');
  const groupMatch = /<div\b[^>]*class="[^"]*\bapp-action-group\b[^"]*"[^>]*>/i.exec(header);
  if (!groupMatch) return '';
  return extractBalancedElement(header, groupMatch.index, 'div');
}

function getButtons(group) {
  return [...group.matchAll(/<button\b[\s\S]*?<\/button>/gi)].map((match) => match[0]);
}

function getClasses(button) {
  return new Set(getAttribute(button, 'class').split(/\s+/).filter(Boolean));
}

function getButtonText(button) {
  return decodeHtml(button.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}

function getActionRole(button) {
  const label = decodeHtml(getAttribute(button, 'aria-label'));
  const text = getButtonText(button);
  const classes = getClasses(button);
  if (/^(Abbrechen|Schließen)\b/.test(label)) return 'cancel';
  if (classes.has('danger-action') || text.includes('🗑️')) return 'discard';
  if (text.includes('💾') || text.includes('✓') || text.includes('✔')) return 'commit';
  return 'utility';
}

test('shared dialog action geometry stays uniform', () => {
  assert.match(actionStyles, /\.app-action-group\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(actionStyles, /\.app-action-icon\s*\{[\s\S]*?width:\s*40px[\s\S]*?height:\s*40px/);
});

test('all existing dialog header icon groups follow the shared semantic contract', () => {
  const checkedDialogs = [];
  const roleRank = { utility: 0, cancel: 1, discard: 2, commit: 3 };

  for (const [sourceName, source] of sourceEntries) {
    for (const dialog of extractDialogs(source)) {
      const group = getHeaderActionGroup(dialog);
      if (!group) continue;
      const dialogId = getAttribute(dialog.slice(0, dialog.indexOf('>') + 1), 'id') || 'dialog';
      const buttons = getButtons(group);
      const roles = buttons.map(getActionRole);
      checkedDialogs.push(`${sourceName}/${dialogId}`);

      assert.deepEqual(
        roles.map((role) => roleRank[role]),
        roles.map((role) => roleRank[role]).toSorted((left, right) => left - right),
        `${sourceName}/${dialogId}: Hilfsaktionen, Abbrechen, Verwerfen/Löschen und Speichern sind falsch angeordnet`,
      );

      for (const button of buttons) {
        const classes = getClasses(button);
        if (!classes.has('app-action-icon')) continue;
        const label = decodeHtml(getAttribute(button, 'aria-label'));
        const tooltip = decodeHtml(getAttribute(button, 'data-tooltip'));
        const text = getButtonText(button);
        const role = getActionRole(button);

        assert.ok(label, `${sourceName}/${dialogId}: Icon-Aktion benötigt ein aria-label`);
        assert.equal(tooltip, label, `${sourceName}/${dialogId}: Tooltip und aria-label müssen übereinstimmen`);

        if (role === 'cancel') {
          assert.ok(classes.has('ghost'), `${sourceName}/${dialogId}: Abbrechen/Schließen muss neutral dargestellt sein`);
          assert.match(text, /❌/, `${sourceName}/${dialogId}: Abbrechen/Schließen benötigt das ❌-Icon`);
        } else if (role === 'discard') {
          assert.ok(classes.has('danger-action'), `${sourceName}/${dialogId}: Verwerfen/Löschen muss als Danger-Aktion dargestellt sein`);
          assert.ok(!classes.has('ghost'), `${sourceName}/${dialogId}: Verwerfen/Löschen darf nicht zugleich Ghost-Aktion sein`);
          assert.match(text, /🗑️/, `${sourceName}/${dialogId}: Verwerfen/Löschen benötigt das 🗑️-Icon`);
        } else if (role === 'commit') {
          assert.ok(!classes.has('ghost'), `${sourceName}/${dialogId}: Speichern/Übernehmen muss hervorgehoben sein`);
          assert.ok(!classes.has('danger-action'), `${sourceName}/${dialogId}: Speichern/Übernehmen darf nicht destruktiv aussehen`);
          assert.match(text, /💾|✓|✔️?/, `${sourceName}/${dialogId}: Speichern/Übernehmen benötigt ein Commit-Icon`);
        } else {
          assert.ok(classes.has('ghost'), `${sourceName}/${dialogId}: Hilfsaktionen müssen neutral dargestellt sein`);
        }
      }
    }
  }

  assert.ok(checkedDialogs.length >= 20, 'Der Vertrag muss die Dialogköpfe aller App-Bereiche erfassen');
});
