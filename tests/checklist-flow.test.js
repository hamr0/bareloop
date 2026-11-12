// The one check list inside the authoring flow (src/authorflow.js, src/authorjob.js): the confirm turn plans the goal only, the drafter reads the list, every try is cut to the list.
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  confirmPrompt, confirmedBlock, runConfirmTurn, makeCostBook, GREEN_QUESTIONS, CONFIRM_TOOL_NAME, CONFIRM_SYSTEM, RUBRIC_CONFIRM_NOTE, confirmSystemFor, authorPrompt,
} from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import * as CL from '../src/checklist.js';
import { CheckBlock } from '../src/checkblock.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { authorClose } from '../src/authorflow.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { authorCloseForJob as forJob } from '../src/authorjob.js';

const CA = { answers: { 1: '1. summarise' }, questions: GREEN_QUESTIONS, isRepo: false, lang: RUBRIC_LANG };
const jobLines = [{ n: 1, text: 'Summarise the latest release', rule: 'exactly 3 bullets', rules: ['exactly 3 bullets'] }];
const texts = { Changelog: '## [0.54.1] - 2026-11-04\n### Fixed\n- one\n- two\n' };
const look = { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], dropped: [] };

test('A4 the rubric confirm note is the signed one: goal only, plan none; CONFIRM_SYSTEM for a rubric job says a one-sentence goal', () => {
  assert.equal(RUBRIC_CONFIRM_NOTE, 'THIS JOB HAS NO REPOSITORY. Its inputs are the person\'s own text files, and each numbered job line leaves ONE file the run writes. '
    + 'The checks of this job are made elsewhere: plan none. Send an empty checks list, an empty notChecked list and an empty questions list, '
    + 'and write ONE sentence saying what the job does, from the numbered job lines.');
  const on = confirmPrompt(CA);
  assert.doesNotMatch(on, /only three kinds of check/);
  assert.doesNotMatch(on, /COUNTED/);
  assert.doesNotMatch(on, /THE RULES FOR TURNING/);
  assert.match(on, /plan none/);
  assert.match(confirmSystemFor(RUBRIC_LANG), /one-sentence goal/);
  assert.doesNotMatch(confirmSystemFor(RUBRIC_LANG), /the checks you plan to compose/);
  assert.equal(confirmSystemFor('js'), CONFIRM_SYSTEM, 'a code job keeps the old system text');
  assert.doesNotMatch(confirmPrompt({ ...CA, isRepo: true, lang: 'js' }), /plan none/);
});

