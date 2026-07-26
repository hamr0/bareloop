// U — the user-mode e2e. ONE run: one sentence of problem, a budget, a clock, one
// close. No arms, no operator-authored checks, no hand-solving, no retry logic —
// a run that dies comes back to hamr with the cause (standing rule, 2026-07-26).
//
// Acceptance (hamr, LAYERS §4): the workflow need not green everything — it must
// green ONE job end to end. That green GRADUATES the bridge: the plan the agent
// authored is preserved from the spine as a reusable artifact, and the next run of
// this shape reuses and fine-tunes it rather than starting cold.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u';
const SEED = 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18';
const MODEL = 'claude-sonnet-5';
const CLOSE_TIMEOUT_MS = 900_000; // the suite is ~23s; this is headroom, not a budget
const CAP_RUNS = 4;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-u-spawner-types.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);

if (arg('approve') !== specHash) {
  console.log('U — user-mode e2e, ONE run, REAL dollars');
  console.log(`  spec     jobs/aurora-u-spawner-types.json  $${spec.budgetUsd}  wall ${spec.maxWallMs / 60000}min  capRuns=${CAP_RUNS}`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
  console.log(`  goal     "${spec.goal}"`);
  console.log(`  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-u.mjs --approve ${specHash}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', 'aurora-u-bareloop');
mkdirSync(spineDir, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(spineDir, `u-${runid}.jsonl`);

const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
// the patient starts at the seed, every time — a run that inherits the previous
// run's edits is measuring the wrong thing
git(['reset', '--hard', SEED]);
git(['clean', '-fd']);
console.log(`patient reset — clean at ${git(['rev-parse', '--short', 'HEAD'])}`);

const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });

const started = Date.now();
console.log(`\n== U run ${runid} ==  $${spec.budgetUsd} · ${spec.maxWallMs / 60000}min · ${MODEL}`);
const outcome = await runJob(spec, {
  approvals, workdir: wd, provider, emit: makeSpine(spineFile),
  shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
});
const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);

// ── the read. Facts only: what happened, what it cost, and whether the record is
// honest. No classification into pass/fail buckets — one run classifies nothing.
const raw = readFileSync(spineFile, 'utf8');
const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const je = events.findLast((e) => e.type === 'job-end');
const leaks = SECRET_PATTERNS.map((re) => new RegExp(re.source, `${re.flags.replace('g', '')}g`)).flatMap((re) => raw.match(re) ?? []);
// the ACCEPTED plan (a replan emits its own) — plan-validate carries verdicts, not the plan
const plan = events.findLast((e) => e.type === 'plan-accepted')?.plan ?? null;

const auditSrc = join(wd, 'gate-audit.jsonl');
let auditFile = null;
if (existsSync(auditSrc)) { auditFile = join(spineDir, `u-${runid}-gate-audit.jsonl`); renameSync(auditSrc, auditFile); }
const audit = auditFile ? readFileSync(auditFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const writes = audit.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit'));

console.log(`\noutcome   ${outcome}`);
console.log(`spent     ${je?.spentUsd == null ? 'UNKNOWN' : `${je.spendComplete === false ? '≥' : ''}$${je.spentUsd.toFixed(4)}`} of $${spec.budgetUsd}`);
console.log(`wall      ${elapsedMin}min of ${spec.maxWallMs / 60000}min`);
console.log(`rounds    ${events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length}`);
console.log(`writes    ${writes.length} allowed (${new Set(writes.map((e) => e.action?.path)).size} distinct files)`);
console.log(`plan      ${plan ? `${plan.steps?.length ?? '?'} steps` : 'none validated'}`);
console.log(`checks    ${events.filter((e) => e.type === 'check-run').length} runs · menu [${events.find((e) => e.type === 'check-menu')?.offered?.join(', ') ?? '-'}]`);
// the close as JUDGED FIRST, then whether the fix loop had to run. Printing only
// the last outer-close reads as "close red" next to "outcome green" — the record
// must not make the reader reconcile two numbers that mean different things.
const oc = events.findLast((e) => e.type === 'outer-close');
const fixed = events.some((e) => e.type === 'fix-loop');
console.log(`close     first judgment ${oc?.verdict ?? '-'}${oc?.stage ? ` (stage ${oc.stage})` : ''}${fixed ? ` → fix loop ran → ${outcome}` : ''}`);
console.log(`replan    ${events.some((e) => e.type === 'replan') ? 'YES' : 'no'}`);
for (const e of events.filter((x) => x.type === 'escalation')) console.log(`ESCALATION ${e.category}: ${(e.decision ?? '').slice(0, 160)}`);
if (leaks.length) console.log(`\nSPINE LEAK: ${leaks.length} secret-shaped strings — the hard line is broken`);

// the BRIDGE: on a green the agent's own plan is kept as the reusable artifact
if (outcome === 'green' && plan) {
  // one file PER GREEN, never one file per job: two cold runs of this job produced
  // two DIFFERENT plans that both green (run 1: 3 steps, run 3: 2 steps), so a
  // single `bridge-<job>.json` silently destroys the earlier bridge. WHICH bridge
  // gets offered for reuse is a selection question the reuse rung answers
  // (PRD v1.34 item 3) — the runner must not answer it by clobbering.
  const bridgeFile = join(spineDir, `bridge-${spec.job}-${runid}.json`);
  writeFileSync(bridgeFile, `${JSON.stringify({ job: spec.job, specHash, runid, greenAt: new Date().toISOString(), plan }, null, 2)}\n`);
  console.log(`\nBRIDGE saved — ${bridgeFile}`);
  console.log('  the next run of this shape reuses this plan instead of starting cold');
}
console.log(`\nspine     ${spineFile}`);
console.log(`patient   left AS THE RUN LEFT IT (read it before the next run resets to the seed)`);
