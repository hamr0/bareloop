// P6 item 1 — the Ended block of a run that worked on a worktree in the person's own repo. GREEN: the branch carries the
// work, so the block shows `git merge <branch>` and `git branch -D <branch>` as TEXT. Any other ending: the worktree folder
// stays, so the block names it. Real spine files and a real `source.json` on disk, read through the real `getRunDetail`.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, readFileSync,
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

test('endedFor: a GREEN worktree run is one instruction per row: the repo, then the two git commands as text', () => {
  const e = endedFor(summary('green'), alive, { worktree: wt() });
  assert.equal(e.reason, 'Goal met.');
  assert.deepEqual(e.rows, [['in:', '/r'], ['keep the work:', 'git merge bareloop-job'], ['throw it away:', 'git branch -D bareloop-job']]);
  assert.equal(e.next, 'in: /r\nkeep the work: git merge bareloop-job\nthrow it away: git branch -D bareloop-job', 'next is the plain text of the rows');
  assert.deepEqual(e.actions, [{ id: 'reuse', label: 'Reuse workflow' }], 'the buttons are unchanged — merge is never a button');
});

test('endedFor: a GREEN worktree run whose folder is still there says so as a row; with no branch recorded it falls back to the plain text', () => {
  assert.deepEqual(endedFor(summary('green'), alive, { worktree: wt({ exists: true }) }).rows.at(-1), ['folder still there:', '/r/.bareloop/wt/s1']);
  const none = endedFor(summary('green'), alive, { worktree: wt({ branch: null }) });
  assert.equal(none.next, 'Nothing to do.');
  assert.equal(none.rows, undefined);
});

test('endedFor: stopped / capped / died name the worktree folder; a gone folder adds nothing', () => {
  const resume = { ok: true };
  const cap = endedFor(summary('cap-halt'), alive, { worktree: wt({ exists: true }), resume });
  assert.deepEqual(cap.rows, [['raise the cap:', 'Cap $ on the Chat card'], ['then:', 'press Resume'], ['your work is in:', '/r/.bareloop/wt/s1']]);
  assert.equal(endedFor(summary('stopped'), alive, { worktree: wt({ exists: true }), resume }).next, 'Resume. Your work is in /r/.bareloop/wt/s1.');
  assert.match(endedFor(summary(null), { died: true, lastThing: 'a step' }, { worktree: wt({ exists: true }), resume }).next, /Your work is in \/r\/\.bareloop\/wt\/s1\.$/);
  const gone = endedFor(summary('cap-halt'), alive, { worktree: wt({ exists: false }), resume });
  assert.deepEqual(gone.rows, [['raise the cap:', 'Cap $ on the Chat card'], ['then:', 'press Resume']]);
});

test('endedFor: no worktree = the sentences are exactly what they always were', () => {
  assert.equal(endedFor(summary('green'), alive, {}).next, 'Nothing to do.');
  assert.equal(endedFor(summary('green'), alive, { worktree: null }).next, 'Nothing to do.');
});

test('getRunDetail: a green worktree run reads its branch off the spine and its repo off source.json', () => {
  const home = tmp();
  makeWorktreeRun(home, { outcome: 'green', folderExists: false });
  const d = getRunDetail('run1', { home });
  assert.deepEqual(d.ended.rows.map((r) => r[0]), ['in:', 'keep the work:', 'throw it away:', 'reusable bundle:']);
  assert.equal(d.ended.rows[1][1], 'git merge bareloop-fix-types');
  assert.match(d.ended.rows[3][1], /^bareloop export "[^"]+ \(run-1\)" --out <folder>$/);
});

