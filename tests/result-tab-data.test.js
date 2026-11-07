// R7b item 4: the generic Result tab's server side, on REAL archived spines (tests/fixtures/result-tab: mvkj03w7 green with 3 cut diffs and a floor spend,
// mvy0cx24 escalated with one red close stage, mw1zse2m a ticket job). The rubric tab is the other half of the rule: its /result payload is the OLD
// code's, byte for byte (tests/fixtures/result-tab/rubric-result.golden.json, written by the pre-change server from the committed part5 fixtures).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResultWorld, makeRepoWithBranch, git } from './result-tab-world.mjs';
import { makePart5World } from './part5-world.mjs';
import { getRunResult, getRunDetail } from '../src/panel/server.js';
import { stageQuestionsByName } from '../src/stagewords.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'result-tab');
const readJson = (f) => JSON.parse(readFileSync(join(FX, f), 'utf8'));

test('green run mvkj03w7: the tab shows for a non-rubric run that ended, with the job, the diff header counted over every edit, the last edit shown', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const opts = { home: w.home };
  assert.equal(getRunDetail('mvkj03w7', opts).hasResult, true);
  const r = getRunResult('mvkj03w7', opts);
  assert.ok(r, 'a payload');
  assert.equal(r.kind, 'generic');
  const spec = readJson('mvkj03w7.resolved-spec.json');
  assert.equal(r.job.asked, spec.goal);
  assert.deepEqual(r.job.scope, ['src/**']);
  assert.equal(r.ticket, null);
  const c = r.changed;
  assert.equal(c.head, '1 file · src/checks.js · +123 −6 lines over 3 edits'.replace('−6', '−26'));
  assert.equal(c.edits, 3);
  assert.equal(c.all.length, 3);
  assert.equal(c.last.files.length, 1);
  assert.match(c.last.files[0].diff, /^diff --git a\/src\/checks\.js/);
  assert.match(c.last.files[0].diff, /killed = typeof err/, 'the LAST edit\'s diff, not the first');
  assert.equal(c.last.note, '...(the last edit only; 26 more lines cut)', 'the record\'s own cut count');
  assert.equal(c.foldWords, 'show every edit of the run (3)');
  assert.equal(c.scopeLine, 'only src/ was allowed; the run wrote 1 file, no other.');
});

test('green run mvkj03w7: the checks are the close\'s own stages in the existing question words, with the number each read; the close\'s notes fold', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const r = getRunResult('mvkj03w7', { home: w.home });
  const spec = readJson('mvkj03w7.resolved-spec.json');
  const q = stageQuestionsByName(spec);
  const k = r.checks;
  assert.equal(k.head, '7 of 7 passed · the close ran them after the worker stopped');
  assert.equal(k.stages.length, 7);
  assert.deepEqual(k.stages.map((s) => s.question), k.stages.map((s) => q.get(s.name)), 'the one owner\'s words, never new text');
  assert.equal(k.stages[0].question, 'did it change any file?');
  assert.ok(k.stages.every((s) => s.passed && s.status.word === 'passed'));
  const target = k.stages.find((s) => s.name === 'typecheck-target-zero-errors');
  assert.deepEqual([target.value, target.baseline, target.direction, target.baselineKind], [0, 0, 'lower-is-better', 0]);
  assert.equal(k.notes.length, 3, 'every stage that carries notes, in order (the mockup listed two of the three)');
  assert.deepEqual(k.notes.map((n) => n.name), ['typecheck-target-zero-errors', 'tests-kept', 'suite-zero-failing-tests']);
  assert.match(k.notes[0].text, /46 matching line\(s\) dropped by the scope filter/);
});

test('green run mvkj03w7: the run box is honest about a floor, names its steps and says no replan; the door words ride along', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const r = getRunResult('mvkj03w7', { home: w.home });
  assert.equal(r.run.spent, 'at least $0.12');
  assert.equal(r.run.spentNote, 'a floor: some rounds were unpriced');
  assert.match(r.run.time, /^\d+m\d\ds$/);
  assert.equal(r.run.steps, '2 steps (annotate-checks-strict, final-strict-clean), no replan');
  assert.ok(r.door.head && r.door.ask);
});

