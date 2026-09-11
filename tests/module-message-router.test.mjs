import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const [routerFileSource, bridgeSource, themeSource, tutorialStateSource, tabsSource] = await Promise.all([
  read('../src/app/module-message-router.js'),
  read('../src/shared/module-frame-bridge.js'),
  read('../src/shared/theme.js'),
  read('../src/shared/tutorial-entry-state.js'),
  read('../src/shell/tabs.js'),
]);
let routerSource = routerFileSource
  .replace("'../shared/module-frame-bridge.js'", `'${dataUrl(bridgeSource)}'`)
  .replace("'../shared/theme.js'", `'${dataUrl(themeSource)}'`)
  .replace("'../shared/tutorial-entry-state.js'", `'${dataUrl(tutorialStateSource)}'`)
  .replace("'../shell/tabs.js'", `'${dataUrl(tabsSource)}'`);
const [routerModule, tabs] = await Promise.all([
  import(dataUrl(routerSource)),
  import(dataUrl(tabsSource)),
]);

const ORIGIN = 'https://teachhelper.test';
globalThis.window = { origin: ORIGIN, location: { href: `${ORIGIN}/index.html`, origin: ORIGIN } };

const roleGetters = {
  planning: 'getPlanningFrame',
  grades: 'getGradesFrame',
  merger: 'getMergerFrame',
  duplicateCheck: 'getDuplicateCheckFrame',
  qr: 'getQrFrame',
  seatplan: 'getSeatplanFrame',
  nameLearning: 'getNameLearningFrame',
};

const handlerNames = [
  'onPlanningViewRequest',
  'onNameLearningRequest',
  'onNameLearningManageStudentsRequest',
  'onThemePreferenceChange',
  'onToastRequest',
  'onMoreToolsDismiss',
  'onOpenExternalRequest',
  'onMergerOpenResultRequest',
  'onGradesNavigate',
  'onGradeVaultActivity',
  'onGradeVaultRequest',
  'onSidebarWidthRequest',
  'onSidebarWidthCommit',
  'onSidebarCollapseRequest',
  'onSeatplanChromeRequest',
  'onTutorialEntryHint',
  'onHelpEntryRequest',
];

function createFrame(role, { opaque = false } = {}) {
  const nonce = `${role}-nonce`;
  return {
    dataset: {
      moduleFrameNonce: nonce,
      ...(opaque ? { moduleOpaqueOrigin: '1' } : {}),
    },
    contentWindow: { origin: opaque ? 'null' : ORIGIN },
    getAttribute: (name) => (name === 'src' ? `${ORIGIN}/src/modules/${role}/app.html` : null),
  };
}

function createMessageTarget() {
  const listeners = new Set();
  return {
    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') listeners.delete(listener);
    },
    dispatch(event) {
      listeners.forEach((listener) => listener(event));
    },
    listenerCount: () => listeners.size,
  };
}

function createHarness() {
  const currentFrames = Object.fromEntries(Object.keys(roleGetters).map((role) => [role, createFrame(role)]));
  const frames = Object.fromEntries(Object.entries(roleGetters).map(([role, getter]) => [
    getter,
    () => currentFrames[role],
  ]));
  const calls = [];
  const handlers = Object.fromEntries(handlerNames.map((name) => [name, (...args) => {
    calls.push({ name, args });
  }]));
  const messageTarget = createMessageTarget();
  const router = routerModule.createModuleMessageRouter({ messageTarget, frames, handlers });
  const message = (role, type, detail, overrides = {}) => ({
    source: currentFrames[role].contentWindow,
    origin: ORIGIN,
    data: { type, detail },
    ...overrides,
  });
  return { calls, currentFrames, frames, handlers, message, messageTarget, router };
}

