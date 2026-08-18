// POC — N4 slice 1 (hitl): THE RETURN, not the pause.
//
// The riskiest assumption in docs/02-features/2026-08-13-n4-verdict-classes-build.md §1.8 is
// that a human's end-of-run "rerun <text>" routes through the EXISTING close-fix-loop
// machinery unchanged, and that the run genuinely CONTINUES — under a wallet folded from
// the paused leg's spend, on a wall that never billed the human's deciding time — rather
// than starting a second run wearing a checkpoint's clothes.
//
// $0. No network, no API key, no paid provider: the worker is `tests/helpers.js`'s
// scripted provider (the one legitimate seam), the patient is a throwaway git repo this
// file creates, and the close is three real spawned commands.
//
// REAL machinery: `runJob` (src/run.js) → `runPlan` (src/planrun.js) → `ralph` → the real
// Gate/Loop/LiteCtx, `readResume`/`resumeTreeGate`/`deriveStatus` (src/reuse.js,
// src/bridges.js), the real `redactSecrets`/`boundGap` inventories. Nothing here
// reimplements any of it.
//
// TWO LABELLED SHIMS, and their shape is the build item (§1.3/§1.4):
//   SHIM 1 — the PAUSE branch. `runPlan` has no seam between the close verdict and the
//            fix loop: `post` is satisfied → green, a FAULT → close-red, anything else →
//            fix loop. A pause is a fifth, non-verdict outcome and it does not exist.
//   SHIM 2 — the CANCEL branch, at the same seam and for the same reason.
// Both are injected into a COPY of src/planrun.js (poc/.n4-shim/, deleted on exit) so
// src/ is untouched; the exact inserted text is printed by `--diff`.
//
// Run: node poc/n4-hitl-return.mjs        (exits 1 on any failed expectation)
//      node poc/n4-hitl-return.mjs --diff (also prints the two shims verbatim)

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { scriptedProvider, initPatientRepo } from '../tests/helpers.js';
import { jobSpecHash } from '../src/job.js';
import { readResume, resumeTreeGate, REUSE_GRADED_RED } from '../src/reuse.js';
import { deriveStatus } from '../src/bridges.js';
import { scanSecrets } from '../src/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = join(REPO, 'src');
const SHIM_DIR = join(HERE, '.n4-shim');

