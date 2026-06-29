export function createQrApp({ root = document } = {}) {
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
  const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
  const TUTORIAL_COMMAND_EVENT = 'classroom:qr-tutorial-command';
  const ALLOWED_PARENT_MESSAGE_TYPES = new Set([TUTORIAL_COMMAND_EVENT]);
  const ui = {
    toolTabs: [...root.querySelectorAll('.tool-tab')],
    toolPanels: [...root.querySelectorAll('[data-tool-panel]')],
    tutorialButton: root.getElementById('tutorialButton'),
    generatorForm: root.getElementById('generatorForm'),
    generatorLinkInput: root.getElementById('generatorLinkInput'),
    generatorResult: root.getElementById('generatorResult'),
    generatorEmpty: root.getElementById('generatorEmpty'),
    qrPreviewShell: root.getElementById('qrPreviewShell'),
    qrCanvas: root.getElementById('qrCanvas'),
    qrEncodedLink: root.getElementById('qrEncodedLink'),
    downloadQrButton: root.getElementById('downloadQrButton'),
    copyQrImageButton: root.getElementById('copyQrImageButton'),
    decoderDropZone: root.getElementById('decoderDropZone'),
    decoderFileInput: root.getElementById('decoderFileInput'),
    decoderDropHint: root.getElementById('decoderDropHint'),
    decoderFileSummary: root.getElementById('decoderFileSummary'),
    pasteImageButton: root.getElementById('pasteImageButton'),
    cameraButton: root.getElementById('cameraButton'),
    cameraPanel: root.getElementById('cameraPanel'),
    cameraVideo: root.getElementById('cameraVideo'),
    stopCameraButton: root.getElementById('stopCameraButton'),
    decoderResult: root.getElementById('decoderResult'),
    decoderEmpty: root.getElementById('decoderEmpty'),
    decodedValuePanel: root.getElementById('decodedValuePanel'),
    decodedLink: root.getElementById('decodedLink'),
    decodedText: root.getElementById('decodedText'),
    copyDecodedButton: root.getElementById('copyDecodedButton'),
    messageDialog: root.getElementById('messageDialog'),
    messageTitle: root.getElementById('messageTitle'),
    messageText: root.getElementById('messageText'),
    externalLinkOpenButton: root.getElementById('externalLinkOpenButton'),
    messageCloseButton: root.getElementById('messageCloseButton'),
  };

  const imageCanvas = root.createElement('canvas');
  const imageContext = imageCanvas.getContext('2d', { willReadFrequently: true });
  const cameraCanvas = root.createElement('canvas');
  const cameraContext = cameraCanvas.getContext('2d', { willReadFrequently: true });
  const variantCanvas = root.createElement('canvas');
  const variantContext = variantCanvas.getContext('2d', { willReadFrequently: true });

  let generatedUrl = '';
  let decodedValue = '';
  let cameraStream = null;
  let cameraScanFrame = 0;
  let cameraActive = false;
  let cameraDecodeBusy = false;
  let lastCameraDotRepairAt = 0;
  let nativeQrDetectorPromise = null;
  let tutorialDemoActive = false;
  let tutorialPreviousTool = 'generator';
  let pendingExternalLink = '';

  function blockBrowserContextMenu(event) {
    event.preventDefault();
  }

  function blockSecondaryPointerDefault(event) {
    if (event.button === 2) {
      event.preventDefault();
    }
  }

  function bindBrowserContextMenuBlocker() {
    const options = { capture: true, passive: false };
    [window, root].filter(Boolean).forEach((target) => {
      target.addEventListener('contextmenu', blockBrowserContextMenu, options);
      target.addEventListener('mousedown', blockSecondaryPointerDefault, options);
      target.addEventListener('pointerdown', blockSecondaryPointerDefault, options);
      target.addEventListener('auxclick', blockSecondaryPointerDefault, options);
    });
  }

  function withModuleFrameNonce(payload) {
    return MODULE_FRAME_NONCE ? { ...payload, frameNonce: MODULE_FRAME_NONCE } : payload;
  }

  function isTrustedParentMessage(event) {
    if (!window.parent || event.source !== window.parent) return false;
    if (event.origin !== TRUSTED_PARENT_ORIGIN) return false;
    const data = event.data;
    if (!data || typeof data !== 'object') return false;
    if (MODULE_FRAME_NONCE && data.frameNonce !== MODULE_FRAME_NONCE) return false;
    return ALLOWED_PARENT_MESSAGE_TYPES.has(data.type);
  }

  function notifyParentTutorialStartRequest() {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      return;
    }
    try {
      window.parent.postMessage(withModuleFrameNonce({
        type: 'classroom:tutorial-start-request',
        detail: {
          source: 'iframe',
          module: 'qr',
        },
      }), TRUSTED_PARENT_ORIGIN);
    } catch {
      // The tutorial entry is only available inside the app shell.
    }
  }

  function getQrFactory() {
    return window.QRCode;
  }

  function getQrDecoder() {
    return window.jsQR;
  }

  function showMessage(message, title = 'Hinweis') {
    if (!ui.messageDialog) return;
    pendingExternalLink = '';
    ui.externalLinkOpenButton?.classList.add('hidden');
    ui.externalLinkOpenButton?.classList.remove('primary');
    ui.messageCloseButton?.classList.add('primary');
    if (ui.messageCloseButton) ui.messageCloseButton.textContent = 'OK';
    if (ui.messageTitle) ui.messageTitle.textContent = title;
    if (ui.messageText) ui.messageText.textContent = message;
    ui.messageDialog.classList.remove('hidden');
    root.body?.classList.add('dialog-active');
    try {
      if (typeof ui.messageDialog.showModal === 'function' && !ui.messageDialog.open) {
        ui.messageDialog.showModal();
      } else {
        ui.messageDialog.setAttribute('open', 'open');
      }
    } catch {
      ui.messageDialog.setAttribute('open', 'open');
    }
    ui.messageCloseButton?.focus();
  }

  function closeMessage() {
    if (!ui.messageDialog) return;
    pendingExternalLink = '';
    ui.externalLinkOpenButton?.classList.add('hidden');
    ui.externalLinkOpenButton?.classList.remove('primary');
    ui.messageCloseButton?.classList.add('primary');
    if (ui.messageCloseButton) ui.messageCloseButton.textContent = 'OK';
    root.body?.classList.remove('dialog-active');
    if (ui.messageDialog.open && typeof ui.messageDialog.close === 'function') {
      ui.messageDialog.close();
    } else {
      ui.messageDialog.removeAttribute('open');
    }
    ui.messageDialog.classList.add('hidden');
  }

  function setActiveTool(tool) {
    const nextTool = tool === 'decoder' ? 'decoder' : 'generator';
    if (nextTool !== 'decoder') {
      stopCamera();
    }
    ui.toolTabs.forEach((tab) => {
      const active = tab.dataset.tool === nextTool;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    ui.toolPanels.forEach((panel) => {
      panel.hidden = panel.dataset.toolPanel !== nextTool;
    });
  }

  function normalizeLinkInput(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) {
      return { ok: false, reason: 'Bitte zuerst einen Link eingeben.' };
    }
    if (/\s/.test(raw)) {
      return { ok: false, reason: 'Der Link darf keine Leerzeichen enthalten.' };
    }

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const candidate = withScheme ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'Bitte einen http- oder https-Link eingeben.' };
      }
      if (!url.hostname || !url.hostname.includes('.')) {
        return { ok: false, reason: 'Bitte einen vollständigen Link eingeben, zum Beispiel example.com.' };
      }
      return { ok: true, value: url.href };
    } catch {
      return { ok: false, reason: 'Der eingegebene Text ist kein gültiger Link.' };
    }
  }

  function isValidUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function getHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url;
    } catch {
      return null;
    }
  }

  function isExternalUrl(value) {
    const url = getHttpUrl(value);
    return Boolean(url && url.origin !== TRUSTED_PARENT_ORIGIN);
  }

  function showExternalLinkWarning(value) {
    const url = getHttpUrl(value);
    if (!url) return;
    pendingExternalLink = url.href;
    if (ui.messageTitle) ui.messageTitle.textContent = 'Externen Link öffnen?';
    if (ui.messageText) {
      ui.messageText.textContent = [
        `Domain: ${url.host}`,
        '',
        url.href,
        '',
        'Öffne den Link nur, wenn du der Quelle des QR-Codes vertraust.',
      ].join('\n');
    }
    ui.externalLinkOpenButton?.classList.remove('hidden');
    ui.externalLinkOpenButton?.classList.add('primary');
    ui.messageCloseButton?.classList.remove('primary');
    if (ui.messageCloseButton) ui.messageCloseButton.textContent = 'Abbrechen';
    ui.messageDialog?.classList.remove('hidden');
    root.body?.classList.add('dialog-active');
    try {
      if (typeof ui.messageDialog?.showModal === 'function' && !ui.messageDialog.open) {
        ui.messageDialog.showModal();
      } else {
        ui.messageDialog?.setAttribute('open', 'open');
      }
    } catch {
      ui.messageDialog?.setAttribute('open', 'open');
    }
    ui.externalLinkOpenButton?.focus();
  }

  function openPendingExternalLink() {
    const target = pendingExternalLink;
    closeMessage();
    if (!target) return;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  function handleDecodedLinkClick(event) {
    if (!decodedValue) return;
    event?.preventDefault();
    const url = getHttpUrl(decodedValue);
    if (!url) return;
    if (isExternalUrl(url.href)) {
      showExternalLinkWarning(url.href);
      return;
    }
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  async function drawQrToCanvas(value) {
    const QRCode = getQrFactory();
    if (!QRCode || typeof QRCode.toCanvas !== 'function') {
      throw new Error('QR-Generator konnte nicht geladen werden.');
    }
    const canvas = ui.qrCanvas;
    if (!canvas) {
      throw new Error('Canvas für QR-Code fehlt.');
    }
    await QRCode.toCanvas(canvas, value, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000ff',
        light: '#ffffffff',
      },
    });
  }

  async function renderGeneratedQr(value) {
    generatedUrl = value;
    await drawQrToCanvas(value);
    ui.generatorResult?.classList.remove('empty');
    ui.generatorEmpty?.classList.add('hidden');
    ui.qrPreviewShell?.classList.remove('hidden');
    if (ui.qrEncodedLink) {
      ui.qrEncodedLink.href = value;
      ui.qrEncodedLink.textContent = value;
    }
  }

  async function generateQr(event) {
    event?.preventDefault();
    const normalized = normalizeLinkInput(ui.generatorLinkInput?.value || '');
    if (!normalized.ok) {
      showMessage(normalized.reason, 'Link prüfen');
      return;
    }
    try {
      await renderGeneratedQr(normalized.value);
    } catch (error) {
      showMessage(error?.message || 'QR-Code konnte nicht erstellt werden.', 'Fehler');
    }
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== 'function') {
        reject(new Error('PNG-Ausgabe wird von diesem Browser nicht unterstützt.'));
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('PNG-Ausgabe konnte nicht erstellt werden.'));
        }
      }, 'image/png');
    });
  }

  async function downloadQr() {
    if (!generatedUrl) {
      showMessage('Bitte zuerst einen QR-Code erstellen.');
      return;
    }
    try {
      const blob = await canvasToPngBlob(ui.qrCanvas);
      const url = URL.createObjectURL(blob);
      const anchor = root.createElement('a');
      anchor.href = url;
      anchor.download = 'qr-code.png';
      root.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      showMessage(error?.message || 'Download konnte nicht vorbereitet werden.', 'Fehler');
    }
  }

  async function copyQrImage() {
    if (!generatedUrl) {
      showMessage('Bitte zuerst einen QR-Code erstellen.');
      return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem !== 'function') {
      showMessage('Dieser Browser kann Bilder nicht in die Zwischenablage kopieren.');
      return;
    }
    try {
      const blob = await canvasToPngBlob(ui.qrCanvas);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      showMessage('QR-Code wurde in die Zwischenablage kopiert.', 'Kopiert');
    } catch (error) {
      showMessage(error?.message || 'QR-Code konnte nicht in die Zwischenablage kopiert werden.', 'Fehler');
    }
  }

  function setDecoderFileSummary(file) {
    if (!ui.decoderDropHint || !ui.decoderFileSummary) return;
    if (!file) {
      ui.decoderDropHint.classList.remove('hidden');
      ui.decoderFileSummary.classList.add('hidden');
      ui.decoderFileSummary.textContent = '';
      return;
    }
    ui.decoderDropHint.classList.add('hidden');
    ui.decoderFileSummary.classList.remove('hidden');
    ui.decoderFileSummary.textContent = file.name || 'Bild aus Zwischenablage';
  }

  function renderDecodedValue(value) {
    decodedValue = String(value || '');
    if (!decodedValue) return;
    const valueIsUrl = isValidUrl(decodedValue);
    ui.decoderResult?.classList.remove('empty');
    ui.decoderEmpty?.classList.add('hidden');
    ui.decodedValuePanel?.classList.remove('hidden');
    if (ui.decodedLink) {
      ui.decodedLink.classList.toggle('hidden', !valueIsUrl);
      if (valueIsUrl) {
        ui.decodedLink.href = '#external-link-warning';
        ui.decodedLink.dataset.decodedUrl = decodedValue;
        ui.decodedLink.textContent = decodedValue;
      } else {
        ui.decodedLink.removeAttribute('href');
        delete ui.decodedLink.dataset.decodedUrl;
        ui.decodedLink.textContent = '';
      }
    }
    if (ui.decodedText) {
      ui.decodedText.classList.toggle('hidden', valueIsUrl);
      ui.decodedText.textContent = valueIsUrl ? '' : decodedValue;
    }
  }

  function activateTutorialDemo() {
    if (tutorialDemoActive) return;
    tutorialPreviousTool = ui.toolTabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tool
      || 'generator';
    tutorialDemoActive = true;
    generatedUrl = 'https://www.tagesschau.de/';
    ui.generatorResult?.classList.remove('empty');
    ui.generatorEmpty?.classList.add('hidden');
    ui.qrPreviewShell?.classList.remove('hidden');
    if (ui.qrEncodedLink) {
      ui.qrEncodedLink.href = generatedUrl;
      ui.qrEncodedLink.textContent = generatedUrl;
    }
    void drawQrToCanvas(generatedUrl).then(() => {
      if (tutorialDemoActive) return;
      const context = ui.qrCanvas?.getContext?.('2d');
      context?.clearRect(0, 0, ui.qrCanvas.width, ui.qrCanvas.height);
    }).catch(() => {});
    setDecoderFileSummary({ name: 'beispiel-qr-code.png' });
    renderDecodedValue(generatedUrl);
  }

  function showTutorialSurface(surface = '') {
    if (!tutorialDemoActive) return;
    ui.cameraPanel?.classList.toggle('hidden', surface !== 'camera');
  }

  function cleanupTutorialDemo() {
    if (!tutorialDemoActive) return;
    tutorialDemoActive = false;
    stopCamera();
    generatedUrl = '';
    decodedValue = '';
    ui.generatorResult?.classList.add('empty');
    ui.generatorEmpty?.classList.remove('hidden');
    ui.qrPreviewShell?.classList.add('hidden');
    if (ui.qrEncodedLink) {
      ui.qrEncodedLink.removeAttribute('href');
      ui.qrEncodedLink.textContent = '';
    }
    const context = ui.qrCanvas?.getContext?.('2d');
    context?.clearRect(0, 0, ui.qrCanvas.width, ui.qrCanvas.height);
    setDecoderFileSummary(null);
    ui.decoderResult?.classList.add('empty');
    ui.decoderEmpty?.classList.remove('hidden');
    ui.decodedValuePanel?.classList.add('hidden');
    ui.decodedLink?.classList.add('hidden');
    ui.decodedLink?.removeAttribute('href');
    if (ui.decodedLink) ui.decodedLink.textContent = '';
    ui.decodedText?.classList.add('hidden');
    if (ui.decodedText) ui.decodedText.textContent = '';
    setActiveTool(tutorialPreviousTool);
  }

  function handleParentMessage(event) {
    if (!isTrustedParentMessage(event)) return;
    const data = event.data;
    const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
    const command = String(detail.command || '');
    const commandDetail = detail.detail && typeof detail.detail === 'object' ? detail.detail : {};
    if (command === 'activateDemo') {
      activateTutorialDemo();
      return;
    }
    if (command === 'cleanupDemo') {
      cleanupTutorialDemo();
      return;
    }
    if (command === 'selectTool') {
      const tool = commandDetail.tool === 'decoder' ? 'decoder' : 'generator';
      setActiveTool(tool);
      showTutorialSurface(String(commandDetail.surface || ''));
      return;
    }
    if (command === 'showSurface') {
      showTutorialSurface(String(commandDetail.surface || ''));
    }
  }

  function decodeImageData(imageData, width, height) {
    const decoder = getQrDecoder();
    if (typeof decoder !== 'function') {
      throw new Error('QR-Decoder konnte nicht geladen werden.');
    }
    return decoder(imageData, width, height, { inversionAttempts: 'attemptBoth' });
  }

  async function getNativeQrDetector() {
    if (!('BarcodeDetector' in window)) return null;
    if (!nativeQrDetectorPromise) {
      nativeQrDetectorPromise = (async () => {
        try {
          const Detector = window.BarcodeDetector;
          if (typeof Detector.getSupportedFormats === 'function') {
            const formats = await Detector.getSupportedFormats();
            if (!formats.includes('qr_code')) return null;
          }
          return new Detector({ formats: ['qr_code'] });
        } catch {
          return null;
        }
      })();
    }
    return nativeQrDetectorPromise;
  }

  async function detectNativeQr(source) {
    const detector = await getNativeQrDetector();
    if (!detector || typeof detector.detect !== 'function') return null;
    try {
      const results = await detector.detect(source);
      const qrCode = results.find((result) => (
        !result.format || result.format === 'qr_code'
      ));
      const data = qrCode?.rawValue || '';
      return data ? { data } : null;
    } catch {
      return null;
    }
  }

  function readQrFromCanvas(canvas) {
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) return null;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return decodeImageData(imageData.data, imageData.width, imageData.height);
  }

  function getLuminance(red, green, blue, alpha) {
    const opacity = alpha / 255;
    const blendedRed = red * opacity + 255 * (1 - opacity);
    const blendedGreen = green * opacity + 255 * (1 - opacity);
    const blendedBlue = blue * opacity + 255 * (1 - opacity);
    return Math.round(0.299 * blendedRed + 0.587 * blendedGreen + 0.114 * blendedBlue);
  }

  function applyContrast(imageData) {
    const data = imageData.data;
    let min = 255;
    let max = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
    }
    const range = Math.max(1, max - min);
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      const enhanced = Math.max(0, Math.min(255, Math.round(((luminance - min) / range) * 255)));
      data[index] = enhanced;
      data[index + 1] = enhanced;
      data[index + 2] = enhanced;
      data[index + 3] = 255;
    }
  }

  function getOtsuThreshold(imageData) {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    let total = 0;
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      histogram[luminance] += 1;
      total += 1;
      sum += luminance;
    }
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestThreshold = 128;
    let bestVariance = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * ((backgroundMean - foregroundMean) ** 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        bestThreshold = threshold;
      }
    }
    return bestThreshold;
  }

  function applyThreshold(imageData, threshold = getOtsuThreshold(imageData)) {
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      const value = luminance >= threshold ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  function growDarkPixels(imageData, radius = 1, iterations = 1) {
    const { data, width, height } = imageData;
    if (!width || !height || radius < 1 || iterations < 1) return;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const source = new Uint8ClampedArray(data);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          if (source[index] < 128) {
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 255;
            continue;
          }
          let hasDarkNeighbor = false;
          for (let dy = -radius; dy <= radius && !hasDarkNeighbor; dy += 1) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -radius; dx <= radius; dx += 1) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const neighborIndex = (ny * width + nx) * 4;
              if (source[neighborIndex] < 128) {
                hasDarkNeighbor = true;
                break;
              }
            }
          }
          const value = hasDarkNeighbor ? 0 : 255;
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = 255;
        }
      }
    }
  }

  function applyDotRepair(imageData, options = {}) {
    if (options.contrast) {
      applyContrast(imageData);
    }
    applyThreshold(imageData, options.threshold ?? getOtsuThreshold(imageData));
    growDarkPixels(imageData, options.growRadius || 1, options.growIterations || 1);
  }

  function prepareDecodeVariant(sourceCanvas, options = {}) {
    if (!variantContext || !sourceCanvas.width || !sourceCanvas.height) return null;
    const sourceMaxSide = Math.max(sourceCanvas.width, sourceCanvas.height);
    const targetMaxSide = options.targetMaxSide || sourceMaxSide;
    const minDecodeSide = options.minDecodeSide || 0;
    let scale = 1;
    if (minDecodeSide && sourceMaxSide < minDecodeSide) {
      scale = minDecodeSide / sourceMaxSide;
    } else if (targetMaxSide && sourceMaxSide > targetMaxSide) {
      scale = targetMaxSide / sourceMaxSide;
    }
    scale = Math.min(4, Math.max(0.1, scale));
    const drawWidth = Math.max(1, Math.round(sourceCanvas.width * scale));
    const drawHeight = Math.max(1, Math.round(sourceCanvas.height * scale));
    const padding = Math.round(Math.max(drawWidth, drawHeight) * (options.paddingRatio || 0));
    const width = drawWidth + padding * 2;
    const height = drawHeight + padding * 2;
    variantCanvas.width = width;
    variantCanvas.height = height;
    variantContext.imageSmoothingEnabled = options.smoothing !== false;
    variantContext.clearRect(0, 0, width, height);
    variantContext.fillStyle = '#ffffff';
    variantContext.fillRect(0, 0, width, height);
    variantContext.drawImage(sourceCanvas, padding, padding, drawWidth, drawHeight);
    if (options.mode && options.mode !== 'plain') {
      const imageData = variantContext.getImageData(0, 0, width, height);
      if (options.mode === 'contrast') {
        applyContrast(imageData);
      } else if (options.mode === 'otsu') {
        applyThreshold(imageData);
      } else if (options.mode === 'threshold-low') {
        applyThreshold(imageData, 96);
      } else if (options.mode === 'threshold-high') {
        applyThreshold(imageData, 160);
      } else if (options.mode === 'dot-grow') {
        applyDotRepair(imageData, { growRadius: 1, threshold: options.threshold });
      } else if (options.mode === 'dot-grow-strong') {
        applyDotRepair(imageData, { growRadius: 1, growIterations: 2, threshold: options.threshold });
      } else if (options.mode === 'dot-contrast-grow') {
        applyDotRepair(imageData, { contrast: true, growRadius: 1, threshold: options.threshold });
      }
      variantContext.putImageData(imageData, 0, 0);
    }
    return variantCanvas;
  }

  async function decodeCanvasContent(canvas, { thorough = false, useNative = true, dotRepair = false } = {}) {
    const directCode = readQrFromCanvas(canvas);
    if (directCode?.data) return directCode;

    if (useNative) {
      const nativeCode = await detectNativeQr(canvas);
      if (nativeCode?.data) return nativeCode;
    }

    const standardVariants = thorough ? [
      { paddingRatio: 0.08, mode: 'plain' },
      { paddingRatio: 0.08, mode: 'contrast' },
      { paddingRatio: 0.08, mode: 'otsu' },
      { paddingRatio: 0.08, mode: 'threshold-low' },
      { paddingRatio: 0.08, mode: 'threshold-high' },
      { minDecodeSide: 900, paddingRatio: 0.08, mode: 'plain', smoothing: false },
      { targetMaxSide: 1200, paddingRatio: 0.08, mode: 'contrast' },
    ] : [
      { paddingRatio: 0.06, mode: 'plain' },
    ];
    const dotRepairVariants = thorough ? [
      { minDecodeSide: 900, targetMaxSide: 1500, paddingRatio: 0.08, mode: 'dot-grow', smoothing: false },
      { minDecodeSide: 1100, targetMaxSide: 1500, paddingRatio: 0.1, mode: 'dot-contrast-grow', smoothing: false },
      { minDecodeSide: 1200, targetMaxSide: 1500, paddingRatio: 0.1, mode: 'dot-grow-strong', smoothing: false },
      { minDecodeSide: 1000, targetMaxSide: 1400, paddingRatio: 0.08, mode: 'dot-grow', threshold: 112, smoothing: false },
      { minDecodeSide: 1000, targetMaxSide: 1400, paddingRatio: 0.08, mode: 'dot-grow', threshold: 144, smoothing: false },
    ] : [
      { targetMaxSide: 900, paddingRatio: 0.08, mode: 'dot-grow', smoothing: false },
      { targetMaxSide: 900, paddingRatio: 0.08, mode: 'dot-contrast-grow', smoothing: false },
    ];
    const variants = dotRepair || thorough ? [
      ...standardVariants,
      ...dotRepairVariants,
    ] : standardVariants;

    const attempted = new Set();
    for (const variant of variants) {
      const preparedCanvas = prepareDecodeVariant(canvas, variant);
      if (!preparedCanvas) continue;
      const key = `${preparedCanvas.width}x${preparedCanvas.height}:${JSON.stringify(variant)}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const code = readQrFromCanvas(preparedCanvas);
      if (code?.data) return code;
    }

    return null;
  }

  async function drawImageSourceToCanvas(source) {
    if (!imageContext) {
      throw new Error('Canvas-Kontext für QR-Decoder fehlt.');
    }
    const maxSide = 1800;
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Das Bild konnte nicht gelesen werden.');
    }
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    imageCanvas.width = width;
    imageCanvas.height = height;
    imageContext.clearRect(0, 0, width, height);
    imageContext.drawImage(source, 0, 0, width, height);
    return imageContext.getImageData(0, 0, width, height);
  }

  function loadImageElementFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Das Bild konnte nicht geladen werden.'));
      };
      image.src = url;
    });
  }

  async function createDrawableFromBlob(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch {
        try {
          return await createImageBitmap(blob);
        } catch {
          return loadImageElementFromBlob(blob);
        }
      }
    }
    return loadImageElementFromBlob(blob);
  }

  async function decodeBlob(blob, label = '') {
    if (!blob || !String(blob.type || '').startsWith('image/')) {
      showMessage('Bitte ein Bild mit QR-Code auswählen.', 'Bild prüfen');
      return;
    }
    stopCamera();
    try {
      const bitmap = await createDrawableFromBlob(blob);
      try {
        await drawImageSourceToCanvas(bitmap);
        const code = await decodeCanvasContent(imageCanvas, { thorough: true, useNative: true });
        if (!code || !code.data) {
          showMessage('In diesem Bild wurde kein QR-Code gefunden.', 'Nicht erkannt');
          return;
        }
        setDecoderFileSummary({ name: label || 'QR-Code-Bild' });
        renderDecodedValue(code.data);
      } finally {
        if (typeof bitmap.close === 'function') {
          bitmap.close();
        }
      }
    } catch (error) {
      showMessage(error?.message || 'QR-Code konnte nicht gelesen werden.', 'Fehler');
    }
  }

  async function decodeFile(file) {
    if (!file) return;
    await decodeBlob(file, file.name);
  }

  async function pasteImageFromClipboard() {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      showMessage('Dieser Browser kann keine Bilder aus der Zwischenablage lesen.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        await decodeBlob(blob, 'Bild aus Zwischenablage');
        return;
      }
      showMessage('In der Zwischenablage wurde kein Bild gefunden.', 'Zwischenablage');
    } catch (error) {
      showMessage(error?.message || 'Bild konnte nicht aus der Zwischenablage gelesen werden.', 'Fehler');
    }
  }

  function scanCameraFrame() {
    if (!cameraActive || !ui.cameraVideo || !cameraContext) return;
    const video = ui.cameraVideo;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width && height && !cameraDecodeBusy) {
      cameraCanvas.width = width;
      cameraCanvas.height = height;
      cameraContext.drawImage(video, 0, 0, width, height);
      cameraDecodeBusy = true;
      const now = performance.now();
      const useDotRepair = now - lastCameraDotRepairAt > 700;
      if (useDotRepair) {
        lastCameraDotRepairAt = now;
      }
      decodeCanvasContent(cameraCanvas, { thorough: false, useNative: false, dotRepair: useDotRepair }).then((code) => {
        if (!cameraActive || !code?.data) return;
        renderDecodedValue(code.data);
        stopCamera();
      }).catch(() => {}).finally(() => {
        cameraDecodeBusy = false;
      });
    }
    cameraScanFrame = requestAnimationFrame(scanCameraFrame);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      showMessage('Kamera-Zugriff wird von diesem Browser nicht unterstützt.');
      return;
    }
    stopCamera();
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (!ui.cameraVideo) return;
      ui.cameraVideo.srcObject = cameraStream;
      ui.cameraPanel?.classList.remove('hidden');
      await ui.cameraVideo.play();
      cameraActive = true;
      lastCameraDotRepairAt = 0;
      cameraScanFrame = requestAnimationFrame(scanCameraFrame);
    } catch (error) {
      stopCamera();
      showMessage(error?.message || 'Kamera konnte nicht gestartet werden.', 'Fehler');
    }
  }

  function stopCamera() {
    cameraActive = false;
    cameraDecodeBusy = false;
    lastCameraDotRepairAt = 0;
    if (cameraScanFrame) {
      cancelAnimationFrame(cameraScanFrame);
      cameraScanFrame = 0;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    if (ui.cameraVideo) {
      ui.cameraVideo.pause();
      ui.cameraVideo.srcObject = null;
    }
    ui.cameraPanel?.classList.add('hidden');
  }

  async function copyDecodedValue() {
    if (!decodedValue) {
      showMessage('Bitte zuerst einen QR-Code lesen.');
      return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      showMessage('Dieser Browser kann Text nicht in die Zwischenablage kopieren.');
      return;
    }
    try {
      await navigator.clipboard.writeText(decodedValue);
      showMessage('Ergebnis wurde in die Zwischenablage kopiert.', 'Kopiert');
    } catch (error) {
      showMessage(error?.message || 'Ergebnis konnte nicht kopiert werden.', 'Fehler');
    }
  }

  function bindDropZone() {
    ui.decoderDropZone?.addEventListener('click', () => {
      ui.decoderFileInput?.click();
    });
    ui.decoderDropZone?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      ui.decoderFileInput?.click();
    });
    ['dragenter', 'dragover'].forEach((type) => {
      ui.decoderDropZone?.addEventListener(type, (event) => {
        event.preventDefault();
        ui.decoderDropZone?.classList.add('drag-over');
      });
    });
    ['dragleave', 'dragend'].forEach((type) => {
      ui.decoderDropZone?.addEventListener(type, () => {
        ui.decoderDropZone?.classList.remove('drag-over');
      });
    });
    ui.decoderDropZone?.addEventListener('drop', (event) => {
      event.preventDefault();
      ui.decoderDropZone?.classList.remove('drag-over');
      const file = [...(event.dataTransfer?.files || [])].find((candidate) => (
        String(candidate?.type || '').startsWith('image/')
      ));
      if (!file) {
        showMessage('Bitte ein Bild mit QR-Code ablegen.', 'Bild prüfen');
        return;
      }
      decodeFile(file);
    });
    ui.decoderFileInput?.addEventListener('change', () => {
      const file = ui.decoderFileInput?.files?.[0] || null;
      ui.decoderFileInput.value = '';
      decodeFile(file);
    });
  }

  function bindEvents() {
    ui.tutorialButton?.addEventListener('click', notifyParentTutorialStartRequest);
    ui.toolTabs.forEach((tab) => {
      tab.addEventListener('click', () => setActiveTool(tab.dataset.tool));
    });
    ui.generatorForm?.addEventListener('submit', generateQr);
    ui.downloadQrButton?.addEventListener('click', downloadQr);
    ui.copyQrImageButton?.addEventListener('click', copyQrImage);
    ui.pasteImageButton?.addEventListener('click', pasteImageFromClipboard);
    ui.cameraButton?.addEventListener('click', startCamera);
    ui.stopCameraButton?.addEventListener('click', stopCamera);
    ui.copyDecodedButton?.addEventListener('click', copyDecodedValue);
    ui.decodedLink?.addEventListener('click', handleDecodedLinkClick);
    ui.externalLinkOpenButton?.addEventListener('click', openPendingExternalLink);
    ui.messageCloseButton?.addEventListener('click', closeMessage);
    ui.messageDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeMessage();
    });
    window.addEventListener('pagehide', stopCamera);
    window.addEventListener('beforeunload', stopCamera);
    window.addEventListener('message', handleParentMessage);
    bindDropZone();
  }

  bindBrowserContextMenuBlocker();
  bindEvents();

  return {
    stopCamera,
    activateTutorialDemo,
    showTutorialSurface,
    cleanupTutorialDemo,
  };
}

if (document?.body && !window.__teachhelperQrApp) {
  window.__teachhelperQrApp = createQrApp();
}
