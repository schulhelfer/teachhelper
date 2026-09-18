import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('das Textformat für Kompetenzerwartungen wird wie dokumentiert gelesen', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { parseCompetenceExpectationsTextBlock } = await import('/src/modules/grades/app.js?dom-test');

    const sample = [
      '- Grundlagen',
      '-- Logische Zeichen für Und, Oder, Implikation und Äquivalenz verwenden',
      '-- Mengenschreibweise (∈, =, ⊂, ∩, ∪, ∖) verwenden',
      '-- Zahlen ihren jeweiligen Zahlenmengen zuordnen',
      '-- Intervallschreibweise verwenden',
      '',
      '- Wiederholung',
      '-- Extremstellen bestimmen',
      '-- Gleichungen von Tangenten und Normalen bestimmen',
      '-- Wendestellen bestimmen',
      '',
    ].join('\n');

    const parsed = parseCompetenceExpectationsTextBlock(sample);
    const topicIds = parsed.items.map((item) => item.id);
    const competenceIds = parsed.items.flatMap((item) => item.competencies.map((entry) => entry.id));

    return {
      sample: {
        ok: parsed.ok,
        message: parsed.message,
        topics: parsed.items.map((item) => item.topic),
        competenceCounts: parsed.items.map((item) => item.competencies.length),
        unicodeCompetence: parsed.items[0]?.competencies[1]?.text,
        firstOfSecondTopic: parsed.items[1]?.competencies[0]?.text,
        uniqueTopicIds: new Set(topicIds).size === topicIds.length && topicIds.every(Boolean),
        uniqueCompetenceIds: new Set(competenceIds).size === competenceIds.length && competenceIds.every(Boolean),
      },
      crlfAndIndent: (() => {
        const value = parseCompetenceExpectationsTextBlock('- Thema\r\n   -- Kompetenz\r\n');
        return {
          ok: value.ok,
          topics: value.items.map((item) => item.topic),
          competencies: value.items[0]?.competencies.map((entry) => entry.text),
        };
      })(),
      strayLine: (() => {
        const value = parseCompetenceExpectationsTextBlock('Titel der Datei\n- Thema\n-- Kompetenz\n');
        return { ok: value.ok, topics: value.items.map((item) => item.topic) };
      })(),
      competenceWithoutTopic: (() => {
        const value = parseCompetenceExpectationsTextBlock('-- Kompetenz ohne Thema\n');
        return { ok: value.ok, message: value.message, itemCount: value.items.length };
      })(),
      trailingEmptyTopic: (() => {
        const value = parseCompetenceExpectationsTextBlock('- Thema ohne Kompetenz\n');
        return { ok: value.ok, message: value.message };
      })(),
      emptyTopicBetween: (() => {
        const value = parseCompetenceExpectationsTextBlock('- Leeres Thema\n- Thema\n-- Kompetenz\n');
        return { ok: value.ok, message: value.message };
      })(),
      blankInputs: ['', '   \n\n', undefined].map((value) => {
        const parsedValue = parseCompetenceExpectationsTextBlock(value);
        return { ok: parsedValue.ok, message: parsedValue.message };
      }),
    };
  });

  assert.equal(result.sample.ok, true);
  assert.equal(result.sample.message, '');
  assert.deepEqual(result.sample.topics, ['Grundlagen', 'Wiederholung']);
  assert.deepEqual(result.sample.competenceCounts, [4, 3]);
  assert.equal(result.sample.unicodeCompetence, 'Mengenschreibweise (∈, =, ⊂, ∩, ∪, ∖) verwenden');
  assert.equal(result.sample.firstOfSecondTopic, 'Extremstellen bestimmen');
  assert.equal(result.sample.uniqueTopicIds, true);
  assert.equal(result.sample.uniqueCompetenceIds, true);

  assert.equal(result.crlfAndIndent.ok, true);
  assert.deepEqual(result.crlfAndIndent.topics, ['Thema']);
  assert.deepEqual(result.crlfAndIndent.competencies, ['Kompetenz']);

  assert.equal(result.strayLine.ok, true);
  assert.deepEqual(result.strayLine.topics, ['Thema']);

  assert.equal(result.competenceWithoutTopic.ok, false);
  assert.equal(result.competenceWithoutTopic.itemCount, 0);
  assert.match(result.competenceWithoutTopic.message, /Kompetenz ohne vorheriges Thema/);

  assert.equal(result.trailingEmptyTopic.ok, false);
  assert.match(result.trailingEmptyTopic.message, /Thema ohne Kompetenz/);

  assert.equal(result.emptyTopicBetween.ok, false);
  assert.match(result.emptyTopicBetween.message, /Thema ohne Kompetenz/);

  for (const entry of result.blankInputs) {
    assert.equal(entry.ok, false);
    assert.match(entry.message, /keine gültigen Themen/);
  }
});
