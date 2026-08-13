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

test('portrait previews open a bounded three-times overlay and are cleaned up with the vault', () => {
  assert.match(gradesApp, /\.dataset\.gradeStudentPortraitPreview = "1"/);
  assert.match(gradesApp, /openGradeStudentPortraitOverlay\(source\)/);
  assert.match(gradesApp, /rect\.width \* 3/);
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
  assert.match(gradesApp, /data-group-photo-selection-student/);
  assert.match(gradesApp, /data-group-photo-selection-delete/);
  assert.match(gradesApp, /label\.title = "Markierung löschen"/);
  assert.match(gradesApp, /courseGroupPhotoStage\.addEventListener\("dragenter"/);
  assert.match(gradesApp, /gradeDataTransferHasFiles\(event\.dataTransfer\)/);
  assert.match(gradesApp, /encodeGradeStudentPortraitCrop\(state\.image, selection\.x, selection\.y, selection\.size\)/);
  assert.match(gradesApp, /syncGroupPhotoSelectionPanelHeight\(\)/);
  assert.match(gradesApp, /list\.scrollTop = clamp/);
  assert.match(gradesApp, /Vorhandenes Bild ersetzen/);
  assert.match(gradesApp, /clearGroupPhotoExtractionState\(\) \{[\s\S]*?URL\.revokeObjectURL\(state\.url\)/);
  assert.doesNotMatch(gradesApp, /face(?:\s|-)?recognition|face(?:\s|-)?detection/i);
});
