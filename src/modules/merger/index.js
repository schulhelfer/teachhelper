import { MERGER_SHELL_LAYOUT_EVENT, MERGER_TOOL_REQUEST_EVENT } from '../../shell/tabs.js';
import {
  createModuleFrame,
  postToModule,
} from '../../shared/module-frame-bridge.js';

const MERGER_VERSION = 'merger-r12';
const MERGER_URL = new URL(`./app.html?v=${MERGER_VERSION}`, import.meta.url);

export function mountMerger({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._mergerController || null;

  host.textContent = '';

  const frame = createModuleFrame({
    className: 'merger-frame',
    loading: 'lazy',
    src: MERGER_URL,
  });

  let ready = false;
  let pendingShellLayout = null;
  let pendingTool = null;
  let disposed = false;

  const selectTool = (tool) => {
    if (disposed) return;
    const normalizedTool = ['layout', 'merge', 'rotate', 'split'].includes(tool) ? tool : '';
    if (!normalizedTool) return;
    if (!ready || !frame.contentWindow) {
      pendingTool = normalizedTool;
      return;
    }
    postToModule(frame, {
      type: MERGER_TOOL_REQUEST_EVENT,
      detail: { tool: normalizedTool },
    });
  };

  const applyShellLayout = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    postToModule(frame, {
      type: MERGER_SHELL_LAYOUT_EVENT,
      detail: {
        ...detail,
      },
    });
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    applyShellLayout(pendingShellLayout || { collapsed: false });
    pendingShellLayout = null;
    if (pendingTool) {
      selectTool(pendingTool);
      pendingTool = null;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pendingShellLayout = null;
    pendingTool = null;
    frame.removeEventListener('load', onFrameLoad);
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._mergerController === controller) {
      delete host._mergerController;
    }
  };

  const controller = { frame, applyShellLayout, selectTool, dispose };

  frame.addEventListener('load', onFrameLoad, { once: true });
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._mergerController = controller;
  return host._mergerController;
}
