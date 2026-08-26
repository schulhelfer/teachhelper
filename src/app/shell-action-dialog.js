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
    confirm: doc.getElementById('shell-action-dialog-confirm'),
  };

  let activeCancel = null;
  const open = ({ title, message, inputLabel = '', defaultValue = '', confirmText, danger = false, prompt = false }) => {
    if (!refs.title || !refs.message || !refs.cancel || !refs.confirm || (prompt && !refs.input)) {
      return Promise.resolve(prompt ? null : false);
    }
    activeCancel?.();
    refs.title.textContent = String(title || 'Hinweis');
    refs.message.textContent = String(message || '');
    refs.inputRow.hidden = !prompt;
    refs.inputLabel.textContent = String(inputLabel || '');
    refs.input.value = prompt ? String(defaultValue || '') : '';
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
        finish(prompt ? null : false);
      };
      const onConfirm = () => finish(prompt ? refs.input.value : true);
      const onClose = () => finish(prompt ? null : false);
      const cleanup = () => {
        if (activeCancel === onCancel) activeCancel = null;
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        refs.cancel.removeEventListener('click', onCancel);
        refs.confirm.removeEventListener('click', onConfirm);
      };
      activeCancel = onCancel;
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      refs.cancel.addEventListener('click', onCancel);
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
  };
  Object.defineProperty(dialog, '__teachhelperShellActionDialog', {
    configurable: true,
    value: controller,
  });
  return controller;
}
