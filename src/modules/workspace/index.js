import {
  WORKSPACE_COMMAND_GET_SNAPSHOT,
  WORKSPACE_COMMAND_EVENT,
  WORKSPACE_COMMAND_OWNER_ACTION,
  WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE,
  WORKSPACE_ERROR_NOT_READY,
  WORKSPACE_ERROR_STALE_STATE,
  WORKSPACE_ERROR_UNSUPPORTED,
  WORKSPACE_RESULT_EVENT,
  WORKSPACE_STATE_EVENT,
  WORKSPACE_OWNER_READY_EVENT,
  normalizeWorkspaceClient,
  normalizeWorkspaceCommandRequest,
} from '../../shared/school-data/messages.js';

export const WORKSPACE_GLOBAL_KEY = '__teachhelperWorkspaceController';

function redactWorkspaceSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => redactWorkspaceSecrets(item, seen));
    return value;
  }
  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase();
    if (normalized.includes('password') || ['cryptokey', 'secretkey', 'vaultkey'].includes(normalized)) {
      delete value[key];
      continue;
    }
    redactWorkspaceSecrets(value[key], seen);
  }
  return value;
}

function cloneSnapshot(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try {
      return redactWorkspaceSecrets(structuredClone(value));
    } catch {
      
    }
  }
  try {
    return redactWorkspaceSecrets(JSON.parse(JSON.stringify(value)));
  } catch {
    return null;
  }
}

function createResult(request, revision, lifecycle, patch = {}) {
  return {
    type: WORKSPACE_RESULT_EVENT,
    requestId: request.requestId,
    ok: false,
    revision,
    hydrated: Boolean(lifecycle?.hydrated),
    ready: Boolean(lifecycle?.ready),
    ...patch,
  };
}

