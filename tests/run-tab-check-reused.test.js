// hamr 2026-11-23: the Run tab shows the newest `check-reused` record's own text (code-written in src/planrun.js, `tellReuse`) as one small grey line under the step map, beside the `check-running` line.
// No archived spine holds a `check-reused` record yet (the record is new), so the record is written in the exact shape `tellReuse` emits, appended to the first records of real live run mwrkv1zh.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HERE, 'fixtures', 'check-running-spine.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const TEXT = 'Checks not run again: same files as the last check at 14:05.';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
let n = 0;
/** @param {any[]} records */
function detailOf(records) {
  const home = mkdtempSync(join(tmpdir(), 'chk-reuse-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const spine = join(dir, 'u-chk.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  n += 1;
  appendRun({ at: records[0].ts, runid: `rus${n}`, job: 'job', spine, patient: null, via: 'run-u', capUsd: 8 }, { home });
  return getRunDetail(`rus${n}`, { home });
}
const reused = (seq, text = TEXT) => ({ type: 'check-reused', commands: 2, savedAt: '2026-11-23T14:05:00.000Z', text, ts: FIXTURE[0].ts, seq });

test('a spine with a check-reused record carries that record\'s text verbatim; a spine without one carries null', () => {
  const base = FIXTURE.slice(0, 20);
  assert.equal(detailOf(base).checkReused, null);
  assert.equal(detailOf([...base, reused(900)]).checkReused, TEXT);
  assert.equal(detailOf([...base, reused(900, 'old'), reused(901)]).checkReused, TEXT, 'the newest one');
});

test('page: one grey line beside the check-running line, set from detail.checkReused, hidden when null', () => {
  assert.match(PAGE, /id="map-reused"[^>]*data-testid="check-reused"[^>]*hidden/);
  assert.match(PAGE, /class="map-key map-tests" id="map-reused"/, 'the same grey-line classes as the check-running line');
  const body = PAGE.slice(PAGE.indexOf('function paintCheckReused('), PAGE.indexOf('function renderStepMap('));
  // eslint-disable-next-line no-new-func
  const paint = new Function('document', `${body}\nreturn paintCheckReused;`);
  const el = { hidden: true, textContent: '' };
  const fn = paint({ getElementById: (id) => (id === 'map-reused' ? el : null) });
  fn({ checkReused: TEXT });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, TEXT);
  fn({ checkReused: null });
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
  assert.match(PAGE, /paintCheckReused\(detail\)/);
});
