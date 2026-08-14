export const DEFAULT_MODULE_ALLOW = "camera 'none'; microphone 'none'; clipboard-read 'none'; clipboard-write 'none'";
export const WORKSPACE_CLIENT_MODULE_ALLOW = "camera 'none'; microphone 'none'; clipboard-read; clipboard-write";
export const PLANNING_MODULE_ALLOW = "camera 'none'; microphone 'none'; clipboard-read; clipboard-write";
export const CAMERA_MODULE_ALLOW = "camera; clipboard-read; clipboard-write; microphone 'none'";

export const ISOLATED_MODULE_SANDBOX = 'allow-scripts';
export const MERGER_MODULE_SANDBOX = 'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox';
export const DUPLICATE_CHECK_MODULE_SANDBOX = 'allow-scripts allow-downloads';
export const QR_MODULE_SANDBOX = 'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox';
export const TUTORIAL_TARGET_RECT_REQUEST_EVENT = 'classroom:tutorial-target-rect-request';
export const TUTORIAL_TARGET_RECT_RESPONSE_EVENT = 'classroom:tutorial-target-rect-response';

const MODULE_FRAME_NONCE_PARAM = 'moduleFrameNonce';

function createModuleFrameNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return [...values].map((value) => value.toString(36)).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function resolveSandboxTokens(sandbox) {
  if (!sandbox) return '';
  if (Array.isArray(sandbox)) return sandbox.filter(Boolean).join(' ');
  return String(sandbox).trim();
}

function appendFrameParameters(src, { nonce = '', theme = '' } = {}) {
  if (!src || (!nonce && !theme)) return src;
  try {
    const url = new URL(src instanceof URL ? src.href : String(src), window.location.href);
    if (theme === 'light' || theme === 'dark') url.searchParams.set('theme', theme);
    if (nonce) {
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      hashParams.set(MODULE_FRAME_NONCE_PARAM, nonce);
      url.hash = hashParams.toString();
    }
    return url.href;
  } catch {
    return src instanceof URL ? src.href : String(src);
  }
}

export function applyModulePermissions(frame, allow = DEFAULT_MODULE_ALLOW) {
  if (!frame) return frame;
  frame.setAttribute('allow', allow || DEFAULT_MODULE_ALLOW);
  return frame;
}

export function createModuleFrame({
  className = '',
  loading = 'lazy',
  src,
  title = '',
  allow = DEFAULT_MODULE_ALLOW,
  sandbox = '',
} = {}) {
  const frame = document.createElement('iframe');
  const sandboxTokens = resolveSandboxTokens(sandbox);
  const usesOpaqueOriginSandbox = Boolean(sandboxTokens && !sandboxTokens.split(/\s+/).includes('allow-same-origin'));
  const frameNonce = usesOpaqueOriginSandbox ? createModuleFrameNonce() : '';
  if (className) frame.className = className;
  frame.loading = loading;
  frame.referrerPolicy = 'no-referrer';
  if (title) frame.title = title;
  applyModulePermissions(frame, allow);
  if (sandboxTokens) frame.setAttribute('sandbox', sandboxTokens);
  if (frameNonce) {
    frame.dataset.moduleOpaqueOrigin = '1';
    frame.dataset.moduleFrameNonce = frameNonce;
  }
  if (src) {
    const initialTheme = document.documentElement?.dataset?.theme;
    frame.src = appendFrameParameters(src, { nonce: frameNonce, theme: initialTheme });
  }
  return frame;
}

export function getModuleFrameNonce(frame) {
  return frame?.dataset?.moduleFrameNonce || '';
}

export function isOpaqueOriginModuleFrame(frame) {
  return frame?.dataset?.moduleOpaqueOrigin === '1';
}

export function getModuleFrameOrigin(frame) {
  if (!frame) return '';
  const src = frame.getAttribute?.('src') || frame.src || '';
  if (!src) return '';
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return '';
  }
}

export function isTrustedModuleMessage(event, frame) {
  const origin = getModuleFrameOrigin(frame);
  const frameNonce = getModuleFrameNonce(frame);
  const data = event?.data;
  if (isOpaqueOriginModuleFrame(frame)) {
    return Boolean(
      frame
      && event
      && frameNonce
      && event.source === frame.contentWindow
      && event.origin === 'null'
      && data
      && typeof data === 'object'
      && data.frameNonce === frameNonce
    );
  }
  return Boolean(
    frame
    && event
    && origin
    && event.source === frame.contentWindow
    && event.origin === origin
  );
}

export function postToModule(frame, payload) {
  if (!frame?.contentWindow || !payload || typeof payload !== 'object') return false;
  const origin = getModuleFrameOrigin(frame);
  if (!origin) return false;
  const frameNonce = getModuleFrameNonce(frame);
  const message = frameNonce ? { ...payload, frameNonce } : payload;
  frame.contentWindow.postMessage(message, isOpaqueOriginModuleFrame(frame) ? '*' : origin);
  return true;
}
