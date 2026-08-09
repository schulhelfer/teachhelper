import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [storeSource, schoolDataSource, planningSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/school-data/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
]);

test('Termine ohne Unterricht clear subjects when created, updated, and normalized', () => {
  assert.match(storeSource, /const cleanSubject = Boolean\(noLesson\) \? "" : String\(subject \|\| ""\)\.trim\(\);/);
  assert.match(storeSource, /course\.subject = courseNoLesson\s*\? ""/);
  assert.match(storeSource, /course\.subject = isNoLesson \? "" : String\(course\.subject \|\| ""\);/);
  assert.match(schoolDataSource, /subject: noLesson \? '' : String\(item\.subject \|\| ''\),/);
});

test('Planung exposes no-lesson terms while omitting grade controls', () => {
  assert.match(planningSource, /const selectableCourses = courses;/);
  assert.ok(planningSource.includes('${course.noLesson ? "" : "<th>Noten</th>"}'));
  assert.match(planningSource, /const editable = !allCanceled;/);
  assert.match(planningSource, /disabled: !slotId \|\| isNoLesson/);
  assert.match(planningSource, /disabled: !editable \|\| isNoLesson/);
});
