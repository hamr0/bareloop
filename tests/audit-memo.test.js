// The Audit shows the memo and the learnings where they were passed (ITEM33-BUILD addendum 2026-11-02, closes F274).
// Fixture tests/fixtures/audit-memo/u-mvy0cx24.jsonl: a REAL archived spine (run mvy0cx24: three steps with several tries, a replan,
// a fix loop of two tries) whose carry-note records got an authored `text` (marked FIXTURE) except the first, which stays an "older run"
// record, and whose draft and replan got a `learnings` record (a real archived hint block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRun } from '../src/runlist.js';
import { getRunDetail } from '../src/panel/server.js';
import { attachMemos, attachLearnings, learningsHanded } from '../src/panel/handed.js';

const RUNID = 'mvy0cx24';
const FX = new URL('./fixtures/audit-memo/', import.meta.url).pathname;

function world() {
  const root = mkdtempSync(join(tmpdir(), 'audit-memo-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const dir = join(root, 'session', 'source-seed', 'pulselog-panel-strict-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FX, `u-${RUNID}.jsonl`), join(dir, `u-${RUNID}.jsonl`));
  appendRun({ at: '2026-11-01T16:51:00.000Z', runid: RUNID, job: 'pulselog-panel-strict', spine: join(dir, `u-${RUNID}.jsonl`), patient: null, via: 'run-u' }, { home });
  return { home };
}
const detail = () => getRunDetail(RUNID, world());
const part = (/** @type {any} */ d, /** @type {string} */ label) => d.parts.find((/** @type {any} */ p) => p.label === label);

test('each step try carries the memo recorded for ITS phase and iteration', () => {
  const d = detail();
  const s1 = part(d, 'survey-types-and-checks');
  assert.equal(s1.attempts.length, 2);
  assert.deepEqual(s1.attempts[0].memo, { missing: true, chars: 2726, capped: false }, 'the older-run record has no text');
  assert.match(s1.attempts[1].memo.text, /FIXTURE memo for step:survey-types-and-checks try 2$/);
  const s2 = part(d, 'fix-checks-strict-types');
  assert.match(s2.attempts[0].memo.text, /for step:fix-checks-strict-types try 1$/, 'iteration 1 of the step after the replan is not step 1 try 1');
  const s3 = part(d, 'ensure-strict-zero-and-tests');
  assert.deepEqual(s3.attempts.map((a) => a.memo.text.split(' for ')[1]), ['step:ensure-strict-zero-and-tests try 1', 'step:ensure-strict-zero-and-tests try 2']);
  assert.equal(s3.attempts[1].memo.chars, s3.attempts[1].memo.text.length);
  assert.equal(s3.attempts[1].memo.capped, false);
});

test('the fix loop: the opening close has no memo; each fix try carries its own', () => {
  const fix = detail().parts.find((p) => p.kind === 'fix');
  assert.equal(fix.attempts.length, 3);
  assert.equal(fix.attempts[0].source, 'outer-close');
  assert.equal(fix.attempts[0].memo, null);
  assert.deepEqual(fix.attempts.slice(1).map((a) => a.memo.text.split(' for ')[1]), ['fix try 1', 'fix try 2']);
});

test('learnings: the draft block lands on the plan part, the first-replan block on the replan part, nowhere else', () => {
  const d = detail();
  const plan = d.parts.find((p) => p.kind === 'plan');
  const replan = d.parts.find((p) => p.kind === 'replan');
  assert.equal(plan.learnings.phase, 'draft');
  assert.equal(plan.learnings.hints.length, 1);
  assert.equal(plan.learnings.chars, plan.learnings.text.length);
  assert.equal(replan.learnings.phase, 'replan');
  assert.deepEqual(d.parts.filter((p) => p.learnings).map((p) => p.kind), ['plan', 'replan']);
  assert.equal('learnings' in d, false, 'the old top-level field is gone');
  assert.equal('learningsError' in d, false);
});

test('the drafting part, when the run has one, hosts the draft block instead of the plan part', () => {
  const l = learningsHanded([{ type: 'learnings', phase: 'draft', text: '1. [this job, seen 1 time] check "x" failed; fixed later in the same run.\n   It said: y', ids: ['a'] }]);
  const r = attachLearnings([{ kind: 'plan' }, { kind: 'step' }], { kind: 'drafting' }, l);
  assert.equal(r.drafting.learnings.phase, 'draft');
  assert.equal(r.parts[0].learnings, undefined);
});

test('an unreadable learnings file rides on the draft host as the plain line; with no plan part it lands on the first part, never lost', () => {
  const l = learningsHanded([{ type: 'learnings', phase: 'draft', hintsError: '/h/ledger.json is not readable JSON (parse error) — fix or remove it' }]);
  assert.equal(l.draft, null);
  assert.match(l.error, /^The learnings file could not be read/);
  const r = attachLearnings([{ kind: 'step' }], null, l);
  assert.equal(r.parts[0].learningsError, l.error);
});

test('memo matching is by recorded phase+iteration and seq order: a re-entered step (iteration restarts) gets its own record per occurrence', () => {
  const rec = (seq, iteration, text) => ({ type: 'carry-note', phase: 'step:s', iteration, seq, chars: text.length, capped: false, text });
  const mkPart = (n, lo, hi) => ({ kind: 'step', label: 's', attempts: [{ n, iteration: 1, startSeq: lo, endSeq: hi }] });
  const out = attachMemos([mkPart(1, 0, 10), mkPart(1, 20, 30)], [rec(5, 1, 'first'), rec(25, 1, 'second')]);
  assert.deepEqual(out.map((p) => p.attempts[0].memo.text), ['first', 'second']);
});

test('an older record without text reads missing, with its counts', () => {
  const out = attachMemos([{ kind: 'step', label: 's', attempts: [{ iteration: 1, startSeq: 0, endSeq: 9 }] }], [{ type: 'carry-note', phase: 'step:s', iteration: 1, seq: 4, chars: 321, capped: true }]);
  assert.deepEqual(out[0].attempts[0].memo, { missing: true, chars: 321, capped: true });
});

test('a try with no carry-note record has memo null (the run had no note for it)', () => {
  const out = attachMemos([{ kind: 'step', label: 's', attempts: [{ iteration: 1, startSeq: 0, endSeq: 9 }] }], []);
  assert.equal(out[0].attempts[0].memo, null);
});
