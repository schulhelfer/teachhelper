export function createNameLearningTutorialDefinition(context = {}) {
  const {
    TAB_NAME_LEARNING,
    createModuleTutorialStep,
    withSection,
    nameLearningFrameTarget,
    prepareNameLearningTutorialSurface,
    activateNameLearningTutorialDemo,
  } = context;
  const nameLearningFallback = (nodes) => nodes.tabNameLearning;
  const nameLearningStep = (title, copy, selector, surface, placement = 'right', options = {}) => (
    createModuleTutorialStep({
      tab: TAB_NAME_LEARNING,
      title,
      copy,
      target: nameLearningFrameTarget(selector, nameLearningFallback),
      placement,
      ...options,
      beforeRender: () => prepareNameLearningTutorialSurface(surface),
    })
  );
  const steps = [
    ...withSection('Voraussetzungen', [
      nameLearningStep(
        'Karten aus dem Notenmodul',
        'Jede Lernkarte entsteht aus einem Foto, das im Notenmodul bei einer Person hinterlegt ist. Ohne Foto gibt es keine Karte, und der Notenbereich muss entsperrt sein.',
        ['#courses', '#setup'],
        'setup'
      ),
      nameLearningStep(
        'Kurse auswählen',
        'Die Häkchen bestimmen, aus welchen Kursen abgefragt wird. So übst du gezielt die Lerngruppe, die als Nächstes dran ist.',
        '#courses',
        'setup'
      ),
    ]),
    ...withSection('Lernmodus', [
      nameLearningStep(
        'Fällige Karten abfragen',
        'Die Zahl zeigt, wie viele Karten heute zur Wiederholung anstehen. Dieser Modus merkt sich, was du kannst, und plant die nächste Abfrage.',
        '#start-due',
        'setup'
      ),
      nameLearningStep(
        'Zufällig üben',
        'Zufälliges Üben geht alle Karten der gewählten Kurse durch – ohne den Lernstand zu verändern. Gut zum kurzen Auffrischen vor der Stunde.',
        '#start-random',
        'setup'
      ),
    ]),
    ...withSection('Abfragen', [
      nameLearningStep(
        'Foto ansehen',
        'Zuerst siehst du nur das Foto. Überlege dir den Namen, bevor du die Karte umdrehst.',
        ['#portrait', '#flip-card'],
        'practice',
        'left'
      ),
      nameLearningStep(
        'Namen aufdecken',
        'Ein Klick irgendwo auf die Karte dreht sie um – nicht nur das Foto selbst ist anklickbar.',
        '#flashcard',
        'practice',
        'left'
      ),
      nameLearningStep(
        'Name und Kurs',
        'Auf der Rückseite stehen der Name und der Kurs, aus dem die Person stammt.',
        ['#answer', '#flashcard-back'],
        'revealed',
        'left'
      ),
      nameLearningStep(
        'Gewusst oder nicht',
        'Deine ehrliche Einschätzung steuert den Wiederholungsabstand: „Gewusst“ verlängert ihn, „Nicht gewusst“ setzt die Karte auf sofort zurück.',
        ['#known', '#unknown'],
        'revealed',
        'left'
      ),
    ]),
    ...withSection('Wiederholung', [
      nameLearningStep(
        'Nächste Abfrage',
        'Nach der Antwort erscheint kurz der nächste Wiederholungstermin. Ein Klick auf die Karte springt sofort weiter, statt zu warten.',
        ['#review-feedback', '#flashcard'],
        'feedback',
        'left'
      ),
      nameLearningStep(
        'Keine Karten fällig',
        'Sind alle Karten wiederholt, meldet sich dieser Hinweis. Das ist der normale Abschluss einer Lernrunde.',
        '#empty',
        'empty',
        'left'
      ),
      nameLearningStep(
        'Trotzdem weiterüben',
        'Über diesen Knopf übst du zufällig weiter, ohne den geplanten Wiederholungsrhythmus zu stören.',
        '#empty-random',
        'empty',
        'left'
      ),
    ]),
  ];
  return {
    steps,
    demo: {
      activate: activateNameLearningTutorialDemo,
      auto: true,
    },
  };
}
