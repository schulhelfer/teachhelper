export function createPlanningTutorialDefinition(context = {}) {
  const {
    TAB_PLANNING,
    createModuleTutorialStep,
    withSection,
    planningFrameTarget,
    preparePlanningTutorialSurface,
    activatePlanningTutorialDemo,
    shellSupportsExternalFileSync,
    visibleTutorialNode,
  } = context;
  const planningFallback = () => null;
  const planningStep = (title, copy, selector, surface, fallback = planningFallback, options = {}) => (
    createModuleTutorialStep({
      tab: TAB_PLANNING,
      title,
      copy,
      target: planningFrameTarget(selector, fallback),
      skipIfMissing: false,
      ...options,
      beforeRender: () => preparePlanningTutorialSurface(surface),
    })
  );
  const withPlanningLifecycle = (steps) => ({
    steps,
    demo: {
      activate: activatePlanningTutorialDemo,
      auto: true,
    },
  });
  const steps = [
    ...withSection('Einrichten', [
      planningStep(
        'Einstellungen öffnen',
        'Das Zahnrad führt zu Ferien, Uhrzeiten, Anzeige und Datenbank. Alles, was du hier einstellst, gilt für die gesamte Planung.',
        '#view-settings-btn',
        'week',
        planningFallback,
        { placement: 'right', highlightPadding: 4 }
      ),
      planningStep(
        'Datenbank',
        'Wähle eine Datenbank aus oder lege eine neue an. Planung und Noten teilen sich diese Datei – ohne Verbindung wird nichts gespeichert.',
        ['[data-tutorial-anchor="database-actions"]:not([hidden])', '#db-auto-actions:not([hidden])', '#db-manual-actions:not([hidden])'],
        'database',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Backup',
        shellSupportsExternalFileSync
          ? 'Lege Backup-Ordner und Intervall fest; manuelle Sicherungen bleiben möglich.'
          : 'Speichere die Datenbank als Datei und lade sie nach einem Neustart wieder ein.',
        shellSupportsExternalFileSync ? '#backup-dir-change-btn' : '#db-manual-actions',
        'database',
        planningFallback,
        { placement: 'right' }
      ),
      ...(shellSupportsExternalFileSync ? [] : [createModuleTutorialStep({
        tab: TAB_PLANNING,
        title: 'Manuell speichern',
        copy: 'Ohne dauerhaften Dateizugriff sicherst du über dieses Symbol in der Kopfzeile. Es hebt sich hervor, sobald ungesicherte Änderungen vorliegen.',
        target: (nodes) => visibleTutorialNode(nodes.sidebarManualSaveBtn),
        placement: 'bottom',
      })]),
      planningStep(
        'Ferien eintragen',
        'Ferien begrenzen den Planungszeitraum und verhindern Unterricht an diesen Tagen. Serien überspringen diese Zeiträume automatisch.',
        '[data-tutorial-anchor="planning-holidays"]',
        'dayoff',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Unterrichtsfreie Tage',
        'Einzelne freie Tage wie bewegliche Ferientage trägst du getrennt von den längeren Ferienzeiträumen ein.',
        '[data-tutorial-anchor="planning-special-days"]',
        'dayoff',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Stunden pro Tag anzeigen',
        'Lege fest, wie viele Unterrichtsstunden die Wochenansicht untereinander zeigt. Ein zu kleiner Wert blendet späte Stunden aus.',
        '[data-tutorial-anchor="planning-display-hours"]',
        'display',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Erscheinungsbild wählen',
        'Hell, dunkel oder nach Systemeinstellung – die Wahl gilt für ganz TeachHelper, nicht nur für die Planung.',
        ['.settings-theme-row', '#theme-preference-label'],
        'display',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
      planningStep(
        'Ausgeblendete Kurse zeigen',
        'Kurse, die du über das Kursmenü ausgeblendet hast, holst du mit diesem Schalter wieder in die Randleiste zurück.',
        '[data-tutorial-anchor="planning-sidebar-visibility"]',
        'display',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Unterrichtszeiten pflegen',
        'Die Uhrzeiten der Stunden helfen TeachHelper, dir beim Start den gerade laufenden Kurs anzuzeigen.',
        ['#lesson-times-list', '#settings-tab-lesson-times'],
        'lessonTimes',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Einstellungen übernehmen',
        'Änderungen in den Einstellungen sind zunächst nur ein Entwurf. Erst „Speichern“ übernimmt sie, „Abbrechen“ verwirft sie.',
        '#settings-save-all',
        'dayoff',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Standardwerte herstellen',
        'Der Pfeil setzt den aktuellen Einstellungsbereich auf die Voreinstellung zurück. Deine Kurse und Stunden bleiben davon unberührt.',
        '#settings-reset-all',
        'dayoff',
        planningFallback,
        { placement: 'bottom', skipIfMissing: true }
      ),
    ]),
    ...withSection('Kurse anlegen', [
      planningStep(
        'Kurs hinzufügen',
        'Mit dem Plus legst du einen neuen Planungskurs an. Er erscheint danach in der Kursliste darüber.',
        "#sidebar-course-list button[data-add-course='1']",
        'week',
        planningFallback,
        { placement: 'right', highlightPadding: 4 }
      ),
      planningStep(
        'Kursdaten',
        'Fach und Kursname erscheinen später in jeder Stunde des Wochenrasters. Der Kursname muss ausgefüllt sein.',
        ["#course-dialog [data-panel='general']", '#course-dialog-form'],
        'courseCreate',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Farbe wählen',
        'Die Farbe macht den Kurs im Wochenraster auf einen Blick erkennbar und wird auch im Notenmodul und im Sitzplan verwendet.',
        ['#course-dialog-color-palette', '#course-dialog-color-panel'],
        'courseCreate',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
      planningStep(
        'Termin ohne Unterricht',
        'Dieses Häkchen macht aus dem Kurs einen reinen Termin, etwa eine Konferenz oder Aufsicht. Solche Einträge tauchen im Notenmodul nicht auf.',
        '#course-dialog-no-lesson',
        'courseCreate',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
      planningStep(
        'Kurse bedienen',
        'Linksklick öffnet den Kursverlauf, Ziehen sortiert die Liste, Rechtsklick öffnet die Aktionen.',
        '#sidebar-course-list li[data-course-id] button[data-course-id]',
        'week',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Kurs per Rechtsklick ändern',
        'Im Kontextmenü bearbeitest du Kursdaten, blendest den Kurs aus oder löschst ihn. Ohne das Menü sind diese Aktionen nicht erreichbar.',
        ['#app-context-menu:not([hidden])', '#sidebar-course-list li[data-course-id]'],
        'courseMenu',
        planningFallback,
        { placement: 'right', highlightPadding: 4 }
      ),
    ]),
    ...withSection('Woche planen', [
      planningStep(
        'Wochenraster',
        'Unterricht, Ferien, Entfall, Arbeiten und Themen liegen gemeinsam in dieser Wochenansicht.',
        '#week-table',
        'lesson',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Woche wechseln',
        'Die Pfeile links und rechts blättern eine Woche vor oder zurück.',
        ['#week-prev', '#week-next'],
        'lesson',
        planningFallback,
        { placement: 'bottom' }
      ),
      planningStep(
        'Gezielt zu einer Woche springen',
        'Ein Klick auf die Kalenderwoche öffnet einen Minikalender, über den du direkt zu einem beliebigen Datum springst.',
        '#kw-label',
        'lesson',
        planningFallback,
        { placement: 'bottom' }
      ),
      planningStep(
        'Zurück zur aktuellen Woche',
        'Das Kalendersymbol bringt dich aus jeder Woche sofort zurück zur laufenden Woche.',
        '#week-picker-btn',
        'lesson',
        planningFallback,
        { placement: 'bottom', skipIfMissing: true }
      ),
      planningStep(
        'Serie per Doppelklick anlegen',
        'Doppelklicke eine freie Zelle im Raster. Daraus entsteht keine einzelne Stunde, sondern eine wiederkehrende Unterrichtsserie.',
        ['#week-table td.day-cell.empty[data-day][data-hour]', '#week-table'],
        'week',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Serie konfigurieren',
        'Kurs, Wochentag und Stunde bestimmen, wo die Serie liegt. Aus diesen Angaben erzeugt TeachHelper alle einzelnen Unterrichtsstunden.',
        ['#slot-dialog-form', '#slot-dialog'],
        'slotCreate',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Doppelstunden festlegen',
        'Über die Endstunde ziehst du eine Serie über mehrere Stunden. Liegt eine Pause dazwischen, wählst du sie darunter aus.',
        ['#slot-dialog-end-hour-row', '#slot-dialog-end-hour'],
        'slotCreate',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
      planningStep(
        'Wochenrhythmus',
        'Für A- und B-Wochen stellst du hier ein, dass die Serie nur in geraden oder nur in ungeraden Kalenderwochen stattfindet.',
        '#slot-dialog-parity',
        'slotCreate',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
      planningStep(
        'Gültigkeitszeitraum',
        'Start- und Enddatum begrenzen die Serie, etwa für ein Halbjahr. Ferien innerhalb des Zeitraums werden automatisch übersprungen.',
        ['#slot-dialog-start', '#slot-dialog-end'],
        'slotCreate',
        planningFallback,
        { placement: 'right', skipIfMissing: true }
      ),
    ]),
    ...withSection('Stunde ausarbeiten', [
      planningStep(
        'Thema direkt eintragen',
        'Klicke die Themenfläche in einer Stunde an und tippe los. Enter oder Tab speichert, Escape verwirft.',
        ['.lesson-block[data-lesson-id] .topic-zone', '.lesson-block[data-lesson-id]'],
        'lesson',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Detailplanung',
        'Im Stundendialog ergänzt du Ablauf, Material, Lernziele und Notizen zur Stunde.',
        ['#topic-dialog-notes', '#topic-dialog-form'],
        'topicDialog',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Notizen formatieren',
        'Die Leiste über dem Notizfeld bietet Fett, Listen, Farben und Links. Verlinkte Stunden lassen sich später direkt anspringen.',
        '#topic-dialog-rich-text-toolbar',
        'topicDialog',
        planningFallback,
        { placement: 'top', skipIfMissing: true }
      ),
      planningStep(
        'Sitzplan öffnen',
        'Das Stuhlsymbol öffnet den Sitzplan dieses Kurses. Änderungen dort gelten für den ganzen Kurs, nicht nur für diese Stunde.',
        ['.lesson-block-seatplan-trigger', '.lesson-block[data-lesson-id]'],
        'lesson',
        planningFallback,
        { placement: 'top', highlightPadding: 4 }
      ),
      planningStep(
        'Noteneingabe verknüpfen',
        'Fragezeichen oder Haken führen zur passenden Leistung im Notenmodul. So planst du eine Arbeit hier und trägst sie später dort ein.',
        ['.lesson-block-grade-entry', '.lesson-block[data-lesson-id]'],
        'lesson',
        planningFallback,
        { placement: 'top', highlightPadding: 4 }
      ),
      planningStep(
        'Stunde per Rechtsklick steuern',
        'Das Menü bietet Kopieren, Entfall, Schriftliche Arbeit und das Verschieben der weiteren Planung. Diese Aktionen gibt es nur hier.',
        ['#app-context-menu:not([hidden])', '.lesson-block[data-lesson-id]'],
        'lessonMenu',
        planningFallback,
        { placement: 'right', highlightPadding: 4 }
      ),
      planningStep(
        'Serie anpassen',
        'Beim Bearbeiten einer Serie entscheidest du, ob die Änderung für alle Termine gilt oder erst ab einem Datum. Löschen funktioniert genauso.',
        ['#slot-dialog-form', '#slot-dialog'],
        'slotEdit',
        planningFallback,
        { placement: 'right' }
      ),
    ]),
    ...withSection('Auswerten und Abschluss', [
      planningStep(
        'Kursverlauf öffnen',
        'Ein Klick auf den Kursnamen in einer Stunde zeigt den chronologischen Verlauf des ganzen Kurses.',
        ['.lesson-block .title.course-link[data-course-id]', '.lesson-block[data-lesson-id]'],
        'lesson',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Unterrichtsverlauf',
        'Jede Zeile bündelt Datum, Noteneingabe, Thema und Detailplanung einer Stunde. Hier planst du eine ganze Reihe am Stück.',
        ['#course-table tbody tr[data-lesson-id]', '#course-table'],
        'course',
        planningFallback,
        { placement: 'top' }
      ),
      planningStep(
        'Zurück zur Wochenansicht',
        'Dieser Knopf bringt dich aus dem Kursverlauf zurück in das Wochenraster.',
        '#view-week-btn',
        'course',
        planningFallback,
        { placement: 'right', highlightPadding: 4, skipIfMissing: true }
      ),
      planningStep(
        'Archiv vorbereiten',
        'Erstelle zum Schuljahresabschluss ein PDF-Archiv. Es hält Planung und Noten fest, auch wenn du danach ein neues Schuljahr beginnst.',
        ['[data-tutorial-anchor="planning-archive"]', '#sidebar-archive-btn'],
        'course',
        planningFallback,
        { placement: 'right', highlightPadding: 4 }
      ),
      planningStep(
        'Archivumfang wählen',
        'Wähle aus, ob Kursverläufe, Wochenansichten und die verfügbaren Noten in das PDF sollen.',
        [
          '#archive-planning-options',
          '#archive-dialog-form',
          '[data-tutorial-anchor="planning-archive"]',
          '#sidebar-archive-btn',
        ],
        'archive',
        planningFallback,
        { placement: 'right' }
      ),
      planningStep(
        'Speichern und weiterarbeiten',
        shellSupportsExternalFileSync
          ? 'Änderungen landen in der Datenbank; Backups sichern zusätzlich.'
          : 'Speichere regelmäßig über die Datenbank-Schaltfläche als Datei.',
        ['[data-tutorial-anchor="database-actions"]:not([hidden])', '#db-auto-actions:not([hidden])', '#db-manual-actions:not([hidden])'],
        'database',
        planningFallback,
        { placement: 'right' }
      ),
    ]),
  ];
  return withPlanningLifecycle(steps);
}
