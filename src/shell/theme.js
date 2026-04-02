export const THEME_DARK = 'dark';

export const UNIFIED_THEME_PALETTES = {
  [THEME_DARK]: {
    '--bg': '#0f172a',
    '--panel': '#111827',
    '--muted': '#334155',
    '--text': '#e5e7eb',
    '--accent': '#22d3ee',
    '--accent-2': '#60a5fa',
    '--active': '#fb923c',
    '--danger': '#ef4444',
    '--ok': '#10b981',
    '--card': '#1f2937',
    '--seat': '#0b1222',
    '--focus': '#fde68a',
    '--lock': '#f59e0b',
    '--link': '#67e8f9',
    '--shell-bg': 'rgba(255, 255, 255, 0.03)',
    '--shell-border': 'rgba(255, 255, 255, 0.06)',
    '--shell-shadow': '0 14px 28px rgba(0, 0, 0, 0.24)',
    '--shell-backdrop': 'saturate(140%) blur(6px)',
    '--shell-bg-strong': 'linear-gradient(180deg, rgba(15, 23, 42, 0.58), rgba(2, 6, 23, 0.7))',
  },
};

export function applyTheme({ root = document.documentElement, themeColorMeta = null } = {}) {
  root.setAttribute('data-theme', THEME_DARK);
  const palette = UNIFIED_THEME_PALETTES[THEME_DARK];
  Object.entries(palette).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', '#0f172a');
  }
}