test('routes every known message type to its existing authorized adapter', () => {
  const harness = createHarness();
  const validCases = [
    ['seatplan', tabs.PLANNING_VIEW_REQUEST_EVENT, 'onPlanningViewRequest', { source: 'iframe', view: 'grades' }, 0],
    ['nameLearning', tabs.NAME_LEARNING_DATA_REQUEST_EVENT, 'onNameLearningRequest', { requestId: 'data' }, 1],
    ['nameLearning', tabs.NAME_LEARNING_REVIEW_REQUEST_EVENT, 'onNameLearningRequest', { requestId: 'review' }, 1],
    ['nameLearning', tabs.NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT, 'onNameLearningRequest', { courseId: 1 }, 1],
    ['nameLearning', tabs.NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT, 'onNameLearningRequest', { query: 'Ada' }, 1],
    ['nameLearning', tabs.NAME_LEARNING_MANAGE_STUDENTS_REQUEST_EVENT, 'onNameLearningManageStudentsRequest', { courseId: 2 }, 0],
    ['planning', 'classroom:theme-preference-change', 'onThemePreferenceChange', { preference: 'light' }, 0],
    ['grades', 'classroom:toast-request', 'onToastRequest', { source: 'iframe', message: 'Gespeichert' }, 0],
    ['duplicateCheck', 'classroom:more-tools-dismiss', 'onMoreToolsDismiss', { reason: 'pointer' }, 0],
    ['qr', tabs.MODULE_OPEN_EXTERNAL_REQUEST_EVENT, 'onOpenExternalRequest', { url: 'https://example.test' }, 0],
    ['merger', tabs.MERGER_OPEN_RESULT_REQUEST_EVENT, 'onMergerOpenResultRequest', { bytes: new ArrayBuffer(2) }, 0],
    ['planning', tabs.GRADES_NAVIGATE_EVENT, 'onGradesNavigate', { courseId: 3 }, 0],
    ['grades', tabs.GRADES_GRADE_VAULT_ACTIVITY_EVENT, 'onGradeVaultActivity', { source: 'grades' }, 0],
    ['grades', tabs.GRADES_GRADE_VAULT_REQUEST_EVENT, 'onGradeVaultRequest', { action: 'unlock' }, 0],
    ['planning', 'classroom:sidebar-width-request', 'onSidebarWidthRequest', { scope: 'planning' }, 0],
    ['qr', 'classroom:sidebar-width-commit', 'onSidebarWidthCommit', { scope: 'other', width: 360 }, 0],
    ['seatplan', 'classroom:sidebar-collapse-request', 'onSidebarCollapseRequest', { scope: 'other' }, 0],
    ['seatplan', 'classroom:seatplan-chrome-request', 'onSeatplanChromeRequest', { source: 'iframe', collapsed: true }, 0],
    ['merger', 'classroom:tutorial-entry-hint-sync', 'onTutorialEntryHint', { action: 'request' }, 0],
    ['nameLearning', 'classroom:help-entry-request', 'onHelpEntryRequest', { source: 'module' }, 0],
  ];

  validCases.forEach(([role, type, handler, detail, detailIndex]) => {
    harness.calls.length = 0;
    assert.equal(harness.router.handleMessage(harness.message(role, type, detail)), true, type);
    assert.equal(harness.calls.length, 1, type);
    assert.equal(harness.calls[0].name, handler, type);
    assert.equal(harness.calls[0].args[detailIndex], detail, type);
    const metadata = harness.calls[0].args.at(-1);
    assert.equal(metadata.frame, harness.currentFrames[role], type);
    assert.equal(metadata.role, role, type);
  });
});

test('keeps detail defaults and sidebar scope metadata compatible', () => {
  const harness = createHarness();
  for (const [role, type, handler, detailIndex] of [
    ['nameLearning', tabs.NAME_LEARNING_DATA_REQUEST_EVENT, 'onNameLearningRequest', 1],
    ['planning', tabs.GRADES_NAVIGATE_EVENT, 'onGradesNavigate', 0],
    ['grades', tabs.GRADES_GRADE_VAULT_REQUEST_EVENT, 'onGradeVaultRequest', 0],
  ]) {
    harness.calls.length = 0;
    assert.equal(harness.router.handleMessage(harness.message(role, type, 'invalid')), true);
    assert.equal(harness.calls[0].name, handler);
    assert.deepEqual(harness.calls[0].args[detailIndex], {});
  }

  harness.calls.length = 0;
  harness.router.handleMessage(harness.message('grades', 'classroom:sidebar-width-request', { scope: 'planning' }));
  assert.equal(harness.calls[0].args.at(-1).scope, routerModule.SIDEBAR_WIDTH_SCOPE_PLANNING);
  harness.calls.length = 0;
  harness.router.handleMessage(harness.message('qr', 'classroom:sidebar-width-commit', { scope: 'invalid', width: 480 }));
  assert.equal(harness.calls[0].args.at(-1).scope, routerModule.SIDEBAR_WIDTH_SCOPE_OTHER);
});

