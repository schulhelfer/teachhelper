import { installWorkspaceController } from '../modules/workspace/index.js';
import { readModuleWindowRequest } from './module-window.js';
import { createShellActionDialog } from './shell-action-dialog.js';

const shellActionDialog = createShellActionDialog(document);
const moduleWindowRequest = readModuleWindowRequest(window.location);
installWorkspaceController(window, {
  ephemeral: moduleWindowRequest.isModuleWindow,
  confirmLargeFile: ({ label, formattedSize }) => shellActionDialog?.confirm({
    title: 'Große Datei laden?',
    message: `${label} ist ${formattedSize} groß. Das Laden kann viel Arbeitsspeicher beanspruchen und den Browser verlangsamen. Trotzdem laden?`,
    confirmText: 'Trotzdem laden',
  }) || Promise.resolve(false),
});

const isLocalDevelopmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
if (isLocalDevelopmentHost) {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
}
const appVersion = String(globalThis.TEACHHELPER_APP_VERSION || 'dev');
const entryVersion = isLocalDevelopmentHost ? String(Date.now()) : appVersion;
await import(`../main.js?v=${encodeURIComponent(entryVersion)}`);
