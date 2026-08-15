import {
  deleteCourseCascadeInPlace,
  normalizeGradeCourseRelations,
  normalizePublicSchoolData
} from "../../shared/school-data/index.js";
import {
  calculateWeightedGrade,
  combineGradePeriods
} from "../../shared/school-data/grades.js";
import {
  assertGradeCourseIntegrity,
  assertGradeRosterUnchanged,
  validateGradeDelta
} from "../../shared/school-data/grade-integrity.js";
import {
  BACKUP_ENABLED_DEFAULT,
  BACKUP_INTERVAL_DEFAULT_DAYS,
  BACKUP_INTERVAL_MAX_DAYS,
  BACKUP_INTERVAL_MIN_DAYS,
  COLOR_PALETTE,
  DEFAULT_COURSE_COLOR,
  ENTFALL_TOPIC_DEFAULT,
  EXPECTATION_HORIZON_TEMPLATE_FILE_NAME,
  GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT,
  GRADE_ACCOMMODATION_TEXT_MAX_LENGTH,
  GRADE_EXPECTATION_HORIZON_COMMENT_MAX_LENGTH,
  GRADE_DISPLAY_SYSTEM_DEFAULT,
  GRADE_STUDENT_PERFORMANCE_FLAIRS,
  GRADE_TEST_AFB_OPTIONS,
  GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
  HOURS_PER_DAY_DEFAULT,
  NO_LESSON_COLOR,
  REQUIRED_HOLIDAYS,
  SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT,
  SHOW_GRADE_STUDENT_PORTRAITS_DEFAULT,
  WRITTEN_EXAM_TOPIC
} from "../../shared/school-data/defaults.js";


const EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT = [
  "Schriftliche Arbeiten dienen nicht nur der Leistungsfeststellung, sondern auch der Diagnose. Sie sind daher ein Zwischenschritt und nicht der Endpunkt Deines Lernprozesses. Entscheidend ist, dass Du noch bestehende Schwierigkeiten gezielt aufarbeitest.",
  "Im IServ-Aufgabenmodul findest Du passendes Übungsmaterial zu den grundlegenden Kompetenzen, bei denen sich in Deiner Arbeit noch Unsicherheiten gezeigt haben (<<Aufgabenlabel>> <<Aufgabenliste>>):",
  "1. Sieh Dir die Musterlösung der jeweiligen Aufgabe im IServ-Ordner sorgfältig an.",
  "2. Schau Dir das Erklärvideo unter dem im Aufgabenmodul verlinkten Applet an.",
  "3. Übe mit den Aufgaben im Applet.",
  "4. Lade einen Screenshot Deiner Bearbeitung im Aufgabenmodul hoch."
].join("\n");



function normalizeExpectationHorizonCommentTemplate(value = EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT) {
  if (value === undefined || value === null) {
    return EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT;
  }
  return String(value).replace(/\r\n?/g, "\n");
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








function createInitialGradeVaultState() {
  return {
    counters: {
      gradeStudent: 1,
      gradeAssessment: 1
    },
    gradeStructures: [],
    gradeAssessments: [],
    gradeStudents: [],
    gradeEntries: [],
    gradeOverrides: [],
    gradeImports: [],
    gradeSeatPlans: [],
    gradeAccommodations: []
  };
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



function dayOfWeekIso(iso) {
  const value = parseIsoDate(iso);
  const weekday = value.getDay();
  return weekday === 0 ? 7 : weekday;
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






function normalizeGradeTextPart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeGradePerformanceFlair(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return GRADE_STUDENT_PERFORMANCE_FLAIRS.includes(normalized) ? normalized : "";
}


function buildGradeStudentSortKey(lastName, firstName, id) {
  return [
    normalizeGradeTextPart(lastName).toLocaleLowerCase("de"),
    normalizeGradeTextPart(firstName).toLocaleLowerCase("de"),
    String(id || "")
  ].join("|");
}

function compareGradeStudents(a, b) {
  const aLast = normalizeGradeTextPart(a && a.lastName);
  const bLast = normalizeGradeTextPart(b && b.lastName);
  const byLast = aLast.localeCompare(bLast, "de", { sensitivity: "base" });
  if (byLast !== 0) {
    return byLast;
  }
  const aFirst = normalizeGradeTextPart(a && a.firstName);
  const bFirst = normalizeGradeTextPart(b && b.firstName);
  const byFirst = aFirst.localeCompare(bFirst, "de", { sensitivity: "base" });
  if (byFirst !== 0) {
    return byFirst;
  }
  return Number(a && a.id || 0) - Number(b && b.id || 0);
}


function normalizeGradeNumber(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(fallback) > 0 ? Number(fallback) : 1;
  }
  return parsed;
}

function normalizeGradeInteger(value, fallback = 1) {
  return Math.max(1, Math.round(normalizeGradeNumber(value, fallback)));
}







function isWeightedGradeAssessmentMode(mode) {
  const normalized = normalizeGradeAssessmentMode(mode);
  return normalized === "grade" || normalized === "test";
}

function normalizeGradeHalfYear(value) {
  return String(value || "").trim().toLowerCase() === "h2" ? "h2" : "h1";
}

const GRADE_TEST_SCALE_DEFAULT = "sek2";
const GRADE_TEST_SCALE_CUSTOM = "custom";
const GRADE_TEST_SCALE_IDS = ["sek1", "sek2", GRADE_TEST_SCALE_CUSTOM];
const GRADE_TEST_SCALE_GRADES = Array.from({ length: 16 }, (_item, index) => 15 - index);
const GRADE_DEFICIT_THRESHOLD_DEFAULT = 4;
const GRADE_TEST_SCALE_THRESHOLDS = {
  sek1: [
    [0.96, 15], [0.92, 14], [0.88, 13], [0.83, 12],
    [0.78, 11], [0.73, 10], [0.68, 9], [0.63, 8],
    [0.58, 7], [0.54, 6], [0.5, 5], [0.44, 4],
    [0.38, 3], [0.32, 2], [0.2, 1], [0, 0]
  ],
  sek2: [
    [0.95, 15], [0.9, 14], [0.85, 13], [0.8, 12],
    [0.75, 11], [0.7, 10], [0.65, 9], [0.6, 8],
    [0.55, 7], [0.5, 6], [0.45, 5], [0.4, 4],
    [0.33, 3], [0.27, 2], [0.2, 1], [0, 0]
  ]
};
GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_CUSTOM] = GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_DEFAULT];

function getGradeTestScaleDefaultLabel(scale = GRADE_TEST_SCALE_DEFAULT) {
  const normalized = normalizeGradeTestScale(scale);
  if (normalized === "sek1") {
    return "Sek I";
  }
  if (normalized === GRADE_TEST_SCALE_CUSTOM) {
    return "";
  }
  return "Sek II";
}

function cloneGradeTestThresholds(thresholds = GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_DEFAULT]) {
  return (Array.isArray(thresholds) ? thresholds : GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_DEFAULT])
    .map(([threshold, grade]) => [Number(threshold) || 0, clamp(Math.round(Number(grade) || 0), 0, 15)]);
}

function normalizeGradeAssessmentMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "homework" || normalized === "test") {
    return normalized;
  }
  return "grade";
}

function normalizeGradeAssessmentYearLevel(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Math.round(Number(text));
  return parsed >= 5 && parsed <= 13 ? parsed : null;
}

function isGradeAssessmentCourseLevelDisabled(yearLevel) {
  const normalized = normalizeGradeAssessmentYearLevel(yearLevel);
  return normalized === null || normalized < 12;
}

function normalizeGradeAssessmentCourseLevel(value, yearLevel = null) {
  if (isGradeAssessmentCourseLevelDisabled(yearLevel)) {
    return "";
  }
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "gk" || normalized === "lk" ? normalized : "";
}

function normalizeGradeAssessmentNumber(value) {
  const text = String(value ?? "").replace(/\D+/g, "").slice(0, 2);
  return text ? Number(text) : null;
}


function normalizeGradeAssessmentTopic(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function normalizeGradeAssessmentExamDurationMinutes(value) {
  const text = String(value ?? "").replace(/\D+/g, "").slice(0, 3);
  if (!text) {
    return null;
  }
  const parsed = Math.round(Number(text));
  return parsed >= 1 && parsed <= 999 ? parsed : null;
}

function normalizeGradeAssessmentExpectationHorizonTemplateFile(value = null) {
  if (!value || typeof value !== "object" || !value.bytes) {
    return null;
  }
  const sourceBytes = value.bytes instanceof Uint8Array
    ? value.bytes
    : (Array.isArray(value.bytes) ? value.bytes : []);
  const bytes = Array.from(sourceBytes)
    .map((byte) => clamp(Math.round(Number(byte) || 0), 0, 255));
  if (!bytes.length) {
    return null;
  }
  return {
    name: String(value.name || EXPECTATION_HORIZON_TEMPLATE_FILE_NAME),
    bytes
  };
}

function normalizeGradeTestScale(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sek1" || normalized === GRADE_TEST_SCALE_CUSTOM) {
    return normalized;
  }
  return GRADE_TEST_SCALE_DEFAULT;
}


function getDefaultGradeTestPredicateSuffixes(scale = GRADE_TEST_SCALE_DEFAULT) {
  return normalizeGradeTestScale(scale) !== "sek1";
}

function normalizeGradeTestPredicateSuffixes(value, fallback = true) {
  if (value === true || value === false) {
    return value;
  }
  if (value === 1 || value === "1") {
    return true;
  }
  if (value === 0 || value === "0") {
    return false;
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "ja" || text === "on") {
    return true;
  }
  if (text === "false" || text === "no" || text === "nein" || text === "off") {
    return false;
  }
  return Boolean(fallback);
}

function applyGradeTestPredicateSuffixes(value, enabled = true) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const grade = clamp(Math.round(Number(value) || 0), 0, 15);
  if (normalizeGradeTestPredicateSuffixes(enabled, true) || grade === 0) {
    return grade;
  }
  return Math.max(0, (Math.floor((grade - 1) / 3) * 3) + 2);
}

function normalizeGradeTestThresholds(thresholds = null, fallback = null) {
  const fallbackThresholds = cloneGradeTestThresholds(
    fallback || GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_DEFAULT]
  );
  const fallbackByGrade = new Map(fallbackThresholds.map(([threshold, grade]) => [Number(grade), Number(threshold)]));
  const source = Array.isArray(thresholds) ? thresholds : [];
  const sourceByGrade = new Map();
  source.forEach((entry, index) => {
    let threshold;
    let grade;
    if (Array.isArray(entry)) {
      threshold = entry[0];
      grade = entry[1];
    } else if (entry && typeof entry === "object") {
      threshold = entry.threshold;
      grade = entry.grade;
    }
    const normalizedGrade = clamp(Math.round(Number(grade ?? (15 - index)) || 0), 0, 15);
    const numericThreshold = Number(threshold);
    if (Number.isFinite(numericThreshold)) {
      sourceByGrade.set(normalizedGrade, clamp(numericThreshold, 0, 1));
    }
  });
  return GRADE_TEST_SCALE_GRADES.map((grade) => {
    const threshold = grade === 0
      ? 0
      : (
        sourceByGrade.has(grade)
          ? sourceByGrade.get(grade)
          : (fallbackByGrade.has(grade) ? fallbackByGrade.get(grade) : 0)
      );
    return [Number(threshold) || 0, grade];
  });
}

function buildDefaultGradeTestScaleSettings() {
  return {
    sek1: {
      id: "sek1",
      label: "Sek I",
      thresholds: cloneGradeTestThresholds(GRADE_TEST_SCALE_THRESHOLDS.sek1)
    },
    sek2: {
      id: "sek2",
      label: "Sek II",
      thresholds: cloneGradeTestThresholds(GRADE_TEST_SCALE_THRESHOLDS.sek2)
    },
    custom: {
      id: GRADE_TEST_SCALE_CUSTOM,
      label: "",
      thresholds: cloneGradeTestThresholds(GRADE_TEST_SCALE_THRESHOLDS[GRADE_TEST_SCALE_DEFAULT])
    }
  };
}

function normalizeGradeTestScaleTemplate(rawTemplate = null, scale = GRADE_TEST_SCALE_DEFAULT, fallback = null) {
  const normalizedScale = normalizeGradeTestScale(scale);
  const source = rawTemplate && typeof rawTemplate === "object" ? rawTemplate : {};
  const fallbackTemplate = fallback && typeof fallback === "object"
    ? fallback
    : buildDefaultGradeTestScaleSettings()[normalizedScale];
  const fixedLabel = normalizedScale === "sek1"
    ? "Sek I"
    : (normalizedScale === "sek2" ? "Sek II" : "");
  const rawLabel = normalizedScale === GRADE_TEST_SCALE_CUSTOM
    ? normalizeGradeTextPart(source.label).slice(0, 40)
    : fixedLabel;
  return {
    id: normalizedScale,
    label: rawLabel,
    thresholds: normalizeGradeTestThresholds(source.thresholds, fallbackTemplate.thresholds)
  };
}

function normalizeGradeTestScaleSettings(rawSettings = null) {
  const defaults = buildDefaultGradeTestScaleSettings();
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  return {
    sek1: normalizeGradeTestScaleTemplate(source.sek1, "sek1", defaults.sek1),
    sek2: normalizeGradeTestScaleTemplate(source.sek2, "sek2", defaults.sek2),
    custom: normalizeGradeTestScaleTemplate(source.custom, GRADE_TEST_SCALE_CUSTOM, defaults.custom)
  };
}

function getGradeTestScaleTemplate(settings = null, scale = GRADE_TEST_SCALE_DEFAULT) {
  const normalizedSettings = normalizeGradeTestScaleSettings(settings);
  const normalizedScale = normalizeGradeTestScale(scale);
  return normalizedSettings[normalizedScale] || normalizedSettings[GRADE_TEST_SCALE_DEFAULT];
}

function listVisibleGradeTestScaleTemplates(settings = null) {
  const normalized = normalizeGradeTestScaleSettings(settings);
  const templates = [normalized.sek1, normalized.sek2];
  if (String(normalized.custom.label || "").trim()) {
    templates.push(normalized.custom);
  }
  return templates;
}

function buildGradeTestScaleSnapshot(settings = null, scale = GRADE_TEST_SCALE_DEFAULT) {
  const template = getGradeTestScaleTemplate(settings, scale);
  const fallbackLabel = getGradeTestScaleDefaultLabel(template.id);
  return {
    id: normalizeGradeTestScale(template.id),
    label: String(template.label || fallbackLabel || "").trim(),
    thresholds: cloneGradeTestThresholds(template.thresholds)
  };
}

function normalizeGradeTestScaleSnapshot(snapshot = null, scale = GRADE_TEST_SCALE_DEFAULT, settings = null) {
  const normalizedScale = normalizeGradeTestScale(snapshot?.id || scale);
  const fallback = buildGradeTestScaleSnapshot(settings, normalizedScale);
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const label = String(source.label || fallback.label || getGradeTestScaleDefaultLabel(normalizedScale) || "").trim();
  return {
    id: normalizedScale,
    label,
    thresholds: normalizeGradeTestThresholds(source.thresholds, fallback.thresholds)
  };
}



function parseGradeBeValue(raw) {
  const text = String(raw ?? "").trim().replace(".", ",");
  if (!text) {
    return { valid: true, value: null };
  }
  if (!/^\d+(?:,\d)?$/.test(text)) {
    return { valid: false, value: null };
  }
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || Math.abs(value * 2 - Math.round(value * 2)) > 0.0000001) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Math.round(value * 2) / 2 };
}



function normalizeGradeTestScores(scores = {}) {
  const source = scores && typeof scores === "object" ? scores : {};
  return Object.entries(source).reduce((result, [taskId, rawValue]) => {
    const key = String(taskId || "").trim();
    const parsed = parseGradeBeValue(rawValue);
    if (key && parsed.valid && parsed.value !== null) {
      result[key] = parsed.value;
    }
    return result;
  }, {});
}

function hasGradeTestScores(scores = {}) {
  return Object.keys(normalizeGradeTestScores(scores)).length > 0;
}



function normalizeCompetenceExpectationId(value, fallback = "") {
  const text = String(value || fallback || "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return text || String(fallback || "").trim();
}

function normalizeGradeCompetenceExpectations(items = []) {
  const source = Array.isArray(items) ? items : [];
  const usedTopicIds = new Set();
  const usedCompetenceIds = new Set();
  const makeUnique = (rawId, fallback, used) => {
    const base = normalizeCompetenceExpectationId(rawId, fallback) || fallback;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id;
  };
  return source.reduce((result, rawTopic, topicIndex) => {
    const item = rawTopic && typeof rawTopic === "object" ? rawTopic : {};
    const topic = String(item.topic || item.title || "").trim();
    const competenceSource = Array.isArray(item.competencies) ? item.competencies : [];
    const competencies = competenceSource.reduce((competenceResult, rawCompetence, competenceIndex) => {
      const competenceItem = rawCompetence && typeof rawCompetence === "object"
        ? rawCompetence
        : { text: rawCompetence };
      const text = String(competenceItem.text || competenceItem.label || "").trim();
      if (!text) {
        return competenceResult;
      }
      competenceResult.push({
        id: makeUnique(competenceItem.id, `k${topicIndex + 1}-${competenceIndex + 1}`, usedCompetenceIds),
        text
      });
      return competenceResult;
    }, []);
    if (!topic || !competencies.length) {
      return result;
    }
    result.push({
      id: makeUnique(item.id, `t${topicIndex + 1}`, usedTopicIds),
      topic,
      competencies
    });
    return result;
  }, []);
}

function getGradeCompetenceExpectationIds(items = []) {
  const ids = [];
  normalizeGradeCompetenceExpectations(items).forEach((topic) => {
    topic.competencies.forEach((competence) => {
      ids.push(competence.id);
    });
  });
  return ids;
}

function normalizeGradeTaskCompetenceExpectationIds(ids = [], expectations = null) {
  const source = Array.isArray(ids) ? ids : [];
  const validIds = expectations === null ? null : new Set(getGradeCompetenceExpectationIds(expectations));
  const seen = new Set();
  return source.reduce((result, rawId) => {
    const id = normalizeCompetenceExpectationId(rawId);
    if (!id || seen.has(id) || (validIds && !validIds.has(id))) {
      return result;
    }
    seen.add(id);
    result.push(id);
    return result;
  }, []);
}

function normalizeGradeTestTasks(tasks = [], options = {}) {
  const source = Array.isArray(tasks) ? tasks : [];
  const usedIds = new Set();
  const normalized = source.reduce((result, raw, index) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const idBase = String(item.id || index + 1).trim() || String(index + 1);
    let id = idBase;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const parsedMaxBe = parseGradeBeValue(item.maxBe);
    result.push({
      id,
      title: normalizeGradeTextPart(item.title) || `Aufgabe ${result.length + 1}`,
      maxBe: parsedMaxBe.valid && parsedMaxBe.value !== null ? parsedMaxBe.value : null,
      afb: normalizeGradeTestAfb(item.afb),
      deficitDiagnosisFollowUp: item.deficitDiagnosisFollowUp === true,
      competenceExpectationIds: normalizeGradeTaskCompetenceExpectationIds(item.competenceExpectationIds),
      customCompetenceText: String(item.customCompetenceText || "").trim(),
      sortOrder: Number(item.sortOrder || index + 1)
    });
    return result;
  }, []).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  if (!normalized.length && options.ensureDefault !== false) {
    normalized.push({
      id: "1",
      title: "Aufgabe 1",
      maxBe: null,
      afb: "",
      deficitDiagnosisFollowUp: false,
      competenceExpectationIds: [],
      customCompetenceText: "",
      sortOrder: 1
    });
  }
  return normalized.map((task, index) => ({
    ...task,
    sortOrder: index + 1
  }));
}



function calculateGradeTestRatio(tasks = [], scores = {}) {
  const normalizedTasks = normalizeGradeTestTasks(tasks, { ensureDefault: false })
    .filter((task) => Number(task.maxBe || 0) > 0);
  const normalizedScores = normalizeGradeTestScores(scores);
  const hasAnyScore = normalizedTasks.some((task) => Object.prototype.hasOwnProperty.call(normalizedScores, task.id));
  if (!normalizedTasks.length || !hasAnyScore) {
    return null;
  }
  const maxSum = normalizedTasks.reduce((sum, task) => sum + Number(task.maxBe || 0), 0);
  if (maxSum <= 0) {
    return null;
  }
  const earnedSum = normalizedTasks.reduce((sum, task) => {
    const rawScore = Object.prototype.hasOwnProperty.call(normalizedScores, task.id)
      ? Number(normalizedScores[task.id] || 0)
      : 0;
    return sum + clamp(rawScore, 0, Number(task.maxBe || 0));
  }, 0);
  const ratio = clamp(earnedSum / maxSum, 0, 1);
  return {
    earnedSum,
    maxSum,
    ratio,
    percent: Math.round(ratio * 1000) / 10
  };
}








function calculateGradeTestValue(tasks = [], scores = {}, scale = GRADE_TEST_SCALE_DEFAULT, settings = null, predicateSuffixes = true) {
  const ratioState = calculateGradeTestRatio(tasks, scores);
  if (!ratioState) {
    return null;
  }
  return calculateGradeTestValueFromRatio(ratioState, scale, settings, predicateSuffixes);
}

