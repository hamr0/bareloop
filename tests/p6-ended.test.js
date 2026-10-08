// P6 item 1 — the Ended block of a run that worked on a worktree in the person's own repo. GREEN: the branch carries the
// work, so the block shows `git merge <branch>` and `git branch -D <branch>` as TEXT. Any other ending: the worktree folder
// stays, so the block names it. Real spine files and a real `source.json` on disk, read through the real `getRunDetail`.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { endedFor, getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'p6-ended-')); tmpDirs.push(d); return d; };

const SPEC = { job: 'fix-types', description: 'p6 fixture', budgetUsd: 8, maxWallMs: 3_600_000, goal: 'make types clean' };

/** one run laid out the way a panel-authored WORKTREE run is: source.json names the worktree + repo */
function makeWorktreeRun(home, { outcome, folderExists, branch = 'bareloop-fix-types' }) {
  const out = tmp();
  const into = join(out, 'source-seed');
  const dir = join(into, 'fix-types-bareloop');
  mkdirSync(dir, { recursive: true });
  const repo = join(out, 'repo');
  const folder = join(repo, '.bareloop', 'wt', 'sess1');
  if (folderExists) mkdirSync(folder, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: repo, destination: 'src/', worktree: folder, repo }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(SPEC));
  const t = (n) => `2026-10-05T10:0${n}:00.000Z`;
  const records = [
    { type: 'job-start', job: SPEC.job, specHash: jobSpecHash(SPEC), budgetUsd: SPEC.budgetUsd, shape: 'plan', goal: SPEC.goal, ts: t(0), seq: 1 },
    { type: 'work-branch', branch, created: true, resumed: false, from: null, base: 'abc', repo: folder, ts: t(1), seq: 2 },
    { type: 'plan-accepted', plan: { schema: 'plan-v1', steps: [{ id: 'fix-types' }] }, ts: t(1), seq: 3 },
    { type: 'worker-round', kind: 'turn', costUsd: 8, ts: t(2), seq: 4 },
    { type: 'job-end', outcome, spentUsd: 8, spendComplete: true, ts: t(5), seq: 99 },
  ];
  const spine = join(dir, 'u-run1.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({ at: '2026-10-05T10:00:00.000Z', runid: 'run1', job: SPEC.job, spine, patient: folder, via: 'run-u' }, { home });
  return { folder, repo };
}

const wt = (o = {}) => ({ folder: '/r/.bareloop/wt/s1', repo: '/r', branch: 'bareloop-job', exists: false, ...o });
const summary = (outcome) => ({ outcome, stopReason: null, spentUsd: 8, budgetUsd: 8 });
const alive = { died: false, lastThing: null };

test('endedFor: a GREEN worktree run shows the two git commands as text, naming the repo and the branch', () => {
  const e = endedFor(summary('green'), alive, { worktree: wt() });
  assert.equal(e.reason, 'Goal met.');
  assert.equal(e.next, 'In /r: git merge bareloop-job — or throw the work away: git branch -D bareloop-job.');
  assert.deepEqual(e.actions, [{ id: 'reuse', label: 'Reuse workflow' }], 'the buttons are unchanged — merge is never a button');
});

test('endedFor: a GREEN worktree run whose folder is still there says so; with no branch recorded it falls back to the plain text', () => {
  assert.match(endedFor(summary('green'), alive, { worktree: wt({ exists: true }) }).next, /The worktree folder \/r\/\.bareloop\/wt\/s1 is still there\.$/);
  assert.equal(endedFor(summary('green'), alive, { worktree: wt({ branch: null }) }).next, 'Nothing to do.');
});

test('endedFor: stopped / capped / died name the worktree folder; a gone folder adds nothing', () => {
  const resume = { ok: true };
  assert.equal(endedFor(summary('cap-halt'), alive, { worktree: wt({ exists: true }), resume }).next,
    'Raise the cap, then Resume. Your work is in /r/.bareloop/wt/s1.');
  assert.equal(endedFor(summary('stopped'), alive, { worktree: wt({ exists: true }), resume }).next, 'Resume. Your work is in /r/.bareloop/wt/s1.');
  assert.match(endedFor(summary(null), { died: true, lastThing: 'a step' }, { worktree: wt({ exists: true }), resume }).next, /Your work is in \/r\/\.bareloop\/wt\/s1\.$/);
  assert.equal(endedFor(summary('cap-halt'), alive, { worktree: wt({ exists: false }), resume }).next, 'Raise the cap, then Resume.');
});

test('endedFor: no worktree = the sentences are exactly what they always were', () => {
  assert.equal(endedFor(summary('green'), alive, {}).next, 'Nothing to do.');
  assert.equal(endedFor(summary('green'), alive, { worktree: null }).next, 'Nothing to do.');
});

test('getRunDetail: a green worktree run reads its branch off the spine and its repo off source.json', () => {
  const home = tmp();
  makeWorktreeRun(home, { outcome: 'green', folderExists: false });
  const d = getRunDetail('run1', { home });
  assert.match(d.ended.next, /^In .*\/repo: git merge bareloop-fix-types — or throw the work away: git branch -D bareloop-fix-types\.$/);
});

test('getRunDetail: a capped worktree run whose folder exists names the folder; Resume is withdrawn once the folder is gone', () => {
  const home = tmp();
  const { folder } = makeWorktreeRun(home, { outcome: 'cap-halt', folderExists: true });
  const d = getRunDetail('run1', { home });
  assert.ok(d.ended.next.endsWith(`Your work is in ${folder}.`), d.ended.next);

  const home2 = tmp();
  makeWorktreeRun(home2, { outcome: 'cap-halt', folderExists: false });
  const gone = getRunDetail('run1', { home: home2 });
  assert.deepEqual(gone.ended.actions, [{ id: 'edit', label: 'Edit in chat' }], 'no Resume button for a worktree the engine would refuse to re-enter');
  assert.match(gone.ended.next, /its worktree folder .* is gone/);
});
