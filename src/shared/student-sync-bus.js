export const STUDENTS_UPDATED_EVENT = 'classroom:students-updated';
export const STUDENTS_SYNC_SOURCE_GROUPS = 'groups';
export const STUDENTS_SYNC_SOURCE_SEATPLAN = 'seatplan';

const DEFAULT_PERFORMANCE_FLAIR_COUNT = 4;

// Official shared payload shape for student roster sync across feature modules.
function cloneStudent(student, index = 0) {
  if (!student || typeof student !== 'object') return null;
  const rawId = typeof student.id === 'string'
    ? student.id.trim()
    : String(student.id ?? '').trim();
  const id = rawId || String(index + 1).padStart(2, '0');
  return {
    id,
    first: typeof student.first === 'string' ? student.first : '',
    last: typeof student.last === 'string' ? student.last : '',
    performanceFlair: typeof student.performanceFlair === 'string' ? student.performanceFlair : '',
    buddies: Array.isArray(student.buddies)
      ? student.buddies.map((value) => String(value)).filter(Boolean)
      : [],
    foes: Array.isArray(student.foes)
      ? student.foes.map((value) => String(value)).filter(Boolean)
      : [],
    randomWeight: Number.isFinite(Number(student.randomWeight))
      ? Number(student.randomWeight)
      : 1,
  };
}

export function cloneStudentsPayload(students) {
  if (!Array.isArray(students)) return [];
  return students
    .map((student, index) => cloneStudent(student, index))
    .filter(Boolean);
}

export function normalizeStudentsSyncDetail(detail = null, previous = null) {
  const fallback = previous && typeof previous === 'object' ? previous : {};
  const source = typeof detail?.source === 'string' && detail.source.trim()
    ? detail.source.trim()
    : (
      typeof fallback.source === 'string' && fallback.source.trim()
        ? fallback.source.trim()
        : STUDENTS_SYNC_SOURCE_GROUPS
    );
  const performanceFlairCount = Math.max(
    2,
    Math.round(Number(
      detail?.performanceFlairCount
      ?? fallback.performanceFlairCount
      ?? DEFAULT_PERFORMANCE_FLAIR_COUNT
    ) || DEFAULT_PERFORMANCE_FLAIR_COUNT)
  );
  const importedAtRaw = Number(detail?.importedAt ?? fallback.importedAt ?? Date.now());
  return {
    source,
    students: cloneStudentsPayload(detail?.students ?? fallback.students),
    performanceFlairCount,
    csvName: typeof detail?.csvName === 'string'
      ? detail.csvName
      : (typeof fallback.csvName === 'string' ? fallback.csvName : ''),
    headers: Array.isArray(detail?.headers)
      ? detail.headers.slice()
      : (Array.isArray(fallback.headers) ? fallback.headers.slice() : []),
    delim: typeof detail?.delim === 'string' && detail.delim
      ? detail.delim
      : (typeof fallback.delim === 'string' && fallback.delim ? fallback.delim : ','),
    importedAt: Number.isFinite(importedAtRaw) ? importedAtRaw : Date.now(),
  };
}
