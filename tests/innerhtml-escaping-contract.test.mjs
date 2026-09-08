import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const REVIEWED = new Map([
  ['src/app/shell.js', new Set([
    'state.chromeCollapsed ? CHROME_TOGGLE_EXPAND_ICON : CHROME_TOGGLE_COLLAPSE_ICON',
    'locked ? GRADE_VAULT_LOCKED_ICON : GRADE_VAULT_UNLOCKED_ICON',
  ])],
  ['src/modules/grades/app.js', new Set([
    'formMode === normalizedMode ? GRADE_VAULT_UNLOCKED_ICON : ""',
    'GRADE_VAULT_UNLOCKED_ICON',
  ])],
  ['src/modules/planning/app.js', new Set([
    'seatplanNavigationState.symbol', 'performanceNavigationState.symbol',
    '`<table><tbody>${cells}</tbody></table><p><br></p>`',
  ])],
  ['src/modules/merger/app.js', new Set(['buildRotateIconMarkup(degrees)'])],
  ['src/modules/workspace/components.js', new Set(['DATABASE_PANEL_MARKUP', 'ARCHIVE_DIALOG_MARKUP'])],
]);

function quotedEnd(source, start) {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (quote === '`' && source.startsWith('${', index)) {
      index = groupEnd(source, index + 1);
      continue;
    }
    if (source[index] === quote) return index;
  }
  throw new Error('Unterminated string in sink scanner');
}

function groupEnd(source, start) {
  const close = { '(': ')', '[': ']', '{': '}' }[source[start]];
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if ('\'"`'.includes(char)) index = quotedEnd(source, index);
    else if ('([{'.includes(char)) index = groupEnd(source, index);
    else if (char === close) return index;
  }
  throw new Error('Unterminated group in sink scanner');
}

function expressionEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if ('\'"`'.includes(char)) index = quotedEnd(source, index);
    else if ('([{'.includes(char)) index = groupEnd(source, index);
    else if (';,)}]'.includes(char)) return index;
  }
  return source.length;
}

function isStaticLiteral(source) {
  return !!source && '\'"`'.includes(source[0])
    && quotedEnd(source, 0) === source.length - 1
    && !(source[0] === '`' && source.includes('${'));
}

function findSinks(source) {
  const sinks = [];
  const pattern = /(?:\.(innerHTML|outerHTML|srcdoc)|\[\s*['"](innerHTML|outerHTML|srcdoc)['"]\s*\])\s*(\+?=)(?!=)|(?:\.(insertAdjacentHTML|createContextualFragment|parseFromString|setHTMLUnsafe|setHTML)|\[\s*['"](insertAdjacentHTML|createContextualFragment|parseFromString|setHTMLUnsafe|setHTML)['"]\s*\])\s*\(|\bdocument\s*\.\s*(write|writeln)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const sink = match[1] || match[2] || match[4] || match[5] || match[6];
    let start = match.index + match[0].length;
    if (sink === 'insertAdjacentHTML') start = expressionEnd(source, start) + 1;
    const end = expressionEnd(source, start);
    sinks.push({ sink, operator: match[3], value: source.slice(start, end).trim(), offset: match.index });
  }
  for (const match of source.matchAll(/\.execCommand\(\s*['"]insertHTML['"]\s*,/g)) {
    const start = expressionEnd(source, match.index + match[0].length) + 1;
    sinks.push({ sink: 'execCommand', value: source.slice(start, expressionEnd(source, start)).trim(), offset: match.index });
  }
  for (const match of source.matchAll(/\bsrcdoc\s*=|\.setAttribute\(\s*['"]srcdoc['"]\s*,/g)) {
    if (!sinks.some(({ offset }) => Math.abs(offset - match.index) < 2)) {
      sinks.push({ sink: 'srcdoc', value: '<attribute>', offset: match.index });
    }
  }
  return sinks;
}

function violations(source, path = '') {
  return findSinks(source).filter(({ sink, operator, value, offset }) => {
    if (sink === 'srcdoc' || sink === 'write' || sink === 'writeln') return true;
    if (isStaticLiteral(value)) return false;
    if (operator !== '+=' && REVIEWED.get(path)?.has(value.replace(/\s+/g, ' '))) return false;
    if (path === 'src/shared/planning-rich-text.js' && sink === 'innerHTML' && value === 'html') {
      return !/template\.innerHTML\s*=\s*html;/.test(source.slice(offset - 8, offset + 30));
    }
    if (path === 'src/shared/docx-template.js' && sink === 'parseFromString' && value === 'xml') {
      return !source.slice(offset).startsWith('.parseFromString(xml, "application/xml")');
    }
    return true;
  });
}

async function sources(directory = new URL('../', import.meta.url), prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['vendor', 'node_modules', 'tests'].includes(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...await sources(url, path + '/'));
    else if (/\.(?:m?js|html)$/.test(entry.name)) files.push({ path, source: await readFile(url, 'utf8') });
  }
  return files;
}

test('first-party HTML sinks accept only static markup and specifically reviewed boundaries', async () => {
  const files = await sources();
  assert.ok(files.length > 50);
  const offenders = files.flatMap(({ path, source }) => violations(source, path).map(({ sink, value, offset }) =>
    `${path}:${source.slice(0, offset).split('\n').length} ${sink}: ${value.slice(0, 120)}`));
  assert.deepEqual(offenders, [], 'Dynamic text must use DOM APIs; new parser exceptions require an explicit review.');
});

test('sink scanning rejects names, IDs, formatter results, builders and indirect HTML strings', () => {
  for (const expression of ['student.name', 'student.id', 'rowIndex', 'formatDate(value)', 'normalizeLabel(value)', 'buildUnsafeMarkup(value)', 'html']) {
    assert.equal(violations(`el.innerHTML = ${expression};`).length, 1, expression);
    assert.equal(violations('el.innerHTML = `<b>${' + expression + '}</b>`;').length, 1, expression);
  }
  for (const source of [
    'el.innerHTML += user;', 'el.outerHTML = user;', 'el["innerHTML"] = user;',
    'el.insertAdjacentHTML("beforeend", user);', 'el["insertAdjacentHTML"]("beforeend", user);',
    'range.createContextualFragment(user);', 'parser.parseFromString(user, "text/html");',
    'el.srcdoc = user;', 'el.setAttribute("srcdoc", user);',
    'document.write(user);', 'document.writeln(user);', 'el.setHTMLUnsafe(user);',
    'document.execCommand("insertHTML", false, user);',
    'el.innerHTML = `<ul>${rows.map(row => `<li>${row.name}</li>`).join("")}</ul>`;',
    'el.innerHTML = "<b>" + user + "</b>";',
  ]) assert.ok(violations(source).length > 0, source);
});

test('sink scanning permits static templates and ordinary DOM text assignments', () => {
  for (const source of [
    'el.innerHTML = "";', 'el.innerHTML = `<span class="icon">✓</span>`;',
    'el.insertAdjacentHTML("beforeend", "<div></div>");',
    'el.textContent = user;', 'el.dataset.studentId = user;', 'el.replaceChildren(node);',
  ]) assert.deepEqual(violations(source), [], source);
  assert.equal(violations('el.innerHTML = GRADE_VAULT_UNLOCKED_ICON;').length, 1, 'No global constant-name exemption');
  assert.equal(violations('el.innerHTML = GRADE_VAULT_UNLOCKED_ICON;', 'src/modules/grades/app.js').length, 0);
});
