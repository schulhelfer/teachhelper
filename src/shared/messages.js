const MESSAGE_VARIANTS = {
  info: { icon: 'ℹ️', className: 'message-info' },
  warn: { icon: '⚠️', className: 'message-warn' },
  error: { icon: '✖️', className: 'message-error' },
  success: { icon: '✔️', className: 'message-success' },
};

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

  function removeMessage(node) {
    const host = ensureMessageHost();
    if (!node?.isConnected) return;
    node.remove();
    if (!host.children.length) {
      host.classList.remove('active');
      if (queuedMessages.length) {
        const next = queuedMessages.shift();
        showMessage(next.text, next.variant, next.options);
      }
    }
  }

  function showMessage(text, variant = 'info', options = {}) {
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
    closeBtn.focus({ preventScroll: true });
    return node;
  }

  return { showMessage };
}
