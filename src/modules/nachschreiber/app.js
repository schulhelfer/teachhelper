import { assertFileSizeAtMost, FILE_LIMITS, readFileArrayBufferWithTimeout } from '../../shared/file-guards.js';
import { dataTransferHasFiles, isCsvFile } from '../../shared/file-io.js';
import { NACHSCHREIBER_DEFAULT_SENDER_SETTING } from '../../shared/school-data/defaults.js';
import { WORKSPACE_STATE_EVENT } from '../../shared/school-data/messages.js';
import { NACHSCHREIBER_DRAFT_SETTING, normalizeNachschreiberDraft, normalizeNachschreiberSenderName } from '../../shared/school-data/nachschreiber-draft.js';
import { mountDateCalendar } from './date-calendar.js';
import { readPdfExamSchedule } from './pdf-schedule.js';
import { getUsableLessonTimes, mergeExamSchedules, parseExamSchedule, rankExamSuggestions } from './schedule.js';

const germanListFormat = new Intl.ListFormat('de');
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function formatTime(time) {
  return time.endsWith(':00') ? time.slice(0, 5) : time;
}

function formatLessons(lessons) {
  return `${germanListFormat.format(lessons.map((number) => `${number}.`))} Stunde`;
}

function formatLessonNumbers(lessons) {
  const consecutive = lessons.every((lesson, index) => index === 0 || lesson === lessons[index - 1] + 1);
  return consecutive && lessons.length > 1 ? `${lessons[0]}–${lessons.at(-1)}` : lessons.join(', ');
}

function formatLessonPhrase(lessons) {
  return lessons.length ? formatLessons(lessons) : '[XXX]. Stunde';
}

