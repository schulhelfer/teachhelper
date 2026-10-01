const presentations = new WeakMap();
let nextLabelId = 0;

export function applyFeedbackDialog({ dialog, content = dialog, title, body, actions = [], dismissButton, variant, icon } = {}) {
  if (!dialog || !content) return;
  const previous = presentations.get(dialog);
  if (previous) {
    previous.classes.forEach(([element, className]) => element.classList.remove(className));
    previous.created.forEach((element) => element.remove());
    previous.attributes.forEach(([element, name, value]) => {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    });
    presentations.delete(dialog);
  }
  if (variant !== 'warn' && variant !== 'error') return;

  const state = { classes: [], created: [], attributes: [] };
  const addClass = (element, className) => {
    if (!element || element.classList.contains(className)) return;
    element.classList.add(className);
    state.classes.push([element, className]);
  };
  const setAttribute = (element, name, value) => {
    state.attributes.push([element, name, element.getAttribute(name)]);
    element.setAttribute(name, value);
  };
  const doc = dialog.ownerDocument;
  if (!icon) {
    icon = doc.createElement('span');
    icon.textContent = '⚠️';
    content.prepend(icon);
    state.created.push(icon);
  } else {
    const warningIcon = doc.createElement('span');
    warningIcon.textContent = '⚠️';
    icon.before(warningIcon);
    addClass(icon, 'feedback-dialog-replaced-icon');
    icon = warningIcon;
    state.created.push(icon);
  }
  setAttribute(icon, 'aria-hidden', 'true');
  if (!title) {
    title = doc.createElement('h3');
    title.textContent = variant === 'error' ? 'Fehler' : 'Hinweis';
    icon.after(title);
    state.created.push(title);
  }
  addClass(dialog, 'feedback-dialog');
  addClass(dialog, `feedback-dialog-${variant}`);
  addClass(content, 'feedback-dialog-content');
  addClass(icon, 'feedback-dialog-icon');
  addClass(title, 'feedback-dialog-title');
  addClass(body, 'feedback-dialog-body');
  actions.forEach((element) => addClass(element, 'feedback-dialog-actions'));
  addClass(dismissButton, 'feedback-dialog-dismiss');
  for (const [element, name] of [[title, 'aria-labelledby'], [body, 'aria-describedby']]) {
    if (!element || dialog.hasAttribute(name)) continue;
    if (!element.id) setAttribute(element, 'id', `feedback-dialog-label-${++nextLabelId}`);
    setAttribute(dialog, name, element.id);
  }
  setAttribute(dialog, 'role', 'alertdialog');
  presentations.set(dialog, state);
}
