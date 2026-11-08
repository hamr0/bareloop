// R8 (piece 10): the ticket grid's server side on REAL archived ticket spines (tests/fixtures/ticket-grid) plus skipped rows laid out as `run-u` writes them. The buckets come from the one
// status table (src/panel/status.js), the money from panelMoney2 honouring spendComplete, the opened row's facts from the generic payload (never a second diff/check reader).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeGridWorld } from './ticket-grid-world.mjs';
import { makeResultWorld } from './result-tab-world.mjs';
import { GROUP_OF, TICKET_GROUPS } from '../src/panel/tickets.js';
import { bucketOf, buildJobGrid, moneyWords, sumMoney } from '../src/panel/jobgrid.js';
import { STATUS } from '../src/panel/status.js';
import { getJobGrid, getRunResult, listRuns } from '../src/panel/server.js';
import { panelMoney2 } from '../src/panelmoney.js';
import { createPanelServer } from '../src/panel/server.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const SKIPS = [
  { runid: 'sk-old-7', ticket: 7, at: '2026-11-04T09:00:00.000Z', words: 'no P1 label on the ticket' },
  { runid: 'sk-12', ticket: 12, at: '2026-11-07T20:00:00.000Z', words: 'the ticket is closed' },
];

test('GROUP_OF is keyed by the status table\'s own keys: every status key has a bucket, no key the table does not have, every bucket is one of the four', () => {
  assert.deepEqual(Object.keys(GROUP_OF).sort(), Object.keys(STATUS).sort());
  const buckets = new Set(TICKET_GROUPS.map((g) => g.key));
  for (const v of Object.values(GROUP_OF)) assert.ok(buckets.has(v), v);
  assert.deepEqual(TICKET_GROUPS.map((g) => g.label), ['Needs you', 'Stopped', 'Passed', 'Skipped']);
});

test('bucketOf: the table decides; a run waiting at its review door is Needs you even though its status reads passed; an unknown key reads Stopped', () => {
  assert.equal(bucketOf('passed', null), 'done');
  assert.equal(bucketOf('passed', 'Accept'), 'wait');
  assert.equal(bucketOf('failed', 'Resume'), 'stop', 'a Resume tag ages out at 7 days: the bucket must not depend on the date');
  assert.equal(bucketOf('running', null), 'wait');
  assert.equal(bucketOf('skipped', null), 'skip');
  assert.equal(bucketOf('capped', null), 'stop');
  assert.equal(bucketOf('nonsense', null), 'stop');
});

test('money: panelMoney2 only, "at least" for a floor, never $0.00 for an unknown figure; the stats sum is a floor when any row is', () => {
  assert.equal(moneyWords(0.0255, true), panelMoney2(0.0255));
  assert.equal(moneyWords(0.0806, false), `at least ${panelMoney2(0.0806)}`);
  assert.equal(moneyWords(null, false), 'unknown');
  assert.equal(moneyWords(0, true), '$0.00');
  assert.deepEqual(sumMoney([{ usd: 0.5, complete: true }, { usd: null, complete: false }]), { usd: 0.5, complete: false });
  assert.deepEqual(sumMoney([{ usd: null, complete: false }]), { usd: null, complete: false });
  assert.deepEqual(sumMoney([{ usd: 0.25, complete: true }, { usd: 0.5, complete: true }]), { usd: 0.75, complete: true });
});

const entry = (o) => ({ runId: 'r', runNo: 1, at: 1000, statusKey: 'passed', sign: '✓', word: 'passed', needs: null, number: 1, title: 't', url: null, steps: { done: 1, total: 1 }, checks: { passed: 2, total: 2 },
  spentUsd: 0.1, spendComplete: true, spendFloorUsd: null, wall: '1m00s', reason: null, ...o });

