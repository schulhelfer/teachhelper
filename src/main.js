import { createAppRuntime } from './app/app-runtime.js';

const appRuntime = createAppRuntime({
  documentRef: document,
  view: window,
  appVersion: String(globalThis.TEACHHELPER_APP_VERSION || 'dev'),
});

appRuntime.start();