test('ignores malformed, unknown, markerless, and wrong-role messages', () => {
  const harness = createHarness();
  const ignored = [
    harness.message('planning', 'classroom:unknown', {}),
    harness.message('planning', tabs.PLANNING_VIEW_REQUEST_EVENT, { source: 'iframe' }),
    harness.message('seatplan', tabs.PLANNING_VIEW_REQUEST_EVENT, { source: 'shell' }),
    harness.message('qr', 'classroom:toast-request', { source: 'iframe', message: 'Nein' }),
    harness.message('planning', 'classroom:toast-request', { message: 'Nein' }),
    harness.message('planning', tabs.MODULE_OPEN_EXTERNAL_REQUEST_EVENT, { url: 'https://example.test' }),
    harness.message('qr', tabs.MERGER_OPEN_RESULT_REQUEST_EVENT, {}),
    harness.message('planning', tabs.GRADES_GRADE_VAULT_REQUEST_EVENT, {}),
    harness.message('planning', 'classroom:sidebar-width-request', { scope: 'other' }),
    harness.message('qr', 'classroom:sidebar-width-commit', { scope: 'planning' }),
    harness.message('planning', 'classroom:seatplan-chrome-request', { source: 'iframe' }),
    harness.message('seatplan', 'classroom:seatplan-chrome-request', { source: 'shell' }),
    harness.message('seatplan', 'classroom:tutorial-entry-hint-sync', { action: 'unknown' }),
    { ...harness.message('planning', 'classroom:more-tools-dismiss', {}), data: null },
    { ...harness.message('planning', 'classroom:more-tools-dismiss', {}), data: 'message' },
  ];
  ignored.forEach((event) => assert.equal(harness.router.handleMessage(event), false));
  assert.equal(harness.calls.length, 0);
});

test('fails closed for forged source, origin, and opaque-frame nonce', () => {
  const harness = createHarness();
  const valid = harness.message('qr', tabs.MODULE_OPEN_EXTERNAL_REQUEST_EVENT, { url: 'https://example.test' });
  assert.equal(harness.router.handleMessage({ ...valid, source: {} }), false);
  assert.equal(harness.router.handleMessage({ ...valid, origin: 'https://attacker.test' }), false);

  const opaqueFrame = createFrame('qr', { opaque: true });
  harness.currentFrames.qr = opaqueFrame;
  const opaqueData = {
    type: tabs.MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
    detail: { url: 'https://example.test' },
    frameNonce: opaqueFrame.dataset.moduleFrameNonce,
  };
  assert.equal(harness.router.handleMessage({ source: opaqueFrame.contentWindow, origin: 'null', data: opaqueData }), true);
  assert.equal(harness.router.handleMessage({
    source: opaqueFrame.contentWindow,
    origin: 'null',
    data: { ...opaqueData, frameNonce: 'forged' },
  }), false);
});

test('uses current frame getters and removes its listener on dispose', () => {
  const harness = createHarness();
  const oldFrame = harness.currentFrames.merger;
  const nextFrame = createFrame('merger');
  harness.currentFrames.merger = nextFrame;
  assert.equal(harness.router.handleMessage({
    source: oldFrame.contentWindow,
    origin: ORIGIN,
    data: { type: 'classroom:more-tools-dismiss' },
  }), false);
  assert.equal(harness.router.handleMessage(harness.message('merger', 'classroom:more-tools-dismiss')), true);
  assert.equal(harness.messageTarget.listenerCount(), 1);
  harness.router.dispose();
  harness.router.dispose();
  assert.equal(harness.messageTarget.listenerCount(), 0);
  harness.calls.length = 0;
  harness.messageTarget.dispatch(harness.message('merger', 'classroom:more-tools-dismiss'));
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.router.handleMessage(harness.message('merger', 'classroom:more-tools-dismiss')), false);
});

test('keeps the router boundary independent and offline', async () => {
  const [mainSource, courseContextSource, serviceWorker, audit] = await Promise.all([
    read('../src/app/app-runtime.js'),
    read('../src/app/course-context.js'),
    read('../sw.js'),
    read('../scripts/audit.py'),
  ]);
  assert.match(routerFileSource, /import \{ isTrustedModuleMessage \} from '\.\.\/shared\/module-frame-bridge\.js';/);
  assert.doesNotMatch(routerFileSource, /src\/modules|\.\.\/modules\//);
  assert.match(mainSource, /createModuleMessageRouter\(\{/);
  assert.doesNotMatch(mainSource, /getModuleFrameForMessage|data\.type === SIDEBAR_WIDTH_REQUEST_EVENT|data\.type === TOAST_REQUEST_EVENT/);
  assert.match(mainSource, /createCourseContext\(\{/);
  assert.match(courseContextSource, /\[PLANNING_COURSE_CONTEXT_EVENT, rememberSharedCourseContext\]/);
  assert.match(courseContextSource, /\[GRADES_COURSE_CONTEXT_EVENT, rememberSharedCourseContext\]/);
  assert.match(serviceWorker, /\.\/src\/app\/module-message-router\.js/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'module-message-router\.js'/);
});
