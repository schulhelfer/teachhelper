import { installAppTooltips } from "../../shared/app-tooltips.js";
import {
  applyDocumentTheme,
  normalizeThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_APPLY_EVENT,
  THEME_PREFERENCE_CHANGE_EVENT,
  writeThemePreference,
} from "../../shared/theme.js";
import { installTutorialEntryHint } from "../../shared/tutorial-entry-hint.js";
import { installTouchLongPress } from "../../shared/touch-long-press.js";
import {
  PLANNING_RICH_TEXT_COLORS,
  createPlanningRichTextFromPlainText,
  linkifyPlanningRichText,
  planningRichTextFromClipboard,
  planningRichTextFromElement,
  planningRichTextToArchiveBlocks,
  planningRichTextToPlainText,
  renderPlanningRichText
} from "../../shared/planning-rich-text.js";
import {
  normalizePublicSchoolData
} from "../../shared/school-data/index.js";
import { createWorkspaceClient } from "../workspace/client.js";
import { createWorkspaceController } from "../workspace/index.js";
import { installWorkspaceComponents } from "../workspace/components.js";
import { buildWorkspaceArchivePdfBytes, downloadWorkspaceArchivePdf } from "../workspace/archive-pdf.js";
import {
  WORKSPACE_COMMAND_APPLY_SETTINGS,
  WORKSPACE_COMMAND_CREATE_COURSE,
  WORKSPACE_COMMAND_DELETE_COURSE,
  WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
  WORKSPACE_COMMAND_REORDER_COURSES,
  WORKSPACE_COMMAND_UPDATE_COURSE,
  WORKSPACE_ERROR_STALE_STATE
} from "../../shared/school-data/messages.js";

const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr"];
const REQUIRED_HOLIDAYS = [
  "Herbstferien",
  "Weihnachtsferien",
  "Halbjahresferien",
  "Osterferien",
  "Sommerferien"
];
const HOURS_PER_DAY_DEFAULT = 8;
const BREAK_SUPERVISION_AFTER_HOURS = [2, 4, 6];
const ENTFALL_TOPIC_DEFAULT = "Entfall laut Plan";
const WRITTEN_EXAM_TOPIC = "Schriftliche Arbeit";
const DEFAULT_COURSE_COLOR = "#E6194B";
const NO_LESSON_COLOR = "#787878";
const BACKUP_ENABLED_DEFAULT = true;
const BACKUP_INTERVAL_DEFAULT_DAYS = 7;
const BACKUP_INTERVAL_MIN_DAYS = 1;
const BACKUP_INTERVAL_MAX_DAYS = 30;
const SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT = false;
const ARCHIVE_LOCKED_TOOLTIP = "Notenmodul ist gesperrt";
const COLOR_PALETTE = [
  "#FF1744",
  "#2979FF",
  "#00C853",
  "#FF9100",
  "#AA00FF",
  "#00B8D4",
  "#F500A4",
  "#AEEA00",
  "#FFD600",
  "#5E35B1",
  "#00A67A",
  "#FF3D00",
  "#1A237E",
  "#C2185B",
  "#795548"
];

const TUTORIAL_DEMO_MODE = (() => {
  try {
    const value = new URLSearchParams(window.location.search).get("tutorial-demo");
    return value === "planning" ? value : "";
  } catch (_error) {
    return "";
  }
})();

function getParentWorkspaceController() {
  if (TUTORIAL_DEMO_MODE || typeof window === "undefined" || !window.parent || window.parent === window) {
    return null;
  }
  try {
    if (window.parent.location.origin !== window.location.origin) {
      return null;
    }
    return window.parent.__teachhelperWorkspaceController || null;
  } catch (_error) {
    return null;
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function sanitizeArchiveFileName(value, fallback = "Teachhelper-Archiv") {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return text || fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseIsoDate(iso) {
  if (!iso) {
    return null;
  }
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso, days) {
  const value = parseIsoDate(iso);
  value.setDate(value.getDate() + days);
  return toIsoDate(value);
}

function formatDate(iso) {
  const value = parseIsoDate(iso);
  if (!value) {
    return "";
  }
  return value.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatShortDateLabel(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function formatLongDateLabel(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function parseShortDateLabel(value) {
  const match = String(value || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  if (!day || !month) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function dayOfWeekIso(iso) {
  const value = parseIsoDate(iso);
  const weekday = value.getDay();
  return weekday === 0 ? 7 : weekday;
}

function isSchoolWeekdayIso(iso) {
  const weekday = dayOfWeekIso(iso);
  return weekday >= 1 && weekday <= 5;
}

function weekStartFor(iso) {
  const value = parseIsoDate(iso);
  const weekday = dayOfWeekIso(iso);
  value.setDate(value.getDate() - (weekday - 1));
  return toIsoDate(value);
}

function currentWeekStartForDisplay(now = new Date()) {
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const dateIso = toIsoDate(now);
  let start = weekStartFor(dateIso);
  if (weekday > 5 || (weekday === 5 && now.getHours() >= 18)) {
    start = addDays(start, 7);
  }
  return start;
}

function iterIsoDates(startIso, endIso, callback) {
  let current = startIso;
  while (current <= endIso) {
    callback(current);
    current = addDays(current, 1);
  }
}

function isoWeekNumber(iso) {
  const d = parseIsoDate(iso);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

function schoolYearLabel(today = new Date()) {
  const startYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const endYear = startYear + 1;
  return `${startYear}/${endYear}`;
}

function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIsoDate(new Date(year, month - 1, day));
}

function defaultSpecialDays(startYear) {
  const springYear = startYear + 1;
  const easter = parseIsoDate(easterDate(springYear));
  const fromEaster = (delta) => {
    const value = new Date(easter);
    value.setDate(value.getDate() + delta);
    return toIsoDate(value);
  };
  return [
    { name: "Tag der Arbeit", dayDate: toIsoDate(new Date(springYear, 4, 1)) },
    { name: "Tag der Deutschen Einheit", dayDate: toIsoDate(new Date(startYear, 9, 3)) },
    { name: "Karfreitag", dayDate: fromEaster(-2) },
    { name: "Ostermontag", dayDate: fromEaster(1) },
    { name: "Christi Himmelfahrt", dayDate: fromEaster(39) },
    { name: "Tag nach Himmelfahrt", dayDate: fromEaster(40) },
    { name: "Pfingstdienstag", dayDate: fromEaster(51) },
    { name: "Pfingstmontag", dayDate: fromEaster(50) },
    { name: "Reformationstag", dayDate: toIsoDate(new Date(startYear, 9, 31)) }
  ].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
}

function defaultSpecialDayDateForName(name, startYear) {
  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) {
    return null;
  }
  const match = defaultSpecialDays(Number(startYear)).find(
    (item) => String(item.name || "").trim().toLowerCase() === cleanName
  );
  return match ? match.dayDate : null;
}

function defaultHolidayRangesForYear(startYear) {
  const year = Number(startYear);
  if (year === 2024) {
    return {
      Sommerferien: ["2024-06-24", "2024-08-02"],
      Herbstferien: ["2024-10-04", "2024-10-19"],
      Weihnachtsferien: ["2024-12-23", "2025-01-04"],
      Halbjahresferien: ["2025-02-03", "2025-02-04"],
      Osterferien: ["2025-04-07", "2025-04-19"]
    };
  }
  if (year === 2025) {
    return {
      Sommerferien: ["2025-07-03", "2025-08-13"],
      Herbstferien: ["2025-10-13", "2025-10-25"],
      Weihnachtsferien: ["2025-12-22", "2026-01-05"],
      Halbjahresferien: ["2026-02-02", "2026-02-03"],
      Osterferien: ["2026-03-23", "2026-04-07"]
    };
  }
  if (year === 2026) {
    return {
      Sommerferien: ["2026-07-02", "2026-08-12"],
      Herbstferien: ["2026-10-12", "2026-10-24"],
      Weihnachtsferien: ["2026-12-23", "2027-01-09"],
      Halbjahresferien: ["2027-02-01", "2027-02-02"],
      Osterferien: ["2027-03-22", "2027-04-03"]
    };
  }
  if (year === 2027) {
    return {
      Sommerferien: ["2027-07-08", "2027-08-18"],
      Herbstferien: ["2027-10-16", "2027-10-30"],
      Weihnachtsferien: ["2027-12-23", "2028-01-08"],
      Halbjahresferien: ["2028-01-31", "2028-02-01"],
      Osterferien: ["2028-04-10", "2028-04-22"]
    };
  }
  if (year === 2028) {
    return {
      Sommerferien: ["2028-07-20", "2028-08-30"],
      Herbstferien: ["2028-10-23", "2028-11-04"],
      Weihnachtsferien: ["2028-12-27", "2029-01-06"],
      Halbjahresferien: ["2029-02-01", "2029-02-02"],
      Osterferien: ["2029-03-19", "2029-04-03"]
    };
  }
  if (year === 2029) {
    return {
      Sommerferien: ["2029-07-19", "2029-08-29"],
      Herbstferien: ["2029-10-22", "2029-11-02"],
      Weihnachtsferien: ["2029-12-21", "2030-01-05"],
      Halbjahresferien: ["2030-01-31", "2030-02-01"],
      Osterferien: ["2030-04-08", "2030-04-23"]
    };
  }
  if (year === 2030) {
    return {
      Sommerferien: ["2030-07-11", "2030-08-21"]
    };
  }
  return {};
}

function requiredHolidayRowSpecs() {
  return [
    { label: "Sommerferien", occurrence: 0 },
    { label: "Herbstferien", occurrence: 0 },
    { label: "Weihnachtsferien", occurrence: 0 },
    { label: "Halbjahresferien", occurrence: 0 },
    { label: "Osterferien", occurrence: 0 },
    { label: "Sommerferien", occurrence: 1 }
  ];
}

function _requiredHolidayRowsByLabel(ranges) {
  const byLabel = new Map();
  for (const item of ranges || []) {
    const normalized = String(item && item.label ? item.label : "").trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (!byLabel.has(normalized)) {
      byLabel.set(normalized, []);
    }
    byLabel.get(normalized).push(item);
  }
  for (const rows of byLabel.values()) {
    rows.sort((a, b) =>
      String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
    );
  }
  return byLabel;
}

function computeRequiredHolidayMissingDetails(ranges) {
  const details = [];
  const byLabel = _requiredHolidayRowsByLabel(ranges);
  for (const spec of requiredHolidayRowSpecs()) {
    const normalized = String(spec.label || "").toLowerCase();
    const rows = byLabel.get(normalized) || [];
    const row = rows[Number(spec.occurrence) || 0] || null;
    if (normalized === "sommerferien") {
      if (Number(spec.occurrence) === 0) {
        if (!row || !row.endDate) {
          details.push("Sommerferien oben: Enddatum fehlt");
        }
      } else if (!row || !row.startDate) {
        details.push("Sommerferien unten: Startdatum fehlt");
      }
      continue;
    }
    if (!row || !row.startDate || !row.endDate) {
      details.push(`${spec.label}: Start- oder Enddatum fehlt`);
    }
  }
  return details;
}

function computeRequiredHolidayMissingLabels(ranges) {
  const missing = new Set();
  const details = computeRequiredHolidayMissingDetails(ranges);
  for (const detail of details) {
    const text = String(detail || "");
    if (text.toLowerCase().startsWith("sommerferien")) {
      missing.add("Sommerferien");
    } else {
      const [label] = text.split(":");
      if (label) {
        missing.add(label.trim());
      }
    }
  }
  return [...missing];
}

function defaultHolidayRangeForRow(startYear, label, occurrence = 0) {
  const currentDefaults = defaultHolidayRangesForYear(startYear);
  if (String(label || "").toLowerCase() !== "sommerferien") {
    const range = currentDefaults[label];
    if (!Array.isArray(range) || range.length !== 2) {
      return [null, null];
    }
    return [range[0] || null, range[1] || null];
  }

  if (occurrence === 0) {
    const currentSummer = currentDefaults.Sommerferien;
    if (!Array.isArray(currentSummer) || currentSummer.length !== 2) {
      return [null, null];
    }
    return [currentSummer[0] || null, currentSummer[1] || null];
  }
  if (occurrence === 1) {
    const nextDefaults = defaultHolidayRangesForYear(Number(startYear) + 1);
    const nextSummer = nextDefaults.Sommerferien;
    if (!Array.isArray(nextSummer) || nextSummer.length !== 2) {
      return [null, null];
    }
    return [nextSummer[0] || null, nextSummer[1] || null];
  }

  const fallback = currentDefaults.Sommerferien;
  if (!Array.isArray(fallback) || fallback.length !== 2) {
    return [null, null];
  }
  return [fallback[0] || null, fallback[1] || null];
}

function buildDefaultHolidayRowsForSchoolYears(schoolYears = []) {
  const rows = [];
  let nextId = 1;
  for (const rawYear of Array.isArray(schoolYears) ? schoolYears : []) {
    const year = isRecord(rawYear) ? rawYear : {};
    const schoolYearId = Number(year.id) || 0;
    const startYear = Number(String(year.startDate || "").slice(0, 4));
    if (!schoolYearId || !Number.isFinite(startYear) || startYear <= 0) {
      continue;
    }
    for (const spec of requiredHolidayRowSpecs()) {
      const [startDate, endDate] = defaultHolidayRangeForRow(startYear, spec.label, spec.occurrence);
      if (!startDate && !endDate) {
        continue;
      }
      rows.push({
        id: nextId++,
        schoolYearId,
        label: spec.label,
        startDate: startDate || "",
        endDate: endDate || ""
      });
    }
  }
  return rows;
}

function overrideTopicForFlags(topic, isEntfall, isWrittenExam) {
  const text = String(topic || "").trim();
  const lowered = text.toLowerCase();
  if (isEntfall) {
    return lowered.startsWith("entfall") ? text : ENTFALL_TOPIC_DEFAULT;
  }
  if (isWrittenExam) {
    return lowered.startsWith(WRITTEN_EXAM_TOPIC.toLowerCase()) ? text : WRITTEN_EXAM_TOPIC;
  }
  return text;
}

function isoInDateRange(targetIso, startIso, endIso) {
  if (!targetIso || !startIso || !endIso) {
    return false;
  }
  if (startIso <= endIso) {
    return targetIso >= startIso && targetIso <= endIso;
  }
  return targetIso >= startIso || targetIso <= endIso;
}

function suggestColor(existingColors) {
  const existing = new Set(
    existingColors
      .map((item) => canonicalHexColor(item))
      .filter(Boolean)
      .map((item) => item.toLowerCase())
  );
  for (const color of COLOR_PALETTE) {
    const normalized = normalizeHexColor(color, DEFAULT_COURSE_COLOR);
    if (!existing.has(normalized.toLowerCase())) {
      return normalized;
    }
  }
  return normalizeHexColor(
    COLOR_PALETTE[existing.size % COLOR_PALETTE.length],
    DEFAULT_COURSE_COLOR
  );
}

function canonicalHexColor(color) {
  const value = String(color || "").trim();
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  const hex = match[1].toUpperCase();
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return `#${hex}`;
}

function normalizeHexColor(color, fallback = DEFAULT_COURSE_COLOR) {
  const normalized = canonicalHexColor(color);
  if (normalized) {
    return normalized;
  }
  const fallbackColor = canonicalHexColor(fallback);
  return fallbackColor || DEFAULT_COURSE_COLOR;
}

function normalizeCourseColor(color, noLesson = false) {
  if (noLesson) {
    return NO_LESSON_COLOR;
  }
  return normalizeHexColor(color, DEFAULT_COURSE_COLOR);
}

function hexToRgb(color) {
  const normalized = canonicalHexColor(color);
  if (!normalized) {
    return null;
  }
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function colorToRgba(color, alpha) {
  const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(Number(alpha) || 1, 0, 1)})`;
}

function lightenHex(color, amount = 0.1) {
  const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
  const factor = clamp(Number(amount) || 0, 0, 1);
  const blend = (value) => Math.round(value + ((255 - value) * factor));
  const r = blend(rgb.r);
  const g = blend(rgb.g);
  const b = blend(rgb.b);
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function readableTextColor(color) {
  const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
  const luminance = ((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255;
  return luminance > 0.62 ? "#0f1216" : "#f8fafc";
}

function formatPartialDisplay(text, partial) {
  const value = String(text || "").trim();
  if (!partial) {
    return value;
  }
  if (!value) {
    return "(teilweise entfaellt)";
  }
  return `${value}\n(teilweise entfaellt)`;
}

function normalizePerformanceIndexTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLessonTimeValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return "";
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseLessonTimeMinutes(value) {
  const normalized = normalizeLessonTimeValue(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function buildDefaultLessonTimes(hoursPerDay = HOURS_PER_DAY_DEFAULT) {
  const count = clamp(Number(hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
  const defaultsByLesson = new Map([
    [1, { start: "07:55", end: "08:40" }],
    [2, { start: "08:45", end: "09:30" }],
    [3, { start: "09:45", end: "10:30" }],
    [4, { start: "10:35", end: "11:20" }],
    [5, { start: "11:35", end: "12:20" }],
    [6, { start: "12:25", end: "13:10" }],
    [7, { start: "13:55", end: "14:40" }],
    [8, { start: "14:45", end: "15:30" }],
    [9, { start: "15:40", end: "16:25" }],
    [10, { start: "16:30", end: "17:15" }]
  ]);
  return Array.from({ length: count }, (_, index) => {
    const lesson = index + 1;
    const defaults = defaultsByLesson.get(lesson) || { start: "", end: "" };
    return {
      lesson,
      start: defaults.start,
      end: defaults.end
    };
  });
}

function normalizeLessonTimes(value, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
  const count = clamp(Number(hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
  const entries = Array.isArray(value) ? value : [];
  const byLesson = new Map();
  entries.forEach((entry) => {
    const rawLesson = Number(entry && entry.lesson);
    if (!Number.isInteger(rawLesson) || rawLesson < 1 || rawLesson > count) {
      return;
    }
    const lesson = rawLesson;
    byLesson.set(lesson, {
      lesson,
      start: normalizeLessonTimeValue(entry && entry.start),
      end: normalizeLessonTimeValue(entry && entry.end)
    });
  });
  return Array.from({ length: count }, (_, index) => {
    const lesson = index + 1;
    return byLesson.get(lesson) || { lesson, start: "", end: "" };
  });
}

function lessonTimesEqual(left, right, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
  const normalizedLeft = normalizeLessonTimes(left, hoursPerDay);
  const normalizedRight = normalizeLessonTimes(right, hoursPerDay);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    const leftEntry = normalizedLeft[index];
    const rightEntry = normalizedRight[index];
    if (
      Number(leftEntry.lesson) !== Number(rightEntry.lesson)
      || String(leftEntry.start || "") !== String(rightEntry.start || "")
      || String(leftEntry.end || "") !== String(rightEntry.end || "")
    ) {
      return false;
    }
  }
  return true;
}

function validateLessonTimes(lessonTimes, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
  const normalized = normalizeLessonTimes(lessonTimes, hoursPerDay);
  const hasAnyValue = normalized.some((entry) => Boolean(entry.start || entry.end));
  if (!hasAnyValue) {
    return { valid: true, normalized, hasAnyValue: false, message: "" };
  }
  let previousEnd = null;
  for (const entry of normalized) {
    if (!entry.start || !entry.end) {
      return {
        valid: false,
        normalized,
        hasAnyValue: true,
        message: `Bitte für die ${entry.lesson}. Stunde Start und Ende angeben.`
      };
    }
    const startMinutes = parseLessonTimeMinutes(entry.start);
    const endMinutes = parseLessonTimeMinutes(entry.end);
    if (startMinutes === null || endMinutes === null) {
      return {
        valid: false,
        normalized,
        hasAnyValue: true,
        message: `Die Uhrzeiten der ${entry.lesson}. Stunde sind ungültig.`
      };
    }
    if (startMinutes >= endMinutes) {
      return {
        valid: false,
        normalized,
        hasAnyValue: true,
        message: `Die ${entry.lesson}. Stunde muss vor ihrem Ende beginnen.`
      };
    }
    if (previousEnd !== null && startMinutes < previousEnd) {
      return {
        valid: false,
        normalized,
        hasAnyValue: true,
        message: "Die Stundenzeiten dürfen sich nicht überschneiden und müssen aufsteigend sein."
      };
    }
    previousEnd = endMinutes;
  }
  return { valid: true, normalized, hasAnyValue: true, message: "" };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value)
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function seedTutorialDemoStore(store) {
  const year = store.getActiveSchoolYear();
  if (!year) return null;
  const courseId = store.createCourse(year.id, "Biologie 8a", "#3CB44B", false, false, "Biologie");
  const secondCourseId = store.createCourse(
    year.id,
    "Naturwissenschaften 9b",
    "#E6194B",
    false,
    false,
    "Naturwissenschaften"
  );
  if (!courseId) return null;
  store.createSlot(courseId, 1, 2, 2);
  store.createSlot(courseId, 3, 3, 1);
  store.createSlot(courseId, 5, 1, 1);
  if (secondCourseId) store.createSlot(secondCourseId, 2, 4, 2);

  const topics = [
    ["Fotosynthese: Licht- und Dunkelreaktion", "Versuchsbeobachtungen auswerten"],
    ["Aufbau eines Laubblatts", "Material für die nächste Stunde mitbringen"],
    ["Ökosystem Wald", "Nahrungsnetze wiederholen"]
  ];
  const isTeachingWeek = (weekStart) => {
    const weekEnd = addDays(weekStart, 4);
    const hasDayOff = [0, 1, 2, 3, 4].some((offset) => {
      const date = addDays(weekStart, offset);
      return store.listFreeRanges(year.id).some((range) => (
        isoInDateRange(date, range.startDate, range.endDate)
      )) || store.listSpecialDays().some((day) => day.dayDate === date);
    });
    if (hasDayOff) return false;
    return store.listLessonsForWeek(year.id, weekStart, weekEnd, courseId)
      .filter((lesson) => !lesson.canceled)
      .length >= topics.length;
  };
  const weekStarts = [...new Set(
    store.state.lessons
      .filter((lesson) => Number(lesson.courseId) === Number(courseId))
      .map((lesson) => weekStartFor(lesson.lessonDate))
  )];
  const currentWeek = currentWeekStartForDisplay();
  const weekStart = [
    ...weekStarts.filter((candidate) => candidate >= currentWeek),
    ...weekStarts.filter((candidate) => candidate < currentWeek),
  ].find(isTeachingWeek) || currentWeek;
  const weekEnd = addDays(weekStart, 4);
  store.state.lessons
    .filter((lesson) => (
      Number(lesson.courseId) === Number(courseId)
      && lesson.lessonDate >= weekStart
      && lesson.lessonDate <= weekEnd
      && !lesson.canceled
    ))
    .slice(0, topics.length)
    .forEach((lesson, index) => {
      store.updateLessonBlock(lesson.id, { topic: topics[index][0], notes: topics[index][1] });
    });

  return { courseId, weekStart };
}

class PlanningApp {
  constructor() {
    this.tutorialDemoMode = TUTORIAL_DEMO_MODE;
    this.workspaceController = getParentWorkspaceController()
      || createWorkspaceController({
        eventTarget: window,
        ephemeral: Boolean(this.tutorialDemoMode)
      });
    this.workspaceClient = this.workspaceController
      ? createWorkspaceClient(this.workspaceController, "planning", `planning-frame:${randomId()}`)
      : null;
    const sharedWorkspaceStore = this.workspaceController?.getStore?.() || null;
    this.isStandaloneWorkspace = false;
    if (!sharedWorkspaceStore) throw new Error("Neutraler Workspace-Store ist nicht verfügbar.");
    this.store = sharedWorkspaceStore;
    const tutorialDemo = this.tutorialDemoMode ? seedTutorialDemoStore(this.store) : null;
    this.tutorialDemoCourseId = tutorialDemo?.courseId || null;
    this.weekStartIso = tutorialDemo?.weekStart || currentWeekStartForDisplay();
    this.selectedLessonId = null;
    this.selectedCourseId = this.tutorialDemoCourseId;
    this.currentView = "week";
    this.shellTabContext = "planning";
    this._planningReadySignalToken = 0;
    this._lastPlanningReadySignalSignature = "";
    this.activeSettingsTab = "dayoff";
    this.settingsSourceView = "planning";
    this.locked = false;
    this.lockReason = "";
    this.scrollCourseNextIntoView = false;
    this.dragCourseId = null;
    this.dragSourceRow = null;
    this.dragPlaceholder = null;
    this.dragDropCommitted = false;
    this.slotDialogStartMinIso = null;
    this.slotDialogEndDateBackup = null;
    this.slotDialogMode = "lesson";
    this.refs = {
      schoolYearSelect: document.querySelector("#school-year-select"),
      kwLabel: document.querySelector("#kw-label"),
      weekPickerBtn: document.querySelector("#week-picker-btn"),
      weekDate: document.querySelector("#week-date"),
      weekPrev: document.querySelector("#week-prev"),
      weekNext: document.querySelector("#week-next"),

      viewWeekBtn: document.querySelector("#view-week-btn"),
      viewTutorialBtn: document.querySelector("#view-tutorial-btn"),
      viewSettingsBtn: document.querySelector("#view-settings-btn"),
      sidebarManualSaveBtn: document.querySelector("#sidebar-manual-save-btn"),
      sidebarTitle: document.querySelector("#sidebar-title"),
      viewWeek: document.querySelector("#view-week"),
      viewCourse: document.querySelector("#view-course"),
      viewSettings: document.querySelector("#view-settings"),
      mainPane: document.querySelector(".main-pane"),
      stackGlass: document.querySelector("#stackGlass"),
      settingsShell: document.querySelector("#settings-shell"),
      headerGlass: document.querySelector("#headerGlass"),

      sidebarCourseList: document.querySelector("#sidebar-course-list"),
      sidebarArchiveActions: document.querySelector("#sidebar-archive-actions"),
      sidebarArchiveSection: document.querySelector("#sidebar-archive-section"),
      sidebarArchiveBtn: document.querySelector("#sidebar-archive-btn"),

      settingsTabs: [...document.querySelectorAll(".settings-tab")],
      settingsPanels: {
        dayoff: document.querySelector("#settings-tab-dayoff"),
        display: document.querySelector("#settings-tab-display"),
        lessonTimes: document.querySelector("#settings-tab-lesson-times"),
        database: document.querySelector("#settings-tab-database"),
      },
      settingsResetAll: document.querySelector("#settings-reset-all"),
      settingsSaveAll: document.querySelector("#settings-save-all"),
      settingsCancelAll: document.querySelector("#settings-cancel-all"),
      settingsActionsRow: document.querySelector(".settings-actions-row"),
      settingsDisplayHoursRow: document.querySelector("#settings-display-hours-row"),
      themePreferenceInputs: [...document.querySelectorAll("[data-theme-preference]")],

      courseTitle: document.querySelector("#course-title"),
      courseTable: document.querySelector("#course-table"),
      archiveDialog: document.querySelector("#archive-dialog"),
      archiveDialogForm: document.querySelector("#archive-dialog-form"),
      archiveDialogCancel: document.querySelector("#archive-dialog-cancel"),
      archiveDialogCancelTop: document.querySelector("#archive-dialog-cancel-top"),
      archiveExportGrades: document.querySelector("#archive-export-grades"),
      archiveGradesLockedHint: document.querySelector("#archive-grades-locked-hint"),
      archiveGradesOptions: document.querySelector("#archive-grades-options"),
      archiveGradeScopeInputs: document.querySelectorAll("input[name='archive-grade-scope']"),
      archiveGradeBeMask: document.querySelector("#archive-grade-be-mask"),
      archiveExportPlanning: document.querySelector("#archive-export-planning"),
      archivePlanningOptions: document.querySelector("#archive-planning-options"),
      archivePlanningCourses: document.querySelector("#archive-planning-courses"),
      archivePlanningWeeks: document.querySelector("#archive-planning-weeks"),
      archiveDialogStatus: document.querySelector("#archive-dialog-status"),
      archiveDialogGenerate: document.querySelector("#archive-dialog-generate"),

      sidebarPanel: document.querySelector("#sidebarPanel"),
      weekTable: document.querySelector("#week-table"),
      contextMenu: document.querySelector("#app-context-menu"),
      messageDialog: document.querySelector("#message-dialog"),
      messageDialogForm: document.querySelector("#message-dialog-form"),
      messageDialogTitle: document.querySelector("#message-dialog-title"),
      messageDialogText: document.querySelector("#message-dialog-text"),
      messageDialogInputRow: document.querySelector("#message-dialog-input-row"),
      messageDialogInputLabel: document.querySelector("#message-dialog-input-label"),
      messageDialogInput: document.querySelector("#message-dialog-input"),
      messageDialogSelect: document.querySelector("#message-dialog-select"),
      messageDialogCancel: document.querySelector("#message-dialog-cancel"),
      messageDialogOk: document.querySelector("#message-dialog-ok"),
      messageDialogActionsTop: document.querySelector("#message-dialog-actions-top"),
      messageDialogCancelTop: document.querySelector("#message-dialog-cancel-top"),
      messageDialogOkTop: document.querySelector("#message-dialog-ok-top"),
      messageDialogDiscardTop: document.querySelector("#message-dialog-discard-top"),
      messageDialogActionsBottom: document.querySelector("#message-dialog-actions-bottom"),
      courseDialog: document.querySelector("#course-dialog"),
      courseDialogForm: document.querySelector("#course-dialog-form"),
      courseDialogTitle: document.querySelector("#course-dialog-title"),
      courseDialogId: document.querySelector("#course-dialog-id"),
      courseDialogSubjectRow: document.querySelector("#course-dialog-subject-row"),
      courseDialogSubject: document.querySelector("#course-dialog-subject"),
      courseDialogName: document.querySelector("#course-dialog-name"),
      courseDialogColorPanel: document.querySelector("#course-dialog-color-panel"),
      courseDialogColorPalette: document.querySelector("#course-dialog-color-palette"),
      courseDialogNoLesson: document.querySelector("#course-dialog-no-lesson"),
      courseColorDialog: document.querySelector("#course-color-dialog"),
      courseColorDialogForm: document.querySelector("#course-color-dialog-form"),
      courseColorDialogTitle: document.querySelector("#course-color-dialog-title"),
      courseColorDialogId: document.querySelector("#course-color-dialog-id"),
      courseColorDialogPalette: document.querySelector("#course-color-dialog-palette"),
      courseDialogCancel: document.querySelector("#course-dialog-cancel"),
      courseColorDialogCancel: document.querySelector("#course-color-dialog-cancel"),
      courseDialogDelete: document.querySelector("#course-dialog-delete"),

      entfallDialog: document.querySelector("#entfall-dialog"),
      entfallDialogForm: document.querySelector("#entfall-dialog-form"),
      entfallDialogReason: document.querySelector("#entfall-dialog-reason"),
      entfallDialogCancel: document.querySelector("#entfall-dialog-cancel"),

      topicDialog: document.querySelector("#topic-dialog"),
      topicDialogForm: document.querySelector("#topic-dialog-form"),
      topicDialogLesson: document.querySelector("#topic-dialog-lesson"),
      topicDialogCoursePill: document.querySelector("#topic-dialog-course-pill"),
      topicDialogContext: document.querySelector("#topic-dialog-context"),
      topicDialogInput: document.querySelector("#topic-dialog-input"),
      topicDialogNotes: document.querySelector("#topic-dialog-notes"),
      topicDialogRichTextToolbar: document.querySelector("#topic-dialog-rich-text-toolbar"),
      topicDialogCancel: document.querySelector("#topic-dialog-cancel"),

      slotDialog: document.querySelector("#slot-dialog"),
      slotDialogForm: document.querySelector("#slot-dialog-form"),
      slotDialogTitle: document.querySelector("#slot-dialog-title"),
      slotDialogId: document.querySelector("#slot-dialog-id"),
      slotDialogCourseRow: document.querySelector("#slot-dialog-course-row"),
      slotDialogCourse: document.querySelector("#slot-dialog-course"),
      slotDialogBreakNameRow: document.querySelector("#slot-dialog-break-name-row"),
      slotDialogBreakName: document.querySelector("#slot-dialog-break-name"),
      slotDialogDay: document.querySelector("#slot-dialog-day"),
      slotDialogHourRow: document.querySelector("#slot-dialog-hour-row"),
      slotDialogHour: document.querySelector("#slot-dialog-hour"),
      slotDialogEndHourRow: document.querySelector("#slot-dialog-end-hour-row"),
      slotDialogEndHour: document.querySelector("#slot-dialog-end-hour"),
      slotDialogBreakRow: document.querySelector("#slot-dialog-break-row"),
      slotDialogBreakAfter: document.querySelector("#slot-dialog-break-after"),
      slotDialogStart: document.querySelector("#slot-dialog-start"),
      slotDialogEnd: document.querySelector("#slot-dialog-end"),
      slotDialogParity: document.querySelector("#slot-dialog-parity"),
      slotDialogEditInfo: document.querySelector("#slot-dialog-edit-info"),
      slotDialogEditTools: document.querySelector("#slot-dialog-edit-tools"),
      slotDialogEditScope: document.querySelector("#slot-dialog-edit-scope"),
      slotDialogEditFromDate: document.querySelector("#slot-dialog-edit-from-date"),
      slotDialogDelete: document.querySelector("#slot-dialog-delete"),
      slotDialogCancel: document.querySelector("#slot-dialog-cancel"),
      weekCalendarDialog: document.querySelector("#week-calendar-dialog"),
      weekCalendarPrev: document.querySelector("#week-calendar-prev"),
      weekCalendarNext: document.querySelector("#week-calendar-next"),
      weekCalendarMonth: document.querySelector("#week-calendar-month"),
      weekCalendarGrid: document.querySelector("#week-calendar-grid"),

      hoursPerDay: document.querySelector("#hours-per-day"),
      lessonTimesList: document.querySelector("#lesson-times-list"),
      showHiddenSidebarCourses: document.querySelector("#show-hidden-sidebar-courses"),
      appVersion: document.querySelector("#app-version"),
      backupAutoEnabled: document.querySelector("#backup-auto-enabled"),
      backupIntervalDays: document.querySelector("#backup-interval-days"),
      backupNowBtn: document.querySelector("#backup-now-btn"),
      dbBackupAutoEnabled: document.querySelector("#db-backup-auto-enabled"),
      dbBackupIntervalDays: document.querySelector("#db-backup-interval-days"),
      dbBackupNowBtn: document.querySelector("#db-backup-now-btn"),
      dbBackupImportBtn: document.querySelector("#db-backup-import-btn"),
      dbBackupImportFile: document.querySelector("#db-backup-import-file"),
      backupExportBtn: document.querySelector("#backup-export-btn"),
      backupImportBtn: document.querySelector("#backup-import-btn"),
      backupRestoreBtn: document.querySelector("#backup-restore-btn"),
      backupResetDefaults: document.querySelector("#backup-reset-defaults"),
      backupHint: document.querySelector("#backup-hint"),
      backupImportFile: document.querySelector("#backup-import-file"),
      backupStatus: document.querySelector("#backup-status"),
      backupDirChangeBtn: document.querySelector("#backup-dir-change-btn"),
      backupDirName: document.querySelector("#backup-dir-name"),
      syncFileName: document.querySelector("#sync-file-name"),
      syncFileStatus: document.querySelector("#sync-file-status"),
      dbSelectExistingBtn: document.querySelector("#db-select-existing-btn"),
      dbCreateNewBtn: document.querySelector("#db-create-new-btn"),
      dbAutoActions: document.querySelector("#db-auto-actions"),
      dbManualActions: document.querySelector("#db-manual-actions"),
      dbManualHint: document.querySelector("#db-manual-hint"),
      dbBackupSection: document.querySelector("#db-backup-section"),
      dbManualLoadBtn: document.querySelector("#db-manual-load-btn"),
      dbManualSaveBtn: document.querySelector("#db-manual-save-btn"),
      dbManualFile: document.querySelector("#db-manual-file"),

      courseSettingsAdd: document.querySelector("#course-settings-add"),
      courseList: document.querySelector("#course-list"),

      slotForm: document.querySelector("#slot-form"),
      slotId: document.querySelector("#slot-id"),
      slotCourse: document.querySelector("#slot-course"),
      slotDay: document.querySelector("#slot-day"),
      slotHour: document.querySelector("#slot-hour"),
      slotDuration: document.querySelector("#slot-duration"),
      slotStart: document.querySelector("#slot-start"),
      slotEnd: document.querySelector("#slot-end"),
      slotParity: document.querySelector("#slot-parity"),
      slotEditTools: document.querySelector("#slot-edit-tools"),
      slotEditScope: document.querySelector("#slot-edit-scope"),
      slotEditFromDate: document.querySelector("#slot-edit-from-date"),
      slotReset: document.querySelector("#slot-reset"),
      slotDelete: document.querySelector("#slot-delete"),
      slotList: document.querySelector("#slot-list"),

      freeRangeAdd: document.querySelector("#free-range-add"),
      freeRangeDialog: document.querySelector("#free-range-dialog"),
      freeRangeDialogForm: document.querySelector("#free-range-dialog-form"),
      freeRangeDialogTitle: document.querySelector("#free-range-dialog-title"),
      freeRangeDialogId: document.querySelector("#free-range-dialog-id"),
      freeRangeDialogLabel: document.querySelector("#free-range-dialog-label"),
      freeRangeDialogStart: document.querySelector("#free-range-dialog-start"),
      freeRangeDialogEnd: document.querySelector("#free-range-dialog-end"),
      freeRangeDialogDelete: document.querySelector("#free-range-dialog-delete"),
      freeRangeDialogCancel: document.querySelector("#free-range-dialog-cancel"),
      dayoffRequiredHint: document.querySelector("#dayoff-required-hint"),
      dayoffRequiredMissing: document.querySelector("#dayoff-required-missing"),
      freeRangeList: document.querySelector("#free-range-list"),

      specialDayDialog: document.querySelector("#special-day-dialog"),
      specialDayDialogForm: document.querySelector("#special-day-dialog-form"),
      specialDayDialogTitle: document.querySelector("#special-day-dialog-title"),
      specialDayDialogId: document.querySelector("#special-day-dialog-id"),
      specialDayDialogName: document.querySelector("#special-day-dialog-name"),
      specialDayDialogDate: document.querySelector("#special-day-dialog-date"),
      specialDayDialogDelete: document.querySelector("#special-day-dialog-delete"),
      specialDayDialogCancel: document.querySelector("#special-day-dialog-cancel"),
      specialDayList: document.querySelector("#special-day-list")
    };
    if (
      this.refs.contextMenu
      && typeof document !== "undefined"
      && document.body
      && this.refs.contextMenu.parentElement !== document.body
    ) {
      document.body.append(this.refs.contextMenu);
    }
    this.localClipboardText = "";
    this.contextMenuItems = [];
    this.pendingMessageDialogResolver = null;
    this.pendingMessageDialogMode = null;
    this.pendingEntfallLessonId = null;
    this.pendingTopicLessonId = null;
    this.inlineTopicLessonId = null;
    this.inlineTopicDraft = "";
    this.courseDialogDraft = null;
    this.archiveExportInProgress = false;
    this.workspacePublicLoaded = Boolean(this.tutorialDemoMode || this.workspaceController?.isReady?.());
    this.pendingWeekPerformanceIndexLoadKey = "";
    this.performanceIndex = new Map();
    this.courseStudentCounts = new Map();
    this.courseStudentCountsRefreshToken = 0;
    this.appVersion = "";
    this.weekCalendarMonthIso = null;
    this.weekCalendarHoverWeekStart = null;
    this.lastWeekEmptySlotPointerDown = null;
    this.weekEmptySlotDialogOpenedAt = 0;
    this.courseDialogSelectedColor = normalizeHexColor(DEFAULT_COURSE_COLOR, DEFAULT_COURSE_COLOR);
    this.courseDialogColorBackup = this.courseDialogSelectedColor;
    this.courseDialogDefaultColor = this.courseDialogSelectedColor;
    this.courseColorDialogSelectedColor = this.courseDialogSelectedColor;
    this.courseColorDialogDefaultColor = this.courseDialogSelectedColor;
    this.settingsDraft = this.buildSettingsDraftFromStore();
    this.settingsDirty = false;
    this.workspaceRevision = Math.max(0, Number(this.workspaceController?.getRevision?.()) || 0);
    this.workspaceHydrated = this.isStandaloneWorkspace
      ? false
      : Boolean(this.workspaceController?.isReady?.());
    this.settingsDraftRevision = this.workspaceRevision;
    this.syncMeta = this.tutorialDemoMode ? {
      deviceId: "tutorial-demo",
      knownRemoteRevision: 0,
      knownRemoteHash: "",
      fileName: "Beispieldaten (flüchtig)",
      lastSyncedAt: ""
    } : this.loadSyncMeta();
    this.syncState = {
      supported: false,
      initialized: !this.isStandaloneWorkspace,
      syncingNow: false,
      pendingSaveTimer: 0,
      pendingSaveReason: "",
      suppressAutoPush: false,
      mutationVersion: 0,
      persistedMutationVersion: 0,
      publicDirtyVersion: 0,
      saveRequestSerial: 0,
      completedSaveSerial: 0,
      requestedMutationVersion: 0,
      saveDrainPromise: null,
      saveRequestManual: false,
      saveRequestAllowConflictPrompt: false,
      saveRequestReason: "",
      saveBlockedByConflict: false,
      conflict: null,
      fileHandle: null,
      storedFileHandle: null,
      fileName: String(this.syncMeta.fileName || ""),
      lastQueuedLocalHash: ""
    };
    this.backupState = {
      directoryHandle: null,
      storedDirectoryHandle: null,
      automaticBackupPromise: null
    };
    this.themePreference = readThemePreference();
    window.addEventListener(THEME_APPLY_EVENT, (event) => {
      this.themePreference = normalizeThemePreference(event.detail?.preference);
      this.renderDisplaySection();
    });
    this.manualPersistenceState = {
      baselineHash: this.getCurrentStateHash(),
      dirty: false,
      hasSavedBaseline: false,
      fileName: "",
      lastAction: this.tutorialDemoMode
        ? "tutorial-demo"
        : (this.isStandaloneWorkspace ? "" : "workspace-client")
    };
    this.beforeUnloadWarningEnabled = false;
    this.lastAutoBackupAt = String(this.store.getLastAutoBackupAt?.() || "");
    if (this.workspaceController) {
      this.unregisterWorkspaceFeatureClient = this.workspaceController.registerFeatureClient?.('planning', this);
      if (!this.isStandaloneWorkspace) {
        this.unregisterWorkspaceClient = this.workspaceClient?.subscribe(
          "planning",
          (detail) => this.handleWorkspaceState(detail)
        );
      }
      window.addEventListener("pagehide", () => {
        this.unregisterWorkspaceFeatureClient?.();
        if (!this.isStandaloneWorkspace) {
          this.unregisterWorkspaceClient?.();
        }
      }, { once: true });
    }
    this.ensureStandaloneSettingsView();
    this.initNumberSteppers();
    this.bindEvents();
    this.bindWindowFocusGuards();
    this.bindPlanningTutorialPreviewGuards();
    if (this.tutorialDemoMode) {
      this.bindTutorialDemoGuards();
      this.syncState.initialized = true;
    }
    this.renderAll({ visibleOnly: true });
    if (this.tutorialDemoMode) {
      this.setSyncStatus("Beispieldaten – Änderungen werden nicht gespeichert.");
    } else if (this.isStandaloneWorkspace) {
      this.initializeExternalFileSync().catch((_error) => {
        this.setSyncStatus("Datenbankdatei konnte nicht initialisiert werden.", true);
      });
    } else {
      this.queuePlanningReadySignal();
    }
  }

  handleWorkspaceState(detail = null) {
    if (this.isStandaloneWorkspace || !detail || typeof detail !== "object") {
      return;
    }
    const previousRevision = Math.max(0, Number(this.workspaceRevision) || 0);
    this.workspaceRevision = Math.max(0, Number(detail.revision) || 0);
    this.workspaceHydrated = Boolean(detail.hydrated && detail.ready);
    if (this.workspaceRevision !== previousRevision && !this.settingsDirty) {
      this.settingsDraft = this.buildSettingsDraftFromStore();
      this.settingsDraftRevision = this.workspaceRevision;
    }
    if (detail.scope === "planning" && Array.isArray(detail.snapshot?.assessmentIndex)) {
      this.replacePerformanceIndex(
        detail.snapshot.assessmentIndex,
        detail.snapshot.assessmentIndexResolvedCourseIds
      );
    }
    if (detail.scope === "planning" && this.refs?.sidebarCourseList) {
      this.renderAll({ visibleOnly: true });
      void this.refreshSidebarCourseStudentCounts();
      return;
    }
    if (detail.scope === "shell" && this.refs?.sidebarCourseList) {
      const previousLocked = this.locked;
      const previousLockReason = this.lockReason;
      const previousView = this.currentView;
      const previousSettingsTab = this.activeSettingsTab;
      this.updateAccessLock();
      if (
        previousLocked !== this.locked
        || previousLockReason !== this.lockReason
        || previousView !== this.currentView
        || previousSettingsTab !== this.activeSettingsTab
      ) {
        this.renderAll({ visibleOnly: true });
        return;
      }
      this.updateSidebarArchiveButtonState();
      this.renderSidebarFooterActions();
      if (this.currentView === "settings" && this.activeSettingsTab === "database") {
        this.renderBackupSection();
        this.renderDatabaseSection();
      }
    }
  }

  getWorkspaceRuntime() {
    return this.workspaceController?.getOwner?.() || null;
  }

  async refreshSidebarCourseStudentCounts() {
    const refreshToken = ++this.courseStudentCountsRefreshToken;
    const workspaceOwner = this.getWorkspaceRuntime();
    if (!workspaceOwner?.canAccessGradeVault?.()) {
      if (this.courseStudentCounts.size) {
        this.courseStudentCounts.clear();
        this.renderSidebarCourseList();
      }
      return;
    }
    const year = this.store.getActiveSchoolYear();
    const courses = year ? this.store.listCourses(year.id) : [];
    const summaries = await Promise.all(courses.map(async (course) => {
      try {
        const summary = await workspaceOwner.getGradeCourseRosterSummary?.(course.id);
        // null heißt "unbekannt" (z. B. Tresor zwischenzeitlich gesperrt), nicht "keine Teilnehmer".
        return [Number(course.id), summary ? Number(summary.studentCount || 0) : null];
      } catch {
        return [Number(course.id), null];
      }
    }));
    if (refreshToken !== this.courseStudentCountsRefreshToken) return;
    // Nur ein vollständig ermittelter Stand darf gespeichert werden. Sonst würde ein einzelner
    // Fehler die bekannten Teilnehmerzahlen aller Kurse dauerhaft mit 0 überschreiben.
    if (summaries.every(([, count]) => count !== null)) {
      workspaceOwner.setGradeCourseStudentCounts?.(Object.fromEntries(summaries));
    }
    const nextCounts = new Map(summaries.filter(([, count]) => Number(count) > 0));
    const hasChanged = nextCounts.size !== this.courseStudentCounts.size
      || [...nextCounts].some(([courseId, count]) => this.courseStudentCounts.get(courseId) !== count);
    this.courseStudentCounts = nextCounts;
    if (hasChanged) this.renderSidebarCourseList();
  }

  getArchiveVaultStatus() {
    const snapshot = this.workspaceController?.getSnapshot?.("shell");
    return snapshot?.vault && typeof snapshot.vault === "object"
      ? snapshot.vault
      : { encryptionEnabled: true, unlocked: false };
  }

  shouldDisableArchiveGradeSelection() {
    const vault = this.getArchiveVaultStatus();
    return Boolean(vault.encryptionEnabled && !vault.unlocked);
  }

  setArchiveGradesLockedHintVisible(visible) {
    if (this.refs.archiveGradesLockedHint) {
      this.refs.archiveGradesLockedHint.hidden = !visible;
    }
  }

  requestGradesNavigation(detail = null) {
    if (typeof window === "undefined" || !window.parent || window.parent === window) {
      return false;
    }
    try {
      window.parent.postMessage({
        type: "classroom:grades-navigate",
        detail: detail && typeof detail === "object" ? detail : {}
      }, window.location.origin);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async executeWorkspaceCommand(command, payload = null, options = {}) {
    if (!this.workspaceClient) {
      return { ok: false, code: "UNSUPPORTED", message: "Workspace ist nicht verfügbar." };
    }
    const result = await this.workspaceClient.execute(command, payload, {
      baseRevision: options?.baseRevision ?? this.workspaceRevision ?? this.workspaceController?.getRevision?.()
    });
    this.workspaceRevision = Math.max(this.workspaceRevision || 0, Number(result?.revision) || 0);
    return result;
  }

  bindTutorialDemoGuards() {
    const externalActionSelector = [
      "#db-select-existing-btn",
      "#db-create-new-btn",
      "#db-backup-now-btn",
      "#db-backup-import-btn",
      "#backup-export-btn",
      "#backup-import-btn",
      "#backup-restore-btn",
      "#backup-dir-change-btn",
      "#db-manual-load-btn",
      "#db-manual-save-btn",
      "#sidebar-archive-btn",
      "input[type='file']"
    ].join(",");
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest(externalActionSelector) : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.showInfoMessage(
        "Diese Aktion wird im Tutorial nur erklärt. Die Beispieldaten greifen nicht auf Dateien, Datenbanken oder Downloads zu.",
        "Beispieldaten"
      );
    }, true);
    document.addEventListener("drop", (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.showInfoMessage(
        "Dateiimporte sind im Tutorial deaktiviert, damit die Demo vollständig isoliert bleibt.",
        "Beispieldaten"
      );
    }, true);
  }

  bindPlanningTutorialPreviewGuards() {
    document.addEventListener("submit", (event) => {
      const dialog = event.target instanceof Element
        ? event.target.closest("dialog[data-tutorial-preview='1']")
        : null;
      if (!dialog) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("dialog[data-tutorial-preview='1'] button")
        : null;
      if (!button) return;
      const isMutating = button.type === "submit"
        || button.classList.contains("danger-action")
        || button.id === "archive-dialog-generate";
      if (!isMutating) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  activatePlanningTutorial() {
    if (!this.planningTutorialPresentation) {
      this.planningTutorialPresentation = {
        snapshot: {
          currentView: this.currentView,
          shellTabContext: this.shellTabContext,
          activeSettingsTab: this.activeSettingsTab,
          settingsSourceView: this.settingsSourceView,
          weekStartIso: this.weekStartIso,
          selectedCourseId: this.selectedCourseId,
          selectedLessonId: this.selectedLessonId
        },
        dialogs: new Set()
      };
    }
    return {
      cleanup: () => this.cleanupPlanningTutorial()
    };
  }

  markPlanningTutorialDialog(dialog) {
    if (!dialog) return;
    this.activatePlanningTutorial();
    dialog.dataset.tutorialPreview = "1";
    this.planningTutorialPresentation.dialogs.add(dialog);
  }

  resetPlanningTutorialPresentation() {
    const presentation = this.planningTutorialPresentation;
    this.hideContextMenu();
    this.resetInlineWeekBlockTopicEdit();
    if (!presentation) return;
    for (const dialog of presentation.dialogs) {
      if (dialog?.open) {
        if (dialog === this.refs.courseDialog) this.closeCourseDialog();
        else if (dialog === this.refs.topicDialog) this.closeTopicDialog();
        else if (dialog === this.refs.slotDialog) this.closeSlotDialog();
        else this.closeDialog(dialog);
      }
      dialog?.removeAttribute("data-tutorial-preview");
    }
    presentation.dialogs.clear();
  }

  cleanupPlanningTutorial() {
    const presentation = this.planningTutorialPresentation;
    if (!presentation) return;
    this.resetPlanningTutorialPresentation();
    this.planningTutorialSurfaceToken = (this.planningTutorialSurfaceToken || 0) + 1;
    const snapshot = presentation.snapshot;
    this.planningTutorialPresentation = null;
    this.currentView = snapshot.currentView;
    this.shellTabContext = snapshot.shellTabContext;
    this.activeSettingsTab = snapshot.activeSettingsTab;
    this.settingsSourceView = snapshot.settingsSourceView;
    this.weekStartIso = snapshot.weekStartIso;
    this.selectedCourseId = snapshot.selectedCourseId;
    this.selectedLessonId = snapshot.selectedLessonId;
    this.renderAll();
  }

  async showPlanningTutorialSettings(settingsTab, requestToken = this.planningTutorialSurfaceToken) {
    this.shellTabContext = "planning";
    this.currentView = "settings";
    this.settingsSourceView = "planning";
    this.activeSettingsTab = settingsTab;
    this.renderAll();
    await this.waitForPlanningTutorialRender();
    if (requestToken !== this.planningTutorialSurfaceToken) return null;
    const readyTargets = {
      database: ["#db-auto-actions:not([hidden])", "#db-manual-actions:not([hidden])"],
      dayoff: "#settings-tab-dayoff:not([hidden]) .settings-grid",
      display: "#settings-tab-display:not([hidden])",
      lessonTimes: "#settings-tab-lesson-times:not([hidden]) #lesson-times-list"
    };
    return this.waitForPlanningTutorialTarget(readyTargets[settingsTab] || `#settings-tab-${settingsTab}:not([hidden])`);
  }

  async showPlanningTutorialWeek(requestToken = this.planningTutorialSurfaceToken) {
    this.shellTabContext = "planning";
    this.currentView = "week";
    this.settingsSourceView = "planning";
    this.renderAll();
    await this.waitForPlanningTutorialRender();
    if (requestToken !== this.planningTutorialSurfaceToken) return null;
    if (this.currentView !== "week" || this.shellTabContext !== "planning") {
      this.shellTabContext = "planning";
      this.currentView = "week";
      this.settingsSourceView = "planning";
      this.renderAll();
      await this.waitForPlanningTutorialRender();
    }
    if (requestToken !== this.planningTutorialSurfaceToken) return null;
    return this.waitForPlanningTutorialTarget("#week-table");
  }

  getPlanningTutorialLesson() {
    const visibleBlock = this.refs.weekTable?.querySelector(".lesson-block[data-lesson-id]:not(.not-selectable)");
    if (visibleBlock) return this.store.getLessonById(Number(visibleBlock.dataset.lessonId));
    const year = this.activeSchoolYear;
    const courseIds = new Set(
      (year ? this.store.listCourses(year.id) : [])
        .filter((course) => !course.noLesson)
        .map((course) => Number(course.id))
    );
    const lesson = this.store.state.lessons.find((item) => (
      courseIds.has(Number(item.courseId)) && !item.canceled && !item.noLesson
    )) || null;
    if (lesson) {
      this.weekStartIso = this._clampWeekStart(weekStartFor(lesson.lessonDate));
      this.selectedCourseId = Number(lesson.courseId) || this.selectedCourseId;
      this.renderWeekSection();
    }
    return lesson;
  }

  showPlanningTutorialMenu(items, anchor) {
    if (!(anchor instanceof HTMLElement)) return;
    const rect = anchor.getBoundingClientRect();
    this.showContextMenu(
      items.map((label, index) => ({
        label,
        separatorBefore: index > 0 && (label === "Löschen" || label === "Serie anpassen"),
        handler: () => undefined
      })),
      Math.round(rect.left + Math.min(rect.width / 2, 80)),
      Math.round(rect.top + Math.min(rect.height / 2, 28))
    );
  }

  waitForPlanningTutorialRender() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async waitForPlanningTutorialTarget(selectors, attempts = 40) {
    const candidates = Array.isArray(selectors) ? selectors : [selectors];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const target = candidates
        .map((selector) => document.querySelector(selector))
        .find((element) => {
          if (!(element instanceof HTMLElement) || element.hidden) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
      if (target) return target;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  }

  async showPlanningTutorialSurface(surface = "week") {
    const requestToken = (this.planningTutorialSurfaceToken || 0) + 1;
    this.planningTutorialSurfaceToken = requestToken;
    this.activatePlanningTutorial();
    this.resetPlanningTutorialPresentation();
    if (surface === "database" || surface === "dayoff" || surface === "display" || surface === "lessonTimes") {
      await this.showPlanningTutorialSettings(surface, requestToken);
      return;
    }
    await this.showPlanningTutorialWeek(requestToken);
    if (requestToken !== this.planningTutorialSurfaceToken) return;
    if (surface === "lesson") {
      this.getPlanningTutorialLesson();
      return;
    }
    if (surface === "courseCreate") {
      await this.openCourseDialog();
      if (requestToken !== this.planningTutorialSurfaceToken) {
        this.closeCourseDialog();
        return;
      }
      this.markPlanningTutorialDialog(this.refs.courseDialog);
      return;
    }
    if (surface === "courseMenu") {
      const courseButton = this.refs.sidebarCourseList?.querySelector("button[data-course-id]");
      this.showPlanningTutorialMenu([
        "Kursname bearbeiten",
        "Fach ändern",
        "Farbe bearbeiten",
        "Als Termin ohne Unterricht",
        "In Randleiste ausblenden",
        "Löschen"
      ], courseButton);
      return;
    }
    if (surface === "slotCreate") {
      const emptyCell = this.refs.weekTable?.querySelector("[data-week-empty='1'][data-day][data-hour]");
      const day = Number(emptyCell?.dataset.day || 1);
      const hour = Number(emptyCell?.dataset.hour || 1);
      await this.openSlotDialogForCreate(day, hour);
      if (requestToken !== this.planningTutorialSurfaceToken) {
        this.closeSlotDialog();
        return;
      }
      this.markPlanningTutorialDialog(this.refs.slotDialog);
      return;
    }
    if (surface === "topicDialog") {
      const lesson = this.getPlanningTutorialLesson();
      if (lesson) {
        this.openTopicDialog(lesson.id);
        this.markPlanningTutorialDialog(this.refs.topicDialog);
      }
      return;
    }
    if (surface === "lessonMenu") {
      const lesson = this.getPlanningTutorialLesson();
      const block = lesson
        ? this.refs.weekTable?.querySelector(`.lesson-block[data-lesson-id="${lesson.id}"]`)
        : null;
      this.showPlanningTutorialMenu([
        "Kopieren",
        "Einfügen",
        "Detailplanung bearbeiten",
        "Serie anpassen",
        "Schriftliche Arbeit",
        "Entfall",
        "Planung in Zukunft verschieben",
        "Planung in Vergangenheit verschieben"
      ], block);
      return;
    }
    if (surface === "slotEdit") {
      const year = this.activeSchoolYear;
      const slot = year ? this.store.listSlotsForYear(year.id)[0] : null;
      if (slot) {
        await this.openSlotDialogForEdit(slot);
        if (requestToken !== this.planningTutorialSurfaceToken) {
          this.closeSlotDialog();
          return;
        }
        this.markPlanningTutorialDialog(this.refs.slotDialog);
      }
      return;
    }
    if (surface === "course") {
      const year = this.activeSchoolYear;
      const courses = year ? this.store.listCourses(year.id).filter((course) => !course.noLesson) : [];
      if (!courses.some((course) => Number(course.id) === Number(this.selectedCourseId))) {
        this.selectedCourseId = courses[0]?.id || null;
      }
      this.currentView = "course";
      this.renderAll();
      return;
    }
    if (surface === "archive") {
      this.handleArchiveOpenRequest();
      this.markPlanningTutorialDialog(this.refs.archiveDialog);
    }
  }

  get activeSchoolYear() {
    const year = this.store.getActiveSchoolYear();
    if (year) {
      this.store.setActiveSchoolYear(year.id);
    }
    return year;
  }

  buildSettingsDraftFromStore() {
    const hoursPerDay = this.store.getHoursPerDay();
    return {
      hoursPerDay,
      lessonTimes: this.store.getLessonTimes(hoursPerDay),
      showHiddenSidebarCourses: Boolean(
        this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT)
      ),
      backupEnabled: this.store.getBackupEnabled(),
      backupIntervalDays: this.store.getBackupIntervalDays()
    };
  }

  getCurrentPublicStateSnapshot() {
    return this.store.exportPublicStateSnapshot();
  }

  getCurrentLogicalStateSnapshot() {
    return { publicState: this.getCurrentPublicStateSnapshot() };
  }

  getPlanningUnsavedState() {
    const planningDirty = Boolean(this.settingsDirty);
    return {
      dirty: planningDirty,
      planningDirty,
      planningSettingsDirty: planningDirty,
      gradesDirty: false,
      gradesSettingsDirty: false,
      dirtyGradeCourseIds: []
    };
  }

  dispatchPlanningUnsavedState() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("classroom:planning-unsaved-state", {
      detail: this.getPlanningUnsavedState()
    }));
  }

  async ensurePlanningPublicLoaded() {
    this.workspaceHydrated = Boolean(this.workspaceController?.isReady?.() || this.isStandaloneWorkspace);
    return this.getCurrentPublicStateSnapshot();
  }

  getWorkspaceShellStatus() {
    const snapshot = this.workspaceClient?.getSnapshot("shell");
    return snapshot && typeof snapshot === "object" ? snapshot : {};
  }

  getWorkspacePersistenceStatus() {
    const persistence = this.getWorkspaceShellStatus().persistence;
    return persistence && typeof persistence === "object" ? persistence : {};
  }

  async executeWorkspaceAction(action, detail = null) {
    const result = await this.executeWorkspaceCommand("owner-action", { action, detail });
    if (!result?.ok) {
      const error = new Error(result?.message || "Workspace-Aktion fehlgeschlagen.");
      error.code = result?.code || "UNSUPPORTED";
      throw error;
    }
    return result.data || {};
  }

  hasShellDatabaseConnection() {
    return Boolean(this.getWorkspacePersistenceStatus().connected);
  }

  setSyncStatus(text, isError = false) {
    this.syncState.statusText = String(text || "");
    this.syncState.statusError = Boolean(isError);
    if (this.refs?.syncFileStatus) {
      this.refs.syncFileStatus.textContent = this.syncState.statusText;
      this.refs.syncFileStatus.style.color = isError ? "#ff8a8a" : "";
    }
  }

  isManualPersistenceMode() {
    return Boolean(this.getWorkspacePersistenceStatus().isManualMode);
  }

  isExternalFileSyncPresentationSupported() {
    return Boolean(this.getWorkspacePersistenceStatus().presentationSupported);
  }

  isManualPersistencePresentationMode() {
    return Boolean(this.getWorkspacePersistenceStatus().isManualMode);
  }

  getCurrentStateHash() {
    return "";
  }

  loadSyncMeta() {
    return { deviceId: "workspace-client", knownRemoteRevision: 0, knownRemoteHash: "", fileName: "", lastSyncedAt: "" };
  }

  saveSyncMeta() {}

  dispatchManualSaveButtonState() {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      const persistence = this.getWorkspacePersistenceStatus();
      const isManualMode = Boolean(persistence.isManualMode);
      const dirty = isManualMode && Boolean(persistence.dirty);
      const title = dirty
        ? "Ungespeicherte Änderungen speichern"
        : "Keine zu speichernden Änderungen";
      window.dispatchEvent(new CustomEvent("classroom:planning-manual-save-state", {
        detail: { isManualMode, dirty, title, ariaLabel: title }
      }));
    }
    this.renderDatabaseSection();
  }

  hasUncommittedPersistenceDraft() {
    return Boolean(this.settingsDirty);
  }

  queueSyncSave(reason = "planning-client") {
    void this.executeWorkspaceAction("sync-save", { reason }).catch(() => undefined);
    return true;
  }

  handleStoreSaved() {
    this.dispatchPlanningUnsavedState();
  }

  async selectSyncFile(mode = "existing", options = {}) {
    if (!this.workspaceController || this.isStandaloneWorkspace) return false;
    try {
      let handle = null;
      if (mode === "new-empty" && typeof window.showSaveFilePicker === "function") {
        const owner = this.workspaceController.getOwner?.();
        handle = await window.showSaveFilePicker({
          suggestedName: owner?.buildSyncFileSuggestedName?.() || "TeachHelper-Datenbank.json",
          types: [{ description: "TeachHelper-Datenbank", accept: { "application/json": [".json"] } }]
        });
      } else if (typeof window.showOpenFilePicker === "function") {
        [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: "TeachHelper-Datenbank", accept: { "application/json": [".json"] } }]
        });
      }
      return handle ? this.acceptWorkspaceSyncFileHandle(handle, mode, options) : false;
    } catch (error) {
      if (error?.name !== "AbortError") {
        await this.showInfoMessage(error?.message || "Datenbankdatei konnte nicht ausgewählt werden.");
      }
      return false;
    }
  }

  async acceptWorkspaceSyncFileHandle(handle, mode = "existing", options = {}) {
    const result = await this.executeWorkspaceAction("sync-connect", { handle, mode, ...options });
    return Boolean(result.changed);
  }

  async acceptWorkspaceBackupDirectoryHandle(handle) {
    const result = await this.executeWorkspaceAction("backup-directory-connect", { handle });
    return Boolean(result.changed);
  }

  async initializeExternalFileSync() {
    this.syncState.initialized = true;
    this.workspaceHydrated = Boolean(this.workspaceController?.isReady?.() || this.isStandaloneWorkspace);
    return true;
  }

  shouldPromptForManualDatabaseOnStartup() {
    if (!this.isManualPersistencePresentationMode()) return false;
    const persistence = this.getWorkspacePersistenceStatus();
    return !persistence.connected && !String(persistence.fileName || "").trim();
  }

  async tryReconnectStoredSyncFile() {
    if (this.hasShellDatabaseConnection()) return false;
    const result = await this.executeWorkspaceAction("sync-reconnect", { allowPrompt: true });
    return Boolean(result.changed);
  }

  async ensureBackupDirectoryReady({ allowPrompt = false } = {}) {
    const result = await this.executeWorkspaceAction("backup-directory-reconnect", { allowPrompt });
    return Boolean(result.changed);
  }

  openSyncSetupSettingsOnStartup() {}

  ensureStandaloneSettingsView() {
    if (!this.refs.stackGlass || !this.refs.viewSettings) {
      return;
    }
    let shell = this.refs.settingsShell;
    if (!shell) {
      shell = document.createElement("section");
      shell.id = "settings-shell";
      shell.className = "stack-glass";
      shell.hidden = true;
      this.refs.stackGlass.insertAdjacentElement("afterend", shell);
      this.refs.settingsShell = shell;
    }
    if (this.refs.viewSettings.parentElement !== shell) {
      shell.append(this.refs.viewSettings);
    }
  }

  initNumberSteppers() {
    const inputs = [...document.querySelectorAll("input[type='number']")];
    for (const input of inputs) {
      if (input.dataset.stepperInit === "1") {
        continue;
      }
      input.dataset.stepperInit = "1";

      const wrapper = document.createElement("span");
      wrapper.className = "number-stepper";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.append(input);

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "number-stepper-btn minus";
      minus.textContent = "-";
      minus.setAttribute("tabindex", "-1");
      minus.setAttribute("aria-label", "Wert verringern");

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "number-stepper-btn plus";
      plus.textContent = "+";
      plus.setAttribute("tabindex", "-1");
      plus.setAttribute("aria-label", "Wert erhöhen");

      wrapper.append(minus, plus);
      input._stepperMinus = minus;
      input._stepperPlus = plus;

      this.bindNumberStepperButton(input, minus, -1);
      this.bindNumberStepperButton(input, plus, 1);

      const sync = () => this.syncNumberStepperState(input);
      input.addEventListener("input", sync);
      input.addEventListener("change", sync);
      sync();
    }
  }

  bindNumberStepperButton(input, button, direction) {
    let holdTimeout = 0;
    let holdInterval = 0;
    const clearHold = () => {
      if (holdTimeout) {
        clearTimeout(holdTimeout);
        holdTimeout = 0;
      }
      if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = 0;
      }
    };
    const trigger = () => {
      this.stepNumberInput(input, direction);
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      trigger();
      clearHold();
      holdTimeout = window.setTimeout(() => {
        holdInterval = window.setInterval(trigger, 80);
      }, 320);
    });

    for (const eventName of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
      button.addEventListener(eventName, clearHold);
    }
    window.addEventListener("pointerup", clearHold);
  }

  stepNumberInput(input, direction) {
    if (!input || input.disabled || input.readOnly) {
      return;
    }
    const previous = String(input.value || "");
    try {
      if (direction < 0) {
        input.stepDown();
      } else {
        input.stepUp();
      }
    } catch (_err) {
      const base = Number.isFinite(Number(input.value))
        ? Number(input.value)
        : (input.min !== "" && Number.isFinite(Number(input.min)) ? Number(input.min) : 0);
      const step = input.step && input.step !== "any" && Number.isFinite(Number(input.step))
        ? Number(input.step)
        : 1;
      let next = base + (step * direction);
      if (input.min !== "" && Number.isFinite(Number(input.min))) {
        next = Math.max(Number(input.min), next);
      }
      if (input.max !== "" && Number.isFinite(Number(input.max))) {
        next = Math.min(Number(input.max), next);
      }
      input.value = String(next);
    }

    if (String(input.value || "") !== previous) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.syncNumberStepperState(input);
  }

  syncNumberStepperState(input) {
    if (!input || !input._stepperMinus || !input._stepperPlus) {
      return;
    }
    const disabled = Boolean(input.disabled || input.readOnly);
    let disableMinus = disabled;
    let disablePlus = disabled;

    const hasValue = String(input.value || "").trim() !== "";
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);

    if (!disabled && hasValue && Number.isFinite(value)) {
      if (input.min !== "" && Number.isFinite(min) && value <= min) {
        disableMinus = true;
      }
      if (input.max !== "" && Number.isFinite(max) && value >= max) {
        disablePlus = true;
      }
    }

    input._stepperMinus.disabled = disableMinus;
    input._stepperPlus.disabled = disablePlus;
  }

  syncAllNumberSteppers() {
    const inputs = document.querySelectorAll("input[type='number'][data-stepper-init='1']");
    for (const input of inputs) {
      this.syncNumberStepperState(input);
    }
  }

  getSettingsDraftLessonTimes(hoursPerDay = null) {
    const resolvedHoursPerDay = clamp(
      Number(hoursPerDay || (this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
      1,
      12
    );
    return normalizeLessonTimes(
      this.settingsDraft && this.settingsDraft.lessonTimes,
      resolvedHoursPerDay
    );
  }

  updateSettingsDraftLessonTime(lesson, field, value) {
    const hoursPerDay = clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12);
    const nextTimes = this.getSettingsDraftLessonTimes(hoursPerDay);
    const target = nextTimes.find((entry) => Number(entry.lesson) === Number(lesson));
    if (!target) {
      return;
    }
    target[field === "end" ? "end" : "start"] = normalizeLessonTimeValue(value);
    this.settingsDraft.lessonTimes = nextTimes;
  }

  getWeekHighlightSlot(weekStartIso, weekEndIso, now = new Date()) {
    const year = this.activeSchoolYear;
    if (!year || !weekStartIso || !weekEndIso) {
      return null;
    }
    this.store.ensureLessonsForYear(year.id);
    const hoursPerDay = this.store.getHoursPerDay();
    const validation = validateLessonTimes(this.store.getLessonTimes(hoursPerDay), hoursPerDay);
    if (!validation.valid || !validation.hasAnyValue) {
      return null;
    }
    const lessonTimesByHour = new Map(validation.normalized.map((entry) => [Number(entry.lesson), entry]));
    const todayIso = toIsoDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const lessons = this.store
      .listLessonsForWeek(year.id, year.startDate, todayIso)
      .filter((lesson) => !lesson.canceled && this.lessonSupportsPerformance(lesson) && !lesson.isEntfall);
    let activeSlot = null;
    let lastSlot = null;

    lessons.forEach((lesson) => {
      const lessonDate = String(lesson.lessonDate || "").trim();
      const hour = Number(lesson.hour) || 0;
      if (!lessonDate || !hour) {
        return;
      }
      const timeRow = lessonTimesByHour.get(hour);
      if (!timeRow) {
        return;
      }
      const startMinutes = parseLessonTimeMinutes(timeRow.start);
      const endMinutes = parseLessonTimeMinutes(timeRow.end);
      if (startMinutes === null || endMinutes === null) {
        return;
      }
      if (lessonDate === todayIso && nowMinutes >= startMinutes && nowMinutes < endMinutes) {
        activeSlot = {
          dayIso: lessonDate,
          hour,
          lessonId: Number(lesson.id) || null
        };
        return;
      }
      const isPastLesson = lessonDate < todayIso || (lessonDate === todayIso && endMinutes <= nowMinutes);
      if (!isPastLesson) {
        return;
      }
      if (
        !lastSlot
        || lessonDate > lastSlot.dayIso
        || (lessonDate === lastSlot.dayIso && endMinutes >= lastSlot.endMinutes)
      ) {
        lastSlot = {
          dayIso: lessonDate,
          hour,
          lessonId: Number(lesson.id) || null,
          endMinutes
        };
      }
    });

    if (activeSlot) {
      return activeSlot.dayIso >= weekStartIso && activeSlot.dayIso <= weekEndIso
        ? activeSlot
        : null;
    }
    if (!lastSlot) {
      return null;
    }
    const highlightSlot = {
      dayIso: lastSlot.dayIso,
      hour: lastSlot.hour,
      lessonId: lastSlot.lessonId
    };
    return highlightSlot.dayIso >= weekStartIso && highlightSlot.dayIso <= weekEndIso
      ? highlightSlot
      : null;
  }

  isSettingsDraftDirty() {
    const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
    if (Number(draft.hoursPerDay) !== Number(this.store.getHoursPerDay())) {
      return true;
    }
    if (!lessonTimesEqual(draft.lessonTimes, this.store.getLessonTimes(draft.hoursPerDay), draft.hoursPerDay)) {
      return true;
    }
    if (
      Boolean(draft.showHiddenSidebarCourses)
      !== Boolean(this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT))
    ) {
      return true;
    }
    if (Boolean(draft.backupEnabled) !== Boolean(this.store.getBackupEnabled())) {
      return true;
    }
    if (Number(draft.backupIntervalDays) !== Number(this.store.getBackupIntervalDays())) {
      return true;
    }
    return false;
  }

  isSettingsBackupDraftDefault() {
    const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
    return (
      Boolean(draft.backupEnabled) === BACKUP_ENABLED_DEFAULT
      && Number(draft.backupIntervalDays) === BACKUP_INTERVAL_DEFAULT_DAYS
    );
  }

  refreshSettingsDirtyState() {
    this.settingsDirty = this.isSettingsDraftDirty();
    this.updateSettingsActionButtons();
    this.dispatchPlanningUnsavedState();
  }

  applyValidatedSettingsDraftToStore(draft, normalizedLessonTimes) {
    const beforeState = this.getCurrentPublicStateSnapshot();
    let committed = false;
    this.store._suspendSaveHooks();
    try {
      this.store.setHoursPerDay(draft.hoursPerDay);
      this.store.setLessonTimes(normalizedLessonTimes, draft.hoursPerDay);
      this.store.setSetting("showHiddenSidebarCourses", Boolean(draft.showHiddenSidebarCourses));
      this.store.setBackupEnabled(draft.backupEnabled);
      this.store.setBackupIntervalDays(draft.backupIntervalDays);
      if (
        Number(this.store.getHoursPerDay()) !== Number(draft.hoursPerDay)
        || !lessonTimesEqual(
          this.store.getLessonTimes(draft.hoursPerDay),
          normalizedLessonTimes,
          draft.hoursPerDay
        )
        || Boolean(this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT))
          !== Boolean(draft.showHiddenSidebarCourses)
        || Boolean(this.store.getBackupEnabled()) !== Boolean(draft.backupEnabled)
        || Number(this.store.getBackupIntervalDays()) !== Number(draft.backupIntervalDays)
      ) {
        throw new Error("Einstellungen konnten nicht vollständig übernommen werden.");
      }
      committed = true;
    } catch (error) {
      this.store.state = this.store.normalizePublicState(beforeState);
      this.store.pendingPublicSaveNotification = false;
      throw error;
    } finally {
      this.store._resumeSaveHooks({ flush: committed });
      if (!committed) {
        this.store.pendingPublicSaveNotification = false;
      }
    }
  }

  async applySettingsDraftToStore() {
    const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const lessonTimesValidation = validateLessonTimes(draft.lessonTimes, draft.hoursPerDay);
    if (!lessonTimesValidation.valid) {
      await this.showInfoMessage(lessonTimesValidation.message || "Die Stundenzeiten sind ungültig.");
      this.activeSettingsTab = "lessonTimes";
      this.settingsSourceView = "planning";
      this.renderSettingsTabs();
      this.renderLessonTimesSection();
      return false;
    }
    if (!this.isStandaloneWorkspace && this.workspaceController) {
      if (!this.workspaceHydrated || !this.workspaceController.isReady?.()) {
        await this.showInfoMessage("Der gemeinsame Datenstand wird noch geladen. Einstellungen wurden nicht gespeichert.");
        return false;
      }
      const result = await this.executeWorkspaceCommand(
        WORKSPACE_COMMAND_APPLY_SETTINGS,
        { settings: cloneJsonValue(draft, {}) },
        { baseRevision: this.settingsDraftRevision }
      );
      if (!result?.ok) {
        await this.showInfoMessage(
          result?.code === "STALE_STATE"
            ? "Die Einstellungen wurden zwischenzeitlich geändert. Dein Entwurf blieb erhalten; bitte prüfe ihn erneut."
            : (result?.message || "Einstellungen konnten nicht gespeichert werden.")
        );
        return false;
      }
      this.settingsDraftRevision = Math.max(0, Number(result.revision) || this.workspaceRevision || 0);
    } else {
      this.applyValidatedSettingsDraftToStore(draft, lessonTimesValidation.normalized);
      this.settingsDraftRevision = Math.max(
        0,
        Number(this.workspaceController?.getRevision?.()) || Number(this.workspaceRevision) || 0
      );
    }
    if (this.store.getBackupEnabled()) {
      void this.maybeRunAutomaticWebBackup();
    }
    this.settingsDraft = this.buildSettingsDraftFromStore();
    this.settingsDirty = false;
    this.selectedLessonId = null;
    this.renderAll();
    this.dispatchPlanningUnsavedState();
    return true;
  }

  cancelSettingsDraftChanges() {
    this.settingsDraft = this.buildSettingsDraftFromStore();
    this.settingsDirty = false;
    this.settingsDraftRevision = Math.max(
      0,
      Number(this.workspaceController?.getRevision?.()) || Number(this.workspaceRevision) || 0
    );
    this.renderDisplaySection();
    this.renderLessonTimesSection();
    this.renderBackupSection();
    this.renderDatabaseSection();
    this.updateSettingsActionButtons();
    this.dispatchPlanningUnsavedState();
  }

  async resolveUnsavedSettingsNavigation() {
    if (this.currentView !== "settings" || !this.settingsDirty) {
      return true;
    }
    const choice = await this.showChoiceMessage(
      "Die Einstellungen enthalten ungespeicherte Änderungen.",
      {
        title: "Ungespeicherte Änderungen",
        okText: "Speichern",
        cancelText: "Abbrechen",
        alternateText: "Verwerfen & wechseln",
        dangerAlternate: true,
        warning: true
      }
    );
    if (choice === "ok") {
      return this.applySettingsDraftToStore();
    }
    if (choice === "discard") {
      this.cancelSettingsDraftChanges();
      return true;
    }
    return false;
  }

  async applyDayoffDefaults() {
    const year = this.activeSchoolYear;
    if (!year) {
      return false;
    }
    if (!await this.showConfirmMessage("Standardwerte für Pflicht-Ferien und unterrichtsfreie Tage anwenden?")) {
      return false;
    }
    const overwrite = await this.showConfirmMessage("Sollen vorhandene Pflicht-Ferienwerte überschrieben werden?");
    const startYear = Number(String(year.startDate).slice(0, 4));
    const defaults = defaultHolidayRangesForYear(startYear);
    if (!defaults || Object.keys(defaults).length === 0) {
      await this.showInfoMessage("Für dieses Schuljahr sind keine Standard-Ferienwerte hinterlegt.");
      return false;
    }
    this.store.applyHolidayDefaultsForYear(year.id, overwrite);
    this.store.resetSpecialDays(startYear);
    this.renderAll();
    return true;
  }

  async applySettingsDefaultsForActiveTab() {
    const tab = this.activeSettingsTab;
    if (tab === "dayoff") {
      await this.applyDayoffDefaults();
      return;
    }
    if (tab === "display") {
      this.settingsDraft.hoursPerDay = HOURS_PER_DAY_DEFAULT;
      this.settingsDraft.lessonTimes = normalizeLessonTimes(
        this.settingsDraft.lessonTimes,
        HOURS_PER_DAY_DEFAULT
      );
      this.settingsDraft.showHiddenSidebarCourses = SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT;
      this.renderDisplaySection();
      this.renderLessonTimesSection();
      this.refreshSettingsDirtyState();
      return;
    }
    if (tab === "lessonTimes") {
      this.settingsDraft.lessonTimes = buildDefaultLessonTimes(
        clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12)
      );
      this.renderLessonTimesSection();
      this.refreshSettingsDirtyState();
      return;
    }
    if (tab === "backup" || tab === "database") {
      this.settingsDraft.backupEnabled = BACKUP_ENABLED_DEFAULT;
      this.settingsDraft.backupIntervalDays = BACKUP_INTERVAL_DEFAULT_DAYS;
      this.renderBackupSection();
      this.refreshSettingsDirtyState();
    }
  }

  async applySettingsSaveForActiveTab() {
    const tab = this.activeSettingsTab;
    if (tab === "display" || tab === "lessonTimes" || tab === "backup" || tab === "database") {
      if (!this.settingsDirty) {
        return;
      }
      if (await this.applySettingsDraftToStore()) {
        await this.persistExplicitDatabaseSave("planning-settings-save");
      }
    }
  }

  applySettingsCancelForActiveTab() {
    const tab = this.activeSettingsTab;
    if (tab === "display" || tab === "lessonTimes" || tab === "backup" || tab === "database") {
      this.cancelSettingsDraftChanges();
      return;
    }
    if (tab === "dayoff") {
      this.renderDayOffSection();
    }
  }

  updateSettingsActionButtons() {
    if (!this.refs.settingsResetAll || !this.refs.settingsSaveAll || !this.refs.settingsCancelAll) {
      return;
    }
    const tab = this.activeSettingsTab;
    let resetEnabled = false;
    let saveEnabled = false;
    let cancelEnabled = false;

    if (tab === "dayoff") {
      resetEnabled = Boolean(this.activeSchoolYear);
    } else if (tab === "display") {
      resetEnabled = Number(this.settingsDraft.hoursPerDay) !== HOURS_PER_DAY_DEFAULT
        || Boolean(this.settingsDraft.showHiddenSidebarCourses) !== SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT;
      saveEnabled = this.settingsDirty;
      cancelEnabled = this.settingsDirty;
    } else if (tab === "lessonTimes") {
      resetEnabled = this.getSettingsDraftLessonTimes().some((entry) => Boolean(entry.start || entry.end));
      saveEnabled = this.settingsDirty;
      cancelEnabled = this.settingsDirty;
    } else if (tab === "database") {
      if (!this.isExternalFileSyncPresentationSupported() || this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired") {
        resetEnabled = false;
        saveEnabled = false;
        cancelEnabled = false;
      } else {
        resetEnabled = !this.isSettingsBackupDraftDefault();
        saveEnabled = this.settingsDirty;
        cancelEnabled = this.settingsDirty;
      }
    } else if (tab === "backup") {
      resetEnabled = !this.isSettingsBackupDraftDefault();
      saveEnabled = this.settingsDirty;
      cancelEnabled = this.settingsDirty;
    }

    this.refs.settingsResetAll.disabled = !resetEnabled;
    this.refs.settingsSaveAll.disabled = !saveEnabled;
    this.refs.settingsCancelAll.disabled = !cancelEnabled;
  }

  _currentIsoWeek() {
    return isoWeekNumber(this.weekStartIso);
  }

  _summerBreakBounds() {
    const year = this.activeSchoolYear;
    if (!year) {
      return { start: null, end: null };
    }
    const startYear = Number(String(year.startDate || "").slice(0, 4));
    const currentDefaults = defaultHolidayRangesForYear(startYear);
    const nextDefaults = defaultHolidayRangesForYear(startYear + 1);
    const currentSummer = Array.isArray(currentDefaults.Sommerferien)
      ? currentDefaults.Sommerferien
      : null;
    const nextSummer = Array.isArray(nextDefaults.Sommerferien)
      ? nextDefaults.Sommerferien
      : null;

    const ranges = this.store
      .listFreeRanges(year.id)
      .filter((item) => String(item.label || "").trim().toLowerCase() === "sommerferien");
    let start = ranges.find((item) => Boolean(item.startDate))?.startDate || null;
    let end = ranges.find((item) => Boolean(item.endDate))?.endDate || null;

    if (!end && currentSummer && currentSummer[1]) {
      end = currentSummer[1];
    }
    if (!start && nextSummer && nextSummer[0]) {
      start = nextSummer[0];
    }

    if (start && end && start <= end) {
      if (nextSummer && nextSummer[0]) {
        start = nextSummer[0];
      } else {
        start = year.endDate;
      }
    }

    return {
      start: start || null,
      end: end || null
    };
  }

  _weekBounds() {
    const year = this.activeSchoolYear;
    if (!year) {
      return { min: null, max: null };
    }
    return {
      min: weekStartFor(year.startDate),
      max: weekStartFor(year.endDate)
    };
  }

  _clampWeekStart(iso) {
    const { min, max } = this._weekBounds();
    if (min && iso < min) {
      return min;
    }
    if (max && iso > max) {
      return max;
    }
    return iso;
  }

  isAccessLocked() {
    if (!this.isStandaloneWorkspace && this.workspaceController && !this.workspaceHydrated) {
      return true;
    }
    const year = this.activeSchoolYear;
    if (!year) {
      return true;
    }
    return !this.store.requiredHolidaysComplete(year.id);
  }

  updateAccessLock() {
    const persistence = this.getWorkspacePersistenceStatus();
    const presentationSupported = Boolean(persistence.presentationSupported);
    const manualDatabaseRequired = !presentationSupported
      && this.shouldPromptForManualDatabaseOnStartup();
    const persistenceSetupRequired = !this.tutorialDemoMode;
    const databaseRequired = persistenceSetupRequired && (
      (presentationSupported && !persistence.connected)
      || manualDatabaseRequired
    );
    const backupDirRequired = persistenceSetupRequired
      && presentationSupported
      && !databaseRequired
      && !persistence.backupConnected;
    const holidaysRequired = !databaseRequired && !backupDirRequired && this.isAccessLocked();
    const manualDatabaseAllowed = manualDatabaseRequired && this.activeSettingsTab === "database";
    this.lockReason = databaseRequired
      ? "databaseRequired"
      : (backupDirRequired ? "backupDirRequired" : (holidaysRequired ? "holidaysRequired" : ""));
    this.locked = this.lockReason !== "";
    if (document.body) {
      document.body.dataset.persistenceSetupPending = (databaseRequired || backupDirRequired) ? "true" : "false";
    }
    if (this.locked) {
      this.closeWeekCalendarDialog();
      this.closeTopicDialog();
      this.resetInlineWeekBlockTopicEdit();
      this.currentView = "settings";
      this.settingsSourceView = "planning";
      this.activeSettingsTab = (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired")
        ? "database"
        : (manualDatabaseAllowed ? "database" : "dayoff");
    }
    this.refs.viewWeekBtn.disabled = this.locked;
    if (this.refs.viewSettingsBtn) {
      this.refs.viewSettingsBtn.disabled = this.locked;
    }
    this.updateSettingsActionButtons();
  }

  updateWeekNavigation() {
    const { min, max } = this._weekBounds();
    const atMin = Boolean(min && this.weekStartIso <= min);
    const atMax = Boolean(max && this.weekStartIso >= max);
    const currentWeekTarget = currentWeekStartForDisplay();
    this.refs.weekPrev.disabled = this.locked || atMin;
    this.refs.weekNext.disabled = this.locked || atMax;
    this.refs.kwLabel.disabled = this.locked;
    this.refs.weekPickerBtn.disabled = this.locked || this.weekStartIso === currentWeekTarget;
    this.refs.weekDate.disabled = this.locked;
  }

  _weekCalendarRange() {
    const { min, max } = this._weekBounds();
    if (min && max) {
      return {
        minDate: min,
        maxDate: addDays(max, 6)
      };
    }
    const year = this.activeSchoolYear;
    if (!year) {
      return { minDate: null, maxDate: null };
    }
    return {
      minDate: year.startDate,
      maxDate: year.endDate
    };
  }

  _weekCalendarMonthStartFor(iso) {
    const value = parseIsoDate(iso);
    if (!value) {
      return null;
    }
    return toIsoDate(new Date(value.getFullYear(), value.getMonth(), 1));
  }

  _weekCalendarShiftMonth(iso, delta) {
    const value = parseIsoDate(iso);
    if (!value) {
      return null;
    }
    return toIsoDate(new Date(value.getFullYear(), value.getMonth() + Number(delta || 0), 1));
  }

  _clampWeekCalendarMonth(monthIso) {
    const { minDate, maxDate } = this._weekCalendarRange();
    const minMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
    const maxMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
    let value = this._weekCalendarMonthStartFor(monthIso)
      || this._weekCalendarMonthStartFor(this.weekStartIso)
      || this._weekCalendarMonthStartFor(toIsoDate(new Date()));
    if (!value) {
      return null;
    }
    if (minMonth && value < minMonth) {
      value = minMonth;
    }
    if (maxMonth && value > maxMonth) {
      value = maxMonth;
    }
    return value;
  }

  syncWeekCalendarNavButtons() {
    if (!this.refs.weekCalendarPrev || !this.refs.weekCalendarNext) {
      return;
    }
    const { minDate, maxDate } = this._weekCalendarRange();
    const minMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
    const maxMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
    const month = this.weekCalendarMonthIso;
    this.refs.weekCalendarPrev.disabled = this.locked || !month || Boolean(minMonth && month <= minMonth);
    this.refs.weekCalendarNext.disabled = this.locked || !month || Boolean(maxMonth && month >= maxMonth);
  }

  syncWeekCalendarMonthOptions() {
    const select = this.refs.weekCalendarMonth;
    if (!select) {
      return;
    }
    this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
    const { minDate, maxDate } = this._weekCalendarRange();

    let startMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
    let endMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
    if (!startMonth || !endMonth) {
      const anchor = parseIsoDate(this.weekCalendarMonthIso || this.weekStartIso || toIsoDate(new Date()));
      startMonth = toIsoDate(new Date(anchor.getFullYear() - 1, 0, 1));
      endMonth = toIsoDate(new Date(anchor.getFullYear() + 1, 11, 1));
    }
    if (startMonth > endMonth) {
      const swap = startMonth;
      startMonth = endMonth;
      endMonth = swap;
    }

    select.innerHTML = "";
    let cursor = startMonth;
    let guard = 0;
    while (cursor && cursor <= endMonth && guard < 60) {
      const value = parseIsoDate(cursor);
      const option = document.createElement("option");
      option.value = cursor;
      option.textContent = value
        ? value.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
        : cursor;
      select.append(option);
      cursor = this._weekCalendarShiftMonth(cursor, 1);
      guard += 1;
    }

    if (!select.querySelector(`option[value="${this.weekCalendarMonthIso}"]`) && select.options.length > 0) {
      this.weekCalendarMonthIso = select.options[0].value;
    }
    if (this.weekCalendarMonthIso) {
      select.value = this.weekCalendarMonthIso;
    }
    this.syncWeekCalendarNavButtons();
  }

  setWeekCalendarHoverWeek(weekStartIso) {
    const grid = this.refs.weekCalendarGrid;
    if (!grid) {
      this.weekCalendarHoverWeekStart = null;
      return;
    }
    const rows = [...grid.querySelectorAll("tr.week-calendar-row[data-week-start]")];
    let target = weekStartIso ? String(weekStartIso) : null;
    if (target && !rows.some((row) => row.dataset.weekStart === target)) {
      target = null;
    }
    this.weekCalendarHoverWeekStart = target;
    for (const row of rows) {
      row.classList.toggle("hovered", Boolean(target && row.dataset.weekStart === target));
    }
  }

  renderWeekCalendarGrid() {
    const grid = this.refs.weekCalendarGrid;
    if (!grid) {
      return;
    }
    this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
    const monthIso = this.weekCalendarMonthIso;
    if (!monthIso) {
      grid.innerHTML = "";
      return;
    }

    const monthStart = parseIsoDate(monthIso);
    if (!monthStart) {
      grid.innerHTML = "";
      return;
    }

    const monthTag = monthIso.slice(0, 7);
    const gridStart = weekStartFor(monthIso);
    const selectedWeekStart = this._clampWeekStart(this.weekStartIso);
    const selectedInMonth = selectedWeekStart.slice(0, 7) === monthTag;
    let selectedRow = null;
    if (selectedInMonth) {
      const diffDays = Math.round((parseIsoDate(selectedWeekStart) - parseIsoDate(gridStart)) / 86400000);
      if (diffDays >= 0 && diffDays < 42 && diffDays % 7 === 0) {
        selectedRow = diffDays / 7;
      }
    }

    const todayIso = toIsoDate(new Date());
    const todayWeekStart = currentWeekStartForDisplay();
    const { minDate, maxDate } = this._weekCalendarRange();
    grid.innerHTML = "";

    for (let row = 0; row < 6; row += 1) {
      const weekStart = addDays(gridStart, row * 7);
      const weekEnd = addDays(weekStart, 6);
      const rowInRange = (!minDate || weekEnd >= minDate) && (!maxDate || weekStart <= maxDate);

      const tr = document.createElement("tr");
      tr.className = "week-calendar-row";
      tr.dataset.weekStart = weekStart;
      if (row === selectedRow) {
        tr.classList.add("active");
      }
      if (rowInRange && weekStart === todayWeekStart) {
        tr.classList.add("today-week");
      }
      if (!rowInRange) {
        tr.classList.add("out-of-range");
      }

      const kwCell = document.createElement("td");
      kwCell.className = "week-calendar-week-cell";
      const kwButton = document.createElement("button");
      kwButton.type = "button";
      kwButton.className = "week-calendar-week-btn";
      kwButton.textContent = String(isoWeekNumber(weekStart)).padStart(2, "0");
      kwButton.dataset.weekStart = weekStart;
      kwButton.disabled = this.locked || !rowInRange;
      kwCell.append(kwButton);
      tr.append(kwCell);

      for (let col = 0; col < 5; col += 1) {
        const dayIso = addDays(weekStart, col);
        const dayDate = parseIsoDate(dayIso);
        const inRange = rowInRange && (!minDate || dayIso >= minDate) && (!maxDate || dayIso <= maxDate);

        const td = document.createElement("td");
        const dayButton = document.createElement("button");
        dayButton.type = "button";
        dayButton.className = "week-calendar-day-btn";
        dayButton.textContent = dayDate ? String(dayDate.getDate()) : "";
        dayButton.dataset.weekStart = weekStart;
        dayButton.dataset.date = dayIso;
        dayButton.disabled = this.locked || !inRange;
        if (dayIso.slice(0, 7) !== monthTag) {
          dayButton.classList.add("outside-month");
        }
        if (dayIso === todayIso) {
          dayButton.classList.add("today");
        }
        td.append(dayButton);
        tr.append(td);
      }

      grid.append(tr);
    }
    this.setWeekCalendarHoverWeek(this.weekCalendarHoverWeekStart);
    this.syncWeekCalendarNavButtons();
  }

  positionWeekCalendarDialog() {
    const dialog = this.refs.weekCalendarDialog;
    const anchor = this.refs.kwLabel;
    if (!dialog || !anchor) {
      return;
    }
    const margin = 8;
    const maxWidth = Math.min(368, window.innerWidth - (margin * 2));
    const anchorRect = anchor.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const dialogHeight = dialogRect.height > 0 ? dialogRect.height : 360;
    const left = clamp(
      Math.round(anchorRect.left + (anchorRect.width / 2) - (maxWidth / 2)),
      margin,
      Math.max(margin, window.innerWidth - maxWidth - margin)
    );
    const top = clamp(
      Math.round(anchorRect.bottom + 8),
      margin,
      Math.max(margin, window.innerHeight - dialogHeight - margin)
    );
    dialog.style.width = `${maxWidth}px`;
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  closeWeekCalendarDialog() {
    if (!this.refs.weekCalendarDialog) {
      return;
    }
    this.setWeekCalendarHoverWeek(null);
    this.closeDialog(this.refs.weekCalendarDialog);
  }

  applyWeekCalendarSelection(weekStartIso) {
    const selected = this._clampWeekStart(weekStartIso);
    this.closeWeekCalendarDialog();
    if (!selected || selected === this.weekStartIso) {
      return;
    }
    this.weekStartIso = selected;
    this.selectedLessonId = null;
    this.renderWeekSection();
    this.renderLessonSection();
  }

  openWeekMiniCalendar() {
    if (this.locked) {
      return;
    }
    const dialog = this.refs.weekCalendarDialog;
    if (dialog && this.refs.weekCalendarMonth && this.refs.weekCalendarGrid) {
      if (dialog.open) {
        this.closeWeekCalendarDialog();
        return;
      }
      this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekStartIso);
      this.syncWeekCalendarMonthOptions();
      this.renderWeekCalendarGrid();
      this.positionWeekCalendarDialog();
      this.openDialog(dialog);
      requestAnimationFrame(() => {
        this.positionWeekCalendarDialog();
      });
      return;
    }
    const input = this.refs.weekDate;
    if (!input) {
      return;
    }
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
    input.focus();
  }

  openDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch (_error) {
          dialog.setAttribute("open", "open");
        }
      }
      return;
    }
    dialog.setAttribute("open", "open");
  }

  closeDialog(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function") {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    dialog.removeAttribute("open");
  }

  yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  bindDialogBackdropClose(dialog, closeHandler) {
    if (!dialog || typeof closeHandler !== "function") {
      return;
    }
    let pointerStartedOnBackdrop = false;
    dialog.addEventListener("pointerdown", (event) => {
      pointerStartedOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener("pointercancel", () => {
      pointerStartedOnBackdrop = false;
    });
    dialog.addEventListener("click", (event) => {
      const shouldClose = event.target === dialog && pointerStartedOnBackdrop;
      pointerStartedOnBackdrop = false;
      if (shouldClose) {
        closeHandler();
      }
    });
  }

  _resolveMessageDialog(action = "cancel") {
    const resolver = this.pendingMessageDialogResolver;
    const mode = this.pendingMessageDialogMode || "alert";
    this.pendingMessageDialogResolver = null;
    this.pendingMessageDialogMode = null;
    this.closeDialog(this.refs.messageDialog);
    if (!resolver) {
      return;
    }
    if (mode === "confirm") {
      resolver(action === "ok");
      return;
    }
    if (mode === "choice") {
      resolver(action === "ok" || action === "discard" ? action : "cancel");
      return;
    }
    if (mode === "prompt" || mode === "select") {
      if (action === "ok") {
        resolver(String((mode === "select" ? this.refs.messageDialogSelect : this.refs.messageDialogInput).value || ""));
      } else {
        resolver(null);
      }
      return;
    }
    resolver(undefined);
  }

  showMessageDialog({
    mode = "alert",
    title = "Hinweis",
    message = "",
    okText = "OK",
    cancelText = "Abbrechen",
    defaultValue = "",
    inputLabel = "Eingabe",
    inputListId = "",
    selectOptions = [],
    dangerOk = false,
    warnOk = false,
    alternateText = "",
    dangerAlternate = false,
    warning = false
  } = {}) {
    const normalizedMode = mode === "confirm" || mode === "choice" || mode === "prompt" || mode === "select" ? mode : "alert";
    if (
      !this.refs.messageDialog
      || !this.refs.messageDialogTitle
      || !this.refs.messageDialogText
      || !this.refs.messageDialogInputLabel
      || !this.refs.messageDialogOk
      || !this.refs.messageDialogCancel
      || !this.refs.messageDialogActionsTop
      || !this.refs.messageDialogCancelTop
      || !this.refs.messageDialogOkTop
      || !this.refs.messageDialogDiscardTop
      || !this.refs.messageDialogActionsBottom
      || !this.refs.messageDialogInput
      || !this.refs.messageDialogSelect
      || !this.refs.messageDialogInputRow
    ) {
      if (normalizedMode === "confirm") {
        return Promise.resolve(false);
      }
      if (normalizedMode === "choice") {
        return Promise.resolve("cancel");
      }
      if (normalizedMode === "prompt") {
        return Promise.resolve(null);
      }
      if (normalizedMode === "select") return Promise.resolve(null);
      return Promise.resolve(undefined);
    }
    if (this.pendingMessageDialogResolver) {
      this._resolveMessageDialog("cancel");
    }
    this.refs.messageDialogTitle.textContent = String(title || "Hinweis");
    this.refs.messageDialog.classList.toggle("is-warning-message", Boolean(warning));
    this.refs.messageDialogText.textContent = String(message || "");
    this.refs.messageDialogText.hidden = !String(message || "").trim();
    this.refs.messageDialogOk.textContent = String(okText || "OK");
    this.refs.messageDialogOk.classList.toggle("danger-action", Boolean(dangerOk));
    this.refs.messageDialogOk.classList.toggle("warn-action", Boolean(warnOk) && !dangerOk);
    this.refs.messageDialogCancel.textContent = String(cancelText || "Abbrechen");
    const isChoice = normalizedMode === "choice";
    const isPrompt = normalizedMode === "prompt";
    const isSelect = normalizedMode === "select";
    const usesTopActions = isPrompt || isSelect || isChoice;
    const showDiscardTop = isChoice && Boolean(String(alternateText || "").trim());
    this.refs.messageDialogActionsTop.hidden = !usesTopActions;
    this.refs.messageDialogActionsBottom.hidden = usesTopActions;
    this.refs.messageDialogCancelTop.textContent = "❌";
    this.refs.messageDialogCancelTop.setAttribute("aria-label", String(cancelText || "Abbrechen"));
    this.refs.messageDialogCancelTop.dataset.tooltip = String(cancelText || "Abbrechen");
    this.refs.messageDialogOkTop.textContent = isSelect ? "✓" : "💾";
    this.refs.messageDialogOkTop.setAttribute("aria-label", String(okText || "OK"));
    this.refs.messageDialogOkTop.dataset.tooltip = String(okText || "OK");
    this.refs.messageDialogDiscardTop.textContent = "🗑️";
    this.refs.messageDialogDiscardTop.setAttribute("aria-label", String(alternateText || "Verwerfen & wechseln"));
    this.refs.messageDialogDiscardTop.dataset.tooltip = String(alternateText || "Verwerfen & wechseln");
    this.refs.messageDialogDiscardTop.classList.toggle("danger-action", Boolean(dangerAlternate));
    this.refs.messageDialogDiscardTop.hidden = !showDiscardTop;
    this.refs.messageDialogOkTop.classList.toggle("danger-action", Boolean(dangerOk));
    this.refs.messageDialogOkTop.classList.toggle("warn-action", Boolean(warnOk) && !dangerOk);
    this.refs.messageDialogInputRow.hidden = !isPrompt && !isSelect;
    this.refs.messageDialogInputLabel.textContent = String(inputLabel || "");
    this.refs.messageDialogInputLabel.hidden = (!isPrompt && !isSelect) || !String(inputLabel || "").trim();
    this.refs.messageDialogCancel.hidden = normalizedMode === "alert";
    if (isPrompt) {
      this.refs.messageDialogInput.value = String(defaultValue || "");
      const listId = String(inputListId || "").trim();
      if (listId) {
        this.refs.messageDialogInput.setAttribute("list", listId);
      } else {
        this.refs.messageDialogInput.removeAttribute("list");
      }
    } else {
      this.refs.messageDialogInput.value = "";
      this.refs.messageDialogInput.removeAttribute("list");
    }
    this.refs.messageDialogInput.hidden = !isPrompt;
    this.refs.messageDialogSelect.hidden = !isSelect;
    if (isSelect) {
      const values = Array.isArray(selectOptions) ? selectOptions : [];
      this.refs.messageDialogSelect.replaceChildren(...values.map((entry) => {
        const option = document.createElement("option");
        option.value = String(entry?.value ?? entry ?? "");
        option.textContent = String(entry?.label ?? entry?.value ?? entry ?? "");
        return option;
      }));
      this.refs.messageDialogSelect.value = String(defaultValue || "");
    } else {
      this.refs.messageDialogSelect.replaceChildren();
    }

    return new Promise((resolve) => {
      this.pendingMessageDialogResolver = resolve;
      this.pendingMessageDialogMode = normalizedMode;
      this.openDialog(this.refs.messageDialog);
      requestAnimationFrame(() => {
        if (isPrompt) {
          this.refs.messageDialogInput.focus();
          this.refs.messageDialogInput.select();
        } else if (isSelect) {
          this.refs.messageDialogSelect.focus();
        } else {
          (isChoice ? this.refs.messageDialogOkTop : this.refs.messageDialogOk).focus();
        }
        document.__teachhelperAppTooltipsController?.hide?.();
      });
    });
  }

  async showInfoMessage(message, title = "Hinweis") {
    await this.showMessageDialog({
      mode: "alert",
      title,
      message,
      okText: "OK"
    });
  }

  async showConfirmMessage(message, options = {}) {
    return this.showMessageDialog({
      mode: "confirm",
      title: options.title || "Bitte bestätigen",
      message,
      okText: options.okText || "Ja",
      cancelText: options.cancelText || "Abbrechen",
      dangerOk: Boolean(options.dangerOk),
      warnOk: Boolean(options.warnOk),
      warning: Boolean(options.warning)
    });
  }

  async showPromptMessage(message, defaultValue = "", options = {}) {
    return this.showMessageDialog({
      mode: "prompt",
      title: options.title || "Eingabe",
      message,
      okText: options.okText || "Übernehmen",
      cancelText: options.cancelText || "Abbrechen",
      defaultValue,
      inputLabel: options.inputLabel ?? "Eingabe",
      inputListId: options.inputListId || ""
    });
  }

  _courseDialogExistingColors(excludeCourseId = null) {
    const year = this.activeSchoolYear;
    if (!year) {
      return [];
    }
    const excludedId = Number(excludeCourseId || 0);
    return this.store
      .listCourses(year.id)
      .filter((item) => !item.noLesson)
      .filter((item) => !excludedId || Number(item.id) !== excludedId)
      .map((item) => normalizeCourseColor(item.color, false));
  }

  _renderCourseDialogColorPalette(existingColors = []) {
    const palette = this.refs.courseDialogColorPalette;
    if (!palette) {
      return;
    }
    const usedColors = new Set(
      existingColors
        .map((item) => normalizeHexColor(item, DEFAULT_COURSE_COLOR).toLowerCase())
    );
    palette.innerHTML = "";
    for (const baseColor of COLOR_PALETTE) {
      const color = normalizeHexColor(baseColor, DEFAULT_COURSE_COLOR);
      const isUsed = usedColors.has(color.toLowerCase());
      const button = document.createElement("button");
      button.type = "button";
      button.className = "course-color-btn";
      button.dataset.color = color;
      button.dataset.used = isUsed ? "1" : "0";
      button.disabled = isUsed;
      if (isUsed) {
        button.classList.add("used");
      }
      const fill = document.createElement("span");
      fill.className = "swatch-fill";
      fill.style.backgroundColor = color;
      button.append(fill);
      button.title = isUsed ? "Farbe bereits vergeben" : color;
      palette.append(button);
    }
    this._updateCourseDialogColorHighlight();
  }

  _updateCourseDialogColorHighlight() {
    const palette = this.refs.courseDialogColorPalette;
    if (!palette) {
      return;
    }
    const selected = canonicalHexColor(this.courseDialogSelectedColor || "");
    const selectedLower = selected ? selected.toLowerCase() : "";
    const buttons = [...palette.querySelectorAll("button.course-color-btn[data-color]")];
    for (const button of buttons) {
      const isUsed = button.dataset.used === "1";
      if (isUsed) {
        button.classList.remove("selected");
        continue;
      }
      const color = String(button.dataset.color || "").toLowerCase();
      button.classList.toggle("selected", Boolean(selectedLower && color === selectedLower));
    }
  }

  selectCourseDialogColor(color) {
    this.courseDialogSelectedColor = normalizeHexColor(
      color,
      this.courseDialogDefaultColor || DEFAULT_COURSE_COLOR
    );
    this._updateCourseDialogColorHighlight();
  }

  _renderCourseColorDialogPalette(existingColors = []) {
    const palette = this.refs.courseColorDialogPalette;
    if (!palette) {
      return;
    }
    const usedColors = new Set(
      existingColors
        .map((item) => normalizeHexColor(item, DEFAULT_COURSE_COLOR).toLowerCase())
    );
    palette.innerHTML = "";
    for (const baseColor of COLOR_PALETTE) {
      const color = normalizeHexColor(baseColor, DEFAULT_COURSE_COLOR);
      const isUsed = usedColors.has(color.toLowerCase());
      const button = document.createElement("button");
      button.type = "button";
      button.className = "course-color-btn";
      button.dataset.color = color;
      button.dataset.used = isUsed ? "1" : "0";
      button.disabled = isUsed;
      if (isUsed) {
        button.classList.add("used");
      }
      const fill = document.createElement("span");
      fill.className = "swatch-fill";
      fill.style.backgroundColor = color;
      button.append(fill);
      button.title = isUsed ? "Farbe bereits vergeben" : color;
      palette.append(button);
    }
    this._updateCourseColorDialogHighlight();
  }

  _updateCourseColorDialogHighlight() {
    const palette = this.refs.courseColorDialogPalette;
    if (!palette) {
      return;
    }
    const selected = canonicalHexColor(this.courseColorDialogSelectedColor || "");
    const selectedLower = selected ? selected.toLowerCase() : "";
    const buttons = [...palette.querySelectorAll("button.course-color-btn[data-color]")];
    for (const button of buttons) {
      const isUsed = button.dataset.used === "1";
      if (isUsed) {
        button.classList.remove("selected");
        continue;
      }
      const color = String(button.dataset.color || "").toLowerCase();
      button.classList.toggle("selected", Boolean(selectedLower && color === selectedLower));
    }
  }

  selectCourseColorDialogColor(color) {
    this.courseColorDialogSelectedColor = normalizeHexColor(
      color,
      this.courseColorDialogDefaultColor || DEFAULT_COURSE_COLOR
    );
    this._updateCourseColorDialogHighlight();
  }

  syncCourseDialogNoLessonState() {
    if (!this.refs.courseDialogNoLesson) {
      return;
    }
    const checked = Boolean(this.refs.courseDialogNoLesson.checked);
    if (this.courseDialogDraft) {
      this.courseDialogDraft.noLesson = checked;
    }
    if (checked) {
      if (this.courseDialogSelectedColor) {
        this.courseDialogColorBackup = this.courseDialogSelectedColor;
      }
      this.courseDialogSelectedColor = null;
    } else if (!this.courseDialogSelectedColor) {
      this.courseDialogSelectedColor = normalizeHexColor(
        this.courseDialogColorBackup || this.courseDialogDefaultColor,
        DEFAULT_COURSE_COLOR
      );
    }
    if (this.refs.courseDialogColorPanel) {
      this.refs.courseDialogColorPanel.classList.toggle("disabled", checked);
      this.refs.courseDialogColorPanel.setAttribute("aria-disabled", checked ? "true" : "false");
    }
    if (this.refs.courseDialogColorPalette) {
      this.refs.courseDialogColorPalette.setAttribute("aria-disabled", checked ? "true" : "false");
    }
    if (this.refs.courseDialogSubjectRow) {
      this.refs.courseDialogSubjectRow.hidden = checked;
    }
    if (this.refs.courseDialogSubject) {
      this.refs.courseDialogSubject.disabled = checked;
      if (checked) {
        this.refs.courseDialogSubject.value = "";
      }
    }
    this._updateCourseDialogColorHighlight();
  }

  buildCourseDialogDraft(course = null) {
    return {
      id: course ? Number(course.id) : 0,
      name: course ? String(course.name || "") : "",
      noLesson: course ? Boolean(course.noLesson) : false,
      noGrades: course ? Boolean(course.noGrades) : false,
      hiddenInSidebar: course ? Boolean(course.hiddenInSidebar) : false,
      color: (course && !course.noLesson)
        ? normalizeCourseColor(course.color, false)
        : this.courseDialogDefaultColor
    };
  }

  async openCourseDialog(courseId = null) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.courseDialog) {
      return;
    }
    const numericId = Number(courseId || 0);
    this.courseDialogBaseRevision = this.workspaceController?.getRevision?.() ?? this.workspaceRevision ?? 0;
    const course = numericId
      ? this.store.listCourses(year.id).find((item) => item.id === numericId)
      : null;
    const existingColors = this._courseDialogExistingColors(course ? course.id : null);
    const defaultColor = suggestColor(existingColors);

    this.refs.courseDialogId.value = course ? String(course.id) : "";
    this.refs.courseDialogTitle.textContent = course ? "Kurs anpassen" : "Kurs anlegen";
    if (this.refs.courseDialogSubject) {
      this.refs.courseDialogSubject.value = course ? String(course.subject || "") : "";
    }
    this.refs.courseDialogName.value = course ? String(course.name || "") : "";
    this.courseDialogDefaultColor = defaultColor;
    this.courseDialogSelectedColor = (course && !course.noLesson)
      ? normalizeCourseColor(course.color, false)
      : defaultColor;
    this.courseDialogColorBackup = this.courseDialogSelectedColor;
    this._renderCourseDialogColorPalette(existingColors);
    this.courseDialogDraft = this.buildCourseDialogDraft(course);
    this.courseDialogDraft.color = this.courseDialogSelectedColor;
    this.refs.courseDialogNoLesson.checked = course ? Boolean(course.noLesson) : false;
    this.syncCourseDialogNoLessonState();
    this.refs.courseDialogDelete.hidden = !course;

    this.openDialog(this.refs.courseDialog);
    this.refs.courseDialogName.focus();
    this.refs.courseDialogName.select();
  }

  async openCourseRenameDialog(courseId) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course) {
      return;
    }
    const nextName = await this.showPromptMessage(
      "",
      String(course.name || ""),
      {
        title: "Kursname bearbeiten",
        okText: "Speichern",
        inputLabel: ""
      }
    );
    if (nextName === null) {
      return;
    }
    const trimmedName = String(nextName || "").trim();
    if (!trimmedName) {
      await this.showInfoMessage("Der Kursname darf nicht leer sein.");
      return;
    }
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const ok = await this.updateCourseFields(id, { name: trimmedName });
    if (!ok) {
      await this.showInfoMessage("Kursname bereits vorhanden.");
      return;
    }
    await this.persistExplicitDatabaseSave("planning-course-name-save");
    this.renderAll();
  }

  async openCourseSubjectDialog(courseId) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course || course.noLesson) {
      return;
    }
    const nextSubject = await this.showPromptMessage(
      "",
      String(course.subject || ""),
      {
        title: "Fach ändern",
        okText: "Speichern",
        inputLabel: "Fach",
        inputListId: "course-dialog-subject-options"
      }
    );
    if (nextSubject === null) {
      return;
    }
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const ok = await this.updateCourseFields(id, { subject: String(nextSubject || "").trim() });
    if (!ok) {
      await this.showInfoMessage("Die Fachzuweisung konnte nicht gespeichert werden.");
      return;
    }
    await this.persistExplicitDatabaseSave("planning-course-subject-save");
    this.renderAll();
  }

  openCourseColorDialog(courseId) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id || !this.refs.courseColorDialog) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course || course.noLesson) {
      return;
    }
    const existingColors = this._courseDialogExistingColors(id);
    const defaultColor = suggestColor(existingColors);
    this.refs.courseColorDialogId.value = String(course.id);
    if (this.refs.courseColorDialogTitle) {
      this.refs.courseColorDialogTitle.textContent = `Farbe bearbeiten · ${course.name}`;
    }
    this.courseColorDialogDefaultColor = defaultColor;
    this.courseColorDialogSelectedColor = normalizeCourseColor(course.color, false);
    this._renderCourseColorDialogPalette(existingColors);
    this.openDialog(this.refs.courseColorDialog);
  }

  closeCourseColorDialog() {
    if (this.refs.courseColorDialogId) {
      this.refs.courseColorDialogId.value = "";
    }
    this.closeDialog(this.refs.courseColorDialog);
  }

  async submitCourseColorDialog() {
    const year = this.activeSchoolYear;
    const id = Number(this.refs.courseColorDialogId?.value || 0);
    if (!year || !id) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course || course.noLesson) {
      this.closeCourseColorDialog();
      return;
    }
    const color = normalizeHexColor(
      this.courseColorDialogSelectedColor,
      suggestColor(this._courseDialogExistingColors(id))
    );
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const ok = await this.updateCourseFields(id, { color, noLesson: false });
    if (!ok) {
      await this.showInfoMessage("Die Farbe konnte nicht gespeichert werden.");
      return;
    }
    await this.persistExplicitDatabaseSave("planning-course-color-save");
    this.closeCourseColorDialog();
    this.renderAll();
  }

  async toggleCourseLessonMode(courseId) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course) {
      return;
    }
    const nextNoLesson = !course.noLesson;
    const confirmed = await this.showConfirmMessage(
      nextNoLesson
        ? "Diesen Kurs als Termin ohne Unterricht markieren? Die Kursfarbe entfällt und der Kurs ist nicht mehr im Notenmodul auswählbar."
        : "Diesen Termin wieder als Kurs mit Unterricht führen? Danach ist er wieder im Notenmodul auswählbar.",
      {
        title: nextNoLesson ? "Als Termin ohne Unterricht" : "Als Termin mit Unterricht",
        okText: "Umwandeln"
      }
    );
    if (!confirmed) {
      return;
    }
    const color = nextNoLesson
      ? null
      : (course.previousColor || null);
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const ok = await this.updateCourseFields(id, { color, noLesson: nextNoLesson });
    if (!ok) {
      await this.showInfoMessage("Die Umwandlung konnte nicht gespeichert werden.");
      return;
    }
    if (nextNoLesson && this.selectedCourseId === id) {
      this.selectedCourseId = null;
    }
    this.renderAll();
  }

  closeCourseDialog() {
    this.courseDialogDraft = null;
    this.closeDialog(this.refs.courseDialog);
  }

  async submitCourseDialog() {
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const id = Number(this.refs.courseDialogId.value || 0);
    const name = String(this.refs.courseDialogName.value || "").trim();
    const noLesson = Boolean(this.refs.courseDialogNoLesson.checked);
    const subject = noLesson ? "" : String(this.refs.courseDialogSubject?.value || "").trim();
    const hiddenInSidebar = Boolean(this.courseDialogDraft && this.courseDialogDraft.hiddenInSidebar);
    const color = noLesson
      ? null
      : normalizeHexColor(this.courseDialogSelectedColor, suggestColor(this._courseDialogExistingColors(id)));
    if (!name) {
      this.refs.courseDialogName.focus();
      return;
    }

    let targetCourseId = id;
    if (id) {
      let ok = false;
      let commandResult = null;
      if (this.workspaceController) {
        commandResult = await this.executeWorkspaceCommand(WORKSPACE_COMMAND_UPDATE_COURSE, {
          schoolYearId: year.id,
          courseId: id,
          name,
          subject,
          color,
          noLesson,
          hiddenInSidebar,
          bulk: true
        }, { baseRevision: this.courseDialogBaseRevision });
        ok = Boolean(commandResult?.ok);
      } else {
        ok = this.store.updateCourse(year.id, id, name, color, noLesson, hiddenInSidebar, subject);
      }
      if (!ok) {
        await this.showInfoMessage(commandResult?.message || "Kursname bereits vorhanden.");
        return;
      }
      if (noLesson && this.selectedCourseId === id) {
        this.selectedCourseId = null;
      }
    } else {
      let created = null;
      let commandResult = null;
      if (this.workspaceController) {
        commandResult = await this.executeWorkspaceCommand(WORKSPACE_COMMAND_CREATE_COURSE, {
          schoolYearId: year.id,
          name,
          subject,
          color,
          noLesson,
          hiddenInSidebar,
          bulk: true
        }, { baseRevision: this.courseDialogBaseRevision });
        created = commandResult?.ok ? Number(commandResult.data?.courseId || 0) : null;
      } else {
        try {
          created = this.store.createCourse(year.id, name, color, noLesson, hiddenInSidebar, subject);
        } catch (_error) {
          created = null;
        }
      }
      if (!created) {
        await this.showInfoMessage(commandResult?.message || "Kursname bereits vorhanden.");
        return;
      }
      targetCourseId = created;
      if (!noLesson && !this.selectedCourseId) {
        this.selectedCourseId = created;
      }
    }

    await this.persistExplicitDatabaseSave("planning-course-save");
    this.closeCourseDialog();
    this.renderAll();
  }

  async deleteCourseById(courseId) {
    const id = Number(courseId || 0);
    if (!id) {
      return false;
    }
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const baseRevision = this.workspaceController?.getRevision?.() ?? this.workspaceRevision ?? 0;
    if (!await this.showConfirmMessage("Soll dieser Kurs wirklich gelöscht werden?", {
      title: "Kurs löschen",
      okText: "Kurs wirklich löschen",
      dangerOk: true
    })) {
      return false;
    }
    if (this.workspaceController) {
      const result = await this.executeWorkspaceCommand(WORKSPACE_COMMAND_DELETE_COURSE, {
        courseId: id,
        destructive: true
      }, { baseRevision });
      if (!result?.ok) {
        await this.showInfoMessage(result?.message || "Kurs konnte nicht gelöscht werden.");
        return false;
      }
    } else {
      this.store.deleteCourse(id);
    }
    if (this.selectedCourseId === id) {
      this.selectedCourseId = null;
    }
    if (Number(this.refs.slotCourse.value) === id) {
      this.resetSlotForm();
    }
    this.selectedLessonId = null;
    this.renderAll();
    return true;
  }

  async deleteCourseFromDialog() {
    const id = Number(this.refs.courseDialogId.value || 0);
    if (!id) {
      return;
    }
    const deleted = await this.deleteCourseById(id);
    if (!deleted) {
      return;
    }
    this.closeCourseDialog();
  }

  openFreeRangeDialog(rangeId = null, presetLabel = "", presetOccurrence = 0) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.freeRangeDialog) {
      return;
    }
    const numericId = Number(rangeId || 0);
    const row = numericId
      ? this.store.listFreeRanges(year.id).find((item) => item.id === numericId)
      : null;

    const preset = String(presetLabel || "").trim();
    this.refs.freeRangeDialogId.value = row ? String(row.id) : "";
    this.refs.freeRangeDialogTitle.textContent = (row || preset) ? "Ferienzeitraum anpassen" : "Ferienzeitraum";
    this.refs.freeRangeDialogLabel.value = row ? String(row.label || "") : preset;
    this.refs.freeRangeDialogLabel.dataset.presetOccurrence = row ? "" : String(Number(presetOccurrence) || 0);
    this.refs.freeRangeDialogStart.value = row ? String(row.startDate || "") : "";
    this.refs.freeRangeDialogEnd.value = row ? String(row.endDate || "") : "";
    if (this.refs.freeRangeDialogDelete) {
      this.refs.freeRangeDialogDelete.hidden = !row;
    }

    if (!row && preset) {
      this.applySuggestedHolidayRangeInDialog();
    }

    this.openDialog(this.refs.freeRangeDialog);
    this.refs.freeRangeDialogLabel.focus();
    this.refs.freeRangeDialogLabel.select();
  }

  closeFreeRangeDialog() {
    this.closeDialog(this.refs.freeRangeDialog);
  }

  applySuggestedHolidayRangeInDialog() {
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    const labelRaw = String(this.refs.freeRangeDialogLabel.value || "").trim();
    if (!labelRaw || this.refs.freeRangeDialogStart.value || this.refs.freeRangeDialogEnd.value) {
      return;
    }
    const startYear = Number(String(year.startDate).slice(0, 4));
    const presetOccurrence = Number(this.refs.freeRangeDialogLabel.dataset.presetOccurrence || 0);
    if (labelRaw.toLowerCase() === "sommerferien") {
      const [start, end] = defaultHolidayRangeForRow(startYear, "Sommerferien", presetOccurrence);
      if (start || end) {
        this.refs.freeRangeDialogLabel.value = "Sommerferien";
        this.refs.freeRangeDialogStart.value = start || "";
        this.refs.freeRangeDialogEnd.value = end || "";
      }
      return;
    }
    const defaults = defaultHolidayRangesForYear(startYear);
    for (const [name, range] of Object.entries(defaults)) {
      if (String(name).toLowerCase() !== labelRaw.toLowerCase()) {
        continue;
      }
      if (Array.isArray(range) && range.length === 2) {
        this.refs.freeRangeDialogLabel.value = name;
        this.refs.freeRangeDialogStart.value = range[0];
        this.refs.freeRangeDialogEnd.value = range[1];
      }
      break;
    }
  }

  async submitFreeRangeDialog() {
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    const id = Number(this.refs.freeRangeDialogId.value || 0);
    let label = String(this.refs.freeRangeDialogLabel.value || "").trim();
    const startDate = this.refs.freeRangeDialogStart.value;
    const endDate = this.refs.freeRangeDialogEnd.value;
    const canonicalRequired = REQUIRED_HOLIDAYS.find(
      (item) => item.toLowerCase() === label.toLowerCase()
    );
    if (canonicalRequired) {
      label = canonicalRequired;
    }
    const isSummerHoliday = String(label || "").trim().toLowerCase() === "sommerferien";
    if (!label) {
      return;
    }
    if (isSummerHoliday) {
      if (!startDate && !endDate) {
        return;
      }
    } else if (!startDate || !endDate) {
      return;
    }
    if (!isSummerHoliday && endDate < startDate) {
      await this.showInfoMessage("Das Enddatum muss nach dem Startdatum liegen.");
      return;
    }
    this.store.upsertFreeRange(id || null, year.id, label, startDate, endDate);
    await this.persistExplicitDatabaseSave("planning-free-range-save");
    this.closeFreeRangeDialog();
    this.renderAll();
  }

  async deleteFreeRangeFromDialog() {
    const id = Number(this.refs.freeRangeDialogId.value || 0);
    if (!id) {
      return;
    }
    if (!await this.showConfirmMessage("Ferienzeitraum löschen?", {
      dangerOk: true
    })) {
      return;
    }
    this.store.deleteFreeRange(id);
    this.closeFreeRangeDialog();
    this.renderAll();
  }

  openSpecialDayDialog(specialDayId = null) {
    if (!this.refs.specialDayDialog) {
      return;
    }
    const numericId = Number(specialDayId || 0);
    const row = numericId
      ? this.store.listSpecialDays().find((item) => item.id === numericId)
      : null;

    this.refs.specialDayDialogId.value = row ? String(row.id) : "";
    this.refs.specialDayDialogTitle.textContent = row ? "Unterrichtsfreien Tag anpassen" : "Unterrichtsfreien Tag hinzufügen";
    this.refs.specialDayDialogName.value = row ? String(row.name || "") : "";
    this.refs.specialDayDialogDate.value = row ? String(row.dayDate || "") : "";
    this.refs.specialDayDialogDelete.hidden = !row;
    this.openDialog(this.refs.specialDayDialog);
    this.refs.specialDayDialogName.focus();
    this.refs.specialDayDialogName.select();
  }

  closeSpecialDayDialog() {
    this.closeDialog(this.refs.specialDayDialog);
  }

  applySuggestedSpecialDayDateInDialog() {
    if (this.refs.specialDayDialogDate.value) {
      return;
    }
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    const startYear = Number(String(year.startDate).slice(0, 4));
    const suggested = defaultSpecialDayDateForName(this.refs.specialDayDialogName.value, startYear);
    if (suggested) {
      this.refs.specialDayDialogDate.value = suggested;
    }
  }

  async submitSpecialDayDialog() {
    const id = Number(this.refs.specialDayDialogId.value || 0);
    const name = String(this.refs.specialDayDialogName.value || "").trim();
    const dayDate = this.refs.specialDayDialogDate.value;
    const existing = id
      ? this.store.listSpecialDays().find((item) => item.id === id)
      : null;
    if (existing && this.isDefaultSpecialDayName(existing.name)) {
      const previousName = String(existing.name || "").trim();
      const previousDate = String(existing.dayDate || "");
      if ((previousName !== name || previousDate !== dayDate)
        && !await this.showConfirmMessage("Soll dieser besondere Tag wirklich geändert werden?")) {
        return;
      }
    }
    const ok = this.store.upsertSpecialDay(id || null, name, dayDate);
    if (!ok) {
      await this.showInfoMessage("Name bereits vorhanden oder Eingabe ungültig.");
      return;
    }
    await this.persistExplicitDatabaseSave("planning-special-day-save");
    this.closeSpecialDayDialog();
    this.renderAll();
  }

  async deleteSpecialDayFromDialog() {
    const id = Number(this.refs.specialDayDialogId.value || 0);
    if (!id) {
      return;
    }
    if (!await this.showConfirmMessage("Unterrichtsfreien Tag löschen?", {
      dangerOk: true
    })) {
      return;
    }
    this.store.deleteSpecialDay(id);
    this.closeSpecialDayDialog();
    this.renderAll();
  }

  isDefaultSpecialDayName(name) {
    const year = this.activeSchoolYear;
    if (!year) {
      return false;
    }
    const startYear = Number(String(year.startDate).slice(0, 4));
    const defaults = new Set(
      defaultSpecialDays(startYear).map((item) => String(item.name || "").trim().toLowerCase())
    );
    return defaults.has(String(name || "").trim().toLowerCase());
  }

  openEntfallDialog(lessonId) {
    const lesson = this.store.getLessonById(lessonId);
    if (!lesson || !this.refs.entfallDialog) {
      return;
    }
    const block = this.store.getLessonBlock(lesson.id);
    if (block.length === 0 || block.every((entry) => entry.canceled)) {
      return;
    }
    this.pendingEntfallLessonId = lesson.id;
    this.refs.entfallDialogReason.value = "";
    this.openDialog(this.refs.entfallDialog);
    this.refs.entfallDialogReason.focus();
  }

  closeEntfallDialog() {
    this.pendingEntfallLessonId = null;
    if (this.refs.entfallDialogReason) {
      this.refs.entfallDialogReason.value = "";
    }
    this.closeDialog(this.refs.entfallDialog);
  }

  async submitEntfallDialog() {
    const lessonId = Number(this.pendingEntfallLessonId || 0);
    if (!lessonId) {
      this.closeEntfallDialog();
      return;
    }
    const reason = String(this.refs.entfallDialogReason.value || "").trim();
    const topic = reason ? `${ENTFALL_TOPIC_DEFAULT} (${reason})` : ENTFALL_TOPIC_DEFAULT;
    this.store.updateLessonBlock(lessonId, {
      topic,
      isEntfall: true,
      isWrittenExam: false
    });
    await this.persistExplicitDatabaseSave("planning-cancellation-save");
    this.closeEntfallDialog();
    this.renderWeekSection();
    this.renderLessonSection();
    this.renderCourseTimeline();
  }

  openTopicDialog(lessonId) {
    const lesson = this.store.getLessonById(lessonId);
    if (!lesson || !this.refs.topicDialog) {
      return false;
    }
    const block = this.store.getLessonBlock(lesson.id);
    if (block.length === 0) {
      return false;
    }
    const allCanceled = block.every((entry) => entry.canceled);
    if (allCanceled) {
      return false;
    }
    const isEntfall = block.some((entry) => entry.isEntfall);
    const isWritten = block.some((entry) => entry.isWrittenExam);
    const firstTopic = block
      .map((entry) => String(entry.topic || "").trim())
      .find(Boolean) || "";
    const firstNotesLesson = block.find((entry) => String(entry.notes || "").trim());
    const firstNotes = String(firstNotesLesson?.notes || "");
    const firstNotesRichText = firstNotesLesson?.notesRichText || null;
    const firstHour = Number(block[0]?.hour || lesson.hour || 0);
    const lastHour = Number(block[block.length - 1]?.hour || lesson.hour || 0);
    const hourLabel = firstHour && lastHour
      ? (firstHour === lastHour ? `${firstHour}. Stunde` : `${firstHour}.-${lastHour}. Stunde`)
      : "Unterrichtsstunde";
    const dayLabel = DAYS_SHORT[Number(lesson.dayOfWeek) - 1] || "";
    const courseName = String(lesson.courseName || "").trim();
    const courseColor = normalizeCourseColor(lesson.color, Boolean(lesson.noLesson));
    const contextParts = [
      [dayLabel, formatDate(lesson.lessonDate)].filter(Boolean).join(", "),
      hourLabel
    ].filter(Boolean);
    this.pendingTopicLessonId = lesson.id;
    if (this.refs.topicDialogLesson) {
      this.refs.topicDialogLesson.value = String(lesson.id);
    }
    if (this.refs.topicDialogCoursePill) {
      this.refs.topicDialogCoursePill.textContent = courseName || "Kurs";
      this.refs.topicDialogCoursePill.style.backgroundColor = courseColor;
      this.refs.topicDialogCoursePill.style.color = readableTextColor(courseColor);
    }
    if (this.refs.topicDialogContext) {
      this.refs.topicDialogContext.textContent = contextParts.join(" · ");
    }
    this.refs.topicDialogInput.value = firstTopic;
    this.refs.topicDialogInput.disabled = Boolean(isEntfall || isWritten);
    this.renderTopicDialogNotesEditor(firstNotesRichText, { fallbackText: firstNotes });
    this.openDialog(this.refs.topicDialog);
    const focusTarget = this.refs.topicDialogInput.disabled ? this.refs.topicDialogNotes : this.refs.topicDialogInput;
    focusTarget.focus();
    if (focusTarget === this.refs.topicDialogInput) {
      this.refs.topicDialogInput.select();
    }
    return true;
  }

  closeTopicDialog() {
    this.pendingTopicLessonId = null;
    if (this.refs.topicDialogLesson) {
      this.refs.topicDialogLesson.value = "";
    }
    if (this.refs.topicDialogCoursePill) {
      this.refs.topicDialogCoursePill.textContent = "";
      this.refs.topicDialogCoursePill.style.backgroundColor = "";
      this.refs.topicDialogCoursePill.style.color = "";
    }
    if (this.refs.topicDialogContext) {
      this.refs.topicDialogContext.textContent = "";
    }
    if (this.refs.topicDialogInput) {
      this.refs.topicDialogInput.value = "";
      this.refs.topicDialogInput.disabled = false;
    }
    this.setTopicDialogColorPaletteOpen(false);
    this.renderTopicDialogNotesEditor(createPlanningRichTextFromPlainText(""));
    this.closeDialog(this.refs.topicDialog);
  }

  async showSelectMessage(message, defaultValue = "", options = {}) {
    return this.showMessageDialog({
      mode: "select",
      title: options.title || "Bitte auswählen",
      message,
      okText: options.okText || "Übernehmen",
      cancelText: options.cancelText || "Abbrechen",
      defaultValue,
      inputLabel: options.inputLabel ?? "Auswahl",
      selectOptions: options.selectOptions || [],
    });
  }

  async showChoiceMessage(message, options = {}) {
    return this.showMessageDialog({
      mode: "choice",
      title: options.title || "Bitte auswählen",
      message,
      okText: options.okText || "Ja",
      cancelText: options.cancelText || "Abbrechen",
      alternateText: options.alternateText || "",
      dangerAlternate: Boolean(options.dangerAlternate),
      warning: Boolean(options.warning)
    });
  }

  getTopicDialogNotesText() {
    return planningRichTextToPlainText(this.getTopicDialogNotesRichText());
  }

  getTopicDialogNotesRichText() {
    const editor = this.refs.topicDialogNotes;
    return planningRichTextFromElement(editor, editor?.innerText ?? "");
  }

  renderTopicDialogNotesEditor(notes = null, { restoreSelection = false, fallbackText = "" } = {}) {
    const editor = this.refs.topicDialogNotes;
    if (!editor) return;
    const selectionOffsets = restoreSelection
      ? (this.topicDialogRichTextSelectionLocked
        ? this.topicDialogRichTextSelectionOffsets
        : (this.getTopicDialogNotesSelectionOffsets() || this.topicDialogRichTextSelectionOffsets))
      : null;
    const documentValue = notes && typeof notes === "object"
      ? notes
      : createPlanningRichTextFromPlainText(notes ?? fallbackText);
    renderPlanningRichText(editor, linkifyPlanningRichText(documentValue, fallbackText), fallbackText);
    if (selectionOffsets !== null) {
      this.restoreTopicDialogNotesSelection(selectionOffsets.start, selectionOffsets.end);
    }
    this.updateTopicDialogRichTextToolbar();
  }

  getTopicDialogNotesSelectionOffsets() {
    const editor = this.refs.topicDialogNotes;
    const selection = window.getSelection?.();
    if (!editor || !selection?.rangeCount) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return null;
    }
    const offsetFor = (container, offset) => {
      const prefix = document.createRange();
      prefix.selectNodeContents(editor);
      prefix.setEnd(container, offset);
      return prefix.toString().length;
    };
    return {
      start: offsetFor(range.startContainer, range.startOffset),
      end: offsetFor(range.endContainer, range.endOffset)
    };
  }

  rememberTopicDialogNotesSelection() {
    const editor = this.refs.topicDialogNotes;
    const selection = window.getSelection?.();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      if (this.topicDialogRichTextSelectionLocked && range.collapsed) {
        return;
      }
      if (!range.collapsed || document.activeElement === editor || !this.topicDialogRichTextSelectionRange) {
        this.topicDialogRichTextSelectionRange = range.cloneRange();
        this.topicDialogRichTextSelectionOffsets = this.getTopicDialogNotesSelectionOffsets();
      }
    }
  }

  restoreTopicDialogNotesSelectionRange() {
    const editor = this.refs.topicDialogNotes;
    const selection = window.getSelection?.();
    const range = this.topicDialogRichTextSelectionRange;
    const offsets = this.topicDialogRichTextSelectionOffsets;
    if (!editor || !selection) return false;
    if (offsets && Number.isFinite(offsets.start) && Number.isFinite(offsets.end)) {
      return this.restoreTopicDialogNotesSelection(offsets.start, offsets.end);
    }
    if (!range || !editor.contains(range.commonAncestorContainer)) return false;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  restoreTopicDialogNotesSelection(startOffset = 0, endOffset = startOffset) {
    const editor = this.refs.topicDialogNotes;
    const selection = window.getSelection?.();
    if (!editor || !selection) {
      return;
    }
    const findPoint = (offset) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let remaining = Math.max(0, Number(offset) || 0);
      let node = walker.nextNode();
      while (node) {
        const nodeLength = node.textContent.length;
        if (remaining <= nodeLength) {
          const link = node.parentElement?.closest("a[contenteditable='false']");
          return link && remaining === nodeLength
            ? { container: link.parentNode, offset: [...link.parentNode.childNodes].indexOf(link) + 1 }
            : { container: node, offset: remaining };
        }
        remaining -= nodeLength;
        node = walker.nextNode();
      }
      return null;
    };
    const start = findPoint(startOffset);
    const end = findPoint(endOffset);
    if (!start || !end) {
      if (Number(startOffset) === 0 && Number(endOffset) === 0) {
        const emptyBlock = editor.querySelector("p") || editor;
        const emptyRange = document.createRange();
        emptyRange.setStart(emptyBlock, 0);
        emptyRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(emptyRange);
        editor.focus();
        return true;
      }
      editor.focus();
      return false;
    }
    const range = document.createRange();
    range.setStart(start.container, start.offset);
    range.setEnd(end.container, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  normalizeTopicDialogNotesEditor({ restoreSelection = false } = {}) {
    this.renderTopicDialogNotesEditor(this.getTopicDialogNotesRichText(), { restoreSelection });
  }

  shouldNormalizeTopicDialogNotesAfterInput(event) {
    const inputType = String(event?.inputType || "");
    if (["insertFromPaste", "insertLineBreak", "insertParagraph"].includes(inputType)) {
      return true;
    }
    return /\s/u.test(String(event?.data || ""));
  }

  insertTopicDialogNotesRichText(html, text) {
    const editor = this.refs.topicDialogNotes;
    const selection = window.getSelection?.();
    if (!editor || !selection) {
      return;
    }
    let range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const temporary = document.createElement("div");
    renderPlanningRichText(temporary, linkifyPlanningRichText(planningRichTextFromClipboard(html, text), text), text);
    const fragment = document.createDocumentFragment();
    const lastNode = temporary.lastChild;
    while (temporary.firstChild) fragment.append(temporary.firstChild);
    if (!lastNode) return;
    range.insertNode(fragment);
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  openTopicDialogNoteLink(event) {
    const target = event.target instanceof Element ? event.target.closest("a.planning-note-link") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.open(target.href, "_blank", "noopener,noreferrer");
  }

  applyTopicDialogTextSize(value) {
    const editor = this.refs.topicDialogNotes;
    const size = [12, 14, 16, 18, 22].includes(Number(value)) ? Number(value) : 16;
    if (!editor || !this.restoreTopicDialogNotesSelectionRange()) return false;
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;

    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent && range.intersectsNode(node)) textNodes.push(node);
      node = walker.nextNode();
    }
    [...textNodes].reverse().forEach((textNode) => {
      const start = textNode === range.startContainer ? range.startOffset : 0;
      const end = textNode === range.endContainer ? range.endOffset : textNode.textContent.length;
      if (start >= end) return;
      const textRange = document.createRange();
      textRange.setStart(textNode, start);
      textRange.setEnd(textNode, end);
      const wrapper = document.createElement("span");
      wrapper.className = `planning-rich-size-${size}`;
      wrapper.append(textRange.extractContents());
      textRange.insertNode(wrapper);
    });
    this.rememberTopicDialogNotesSelection();
    return textNodes.length > 0;
  }

  ensureTopicDialogNotesSelection() {
    const editor = this.refs.topicDialogNotes;
    if (!editor) return false;
    if (this.restoreTopicDialogNotesSelectionRange()) return true;
    const paragraph = editor.querySelector("p") || document.createElement("p");
    if (!paragraph.parentElement) {
      paragraph.append(document.createElement("br"));
      editor.append(paragraph);
    }
    const initialRange = document.createRange();
    initialRange.selectNodeContents(paragraph);
    initialRange.collapse(true);
    const initialSelection = window.getSelection?.();
    initialSelection?.removeAllRanges();
    initialSelection?.addRange(initialRange);
    editor.focus();
    this.rememberTopicDialogNotesSelection();
    return true;
  }

  toggleTopicDialogList(ordered) {
    const editor = this.refs.topicDialogNotes;
    if (!editor || !this.ensureTopicDialogNotesSelection()) return false;
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) return false;
    const paragraphs = [...editor.querySelectorAll("p")].filter((paragraph) => (
      range.collapsed
        ? paragraph.contains(range.startContainer)
        : range.intersectsNode(paragraph)
    ));
    if (!paragraphs.length) return false;

    const selectedItems = [...new Set(paragraphs.map((paragraph) => paragraph.closest("li")).filter(Boolean))];
    const selectedList = selectedItems.length === paragraphs.length
      ? selectedItems[0]?.parentElement
      : null;
    const requestedTag = ordered ? "ol" : "ul";
    if (selectedList && ["ul", "ol"].includes(selectedList.tagName.toLowerCase())
      && selectedItems.every((item) => item.parentElement === selectedList)) {
      if (selectedList.tagName.toLowerCase() !== requestedTag) {
        const replacement = document.createElement(requestedTag);
        while (selectedList.firstChild) replacement.append(selectedList.firstChild);
        selectedList.replaceWith(replacement);
      } else {
        selectedItems.forEach((item) => {
          const paragraph = item.querySelector(":scope > p") || document.createElement("p");
          if (!paragraph.parentElement) while (item.firstChild) paragraph.append(item.firstChild);
          item.before(paragraph);
          item.remove();
        });
        if (!selectedList.querySelector(":scope > li")) selectedList.remove();
      }
    } else {
      const groups = [];
      paragraphs.forEach((paragraph) => {
        const group = groups.at(-1);
        if (group && group.parent === paragraph.parentElement && group.last.nextElementSibling === paragraph) {
          group.paragraphs.push(paragraph); group.last = paragraph;
        } else groups.push({ parent: paragraph.parentElement, paragraphs: [paragraph], last: paragraph });
      });
      groups.forEach((group) => {
        const list = document.createElement(requestedTag);
        group.paragraphs[0].before(list);
        group.paragraphs.forEach((paragraph) => {
          const item = document.createElement("li");
          item.append(paragraph);
          list.append(item);
        });
      });
    }
    this.rememberTopicDialogNotesSelection();
    return true;
  }

  executeTopicDialogRichTextCommand(command, value = "") {
    const editor = this.refs.topicDialogNotes;
    if (!editor) return;
    let changed = false;
    if (command === "fontSize") {
      this.ensureTopicDialogNotesSelection();
      const selection = window.getSelection?.();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range?.collapsed && editor.contains(range.commonAncestorContainer)) {
        const sizeMap = { 12: "2", 14: "3", 16: "4", 18: "5", 22: "6" };
        editor.focus();
        document.execCommand("styleWithCSS", false, false);
        document.execCommand("fontSize", false, sizeMap[Number(value)] || "3");
        this.rememberTopicDialogNotesSelection();
      } else changed = this.applyTopicDialogTextSize(value);
    } else if (["insertUnorderedList", "insertOrderedList"].includes(command)) {
      changed = this.toggleTopicDialogList(command === "insertOrderedList");
    } else if (command === "insertTable") {
      this.restoreTopicDialogNotesSelectionRange();
      editor.focus();
      const [rows, columns] = String(value || "2x2").split("x").map((part) => Math.max(1, Math.min(8, Number(part) || 2)));
      const cells = Array.from({ length: rows }, () => `<tr>${"<td><br></td>".repeat(columns)}</tr>`).join("");
      document.execCommand("insertHTML", false, `<table><tbody>${cells}</tbody></table><p><br></p>`);
      changed = true;
    } else {
      this.ensureTopicDialogNotesSelection();
      editor.focus();
      const selection = window.getSelection?.();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      document.execCommand(command, false, value || null);
      changed = !range?.collapsed;
      this.rememberTopicDialogNotesSelection();
    }
    if (changed) this.normalizeTopicDialogNotesEditor({ restoreSelection: true });
    this.topicDialogRichTextSelectionLocked = false;
    this.updateTopicDialogRichTextToolbar();
  }

  getTopicDialogSelectedTableCell() {
    const selection = window.getSelection?.();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest("#topic-dialog-notes td") || null;
  }

  setTopicDialogColorPaletteOpen(open) {
    const toolbar = this.refs.topicDialogRichTextToolbar;
    const trigger = toolbar?.querySelector(".rich-text-color-trigger");
    const palette = toolbar?.querySelector(".rich-text-color-palette");
    if (!trigger || !palette) return;
    const nextOpen = Boolean(open);
    palette.hidden = !nextOpen;
    trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }

  applyTopicDialogTextColor(color = "") {
    const editor = this.refs.topicDialogNotes;
    const nextColor = Object.hasOwn(PLANNING_RICH_TEXT_COLORS, String(color)) ? String(color) : "";
    if (!editor) return;
    this.restoreTopicDialogNotesSelectionRange();
    editor.focus();
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
    const fragment = range.extractContents();
    fragment.querySelectorAll("[class*='planning-rich-color-']").forEach((node) => {
      [...node.classList].filter((className) => className.startsWith("planning-rich-color-")).forEach((className) => node.classList.remove(className));
      if (!node.classList.length) node.removeAttribute("class");
    });
    const wrapper = document.createElement("span");
    wrapper.className = `planning-rich-color-${nextColor || "default"}`;
    wrapper.append(fragment);
    range.insertNode(wrapper);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    this.rememberTopicDialogNotesSelection();
    this.normalizeTopicDialogNotesEditor({ restoreSelection: true });
    this.topicDialogRichTextSelectionLocked = false;
    this.setTopicDialogColorPaletteOpen(false);
  }

  changeTopicDialogTable(action) {
    const cell = this.getTopicDialogSelectedTableCell();
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const row = cell.parentElement;
    const columnIndex = [...row.children].indexOf(cell);
    const rows = [...table.querySelectorAll(":scope > tbody > tr, :scope > tr")];
    if (action === "addRow") {
      const nextRow = table.ownerDocument.createElement("tr");
      [...row.children].forEach(() => { const nextCell = table.ownerDocument.createElement("td"); nextCell.append(table.ownerDocument.createElement("br")); nextRow.append(nextCell); });
      row.after(nextRow);
    } else if (action === "deleteRow") {
      row.remove();
    } else {
      rows.forEach((currentRow) => {
        if (action === "addColumn") { const nextCell = table.ownerDocument.createElement("td"); nextCell.append(table.ownerDocument.createElement("br")); currentRow.children[columnIndex]?.after(nextCell); }
        if (action === "deleteColumn") currentRow.children[columnIndex]?.remove();
      });
    }
    if (!table.querySelector("tr") || !table.querySelector("td, th")) table.remove();
    this.normalizeTopicDialogNotesEditor({ restoreSelection: true });
    this.topicDialogRichTextSelectionLocked = false;
  }

  updateTopicDialogRichTextToolbar() {
    const toolbar = this.refs.topicDialogRichTextToolbar;
    if (!toolbar) return;
    const hasActiveTable = Boolean(this.getTopicDialogSelectedTableCell());
    toolbar.classList.toggle("has-active-table", hasActiveTable);
    const colorTrigger = toolbar.querySelector(".rich-text-color-trigger");
    if (colorTrigger) {
      const selection = window.getSelection?.();
      const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
      const colorClass = [...(anchor?.closest("[class*='planning-rich-color-']")?.classList || [])]
        .find((className) => Object.hasOwn(PLANNING_RICH_TEXT_COLORS, className.replace("planning-rich-color-", "")));
      [...colorTrigger.classList].filter((className) => className.startsWith("is-color-")).forEach((className) => colorTrigger.classList.remove(className));
      colorTrigger.classList.toggle("is-color-default", !colorClass);
      if (colorClass) colorTrigger.classList.add(`is-color-${colorClass.replace("planning-rich-color-", "")}`);
    }
    toolbar.querySelectorAll("[data-rich-text-command]").forEach((button) => {
      const command = button.dataset.richTextCommand;
      if (["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"].includes(command)) {
        button.setAttribute("aria-pressed", document.queryCommandState?.(command) ? "true" : "false");
      }
      if (["addRow", "deleteRow", "addColumn", "deleteColumn"].includes(command)) button.disabled = !hasActiveTable;
    });
  }

  async submitTopicDialog() {
    const lessonId = Number(this.pendingTopicLessonId || this.refs.topicDialogLesson.value || 0);
    if (!lessonId) {
      this.closeTopicDialog();
      return;
    }
    const block = this.store.getLessonBlock(lessonId);
    if (block.length === 0) {
      this.closeTopicDialog();
      return;
    }
    const isEntfall = block.some((entry) => entry.isEntfall);
    const isWritten = block.some((entry) => entry.isWrittenExam);
    const patch = {
      notes: this.getTopicDialogNotesText(),
      notesRichText: this.getTopicDialogNotesRichText()
    };
    if (!(isEntfall || isWritten)) {
      patch.topic = String(this.refs.topicDialogInput.value || "").trim();
    }
    this.store.updateLessonBlock(lessonId, patch);
    await this.persistExplicitDatabaseSave("planning-topic-save");
    this.selectedLessonId = lessonId;
    this.closeTopicDialog();
    this.renderWeekSection();
    this.renderLessonSection();
    this.renderCourseTimeline();
  }

  formatSlotConflictMessage(conflicts, year, placement = "lesson") {
    const parityLabel = (slot) => {
      const parity = Number(slot.weekParity || 0);
      if (parity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
        return "einmalig";
      }
      if (parity === 1) {
        return "ungerade Wochen";
      }
      if (parity === 2) {
        return "gerade Wochen";
      }
      return "jede Woche";
    };
    const rangeLabel = (slot) => {
      const start = slot.startDate || year.startDate;
      const end = slot.endDate || year.endDate;
      if (!start || !end) {
        return "";
      }
      if (start === year.startDate && end === year.endDate) {
        return "gesamtes Schuljahr";
      }
      if (start === end) {
        return formatDate(start);
      }
      return `${formatDate(start)}-${formatDate(end)}`;
    };
    const lines = conflicts.slice(0, 3).map((item) => {
      const begin = Number(item.startHour);
      const end = begin + Math.max(1, Number(item.duration || 1)) - 1;
      const hourLabel = placement === "break"
        ? `Pause nach der ${begin}. Std.`
        : begin === end ? `Std. ${begin}` : `Std. ${begin}-${end}`;
      const dayLabel = DAYS_SHORT[Number(item.dayOfWeek) - 1] || `Tag ${item.dayOfWeek}`;
      const details = [dayLabel, hourLabel, rangeLabel(item), parityLabel(item)]
        .filter(Boolean)
        .join(", ");
      return `${item.courseName} (${details})`;
    });
    if (conflicts.length > 3) {
      lines.push(`... und ${conflicts.length - 3} weitere.`);
    }
    const label = placement === "break" ? "parallele Aufsichten" : "parallele Unterrichtsstunden";
    return `Die Änderung erzeugt ${label}:\n${lines.join("\n")}\n\nMöchtest du die Änderung trotzdem speichern?`;
  }

  async persistSlotChange({
    slotId = null,
    courseId,
    dayOfWeek,
    startHour,
    duration,
    startDate = null,
    endDateInput = null,
    recurrenceValue = 0,
    editScope = "all",
    editFromDate = null,
    placement = "lesson",
    label = ""
  }) {
    const year = this.activeSchoolYear;
    if (!year) {
      return false;
    }
    const normalizedSlotId = Number(slotId || 0);
    const normalizedCourseId = Number(courseId || 0);
    const normalizedPlacement = placement === "break" ? "break" : "lesson";
    let normalizedDay = Number(dayOfWeek || 0);
    const normalizedStartHour = clamp(
      Number(startHour),
      1,
      normalizedPlacement === "break" ? Math.max(1, this.store.getHoursPerDay() - 1) : this.store.getHoursPerDay()
    );
    const normalizedDuration = normalizedPlacement === "break" ? 1 : Math.max(1, Number(duration));
    const normalizedStartDate = startDate || null;
    let endDate = endDateInput || null;
    const normalizedRecurrence = Number(recurrenceValue || 0);
    let weekParity = normalizedRecurrence;

    const normalizedLabel = normalizedPlacement === "break" ? String(label || "").trim() : "";
    if (normalizedPlacement === "break") {
      if (!normalizedLabel) {
        await this.showInfoMessage("Bitte eine Bezeichnung für die Aufsicht angeben.");
        return false;
      }
      if (!BREAK_SUPERVISION_AFTER_HOURS.includes(normalizedStartHour)) {
        await this.showInfoMessage("Aufsichten sind nur nach der 2., 4. oder 6. Stunde möglich.");
        return false;
      }
    }

    if (normalizedRecurrence === -1) {
      if (!normalizedStartDate) {
        await this.showInfoMessage("Für 'Keine' muss ein Startdatum gesetzt sein.");
        return false;
      }
      const singleDay = dayOfWeekIso(normalizedStartDate);
      if (singleDay < 1 || singleDay > 5) {
        await this.showInfoMessage("Der Termin muss auf einen Schultag (Montag bis Freitag) fallen.");
        return false;
      }
      normalizedDay = singleDay;
      endDate = normalizedStartDate;
      weekParity = 0;
    }

    if (normalizedStartDate && endDate && endDate < normalizedStartDate) {
      await this.showInfoMessage("Das Enddatum muss nach dem Startdatum liegen.");
      return false;
    }

    const conflicts = this.store.findSlotConflicts(
      year.id,
      normalizedCourseId,
      normalizedDay,
      normalizedStartHour,
      normalizedDuration,
      normalizedStartDate,
      endDate,
      weekParity,
      normalizedSlotId || null,
      normalizedPlacement
    );
    if (conflicts.length > 0) {
      const allowed = await this.showConfirmMessage(this.formatSlotConflictMessage(conflicts, year, normalizedPlacement), {
        title: normalizedPlacement === "break" ? "Parallele Aufsichten" : "Parallele Unterrichtsstunden",
        okText: "Trotzdem speichern",
        cancelText: "Abbrechen",
        warning: true,
        warnOk: true
      });
      if (!allowed) {
        return false;
      }
    }

    if (normalizedSlotId) {
      if (!this.store.getSlot(normalizedSlotId)) {
        await this.showInfoMessage("Der Slot wurde nicht gefunden.");
        return false;
      }

      if (editScope === "from") {
        if (!editFromDate) {
          await this.showInfoMessage("Bitte ein Startdatum für die Teiländerung angeben.");
          return false;
        }
        const result = this.store.splitSlotFromDate(
          year.id,
          normalizedSlotId,
          editFromDate,
          normalizedCourseId,
          normalizedDay,
          normalizedStartHour,
          normalizedDuration,
          endDate,
          weekParity,
          normalizedPlacement,
          normalizedLabel
        );
        if (!result || !result.ok) {
          await this.showInfoMessage((result && result.message) || "Teiländerung konnte nicht gespeichert werden.");
          return false;
        }
      } else {
        this.store.updateSlot(
          normalizedSlotId,
          normalizedCourseId,
          normalizedDay,
          normalizedStartHour,
          normalizedDuration,
          normalizedStartDate,
          endDate,
          weekParity,
          normalizedPlacement,
          year.id,
          normalizedLabel
        );
      }
    } else {
      this.store.createSlot(
        normalizedCourseId,
        normalizedDay,
        normalizedStartHour,
        normalizedDuration,
        normalizedStartDate,
        endDate,
        weekParity,
        normalizedPlacement,
        year.id,
        normalizedLabel
      );
    }

    this.selectedLessonId = null;
    return true;
  }

  async deleteSlotWithScope(slotId, editScope = "all", editFromDate = null) {
    const year = this.activeSchoolYear;
    if (!year) {
      return false;
    }
    const normalizedSlotId = Number(slotId || 0);
    if (!normalizedSlotId) {
      return false;
    }
    const slot = this.store.getSlot(normalizedSlotId);
    if (!slot) {
      await this.showInfoMessage("Der Slot wurde nicht gefunden.");
      return false;
    }
    if (!await this.showConfirmMessage("Unterrichtsstunde löschen?", {
      dangerOk: true
    })) {
      return false;
    }

    const oldStart = slot.startDate || year.startDate;
    if (editScope === "from" && editFromDate) {
      if (editFromDate <= oldStart) {
        this.store.deleteSlot(normalizedSlotId);
      } else {
        const result = this.store.splitSlotFromDate(
          year.id,
          normalizedSlotId,
          editFromDate,
          slot.courseId,
          slot.dayOfWeek,
          slot.startHour,
          slot.duration,
          slot.endDate || null,
          slot.weekParity || 0,
          slot.placement === "break" ? "break" : "lesson",
          slot.label || ""
        );
        if (!result || !result.ok) {
          await this.showInfoMessage((result && result.message) || "Teillöschung konnte nicht durchgeführt werden.");
          return false;
        }
        if (result.newSlotId) {
          this.store.deleteSlot(result.newSlotId);
        }
      }
    } else {
      this.store.deleteSlot(normalizedSlotId);
    }
    this.selectedLessonId = null;
    return true;
  }

  populateSlotDialogCourseSelect(selectedCourseId = null, onlyNoLesson = false) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.slotDialogCourse) {
      return false;
    }
    const courses = this.store.listCourses(year.id).filter((course) => !onlyNoLesson || course.noLesson);
    this.refs.slotDialogCourse.innerHTML = "";
    for (const course of courses) {
      const option = document.createElement("option");
      option.value = String(course.id);
      option.textContent = course.name;
      const courseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
      option.style.color = courseColor;
      option.style.backgroundColor = "var(--dropdown-bg)";
      option.dataset.courseColor = courseColor;
      this.refs.slotDialogCourse.append(option);
    }
    if (courses.length === 0) {
      return false;
    }
    const selected = Number(selectedCourseId || 0);
    const fallback = courses[0].id;
    this.refs.slotDialogCourse.value = String(
      courses.some((course) => course.id === selected) ? selected : fallback
    );
    this.syncSlotDialogCourseColor();
    return true;
  }

  setSlotDialogMode(mode = "lesson", breakAfterHour = null) {
    this.slotDialogMode = mode === "break" ? "break" : "lesson";
    const isBreak = this.slotDialogMode === "break";
    if (this.refs.slotDialogCourseRow) this.refs.slotDialogCourseRow.hidden = isBreak;
    if (this.refs.slotDialogBreakNameRow) this.refs.slotDialogBreakNameRow.hidden = !isBreak;
    if (this.refs.slotDialogCourse) this.refs.slotDialogCourse.disabled = isBreak;
    if (this.refs.slotDialogBreakName) this.refs.slotDialogBreakName.required = isBreak;
    if (this.refs.slotDialogHourRow) this.refs.slotDialogHourRow.hidden = isBreak;
    if (this.refs.slotDialogEndHourRow) this.refs.slotDialogEndHourRow.hidden = isBreak;
    if (this.refs.slotDialogBreakRow) this.refs.slotDialogBreakRow.hidden = !isBreak;
    if (this.refs.slotDialogBreakAfter) {
      this.refs.slotDialogBreakAfter.disabled = !isBreak;
      this.refs.slotDialogBreakAfter.required = isBreak;
    }
    if (isBreak && this.refs.slotDialogBreakAfter) {
      const availableBreakHours = BREAK_SUPERVISION_AFTER_HOURS
        .filter((hour) => hour < this.store.getHoursPerDay());
      const requestedHour = Number(breakAfterHour ?? this.refs.slotDialogBreakAfter.value ?? this.refs.slotDialogHour.value);
      const hour = availableBreakHours.includes(requestedHour)
        ? requestedHour
        : availableBreakHours[0];
      this.refs.slotDialogBreakAfter.replaceChildren(...availableBreakHours.map((breakHour) => {
        const option = document.createElement("option");
        option.value = String(breakHour);
        option.textContent = `der ${breakHour}. Stunde`;
        return option;
      }));
      if (hour) {
        this.refs.slotDialogBreakAfter.value = String(hour);
        this.refs.slotDialogHour.value = String(hour);
        this.refs.slotDialogEndHour.value = String(hour);
      }
    }
  }

  syncSlotDialogCourseColor() {
    if (!this.refs.slotDialogCourse) {
      return;
    }
    const selectedOption = this.refs.slotDialogCourse.selectedOptions
      ? this.refs.slotDialogCourse.selectedOptions[0]
      : null;
    const selectedColor = selectedOption
      ? String(selectedOption.dataset.courseColor || selectedOption.style.color || "").trim()
      : "";
    this.refs.slotDialogCourse.style.color = selectedColor || "";
  }

  syncSlotFormCourseColor() {
    if (!this.refs.slotCourse) {
      return;
    }
    const selectedOption = this.refs.slotCourse.selectedOptions
      ? this.refs.slotCourse.selectedOptions[0]
      : null;
    const selectedColor = selectedOption
      ? String(selectedOption.dataset.courseColor || selectedOption.style.color || "").trim()
      : "";
    this.refs.slotCourse.style.color = selectedColor || "";
  }

  syncSlotDialogHourRange() {
    if (!this.refs.slotDialogHour || !this.refs.slotDialogEndHour) {
      return;
    }
    const maxHour = this.store.getHoursPerDay();
    this.refs.slotDialogHour.max = String(maxHour);
    this.refs.slotDialogEndHour.max = String(maxHour);

    const startHour = clamp(Number(this.refs.slotDialogHour.value || 1), 1, maxHour);
    this.refs.slotDialogHour.value = String(startHour);
    this.refs.slotDialogEndHour.min = String(startHour);

    const endHour = clamp(Number(this.refs.slotDialogEndHour.value || startHour), startHour, maxHour);
    this.refs.slotDialogEndHour.value = String(endHour);
  }

  syncSlotDialogEditTools() {
    if (!this.refs.slotDialogId) {
      return;
    }
    const isEditing = Boolean(this.refs.slotDialogId.value);
    const recurrenceNone = Number(this.refs.slotDialogParity.value || 0) === -1;
    this.refs.slotDialogEditTools.hidden = true;
    this.refs.slotDialogDelete.hidden = !isEditing;

    if (!isEditing) {
      this.refs.slotDialogEditScope.value = "all";
      this.refs.slotDialogEditFromDate.value = "";
      this.refs.slotDialogStart.disabled = false;
    } else {
      const fromScope = this.refs.slotDialogEditScope.value === "from" && Boolean(this.refs.slotDialogEditFromDate.value);
      this.refs.slotDialogStart.disabled = fromScope;
      if (fromScope) {
        this.refs.slotDialogStart.value = this.refs.slotDialogEditFromDate.value;
      }
    }
    this.refs.slotDialogEnd.disabled = recurrenceNone;
    this.refs.slotDialogDay.disabled = recurrenceNone;
    if (recurrenceNone) {
      if (this.slotDialogEndDateBackup === null) {
        this.slotDialogEndDateBackup = this.refs.slotDialogEnd.value || "";
      }
      const startIso = this.refs.slotDialogStart.value || "";
      if (startIso) {
        this.refs.slotDialogEnd.value = startIso;
        const isoDay = dayOfWeekIso(startIso);
        if (isoDay >= 1 && isoDay <= 5) {
          this.refs.slotDialogDay.value = String(isoDay);
        }
      }
    } else {
      if (this.slotDialogEndDateBackup) {
        this.refs.slotDialogEnd.value = this.slotDialogEndDateBackup;
      }
      this.slotDialogEndDateBackup = null;
    }

    if (this.refs.slotDialogEditInfo) {
      if (!isEditing) {
        this.refs.slotDialogEditInfo.hidden = true;
        this.refs.slotDialogEditInfo.textContent = "";
      } else {
        const fromScope = this.refs.slotDialogEditScope.value === "from" && Boolean(this.refs.slotDialogEditFromDate.value);
        const dateLabel = fromScope ? formatDate(this.refs.slotDialogEditFromDate.value) : "–";
        this.refs.slotDialogEditInfo.textContent =
          `Serie wird ab dem ausgewählten Termin verändert (${dateLabel})`;
        this.refs.slotDialogEditInfo.hidden = false;
      }
    }
  }

  _computeSlotEndDefault(startDefaultIso) {
    const year = this.activeSchoolYear;
    if (!year) {
      return startDefaultIso;
    }
    const ranges = this.store.listFreeRanges(year.id);
    const halfYearRange = ranges.find(
      (item) => String(item.label || "").trim().toLowerCase() === "halbjahresferien" && item.startDate
    );
    const summer = this._summerBreakBounds();
    let endDefault = summer.start || year.endDate;
    if (halfYearRange && startDefaultIso < halfYearRange.startDate) {
      endDefault = halfYearRange.startDate;
    }
    if (endDefault < startDefaultIso) {
      endDefault = startDefaultIso;
    }
    if (endDefault > year.endDate) {
      endDefault = year.endDate;
    }
    return endDefault;
  }

  async openSlotDialogForCreate(dayOfWeek, startHour) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.slotDialog) {
      return;
    }
    if (!this.populateSlotDialogCourseSelect(this.selectedCourseId)) {
      await this.showInfoMessage("Erst Kurs anlegen.");
      return;
    }
    this.setSlotDialogMode("lesson");
    this.refs.slotDialogTitle.textContent = "Unterrichtsstunde anlegen";
    this.refs.slotDialogId.value = "";
    this.refs.slotDialogDay.value = String(dayOfWeek);
    this.refs.slotDialogHour.value = String(clamp(Number(startHour), 1, this.store.getHoursPerDay()));
    this.refs.slotDialogEndHour.value = String(clamp(Number(startHour) + 1, 1, this.store.getHoursPerDay()));
    this.refs.slotDialogParity.value = "0";
    this.refs.slotDialogEditScope.value = "all";
    this.refs.slotDialogEditFromDate.value = "";
    if (this.refs.slotDialogEditInfo) {
      this.refs.slotDialogEditInfo.hidden = true;
      this.refs.slotDialogEditInfo.textContent = "";
    }
    this.slotDialogEndDateBackup = null;

    let startDefault = addDays(this.weekStartIso, Number(dayOfWeek) - 1);
    if (startDefault < year.startDate) {
      startDefault = year.startDate;
    }
    if (startDefault > year.endDate) {
      startDefault = year.endDate;
    }
    const endDefault = this._computeSlotEndDefault(startDefault);

    this.slotDialogStartMinIso = startDefault;
    this.refs.slotDialogStart.min = startDefault;
    this.refs.slotDialogStart.max = year.endDate;
    this.refs.slotDialogEnd.min = startDefault;
    this.refs.slotDialogEnd.max = year.endDate;
    this.refs.slotDialogStart.value = startDefault;
    this.refs.slotDialogEnd.value = endDefault;
    this.syncSlotDialogHourRange();
    this.syncSlotDialogEditTools();
    this.openDialog(this.refs.slotDialog);
  }

  async openBreakSupervisionDialog(dayOfWeek, breakAfterHour) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.slotDialog) {
      return;
    }
    const afterHour = Number(breakAfterHour);
    if (!BREAK_SUPERVISION_AFTER_HOURS.includes(afterHour) || afterHour >= this.store.getHoursPerDay()) {
      return;
    }
    this.setSlotDialogMode("break", afterHour);
    this.refs.slotDialogTitle.textContent = "Aufsicht anlegen";
    this.refs.slotDialogId.value = "";
    this.refs.slotDialogBreakName.value = "";
    this.refs.slotDialogDay.value = String(dayOfWeek);
    this.refs.slotDialogHour.value = String(afterHour);
    this.refs.slotDialogEndHour.value = String(afterHour);
    this.refs.slotDialogParity.value = "0";
    this.refs.slotDialogEditScope.value = "all";
    this.refs.slotDialogEditFromDate.value = "";
    if (this.refs.slotDialogEditInfo) {
      this.refs.slotDialogEditInfo.hidden = true;
      this.refs.slotDialogEditInfo.textContent = "";
    }
    this.slotDialogEndDateBackup = null;

    let startDefault = addDays(this.weekStartIso, Number(dayOfWeek) - 1);
    if (startDefault < year.startDate) startDefault = year.startDate;
    if (startDefault > year.endDate) startDefault = year.endDate;
    const endDefault = this._computeSlotEndDefault(startDefault);
    this.slotDialogStartMinIso = startDefault;
    this.refs.slotDialogStart.min = startDefault;
    this.refs.slotDialogStart.max = year.endDate;
    this.refs.slotDialogEnd.min = startDefault;
    this.refs.slotDialogEnd.max = year.endDate;
    this.refs.slotDialogStart.value = startDefault;
    this.refs.slotDialogEnd.value = endDefault;
    this.syncSlotDialogEditTools();
    this.openDialog(this.refs.slotDialog);
  }

  async openSlotDialogForEdit(slotOrId, clickedDate = null) {
    const year = this.activeSchoolYear;
    if (!year || !this.refs.slotDialog) {
      return;
    }
    const slot = (slotOrId && typeof slotOrId === "object")
      ? slotOrId
      : this.store.getSlot(Number(slotOrId));
    if (!slot) {
      return;
    }
    const isBreak = slot.placement === "break";
    if (!isBreak && !this.populateSlotDialogCourseSelect(slot.courseId)) {
      await this.showInfoMessage("Erst Kurs anlegen.");
      return;
    }
    this.setSlotDialogMode(isBreak ? "break" : "lesson", slot.startHour);
    this.refs.slotDialogTitle.textContent = isBreak ? "Aufsicht anpassen" : "Unterrichtsstunde anpassen";
    this.refs.slotDialogId.value = String(slot.id);
    if (isBreak) {
      this.refs.slotDialogBreakName.value = String(slot.label || "");
    } else {
      this.refs.slotDialogCourse.value = String(slot.courseId);
      this.syncSlotDialogCourseColor();
    }
    this.refs.slotDialogDay.value = String(slot.dayOfWeek);
    this.refs.slotDialogHour.value = String(slot.startHour);
    this.refs.slotDialogEndHour.value = String(
      clamp(Number(slot.startHour) + Number(slot.duration || 1) - 1, 1, this.store.getHoursPerDay())
    );
    this.refs.slotDialogStart.value = slot.startDate || "";
    this.refs.slotDialogEnd.value = slot.endDate || "";
    let displayParity = Number(slot.weekParity || 0);
    if (displayParity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
      displayParity = -1;
    }
    this.refs.slotDialogParity.value = String(displayParity);
    this.refs.slotDialogEditScope.value = "all";
    this.refs.slotDialogEditFromDate.value = "";
    this.slotDialogEndDateBackup = null;

    const slotStart = slot.startDate || year.startDate;
    const slotEnd = slot.endDate || year.endDate;
    this.slotDialogStartMinIso = null;
    this.refs.slotDialogStart.min = slotStart;
    this.refs.slotDialogStart.max = slotEnd;
    this.refs.slotDialogEnd.min = slotStart;
    this.refs.slotDialogEnd.max = slotEnd;
    if (clickedDate && clickedDate >= slotStart && clickedDate <= slotEnd) {
      this.refs.slotDialogEditScope.value = "from";
      this.refs.slotDialogEditFromDate.value = clickedDate;
    }
    this.syncSlotDialogHourRange();
    this.syncSlotDialogEditTools();
    this.openDialog(this.refs.slotDialog);
  }

  closeSlotDialog() {
    this.slotDialogStartMinIso = null;
    this.slotDialogEndDateBackup = null;
    this.setSlotDialogMode("lesson");
    this.closeDialog(this.refs.slotDialog);
  }

  async submitSlotDialog() {
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    const startDate = this.refs.slotDialogStart.value || null;
    const endDate = this.refs.slotDialogEnd.value || null;
    if (!startDate || !endDate) {
      await this.showInfoMessage("Bitte Start- und Enddatum vollständig eingeben.");
      return;
    }
    if (startDate < year.startDate) {
      await this.showInfoMessage("Startdatum liegt vor dem Schuljahr.");
      return;
    }
    if (endDate > year.endDate) {
      await this.showInfoMessage("Enddatum liegt nach dem Schuljahr.");
      return;
    }
    if (!this.refs.slotDialogId.value && this.slotDialogStartMinIso && startDate < this.slotDialogStartMinIso) {
      await this.showInfoMessage("Startdatum liegt vor dem gewählten Tag.");
      return;
    }
    if (!isSchoolWeekdayIso(startDate)) {
      await this.showInfoMessage("Das Startdatum muss auf einen Schultag (Montag bis Freitag) fallen.");
      return;
    }
    if (!isSchoolWeekdayIso(endDate)) {
      await this.showInfoMessage("Das Enddatum muss auf einen Schultag (Montag bis Freitag) fallen.");
      return;
    }
    if (endDate < startDate) {
      await this.showInfoMessage("Enddatum muss am oder nach dem Startdatum liegen.");
      return;
    }
    const placement = this.slotDialogMode === "break" ? "break" : "lesson";
    if (placement === "break") {
      const breakAfterHour = Number(this.refs.slotDialogBreakAfter.value || 0);
      this.refs.slotDialogHour.value = String(breakAfterHour);
      this.refs.slotDialogEndHour.value = String(breakAfterHour);
    } else {
      this.syncSlotDialogHourRange();
    }
    const startHour = Number(this.refs.slotDialogHour.value || 1);
    const endHour = Number(this.refs.slotDialogEndHour.value || startHour);
    const duration = placement === "break" ? 1 : Math.max(1, endHour - startHour + 1);
    const breakLabel = placement === "break" ? String(this.refs.slotDialogBreakName.value || "").trim() : "";
    if (placement === "break" && !breakLabel) {
      this.refs.slotDialogBreakName.focus();
      return;
    }

    const ok = await this.persistSlotChange({
      slotId: this.refs.slotDialogId.value || null,
      courseId: placement === "break" ? 0 : this.refs.slotDialogCourse.value,
      dayOfWeek: this.refs.slotDialogDay.value,
      startHour,
      duration,
      startDate,
      endDateInput: endDate,
      recurrenceValue: this.refs.slotDialogParity.value,
      editScope: this.refs.slotDialogEditScope.value || "all",
      editFromDate: this.refs.slotDialogEditFromDate.value || null,
      ...(placement === "break" ? { placement, label: breakLabel } : {})
    });
    if (!ok) {
      return;
    }
    await this.persistExplicitDatabaseSave("planning-slot-series-save");
    this.closeSlotDialog();
    this.resetSlotForm();
    this.renderAll();
  }

  async deleteSlotFromDialog() {
    const slotId = this.refs.slotDialogId.value;
    if (!slotId) {
      return;
    }
    const ok = await this.deleteSlotWithScope(
      slotId,
      this.refs.slotDialogEditScope.value || "all",
      this.refs.slotDialogEditFromDate.value || null
    );
    if (!ok) {
      return;
    }
    this.closeSlotDialog();
    this.resetSlotForm();
    this.renderAll();
  }

  findSidebarDragAfterElement(clientY) {
    const rows = [...this.refs.sidebarCourseList.querySelectorAll("li[data-course-id]:not(.dragging)")];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (const row of rows) {
      const box = row.getBoundingClientRect();
      const offset = clientY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, element: row };
      }
    }
    return closest.element;
  }

  syncSidebarDragPlaceholderState() {
    if (!this.dragPlaceholder || !this.dragSourceRow) {
      return;
    }
    const atOrigin = this.dragPlaceholder.previousElementSibling === this.dragSourceRow;
    this.dragPlaceholder.classList.toggle("at-origin", atOrigin);
  }

  positionSidebarDragPlaceholder(clientY) {
    if (!this.refs.sidebarCourseList || !this.dragPlaceholder) {
      return;
    }
    const after = this.findSidebarDragAfterElement(clientY);
    if (!after) {
      const addItem = this.refs.sidebarCourseList.querySelector("li[data-add-item='1']");
      if (addItem) {
        this.refs.sidebarCourseList.insertBefore(this.dragPlaceholder, addItem);
      } else {
        this.refs.sidebarCourseList.append(this.dragPlaceholder);
      }
      this.syncSidebarDragPlaceholderState();
      return;
    }
    this.refs.sidebarCourseList.insertBefore(this.dragPlaceholder, after);
    this.syncSidebarDragPlaceholderState();
  }

  autoScrollSidebarListDuringDrag(clientY) {
    if (!this.refs.sidebarCourseList) {
      return;
    }
    const rect = this.refs.sidebarCourseList.getBoundingClientRect();
    const threshold = 34;
    const step = 14;
    if (clientY < rect.top + threshold) {
      this.refs.sidebarCourseList.scrollTop -= step;
    } else if (clientY > rect.bottom - threshold) {
      this.refs.sidebarCourseList.scrollTop += step;
    }
  }

  clearSidebarDragState() {
    if (this.dragSourceRow) {
      this.dragSourceRow.classList.remove("dragging");
    }
    if (this.dragPlaceholder && this.dragPlaceholder.parentElement) {
      this.dragPlaceholder.remove();
    }
    this.dragCourseId = null;
    this.dragSourceRow = null;
    this.dragPlaceholder = null;
    this.dragDropCommitted = false;
  }

  async applySidebarCourseOrderFromDom() {
    const year = this.activeSchoolYear;
    if (!year) {
      return;
    }
    const orderedIds = [...this.refs.sidebarCourseList.querySelectorAll("li[data-course-id]")]
      .map((row) => Number(row.dataset.courseId))
      .filter((id) => id > 0);
    if (orderedIds.length === 0) {
      return;
    }
    if (!this.workspacePublicLoaded) {
      void this.ensurePlanningPublicLoaded().then(async () => {
        if (this.workspaceController) {
          await this.executeWorkspaceCommand(WORKSPACE_COMMAND_REORDER_COURSES, {
            schoolYearId: year.id,
            orderedIds
          });
        } else {
          this.store.updateCourseOrder(year.id, orderedIds);
        }
        this.renderSidebarCourseList();
      }).catch((error) => {
        this.setSyncStatus(
          error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
          true
        );
      });
      return;
    }
    if (this.workspaceController) {
      await this.executeWorkspaceCommand(WORKSPACE_COMMAND_REORDER_COURSES, {
        schoolYearId: year.id,
        orderedIds
      });
    } else {
      this.store.updateCourseOrder(year.id, orderedIds);
    }
  }

  async switchView(viewName) {
    if (!["week", "course", "settings"].includes(viewName)) return false;
    if (viewName !== "settings" && !await this.resolveUnsavedSettingsNavigation()) {
      return false;
    }
    this.hideContextMenu();
    this.closeWeekCalendarDialog();
    this.closeTopicDialog();
    this.resetInlineWeekBlockTopicEdit();
    if (this.locked && viewName !== "settings") {
      this.currentView = "settings";
      this.settingsSourceView = "planning";
      this.renderViewState();
      this.renderSettingsTabs();
      this.renderSidebarCourseList();
      this.queuePlanningReadySignal();
      return;
    }
    if (viewName === "settings") {
      this.settingsSourceView = this.currentView === "settings"
        ? this.settingsSourceView
        : "planning";
    }
    this.currentView = viewName;
    const requiresPlanningLoad = viewName === "week"
      || viewName === "course"
      || viewName === "settings";
    if (requiresPlanningLoad && !this.workspacePublicLoaded) {
      void this.ensurePlanningPublicLoaded().then(() => {
        this.renderAll();
      }).catch((error) => {
        this.setSyncStatus(
          error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
          true
        );
      });
    }
    this.renderViewState();
    this.renderSidebarCourseList();
    if (viewName === "settings") {
      this.renderSettingsTabs();
      this.renderDisplaySection();
      this.renderLessonTimesSection();
      this.renderDayOffSection();
      this.renderBackupSection();
      this.renderDatabaseSection();
    } else if (viewName === "week") {
      this.renderWeekSection();
    } else if (viewName === "course") {
      this.scrollCourseNextIntoView = true;
      this.renderCourseTimeline();
    }
    this.queuePlanningReadySignal();
    return true;
  }

  switchSettingsTab(tabName) {
    if (!this.refs.settingsPanels[tabName]) {
      return;
    }
    if (
      (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired")
      && tabName !== "database"
    ) {
      return;
    }
    this.activeSettingsTab = tabName;
    if ((tabName === "dayoff" || tabName === "lessonTimes") && !this.workspacePublicLoaded) {
      void this.ensurePlanningPublicLoaded().then(() => {
        this.renderAll();
      }).catch((error) => {
        this.setSyncStatus(
          error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
          true
        );
      });
    }
    this.renderSettingsTabs();
    const activeTab = this.activeSettingsTab;
    if (activeTab === "display") {
      this.renderDisplaySection();
    } else if (activeTab === "lessonTimes") {
      this.renderLessonTimesSection();
    } else if (activeTab === "dayoff") {
      this.renderDayOffSection();
    } else if (activeTab === "database") {
      this.renderBackupSection();
      this.renderDatabaseSection();
    }
  }

  bindWindowFocusGuards() {
    window.addEventListener("blur", () => {
    });
    window.addEventListener("focus", () => {
      if (this.isStandaloneWorkspace && this.syncState.initialized) {
        void this.maybeRunAutomaticWebBackup();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.isStandaloneWorkspace && this.syncState.initialized) {
        void this.maybeRunAutomaticWebBackup();
      }
    });
  }

  bindEvents() {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
      window.addEventListener("classroom:planning-view-request", async (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        if (this.planningTutorialPresentation && detail?.source !== "tutorial") {
          return;
        }
        const requestedView = detail && detail.view === "settings"
          ? "settings"
          : (detail && detail.view === "course" ? "course" : "week");
        const requestedSettingsContext = "planning";
        const requestedSettingsTab = String(detail?.settingsTab || "").trim();
        const allowedSettingsTabs = new Set(["dayoff", "display", "lessonTimes", "database"]);
        if (requestedView === "settings" && allowedSettingsTabs.has(requestedSettingsTab)) {
          this.shellTabContext = "planning";
          this.currentView = "settings";
          this.settingsSourceView = requestedSettingsContext;
          this.activeSettingsTab = requestedSettingsTab;
          this.renderAll();
          this.queuePlanningReadySignal();
          return;
        }
        this.shellTabContext = "planning";
        if (this.locked) {
          this.settingsSourceView = this.shellTabContext;
          this.renderAll({ visibleOnly: true });
          return;
        }
        const manualDatabaseSetupPending = this.shouldPromptForManualDatabaseOnStartup()
          && this.currentView === "settings"
          && this.activeSettingsTab === "database";
        if (manualDatabaseSetupPending) {
          return;
        }
        await this.switchView(requestedView);
      });
      window.addEventListener("classroom:planning-tab-leave-request", async (event) => {
        const detail = event instanceof CustomEvent ? event.detail : null;
        const requestId = String(detail?.requestId || "");
        let allowed = false;
        try {
          allowed = await this.resolveUnsavedSettingsNavigation();
        } catch (_error) {
          allowed = false;
        }
        window.dispatchEvent(new CustomEvent("classroom:planning-tab-leave-result", {
          detail: { requestId, allowed }
        }));
      });
    }
    document.addEventListener("contextmenu", (event) => {
      this.contextMenuClickGuard = {
        target: event.target,
        expiresAt: Date.now() + 750
      };
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !this.refs.contextMenu || this.refs.contextMenu.hidden) {
        return;
      }
      if (this.isContextMenuOpeningTarget(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      this.contextMenuClickGuard = null;
      if (!this.refs.contextMenu.contains(event.target)) {
        this.hideContextMenu();
      }
    }, true);
    document.addEventListener("click", (event) => {
      if (!this.isContextMenuOpeningTarget(event.target)) {
        return;
      }
      this.contextMenuClickGuard = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    this.refs.viewWeekBtn.addEventListener("click", async () => {
      await this.switchView("week");
    });
    if (this.refs.sidebarManualSaveBtn) {
      this.refs.sidebarManualSaveBtn.addEventListener("click", () => {
        void this.saveManualDatabase();
      });
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("classroom:planning-manual-save-request", () => {
        if (!this.isManualPersistenceMode()) {
          return;
        }
        void this.saveManualDatabase();
      });
    }

    if (this.refs.viewSettingsBtn) {
      this.refs.viewSettingsBtn.addEventListener("click", async () => {
        await this.switchView("settings");
      });
    }
    if (this.refs.viewTutorialBtn) {
      this.refs.viewTutorialBtn.addEventListener("click", () => {
        this.notifyParentTutorialStartRequest();
      });
    }
    if (this.refs.sidebarArchiveBtn) {
      this.refs.sidebarArchiveBtn.addEventListener("click", (event) => {
        this.handleArchiveOpenRequest(event);
      });
    }
    this.bindArchiveDialogEvents();
    if (this.refs.contextMenu) {
      this.refs.contextMenu.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
    }

    this.refs.sidebarPanel?.addEventListener("contextmenu", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (!this.openSidebarEmptyContextMenu(event)) {
        this.hideContextMenu();
      }
    });

    this.refs.sidebarCourseList.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.locked) {
        return;
      }
      const button = event.target.closest("button[data-course-id]");
      const activeTopicInput = document.activeElement?.closest?.("input.course-topic-input");
      if (!button || !(activeTopicInput instanceof HTMLInputElement)) {
        return;
      }
      const courseId = Number(button.dataset.courseId || 0);
      if (!courseId) {
        return;
      }

      event.preventDefault();
      this.suppressedSidebarCourseClicks ??= new WeakSet();
      this.suppressedSidebarCourseClicks.add(button);
      this.saveCourseTopicInput(activeTopicInput);
      void (async () => {
        if (!await this.resolveUnsavedSettingsNavigation()) {
          return;
        }
        this.selectedCourseId = courseId;
        await this.switchView("course");
      })();
    });

    this.refs.sidebarCourseList.addEventListener("click", async (event) => {
      const addButton = event.target.closest("button[data-add-course='1']");
      if (addButton) {
        if (this.locked) {
          return;
        }
        this.openCourseDialog();
        return;
      }
      if (this.locked) {
        return;
      }
      const button = event.target.closest("button[data-course-id]");
      if (!button) {
        return;
      }
      if (this.suppressedSidebarCourseClicks?.delete(button)) {
        return;
      }
      const courseId = Number(button.dataset.courseId);
      if (!await this.resolveUnsavedSettingsNavigation()) {
        return;
      }
      this.selectedCourseId = courseId;
      await this.switchView("course");
    });

    this.refs.sidebarCourseList.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (event.button !== 2) {
        this.hideContextMenu();
        return;
      }
      const row = event.target.closest("li[data-course-id]");
      if (!row) {
        if (!this.openSidebarEmptyContextMenu(event)) {
          this.hideContextMenu();
        }
        return;
      }
      if (this.locked) {
        this.hideContextMenu();
        return;
      }
      const courseId = Number(row.dataset.courseId || 0);
      if (!courseId) {
        if (!this.openSidebarEmptyContextMenu(event)) {
          this.hideContextMenu();
        }
        return;
      }
      this.selectedCourseId = courseId;
      this.openCourseContextMenu(courseId, event.clientX, event.clientY);
    });

    this.refs.courseDialogCancel.addEventListener("click", () => {
      this.closeCourseDialog();
    });

    this.refs.courseDialogNoLesson.addEventListener("change", () => {
      this.syncCourseDialogNoLessonState();
    });

    if (this.refs.courseDialogColorPalette) {
      this.refs.courseDialogColorPalette.addEventListener("click", (event) => {
        const button = event.target.closest("button.course-color-btn[data-color]");
        if (!button || button.disabled || this.refs.courseDialogNoLesson.checked) {
          return;
        }
        this.selectCourseDialogColor(button.dataset.color);
      });
    }

    this.refs.courseColorDialogPalette?.addEventListener("click", (event) => {
      const button = event.target.closest("button.course-color-btn[data-color]");
      if (!button || button.disabled) {
        return;
      }
      this.selectCourseColorDialogColor(button.dataset.color);
    });

    this.refs.courseDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitCourseDialog();
    });

    this.refs.courseColorDialogForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitCourseColorDialog();
    });


    this.refs.courseDialogDelete.addEventListener("click", async () => {
      await this.deleteCourseFromDialog();
    });


    this.refs.courseDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeCourseDialog();
    });

    this.refs.courseColorDialogCancel?.addEventListener("click", () => {
      this.closeCourseColorDialog();
    });

    this.refs.courseColorDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeCourseColorDialog();
    });


    this.refs.entfallDialogCancel.addEventListener("click", () => {
      this.closeEntfallDialog();
    });

    this.refs.entfallDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitEntfallDialog();
    });

    this.refs.entfallDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeEntfallDialog();
    });

    this.refs.topicDialogCancel.addEventListener("click", () => {
      this.closeTopicDialog();
    });

    this.refs.topicDialogNotes?.addEventListener("input", (event) => {
      this.topicDialogRichTextSelectionLocked = false;
      this.updateTopicDialogRichTextToolbar();
    });

    this.refs.topicDialogNotes?.addEventListener("paste", (event) => {
      event.preventDefault();
      this.insertTopicDialogNotesRichText(
        event.clipboardData?.getData("text/html") || "",
        event.clipboardData?.getData("text/plain") || ""
      );
      this.normalizeTopicDialogNotesEditor({ restoreSelection: true });
    });

    this.refs.topicDialogNotes?.addEventListener("blur", () => {
      if (!this.topicDialogRichTextSelectionLocked) this.normalizeTopicDialogNotesEditor();
    });

    this.refs.topicDialogNotes?.addEventListener("click", (event) => {
      this.openTopicDialogNoteLink(event);
    });

    this.refs.topicDialogNotes?.addEventListener("keyup", () => this.updateTopicDialogRichTextToolbar());
    this.refs.topicDialogNotes?.addEventListener("keyup", () => this.rememberTopicDialogNotesSelection());
    this.refs.topicDialogNotes?.addEventListener("mouseup", () => {
      this.topicDialogRichTextSelectionLocked = false;
      this.rememberTopicDialogNotesSelection();
      this.updateTopicDialogRichTextToolbar();
    });
    this.refs.topicDialogNotes?.addEventListener("pointerup", () => {
      this.topicDialogRichTextSelectionLocked = false;
      this.rememberTopicDialogNotesSelection();
    });
    this.refs.topicDialogNotes?.addEventListener("dragend", () => {
      this.topicDialogRichTextSelectionLocked = false;
      this.rememberTopicDialogNotesSelection();
    });
    this.refs.topicDialogNotes?.addEventListener("dragstart", () => {
      this.rememberTopicDialogNotesSelection();
      this.topicDialogRichTextSelectionLocked = true;
    });
    this.refs.topicDialogNotes?.addEventListener("focus", () => {
      this.rememberTopicDialogNotesSelection();
      this.updateTopicDialogRichTextToolbar();
    });
    document.addEventListener("selectionchange", () => {
      this.rememberTopicDialogNotesSelection();
      this.updateTopicDialogRichTextToolbar();
    });

    this.refs.topicDialogRichTextToolbar?.addEventListener("pointerdown", (event) => {
      this.topicDialogRichTextSelectionLocked = true;
      this.rememberTopicDialogNotesSelection();
      if (event.target.closest("button")) event.preventDefault();
    });
    this.refs.topicDialogRichTextToolbar?.addEventListener("click", (event) => {
      const colorTrigger = event.target.closest(".rich-text-color-trigger");
      if (colorTrigger) {
        this.setTopicDialogColorPaletteOpen(colorTrigger.getAttribute("aria-expanded") !== "true");
        return;
      }
      const colorButton = event.target.closest("button[data-rich-text-color]");
      if (colorButton) {
        this.applyTopicDialogTextColor(colorButton.dataset.richTextColor || "");
        return;
      }
      const button = event.target.closest("button[data-rich-text-command]");
      if (!button) return;
      const command = button.dataset.richTextCommand;
      if (["addRow", "deleteRow", "addColumn", "deleteColumn"].includes(command)) this.changeTopicDialogTable(command);
      else this.executeTopicDialogRichTextCommand(command, button.value || "");
    });
    this.refs.topicDialogRichTextToolbar?.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-rich-text-command]");
      if (!select) return;
      this.executeTopicDialogRichTextCommand(select.dataset.richTextCommand, select.value);
      select.value = select.dataset.richTextCommand === "fontSize" ? select.value : "2x2";
    });
    this.refs.topicDialogRichTextToolbar?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setTopicDialogColorPaletteOpen(false);
    });

    this.refs.topicDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitTopicDialog();
    });

    this.refs.topicDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeTopicDialog();
    });

    if (this.refs.messageDialogForm) {
      this.refs.messageDialogForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this._resolveMessageDialog("ok");
      });
    }


    if (this.refs.messageDialogCancel) {
      this.refs.messageDialogCancel.addEventListener("click", () => {
        this._resolveMessageDialog("cancel");
      });
    }

    if (this.refs.messageDialogDiscardTop) {
      this.refs.messageDialogDiscardTop.addEventListener("click", () => {
        this._resolveMessageDialog("discard");
      });
    }

    if (this.refs.messageDialogCancelTop) {
      this.refs.messageDialogCancelTop.addEventListener("click", () => {
        this._resolveMessageDialog("cancel");
      });
    }

    if (this.refs.messageDialog) {
      this.refs.messageDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this._resolveMessageDialog("cancel");
      });
      this.bindDialogBackdropClose(this.refs.messageDialog, () => {
        this._resolveMessageDialog("cancel");
      });
    }


    this.refs.slotDialogCancel.addEventListener("click", () => {
      this.closeSlotDialog();
    });

    this.refs.slotDialogCourse.addEventListener("change", () => {
      this.syncSlotDialogCourseColor();
    });

    this.refs.slotDialogParity.addEventListener("change", () => {
      this.syncSlotDialogEditTools();
    });

    this.refs.slotDialogHour.addEventListener("change", () => {
      this.syncSlotDialogHourRange();
    });

    this.refs.slotDialogBreakAfter.addEventListener("change", () => {
      const breakAfterHour = Number(this.refs.slotDialogBreakAfter.value || 0);
      this.refs.slotDialogHour.value = String(breakAfterHour);
      this.refs.slotDialogEndHour.value = String(breakAfterHour);
    });

    this.refs.slotDialogEndHour.addEventListener("change", () => {
      this.syncSlotDialogHourRange();
    });

    this.refs.slotDialogStart.addEventListener("change", () => {
      this.syncSlotDialogEditTools();
    });

    this.refs.slotDialogEnd.addEventListener("change", () => {
      this.syncSlotDialogEditTools();
    });

    this.refs.slotDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitSlotDialog();
    });

    this.refs.slotDialogDelete.addEventListener("click", async () => {
      await this.deleteSlotFromDialog();
    });

    this.refs.slotDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeSlotDialog();
    });

    this.refs.sidebarCourseList.addEventListener("dragstart", (event) => {
      const row = event.target.closest("li[data-course-id]");
      if (!row || this.locked || !row.draggable) {
        event.preventDefault();
        return;
      }
      this.dragCourseId = Number(row.dataset.courseId);
      this.dragSourceRow = row;
      this.dragDropCommitted = false;
      row.classList.add("dragging");
      const rowHeight = Math.max(Math.round(row.getBoundingClientRect().height), 42);
      const placeholder = document.createElement("li");
      placeholder.className = "sidebar-drag-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.style.height = `${rowHeight}px`;
      this.dragPlaceholder = placeholder;
      this.refs.sidebarCourseList.insertBefore(placeholder, row.nextSibling);
      this.syncSidebarDragPlaceholderState();
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(this.dragCourseId));
      }
    });

    this.refs.sidebarCourseList.addEventListener("dragover", (event) => {
      if (this.locked || !this.dragCourseId || !this.dragSourceRow || !this.dragPlaceholder) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      this.autoScrollSidebarListDuringDrag(event.clientY);
      this.positionSidebarDragPlaceholder(event.clientY);
    });

    this.refs.sidebarCourseList.addEventListener("drop", (event) => {
      if (this.locked || !this.dragCourseId) {
        return;
      }
      event.preventDefault();
      this.dragDropCommitted = true;
      this.positionSidebarDragPlaceholder(event.clientY);
    });

    this.refs.sidebarCourseList.addEventListener("dragend", () => {
      const shouldApply = Boolean(this.dragCourseId && this.dragDropCommitted);
      if (
        shouldApply &&
        this.dragSourceRow &&
        this.dragPlaceholder &&
        this.dragPlaceholder.parentElement === this.refs.sidebarCourseList
      ) {
        this.refs.sidebarCourseList.insertBefore(this.dragSourceRow, this.dragPlaceholder);
      }
      this.clearSidebarDragState();
      if (shouldApply) {
        this.applySidebarCourseOrderFromDom();
        this.renderSidebarCourseList();
        this.renderCourseSection();
        this.renderSlotSection();
      }
    });

    this.refs.settingsTabs.forEach((button) => {
      button.addEventListener("click", () => {
        this.switchSettingsTab(button.dataset.tab);
      });
    });

    if (this.refs.settingsResetAll) {
      this.refs.settingsResetAll.addEventListener("click", async () => {
        await this.applySettingsDefaultsForActiveTab();
      });
    }
    if (this.refs.settingsSaveAll) {
      this.refs.settingsSaveAll.addEventListener("click", () => {
        void this.applySettingsSaveForActiveTab();
      });
    }
    if (this.refs.settingsCancelAll) {
      this.refs.settingsCancelAll.addEventListener("click", () => {
        this.applySettingsCancelForActiveTab();
      });
    }

    this.refs.schoolYearSelect.addEventListener("change", async () => {
      if (!this.workspacePublicLoaded) {
        try {
          await this.ensurePlanningPublicLoaded();
        } catch (error) {
          this.setSyncStatus(
            error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
            true
          );
          this.renderSchoolYearSelect();
          return;
        }
      }
      const nextSchoolYearId = Number(this.refs.schoolYearSelect.value);
      const targetCourses = this.store.listCourses(nextSchoolYearId);
      const nextSelectedCourseId = targetCourses.some((course) => course.id === this.selectedCourseId)
        ? this.selectedCourseId
        : (targetCourses[0]?.id || null);
      if (!this.store.setActiveSchoolYear(nextSchoolYearId)) {
        this.renderSchoolYearSelect();
        return;
      }
      this.weekStartIso = this._clampWeekStart(this.weekStartIso);
      this.selectedLessonId = null;
      this.selectedCourseId = nextSelectedCourseId;
      this.renderAll();
    });

    this.refs.weekPrev.addEventListener("click", () => {
      if (this.locked) {
        return;
      }
      const candidate = this._clampWeekStart(addDays(this.weekStartIso, -7));
      if (candidate === this.weekStartIso) {
        return;
      }
      this.weekStartIso = candidate;
      this.selectedLessonId = null;
      this.renderWeekSection();
      this.renderLessonSection();
    });

    this.refs.weekNext.addEventListener("click", () => {
      if (this.locked) {
        return;
      }
      const candidate = this._clampWeekStart(addDays(this.weekStartIso, 7));
      if (candidate === this.weekStartIso) {
        return;
      }
      this.weekStartIso = candidate;
      this.selectedLessonId = null;
      this.renderWeekSection();
      this.renderLessonSection();
    });

    this.refs.kwLabel.addEventListener("click", () => {
      this.openWeekMiniCalendar();
    });

    this.refs.weekPickerBtn.addEventListener("click", () => {
      if (this.locked) {
        return;
      }
      const candidate = currentWeekStartForDisplay();
      const { min, max } = this._weekBounds();
      if ((min && candidate < min) || (max && candidate > max)) {
        return;
      }
      if (candidate === this.weekStartIso) {
        return;
      }
      this.weekStartIso = candidate;
      this.selectedLessonId = null;
      this.renderWeekSection();
      this.renderLessonSection();
    });

    this.refs.weekDate.addEventListener("change", () => {
      if (this.locked) {
        return;
      }
      if (!this.refs.weekDate.value) {
        return;
      }
      this.weekStartIso = this._clampWeekStart(weekStartFor(this.refs.weekDate.value));
      this.selectedLessonId = null;
      this.renderWeekSection();
      this.renderLessonSection();
    });

    if (this.refs.weekCalendarPrev) {
      this.refs.weekCalendarPrev.addEventListener("click", () => {
        if (this.locked) {
          return;
        }
        const nextMonth = this._weekCalendarShiftMonth(this.weekCalendarMonthIso, -1);
        this.weekCalendarMonthIso = this._clampWeekCalendarMonth(nextMonth);
        this.syncWeekCalendarMonthOptions();
        this.renderWeekCalendarGrid();
        this.positionWeekCalendarDialog();
      });
    }

    if (this.refs.weekCalendarNext) {
      this.refs.weekCalendarNext.addEventListener("click", () => {
        if (this.locked) {
          return;
        }
        const nextMonth = this._weekCalendarShiftMonth(this.weekCalendarMonthIso, 1);
        this.weekCalendarMonthIso = this._clampWeekCalendarMonth(nextMonth);
        this.syncWeekCalendarMonthOptions();
        this.renderWeekCalendarGrid();
        this.positionWeekCalendarDialog();
      });
    }

    if (this.refs.weekCalendarMonth) {
      this.refs.weekCalendarMonth.addEventListener("change", () => {
        this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.refs.weekCalendarMonth.value);
        this.syncWeekCalendarMonthOptions();
        this.renderWeekCalendarGrid();
      });
    }

    if (this.refs.weekCalendarGrid) {
      this.refs.weekCalendarGrid.addEventListener("mouseover", (event) => {
        const row = event.target.closest("tr.week-calendar-row[data-week-start]");
        this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
      });

      this.refs.weekCalendarGrid.addEventListener("mouseleave", () => {
        this.setWeekCalendarHoverWeek(null);
      });

      this.refs.weekCalendarGrid.addEventListener("focusin", (event) => {
        const row = event.target.closest("tr.week-calendar-row[data-week-start]");
        this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
      });

      this.refs.weekCalendarGrid.addEventListener("focusout", () => {
        const active = document.activeElement;
        const row = active ? active.closest("tr.week-calendar-row[data-week-start]") : null;
        this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
      });

      this.refs.weekCalendarGrid.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-week-start]");
        if (!button || button.disabled) {
          return;
        }
        this.applyWeekCalendarSelection(button.dataset.weekStart);
      });
    }

    if (this.refs.weekCalendarDialog) {
      this.refs.weekCalendarDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.closeWeekCalendarDialog();
      });

      this.bindDialogBackdropClose(this.refs.weekCalendarDialog, () => {
        this.closeWeekCalendarDialog();
      });
    }

    this.refs.weekTable.addEventListener("pointerdown", (event) => {
      this.handleWeekEmptySlotPointerDown(event);
    });

    this.refs.weekTable.addEventListener("click", async (event) => {
      if (this.locked) {
        return;
      }
      this.hideContextMenu();
      const seatplanTrigger = event.target.closest(".lesson-block-seatplan-trigger[data-seatplan-lesson-id]");
      if (seatplanTrigger) {
        event.preventDefault();
        event.stopPropagation();
        const lessonId = Number(seatplanTrigger.dataset.seatplanLessonId || 0);
        if (!lessonId) {
          return;
        }
        void this.requestSeatplanNavigation(lessonId);
        return;
      }
      const detailsTrigger = event.target.closest(".lesson-block-details-trigger[data-detail-planning-lesson-id]");
      if (detailsTrigger) {
        event.preventDefault();
        event.stopPropagation();
        this.openTopicDialog(Number(detailsTrigger.dataset.detailPlanningLessonId || 0));
        return;
      }
      const performanceEntryTrigger = event.target.closest(".lesson-block-performance-entry[data-performance-entry-lesson-id]");
      if (performanceEntryTrigger) {
        event.preventDefault();
        event.stopPropagation();
        const lessonId = Number(performanceEntryTrigger.dataset.performanceEntryLessonId || 0);
        const triggerMode = String(performanceEntryTrigger.dataset.performanceEntryMode || "entry").trim();
        if (!lessonId) {
          return;
        }
        void this.requestPerformanceNavigation(lessonId, triggerMode);
        return;
      }
      const breakSupervision = event.target.closest("[data-break-supervision='1'][data-slot-id]");
      if (breakSupervision) {
        const slot = this.store.getSlot(Number(breakSupervision.dataset.slotId || 0));
        if (slot) await this.openSlotDialogForEdit(slot, breakSupervision.dataset.date || null);
        return;
      }
      const breakTarget = event.target.closest("[data-week-break='1'][data-day][data-after-hour]");
      if (breakTarget) {
        this.lastWeekEmptySlotPointerDown = null;
        this.weekEmptySlotDialogOpenedAt = Date.now();
        await this.openBreakSupervisionDialog(
          Number(breakTarget.dataset.day),
          Number(breakTarget.dataset.afterHour)
        );
        return;
      }
      const courseLink = event.target.closest(".lesson-block .title.course-link[data-course-id]");
      if (courseLink) {
        const courseId = Number(courseLink.dataset.courseId || 0);
        if (courseId) {
          if (!await this.resolveUnsavedSettingsNavigation()) {
            return;
          }
          this.selectedCourseId = courseId;
          await this.switchView("course");
        }
        return;
      }
      const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
      if (lessonBlock) {
        if (lessonBlock.matches("button:disabled")) {
          return;
        }
        const lessonId = Number(lessonBlock.dataset.lessonId);
        if (!lessonId) {
          return;
        }
        this.selectedLessonId = lessonId;
        this.renderWeekTable();
        this.renderLessonSection();
        this.startInlineWeekBlockTopicEdit(lessonId, {
          selectAll: event.detail > 0
        });
        return;
      }

      const dayCell = event.target.closest("[data-week-empty='1'][data-day][data-hour]");
      if (!dayCell) {
        return;
      }
      if (this.selectedLessonId !== null) {
        this.selectedLessonId = null;
        this.renderWeekTable();
        this.renderLessonSection();
      }
    });

    this.refs.weekTable.addEventListener("dblclick", async (event) => {
      if (this.locked) {
        return;
      }
      if (Date.now() - Number(this.weekEmptySlotDialogOpenedAt || 0) < 700) {
        event.preventDefault();
        return;
      }
      const breakTarget = event.target.closest("[data-week-break='1'][data-day][data-after-hour]");
      if (breakTarget) {
        this.lastWeekEmptySlotPointerDown = null;
        this.weekEmptySlotDialogOpenedAt = Date.now();
        await this.openBreakSupervisionDialog(
          Number(breakTarget.dataset.day),
          Number(breakTarget.dataset.afterHour)
        );
        return;
      }
      const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
      if (lessonBlock) {
        return;
      }
      const dayCell = event.target.closest("[data-week-empty='1'][data-day][data-hour]");
      if (!dayCell) {
        return;
      }
      const day = Number(dayCell.dataset.day);
      const hour = Number(dayCell.dataset.hour);
      this.lastWeekEmptySlotPointerDown = null;
      this.weekEmptySlotDialogOpenedAt = Date.now();
      await this.openSlotDialogForCreate(day, hour);
    });

    this.refs.weekTable.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (event.button !== 2) {
        this.hideContextMenu();
        return;
      }
      if (this.locked) {
        this.hideContextMenu();
        return;
      }
      const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
      if (!lessonBlock || lessonBlock.matches("button:disabled")) {
        this.hideContextMenu();
        if (this.selectedLessonId) {
          this.selectedLessonId = null;
          this.resetInlineWeekBlockTopicEdit();
          this.renderWeekTable();
          this.renderLessonSection();
        }
        return;
      }
      this.openWeekBlockContextMenu(
        Number(lessonBlock.dataset.lessonId),
        event.clientX,
        event.clientY,
        "week"
      );
    });

    this.refs.hoursPerDay.addEventListener("change", () => {
      const hours = clamp(Number(this.refs.hoursPerDay.value) || HOURS_PER_DAY_DEFAULT, 1, 12);
      this.settingsDraft.hoursPerDay = hours;
      this.settingsDraft.lessonTimes = normalizeLessonTimes(this.settingsDraft.lessonTimes, hours);
      this.refs.hoursPerDay.value = String(hours);
      this.renderDisplaySection();
      this.renderLessonTimesSection();
      this.refreshSettingsDirtyState();
    });

    if (this.refs.lessonTimesList) {
      this.refs.lessonTimesList.addEventListener("change", (event) => {
        const input = event.target.closest("input[data-lesson-time]");
        if (!input) {
          return;
        }
        const maxLesson = clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12);
        const lesson = clamp(Number(input.dataset.lesson || 0), 1, maxLesson);
        if (!lesson) {
          return;
        }
        this.updateSettingsDraftLessonTime(lesson, input.dataset.lessonTime || "start", input.value);
        input.value = normalizeLessonTimeValue(input.value);
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.showHiddenSidebarCourses) {
      this.refs.showHiddenSidebarCourses.addEventListener("change", () => {
        this.settingsDraft.showHiddenSidebarCourses = Boolean(this.refs.showHiddenSidebarCourses.checked);
        this.renderDisplaySection();
        this.refreshSettingsDirtyState();
      });
    }

    this.refs.themePreferenceInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.setThemePreference(input.value);
      });
    });

    if (this.refs.backupAutoEnabled) {
      this.refs.backupAutoEnabled.addEventListener("change", () => {
        this.settingsDraft.backupEnabled = Boolean(this.refs.backupAutoEnabled.checked);
        this.renderBackupSection();
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.backupIntervalDays) {
      this.refs.backupIntervalDays.addEventListener("change", () => {
        const days = clamp(
          Number(this.refs.backupIntervalDays.value) || BACKUP_INTERVAL_DEFAULT_DAYS,
          1,
          30
        );
        this.settingsDraft.backupIntervalDays = days;
        this.refs.backupIntervalDays.value = String(days);
        this.renderBackupSection();
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.backupNowBtn) {
      this.refs.backupNowBtn.addEventListener("click", () => {
        this.createLatestWebBackup("manual");
        this.renderBackupSection();
      });
    }

    if (this.refs.dbBackupAutoEnabled) {
      this.refs.dbBackupAutoEnabled.addEventListener("change", () => {
        this.settingsDraft.backupEnabled = Boolean(this.refs.dbBackupAutoEnabled.checked);
        this.renderBackupSection();
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.dbBackupIntervalDays) {
      this.refs.dbBackupIntervalDays.addEventListener("change", () => {
        const days = clamp(
          Number(this.refs.dbBackupIntervalDays.value) || BACKUP_INTERVAL_DEFAULT_DAYS,
          1,
          30
        );
        this.settingsDraft.backupIntervalDays = days;
        this.refs.dbBackupIntervalDays.value = String(days);
        this.renderBackupSection();
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.dbBackupNowBtn) {
      this.refs.dbBackupNowBtn.addEventListener("click", () => {
        this.createLatestWebBackup("manual");
        this.renderBackupSection();
      });
    }

    if (this.refs.dbBackupImportBtn && this.refs.dbBackupImportFile) {
      this.refs.dbBackupImportBtn.addEventListener("click", () => {
        this.refs.dbBackupImportFile.click();
      });
    }

    if (this.refs.dbBackupImportFile) {
      this.refs.dbBackupImportFile.addEventListener("change", async () => {
        const [file] = this.refs.dbBackupImportFile.files || [];
        if (!file) {
          return;
        }
        await this.importBackupFromFile(file);
        this.refs.dbBackupImportFile.value = "";
        this.renderBackupSection();
      });
    }

    if (this.refs.backupDirChangeBtn) {
      this.refs.backupDirChangeBtn.addEventListener("click", async () => {
        if (!this.hasShellDatabaseConnection()) {
          await this.showInfoMessage("Bitte zuerst eine Datenbankdatei auswählen.");
          return;
        }
        if (typeof window.showDirectoryPicker !== "function") {
          await this.showInfoMessage("Der Browser unterstützt keine Verzeichnisauswahl.");
          return;
        }
        let assigned = false;
        try {
          const persistence = this.getWorkspacePersistenceStatus();
          const hasStoredDirectory = Boolean(persistence.pendingBackupDirectoryName);
          if (hasStoredDirectory) {
            assigned = await this.ensureBackupDirectoryReady({ allowPrompt: true });
          } else {
            const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
            assigned = await this.acceptWorkspaceBackupDirectoryHandle(directoryHandle);
          }
        } catch (error) {
          if (error?.name !== "AbortError") {
            this.setBackupStatus("Backup-Ordner konnte nicht verbunden werden.", true);
          }
        }
        if (assigned) {
          this.setBackupStatus("Backup-Ordner verbunden.");
        } else {
          this.setBackupStatus("Backup-Ordner wurde nicht verbunden.", true);
        }
        this.renderAll();
      });
    }

    if (this.refs.backupExportBtn) {
      this.refs.backupExportBtn.addEventListener("click", () => {
        this.exportBackup();
        this.renderBackupSection();
      });
    }

    if (this.refs.backupImportBtn && this.refs.backupImportFile) {
      this.refs.backupImportBtn.addEventListener("click", () => {
        this.refs.backupImportFile.click();
      });
    }

    if (this.refs.backupImportFile) {
      this.refs.backupImportFile.addEventListener("change", async () => {
        const [file] = this.refs.backupImportFile.files || [];
        if (!file) {
          return;
        }
        await this.importBackupFromFile(file);
        this.refs.backupImportFile.value = "";
        this.renderBackupSection();
      });
    }

    if (this.refs.dbManualLoadBtn && this.refs.dbManualFile) {
      this.refs.dbManualLoadBtn.addEventListener("click", () => {
        this.refs.dbManualFile.click();
      });
    }

    if (this.refs.dbManualFile) {
      this.refs.dbManualFile.addEventListener("change", async () => {
        const [file] = this.refs.dbManualFile.files || [];
        if (!file) {
          return;
        }
        await this.loadManualDatabaseFromFile(file);
        this.refs.dbManualFile.value = "";
      });
    }

    if (this.refs.dbManualSaveBtn) {
      this.refs.dbManualSaveBtn.addEventListener("click", () => {
        void this.startEmptyDatabase();
      });
    }

    if (this.refs.backupRestoreBtn) {
      this.refs.backupRestoreBtn.addEventListener("click", async () => {
        await this.restoreLatestWebBackup();
      });
    }

    if (this.refs.backupResetDefaults) {
      this.refs.backupResetDefaults.addEventListener("click", () => {
        this.settingsDraft.backupEnabled = BACKUP_ENABLED_DEFAULT;
        this.settingsDraft.backupIntervalDays = BACKUP_INTERVAL_DEFAULT_DAYS;
        this.renderBackupSection();
        this.refreshSettingsDirtyState();
      });
    }

    if (this.refs.dbSelectExistingBtn) {
      this.refs.dbSelectExistingBtn.addEventListener("click", async () => {
        const reconnected = await this.tryReconnectStoredSyncFile();
        if (reconnected) {
          this.renderAll();
          return;
        }
        await this.selectSyncFile("existing");
        this.renderAll();
      });
    }

    if (this.refs.dbCreateNewBtn) {
      this.refs.dbCreateNewBtn.addEventListener("click", async () => {
        await this.startEmptyDatabase();
      });
    }

    this.refs.courseSettingsAdd.addEventListener("click", () => {
      if (this.locked) {
        return;
      }
      this.openCourseDialog();
    });

    this.refs.courseList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }
      if (this.locked) {
        return;
      }
      const id = Number(button.dataset.id);
      const action = button.dataset.action;
      if (!id) {
        return;
      }
      if (action === "edit" || action === "delete") {
        if (action === "edit") {
          this.openCourseDialog(id);
        } else {
          void this.deleteCourseById(id);
        }
        return;
      }
    });

    this.refs.courseList.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (event.button !== 2) {
        this.hideContextMenu();
        return;
      }
      const row = event.target.closest("li[data-course-id]");
      if (!row) {
        return;
      }
      if (this.locked) {
        this.hideContextMenu();
        return;
      }
      const id = Number(row.dataset.courseId);
      if (!id) {
        return;
      }
      this.openCourseContextMenu(id, event.clientX, event.clientY);
    });

    this.refs.slotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const ok = await this.persistSlotChange({
        slotId: this.refs.slotId.value || null,
        courseId: this.refs.slotCourse.value,
        dayOfWeek: this.refs.slotDay.value,
        startHour: this.refs.slotHour.value,
        duration: this.refs.slotDuration.value,
        startDate: this.refs.slotStart.value || null,
        endDateInput: this.refs.slotEnd.value || null,
        recurrenceValue: this.refs.slotParity.value,
        editScope: this.refs.slotEditScope.value || "all",
        editFromDate: this.refs.slotEditFromDate.value || null
      });
      if (!ok) {
        return;
      }
      await this.persistExplicitDatabaseSave("planning-slot-series-save");
      this.resetSlotForm();
      this.renderAll();
    });

    this.refs.slotCourse.addEventListener("change", () => {
      this.syncSlotFormCourseColor();
    });

    this.refs.slotEditScope.addEventListener("change", () => {
      this.syncSlotEditTools();
    });

    this.refs.slotParity.addEventListener("change", () => {
      this.syncSlotEditTools();
    });

    this.refs.slotStart.addEventListener("change", () => {
      if (Number(this.refs.slotParity.value || 0) === -1) {
        this.refs.slotEnd.value = this.refs.slotStart.value || "";
      }
    });

    this.refs.slotEditFromDate.addEventListener("change", () => {
      if (this.refs.slotEditScope.value === "from" && this.refs.slotEditFromDate.value) {
        this.refs.slotStart.value = this.refs.slotEditFromDate.value;
        if (Number(this.refs.slotParity.value || 0) === -1) {
          this.refs.slotEnd.value = this.refs.slotEditFromDate.value;
        }
      }
    });

    this.refs.slotReset.addEventListener("click", () => {
      this.resetSlotForm();
    });

    this.refs.slotDelete.addEventListener("click", async () => {
      const slotId = Number(this.refs.slotId.value || 0);
      if (!slotId) {
        return;
      }
      const ok = await this.deleteSlotWithScope(
        slotId,
        this.refs.slotEditScope.value || "all",
        this.refs.slotEditFromDate.value || null
      );
      if (!ok) {
        return;
      }
      this.resetSlotForm();
      this.renderAll();
    });

    this.refs.slotList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }
      const id = Number(button.dataset.id);
      const action = button.dataset.action;

      if (action === "edit") {
        const slot = this.store.getSlot(id);
        if (!slot) {
          return;
        }
        await this.openSlotDialogForEdit(slot);
        return;
      }

      if (action === "delete") {
        if (!await this.showConfirmMessage("Unterrichtsstunde löschen?", {
          dangerOk: true
        })) {
          return;
        }
        this.store.deleteSlot(id);
        this.selectedLessonId = null;
        this.renderAll();
      }
    });

    if (this.refs.freeRangeAdd) {
      this.refs.freeRangeAdd.addEventListener("click", () => {
        this.openFreeRangeDialog();
      });
    }

    this.refs.freeRangeDialogCancel.addEventListener("click", () => {
      this.closeFreeRangeDialog();
    });

    this.refs.freeRangeDialogLabel.addEventListener("change", () => {
      this.applySuggestedHolidayRangeInDialog();
    });

    this.refs.freeRangeDialogLabel.addEventListener("blur", () => {
      this.applySuggestedHolidayRangeInDialog();
    });

    this.refs.freeRangeDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitFreeRangeDialog();
    });

    if (this.refs.freeRangeDialogDelete) {
      this.refs.freeRangeDialogDelete.addEventListener("click", async () => {
        await this.deleteFreeRangeFromDialog();
      });
    }

    this.refs.freeRangeDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeFreeRangeDialog();
    });

    this.refs.freeRangeList.addEventListener("click", (event) => {
      const row = event.target.closest("li[data-clickable='1']");
      if (!row) {
        return;
      }
      const year = this.activeSchoolYear;
      if (!year) {
        return;
      }
      const id = Number(row.dataset.id || 0);
      const presetLabel = String(row.dataset.label || "").trim();
      const occurrence = Number(row.dataset.occurrence || 0);
      if (id) {
        this.openFreeRangeDialog(id);
      } else if (presetLabel) {
        this.openFreeRangeDialog(null, presetLabel, occurrence);
      }
    });

    this.refs.specialDayDialogCancel.addEventListener("click", () => {
      this.closeSpecialDayDialog();
    });

    this.refs.specialDayDialogName.addEventListener("change", () => {
      this.applySuggestedSpecialDayDateInDialog();
    });

    this.refs.specialDayDialogName.addEventListener("blur", () => {
      this.applySuggestedSpecialDayDateInDialog();
    });

    this.refs.specialDayDialogForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitSpecialDayDialog();
    });

    this.refs.specialDayDialogDelete.addEventListener("click", async () => {
      await this.deleteSpecialDayFromDialog();
    });

    this.refs.specialDayDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeSpecialDayDialog();
    });

    this.refs.specialDayList.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      const action = actionButton ? actionButton.dataset.action : "";
      if (action === "add") {
        if (this.activeSchoolYear) {
          this.openSpecialDayDialog();
        }
        return;
      }
      const row = event.target.closest("li[data-special-day-id]");
      if (!row || !this.activeSchoolYear) {
        return;
      }
      const id = Number(row.dataset.specialDayId || 0);
      if (!id) {
        return;
      }
      this.openSpecialDayDialog(id);
    });

    this.refs.courseTable.addEventListener("change", (event) => {
      const input = event.target.closest("input.course-topic-input");
      if (!input) {
        return;
      }
      this.saveCourseTopicInput(input);
    });

    this.refs.courseTable.addEventListener("keydown", (event) => {
      this.handleCourseTopicInputKeyDown(event);
    });

    this.refs.courseTable.addEventListener("click", async (event) => {
      this.hideContextMenu();
      const performanceEntryButton = event.target.closest("button.course-performance-entry-trigger[data-performance-entry-lesson-id]");
      if (performanceEntryButton) {
        const lessonId = Number(performanceEntryButton.dataset.performanceEntryLessonId || 0);
        const triggerMode = String(performanceEntryButton.dataset.performanceEntryMode || "entry").trim();
        if (lessonId) {
          void this.requestPerformanceNavigation(lessonId, triggerMode);
        }
        return;
      }
      const notesEditButton = event.target.closest("button.course-notes-edit[data-lesson-id]");
      if (notesEditButton) {
        const lessonId = Number(notesEditButton.dataset.lessonId || 0);
        if (lessonId) {
          this.openTopicDialog(lessonId);
        }
        return;
      }
      const topicInput = event.target.closest("input.course-topic-input");
      if (topicInput && !topicInput.disabled) {
        topicInput.focus();
        if (topicInput.selectionStart === topicInput.selectionEnd) {
          topicInput.select();
        }
        return;
      }
      const dateButton = event.target.closest("button.course-date-link[data-date]");
      if (dateButton) {
        if (!await this.resolveUnsavedSettingsNavigation()) {
          return;
        }
        const targetWeek = this._clampWeekStart(weekStartFor(dateButton.dataset.date));
        if (targetWeek !== this.weekStartIso) {
          this.weekStartIso = targetWeek;
        }
        this.selectedLessonId = null;
        await this.switchView("week");
        this.renderWeekSection();
        this.renderLessonSection();
      }
    });

    this.refs.courseTable.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (event.button !== 2) {
        this.hideContextMenu();
        return;
      }
      if (this.locked) {
        this.hideContextMenu();
        return;
      }
      const row = event.target.closest("tr[data-lesson-id]");
      if (!row) {
        this.hideContextMenu();
        return;
      }
      const lessonId = Number(row.dataset.lessonId);
      const lesson = this.store.getLessonById(lessonId);
      if (!lesson) {
        this.hideContextMenu();
        return;
      }
      const block = this.store.getLessonBlock(lessonId);
      if (block.length === 0 || block.every((entry) => entry.canceled)) {
        this.hideContextMenu();
        return;
      }
      this.openWeekBlockContextMenu(lessonId, event.clientX, event.clientY, "course");
    });


    document.addEventListener("selectstart", (event) => {
      const target = this._getEventTargetElement(event.target);
      const editable = Boolean(
        target
        && target.closest("input, textarea, select, [contenteditable='true']")
      );
      if (!editable) {
        event.preventDefault();
      }
    });

    window.addEventListener("resize", () => {
      if (!this.isFreshContextMenu()) {
        this.hideContextMenu();
      }
      if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
        this.positionWeekCalendarDialog();
      }
      if (this.currentView === "week") {
        this.scheduleWeekLayoutScale();
      }
    });

    window.addEventListener("scroll", () => {
      if (!this.isFreshContextMenu()) {
        this.hideContextMenu();
      }
      if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
        this.closeWeekCalendarDialog();
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.hideContextMenu();
        return;
      }
      const key = String(event.key || "").toLowerCase();
      const copyPressed = (event.ctrlKey || event.metaKey) && !event.altKey && key === "c";
      if (!copyPressed) {
        return;
      }
      const target = event.target;
      const editable = Boolean(
        target
        && target.closest
        && target.closest("input, textarea, select, [contenteditable='true']")
      );
      if (editable) {
        return;
      }
      const title = this.getSelectedWeekLessonTitle();
      if (!title) {
        return;
      }
      event.preventDefault();
      void this.writeClipboardText(title);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!this.beforeUnloadWarningEnabled) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    });
    this.bindTouchContextMenus();
  }

  bindTouchContextMenus() {
    const findNonEditableTarget = (event, selector) => {
      const target = this._getEventTargetElement(event.target);
      if (!target || target.closest("input, textarea, select, [contenteditable='true']")) {
        return null;
      }
      return target.closest(selector);
    };
    const bindCourseList = (list) => installTouchLongPress(list, {
      getTarget: (event) => findNonEditableTarget(event, "li[data-course-id]"),
      onLongPress: ({ target, clientX, clientY }) => {
        if (this.locked) return;
        const courseId = Number(target.dataset.courseId || 0);
        if (!courseId) return;
        this.selectedCourseId = courseId;
        this.openCourseContextMenu(courseId, clientX, clientY);
      },
    });

    this.touchContextMenuCleanups = [
      bindCourseList(this.refs.sidebarCourseList),
      bindCourseList(this.refs.courseList),
      installTouchLongPress(this.refs.weekTable, {
        getTarget: (event) => findNonEditableTarget(event, ".lesson-block[data-lesson-id]"),
        onLongPress: ({ target, clientX, clientY }) => {
          if (this.locked || target.matches("button:disabled")) return;
          const lessonId = Number(target.dataset.lessonId || 0);
          if (!lessonId) return;
          this.openWeekBlockContextMenu(lessonId, clientX, clientY, "week");
        },
      }),
      installTouchLongPress(this.refs.courseTable, {
        getTarget: (event) => findNonEditableTarget(event, "tr[data-lesson-id]"),
        onLongPress: ({ target, clientX, clientY }) => {
          if (this.locked) return;
          const lessonId = Number(target.dataset.lessonId || 0);
          const lesson = this.store.getLessonById(lessonId);
          const block = lesson ? this.store.getLessonBlock(lessonId) : [];
          if (!lesson || block.length === 0 || block.every((entry) => entry.canceled)) return;
          this.openWeekBlockContextMenu(lessonId, clientX, clientY, "course");
        },
      }),
    ];
  }

  handleWeekEmptySlotPointerDown(event) {
    if (this.locked || event?.button !== 0) {
      return false;
    }
    const dayCell = event.target?.closest?.("[data-week-empty='1'][data-day][data-hour]");
    if (!dayCell) {
      this.lastWeekEmptySlotPointerDown = null;
      return false;
    }
    const day = Number(dayCell.dataset.day);
    const hour = Number(dayCell.dataset.hour);
    if (!day || !hour) {
      this.lastWeekEmptySlotPointerDown = null;
      return false;
    }
    const now = Date.now();
    const key = `${day}:${hour}`;
    const previous = this.lastWeekEmptySlotPointerDown;
    this.lastWeekEmptySlotPointerDown = { key, at: now };
    if (!previous || previous.key !== key || now - previous.at > 700) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this.lastWeekEmptySlotPointerDown = null;
    this.weekEmptySlotDialogOpenedAt = now;
    void this.openSlotDialogForCreate(day, hour);
    return true;
  }

  _getEventTargetElement(target) {
    if (target instanceof Element) {
      return target;
    }
    if (target instanceof Node) {
      return target.parentElement;
    }
    return null;
  }

  setBackupStatus(text, isError = false) {
    if (!this.refs.backupStatus) {
      return;
    }
    this.refs.backupStatus.textContent = text || "";
    this.refs.backupStatus.style.color = isError ? "#ff8a8a" : "";
  }

  formatDateTime(isoDateTime) {
    if (!isoDateTime) {
      return "";
    }
    const value = new Date(isoDateTime);
    if (Number.isNaN(value.getTime())) {
      return "";
    }
    return value.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async saveManualDatabase(options = {}) {
    const result = await this.executeWorkspaceAction("manual-save", options);
    return Boolean(result.changed);
  }

  async persistExplicitDatabaseSave(reason = "planning-dialog-save") {
    try {
      const result = await this.executeWorkspaceAction("explicit-save", { reason });
      return Boolean(result.changed);
    } catch (_error) {
      await this.showInfoMessage("Änderung übernommen, aber die Datenbankdatei konnte nicht gespeichert werden.", "Datenbank speichern");
      return false;
    }
  }

  async createEmptyManualDatabase(options = {}) {
    const result = await this.executeWorkspaceAction("manual-create-empty", options);
    return Boolean(result.changed);
  }

  getDefaultInitialSchoolYearStartYear() {
    const fromRuntime = Number(this.getWorkspaceRuntime()?.getDefaultSchoolYearStartYear?.());
    if (Number.isInteger(fromRuntime)) return fromRuntime;
    const today = new Date();
    return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  }

  async chooseInitialDatabaseSchoolYear() {
    const defaultStartYear = this.getDefaultInitialSchoolYearStartYear();
    const options = [defaultStartYear - 1, defaultStartYear, defaultStartYear + 1];
    const selected = await this.showSelectMessage(
      "Wähle das erste Schuljahr für die neue Datenbank.",
      String(defaultStartYear),
      {
        title: "Schuljahr für neue Datenbank",
        inputLabel: "Schuljahr",
        okText: "Weiter",
        selectOptions: options.map((startYear) => ({
          value: String(startYear),
          label: `${startYear}/${startYear + 1}`,
        })),
      }
    );
    if (selected === null) return null;
    return Number(selected) || null;
  }

  async prepareEmptyDatabaseRestart() {
    const workspaceUnsaved = this.workspaceController?.getSnapshot?.("shell")?.unsaved || {};
    const hasUnsavedChanges = Boolean(workspaceUnsaved.dirty || this.settingsDirty);
    if (hasUnsavedChanges) {
      const choice = await this.showChoiceMessage(
        "Die aktuelle Datenbank enthält ungespeicherte Änderungen.",
        {
          title: "Neue leere Datenbank",
          okText: "Speichern",
          cancelText: "Abbrechen",
          alternateText: "Verwerfen & neu starten",
          dangerAlternate: true,
          warning: true,
        }
      );
      if (choice === "ok") {
        if (this.settingsDirty && !await this.applySettingsDraftToStore()) return false;
        if (this.isManualPersistenceMode()) return this.saveManualDatabase();
        const result = await this.executeWorkspaceAction("sync-save", { reason: "before-create-empty" });
        return Boolean(result.changed);
      }
      if (choice !== "discard") return false;
      if (this.settingsDirty) this.cancelSettingsDraftChanges();
      return true;
    }
    return this.showConfirmMessage(
      "Die bisherige Datenbankdatei bleibt unverändert. Danach arbeitest du mit einer neuen leeren Datenbank.",
      { title: "Neue leere Datenbank", okText: "Neu starten", dangerOk: true }
    );
  }

  async startEmptyDatabase() {
    const schoolYearStart = await this.chooseInitialDatabaseSchoolYear();
    if (!schoolYearStart) return false;
    if (!await this.prepareEmptyDatabaseRestart()) return false;
    const created = this.isManualPersistenceMode()
      ? await this.createEmptyManualDatabase({ schoolYearStart })
      : await this.selectSyncFile("new-empty", { schoolYearStart });
    if (created) this.renderAll();
    return created;
  }

  async loadManualDatabaseFromFile(file) {
    const result = await this.executeWorkspaceAction("manual-load", { file });
    return Boolean(result.changed);
  }

  async createLatestWebBackup(mode = "manual", silent = false) {
    const result = await this.executeWorkspaceAction("backup-create", { mode, silent });
    return Boolean(result.changed);
  }

  async maybeRunAutomaticWebBackup() {
    const result = await this.executeWorkspaceAction("backup-auto");
    return Boolean(result.changed);
  }

  async restoreLatestWebBackup() {
    const result = await this.executeWorkspaceAction("backup-restore");
    return Boolean(result.changed);
  }

  exportBackup() {
    void this.executeWorkspaceAction("backup-export").catch(() => undefined);
    return true;
  }

  async importBackupFromFile(file) {
    const result = await this.executeWorkspaceAction("backup-import", { file });
    return Boolean(result.changed);
  }

  renderDatabaseSection() {
    const persistence = this.getWorkspacePersistenceStatus();
    const unsupported = !this.isExternalFileSyncPresentationSupported();
    const startupDatabaseLoading = !unsupported
      && !persistence.initialized
      && !persistence.connected
      && Boolean(persistence.pendingFileName || persistence.fileName);
    const pendingStoredFileName = !persistence.connected
      ? String(persistence.pendingFileName || persistence.fileName || "")
      : "";
    const hasKnownLoadingFile = Boolean(pendingStoredFileName);
    const loadingStatusText = hasKnownLoadingFile
      ? "Verbundene Datenbank wird geladen..."
      : "Gespeicherte Datenbank wird geladen...";
    const disconnectedStatusTexts = new Set([
      "Bitte Datenbankdatei erneut auswählen.",
      "Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben.",
      "Verbundene Datenbank wird geladen...",
      "Gespeicherte Datenbank wird geladen..."
    ]);
    const hasConnectedStatusText = (statusText) => statusText === "Datenbankdatei verbunden.";
    if (this.refs.dbAutoActions) {
      this.refs.dbAutoActions.hidden = unsupported;
    }
    if (this.refs.dbManualActions) {
      this.refs.dbManualActions.hidden = !unsupported;
    }
    if (this.refs.dbManualHint) {
      this.refs.dbManualHint.hidden = !unsupported;
    }
    if (this.refs.dbBackupSection) {
      this.refs.dbBackupSection.hidden = unsupported;
    }
    if (this.refs.syncFileName) {
      if (unsupported) {
        this.refs.syncFileName.textContent = persistence.fileName
          ? `Datenbankdatei: ${persistence.fileName}`
          : "Datenbankdatei: nicht geladen";
      } else if (this.tutorialDemoMode) {
        this.refs.syncFileName.textContent = "Datenbankdatei: Tutorial-Vorschau (nicht verbunden)";
      } else if (startupDatabaseLoading && hasKnownLoadingFile) {
        this.refs.syncFileName.textContent = `Datenbankdatei: ${pendingStoredFileName} (wird geladen)`;
      } else if (pendingStoredFileName && !startupDatabaseLoading) {
        this.refs.syncFileName.textContent = `Datenbankdatei: ${pendingStoredFileName} (Zugriff ausstehend)`;
      } else if (!persistence.connected) {
        this.refs.syncFileName.textContent = "Datenbankdatei: nicht ausgewählt";
      } else {
        const connectedFileName = String(persistence.fileName || "").trim();
        this.refs.syncFileName.textContent = connectedFileName
          ? `Datenbankdatei: ${connectedFileName}`
          : "Datenbankdatei.";
      }
    }
    if (this.refs.syncFileStatus) {
      const currentStatus = String(this.refs.syncFileStatus.textContent || "").trim();
      if (unsupported) {
        this.setSyncStatus("");
      } else if (startupDatabaseLoading) {
        if (!currentStatus || hasConnectedStatusText(currentStatus) || disconnectedStatusTexts.has(currentStatus)) {
          this.setSyncStatus(loadingStatusText);
        }
      } else if (!persistence.connected) {
        if (!currentStatus || hasConnectedStatusText(currentStatus)) {
          this.setSyncStatus(
            pendingStoredFileName
              ? "Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben."
              : ""
          );
        }
      } else {
        if (
          disconnectedStatusTexts.has(currentStatus)
          || currentStatus === "Datenbankdatei verbunden."
        ) {
          this.setSyncStatus("");
        }
      }
    }
    const allowDatabaseControls = this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired";
    const highlightManualDatabaseActions = unsupported
      && this.shouldPromptForManualDatabaseOnStartup()
      && this.currentView === "settings"
      && this.activeSettingsTab === "database";
    const disabled = unsupported || (this.locked && !allowDatabaseControls);
      const shouldPulse = !unsupported
      && persistence.initialized
      && this.locked
      && this.lockReason === "databaseRequired";
    if (this.refs.dbSelectExistingBtn) {
      this.refs.dbSelectExistingBtn.disabled = disabled;
      this.refs.dbSelectExistingBtn.classList.toggle("attention-pulse", shouldPulse);
    }
    if (this.refs.dbCreateNewBtn) {
      this.refs.dbCreateNewBtn.disabled = disabled;
      this.refs.dbCreateNewBtn.classList.toggle("attention-pulse", shouldPulse);
    }
    if (this.refs.dbManualLoadBtn) {
      this.refs.dbManualLoadBtn.disabled = false;
      this.refs.dbManualLoadBtn.classList.toggle("manual-start-highlight", highlightManualDatabaseActions);
      this.refs.dbManualLoadBtn.classList.toggle("attention-pulse", highlightManualDatabaseActions);
    }
    if (this.refs.dbManualSaveBtn) {
      this.refs.dbManualSaveBtn.disabled = false;
      this.refs.dbManualSaveBtn.classList.toggle("manual-start-highlight", highlightManualDatabaseActions);
      this.refs.dbManualSaveBtn.classList.toggle("attention-pulse", highlightManualDatabaseActions);
    }

    this.updateSettingsActionButtons();
  }

  renderBackupSection() {
    const hasBackupTabControls = Boolean(this.refs.backupAutoEnabled && this.refs.backupIntervalDays);
    const hasDatabaseTabControls = Boolean(this.refs.dbBackupAutoEnabled && this.refs.dbBackupIntervalDays);
    if (!hasBackupTabControls && !hasDatabaseTabControls) {
      return;
    }
    const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
    const persistence = this.getWorkspacePersistenceStatus();
    const enabled = Boolean(draft.backupEnabled);
    const interval = clamp(Number(draft.backupIntervalDays) || BACKUP_INTERVAL_DEFAULT_DAYS, 1, 30);
    const presentationSupported = this.isExternalFileSyncPresentationSupported();
    const syncFileConnected = this.tutorialDemoMode || Boolean(persistence.connected);
    const backupFileConnected = this.tutorialDemoMode || Boolean(persistence.backupConnected);
    const backupSettingsAvailable = presentationSupported && syncFileConnected;
    if (this.refs.backupDirName) {
      const directoryName = String(persistence.backupDirectoryName || "").trim();
      this.refs.backupDirName.textContent = directoryName
        ? `Backup-Ordner: ${directoryName}`
        : "Backup-Ordner: nicht verbunden";
    }
    if (!presentationSupported) {
      this.setBackupStatus("");
    }
    if (this.refs.backupDirChangeBtn) {
      this.refs.backupDirChangeBtn.disabled = !presentationSupported || !syncFileConnected;
      this.refs.backupDirChangeBtn.classList.toggle(
        "attention-pulse",
        presentationSupported && syncFileConnected && !backupFileConnected
      );
    }
    if (this.refs.backupAutoEnabled) {
      this.refs.backupAutoEnabled.checked = enabled;
      this.refs.backupAutoEnabled.disabled = !backupSettingsAvailable;
      this.refs.backupAutoEnabled.closest(".settings-inline-checkbox")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
      this.refs.backupAutoEnabled.closest(".settings-form-row")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
    }
    if (this.refs.backupIntervalDays) {
      this.refs.backupIntervalDays.value = String(interval);
      this.refs.backupIntervalDays.disabled = !backupSettingsAvailable || !enabled;
      this.refs.backupIntervalDays.closest(".settings-form-row")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
    }
    if (this.refs.dbBackupAutoEnabled) {
      this.refs.dbBackupAutoEnabled.checked = enabled;
      this.refs.dbBackupAutoEnabled.disabled = !backupSettingsAvailable;
      this.refs.dbBackupAutoEnabled.closest(".settings-inline-checkbox")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
      this.refs.dbBackupAutoEnabled.closest(".settings-form-row")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
    }
    if (this.refs.dbBackupIntervalDays) {
      this.refs.dbBackupIntervalDays.value = String(interval);
      this.refs.dbBackupIntervalDays.disabled = !backupSettingsAvailable || !enabled;
      this.refs.dbBackupIntervalDays.closest(".settings-form-row")?.classList.toggle(
        "is-disabled",
        !backupSettingsAvailable
      );
    }
    if (this.refs.backupNowBtn) {
      this.refs.backupNowBtn.disabled = !backupFileConnected;
    }
    if (this.refs.dbBackupNowBtn) {
      this.refs.dbBackupNowBtn.disabled = !backupFileConnected;
    }

    let snapshotAvailable = false;
    if (this.refs.backupRestoreBtn) {
      this.refs.backupRestoreBtn.disabled = !snapshotAvailable;
    }
    if (this.refs.backupResetDefaults) {
      const isDefaultConfig = enabled === BACKUP_ENABLED_DEFAULT
        && interval === BACKUP_INTERVAL_DEFAULT_DAYS;
      this.refs.backupResetDefaults.disabled = isDefaultConfig;
    }

    if (this.refs.backupHint) {
      this.refs.backupHint.textContent = "";
      this.refs.backupHint.classList.remove("backup-due");
    }
    this.syncAllNumberSteppers();
    this.updateSettingsActionButtons();
  }

  syncSlotEditTools() {
    const isEditing = Boolean(this.refs.slotId.value);
    const recurrenceNone = Number(this.refs.slotParity.value || 0) === -1;
    this.refs.slotEditTools.hidden = !isEditing;
    this.refs.slotDelete.hidden = !isEditing;
    if (!isEditing) {
      this.refs.slotEditScope.value = "all";
      this.refs.slotEditFromDate.value = "";
      this.refs.slotEditFromDate.disabled = true;
      this.refs.slotStart.disabled = false;
      this.refs.slotEnd.disabled = recurrenceNone;
      if (recurrenceNone) {
        this.refs.slotEnd.value = this.refs.slotStart.value || "";
      }
      return;
    }
    const fromScope = this.refs.slotEditScope.value === "from";
    this.refs.slotEditFromDate.disabled = !fromScope;
    this.refs.slotStart.disabled = fromScope;
    if (fromScope && this.refs.slotEditFromDate.value) {
      this.refs.slotStart.value = this.refs.slotEditFromDate.value;
    }
    if (recurrenceNone) {
      this.refs.slotEnd.value = this.refs.slotStart.value || "";
    }
    this.refs.slotEnd.disabled = recurrenceNone;
  }

  prefillSlotFromGrid(dayOfWeek, startHour) {
    const year = this.activeSchoolYear;
    this.switchView("settings");
    this.refs.slotId.value = "";
    this.refs.slotDay.value = String(dayOfWeek);
    this.refs.slotHour.value = String(startHour);
    if (this.selectedCourseId) {
      this.refs.slotCourse.value = String(this.selectedCourseId);
    }
    this.refs.slotDuration.value = "1";
    this.refs.slotParity.value = "0";
    if (year) {
      let startDefault = addDays(this.weekStartIso, Number(dayOfWeek) - 1);
      if (startDefault < year.startDate) {
        startDefault = year.startDate;
      }
      if (startDefault > year.endDate) {
        startDefault = year.endDate;
      }
      const endDefault = this._computeSlotEndDefault(startDefault);

      this.refs.slotStart.value = startDefault;
      this.refs.slotEnd.value = endDefault;
    } else {
      this.refs.slotStart.value = "";
      this.refs.slotEnd.value = "";
    }
    this.syncSlotEditTools();
  }

  prefillSlotForEdit(slot, clickedDate = null) {
    const year = this.activeSchoolYear;
    if (!slot || !year) {
      return;
    }
    this.switchView("settings");
    this.refs.slotId.value = String(slot.id);
    this.refs.slotCourse.value = String(slot.courseId);
    this.refs.slotDay.value = String(slot.dayOfWeek);
    this.refs.slotHour.value = String(slot.startHour);
    this.refs.slotDuration.value = String(slot.duration);
    this.refs.slotStart.value = slot.startDate || "";
    this.refs.slotEnd.value = slot.endDate || "";
    let displayParity = Number(slot.weekParity || 0);
    if (displayParity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
      displayParity = -1;
    }
    this.refs.slotParity.value = String(displayParity);
    this.refs.slotEditScope.value = "all";

    const slotStart = slot.startDate || year.startDate;
    const slotEnd = slot.endDate || year.endDate;
    this.refs.slotEditFromDate.min = slotStart;
    this.refs.slotEditFromDate.max = slotEnd;

    let defaultFrom = this.weekStartIso > slotStart ? this.weekStartIso : slotStart;
    if (clickedDate && clickedDate >= slotStart && clickedDate <= slotEnd) {
      defaultFrom = clickedDate;
      this.refs.slotEditScope.value = "from";
    }
    this.refs.slotEditFromDate.value = defaultFrom > slotEnd ? slotEnd : defaultFrom;
    this.syncSlotEditTools();
  }

  hideContextMenu() {
    const menu = this.refs.contextMenu;
    if (!menu) {
      return;
    }
    this.contextMenuGeneration = Number(this.contextMenuGeneration || 0) + 1;
    this.contextMenuOpenedAt = 0;
    menu.hidden = true;
    menu.removeAttribute("open");
    menu.innerHTML = "";
    this.contextMenuItems = [];
  }

  isFreshContextMenu(maxAgeMs = 250) {
    const menu = this.refs.contextMenu;
    const openedAt = Number(this.contextMenuOpenedAt || 0);
    return Boolean(
      menu
      && !menu.hidden
      && openedAt > 0
      && Date.now() - openedAt < Math.max(0, Number(maxAgeMs) || 0)
    );
  }

  isContextMenuOpeningTarget(target) {
    const guard = this.contextMenuClickGuard;
    if (!guard || Date.now() > Number(guard.expiresAt || 0)) {
      this.contextMenuClickGuard = null;
      return false;
    }
    const guardedTarget = guard.target;
    return guardedTarget instanceof Node
      && target instanceof Node
      && (
        guardedTarget === target
        || guardedTarget.contains(target)
        || target.contains(guardedTarget)
      );
  }

  showContextMenu(items, clientX, clientY) {
    const menu = this.refs.contextMenu;
    if (!menu) {
      return;
    }
    const available = (items || []).filter((item) => item && item.label);
    if (available.length === 0) {
      this.hideContextMenu();
      return;
    }
    document.__teachhelperAppTooltipsController?.hide?.();
    const generation = Number(this.contextMenuGeneration || 0) + 1;
    this.contextMenuGeneration = generation;
    this.contextMenuOpenedAt = Date.now();
    this.contextMenuItems = available;
    menu.innerHTML = "";
    menu.removeAttribute("data-tutorial-anchor");
    for (const item of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "context-item";
      button.textContent = item.label;
      if (item.action) {
        button.dataset.contextAction = String(item.action);
      }
      if (item.tutorialAnchor) {
        button.dataset.tutorialAnchor = String(item.tutorialAnchor);
      }
      if (item.separatorBefore) {
        button.classList.add("separator-before");
      }
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", async () => {
        this.hideContextMenu();
        if (item.disabled || typeof item.handler !== "function") {
          return;
        }
        await item.handler();
      });
      menu.append(button);
    }
    const anchorX = Math.round(Number(clientX) || 0);
    const anchorY = Math.round(Number(clientY) || 0);
    menu.style.left = `${anchorX}px`;
    menu.style.top = `${anchorY}px`;
    menu.hidden = false;
    requestAnimationFrame(() => {
      if (
        generation !== this.contextMenuGeneration
        || !this.refs.contextMenu
        || this.refs.contextMenu.hidden
      ) {
        return;
      }
      const menuRect = menu.getBoundingClientRect();
      const coordinateOffsetX = menuRect.left - anchorX;
      const coordinateOffsetY = menuRect.top - anchorY;
      const margin = 8;
      const maxX = window.innerWidth - menuRect.width - margin;
      const maxY = window.innerHeight - menuRect.height - margin;
      const desiredLeft = clamp(anchorX, margin, Math.max(margin, maxX));
      const desiredTop = clamp(anchorY, margin, Math.max(margin, maxY));
      const left = desiredLeft - coordinateOffsetX;
      const top = desiredTop - coordinateOffsetY;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    });
    return generation;
  }

  async writeClipboardText(text) {
    const normalized = String(text || "");
    this.localClipboardText = normalized;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(normalized);
      }
    } catch (_error) {
      return;
    }
  }

  async readClipboardText() {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        const text = await navigator.clipboard.readText();
        if (text || text === "") {
          this.localClipboardText = text;
          return text;
        }
      }
    } catch (_error) {
      return this.localClipboardText || "";
    }
    return this.localClipboardText || "";
  }

  getSelectedWeekLessonTitle() {
    if (this.currentView !== "week") {
      return "";
    }
    const lessonId = Number(this.selectedLessonId || 0);
    if (!lessonId) {
      return "";
    }
    const lesson = this.store.getLessonById(lessonId);
    if (!lesson) {
      return "";
    }
    const block = this.store.getLessonBlock(lesson.id);
    if (!Array.isArray(block) || block.length === 0) {
      return "";
    }
    const allCanceled = block.every((entry) => entry.canceled);
    const anyCanceled = block.some((entry) => entry.canceled);
    const partialCanceled = anyCanceled && !allCanceled;
    const isNoLesson = Boolean(lesson.noLesson);
    const isEntfall = block.some((entry) => entry.isEntfall);
    const isWritten = block.some((entry) => entry.isWrittenExam);
    const topics = new Set(
      block
        .map((entry) => String(entry.topic || "").trim())
        .filter(Boolean)
    );
    let displayTopic = "";
    if (allCanceled && lesson.cancelLabel) {
      displayTopic = String(lesson.cancelLabel || "").trim();
    } else if (topics.size === 1) {
      displayTopic = [...topics][0];
    } else if (topics.size > 1) {
      displayTopic = "Mehrere Themen";
    }
    if (!allCanceled && (isEntfall || isWritten)) {
      displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
    }
    const displayText = allCanceled
      ? (String(lesson.cancelLabel || "").trim() || "Unterrichtsfrei")
      : formatPartialDisplay(displayTopic, partialCanceled);
    return String(displayText || "").trim();
  }

  resetInlineWeekBlockTopicEdit() {
    this.inlineTopicLessonId = null;
    this.inlineTopicDraft = "";
  }

  _getInlineWeekBlockTopicDraft(input) {
    if (!input) {
      return "";
    }
    return String(input.textContent || "").replace(/\u00a0/g, " ");
  }

  _selectAllInlineWeekBlockTopic(input) {
    if (!input || typeof document.createRange !== "function" || typeof window.getSelection !== "function") {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  _insertInlineWeekBlockTopicLineBreak(input) {
    if (!input || typeof window.getSelection !== "function") {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!input.contains(range.commonAncestorContainer)) {
      return;
    }
    range.deleteContents();
    const newline = document.createTextNode("\n");
    range.insertNode(newline);
    range.setStartAfter(newline);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  _moveCaretToInlineWeekBlockTopicEnd(input) {
    if (!input || typeof document.createRange !== "function" || typeof window.getSelection !== "function") {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  _limitInlineWeekBlockTopicLength(input, maxLength = 240) {
    const text = this._getInlineWeekBlockTopicDraft(input);
    if (text.length <= maxLength) {
      return text;
    }
    const clipped = text.slice(0, maxLength);
    input.textContent = clipped;
    this._moveCaretToInlineWeekBlockTopicEnd(input);
    return clipped;
  }

  syncInlineWeekBlockTopicInputSize(targetInput = null) {
    const input = targetInput
      || (
        this.refs.weekTable
          ? this.refs.weekTable.querySelector(
            `.week-inline-topic-input[data-lesson-id="${Number(this.inlineTopicLessonId || 0)}"]`
          )
          : null
      );
    if (!input) {
      return;
    }
    input.style.maxHeight = "100%";
  }

  startInlineWeekBlockTopicEdit(lessonId, options = {}) {
    const selectAll = Boolean(options && options.selectAll);
    const lesson = this.store.getLessonById(lessonId);
    if (!lesson) {
      return false;
    }
    const block = this.store.getLessonBlock(lesson.id);
    if (block.length === 0) {
      return false;
    }
    const allCanceled = block.every((entry) => entry.canceled);
    if (allCanceled) {
      return false;
    }
    const isEntfall = block.some((entry) => entry.isEntfall);
    const isWritten = block.some((entry) => entry.isWrittenExam);
    if (isEntfall || isWritten) {
      return false;
    }
    const firstTopic = block
      .map((entry) => String(entry.topic || "").trim())
      .find(Boolean) || "";
    this.inlineTopicLessonId = lesson.id;
    this.inlineTopicDraft = firstTopic;
    this.selectedLessonId = lesson.id;
    this.renderWeekTable();
    this.renderLessonSection();
    requestAnimationFrame(() => {
      const currentLessonId = Number(this.inlineTopicLessonId || 0);
      if (!currentLessonId || currentLessonId !== lesson.id || !this.refs.weekTable) {
        return;
      }
      const inlineTopicInput = this.refs.weekTable.querySelector(
        `.week-inline-topic-input[data-lesson-id="${currentLessonId}"]`
      );
      if (!inlineTopicInput) {
        return;
      }
      this.syncInlineWeekBlockTopicInputSize(inlineTopicInput);
      inlineTopicInput.focus();
      if (selectAll) {
        this._selectAllInlineWeekBlockTopic(inlineTopicInput);
      } else {
        this._moveCaretToInlineWeekBlockTopicEnd(inlineTopicInput);
      }
    });
    return true;
  }

  finishInlineWeekBlockTopicEdit(saveChanges = true, nextLessonId = null) {
    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === "function") {
      activeElement.blur();
    }
    const lessonId = Number(this.inlineTopicLessonId || 0);
    const nextInlineLessonId = Number(nextLessonId || 0);
    if (!lessonId) {
      this.resetInlineWeekBlockTopicEdit();
      if (nextInlineLessonId) {
        this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
      }
      return;
    }
    const nextTopic = String(this.inlineTopicDraft || "").trim();
    this.resetInlineWeekBlockTopicEdit();

    if (!saveChanges) {
      this.selectedLessonId = nextInlineLessonId || null;
      this.renderWeekTable();
      this.renderLessonSection();
      if (nextInlineLessonId) {
        this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
      }
      return;
    }

    const lesson = this.store.getLessonById(lessonId);
    const block = lesson ? this.store.getLessonBlock(lesson.id) : [];
    const blocked = !lesson
      || block.length === 0
      || block.every((entry) => entry.canceled)
      || block.some((entry) => entry.isEntfall || entry.isWrittenExam);
    if (!blocked) {
      this.store.updateLessonBlock(lessonId, {
        topic: nextTopic
      });
    }
    this.selectedLessonId = nextInlineLessonId || null;
    this.renderWeekSection();
    this.renderLessonSection();
    this.renderCourseTimeline();
    if (nextInlineLessonId) {
      this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
    }
  }

  promptEditWeekBlockTopic(lessonId) {
    return this.startInlineWeekBlockTopicEdit(lessonId) || this.openTopicDialog(lessonId);
  }

  openWeekBlockContextMenu(lessonId, clientX, clientY, source = "week") {
    const lesson = this.store.getLessonById(lessonId);
    if (!lesson) {
      return;
    }
    const block = this.store.getLessonBlock(lesson.id);
    if (block.length === 0) {
      return;
    }
    const allCanceled = block.every((entry) => entry.canceled);
    if (allCanceled) {
      return;
    }
    const isNoLesson = Boolean(lesson.noLesson);
    const isEntfall = block.some((entry) => entry.isEntfall);
    const isWritten = block.some((entry) => entry.isWrittenExam);
    const editable = !allCanceled;
    const isTopicEditable = editable && !(isEntfall || isWritten);
    const slotId = lesson.slotId ? Number(lesson.slotId) : null;
    const courseId = lesson.courseId ? Number(lesson.courseId) : null;
    const startLessonId = lesson.id ? Number(lesson.id) : null;
    const clickedDate = lesson.lessonDate || null;
    const distinctTopics = [...new Set(
      block
        .map((entry) => String(entry.topic || "").trim())
        .filter(Boolean)
    )];
    const hasNotes = block.some((entry) => Boolean(String(entry.notes || "").trim()));
    let rawTopic = "";
    if (distinctTopics.length === 1) {
      rawTopic = distinctTopics[0];
    }
    if (isEntfall || isWritten) {
      rawTopic = overrideTopicForFlags(rawTopic, isEntfall, isWritten);
    }
    const hasContent = source === "week"
      ? distinctTopics.length > 0 || hasNotes || isEntfall || isWritten
      : Boolean(rawTopic) || hasNotes || isEntfall || isWritten;
    const clipboardText = this.localClipboardText || "";
    const canPaste = isTopicEditable && Boolean(String(clipboardText).trim());
    const menuGeneration = this.showContextMenu(
        [
          {
            label: "Kopieren",
            disabled: !Boolean(rawTopic),
            handler: async () => {
              await this.writeClipboardText(rawTopic);
            }
          },
          {
            label: "Einfügen",
            action: "paste-topic",
            disabled: !canPaste,
            handler: async () => {
              const text = String(await this.readClipboardText()).trim();
              if (!text) {
                return;
              }
              this.store.updateLessonBlock(lesson.id, {
                topic: text
              });
              this.renderWeekSection();
              this.renderLessonSection();
              this.renderCourseTimeline();
            }
          },
          {
            label: "Detailplanung bearbeiten",
            disabled: !editable,
            handler: () => {
              this.openTopicDialog(lesson.id);
            }
          },
          {
            label: "Serie anpassen",
            separatorBefore: true,
            disabled: !slotId || isNoLesson,
            handler: async () => {
              const slot = this.store.getSlot(slotId);
              if (!slot) {
                return;
              }
              await this.openSlotDialogForEdit(slot, clickedDate);
            }
          },
          {
            label: isWritten ? "Schriftliche Arbeit aufheben" : "Schriftliche Arbeit",
            disabled: !editable || isNoLesson,
            handler: async () => {
              if (isWritten) {
                this.store.updateLessonBlock(lesson.id, {
                  topic: "",
                  isEntfall: false,
                  isWrittenExam: false
                });
              } else {
                this.store.updateLessonBlock(lesson.id, {
                  topic: WRITTEN_EXAM_TOPIC,
                  isEntfall: false,
                  isWrittenExam: true
                });
              }
              this.renderWeekSection();
              this.renderLessonSection();
              this.renderCourseTimeline();
            }
          },
          {
            label: isEntfall ? "Entfall aufheben" : "Entfall",
            disabled: !editable,
            handler: async () => {
              if (isEntfall) {
                this.store.updateLessonBlock(lesson.id, {
                  topic: "",
                  isEntfall: false,
                  isWrittenExam: false
                });
              } else {
                this.openEntfallDialog(lesson.id);
                return;
              }
              this.renderWeekSection();
              this.renderLessonSection();
              this.renderCourseTimeline();
            }
          },
          {
            label: "Planung in Zukunft verschieben",
            disabled: !editable || !hasContent || !courseId || !startLessonId,
            handler: async () => {
              const year = this.activeSchoolYear;
              if (!year || !courseId || !startLessonId) {
                return;
              }
              const result = this.store.shiftCourseTopicsForward(year.id, courseId, startLessonId);
              if (!result.success && result.message) {
                await this.showInfoMessage(result.message);
              }
              this.renderWeekSection();
              this.renderLessonSection();
              this.renderCourseTimeline();
            }
          },
          {
            label: "Planung in Vergangenheit verschieben",
            disabled: !editable || !hasContent || !courseId || !startLessonId,
            handler: async () => {
              const year = this.activeSchoolYear;
              if (!year || !courseId || !startLessonId) {
                return;
              }
              const result = this.store.shiftCourseTopicsBackward(year.id, courseId, startLessonId);
              if (!result.success && result.message) {
                await this.showInfoMessage(result.message);
              }
              this.renderWeekSection();
              this.renderLessonSection();
              this.renderCourseTimeline();
            }
          }
        ],
        clientX,
        clientY
      );
    void this.readClipboardText().then((latestClipboardText) => {
      if (
        menuGeneration !== this.contextMenuGeneration
        || !this.refs.contextMenu
        || this.refs.contextMenu.hidden
      ) {
        return;
      }
      const pasteButton = this.refs.contextMenu.querySelector(
        "button[data-context-action='paste-topic']"
      );
      const pasteItem = this.contextMenuItems.find(
        (item) => item.action === "paste-topic"
      );
      const pasteDisabled = !(
        isTopicEditable
        && Boolean(String(latestClipboardText || "").trim())
      );
      if (pasteItem) {
        pasteItem.disabled = pasteDisabled;
      }
      if (pasteButton) {
        pasteButton.disabled = pasteDisabled;
      }
    });
  }

  isSidebarEmptyContextTarget(target) {
    const element = this._getEventTargetElement(target);
    if (!element || !this.refs.sidebarPanel || !this.refs.sidebarPanel.contains(element)) {
      return false;
    }
    if (element.closest("#sidebar-course-list li[data-add-item='1']")) {
      return true;
    }
    if (
      element.closest(
        "button, input, textarea, select, a, label, [contenteditable='true'], .sidebar-header, .sidebar-controls"
      )
    ) {
      return false;
    }
    const courseRow = element.closest("#sidebar-course-list li[data-course-id]");
    if (courseRow && Number(courseRow.dataset.courseId || 0)) {
      return false;
    }
    return Boolean(element.closest("#sidebarPanel, .sidebar-section, #sidebar-course-list"));
  }

  openSidebarEmptyContextMenu(event) {
    if (!event || event.button !== 2 || this.locked || !this.isSidebarEmptyContextTarget(event.target)) {
      return false;
    }
    event.preventDefault();
    this.openSidebarSettingsContextMenu(event.clientX, event.clientY);
    return true;
  }

  openSidebarSettingsContextMenu(clientX, clientY) {
    const showHidden = Boolean(
      this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT)
    );
    this.showContextMenu(
      [
        {
          label: `${showHidden ? "✓ " : ""}Ausgeblendete Kurse in Randleiste anzeigen`,
          handler: async () => {
            await this.setShowHiddenSidebarCourses(!showHidden);
          }
        }
      ],
      clientX,
      clientY
    );
  }

  async setShowHiddenSidebarCourses(showHidden) {
    if (!this.workspacePublicLoaded) {
      await this.ensurePlanningPublicLoaded();
    }
    const nextValue = Boolean(showHidden);
    this.store.setSetting("showHiddenSidebarCourses", nextValue);
    if (this.settingsDraft) {
      this.settingsDraft.showHiddenSidebarCourses = nextValue;
    }
    this.refreshSettingsDirtyState();
    this.renderAll();
  }

  openCourseContextMenu(courseId, clientX, clientY) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id) {
      return;
    }
    const course = this.store.listCourses(year.id).find((item) => item.id === id);
    if (!course) {
      return;
    }
    const items = [
      {
        label: "Kursname bearbeiten",
        handler: async () => {
          await this.openCourseRenameDialog(id);
        }
      },
      {
        label: "Fach ändern",
        disabled: Boolean(course.noLesson),
        handler: async () => {
          await this.openCourseSubjectDialog(id);
        }
      },
      {
        label: "Farbe bearbeiten",
        disabled: Boolean(course.noLesson),
        handler: () => {
          this.openCourseColorDialog(id);
        }
      },
      {
        label: course.noLesson ? "Als Termin mit Unterricht" : "Als Termin ohne Unterricht",
        handler: async () => {
          await this.toggleCourseLessonMode(id);
        }
      },
      {
        label: course.hiddenInSidebar ? "In Randleiste einblenden" : "In Randleiste ausblenden",
        handler: async () => {
          if (!this.workspacePublicLoaded) {
            await this.ensurePlanningPublicLoaded();
          }
          await this.updateCourseFields(id, { hiddenInSidebar: !course.hiddenInSidebar });
          this.renderAll();
        }
      },
      {
        label: "Löschen",
        handler: async () => {
          await this.deleteCourseById(id);
        }
      }
    ];
    this.showContextMenu(
      items,
      clientX,
      clientY
    );
  }

  updateSidebarArchiveButtonState() {
    const actions = this.refs.sidebarArchiveActions;
    const button = this.refs.sidebarArchiveBtn;
    if (!actions || !button) {
      return;
    }
    const hasYear = Boolean(this.activeSchoolYear);
    const archiveTabContext = this.getArchiveTabContext();
    const isArchiveContext = archiveTabContext === "grades"
      || archiveTabContext === "planning"
      || this.currentView === "week"
      || this.currentView === "course";
    const isGradesArchiveContext = archiveTabContext === "grades";
    const databaseConnected = this.hasShellDatabaseConnection();
    const gradesEncryptedLocked = isGradesArchiveContext
      && this.shouldDisableArchiveGradeSelection();
    actions.hidden = !isArchiveContext;
    button.disabled = this.archiveExportInProgress
      || !databaseConnected
      || (isGradesArchiveContext && (!hasYear || this.locked || gradesEncryptedLocked));
    if (!databaseConnected) {
      button.title = "Archivieren erst nach Auswahl einer Datenbankdatei verfügbar";
    } else if (this.locked && isGradesArchiveContext) {
      button.title = ARCHIVE_LOCKED_TOOLTIP;
    } else if (gradesEncryptedLocked) {
      button.title = "Archivieren erst nach Entsperren des verschlüsselten Notenmoduls verfügbar";
    } else if (this.archiveExportInProgress) {
      button.title = "PDF-Export wird erstellt";
    } else {
      button.title = "PDF-Export des gesamten Schuljahres";
    }
    button.setAttribute("aria-label", "Archivieren");
  }

  bindArchiveDialogEvents() {
    const refs = this.refs;
    refs.archiveDialogCancel?.addEventListener("click", () => {
      if (!this.archiveExportInProgress) {
        this.closeDialog(refs.archiveDialog);
      }
    });
    refs.archiveDialogCancelTop?.addEventListener("click", () => {
      if (!this.archiveExportInProgress) {
        this.closeDialog(refs.archiveDialog);
      }
    });
    refs.archiveDialog?.addEventListener("cancel", (event) => {
      if (this.archiveExportInProgress) {
        event.preventDefault();
      }
    });
    refs.archiveDialog?.addEventListener("close", () => {
      this.setArchiveGradesLockedHintVisible(false);
    });
    [
      refs.archiveExportGrades,
      refs.archiveGradeBeMask,
      refs.archiveExportPlanning,
      refs.archivePlanningCourses,
      refs.archivePlanningWeeks,
      ...Array.from(refs.archiveGradeScopeInputs || [])
    ].filter(Boolean).forEach((input) => {
      input.addEventListener("change", () => {
        this.syncArchiveDialogState({ showValidation: false });
      });
    });
    refs.archiveDialogForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleArchiveGenerateRequest();
    });
  }

  handleArchiveOpenRequest(event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const isGradesArchiveContext = this.getArchiveTabContext() === "grades";
    const databaseConnected = this.hasShellDatabaseConnection();
    const gradesEncryptedLocked = isGradesArchiveContext
      && this.shouldDisableArchiveGradeSelection();
    if (
      this.archiveExportInProgress
      || !databaseConnected
      || (isGradesArchiveContext && (!this.activeSchoolYear || this.locked || gradesEncryptedLocked))
    ) {
      this.updateSidebarArchiveButtonState();
      return;
    }
    this.applyArchiveDialogDefaults();
    this.openDialog(this.refs.archiveDialog);
  }

  applyArchiveDialogDefaults() {
    const isGradesContext = this.getArchiveTabContext() === "grades";
    const gradesLockedForPlanning = this.shouldDisableArchiveGradeSelection();
    if (this.refs.archiveExportGrades) {
      this.refs.archiveExportGrades.checked = isGradesContext && !gradesLockedForPlanning;
    }
    if (this.refs.archiveExportPlanning) {
      this.refs.archiveExportPlanning.checked = !isGradesContext;
    }
    this.refs.archiveGradeScopeInputs?.forEach((input) => {
      input.checked = input.value === "categories";
    });
    if (this.refs.archiveGradeBeMask) {
      this.refs.archiveGradeBeMask.checked = true;
    }
    if (this.refs.archivePlanningCourses) {
      this.refs.archivePlanningCourses.checked = true;
    }
    if (this.refs.archivePlanningWeeks) {
      this.refs.archivePlanningWeeks.checked = true;
    }
    this.setArchiveDialogStatus("");
    this.syncArchiveDialogState({ showValidation: false, showLockedHint: true });
  }

  readArchiveDialogOptions() {
    const gradeScopeInput = Array.from(this.refs.archiveGradeScopeInputs || []).find((input) => input.checked);
    const exportGrades = Boolean(this.refs.archiveExportGrades?.checked);
    const exportPlanning = Boolean(this.refs.archiveExportPlanning?.checked);
    const gradeScope = gradeScopeInput?.value === "details" ? "details" : "categories";
    return {
      exportGrades,
      gradeScope,
      includeGradeDetails: exportGrades && gradeScope === "details",
      includeBeMask: exportGrades && gradeScope === "details" && Boolean(this.refs.archiveGradeBeMask?.checked),
      exportPlanning,
      includePlanningCourses: exportPlanning && Boolean(this.refs.archivePlanningCourses?.checked),
      includePlanningWeeks: exportPlanning && Boolean(this.refs.archivePlanningWeeks?.checked)
    };
  }

  validateArchiveDialogOptions(options = this.readArchiveDialogOptions()) {
    if (!options.exportGrades && !options.exportPlanning) {
      return "Bitte Noten oder Planung für den Export auswählen.";
    }
    if (options.exportPlanning && !options.includePlanningCourses && !options.includePlanningWeeks) {
      return "Bitte für die Planung Kursansichten oder Wochenansichten auswählen.";
    }
    return "";
  }

  syncArchiveDialogState(optionsArg = {}) {
    const showValidation = Boolean(optionsArg?.showValidation);
    const options = this.readArchiveDialogOptions();
    const gradesLockedForPlanning = this.shouldDisableArchiveGradeSelection();
    if (gradesLockedForPlanning && this.refs.archiveExportGrades?.checked) {
      this.refs.archiveExportGrades.checked = false;
    }
    if (!this.refs.archiveExportGrades?.checked && this.refs.archiveGradeBeMask?.checked) {
      this.refs.archiveGradeBeMask.checked = false;
    }
    if (!this.refs.archiveExportPlanning?.checked) {
      if (this.refs.archivePlanningCourses?.checked) {
        this.refs.archivePlanningCourses.checked = false;
      }
      if (this.refs.archivePlanningWeeks?.checked) {
        this.refs.archivePlanningWeeks.checked = false;
      }
    }
    if (
      this.refs.archiveExportPlanning?.checked
      && !this.refs.archivePlanningCourses?.checked
      && !this.refs.archivePlanningWeeks?.checked
    ) {
      this.refs.archivePlanningCourses.checked = true;
    }
    const effectiveOptions = (gradesLockedForPlanning || options.exportPlanning)
      ? this.readArchiveDialogOptions()
      : options;
    const gradeControls = [
      ...Array.from(this.refs.archiveGradeScopeInputs || []),
      this.refs.archiveGradeBeMask
    ].filter(Boolean);
    const planningControls = [
      this.refs.archivePlanningCourses,
      this.refs.archivePlanningWeeks
    ].filter(Boolean);
    const setInputDisabled = (input, disabled) => {
      if (input && input.disabled !== Boolean(disabled)) {
        input.disabled = Boolean(disabled);
      }
    };
    const setAriaDisabled = (node, disabled) => {
      const value = disabled ? "true" : "false";
      if (node && node.getAttribute("aria-disabled") !== value) {
        node.setAttribute("aria-disabled", value);
      }
    };
    gradeControls.forEach((input) => {
      const isBeMask = input === this.refs.archiveGradeBeMask;
      setInputDisabled(input, this.archiveExportInProgress
        || gradesLockedForPlanning
        || !effectiveOptions.exportGrades
        || (isBeMask && effectiveOptions.gradeScope !== "details"));
    });
    planningControls.forEach((input) => {
      setInputDisabled(input, this.archiveExportInProgress || !effectiveOptions.exportPlanning);
    });
    if (this.refs.archiveGradesOptions) {
      setAriaDisabled(this.refs.archiveGradesOptions, !effectiveOptions.exportGrades || gradesLockedForPlanning);
    }
    if (this.refs.archivePlanningOptions) {
      setAriaDisabled(this.refs.archivePlanningOptions, !effectiveOptions.exportPlanning);
    }
    if (this.refs.archiveExportGrades) {
      setInputDisabled(this.refs.archiveExportGrades, this.archiveExportInProgress || gradesLockedForPlanning);
      const title = gradesLockedForPlanning
        ? "Notenexport ist im Planungsmodul deaktiviert, solange das verschlüsselte Notenmodul gesperrt ist."
        : "";
      if (this.refs.archiveExportGrades.title !== title) {
        this.refs.archiveExportGrades.title = title;
      }
    }
    if (this.refs.archiveGradesLockedHint && optionsArg?.showLockedHint) {
      this.setArchiveGradesLockedHintVisible(gradesLockedForPlanning);
    } else if (this.refs.archiveGradesLockedHint && !gradesLockedForPlanning) {
      this.setArchiveGradesLockedHintVisible(false);
    }
    if (this.refs.archiveExportPlanning) {
      setInputDisabled(this.refs.archiveExportPlanning, this.archiveExportInProgress);
    }
    const validationMessage = this.validateArchiveDialogOptions(effectiveOptions);
    if (this.refs.archiveDialogGenerate) {
      setInputDisabled(this.refs.archiveDialogGenerate, this.archiveExportInProgress || Boolean(validationMessage));
    }
    if (validationMessage && showValidation && !this.archiveExportInProgress) {
      this.setArchiveDialogStatus(validationMessage, "error");
    } else if (!this.archiveExportInProgress && this.refs.archiveDialogStatus?.classList.contains("is-error")) {
      this.setArchiveDialogStatus("");
    }
  }

  setArchiveDialogStatus(message = "", tone = "") {
    const node = this.refs.archiveDialogStatus;
    if (!node) {
      return;
    }
    node.textContent = String(message || "");
    node.classList.toggle("is-error", tone === "error");
    node.classList.toggle("is-ok", tone === "ok");
  }

  async handleArchiveGenerateRequest() {
    const options = this.readArchiveDialogOptions();
    const validationMessage = this.validateArchiveDialogOptions(options);
    if (validationMessage) {
      this.setArchiveDialogStatus(validationMessage, "error");
      this.syncArchiveDialogState({ showValidation: true });
      return;
    }
    const year = this.activeSchoolYear;
    if (!year) {
      this.setArchiveDialogStatus("Kein aktives Schuljahr gefunden.", "error");
      return;
    }
    this.archiveExportInProgress = true;
    this.updateSidebarArchiveButtonState();
    this.syncArchiveDialogState();
    let archiveCreated = false;
    try {
      if (this.workspaceController && !this.isStandaloneWorkspace) {
        this.setArchiveDialogStatus("PDF wird erstellt ...");
        await this.executeWorkspaceAction("archive-generate", { options });
        this.setArchiveDialogStatus("PDF wurde erstellt.", "ok");
        archiveCreated = true;
      } else {
        if (options.exportGrades) {
          throw new Error("Der Notenexport ist erst verfügbar, wenn der gemeinsame Workspace bereit ist.");
        }
      const sections = [];
      if (options.exportPlanning) {
        sections.push(...this.collectArchivePlanningSections(year, options));
      }
      if (!sections.length) {
        this.setArchiveDialogStatus("Für die gewählte Auswahl wurden keine Daten gefunden.", "error");
        return;
      }
      this.setArchiveDialogStatus("PDF wird erstellt ...");
      const bytes = await this.buildArchivePdfBytes(year, sections);
      this.downloadArchivePdfBytes(bytes, year);
      this.setArchiveDialogStatus("PDF wurde erstellt.", "ok");
      archiveCreated = true;
      }
    } catch (error) {
      this.setArchiveDialogStatus(
        error instanceof Error && error.message ? error.message : "PDF-Export konnte nicht erstellt werden.",
        "error"
      );
    } finally {
      this.archiveExportInProgress = false;
      this.updateSidebarArchiveButtonState();
      this.syncArchiveDialogState();
    }
    if (archiveCreated) {
      this.closeDialog(this.refs.archiveDialog);
      await this.showInfoMessage(
        [
          "Das PDF-Archiv wurde erstellt.",
          "",
          "Nach dem Abschluss eines Schuljahres kannst du Teachhelper auf zwei Arten neu aufsetzen:",
          "1. Kurse in der Randleiste per Rechtsklick ausblenden.",
          "2. In den Einstellungen eine neue Datenbankdatei starten und die alte behalten."
        ].join("\n"),
        "Archiv erstellt"
      );
    }
  }

  collectArchivePlanningSections(year, options = {}) {
    this.store.ensureLessonsForYear(year.id);
    const sections = [];
    const courses = this.store.listCourses(year.id).filter((course) => !course.noLesson);
    if (options.includePlanningCourses) {
      courses.forEach((course) => {
        sections.push(...this.buildArchivePlanningCourseSection(year, course));
      });
    }
    if (options.includePlanningWeeks) {
      sections.push(...this.buildArchivePlanningWeekSections(year));
    }
    return sections;
  }

  buildArchivePlanningCourseSection(year, course) {
    const lessons = this.store.listLessonsForWeek(year.id, year.startDate, year.endDate, course.id);
    const blocks = this._buildCourseTableBlocks(lessons);
    if (!blocks.length) {
      return [{
        type: "note",
        title: `Planung - Kursansicht - ${course.name || "Kurs"}`,
        text: "Für diesen Kurs sind im Schuljahr keine Unterrichtsstunden angelegt."
      }];
    }
    const overview = {
      type: "table",
      title: `Planung - Kursansicht - ${course.name || "Kurs"}`,
      columns: ["Datum", "Stunde", "Thema", "Notizen", "Markierungen"],
      rows: blocks.map((block) => this.buildArchivePlanningCourseRow(block))
    };
    const details = blocks.flatMap((block) => {
      const lesson = block.find((item) => String(item.notes || "").trim());
      if (!lesson) return [];
      return [{
        type: "richText",
        title: `Detailplanung - ${course.name || "Kurs"} - ${formatDate(lesson.lessonDate || "")}`,
        blocks: planningRichTextToArchiveBlocks(lesson.notesRichText, lesson.notes)
      }];
    });
    return [overview, ...details];
  }

  buildArchivePlanningCourseRow(block = []) {
    const topLesson = block[0] || {};
    const lastLesson = block[block.length - 1] || topLesson;
    const topics = Array.from(new Set(
      block.map((lesson) => String(lesson.topic || "").trim()).filter(Boolean)
    ));
    const notes = Array.from(new Set(
      block.map((lesson) => String(lesson.notes || "").trim()).filter(Boolean)
    ));
    const flags = [];
    if (block.every((lesson) => lesson.canceled)) {
      flags.push(topLesson.cancelLabel || "Unterrichtsfrei");
    }
    if (block.some((lesson) => lesson.isEntfall)) {
      flags.push("Entfall");
    }
    if (block.some((lesson) => lesson.isWrittenExam)) {
      flags.push("Klausur");
    }
    const topicText = topics.length === 0
      ? ""
      : (topics.length === 1 ? topics[0] : topics.join(" / "));
    return [
      formatDate(topLesson.lessonDate || ""),
      Number(topLesson.hour || 0) === Number(lastLesson.hour || 0)
        ? String(topLesson.hour || "")
        : `${topLesson.hour || ""}-${lastLesson.hour || ""}`,
      topicText,
      notes.join("\n"),
      flags.join(", ")
    ];
  }

  buildArchivePlanningWeekSections(year) {
    const sections = [];
    const hoursPerDay = this.store.getHoursPerDay();
    for (
      let weekStart = weekStartFor(year.startDate);
      weekStart <= year.endDate;
      weekStart = addDays(weekStart, 7)
    ) {
      const days = [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset));
      const lessons = this.store.listLessonsForWeek(year.id, days[0], days[4]);
      const lessonsByDayHour = new Map();
      lessons.forEach((lesson) => {
        const key = `${lesson.lessonDate}|${lesson.hour}`;
        if (!lessonsByDayHour.has(key)) {
          lessonsByDayHour.set(key, []);
        }
        lessonsByDayHour.get(key).push(lesson);
      });
      const rows = [];
      for (let hour = 1; hour <= hoursPerDay; hour += 1) {
        rows.push([
          String(hour),
          ...days.map((dayIso) => this.formatArchiveWeekCell(lessonsByDayHour.get(`${dayIso}|${hour}`) || []))
        ]);
      }
      sections.push({
        type: "table",
        title: `Planung - Wochenansicht KW ${String(isoWeekNumber(weekStart)).padStart(2, "0")} (${formatDate(days[0])} - ${formatDate(days[4])})`,
        columns: ["Std.", ...days.map((dayIso, index) => `${DAYS_SHORT[index]} ${formatDate(dayIso).slice(0, 5)}`)],
        rows
      });
      const detailedLessons = new Set();
      lessons.forEach((lesson) => {
        if (lesson.canceled || !String(lesson.notes || "").trim()) return;
        const key = `${lesson.slotId}|${lesson.lessonDate}`;
        if (detailedLessons.has(key)) return;
        detailedLessons.add(key);
        sections.push({
          type: "richText",
          title: `Detailplanung - KW ${String(isoWeekNumber(weekStart)).padStart(2, "0")} - ${lesson.courseName || "Kurs"} - ${formatDate(lesson.lessonDate || "")}`,
          blocks: planningRichTextToArchiveBlocks(lesson.notesRichText, lesson.notes)
        });
      });
    }
    return sections;
  }

  formatArchiveWeekCell(lessons = []) {
    if (!Array.isArray(lessons) || !lessons.length) {
      return "";
    }
    return lessons.map((lesson) => {
      if (lesson.canceled) {
        return lesson.cancelLabel || "Unterrichtsfrei";
      }
      const parts = [lesson.courseName || ""];
      const topic = String(lesson.topic || "").trim();
      const notes = String(lesson.notes || "").trim();
      if (topic) {
        parts.push(topic);
      }
      if (lesson.isEntfall) {
        parts.push("Entfall");
      }
      if (lesson.isWrittenExam) {
        parts.push("Klausur");
      }
      if (notes) {
        parts.push(notes);
      }
      return parts.filter(Boolean).join(" - ");
    }).join("\n");
  }

  async buildArchivePdfBytes(year, sections = []) {
    return buildWorkspaceArchivePdfBytes(year, sections);
  }

  downloadArchivePdfBytes(bytes, year) {
    return downloadWorkspaceArchivePdf(bytes, year);
  }

  downloadBytes(bytes, fileName, type = "application/octet-stream") {
    const blob = new Blob([bytes], {
      type
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = String(fileName || "Download");
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }



  renderAll({ visibleOnly = false } = {}) {
    this.renderSchoolYearSelect();
    this.updateAccessLock();
    this.renderViewState();
    this.renderSettingsTabs();
    this.renderSidebarCourseList();
    if (!visibleOnly || this.currentView === "course") {
      this.renderCourseSection();
      this.renderSlotSection();
    }
    if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "display")) {
      this.renderDisplaySection();
    }
    if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "lessonTimes")) {
      this.renderLessonTimesSection();
    }
    if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "dayoff")) {
      this.renderDayOffSection();
    }
    if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "database")) {
      this.renderBackupSection();
      this.renderDatabaseSection();
    }
    if (this.currentView === "week") {
      this.renderWeekSection();
    }
    if (!visibleOnly) {
      this.renderLessonSection();
    }
    if (this.currentView === "course") {
      this.renderCourseTimeline();
    }
    this.syncSlotEditTools();
    this.updateWeekNavigation();
    this.syncAllNumberSteppers();
    this.queuePlanningReadySignal();
  }

  queuePlanningReadySignal() {
    const detail = {
      view: String(this.currentView || ""),
      planningAccessReady: !this.locked,
      hasPlanningCourse: Boolean(this.activeSchoolYear && this.store.listCourses(this.activeSchoolYear.id).length),
      hasPlanningSlot: Boolean(this.activeSchoolYear && this.store.listSlotsForYear(this.activeSchoolYear.id).length)
    };
    const signature = JSON.stringify(detail);
    if (signature === this._lastPlanningReadySignalSignature) {
      return;
    }
    this._lastPlanningReadySignalSignature = signature;
    const token = (Number(this._planningReadySignalToken) || 0) + 1;
    this._planningReadySignalToken = token;
    const emit = () => {
      if (this._planningReadySignalToken !== token) {
        return;
      }
      window.dispatchEvent(new CustomEvent("classroom:planning-ready", {
        detail
      }));
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(emit);
      });
      return;
    }
    setTimeout(emit, 0);
  }

  renderSidebarFooterActions() {
    const isManualMode = this.isManualPersistencePresentationMode();
    const persistenceDirty = Boolean(this.getWorkspacePersistenceStatus().dirty);
    if (this.refs.sidebarManualSaveBtn) {
      this.refs.sidebarManualSaveBtn.hidden = !isManualMode;
      this.refs.sidebarManualSaveBtn.disabled = !isManualMode;
      this.refs.sidebarManualSaveBtn.classList.toggle(
        "attention-pulse",
        isManualMode && persistenceDirty
      );
      this.refs.sidebarManualSaveBtn.title = persistenceDirty
        ? "Ungespeicherte Änderungen speichern"
        : "Datenbank speichern";
      this.refs.sidebarManualSaveBtn.setAttribute(
        "aria-label",
        persistenceDirty
          ? "Ungespeicherte Änderungen speichern"
          : "Datenbank speichern"
      );
    }
    this.dispatchManualSaveButtonState();
  }

  async updateCourseFields(courseId, fields = {}, options = {}) {
    const year = this.activeSchoolYear;
    const id = Number(courseId || 0);
    if (!year || !id) return false;
    if (this.workspaceController) {
      const result = await this.executeWorkspaceCommand(WORKSPACE_COMMAND_UPDATE_COURSE, {
        schoolYearId: year.id,
        courseId: id,
        fields,
        bulk: options.bulk === true
      }, {
        baseRevision: options.baseRevision
          ?? this.workspaceController.getRevision?.()
          ?? this.workspaceRevision
          ?? 0
      });
      return Boolean(result?.ok);
    }
    const course = this.store.listCourses(year.id).find((item) => Number(item.id) === id);
    if (!course) return false;
    const hasField = (key) => Object.prototype.hasOwnProperty.call(fields, key);
    const updated = this.store.updateCourse(
      year.id,
      id,
      hasField("name") ? String(fields.name || "") : String(course.name || ""),
      hasField("color") ? fields.color : course.color,
      hasField("noLesson") ? Boolean(fields.noLesson) : Boolean(course.noLesson),
      hasField("hiddenInSidebar") ? Boolean(fields.hiddenInSidebar) : Boolean(course.hiddenInSidebar),
      hasField("subject") ? String(fields.subject || "") : String(course.subject || "")
    );
    return Boolean(updated);
  }

  notifyParentPlanningViewRequest(view = "week") {
    if (typeof window === "undefined" || !window.parent || window.parent === window) {
      return;
    }
    const requestedView = view === "course" ? "course" : "week";
    try {
      window.parent.postMessage({
        type: "classroom:planning-view-request",
        detail: {
          view: requestedView,
          source: "iframe"
        }
      }, window.location.origin);
    } catch (_error) {
      
    }
  }

  notifyParentTutorialStartRequest() {
    if (typeof window === "undefined" || !window.parent || window.parent === window) {
      return;
    }
    try {
      window.parent.postMessage({
        type: "classroom:planning-tutorial-start-request",
        detail: {
          view: "planning",
          source: "iframe"
        }
      }, window.location.origin);
    } catch (_error) {
      
    }
  }

  async requestSeatplanNavigation(lessonId) {
    const lesson = this.store.getLessonById(Number(lessonId || 0));
    if (!lesson) return false;
    return this.requestGradesNavigation({
      action: "seatplan",
      lessonId: Number(lesson.id),
      courseId: Number(lesson.courseId),
      lessonDate: String(lesson.lessonDate || "")
    });
  }

  getPerformanceIndexSnapshot() {
    return Array.from(this.performanceIndex || []).flatMap(([courseId, titles]) => (
      Array.from(titles || []).map((title) => ({ courseId: Number(courseId), title: String(title) }))
    ));
  }

  getResolvedPerformanceCourseIds() {
    return Array.from(this.performanceIndex?.keys?.() || [])
      .map((courseId) => Number(courseId) || 0)
      .filter((courseId) => courseId > 0)
      .sort((left, right) => left - right);
  }

  replacePerformanceIndex(assessmentIndex = [], resolvedCourseIds = []) {
    const next = new Map();
    (Array.isArray(resolvedCourseIds) ? resolvedCourseIds : [])
      .map((courseId) => Number(courseId) || 0)
      .filter((courseId) => courseId > 0)
      .forEach((courseId) => next.set(courseId, new Set()));
    (Array.isArray(assessmentIndex) ? assessmentIndex : []).forEach((assessment) => {
      const courseId = Number(assessment?.courseId || 0);
      const title = normalizePerformanceIndexTitle(assessment?.title);
      if (!courseId || !title) return;
      if (!next.has(courseId)) next.set(courseId, new Set());
      next.get(courseId).add(title);
    });
    this.performanceIndex = next;
  }

  mergePerformanceIndex(assessmentIndex = [], requestedCourseIds = []) {
    const next = new Map(this.performanceIndex || []);
    requestedCourseIds.forEach((courseId) => next.set(Number(courseId), new Set()));
    (Array.isArray(assessmentIndex) ? assessmentIndex : []).forEach((assessment) => {
      const courseId = Number(assessment?.courseId || 0);
      const title = normalizePerformanceIndexTitle(assessment?.title);
      if (!courseId || !title) return;
      if (!next.has(courseId)) next.set(courseId, new Set());
      next.get(courseId).add(title);
    });
    this.performanceIndex = next;
  }

  getPerformanceTitleSetForCourse(courseId) {
    const courseKey = Number(courseId || 0);
    if (!courseKey) {
      return null;
    }
    return this.performanceIndex.get(courseKey) || null;
  }

  ensureWeekPerformanceIndexLoaded(courseIds = [], weekStartIso = this.weekStartIso) {
    const missingCourseIds = Array.from(new Set(
      (Array.isArray(courseIds) ? courseIds : [])
        .map((courseId) => Number(courseId) || 0)
        .filter((courseId) => courseId > 0 && !this.getPerformanceTitleSetForCourse(courseId))
    ));
    if (missingCourseIds.length === 0) {
      return;
    }
    const requestKey = `${String(weekStartIso || "")}:${missingCourseIds.join(",")}`;
    if (this.pendingWeekPerformanceIndexLoadKey === requestKey) {
      return;
    }
    this.pendingWeekPerformanceIndexLoadKey = requestKey;
    void (async () => {
      try {
        if (this.workspaceController) {
          const result = await this.executeWorkspaceCommand(
            WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
            { courseIds: missingCourseIds }
          );
          if (!result?.ok) {
            const error = new Error(result?.message || "Leistungslinks konnten nicht geladen werden.");
            error.code = result?.code || "UNSUPPORTED";
            throw error;
          }
          this.mergePerformanceIndex(
            result.data?.assessmentIndex,
            result.data?.assessmentIndexResolvedCourseIds || missingCourseIds
          );
        }
        if (
          this.pendingWeekPerformanceIndexLoadKey === requestKey
          && this.currentView === "week"
          && this.weekStartIso === weekStartIso
        ) {
          this.renderWeekTable();
        }
      } catch (error) {
        if (this.pendingWeekPerformanceIndexLoadKey === requestKey) {
          this.setSyncStatus(
            error instanceof Error && error.message ? error.message : "Notenkurse konnten nicht geladen werden.",
            true
          );
        }
      } finally {
        if (this.pendingWeekPerformanceIndexLoadKey === requestKey) {
          this.pendingWeekPerformanceIndexLoadKey = "";
        }
      }
    })();
  }

  buildWeekPerformanceLookup(lessons = []) {
    const lookup = new Map();
    const courseIds = new Set();
    lessons.forEach((lesson) => {
      if (!this.lessonSupportsPerformance(lesson)) {
        return;
      }
      const courseId = Number(lesson?.courseId || 0);
      if (courseId > 0) {
        courseIds.add(courseId);
      }
    });
    const missingCourseIds = [];
    courseIds.forEach((courseId) => {
      const titles = this.getPerformanceTitleSetForCourse(courseId);
      if (!(titles instanceof Set)) {
        missingCourseIds.push(courseId);
        return;
      }
      lookup.set(courseId, titles);
    });
    if (missingCourseIds.length > 0) {
      this.ensureWeekPerformanceIndexLoaded(missingCourseIds, this.weekStartIso);
    }
    return lookup;
  }

  getPerformanceNavigationStateForLesson(lesson, assessmentLookup = null) {
    const courseId = Number(lesson?.courseId || 0);
    const lessonDate = String(lesson?.lessonDate || "").trim();
    if (!this.lessonSupportsPerformance(lesson) || !courseId || !lessonDate) {
      return null;
    }
    const hasExistingAssessment = this.hasExistingPerformanceForLesson(
      courseId,
      lessonDate,
      assessmentLookup
    );
    return {
      hasExistingAssessment,
      assessmentResolved: true,
      triggerMode: hasExistingAssessment ? "assessment" : "entry",
      ariaLabel: hasExistingAssessment ? "Einzelleistung in der Noten-Eingabe öffnen" : "Noten-Eingabe öffnen",
      title: hasExistingAssessment ? "Einzelleistung in der Noten-Eingabe öffnen" : "Noten-Eingabe öffnen"
    };
  }

  async requestPerformanceNavigation(lessonId, triggerMode = "entry") {
    const normalizedLessonId = Number(lessonId || 0);
    if (!normalizedLessonId) {
      return false;
    }
    const lesson = this.store.getLessonById(normalizedLessonId);
    if (!lesson || !this.lessonSupportsPerformance(lesson)) {
      return false;
    }
    return this.requestGradesNavigation({
      lessonId: normalizedLessonId,
      courseId: Number(lesson.courseId || 0) || null,
      lessonDate: String(lesson.lessonDate || ""),
      subview: "entry",
      triggerMode: String(triggerMode || "auto")
    });
  }

  hasExistingPerformanceForLesson(courseId, lessonDate, assessmentLookup = null) {
    const normalizedCourseId = Number(courseId || 0);
    const normalizedLessonDate = String(lessonDate || "").trim();
    if (!normalizedCourseId || !normalizedLessonDate) {
      return false;
    }
    const expectedTitle = normalizePerformanceIndexTitle(formatShortDateLabel(normalizedLessonDate));
    if (!expectedTitle) {
      return false;
    }
    if (assessmentLookup instanceof Map) {
      const titles = assessmentLookup.get(normalizedCourseId);
      if (titles instanceof Set) {
        return titles.has(expectedTitle);
      }
    }
    return this.performanceIndex.get(normalizedCourseId)?.has(expectedTitle) || false;
  }

  renderViewState() {
    const isWeek = this.currentView === "week";
    const isCourse = this.currentView === "course";
    const isSettings = this.currentView === "settings";
    const showMainStack = isWeek || isCourse;
    document.body.dataset.view = this.currentView;
    if (this.refs.sidebarTitle) {
      this.refs.sidebarTitle.textContent = "Planung";
    }

    this.refs.viewWeek.hidden = !isWeek;
    this.refs.viewCourse.hidden = !isCourse;
    this.refs.viewSettings.hidden = !isSettings;
    if (this.refs.stackGlass) {
      this.refs.stackGlass.hidden = !showMainStack;
      this.refs.stackGlass.style.display = showMainStack ? "grid" : "none";
    }
    if (this.refs.settingsShell) {
      this.refs.settingsShell.hidden = !isSettings;
      this.refs.settingsShell.style.display = isSettings ? "grid" : "none";
    }
    this.refs.headerGlass.style.display = (!this.locked && isWeek) ? "flex" : "none";
    this.refs.viewWeekBtn.hidden = false;
    this.refs.viewWeekBtn.disabled = this.locked;
    if (this.refs.viewSettingsBtn) {
      this.refs.viewSettingsBtn.hidden = false;
      this.refs.viewSettingsBtn.disabled = this.locked;
    }
    this.updateSidebarArchiveButtonState();
    this.renderSidebarFooterActions();
    if (this.refs.mainPane) {
      const showHeader = !this.locked && isWeek;
      this.refs.mainPane.style.gridTemplateRows = (isSettings || !showHeader) ? "1fr" : "auto 1fr";
      this.refs.mainPane.style.gap = showHeader ? "12px" : "0";
    }

    this.refs.viewWeekBtn.classList.toggle("active", isWeek);
    if (this.refs.viewSettingsBtn) {
      this.refs.viewSettingsBtn.classList.toggle("active", isSettings);
    }

    if (isWeek) {
      this.scheduleWeekLayoutScale();
    } else if (this.refs.headerGlass && this.refs.weekTable) {
      this.refs.headerGlass.style.setProperty("--week-header-scale", "1");
      this.refs.weekTable.style.setProperty("--week-table-scale", "1");
    }
  }

  renderSettingsTabs() {
    const fallbackTab = "dayoff";
    const allowManualDatabaseWhileHolidayLocked = this.isManualPersistencePresentationMode();
    const isDatabaseLock = this.locked && this.lockReason === "databaseRequired";
    const isBackupDirectoryLock = this.locked && this.lockReason === "backupDirRequired";
    const activeTabAllowedInContext = Boolean(this.refs.settingsPanels[this.activeSettingsTab]);
    let tabName = activeTabAllowedInContext ? this.activeSettingsTab : fallbackTab;
    if (this.locked) {
      tabName = (isDatabaseLock || isBackupDirectoryLock)
        ? "database"
        : (
          allowManualDatabaseWhileHolidayLocked && tabName === "database"
            ? "database"
            : "dayoff"
        );
    }
    this.activeSettingsTab = tabName;

    this.refs.settingsTabs.forEach((button) => {
      const isActive = button.dataset.tab === tabName;
      const isLockedHidden = this.locked
        && this.lockReason === "holidaysRequired"
        && !(allowManualDatabaseWhileHolidayLocked && button.dataset.tab === "database")
        && button.dataset.tab !== "dayoff";
      const isPersistenceSetupLock = isDatabaseLock || isBackupDirectoryLock;
      const isHidden = isLockedHidden;
      const isLockedDisabled = isHidden || (isPersistenceSetupLock && button.dataset.tab !== "database");
      button.hidden = isHidden;
      button.disabled = isLockedDisabled;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    Object.entries(this.refs.settingsPanels).forEach(([name, panel]) => {
      if (!panel) return;
      const isLockedPanel = (isDatabaseLock || isBackupDirectoryLock) && name !== "database";
      const isActive = name === tabName && !isLockedPanel;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
    });
    this.updateSettingsActionButtons();
  }

  getArchiveTabContext() {
    return "planning";
  }

  lessonSupportsPerformance(lesson) {
    return Boolean(lesson) && !lesson.noLesson && !lesson.noGrades;
  }

  renderSchoolYearSelect() {
    const years = this.store.listSchoolYears();
    const active = this.activeSchoolYear;
    this.refs.schoolYearSelect.innerHTML = "";

    for (const year of years) {
      const option = document.createElement("option");
      option.value = String(year.id);
      option.textContent = `${year.name} (${formatDate(year.startDate)} - ${formatDate(year.endDate)})`;
      if (active && year.id === active.id) {
        option.selected = true;
      }
      this.refs.schoolYearSelect.append(option);
    }

    this.weekStartIso = this._clampWeekStart(this.weekStartIso);
    this.refs.weekDate.value = this.weekStartIso;
    this.refs.hoursPerDay.value = String(this.store.getHoursPerDay());
    this.refs.kwLabel.textContent = `KW ${String(this._currentIsoWeek()).padStart(2, "0")}`;
  }

  renderSidebarCourseList() {
    const year = this.activeSchoolYear;
    const allCourses = year ? this.store.listCourses(year.id) : [];
    const showHidden = Boolean(
      this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT)
    );
    const sidebarCourses = allCourses;
    const courses = showHidden
      ? sidebarCourses
      : sidebarCourses.filter((course) => !course.hiddenInSidebar);
    const visibleCourses = courses.filter((course) => !course.hiddenInSidebar);
    const hiddenCourses = showHidden
      ? courses.filter((course) => course.hiddenInSidebar)
      : [];
    const orderedCourses = visibleCourses.concat(hiddenCourses);
    const selectableCourses = courses;
    if (!selectableCourses.some((course) => course.id === this.selectedCourseId)) {
      this.selectedCourseId = selectableCourses.length > 0 ? selectableCourses[0].id : null;
    }

    this.refs.sidebarCourseList.innerHTML = "";
    this.refs.sidebarCourseList.classList.toggle(
      "empty-pulse",
      !this.locked && selectableCourses.length === 0
    );
    orderedCourses.forEach((course, index) => {
      if (showHidden && hiddenCourses.length > 0 && index === visibleCourses.length) {
        const separator = document.createElement("li");
        separator.dataset.courseId = "separator";
        this.refs.sidebarCourseList.append(separator);
      }
      const li = document.createElement("li");
      li.dataset.courseId = String(course.id);
      li.dataset.noLesson = course.noLesson ? "1" : "0";
      li.dataset.hiddenInSidebar = course.hiddenInSidebar ? "1" : "0";
      li.draggable = !this.locked;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.courseId = String(course.id);
      button.dataset.tutorialAnchor = "planning-course";
      button.dataset.noLesson = course.noLesson ? "1" : "0";
      button.disabled = this.locked;
      if (course.noLesson) {
        button.title = "Linksklick: Kursansicht / Rechtsklick: Kursaktionen / Ziehen: Reihenfolge in Randleiste";
        li.title = button.title;
      } else {
        button.title = "Linksklick: Kursansicht / Rechtsklick: Kursaktionen / Ziehen: Reihenfolge in Randleiste";
      }
      if (this.currentView === "course" && course.id === this.selectedCourseId) {
        button.classList.add("active");
      }
      const baseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
      button.style.background = colorToRgba(course.noLesson ? NO_LESSON_COLOR : lightenHex(baseColor, 0.06), 0.9);
      button.style.color = "#000000";
      button.style.borderColor = colorToRgba(lightenHex(baseColor, 0.3), 0.6);
      const name = document.createElement("span");
      name.className = "course-name";
      name.textContent = course.name;
      button.append(name);
      const loadedStudentCount = this.store.listGradeStudents(course.id)
        .filter((student) => !student?.isPlaceholder && Number(student?.id || 0) > 0)
        .length;
      const persistedStudentCounts = this.store.getSetting?.("gradeCourseStudentCounts", {}) || {};
      const courseId = String(Number(course.id) || 0);
      const persistedStudentCount = Object.prototype.hasOwnProperty.call(persistedStudentCounts, courseId)
        ? Math.max(0, Number(persistedStudentCounts[courseId]) || 0)
        : null;
      const studentCount = this.courseStudentCounts.get(Number(course.id))
        ?? persistedStudentCount
        ?? loadedStudentCount;
      if (studentCount > 0) {
        const count = document.createElement("span");
        count.className = "course-student-count";
        count.textContent = String(studentCount);
        count.title = "Lernendenanzahl";
        count.setAttribute("aria-label", "Lernendenanzahl");
        button.append(count);
      }
      li.append(button);
      this.refs.sidebarCourseList.append(li);
    });

    const addItem = document.createElement("li");
    addItem.dataset.addItem = "1";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "sidebar-add-btn";
    addButton.dataset.addCourse = "1";
    addButton.dataset.tutorialAnchor = "planning-course-add";
    addButton.setAttribute("aria-label", "Neuen Kurs anlegen");
    const plusIcon = document.createElement("span");
    plusIcon.className = "sidebar-add-plus";
    plusIcon.setAttribute("aria-hidden", "true");
    addButton.append(plusIcon);
    addButton.title = "Neuen Kurs anlegen";
    addButton.disabled = this.locked;
    addItem.append(addButton);
    this.refs.sidebarCourseList.append(addItem);
  }

  renderCourseSection() {
    const year = this.activeSchoolYear;
    const courses = year ? this.store.listCourses(year.id) : [];
    this.refs.courseSettingsAdd.disabled = this.locked || !year;

    this.refs.courseList.innerHTML = "";
    for (const course of courses) {
      const li = document.createElement("li");
      li.dataset.courseId = String(course.id);
      const main = document.createElement("div");
      main.className = "main";
      const name = document.createElement("div");
      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.display = "inline-block";
      dot.style.marginRight = "8px";
      dot.style.background = normalizeCourseColor(course.color, Boolean(course.noLesson));
      name.append(dot, document.createTextNode(course.name));
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = course.noLesson ? "Unterrichtsfrei-Kurs" : "Regulärer Kurs";
      main.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "ghost";
      editBtn.dataset.action = "edit";
      editBtn.dataset.id = String(course.id);
      editBtn.textContent = "✎ Bearbeiten";
      editBtn.disabled = this.locked;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete";
      deleteBtn.dataset.action = "delete";
      deleteBtn.dataset.id = String(course.id);
      deleteBtn.textContent = "Löschen";
      deleteBtn.disabled = this.locked;

      actions.append(editBtn, deleteBtn);

      li.append(main, actions);
      this.refs.courseList.append(li);
    }
  }

  renderSlotSection() {
    this.renderSlotCourseSelect();
    this.renderSlotList();
  }

  renderSlotCourseSelect() {
    const year = this.activeSchoolYear;
    const courses = year ? this.store.listCourses(year.id) : [];
    const previous = this.refs.slotCourse.value;
    this.refs.slotCourse.innerHTML = "";

    for (const course of courses) {
      const option = document.createElement("option");
      option.value = String(course.id);
      option.textContent = course.name;
      const courseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
      option.style.color = courseColor;
      option.style.backgroundColor = "var(--dropdown-bg)";
      option.dataset.courseColor = courseColor;
      this.refs.slotCourse.append(option);
    }

    if (courses.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Erst Kurs anlegen";
      option.style.backgroundColor = "var(--dropdown-bg)";
      this.refs.slotCourse.append(option);
      this.refs.slotCourse.disabled = true;
      this.refs.slotCourse.style.color = "";
      return;
    }

    this.refs.slotCourse.disabled = false;
    this.refs.slotCourse.value = courses.some((course) => String(course.id) === previous)
      ? previous
      : String(courses[0].id);
    this.syncSlotFormCourseColor();
  }

  renderSlotList() {
    const year = this.activeSchoolYear;
    const slots = year ? this.store.listSlotsForYear(year.id) : [];
    const coursesById = new Map((year ? this.store.listCourses(year.id) : []).map((item) => [item.id, item]));
    this.refs.slotList.innerHTML = "";

    for (const slot of slots) {
      const course = coursesById.get(slot.courseId);
      const li = document.createElement("li");
      const main = document.createElement("div");
      main.className = "main";
      const name = document.createElement("div");
      const dayName = DAYS_SHORT[slot.dayOfWeek - 1] || `Tag ${slot.dayOfWeek}`;
      const oneTime = Number(slot.weekParity) === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate;
      const parityText = oneTime
        ? "einmalig"
        : Number(slot.weekParity) === 1
          ? "ung. KW"
          : Number(slot.weekParity) === 2
            ? "ger. KW"
            : "jede KW";
      name.textContent = slot.placement === "break"
        ? `${dayName} · Pause nach der ${slot.startHour}. Std. · ${slot.label || "Aufsicht"}`
        : `${dayName} ${slot.startHour}.-${slot.startHour + slot.duration - 1}. Std. · ${course ? course.name : "?"}`;
      const meta = document.createElement("div");
      meta.className = "meta";
      const rangeText = slot.startDate || slot.endDate
        ? slot.startDate && slot.endDate && slot.startDate === slot.endDate
          ? formatDate(slot.startDate)
          : `${slot.startDate ? formatDate(slot.startDate) : "Start Schuljahr"} - ${slot.endDate ? formatDate(slot.endDate) : "Ende Schuljahr"}`
        : "Ganzes Schuljahr";
      meta.textContent = `${rangeText} · ${parityText}`;
      main.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";
      actions.innerHTML = `
        <button type="button" class="ghost" data-action="edit" data-id="${slot.id}">Bearbeiten</button>
        <button type="button" class="delete" data-action="delete" data-id="${slot.id}">Löschen</button>
      `;
      li.append(main, actions);
      this.refs.slotList.append(li);
    }
  }

  renderDisplaySection() {
    const draftHours = clamp(
      Number((this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
      1,
      12
    );
    const draftShowHidden = Boolean(
      (this.settingsDraft && this.settingsDraft.showHiddenSidebarCourses)
      || false
    );
    if (this.refs.hoursPerDay) {
      this.refs.hoursPerDay.value = String(draftHours);
    }
    if (this.refs.settingsDisplayHoursRow) {
      this.refs.settingsDisplayHoursRow.hidden = false;
      this.refs.settingsDisplayHoursRow.style.display = "";
    }
    if (this.refs.showHiddenSidebarCourses) {
      this.refs.showHiddenSidebarCourses.checked = draftShowHidden;
    }
    this.refs.themePreferenceInputs.forEach((input) => {
      input.checked = input.value === this.themePreference;
    });
    if (this.refs.appVersion) {
      this.refs.appVersion.textContent = this.appVersion || "unbekannt";
    }
    this.syncAllNumberSteppers();
    this.updateSettingsActionButtons();
  }

  setThemePreference(value) {
    const preference = normalizeThemePreference(value);
    this.themePreference = preference;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: THEME_PREFERENCE_CHANGE_EVENT,
        detail: { preference },
      }, window.location.origin);
    } else {
      writeThemePreference(preference);
      applyDocumentTheme(resolveTheme(preference, window.matchMedia?.("(prefers-color-scheme: dark)").matches));
    }
    this.renderDisplaySection();
  }

  renderLessonTimesSection() {
    if (!this.refs.lessonTimesList) {
      return;
    }
    const draftHours = clamp(
      Number((this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
      1,
      12
    );
    const lessonTimes = this.getSettingsDraftLessonTimes(draftHours);
    this.refs.lessonTimesList.innerHTML = "";
    if (lessonTimes.length === 0) {
      this.refs.lessonTimesList.innerHTML = `<div class="lesson-times-empty">Keine Unterrichtsstunden vorhanden.</div>`;
      this.updateSettingsActionButtons();
      return;
    }
    const fragment = document.createDocumentFragment();
    lessonTimes.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "lesson-times-row";
      row.innerHTML = `
        <div class="lesson-times-row-label">${entry.lesson}. Stunde</div>
        <label class="lesson-times-field">
          <span>Start</span>
          <input type="time" name="lesson-start-${entry.lesson}" value="${escapeHtml(entry.start || "")}" data-lesson="${entry.lesson}" data-lesson-time="start">
        </label>
        <label class="lesson-times-field">
          <span>Ende</span>
          <input type="time" name="lesson-end-${entry.lesson}" value="${escapeHtml(entry.end || "")}" data-lesson="${entry.lesson}" data-lesson-time="end">
        </label>
      `;
      fragment.append(row);
    });
    this.refs.lessonTimesList.append(fragment);
    this.updateSettingsActionButtons();
  }

  renderDayOffSection() {
    const year = this.activeSchoolYear;
    const canEdit = Boolean(year);
    if (this.refs.freeRangeAdd) {
      this.refs.freeRangeAdd.disabled = !canEdit;
    }
    this.renderRequiredHolidayHint();
    this.renderFreeRangeList();
    this.renderSpecialDayList();
    this.updateSettingsActionButtons();
  }

  getMissingRequiredHolidays(schoolYearId) {
    const ranges = this.store.listFreeRanges(schoolYearId);
    return computeRequiredHolidayMissingLabels(ranges);
  }

  getMissingRequiredHolidayDetails(schoolYearId) {
    const ranges = this.store.listFreeRanges(schoolYearId);
    return computeRequiredHolidayMissingDetails(ranges);
  }

  renderRequiredHolidayHint() {
    if (!this.refs.dayoffRequiredHint || !this.refs.dayoffRequiredMissing) {
      return;
    }
    const hintTitle = this.refs.dayoffRequiredHint.querySelector(".required-hint-title");
    const year = this.activeSchoolYear;
    if (!year) {
      this.refs.dayoffRequiredHint.hidden = true;
      this.refs.dayoffRequiredHint.style.display = "none";
      this.refs.dayoffRequiredMissing.textContent = "";
      if (hintTitle) {
        hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
      }
      return;
    }
    const missing = this.getMissingRequiredHolidays(year.id);
    const isComplete = this.store.requiredHolidaysComplete(year.id);
    const details = this.getMissingRequiredHolidayDetails(year.id);
    const shouldShowHint = !isComplete && details.length > 0 && missing.length > 0;
    if (!shouldShowHint) {
      this.refs.dayoffRequiredHint.hidden = true;
      this.refs.dayoffRequiredHint.style.display = "none";
      this.refs.dayoffRequiredMissing.textContent = "";
      if (hintTitle) {
        hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
      }
      return;
    }
    this.refs.dayoffRequiredHint.hidden = false;
    this.refs.dayoffRequiredHint.style.display = "grid";
    if (hintTitle) {
      hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
    }
    this.refs.dayoffRequiredMissing.textContent =
      `Fehlend: ${details.join("; ")}.`;
  }

  renderFreeRangeList() {
    const year = this.activeSchoolYear;
    const ranges = year ? this.store.listFreeRanges(year.id) : [];
    const canEdit = Boolean(year);
    this.refs.freeRangeList.innerHTML = "";

    const requiredLookup = new Set(REQUIRED_HOLIDAYS.map((label) => label.toLowerCase()));
    const byLabel = new Map();
    for (const item of ranges) {
      const normalized = String(item.label || "").trim().toLowerCase();
      if (!byLabel.has(normalized)) {
        byLabel.set(normalized, []);
      }
      byLabel.get(normalized).push(item);
    }
    const displayRanges = [];
    const usedRows = new Set();
    const requiredDisplayOrder = requiredHolidayRowSpecs();

    for (const entry of requiredDisplayOrder) {
      const existingRows = byLabel.get(entry.label.toLowerCase()) || [];
      const sortedRows = [...existingRows].sort((a, b) => {
        const aKey = String(a.startDate || a.endDate || "");
        const bKey = String(b.startDate || b.endDate || "");
        return aKey.localeCompare(bKey);
      });
      const row = sortedRows[entry.occurrence] || null;
      if (row) {
        displayRanges.push({ ...row, __occurrence: entry.occurrence });
        usedRows.add(row);
      } else {
        displayRanges.push({
          id: null,
          label: entry.label,
          __occurrence: entry.occurrence,
          startDate: "",
          endDate: ""
        });
      }
    }

    for (const range of ranges) {
      if (usedRows.has(range)) {
        continue;
      }
      const normalized = String(range.label || "").trim().toLowerCase();
      if (requiredLookup.has(normalized)) {
        continue;
      }
      displayRanges.push(range);
    }

    for (const range of displayRanges) {
      const li = document.createElement("li");
      li.dataset.clickable = canEdit ? "1" : "0";
      if (canEdit) {
        li.title = "Linksklick: Daten bearbeiten";
      }
      if (range.id) {
        li.dataset.id = String(range.id);
      } else {
        li.dataset.label = String(range.label || "");
      }
      if (Number.isInteger(range.__occurrence)) {
        li.dataset.occurrence = String(range.__occurrence);
      }
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.textContent = range.label;
      const meta = document.createElement("div");
      meta.className = "meta";
      const isSummer = String(range.label || "").trim().toLowerCase() === "sommerferien";
      const isTopSummer = isSummer && Number(range.__occurrence) === 0;
      const isBottomSummer = isSummer && Number(range.__occurrence) === 1;
      const wrapsYear = Boolean(range.startDate && range.endDate && range.startDate > range.endDate);
      if (isTopSummer) {
        if (range.startDate && range.endDate) {
          meta.textContent = `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
        } else {
          meta.textContent = range.endDate ? `bis ${formatDate(range.endDate)}` : "Nicht gesetzt";
        }
      } else if (isBottomSummer) {
        if (range.startDate && range.endDate) {
          meta.textContent = `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
        } else if (range.startDate) {
          meta.textContent = `ab ${formatDate(range.startDate)}`;
        } else if (range.endDate) {
          meta.textContent = `bis ${formatDate(range.endDate)}`;
        } else {
          meta.textContent = "Nicht gesetzt";
        }
      } else if (!range.startDate && !range.endDate) {
        meta.textContent = "Nicht gesetzt";
      } else if (range.startDate && !range.endDate) {
        meta.textContent = `ab ${formatDate(range.startDate)}`;
      } else if (!range.startDate && range.endDate) {
        meta.textContent = `bis ${formatDate(range.endDate)}`;
      } else {
        meta.textContent = wrapsYear
          ? `${formatDate(range.startDate)} - ${formatDate(range.endDate)} (überjährig)`
          : `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
      }
      main.append(title, meta);
      li.append(main);
      this.refs.freeRangeList.append(li);
    }
  }

  renderSpecialDayList() {
    const canEdit = Boolean(this.activeSchoolYear);
    const rows = this.store.listSpecialDays();
    this.refs.specialDayList.innerHTML = "";

    for (const day of rows) {
      const li = document.createElement("li");
      li.dataset.clickable = canEdit ? "1" : "0";
      if (canEdit) {
        li.title = "Linksklick: Daten bearbeiten";
      }
      li.dataset.specialDayId = String(day.id);
      const main = document.createElement("div");
      main.className = "main";
      const name = document.createElement("div");
      name.textContent = day.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = formatDate(day.dayDate);
      main.append(name, meta);
      li.append(main);
      this.refs.specialDayList.append(li);
    }

    const addLi = document.createElement("li");
    addLi.dataset.addItem = "1";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sidebar-add-btn";
    addBtn.dataset.action = "add";
    addBtn.disabled = !canEdit;
    addBtn.setAttribute("aria-label", "Unterrichtsfreien Tag hinzufügen");
    addBtn.title = "Unterrichtsfreien Tag hinzufügen";
    const plusIcon = document.createElement("span");
    plusIcon.className = "sidebar-add-plus";
    plusIcon.setAttribute("aria-hidden", "true");
    addBtn.append(plusIcon);
    addLi.append(addBtn);
    this.refs.specialDayList.append(addLi);
  }

  renderWeekSection() {
    this.refs.weekDate.value = this.weekStartIso;
    this.refs.kwLabel.textContent = `KW ${String(this._currentIsoWeek()).padStart(2, "0")}`;
    this.updateWeekNavigation();
    if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
      this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
      this.syncWeekCalendarMonthOptions();
      this.renderWeekCalendarGrid();
      this.positionWeekCalendarDialog();
    }
    this.renderWeekTable();
    this.scheduleWeekLayoutScale();
  }

  scheduleWeekLayoutScale() {
    if (this.weekLayoutScaleFrame) {
      cancelAnimationFrame(this.weekLayoutScaleFrame);
      this.weekLayoutScaleFrame = 0;
    }
    if (this.weekLayoutScaleTimeout) {
      window.clearTimeout(this.weekLayoutScaleTimeout);
      this.weekLayoutScaleTimeout = 0;
    }
    const table = this.refs.weekTable;
    const header = this.refs.headerGlass;
    if (table && header && this.currentView === "week" && !this.locked) {
      header.style.setProperty("--week-header-scale", "1");
      table.style.setProperty("--week-table-scale", "1");
      table.style.setProperty("--week-block-font-scale", "1");
      table.style.removeProperty("--week-row-height");
    }
    const run = () => {
      this.weekLayoutScaleFrame = 0;
      this.weekLayoutScaleTimeout = 0;
      this.syncWeekLayoutScale();
    };
    if (typeof requestAnimationFrame === "function") {
      this.weekLayoutScaleFrame = requestAnimationFrame(run);
      return;
    }
    this.weekLayoutScaleTimeout = window.setTimeout(run, 0);
  }

  syncWeekLayoutScale() {
    const table = this.refs.weekTable;
    const header = this.refs.headerGlass;
    const weekView = this.refs.viewWeek;
    const tablePanel = table && table.closest ? table.closest(".table-panel") : null;
    if (!table || !header || !tablePanel) {
      return;
    }

    if (this.currentView !== "week" || this.locked) {
      header.style.setProperty("--week-header-scale", "1");
      table.style.setProperty("--week-table-scale", "1");
      return;
    }

    if (header.clientWidth <= 0 || tablePanel.clientWidth <= 0 || tablePanel.clientHeight <= 0) {
      return;
    }

    const tbody = table.tBodies[0];
    const rowCount = tbody ? tbody.rows.length : 0;
    if (!tbody || rowCount === 0) {
      table.style.removeProperty("--week-row-height");
      table.style.setProperty("--week-block-font-scale", "1");
      return;
    }

    const panelWidth = tablePanel.clientWidth;
    const panelHeight = tablePanel.clientHeight;
    const headerWidth = header.clientWidth;
    const headerContentWidth = header.scrollWidth;
    const tableContentWidth = table.scrollWidth;
    const tableContentHeight = table.scrollHeight;
    const weekClientHeight = weekView ? weekView.clientHeight : panelHeight;
    const weekContentHeight = weekView ? weekView.scrollHeight : tableContentHeight;
    const tableHeaderHeight = table.tHead ? table.tHead.getBoundingClientRect().height : 0;

    const fitRatio = (available, content) => (
      content > 0 ? Math.min(1, available / content) : 1
    );
    const headerScale = clamp(
      fitRatio(headerWidth, headerContentWidth),
      0.38,
      1
    );
    const tableScale = clamp(
      Math.min(
        fitRatio(panelWidth, tableContentWidth),
        fitRatio(panelHeight, tableContentHeight),
        fitRatio(weekClientHeight, weekContentHeight)
      ),
      0.2,
      1
    );
    const scaledHeaderHeight = tableHeaderHeight * tableScale;
    const rowHeight = Math.max(0, (panelHeight - scaledHeaderHeight - 1) / rowCount);
    header.style.setProperty("--week-header-scale", headerScale.toFixed(2));
    table.style.setProperty("--week-table-scale", tableScale.toFixed(2));
    table.style.setProperty("--week-row-height", `${rowHeight}px`);
    table.style.setProperty("--week-block-font-scale", "1");
    this.syncWeekLessonBlockTopicScales();

    if (this.inlineTopicLessonId) {
      requestAnimationFrame(() => this.syncInlineWeekBlockTopicInputSize());
    }
  }

  syncWeekLessonBlockTopicScales() {
    const table = this.refs.weekTable;
    if (!table) {
      return;
    }
    [...table.querySelectorAll(".lesson-block")].forEach((block) => {
      this.syncWeekLessonBlockTopicScale(block);
    });
  }

  syncWeekLessonBlockTopicScale(block) {
    if (!block || !block.style || typeof block.querySelector !== "function") {
      return;
    }
    const topicZone = block.querySelector(".topic-zone");
    const topicContent = topicZone?.querySelector(".line, .week-inline-topic-input");
    block.style.setProperty("--week-topic-font-scale", "1");
    if (!topicZone || !topicContent || topicZone.clientHeight <= 0) {
      return;
    }

    const availableHeight = topicZone.clientHeight;
    const contentHeight = topicContent.scrollHeight;
    const topicScale = contentHeight > availableHeight
      ? clamp((availableHeight / contentHeight) * 0.98, 0.7, 1)
      : 1;
    block.style.setProperty("--week-topic-font-scale", topicScale.toFixed(2));
  }

  _buildWeekLessonBlock(blockLessons) {
    const topLesson = blockLessons[0];
    const allCanceled = blockLessons.every((entry) => entry.canceled);
    const anyCanceled = blockLessons.some((entry) => entry.canceled);
    const partialCanceled = anyCanceled && !allCanceled;
    const isNoLesson = Boolean(topLesson.noLesson);
    const isNoGrades = Boolean(topLesson.noGrades);
    const isEntfall = blockLessons.some((entry) => entry.isEntfall);
    const isWritten = blockLessons.some((entry) => entry.isWrittenExam);
    const topics = new Set(blockLessons.map((entry) => String(entry.topic || "").trim()).filter(Boolean));
    const hasNotes = blockLessons.some((entry) => Boolean(String(entry.notes || "").trim()));
    let displayTopic = "";
    if (allCanceled && topLesson.cancelLabel) displayTopic = topLesson.cancelLabel;
    else if (topics.size === 1) displayTopic = [...topics][0];
    else if (topics.size > 1) displayTopic = "Mehrere Themen";
    if (!allCanceled && (isEntfall || isWritten)) {
      displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
    }
    const courseColor = normalizeCourseColor(topLesson.color, false);
    const tinted = lightenHex(courseColor, 0.1);
    return {
      topLesson,
      lessons: blockLessons,
      firstLessonId: Number(topLesson.id),
      courseId: Number(topLesson.courseId || 0),
      courseName: String(topLesson.courseName || ""),
      allCanceled,
      partialCanceled,
      isNoLesson,
      isNoGrades,
      isEntfall,
      isWritten,
      hasNotes,
      displayText: allCanceled ? (topLesson.cancelLabel || "Unterrichtsfrei") : formatPartialDisplay(displayTopic, partialCanceled),
      background: allCanceled ? "rgba(28, 34, 44, 1)" : (isNoLesson ? "rgba(120, 120, 120, 1)" : colorToRgba(tinted, 1)),
      selectable: !allCanceled,
      startHour: Math.min(...blockLessons.map((entry) => Number(entry.hour))),
      endHour: Math.max(...blockLessons.map((entry) => Number(entry.hour)))
    };
  }

  _assignWeekBlockLanes(blocks) {
    const sorted = [...blocks].sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour || a.firstLessonId - b.firstLessonId);
    let component = [];
    let componentEnd = 0;
    const assignComponent = () => {
      if (!component.length) return;
      const laneEnds = [];
      component.forEach((block) => {
        let lane = laneEnds.findIndex((end) => end < block.startHour);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = block.endHour;
        block.lane = lane;
      });
      component.forEach((block) => { block.laneCount = laneEnds.length; });
      component = [];
      componentEnd = 0;
    };
    sorted.forEach((block) => {
      if (component.length && block.startHour > componentEnd) assignComponent();
      component.push(block);
      componentEnd = Math.max(componentEnd, block.endHour);
    });
    assignComponent();
    return sorted;
  }

  _createWeekLessonCard(block, performanceLookup) {
    const isInlineEditing = Number(this.inlineTopicLessonId || 0) === block.firstLessonId;
    const chip = document.createElement(isInlineEditing ? "div" : "button");
    if (chip instanceof HTMLButtonElement) chip.type = "button";
    chip.className = "lesson-block";
    chip.dataset.lessonId = String(block.firstLessonId);
    chip.dataset.noLesson = block.isNoLesson ? "1" : "0";
    chip.title = block.selectable ? "Linksklick: Thema bearbeiten / Rechtsklick: Weitere Aktionen" : "Nicht bearbeitbar";
    chip.style.background = block.background;
    chip.style.color = "#000000";
    chip.style.gridRow = `${block.startHour} / span ${block.endHour - block.startHour + 1}`;
    const laneWidth = 100 / Math.max(1, Number(block.laneCount) || 1);
    chip.style.gridColumn = "1";
    chip.style.marginLeft = `${Number(block.lane || 0) * laneWidth}%`;
    chip.style.width = `calc(${laneWidth}% - calc(0.16rem * var(--week-table-scale, 1)))`;
    if (block.allCanceled) chip.classList.add("canceled");
    if (block.isNoLesson) chip.classList.add("no-lesson");
    if (block.isEntfall) chip.classList.add("entfall");
    if (block.isWritten) chip.classList.add("written");
    if (block.partialCanceled) chip.classList.add("partial");
    if (block.lessons.some((entry) => entry.id === this.selectedLessonId)) chip.classList.add("selected");
    if (!block.selectable) chip.classList.add("not-selectable");
    if (block.allCanceled && chip instanceof HTMLButtonElement) chip.disabled = true;

    const seatplanVisible = block.selectable && !block.isNoLesson && !block.isNoGrades && block.courseId > 0;
    if (seatplanVisible) {
      chip.classList.add("has-seatplan-trigger");
      const trigger = document.createElement("span");
      trigger.className = "lesson-block-seatplan-trigger";
      trigger.dataset.seatplanLessonId = String(block.firstLessonId);
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
      trigger.setAttribute("aria-label", "Kurs-Sitzplan öffnen");
      trigger.title = "Kurs-Sitzplan öffnen";
      trigger.textContent = "🪑";
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); event.stopPropagation(); void this.requestSeatplanNavigation(block.firstLessonId);
        }
      });
      chip.append(trigger);
    }
    if (block.hasNotes && block.selectable) {
      const trigger = document.createElement("span");
      trigger.className = "lesson-block-details-trigger";
      trigger.dataset.detailPlanningLessonId = String(block.firstLessonId);
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
      trigger.setAttribute("aria-label", "Detailplanung öffnen");
      trigger.title = "Detailplanung öffnen";
      trigger.textContent = "🔎";
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); event.stopPropagation(); this.openTopicDialog(block.firstLessonId);
        }
      });
      chip.append(trigger);
    }
    const performanceNavigationState = !block.isNoLesson && !block.isNoGrades
      ? this.getPerformanceNavigationStateForLesson(block.topLesson, performanceLookup) : null;
    if (performanceNavigationState) {
      chip.classList.add("has-performance-entry-trigger");
      const trigger = document.createElement("span");
      trigger.className = "lesson-block-performance-entry";
      trigger.dataset.performanceEntryLessonId = String(block.firstLessonId);
      trigger.dataset.performanceEntryMode = performanceNavigationState.triggerMode;
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
      trigger.setAttribute("aria-label", performanceNavigationState.ariaLabel);
      trigger.title = performanceNavigationState.title;
      if (!performanceNavigationState.assessmentResolved) trigger.classList.add("is-unresolved");
      else if (performanceNavigationState.hasExistingAssessment) trigger.classList.add("has-existing-assessment");
      else trigger.classList.add("is-missing-assessment");
      trigger.textContent = performanceNavigationState.assessmentResolved ? (performanceNavigationState.hasExistingAssessment ? "✓" : "?") : "";
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); event.stopPropagation(); void this.requestPerformanceNavigation(block.firstLessonId, performanceNavigationState.triggerMode);
        }
      });
      chip.append(trigger);
    }
    const title = document.createElement("span");
    title.className = "title";
    if (block.courseId > 0) {
      title.classList.add("course-link");
      title.dataset.courseId = String(block.courseId);
      title.title = "Kursansicht öffnen";
    }
    const lines = String(block.displayText || "").split("\n").map((item) => String(item || "").trim()).filter(Boolean);
    title.textContent = block.courseName || lines[0] || "\u00a0";
    chip.append(title);
    const topicZone = document.createElement("div");
    topicZone.className = "topic-zone";
    const topicText = block.courseName ? lines.join(" ") : lines.slice(1).join(" ");
    if (isInlineEditing) {
      chip.classList.add("inline-editing");
      const input = document.createElement("div");
      input.className = "week-inline-topic-input";
      input.dataset.lessonId = String(block.firstLessonId);
      input.setAttribute("contenteditable", "true"); input.setAttribute("role", "textbox"); input.setAttribute("aria-label", "Thema bearbeiten"); input.setAttribute("spellcheck", "true");
      input.textContent = String(this.inlineTopicDraft || "");
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", () => {
        this.inlineTopicDraft = this._limitInlineWeekBlockTopicLength(input);
        this.syncInlineWeekBlockTopicInputSize(input);
        this.syncWeekLessonBlockTopicScale(chip);
      });
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); this.finishInlineWeekBlockTopicEdit(false); }
        else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); this.finishInlineWeekBlockTopicEdit(true); }
        else if (event.key === "Tab") { event.preventDefault(); this.finishInlineWeekBlockTopicEdit(true); }
      });
      input.addEventListener("blur", () => { if (Number(this.inlineTopicLessonId || 0) === block.firstLessonId) this.finishInlineWeekBlockTopicEdit(true); });
      topicZone.append(input);
    } else if (topicText) {
      const line = document.createElement("span"); line.className = "line"; line.textContent = topicText; topicZone.append(line);
    }
    chip.append(topicZone);
    return chip;
  }

  _createWeekBreakSupervisionCard(lesson) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "week-break-supervision";
    chip.dataset.breakSupervision = "1";
    chip.dataset.slotId = String(lesson.slotId || "");
    chip.dataset.date = String(lesson.lessonDate || "");
    chip.title = "Aufsicht bearbeiten";
    chip.textContent = `👀 ${String(lesson.courseName || "Aufsicht")}`;
    return chip;
  }

  renderWeekTable() {
    const year = this.activeSchoolYear;
    this.refs.weekTable.innerHTML = "";
    if (!year) {
      this.refs.weekTable.style.removeProperty("--week-row-height");
      this.refs.weekTable.style.setProperty("--week-block-font-scale", "1");
      return;
    }
    this.store.ensureLessonsForYear(year.id);
    const hoursPerDay = this.store.getHoursPerDay();
    this.refs.weekTable.style.setProperty("--hours-per-day", String(Math.max(1, hoursPerDay)));
    const days = [0, 1, 2, 3, 4].map((offset) => addDays(this.weekStartIso, offset));
    const highlightedSlot = this.getWeekHighlightSlot(days[0], days[4]);
    const lessons = this.store.listLessonsForWeek(year.id, days[0], days[4]);
    const performanceLookup = this.buildWeekPerformanceLookup(lessons);
    const ranges = this.store.listFreeRanges(year.id);
    const specialByDate = new Map(this.store.listSpecialDays().map((item) => [item.dayDate, item.name]));
    const dayOffByIso = new Map();
    days.forEach((dayIso) => {
      const range = ranges.find((item) => isoInDateRange(dayIso, item.startDate, item.endDate));
      const label = range ? String(range.label || "Unterrichtsfrei") : specialByDate.get(dayIso);
      if (label) dayOffByIso.set(dayIso, { label: String(label), kind: range ? "holiday" : "special" });
    });
    const blocksByDay = new Map(days.map((dayIso) => [dayIso, new Map()]));
    const breaksByDay = new Map(days.map((dayIso) => [dayIso, new Map()]));
    lessons.forEach((lesson) => {
      if (dayOffByIso.has(lesson.lessonDate)) return;
      if (lesson.slotPlacement === "break") {
        const breaks = breaksByDay.get(lesson.lessonDate);
        const breakAfterHour = Number(lesson.hour || 0);
        if (!breaks || breakAfterHour < 1 || breakAfterHour >= hoursPerDay) return;
        if (!breaks.has(breakAfterHour)) breaks.set(breakAfterHour, []);
        breaks.get(breakAfterHour).push(lesson);
        return;
      }
      const blocks = blocksByDay.get(lesson.lessonDate);
      if (!blocks) return;
      const key = `${lesson.lessonDate}|${lesson.slotId || lesson.id}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(lesson);
    });
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.append(document.createElement("th"));
    const todayIso = toIsoDate(new Date());
    days.forEach((dayIso, index) => {
      const th = document.createElement("th"); th.className = "day-head";
      if (dayIso === todayIso) th.classList.add("today");
      const dayOff = dayOffByIso.get(dayIso);
      if (dayOff) th.classList.add("day-off-head", dayOff.kind === "holiday" ? "holiday" : "special");
      th.innerHTML = `<span class="day-name">${DAYS_SHORT[index]}</span><span class="day-date">${formatDate(dayIso).slice(0, 6)}</span>`;
      headerRow.append(th);
    });
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    for (let hour = 1; hour <= hoursPerDay; hour += 1) {
      const tr = document.createElement("tr");
      const hourCell = document.createElement("td"); hourCell.className = "hour"; hourCell.textContent = String(hour); tr.append(hourCell);
      if (hour === 1) {
        days.forEach((dayIso, dayIndex) => {
          const dayOff = dayOffByIso.get(dayIso);
          const td = document.createElement("td"); td.rowSpan = hoursPerDay;
          if (dayOff) {
            td.className = `day-off-column ${dayOff.kind === "holiday" ? "holiday" : "special"}`;
            const label = document.createElement("div"); label.className = "day-off-label"; label.textContent = dayOff.label; td.append(label);
          } else {
            td.className = "day-cell week-day-grid-cell";
            const grid = document.createElement("div"); grid.className = "week-day-grid";
            for (let emptyHour = 1; emptyHour <= hoursPerDay; emptyHour += 1) {
              const empty = document.createElement("div"); empty.className = "week-day-empty";
              empty.dataset.weekEmpty = "1"; empty.dataset.day = String(dayIndex + 1); empty.dataset.hour = String(emptyHour);
              empty.title = "Doppelklick: Unterrichtsstunde anlegen"; empty.style.gridRow = String(emptyHour); grid.append(empty);
            }
            for (const breakAfterHour of BREAK_SUPERVISION_AFTER_HOURS) {
              if (breakAfterHour >= hoursPerDay) continue;
              const target = document.createElement("button");
              target.type = "button";
              target.className = "week-day-break-target";
              target.dataset.weekBreak = "1";
              target.dataset.day = String(dayIndex + 1);
              target.dataset.afterHour = String(breakAfterHour);
              target.title = "Aufsicht anlegen";
              target.setAttribute("aria-label", `Aufsicht nach der ${breakAfterHour}. Stunde anlegen`);
              target.style.setProperty("--break-after-hour", String(breakAfterHour));
              grid.append(target);
            }
            const layer = document.createElement("div"); layer.className = "week-day-card-layer";
            const blocks = this._assignWeekBlockLanes([...blocksByDay.get(dayIso).values()].map((rows) => this._buildWeekLessonBlock(rows.sort((a, b) => a.hour - b.hour))));
            blocks.forEach((block) => {
              const card = this._createWeekLessonCard(block, performanceLookup);
              if (breaksByDay.get(dayIso).has(Number(block.startHour) - 1)) {
                card.querySelector(".title.course-link")?.classList.add("after-break-supervision");
              }
              if (highlightedSlot && highlightedSlot.dayIso === dayIso
                && block.lessons.some((lesson) => Number(lesson.id) === Number(highlightedSlot.lessonId || 0))) {
                card.classList.add("highlighted-slot");
              }
              layer.append(card);
            });
            const breakLayer = document.createElement("div");
            breakLayer.className = "week-day-break-layer";
            for (const [breakAfterHour, breakLessons] of breaksByDay.get(dayIso).entries()) {
              const row = document.createElement("div");
              row.className = "week-break-supervision-row";
              row.style.setProperty("--break-after-hour", String(breakAfterHour));
              breakLessons
                .sort((left, right) => String(left.courseName || "").localeCompare(String(right.courseName || ""), "de"))
                .forEach((lesson) => row.append(this._createWeekBreakSupervisionCard(lesson)));
              breakLayer.append(row);
            }
            grid.append(layer, breakLayer); td.append(grid);
          }
          tr.append(td);
        });
      }
      tbody.append(tr);
    }
    this.refs.weekTable.append(thead, tbody);
    this.scheduleWeekLayoutScale();
  }

  renderLegacyWeekTable() {
    const year = this.activeSchoolYear;
    this.refs.weekTable.innerHTML = "";
    if (!year) {
      this.refs.weekTable.style.removeProperty("--week-row-height");
      this.refs.weekTable.style.setProperty("--week-block-font-scale", "1");
      return;
    }

    this.store.ensureLessonsForYear(year.id);
    const hoursPerDay = this.store.getHoursPerDay();
    this.refs.weekTable.style.setProperty("--hours-per-day", String(Math.max(1, hoursPerDay)));
    const days = [0, 1, 2, 3, 4].map((offset) => addDays(this.weekStartIso, offset));
    const highlightedSlot = this.getWeekHighlightSlot(days[0], days[4]);
    const lessons = this.store.listLessonsForWeek(year.id, days[0], days[4]);
    const performanceLookup = this.buildWeekPerformanceLookup(lessons);
    const lessonsByDayHour = new Map();
    for (const lesson of lessons) {
      const key = `${lesson.lessonDate}|${lesson.hour}`;
      if (!lessonsByDayHour.has(key)) {
        lessonsByDayHour.set(key, []);
      }
      lessonsByDayHour.get(key).push(lesson);
    }

    const ranges = this.store.listFreeRanges(year.id);
    const specialByDate = new Map(this.store.listSpecialDays().map((item) => [item.dayDate, item.name]));
    const dayOffByIso = new Map();
    for (const dayIso of days) {
      let dayOff = null;
      for (const range of ranges) {
        if (isoInDateRange(dayIso, range.startDate, range.endDate)) {
          dayOff = {
            label: String(range.label || "Unterrichtsfrei"),
            kind: "holiday"
          };
          break;
        }
      }
      if (!dayOff) {
        const specialLabel = specialByDate.get(dayIso);
        if (specialLabel) {
          dayOff = {
            label: String(specialLabel || "Unterrichtsfrei"),
            kind: "special"
          };
        }
      }
      if (dayOff) {
        dayOffByIso.set(dayIso, dayOff);
      }
    }

    const buildBlockMeta = (blockLessons) => {
      const topLesson = blockLessons[0];
      const allCanceled = blockLessons.every((entry) => entry.canceled);
      const anyCanceled = blockLessons.some((entry) => entry.canceled);
      const partialCanceled = anyCanceled && !allCanceled;
      const isNoLesson = Boolean(topLesson.noLesson);
      const isNoGrades = Boolean(topLesson.noGrades);
      const isEntfall = blockLessons.some((entry) => entry.isEntfall);
      const isWritten = blockLessons.some((entry) => entry.isWrittenExam);
      const topics = new Set(
        blockLessons
          .map((entry) => String(entry.topic || "").trim())
          .filter(Boolean)
      );
      const hasNotes = blockLessons.some((entry) => Boolean(String(entry.notes || "").trim()));

      let displayTopic = "";
      let rawTopic = "";
      if (allCanceled && topLesson.cancelLabel) {
        displayTopic = topLesson.cancelLabel;
      } else if (topics.size === 1) {
        rawTopic = [...topics][0];
        displayTopic = rawTopic;
      } else if (topics.size > 1) {
        displayTopic = "Mehrere Themen";
      }

      if (!allCanceled && (isEntfall || isWritten)) {
        displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
        rawTopic = displayTopic;
      }

      let background = "rgba(34, 41, 54, 0.84)";
      let foreground = "#0f1216";
      if (allCanceled) {
        background = "rgba(28, 34, 44, 1)";
        foreground = "#8b96a8";
      } else if (isNoLesson) {
        background = "rgba(120, 120, 120, 1)";
        foreground = "#0f1216";
      } else {
        const courseColor = normalizeCourseColor(topLesson.color, false);
        const tinted = lightenHex(courseColor, 0.1);
        background = colorToRgba(tinted, 1);
        foreground = readableTextColor(tinted);
        if (isEntfall) {
          foreground = "#000000";
        } else if (isWritten) {
          foreground = "#b91c1c";
        }
      }

      return {
        topLesson,
        courseId: Number(topLesson.courseId || 0),
        courseName: String(topLesson.courseName || ""),
        allCanceled,
        partialCanceled,
        isNoLesson,
        isNoGrades,
        isEntfall,
        isWritten,
        hasNotes,
        rawTopic,
        displayText: allCanceled
          ? (topLesson.cancelLabel || "Unterrichtsfrei")
          : formatPartialDisplay(displayTopic, partialCanceled),
        background,
        foreground,
        selectable: !allCanceled
      };
    };

    const dayBlockMap = new Map();
    for (const dayIso of days) {
      if (dayOffByIso.has(dayIso)) {
        continue;
      }
      const blocks = new Map();
      let hour = 1;
      while (hour <= hoursPerDay) {
        const rows = lessonsByDayHour.get(`${dayIso}|${hour}`) || [];
        if (rows.length === 0) {
          hour += 1;
          continue;
        }
        if (rows.length > 1) {
          const meta = buildBlockMeta(rows);
          blocks.set(hour, {
            ...meta,
            lessons: rows,
            firstLessonId: rows[0].id,
            rowSpan: 1
          });
          hour += 1;
          continue;
        }
        const startLesson = rows[0];
        const merged = [startLesson];
        let cursor = hour + 1;
        while (cursor <= hoursPerDay) {
          const nextRows = lessonsByDayHour.get(`${dayIso}|${cursor}`) || [];
          if (nextRows.length !== 1) {
            break;
          }
          const nextLesson = nextRows[0];
          if (Number(nextLesson.slotId) !== Number(startLesson.slotId)) {
            break;
          }
          merged.push(nextLesson);
          cursor += 1;
        }
        const meta = buildBlockMeta(merged);
        blocks.set(hour, {
          ...meta,
          lessons: merged,
          firstLessonId: merged[0].id,
          rowSpan: merged.length
        });
        hour = cursor;
      }
      dayBlockMap.set(dayIso, blocks);
    }

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const hourHead = document.createElement("th");
    hourHead.textContent = "";
    headerRow.append(hourHead);
    const todayIso = toIsoDate(new Date());

    days.forEach((dayIso, index) => {
      const th = document.createElement("th");
      th.className = "day-head";
      if (dayIso === todayIso) {
        th.classList.add("today");
      }
      const dayOff = dayOffByIso.get(dayIso);
      if (dayOff) {
        th.classList.add("day-off-head");
        th.classList.add(dayOff.kind === "holiday" ? "holiday" : "special");
      }
      th.innerHTML = `
        <span class="day-name">${DAYS_SHORT[index]}</span>
        <span class="day-date">${formatDate(dayIso).slice(0, 5)}</span>
      `;
      headerRow.append(th);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    const skipByDay = [0, 0, 0, 0, 0];
    for (let hour = 1; hour <= hoursPerDay; hour += 1) {
      const tr = document.createElement("tr");
      const hourCell = document.createElement("td");
      hourCell.className = "hour";
      hourCell.textContent = String(hour);
      tr.append(hourCell);

      for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
        const dayIso = days[dayIndex];
        const dayOff = dayOffByIso.get(dayIso);
        if (dayOff) {
          if (hour === 1) {
            const td = document.createElement("td");
            td.className = "day-off-column";
            td.classList.add(dayOff.kind === "holiday" ? "holiday" : "special");
            td.rowSpan = hoursPerDay;
            const label = document.createElement("div");
            label.className = "day-off-label";
            label.textContent = dayOff.label;
            td.append(label);
            tr.append(td);
          }
          continue;
        }

        if (skipByDay[dayIndex] > 0) {
          skipByDay[dayIndex] -= 1;
          continue;
        }

        const block = (dayBlockMap.get(dayIso) || new Map()).get(hour);
        if (block) {
          const td = document.createElement("td");
          td.className = "day-cell week-block-cell";
          const highlightLessonIdInBlock = highlightedSlot && highlightedSlot.dayIso === dayIso
            ? Number(highlightedSlot.lessonId || 0)
            : null;
          const blockContainsHighlightedHour = Boolean(
            highlightLessonIdInBlock
            && block.lessons.some((entry) => Number(entry.id) === highlightLessonIdInBlock)
          );
          if (block.rowSpan > 1) {
            td.rowSpan = block.rowSpan;
            skipByDay[dayIndex] = block.rowSpan - 1;
          }
          const isInlineEditing = Number(this.inlineTopicLessonId || 0) === Number(block.firstLessonId || 0);
          const chip = document.createElement(isInlineEditing ? "div" : "button");
          if (chip instanceof HTMLButtonElement) {
            chip.type = "button";
          }
          chip.className = "lesson-block";
          if (blockContainsHighlightedHour) {
            chip.classList.add("highlighted-slot");
          }
          chip.dataset.lessonId = String(block.firstLessonId);
          if (block.selectable) {
            chip.title = block.hasNotes
              ? "Linksklick: Thema bearbeiten / Rechtsklick: Weitere Aktionen"
              : "Linksklick: Thema bearbeiten / Rechtsklick: Weitere Aktionen";
          } else {
            chip.title = "Nicht bearbeitbar";
          }
          chip.style.background = block.background;
          chip.style.color = "#000000";
          if (block.allCanceled) {
            chip.classList.add("canceled");
          }
          if (block.isNoLesson) {
            chip.classList.add("no-lesson");
          }
          if (block.isEntfall) {
            chip.classList.add("entfall");
          }
          if (block.isWritten) {
            chip.classList.add("written");
          }
          if (block.partialCanceled) {
            chip.classList.add("partial");
          }
          if (block.lessons.some((entry) => entry.id === this.selectedLessonId)) {
            chip.classList.add("selected");
          }
          chip.dataset.noLesson = block.isNoLesson ? "1" : "0";
          if (!block.selectable) {
            chip.classList.add("not-selectable");
          }
          if (block.allCanceled && chip instanceof HTMLButtonElement) {
            chip.disabled = true;
          }
          const seatplanTriggerVisible = Boolean(
            block.selectable
            && !block.isNoLesson
            && !block.isNoGrades
            && Number(block.courseId || 0) > 0
          );
          if (seatplanTriggerVisible) {
            chip.classList.add("has-seatplan-trigger");
            const seatplanTrigger = document.createElement("span");
            seatplanTrigger.className = "lesson-block-seatplan-trigger";
            seatplanTrigger.dataset.seatplanLessonId = String(block.firstLessonId);
            seatplanTrigger.setAttribute("role", "button");
            seatplanTrigger.setAttribute("tabindex", "0");
            seatplanTrigger.setAttribute("aria-label", "Kurs-Sitzplan öffnen");
            seatplanTrigger.title = "Kurs-Sitzplan öffnen";
            seatplanTrigger.textContent = "🪑";
            seatplanTrigger.addEventListener("keydown", (keyEvent) => {
              if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
                return;
              }
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
              void this.requestSeatplanNavigation(block.firstLessonId);
            });
            chip.append(seatplanTrigger);
          }
          if (block.hasNotes && block.selectable) {
            const detailsTrigger = document.createElement("span");
            detailsTrigger.className = "lesson-block-details-trigger";
            detailsTrigger.dataset.detailPlanningLessonId = String(block.firstLessonId);
            detailsTrigger.setAttribute("role", "button");
            detailsTrigger.setAttribute("tabindex", "0");
            detailsTrigger.setAttribute("aria-label", "Detailplanung öffnen");
            detailsTrigger.title = "Detailplanung öffnen";
            detailsTrigger.textContent = "🔎";
            detailsTrigger.addEventListener("keydown", (keyEvent) => {
              if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                keyEvent.preventDefault(); keyEvent.stopPropagation(); this.openTopicDialog(block.firstLessonId);
              }
            });
            chip.append(detailsTrigger);
          }
          const performanceNavigationState = !block.isNoLesson && !block.isNoGrades
            ? this.getPerformanceNavigationStateForLesson(block.topLesson, performanceLookup)
            : null;
          if (performanceNavigationState) {
            chip.classList.add("has-performance-entry-trigger");
            if (performanceNavigationState.assessmentResolved && performanceNavigationState.hasExistingAssessment) {
              chip.classList.add("has-existing-performance-assessment");
            }
            const performanceEntryTrigger = document.createElement("span");
            performanceEntryTrigger.className = "lesson-block-performance-entry";
            if (!performanceNavigationState.assessmentResolved) {
              performanceEntryTrigger.classList.add("is-unresolved");
            } else if (performanceNavigationState.hasExistingAssessment) {
              performanceEntryTrigger.classList.add("has-existing-assessment");
            } else {
              performanceEntryTrigger.classList.add("is-missing-assessment");
            }
            performanceEntryTrigger.dataset.performanceEntryLessonId = String(block.firstLessonId);
            performanceEntryTrigger.dataset.performanceEntryMode = performanceNavigationState.triggerMode;
            performanceEntryTrigger.setAttribute("role", "button");
            performanceEntryTrigger.setAttribute("tabindex", "0");
            performanceEntryTrigger.setAttribute("aria-label", performanceNavigationState.ariaLabel);
            performanceEntryTrigger.title = performanceNavigationState.title;
            performanceEntryTrigger.textContent = performanceNavigationState.assessmentResolved
              ? (performanceNavigationState.hasExistingAssessment ? "✓" : "?")
              : "";
            performanceEntryTrigger.addEventListener("keydown", (keyEvent) => {
              if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
                return;
              }
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
              void this.requestPerformanceNavigation(block.firstLessonId, performanceNavigationState.triggerMode);
            });
            chip.append(performanceEntryTrigger);
          }
          const courseName = String(block.courseName || "").trim();
          const lines = String(block.displayText || "")
            .split("\n")
            .map((item) => String(item || "").trim())
            .filter(Boolean);
          const title = document.createElement("span");
          title.className = "title";
          if (block.courseId > 0) {
            title.classList.add("course-link");
            title.dataset.courseId = String(block.courseId);
            title.title = "Kursansicht öffnen";
          }
          title.textContent = courseName || lines[0] || "\u00a0";
          chip.append(title);
          const topicText = courseName
            ? lines.join(" ")
            : lines.slice(1).join(" ");
          const shouldShowTopicLine = Boolean(topicText) && !(
            courseName
            && false
          );
          if (isInlineEditing) {
            chip.classList.add("inline-editing");
          }
          const topicZone = document.createElement("div");
          topicZone.className = "topic-zone";
          if (isInlineEditing) {
            const input = document.createElement("div");
            input.className = "week-inline-topic-input";
            input.dataset.lessonId = String(block.firstLessonId);
            input.setAttribute("contenteditable", "true");
            input.setAttribute("role", "textbox");
            input.setAttribute("aria-label", "Thema bearbeiten");
            input.setAttribute("spellcheck", "true");
            input.textContent = String(this.inlineTopicDraft || "");
            input.addEventListener("click", (event) => {
              event.stopPropagation();
            });
            input.addEventListener("input", () => {
              this.inlineTopicDraft = this._limitInlineWeekBlockTopicLength(input);
              this.syncInlineWeekBlockTopicInputSize(input);
              this.syncWeekLessonBlockTopicScale(chip);
            });
            input.addEventListener("keyup", (event) => {
              event.stopPropagation();
            });
            input.addEventListener("keydown", (event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                this.finishInlineWeekBlockTopicEdit(false);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.finishInlineWeekBlockTopicEdit(true);
                return;
              }
              if (event.key === "Tab") {
                event.preventDefault();
                this.finishInlineWeekBlockTopicEdit(true);
                return;
              }
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                this._insertInlineWeekBlockTopicLineBreak(input);
                this.inlineTopicDraft = this._limitInlineWeekBlockTopicLength(input);
                this.syncInlineWeekBlockTopicInputSize(input);
              }
            });
            input.addEventListener("blur", () => {
              if (Number(this.inlineTopicLessonId || 0) !== Number(block.firstLessonId || 0)) {
                return;
              }
              this.finishInlineWeekBlockTopicEdit(true);
            });
            topicZone.append(input);
          } else if (shouldShowTopicLine) {
            const line = document.createElement("span");
            line.className = "line";
            line.textContent = topicText;
            topicZone.append(line);
          }
          chip.append(topicZone);
          td.append(chip);
          tr.append(td);
          continue;
        }

        const td = document.createElement("td");
        td.className = "day-cell empty";
        if (highlightedSlot && highlightedSlot.dayIso === dayIso && Number(highlightedSlot.hour) === hour) {
          td.classList.add("highlighted-slot");
        }
        td.dataset.day = String(dayIndex + 1);
        td.dataset.hour = String(hour);
        td.title = "Doppelklick: Unterrichtsstunde anlegen";
        tr.append(td);
      }

      tbody.append(tr);
    }

    this.refs.weekTable.append(thead, tbody);
    this.scheduleWeekLayoutScale();
  }

  renderLessonSection() {
    return;
  }

  getCourseTopicInputs() {
    if (!this.refs.courseTable) {
      return [];
    }
    return [...this.refs.courseTable.querySelectorAll("input.course-topic-input:not(:disabled)")];
  }

  saveCourseTopicInput(input) {
    const lessonId = Number(input?.dataset?.lessonId || 0);
    if (!lessonId) {
      return false;
    }
    this.store.updateLessonBlock(lessonId, {
      topic: input.value
    });
    this.renderWeekSection();
    this.renderCourseTimeline();
    this.renderLessonSection();
    return true;
  }

  findCourseTableBoundaryFocusTarget(input, direction) {
    const table = this.refs.courseTable;
    if (!table || !input || !direction) {
      return null;
    }
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(", ");
    const focusables = [...document.querySelectorAll(focusableSelector)].filter((element) => (
      element instanceof HTMLElement
      && !element.hidden
      && !element.closest("[hidden], [inert]")
      && element.getClientRects().length > 0
    ));
    const currentIndex = focusables.indexOf(input);
    if (currentIndex < 0) {
      return null;
    }
    for (let index = currentIndex + direction; index >= 0 && index < focusables.length; index += direction) {
      const candidate = focusables[index];
      if (!table.contains(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  handleCourseTopicInputKeyDown(event) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const input = event.target?.closest?.("input.course-topic-input");
    if (!input || input.disabled) {
      return false;
    }
    const topicInputs = this.getCourseTopicInputs();
    const currentIndex = topicInputs.indexOf(input);
    if (currentIndex < 0) {
      return false;
    }
    const direction = event.shiftKey ? -1 : 1;
    const targetInput = topicInputs[currentIndex + direction] || null;
    const targetLessonId = Number(targetInput?.dataset?.lessonId || 0);
    const boundaryTarget = targetInput
      ? null
      : this.findCourseTableBoundaryFocusTarget(input, direction);

    event.preventDefault();
    if (!this.saveCourseTopicInput(input)) {
      return false;
    }

    if (targetLessonId) {
      const nextInput = this.getCourseTopicInputs().find((candidate) => (
        Number(candidate.dataset.lessonId || 0) === targetLessonId
      ));
      nextInput?.focus();
    } else {
      boundaryTarget?.focus();
    }
    return true;
  }

  _buildCourseTableBlocks(lessons) {
    const lessonsByDate = new Map();
    for (const lesson of lessons) {
      if (!lessonsByDate.has(lesson.lessonDate)) {
        lessonsByDate.set(lesson.lessonDate, []);
      }
      lessonsByDate.get(lesson.lessonDate).push(lesson);
    }

    const blocks = [];
    const orderedDates = [...lessonsByDate.keys()].sort((a, b) => a.localeCompare(b));
    for (const dateIso of orderedDates) {
      const dayLessons = lessonsByDate.get(dateIso).sort((a, b) => a.hour - b.hour);
      let currentBlock = [];
      let lastHour = null;

      for (const lesson of dayLessons) {
        if (lastHour === null || lesson.hour === lastHour + 1) {
          currentBlock.push(lesson);
        } else {
          blocks.push(currentBlock);
          currentBlock = [lesson];
        }
        lastHour = lesson.hour;
      }

      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
    }

    return blocks;
  }

  renderCourseTimeline() {
    const year = this.activeSchoolYear;
    const course = year
      ? this.store.listCourses(year.id).find((item) => item.id === this.selectedCourseId)
      : null;

    this.refs.courseTable.innerHTML = "";
    this.refs.courseTable.classList.toggle("no-grades-course", Boolean(course?.noLesson));

    if (!year || !course) {
      this.refs.courseTitle.textContent = "";
      this.refs.courseTitle.style.color = "#000000";
      this.refs.courseTitle.style.background = "";
      this.refs.courseTitle.style.borderRadius = "";
      this.refs.courseTitle.style.padding = "0.34rem 1.35rem";
      this.refs.courseTitle.style.border = "1px solid transparent";
      return;
    }

    this.refs.courseTitle.textContent = course.name;
    this.refs.courseTitle.style.color = "#000000";
    this.refs.courseTitle.style.background = normalizeCourseColor(course.color, Boolean(course.noLesson));
    this.refs.courseTitle.style.borderRadius = "12px";
    this.refs.courseTitle.style.padding = "0.34rem 1.35rem";
    this.refs.courseTitle.style.border = "1px solid rgba(255, 255, 255, 0.25)";

    this.store.ensureLessonsForYear(year.id);
    const lessons = this.store.listLessonsForWeek(year.id, year.startDate, year.endDate, course.id);
    const blocks = this._buildCourseTableBlocks(lessons);
    const performanceLookup = this.buildWeekPerformanceLookup(lessons);

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>Datum</th>
        <th>Tag</th>
        <th>Dauer</th>
        ${course.noLesson ? "" : "<th>Noten</th>"}
        <th>Details</th>
        <th>Thema</th>
      </tr>
    `;

    const tbody = document.createElement("tbody");
    const todayIso = toIsoDate(new Date());
    let nextLessonRow = null;

    for (const block of blocks) {
      const topLesson = block[0];
      const allCanceled = block.every((lesson) => lesson.canceled);
      const cancelLabel = allCanceled ? topLesson.cancelLabel || "Unterrichtsfrei" : "";
      const topics = new Set(block.map((lesson) => String(lesson.topic || "").trim()).filter(Boolean));
      const notes = new Set(block.map((lesson) => String(lesson.notes || "").trim()).filter(Boolean));
      let displayTopic = "";
      let rawTopic = "";
      if (allCanceled && cancelLabel) {
        displayTopic = cancelLabel;
      } else if (topics.size === 1) {
        rawTopic = [...topics][0];
        displayTopic = rawTopic;
      } else if (topics.size > 1) {
        displayTopic = "Mehrere Themen";
      }

      const isEntfall = block.some((lesson) => lesson.isEntfall);
      const isWritten = block.some((lesson) => lesson.isWrittenExam);
      const hasNotes = notes.size > 0;
      if (!allCanceled && (isEntfall || isWritten)) {
        displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
        rawTopic = displayTopic;
      }

      const tr = document.createElement("tr");
      if (allCanceled) {
        tr.classList.add("course-row-canceled");
      }
      if (isEntfall) {
        tr.classList.add("course-row-entfall");
      }
      if (isWritten && !isEntfall) {
        tr.classList.add("course-row-written");
      }
      let isNextLesson = false;
      if (!nextLessonRow && !allCanceled && !isEntfall && topLesson.lessonDate > todayIso) {
        tr.classList.add("next-lesson-row");
        nextLessonRow = tr;
        isNextLesson = true;
      }
      const dateCell = document.createElement("td");
      const dateButton = document.createElement("button");
      dateButton.type = "button";
      dateButton.className = "course-date-link";
      dateButton.dataset.date = topLesson.lessonDate;
      dateButton.title = "Woche anzeigen";
      dateButton.textContent = formatDate(topLesson.lessonDate);
      dateCell.append(dateButton);
      const dayCell = document.createElement("td");
      dayCell.textContent = DAYS_SHORT[topLesson.dayOfWeek - 1];
      const durCell = document.createElement("td");
      durCell.textContent = String(block.length);
      durCell.style.textAlign = "center";
      const performanceCell = document.createElement("td");
      performanceCell.className = "course-performance-entry-cell";
      const topicCell = document.createElement("td");
      const notesCell = document.createElement("td");
      notesCell.className = "course-details-cell";

      const firstLessonId = topLesson.id;
      const performanceNavigationState = course.noLesson
        ? null
        : this.getPerformanceNavigationStateForLesson(topLesson, performanceLookup);
      tr.dataset.lessonId = String(firstLessonId);
      const contentWrap = document.createElement("div");
      contentWrap.className = "course-topic-wrap";
      if (isNextLesson) {
        const arrow = document.createElement("span");
        arrow.className = "next-lesson-arrow";
        arrow.textContent = "➜";
        arrow.setAttribute("aria-hidden", "true");
        contentWrap.append(arrow);
      }

      if (allCanceled) {
        const text = document.createElement("span");
        text.className = "muted";
        const italic = document.createElement("em");
        italic.textContent = displayTopic;
        text.append(italic);
        contentWrap.append(text);
      } else {
        const input = document.createElement("input");
        input.className = "course-topic-input";
        input.type = "text";
        input.value = rawTopic;
        input.maxLength = 240;
        input.dataset.lessonId = String(firstLessonId);
        input.dataset.isEntfall = isEntfall ? "1" : "0";
        input.dataset.isWritten = isWritten ? "1" : "0";
        if (isEntfall || isWritten) {
          input.disabled = true;
        }
        contentWrap.append(input);
      }
      if (performanceNavigationState) {
        const performanceButton = document.createElement("button");
        performanceButton.type = "button";
        performanceButton.className = "course-performance-entry-trigger";
        if (performanceNavigationState.hasExistingAssessment) {
          performanceButton.classList.add("has-existing-assessment");
        } else {
          performanceButton.classList.add("is-missing-assessment");
        }
        performanceButton.dataset.performanceEntryLessonId = String(firstLessonId);
        performanceButton.dataset.performanceEntryMode = performanceNavigationState.triggerMode;
        performanceButton.setAttribute("aria-label", performanceNavigationState.ariaLabel);
        performanceButton.title = performanceNavigationState.title;
        performanceButton.textContent = performanceNavigationState.hasExistingAssessment ? "✓" : "?";
        performanceCell.append(performanceButton);
      }
      topicCell.append(contentWrap);
      const notesWrap = document.createElement("div");
      notesWrap.className = "course-notes-wrap";
      if (allCanceled) {
        notesWrap.classList.add("muted");
      }
      if (!allCanceled) {
        const notesEditButton = document.createElement("button");
        notesEditButton.type = "button";
        notesEditButton.className = "course-notes-edit";
        notesEditButton.classList.toggle("is-empty", !hasNotes);
        notesEditButton.dataset.lessonId = String(firstLessonId);
        notesEditButton.setAttribute("aria-label", "Detailplanung bearbeiten");
        notesEditButton.title = "Detailplanung bearbeiten";
        notesEditButton.textContent = "🔎";
        notesWrap.append(notesEditButton);
      }
      notesCell.append(notesWrap);

      tr.append(dateCell, dayCell, durCell);
      if (!course.noLesson) {
        tr.append(performanceCell);
      }
      tr.append(notesCell, topicCell);
      tbody.append(tr);
    }

    this.refs.courseTable.append(thead, tbody);
    if (this.scrollCourseNextIntoView && nextLessonRow) {
      this.centerCourseRowInScrollPanel(nextLessonRow);
    }
    this.scrollCourseNextIntoView = false;
  }

  centerCourseRowInScrollPanel(row) {
    if (!row || !this.refs.courseTable) {
      return;
    }
    const panel = this.refs.courseTable.closest(".table-panel");
    if (!panel) {
      return;
    }
    const maxScrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    if (maxScrollTop <= 0) {
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const offsetWithinPanel = rowRect.top - panelRect.top;
    const targetTop = panel.scrollTop + offsetWithinPanel - ((panel.clientHeight - rowRect.height) / 2);
    panel.scrollTop = clamp(targetTop, 0, maxScrollTop);
  }

  resetSlotForm() {
    this.refs.slotId.value = "";
    this.refs.slotDay.value = "1";
    this.refs.slotHour.value = "1";
    this.refs.slotDuration.value = "1";
    this.refs.slotStart.value = "";
    this.refs.slotEnd.value = "";
    this.refs.slotParity.value = "0";
    this.refs.slotEditScope.value = "all";
    this.refs.slotEditFromDate.min = "";
    this.refs.slotEditFromDate.max = "";
    this.refs.slotEditFromDate.value = "";
    this.refs.slotDelete.hidden = true;
    this.syncSlotEditTools();
  }

}

installAppTooltips(document);

function initializePlanningApp() {
  installWorkspaceComponents(document);
  let app;
  try {
    app = new PlanningApp();
  } catch (error) {
    console.error('[TeachHelper] Planning module failed to start.', error);
    document.body.dataset.initializationError = error instanceof Error ? error.message : String(error || 'unknown');
    return;
  }
  installTutorialEntryHint(
    document.querySelector("#view-tutorial-btn"),
    "planning",
    "Planung"
  );
  const tutorialApi = {
    activate: () => app.activatePlanningTutorial(),
    showSurface: (surface) => app.showPlanningTutorialSurface(surface),
    cleanup: () => app.cleanupPlanningTutorial()
  };
  window.__teachhelperPlannerApp = app;
  window.__teachhelperPlanningTutorial = tutorialApi;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePlanningApp, { once: true });
} else {
  initializePlanningApp();
}
