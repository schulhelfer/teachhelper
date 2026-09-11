export function createGroupsTutorialDefinition(context = {}) {
  const {
    TAB_GROUPS,
    createModuleTutorialStep,
    withSection,
    visibleTutorialNode,
    activateClassroomTutorialDemo,
  } = context;
  const steps = [
    ...withSection('Namen laden', [
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Namensliste importieren',
        copy: 'Wähle eine CSV oder ziehe sie hierher. Gruppen-Modul und Picker arbeiten anschließend mit derselben Liste.',
        target: (nodes) => nodes.csvDropZone,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Aus dem Notenmodul übernehmen',
        copy: 'Statt einer CSV kannst du die Teilnehmenden eines Notenkurses übernehmen. Der Knopf erscheint, sobald im Notenmodul Kurse mit Teilnehmenden vorhanden sind.',
        target: (nodes) => (
          visibleTutorialNode(nodes.gradeRosterImportTrigger)
          || visibleTutorialNode(nodes.gradeRosterPills)
          || nodes.csvDropZone
        ),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Vorlage für die Namensliste',
        copy: 'Über diesen Link lädst du eine leere CSV-Vorlage herunter. Sie zeigt, welche Spalten die Liste haben muss.',
        target: (nodes) => nodes.templateLink,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Freie Lernende',
        copy: 'Alle noch nicht eingeteilten Personen sammeln sich hier. Von dort ziehst du sie per Drag-and-drop in eine Gruppe.',
        target: (nodes) => nodes.unseated?.querySelector('.student') || nodes.unseated,
        placement: 'right',
      }),
    ]),
    ...withSection('Gruppen bilden', [
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Minimale Gruppengröße',
        copy: 'Die Mindestgröße legt fest, wie viele Personen eine Gruppe mindestens hat. Zu kleine Reste werden auf die übrigen Gruppen verteilt.',
        target: (nodes) => nodes.minGroupSize || nodes.groupSizeControls,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Maximale Gruppengröße',
        copy: 'Die Maximalgröße begrenzt, wie voll eine Gruppe werden darf. Aus beiden Werten ergibt sich, wie viele Gruppen entstehen.',
        target: (nodes) => nodes.maxGroupSize || nodes.groupSizeControls,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppenraster',
        copy: 'Aus Namensliste und Gruppengröße entstehen automatisch passende Gruppenfelder. Jedes Feld ist eine Gruppe.',
        target: (nodes) => nodes.groupsGrid?.querySelector('.seat') || nodes.groupsGrid,
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppenkriterien öffnen',
        copy: 'Hier pflegst du Sitzwünsche, Ausschlüsse und Leistungsklassen. Nur der Vorschlag wertet diese Angaben aus.',
        target: (nodes) => nodes.groupSeatPreferences,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Vorschlag erzeugen',
        copy: 'Der Vorschlag berücksichtigt Größe, Wünsche, Ausschlüsse und gesperrte Gruppen. Jeder Aufruf erzeugt eine neue Einteilung.',
        target: (nodes) => nodes.groupSuggest,
        placement: 'right',
      }),
    ]),
    ...withSection('Anpassen', [
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Einteilung manuell anpassen',
        copy: 'Ziehe Personen in eine andere Gruppe. Legst du eine Person auf einer anderen ab, tauschen die beiden ihre Gruppen.',
        target: (nodes) => (
          nodes.unseated?.querySelector('.student')
          || nodes.groupsGrid?.querySelector('.seat-chip')
          || nodes.groupsGrid?.querySelector('.seat')
          || null
        ),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppen sperren',
        copy: 'Doppelklick sperrt eine Gruppe. Ein neuer Vorschlag lässt gesperrte Gruppen unverändert.',
        target: (nodes) => nodes.groupsGrid?.querySelector('.seat'),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppenthemen eintragen',
        copy: 'Klicke die Themenzeile einer Gruppe an, um Thema oder Station einzutragen. Sie wird mitgespeichert und mitgedruckt.',
        target: (nodes) => nodes.groupsGrid?.querySelector('.seat-topic'),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Weitere Gruppe hinzufügen',
        copy: 'Klicke den gestrichelten Platzhalter oder ziehe eine Person darauf, um eine zusätzliche Gruppe anzulegen.',
        target: (nodes) => nodes.groupsGrid?.querySelector('.seat-placeholder'),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppe löschen',
        copy: 'Über den Papierkorb entfernst du eine Gruppe. Ihre Lernenden wechseln dabei zurück in die Liste der freien Lernenden.',
        target: (nodes) => nodes.groupsGrid?.querySelector('.seat-delete-button'),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Belegung zurücksetzen',
        copy: 'Löst Gruppen, Sperren und Themen auf einmal. Die Namensliste selbst bleibt erhalten.',
        target: (nodes) => nodes.groupResetLearners,
        placement: 'right',
      }),
    ]),
    ...withSection('Sichern und Drucken', [
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppeneinteilung laden',
        copy: 'Lade eine gespeicherte Einteilung, wenn du später daran weiterarbeitest. Die aktuelle Einteilung wird dabei ersetzt.',
        target: (nodes) => nodes.groupImportPlan || nodes.groupPlanActions,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppeneinteilung speichern',
        copy: 'Speichere Namen, Gruppen, Themen und Sperren als Datei. Ohne Speichern geht die Einteilung beim Schließen verloren.',
        target: (nodes) => nodes.groupExportPlan || nodes.groupPlanActions,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_GROUPS,
        title: 'Gruppen drucken',
        copy: 'Drucke die aktuelle Einteilung samt eingetragener Themen als Übersicht für die Lerngruppe.',
        target: (nodes) => nodes.groupPrintPlan || nodes.groupPlanActions,
        placement: 'right',
      }),
    ]),
  ];
  return {
    steps,
    demo: {
      activate: () => activateClassroomTutorialDemo(TAB_GROUPS),
      auto: true,
    },
  };
}
