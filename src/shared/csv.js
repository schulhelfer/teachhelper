import { FILE_LIMITS } from './file-guards.js';

export function detectDelimiter(value) {
  const candidates = [';', ',', '\t'];
  const lines = String(value || '')
    .split(/\r?\n/)
    .map(line => String(line || ''))
    .filter(line => line.trim() && !/^sep\s*=/.test(line.trim().toLowerCase()))
    .slice(0, 8);
  let best = ';';
  let bestScore = -1;
  candidates.forEach((candidate) => {
    const pattern = candidate === '\t' ? /\t/g : new RegExp(`\\${candidate}`, 'g');
    const score = lines.reduce((sum, line) => sum + ((line.match(pattern) || []).length), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });
  return best;
}

export function parseCSV(text) {
  const delimiter = detectDelimiter(text);
  const maxRows = FILE_LIMITS.CSV_MAX_ROWS;
  const maxColumns = FILE_LIMITS.CSV_MAX_COLUMNS;
  const maxCellChars = FILE_LIMITS.CSV_MAX_CELL_CHARS;
  const rows = [];
  let i = 0, cur = '', inQ = false; const out = [];
  const push = () => {
    if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
    if (out.length >= maxColumns) throw new Error(`CSV enthält zu viele Spalten: maximal ${maxColumns}.`);
    out.push(cur);
    cur = '';
  };
  const flush = () => {
    if (rows.length >= maxRows) throw new Error(`CSV enthält zu viele Zeilen: maximal ${maxRows}.`);
    rows.push(out.slice());
    out.length = 0;
  };
  while (i < text.length) {
    const ch = text[i++];
    if (ch === '"') {
      if (inQ && text[i] == '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delimiter && !inQ) { push(); }
    else if ((ch === '\n') && !inQ) { push(); flush(); }
    else if ((ch === '\r') && !inQ) { }
    else {
      cur += ch;
      if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
    }
  }
  if (cur.length > 0 || out.length > 0) { push(); flush(); }
  return { rows, delimiter };
}

export function normalizeCsvCell(value) {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .trim();
}

export function normalizeCsvHeader(value) {
  return normalizeCsvCell(value).toLocaleLowerCase('de');
}
