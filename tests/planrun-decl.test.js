// THE DECLARED CLOSE THROUGH `runJob` — the shipped entry, not the executor
// underneath it.
//
// tests/authorjob.test.js §7 already drives a declaration through `runPlan`, and
// that is the executor's own seam. This file covers the one hop above it, which
// nothing exercised: `runJob` is the ONE entry (the N2 lock), and everything a
// real launch puts between the operator and the plan flow lives THERE — the
// approval gate over `jobSpecHash`, the primitive smoke, the one ledger, and the
// `job-end` money contract. A spec whose close is a `closeDecl` has no `close`
// field for any of that to read, so every one of those is a place the declared
// shape could have been dropped silently. This is the first live sign-and-run's
// own path, taken with a scripted provider.
//
// What it holds still:
//   * the grounded re-validation runs at the runner, against the real seed tree
//     (`close-decl`, D9 gate 1 deferred at the spec gate and paid here);
//   * the verdict is minted BY THE DECLARED EXECUTOR — `declared: true` travels
//     on the precheck and on the close verdict ralph renders, so a green can
//     never have come from the command path;
//   * a red gap carries `DECLARED_GAP_PREFIX` on every line under the same
//     `stageGap` header the command path writes (trend.js parses that header).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from '../src/run.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { classGuards } from '../src/authoring.js';
import { GENRE } from '../src/authorjob.js';
import { DECLARED_GAP_PREFIX } from '../src/declaredclose.js';
import { stageGap } from '../src/ralph.js';
import { readSpine, scriptedProvider, initPatientRepo } from './helpers.js';

/**
 * A real patient: `check.mjs` greens iff `src/fix.js` exists and says `ok`.
 * Real script, real exit code — the declared close spawns it for a living.
 * Returns the seed the close will measure against (`initPatientRepo` commits).
 */
function makePatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'planrun-decl-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  // `.smoke/` is runJob's OWN primitive-smoke store (`src/run.js`: a LiteCtx
  // rooted at `join(workdir, '.smoke')`), and it is ignored here for the same
  // reason every battery's patient prep ignores it: it is the arbiter's writing,
  // not the worker's. It is NOT one of `isArbiterBook`'s two exclusions — that
  // primitive knows a top-level `.litectx/` and `gate-audit.jsonl` only — so a
  // patient that does not ignore it hands `changed-from-seed` three untracked
  // files outside the allowed prefixes on every run. Ignoring it here keeps the
  // fixture on the patient shape the batteries actually run, rather than making
  // the test carry a defect that belongs to patient prep.
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'check.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./src/fix.js', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('clean'); process.exit(0); }
console.log('FAILED src/fix.js — missing or has no ok marker'); process.exit(1);\n`);
  const seed = initPatientRepo(dir);
  // OUTSIDE the patient, the way the real launcher writes it (`scripts/run-u.mjs`
  // keeps its spine in a runs directory). A spine inside the tree is a file the
  // arbiter wrote into the thing it is judging, and the declared close would count
  // it as work — production does not do that, so the fixture must not either.
  const spineDir = mkdtempSync(join(tmpdir(), 'planrun-decl-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, seed, spine: join(spineDir, 'spine.jsonl') };
}

/** the green battery's guards with the model's ONE fill slot filled — DERIVED
 * from `classGuards`, never respelled, so a battery change moves this test */
const guards = (/** @type {string[]} */ allowPrefixes) => classGuards({ verdictType: 'green', lang: 'js' })
  .map((g) => ({
    name: g.name,
    kind: g.kind,
    params: { ...g.params, ...(g.fill.includes('allowPrefixes') ? { allowPrefixes } : {}) },
  }));

/** a full TYPES-shaped declaration over the patient above: guard, work, guard */
const DECL = () => ({
  genre: GENRE,
  lang: 'js',
  stages: [
    guards(['src/'])[0],
    { name: 'verdict', kind: 'command-exit', params: { cmd: 'node', args: ['check.mjs'], expectExit: 0 } },
    guards(['src/'])[1],
  ],
});

/** the spec the human signs: a `closeDecl` and NO `close` — two closes are two arbiters */
const declaredJob = () => ({
  schema: 'job-v1',
  job: 'declared-through-runjob',
  description: 'a job whose close the user never wrote, run through the one entry',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Create src/fix.js with an ok marker so the check passes.',
  verdictType: 'green',
  closeDecl: DECL(),
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

/** the signature is over the spec's own hash — the gate is shape-agnostic and a
 * declared close must not be a hole in it */
const approve = (/** @type {any} */ job) => [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }];

const PLAN = (/** @type {any[]} */ exit) => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-fix',
    action: 'Create src/fix.js containing the ok marker.',
    tools: ['write'], rounds: 6, target: 'src/fix.js',
    exit,
  }],
});

test('runJob executes a DECLARED close end to end: grounded re-validation, declared verdict, one ledger', async (t) => {
  const { dir, seed, spine } = makePatient(t);
  const job = declaredJob();
  const jv = validateJob(job, { shellCapUsd: job.budgetUsd });
  assert.deepEqual(jv.reds, [], 'the declared spec must be validateJob-green before it can be signed');

  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },                                          // scout
    { text: PLAN([{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'verdict' }]) },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// ok\n' } }] },
    { text: 'wrote src/fix.js' },                                                                   // attempt summary
  ]);
  const outcome = await runJob(job, { approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine) });

  const events = readSpine(spine);
  assert.equal(outcome, 'green', JSON.stringify(events.filter((e) => e.type === 'escalation')));
  assert.ok(existsSync(join(dir, 'src', 'fix.js')), 'the worker wrote through the real gate');

  // ── the runner re-validated the declaration GROUNDED, against the real seed ──
  // (D9 gate 1: the spec-level gate has no repository, so hamr's listing rule and
  // the scoped-job derivation are deferred to here — moved, never skipped)
  const decl = events.find((e) => e.type === 'close-decl');
  assert.ok(decl, 'the declared close records itself on the spine through runJob');
  assert.equal(decl.ok, true);
  assert.equal(decl.grounded, true);
  assert.equal(decl.seedRef, seed, 'D8: the seed is READ at run start, never typed into the spec');
  assert.deepEqual(decl.stages, job.closeDecl.stages.map((s) => s.name));
  assert.ok(!('seedRef' in job.closeDecl), 'D12: the close stores the counting RULE, never the number');

  // ── the verdict came from the DECLARED executor, both times it was rendered ──
  // `declared: true` is set by `runDeclaredStages` alone; the command path never
  // sets it, so this is what separates "the close ran" from "a close ran".
  const pre = events.find((e) => e.type === 'close-precheck');
  assert.equal(pre.declared, true);
  assert.equal(pre.verdict, 'needs_revision', 'nothing has changed from seed yet');
  assert.equal(pre.stage, 'changed-from-seed', 'first red wins, and the deciding stage names itself');

  // …and the close that DECIDED the run, after the work. `outer-close` is the
  // one to read rather than `close-verdict`: the per-step micro-loops run on the
  // same ralph with the exit evaluator as their judge, so they emit
  // `close-verdict` too, and counting those as close readings is the axis-mixing
  // mistake — an exit evaluation is a form check, never a verdict.
  const post = events.find((e) => e.type === 'outer-close');
  assert.ok(post, 'the close ran after the work');
  assert.equal(post.declared, true, 'the deciding verdict came from the DECLARED executor, not the command path');
  assert.equal(post.verdict, 'satisfied');
  assert.deepEqual(
    post.stages.map((/** @type {any} */ s) => [s.name, s.verdict]),
    job.closeDecl.stages.map((s) => [s.name, 'satisfied']),
    'every declared stage ran and every one of them greened — a later green can never mask an earlier red',
  );

  // ── the one ledger and the job-end money contract, unchanged by the shape ────
  const end = events.find((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green');
  assert.equal(end.spendComplete, true);
  assert.ok(end.spentUsd > 0, 'the declared flow\'s rounds landed on the ONE ledger');
  assert.equal(events.find((e) => e.type === 'job-start').shape, 'plan');
});

test('a red declared close prefixes every gap line with DECLARED_GAP_PREFIX, under the stage header trend.js parses', async (t) => {
  const { dir, spine } = makePatient(t);
  const job = declaredJob();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);

  // the step's exit is FORM only (`tree-changed`), so the step greens on a write
  // the close will refuse: `src/fix.js` exists but carries no ok marker. That is
  // the shape the gap exists for — the step passed its own check, and only the
  // close is truth.
  const provider = scriptedProvider([
    { text: 'src/ holds mod.js; check.mjs is the gate.' },
    { text: PLAN([{ type: 'tree-changed', scope: 'src/**' }]) },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(dir, 'src', 'fix.js'), content: '// not the marker\n' } }] },
    { text: 'wrote src/fix.js' },
    { text: 'no further edits' },   // the fix loop runs out of ideas rather than converging
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine), capRuns: 2,
  });
  const events = readSpine(spine);
  assert.notEqual(outcome, 'green', JSON.stringify(events.filter((e) => e.type === 'job-end')));

  // the close that judged the worker's write: past `changed-from-seed` (the tree
  // DID change), red at the work stage
  // `declared` scopes this to the close's own executor — the per-step micro-loops
  // emit `close-verdict` from the exit evaluator on the same ralph, and those are
  // form checks, not verdicts
  const red = events.filter((e) => e.type === 'close-verdict' && e.declared === true && e.verdict !== 'satisfied')
    .find((e) => e.stage === 'verdict');
  assert.ok(red, `the declared work stage rendered the red: ${JSON.stringify(events.filter((e) => e.type === 'close-verdict'))}`);
  assert.equal(red.declared, true);
  assert.equal(red.exitCode, 1);

  const [header, ...body] = red.gap.split('\n');
  assert.equal(header, stageGap('verdict', '').trimEnd(), 'the SAME header the command path writes — trend.js buckets on it');
  assert.ok(body.length > 0, 'the wall\'s own output travels with the header');
  for (const line of body.filter((l) => l !== '')) {
    assert.ok(line.startsWith(DECLARED_GAP_PREFIX), `every declared gap line carries the prefix: ${JSON.stringify(line)}`);
  }
  assert.ok(body.some((l) => l.includes('FAILED src/fix.js')), 'the gap carries what the stage actually said');
});

// ══ F198 — the fix-loop governor reads a DECLARED close's own {stage, value},
// never re-parses its gap text ══════════════════════════════════════════════
//
// Proven cause (orchestrator's $0 replay of readGrade over run mul5fofw's own
// spine, 2026-09-28): a `count-not-worse` gap reads `"12 against a baseline of
// 0 (lower-is-better) — worse"` — no line contains the word "red", so
// `readGrade`'s `\bred\b` scan (src/trend.js) returned `value: null` on EVERY
// declared grade the fix loop ever produced, real spine included. The stage
// name still came through (the header regex reads it independent of the count),
// so the governor's STAGE-position comparison kept working while its NUMBER
// comparison never did — exactly what mul5fofw's own `ladder` records show
// (`"stage":"typecheck-target-zero-errors","value":null`, three separate
// stages). `runDeclaredStages` already hands back the number as `trendValue`
// (`closeGrade`, src/declaredclose.js) — planrun.js's fix governor now feeds
// that structured reading straight to the trend instead of `{ gap }`.

