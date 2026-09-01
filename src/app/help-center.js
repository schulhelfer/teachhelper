const MODULE_LABELS = {
  allgemein: 'Allgemein',
  grades: 'Noten',
  planning: 'Planung',
  seatplan: 'Sitzplan',
  'name-learning': 'Namen lernen',
  groups: 'Gruppen',
  'random-picker': 'Picker',
  merger: 'PDF-Tools',
  'duplicate-check': 'DuplikatCheck',
  'work-phase': 'Arbeitsphase',
  qr: 'QR',
};

function article(id, module, title, summary, keywords, sections) {
  return {
    id,
    module,
    title,
    summary,
    keywords,
    sections,
    steps: ARTICLE_GUIDANCE[id]?.steps || [],
    relatedArticleIds: ARTICLE_GUIDANCE[id]?.relatedArticleIds || [],
  };
}

const ARTICLE_GUIDANCE = {
  'data-backup': {
    steps: ['Datenbankdatei verbinden und den Speicherort notieren.', 'Einen Backup-Ordner auswählen, der regelmäßig gesichert wird.', 'Nach wichtigen Änderungen eine aktuelle Sicherung im Backup-Ordner prüfen.'],
    relatedArticleIds: ['grades-protection', 'settings-theme'],
  },
  'settings-theme': {
    steps: ['Den gewünschten Bereich über die Modulreiter öffnen.', 'In den Einstellungen Darstellung oder Bedienung anpassen.', 'Die Änderung prüfen; sie gilt direkt für die passende Ansicht oder die gesamte App.'],
    relatedArticleIds: ['data-backup', 'planning-week'],
  },
  'grades-start': {
    steps: ['Im Notenbereich einen neuen Kurs anlegen und benennen.', 'Jahrgangsstufe und weitere Kursangaben kontrollieren.', 'Lernende hinzufügen oder eine vorhandene Liste übernehmen.'],
    relatedArticleIds: ['grades-entry', 'grades-protection', 'name-learning-practice'],
  },
  'grades-entry': {
    steps: ['Im gewünschten Kurs eine neue Leistung öffnen.', 'Titel, Bewertungsart und Gewichtung festlegen.', 'Punkte oder Noten eintragen und die Übersicht vor dem Speichern prüfen.'],
    relatedArticleIds: ['grades-start', 'grades-protection'],
  },
  'grades-protection': {
    steps: ['Notenbereich nur bei Bedarf entsperren.', 'Bei einer Unterbrechung wieder sperren.', 'Vor umfangreichen Änderungen Datenbank und Sicherung prüfen.'],
    relatedArticleIds: ['data-backup', 'grades-start'],
  },
  'planning-week': {
    steps: ['Die gewünschte Kalenderwoche öffnen.', 'Eine Stunde des passenden Kurses auswählen.', 'Inhalte, Material und Notizen dokumentieren und den Verlauf prüfen.'],
    relatedArticleIds: ['planning-series', 'seatplan-create'],
  },
  'planning-series': {
    steps: ['Kurs, Wochentag und Unterrichtsstunde für die Serie festlegen.', 'Den Zeitraum und mögliche Ausnahmen prüfen.', 'Ferien, Feiertage und Sondertage in den Einstellungen ergänzen.'],
    relatedArticleIds: ['planning-week', 'data-backup'],
  },
  'seatplan-create': {
    steps: ['Kurs oder Lerngruppe auswählen.', 'Raumstruktur und Plätze anlegen.', 'Lernende platzieren, den Plan prüfen und eine Variante speichern.'],
    relatedArticleIds: ['seatplan-suggestions', 'grades-start'],
  },
  'seatplan-suggestions': {
    steps: ['Passende Kriterien für die Lerngruppe auswählen.', 'Einen Vorschlag erzeugen.', 'Das Ergebnis pädagogisch prüfen, bei Bedarf manuell ändern und speichern.'],
    relatedArticleIds: ['seatplan-create', 'groups-create'],
  },
  'name-learning-practice': {
    steps: ['Im Notenbereich Lernende und Fotos vervollständigen.', 'Im Namenlernen einen oder mehrere Kurse auswählen.', 'Fällige oder zufällige Karten starten und Antworten als gewusst oder unsicher markieren.'],
    relatedArticleIds: ['grades-start', 'random-picker'],
  },
  'groups-create': {
    steps: ['Lerngruppe importieren oder erfassen.', 'Minimale und maximale Gruppengröße festlegen.', 'Bedingungen ergänzen, Vorschlag prüfen und bei Bedarf anpassen.'],
    relatedArticleIds: ['seatplan-suggestions', 'random-picker'],
  },
  'random-picker': {
    steps: ['Verfügbare Namen und ihre Gewichtungen kontrollieren.', 'Die Auswahl starten.', 'Das Ergebnis nennen und die Verfügbarkeit für die nächste Auswahl bei Bedarf anpassen.'],
    relatedArticleIds: ['groups-create', 'name-learning-practice'],
  },
  'merger-pdf': {
    steps: ['Das passende PDF-Werkzeug auswählen.', 'Dateien hinzufügen und Reihenfolge oder Seiten prüfen.', 'Ergebnis erzeugen, öffnen und vor dem Weitergeben kontrollieren.'],
    relatedArticleIds: ['data-backup'],
  },
  'duplicate-check': {
    steps: ['ZIP-Datei mit den Abgaben auswählen.', 'Geeignete Prüfkriterien aktivieren.', 'Auffällige Treffer einzeln öffnen und im Kontext der Aufgabe bewerten.'],
    relatedArticleIds: ['data-backup'],
  },
  'work-phase': {
    steps: ['Arbeitsauftrag und Dauer eintragen.', 'Timer starten und die Anzeige für die Lerngruppe prüfen.', 'Bei Bedarf die Lautstärkeampel transparent aktivieren und die Arbeitsphase beenden.'],
    relatedArticleIds: ['random-picker'],
  },
  qr: {
    steps: ['Link oder Text eingeben beziehungsweise eine Bildquelle auswählen.', 'QR-Code erzeugen oder auslesen.', 'Ergebnis kontrollieren, bevor es geteilt oder ein Link geöffnet wird.'],
    relatedArticleIds: ['merger-pdf'],
  },
  'database-setup': {
    steps: ['In den Einstellungen den Bereich für Daten öffnen.', 'Eine Datenbankdatei auswählen oder neu anlegen.', 'Speicherort bestätigen und anschließend eine Sicherung einrichten.'],
    relatedArticleIds: ['data-backup', 'data-import-export'],
  },
  'data-import-export': {
    steps: ['Das passende Import- oder Exportformat auswählen.', 'Datei oder Zielordner bewusst wählen.', 'Das Ergebnis öffnen und Stichproben auf Vollständigkeit prüfen.'],
    relatedArticleIds: ['database-setup', 'data-backup'],
  },
  'grades-structure': {
    steps: ['Den gewünschten Kurs öffnen.', 'Bewertungsbereiche, Gewichtungen und Skalen festlegen.', 'Eine Beispielbewertung prüfen, bevor echte Leistungen eingetragen werden.'],
    relatedArticleIds: ['grades-entry', 'grades-reports'],
  },
  'grades-reports': {
    steps: ['Kurs und gewünschten Zeitraum auswählen.', 'Übersicht auf fehlende oder auffällige Werte prüfen.', 'Ansicht drucken oder die benötigten Werte verantwortungsvoll übertragen.'],
    relatedArticleIds: ['grades-entry', 'grades-protection'],
  },
  'planning-courses': {
    steps: ['Kurs öffnen oder einen neuen Kurs anlegen.', 'Bezeichnung und Unterrichtszuordnung kontrollieren.', 'Kursserie oder einzelne Termine passend einrichten.'],
    relatedArticleIds: ['planning-series', 'planning-week'],
  },
  'planning-content': {
    steps: ['Die betreffende Unterrichtsstunde öffnen.', 'Inhalt, Material und Aufgaben erfassen.', 'Nach der Stunde Verlauf und nächste Schritte ergänzen.'],
    relatedArticleIds: ['planning-week', 'planning-archive'],
  },
  'planning-archive': {
    steps: ['Abgeschlossene Inhalte oder alte Kurse auswählen.', 'Vor dem Archivieren Verlauf und Daten prüfen.', 'Archiv öffnen, wenn ältere Informationen benötigt werden.'],
    relatedArticleIds: ['planning-content', 'data-backup'],
  },
  'seatplan-room': {
    steps: ['Rastergröße und Raumform auswählen.', 'Sitzplätze, Zweiertische und Lehrkraftposition festlegen.', 'Das leere Raster kontrollieren, bevor Lernende platziert werden.'],
    relatedArticleIds: ['seatplan-create', 'seatplan-print'],
  },
  'seatplan-print': {
    steps: ['Den gespeicherten Sitzplan laden.', 'Perspektive und Druckansicht kontrollieren.', 'Druck starten oder eine geprüfte Variante für später speichern.'],
    relatedArticleIds: ['seatplan-create', 'seatplan-room'],
  },
  'name-learning-photos': {
    steps: ['Im Notenbereich die passende Kursliste öffnen.', 'Porträts für die Lernenden ergänzen oder korrigieren.', 'Zum Namenlernen wechseln und die Karteikartenansicht prüfen.'],
    relatedArticleIds: ['grades-start', 'name-learning-practice'],
  },
  'name-learning-modes': {
    steps: ['Einen oder mehrere Kurse auswählen.', 'Fällige oder zufällige Karten als Übungsmodus starten.', 'Nach der Antwort gewusst oder unsicher wählen und die nächste Karte öffnen.'],
    relatedArticleIds: ['name-learning-practice', 'name-learning-photos'],
  },
  'groups-import': {
    steps: ['Namensliste importieren oder eine Vorlage verwenden.', 'Namen und freie Lernende kontrollieren.', 'Gruppengrößen festlegen, bevor ein Vorschlag berechnet wird.'],
    relatedArticleIds: ['groups-create', 'groups-edit'],
  },
  'groups-edit': {
    steps: ['Einen vorhandenen Vorschlag öffnen.', 'Lernende per Drag-and-drop oder über die Gruppenaktionen verschieben.', 'Gruppen sperren, Themen ergänzen und die geprüfte Einteilung speichern.'],
    relatedArticleIds: ['groups-create', 'groups-import'],
  },
  'picker-conditions': {
    steps: ['Gemeinsame Namensliste und Auswahlbedingungen öffnen.', 'Verfügbare Namen und Gewichtungen kontrollieren.', 'Auf Wunsch ausgewählte Namen nach der Ziehung automatisch deaktivieren.'],
    relatedArticleIds: ['random-picker', 'picker-storage'],
  },
  'picker-storage': {
    steps: ['Den aktuellen Pickerstand prüfen.', 'Speichern wählen und einen eindeutigen Namen vergeben.', 'Gespeicherten Stand später laden und die Auswahlbedingungen kontrollieren.'],
    relatedArticleIds: ['random-picker', 'picker-conditions'],
  },
  'pdf-layout': {
    steps: ['Werkzeug „Anordnen“ und die PDF-Datei auswählen.', 'Seiten pro Blatt, Ausrichtung und Kopien einstellen.', 'Layout erzeugen und die Seiten vor dem Drucken prüfen.'],
    relatedArticleIds: ['merger-pdf', 'pdf-rotate'],
  },
  'pdf-rotate': {
    steps: ['Werkzeug „Drehen“ öffnen und eine PDF auswählen.', 'Ganzes Dokument oder einzelne Seiten auswählen.', 'Drehung erzeugen und das Ergebnis kontrollieren.'],
    relatedArticleIds: ['merger-pdf', 'pdf-split'],
  },
  'pdf-split': {
    steps: ['Werkzeug „Aufteilen“ öffnen und eine PDF auswählen.', 'Seitenauswahl und Ausgabeformat festlegen.', 'Aufteilung starten und die erzeugten Dateien prüfen.'],
    relatedArticleIds: ['merger-pdf', 'pdf-rotate'],
  },
  'duplicate-rules': {
    steps: ['Abgabedatei als ZIP auswählen.', 'Dateiname, Dateigröße und Bildähnlichkeit passend aktivieren.', 'Prüfung starten und die Zusammenfassung abwarten.'],
    relatedArticleIds: ['duplicate-check', 'duplicate-results'],
  },
  'duplicate-results': {
    steps: ['Eine Duplikatgruppe in der Ergebnisliste öffnen.', 'Treffergründe und einzelne Dateien vergleichen.', 'Ergebnis im Kontext bewerten oder die Regeln anpassen und erneut prüfen.'],
    relatedArticleIds: ['duplicate-check', 'duplicate-rules'],
  },
  'work-phase-timer': {
    steps: ['Arbeitsauftrag und Dauer festlegen.', 'Zwischenwarnungen, Endsignal und Sekundenanzeige nach Bedarf einstellen.', 'Timer starten und Restzeit sowie Endzeit im Blick behalten.'],
    relatedArticleIds: ['work-phase', 'work-phase-monitor'],
  },
  'work-phase-monitor': {
    steps: ['Ampelschwellen und optionale Warntöne einstellen.', 'Lautstärkeüberwachung mit transparenter Absprache starten.', 'Ampelfarben beobachten, Überwachung beenden und bei Bedarf die Präsentationsansicht nutzen.'],
    relatedArticleIds: ['work-phase', 'work-phase-timer'],
  },
  'qr-create-share': {
    steps: ['Generator öffnen und Link oder Text eingeben.', 'QR-Code erzeugen und den Ziel-Link kontrollieren.', 'Code herunterladen oder als Bild kopieren.'],
    relatedArticleIds: ['qr', 'qr-image-scan'],
  },
  'qr-image-scan': {
    steps: ['Decoder öffnen und eine Bilddatei auswählen oder ein Bild einfügen.', 'Gelesenen Inhalt prüfen.', 'Ergebnis kopieren oder einen Link erst nach Kontrolle öffnen.'],
    relatedArticleIds: ['qr', 'qr-camera'],
  },
  'qr-camera': {
    steps: ['Decoder öffnen und Kamerazugriff bewusst erlauben.', 'QR-Code ruhig und gut beleuchtet in das Kamerabild halten.', 'Scan beenden, Ergebnis kontrollieren und bei Problemen ein Bild verwenden.'],
    relatedArticleIds: ['qr-image-scan', 'qr-create-share'],
  },
};

