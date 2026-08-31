import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [tabs, main, bridge, gradesBridge, gradesHtml, gradesApp, nameHtml, nameApp, sharedDialog] = await Promise.all([
  read('../src/shell/tabs.js'), read('../src/main.js'), read('../src/app/planning-seatplan-bridge.js'), read('../src/modules/grades/bridge.js'),
  read('../src/modules/grades/app.html'), read('../src/modules/grades/app.js'), read('../src/modules/name-learning/app.html'), read('../src/modules/name-learning/app.js'),
  read('../src/shared/learner-search-dialog.js'),
]);

test('both sidebars expose the print-style learner search action', () => {
  assert.match(gradesHtml, /sidebar-grade-action-title">Lernendensuche[\s\S]*?id="learner-search-btn"[\s\S]*?🧑‍🎓🔍/);
  assert.match(nameHtml, /sidebar-section-title">Lernendensuche[\s\S]*?id="learner-search-btn"[\s\S]*?🧑‍🎓🔍/);
});

test('both modules build the learner search dialog from the shared component', () => {
  assert.match(sharedDialog, /dialog\.id = 'learner-search-dialog';/);
  assert.doesNotMatch(gradesHtml, /id="learner-search-dialog"/);
  assert.doesNotMatch(nameHtml, /id="learner-search-dialog"/);
  for (const html of [gradesHtml, nameHtml]) {
    assert.match(html, /shared\/learner-search-dialog\.css/);
  }
  for (const app of [gradesApp, nameApp]) {
    assert.match(app, /createLearnerSearchDialog/);
    assert.match(app, /shared\/learner-search-dialog\.js/);
    assert.doesNotMatch(app, /findLearnerMatches/);
  }
});

test('name learning receives its roster through the authenticated grades bridge', () => {
  assert.match(tabs, /NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT/);
  assert.match(tabs, /GRADES_NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT/);
  assert.match(main, /NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT/);
  assert.match(bridge, /requestNameLearningStudentSearch/);
  assert.match(gradesBridge, /NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT/);
  assert.match(gradesApp, /handleNameLearningStudentSearchRequest/);
  assert.match(nameApp, /STUDENT_SEARCH_RESULT/);
  assert.match(nameApp, /learnerSearch\.setRoster\(event\.data\.detail\?\.students\)/);
});

test('course pills carry a learner id into participant management and highlight it', () => {
  assert.match(nameApp, /requestManageStudents\(course\.courseId, course\.studentId\)/);
  assert.match(main, /studentId = Number\(data\.detail\?\.studentId \|\| 0\)/);
  assert.match(gradesApp, /navigation\.action === "manage-students"[\s\S]{0,600}?openCourseStudentsDialog\(courseId, \{ studentId: Number\(navigation\.studentId \|\| 0\) \}\)/);
  assert.match(gradesApp, /data-grade-student-id/);
  assert.match(gradesApp, /is-learner-search-highlight/);
});
