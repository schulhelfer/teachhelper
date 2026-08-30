(() => {
  const script = document.currentScript;
  if (!script) return;
  if (window.parent && window.parent !== window) return;
  if (window.top && window.top !== window) return;

  const DEEP_LINK_TABS = new Set(['merger', 'duplicate-check', 'qr']);
  const requestedTab = String(script.dataset.moduleTab || '');

  let target = '';
  try {
    const shellUrl = new URL('../../', script.src);
    if (DEEP_LINK_TABS.has(requestedTab)) {
      shellUrl.searchParams.set('tab', requestedTab);
      shellUrl.searchParams.set('window', 'module');
    }
    target = shellUrl.href;
  } catch {
    target = '';
  }

  if (target) {
    try {
      window.location.replace(target);
    } catch {
      window.location.href = target;
    }
  }

  try {
    document.documentElement.remove();
  } catch {

  }
})();