test('A4 runConfirmTurn on a rubric job keeps the goal and discards the model\'s checks, gaps and questions; accepted carries goalOnly; the menu shows no check', async () => {
  const sent = [];
  const generate = async (m, tools) => { sent.push(JSON.stringify(m)); await tools.find((t) => t.name === CONFIRM_TOOL_NAME).execute({ goal: 'Summarise the release', checks: [{ text: 'quote the input', fromLine: [1] }], notChecked: ['tone'], questions: ['which release?'] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; };
  const asked = [];
  const ask = async (step) => { asked.push(step); return step.kind === 'menu' ? 'confirm' : 'x'; };
  const r = await runConfirmTurn({ verdictType: 'soft-green', ...CA, facts: {}, writeScope: null, generate, book: makeCostBook({ ceilingUsd: null }), ask });
  assert.equal(r.ok, true);
  assert.equal(r.accepted.goal, 'Summarise the release');
  assert.deepEqual([r.accepted.checkItems, r.accepted.checks, r.accepted.notChecked, r.accepted.openQuestions], [[], [], [], []]);
  assert.equal(r.accepted.goalOnly, true);
  assert.deepEqual(asked.map((a) => a.kind), ['menu'], 'a question the model sent is never asked');
  assert.deepEqual(asked[0].plan.checks, []);
  assert.doesNotMatch(sent[0], /only three kinds of check/);
});

test('A4 a code job\'s confirm turn is untouched: its checks and questions still count', async () => {
  const generate = async (m, tools) => { await tools.find((t) => t.name === CONFIRM_TOOL_NAME).execute({ goal: 'g', checks: [{ text: 'tests stay green', fromLine: [1] }], notChecked: [], questions: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; };
  const r = await runConfirmTurn({ verdictType: 'green', answers: { 1: '1. fix' }, questions: GREEN_QUESTIONS, isRepo: true, lang: 'js', facts: {}, writeScope: ['src/**'], generate, book: makeCostBook({ ceilingUsd: null }), ask: async () => 'confirm' });
  assert.equal(r.accepted.checkItems.length, 1);
  assert.equal(r.accepted.goalOnly, undefined);
});

// ---- A5: the drafter does NOT see the list (invariant 5: no injected text restates the list; the drafter sends edits) --------------------------------------------------------
test('A5 a goal-only confirmed plan gives no confirmed-plan block, no "the person confirmed" text and no covers rule', () => {
  const conf = { checks: [], checkItems: [], protections: ['always on'], notChecked: [], goalOnly: true };
  const b = confirmedBlock(conf);
  assert.doesNotMatch(b, /CONFIRMED|confirmed|confirm turn/);
  assert.match(b, /always on/);
});

// ---- A6 / A7 / A9 / A10: the drafting loop is cut to the list -----------------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'checklist-flow-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

/** the drafter's replies are ROW EDITS, one reply per call (the last one repeats); the block is the real one, made like authorjob makes it */
async function closeWorld(replies, { lines = jobLines, lk = look, second = false, carry = null } = {}) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const file2 = join(tmp(), 'README.md');
  copyFileSync(join(HERE, '..', 'README.md'), file2);
  const inputs = [{ n: 1, label: 'Changelog', value: file }, ...(second ? [{ n: 2, label: 'Readme', value: file2 }] : [])];
  const proved = await proveRubricInputs({ inputs, into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  const prep = proved.prep;
  /** @type {string[]} */ const prompts = [];
  /** @type {[string, any][]} */ const phases = [];
  const generate = async (m, tools) => {
    prompts.push(m[0].content);
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: replies[Math.min(prompts.length - 1, replies.length - 1)] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const real = Object.fromEntries(inputs.map((i) => [i.label, readFileSync(i.value, 'utf8')]));
  const block = new CheckBlock({ texts: real, labels: inputs.map((i) => i.label) });
  block.fromJob(lines);
  block.addLook(lk.facts ?? [], lk.dropped ?? []);
  if (carry) block.carry(carry);
  block.reconcile();
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarise the latest release' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: inputs.map((i) => ({ n: i.n, label: i.label })), look: { prose: [], notFound: [], dropped: [], ...lk } }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: lines, inputs, block,
    onPhase: (name, data) => phases.push([name, data]),
  });
  return { r, prompts, phases, block };
}

test('A5/A6/A10 authorClose: the drafter prompt does not restate the list; an edit the page cannot prove is refused ALONE and its reason says so; a legal count lands beside the look fact; each try and the end are logged', async () => {
  const w = await closeWorld([
    [{ op: 'add', kind: 'phrase', line: 1, name: 'made up', source: 'Changelog', words: ['zzz'] }, { op: 'add', kind: 'count', line: 1, min: 1, max: 1 }],
    [],
  ], { lines: [{ n: 1, text: 'Summarise the latest release' }] });
  assert.equal(w.r.ok, true, JSON.stringify(w.r.reds));
  assert.doesNotMatch(w.prompts[0].split('INPUT "Changelog"')[0], /THE LIST OF CHECKS|THE CONFIRMED PLAN|! fact|\$ default/);
  const parts = w.r.declaration.stages[1].params.parts;
  assert.deepEqual(parts[0].facts.map((f) => f.name), ['release heading']);
  assert.deepEqual(parts[0].count, { min: 1, max: 1 }, 'the count rides with the fact');
  const tries = w.phases.filter(([n]) => n === 'draft-ledger-try');
  assert.equal(tries.length, 2, 'a refused edit starts one revise (ruling 3); the empty reply settles it');
  assert.deepEqual([tries[0][1].kept, tries[0][1].refused.map((x) => x.op)], [1, ['add']]);
  assert.match(tries[0][1].refused[0].reason, /not in the input/);
  const end = w.phases.find(([n]) => n === 'draft-ledger')[1].rows;
  assert.ok(end.every((x) => ['built', 'not-checked', 'empty'].includes(x.state)));
  assert.equal(end.find((x) => x.key === 'L1.fact.release heading').state, 'built');
  assert.equal(end.find((x) => x.rowKind === 'count').state, 'built');
});

test('A7 authorClose: a text line gets the $ cited default from the rows after the build settles, whatever the drafter sent', async () => {
  const w = await closeWorld([[]], { lk: { facts: [] }, carry: { picks: [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 } }] } });
  assert.equal(w.r.ok, true, JSON.stringify(w.r.reds));
  assert.deepEqual(w.r.declaration.stages[1].params.parts.map((p) => p.check), ['listItems', 'cited']);
  assert.equal(w.phases.find(([n]) => n === 'draft-ledger')[1].rows.find((x) => x.key === 'L1.$cited').state, 'built');
});

test('A9 authorClose: a two-input job with no look has no check code can build (the $ cited row cannot pick the input): the draft still ends (the line is refused in plain words, never a plan-red) and the block says no built check', async () => {
  const lines = [{ n: 1, text: 'Summarise' }];
  const w = await closeWorld([[]], { lines, lk: { facts: [] }, second: true });
  assert.equal(w.r.ok, true, JSON.stringify(w.r.reds));
  const end = w.phases.find(([n]) => n === 'draft-ledger')[1].rows;
  assert.equal(w.block.rows.find((r) => r.kind === 'cited').state, 'not-checked');
  assert.equal(w.block.hasBuiltCheck(), false);
  assert.ok(end.every((x) => x.state !== 'built' || x.rowKind === 'floor'));
  assert.deepEqual(w.r.declaration.refused.map((x) => [x.line, x.rule]), [[1, undefined]], 'the uncovered line is refused as a line');
});

// ---- A2 / A3: the list is made once, after the look and the pick path, before the confirm turn -----------------------------------------------
async function doorWorld({ ledgerGenerate = null, lang = RUBRIC_LANG, lines = jobLines, survey: surveyOver = null } = {}) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  /** @type {string[]} */ const order = [];
  /** @type {any} */ let seen = null;
  const survey = surveyOver ?? { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], prose: [], notFound: [], dropped: [] } } };
  const phases = [];
  const r = await forJob({
    answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang, jobLines: JSON.parse(JSON.stringify(lines)), inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, onPhase: (p, d) => { order.push(p); phases.push([p, d]); },
    lookFn: async () => survey, ...(ledgerGenerate ? { ledgerGenerate } : {}), ...(lang !== RUBRIC_LANG ? { scout: survey } : {}),
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { order.push('authorFn'); seen = o; return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  return { r, order, phases, survey, get seen() { return seen; } };
}
const ledgerScript = (extra, seen = []) => async (m, tools) => {
  seen.push(m.at(-1).content);
  await tools.find((t) => t.name === CL.LEDGER_TOOL).execute({ extra });
  return { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } };
};

test('A2/A3 authorCloseForJob (rubric): the block is built once before the draft, with the call\'s proposals judged as edits; the call\'s spend joins the survey\'s; the drafter gets the block', async () => {
  const seenUser = [];
  const w = await doorWorld({ ledgerGenerate: ledgerScript([{ line: 1, kind: 'count', min: 1, max: 1 }, { line: 1, kind: 'phrase', source: 'Changelog', phrase: 'not in the file' }], seenUser) });
  assert.deepEqual(w.order.filter((x) => ['look-done', 'ledger-suggest', 'ledger-built', 'authorFn'].includes(x)), ['look-done', 'ledger-suggest', 'ledger-built', 'authorFn']);
  assert.match(seenUser[0], /Input "Changelog":/);
  const rows = w.seen.block.rows;
  const by = (k) => rows.find((r) => r.key === k);
  assert.equal(by('L1.~1').by, 'you');
  assert.equal(by('L1.fact.release heading').state, 'built');
  assert.equal(rows.find((r) => r.kind === 'count').state, 'built');
  // a phrase the input does not hold is an edit refused alone: no row, the reason is in the block's reply record
  assert.equal(rows.some((r) => r.words?.[0] === 'not in the file'), false);
  assert.match(w.seen.block.deltaLog.find((d) => d.label === 'pre:ledger-suggest').edits.find((e) => e.kind === 'phrase').refusedBecause, /not in the input/);
  assert.deepEqual(w.survey.calls.map((c) => c.label), ['ledger-suggest'], 'the call\'s spend joins the survey\'s, so the one ceiling holds it');
  const built = w.phases.find(([n]) => n === 'ledger-built')[1].rows;
  assert.equal(built.length, rows.length);
  assert.ok(built.every((x) => x.rowKind && x.key && x.state));
});

test('A2 without a list call (no ledgerGenerate) the block is still built from the look; a code job gets none', async () => {
  const w = await doorWorld();
  assert.ok(w.seen.block instanceof CheckBlock);
  assert.equal(w.order.includes('ledger-suggest'), false);
  assert.equal(w.seen.block.rows.some((r) => r.from === 'agent' && r.kind === 'count'), false);
  const code = await doorWorld({ lang: 'js' });
  assert.equal(code.seen?.block, undefined);
  assert.equal(code.order.includes('ledger-built'), false);
});

test('A3 an unusable list answer is not a guessed list: no proposals, the draft goes on with the look\'s facts and the defaults', async () => {
  const w = await doorWorld({ ledgerGenerate: async () => ({ text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } }) });
  assert.equal(w.seen.block.rows.some((r) => r.from === 'agent' && r.kind !== 'fact'), false);
  assert.equal(w.survey.calls.length, 2, 'one retry, both booked');
});