function calculateGradeTestValueFromRatio(ratioState = null, scale = GRADE_TEST_SCALE_DEFAULT, settings = null, predicateSuffixes = true) {
  if (!ratioState || Number(ratioState.maxSum || 0) <= 0) {
    return null;
  }
  const ratio = ratioState.ratio;
  const thresholds = scale && typeof scale === "object"
    ? normalizeGradeTestScaleSnapshot(scale, scale.id, settings).thresholds
    : buildGradeTestScaleSnapshot(settings, scale).thresholds;
  const match = thresholds.find(([threshold]) => ratio + 0.0000001 >= threshold);
  return applyGradeTestPredicateSuffixes(match ? match[1] : 0, predicateSuffixes);
}






function normalizeGradeEntryChecked(value) {
  if (value === true || value === 1) {
    return true;
  }
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}


function normalizeGradeOverrideScope(scope) {
  const value = String(scope || "").trim().toLowerCase();
  return value === "course" || value === "category" || value === "subcategory" ? value : "";
}

function normalizeGradePeriod(period) {
  const value = String(period || "").trim().toLowerCase();
  return value === "h1" || value === "h2" || value === "year" ? value : "year";
}


function normalizeGradeTestAfb(value) {
  const text = String(value || "").trim().toUpperCase();
  return GRADE_TEST_AFB_OPTIONS.includes(text) ? text : "";
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




function parsePedagogicalGradeValue(raw, maxValue = 15) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { valid: true, value: null };
  }
  if (!/^\d+(?:[.,]\d{1})?$/.test(text)) {
    return { valid: false, value: null };
  }
  const value = Number(text.replace(",", "."));
  const normalizedMax = Number.isFinite(maxValue) ? Math.max(0, Number(maxValue) || 0) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value < 0 || value > normalizedMax) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Math.round(value * 10) / 10 };
}



function parseGradeValue(raw, maxValue = Number.POSITIVE_INFINITY) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { valid: true, value: null };
  }
  if (!/^\d+$/.test(text)) {
    return { valid: false, value: null };
  }
  const value = Number(text);
  const normalizedMax = Number.isFinite(maxValue) ? Math.max(0, Math.round(Number(maxValue) || 0)) : Number.POSITIVE_INFINITY;
  if (!Number.isInteger(value) || value < 0 || value > normalizedMax) {
    return { valid: false, value: null };
  }
  return { valid: true, value };
}






















function normalizeGradeStructureWeight(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const fallbackNumber = Number(fallback);
    return Number.isFinite(fallbackNumber) && fallbackNumber >= 0 ? fallbackNumber : 1;
  }
  return parsed;
}

function normalizeGradeStructureWeights(weights = null, fallback = 1) {
  const source = weights && typeof weights === "object" ? weights : {};
  const fallbackWeight = normalizeGradeStructureWeight(fallback, 1);
  return {
    h1: normalizeGradeStructureWeight(source.h1, fallbackWeight),
    h2: normalizeGradeStructureWeight(source.h2, fallbackWeight)
  };
}

function getGradeStructurePeriodWeight(item = null, period = "h1") {
  const normalizedPeriod = normalizeGradeHalfYear(period);
  const fallback = normalizeGradeStructureWeight(item && item.weight, 1);
  const weights = normalizeGradeStructureWeights(item && item.weights, fallback);
  return weights[normalizedPeriod];
}


function normalizeGradeStructureDraft(categories) {
  if (!Array.isArray(categories)) {
    return [];
  }
  return categories.map((category) => {
    const fallbackWeight = normalizeGradeStructureWeight(category && category.weight, 1);
    const weights = normalizeGradeStructureWeights(category && category.weights, fallbackWeight);
    return {
      id: Number(category && category.id) || 0,
      name: normalizeGradeTextPart(category && category.name),
      weight: weights.h1,
      weights,
      subcategories: Array.isArray(category && category.subcategories)
        ? category.subcategories.map((subcategory) => {
          const subcategoryFallbackWeight = normalizeGradeStructureWeight(subcategory && subcategory.weight, 1);
          const subcategoryWeights = normalizeGradeStructureWeights(subcategory && subcategory.weights, subcategoryFallbackWeight);
          return {
            id: Number(subcategory && subcategory.id) || 0,
            name: normalizeGradeTextPart(subcategory && subcategory.name),
            weight: subcategoryWeights.h1,
            weights: subcategoryWeights,
          };
        })
        : [],
    };
  });
}

function normalizeGradeStructurePeriodDraft(categories) {
  if (!Array.isArray(categories)) {
    return [];
  }
  return categories.map((category) => ({
    id: Number(category && category.id) || 0,
    name: normalizeGradeTextPart(category && category.name),
    weight: normalizeGradeStructureWeight(category && category.weight, 1),
    subcategories: Array.isArray(category && category.subcategories)
      ? category.subcategories.map((subcategory) => ({
        id: Number(subcategory && subcategory.id) || 0,
        name: normalizeGradeTextPart(subcategory && subcategory.name),
        weight: normalizeGradeStructureWeight(subcategory && subcategory.weight, 1),
      }))
      : [],
  }));
}

function normalizeGradeStructurePeriodCategories(source = null) {
  const record = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const legacyCategories = Array.isArray(source)
    ? source
    : (Array.isArray(record.categories) ? record.categories : []);
  const periodCategories = record.periodCategories && typeof record.periodCategories === "object"
    ? record.periodCategories
    : {};
  return {
    h1: Array.isArray(periodCategories.h1)
      ? normalizeGradeStructurePeriodDraft(periodCategories.h1)
      : normalizeGradeStructurePeriodDraft(buildGradeStructureForPeriod(legacyCategories, "h1")),
    h2: Array.isArray(periodCategories.h2)
      ? normalizeGradeStructurePeriodDraft(periodCategories.h2)
      : normalizeGradeStructurePeriodDraft(buildGradeStructureForPeriod(legacyCategories, "h2"))
  };
}

function createEmptyGradeStructureWeightOverridePeriod() {
  return { categories: {}, subcategories: {} };
}

function normalizeGradeStructureWeightOverridePeriod(rawPeriod = null) {
  const source = rawPeriod && typeof rawPeriod === "object" ? rawPeriod : {};
  const normalizeMap = (rawMap) => {
    const result = {};
    if (!rawMap || typeof rawMap !== "object") {
      return result;
    }
    Object.entries(rawMap).forEach(([key, value]) => {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return;
      }
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        return;
      }
      const normalizedValue = normalizeGradeStructureWeight(parsedValue, 0);
      result[normalizedKey] = normalizedValue;
    });
    return result;
  };
  return {
    categories: normalizeMap(source.categories),
    subcategories: normalizeMap(source.subcategories)
  };
}

function normalizeGradeStructurePerformanceFlairWeightOverrides(rawOverrides = null) {
  const source = rawOverrides && typeof rawOverrides === "object" ? rawOverrides : {};
  const result = {};
  GRADE_STUDENT_PERFORMANCE_FLAIRS.forEach((flair) => {
    const flairSource = source[flair] && typeof source[flair] === "object" ? source[flair] : {};
    const normalizedFlair = {};
    ["h1", "h2"].forEach((period) => {
      const normalizedPeriod = normalizeGradeStructureWeightOverridePeriod(flairSource[period]);
      if (Object.keys(normalizedPeriod.categories).length > 0 || Object.keys(normalizedPeriod.subcategories).length > 0) {
        normalizedFlair[period] = normalizedPeriod;
      }
    });
    if (Object.keys(normalizedFlair).length > 0) {
      result[flair] = normalizedFlair;
    }
  });
  return result;
}

function materializeGradeStructurePerformanceFlairWeightOverrides(periodCategories, rawOverrides = null) {
  const normalizedByPeriod = normalizeGradeStructurePeriodCategories({ periodCategories });
  const result = normalizeGradeStructurePerformanceFlairWeightOverrides(rawOverrides);
  GRADE_STUDENT_PERFORMANCE_FLAIRS.forEach((flair) => {
    if (!result[flair]) {
      result[flair] = {};
    }
    ["h1", "h2"].forEach((period) => {
      const categories = normalizedByPeriod[period] || [];
      const periodOverrides = normalizeGradeStructureWeightOverridePeriod(result[flair][period]);
      categories.forEach((category, categoryIndex) => {
        const categoryKey = getGradeStructureOverrideKeyForCategory(category, categoryIndex);
        if (!Object.prototype.hasOwnProperty.call(periodOverrides.categories, categoryKey)) {
          periodOverrides.categories[categoryKey] = normalizeGradeStructureWeight(category.weight, 1);
        }
        (category.subcategories || []).forEach((subcategory, subcategoryIndex) => {
          const subcategoryKey = getGradeStructureOverrideKeyForSubcategory(subcategory, categoryIndex, subcategoryIndex);
          if (!Object.prototype.hasOwnProperty.call(periodOverrides.subcategories, subcategoryKey)) {
            periodOverrides.subcategories[subcategoryKey] = normalizeGradeStructureWeight(subcategory.weight, 1);
          }
        });
      });
      result[flair][period] = periodOverrides;
    });
  });
  return normalizeGradeStructurePerformanceFlairWeightOverrides(result);
}

function getGradeStructureOverrideKeyForCategory(category, categoryIndex) {
  const id = Number(category && category.id) || 0;
  return id > 0 ? String(id) : `index:${Number(categoryIndex) || 0}`;
}

function getGradeStructureOverrideKeyForSubcategory(subcategory, categoryIndex, subcategoryIndex) {
  const id = Number(subcategory && subcategory.id) || 0;
  return id > 0 ? String(id) : `index:${Number(categoryIndex) || 0}:${Number(subcategoryIndex) || 0}`;
}

function getGradeStructureWeightOverrideValue(overrides, flair, period, scope, key) {
  const normalizedFlair = normalizeGradePerformanceFlair(flair);
  const normalizedPeriod = normalizeGradeHalfYear(period);
  if (!normalizedFlair || !key) {
    return null;
  }
  const periodOverrides = overrides?.[normalizedFlair]?.[normalizedPeriod];
  const map = scope === "subcategory" ? periodOverrides?.subcategories : periodOverrides?.categories;
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) {
    return null;
  }
  const parsedValue = Number(map[key]);
  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? normalizeGradeStructureWeight(parsedValue, 0)
    : null;
}


function applyGradeStructurePerformanceFlairWeightOverrides(categories, overrides, flair, period) {
  const normalizedFlair = normalizeGradePerformanceFlair(flair);
  const normalizedPeriod = normalizeGradeHalfYear(period);
  const sourceCategories = normalizeGradeStructurePeriodDraft(categories);
  if (!normalizedFlair) {
    return sourceCategories;
  }
  return sourceCategories.map((category, categoryIndex) => {
    const categoryKey = getGradeStructureOverrideKeyForCategory(category, categoryIndex);
    const categoryOverride = getGradeStructureWeightOverrideValue(
      overrides,
      normalizedFlair,
      normalizedPeriod,
      "category",
      categoryKey
    );
    return {
      ...category,
      weight: categoryOverride === null ? category.weight : categoryOverride,
      subcategories: (category.subcategories || []).map((subcategory, subcategoryIndex) => {
        const subcategoryKey = getGradeStructureOverrideKeyForSubcategory(subcategory, categoryIndex, subcategoryIndex);
        const subcategoryOverride = getGradeStructureWeightOverrideValue(
          overrides,
          normalizedFlair,
          normalizedPeriod,
          "subcategory",
          subcategoryKey
        );
        return {
          ...subcategory,
          weight: subcategoryOverride === null ? subcategory.weight : subcategoryOverride
        };
      })
    };
  });
}

function normalizePercentWeights(items) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const total = normalizedItems.reduce((sum, item) => sum + Math.max(0, Number(item && item.weight) || 0), 0);
  if (normalizedItems.length === 0) {
    return [];
  }
  if (total <= 0) {
    const equalWeight = Number((100 / normalizedItems.length).toFixed(2));
    return normalizedItems.map((item, index) => ({
      ...item,
      weight: index === normalizedItems.length - 1
        ? Number((100 - equalWeight * (normalizedItems.length - 1)).toFixed(2))
        : equalWeight,
    }));
  }
  if (Math.abs(total - 100) < 0.0001) {
    return normalizedItems.map((item) => ({ ...item, weight: Number(item.weight) || 0 }));
  }
  let consumed = 0;
  return normalizedItems.map((item, index) => {
    if (index === normalizedItems.length - 1) {
      return {
        ...item,
        weight: Number((100 - consumed).toFixed(2)),
      };
    }
    const percent = Number((((Math.max(0, Number(item && item.weight) || 0) / total) * 100)).toFixed(2));
    consumed += percent;
    return {
      ...item,
      weight: percent,
    };
  });
}


function normalizeGradeStructurePeriodPercentDraft(categories) {
  const normalizedCategories = normalizePercentWeights(normalizeGradeStructurePeriodDraft(categories));
  return normalizedCategories.map((category) => ({
    ...category,
    subcategories: normalizePercentWeights(category.subcategories || [])
  }));
}

function normalizeGradeStructurePeriodCategoriesPercentDraft(source = null) {
  const periodCategories = normalizeGradeStructurePeriodCategories(source);
  return {
    h1: normalizeGradeStructurePeriodPercentDraft(periodCategories.h1),
    h2: normalizeGradeStructurePeriodPercentDraft(periodCategories.h2)
  };
}

function buildGradeStructureForPeriod(categories, period = "h1") {
  const normalizedPeriod = normalizeGradeHalfYear(period);
  return normalizeGradeStructureDraft(categories).map((category) => ({
    ...category,
    weight: getGradeStructurePeriodWeight(category, normalizedPeriod),
    subcategories: (category.subcategories || []).map((subcategory) => ({
      ...subcategory,
      weight: getGradeStructurePeriodWeight(subcategory, normalizedPeriod)
    }))
  }));
}

function createDefaultGradeStructureDraft() {
  return [
    {
      id: 0,
      name: "Schriftlich",
      weight: 50,
      weights: { h1: 50, h2: 50 },
      subcategories: [{ id: 0, name: "Arbeiten", weight: 100, weights: { h1: 100, h2: 100 } }],
    },
    {
      id: 0,
      name: "Mündlich",
      weight: 50,
      weights: { h1: 50, h2: 50 },
      subcategories: [
        { id: 0, name: "Beteiligung", weight: 80, weights: { h1: 80, h2: 80 } },
        { id: 0, name: "Kurze Lernkontrolle", weight: 20, weights: { h1: 20, h2: 20 } }
      ],
    },
  ];
}

function stripGradeStructureIds(categories) {
  return normalizeGradeStructurePeriodDraft(categories).map((category) => ({
    id: 0,
    name: category.name,
    weight: normalizeGradeStructureWeight(category.weight, 1),
    subcategories: (category.subcategories || []).map((subcategory) => ({
      id: 0,
      name: subcategory.name,
      weight: normalizeGradeStructureWeight(subcategory.weight, 1)
    }))
  }));
}

function normalizeDefaultGradeStructureSetting(value = null) {
  const source = value && typeof value === "object"
    ? value
    : { periodCategories: normalizeGradeStructurePeriodCategoriesPercentDraft(createDefaultGradeStructureDraft()) };
  const normalized = normalizeGradeStructurePeriodCategoriesPercentDraft(source);
  return {
    periodCategories: {
      h1: stripGradeStructureIds(normalized.h1),
      h2: stripGradeStructureIds(normalized.h2)
    }
  };
}

function createDefaultGradeStructureSetting() {
  return normalizeDefaultGradeStructureSetting({
    periodCategories: normalizeGradeStructurePeriodCategoriesPercentDraft(createDefaultGradeStructureDraft())
  });
}

function normalizeGradeExpectationHorizonComment(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, GRADE_EXPECTATION_HORIZON_COMMENT_MAX_LENGTH);
}

const GRADE_STUDENT_PORTRAIT_MIME = "image/webp";
const GRADE_STUDENT_PORTRAIT_MAX_BYTES = 150 * 1024;
const GRADE_STUDENT_PORTRAIT_MAX_BASE64_LENGTH = Math.ceil(GRADE_STUDENT_PORTRAIT_MAX_BYTES * 4 / 3) + 8;

function normalizeGradeStudentPortrait(value) {
  if (!isRecord(value) || value.mime !== GRADE_STUDENT_PORTRAIT_MIME) return null;
  const data = typeof value.data === "string" ? value.data.trim() : "";
  if (!data || data.length > GRADE_STUDENT_PORTRAIT_MAX_BASE64_LENGTH) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return null;
  const padding = data.endsWith("==") ? 2 : (data.endsWith("=") ? 1 : 0);
  if (((data.length * 3) / 4) - padding > GRADE_STUDENT_PORTRAIT_MAX_BYTES) return null;
  return { mime: GRADE_STUDENT_PORTRAIT_MIME, data };
}

function compareGradeAssessmentsByOrder(left, right) {
  const sortLeft = Number(left?.sortOrder || 0);
  const sortRight = Number(right?.sortOrder || 0);
  if (sortLeft !== sortRight) {
    return sortLeft - sortRight;
  }
  const createdLeft = String(left?.createdAt || "");
  const createdRight = String(right?.createdAt || "");
  if (createdLeft !== createdRight) {
    return createdLeft.localeCompare(createdRight);
  }
  return Number(left?.id || 0) - Number(right?.id || 0);
}

function getGradeAssessmentOrderGroupKey(assessment) {
  return [
    Number(assessment?.courseId || 0),
    normalizeGradeHalfYear(assessment?.halfYear),
    Number(assessment?.categoryId || 0),
    Number(assessment?.subcategoryId || 0)
  ].join(":");
}

function normalizeGradeOccurrenceCategories(rawCategories = null) {
  const source = Array.isArray(rawCategories) ? rawCategories : [];
  const seenIds = new Set();
  const seenNames = new Set();
  let nextId = 1;
  const categories = [];
  source.forEach((raw) => {
    const name = normalizeGradeTextPart(raw?.name).slice(0, 48);
    const nameKey = name.toLocaleLowerCase('de');
    if (!name || seenNames.has(nameKey)) return;
    let id = Number(raw?.id) || 0;
    while (id <= 0 || seenIds.has(id)) id = nextId++;
    nextId = Math.max(nextId, id + 1);
    seenIds.add(id);
    seenNames.add(nameKey);
    categories.push({
      id,
      name,
      emoji: normalizeGradeOccurrenceCategoryEmoji(raw?.emoji),
      polarity: normalizeGradeOccurrenceCategoryPolarity(raw?.polarity)
    });
  });
  return categories.length ? categories : [{ id: 1, name: 'Vorkommnis', emoji: '', polarity: 'negative' }];
}

