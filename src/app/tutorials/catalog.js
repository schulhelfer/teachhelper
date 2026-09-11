import {
  TAB_DUPLICATE_CHECK,
  TAB_GRADES,
  TAB_GROUPS,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
  TAB_WORK_PHASE,
} from '../../shell/tabs.js';
import { createDuplicateCheckTutorialDefinition } from './duplicate-check.js';
import { createGradesTutorialDefinition } from './grades.js';
import { createGroupsTutorialDefinition } from './groups.js';
import { createMergerTutorialDefinition } from './merger.js';
import { createNameLearningTutorialDefinition } from './name-learning.js';
import { createPlanningTutorialDefinition } from './planning.js';
import { createQrTutorialDefinition } from './qr.js';
import { createRandomPickerTutorialDefinition } from './random-picker.js';
import { createSeatplanTutorialDefinition } from './seatplan.js';
import { createWorkPhaseTutorialDefinition } from './work-phase.js';

const OPAQUE_FRAME_TABS = new Set([
  TAB_MERGER,
  TAB_DUPLICATE_CHECK,
  TAB_QR,
  TAB_NAME_LEARNING,
]);

const MODULE_INTROS = {
  [TAB_GRADES]: {
    title: 'Noten',
    copy: 'Hier werden Kurse, Leistungen und geschützte Notendaten verwaltet.',
    target: (nodes) => nodes.tabGrades,
  },
  [TAB_PLANNING]: {
    title: 'Planung',
    copy: 'Hier werden Wochen, Serien und Unterrichtsverläufe geplant.',
    target: (nodes) => nodes.tabPlanning,
  },
  [TAB_SEATPLAN]: {
    title: 'Sitzplan',
    copy: 'Hier werden Sitzpläne erstellt und Kriterien für Vorschläge genutzt.',
    target: (nodes) => nodes.tabSeatplan,
  },
  [TAB_MERGER]: {
    title: 'PDF-Tools',
    copy: 'Hier werden PDFs neu angeordnet, verbunden, gedreht oder aufgeteilt.',
    target: (nodes) => nodes.tabMerger,
  },
  [TAB_GROUPS]: {
    title: 'Gruppen',
    copy: 'Hier werden Lernende eingeteilt und Gruppen optimiert.',
    target: (nodes) => nodes.tabGroups,
  },
  [TAB_RANDOM_PICKER]: {
    title: 'Picker',
    copy: 'Hier wird eine Person zufällig und bei Bedarf gewichtet ausgewählt.',
    target: (nodes) => nodes.tabRandomPicker,
  },
  [TAB_DUPLICATE_CHECK]: {
    title: 'DuplikatCheck',
    copy: 'Hier werden ZIP-Abgaben auf mögliche Duplikate geprüft.',
    target: (nodes) => nodes.tabDuplicateCheck,
  },
  [TAB_WORK_PHASE]: {
    title: 'Arbeitsphase',
    copy: 'Hier werden Arbeitsauftrag, Timer und Lautstärkeampel angezeigt.',
    target: (nodes) => nodes.tabWorkPhase,
  },
  [TAB_QR]: {
    title: 'QR',
    copy: 'Hier werden QR-Codes erstellt oder vorhandene Codes ausgelesen.',
    target: (nodes) => nodes.tabQr,
  },
  [TAB_NAME_LEARNING]: {
    title: 'Namen lernen',
    copy: 'Hier werden Namen mit Karteikarten aus den Fotos des Notenmoduls geübt.',
    target: (nodes) => nodes.tabNameLearning,
  },
};