let failed = 0;
const check = (name, got, want = true) => {
  const ok = Object.is(got, want) || (typeof got === 'object' && JSON.stringify(got) === JSON.stringify(want));
  console.log(`${ok ? 'ok  ' : 'NOT OK'} ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
  if (!ok) failed += 1;
  return ok;
};
const section = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 72 - s.length))}`);

// ═══════════════════════════════════════════════════════════════════════════════
// THE SHIMS — the build items, in real code, at the real seam
// ═══════════════════════════════════════════════════════════════════════════════

/** the human stage's stand-in for a `pause` StageResult verdict (§1.3's fifth outcome) */
const PAUSE_EXIT = 78;
/** …and for the signer's `cancel` answer (2026-08-12 §1, door three) */
const CANCEL_EXIT = 79;

/** the anchor: `runPlan`'s post-steps close verdict, src/planrun.js §4 */
const ANCHOR = `  const post = await judgeClose();
  emit('outer-close', { ...post });
  if (post.verdict === 'satisfied') {
    planExecuted();
    return 'green';
  }
`;

const SHIMS = `
  // ══════════════ POC SHIM 1 — THE PAUSE BRANCH (N4 §1.3/§1.4) ══════════════
  // NOT IN src/. In the build the signal is a fifth StageResult verdict ('pause')
  // produced by the human-confirms kind and propagated by runDeclaredStages; here
  // it is the human stage's own exit code, because a command close is all a $0 POC
  // can express. EVERYTHING ELSE is what the build must do at this exact line: a
  // non-verdict that is neither green nor red (F17), the plan recorded as executed
  // (so the checkpoint is on the spine), and a DISTINCT decision-ready terminal
  // that runJob writes a clean job-end for.
  if (post.verdict === 'needs_revision' && post.stages?.at(-1)?.exitCode === ${PAUSE_EXIT}) {
    emit('hitl-pause', {
      stage: post.stage,
      decisionReady: true,
      // ruling 2's evidence package: every mechanical stage's own result, never a
      // bare "approve?". (The before/after diff half is \`changedSet\`/\`addedLines\`
      // in src/kinds.js — not assembled here; the POC is about the RETURN.)
      stages: post.stages,
      decision: 'The close reached its human stage. Three answers: accept | rerun <text> | cancel.',
      options: ['accept', 'rerun with editable text', 'cancel'],
    });
    planExecuted();
    return 'hitl-pause';
  }
  // ══════════════ POC SHIM 2 — CANCEL: terminal, no gap, no continuation ══════
  if (post.verdict === 'needs_revision' && post.stages?.at(-1)?.exitCode === ${CANCEL_EXIT}) {
    emit('hitl-cancel', {
      stage: post.stage, decisionReady: true, gap: null,
      decision: 'The signer cancelled at the human stage. Terminal: no gap, no continuation.',
    });
    planExecuted();
    return 'hitl-cancel';
  }
  // ══════════════════════════ end POC shims ══════════════════════════════════
`;

/**
 * Build the shimmed module pair. planrun.js gets the two branches above and NOTHING
 * else; run.js gets no semantic change at all — only its `./planrun.js` import
 * repointed. Relative imports are rewritten to absolute src/ paths so both copies run
 * against the real modules; the copies live under poc/ so bare specifiers still resolve
 * to the repo's own node_modules.
 */
function loadShimmed() {
  rmSync(SHIM_DIR, { recursive: true, force: true });
  mkdirSync(SHIM_DIR, { recursive: true });

  let planrun = readFileSync(join(SRC, 'planrun.js'), 'utf8');
  if (!planrun.includes(ANCHOR)) throw new Error('POC shim anchor not found in src/planrun.js — the seam moved; re-read §1.4 before trusting anything below');
  planrun = planrun.replace(ANCHOR, ANCHOR + SHIMS);
  planrun = planrun.replaceAll("from './", `from '${SRC}/`);
  writeFileSync(join(SHIM_DIR, 'planrun.shim.js'), planrun);

  let run = readFileSync(join(SRC, 'run.js'), 'utf8');
  run = run.replaceAll("from './", `from '${SRC}/`);
  run = run.replace(`from '${SRC}/planrun.js'`, "from './planrun.shim.js'");
  writeFileSync(join(SHIM_DIR, 'run.shim.js'), run);

  return import(join(SHIM_DIR, 'run.shim.js'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE PATIENT — a throwaway git repo with a two-stage command close
// ═══════════════════════════════════════════════════════════════════════════════

const CLOSE_ARTIFACT = `// mechanical stage: the artifact exists and carries the marker
import { existsSync, readFileSync } from 'node:fs';
const p = new URL('../out/report.md', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('DONE')) { console.log('artifact ok'); process.exitCode = 0; }
else { console.log('MISSING out/report.md (or no DONE marker)'); process.exitCode = 1; }
`;

// The human stage. In the build this is the \`human-confirms\` KIND (src/kinds.js), which
// does not run at all — it PAUSES. Here it is a command whose exit code carries the
// signer's answer, read from a decision file the runner writes beside it.
const CLOSE_HUMAN = `import { existsSync, readFileSync } from 'node:fs';
const decFile = new URL('./decision.json', import.meta.url).pathname;
const report = new URL('../out/report.md', import.meta.url).pathname;
const d = existsSync(decFile) ? JSON.parse(readFileSync(decFile, 'utf8')) : { decision: 'pending' };
if (d.decision === 'pending') { process.exitCode = ${PAUSE_EXIT}; }
else if (d.decision === 'cancel') { process.exitCode = ${CANCEL_EXIT}; }
else if (d.decision === 'accept') { console.log('signer accepted'); process.exitCode = 0; }
else {
  // rerun: the human's ask is satisfied when the tree carries what he asked for
  const body = existsSync(report) ? readFileSync(report, 'utf8') : '';
  if (d.satisfiedWhen && body.includes(d.satisfiedWhen)) { console.log('signer\\'s ask is met'); process.exitCode = 0; }
  else { if (d.text) process.stdout.write(d.text + '\\n'); process.exitCode = 1; }
}
`;

const JOB = (over = {}) => ({
  schema: 'job-v1',
  job: 'n4-hitl-poc',
  description: 'N4 slice-1 POC patient — a report the signer reviews',
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  maxWallMs: 30 * 60_000,
  writeScope: ['out/**'],
  goal: 'Write out/report.md carrying the DONE marker, then have the signer review it.',
  verdictType: 'green',
  close: [
    { name: 'artifact-exists', cmd: 'node close/artifact.mjs', expect: 0, gapKeep: '^MISSING' },
    // offer:false — ruling 5's "a human stage is never an in-run ruler", expressed with
    // the field the schema already has. It is also why the human stage never runs at the
    // seed-verdict read (ruling 8): the check preflight only runs OFFERED stages.
    { name: 'human-review', cmd: 'node close/human.mjs', expect: 0, gapKeep: '^HUMAN', offer: false },
  ],
  tools: ['read', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
  ...over,
});

const PLAN = JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-report',
    action: 'Write out/report.md carrying the DONE marker.',
    tools: ['write'], rounds: 6, target: 'out/report.md',
    exit: [{ type: 'tree-changed', scope: 'out/**' }],
  }],
});

const tcall = (id, name, args) => ({ id, name, arguments: args });

function makePatient() {
  const wd = mkdtempSync(join(tmpdir(), 'n4-hitl-'));
  mkdirSync(join(wd, 'close'));
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export const x = 1;\n');
  writeFileSync(join(wd, 'close', 'artifact.mjs'), CLOSE_ARTIFACT);
  writeFileSync(join(wd, 'close', 'human.mjs'), CLOSE_HUMAN);
  initPatientRepo(wd);
  return wd;
}

/** the signer's three-button answer, written where the human stage reads it */
const decide = (wd, d) => writeFileSync(join(wd, 'close', 'decision.json'), JSON.stringify(d));

// ═══════════════════════════════════════════════════════════════════════════════
// A SPINE ON AN INJECTABLE CLOCK
// `makeSpine` (src/spine.js) stamps `ts` from the real clock and has no `now` seam, so
// the POC writes the same envelope with a virtual one. That is what lets 45 days of
// deciding time pass between the pause and the resume for $0 — and readResume's wall
// arithmetic reads nothing but these stamps.
// ═══════════════════════════════════════════════════════════════════════════════

function virtualSpine(file, clock, startSeq = 0) {
  let seq = startSeq;
  return (type, data = {}) => {
    const { type: _t, seq: _s, ts: _ts, ...payload } = data;
    const ev = { type, ...payload, seq: ++seq };
    ev.ts = new Date(clock.t).toISOString();
    clock.t += clock.stepMs;
    appendFileSync(file, `${JSON.stringify(ev)}\n`);
    return ev;
  };
}
const readSpineFile = (f) => readFileSync(f, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** a provider that must never be called (accept / cancel: no worker round is paid) */
function forbiddenProvider() {
  const state = { calls: 0 };
  return { state, async generate() { state.calls += 1; throw new Error('POC: a worker round was bought on a path that must buy none'); } };
}

// ═══════════════════════════════════════════════════════════════════════════════

const TOKEN = 'xoxb-hitlPOCsecret0123';
const PAD = Array.from({ length: 90 }, (_, i) => `pad line ${String(i).padStart(4, '0')} — filler the bound must elide`).join('\n');
const HUMAN_TEXT = [
  'HUMAN: the report is thin — add a "## Risks" section naming at least one risk.',
  `HUMAN: (my scratch token, do not log: ${TOKEN})`,
  PAD,
  'HUMAN: and keep the DONE marker where it is.',
  PAD,
].join('\n');

const DAYS_45 = 45 * 24 * 60 * 60_000;
const WALL_MS = JOB().maxWallMs;

async function main() {
  const { runJob } = await loadShimmed();
  if (process.argv.includes('--diff')) console.log(`\nTHE SHIMS, verbatim (inserted after src/planrun.js's outer-close):\n${SHIMS}`);

  const spec = JOB();
  const approvals = [{ specHash: jobSpecHash(spec), signer: 'n4-poc', ts: new Date().toISOString() }];

  // ── LEG 1: run to the human stage, pause, exit ────────────────────────────
  section('LEG 1 — the run reaches the human stage and PAUSES');
  const wd1 = makePatient();
  const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wd1, encoding: 'utf8' }).trim();
  const spine1 = join(wd1, '..', `n4-poc-${process.pid}.jsonl`);
  const clock1 = { t: Date.parse('2026-08-13T09:00:00.000Z'), stepMs: 500 };
  const provider1 = scriptedProvider([
    { text: 'src/mod.mjs exists; out/ is empty — no report yet.' },
    { text: PLAN },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd1, 'out', 'report.md'), content: '# Report\n\nDONE\n' })] },
    { text: 'wrote out/report.md' },
  ]);

  const leg1 = await runJob(spec, {
    approvals, workdir: wd1, provider: provider1, emit: virtualSpine(spine1, clock1), capRuns: 3,
  });
  const ev1 = readSpineFile(spine1);
  const at = (t) => ev1.findIndex((e) => e.type === t);

  check('leg 1 terminal is the distinct pause (SHIM 1), not green/red/escalated', leg1, 'hitl-pause');
  check('the pause is decision-ready and names the stage', ev1.find((e) => e.type === 'hitl-pause')?.stage, 'human-review');
  check('ruling 2 — the evidence package carries every mechanical stage result',
    ev1.find((e) => e.type === 'hitl-pause')?.stages?.map((s) => `${s.name}:${s.verdict}`),
    ['artifact-exists:satisfied', 'human-review:needs_revision']);
  const end1 = ev1.find((e) => e.type === 'job-end');
  check('§1.4 — a pause is a CLEAN exit: spendComplete stays true', end1?.spendComplete, true);
  check('§1.7 — the pause carries the run\'s real spend, not $0', end1.spentUsd > 0, true);
  check('§1.7 — the human stage bought NO worker round (none after outer-close)',
    ev1.slice(at('outer-close')).some((e) => e.type === 'worker-round'), false);
  check('ruling 8 — the human stage never ran at the seed (offer:false keeps it off the check menu)',
    ev1.find((e) => e.type === 'check-menu')?.offered, ['artifact-exists']);
  check('…and the close PRECHECK stopped at the mechanical stage, never reaching the human one',
    ev1.find((e) => e.type === 'close-precheck')?.stage, 'artifact-exists');

  // §1.8 point 4 — confirm, don't assume
  check('§1.6 — the pause lands AFTER the plan\'s steps (outer-close follows step-end)',
    at('outer-close') > at('step-end') && at('step-end') > -1, true);

  // ── the checkpoint, read through the REAL reader ──────────────────────────
  section('THE CHECKPOINT — readResume, 45 simulated days of deciding later');
  const pausedAtMs = Date.parse(ev1.at(-1).ts);
  const startedAtMs = Date.parse(ev1.find((e) => e.type === 'job-start').ts);
  const LEG1_ELAPSED = pausedAtMs - startedAtMs;
  const resumeAtMs = pausedAtMs + DAYS_45;

  // §1.6: "only scripts/run-u.mjs:161 RESUMABLE_HALTS gains the name" — tested by
  // passing the new name through readResume's EXISTING `resumableOutcomes` parameter.
  const RESUMABLE = ['cap-halt', 'wall-halt', 'step-stalled', 'hitl-pause'];
  const dead = readResume(ev1, { direct: true, resumableOutcomes: RESUMABLE });
  check('§1.6 — no library change: the pause reads as a CHECKPOINT via resumableOutcomes alone',
    dead.restart !== null, true);
  check('…and is deliberately NOT "ended" (there is something left to continue)', dead.ended, false);
  check('…while the recorded terminal is still named honestly', dead.endOutcome, 'hitl-pause');
  check('the checkpoint\'s phase is CLOSE — the resumed leg re-enters at the close/fix loop, not at a step',
    dead.restart.seed.phase, 'close');
  check('…with every plan step already completed', dead.restart.seed.completedSteps.map((c) => c.id), ['write-report']);
  check('the work branch is carried forward, not recomputed', dead.restart.branch, 'bareloop-n4-hitl-poc');
  check('the money fold is the paused leg\'s own spend, and exact',
    dead.restart.priorSpentUsd === end1.spentUsd && dead.restart.priorSpendComplete === true, true);

  // (c) — the wall folds ONLY the paused leg's elapsed
  check('(c) the wall fold is EXACTLY the paused leg\'s own elapsed', dead.restart.priorWallMs, LEG1_ELAPSED);
  check(`(c) …and that is seconds, not the ${DAYS_45 / 86400000} days of deciding`, dead.restart.priorWallMs < 60_000, true);
  const RESUME_WALL_MS = Math.max(0, WALL_MS - dead.restart.priorWallMs); // scripts/run-u.mjs:228, verbatim
  check('(c) the resumed leg gets the REMAINDER of the signed wall, nearly all of it',
    RESUME_WALL_MS, WALL_MS - LEG1_ELAPSED);
  // the hazard §1.6 names, MEASURED: a stale watchdog report post-dating the pause
  const hazard = readResume(ev1, { direct: true, resumableOutcomes: RESUMABLE, deathAt: resumeAtMs });
  check('(c) HAZARD, measured — a stale watchdog `at` bills the human\'s deciding time to the wall',
    hazard.restart.priorWallMs, LEG1_ELAPSED + DAYS_45);
  check('(c) …which would leave the resumed leg 0ms and doom it before it starts',
    Math.max(0, WALL_MS - hazard.restart.priorWallMs), 0);

  // the tree gate the 60-day TTL class leans on
  const treeState = () => ({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wd1, encoding: 'utf8' }).trim(),
    seed,
    dirty: execFileSync('git', ['status', '--porcelain'], { cwd: wd1, encoding: 'utf8' }),
  });
  check('resumeTreeGate admits the paused tree (dirty is expected, HEAD unmoved)', resumeTreeGate(treeState()).ok, true);

  // ── the resume harness ────────────────────────────────────────────────────
  /** a fresh copy of the paused patient + its spine, so each answer is independent */
  const fork = (tag) => {
    const dir = mkdtempSync(join(tmpdir(), `n4-hitl-${tag}-`));
    rmSync(dir, { recursive: true, force: true });
    execFileSync('cp', ['-a', wd1, dir]);
    const sp = join(dir, '..', `n4-poc-${tag}-${process.pid}.jsonl`);
    writeFileSync(sp, ev1.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return { dir, spine: sp };
  };
  // ── (a)+(b): RERUN — the human's words are the gap ────────────────────────
  section('(a)/(b) RERUN — the human\'s text IS the gap, and the run continues');
  {
    const { dir, spine } = fork('rerun');
    decide(dir, { decision: 'rerun', text: HUMAN_TEXT, satisfiedWhen: '## Risks' });
    const p = scriptedProvider([
      { toolCalls: [tcall('f1', 'shell_write', { path: join(dir, 'out', 'report.md'), content: '# Report\n\nDONE\n\n## Risks\n- nobody reads it\n' })] },
      { text: 'added the Risks section the signer asked for' },
    ]);
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    const clock = { t: resumeAtMs, stepMs: 500 };
    const outcome = await runJob(spec, {
      approvals, workdir: dir, provider: p, emit: virtualSpine(spine, clock, evs.at(-1).seq), capRuns: 3,
      priorSpentUsd: d.restart.priorSpentUsd, priorSpendComplete: d.restart.priorSpendComplete,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeReplans: { count: d.restart.replans, grantUsed: d.restart.replanGrantUsed },
      resumeBranch: d.restart.branch,
    });
    const ev2 = readSpineFile(spine).slice(ev1.length);
    const ask = p.calls[0] ?? '';

    check('the fix loop bought at least one iteration', ev2.some((e) => e.type === 'fix-loop'), true);
    check('(a) the human\'s text arrives through the SAME seam post.gap uses',
      ask.includes("The verification's output on the tree as it stands (not an attempt of yours):"), true);
    check('(a) …carrying the human\'s own words, verbatim',
      ask.includes('add a "## Risks" section naming at least one risk'), true);
    check('(a) …under the close\'s own stage header (the wall he is answering)',
      ask.includes('close stage "human-review" failed:'), true);
    check('(a) BOUNDED — the oversized text was elided by boundGap', ask.includes('chars truncated'), true);
    check('(a) …and gapKeep carried the buried HUMAN lines through the elision',
      ask.includes('and keep the DONE marker where it is.'), true);
    // positive control for the scrub test: the plant must actually BE a secret by the
    // same inventory, or "no secret in the prompt" proves nothing
    check('(a) control — the planted token is a real secret shape to THIS repo\'s inventory',
      scanSecrets(HUMAN_TEXT), [TOKEN]);
    check('(a) SCRUBBED — the planted token never reaches the worker', ask.includes(TOKEN), false);
    check('(a) …by the repo\'s own inventory, not by luck', scanSecrets(ask), []);
    check('(b) the run genuinely CONTINUES to a verdict', outcome, 'green');
    check('(b) …re-entering at the close, never at a step (no step-start on the resumed leg)',
      ev2.some((e) => e.type === 'step-start'), false);
    check('(b) …with the step skipped, not re-run and not re-paid',
      ev2.find((e) => e.type === 'step-skipped')?.step, 'write-report');
    check('(b) …and the scout skipped by name, never in silence',
      ev2.find((e) => e.type === 'scout-skipped')?.phase, 'close');
    const end2 = ev2.find((e) => e.type === 'job-end');
    check('(b) the wallet CONTINUES from the paused leg (job-end folds priorSpentUsd)',
      end2.spentUsd > end1.spentUsd, true);
    check('(b) …and job-start declared the fold it inherited',
      ev2.find((e) => e.type === 'job-start')?.priorSpentUsd, end1.spentUsd);
    check('(b) the tree carries the human-asked change', readFileSync(join(dir, 'out', 'report.md'), 'utf8').includes('## Risks'), true);
    rmSync(dir, { recursive: true, force: true });
  }

  // ── (b) the should-differ control: the FOLD actually binds ─────────────────
  section('(b) CONTROL — the same rerun with the wallet already spent');
  {
    const { dir, spine } = fork('nofunds');
    decide(dir, { decision: 'rerun', text: HUMAN_TEXT, satisfiedWhen: '## Risks' });
    // BYTE-IDENTICAL to the arm above — same script, same tool call, same tree.
    // The ONLY variable is the fold. (An earlier version of this control scripted a
    // TEXT-ONLY worker and read 3 rounds bought on an empty wallet; that was a harness
    // confound, not a finding: bareguard halts the budget axis at `check()`, and only a
    // TOOL action is checked — an LLM round is a `record`. A worker that never reaches
    // for a tool is never gated on money. Audited, then fixed here.)
    const p = scriptedProvider([
      { toolCalls: [tcall('f1', 'shell_write', { path: join(dir, 'out', 'report.md'), content: '# Report\n\nDONE\n\n## Risks\n- nobody reads it\n' })] },
      { text: 'added the Risks section the signer asked for' },
    ]);
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    const outcome = await runJob(spec, {
      approvals, workdir: dir, provider: p, emit: virtualSpine(spine, { t: resumeAtMs, stepMs: 500 }, evs.at(-1).seq), capRuns: 3,
      // the ONLY changed variable: the paused leg is declared to have spent the budget
      priorSpentUsd: spec.budgetUsd, priorSpendComplete: true,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeReplans: { count: d.restart.replans, grantUsed: d.restart.replanGrantUsed },
      resumeBranch: d.restart.branch,
    });
    const ev2 = readSpineFile(spine).slice(ev1.length);
    if (process.env.N4_DEBUG) console.log(JSON.stringify(ev2.map((e) => [e.type, e.costUsd ?? e.category ?? e.iteration ?? '']), null, 0));
    check('(b) with nothing left in the folded wallet the run cap-halts instead of greening', outcome, 'cap-halt');
    // MEASURED, not assumed: the fold binds at the first GATED ACTION, not at the first
    // round (bareguard halts on `check()`; an LLM round is a `record`). So exactly one
    // round is bought and the write never lands.
    check('(b) …exactly one round is bought before the gate halts it', p.calls.length, 1);
    check('(b) …and the human-asked change never lands (the two arms differ)',
      readFileSync(join(dir, 'out', 'report.md'), 'utf8').includes('## Risks'), false);
    check('(b) …with the money-halt readout, not a capability red',
      ev2.some((e) => e.type === 'money-halt'), true);
    rmSync(dir, { recursive: true, force: true });
  }

  // ── (d) ACCEPT ────────────────────────────────────────────────────────────
  section('(d) ACCEPT — green without paying a worker round, on FRESH evidence (OPEN-3)');
  {
    const fp = forbiddenProvider();
    const { dir, spine } = fork('accept');
    decide(dir, { decision: 'accept' });
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    const outcome = await runJob(spec, {
      approvals, workdir: dir, provider: fp, emit: virtualSpine(spine, { t: resumeAtMs, stepMs: 500 }, evs.at(-1).seq),
      priorSpentUsd: d.restart.priorSpentUsd, priorSpendComplete: d.restart.priorSpendComplete,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeBranch: d.restart.branch,
    });
    const ev2 = readSpineFile(spine).slice(ev1.length);
    check('(d) accept buys NO worker round', fp.state.calls, 0);
    check('(d) …and none is recorded', ev2.some((e) => e.type === 'worker-round'), false);
    check('(d) …the spend is exactly what the paused leg had already spent',
      ev2.find((e) => e.type === 'job-end')?.spentUsd, end1.spentUsd);
    check('(d) OPEN-3 — the mechanical stages RE-RAN before anything was minted',
      ev2.find((e) => e.type === 'close-precheck')?.stages?.map((s) => `${s.name}:${s.verdict}`),
      ['artifact-exists:satisfied', 'human-review:satisfied']);
    check('(d) FINDING — the terminal is `already-green`, NOT `green`', outcome, 'already-green');
    rmSync(dir, { recursive: true, force: true });
  }

  section('(d) OPEN-3 CONTROL — accept on a tree that changed during the pause');
  {
    const p = scriptedProvider([{ text: 'the fix worker writes nothing' }]);
    const { dir, spine } = fork('accept-stale');
    decide(dir, { decision: 'accept' });
    rmSync(join(dir, 'out', 'report.md'), { force: true }); // 45 days is long enough for a human to break it
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    const outcome = await runJob(spec, {
      approvals, workdir: dir, provider: p, emit: virtualSpine(spine, { t: resumeAtMs, stepMs: 500 }, evs.at(-1).seq), capRuns: 1,
      priorSpentUsd: d.restart.priorSpentUsd, priorSpendComplete: d.restart.priorSpendComplete,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeBranch: d.restart.branch,
    });
    const ev2 = readSpineFile(spine).slice(ev1.length);
    check('(d) OPEN-3 — a re-run that REDS does not mint green', ['green', 'already-green'].includes(outcome), false);
    check('(d) …the mechanical stage is what refused, on fresh evidence',
      ev2.find((e) => e.type === 'close-precheck')?.stage, 'artifact-exists');
    rmSync(dir, { recursive: true, force: true });
  }

  // ── (e) CANCEL ────────────────────────────────────────────────────────────
  section('(e) CANCEL — terminal, no gap, no continuation, no demotion');
  {
    const fp = forbiddenProvider();
    const { dir, spine } = fork('cancel');
    decide(dir, { decision: 'cancel' });
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    const outcome = await runJob(spec, {
      approvals, workdir: dir, provider: fp, emit: virtualSpine(spine, { t: resumeAtMs, stepMs: 500 }, evs.at(-1).seq),
      priorSpentUsd: d.restart.priorSpentUsd, priorSpendComplete: d.restart.priorSpendComplete,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeBranch: d.restart.branch,
    });
    const ev2 = readSpineFile(spine).slice(ev1.length);
    check('(e) cancel is its own terminal (SHIM 2)', outcome, 'hitl-cancel');
    check('(e) …no gap', ev2.find((e) => e.type === 'hitl-cancel')?.gap, null);
    check('(e) …no continuation: the fix loop never opened', ev2.some((e) => e.type === 'fix-loop'), false);
    check('(e) …and no worker round was bought', fp.state.calls, 0);
    check('(e) …a clean exit, spend exact', ev2.find((e) => e.type === 'job-end')?.spendComplete, true);
    rmSync(dir, { recursive: true, force: true });
  }
  // demotion is decided by src/bridges.js, on the outcome NAME — asked of the real reader
  {
    const proven = [
      { outcome: 'green', patient: 'p1' }, { outcome: 'green', patient: 'p2' },
    ];
    check('(e) two distinct-patient greens are PROVEN', deriveStatus(proven), 'proven');
    check('(e) …a cancel row does NOT demote it', deriveStatus([...proven, { outcome: 'hitl-cancel', patient: 'p3' }]), 'proven');
    check('(e) …nor does a pause row', deriveStatus([...proven, { outcome: 'hitl-pause', patient: 'p3' }]), 'proven');
    check('(e) …only the literal graded red demotes (the rule this rests on)', REUSE_GRADED_RED, ['escalated']);
    check('(e) …control: the graded red DOES demote', deriveStatus([...proven, { outcome: 'red', patient: 'p3' }]), 'candidate');
  }

  // ── NEGATIVE CONTROL ──────────────────────────────────────────────────────
  section('NEGATIVE CONTROL — `rerun` with the text dropped');
  {
    const p = scriptedProvider([
      { toolCalls: [tcall('n1', 'shell_write', { path: 'X', content: 'guess\n' })] },
      { text: 'guessing' },
    ]);
    const { dir, spine } = fork('empty');
    decide(dir, { decision: 'rerun', text: '', satisfiedWhen: '## Risks' });
    const evs = readSpineFile(spine);
    const d = readResume(evs, { direct: true, resumableOutcomes: RESUMABLE });
    await runJob(spec, {
      approvals, workdir: dir, provider: p, emit: virtualSpine(spine, { t: resumeAtMs, stepMs: 500 }, evs.at(-1).seq), capRuns: 1,
      priorSpentUsd: d.restart.priorSpentUsd, priorSpendComplete: d.restart.priorSpendComplete,
      priorWallMs: d.restart.priorWallMs, resumeSeed: d.restart.seed, resumeGrades: d.restart.grades,
      resumeBranch: d.restart.branch,
    });
    const ask = p.calls[0] ?? '';
    // What the machinery does TODAY, measured — this is the defect, stated as an observation
    check('TODAY: the fix worker IS launched on an empty human decision', p.calls.length > 0, true);
    check('TODAY: …and its ask carries no human content at all',
      ask.includes('(close exited 1, expected 0, with no output)'), true);
    check('TODAY: …so the run re-runs as though nothing had been said — THE DEFECT',
      ask.includes('HUMAN'), false);
    rmSync(dir, { recursive: true, force: true });

    // …and the refusal, at the seam that owns it: the DECISION GATE, before the leg
    // launches (scripts/run-u.mjs territory — a required `--decide`/`--text` pair, the
    // sibling of the existing `--approve <specHash>` gate). Not a library change.
    const decisionGate = (dec) => {
      if (!['accept', 'rerun', 'cancel'].includes(dec?.decision)) return { ok: false, why: 'not one of the three doors' };
      if (dec.decision === 'rerun' && !(typeof dec.text === 'string' && dec.text.trim().length > 0)) {
        return { ok: false, why: '--decide rerun needs --text: the human IS the gap author (ruling 3), and an empty gap is not a ruling the run can act on' };
      }
      return { ok: true, why: null };
    };
    check('GUARD: the decision gate REFUSES rerun with no text', decisionGate({ decision: 'rerun', text: '' }).ok, false);
    check('GUARD: …and refuses whitespace-only text', decisionGate({ decision: 'rerun', text: '   \n' }).ok, false);
    check('GUARD: …while a real ruling passes', decisionGate({ decision: 'rerun', text: HUMAN_TEXT }).ok, true);
    check('GUARD: …accept and cancel need no text', decisionGate({ decision: 'accept' }).ok && decisionGate({ decision: 'cancel' }).ok, true);
    check('GUARD: …and a fourth door is refused', decisionGate({ decision: 'maybe', text: 'hm' }).ok, false);
  }

  rmSync(wd1, { recursive: true, force: true });
  rmSync(spine1, { force: true });
}

try {
  await main();
} catch (e) {
  console.error(`\nPOC THREW: ${e?.stack ?? e}`);
  failed += 1;
} finally {
  rmSync(SHIM_DIR, { recursive: true, force: true });
}

console.log(`\n${failed === 0 ? 'ALL EXPECTATIONS MET' : `${failed} EXPECTATION(S) FAILED`}`);
process.exitCode = failed === 0 ? 0 : 1;
