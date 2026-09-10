export const MAX_PERFORMANCE_FLAIR_COUNT = 10;

export function getPerformanceFlairLabel(index) {
  let remaining = Math.max(0, Math.floor(Number(index) || 0));
  let label = '';
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

export function clampPerformanceFlairCount(value, fallback = 4) {
  const parsed = Number.parseInt(value, 10);
  const fallbackParsed = Number.parseInt(fallback, 10);
  const normalizedFallback = Number.isFinite(fallbackParsed) && fallbackParsed >= 2
    ? Math.min(MAX_PERFORMANCE_FLAIR_COUNT, fallbackParsed)
    : 4;
  if (!Number.isFinite(parsed)) return normalizedFallback;
  if (parsed < 2) return normalizedFallback;
  return Math.min(MAX_PERFORMANCE_FLAIR_COUNT, parsed);
}

export function normalizePerformanceFlair(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]+$/.test(normalized) ? normalized : '';
}

export function sanitizeSharedPerformanceFlair(value, count = 4) {
  const normalized = normalizePerformanceFlair(value);
  const allowed = Array.from(
    { length: clampPerformanceFlairCount(count, 4) },
    (_, index) => getPerformanceFlairLabel(index),
  );
  return allowed.includes(normalized) ? normalized : '';
}

export function resolveGroupsDom(doc = document) {
  return {
    groupSuggest: doc.getElementById('group-suggest'),
    groupSuggestCollapsed: doc.getElementById('group-suggest-collapsed'),
    groupResetLearners: doc.getElementById('group-reset-learners'),
    groupExportPlan: doc.getElementById('group-export-plan'),
    groupImportPlan: doc.getElementById('group-import-plan'),
    groupPrintPlan: doc.getElementById('group-print-plan'),
    importPlanFile: doc.getElementById('import-plan-file'),
    unseated: doc.getElementById('unseated'),
    groupsGrid: doc.getElementById('groups-grid'),
    groupsGridWrap: doc.querySelector('.groups-grid-wrap'),
    groupsMainHost: doc.getElementById('groups-main-host'),
    studentTemplate: doc.getElementById('student-tpl'),
    printPlanTitle: doc.getElementById('print-plan-title'),
    minGroupDec: doc.getElementById('min-group-dec'),
    minGroupInc: doc.getElementById('min-group-inc'),
    minGroupSize: doc.getElementById('min-group-size'),
    maxGroupDec: doc.getElementById('max-group-dec'),
    maxGroupInc: doc.getElementById('max-group-inc'),
    maxGroupSize: doc.getElementById('max-group-size'),
    preferencesDialogTitle: doc.getElementById('preferences-dialog-title'),
    preferencesTableHead: doc.getElementById('preferences-thead'),
    preferencesTableBody: doc.getElementById('preferences-tbody'),
    preferencesRandomPickerAutoDisable: doc.getElementById('preferences-random-picker-auto-disable'),
    preferencesPerformanceSummary: doc.getElementById('preferences-performance-summary'),
    preferencesReset: doc.getElementById('preferences-reset'),
    suggestProgress: doc.getElementById('suggest-progress'),
    suggestProgressFill: doc.getElementById('suggest-progress-fill'),
    suggestProgressLabel: doc.getElementById('suggest-progress-label'),
  };
}

function createGroupsState(source = {}) {
  return {
    seats: source.seats && typeof source.seats === 'object' ? source.seats : {},
    gridRows: source.gridRows ?? 3,
    gridCols: source.gridCols ?? 3,
    activeSeats: source.activeSeats instanceof Set
      ? source.activeSeats
      : new Set(Array.isArray(source.activeSeats) ? source.activeSeats : []),
    activeSeatOrder: Array.isArray(source.activeSeatOrder) ? source.activeSeatOrder : [],
    lockedSeats: source.lockedSeats instanceof Set
      ? source.lockedSeats
      : new Set(Array.isArray(source.lockedSeats) ? source.lockedSeats : []),
    dragSourceSeat: source.dragSourceSeat ?? null,
    dragPayloadType: source.dragPayloadType ?? null,
    minGroupSize: source.minGroupSize ?? 2,
    maxGroupSize: source.maxGroupSize ?? 4,
    seatTopics: source.seatTopics && typeof source.seatTopics === 'object' ? source.seatTopics : {},
  };
}

