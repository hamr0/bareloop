// B2: the readers are views of the signed list: the card's and the Job tab's Not checked, the end check ("no built row": block.hasBuiltCheck()), the retention, and the sign-time list-vs-close check.
// Over 38 REAL saved drafts (paid rounds 9 and 10, tests/fixtures/ledger-saved-specs.json, a byte copy of their resolved specs): the job lines and the fact parts are real, the block builds its own close from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose, refusedOf, listMatchesClose, checksOfClose } from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { signingStopText } from '../src/authorreadout.js';

const SAVED = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ledger-saved-specs.json', import.meta.url)), 'utf8'));
/**
 * The block this saved draft's job would have: its job lines are the real ones, the look's facts are the close's own fact parts (the saved drafts kept no look), and the inputs hold the facts' words
 * (the saved drafts kept no input text, so each label's text is made of those words).
 * @param {any} s @returns {{block: CheckBlock, closeDecl: any}}
 */
function blockOf(s) {
  const facts = s.closeDecl.stages.filter((/** @type {any} */ st) => st.kind === 'rubric-step').flatMap((/** @type {any} */ st) => st.params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts.map((/** @type {any} */ f) => ({ line: st.params.step, name: f.name, shape: f.shape ?? 'phrase', source: p.source, words: f.phrase ? [f.phrase] : [] }))));
  const labels = [...new Set(/** @type {string[]} */ (s.closeDecl.stages.flatMap((/** @type {any} */ st) => (st.kind === 'rubric-step' ? st.params.parts.filter((/** @type {any} */ p) => p.source).map((/** @type {any} */ p) => p.source) : []))))];
  const texts = Object.fromEntries(labels.map((l) => [l, facts.filter((f) => f.source === l).flatMap((f) => f.words).join('\n') || 'x']));
  const block = new CheckBlock({ texts, labels, asks: false });
  block.fromJob(s.jobLines);
  block.addLook(facts, []);
  const c = block.reconcile();
  const refused = block.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) }));
  return { block, closeDecl: { genre: 'text', lang: 'text', stages: c.stages, list: block.signedRows(), ...(refused.length ? { refused } : {}) } };
}

test('B2 over the 38 real saved drafts: the card and the Job tab read the block\'s signed rows; every row that is not built is listed under Not checked with its plain reason, and nothing is listed that is not a row', () => {
  assert.equal(SAVED.length, 38);
  let items = 0;
  for (const s of SAVED) {
    const { block, closeDecl } = blockOf(s);
    const card = cardOfClose({ closeDecl, jobLines: s.jobLines }).notChecked;
    const tab = planFromSpec({ jobLines: s.jobLines, closeDecl, goal: '' });
    for (const r of block.rows.filter((x) => x.kind === 'rule' && x.state !== 'built')) {
      items += 1;
      assert.ok(card.some((t) => t.includes(String(r.reason))), `${s.id}: the card lost the reason of ${r.key}`);
      assert.ok(tab.notChecked.some((t) => t.includes(String(r.reason))) || tab.lines.some((l) => l.refused.some((t) => t.includes(String(r.reason)))), `${s.id}: the Job tab lost ${r.key}`);
    }
    // nothing on the card that is not a row: every listed item's reason is some row's reason
    for (const t of card) assert.ok(block.rows.some((r) => r.reason && t.includes(String(r.reason))) || (closeDecl.refused ?? []).some((/** @type {any} */ x) => t.includes(x.reason)) || /what the text says/.test(t), `${s.id}: a card item that is no row: ${t}`);
  }
  assert.ok(items > 0);
});

test('B2 end check on the 38 real saved drafts: a block with a real fact built is never stopped (0 false stops); only the block\'s own reading says no check', () => {
  let withFact = 0;
  for (const s of SAVED) {
    const { block } = blockOf(s);
    const hasFact = s.closeDecl.stages.some((/** @type {any} */ st) => st.kind === 'rubric-step' && st.params.parts.some((/** @type {any} */ p) => p.class === 'fact'));
    if (hasFact) { withFact += 1; assert.equal(block.hasBuiltCheck(), true, `${s.id}: the block stops a draft that had a check`); }
    assert.equal(block.hasBuiltCheck(), block.rows.some((r) => r.kind !== 'floor' && r.state === 'built'));
  }
  assert.ok(withFact > 0);
});

test('B2 end check: a block whose rows have no built row (the floor never counts) says no check, in the very words the panel and the CLI print', () => {
  const mk = (/** @type {{rules?: string[], texts?: Record<string, string>, labels?: string[]}} */ o = {}) => { const b = new CheckBlock({ texts: o.texts ?? {}, labels: o.labels ?? [], asks: false }); b.fromJob([{ n: 1, text: 'x', rules: o.rules ?? [] }]); b.reconcile(); return b; };
  assert.equal(mk().hasBuiltCheck(), false, 'only the floor');
  assert.equal(mk({ rules: ['be nice'], texts: { X: 'a' }, labels: ['X', 'Y'] }).hasBuiltCheck(), false, 'a rule nothing can check');
  assert.equal(mk({ texts: { X: 'a' }, labels: ['X'] }).hasBuiltCheck(), true, 'the default cited row of a text line with one input is built');
  assert.match(signingStopText({ reds: [], noCheck: true }), /no check that can fail/);
  assert.doesNotMatch(signingStopText({ reds: [], noCheck: false }), /no check that can fail/);
});

