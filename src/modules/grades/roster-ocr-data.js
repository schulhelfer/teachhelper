import { normalizeGradeClassFlair } from "../../shared/school-data/grades.js";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const NAME_EDGE_NOISE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const cleanNamePart = (value) => clean(value)
  .split(" ")
  .map((word) => word.replace(NAME_EDGE_NOISE, ""))
  .filter((word) => word && !/\p{N}/u.test(word))
  .join(" ");

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
  if (letter) return { key: `${digits}${letter.toLowerCase()}`, flair: letterFlair(letter) };
  const grade = digits.slice(0, -1);
  const flair = DIGIT_LOOKALIKES[digits.slice(-1)];
  if (!flair || !isPlausibleGrade(grade)) return null;
  const fits = contextGrade ? grade === contextGrade : !leading && Number(digits) > MAX_GRADE;
  return fits ? { key: `${grade}${flair}`, flair } : null;
}

export function parseOcrNames(text, order = "last-first") {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contextGrade = dominantGrade(lines);
  return lines.map((raw) => {
    const classes = new Map();
    const names = raw.replace(CLASS_TOKEN, (match, boundary, digits, letter, offset) => {
      const token = resolveClassToken(digits, letter, !raw.slice(0, offset).trim(), contextGrade);
      if (!token) return match;
      classes.set(token.key, token.flair);
      return `${boundary}  `;
    });
    const classFlair = classes.size === 1 ? [...classes.values()][0] : "";
    const line = names.replace(/^\d+[.)\s]+/, "").trim();
    const parts = line.split(/\s*[,;\t]\s*| {2,}/).filter(Boolean);
    if (parts.length < 2) {
      const words = line.split(/\s+/);
      parts.splice(0, parts.length, words.shift() || "", words.join(" "));
    }
    const left = cleanNamePart(parts[0]);
    const right = cleanNamePart(parts.slice(1).join(" "));
    const lastName = order === "last-first" ? left : right;
    const firstName = order === "last-first" ? right : left;
    return { raw, lastName, firstName, classFlair };
  });
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