export function createWorkspaceController({ eventTarget = null } = {}) {
  const target = eventTarget || (typeof window !== 'undefined' ? window : new EventTarget());
  const clients = new Map();
  let owner = null;
  let store = null;
  let revision = 0;
  let ownerHydrated = false;
  let queue = Promise.resolve();
  let disposed = false;

  const getLifecycle = () => ({
    owner: Boolean(owner),
    hydrated: Boolean(owner && ownerHydrated),
    ready: Boolean(owner && ownerHydrated),
    revision,
  });

  const readOwnerHydrated = () => {
    if (!owner) return false;
    try {
      const snapshot = typeof owner.createWorkspaceSnapshot === 'function'
        ? owner.createWorkspaceSnapshot('shell')
        : null;
      return Boolean(snapshot?.ready ?? snapshot?.status?.ready);
    } catch {
      return false;
    }
  };

  const dispatchOwnerReady = () => {
    if (!ownerHydrated) return;
    if (target && typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(WORKSPACE_OWNER_READY_EVENT, {
        detail: getLifecycle(),
      }));
    }
  };

  const getSnapshot = (scope = 'shell') => {
    const normalizedScope = normalizeWorkspaceClient(scope);
    if (owner && typeof owner.createWorkspaceSnapshot === 'function') {
      return cloneSnapshot(owner.createWorkspaceSnapshot(normalizedScope));
    }
    if (normalizedScope === 'planning' && store && typeof store.exportPublicStateSnapshot === 'function') {
      return { publicState: cloneSnapshot(store.exportPublicStateSnapshot()) };
    }
    return null;
  };

  const publish = (scope = 'shell', snapshot = undefined) => {
    if (disposed) return null;
    const normalizedScope = normalizeWorkspaceClient(scope);
    const detail = {
      revision,
      scope: normalizedScope,
      ...getLifecycle(),
      snapshot: snapshot === undefined ? getSnapshot(normalizedScope) : cloneSnapshot(snapshot),
    };
    if (target && typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(WORKSPACE_STATE_EVENT, { detail }));
    }
    for (const client of clients.values()) {
      if (client.scope !== normalizedScope && normalizedScope !== 'shell') continue;
      try {
        client.onState?.(detail);
      } catch {
        
      }
    }
    return detail;
  };

  const markChanged = (scope = 'shell', snapshot = undefined) => {
    const normalizedScope = normalizeWorkspaceClient(scope);
    revision += 1;
    publish(normalizedScope, snapshot);
    if (normalizedScope === 'planning') publish('grades');
    if (normalizedScope === 'grades') publish('planning');
    if (normalizedScope !== 'shell') publish('shell');
    return revision;
  };

  const executeNow = async (rawRequest) => {
    const request = normalizeWorkspaceCommandRequest(rawRequest);
    const revisionBeforeCommand = revision;
    if (disposed) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_UNSUPPORTED,
        message: 'Workspace ist nicht mehr verfügbar.',
      });
    }

    if (request.command === WORKSPACE_COMMAND_GET_SNAPSHOT) {
      if (!owner || !ownerHydrated) {
        return createResult(request, revision, getLifecycle(), {
          code: WORKSPACE_ERROR_NOT_READY,
          message: 'Der Workspace wird noch vollständig geladen.',
        });
      }
      return createResult(request, revision, getLifecycle(), {
        ok: true,
        data: getSnapshot(request.client),
      });
    }

    if (!owner) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_NOT_READY,
        message: 'Der Workspace-Owner ist noch nicht bereit.',
      });
    }
    if (!ownerHydrated) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_NOT_READY,
        message: 'Der Workspace wird noch vollständig geladen.',
      });
    }

    if (
      request.baseRevision !== null
      && request.baseRevision !== revision
    ) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_STALE_STATE,
        message: 'Der Datenstand wurde zwischenzeitlich geändert.',
        data: getSnapshot(request.client),
      });
    }

    try {
      let data;
      if (request.command === WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE) {
        if (typeof owner.applyWorkspacePublicState !== 'function') {
          throw new Error('Öffentlicher Workspace-State kann nicht übernommen werden.');
        }
        data = await owner.applyWorkspacePublicState(request.payload?.publicState, {
          client: request.client,
          requestId: request.requestId,
        });
        if (revision === revisionBeforeCommand) markChanged('planning');
      } else if (request.command === WORKSPACE_COMMAND_OWNER_ACTION) {
        if (typeof owner.handleWorkspaceAction !== 'function') {
          throw new Error('Workspace-Aktion wird nicht unterstützt.');
        }
        data = await owner.handleWorkspaceAction(request.payload?.action, request.payload?.detail, request);
        if (data?.changed && revision === revisionBeforeCommand) markChanged(data.scope || request.client);
      } else if (typeof owner.handleWorkspaceCommand === 'function') {
        data = await owner.handleWorkspaceCommand(request);
        if (data?.changed && revision === revisionBeforeCommand) markChanged(data.scope || request.client);
      } else {
        return createResult(request, revision, getLifecycle(), {
          code: WORKSPACE_ERROR_UNSUPPORTED,
          message: `Unbekannter Workspace-Befehl: ${request.command || 'leer'}`,
        });
      }
      return createResult(request, revision, getLifecycle(), { ok: true, data: cloneSnapshot(data) });
    } catch (error) {
      return createResult(request, revision, getLifecycle(), {
        code: String(error?.code || WORKSPACE_ERROR_UNSUPPORTED),
        message: error instanceof Error ? error.message : 'Workspace-Aktion fehlgeschlagen.',
      });
    }
  };

  return {
    registerOwner(nextOwner, nextStore = null) {
      if (disposed || !nextOwner) return false;
      if (owner && owner !== nextOwner) return false;
      owner = nextOwner;
      store = nextStore || nextOwner.store || null;
      ownerHydrated = readOwnerHydrated();
      markChanged('shell');
      publish('planning');
      publish('grades');
      dispatchOwnerReady();
      return true;
    },
    unregisterOwner(nextOwner) {
      if (owner !== nextOwner) return false;
      owner = null;
      store = null;
      ownerHydrated = false;
      markChanged('shell', null);
      return true;
    },
    registerClient(id, { scope = 'shell', onState = null } = {}) {
      const key = String(id || '').trim();
      if (!key || disposed) return () => {};
      clients.set(key, { scope: normalizeWorkspaceClient(scope), onState });
      const client = clients.get(key);
      try {
        client.onState?.({
          ...getLifecycle(),
          scope: client.scope,
          snapshot: getSnapshot(client.scope),
        });
      } catch {
        
      }
      return () => clients.delete(key);
    },
    getOwner: () => owner,
    getStore: () => store,
    getRevision: () => revision,
    getLifecycle,
    isHydrated: () => Boolean(owner && ownerHydrated),
    isReady: () => Boolean(owner && ownerHydrated),
    refreshOwnerStatus(nextOwner = owner) {
      if (disposed || !owner || nextOwner !== owner) return false;
      const nextHydrated = readOwnerHydrated();
      if (!nextHydrated || ownerHydrated) return ownerHydrated;
      ownerHydrated = true;
      markChanged('shell');
      publish('planning');
      publish('grades');
      dispatchOwnerReady();
      return true;
    },
    setOwnerHydrated(nextOwner, hydrated = true) {
      if (disposed || !owner || nextOwner !== owner) return false;
      const nextHydrated = Boolean(hydrated);
      if (nextHydrated === ownerHydrated) return true;
      ownerHydrated = nextHydrated;
      markChanged('shell');
      publish('planning');
      publish('grades');
      dispatchOwnerReady();
      return true;
    },
    getSnapshot,
    markChanged,
    publish,
    execute(rawRequest) {
      const run = queue.then(() => executeNow(rawRequest));
      queue = run.catch(() => undefined);
      return run;
    },
    whenIdle: () => queue,
    dispose() {
      disposed = true;
      owner = null;
      store = null;
      ownerHydrated = false;
      clients.clear();
    },
  };
}

export function installWorkspaceController(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!targetWindow) return null;
  if (targetWindow[WORKSPACE_GLOBAL_KEY]) return targetWindow[WORKSPACE_GLOBAL_KEY];
  const controller = createWorkspaceController({ eventTarget: targetWindow });
  Object.defineProperty(targetWindow, WORKSPACE_GLOBAL_KEY, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: controller,
  });
  targetWindow.addEventListener?.('message', async (event) => {
    if (event.origin !== targetWindow.location?.origin) return;
    const request = event.data;
    if (!request || request.type !== WORKSPACE_COMMAND_EVENT) return;
    const result = await controller.execute(request);
    try {
      event.source?.postMessage(result, event.origin);
    } catch {
      
    }
  });
  return controller;
}
