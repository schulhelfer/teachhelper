# Verantwortungsgrenzen des Groups-Moduls

## Groups-Verantwortung

`app.js` besitzt den gruppenspezifischen Zustand und das Verhalten für Raster, aktive Gruppen, Reihenfolge, Belegung, Sperren, Themen, Min-/Max-Größe und Drag-Zustände. Dort liegen außerdem Rendering, Maus- und Touch-Drag-and-drop, Verschieben und Tauschen, Präferenzen, Leistungsklassen, Vorschlagsalgorithmus, Animation, Druckskalierung und das gruppenspezifische Layout einschließlich `ResizeObserver`.

Der Controller liest die Lernenden ausschließlich über `getStudents`. Dadurch arbeitet Groups mit denselben Schülerobjekten wie `SharedRosterStore` und Random Picker, ohne eine zweite Schülerliste zu führen. Die Anzahl der Leistungsklassen wird ebenfalls über Getter und Setter des gemeinsamen Zustands angebunden.

## Shared State in `main.js`

Die gemeinsame Schülerliste, CSV-Metadaten, CSV- und Notenkurs-Import sowie `SharedRosterStore` bleiben in `main.js`, weil Random Picker, Groups und weitere Module dieselben Daten verwenden. Der gemeinsame Preferences-Dialog bleibt dort geroutet, weil er abhängig vom aktiven Tab entweder Groups- oder Picker-Inhalte anzeigt.

Plan-Import und -Export bleiben in `main.js` orchestriert. Das Dateiformat enthält neben dem vom Groups-Controller serialisierten Gruppen-State auch gemeinsame Schülerdaten sowie Random-Picker- und Work-Phase-Felder. Dateiauswahl, Dateihandles, Downloads und die Reihenfolge dieser modulübergreifenden Zustandsübernahme gehören deshalb weiterhin zur gemeinsamen Ebene.

## Shell-Verantwortung in `main.js`

Tutorial-Orchestrierung, Navigation, globale Drop-Ziele, Viewport- und Tab-Wechsel, Fullscreen, Escape, Theme und Context-Menu-Steuerung verbleiben in der Shell. Die Shell stößt bei globalen Layoutänderungen nur `groupsController.refreshLayout` an. Groups verwaltet ausschließlich seinen eigenen Beobachter und seine eigenen Drop-Flächen.

Die verbliebenen Groups-Bezüge in `main.js` sind damit Adapteraufrufe für Mounting, Roster-Wechsel, Tutorial-Snapshots, Preferences-Routing, Plan-Komposition und globale Layoutsignale. Sie enthalten keine eigene Raster-, Rendering-, Drag-, Vorschlags- oder Gruppenverwaltungslogik.
