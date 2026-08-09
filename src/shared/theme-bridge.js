(function installThemeBridge() {
  const THEME_APPLY_EVENT = 'classroom:theme-apply';
  const trustedParentOrigin = window.location.origin === 'null'
    ? new URL(document.currentScript?.src || window.location.href).origin
    : window.location.origin;
  const frameNonce = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';

  function applyTheme(detail) {
    const theme = detail?.theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f5f5f7' : '#0f172a';
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== trustedParentOrigin) return;
    const data = event.data;
    if (!data || data.type !== THEME_APPLY_EVENT) return;
    if (frameNonce && data.frameNonce !== frameNonce) return;
    applyTheme(data.detail);
    window.dispatchEvent(new CustomEvent(THEME_APPLY_EVENT, { detail: data.detail || {} }));
  });
})();
