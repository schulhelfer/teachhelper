import { installAppTooltips } from '../../shared/app-tooltips.js';
import {
  FILE_LIMITS,
  FILE_TIMEOUTS,
  validateZipFile,
  withTimeout,
} from '../../shared/file-guards.js';

export function createDuplicateCheckApp({ root = document } = {}) {
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
  const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
  const TUTORIAL_COMMAND_EVENT = 'classroom:duplicate-check-tutorial-command';
  const ALLOWED_PARENT_MESSAGE_TYPES = new Set([TUTORIAL_COMMAND_EVENT]);
  const JSZIP_URL = new URL('../../vendor/jszip/3.10.1/jszip.min.js', import.meta.url);
  const HASH_WIDTH = 17;
  const HASH_HEIGHT = 16;
  const IMAGE_HASH_SIZE = (HASH_WIDTH - 1) * HASH_HEIGHT;
  const VISUAL_SAMPLE_SIZE = 48;
  const TILE_GRID_SIZE = 4;
  const TILE_SAMPLE_SIZE = 16;
  const VISUAL_PREFILTER_HASH_THRESHOLD = 5;
  const VISUAL_PREFILTER_MAE_THRESHOLD = 5.5;
  const VISUAL_TILE_HASH_THRESHOLD = 4;
  const VISUAL_TILE_MAE_THRESHOLD = 4.2;
  const VISUAL_TILE_SCORE_THRESHOLD = 0.84;
  const VISUAL_ASPECT_RATIO_TOLERANCE = 0.045;
  const VISUAL_CROP_VARIANTS = [
    { key: 'full', x: 0, y: 0, width: 1, height: 1 },
    { key: 'left-trim', x: 0.04, y: 0, width: 0.96, height: 1 },
    { key: 'right-trim', x: 0, y: 0, width: 0.96, height: 1 },
    { key: 'top-trim', x: 0, y: 0.04, width: 1, height: 0.96 },
    { key: 'bottom-trim', x: 0, y: 0, width: 1, height: 0.96 },
    { key: 'center-94', x: 0.03, y: 0.03, width: 0.94, height: 0.94 },
    { key: 'center-88', x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
  ];
  const MAX_VISUAL_RECORDS = 260;

  const ui = {
    tutorialButton: root.getElementById('tutorialButton'),
    zipInput: root.getElementById('zipInput'),
    zipDropZone: root.getElementById('zipDropZone'),
    dropHint: root.getElementById('dropHint'),
    fileSummary: root.getElementById('fileSummary'),
    resultPanel: root.getElementById('resultPanel'),
    ruleButtons: [...root.querySelectorAll('[data-duplicate-rule]')],
  };

  let jsZipLoadPromise = null;
  let analysisToken = 0;
  let enabledRules = { name: true, size: true, visual: true };
  let lastRecords = [];
  let tutorialDemoActive = false;
  let activePreviewOverlay = null;

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
          module: 'duplicate-check',
        },
      }), TRUSTED_PARENT_ORIGIN);
    } catch {
      // The tutorial entry is only available inside the app shell.
    }
  }

  function hasJsZipLoaded() {
    return Boolean(window.JSZip && typeof window.JSZip.loadAsync === 'function');
  }

  function loadJsZipScript() {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined' || !document.head) {
        reject(new Error('ZIP-Library kann in dieser Umgebung nicht geladen werden.'));
        return;
      }

      const script = document.createElement('script');
      script.src = JSZIP_URL.href;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error(`ZIP-Library konnte nicht geladen werden: ${JSZIP_URL.pathname}`));
      };
      document.head.append(script);
    });
  }

  async function ensureJsZipLoaded() {
    if (hasJsZipLoaded()) return window.JSZip;
    if (!jsZipLoadPromise) {
      jsZipLoadPromise = loadJsZipScript()
        .then(() => {
          if (!hasJsZipLoaded()) {
            throw new Error('ZIP-Library wurde geladen, ist aber unvollständig.');
          }
          return window.JSZip;
        })
        .catch((error) => {
          jsZipLoadPromise = null;
          throw error;
        });
    }
    return jsZipLoadPromise;
  }

  function getEnabledRuleList(rules = enabledRules) {
    return ['name', 'size', 'visual'].filter((rule) => Boolean(rules[rule]));
  }

  function getRuleLabel(rule) {
    if (rule === 'name') return 'gleichem Namen';
    if (rule === 'size') return 'gleicher Größe';
    if (rule === 'visual') return 'ähnlichem Bildinhalt';
    return '';
  }

  function formatRuleList(rules = enabledRules) {
    const labels = getEnabledRuleList(rules).map(getRuleLabel).filter(Boolean);
    if (!labels.length) return 'keinem aktiven Kriterium';
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`;
  }

  function syncRuleButtons() {
    ui.ruleButtons.forEach((button) => {
      const rule = button.dataset.duplicateRule;
      const active = Boolean(enabledRules[rule]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setFileSummary(file) {
    if (!ui.fileSummary || !ui.dropHint) return;
    if (!file) {
      ui.dropHint.classList.remove('hidden');
      ui.fileSummary.classList.add('hidden');
      ui.fileSummary.textContent = '';
      return;
    }
    ui.dropHint.classList.add('hidden');
    ui.fileSummary.classList.remove('hidden');
    ui.fileSummary.replaceChildren(createTextElement('strong', file.name));
  }

  function createTextElement(tagName, text, className = '') {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  }

  function renderInitial() {
    if (!ui.resultPanel) return;
    ui.resultPanel.className = 'result-panel empty';
    ui.resultPanel.hidden = true;
    ui.resultPanel.replaceChildren();
  }

  function renderEmptyResult(summary) {
    if (!ui.resultPanel) return;
    ui.resultPanel.className = 'result-panel';
    ui.resultPanel.hidden = false;
    const empty = document.createElement('div');
    empty.className = 'empty-state-box';
    empty.append(
      createTextElement('div', 'OK', 'empty-state-icon'),
      createTextElement('h2', 'Keine Duplikate gefunden', 'empty-state-title'),
      createTextElement('p', 'Die gewählten Regeln haben keine auffälligen Abgaben gefunden.', 'empty-state-copy')
    );
    ui.resultPanel.replaceChildren(renderSummaryGrid(summary), empty);
  }

  function renderError(message) {
    if (!ui.resultPanel) return;
    ui.resultPanel.className = 'result-panel error';
    ui.resultPanel.hidden = false;
    const empty = document.createElement('div');
    empty.className = 'empty-state-box';
    empty.append(
      createTextElement('div', '!', 'empty-state-icon'),
      createTextElement('h2', 'Analyse nicht möglich', 'empty-state-title'),
      createTextElement('p', message, 'empty-state-copy')
    );
    ui.resultPanel.replaceChildren(empty);
  }

  function renderResults(result) {
    if (!ui.resultPanel) return;
    const { summary, groups } = result;
    if (!groups.length) {
      renderEmptyResult(summary);
      return;
    }

    ui.resultPanel.className = 'result-panel';
    ui.resultPanel.hidden = false;
    const summaryGrid = renderSummaryGrid(summary);

    const list = document.createElement('section');
    list.className = 'groups-list';
    list.setAttribute('aria-label', 'Duplikatgruppen');
    groups.forEach((group, index) => {
      list.appendChild(renderGroup(group, index + 1));
    });

    ui.resultPanel.replaceChildren(summaryGrid, list);
  }

  function renderSummaryGrid(summary) {
    const summaryGrid = document.createElement('section');
    summaryGrid.className = 'summary-grid';
    summaryGrid.setAttribute('aria-label', 'Zusammenfassung');
    [
      ['Geprüfte Dateien', summary.totalFiles],
      ...(summary.enabledRules.visual ? [['Gruppen aus ähnlichen Bildern', summary.visualGroupCount]] : []),
      ...(summary.enabledRules.name ? [['Gruppen aus gleichnamigen Dateien', summary.nameGroupCount]] : []),
      ...(summary.enabledRules.size ? [['Gruppen aus gleichgroßen Dateien', summary.sizeGroupCount]] : []),
    ].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.append(
        createTextElement('div', label, 'summary-label'),
        createTextElement('div', String(value), 'summary-value')
      );
      summaryGrid.appendChild(card);
    });
    return summaryGrid;
  }

  function renderResultFromLastRecords() {
    if (tutorialDemoActive) {
      renderTutorialDemoResult();
      return;
    }
    if (!lastRecords.length) {
      renderInitial();
      return;
    }
    const result = buildDuplicateResult(lastRecords, enabledRules);
    renderResults(result);
  }

  function renderTutorialDemoResult() {
    const records = lastRecords.slice();
    const reasons = {
      name: Boolean(enabledRules.name),
      size: Boolean(enabledRules.size),
      visual: Boolean(enabledRules.visual),
    };
    renderResults({
      summary: {
        totalFiles: records.length,
        nameGroupCount: reasons.name ? 1 : 0,
        sizeGroupCount: reasons.size ? 1 : 0,
        visualGroupCount: reasons.visual ? 1 : 0,
        enabledRules: { ...enabledRules },
      },
      groups: [{
        records,
        reasons,
        label: 'Beispielabgabe',
        visualPairs: reasons.visual ? [{ records: records.slice(0, 2), score: 0.94, matchingTiles: 14 }] : [],
      }],
    });
  }

  function activateTutorialDemo() {
    analysisToken += 1;
    revokeRecordObjectUrls(lastRecords);
    tutorialDemoActive = true;
    const makeSvg = (accent) => new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="#f8fafc"/><circle cx="125" cy="130" r="72" fill="${accent}"/><rect x="220" y="72" width="145" height="116" rx="18" fill="#334155"/></svg>`
    );
    lastRecords = [
      { id: 1, path: 'Alex/Plakat.svg', displayPath: 'Alex/Plakat.svg', name: 'Plakat.svg', size: 256, bytes: makeSvg('#38bdf8') },
      { id: 2, path: 'Sam/Plakat.svg', displayPath: 'Sam/Plakat.svg', name: 'Plakat.svg', size: 256, bytes: makeSvg('#0ea5e9') },
      { id: 3, path: 'Kim/Entwurf.svg', displayPath: 'Kim/Entwurf.svg', name: 'Entwurf.svg', size: 256, bytes: makeSvg('#38bdf8') },
    ];
    setFileSummary({ name: 'Beispielabgaben.zip' });
    renderTutorialDemoResult();
  }

  function cleanupTutorialDemo() {
    if (!tutorialDemoActive) return;
    tutorialDemoActive = false;
    activePreviewOverlay?.remove();
    activePreviewOverlay = null;
    revokeRecordObjectUrls(lastRecords);
    lastRecords = [];
    setFileSummary(null);
    renderInitial();
  }

  function handleParentMessage(event) {
    if (!isTrustedParentMessage(event)) return;
    const data = event.data;
    const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
    const command = String(detail.command || '');
    if (command === 'activateDemo') {
      activateTutorialDemo();
      return;
    }
    if (command === 'cleanupDemo') {
      cleanupTutorialDemo();
    }
  }

  function renderGroup(group, index) {
    const section = document.createElement('article');
    section.className = 'duplicate-group';

    const head = document.createElement('header');
    head.className = 'group-head';
    const title = document.createElement('div');
    title.className = 'group-title';
    const titleRow = document.createElement('div');
    titleRow.className = 'group-title-row';
    titleRow.append(createTextElement('div', `Gruppe ${index} (${group.records.length} Dateien)`, 'group-name'));
    const previewPairs = getPreviewPairsForGroup(group);
    if (previewPairs.length) {
      const compareButton = document.createElement('button');
      compareButton.className = 'compare-button';
      compareButton.type = 'button';
      compareButton.textContent = 'Vergleichen';
      compareButton.addEventListener('click', () => {
        openCompareDialog(group, 0);
      });
      titleRow.append(compareButton);
    }
    title.append(titleRow);

    const badges = document.createElement('div');
    badges.className = 'badge-row';
    if (group.reasons.name) {
      badges.appendChild(createTextElement('span', 'Gleicher Dateiname', 'reason-badge name'));
    }
    if (group.reasons.size) {
      badges.appendChild(createTextElement('span', 'Gleiche Dateigröße', 'reason-badge size'));
    }
    if (group.reasons.visual) {
      badges.appendChild(createTextElement('span', 'Ähnlicher Bildinhalt', 'reason-badge visual'));
    }
    head.append(title, badges);

    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    group.records
      .slice()
	      .sort((a, b) => a.path.localeCompare(b.path, 'de'))
	      .forEach((record) => {
	        const row = document.createElement('div');
	        row.className = 'file-row';
	        const objectUrl = getRecordDownloadObjectUrl(record);
	        if (objectUrl) {
	          const link = document.createElement('a');
	          link.className = 'file-path file-link';
	          link.href = objectUrl;
	          link.download = getSafeDownloadName(record.name);
	          link.title = 'Datei herunterladen';
	          link.textContent = record.displayPath || record.path;
	          row.append(link);
	        } else {
	          row.append(createTextElement('span', record.displayPath || record.path, 'file-path'));
	        }
	        fileList.appendChild(row);
	      });

    section.append(head, fileList);
    return section;
  }

  function getPreviewPairsForGroup(group) {
    if (group?.visualPairs?.length) return group.visualPairs;
    if (!group?.reasons?.name) return [];
    const imageRecords = (group.records || [])
      .filter((record) => record.visualSignature)
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path, 'de'));
    const pairs = [];
    for (let firstIndex = 0; firstIndex < imageRecords.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < imageRecords.length; secondIndex += 1) {
        pairs.push({
          records: [imageRecords[firstIndex], imageRecords[secondIndex]],
          score: 0,
          matchingTiles: 0,
          variantKeys: [],
        });
      }
    }
    return pairs;
  }

  async function openCompareDialog(group, initialPairIndex = 0) {
    const pairs = getPreviewPairsForGroup(group);
    if (!pairs.length) return;

    let activePairIndex = Math.min(Math.max(0, initialPairIndex), pairs.length - 1);
    const overlay = document.createElement('div');
    activePreviewOverlay?.remove();
    activePreviewOverlay = overlay;
    overlay.className = 'preview-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Bildvergleich');

    const dialog = document.createElement('section');
    dialog.className = 'preview-dialog';
    const header = document.createElement('header');
    header.className = 'preview-head';
    const title = createTextElement('h2', 'Bildvergleich', 'preview-title');
    const controls = document.createElement('div');
    controls.className = 'preview-controls';
    const pairLabel = createTextElement('span', '', 'preview-pair-label');
    const previousButton = createTextElement('button', 'Zurück', 'preview-nav-button');
    previousButton.type = 'button';
    const nextButton = createTextElement('button', 'Weiter', 'preview-nav-button');
    nextButton.type = 'button';
    const closeButton = createTextElement('button', 'Schließen', 'preview-close-button');
    closeButton.type = 'button';
    controls.append(previousButton, pairLabel, nextButton, closeButton);
    header.append(title, controls);

    const body = document.createElement('div');
    body.className = 'preview-body';
    dialog.append(header, body);
    overlay.append(dialog);
    document.body.append(overlay);

    const close = () => {
      window.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      if (activePreviewOverlay === overlay) activePreviewOverlay = null;
    };
    const handleKeydown = (event) => {
      if (event.key === 'Escape') close();
    };
    const renderPair = async () => {
      const pair = pairs[activePairIndex];
      const [leftRecord, rightRecord] = pair.records;
      pairLabel.textContent = `${activePairIndex + 1} / ${pairs.length}`;
      previousButton.disabled = activePairIndex === 0;
      nextButton.disabled = activePairIndex === pairs.length - 1;
      body.replaceChildren(
        renderPreviewPane('Datei A', leftRecord, getRecordObjectUrl(leftRecord)),
        renderPreviewPane('Datei B', rightRecord, getRecordObjectUrl(rightRecord))
      );
    };

    previousButton.addEventListener('click', () => {
      if (activePairIndex <= 0) return;
      activePairIndex -= 1;
      renderPair();
    });
    nextButton.addEventListener('click', () => {
      if (activePairIndex >= pairs.length - 1) return;
      activePairIndex += 1;
      renderPair();
    });
    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    window.addEventListener('keydown', handleKeydown);
    await renderPair();
  }

  function renderPreviewPane(label, record, src) {
    const pane = document.createElement('article');
    pane.className = 'preview-pane';
    const image = document.createElement('img');
    image.className = 'preview-image';
    image.alt = record ? record.displayPath || record.path : '';
    if (src) image.src = src;
    const caption = document.createElement('div');
    caption.className = 'preview-caption';
    caption.append(
      createTextElement('strong', label),
      createTextElement('span', record ? record.displayPath || record.path : '')
    );
    pane.append(image, caption);
    return pane;
  }

	  function getRecordObjectUrl(record) {
	    if (!record) return '';
	    if (!record.bytes?.length) return '';
	    if (!record.objectUrl) {
	      const mimeType = getFileMimeType(record.name);
	      record.objectUrl = URL.createObjectURL(new Blob([record.bytes], { type: mimeType }));
    }
    return record.objectUrl;
  }

  function getSafeDownloadName(name) {
    const fallback = 'download';
    const value = String(name || '').replace(/[\\/\u0000-\u001f\u007f]+/g, '_').trim();
    return value || fallback;
  }

	  function getRecordDownloadObjectUrl(record) {
	    if (!record) return '';
	    if (!record.bytes?.length) return '';
	    if (!record.downloadObjectUrl) {
	      record.downloadObjectUrl = URL.createObjectURL(new Blob([record.bytes], { type: 'application/octet-stream' }));
	    }
    return record.downloadObjectUrl;
  }

  function revokeRecordObjectUrls(records) {
    records.forEach((record) => {
      if (record.objectUrl) {
        URL.revokeObjectURL(record.objectUrl);
        delete record.objectUrl;
      }
      if (record.downloadObjectUrl) {
        URL.revokeObjectURL(record.downloadObjectUrl);
        delete record.downloadObjectUrl;
      }
    });
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = bytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  function getImageMimeType(name) {
    const lowerName = String(name || '').toLocaleLowerCase('de');
    if (/\.(?:jpe?g|jfif|pjpeg|pjp)$/i.test(lowerName)) return 'image/jpeg';
    if (/\.png$/i.test(lowerName)) return 'image/png';
    if (/\.webp$/i.test(lowerName)) return 'image/webp';
    if (/\.gif$/i.test(lowerName)) return 'image/gif';
    if (/\.bmp$/i.test(lowerName)) return 'image/bmp';
    if (/\.avif$/i.test(lowerName)) return 'image/avif';
    return '';
  }

  function getFileMimeType(name) {
    const imageMimeType = getImageMimeType(name);
    if (imageMimeType) return imageMimeType;
    const lowerName = String(name || '').toLocaleLowerCase('de');
    if (/\.pdf$/i.test(lowerName)) return 'application/pdf';
    if (/\.txt$/i.test(lowerName)) return 'text/plain';
    if (/\.csv$/i.test(lowerName)) return 'text/csv';
    if (/\.html?$/i.test(lowerName)) return 'text/html';
    if (/\.svg$/i.test(lowerName)) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  function getSourceDimensions(source) {
    return {
      width: source?.width || source?.naturalWidth || 0,
      height: source?.height || source?.naturalHeight || 0,
    };
  }

  function createImageElementFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Bild konnte nicht dekodiert werden.'));
      };
      image.src = url;
    });
  }

  async function decodeImageSource(blob) {
    if (typeof window.createImageBitmap === 'function') {
      try {
        return {
          source: await window.createImageBitmap(blob, { imageOrientation: 'from-image' }),
          close() {
            this.source?.close?.();
          },
        };
      } catch (error) {
        // Fallback fuer Browser, die createImageBitmap oder das Format nicht sauber unterstuetzen.
      }
    }
    const image = await createImageElementFromBlob(blob);
    return {
      source: image,
      close() {},
    };
  }

  function getCropRect(source, cropVariant = VISUAL_CROP_VARIANTS[0]) {
    const { width, height } = getSourceDimensions(source);
    if (!width || !height) return null;
    const cropWidth = Math.max(1, Math.round(width * cropVariant.width));
    const cropHeight = Math.max(1, Math.round(height * cropVariant.height));
    return {
      x: Math.max(0, Math.round(width * cropVariant.x)),
      y: Math.max(0, Math.round(height * cropVariant.y)),
      width: Math.min(width, cropWidth),
      height: Math.min(height, cropHeight),
    };
  }

  function drawCroppedImage(context, source, cropVariant, targetWidth, targetHeight) {
    const cropRect = getCropRect(source, cropVariant);
    if (!cropRect) return false;
    context.drawImage(source, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, targetWidth, targetHeight);
    return true;
  }

  function getLuminanceSampleFromContext(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    const sample = new Uint8Array(width * height);
    for (let index = 0; index < sample.length; index += 1) {
      const pixelIndex = index * 4;
      sample[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
    }
    return sample;
  }

  function createDHash(source, cropVariant) {
    const canvas = document.createElement('canvas');
    canvas.width = HASH_WIDTH;
    canvas.height = HASH_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    if (!drawCroppedImage(context, source, cropVariant, HASH_WIDTH, HASH_HEIGHT)) return null;

    const pixels = context.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data;
    const bits = new Uint8Array(IMAGE_HASH_SIZE);
    let index = 0;
    for (let y = 0; y < HASH_HEIGHT; y += 1) {
      for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
        const leftIndex = (y * HASH_WIDTH + x) * 4;
        const rightIndex = (y * HASH_WIDTH + x + 1) * 4;
        const left = (pixels[leftIndex] * 0.299) + (pixels[leftIndex + 1] * 0.587) + (pixels[leftIndex + 2] * 0.114);
        const right = (pixels[rightIndex] * 0.299) + (pixels[rightIndex + 1] * 0.587) + (pixels[rightIndex + 2] * 0.114);
        bits[index] = left > right ? 1 : 0;
        index += 1;
      }
    }
    return bits;
  }

  function createLuminanceSample(source, cropVariant, sampleWidth = VISUAL_SAMPLE_SIZE, sampleHeight = VISUAL_SAMPLE_SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    if (!drawCroppedImage(context, source, cropVariant, sampleWidth, sampleHeight)) return null;
    return getLuminanceSampleFromContext(context, sampleWidth, sampleHeight);
  }

  function createTileSignatures(source, cropVariant) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_GRID_SIZE * TILE_SAMPLE_SIZE;
    canvas.height = TILE_GRID_SIZE * TILE_SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];

    if (!drawCroppedImage(context, source, cropVariant, canvas.width, canvas.height)) return [];
    const tiles = [];
    for (let tileY = 0; tileY < TILE_GRID_SIZE; tileY += 1) {
      for (let tileX = 0; tileX < TILE_GRID_SIZE; tileX += 1) {
        const pixels = context.getImageData(
          tileX * TILE_SAMPLE_SIZE,
          tileY * TILE_SAMPLE_SIZE,
          TILE_SAMPLE_SIZE,
          TILE_SAMPLE_SIZE
        ).data;
        const sample = new Uint8Array(TILE_SAMPLE_SIZE * TILE_SAMPLE_SIZE);
        for (let index = 0; index < sample.length; index += 1) {
          const pixelIndex = index * 4;
          sample[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
        }
        tiles.push({
          sample,
          bits: createHashFromLuminanceGrid(sample, TILE_SAMPLE_SIZE, TILE_SAMPLE_SIZE),
        });
      }
    }
    return tiles;
  }

  function createHashFromLuminanceGrid(sample, width, height) {
    if (!sample || sample.length !== width * height) return null;
    const bits = new Uint8Array((width - 1) * height);
    let bitIndex = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        bits[bitIndex] = sample[(y * width) + x] > sample[(y * width) + x + 1] ? 1 : 0;
        bitIndex += 1;
      }
    }
    return bits;
  }

  async function createVisualSignature(bytes, name) {
    const mimeType = getImageMimeType(name);
    if (!mimeType) return null;

    const blob = new Blob([bytes], { type: mimeType });
    let decoded = null;
    try {
      decoded = await decodeImageSource(blob);
      const { width, height } = getSourceDimensions(decoded.source);
      if (!width || !height) return null;
      const variants = VISUAL_CROP_VARIANTS
        .map((variant) => ({
          key: variant.key,
          aspectRatio: (width * variant.width) / (height * variant.height),
          bits: createDHash(decoded.source, variant),
          sample: createLuminanceSample(decoded.source, variant),
          tiles: createTileSignatures(decoded.source, variant),
        }))
        .filter((signature) => signature.bits && signature.sample && signature.tiles.length === TILE_GRID_SIZE * TILE_GRID_SIZE);
      if (!variants.length) return null;
      return {
        width,
        height,
        aspectRatio: width / height,
        variants,
      };
    } catch (error) {
      return null;
    } finally {
      decoded?.close?.();
    }
  }

	  function getZipEntrySize(entry, key) {
	    const value = entry?._data?.[key];
	    return Number.isFinite(value) && value >= 0 ? value : null;
	  }

	  function ensureZipAnalysisWithinDeadline(deadlineMs) {
	    if (Date.now() > deadlineMs) {
	      throw new Error('Die ZIP-Analyse hat zu lange gedauert. Bitte mit einem kleineren ZIP erneut versuchen.');
	    }
	  }

	  function assertZipEntryLimits(entries) {
	    if (entries.length > FILE_LIMITS.ZIP_MAX_ENTRIES) {
	      throw new Error(`Das ZIP enthält zu viele Dateien. Maximal erlaubt: ${FILE_LIMITS.ZIP_MAX_ENTRIES}.`);
	    }

	    let knownUncompressedTotal = 0;
	    entries.forEach((entry) => {
	      const compressedSize = getZipEntrySize(entry, 'compressedSize');
	      const uncompressedSize = getZipEntrySize(entry, 'uncompressedSize');
	      if (compressedSize != null && compressedSize > FILE_LIMITS.ZIP_BYTES) {
	        throw new Error(`"${entry.name}" ist im ZIP ungewöhnlich groß.`);
	      }
	      if (uncompressedSize != null) {
	        if (uncompressedSize > FILE_LIMITS.ZIP_ENTRY_BYTES) {
	          throw new Error(`"${entry.name}" ist entpackt zu groß. Maximal erlaubt: ${formatBytes(FILE_LIMITS.ZIP_ENTRY_BYTES)}.`);
	        }
	        knownUncompressedTotal += uncompressedSize;
	      }
	    });

	    if (knownUncompressedTotal > FILE_LIMITS.ZIP_TOTAL_UNCOMPRESSED_BYTES) {
	      throw new Error(`Das ZIP ist entpackt zu groß. Maximal erlaubt: ${formatBytes(FILE_LIMITS.ZIP_TOTAL_UNCOMPRESSED_BYTES)}.`);
	    }
	  }

  function getBasename(path) {
    return String(path || '').split(/[\\/]/).filter(Boolean).pop() || String(path || '');
  }

  function stripExtension(name) {
    const value = String(name || '');
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex <= 0) return value;
    return value.slice(0, dotIndex);
  }

  function normalizeNameKey(name) {
    return stripExtension(name).toLocaleLowerCase('de');
  }

  function normalizeZipPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function getCommonRootPrefix(entries) {
    const roots = new Set();
    entries.forEach((entry) => {
      const path = normalizeZipPath(entry?.name);
      const slashIndex = path.indexOf('/');
      if (slashIndex <= 0) {
        roots.add('');
        return;
      }
      roots.add(path.slice(0, slashIndex));
    });
    return roots.size === 1 ? [...roots][0] : '';
  }

  function stripRootPrefix(path, rootPrefix) {
    const normalized = normalizeZipPath(path);
    if (!rootPrefix) return normalized || path;
    const prefix = `${rootPrefix}/`;
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  }

  function addToMapList(map, key, value) {
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  }

  function addDuplicateGroup(groupMap, records, reason, label, meta = {}) {
    const sortedRecords = records.slice().sort((a, b) => a.id - b.id);
    const key = sortedRecords.map((record) => record.id).join('|');
    const existing = groupMap.get(key);
    if (existing) {
      existing.reasons[reason] = true;
      if (meta.visualPairs) {
        existing.visualPairs = meta.visualPairs;
      }
      if (reason === 'visual' || reason === 'name' || reason === 'size') {
        existing.label = label;
      }
      return;
    }
    groupMap.set(key, {
      label,
      records: sortedRecords,
      reasons: {
        name: reason === 'name',
        size: reason === 'size',
        visual: reason === 'visual',
      },
      visualPairs: meta.visualPairs || [],
    });
  }

  function getHashDistance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let distance = 0;
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        distance += 1;
      }
    }
    return distance;
  }

  function getSampleMeanAbsoluteError(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let total = 0;
    for (let index = 0; index < a.length; index += 1) {
      total += Math.abs(a[index] - b[index]);
    }
    return total / a.length;
  }

  function isTileSimilar(tileA, tileB) {
    if (!tileA || !tileB) return false;
    if (getHashDistance(tileA.bits, tileB.bits) > VISUAL_TILE_HASH_THRESHOLD) return false;
    return getSampleMeanAbsoluteError(tileA.sample, tileB.sample) <= VISUAL_TILE_MAE_THRESHOLD;
  }

  function getVisualTileWeights(records) {
    const visualRecords = records.filter((record) => record.visualSignature);
    const tileCount = TILE_GRID_SIZE * TILE_GRID_SIZE;
    if (visualRecords.length < 3) {
      return Array(tileCount).fill(1);
    }

    const pairCount = (visualRecords.length * (visualRecords.length - 1)) / 2;
    return Array.from({ length: tileCount }, (_, tileIndex) => {
      let commonMatches = 0;
      for (let a = 0; a < visualRecords.length - 1; a += 1) {
        const tileA = visualRecords[a].visualSignature.variants[0]?.tiles?.[tileIndex];
        for (let b = a + 1; b < visualRecords.length; b += 1) {
          const tileB = visualRecords[b].visualSignature.variants[0]?.tiles?.[tileIndex];
          if (isTileSimilar(tileA, tileB)) {
            commonMatches += 1;
          }
        }
      }
      const commonRatio = pairCount ? commonMatches / pairCount : 0;
      if (commonRatio >= 0.92) return 0.08;
      if (commonRatio >= 0.78) return 0.18;
      if (commonRatio >= 0.62) return 0.35;
      if (commonRatio >= 0.45) return 0.65;
      return 1;
    });
  }

  function getTileMatchScore(variantA, variantB, tileWeights) {
    let totalWeight = 0;
    let matchingWeight = 0;
    let matchingTiles = 0;
    const tileCount = Math.min(variantA.tiles.length, variantB.tiles.length, tileWeights.length);
    for (let index = 0; index < tileCount; index += 1) {
      const weight = tileWeights[index] ?? 1;
      totalWeight += weight;
      if (isTileSimilar(variantA.tiles[index], variantB.tiles[index])) {
        matchingWeight += weight;
        matchingTiles += 1;
      }
    }
    return {
      score: totalWeight ? matchingWeight / totalWeight : 0,
      matchingTiles,
    };
  }

  function getBestVisualMatch(recordA, recordB, tileWeights) {
    const signatureA = recordA?.visualSignature;
    const signatureB = recordB?.visualSignature;
    if (!signatureA || !signatureB) return null;

    let bestMatch = null;
    signatureA.variants.forEach((variantA) => {
      signatureB.variants.forEach((variantB) => {
        const aspectRatioDelta = Math.abs(variantA.aspectRatio - variantB.aspectRatio);
        if (aspectRatioDelta > VISUAL_ASPECT_RATIO_TOLERANCE) return;
        const hashDistance = getHashDistance(variantA.bits, variantB.bits);
        if (hashDistance > VISUAL_PREFILTER_HASH_THRESHOLD) return;
        const sampleError = getSampleMeanAbsoluteError(variantA.sample, variantB.sample);
        if (sampleError > VISUAL_PREFILTER_MAE_THRESHOLD) return;
        const tileMatch = getTileMatchScore(variantA, variantB, tileWeights);
        if (tileMatch.score < VISUAL_TILE_SCORE_THRESHOLD || tileMatch.matchingTiles < 13) return;
        if (!bestMatch || tileMatch.score > bestMatch.score) {
          bestMatch = {
            records: [recordA, recordB],
            score: tileMatch.score,
            matchingTiles: tileMatch.matchingTiles,
            variantKeys: [variantA.key, variantB.key],
          };
        }
      });
    });
    return bestMatch;
  }

  function getVisualDuplicateGroups(records) {
    const visualRecords = records.filter((record) => record.visualSignature);
    if (visualRecords.length < 2 || visualRecords.length > MAX_VISUAL_RECORDS) {
      return [];
    }

    const tileWeights = getVisualTileWeights(records);
    const matchedPairs = [];
    const parent = new Map(visualRecords.map((record) => [record.id, record.id]));
    const find = (id) => {
      let rootId = parent.get(id);
      while (rootId !== parent.get(rootId)) {
        rootId = parent.get(rootId);
      }
      let currentId = id;
      while (currentId !== rootId) {
        const nextId = parent.get(currentId);
        parent.set(currentId, rootId);
        currentId = nextId;
      }
      return rootId;
    };
    const unite = (idA, idB) => {
      const rootA = find(idA);
      const rootB = find(idB);
      if (rootA !== rootB) {
        parent.set(rootB, rootA);
      }
    };

    for (let a = 0; a < visualRecords.length - 1; a += 1) {
      for (let b = a + 1; b < visualRecords.length; b += 1) {
        const match = getBestVisualMatch(visualRecords[a], visualRecords[b], tileWeights);
        if (match) {
          matchedPairs.push(match);
          unite(visualRecords[a].id, visualRecords[b].id);
        }
      }
    }

    const groups = new Map();
    visualRecords.forEach((record) => {
      addToMapList(groups, String(find(record.id)), record);
    });
    return [...groups.entries()]
      .map(([rootId, groupRecords]) => ({
        records: groupRecords,
        pairs: matchedPairs.filter((pair) => String(find(pair.records[0].id)) === rootId && String(find(pair.records[1].id)) === rootId),
      }))
      .filter((group) => group.records.length > 1 && group.pairs.length);
  }

  function buildDuplicateResult(records, rules = enabledRules) {
    const nameGroups = new Map();
    const sizeGroups = new Map();
    records.forEach((record) => {
      if (rules.name) {
        addToMapList(nameGroups, record.nameKey, record);
      }
      if (rules.size) {
        addToMapList(sizeGroups, String(record.size), record);
      }
    });

    const duplicateNameGroups = rules.name
      ? [...nameGroups.entries()].filter(([, group]) => group.length > 1)
      : [];
    const duplicateSizeGroups = rules.size
      ? [...sizeGroups.entries()].filter(([, group]) => group.length > 1)
      : [];
    const duplicateVisualGroups = rules.visual
      ? getVisualDuplicateGroups(records)
      : [];
    const mergedGroups = new Map();

    duplicateVisualGroups.forEach((group) => {
      addDuplicateGroup(mergedGroups, group.records, 'visual', 'Ähnlicher Bildinhalt', {
        visualPairs: group.pairs,
      });
    });

    duplicateNameGroups.forEach(([, group]) => {
      const names = [...new Set(group.map((record) => stripExtension(record.name)))];
      const label = names.length === 1 ? names[0] : names.join(' / ');
      addDuplicateGroup(mergedGroups, group, 'name', label);
    });

    duplicateSizeGroups.forEach(([size, group]) => {
      addDuplicateGroup(mergedGroups, group, 'size', formatBytes(Number(size)));
    });

    const groups = [...mergedGroups.values()].sort((a, b) => {
      if (a.reasons.visual !== b.reasons.visual) return a.reasons.visual ? -1 : 1;
      if (a.reasons.name !== b.reasons.name) return a.reasons.name ? -1 : 1;
      return a.label.localeCompare(b.label, 'de');
    });
    return {
      summary: {
        totalFiles: records.length,
        nameGroupCount: duplicateNameGroups.length,
        sizeGroupCount: duplicateSizeGroups.length,
        visualGroupCount: duplicateVisualGroups.length,
        enabledRules: { ...rules },
      },
      groups,
    };
  }

	  async function collectZipRecords(file, token) {
	    const deadlineMs = Date.now() + FILE_TIMEOUTS.ZIP_ANALYSIS_MS;
	    let JSZip;
	    try {
	      JSZip = await ensureJsZipLoaded();
    } catch (error) {
      throw new Error('ZIP-Library konnte nicht geladen werden. Bitte Internetverbindung prüfen oder später erneut versuchen.');
    }
    if (token !== analysisToken) return null;

	    let zip;
	    try {
	      zip = await withTimeout(
	        () => JSZip.loadAsync(file),
	        FILE_TIMEOUTS.ZIP_LOAD_MS,
	        'ZIP konnte nicht rechtzeitig gelesen werden.'
	      );
	    } catch (error) {
	      throw new Error(error?.message || 'Die Datei konnte nicht als ZIP gelesen werden.');
	    }
	    if (token !== analysisToken) return null;

	    const entries = Object.values(zip.files || {}).filter((entry) => entry && !entry.dir);
	    if (!entries.length) {
	      throw new Error('Das ZIP enthält keine Dateien.');
	    }
	    assertZipEntryLimits(entries);

	    const rootPrefix = getCommonRootPrefix(entries);
	    const records = [];
	    for (let index = 0; index < entries.length; index += 1) {
	      if (token !== analysisToken) return null;
	      ensureZipAnalysisWithinDeadline(deadlineMs);
	      const entry = entries[index];
	      const name = getBasename(entry.name);
	      const shouldReadBytes = Boolean(enabledRules.visual && getImageMimeType(name));
	      let bytes = null;
	      let visualSignature = null;
	      const knownSize = getZipEntrySize(entry, 'uncompressedSize');
	      if (shouldReadBytes) {
	        const remainingMs = Math.max(1, deadlineMs - Date.now());
	        bytes = await withTimeout(
	          () => entry.async('uint8array'),
	          remainingMs,
	          'ZIP-Eintrag konnte nicht rechtzeitig entpackt werden.'
	        );
	        if (bytes.byteLength > FILE_LIMITS.ZIP_ENTRY_BYTES) {
	          throw new Error(`"${entry.name}" ist entpackt zu groß. Maximal erlaubt: ${formatBytes(FILE_LIMITS.ZIP_ENTRY_BYTES)}.`);
	        }
	        visualSignature = await createVisualSignature(bytes, name);
	      }
	      records.push({
	        id: index,
	        path: entry.name,
	        displayPath: stripRootPrefix(entry.name, rootPrefix),
	        name,
	        nameKey: normalizeNameKey(name),
	        size: knownSize ?? bytes?.byteLength ?? 0,
	        bytes,
	        visualSignature,
	      });
	    }

    return records;
  }

  async function handleFile(file) {
    const token = analysisToken + 1;
    analysisToken = token;
    revokeRecordObjectUrls(lastRecords);
    lastRecords = [];
    renderInitial();
    setFileSummary(file);

	    try {
	      await validateZipFile(file);
	      if (token !== analysisToken) return;
	      const records = await collectZipRecords(file, token);
      if (!records || token !== analysisToken) return;
      lastRecords = records;
      renderResultFromLastRecords();
    } catch (error) {
      if (token !== analysisToken) return;
      const message = error instanceof Error && error.message
        ? error.message
        : 'Die ZIP-Analyse ist fehlgeschlagen.';
      renderError(message);
    }
  }

  function getFilesFromEvent(event) {
    const files = event?.dataTransfer?.files || event?.target?.files;
    return files ? Array.from(files) : [];
  }

  function handleFiles(files) {
    if (tutorialDemoActive) return;
    if (!files.length) return;
    if (files.length > 1) {
      const message = 'Bitte genau eine ZIP-Datei auswählen.';
      revokeRecordObjectUrls(lastRecords);
      lastRecords = [];
      setFileSummary(null);
      renderError(message);
      return;
    }
    handleFile(files[0]);
  }

  async function openZipPicker() {
    if (tutorialDemoActive) return;
    if (typeof window.showOpenFilePicker !== 'function') {
      ui.zipInput?.click();
      return;
    }

    try {
      const handles = await window.showOpenFilePicker({
        id: 'duplicate-check-zip',
        multiple: false,
        startIn: 'downloads',
        types: [
          {
            description: 'ZIP-Dateien',
            accept: {
              'application/zip': ['.zip'],
            },
          },
        ],
      });
      const [handle] = handles;
      const file = await handle?.getFile?.();
      if (file) {
        handleFiles([file]);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      ui.zipInput?.click();
    }
  }

  function toggleDuplicateRule(rule) {
    if (!Object.prototype.hasOwnProperty.call(enabledRules, rule)) return;
    const activeRules = getEnabledRuleList();
    if (enabledRules[rule] && activeRules.length === 1) {
      syncRuleButtons();
      return;
    }
    enabledRules = {
      ...enabledRules,
      [rule]: !enabledRules[rule],
    };
    syncRuleButtons();
    if (lastRecords.length) {
      renderResultFromLastRecords();
      return;
    }
  }

  function bindEvents() {
    ui.tutorialButton?.addEventListener('click', notifyParentTutorialStartRequest);
    ui.ruleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        toggleDuplicateRule(button.dataset.duplicateRule);
      });
    });
    ui.zipDropZone?.addEventListener('click', () => {
      openZipPicker();
    });
    ui.zipDropZone?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openZipPicker();
    });
    ui.zipInput?.addEventListener('change', (event) => {
      handleFiles(getFilesFromEvent(event));
      if (ui.zipInput) {
        ui.zipInput.value = '';
      }
    });
    ['dragenter', 'dragover'].forEach((type) => {
      ui.zipDropZone?.addEventListener(type, (event) => {
        event.preventDefault();
        ui.zipDropZone?.classList.add('drag-over');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach((type) => {
      ui.zipDropZone?.addEventListener(type, () => {
        ui.zipDropZone?.classList.remove('drag-over');
      });
    });
    ui.zipDropZone?.addEventListener('drop', (event) => {
      event.preventDefault();
      handleFiles(getFilesFromEvent(event));
    });

    window.addEventListener('beforeunload', () => {
      revokeRecordObjectUrls(lastRecords);
    });
    window.addEventListener('message', handleParentMessage);
  }

  syncRuleButtons();
  renderInitial();
  bindBrowserContextMenuBlocker();
  bindEvents();

  return {
    activateTutorialDemo,
    cleanupTutorialDemo,
  };
}

installAppTooltips(document);
window.__teachhelperDuplicateCheckApp = createDuplicateCheckApp();