export function mountGroups({
  doc = typeof document !== 'undefined' ? document : null,
  view = doc?.defaultView || globalThis,
  dom = doc ? resolveGroupsDom(doc) : {},
  getStudents = () => [],
  getPerformanceFlairCount = () => 4,
  setPerformanceFlairCount = () => {},
  displayStudentName = student => `${student?.first || ''} ${student?.last || ''}`.trim(),
  formatStudentLabel = displayStudentName,
  isGroupsActive = () => true,
  isRandomPickerActive = () => false,
  isTutorialDemoActive = () => false,
  showMessage = () => {},
  reportError = () => {},
  getSuggestedPlanFileName = () => 'Gruppen',
  onPlanImportRequest = () => {},
  onPlanFileSelected = async () => {},
  onPlanExportRequest = () => {},
} = {}) {
  const els = dom;
  const staticDisposers = [];
  const bindStatic = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    staticDisposers.push(() => target.removeEventListener(type, handler, options));
  };
  let groupState = createGroupsState();
  const state = new Proxy({}, {
    get(_target, property) {
      if (property === 'students') {
        const students = getStudents();
        return Array.isArray(students) ? students : [];
      }
      if (property === 'performanceFlairCount') return getPerformanceFlairCount();
      return groupState[property];
    },
    set(_target, property, value) {
      if (property === 'performanceFlairCount') {
        setPerformanceFlairCount(value);
        return true;
      }
      groupState[property] = value;
      return true;
    },
  });
  const PREFERENCE_SLOT_COUNT = 3;
  const MAX_GRID_SIZE = 20;
  const TOUCH_DRAG_DELAY_MS = 90;
  const TOUCH_DRAG_CANCEL_DISTANCE = 10;
  const touchPoints = view?.navigator?.maxTouchPoints || 0;
  const supportsTouchDrag = typeof view !== 'undefined'
    && (('ontouchstart' in view) || touchPoints > 0);
  let touchDragState = null;
  function initSeatTopicInput(input) {
    if (!input) return;
    const defaultPlaceholder = input.getAttribute('data-default-placeholder') || input.getAttribute('placeholder') || 'Thema';
    input.dataset.defaultPlaceholder = defaultPlaceholder;
    input.addEventListener('focus', () => {
      input.placeholder = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.placeholder = input.dataset.defaultPlaceholder || 'Thema';
      }
    });
  }
  function syncSeatTopicState(seat, topicValue) {
    if (!seat) return;
    const hasTopic = Boolean(String(topicValue || '').trim());
    seat.classList.toggle('seat-topic-empty', !hasTopic);
  }
  function normalizeGridDimension(value) {
    if (value === undefined || value === null) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return null;
    return Math.min(MAX_GRID_SIZE, Math.max(1, parsed));
  }
  function clampGridDimension(value) {
    return normalizeGridDimension(value) ?? 1;
  }
  function findBestGridSize(target) {
    const limit = MAX_GRID_SIZE;
    const cappedTarget = Math.max(1, Math.min(target, limit * limit));
    let best = { rows: 1, cols: 1, area: 1, diff: Infinity };
    for (let rows = 1; rows <= limit; rows++) {
      const cols = Math.ceil(cappedTarget / rows);
      if (cols > limit) continue;
      const area = rows * cols;
      const diff = area - cappedTarget;
      if (diff < best.diff || (diff === best.diff && Math.abs(rows - cols) < Math.abs(best.rows - best.cols))) {
        best = { rows, cols, area, diff };
      }
    }
    return { rows: clampGridDimension(best.rows), cols: clampGridDimension(best.cols) };
  }

  function nextSeatSlot() {
    const limit = MAX_GRID_SIZE;
    let rows = clampGridDimension(state.gridRows);
    let cols = clampGridDimension(state.gridCols);
    const occupied = new Set(state.activeSeatOrder || state.activeSeats);

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const id = seatId(r, c);
        if (!occupied.has(id)) {
          return { id, rows, cols };
        }
      }
    }

    if (cols < limit) {
      cols += 1;
      return { id: seatId(rows, cols), rows, cols };
    }
    if (rows < limit) {
      rows += 1;
      return { id: seatId(rows, 1), rows, cols };
    }
    return null;
  }

  function ensureCapacityForStudents(maxSize, minSize = state.minGroupSize || 1) {
    const total = Math.max(0, state.students.length || 0);
    const minGroupsNeeded = Math.max(1, Math.ceil(total / Math.max(1, maxSize)));
    const maxGroupsAllowed = Math.max(1, Math.floor(total / Math.max(1, minSize))) || 1;
    const targetGroups = Math.max(1, Math.min(maxGroupsAllowed, minGroupsNeeded));
    const { rows, cols } = findBestGridSize(targetGroups);
    const full = Array.from(buildFullActiveSet(rows, cols));
    state.activeSeatOrder = full;
    state.activeSeats = new Set(full);
    state.gridRows = rows;
    state.gridCols = cols;
    buildGrid();
  }
  function maxGroupLimit() {
    const total = Math.max(1, state.students.length || 0);
    const fallback = Math.max(99, state.activeSeats.size || (state.gridRows * state.gridCols) || 0);
    return Math.max(total, fallback);
  }
  function clampMaxGroupSize(value) {
    const limit = maxGroupLimit();
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    const maxed = Math.max(1, Math.min(limit, parsed));
    return Math.max(state.minGroupSize || 1, maxed);
  }
  function clampMinGroupSize(value) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    const maxLimit = clampMaxGroupSize(state.maxGroupSize || 1);
    return Math.min(parsed, maxLimit);
  }
  function syncGroupSizeInputs() {
    if (els.maxGroupSize) {
      const limit = maxGroupLimit();
      els.maxGroupSize.min = '1';
      els.maxGroupSize.max = String(limit);
    }
    state.minGroupSize = clampMinGroupSize(state.minGroupSize);
    state.maxGroupSize = clampMaxGroupSize(state.maxGroupSize);
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    if (els.minGroupSize) els.minGroupSize.value = String(state.minGroupSize);
    if (els.maxGroupSize) els.maxGroupSize.value = String(state.maxGroupSize);
  }
  function hasAnyAssignedGroupStudents() {
    return Object.values(state.seats || {}).some((seatList) => ensureSeatList(seatList).length > 0);
  }
  function syncGroupGridFromSizeInputs(options = {}) {
    const { forceCapacity = false } = options;
    syncGroupSizeInputs();
    if (!state.students.length) {
      requestGroupGridLayoutRefresh({ resetViewport: true });
      return;
    }
    if (forceCapacity || !hasAnyAssignedGroupStudents()) {
      const maxSize = clampMaxGroupSize(state.maxGroupSize);
      const minSize = clampMinGroupSize(state.minGroupSize);
      ensureCapacityForStudents(maxSize, minSize);
      return;
    }
    requestGroupGridLayoutRefresh({ resetViewport: true });
  }
  const guardGroupInput = () => {
    if (!state.students.length) {
      showMessage('Importiere zuerst die Namensliste!', 'warn', { presentation: 'toast' });
      return false;
    }
    return true;
  };
  const adjustMinGroupSize = (delta) => {
    if (!guardGroupInput()) return;
    const current = state.minGroupSize || 1;
    state.minGroupSize = clampMinGroupSize(current + delta);
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    syncGroupGridFromSizeInputs();
  };
  const adjustMaxGroupSize = (delta) => {
    if (!guardGroupInput()) return;
    const current = state.maxGroupSize || 1;
    state.maxGroupSize = clampMaxGroupSize(current + delta);
    if (state.minGroupSize > state.maxGroupSize) {
      state.minGroupSize = clampMinGroupSize(state.maxGroupSize);
    }
    syncGroupGridFromSizeInputs();
  };
  bindStatic(els.minGroupSize, 'change', () => {
    if (!guardGroupInput()) return;
    state.minGroupSize = clampMinGroupSize(Number(els.minGroupSize.value));
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    syncGroupGridFromSizeInputs();
  });
  bindStatic(els.maxGroupSize, 'change', () => {
    if (!guardGroupInput()) return;
    state.maxGroupSize = clampMaxGroupSize(Number(els.maxGroupSize.value));
    if (state.minGroupSize > state.maxGroupSize) {
      state.minGroupSize = clampMinGroupSize(state.maxGroupSize);
    }
    syncGroupGridFromSizeInputs();
  });
  bindStatic(els.minGroupDec, 'click', () => adjustMinGroupSize(-1));
  bindStatic(els.minGroupInc, 'click', () => adjustMinGroupSize(1));
  bindStatic(els.maxGroupDec, 'click', () => adjustMaxGroupSize(-1));
  bindStatic(els.maxGroupInc, 'click', () => adjustMaxGroupSize(1));
  syncGroupSizeInputs();
  function ensureSeatList(val) {
    if (!val) return [];
    if (Array.isArray(val)) return Array.from(new Set(val.filter(Boolean).map(String)));
    return [String(val)].filter(Boolean);
  }
  function startWiggle() {
    doc.querySelectorAll('.seat-chip, .student').forEach(el => el.classList.add('wiggle'));
  }
  function stopWiggle() {
    doc.querySelectorAll('.wiggle').forEach(el => el.classList.remove('wiggle'));
  }
  function getSeatList(id) {
    return ensureSeatList(state.seats[id]);
  }
  function setSeatList(id, list) {
    state.seats[id] = ensureSeatList(list);
  }
  function addStudentToSeat(seatId, studentId) {
    if (!seatId || !studentId) return;
    const list = getSeatList(seatId);
    if (!list.includes(studentId)) {
      list.push(studentId);
      setSeatList(seatId, list);
    }
  }
  function removeStudentFromSeat(seatId, studentId) {
    if (!seatId || !studentId) return;
    const list = getSeatList(seatId);
    const next = list.filter(id => id !== studentId);
    setSeatList(seatId, next);
  }
  function buildFullActiveSet(rows, cols) {
    const set = new Set();
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        set.add(seatId(r, c));
      }
    }
    return set;
  }
  function seatId(r, c) { return `${r}-${c}` }
  function getAllowedPerformanceFlairs(count = state.performanceFlairCount) {
    const total = clampPerformanceFlairCount(count, 4);
    return Array.from({ length: total }, (_, index) => getPerformanceFlairLabel(index));
  }
  function sanitizePerformanceFlairForCount(value, count = state.performanceFlairCount) {
    const normalized = normalizePerformanceFlair(value);
    return getAllowedPerformanceFlairs(count).includes(normalized) ? normalized : '';
  }
  function getPerformanceFlairRank(value, count = state.performanceFlairCount) {
    const flair = sanitizePerformanceFlairForCount(value, count);
    if (!flair) return -1;
    return getAllowedPerformanceFlairs(count).indexOf(flair);
  }
  function getPerformanceFlairDistance(first, second, count = state.performanceFlairCount) {
    const firstRank = getPerformanceFlairRank(first, count);
    const secondRank = getPerformanceFlairRank(second, count);
    if (firstRank < 0 || secondRank < 0) return null;
    return Math.abs(firstRank - secondRank);
  }
  function sanitizePerformanceFlairCountInStudents(count = state.performanceFlairCount, students = state.students) {
    if (!Array.isArray(students)) return;
    students.forEach((student) => {
      if (!student || typeof student !== 'object') return;
      student.performanceFlair = sanitizePerformanceFlairForCount(student.performanceFlair, count);
    });
  }
  function formatPerformanceFlairRangeLabel(count = state.performanceFlairCount) {
    const normalizedCount = clampPerformanceFlairCount(count, 4);
    return `A-${getPerformanceFlairLabel(normalizedCount - 1)}`;
  }
  function setPreferencesResetVisibility(isVisible) {
    if (!els.preferencesReset) return;
    els.preferencesReset.hidden = !isVisible;
  }
  function renderSeatPreferencesHeader() {
    if (!els.preferencesDialogTitle || !els.preferencesTableHead) return;
    setPreferencesResetVisibility(false);
    if (els.preferencesRandomPickerAutoDisable) {
      els.preferencesRandomPickerAutoDisable.hidden = true;
    }
    els.preferencesDialogTitle.textContent = 'Bedingungen';
    els.preferencesTableHead.innerHTML = `
          <tr>
            <th colspan="3" class="group-header">
              Gute Gruppenpartner
            </th>
            <th class="group-header name-header"></th>
            <th class="group-header performance-flair-header">Leistungsklasse</th>
            <th colspan="3" class="group-header">
              Schlechte Gruppenpartner
            </th>
          </tr>
        `;
  }
  function createSeatPreferencesDraft(students = state.students) {
    const draft = new Map();
    (Array.isArray(students) ? students : []).forEach((student) => {
      if (!student || typeof student !== 'object') return;
      const sid = String(student.id || '').trim();
      if (!sid) return;
      draft.set(sid, {
        buddies: Array.from({ length: PREFERENCE_SLOT_COUNT }, (_, index) => student.buddies?.[index] || ''),
        foes: Array.from({ length: PREFERENCE_SLOT_COUNT }, (_, index) => student.foes?.[index] || ''),
        performanceFlair: sanitizePerformanceFlairForCount(student.performanceFlair),
      });
    });
    return draft;
  }
  function readSeatPreferencesDraftFromForm() {
    if (!els.preferencesTableBody || !els.preferencesTableBody.children.length) return null;
    const draft = createSeatPreferencesDraft();
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id]');
    selects.forEach((select) => {
      const sid = String(select.dataset.studentId || '').trim();
      if (!sid) return;
      if (!draft.has(sid)) {
        draft.set(sid, {
          buddies: Array(PREFERENCE_SLOT_COUNT).fill(''),
          foes: Array(PREFERENCE_SLOT_COUNT).fill(''),
          performanceFlair: '',
        });
      }
      const entry = draft.get(sid);
      if (select.dataset.preference === 'performance-flair') {
        entry.performanceFlair = sanitizePerformanceFlairForCount(select.value);
        return;
      }
      const slot = Number(select.dataset.prefSlot);
      if (Number.isNaN(slot)) return;
      if (select.dataset.prefType === 'foe') {
        entry.foes[slot] = select.value || '';
      } else if (select.dataset.prefType === 'buddy') {
        entry.buddies[slot] = select.value || '';
      }
    });
    return draft;
  }
  function buildSeatPreferencesTable(draft = null) {
    if (!els.preferencesTableBody) return;
    renderSeatPreferencesHeader();
    els.preferencesTableBody.innerHTML = '';
    const safeDraft = draft instanceof Map ? draft : createSeatPreferencesDraft();
    const ordered = state.students.slice().sort((a, b) => {
      const nameA = formatStudentLabel(a).toLowerCase();
      const nameB = formatStudentLabel(b).toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
    ordered.forEach(student => {
      els.preferencesTableBody.appendChild(createPreferenceRow(student, ordered, safeDraft));
    });
    const binds = els.preferencesTableBody.querySelectorAll('select[data-pref-type]');
    binds.forEach(sel => {
      sel.addEventListener('change', () => {
        refreshPreferenceOptionsForStudent(sel.dataset.studentId);
      });
    });
    refreshAllPreferenceOptions();
    renderSeatPreferencesPerformanceSummary(safeDraft);
  }
  function createPreferenceRow(student, optionsList, draftMap = null) {
    const draft = draftMap instanceof Map ? draftMap.get(student.id) : null;
    const row = doc.createElement('tr');
    for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
      row.appendChild(createPreferenceCell(student, 'buddy', i, optionsList, draft));
    }
    const nameCell = doc.createElement('th');
    nameCell.scope = 'row';
    nameCell.className = 'name-cell';
    nameCell.textContent = formatStudentLabel(student);
    row.appendChild(nameCell);
    row.appendChild(createPerformanceFlairCell(student, draft));
    for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
      row.appendChild(createPreferenceCell(student, 'foe', i, optionsList, draft));
    }
    return row;
  }
  function createPerformanceFlairCell(student, draft = null) {
    const cell = doc.createElement('td');
    cell.className = 'performance-flair-col';
    const select = doc.createElement('select');
    select.dataset.studentId = student.id;
    select.dataset.preference = 'performance-flair';
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-';
    select.appendChild(placeholder);
    getAllowedPerformanceFlairs().forEach((flair) => {
      const option = doc.createElement('option');
      option.value = flair;
      option.textContent = flair;
      select.appendChild(option);
    });
    select.value = sanitizePerformanceFlairForCount(draft?.performanceFlair ?? student.performanceFlair);
    const wrap = doc.createElement('div');
    wrap.className = 'select-wrap';
    wrap.appendChild(select);
    cell.appendChild(wrap);
    return cell;
  }
  function createPreferenceCell(student, type, slotIndex, optionsList, draft = null) {
    const cell = doc.createElement('td');
    cell.className = type === 'buddy' ? 'buddy-col' : 'foe-col';
    const select = doc.createElement('select');
    select.dataset.studentId = student.id;
    select.dataset.prefType = type;
    select.dataset.prefSlot = String(slotIndex);
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-';
    select.appendChild(placeholder);
    optionsList.forEach(optionStudent => {
      if (!optionStudent || optionStudent.id === student.id) return;
      const option = doc.createElement('option');
      option.value = optionStudent.id;
      option.textContent = formatStudentLabel(optionStudent);
      select.appendChild(option);
    });
    const source = type === 'buddy'
      ? (draft?.buddies || student.buddies || [])
      : (draft?.foes || student.foes || []);
    select.value = source[slotIndex] || '';
    const wrap = doc.createElement('div');
    wrap.className = 'select-wrap';
    wrap.appendChild(select);
    cell.appendChild(wrap);
    return cell;
  }
  function refreshPreferenceOptionsForStudent(studentId) {
    if (!studentId || !els.preferencesTableBody) return;
    const selects = els.preferencesTableBody.querySelectorAll(`select[data-student-id="${studentId}"][data-pref-type]`);
    const chosen = new Set();
    selects.forEach(sel => {
      const val = sel.value || '';
      if (val) chosen.add(val);
    });
    selects.forEach(sel => {
      sel.querySelectorAll('option').forEach(opt => {
        if (!opt.value) { opt.disabled = false; return; }
        const shouldDisable = chosen.has(opt.value) && opt.value !== sel.value;
        opt.disabled = shouldDisable;
      });
    });
  }
  function refreshAllPreferenceOptions() {
    if (!els.preferencesTableBody) return;
    const seen = new Set();
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-pref-type]');
    selects.forEach(sel => {
      const sid = sel.dataset.studentId;
      if (!sid || seen.has(sid)) return;
      seen.add(sid);
      refreshPreferenceOptionsForStudent(sid);
    });
  }
  function buildPerformanceFlairSummaryStats(draft = null, count = state.performanceFlairCount) {
    const flairs = getAllowedPerformanceFlairs(count);
    const counts = new Map(flairs.map((flair) => [flair, 0]));
    let unassigned = 0;
    state.students.forEach((student) => {
      if (!student || typeof student !== 'object') return;
      const sid = String(student.id || '').trim();
      const draftEntry = draft instanceof Map && sid ? draft.get(sid) : null;
      const flair = sanitizePerformanceFlairForCount(draftEntry?.performanceFlair ?? student.performanceFlair, count);
      if (!flair) {
        unassigned += 1;
        return;
      }
      counts.set(flair, (counts.get(flair) || 0) + 1);
    });
    return { flairs, counts, unassigned };
  }
  function renderSeatPreferencesPerformanceSummary(draft = null) {
    if (!els.preferencesPerformanceSummary) return;
    if (isRandomPickerActive() || !state.students.length) {
      els.preferencesPerformanceSummary.hidden = true;
      els.preferencesPerformanceSummary.textContent = '';
      return;
    }
    const { flairs, counts, unassigned } = buildPerformanceFlairSummaryStats(draft);
    els.preferencesPerformanceSummary.hidden = false;
    els.preferencesPerformanceSummary.innerHTML = '';

    const valuesLabel = doc.createElement('span');
    valuesLabel.className = 'preferences-performance-summary-sublabel';
    valuesLabel.textContent = 'Lernendenanzahl pro Leistungsklasse:';
    els.preferencesPerformanceSummary.appendChild(valuesLabel);

    const values = doc.createElement('div');
    values.className = 'preferences-performance-summary-values';
    flairs.forEach((flair) => {
      const pill = doc.createElement('span');
      pill.className = 'preferences-performance-summary-pill';
      pill.textContent = `${flair}: ${counts.get(flair) || 0}`;
      values.appendChild(pill);
    });
    if (unassigned > 0) {
      const pill = doc.createElement('span');
      pill.className = 'preferences-performance-summary-pill is-unassigned';
      pill.textContent = `Ohne Zuordnung: ${unassigned}`;
      values.appendChild(pill);
    }
    els.preferencesPerformanceSummary.appendChild(values);

    const countControl = doc.createElement('label');
    countControl.className = 'preferences-performance-summary-control';
    countControl.htmlFor = 'performance-flair-count-input';

    const countLabel = doc.createElement('span');
    countLabel.className = 'preferences-performance-summary-control-label';
    countLabel.textContent = 'Anzahl an Leistungsklassen:';
    countControl.appendChild(countLabel);

    const countInput = doc.createElement('input');
    countInput.type = 'text';
    countInput.id = 'performance-flair-count-input';
    countInput.inputMode = 'numeric';
    countInput.maxLength = 3;
    countInput.value = String(clampPerformanceFlairCount(state.performanceFlairCount));
    countInput.dataset.performanceFlairCountInput = '1';
    countInput.setAttribute('aria-label', 'Anzahl an Leistungsklassen');
    countControl.appendChild(countInput);

    els.preferencesPerformanceSummary.appendChild(countControl);
  }
  function applyPerformanceFlairCount(nextValue, draft = null) {
    const nextCount = clampPerformanceFlairCount(nextValue);
    state.performanceFlairCount = nextCount;
    sanitizePerformanceFlairCountInStudents(nextCount);
    if (draft instanceof Map) {
      draft.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        entry.performanceFlair = sanitizePerformanceFlairForCount(entry.performanceFlair, nextCount);
      });
      buildSeatPreferencesTable(draft);
      return;
    }
    buildSeatPreferencesTable();
  }
  function savePreferencesFromForm() {
    if (!els.preferencesTableBody) return;
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-pref-type]');
    const performanceSelects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-preference="performance-flair"]');
    const buddyMap = new Map();
    const foeMap = new Map();
    selects.forEach(select => {
      const sid = select.dataset.studentId;
      const type = select.dataset.prefType;
      const slot = Number(select.dataset.prefSlot);
      if (!sid || Number.isNaN(slot)) return;
      const map = type === 'foe' ? foeMap : buddyMap;
      if (!map.has(sid)) {
        map.set(sid, Array(PREFERENCE_SLOT_COUNT).fill(''));
      }
      map.get(sid)[slot] = select.value || '';
    });
    const flairMap = new Map();
    performanceSelects.forEach((select) => {
      const sid = String(select.dataset.studentId || '').trim();
      if (!sid) return;
      flairMap.set(sid, sanitizePerformanceFlairForCount(select.value));
    });
    state.students.forEach(student => {
      const buddySlots = buddyMap.get(student.id) || [];
      const foeSlots = foeMap.get(student.id) || [];
      applyPreferenceSlots(student, buddySlots, 'buddy');
      applyPreferenceSlots(student, foeSlots, 'foe');
      student.performanceFlair = flairMap.get(student.id) || '';
    });
  }
  function applyPreferenceSlots(student, slots, variant) {
    const entries = [];
    const seen = new Set();
    slots.forEach(value => {
      if (!value || value === student.id || seen.has(value)) return;
      seen.add(value);
      entries.push(value);
    });
    if (variant === 'buddy') {
      student.buddies = entries;
    } else {
      student.foes = entries;
    }
  }
  function isSeatWithinBounds(id, rows, cols) {
    if (!id) return false;
    const [rStr, cStr] = id.split('-');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
    return r >= 1 && r <= rows && c >= 1 && c <= cols;
  }
  function sanitizeSeatIdWithinLimit(id, maxRows = MAX_GRID_SIZE, maxCols = MAX_GRID_SIZE) {
    if (typeof id !== 'string') return null;
    const [rStr, cStr] = id.split('-');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    if (r < 1 || r > maxRows || c < 1 || c > maxCols) return null;
    return seatId(r, c);
  }
  function enforceGridBounds() {
    const rows = clampGridDimension(state.gridRows);
    const cols = clampGridDimension(state.gridCols);
    state.gridRows = rows;
    state.gridCols = cols;
    const filterSet = (set) => {
      const next = new Set();
      set.forEach(id => {
        if (isSeatWithinBounds(id, rows, cols)) next.add(id);
      });
      return next;
    };
    state.activeSeats = filterSet(state.activeSeats);
    state.lockedSeats = filterSet(state.lockedSeats);
    const trimmedSeats = {};
    Object.entries(state.seats).forEach(([id, val]) => {
      if (isSeatWithinBounds(id, rows, cols)) {
        trimmedSeats[id] = ensureSeatList(val);
      }
    });
    state.seats = trimmedSeats;
    const trimmedTopics = {};
    state.activeSeats.forEach(id => {
      const val = state.seatTopics?.[id];
      if (typeof val === 'string') { trimmedTopics[id] = val; }
    });
    state.seatTopics = trimmedTopics;
  }
  function printSeatPlan() {
    if (isTutorialDemoActive()) {
      showMessage('Demo: Drucken ist für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    if (typeof view === 'undefined' || typeof view.print !== 'function') {
      showMessage('Drucken wird vom Browser nicht unterstützt.', 'warn', { presentation: 'toast' });
      return;
    }
    if (els.printPlanTitle) {
      els.printPlanTitle.textContent = getSuggestedPlanFileName();
    }
    applyPrintScale();
    view.requestAnimationFrame(() => {
      try {
        view.print();
      } finally {
        resetPrintScale();
      }
    });
  }

  let printScaleApplied = false;
  function measurePrintTitleBlockHeight(maxWidth) {
    if (!els.printPlanTitle) return 0;
    const titleEl = els.printPlanTitle;
    const prev = {
      display: titleEl.style.display,
      position: titleEl.style.position,
      left: titleEl.style.left,
      top: titleEl.style.top,
      visibility: titleEl.style.visibility,
      pointerEvents: titleEl.style.pointerEvents,
      width: titleEl.style.width,
      maxWidth: titleEl.style.maxWidth,
    };
    const width = Math.max(120, Math.floor(maxWidth || 120));
    titleEl.style.display = 'block';
    titleEl.style.position = 'fixed';
    titleEl.style.left = '0';
    titleEl.style.top = '0';
    titleEl.style.visibility = 'hidden';
    titleEl.style.pointerEvents = 'none';
    titleEl.style.width = `${width}px`;
    titleEl.style.maxWidth = `${width}px`;
    const rect = titleEl.getBoundingClientRect();
    const style = getComputedStyle(titleEl);
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    titleEl.style.display = prev.display;
    titleEl.style.position = prev.position;
    titleEl.style.left = prev.left;
    titleEl.style.top = prev.top;
    titleEl.style.visibility = prev.visibility;
    titleEl.style.pointerEvents = prev.pointerEvents;
    titleEl.style.width = prev.width;
    titleEl.style.maxWidth = prev.maxWidth;
    return Math.max(0, rect.height + marginTop + marginBottom);
  }

  function applyPrintScale() {
    const target = els.groupsGrid || els.groupsGridWrap;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const contentWidth = Math.max(1, rect.width, target.scrollWidth || 0);
    const contentHeight = Math.max(1, rect.height, target.scrollHeight || 0);
    const marginMm = 6;
    const mmPerIn = 25.4;
    const marginIn = marginMm / mmPerIn;
    const a4Landscape = { widthIn: 297 / mmPerIn, heightIn: 210 / mmPerIn };
    const letterLandscape = { widthIn: 11, heightIn: 8.5 };
    const printableWidthIn = Math.min(
      a4Landscape.widthIn - 2 * marginIn,
      letterLandscape.widthIn - 2 * marginIn
    );
    const printableHeightIn = Math.min(
      a4Landscape.heightIn - 2 * marginIn,
      letterLandscape.heightIn - 2 * marginIn
    );
    const pxPerIn = 96;
    const pageWidthPx = printableWidthIn * pxPerIn;
    const pageHeightPx = printableHeightIn * pxPerIn;
    const roundingReservePx = 6;
    const maxWidth = Math.max(1, pageWidthPx - roundingReservePx);
    const titleBlockHeight = measurePrintTitleBlockHeight(maxWidth);
    const maxHeight = Math.max(1, pageHeightPx - roundingReservePx - titleBlockHeight);
    if (!contentWidth || !contentHeight) {
      doc.documentElement.style.setProperty('--print-scale', '1');
      printScaleApplied = true;
      return;
    }
    const rawScale = Math.min(1, maxWidth / contentWidth, maxHeight / contentHeight);
    const precisionReserve = rawScale < 1 ? 0.002 : 0;
    const scale = Math.max(0.05, rawScale - precisionReserve);
    doc.documentElement.style.setProperty('--print-scale', scale.toFixed(3));
    printScaleApplied = true;
  }

  function resetPrintScale() {
    if (!printScaleApplied) return;
    doc.documentElement.style.setProperty('--print-scale', '1');
    printScaleApplied = false;
  }

  function createStudentNode(s) {
    const tpl = els.studentTemplate;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.sid = s.id;
    node.querySelector('.name').textContent = displayStudentName(s);
    node.querySelector('.tag').textContent = s.id;
    if (isRandomPickerActive()) {
      node.setAttribute('draggable', 'false');
      node.removeAttribute('title');
    } else {
      addDragHandlers(node);
      enableTouchDragSource(node, () => {
        return {
          type: 'assignment',
          studentId: s.id,
          fromSeat: null,
          label: displayStudentName(s) || s.id
        };
      });
    }
    return node;
  }

  function refreshUnseated() {
    if (!els.unseated) return;
    els.unseated.innerHTML = '';
    const seatedIds = new Set(
      Object.values(state.seats)
        .map(ensureSeatList)
        .flat()
    );
    const unassigned = state.students.filter(s => !seatedIds.has(s.id));
    unassigned.forEach(s => {
      els.unseated.appendChild(createStudentNode(s));
    });
    syncGroupSizeInputs();
  }

  const GROUP_GRID_LAYOUT = Object.freeze({
    seatWidth: 560,
    seatHeight: 380,
    gap: 12,
    padding: 10,
  });
  const GROUP_GRID_LAYOUT_COLLAPSED = Object.freeze({
    seatWidth: 460,
    seatHeight: 170,
    gap: 10,
    padding: 8,
  });
  const GROUP_TILE_CONTENT_LAYOUT = Object.freeze({
    expanded: Object.freeze({
      seatPaddingTop: 120,
      seatPaddingBottom: 16,
      seatPaddingX: 16,
      chipTrackWidth: 240,
      chipGap: 10,
      chipHeight: 46,
    }),
    collapsed: Object.freeze({
      seatPaddingTop: 70,
      seatPaddingBottom: 8,
      seatPaddingX: 10,
      chipTrackWidth: 200,
      chipGap: 6,
      chipHeight: 32,
    }),
  });
  let groupGridLayoutRafId = 0;
  let lastGroupGridLayoutSignature = '';
  let lastGroupGridViewportMode = '';
  let groupGridLayoutRetryTimers = [];

  function isGroupCollapsedViewport() {
    const hostApp = els.groupsMainHost?.closest('.app');
    return Boolean(
      hostApp?.classList.contains('app-tab-groups')
      && (
        hostApp.classList.contains('is-collapsing')
        || hostApp.classList.contains('chrome-collapsed')
      )
    );
  }

  function getGroupElementPaddingSize(element) {
    if (!element || typeof getComputedStyle !== 'function') {
      return { x: 0, y: 0 };
    }
    const style = getComputedStyle(element);
    return {
      x: (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0),
      y: (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0),
    };
  }

  function getGroupElementContentBoxSize(element) {
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    const padding = getGroupElementPaddingSize(element);
    return {
      width: Math.max(0, Math.round(Math.max(element.clientWidth - padding.x, rect.width - padding.x))),
      height: Math.max(0, Math.round(Math.max(element.clientHeight - padding.y, rect.height - padding.y))),
    };
  }

  function pickGroupViewportDimension(candidates) {
    const sizes = candidates
      .map((value) => Math.max(0, Math.round(Number(value) || 0)));
    for (let index = 0; index < sizes.length; index += 1) {
      const candidate = sizes[index];
      const maxRemaining = Math.max(0, ...sizes.slice(index + 1));
      if (candidate > 40 && (maxRemaining <= 80 || candidate >= maxRemaining * 0.55)) {
        return candidate;
      }
    }
    return Math.max(0, ...sizes);
  }

  function rememberStableGroupViewportSize(size) {
    if (!size) return;
    const width = Math.max(0, Math.round(Number(size.width) || 0));
    const height = Math.max(0, Math.round(Number(size.height) || 0));
    if (width <= 80 || height <= 80) return;
    getGroupGridViewportSize._lastStable = { width, height };
  }

  function getGroupGridViewportSize() {
    if (!els.groupsGridWrap) return { width: 0, height: 0 };
    let width = els.groupsGridWrap.clientWidth;
    let height = els.groupsGridWrap.clientHeight;
    const wrapRect = els.groupsGridWrap.getBoundingClientRect();
    const host = els.groupsMainHost || els.groupsGridWrap.closest('#groups-main-host');
    const main = els.groupsGridWrap.closest('.main');
    const groupsCollapsed = isGroupCollapsedViewport();

    width = Math.max(width, Math.round(wrapRect.width));
    height = Math.max(height, Math.round(wrapRect.height));

    if (groupsCollapsed) {
      const hostPadding = getGroupElementPaddingSize(host);
      const mainSize = getGroupElementContentBoxSize(main);
      const hostSize = getGroupElementContentBoxSize(host);
      const visualViewportWidth = typeof view !== 'undefined'
        ? Math.max(
          0,
          Math.round(
            ((view.visualViewport?.width ?? view.innerWidth ?? 0) || 0) - hostPadding.x
          )
        )
        : 0;
      const visualViewportHeight = typeof view !== 'undefined'
        ? Math.max(
          0,
          Math.round(view.visualViewport?.height ?? view.innerHeight ?? 0)
        )
        : 0;
      const measured = {
        width: pickGroupViewportDimension([
          mainSize.width,
          hostSize.width,
          visualViewportWidth,
          width,
        ]),
        height: pickGroupViewportDimension([
          mainSize.height,
          hostSize.height,
          visualViewportHeight,
          height,
        ]),
      };
      const lastStable = getGroupGridViewportSize._lastStable || null;
      if (lastStable) {
        const unstableWidth = measured.width <= 80 && lastStable.width > 120;
        const unstableHeight = measured.height <= 80 && lastStable.height > 120;
        if (unstableWidth) measured.width = lastStable.width;
        if (unstableHeight) measured.height = lastStable.height;
      }
      rememberStableGroupViewportSize(measured);
      return measured;
    }

    if (width > 40 && height > 40) {
      const measured = { width, height };
      rememberStableGroupViewportSize(measured);
      return measured;
    }

    if (main) {
      const mainRect = main.getBoundingClientRect();
      width = Math.max(width, Math.round(mainRect.width));
      const topOffset = Math.max(0, wrapRect.top - mainRect.top);
      height = Math.max(height, Math.round(mainRect.height - topOffset));
    }
    if (host) {
      const hostRect = host.getBoundingClientRect();
      width = Math.max(width, Math.round(hostRect.width));
      height = Math.max(height, Math.round(hostRect.height));
    }
    const measured = { width, height };
    rememberStableGroupViewportSize(measured);
    return measured;
  }

  function clearGroupGridLayout() {
    if (!els.groupsGrid) return;
    lastGroupGridLayoutSignature = '';
    els.groupsGrid.style.removeProperty('--group-fit-scale');
    els.groupsGrid.style.removeProperty('grid-template-columns');
    els.groupsGrid.style.removeProperty('grid-auto-rows');
  }

  function clearGroupGridLayoutRetryTimers() {
    if (!groupGridLayoutRetryTimers.length || typeof view === 'undefined') return;
    groupGridLayoutRetryTimers.forEach((timerId) => view.clearTimeout(timerId));
    groupGridLayoutRetryTimers = [];
  }

  function measureGroupGridOverflow() {
    if (!els.groupsGridWrap || !els.groupsGrid) {
      return { overflowX: 0, overflowY: 0 };
    }
    const wrapRect = els.groupsGridWrap.getBoundingClientRect();
    const gridRect = els.groupsGrid.getBoundingClientRect();
    return {
      overflowX: Math.max(0, gridRect.right - wrapRect.right, els.groupsGridWrap.scrollWidth - els.groupsGridWrap.clientWidth),
      overflowY: Math.max(0, gridRect.bottom - wrapRect.bottom, els.groupsGridWrap.scrollHeight - els.groupsGridWrap.clientHeight),
    };
  }

  function getMaxGroupSeatOccupancy() {
    const order = Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length
      ? state.activeSeatOrder
      : Array.from(state.activeSeats || []);
    if (!order.length) return 0;
    return order.reduce((max, id) => Math.max(max, getSeatList(id).length), 0);
  }

  function estimateRequiredGroupTileHeight(tileWidth, scale, viewportMode) {
    const contentLayout = GROUP_TILE_CONTENT_LAYOUT[viewportMode] || GROUP_TILE_CONTENT_LAYOUT.expanded;
    const maxOccupancy = getMaxGroupSeatOccupancy();
    if (maxOccupancy <= 0) return 0;
    const contentWidth = Math.max(
      1,
      tileWidth - (contentLayout.seatPaddingX * 2 * scale)
    );
    const chipTrackWidth = Math.max(1, contentLayout.chipTrackWidth * scale);
    const chipGap = Math.max(0, contentLayout.chipGap * scale);
    const chipHeight = Math.max(1, contentLayout.chipHeight * scale);
    const columns = Math.max(1, Math.floor((contentWidth + chipGap) / (chipTrackWidth + chipGap)));
    const rows = Math.max(1, Math.ceil(maxOccupancy / columns));
    const tagsHeight = (rows * chipHeight) + (Math.max(0, rows - 1) * chipGap);
    return Math.ceil((contentLayout.seatPaddingTop * scale) + (contentLayout.seatPaddingBottom * scale) + tagsHeight);
  }

  function applyBestFitGroupGridLayout() {
    if (!els.groupsGrid || !els.groupsGridWrap) return;
    const canMeasure = isGroupsActive() && els.groupsMainHost && !els.groupsMainHost.hidden;
    if (!canMeasure) return;
    const groupsCollapsed = isGroupCollapsedViewport();
    const viewportMode = groupsCollapsed ? 'collapsed' : 'expanded';
    if (viewportMode !== lastGroupGridViewportMode) {
      lastGroupGridViewportMode = viewportMode;
      lastGroupGridLayoutSignature = '';
    }
    const layout = groupsCollapsed ? GROUP_GRID_LAYOUT_COLLAPSED : GROUP_GRID_LAYOUT;
    const maxScale = groupsCollapsed ? 2.4 : 1;
    const seatCount = Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length
      ? state.activeSeatOrder.length
      : state.activeSeats.size;
    const visualItemCount = Math.max(1, seatCount + (groupsCollapsed ? 0 : 1));
    const { width: wrapWidth, height: wrapHeight } = getGroupGridViewportSize();
    if (wrapWidth <= 40 || wrapHeight <= 40) {
      if (typeof view !== 'undefined') {
        if (applyBestFitGroupGridLayout._retryTimer) {
          view.clearTimeout(applyBestFitGroupGridLayout._retryTimer);
        }
        applyBestFitGroupGridLayout._retryTimer = view.setTimeout(() => {
          applyBestFitGroupGridLayout._retryTimer = 0;
          applyBestFitGroupGridLayout();
        }, groupsCollapsed ? 120 : 90);
      }
      return;
    }
    if (typeof view !== 'undefined' && applyBestFitGroupGridLayout._retryTimer) {
      view.clearTimeout(applyBestFitGroupGridLayout._retryTimer);
      applyBestFitGroupGridLayout._retryTimer = 0;
    }
    const wrapStyle = getComputedStyle(els.groupsGridWrap);
    const innerWidth = wrapWidth
      - (parseFloat(wrapStyle.paddingLeft) || 0)
      - (parseFloat(wrapStyle.paddingRight) || 0);
    const innerHeight = wrapHeight
      - (parseFloat(wrapStyle.paddingTop) || 0)
      - (parseFloat(wrapStyle.paddingBottom) || 0);
    if (innerWidth <= 0 || innerHeight <= 0) return;

    let best = null;
    for (let cols = 1; cols <= visualItemCount; cols += 1) {
      const rows = Math.max(1, Math.ceil(visualItemCount / cols));
      const horizontalGaps = (Math.max(0, cols - 1) * layout.gap) + (layout.padding * 2);
      const verticalGaps = (Math.max(0, rows - 1) * layout.gap) + (layout.padding * 2);
      const usableWidth = Math.max(1, innerWidth - horizontalGaps);
      const usableHeight = Math.max(1, innerHeight - verticalGaps);
      const scale = Math.min(maxScale, usableWidth / (cols * layout.seatWidth), usableHeight / (rows * layout.seatHeight));
      const tileWidth = Math.max(1, Math.floor(layout.seatWidth * scale));
      const tileHeight = Math.max(1, Math.floor(layout.seatHeight * scale));
      const requiredTileHeight = estimateRequiredGroupTileHeight(tileWidth, scale, viewportMode);
      const contentFits = requiredTileHeight <= tileHeight;
      const emptySlots = (rows * cols) - visualItemCount;
      const candidate = {
        cols,
        rows,
        scale,
        emptySlots,
        tileWidth,
        tileHeight,
        requiredTileHeight,
        contentFits,
        tileArea: tileWidth * tileHeight,
      };
      if (!best
        || (candidate.contentFits && !best.contentFits)
        || (candidate.contentFits === best.contentFits && candidate.scale > best.scale + 0.0001)
        || (candidate.contentFits === best.contentFits && Math.abs(candidate.scale - best.scale) <= 0.0001
          && (candidate.emptySlots < best.emptySlots
            || (candidate.emptySlots === best.emptySlots && candidate.tileArea > best.tileArea)))) {
        best = candidate;
      }
    }

    if (!best) {
      clearGroupGridLayout();
      return;
    }
    let scale = Math.max(0.01, Math.min(maxScale, best.scale || 1));
    let fittedWidth = Math.max(1, best.tileWidth || Math.floor(layout.seatWidth * scale));
    let fittedHeight = Math.max(1, best.tileHeight || Math.floor(layout.seatHeight * scale));
    const applyScale = () => {
      els.groupsGrid.style.setProperty('--group-fit-scale', scale.toFixed(4));
      els.groupsGrid.style.gridTemplateColumns = `repeat(${Math.max(1, best.cols)}, minmax(0, ${fittedWidth}px))`;
      els.groupsGrid.style.gridAutoRows = `${fittedHeight}px`;
    };
    applyScale();
    const { overflowX, overflowY } = measureGroupGridOverflow();
    if (overflowX > 0.5 || overflowY > 0.5) {
      const safeWidth = Math.max(1, innerWidth);
      const safeHeight = Math.max(1, innerHeight);
      const adjustX = overflowX > 0.5 ? safeWidth / (safeWidth + overflowX) : 1;
      const adjustY = overflowY > 0.5 ? safeHeight / (safeHeight + overflowY) : 1;
      scale = Math.max(0.01, scale * Math.min(adjustX, adjustY) * 0.995);
      fittedWidth = Math.max(1, Math.floor(layout.seatWidth * scale));
      fittedHeight = Math.max(1, Math.floor(layout.seatHeight * scale));
      applyScale();
    }
    const signature = `${viewportMode}|${visualItemCount}|${best.cols}|${best.rows}|${fittedWidth}|${fittedHeight}|${best.requiredTileHeight}|${best.contentFits ? 1 : 0}|${scale.toFixed(4)}`;
    if (signature === lastGroupGridLayoutSignature) return;
    lastGroupGridLayoutSignature = signature;
    applyScale();
  }

  function scheduleBestFitGroupGridLayout() {
    if (!els.groupsGrid) return;
    if (groupGridLayoutRafId && typeof view.cancelAnimationFrame === 'function') {
      view.cancelAnimationFrame(groupGridLayoutRafId);
      groupGridLayoutRafId = 0;
    }
    const run = () => {
      groupGridLayoutRafId = 0;
      applyBestFitGroupGridLayout();
      if (typeof view.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(() => {
          applyBestFitGroupGridLayout();
        });
      }
    };
    if (typeof view.requestAnimationFrame === 'function') {
      groupGridLayoutRafId = view.requestAnimationFrame(run);
    } else {
      view.setTimeout(run, 16);
    }
  }

  function requestGroupGridLayoutRefresh(options = {}) {
    if (!els.groupsGrid) return;
    const { resetViewport = false } = options;
    clearGroupGridLayoutRetryTimers();
    if (resetViewport) {
      clearGroupGridLayout();
      delete getGroupGridViewportSize._lastStable;
    }
    scheduleBestFitGroupGridLayout();
    if (typeof view === 'undefined') return;
    [48, 120, 240].forEach((delay) => {
      const timerId = view.setTimeout(() => {
        groupGridLayoutRetryTimers = groupGridLayoutRetryTimers.filter((id) => id !== timerId);
        scheduleBestFitGroupGridLayout();
      }, delay);
      groupGridLayoutRetryTimers.push(timerId);
    });
  }

  function deleteGroupSeat(seatId, seatEl = null) {
    const id = typeof seatId === 'string' ? seatId : String(seatId || '');
    if (!id || !state.activeSeats.has(id)) return false;
    const finalizeRemoval = () => {
      state.activeSeats.delete(id);
      state.activeSeatOrder = (state.activeSeatOrder || []).filter(x => x !== id);
      state.lockedSeats.delete(id);
      delete state.seats[id];
      delete state.seatTopics[id];
      buildGrid();
      refreshUnseated();
    };
    if (seatEl instanceof view.HTMLElement) {
      seatEl.classList.add('removing');
      view.setTimeout(finalizeRemoval, 220);
      return true;
    }
    finalizeRemoval();
    return true;
  }

  function buildGrid() {
    enforceGridBounds();
    const rows = state.gridRows;
    const cols = state.gridCols;
    let order = Array.isArray(state.activeSeatOrder) ? state.activeSeatOrder.slice() : Array.from(state.activeSeats);
    if (!order.length) {
      order = Array.from(buildFullActiveSet(rows, cols));
    } else {
      order = order.filter(id => isSeatWithinBounds(id, rows, cols));
    }
    state.activeSeatOrder = order;
    state.activeSeats = new Set(order);
    order.forEach(id => {
      if (!state.seats[id]) state.seats[id] = [];
      if (typeof state.seatTopics[id] !== 'string') state.seatTopics[id] = '';
    });
    let groupCounter = 0;
    els.groupsGrid.innerHTML = '';
    order.forEach(id => {
      const seat = doc.createElement('div');
      seat.className = 'seat';
      seat.dataset.seat = id;
      const label = `${++groupCounter}`;
      seat.replaceChildren((() => {
        const fragment = doc.createDocumentFragment();
        const seatHeader1 = doc.createElement("div");
        seatHeader1.className = "seat-header";
        seatHeader1.textContent = String(label);
        fragment.append(seatHeader1);
        const seatDeleteButton2 = doc.createElement("button");
        seatDeleteButton2.setAttribute("type", "button");
        seatDeleteButton2.className = "seat-delete-button";
        seatDeleteButton2.dataset.seatDelete = String(id);
        seatDeleteButton2.setAttribute("aria-label", "Gruppe löschen");
        seatDeleteButton2.setAttribute("title", "Gruppe löschen");
        seatDeleteButton2.textContent = "🗑️";
        fragment.append(seatDeleteButton2);
        const seatTopic3 = doc.createElement("input");
        seatTopic3.className = "seat-topic";
        seatTopic3.setAttribute("type", "text");
        seatTopic3.setAttribute("name", "seat-topic-" + String(id));
        seatTopic3.setAttribute("placeholder", "Thema");
        seatTopic3.dataset.defaultPlaceholder = "Thema";
        seatTopic3.setAttribute("aria-label", "Thema");
        fragment.append(seatTopic3);
        const name4 = doc.createElement("div");
        name4.className = "name";
        fragment.append(name4);
        return fragment;
      })());
      seat.classList.add('active');
      if (state.lockedSeats.has(id)) {
        seat.classList.add('locked');
      }
      addDropHandlers(seat);
      const topicInput = seat.querySelector('.seat-topic');
      initSeatTopicInput(topicInput);
      if (topicInput) {
        topicInput.value = typeof state.seatTopics[id] === 'string' ? state.seatTopics[id] : '';
        syncSeatTopicState(seat, topicInput.value);
        topicInput.addEventListener('input', () => {
          state.seatTopics[id] = topicInput.value;
          syncSeatTopicState(seat, topicInput.value);
        });
      } else {
        syncSeatTopicState(seat, state.seatTopics[id]);
      }
      const deleteButton = seat.querySelector('.seat-delete-button');
      if (deleteButton) {
        deleteButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteGroupSeat(id, seat);
        });
        deleteButton.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
      seat.addEventListener('dblclick', () => {
        const occupants = getSeatList(id);
        if (!occupants.length) return;
        if (state.lockedSeats.has(id)) state.lockedSeats.delete(id); else state.lockedSeats.add(id);
        renderSeats();
      });
      els.groupsGrid.appendChild(seat);
    });
    const placeholder = doc.createElement('div');
    placeholder.className = 'seat-placeholder';
    placeholder.setAttribute('aria-label', 'Neue Gruppe anlegen');
    placeholder.setAttribute('tabindex', '0');
    placeholder.setAttribute('role', 'button');
    placeholder.innerHTML = `
        <div class="seat-placeholder-main">+</div>
      `;
    addPlaceholderDropHandlers(placeholder);
    const handlePlaceholderAdd = () => {
      createNewSeatAndAssign();
    };
    placeholder.addEventListener('click', handlePlaceholderAdd);
    placeholder.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePlaceholderAdd();
      }
    });
    els.groupsGrid.appendChild(placeholder);
    renderSeats();
    requestGroupGridLayoutRefresh({ resetViewport: true });
  }

  function renderSeats() {
    [...els.groupsGrid.querySelectorAll('.seat')].forEach(seat => {
      const id = seat.dataset.seat;
      const occupants = getSeatList(id);
      const nameEl = seat.querySelector('.name');
      const topicValue = typeof state.seatTopics[id] === 'string' ? state.seatTopics[id] : '';
      const topicInput = seat.querySelector('.seat-topic');
      if (topicInput && topicInput.value !== topicValue) {
        topicInput.value = topicValue;
      }
      syncSeatTopicState(seat, topicValue);
      nameEl.innerHTML = '';
      seat.classList.toggle('locked', state.lockedSeats.has(id));
      if (!occupants.length) {
        seat.removeAttribute('draggable');
        delete seat.dataset.emptyDraggable;
        return;
      }
      seat.removeAttribute('draggable');
      delete seat.dataset.emptyDraggable;
      const content = doc.createElement('div');
      content.className = 'seat-content';
      nameEl.appendChild(content);
      occupants.forEach(sid => {
        const student = state.students.find(x => x.id === sid);
        const label = student ? displayStudentName(student).trim() : sid;
        if (!label) return;
        const flair = sanitizePerformanceFlairForCount(student?.performanceFlair);
        const chip = doc.createElement('div');
        chip.className = 'seat-chip';
        chip.dataset.sid = sid;
        chip.dataset.fromSeat = id;
        chip.setAttribute('draggable', 'true');
        const nameText = doc.createElement('span');
        nameText.className = 'seat-chip-name';
        nameText.textContent = label;
        chip.appendChild(nameText);
        if (flair) {
          const flairTag = doc.createElement('span');
          flairTag.className = 'seat-chip-flair';
          flairTag.textContent = flair;
          chip.appendChild(flairTag);
        }
        content.appendChild(chip);
        addDragHandlers(chip);
        enableTouchDragSource(chip, () => {
          const sidVal = chip.dataset.sid;
          if (!sidVal) return null;
          const fromSeat = chip.dataset.fromSeat || null;
          if (fromSeat && state.lockedSeats.has(fromSeat)) return null;
          if (fromSeat && !getSeatList(fromSeat).includes(sidVal)) return null;
          return {
            type: 'assignment',
            studentId: sidVal,
            fromSeat,
            label: label || 'Lernende/r'
          };
        });
      });
    });
    requestGroupGridLayoutRefresh();
  }

  function addDragHandlers(el) {
    if (el.dataset.dragBound) return;
    if (el.getAttribute('draggable') !== 'true') return;
    el.dataset.dragBound = '1';
    el.addEventListener('dragstart', e => {
      const sid = el.dataset.sid;
      const fromSeat = el.dataset.fromSeat || null;
      if (!sid) { e.preventDefault(); return; }
      if (fromSeat && state.lockedSeats.has(fromSeat)) { e.preventDefault(); return; }
      if (fromSeat && !getSeatList(fromSeat).includes(sid)) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', sid);
      e.dataTransfer.effectAllowed = 'move';
      state.dragSourceSeat = fromSeat;
      state.dragPayloadType = 'assignment';
      startWiggle();
    });
    el.addEventListener('dragend', () => {
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      stopWiggle();
    });
  }

  let currentChipHover = null;
  function clearChipHover() {
    if (currentChipHover) {
      currentChipHover.classList.remove('drag-over-target');
      currentChipHover = null;
    }
  }
  function addDropHandlers(seat) {
    seat.addEventListener('dragover', e => {
      e.preventDefault();
      seat.classList.add('drag-over');
      const targetChip = e.target.closest('.seat-chip');
      if (targetChip && targetChip !== currentChipHover) {
        clearChipHover();
        currentChipHover = targetChip;
        currentChipHover.classList.add('drag-over-target');
      }
      if (!targetChip) {
        clearChipHover();
      }
    });
    seat.addEventListener('dragleave', () => {
      seat.classList.remove('drag-over');
      clearChipHover();
    });
    seat.addEventListener('drop', e => {
      e.preventDefault(); seat.classList.remove('drag-over'); clearChipHover();
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const targetId = seat.dataset.seat;
      const sourceSeat = state.dragSourceSeat;
      const targetChip = e.target.closest('.seat-chip');
      const targetStudentId = targetChip?.dataset?.sid || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      const context = {
        targetSeatEl: seat,
        targetId,
        targetStudentId,
      };
      if (payload) {
        context.studentId = payload;
        context.sourceSeatId = sourceSeat || null;
      }
      applySeatDropAction(context);
    });
  }

  function addPlaceholderDropHandlers(el) {
    if (!el) return;
    el.addEventListener('dragover', e => {
      if (state.dragPayloadType !== 'assignment') return;
      e.preventDefault();
    });
    el.addEventListener('drop', e => {
      if (state.dragPayloadType !== 'assignment') return;
      e.preventDefault();
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const studentId = payload.trim();
      const sourceSeat = state.dragSourceSeat || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      if (!studentId) return;
      createNewSeatAndAssign(studentId, sourceSeat);
    });
  }

  function createNewSeatAndAssign(studentId = null, sourceSeatId = null) {
    const limit = MAX_GRID_SIZE * MAX_GRID_SIZE;
    const currentCount = state.activeSeats.size || (state.gridRows * state.gridCols);
    if (currentCount >= limit) {
      showMessage('Maximale Anzahl an Gruppen erreicht.', 'warn', { presentation: 'toast' });
      return false;
    }
    const slot = nextSeatSlot();
    if (!slot || !slot.id) {
      showMessage('Keine weitere Gruppe kann angelegt werden.', 'warn', { presentation: 'toast' });
      return false;
    }
    state.gridRows = slot.rows;
    state.gridCols = slot.cols;
    if (!state.activeSeats.has(slot.id)) {
      state.activeSeats.add(slot.id);
    }
    if (!state.activeSeatOrder.includes(slot.id)) {
      state.activeSeatOrder.push(slot.id);
    }
    if (!state.seats[slot.id]) {
      state.seats[slot.id] = [];
    }
    if (typeof state.seatTopics[slot.id] !== 'string') {
      state.seatTopics[slot.id] = '';
    }
    buildGrid();
    if (sourceSeatId && studentId) {
      removeStudentFromSeat(sourceSeatId, studentId);
    }
    if (studentId) {
      addStudentToSeat(slot.id, studentId);
    }
    renderSeats();
    refreshUnseated();
    return true;
  }

  let backgroundDropLock = false;
  function bindBackgroundDrop(target, options = {}) {
    const { ignoreInsideGrid = false } = options;
    if (!target) return;
    bindStatic(target, 'dragover', e => {
      if (e.target.closest('.seat')) return;
      if (state.dragPayloadType !== 'assignment') return;
      if (ignoreInsideGrid && e.target.closest('#groups-grid')) return;
      e.preventDefault();
      e.stopPropagation();
    });
    bindStatic(target, 'drop', e => {
      if (e.target.closest('.seat')) return;
      if (state.dragPayloadType !== 'assignment') return;
      if (ignoreInsideGrid && e.target.closest('#groups-grid')) return;
      e.preventDefault();
      e.stopPropagation();
      if (backgroundDropLock) return;
      backgroundDropLock = true;
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const studentId = payload.trim();
      const sourceSeat = state.dragSourceSeat || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      if (studentId) {
        createNewSeatAndAssign(studentId, sourceSeat);
      }
      view.setTimeout(() => { backgroundDropLock = false; }, 25);
    });
  }

  function applySeatDropAction(opts) {
    if (!opts || !opts.targetSeatEl || !opts.targetId) return false;
    const seatEl = opts.targetSeatEl;
    const targetId = opts.targetId;
    const seatDragSourceId = opts.seatDragSourceId || null;
    const studentId = opts.studentId || null;
    const sourceSeatId = opts.sourceSeatId || null;
    const targetStudentId = opts.targetStudentId || null;
    if (seatDragSourceId) return false;
    if (!studentId) return false;
    if (sourceSeatId && state.lockedSeats.has(sourceSeatId)) return false;
    if (state.lockedSeats.has(targetId)) return false;
    const limit = clampMaxGroupSize(state.maxGroupSize);
    if (!targetStudentId && getSeatList(targetId).length >= limit && sourceSeatId !== targetId) {
      showMessage(`Gruppe ist voll (max. ${limit}).`, 'warn', { presentation: 'toast' });
      return false;
    }
    if (sourceSeatId && targetStudentId) {
      const sourceList = getSeatList(sourceSeatId);
      const targetList = getSeatList(targetId);
      const idxSource = sourceList.indexOf(studentId);
      const idxTarget = targetList.indexOf(targetStudentId);
      if (idxSource === -1 || idxTarget === -1) return false;
      sourceList[idxSource] = targetStudentId;
      targetList[idxTarget] = studentId;
      setSeatList(sourceSeatId, sourceList);
      setSeatList(targetId, targetList);
    } else {
      if (targetStudentId) {
        removeStudentFromSeat(targetId, targetStudentId);
      }
      if (getSeatList(targetId).length >= limit) {
        showMessage(`Gruppe ist voll (max. ${limit}).`, 'warn', { presentation: 'toast' });
        return false;
      }
      if (sourceSeatId) {
        removeStudentFromSeat(sourceSeatId, studentId);
      }
      addStudentToSeat(targetId, studentId);
    }
    renderSeats();
    refreshUnseated();
    return true;
  }

  function enableTouchDragSource(el, resolver) {
    if (!supportsTouchDrag || !el || el.dataset.touchDragBound) return;
    el.dataset.touchDragBound = '1';
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const descriptor = typeof resolver === 'function' ? resolver(e) : null;
      if (!descriptor) return;
      const touch = e.touches[0];
      startTouchDragCandidate(descriptor, touch);
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.touches, touchDragState.identifier);
      if (!tracked) return;
      handleTouchMove(tracked);
      if (touchDragState && touchDragState.active) {
        e.preventDefault();
      }
    }, { passive: false });
    const finish = e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
      if (!tracked) return;
      finishTouchDrag(e);
    };
    const cancel = e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
      if (!tracked) return;
      cancelTouchDrag();
    };
    el.addEventListener('touchend', finish, { passive: false });
    el.addEventListener('touchcancel', cancel);
  }

  function startTouchDragCandidate(descriptor, touch) {
    cancelTouchDrag();
    const state = {
      descriptor,
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      active: false,
      ghost: null,
      overSeat: null,
      timer: null,
    };
    state.timer = view.setTimeout(() => beginTouchDrag(state), TOUCH_DRAG_DELAY_MS);
    touchDragState = state;
  }

  function beginTouchDrag(state) {
    if (!state || state !== touchDragState) return;
    state.active = true;
    state.ghost = createTouchGhost(state.descriptor);
    updateTouchDrag(state);
    startWiggle();
  }

  function handleTouchMove(touch) {
    if (!touchDragState) return;
    touchDragState.currentX = touch.clientX;
    touchDragState.currentY = touch.clientY;
    if (!touchDragState.active) {
      const dx = Math.abs(touch.clientX - touchDragState.startX);
      const dy = Math.abs(touch.clientY - touchDragState.startY);
      if (dx > TOUCH_DRAG_CANCEL_DISTANCE || dy > TOUCH_DRAG_CANCEL_DISTANCE) {
        cancelTouchDrag();
      }
      return;
    }
    updateTouchDrag(touchDragState);
  }

  function updateTouchDrag(state) {
    if (!state) return;
    if (state.ghost) {
      state.ghost.style.transform = `translate(${state.currentX + 14}px, ${state.currentY + 14}px)`;
    }
    const seat = findSeatAtPoint(state.currentX, state.currentY);
    if (seat !== state.overSeat) {
      if (state.overSeat) state.overSeat.classList.remove('drag-over');
      state.overSeat = seat;
      if (seat) seat.classList.add('drag-over');
    }
  }

  function finishTouchDrag(e) {
    if (!touchDragState) return;
    const state = touchDragState;
    const descriptor = state.descriptor;
    const seatEl = state.overSeat;
    const wasActive = seatEl ? seatEl.classList.contains('active') : false;
    const context = seatEl ? buildTouchDropContext(descriptor, seatEl, wasActive) : null;
    const wasActiveDrag = state.active;
    cancelTouchDrag();
    stopWiggle();
    if (!wasActiveDrag) return;
    if (e) e.preventDefault();
    if (context) {
      applySeatDropAction(context);
    }
  }

  function cancelTouchDrag() {
    if (!touchDragState) return;
    if (touchDragState.timer) {
      view.clearTimeout(touchDragState.timer);
    }
    if (touchDragState.overSeat) {
      touchDragState.overSeat.classList.remove('drag-over');
    }
    if (touchDragState.ghost) {
      touchDragState.ghost.remove();
    }
    touchDragState = null;
    stopWiggle();
  }

  function buildTouchDropContext(descriptor, seatEl, wasActive) {
    if (!descriptor || !seatEl) return null;
    const seatId = seatEl.dataset.seat;
    if (!seatId) return null;
    const ctx = { targetSeatEl: seatEl, targetId: seatId, wasActive };
    if (descriptor.type === 'seat') {
      ctx.seatDragSourceId = descriptor.seatId;
    } else if (descriptor.type === 'assignment') {
      ctx.studentId = descriptor.studentId;
      ctx.sourceSeatId = descriptor.fromSeat || null;
    } else {
      return null;
    }
    return ctx;
  }

  function findSeatAtPoint(x, y) {
    const el = doc.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest ? el.closest('.seat') : null;
  }

  function findTouchById(touchList, id) {
    if (!touchList || id === undefined || id === null) return null;
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList.item(i);
      if (touch?.identifier === id) return touch;
    }
    return null;
  }

  function createTouchGhost(descriptor) {
    const ghost = doc.createElement('div');
    ghost.className = 'touch-drag-ghost';
    const fallback = descriptor?.type === 'seat' ? 'Gruppe' : 'Ziehen';
    ghost.textContent = descriptor?.label || fallback;
    doc.body.appendChild(ghost);
    return ghost;
  }
  function assignStudentsEvenly(options = {}) {
    const { shuffle = true } = options;
    if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn', { presentation: 'toast' }); return; }
    if (!state.activeSeats.size) { showMessage('Bitte zuerst das Gruppenraster einrichten.', 'warn', { presentation: 'toast' }); return; }
    syncGroupSizeInputs();
    const maxSize = clampMaxGroupSize(state.maxGroupSize);
    const minSize = clampMinGroupSize(state.minGroupSize);
    ensureCapacityForStudents(maxSize, minSize);
    const activeIds = Array.from(state.activeSeats);
    const lockedAssignments = {};
    const assigned = new Set();
    state.lockedSeats.forEach(id => {
      lockedAssignments[id] = getSeatList(id);
      lockedAssignments[id].forEach(sid => assigned.add(sid));
    });
    const freeSeats = activeIds.filter(id => !state.lockedSeats.has(id));
    if (!freeSeats.length) {
      showMessage('Keine freien Gruppen verfügbar (alle gesperrt).', 'warn', { presentation: 'toast' });
      return;
    }
    const capacity = activeIds.length * maxSize;
    const remainingCount = state.students.length;
    if (capacity < remainingCount) {
      showMessage('Raster wurde erweitert, aber es fehlt Platz für alle Lernenden bei dieser Gruppengröße.', 'warn');
    }
    const order = state.students.slice().filter(s => !assigned.has(s.id));
    if (shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const nextSeats = {};
    activeIds.forEach(id => {
      nextSeats[id] = state.lockedSeats.has(id) ? ensureSeatList(lockedAssignments[id]) : [];
    });
    let idx = 0;
    order.forEach(student => {
      let attempts = 0;
      let target = null;
      while (attempts < freeSeats.length) {
        const candidate = freeSeats[idx % freeSeats.length];
        if ((nextSeats[candidate]?.length || 0) < maxSize) {
          target = candidate; break;
        }
        idx++; attempts++;
      }
      if (target === null) {
        target = freeSeats[idx % freeSeats.length];
      }
      nextSeats[target].push(student.id);
      idx++;
    });
    state.seats = nextSeats;
    renderSeats();
    refreshUnseated();
  }

  const GROUP_SUGGEST_ROULETTE_CONFIG = Object.freeze({
    candidateAttempts: 42,
    minFrames: 18,
    maxFrames: 28,
    minDelayMs: 55,
    maxDelayMs: 260,
    finalHoldMs: 900,
  });
  let groupSuggestInProgress = false;

  const waitMs = (ms) => new Promise(resolve => view.setTimeout(resolve, Math.max(0, Math.round(ms))));
  const nextPaint = () => new Promise(resolve => {
    if (typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(() => view.requestAnimationFrame(resolve));
    } else {
      view.setTimeout(resolve, 16);
    }
  });

  function flashGroupSuggestionFrame({ final = false } = {}) {
    if (!els.groupsGrid) return;
    const seats = Array.from(els.groupsGrid.querySelectorAll('.seat'));
    els.groupsGrid.classList.add('group-suggesting');
    seats.forEach((seat) => {
      seat.classList.remove('group-suggest-frame', 'group-suggest-final');
      void seat.offsetWidth;
      seat.classList.add('group-suggest-frame');
      if (final) {
        seat.classList.add('group-suggest-final');
      }
    });
  }

  function clearGroupSuggestionFrameState() {
    if (!els.groupsGrid) return;
    els.groupsGrid.classList.remove('group-suggesting');
    els.groupsGrid.querySelectorAll('.seat').forEach((seat) => {
      seat.classList.remove('group-suggest-frame', 'group-suggest-final');
    });
  }

  function setGroupSuggestProgress(percent, text) {
    if (!els.suggestProgress || !els.suggestProgressFill || !els.suggestProgressLabel) return;
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    els.suggestProgress.classList.add('active');
    els.suggestProgress.classList.remove('fade-out');
    els.suggestProgress.style.opacity = '';
    els.suggestProgressFill.style.animation = 'none';
    els.suggestProgressFill.style.transition = '';
    els.suggestProgressFill.style.transform = `scaleX(${pct / 100})`;
    els.suggestProgressLabel.textContent = text || '';
  }

  function finishGroupSuggestProgress(text) {
    if (!els.suggestProgress) return;
    setGroupSuggestProgress(100, text || 'Fertig');
    view.setTimeout(() => {
      if (!els.suggestProgress) return;
      els.suggestProgress.classList.remove('fade-out');
      void els.suggestProgress.offsetWidth;
      els.suggestProgress.classList.add('fade-out');
      view.setTimeout(() => {
        if (!els.suggestProgress) return;
        els.suggestProgress.classList.remove('active');
        els.suggestProgress.classList.remove('fade-out');
        els.suggestProgress.style.opacity = '';
      }, 1500);
    }, 180);
  }

  function hideGroupSuggestProgress() {
    if (!els.suggestProgress) return;
    els.suggestProgress.classList.add('fade-out');
    view.setTimeout(() => {
      if (!els.suggestProgress) return;
      els.suggestProgress.classList.remove('active');
      els.suggestProgress.classList.remove('fade-out');
      els.suggestProgress.style.opacity = '';
    }, 250);
  }

  function cloneGroupSeatMap(source) {
    const out = {};
    if (!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([seatId, occupants]) => {
      out[seatId] = Array.isArray(occupants) ? occupants.slice() : [];
    });
    return out;
  }

  function buildGroupSuggestionSignature(seatMap, seatIds) {
    return seatIds
      .map((seatId) => {
        const occupants = Array.isArray(seatMap[seatId]) ? seatMap[seatId] : [];
        return `${seatId}:${occupants.join(',')}`;
      })
      .join('|');
  }

  function scoreGroupSuggestionSeatMap(seatMap, studentById) {
    let score = 0;
    const buddySetById = new Map();
    const foeSetById = new Map();
    const performanceConstraintActive = clampPerformanceFlairCount(state.performanceFlairCount) >= 2
      && state.students.some((student) => sanitizePerformanceFlairForCount(student?.performanceFlair));
    studentById.forEach((student, studentId) => {
      buddySetById.set(studentId, new Set(student?.buddies || []));
      foeSetById.set(studentId, new Set(student?.foes || []));
    });

    const seatSizes = [];
    Object.values(seatMap).forEach((occupantsRaw) => {
      const occupants = Array.isArray(occupantsRaw) ? occupantsRaw : [];
      const size = occupants.length;
      seatSizes.push(size);
      if (size <= 1) return;

      occupants.forEach((studentId) => {
        const student = studentById.get(studentId);
        if (student?.prefersAlone) {
          score += (size - 1) * 1.2;
        }
      });

      for (let i = 0; i < size; i += 1) {
        const aId = occupants[i];
        const aBuddies = buddySetById.get(aId) || new Set();
        const aFoes = foeSetById.get(aId) || new Set();
        for (let j = i + 1; j < size; j += 1) {
          const bId = occupants[j];
          const bBuddies = buddySetById.get(bId) || new Set();
          const bFoes = foeSetById.get(bId) || new Set();
          if (performanceConstraintActive) {
            const distance = getPerformanceFlairDistance(
              studentById.get(aId)?.performanceFlair,
              studentById.get(bId)?.performanceFlair
            );
            if (distance && distance > 0) {
              score += distance * 12000;
            }
          }
          if (aFoes.has(bId)) score += 3;
          if (bFoes.has(aId)) score += 3;
          if (aBuddies.has(bId)) score -= 1.7;
          if (bBuddies.has(aId)) score -= 1.7;
        }
      }
    });

    if (seatSizes.length > 0) {
      const avg = seatSizes.reduce((sum, size) => sum + size, 0) / seatSizes.length;
      seatSizes.forEach((size) => {
        const delta = size - avg;
        score += delta * delta * 0.14;
      });
    }

    return score;
  }
  function formatGroupSuggestionSeatLabel(seatId, activeIds = []) {
    const index = Array.isArray(activeIds) ? activeIds.indexOf(seatId) : -1;
    return index >= 0 ? `Gruppe ${index + 1}` : `Gruppe ${seatId}`;
  }
  function buildPerformanceFlairGroupCountOptions(flairs, remainingCounts, maxSize, minSize, freeSeatCount) {
    const relevantFlairs = (Array.isArray(flairs) ? flairs : []).filter((flair) => (remainingCounts.get(flair) || 0) > 0);
    const options = [];
    const backtrack = (index, usedSeats, current) => {
      if (usedSeats > freeSeatCount) return;
      if (index >= relevantFlairs.length) {
        options.push(new Map(current));
        return;
      }
      const flair = relevantFlairs[index];
      const count = remainingCounts.get(flair) || 0;
      const minGroups = Math.ceil(count / Math.max(1, maxSize));
      const maxGroups = Math.floor(count / Math.max(1, minSize));
      if (maxGroups < minGroups) return;
      for (let groupCount = minGroups; groupCount <= maxGroups; groupCount += 1) {
        current.set(flair, groupCount);
        backtrack(index + 1, usedSeats + groupCount, current);
      }
      current.delete(flair);
    };
    backtrack(0, 0, new Map());
    return options.filter((option) => {
      let used = 0;
      option.forEach((value) => { used += value; });
      return used <= freeSeatCount;
    });
  }
  function analyzePerformanceFlairConstraints({
    activeIds,
    freeSeats,
    lockedSeatSet,
    lockedAssignments,
    maxSize,
    minSize,
    studentById,
  }) {
    const allowedFlairs = getAllowedPerformanceFlairs();
    const assignedFlairs = state.students
      .map(student => sanitizePerformanceFlairForCount(student?.performanceFlair))
      .filter(Boolean);
    if (!allowedFlairs.length || !assignedFlairs.length) {
      return { active: false };
    }
    const invalidStudent = state.students.find((student) => !sanitizePerformanceFlairForCount(student?.performanceFlair));
    const missingFlairWarningMessage = invalidStudent
      ? `Nicht alle Lernenden haben eine Leistungsstufe aus ${formatPerformanceFlairRangeLabel()}. Es wird eine bestmögliche Verteilung erstellt.`
      : null;
    const lockedCounts = new Map(allowedFlairs.map((flair) => [flair, 0]));
    for (const seatId of activeIds) {
      if (!lockedSeatSet.has(seatId)) continue;
      const occupants = ensureSeatList(lockedAssignments[seatId]);
      if (!occupants.length) continue;
      if (occupants.length < minSize || occupants.length > maxSize) {
        showMessage(
          `${formatGroupSuggestionSeatLabel(seatId, activeIds)} ist gesperrt und verletzt mit ${occupants.length} Lernenden die Gruppengröße ${minSize}-${maxSize}.`,
          'warn'
        );
        return null;
      }
      const flairSet = new Set(
        occupants
          .map((studentId) => sanitizePerformanceFlairForCount(studentById.get(studentId)?.performanceFlair))
          .filter(Boolean)
      );
      if (flairSet.size !== 1) {
        showMessage(
          `${formatGroupSuggestionSeatLabel(seatId, activeIds)} mischt Leistungsstufen. Entsperre oder bereinige die Gruppe zuerst.`,
          'warn'
        );
        return null;
      }
      const flair = [...flairSet][0];
      lockedCounts.set(flair, (lockedCounts.get(flair) || 0) + occupants.length);
    }
    const remainingCounts = new Map(allowedFlairs.map((flair) => [flair, 0]));
    state.students.forEach((student) => {
      const flair = sanitizePerformanceFlairForCount(student?.performanceFlair);
      remainingCounts.set(flair, (remainingCounts.get(flair) || 0) + 1);
    });
    lockedCounts.forEach((count, flair) => {
      remainingCounts.set(flair, Math.max(0, (remainingCounts.get(flair) || 0) - count));
    });
    const groupCountOptions = buildPerformanceFlairGroupCountOptions(
      allowedFlairs,
      remainingCounts,
      maxSize,
      minSize,
      freeSeats.length
    );
    if (!groupCountOptions.length) {
      return {
        active: true,
        bestEffort: true,
        warningMessage: missingFlairWarningMessage
          || `Die Leistungsstufen lassen sich mit der aktuellen Gruppenanzahl und Gruppengröße ${minSize}-${maxSize} nicht vollständig homogen verteilen. Es wird eine bestmögliche Verteilung erstellt.`,
        flairs: allowedFlairs,
        groupCountOptions: [],
      };
    }
    return {
      active: true,
      bestEffort: Boolean(missingFlairWarningMessage),
      warningMessage: missingFlairWarningMessage,
      flairs: allowedFlairs,
      groupCountOptions,
    };
  }
  function buildPerformanceFlairSeatAllocation(freeSeats, flairs, groupCounts) {
    const shuffledSeats = Array.isArray(freeSeats) ? freeSeats.slice() : [];
    for (let i = shuffledSeats.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledSeats[i], shuffledSeats[j]] = [shuffledSeats[j], shuffledSeats[i]];
    }
    const flairList = Array.isArray(flairs) ? flairs : [];
    const allocation = new Map(flairList.map((flair) => [flair, []]));
    let seatIndex = 0;
    flairList.forEach((flair) => {
      const groupCount = groupCounts?.get(flair) || 0;
      allocation.set(flair, shuffledSeats.slice(seatIndex, seatIndex + groupCount));
      seatIndex += groupCount;
    });
    return allocation;
  }

  function buildPreferenceGroupSuggestionCandidate({
    activeIds,
    freeSeats,
    lockedSeatSet,
    lockedAssignments,
    initiallyAssignedIds,
    maxSize,
    studentById,
    performanceFlairPlan = null,
    performanceFlairBestEffort = false,
  }) {
    const assigned = new Set(initiallyAssignedIds || []);
    const nextSeats = {};
    activeIds.forEach((seatId) => {
      nextSeats[seatId] = lockedSeatSet.has(seatId) ? ensureSeatList(lockedAssignments[seatId]) : [];
      nextSeats[seatId].forEach((studentId) => assigned.add(studentId));
    });

    const seatScore = (seatId, studentId) => {
      const occup = nextSeats[seatId] || [];
      const stu = studentById.get(studentId);
      const buddies = new Set(stu?.buddies || []);
      const foes = new Set(stu?.foes || []);
      const studentFlair = sanitizePerformanceFlairForCount(stu?.performanceFlair);
      let score = occup.length * 0.4;
      occup.forEach((otherId) => {
        if (foes.has(otherId)) score += 3;
        if (buddies.has(otherId)) score -= 2;
        if (performanceFlairBestEffort) {
          const distance = getPerformanceFlairDistance(studentFlair, studentById.get(otherId)?.performanceFlair);
          if (distance && distance > 0) {
            score += distance * 2.4;
          }
        }
      });
      return score;
    };
    const orderStudents = (students) => {
      const ordered = students.slice().sort((a, b) => {
        const score = (stu) => ((stu.buddies?.length || 0) * -1) + ((stu.foes?.length || 0) * -2);
        return score(a) - score(b);
      });
      for (let i = ordered.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
      return ordered;
    };
    const placeStudents = (students, seatIds) => {
      orderStudents(students).forEach((student) => {
        let bestSeat = null;
        let bestScore = Infinity;
        seatIds.forEach((seatId) => {
          if ((nextSeats[seatId]?.length || 0) >= maxSize) return;
          const value = seatScore(seatId, student.id);
          if (value < bestScore - 1e-6 || (Math.abs(value - bestScore) < 1e-6 && Math.random() < 0.5)) {
            bestScore = value;
            bestSeat = seatId;
          }
        });
        if (!bestSeat) {
          bestSeat = seatIds.find(id => (nextSeats[id]?.length || 0) < maxSize) || null;
        }
        if (bestSeat) {
          nextSeats[bestSeat].push(student.id);
        }
      });
    };

    if (performanceFlairPlan?.active) {
      (performanceFlairPlan.flairs || []).forEach((flair) => {
        placeStudents(
          state.students.filter((student) => (
            !assigned.has(student.id)
            && sanitizePerformanceFlairForCount(student.performanceFlair) === flair
          )),
          performanceFlairPlan.seatAllocation.get(flair) || []
        );
      });
      return nextSeats;
    }

    placeStudents(
      state.students.filter(student => !assigned.has(student.id)),
      freeSeats
    );

    return nextSeats;
  }

  async function playGroupSuggestionRoulette(candidates, finalCandidate) {
    if (!Array.isArray(candidates) || !candidates.length || !finalCandidate) return;
    const roulettePool = candidates.filter(candidate => candidate?.signature !== finalCandidate.signature);
    const frameCount = Math.max(
      GROUP_SUGGEST_ROULETTE_CONFIG.minFrames,
      Math.min(GROUP_SUGGEST_ROULETTE_CONFIG.maxFrames, roulettePool.length + 1)
    );
    const frameSequence = [];
    if (roulettePool.length > 0) {
      const randomOffset = Math.floor(Math.random() * roulettePool.length);
      for (let i = 0; i < frameCount - 1; i += 1) {
        frameSequence.push(roulettePool[(i + randomOffset) % roulettePool.length]);
      }
    }
    while (frameSequence.length < frameCount - 1) {
      frameSequence.push(finalCandidate);
    }
    frameSequence.push(finalCandidate);

    for (let i = 0; i < frameSequence.length; i += 1) {
      const frame = frameSequence[i] || finalCandidate;
      state.seats = cloneGroupSeatMap(frame.seats);
      renderSeats();
      const isFinal = i === frameSequence.length - 1;
      flashGroupSuggestionFrame({ final: isFinal });
      await nextPaint();
      const progress = 35 + Math.round(((i + 1) / frameSequence.length) * 63);
      setGroupSuggestProgress(progress, isFinal ? 'Finale Verteilung...' : 'Mische Gruppen...');
      if (isFinal) {
        await waitMs(GROUP_SUGGEST_ROULETTE_CONFIG.finalHoldMs);
        break;
      }
      const t = i / Math.max(1, frameSequence.length - 2);
      const eased = t * t;
      const delayMs = GROUP_SUGGEST_ROULETTE_CONFIG.minDelayMs
        + ((GROUP_SUGGEST_ROULETTE_CONFIG.maxDelayMs - GROUP_SUGGEST_ROULETTE_CONFIG.minDelayMs) * eased);
      await waitMs(delayMs);
    }
  }

  async function assignWithPreferences() {
    if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn', { presentation: 'toast' }); return; }
    if (!state.activeSeats.size) { showMessage('Bitte zuerst das Gruppenraster einrichten.', 'warn', { presentation: 'toast' }); return; }
    if (groupSuggestInProgress) return;
    syncGroupSizeInputs();
    const maxSize = clampMaxGroupSize(state.maxGroupSize);
    const minSize = clampMinGroupSize(state.minGroupSize);
    ensureCapacityForStudents(maxSize, minSize);
    const activeIds = Array.from(state.activeSeats);
    const lockedAssignments = {};
    const assigned = new Set();
    state.lockedSeats.forEach(id => {
      lockedAssignments[id] = getSeatList(id);
      lockedAssignments[id].forEach(sid => assigned.add(sid));
    });
    const freeSeats = activeIds.filter(id => !state.lockedSeats.has(id));
    if (!freeSeats.length) {
      showMessage('Keine freien Gruppen verfügbar (alle gesperrt).', 'warn', { presentation: 'toast' });
      return;
    }
    const capacity = activeIds.length * maxSize;
    const remainingCount = state.students.length;
    if (capacity < remainingCount) {
      showMessage('Raster wurde erweitert, aber es fehlt Platz für alle Lernenden bei dieser Gruppengröße.', 'warn');
    }
    const previousSeats = cloneGroupSeatMap(state.seats);
    const lockedSeatSet = new Set(state.lockedSeats);
    const studentById = new Map(state.students.map(s => [s.id, s]));
    const initiallyAssignedIds = new Set(assigned);
    const performanceFlairConstraints = analyzePerformanceFlairConstraints({
      activeIds,
      freeSeats,
      lockedSeatSet,
      lockedAssignments,
      maxSize,
      minSize,
      studentById,
    });
    if (performanceFlairConstraints === null) {
      return;
    }
    groupSuggestInProgress = true;
    [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    setGroupSuggestProgress(0, 'Vorschläge werden vorbereitet...');

    try {
      const candidates = [];
      const seenSignatures = new Set();
      const totalAttempts = GROUP_SUGGEST_ROULETTE_CONFIG.candidateAttempts;
      const usePerformanceFlairPlan = Boolean(
        performanceFlairConstraints?.active
        && !performanceFlairConstraints.bestEffort
        && performanceFlairConstraints.groupCountOptions?.length
      );

      for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
        const selectedGroupCounts = usePerformanceFlairPlan
          ? performanceFlairConstraints.groupCountOptions[
          Math.floor(Math.random() * performanceFlairConstraints.groupCountOptions.length)
          ]
          : null;
        const candidateSeats = buildPreferenceGroupSuggestionCandidate({
          activeIds,
          freeSeats,
          lockedSeatSet,
          lockedAssignments,
          initiallyAssignedIds,
          maxSize,
          studentById,
          performanceFlairPlan: usePerformanceFlairPlan
            ? {
              active: true,
              flairs: performanceFlairConstraints.flairs,
              seatAllocation: buildPerformanceFlairSeatAllocation(
                freeSeats,
                performanceFlairConstraints.flairs,
                selectedGroupCounts
              ),
            }
            : null,
          performanceFlairBestEffort: Boolean(
            performanceFlairConstraints?.active && performanceFlairConstraints.bestEffort
          ),
        });
        const signature = buildGroupSuggestionSignature(candidateSeats, activeIds);
        if (seenSignatures.has(signature)) {
          continue;
        }
        seenSignatures.add(signature);
        const candidate = {
          seats: candidateSeats,
          signature,
          score: scoreGroupSuggestionSeatMap(candidateSeats, studentById),
        };
        candidates.push(candidate);
        const progress = 5 + Math.round(((attempt + 1) / totalAttempts) * 28);
        setGroupSuggestProgress(progress, `Berechne Varianten... (${attempt + 1}/${totalAttempts})`);
      }

      if (!candidates.length) {
        const fallbackGroupCounts = usePerformanceFlairPlan
          ? performanceFlairConstraints.groupCountOptions[0]
          : null;
        const fallbackSeats = buildPreferenceGroupSuggestionCandidate({
          activeIds,
          freeSeats,
          lockedSeatSet,
          lockedAssignments,
          initiallyAssignedIds,
          maxSize,
          studentById,
          performanceFlairPlan: usePerformanceFlairPlan
            ? {
              active: true,
              flairs: performanceFlairConstraints.flairs,
              seatAllocation: buildPerformanceFlairSeatAllocation(
                freeSeats,
                performanceFlairConstraints.flairs,
                fallbackGroupCounts
              ),
            }
            : null,
          performanceFlairBestEffort: Boolean(
            performanceFlairConstraints?.active && performanceFlairConstraints.bestEffort
          ),
        });
        candidates.push({
          seats: fallbackSeats,
          signature: buildGroupSuggestionSignature(fallbackSeats, activeIds),
          score: scoreGroupSuggestionSeatMap(fallbackSeats, studentById),
        });
      }

      candidates.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return Math.random() < 0.5 ? -1 : 1;
      });

      const topCandidateCount = Math.max(1, Math.min(3, candidates.length));
      const finalCandidate = candidates[Math.floor(Math.random() * topCandidateCount)] || candidates[0];
      const rouletteCandidates = candidates.slice(0, Math.min(candidates.length, 12));
      await playGroupSuggestionRoulette(rouletteCandidates, finalCandidate);

      state.seats = cloneGroupSeatMap(finalCandidate.seats);
      renderSeats();
      refreshUnseated();
      if (performanceFlairConstraints?.bestEffort && performanceFlairConstraints.warningMessage) {
        showMessage(performanceFlairConstraints.warningMessage, 'warn');
      }
      finishGroupSuggestProgress('Vorschlag steht');
    } catch (error) {
      reportError(error, 'Gruppenvorschlag konnte nicht erstellt werden.', {
        scope: 'group-suggestion',
        action: 'assign-with-preferences',
      });
      state.seats = previousSeats;
      renderSeats();
      refreshUnseated();
      hideGroupSuggestProgress();
    } finally {
      groupSuggestInProgress = false;
      clearGroupSuggestionFrameState();
      [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
    }
  }

  [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
    bindStatic(button, 'click', assignWithPreferences);
  });

  [els.groupResetLearners].filter(Boolean).forEach((button) => {
    bindStatic(button, 'click', () => {
      state.seats = {};
      state.lockedSeats.clear();
      state.seatTopics = {};
      renderSeats();
      refreshUnseated();
    });
  });

  function getPlanState() {
    if (!state.activeSeats.size) {
      showMessage('Keine aktiven Gruppenfelder vorhanden.', 'warn', { presentation: 'toast' });
      return null;
    }
    const orderedActiveIds = Array.isArray(state.activeSeatOrder)
      ? state.activeSeatOrder.filter(id => state.activeSeats.has(id))
      : [];
    const activeIds = orderedActiveIds.length ? orderedActiveIds : Array.from(state.activeSeats);
    const seats = {};
    activeIds.forEach(id => { seats[id] = getSeatList(id); });
    return {
      grid: { rows: state.gridRows, cols: state.gridCols },
      activeSeats: activeIds,
      lockedSeats: Array.from(state.lockedSeats),
      seats,
      seatTopics: activeIds.reduce((acc, id) => {
        if (typeof state.seatTopics?.[id] === 'string') acc[id] = state.seatTopics[id];
        return acc;
      }, {}),
      performanceFlairCount: clampPerformanceFlairCount(state.performanceFlairCount),
      minGroupSize: clampMinGroupSize(state.minGroupSize || 1),
      maxGroupSize: clampMaxGroupSize(state.maxGroupSize || 1),
    };
  }

  function restorePlanState(data, options = {}) {
    const restoreSeatAssignments = options.restoreSeatAssignments !== false;
    if (!data || typeof data !== 'object') throw new Error('Ungültiges Plan-Format.');
    state.performanceFlairCount = clampPerformanceFlairCount(data.performanceFlairCount, 4);
    const incomingSeats = data.seats && typeof data.seats === 'object' ? data.seats : {};
    const incomingTopics = data.seatTopics && typeof data.seatTopics === 'object' ? data.seatTopics : {};
    const incomingActive = Array.isArray(data.activeSeats) ? data.activeSeats.filter(Boolean) : [];
    const seatAssignments = new Map();
    const seatIds = new Set();
    const activeSeatOrder = [];
    const activeSeatSet = new Set();
    const registerSeat = (rawId) => {
      const normalized = sanitizeSeatIdWithinLimit(rawId);
      if (!normalized) return null;
      seatIds.add(normalized);
      return normalized;
    };
    const registerActiveSeat = (rawId) => {
      const normalized = registerSeat(rawId);
      if (!normalized || activeSeatSet.has(normalized)) return normalized;
      activeSeatSet.add(normalized);
      activeSeatOrder.push(normalized);
      return normalized;
    };
    incomingActive.forEach(registerActiveSeat);
    Object.entries(incomingSeats).forEach(([id, val]) => {
      const normalized = registerSeat(id);
      if (normalized) {
        seatAssignments.set(normalized, ensureSeatList(val));
        if (!incomingActive.length) registerActiveSeat(normalized);
      }
    });
    if (!incomingActive.length) {
      Object.keys(incomingTopics).forEach(registerActiveSeat);
      (Array.isArray(data.lockedSeats) ? data.lockedSeats : []).forEach(registerActiveSeat);
    }
    if (!seatIds.size) throw new Error('Plan enthält keine Gruppenfelder.');
    const maxFromIds = (index) => {
      let max = 1;
      seatIds.forEach(id => {
        const value = id.split('-').map(Number)[index];
        if (Number.isFinite(value) && value > max) max = value;
      });
      return max;
    };
    const planRows = normalizeGridDimension(data.grid?.rows);
    const planCols = normalizeGridDimension(data.grid?.cols);
    const requiredRows = maxFromIds(0);
    const requiredCols = maxFromIds(1);
    const currentRows = clampGridDimension(state.gridRows);
    const currentCols = clampGridDimension(state.gridCols);
    state.gridRows = planRows !== null
      ? clampGridDimension(Math.max(planRows, requiredRows))
      : clampGridDimension(Math.max(currentRows, requiredRows));
    state.gridCols = planCols !== null
      ? clampGridDimension(Math.max(planCols, requiredCols))
      : clampGridDimension(Math.max(currentCols, requiredCols));
    state.minGroupSize = clampMinGroupSize(data.minGroupSize ?? state.minGroupSize);
    state.maxGroupSize = clampMaxGroupSize(data.maxGroupSize ?? state.maxGroupSize);
    const fallbackActiveOrder = Array.from(buildFullActiveSet(state.gridRows, state.gridCols));
    const nextActiveOrder = activeSeatOrder.length
      ? activeSeatOrder
      : (incomingActive.length ? Array.from(seatIds) : fallbackActiveOrder);
    state.activeSeatOrder = nextActiveOrder;
    state.activeSeats = new Set(nextActiveOrder);
    const locked = Array.isArray(data.lockedSeats) ? data.lockedSeats : [];
    const sanitizedLocks = locked
      .map(id => sanitizeSeatIdWithinLimit(id))
      .filter(id => id && state.activeSeats.has(id));
    state.lockedSeats = restoreSeatAssignments ? new Set(sanitizedLocks) : new Set();
    state.seats = {};
    state.activeSeats.forEach(id => {
      state.seats[id] = restoreSeatAssignments && seatAssignments.has(id)
        ? ensureSeatList(seatAssignments.get(id))
        : [];
    });
    const topics = {};
    state.activeSeats.forEach(id => {
      if (typeof incomingTopics[id] === 'string') topics[id] = incomingTopics[id];
    });
    state.seatTopics = topics;
    enforceGridBounds();
    buildGrid();
    refreshUnseated();
  }

  function handleRosterReplacement({ rebuildCapacity = false } = {}) {
    state.seats = {};
    state.seatTopics = {};
    state.lockedSeats.clear();
    if (rebuildCapacity) syncGroupGridFromSizeInputs({ forceCapacity: true });
    else syncGroupSizeInputs();
    refreshUnseated();
    renderSeats();
    requestGroupGridLayoutRefresh({ resetViewport: true });
  }

  function render({ resetViewport = true } = {}) {
    buildGrid();
    refreshUnseated();
    if (resetViewport) requestGroupGridLayoutRefresh({ resetViewport: true });
  }

  function handlePreferencesChange(event) {
    const target = event?.target;
    if (!(target instanceof view.HTMLSelectElement)) return false;
    if (target.dataset.preference !== 'performance-flair') return false;
    renderSeatPreferencesPerformanceSummary(readSeatPreferencesDraftFromForm());
    return true;
  }

  function handlePerformanceFlairCountChange(event) {
    const target = event?.target;
    if (!(target instanceof view.HTMLInputElement) || target.dataset.performanceFlairCountInput !== '1') return false;
    const trimmed = String(target.value || '').trim();
    const parsed = Number.parseInt(trimmed, 10);
    if (!/^[0-9]+$/.test(trimmed) || parsed < 2 || parsed > MAX_PERFORMANCE_FLAIR_COUNT) {
      showMessage(`Bitte eine Zahl zwischen 2 und ${MAX_PERFORMANCE_FLAIR_COUNT} eingeben.`, 'warn', { presentation: 'toast' });
      target.value = String(clampPerformanceFlairCount(state.performanceFlairCount));
      target.focus();
      target.select();
      return true;
    }
    applyPerformanceFlairCount(parsed, readSeatPreferencesDraftFromForm());
    return true;
  }

  const onBeforePrint = () => applyPrintScale();
  const onAfterPrint = () => resetPrintScale();
  bindStatic(view, 'beforeprint', onBeforePrint);
  bindStatic(view, 'afterprint', onAfterPrint);
  bindStatic(els.groupExportPlan, 'click', onPlanExportRequest);
  bindStatic(els.groupPrintPlan, 'click', printSeatPlan);
  bindStatic(els.groupImportPlan, 'click', onPlanImportRequest);
  const onImportPlanFileChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      await onPlanFileSelected(file);
    } catch (error) {
      reportError(error, error?.message || 'Gruppen konnten nicht geladen werden.', {
        scope: 'plan-import', source: 'file-input',
      });
    } finally {
      event.target.value = '';
    }
  };
  bindStatic(els.importPlanFile, 'change', onImportPlanFileChange);

  let groupGridObserver = null;
  if (typeof view.ResizeObserver === 'function' && els.groupsGridWrap) {
    groupGridObserver = new view.ResizeObserver(() => {
      if (isGroupsActive()) requestGroupGridLayoutRefresh();
    });
    groupGridObserver.observe(els.groupsGridWrap);
    if (els.groupsMainHost) groupGridObserver.observe(els.groupsMainHost);
  }
  bindBackgroundDrop(els.groupsGrid);
  bindBackgroundDrop(els.groupsGridWrap, { ignoreInsideGrid: true });

  return {
    render,
    refreshLayout: requestGroupGridLayoutRefresh,
    setActive(active) {
      if (active) requestGroupGridLayoutRefresh({ resetViewport: true });
    },
    isSuggesting() { return groupSuggestInProgress; },
    handleRosterReplacement,
    getPlanState,
    restorePlanState,
    renderPreferences: buildSeatPreferencesTable,
    savePreferences: savePreferencesFromForm,
    handlePreferencesChange,
    handlePerformanceFlairCountChange,
    getStateSnapshot() {
      return {
        seats: cloneGroupSeatMap(state.seats),
        gridRows: state.gridRows,
        gridCols: state.gridCols,
        activeSeats: Array.from(state.activeSeats),
        activeSeatOrder: state.activeSeatOrder.slice(),
        lockedSeats: Array.from(state.lockedSeats),
        minGroupSize: state.minGroupSize,
        maxGroupSize: state.maxGroupSize,
        seatTopics: { ...state.seatTopics },
      };
    },
    replaceState(nextState) {
      cancelTouchDrag();
      groupState = createGroupsState(nextState);
    },
    dispose() {
      cancelTouchDrag();
      clearGroupGridLayoutRetryTimers();
      groupGridObserver?.disconnect();
      staticDisposers.splice(0).forEach(dispose => dispose());
    },
  };
}