function normalizeGradeOccurrenceCategoryEmoji(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  const match = source.match(/(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/u);
  return match ? match[0] : '';
}

function normalizeGradeOccurrenceCategoryPolarity(value) {
  return String(value || '').trim().toLowerCase() === 'positive' ? 'positive' : 'negative';
}




function createInitialState() {
  return {
    counters: {
      schoolYear: 1,
      course: 1,
      slot: 1,
      freeRange: 1,
      specialDay: 1,
      lesson: 1,
      gradeCategory: 1,
      gradeSubcategory: 1,
      gradeAssessment: 1
    },
    settings: {
      activeSchoolYearId: null,
      hoursPerDay: HOURS_PER_DAY_DEFAULT,
      lessonTimes: buildDefaultLessonTimes(HOURS_PER_DAY_DEFAULT),
      showHiddenSidebarCourses: SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT,
      showGradeStudentPortraits: SHOW_GRADE_STUDENT_PORTRAITS_DEFAULT,
      gradesPrivacyGraphThreshold: GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT,
      gradeTestScaleSettings: buildDefaultGradeTestScaleSettings(),
      gradeOccurrenceCategories: normalizeGradeOccurrenceCategories(),
      defaultGradeStructure: createDefaultGradeStructureSetting(),
      expectationHorizonLocation: "",
      expectationHorizonCommentTemplate: EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT,
      gradeCourseStudentCounts: {},
      gradeCourseStudentCountsComplete: false,
      gradeVaultEncryptionEnabled: GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
      backupEnabled: BACKUP_ENABLED_DEFAULT,
      backupIntervalDays: BACKUP_INTERVAL_DEFAULT_DAYS,
      lastAutoBackupAt: null
    },
    schoolYears: [],
    courses: [],
    slots: [],
    freeRanges: [],
    specialDays: [],
    lessons: []
  };
}

export function getDefaultSchoolYearStartYear(date = new Date()) {
  const today = date instanceof Date ? date : new Date(date);
  const year = today.getFullYear();
  return today.getMonth() >= 6 ? year : year - 1;
}

export class WorkspaceStore {
  constructor() {
    this.onAfterPublicSave = null;
    this.onAfterGradeVaultSave = null;
    this.saveHooksSuspended = 0;
    this.pendingPublicSaveNotification = false;
    this.pendingGradeVaultSaveNotification = false;
    this.state = this._load();
    this.gradeVaultState = createInitialGradeVaultState();
    this.normalizeCourseColors();
    this.ensureDefaultSchoolYear();
    for (const year of this.state.schoolYears) {
      const startYear = Number(String(year.startDate).slice(0, 4));
      this.seedHolidayDefaults(year.id, startYear);
    }
    const active = this.getActiveSchoolYear();
    if (active && this.state.specialDays.length === 0) {
      const startYear = Number(String(active.startDate).slice(0, 4));
      this.resetSpecialDays(startYear);
    }
    this._save();
  }

  _load() {
    return createInitialState();
  }

  _save() {
    if (this.saveHooksSuspended > 0) {
      this.pendingPublicSaveNotification = true;
      return;
    }
    if (typeof this.onAfterPublicSave === "function") {
      try {
        this.onAfterPublicSave(this.state);
      } catch (_error) {
      }
    }
  }

  _saveGradeVault() {
    if (this.saveHooksSuspended > 0) {
      this.pendingGradeVaultSaveNotification = true;
      return;
    }
    if (typeof this.onAfterGradeVaultSave === "function") {
      try {
        this.onAfterGradeVaultSave(this.gradeVaultState);
      } catch (_error) {
      }
    }
  }

  setAfterSaveHooks({ publicChange = null, gradeVaultChange = null } = {}) {
    this.onAfterPublicSave = typeof publicChange === "function" ? publicChange : null;
    this.onAfterGradeVaultSave = typeof gradeVaultChange === "function" ? gradeVaultChange : null;
  }

  _flushDeferredSaveHooks() {
    const flushPublic = this.pendingPublicSaveNotification;
    const flushGradeVault = this.pendingGradeVaultSaveNotification;
    this.pendingPublicSaveNotification = false;
    this.pendingGradeVaultSaveNotification = false;
    if (flushPublic && typeof this.onAfterPublicSave === "function") {
      try {
        this.onAfterPublicSave(this.state);
      } catch (_error) {
      }
    }
    if (flushGradeVault && typeof this.onAfterGradeVaultSave === "function") {
      try {
        this.onAfterGradeVaultSave(this.gradeVaultState);
      } catch (_error) {
      }
    }
  }

  _suspendSaveHooks() {
    this.saveHooksSuspended += 1;
  }

  _resumeSaveHooks({ flush = true } = {}) {
    if (this.saveHooksSuspended > 0) {
      this.saveHooksSuspended -= 1;
    }
    if (flush && this.saveHooksSuspended === 0) {
      this._flushDeferredSaveHooks();
    }
  }

  _nextId(type) {
    const value = this.state.counters[type] || 1;
    this.state.counters[type] = value + 1;
    return value;
  }

  normalizeCourseColors() {
    if (!Array.isArray(this.state.courses)) {
      return;
    }
    for (const course of this.state.courses) {
      if (!course || typeof course !== "object") {
        continue;
      }
      const isNoLesson = Boolean(course.noLesson);
      course.subject = isNoLesson ? "" : String(course.subject || "");
      course.noLesson = isNoLesson;
      course.noGrades = Boolean(course.noGrades);
      course.hiddenInSidebar = Boolean(course.hiddenInSidebar);
      if (isNoLesson) {
        course.previousColor = normalizeHexColor(
          course.previousColor,
          DEFAULT_COURSE_COLOR
        );
      } else {
        course.previousColor = normalizeCourseColor(course.color, false);
      }
      course.color = normalizeCourseColor(course.color, isNoLesson);
    }
  }

  seedHolidayDefaults(schoolYearId, startYear) {
    const yearId = Number(schoolYearId);
    if (!yearId) {
      return;
    }
    const byLabel = new Map();
    for (const item of this.state.freeRanges.filter((row) => Number(row.schoolYearId) === yearId)) {
      const normalized = String(item.label || "").trim().toLowerCase();
      if (!byLabel.has(normalized)) {
        byLabel.set(normalized, []);
      }
      byLabel.get(normalized).push(item);
    }
    for (const rows of byLabel.values()) {
      rows.sort((a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || "")));
    }

    let changed = false;
    for (const spec of requiredHolidayRowSpecs()) {
      const label = spec.label;
      const rows = byLabel.get(label.toLowerCase()) || [];
      if (rows[spec.occurrence]) {
        continue;
      }
      const [startDate, endDate] = defaultHolidayRangeForRow(startYear, label, spec.occurrence);
      if (!startDate && !endDate) {
        continue;
      }
      this.state.freeRanges.push({
        id: this._nextId("freeRange"),
        schoolYearId: yearId,
        label,
        startDate,
        endDate
      });
      changed = true;
    }
    if (changed) {
      this.applyDayOffs(yearId);
    }
  }

  getSetting(key, fallback = null) {
    const value = this.state.settings[key];
    return value === undefined || value === null ? fallback : value;
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this._save();
  }

  getHoursPerDay() {
    const value = Number(this.getSetting("hoursPerDay", HOURS_PER_DAY_DEFAULT));
    return clamp(Number.isNaN(value) ? HOURS_PER_DAY_DEFAULT : value, 1, 12);
  }

  setHoursPerDay(value) {
    const hours = clamp(Number(value) || HOURS_PER_DAY_DEFAULT, 1, 12);
    this.state.settings.hoursPerDay = hours;
    const active = this.getActiveSchoolYear();
    if (active) {
      this.generateLessonsForYear(active.id);
    }
    this._save();
    return hours;
  }

  getLessonTimes(hoursPerDay = this.getHoursPerDay()) {
    return normalizeLessonTimes(this.getSetting("lessonTimes", []), hoursPerDay);
  }

  setLessonTimes(lessonTimes, hoursPerDay = this.getHoursPerDay()) {
    const normalized = normalizeLessonTimes(lessonTimes, hoursPerDay);
    this.state.settings.lessonTimes = normalized;
    this._save();
    return normalized;
  }

  getGradesPrivacyGraphThreshold() {
    const value = Number(this.getSetting("gradesPrivacyGraphThreshold", GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT));
    const fallback = Number.isNaN(value) ? GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT : value;
    return clamp(fallback, 0, 50);
  }

  setGradesPrivacyGraphThreshold(value) {
    const threshold = clamp(Number(value) || 0, 0, 50);
    this.state.settings.gradesPrivacyGraphThreshold = threshold;
    this._save();
    return threshold;
  }

  getGradeTestScaleSettings() {
    this.state.settings.gradeTestScaleSettings = normalizeGradeTestScaleSettings(this.state.settings.gradeTestScaleSettings);
    return cloneJsonValue(this.state.settings.gradeTestScaleSettings, buildDefaultGradeTestScaleSettings());
  }

  setGradeTestScaleSettings(settings = null) {
    this.state.settings.gradeTestScaleSettings = normalizeGradeTestScaleSettings(settings);
    this._save();
    return this.getGradeTestScaleSettings();
  }

  getDefaultGradeStructure() {
    this.state.settings.defaultGradeStructure = normalizeDefaultGradeStructureSetting(
      this.state.settings.defaultGradeStructure
    );
    return cloneJsonValue(this.state.settings.defaultGradeStructure, createDefaultGradeStructureSetting());
  }

  setDefaultGradeStructure(structure = null) {
    this.state.settings.defaultGradeStructure = normalizeDefaultGradeStructureSetting(structure);
    this._save();
    return this.getDefaultGradeStructure();
  }

  getExpectationHorizonLocation() {
    return String(this.getSetting("expectationHorizonLocation", "") || "").trim();
  }

  setExpectationHorizonLocation(value = "") {
    const location = String(value || "").trim();
    this.state.settings.expectationHorizonLocation = location;
    this._save();
    return location;
  }

  getExpectationHorizonCommentTemplate() {
    return normalizeExpectationHorizonCommentTemplate(
      this.getSetting("expectationHorizonCommentTemplate", EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT)
    );
  }

  setExpectationHorizonCommentTemplate(value = "") {
    const template = normalizeExpectationHorizonCommentTemplate(value);
    this.state.settings.expectationHorizonCommentTemplate = template;
    this._save();
    return template;
  }

  getGradeVaultEncryptionEnabled() {
    return Boolean(this.getSetting("gradeVaultEncryptionEnabled", GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT));
  }

  setGradeVaultEncryptionEnabled(enabled) {
    this.state.settings.gradeVaultEncryptionEnabled = Boolean(enabled);
    this._save();
    return this.getGradeVaultEncryptionEnabled();
  }

  getGradeDisplaySystem() {
    return GRADE_DISPLAY_SYSTEM_DEFAULT;
  }

  setGradeDisplaySystem(value) {
    void value;
    delete this.state.settings.gradeDisplaySystem;
    this._save();
    return GRADE_DISPLAY_SYSTEM_DEFAULT;
  }

  getBackupEnabled() {
    const value = this.getSetting("backupEnabled", BACKUP_ENABLED_DEFAULT);
    if (typeof value === "string") {
      return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
  }

  setBackupEnabled(enabled) {
    this.state.settings.backupEnabled = Boolean(enabled);
    this._save();
    return this.getBackupEnabled();
  }

  getBackupIntervalDays() {
    const raw = Number(this.getSetting("backupIntervalDays", BACKUP_INTERVAL_DEFAULT_DAYS));
    const value = Number.isNaN(raw) ? BACKUP_INTERVAL_DEFAULT_DAYS : raw;
    return clamp(value, BACKUP_INTERVAL_MIN_DAYS, BACKUP_INTERVAL_MAX_DAYS);
  }

  setBackupIntervalDays(days) {
    const value = clamp(
      Number(days) || BACKUP_INTERVAL_DEFAULT_DAYS,
      BACKUP_INTERVAL_MIN_DAYS,
      BACKUP_INTERVAL_MAX_DAYS
    );
    this.state.settings.backupIntervalDays = value;
    this._save();
    return value;
  }

  getLastAutoBackupAt() {
    const value = this.getSetting("lastAutoBackupAt", null);
    return value ? String(value) : null;
  }

  setLastAutoBackupAt(isoDateTime) {
    this.state.settings.lastAutoBackupAt = isoDateTime ? String(isoDateTime) : null;
    this._save();
  }

  listSchoolYears() {
    return [...this.state.schoolYears].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  getSchoolYear(id) {
    return this.state.schoolYears.find((item) => item.id === Number(id)) || null;
  }

  getSchoolYearForDate(isoDate) {
    const sorted = [...this.state.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return sorted.find((item) => item.startDate <= isoDate && item.endDate >= isoDate) || null;
  }

  getLatestSchoolYear() {
    const sorted = [...this.state.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return sorted[0] || null;
  }

  ensureDefaultSchoolYear() {
    if (this.state.schoolYears.length > 0) {
      const active = this.getActiveSchoolYear();
      if (!active) {
        const latest = this.getLatestSchoolYear();
        if (latest) {
          this.state.settings.activeSchoolYearId = latest.id;
          this._save();
        }
      }
      return null;
    }
    const startYear = getDefaultSchoolYearStartYear();
    const startDate = `${startYear}-08-01`;
    const endDate = `${startYear + 1}-07-31`;
    const year = {
      id: this._nextId("schoolYear"),
      name: `${startYear}/${startYear + 1}`,
      startDate,
      endDate
    };
    this.state.schoolYears.push(year);
    this.state.settings.activeSchoolYearId = year.id;
    this._save();
    return year;
  }

  createSchoolYear(startYear) {
    const year = Number(startYear);
    if (!year || Number.isNaN(year)) {
      return null;
    }
    const startDate = `${year}-08-01`;
    const endDate = `${year + 1}-07-31`;
    const existing = this.state.schoolYears.find((item) => item.startDate === startDate);
    if (existing) {
      return null;
    }
    const created = {
      id: this._nextId("schoolYear"),
      name: `${year}/${year + 1}`,
      startDate,
      endDate
    };
    this.state.schoolYears.push(created);
    this.state.settings.activeSchoolYearId = created.id;
    this.seedHolidayDefaults(created.id, year);
    this._save();
    return created;
  }

  buildNewDatabasePublicState(startYear) {
    const year = Number(startYear);
    const publicState = this.normalizePublicState(null);
    if (!Number.isInteger(year) || year < 1900 || year > 9998) {
      return publicState;
    }

    const schoolYear = {
      id: 1,
      name: `${year}/${year + 1}`,
      startDate: `${year}-08-01`,
      endDate: `${year + 1}-07-31`,
    };
    const sourceYear = this.state.schoolYears.find((item) => (
      String(item?.startDate || '') === schoolYear.startDate
      && String(item?.endDate || '') === schoolYear.endDate
    ));
    const sourceFreeRanges = sourceYear
      ? this.state.freeRanges.filter((item) => Number(item?.schoolYearId) === Number(sourceYear.id))
      : requiredHolidayRowSpecs().flatMap((spec) => {
        const [startDate, endDate] = defaultHolidayRangeForRow(year, spec.label, spec.occurrence);
        return startDate || endDate ? [{ label: spec.label, startDate, endDate }] : [];
      });
    const sourceSpecialDays = sourceYear
      ? this.state.specialDays.filter((item) => (
        String(item?.dayDate || '') >= schoolYear.startDate
        && String(item?.dayDate || '') <= schoolYear.endDate
      ))
      : defaultSpecialDays(year);

    publicState.schoolYears = [schoolYear];
    publicState.settings = { ...publicState.settings, activeSchoolYearId: schoolYear.id };
    publicState.freeRanges = sourceFreeRanges.map((item, index) => ({
      id: index + 1,
      schoolYearId: schoolYear.id,
      label: String(item?.label || ''),
      startDate: item?.startDate ? String(item.startDate) : '',
      endDate: item?.endDate ? String(item.endDate) : '',
    }));
    publicState.specialDays = sourceSpecialDays.map((item, index) => ({
      id: index + 1,
      name: String(item?.name || ''),
      dayDate: String(item?.dayDate || ''),
    }));
    publicState.counters = {
      ...publicState.counters,
      schoolYear: 2,
      freeRange: publicState.freeRanges.length + 1,
      specialDay: publicState.specialDays.length + 1,
    };
    return this.normalizePublicState(publicState);
  }

  getActiveSchoolYear() {
    const stored = Number(this.getSetting("activeSchoolYearId"));
    if (stored) {
      const found = this.getSchoolYear(stored);
      if (found) {
        return found;
      }
    }
    const forToday = this.getSchoolYearForDate(toIsoDate(new Date()));
    if (forToday) {
      return forToday;
    }
    return this.getLatestSchoolYear();
  }

  setActiveSchoolYear(schoolYearId) {
    const year = this.getSchoolYear(schoolYearId);
    if (year) {
      if (Number(this.state.settings.activeSchoolYearId) !== Number(year.id)) {
        this.state.settings.activeSchoolYearId = year.id;
        this._save();
      }
    }
    return year;
  }

  listCourses(schoolYearId) {
    const yearId = Number(schoolYearId);
    return this.state.courses
      .filter((item) => item.schoolYearId === yearId)
      .sort((a, b) => {
        const orderA = Number(a.sortOrder || 0);
        const orderB = Number(b.sortOrder || 0);
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return String(a.name).localeCompare(String(b.name), "de");
      });
  }

  createCourse(schoolYearId, name, color, noLesson = false, hiddenInSidebar = false, subject = "") {
    const yearId = Number(schoolYearId);
    const cleanName = String(name || "").trim();
    const cleanSubject = Boolean(noLesson) ? "" : String(subject || "").trim();
    if (!cleanName) {
      return null;
    }
    const duplicate = this.state.courses.find(
      (item) => item.schoolYearId === yearId && item.name === cleanName
    );
    if (duplicate) {
      return null;
    }
    const courseNoLesson = Boolean(noLesson);
    const existingColors = this.listCourses(yearId).map((item) => item.color);
    const resolvedColor = courseNoLesson
      ? NO_LESSON_COLOR
      : (color || suggestColor(existingColors));
    const course = {
      id: this._nextId("course"),
      schoolYearId: yearId,
      name: cleanName,
      subject: cleanSubject,
      color: normalizeCourseColor(resolvedColor, courseNoLesson),
      previousColor: courseNoLesson ? null : normalizeCourseColor(resolvedColor, false),
      noLesson: courseNoLesson,
      noGrades: false,
      hiddenInSidebar: Boolean(hiddenInSidebar),
      sortOrder: this.listCourses(yearId).length + 1
    };
    this.state.courses.push(course);
    this.generateLessonsForYear(yearId);
    this._save();
    return course.id;
  }

  updateCourse(schoolYearId, courseId, name, color, noLesson = false, hiddenInSidebar = undefined, subject = undefined) {
    const yearId = Number(schoolYearId);
    const id = Number(courseId);
    const cleanName = String(name || "").trim();
    const duplicate = this.state.courses.find(
      (item) => item.schoolYearId === yearId && item.id !== id && item.name === cleanName
    );
    if (duplicate) {
      return false;
    }
    const course = this.state.courses.find((item) => item.id === id);
    if (!course) {
      return false;
    }
    const courseNoLesson = Boolean(noLesson);
    course.name = cleanName;
    course.subject = courseNoLesson
      ? ""
      : (subject === undefined ? String(course.subject || "") : String(subject || "").trim());
    course.noLesson = courseNoLesson;
    course.noGrades = Boolean(course.noGrades);
    if (hiddenInSidebar === undefined) {
      course.hiddenInSidebar = Boolean(course.hiddenInSidebar);
    } else {
      course.hiddenInSidebar = Boolean(hiddenInSidebar);
    }
    if (courseNoLesson) {
      const backupColor = normalizeCourseColor(
        color || course.previousColor || course.color,
        false
      );
      course.previousColor = backupColor;
      course.color = normalizeCourseColor(null, true);
    } else {
      const resolvedColor = normalizeCourseColor(
        color || course.previousColor || course.color,
        false
      );
      course.previousColor = resolvedColor;
      course.color = resolvedColor;
    }
    this._save();
    return true;
  }

  setCourseSidebarHidden(schoolYearId, courseId, hiddenInSidebar = true) {
    const yearId = Number(schoolYearId);
    const id = Number(courseId);
    const course = this.state.courses.find((item) => item.id === id && item.schoolYearId === yearId);
    if (!course) {
      return false;
    }
    course.hiddenInSidebar = Boolean(hiddenInSidebar);
    this._save();
    return true;
  }

  setCourseNoGrades(schoolYearId, courseId, noGrades = true) {
    const yearId = Number(schoolYearId);
    const id = Number(courseId);
    const course = this.state.courses.find((item) => item.id === id && item.schoolYearId === yearId);
    if (!course) {
      return false;
    }
    course.noGrades = Boolean(noGrades);
    this._save();
    return true;
  }

  updateCourseOrder(schoolYearId, orderedIds) {
    const yearId = Number(schoolYearId);
    const normalized = orderedIds.map((id) => Number(id)).filter((id) => id > 0);
    if (normalized.length === 0) {
      return;
    }
    const orderMap = new Map();
    normalized.forEach((id, index) => {
      orderMap.set(id, index + 1);
    });

    let nextOrder = normalized.length + 1;
    for (const course of this.state.courses) {
      if (course.schoolYearId !== yearId) {
        continue;
      }
      if (orderMap.has(course.id)) {
        course.sortOrder = orderMap.get(course.id);
      } else {
        course.sortOrder = nextOrder;
        nextOrder += 1;
      }
    }
    this._save();
  }

  deleteCourse(courseId) {
    const id = Number(courseId);
    const course = this.state.courses.find((item) => item.id === id);
    if (!course) {
      return;
    }
    const cascade = deleteCourseCascadeInPlace(this.state, this.gradeVaultState, id);
    if (!cascade.changed) {
      return;
    }
    this._save();
    this._saveGradeVault();
  }

  getGradeOccurrenceCategories() {
    this.state.settings.gradeOccurrenceCategories = normalizeGradeOccurrenceCategories(
      this.state.settings.gradeOccurrenceCategories
    );
    return cloneJsonValue(this.state.settings.gradeOccurrenceCategories, normalizeGradeOccurrenceCategories());
  }

  setGradeOccurrenceCategories(categories = null) {
    this.state.settings.gradeOccurrenceCategories = normalizeGradeOccurrenceCategories(categories);
    this._save();
    return this.getGradeOccurrenceCategories();
  }

  listGradeStudents(courseId) {
    const id = Number(courseId);
    return this.gradeVaultState.gradeStudents
      .filter((student) => Number(student.courseId) === id)
      .slice()
      .sort(compareGradeStudents);
  }

  getGradeStudentPerformanceFlair(studentId, courseId = null) {
    const id = Number(studentId) || 0;
    const courseKey = Number(courseId) || 0;
    const student = this.gradeVaultState.gradeStudents.find((item) => (
      Number(item.id) === id
      && (!courseKey || Number(item.courseId) === courseKey)
    ));
    return normalizeGradePerformanceFlair(student && student.performanceFlair);
  }

  getGradeStructure(courseId) {
    const id = Number(courseId);
    const row = this.gradeVaultState.gradeStructures.find((item) => Number(item.courseId) === id);
    if (!row) {
      return { courseId: id, categories: [], periodCategories: { h1: [], h2: [] }, performanceFlairWeightOverrides: {} };
    }
    const periodCategories = normalizeGradeStructurePeriodCategories(row);
    return {
      courseId: id,
      categories: periodCategories.h1,
      periodCategories,
      performanceFlairWeightOverrides: normalizeGradeStructurePerformanceFlairWeightOverrides(row.performanceFlairWeightOverrides)
    };
  }

  getGradeStructureForPeriod(courseId, period = "h1", performanceFlair = "") {
    const structure = this.getGradeStructure(courseId);
    const normalizedPeriod = normalizeGradeHalfYear(period);
    const categories = normalizeGradeStructurePeriodDraft(structure.periodCategories?.[normalizedPeriod] || structure.categories);
    return {
      courseId: structure.courseId,
      categories: applyGradeStructurePerformanceFlairWeightOverrides(
        categories,
        structure.performanceFlairWeightOverrides,
        performanceFlair,
        normalizedPeriod
      )
    };
  }

  saveGradeStructure(courseId, categoriesOrPeriodCategories, performanceFlairWeightOverrides = null) {
    const id = Number(courseId);
    const sourcePeriodCategories = Array.isArray(categoriesOrPeriodCategories)
      ? normalizeGradeStructurePeriodCategories({ categories: categoriesOrPeriodCategories })
      : normalizeGradeStructurePeriodCategories({ periodCategories: categoriesOrPeriodCategories });
    const sourceIdsByPeriod = Object.fromEntries(["h1", "h2"].map((period) => {
      const categories = sourcePeriodCategories[period] || [];
      return [period, {
        categoryIds: new Set(categories.map((category) => Number(category.id) || 0).filter(Boolean)),
        categoryHasSubcategories: new Map(categories.map((category) => [
          Number(category.id) || 0,
          Array.isArray(category.subcategories) && category.subcategories.length > 0
        ])),
        subcategoryIdsByCategory: new Map(categories.map((category) => [
          Number(category.id) || 0,
          new Set((category.subcategories || [])
            .map((subcategory) => Number(subcategory.id) || 0)
            .filter(Boolean))
        ]))
      }];
    }));
    const removedAssessmentReference = this.gradeVaultState.gradeAssessments.find((assessment) => {
      if (Number(assessment.courseId) !== id) {
        return false;
      }
      const validIds = sourceIdsByPeriod[normalizeGradeHalfYear(assessment.halfYear)] || sourceIdsByPeriod.h1;
      const categoryId = Number(assessment.categoryId) || 0;
      const subcategoryId = Number(assessment.subcategoryId) || 0;
      return (
        (categoryId > 0 && !validIds.categoryIds.has(categoryId))
        || (
          categoryId > 0
          && subcategoryId === 0
          && validIds.categoryHasSubcategories.get(categoryId) === true
        )
        || (
          subcategoryId > 0
          && !validIds.subcategoryIdsByCategory.get(categoryId)?.has(subcategoryId)
        )
      );
    });
    const removedOverrideReference = this.gradeVaultState.gradeOverrides.find((override) => {
      if (Number(override.courseId) !== id || normalizeGradeOverrideScope(override.scope) === "course") {
        return false;
      }
      const periods = ["h1", "h2"].includes(normalizeGradePeriod(override.period))
        ? [normalizeGradePeriod(override.period)]
        : ["h1", "h2"];
      return periods.every((period) => {
        const validIds = sourceIdsByPeriod[period];
        const categoryId = Number(override.categoryId) || 0;
        const subcategoryId = Number(override.subcategoryId) || 0;
        return normalizeGradeOverrideScope(override.scope) === "category"
          ? !validIds.categoryIds.has(categoryId)
          : !validIds.subcategoryIdsByCategory.get(categoryId)?.has(subcategoryId);
      });
    });
    if (removedAssessmentReference || removedOverrideReference) {
      throw new Error("Verwendete Kategorien oder Unterkategorien können nicht entfernt werden. Bitte betroffene Leistungen zuerst neu zuordnen.");
    }
    const assignPeriodCategories = (categories, counterpart = []) => (
      normalizeGradeStructurePeriodDraft(categories).map((category, categoryIndex) => {
        const counterpartCategory = counterpart[categoryIndex] || null;
        const canReuseCounterpartCategory = (
          Number(category.id || 0) <= 0
          && Number(counterpartCategory?.id || 0) > 0
          && normalizeGradeTextPart(counterpartCategory?.name) === normalizeGradeTextPart(category.name)
        );
        const categoryId = Number(category.id) > 0
          ? Number(category.id)
          : (canReuseCounterpartCategory ? Number(counterpartCategory.id) : this._nextId("gradeCategory"));
        return {
          id: categoryId,
          name: category.name,
          weight: normalizeGradeStructureWeight(category.weight, 1),
          subcategories: (category.subcategories || []).map((subcategory, subcategoryIndex) => {
            const counterpartSubcategory = counterpartCategory?.subcategories?.[subcategoryIndex] || null;
            const canReuseCounterpartSubcategory = (
              Number(subcategory.id || 0) <= 0
              && Number(counterpartSubcategory?.id || 0) > 0
              && normalizeGradeTextPart(counterpartSubcategory?.name) === normalizeGradeTextPart(subcategory.name)
            );
            return {
              id: Number(subcategory.id) > 0
                ? Number(subcategory.id)
                : (canReuseCounterpartSubcategory ? Number(counterpartSubcategory.id) : this._nextId("gradeSubcategory")),
              name: subcategory.name,
              weight: normalizeGradeStructureWeight(subcategory.weight, 1)
            };
          })
        };
      })
    );
    const h1Categories = assignPeriodCategories(sourcePeriodCategories.h1);
    const h2Categories = assignPeriodCategories(sourcePeriodCategories.h2, h1Categories);
    const periodCategories = {
      h1: h1Categories,
      h2: h2Categories
    };
    const remapOverridesToSavedIds = (rawOverrides) => {
      const normalizedOverrides = materializeGradeStructurePerformanceFlairWeightOverrides(periodCategories, rawOverrides);
      const remapped = {};
      const resolveKey = (period, scope, key) => {
        const rawKey = String(key || "");
        const categories = periodCategories[period] || [];
        if (/^\d+$/.test(rawKey) && Number(rawKey) > 0) {
          const numericKey = Number(rawKey);
          const exists = scope === "category"
            ? categories.some((category) => Number(category.id) === numericKey)
            : categories.some((category) => (
              Array.isArray(category.subcategories)
              && category.subcategories.some((subcategory) => Number(subcategory.id) === numericKey)
            ));
          return exists ? rawKey : "";
        }
        const parts = rawKey.split(":");
        if (parts[0] !== "index") {
          return "";
        }
        if (scope === "category") {
          return String(Number(categories[Number(parts[1] || 0)]?.id) || "");
        }
        const subcategory = categories[Number(parts[1] || 0)]?.subcategories?.[Number(parts[2] || 0)];
        return String(Number(subcategory?.id) || "");
      };
      GRADE_STUDENT_PERFORMANCE_FLAIRS.forEach((flair) => {
        ["h1", "h2"].forEach((period) => {
          const periodOverrides = normalizedOverrides?.[flair]?.[period];
          if (!periodOverrides) {
            return;
          }
          const nextPeriod = createEmptyGradeStructureWeightOverridePeriod();
          Object.entries(periodOverrides.categories || {}).forEach(([key, value]) => {
            const resolvedKey = resolveKey(period, "category", key);
            const normalizedValue = normalizeGradeStructureWeight(value, 0);
            if (resolvedKey) {
              nextPeriod.categories[resolvedKey] = normalizedValue;
            }
          });
          Object.entries(periodOverrides.subcategories || {}).forEach(([key, value]) => {
            const resolvedKey = resolveKey(period, "subcategory", key);
            const normalizedValue = normalizeGradeStructureWeight(value, 0);
            if (resolvedKey) {
              nextPeriod.subcategories[resolvedKey] = normalizedValue;
            }
          });
          if (Object.keys(nextPeriod.categories).length > 0 || Object.keys(nextPeriod.subcategories).length > 0) {
            if (!remapped[flair]) {
              remapped[flair] = {};
            }
            remapped[flair][period] = nextPeriod;
          }
        });
      });
      return normalizeGradeStructurePerformanceFlairWeightOverrides(remapped);
    };
    const existing = this.gradeVaultState.gradeStructures.find((item) => Number(item.courseId) === id);
    const sourceOverrides = performanceFlairWeightOverrides === null
      ? existing?.performanceFlairWeightOverrides
      : performanceFlairWeightOverrides;
    const normalizedOverrides = remapOverridesToSavedIds(sourceOverrides);
    const normalized = periodCategories.h1;
    if (existing) {
      existing.categories = normalized;
      existing.periodCategories = periodCategories;
      existing.performanceFlairWeightOverrides = normalizedOverrides;
    } else {
      this.gradeVaultState.gradeStructures.push({
        courseId: id,
        categories: normalized,
        periodCategories,
        performanceFlairWeightOverrides: normalizedOverrides
      });
    }
    this._save();
    this._saveGradeVault();
    return this.getGradeStructure(id);
  }

  getGradeImportMeta(courseId) {
    const id = Number(courseId);
    const row = this.gradeVaultState.gradeImports.find((item) => Number(item.courseId) === id);
    if (!row) {
      return null;
    }
    return {
      courseId: id,
      fileName: String(row.fileName || ""),
      delimiter: String(row.delimiter || ""),
      header: Array.isArray(row.header) ? row.header.slice() : [],
      importedAt: String(row.importedAt || "")
    };
  }

  replaceGradeStudentsForCourse(courseId, students, importMeta = null, options = {}) {
    const id = Number(courseId);
    const currentStudents = this.listGradeStudents(id);
    const currentIds = new Set(currentStudents.map((student) => Number(student.id)));
    const currentIdList = [...currentIds].sort((left, right) => left - right);
    const expectedStudentIds = Array.isArray(options?.expectedStudentIds)
      ? options.expectedStudentIds
        .map((studentId) => Number(studentId) || 0)
        .filter((studentId) => studentId > 0)
        .sort((left, right) => left - right)
      : null;
    if (expectedStudentIds && JSON.stringify(expectedStudentIds) !== JSON.stringify(currentIdList)) {
      throw new Error("Die Teilnehmerliste wurde zwischenzeitlich geändert. Bitte neu laden.");
    }
    const requestedExistingIds = new Set(
      (students || [])
        .map((student) => Number(student?.id || 0))
        .filter((studentId) => currentIds.has(studentId))
    );
    const requestedRemovedIds = currentIdList.filter((studentId) => !requestedExistingIds.has(studentId));
    const confirmedRemovedIds = new Set(
      (Array.isArray(options?.confirmedRemovedStudentIds) ? options.confirmedRemovedStudentIds : [])
        .map((studentId) => Number(studentId) || 0)
        .filter((studentId) => studentId > 0)
    );
    if (requestedRemovedIds.some((studentId) => !confirmedRemovedIds.has(studentId))) {
      throw new Error("Teilnehmende dürfen nur nach ausdrücklicher Löschbestätigung entfernt werden.");
    }
    const nextStudents = [];
    const keptIds = new Set();
    for (const rawStudent of students || []) {
      const lastName = normalizeGradeTextPart(rawStudent && rawStudent.lastName);
      const firstName = normalizeGradeTextPart(rawStudent && rawStudent.firstName);
      const performanceFlair = normalizeGradePerformanceFlair(rawStudent && rawStudent.performanceFlair);
      const portrait = normalizeGradeStudentPortrait(rawStudent && rawStudent.portrait);
      if (!lastName && !firstName) {
        continue;
      }
      const requestedId = Number(rawStudent && rawStudent.id);
      const studentId = requestedId > 0 && currentIds.has(requestedId)
        ? requestedId
        : (() => {
          const value = this.gradeVaultState.counters.gradeStudent || 1;
          this.gradeVaultState.counters.gradeStudent = value + 1;
          return value;
        })();
      keptIds.add(studentId);
      nextStudents.push({
        id: studentId,
        courseId: id,
        lastName,
        firstName,
        performanceFlair,
        portrait,
        sortKey: buildGradeStudentSortKey(lastName, firstName, studentId)
      });
    }
    const removedStudentIds = new Set(
      currentStudents
        .map((student) => Number(student.id))
        .filter((studentId) => !keptIds.has(studentId))
    );
    this.gradeVaultState.gradeStudents = this.gradeVaultState.gradeStudents
      .filter((student) => Number(student.courseId) !== id)
      .concat(nextStudents)
      .sort(compareGradeStudents);
    if (removedStudentIds.size > 0) {
      this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter(
        (entry) => !removedStudentIds.has(Number(entry.studentId))
      );
      this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter(
        (entry) => !removedStudentIds.has(Number(entry.studentId))
      );
      this.gradeVaultState.gradeAccommodations = this.gradeVaultState.gradeAccommodations.filter(
        (entry) => !removedStudentIds.has(Number(entry.studentId))
      );
    }
    if (importMeta && typeof importMeta === "object") {
      const normalizedImport = {
        courseId: id,
        fileName: String(importMeta.fileName || ""),
        delimiter: String(importMeta.delimiter || ""),
        header: Array.isArray(importMeta.header) ? importMeta.header.map((cell) => String(cell || "")) : [],
        importedAt: String(importMeta.importedAt || new Date().toISOString())
      };
      const existingImport = this.gradeVaultState.gradeImports.find((row) => Number(row.courseId) === id);
      if (existingImport) {
        Object.assign(existingImport, normalizedImport);
      } else {
        this.gradeVaultState.gradeImports.push(normalizedImport);
      }
    }
    this._save();
    this._saveGradeVault();
    return this.listGradeStudents(id);
  }

  listGradeAccommodations(courseId) {
    const id = Number(courseId);
    return this.gradeVaultState.gradeAccommodations
      .filter((entry) => Number(entry.courseId) === id)
      .slice()
      .sort((a, b) => {
        const studentA = Number(a.studentId || 0);
        const studentB = Number(b.studentId || 0);
        if (studentA !== studentB) {
          return studentA - studentB;
        }
        return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
      })
      .map((entry) => ({
        courseId: Number(entry.courseId) || 0,
        studentId: Number(entry.studentId) || 0,
        text: String(entry.text || ""),
        updatedAt: String(entry.updatedAt || "")
      }));
  }

  saveGradeAccommodationsForCourse(courseId, entries = []) {
    const id = Number(courseId);
    if (!id) {
      return [];
    }
    const validStudentIds = new Set(
      this.listGradeStudents(id)
        .map((student) => Number(student.id) || 0)
        .filter((studentId) => studentId > 0)
    );
    const previousByStudent = new Map(
      this.listGradeAccommodations(id).map((entry) => [Number(entry.studentId) || 0, entry])
    );
    const seenStudentIds = new Set();
    const savedAt = new Date().toISOString();
    const nextEntries = [];
    for (const rawEntry of Array.isArray(entries) ? entries : []) {
      const studentId = Number(rawEntry?.studentId || 0);
      const text = String(rawEntry?.text || "")
        .trim()
        .slice(0, GRADE_ACCOMMODATION_TEXT_MAX_LENGTH);
      if (!studentId || !validStudentIds.has(studentId) || seenStudentIds.has(studentId) || !text) {
        continue;
      }
      const previous = previousByStudent.get(studentId) || null;
      seenStudentIds.add(studentId);
      nextEntries.push({
        courseId: id,
        studentId,
        text,
        updatedAt: String(previous && previous.text === text ? previous.updatedAt : savedAt)
      });
    }
    this.gradeVaultState.gradeAccommodations = this.gradeVaultState.gradeAccommodations
      .filter((entry) => Number(entry.courseId) !== id)
      .concat(nextEntries);
    this._saveGradeVault();
    return this.listGradeAccommodations(id);
  }

  getGradeSeatPlan(courseId) {
    const id = Number(courseId);
    if (!id) {
      return null;
    }
    const row = this.gradeVaultState.gradeSeatPlans.find((item) => Number(item.courseId) === id);
    if (!row || !row.plan || typeof row.plan !== "object") {
      return null;
    }
    return cloneJsonValue(row.plan, null);
  }

  saveGradeSeatPlan(courseId, plan) {
    const id = Number(courseId);
    if (!id || !plan || typeof plan !== "object") {
      return null;
    }
    const normalizedPlan = cloneJsonValue(plan, {});
    delete normalizedPlan.students;
    const row = {
      courseId: id,
      plan: normalizedPlan,
      updatedAt: new Date().toISOString()
    };
    const existing = this.gradeVaultState.gradeSeatPlans.find((item) => Number(item.courseId) === id);
    if (existing) {
      Object.assign(existing, row);
    } else {
      this.gradeVaultState.gradeSeatPlans.push(row);
    }
    this._saveGradeVault();
    return cloneJsonValue(row, null);
  }

  listGradeAssessments(courseId) {
    const id = Number(courseId);
    return this.gradeVaultState.gradeAssessments
      .filter((assessment) => Number(assessment.courseId) === id)
      .slice()
      .sort(compareGradeAssessmentsByOrder);
  }

  getGradeAssessment(assessmentId) {
    return this.gradeVaultState.gradeAssessments.find((assessment) => Number(assessment.id) === Number(assessmentId)) || null;
  }

  createGradeAssessmentSnapshot(assessmentId) {
    const assessmentKey = Number(assessmentId || 0);
    const assessment = this.getGradeAssessment(assessmentKey);
    if (!assessment) {
      return null;
    }
    const entries = (Array.isArray(this.gradeVaultState.gradeEntries) ? this.gradeVaultState.gradeEntries : [])
      .filter((entry) => Number(entry.assessmentId) === assessmentKey);
    return {
      assessmentId: assessmentKey,
      assessment: cloneJsonValue(assessment, null),
      entries: cloneJsonValue(entries, [])
    };
  }

  getGradeTestScaleTemplate(scale = GRADE_TEST_SCALE_DEFAULT) {
    return getGradeTestScaleTemplate(this.getGradeTestScaleSettings(), scale);
  }

  listVisibleGradeTestScaleTemplates() {
    return listVisibleGradeTestScaleTemplates(this.getGradeTestScaleSettings());
  }

  buildGradeTestScaleSnapshot(scale = GRADE_TEST_SCALE_DEFAULT) {
    return buildGradeTestScaleSnapshot(this.getGradeTestScaleSettings(), scale);
  }

  createGradeAssessment(courseId, payload = {}) {
    const id = Number(courseId);
    const orderGroup = {
      courseId: id,
      halfYear: normalizeGradeHalfYear(payload.halfYear),
      categoryId: Number(payload.categoryId) || null,
      subcategoryId: Number(payload.subcategoryId) || null
    };
    const orderGroupKey = getGradeAssessmentOrderGroupKey(orderGroup);
    const nextSortOrder = this.gradeVaultState.gradeAssessments
      .filter((assessment) => getGradeAssessmentOrderGroupKey(assessment) === orderGroupKey)
      .reduce((maximum, assessment) => Math.max(maximum, Number(assessment.sortOrder) || 0), 0) + 1;
    const nextAssessmentId = Math.max(1, Number(this.gradeVaultState.counters.gradeAssessment) || 1);
    this.gradeVaultState.counters.gradeAssessment = nextAssessmentId + 1;
    const mode = normalizeGradeAssessmentMode(payload.mode);
    const occurrenceCategories = this.getGradeOccurrenceCategories();
    const occurrenceCategoryIds = new Set(occurrenceCategories.map((category) => Number(category.id)));
    const occurrenceCategoryId = occurrenceCategoryIds.has(Number(payload.occurrenceCategoryId))
      ? Number(payload.occurrenceCategoryId)
      : Number(occurrenceCategories[0].id);
    const testScale = normalizeGradeTestScale(payload.testScale);
    const testPredicateSuffixes = mode === "test"
      ? normalizeGradeTestPredicateSuffixes(
        payload.testPredicateSuffixes,
        getDefaultGradeTestPredicateSuffixes(testScale)
      )
      : true;
    const yearLevel = normalizeGradeAssessmentYearLevel(payload.yearLevel);
    const assessment = {
      id: nextAssessmentId,
      courseId: id,
      categoryId: orderGroup.categoryId,
      subcategoryId: orderGroup.subcategoryId,
      createdAt: new Date().toISOString(),
      title: normalizeGradeTextPart(payload.title) || formatShortDateLabel(new Date()),
      maxPoints: normalizeGradeNumber(payload.maxPoints, 15),
      weight: normalizeGradeInteger(payload.weight, 1),
      mode,
      occurrenceCategoryId: mode === "homework" ? occurrenceCategoryId : null,
      testScale,
      testScaleSnapshot: mode === "test"
        ? this.buildGradeTestScaleSnapshot(testScale)
        : null,
      testPredicateSuffixes,
      testTasks: normalizeGradeTestTasks(payload.testTasks, { ensureDefault: false }),
      competenceExpectations: mode === "test" ? normalizeGradeCompetenceExpectations(payload.competenceExpectations) : [],
      expectationHorizonTemplateFile: mode === "test" ? normalizeGradeAssessmentExpectationHorizonTemplateFile(payload.expectationHorizonTemplateFile) : null,
      yearLevel,
      courseLevel: normalizeGradeAssessmentCourseLevel(payload.courseLevel, yearLevel),
      assessmentNumber: normalizeGradeAssessmentNumber(payload.assessmentNumber),
      topic: normalizeGradeAssessmentTopic(payload.topic),
      examDurationMinutes: mode === "test" ? normalizeGradeAssessmentExamDurationMinutes(payload.examDurationMinutes) : null,
      halfYear: orderGroup.halfYear,
      sortOrder: Number(payload.sortOrder || nextSortOrder)
    };
    this._save();
    this.gradeVaultState.gradeAssessments.push(assessment);
    this._saveGradeVault();
    return assessment.id;
  }

  updateGradeAssessment(assessmentId, patch = {}) {
    const assessment = this.getGradeAssessment(assessmentId);
    if (!assessment) {
      return false;
    }
    const previousMode = normalizeGradeAssessmentMode(assessment.mode);
    let shouldRecalculateTestEntries = false;
    if (patch.title !== undefined) {
      assessment.title = normalizeGradeTextPart(patch.title) || assessment.title;
    }
    assessment.maxPoints = 15;
    if (patch.weight !== undefined) {
      assessment.weight = normalizeGradeInteger(patch.weight, assessment.weight || 1);
    }
    if (patch.mode !== undefined) {
      assessment.mode = normalizeGradeAssessmentMode(patch.mode);
      shouldRecalculateTestEntries = normalizeGradeAssessmentMode(assessment.mode) !== previousMode;
    }
    const occurrenceCategories = this.getGradeOccurrenceCategories();
    const occurrenceCategoryIds = new Set(occurrenceCategories.map((category) => Number(category.id)));
    if (patch.occurrenceCategoryId !== undefined) {
      assessment.occurrenceCategoryId = occurrenceCategoryIds.has(Number(patch.occurrenceCategoryId))
        ? Number(patch.occurrenceCategoryId)
        : Number(occurrenceCategories[0].id);
    } else if (normalizeGradeAssessmentMode(assessment.mode) === "homework") {
      assessment.occurrenceCategoryId = occurrenceCategoryIds.has(Number(assessment.occurrenceCategoryId))
        ? Number(assessment.occurrenceCategoryId)
        : Number(occurrenceCategories[0].id);
    } else {
      assessment.occurrenceCategoryId = null;
    }
    if (patch.testScale !== undefined) {
      const previousScale = normalizeGradeTestScale(assessment.testScale);
      const nextScale = normalizeGradeTestScale(patch.testScale);
      assessment.testScale = nextScale;
      if (nextScale !== previousScale || patch.refreshTestScaleSnapshot === true) {
        assessment.testScaleSnapshot = this.buildGradeTestScaleSnapshot(nextScale);
        shouldRecalculateTestEntries = true;
      }
    } else if (!assessment.testScale) {
      assessment.testScale = GRADE_TEST_SCALE_DEFAULT;
    }
    if (patch.testPredicateSuffixes !== undefined) {
      assessment.testPredicateSuffixes = normalizeGradeTestPredicateSuffixes(patch.testPredicateSuffixes, true);
    } else if (assessment.testPredicateSuffixes === undefined) {
      assessment.testPredicateSuffixes = true;
    }
    if (normalizeGradeAssessmentMode(assessment.mode) === "test" && !assessment.testScaleSnapshot) {
      assessment.testScaleSnapshot = this.buildGradeTestScaleSnapshot(assessment.testScale);
      shouldRecalculateTestEntries = true;
    }
    if (normalizeGradeAssessmentMode(assessment.mode) !== "test") {
      assessment.testScaleSnapshot = null;
      assessment.testPredicateSuffixes = true;
    }
    if (patch.testTasks !== undefined) {
      const previousTasks = normalizeGradeTestTasks(assessment.testTasks, { ensureDefault: false });
      const nextTasks = normalizeGradeTestTasks(patch.testTasks, { ensureDefault: false });
      assessment.testTasks = nextTasks;
      if (JSON.stringify(previousTasks) !== JSON.stringify(nextTasks)) {
        shouldRecalculateTestEntries = true;
      }
    } else {
      assessment.testTasks = normalizeGradeTestTasks(assessment.testTasks, { ensureDefault: false });
    }
    if (patch.competenceExpectations !== undefined) {
      assessment.competenceExpectations = normalizeGradeCompetenceExpectations(patch.competenceExpectations);
    } else if (!Array.isArray(assessment.competenceExpectations)) {
      assessment.competenceExpectations = normalizeGradeCompetenceExpectations(assessment.competenceExpectations);
    }
    if (patch.expectationHorizonTemplateFile !== undefined) {
      assessment.expectationHorizonTemplateFile = normalizeGradeAssessmentExpectationHorizonTemplateFile(patch.expectationHorizonTemplateFile);
    } else if (assessment.expectationHorizonTemplateFile !== undefined) {
      assessment.expectationHorizonTemplateFile = normalizeGradeAssessmentExpectationHorizonTemplateFile(assessment.expectationHorizonTemplateFile);
    }
    if (patch.yearLevel !== undefined) {
      assessment.yearLevel = normalizeGradeAssessmentYearLevel(patch.yearLevel);
      assessment.courseLevel = normalizeGradeAssessmentCourseLevel(assessment.courseLevel, assessment.yearLevel);
    } else if (assessment.yearLevel === undefined) {
      assessment.yearLevel = normalizeGradeAssessmentYearLevel(assessment.yearLevel);
    }
    if (patch.courseLevel !== undefined) {
      assessment.courseLevel = normalizeGradeAssessmentCourseLevel(patch.courseLevel, assessment.yearLevel);
    } else if (assessment.courseLevel === undefined || isGradeAssessmentCourseLevelDisabled(assessment.yearLevel)) {
      assessment.courseLevel = normalizeGradeAssessmentCourseLevel(assessment.courseLevel, assessment.yearLevel);
    }
    if (patch.assessmentNumber !== undefined) {
      assessment.assessmentNumber = normalizeGradeAssessmentNumber(patch.assessmentNumber);
    } else if (assessment.assessmentNumber === undefined) {
      assessment.assessmentNumber = normalizeGradeAssessmentNumber(assessment.assessmentNumber);
    }
    if (patch.topic !== undefined) {
      assessment.topic = normalizeGradeAssessmentTopic(patch.topic);
    } else if (assessment.topic === undefined) {
      assessment.topic = normalizeGradeAssessmentTopic(assessment.topic);
    }
    if (patch.examDurationMinutes !== undefined) {
      assessment.examDurationMinutes = normalizeGradeAssessmentExamDurationMinutes(patch.examDurationMinutes);
    } else if (assessment.examDurationMinutes === undefined) {
      assessment.examDurationMinutes = normalizeGradeAssessmentExamDurationMinutes(assessment.examDurationMinutes);
    }
    if (normalizeGradeAssessmentMode(assessment.mode) !== "test") {
      assessment.yearLevel = null;
      assessment.courseLevel = "";
      assessment.assessmentNumber = null;
      assessment.topic = "";
      assessment.examDurationMinutes = null;
      assessment.competenceExpectations = [];
      assessment.expectationHorizonTemplateFile = null;
    }
    if (patch.halfYear !== undefined) {
      assessment.halfYear = normalizeGradeHalfYear(patch.halfYear);
    }
    if (patch.categoryId !== undefined) {
      assessment.categoryId = Number(patch.categoryId) || null;
    }
    if (patch.subcategoryId !== undefined) {
      assessment.subcategoryId = Number(patch.subcategoryId) || null;
    }
    if (patch.sortOrder !== undefined) {
      assessment.sortOrder = Number(patch.sortOrder || assessment.sortOrder || 0);
    }
    if (patch.mode !== undefined && normalizeGradeAssessmentMode(patch.mode) !== previousMode) {
      const nextMode = normalizeGradeAssessmentMode(patch.mode);
      this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries
        .map((entry) => {
          if (Number(entry.assessmentId) !== Number(assessment.id)) {
            return entry;
          }
          if (nextMode === "homework") {
            return { ...entry, value: null, testScores: null, expectationHorizonComment: "" };
          }
          if (nextMode === "test") {
            return { ...entry, value: null, checked: null, testScores: {}, expectationHorizonComment: "" };
          }
          return { ...entry, checked: null, testScores: null, expectationHorizonComment: "" };
        })
        .filter((entry) => entry.value !== null || entry.checked === true || hasGradeTestScores(entry.testScores));
    }
    if (normalizeGradeAssessmentMode(assessment.mode) === "test" && shouldRecalculateTestEntries) {
      this.recalculateGradeTestEntries(assessment.id);
    }
    this._saveGradeVault();
    return true;
  }

  reorderGradeAssessments(courseId, assessmentIds = []) {
    const courseKey = Number(courseId || 0);
    const requestedIds = Array.isArray(assessmentIds)
      ? assessmentIds.map((value) => Number(value || 0))
      : [];
    if (!courseKey || !requestedIds.length || requestedIds.some((id) => id <= 0)) {
      return false;
    }
    const requestedIdSet = new Set(requestedIds);
    if (requestedIdSet.size !== requestedIds.length) {
      return false;
    }
    const orderedAssessments = requestedIds.map((assessmentId) => this.getGradeAssessment(assessmentId));
    if (orderedAssessments.some((assessment) => !assessment || Number(assessment.courseId) !== courseKey)) {
      return false;
    }
    const groupKey = getGradeAssessmentOrderGroupKey(orderedAssessments[0]);
    if (orderedAssessments.some((assessment) => getGradeAssessmentOrderGroupKey(assessment) !== groupKey)) {
      return false;
    }
    const siblingIds = this.gradeVaultState.gradeAssessments
      .filter((assessment) => getGradeAssessmentOrderGroupKey(assessment) === groupKey)
      .map((assessment) => Number(assessment.id || 0));
    if (
      siblingIds.length !== requestedIds.length
      || siblingIds.some((assessmentId) => !requestedIdSet.has(assessmentId))
    ) {
      return false;
    }
    orderedAssessments.forEach((assessment, index) => {
      assessment.sortOrder = index + 1;
    });
    this._saveGradeVault();
    return true;
  }

  deleteGradeAssessment(assessmentId) {
    const id = Number(assessmentId);
    const assessment = this.getGradeAssessment(id);
    if (!assessment) {
      return false;
    }
    this.gradeVaultState.gradeAssessments = this.gradeVaultState.gradeAssessments.filter((item) => Number(item.id) !== id);
    this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => Number(entry.assessmentId) !== id);
    this._saveGradeVault();
    return true;
  }

  getGradeEntry(studentId, assessmentId) {
    const studentKey = Number(studentId);
    const assessmentKey = Number(assessmentId);
    return this.gradeVaultState.gradeEntries.find((entry) => (
      Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
    )) || null;
  }

  setGradeEntry(studentId, assessmentId, value) {
    const studentKey = Number(studentId);
    const assessmentKey = Number(assessmentId);
    const assessment = this.getGradeAssessment(assessmentKey);
    const student = this.gradeVaultState.gradeStudents.find((item) => (
      Number(item.id) === studentKey
      && Number(item.courseId) === Number(assessment?.courseId)
    ));
    if (!studentKey || !assessmentKey || !assessment || !student) {
      return false;
    }
    const mode = normalizeGradeAssessmentMode(assessment?.mode);
    const existing = this.getGradeEntry(studentKey, assessmentKey);
    if (mode === "test") {
      const options = value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "expectationHorizonComment")
        ? { expectationHorizonComment: value.expectationHorizonComment }
        : {};
      return this.setGradeTestEntry(studentKey, assessmentKey, value && typeof value === "object" ? value.testScores || value : {}, options);
    }
    if (mode === "homework") {
      const checked = normalizeGradeEntryChecked(value);
      if (existing && Boolean(existing.checked) === checked) {
        return true;
      }
      if (!checked) {
        if (existing) {
          this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => !(
            Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
          ));
          this._saveGradeVault();
        }
        return true;
      }
      if (existing) {
        existing.checked = true;
        existing.value = null;
      } else {
        this.gradeVaultState.gradeEntries.push({
          studentId: studentKey,
          assessmentId: assessmentKey,
          value: null,
          checked: true,
          testScores: null
        });
      }
      this._saveGradeVault();
      return true;
    }
    const parsed = parseGradeValue(value, 15);
    if (!parsed.valid) {
      return false;
    }
    if (parsed.value === null) {
      if (existing) {
        this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => !(
          Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
        ));
        this._saveGradeVault();
      }
      return true;
    }
    if (existing && Number(existing.value) === parsed.value && existing.checked === null) {
      return true;
    }
    if (existing) {
      existing.value = parsed.value;
      existing.checked = null;
      existing.testScores = null;
    } else {
      this.gradeVaultState.gradeEntries.push({
        studentId: studentKey,
        assessmentId: assessmentKey,
        value: parsed.value,
        checked: null,
        testScores: null
      });
    }
    this._saveGradeVault();
    return true;
  }

  setGradeTestEntry(studentId, assessmentId, scores = {}, options = {}) {
    const studentKey = Number(studentId);
    const assessmentKey = Number(assessmentId);
    const assessment = this.getGradeAssessment(assessmentKey);
    const student = this.gradeVaultState.gradeStudents.find((item) => (
      Number(item.id) === studentKey
      && Number(item.courseId) === Number(assessment?.courseId)
    ));
    if (!studentKey || !assessment || !student || normalizeGradeAssessmentMode(assessment.mode) !== "test") {
      return false;
    }
    if (!assessment.testScaleSnapshot) {
      assessment.testScaleSnapshot = this.buildGradeTestScaleSnapshot(assessment.testScale);
    }
    const taskIds = new Set(normalizeGradeTestTasks(assessment.testTasks, { ensureDefault: false }).map((task) => task.id));
    const normalizedScores = Object.entries(normalizeGradeTestScores(scores)).reduce((result, [taskId, value]) => {
      if (taskIds.has(taskId)) {
        result[taskId] = value;
      }
      return result;
    }, {});
    const existing = this.getGradeEntry(studentKey, assessmentKey);
    const hasExpectationHorizonComment = Object.prototype.hasOwnProperty.call(options || {}, "expectationHorizonComment");
    const expectationHorizonComment = hasExpectationHorizonComment
      ? normalizeGradeExpectationHorizonComment(options.expectationHorizonComment)
      : normalizeGradeExpectationHorizonComment(existing?.expectationHorizonComment);
    if (!hasGradeTestScores(normalizedScores) && !expectationHorizonComment) {
      if (existing) {
        this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => !(
          Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
        ));
        this._saveGradeVault();
      }
      return true;
    }
    const value = hasGradeTestScores(normalizedScores)
      ? calculateGradeTestValue(
        assessment.testTasks,
        normalizedScores,
        assessment.testScaleSnapshot || assessment.testScale,
        null,
        normalizeGradeTestPredicateSuffixes(assessment.testPredicateSuffixes, true)
      )
      : null;
    if (existing) {
      existing.value = value;
      existing.checked = null;
      existing.testScores = normalizedScores;
      existing.expectationHorizonComment = expectationHorizonComment;
    } else {
      this.gradeVaultState.gradeEntries.push({
        studentId: studentKey,
        assessmentId: assessmentKey,
        value,
        checked: null,
        testScores: normalizedScores,
        expectationHorizonComment
      });
    }
    this._saveGradeVault();
    return true;
  }

  recalculateGradeTestEntries(assessmentId) {
    const assessment = this.getGradeAssessment(assessmentId);
    if (!assessment || normalizeGradeAssessmentMode(assessment.mode) !== "test") {
      return;
    }
    if (!assessment.testScaleSnapshot) {
      assessment.testScaleSnapshot = this.buildGradeTestScaleSnapshot(assessment.testScale);
    }
    const taskIds = new Set(normalizeGradeTestTasks(assessment.testTasks, { ensureDefault: false }).map((task) => task.id));
    this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries
      .map((entry) => {
        if (Number(entry.assessmentId) !== Number(assessment.id)) {
          return entry;
        }
        const testScores = Object.entries(normalizeGradeTestScores(entry.testScores)).reduce((result, [taskId, value]) => {
          if (taskIds.has(taskId)) {
            result[taskId] = value;
          }
          return result;
        }, {});
        return {
          ...entry,
          checked: null,
          testScores,
          value: hasGradeTestScores(testScores)
            ? calculateGradeTestValue(
              assessment.testTasks,
              testScores,
              assessment.testScaleSnapshot || assessment.testScale,
              null,
              normalizeGradeTestPredicateSuffixes(assessment.testPredicateSuffixes, true)
            )
            : null
        };
      })
      .filter((entry) => (
        Number(entry.assessmentId) !== Number(assessment.id)
        || hasGradeTestScores(entry.testScores)
        || normalizeGradeExpectationHorizonComment(entry.expectationHorizonComment)
      ));
  }

  getGradeOverride(studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year") {
    const studentKey = Number(studentId);
    const courseKey = Number(courseId);
    const normalizedScope = normalizeGradeOverrideScope(scope);
    const normalizedPeriod = normalizeGradePeriod(period);
    const categoryKey = Number(categoryId) || null;
    const subcategoryKey = Number(subcategoryId) || null;
    if (!studentKey || !courseKey || !normalizedScope) {
      return null;
    }
    return this.gradeVaultState.gradeOverrides.find((entry) => (
      Number(entry.studentId) === studentKey
      && Number(entry.courseId) === courseKey
      && normalizeGradeOverrideScope(entry.scope) === normalizedScope
      && normalizeGradePeriod(entry.period) === normalizedPeriod
      && (Number(entry.categoryId) || null) === categoryKey
      && (Number(entry.subcategoryId) || null) === subcategoryKey
    )) || null;
  }

  setGradeOverride(studentId, courseId, scope, value, categoryId = null, subcategoryId = null, period = "year") {
    const studentKey = Number(studentId);
    const courseKey = Number(courseId);
    const normalizedScope = normalizeGradeOverrideScope(scope);
    const normalizedPeriod = normalizeGradePeriod(period);
    const categoryKey = Number(categoryId) || null;
    const subcategoryKey = Number(subcategoryId) || null;
    const student = this.gradeVaultState.gradeStudents.find((item) => (
      Number(item?.id || 0) === studentKey
      && Number(item?.courseId || 0) === courseKey
    ));
    if (!studentKey || !courseKey || !normalizedScope || !student) {
      return false;
    }
    const parsed = parsePedagogicalGradeValue(value, 15);
    if (!parsed.valid) {
      return false;
    }
    const existing = this.getGradeOverride(studentKey, courseKey, normalizedScope, categoryKey, subcategoryKey, normalizedPeriod);
    if (parsed.value === null) {
      if (existing) {
        this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter((entry) => entry !== existing);
        this._saveGradeVault();
      }
      return true;
    }
    if (normalizedScope !== "course") {
      const periods = normalizedPeriod === "year" ? ["h1", "h2"] : [normalizedPeriod];
      const referencesExistingStructure = periods.some((targetPeriod) => {
        const categories = this.getGradeStructureForPeriod(courseKey, targetPeriod).categories || [];
        const category = categories.find((item) => Number(item?.id || 0) === categoryKey) || null;
        if (!category) {
          return false;
        }
        return normalizedScope === "category"
          || (category.subcategories || []).some((item) => Number(item?.id || 0) === subcategoryKey);
      });
      if (!referencesExistingStructure) {
        return false;
      }
    }
    if (existing) {
      existing.value = parsed.value;
    } else {
      this.gradeVaultState.gradeOverrides.push({
        studentId: studentKey,
        courseId: courseKey,
        scope: normalizedScope,
        period: normalizedPeriod,
        categoryId: categoryKey,
        subcategoryId: subcategoryKey,
        value: parsed.value
      });
    }
    this._saveGradeVault();
    return true;
  }

  getGroupedGradeAssessments(courseId) {
    const assessments = this.listGradeAssessments(courseId);
    const periods = [
      { id: "h1", label: "HJ1", includeAssessments: true },
      { id: "h2", label: "HJ2", includeAssessments: true }
    ];
    return periods.map((period) => {
      const structure = this.getGradeStructureForPeriod(courseId, period.id);
      const categories = Array.isArray(structure.categories) ? structure.categories : [];
      return {
        period: period.id,
        label: period.label,
        categories: categories.map((category) => {
          const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
          return {
            ...category,
            assessments: period.includeAssessments && subcategories.length === 0
              ? assessments.filter((assessment) => (
                Number(assessment.categoryId) === Number(category.id)
                && !Number(assessment.subcategoryId)
                && normalizeGradeHalfYear(assessment.halfYear) === period.id
              ))
              : [],
            subcategories: subcategories.map((subcategory) => ({
              ...subcategory,
              assessments: period.includeAssessments
                ? assessments.filter((assessment) => (
                  Number(assessment.categoryId) === Number(category.id)
                  && Number(assessment.subcategoryId) === Number(subcategory.id)
                  && normalizeGradeHalfYear(assessment.halfYear) === period.id
                ))
                : []
            }))
          };
        })
      };
    });
  }

  calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year") {
    const studentKey = Number(studentId);
    const categoryKey = Number(categoryId);
    const subcategoryKey = Number(subcategoryId);
    const normalizedPeriod = normalizeGradePeriod(period);
    if (normalizedPeriod === "year") {
      const h1 = this.calculateComputedGradeForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h1");
      const h2 = this.calculateComputedGradeForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h2");
      return combineGradePeriods(h1, h2);
    }
    const assessments = this.listGradeAssessments(courseId).filter((assessment) => (
      Number(assessment.categoryId) === categoryKey
      && Number(assessment.subcategoryId) === subcategoryKey
      && isWeightedGradeAssessmentMode(assessment.mode)
      && normalizeGradeHalfYear(assessment.halfYear) === normalizedPeriod
    ));
    const weightedGrades = [];
    assessments.forEach((assessment) => {
      const entry = this.getGradeEntry(studentKey, assessment.id);
      if (!entry || entry.value === null || entry.value === undefined) {
        return;
      }
      const weight = normalizeGradeNumber(assessment.weight, 1);
      weightedGrades.push({ value: Number(entry.value), weight });
    });
    return calculateWeightedGrade(weightedGrades);
  }

  calculateGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year") {
    const normalizedPeriod = normalizeGradePeriod(period);
    const override = this.getGradeOverride(studentId, courseId, "subcategory", categoryId, subcategoryId, normalizedPeriod);
    if (override) {
      return clamp(Number(override.value) || 0, 0, 15);
    }
    return this.calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, normalizedPeriod);
  }

  calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, period = "year") {
    const normalizedPeriod = normalizeGradePeriod(period);
    if (normalizedPeriod === "year") {
      const h1 = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "h1");
      const h2 = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "h2");
      return combineGradePeriods(h1, h2);
    }
    const structure = this.getGradeStructureForPeriod(
      courseId,
      normalizedPeriod,
      this.getGradeStudentPerformanceFlair(studentId, courseId)
    );
    const categoryKey = Number(categoryId);
    const category = (Array.isArray(structure.categories) ? structure.categories : []).find((item) => Number(item.id) === categoryKey);
    if (!category) {
      return null;
    }
    if (!Array.isArray(category.subcategories) || category.subcategories.length === 0) {
      return this.calculateComputedGradeForStudentInSubcategoryPeriod(
        studentId,
        courseId,
        category.id,
        null,
        normalizedPeriod
      );
    }
    const weightedGrades = [];
    (category.subcategories || []).forEach((subcategory) => {
      const partial = this.calculateGradeForStudentInSubcategoryPeriod(
        studentId,
        courseId,
        category.id,
        subcategory.id,
        normalizedPeriod
      );
      if (partial === null) {
        return;
      }
      const weight = normalizeGradeStructureWeight(subcategory.weight, 1);
      weightedGrades.push({ value: partial, weight });
    });
    return calculateWeightedGrade(weightedGrades);
  }

  calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, period = "year") {
    const normalizedPeriod = normalizeGradePeriod(period);
    const override = this.getGradeOverride(studentId, courseId, "category", categoryId, null, normalizedPeriod);
    if (override) {
      return clamp(Number(override.value) || 0, 0, 15);
    }
    return this.calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, normalizedPeriod);
  }

  calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, period = "year") {
    const normalizedPeriod = normalizeGradePeriod(period);
    if (normalizedPeriod === "year") {
      const h1 = this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "h1");
      const h2 = this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "h2");
      return combineGradePeriods(h1, h2);
    }
    const weightedGrades = [];
    const structure = this.getGradeStructureForPeriod(
      courseId,
      normalizedPeriod,
      this.getGradeStudentPerformanceFlair(studentId, courseId)
    );
    (Array.isArray(structure.categories) ? structure.categories : []).forEach((category) => {
      const partial = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, category.id, normalizedPeriod);
      if (partial === null) {
        return;
      }
      const weight = normalizeGradeStructureWeight(category.weight, 1);
      weightedGrades.push({ value: partial, weight });
    });
    return calculateWeightedGrade(weightedGrades);
  }

  calculateGradeForStudentInCoursePeriod(studentId, courseId, period = "year") {
    const normalizedPeriod = normalizeGradePeriod(period);
    const override = this.getGradeOverride(studentId, courseId, "course", null, null, normalizedPeriod);
    if (override) {
      return clamp(Number(override.value) || 0, 0, 15);
    }
    const computed = this.calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, normalizedPeriod);
    if (computed === null) {
      return null;
    }
    return clamp(Math.round(computed * 10) / 10, 0, 15);
  }

  calculateComputedGradeForStudentInSubcategory(studentId, courseId, categoryId, subcategoryId) {
    return this.calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, "year");
  }

  calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year", occurrenceCategoryId = null) {
    const studentKey = Number(studentId);
    const categoryKey = Number(categoryId);
    const subcategoryKey = Number(subcategoryId);
    const normalizedPeriod = normalizeGradePeriod(period);
    if (normalizedPeriod === "year") {
      const h1 = this.calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h1", occurrenceCategoryId);
      const h2 = this.calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h2", occurrenceCategoryId);
      return {
        checked: Number(h1.checked || 0) + Number(h2.checked || 0),
        total: Number(h1.total || 0) + Number(h2.total || 0)
      };
    }
    const occurrenceCategoryKey = Number(occurrenceCategoryId) || null;
    const defaultOccurrenceCategoryId = Number(this.getGradeOccurrenceCategories()[0]?.id) || 1;
    const assessments = this.listGradeAssessments(courseId).filter((assessment) => (
      Number(assessment.categoryId) === categoryKey
      && Number(assessment.subcategoryId) === subcategoryKey
      && normalizeGradeAssessmentMode(assessment.mode) === "homework"
      && normalizeGradeHalfYear(assessment.halfYear) === normalizedPeriod
      && (!occurrenceCategoryKey || Number(assessment.occurrenceCategoryId || defaultOccurrenceCategoryId) === occurrenceCategoryKey)
    ));
    return {
      checked: assessments.reduce((sum, assessment) => {
        const entry = this.getGradeEntry(studentKey, assessment.id);
        return sum + (entry?.checked === true ? 1 : 0);
      }, 0),
      total: assessments.length
    };
  }

  calculateGradeForStudentInSubcategory(studentId, courseId, categoryId, subcategoryId) {
    return this.calculateGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, "year");
  }

  calculateComputedGradeForStudentInCategory(studentId, courseId, categoryId) {
    return this.calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "year");
  }

  calculateGradeForStudentInCategory(studentId, courseId, categoryId) {
    return this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "year");
  }

  calculateComputedGradeForStudentInCourse(studentId, courseId) {
    return this.calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, "year");
  }

  calculateGradeForStudentInCourse(studentId, courseId) {
    return this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "year");
  }

  listSlotsForYear(schoolYearId) {
    const yearId = Number(schoolYearId);
    const courseIds = new Set(this.listCourses(yearId).map((item) => item.id));
    return this.state.slots
      .filter((slot) => (
        courseIds.has(slot.courseId)
        || (slot.placement === "break" && Number(slot.schoolYearId) === yearId)
      ))
      .sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) {
          return a.dayOfWeek - b.dayOfWeek;
        }
        return a.startHour - b.startHour;
      });
  }

  getSlot(slotId) {
    return this.state.slots.find((item) => item.id === Number(slotId)) || null;
  }

  createSlot(courseId, dayOfWeek, startHour, duration, startDate = null, endDate = null, weekParity = 0, placement = "lesson", schoolYearId = null, label = "") {
    const course = this.state.courses.find((item) => item.id === Number(courseId));
    const normalizedPlacement = placement === "break" ? "break" : "lesson";
    const year = normalizedPlacement === "break" ? this.getSchoolYear(Number(schoolYearId)) : null;
    if ((!course && normalizedPlacement !== "break") || (normalizedPlacement === "break" && !year)) {
      return null;
    }
    const slot = {
      id: this._nextId("slot"),
      courseId: course ? course.id : 0,
      schoolYearId: course ? course.schoolYearId : year.id,
      label: normalizedPlacement === "break" ? String(label || "").trim() : "",
      dayOfWeek: Number(dayOfWeek),
      startHour: Number(startHour),
      duration: Math.max(1, Number(duration)),
      startDate: startDate || null,
      endDate: endDate || null,
      weekParity: Number(weekParity) || 0,
      placement: normalizedPlacement
    };
    this.state.slots.push(slot);
    this.generateLessonsForYear(slot.schoolYearId);
    this._save();
    return slot.id;
  }

  updateSlot(slotId, courseId, dayOfWeek, startHour, duration, startDate = null, endDate = null, weekParity = 0, placement = null, schoolYearId = null, label = "") {
    const slot = this.getSlot(slotId);
    const targetCourse = this.state.courses.find((item) => item.id === Number(courseId));
    const normalizedPlacement = placement === "break"
      ? "break"
      : placement === "lesson"
        ? "lesson"
        : slot?.placement === "break" ? "break" : "lesson";
    const targetYear = normalizedPlacement === "break"
      ? this.getSchoolYear(Number(schoolYearId || slot?.schoolYearId))
      : null;
    if (!slot || (!targetCourse && normalizedPlacement !== "break") || (normalizedPlacement === "break" && !targetYear)) {
      return false;
    }
    const oldSchoolYearId = Number(slot.schoolYearId) || this.state.courses.find((item) => item.id === slot.courseId)?.schoolYearId;
    slot.courseId = targetCourse ? targetCourse.id : 0;
    slot.schoolYearId = targetCourse ? targetCourse.schoolYearId : targetYear.id;
    slot.label = normalizedPlacement === "break" ? String(label || "").trim() : "";
    slot.dayOfWeek = Number(dayOfWeek);
    slot.startHour = Number(startHour);
    slot.duration = Math.max(1, Number(duration));
    slot.startDate = startDate || null;
    slot.endDate = endDate || null;
    slot.weekParity = Number(weekParity) || 0;
    slot.placement = normalizedPlacement;

    if (oldSchoolYearId) {
      this.generateLessonsForYear(oldSchoolYearId);
    }
    this.generateLessonsForYear(slot.schoolYearId);
    this._save();
    return true;
  }

  deleteSlot(slotId) {
    const slot = this.getSlot(slotId);
    if (!slot) {
      return;
    }
    const schoolYearId = Number(slot.schoolYearId) || this.state.courses.find((item) => item.id === slot.courseId)?.schoolYearId;
    this.state.slots = this.state.slots.filter((item) => item.id !== slot.id);
    this.state.lessons = this.state.lessons.filter((item) => item.slotId !== slot.id);
    if (schoolYearId) {
      this.generateLessonsForYear(schoolYearId);
    }
    this._save();
  }

  _slotParityMatches(parity, dayIso) {
    if (Number(parity) === 1) {
      return isoWeekNumber(dayIso) % 2 === 1;
    }
    if (Number(parity) === 2) {
      return isoWeekNumber(dayIso) % 2 === 0;
    }
    return true;
  }

  _slotDatesOverlap(parityA, parityB, startIso, endIso, dayOfWeek) {
    if (!startIso || !endIso || !dayOfWeek) {
      return false;
    }
    const offset = (Number(dayOfWeek) - dayOfWeekIso(startIso) + 7) % 7;
    let current = addDays(startIso, offset);
    while (current <= endIso) {
      if (this._slotParityMatches(parityA, current) && this._slotParityMatches(parityB, current)) {
        return true;
      }
      current = addDays(current, 7);
    }
    return false;
  }

  findSlotConflicts(
    schoolYearId,
    courseId,
    dayOfWeek,
    startHour,
    duration,
    startDate = null,
    endDate = null,
    weekParity = 0,
    excludeSlotId = null,
    placement = "lesson"
  ) {
    const year = this.getSchoolYear(schoolYearId);
    if (!year) {
      return [];
    }
    const yearStart = year.startDate;
    const yearEnd = year.endDate;
    let candidateStart = startDate || yearStart;
    let candidateEnd = endDate || yearEnd;
    if (candidateStart < yearStart) {
      candidateStart = yearStart;
    }
    if (candidateEnd > yearEnd) {
      candidateEnd = yearEnd;
    }
    if (candidateEnd < candidateStart) {
      return [];
    }
    const normalizedPlacement = placement === "break" ? "break" : "lesson";
    const beginHour = Number(startHour);
    const endHour = beginHour + Math.max(1, Number(duration)) - 1;

    const slots = this.listSlotsForYear(schoolYearId);
    const conflicts = [];
    for (const slot of slots) {
      if (excludeSlotId && slot.id === Number(excludeSlotId)) {
        continue;
      }
      if ((slot.placement === "break" ? "break" : "lesson") !== normalizedPlacement) {
        continue;
      }
      if (Number(slot.dayOfWeek) !== Number(dayOfWeek)) {
        continue;
      }
      const slotBegin = Number(slot.startHour);
      const slotEnd = slotBegin + Math.max(1, Number(slot.duration)) - 1;
      if (endHour < slotBegin || slotEnd < beginHour) {
        continue;
      }
      let slotStart = slot.startDate || yearStart;
      let slotEndDate = slot.endDate || yearEnd;
      if (slotStart < yearStart) {
        slotStart = yearStart;
      }
      if (slotEndDate > yearEnd) {
        slotEndDate = yearEnd;
      }
      const overlapStart = slotStart > candidateStart ? slotStart : candidateStart;
      const overlapEnd = slotEndDate < candidateEnd ? slotEndDate : candidateEnd;
      if (overlapEnd < overlapStart) {
        continue;
      }
      if (
        this._slotDatesOverlap(
          Number(weekParity),
          Number(slot.weekParity || 0),
          overlapStart,
          overlapEnd,
          dayOfWeek
        )
      ) {
        const c = this.state.courses.find((item) => item.id === slot.courseId);
        conflicts.push({
          ...slot,
          courseName: slot.placement === "break" ? String(slot.label || "Aufsicht") : c ? c.name : `Kurs ${slot.courseId}`
        });
      }
    }
    return conflicts;
  }

  listFreeRanges(schoolYearId) {
    const order = new Map(REQUIRED_HOLIDAYS.map((label, index) => [label.toLowerCase(), index]));
    return this.state.freeRanges
      .filter((item) => item.schoolYearId === Number(schoolYearId))
      .sort((a, b) => {
        const labelA = String(a.label || "").trim().toLowerCase();
        const labelB = String(b.label || "").trim().toLowerCase();
        const orderA = order.has(labelA) ? order.get(labelA) : 999;
        const orderB = order.has(labelB) ? order.get(labelB) : 999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        if (a.startDate !== b.startDate) {
          return a.startDate.localeCompare(b.startDate);
        }
        return String(a.label || "").localeCompare(String(b.label || ""), "de");
      });
  }

  upsertFreeRange(id, schoolYearId, label, startDate, endDate) {
    const cleanLabel = String(label || "").trim();
    const yearId = Number(schoolYearId);
    const normalized = cleanLabel.toLowerCase();
    const isSummerHoliday = normalized === "sommerferien";
    const hasDates = Boolean(startDate) && Boolean(endDate);
    const hasSummerPartial = isSummerHoliday && (Boolean(startDate) || Boolean(endDate));
    if (!cleanLabel || !yearId || (!hasDates && !hasSummerPartial)) {
      return null;
    }
    if (id) {
      const row = this.state.freeRanges.find((item) => item.id === Number(id));
      if (!row) {
        return null;
      }
      if (!isSummerHoliday) {
        const existing = this.state.freeRanges.find(
          (item) =>
            Number(item.schoolYearId) === yearId &&
            item.id !== Number(id) &&
            String(item.label || "").trim().toLowerCase() === normalized
        );
        if (existing) {
          existing.label = cleanLabel;
          existing.startDate = startDate;
          existing.endDate = endDate;
          this.state.freeRanges = this.state.freeRanges.filter((item) => item.id !== Number(id));
        } else {
          row.label = cleanLabel;
          row.startDate = startDate;
          row.endDate = endDate;
        }
      } else {
        row.label = cleanLabel;
        row.startDate = startDate;
        row.endDate = endDate;
      }
    } else {
      if (!isSummerHoliday) {
        const existing = this.state.freeRanges.find(
          (item) =>
            Number(item.schoolYearId) === yearId &&
            String(item.label || "").trim().toLowerCase() === normalized
        );
        if (existing) {
          existing.label = cleanLabel;
          existing.startDate = startDate;
          existing.endDate = endDate;
        } else {
          this.state.freeRanges.push({
            id: this._nextId("freeRange"),
            schoolYearId: yearId,
            label: cleanLabel,
            startDate,
            endDate
          });
        }
      } else {
        this.state.freeRanges.push({
          id: this._nextId("freeRange"),
          schoolYearId: yearId,
          label: cleanLabel,
          startDate,
          endDate
        });
      }
    }
    this.applyDayOffs(yearId);
    this._save();
    return true;
  }

  deleteFreeRange(id) {
    const row = this.state.freeRanges.find((item) => item.id === Number(id));
    if (!row) {
      return;
    }
    this.state.freeRanges = this.state.freeRanges.filter((item) => item.id !== Number(id));
    this.applyDayOffs(row.schoolYearId);
    this._save();
  }

  applyHolidayDefaultsForYear(schoolYearId, overwrite = false) {
    const year = this.getSchoolYear(schoolYearId);
    if (!year) {
      return { ok: false, changed: false };
    }
    const startYear = Number(String(year.startDate).slice(0, 4));
    const yearId = Number(year.id);
    const specs = requiredHolidayRowSpecs();
    let changed = false;
    const allYearRows = this.state.freeRanges.filter((item) => Number(item.schoolYearId) === yearId);
    const byLabel = new Map();
    for (const item of allYearRows) {
      const normalized = String(item.label || "").trim().toLowerCase();
      if (!byLabel.has(normalized)) {
        byLabel.set(normalized, []);
      }
      byLabel.get(normalized).push(item);
    }
    for (const rows of byLabel.values()) {
      rows.sort((a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || "")));
    }

    for (const spec of specs) {
      const label = spec.label;
      const [startDate, endDate] = defaultHolidayRangeForRow(startYear, label, spec.occurrence);
      if (!startDate && !endDate) {
        continue;
      }
      const matches = byLabel.get(label.toLowerCase()) || [];
      const existing = matches[spec.occurrence] || null;
      if (existing) {
        existing.label = label;
        if (!overwrite) {
          continue;
        }
        if (existing.startDate === startDate && existing.endDate === endDate) {
          continue;
        }
        existing.startDate = startDate;
        existing.endDate = endDate;
        changed = true;
        continue;
      }
      const created = {
        id: this._nextId("freeRange"),
        schoolYearId: yearId,
        label,
        startDate,
        endDate
      };
      this.state.freeRanges.push(created);
      if (!byLabel.has(label.toLowerCase())) {
        byLabel.set(label.toLowerCase(), []);
      }
      byLabel.get(label.toLowerCase()).push(created);
      byLabel.get(label.toLowerCase()).sort(
        (a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
      );
      changed = true;
    }

    const expectedCountByLabel = new Map();
    for (const spec of specs) {
      const key = spec.label.toLowerCase();
      expectedCountByLabel.set(key, (expectedCountByLabel.get(key) || 0) + 1);
    }
    for (const [label, count] of expectedCountByLabel.entries()) {
      const rows = (byLabel.get(label) || []).slice().sort(
        (a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
      );
      if (rows.length <= count) {
        continue;
      }
      const removeIds = new Set(rows.slice(count).map((item) => item.id));
      this.state.freeRanges = this.state.freeRanges.filter((item) => !removeIds.has(item.id));
      changed = true;
    }
    if (changed) {
      this.applyDayOffs(yearId);
      this._save();
    }
    return { ok: true, changed };
  }

  listSpecialDays() {
    return [...this.state.specialDays].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  }

  upsertSpecialDay(id, name, dayDate) {
    const cleanName = String(name || "").trim();
    if (!cleanName || !dayDate) {
      return false;
    }
    const normalizedName = cleanName.toLowerCase();
    const duplicate = this.state.specialDays.find(
      (item) => String(item.name || "").trim().toLowerCase() === normalizedName && item.id !== Number(id)
    );
    if (duplicate) {
      return false;
    }
    if (id) {
      const row = this.state.specialDays.find((item) => item.id === Number(id));
      if (!row) {
        return false;
      }
      row.name = cleanName;
      row.dayDate = dayDate;
    } else {
      this.state.specialDays.push({
        id: this._nextId("specialDay"),
        name: cleanName,
        dayDate
      });
    }
    this.reapplyDayOffsAllYears();
    this._save();
    return true;
  }

  deleteSpecialDay(id) {
    this.state.specialDays = this.state.specialDays.filter((item) => item.id !== Number(id));
    this.reapplyDayOffsAllYears();
    this._save();
  }

  resetSpecialDays(startYear) {
    this.state.specialDays = [];
    for (const item of defaultSpecialDays(Number(startYear))) {
      this.state.specialDays.push({
        id: this._nextId("specialDay"),
        name: item.name,
        dayDate: item.dayDate
      });
    }
    this.reapplyDayOffsAllYears();
    this._save();
  }

  reapplyDayOffsAllYears() {
    const yearIds = new Set(this.state.schoolYears.map((item) => item.id));
    for (const yearId of yearIds) {
      this.applyDayOffs(yearId);
    }
  }

  generateLessonsForYear(schoolYearId) {
    const yearId = Number(schoolYearId);
    const year = this.getSchoolYear(yearId);
    if (!year) {
      return;
    }
    const slots = this.listSlotsForYear(yearId);
    const previous = this.state.lessons.filter((item) => item.schoolYearId === yearId);
    const previousByKey = new Map(previous.map((item) => [`${item.slotId}|${item.lessonDate}|${item.hour}`, item]));
    const hoursPerDay = this.getHoursPerDay();

    const byDay = new Map();
    for (const slot of slots) {
      const key = Number(slot.dayOfWeek);
      if (!byDay.has(key)) {
        byDay.set(key, []);
      }
      byDay.get(key).push(slot);
    }

    const generated = [];
    iterIsoDates(year.startDate, year.endDate, (currentDate) => {
      const day = dayOfWeekIso(currentDate);
      if (day > 5) {
        return;
      }
      const daySlots = byDay.get(day) || [];
      for (const slot of daySlots) {
        if (slot.startDate && currentDate < slot.startDate) {
          continue;
        }
        if (slot.endDate && currentDate > slot.endDate) {
          continue;
        }
        if (!this._slotParityMatches(slot.weekParity, currentDate)) {
          continue;
        }
        for (let offset = 0; offset < Number(slot.duration); offset += 1) {
          const hour = Number(slot.startHour) + offset;
          if (hour > hoursPerDay) {
            continue;
          }
          const key = `${slot.id}|${currentDate}|${hour}`;
          const old = previousByKey.get(key);
          generated.push({
            id: old ? old.id : this._nextId("lesson"),
            schoolYearId: yearId,
            slotId: slot.id,
            courseId: slot.courseId,
            lessonDate: currentDate,
            dayOfWeek: day,
            hour,
            topic: old ? old.topic : "",
            notes: old ? String(old.notes || "") : "",
            notesRichText: old ? cloneJsonValue(old.notesRichText, null) : null,
            canceled: false,
            cancelLabel: "",
            isEntfall: old ? Boolean(old.isEntfall) : false,
            isWrittenExam: old ? Boolean(old.isWrittenExam) : false
          });
        }
      }
    });

    this.state.lessons = this.state.lessons.filter((item) => item.schoolYearId !== yearId).concat(generated);
    this.applyDayOffs(yearId);
    this._save();
  }

  applyDayOffs(schoolYearId) {
    const yearId = Number(schoolYearId);
    const ranges = this.listFreeRanges(yearId);
    const specialByDate = new Map(this.state.specialDays.map((item) => [item.dayDate, item.name]));

    for (const lesson of this.state.lessons) {
      if (lesson.schoolYearId !== yearId) {
        continue;
      }
      lesson.canceled = false;
      lesson.cancelLabel = "";
      let freeLabel = "";
      for (const range of ranges) {
        if (isoInDateRange(lesson.lessonDate, range.startDate, range.endDate)) {
          freeLabel = range.label || "Unterrichtsfrei";
          break;
        }
      }
      const specialLabel = specialByDate.get(lesson.lessonDate) || "";
      const cancelLabel = freeLabel || specialLabel;
      if (cancelLabel) {
        lesson.canceled = true;
        lesson.cancelLabel = cancelLabel;
      }
    }
  }

  listLessonsForWeek(schoolYearId, weekStartIso, weekEndIso, courseId = null) {
    const yearId = Number(schoolYearId);
    const coursesById = new Map(this.listCourses(yearId).map((item) => [item.id, item]));
    const slotsById = new Map(this.listSlotsForYear(yearId).map((item) => [item.id, item]));
    return this.state.lessons
      .filter((lesson) => lesson.schoolYearId === yearId)
      .filter((lesson) => lesson.lessonDate >= weekStartIso && lesson.lessonDate <= weekEndIso)
      .filter((lesson) => !courseId || lesson.courseId === Number(courseId))
      .map((lesson) => {
        const course = coursesById.get(lesson.courseId);
        const slot = slotsById.get(lesson.slotId);
        const isBreak = slot?.placement === "break";
        return {
          ...lesson,
          courseName: isBreak ? String(slot.label || "Aufsicht") : course ? course.name : `Kurs ${lesson.courseId}`,
          color: course
            ? normalizeCourseColor(course.color, Boolean(course.noLesson))
            : "#94A3B8",
          noLesson: isBreak || (course ? Boolean(course.noLesson) : false),
          noGrades: course ? Boolean(course.noGrades) : false,
          slotPlacement: slot?.placement === "break" ? "break" : "lesson"
        };
      })
      .sort((a, b) => {
        if (a.lessonDate !== b.lessonDate) {
          return a.lessonDate.localeCompare(b.lessonDate);
        }
        return a.hour - b.hour;
      });
  }

  getLessonById(lessonId) {
    const found = this.state.lessons.find((item) => item.id === Number(lessonId));
    if (!found) {
      return null;
    }
    const course = this.state.courses.find((item) => item.id === found.courseId);
    const slot = this.getSlot(found.slotId);
    const isBreak = slot?.placement === "break";
    return {
      ...found,
      courseName: isBreak ? String(slot.label || "Aufsicht") : course ? course.name : `Kurs ${found.courseId}`,
      color: course
        ? normalizeCourseColor(course.color, Boolean(course.noLesson))
        : "#94A3B8",
      noLesson: isBreak || (course ? Boolean(course.noLesson) : false),
      noGrades: course ? Boolean(course.noGrades) : false,
      slotPlacement: slot?.placement === "break" ? "break" : "lesson"
    };
  }

  getLessonBlock(lessonId) {
    const selected = this.state.lessons.find((item) => item.id === Number(lessonId));
    if (!selected) {
      return [];
    }
    return this.state.lessons
      .filter((item) => item.slotId === selected.slotId && item.lessonDate === selected.lessonDate)
      .sort((a, b) => a.hour - b.hour);
  }

  updateLessonBlock(lessonId, patch) {
    const block = this.getLessonBlock(lessonId);
    if (block.length === 0) {
      return false;
    }
    const nextPatch = patch && typeof patch === "object" ? patch : {};
    const hasTopic = Object.prototype.hasOwnProperty.call(nextPatch, "topic");
    const hasNotes = Object.prototype.hasOwnProperty.call(nextPatch, "notes");
    const hasNotesRichText = Object.prototype.hasOwnProperty.call(nextPatch, "notesRichText");
    const hasEntfall = Object.prototype.hasOwnProperty.call(nextPatch, "isEntfall");
    const hasWritten = Object.prototype.hasOwnProperty.call(nextPatch, "isWrittenExam");
    for (const lesson of block) {
      const nextIsEntfall = hasEntfall ? Boolean(nextPatch.isEntfall) : Boolean(lesson.isEntfall);
      const nextIsWritten = hasWritten ? Boolean(nextPatch.isWrittenExam) : Boolean(lesson.isWrittenExam);
      if (hasTopic || hasEntfall || hasWritten) {
        const baseTopic = hasTopic ? String(nextPatch.topic || "") : String(lesson.topic || "");
        lesson.topic = overrideTopicForFlags(baseTopic, nextIsEntfall, nextIsWritten);
      }
      if (hasNotes) {
        lesson.notes = String(nextPatch.notes || "");
        if (!hasNotesRichText) {
          lesson.notesRichText = null;
        }
      }
      if (hasNotesRichText) {
        lesson.notesRichText = cloneJsonValue(nextPatch.notesRichText, null);
      }
      lesson.isEntfall = nextIsEntfall;
      lesson.isWrittenExam = nextIsWritten;
    }
    this._save();
    return true;
  }

  clearLessonBlock(lessonId) {
    const block = this.getLessonBlock(lessonId);
    if (block.length === 0) {
      return;
    }
    for (const lesson of block) {
      lesson.topic = "";
      lesson.notes = "";
      lesson.notesRichText = null;
      lesson.isEntfall = false;
      lesson.isWrittenExam = false;
    }
    this._save();
  }

  requiredHolidaysComplete(schoolYearId) {
    const ranges = this.listFreeRanges(schoolYearId);
    return computeRequiredHolidayMissingDetails(ranges).length === 0;
  }
}

