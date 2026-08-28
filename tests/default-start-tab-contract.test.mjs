import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mainSource, htmlSource, shellSource] = await Promise.all([
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.js', import.meta.url), 'utf8'),
]);

test('planning is the default module at application startup', () => {
  assert.match(mainSource, /const shellState = \{\s+activeTab: TAB_PLANNING,/);
  assert.match(
    mainSource,
    /try \{\s+if \(moduleWindowRequest\.tab\) \{\s+setActiveTabImmediate\(moduleWindowRequest\.tab\);\s+\} else \{\s+setActiveTab\(TAB_PLANNING\);\s+\}[\s\S]*?tab: TAB_PLANNING,/,
    'planning bleibt der Start, ausser ein Modulfenster fordert ausdruecklich ein anderes Modul an',
  );
  assert.match(htmlSource, /<div class="app app-tab-planning" id="app">/);
  assert.match(htmlSource, /<div id="groups-main-host" hidden>/);
  assert.match(htmlSource, /id="tab-grades" class="tab-button"[\s\S]*?aria-selected="false">Noten<\/button>[\s\S]*?id="tab-planning" class="tab-button active"[\s\S]*?aria-selected="true">Planung<\/button>/);
  assert.match(shellSource, /const isPlanningBoot = state\.activeTab === TAB_PLANNING && !els\.app\?\.classList\.contains\('app-js-ready'\);[\s\S]*?els\.groupsMainHost\.hidden = isPlanningBoot/);
});
