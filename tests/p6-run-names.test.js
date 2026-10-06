// PANEL-BUILD.md P6 item 7 — run names: the server numbers runs per job, oldest first; every view reads that number.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRunDetail, listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

/** @type {string[]} */ const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'p6-names-')); tmpDirs.push(d); return d; };

/** one listed run: a real spine (old mtime, so never "running"), `at` set explicitly; `legs` adds leg-resume markers */
function addRun(home, { runid, job, at, outcome = null, legs = 0 }) {
  const spine = join(tmp(), `u-${runid}.jsonl`);
  const ts = at;
  const recs = [
    { type: 'job-start', job, specHash: 'h', budgetUsd: 4, shape: 'plan', goal: 'g', ts, seq: 1 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'one' }] }, ts, seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, ts, seq: 3 },
    ...Array.from({ length: legs }, (_, i) => ({ type: 'leg-resume', ts, seq: 4 + i })),
    ...(outcome ? [{ type: 'job-end', outcome, spentUsd: 0.1, spendComplete: true, ts, seq: 10 }] : []),
  ];
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000); utimesSync(spine, old, old);
  appendRun({ at, runid, job, spine, patient: null, via: 'run-u' }, { home });
}

test('runNo: oldest first per job, a resume keeps one number, died/stopped numbered, jobs separate, detail matches list', () => {
  const home = tmp();
  // appended out of chronological order on purpose
  addRun(home, { runid: 'b2', job: 'alpha', at: '2026-10-02T10:00:00.000Z', outcome: 'green', legs: 1 }); // resumed once
  addRun(home, { runid: 'a1', job: 'alpha', at: '2026-10-01T10:00:00.000Z', outcome: 'stopped' });
  addRun(home, { runid: 'c3', job: 'alpha', at: '2026-10-03T10:00:00.000Z' }); // no job-end, old spine: died
  addRun(home, { runid: 'x1', job: 'beta', at: '2026-10-05T10:00:00.000Z', outcome: 'green' });
  const list = listRuns({ home });
  const no = Object.fromEntries(list.map((r) => [r.runid, r.runNo]));
  assert.deepEqual(no, { a1: 1, b2: 2, c3: 3, x1: 1 });
  for (const r of list) assert.equal(getRunDetail(r.runid, { home }).runNo, r.runNo, `detail ${r.runid}`);
  assert.equal(getRunDetail('nope', { home }), null);
});
