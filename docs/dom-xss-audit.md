# DOM-XSS-Audit

Stand: 2026-09-08. Untersucht wurden die eigenen JavaScript-/ES-Modul- und HTML-Dateien einschließlich Root/Shell, Module, Shared-Code, Service Worker, Bookmarklets und Exportpfade. Vendor-Dateien wurden gesondert gelesen und nicht verändert.

## Ergebnis und Datenfluss

42 dynamische `innerHTML`-Zuweisungen wurden durch DOM-Erzeugung ersetzt (36 Noten, 5 Planung, 1 Gruppenansicht). Ein zusätzlicher Sink liest ausschließlich das feste Schloss-Icon; insgesamt sinkt die Anzahl der `innerHTML`-Zuweisungen in diesen drei Dateien von 111 auf 70. Die Änderung ist eine Härtung der Rendering-Grenze: Bereits vorhandenes Escaping und numerische Normalisierung waren an vielen Stellen wirksam. Es wird keine zuvor nachgewiesene Ausnutzbarkeit behauptet.

| Datenquelle / Bereich | Bisheriger Schutz und Parser-Grenze | Entscheidung |
| --- | --- | --- |
| Kurs-, Schüler-, Kategorie- und Leistungstitel aus Workspace/Dateiimport | Freitext überwiegend `escapeHtml`; zahlreiche IDs werden im Store numerisch normalisiert; Tabellenköpfe/-zellen bauten dennoch HTML und Attribute zusammen | Node-/Fragment-Builder, `textContent`, `.value`, feste Attributnamen und `dataset`; keine Typannahmen allein anhand von Variablennamen |
| Noteneingabe, Aufgaben-IDs, BE, Entwürfe, Originalwerte, Tooltips, eigene Prozentgrenzen | Gemischte HTML-Builder mit Escaping, normalisierten Zahlen und zusammengesetzten Attributfragmenten | Alle dynamischen Ausgaben über DOM; Checkbox-Builder erhält eine interne Konfigurationsfunktion statt Attribut-Markup; Optionen behalten Auswahl und Reset-Baseline |
| Auto-Lock-Warnung, Leerzustände, Auswertungen und Kalenderüberschriften | Escaping bzw. intern erzeugte Zahlen/Labels | Dynamische DOM-Erzeugung; vorhandene Formate, Klassen und Aktionsselektoren bleiben erhalten |
| Planungs-Slots, Unterrichtszeiten, Datums-/Kursüberschriften | Escaping für Zeiten; numerisch normalisierte IDs/Datumswerte und feste Beschriftungen | Dynamische Texte und Attribute über DOM, einschließlich fehlerhafter Werte in direkten Renderer-Aufrufen |
| Gruppen-IDs und Gruppenthemen | Gruppen-IDs werden gegen Rastergrenzen geprüft; Thema bereits `.value` | Gruppen-Grundgerüst über DOM, IDs über `dataset`/`name`; Listener und Themenbearbeitung unverändert |
| Schülernamen in Sitzplan/Namenlernen und bestehende Notizansichten | `textContent`, Textknoten, `.value`, normalisiertes Rich-Text-Modell | Beibehalten; keine neue HTML-Interpretation |
| PDF-/ZIP-/Bild-Dateinamen, Pfade und Fehlermeldungen in Merger, Duplikatprüfung, QR, Workspace | DOM-Text/Attribute sowie Shared-Message-API; Dateiinhalt wird nicht als Beschriftungs-Markup eingesetzt | Beibehalten; Browser-Regression für echte Dateinamen und Shared-Fehlermeldungen |
| Kommentare, Kompetenzen und sonstige Notentexte | Bereits umgestellte DOM-Renderer bzw. Text-/Dokumentmodell für Export | Beibehalten und Import-/Renderer-Regressionen ergänzen |

Die dynamischen Noten-Builder geben nun Nodes oder Fragmente zurück. Auch Aufrufer in Druck-/Tooltip-Pfaden verwenden `replaceChildren`/`append`. Leere Ergebnisse bleiben leere Textausgaben. `escapeHtml` bleibt vorhanden; es wird nicht vor `textContent`/`.value` angewandt, weil dies sichtbare doppelte Escapes erzeugen würde. CSP, URL-Prüfungen, Linkschutz und Importnormalisierung bleiben bestehen. Keine Speicherformat- oder öffentliche API-Änderung.

