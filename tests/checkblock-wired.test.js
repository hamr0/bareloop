// The check block through its CALLERS (docs/product/ITEM33-BUILD.md "CHECK BLOCK BUILD SPEC" section 3, hamr's rulings of 2026-11-12): the drafter's edit reply through authorClose, the person's choices
// through the panel's door (applyChoices), a Tickets reply that keeps ticketFilter (ruling 2), a gate red on the code-built plan that stops as plan-red in plain words (ruling 3), and when a revise runs
// (a refused edit or a failed seed read, at most 2). Every test goes through the real function, not a stub of the seam; the model boundary is a script that can only DELIVER a tool call.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorClose, GREEN_QUESTIONS } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { CheckBlock, renderCard } from '../src/checkblock.js';
import { questionsOfBlock, applyChoices } from '../src/blockasks.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { draftStopText } from '../src/authorreadout.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'checkblock-wired-')); made.push(d); return d; };
const PAGE = readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8');
const URL1 = 'https://www.google.com/travel/flights?q=sfo-lax';
const LINE = { n: 1, text: 'List 3 flights from San Francisco to Los Angeles', rule: 'under $450; not a red-eye; nonstop', rules: ['under $450', 'not a red-eye', 'nonstop'] };
const LOOK = { facts: [
  { line: 1, name: 'Origin', shape: 'phrase', source: 'Flights', words: ['Leaves San Francisco International Airport'] },
  { line: 1, name: 'Price', shape: 'money', source: 'Flights', words: ['From'], unit: ['US dollars'], forRule: 1, reading: { op: 'lt', value: 450 } },
  { line: 1, name: 'Departure time', shape: 'time', source: 'Flights', words: ['Departure time:'], forRule: 2 },
], dropped: [], prose: [], notFound: [] };

/**
 * authorClose over the real flights page with a scripted drafter. `replies` = one reply per call (the last repeats): `{edits, ticketFilter?}`. Returns the result, what was sent, the phases and the block.
 * @param {any[]} replies @param {{ticket?: boolean, cls?: typeof CheckBlock, seedReadFn?: any}} [o]
 */
async function draft(replies, { ticket = false, cls = CheckBlock, seedReadFn } = {}) {
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: URL1 }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: PAGE, url }) });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  const block = new cls({ texts: { Flights: PAGE }, labels: ['Flights'], asks: false });
  block.fromJob([LINE]);
  block.addLook(LOOK.facts, LOOK.dropped);
  block.reconcile();
  /** @type {any[]} */ const sent = [];
  /** @type {[string, any][]} */ const phases = [];
  let calls = 0;
  const generate = async (/** @type {any[]} */ m, /** @type {any[]} */ tools) => {
    sent.push(JSON.parse(JSON.stringify(m)));
    await tools.find((/** @type {any} */ t) => t.name === ROW_EDIT_TOOL).execute(replies[Math.min(calls, replies.length - 1)]);
    calls += 1;
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green', answers: { 1: '1. List 3 flights' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: LOOK }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [LINE], inputs: [{ n: 1, label: 'Flights', value: URL1 }], block, ticket,
    onPhase: (/** @type {string} */ name, /** @type {any} */ data) => phases.push([name, data]), ...(seedReadFn ? { seedReadFn } : {}),
  });
  return { r, sent, phases, block, get calls() { return calls; } };
}

test('the drafter\'s edit reply end to end through authorClose: legal edits land in the code-built plan, an illegal one is refused alone (one revise), the plan passes its own gate at the first try', async () => {
  const w = await draft([
    { edits: [
      { op: 'add', kind: 'phrase', line: 1, name: 'airline', source: 'Flights', words: ['Nonstop flight'] },
      { op: 'reading', line: 1, rules: [2], fact: 'Departure time', reading: { op: 'between', lo: '06:00', hi: '21:00' } },
      { op: 'add', kind: 'phrase', line: 1, name: 'invented', source: 'Flights', words: ['zzz nowhere'] },
    ] },
    { edits: [] },
  ]);
  assert.equal(w.r.ok, true, JSON.stringify(w.r.reds));
  assert.equal(w.r.iterations[0].validation.ok, true, 'a code-built plan passes its own gate');
  const part = w.r.declaration.stages[1].params.parts.find((/** @type {any} */ p) => p.class === 'fact');
  assert.deepEqual(part.facts.map((/** @type {any} */ f) => f.name).sort(), ['Departure time', 'Origin', 'Price', 'airline']);
  const dep = part.facts.find((/** @type {any} */ f) => f.name === 'Departure time');
  assert.deepEqual([dep.rule, dep.aiProposal], [{ op: 'between', lo: '06:00', hi: '21:00' }, true]);
  assert.deepEqual(w.r.iterations[0].edits.map((/** @type {any} */ e) => e.accepted), [true, true, false]);
  assert.match(w.r.iterations[0].edits[2].refusedBecause, /not in the input/);
  assert.equal(w.calls, 2, 'the refused edit started exactly one revise, the empty reply settled it');
  assert.match(w.sent[1].at(-1).content, /edit add: the words "zzz nowhere" are not in the input/);
  assert.equal(w.phases.filter(([n]) => n === 'draft-ledger-try').length, 2);
});

