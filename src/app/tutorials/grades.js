export function createGradesTutorialDefinition(context = {}) {
  const {
    TAB_GRADES,
    createModuleTutorialStep,
    withSection,
    gradesFrameTarget,
    prepareGradesTutorialSurface,
    activateGradesTutorialDemo,
    shellSupportsExternalFileSync,
    visibleTutorialNode,
  } = context;
  const gradesTarget = (selector) => gradesFrameTarget(selector, () => null);
  const gradesStep = (title, copy, selector, surface, placement = 'bottom', options = {}) => (
    createModuleTutorialStep({
      tab: TAB_GRADES,
      title,
      copy,
      target: gradesTarget(selector),
      placement,
      skipIfMissing: false,
      ...options,
      beforeRender: () => prepareGradesTutorialSurface(surface),
    })
  );
  const withGradesLifecycle = (steps) => ({
    steps,
    demo: {
      activate: activateGradesTutorialDemo,
      auto: true,
    },
  });
  const steps = [
    ...withSection('Einrichten', [
      gradesStep(
        'Datenbank verbinden',
        'Wähle eine vorhandene Datenbank aus oder lege eine neue an. Planung und Noten schreiben in dieselbe Datei – ohne Verbindung wird nichts gespeichert.',
        [
          '[data-tutorial-anchor="database-actions"]:not([hidden])',
          '#db-auto-actions:not([hidden])',
          '#db-manual-actions:not([hidden])',
        ],
        'gradesDatabase',
        'right'
      ),
      gradesStep(
        'Noten verschlüsseln',
        'Schütze Notendaten und zugehörige Daten im Notenmodul mit einem Passwort. Andere Inhalte der Datenbank werden nicht verschlüsselt. Ohne Passwort lassen sich die geschützten Daten nicht wiederherstellen.',
        '[data-tutorial-anchor="grades-encryption"]',
        'gradesEncryption',
        'right'
      ),
      gradesStep(
        'Automatisch sperren',
        'Bei aktiver Verschlüsselung sperrt sich der Notenbereich nach dieser Zeit von selbst. Das schützt die Anzeige, wenn das Gerät im Unterricht offen liegen bleibt.',
        [
          '#grade-vault-auto-lock-settings:not([hidden])',
          '#grade-vault-settings-action-btn:not([hidden])',
          '#grade-vault-encryption-enabled',
        ],
        'gradesEncryption',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Daten sichern',
        shellSupportsExternalFileSync
          ? 'Lege Backup-Ordner und Intervall fest. Manuelle Sicherungen bleiben jederzeit möglich.'
          : 'Speichere die Datenbank regelmäßig als Datei und lade sie nach einem Neustart wieder ein.',
        shellSupportsExternalFileSync
          ? ['[data-tutorial-anchor="workspace-backup"]', '#backup-dir-change-btn', '#db-auto-actions:not([hidden])']
          : '#db-manual-actions:not([hidden])',
        'gradesDatabase',
        'right'
      ),
      ...(shellSupportsExternalFileSync ? [] : [createModuleTutorialStep({
        tab: TAB_GRADES,
        title: 'Manuell speichern',
        copy: 'Ohne dauerhaften Dateizugriff sicherst du über dieses Symbol in der Kopfzeile. Es hebt sich hervor, sobald ungesicherte Änderungen vorliegen.',
        target: (nodes) => visibleTutorialNode(nodes.sidebarManualSaveBtn),
        placement: 'bottom',
      })]),
    ]),
    ...withSection('Kurs aufbauen', [
      gradesStep(
        'Kurs anlegen',
        'Mit dem Plus erstellst du einen Notenkurs. Danach erscheint er in der Kursliste darüber und lässt sich per Klick öffnen.',
        '[data-tutorial-anchor="grades-course-add"]',
        'gradesOverview',
        'bottom',
        { highlightPadding: 4 }
      ),
      gradesStep(
        'Kurs per Rechtsklick verwalten',
        'Ein Rechtsklick auf einen Kurs öffnet sein Menü. Von hier erreichst du Kursdaten, Notenstruktur und Teilnehmende – ohne das Menü sind sie nicht zugänglich.',
        '[data-tutorial-anchor="grades-course-menu"]',
        'gradesCourseMenu',
        'right',
        { highlightPadding: 4 }
      ),
      gradesStep(
        'Notenstruktur festlegen',
        'Kategorien, Unterkategorien und Gewichtungen bestimmen, wie aus einzelnen Leistungen die Gesamtnote entsteht. Diese Struktur gilt nur für diesen Kurs.',
        '[data-tutorial-anchor="grades-structure-dialog"]',
        'gradesStructure',
        'right'
      ),
      gradesStep(
        'Struktur für neue Kurse',
        'In den Einstellungen legst du die Voreinstellung fest, die jeder neu angelegte Kurs übernimmt. Bestehende Kurse bleiben unverändert.',
        ['#settings-grade-structure-periods', '#settings-tab-grade-structure'],
        'gradesDefaultStructure',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Prozentgrenzen festlegen',
        'Hier bestimmst du, ab wie viel Prozent welche Note gilt. Diese Skala wandelt später erreichte Punkte automatisch in Noten um.',
        '#grade-test-scale-settings-content',
        'gradesTestScales',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Teilnehmende verwalten',
        'Importiere eine CSV-Liste oder füge Personen einzeln hinzu. Hier hinterlegst du auch Fotos, aus denen später das Modul „Namen lernen“ seine Karten bildet.',
        '[data-tutorial-anchor="grades-students-dialog"]',
        'gradesStudents',
        'right'
      ),
    ]),
    ...withSection('Leistungen eingeben', [
      gradesStep(
        'Eingabe öffnen',
        'Der Stift wechselt zwischen Notenübersicht und Eingabe. In der Eingabe legst du neue Leistungen an und bearbeitest vorhandene.',
        '[data-tutorial-anchor="grades-entry-nav"]',
        'gradesOverview',
        'bottom',
        { highlightPadding: 4 }
      ),
      gradesStep(
        'Angaben zur Leistung',
        'In dieser Spalte stehen alle Angaben zur Leistung. Über das Kursfeld ganz oben ordnest du sie bei Bedarf einem anderen Kurs zu.',
        '[data-tutorial-anchor="grades-entry-config"]',
        'gradesEntry',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Leistung benennen',
        'Vergib einen eindeutigen Titel. Er erscheint später als Spaltenkopf in der Übersicht und im Ausdruck.',
        '[data-tutorial-anchor="grades-entry-title"]',
        'gradesEntry'
      ),
      gradesStep(
        'Modus wählen',
        'Note, BE und HA passen die Eingabefelder an den Leistungs-Typ an: eine fertige Note, erreichte Bewertungseinheiten oder eine Hausaufgabenkontrolle.',
        '[data-tutorial-anchor="grades-entry-mode"]',
        'gradesEntry'
      ),
      gradesStep(
        'Leistung einordnen',
        'Halbjahr, Kategorie und Gewichtung entscheiden, wo die Leistung in der Struktur landet und wie stark sie zählt.',
        '[data-tutorial-anchor="grades-entry-assignment"]',
        'gradesEntry'
      ),
      gradesStep(
        'Vorkommnisse vorbereiten',
        'Vorkommnisse sind kurze Notizen wie fehlende Hausaufgaben. Ihre Kategorien pflegst du zentral in den Einstellungen; sie gelten für alle Kurse.',
        ['#settings-grade-occurrences-list', '#settings-tab-occurrences'],
        'gradesOccurrences',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Ergebnisse erfassen',
        'Trage die Werte direkt bei den Teilnehmenden ein. Mit Tab springst du zur nächsten Person, ohne die Maus zu benutzen.',
        '[data-tutorial-anchor="grades-entry-results"]',
        'gradesEntry',
        'top'
      ),
      gradesStep(
        'Verteilung prüfen',
        'Häufigkeiten, Durchschnitt und Defizitanteil zeigen dir noch vor dem Speichern, ob die Bewertung insgesamt plausibel ist.',
        '[data-tutorial-anchor="grades-entry-distribution"]',
        'gradesEntry',
        'left'
      ),
      gradesStep(
        'Erwartungshorizont erstellen',
        'Bei BE-Leistungen erzeugt dieser Knopf aus Aufgaben und Punkten ein fertiges Dokument – wahlweise für einzelne Personen.',
        '[data-tutorial-anchor="grades-expectation"]',
        'gradesEntryBe',
        'right'
      ),
      gradesStep(
        'Kompetenzerwartung erzeugen',
        'Dieser Knopf erstellt das Gegenstück zum Erwartungshorizont mit den erreichten Kompetenzen. Wie dieser steht er nur im BE-Modus zur Verfügung.',
        '[data-tutorial-anchor="grades-competence-expectations"]',
        'gradesEntryBe',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Vorlagen hinterlegen',
        'Ort, Kommentartext und eigene Word-Vorlagen für beide Dokumente hinterlegst du einmalig in den Einstellungen unter „Vorlagen“.',
        ['#expectation-horizon-location', '#settings-tab-expectation-horizon'],
        'gradesTemplates',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Leistung speichern',
        'Die Diskette übernimmt die Leistung in die Übersicht. Ohne Speichern geht der Entwurf beim Kurswechsel verloren.',
        '[data-tutorial-anchor="grades-entry-save"]',
        'gradesEntry',
        'top'
      ),
    ]),
    ...withSection('Auswerten', [
      gradesStep(
        'Notenübersicht lesen',
        'Jede Zeile ist eine Person, jede Spalte eine Leistung. Ganz rechts stehen die berechneten Zwischen- und Gesamtergebnisse.',
        '[data-tutorial-anchor="grades-overview-table"]',
        'gradesOverviewTable',
        'top'
      ),
      gradesStep(
        'Gruppen ein- und ausklappen',
        'Halbjahre und Kategorien lassen sich zusammenklappen. Eingeklappte Spalten werden auch nicht mitgedruckt – so steuerst du den Ausdruck.',
        '[data-tutorial-anchor="grades-group-toggle"]',
        'gradesOverviewTable',
        'top'
      ),
      gradesStep(
        'Spalten per Rechtsklick verwalten',
        'Ein Rechtsklick auf eine Leistungsspalte öffnet Aktionen zum Bearbeiten und Übertragen. Diese Aktionen gibt es nur über das Kontextmenü.',
        'th[data-grade-transfer-column-key]',
        'gradesOverviewTable',
        'top'
      ),
      gradesStep(
        'Gesamtnote festsetzen',
        'Klicke einen berechneten Gesamtwert an, um ihn pädagogisch festzusetzen. Der ursprüngliche Rechenwert bleibt erhalten und sichtbar.',
        '[data-tutorial-anchor="grades-total-override"]',
        'gradesOverviewTable',
        'top'
      ),
      gradesStep(
        'Nachteilsausgleich hinterlegen',
        'Hier vermerkst du gewährte Nachteilsausgleiche pro Person. Der Vermerk erscheint bei der Person und im Ausdruck.',
        '#sidebar-grade-accommodation-section',
        'gradesOverviewActions',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Warnungen simulieren',
        'Teste, welche Gesamtnote sich bei einer angenommenen weiteren Leistung ergäbe. Gespeicherte Daten verändert die Simulation nicht.',
        '[data-tutorial-anchor="grades-simulation"]',
        'gradesOverviewActions',
        'right'
      ),
      gradesStep(
        'Datenschutzmodus',
        'Für Elterngespräche bleibt genau eine Person sichtbar, alle anderen Zeilen werden verdeckt. Die verdeckte Fläche lässt sich verschieben.',
        '[data-tutorial-anchor="grades-privacy"]',
        'gradesOverviewActions',
        'right'
      ),
    ]),
    ...withSection('Anzeige und Abschluss', [
      gradesStep(
        'Namen sortieren',
        'Wechsle zwischen Sortierung nach Vorname und nach Nachname. Die Reihenfolge gilt auch für Ausdruck und Sitzplan.',
        '[data-tutorial-anchor="grades-sort"]',
        'gradesOverviewActions',
        'right'
      ),
      gradesStep(
        'Notensystem wählen',
        'Schalte die Anzeige zwischen Punkten (15–0) und Schulnoten (1–6) um. Die gespeicherten Werte bleiben dabei unverändert.',
        '[data-tutorial-anchor="grades-display-system"]',
        'gradesOverviewActions',
        'right'
      ),
      gradesStep(
        'Plus und Minus',
        'Bei Schulnoten blendest du hier die Prädikatsanhängsel wie 2+ oder 3− ein und aus.',
        '[data-tutorial-anchor="grades-predicate"]',
        'gradesOverviewActions',
        'right'
      ),
      gradesStep(
        'Fotos und Namen lernen',
        'Diese beiden Schalter zeigen Fotos in den Listen und schalten das Modul „Namen lernen“ frei. Ohne sie bleibt der Reiter „Namen lernen“ ausgeblendet.',
        ['#show-grade-student-portraits', '#settings-tab-display'],
        'gradesPortraits',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Ausgeblendete Kurse zeigen',
        'Kurse, die du über das Kursmenü ausgeblendet hast, holst du mit diesem Schalter wieder in die Randleiste zurück.',
        '[data-tutorial-anchor="grades-sidebar-visibility"]',
        'gradesDisplay',
        'right',
        { skipIfMissing: true }
      ),
      gradesStep(
        'Übersicht drucken',
        'Der Ausdruck übernimmt genau die Spalten, die gerade sichtbar sind. Klappe vorher alles ein, was nicht aufs Blatt soll.',
        '[data-tutorial-anchor="grades-print"]',
        'gradesOverviewActions',
        'right'
      ),
      gradesStep(
        'Schuljahr archivieren',
        'Erstelle zum Abschluss ein PDF-Archiv mit Noten- und Planungsdaten. Danach kannst du das Schuljahr abschließen, ohne Daten zu verlieren.',
        '[data-tutorial-anchor="grades-archive"]',
        'gradesOverviewActions',
        'right'
      ),
    ]),
  ];
  return withGradesLifecycle(steps);
}
