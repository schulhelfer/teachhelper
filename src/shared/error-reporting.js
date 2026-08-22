function normalizeUserMessage(userMessage) {
  return typeof userMessage === 'string' ? userMessage.trim() : '';
}

function normalizeContext(context) {
  return context && typeof context === 'object' && !Array.isArray(context)
    ? { ...context }
    : {};
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: typeof error.stack === 'string' ? error.stack : '',
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      stack: '',
    };
  }
  return {
    name: 'Error',
    message: 'Unknown error',
    stack: '',
    value: error,
  };
}

export function reportError(error, userMessage = '', context = {}, options = {}) {
  const report = {
    timestamp: new Date().toISOString(),
    userMessage: normalizeUserMessage(userMessage),
    context: normalizeContext(context),
    error: serializeError(error),
  };

  if (report.userMessage && typeof options?.showMessage === 'function') {
    options.showMessage(report.userMessage, 'error');
  }

  return report;
}
