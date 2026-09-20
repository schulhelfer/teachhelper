import {
  createModuleMessageRouter,
  SIDEBAR_WIDTH_SCOPE_OTHER,
  SIDEBAR_WIDTH_SCOPE_PLANNING,
  SIDEBAR_WIDTH_SYNC_EVENT,
} from './module-message-router.js';
import { postToModule } from '../shared/module-frame-bridge.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from '../shared/tutorial-entry-state.js';

export function createModuleShellCoordinator({
  view: window,
  moduleRegistry,
  moduleBindings,
  themeController,
  registerCleanup,
  getActiveTab,
  setChromeCollapsed,
  getShellController,
  getFirstRunTutorial,
  syncTutorialEntryHintToModules,
  openHelpEntry,
  showMessage,
}) {
  let moduleMessageRouter = null;
  const syncSidebarWidthToModules = (scope, width) => {
    const normalizedScope = scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER;
    moduleRegistry.broadcast({
      type: SIDEBAR_WIDTH_SYNC_EVENT,
      detail: { scope: normalizedScope, width },
    }, (adapter) => adapter.sidebarScope === normalizedScope);
  };

  function bindMessages() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    moduleMessageRouter = createModuleMessageRouter({
      messageTarget: window,
      modules: moduleRegistry.list(),
      handlers: {
        ...moduleBindings.handlers,
        onThemePreferenceChange: (detail) => {
          themeController.setPreference(detail?.preference);
        },
        onToastRequest: (detail) => {
          const message = String(detail.message || '').trim();
          if (!message) return;
          const variant = detail.variant === 'error' ? 'error' : 'success';
          showMessage(message, variant, { presentation: 'toast' });
        },
        onMoreToolsDismiss: () => {
          getShellController()?.closeMoreToolsMenu();
        },
        onSidebarWidthRequest: ({ frame, scope }) => {
          postToModule(frame, {
            type: SIDEBAR_WIDTH_SYNC_EVENT,
            detail: {
              scope,
              width: getShellController()?.getSidebarWidth(scope)
                ?? (scope === SIDEBAR_WIDTH_SCOPE_PLANNING ? 220 : 360),
            },
          });
        },
        onSidebarWidthCommit: (detail, { scope }) => {
          getShellController()?.setSidebarWidth(scope, detail?.width);
        },
        onSidebarCollapseRequest: ({ scope }) => {
          const activeScope = moduleRegistry.get(getActiveTab())?.sidebarScope || SIDEBAR_WIDTH_SCOPE_OTHER;
          if (scope !== activeScope) return;
          setChromeCollapsed(true);
        },
        onTutorialEntryHint: (detail, { frame }) => {
          if (detail.action === 'seen') {
            markTutorialEntryHintSeen();
            getFirstRunTutorial()?.clearContextHelpPrompt?.();
            syncTutorialEntryHintToModules();
            return;
          }
          postToModule(frame, {
            type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
            detail: { seen: hasTutorialEntryHintBeenSeen() },
          });
        },
        onHelpEntryRequest: () => {
          openHelpEntry();
        },
      },
    });
    registerCleanup(() => moduleMessageRouter?.dispose?.());
    moduleBindings.bindMessages();
  }

  return { bindMessages, syncSidebarWidthToModules };
}
