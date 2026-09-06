import { createHelpVisual, hasHelpPreview } from './help-visuals.js';

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

const MODULE_PRACTICE_TIPS = {
  allgemein: 'Notiere wichtige Speicherorte und prüfe Änderungen bewusst, bevor du den Arbeitsstand weiterverwendest.',
  grades: 'Arbeite bei personenbezogenen Noten möglichst in einer geschützten Ansicht und prüfe Änderungen direkt im betroffenen Kurs.',
  planning: 'Halte Informationen an der passenden Stunde fest, damit sie bei Rückblick, Vertretung und Anschlussplanung verständlich bleiben.',
  seatplan: 'Ein Vorschlag ist ein Ausgangspunkt: Prüfe ihn immer gegen die aktuelle pädagogische Situation und speichere bewährte Varianten.',
  'name-learning': 'Nutze nur abgesprochene Porträts und korrigiere unklare Zuordnungen, bevor du mit einer Übungsrunde startest.',
  groups: 'Kontrolliere Vorschläge vor dem Einsatz und halte nur die Bedingungen fest, die für die Lerngruppe wirklich hilfreich sind.',
  'random-picker': 'Mache Auswahlbedingungen transparent, damit Zufall und mögliche Gewichtungen für die Lerngruppe nachvollziehbar bleiben.',
  merger: 'Öffne erzeugte Dateien vor dem Drucken oder Weitergeben, damit Seitenfolge und Lesbarkeit geprüft sind.',
  'duplicate-check': 'Behandle technische Treffer als Hinweis und bewerte sie immer zusammen mit Aufgabe, Vorlage und erlaubter Zusammenarbeit.',
  'work-phase': 'Stimme sichtbare Zeit- und Lautstärkehilfen mit der Lerngruppe ab und passe sie an die konkrete Unterrichtssituation an.',
  qr: 'Prüfe erzeugte oder gelesene Inhalte, bevor du sie veröffentlichst oder einen darin enthaltenen Link öffnest.',
};

