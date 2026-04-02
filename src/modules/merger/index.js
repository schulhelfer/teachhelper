const MERGER_URL = new URL('./app.html', import.meta.url);

export function mountMerger({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._mergerController || null;

  host.textContent = '';
  const frame = document.createElement('iframe');
  frame.className = 'merger-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = MERGER_URL.href;
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._mergerController = { frame };
  return host._mergerController;
}