/** a `count-not-worse` stage whose count comes from a file the worker edits
 * directly — a real subprocess, real parsed output, no crafted fixture text. */
const COUNT_STAGE = {
  name: 'count-stage',
  kind: 'count-not-worse',
  params: {
    cmd: 'node',
    args: ['check-count.mjs'],
    parser: { terms: [{ lineMatch: 'ERR\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
    scope: { includePrefixes: ['src/'] },
    direction: 'lower-is-better',
    baseline: 0,
  },
};

const DECL_COUNT = () => ({
  genre: GENRE,
  lang: 'js',
  stages: [guards(['src/'])[0], COUNT_STAGE, guards(['src/'])[1]],
});

const countJob = () => ({
  schema: 'job-v1',
  job: 'declared-count-through-runjob',
  description: 'a declared count-not-worse stage — the exact shape mul5fofw\'s fix loop graded blind',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  goal: 'Lower the value in src/count.txt to 0.',
  verdictType: 'green',
  closeDecl: DECL_COUNT(),
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
});

/**
 * A patient whose close COUNTS `ERR\d+` lines a real subprocess prints, one per
 * unit in `src/count.txt` — the worker's own edit drives a real, measured
 * number through the declared executor. Seeded at 9 so the step's OWN first
 * write (9 → 5) satisfies `changed-from-seed` before the count stage is ever
 * reached, exactly like a real run's first pass through a staged close.
 * @param {any} t
 */
function makeCountPatient(t) {
  const dir = mkdtempSync(join(tmpdir(), 'planrun-decl-count-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  writeFileSync(join(dir, '.gitignore'), '.smoke/\n');
  writeFileSync(join(dir, 'src', 'count.txt'), '9\n');
  writeFileSync(join(dir, 'check-count.mjs'), `import { readFileSync } from 'node:fs';
const n = Number(readFileSync(new URL('./src/count.txt', import.meta.url).pathname, 'utf8').trim() || '0');
for (let i = 0; i < n; i++) console.log('ERR' + i + ' at src/count.txt');
process.exit(0);
`);
  const seed = initPatientRepo(dir);
  const spineDir = mkdtempSync(join(tmpdir(), 'planrun-decl-count-spine-'));
  t.after(() => rmSync(spineDir, { recursive: true, force: true }));
  return { dir, seed, spine: join(spineDir, 'spine.jsonl') };
}

const writeCount = (/** @type {string} */ dir, /** @type {string} */ n, /** @type {string} */ id) => [
  { toolCalls: [{ id, name: 'shell_write', arguments: { path: join(dir, 'src', 'count.txt'), content: `${n}\n` } }] },
  { text: `count -> ${n}` },
];

test('F198: the fix-loop governor reads a declared close\'s own value — flat/improved/flat/flat strikes out on the REAL numbers, never on a blind null', async (t) => {
  const { dir, spine } = makeCountPatient(t);
  const job = countJob();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);

  const provider = scriptedProvider([
    { text: 'src/count.txt holds a number; check-count.mjs is the gate.' },
    { text: PLAN([{ type: 'tree-changed', scope: 'src/**' }]) },
    ...writeCount(dir, '5', 't0'),  // the step: 9 -> 5, tree-changed satisfied; outer-close reds at count-stage=5
    ...writeCount(dir, '5', 't1'),  // fix 1: flat (5 == 5) -> strike 1
    ...writeCount(dir, '3', 't2'),  // fix 2: improved (3 < 5) -> resets to 0
    ...writeCount(dir, '3', 't3'),  // fix 3: flat (3 == 3) -> strike 1
    ...writeCount(dir, '3', 't4'),  // fix 4: flat (3 == 3) -> strike 2, struck out
    { text: 'never bought' },
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine), capRuns: 9,
  });
  const events = readSpine(spine);
  assert.equal(outcome, 'escalated', JSON.stringify(events.filter((e) => e.type === 'escalation')));

  const post = events.find((e) => e.type === 'outer-close');
  assert.equal(post.declared, true);
  assert.equal(post.stage, 'count-stage');
  assert.equal(post.trendValue, 5, 'the opening grade carries a REAL number — the seed for the fix loop\'s comparisons');

  const reads = events.filter((e) => e.type === 'ladder' && e.governor === 'close-trend');
  assert.deepEqual(reads.map((r) => r.stage), ['count-stage', 'count-stage', 'count-stage', 'count-stage']);
  // THE BUG'S SIGNATURE: under readGrade, every one of these reads `value: null`
  // because no `count-not-worse` gap line ever contains the word "red". Fixed,
  // they read the close's own measured number.
  assert.deepEqual(reads.map((r) => r.value), [5, 3, 3, 3], 'the governor now sees the SAME numbers the close measured — never a re-parsed null');
  assert.deepEqual(reads.map((r) => r.comparable), [true, true, true, true], 'every reading compares against this stage\'s own history');
  assert.deepEqual(reads.map((r) => r.improved), [false, true, false, false], 'fix 2\'s 5 -> 3 is a real improvement, read as one');
  assert.deepEqual(reads.map((r) => r.noProgress), [1, 0, 1, 2], 'a real improvement RESETS the strike count — fix 2 clears fix 1\'s strike');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt');
  assert.match(esc.decision, /2\/2 strike|no progress|stopped making progress/i);
});

// ══ mul5fofw — the fix-loop exhaustion terminal must never advertise `--resume`
// on an ESCALATED run ═══════════════════════════════════════════════════════
//
// TRACE: this terminal (planrun.js's `fixGovernor.terminal()`) always rides out
// through ralph.js's `exhausted()` as `outcome: 'escalated'` — ralph.js's own
// comment: "the category stays `cap-halt` and the outcome stays `escalated`".
// `escalated` is a GRADED RED (src/reuse.js's `REUSE_GRADED_RED`): the close
// rendered a verdict and it was red, which is why `escalated` is deliberately
// NOT a member of `CHECKPOINT_OUTCOMES` — a rendered verdict is an answer
// already in hand, not a checkpoint to resume. Before the fix, this terminal's
// options always named `--resume` as a lever anyway (byte-identical whether
// `resumable` was true or false), so a real live run (mul5fofw, ESCALATED
// cap-halt strikes 2/2) told the person to "top up and rerun with --resume" —
// advice `userrun.js`'s own `RESUMABLE_HALTS` check (built on `CHECKPOINT_OUTCOMES`)
// refuses outright.
test('F197/mul5fofw: an ESCALATED run\'s exhaustion options never advertise --resume — escalated is a graded red, not a checkpoint', async (t) => {
  const { dir, spine } = makeCountPatient(t);
  const job = countJob();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);

  const provider = scriptedProvider([
    { text: 'src/count.txt holds a number; check-count.mjs is the gate.' },
    { text: PLAN([{ type: 'tree-changed', scope: 'src/**' }]) },
    ...writeCount(dir, '5', 't0'),
    ...writeCount(dir, '5', 't1'),
    ...writeCount(dir, '3', 't2'),
    ...writeCount(dir, '3', 't3'),
    ...writeCount(dir, '3', 't4'),
    { text: 'never bought' },
  ]);
  const outcome = await runJob(job, {
    approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine), capRuns: 9,
  });
  assert.equal(outcome, 'escalated');

  const esc = readSpine(spine).filter((e) => e.type === 'escalation').at(-1);
  assert.ok(!esc.options.some((o) => /--resume/.test(o)),
    `an escalated run's options must never name --resume (it will refuse) — got ${JSON.stringify(esc.options)}`);
  assert.ok(esc.options.some((o) => /cannot be resumed/i.test(o)),
    `an escalated run's options must say plainly it cannot be resumed — got ${JSON.stringify(esc.options)}`);
});

// ══ F198 item 2 — the fix worker gets a FACTS-ONLY number history, never just
// the current gap in isolation ═══════════════════════════════════════════════
//
// TRACE (planrun.js's `middle`, the fix loop's worker turn): before this test's
// fix landed, `w.ask([...])` (src/planrun.js, the fix loop's own `middle`) sent
// the worker exactly: the fixed "fix the repository" sentence, the repo root,
// the plan's own working-context artifacts, and EITHER the close's original
// output (first attempt) OR the PREVIOUS attempt's raw gap (every attempt
// after) — one iteration's worth of text, never a history of prior numbers.
test('F198 item 2: the fix worker\'s prompt carries the close\'s own number history, growing one entry per attempt — facts only, no advice', async (t) => {
  const { dir, spine } = makeCountPatient(t);
  const job = countJob();
  assert.deepEqual(validateJob(job, { shellCapUsd: job.budgetUsd }).reds, []);

  const provider = scriptedProvider([
    { text: 'src/count.txt holds a number; check-count.mjs is the gate.' },
    { text: PLAN([{ type: 'tree-changed', scope: 'src/**' }]) },
    ...writeCount(dir, '5', 't0'),
    ...writeCount(dir, '5', 't1'),
    ...writeCount(dir, '3', 't2'),
    { text: 'stop here' },
  ]);
  await runJob(job, { approvals: approve(job), workdir: dir, provider, emit: makeSpine(spine), capRuns: 9 });

  const fixCalls = provider.calls.filter((c) => c.includes('The close\'s own numbers so far'));
  // t1, t2, then two more flat auto-continuation attempts (the scripted provider
  // sticks on its last entry) before the loop strikes out at noProgress 2/2 —
  // one facts line per fix ATTEMPT, never on the step's own turn.
  assert.equal(fixCalls.length, 4, 'one facts line per fix attempt');
  assert.match(fixCalls[0], /checks passed \d+\/\d+/, 'the checks-passed count rides the same line');
  // the close is first-red-wins and reds at the count stage (2nd of the declared
  // stages), so fewer stages RAN than are declared: M must be the DECLARED count
  // (mul5fofw shape), never the ran count ("1/2")
  const declaredN = job.closeDecl.stages.length;
  assert.ok(declaredN > 2, 'fixture: the close must red before its last declared stage');
  for (const c of fixCalls) assert.match(c, new RegExp(`checks passed (\\d+/${declaredN} → )*\\d+/${declaredN}(?= ·)`), 'M is the declared stage count');
  assert.match(fixCalls[0], new RegExp(`checks passed 1/${declaredN} ·`), 'one stage passed of the declared count, not of the ran count');
  assert.match(fixCalls[0], /count-stage 5/, 'fix attempt 1 sees the seed grade (5) already on the record');
  assert.match(fixCalls[1], /count-stage 5 → 5/, 'fix attempt 2 sees BOTH prior grades — the history GROWS, one entry per attempt');
  assert.doesNotMatch(fixCalls[0], /top up|revise|abandon|converging|strike/i, 'facts only — no lever, no advice, no model-generated prose');
});
