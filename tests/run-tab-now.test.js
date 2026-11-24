// hamr 2026-11-24 (signed, ITEM33-BUILD "Part B", D1, D2, D4, D5): the Run tab's block gets a NOW row, only while the run is live -
// "Running your tests · M:SS", "AI working · M:SS" or "Drafting · M:SS", in 30 s steps. It replaces the grey "Tests are still running..." line under the
// step map (gone). When the run ends NOW goes and ENDED / NEXT / SCHEDULE keep today's words. Every time is read from the run's own spine (the
// panel's single UI source). Real-data fixture: the first 223 records of live run mwrkv1zh (real iteration-start / middle-done / check-running /
// check-run / step-end / materials / plan-accepted records); the `check-start` and the Drafting-only spine are the shapes planrun.js now writes.
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
/** @param {any[]} records @param {{pid?: number, now?: number}} [o] */
function detailOf(records, o = {}) {
  const home = mkdtempSync(join(tmpdir(), 'run-now-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const spine = join(dir, 'u-now.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  n += 1;
  appendRun({ at: records[0].ts, runid: `now${n}`, job: 'job', spine, patient: null, via: 'run-u', ...(o.pid === undefined ? {} : { pid: o.pid }), capUsd: 8 }, { home });
  return getRunDetail(`now${n}`, { home, ...(o.now === undefined ? {} : { now: o.now }) });
}
const idx = (seq) => FIXTURE.findIndex((r) => r.seq === seq);
const at = (rec, secs) => Date.parse(rec.ts) + secs * 1000;

test('D2 tests: a live run whose newest record is a check-running tick says "Running your tests", from when the check began (tick time minus its elapsed time), in 30 s steps', () => {
  const last = FIXTURE.at(-1);
  assert.equal(last.type, 'check-running');
  assert.equal(last.elapsedMs, 360014);
  assert.equal(detailOf(FIXTURE, { now: at(last, 5) }).now, 'Running your tests · 6:00');
  assert.equal(detailOf(FIXTURE, { now: at(last, 35) }).now, 'Running your tests · 6:30');
  assert.equal(detailOf(FIXTURE, { now: at(last, 29) }).now, 'Running your tests · 6:00', 'no ticking clock: it moves every 30 s');
});

test('D2 tests: a check-start record (the new spine event, written when a check pass begins) starts the clock from its own time', () => {
  const last = FIXTURE[idx(141)];
  const rec = { type: 'check-start', ts: new Date(at(last, 2)).toISOString(), seq: 142 };
  const d = detailOf([...FIXTURE.slice(0, idx(141) + 1), rec], { now: at(last, 2 + 95) });
  assert.equal(d.now, 'Running your tests · 1:30');
  assert.equal(detailOf([...FIXTURE.slice(0, idx(141) + 1), rec], { now: at(last, 2 + 10) }).now, 'Running your tests · 0:00');
});

test('D2 AI: the worker is in an attempt (iteration-start is the nearest marker) = "AI working", counted from that attempt\'s start', () => {
  const upto = idx(56); // iteration-start, real record
  const d = detailOf(FIXTURE.slice(0, upto + 1), { now: at(FIXTURE[upto], 95) });
  assert.equal(d.now, 'AI working · 1:30');
  // the worker's own rounds and notes after it do not change the reading
  const d2 = detailOf(FIXTURE.slice(0, idx(71) + 1), { now: at(FIXTURE[upto], 75) });
  assert.match(d2.now, /^AI working · \d+:(00|30)$/);
});

test('D2 Drafting: the planner is drafting (materials is the nearest marker, a refused draft keeps it going) = "Drafting", until the plan is accepted', () => {
  const m = FIXTURE[idx(43)];
  assert.equal(m.type, 'materials');
  assert.equal(detailOf(FIXTURE.slice(0, idx(43) + 1), { now: at(m, 61) }).now, 'Drafting · 1:00');
  const refused = { type: 'plan-validate', ok: false, reds: [{ code: 'x' }], phase: 'draft-1', ts: new Date(at(m, 20)).toISOString(), seq: 44 };
  assert.equal(detailOf([...FIXTURE.slice(0, idx(43) + 1), refused], { now: at(m, 61) }).now, 'Drafting · 1:00');
  assert.equal(detailOf(FIXTURE.slice(0, idx(53) + 1), { now: at(FIXTURE[idx(53)], 5) }).now, null, 'plan-accepted ends it');
});

test('D1: between the worker and its checks, and after a check ended, there is no NOW (nothing is made up)', () => {
  assert.equal(detailOf(FIXTURE.slice(0, idx(72) + 1), { now: at(FIXTURE[idx(72)], 5) }).now, null, 'middle-done: the worker has finished');
  assert.equal(detailOf(FIXTURE.slice(0, idx(149) + 1), { now: at(FIXTURE[idx(149)], 5) }).now, null, 'a real check-run ended the check');
  assert.equal(detailOf(FIXTURE.slice(0, idx(14) + 1), { now: at(FIXTURE[idx(14)], 5) }).now, null, 'a real check-preflight ended the check');
});

test('D5: the run ended (job-end) or is not live (died): no NOW, and the ENDED words are today\'s', () => {
  const last = FIXTURE.at(-1);
  const jobEnd = { type: 'job-end', outcome: 'escalated', spentUsd: 1, spendComplete: true, ts: last.ts, seq: 225 };
  const d = detailOf([...FIXTURE, jobEnd], { now: at(last, 5) });
  assert.equal(d.now, null);
  assert.ok(d.ended && typeof d.endedText === 'string', 'ENDED keeps its words');
  const dead = detailOf(FIXTURE, { pid: 2 ** 22 + 12345, now: at(last, 5) });
  assert.equal(dead.live, false);
  assert.equal(dead.now, null);
});

test('D4: the grey "Tests are still running" line is gone - no detail.checkRunning, no #map-tests, no painter; the reused line stays as it is', () => {
  assert.equal('checkRunning' in detailOf(FIXTURE, { now: at(FIXTURE.at(-1), 5) }), false);
  assert.doesNotMatch(PAGE, /id="map-tests"|paintCheckRunning|check-running"/);
  assert.match(PAGE, /id="map-reused"[^>]*data-testid="check-reused"[^>]*hidden/, 'D3 is Part A: its line stays exactly as it is');
  assert.match(PAGE, /paintCheckReused\(detail\)/);
});

test('page: the NOW row is the block\'s first row (summaryRow, same classes), drawn only when the server sent `now`, and a live run with only NOW shows the block', () => {
  const fnSrc = (/** @type {string} */ name) => {
    const a = PAGE.indexOf(`function ${name}(`); let d = 0; let j = PAGE.indexOf('{', a);
    for (; j < PAGE.length; j += 1) { if (PAGE[j] === '{') d += 1; else if (PAGE[j] === '}') { d -= 1; if (d === 0) break; } }
    return PAGE.slice(a, j + 1);
  };
  const src = ['renderEnded', 'summaryRow', 'nextRow', 'escapeXml'].map(fnSrc).join('\n');
  const box = { hidden: true, innerHTML: '', className: '' };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `var lastEndedSig = null;\n${src}\nreturn renderEnded;`)({ getElementById: () => box });
  render({ runid: 'r1', now: 'Running your tests · 6:30', ended: null, schedule: null, resume: null });
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, /<span class="ended-label">NOW<\/span><span class="ended-text" data-testid="now-row">Running your tests · 6:30<\/span>/);
  render({ runid: 'r1', now: 'Running your tests · 7:00', ended: null, schedule: null, resume: null });
  assert.match(box.innerHTML, /7:00/, 'the row is redrawn when the server\'s words change');
  render({ runid: 'r1', now: null, ended: { reason: 'goal met', next: 'Accept it' }, endedText: '11/24 10:00 · passed · goal met', schedule: null, resume: null, glyph: '✓' });
  assert.doesNotMatch(box.innerHTML, /NOW/);
  assert.match(box.innerHTML, /ENDED/);
  render({ runid: 'r1', now: null, ended: null, schedule: null, resume: null });
  assert.equal(box.hidden, true, 'nothing to show: the block is hidden');
});
