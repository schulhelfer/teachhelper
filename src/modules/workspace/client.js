import {
  WORKSPACE_COMMAND_EVENT,
  createWorkspaceRequestId,
  normalizeWorkspaceClient,
} from '../../shared/school-data/messages.js';
import { createWorkspaceController, WORKSPACE_GLOBAL_KEY } from './index.js';

export { installWorkspaceComponents } from './components.js';
export { buildWorkspaceArchivePdfBytes, downloadWorkspaceArchivePdf } from './archive-pdf.js';
export { getWorkspaceLocalValue, setWorkspaceLocalValue, deleteWorkspaceLocalValue } from './local-value-store.js';

const windowClients = new WeakMap();

class WorkspaceClient {
  #controller;
  #scope;

  constructor(controller, scope = 'shell', id = '') {
    if (!controller || typeof controller.execute !== 'function') {
      throw new TypeError('WorkspaceController fehlt.');
    }
    this.#controller = controller;
    this.#scope = normalizeWorkspaceClient(scope);
    this.id = String(id || `${this.scope}-client:${createWorkspaceRequestId(this.scope)}`);
    this.revision = Math.max(0, Number(controller.getRevision?.()) || 0);
    this.unsubscribe = null;
    const api = controller.openClientApi(this.scope);
    this.data = api.data;
    this.operations = api.operations;
  }

  get scope() {
    return this.#scope;
  }

  getRevision() {
    return this.#controller.getRevision();
  }

  isReady() {
    return this.#controller.isReady();
  }

  getLifecycle() {
    this.#controller.refreshOwnerStatus();
    return this.#controller.getLifecycle();
  }

  registerFeatureClient(callbacks) {
    return this.#controller.registerFeatureClient(this.scope, callbacks);
  }

  registerMessageSource(source, scope) {
    return this.#controller.registerMessageSource(source, scope);
  }

  subscribe(scope = this.scope, onState = null) {
    if (typeof scope === 'function') {
      onState = scope;
      scope = this.scope;
    }
    this.unsubscribe?.();
    this.unsubscribe = this.#controller.registerClient(this.id, {
      scope: normalizeWorkspaceClient(scope),
      onState: (detail) => {
        this.revision = Math.max(this.revision, Number(detail?.revision) || 0);
        onState?.(detail);
      },
    });
    return () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
  }

  getSnapshot(scope = this.scope) {
    return this.#controller.getSnapshot(normalizeWorkspaceClient(scope));
  }

  async execute(command, payload = null, { baseRevision = this.revision } = {}) {
    const result = await this.#controller.execute({
      type: WORKSPACE_COMMAND_EVENT,
      requestId: createWorkspaceRequestId(this.scope),
      client: this.scope,
      command: String(command || '').trim(),
      payload: payload && typeof payload === 'object' ? payload : null,
      baseRevision,
    });
    this.revision = Math.max(this.revision, Number(result?.revision) || 0);
    return result;
  }
}

export function createWorkspaceClient(controller, scope, id = '') {
  return new WorkspaceClient(controller, scope, id);
}

export function getWorkspaceClient(targetWindow = globalThis.window, scope = 'shell') {
  const controller = targetWindow?.[WORKSPACE_GLOBAL_KEY];
  if (!controller) return null;
  let clients = windowClients.get(controller);
  if (!clients) {
    clients = new Map();
    windowClients.set(controller, clients);
  }
  const normalizedScope = normalizeWorkspaceClient(scope);
  if (!clients.has(normalizedScope)) clients.set(normalizedScope, createWorkspaceClient(controller, normalizedScope));
  return clients.get(normalizedScope);
}

export function createFeatureWorkspaceClient(scope, { targetWindow = globalThis.window, isolated = false, id = '' } = {}) {
  let controller = null;
  if (!isolated) {
    try {
      if (targetWindow?.parent && targetWindow.parent !== targetWindow
        && targetWindow.parent.location.origin === targetWindow.location.origin) {
        controller = targetWindow.parent[WORKSPACE_GLOBAL_KEY];
      }
    } catch {
    }
  }
  controller ||= createWorkspaceController({ eventTarget: targetWindow, ephemeral: true });
  return createWorkspaceClient(controller, scope, id);
}
