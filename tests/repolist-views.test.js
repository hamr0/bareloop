// Addendum 2026-11-15 (d) piece 5: every view of a repo job reads the signed list's rows and nothing else (Job tab, signed card, Audit, success line, sign-time match). A rule is kept only when the fence row says so;
// every other rule is Not checked with code's reason; an `!` row's result is its recorded stage verdict, the fence-kept `~` row reads the gate's record. An old signed repo spec (no list) keeps today's display.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repoList } from './repo-list-world.mjs';
import { REASON } from '../src/checkblock.js';
import { planFromSpec, planFromConfirm, auditChecksOf } from '../src/panel/jobplan.js';
import { cardOfClose, planMatchesClose, listMatchesClose } from '../src/rubricstep.js';
import { successFromSpec } from '../src/panel/server.js';

const old = JSON.parse(readFileSync(new URL('./fixtures/repo-list/smw6ssquvtvqs-spec.json', import.meta.url), 'utf8'));
const files = ['package.json', 'src/sum.js', 'test/sum.test.js'];
const GUARDS = ['changed-from-seed', 'no-suppressions'];
/** `kept`: the rule says (in the person's own words) that package.json stays as it is and the AI points at it, so code keeps it by the write fence; else the rule names no repo path and is Not checked */
const specWith = (/** @type {any} */ extra = {}) => {
  const jobLines = extra.kept ? [{ ...old.jobLines[0], rule: 'do not change package.json', rules: ['do not change package.json'] }] : old.jobLines;
  return { ...old, jobLines, closeDecl: { ...old.closeDecl, list: repoList({ jobLines, stages: extra.refused ? old.closeDecl.stages.filter((/** @type {any} */ x) => GUARDS.includes(x.name)) : old.closeDecl.stages, refused: extra.refused ?? null, point: extra.kept ? [{ op: 'fence', line: 1, rule: 1, path: 'package.json' }] : [], guardNames: GUARDS, writeScope: old.writeScope, files }) } };
};

test('Job tab: the rule is Not checked with code\'s reason (tagged [you]), the stages are `!` rows, the guards and the fence are `$` rows, and the AI notes are not shown', () => {
  const plan = planFromSpec(specWith());
  const line = plan.lines[0];
  assert.deepEqual(line.refused, [`"no new dependencies" — ${REASON.noRule}`]);
  assert.equal(plan.notCheckedBy?.[line.refused[0]], 'you');
  assert.deepEqual(line.checks.map((c) => [c.stage, c.by, c.key]), ['node-test-executed-count', 'node-test-fail-count', 'suite-green'].map((n) => [n, 'agent', `S.${n}`]));
  assert.deepEqual(plan.loose.map((c) => [c.by, c.key]), [['default', 'J.$guard.changed-from-seed'], ['default', 'J.$guard.no-suppressions'], ['default', 'J.$fence']]);
  assert.deepEqual(plan.notChecked, [], 'closeDecl.notes is no view item of a list-carrying close');
  assert.deepEqual(plan.alwaysOn, []);
});

test('a rule the fence keeps (proven by code) is a check row of its line, tagged [you], and is no Not checked item', () => {
  const plan = planFromSpec(specWith({ kept: true }));
  const line = plan.lines[0];
  assert.deepEqual(line.refused, []);
  const kept = line.checks.find((c) => c.key === 'L1.~1');
  assert.ok(kept, 'the kept rule is a row');
  assert.equal(kept.by, 'you');
  assert.match(kept.name, /^"do not change package\.json" — kept by the write fence: package\.json is outside the places the run may change$/);
});

test('a kept rule whose fence is a folder glob reads as the folder, the same form fenceQuestionText gives (not the raw `test/**`)', () => {
  const spec = specWith({ kept: true });
  const row = spec.closeDecl.list.find((/** @type {any} */ r) => r.kind === 'rule' && typeof r.fence === 'string');
  row.fence = 'test/**';
  const kept = planFromSpec(spec).lines[0].checks.find((/** @type {any} */ c) => c.key === 'L1.~1');
  assert.match(kept.name, /^"do not change package\.json" — kept by the write fence: test\/ is outside the places the run may change$/);
});

test('Audit: a fence-kept `~` row reads the gate\'s record; an `!` row its own stage verdict; a Not checked row has no result', () => {
  const plan = planFromSpec(specWith({ kept: true }));
  const results = new Map([['node-test-executed-count', true], ['node-test-fail-count', true], ['suite-green', false], ['changed-from-seed', true], ['no-suppressions', true]]);
  const a = auditChecksOf(plan, [], results, 2, true);
  const by = (/** @type {string} */ k) => a.checks.find((c) => c.key === k);
  const guard = (/** @type {string} */ k) => a.always.find((c) => c.key === k);
  assert.deepEqual([by('L1.~1')?.result, by('L1.~1')?.word], ['held', 'held · 2 writes blocked']);
  assert.equal(by('S.suite-green')?.result, 'failed');
  assert.equal(by('S.node-test-fail-count')?.result, 'passed');
  assert.equal(guard('J.$guard.no-suppressions')?.result, 'passed');
  assert.equal(auditChecksOf(plan, [], results, null, true).checks.find((c) => c.key === 'L1.~1')?.result, 'record-missing');
  const nc = auditChecksOf(planFromSpec(specWith()), [], results, 2, true);
  assert.ok(nc.notChecked.every((r) => r.result === 'not-checked'));
  assert.equal(nc.notChecked.length, 1);
});

test('a line refused without naming a rule is a `!` Not checked row on that line, in the drafter\'s words, shown once', () => {
  const spec = specWith({ refused: [{ line: 1, reason: 'nothing here can read the ticket' }] });
  const plan = planFromSpec(spec);
  assert.ok(plan.lines[0].refused.includes(REASON.noRule), 'the reason is code\'s (REASON.noRule), not the drafter\'s words');
  assert.equal(plan.lines[0].refused.filter((r) => r === REASON.noRule).length, 1);
  assert.equal(plan.notCheckedBy?.[REASON.noRule], 'agent');
});

test('the success line and the signed card read the rows; the sign-time match holds between them', () => {
  const spec = specWith({ kept: true });
  const success = String(successFromSpec(spec));
  assert.match(success, /exit clean\?/);
  assert.match(success, /kept by the write fence/);
  const card = cardOfClose({ closeDecl: spec.closeDecl, jobLines: spec.jobLines });
  assert.equal(card.checkItems.filter((c) => c.by === 'you').length, 1);
  assert.deepEqual(card.notChecked, []);
  assert.deepEqual(planMatchesClose(card.checkItems, spec.closeDecl, spec.jobLines), { ok: true });
  assert.equal(listMatchesClose(spec.closeDecl).ok, true);
  const conf = planFromConfirm(spec.jobLines, { checkItems: card.checkItems, protections: [] });
  assert.equal(conf.lines[0].checks.length, 4);
});

test('an OLD signed repo spec (no list) keeps today\'s display and never crashes', () => {
  const plan = planFromSpec(old);
  assert.ok(plan.notChecked.length > 0, 'its notes are still shown');
  assert.equal(plan.lines[0].checks.length, 3);
  assert.match(String(successFromSpec(old)), /suite-green/);
  assert.equal(auditChecksOf(plan, [], null, null, false).checks.length >= 3, true);
});
