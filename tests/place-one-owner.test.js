// ONE OWNER of the week-only decision (hamr 2026-11-11, POC round 2 PASS fb282332): the list row alone decides; applyLedger keeps no week-only logic of its own.
// A rule NUMBER on a part never exempts a week-only fact; only the person's own ~ rule TEXT naming the fact's token does.
// The live fixture is draft session smwcirsot84mn (place-live): the drafter put rules:[1] ("at most 80 words") on the part, and the signed spec carried the FIXED phrase "0.54.1".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as CL from '../src/checklist.js';
import { readPlace } from '../src/placerule.js';

const FX = new URL('./fixtures/place-live-smwcirsot84mn/', import.meta.url);
const read = (/** @type {string} */ f) => readFileSync(new URL(f, FX), 'utf8');
const TEXT = read('CHANGELOG.md');
const texts = { Changelog: TEXT };
const decl0 = JSON.parse(read('declaration.json'));
/** the session's final ledger rows, back in the in-memory Row shape (a rule row keeps its text in `text`) */
const liveRows = read('ledger-final.jsonl').trim().split('\n').map((l) => JSON.parse(l))
  .map((r) => ({ key: r.key, line: r.line, kind: r.rowKind, from: r.from, by: r.by, words: r.words, state: r.state, reason: r.reason, ...(r.rowKind === 'rule' ? { text: r.words[0] } : {}),
    ...(r.rowKind === 'fact' ? { name: r.key.replace(/^L\d+\.fact\./, '') } : {}) }));
const decl = (/** @type {any[]} */ parts) => ({ genre: 'TEXT', lang: 'text', stages: [{ name: 's1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }] });
const factsOf = (/** @type {any} */ r) => r.declaration.stages[0].params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts);
const fp = (/** @type {any[]} */ facts, rules = [1]) => ({ text: 'f', class: 'fact', source: 'Changelog', rules, facts });
const row = (/** @type {any} */ o) => ({ line: 1, kind: 'fact', from: 'look', by: 'agent', words: [], state: 'listed', reason: null, ...o });
const ruleRow = (/** @type {string} */ text) => ({ key: 'L1.~1', line: 1, kind: 'rule', from: 'rule', by: 'you', words: [], text, rule: 1, state: 'listed', reason: null });

test('live smwcirsot84mn: the "version" fact is signed as a place value (0.54.1), no fixed phrase, though the part carries a rule number', () => {
  const part = decl0.stages[1].params.parts[0];
  assert.deepEqual(part.rules, [1], 'the fixture part carries the rule number that used to bypass');
  const r = CL.applyLedger(decl([part]), liveRows, { labels: ['Changelog'], texts });
  const v = factsOf(r).find((/** @type {any} */ f) => f.name === 'version');
  assert.ok(v, 'the version fact is signed');
  assert.equal(v.phrase, '0.54.1');
  assert.ok(v.place && typeof v.place === 'object', 'it carries a place rule, so it is not fixed');
  assert.equal(readPlace(v.place, TEXT).value, '0.54.1');
  assert.ok(!factsOf(r).some((/** @type {any} */ f) => CL.weekOnly(f.phrase) && !f.place), 'no fixed week-only phrase is signed');
});

test('a part with an unrelated ~ rule number and a week-only fact with NO row is refused as week-only', () => {
  const rows = [ruleRow('at most 80 words')];
  const r = CL.applyLedger(decl([fp([{ name: 'release version', shape: 'phrase', phrase: '0.54.1' }])]), rows, { labels: ['Changelog'], texts });
  assert.deepEqual(r.refused.map((x) => [x.words, x.reason]), [['release version', 'week-only']]);
  assert.deepEqual(factsOf(r), []);
});

test('a dropped row refuses the fact; an anchor/until week-only fact is refused even with a listed row', () => {
  const dropped = [ruleRow('at most 80 words'), row({ key: 'L1.fact.v', name: 'v', words: ['0.54.1'], state: 'dropped', reason: 'x' })];
  assert.equal(CL.applyLedger(decl([fp([{ name: 'v', shape: 'phrase', phrase: '0.54.1' }])]), dropped, { labels: ['Changelog'], texts }).refused[0].reason, 'week-only');
  const listed = [ruleRow('at most 80 words'), row({ key: 'L1.fact.a', name: 'a', words: ['x', '0.54.1'] })];
  const r = CL.applyLedger(decl([fp([{ name: 'a', shape: 'phrase', phrase: 'x', anchor: 'Version 0.54.1' }])]), listed, { labels: ['Changelog'], texts });
  assert.deepEqual(r.refused.map((x) => x.reason), ['week-only']);
});

test('a ~ rule whose TEXT contains the token exempts the fact: the person\'s fixed phrase is kept', () => {
  const rows = [ruleRow('the version must say 0.54.1')];
  const r = CL.applyLedger(decl([fp([{ name: 'release version', shape: 'phrase', phrase: '0.54.1' }])]), rows, { labels: ['Changelog'], texts });
  assert.deepEqual(r.refused, []);
  assert.deepEqual(factsOf(r), [{ name: 'release version', shape: 'phrase', phrase: '0.54.1' }]);
});

test('split version/date facts each get only their own value', () => {
  const rows = [ruleRow('at most 80 words'), row({ key: 'L1.fact.v', name: 'v', words: ['## [0.54.1] - 2026-11-04', '0.54.1', '2026-11-04'] }),
    row({ key: 'L1.fact.d', name: 'd', words: ['## [0.54.1] - 2026-11-04', '0.54.1', '2026-11-04'] })];
  const r = CL.applyLedger(decl([fp([{ name: 'v', shape: 'phrase', phrase: '0.54.1' }, { name: 'd', shape: 'phrase', phrase: '2026-11-04' }])]), rows, { labels: ['Changelog'], texts });
  assert.deepEqual(r.refused, []);
  assert.deepEqual(factsOf(r).map((/** @type {any} */ f) => [f.name, f.phrase]), [['v', '0.54.1'], ['d', '2026-11-04']]);
  assert.ok(factsOf(r).every((/** @type {any} */ f) => f.place));
});

test('a drafter fact arriving with its own place rule is stripped first: the signed rule is code\'s, or the fact is refused week-only when no row fits', () => {
  const own = { kind: 'line-prefix', prefix: '# ' };
  const mk = () => decl([fp([{ name: 'version', shape: 'phrase', phrase: '0.54.1', place: own }], [])]);
  const rows = [row({ key: 'L1.fact.version', name: 'version', words: ['## [0.54.1] - 2026-11-04', '0.54.1'] })];
  const withRow = CL.applyLedger(mk(), rows, { labels: ['Changelog'], texts });
  const v = factsOf(withRow).find((/** @type {any} */ f) => f.name === 'version');
  assert.ok(v && v.place, 'signed with a place rule');
  assert.notDeepEqual(v.place, own, 'not the drafter\'s rule');
  assert.equal(JSON.stringify(v.place).includes('## ['), true, 'the rule is code\'s ("## [" prefix)');
  const none = CL.applyLedger(mk(), [], { labels: ['Changelog'], texts });
  assert.deepEqual(none.refused.map((x) => [x.words, x.reason]), [['version', 'week-only']]);
  assert.deepEqual(factsOf(none), []);
});
