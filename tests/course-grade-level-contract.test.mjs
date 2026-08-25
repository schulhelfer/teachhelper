import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [schoolDataSource, storeSource, runtimeSource, planningSource, planningHtml, gradesSource, gradesHtml] = await Promise.all([
  readFile(new URL('../src/shared/school-data/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
]);

const schoolData = await import(`data:text/javascript;base64,${Buffer.from(schoolDataSource).toString('base64')}`);

test('Kursjahrgänge werden für neue und alte Datenbanken sicher normalisiert', () => {
  const normalized = schoolData.normalizePublicSchoolData({
    courses: [
      { id: 1, schoolYearId: 1, name: 'Altbestand' },
      { id: 2, schoolYearId: 1, name: '8a', gradeLevel: '8' },
      { id: 3, schoolYearId: 1, name: 'Ungültig', gradeLevel: 14 },
      { id: 4, schoolYearId: 1, name: 'Termin', gradeLevel: 11, noLesson: true },
    ],
  });

  assert.deepEqual(schoolData.COURSE_GRADE_LEVELS, [5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(normalized.courses[0].gradeLevel, null);
  assert.equal(normalized.courses[1].gradeLevel, 8);
  assert.equal(normalized.courses[2].gradeLevel, null);
  assert.equal(normalized.courses[3].gradeLevel, null);
  assert.equal(schoolData.normalizeCourseGradeLevel(5), 5);
  assert.equal(schoolData.normalizeCourseGradeLevel(13), 13);
  assert.equal(schoolData.normalizeCourseGradeLevel(4), null);
  assert.equal(schoolData.normalizeCourseGradeLevel(13.5), null);
});

test('Store und Workspace speichern den Jahrgang und leeren ihn für Termine ohne Unterricht', () => {
  assert.match(storeSource, /createCourse\([^\n]*subject = "", gradeLevel = null\)/);
  assert.match(storeSource, /updateCourse\([^\n]*subject = undefined, gradeLevel = undefined\)/);
  assert.match(storeSource, /gradeLevel: cleanGradeLevel,/);
  assert.match(storeSource, /course\.gradeLevel = courseNoLesson\s*\? null/);
  assert.match(storeSource, /course\.gradeLevel = isNoLesson \? null : normalizeCourseGradeLevel\(course\.gradeLevel\);/);
  assert.match(runtimeSource, /gradeLevel: Number\.isInteger\(Number\(course\.gradeLevel\)\) \? Number\(course\.gradeLevel\) : null,/);
  assert.match(runtimeSource, /payload\.subject, payload\.gradeLevel/);
  assert.match(runtimeSource, /value\('subject', current\.subject\), value\('gradeLevel', current\.gradeLevel\)/);
});

for (const [moduleName, source, html, gradeLevelControl] of [
  ['Planung', planningSource, planningHtml, 'datalist'],
  ['Notenverwaltung', gradesSource, gradesHtml, 'select'],
]) {
  test(`${moduleName} bietet Jahrgang im Kursdialog und Kontextmenü an`, () => {
    assert.match(html, /id="course-dialog-grade-level-row"[\s\S]*?id="course-dialog-grade-level"/);
    if (gradeLevelControl === 'datalist') {
      assert.match(html, /<input id="course-dialog-grade-level" type="text" inputmode="numeric"[\s\S]*?placeholder="Keine Angabe" list="course-grade-level-options">/);
      assert.match(html, /<datalist id="course-grade-level-options">[\s\S]*?<option value="5"><\/option>[\s\S]*?<option value="13"><\/option>[\s\S]*?<\/datalist>/);
    } else {
      assert.match(html, /<select id="course-dialog-grade-level">[\s\S]*?<option value="">Keine Angabe<\/option>[\s\S]*?<option value="5">5<\/option>[\s\S]*?<option value="13">13<\/option>/);
    }
    assert.match(source, /courseDialogGradeLevel: document\.querySelector\("#course-dialog-grade-level"\)/);
    assert.match(source, /async openCourseGradeLevelDialog\(courseId\)/);
    assert.match(source, /label: "Jahrgang ändern"/);
    assert.match(source, /disabled: Boolean\(course\.noLesson\),[\s\S]*?await this\.openCourseGradeLevelDialog\(id\)/);
    if (gradeLevelControl === 'datalist') {
      assert.match(source, /const normalizedNextGradeLevel = normalizeCourseGradeLevel\(nextGradeLevel\);[\s\S]*?gradeLevel: normalizedNextGradeLevel/);
    } else {
      assert.match(source, /gradeLevel: normalizeCourseGradeLevel\(nextGradeLevel\)/);
    }
  });
}

test('Kursdialoge reichen den Jahrgang beim Anlegen und Bearbeiten weiter', () => {
  assert.match(planningSource, /const gradeLevelInput = String\(this\.refs\.courseDialogGradeLevel\?\.value \|\| ""\)\.trim\(\);\s*const gradeLevel = noLesson \? null : normalizeCourseGradeLevel\(gradeLevelInput\);/);
  assert.match(planningSource, /name,\s*subject,\s*gradeLevel,\s*color,/);
  assert.match(gradesSource, /const gradeLevel = noLesson \? null : normalizeCourseGradeLevel\(this\.refs\.courseDialogGradeLevel\?\.value\);/);
  assert.match(gradesSource, /name, subject, gradeLevel, color, noLesson/);
});
