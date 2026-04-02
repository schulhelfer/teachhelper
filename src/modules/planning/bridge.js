    (() => {
      const MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';
      const MANUAL_SAVE_REQUEST_EVENT = 'classroom:planning-manual-save-request';
      const READY_EVENT = 'classroom:planning-ready';
      const SHELL_LAYOUT_EVENT = 'classroom:planning-shell-layout';
      const VIEW_REQUEST_EVENT = 'classroom:planning-view-request';
      const TRUSTED_PARENT_ORIGIN = window.location.origin;
      const ALLOWED_PARENT_MESSAGE_TYPES = new Set([
        SHELL_LAYOUT_EVENT,
        VIEW_REQUEST_EVENT,
        MANUAL_SAVE_REQUEST_EVENT,
      ]);

      window.addEventListener('message', (event) => {
        if (!window.parent || event.source !== window.parent) return;
        if (event.origin !== TRUSTED_PARENT_ORIGIN) return;
        const data = event?.data;
        if (!data || typeof data !== 'object') return;
        if (!ALLOWED_PARENT_MESSAGE_TYPES.has(data.type)) return;
        if (data.type === SHELL_LAYOUT_EVENT) {
          const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
          document.documentElement.dataset.shellCollapsed = detail && detail.collapsed ? 'true' : 'false';
          return;
        }
        if (data.type === VIEW_REQUEST_EVENT) {
          window.dispatchEvent(new CustomEvent(VIEW_REQUEST_EVENT, {
            detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
          }));
        }
        if (data.type === MANUAL_SAVE_REQUEST_EVENT) {
          window.dispatchEvent(new CustomEvent(MANUAL_SAVE_REQUEST_EVENT));
        }
      });

      window.addEventListener(MANUAL_SAVE_STATE_EVENT, (event) => {
        if (!window.parent || window.parent === window) return;
        const detail = event instanceof CustomEvent ? event.detail : null;
        window.parent.postMessage({ type: MANUAL_SAVE_STATE_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
      });

      window.addEventListener(READY_EVENT, (event) => {
        if (!window.parent || window.parent === window) return;
        const detail = event instanceof CustomEvent ? event.detail : null;
        window.parent.postMessage({ type: READY_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
      });
    })();
