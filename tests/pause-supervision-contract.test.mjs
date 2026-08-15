import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [schoolDataSource, storeSource, planningSource, planningHtml, planningCss] = await Promise.all([
  readFile(new URL('../src/shared/school-data/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
]);

const schoolData = await import(`data:text/javascript;base64,${Buffer.from(schoolDataSource).toString('base64')}`);

test('slot placement normalizes old entries as lessons and retains pause supervision entries', () => {
  const normalized = schoolData.normalizePublicSchoolData({
    slots: [
      { id: 1, courseId: 2, dayOfWeek: 1, startHour: 2, duration: 1 },
      { id: 2, schoolYearId: 4, label: 'Hof', dayOfWeek: 2, startHour: 3, duration: 1, placement: 'break' },
    ],
  });

  assert.deepEqual(normalized.slots.map((slot) => slot.placement), ['lesson', 'break']);
  assert.deepEqual(normalized.slots[1], {
    id: 2,
    courseId: 0,
    schoolYearId: 4,
    label: 'Hof',
    dayOfWeek: 2,
    startHour: 3,
    duration: 1,
    startDate: null,
    endDate: null,
    weekParity: 0,
    placement: 'break',
  });
});

test('pause supervision slots keep their placement through store operations', () => {
  assert.match(storeSource, /placement = "lesson", schoolYearId = null, label = ""/);
  assert.match(storeSource, /courseId: course \? course\.id : 0/);
  assert.match(storeSource, /schoolYearId: course \? course\.schoolYearId : year\.id/);
  assert.match(storeSource, /label: normalizedPlacement === "break" \? String\(label \|\| ""\)\.trim\(\) : ""/);
  assert.match(storeSource, /placement: normalizedPlacement/);
  assert.match(storeSource, /oldSlot\?\.placement === "break"/);
  assert.match(storeSource, /slotPlacement: slot\?\.placement === "break" \? "break" : "lesson"/);
  assert.match(storeSource, /\(slot\.placement === "break" \? "break" : "lesson"\) !== normalizedPlacement/);
});

test('planning provides a break-only dialog and renders pause overlays at hour boundaries', () => {
  assert.match(planningHtml, /id="slot-dialog-break-row"/);
  assert.match(planningHtml, /id="slot-dialog-break-name"/);
  assert.match(planningHtml, /<select id="slot-dialog-break-after" required><\/select>/);
  assert.match(planningHtml, /id="slot-dialog-delete" class="danger-action dialog-icon-button app-action-icon"[^>]*>[🗑️]+<\/button>/);
  assert.match(planningSource, /openBreakSupervisionDialog/);
  assert.match(planningSource, /const BREAK_SUPERVISION_AFTER_HOURS = \[2, 4, 6\]/);
  assert.match(planningSource, /Aufsichten sind nur nach der 2\., 4\. oder 6\. Stunde möglich\./);
  assert.match(planningSource, /courseId: placement === "break" \? 0 : this\.refs\.slotDialogCourse\.value/);
  assert.match(planningSource, /dataset\.weekBreak = "1"/);
  assert.match(planningSource, /if \(breakTarget\) \{/);
  assert.match(planningSource, /slotPlacement === "break"/);
  assert.match(planningSource, /_createWeekBreakSupervisionCard/);
  assert.match(planningSource, /👀 \$\{String\(lesson\.courseName/);
  assert.match(planningSource, /\.title\.course-link"\)\?\.classList\.add\("after-break-supervision"\)/);
  assert.match(planningCss, /\.week-break-supervision \{/);
  assert.match(planningCss, /\.title\.course-link\.after-break-supervision \{/);
  assert.match(planningCss, /border-radius: 999px/);
  assert.match(planningCss, /\.week-day-break-target \{/);
  assert.match(planningCss, /\.week-day-break-target::after \{/);
  assert.match(planningCss, /content: "👀"/);
  assert.match(planningCss, /transform: translate\(-50%, -50%\) scale\(1\.3\)/);
  assert.match(planningCss, /width: calc\(3rem \* var\(--week-table-scale, 1\)\)/);
  assert.match(planningCss, /\.week-day-break-target:hover:not\(:disabled\)/);
});