test('endedFor: the export row (PRD v1.114) sits with the merge rows of a GREEN worktree run only, as text, with the panel\'s own run name', () => {
  const e = endedFor(summary('green'), alive, { worktree: wt(), exportName: 'my-job (run-3)' });
  assert.deepEqual(e.rows, [['in:', '/r'], ['keep the work:', 'git merge bareloop-job'], ['throw it away:', 'git branch -D bareloop-job'], ['reusable bundle:', 'bareloop export "my-job (run-3)" --out <folder>']]);
  assert.deepEqual(e.actions, [{ id: 'reuse', label: 'Reuse workflow' }], 'text, never a button');
  assert.doesNotMatch(endedFor(summary('cap-halt'), alive, { worktree: wt({ exists: true }), resume: { ok: true }, exportName: 'my-job (run-3)' }).next, /bareloop export/);
  assert.equal(endedFor(summary('green'), alive, { exportName: 'my-job (run-3)' }).next, 'Nothing to do.', 'no worktree = not a repo job in the panel: nothing shown');
});

test('getRunDetail: a capped worktree run whose folder exists names the folder; Resume is withdrawn once the folder is gone', () => {
  const home = tmp();
  const { folder } = makeWorktreeRun(home, { outcome: 'cap-halt', folderExists: true });
  const d = getRunDetail('run1', { home });
  assert.deepEqual(d.ended.rows.at(-1), ["your work is in:", folder], JSON.stringify(d.ended.rows));

  const home2 = tmp();
  makeWorktreeRun(home2, { outcome: 'cap-halt', folderExists: false });
  const gone = getRunDetail('run1', { home: home2 });
  assert.deepEqual(gone.ended.actions, [{ id: 'reuse', label: 'Reuse workflow' }], 'no Resume button for a worktree the engine would refuse to re-enter');
  assert.match(gone.ended.next, /its worktree folder .* is gone/);
});

// fwdloop's shape (hamr 2026-10-25): NEXT with several instructions is a two-column grid of label + instruction rows inside the NEXT cell, so a
// long command wraps under the instruction column; no rows = the old one-line row.
const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
function pageFn(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
// eslint-disable-next-line no-new-func
const nextRow = new Function(`${['escapeXml', 'summaryRow', 'nextRow'].map(pageFn).join('\n')}\nreturn nextRow;`)();

test('NEXT page markup: rows become label cells + instruction cells in one grid inside the NEXT cell; no rows keeps the one-line row', () => {
  const e = endedFor(summary('green'), alive, { worktree: wt(), exportName: 'pulselog-panel-strict (run-1)' });
  const html = nextRow(e);
  assert.match(html, /^<div class="ended-row"><span class="ended-label">NEXT<\/span><span class="ended-text next-rows" data-testid="ended-next">/);
  assert.match(html, /<span class="next-row" style="display:contents"><span class="next-label">keep the work:<\/span><span class="next-text">git merge bareloop-job<\/span><\/span>/);
  assert.match(html, /<span class="next-label">reusable bundle:<\/span><span class="next-text">bareloop export &quot;pulselog-panel-strict \(run-1\)&quot; --out &lt;folder&gt;<\/span>/);
  assert.equal(nextRow({ next: 'Resume.' }), '<div class="ended-row"><span class="ended-label">NEXT</span><span class="ended-text" data-testid="ended-next">Resume.</span></div>');
  assert.equal(nextRow({ next: 'x', rows: [['a:', 'b']] }), '<div class="ended-row"><span class="ended-label">NEXT</span><span class="ended-text" data-testid="ended-next">x</span></div>', 'fewer than two rows is the one-line row');
});

test('NEXT page CSS: the grid, the muted label token the ENDED/NEXT side labels use, and a text cell that wraps without spilling', () => {
  assert.match(PAGE, /\.next-rows\{display:grid;grid-template-columns:max-content minmax\(0,1fr\);column-gap:10px;row-gap:2px;\}/);
  assert.match(PAGE, /\.next-label\{color:var\(--text-faint\);\}/);
  assert.match(PAGE, /\.next-text\{min-width:0;overflow-wrap:anywhere;\}/);
  assert.match(PAGE, /\.ended-label\{color:var\(--text-faint\)/, 'the same token as the ENDED / NEXT / SCHEDULE side labels');
});
