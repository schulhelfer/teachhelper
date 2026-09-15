# TeachHelper: Orientierung für Coding-Agenten

## Einstieg und Verzeichnisse

- Statische Browser-PWA mit JavaScript, HTML und CSS; kein `package.json`, Framework-Build oder Bundler konfiguriert.
- Start: `index.html` → `src/app/bootstrap.js` → `src/main.js` → `createAppRuntime(...).start()` in `src/app/app-runtime.js`.
- Bootstrap installiert zuerst den Workspace-Controller; Modulfenster und Hilfevorschau erhalten einen ephemeren Workspace.
- Auf localhost entfernt Bootstrap Service Worker und Caches; `sw.js` verwaltet sonst App-Shell- und Laufzeit-Caches.
- `src/app/`: Shell-DOM, Navigation, Modul-Mounting, Importe/Exporte, Tutorials, PWA und modulübergreifende Koordination.
- `src/app/dom.js` bündelt Shell-DOM-Referenzen; `src/app/shell.js` verbindet die Controller unter `src/app/shell/`.
- `src/modules/workspace/` ist der zentrale Daten- und Persistenzbereich; ein separates `src/workspace/` existiert nicht.
- `src/modules/`: Fachfunktionen; `index.js` stellt Mount-Funktionen/Exporte bereit, `app.js` enthält die Umsetzung.
- `groups`, `random-picker`, `work-phase` werden direkt im Shell-DOM gemountet.
- `planning`, `grades`, `seatplan`, `name-learning`, `merger`, `duplicate-check`, `qr` haben eigene `app.html`/`app.css` und laufen in Iframes.
- `src/shared/`: gemeinsame Browser-/UI-Helfer, Datei-/CSV-/PDF-/OCR-/DOCX-Verarbeitung, Stores und Datennormalisierung.
- `src/shared/school-data/`: öffentliche Datenformen, Notenlogik, Defaults, Integritätsregeln, Workspace-Nachrichten und THDB-Format.
- Fremdbibliotheken liegen in `src/vendor/` und `src/modules/qr/vendor/`; Inventar/Prüfsummen: `vendor-manifest.json`.

## Zustände und Datenflüsse

- `workspace/index.js` installiert `window.__teachhelperWorkspaceController` und erzeugt einen `WorkspaceStore` plus `WorkspaceRuntime`.
- `workspace/store.js`: `state` hält Schuljahre, Kurse, Stundenraster, Unterricht, freie Zeiten und Einstellungen.
- `WorkspaceStore.gradeVaultState` hält die aktuell geladenen Notendaten einschließlich Lernender, Bewertungen und kursgebundener Sitzpläne/Picker-Konfigurationen.
- `workspace/runtime.js` verwaltet weitere Kursstände in `courseCache`/`segmentTexts`, den geladenen Kurs, Dirty-Zustände, Vault-Schlüssel und Dateiverbindung.
- Store-Methoden `_save()`/`_saveGradeVault()` lösen Hooks aus; sie schreiben selbst keine Datei. `_load()` erzeugt Initialdaten.
- Runtime-Hooks verarbeiten Änderungen; der Controller veröffentlicht revisionierte Snapshots für Shell, Planung und Noten.
- Dauerhafte Schuldaten: THDB1-Container aus `shared/school-data/thdb.js`, aktuell mit vorgeschlagenem Dateinamen `TeachHelper-Datenbank-YY-YY.json`.
- Der Container trennt öffentliche Planung, Vault-Konfiguration und Kurssegmente; Notensegmente können verschlüsselt sein (`workspace/crypto.js`).
- Runtime übernimmt Laden/Speichern, manuelle Downloads, Dateisynchronisation und Backups; Datei-/Verzeichnishandles liegen in IndexedDB.
- Aktuelle Werkzeug-Lernerliste: `app/classroom-state.js` hält Lernende und CSV-Metadaten; `shared/roster-store.js` synchronisiert über `shared/student-sync-bus.js`.
- Gruppen und Zufallsauswahl erhalten diese Liste per Callback; Sitzplan-/Notenimporte werden über `app/planning-seatplan-bridge.js` vermittelt.
- `app/grade-roster-coordinator.js` hält Kursimport-Auswahl und Picker-Kursbindung; `app/course-context.js` koordiniert den Kurskontext bei Tabwechseln.
- Gruppeneinteilung liegt lokal in `modules/groups/app.js`; Arbeitsauftrag/Timer nutzen die in der App erzeugte Instanz aus `shared/timer-store.js`.
- `app/plan-format.js` und `app/plan-persistence.js` speichern/laden Werkzeug-JSON für Lernerliste, Gruppen, Picker und Arbeitsphase, getrennt vom THDB1-Container.
- Aktiver Tab: `app/shell/tab-controller.js` (mit Spiegel in `shellState`); eingeklappte Shell: `chrome-controller.js`; Speicher-/Vault-Anzeige: `workspace-status.js`.
- Fachmodule behalten eigene Auswahl-, Dialog- und Bearbeitungszustände; diese sind nicht mit dem persistierten Workspace gleichzusetzen.

## Schnittstellen und Grenzen