test('buildJobGrid: buckets, newest first, counts, the stats line honours spendComplete and an unknown row is never $0.00', () => {
  const g = buildJobGrid({ entries: [
    entry({ runId: 'a', at: 1, number: 1 }),
    entry({ runId: 'b', at: 3, number: 2, statusKey: 'failed', sign: '✗', word: 'failed', checks: { passed: 1, total: 3 }, steps: { done: 0, total: 2 }, spendComplete: false }),
    entry({ runId: 'c', at: 2, number: 3, statusKey: 'passed', needs: 'Accept' }),
    entry({ runId: 'd', at: 9, number: 4, statusKey: 'skipped', sign: '–', word: 'skipped', steps: null, checks: null, spentUsd: 0, wall: null, reason: 'the ticket is closed' }),
    entry({ runId: 'e', at: 4, number: 5, statusKey: 'died', sign: '?', word: 'died', steps: null, checks: null, spentUsd: null, spendComplete: false, spendFloorUsd: null, wall: null }),
  ] });
  assert.deepEqual(g.groups.map((x) => [x.key, x.rows.map((r) => r.runId)]), [['wait', ['c']], ['stop', ['e', 'b']], ['done', ['a']], ['skip', ['d']]]);
  assert.deepEqual(g.stats.counts, { wait: 1, stop: 2, done: 1, skip: 1 });
  assert.equal(g.stats.spentComplete, false, 'one row is a floor and one unknown: the sum is a floor');
  assert.match(g.stats.spent, /^at least \$/);
  const b = g.groups[1].rows.find((r) => r.runId === 'b');
  assert.deepEqual([b.steps, b.checks], [{ mark: 'r', text: '0 of 2' }, { mark: 'r', text: '2 red' }]);
  assert.deepEqual(b.cost, { mark: 'q', text: `at least ${panelMoney2(0.1)}` });
  const e = g.groups[1].rows.find((r) => r.runId === 'e');
  assert.deepEqual(e.cost, { mark: 'q', text: 'unknown' }, 'unknown is said, never $0.00');
  const all = buildJobGrid({ entries: [entry({ runId: 'x', spentUsd: null, spendFloorUsd: null, spendComplete: false })] });
  assert.equal(all.stats.spent, 'unknown');
  assert.equal(all.stats.spentUsd, null);
});

test('a live or died row with only a floor reads "at least", a floor mark, and the stats line is then a floor too (mutant: a floor read as complete)', () => {
  const g = buildJobGrid({ entries: [entry({ runId: 'f', statusKey: 'died', sign: '?', word: 'died', spentUsd: null, spendComplete: false, spendFloorUsd: 0.04, steps: null, checks: null })] });
  const f = g.groups.find((x) => x.key === 'stop').rows[0];
  assert.deepEqual(f.cost, { mark: 'q', text: `at least ${panelMoney2(0.04)}` });
  assert.deepEqual([g.stats.spentComplete, g.stats.spent], [false, `at least ${panelMoney2(0.04)}`]);
});

test('real spines: the grid of a ticket job is one row per run-list row of that job, in buckets, with the cells from the run\'s own records', () => {
  const w = makeGridWorld({ skipped: SKIPS });
  const opts = { home: w.home, now: NOW };
  const listed = listRuns(opts).filter((r) => r.job === 'tk-grid');
  const g = getJobGrid('mw3gso0m', opts);
  assert.ok(g, 'a ticket job has a grid');
  const rows = g.groups.flatMap((x) => x.rows);
  assert.equal(rows.length, listed.length, 'the grid count is the run list\'s row count for the job');
  assert.deepEqual(g.stats.counts, { wait: 0, stop: 1, done: 1, skip: 2 });
  const passed = g.groups.find((x) => x.key === 'done').rows[0];
  assert.equal(passed.runId, 'mw3gso0m');
  assert.equal(passed.name, '#7');
  assert.equal(passed.title, 'fwdloop test: P1 walk 2');
  assert.deepEqual(passed.steps, { mark: 'g', text: '1 of 1' });
  assert.deepEqual(passed.checks, { mark: 'g', text: '6 of 6' });
  const stopped = g.groups.find((x) => x.key === 'stop').rows[0];
  assert.equal(stopped.runId, 'mw6lmvdg');
  assert.equal(stopped.name, '#17');
  assert.deepEqual(stopped.steps, { mark: 'r', text: '0 of 2' });
  // the close never ran (cap-halt): the cell is the steps' own checks - 3 distinct checks, 1 standing green at the last try - the SAME data the Audit grid reads
  assert.deepEqual(stopped.checks, { mark: 'r', text: '2 red' }, 'the header says the checks said no; the cell agrees');
  assert.equal(stopped.reason, 'checks said no', 'the run list\'s own short ending words');
  // money and wall are the run list's own entry, spelled once
  const own = listed.find((r) => r.runid === 'mw6lmvdg');
  assert.equal(stopped.cost.text, `${own.spendComplete ? '' : 'at least '}${panelMoney2(own.spentUsd)}`);
  assert.equal(stopped.time.text, own.wall);
  assert.match(g.stats.spent, /^\$/);
});