WorkspaceStore.prototype._buildCourseBlocks = function (lessons) {
  const lessonsByDate = new Map();
  for (const lesson of lessons) {
    if (!lessonsByDate.has(lesson.lessonDate)) {
      lessonsByDate.set(lesson.lessonDate, []);
    }
    lessonsByDate.get(lesson.lessonDate).push(lesson);
  }

  const blocks = [];
  const orderedDates = [...lessonsByDate.keys()].sort((a, b) => a.localeCompare(b));
  for (const lessonDate of orderedDates) {
    const dayLessons = lessonsByDate.get(lessonDate).sort((a, b) => a.hour - b.hour);
    let currentBlock = [];
    let lastHour = null;

    for (const lesson of dayLessons) {
      if (lastHour === null || lesson.hour === lastHour + 1) {
        currentBlock.push(lesson);
      } else {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
        }
        currentBlock = [lesson];
      }
      lastHour = lesson.hour;
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }
  }
  return blocks;
};

WorkspaceStore.prototype.shiftCourseTopicsForward = function (schoolYearId, courseId, startLessonId) {
  const year = this.getSchoolYear(schoolYearId);
  if (!year) {
    return { success: false, message: "Kein aktives Schuljahr." };
  }

  const lessons = this.listLessonsForWeek(year.id, year.startDate, year.endDate, courseId).filter(
    (lesson) => !lesson.canceled
  );
  if (lessons.length === 0) {
    return { success: false, message: "Für diesen Kurs gibt es keine verfügbaren Stunden." };
  }

  const blocks = this._buildCourseBlocks(lessons);
  const startIndex = blocks.findIndex((block) => block.some((lesson) => lesson.id === Number(startLessonId)));
  if (startIndex < 0) {
    return { success: false, message: "Die ausgewählte Stunde ist nicht verfügbar." };
  }

  const blockTopics = [];
  const blockNotes = [];
  const blockRichNotes = [];
  const blockLessonIds = [];
  const blockEntfallFlags = [];
  const blockWrittenFlags = [];
  const blockHasContent = [];

  for (const block of blocks) {
    const ids = block.map((lesson) => lesson.id);
    const firstTopicLesson = block.find((lesson) => String(lesson.topic || "").trim());
    const firstNotesLesson = block.find((lesson) => String(lesson.notes || "").trim());
    const topic = firstTopicLesson ? String(firstTopicLesson.topic || "") : "";
    const notes = firstNotesLesson ? String(firstNotesLesson.notes || "") : "";
    const notesRichText = firstNotesLesson ? cloneJsonValue(firstNotesLesson.notesRichText, null) : null;
    const isEntfall = block.some((lesson) => Boolean(lesson.isEntfall));
    const isWritten = block.some((lesson) => Boolean(lesson.isWrittenExam));
    blockLessonIds.push(ids);
    blockTopics.push(topic);
    blockNotes.push(notes);
    blockRichNotes.push(notesRichText);
    blockEntfallFlags.push(isEntfall);
    blockWrittenFlags.push(isWritten);
    blockHasContent.push(Boolean(topic.trim()) || Boolean(notes.trim()) || isEntfall || isWritten);
  }

  if (!blockHasContent[startIndex]) {
    return { success: false, message: null };
  }

  let emptyIndex = -1;
  for (let idx = startIndex + 1; idx < blockHasContent.length; idx += 1) {
    if (!blockHasContent[idx]) {
      emptyIndex = idx;
      break;
    }
  }

  if (emptyIndex < 0) {
    return {
      success: false,
      message:
        "Diese Verschiebung würde die Verschiebung einer Stunde zur Folge haben, für die es im Kurs keinen freien Termin mehr gibt."
    };
  }

  for (let idx = startIndex + 1; idx < emptyIndex; idx += 1) {
    if (blockWrittenFlags[idx]) {
      return {
        success: false,
        message:
          "Diese Verschiebung würde auch eine Verschiebung einer schriftlichen Arbeit bedeuten. Eine schriftliche Arbeit kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
      };
    }
    if (blockEntfallFlags[idx]) {
      return {
        success: false,
        message:
          "Diese Verschiebung würde auch eine Verschiebung einer Entfall-Stunde bedeuten. Eine Entfall-Stunde kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
      };
    }
  }

  const byId = new Map(this.state.lessons.map((lesson) => [lesson.id, lesson]));

  for (let idx = emptyIndex; idx > startIndex; idx -= 1) {
    const topic = blockTopics[idx - 1];
    const notes = blockNotes[idx - 1];
    const notesRichText = blockRichNotes[idx - 1];
    const entfall = blockEntfallFlags[idx - 1];
    const written = blockWrittenFlags[idx - 1];
    for (const lessonId of blockLessonIds[idx]) {
      const lesson = byId.get(lessonId);
      if (!lesson) {
        continue;
      }
      lesson.topic = overrideTopicForFlags(topic, entfall, written);
      lesson.notes = notes;
      lesson.notesRichText = cloneJsonValue(notesRichText, null);
      lesson.isEntfall = Boolean(entfall);
      lesson.isWrittenExam = Boolean(written);
    }
  }

  for (const lessonId of blockLessonIds[startIndex]) {
    const lesson = byId.get(lessonId);
    if (!lesson) {
      continue;
    }
    lesson.topic = "";
    lesson.notes = "";
    lesson.notesRichText = null;
    lesson.isEntfall = false;
    lesson.isWrittenExam = false;
  }

  this._save();
  return { success: true, message: null };
};

