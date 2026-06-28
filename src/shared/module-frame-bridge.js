export const DEFAULT_MODULE_ALLOW = "camera 'none'; microphone 'none'";
export const CAMERA_MODULE_ALLOW = "camera; microphone 'none'";

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
} = {}) {
  const frame = document.createElement('iframe');
  if (className) frame.className = className;
  frame.loading = loading;
  frame.referrerPolicy = 'no-referrer';
  if (title) frame.title = title;
  applyModulePermissions(frame, allow);
  if (src) frame.src = src instanceof URL ? src.href : String(src);
  return frame;
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
  frame.contentWindow.postMessage(payload, origin);
  return true;
}
