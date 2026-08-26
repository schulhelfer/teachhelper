import {
  WORKSPACE_COMMAND_GET_SNAPSHOT,
  WORKSPACE_COMMAND_EVENT,
  WORKSPACE_COMMAND_OWNER_ACTION,
  WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE,
  WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
  WORKSPACE_COMMAND_CREATE_COURSE,
  WORKSPACE_COMMAND_UPDATE_COURSE,
  WORKSPACE_COMMAND_DELETE_COURSE,
  WORKSPACE_COMMAND_REORDER_COURSES,
  WORKSPACE_COMMAND_APPLY_SETTINGS,
  WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY,
  WORKSPACE_CLIENT_SHELL,
  WORKSPACE_ERROR_NOT_READY,
  WORKSPACE_ERROR_STALE_STATE,
  WORKSPACE_ERROR_UNSUPPORTED,
  WORKSPACE_RESULT_EVENT,
  WORKSPACE_STATE_EVENT,
  WORKSPACE_OWNER_READY_EVENT,
  normalizeWorkspaceClient,
  normalizeWorkspaceCommandRequest,
} from '../../shared/school-data/messages.js';
import { WorkspaceStore } from './store.js';
import { createWorkspaceRuntime } from './runtime.js';

export const WORKSPACE_GLOBAL_KEY = '__teachhelperWorkspaceController';

const WORKSPACE_COMMAND_CAPABILITIES = Object.freeze({
  shell: null,
  planning: new Set([
    WORKSPACE_COMMAND_GET_SNAPSHOT,
    WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE,
    WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
    WORKSPACE_COMMAND_CREATE_COURSE,
    WORKSPACE_COMMAND_UPDATE_COURSE,
    WORKSPACE_COMMAND_DELETE_COURSE,
    WORKSPACE_COMMAND_REORDER_COURSES,
    WORKSPACE_COMMAND_APPLY_SETTINGS,
    WORKSPACE_COMMAND_OWNER_ACTION,
  ]),
  grades: new Set([
    WORKSPACE_COMMAND_GET_SNAPSHOT,
    WORKSPACE_COMMAND_CREATE_COURSE,
    WORKSPACE_COMMAND_UPDATE_COURSE,
    WORKSPACE_COMMAND_DELETE_COURSE,
    WORKSPACE_COMMAND_REORDER_COURSES,
    WORKSPACE_COMMAND_APPLY_SETTINGS,
    WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY,
    WORKSPACE_COMMAND_OWNER_ACTION,
  ]),
  seatplan: new Set([
    WORKSPACE_COMMAND_GET_SNAPSHOT,
  ]),
});

const WORKSPACE_OWNER_ACTION_CAPABILITIES = Object.freeze({
  shell: null,
  planning: new Set([
    'manual-save',
    'explicit-save',
    'manual-create-empty',
    'manual-load',
    'sync-connect',
    'sync-reconnect',
    'backup-directory-connect',
    'backup-directory-reconnect',
    'sync-save',
    'backup-create',
    'backup-auto',
    'backup-restore',
    'backup-export',
    'backup-import',
    'archive-generate',
  ]),
  grades: new Set([
    'vault-setup',
    'vault-unlock',
    'vault-change-password',
    'archive-generate',
  ]),
  seatplan: new Set(),
});

function getWorkspaceCapabilities(client) {
  const scope = normalizeWorkspaceClient(client);
  return {
    client: scope,
    commands: WORKSPACE_COMMAND_CAPABILITIES[scope] || new Set(),
    ownerActions: WORKSPACE_OWNER_ACTION_CAPABILITIES[scope] || new Set(),
  };
}

function isWorkspaceRequestAllowed(request, capabilities = getWorkspaceCapabilities(request.client)) {
  if (capabilities.commands === null) return true;
  if (!capabilities.commands.has(request.command)) return false;
  if (request.command !== WORKSPACE_COMMAND_OWNER_ACTION) return true;
  return capabilities.ownerActions.has(String(request.payload?.action || '').trim().toLowerCase());
}

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

