import { FILE_LIMITS } from './file-guards.js';

export function detectDelimiter(value, rowLimit = 8) {
  const candidates = [';', ',', '\t'];
  const scores = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let inQuotes = false;
  let sampledRows = 0;
  for (const line of String(value || '').split(/\r?\n/)) {
    if (!inQuotes && (!line.trim() || /^sep\s*=/i.test(line.trim()))) continue;
    for (const character of line) {
      if (character === '"') inQuotes = !inQuotes;
      else if (!inQuotes && scores.has(character)) scores.set(character, scores.get(character) + 1);
    }
    if (!inQuotes && ++sampledRows === rowLimit) break;
  }
  return candidates.reduce((best, delimiter) => scores.get(delimiter) > scores.get(best) ? delimiter : best);
}

export function parseCSV(text, { delimiter = detectDelimiter(text), strictQuotes = false } = {}) {
  const maxRows = FILE_LIMITS.CSV_MAX_ROWS;
  const maxColumns = FILE_LIMITS.CSV_MAX_COLUMNS;
  const maxCellChars = FILE_LIMITS.CSV_MAX_CELL_CHARS;
  const rows = [];
  let i = 0, cur = '', inQ = false; const out = [];
  let quoteClosed = false;
  const invalidQuote = () => new Error(`CSV-Zeile ${rows.length + 1} enthält ein fehlerhaftes Anführungszeichen.`);
  const push = () => {
    if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
    if (out.length >= maxColumns) throw new Error(`CSV enthält zu viele Spalten: maximal ${maxColumns}.`);
    out.push(cur);
    cur = '';
    quoteClosed = false;
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
      else {
        if (strictQuotes && !inQ && (quoteClosed || cur.trim())) throw invalidQuote();
        inQ = !inQ;
        quoteClosed = !inQ;
      }
    } else if (ch === delimiter && !inQ) { push(); }
    else if ((ch === '\n') && !inQ) { push(); flush(); }
    else if ((ch === '\r') && !inQ) { }
    else {
      if (strictQuotes && quoteClosed && ch.trim()) throw invalidQuote();
      cur += ch;
      if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
    }
  }
  if (strictQuotes && inQ) throw invalidQuote();
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
