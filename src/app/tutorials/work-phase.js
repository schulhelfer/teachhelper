export function createWorkPhaseTutorialDefinition(context = {}) {
  const {
    TAB_WORK_PHASE,
    createModuleTutorialStep,
    withSection,
    visibleTutorialNode,
    activateWorkPhaseTutorialDemo,
  } = context;
  const workPhaseFallback = (nodes) => nodes.workOrderPanel || nodes.monitorShell || nodes.tabWorkPhase;
  const isVisibleTarget = (node) => {
    if (!node || node.hidden) return false;
    const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  };
  const activeTimerButton = (nodes) => (
    isVisibleTarget(nodes.timerWorkOrderStop) && !nodes.timerWorkOrderStop.disabled
      ? nodes.timerWorkOrderStop
      : nodes.timerWorkOrderStart
  );
  const activeMonitorButton = (nodes) => (
    isVisibleTarget(nodes.monitorMicStopButton) && !nodes.monitorMicStopButton.disabled
      ? nodes.monitorMicStopButton
      : nodes.monitorMicStartButton
  );
  const steps = [
    ...withSection('Arbeitsauftrag', [
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Arbeitsphase im Überblick',
        copy: 'Arbeitsauftrag, Timer und Lautstärkeampel lassen sich gemeinsam oder einzeln nutzen. Nichts davon muss eingeschaltet sein.',
        target: (nodes) => nodes.workOrderPanel || nodes.monitorShell || nodes.tabWorkPhase,
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Arbeitsauftrag eingeben',
        copy: 'Der Text wird sofort übernommen und bleibt auch beim Wechsel in ein anderes Modul erhalten.',
        target: (nodes) => nodes.workOrderTextarea || nodes.workOrderPanel || nodes.tabWorkPhase,
        placement: 'top',
      }),
    ]),
    ...withSection('Timer', [
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Arbeitsdauer festlegen',
        copy: 'Trage die Minuten direkt ein oder ändere sie mit Plus und Minus.',
        target: (nodes) => nodes.timerDurationField || nodes.workOrderDurationInput || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Dauer per Schieberegler',
        copy: 'Der Regler darunter stellt dieselbe Dauer grob ein – schneller, wenn es nicht auf die Minute ankommt.',
        target: (nodes) => nodes.workOrderDurationRange || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Zwischenwarnungen konfigurieren',
        copy: 'Schalte Töne bei der Hälfte und bei drei Vierteln der Zeit ein, damit die Lerngruppe ihr Tempo einschätzen kann.',
        target: (nodes) => nodes.timerHalfToneButton || nodes.timerQuarterToneButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Zeitliche Warnungen',
        copy: 'Zu denselben Zeitpunkten – 50 %, 75 % und Ende – wird der Timer auch sichtbar hervorgehoben. Das wirkt auch ohne Ton.',
        target: (nodes) => nodes.timerPanel || nodes.timerWarningBanner || workPhaseFallback(nodes),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Endsignal konfigurieren',
        copy: 'Der Endton lässt sich unabhängig von den Zwischentönen abschalten. Der sichtbare Endalarm bleibt in jedem Fall aktiv.',
        target: (nodes) => nodes.timerEndToneButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Sekunden ein- oder ausblenden',
        copy: 'Ohne Sekunden wirkt die Restzeit ruhiger, mit Sekunden ist sie genauer.',
        target: (nodes) => nodes.timerSecondsToggleButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Arbeitszeit starten',
        copy: 'Das Uhrsymbol startet den Countdown mit der eingestellten Dauer.',
        target: (nodes) => nodes.timerWorkOrderStart || nodes.timerWorkOrderActions || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Restzeit und Endzeit',
        copy: 'Während der Timer läuft, siehst du hier die verbleibende Zeit und die Uhrzeit, zu der die Phase endet.',
        target: (nodes) => nodes.workOrderMeta || nodes.timerPanel || workPhaseFallback(nodes),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Timer stoppen',
        copy: 'Wenn der Timer läuft, erscheint hier das aktive Uhrsymbol zum Stoppen. Ein Neustart beginnt wieder bei der vollen Dauer.',
        target: (nodes) => activeTimerButton(nodes) || nodes.workOrderRestClock || nodes.timerPanel || workPhaseFallback(nodes),
        placement: 'right',
      }),
    ]),
    ...withSection('Lautstärkeampel', [
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Ampelschwellen festlegen',
        copy: 'Ab welcher Lautstärke Gelb und Rot gelten, hängt von Mikrofon, Gerät und Raum ab. Probiere die Werte einmal im echten Raum aus.',
        target: (nodes) => nodes.monitorThresholdControls || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Ampel-Warntöne',
        copy: 'Gelb und Rot haben getrennte Warntöne, die sich bei anhaltender Lautstärke wiederholen.',
        target: (nodes) => nodes.monitorToneControls || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Lautstärkeüberwachung starten',
        copy: 'Das Ampelsymbol startet die Messung und fragt nach Mikrofonfreigabe. Es wird nur die Lautstärke gemessen, nichts aufgezeichnet.',
        target: (nodes) => nodes.monitorMicStartButton || nodes.monitorMicActions || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Ampelfarben verstehen',
        copy: 'Grün, Gelb und Rot folgen deinen Schwellen. Die Anzeige ist geglättet, damit ein einzelnes lautes Geräusch nicht sofort auf Rot springt.',
        target: (nodes) => nodes.monitorAmpel || nodes.monitorShell || workPhaseFallback(nodes),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Überwachung stoppen',
        copy: 'Während der Messung erscheint hier das aktive Ampelsymbol. Es beendet die Messung und gibt das Mikrofon wieder frei.',
        target: (nodes) => activeMonitorButton(nodes) || nodes.monitorMicActions || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
        placement: 'right',
      }),
    ]),
    ...withSection('Präsentieren', [
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Präsentationsansicht',
        copy: 'Das Vollbild blendet die Bedienung aus und zeigt Auftrag, Ampel und Timer groß – gedacht für den Beamer.',
        target: (nodes) => nodes.chromeToggle || nodes.appHeader || nodes.tabWorkPhase,
        placement: 'bottom',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Automatisches Vollbildlayout',
        copy: 'Das Layout passt sich an: Ohne Timer wird der Auftrag größer, ohne Auftrag rücken Ampel und Timer in den Mittelpunkt.',
        target: (nodes) => nodes.monitorShell || nodes.workOrderShell || nodes.timerShell || nodes.tabWorkPhase,
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Schnellaktionen im Vollbild',
        copy: 'Auch im Vollbild bleiben Timer und Mikrofon über kleine Knöpfe erreichbar, ohne die Ansicht zu verlassen.',
        target: (nodes) => (
          visibleTutorialNode(nodes.workPhaseTimerStartCollapsed)
          || visibleTutorialNode(nodes.workPhaseMonitorStartCollapsed)
          || nodes.chromeToggle
          || nodes.appHeader
          || nodes.tabWorkPhase
        ),
        placement: 'bottom',
      }),
      createModuleTutorialStep({
        tab: TAB_WORK_PHASE,
        title: 'Vollbild verlassen',
        copy: 'Escape oder dieser Knopf holen die Bedienung zurück. Timer und Messung laufen dabei ungestört weiter.',
        target: (nodes) => (
          visibleTutorialNode(nodes.chromeOverlayToggle)
          || nodes.chromeToggle
          || nodes.appHeader
          || nodes.tabWorkPhase
        ),
        placement: 'bottom',
      }),
    ]),
  ];
  return {
    steps,
    demo: {
      activate: activateWorkPhaseTutorialDemo,
      auto: true,
    },
  };
}
