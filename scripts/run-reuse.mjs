// REUSE — the first real caller of `runReuse` (Layer 3, design record
// docs/plans/2026-08-01-layer-3-reuse-design.md, D3/D6/D7 + R1).
//
// hamr's sentence, verbatim, is what this runner exists to execute:
//
//   *"part of reuse we ask user for cost/time and how many workflows to try before
//   starting new like $5 and 30 mins x2 then start anew if both red"*
//
// So the operator hands over three numbers — `--budget`, `--wall`, `--tries` — plus a
// registry to pick from, and the run does the rest under exactly those numbers. It is
// `run-u.mjs`'s conventions throughout: the approval gate on the spec HASH, the F67
// outside watchdog, the spine, the gate-audit relocation, the secrets scan, and a run
// that dies comes back to hamr rather than being re-fired by the harness.
//
// ── BEFORE YOU LAUNCH ────────────────────────────────────────────────────────
// Run it under a sleep inhibitor. A reuse run is up to (tries + 1) full jobs long, and
// F72 measured that a SUSPEND freezes every guard there is — the in-process fuses, the
// clock, and the outside watchdog alike (they are all in processes that stopped). No
// guard covers a laptop that slept, so the inhibitor is the operator's job and it is
// NOT shelled out to from here (a harness that grabs a system lock nobody asked for is
// the wrong side of the line):
//
//   systemd-inhibit --what=idle:sleep --why="bareloop reuse run" \
//     env ANTHROPIC_API_KEY=... node scripts/run-reuse.mjs --job litectx-types \
//     --registry ../bareloop-patients/bridges --budget 5 --wall 30 --tries 2 --approve <hash>
//
// ── THREE DELIBERATE DIFFERENCES FROM run-u.mjs, named rather than papered over ──
//  1. **The patient is NOT reset.** run-u does `git reset --hard SEED && git clean -fd`;
//     this runner REFUSES on a dirty tree and prints the command instead (the
//     reuse-preprobe/exec-probe precedent): the reset is operator-performed, so a
//     half-solved tree is a stop the operator sees rather than a state a harness erased.
//  2. **The approved hash covers ALL THREE envelope numbers.** The envelope tightens
//     `budgetUsd`/`maxWallMs`, which makes a new spec VERSION — and `--tries` multiplies
//     the whole thing, so the signed artifact is the per-try spec WRAPPED with the try
//     count (`resolveReuse` + `reuseSpecHash`). An envelope equal to the spec's own
//     numbers leaves the per-try spec hash-identical, but the approval hash is still its
//     own number: a hash signed before the count was folded in will not match, and
//     re-signing once is the whole migration (there is no legacy acceptance path).
//  3. **The gate audit is CUMULATIVE across tries.** Every try runs in the same workdir,
//     so one audit file holds them all; it is relocated once, at the end, beside the
//     spine. Said here because a reader counting writes must know they span tries.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { runReuse, validateEnvelope, resolveReuse, reuseSpecHash } from '../src/reuse.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets } from '../src/validate.js';
import { registryExists, loadRegistry } from '../src/bridges.js';
import { renderListing } from '../src/selection.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// run-u's own targets table — a PATIENT, its frozen seed, and the spec that names its
// close. Copied with this pointer rather than imported: run-u.mjs is an executable
// runner and importing it fires a paid run.
const JOBS = {
  'aurora-spawner': {
    spec: 'aurora-u-spawner-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/aurora-u',
    spine: 'aurora-u-bareloop',
    seed: 'd661e507c5cd0981368d90ed3e3abf6e2bb9ed18',
    patient: 'aurora-u',
  },
  'litectx-types': {
    spec: 'litectx-u-types.json',
    workdir: '/home/hamr/PycharmProjects/bareloop-patients/litectx-u',
    spine: 'litectx-u-bareloop',
    seed: '96813a43bbcbac6a808ff610c6751a8736e2903e',
    patient: 'litectx-u',
  },
};
const CLOSE_TIMEOUT_MS = 900_000; // run-u's number: headroom over the slowest stage, not a budget
const CAP_RUNS = 4;
const DEFAULT_TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };

const argv = process.argv.slice(2);
const arg = (/** @type {string} */ n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : (argv[i + 1] ?? ''); };
const num = (/** @type {string} */ n) => { const v = arg(n); if (v === null) return null; const x = Number(v); return Number.isFinite(x) ? x : NaN; };
const die = (/** @type {string} */ msg) => { console.error(msg); process.exit(2); };

const jobKey = arg('job') ?? 'litectx-types';
const target = JOBS[jobKey];
if (!target) die(`unknown --job "${jobKey}" — one of: ${Object.keys(JOBS).join(', ')}`);

const tierArg = arg('model') ?? 'sonnet';
const MODEL = DEFAULT_TIER_MODELS[tierArg];
if (!MODEL) die(`unknown --model "${tierArg}" — one of: ${Object.keys(DEFAULT_TIER_MODELS).join(', ')}`);

// ── the ENVELOPE: three operator numbers, none of them defaulted. A missing one is a
// refusal, not a guess — a cap the operator did not state is a cap nobody chose, and a
// defaulted cap is a silent second ceiling (the standing `maxWallMs` ruling).
const REGISTRY = arg('registry');
if (!REGISTRY) die('--registry <dir> is required — the bridge registry path is operator-supplied and is never conjured');
const budget = num('budget');
const wallMin = num('wall');
const tries = num('tries');
if (budget === null || Number.isNaN(budget)) die('--budget <usd> is required (the PER-TRY money cap) — no default, ever');
if (wallMin === null || Number.isNaN(wallMin)) die('--wall <minutes> is required (the PER-TRY wall-clock cap) — no default, ever');
if (tries === null || Number.isNaN(tries)) die('--tries <n> is required (how many stored workflows to try before drafting cold; 0 = force cold)');
const envelope = { perTryBudgetUsd: budget, perTryWallMs: Math.round(wallMin * 60_000), bridgeTries: tries };

const PIN = arg('pin');
const FORCE_COLD = argv.includes('--force-cold');
if (PIN && FORCE_COLD) die('--pin and --force-cold contradict each other — pick one');

const spec = JSON.parse(readFileSync(new URL(`../jobs/${target.spec}`, import.meta.url), 'utf8'));
const ev = validateEnvelope(envelope, { job: spec });
if (!ev.ok) {
  console.error('ENVELOPE REFUSED — it does not compose with the signed spec:');
  for (const r of ev.reds) console.error(`  ${r.code} ${r.path}${r.detail ? ` — ${r.detail}` : ''}`);
  console.error('\nThe envelope may only TIGHTEN the signed caps. Raising them is a spec edit, and the new hash needs re-approval.');
  process.exit(2);
}
// The hash the human signs is the hash that RUNS — and it covers ALL THREE envelope
// numbers, not two. The worst case a reuse run authorizes is
// `perTryBudgetUsd × (tries + 1)`, so a signature over the per-try spec alone (budget +
// wall) leaves the MULTIPLIER unsigned: `--tries 0` and `--tries 9` printed the same hash.
// `resolveReuse` wraps the per-try spec with the count and `reuseSpecHash` hashes them
// together. The per-try spec's OWN hash is still computed, because `runJob`'s inner gate
// reads that one — see the approvals mint below.
const resolved = resolveReuse(spec, ev.envelope);
const specHash = jobSpecHash(resolved.spec);
const approvalHash = reuseSpecHash(resolved);
const tightened = specHash !== jobSpecHash(spec);

const registryDir = resolve(REGISTRY);
if (!registryExists(registryDir)) die(`--registry ${registryDir} does not exist — create it (the path is operator-supplied and never conjured)`);

