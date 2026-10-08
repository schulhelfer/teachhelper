import { FILE_LIMITS, FILE_TIMEOUTS, fitCanvasSize, withTimeout } from './file-guards.js';
import { prepareDocxTemplateInWorker } from './docx-worker-client.js';
import { ensurePdfLibLoaded } from './pdf-vendor.js';

const JSZIP_URL = new URL('../vendor/jszip/3.10.2/jszip.min.js', import.meta.url);
const DOCX_PREVIEW_URL = new URL('../vendor/docx-preview/0.4.1/docx-preview.min.js', import.meta.url);
const HTML_TO_IMAGE_URL = new URL('../vendor/html-to-image/1.11.13/html-to-image.js', import.meta.url);
const PIXELS_TO_POINTS = 72 / 96;
const PDF_RENDER_TIMEOUT_MESSAGE = 'Die PDF-Konvertierung hat zu lange gedauert. Bitte erneut versuchen oder DOCX auswählen.';
const OVERSIZED_BLOCK_MESSAGE = 'Ein Inhalt der Wordvorlage passt nicht auf eine PDF-Seite. Bitte den Inhalt kürzen oder DOCX auswählen.';
let librariesPromise = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => finish(new Error('Die PDF-Konvertierung konnte nicht geladen werden.')), FILE_TIMEOUTS.READ_MS);
    const finish = (error) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (error) reject(error);
      else resolve();
    };
    script.src = url.href;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Die PDF-Konvertierung konnte nicht geladen werden.'));
    document.head.append(script);
  });
}

async function loadLibraries() {
  if (!librariesPromise) {
    librariesPromise = (async () => {
      if (!globalThis.JSZip) await loadScript(JSZIP_URL);
      await Promise.all([
        globalThis.docx?.renderAsync ? null : loadScript(DOCX_PREVIEW_URL),
        globalThis.htmlToImage?.toCanvas ? null : loadScript(HTML_TO_IMAGE_URL),
        ensurePdfLibLoaded(),
      ]);
      if (!globalThis.docx?.renderAsync || !globalThis.htmlToImage?.toCanvas) {
        throw new Error('Die PDF-Konvertierung konnte nicht geladen werden.');
      }
      return { docx: globalThis.docx, htmlToImage: globalThis.htmlToImage, PDFLib: globalThis.PDFLib };
    })().catch((error) => {
      librariesPromise = null;
      throw error;
    });
  }
  return librariesPromise;
}

function createRenderArea() {
  const host = document.createElement('div');
  host.dataset.docxPdfRender = '1';
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.pointerEvents = 'none';
  const root = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  return { host, root };
}

function applyDocumentStyles(root, styles) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync([...styles.querySelectorAll('style')].map((style) => style.textContent).join('\n') + `
    :host { all: initial; color: black; color-scheme: light; }
    .ewh-pdf-wrapper { display: block; padding: 0; background: white; }
    section.ewh-pdf { margin: 0; box-shadow: none; background: white; overflow: visible; }
  `);
  root.adoptedStyleSheets = [sheet];
}

function blockBottom(block) {
  const margin = Math.max(0, Number.parseFloat(getComputedStyle(block).marginBottom) || 0);
  return block.getBoundingClientRect().bottom + margin;
}

function createPage(source, wrapper, height) {
  const page = source.cloneNode(false);
  page.style.height = `${height}px`;
  page.style.minHeight = `${height}px`;
  const headers = [...source.children].filter((child) => child.tagName === 'HEADER');
  const footers = [...source.children].filter((child) => child.tagName === 'FOOTER');
  page.append(...headers.map((header) => header.cloneNode(true)));
  const article = [...source.children].find((child) => child.tagName === 'ARTICLE')?.cloneNode(false)
    || document.createElement('article');
  page.append(article, ...footers.map((footer) => footer.cloneNode(true)));
  wrapper.append(page);
  const footer = [...page.children].find((child) => child.tagName === 'FOOTER');
  const rect = page.getBoundingClientRect();
  const bottom = footer
    ? footer.getBoundingClientRect().top
    : rect.bottom - (Number.parseFloat(getComputedStyle(page).paddingBottom) || 0);
  if (bottom <= article.getBoundingClientRect().top) throw new Error(OVERSIZED_BLOCK_MESSAGE);
  return { page, article, bottom, hasContent: false };
}

