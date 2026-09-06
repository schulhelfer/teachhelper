import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const BACKSLASH = String.fromCharCode(92);

const SAFE_WRAPPERS = [
  /^(?:this\.)?escapeHtml\s*\(/,
  /^(?:Number|parseInt|parseFloat)\s*\(/,
  /^(?:this\.)?(?:build|render)[A-Za-z0-9_$]*(?:Markup|Card|Icon|Html)\s*\(/,
  /^(?:this\.)?format[A-Za-z0-9_$]*\s*\(/,
  /^(?:this\.)?normalize[A-Za-z0-9_$]*\s*\(/,
  /^(?:this\.)?get(?:Default)?[A-Za-z0-9_$]*(?:HalfYear|Count|Index|Id|Number)\s*\(/,
];

const FREE_TEXT = /(?:^|\.)(?:name|vorname|nachname|title|titel|topic|thema|label|bezeichnung|text|message|nachricht|comment|kommentar|bemerkung|description|beschreibung|email|mail|subject|betreff|note|notiz|remark|value|content|inhalt|summary|reason|grund|search|query|filename|dateiname)$/i;

const NUMERIC_ISH = /(?:^|\.)(?:[A-Za-z0-9_$]*(?:Id|Ids|Index|Count|Number|Position|Order|Period|Level|Width|Height|Size|Length)|id|ids|index|period|lesson|weight|total|count|number|position|order|row|column|slot|day|month|year|hour|minute|length|size|width|height|left|top|percent|share|ratio|score|points|min|max|step|level|grade|halfYear|checked|disabled|selected|hidden|expanded)$/;

const SCREAMING_CASE = /^[A-Z][A-Z0-9_]*(?:\[[^\]]*\])?$/;

const PREBUILT_MARKUP = /^[a-z][\w$]*(?:Markup|Html|Class|Threshold)$/;

const TRAILING_SAFE_METHODS = /\.(?:slice|padStart|padEnd|toFixed|trim|toUpperCase|toLowerCase)\s*\([^()]*\)\s*$/;

const KNOWN_SAFE_LOCALS = new Map([
  ['main.js', new Set([
    'label',
    'id',
  ])],
  ['modules/grades/app.js', new Set([
    'tooltip',
  ])],
]);

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

function findTemplateEnd(source, backtickIndex) {
  let index = backtickIndex + 1;
  while (index < source.length) {
    if (source[index] === BACKSLASH) {
      index += 2;
      continue;
    }
    if (source[index] === '`') return index;
    if (source[index] === '$' && source[index + 1] === '{') {
      const span = readBalanced(source, index + 1, '{', '}');
      if (span) {
        index = span.end + 1;
        continue;
      }
    }
    index += 1;
  }
  return -1;
}

function findTopLevel(expression, character, from = 0) {
  let depth = 0;
  for (let index = from; index < expression.length; index += 1) {
    const current = expression[index];
    if (current === BACKSLASH) {
      index += 1;
      continue;
    }
    if (current === '(' || current === '[' || current === '{') depth += 1;
    else if (current === ')' || current === ']' || current === '}') depth -= 1;
    else if (current === '"' || current === "'" || current === '`') {
      const quote = current;
      index += 1;
      while (index < expression.length && expression[index] !== quote) {
        if (expression[index] === BACKSLASH) index += 1;
        index += 1;
      }
    } else if (depth === 0 && expression.startsWith(character, index)) {
      return index;
    }
  }
  return -1;
}

function spansWholeExpression(expression) {
  const parenIndex = expression.indexOf('(');
  if (parenIndex < 0) return false;
  const span = readBalanced(expression, parenIndex, '(', ')');
  if (!span) return false;
  const tail = expression.slice(span.end + 1).trim();
  return tail === '' || TRAILING_SAFE_METHODS.test(expression);
}

function stripOuterParens(expression) {
  let current = expression.trim();
  while (current.startsWith('(')) {
    const span = readBalanced(current, 0, '(', ')');
    if (!span || span.end !== current.length - 1) break;
    current = current.slice(1, -1).trim();
  }
  return current;
}

function isStringLiteral(expression) {
  return /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(expression);
}

function isNumericLiteral(expression) {
  return /^-?\d+(?:\.\d+)?$/.test(expression);
}

function isBareChain(expression) {
  return /^[A-Za-z_$][\w$]*(?:\s*\?\.\s*|\s*\.\s*)?(?:[A-Za-z_$][\w$]*(?:\s*\?\.\s*|\s*\.\s*)?)*$/.test(expression)
    && !expression.includes('(');
}

function isSafeExpression(expression, context) {
  const current = stripOuterParens(expression);
  if (!current) return true;
  if (current === '@TPL@') return true;
  if (isStringLiteral(current) || isNumericLiteral(current)) return true;

  const questionIndex = findTopLevel(current, '?');
  if (questionIndex >= 0 && current[questionIndex + 1] !== '.') {
    const colonIndex = findTopLevel(current, ':', questionIndex + 1);
    if (colonIndex >= 0) {
      return isSafeExpression(current.slice(questionIndex + 1, colonIndex), context)
        && isSafeExpression(current.slice(colonIndex + 1), context);
    }
  }

  for (const operator of ['??', '||']) {
    const operatorIndex = findTopLevel(current, operator);
    if (operatorIndex >= 0) {
      return isSafeExpression(current.slice(0, operatorIndex), context)
        && isSafeExpression(current.slice(operatorIndex + operator.length), context);
    }
  }

  if (SAFE_WRAPPERS.some((pattern) => pattern.test(current)) && spansWholeExpression(current)) {
    return true;
  }

  if (/\.map\s*\(/.test(current) && /\.join\s*\(\s*(?:""|''|@TPL@)\s*\)\s*$/.test(current)) {
    return true;
  }

  if (isBareChain(current)) {
    if (KNOWN_SAFE_LOCALS.get(context)?.has(current)) return true;
    if (FREE_TEXT.test(current)) return false;
    if (SCREAMING_CASE.test(current)) return true;
    if (PREBUILT_MARKUP.test(current)) return true;
    return NUMERIC_ISH.test(current);
  }

  if (SCREAMING_CASE.test(current)) return true;

  if (/^[\s\w$.+\-*/%()?:<>=!&|]+$/.test(current) && !FREE_TEXT.test(current)) {
    const identifiers = current.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) || [];
    return identifiers.every((identifier) => (
      KNOWN_SAFE_LOCALS.get(context)?.has(identifier)
      || SCREAMING_CASE.test(identifier)
      || (!FREE_TEXT.test(identifier) && NUMERIC_ISH.test(identifier))
    ));
  }

  return false;
}

function stripTemplates(expression) {
  let output = '';
  let index = 0;
  while (index < expression.length) {
    if (expression[index] === BACKSLASH) {
      output += expression.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (expression[index] === '`') {
      const end = findTemplateEnd(expression, index);
      if (end < 0) {
        output += expression.slice(index);
        break;
      }
      output += '@TPL@';
      index = end + 1;
      continue;
    }
    output += expression[index];
    index += 1;
  }
  return output;
}

function nestedTemplates(expression) {
  const templates = [];
  let index = 0;
  while (index < expression.length) {
    if (expression[index] === BACKSLASH) {
      index += 2;
      continue;
    }
    if (expression[index] === '`') {
      const end = findTemplateEnd(expression, index);
      if (end < 0) break;
      templates.push(expression.slice(index + 1, end));
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return templates;
}

function isEscapedAncestor(expression) {
  const current = stripOuterParens(expression);
  return /^(?:this\.)?escapeHtml\s*\(/.test(current) && spansWholeExpression(current);
}

function collectInterpolations(template, sink) {
  let index = 0;
  while (index < template.length) {
    const start = template.indexOf('${', index);
    if (start < 0) break;
    const span = readBalanced(template, start + 1, '{', '}');
    if (!span) break;
    index = span.end + 1;
    const expression = template.slice(span.start, span.end).replace(/\s+/g, ' ').trim();
    if (isEscapedAncestor(expression)) {
      sink.push(expression);
      continue;
    }
    for (const nested of nestedTemplates(expression)) {
      collectInterpolations(nested, sink);
    }
    sink.push(expression);
  }
}

function findUnescapedHtmlInterpolations(source, context = '') {
  const offenders = [];
  for (const match of source.matchAll(/\.(?:innerHTML|outerHTML)\s*=\s*/g)) {
    const after = match.index + match[0].length;
    if (source[after] !== '`') continue;
    const end = findTemplateEnd(source, after);
    if (end < 0) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const sink = [];
    collectInterpolations(source.slice(after + 1, end), sink);
    const reported = new Set();
    for (const expression of sink) {
      if (isSafeExpression(stripTemplates(expression), context)) continue;
      const snippet = expression.replace(/\s+/g, ' ').slice(0, 120);
      if (reported.has(snippet)) continue;
      reported.add(snippet);
      offenders.push({ line, snippet });
    }
  }
  return offenders;
}

test('innerHTML template interpolations escape user-authored text', async () => {
  const files = await collectSourceFiles(new URL('../src/', import.meta.url));
  assert.ok(files.length > 10, 'die Quelldateien müssen gefunden werden');

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const relative = file.pathname.split('/src/')[1];
    for (const offender of findUnescapedHtmlInterpolations(source, relative)) {
      offenders.push(`${relative}:${offender.line} → ${offender.snippet}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    [
      'Freitext in innerHTML-Templates muss escapeHtml() durchlaufen.',
      'Erlaubt sind escapeHtml(...), Number/parseInt/parseFloat(...),',
      'format*/normalize*-Funktionen, build*Markup()/render*Card()-Bausteine,',
      'SCREAMING_CASE-Konstanten sowie numerische Felder (id, index, count, period ...).',
      'Entweder escapeHtml(...) ergänzen oder – falls der Wert nachweislich maschinell',
      'erzeugt ist – den Baustein in die Liste der vertrauenswürdigen Builder in diesem',
      'Test aufnehmen und dort begründen:',
      offenders.join('\n'),
    ].join('\n'),
  );
});

test('the innerHTML escaping scanner recognises safe and unsafe interpolations', () => {
  const flagged = (source, context = '') => findUnescapedHtmlInterpolations(source, context).length;

  assert.equal(flagged('el.innerHTML = `<b>${student.name}</b>`;'), 1);
  assert.equal(flagged('el.innerHTML = `<b>${assessment.title}</b>`;'), 1);
  assert.equal(flagged('el.innerHTML = `<b>${category.name}</b>`;'), 1);
  assert.equal(
    flagged('el.innerHTML = `<b>${entry.bemerkung}</b>`;'),
    1,
    'deutsche Freitextfelder dürfen nicht durchrutschen',
  );
  assert.equal(
    flagged('el.innerHTML = `<b>${student.spitzname}</b>`;'),
    1,
    'unbekannte Felder gelten als unsicher',
  );
  assert.equal(
    flagged('el.innerHTML = `<ul>${rows.map((row) => `<li>${row.name}</li>`).join("")}</ul>`;'),
    1,
    'die Rekursion muss in verschachtelte Templates absteigen',
  );

  assert.equal(flagged('el.innerHTML = `<b>${escapeHtml(student.name)}</b>`;'), 0);
  assert.equal(
    flagged('el.innerHTML = `<option>${escapeHtml(`${category.name}${formatGradeWeightPercentSuffix(category.weight)}`)}</option>`;'),
    0,
    'ein escapender Vorfahr deckt die verschachtelte Interpolation ab',
  );
  assert.equal(flagged('el.innerHTML = `<b>${buildGradeAssessmentDisplayTitleMarkup(cell.assessment.title)}</b>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<b>${index + 1}</b>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<b>${rowIndex}</b><i>${cell.period}</i>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<b>${formatGradeWeightPercentSuffix(category.weight)}</b>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<b>${GRADE_VAULT_LOCKED_ICON}</b>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<option${Number(a.id) === Number(b.id) ? " selected" : ""}>x</option>`;'), 0);
  assert.equal(flagged('el.innerHTML = `<span>${formatDate(dayIso).slice(0, 6)}</span>`;'), 0);
  assert.equal(flagged('el.innerHTML = "";'), 0);
  assert.equal(
    flagged('element.textContent = `${student.name}`;'),
    0,
    'nur innerHTML/outerHTML werden geprüft',
  );
  assert.equal(
    flagged('seat.innerHTML = `<div>${label}</div><input name="seat-topic-${id}">`;', 'main.js'),
    0,
    'maschinell erzeugte Bezeichner aus main.js sind ausgenommen',
  );
});