test('skipped rows: the words are the settled event\'s, no cost cell figure, Run it anyway only on a ticket nobody ran since', () => {
  const w = makeGridWorld({ skipped: SKIPS });
  const g = getJobGrid('mw3gso0m', { home: w.home, now: NOW });
  const skip = g.groups.find((x) => x.key === 'skip').rows;
  assert.deepEqual(skip.map((r) => r.runId), ['sk-12', 'sk-old-7']);
  assert.equal(skip[0].reason, 'the ticket is closed');
  assert.equal(skip[0].anyway, true);
  assert.equal(skip[1].number, 7);
  assert.equal(skip[1].anyway, false, 'ticket 7 ran (passed) after this skip: it is not skipped any more');
  assert.equal(skip[0].title, null, 'a skipped run has no spine: the title is not recorded, only the number');
});

test('a job that read no ticket has no grid; an unknown run has none; the opened row is the generic payload, and the grid itself carries no diff', () => {
  const w = makeResultWorld(['mvkj03w7']);
  assert.equal(getJobGrid('mvkj03w7', { home: w.home }), null);
  assert.equal(getJobGrid('nope1234', { home: w.home }), null);
  const g = makeGridWorld();
  const grid = getJobGrid('mw3gso0m', { home: g.home, now: NOW });
  assert.equal(JSON.stringify(grid).includes('diff --git'), false, 'rows open through /result (genericResultOf), the grid reads no diff');
  const r = getRunResult('mw3gso0m', { home: g.home });
  assert.equal(r.kind, 'generic');
  assert.equal(r.ticket.number, grid.groups.find((x) => x.key === 'done').rows[0].number, 'one reader of the ticket');
  assert.ok(r.changed && r.checks && r.work !== undefined);
  assert.equal(r.checks.head, '6 of 6 passed · the close ran them after the worker stopped', 'a green run keeps its outer-close checks exactly');
  const stop = getRunResult('mw6lmvdg', { home: g.home });
  assert.equal(stop.checks.head, '1 of 3 passed · the steps ran them; the close never ran');
  assert.deepEqual(stop.checks.stages.map((x) => [x.name, x.question, x.passed, x.tries, x.value]), [
    ['changed-from-seed', 'did it change any file?', true, 3, null],
    ['no-failing-tests', 'no failing tests?', false, 3, null],
    ['artifact-written', null, false, 2, null],
  ]);
  assert.match(stop.endedWords, /^Goal not met — the checks said no \(cap-halt/, 'the opened row says why the run stopped, in the Run tab\'s own words');
});

test('GET /api/runs/:runid/grid over HTTP: 200 for a ticket job, 404 for a plain job\'s run; a skipped run opens the same grid', async (t) => {
  const w = makeGridWorld({ skipped: SKIPS });
  const plain = makeResultWorld(['mvkj03w7']);
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'tg-sess-'));
  const srv = await createPanelServer({ port: 0, home: w.home, env: {}, sessionsRoot });
  t.after(() => srv.close());
  const ok = await fetch(`http://127.0.0.1:${srv.port}/api/runs/sk-12/grid`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.job, 'tk-grid');
  assert.equal(body.groups.flatMap((x) => x.rows).length, 4);
  const srv2 = await createPanelServer({ port: 0, home: plain.home, env: {}, sessionsRoot });
  t.after(() => srv2.close());
  assert.equal((await fetch(`http://127.0.0.1:${srv2.port}/api/runs/mvkj03w7/grid`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/runs/bad%2Fid/grid`)).status, 400);
});
