import {
  createModuleFrame,
  ISOLATED_MODULE_SANDBOX,
  postToModule,
} from '../../shared/module-frame-bridge.js';

const NAME_LEARNING_URL = new URL('./app.html', import.meta.url);

export function mountNameLearning({ host } = {}) {
  if (!host || host.dataset.initialized === '1') return host?._nameLearningController || null;
  host.textContent = '';
  const frame = createModuleFrame({
    className: 'name-learning-frame',
    loading: 'lazy',
    src: NAME_LEARNING_URL,
    title: 'Namen lernen',
    sandbox: ISOLATED_MODULE_SANDBOX,
  });
  let disposed = false;
  let ready = false;
  const pending = [];
  const post = (payload) => {
    if (disposed || !payload || typeof payload !== 'object') return false;
    if (!ready || !frame.contentWindow) {
      pending.push(payload);
      return true;
    }
    return postToModule(frame, payload);
  };
  const onLoad = () => {
    if (disposed) return;
    ready = true;
    while (pending.length) postToModule(frame, pending.shift());
  };
  const controller = {
    frame,
    post,
    dispose() {
      if (disposed) return;
      disposed = true;
      ready = false;
      pending.length = 0;
      frame.removeEventListener('load', onLoad);
      if (frame.isConnected) frame.remove();
      delete host.dataset.initialized;
      if (host._nameLearningController === controller) delete host._nameLearningController;
    },
  };
  frame.addEventListener('load', onLoad);
  host.append(frame);
  host.dataset.initialized = '1';
  host._nameLearningController = controller;
  return controller;
}
