import { findLearnerMatches } from './learner-search.js';

export const LEARNER_SEARCH_MESSAGES = {
  prompt: 'Gib einen Namen ein.',
  loading: 'Lernende werden geladen …',
  noMatches: 'Keine ähnlichen Namen gefunden.',
  failed: 'Lernende konnten nicht geladen werden.',
  locked: 'Die Notendatenbank ist gesperrt.',
};

const DEFAULT_COURSE_COLOR = '#64748b';

export function createLearnerSearchDialog({ mount = document.body, onSelectCourse } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'learner-search-dialog';
  dialog.className = 'learner-search-dialog';
  dialog.setAttribute('aria-labelledby', 'learner-search-dialog-title');

  const body = document.createElement('div');
  body.className = 'learner-search-dialog-body';

  const header = document.createElement('div');
  header.className = 'learner-search-dialog-header';

  const title = document.createElement('h2');
  title.id = 'learner-search-dialog-title';
  title.className = 'learner-search-dialog-title';
  title.textContent = '🧑‍🎓🔍 Lernendensuche';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'learner-search-dialog-close';
  closeButton.setAttribute('aria-label', 'Schließen');
  closeButton.title = 'Schließen';
  closeButton.textContent = '❌';
  header.append(title, closeButton);

  const label = document.createElement('label');
  label.className = 'learner-search-input-label';
  label.textContent = 'Name eingeben';

  const input = document.createElement('input');
  input.id = 'learner-search-input';
  input.className = 'learner-search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'Vor-, Nach- oder Rufname';
  label.append(input);

  const status = document.createElement('p');
  status.id = 'learner-search-status';
  status.className = 'learner-search-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = LEARNER_SEARCH_MESSAGES.prompt;

  const results = document.createElement('div');
  results.id = 'learner-search-results';
  results.className = 'learner-search-results';
  results.setAttribute('aria-live', 'polite');

  body.append(header, label, status, results);
  dialog.append(body);
  mount.append(dialog);

  let roster = [];

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  function render() {
    const query = input.value || '';
    results.replaceChildren();
    if (!String(query).trim()) {
      status.textContent = LEARNER_SEARCH_MESSAGES.prompt;
      return;
    }
    const matches = findLearnerMatches(roster, query);
    status.textContent = matches.length ? '' : LEARNER_SEARCH_MESSAGES.noMatches;
    matches.forEach((match) => {
      const card = document.createElement('section');
      card.className = 'learner-search-result';
      const name = document.createElement('div');
      name.className = 'learner-search-result-name';
      name.textContent = match.name;
      const pills = document.createElement('div');
      pills.className = 'learner-search-course-pills';
      match.courses.forEach((course) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'learner-search-course-pill';
        pill.textContent = course.courseName;
        pill.style.setProperty('--learner-course-color', course.courseColor || DEFAULT_COURSE_COLOR);
        pill.addEventListener('click', () => {
          close();
          onSelectCourse?.(course);
        });
        pills.append(pill);
      });
      card.append(name, pills);
      results.append(card);
    });
  }

  function focusInput() {
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  closeButton.addEventListener('click', () => close());
  input.addEventListener('input', render);

  return {
    dialog,
    input,
    focusInput,
    render,
    close,
    open() {
      roster = [];
      results.replaceChildren();
      status.textContent = LEARNER_SEARCH_MESSAGES.loading;
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          try {
            dialog.showModal();
          } catch (_error) {
            dialog.setAttribute('open', 'open');
          }
        }
        return;
      }
      dialog.setAttribute('open', 'open');
    },
    setRoster(students) {
      roster = Array.isArray(students) ? students : [];
      render();
      focusInput();
    },
    setStatus(message) {
      roster = [];
      results.replaceChildren();
      status.textContent = String(message || LEARNER_SEARCH_MESSAGES.failed);
    },
  };
}
