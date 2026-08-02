const MESSAGE_VARIANTS = {
  info: { icon: 'ℹ️', className: 'message-info' },
  warn: { icon: '⚠️', className: 'message-warn' },
  error: { icon: '✖️', className: 'message-error' },
  success: { icon: '✔️', className: 'message-success' },
};

const TOAST_DURATION_MS = 3200;
const MESSAGE_EXIT_MS = 220;

export function createMessageApi(doc = document) {
  const queuedMessages = [];

  function ensureMessageHost() {
    let host = doc.getElementById('message-stack');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'message-stack';
      host.className = 'message-stack';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      doc.body.appendChild(host);
    }
    return host;
  }

  function ensureToastHost() {
    let host = doc.getElementById('toast-stack');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'toast-stack';
      host.className = 'toast-stack';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'false');
      doc.body.appendChild(host);
    }
    return host;
  }

  function removeMessage(node, { immediate = false } = {}) {
    const host = ensureMessageHost();
    if (!node?.isConnected) return;
    const finish = () => {
      node.remove();
      if (!host.children.length) {
        host.classList.remove('active');
        if (queuedMessages.length) {
          const next = queuedMessages.shift();
          showMessage(next.text, next.variant, next.options);
        }
      }
    };
    if (immediate) {
      finish();
      return;
    }
    node.classList.remove('show');
    host.classList.add('is-dismissing');
    window.setTimeout(() => {
      host.classList.remove('is-dismissing');
      finish();
    }, MESSAGE_EXIT_MS);
  }

  function removeToast(node) {
    if (!node?.isConnected) return;
    node.classList.remove('show');
    window.setTimeout(() => {
      node.remove();
    }, MESSAGE_EXIT_MS);
  }

  function showToast(text, variant = 'success', options = {}) {
    const host = ensureToastHost();
    const config = MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.info;
    const node = doc.createElement('div');
    node.className = `toast-message ${config.className || ''}`.trim();
    node.setAttribute('role', variant === 'error' || variant === 'warn' ? 'alert' : 'status');
    const icon = doc.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = config.icon || 'ℹ️';
    const body = doc.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Hinweis schließen');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => removeToast(node));
    node.appendChild(icon);
    node.appendChild(body);
    node.appendChild(closeBtn);
    host.appendChild(node);
    window.requestAnimationFrame?.(() => node.classList.add('show'));
    if (typeof window.requestAnimationFrame !== 'function') {
      node.classList.add('show');
    }
    const durationMs = Number(options.durationMs);
    const timeoutMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : TOAST_DURATION_MS;
    window.setTimeout(() => removeToast(node), timeoutMs);
    return node;
  }

  function showMessage(text, variant = 'info', options = {}) {
    const presentation = options.presentation || (variant === 'success' ? 'toast' : 'modal');
    if (presentation === 'toast') {
      return showToast(text, variant, options);
    }
    const host = ensureMessageHost();
    const shouldEnqueue = !!options.enqueue;
    const messageOptions = { ...options };
    delete messageOptions.enqueue;
    if (shouldEnqueue && host.children.length) {
      queuedMessages.push({ text, variant, options: messageOptions });
      return null;
    }
    const config = MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.info;
    const node = doc.createElement('div');
    node.className = `message ${config.className || ''}`.trim();
    const icon = doc.createElement('div');
    icon.className = 'message-icon';
    icon.textContent = config.icon || 'ℹ️';
    const body = doc.createElement('div');
    body.className = 'message-body';
    body.textContent = text;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'message-close';
    closeBtn.textContent = options.buttonLabel || 'OK';
    closeBtn.addEventListener('click', () => removeMessage(node));
    node.appendChild(icon);
    node.appendChild(body);
    node.appendChild(closeBtn);
    host.appendChild(node);
    host.classList.add('active');
    window.requestAnimationFrame?.(() => node.classList.add('show'));
    if (typeof window.requestAnimationFrame !== 'function') {
      node.classList.add('show');
    }
    closeBtn.focus({ preventScroll: true });
    return node;
  }

  return { showMessage };
}
