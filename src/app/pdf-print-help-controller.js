import { postToModule } from '../shared/module-frame-bridge.js';
import { MERGER_PRINT_HELP_CLOSED_EVENT } from '../shell/tabs.js';

const SYSTEM_PRINT_COMMANDS = [
  { commandId: 'pdf-print-help-command', copyId: 'pdf-print-help-copy', value: 'defaults write com.microsoft.Edge UseSystemPrintDialog -bool true' },
  { commandId: 'pdf-print-help-chrome-command', copyId: 'pdf-print-help-chrome-copy', value: 'defaults write com.google.Chrome DisablePrintPreview -bool true' },
];

export function createPdfPrintHelpController({ documentRef: document, view: window }) {
  const dialog = document.getElementById('pdf-print-help-dialog');
  const commands = SYSTEM_PRINT_COMMANDS.map(({ commandId, copyId, value }) => ({
    command: document.getElementById(commandId),
    copyButton: document.getElementById(copyId),
    value,
  }));
  const closeButton = document.getElementById('pdf-print-help-close');
  const status = document.getElementById('pdf-print-help-status');
  let sourceFrame = null;
  let session = 0;
  let disposed = false;

  const copyCommand = async ({ command, copyButton, value }) => {
    const copySession = session;
    copyButton.disabled = true;
    status.textContent = '';
    try {
      await window.navigator.clipboard.writeText(value);
      if (disposed || session !== copySession) return;
      status.textContent = 'Befehl kopiert.';
    } catch {
      if (disposed || session !== copySession) return;
      command.focus();
      command.select();
      status.textContent = 'Bitte den markierten Befehl manuell kopieren (auf dem Mac mit ⌘C).';
    } finally {
      if (!disposed && session === copySession) copyButton.disabled = false;
    }
  };

  const closeDialog = () => dialog.close();
  const returnFocus = () => {
    session += 1;
    const frame = sourceFrame;
    sourceFrame = null;
    if (frame?.isConnected) postToModule(frame, { type: MERGER_PRINT_HELP_CLOSED_EVENT });
  };

  commands.forEach((entry) => {
    entry.command.value = entry.value;
    entry.copyListener = () => void copyCommand(entry);
    entry.copyButton.addEventListener('click', entry.copyListener);
  });
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('close', returnFocus);

  return {
    open(frame) {
      if (disposed || dialog.open) return;
      sourceFrame = frame;
      session += 1;
      status.textContent = '';
      commands.forEach(({ copyButton }) => { copyButton.disabled = false; });
      dialog.showModal();
      commands[0].copyButton.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session += 1;
      sourceFrame = null;
      commands.forEach(({ copyButton, copyListener }) => copyButton.removeEventListener('click', copyListener));
      closeButton.removeEventListener('click', closeDialog);
      dialog.removeEventListener('close', returnFocus);
      if (dialog.open) dialog.close();
    },
  };
}