function createTableFragment(table, headerRows) {
  const fragment = table.cloneNode(false);
  for (const child of table.children) {
    if (child.tagName === 'COLGROUP' || child.tagName === 'CAPTION') fragment.append(child.cloneNode(true));
  }
  const body = document.createElement('tbody');
  body.append(...headerRows.map((row) => row.cloneNode(true)));
  fragment.append(body);
  return { fragment, body };
}

function getRepeatedTableHeaders(table) {
  const rows = [...table.rows];
  const firstRow = rows[0];
  if (!firstRow) return [];
  const headers = [...firstRow.cells].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim());
  if (headers.includes('Nr.') && headers.includes('Erwartete Prüfungsleistungen')) return [firstRow];
  return rows.filter((row) => row.parentElement.tagName === 'THEAD');
}

function paginateSections(container, assertActive) {
  const sections = [...container.querySelectorAll('section.ewh-pdf')];
  if (!sections.length) throw new Error('Die Wordvorlage enthält keine darstellbaren PDF-Seiten.');
  const pages = [];
  for (const source of sections) {
    assertActive();
    const style = getComputedStyle(source);
    const height = Number.parseFloat(style.minHeight);
    const width = source.getBoundingClientRect().width;
    if (!(height > 0 && width > 0)) throw new Error('Das Seitenformat der Wordvorlage konnte nicht gelesen werden.');
    const wrapper = source.parentElement;
    let current;
    const nextPage = () => {
      if (pages.length >= FILE_LIMITS.PDF_MAX_PAGES) throw new Error('Die Wordvorlage enthält zu viele PDF-Seiten.');
      current = createPage(source, wrapper, height);
      pages.push({ element: current.page, width, height });
    };
    nextPage();
    const fits = (block) => blockBottom(block) <= current.bottom + 0.5;
    const blocks = [...source.children].flatMap((child) => (
      child.tagName === 'ARTICLE' ? [...child.children] : ['HEADER', 'FOOTER'].includes(child.tagName) ? [] : [child]
    ));
    for (const block of blocks) {
      assertActive();
      if (block.tagName === 'TABLE') {
        const headerRows = getRepeatedTableHeaders(block);
        const rows = [...block.rows].filter((row) => !headerRows.includes(row));
        let tablePart = createTableFragment(block, headerRows);
        current.article.append(tablePart.fragment);
        let hasRows = false;
        for (const row of rows) {
          const clone = row.cloneNode(true);
          tablePart.body.append(clone);
          if (!fits(tablePart.fragment)) {
            clone.remove();
            if (!hasRows) tablePart.fragment.remove();
            if (!current.hasContent) throw new Error(OVERSIZED_BLOCK_MESSAGE);
            nextPage();
            tablePart = createTableFragment(block, headerRows);
            tablePart.body.append(clone);
            current.article.append(tablePart.fragment);
            hasRows = false;
            if (!fits(tablePart.fragment)) throw new Error(OVERSIZED_BLOCK_MESSAGE);
          }
          current.hasContent = true;
          hasRows = true;
        }
        if (!rows.length && !fits(tablePart.fragment)) throw new Error(OVERSIZED_BLOCK_MESSAGE);
      } else {
        let article = current.article;
        const clone = block.cloneNode(true);
        article.append(clone);
        if (!fits(clone)) {
          clone.remove();
          if (!current.hasContent) throw new Error(OVERSIZED_BLOCK_MESSAGE);
          nextPage();
          article = current.article;
          article.append(clone);
          if (!fits(clone)) throw new Error(OVERSIZED_BLOCK_MESSAGE);
        }
        current.hasContent = true;
      }
    }
    source.remove();
  }
  return pages;
}

