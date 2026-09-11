export function createDuplicateCheckTutorialDefinition(context = {}) {
  const {
    TAB_DUPLICATE_CHECK,
    createModuleTutorialStep,
    withSection,
    duplicateCheckFrameTarget,
    activateDuplicateCheckTutorialDemo,
  } = context;
  const duplicateFallback = (nodes) => nodes.tabDuplicateCheck;
  const steps = [
    ...withSection('Regeln wählen', [
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Prüfkriterien auswählen',
        copy: 'Jede aktive Regel wird unabhängig geprüft. Ein einziger Treffer genügt, damit zwei Dateien in einer Gruppe landen.',
        target: duplicateCheckFrameTarget('.rule-toggle-list', duplicateFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Gleicher Dateiname',
        copy: 'Findet Dateien mit gleichem Namen. Endung und Großschreibung werden dabei ignoriert.',
        target: duplicateCheckFrameTarget('[data-duplicate-rule="name"]', duplicateFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Gleiche Dateigröße',
        copy: 'Exakt gleiche Byte-Größe ist ein starker Hinweis auf eine Kopie – aber kein Beweis, etwa bei sehr kleinen Dateien.',
        target: duplicateCheckFrameTarget('[data-duplicate-rule="size"]', duplicateFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Ähnlicher Bildinhalt',
        copy: 'Vergleicht Bilder inhaltlich und erkennt auch zugeschnittene oder neu gespeicherte Fotos. Das Ergebnis ist eine Einschätzung, die du selbst prüfen musst.',
        target: duplicateCheckFrameTarget('[data-duplicate-rule="visual"]', duplicateFallback),
        placement: 'right',
      }),
    ]),
    ...withSection('Abgaben prüfen', [
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Abgaben als ZIP prüfen',
        copy: 'Ziehe die aus IServ heruntergeladene ZIP hierher oder klicke zur Auswahl. Sie wird nur im Browser gelesen und nicht hochgeladen.',
        target: duplicateCheckFrameTarget('#zipDropZone', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Geprüfte Datei',
        copy: 'Hier steht, welche ZIP gerade ausgewertet wird und wie viele Dateien sie enthält.',
        target: duplicateCheckFrameTarget(['#fileSummary:not(.hidden)', '#zipDropZone'], duplicateFallback),
        placement: 'top',
        skipIfMissing: true,
      }),
    ]),
    ...withSection('Ergebnis lesen', [
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Zusammenfassung',
        copy: 'Die Zusammenfassung zeigt, wie viele Dateien geprüft wurden und wie viele Treffergruppen jede Regel gefunden hat.',
        target: duplicateCheckFrameTarget('#resultPanel .summary-grid', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Duplikatgruppen',
        copy: 'Jede Gruppe bündelt Dateien, die sich nach mindestens einer Regel gleichen. Eine Datei kann in mehreren Gruppen auftauchen.',
        target: duplicateCheckFrameTarget('#resultPanel .duplicate-group', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Treffergründe',
        copy: 'Die farbigen Marken nennen den Grund: Name, Größe oder Bildähnlichkeit. So siehst du sofort, wie belastbar ein Treffer ist.',
        target: duplicateCheckFrameTarget('#resultPanel .badge-row', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Einzelne Dateien öffnen',
        copy: 'Klicke einen Dateipfad an, um die Abgabe direkt aus der ZIP anzusehen und den Treffer selbst zu beurteilen.',
        target: duplicateCheckFrameTarget('#resultPanel .file-link', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Bilder vergleichen',
        copy: '„Vergleichen“ zeigt alle passenden Bilder einer Gruppe auf einen Blick. Erst diese Sichtprüfung entscheidet, ob wirklich abgeschrieben wurde.',
        target: duplicateCheckFrameTarget('#resultPanel .compare-button', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Ergebnis neu auswerten',
        copy: 'Du kannst Regeln auch nach der Analyse ändern. Die bereits gelesenen Dateien werden dann sofort neu bewertet, ohne die ZIP erneut zu laden.',
        target: duplicateCheckFrameTarget('.rule-toggle-list', duplicateFallback),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Neue ZIP-Datei prüfen',
        copy: 'Eine neue ZIP ersetzt die bisherige Analyse vollständig. Notiere dir Treffer vorher, wenn du sie noch brauchst.',
        target: duplicateCheckFrameTarget('#zipDropZone', duplicateFallback),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_DUPLICATE_CHECK,
        title: 'Originale bleiben unverändert',
        copy: 'Dateilinks öffnen nur Kopien aus der ZIP; deine Abgaben werden nicht verändert.',
        target: duplicateCheckFrameTarget(['#resultPanel .file-link', '#resultPanel .summary-grid'], duplicateFallback),
        placement: 'top',
      }),
    ]),
  ];
  
  return {
    steps,
    demo: {
      activate: activateDuplicateCheckTutorialDemo,
      auto: true,
    },
  };
}
