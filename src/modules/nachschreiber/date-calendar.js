import { getIsoWeek, getTomorrowDate } from './schedule.js';

const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });

function formatDate(iso) {
  return iso.split('-').reverse().join('.');
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(date.getUTCDate() + days);
  return result;
}

export function mountDateCalendar(root, sidebar, { signal, onDateChange }) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const fields = ['start', 'end'].map((name) => ({
    input: sidebar.querySelector(`#nachschreiber-${name}-date`),
    trigger: sidebar.querySelector(`#nachschreiber-${name}-calendar`),
    error: sidebar.querySelector(`#nachschreiber-${name}-date-error`),
  }));
  const [start, end] = fields;
  const dialog = root.querySelector('#nachschreiber-date-calendar');
  const prev = dialog.querySelector('#nachschreiber-calendar-prev');
  const next = dialog.querySelector('#nachschreiber-calendar-next');
  const month = dialog.querySelector('#nachschreiber-calendar-month');
  const year = dialog.querySelector('#nachschreiber-calendar-year');
  const grid = dialog.querySelector('#nachschreiber-calendar-grid');
  const clear = dialog.querySelector('#nachschreiber-calendar-clear');
  let activeField;
  let visibleMonth;
  let pointerOnBackdrop = false;

  for (let index = 0; index < 12; index += 1) {
    const option = doc.createElement('option');
    option.value = index;
    option.textContent = monthFormat.format(new Date(Date.UTC(2024, index, 1)));
    month.append(option);
  }

  function updateDateBounds() {
    const tomorrow = getTomorrowDate();
    start.input.min = tomorrow;
    end.input.min = start.input.validity.valid && start.input.value ? start.input.value : tomorrow;
    for (const { input, trigger, error } of fields) {
      trigger.textContent = input.value ? formatDate(input.value) : 'Datum auswählen';
      const invalid = !input.validity.valid;
      if (invalid) {
        trigger.setAttribute('aria-invalid', 'true');
        trigger.setAttribute('aria-describedby', error.id);
        error.textContent = input.validity.rangeUnderflow
          ? `Wähle ein Datum ab dem ${formatDate(input.min)}.`
          : `Wähle ein Datum bis zum ${formatDate(input.max)}.`;
      } else {
        trigger.removeAttribute('aria-invalid');
        trigger.removeAttribute('aria-describedby');
      }
      error.hidden = !invalid;
    }
    return end.input.min;
  }

  function showMonth(date) {
    const { input } = activeField;
    const minMonth = input.min.slice(0, 7);
    const maxMonth = input.max.slice(0, 7);
    const target = date.slice(0, 7);
    const shown = target < minMonth ? minMonth : target > maxMonth ? maxMonth : target;
    visibleMonth = new Date(`${shown}-01T00:00:00Z`);
    const shownYear = visibleMonth.getUTCFullYear();
    month.value = visibleMonth.getUTCMonth();
    year.min = minMonth.slice(0, 4);
    year.value = shownYear;
    for (const option of month.options) {
      const candidate = `${shownYear}-${String(Number(option.value) + 1).padStart(2, '0')}`;
      option.disabled = candidate < minMonth || candidate > maxMonth;
    }
    prev.disabled = shown === minMonth;
    next.disabled = shown === maxMonth;
    clear.disabled = !input.value;

    const todayIso = addDays(new Date(`${getTomorrowDate()}T00:00:00Z`), -1).toISOString().slice(0, 10);
    const gridStart = addDays(visibleMonth, 1 - (visibleMonth.getUTCDay() || 7));
    grid.replaceChildren();
    for (let week = 0; week < 6; week += 1) {
      const monday = addDays(gridStart, week * 7);
      const row = grid.insertRow();
      row.insertCell().textContent = String(getIsoWeek(monday).weekNumber).padStart(2, '0');
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const date = addDays(monday, weekday);
        const iso = date.toISOString().split('T')[0];
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.date = iso;
        button.textContent = date.getUTCDate();
        button.disabled = date.getUTCFullYear() > 9999 || iso < input.min || iso > input.max;
        button.classList.toggle('outside-month', !iso.startsWith(shown));
        button.setAttribute('aria-label', dayFormat.format(date));
        button.setAttribute('aria-pressed', String(iso === input.value));
        if (iso === todayIso) button.setAttribute('aria-current', 'date');
        row.insertCell().append(button);
      }
    }
  }

  function positionDialog() {
    const anchor = activeField.trigger.getBoundingClientRect();
    const { width, height } = dialog.getBoundingClientRect();
    const margin = 8;
    const left = anchor.left + (anchor.width - width) / 2;
    const below = anchor.bottom + margin;
    const maxTop = view.innerHeight - height - margin;
    const top = below <= maxTop ? below : anchor.top - height - margin;
    dialog.style.left = `${Math.max(margin, Math.min(left, view.innerWidth - width - margin))}px`;
    dialog.style.top = `${Math.max(margin, Math.min(top, maxTop))}px`;
  }

  function open(field) {
    updateDateBounds();
    activeField = field;
    dialog.setAttribute('aria-label', field.trigger.labels[0].textContent);
    showMonth(field.input.validity.valid && field.input.value ? field.input.value : field.input.min);
    dialog.showModal();
    positionDialog();
    (grid.querySelector('[aria-pressed="true"]:enabled') ?? grid.querySelector('button:enabled') ?? month)
      .focus({ preventScroll: true });
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    activeField.trigger.focus({ preventScroll: true });
    pointerOnBackdrop = false;
  }

  function select(value) {
    activeField.input.value = value;
    activeField.input.dispatchEvent(new Event('input', { bubbles: true }));
    close();
  }

  function changeMonth(offset, control) {
    const date = new Date(visibleMonth);
    date.setUTCMonth(date.getUTCMonth() + offset);
    showMonth(date.toISOString());
    if (control.disabled) month.focus();
  }

  for (const field of fields) {
    field.trigger.addEventListener('click', () => open(field), { signal });
    field.input.addEventListener('input', () => {
      updateDateBounds();
      onDateChange();
    }, { signal });
    field.input.addEventListener('invalid', (event) => {
      event.preventDefault();
      updateDateBounds();
      const firstInvalid = fields.find(({ input }) => !input.validity.valid);
      if (field === firstInvalid) field.trigger.focus();
    }, { signal });
  }
  prev.addEventListener('click', () => changeMonth(-1, prev), { signal });
  next.addEventListener('click', () => changeMonth(1, next), { signal });
  month.addEventListener('change', () => changeMonth(Number(month.value) - visibleMonth.getUTCMonth(), month), { signal });
  year.addEventListener('change', () => {
    const nextYear = Math.min(Number(year.max), Math.max(Number(year.min), Math.trunc(year.valueAsNumber)));
    const date = new Date(visibleMonth);
    if (Number.isFinite(nextYear)) date.setUTCFullYear(nextYear);
    showMonth(date.toISOString());
  }, { signal });
  grid.addEventListener('click', (event) => {
    const day = event.target.closest('button[data-date]:enabled');
    if (day) select(day.dataset.date);
  }, { signal });
  clear.addEventListener('click', () => select(''), { signal });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  }, { signal });
  dialog.addEventListener('pointerdown', (event) => { pointerOnBackdrop = event.target === dialog; }, { signal });
  dialog.addEventListener('pointercancel', () => { pointerOnBackdrop = false; }, { signal });
  dialog.addEventListener('click', (event) => {
    if (pointerOnBackdrop && event.target === dialog) close();
    pointerOnBackdrop = false;
  }, { signal });
  view.addEventListener('resize', () => { if (dialog.open) positionDialog(); }, { signal });
  updateDateBounds();

  return { endDate: end.input, endDateTrigger: end.trigger, updateDateBounds, close };
}