async function waitForImages(root) {
  await Promise.all([...root.querySelectorAll('img')].map(async (image) => {
    if (!image.src.startsWith('data:')) throw new Error('Ein Bild der Wordvorlage ist nicht lokal verfügbar.');
    await image.decode();
    if (!image.naturalWidth) throw new Error('Ein Bild der Wordvorlage konnte nicht dargestellt werden.');
  }));
}

function normalizeImplicitMathDegrees(wordDocument) {
  const visit = (element) => {
    if (!element) return;
    if (element.type === 'mmlRadical' && !element.children?.some((child) => child.type === 'mmlDegree')) {
      element.props = { ...element.props, hideDegree: true };
    }
    element.children?.forEach(visit);
  };
  wordDocument.parts.forEach((part) => visit(part.body || part.rootElement));
}

export async function convertDocxToPdfBytes(docxBytes, { signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const assertActive = () => controller.signal.throwIfAborted();
  let area;
  let canvas;
  try {
    return await withTimeout(async () => {
      assertActive();
      await prepareDocxTemplateInWorker(docxBytes, { signal: controller.signal });
      const { docx, htmlToImage, PDFLib } = await loadLibraries();
      assertActive();
      area = createRenderArea();
      const content = document.createElement('div');
      const styles = document.createElement('div');
      const renderOptions = {
        className: 'ewh-pdf',
        useBase64URL: true,
        ignoreFonts: true,
        ignoreLastRenderedPageBreak: true,
        renderAltChunks: false,
        renderComments: false,
      };
      const wordDocument = await docx.parseAsync(docxBytes, renderOptions);
      normalizeImplicitMathDegrees(wordDocument);
      const nodes = await docx.renderDocument(wordDocument, renderOptions);
      for (const node of nodes) (node.nodeName === 'STYLE' ? styles : content).append(node);
      assertActive();
      applyDocumentStyles(area.root, styles);
      area.root.append(content);
      await document.fonts.ready;
      await waitForImages(area.root);
      assertActive();
      for (const element of content.querySelectorAll('*')) {
        if (element.style) element.style.fontSize = getComputedStyle(element).fontSize;
      }
      const pages = paginateSections(content, assertActive);
      await waitForImages(area.root);
      const pdf = await PDFLib.PDFDocument.create();
      const includeStyleProperties = [...getComputedStyle(document.documentElement)].filter((property) => (
        property !== 'font-size'
      ));
      for (const page of pages) {
        assertActive();
        const bounds = fitCanvasSize(page.width * 2, page.height * 2);
        const nextCanvas = await htmlToImage.toCanvas(page.element, {
          backgroundColor: '#ffffff',
          pixelRatio: Math.min(bounds.width / page.width, bounds.height / page.height),
          width: page.width,
          height: page.height,
          skipFonts: true,
          includeStyleProperties,
        });
        if (controller.signal.aborted) {
          nextCanvas.width = 0;
          nextCanvas.height = 0;
        }
        canvas = nextCanvas;
        assertActive();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Eine PDF-Seite konnte nicht erzeugt werden.');
        const image = await pdf.embedPng(await blob.arrayBuffer());
        const outputPage = pdf.addPage([page.width * PIXELS_TO_POINTS, page.height * PIXELS_TO_POINTS]);
        outputPage.drawImage(image, { x: 0, y: 0, width: outputPage.getWidth(), height: outputPage.getHeight() });
        canvas.width = 0;
        canvas.height = 0;
        canvas = null;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assertActive();
      return pdf.save();
    }, FILE_TIMEOUTS.PDF_OPERATION_MS, PDF_RENDER_TIMEOUT_MESSAGE, { signal: controller.signal });
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', abort);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    if (area) {
      area.root.adoptedStyleSheets = [];
      area.host.remove();
    }
  }
}
