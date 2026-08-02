const MODULE_ROLE = 'grades';
const PLANNING_MARKUP_URL = new URL('../planning/app.html', import.meta.url);
const PLANNING_ENGINE_URL = new URL('../planning/app.js', import.meta.url);

document.documentElement.dataset.moduleRole = MODULE_ROLE;
if (document.body) {
  document.body.dataset.moduleRole = MODULE_ROLE;
}

function copyPlanningBody(sourceDocument) {
  const sourceBody = sourceDocument?.body;
  if (!sourceBody) {
    throw new Error('Das Markup des Notenmoduls ist unvollständig.');
  }

  const fragment = document.createDocumentFragment();
  [...sourceBody.children].forEach((node) => {
    if (node.tagName === 'SCRIPT') return;
    fragment.append(document.importNode(node, true));
  });
  document.body.replaceChildren(fragment);
  document.body.dataset.moduleRole = MODULE_ROLE;

  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Die Oberfläche des Notenmoduls konnte nicht aufgebaut werden.');
  }
  app.dataset.moduleRole = MODULE_ROLE;
  
  app.dataset.sidebarWidthScope = 'planning';

  
  
  const vaultForm = document.querySelector('#grade-vault-dialog-form');
  if (vaultForm instanceof HTMLFormElement) {
    vaultForm.action = PLANNING_MARKUP_URL.href;
  }
}

async function hydrateGradesMarkup() {
  const response = await fetch(PLANNING_MARKUP_URL, {
    cache: 'no-cache',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Das Markup des Notenmoduls konnte nicht geladen werden (${response.status}).`);
  }
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  copyPlanningBody(source);
}

try {
  await hydrateGradesMarkup();
  await import('../../shared/sidebar-resize.js');
  await import('./bridge.js');
  await import(PLANNING_ENGINE_URL.href);
} catch (error) {
  console.error('[TeachHelper] Grades module failed to start.', error);
  const bootstrap = document.querySelector('#grades-bootstrap') || document.createElement('main');
  bootstrap.id = 'grades-bootstrap';
  bootstrap.className = 'grades-bootstrap is-error';
  bootstrap.setAttribute('role', 'alert');
  bootstrap.textContent = error instanceof Error
    ? error.message
    : 'Das Notenmodul konnte nicht gestartet werden.';
  if (!bootstrap.isConnected) {
    document.body.replaceChildren(bootstrap);
  }
}