function buildTeacherNotice(date, { makeupLessons }, studentClass, studentName, { firstName }) {
  return [
    'Hallo [Lehrkraftname],',
    `am ${date}, würde ich gerne ${studentName} (${studentClass}) in der ${formatLessonPhrase(makeupLessons)} eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    `Da der Nachschreibtermin in Deinen Unterricht fällt, möchte ich Dich fragen, ob Du damit einverstanden wärst, dass ${studentName} in dieser Stunde die Arbeit nachschreibt.`,
    'Viele Grüße',
    firstName || '[Vorname]',
  ].join('\n');
}

function buildSupervisionRequest(date, { teacher, groups, makeupLessons, source }, students, { firstName: senderFirstName }) {
  const firstName = teacher.split(/\s+/, 1)[0] || '[Lehrkraftname]';
  const group = source === 'pdf' ? `Deinem Kurs „${groups}“, für den` : `Deiner Lerngruppe „${groups}“, für die`;
  const multiple = students.length > 1;
  const studentList = germanListFormat.format(students.map(({ name, studentClass }, index) => {
    const label = name || (multiple ? `[Prüflingsname ${index + 1}]` : '[Prüflingsname]');
    return `${label} (${studentClass})`;
  }));
  const work = multiple ? 'versäumte schriftliche Arbeiten' : 'eine versäumte schriftliche Arbeit';
  const action = multiple ? 'ihre Arbeiten nachschreiben' : 'die Arbeit nachschreibt';
  return [
    `Hallo ${firstName},`,
    `am ${date}, würde ich gerne in der ${formatLessonPhrase(makeupLessons)} ${work} nachschreiben lassen.`,
    `Wäre es möglich, dass ${studentList} unter Deiner Aufsicht zusammen mit ${group} Du zu diesem Termin eine schriftliche Arbeit angesetzt hast, ${action}?`,
    'Viele Grüße',
    senderFirstName || '[Vorname]',
  ].join('\n');
}

function buildStudentNotice(date, { teacher, makeupLessons, fullyCoveredByFreePeriods }, studentName, { firstName, lastName }) {
  const teacherLastName = teacher.replace(/^\S+\s*/, '') || '[Nachname der Lehrkraft]';
  const signature = [firstName, lastName].filter(Boolean).join(' ') || '[Absender]';
  const lesson = makeupLessons.length ? formatLessons(makeupLessons) : '[Stunde]';
  const paragraphs = [
    `Hallo ${studentName},`,
    'hoffentlich geht es Dir bald wieder besser!',
    `Für das Nachschreiben Deiner versäumten schriftlichen Arbeit habe ich Dich für einen Termin angemeldet, an dem die Lehrkraft ${teacherLastName} bereits eine schriftliche Arbeit in einer anderen Lerngruppe durchführt. Du erhältst dort Deine Arbeit und schreibst diese unter der Aufsicht der Lehrkraft nach.`,
  ];
  if (!fullyCoveredByFreePeriods) {
    paragraphs.push('Die Lehrkraft, bei der Du zu diesem Zeitpunkt regulär Unterricht hättest, habe ich bereits informiert. Dennoch würde ich Dich bitten, sie auch selbst über Deinen Nachschreibtermin in Kenntnis zu setzen.');
  }
  paragraphs.push(
    `Dein Nachschreibtermin:\n\n- Datum: ${date}\n- Raum: [XXX]\n- Zeit: ${lesson}`,
    'Bitte denk daran, dass Du in der Sekundarstufe I (Jahrgänge 5–10) eine schriftliche Entschuldigung bzw. in der Sekundarstufe II (Jahrgänge 11–13) eine ärztliche Bescheinigung vorlegen musst, um nachschreiben zu können.',
    `Viele Grüße\n${signature}`,
  );
  return paragraphs.join('\n\n');
}

export function mountNachschreiber(root, { sidebar, getLessonTimes = () => [], getWorkspace = () => null }) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const settingsTrigger = sidebar.querySelector('#nachschreiber-settings-trigger');
  const fileInput = sidebar.querySelector('#nachschreiber-file');
  const upload = sidebar.querySelector('#nachschreiber-drop-zone');
  const importStatus = sidebar.querySelector('#nachschreiber-csv-status');
  const sourceList = sidebar.querySelector('#nachschreiber-file-list');
  const importErrors = sidebar.querySelector('#nachschreiber-file-errors');
  const iservPrefix = sidebar.querySelector('#nachschreiber-iserv-prefix');
  const iservLink = sidebar.querySelector('#nachschreiber-iserv-link');
  const iservLinkHint = sidebar.querySelector('#nachschreiber-iserv-link-hint');
  const form = sidebar.querySelector('#nachschreiber-form');
  const studentList = sidebar.querySelector('#nachschreiber-student-list');
  const studentTemplate = studentList.firstElementChild.cloneNode(true);
  const addStudent = sidebar.querySelector('#nachschreiber-add-student');
  const senderFirstName = sidebar.querySelector('#nachschreiber-sender-first-name');
  const senderLastName = sidebar.querySelector('#nachschreiber-sender-last-name');
  const periodTemplate = sidebar.querySelector('#nachschreiber-period-row');
  const addPeriod = sidebar.querySelector('#nachschreiber-add-period');
  const periodHint = sidebar.querySelector('#nachschreiber-period-hint');
  const periodList = sidebar.querySelector('#nachschreiber-period-list');
  const duration = sidebar.querySelector('#nachschreiber-duration');
  const submit = sidebar.querySelector('#nachschreiber-submit');
  const clear = sidebar.querySelector('#nachschreiber-clear');
  const save = sidebar.querySelector('#nachschreiber-save');
  const saveError = sidebar.querySelector('#nachschreiber-save-error');
  const clearDialog = root.querySelector('#nachschreiber-clear-dialog');
  const resultStatus = root.querySelector('#nachschreiber-result-status');
  const results = root.querySelector('#nachschreiber-results');
  const resultRows = root.querySelector('#nachschreiber-result-rows');
  const ownExamCount = root.querySelector('#nachschreiber-own-exam-count');
  const ownExamCountLabel = ownExamCount.textContent;
  const settingsDialog = root.querySelector('#nachschreiber-settings-dialog');
  const settingsForm = settingsDialog.querySelector('form');
  const defaultSenderFirstName = settingsDialog.querySelector('#nachschreiber-default-sender-first-name');
  const defaultSenderLastName = settingsDialog.querySelector('#nachschreiber-default-sender-last-name');
  const settingsDatabaseHint = settingsDialog.querySelector('#nachschreiber-settings-database-hint');
  const settingsError = settingsDialog.querySelector('#nachschreiber-settings-error');
  const settingsCancel = settingsDialog.querySelector('#nachschreiber-settings-cancel');
  const settingsSave = settingsDialog.querySelector('#nachschreiber-settings-save');
  const noticeDialog = root.querySelector('#nachschreiber-notice-dialog');
  const noticeTitle = root.querySelector('#nachschreiber-notice-title');
  const noticeStudentField = root.querySelector('#nachschreiber-notice-student-field');
  const noticeStudent = root.querySelector('#nachschreiber-notice-student');
  const noticeStudentPlaceholder = noticeStudent.options[0];
  const noticeText = root.querySelector('#nachschreiber-notice-text');
  const noticeStatus = root.querySelector('#nachschreiber-notice-status');
  const noticeClose = root.querySelector('#nachschreiber-notice-close');
  const noticeCopy = root.querySelector('#nachschreiber-notice-copy');
  const controller = new AbortController();
  const { signal } = controller;
  const periodRows = new Map();
  const examSources = new Map();
  const pendingFiles = [];
  const noticeBuilders = new WeakMap();
  let lessonTimes = [];
  let lessonTimesSignature = '';
  let periodRowId = 0;
  let studentRowId = 0;
  let exams = [];
  let hasPdfTimingNotes = false;
  let importController = null;
  let noticeCopyId = 0;
  let noticeSelection = null;
  let savingSenderSettings = false;
  let currentResult = null;
  let draftContext = null;
  let draftTimer = 0;
  let draftPending = false;
  let restoringDraft = false;
  let manualSave = null;
  let manualSaveError = '';
  const { startDate, endDate, updateDateBounds, close: closeDateCalendar } = mountDateCalendar(root, sidebar, {
    signal, onDateChange: clearResults,
  });

  function readDraft() {
    return {
      students: readStudents(), freePeriods: readFreePeriods(), result: currentResult,
      duration: duration.value, startDate: startDate.value, endDate: endDate.value,
      iservPrefix: iservPrefix.value, sender: readSenderName(),
    };
  }

  function renderDraftControls(session) {
    save.hidden = !session?.manual;
    save.disabled = !session?.ready || (manualSave !== null && manualSave === draftContext)
      || !(draftPending || session.dirty || manualSaveError);
    const message = manualSaveError || session?.error || '';
    if (saveError.textContent !== message) saveError.textContent = message;
    saveError.hidden = !message;
  }

  function stopDraftTimer() {
    view.clearTimeout(draftTimer);
    draftTimer = 0;
  }

  function persistDraft() {
    stopDraftTimer();
    const context = draftContext;
    if (!draftPending || !context || restoringDraft) return;
    const { workspace, generation } = context;
    if (workspace !== getWorkspace()) return;
    draftPending = false;
    const updated = workspace.operations.updateNachschreiberDraft(generation, readDraft());
    if (draftContext !== context) return;
    draftPending = !updated;
    renderDraftControls(workspace.operations.getNachschreiberWorkSession());
  }

  function draftChanged({ typing = false } = {}) {
    if (restoringDraft || !draftContext) return;
    draftPending = true;
    if (!typing) {
      persistDraft();
      return;
    }
    stopDraftTimer();
    draftTimer = view.setTimeout(persistDraft, 300);
    renderDraftControls(draftContext.workspace.operations.getNachschreiberWorkSession());
  }

  function setDraft(draft) {
    restoringDraft = true;
    try {
      closeDateCalendar();
      if (noticeDialog.open) closeNoticeDialog();
      clearExamSources();
      periodRows.clear();
      periodList.replaceChildren();
      periodList.hidden = true;
      studentList.replaceChildren();
      studentRowId = 0;
      for (const student of draft?.students || []) appendStudentRow(student);
      if (!studentList.children.length) appendStudentRow();
      updateStudentRemoveButtons();

      duration.value = draft?.duration ?? '1';
      startDate.value = draft?.startDate ?? '';
      endDate.value = draft?.endDate ?? '';
      iservPrefix.value = draft?.iservPrefix ?? '';
      senderFirstName.value = draft?.sender.firstName ?? '';
      senderLastName.value = draft?.sender.lastName ?? '';
      refreshSenderPlaceholders();
      updateDateBounds();
      updateIservLink();
      refreshLessonTimes();
      for (const period of draft?.freePeriods || []) appendPeriodRow(period);
      sortPeriodRows();

      currentResult = draft?.result ?? null;
      if (currentResult) renderSuggestions(currentResult);
      else clearResults();
    } finally {
      restoringDraft = false;
    }
  }

  function refreshDraftWorkspace() {
    const workspace = getWorkspace();
    const session = workspace?.operations?.getNachschreiberWorkSession?.();
    refreshSenderSettings(workspace);
    if (session && !session.ready) {
      renderDraftControls(session);
      return;
    }
    if ((draftContext || session)
      && (draftContext?.workspace !== workspace || draftContext?.generation !== session?.generation)) {
      stopDraftTimer();
      draftPending = false;
      manualSaveError = '';
      draftContext = session ? { workspace, generation: session.generation } : null;
      if (clearDialog.open) clearDialog.close('cancel');
      if (settingsDialog.open) settingsDialog.close();
      const saved = session ? workspace.data.getSetting(NACHSCHREIBER_DRAFT_SETTING) : null;
      setDraft(normalizeNachschreiberDraft(saved));
    }
    refreshLessonTimes();
    if (draftPending && !draftTimer) persistDraft();
    renderDraftControls(workspace?.operations?.getNachschreiberWorkSession?.());
  }

  async function saveDraftManually() {
    if (!draftContext || save.disabled) return;
    persistDraft();
    const context = draftContext;
    if (!context || draftPending) return;
    const { workspace, generation } = context;
    manualSave = context;
    manualSaveError = '';
    renderDraftControls(workspace.operations.getNachschreiberWorkSession());
    try {
      if (!await workspace.operations.saveManualNachschreiberDraft(generation)) {
        throw new Error('Die Datenbankdatei konnte nicht gespeichert werden.');
      }
    } catch (error) {
      if (draftContext === context) manualSaveError = error?.message || 'Die Datenbankdatei konnte nicht gespeichert werden.';
    } finally {
      if (manualSave === context) manualSave = null;
      if (!signal.aborted) refreshDraftWorkspace();
    }
  }

  function readDefaultSenderName(workspace = getWorkspace()) {
    const name = workspace?.data?.getSetting?.(NACHSCHREIBER_DEFAULT_SENDER_SETTING);
    return normalizeNachschreiberSenderName(name);
  }

  function readSenderName() {
    return normalizeNachschreiberSenderName({ firstName: senderFirstName.value, lastName: senderLastName.value });
  }

  function canEditSenderSettings(workspace) {
    return Boolean(workspace?.isReady?.()
      && workspace.operations?.hasShellDatabaseConnection?.()
      && typeof workspace.data?.getSetting === 'function'
      && typeof workspace.operations.saveNachschreiberDefaultSenderName === 'function');
  }

  function refreshSenderPlaceholders(workspace = getWorkspace()) {
    const own = readSenderName();
    const defaultName = readDefaultSenderName(workspace);
    const useDefault = !own.firstName && !own.lastName;
    senderFirstName.placeholder = useDefault ? defaultName.firstName : '';
    senderLastName.placeholder = useDefault ? defaultName.lastName : '';
  }

  function refreshSenderSettings(workspace = getWorkspace()) {
    refreshSenderPlaceholders(workspace);
    const canEdit = canEditSenderSettings(workspace);
    settingsDatabaseHint.hidden = canEdit;
    const disabled = !canEdit || savingSenderSettings;
    defaultSenderFirstName.disabled = disabled;
    defaultSenderLastName.disabled = disabled;
    settingsSave.disabled = disabled;
    settingsCancel.disabled = savingSenderSettings;
  }

  function openSenderSettings() {
    const workspace = getWorkspace();
    const { firstName, lastName } = readDefaultSenderName(workspace);
    defaultSenderFirstName.value = firstName;
    defaultSenderLastName.value = lastName;
    const persistence = workspace?.getSnapshot?.()?.persistence;
    settingsError.textContent = persistence?.statusError ? persistence.statusText : '';
    settingsError.hidden = !settingsError.textContent;
    refreshSenderSettings(workspace);
    settingsTrigger.focus();
    settingsDialog.showModal();
  }

  async function saveSenderSettings(event) {
    event.preventDefault();
    const workspace = getWorkspace();
    if (savingSenderSettings || !canEditSenderSettings(workspace)) return;
    const name = normalizeNachschreiberSenderName({ firstName: defaultSenderFirstName.value, lastName: defaultSenderLastName.value });
    const previousName = readDefaultSenderName(workspace);
    const changed = name.firstName !== previousName.firstName || name.lastName !== previousName.lastName;
    if (!changed && settingsError.hidden) {
      settingsDialog.close();
      return;
    }
    savingSenderSettings = true;
    settingsError.hidden = true;
    refreshSenderSettings(workspace);
    try {
      if (!await workspace.operations.saveNachschreiberDefaultSenderName(name)) {
        throw new Error('Die Datenbankdatei konnte nicht gespeichert werden.');
      }
      settingsDialog.close();
    } catch (error) {
      settingsError.textContent = error?.message || 'Die Datenbankdatei konnte nicht gespeichert werden.';
      settingsError.hidden = false;
    } finally {
      savingSenderSettings = false;
      refreshSenderSettings();
    }
  }

  function updateIservLink() {
    const address = iservPrefix.value.trim();
    const prefix = address.replace(/\.de$/i, '');
    const valid = prefix.length <= 250 && prefix.split('.').every((part) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)
    ));
    iservLink.hidden = !valid;
    iservLinkHint.hidden = !address || valid;
    if (valid) {
      iservLink.href = `https://${prefix}.de/iserv/examplan?filter%5BTyp%5D%5B%5D=1`;
    } else {
      iservLink.removeAttribute('href');
    }
    if (iservLinkHint.hidden) iservPrefix.removeAttribute('aria-invalid');
    else iservPrefix.setAttribute('aria-invalid', 'true');
  }

  function renderImportStatus() {
    const importingFiles = Boolean(importController);
    const empty = !importingFiles && examSources.size === 0;
    submit.disabled = importingFiles || empty;
    importStatus.classList.toggle('empty-state-box', empty);
    if (importingFiles) {
      importStatus.textContent = 'Dateien werden gelesen …';
      return;
    }
    if (!empty) {
      const fileCount = examSources.size === 1 ? '1 Datei' : `${examSources.size} Dateien`;
      const examCount = exams.length === 1 ? '1 Klausur' : `${exams.length} Klausuren`;
      importStatus.textContent = `${fileCount} · ${examCount}`;
      return;
    }
    const title = doc.createElement('span');
    title.className = 'empty-state-title';
    title.textContent = 'Noch keine Datei';
    importStatus.replaceChildren(title);
  }

  function renderResultStatus(...messages) {
    if (hasPdfTimingNotes || currentResult?.hasPdfTimingNotes) messages.push('Mindestens eine PDF enthält zusätzliche Uhrzeithinweise. Für die Vorschläge gelten die Zeiten aus der Planung.');
    const text = messages.filter(Boolean).join(' ');
    if (resultStatus.textContent !== text) resultStatus.textContent = text;
  }

  function clearResults() {
    currentResult = null;
    renderResultStatus();
    resultRows.replaceChildren();
    results.hidden = true;
    ownExamCount.textContent = ownExamCountLabel;
    draftChanged();
  }

  function readStudents() {
    return Array.from(studentList.children, (row) => {
      const year = row.querySelector('.nachschreiber-student-year').value;
      const classLetter = row.querySelector('.nachschreiber-student-class').value;
      return {
        name: row.querySelector('.nachschreiber-student-name').value.trim(),
        year, classLetter, studentClass: `${year}${classLetter}`,
      };
    });
  }

  function updateStudentRemoveButtons() {
    const multiple = studentList.children.length > 1;
    for (const [index, button] of Array.from(studentList.querySelectorAll('.nachschreiber-student-remove')).entries()) {
      button.hidden = !multiple;
      button.setAttribute('aria-label', `Prüfling ${index + 1} entfernen`);
    }
  }

  function appendStudentRow({ name = '', year = '', classLetter = '' } = {}) {
    const row = studentTemplate.cloneNode(true);
    if (studentList.children.length) {
      const suffix = ++studentRowId;
      for (const label of row.querySelectorAll('label')) {
        const control = row.querySelector(`#${label.htmlFor}`);
        control.id = `${control.id}-${suffix}`;
        label.htmlFor = control.id;
      }
    }
    row.querySelector('.nachschreiber-student-name').value = name;
    row.querySelector('.nachschreiber-student-year').value = year;
    row.querySelector('.nachschreiber-student-class').value = classLetter;
    studentList.append(row);
    return row;
  }

  function addStudentRow() {
    const row = appendStudentRow();
    updateStudentRemoveButtons();
    clearResults();
    row.querySelector('.nachschreiber-student-name').focus();
  }

  function createNoticeButton(title, date, buildText, individual = false) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ghost nachschreiber-notice-trigger';
    noticeBuilders.set(button, { buildText, individual });
    button.textContent = title;
    button.setAttribute('aria-label', `${title} für den Termin am ${date}`);
    button.setAttribute('aria-haspopup', 'dialog');
    return button;
  }

  function fitNoticeText() {
    noticeText.style.height = 'auto';
    noticeText.style.height = `${noticeText.scrollHeight + noticeText.offsetHeight - noticeText.clientHeight}px`;
  }

  function resetNoticeCopyFeedback() {
    noticeCopy.textContent = 'Text kopieren';
    noticeCopy.removeAttribute('aria-label');
    noticeStatus.textContent = '';
  }

  function showNoticeText(text, available = true) {
    noticeCopyId += 1;
    resetNoticeCopyFeedback();
    noticeText.value = text;
    noticeText.disabled = !available;
    noticeCopy.disabled = !available;
    if (available && noticeDialog.open) fitNoticeText();
    else noticeText.style.height = '';
  }

  function openNoticeDialog(button, { buildText, individual }) {
    const students = readStudents();
    const own = readSenderName();
    const sender = own.firstName || own.lastName ? own : readDefaultSenderName();
    const needsSelection = individual && students.length > 1;
    noticeTitle.textContent = button.textContent;
    noticeStudentField.hidden = !needsSelection;
    if (needsSelection) {
      noticeSelection = { students, sender, buildText, drafts: new Map(), selected: '' };
      const options = students.map(({ name, studentClass }, index) => {
        const option = doc.createElement('option');
        option.value = String(index);
        option.textContent = `${name || `Prüfling ${index + 1}`} (${studentClass})`;
        return option;
      });
      noticeStudent.replaceChildren(noticeStudentPlaceholder, ...options);
      noticeStudent.value = '';
      showNoticeText('', false);
    } else {
      showNoticeText(buildText(students, sender));
    }
    noticeDialog.showModal();
    if (needsSelection) noticeStudent.focus();
    else fitNoticeText();
  }

  function selectNoticeStudent() {
    if (!noticeSelection) return;
    const { students, sender, buildText, drafts, selected } = noticeSelection;
    if (selected) drafts.set(selected, noticeText.value);
    const key = noticeStudent.value;
    noticeSelection.selected = key;
    if (key === '') showNoticeText('', false);
    else showNoticeText(drafts.get(key) ?? buildText([students[Number(key)]], sender));
  }

  function closeNoticeDialog() {
    noticeDialog.close();
    noticeSelection = null;
    noticeStudentField.hidden = true;
    noticeStudent.replaceChildren(noticeStudentPlaceholder);
    showNoticeText('', false);
  }

  async function copyNoticeText() {
    if (noticeCopy.disabled) return;
    const currentCopy = ++noticeCopyId;
    resetNoticeCopyFeedback();
    let copied = false;
    try {
      const clipboard = doc.defaultView?.navigator.clipboard;
      if (typeof clipboard?.writeText === 'function') {
        await clipboard.writeText(noticeText.value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!noticeDialog.open || currentCopy !== noticeCopyId) return;
    if (copied) {
      noticeCopy.textContent = '✓';
      noticeCopy.setAttribute('aria-label', 'Text kopiert');
      return;
    }
    noticeText.focus();
    noticeText.select();
    noticeStatus.textContent = 'Kopiere den markierten Text manuell.';
  }

  function renderPeriodLessonOptions(row, selectedLesson = row.lesson.value) {
    const options = lessonTimes.map((entry) => {
      const option = doc.createElement('option');
      option.value = entry.lesson;
      option.textContent = entry.lesson;
      return option;
    });
    if (selectedLesson && !options.some((option) => option.value === selectedLesson)) {
      const unavailable = doc.createElement('option');
      unavailable.value = selectedLesson;
      unavailable.textContent = selectedLesson;
      unavailable.setAttribute('aria-label', `${selectedLesson}. Stunde ohne hinterlegte Unterrichtszeit`);
      unavailable.disabled = true;
      options.push(unavailable);
    }
    row.lesson.replaceChildren(row.lesson.options[0], ...options);
    row.lesson.value = selectedLesson;
    row.lesson.disabled = lessonTimes.length === 0;
    row.weekday.disabled = row.lesson.disabled;
  }

  function refreshLessonTimes() {
    const currentTimes = getUsableLessonTimes(getLessonTimes());
    const signature = JSON.stringify(currentTimes);
    if (signature === lessonTimesSignature) return;
    lessonTimes = currentTimes;
    lessonTimesSignature = signature;

    for (const row of periodRows.values()) renderPeriodLessonOptions(row);
    addPeriod.disabled = lessonTimes.length === 0;
    periodHint.hidden = lessonTimes.length > 0;
    periodHint.textContent = lessonTimes.length ? '' : 'Für Freistunden werden hinterlegte Unterrichtszeiten benötigt.';
    refreshPeriodResults();
  }

  function addPeriodRow() {
    const draft = [...periodRows.values()].find((row) => !row.period);
    if (draft) {
      (draft.weekday.value ? draft.lesson : draft.weekday).focus();
      return;
    }
    appendPeriodRow().weekday.focus();
  }

  function appendPeriodRow(period = null) {
    const element = doc.importNode(periodTemplate.content.firstElementChild, true);
    const row = {
      element,
      weekday: element.querySelector('.nachschreiber-period-weekday'),
      lesson: element.querySelector('.nachschreiber-period-lesson'),
      remove: element.querySelector('.nachschreiber-period-delete'),
      error: element.querySelector('.nachschreiber-period-error'),
      period,
    };
    row.error.id = `nachschreiber-period-error-${++periodRowId}`;
    for (const select of [row.weekday, row.lesson]) select.setAttribute('aria-describedby', row.error.id);
    if (period) {
      row.weekday.value = String(period.weekday);
      setPeriodDeleteLabel(row);
    }
    renderPeriodLessonOptions(row, period ? String(period.lesson) : '');
    periodRows.set(element, row);
    periodList.append(element);
    periodList.hidden = false;
    return row;
  }

  function readFreePeriods() {
    return [...periodRows.values()].map((row) => row.period).filter(Boolean);
  }

  function setPeriodDeleteLabel(row) {
    const { weekday, lesson } = row.period;
    row.remove.setAttribute('aria-label', `Freistunde am ${WEEKDAYS[weekday]}, ${lesson}. Stunde löschen`);
  }

  function removePeriodRow(row) {
    const neighbor = periodRows.get(row.element.nextElementSibling) || periodRows.get(row.element.previousElementSibling);
    periodRows.delete(row.element);
    row.element.remove();
    periodList.hidden = periodRows.size === 0;
    if (row.period) refreshPeriodResults();
    const nextControl = neighbor?.weekday.disabled ? neighbor.remove : neighbor?.weekday;
    (nextControl || (addPeriod.disabled ? duration : addPeriod)).focus();
  }

  function setPeriodError(row, message = '') {
    if (row.error.textContent === message) return;
    row.error.textContent = message;
    for (const select of [row.weekday, row.lesson]) {
      if (message) select.setAttribute('aria-invalid', 'true');
      else select.removeAttribute('aria-invalid');
    }
  }

  function sortPeriodRows() {
    const activeElement = doc.activeElement;
    const sorted = [...periodRows.values()].sort((left, right) => (
      (left.period?.weekday ?? 7) - (right.period?.weekday ?? 7)
      || (left.period?.lesson ?? 0) - (right.period?.lesson ?? 0)
    ));
    let position = periodList.firstElementChild;
    for (const { element } of sorted) {
      if (element !== position) periodList.insertBefore(element, position);
      position = element.nextElementSibling;
    }
    if (doc.activeElement !== activeElement && periodList.contains(activeElement)) {
      activeElement.focus({ preventScroll: true });
    }
  }

  function applyPeriodSelection(row) {
    const weekday = Number(row.weekday.value);
    const lesson = Number(row.lesson.value);
    if (!weekday || !lesson || (row.period?.weekday === weekday && row.period.lesson === lesson)) {
      setPeriodError(row);
      return false;
    }
    if (!lessonTimes.some((entry) => entry.lesson === lesson)) {
      setPeriodError(row, 'Für diese Stunde ist keine Unterrichtszeit hinterlegt.');
      return false;
    }
    const duplicate = [...periodRows.values()].some(({ period }) => period?.weekday === weekday && period.lesson === lesson);
    if (duplicate) {
      setPeriodError(row, row.period
        ? 'Diese Freistunde ist bereits eingetragen. Deine bisherige Auswahl gilt weiter.'
        : 'Diese Freistunde ist bereits eingetragen.');
      return false;
    }
    row.period = { weekday, lesson };
    setPeriodError(row);
    setPeriodDeleteLabel(row);
    return true;
  }

  function refreshPeriodResults() {
    let applied;
    do {
      applied = false;
      for (const row of periodRows.values()) {
        if (row.error.textContent && applyPeriodSelection(row)) applied = true;
      }
    } while (applied);
    sortPeriodRows();
    clearResults();
  }

  function refreshExamSources() {
    const sources = [...examSources.values()];
    exams = mergeExamSchedules(sources.map((source) => source.exams));
    hasPdfTimingNotes = sources.some((source) => source.hasTimingNotes);
    sourceList.hidden = sources.length === 0;
    clearResults();
    renderImportStatus();
  }

  function clearExamSources() {
    importController?.abort();
    importController = null;
    pendingFiles.length = 0;
    examSources.clear();
    fileInput.value = '';
    upload.classList.remove('drag-over-file');
    sourceList.replaceChildren();
    importErrors.replaceChildren();
    importErrors.hidden = true;
    refreshExamSources();
  }

  function addExamSource(fileName, source) {
    const row = doc.createElement('li');
    const name = doc.createElement('span');
    name.className = 'nachschreiber-file-name';
    name.textContent = fileName;
    name.title = fileName;
    const remove = doc.createElement('button');
    remove.className = 'danger-action app-action-icon nachschreiber-file-remove';
    remove.type = 'button';
    remove.textContent = '🗑️';
    remove.setAttribute('aria-label', `${fileName} entfernen`);
    remove.title = 'Datei entfernen';
    row.append(name, remove);
    sourceList.append(row);
    examSources.set(row, {
      ...source,
      exams: source.exams.map((exam) => ({ ...exam, fileName })),
    });
    refreshExamSources();
  }

  async function readExamSource(file, signal) {
    if (/\.pdf$/i.test(file.name)) return readPdfExamSchedule(file, { signal });
    if (!isCsvFile(file)) throw new Error('Wähle eine CSV- oder PDF-Datei.');
    assertFileSizeAtMost(file, FILE_LIMITS.CSV_BYTES, 'CSV-Datei');
    const buffer = await readFileArrayBufferWithTimeout(file, { signal });
    signal.throwIfAborted();
    return { exams: parseExamSchedule(decodeCsv(buffer)), hasTimingNotes: false };
  }

  async function importFiles(files) {
    if (!files.length) return;
    for (const file of files) pendingFiles.push(file);
    if (importController) return;
    const batch = new AbortController();
    const { signal } = batch;
    importController = batch;
    importErrors.replaceChildren();
    importErrors.hidden = true;
    renderImportStatus();

    try {
      while (pendingFiles.length && !signal.aborted) {
        const file = pendingFiles.shift();
        const fileName = file.name || 'Klausurenplan';
        try {
          const source = await readExamSource(file, signal);
          signal.throwIfAborted();
          addExamSource(fileName, source);
        } catch (error) {
          if (signal.aborted) return;
          const item = doc.createElement('li');
          item.textContent = `${fileName} — ${error?.message || 'Die Datei konnte nicht gelesen werden.'}`;
          importErrors.append(item);
          importErrors.hidden = false;
        }
      }
    } finally {
      if (importController === batch) {
        importController = null;
        renderImportStatus();
      }
    }
  }

  function showSuggestions(event) {
    event.preventDefault();
    if (importController || !exams.length) return;
    refreshLessonTimes();
    const effectiveStartDate = updateDateBounds();
    if (!form.reportValidity()) return;

    const students = readStudents();
    let missingPdfLessonTimes = false;
    const suggestions = rankExamSuggestions(exams, {
      studentGroups: students.map(({ year, classLetter }) => ({ year, classLetter })),
      startDate: effectiveStartDate,
      endDate: endDate.value,
      requiredLessons: Number(duration.value),
      freePeriods: readFreePeriods(),
      lessonTimes,
      onMissingPdfLessonTimes: () => { missingPdfLessonTimes = true; },
    });
    currentResult = { suggestions, missingPdfLessonTimes, hasPdfTimingNotes };
    renderSuggestions(currentResult);
    draftChanged();
  }

  function renderSuggestions({ suggestions, missingPdfLessonTimes }) {
    const students = readStudents();
    const multipleGroups = new Set(students.map(({ studentClass }) => studentClass)).size > 1;
    ownExamCount.textContent = multipleGroups ? `${ownExamCountLabel} (höchste Anzahl)` : ownExamCountLabel;
    const rows = suggestions.map((exam) => {
      const row = doc.createElement('tr');
      if (exam.fileName) row.title = exam.fileName;
      const weekday = WEEKDAYS[new Date(`${exam.date}T00:00:00Z`).getUTCDay()];
      const calendarDate = exam.date.split('-').reverse().join('.');
      const date = `${weekday}, ${calendarDate}`;
      const dateInSentence = `${weekday}, den ${calendarDate}`;
      const time = exam.makeupLessons.length
        ? formatLessonNumbers(exam.makeupLessons)
        : `${formatTime(exam.startTime)}–${formatTime(exam.endTime)}`;
      row.insertCell().textContent = `${weekday.slice(0, 2)}${date.slice(weekday.length)}`;
      const timeCell = row.insertCell();
      const timeLabel = doc.createElement('span');
      timeLabel.className = 'nachschreiber-result-time';
      timeLabel.textContent = time;
      timeCell.append(timeLabel);
      if (exam.freePeriodLessons.length) {
        const match = doc.createElement('span');
        const labels = exam.freePeriodLessons.map((lesson) => `${lesson}. Stunde`).join(', ');
        match.className = 'nachschreiber-period-match';
        match.textContent = `Überschneidung mit ${exam.freePeriodLessons.length === 1 ? 'Freistunde' : 'Freistunden'} (${labels})`;
        timeCell.append(match);
      }
      for (const value of [exam.title || '–', exam.groups, exam.teacher || '–', exam.ownExamCount ?? '–']) {
        row.insertCell().textContent = value;
      }
      const noticeCell = row.insertCell();
      noticeCell.className = 'nachschreiber-notice-cell';
      noticeCell.append(createNoticeButton('Aufsicht anfragen', date, (recipients, sender) => (
        buildSupervisionRequest(dateInSentence, exam, recipients, sender)
      )));
      if (!exam.fullyCoveredByFreePeriods) {
        noticeCell.append(createNoticeButton('Reguläre Lehrkraft informieren', date, ([student], sender) => (
          buildTeacherNotice(dateInSentence, exam, student.studentClass, student.name || '[Prüflingsname]', sender)
        ), true));
      }
      noticeCell.append(createNoticeButton('Prüfling informieren', date, ([student], sender) => (
        buildStudentNotice(date, exam, student.name || '[Prüflingsname]', sender)
      ), true));
      return row;
    });
    resultRows.replaceChildren(...rows);
    results.hidden = rows.length === 0;
    const emptyMessage = rows.length === 0 ? 'Im gewählten Zeitraum gibt es keine passenden Termine.' : '';
    const rasterMessage = missingPdfLessonTimes ? 'Für einige PDF-Stunden fehlen passende Unterrichtszeiten. Prüfe die Uhrzeiten in der Planung.' : '';
    renderResultStatus(emptyMessage, rasterMessage);
  }

  settingsTrigger.addEventListener('click', openSenderSettings, { signal });
  settingsForm.addEventListener('submit', saveSenderSettings, { signal });
  settingsCancel.addEventListener('click', () => settingsDialog.close(), { signal });
  settingsDialog.addEventListener('cancel', (event) => {
    if (savingSenderSettings) event.preventDefault();
  }, { signal });
  iservPrefix.addEventListener('input', () => {
    updateIservLink();
    draftChanged({ typing: true });
  }, { signal });
  for (const field of [senderFirstName, senderLastName]) {
    field.addEventListener('input', () => {
      refreshSenderPlaceholders();
      draftChanged({ typing: true });
    }, { signal });
  }
  clear.addEventListener('click', () => clearDialog.showModal(), { signal });
  clearDialog.addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'clear') return;
    setDraft(null);
    draftChanged();
  }, { signal });
  save.addEventListener('click', saveDraftManually, { signal });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) void importFiles(fileInput.files);
    fileInput.value = '';
  }, { signal });
  for (const type of ['dragenter', 'dragover']) {
    upload.addEventListener(type, (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      upload.classList.add('drag-over-file');
    }, { signal });
  }
  upload.addEventListener('dragleave', (event) => {
    if (!upload.contains(event.relatedTarget)) upload.classList.remove('drag-over-file');
  }, { signal });
  upload.addEventListener('drop', (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    upload.classList.remove('drag-over-file');
    void importFiles(event.dataTransfer.files);
  }, { signal });
  sourceList.addEventListener('click', (event) => {
    const row = event.target.closest('.nachschreiber-file-remove')?.closest('li');
    if (!examSources.delete(row)) return;
    const neighbor = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    refreshExamSources();
    (neighbor?.querySelector('button') || fileInput).focus();
  }, { signal });
  addStudent.addEventListener('click', addStudentRow, { signal });
  studentList.addEventListener('click', (event) => {
    const row = event.target.closest('.nachschreiber-student-remove')?.closest('.nachschreiber-student-row');
    if (!row || studentList.children.length < 2) return;
    const neighbor = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    updateStudentRemoveButtons();
    clearResults();
    neighbor.querySelector('.nachschreiber-student-name').focus();
  }, { signal });
  studentList.addEventListener('input', (event) => {
    if (event.target.matches('select')) clearResults();
    else draftChanged({ typing: true });
  }, { signal });
  duration.addEventListener('input', clearResults, { signal });
  addPeriod.addEventListener('click', addPeriodRow, { signal });
  periodList.addEventListener('click', (event) => {
    const row = periodRows.get(event.target.closest('.nachschreiber-period-row'));
    if (row && event.target.closest('.nachschreiber-period-delete') === row.remove) removePeriodRow(row);
  }, { signal });
  periodList.addEventListener('change', (event) => {
    const row = periodRows.get(event.target.closest('.nachschreiber-period-row'));
    if (row && applyPeriodSelection(row)) refreshPeriodResults();
  }, { signal });
  periodList.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const row = periodRows.get(event.target.closest('.nachschreiber-period-row'));
    if (!row || (row.period && !row.error.textContent)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!row.period) {
      removePeriodRow(row);
      return;
    }
    row.weekday.value = String(row.period.weekday);
    renderPeriodLessonOptions(row, String(row.period.lesson));
    setPeriodError(row);
  }, { signal });
  resultRows.addEventListener('click', (event) => {
    const button = event.target.closest('button.nachschreiber-notice-trigger');
    const notice = noticeBuilders.get(button);
    if (notice) openNoticeDialog(button, notice);
  }, { signal });
  noticeStudent.addEventListener('change', selectNoticeStudent, { signal });
  noticeClose.addEventListener('click', closeNoticeDialog, { signal });
  noticeCopy.addEventListener('click', copyNoticeText, { signal });
  noticeText.addEventListener('input', () => {
    fitNoticeText();
    noticeCopyId += 1;
    resetNoticeCopyFeedback();
  }, { signal });
  noticeDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeNoticeDialog();
  }, { signal });
  view.addEventListener(WORKSPACE_STATE_EVENT, (event) => {
    if (event.detail?.scope !== 'shell') return;
    refreshDraftWorkspace();
  }, { signal });
  view.addEventListener('beforeunload', (event) => {
    if (!draftPending) return;
    persistDraft();
    if (draftContext?.workspace.operations.getNachschreiberWorkSession()?.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }, { signal });
  form.addEventListener('submit', showSuggestions, { signal });
  updateIservLink();
  renderImportStatus();
  refreshDraftWorkspace();

  return () => {
    persistDraft();
    controller.abort();
    setDraft(null);
    if (clearDialog.open) clearDialog.close('cancel');
    if (settingsDialog.open) settingsDialog.close();
  };
}
