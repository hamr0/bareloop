// U — the user-mode e2e. ONE run: one sentence of problem, a budget, a clock, one
// close. No arms, no operator-authored checks, no hand-solving, no retry logic —
// a run that dies comes back to hamr with the cause (standing rule, 2026-07-26).
//
// Acceptance (hamr, LAYERS §4): the workflow need not green everything — it must
// green ONE job end to end. That green GRADUATES the bridge: the plan the agent
// authored is preserved from the spine as a reusable artifact, and the next run of
// this shape reuses and fine-tunes it rather than starting cold.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { SECRET_PATTERNS } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// U targets. Each entry is a PATIENT + its frozen seed + the spec that names its close;
// everything else the runner reads from the spec itself. `--job` selects one; the default
// is the first target so run 1/run 3's invocation is unchanged.
const JOBS = {
  'aurora-spawner': {
    spec: 'aurora-u-spawner-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/aurora-u',
    spine: 'aurora-u-bareloop',
    seed: 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18',
  },
  'litectx-types': {
    spec: 'litectx-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/litectx-u',
    spine: 'litectx-u-bareloop',
    seed: '96813a43bbcbac6a808ff610c6751a8736e2903e',
  },
};
const CLOSE_TIMEOUT_MS = 900_000; // the slowest close stage is the suite (~23s aurora, ~53s litectx); headroom, not a budget
const CAP_RUNS = 4;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
// --model picks the DEFAULT worker tier (runner territory — the spec names no model, so
// the signed hash is unaffected). Tier names, not model ids: the same closed menu the
// planner's per-step `model` field uses. haiku takes no output_config.effort
// (provider-gated, battery rule) — nothing to gate yet since neither tier sets effort.
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };
const tierArg = arg('model') ?? 'sonnet';
const MODEL = DEFAULT_TIER_MODELS[/** @type {keyof typeof DEFAULT_TIER_MODELS} */ (tierArg)];
if (!MODEL) { console.error(`unknown --model "${tierArg}" — one of: ${Object.keys(DEFAULT_TIER_MODELS).join(', ')}`); process.exit(2); }
const jobKey = arg('job') ?? 'aurora-spawner';
const target = JOBS[/** @type {keyof typeof JOBS} */ (jobKey)];
if (!target) { console.error(`unknown --job "${jobKey}" — one of: ${Object.keys(JOBS).join(', ')}`); process.exit(2); }
const WORKDIR = target.workdir;
const SEED = target.seed;
const spec = JSON.parse(readFileSync(new URL(`../jobs/${target.spec}`, import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);

if (arg('approve') !== specHash) {
  console.log('U — user-mode e2e, ONE run, REAL dollars');
  console.log(`  spec     jobs/${target.spec}  $${spec.budgetUsd}  wall ${spec.maxWallMs / 60000}min  capRuns=${CAP_RUNS}`);
  console.log(`  patient  ${WORKDIR} @ ${SEED.slice(0, 12)}`);
  console.log(`  goal     "${spec.goal}"`);
  console.log(`  hash     ${specHash}`);
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/run-u.mjs --job ${jobKey} --approve ${specHash}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }

const wd = resolve(WORKDIR);
const spineDir = join(wd, '..', target.spine);
mkdirSync(spineDir, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(spineDir, `u-${runid}.jsonl`);

const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
// the patient starts at the seed, every time — a run that inherits the previous
// run's edits is measuring the wrong thing
git(['reset', '--hard', SEED]);
git(['clean', '-fd']);
// COLD MEANS COLD (P design record): the isolate verbs (stash/remember) persist in
// .litectx across runs — an uncleaned store would leak run N's memory into run N+1's
// "cold" baseline and quietly poison every contrast (the reuse rung's OFF arm above
// all). The store is a derived, self-healing cache by litectx's own contract; the
// re-index it costs is ~65s under yield. When the reuse rung lands, KEEPING the
// store becomes an explicit ledger-attributed choice — never a leak.
rmSync(join(wd, '.litectx'), { recursive: true, force: true });
console.log(`patient reset — clean at ${git(['rev-parse', '--short', 'HEAD'])}, store cold`);

const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });
// P: the per-step model-tier factory. The TIER menu is signed in the plan schema
// (STEP_MODELS); the tier->model mapping is the RUNNER's territory, here. haiku
// takes no output_config.effort (provider-gated, battery rule) - nothing to gate
// yet since neither tier sets effort params.
const TIER_MODELS = DEFAULT_TIER_MODELS;
/** @type {Record<string, any>} */
const tierCache = {};
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] === MODEL ? provider : new AnthropicProvider({ apiKey, model: TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] }));

