// B2: the readers are views of the signed list: the card's and the Job tab's Not checked, the end check ("no built row"), the retention, and the sign-time list-vs-close check.
// The no-loss test runs the readers over 38 REAL saved drafts (paid rounds 9 and 10, tests/fixtures/ledger-saved-specs.json, a byte copy of their resolved specs with the old readers' answers captured before this change).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as CL from '../src/checklist.js';
import { cardOfClose, refusedOf, listMatchesClose, checksOfClose } from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { isNoCheckRubricClose, noCheckStopText } from '../src/authorreadout.js';
import { retentionOf, retentionOfList } from '../src/checkpick.js';

const SAVED = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ledger-saved-specs.json', import.meta.url)), 'utf8'));
/** the list this saved close would have had: the look's facts are the close's own fact parts (the saved drafts kept no look) */
function listOf(s) {
  const facts = s.closeDecl.stages.filter((st) => st.kind === 'rubric-step').flatMap((st) => st.params.parts.filter((p) => p.class === 'fact').flatMap((p) => p.facts.map((f) => ({ line: st.params.step, name: f.name, shape: f.shape ?? 'phrase', source: p.source, words: f.phrase ? [f.phrase] : [] }))));
  const labels = [...new Set(s.closeDecl.stages.flatMap((st) => (st.kind === 'rubric-step' ? st.params.parts.filter((p) => p.source).map((p) => p.source) : [])))];
  const rows = CL.buildLedger({ jobLines: s.jobLines, look: { facts, dropped: [] }, texts: null, inputLabels: labels });
  return CL.signedRows(CL.resolveLedger(rows, s.closeDecl));
}

test('B2 no-loss over the 38 real saved drafts: every item the old card and the old Job tab listed as not checked is still listed when the close carries the list; the extras are counted', () => {
  assert.equal(SAVED.length, 38);
  let extras = 0; let items = 0;
  for (const s of SAVED) {
    const closeDecl = { ...s.closeDecl, list: listOf(s) };
    const card = cardOfClose({ closeDecl, jobLines: s.jobLines }).notChecked;
    const tab = planFromSpec({ jobLines: s.jobLines, closeDecl, goal: '' });
    for (const t of s.old.cardNotChecked) { items += 1; assert.ok(card.includes(t), `${s.id}: card lost "${t}"`); }
    for (const t of s.old.tabNotChecked) assert.ok(tab.notChecked.includes(t), `${s.id}: Job tab lost "${t}"`);
    for (const o of s.old.tabRefused) for (const t of o.refused) assert.ok(tab.lines.find((l) => l.n === o.n).refused.includes(t), `${s.id}: line ${o.n} lost "${t}"`);
    extras += card.length - s.old.cardNotChecked.length;
    // with no list the readers answer exactly as before
    for (const t of s.old.cardNotChecked) assert.ok(cardOfClose({ closeDecl: s.closeDecl, jobLines: s.jobLines }).notChecked.includes(t), `${s.id}: no-list card lost "${t}"`);
  }
  assert.ok(items > 0);
  assert.ok(extras >= 0, `extra items the old card missed: ${extras}`);
});

test('B2 end check on the 38 real saved drafts: none that had a real check is stopped (0 false stops); the old reader and the list reader agree', () => {
  for (const s of SAVED) {
    const closeDecl = { ...s.closeDecl, list: listOf(s) };
    assert.equal(isNoCheckRubricClose(s.closeDecl), s.old.noCheck);
    assert.equal(isNoCheckRubricClose(closeDecl), false, `${s.id}: the list reader stops a close that had a check`);
  }
});

test('B2 end check: a close whose list has no built row (the floor never counts) is a no-check close, with the same words', () => {
  const c = (list) => ({ lang: 'text', stages: [{ name: 'f', kind: 'files-changed', params: {} }, { name: 's', kind: 'rubric-step', params: { step: 1, parts: [{ text: 't', class: 'countable', check: 'cited', source: 'X' }] } }], list });
  const row = (o) => ({ line: 1, key: 'k', from: 'default', by: 'default', kind: 'floor', state: 'built', ...o });
  assert.equal(isNoCheckRubricClose(c([row({})])), true);
  assert.equal(isNoCheckRubricClose(c([row({ kind: 'rule', from: 'rule', by: 'you', state: 'not-checked', reason: 'x' })])), true);
  assert.equal(isNoCheckRubricClose(c([row({}), row({ kind: 'cited', key: 'k2' })])), false);
  assert.match(noCheckStopText({ closeDecl: c([row({})]) }) ?? '', /no check that can fail/);
});

test('B2 listMatchesClose on the 38 real saved drafts: the list built from a close always matches it; and each side of a mismatch is named', () => {
  for (const s of SAVED) {
    const r = listMatchesClose({ ...s.closeDecl, list: listOf(s) });
    assert.equal(r.ok, true, `${s.id}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(listMatchesClose(SAVED[0].closeDecl), { ok: true }, 'no list, nothing to compare');
  const s = SAVED.find((x) => listOf(x).filter((r) => r.state === 'built' && r.kind !== 'floor').length === 1);
  const list = listOf(s);
  const i = list.findIndex((r) => r.state === 'built' && r.kind !== 'floor');
  const ghost = listMatchesClose({ ...s.closeDecl, list: list.map((r, k) => (k === i ? { ...r, part: { line: r.line, part: 99 } } : r)) });
  assert.equal(ghost.ok, false);
  assert.match(/** @type {any} */ (ghost).error, /does not run/);
  const hidden = listMatchesClose({ ...s.closeDecl, list: list.filter((_r, k) => k !== i) });
  assert.equal(hidden.ok, false);
  assert.match(/** @type {any} */ (hidden).error, /has no row/);
});

test('B2 retention is read from the list rows: counts by who proposed and how each ended, same shape as the declaration-pair retention', () => {
  const jl = [{ n: 1, text: 'a' }, { n: 2, text: 'b' }];
  const rows = [
    { line: 1, key: 'a', kind: 'fact', from: 'look', by: 'agent', state: 'built' },
    { line: 1, key: 'b', kind: 'fact', from: 'look', by: 'agent', state: 'not-checked' },
    { line: 1, key: 'c', kind: 'rule', from: 'pick', by: 'you', state: 'built' },
    { line: 2, key: 'd', kind: 'cited', from: 'default', by: 'default', state: 'built' },
    { line: 2, key: 'e', kind: 'floor', from: 'default', by: 'default', state: 'built' },
  ];
  assert.deepEqual(retentionOfList(rows, jl), [{ line: 1, aiParts: 2, kept: 1, dropped: 1, picks: true }, { line: 2, aiParts: 1, kept: 1, dropped: 0, picks: false }]);
  assert.deepEqual(Object.keys(retentionOfList(rows, jl)[0]), Object.keys(retentionOf({ stages: [] }, { stages: [] }, jl)[0]));
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