test('a Tickets reply keeps ticketFilter (ruling 2): the edits and the filter of ONE reply both land, the filter beside the declaration, never in the close', async () => {
  const w = await draft([{ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'airline', source: 'Flights', words: ['Nonstop flight'] }], ticketFilter: { priority: ['P1'] } }], { ticket: true });
  assert.equal(w.r.ok, true, JSON.stringify(w.r.reds));
  assert.deepEqual(w.r.ticketFilter, { priority: ['P1'] });
  assert.equal(Object.hasOwn(w.r.declaration, 'ticketFilter'), false);
  assert.ok(w.r.declaration.stages[1].params.parts.find((/** @type {any} */ p) => p.class === 'fact').facts.some((/** @type {any} */ f) => f.name === 'airline'));
  assert.equal(w.calls, 1, 'nothing refused, seed read fine: no revise');
});

test('revise runs only on a refused edit or a failed seed read, at most 2 (ruling 3): clean edits settle at once; refused edits every time stop after 2 revises', async () => {
  const clean = await draft([{ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'airline', source: 'Flights', words: ['Nonstop flight'] }] }]);
  assert.equal(clean.calls, 1);
  assert.equal(clean.r.stop, 'settled');
  const bad = (/** @type {string} */ w) => ({ edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'invented', source: 'Flights', words: [w] }] });
  // (an identical reply twice would stop as "unchanged", the loop's existing early stop: each reply differs)
  const refusedAlways = await draft([bad('zzz one'), bad('zzz two'), bad('zzz three'), bad('zzz four')]);
  assert.equal(refusedAlways.calls, 3, 'the first try and two revises');
  assert.equal(refusedAlways.r.stop, 'max-revisions');
  assert.equal(refusedAlways.r.ok, true, 'the plan that was built still stands (a refused edit costs nothing else)');
  // a failed seed read (no work stage fails at the starting point: the close would grade nothing) starts a revise even when every edit was legal
  const vacuous = async (/** @type {any} */ declaration) => declaration.stages.map((/** @type {any} */ s) => ({ stage: s.name, verdict: 'green', exits: [] }));
  const failedSeed = await draft([{ edits: [] }, { edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'first airline', source: 'Flights', words: ['Frontier'] }] }, { edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'second airline', source: 'Flights', words: ['American'] }] }], { seedReadFn: vacuous });
  assert.equal(failedSeed.calls, 3, 'a seed read that failed revises, at most twice');
  assert.equal(failedSeed.phases.filter(([n]) => n === 'author-try-failed').length >= 1, true);
});

