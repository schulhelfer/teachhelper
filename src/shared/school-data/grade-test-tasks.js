import { GRADE_TEST_AFB_OPTIONS } from "./defaults.js";

function normalizeTaskId(value) {
  return String(value || "").trim();
}

function normalizeCompetenceId(value) {
  return String(value || "").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
}

function normalizeMaxBe(value) {
  const text = String(value ?? "").trim().replace(".", ",");
  if (!/^\d+(?:,\d)?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number >= 0 && Math.abs(number * 2 - Math.round(number * 2)) < 0.0000001
    ? Math.round(number * 2) / 2
    : null;
}

export function formatGradeSubTaskLetter(index) {
  let number = index + 1;
  let label = "";
  while (number > 0) {
    number -= 1;
    label = String.fromCharCode(97 + number % 26) + label;
    number = Math.floor(number / 26);
  }
  return label;
}

export function normalizeGradeTestTasks(tasks = [], options = {}) {
  const usedIds = new Set();
  const normalizeItems = (items, prefix = "") => (Array.isArray(items) ? items : [])
    .map((raw, index) => {
      const item = raw && typeof raw === "object" ? raw : {};
      const idBase = normalizeTaskId(item.id) || `${prefix}${index + 1}`;
      let id = idBase;
      let suffix = 2;
      while (usedIds.has(id)) id = `${idBase}-${suffix++}`;
      usedIds.add(id);
      const afb = String(item.afb || "").trim().toUpperCase();
      return {
        id,
        title: String(item.title || "").trim().replace(/\s+/g, " ") || `Aufgabe ${index + 1}`,
        maxBe: normalizeMaxBe(item.maxBe),
        afb: GRADE_TEST_AFB_OPTIONS.includes(afb) ? afb : "",
        deficitDiagnosisFollowUp: item.deficitDiagnosisFollowUp === true,
        competenceExpectationIds: [...new Set((Array.isArray(item.competenceExpectationIds) ? item.competenceExpectationIds : [])
          .map(normalizeCompetenceId).filter(Boolean))],
        customCompetenceText: String(item.customCompetenceText || "").trim(),
        sortOrder: Number(item.sortOrder || index + 1),
        source: item
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((task, index) => ({ ...task, sortOrder: index + 1 }));
  let normalized = normalizeItems(tasks);
  if (!normalized.length && options.ensureDefault !== false) normalized = normalizeItems([{}]);
  return normalized.map(({ source, ...task }) => {
    const subTasks = normalizeItems(source.subTasks, `${task.id}-part-`).map(({ source: childSource, ...child }) => child);
    return subTasks.length ? {
      ...task,
      maxBe: null,
      afb: "",
      deficitDiagnosisFollowUp: false,
      competenceExpectationIds: [],
      customCompetenceText: "",
      subTasks
    } : task;
  });
}

export function getGradeTestScoringTasks(tasks = []) {
  return normalizeGradeTestTasks(tasks, { ensureDefault: false }).flatMap((task, index) => (
    task.subTasks?.length
      ? task.subTasks.map((child, childIndex) => ({
        ...child,
        label: `${index + 1}${formatGradeSubTaskLetter(childIndex)}`,
        parentId: task.id
      }))
      : [{ ...task, label: String(index + 1), parentId: null }]
  ));
}

export function mapGradeTestScoringTasks(tasks, transform) {
  return normalizeGradeTestTasks(tasks, { ensureDefault: false }).map((task) => (
    task.subTasks?.length ? { ...task, subTasks: task.subTasks.map(transform) } : transform(task)
  ));
}

export function calculateGradeTaskScoreSummary(tasks, scores = {}) {
  const leaves = getGradeTestScoringTasks(tasks);
  let earnedSum = 0;
  let enteredCount = 0;
  let invalid = false;
  leaves.forEach((task) => {
    if (!Object.prototype.hasOwnProperty.call(scores, task.id)) return;
    const score = normalizeMaxBe(scores[task.id]);
    if (score === null) {
      if (scores[task.id] !== null && scores[task.id] !== "") invalid = true;
      return;
    }
    if (!(task.maxBe > 0) || score > task.maxBe) invalid = true;
    earnedSum += score;
    enteredCount += 1;
  });
  return {
    maxSum: leaves.reduce((sum, task) => sum + Number(task.maxBe || 0), 0),
    earnedSum: enteredCount ? earnedSum : null,
    invalid,
    incomplete: enteredCount < leaves.length || leaves.some((task) => !(task.maxBe > 0)),
    requiresFollowUp: leaves.some((task) => task.deficitDiagnosisFollowUp && normalizeMaxBe(scores[task.id]) !== null
      && task.maxBe > 0 && normalizeMaxBe(scores[task.id]) < task.maxBe / 3)
  };
}

export function calculateGradeTaskAverageSummary(tasks, scoreEntries = []) {
  const summaries = scoreEntries.map((scores) => calculateGradeTaskScoreSummary(tasks, scores || {}));
  const entered = summaries.filter((summary) => summary.earnedSum !== null);
  return {
    earnedAverage: entered.length ? entered.reduce((sum, summary) => sum + summary.earnedSum, 0) / entered.length : null,
    invalid: summaries.some((summary) => summary.invalid)
  };
}
