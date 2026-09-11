export function createRandomPickerTutorialDefinition(context = {}) {
  const {
    TAB_RANDOM_PICKER,
    createModuleTutorialStep,
    withSection,
    activateClassroomTutorialDemo,
  } = context;
  const pickerFallback = () => null;
  const steps = [
    ...withSection('Vorbereiten', [
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Gemeinsame Namensliste',
        copy: 'Gruppen-Modul und Picker nutzen dieselbe Namensliste. Eine CSV importierst du über die Dropzone im Gruppen-Modul.',
        target: (nodes) => nodes.csvDropZone || nodes.randomPickerImport,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Auswahlbedingungen öffnen',
        copy: 'Hier stellst du pro Person „normal“, „sicher“ oder „unmöglich“ ein. „Speichern“ übernimmt die Bedingungen für die nächste Ziehung.',
        target: (nodes) => nodes.groupSeatPreferences,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Nach der Ziehung deaktivieren',
        copy: 'In denselben Bedingungen legst du fest, dass gezogene Personen automatisch auf „unmöglich“ wechseln. So kommt in einer Runde jede Person nur einmal dran.',
        target: (nodes) => (
          visibleTutorialNode(nodes.preferencesRandomPickerAutoDisable)
          || visibleTutorialNode(nodes.randomPickerAutoDisableSelected)
          || nodes.groupSeatPreferences
        ),
        placement: 'right',
      }),
    ]),
    ...withSection('Ziehen', [
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Picker-Rad',
        copy: 'Das Rad zeigt die Namen der Liste. Personen auf „unmöglich“ tauchen dort nicht auf und können nicht gewinnen.',
        target: (nodes) => nodes.randomPickerWheel || pickerFallback(nodes),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Auswahl starten',
        copy: 'Mit „Start“ beginnt eine gewichtete Zufallsauswahl. Während das Rad läuft, ist der Button vorübergehend gesperrt.',
        target: (nodes) => nodes.randomPickerStart || nodes.randomPickerStartRow || pickerFallback(nodes),
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Ergebnis erkennen',
        copy: 'Das Rad bremst langsam ab. Die Person in der mittleren, hervorgehobenen Karte ist das Ergebnis der Ziehung.',
        target: (nodes) => nodes.randomPickerCards?.[3] || nodes.randomPickerWheel || pickerFallback(nodes),
        placement: 'top',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Erneut auswählen',
        copy: 'Jede Ziehung ist unabhängig von der vorigen. Ohne die automatische Deaktivierung bleibt jede Person im Topf und kann erneut drankommen.',
        target: (nodes) => nodes.randomPickerStart || nodes.randomPickerStartRow || pickerFallback(nodes),
        placement: 'right',
      }),
    ]),
    ...withSection('Sichern', [
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Pickerstand speichern',
        copy: 'Speichere Liste und Gewichtungen als Datei. So bleibt erhalten, wer in dieser Runde schon dran war.',
        target: (nodes) => nodes.randomPickerExport || nodes.randomPickerPlanActions,
        placement: 'right',
      }),
      createModuleTutorialStep({
        tab: TAB_RANDOM_PICKER,
        title: 'Pickerstand laden',
        copy: 'Über „Picker laden“ lädst du einen gespeicherten Pickerstand wieder ein und setzt die Runde genau dort fort.',
        target: (nodes) => nodes.randomPickerImport || nodes.randomPickerPlanActions,
        placement: 'right',
      }),
    ]),
  ];
  return {
    steps,
    demo: {
      activate: () => activateClassroomTutorialDemo(TAB_RANDOM_PICKER),
      auto: true,
    },
  };
}
