// hamr 2026-11-12: "checks that are checkable and agreed should be part of the plan and should be verified." (ported from tests/look-tied-rule.test.js, which drove the deleted applyLedger look credit)
// Live: draft session smwdiy4k3bk0v ("under $450"): the look tied the price fact to rule 1; the old chain dropped the list row ("a ~ rule wins"), refused the fact "not on the list" and fired
// rubric-rule-dropped on every try. On the block the look's fact is a LINK on the `~` row: the rule is built with its bound, or Not checked in plain words, and the gate sees a covered rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CheckBlock } from '../src/checkblock.js';
import { checkRubricRules } from '../src/rubricstep.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/look-tied-rule/rows.json', import.meta.url), 'utf8'));
const PAGE = 'Flights\nBoston Logan International Airport\nFrom $389 US dollars\nFrom $431 US dollars\nFrom $512 US dollars\n';
/** the live look's two facts, back in the look's own shape (the saved rows plus the saved declaration's price fact) */
const lookFacts = (/** @type {{reading?: any, forRule?: number}} */ o = {}) => [
  { line: 1, name: 'origin airport', shape: 'phrase', source: 'flights', words: ['Boston Logan International Airport'] },
  { line: 1, name: 'price', shape: 'money', source: 'flights', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.', forRule: o.forRule ?? 1, ...(o.reading !== undefined ? { reading: o.reading } : {}) },
];
const READ = fx.rows.find((/** @type {any} */ r) => r.name === 'price').reading;
function made(/** @type {any[]} */ facts, /** @type {string[]} */ rules = ['under $450']) {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob([{ n: 1, text: fx.jobLines[0].text, rules }]);
  b.addLook(facts);
  const close = b.reconcile();
  /** @type {string[]} */ const reds = [];
  const refused = b.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) }));
  checkRubricRules(close.stages, { jobLines: [{ n: 1, text: fx.jobLines[0].text, rules }], refused, red: (/** @type {string} */ code) => reds.push(code) });
  const part = close.parts.find((/** @type {any} */ p) => p.class === 'fact');
  return { b, close, reds, part, price: part?.facts.find((/** @type {any} */ f) => f.name === 'price') };
}

test('(a/c) the look ties the price fact to rule 1 and carries lt 450: the rule is built, the part carries rule 1, price keeps lt 450 USD, no rubric-rule-dropped, no refusal', () => {
  const { b, reds, part, price } = made(lookFacts({ reading: READ }));
  assert.deepEqual(READ, { op: 'lt', value: 450 });
  assert.deepEqual(reds, []);
  assert.deepEqual(part.rules, [1]);
  assert.deepEqual(price.rule, { op: 'lt', value: 450 });
  assert.equal(price.currency[0], '$');
  assert.ok(!('rules' in price), 'a fact never carries rules');
  assert.equal(b.rows.find((r) => r.kind === 'rule')?.state, 'built');
  assert.equal(b.rows.some((r) => r.key === 'L1.fact.price'), false, 'the tied fact is a link on the rule, never a second row');
  assert.equal(b.rows.find((r) => r.key === 'L1.fact.origin airport')?.state, 'built');
});

test('(b) the look carries no bound: by hamr\'s ruling A (2026-11-12) code reads the limit from the person\'s own words ("under $450"), so the rule is built (design change: it was Not checked)', () => {
  const { b, reds, part, price } = made(lookFacts());
  assert.deepEqual(reds, []);
  assert.deepEqual(part.rules, [1]);
  assert.deepEqual(price.rule, { op: 'lt', value: 450 });
  assert.equal(b.rows.find((r) => r.kind === 'rule')?.can.readBy, 'your words');
  assert.ok(!price.aiProposal, 'the bound is the person\'s own words, so it is not the AI\'s proposal');
});

test('(d) no bound anywhere (the rule\'s words give none code can read) -> the rule is NOT credited, stays Not checked in plain words, and the gate sees it as refused (no rubric-rule-dropped)', () => {
  const { b, reds, part } = made(lookFacts(), ['cheap enough']);
  assert.ok(!(part?.rules ?? []).includes(1), 'rule 1 is not credited');
  assert.ok(!(part?.facts ?? []).some((/** @type {any} */ f) => f.name === 'price'), 'the bound-less price fact is not signed');
  const rule = b.rows.find((r) => r.kind === 'rule');
  assert.equal(rule?.state, 'not-checked');
  assert.match(String(rule?.reason), /gave no limit|no limit/);
  assert.deepEqual(reds, []);
});

test('(d2) an AI reading edit gives the bound for words code cannot read: the rule is built as the AI\'s proposal for the person to agree to', () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'], asks: false });
  b.fromJob([{ n: 1, text: fx.jobLines[0].text, rules: ['cheap enough'] }]);
  b.addLook(lookFacts());
  const rec = b.applyDelta({ edits: [{ op: 'reading', line: 1, rules: [1], fact: 'price', reading: { op: 'lt', value: 450 } }] });
  const close = b.reconcile();
  assert.deepEqual(rec.edits.map((e) => e.accepted), [true]);
  const price = close.parts.find((/** @type {any} */ p) => p.class === 'fact').facts.find((/** @type {any} */ f) => f.name === 'price');
  assert.deepEqual(price.rule, { op: 'lt', value: 450 });
  assert.equal(price.aiProposal, true, 'the bound is not in the person\'s words: the card says so');
});

test('(e) a junk fact is refused ALONE (its words are not on the page); the matched look fact beside it stays', () => {
  const b = new CheckBlock({ texts: { flights: PAGE }, labels: ['flights'] });
  b.fromJob([{ n: 1, text: fx.jobLines[0].text, rules: ['under $450'] }]);
  b.addLook(lookFacts({ reading: READ }));
  const rec = b.applyDelta({ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'junk', source: 'flights', words: ['zzz'] }] });
  const close = b.reconcile();
  assert.match(rec.edits[0].refusedBecause, /not in the input/);
  assert.ok(close.parts.find((/** @type {any} */ p) => p.class === 'fact').facts.some((/** @type {any} */ f) => f.name === 'price'));
});

test('a look fact whose rule number is past the line\'s rule count ties nothing: it stands as its own `!` row and rule 1 is not built from it', () => {
  const { b } = made(lookFacts({ reading: READ, forRule: 2 }));
  const rule = b.rows.find((r) => r.kind === 'rule');
  assert.equal(rule?.links, undefined);
  assert.notEqual(rule?.state, 'built');
  assert.ok(b.rows.some((r) => r.key === 'L1.fact.price' && r.by === 'agent'));
});