test('a gate red on the code-built plan is OUR bug (ruling 3): authorClose stops as plan-red in plain words after ONE call, the AI is never asked to fix it, and the stop reads in code\'s words', async () => {
  // a block whose build is broken on purpose: a money fact with no unit or currency is a shape red the block\'s own trial would have caught; here it reaches the gate
  class Broken extends CheckBlock {
    build() { const c = super.build(); c.stages[0].params.parts.push({ text: 'broken', class: 'fact', source: 'Flights', facts: [{ name: 'broken', shape: 'money', anchor: 'From' }] }); return c; }
  }
  const w = await draft([{ edits: [] }], { cls: Broken });
  assert.equal(w.r.ok, false);
  assert.equal(w.r.stop, 'plan-red');
  assert.equal(w.calls, 1, 'the AI is not asked to fix the plan code built');
  assert.match(w.r.reds[0].detail, /^The plan code built from your checks did not pass its own gate \(/);
  assert.match(w.r.reds[0].detail, /That is a fault in the build, not in your job: nothing was spent on a close\.$/);
  const said = draftStopText({ stop: 'plan-red', reds: w.r.reds, spend: { knownUsd: 0.01, spendComplete: true } });
  assert.match(said, /^Drafting stopped: the plan code built from your checks did not pass its own gate\. That is a fault in the build, not in your job\. Spent so far: \$0\.01\./);
  assert.doesNotMatch(said, /no wording for/);
  assert.match(said, /What to do: draft again; if it stops the same way twice, report it/);
});

// ---- the person's choices through the panel's door (applyChoices): the choice decides, never the words ------------------------------------------------------------------------------
function askedBlock() {
  const b = new CheckBlock({ texts: { Flights: PAGE }, labels: ['Flights'] });
  b.fromJob([{ n: 1, text: 'List flights', rules: ['not a red-eye', 'nonstop', 'be nice'] }]);
  b.addLook([{ line: 1, name: 'Departure time', shape: 'time', source: 'Flights', words: ['Departure time:'], forRule: 1, reading: { op: 'between', lo: '07:00', hi: '23:00' } }], []);
  b.reconcile();
  return b;
}

test('the panel\'s choices into rows (ruling 1): agree writes a `~` row with the NEXT rule number (the panel adds the same line to jobLines) and the fact carries no aiProposal, the card says "you agreed"; drop leaves the rule Not checked; a typed rule is a typed row', () => {
  const b = askedBlock();
  const asks = questionsOfBlock(b);
  assert.deepEqual(asks.map((a) => [a.rule, a.ask]), [[1, 'reading'], [2, 'cant-check'], [3, 'cant-check']]);
  const refused = applyChoices(b, [
    { key: asks[0].key, choice: 'agree', text: '' },
    { key: asks[1].key, choice: 'drop', text: 'drop it' },
    { key: asks[2].key, choice: 'rule', text: 'be gentle in tone' },
  ]);
  assert.deepEqual(refused, []);
  const rules = b.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(rules.map((r) => [r.rule, r.origin, r.left ?? false]), [[1, 'job', false], [2, 'job', false], [3, 'job', false], [4, 'agreed', false], [5, 'typed', false]].map(([n, o]) => [n, o, n === 2]), 'rule 2 is left; the agreed and typed lines number 4 and 5');
  assert.equal(rules.find((r) => r.rule === 1)?.state, 'built');
  const fact = b.closeCache.parts.find((/** @type {any} */ p) => p.class === 'fact').facts.find((/** @type {any} */ f) => f.name === 'Departure time');
  assert.equal(Object.hasOwn(fact, 'aiProposal'), false, 'the bound is now the person\'s own words');
  assert.match(renderCard(b.rows).map((l) => l.text).join('\n'), /you agreed: /);
  assert.equal(rules.find((r) => r.rule === 2)?.reason, 'You chose to leave it Not checked, so you judge it at Accept.');
  assert.equal(b.hasOpenQuestions(), false);
});

test('a choice the block refuses stays open with its plain reason, nothing changes (agree where nothing is proposed, an empty own rule)', () => {
  const b = askedBlock();
  const asks = questionsOfBlock(b);
  const before = JSON.stringify(b.rows);
  const refused = applyChoices(b, [{ key: asks[1].key, choice: 'agree', text: '' }, { key: asks[2].key, choice: 'rule', text: '  ' }, { key: 'L9.~9:cant-check', choice: 'drop', text: '' }]);
  assert.deepEqual(refused.map((x) => x.why), ['that choice is not offered for this question', 'an answer is needed', 'out of date']);
  assert.equal(JSON.stringify(b.rows.map((r) => [r.key, r.left ?? null, r.cantAsked ?? null])), JSON.stringify(JSON.parse(before).map((r) => [r.key, r.left ?? null, r.cantAsked ?? null])));
  assert.equal(b.open.length, 3, 'all three questions are still open');
});

test('the check list is not restated to the drafter (invariant 5): across every try the message is the job, the look and the inputs, and a revise carries only the refusals', async () => {
  const bad = { edits: [{ op: 'add', kind: 'phrase', line: 1, name: 'invented', source: 'Flights', words: ['zzz nowhere'] }] };
  const w = await draft([bad, { edits: [] }]);
  assert.doesNotMatch(w.sent[0].map((/** @type {any} */ m) => m.content).join('\n').split('INPUT "Flights"')[0], /THE LIST OF CHECKS|\$ default|! fact|~ rule 1: "/);
  assert.equal(w.sent[1].length, 3, 'the revise adds the assistant reply and ONE user message');
  assert.match(w.sent[1].at(-1).content, /^MEASURED EDITS/);
});