WorkspaceStore.prototype.shiftCourseTopicsBackward = function (schoolYearId, courseId, startLessonId) {
  const year = this.getSchoolYear(schoolYearId);
  if (!year) {
    return { success: false, message: "Kein aktives Schuljahr." };
  }

  const lessons = this.listLessonsForWeek(year.id, year.startDate, year.endDate, courseId).filter(
    (lesson) => !lesson.canceled
  );
  if (lessons.length === 0) {
    return { success: false, message: "Für diesen Kurs gibt es keine verfügbaren Stunden." };
  }

  const blocks = this._buildCourseBlocks(lessons);
  const startIndex = blocks.findIndex((block) => block.some((lesson) => lesson.id === Number(startLessonId)));
  if (startIndex < 0) {
    return { success: false, message: "Die ausgewählte Stunde ist nicht verfügbar." };
  }

  const blockTopics = [];
  const blockNotes = [];
  const blockRichNotes = [];
  const blockLessonIds = [];
  const blockEntfallFlags = [];
  const blockWrittenFlags = [];
  const blockHasContent = [];

  for (const block of blocks) {
    const ids = block.map((lesson) => lesson.id);
    const firstTopicLesson = block.find((lesson) => String(lesson.topic || "").trim());
    const firstNotesLesson = block.find((lesson) => String(lesson.notes || "").trim());
    const topic = firstTopicLesson ? String(firstTopicLesson.topic || "") : "";
    const notes = firstNotesLesson ? String(firstNotesLesson.notes || "") : "";
    const notesRichText = firstNotesLesson ? cloneJsonValue(firstNotesLesson.notesRichText, null) : null;
    const isEntfall = block.some((lesson) => Boolean(lesson.isEntfall));
    const isWritten = block.some((lesson) => Boolean(lesson.isWrittenExam));
    blockLessonIds.push(ids);
    blockTopics.push(topic);
    blockNotes.push(notes);
    blockRichNotes.push(notesRichText);
    blockEntfallFlags.push(isEntfall);
    blockWrittenFlags.push(isWritten);
    blockHasContent.push(Boolean(topic.trim()) || Boolean(notes.trim()) || isEntfall || isWritten);
  }

  if (!blockHasContent[startIndex]) {
    return { success: false, message: null };
  }

  let emptyIndex = -1;
  for (let idx = startIndex - 1; idx >= 0; idx -= 1) {
    if (!blockHasContent[idx]) {
      emptyIndex = idx;
      break;
    }
  }

  if (emptyIndex < 0) {
    return {
      success: false,
      message:
        "Diese Verschiebung würde die Verschiebung einer Stunde zur Folge haben, für die es im Kurs keinen freien Termin mehr gibt."
    };
  }

  for (let idx = emptyIndex + 1; idx < startIndex; idx += 1) {
    if (blockWrittenFlags[idx]) {
      return {
        success: false,
        message:
          "Diese Verschiebung würde auch eine Verschiebung einer schriftlichen Arbeit bedeuten. Eine schriftliche Arbeit kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
      };
    }
    if (blockEntfallFlags[idx]) {
      return {
        success: false,
        message:
          "Diese Verschiebung würde auch eine Verschiebung einer Entfall-Stunde bedeuten. Eine Entfall-Stunde kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
      };
    }
  }

  const byId = new Map(this.state.lessons.map((lesson) => [lesson.id, lesson]));

  for (let idx = emptyIndex; idx < startIndex; idx += 1) {
    const topic = blockTopics[idx + 1];
    const notes = blockNotes[idx + 1];
    const notesRichText = blockRichNotes[idx + 1];
    const entfall = blockEntfallFlags[idx + 1];
    const written = blockWrittenFlags[idx + 1];
    for (const lessonId of blockLessonIds[idx]) {
      const lesson = byId.get(lessonId);
      if (!lesson) {
        continue;
      }
      lesson.topic = overrideTopicForFlags(topic, entfall, written);
      lesson.notes = notes;
      lesson.notesRichText = cloneJsonValue(notesRichText, null);
      lesson.isEntfall = Boolean(entfall);
      lesson.isWrittenExam = Boolean(written);
    }
  }

  for (const lessonId of blockLessonIds[startIndex]) {
    const lesson = byId.get(lessonId);
    if (!lesson) {
      continue;
    }
    lesson.topic = "";
    lesson.notes = "";
    lesson.notesRichText = null;
    lesson.isEntfall = false;
    lesson.isWrittenExam = false;
  }

  this._save();
  return { success: true, message: null };
};

