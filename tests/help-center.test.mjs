import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const helpCenterSource = await readFile(new URL('../src/app/help-center.js', import.meta.url), 'utf8');
const {
  HELP_ARTICLES,
  collectHighlightTerms,
  findHighlightRanges,
  normalizeHelpSearch,
  normalizeHelpSearchWithMap,
  resolveRelatedArticles,
  resolveHelpSearchTerms,
  searchHelpArticles,
} = await import(`data:text/javascript;base64,${Buffer.from(helpCenterSource.replace(/^import[^\n]+\n/, '')).toString('base64')}`);
const helpVisualSource = await readFile(new URL('../src/app/help-visuals.js', import.meta.url), 'utf8');
const helpPreviewSource = await readFile(new URL('../src/app/help-preview.js', import.meta.url), 'utf8');
const previewBootstrapSource = await readFile(new URL('../src/app/bootstrap.js', import.meta.url), 'utf8');
const previewMainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const firstRunTutorialSource = await readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8');
const moduleFrameBridgeSource = await readFile(new URL('../src/shared/module-frame-bridge.js', import.meta.url), 'utf8');
const shellCssSource = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appTooltipsSource = await readFile(new URL('../src/shared/app-tooltips.js', import.meta.url), 'utf8');
const {
  HELP_PREVIEW_CONFIGS,
  getHelpPreviewConfig,
  readHelpPreviewRequest,
} = await import(`data:text/javascript;base64,${Buffer.from(helpPreviewSource).toString('base64')}`);

const expectedModules = new Set([
  'allgemein',
  'grades',
  'planning',
  'seatplan',
  'name-learning',
  'groups',
  'random-picker',
  'merger',
  'duplicate-check',
  'work-phase',
  'qr',
]);

test('der Hilfekatalog deckt alle Module mit ausführlichen Artikeln ab', () => {
  const representedModules = new Set(HELP_ARTICLES.map((article) => article.module));
  assert.ok(HELP_ARTICLES.length >= 63);
  assert.deepEqual(representedModules, expectedModules);
  HELP_ARTICLES.forEach((article) => {
    assert.ok(article.id);
    assert.ok(article.title);
    assert.ok(article.summary);
    assert.ok(article.keywords.length >= 2);
    assert.ok(article.tags.length >= 3);
    assert.ok(article.sections.length >= 3);
    assert.ok(article.steps.length >= 3);
    const preview = getHelpPreviewConfig(article.id);
    assert.ok(preview, `${article.id} braucht eine echte PWA-Vorschau`);
    assert.equal(preview.frames.length, 3);
    preview.frames.forEach((frame) => assert.ok(frame.stepTitle && frame.label));
    assert.ok(article.relatedArticleIds.length <= 3);
    assert.ok(!article.relatedArticleIds.includes(article.id));
    article.relatedArticleIds.forEach((relatedId) => {
      assert.ok(HELP_ARTICLES.some((candidate) => candidate.id === relatedId));
    });
    article.sections.forEach((section) => assert.ok(section.title && section.text));
  });
});

test('unsichtbare Themen-Tags verbessern Suche und ergänzen passende Verknüpfungen', () => {
  assert.ok(searchHelpArticles('linksicherheit').some((article) => article.id === 'qr-result-safety'));
  assert.ok(searchHelpArticles('erwartungshorizont').some((article) => article.id === 'grades-scales-expectations'));
  const article = HELP_ARTICLES.find((candidate) => candidate.id === 'data-backup');
  const related = resolveRelatedArticles(article);
  assert.ok(related.length <= 3);
  assert.deepEqual(related.slice(0, 2).map((candidate) => candidate.id), ['grades-protection', 'settings-theme']);
  assert.equal(helpCenterSource.includes('help-tag'), false, 'Tags dürfen keine sichtbare Filteroberfläche erzeugen');
});