export function createTutorialCatalog({
  shellSupportsExternalFileSync = false,
  getComputedStyle = () => null,
  frames = {},
  actions = {},
  demos = {},
} = {}) {
  const createModuleTutorialStep = ({
    tab,
    title,
    copy,
    target,
    section = '',
    placement = 'bottom',
    anchor = 'center',
    offsetX = 0,
    offsetY = 0,
    highlightPadding = 7,
    beforeRender = null,
    skipIfMissing = true,
  }) => {
    const step = {
      title,
      copy,
      target,
      tab,
      section,
      placement,
      anchor,
      offsetX,
      offsetY,
      highlightPadding,
      expandChrome: true,
      skipIfMissing,
    };
    if (typeof beforeRender === 'function') step.beforeRender = beforeRender;
    return step;
  };

  const visibleTutorialNode = (node) => {
    if (!node || node.hidden || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const style = getComputedStyle(node);
    return style?.display !== 'none' && style?.visibility !== 'hidden' ? node : null;
  };

  const withSection = (section, steps) => {
    steps.forEach((step) => {
      if (step && typeof step === 'object') step.section = section;
    });
    return steps;
  };

  const createFrameTarget = (getFrame) => (
    selector,
    resolveFallback = () => null
  ) => (
    (nodes) => ({
      frame: getFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );

  const common = { createModuleTutorialStep, visibleTutorialNode, withSection };
  const context = {
    ...common,
    TAB_DUPLICATE_CHECK,
    TAB_GRADES,
    TAB_GROUPS,
    TAB_MERGER,
    TAB_NAME_LEARNING,
    TAB_PLANNING,
    TAB_QR,
    TAB_RANDOM_PICKER,
    TAB_SEATPLAN,
    TAB_WORK_PHASE,
    shellSupportsExternalFileSync,
    planningFrameTarget: createFrameTarget(frames.getPlanningFrame),
    gradesFrameTarget: createFrameTarget(frames.getGradesFrame),
    mergerFrameTarget: createFrameTarget(frames.getMergerFrame),
    duplicateCheckFrameTarget: createFrameTarget(frames.getDuplicateCheckFrame),
    qrFrameTarget: createFrameTarget(frames.getQrFrame),
    seatplanFrameTarget: createFrameTarget(frames.getSeatplanFrame),
    nameLearningFrameTarget: createFrameTarget(frames.getNameLearningFrame),
    getSeatplanFrame: frames.getSeatplanFrame,
    preparePlanningTutorialSurface: actions.preparePlanningTutorialSurface,
    prepareGradesTutorialSurface: actions.prepareGradesTutorialSurface,
    openMergerToolForTutorial: actions.openMergerToolForTutorial,
    openQrToolForTutorial: actions.openQrToolForTutorial,
    prepareNameLearningTutorialSurface: actions.prepareNameLearningTutorialSurface,
    activateGradesTutorialDemo: demos.activateGradesTutorialDemo,
    activatePlanningTutorialDemo: demos.activatePlanningTutorialDemo,
    activateSeatplanTutorialDemo: demos.activateSeatplanTutorialDemo,
    activateClassroomTutorialDemo: demos.activateClassroomTutorialDemo,
    activateDuplicateCheckTutorialDemo: demos.activateDuplicateCheckTutorialDemo,
    activateWorkPhaseTutorialDemo: demos.activateWorkPhaseTutorialDemo,
    activateQrTutorialDemo: demos.activateQrTutorialDemo,
    activateNameLearningTutorialDemo: demos.activateNameLearningTutorialDemo,
  };

  const builders = {
    [TAB_GRADES]: () => createGradesTutorialDefinition(context),
    [TAB_PLANNING]: () => createPlanningTutorialDefinition(context),
    [TAB_MERGER]: () => createMergerTutorialDefinition(context),
    [TAB_SEATPLAN]: () => createSeatplanTutorialDefinition({
      ...context,
      seatplanTutorialDemoActive: demos.isSeatplanTutorialDemoActive?.() === true,
    }),
    [TAB_GROUPS]: () => createGroupsTutorialDefinition(context),
    [TAB_RANDOM_PICKER]: () => createRandomPickerTutorialDefinition(context),
    [TAB_DUPLICATE_CHECK]: () => createDuplicateCheckTutorialDefinition(context),
    [TAB_WORK_PHASE]: () => createWorkPhaseTutorialDefinition(context),
    [TAB_QR]: () => createQrTutorialDefinition(context),
    [TAB_NAME_LEARNING]: () => createNameLearningTutorialDefinition(context),
  };

  const getDefinition = ({ activeTab } = {}) => {
    const definition = builders[activeTab]
      ? builders[activeTab]()
      : [createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Detailtour wählen',
        copy: 'Über 🛟 startet die Einführung für das jeweils geöffnete Modul.',
        target: (nodes) => nodes.firstRunTutorialStart || nodes.appHeader,
        placement: 'top',
      })];
    const steps = Array.isArray(definition) ? definition : definition?.steps;
    const intro = MODULE_INTROS[activeTab];
    if (!intro) return definition;
    const introStep = createModuleTutorialStep({
      tab: activeTab,
      section: 'Überblick',
      ...intro,
      placement: 'bottom',
      anchor: 'center',
      skipIfMissing: !OPAQUE_FRAME_TABS.has(activeTab),
    });
    if (Array.isArray(definition)) return [introStep, ...definition];
    return {
      ...definition,
      steps: [introStep, ...(Array.isArray(steps) ? steps : [])],
    };
  };

  return { getDefinition };
}