- Shell → Module: `mountGroups`, `mountRandomPicker`, `mountWorkPhase` bzw. Iframe-Controller aus `modules/*/index.js`; deren jeweilige Rückgaben prüfen.
- `app/planning-seatplan-bridge.js` mountet Iframe-Module bei Bedarf und vermittelt u. a. Noten-, Sitzplan- und Namenlern-Anfragen; Noten werden auch verzögert vorab gemountet.
- `src/shell/tabs.js` definiert Tab-IDs und viele Ereignisnamen; `app/module-message-router.js` routet freigegebene Nachrichten anhand der Frame-Rolle.
- `shared/module-frame-bridge.js`: `createModuleFrame`, `postToModule`, `isTrustedModuleMessage`; prüft Quelle/Origin und bei opaken Frames zusätzlich Nonces.
- Sandbox/Permissions sind modulspezifisch. Planung und Noten verwenden regulär gleichursprüngliche Frames; PDF-Werkzeuge/QR konfigurieren eigene Sandboxes.
- `planning/bridge.js` und `grades/bridge.js` übersetzen zwischen `postMessage` und lokalen Ereignissen; bei Protokolländerungen beide Seiten prüfen.
- Öffentliche Workspace-API für Verbraucher: `workspace/client.js`; `createFeatureWorkspaceClient` verbindet gleichursprüngliche Frames und erzeugt für Tutorials/Standalone einen ephemeren Workspace. Die Shell verwendet `getWorkspaceClient`.
- Der Client bietet `data` für synchrone Fachabfragen/-änderungen, `operations` für Kurs-, Vault- und Dateiaktionen sowie Snapshots, Abonnements und revisionierte `execute`-Befehle. Datenabfragen liefern Kopien; `this.store` in Planung/Noten ist nur ein Alias auf `client.data`.
- `workspace/public-api.js` implementiert die expliziten, modulabhängigen Methodenlisten intern. Store, Runtime, Save-Hooks und Datei-Handles werden nicht an Verbraucher ausgegeben. API-Vertrag: `workspace/README.md`.
- `shared/school-data/messages.js` definiert Commands, Fehlercodes und Request-Normalisierung; Controller-Erzeugung und interne Store-/Owner-Zugänge bleiben in `workspace/index.js`.
- `execute` serialisiert Befehle und prüft `baseRevision`; registrierte Nachrichtenquellen haben fest zugeordnete Fähigkeiten.
- Planung und Noten importieren ausschließlich `workspace/client.js`; auch Archivkomponenten und lokale Vorlagenwerte werden über diesen Einstieg angeboten. Kursänderungen nutzen `operations.runGradeCourseMutation`; deren Callback arbeitet nur mit der öffentlichen Daten-API.
- `workspace/components.js` liefert gemeinsame Datenbank-/Archiv-Dialoge; `shared/school-data/grade-integrity.js` enthält gemeinsame Integritätsoperationen.

## Prüfen und Ausführen

Alle Befehle im Repository-Root ausführen; erforderlich sind Node.js und Python 3.

- Einzelne Regression: `node --test tests/workspace-owner-contract.test.mjs` (Datei passend zur Änderung wählen).
- Gesamte JS-Suite: `node --test tests/*.test.mjs`; enthält Verhaltenstests und viele Quelltext-/HTML-Vertragstests.
- Browser-Tests nutzen `tests/helpers/dom-browser.mjs`: Chrome/Chromium/Edge und Node mit globalem `WebSocket`; Browserpfad ggf. über `CHROME_BIN` setzen.
- Statischer/PWA-Audit: `python3 scripts/audit.py`; prüft u. a. CSP, Assets, Vendor-Prüfsummen, verbotene APIs und Modulverträge.
- Python-Regressionen: `sh -c 'for test_file in tests/*.test.py; do python3 "$test_file" || exit 1; done'`.
- Vendor-Prüfungen mit Netzwerkzugriff: `python3 scripts/check-vendor-security.py` und `python3 scripts/check-vendor-updates.py`.
- Gesamter Pre-Commit-Ablauf: `sh scripts/pre-commit-checks.sh`; Hook installieren: `sh scripts/install-hooks.sh`.
- Der Pre-Commit-Ablauf erhöht zuletzt per `node scripts/stamp-app-version.mjs` die Version und verändert/staged `src/shared/app-version.js` sowie `sw.js`.
- Kein separater Lint-/Build-Befehl konfiguriert; der Audit übernimmt statische Prüfungen, Browser laden die Quelldateien direkt.

## Große Dateien und bestehende Architektur-Schulden

- `modules/grades/app.js` (~33.000 Zeilen), `planning/app.js` (~11.500), `seatplan/app.js` (~10.800): umfangreiche Fachlogik, DOM, Dialoge und Interaktion in jeweils einer Datei.
- `modules/workspace/store.js` (~5.100) bündelt mehrere Domänen; `runtime.js` (~2.500) kombiniert Persistenz, Vault, Kurscache, Synchronisation und Backups.
- `app/app-runtime.js` (~2.400) bleibt großer Shell-Orchestrator; `app/planning-seatplan-bridge.js` (~860) vermittelt weit mehr als Planung/Sitzplan.
- Weitere große Einstiegspunkte: `modules/merger/app.js` (~4.500) und `modules/groups/app.js` (~2.700).
- Bei Änderungen gezielt passende `tests/*contract.test.mjs` mitlesen: viele sichern konkrete Dateistrukturen, Ereignisnamen oder Codeformen ab.