test('B2 listMatchesClose on the 38 real saved drafts: the list built from a close always matches it; and each side of a mismatch is named', () => {
  for (const s of SAVED) {
    const { closeDecl } = blockOf(s);
    const r = listMatchesClose(closeDecl);
    assert.equal(r.ok, true, `${s.id}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(listMatchesClose(SAVED[0].closeDecl), { ok: true }, 'no list, nothing to compare');
  const s = SAVED.find((/** @type {any} */ x) => blockOf(x).closeDecl.list.filter((/** @type {any} */ r) => r.state === 'built' && r.kind !== 'floor').length === 1);
  const { closeDecl } = blockOf(s);
  const list = closeDecl.list;
  const i = list.findIndex((/** @type {any} */ r) => r.state === 'built' && r.kind !== 'floor');
  const ghost = listMatchesClose({ ...closeDecl, list: list.map((/** @type {any} */ r, /** @type {number} */ k) => (k === i ? { ...r, part: { line: r.line, part: 99 } } : r)) });
  assert.equal(ghost.ok, false);
  assert.match(/** @type {any} */ (ghost).error, /does not run/);
  const hidden = listMatchesClose({ ...closeDecl, list: list.filter((/** @type {any} */ _r, /** @type {number} */ k) => k !== i) });
  assert.equal(hidden.ok, false);
  assert.match(/** @type {any} */ (hidden).error, /has no row/);
});

// B2 retention: counts by who proposed and how each ended are read from the block's rows (tests/checkblock.test.js "retention() has retentionOfList's shape and counts"; the per-draft record is tested in tests/r10-retention.test.js).
test('B2 retention is read from the block rows: counts by who proposed and how each ended, one object per job line', () => {
  const b = new CheckBlock({ texts: { Changelog: '### Fixed\n' }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'a', rules: [] }, { n: 2, text: 'b', rules: [] }]);
  b.addLook([{ line: 1, name: 'fixed heading', shape: 'phrase', source: 'Changelog', words: ['### Fixed'] }, { line: 1, name: 'gone', shape: 'phrase', source: 'Changelog', words: ['no such words'] }], []);
  b.reconcile();
  assert.deepEqual(b.retention(), [{ line: 1, aiParts: 3, kept: 1, dropped: 2, picks: false }, { line: 2, aiParts: 1, kept: 1, dropped: 0, picks: false }]); // the default cited row of a fact line (Not checked: it finds facts) counts with the agent's rows
});

test('B2 refusedOf: a list not-checked row reads as the refusal; an old line-level refusal the list has no row for is kept; no list reads `refused` alone', () => {
  const jl = [{ n: 1, text: 'x', rule: 'be nice', rules: ['be nice'] }];
  const list = [{ line: 1, key: 'L1.~1', from: 'rule', by: 'you', kind: 'rule', rule: 1, state: 'not-checked', reason: 'No rule can check this.' }, { line: 1, key: 'L1.fact.price', from: 'look', by: 'agent', kind: 'fact', state: 'not-checked', reason: 'the plan did not build it' }];
  const r = refusedOf({ list, refused: [{ line: 1, reason: 'line-level' }, { line: 1, rule: 1, reason: 'old words' }] });
  assert.deepEqual(r.map((x) => [x.line, x.rule ?? null, x.label ?? null, x.reason]), [[1, 1, null, 'No rule can check this.'], [1, null, 'price', 'the plan did not build it'], [1, null, null, 'line-level']]);
  const tab = planFromSpec({ jobLines: jl, goal: '', closeDecl: { genre: 'text', lang: 'text', stages: [], list } });
  assert.deepEqual(tab.lines[0].refused, ['"be nice" — No rule can check this.', '"price" — the plan did not build it']);
  assert.deepEqual(refusedOf({ refused: [{ line: 1, rule: 1, reason: 'r' }] }).map((x) => x.fromList), [false]);
  void checksOfClose;
});

test('B2 the panel signing path refuses a close whose list and checks disagree (listMatchesClose is called beside planMatchesClose)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/panel/authorroutes.js', import.meta.url)), 'utf8');
  assert.match(src, /const lm = listMatchesClose\(spec\.closeDecl\);\s*if \(!lm\.ok\) return \{ ok: false, error: lm\.error \};/);
});

import * as jobplan from '../src/panel/jobplan.js';
import { lineRules } from '../src/rubricstep.js';
test('B3 the rulesOfLine twin of lineRules is gone: the plan reads a line\'s rules through lineRules, with the same answers', () => {
  assert.equal('rulesOfLine' in jobplan, false);
  for (const l of [{ n: 1, text: 'x', rules: ['a', '', 'b'] }, { n: 1, text: 'x', rule: 'a; b' }, { n: 1, text: 'x' }]) {
    assert.deepEqual(planFromSpec({ jobLines: [l], closeDecl: { stages: [] }, goal: '' }).lines[0].rules, lineRules(l));
    assert.deepEqual(jobplan.planFromConfirm([l], {}).lines[0].rules, lineRules(l));
  }
});

import { declarationSchema, confirmedBlock } from '../src/authorflow.js';
import { catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
test('B3 the drafter is no longer offered `covers` (a number of a confirmed check): not in its tool schema or its stage shape (the rubric drafter prompt is gone: the row-edit turn has no confirmed-plan block); confirmedBlock has no numbered form', () => {
  const walk = (o, f) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { f(k); walk(v, f); } };
  /** @type {string[]} */ const keys = [];
  walk(declarationSchema(undefined, { kinds: Object.keys(catalogueForLang(RUBRIC_LANG)) }), (k) => keys.push(k));
  assert.equal(keys.includes('covers'), false, 'the tool schema has no covers property');
  assert.doesNotMatch(JSON.stringify(catalogueForLang(RUBRIC_LANG)['rubric-step']), /covers/);
  const c = { checks: [], checkItems: [{ text: 'a', fromLine: [1] }], protections: [] };
  assert.equal(confirmedBlock(c, { numbered: true }), confirmedBlock(c));
});
