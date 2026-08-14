(() => {
  const root = document.documentElement;
  const storageKey = 'teachhelper:theme-preference';
  const lightChrome = '#f5f5f7';
  const darkChrome = '#0f172a';
  let preference = 'dark';
  let requestedTheme = '';

  try {
    requestedTheme = new URL(window.location.href).searchParams.get('theme') || '';
    preference = window.localStorage?.getItem(storageKey) || preference;
  } catch {
  }

  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = requestedTheme === 'light' || requestedTheme === 'dark'
    ? requestedTheme
    : (preference === 'light' || (preference === 'system' && !systemDark) ? 'light' : 'dark');

  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'light' ? lightChrome : darkChrome,
  );
})();
