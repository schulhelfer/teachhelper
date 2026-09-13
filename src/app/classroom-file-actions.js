import { createPlanSnapshot } from './plan-format.js';
import { loadPlan, pickPlanFile, savePlan } from './plan-persistence.js';
import { assertFileSizeAtMost, FILE_LIMITS } from '../shared/file-guards.js';
import { normalizeCsvCell, normalizeCsvHeader, parseCSV } from '../shared/csv.js';
import {
  dataTransferHasFiles,
  isCsvFile,
  isJsonFile,
  sanitizeExportFileName,
  stripFileExtension,
  triggerBlobDownload,
} from '../shared/file-io.js';
import {
  RANDOM_PICKER_DEFAULT_WEIGHT,
  normalizeRandomPickerAutoDisableSelected,
} from '../modules/random-picker/index.js';
import { clampPerformanceFlairCount } from '../modules/groups/index.js';
import { TAB_RANDOM_PICKER } from '../shell/tabs.js';

export function createClassroomFileActions({
  documentRef: document,
  els,
  isIOSDevice,
  shellActionDialog,
  bindRuntime,
  showMessage,
  reportAppError,
  getActiveTab,
  isRandomPickerTabActive,
  getClassroomState,
  getGroupsController,
  getWorkPhaseController,
  getGradeRosterCoordinator,
  getAutoDisableSelected,
  setAutoDisableSelected,
  sanitizeRandomPickerStudent,
  renderRandomPicker,
}) {
  const state = { lastDirectoryHandle: null };
  const TEMPLATE_CSV_NAME = 'Namensliste Vorlage.csv';
  const TEMPLATE_CSV_CONTENT = [';Nachname;Vorname', ';Wurst;Hans'].join('\n');
  function getDefaultPlanModeLabel() {
    return getActiveTab() === TAB_RANDOM_PICKER ? 'Picker' : 'Gruppen';
  }

  function getDefaultPlanBaseName() {
    const modeLabel = getDefaultPlanModeLabel();
    const pickerBinding = isRandomPickerTabActive()
      ? getGradeRosterCoordinator()?.getPickerBinding?.()
      : null;
    if (pickerBinding?.courseName) {
      return `${pickerBinding.courseName} (${modeLabel})`;
    }
    const { csvName } = getClassroomState().getState();
    return csvName ? `${csvName} (${modeLabel})` : modeLabel;
  }

  function getSuggestedPlanFileName() {
    return sanitizeExportFileName(getDefaultPlanBaseName());
  }

  function downloadCsvTemplate() {
    if (getClassroomState().isDemoActive()) {
      showMessage('Demo: Downloads sind für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const blob = new Blob([TEMPLATE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, TEMPLATE_CSV_NAME, {
      defaultName: TEMPLATE_CSV_NAME,
      cleanupDelay: isIOSDevice ? 6000 : 2500,
      onErrorMessage: 'CSV-Download konnte nicht gestartet werden:',
    });
  }

  async function downloadSeatPlan() {
    if (getClassroomState().isDemoActive()) {
      showMessage('Demo: Speichern und Exportieren ist für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const groupsPlanState = getGroupsController()?.getPlanState();
    if (!groupsPlanState) return;
    const classroom = getClassroomState().getState();
    const pickerBinding = isRandomPickerTabActive()
      ? getGradeRosterCoordinator()?.getPickerBinding?.()
      : null;
    const rosterStudents = pickerBinding
      ? getGradeRosterCoordinator().getPickerStudents(classroom.students)
      : classroom.students;
    const rosterName = pickerBinding?.courseName || classroom.csvName || '';
    const autoDisableSelected = isRandomPickerTabActive()
      ? getGradeRosterCoordinator().getPickerAutoDisableSelected(getAutoDisableSelected())
      : getAutoDisableSelected();
    const snapshot = createPlanSnapshot({
      generatedAt: new Date().toISOString(),
      roster: {
        students: rosterStudents,
        headers: classroom.headers,
        delimiter: classroom.delim,
        csvName: rosterName,
      },
      groups: groupsPlanState,
      randomPicker: {
        autoDisableSelected,
      },
      workPhase: getWorkPhaseController()?.getPlanState(),
    });
    if (!snapshot) return;
    const defaultName = getSuggestedPlanFileName();
    let nameInput = defaultName;
    if (!isIOSDevice) {
      if (!shellActionDialog) return;
      const promptLabel = getActiveTab() === TAB_RANDOM_PICKER
        ? 'Bitte gib einen Dateinamen für den Pickerstand ein:'
        : 'Bitte gib einen Dateinamen ein:';
      const desiredName = await shellActionDialog.prompt({
        title: 'Dateiname festlegen',
        message: promptLabel,
        inputLabel: 'Dateiname',
        defaultValue: defaultName,
        confirmText: 'Speichern',
      });
      if (desiredName === null) return;
      nameInput = desiredName || '';
    }
    const safeName = sanitizeExportFileName(nameInput) || defaultName;
    const saveResult = await savePlan(snapshot, {
      filename: safeName,
      fallbackName: getDefaultPlanModeLabel(),
      directoryHandle: state.lastDirectoryHandle,
      pickerDescription: `${getDefaultPlanModeLabel()} JSON`,
      cleanupDelay: isIOSDevice ? 4000 : 1200,
    });
    if (saveResult.status === 'aborted') {
      return;
    }
    if (saveResult.handle) {
      state.lastDirectoryHandle = saveResult.handle;
    }
    const savedMode = isRandomPickerTabActive() ? 'Picker' : 'Gruppen';
    showMessage(`Man kann ${savedMode === 'Picker' ? 'den Picker' : 'die Gruppen'} NICHT durch Anklicken der eben erstellten Datenbankdatei öffnen.\n\nStattdessen muss man die Datenbankdatei hier in TeachHelper über „${savedMode} laden“ auswählen oder sie irgendwo in TeachHelper ziehen.`, 'info');
  }

  async function choosePickerSaveTarget() {
    const binding = getGradeRosterCoordinator()?.getPickerBinding?.();
    if (!binding) return 'file';
    if (!shellActionDialog?.choose) {
      showMessage('Der Dialog zum Speichern steht nicht zur Verfügung.', 'error');
      return '';
    }
    return shellActionDialog.choose({
      title: 'Picker speichern',
      message: `Pickerstand für „${binding.courseName}“ im Notenmodul oder als separate Datei speichern?`,
      secondaryText: 'Separate Picker-Datei',
      secondaryValue: 'file',
      confirmText: 'Im Notenmodul',
      confirmValue: 'grades',
      cancelValue: '',
    });
  }

  async function savePickerInGradeModule() {
    const result = await getGradeRosterCoordinator()?.savePickerConfig?.();
    return result?.ok === true;
  }

  async function handlePickerSaveClick() {
    const target = await choosePickerSaveTarget();
    if (target === 'grades') {
      await savePickerInGradeModule();
      return;
    }
    if (target === 'file') await downloadSeatPlan();
  }

  async function confirmPickerBindingReplacement(binding = null) {
    if (!shellActionDialog?.choose) {
      showMessage('Der Dialog für ungesicherte Picker-Änderungen steht nicht zur Verfügung.', 'error');
      return false;
    }
    const courseReference = binding?.courseName
      ? `„${String(binding.courseName)}“`
      : 'den verbundenen Kurs';
    const choice = await shellActionDialog.choose({
      title: 'Ungesicherte Picker-Änderungen',
      message: `Der Pickerstand für ${courseReference} wurde noch nicht im Notenmodul gespeichert.`,
      secondaryText: 'Änderungen verwerfen',
      secondaryValue: 'discard',
      secondaryDanger: true,
      confirmText: 'Im Notenmodul speichern',
      confirmValue: 'save',
      cancelValue: '',
    });
    if (choice === 'save') {
      const saved = await savePickerInGradeModule();
      if (!saved) return false;
      if (!getGradeRosterCoordinator()?.hasUnsavedPickerConfig?.()) return true;
      showMessage('Der Picker wurde während des Speicherns erneut geändert. Bitte speichere den aktuellen Stand noch einmal.', 'warn');
      return false;
    }
    return choice === 'discard';
  }

  function applyPlan(plan, options = {}) {
    const restoreSeatAssignments = options.restoreSeatAssignments !== false;
    if (!plan || typeof plan !== 'object') throw new Error('Ungültiges Plan-Format.');
    const rosterPlanState = plan.roster && typeof plan.roster === 'object' ? plan.roster : {};
    const groupsPlanState = plan.groups && typeof plan.groups === 'object' ? plan.groups : {};
    const randomPickerPlanState = plan.randomPicker && typeof plan.randomPicker === 'object'
      ? plan.randomPicker
      : {};
    const workPhasePlanState = plan.workPhase && typeof plan.workPhase === 'object'
      ? plan.workPhase
      : {};
    const incomingStudents = Array.isArray(rosterPlanState.students) ? rosterPlanState.students : [];
    const incomingCsvName = typeof rosterPlanState.csvName === 'string' ? rosterPlanState.csvName : '';
    getClassroomState().updateState({
      performanceFlairCount: clampPerformanceFlairCount(groupsPlanState.performanceFlairCount, 4),
    });
    setAutoDisableSelected(normalizeRandomPickerAutoDisableSelected(
      randomPickerPlanState.autoDisableSelected
    ));
    const normalizedCsvName = sanitizeExportFileName(incomingCsvName);
    getClassroomState().updateState({
      students: incomingStudents.map(student => sanitizeRandomPickerStudent(student)),
      headers: Array.isArray(rosterPlanState.headers) ? rosterPlanState.headers : [],
      delim: typeof rosterPlanState.delimiter === 'string' ? rosterPlanState.delimiter : ',',
      csvName: normalizedCsvName || getClassroomState().getState().csvName || '',
    });
    getGroupsController()?.restorePlanState(groupsPlanState, { restoreSeatAssignments });
    getWorkPhaseController()?.restorePlanState(workPhasePlanState);
    if (!restoreSeatAssignments) {
      els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    }
    renderRandomPicker();
  }

  async function importPlanFromFile(file, handle) {
    if (getClassroomState().isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    const planLabelFromFile = sanitizeExportFileName(stripFileExtension(file.name || ''));
    const plan = await loadPlan(file);
    const replacesPickerBinding = isRandomPickerTabActive()
      && Boolean(getGradeRosterCoordinator()?.getPickerBinding?.());
    if (replacesPickerBinding && !await getGradeRosterCoordinator().confirmPickerBindingReplacement()) {
      return false;
    }
    if (replacesPickerBinding) getGradeRosterCoordinator().clearPickerBinding();
    if (handle) {
      state.lastDirectoryHandle = handle;
    }
    applyPlan(plan, { restoreSeatAssignments: true });
    const importedLabel = typeof plan?.roster?.csvName === 'string' ? plan.roster.csvName.trim() : '';
    if (!importedLabel) {
      getClassroomState().updateState({
        csvName: planLabelFromFile || getClassroomState().getState().csvName,
      });
    }
    return true;
  }

  function splitCombinedStudentName(value) {
    const combined = normalizeCsvCell(value);
    if (!combined) return { first: '', last: '' };
    if (combined.includes(',')) {
      const [last, first] = combined.split(',');
      return {
        first: normalizeCsvCell(first),
        last: normalizeCsvCell(last),
      };
    }
    const parts = combined.split(/\s+/).filter(Boolean);
    return {
      first: normalizeCsvCell(parts.shift() || ''),
      last: normalizeCsvCell(parts.join(' ')),
    };
  }

  function resolveStudentColumnIndexes(headers, rows) {
    const normalizedHeaders = Array.isArray(headers) ? headers.map(normalizeCsvHeader) : [];
    const findIndex = aliases => normalizedHeaders.findIndex(cell => aliases.includes(cell));
    const lastIndex = findIndex(['nachname', 'name', 'surname', 'last', 'lastname', 'familienname']);
    const firstIndex = findIndex(['vorname', 'firstname', 'first', 'givenname', 'rufname']);
    const combinedIndex = findIndex(['schüler', 'schueler', 'schülername', 'schuelername', 'student', 'lernende', 'lernender']);
    if (lastIndex >= 0 || firstIndex >= 0 || combinedIndex >= 0) {
      return { lastIndex, firstIndex, combinedIndex };
    }
    const sampleRow = Array.isArray(rows)
      ? rows.find(row => Array.isArray(row) && row.some(cell => normalizeCsvCell(cell)))
      : null;
    const fallbackOffset = normalizedHeaders[0] === '' && normalizedHeaders.length >= 3 ? 1 : 0;
    if (sampleRow && sampleRow.length >= fallbackOffset + 2) {
      return { lastIndex: fallbackOffset, firstIndex: fallbackOffset + 1, combinedIndex: -1 };
    }
    if (sampleRow && sampleRow.length >= 3) {
      return { lastIndex: 1, firstIndex: 2, combinedIndex: -1 };
    }
    return { lastIndex: 0, firstIndex: 1, combinedIndex: -1 };
  }

  function readStudents(rows, headers = []) {
    const { lastIndex, firstIndex, combinedIndex } = resolveStudentColumnIndexes(headers, rows);
    const students = [];
    for (const r of rows) {
      let first = '';
      let last = '';
      if (lastIndex >= 0 || firstIndex >= 0) {
        last = normalizeCsvCell(r?.[lastIndex] || '');
        first = normalizeCsvCell(r?.[firstIndex] || '');
      }
      if ((!last && !first) && combinedIndex >= 0) {
        const parsed = splitCombinedStudentName(r?.[combinedIndex] || '');
        first = parsed.first;
        last = parsed.last;
      }
      if (last || first) {
        const id = String(students.length + 1).padStart(2, '0');
        students.push({
          id,
          first,
          last,
          performanceFlair: '',
          buddies: [],
          foes: [],
          randomWeight: RANDOM_PICKER_DEFAULT_WEIGHT
        });
      }
    }
    return students;
  }

  function updateCsvStatusDisplay() {
    if (!els.csvStatus) return;
    const label = String(getClassroomState().getState().csvName || '').trim();
    renderCsvStatus(label);
  }

  function renderCsvStatus(label = '') {
    if (!els.csvStatus) return;
    const normalizedLabel = String(label || '').trim();
    els.csvStatus.replaceChildren();
    els.csvStatus.classList.toggle('empty-state-box', !normalizedLabel);
    if (normalizedLabel) {
      els.csvStatus.textContent = normalizedLabel;
      return;
    }
    const title = document.createElement('span');
    title.className = 'empty-state-title';
    title.textContent = 'Noch keine Datei';
    const copy = document.createElement('span');
    copy.className = 'empty-state-copy';
    copy.textContent = 'Importiere eine Namensliste, um loszulegen.';
    els.csvStatus.append(title, copy);
  }
  async function importCsvFromFile(file) {
    if (getClassroomState().isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    assertFileSizeAtMost(file, FILE_LIMITS.CSV_BYTES, 'CSV-Datei');
    const guessedLabel = sanitizeExportFileName(stripFileExtension(file.name));
    const text = await file.text();
    const parsedCsv = parseCSV(text);
    let rows = parsedCsv.rows;
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn', { presentation: 'toast' }); return; }
    const isSeparatorRow = (row) => {
      if (!Array.isArray(row)) return false;
      const normalized = row
        .map(val => String(val ?? '').trim())
        .join('')
        .toLowerCase();
      return /^sep\s*=/.test(normalized);
    };
    rows = rows.filter(row => !isSeparatorRow(row));
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn', { presentation: 'toast' }); return; }
    const firstNonEmptyIdx = rows.findIndex(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
    if (firstNonEmptyIdx === -1) { showMessage('Nur leere Zeilen gefunden.', 'warn', { presentation: 'toast' }); return; }

    const headers = rows[firstNonEmptyIdx] || [];
    const dataStartIdx = firstNonEmptyIdx + 1;
    const dataRows = rows.slice(dataStartIdx);
    const students = readStudents(dataRows, headers);
    const replacesPickerBinding = isRandomPickerTabActive()
      && Boolean(getGradeRosterCoordinator()?.getPickerBinding?.());
    if (replacesPickerBinding && !await getGradeRosterCoordinator().confirmPickerBindingReplacement()) {
      return;
    }
    if (replacesPickerBinding) getGradeRosterCoordinator().clearPickerBinding();
    getClassroomState().updateState({
      headers,
      delim: parsedCsv.delimiter,
      csvName: guessedLabel || getClassroomState().getState().csvName,
      performanceFlairCount: 4,
      students,
    });
    updateCsvStatusDisplay();
    getWorkPhaseController()?.reset();
    getGroupsController()?.handleRosterReplacement({ rebuildCapacity: true });

    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    renderRandomPicker();
    getClassroomState().sync();
    const importedCount = students.length;
    const importedLabel = importedCount === 1 ? 'Name' : 'Namen';
    showMessage(`${importedCount} ${importedLabel} importiert.`, 'success', { presentation: 'toast' });
  }

  async function handlePlanImportAction() {
    if (getClassroomState().isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    const picked = await pickPlanFile({ directoryHandle: state.lastDirectoryHandle });
    if (picked && picked.file) {
      try {
        await importPlanFromFile(picked.file, picked.handle);
        return;
      } catch (err) {
        reportAppError(err, err?.message || 'Gruppen konnten nicht geladen werden.', {
          scope: 'plan-import',
          source: 'file-picker',
        });
        return;
      }
    }
    if (picked?.aborted) {
      return;
    }
    if (!picked || picked.supported === false) {
      els.importPlanFile?.click();
    }
  }

  function bindInputs() {
    bindRuntime(els.templateLink, 'click', (e) => {
      e.preventDefault();
      downloadCsvTemplate();
    });

    bindRuntime(els.file, 'change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) {
        getClassroomState().updateState({ csvName: '' });
        updateCsvStatusDisplay();
        return;
      }
      try {
        await importCsvFromFile(f);
      } catch (err) {
        reportAppError(err, err?.message || 'Namensliste konnte nicht geladen werden.', {
          scope: 'csv-import',
          source: 'file-input',
        });
      }
    });

    const isEventInsideCsvDropZone = (event) => {
      const target = event?.target;
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('#csv-drop-zone'));
    };
    const isEventInsideMergerDropZone = (event) => {
      const target = event?.target;
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('#merger-host'));
    };

    if (els.csvDropZone) {
      let csvDragDepth = 0;
      const clearCsvDragState = () => {
        csvDragDepth = 0;
        els.csvDropZone.classList.remove('drag-over-file');
      };
      bindRuntime(els.csvDropZone, 'dragenter', (e) => {
        if (!dataTransferHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        csvDragDepth += 1;
        els.csvDropZone.classList.add('drag-over-file');
      });
      bindRuntime(els.csvDropZone, 'dragover', (e) => {
        if (!dataTransferHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        els.csvDropZone.classList.add('drag-over-file');
      });
      bindRuntime(els.csvDropZone, 'dragleave', (e) => {
        e.preventDefault();
        csvDragDepth = Math.max(0, csvDragDepth - 1);
        if (csvDragDepth === 0) {
          els.csvDropZone.classList.remove('drag-over-file');
        }
      });
      bindRuntime(els.csvDropZone, 'drop', async (e) => {
        if (!dataTransferHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        clearCsvDragState();
        const droppedFiles = Array.from(e.dataTransfer?.files || []);
        const csvFile = droppedFiles.find(isCsvFile);
        if (!csvFile) {
          showMessage('Bitte hier eine CSV-Datei ablegen.', 'warn', { presentation: 'toast' });
          return;
        }
        try {
          await importCsvFromFile(csvFile);
        } catch (err) {
          reportAppError(err, err?.message || 'Namensliste konnte nicht geladen werden.', {
            scope: 'csv-import',
            source: 'drop-zone',
          });
        }
      });
      bindRuntime(document, 'drop', clearCsvDragState);
      bindRuntime(document, 'dragend', clearCsvDragState);
    }

    bindRuntime(document, 'dragover', (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      if (isEventInsideCsvDropZone(e)) return;
      if (isEventInsideMergerDropZone(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    bindRuntime(document, 'drop', async (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      if (isEventInsideCsvDropZone(e)) return;
      if (isEventInsideMergerDropZone(e)) return;
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      const jsonFile = droppedFiles.find(isJsonFile);
      if (!jsonFile) {
        const csvFile = droppedFiles.find(isCsvFile);
        if (csvFile) {
          showMessage('CSV bitte im Feld „Namensliste auswählen“ ablegen.', 'warn', { presentation: 'toast' });
        } else {
          showMessage('Hier können nur Gruppen als JSON geladen werden.', 'warn', { presentation: 'toast' });
        }
        return;
      }
      try {
        await importPlanFromFile(jsonFile);
      } catch (err) {
        reportAppError(err, err?.message || 'Gruppen konnten nicht geladen werden.', {
          scope: 'plan-import',
          source: 'document-drop',
        });
      }
    });
  }

  return {
    bindInputs,
    getSuggestedPlanFileName,
    handlePlanImportAction,
    importPlanFromFile,
    downloadSeatPlan,
    handlePickerSaveClick,
    confirmPickerBindingReplacement,
    updateCsvStatusDisplay,
  };
}