const started = Date.now();
console.log(`\n== U run ${runid} ==  $${spec.budgetUsd} · ${spec.maxWallMs / 60000}min · ${MODEL}`);

// F67 — the OUTSIDE watchdog, started before the run and sharing nothing with it.
// Every guard bareloop had lived inside this process, and ms3197n8/ms3jh76q proved
// that is exactly where they cannot help: 274min and 81.5min of total silence, the
// in-process fuse never running because whatever froze the run froze its timers
// too. This one is a separate process holding one file's mtime and a pid.
// `unref()` so it can never keep a finished run alive.
const watchdog = spawn(process.execPath, [
  new URL('./u-watchdog.mjs', import.meta.url).pathname,
  '--spine', spineFile,
  '--pid', String(process.pid),
  '--wall-ms', String(spec.maxWallMs),
], { stdio: ['ignore', 'ignore', 'inherit'] });
watchdog.unref();

// WHERE-was-the-freeze sampler. ms3jh76q froze its event loop for 81.5min and the
// spine could not say where — a frozen loop emits nothing, by construction. This
// timer is delayed exactly as long as any block; when it finally fires it records
// how late it ran, which brackets the freeze in time. Diagnostic sidecar only:
// nothing in the run reads it, and it decides nothing (the arbiter is untouched).
// Coverage split with the watchdog: blocks that END show up here; a block long
// enough for the watchdog's stale kill dies mid-freeze and is localized by the
// marker + the last spine event instead. Both windows are covered, by different
// instruments.
const LAG_POLL_MS = 1_000;
const LAG_RECORD_MS = 3_000; // healthy gaps measured in ms; litectx's sync index blocked ~18s
const lagFile = `${spineFile}.lag.jsonl`;
let lagDue = Date.now() + LAG_POLL_MS;
const lagTimer = setInterval(() => {
  const now = Date.now();
  const blockedMs = now - lagDue;
  if (blockedMs >= LAG_RECORD_MS) {
    const rec = { blockedMs, from: new Date(now - blockedMs).toISOString(), until: new Date(now).toISOString() };
    try { appendFileSync(lagFile, `${JSON.stringify(rec)}\n`); } catch { /* best-effort — a diagnostic must never kill the run */ }
  }
  lagDue = now + LAG_POLL_MS;
}, LAG_POLL_MS);

let outcome;
try {
  outcome = await runJob(spec, {
    approvals, workdir: wd, provider, providerFor, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });
} finally {
  // the guard outlives the run only by accident, never by design
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
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
// F67: if the outside guard fired, say so HERE rather than leaving the reader to
// reconcile a truncated run against a file they don't know exists. (A kill it
// completed leaves no readout at all — the marker beside the spine IS the record.)
if (existsSync(`${spineFile}.watchdog.json`)) {
  const m = JSON.parse(readFileSync(`${spineFile}.watchdog.json`, 'utf8'));
  console.log(`\nWATCHDOG   fired: ${m.reason} — the run was stopped from OUTSIDE, not by its own governance`);
}
// event-loop freezes the run survived — the sampler's record of WHERE the loop was blocked
if (existsSync(lagFile)) {
  const lags = readFileSync(lagFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const worst = lags.reduce((a, b) => (b.blockedMs > a.blockedMs ? b : a));
  console.log(`\nLOOP FROZE ${lags.length}x — worst ${(worst.blockedMs / 1000).toFixed(1)}s, ${worst.from} → ${worst.until} (${lagFile})`);
}
console.log(`\nspine     ${spineFile}`);
console.log(`patient   left AS THE RUN LEFT IT (read it before the next run resets to the seed)`);
