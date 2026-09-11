export function createQrTutorialDefinition(context = {}) {
  const {
    TAB_QR,
    createModuleTutorialStep,
    withSection,
    qrFrameTarget,
    openQrToolForTutorial,
    activateQrTutorialDemo,
  } = context;
  const qrFallback = (nodes) => nodes.tabQr;
  const openGenerator = () => openQrToolForTutorial('generator');
  const openDecoder = () => openQrToolForTutorial('decoder');
  const openDecoderCamera = () => openQrToolForTutorial('decoder', 'camera');
  const steps = [
    ...withSection('Erstellen', [
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Werkzeuge auswählen',
        copy: 'Der Generator erstellt Codes, der Decoder liest sie aus Bild, Zwischenablage oder Kamera.',
        target: qrFrameTarget('.tool-tab-bar', qrFallback),
        placement: 'bottom',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Link eingeben',
        copy: 'Gib die Adresse ein, auf die der Code zeigen soll. Fehlt „https://“, ergänzt TeachHelper es automatisch.',
        target: qrFrameTarget('#generatorLinkInput', qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Code erstellen',
        copy: 'Der Button prüft den Link und erzeugt den QR-Code. Alles passiert im Browser, ohne Internetdienst.',
        target: qrFrameTarget('#generateButton', qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Code kontrollieren',
        copy: 'Die Vorschau zeigt den fertigen Code. Scanne ihn einmal selbst, bevor du ihn an die Lerngruppe gibst.',
        target: qrFrameTarget(['#qrPreviewShell:not(.hidden)', '#generatorResult'], qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Ziel-Link prüfen',
        copy: 'Unter der Vorschau steht das tatsächliche Ziel als anklickbarer Link. So erkennst du Tippfehler, bevor der Code im Umlauf ist.',
        target: qrFrameTarget(['#qrEncodedLink', '#generatorResult'], qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Code herunterladen',
        copy: '„Download“ speichert den Code als PNG – geeignet für Arbeitsblätter und Präsentationen.',
        target: qrFrameTarget('#downloadQrButton', qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Bild kopieren',
        copy: 'Kopiere das Bild direkt in die Zwischenablage, um es ohne Umweg einzufügen. Nicht jeder Browser unterstützt das.',
        target: qrFrameTarget('#copyQrImageButton', qrFallback),
        placement: 'top',
        beforeRender: openGenerator,
      }),
    ]),
    ...withSection('Lesen', [
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'QR-Code aus Bild lesen',
        copy: 'Ziehe ein Bild mit QR-Code hierher oder klicke zur Auswahl – etwa einen Screenshot oder ein Foto.',
        target: qrFrameTarget('#decoderDropZone', qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Gelesene Bilddatei',
        copy: 'Hier steht, welches Bild gerade ausgewertet wurde. Ein neues Bild ersetzt das vorige Ergebnis.',
        target: qrFrameTarget(['#decoderFileSummary:not(.hidden)', '#decoderDropZone'], qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
        skipIfMissing: true,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Bild aus der Zwischenablage',
        copy: 'Liest ein kopiertes Bild direkt aus der Zwischenablage. Der Browser fragt dabei um Erlaubnis.',
        target: qrFrameTarget('#pasteImageButton', qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Kamera verwenden',
        copy: '„Kamera“ startet den Live-Scan und fragt nach Kamerafreigabe. Das Bild verlässt dein Gerät nicht.',
        target: qrFrameTarget('#cameraButton', qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Kamerabild ausrichten',
        copy: 'Halte den Code vollständig und ruhig ins Bild. Sobald er erkannt wird, stoppt der Scan von selbst.',
        target: qrFrameTarget(['#cameraPanel:not(.hidden)', '#decoderDropZone'], qrFallback),
        placement: 'top',
        beforeRender: openDecoderCamera,
        skipIfMissing: true,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Kamerascan beenden',
        copy: 'Stoppe den Scan auch manuell, um die Kamera wieder freizugeben.',
        target: qrFrameTarget('#stopCameraButton', qrFallback),
        placement: 'top',
        beforeRender: openDecoderCamera,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Gelesenes Ergebnis',
        copy: 'Links werden anklickbar dargestellt, andere Inhalte als reiner Text. Prüfe fremde Links, bevor du sie öffnest.',
        target: qrFrameTarget(['#decodedLink:not(.hidden)', '#decodedText:not(.hidden)', '#decoderResult'], qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Ergebnis kopieren',
        copy: 'Kopiert den gelesenen Link oder Text in die Zwischenablage.',
        target: qrFrameTarget('#copyDecodedButton', qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
      createModuleTutorialStep({
        tab: TAB_QR,
        title: 'Wenn das Lesen nicht klappt',
        copy: 'Ein scharfes Bild, gutes Licht und etwas Rand um den Code verbessern die Erkennung deutlich.',
        target: qrFrameTarget(['#decoderResult', '#cameraPanel:not(.hidden)', '#decoderDropZone'], qrFallback),
        placement: 'top',
        beforeRender: openDecoder,
      }),
    ]),
  ];
  return {
    steps,
    demo: {
      activate: activateQrTutorialDemo,
      auto: true,
    },
  };
}