function article(id, module, title, summary, keywords, sections, options = {}) {
  const guidance = ARTICLE_GUIDANCE[id] || {};
  const tags = options.tags || ARTICLE_TAGS[id] || [];
  const enrichedSections = sections.length >= 3
    ? sections
    : [...sections, { title: 'Praxis-Tipp', text: MODULE_PRACTICE_TIPS[module] }];
  return {
    id,
    module,
    title,
    summary,
    keywords,
    tags: [...new Set(tags)].slice(0, 5),
    visualId: options.visualId || module,
    sections: enrichedSections,
    steps: options.steps || guidance.steps || [],
    relatedArticleIds: options.relatedArticleIds || guidance.relatedArticleIds || [],
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

const ARTICLE_TAGS = {
  'data-backup': ['Datenbank', 'Sicherung', 'Wiederherstellung'],
  'settings-theme': ['Einstellungen', 'Darstellung', 'Bedienung'],
  'database-setup': ['Datenbank', 'Speicherort', 'Einrichtung'],
  'data-import-export': ['Import', 'Export', 'Dateien'],
  'grades-start': ['Notenkurs', 'Lernende', 'Einrichtung'],
  'grades-entry': ['Leistungen', 'Noteneingabe', 'Kontrolle'],
  'grades-protection': ['Datenschutz', 'Verschlüsselung', 'Sperren'],
  'grades-structure': ['Bewertung', 'Gewichtung', 'Skala'],
  'grades-reports': ['Auswertung', 'Übersicht', 'Ausgabe'],
  'planning-week': ['Wochenansicht', 'Unterricht', 'Verlauf'],
  'planning-series': ['Kursserie', 'Kalender', 'Ausfälle'],
  'planning-courses': ['Kurse', 'Termine', 'Zuordnung'],
  'planning-content': ['Inhalte', 'Material', 'Nachbereitung'],
  'planning-archive': ['Archiv', 'Verlauf', 'Sicherung'],
  'seatplan-create': ['Sitzordnung', 'Platzierung', 'Varianten'],
  'seatplan-suggestions': ['Sitzvorschlag', 'Kriterien', 'Pädagogik'],
  'seatplan-room': ['Raumraster', 'Sitzplätze', 'Lehrkraft'],
  'seatplan-print': ['Druckansicht', 'Ausgabe', 'Vertretung'],
  'name-learning-practice': ['Karteikarten', 'Wiederholung', 'Kurse'],
  'name-learning-photos': ['Porträts', 'Datenschutz', 'Lernende'],
  'name-learning-modes': ['Fälligkeiten', 'Zufall', 'Übungsmodus'],
  'groups-create': ['Gruppenbildung', 'Gruppengröße', 'Vorschlag'],
  'groups-import': ['Namenslisten', 'Import', 'Lerngruppe'],
  'groups-edit': ['Gruppen ändern', 'Sperren', 'Themen'],
  'random-picker': ['Zufallsauswahl', 'Gewichtung', 'Fairness'],
  'picker-conditions': ['Verfügbarkeit', 'Gewichtung', 'Auswahl'],
  'picker-storage': ['Speicherstand', 'Wiederverwenden', 'Bedingungen'],
  'merger-pdf': ['PDF', 'Dateien', 'Seiten'],
  'pdf-layout': ['Drucklayout', 'Seiten pro Blatt', 'Ausgabe'],
  'pdf-rotate': ['Drehen', 'Seitenauswahl', 'Ausrichtung'],
  'pdf-split': ['Aufteilen', 'Seitengruppen', 'Dateiausgabe'],
  'duplicate-check': ['ZIP-Abgaben', 'Duplikate', 'Prüfung'],
  'duplicate-rules': ['Prüfkriterien', 'Bildähnlichkeit', 'Dateien'],
  'duplicate-results': ['Treffergruppen', 'Vergleich', 'Bewertung'],
  'work-phase': ['Arbeitsauftrag', 'Timer', 'Lautstärkeampel'],
  'work-phase-timer': ['Dauer', 'Zwischenwarnung', 'Endzeit'],
  'work-phase-monitor': ['Ampel', 'Mikrofon', 'Präsentation'],
  qr: ['QR-Code', 'Generator', 'Decoder'],
  'qr-create-share': ['Erzeugen', 'Teilen', 'Prüfung'],
  'qr-image-scan': ['Bildscan', 'Zwischenablage', 'Decoder'],
  'qr-camera': ['Kamera', 'Berechtigung', 'Scan'],
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
  article('data-privacy-local', 'allgemein', 'Datenschutz, lokale Verarbeitung und Berechtigungen', 'Einordnen, welche Daten TeachHelper verarbeitet und welche Freigaben bewusst erteilt werden.', ['datenschutz', 'lokal', 'berechtigung', 'kamera', 'mikrofon', 'datei'], [
    { title: 'Lokaler Arbeitsbereich', text: 'Arbeitsdateien und die Verarbeitung der Werkzeuge bleiben auf dem verwendeten Gerät. Teile Dateien nur über Wege, die für die jeweilige Lerngruppe und Schule vorgesehen sind.' },
    { title: 'Berechtigungen bewusst wählen', text: 'Kamera, Mikrofon oder Dateiauswahl werden nur für die angeforderte Funktion benötigt. Erlaube sie nur, wenn du die Funktion tatsächlich verwenden möchtest, und beende sie danach.' },
  ], { tags: ['Datenschutz', 'Lokale Verarbeitung', 'Berechtigungen'], steps: ['Vor dem Einsatz prüfen, welche personenbezogenen Angaben in der Ansicht sichtbar sind.', 'Eine angeforderte Berechtigung nur für die gewünschte Funktion freigeben.', 'Dateien, Freigaben und offene Ansichten nach dem Einsatz bewusst schließen.'], relatedArticleIds: ['grades-protection', 'qr-camera', 'data-backup'] }),
  article('data-offline-update', 'allgemein', 'Offline arbeiten, Updates und Wiederherstellung', 'Arbeitsfähig bleiben, wenn die Verbindung fehlt oder eine neue App-Version bereitsteht.', ['offline', 'update', 'version', 'wiederherstellen', 'app', 'cache'], [
    { title: 'Offline weiterarbeiten', text: 'Die installierte App hält ihre Bestandteile für die lokale Nutzung bereit. Prüfe trotzdem vor einem längeren Einsatz, dass die benötigte Datenbankdatei erreichbar ist und der aktuelle Arbeitsstand gespeichert wurde.' },
    { title: 'Updates sicher übernehmen', text: 'Wenn eine neue Version bereitsteht, speichere offene Änderungen und lade die App erst danach neu. Falls ein Arbeitsstand fehlt, nutze die zuletzt geprüfte Datenbankdatei oder Sicherung zur Wiederherstellung.' },
  ], { tags: ['Offline', 'Updates', 'Wiederherstellung'], steps: ['Vor einer Unterbrechung den Arbeitsstand sichern.', 'Eine verfügbare Aktualisierung erst nach dem Speichern übernehmen.', 'Bei Problemen Speicherort und Sicherung prüfen, bevor weitergearbeitet wird.'], relatedArticleIds: ['data-backup', 'database-setup', 'settings-theme'] }),
  article('grades-roster-transfer', 'grades', 'Lernende importieren, pflegen und weiterverwenden', 'Kurslisten sauber führen und sie für Sitzplan und Namenlernen konsistent nutzen.', ['lernende', 'kursliste', 'import', 'sitzplan', 'namenlernen', 'teilnehmende'], [
    { title: 'Eine verlässliche Kursliste', text: 'Übernimm Namen sorgfältig und korrigiere Schreibweisen im Notenkurs. Diese Liste ist die Grundlage für weitere Funktionen, die mit derselben Lerngruppe arbeiten.' },
    { title: 'Verknüpfte Nutzung', text: 'Kurslisten können für Sitzplan und Namenlernen bereitgestellt werden. Prüfe vor dem Wechsel, ob Kursname und Teilnehmendenzahl der gewünschten Lerngruppe entsprechen.' },
  ], { tags: ['Lernende', 'Kurslisten', 'Übernehmen'], steps: ['Den Notenkurs öffnen und Teilnehmende kontrollieren.', 'Fehlende oder doppelte Einträge vor der weiteren Nutzung korrigieren.', 'Die passende Kursliste im Zielmodul bewusst auswählen.'], relatedArticleIds: ['grades-start', 'seatplan-create', 'name-learning-photos'] }),
  article('grades-scales-expectations', 'grades', 'Skalen, Erwartungshorizont und Kommentare', 'Bewertungsvorgaben nachvollziehbar vorbereiten, bevor einzelne Leistungen eingetragen werden.', ['notenskala', 'erwartungshorizont', 'kommentar', 'punkte', 'grenze', 'bewertung'], [
    { title: 'Skalen vorab klären', text: 'Lege Punktebereiche und Bewertungslogik fest, bevor die erste Leistung eingetragen wird. Teste die Einstellungen mit Beispielwerten, damit Grenzfälle nachvollziehbar bleiben.' },
    { title: 'Rückmeldung einordnen', text: 'Erwartungshorizonte und Kommentare helfen bei einer einheitlichen Rückmeldung. Prüfe Formulierungen und individuelle Ergänzungen, bevor sie ausgegeben oder übertragen werden.' },
  ], { tags: ['Notenskalen', 'Erwartungshorizont', 'Kommentare'], steps: ['Bewertungsstruktur und Skala im passenden Kurs öffnen.', 'Grenzen mit einer Beispielbewertung kontrollieren.', 'Erwartungshorizont oder Kommentar vor der Ausgabe auf Vollständigkeit prüfen.'], relatedArticleIds: ['grades-structure', 'grades-entry', 'grades-reports'] }),
  article('planning-exceptions', 'planning', 'Einzeltermine, Ausfälle und Vertretungen planen', 'Regelmäßige Planung gezielt ergänzen, ohne den verlässlichen Wochenverlauf zu verlieren.', ['einzeltermin', 'ausfall', 'vertretung', 'ferien', 'sondertag', 'kalender'], [
    { title: 'Regel und Ausnahme trennen', text: 'Kursserien erzeugen wiederkehrende Stunden. Besondere Termine, Ausfälle und Vertretungen werden anschließend gezielt geprüft oder angepasst, damit die Regel verständlich bleibt.' },
    { title: 'Kalender aktuell halten', text: 'Ferien, Feiertage und Sondertage verhindern falsche Regeltermine. Kontrolliere die betroffene Woche nach einer Änderung, bevor du Inhalte daran planst.' },
  ], { tags: ['Einzeltermine', 'Ausfälle', 'Vertretung'], steps: ['Die betroffene Woche und den Kurs öffnen.', 'Termin, Ausfall oder Vertretung gezielt prüfen beziehungsweise anpassen.', 'Den Verlauf kontrollieren, damit keine reguläre Stunde doppelt geplant bleibt.'], relatedArticleIds: ['planning-series', 'planning-week', 'planning-courses'] }),
  article('planning-material-richtext', 'planning', 'Material, Links und Unterrichtsverlauf dokumentieren', 'Planungsnotizen so strukturieren, dass sie vor, während und nach der Stunde nützlich bleiben.', ['material', 'link', 'formatierung', 'notiz', 'unterrichtsverlauf', 'dokumentation'], [
    { title: 'Vor der Stunde', text: 'Halte Ziele, Material und Arbeitsaufträge im passenden Termin fest. Beschreibe Links so, dass ihr Zweck später ohne erneutes Öffnen erkennbar ist.' },
    { title: 'Nach der Stunde', text: 'Ergänze den tatsächlichen Verlauf und offene Anschlussschritte. So wird aus der Vorbereitung eine belastbare Dokumentation für Rückblick und Weiterplanung.' },
  ], { tags: ['Material', 'Links', 'Unterrichtsverlauf'], steps: ['Die konkrete Unterrichtsstunde öffnen.', 'Material, Aufgaben und Hinweise verständlich ergänzen.', 'Nach der Stunde Verlauf und nächste Schritte aktualisieren.'], relatedArticleIds: ['planning-content', 'planning-week', 'planning-archive'] }),
  article('seatplan-course-binding', 'seatplan', 'Kurslisten aus Noten übernehmen und Bindungen lösen', 'Eine verknüpfte Kursliste gezielt für den Sitzplan nutzen oder wieder in eine eigene Liste überführen.', ['notenkurs', 'kursliste', 'uebernehmen', 'übernehmen', 'bindung', 'teilnehmende'], [
    { title: 'Kursliste übernehmen', text: 'Wähle einen passenden Notenkurs, wenn die Sitzordnung dieselben Teilnehmenden verwenden soll. Die Bindung vermeidet unterschiedliche Namensstände in beiden Modulen.' },
    { title: 'Eigenständig weiterarbeiten', text: 'Löse die Kursbindung nur, wenn ein unabhängiger Sitzplan nötig ist. Prüfe danach, ob alle benötigten Namen und Plätze weiterhin vorhanden sind.' },
  ], { tags: ['Kursbindung', 'Notenkurse', 'Teilnehmende'], steps: ['Den gewünschten Kurs im Sitzplan auswählen.', 'Die übernommene Liste und Anzahl der Lernenden prüfen.', 'Eine Bindung nur bei Bedarf lösen und die eigene Liste anschließend kontrollieren.'], relatedArticleIds: ['grades-roster-transfer', 'seatplan-create', 'seatplan-room'] }),
  article('seatplan-variants-output', 'seatplan', 'Sitzplanvarianten prüfen und ausgeben', 'Bewährte Sitzordnungen behalten, Änderungen vergleichen und eine klare Ansicht weitergeben.', ['variante', 'sitzplan', 'drucken', 'ausgabe', 'vertretung', 'speichern'], [
    { title: 'Varianten sinnvoll nutzen', text: 'Speichere einen geprüften Plan, bevor du eine neue Anordnung ausprobierst. Varianten helfen, unterschiedliche Phasen oder Lerngruppensituationen nachvollziehbar zu trennen.' },
    { title: 'Für andere lesbar machen', text: 'Kontrolliere Namen, Raumraster und Perspektive vor der Ausgabe. Eine reduzierte, klare Ansicht ist für Vertretungen hilfreicher als ein ungeprüfter Zwischenstand.' },
  ], { tags: ['Varianten', 'Ausgabe', 'Vertretung'], steps: ['Die gewünschte Sitzplanvariante laden.', 'Namen und Raumdarstellung prüfen.', 'Erst danach drucken oder eine geprüfte Variante weitergeben.'], relatedArticleIds: ['seatplan-create', 'seatplan-print', 'seatplan-suggestions'] }),
  article('name-learning-selection-progress', 'name-learning', 'Kurse auswählen und Wiederholungen verstehen', 'Übungsumfang und Rückmeldungen so wählen, dass unsichere Namen gezielt wiederkehren.', ['kursauswahl', 'faellig', 'fällig', 'fortschritt', 'wiederholung', 'karteikarte'], [
    { title: 'Passende Kurse wählen', text: 'Wähle nur die Lerngruppen aus, die du gerade üben möchtest. Eine kleine, regelmäßige Auswahl ist oft hilfreicher als eine lange Runde mit vielen unbekannten Karten.' },
    { title: 'Rückmeldungen nutzen', text: 'Markiere Namen ehrlich als gewusst oder unsicher. Die Wiederholung orientiert sich an dieser Rückmeldung und macht Übungsbedarf sichtbar.' },
  ], { tags: ['Kursauswahl', 'Fälligkeiten', 'Fortschritt'], steps: ['Die gewünschten Kurse auswählen.', 'Fällige oder zufällige Karten passend zur Situation starten.', 'Nach jeder Antwort die Rückmeldung setzen und die nächste Karte öffnen.'], relatedArticleIds: ['name-learning-practice', 'name-learning-modes', 'name-learning-photos'] }),
  article('name-learning-photo-privacy', 'name-learning', 'Porträts fürs Namenlernen verantwortungsvoll einsetzen', 'Bilddaten nur mit passender Grundlage verwenden und verständlich für die Übung vorbereiten.', ['portrait', 'porträt', 'foto', 'datenschutz', 'einwilligung', 'lernende'], [
    { title: 'Geeignete Bilder', text: 'Nutze nur Porträts, deren Verwendung abgesprochen und zulässig ist. Ein klar erkennbares, aktuelles Bild unterstützt das Lernen besser als ein unpassender Ausschnitt.' },
    { title: 'Vor der Übung prüfen', text: 'Kontrolliere die Zuordnung von Name und Bild im Notenkurs. Fehlende oder unklare Porträts werden im Namenlernen nicht durch echte Daten ersetzt.' },
  ], { tags: ['Porträts', 'Datenschutz', 'Zuordnung'], steps: ['Die Kursliste im Notenbereich öffnen.', 'Bild und Namenszuordnung prüfen oder korrigieren.', 'Die Karteikartenansicht erst danach für die Übung verwenden.'], relatedArticleIds: ['name-learning-photos', 'grades-protection', 'name-learning-practice'] }),
  article('groups-conditions-performance', 'groups', 'Bedingungen, Leistungsklassen und Partnerwünsche', 'Gruppenvorschläge mit transparenten Regeln vorbereiten und pädagogisch einordnen.', ['bedingungen', 'leistungsklasse', 'partnerwuensche', 'partnerwünsche', 'gruppe', 'kriterien'], [
    { title: 'Bedingungen bewusst setzen', text: 'Leistungsklassen sowie gute oder schwierige Gruppenpartner können einen Vorschlag beeinflussen. Pflege nur Informationen, die aktuell, nachvollziehbar und für die Aufgabe sinnvoll sind.' },
    { title: 'Vorschläge verantwortlich prüfen', text: 'Ein berechnetes Ergebnis kennt nicht jede Tagesform oder Konfliktsituation. Passe Gruppen manuell an, wenn deine pädagogische Einschätzung etwas anderes nahelegt.' },
  ], { tags: ['Bedingungen', 'Leistungsklassen', 'Partnerwünsche'], steps: ['Lerngruppe und Gruppengrößen kontrollieren.', 'Hilfreiche Bedingungen gezielt ergänzen.', 'Den Vorschlag prüfen und bei Bedarf manuell anpassen.'], relatedArticleIds: ['groups-create', 'groups-edit', 'seatplan-suggestions'] }),
  article('groups-save-share', 'groups', 'Gruppeneinteilungen sichern und ausgeben', 'Geprüfte Einteilungen wiederverwenden und für die Unterrichtssituation klar bereitstellen.', ['speichern', 'export', 'ausgabe', 'gruppe', 'wiederverwenden', 'einteilung'], [
    { title: 'Geprüfte Stände behalten', text: 'Speichere eine Einteilung erst, wenn Gruppengrößen, Themen und Sperren stimmen. So kannst du später nachvollziehen, welche Variante im Einsatz war.' },
    { title: 'Ausgabe vorbereiten', text: 'Kontrolliere vor einer Ausgabe, welche Informationen die Lerngruppe wirklich benötigt. Eine klare Darstellung der Gruppen und Themen vermeidet Rückfragen zu Beginn der Arbeitsphase.' },
  ], { tags: ['Einteilungen', 'Speichern', 'Ausgabe'], steps: ['Die fertige Gruppeneinteilung öffnen.', 'Gruppen, Themen und gesperrte Entscheidungen prüfen.', 'Den Stand sichern oder in der passenden Form ausgeben.'], relatedArticleIds: ['groups-edit', 'groups-create', 'work-phase'] }),
  article('picker-availability-source', 'random-picker', 'Namenslisten und Verfügbarkeit im Picker steuern', 'Die Auswahlmenge vor einer Ziehung prüfen und Änderungen nachvollziehbar halten.', ['namensliste', 'verfuegbar', 'verfügbar', 'kursliste', 'picker', 'teilnahme'], [
    { title: 'Auswahlmenge kontrollieren', text: 'Prüfe vor der Ziehung, welche Namen verfügbar sind und ob die Liste zur aktuellen Lerngruppe passt. Nicht teilnehmende Personen sollten nur für die konkrete Situation deaktiviert werden.' },
    { title: 'Quelle bewusst wählen', text: 'Eine aktuelle gemeinsame Namensliste verhindert Überraschungen bei der Ziehung. Übernimm Änderungen erst, nachdem die Namen und Gewichte kontrolliert wurden.' },
  ], { tags: ['Namenslisten', 'Verfügbarkeit', 'Teilnahme'], steps: ['Die aktuelle Namensliste im Picker öffnen.', 'Verfügbarkeit und Gewichtungen kontrollieren.', 'Die Auswahl erst dann starten oder den Zustand speichern.'], relatedArticleIds: ['picker-conditions', 'picker-storage', 'random-picker'] }),
  article('picker-repeat-fairness', 'random-picker', 'Ziehungen wiederholen und fair erklären', 'Automatische Deaktivierung, Gewichtungen und Wiederholungen transparent einsetzen.', ['fairness', 'wiederholung', 'deaktivieren', 'gewichtung', 'zufall', 'auswahl'], [
    { title: 'Wiederholung entscheiden', text: 'Lege vor der Ziehung fest, ob gewählte Namen für die nächste Runde weiter verfügbar bleiben. Die automatische Deaktivierung passt vor allem zu einer Runde ohne Wiederholung.' },
    { title: 'Fairness erklären', text: 'Gewichtungen verändern Wahrscheinlichkeiten. Wenn du sie einsetzt, erkläre das Prinzip und kontrolliere den Zustand, bevor die Lerngruppe die Ziehung sieht.' },
  ], { tags: ['Fairness', 'Wiederholung', 'Gewichtungen'], steps: ['Auswahlbedingungen vor der Runde sichtbar prüfen.', 'Die Ziehung starten und das Ergebnis benennen.', 'Verfügbarkeit für die nächste Runde bewusst zurücksetzen oder beibehalten.'], relatedArticleIds: ['random-picker', 'picker-conditions', 'picker-storage'] }),
  article('pdf-merge-order', 'merger', 'PDFs verbinden und die Seitenfolge prüfen', 'Mehrere Dateien in einer kontrollierten Reihenfolge zu einem Material zusammenführen.', ['pdf', 'verbinden', 'reihenfolge', 'seiten', 'datei', 'zusammenfuegen'], [
    { title: 'Dateien vorbereiten', text: 'Wähle nur die Dateien aus, die gemeinsam gebraucht werden. Kontrolliere ihre Reihenfolge und Seitenzahl, bevor das neue Dokument erzeugt wird.' },
    { title: 'Ergebnis absichern', text: 'Das Werkzeug erstellt eine neue Datei; die Originale bleiben unverändert. Öffne das Ergebnis und prüfe Übergänge, Deckblätter und die letzte Seite vor der Weitergabe.' },
  ], { tags: ['PDF verbinden', 'Seitenfolge', 'Dateien'], steps: ['Das Werkzeug zum Verbinden öffnen.', 'Dateien hinzufügen und die Reihenfolge kontrollieren.', 'Die erzeugte Datei öffnen und vollständig prüfen.'], relatedArticleIds: ['merger-pdf', 'pdf-layout', 'pdf-split'] }),
  article('pdf-local-results', 'merger', 'PDF-Ergebnisse lokal prüfen und weitergeben', 'Erzeugte Materialien sorgfältig kontrollieren, bevor sie gedruckt oder geteilt werden.', ['lokal', 'pdf', 'ergebnis', 'drucken', 'weitergeben', 'datei'], [
    { title: 'Lokale Verarbeitung verstehen', text: 'Die PDF-Werkzeuge erzeugen Ergebnisse auf dem verwendeten Gerät. Behalte trotzdem im Blick, welche Dateien du öffnest, speicherst oder über einen anderen Weg weitergibst.' },
    { title: 'Sichtprüfung vor Ausgabe', text: 'Öffne jede erzeugte Datei und kontrolliere Lesbarkeit, Seitenfolge und Inhalt. Besonders bei Arbeitsblättern fallen so leere oder falsch gedrehte Seiten rechtzeitig auf.' },
  ], { tags: ['Lokale Verarbeitung', 'PDF-Ergebnis', 'Sichtprüfung'], steps: ['Die erzeugte PDF lokal öffnen.', 'Inhalt und Seitenfolge stichprobenartig oder vollständig prüfen.', 'Erst danach drucken oder über den vorgesehenen Weg weitergeben.'], relatedArticleIds: ['merger-pdf', 'pdf-layout', 'pdf-rotate'] }),
  article('duplicate-zip-limits', 'duplicate-check', 'ZIP-Abgaben vorbereiten und Grenzen der Prüfung kennen', 'Eine passende Eingabedatei wählen und technische Hinweise nicht überinterpretieren.', ['zip', 'abgaben', 'grenzen', 'datei', 'pruefung', 'prüfung'], [
    { title: 'ZIP-Datei vorbereiten', text: 'Lege die zu vergleichenden Abgaben in einer klaren ZIP-Datei bereit. Eine nachvollziehbare Ordnerstruktur erleichtert es, Treffer später im richtigen Kontext zu öffnen.' },
    { title: 'Aussagekraft begrenzen', text: 'Ähnliche Dateinamen, Größen oder Bilder können durch Vorlagen und erlaubte Zusammenarbeit entstehen. Die Prüfung kann auffällige Stellen zeigen, aber keine Täuschungsabsicht feststellen.' },
  ], { tags: ['ZIP-Abgaben', 'Prüfgrenzen', 'Kontext'], steps: ['Eine übersichtliche ZIP-Datei mit den Abgaben auswählen.', 'Nur passende Prüfkriterien aktivieren.', 'Hinweise anschließend mit Aufgabe und Dateien im Kontext vergleichen.'], relatedArticleIds: ['duplicate-check', 'duplicate-rules', 'duplicate-results'] }),
  article('duplicate-evidence-review', 'duplicate-check', 'Treffer vergleichen und verantwortungsvoll dokumentieren', 'Auffälligkeiten sachlich prüfen, statt technische Ähnlichkeit vorschnell zu bewerten.', ['treffer', 'vergleich', 'dokumentation', 'beweis', 'bewertung', 'abgabe'], [
    { title: 'Dateien vergleichen', text: 'Öffne die betroffenen Dateien einzeln und lies die angezeigten Treffergründe. Berücksichtige Arbeitsauftrag, Vorlagen und mögliche gemeinsame Quellen.' },
    { title: 'Ergebnis einordnen', text: 'Halte nur nachvollziehbare Beobachtungen fest und vermeide voreilige Schlussfolgerungen. Für pädagogische Entscheidungen zählen immer der vollständige Kontext und die geltenden Regeln.' },
  ], { tags: ['Treffervergleich', 'Dokumentation', 'Einordnung'], steps: ['Eine Treffergruppe öffnen.', 'Dateien und Gründe im Kontext vergleichen.', 'Die Beobachtung sachlich einordnen oder Regeln passend anpassen.'], relatedArticleIds: ['duplicate-results', 'duplicate-rules', 'duplicate-zip-limits'] }),
  article('work-phase-presentation', 'work-phase', 'Arbeitsauftrag und Zeit im Raum präsentieren', 'Eine klare, gut lesbare Arbeitsphase für die Lerngruppe vorbereiten.', ['praesentation', 'präsentation', 'arbeitsauftrag', 'timer', 'raum', 'anzeige'], [
    { title: 'Auftrag sichtbar formulieren', text: 'Formuliere den Arbeitsauftrag kurz, konkret und so, dass die Lerngruppe ihn ohne zusätzliche Erklärung wiederfindet. Ergänze eine realistische Dauer und kontrolliere die Anzeige vor dem Start.' },
    { title: 'Raumansicht nutzen', text: 'Die Präsentationsansicht hebt Auftrag und Zeit für den Raum hervor. Beende oder aktualisiere die Arbeitsphase bewusst, damit keine veralteten Hinweise sichtbar bleiben.' },
  ], { tags: ['Präsentation', 'Arbeitsauftrag', 'Raumansicht'], steps: ['Arbeitsauftrag und Dauer eintragen.', 'Die Ansicht aus der Lerngruppenperspektive prüfen.', 'Timer starten und die Anzeige nach Abschluss aktualisieren.'], relatedArticleIds: ['work-phase', 'work-phase-timer', 'work-phase-monitor'] }),
  article('work-phase-signals', 'work-phase', 'Warnungen, Ton und Ampel verantwortungsvoll nutzen', 'Zeit- und Lautstärkehinweise verständlich und mit transparenter Absprache einsetzen.', ['warnung', 'ton', 'ampel', 'mikrofon', 'lautstaerke', 'lautstärke'], [
    { title: 'Signale dosieren', text: 'Zwischenwarnungen und Endsignale helfen bei der Zeitstruktur, wenn sie vorher erklärt wurden. Wähle sie so zurückhaltend, dass sie Arbeitsphasen unterstützen und nicht unnötig unterbrechen.' },
    { title: 'Ampel transparent einsetzen', text: 'Eine Mikrofonüberwachung braucht eine klare Absprache. Die Ampel ist eine Orientierung für die Gruppe und ersetzt weder Aufsicht noch pädagogische Rückmeldung.' },
  ], { tags: ['Warnsignale', 'Lautstärkeampel', 'Transparenz'], steps: ['Warnungen und Ampelschwellen passend einstellen.', 'Die Bedeutung der Signale mit der Lerngruppe klären.', 'Überwachung und Ton nach der Arbeitsphase bewusst beenden.'], relatedArticleIds: ['work-phase-monitor', 'work-phase-timer', 'work-phase-presentation'] }),
  article('qr-share-safely', 'qr', 'QR-Codes sicher teilen und vorab testen', 'Erzeugte Codes als Material bereitstellen, ohne falsche oder ungeprüfte Ziele zu verbreiten.', ['qr', 'teilen', 'testscan', 'link', 'herunterladen', 'material'], [
    { title: 'Ziel vorab prüfen', text: 'Kontrolliere Link oder Text vor dem Erzeugen. Bei Links ist ein Test auf dem vorgesehenen Gerät sinnvoll, besonders wenn der Zugang von einem Schulnetz abhängt.' },
    { title: 'Material bereitstellen', text: 'Lade den QR-Code erst nach dem Test herunter oder kopiere ihn in dein Material. Ein sichtbarer Hinweis zum Ziel hilft, wenn Lernende den Code später erneut verwenden.' },
  ], { tags: ['Teilen', 'Testscan', 'Linkprüfung'], steps: ['Link oder Text vollständig eingeben.', 'QR-Code erzeugen und mit einem Testscan prüfen.', 'Den geprüften Code für Druck oder digitale Kanäle bereitstellen.'], relatedArticleIds: ['qr-create-share', 'qr', 'qr-image-scan'] }),
  article('qr-result-safety', 'qr', 'Scan-Ergebnisse und Links sicher beurteilen', 'Gelesene Inhalte erst verstehen und dann kopieren oder öffnen.', ['qr', 'scan', 'link', 'sicherheit', 'decoder', 'zwischenablage'], [
    { title: 'Ergebnis lesen', text: 'Prüfe, ob der gelesene Inhalt ein Link oder freier Text ist. Bei unbekannten Links hilft es, Ziel und Schreibweise zu kontrollieren, statt direkt zu öffnen.' },
    { title: 'Sicher weiterarbeiten', text: 'Kopiere einen geprüften Inhalt bei Bedarf in die Zwischenablage. Kamera und Decoder können anschließend geschlossen werden, wenn sie nicht mehr benötigt werden.' },
  ], { tags: ['Scan-Ergebnis', 'Linksicherheit', 'Decoder'], steps: ['QR-Code aus Bild, Zwischenablage oder Kamera lesen.', 'Das erkannte Ergebnis sorgfältig prüfen.', 'Inhalt kopieren oder einen Link erst nach der Kontrolle öffnen.'], relatedArticleIds: ['qr-image-scan', 'qr-camera', 'qr-share-safely'] }),
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

export function normalizeHelpSearchWithMap(value) {
  const source = String(value || '');
  const characters = [];
  const map = [];
  for (let index = 0; index < source.length; index += 1) {
    const decomposed = source[index]
      .toLocaleLowerCase('de')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss');
    for (const character of decomposed) {
      if (/[a-z0-9]/.test(character)) {
        characters.push(character);
        map.push(index);
      } else if (characters.length && characters[characters.length - 1] !== ' ') {
        characters.push(' ');
        map.push(index);
      }
    }
  }
  while (characters.length && characters[characters.length - 1] === ' ') {
    characters.pop();
    map.pop();
  }
  map.push(source.length);
  return { normalized: characters.join(''), map };
}

export function collectHighlightTerms(query) {
  return [...new Set(tokenize(query))].sort((left, right) => right.length - left.length);
}

export function findHighlightRanges(text, terms) {
  if (!text || !terms?.length) return [];
  const { normalized, map } = normalizeHelpSearchWithMap(text);
  if (!normalized) return [];
  const ranges = [];
  terms.forEach((term) => {
    if (!term) return;
    let from = 0;
    for (;;) {
      const start = normalized.indexOf(term, from);
      if (start === -1) break;
      from = start + 1;
      if (start > 0 && normalized[start - 1] !== ' ') continue;
      ranges.push({ start: map[start], end: map[start + term.length] });
    }
  });
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  return ranges.reduce((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      return merged;
    }
    merged.push({ ...range });
    return merged;
  }, []);
}

export function applyHighlight(element, text, terms) {
  const value = String(text ?? '');
  const ranges = findHighlightRanges(value, terms);
  if (!ranges.length) {
    element.textContent = value;
    return;
  }
  const nodes = [];
  let cursor = 0;
  ranges.forEach(({ start, end }) => {
    if (start > cursor) nodes.push(document.createTextNode(value.slice(cursor, start)));
    const marker = document.createElement('mark');
    marker.className = 'help-mark';
    marker.textContent = value.slice(start, end);
    nodes.push(marker);
    cursor = end;
  });
  if (cursor < value.length) nodes.push(document.createTextNode(value.slice(cursor)));
  element.replaceChildren(...nodes);
}

function searchableText(articleItem) {
  return normalizeHelpSearch([
    articleItem.title,
    articleItem.summary,
    articleItem.module,
    MODULE_LABELS[articleItem.module],
    ...(articleItem.tags || []),
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
    tags: normalizeHelpSearch((articleItem.tags || []).join(' ')),
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
    + scoreFor(fields.tags, 92, 58)
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

function normalizedTagSet(articleItem) {
  return new Set((articleItem?.tags || []).map(normalizeHelpSearch).filter(Boolean));
}

export function resolveRelatedArticles(articleItem, articles = HELP_ARTICLES, limit = 3) {
  if (!articleItem || !Array.isArray(articles) || limit <= 0) return [];
  const byId = new Map(articles.map((candidate) => [candidate.id, candidate]));
  const related = [];
  const seen = new Set([articleItem.id]);
  (articleItem.relatedArticleIds || []).forEach((relatedId) => {
    const candidate = byId.get(relatedId);
    if (!candidate || seen.has(candidate.id) || related.length >= limit) return;
    seen.add(candidate.id);
    related.push(candidate);
  });
  if (related.length >= limit) return related;

  const sourceTags = normalizedTagSet(articleItem);
  const suggestions = articles
    .filter((candidate) => !seen.has(candidate.id))
    .map((candidate) => {
      const sharedTags = [...normalizedTagSet(candidate)].filter((tag) => sourceTags.has(tag));
      const sameModule = candidate.module === articleItem.module;
      if (!sharedTags.length || (!sameModule && sharedTags.length < 2)) return null;
      return {
        candidate,
        score: sharedTags.length * 100 + (sameModule ? 25 : 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.score - left.score
      || left.candidate.title.localeCompare(right.candidate.title, 'de')
    ));
  suggestions.some(({ candidate }) => {
    if (related.length >= limit) return true;
    seen.add(candidate.id);
    related.push(candidate);
    return false;
  });
  return related;
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
  let visualCleanup = null;

  const moduleLabel = (module) => MODULE_LABELS[module] || MODULE_LABELS.allgemein;
  const selectedArticle = () => HELP_ARTICLES.find((item) => item.id === selectedArticleId) || null;
  const activeTerms = () => collectHighlightTerms(els.helpSearch?.value || '');
  const clearVisual = () => {
    const cleanup = visualCleanup;
    visualCleanup = null;
    cleanup?.();
  };

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
    const terms = activeTerms();
    results.forEach((articleItem) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'help-result-card';
      button.dataset.helpArticleId = articleItem.id;
      const title = document.createElement('strong');
      applyHighlight(title, articleItem.title, terms);
      const meta = document.createElement('span');
      meta.className = 'help-result-meta';
      const summary = document.createElement('span');
      applyHighlight(summary, articleItem.summary, terms);
      meta.append(document.createTextNode(`${moduleLabel(articleItem.module)} · `), summary);
      button.append(title, meta);
      button.addEventListener('click', () => openArticle(articleItem.id));
      container.append(button);
    });
    if (animate) animateResults();
  }

  function openArticle(id, { focusTarget = 'title' } = {}) {
    selectedArticleId = id;
    const articleItem = selectedArticle();
    if (!articleItem || !els.helpDetail) return;
    clearVisual();
    els.helpDetail.replaceChildren();
    const terms = activeTerms();
    const label = document.createElement('p');
    label.className = 'help-article-module';
    label.textContent = moduleLabel(articleItem.module);
    const title = document.createElement('h3');
    title.className = 'help-article-title';
    applyHighlight(title, articleItem.title, terms);
    const summary = document.createElement('p');
    summary.className = 'help-article-summary';
    applyHighlight(summary, articleItem.summary, terms);
    els.helpDetail.append(label, title, summary);
    if (hasHelpPreview(articleItem.id)) {
      const visual = createHelpVisual(articleItem, { doc: els.helpDetail.ownerDocument || document });
      if (visual.element) els.helpDetail.append(visual.element);
      visualCleanup = visual.destroy;
    }
    articleItem.sections.forEach((section) => {
      const sectionNode = document.createElement('section');
      const sectionTitle = document.createElement('h4');
      applyHighlight(sectionTitle, section.title, terms);
      const copy = document.createElement('p');
      applyHighlight(copy, section.text, terms);
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
        applyHighlight(item, step, terms);
        steps.append(item);
      });
      stepsSection.append(stepsTitle, steps);
      els.helpDetail.append(stepsSection);
    }
    const relatedArticles = resolveRelatedArticles(articleItem);
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
        button.addEventListener('click', () => openArticle(relatedArticle.id));
        relatedList.append(button);
      });
      relatedSection.append(relatedTitle, relatedList);
      els.helpDetail.append(relatedSection);
    }
    els.helpResults.hidden = true;
    els.helpDetail.hidden = false;
    els.helpDetail.scrollTop = 0;
    els.helpBackButton.hidden = false;
    if (focusTarget === 'back') {
      els.helpBackButton.focus();
    } else {
      title.tabIndex = -1;
      title.focus();
    }
  }

  function showResults({ focusSearch = false, render = true } = {}) {
    selectedArticleId = '';
    clearVisual();
    if (els.helpResults) els.helpResults.hidden = false;
    if (els.helpDetail) els.helpDetail.hidden = true;
    if (els.helpBackButton) els.helpBackButton.hidden = true;
    if (render) renderResults();
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
    if (selectedArticleId) showResults({ render: false });
    renderResults({ animate: true });
  });
  els.helpDialog?.addEventListener('close', () => {
    selectedArticleId = '';
    clearVisual();
  });

  return { openEntry, openHelp, showResults };
}
