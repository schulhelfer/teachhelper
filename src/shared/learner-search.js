const MAX_RESULTS = 12;

export function normalizeLearnerSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function learnerDisplayName(student = {}) {
  return [String(student.firstName || '').trim(), String(student.lastName || '').trim()]
    .filter(Boolean)
    .join(' ');
}

function levenshteinDistance(left = '', right = '') {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function scoreCandidate(query, student) {
  const normalizedQuery = normalizeLearnerSearchText(query);
  if (!normalizedQuery) return null;
  const first = normalizeLearnerSearchText(student.firstName);
  const last = normalizeLearnerSearchText(student.lastName);
  const rufname = normalizeLearnerSearchText(student.rufname);
  const full = [first, last].filter(Boolean).join(' ');
  if (!full) return null;
  const alternatives = [full, [last, first].filter(Boolean).join(' '), first, last, rufname].filter(Boolean);
  let score = 0;
  for (const value of alternatives) {
    if (value === normalizedQuery) score = Math.max(score, 1000);
    else if (value.startsWith(normalizedQuery)) score = Math.max(score, 800 - Math.max(0, value.length - normalizedQuery.length));
    else if (value.split(' ').some((word) => word.startsWith(normalizedQuery))) score = Math.max(score, 700);
    else if (value.includes(normalizedQuery)) score = Math.max(score, 600 - Math.max(0, value.length - normalizedQuery.length));
    const distance = levenshteinDistance(normalizedQuery, value);
    const threshold = Math.max(1, Math.floor(Math.max(normalizedQuery.length, value.length) * 0.42));
    if (distance <= threshold) score = Math.max(score, 400 - distance * 25);
  }
  return score || null;
}

export function findLearnerMatches(students = [], query = '', limit = MAX_RESULTS) {
  const grouped = new Map();
  for (const rawStudent of Array.isArray(students) ? students : []) {
    if (rawStudent?.isPlaceholder || !Number(rawStudent?.studentId ?? rawStudent?.id)) continue;
    const name = learnerDisplayName(rawStudent);
    const key = normalizeLearnerSearchText(name);
    const score = scoreCandidate(query, rawStudent);
    if (!key || score === null) continue;
    const current = grouped.get(key) || { key, name, score, courses: [] };
    current.score = Math.max(current.score, score);
    current.courses.push({
      courseId: Number(rawStudent.courseId) || 0,
      courseName: String(rawStudent.courseName || 'Kurs'),
      courseColor: String(rawStudent.courseColor || ''),
      studentId: Number(rawStudent.studentId ?? rawStudent.id) || 0,
    });
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((match) => ({
      ...match,
      courses: match.courses.sort((left, right) => left.courseName.localeCompare(right.courseName, 'de')),
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'de'))
    .slice(0, Math.max(1, Number(limit) || MAX_RESULTS));
}
