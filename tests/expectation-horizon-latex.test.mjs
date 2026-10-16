import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cleanExpectationHorizonLatexTask } from '../src/modules/grades/expectation-horizon-latex.js';

function plainText(result) {
  return result.runs.map((run) => run.text).join('');
}

function runsContaining(result, pattern) {
  return result.runs.filter((run) => pattern.test(run.text));
}

test('lsg command is removed together with nested arguments when solutions are off', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Berechne die Fläche. \\lsg{Lösung mit $x^2$ und {Klammern}} Begründe kurz. \\lsg[opt]{Weitere Lösung}'
  );
  const text = plainText(result);
  assert.match(text, /Berechne die Fläche\./);
  assert.match(text, /Begründe kurz\./);
  assert.doesNotMatch(text, /Lösung|Klammern|opt|x\^2/);
  assert.ok(result.runs.every((run) => !run.math));
});

test('lsg environment is removed when solutions are off', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Gib an.\n\\begin{lsg}\nGeheime Lösung\n\\end{lsg}\nFertig.',
    { includeSolutions: false }
  );
  const text = plainText(result);
  assert.match(text, /Gib an\./);
  assert.match(text, /Fertig\./);
  assert.doesNotMatch(text, /Geheime Lösung/);
});

test('task text is not italic when solutions are off', () => {
  const result = cleanExpectationHorizonLatexTask('Bestimme \\textbf{alle} Nullstellen von $f$.');
  assert.ok(result.runs.length > 0);
  assert.ok(result.runs.every((run) => run.italic === false));
  assert.equal(plainText(result), 'Bestimme alle Nullstellen von f.');
});

test('tasks become hyphen bullets and formulas stay math runs', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Untersuche $f(x)=x^2$.\n\\begin{tasks}\n\\task Skizziere den Graphen.\n\\task Bestimme die Nullstellen. \\lsg{$x=0$}\n\\end{tasks}'
  );
  const mathRuns = result.runs.filter((run) => run.math);
  assert.deepEqual(mathRuns.map((run) => run.text), ['f(x)=x^2']);
  const bulletRuns = result.runs.filter((run) => run.list === 'hyphenBullet');
  assert.deepEqual(bulletRuns.map((run) => run.text.trim()), ['Skizziere den Graphen.', 'Bestimme die Nullstellen.']);
});

test('lsg command content becomes a non-italic solution paragraph when solutions are on', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Berechne die Fläche. \\lsg{Lösung mit $x^2$ und {Klammern}}',
    { includeSolutions: true }
  );
  const [taskRun] = runsContaining(result, /Berechne die Fläche/);
  assert.equal(taskRun.italic, true);
  const [solutionRun] = runsContaining(result, /Lösung mit/);
  assert.equal(solutionRun.italic, false);
  assert.equal(solutionRun.paragraphBreak, true);
  assert.deepEqual(result.runs.filter((run) => run.math).map((run) => run.text), ['x^2']);
  assert.match(plainText(result), /und Klammern$/);
});

test('optional arguments around lsg are dropped when solutions are on', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Aufgabe. \\lsg[3cm] {Antwort}[1]',
    { includeSolutions: true }
  );
  assert.doesNotMatch(plainText(result), /3cm|\[1\]/);
  const [solutionRun] = runsContaining(result, /Antwort/);
  assert.equal(solutionRun.text.trim(), 'Antwort');
  assert.equal(solutionRun.italic, false);
});

test('lsg environment content is inserted as solution paragraph when solutions are on', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Gib an.\n\\begin{lsg}\nWeil \\textbf{so}.\n\\end{lsg}\nFertig.',
    { includeSolutions: true }
  );
  const [solutionRun] = runsContaining(result, /Weil so\./);
  assert.equal(solutionRun.italic, false);
  assert.equal(solutionRun.paragraphBreak, true);
  const [afterRun] = runsContaining(result, /Fertig\./);
  assert.equal(afterRun.italic, true);
  assert.equal(afterRun.paragraphBreak, true);
  assert.equal(runsContaining(result, /Gib an\./)[0].italic, true);
});

