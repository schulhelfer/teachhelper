export const ERROR_REPORT_EVENT = 'teachhelper:error-report';

const ERROR_LOG_LIMIT = 50;

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

function rememberReport(report) {
  if (typeof window === 'undefined') return;
  const history = Array.isArray(window.__teachhelperErrorLog)
    ? window.__teachhelperErrorLog
    : [];
  history.push(report);
  if (history.length > ERROR_LOG_LIMIT) {
    history.splice(0, history.length - ERROR_LOG_LIMIT);
  }
  window.__teachhelperErrorLog = history;
  window.dispatchEvent(new CustomEvent(ERROR_REPORT_EVENT, { detail: report }));
}

export function reportError(error, userMessage = '', context = {}, options = {}) {
  const report = {
    timestamp: new Date().toISOString(),
    userMessage: normalizeUserMessage(userMessage),
    context: normalizeContext(context),
    error: serializeError(error),
  };

  const logger = options?.logger && typeof options.logger.error === 'function'
    ? options.logger
    : console;
  const scope = typeof report.context.scope === 'string' && report.context.scope.trim()
    ? report.context.scope.trim()
    : 'app';
  logger.error(`[TeachHelper:${scope}]`, report);
  rememberReport(report);

  if (report.userMessage && typeof options?.showMessage === 'function') {
    options.showMessage(report.userMessage, 'error');
  }

  return report;
}
