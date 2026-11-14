import { normalizeGradeClassFlair } from "../../shared/school-data/grades.js";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const EDGE_PUNCTUATION = String.raw`\s.,;:!?"'„“”‚‘’«»()\[\]{}|•·*_\-–—/\\`;
const NAME_EDGE_PUNCTUATION = new RegExp(`^[${EDGE_PUNCTUATION}]+|[${EDGE_PUNCTUATION}]+$`, "gu");
const NAME_SYMBOL = /[^\p{L}\p{M}\-'’.]/gu;
const ACCENT_SUGGESTIONS = Object.freeze({ ũ: "ü", Ũ: "Ü", õ: "ö", Õ: "Ö", ẽ: "ë", ã: "ä", Ã: "Ä" });
const ACCENT_SUGGESTION_PATTERN = new RegExp(`[${Object.keys(ACCENT_SUGGESTIONS).join("")}]`, "gu");
const VIETNAMESE_MARKERS = /[ăđơưĂĐƠƯĩĨẠ-ỹ]/u;
const MIN_ACCENT_HINT_LETTERS = 4;

const stripEdges = (word) => String(word || "").replace(NAME_EDGE_PUNCTUATION, "");

function nameWordNotes(word) {
  const notes = [];
  const symbols = [...new Set(word.match(NAME_SYMBOL) || [])];
  if (symbols.length) {
    notes.push(`„${word}“ enthält ein unsicher erkanntes Zeichen („${symbols.join("“, „")}“) – bitte prüfen`);
  }
  const letters = word.match(/\p{L}/gu) || [];
  const suggested = word.replace(ACCENT_SUGGESTION_PATTERN, (char) => ACCENT_SUGGESTIONS[char]);
  const looksMisread = suggested !== word
    && letters.length >= MIN_ACCENT_HINT_LETTERS
    && !VIETNAMESE_MARKERS.test(word.replace(ACCENT_SUGGESTION_PATTERN, ""));
  if (looksMisread) notes.push(`„${word}“ – Akzent prüfen (evtl. „${suggested}“)`);
  return notes;
}

const cleanNamePart = (value, notes = null) => clean(value)
  .split(" ")
  .map(stripEdges)
  .filter((word) => {
    if (!word) return false;
    if (/\p{N}/u.test(word)) {
      notes?.push(`„${word}“ aus dem Namen entfernt`);
      return false;
    }
    notes?.push(...nameWordNotes(word));
    return true;
  })
  .join(" ");

function splitNameLine(text, order, notes) {
  const line = String(text || "").replace(/^\d+[.)\s]+/, "").trim();
  const parts = line.split(/\s*[,;\t]\s*| {2,}/).filter(Boolean);
  if (parts.length < 2) {
    const words = line.split(/\s+/);
    parts.splice(0, parts.length, words.shift() || "", words.join(" "));
  }
  const left = cleanNamePart(parts[0], notes);
  const right = cleanNamePart(parts.slice(1).join(" "), notes);
  return order === "last-first" ? { lastName: left, firstName: right } : { lastName: right, firstName: left };
}

const CLASS_TOKEN = /(^|[\s,;|])(\d+)[ \u00a0]*([\p{L}(\u00a9]?)[.,:)\]]*(?=$|[\s,;|])/gu;
const LETTER_LOOKALIKES = Object.freeze({ o: "c", "(": "c", "\u00a9": "c" });
const DIGIT_LOOKALIKES = Object.freeze({ 0: "c", 6: "b" });
const MAX_GRADE = 13;

const letterFlair = (letter) => normalizeGradeClassFlair(LETTER_LOOKALIKES[letter.toLowerCase()] || letter);

const isPlausibleGrade = (digits) => /^[1-9]\d?$/.test(digits) && Number(digits) <= MAX_GRADE;

