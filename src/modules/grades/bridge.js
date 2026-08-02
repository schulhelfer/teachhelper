


import '../planning/bridge.js';

const GRADES_NAVIGATE_EVENT = 'classroom:grades-navigate';
const TRUSTED_PARENT_ORIGIN = window.location.origin;
const pendingNavigations = [];
let navigationFlushTimer = 0;
let navigationPromise = Promise.resolve();

function getGradesApi() {
  const api = window.__teachhelperGradesApp;
  return api && typeof api.navigate === 'function' ? api : null;
}

function flushNavigations() {
  navigationFlushTimer = 0;
  const api = getGradesApi();
  if (!api) {
    if (pendingNavigations.length) {
      navigationFlushTimer = window.setTimeout(flushNavigations, 50);
    }
    return;
  }
  while (pendingNavigations.length) {
    const detail = pendingNavigations.shift();
    navigationPromise = navigationPromise
      .then(() => api.navigate(detail))
      .catch((error) => {
        console.error('[TeachHelper] Grades navigation failed.', error);
      });
  }
}

function queueNavigation(detail) {
  pendingNavigations.push(detail && typeof detail === 'object' ? detail : {});
  if (!navigationFlushTimer) {
    flushNavigations();
  }
}

window.addEventListener('message', (event) => {
  if (!window.parent || event.source !== window.parent) return;
  if (event.origin !== TRUSTED_PARENT_ORIGIN) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== GRADES_NAVIGATE_EVENT) return;
  queueNavigation(data.detail);
});

window.addEventListener('classroom:planning-ready', flushNavigations);
