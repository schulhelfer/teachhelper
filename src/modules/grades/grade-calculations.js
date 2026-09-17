export const GRADE_DEFICIT_THRESHOLD_DEFAULT = 4;

export function parseGradeValue(raw, maxValue = Number.POSITIVE_INFINITY) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { valid: true, value: null };
  }
  if (!/^\d+$/.test(text)) {
    return { valid: false, value: null };
  }
  const value = Number(text);
  const normalizedMax = Number.isFinite(maxValue)
    ? Math.max(0, Math.round(Number(maxValue) || 0))
    : Number.POSITIVE_INFINITY;
  if (!Number.isInteger(value) || value < 0 || value > normalizedMax) {
    return { valid: false, value: null };
  }
  return { valid: true, value };
}

export function normalizeGradeDeficitThreshold(value, fallback = GRADE_DEFICIT_THRESHOLD_DEFAULT) {
  const parsed = parseGradeValue(value, 15);
  if (parsed.valid && parsed.value !== null) {
    return parsed.value;
  }
  const fallbackParsed = parseGradeValue(fallback, 15);
  return fallbackParsed.valid && fallbackParsed.value !== null
    ? fallbackParsed.value
    : GRADE_DEFICIT_THRESHOLD_DEFAULT;
}

export function isGradeValueBelowThreshold(value, threshold = GRADE_DEFICIT_THRESHOLD_DEFAULT) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  const numeric = Number(value);
  const normalizedThreshold = normalizeGradeDeficitThreshold(
    threshold,
    GRADE_DEFICIT_THRESHOLD_DEFAULT
  );
  return Number.isFinite(numeric) && numeric <= normalizedThreshold;
}

export function calculateGradeDeficitShare(values = [], threshold = GRADE_DEFICIT_THRESHOLD_DEFAULT) {
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    })
    .filter((value) => value !== null && value !== undefined);
  if (!normalizedValues.length) {
    return null;
  }
  const deficitCount = normalizedValues.filter((value) => (
    isGradeValueBelowThreshold(value, threshold)
  )).length;
  return Math.round((deficitCount / normalizedValues.length) * 100);
}

export function calculateGradeEntryAverage(values = []) {
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((value) => {
      const parsed = parseGradeValue(value, 15);
      return parsed.valid ? parsed.value : null;
    })
    .filter((value) => value !== null && value !== undefined);
  if (!normalizedValues.length) {
    return null;
  }
  return normalizedValues.reduce((sum, value) => sum + Number(value || 0), 0) / normalizedValues.length;
}