export function createWorkspaceController({ eventTarget = null, ephemeral = false, confirmLargeFile = null } = {}) {
  const target = eventTarget || (typeof window !== 'undefined' ? window : new EventTarget());
  const clients = new Map();
  const messageSources = new Map();
  let store = new WorkspaceStore();
  let runtimeService = createWorkspaceRuntime(store, {
    eventTarget: target,
    ephemeral: Boolean(ephemeral),
    confirmLargeFile,
  });
  let runtimeOwner = new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === 'store') return store;
      if (property === 'serviceAttached') return Boolean(runtimeService);
      const value = runtimeService?.[property];
      return typeof value === 'function' ? value.bind(runtimeService) : value;
    },
    set(_target, property, value) {
      if (!runtimeService) return false;
      runtimeService[property] = value;
      return true;
    },
    has(_target, property) {
      return property === 'store' || property === 'serviceAttached' || Boolean(runtimeService && property in runtimeService);
    },
  });
  let revision = 0;
  let ownerHydrated = true;
  let queue = Promise.resolve();
  let disposed = false;

  const owner = new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === 'store') return store;
      if (property === 'runtimeAttached') return Boolean(runtimeService);
      const value = runtimeOwner?.[property];
      return typeof value === 'function' ? value.bind(runtimeOwner) : value;
    },
    set(_target, property, value) {
      if (!runtimeOwner) return false;
      runtimeOwner[property] = value;
      return true;
    },
    has(_target, property) {
      return property === 'store' || property === 'runtimeAttached' || Boolean(runtimeOwner && property in runtimeOwner);
    },
  });

  const getLifecycle = () => ({
    owner: Boolean(runtimeOwner),
    serviceAttached: Boolean(runtimeService),
    hydrated: Boolean(runtimeService && ownerHydrated),
    ready: Boolean(runtimeService && ownerHydrated),
    revision,
  });

  const readOwnerHydrated = () => {
    if (!runtimeService) return false;
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
    if (!runtimeService || !ownerHydrated) return;
    if (target && typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(WORKSPACE_OWNER_READY_EVENT, {
        detail: getLifecycle(),
      }));
    }
  };

  const getSnapshot = (scope = 'shell') => {
    const normalizedScope = normalizeWorkspaceClient(scope);
    if (runtimeService && typeof owner.createWorkspaceSnapshot === 'function') {
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

  const executeNow = async (rawRequest, capabilities = null) => {
    const request = normalizeWorkspaceCommandRequest(rawRequest);
    const revisionBeforeCommand = revision;
    if (disposed) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_UNSUPPORTED,
        message: 'Workspace ist nicht mehr verfügbar.',
      });
    }

    if (!isWorkspaceRequestAllowed(request, capabilities || getWorkspaceCapabilities(request.client))) {
      return createResult(request, revision, getLifecycle(), {
        code: WORKSPACE_ERROR_UNSUPPORTED,
        message: 'Dieser Workspace-Befehl ist für das anfragende Modul nicht freigegeben.',
      });
    }

    if (request.command === WORKSPACE_COMMAND_GET_SNAPSHOT) {
      if (!runtimeService || !ownerHydrated) {
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

    if (!runtimeService) {
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

  const attachRuntime = (featureClient, nextStore = null) => {
    if (disposed || !featureClient || (nextStore && nextStore !== store)) return false;
    const current = runtimeService.clients?.get?.('grades');
    if (current && current !== featureClient) return false;
    runtimeService.registerFeatureClient('grades', featureClient);
    publish('grades');
    return true;
  };

  const execute = (rawRequest, capabilities = null) => {
    const run = queue.then(() => executeNow(rawRequest, capabilities));
    queue = run.catch(() => undefined);
    return run;
  };

  const controller = {
    attachRuntime,
    detachRuntime(featureClient) {
      if (!featureClient) return false;
      const current = runtimeService.clients?.get?.('grades');
      if (current !== featureClient) return false;
      runtimeService.clients.delete('grades');
      publish('grades');
      return true;
    },
    registerFeatureClient(scope, featureClient) {
      if (disposed || !runtimeService) return () => {};
      return runtimeService.registerFeatureClient(scope, featureClient);
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
    registerMessageSource(source, scope) {
      if (disposed || !source || (typeof source !== 'object' && typeof source !== 'function')) {
        return () => {};
      }
      const capabilities = getWorkspaceCapabilities(scope);
      if (capabilities.client === WORKSPACE_CLIENT_SHELL) return () => {};
      const identity = {
        client: capabilities.client,
        commands: capabilities.commands,
        ownerActions: capabilities.ownerActions,
      };
      messageSources.set(source, identity);
      return () => {
        if (messageSources.get(source) === identity) messageSources.delete(source);
      };
    },
    executeFromMessageSource(source, rawRequest) {
      const identity = messageSources.get(source);
      if (!identity || disposed) return null;
      const request = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
      return execute({ ...request, client: identity.client }, identity);
    },
    getOwner: () => owner,
    getStore: () => store,
    getRevision: () => revision,
    getLifecycle,
    isHydrated: () => Boolean(runtimeService && ownerHydrated),
    isReady: () => Boolean(runtimeService && ownerHydrated),
    refreshOwnerStatus(nextOwner = owner) {
      if (disposed || !runtimeService || (nextOwner !== owner && nextOwner !== runtimeService)) return false;
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
      if (disposed || !runtimeService || (nextOwner !== owner && nextOwner !== runtimeService)) return false;
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
    execute,
    whenIdle: () => queue,
    dispose() {
      disposed = true;
      runtimeService?.lockGradeVaultSession?.();
      runtimeService = null;
      runtimeOwner = null;
      store = null;
      ownerHydrated = false;
      clients.clear();
      messageSources.clear();
    },
  };
  runtimeService.bindController(controller);
  ownerHydrated = readOwnerHydrated();
  queueMicrotask(() => {
    void runtimeService?.initialize?.().catch(() => undefined);
  });
  return controller;
}

export function installWorkspaceController(targetWindow = typeof window !== 'undefined' ? window : null, options = {}) {
  if (!targetWindow) return null;
  if (targetWindow[WORKSPACE_GLOBAL_KEY]) return targetWindow[WORKSPACE_GLOBAL_KEY];
  const controller = createWorkspaceController({ eventTarget: targetWindow, ...options });
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
    const result = await controller.executeFromMessageSource(event.source, request);
    if (!result) return;
    try {
      event.source?.postMessage(result, event.origin);
    } catch {
      
    }
  });
  return controller;
}