if (arg('approve') !== approvalHash) {
  const listing = loadRegistry(registryDir);
  console.log('REUSE — a stored workflow first, a cold draft last, REAL dollars');
  console.log(`  spec      jobs/${target.spec}${tightened ? '  (TIGHTENED by the envelope → a NEW spec version)' : '  (envelope equals the spec — hash unchanged)'}`);
  console.log(`  envelope  $${ev.envelope.perTryBudgetUsd}/try · ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min/try · ${ev.envelope.bridgeTries} workflow tr${ev.envelope.bridgeTries === 1 ? 'y' : 'ies'}, then cold`);
  // named, not rounded away: the envelope caps each TRY, and the selection calls sit
  // OUTSIDE those caps (they happen before a try starts, on the drafter tier). They are
  // small — one short prompt each — but "small" is not "zero", and a header that folded
  // them into the try cap would advertise a number the run does not enforce.
  console.log(`  worst     $${(ev.envelope.perTryBudgetUsd * (ev.envelope.bridgeTries + 1)).toFixed(2)} and ${((ev.envelope.perTryWallMs * (ev.envelope.bridgeTries + 1)) / 60000).toFixed(0)}min if every attempt runs to its cap`);
  console.log(`            PLUS up to ${ev.envelope.bridgeTries} selection call(s), which sit OUTSIDE the per-try caps and are metered and reported separately`);
  console.log(`  patient   ${target.workdir} @ ${target.seed.slice(0, 12)}`);
  console.log(`  registry  ${registryDir}`);
  console.log(`  selection ${FORCE_COLD ? 'FORCED COLD (no workflow offered)' : PIN ? `PINNED "${PIN}" (the model may refuse it only explicitly, with a reason)` : 'the model picks, or declares none matches'}`);
  console.log(`  goal      "${spec.goal}"`);
  console.log(`  hash      ${approvalHash}`);
  console.log(`            covers ALL THREE envelope numbers — the per-try spec (${specHash.slice(0, 12)}…: budget + wall) AND --tries ${ev.envelope.bridgeTries}, because tries is the spend MULTIPLIER`);
  console.log('');
  console.log(renderListing(listing));
  if (arg('approve') !== null) {
    console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version + envelope.`);
    // said plainly, because the scheme CHANGED: a hash signed before the try count was
    // folded in will not match, and neither will one signed for a different --tries.
    // That is correct — a signature that never covered the multiplier never covered the
    // run's worst case — and there is no legacy acceptance path. Re-sign once.
    console.error('The approval hash now includes --tries (it used to cover only the per-try budget and wall), so a hash signed under the old scheme — or for a different try count — will NOT match. Re-sign the hash printed above.');
  }
  console.log('\nLaunch under a sleep inhibitor — a suspend freezes every guard, including the outside watchdog (F72):');
  console.log(`  systemd-inhibit --what=idle:sleep --why="bareloop reuse" env ANTHROPIC_API_KEY=... \\
    node scripts/run-reuse.mjs --job ${jobKey} --registry ${REGISTRY} --budget ${budget} --wall ${wallMin} --tries ${tries}${PIN ? ` --pin ${PIN}` : ''}${FORCE_COLD ? ' --force-cold' : ''} --approve ${approvalHash}`);
  process.exit(arg('approve') === null ? 0 : 1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) die('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');

const wd = resolve(target.workdir);
const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
// the patient must START at the seed, and this runner REFUSES rather than resetting: a
// half-solved tree is a stop the operator sees, never a state the harness silently erased
const head = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain']);
if (head !== target.seed || dirty) {
  console.error(`PATIENT REFUSED — ${head !== target.seed ? `HEAD is ${head.slice(0, 12)}, not the frozen seed ${target.seed.slice(0, 12)}` : 'the tree has uncommitted changes'}.`);
  console.error('A run that inherits the previous run\'s edits measures the wrong thing. Reset it yourself:');
  console.error(`  git -C ${wd} reset --hard ${target.seed} && git -C ${wd} clean -fd && rm -rf ${join(wd, '.litectx')}`);
  process.exit(2);
}

const spineDir = join(wd, '..', target.spine);
mkdirSync(spineDir, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(spineDir, `reuse-${runid}.jsonl`);

// The record `runJob`'s OWN gate reads, which is the per-try spec's hash — minted here
// only because `--approve` just matched `approvalHash`, and that hash is a function of
// exactly this `specHash` plus the try count. So the operator's one signature ENTAILS
// this record; nothing is forged and no second decision is made. `runReuse` still hands
// `approvals` straight through and still has no way to mint one itself.
const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const provider = new AnthropicProvider({ apiKey, model: MODEL });
/** @type {Record<string, any>} */
const tierCache = {};
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= DEFAULT_TIER_MODELS[tier] === MODEL ? provider : new AnthropicProvider({ apiKey, model: DEFAULT_TIER_MODELS[tier] }));

const started = Date.now();
console.log(`\n== REUSE run ${runid} ==  $${ev.envelope.perTryBudgetUsd}/try · ${(ev.envelope.perTryWallMs / 60000).toFixed(0)}min/try · ${ev.envelope.bridgeTries} tries then cold · ${MODEL}`);

// F67 — the OUTSIDE watchdog. Same arithmetic as run-u, with ONE difference that matters:
// the run's wall is per TRY, and the process legitimately lives for (tries + 1) of them,
// so the outside deadline is the SUM. A watchdog holding one try's wall would reap a
// healthy run the moment it started its second attempt — the guard destroying the thing
// it guards (F70).
const closeStages = Array.isArray(spec.close) ? spec.close.length : 1;
const worstCloseSilenceMs = CLOSE_TIMEOUT_MS * closeStages;
const totalWallMs = ev.envelope.perTryWallMs * (ev.envelope.bridgeTries + 1);
const watchdog = spawn(process.execPath, [
  fileURLToPath(new URL('./u-watchdog.mjs', import.meta.url)),
  '--spine', spineFile,
  '--pid', String(process.pid),
  '--stale-ms', String(worstCloseSilenceMs + 600_000),
  '--wall-ms', String(totalWallMs),
  // the grace must cover a legal close per try, exactly as run-u's does per run
  '--grace-ms', String(worstCloseSilenceMs * (ev.envelope.bridgeTries + 1)),
], { stdio: ['ignore', 'ignore', 'inherit'] });
watchdog.on('error', (e) => {
  console.error(`\nWATCHDOG FAILED TO START (${e.message}) — this run is UNGUARDED from outside: a frozen event loop will NOT be reaped (F67). The run continues under its own fuses, wall clock and money cap.`);
});
watchdog.unref();

// the WHERE-was-the-freeze sampler (run-u's diagnostic sidecar; decides nothing)
const LAG_POLL_MS = 1_000;
const LAG_RECORD_MS = 3_000;
const lagFile = `${spineFile}.lag.jsonl`;
let lagDue = Date.now() + LAG_POLL_MS;
const lagTimer = setInterval(() => {
  const now = Date.now();
  const blockedMs = now - lagDue;
  if (blockedMs >= LAG_RECORD_MS) {
    try { appendFileSync(lagFile, `${JSON.stringify({ blockedMs, from: new Date(now - blockedMs).toISOString(), until: new Date(now).toISOString() })}\n`); } catch { /* a diagnostic must never kill the run */ }
  }
  lagDue = now + LAG_POLL_MS;
}, LAG_POLL_MS);

let result;
try {
  result = await runReuse({
    job: spec, approvals, registryDir, envelope: ev.envelope,
    patient: target.patient, workdir: wd, provider, providerFor,
    emit: makeSpine(spineFile), runid,
    capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
    ...(PIN ? { pinned: PIN } : {}),
    forceCold: FORCE_COLD,
  });
} finally {
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);

// ── the read. Facts only.
const raw = readFileSync(spineFile, 'utf8');
// the ONE spelling of the text-side scan — a hand-rolled copy here would be another one,
// and one that misses a shape leaks on the very output it guards
const leaks = scanSecrets(raw);

const auditSrc = join(wd, 'gate-audit.jsonl');
let auditFile = null;
if (existsSync(auditSrc)) { auditFile = join(spineDir, `reuse-${runid}-gate-audit.jsonl`); renameSync(auditSrc, auditFile); }

console.log(`\noutcome   ${result.outcome}`);
console.log(`spent     ${result.spentUsd == null ? 'UNKNOWN' : `${result.spendComplete ? '' : '≥'}$${result.spentUsd.toFixed(4)}`} (tries + selection calls) against $${(ev.envelope.perTryBudgetUsd * (ev.envelope.bridgeTries + 1)).toFixed(2)} of per-try caps`);
console.log(`wall      ${elapsedMin}min`);
console.log(`tries     ${result.triesUsed} workflow tr${result.triesUsed === 1 ? 'y' : 'ies'} of ${result.triesAuthorized} authorized${result.tries.some((t) => t.mode === 'cold') ? ', then a cold draft' : ''}`);
for (const s of result.selection) {
  console.log(`selection #${s.n} ${s.called ? '' : '(no call) '}→ ${s.choice ?? 'NONE MATCHES'}${s.refused ? ' [REFUSED THE PIN]' : ''}: ${s.reason}`);
}
for (const t of result.tries) {
  const money = t.spentUsd === null ? 'spend UNKNOWN' : `${t.spendComplete ? '' : '≥'}$${t.spentUsd.toFixed(4)}`;
  console.log(`try ${t.n}     ${t.mode}${t.bridge ? ` "${t.bridge}"` : ''} → ${t.runOutcome}${t.failingStage ? ` (stage ${t.failingStage})` : ''}`
    + `  ${money}/$${t.capUsd} · ${(t.wallMs / 60000).toFixed(1)}/${(t.wallCapMs / 60000).toFixed(0)}min · ${t.rounds} rounds · close ${t.closeReached ? 'reached' : 'NEVER REACHED'}`);
}
for (const w of result.bridgeWrites) console.log(`registry  ${w.action} ${w.name ?? '(unnamed)'}${w.file ? ` → ${w.file}` : ''}${w.reds?.length ? ` — REDS: ${w.reds.map((r) => r.code).join(', ')}` : ''}`);
if (result.decision) {
  console.log(`\nDECISION  ${result.decision}`);
  for (const o of result.options) console.log(`  - ${o}`);
  if (result.detail) console.log(result.detail.split('\n').map((l) => `  ${l}`).join('\n'));
}

// A leak is the HARD LINE broken. Count and PATH only, never the matched content.
if (leaks.length) {
  console.log(`\nSPINE LEAK: ${leaks.length} secret-shaped strings in ${spineFile} — the hard line is broken`);
  process.exitCode = 3;
}
if (existsSync(`${spineFile}.watchdog.json`)) {
  const m = JSON.parse(readFileSync(`${spineFile}.watchdog.json`, 'utf8'));
  console.log(`\nWATCHDOG   fired: ${m.reason} — the run was stopped from OUTSIDE, not by its own governance`);
}
if (existsSync(lagFile)) {
  const lags = readFileSync(lagFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const worst = lags.reduce((a, b) => (b.blockedMs > a.blockedMs ? b : a));
  console.log(`\nLOOP FROZE ${lags.length}x — worst ${(worst.blockedMs / 1000).toFixed(1)}s, ${worst.from} → ${worst.until} (${lagFile})`);
}
// the whole result beside the spine: the per-try rows are the decision-ready record, and
// a reader must not have to reconstruct them from stdout
writeFileSync(`${spineFile}.reuse.json`, `${JSON.stringify({ runid, jobKey, approvalHash, specHash, envelope: ev.envelope, result }, null, 2)}\n`);
console.log(`\nspine     ${spineFile}`);
if (auditFile) console.log(`audit     ${auditFile} (CUMULATIVE across every try — they share one workdir)`);
console.log(`patient   left AS THE RUN LEFT IT (read it before the next run resets to the seed)`);
