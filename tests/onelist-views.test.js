// Addendum 2026-11-14 (c) piece 3: every view reads only the list's rows. Real data: the 38 saved drafts of paid rounds 9 and 10 (tests/fixtures/ledger-saved-specs.json) rebuilt through the block with
// its job-level guard rows, and the saved signed specs that carry a list. A view item is either a row of the list (its key is a row's) or it is the write fence (the one line that stays).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CheckBlock } from '../src/checkblock.js';
import { cardOfClose, checksOfClose, listMatchesClose } from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import * as AR from '../src/authorrun.js';

const rd = (/** @type {string} */ p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const SAVED = rd('./fixtures/ledger-saved-specs.json');
const SIGNED = ['agree-follower/resolved-spec.json', 'audit-checks-fixloop-mwg3pov1/resolved-spec.json', 'audit-checks-mwenvde5/resolved-spec.json'].map((p) => rd(`./fixtures/${p}`));
/** a list signed before rows named the facts they built (`facts`): its fact rows cannot be tied one to one, so it keeps today's display (no keys on fact rows) */
const OLD_LIST = rd('./fixtures/check-list-live-mwc2u3yh/resolved-spec.json');

/** the block this saved draft's job would have, with the class's guard (as authorClose gives it); a close of the block's stages, plus the guard stage code assembles */
function blockOf(/** @type {any} */ s) {
  const facts = s.closeDecl.stages.filter((/** @type {any} */ st) => st.kind === 'rubric-step').flatMap((/** @type {any} */ st) => st.params.parts.filter((/** @type {any} */ p) => p.class === 'fact').flatMap((/** @type {any} */ p) => p.facts.map((/** @type {any} */ f) => ({ line: st.params.step, name: f.name, shape: f.shape ?? 'phrase', source: p.source, words: f.phrase ? [f.phrase] : [] }))));
  const labels = [...new Set(/** @type {string[]} */ (s.closeDecl.stages.flatMap((/** @type {any} */ st) => (st.kind === 'rubric-step' ? st.params.parts.filter((/** @type {any} */ p) => p.source).map((/** @type {any} */ p) => p.source) : []))))];
  const texts = Object.fromEntries(labels.map((l) => [l, facts.filter((f) => f.source === l).flatMap((f) => f.words).join('\n') || 'x']));
  const block = new CheckBlock({ texts, labels, asks: false });
  block.fromJob(s.jobLines);
  block.setGuards(['changed-from-seed']);
  block.addLook(facts, []);
  const c = block.reconcile();
  const guardStage = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  return { block, closeDecl: { genre: 'text', lang: 'text', stages: [guardStage, ...c.stages], list: block.signedRows(), picks: block.picksOf(c) } };
}

test('over the 38 saved drafts: every check the card and the Job tab draw is a built row of the list (keyed), the guard once, the floor once per line, no Always-checked item', () => {
  let drawn = 0;
  for (const s of SAVED) {
    const { closeDecl } = blockOf(s);
    assert.deepEqual(listMatchesClose(closeDecl), { ok: true }, s.id);
    const built = new Set(closeDecl.list.filter((/** @type {any} */ r) => r.state === 'built').map((/** @type {any} */ r) => r.key));
    const card = cardOfClose({ closeDecl, jobLines: s.jobLines }).checkItems;
    for (const c of card) { drawn += 1; assert.ok(c.key && built.has(c.key), `${s.id}: a card item that is no built row: ${c.text}`); }
    assert.equal(card.filter((c) => c.key === 'J.$guard.changed-from-seed').length, 1, `${s.id}: the guard is one row`);
    for (const l of s.jobLines) assert.equal(card.filter((c) => c.key === `L${l.n}.$floor`).length, 1, `${s.id}: line ${l.n} floor once`);
    const plan = planFromSpec({ jobLines: s.jobLines, closeDecl, goal: '' });
    const shown = [...plan.lines.flatMap((l) => l.checks), ...plan.loose];
    assert.equal(shown.length, card.length, `${s.id}: the Job tab and the card draw the same rows`);
    for (const c of shown) assert.ok(c.key && built.has(c.key), `${s.id}: a Job tab check that is no built row: ${c.name}`);
    assert.deepEqual(plan.alwaysOn, [], `${s.id}: nothing left in Always checked`);
  }
  assert.ok(drawn > 100);
});

test('over the saved signed specs that carry a list: every check item is keyed to a built row of that list (countable parts too)', () => {
  for (const spec of SIGNED) {
    const built = new Set(spec.closeDecl.list.filter((/** @type {any} */ r) => r.state === 'built').map((/** @type {any} */ r) => r.key));
    const items = checksOfClose(spec.closeDecl);
    assert.ok(items.length > 0);
    for (const c of items) assert.ok(c.key && built.has(c.key), `${c.text} has no row`);
    const plan = planFromSpec(spec);
    for (const c of [...plan.lines.flatMap((l) => l.checks), ...plan.loose]) assert.ok(c.key && built.has(c.key), `Job tab: ${c.name} has no row`);
  }
});

test('an OLD signed list (no `facts` names on its rows) still draws, with no key where a row cannot be named: nothing crashes, nothing is dropped', () => {
  const items = checksOfClose(OLD_LIST.closeDecl);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((c) => c.key ?? null), [null, 'L1.~1', 'L1.$floor']);
  assert.equal(planFromSpec(OLD_LIST).lines[0].checks.length, 3);
});

