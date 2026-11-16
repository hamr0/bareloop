// hamr 2026-11-15, item 1: the write fence is a `$ [default]` row of the one list, once for the whole job (line 0, key J.$fence, signed like the guard rows), under "other checks"; "Always checked" is gone for a
// job that signs it, on every view. An old close keeps today's display. The fence is not a check: hasBuiltCheck never counts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckBlock } from '../src/checkblock.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { confirmProtections } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { cardOfClose, listMatchesClose } from '../src/rubricstep.js';
import { planFromSpec, planFromConfirm, auditChecksOf } from '../src/panel/jobplan.js';
import * as AR from '../src/authorrun.js';

const PAGE = 'Flights\nFrom $389 US dollars\n';
const JOB = [{ n: 1, text: 'List the price', rules: [] }];
const FENCE = 'only files in output/ changed?';
function made() {
  const b = new CheckBlock({ texts: { p: PAGE }, labels: ['p'], asks: false });
  b.fromJob(JOB); b.setGuards(['changed-from-seed'], ['output/']);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'p', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.' }], []);
  const v = b.closeView();
  const closeDecl = { genre: 'text', lang: 'text', stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, ...v.stages], list: v.list, picks: v.picks };
  return { b, v, closeDecl };
}

test('the block signs one fence row (line 0, `$` default); it is not a check', () => {
  const { b, closeDecl } = made();
  assert.deepEqual(closeDecl.list.filter((/** @type {any} */ r) => r.kind === 'fence'), [{ line: 0, key: 'J.$fence', from: 'default', by: 'default', kind: 'fence', state: 'built' }]);
  assert.equal(b.rows.some((r) => r.kind === 'fence'), false);
  assert.equal(listMatchesClose(closeDecl).ok, true);
  const reds = validateCloseDecl({ genre: 'text', lang: 'text', stages: [], list: closeDecl.list.filter((/** @type {any} */ r) => r.kind === 'fence') }, { at: 'closeDecl', verdictType: 'soft-green' }).reds.filter((r) => String(r.path).startsWith('closeDecl.list['));
  assert.deepEqual(reds, []);
});

test('every view draws the fence once as a `$ [default]` check that serves no line, and "Always checked" holds nothing', () => {
  const { v, closeDecl } = made();
  const o = { verdictType: 'soft-green', lang: RUBRIC_LANG, writeScope: ['output/'], jobLines: JOB };
  assert.deepEqual(confirmProtections({ ...o, closeDecl: v }), [], 'confirm card');
  assert.deepEqual(confirmProtections({ ...o, closeDecl }), [], 'signed card');
  const items = cardOfClose({ closeDecl: v, jobLines: JOB }).checkItems;
  assert.deepEqual(items.filter((c) => c.key === 'J.$fence').map((c) => [c.text, c.by]), [[FENCE, 'default']]);
  const conf = planFromConfirm(JOB, { checkItems: items, protections: [] });
  assert.equal(conf.loose.filter((c) => c.name === FENCE).length, 1);
  assert.deepEqual(conf.alwaysOn, []);
  const plan = planFromSpec({ jobLines: JOB, closeDecl, goal: '' });
  assert.equal(plan.loose.filter((c) => c.name === FENCE && c.by === 'default').length, 1);
  assert.deepEqual(plan.alwaysOn, []);
  const ac = auditChecksOf(plan, [], null, 2);
  assert.deepEqual(ac.always, []);
  const row = ac.checks.find((c) => c.key === 'J.$fence');
  assert.deepEqual([row?.result, row?.word], ['held', 'held · 2 writes blocked']);
  assert.equal(auditChecksOf(plan, [], null, null).checks.find((c) => c.key === 'J.$fence')?.result, 'record-missing');
  const cli = AR.confirmPlanLines({ goal: 'g', checkItems: items, protections: [], notChecked: [], questions: [] }).join('\n');
  assert.match(cli, /\$ \[default\] only files in output\/ changed\?/);
  assert.doesNotMatch(cli, /protections \(always-on/);
});

test('an OLD close (no fence row) keeps its Always-checked fence line', () => {
  const { closeDecl } = made();
  const old = { ...closeDecl, list: closeDecl.list.filter((/** @type {any} */ r) => r.kind !== 'fence' && r.kind !== 'guard') };
  assert.ok(confirmProtections({ verdictType: 'soft-green', lang: RUBRIC_LANG, writeScope: ['output/'], jobLines: JOB, closeDecl: old }).includes('write fence — the run may only change files matching: output/'));
});
