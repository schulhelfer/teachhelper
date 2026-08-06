import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

function methodSource(name, nextName) {
  const start = appSource.indexOf(`  ${name}(`);
  const end = appSource.indexOf(`\n  ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} must be present`);
  return appSource.slice(start, end);
}

function userDataHtmlAssignments(source) {
  return source
    .split('\n')
    .filter((line) => /\.innerHTML\s*=/.test(line))
    .filter((line) => !/\.innerHTML\s*=\s*['"]{2};?\s*$/.test(line));
}

test('imported/persisted grade text is rendered with DOM properties, not parsed HTML', () => {
  const renderers = [
    methodSource('renderGradeAccommodationDialog', 'addGradeAccommodationDialogCard'),
    methodSource('addCompetenceExpectationsTopic', 'addCompetenceExpectationsCompetence'),
    methodSource('addCompetenceExpectationsCompetence', 'ensureCompetenceExpectationsTrailingInputs'),
    methodSource('renderGradeTaskCompetenceDialogOptions', 'syncGradeTaskCompetenceDialogSelection'),
    methodSource('renderGradeSimulationDialogControls', 'readGradeSimulationStateFromControls'),
    methodSource('renderGradeSimulationResults', 'togglePrivacyFocusedGradeStudent'),
    methodSource('renderGradeOccurrenceCategorySuggestions', 'renderGradeOccurrenceCategoriesSettingsSection'),
    methodSource('renderGradeOccurrenceCategoriesSettingsSection', 'addGradeOccurrenceCategoryDraft'),
  ];

  renderers.forEach((renderer) => {
    assert.deepEqual(userDataHtmlAssignments(renderer), []);
    assert.match(renderer, /\.textContent\s*=|\.value\s*=/);
  });

  assert.match(appSource, /portal\.replaceChildren\(\.\.\.\[\.\.\.source\.childNodes\].map\(\(node\) => node\.cloneNode\(true\)\)\);/);
  assert.doesNotMatch(methodSource('showGradeTestScaleTooltip', 'hideGradeTestScaleTooltip'), /innerHTML/);
});

test('student names are inserted as literal text nodes', () => {
  const start = appSource.indexOf('function createGradeStudentNameElement(');
  const end = appSource.indexOf('\nfunction buildGradePeriodKey(', start);
  const helper = appSource.slice(start, end);
  const payload = '<img src=x onerror=alert(1)>"&\'';

  assert.match(helper, /document\.createTextNode\(String\(studentName \|\| ""\)\)/);
  assert.match(helper, /node\.dataset\.studentLabel = String\(studentName \|\| ""\)/);
  assert.doesNotMatch(helper, /innerHTML/);
  const document = {
    createElement(tagName) {
      return {
        tagName,
        className: '',
        dataset: {},
        children: [],
        attributes: new Map(),
        append(...children) {
          this.children.push(...children);
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
      };
    },
    createTextNode(textContent) {
      return { type: 'text', textContent };
    },
  };
  const createStudentName = new Function(
    'document',
    'normalizeGradePerformanceFlair',
    `${helper}\nreturn createGradeStudentNameElement;`,
  )(document, (value) => String(value || ''));
  const node = createStudentName({ id: 7 }, payload);

  assert.equal(node.dataset.studentLabel, payload);
  assert.deepEqual(node.children, [{ type: 'text', textContent: payload }]);
});
