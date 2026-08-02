export function clampGrade(value, min = 0, max = 15) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function calculateWeightedGrade(items = [], { min = 0, max = 15 } = {}) {
  let weightedSum = 0;
  let weightSum = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.value === null || item?.value === undefined) continue;
    const value = Number(item.value);
    const weight = Number(item.weight);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightedSum += value * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? clampGrade(weightedSum / weightSum, min, max) : null;
}

export function combineGradePeriods(firstHalf, secondHalf, { min = 0, max = 15 } = {}) {
  const first = firstHalf === null || firstHalf === undefined ? null : Number(firstHalf);
  const second = secondHalf === null || secondHalf === undefined ? null : Number(secondHalf);
  if (Number.isFinite(first) && Number.isFinite(second)) {
    return clampGrade((first + second) / 2, min, max);
  }
  if (Number.isFinite(first)) return clampGrade(first, min, max);
  if (Number.isFinite(second)) return clampGrade(second, min, max);
  return null;
}
