function closeDialog(dialog, returnValue = '') {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close(returnValue);
  dialog.removeAttribute('open');
}

export function createShellActionDialog(doc = document) {
  const dialog = doc.getElementById('shell-action-dialog');
  if (!dialog) return null;
  if (dialog.__teachhelperShellActionDialog) return dialog.__teachhelperShellActionDialog;

  const refs = {
    title: doc.getElementById('shell-action-dialog-title'),
    message: doc.getElementById('shell-action-dialog-message'),
    inputRow: doc.getElementById('shell-action-dialog-input-row'),
    inputLabel: doc.getElementById('shell-action-dialog-input-label'),
    input: doc.getElementById('shell-action-dialog-input'),
    cancel: doc.getElementById('shell-action-dialog-cancel'),
    secondary: doc.getElementById('shell-action-dialog-secondary'),
    confirm: doc.getElementById('shell-action-dialog-confirm'),
  };

  let activeCancel = null;
  const open = ({
    title,
    message,
    inputLabel = '',
    defaultValue = '',
    cancelText = 'Abbrechen',
    cancelValue = false,
    secondaryText = '',
    secondaryValue = '',
    secondaryDanger = false,
    confirmText,
    confirmValue = true,
    danger = false,
    prompt = false,
    choice = false,
  }) => {
    if (
      !refs.title
      || !refs.message
      || !refs.cancel
      || !refs.confirm
      || (prompt && !refs.input)
      || (choice && !refs.secondary)
    ) {
      return Promise.resolve(prompt ? null : (choice ? cancelValue : false));
    }
    activeCancel?.();
    refs.title.textContent = String(title || 'Hinweis');
    refs.message.textContent = String(message || '');
    refs.inputRow.hidden = !prompt;
    refs.inputLabel.textContent = String(inputLabel || '');
    refs.input.value = prompt ? String(defaultValue || '') : '';
    refs.cancel.textContent = String(cancelText || 'Abbrechen');
    if (refs.secondary) {
      refs.secondary.hidden = !choice;
      refs.secondary.textContent = choice ? String(secondaryText || '') : '';
      refs.secondary.classList.toggle('danger-action', choice && secondaryDanger);
      refs.secondary.classList.toggle('ghost', !choice || !secondaryDanger);
    }
    refs.confirm.textContent = String(confirmText || 'OK');
    refs.confirm.classList.toggle('danger-action', Boolean(danger));
    refs.confirm.classList.toggle('primary', !danger);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        closeDialog(dialog, value === null || value === false ? '' : 'confirmed');
        resolve(value);
      };
      const onCancel = (event) => {
        event?.preventDefault?.();
        finish(prompt ? null : cancelValue);
      };
      const onSecondary = () => finish(secondaryValue);
      const onConfirm = () => finish(prompt ? refs.input.value : confirmValue);
      const onClose = () => finish(prompt ? null : cancelValue);
      const cleanup = () => {
        if (activeCancel === onCancel) activeCancel = null;
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        refs.cancel.removeEventListener('click', onCancel);
        refs.secondary?.removeEventListener('click', onSecondary);
        refs.confirm.removeEventListener('click', onConfirm);
      };
      activeCancel = onCancel;
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      refs.cancel.addEventListener('click', onCancel);
      refs.secondary?.addEventListener('click', onSecondary);
      refs.confirm.addEventListener('click', onConfirm);
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', 'open');
      }
      const focusTarget = prompt ? refs.input : refs.confirm;
      const focus = () => {
        focusTarget?.focus?.({ preventScroll: true });
        if (prompt) refs.input?.select?.();
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(focus);
      else setTimeout(focus, 0);
    });
  };

  const controller = {
    confirm(options = {}) {
      return open({ ...options, prompt: false });
    },
    prompt(options = {}) {
      return open({ ...options, prompt: true });
    },
    choose(options = {}) {
      return open({ ...options, choice: true });
    },
  };
  Object.defineProperty(dialog, '__teachhelperShellActionDialog', {
    configurable: true,
    value: controller,
  });
  return controller;
}
