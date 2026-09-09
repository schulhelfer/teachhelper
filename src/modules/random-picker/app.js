export const RANDOM_PICKER_MIN_WEIGHT = 0;
export const RANDOM_PICKER_MAX_WEIGHT = 4;
export const RANDOM_PICKER_DEFAULT_WEIGHT = 1;
export const RANDOM_PICKER_CERTAIN_WEIGHT = 4;
export const RANDOM_PICKER_SPIN_DURATION_MS = 4000;

export function normalizeRandomPickerWeight(value, fallback = RANDOM_PICKER_DEFAULT_WEIGHT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= RANDOM_PICKER_MIN_WEIGHT) return RANDOM_PICKER_MIN_WEIGHT;
  if (parsed >= RANDOM_PICKER_CERTAIN_WEIGHT) return RANDOM_PICKER_CERTAIN_WEIGHT;
  if (parsed >= RANDOM_PICKER_MAX_WEIGHT) return RANDOM_PICKER_MAX_WEIGHT;
  return RANDOM_PICKER_DEFAULT_WEIGHT;
}

export function normalizeRandomPickerAutoDisableSelected(value) {
  return value === true;
}

export function pickWeightedRandomPickerCandidate(candidates, random = Math.random) {
  const pool = Array.isArray(candidates)
    ? candidates.filter((entry) => entry && entry.weight > 0)
    : [];
  const certainCandidate = pool.find((entry) => entry.weight === RANDOM_PICKER_CERTAIN_WEIGHT);
  if (certainCandidate) return certainCandidate;
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (!pool.length || totalWeight <= 0) return null;
  let threshold = random() * totalWeight;
  for (const entry of pool) {
    threshold -= entry.weight;
    if (threshold < 0) return entry;
  }
  return pool[pool.length - 1] || null;
}

export function resolveRandomPickerDom(doc = document) {
  return {
    host: doc.getElementById('random-picker-host'),
    wheel: doc.getElementById('random-picker-wheel'),
    cards: doc.querySelectorAll('[data-random-slot]'),
    importButton: doc.getElementById('random-picker-import'),
    exportButton: doc.getElementById('random-picker-export'),
    startButton: doc.getElementById('random-picker-start'),
    startButtons: doc.querySelectorAll('[data-random-picker-start]'),
    preferencesDialogTitle: doc.getElementById('preferences-dialog-title'),
    preferencesTableHead: doc.getElementById('preferences-thead'),
    preferencesTableBody: doc.getElementById('preferences-tbody'),
    preferencesRandomPickerAutoDisable: doc.getElementById('preferences-random-picker-auto-disable'),
    randomPickerAutoDisableSelected: doc.getElementById('random-picker-auto-disable-selected'),
    preferencesPerformanceSummary: doc.getElementById('preferences-performance-summary'),
    preferencesReset: doc.getElementById('preferences-reset'),
    count: doc.getElementById('random-picker-count'),
    resultName: doc.getElementById('random-picker-result-name'),
    resultNote: doc.getElementById('random-picker-result-note'),
    actionNote: doc.getElementById('random-picker-action-note'),
  };
}

