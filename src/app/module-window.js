import {
  TAB_DUPLICATE_CHECK,
  TAB_GROUPS,
  TAB_MERGER,
  TAB_QR,
  TAB_RANDOM_PICKER,
  TAB_WORK_PHASE,
} from '../shell/tabs.js';

export const MODULE_WINDOW_TAB_PARAM = 'tab';
export const MODULE_WINDOW_MODE_PARAM = 'window';
export const MODULE_WINDOW_MODE_VALUE = 'module';

export const TEAR_OFF_TABS = new Set([
  TAB_GROUPS,
  TAB_RANDOM_PICKER,
  TAB_MERGER,
  TAB_DUPLICATE_CHECK,
  TAB_WORK_PHASE,
  TAB_QR,
]);

const DEFAULT_WINDOW_SIZE = { width: 1280, height: 860 };
const WINDOW_SIZES = {
  [TAB_MERGER]: { width: 1400, height: 900 },
  [TAB_DUPLICATE_CHECK]: { width: 1400, height: 900 },
};

export function isTearOffTab(tab) {
  return TEAR_OFF_TABS.has(String(tab || ''));
}

export function readModuleWindowRequest(locationLike = null) {
  const search = String(locationLike?.search || '');
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { tab: '', isModuleWindow: false };
  }
  const requestedTab = String(params.get(MODULE_WINDOW_TAB_PARAM) || '');
  return {
    tab: isTearOffTab(requestedTab) ? requestedTab : '',
    isModuleWindow: params.get(MODULE_WINDOW_MODE_PARAM) === MODULE_WINDOW_MODE_VALUE,
  };
}

export function buildModuleWindowUrl(tab, baseHref) {
  const url = new URL('./', baseHref);
  url.searchParams.set(MODULE_WINDOW_TAB_PARAM, tab);
  url.searchParams.set(MODULE_WINDOW_MODE_PARAM, MODULE_WINDOW_MODE_VALUE);
  return url.href;
}

export function getModuleWindowName(tab) {
  return `teachhelper-tab-${tab}`;
}

export function computeModuleWindowPlacement(tab, {
  screenX = 0,
  screenY = 0,
  availLeft = 0,
  availTop = 0,
  availWidth = 0,
  availHeight = 0,
} = {}) {
  const preferred = WINDOW_SIZES[tab] || DEFAULT_WINDOW_SIZE;
  const boundsWidth = Number(availWidth) > 0 ? Math.round(Number(availWidth)) : preferred.width;
  const boundsHeight = Number(availHeight) > 0 ? Math.round(Number(availHeight)) : preferred.height;
  const left = Number.isFinite(Number(availLeft)) ? Math.round(Number(availLeft)) : 0;
  const top = Number.isFinite(Number(availTop)) ? Math.round(Number(availTop)) : 0;
  const width = Math.min(preferred.width, boundsWidth);
  const height = Math.min(preferred.height, boundsHeight);
  const clamp = (value, min, max) => Math.round(Math.min(Math.max(value, min), max));
  return {
    width,
    height,
    left: clamp(Number(screenX) - width / 2, left, left + boundsWidth - width),
    top: clamp(Number(screenY) - 32, top, top + boundsHeight - height),
  };
}

export function openModuleWindow(tab, { screenX = 0, screenY = 0, windowRef = window } = {}) {
  if (!isTearOffTab(tab) || !windowRef) return null;
  const placement = computeModuleWindowPlacement(tab, {
    screenX,
    screenY,
    availLeft: windowRef.screen?.availLeft,
    availTop: windowRef.screen?.availTop,
    availWidth: windowRef.screen?.availWidth,
    availHeight: windowRef.screen?.availHeight,
  });
  const features = [
    'popup=yes',
    `width=${placement.width}`,
    `height=${placement.height}`,
    `left=${placement.left}`,
    `top=${placement.top}`,
  ].join(',');
  let opened = null;
  try {
    opened = windowRef.open(
      buildModuleWindowUrl(tab, windowRef.location.href),
      getModuleWindowName(tab),
      features,
    );
  } catch {
    return null;
  }
  try {
    opened?.focus();
  } catch {

  }
  return opened;
}
