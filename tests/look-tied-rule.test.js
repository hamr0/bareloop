// hamr 2026-11-12: "checks that are checkable and agreed should be part of the plan and should be verified."
// Live: draft session smwdiy4k3bk0v ("under $450"): the look tied the price fact to rule 1 (its list row dropped, "a ~ rule wins"), the drafter wrote the fact with rules:[1] ON THE FACT
// (or nowhere), the fact was refused "not on the list" and rubric-rule-dropped fired on every try. A look-tied fact carries its rule by code, but ONLY with a real bound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as CL from '../src/checklist.js';
import { checkRubricRules } from '../src/rubricstep.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/look-tied-rule/rows.json', import.meta.url), 'utf8'));
const clone = (/** @type {any} */ x) => structuredClone(x);
const price = (/** @type {any} */ d) => d.stages[0].params.parts[0].facts.find((/** @type {any} */ f) => f.name === 'price');
const run = (/** @type {any} */ d, rows = fx.rows) => {
  const r = CL.applyLedger(d, clone(rows), { labels: ['flights'], texts: null });
  /** @type {string[]} */ const reds = [];
  checkRubricRules(r.declaration.stages, { jobLines: fx.jobLines, refused: [], red: (/** @type {string} */ code) => reds.push(code) });
  return { r, reds };
};

test('(a) replay shape: fact-level rules:[1] and rule lt 450 -> no refusal, no rubric-rule-dropped, part carries rule 1, price keeps lt 450 USD', () => {
  const { r, reds } = run(clone(fx.declaration));
  assert.deepEqual(r.refused, []);
  assert.deepEqual(reds, []);
  const part = r.declaration.stages[0].params.parts[0];
  assert.deepEqual(part.rules, [1]);
  assert.deepEqual(price(r.declaration).rule, { op: 'lt', value: 450 });
  assert.equal(price(r.declaration).currency, '$');
  assert.ok(!('rules' in price(r.declaration)), 'a fact never carries rules');
});

test('(b) revise-1 shape: no rules anywhere -> same result', () => {
  const d = clone(fx.declaration);
  delete price(d).rules;
  const { r, reds } = run(d);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(reds, []);
  assert.deepEqual(r.declaration.stages[0].params.parts[0].rules, [1]);
  assert.deepEqual(price(r.declaration).rule, { op: 'lt', value: 450 });
});

test('(c) the drafter left the bound out, the look carries one -> filled from the look', () => {
  const d = clone(fx.declaration);
  delete price(d).rules; delete price(d).rule;
  const { r, reds } = run(d);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(reds, []);
  assert.deepEqual(price(r.declaration).rule, { op: 'lt', value: 450 });
  assert.deepEqual(r.declaration.stages[0].params.parts[0].rules, [1]);
});

test('(d) no bound anywhere -> the rule is NOT credited and stays not-checked', () => {
  const d = clone(fx.declaration);
  delete price(d).rules; delete price(d).rule;
  const rows = clone(fx.rows);
  delete rows.find((/** @type {any} */ x) => x.name === 'price').reading;
  const { r, reds } = run(d, rows);
  const part = r.declaration.stages[0].params.parts[0];
  assert.ok(!(part.rules ?? []).includes(1), 'rule 1 is not credited');
  assert.ok(!part.facts.some((/** @type {any} */ f) => f.name === 'price'), 'the bound-less price fact is not signed');
  assert.deepEqual(r.refused.map((/** @type {any} */ x) => x.words), ['price']);
  assert.deepEqual(reds, ['rubric-rule-dropped']);
  const resolved = CL.resolveLedger(clone(rows), r.declaration).find((/** @type {any} */ x) => x.kind === 'rule');
  assert.equal(resolved.state, 'not-checked');
});

test('(e) an unmatched junk fact is still refused; a matched look fact beside it is kept', () => {
  const d = clone(fx.declaration);
  d.stages[0].params.parts[0].facts.push({ name: 'junk', shape: 'phrase', phrase: 'zzz' });
  const { r } = run(d);
  assert.deepEqual(r.refused.map((/** @type {any} */ x) => x.words + ':' + x.reason), ['junk:not on the list']);
  assert.ok(price(r.declaration));
});

test('a look row whose rule number is past the line\'s rule count ties nothing', () => {
  const rows = clone(fx.rows);
  rows.find((/** @type {any} */ x) => x.name === 'price').forRule = 2;
  const d = clone(fx.declaration);
  delete price(d).rules;
  const { r } = run(d, rows);
  assert.deepEqual(r.refused.map((/** @type {any} */ x) => x.words), ['price']);
});

test('week-only phrase fact tied to a look rule behaves as before: a bare part with no rule number refuses it', () => {
  const rows = [fx.rows[0], { key: 'L1.fact.release version', line: 1, kind: 'fact', from: 'look', by: 'agent', name: 'release version', words: ['0.55.0'], forRule: 1, state: 'dropped', reason: 'a ~ rule wins: line 1 rule 1 carries it' }];
  const d = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ class: 'fact', source: 'x', text: 't', facts: [{ name: 'release version', shape: 'phrase', phrase: 'v0.55.0 of the app' }, { name: 'junk', shape: 'phrase', phrase: 'zzz' }] }] } }] };
  const r = CL.applyLedger(d, rows, { labels: ['x'], texts: { x: 'v0.55.0 of the app zzz' } });
  assert.ok(r.refused.some((/** @type {any} */ x) => x.words === 'junk'));
});
