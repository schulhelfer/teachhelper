import {
  WORKSPACE_COMMAND_EVENT,
  createWorkspaceRequestId,
  normalizeWorkspaceClient,
} from '../../shared/school-data/messages.js';

export class WorkspaceClient {
  constructor(controller, scope = 'shell', id = '') {
    if (!controller || typeof controller.execute !== 'function') {
      throw new TypeError('WorkspaceController fehlt.');
    }
    this.controller = controller;
    this.scope = normalizeWorkspaceClient(scope);
    this.id = String(id || `${this.scope}-client:${createWorkspaceRequestId(this.scope)}`);
    this.revision = Math.max(0, Number(controller.getRevision?.()) || 0);
    this.unsubscribe = null;
  }

  subscribe(scope = this.scope, onState = null) {
    if (typeof scope === 'function') {
      onState = scope;
      scope = this.scope;
    }
    this.unsubscribe?.();
    this.scope = normalizeWorkspaceClient(scope);
    this.unsubscribe = this.controller.registerClient(this.id, {
      scope: this.scope,
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
    return this.controller.getSnapshot(normalizeWorkspaceClient(scope));
  }

  async execute(command, payload = null, { baseRevision = this.revision } = {}) {
    const result = await this.controller.execute({
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