export function mountRandomPicker({
  doc = typeof document !== 'undefined' ? document : null,
  dom = doc ? resolveRandomPickerDom(doc) : {},
  getStudents = () => [],
  formatStudentLabel = (student) => `${student?.first || ''} ${student?.last || ''}`.trim(),
  getAutoDisableSelected = () => false,
  setAutoDisableSelected = () => {},
  setStudentWeight = (student, weight) => {
    if (student && typeof student === 'object') student.randomWeight = weight;
  },
  sanitizeStudent = (student) => {
    if (student && typeof student === 'object') {
      student.randomWeight = normalizeRandomPickerWeight(student.randomWeight);
    }
    return student;
  },
  showMessage = () => {},
  onImport = () => {},
  onExport = () => {},
  random = Math.random,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.round(ms)))),
} = {}) {
  let spinInProgress = false;
  let currentIndex = 0;
  let lockedWidthPx = 0;
  const removers = [];
  const view = doc?.defaultView || globalThis;

  function readStudents() {
    const students = getStudents();
    return Array.isArray(students) ? students : [];
  }

  function getCandidates({ includeZeroWeight = false } = {}) {
    return readStudents()
      .map((student) => {
        const name = formatStudentLabel(student);
        if (!name) return null;
        const weight = normalizeRandomPickerWeight(student?.randomWeight);
        return { id: student.id, name, weight };
      })
      .filter((entry) => entry && (includeZeroWeight || entry.weight > 0));
  }

  function getNames({ includeZeroWeight = true } = {}) {
    return getCandidates({ includeZeroWeight }).map((entry) => entry.name);
  }

  function measureWheelWidth(labels = []) {
    if (!dom.wheel || !doc) return 0;
    const probeCard = dom.cards?.[3] || dom.cards?.[0];
    if (!probeCard) return 0;
    const wheelStyle = view.getComputedStyle(dom.wheel);
    const cardStyle = view.getComputedStyle(probeCard);
    const horizontalPadding = ['paddingLeft', 'paddingRight']
      .reduce((sum, key) => sum + (Number.parseFloat(wheelStyle[key]) || 0), 0);
    const cardHorizontal = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
      .reduce((sum, key) => sum + (Number.parseFloat(cardStyle[key]) || 0), 0);
    const candidates = Array.from(new Set(
      labels
        .map((label) => String(label || '').trim())
        .filter(Boolean)
        .concat(['Noch keine Namen importiert', 'Keine Auswahl aktiv'])
    ));
    if (!candidates.length) return 0;
    const measurer = doc.createElement('span');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.pointerEvents = 'none';
    measurer.style.whiteSpace = 'nowrap';
    measurer.style.font = cardStyle.font;
    measurer.style.fontWeight = cardStyle.fontWeight;
    measurer.style.letterSpacing = cardStyle.letterSpacing;
    measurer.style.textTransform = cardStyle.textTransform;
    measurer.style.padding = '0';
    measurer.style.border = '0';
    measurer.style.top = '-9999px';
    measurer.style.left = '-9999px';
    doc.body.appendChild(measurer);
    let maxLabelWidth = 0;
    candidates.forEach((label) => {
      measurer.textContent = label;
      maxLabelWidth = Math.max(maxLabelWidth, Math.ceil(measurer.getBoundingClientRect().width));
    });
    measurer.remove();
    const arrowClearance = Number.parseFloat(wheelStyle.getPropertyValue('--random-picker-arrow-clearance')) || 0;
    return Math.ceil(maxLabelWidth + cardHorizontal + horizontalPadding + arrowClearance);
  }

  function applyWheelWidth(widthPx = 0) {
    if (!dom.wheel) return;
    if (widthPx > 0) {
      const wheelStyle = view.getComputedStyle(dom.wheel);
      const horizontalPadding = ['paddingLeft', 'paddingRight']
        .reduce((sum, key) => sum + (Number.parseFloat(wheelStyle[key]) || 0), 0);
      const arrowClearance = Number.parseFloat(wheelStyle.getPropertyValue('--random-picker-arrow-clearance')) || 0;
      const cardWidthPx = Math.max(0, widthPx - horizontalPadding - arrowClearance);
      lockedWidthPx = widthPx;
      dom.wheel.style.setProperty('--random-picker-wheel-static-width', `${widthPx}px`);
      dom.wheel.style.setProperty('--random-picker-card-static-width', `${cardWidthPx}px`);
      return;
    }
    lockedWidthPx = 0;
    dom.wheel.style.removeProperty('--random-picker-wheel-static-width');
    dom.wheel.style.removeProperty('--random-picker-card-static-width');
  }

  function refreshWheelWidth(labels = []) {
    const measuredWidth = measureWheelWidth(labels);
    applyWheelWidth(measuredWidth);
    return measuredWidth;
  }

  function getStartButtons() {
    return Array.from(dom.startButtons || []).filter(Boolean);
  }

  function setStartButtons({ disabled, text } = {}) {
    getStartButtons().forEach((button) => {
      if (typeof disabled === 'boolean') button.disabled = disabled;
      if (typeof text === 'string') {
        button.textContent = button.dataset.collapsedIcon === '1' ? '✨' : text;
      }
    });
  }

  function renderCardEmptyState(card, title, copy) {
    if (!card || !doc) return;
    card.classList.add('is-empty-state');
    card.replaceChildren();
    const titleEl = doc.createElement('span');
    titleEl.className = 'empty-state-title';
    titleEl.textContent = title;
    const copyEl = doc.createElement('span');
    copyEl.className = 'empty-state-copy';
    copyEl.textContent = copy;
    card.append(titleEl, copyEl);
  }

  function updateCards(centerIndex = 0, { final = false } = {}) {
    if (!dom.cards?.length) return;
    const allCandidates = getCandidates({ includeZeroWeight: true });
    const names = getNames({ includeZeroWeight: true });
    const total = names.length;
    dom.wheel?.closest('.random-picker-machine')?.classList.toggle('is-empty-state', !total);
    const cards = Array.from(dom.cards);
    if (!total) {
      cards.forEach((card, slotIndex) => {
        const distance = Math.abs(slotIndex - 3);
        card.dataset.distance = String(distance);
        card.classList.toggle('is-final', false);
        if (slotIndex === 3) {
          renderCardEmptyState(
            card,
            allCandidates.length ? 'Keine Auswahl aktiv' : 'Noch keine Namen',
            allCandidates.length
              ? 'Aktiviere mindestens einen Namen für den Picker.'
              : 'Importiere zuerst eine Namensliste.'
          );
        } else {
          card.classList.remove('is-empty-state');
          card.textContent = '';
        }
        card.setAttribute('aria-hidden', slotIndex === 3 ? 'false' : 'true');
      });
      currentIndex = 0;
      return;
    }
    const safeIndex = ((Math.round(centerIndex) % total) + total) % total;
    currentIndex = safeIndex;
    cards.forEach((card, slotIndex) => {
      const offset = slotIndex - 3;
      const candidateIndex = ((safeIndex + offset) % total + total) % total;
      const distance = Math.abs(offset);
      card.classList.remove('is-empty-state');
      card.removeAttribute('aria-hidden');
      card.textContent = names[candidateIndex];
      card.dataset.distance = String(Math.min(3, distance));
      card.classList.toggle('is-final', final && offset === 0);
    });
  }

  function render() {
    const allCandidates = getCandidates({ includeZeroWeight: true });
    const candidates = getCandidates();
    const names = allCandidates.map((entry) => entry.name);
    refreshWheelWidth(names);
    const count = candidates.length;
    if (dom.count) dom.count.textContent = String(count);
    if (!count) {
      spinInProgress = false;
      if (dom.resultName) {
        dom.resultName.textContent = allCandidates.length ? 'Keine Auswahl aktiv' : 'Noch keine Namen importiert';
      }
      if (dom.resultNote) {
        dom.resultNote.textContent = allCandidates.length
          ? 'Alle Einträge stehen auf „unmöglich“. Stelle mindestens einen Eintrag auf „normal“, „doppelt“, „dreifach“ oder „sicher“.'
          : 'Importiere zuerst eine Namensliste in der Sidebar.';
      }
      if (dom.actionNote) {
        dom.actionNote.textContent = allCandidates.length
          ? 'Lege im Dialog Bedingungen pro Name „unmöglich“, „normal“, „doppelt“, „dreifach“ oder „sicher“ fest.'
          : 'Tippe auf den Button, damit der Generator losläuft.';
      }
      setStartButtons({ disabled: !allCandidates.length, text: 'Start' });
      updateCards(0);
      return;
    }
    const safeIndex = Math.min(currentIndex, Math.max(0, names.length - 1));
    updateCards(safeIndex);
    if (!spinInProgress) setStartButtons({ disabled: false });
    if (dom.resultName && !spinInProgress) dom.resultName.textContent = names[safeIndex];
    if (dom.resultNote) {
      dom.resultNote.textContent = spinInProgress
        ? 'Der Generator läuft und bremst kontrolliert ab.'
        : 'Die Auswahl erfolgt zufällig aus allen importierten Namen.';
    }
    if (dom.actionNote && !spinInProgress) {
      dom.actionNote.textContent = count === 1
        ? 'Es ist nur ein Name verfügbar.'
        : 'Tippe auf den Button, damit der Generator losläuft.';
    }
  }

  async function start() {
    const allCandidates = getCandidates({ includeZeroWeight: true });
    if (!allCandidates.length) {
      showMessage('Importiere zuerst die Namensliste!', 'warn', { presentation: 'toast' });
      return;
    }
    const candidates = allCandidates.filter((entry) => entry.weight > 0);
    if (!candidates.length) {
      showMessage('Für den Picker ist aktuell kein Name auf „normal“, „doppelt“, „dreifach“ oder „sicher“ gesetzt.', 'warn', { presentation: 'toast' });
      return;
    }
    const displayNames = allCandidates.map((entry) => entry.name);
    if (spinInProgress) return;
    refreshWheelWidth(displayNames);
    spinInProgress = true;
    setStartButtons({ disabled: true, text: 'Läuft...' });
    if (dom.resultNote) dom.resultNote.textContent = 'Der Generator läuft und bremst kontrolliert ab.';
    if (dom.actionNote) dom.actionNote.textContent = 'Zufallsgenerator läuft...';
    try {
      const winner = pickWeightedRandomPickerCandidate(candidates, random);
      const total = displayNames.length;
      const winnerIndex = Math.max(0, allCandidates.findIndex((entry) => entry.id === winner?.id));
      const loops = total <= 1 ? 0 : Math.max(2, Math.ceil(14 / total));
      const totalSteps = total <= 1
        ? 1
        : Math.max(18, (loops * total) + winnerIndex - currentIndex + (winnerIndex >= currentIndex ? 0 : total));
      const stepWeights = [];
      for (let step = 1; step <= totalSteps; step += 1) {
        const progress = totalSteps <= 1 ? 1 : step / totalSteps;
        stepWeights.push(1 + Math.pow(progress, 2.2) * 6.5);
      }
      const totalWeight = stepWeights.reduce((sum, weight) => sum + weight, 0) || 1;
      for (let step = 1; step <= totalSteps; step += 1) {
        const frameIndex = total <= 1 ? winnerIndex : (currentIndex + 1) % total;
        updateCards(frameIndex, { final: false });
        const delayMs = (RANDOM_PICKER_SPIN_DURATION_MS * stepWeights[step - 1]) / totalWeight;
        await wait(delayMs);
      }
      updateCards(winnerIndex, { final: true });
      const shouldDisableWinner = getAutoDisableSelected() && winner?.id;
      if (shouldDisableWinner) {
        const winnerStudent = readStudents().find((student) => student?.id === winner.id);
        if (winnerStudent) {
          setStudentWeight(winnerStudent, RANDOM_PICKER_MIN_WEIGHT);
        }
      }
      if (dom.resultName) dom.resultName.textContent = winner?.name || displayNames[winnerIndex] || '';
      if (dom.resultNote) {
        dom.resultNote.textContent = shouldDisableWinner
          ? 'Der ausgewählte Name wurde auf „unmöglich“ gesetzt.'
          : 'Der Zufallsgenerator ist stehen geblieben.';
      }
      if (dom.actionNote) {
        const winnerName = winner?.name || displayNames[winnerIndex] || '';
        dom.actionNote.textContent = shouldDisableWinner
          ? `Gewählt wurde: ${winnerName}. Der Name ist nun unmöglich.`
          : `Gewählt wurde: ${winnerName}`;
      }
      setStartButtons({ text: 'Nochmal' });
    } finally {
      spinInProgress = false;
      getStartButtons().forEach((button) => {
        button.disabled = false;
        if (button.textContent.trim() === 'Läuft...') {
          button.textContent = button.dataset.collapsedIcon === '1' ? '✨' : 'Start';
        }
      });
    }
  }

  function setPreferencesResetVisibility(isVisible) {
    if (dom.preferencesReset) dom.preferencesReset.hidden = !isVisible;
  }

  function setAutoDisableControlVisibility(isVisible) {
    if (dom.preferencesRandomPickerAutoDisable) dom.preferencesRandomPickerAutoDisable.hidden = !isVisible;
    if (isVisible && dom.randomPickerAutoDisableSelected) {
      dom.randomPickerAutoDisableSelected.checked = normalizeRandomPickerAutoDisableSelected(getAutoDisableSelected());
    }
  }

  function renderConditions() {
    if (!dom.preferencesDialogTitle || !dom.preferencesTableHead || !dom.preferencesTableBody || !doc) return;
    setPreferencesResetVisibility(true);
    setAutoDisableControlVisibility(true);
    dom.preferencesDialogTitle.textContent = 'Bedingungen';
    dom.preferencesTableHead.innerHTML = `
          <tr>
            <th class="group-header name-header">Name</th>
            <th class="group-header">Wahrscheinlichkeit</th>
          </tr>
        `;
    dom.preferencesTableBody.innerHTML = '';
    if (dom.preferencesPerformanceSummary) {
      dom.preferencesPerformanceSummary.hidden = true;
      dom.preferencesPerformanceSummary.textContent = '';
    }
    const ordered = readStudents().slice().sort((a, b) => {
      const nameA = formatStudentLabel(a).toLowerCase();
      const nameB = formatStudentLabel(b).toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
    ordered.forEach((student) => {
      sanitizeStudent(student);
      const row = doc.createElement('tr');
      const nameCell = doc.createElement('th');
      nameCell.scope = 'row';
      nameCell.className = 'name-cell';
      nameCell.textContent = formatStudentLabel(student);
      row.appendChild(nameCell);
      const weightCell = doc.createElement('td');
      weightCell.className = 'weight-cell';
      const wrap = doc.createElement('div');
      wrap.className = 'weight-choice-group';
      const currentValue = String(normalizeRandomPickerWeight(student.randomWeight));
      const choiceName = `random-weight-${student.id}`;
      [
        { value: '0', label: 'unmöglich' },
        { value: '1', label: 'normal' },
        { value: '2', label: 'doppelt' },
        { value: '3', label: 'dreifach' },
        { value: '4', label: 'sicher' },
      ].forEach((optionConfig) => {
        const choice = doc.createElement('label');
        choice.className = 'weight-choice';
        const input = doc.createElement('input');
        input.type = 'radio';
        input.name = choiceName;
        input.value = optionConfig.value;
        input.dataset.studentId = student.id;
        input.dataset.preference = 'random-weight';
        input.checked = currentValue === optionConfig.value;
        const text = doc.createElement('span');
        text.textContent = optionConfig.label;
        choice.appendChild(input);
        choice.appendChild(text);
        wrap.appendChild(choice);
      });
      weightCell.appendChild(wrap);
      row.appendChild(weightCell);
      dom.preferencesTableBody.appendChild(row);
    });
  }

  function saveConditions() {
    if (!dom.preferencesTableBody) return;
    const inputs = dom.preferencesTableBody.querySelectorAll('input[type="radio"][data-student-id][data-preference="random-weight"]:checked');
    const weightsById = new Map();
    let certainStudentId = '';
    inputs.forEach((input) => {
      const studentId = typeof input.dataset.studentId === 'string' ? input.dataset.studentId : '';
      if (!studentId) return;
      const normalizedWeight = normalizeRandomPickerWeight(input.value);
      weightsById.set(studentId, normalizedWeight);
      if (normalizedWeight === RANDOM_PICKER_CERTAIN_WEIGHT) certainStudentId = studentId;
    });
    readStudents().forEach((student) => {
      if (!student) return;
      if (certainStudentId) {
        setStudentWeight(student, student.id === certainStudentId
          ? RANDOM_PICKER_CERTAIN_WEIGHT
          : RANDOM_PICKER_MIN_WEIGHT);
        return;
      }
      setStudentWeight(student, weightsById.has(student.id)
        ? weightsById.get(student.id)
        : normalizeRandomPickerWeight(student.randomWeight));
    });
    if (dom.randomPickerAutoDisableSelected) {
      setAutoDisableSelected(normalizeRandomPickerAutoDisableSelected(dom.randomPickerAutoDisableSelected.checked));
    }
    render();
  }

  function resetConditions() {
    if (!dom.preferencesTableBody) return;
    const normalChoices = dom.preferencesTableBody.querySelectorAll(
      `input[type="radio"][data-preference="random-weight"][value="${RANDOM_PICKER_DEFAULT_WEIGHT}"]`
    );
    normalChoices.forEach((input) => {
      if (view.HTMLInputElement && !(input instanceof view.HTMLInputElement)) return;
      input.checked = true;
    });
    if (dom.randomPickerAutoDisableSelected) dom.randomPickerAutoDisableSelected.checked = false;
  }

  function handleConditionsChange(event) {
    const target = event?.target;
    if (!target || (view.HTMLInputElement && !(target instanceof view.HTMLInputElement))) return false;
    if (target.dataset.preference !== 'random-weight') return false;
    if (target.checked && target.value === String(RANDOM_PICKER_CERTAIN_WEIGHT)) {
      const allChoices = dom.preferencesTableBody?.querySelectorAll('input[type="radio"][data-preference="random-weight"][data-student-id]') || [];
      allChoices.forEach((input) => {
        if (view.HTMLInputElement && !(input instanceof view.HTMLInputElement)) return;
        if (input === target || input.dataset.studentId === target.dataset.studentId) return;
        input.checked = input.value === String(RANDOM_PICKER_MIN_WEIGHT);
      });
    }
    target.checked = true;
    return true;
  }

  function bind(element, type, listener) {
    if (!element?.addEventListener) return;
    element.addEventListener(type, listener);
    removers.push(() => element.removeEventListener(type, listener));
  }

  getStartButtons().forEach((button) => bind(button, 'click', () => { void start(); }));
  bind(dom.importButton, 'click', onImport);
  bind(dom.exportButton, 'click', onExport);

  return {
    render,
    start,
    isSpinning() {
      return spinInProgress;
    },
    renderConditions,
    saveConditions,
    resetConditions,
    handleConditionsChange,
    setActive(active) {
      if (active) render();
    },
    dispose() {
      removers.splice(0).forEach((remove) => remove());
      applyWheelWidth(0);
    },
  };
}
