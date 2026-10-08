# EWH: Prüfung mit Word und Drucker

Die automatisierten Tests prüfen Browserintegration, ZIP-Inhalte, Befehle und Fehlerbehandlung. Sie ersetzen keinen Drucktest mit Word und dem jeweiligen Druckertreiber.

Zusätzlich wurden unter Windows der echte JScript-Interpreter, die CMD-Erzeugung des Launchers und die Druckdialogfelder von Word 16.0 ohne Druckaufträge geprüft. Ein vollständiger Durchlauf mit simuliertem Word hat die Paketsuche im tatsächlichen Download-Ordner, die native ZIP-Extraktion und die bisherige Bereinigung einschließlich Sonderzeichen geprüft. Die geänderte Bereinigung mit erhaltenem Extraktionsordner wird durch automatisierte Verhaltenstests geprüft. Ein macOS-System stand für die Umsetzung nicht zur Verfügung.

## Vor der Freigabe auf beiden Plattformen

1. Einen Testkurs mit mindestens drei erkennbar unterschiedlichen EWHs verwenden; mindestens ein Dokument soll mehrere Seiten enthalten. Namen mit Umlauten, Apostrophen, `&`, `%` und `!` aufnehmen.
2. Einen regulären Drucker als Standarddrucker einrichten. EWHs generieren, vollständigen ZIP-Download abwarten, Druckbefehl kopieren und in CMD beziehungsweise Terminal ausführen.
3. Im ersten Word-Dialog zwei Kopien auswählen. Automatischen Duplexdruck, Farbe und Papierfach prüfen, soweit der Drucker diese unterstützt. Für jedes Dokument die tatsächliche Übernahme protokollieren.
4. Prüfen, dass nur ein Druckdialog erscheint, alle Dokumente in Exportreihenfolge gedruckt werden und jedes EWH vollständig bleibt. Bereits geöffnete eigene Word-Dokumente müssen geöffnet und unverändert bleiben.
5. Nach vollständiger Übergabe müssen das ausgewählte ZIP sowie `TeachHelper-Drucken.js`, `TeachHelper-Drucken.applescript` und `TeachHelper-Dateiliste.txt` verschwunden sein. Der neu erzeugte Extraktionsordner mit allen DOCX-Dateien muss erhalten bleiben. Unter Windows muss die temporäre Archivkopie `TeachHelper-Archiv.zip` zusätzlich entfernt sein. Die Erfolgsmeldung muss den erhaltenen Ordnerpfad nennen. Andere ZIPs und vorhandene Dateien müssen erhalten bleiben.
6. Die Windows-CMD-Sitzung soll nach Erfolg enden. Auf macOS hängt das Schließen des Fensters von „Wenn Shell beendet wird“ im Terminalprofil ab.

## Ordnername und wiederholte Exporte

- Der Ordner liegt direkt im Download-Ordner und heißt `KA-Kursname-Jahrgangsstufe-Halbjahr-Nummer`, beispielsweise `KA-Mathematik-11-1-2`. Die Angaben müssen aus dem ausgewählten Kurs und den aktuellen BE-Werten übernommen werden, einschließlich noch nicht gespeicherter Änderungen.
- Beide Halbjahre prüfen: `h1` wird `1`, `h2` wird `2`. Fehlende Jahrgangsstufe oder Nummer müssen als `unbekannt` erscheinen; der Export bleibt möglich. Fehlende Kursnamen erhalten den Ersatzwert `Kurs`.
- Bereits einen Ordner mit dem erwarteten Namen sowie eine Datei mit dem Namen und dem Zusatz ` (2)` anlegen. Ein neuer Drucklauf muss den Ordner mit ` (3)` verwenden, vorhandene Inhalte unverändert lassen und den tatsächlichen Pfad in der Erfolgsmeldung nennen.
- Kursnamen mit Umlauten, Leerzeichen, Apostrophen, `%`, `!`, `&` und Emoji verwenden. Zeichen wie `/`, `\\`, `:`, `?` und `*` müssen in Ordnernamen ersetzt werden. Sehr lange Kursnamen werden soweit gekürzt, dass der Ordnername plattformübergreifend einschließlich Nummernzusatz verwendbar bleibt; Jahrgangsstufe, Halbjahr und Nummer bleiben erhalten.

## Word automatisch beenden