test('dynamische Beispielansichten laden die echte PWA isoliert statt einer Symbolszene', () => {
  assert.match(helpVisualSource, /makeElement\(doc, 'figure'/);
  assert.match(helpVisualSource, /createElementNS/);
  assert.match(helpVisualSource, /createModuleFrame/);
  assert.match(helpVisualSource, /HELP_PREVIEW_FRAME_SANDBOX/);
  assert.match(moduleFrameBridgeSource, /HELP_PREVIEW_FRAME_SANDBOX = 'allow-scripts allow-same-origin'/);
  assert.match(helpVisualSource, /\.\.\/\.\.\/index\.html/);
  assert.match(helpVisualSource, /HELP_PREVIEW_COMMAND_EVENT/);
  assert.match(helpVisualSource, /HELP_PREVIEW_STATE_EVENT/);
  assert.match(helpVisualSource, /Animation pausieren/);
  assert.match(helpVisualSource, /help-visual-toolbar/);
  assert.match(helpVisualSource, /Erneut abspielen/);
  assert.match(helpVisualSource, /'⏸'/);
  assert.match(helpVisualSource, /'↺'/);
  assert.match(helpVisualSource, /canvas\.append\(stage, toolbar, status\)/);
  assert.match(helpVisualSource, /prefers-reduced-motion/);
  assert.doesNotMatch(helpVisualSource, /createElement\('img'\)|\.gif\b/i);
  assert.doesNotMatch(helpVisualSource, /renderSceneBody|HELP_VISUAL_SCENES|help-visual-preview/);
  assert.doesNotMatch(helpVisualSource, /Neutrale Tutorial-Beispieldaten|Markiert werden|Beispielansicht:/);
  assert.match(helpCenterSource, /createHelpVisual/);
  assert.match(helpCenterSource, /hasHelpPreview\(articleItem\.id\)/);
  assert.match(helpCenterSource, /resolveRelatedArticles\(articleItem\)/);
});

test('jede PWA-Vorschau ist artikelgenau und der URL-Modus akzeptiert nur konfigurierte Artikel', () => {
  assert.equal(Object.keys(HELP_PREVIEW_CONFIGS).length, HELP_ARTICLES.length);
  assert.equal(readHelpPreviewRequest({ search: '?help-preview=work-phase-presentation' })?.config.tab, 'work-phase');
  assert.equal(readHelpPreviewRequest({ search: '?help-preview=unbekannt' }), null);
  assert.match(helpPreviewSource, /HELP_PREVIEW_COMMAND_EVENT/);
  assert.match(helpPreviewSource, /HELP_PREVIEW_STATE_EVENT/);
});

test('der Vorschaumodus bleibt flüchtig, nicht bedienbar und ohne PWA-Nebeneffekte', () => {
  assert.match(previewBootstrapSource, /ephemeral: moduleWindowRequest\.isModuleWindow \|\| Boolean\(helpPreviewRequest\)/);
  assert.match(previewMainSource, /if \(!moduleWindowRequest\.isModuleWindow && !helpPreviewRequest\)/);
  assert.match(previewMainSource, /const serviceWorkerUpdates = helpPreviewRequest \? null/);
  assert.match(previewMainSource, /firstRunTutorial\.startPreview\(\)/);
  assert.match(previewMainSource, /firstRunTutorial\.showPreviewStep\(stepTitle\)/);
  assert.match(previewMainSource, /firstRunTutorial\.getPreviewTargetRect\(stepTitle\)/);
  assert.match(firstRunTutorialSource, /function getPreviewTargetRect\(stepTitle\)/);
  assert.match(shellCssSource, /#app\[data-help-preview='true'\] \{\s+pointer-events: none;/);
  assert.match(shellCssSource, /\.help-preview-frame \{[\s\S]*?pointer-events: none;/);
  assert.match(helpVisualSource, /sandbox: HELP_PREVIEW_FRAME_SANDBOX/);
  assert.match(moduleFrameBridgeSource, /function isHelpPreviewContext\(\)/);
  assert.match(moduleFrameBridgeSource, /return `\$\{sandboxTokens\} allow-same-origin`/);
  assert.doesNotMatch(helpVisualSource, /allow-downloads|allow-forms|allow-popups|allow-top-navigation/);
  assert.doesNotMatch(shellCssSource, /\.help-visual-app \{|\.help-visual-preview/);
});

test('die Artikelnavigation sitzt als Icon vor dem Schließen im Handbuchkopf', () => {
  assert.match(indexSource, /dialog-actions-top app-action-group[\s\S]*id="help-back"[\s\S]*id="help-close"/);
  assert.match(indexSource, /id="help-back"[^>]*aria-label="Zurück zu den Treffern"/);
  assert.doesNotMatch(indexSource, /← Zurück zu den Treffern/);
  assert.match(helpCenterSource, /els\.helpBackButton\.focus\(\)/);
});

test('ein programmatischer Fokus löst keinen Tooltip aus', () => {
  assert.match(appTooltipsSource, /function handleFocusIn\(event\) \{[\s\S]*?anchor\.matches\(":focus-visible"\)/);
  assert.match(helpCenterSource, /function openArticle\(id, \{ focusTarget = 'title' \} = \{\}\)/);
});

test('die Handbuchsuche sitzt in gleichbleibender Breite im Dialogkopf', () => {
  assert.match(indexSource, /dialog-header help-dialog-header[\s\S]*help-search-wrap[\s\S]*dialog-actions-top/);
  assert.match(shellCssSource, /\.help-search-wrap \{[\s\S]*?flex: 1 1 auto;/);
  assert.doesNotMatch(shellCssSource, /\.help-search-wrap\.is-collapsed/);
  assert.doesNotMatch(helpCenterSource, /is-collapsed/);
  assert.match(helpCenterSource, /if \(selectedArticleId\) showResults\(\{ render: false \}\);/);
});

test('der Handbuchdialog nutzt den gemeinsamen Griff und behält seine feste Höhe', () => {
  assert.match(indexSource, /id="help-dialog"[^>]*data-dialog-resize-height="fixed"/);
  assert.match(shellCssSource, /\.help-dialog \{[\s\S]*?position: relative;/);
  assert.match(shellCssSource, /\.help-dialog \{[\s\S]*?overflow: hidden;/);
  assert.doesNotMatch(indexSource, /id="help-resize"/);
  assert.doesNotMatch(shellCssSource, /help-dialog-resize/);
  assert.doesNotMatch(helpCenterSource, /startDialogResize|handleResizeKeys|applyDialogSize/);
});

test('das Handbuch bleibt frei von Textmarkierung, nur die Suche ist bedienbar', () => {
  assert.match(shellCssSource, /\.help-dialog,\s*\.help-dialog \* \{[\s\S]*?user-select: none;/);
  assert.match(shellCssSource, /\.help-dialog \.help-search \{[\s\S]*?user-select: text;/);
});

test('der Artikel scrollt sichtbar und startet bei jedem Wechsel oben', () => {
  assert.match(helpCenterSource, /els\.helpDetail\.scrollTop = 0;/);
  assert.match(shellCssSource, /\.help-dialog \.help-detail \{[\s\S]*?scrollbar-width: thin;/);
  assert.match(shellCssSource, /\.help-dialog \.help-detail::-webkit-scrollbar \{[\s\S]*?display: block;/);
});

test('das Praxis-Handbuch enthält Treffer für zentrale Abläufe aller Module', () => {
  const expectedMatches = {
    datenbankdatei: 'database-setup',
    gewichtung: 'grades-structure',
    archivieren: 'planning-archive',
    raster: 'seatplan-room',
    portraets: 'name-learning-photos',
    namensliste: 'groups-import',
    pickerstand: 'picker-storage',
    seitengruppe: 'pdf-split',
    bildaehnlichkeit: 'duplicate-rules',
    warnsignal: 'work-phase-monitor',
    zwischenablage: 'qr-image-scan',
  };
  Object.entries(expectedMatches).forEach(([query, articleId]) => {
    assert.ok(searchHelpArticles(query).some((article) => article.id === articleId), `${query} findet ${articleId}`);
  });
});

test('die Hilfesuche normalisiert Großschreibung und deutsche Sonderzeichen', () => {
  assert.equal(normalizeHelpSearch('  GRÖẞE & Ähnlich  '), 'grosse ahnlich');
  assert.ok(searchHelpArticles('SITZPLÄNE').some((article) => article.id === 'seatplan-create'));
  assert.ok(searchHelpArticles('aehnlich').some((article) => article.id === 'duplicate-check'));
});

test('die Hilfesuche durchsucht Schlüsselwörter und Volltext mehrwortig', () => {
  assert.ok(searchHelpArticles('passwort schutz').some((article) => article.id === 'grades-protection'));
  assert.ok(searchHelpArticles('mikrofon absprache').some((article) => article.id === 'work-phase'));
  assert.deepEqual(searchHelpArticles('nicht vorhandenes thema'), []);
});

test('die Hilfesuche berücksichtigt gepflegte Synonyme und kleine eindeutige Tippfehler', () => {
  assert.ok(searchHelpArticles('backup').some((article) => article.id === 'data-backup'));
  assert.ok(searchHelpArticles('sitzordnung').some((article) => article.id === 'seatplan-create'));
  assert.ok(searchHelpArticles('sitzordnug').some((article) => article.id === 'seatplan-suggestions'));
  assert.equal(resolveHelpSearchTerms('xylophon')[0].kind, 'unknown');
});

test('Schrittlisten und verwandte Artikel werden im Detailartikel gerendert', () => {
  assert.match(helpCenterSource, /createElement\('ol'\)/);
  assert.match(helpCenterSource, /Schritt für Schritt/);
  assert.match(helpCenterSource, /Das könnte dich auch interessieren/);
  assert.match(helpCenterSource, /help-related-button/);
});

test('die Normalisierung mit Indexkarte bleibt deckungsgleich zur Suchnormalisierung', () => {
  const samples = HELP_ARTICLES.flatMap((article) => [
    article.title,
    article.summary,
    ...article.sections.flatMap((section) => [section.title, section.text]),
    ...article.steps,
  ]);
  samples.forEach((text) => {
    const { normalized, map } = normalizeHelpSearchWithMap(text);
    assert.equal(normalized, normalizeHelpSearch(text));
    assert.equal(map.length, normalized.length + 1);
  });
});

test('die Trefferhervorhebung findet Begriffe trotz Umlauten und Eszett', () => {
  const umlautText = 'Sitzpläne im Raum';
  const [umlautRange, ...umlautRest] = findHighlightRanges(umlautText, ['sitzplan']);
  assert.deepEqual(umlautRest, []);
  assert.equal(umlautText.slice(umlautRange.start, umlautRange.end), 'Sitzplän');

  const eszettText = 'Größe der Gruppe';
  const [eszettRange] = findHighlightRanges(eszettText, ['grosse']);
  assert.equal(eszettText.slice(eszettRange.start, eszettRange.end), 'Größe');
});

test('die Trefferhervorhebung markiert nur Wortanfänge und führt Überlappungen zusammen', () => {
  assert.deepEqual(findHighlightRanges('Sortierung', ['ort']), []);
  const text = 'Sitzplan anlegen';
  const merged = findHighlightRanges(text, ['sitzplan', 'sitz']);
  assert.equal(merged.length, 1);
  assert.equal(text.slice(merged[0].start, merged[0].end), 'Sitzplan');
  assert.deepEqual(findHighlightRanges('Beliebiger Text', []), []);
});

test('die Trefferhervorhebung verwendet nur die tatsächlich eingegebenen Suchbegriffe', () => {
  assert.deepEqual(collectHighlightTerms('backup'), ['backup']);
  assert.deepEqual(collectHighlightTerms('sitzordnug'), ['sitzordnug']);
  assert.deepEqual(collectHighlightTerms('prüfung Prüfung'), ['prufung']);
  assert.deepEqual(collectHighlightTerms('xylophon'), ['xylophon']);
  assert.deepEqual(collectHighlightTerms(''), []);
});

test('die Suchbegriffe werden als Textmarker in Treffern und Artikeln gerendert', () => {
  assert.match(helpCenterSource, /createElement\('mark'\)/);
  assert.match(helpCenterSource, /help-mark/);
  assert.match(helpCenterSource, /applyHighlight\(title, articleItem\.title, terms\)/);
  assert.match(helpCenterSource, /applyHighlight\(copy, section\.text, terms\)/);
});

test('alle Rettungsringe leiten zur gemeinsamen Hilfeauswahl weiter', async () => {
  const [mainSource, domSource, firstRunSource, ...moduleSources] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/dom.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
    ...[
      'qr/app.js',
      'duplicate-check/app.js',
      'merger/app.js',
      'seatplan/app.js',
      'name-learning/app.js',
      'planning/app.js',
      'grades/app.js',
    ].map((path) => readFile(new URL(`../src/modules/${path}`, import.meta.url), 'utf8')),
  ]);

  assert.match(mainSource, /createHelpCenter/);
  assert.match(mainSource, /classroom:help-entry-request/);
  assert.match(mainSource, /onEntryRequest: openHelpEntry/);
  assert.match(firstRunSource, /onEntryRequest = null/);
  assert.match(firstRunSource, /onEntryRequest\(\)/);
  assert.match(domSource, /helpEntryDialog/);
  assert.match(domSource, /helpSearch/);
  assert.match(indexSource, /id="help-entry-dialog"/);
  assert.match(indexSource, /id="help-dialog"/);
  moduleSources.forEach((source) => assert.match(source, /classroom:help-entry-request/));
});