export const SEARCH_SYNONYM_GROUPS = [
  ['sicherung', 'sichern', 'backup', 'datensicherung'],
  ['sitzplan', 'sitzordnung', 'sitzplatz', 'platzierung'],
  ['lernende', 'schueler', 'schuler', 'teilnehmende', 'klasse'],
  ['verbinden', 'zusammenfuegen', 'zusammenfugen', 'mergen'],
  ['bewertung', 'leistung', 'note', 'noten', 'punkte'],
  ['ferien', 'feiertag', 'ausfall', 'sondertag'],
  ['qr', 'qrcode', 'qr code', 'scanner'],
];

export const HELP_ARTICLES = [
  article('data-backup', 'allgemein', 'Daten, Speichern und Sicherungen', 'So bleiben Arbeitsdaten verfügbar und nachvollziehbar gesichert.', ['datenbank', 'datei', 'speichern', 'backup', 'sicherung', 'export'], [
    { title: 'Grundsatz', text: 'Arbeite mit einer verbundenen Datenbankdatei und wähle zusätzlich einen Backup-Ordner. TeachHelper kann dort aktuelle Sicherungen ablegen, bevor sensible Änderungen oder ein Tutorial gestartet werden.' },
    { title: 'Gute Routine', text: 'Prüfe regelmäßig den Speicherort und bewahre Sicherungen getrennt vom Arbeitsgerät auf. Eine Sicherung ersetzt nicht die Datenbankdatei, sondern ergänzt sie als Wiederherstellungspunkt.' },
  ]),
  article('settings-theme', 'allgemein', 'Einstellungen und Darstellung', 'Darstellung, Bedienung und modulübergreifende Einstellungen anpassen.', ['einstellungen', 'darstellung', 'hell', 'dunkel', 'sidebar', 'seitenleiste'], [
    { title: 'Darstellung', text: 'Die Einstellungen für helles, dunkles oder systemabhängiges Design gelten für ganz TeachHelper. Änderungen an der Breite der Seitenleiste betreffen die passende Arbeitsansicht und bleiben beim Wechsel erhalten.' },
    { title: 'Orientierung', text: 'Die Modulreiter oben wechseln die Arbeitsbereiche. Auf schmalen Ansichten erscheinen weniger häufig genutzte Bereiche im Menü „Weitere Tools“. Der Rettungsring bietet immer Tutorial und Hilfe an.' },
  ]),
  article('grades-start', 'grades', 'Notenkurse und Lernende einrichten', 'Kurse anlegen, Lernende pflegen und die Grundlage für die Notenverwaltung schaffen.', ['noten', 'kurs', 'lernfamilie', 'schueler', 'schüler', 'teilnehmende'], [
    { title: 'Kurs anlegen', text: 'Lege zuerst einen Kurs mit passender Jahrgangsstufe und Bezeichnung an. Die Kursverwaltung bündelt anschließend Lernende, Bewertungsstruktur und Einträge dieses Kurses.' },
    { title: 'Lernende verwalten', text: 'Öffne die Teilnehmendenverwaltung des Kurses, um Namen zu erfassen oder eine vorhandene Liste zu übernehmen. Prüfe Namen vor dem Speichern sorgfältig: Sie erscheinen später in Übersichten, Sitzplänen und beim Namenlernen.' },
  ]),
  article('grades-entry', 'grades', 'Leistungen erfassen und auswerten', 'Bewertungen konfigurieren, eintragen und in der Übersicht kontrollieren.', ['leistung', 'bewertung', 'punkte', 'note', 'noteneingabe', 'verteilung'], [
    { title: 'Eintrag vorbereiten', text: 'Wähle im Kurs eine Bewertungsart und vergib einen aussagekräftigen Titel. Die Struktur legt fest, wie einzelne Leistungen in Teil- und Gesamtnoten einfließen.' },
    { title: 'Ergebnisse prüfen', text: 'Nach der Eingabe zeigt die Übersicht Werte, Gewichtungen und Verteilungen. Kontrolliere Ausreißer und fehlende Werte vor dem Speichern; Korrekturen gehören in den jeweiligen Leistungseintrag.' },
  ]),
  article('grades-protection', 'grades', 'Schutz sensibler Notendaten', 'Passwortschutz, Privatsphäre und Sicherung der Notendaten.', ['passwort', 'schutz', 'datenschutz', 'privacy', 'verschluesselung', 'backup'], [
    { title: 'Umfang der Verschlüsselung', text: 'Die Verschlüsselung schützt Notendaten und zugehörige Daten im Notenmodul. Andere Inhalte der Datenbank werden nicht verschlüsselt.' },
    { title: 'Vertraulich arbeiten', text: 'Sperre den Notenbereich, sobald du den Arbeitsplatz verlässt. Verwende ein Passwort, das nicht mit anderen Zugängen geteilt wird, und zeige Übersichten nur Personen, die sie sehen dürfen.' },
    { title: 'Vor Änderungen sichern', text: 'Bei verbundenem Backup-Ordner erstellt TeachHelper vor bestimmten Abläufen eine Sicherung. Prüfe dennoch nach umfangreichen Änderungen, ob die Datenbankdatei und die Sicherung am erwarteten Ort liegen.' },
  ]),
  article('planning-week', 'planning', 'Woche und Unterricht planen', 'Wochenansicht, Termine und Unterrichtsverlauf sinnvoll nutzen.', ['planung', 'woche', 'unterricht', 'stunde', 'termin', 'verlauf'], [
    { title: 'Wochenansicht', text: 'Die Wochenansicht bündelt anstehende Stunden und macht sichtbar, welcher Kurs wann unterrichtet wird. Navigiere über die Woche, um vergangene oder kommende Stunden zu prüfen.' },
    { title: 'Unterricht dokumentieren', text: 'Öffne eine Stunde, um Inhalte, Material, Aufgaben und Notizen festzuhalten. Halte Informationen möglichst im passenden Eintrag fest, damit der Verlauf eines Kurses vollständig bleibt.' },
  ]),
  article('planning-series', 'planning', 'Kursserien und freie Tage', 'Regelmäßige Stunden erzeugen und Ausnahmen zuverlässig behandeln.', ['serie', 'kurs', 'ferien', 'feiertag', 'ausfall', 'sondertag'], [
    { title: 'Serien anlegen', text: 'Eine Kursserie verbindet Kurs, Wochentag und Unterrichtsstunde. Aus diesen Angaben entstehen die einzelnen Termine; Änderungen an der Serie wirken auf die vorgesehenen Folgestunden.' },
    { title: 'Ausnahmen pflegen', text: 'Hinterlege Ferien, Feiertage und Sondertage in den Einstellungen. So erscheinen ausgefallene Stunden nicht als reguläre Termine und die Wochenplanung bleibt realistisch.' },
  ]),
  article('seatplan-create', 'seatplan', 'Sitzpläne erstellen und speichern', 'Klasse platzieren, Plan bearbeiten und Varianten verwalten.', ['sitzplan', 'platz', 'tisch', 'speichern', 'klasse', 'raum'], [
    { title: 'Ausgangspunkt', text: 'Wähle einen Kurs oder eine Lernendengruppe und lege die Raumstruktur an. Ziehe Personen auf Plätze, um einen Plan manuell zu erstellen oder zunächst einen Vorschlag zu erzeugen.' },
    { title: 'Varianten', text: 'Speichere einen funktionierenden Plan, bevor du größere Änderungen ausprobierst. So kannst du eine bewährte Sitzordnung behalten und eine neue Variante getrennt weiterentwickeln.' },
  ]),
  article('seatplan-suggestions', 'seatplan', 'Sitzvorschläge und Kriterien', 'Vorschläge nachvollziehbar erzeugen und anschließend prüfen.', ['vorschlag', 'kriterien', 'geschlecht', 'nebeneinander', 'sitzordnung', 'optimieren'], [
    { title: 'Kriterien setzen', text: 'Lege fest, welche Beziehungen oder Eigenschaften bei der Platzierung berücksichtigt werden sollen. Kriterien sind eine Entscheidungshilfe und ersetzen nicht die pädagogische Einschätzung.' },
    { title: 'Ergebnis kontrollieren', text: 'Prüfe jeden Vorschlag auf konkrete Klassensituationen, die die Daten nicht abbilden. Verschiebe einzelne Personen bei Bedarf manuell und speichere den geprüften Plan.' },
  ]),
  article('name-learning-practice', 'name-learning', 'Namen mit Karteikarten lernen', 'Fotos aus Notenkursen zum gezielten Namenlernen verwenden.', ['namen', 'fotos', 'karteikarten', 'lernen', 'wiederholen', 'kurs'], [
    { title: 'Voraussetzung', text: 'Das Modul verwendet Lernende und Fotos aus dem Notenbereich. Sorge dort für korrekte Namen und geeignete Porträts, bevor du eine Übung startest.' },
    { title: 'Üben', text: 'Wähle einen oder mehrere Kurse und starte fällige oder zufällige Karten. Markiere Antworten ehrlich als gewusst oder noch unsicher; daraus ergibt sich eine sinnvolle Wiederholungsreihenfolge.' },
  ]),
  article('groups-create', 'groups', 'Gruppen bilden', 'Lernende verteilen, Bedingungen berücksichtigen und Gruppen ausgeben.', ['gruppen', 'einteilung', 'partner', 'groesse', 'größe', 'zufall'], [
    { title: 'Vorbereitung', text: 'Importiere oder erfasse die Lerngruppe und lege eine minimale und maximale Gruppengröße fest. Unvollständige Listen führen zu unvollständigen Vorschlägen.' },
    { title: 'Bedingungen', text: 'Gute und schwierige Gruppenpartner helfen bei der Optimierung. Prüfe den Vorschlag trotzdem fachlich, denn spontane Konflikte oder Förderbedarfe stehen nicht zwingend in den Daten.' },
  ]),
  article('random-picker', 'random-picker', 'Picker fair einsetzen', 'Zufällige Auswahl steuern und Gewichtungen bewusst verwenden.', ['picker', 'zufall', 'gewichtung', 'auswahl', 'name', 'ziehen'], [
    { title: 'Auswahl starten', text: 'Der Picker zieht aus den aktuell verfügbaren Namen. Entferne Personen nur, wenn sie wirklich nicht teilnehmen sollen, damit die Auswahl transparent bleibt.' },
    { title: 'Gewichtungen', text: 'Gewichtungen verändern die Wahrscheinlichkeit einer Auswahl. Nutze sie sparsam und erkläre der Lerngruppe bei Bedarf, nach welchem Prinzip sie eingesetzt werden.' },
  ]),
  article('merger-pdf', 'merger', 'PDFs anordnen, verbinden und teilen', 'PDF-Dateien sicher für Arbeitsblätter und Materialien bearbeiten.', ['pdf', 'verbinden', 'zusammenfuegen', 'zusammenfügen', 'drehen', 'teilen', 'seiten'], [
    { title: 'Dateien auswählen', text: 'Wähle die PDF-Dateien im passenden Werkzeug aus und kontrolliere Reihenfolge sowie Seitenzahl vor dem Start. Das Ergebnis wird neu erzeugt; die Originaldateien bleiben unverändert.' },
    { title: 'Werkzeug wählen', text: 'Nutze Anordnen für Drucklayouts, Verbinden für eine gemeinsame Datei, Drehen für die Seitenausrichtung und Teilen für einzelne Bereiche. Öffne das Ergebnis anschließend zur Sichtprüfung.' },
  ]),
  article('duplicate-check', 'duplicate-check', 'ZIP-Abgaben auf Duplikate prüfen', 'Prüfregeln wählen und auffällige Ergebnisse verantwortungsvoll bewerten.', ['duplikat', 'zip', 'abgabe', 'aehnlich', 'ähnlich', 'pruefung', 'prüfung'], [
    { title: 'Prüfung starten', text: 'Lege eine ZIP-Datei mit den Abgaben ab und wähle passende Prüfkriterien. Je nach Material werden Dateinamen, Größen oder visuelle Ähnlichkeiten verglichen.' },
    { title: 'Treffer einordnen', text: 'Ein Treffer ist ein Hinweis, kein Beweis für Täuschung. Öffne die betroffenen Dateien und berücksichtige Aufgabenstellung, Vorlagen und erlaubte Zusammenarbeit, bevor du Konsequenzen ziehst.' },
  ]),
  article('work-phase', 'work-phase', 'Arbeitsphase mit Timer und Ampel', 'Arbeitsauftrag sichtbar machen, Zeit strukturieren und Lautstärke begleiten.', ['arbeitsphase', 'timer', 'ampel', 'lautstaerke', 'lautstärke', 'arbeitsauftrag'], [
    { title: 'Arbeitsauftrag', text: 'Formuliere den Auftrag kurz und sichtbar. Ergänze eine realistische Dauer, damit Lernende Ziel und verbleibende Arbeitszeit gleichzeitig sehen können.' },
    { title: 'Lautstärkeampel', text: 'Die Ampel unterstützt die Selbststeuerung, ersetzt aber keine Aufsicht. Starte die Mikrofonüberwachung nur mit transparenter Absprache und beachte die Rahmenbedingungen der Schule.' },
  ]),
  article('qr', 'qr', 'QR-Codes erzeugen und lesen', 'Links oder Texte als QR-Code bereitstellen und vorhandene Codes auswerten.', ['qr', 'code', 'generator', 'scanner', 'kamera', 'link'], [
    { title: 'Code erstellen', text: 'Gib einen Link oder Text ein und erzeuge den QR-Code. Prüfe den Inhalt mit einem Testscan, bevor du ihn druckst oder weitergibst.' },
    { title: 'Code auslesen', text: 'Zum Auslesen kannst du eine Bilddatei, die Zwischenablage oder – nach Freigabe – die Kamera verwenden. Kontrolliere das Ergebnis, bevor du einen darin enthaltenen Link öffnest.' },
  ]),
  article('database-setup', 'allgemein', 'Datenbankdatei einrichten', 'Eine verlässliche Datenbasis für die Arbeit mit TeachHelper verbinden.', ['datenbank', 'datei', 'einrichten', 'verbinden', 'speicherort', 'arbeitsdatei'], [
    { title: 'Datenquelle wählen', text: 'Öffne die Daten-Einstellungen und wähle eine vorhandene Datenbankdatei oder lege eine neue Arbeitsdatei an. Bewahre die Datei an einem Ort auf, der regelmäßig gesichert wird.' },
    { title: 'Verbindung prüfen', text: 'Nach dem Verbinden sollte der angezeigte Speicherort zu deiner Arbeitsdatei passen. Richte anschließend einen Backup-Ordner ein, bevor du umfangreiche Daten einpflegst.' },
  ]),
  article('data-import-export', 'allgemein', 'Daten importieren und exportieren', 'Listen und Arbeitsstände sicher übernehmen oder weitergeben.', ['import', 'export', 'csv', 'datei', 'uebernehmen', 'übernehmen', 'sichern'], [
    { title: 'Vor dem Import', text: 'Prüfe Format, Spalten und Inhalt einer Datei, bevor du sie übernimmst. Bei sensiblen Daten empfiehlt sich vorher eine aktuelle Sicherung.' },
    { title: 'Nach dem Export', text: 'Öffne die exportierte Datei oder den Zielordner direkt und kontrolliere Namen, Anzahl und Inhalt stichprobenartig. So fallen falsche Zielorte oder unvollständige Daten früh auf.' },
  ]),
  article('grades-structure', 'grades', 'Bewertungsstruktur und Gewichtung festlegen', 'Leistungsbereiche, Gewichtungen und Skalen vor der Noteneingabe einrichten.', ['bewertungsstruktur', 'gewichtung', 'skala', 'kategorie', 'teilnote', 'gesamtleistung'], [
    { title: 'Struktur planen', text: 'Lege zuerst fest, welche Leistungsbereiche im Kurs vorkommen und wie stark sie zählen sollen. Eine klare Struktur verhindert spätere Rechen- und Zuordnungsfehler.' },
    { title: 'Plausibilität prüfen', text: 'Kontrolliere Gewichtungen mit einer Beispielbewertung. Falls der Kurs besondere Regeln nutzt, dokumentiere sie verständlich für die eigene spätere Kontrolle.' },
  ]),
  article('grades-reports', 'grades', 'Notenübersichten prüfen und ausgeben', 'Kursdaten kontrollieren, übersichtlich darstellen und verantwortungsvoll ausgeben.', ['uebersicht', 'übersicht', 'ausgabe', 'drucken', 'liste', 'notenspiegel', 'bericht'], [
    { title: 'Übersicht lesen', text: 'Nutze die Kursübersicht, um fehlende Leistungen, unerwartete Gewichtungen und auffällige Ergebnisse zu erkennen. Änderungen gehören in den einzelnen Leistungseintrag.' },
    { title: 'Ausgabe schützen', text: 'Drucke oder übertrage nur die Daten, die im jeweiligen Kontext benötigt werden. Schließe oder sperre den Notenbereich nach der Ausgabe wieder.' },
  ]),
  article('planning-courses', 'planning', 'Kurse in der Planung verwalten', 'Kurse vorbereiten und mit passenden Terminen verbinden.', ['kurs', 'kursverwaltung', 'fach', 'unterricht', 'serie', 'termin'], [
    { title: 'Kursgrundlage', text: 'Lege für jedes Fach oder jede Lerngruppe einen eindeutigen Kurs an. Eine klare Bezeichnung erleichtert die Auswahl in der Wochenansicht und bei Kursserien.' },
    { title: 'Termine zuordnen', text: 'Verbinde regelmäßige Stunden über eine Kursserie mit dem Kurs. Einzelne besondere Termine können anschließend gezielt ergänzt oder angepasst werden.' },
  ]),
  article('planning-content', 'planning', 'Unterrichtsinhalte dokumentieren', 'Material, Aufgaben und Verlauf direkt an einer Unterrichtsstunde festhalten.', ['inhalt', 'material', 'aufgabe', 'notiz', 'unterrichtsverlauf', 'dokumentation'], [
    { title: 'Vorbereiten', text: 'Trage Ziele, Material und geplante Aufgaben vor der Stunde in den passenden Termin ein. So ist die Planung beim nächsten Öffnen direkt verfügbar.' },
    { title: 'Nachbereiten', text: 'Ergänze nach der Stunde, was tatsächlich behandelt wurde und welche nächsten Schritte offen sind. Das erleichtert Vertretung, Rückblick und Anschlussplanung.' },
  ]),
  article('planning-archive', 'planning', 'Planungen archivieren', 'Abgeschlossene Kurse und Inhalte geordnet aufbewahren.', ['archiv', 'archivieren', 'alt', 'vergangen', 'kursabschluss', 'verlauf'], [
    { title: 'Vor dem Archivieren', text: 'Prüfe, ob der Unterrichtsverlauf vollständig ist und ob wichtige Informationen noch aktiv benötigt werden. Eine aktuelle Sicherung schützt vor versehentlichen Verlusten.' },
    { title: 'Archiv nutzen', text: 'Archivierte Inhalte bleiben für Rückblicke und Wiederverwendung erreichbar, stören aber nicht die laufende Planung. Öffne sie nur bei Bedarf erneut.' },
  ]),
  article('seatplan-room', 'seatplan', 'Raum und Sitzraster einrichten', 'Raumform, Plätze und Lehrkraftposition für einen Sitzplan vorbereiten.', ['raum', 'raster', 'tisch', 'sitzplatz', 'zweiertisch', 'lehrkraft'], [
    { title: 'Raster aufbauen', text: 'Wähle zunächst eine passende Raumform und Rastergröße. Lege anschließend nur die Sitzplätze an, die im realen Raum tatsächlich nutzbar sind.' },
    { title: 'Details ergänzen', text: 'Markiere Zweiertische und die Position der Lehrkraft, damit Vorschläge und Druckansicht den Klassenraum verständlich abbilden.' },
  ]),
  article('seatplan-print', 'seatplan', 'Sitzplan drucken und weitergeben', 'Eine geprüfte Sitzordnung für Unterricht oder Vertretung ausgeben.', ['drucken', 'druck', 'ausgabe', 'perspektive', 'vertetung', 'vertretung'], [
    { title: 'Druckansicht vorbereiten', text: 'Lade die gewünschte Variante und kontrolliere Perspektive, Namen und Raumraster. Speichere Änderungen am Plan, bevor du ihn ausgibst.' },
    { title: 'Verwendung', text: 'Nutze Ausdrucke nur im nötigen Umfang und bewahre sie datenschutzgerecht auf. Für Vertretungen hilft eine klare, lesbare Raumansicht.' },
  ]),
  article('name-learning-photos', 'name-learning', 'Fotos für das Namenlernen vorbereiten', 'Porträts und Namen aus dem Notenbereich für Karteikarten nutzbar machen.', ['foto', 'portrait', 'porträt', 'bild', 'namen', 'lernfamilie'], [
    { title: 'Daten pflegen', text: 'Öffne den passenden Notenkurs und kontrolliere Schreibweise der Namen. Ergänze geeignete Porträts nur dort, wo ihre Nutzung abgesprochen und zulässig ist.' },
    { title: 'Karteikarten prüfen', text: 'Wechsle danach zum Namenlernen und kontrolliere die Kartenansicht. Unklare oder fehlende Bilder sollten vor einer Übungsrunde korrigiert werden.' },
  ]),
  article('name-learning-modes', 'name-learning', 'Übungsmodi beim Namenlernen', 'Fällige und zufällige Karten passend zur eigenen Übungsroutine einsetzen.', ['uebung', 'übung', 'faellig', 'fällig', 'zufall', 'karteikarte', 'wiederholung'], [
    { title: 'Fällige Karten', text: 'Dieser Modus konzentriert sich auf Namen, die wiederholt werden sollen. Er eignet sich für kurze, regelmäßige Übungsphasen.' },
    { title: 'Zufällige Karten', text: 'Zufällige Karten helfen, den gesamten Kurs im Blick zu behalten. Markiere Antworten ehrlich, damit unsichere Namen häufiger wiederkehren.' },
  ]),
  article('groups-import', 'groups', 'Namenslisten für Gruppen importieren', 'Eine Lerngruppe sauber vorbereiten, bevor Gruppen gebildet werden.', ['namensliste', 'import', 'csv', 'vorlage', 'lerngruppe', 'freie lernende'], [
    { title: 'Liste vorbereiten', text: 'Nutze bei Bedarf die Vorlage und prüfe Vor- und Nachnamen vor dem Import. Doppelte oder leere Einträge sollten vor dem Gruppenvorschlag bereinigt werden.' },
    { title: 'Teilnahme prüfen', text: 'Kontrolliere nach dem Import, welche Lernenden frei verfügbar sind. Erst dann lassen sich realistische Gruppengrößen festlegen.' },
  ]),
  article('groups-edit', 'groups', 'Gruppeneinteilung manuell anpassen', 'Vorschläge pädagogisch prüfen und einzelne Gruppen gezielt verändern.', ['manuell', 'verschieben', 'sperren', 'gruppenthema', 'anpassen', 'drag drop'], [
    { title: 'Vorschlag prüfen', text: 'Betrachte die berechneten Gruppen zuerst als Ausgangspunkt. Berücksichtige aktuelle Klassensituationen, die in den gespeicherten Bedingungen nicht enthalten sind.' },
    { title: 'Änderungen sichern', text: 'Verschiebe Lernende gezielt, sperre fertige Gruppen und ergänze Gruppenthemen. Speichere die geprüfte Einteilung, bevor du eine neue Variante ausprobierst.' },
  ]),
  article('picker-conditions', 'random-picker', 'Auswahlbedingungen im Picker', 'Verfügbarkeit und Gewichtungen für nachvollziehbare Ziehungen steuern.', ['bedingungen', 'gewichtung', 'verfuegbar', 'verfügbar', 'deaktivieren', 'wahrscheinlichkeit'], [
    { title: 'Vor der Ziehung', text: 'Kontrolliere, wer teilnehmen soll und ob Gewichtungen bewusst gesetzt sind. So bleibt die Auswahl für die Lerngruppe nachvollziehbar.' },
    { title: 'Nach der Ziehung', text: 'Bei Bedarf kann eine gezogene Person automatisch deaktiviert werden. Prüfe diese Einstellung, wenn wiederholte Aufrufe erwünscht sind.' },
  ]),
  article('picker-storage', 'random-picker', 'Pickerstand speichern und laden', 'Auswahlbedingungen für eine spätere Unterrichtsstunde erhalten.', ['speichern', 'laden', 'pickerstand', 'auswahlbedingungen', 'datei', 'wiederverwenden'], [
    { title: 'Stand speichern', text: 'Speichere einen vorbereiteten Pickerstand mit einer eindeutigen Bezeichnung. So bleiben Namen, Gewichtungen und Verfügbarkeiten zusammen erhalten.' },
    { title: 'Stand laden', text: 'Beim Laden sollten die Bedingungen vor der nächsten Ziehung kurz kontrolliert werden. Ändere sie erst danach für die neue Situation.' },
  ]),
  article('pdf-layout', 'merger', 'PDF-Seiten für den Druck anordnen', 'Mehrere Seiten passend auf einem Blatt ausgeben.', ['layout', 'seiten pro blatt', 'ausrichtung', 'kopien', 'restseiten', 'druck'], [
    { title: 'Layout wählen', text: 'Wähle das Anordnen-Werkzeug und lege fest, wie viele Seiten auf einem Blatt erscheinen sollen. Für kleine Lerngruppen können Kopien und Restseiten angepasst werden.' },
    { title: 'Ergebnis prüfen', text: 'Kontrolliere Ausrichtung, Lesbarkeit und Seitenfolge im erzeugten Dokument. Erst danach sollte die Druckdatei weitergegeben werden.' },
  ]),
  article('pdf-rotate', 'merger', 'PDFs und einzelne Seiten drehen', 'Falsch ausgerichtete Seiten vor dem Einsatz korrigieren.', ['drehen', 'rotation', 'ausrichtung', 'einzelne seiten', 'hochformat', 'querformat'], [
    { title: 'Drehung auswählen', text: 'Entscheide, ob das gesamte Dokument oder nur einzelne Seiten gedreht werden sollen. Die Vorschau und Seitenauswahl helfen bei gemischten Dokumenten.' },
    { title: 'Datei kontrollieren', text: 'Öffne die erzeugte PDF und prüfe besonders Seitenwechsel und Leserichtung. Die Ursprungsdatei bleibt dabei unverändert.' },
  ]),
  article('pdf-split', 'merger', 'PDFs aufteilen', 'Seiten oder Seitengruppen als eigene Dateien ausgeben.', ['aufteilen', 'teilen', 'seitengruppe', 'seitenauswahl', 'ausgabeformat', 'trennen'], [
    { title: 'Bereiche festlegen', text: 'Wähle Seiten einzeln oder als Gruppen aus. Das gewünschte Ausgabeformat entscheidet, ob mehrere Dateien oder zusammengehörige Bereiche entstehen.' },
    { title: 'Ausgabe prüfen', text: 'Öffne die neuen Dateien und prüfe ihre Namen sowie die enthaltenen Seiten. So verhindert man, dass Material versehentlich unvollständig verteilt wird.' },
  ]),
  article('duplicate-rules', 'duplicate-check', 'Prüfkriterien im DuplikatCheck wählen', 'Die ZIP-Prüfung auf die Art der Abgaben abstimmen.', ['regel', 'kriterium', 'dateiname', 'dateigroesse', 'dateigröße', 'bildaehnlichkeit', 'bildähnlichkeit'], [
    { title: 'Kriterien verstehen', text: 'Gleiche Dateinamen und Größen liefern schnelle Hinweise, während Bildähnlichkeit bei visuellen Abgaben sinnvoll sein kann. Aktiviere nur Kriterien, die zur Aufgabe passen.' },
    { title: 'Prüfung begrenzen', text: 'Die Regeln erzeugen Hinweise, keine Beweise. Eine zu breite Prüfung kann viele harmlose Gemeinsamkeiten anzeigen.' },
  ]),
  article('duplicate-results', 'duplicate-check', 'Duplikat-Treffer auswerten', 'Ergebnisse vergleichen und angemessen einordnen.', ['treffer', 'ergebnis', 'duplikatgruppe', 'vergleich', 'bild', 'beweis'], [
    { title: 'Treffer öffnen', text: 'Öffne eine Duplikatgruppe und lies zunächst die angezeigten Gründe. Vergleiche anschließend die einzelnen Dateien oder Bilder direkt.' },
    { title: 'Kontext beachten', text: 'Vorlagen, Aufgabenstellung und erlaubte Zusammenarbeit können Gemeinsamkeiten erklären. Erst eine sorgfältige Gesamtbewertung ermöglicht faire Entscheidungen.' },
  ]),
  article('work-phase-timer', 'work-phase', 'Timer und Warnungen einrichten', 'Arbeitszeit sichtbar strukturieren und rechtzeitig Hinweise geben.', ['timer', 'dauer', 'warnung', 'endsignal', 'sekunden', 'restzeit'], [
    { title: 'Zeit planen', text: 'Lege eine realistische Dauer fest und ergänze einen klaren Arbeitsauftrag. Zwischenwarnungen helfen, Zwischenziele rechtzeitig sichtbar zu machen.' },
    { title: 'Timer führen', text: 'Nach dem Start zeigt TeachHelper Restzeit und Endzeit. Beende oder passe die Arbeitsphase bewusst an, statt die Anzeige unbemerkt weiterlaufen zu lassen.' },
  ]),
  article('work-phase-monitor', 'work-phase', 'Lautstärkeampel und Präsentation', 'Arbeitslautstärke transparent begleiten und die Ansicht im Raum zeigen.', ['lautstaerke', 'lautstärke', 'ampel', 'schwelle', 'warnsignal', 'praesentation', 'präsentation'], [
    { title: 'Ampel vorbereiten', text: 'Lege Schwellen und optionale Warnsignale passend zur Raumakustik fest. Erkläre der Lerngruppe vorab, was die Farben bedeuten und wie die Anzeige genutzt wird.' },
    { title: 'Präsentieren', text: 'Starte die Überwachung nur transparent und beende sie nach der Arbeitsphase. Die Präsentationsansicht kann Timer und Ampel für den Raum hervorheben.' },
  ]),
  article('qr-create-share', 'qr', 'QR-Code erstellen, laden und kopieren', 'Erzeugte QR-Codes sicher für Material und digitale Kanäle bereitstellen.', ['erstellen', 'herunterladen', 'kopieren', 'teilen', 'generator', 'link'], [
    { title: 'Inhalt vorbereiten', text: 'Gib einen vollständigen Link oder kurzen Text ein und erzeuge daraus den Code. Teste bei Links, ob das Ziel auf dem vorgesehenen Gerät erreichbar ist.' },
    { title: 'Weitergeben', text: 'Lade den Code als Bild herunter oder kopiere ihn in die Zwischenablage. Ein Testscan vor Druck oder Veröffentlichung verhindert falsche Ziele.' },
  ]),
  article('qr-image-scan', 'qr', 'QR-Code aus Bild oder Zwischenablage lesen', 'Vorhandene QR-Codes ohne Kamera auswerten.', ['bild', 'zwischenablage', 'lesen', 'decoder', 'scan', 'datei'], [
    { title: 'Bild wählen', text: 'Ziehe eine Bilddatei in den Decoder oder füge ein Bild aus der Zwischenablage ein. Ein scharfes, gerade ausgerichtetes Bild verbessert die Erkennung.' },
    { title: 'Ergebnis nutzen', text: 'Prüfe Text oder Link nach dem Lesen sorgfältig. Kopiere Inhalte bei Bedarf, statt unbekannte Links direkt zu öffnen.' },
  ]),
  article('qr-camera', 'qr', 'QR-Code mit der Kamera scannen', 'Kamerazugriff nutzen und Probleme beim Scan beheben.', ['kamera', 'scannen', 'zugriff', 'ausrichten', 'licht', 'fehler'], [
    { title: 'Kamera starten', text: 'Erlaube den Zugriff nur, wenn du die Kamera verwenden möchtest. Richte den QR-Code bei ausreichendem Licht möglichst gerade im Bild aus.' },
    { title: 'Wenn es nicht klappt', text: 'Verändere Abstand und Beleuchtung oder beende den Scan. Als Alternative kann der QR-Code als Bilddatei oder aus der Zwischenablage gelesen werden.' },
  ]),
];