WorkspaceStore.prototype.splitSlotFromDate = function (
  schoolYearId,
  slotId,
  fromDate,
  courseId,
  dayOfWeek,
  startHour,
  duration,
  endDate,
  weekParity,
  placement = null,
  label = ""
) {
  const year = this.getSchoolYear(schoolYearId);
  const oldSlot = this.getSlot(slotId);
  const targetCourse = this.state.courses.find((item) => item.id === Number(courseId));
  const normalizedPlacement = placement === "break" || (!placement && oldSlot?.placement === "break") ? "break" : "lesson";
  if (!year || !oldSlot || !fromDate) {
    return { ok: false, message: "Ungültige Eingabe für Teiländerung." };
  }
  if (normalizedPlacement === "break" ? !String(label || oldSlot.label || "").trim() : (!targetCourse || Number(targetCourse.schoolYearId) !== Number(year.id))) {
    return {
      ok: false,
      message: normalizedPlacement === "break"
        ? "Bitte eine Bezeichnung für die Aufsicht angeben."
        : "Der gewählte Kurs gehört nicht zum aktiven Schuljahr."
    };
  }

  const oldStart = oldSlot.startDate || year.startDate;
  const oldEnd = oldSlot.endDate || year.endDate;
  if (fromDate > oldEnd) {
    return { ok: false, message: "Das Datum liegt außerhalb des bestehenden Slot-Zeitraums." };
  }

  if (fromDate <= oldStart) {
    this.updateSlot(
      slotId,
      courseId,
      dayOfWeek,
      startHour,
      duration,
      oldSlot.startDate || null,
      endDate || oldSlot.endDate || null,
      weekParity,
      normalizedPlacement,
      year.id,
      label || oldSlot.label || ""
    );
    return { ok: true, mode: "all" };
  }

  const targetEnd = endDate || oldSlot.endDate || year.endDate;
  if (targetEnd < fromDate) {
    return { ok: false, message: "Das Enddatum muss nach dem Startdatum liegen." };
  }

  const sourceRows = this.state.lessons
    .filter((lesson) => lesson.schoolYearId === Number(schoolYearId))
    .filter((lesson) => lesson.slotId === Number(slotId))
    .filter((lesson) => lesson.lessonDate >= fromDate)
    .filter((lesson) => !lesson.canceled)
    .sort((a, b) => {
      if (a.lessonDate !== b.lessonDate) {
        return a.lessonDate.localeCompare(b.lessonDate);
      }
      return a.hour - b.hour;
    })
    .map((lesson) => ({
      topic: lesson.topic || "",
      notes: lesson.notes || "",
      notesRichText: cloneJsonValue(lesson.notesRichText, null),
      isEntfall: Boolean(lesson.isEntfall),
      isWrittenExam: Boolean(lesson.isWrittenExam)
    }));

  oldSlot.endDate = addDays(fromDate, -1);

  const newSlot = {
    id: this._nextId("slot"),
    courseId: normalizedPlacement === "break" ? 0 : targetCourse.id,
    schoolYearId: year.id,
    label: normalizedPlacement === "break" ? String(label || oldSlot.label || "").trim() : "",
    dayOfWeek: Number(dayOfWeek),
    startHour: Number(startHour),
    duration: Math.max(1, Number(duration)),
    startDate: fromDate,
    endDate: targetEnd || null,
    weekParity: Number(weekParity) || 0,
    placement: normalizedPlacement
  };
  this.state.slots.push(newSlot);

  this.generateLessonsForYear(Number(schoolYearId));

  const targetRows = this.state.lessons
    .filter((lesson) => lesson.schoolYearId === Number(schoolYearId))
    .filter((lesson) => lesson.slotId === newSlot.id)
    .filter((lesson) => lesson.lessonDate >= fromDate)
    .filter((lesson) => !lesson.canceled)
    .sort((a, b) => {
      if (a.lessonDate !== b.lessonDate) {
        return a.lessonDate.localeCompare(b.lessonDate);
      }
      return a.hour - b.hour;
    });

  const maxLen = Math.min(sourceRows.length, targetRows.length);
  for (let idx = 0; idx < maxLen; idx += 1) {
    targetRows[idx].topic = sourceRows[idx].topic;
    targetRows[idx].notes = sourceRows[idx].notes;
    targetRows[idx].notesRichText = cloneJsonValue(sourceRows[idx].notesRichText, null);
    targetRows[idx].isEntfall = sourceRows[idx].isEntfall;
    targetRows[idx].isWrittenExam = sourceRows[idx].isWrittenExam;
  }

  this._save();
  return { ok: true, mode: "split", newSlotId: newSlot.id };
};