test('the CLI plan print draws every check with its row tag (~ [you], ! [agent], $ [default]) and its line, from the same rows; the protections hold the fence only', () => {
  const { closeDecl } = blockOf(SAVED[0]);
  const checkItems = cardOfClose({ closeDecl, jobLines: SAVED[0].jobLines }).checkItems;
  const lines = AR.confirmPlanLines({ goal: 'g', checkItems, checks: checkItems.map((c) => c.text), protections: ['write fence — the run may only change files matching: output/'], notChecked: [], questions: [] });
  const text = lines.join('\n');
  assert.match(text, /· line 1: \$ \[default\] its file output\/steps\/1\.json must exist/);
  assert.match(text, /· \$ \[default\] did the run change a file\?/);
  assert.ok(checkItems.some((c) => c.by !== 'default'), 'the draft also has ~ or ! rows');
  assert.match(text, /· line \d+: [~!] \[(you|agent)\] /);
  assert.equal(lines.filter((l) => /^    · write fence/.test(l)).length, 1);
  assert.equal(lines.filter((l) => /did the run change a file\?/.test(l)).length, 1, 'the guard is said once');
  assert.equal(lines.filter((l) => /changed-from-seed/.test(l)).length, 0, 'never by its raw name');
});

test('a close that carries the list WITH its guard rows draws no free-text note as Not checked (every Not checked item is a row); an older close keeps its notes', () => {
  const { closeDecl } = blockOf(SAVED[0]);
  const withNote = { ...closeDecl, notes: ['The model wrote this free text.'] };
  assert.equal(cardOfClose({ closeDecl: withNote, jobLines: SAVED[0].jobLines }).notChecked.some((t) => /free text/.test(t)), false);
  assert.equal(planFromSpec({ jobLines: SAVED[0].jobLines, closeDecl: withNote, goal: '' }).notChecked.some((t) => /free text/.test(t)), false);
  const old = { ...withNote, list: withNote.list.filter((/** @type {any} */ r) => r.kind !== 'guard') };
  assert.equal(cardOfClose({ closeDecl: old, jobLines: SAVED[0].jobLines }).notChecked.some((t) => /free text/.test(t)), true);
  assert.equal(planFromSpec({ jobLines: SAVED[0].jobLines, closeDecl: old, goal: '' }).notChecked.some((t) => /free text/.test(t)), true);
});

test('the Job fields `success` and `guardrails` of a one-list job read the rows (checks) and the fence only; an older job keeps its stage names', async () => {
  const { successFromSpec, guardrailsFromSpec } = await import('../src/panel/server.js');
  const { closeDecl } = blockOf(SAVED[0]);
  const spec = { verdictType: 'soft-green', jobLines: SAVED[0].jobLines, writeScope: ['output/'], closeDecl };
  const success = String(successFromSpec(spec));
  assert.ok(checksOfClose(closeDecl).every((c) => success.includes(c.text)), success);
  assert.doesNotMatch(success, /line-1/);
  assert.equal(guardrailsFromSpec(spec), 'write fence — the run may only change files matching: output/');
  const old = { ...spec, closeDecl: { ...closeDecl, list: closeDecl.list.filter((/** @type {any} */ r) => r.kind !== 'guard') } };
  assert.match(String(successFromSpec(old)), /line-1/);
  assert.match(String(guardrailsFromSpec(old)), /changed-from-seed/);
});