export function normalizeHelpSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchableText(articleItem) {
  return normalizeHelpSearch([
    articleItem.title,
    articleItem.summary,
    articleItem.module,
    MODULE_LABELS[articleItem.module],
    ...(articleItem.keywords || []),
    ...(articleItem.sections || []).flatMap((section) => [section.title, section.text]),
  ].join(' '));
}

function tokenize(value) {
  return normalizeHelpSearch(value).split(' ').filter(Boolean);
}

function getSearchFields(articleItem) {
  return {
    title: normalizeHelpSearch(articleItem.title),
    keywords: normalizeHelpSearch((articleItem.keywords || []).join(' ')),
    summary: normalizeHelpSearch(articleItem.summary),
    body: normalizeHelpSearch((articleItem.sections || [])
      .flatMap((section) => [section.title, section.text]).join(' ')),
  };
}

function getSearchVocabulary(articles) {
  const words = new Set(SEARCH_SYNONYM_GROUPS.flatMap((group) => group.flatMap(tokenize)));
  articles.forEach((articleItem) => tokenize(searchableText(articleItem)).forEach((word) => words.add(word)));
  return words;
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function synonymVariants(term) {
  const group = SEARCH_SYNONYM_GROUPS.find((candidate) => candidate.includes(term));
  return [...new Set([term, ...(group || [])].flatMap(tokenize))];
}

function resolveSearchTerm(term, vocabulary) {
  if (vocabulary.has(term)) return { term, variants: synonymVariants(term), kind: 'exact' };
  if (term.length < 4) return { term, variants: synonymVariants(term), kind: 'unknown' };
  const maximumDistance = term.length <= 7 ? 1 : 2;
  let closestDistance = maximumDistance + 1;
  let closestWords = [];
  vocabulary.forEach((word) => {
    if (Math.abs(word.length - term.length) > maximumDistance) return;
    const distance = levenshteinDistance(term, word);
    if (distance > maximumDistance) return;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestWords = [word];
    } else if (distance === closestDistance) {
      closestWords.push(word);
    }
  });
  if (closestWords.length !== 1) return { term, variants: synonymVariants(term), kind: 'unknown' };
  return { term: closestWords[0], variants: synonymVariants(closestWords[0]), kind: 'typo' };
}

