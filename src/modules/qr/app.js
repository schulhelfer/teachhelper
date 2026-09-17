import { installAppTooltips } from '../../shared/app-tooltips.js';
import { installTutorialEntryHint } from '../../shared/tutorial-entry-hint.js';
import {
  MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
  QR_CAMERA_REQUEST_EVENT,
  QR_CAMERA_RESULT_EVENT,
  QR_CAMERA_STATE_EVENT,
  QR_SHELL_LAYOUT_EVENT,
} from '../../shell/tabs.js';
import {
  TUTORIAL_TARGET_RECT_REQUEST_EVENT,
  TUTORIAL_TARGET_RECT_RESPONSE_EVENT,
} from '../../shared/module-frame-bridge.js';
import { assertFileSizeAtMost, assertImageFilePixelsAtMost, FILE_LIMITS, FILE_TIMEOUTS } from '../../shared/file-guards.js';
import { createMessageApi } from '../../shared/messages.js';
import { createQrDecoder } from '../../shared/qr-decode.js';

function createQrApp({ root = document } = {}) {
  const TRUSTED_PARENT_ORIGIN = window.location.origin === 'null'
    ? new URL(import.meta.url).origin
    : window.location.origin;
  const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
  const TUTORIAL_COMMAND_EVENT = 'classroom:qr-tutorial-command';
  const DECODABLE_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
  ]);
  const toastApi = createMessageApi(root);
  const ALLOWED_PARENT_MESSAGE_TYPES = new Set([
    TUTORIAL_COMMAND_EVENT,
    QR_SHELL_LAYOUT_EVENT,
    QR_CAMERA_RESULT_EVENT,
    QR_CAMERA_STATE_EVENT,
    TUTORIAL_TARGET_RECT_REQUEST_EVENT,
  ]);
  const ui = {
    toolTabs: [...root.querySelectorAll('.tool-tab')],
    toolPanels: [...root.querySelectorAll('[data-tool-panel]')],
    tutorialButton: root.getElementById('tutorialButton'),
    generatorForm: root.getElementById('generatorForm'),
    generatorLinkInput: root.getElementById('generatorLinkInput'),
    generateButton: root.getElementById('generateButton'),
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
  installTutorialEntryHint(ui.tutorialButton, 'qr', 'QR', root);

  const imageCanvas = root.createElement('canvas');
  const imageContext = imageCanvas.getContext('2d', { willReadFrequently: true });

  let generatedUrl = '';
  let decodedValue = '';
  let cameraActive = false;
  let tutorialDemoActive = false;
  let tutorialPreviousTool = 'generator';
  let tutorialPreviousState = null;
  let tutorialDemoRenderPromise = null;
  let tutorialRenderVersion = 0;
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
        type: 'classroom:help-entry-request',
        detail: {
          source: 'iframe',
          module: 'qr',
        },
      }), TRUSTED_PARENT_ORIGIN);
    } catch {
      
    }
  }

  function respondWithTutorialTargetRect(detail) {
    const requestId = String(detail?.requestId || '');
    const selectors = Array.isArray(detail?.selectors) ? detail.selectors : [];
    const element = selectors
      .map((selector) => typeof selector === 'string' ? root.querySelector(selector) : null)
      .find((candidate) => {
        if (!(candidate instanceof HTMLElement) || candidate.hidden) return false;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
    if (element && detail?.reveal) {
      const rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    }
    const rect = element?.getBoundingClientRect();
    window.parent?.postMessage(withModuleFrameNonce({
      type: TUTORIAL_TARGET_RECT_RESPONSE_EVENT,
      detail: {
        requestId,
        rect: rect ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        } : null,
      },
    }), TRUSTED_PARENT_ORIGIN);
  }

  function getQrFactory() {
    return window.QRCode;
  }

  function getQrDecoder() {
    return window.jsQR;
  }

  function showToastMessage(message, variant = 'info') {
    toastApi.showMessage(String(message || ''), variant, { presentation: 'toast' });
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

  function openExternalLink(value) {
    const url = getHttpUrl(value);
    if (!url) return;
    if (!window.parent || window.parent === window) {
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      window.parent.postMessage(withModuleFrameNonce({
        type: MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
        detail: { url: url.href },
      }), TRUSTED_PARENT_ORIGIN);
    } catch {

    }
  }

  function openPendingExternalLink() {
    const target = pendingExternalLink;
    closeMessage();
    if (!target) return;
    openExternalLink(target);
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
    openExternalLink(url.href);
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
      showToastMessage('QR-Code wurde in die Zwischenablage kopiert.', 'success');
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
    tutorialPreviousState = {
      generatedUrl,
      decodedValue,
      generatorInputValue: ui.generatorLinkInput?.value || '',
      decoderFileSummaryName: ui.decoderFileSummary?.textContent || '',
      decoderFileSummaryVisible: Boolean(
        ui.decoderFileSummary && !ui.decoderFileSummary.classList.contains('hidden')
      ),
      tool: tutorialPreviousTool,
    };
    tutorialDemoActive = true;
    tutorialRenderVersion += 1;
    generatedUrl = 'https://www.tagesschau.de/';
    if (ui.generatorLinkInput) ui.generatorLinkInput.value = generatedUrl;
    ui.generatorResult?.classList.remove('empty');
    ui.generatorEmpty?.classList.add('hidden');
    ui.qrPreviewShell?.classList.remove('hidden');
    if (ui.qrEncodedLink) {
      ui.qrEncodedLink.href = generatedUrl;
      ui.qrEncodedLink.textContent = generatedUrl;
    }
    tutorialDemoRenderPromise = drawQrToCanvas(generatedUrl).catch(() => {});
    setDecoderFileSummary({ name: 'beispiel-qr-code.png' });
    renderDecodedValue(generatedUrl);
  }

  function showTutorialSurface(surface = '') {
    if (!tutorialDemoActive) return;
    ui.cameraPanel?.classList.toggle('hidden', surface !== 'camera');
  }

  function cleanupTutorialDemo() {
    if (!tutorialDemoActive) return;
    const previousState = tutorialPreviousState;
    const pendingDemoRender = tutorialDemoRenderPromise;
    const restorationVersion = ++tutorialRenderVersion;
    tutorialDemoActive = false;
    tutorialPreviousState = null;
    tutorialDemoRenderPromise = null;
    stopCamera();
    generatedUrl = previousState?.generatedUrl || '';
    decodedValue = '';
    if (ui.generatorLinkInput) {
      ui.generatorLinkInput.value = previousState?.generatorInputValue || '';
    }
    ui.generatorResult?.classList.toggle('empty', !generatedUrl);
    ui.generatorEmpty?.classList.toggle('hidden', Boolean(generatedUrl));
    ui.qrPreviewShell?.classList.toggle('hidden', !generatedUrl);
    if (ui.qrEncodedLink) {
      if (generatedUrl) {
        ui.qrEncodedLink.href = generatedUrl;
        ui.qrEncodedLink.textContent = generatedUrl;
      } else {
        ui.qrEncodedLink.removeAttribute('href');
        ui.qrEncodedLink.textContent = '';
      }
    }
    setDecoderFileSummary(
      previousState?.decoderFileSummaryVisible && previousState.decoderFileSummaryName
        ? { name: previousState.decoderFileSummaryName }
        : null
    );
    ui.decoderResult?.classList.add('empty');
    ui.decoderEmpty?.classList.remove('hidden');
    ui.decodedValuePanel?.classList.add('hidden');
    ui.decodedLink?.classList.add('hidden');
    ui.decodedLink?.removeAttribute('href');
    if (ui.decodedLink) delete ui.decodedLink.dataset.decodedUrl;
    if (ui.decodedLink) ui.decodedLink.textContent = '';
    ui.decodedText?.classList.add('hidden');
    if (ui.decodedText) ui.decodedText.textContent = '';
    if (previousState?.decodedValue) {
      renderDecodedValue(previousState.decodedValue);
    }
    setActiveTool(previousState?.tool || tutorialPreviousTool);

    const restoredGeneratedUrl = generatedUrl;
    void Promise.resolve(pendingDemoRender).catch(() => {}).then(async () => {
      if (tutorialDemoActive || restorationVersion !== tutorialRenderVersion) return;
      const context = ui.qrCanvas?.getContext?.('2d');
      if (!restoredGeneratedUrl) {
        context?.clearRect(0, 0, ui.qrCanvas.width, ui.qrCanvas.height);
        return;
      }
      try {
        await drawQrToCanvas(restoredGeneratedUrl);
      } catch {
        context?.clearRect(0, 0, ui.qrCanvas.width, ui.qrCanvas.height);
      }
    });
  }

  function handleParentMessage(event) {
    if (!isTrustedParentMessage(event)) return;
    const data = event.data;
    const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
    if (data.type === QR_SHELL_LAYOUT_EVENT) {
      document.documentElement.dataset.shellCollapsed = detail.collapsed ? 'true' : 'false';
      return;
    }
    if (data.type === TUTORIAL_TARGET_RECT_REQUEST_EVENT) {
      respondWithTutorialTargetRect(detail);
      return;
    }
    if (data.type === QR_CAMERA_STATE_EVENT) {
      handleCameraState(detail);
      return;
    }
    if (data.type === QR_CAMERA_RESULT_EVENT) {
      handleCameraResult(detail);
      return;
    }
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

  const qrDecoder = createQrDecoder({ root, getDecoder: getQrDecoder });
  const { decodeCanvasContent } = qrDecoder;

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

  function isDecodableImageType(type) {
    return DECODABLE_IMAGE_TYPES.has(String(type || '').trim().toLowerCase());
  }

  async function decodeBlob(blob, label = '') {
    if (!blob || !String(blob.type || '').startsWith('image/')) {
      showMessage('Bitte ein Bild mit QR-Code auswählen.', 'Bild prüfen');
      return;
    }
    if (!isDecodableImageType(blob.type)) {
      showMessage('Dieses Bildformat wird nicht unterstützt. Bitte PNG, JPEG, WebP, GIF oder BMP verwenden.', 'Bild prüfen');
      return;
    }
    stopCamera();
    try {
      assertFileSizeAtMost(blob, FILE_LIMITS.IMAGE_BYTES, 'Das Bild');
      await assertImageFilePixelsAtMost(blob, { label: 'Das Bild', mimeType: blob.type });
    } catch (error) {
      showMessage(error?.message || 'Das Bild ist zu groß.', 'Bild prüfen');
      return;
    }
    try {
      const bitmap = await createDrawableFromBlob(blob);
      try {
        await drawImageSourceToCanvas(bitmap);
        const code = await decodeCanvasContent(imageCanvas, {
          thorough: true,
          useNative: true,
          budgetMs: FILE_TIMEOUTS.QR_DECODE_MS,
        });
        if (!code || !code.data) {
          showToastMessage('In diesem Bild wurde kein QR-Code gefunden.', 'warn');
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
        const imageType = item.types.find((type) => isDecodableImageType(type));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        await decodeBlob(blob, 'Bild aus Zwischenablage');
        return;
      }
      showToastMessage('In der Zwischenablage wurde kein Bild gefunden.', 'warn');
    } catch (error) {
      showMessage(error?.message || 'Bild konnte nicht aus der Zwischenablage gelesen werden.', 'Fehler');
    }
  }

  function postCameraRequest(action) {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return false;
    try {
      window.parent.postMessage(withModuleFrameNonce({
        type: QR_CAMERA_REQUEST_EVENT,
        detail: { source: 'iframe', action },
      }), TRUSTED_PARENT_ORIGIN);
      return true;
    } catch {
      return false;
    }
  }

  function startCamera() {
    if (cameraActive) return;
    if (!postCameraRequest('start')) {
      showMessage('Kamera-Zugriff wird von diesem Browser nicht unterstützt.');
      return;
    }
    cameraActive = true;
    ui.cameraPanel?.classList.remove('hidden');
  }

  function stopCamera() {
    const wasActive = cameraActive;
    cameraActive = false;
    if (!tutorialDemoActive) {
      ui.cameraPanel?.classList.add('hidden');
    }
    if (wasActive) {
      postCameraRequest('stop');
    }
  }

  function handleCameraState(detail) {
    if (detail.error) {
      stopCamera();
      showMessage(detail.error, 'Fehler');
      return;
    }
    if (detail.active === false) {
      stopCamera();
    }
  }

  function handleCameraResult(detail) {
    if (!cameraActive) return;
    const value = String(detail.value || '');
    if (!value) return;
    stopCamera();
    renderDecodedValue(value);
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
      showToastMessage('Ergebnis wurde in die Zwischenablage kopiert.', 'success');
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
        isDecodableImageType(candidate?.type)
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
    ui.generateButton?.addEventListener('click', generateQr);
    ui.generatorLinkInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') generateQr(event);
    });
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
  installAppTooltips(document);
  window.__teachhelperQrApp = createQrApp();
}