test('similarly named commands and marker characters are not treated as solutions', () => {
  const result = cleanExpectationHorizonLatexTask(
    'Text \\lsgfoo{x} weiter \uE000Kein Marker\uE001.',
    { includeSolutions: true }
  );
  assert.ok(result.runs.every((run) => run.italic === true && run.paragraphBreak === false));
  assert.equal(plainText(result), 'Text weiter Kein Marker.');
});

test('the dialog offers a default-on solutions toggle that reaches the LaTeX parser', async () => {
  const html = await readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8');
  assert.match(html, /id="expectation-horizon-latex-solutions-toggle"[^>]*\s+type="button" role="switch" aria-checked="true"/);
  const source = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
  assert.match(source, /extractExpectationHorizonLatexTaskEntries\(latexText, \{ includeSolutions \}\)/);
  assert.match(source, /cleanExpectationHorizonLatexTask\(buffer\.join\("\\n"\), \{ includeSolutions \}\)/);
  assert.match(source, /openExpectationHorizonDialog\(\) \{[\s\S]*?this\.expectationHorizonIncludeLatexSolutions = true;/);
});

function paragraphTexts(result) {
  const paragraphs = [];
  result.runs.forEach((run) => {
    if (run.paragraphBreak || !paragraphs.length) {
      paragraphs.push('');
    }
    paragraphs[paragraphs.length - 1] += run.text;
  });
  return paragraphs.map((text) => text.trim());
}

test('source line breaks, explicit LaTeX breaks and blank lines start new paragraphs', () => {
  for (const includeSolutions of [false, true]) {
    const result = cleanExpectationHorizonLatexTask(
      'Eins\\\\ Zwei\\\\[2mm]\nDrei\\newline Vier\\par Fünf\n\nSechs\nSieben\\\\\n\nAcht',
      { includeSolutions }
    );
    assert.deepEqual(paragraphTexts(result), ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht']);
  }
});

test('plain text lines after hyphen bullets inside lsg get their own paragraph', () => {
  const result = cleanExpectationHorizonLatexTask(
    [
      'Beschreiben Sie die Karikatur.',
      '\\lsg{',
      'Beschreibung:',
      '-\tGehirn ist an Ketten aufgehängt',
      '-\tA-Symbol mit Engelsflügeln und Schlüssel',
      'Aussage: ',
      '-\tReligionen können das freie Denken einschränken. ',
      '-\tAnarchie, Aufklärung oder Atheismus wirken befreiend.',
      '}',
    ].join('\n'),
    { includeSolutions: true }
  );
  assert.deepEqual(paragraphTexts(result), [
    'Beschreiben Sie die Karikatur.',
    'Beschreibung:',
    'Gehirn ist an Ketten aufgehängt',
    'A-Symbol mit Engelsflügeln und Schlüssel',
    'Aussage:',
    'Religionen können das freie Denken einschränken.',
    'Anarchie, Aufklärung oder Atheismus wirken befreiend.',
  ]);
  const [statementRun] = runsContaining(result, /^Aussage:/);
  assert.equal(statementRun.list, '');
  assert.equal(statementRun.paragraphBreak, true);
  assert.equal(runsContaining(result, /Gehirn/)[0].list, 'hyphenBullet');
  assert.equal(runsContaining(result, /Anarchie/)[0].list, 'hyphenBullet');
});

test('line breaks inside formulas stay part of the formula', () => {
  const result = cleanExpectationHorizonLatexTask('Vektor $\\begin{pmatrix}1\\\\2\\end{pmatrix}$ angeben.');
  assert.deepEqual(result.runs.filter((run) => run.math).map((run) => run.text), ['\\begin{pmatrix}1\\\\2\\end{pmatrix}']);
  assert.ok(result.runs.every((run) => run.paragraphBreak === false));
});
