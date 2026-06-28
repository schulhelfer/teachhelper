const isLocalDevelopmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
if (isLocalDevelopmentHost) {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
}
const entryVersion = isLocalDevelopmentHost ? String(Date.now()) : '5.1';
await import(`../main.js?v=${encodeURIComponent(entryVersion)}`);
