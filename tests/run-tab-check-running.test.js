// hamr 2026-11-22: the Run tab shows the newest `check-running` record's own text as one small grey line under the step map, only while
// the run is live AND no later record exists (the check, the step or the run ended). Real-data fixture: the first 223 records of live run
// mwrkv1zh (21 real check-running records; seq 149 and 187 are real `check-run` ends, seq 14 and 19 real `check-preflight` ends).
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

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
let n = 0;
// no pid on the row = the spine-mtime rule (a freshly written spine is live); a dead pid = not live
/** @param {any[]} records @param {{pid?: number}} [o] */
function detailOf(records, o = {}) {
  const home = mkdtempSync(join(tmpdir(), 'chk-run-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const spine = join(dir, 'u-chk.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  n += 1;
  appendRun({ at: records[0].ts, runid: `chk${n}`, job: 'job', spine, patient: null, via: 'run-u', ...(o.pid === undefined ? {} : { pid: o.pid }), capUsd: 8 }, { home });
  return getRunDetail(`chk${n}`, { home });
}
const idx = (seq) => FIXTURE.findIndex((r) => r.seq === seq);

test('a live run whose newest record is a check-running tick carries that record\'s text verbatim', () => {
  const d = detailOf(FIXTURE);
  assert.equal(d.live, true);
  assert.equal(d.checkRunning, 'Tests are still running (6 min so far), usually about 8 min.');
  assert.equal(d.checkRunning, FIXTURE.at(-1).text);
});

test('a first-time tick (no measured time yet) reads as the record says it', () => {
  const d = detailOf(FIXTURE.slice(0, idx(10) + 1));
  assert.equal(d.checkRunning, 'Tests are still running (5 min so far).');
});

test('the check ended (a real check-run, a real check-preflight record after the tick): no line', () => {
  assert.equal(detailOf(FIXTURE.slice(0, idx(149) + 1)).checkRunning, null);
  assert.equal(detailOf(FIXTURE.slice(0, idx(14) + 1)).checkRunning, null);
});

test('the step or the run ended after the tick: no line', () => {
  const last = FIXTURE.at(-1);
  const stepEnd = { type: 'step-end', step: 'fix-shared-test-cause', outcome: 'red', ts: last.ts, seq: 224 };
  assert.equal(detailOf([...FIXTURE, stepEnd]).checkRunning, null);
  const jobEnd = { type: 'job-end', outcome: 'escalated', spentUsd: 1, spendComplete: true, ts: last.ts, seq: 225 };
  const d = detailOf([...FIXTURE, jobEnd]);
  assert.equal(d.checkRunning, null);
});

test('the run is not live (died / stopped, no job-end): no line', () => {
  const d = detailOf(FIXTURE, { pid: 2 ** 22 + 12345 });
  assert.equal(d.live, false);
  assert.equal(d.checkRunning, null);
});

test('page: one grey line under the step chip map, set from detail.checkRunning, hidden when null', () => {
  assert.match(PAGE, /id="map-tests"[^>]*data-testid="check-running"[^>]*hidden/);
  const m = PAGE.indexOf('id="map-box"');
  assert.ok(PAGE.indexOf('id="map-tests"') > m, 'sits inside/after the map box');
  const body = PAGE.slice(PAGE.indexOf('function paintCheckRunning('), PAGE.indexOf('function renderStepMap('));
  // eslint-disable-next-line no-new-func
  const paint = new Function('document', `${body}\nreturn paintCheckRunning;`);
  const el = { hidden: true, textContent: '' };
  const doc = { getElementById: (id) => (id === 'map-tests' ? el : null) };
  const fn = paint(doc);
  fn({ checkRunning: 'Tests are still running (8 min so far), usually about 12 min.' });
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, 'Tests are still running (8 min so far), usually about 12 min.');
  fn({ checkRunning: null });
  assert.equal(el.hidden, true);
  assert.equal(el.textContent, '');
  fn({});
  assert.equal(el.hidden, true);
  assert.match(PAGE, /paintCheckRunning\(detail\)/);
});