WorkspaceStore.prototype.exportPublicStateSnapshot = function () {
  return cloneJsonValue(this.state, createInitialState());
};

WorkspaceStore.prototype.exportGradeVaultStateSnapshot = function () {
  return cloneJsonValue(this.gradeVaultState, createInitialGradeVaultState());
};

WorkspaceStore.prototype.replaceGradeVaultState = function (gradeVaultState = null) {
  this.gradeVaultState = this.normalizeGradeVaultState(gradeVaultState);
};

WorkspaceStore.prototype.normalizePublicState = function (rawState = null) {
  return normalizePublicSchoolData(rawState, {
    baseState: createInitialState(),
    hoursPerDayDefault: HOURS_PER_DAY_DEFAULT,
    normalizeCourseColor,
    normalizeLessonTimes,
    normalizeGradeTestScaleSettings,
    normalizeDefaultGradeStructureSetting,
    normalizeExpectationHorizonCommentTemplate
  });
  const source = isRecord(rawState) ? rawState : {};
  const asObject = (value) => (value && typeof value === "object" ? value : {});
  const maxBy = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const base = createInitialState();
  const normalized = {
    ...base,
    settings: { ...base.settings, ...(isRecord(source.settings) ? source.settings : {}) },
    counters: { ...base.counters, ...(isRecord(source.counters) ? source.counters : {}) },
    schoolYears: Array.isArray(source.schoolYears) ? source.schoolYears.map((raw) => {
      const item = asObject(raw);
      return {
        id: Number(item.id),
        name: String(item.name || ""),
        startDate: String(item.startDate || ""),
        endDate: String(item.endDate || "")
      };
    }) : [],
    courses: Array.isArray(source.courses) ? source.courses.map((raw) => {
      const item = asObject(raw);
      const noLesson = Boolean(item.noLesson);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        name: String(item.name || ""),
        subject: String(item.subject || ""),
        color: normalizeCourseColor(item.color, noLesson),
        previousColor: item.previousColor == null ? null : normalizeCourseColor(item.previousColor, false),
        noLesson,
        noGrades: Boolean(item.noGrades),
        hiddenInSidebar: Boolean(item.hiddenInSidebar),
        sortOrder: Number(item.sortOrder || 0)
      };
    }) : [],
    slots: Array.isArray(source.slots) ? source.slots.map((raw) => {
      const item = asObject(raw);
      return {
        id: Number(item.id),
        courseId: Number(item.courseId) || 0,
        schoolYearId: Number(item.schoolYearId) || 0,
        label: String(item.label || ""),
        dayOfWeek: Number(item.dayOfWeek),
        startHour: Number(item.startHour),
        duration: Math.max(1, Number(item.duration || 1)),
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        weekParity: Number(item.weekParity || 0),
        placement: item.placement === "break" ? "break" : "lesson"
      };
    }) : [],
    freeRanges: Array.isArray(source.freeRanges) ? source.freeRanges.map((raw) => {
      const item = asObject(raw);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        label: String(item.label || ""),
        startDate: String(item.startDate || ""),
        endDate: String(item.endDate || "")
      };
    }) : [],
    specialDays: Array.isArray(source.specialDays) ? source.specialDays.map((raw) => {
      const item = asObject(raw);
      return {
        id: Number(item.id),
        name: String(item.name || ""),
        dayDate: String(item.dayDate || "")
      };
    }) : [],
    lessons: Array.isArray(source.lessons) ? source.lessons.map((raw) => {
      const item = asObject(raw);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        slotId: Number(item.slotId),
        courseId: Number(item.courseId),
        lessonDate: String(item.lessonDate || ""),
        dayOfWeek: Number(item.dayOfWeek),
        hour: Number(item.hour),
        topic: String(item.topic || ""),
        notes: String(item.notes || ""),
        notesRichText: cloneJsonValue(item.notesRichText, null),
        canceled: Boolean(item.canceled),
        cancelLabel: String(item.cancelLabel || ""),
        isEntfall: Boolean(item.isEntfall),
        isWrittenExam: Boolean(item.isWrittenExam)
      };
    }) : []
  };

  const normalizedHoursPerDay = clamp(Number(normalized.settings.hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
  normalized.settings.hoursPerDay = normalizedHoursPerDay;
  delete normalized.settings.gradeDisplaySystem;
  normalized.settings.lessonTimes = normalizeLessonTimes(normalized.settings.lessonTimes, normalizedHoursPerDay);
  normalized.settings.gradeTestScaleSettings = normalizeGradeTestScaleSettings(normalized.settings.gradeTestScaleSettings);
  normalized.settings.gradeOccurrenceCategories = normalizeGradeOccurrenceCategories(
    normalized.settings.gradeOccurrenceCategories
  );
  normalized.settings.defaultGradeStructure = normalizeDefaultGradeStructureSetting(normalized.settings.defaultGradeStructure);
  normalized.settings.expectationHorizonCommentTemplate = normalizeExpectationHorizonCommentTemplate(
    normalized.settings.expectationHorizonCommentTemplate
  );
  normalized.settings.gradeVaultEncryptionEnabled = Boolean(normalized.settings.gradeVaultEncryptionEnabled);

  normalized.schoolYears = normalized.schoolYears.filter(
    (item) => item.id > 0 && item.name && item.startDate && item.endDate
  );
  normalized.courses = normalized.courses.filter(
    (item) => item.id > 0 && item.schoolYearId > 0 && item.name
  );
  const courseIds = new Set(normalized.courses.map((course) => String(course.id)));
  const rawGradeCourseStudentCounts = isRecord(normalized.settings.gradeCourseStudentCounts)
    ? normalized.settings.gradeCourseStudentCounts
    : {};
  normalized.settings.gradeCourseStudentCounts = Object.fromEntries(
    Object.entries(rawGradeCourseStudentCounts)
      .filter(([courseId]) => courseIds.has(String(Number(courseId) || 0)))
      .map(([courseId, count]) => [String(Number(courseId)), Math.max(0, Number(count) || 0)])
  );
  normalized.settings.gradeCourseStudentCountsComplete = Boolean(
    normalized.settings.gradeCourseStudentCountsComplete
  );
  normalized.slots = normalized.slots.filter(
    (item) => (
      item.id > 0
      && item.dayOfWeek >= 1
      && item.dayOfWeek <= 5
      && (item.courseId > 0 || (item.placement === "break" && item.schoolYearId > 0 && item.label))
    )
  );
  const breakSlotIds = new Set(
    normalized.slots.filter((item) => item.placement === "break").map((item) => item.id)
  );
  normalized.freeRanges = normalized.freeRanges.filter((item) => {
    if (!(item.id > 0 && item.schoolYearId > 0 && item.label)) {
      return false;
    }
    const normalizedLabel = String(item.label || "").trim().toLowerCase();
    if (normalizedLabel === "sommerferien") {
      return Boolean(item.startDate) || Boolean(item.endDate);
    }
    return Boolean(item.startDate) && Boolean(item.endDate);
  });
  normalized.specialDays = normalized.specialDays.filter(
    (item) => item.id > 0 && item.name && item.dayDate
  );
  normalized.lessons = normalized.lessons.filter(
    (item) => (
      item.id > 0
      && item.schoolYearId > 0
      && item.slotId > 0
      && (item.courseId > 0 || breakSlotIds.has(item.slotId))
    )
  );
  normalized.counters = {
    schoolYear: Math.max(Number(normalized.counters.schoolYear) || 1, maxBy(normalized.schoolYears) + 1),
    course: Math.max(Number(normalized.counters.course) || 1, maxBy(normalized.courses) + 1),
    slot: Math.max(Number(normalized.counters.slot) || 1, maxBy(normalized.slots) + 1),
    freeRange: Math.max(Number(normalized.counters.freeRange) || 1, maxBy(normalized.freeRanges) + 1),
    specialDay: Math.max(Number(normalized.counters.specialDay) || 1, maxBy(normalized.specialDays) + 1),
    lesson: Math.max(Number(normalized.counters.lesson) || 1, maxBy(normalized.lessons) + 1),
    gradeCategory: Math.max(Number(normalized.counters.gradeCategory) || 1, 1),
    gradeSubcategory: Math.max(Number(normalized.counters.gradeSubcategory) || 1, 1),
    gradeAssessment: Math.max(Number(normalized.counters.gradeAssessment) || 1, 1)
  };

  return normalized;
};

WorkspaceStore.prototype.normalizeGradeVaultState = function (rawVaultState = null, options = {}) {
  const source = isRecord(rawVaultState) ? rawVaultState : {};
  const asObject = (value) => (value && typeof value === "object" ? value : {});
  const maxBy = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const gradeTestScaleSettings = normalizeGradeTestScaleSettings(
    options && Object.prototype.hasOwnProperty.call(options, "gradeTestScaleSettings")
      ? options.gradeTestScaleSettings
      : this.getGradeTestScaleSettings()
  );
  const gradeOccurrenceCategories = normalizeGradeOccurrenceCategories(
    options && Object.prototype.hasOwnProperty.call(options, "gradeOccurrenceCategories")
      ? options.gradeOccurrenceCategories
      : this.getGradeOccurrenceCategories()
  );
  const gradeOccurrenceCategoryIds = new Set(gradeOccurrenceCategories.map((category) => Number(category.id)));
  const defaultOccurrenceCategoryId = Number(gradeOccurrenceCategories[0]?.id) || 1;
  const normalized = {
    counters: {
      gradeStudent: Math.max(1, Number(source?.counters?.gradeStudent) || 1),
      gradeAssessment: Math.max(1, Number(source?.counters?.gradeAssessment) || 1)
    },
    gradeStructures: Array.isArray(source.gradeStructures) ? source.gradeStructures.map((raw) => {
      const item = asObject(raw);
      const periodCategories = normalizeGradeStructurePeriodCategories(item);
      return {
        courseId: Number(item.courseId),
        categories: periodCategories.h1,
        periodCategories,
        performanceFlairWeightOverrides: normalizeGradeStructurePerformanceFlairWeightOverrides(item.performanceFlairWeightOverrides)
      };
    }) : [],
    gradeAssessments: Array.isArray(source.gradeAssessments) ? source.gradeAssessments.map((raw) => {
      const item = asObject(raw);
      const mode = normalizeGradeAssessmentMode(item.mode);
      const testScale = normalizeGradeTestScale(item.testScale);
      const yearLevel = mode === "test" ? normalizeGradeAssessmentYearLevel(item.yearLevel) : null;
      return {
        id: Number(item.id),
        courseId: Number(item.courseId),
        categoryId: Number(item.categoryId) || null,
        subcategoryId: Number(item.subcategoryId) || null,
        createdAt: String(item.createdAt || ""),
        title: normalizeGradeTextPart(item.title),
        maxPoints: normalizeGradeNumber(item.maxPoints, 15),
        weight: normalizeGradeInteger(item.weight, 1),
        mode,
        occurrenceCategoryId: mode === "homework"
          ? (gradeOccurrenceCategoryIds.has(Number(item.occurrenceCategoryId))
            ? Number(item.occurrenceCategoryId)
            : defaultOccurrenceCategoryId)
          : null,
        testScale,
        testScaleSnapshot: mode === "test"
          ? normalizeGradeTestScaleSnapshot(item.testScaleSnapshot, testScale, gradeTestScaleSettings)
          : null,
        testPredicateSuffixes: mode === "test"
          ? normalizeGradeTestPredicateSuffixes(item.testPredicateSuffixes, true)
          : true,
        testTasks: normalizeGradeTestTasks(item.testTasks, { ensureDefault: false }),
        competenceExpectations: mode === "test" ? normalizeGradeCompetenceExpectations(item.competenceExpectations) : [],
        expectationHorizonTemplateFile: mode === "test" ? normalizeGradeAssessmentExpectationHorizonTemplateFile(item.expectationHorizonTemplateFile) : null,
        yearLevel,
        courseLevel: mode === "test" ? normalizeGradeAssessmentCourseLevel(item.courseLevel, yearLevel) : "",
        assessmentNumber: mode === "test" ? normalizeGradeAssessmentNumber(item.assessmentNumber) : null,
        topic: mode === "test" ? normalizeGradeAssessmentTopic(item.topic) : "",
        examDurationMinutes: mode === "test" ? normalizeGradeAssessmentExamDurationMinutes(item.examDurationMinutes) : null,
        halfYear: normalizeGradeHalfYear(item.halfYear),
        sortOrder: Number(item.sortOrder || 0)
      };
    }) : [],
    gradeStudents: Array.isArray(source.gradeStudents) ? source.gradeStudents.map((raw) => {
      const item = asObject(raw);
      const id = Number(item.id);
      const courseId = Number(item.courseId);
      const lastName = normalizeGradeTextPart(item.lastName);
      const firstName = normalizeGradeTextPart(item.firstName);
      const performanceFlair = normalizeGradePerformanceFlair(item.performanceFlair);
      const portrait = normalizeGradeStudentPortrait(item.portrait);
      return {
        id,
        courseId,
        lastName,
        firstName,
        performanceFlair,
        portrait,
        sortKey: buildGradeStudentSortKey(lastName, firstName, id)
      };
    }) : [],
    gradeEntries: Array.isArray(source.gradeEntries) ? source.gradeEntries.map((raw) => {
      const item = asObject(raw);
      const parsed = parseGradeValue(item.value);
      return {
        studentId: Number(item.studentId),
        assessmentId: Number(item.assessmentId),
        value: parsed.valid ? parsed.value : null,
        checked: normalizeGradeEntryChecked(item.checked) ? true : null,
        testScores: normalizeGradeTestScores(item.testScores),
        expectationHorizonComment: normalizeGradeExpectationHorizonComment(item.expectationHorizonComment)
      };
    }) : [],
    gradeOverrides: Array.isArray(source.gradeOverrides) ? source.gradeOverrides.map((raw) => {
      const item = asObject(raw);
      const parsed = parsePedagogicalGradeValue(item.value, 15);
      return {
        studentId: Number(item.studentId),
        courseId: Number(item.courseId),
        scope: normalizeGradeOverrideScope(item.scope),
        period: normalizeGradePeriod(item.period),
        categoryId: Number(item.categoryId) || null,
        subcategoryId: Number(item.subcategoryId) || null,
        value: parsed.valid ? parsed.value : null
      };
    }) : [],
    gradeImports: Array.isArray(source.gradeImports) ? source.gradeImports.map((raw) => {
      const item = asObject(raw);
      return {
        courseId: Number(item.courseId),
        fileName: String(item.fileName || ""),
        delimiter: String(item.delimiter || ""),
        header: Array.isArray(item.header) ? item.header.map((cell) => String(cell || "")) : [],
        importedAt: String(item.importedAt || "")
      };
    }) : [],
    gradeSeatPlans: Array.isArray(source.gradeSeatPlans) ? source.gradeSeatPlans.map((raw) => {
      const item = asObject(raw);
      const plan = cloneJsonValue(isRecord(item.plan) ? item.plan : {}, {});
      delete plan.students;
      return {
        courseId: Number(item.courseId),
        plan,
        updatedAt: String(item.updatedAt || "")
      };
    }) : [],
    gradeAccommodations: Array.isArray(source.gradeAccommodations) ? source.gradeAccommodations.map((raw) => {
      const item = asObject(raw);
      return {
        courseId: Number(item.courseId),
        studentId: Number(item.studentId),
        text: String(item.text || "").trim().slice(0, GRADE_ACCOMMODATION_TEXT_MAX_LENGTH),
        updatedAt: String(item.updatedAt || "")
      };
    }) : []
  };

  normalized.gradeStudents = normalized.gradeStudents
    .filter((item) => item.id > 0 && item.courseId > 0 && (item.lastName || item.firstName))
    .sort(compareGradeStudents);
  normalized.gradeStructures = normalized.gradeStructures
    .filter((item) => item.courseId > 0);
  normalized.gradeAssessments = normalized.gradeAssessments
    .filter((item) => item.id > 0 && item.courseId > 0 && item.title);
  normalized.gradeEntries = normalized.gradeEntries
    .filter((item) => (
      item.studentId > 0
      && item.assessmentId > 0
      && (item.value !== null || item.checked === true || hasGradeTestScores(item.testScores) || item.expectationHorizonComment)
    ));
  normalized.gradeOverrides = normalized.gradeOverrides
    .filter((item) => (
      item.studentId > 0
      && item.courseId > 0
      && normalizeGradeOverrideScope(item.scope)
      && item.value !== null
    ));
  normalized.gradeImports = normalized.gradeImports
    .filter((item) => item.courseId > 0);
  normalized.gradeSeatPlans = normalized.gradeSeatPlans
    .filter((item) => item.courseId > 0 && item.plan && typeof item.plan === "object");
  const validGradeStudentKeys = new Set(
    normalized.gradeStudents.map((student) => `${Number(student.courseId) || 0}:${Number(student.id) || 0}`)
  );
  const seenAccommodationKeys = new Set();
  normalized.gradeAccommodations = normalized.gradeAccommodations
    .filter((item) => {
      const key = `${Number(item.courseId) || 0}:${Number(item.studentId) || 0}`;
      if (
        item.courseId <= 0
        || item.studentId <= 0
        || !item.text
        || !validGradeStudentKeys.has(key)
        || seenAccommodationKeys.has(key)
      ) {
        return false;
      }
      seenAccommodationKeys.add(key);
      return true;
    });
  normalized.counters.gradeStudent = Math.max(
    Number(normalized.counters.gradeStudent) || 1,
    maxBy(normalized.gradeStudents) + 1
  );
  normalized.counters.gradeAssessment = Math.max(
    Number(normalized.counters.gradeAssessment) || 1,
    maxBy(normalized.gradeAssessments) + 1
  );

  return normalizeGradeCourseRelations(normalized);
};

WorkspaceStore.prototype.importDatabaseState = function (publicState, gradeVaultState = null, options = {}) {
  const maxNestedBy = (rows, getter) => rows.reduce((max, row) => {
    const nested = getter(row);
    return Math.max(max, ...nested.map((item) => Number(item.id) || 0), 0);
  }, 0);
  const getAllGradeStructureCategories = (row) => {
    const periodCategories = row?.periodCategories && typeof row.periodCategories === "object"
      ? row.periodCategories
      : null;
    if (periodCategories) {
      return [
        ...(Array.isArray(periodCategories.h1) ? periodCategories.h1 : []),
        ...(Array.isArray(periodCategories.h2) ? periodCategories.h2 : [])
      ];
    }
    return Array.isArray(row?.categories) ? row.categories : [];
  };
  const normalizedPublic = this.normalizePublicState(publicState);
  const normalizedVault = this.normalizeGradeVaultState(gradeVaultState, {
    gradeTestScaleSettings: normalizedPublic.settings.gradeTestScaleSettings,
    gradeOccurrenceCategories: normalizedPublic.settings.gradeOccurrenceCategories
  });
  const rebuildLessons = options?.rebuildLessons === true;
  const startupShellOnly = options?.startupShellOnly === true;
  const skipSaveNotification = options?.skipSaveNotification === true;
  const allowEmpty = options?.allowEmpty === true;
  const importedLessonYearIds = new Set(
    normalizedPublic.lessons
      .map((item) => Number(item?.schoolYearId || 0))
      .filter((yearId) => yearId > 0)
  );
  normalizedPublic.counters.gradeCategory = Math.max(
    Number(normalizedPublic.counters.gradeCategory) || 1,
    maxNestedBy(normalizedVault.gradeStructures, getAllGradeStructureCategories) + 1
  );
  normalizedPublic.counters.gradeSubcategory = Math.max(
    Number(normalizedPublic.counters.gradeSubcategory) || 1,
    maxNestedBy(normalizedVault.gradeStructures, (row) => (
      getAllGradeStructureCategories(row)
        .flatMap((category) => Array.isArray(category.subcategories) ? category.subcategories : [])
    )) + 1
  );
  normalizedPublic.counters.gradeAssessment = Math.max(
    Number(normalizedPublic.counters.gradeAssessment) || 1,
    normalizedVault.gradeAssessments.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
  );

  this._suspendSaveHooks();
  try {
    this.state = normalizedPublic;
    this.gradeVaultState = normalizedVault;
    this.normalizeCourseColors();
    if (!allowEmpty) this.ensureDefaultSchoolYear();
    if (!startupShellOnly) {
      for (const year of this.state.schoolYears) {
        const startYear = Number(String(year.startDate).slice(0, 4));
        this.seedHolidayDefaults(year.id, startYear);
      }
      if (this.state.specialDays.length === 0) {
        const active = this.getActiveSchoolYear();
        if (active) {
          const startYear = Number(String(active.startDate).slice(0, 4));
          this.resetSpecialDays(startYear);
        }
      }

      const yearIds = this.state.schoolYears.map((item) => item.id);
      for (const yearId of yearIds) {
        if (rebuildLessons || !importedLessonYearIds.has(yearId)) {
          this.generateLessonsForYear(yearId);
        } else {
          this.applyDayOffs(yearId);
        }
      }
    }
  } finally {
    this._resumeSaveHooks({ flush: !skipSaveNotification });
    if (skipSaveNotification) {
      this.pendingPublicSaveNotification = false;
      this.pendingGradeVaultSaveNotification = false;
    }
  }
  if (!skipSaveNotification) {
    this._save();
  }
  return { ok: true };
};

WorkspaceStore.prototype.ensureLessonsForYear = function (schoolYearId) {
  const yearId = Number(schoolYearId);
  if (!yearId) {
    return false;
  }
  if (this.state.lessons.some((lesson) => Number(lesson.schoolYearId) === yearId)) {
    return false;
  }
  if (this.listSlotsForYear(yearId).length === 0) {
    return false;
  }
  this.generateLessonsForYear(yearId);
  return true;
};

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
  const weekStart = currentWeekStartForDisplay();
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

  const students = store.replaceGradeStudentsForCourse(courseId, [
    { firstName: "Alex", lastName: "Beispiel", performanceFlair: "P3" },
    { firstName: "Sam", lastName: "Muster", performanceFlair: "P2" },
    { firstName: "Kim", lastName: "Demo", performanceFlair: "P4" },
    { firstName: "Noah", lastName: "Probe", performanceFlair: "P1" }
  ], {
    fileName: "beispiel-namensliste.csv",
    delimiter: ";",
    header: ["Nachname", "Vorname"],
    importedAt: new Date().toISOString()
  });
  const structure = store.saveGradeStructure(
    courseId,
    store.getDefaultGradeStructure().periodCategories
  );
  const secondHalfCategories = Array.isArray(structure?.periodCategories?.h2)
    ? structure.periodCategories.h2
    : [];
  const category = secondHalfCategories.find((item) => item.name === "Mündlich")
    || secondHalfCategories[0]
    || null;
  const subcategory = category?.subcategories?.find((item) => item.name === "Beteiligung")
    || category?.subcategories?.[0]
    || null;
  const assessmentId = store.createGradeAssessment(courseId, {
    title: "Mündliche Mitarbeit",
    mode: "grade",
    weight: 1,
    halfYear: "h2",
    categoryId: category?.id,
    subcategoryId: subcategory?.id
  });
  [12, 10, 14, 8].forEach((value, index) => {
    if (students[index] && assessmentId) {
      store.setGradeEntry(students[index].id, assessmentId, value);
    }
  });
  return courseId;
}

