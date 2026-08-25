const TEACHER_SEAT_VALUE = "TEACHER";

function normalizeNamePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function buildStudentNameMatchKey(lastName, firstName) {
  return [
    normalizeNamePart(lastName).toLocaleLowerCase("de"),
    normalizeNamePart(firstName).toLocaleLowerCase("de")
  ].join("|");
}

const EMPTY_NAME_MATCH_KEY = buildStudentNameMatchKey("", "");

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function studentMatchKey(student) {
  if (!isRecord(student) || student.isPlaceholder) return "";
  const key = buildStudentNameMatchKey(student.lastName, student.firstName);
  return key === EMPTY_NAME_MATCH_KEY ? "" : key;
}

function studentIdText(student) {
  const id = Number(isRecord(student) ? student.id : 0) || 0;
  return id > 0 ? String(id) : "";
}

function buildTargetIdsByName(targetStudents) {
  const byName = new Map();
  for (const student of Array.isArray(targetStudents) ? targetStudents : []) {
    const key = studentMatchKey(student);
    const id = studentIdText(student);
    if (key && id && !byName.has(key)) byName.set(key, id);
  }
  return byName;
}

function buildSourceKeysById(sourceStudents) {
  const byId = new Map();
  for (const student of Array.isArray(sourceStudents) ? sourceStudents : []) {
    const key = studentMatchKey(student);
    const id = studentIdText(student);
    if (key && id && !byId.has(id)) byId.set(id, key);
  }
  return byId;
}

function listTeacherDistances(conditions) {
  const raw = isRecord(conditions) ? conditions.teacherDistances : null;
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (isRecord(raw)) {
    return Object.entries(raw).map(([studentId, maxDistance]) => ({ studentId, maxDistance }));
  }
  return [];
}

function copyGrid(grid) {
  if (!isRecord(grid)) return null;
  const rows = Number(grid.rows);
  const cols = Number(grid.cols);
  if (!Number.isFinite(rows) || !Number.isFinite(cols)) return null;
  return { rows, cols };
}

function copyMergedPairs(mergedPairs) {
  if (!Array.isArray(mergedPairs)) return [];
  return mergedPairs
    .map((entry) => {
      if (Array.isArray(entry) && entry.length === 2) return [String(entry[0]), String(entry[1])];
      if (typeof entry === "string" && entry.split("|").length === 2) return entry;
      return null;
    })
    .filter(Boolean);
}

function copyMergeSettings(mergeSettings) {
  if (!isRecord(mergeSettings)) return null;
  return {
    toggleValue: String(mergeSettings.toggleValue || ""),
    mode: String(mergeSettings.mode || ""),
    symbolsHidden: Boolean(mergeSettings.symbolsHidden)
  };
}

function readSeatScoresHidden(plan) {
  if (isRecord(plan.ui)) return Boolean(plan.ui.seatScoresHidden);
  return Boolean(plan.seatScoresHidden);
}

function normalizeGenderPreference(value) {
  const gender = String(value || "").trim().toLowerCase();
  return gender === "m" || gender === "w" || gender === "d" ? gender : "";
}

function remapPreferenceIds(values, ownerId, resolveTargetId) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => resolveTargetId(value))
    .filter((value) => value && value !== ownerId && !seen.has(value) && (seen.add(value) || true))
    .slice(0, 3);
}

function remapCourseSeatPreferences(preferences, resolveTargetId) {
  if (!isRecord(preferences)) return {};
  const nextPreferences = {};
  for (const [sourceStudentId, value] of Object.entries(preferences)) {
    if (!isRecord(value)) continue;
    const targetStudentId = resolveTargetId(sourceStudentId);
    if (!targetStudentId) continue;
    const genderPref = normalizeGenderPreference(value.genderPref);
    const prefersAlone = Boolean(value.prefersAlone);
    const buddies = remapPreferenceIds(value.buddies, targetStudentId, resolveTargetId);
    const foes = remapPreferenceIds(value.foes, targetStudentId, resolveTargetId);
    if (!genderPref && !prefersAlone && !buddies.length && !foes.length) continue;
    nextPreferences[targetStudentId] = { genderPref, prefersAlone, buddies, foes };
  }
  return nextPreferences;
}

export function remapCourseSeatPlan({ plan, sourceStudents, targetStudents } = {}) {
  if (!isRecord(plan)) return null;

  const targetIdsByName = buildTargetIdsByName(targetStudents);
  const sourceKeysById = buildSourceKeysById(sourceStudents);
  const resolveTargetId = (rawId) => {
    const id = String(rawId ?? "").trim();
    if (!id) return "";
    const key = sourceKeysById.get(id);
    return key ? (targetIdsByName.get(key) || "") : "";
  };

  const takenTargetIds = new Set();
  const seats = {};
  let sourceSeatedCount = 0;
  let matchedCount = 0;
  for (const [seatId, value] of Object.entries(isRecord(plan.seats) ? plan.seats : {})) {
    if (value === TEACHER_SEAT_VALUE) {
      seats[seatId] = TEACHER_SEAT_VALUE;
      continue;
    }
    if (!value) {
      seats[seatId] = null;
      continue;
    }
    sourceSeatedCount += 1;
    const targetId = resolveTargetId(value);
    if (!targetId || takenTargetIds.has(targetId)) {
      seats[seatId] = null;
      continue;
    }
    takenTargetIds.add(targetId);
    matchedCount += 1;
    seats[seatId] = targetId;
  }

  const seenDistanceIds = new Set();
  const teacherDistances = [];
  for (const entry of listTeacherDistances(plan.conditions)) {
    const targetId = resolveTargetId(entry.studentId);
    if (!targetId || seenDistanceIds.has(targetId)) continue;
    seenDistanceIds.add(targetId);
    teacherDistances.push({ studentId: targetId, maxDistance: entry.maxDistance });
  }
  const preferences = remapCourseSeatPreferences(plan.preferences, resolveTargetId);

  const nextPlan = {
    activeSeats: (Array.isArray(plan.activeSeats) ? plan.activeSeats : [])
      .filter(Boolean)
      .map((seatId) => String(seatId)),
    seats,
    mergedPairs: copyMergedPairs(plan.mergedPairs),
    conditions: { teacherDistances },
    preferences,
    seatScoresHidden: readSeatScoresHidden(plan)
  };
  const grid = copyGrid(plan.grid);
  if (grid) nextPlan.grid = grid;
  const mergeSettings = copyMergeSettings(plan.mergeSettings);
  if (mergeSettings) nextPlan.mergeSettings = mergeSettings;

  return { plan: nextPlan, matchedCount, sourceSeatedCount };
}