- Word vor dem Start vollständig beenden und den Stapel erfolgreich drucken: nach Übergabe aller Aufträge müssen die eigenen Druckdokumente geschlossen sein und die für den Druck gestartete Word-Anwendung beendet werden. Unter macOS muss der Ablauf bis zum tatsächlichen Beenden warten.
- Word vorher mit einem eigenen, gegebenenfalls ungespeicherten Dokument öffnen: unter Windows darf nur die separate Druckinstanz beendet werden. Unter macOS muss das zuvor laufende Word geöffnet bleiben. Das eigene Dokument darf weder geschlossen noch gespeichert oder verändert werden.
- Word vor dem Start beenden und während des Stapeldrucks unter macOS ein weiteres Dokument öffnen: nach Abschluss müssen die EWH-Dokumente geschlossen sein, das zusätzliche Dokument und Word aber geöffnet bleiben.
- Den ersten Druckdialog abbrechen und einen Fehler beim zweiten Dokument auslösen, jeweils mit vorher beendetem und mit zuvor geöffnetem Word: die eigenen Druckdokumente werden geschlossen; selbst gestartetes Word wird nur ohne weitere offene Dokumente beendet. Bereits geöffnete Benutzerdokumente bleiben erhalten. ZIP und entpackter Ordner bleiben bestehen.
- Unter macOS das Beenden verweigern oder eine Zeitüberschreitung beim Beenden auslösen: die Fehlermeldung bleibt im Terminal sichtbar, das ZIP und der entpackte Ordner bleiben erhalten. Der Ablauf darf keinen weiteren Druckversuch und nach einem fehlgeschlagenen Beenden keinen zweiten Beendigungsversuch starten.

## Abbruch und Fehler

- Den ersten Druckdialog abbrechen: kein Druck, keine Bereinigung, sichtbare Meldung.
- Ein unvollständig heruntergeladenes ZIP verwenden und zwei Kopien desselben Export-ZIPs im Download-Ordner bereitstellen: Abbruch vor dem Druck, keine Bereinigung.
- Einen beschädigten DOCX-Eintrag bei unveränderten Hilfsdateien verwenden: sichtbarer Fehler mit Dokumentname und bisherigem Fortschritt; ZIP und entpackte Dateien müssen erhalten bleiben. Bereits übergebene Aufträge werden nicht zurückgenommen.
- Einen Bereinigungsfehler nach erfolgreichem Druck auslösen: der Extraktionsordner und alle DOCX-Dateien bleiben erhalten. Scheitert das Löschen eines Druckskripts, der Dateiliste oder unter Windows der temporären Archivkopie, muss das heruntergeladene ZIP als vollständige Wiederherstellungsquelle erhalten bleiben. Die Hilfsdateien, die vor dem Fehler erfolgreich gelöscht wurden, können bereits entfernt sein. Bei einem Fehler beim Löschen der Dateiliste muss diese erhalten bleiben; das heruntergeladene ZIP darf dann nicht gelöscht werden. Bei einem Fehler beim Löschen des heruntergeladenen ZIPs muss dieses erhalten bleiben; Druckskripte, Dateiliste und temporäre Archivkopie können bereits entfernt sein.
- Wird der optionale Word-Druckdialog nicht unterstützt, den angebotenen Stapeldruck mit Standardwerten einmal bestätigen und einmal ablehnen. Nach bereits begonnenem Druck darf kein automatischer Ersatzlauf beginnen.
- Verweigerte Windows-Skriptausführung oder macOS-Automatisierungsrechte dürfen keine Bereinigung auslösen. Sicherheitsbeschränkungen werden respektiert.
- Auf macOS gegebenenfalls den Zugriff auf den Download-Ordner und die Steuerung von Word erlauben. Safari muss das ZIP für diesen Ablauf im Download-Ordner belassen; bei automatischem Entpacken „Sichere Dateien nach dem Laden öffnen“ deaktivieren.

Erfolg bedeutet die Übergabe sämtlicher Aufträge durch Word, einschließlich des Endes seiner Hintergrunddruckaufträge. Papierstau, fehlendes Papier und spätere Druckerfehler können nach dieser Übergabe auftreten und werden nicht zuverlässig erkannt.

## Protokoll

| Plattform | Word-Version | Drucker/Treiber | Kopien | Duplex | Farbe | Papierfach | Fehlerfälle | Ergebnis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Windows | | | | | | | | offen |
| macOS | | | | | | | | offen |
