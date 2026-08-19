import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [defaults, store, runtime, gradesHtml, gradesApp, seatplanApp, bridge] = await Promise.all([
  readFile(new URL('../src/shared/school-data/defaults.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'),
]);

function extractGradesMethod(signature) {
  const start = gradesApp.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const bodyStart = gradesApp.indexOf('{', start + signature.length);
  let depth = 0;
  for (let index = bodyStart; index < gradesApp.length; index += 1) {
    if (gradesApp[index] === '{') depth += 1;
    if (gradesApp[index] === '}') depth -= 1;
    if (depth === 0) return gradesApp.slice(start, index + 1);
  }
  throw new Error(`${signature} is incomplete`);
}

test('portrait setting defaults to hidden and is accepted by the grades settings command', () => {
  assert.match(defaults, /SHOW_GRADE_STUDENT_PORTRAITS_DEFAULT = false/);
  assert.match(store, /showGradeStudentPortraits: SHOW_GRADE_STUDENT_PORTRAITS_DEFAULT/);
  assert.match(runtime, /'showGradeStudentPortraits'/);
  assert.match(gradesHtml, /id="show-grade-student-portraits"/);
  assert.match(gradesApp, /draft\.showGradeStudentPortraits = Boolean\(this\.refs\.showGradeStudentPortraits\?\.checked\)/);
});

test('only bounded WebP portrait records are persisted with grade students', () => {
  assert.match(store, /const GRADE_STUDENT_PORTRAIT_MIME = "image\/webp"/);
  assert.match(store, /const GRADE_STUDENT_PORTRAIT_MAX_BYTES = 150 \* 1024/);
  assert.match(store, /function normalizeGradeStudentPortrait\(value\)/);
  assert.match(store, /const portrait = normalizeGradeStudentPortrait\(rawStudent && rawStudent\.portrait\)/);
  assert.match(store, /const portrait = normalizeGradeStudentPortrait\(item\.portrait\)/);
});

test('portrait import is local, square, metadata-free WebP conversion', () => {
  assert.match(gradesApp, /GRADE_STUDENT_PORTRAIT_INPUT_TYPES = new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
  assert.match(gradesApp, /canvas\.width = GRADE_STUDENT_PORTRAIT_SIZE/);
  assert.match(gradesApp, /context\.drawImage\(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas\.width, canvas\.height\)/);
  assert.match(gradesApp, /canvas\.toBlob\(resolve, GRADE_STUDENT_PORTRAIT_MIME, quality\)/);
  assert.match(gradesApp, /blob\.size <= GRADE_STUDENT_PORTRAIT_MAX_BYTES/);
});

test('portraits are confined to participant management, grade entry, and course seatplans', () => {
  assert.match(gradesApp, /grade-student-portrait--management/);
  assert.match(gradesApp, /grade-student-portrait--entry/);
  assert.match(gradesApp, /portraitUrl: this\.getGradeStudentPortraitUrl\(student\)/);
  assert.match(seatplanApp, /isCourseSeatplanMode\(\) \{[\s\S]*?function renderSeats/);
  assert.match(seatplanApp, /className = 'seat-grade-student-portrait'/);
});

test('locking and teardown revoke all generated portrait object URLs', () => {
  assert.match(gradesApp, /revokeGradeStudentPortraitObjectUrls\(\) \{[\s\S]*?URL\.revokeObjectURL/);
  assert.match(gradesApp, /async lockGradeVaultSession\(\) \{[\s\S]*?this\.revokeGradeStudentPortraitObjectUrls\(\)/);
  assert.match(gradesApp, /async discardGradeVaultChanges\(\) \{[\s\S]*?this\.revokeGradeStudentPortraitObjectUrls\(\)/);
  assert.match(seatplanApp, /function revokeGradeStudentPortraitObjectUrls\(\) \{[\s\S]*?URL\.revokeObjectURL/);
  assert.match(bridge, /clearGradeStudentPortraits: true/);
});

test('portrait previews open a bounded overlay and are cleaned up with the vault', () => {
  assert.match(gradesApp, /\.dataset\.gradeStudentPortraitPreview = "1"/);
  assert.match(gradesApp, /openGradeStudentPortraitOverlay\(portrait\)/);
  assert.match(gradesApp, /rect\.width \* 6/);
  assert.match(gradesApp, /overlay\.addEventListener\("click", \(\) => this\.removeGradeStudentPortraitOverlay\(\)/);
  assert.match(gradesApp, /revokeGradeStudentPortraitObjectUrls\(\) \{[\s\S]*?this\.removeGradeStudentPortraitOverlay\(\)/);
  assert.match(seatplanApp, /\.dataset\.gradeStudentPortraitPreview = '1'/);
  assert.match(seatplanApp, /function openGradeStudentPortraitOverlay\(source\)/);
  assert.match(seatplanApp, /rect\.width \* 3/);
  assert.match(seatplanApp, /function renderSeats\(options = \{\}\) \{[\s\S]*?removeGradeStudentPortraitOverlay\(\)/);
});

test('group photo extraction is local, manually assigned, and cleans up its temporary URL', () => {
  assert.match(gradesHtml, /id="course-dialog-group-photo-open"/);
  assert.match(gradesApp, /courseDialogGroupPhotoOpen\.hidden = !showPortraits/);
  assert.match(gradesHtml, /id="course-group-photo-dialog"/);
  assert.match(gradesHtml, /id="course-group-photo-selection-list"/);
  assert.doesNotMatch(gradesHtml, /id="course-group-photo-student-select"/);
  assert.doesNotMatch(gradesHtml, /id="course-group-photo-selection-delete"/);
  assert.match(gradesApp, /handleGroupPhotoStagePointerDown\(event\)/);
  assert.match(gradesApp, /handleGroupPhotoStagePointerMove\(event\)/);
  assert.match(gradesApp, /isGroupPhotoCircleBorderHit\(circle, event\)/);
  assert.doesNotMatch(gradesApp, /course-group-photo-circle-resize/);
  // Circles come from a free-hand drag or from a student pill, and a pill dropped on an
  // existing circle links the two instead of stacking another circle on top.
  assert.match(gradesApp, /data-group-photo-student-pill/);
  assert.doesNotMatch(gradesApp, /course-group-photo-selection-select/);
  assert.match(gradesApp, /createGroupPhotoSelectionForStudent\(drag\.studentId, point\)/);
  assert.match(gradesApp, /assignGroupPhotoStudentToSelection\(/);
  assert.match(gradesApp, /data-group-photo-selection-delete/);
  // Instructions live in the hint line above the photo, not in tooltips over it.
  assert.match(gradesHtml, /course-group-photo-hint/);
  assert.doesNotMatch(
    extractGradesMethod('renderGroupPhotoExtractionDialog()'),
    /label\.(?:title|dataset\.tooltip)/
  );
  assert.match(gradesApp, /courseGroupPhotoStage\.addEventListener\("dragenter"/);
  assert.match(gradesApp, /gradeDataTransferHasFiles\(event\.dataTransfer\)/);
  assert.match(gradesApp, /encodeGradeStudentPortraitCrop\(state\.image, selection\.x, selection\.y, selection\.size\)/);
  assert.match(gradesApp, /syncGroupPhotoSelectionPanelHeight\(\)/);
  assert.match(gradesApp, /--course-group-photo-image-height/);
  assert.match(gradesApp, /Vorhandenes Bild ersetzen/);
  assert.match(gradesApp, /clearGroupPhotoExtractionState\(\) \{[\s\S]*?URL\.revokeObjectURL\(state\.url\)/);
  assert.doesNotMatch(gradesApp, /face(?:\s|-)?recognition|face(?:\s|-)?detection/i);
});

test('cross-course portrait import copies whole records and only fills empty portraits', () => {
  assert.match(gradesHtml, /id="course-dialog-portrait-import"/);
  assert.match(gradesApp, /courseDialogPortraitImport\.hidden = !showPortraits/);

  const collect = extractGradesMethod('async collectGradeStudentPortraitSources(excludeCourseId = 0)');
  // Reads foreign courses without switching the loaded grade course.
  assert.match(collect, /workspaceOwner\.getGradeCourseStateSnapshot\(course\.id\)/);
  assert.doesNotMatch(collect, /ensureGradeCourseLoaded|withTemporaryGradeCourse/);
  // Scans every school year, newest first, and skips the course being edited.
  assert.match(collect, /\[\.\.\.this\.store\.listSchoolYears\(\)\]\.reverse\(\)/);
  assert.match(collect, /Number\(course\.id\) !== skipCourseId/);
  // Matches on the normalised first + last name pair only.
  assert.match(collect, /buildGradeStudentNameMatchKey\(student\.lastName, student\.firstName\)/);

  const importPortraits = extractGradesMethod('async importCourseDialogPortraitsFromOtherCourses()');
  // Copies the portrait record instead of linking back to the source course.
  assert.match(importPortraits, /student\.portrait = \{ mime: match\.portrait\.mime, data: match\.portrait\.data \}/);
  assert.doesNotMatch(gradesApp, /portraitRef|portraitSourceCourseId/);
  // Existing portraits are never overwritten.
  assert.match(importPortraits, /&& !normalizeGradeStudentPortrait\(student\?\.portrait\)/);
  // Writes stay in the dialog draft; persistence remains the dialog submit path.
  assert.doesNotMatch(importPortraits, /replaceGradeStudentsForCourse|runGradeCourseMutation/);
  assert.match(importPortraits, /this\.revokeGradeStudentPortraitObjectUrls\(\)/);
});