function dominantGrade(lines) {
  const counts = new Map();
  for (const line of lines) {
    for (const [, , digits, letter] of line.matchAll(CLASS_TOKEN)) {
      if (letter && letterFlair(letter)) counts.set(digits, (counts.get(digits) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function resolveClassToken(digits, letter, leading, contextGrade) {
  if (letter) {
    const lower = letter.toLowerCase();
    return { key: `${digits}${lower}`, flair: letterFlair(letter), inferred: Boolean(LETTER_LOOKALIKES[lower]) };
  }
  const grade = digits.slice(0, -1);
  const flair = DIGIT_LOOKALIKES[digits.slice(-1)];
  if (!flair || !isPlausibleGrade(grade)) return null;
  const fits = contextGrade ? grade === contextGrade : !leading && Number(digits) > MAX_GRADE;
  return fits ? { key: `${grade}${flair}`, flair, inferred: true } : null;
}

const classReadNote = (cell, flair) => `„${cell}“ als Klasse ${flair} gelesen`;
const invalidClassNote = (cell) => `„${cell}“ entfernt – keine gültige Klasse`;

const UPPERCASE_SHARE_LIMIT = 0.5;

const nameWordsOf = (row) => `${row.lastName} ${row.firstName}`.split(" ").filter((word) => /\p{L}/u.test(word));
const isUppercaseWord = (word) => (word.match(/\p{L}/gu) || []).length >= 2
  && word === word.toLocaleUpperCase("de") && word !== word.toLocaleLowerCase("de");

function flagUppercaseWords(rows) {
  const words = rows.flatMap(nameWordsOf);
  const uppercase = words.filter(isUppercaseWord);
  if (!uppercase.length || uppercase.length / words.length >= UPPERCASE_SHARE_LIMIT) return rows;
  for (const row of rows) {
    for (const word of nameWordsOf(row).filter(isUppercaseWord)) {
      row.notes.push(`„${word}“ in Großbuchstaben erkannt – evtl. Akzent verloren, bitte prüfen`);
    }
  }
  return rows;
}

export function parseOcrNames(text, order = "last-first") {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contextGrade = dominantGrade(lines);
  return flagUppercaseWords(lines.map((raw) => {
    const classes = new Map();
    const notes = [];
    const names = raw.replace(CLASS_TOKEN, (match, boundary, digits, letter, offset) => {
      const token = resolveClassToken(digits, letter, !raw.slice(0, offset).trim(), contextGrade);
      if (!token) return match;
      classes.set(token.key, { ...token, cell: match.slice(boundary.length).trim() });
      return `${boundary}  `;
    });
    const tokens = [...classes.values()];
    const single = tokens.length === 1 ? tokens[0] : null;
    if (tokens.length > 1) {
      notes.push(`Mehrere Klassen erkannt (${tokens.map((token) => `„${token.cell}“`).join(", ")}) – keine übernommen`);
    } else if (single && !single.flair) {
      notes.push(invalidClassNote(single.cell));
    } else if (single?.inferred) {
      notes.push(classReadNote(single.cell, single.flair));
    }
    return { raw, ...splitNameLine(names, order, notes), classFlair: single?.flair || "", notes };
  }));
}

export function ocrLinesFromTsv(tsv) {
  const lines = new Map();
  for (const row of String(tsv || "").split(/\r?\n/)) {
    const cells = row.split("\t");
    if (cells.length < 12 || cells[0] !== "5") continue;
    const text = cells.slice(11).join(" ").trim();
    const [left, , width, height] = cells.slice(6, 10).map(Number);
    if (!text || ![left, width, height].every(Number.isFinite)) continue;
    const key = cells.slice(2, 5).join(":");
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ text, left, right: left + width, height });
  }
  return [...lines.values()].map((words) => ({ words: words.sort((a, b) => a.left - b.left) }));
}

const STRICT_CLASS = /^\d{1,2}([a-g])$/i;
const CLASS_HEADER = /^kl(asse)?$/i;
const MAX_CLASS_CELL_CHARS = 4;
const COLUMN_GAP_FACTOR = 0.9;

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const wordCenter = (word) => (word.left + word.right) / 2;

function detectClassColumn(lines) {
  const words = lines.flatMap((line) => line.words);
  const anchors = words.filter((word) => STRICT_CLASS.test(stripEdges(word.text)));
  if (!anchors.length) return null;
  const size = median(anchors.map((word) => word.height));
  const center = median(anchors.map(wordCenter));
  const aligned = words.filter((word) => (
    stripEdges(word.text).length <= MAX_CLASS_CELL_CHARS
    && Math.abs(wordCenter(word) - center) <= size
  ));
  if (aligned.length < 2) return null;
  return {
    left: Math.min(...aligned.map((word) => word.left)) - size / 2,
    right: Math.max(...aligned.map((word) => word.right)) + size / 2,
  };
}

function isClassCellWord(word, column) {
  const text = stripEdges(word.text);
  const center = wordCenter(word);
  if (center < column.left || center > column.right) return false;
  return CLASS_HEADER.test(text) || text.length <= MAX_CLASS_CELL_CHARS;
}

function resolveClassCell(words) {
  const cell = stripEdges(words.map((word) => word.text).join(""));
  if (!cell || CLASS_HEADER.test(cell)) return { flair: "", note: "" };
  const strict = cell.match(STRICT_CLASS);
  if (strict) return { flair: strict[1].toLowerCase(), note: "" };
  const last = cell.slice(-1);
  const flair = letterFlair(last) || DIGIT_LOOKALIKES[last] || "";
  return { flair, note: flair ? classReadNote(cell, flair) : invalidClassNote(cell) };
}

function joinWords(words) {
  const gap = median(words.map((word) => word.height)) * COLUMN_GAP_FACTOR;
  return words.reduce((text, word, index) => {
    if (!index) return word.text;
    return `${text}${word.left - words[index - 1].right > gap ? "  " : " "}${word.text}`;
  }, "");
}

export function parseOcrLayout(lines, order = "last-first") {
  const filled = (lines || []).filter((line) => line?.words?.length);
  const column = detectClassColumn(filled);
  if (!column) return parseOcrNames(filled.map((line) => joinWords(line.words)).join("\n"), order);
  return flagUppercaseWords(filled.map((line) => {
    const cellWords = line.words.filter((word) => isClassCellWord(word, column));
    const nameWords = line.words.filter((word) => !cellWords.includes(word));
    const cell = resolveClassCell(cellWords);
    const notes = cell.note ? [cell.note] : [];
    const raw = line.words.map((word) => word.text).join(" ");
    return { raw, ...splitNameLine(joinWords(nameWords), order, notes), classFlair: cell.flair, notes };
  }));
}

export function importableOcrNames(rows) {
  return rows.map((row) => ({
    lastName: clean(row.lastName), firstName: clean(row.firstName),
    classFlair: normalizeGradeClassFlair(row.classFlair),
  })).filter((row) => row.lastName || row.firstName);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function boundCrop(crop) {
  const width = clamp(crop.width, 0.01, 1);
  const height = clamp(crop.height, 0.01, 1);
  return { x: clamp(crop.x, 0, 1 - width), y: clamp(crop.y, 0, 1 - height), width, height };
}

export function changeCrop(crop, handle, dx, dy) {
  if (handle === "move") return boundCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
  let { x, y } = crop;
  let right = x + crop.width;
  let bottom = y + crop.height;
  if (handle.includes("w")) x = clamp(x + dx, 0, right - 0.01);
  if (handle.includes("e")) right = clamp(right + dx, x + 0.01, 1);
  if (handle.includes("n")) y = clamp(y + dy, 0, bottom - 0.01);
  if (handle.includes("s")) bottom = clamp(bottom + dy, y + 0.01, 1);
  return boundCrop({ x, y, width: right - x, height: bottom - y });
}

export function cropPixels(crop, width, height) {
  const bounded = boundCrop(crop);
  const x = Math.floor(bounded.x * width);
  const y = Math.floor(bounded.y * height);
  return {
    x, y,
    width: Math.max(1, Math.min(width - x, Math.round(bounded.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(bounded.height * height))),
  };
}

export function ocrOutputSize(width, height) {
  const scale = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(4_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
