export const HELP_PREVIEW_QUERY_PARAM = 'help-preview';
export const HELP_PREVIEW_COMMAND_EVENT = 'classroom:help-preview-command';
export const HELP_PREVIEW_STATE_EVENT = 'classroom:help-preview-state';

const preview = (tab, steps) => Object.freeze({
  tab,
  frames: Object.freeze(steps.map((stepTitle) => Object.freeze({ stepTitle, label: stepTitle }))),
});

export const HELP_PREVIEW_CONFIGS = Object.freeze({
  'data-backup': preview('planning', ['Datenbank', 'Backup', 'Speichern und weiterarbeiten']),
  'settings-theme': preview('planning', ['Einstellungen öffnen', 'Erscheinungsbild wählen', 'Einstellungen übernehmen']),
  'database-setup': preview('planning', ['Datenbank', 'Backup', 'Speichern und weiterarbeiten']),
  'data-import-export': preview('planning', ['Datenbank', 'Backup', 'Speichern und weiterarbeiten']),
  'data-privacy-local': preview('grades', ['Datenbank verbinden', 'Noten verschlüsseln', 'Datenschutzmodus']),
  'data-offline-update': preview('planning', ['Datenbank', 'Backup', 'Manuell speichern']),

  'grades-start': preview('grades', ['Kurs anlegen', 'Teilnehmende verwalten', 'Notenübersicht lesen']),
  'grades-entry': preview('grades', ['Angaben zur Leistung', 'Leistung benennen', 'Ergebnisse erfassen']),
  'grades-protection': preview('grades', ['Noten verschlüsseln', 'Automatisch sperren', 'Datenschutzmodus']),
  'grades-structure': preview('grades', ['Notenstruktur festlegen', 'Prozentgrenzen festlegen', 'Struktur für neue Kurse']),
  'grades-reports': preview('grades', ['Notenübersicht lesen', 'Übersicht drucken', 'Schuljahr archivieren']),
  'grades-roster-transfer': preview('grades', ['Teilnehmende verwalten', 'Kurs anlegen', 'Fotos und Namen lernen']),
  'grades-scales-expectations': preview('grades', ['Prozentgrenzen festlegen', 'Erwartungshorizont erstellen', 'Vorlagen hinterlegen']),

  'planning-week': preview('planning', ['Wochenraster', 'Woche wechseln', 'Thema direkt eintragen']),
  'planning-series': preview('planning', ['Serie per Doppelklick anlegen', 'Serie konfigurieren', 'Gültigkeitszeitraum']),
  'planning-courses': preview('planning', ['Kurs hinzufügen', 'Kursdaten', 'Kurse bedienen']),
  'planning-content': preview('planning', ['Thema direkt eintragen', 'Detailplanung', 'Notizen formatieren']),
  'planning-archive': preview('planning', ['Kursverlauf öffnen', 'Archiv vorbereiten', 'Archivumfang wählen']),
  'planning-exceptions': preview('planning', ['Ferien eintragen', 'Unterrichtsfreie Tage', 'Serie per Doppelklick anlegen']),
  'planning-material-richtext': preview('planning', ['Detailplanung', 'Notizen formatieren', 'Sitzplan öffnen']),

  'seatplan-create': preview('seatplan', ['Raumform auswählen', 'Sitzplätze festlegen', 'Sitzplan speichern']),
  'seatplan-suggestions': preview('seatplan', ['Sitzkriterien eingeben', 'Vorschlag oder Zufall', 'Kriterien auswerten']),
  'seatplan-room': preview('seatplan', ['Rastergröße anpassen', 'Raumform auswählen', 'Lehrkraft platzieren']),
  'seatplan-print': preview('seatplan', ['Perspektive umdrehen', 'Sitzplan drucken', 'Sitzplan speichern']),
  'seatplan-course-binding': preview('seatplan', ['Aus dem Notenmodul übernehmen', 'Sitzplan laden', 'Sitzkriterien eingeben']),
  'seatplan-variants-output': preview('seatplan', ['Sitzplan laden', 'Sitzplan speichern', 'Sitzplan drucken']),

  'name-learning-practice': preview('name-learning', ['Foto ansehen', 'Namen aufdecken', 'Gewusst oder nicht']),
  'name-learning-photos': preview('name-learning', ['Karten aus dem Notenmodul', 'Kurse auswählen', 'Foto ansehen']),
  'name-learning-modes': preview('name-learning', ['Fällige Karten abfragen', 'Zufällig üben', 'Nächste Abfrage']),
  'name-learning-selection-progress': preview('name-learning', ['Kurse auswählen', 'Fällige Karten abfragen', 'Nächste Abfrage']),
  'name-learning-photo-privacy': preview('name-learning', ['Karten aus dem Notenmodul', 'Kurse auswählen', 'Foto ansehen']),

  'groups-create': preview('groups', ['Minimale Gruppengröße', 'Vorschlag erzeugen', 'Gruppenraster']),
  'groups-import': preview('groups', ['Namensliste importieren', 'Vorlage für die Namensliste', 'Freie Lernende']),
  'groups-edit': preview('groups', ['Einteilung manuell anpassen', 'Gruppen sperren', 'Gruppenthemen eintragen']),
  'groups-conditions-performance': preview('groups', ['Gruppenkriterien öffnen', 'Vorschlag erzeugen', 'Einteilung manuell anpassen']),
  'groups-save-share': preview('groups', ['Gruppeneinteilung speichern', 'Gruppen drucken', 'Gruppeneinteilung laden']),

  'random-picker': preview('random-picker', ['Picker-Rad', 'Auswahl starten', 'Ergebnis erkennen']),
  'picker-conditions': preview('random-picker', ['Gemeinsame Namensliste', 'Auswahlbedingungen öffnen', 'Nach der Ziehung deaktivieren']),
  'picker-storage': preview('random-picker', ['Pickerstand speichern', 'Pickerstand laden', 'Auswahl starten']),
  'picker-availability-source': preview('random-picker', ['Gemeinsame Namensliste', 'Auswahlbedingungen öffnen', 'Auswahl starten']),
  'picker-repeat-fairness': preview('random-picker', ['Nach der Ziehung deaktivieren', 'Erneut auswählen', 'Picker-Rad']),

  'merger-pdf': preview('merger', ['Werkzeugauswahl', 'Dateien verbinden', 'Dateien zusammenführen']),
  'pdf-layout': preview('merger', ['Seiten auf ein Blatt', 'Seiten pro Blatt', 'Layout erstellen']),
  'pdf-rotate': preview('merger', ['PDF drehen', 'Einzelne Seiten drehen', 'Gedrehte PDF erstellen']),
  'pdf-split': preview('merger', ['PDF aufteilen', 'Seitenauswahl', 'Aufteilung starten']),
  'pdf-merge-order': preview('merger', ['Dateien verbinden', 'Dateireihenfolge', 'Dateien zusammenführen']),
  'pdf-local-results': preview('merger', ['Layout erstellen', 'Dateien zusammenführen', 'Aufteilung starten']),

  'duplicate-check': preview('duplicate-check', ['Prüfkriterien auswählen', 'Abgaben als ZIP prüfen', 'Zusammenfassung']),
  'duplicate-rules': preview('duplicate-check', ['Prüfkriterien auswählen', 'Gleicher Dateiname', 'Ähnlicher Bildinhalt']),
  'duplicate-results': preview('duplicate-check', ['Duplikatgruppen', 'Treffergründe', 'Einzelne Dateien öffnen']),
  'duplicate-zip-limits': preview('duplicate-check', ['Abgaben als ZIP prüfen', 'Geprüfte Datei', 'Originale bleiben unverändert']),
  'duplicate-evidence-review': preview('duplicate-check', ['Duplikatgruppen', 'Treffergründe', 'Bilder vergleichen']),

  'work-phase': preview('work-phase', ['Arbeitsauftrag eingeben', 'Arbeitsdauer festlegen', 'Ampelfarben verstehen']),
  'work-phase-timer': preview('work-phase', ['Arbeitsdauer festlegen', 'Zwischenwarnungen konfigurieren', 'Arbeitszeit starten']),
  'work-phase-monitor': preview('work-phase', ['Ampelschwellen festlegen', 'Ampel-Warntöne', 'Ampelfarben verstehen']),
  'work-phase-presentation': preview('work-phase', ['Präsentationsansicht', 'Automatisches Vollbildlayout', 'Schnellaktionen im Vollbild']),
  'work-phase-signals': preview('work-phase', ['Zwischenwarnungen konfigurieren', 'Endsignal konfigurieren', 'Ampel-Warntöne']),

  'qr': preview('qr', ['QR-Werkzeuge auswählen', 'Link eingeben', 'QR-Code erstellen']),
  'qr-create-share': preview('qr', ['Link eingeben', 'QR-Code erstellen', 'QR-Code herunterladen']),
  'qr-image-scan': preview('qr', ['QR-Code aus Bild lesen', 'Gelesenes Ergebnis', 'Ergebnis kopieren']),
  'qr-camera': preview('qr', ['Kamera verwenden', 'Kamerabild ausrichten', 'Kamerascan beenden']),
  'qr-share-safely': preview('qr', ['Link eingeben', 'QR-Code kontrollieren', 'Ziel-Link prüfen']),
  'qr-result-safety': preview('qr', ['Gelesenes Ergebnis', 'Ergebnis kopieren', 'Wenn das Lesen nicht klappt']),
});

export function getHelpPreviewConfig(articleId) {
  return HELP_PREVIEW_CONFIGS[String(articleId || '')] || null;
}

export function readHelpPreviewRequest(locationLike = null) {
  try {
    const params = new URLSearchParams(String(locationLike?.search || ''));
    const articleId = String(params.get(HELP_PREVIEW_QUERY_PARAM) || '');
    const config = getHelpPreviewConfig(articleId);
    return config ? { articleId, config } : null;
  } catch {
    return null;
  }
}

export function getHelpPreviewFrameNonce(locationLike = null) {
  try {
    const params = new URLSearchParams(String(locationLike?.hash || '').replace(/^#/, ''));
    return String(params.get('moduleFrameNonce') || '');
  } catch {
    return '';
  }
}
