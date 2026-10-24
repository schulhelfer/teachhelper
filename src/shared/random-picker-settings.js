export const RANDOM_PICKER_SPIN_DURATION_MS = 3000;
export const RANDOM_PICKER_MIN_SPIN_DURATION_MS = 1000;
export const RANDOM_PICKER_MAX_SPIN_DURATION_MS = 10000;
export const RANDOM_PICKER_SPIN_DURATION_STEP_MS = 500;

export function normalizeRandomPickerSpinDurationMs(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    return RANDOM_PICKER_SPIN_DURATION_MS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return RANDOM_PICKER_SPIN_DURATION_MS;
  const bounded = Math.min(RANDOM_PICKER_MAX_SPIN_DURATION_MS, Math.max(RANDOM_PICKER_MIN_SPIN_DURATION_MS, parsed));
  return Math.round(bounded / RANDOM_PICKER_SPIN_DURATION_STEP_MS) * RANDOM_PICKER_SPIN_DURATION_STEP_MS;
}