test('the work box shows ONLY while the work branch still exists in the repo; the commands are text', () => {
  const w = makeResultWorld(['mvkj03w7'], { repoFor: { mvkj03w7: true } });
  const opts = { home: w.home };
  assert.equal(getRunResult('mvkj03w7', opts).work, null, 'no repo on disk yet: no box');
  const repo = makeRepoWithBranch(w.root, 'bareloop-pulselog-panel-strict-5');
  const wk = getRunResult('mvkj03w7', opts).work;
  assert.deepEqual(wk, {
    branch: 'bareloop-pulselog-panel-strict-5', finalCommit: repo.final.slice(0, 7), madeFrom: 'f3206b2', repo: repo.repo,
    merge: 'git merge bareloop-pulselog-panel-strict-5', drop: 'git branch -D bareloop-pulselog-panel-strict-5',
    note: 'shown as text; the merge is yours, no button runs it.',
  });
  git(repo.repo, 'branch', '-D', 'bareloop-pulselog-panel-strict-5');
  assert.equal(getRunResult('mvkj03w7', opts).work, null, 'the branch is gone: no box, but the diff still shows from the spine');
  assert.equal(getRunResult('mvkj03w7', opts).changed.edits, 3);
});

test('a FAILED run (mvy0cx24, escalated) has the tab too: what it changed and which check said no', () => {
  const w = makeResultWorld(['mvy0cx24']);
  const opts = { home: w.home };
  assert.equal(getRunDetail('mvy0cx24', opts).hasResult, true);
  const r = getRunResult('mvy0cx24', opts);
  assert.equal(r.kind, 'generic');
  assert.equal(r.checks.head, '6 of 7 passed · the close ran them after the worker stopped');
  const bad = r.checks.stages.filter((s) => !s.passed);
  assert.deepEqual(bad.map((s) => [s.name, s.status.word]), [['no-suppressions', 'failed']]);
  assert.equal(bad[0].question, 'no casts or silencers added?');
  assert.equal(r.changed.edits, 4);
  assert.match(r.changed.head, /^1 file · src\/checks\.js · \+\d+ −\d+ lines over 4 edits$/);
  assert.match(r.run.steps, /^3 steps \(.*\), 1 replan$/);
  assert.equal(r.run.spentNote, null, 'complete spend: no floor words');
  assert.equal(r.run.spent, '$0.67');
});

test('a ticket job (mw1zse2m) carries the ticket its run read: number, title, link; a job with none carries null', () => {
  const w = makeResultWorld(['mw1zse2m', 'mvkj03w7']);
  const opts = { home: w.home };
  assert.deepEqual(getRunResult('mw1zse2m', opts).ticket, { number: 7, title: 'fwdloop test: P1 walk 2', url: 'https://github.com/hamr0/hol-guard/issues/7' });
  assert.equal(getRunResult('mvkj03w7', opts).ticket, null);
});

test('a run that has not ended has no tab and no payload', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const spine = w.spine('mvkj03w7');
  const kept = readFileSync(spine, 'utf8').split('\n').filter((l) => l && !l.includes('"type":"job-end"')).join('\n') + '\n';
  writeFileSync(spine, kept);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  assert.equal(getRunDetail('mvkj03w7', { home: w.home }).hasResult, false);
  assert.equal(getRunResult('mvkj03w7', { home: w.home }), null);
});

test('a run with no recorded edit and no close still gets the tab with those boxes null, never invented', () => {
  const w = makeResultWorld(['mvkj03w7']);
  const spine = w.spine('mvkj03w7');
  writeFileSync(spine, readFileSync(spine, 'utf8').split('\n').filter((l) => l && !/"type":"(attempt-diff|outer-close)"/.test(l)).join('\n') + '\n');
  const r = getRunResult('mvkj03w7', { home: w.home });
  assert.equal(r.kind, 'generic');
  assert.equal(r.changed, null);
  assert.equal(r.checks, null);
});

test('RUBRIC = A: the real rubric runs\' /result payload is exactly what the old code produced (no kind key, nothing added or moved)', () => {
  const w = makePart5World();
  const delivered = join(dirname(w.out('mve5y8fa')), 'delivered', 'steps', '1-2026-10-18.json');
  mkdirSync(dirname(delivered), { recursive: true });
  copyFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.step-1-2026-10-18.json'), delivered);
  const spine = w.spine('mve5y8fa');
  const text = readFileSync(spine, 'utf8');
  const rec = JSON.parse(text.split('\n').find((l) => l.includes('"type":"destination-written"')));
  writeFileSync(spine, text.replace(rec.path, delivered));
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  for (const id of ['mve5y8fa', 'mvdg1xo3']) utimesSync(w.spine(id), old, old);
  const golden = readJson('rubric-result.golden.json');
  for (const id of ['mve5y8fa', 'mvdg1xo3']) {
    const now = JSON.parse(JSON.stringify(getRunResult(id, { home: w.home })).split(delivered).join('<DELIVERED>'));
    assert.equal('kind' in now, false, `${id}: no kind key`);
    assert.deepEqual(now, golden[id], `${id}: payload unchanged`);
  }
});