## Eng begrenzte verbleibende Parser und verwandte Pfade

- **Zwischenablage:** `planningRichTextFromClipboard` parst in einem nicht angehängten `<template>`. Nur das normalisierte Notizmodell verlässt diesen Bereich; sichtbares HTML wird neu mit DOM-APIs aufgebaut. Keine Originalknoten, Eventattribute oder beliebigen Linkprotokolle werden übernommen. Diese Ausnahme wurde ausdrücklich vereinbart.
- **Notiz-Tabelle:** `execCommand("insertHTML")` erhält nur feste Tabellen-Tags; Wiederholungszahlen werden auf 1–8 begrenzt. Der Befehl bleibt zur Erhaltung des nativen Undo-Verhaltens bestehen. Der Befehlsverteiler akzeptiert nur die sieben vorhandenen Toolbar-Kommandos; der variable `execCommand`-Pfad erreicht ausschließlich Fett/Kursiv/Unterstrichen. `styleWithCSS` und `fontSize` verwenden feste bzw. aus einer festen Tabelle gewählte Werte.
- **DOCX:** `DOMParser.parseFromString(xml, "application/xml")` und `XMLSerializer` verarbeiten XML-Dokumentteile; daraus werden Dokumentdaten/ZIP-Dateien, keine direkt eingefügten HTML-Knoten. Vorlagen- und LaTeX-Inhalte bleiben im Datei-/Dokumentmodell.
- **Druck/Archiv:** Notentabellen und Planung werden als DOM bzw. PDF-Daten aufgebaut; kein benutzerabhängiges `document.write`, `srcdoc` oder HTML-Blob-Export gefunden. PDF-Ausgabe, CSV, JSON, DOCX und ZIP bleiben bei ihren bisherigen Dateiformaten.
- **Duplikat-Vorschau:** Auch HTML/SVG-Dateiendungen können MIME-Typen liefern; die Vorschau verwendet `<img>` mit Blob-URL, der Download einen gesonderten `application/octet-stream`-Blob. Kein Einfügen der Dateibytes als HTML-DOM.
- **Namenlernen:** SVG-Tutorialporträts werden ausschließlich aus festen Beispielinitialen und Farben erzeugt und als Bild verwendet. Benutzerporträts bleiben im vorhandenen Bildpfad.
- **Bookmarklets:** Feste Codevorlagen und feste Adapter; Namen/Noten werden als Klartext gelesen und über Eingabe-/Text-Eigenschaften verarbeitet. Keine HTML-Auswertung des übertragenen Textes gefunden.
- **Vendor:** PDF.js verwendet eigene XML-Parser für Metadaten/XFA im Worker. Die `innerHTML`/`outerHTML`-Treffer in `@cantoo/pdf-lib` betreffen dessen internes Parser-/Serialisierungsmodell für SVG, keinen direkt angehängten Browser-DOM. Kein Vendor-Patch. Integrität/CSP bleiben Gegenstand des bestehenden Audits.

## Vollständiges Inventar verbleibender First-Party-Parser-Aufrufe

Leere `innerHTML`-Zuweisungen dienen ausschließlich dem Leeren bestehender Container und werden unten pro Datei zusammengefasst. Alle anderen direkten Parser-Aufrufe sind einzeln aufgeführt. Die Zeilen beziehen sich auf diesen Änderungsstand. Nicht genutzte Sink-Formen (`outerHTML`, `srcdoc`, `document.write`/`writeln`, `createContextualFragment`, `setHTML`/`setHTMLUnsafe`) sind durch den Regressionstest gegen neue ungeprüfte Verwendungen abgesichert.

| Datei | Leere HTML-Zuweisungen |
| --- | ---: |
| `src/main.js` | 6 |
| `src/modules/grades/app.js` | 21 |
| `src/modules/planning/app.js` | 21 |
| `src/modules/seatplan/app.js` | 6 |

