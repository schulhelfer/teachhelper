export function createSeatplanTutorialDefinition(context = {}) {
  const {
    TAB_SEATPLAN,
    createModuleTutorialStep,
    withSection,
    seatplanFrameTarget,
    getSeatplanFrame,
    seatplanTutorialDemoActive,
    activateSeatplanTutorialDemo,
  } = context;
  const seatplanFallback = () => null;
  let seatplanApp = null;
  try {
    seatplanApp = getSeatplanFrame()?.contentDocument?.getElementById('app') || null;
  } catch {
    seatplanApp = null;
  }
  const isCourseSeatplan = !seatplanTutorialDemoActive && seatplanApp?.dataset.courseSeatplan === '1';
  const isCourseGradeMode = !seatplanTutorialDemoActive && seatplanApp?.dataset.courseGradeMode === '1';
  const steps = [
    ...withSection('Namen laden', [
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: isCourseSeatplan ? 'Kursliste aus dem Notenmodul' : 'Namensliste importieren',
        copy: isCourseSeatplan
          ? 'Die Teilnehmenden kommen aus dem verknüpften Notenkurs. Der Dateiimport ist deshalb gesperrt, damit beide Listen nicht auseinanderlaufen.'
          : 'Importiere eine CSV per Auswahl oder Drag-and-drop. Die Datei bleibt auf deinem Gerät und wird nicht hochgeladen.',
        target: seatplanFrameTarget('#csv-drop-zone', seatplanFallback),
        placement: 'right',
      }),
      ...(!isCourseSeatplan ? [createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Aus dem Notenmodul übernehmen',
        copy: 'Statt einer CSV kannst du die Teilnehmenden eines Notenkurses übernehmen. Der Knopf erscheint, sobald im Notenmodul Kurse mit Teilnehmenden vorhanden sind.',
        target: seatplanFrameTarget([
          '#grade-roster-import-trigger:not([hidden])',
          '#grade-roster-pills:not([hidden])',
          '#csv-drop-zone',
        ], seatplanFallback),
        placement: 'right',
        skipIfMissing: true,
      })] : []),
      ...(isCourseSeatplan ? [createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Kursbindung lösen',
        copy: 'Dieser Knopf löst die Verbindung zum Notenkurs wieder, damit du einen anderen Kurs oder eine eigene Liste verwenden kannst.',
        target: seatplanFrameTarget('#course-roster-reset-button', seatplanFallback),
        placement: 'right',
        skipIfMissing: true,
      })] : []),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Vorlage für die Namensliste',
        copy: 'Über diesen Link lädst du eine leere CSV-Vorlage herunter. Sie zeigt, welche Spalten die Liste haben muss.',
        target: seatplanFrameTarget('#template-link', seatplanFallback),
        placement: 'right',
        skipIfMissing: true,
      }),
    ]),
    ...withSection('Raum bauen', [
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Rastergröße anpassen',
        copy: 'Lege Zeilen und Spalten deines Raums fest oder verkleinere das Raster auf die tatsächlich aktiven Plätze.',
        target: seatplanFrameTarget('#adjust-grid', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Raumform auswählen',
        copy: 'Die Vorlagen erzeugen U-Form, Reihen oder Reihen mit Mittelgang als Startpunkt. Danach lässt sich jeder Platz einzeln verändern.',
        target: seatplanFrameTarget('#tutorial-seat-patterns', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzplätze festlegen',
        copy: 'Ein Klick auf ein Feld aktiviert oder deaktiviert den Platz. Nur aktive Plätze dürfen später belegt werden.',
        target: seatplanFrameTarget(['#grid .seat.active', '#grid'], seatplanFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Zweiertische festlegen',
        copy: 'Hier bestimmst du, ob nebeneinanderliegende Plätze als Zweiertisch gelten. Der Vorschlag beachtet das bei Sitzwünschen und Einzelplätzen.',
        target: seatplanFrameTarget('#tutorial-two-seat-options', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Lehrkraft platzieren',
        copy: 'Ziehe die Lehrkraft auf einen Platz. Ihre Position zählt für das Kriterium „weit vorne“.',
        target: seatplanFrameTarget(['#teacher-card', '#grid .seat-content.teacher'], seatplanFallback),
        placement: 'right',
      }),
    ]),
    ...withSection('Verteilen', [
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzkriterien eingeben',
        copy: 'Lege pro Person Wünsche, Ausschlüsse, Einzelplätze und Plätze weit vorne fest. Diese Angaben steuern den späteren Vorschlag.',
        target: seatplanFrameTarget('#seat-preferences', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Vorschlag oder Zufall',
        copy: '„Vorschlag“ sucht eine Verteilung, die deine Kriterien möglichst gut erfüllt. „Zufall“ verteilt ohne jede Optimierung.',
        target: seatplanFrameTarget('#tutorial-distribution-actions', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Kriterien auswerten',
        copy: 'Der Score fasst zusammen, wie viele deiner Kriterien erfüllt sind. Ein niedriger Wert heißt meist, dass sich Wünsche und Ausschlüsse widersprechen.',
        target: seatplanFrameTarget(['#sidebar-score', '.seat-score', '#grid'], seatplanFallback),
        placement: 'bottom',
      }),
    ]),
    ...withSection('Nachbearbeiten', [
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzplan nachbearbeiten',
        copy: 'Ziehe Lernende auf freie Plätze. Legst du eine Person auf einer anderen ab, tauschen die beiden ihre Plätze.',
        target: seatplanFrameTarget(['#unseated .student', '#grid .seat-content:not(.teacher)', '#roster-panel', '#grid'], seatplanFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Perspektive umdrehen',
        copy: 'Die Spiegelung wechselt zwischen der Sicht der Lehrkraft und der Sicht der Lernenden – wichtig, damit der Ausdruck zur Blickrichtung passt.',
        target: seatplanFrameTarget('#toggle-perspective', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Belegung zurücksetzen',
        copy: 'Diese Aktion löst nur die Lernenden von den Plätzen. Raumform und aktive Plätze bleiben erhalten.',
        target: seatplanFrameTarget('#reset-learners', seatplanFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Platzraster zurücksetzen',
        copy: 'Diese Aktion entfernt Raumform und alle aktiven Plätze, damit du das Raster von Grund auf neu aufbauen kannst.',
        target: seatplanFrameTarget('#reset-raster', seatplanFallback),
        placement: 'right',
      }),
    ]),
  ];
  
  if (isCourseGradeMode) {
    steps.push(createModuleTutorialStep({
      tab: TAB_SEATPLAN,
      section: 'Nachbearbeiten',
      title: 'Noten am Sitzplatz eingeben',
      copy: 'Wähle Noten direkt am Sitzplatz aus. Gespeichert werden sie gesammelt im Notenmodul, nicht im Sitzplan.',
      target: seatplanFrameTarget([
        "button[data-course-grade-trigger='1']",
        "input[data-course-grade-input='1']",
        '.course-grade-seat-content',
      ], seatplanFallback),
      placement: 'top',
    }));
  }
  
  steps.push(
    ...withSection('Sichern und Drucken', [
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzplan laden',
        copy: 'Lade einen gespeicherten Sitzplan aus einer JSON-Datei. Der aktuelle Plan wird dabei ersetzt.',
        target: seatplanFrameTarget('#import-plan', seatplanFallback),
        placement: 'right',
      }),
      ...(!isCourseSeatplan ? [createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzplan speichern',
        copy: 'Speichere Raster, Belegung und Kriterien als Datei, um später daran weiterzuarbeiten.',
        target: seatplanFrameTarget('#export-plan', seatplanFallback),
        placement: 'right',
      })] : []),
      ...(isCourseSeatplan ? [createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Im Notenmodul speichern',
        copy: 'Bei verknüpften Kursen speicherst du den Plan direkt beim Notenkurs. Er steht dann in Planung und Noten zur Verfügung.',
        target: seatplanFrameTarget('#export-plan', seatplanFallback),
        placement: 'right',
      })] : []),
      createModuleTutorialStep({
        tab: TAB_SEATPLAN,
        title: 'Sitzplan drucken',
        copy: 'Erstelle eine druckbare Ansicht des aktuellen Plans – in der gerade gewählten Perspektive.',
        target: seatplanFrameTarget('#print-plan', seatplanFallback),
        placement: 'right',
      }),
    ])
  );
  
  return {
    steps,
    demo: {
      activate: activateSeatplanTutorialDemo,
      auto: true,
    },
  };
}
