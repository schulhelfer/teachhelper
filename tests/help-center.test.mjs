import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const helpCenterSource = await readFile(new URL('../src/app/help-center.js', import.meta.url), 'utf8');
const {
  HELP_ARTICLES,
  normalizeHelpSearch,
  resolveHelpSearchTerms,
  searchHelpArticles,
} = await import(`data:text/javascript;base64,${Buffer.from(helpCenterSource).toString('base64')}`);

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
  assert.ok(HELP_ARTICLES.length >= 40);
  assert.deepEqual(representedModules, expectedModules);
  HELP_ARTICLES.forEach((article) => {
    assert.ok(article.id);
    assert.ok(article.title);
    assert.ok(article.summary);
    assert.ok(article.keywords.length >= 2);
    assert.ok(article.sections.length >= 2);
    assert.ok(article.steps.length >= 3);
    assert.ok(article.relatedArticleIds.length <= 3);
    assert.ok(!article.relatedArticleIds.includes(article.id));
    article.relatedArticleIds.forEach((relatedId) => {
      assert.ok(HELP_ARTICLES.some((candidate) => candidate.id === relatedId));
    });
    article.sections.forEach((section) => assert.ok(section.title && section.text));
  });
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

test('alle Rettungsringe leiten zur gemeinsamen Hilfeauswahl weiter', async () => {
  const [mainSource, domSource, firstRunSource, indexSource, ...moduleSources] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/dom.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/first-run-tutorial.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
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