| Fundstelle | API | Begründung |
| --- | --- | --- |
| `src/app/shell.js:1210` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/app/shell.js:1276` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/main.js:4399` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/main.js:4484` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/main.js:6370` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:4618` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/grades/app.js:11500` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/grades/app.js:13785` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/grades/app.js:18836` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:22933` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:23783` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:23845` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:24396` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:24479` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:24536` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:25651` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:25736` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:25819` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:26472` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/grades/app.js:26830` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/merger/app.js:2188` | `innerHTML` | Feste SVG-Pfade, Auswahl 90/180/270 Grad |
| `src/modules/planning/app.js:4398` | `execCommand` | Begrenzter Toolbar-Befehl / feste Tabellen-Tags |
| `src/modules/planning/app.js:4399` | `execCommand` | Begrenzter Toolbar-Befehl / feste Tabellen-Tags |
| `src/modules/planning/app.js:4411` | `execCommand` | Begrenzter Toolbar-Befehl / feste Tabellen-Tags |
| `src/modules/planning/app.js:4418` | `execCommand` | Begrenzter Toolbar-Befehl / feste Tabellen-Tags |
| `src/modules/planning/app.js:9761` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/planning/app.js:10313` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/planning/app.js:10354` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/planning/app.js:11373` | `innerHTML` | Auswahl ausschließlich fester Icons |
| `src/modules/seatplan/app.js:7521` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/seatplan/app.js:7610` | `innerHTML` | Statisches Literal ohne Interpolation |
| `src/modules/workspace/components.js:93` | `insertAdjacentHTML` | Feste Dialog-/Panel-Konstante |
| `src/modules/workspace/components.js:96` | `insertAdjacentHTML` | Feste Dialog-/Panel-Konstante |
| `src/shared/docx-template.js:375` | `parseFromString` | XML-Dokumentteil, kein HTML-Rendering |
| `src/shared/planning-rich-text.js:397` | `innerHTML` | Inerte Zwischenablage → normalisiertes Modell |

## Verifikation

- Browser-Payloads: `<img src=x onerror=alert(1)>`, `<script>alert(1)</script>`, Attributausbruch mit Anführungszeichen, SVG/Eventhandler und Klartext mit `&`, `<`, `>` und beiden Quote-Zeichen. Geprüft werden DOM-Struktur und Attributwerte, nicht nur ausbleibende Alerts.
- Tatsächliche Public-/Vault-Importnormalisierung; direkte Renderer zusätzlich mit manipulierten IDs; Noten-/Vorkommnis-/BE-Eingaben, Optionen, Platzhalter, Reset-Baselines, eigene Skalennamen, Dateinamen, Fehlermeldungen und Gruppenlistener.
- Rich-Text-Paste im Browser ohne CSP: aktive Elemente/Attribute fehlen; zulässige Links, Formatierungen, Listen und Tabellen bleiben erhalten.
- Vollständiger Editor: alle drei Modi und Abbrechen-Aktion. Zusätzlich einmaliger DOM-Vergleich gegen den Git-Ausgangsstand für alle drei Eingabemodi und die Notenübersicht: keine Unterschiede in Elementstruktur, Attributen oder Formularzuständen (reine Einrückungs-Textknoten ausgenommen).
- Der Sink-Regressionstest akzeptiert keine pauschalen `format*`-/`normalize*`-/Builder-/ID-Namensausnahmen mehr. Verbliebene nichtliterale Quellen sind konkret pro Datei dokumentiert. Der Scanner ist eine Regressionserkennung und kein vollständiger JavaScript-Datenflussbeweis.
- Ausgeführt und bestanden: `node --test tests/*.test.mjs` (896 Tests, keine Fehler/Skips), `python3 scripts/audit.py`, beide `tests/*.test.py` (20 + 4 Tests), ES-Modul-Syntaxchecks für die geänderten JavaScript-Dateien und `git diff --check`. Browser-Tests benötigen Chrome, Chromium oder Microsoft Edge aus PATH, einer üblichen Systeminstallation oder `CHROME_BIN` und einen lokalen Testport.
- `python3 scripts/check-vendor-updates.py` wurde ebenfalls ausgeführt und meldet weiterhin den bereits vor der Änderung vorhandenen Rückstand bei `@cantoo/pdf-lib`: 2.9.1 gegenüber 2.9.2 (Exitcode 1). Die übrigen Pakete sind aktuell oder neuer als der Registry-`latest`-Tag. Ein Bibliotheksupdate wird nicht mit dieser DOM-Änderung vermischt.