export function resolveHelpSearchTerms(query, articles = HELP_ARTICLES) {
  const vocabulary = getSearchVocabulary(articles);
  return tokenize(query).map((term) => resolveSearchTerm(term, vocabulary));
}

function getFieldMatchScore(fields, { term, variants, kind }) {
  const correctionFactor = kind === 'typo' ? 0.45 : kind === 'unknown' ? 0.25 : 1;
  const scoreFor = (field, exactScore, synonymScore) => {
    if (field.includes(term)) return exactScore * correctionFactor;
    return variants.some((variant) => variant !== term && field.includes(variant))
      ? synonymScore * correctionFactor
      : 0;
  };
  return scoreFor(fields.title, 120, 70)
    + scoreFor(fields.keywords, 100, 55)
    + scoreFor(fields.summary, 60, 32)
    + scoreFor(fields.body, 35, 18);
}

export function searchHelpArticles(query, articles = HELP_ARTICLES) {
  const terms = resolveHelpSearchTerms(query, articles);
  return articles
    .map((articleItem) => {
      const fields = getSearchFields(articleItem);
      const scores = terms.map((term) => getFieldMatchScore(fields, term));
      return { articleItem, score: scores.reduce((total, score) => total + score, 0), matches: scores.every(Boolean) };
    })
    .filter(({ matches }) => matches)
    .sort((left, right) => right.score - left.score || left.articleItem.title.localeCompare(right.articleItem.title, 'de'))
    .map(({ articleItem }) => articleItem);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

export function createHelpCenter({ els = {}, onStartTutorial = async () => {} } = {}) {
  let selectedArticleId = '';
  let resultsAnimationFrame = 0;

  const moduleLabel = (module) => MODULE_LABELS[module] || MODULE_LABELS.allgemein;
  const selectedArticle = () => HELP_ARTICLES.find((item) => item.id === selectedArticleId) || null;

  function animateResults() {
    if (!els.helpResults) return;
    window.cancelAnimationFrame(resultsAnimationFrame);
    els.helpResults.classList.remove('is-filtering');
    resultsAnimationFrame = window.requestAnimationFrame(() => {
      els.helpResults?.classList.add('is-filtering');
    });
  }

  function renderResults({ animate = false } = {}) {
    const container = els.helpResults;
    if (!container) return;
    const results = searchHelpArticles(els.helpSearch?.value || '');
    container.replaceChildren();
    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'help-empty-state';
      empty.textContent = 'Keine Hilfethemen gefunden. Versuche einen allgemeineren Suchbegriff.';
      container.append(empty);
      if (animate) animateResults();
      return;
    }
    results.forEach((articleItem) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'help-result-card';
      button.dataset.helpArticleId = articleItem.id;
      const title = document.createElement('strong');
      title.textContent = articleItem.title;
      const meta = document.createElement('span');
      meta.className = 'help-result-meta';
      meta.textContent = `${moduleLabel(articleItem.module)} · ${articleItem.summary}`;
      button.append(title, meta);
      button.addEventListener('click', () => openArticle(articleItem.id));
      container.append(button);
    });
    if (animate) animateResults();
  }

  function openArticle(id, { focusTarget = 'back' } = {}) {
    selectedArticleId = id;
    const articleItem = selectedArticle();
    if (!articleItem || !els.helpDetail) return;
    els.helpDetail.replaceChildren();
    const label = document.createElement('p');
    label.className = 'help-article-module';
    label.textContent = moduleLabel(articleItem.module);
    const title = document.createElement('h3');
    title.className = 'help-article-title';
    title.textContent = articleItem.title;
    els.helpDetail.append(label, title);
    articleItem.sections.forEach((section) => {
      const sectionNode = document.createElement('section');
      const sectionTitle = document.createElement('h4');
      sectionTitle.textContent = section.title;
      const copy = document.createElement('p');
      copy.textContent = section.text;
      sectionNode.append(sectionTitle, copy);
      els.helpDetail.append(sectionNode);
    });
    if (articleItem.steps.length) {
      const stepsSection = document.createElement('section');
      stepsSection.className = 'help-article-steps-section';
      const stepsTitle = document.createElement('h4');
      stepsTitle.textContent = 'Schritt für Schritt';
      const steps = document.createElement('ol');
      steps.className = 'help-article-steps';
      articleItem.steps.forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
      });
      stepsSection.append(stepsTitle, steps);
      els.helpDetail.append(stepsSection);
    }
    const relatedArticles = articleItem.relatedArticleIds
      .map((relatedId) => HELP_ARTICLES.find((candidate) => candidate.id === relatedId))
      .filter(Boolean);
    if (relatedArticles.length) {
      const relatedSection = document.createElement('section');
      relatedSection.className = 'help-related-section';
      const relatedTitle = document.createElement('h4');
      relatedTitle.textContent = 'Das könnte dich auch interessieren';
      const relatedList = document.createElement('div');
      relatedList.className = 'help-related-list';
      relatedArticles.forEach((relatedArticle) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost help-related-button';
        button.textContent = relatedArticle.title;
        button.addEventListener('click', () => openArticle(relatedArticle.id, { focusTarget: 'title' }));
        relatedList.append(button);
      });
      relatedSection.append(relatedTitle, relatedList);
      els.helpDetail.append(relatedSection);
    }
    els.helpResults.hidden = true;
    els.helpDetail.hidden = false;
    els.helpBackButton.hidden = false;
    if (focusTarget === 'title') {
      title.tabIndex = -1;
      title.focus();
    } else {
      els.helpBackButton.focus();
    }
  }

  function showResults({ focusSearch = false } = {}) {
    selectedArticleId = '';
    if (els.helpResults) els.helpResults.hidden = false;
    if (els.helpDetail) els.helpDetail.hidden = true;
    if (els.helpBackButton) els.helpBackButton.hidden = true;
    renderResults();
    if (focusSearch) els.helpSearch?.focus();
  }

  function openHelp() {
    closeDialog(els.helpEntryDialog);
    if (els.helpSearch) els.helpSearch.value = '';
    showResults({ focusSearch: false });
    openDialog(els.helpDialog);
    window.setTimeout(() => els.helpSearch?.focus(), 0);
  }

  function openEntry({ module = '' } = {}) {
    if (els.helpEntryDialogTitle) els.helpEntryDialogTitle.textContent = 'Hilfe';
    openDialog(els.helpEntryDialog);
    window.setTimeout(() => els.helpEntryTutorialButton?.focus(), 0);
  }

  els.helpEntryTutorialButton?.addEventListener('click', async () => {
    closeDialog(els.helpEntryDialog);
    await onStartTutorial();
  });
  els.helpEntryHelpButton?.addEventListener('click', openHelp);
  els.helpEntryCloseButton?.addEventListener('click', () => closeDialog(els.helpEntryDialog));
  els.helpCloseButton?.addEventListener('click', () => closeDialog(els.helpDialog));
  els.helpBackButton?.addEventListener('click', () => showResults({ focusSearch: true }));
  els.helpSearch?.addEventListener('input', () => {
    if (!selectedArticleId) renderResults({ animate: true });
  });
  els.helpDialog?.addEventListener('close', () => {
    selectedArticleId = '';
  });

  return { openEntry, openHelp, showResults };
}
