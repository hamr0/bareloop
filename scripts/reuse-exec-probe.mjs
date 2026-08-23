// REUSE EXECUTION probe — the second instrument (design record D9), the one the
// draft-tier pre-probe explicitly CANNOT be: it runs the job.
//
// Prereg: docs/03-logs/experiments/REUSE-PREPROBE-PREREG.md — §8 states plainly that the
// draft probe reads drafts and nothing else ("whether a reused plan greens, self-heals,
// costs less end-to-end, or fails at a stage is entirely outside it. That is the second
// instrument (D9), fired only if the drafts differ, and only on hamr's word"). The
// POST-FIRE addendum fired discard rule 1 (readable lineage DEAD) and re-anchored
// discard rule 3 (the MECHANICAL path lives) — so this probe carries the mechanical
// arm, arm C, into execution, and nothing else.
//
// WHAT THIS IS: ONE full real run of `jobs/litectx-u-types.json` through the SHIPPED
// flow — the same `runJob` `scripts/run-u.mjs` drives for its `litectx-types` target,
// with the same approval gate, the same outside watchdog, the same spine capture, the
// same wall (the spec's own `maxWallMs`; nothing here invents one) — with EXACTLY ONE
// difference:
//
//     the plan drafter's prompt gets arm C's mechanical-start block appended,
//     handing the aurora bridge plan over as the STARTING DRAFT to tweak.
//
// Steps, check loops, the close, the fix loop, a replan if one fires: all of it is the
// real shipped `runPlan`, executed for real, at real cost. The wrapper forwards every
// other provider call byte-untouched.
//
// n=1. That is not an oversight and it is not fixable by this script: a full run is a
// ~$2–3, ~10–90 minute instrument, and the frozen rules say so — primary read is
// green-within-envelope, every secondary read is recorded WITH its n=1 qualifier, a
// provider-red is a CASUALTY (one relaunch, then stop), and a wall/cap halt is not a
// failure to explain away — the stop IS the result.
//
// ── WHAT THIS PROBE DOES NOT DO ───────────────────────────────────────────────
// It NEVER writes a bridge, on a green or on anything else. `run-u.mjs` mints one
// (run-u.mjs:255-273) and this script deliberately does NOT copy that block: minting is
// the reuse MACHINERY's job under R1 (green graduates a bridge to CANDIDATE; a failing
// bridge is DEMOTED, not defended), and a probe that mints would be writing the very
// artifact whose value it is measuring. It asserts at exit that no `bridge-*.json`
// anywhere under the patients directory changed while it ran.
//
// ── DEVIATIONS from run-u.mjs, named rather than papered over ─────────────────
//  1. run-u RESETS the patient (`git reset --hard SEED && git clean -fd`). This probe
//     REFUSES instead and prints the command — the reuse-preprobe precedent: the reset
//     is operator-performed, never harness-performed, so a half-solved tree is a stop
//     the operator sees rather than a state the harness silently erases.
//  2. It DOES remove a leftover `.litectx` store (run-u's cold-means-cold convention).
//     That store is a derived, git-ignored, self-healing cache — removing it changes no
//     tracked byte — and the cold baselines this run is read beside were cold runs.
//     Skipped entirely in --dry-run.
//  3. No `--model` knob. The probe is ONE configuration: the sonnet drafter/default tier
//     (PRD v1.36 floor), the same tier run-u defaults to.
//  4. No auto-relaunch on a casualty. The frozen rule allows ONE relaunch after a
//     provider-red; this script prints the exact relaunch command and stops, because a
//     user-mode run that dies comes back to hamr (standing rule, 2026-07-26) and a
//     harness that re-fires a real-dollar run on its own spends money nobody watched.
//
//   node scripts/reuse-exec-probe.mjs --dry-run     # $0 plumbing check, DRY output only
//   node scripts/reuse-exec-probe.mjs               # prints the approval line, spends nothing
//   ANTHROPIC_API_KEY=... node scripts/reuse-exec-probe.mjs --approve <specHash>
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { runJob } from '../src/run.js';
import { planPrompt } from '../src/planrun.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { scanSecrets } from '../src/validate.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// ── frozen parameters ────────────────────────────────────────────────────────
/** the target job — run-u.mjs's `litectx-types` entry (run-u.mjs:32-37), copied with this
 * pointer rather than imported: run-u.mjs is an executable runner and importing it fires a
 * paid run. */
const SPEC_FILE = 'litectx-u-types.json';
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-u';
const SPINE_DIRNAME = 'litectx-u-bareloop';
const SEED = '96813a43bbcbac6a808ff610c6751a8736e2903e';
/** the patients ROOT — every `bridge-*.json` under it is snapshotted and asserted unchanged */
const PATIENTS_DIR = '/home/hamr/PycharmProjects/bareloop-patients';
/** prereg §2's source bridge: the newest aurora green — a DIFFERENT patient, same shape */
const BRIDGE_FILE = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop/bridge-aurora-u-spawner-types-ms7flkok.json';
/** run-u.mjs's own numbers, so "identical to a U run" is literal */
const CLOSE_TIMEOUT_MS = 900_000;
const CAP_RUNS = 4;
/** the sonnet tier, spelled as run-u spells it. One configuration, no --model knob. */
const MODEL = 'claude-sonnet-5';
const TIER_MODELS = { sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5-20251001' };
/** RECORDED FACTS, not re-measured here: the two cold litectx/aurora U greens this run is
 * read beside. run 1 = $2.21 / 8.9min, run 3 = $2.47 (wall not recorded in the same form).
 * They are aurora-u-spawner-types runs — the SAME SHAPE, a DIFFERENT patient — which is
 * exactly why they are a loose envelope and never a control. */
const COLD_BASELINES = {
  source: 'recorded facts from the U runs (2026-07-27 episode; PRD v1.34) — NOT re-measured by this probe',
  patient: 'aurora-u (same job SHAPE, different patient) — a loose envelope, never a control',
  runs: [
    { label: 'U run 1 (cold)', costUsd: 2.21, wallMin: 8.9 },
    { label: 'U run 3 (cold)', costUsd: 2.47, wallMin: null },
  ],
};
/** the qualifier stamped on every comparative field in the results file */
const N1 = 'n1-anecdote — one run, against cold baselines drawn from a DIFFERENT patient of the same shape; this number classifies nothing on its own';

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (/** @type {string} */ n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : (argv[i + 1] ?? ''); };
const DRY = argv.includes('--dry-run');

const spec = JSON.parse(readFileSync(new URL(`../jobs/${SPEC_FILE}`, import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const bridge = JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
const bridgePlanText = JSON.stringify(bridge.plan, null, 2);
const runid = Date.now().toString(36);
// never the real results path in DRY (`scratch-*` is gitignored): a DRY row must never be
// mistaken for evidence, and the surest way is for it not to live where evidence lives
const OUT = DRY
  ? new URL(`../scratch-reuse-exec-probe-dry-${runid}.json`, import.meta.url)
  : new URL(`../docs/03-logs/experiments/reuse-exec-probe-${runid}.json`, import.meta.url);

// `maxWallMs` is OPTIONAL in job-v1 with NO DEFAULT, and inventing one here would be a
// silent second ceiling (src/clock.js, F45). The spec governs; the runner only NAMES the
// unbounded state and omits the watchdog flag rather than handing it "undefined".
const WALL_MS = typeof spec.maxWallMs === 'number' && Number.isFinite(spec.maxWallMs) ? spec.maxWallMs : null;
const WALL_LABEL = WALL_MS === null ? 'UNBOUNDED (spec sets no maxWallMs — deliberate operator choice; no outside deadline)' : `${WALL_MS / 60000}min`;

// ── the injection ────────────────────────────────────────────────────────────
// Arm C's framing, VERBATIM from scripts/reuse-preprobe.mjs (its ARM_FRAME.C). Copied
// byte-for-byte on purpose: the draft-tier read that authorised this probe was measured
// against this exact text, and a reworded block would make the execution run a different
// arm than the one that passed the gate.
const C_BLOCK = `

YOUR STARTING DRAFT — begin from the plan below and tweak it.
This plan greened a same-shape job (the same four close stages) on a DIFFERENT repository. Take it
as your starting draft rather than starting from a blank page: keep what carries over, change what
this repository needs. Everything you submit must be legal for THIS job as described above — its
paths, scopes, verbs, bounds and check names. Output the finished plan as the single JSON object
required above, and nothing else.

${bridgePlanText}`;

/** The drafter's prompt opens with this word (src/planrun.js planPrompt) — the ONLY thing
 * the wrapper keys on. A harness that infers "where am I" by counting calls silently
 * retargets the moment the number of calls changes (standing rule). */
const DRAFT_PREFIX = 'DRAFT-PLAN';
/** planPrompt appends this line, and ONLY when `failure` is set — which is only ever the
 * REPLAN path (`obtainPlan('replan', failure, progress)`, src/planrun.js). It is the
 * prompt's own content, not a counter, and it is what tells a replan draft apart from the
 * first draft. */
const REPLAN_MARKER = 'What happened when the previous plan ran:';
/** planPrompt appends this when a draft was REJECTED by the validator and is being
 * redrafted inside the SAME draft phase. */
const REDRAFT_MARKER = 'Your previous plan was REJECTED with these reds';

/** @type {{phase: string, promptChars: number, injectedChars: number|null, at: string}[]} */
const injectionLog = [];

/**
 * Wrap a provider so the plan drafter's call — and ONLY it — carries arm C's block.
 *
 * Three behaviours, decided from the prompt's own text:
 *  - a DRAFT-PLAN prompt carrying the REPLAN marker → forwarded UNTOUCHED and logged. A
 *    replan drafts from the RUN's own state (what failed, what is left), not from the
 *    bridge again; re-handing the bridge there would be a second, unmeasured arm.
 *  - any other DRAFT-PLAN prompt (the first draft, and a validator-rejected REDRAFT of it)
 *    → the block is appended. The redraft is part of the same draft phase and the arm must
 *    hold across it, or a single validator red would silently convert the run to arm A.
 *    Consequence, stated: on a redraft the block lands AFTER planPrompt's own "fix every
 *    red" instruction. That ordering is not ideal and is recorded in the results file; it
 *    is preferred to the alternative (surgery on the shipped prompt's interior).
 *  - everything else (scout, worker, fix worker) → byte-identical passthrough.
 *
 * The caller's `messages` array and its message objects are never mutated: the wrapper
 * builds a copy, so what the run holds is unchanged by having been read.
 * @param {any} base the provider to wrap
 * @param {string} tag which binding this is (for the log)
 */
function injecting(base, tag) {
  return {
    name: `${base.name ?? 'provider'}+reuse-exec-C`,
    model: base.model,
    /** @type {(m: any[], t?: any[], o?: any) => Promise<any>} */
    async generate(messages, tools = [], options = {}) {
      const idx = messages.findIndex((/** @type {any} */ m) => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(DRAFT_PREFIX));
      if (idx === -1) return base.generate(messages, tools, options);
      const content = /** @type {string} */ (messages[idx].content);
      const isReplan = content.includes(REPLAN_MARKER);
      const phase = isReplan
        ? (content.includes(REDRAFT_MARKER) ? 'replan-redraft' : 'replan')
        : (content.includes(REDRAFT_MARKER) ? 'redraft' : 'draft');
      if (isReplan) {
        injectionLog.push({ phase, promptChars: content.length, injectedChars: null, at: new Date().toISOString() });
        console.log(`  INJECT   ${phase} (${tag}) — PASSED THROUGH UNTOUCHED (a replan drafts from the run's own state, not the bridge)`);
        return base.generate(messages, tools, options);
      }
      const next = messages.slice();
      next[idx] = { ...messages[idx], content: content + C_BLOCK };
      injectionLog.push({ phase, promptChars: content.length + C_BLOCK.length, injectedChars: C_BLOCK.length, at: new Date().toISOString() });
      console.log(`  INJECT   ${phase} (${tag}) — +${C_BLOCK.length} chars of arm-C mechanical start (prompt now ${content.length + C_BLOCK.length} chars)`);
      return base.generate(next, tools, options);
    },
  };
}

// ── bridge non-mutation guard ────────────────────────────────────────────────
/** every `bridge-*.json` under the patients dir, content-hashed. R1: minting belongs to
 * the machinery; a probe that touches one is measuring its own footprint. */
function bridgeSnapshot() {
  /** @type {Record<string, {bytes: number, sha256: string, mtimeMs: number}>} */
  const out = {};
  const walk = (/** @type {string} */ dir, /** @type {number} */ depth) => {
    if (depth > 3) return;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/^bridge-.*\.json$/.test(e.name)) {
        const buf = readFileSync(p);
        out[p] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), mtimeMs: statSync(p).mtimeMs };
      }
    }
  };
  walk(PATIENTS_DIR, 0);
  return out;
}
/** @param {Record<string, any>} before @param {Record<string, any>} after */
function bridgeDiff(before, after) {
  /** @type {string[]} */
  const changed = [];
  for (const p of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[p]; const b = after[p];
    if (!a) changed.push(`ADDED ${p}`);
    else if (!b) changed.push(`REMOVED ${p}`);
    else if (a.sha256 !== b.sha256) changed.push(`MODIFIED ${p}`);
  }
  return changed;
}

// ═════════════════════════════════════════════════════════════════════════════
// DRY — the plumbing check. $0, no runJob, no patient, no key.
// ═════════════════════════════════════════════════════════════════════════════
if (DRY) {
  // PLUMBING ONLY, and the limits are stated rather than glossed: this leg does NOT
  // execute runJob, the close, the steps, the watchdog or a single provider call. What it
  // DOES exercise is the part this script owns — the injection wrapper, against prompts
  // built by the SHIPPED `planPrompt` (the real instrument, not a canned string), plus the
  // bridge guard, the results assembly and the writer.
  console.log('REUSE execution probe — DRY (plumbing only, $0, nothing here is evidence)');
  /** @type {string[]} */
  const failures = [];
  let checksRun = 0;
  const check = (/** @type {string} */ what, /** @type {boolean} */ ok, /** @type {string} */ detail = '') => {
    checksRun += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(what);
  };

  const watchdogPath = fileURLToPath(new URL('./u-watchdog.mjs', import.meta.url));
  check('u-watchdog.mjs resolves', existsSync(watchdogPath), watchdogPath);
  check('bridge loaded', Array.isArray(bridge.plan?.steps) && bridge.plan.steps.length > 0, `${bridge.plan?.steps?.length} steps, greened ${bridge.greenAt}`);
  check('spec hash computed', typeof specHash === 'string' && specHash.length > 0, specHash);

  /** @type {any[]} */
  const seen = [];
  const stub = {
    name: 'dry-stub',
    model: 'DRY',
    /** @type {(m: any[], t?: any[], o?: any) => Promise<any>} */
    async generate(messages) {
      seen.push(messages);
      return { text: '{"schema":"plan-v1","steps":[]}', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn', model: 'DRY', costUsd: 0 };
    },
  };
  const wrapped = injecting(stub, 'dry');
  const scopes = undefined; // planPrompt derives the offered menu from the signed fence
  const materials = { balanceUsd: spec.budgetUsd, remainingMs: spec.maxWallMs ?? null };
  const firstContent = (/** @type {any[]} */ ms) => ms.find((m) => m.role === 'user')?.content ?? '';

  // 1. the FIRST draft — the real shipped prompt, injected
  const draft = planPrompt(spec, '(dry scout blob)', null, 40, null, scopes, materials);
  check('shipped draft prompt starts with DRAFT-PLAN', draft.startsWith(DRAFT_PREFIX));
  await wrapped.generate([{ role: 'user', content: draft }]);
  const gotDraft = firstContent(seen.at(-1));
  check('draft: block appended', gotDraft.length === draft.length + C_BLOCK.length, `${draft.length} → ${gotDraft.length} chars`);
  check('draft: bridge plan present', gotDraft.includes(bridgePlanText));
  check('draft: original prompt intact as a prefix', gotDraft.startsWith(draft));

  // 2. a REDRAFT (validator reds) — same draft phase, arm holds
  const redraft = planPrompt(spec, '(dry scout blob)', [{ code: 'invalid-value', path: 'steps[0].scope' }], 40, null, scopes, materials);
  check('shipped redraft prompt carries the reds marker', redraft.includes(REDRAFT_MARKER));
  await wrapped.generate([{ role: 'user', content: redraft }]);
  check('redraft: block appended', firstContent(seen.at(-1)).length === redraft.length + C_BLOCK.length);

  // 3. a REPLAN draft — untouched
  const replan = planPrompt(spec, '(dry scout blob)', null, 40, 'Step "x" did not reach its exits.', scopes, { ...materials, progress: 'step 1 of 2 did not finish' });
  check('shipped replan prompt carries the replan marker', replan.includes(REPLAN_MARKER));
  await wrapped.generate([{ role: 'user', content: replan }]);
  check('replan: forwarded UNTOUCHED', firstContent(seen.at(-1)) === replan, `${replan.length} chars in, ${firstContent(seen.at(-1)).length} out`);

  // 4. a worker call — byte-identical passthrough
  const worker = 'Repository root (absolute): /tmp/x\nFix the types.';
  await wrapped.generate([{ role: 'user', content: worker }]);
  check('worker call: byte-identical passthrough', firstContent(seen.at(-1)) === worker);

  // 5. the caller's own messages were never mutated
  check('caller messages not mutated', draft === planPrompt(spec, '(dry scout blob)', null, 40, null, scopes, materials));
  check('injection log classified the 3 draft-class calls, in order', injectionLog.length === 3 && injectionLog.map((l) => l.phase).join(',') === 'draft,redraft,replan', injectionLog.map((l) => l.phase).join(','));

  // 6. the bridge guard, on the real tree
  const before = bridgeSnapshot();
  const after = bridgeSnapshot();
  check('bridge guard sees the real bridges', Object.keys(before).length > 0, `${Object.keys(before).length} bridge files`);
  check('bridge guard reports no change', bridgeDiff(before, after).length === 0);
  // and that it CAN report one (a guard that cannot fire is prose, not protection)
  const tampered = { ...before, [Object.keys(before)[0]]: { ...before[Object.keys(before)[0]], sha256: 'deadbeef' } };
  check('bridge guard CAN fire (negative control)', bridgeDiff(before, tampered).length === 1);

  const dryResults = {
    probe: 'reuse-exec-probe',
    dry: true,
    DRY_NOTICE: 'PLUMBING ONLY. No provider call, no runJob, no close, no step, no watchdog. Every field here came from a scripted stub. It is not evidence of anything and must never be read as a result.',
    dryExercised: ['injection wrapper vs the shipped planPrompt (draft / redraft / replan / worker)', 'no-mutation of caller messages', 'bridge snapshot + diff, with a negative control', 'results assembly and write'],
    dryNotExercised: ['runJob and the whole shipped plan flow', 'the close, the checks, the steps, the fix loop', 'the outside watchdog process', 'any real provider call, any real dollar'],
    runid,
    checks: { total: checksRun, failed: failures },
    injectionLog,
    injectedBlockChars: C_BLOCK.length,
    coldBaselines: COLD_BASELINES,
  };
  writeFileSync(OUT, `${JSON.stringify(dryResults, null, 2)}\n`);
  console.log(`\nwrote    ${fileURLToPath(OUT)}`);
  console.log(`DRY      ${failures.length ? `${failures.length} FAILED` : 'all checks passed'} — plumbing only; the shipped run leg was NOT exercised.`);
  process.exit(failures.length ? 1 : 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// REAL — one full run, real dollars.
// ═════════════════════════════════════════════════════════════════════════════
const wd = resolve(WORKDIR);
const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
const patientPresent = existsSync(wd);
const patientHead = patientPresent ? git(['rev-parse', 'HEAD']) : '';
const patientDirty = patientPresent ? git(['status', '--porcelain']) : '';
const atSeed = patientHead === SEED && patientDirty === '';
const SEED_HINT = `  the patient must be clean at its frozen seed (the reset is the OPERATOR's, never this harness's):\n    git -C ${wd} reset --hard ${SEED} && git -C ${wd} clean -fd`;

console.log('REUSE execution probe — ONE full run, REAL dollars, n=1');
console.log(`  prereg   docs/03-logs/experiments/REUSE-PREPROBE-PREREG.md (§8 + POST-FIRE addendum: this is D9, the second instrument)`);
console.log(`  spec     jobs/${SPEC_FILE}  $${spec.budgetUsd}  wall ${WALL_LABEL}  capRuns=${CAP_RUNS}  model ${MODEL}`);
console.log(`  patient  ${wd} @ ${(patientHead || '(missing)').slice(0, 12)}${patientPresent ? (atSeed ? ' clean at seed' : ' NOT AT SEED') : ''}`);
console.log(`  goal     "${spec.goal}"`);
console.log(`  arm      C (mechanical start) — the drafter's prompt gets +${C_BLOCK.length} chars: the ${bridge.plan.steps.length}-step aurora bridge as the starting draft`);
console.log(`  bridge   ${BRIDGE_FILE.split('/').pop()} (greened ${bridge.greenAt}) — READ ONLY; this probe never mints or edits a bridge (R1)`);
console.log(`  hash     ${specHash}`);

if (arg('approve') !== specHash) {
  if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
  console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/reuse-exec-probe.mjs --approve ${specHash}`);
  if (!atSeed) console.log(`\nNOTE: the patient is NOT clean at seed, and the probe will refuse until it is.\n${SEED_HINT}`);
  process.exit(arg('approve') === null ? 0 : 1);
}
if (!patientPresent) { console.error(`\nREFUSED: patient not found: ${wd}`); process.exit(2); }
if (!atSeed) { console.error(`\nREFUSED: patient is not clean at seed ${SEED.slice(0, 12)}.\n${SEED_HINT}`); process.exit(2); }
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)'); process.exit(2); }

const spineDir = join(wd, '..', SPINE_DIRNAME);
mkdirSync(spineDir, { recursive: true });
const spineFile = join(spineDir, `reuse-exec-${runid}.jsonl`);

// COLD MEANS COLD (P design record, run-u.mjs:100-106): the isolate verbs persist in
// `.litectx` across runs, and the cold baselines this run is read beside were cold. The
// store is derived, git-ignored and self-healing — removing it changes no tracked byte,
// which is why it is the ONE write this harness performs on the patient (the git reset is
// not, deliberately: see deviation 1 in the header).
rmSync(join(wd, '.litectx'), { recursive: true, force: true });
console.log(`\npatient  clean at ${git(['rev-parse', '--short', 'HEAD'])}, .litectx store removed (cold)`);

const bridgesBefore = bridgeSnapshot();
console.log(`bridges  ${Object.keys(bridgesBefore).length} file(s) hashed under ${PATIENTS_DIR} — asserted unchanged at exit`);

const approvals = [{ specHash, signer: process.env.USER ?? 'human', ts: new Date().toISOString() }];
const baseProvider = new AnthropicProvider({ apiKey, model: MODEL });
const provider = injecting(baseProvider, 'default');
/** @type {Record<string, any>} */
const tierCache = {};
// P's per-step tier factory, mirrored from run-u — and wrapped too. The drafter runs on the
// default binding (mkWorker passes no workerProvider for the plan phase), so wrapping the
// tier factory changes nothing today; it is wrapped anyway because the wrapper identifies
// its target by the PROMPT, so an unwrapped binding is the one place a future drafter could
// slip through unmarked.
const providerFor = (/** @type {string} */ tier) => (tierCache[tier] ??= injecting(
  TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] === MODEL ? baseProvider : new AnthropicProvider({ apiKey, model: TIER_MODELS[/** @type {keyof typeof TIER_MODELS} */ (tier)] }),
  `tier:${tier}`,
));

const started = Date.now();
console.log(`\n== reuse-exec ${runid} ==  $${spec.budgetUsd} · ${WALL_LABEL} · ${MODEL}`);

// F67 — the OUTSIDE watchdog, wired exactly as run-u wires it (run-u.mjs:123-172): a
// separate process holding one file's mtime and a pid, with the stale window sized above
// the worst LEGAL spine silence (the staged close), and the wall grace equal to the
// deadline the run's own clock enforces. A real-dollar run gets the same babysitting a U
// run gets — this is not a cheaper class of run.
const closeStages = Array.isArray(spec.close) ? spec.close.length : 1;
const worstCloseSilenceMs = CLOSE_TIMEOUT_MS * closeStages;
const watchdog = spawn(process.execPath, [
  fileURLToPath(new URL('./u-watchdog.mjs', import.meta.url)),
  '--spine', spineFile,
  '--pid', String(process.pid),
  '--stale-ms', String(worstCloseSilenceMs + 600_000),
  ...(WALL_MS === null ? [] : ['--wall-ms', String(WALL_MS)]),
  '--grace-ms', String(worstCloseSilenceMs),
], { stdio: ['ignore', 'ignore', 'inherit'] });
watchdog.on('error', (e) => {
  console.error(`\nWATCHDOG FAILED TO START (${e.message}) — this run is UNGUARDED from outside: a frozen event loop will NOT be reaped (F67). The run continues under its own fuses, wall clock and money cap.`);
});
watchdog.unref();

// the WHERE-was-the-freeze sampler (run-u.mjs:174-195). Diagnostic sidecar only: nothing
// reads it and it decides nothing.
const LAG_POLL_MS = 1_000;
const LAG_RECORD_MS = 3_000;
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
let threw = null;
try {
  outcome = await runJob(spec, {
    approvals, workdir: wd, provider, providerFor, emit: makeSpine(spineFile),
    shellCapUsd: spec.budgetUsd, capRuns: CAP_RUNS, closeTimeoutMs: CLOSE_TIMEOUT_MS,
  });
} catch (e) {
  // a throw out of runJob is not an outcome — it is recorded as itself and the results
  // file is still written, because a run that cost money and left no record is the worst
  // of both
  threw = String(/** @type {any} */ (e)?.stack ?? e);
  outcome = 'threw';
  console.error(`\nrunJob THREW: ${/** @type {any} */ (e)?.message ?? e}`);
} finally {
  try { watchdog.kill('SIGKILL'); } catch { /* already gone */ }
  clearInterval(lagTimer);
}
const elapsedMs = Date.now() - started;
const elapsedMin = (elapsedMs / 60000).toFixed(1);

// ── the read. FACTS ONLY — no verdict language: the read against the frozen rules is the
// operator's, exactly as the pre-probe's harness left it.
const raw = existsSync(spineFile) ? readFileSync(spineFile, 'utf8') : '';
const events = raw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const je = events.findLast((e) => e.type === 'job-end');
// the ONE spelling of the text-side scan (src/validate.js) — a hand-rolled copy here would
// be the ninth, and one that misses a shape leaks on the very output it guards
const leaks = scanSecrets(raw);
const plan = events.findLast((e) => e.type === 'plan-accepted')?.plan ?? null;
const firstPlan = events.find((e) => e.type === 'plan-accepted')?.plan ?? null;

const auditSrc = join(wd, 'gate-audit.jsonl');
let auditFile = null;
if (existsSync(auditSrc)) { auditFile = join(spineDir, `reuse-exec-${runid}-gate-audit.jsonl`); renameSync(auditSrc, auditFile); }
const audit = auditFile ? readFileSync(auditFile, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const writes = audit.filter((e) => e.decision === 'allow' && (e.action?.type === 'write' || e.action?.type === 'edit'));

// per-stage cycles, read off the spine by walking it IN ORDER — never by counting calls.
// `close-verdict` is emitted by ralph inside BOTH loops (a step's exit evaluator and the
// outer close-fix loop), so the phase comes from the surrounding step-start/step-end and
// fix-loop markers rather than from the event alone.
/** @type {Record<string, Record<string, number>>} */
const stageCycles = {};
const bump = (/** @type {string} */ k, /** @type {string} */ v) => { (stageCycles[k] ??= {})[v] = ((stageCycles[k] ??= {})[v] ?? 0) + 1; };
let phase = 'pre';
for (const e of events) {
  if (e.type === 'step-start') phase = `step:${e.step ?? e.id ?? '?'}`;
  else if (e.type === 'step-end') phase = 'between-steps';
  else if (e.type === 'fix-loop') phase = 'fix-loop';
  else if (e.type === 'close-precheck') bump('close-precheck', `${e.verdict}${e.stage ? `@${e.stage}` : ''}`);
  else if (e.type === 'outer-close') bump('outer-close', `${e.verdict}${e.stage ? `@${e.stage}` : ''}`);
  else if (e.type === 'check-run') bump(`check:${e.name}${e.stage && e.stage !== e.name ? `/${e.stage}` : ''}`, String(e.verdict));
  else if (e.type === 'close-verdict') bump(`${phase}:close-verdict`, `${e.verdict}${e.stage ? `@${e.stage}` : ''}`);
  else if (e.type === 'exit-eval') bump(`${phase}:exit-eval`, (e.results ?? []).every((/** @type {any} */ r) => r?.ok) ? 'all-pass' : 'red');
}

const rounds = events.filter((e) => e.type === 'worker-round' && e.kind === 'turn').length;
const replanFired = events.some((e) => e.type === 'replan');
const spentUsd = je?.spentUsd ?? null;
const spendComplete = je?.spendComplete ?? null;
const OUTCOME_CLASS = {
  green: 'green', 'already-green': 'already-green',
  'provider-red': 'casualty', 'step-stalled': 'casualty',
  'cap-halt': 'halt', 'wall-halt': 'halt',
  'smoke-red': 'instrument-stop', 'job-red': 'instrument-stop', 'unapproved-spec': 'instrument-stop',
  'pricing-red': 'instrument-stop', 'close-unsupported': 'instrument-stop', 'interpreter-red': 'instrument-stop',
  'plan-red': 'red', 'check-red': 'red', 'close-red': 'red', escalated: 'red', threw: 'instrument-stop',
};
const outcomeClass = OUTCOME_CLASS[/** @type {keyof typeof OUTCOME_CLASS} */ (outcome)]
  ?? (String(outcome).startsWith('step-red:') ? 'red' : 'unclassified');

const results = {
  probe: 'reuse-exec-probe',
  dry: false,
  what: 'ONE full real run of jobs/litectx-u-types.json through the shipped runJob flow, identical to scripts/run-u.mjs\'s litectx-types target EXCEPT that the plan drafter\'s prompt carries arm C\'s mechanical-start block (the aurora bridge as the starting draft).',
  prereg: 'docs/03-logs/experiments/REUSE-PREPROBE-PREREG.md',
  designRecord: 'docs/product/2026-08-01-layer-3-reuse-design.md',
  runid,
  startedAt: new Date(started).toISOString(),
  model: MODEL,
  n: 1,
  qualifier: N1,
  // ── the primary read (frozen): green within the envelope. Facts, not a verdict.
  primaryRead: {
    outcome,
    outcomeClass,
    green: outcome === 'green',
    envelope: { budgetUsd: spec.budgetUsd, maxWallMs: WALL_MS },
    withinBudget: typeof spentUsd === 'number' ? spentUsd <= spec.budgetUsd : null,
    withinWall: WALL_MS === null ? null : elapsedMs <= WALL_MS,
    note: 'the read against the frozen rules is the operator\'s — this file states what happened, never what it means',
  },
  money: {
    spentUsd,
    spendComplete,
    honesty: spendComplete === false
      ? 'FLOOR, not a total (F6/F44): a round came back unpriced, or a call was abandoned/cut mid-flight and may already have been billed'
      : (spentUsd === null ? 'UNKNOWN — no job-end record carried a figure' : 'exact: every counted round was priced'),
    budgetUsd: spec.budgetUsd,
  },
  time: {
    wallMs: elapsedMs,
    wallMin: Number(elapsedMin),
    maxWallMs: WALL_MS,
    wallLabel: WALL_LABEL,
    accuracy: 'wall-clock around runJob, ~90% licensed accuracy (F6 extended to time) — never a rounded-to-zero unknown',
  },
  rounds,
  replan: {
    fired: replanFired,
    events: events.filter((e) => e.type === 'replan').map((e) => ({ step: e.step, reason: e.reason, trigger: e.trigger })),
    note: 'a replan draft is passed through the wrapper UNTOUCHED — it drafts from the run\'s own state, not from the bridge again',
  },
  stageCycles,
  injection: {
    arm: 'C — mechanical start (reuse-preprobe.mjs ARM_FRAME.C, verbatim)',
    blockChars: C_BLOCK.length,
    bridgeFile: BRIDGE_FILE,
    bridgeJob: bridge.job,
    bridgeRunid: bridge.runid,
    bridgeGreenAt: bridge.greenAt,
    bridgeSteps: bridge.plan.steps.length,
    log: injectionLog,
    identifiedBy: 'the prompt\'s own opening word (DRAFT-PLAN) plus planPrompt\'s replan/redraft markers — never a call count',
    redraftPolicy: 'a validator-rejected REDRAFT stays in arm C (the block is appended again), so one validator red cannot silently convert the run to arm A. Consequence: on a redraft the block lands AFTER planPrompt\'s own "fix every red" instruction.',
  },
  plan: {
    accepted: leaks.length ? null : plan,
    firstAccepted: leaks.length ? null : firstPlan,
    steps: plan?.steps?.length ?? null,
    omitted: leaks.length ? 'the spine tripped the secret scan — the drafted plan is NOT recorded here' : false,
  },
  writes: { allowed: writes.length, distinctFiles: new Set(writes.map((e) => e.action?.path)).size },
  coldBaselines: COLD_BASELINES,
  vsColdBaselines: {
    qualifier: N1,
    costDeltaUsd: typeof spentUsd === 'number' ? { vsRun1: Number((spentUsd - 2.21).toFixed(4)), vsRun3: Number((spentUsd - 2.47).toFixed(4)), qualifier: N1 } : null,
    wallDeltaMin: { vsRun1: Number((elapsedMs / 60000 - 8.9).toFixed(2)), vsRun3: null, qualifier: N1 },
    note: 'the baselines are aurora-u runs (different patient, same shape) and this is litectx-u — the two are not a matched pair, and neither the cost nor the wall delta is attributable to the injection on n=1',
  },
  escalations: events.filter((e) => e.type === 'escalation').map((e) => ({ category: e.category, decision: String(e.decision ?? '').slice(0, 400) })),
  spineLeakCount: leaks.length,
  artifacts: {
    spine: spineFile,
    gateAudit: auditFile,
    lag: existsSync(lagFile) ? lagFile : null,
    watchdogMarker: existsSync(`${spineFile}.watchdog.json`) ? `${spineFile}.watchdog.json` : null,
  },
  ...(threw ? { threw } : {}),
  bridgeGuard: { snapshotBefore: Object.keys(bridgesBefore).length, changed: /** @type {string[]} */ ([]) },
  notes: [
    'COLLECTION ONLY — no verdict language. The read against the prereg\'s frozen rules is the operator\'s.',
    'n=1: primary read is green-within-envelope; every comparative field carries an n1-anecdote qualifier.',
    'This probe NEVER writes a bridge, on a green or otherwise (R1: minting belongs to the reuse machinery; run-u.mjs mints, this deliberately does not). No bridge-*.json under the patients dir changed while it ran — asserted, not assumed.',
    'The patient reset is the OPERATOR\'s: this harness refuses on a non-seed tree rather than resetting it (the reuse-preprobe precedent). It DOES remove the derived, git-ignored .litectx store, for cold parity with the baselines.',
    'A provider-red is a CASUALTY, never evidence: one relaunch is allowed by the frozen rules, and the relaunch is the operator\'s — this harness never re-fires a real-dollar run on its own.',
    'A wall-halt or cap-halt is not a failure to explain away: the stop IS the result, and the run keeps the last verdict the arbiter minted.',
    'The only difference from a run-u litectx-types run is the drafter-prompt injection; every other provider call was forwarded byte-untouched.',
  ],
};

// ── the compact, honest summary ──────────────────────────────────────────────
console.log(`\noutcome   ${outcome}  (class ${outcomeClass})`);
console.log(`spent     ${spentUsd == null ? 'UNKNOWN' : `${spendComplete === false ? '≥' : ''}$${spentUsd.toFixed(4)}`} of $${spec.budgetUsd}${spendComplete === false ? '  (FLOOR — F6/F44, not a total)' : ''}`);
console.log(`wall      ${elapsedMin}min of ${WALL_LABEL}`);
console.log(`rounds    ${rounds}`);
console.log(`writes    ${writes.length} allowed (${new Set(writes.map((e) => e.action?.path)).size} distinct files)`);
console.log(`plan      ${plan ? `${plan.steps?.length ?? '?'} steps accepted` : 'none validated'}`);
console.log(`inject    ${injectionLog.filter((l) => l.injectedChars !== null).length} injected · ${injectionLog.filter((l) => l.injectedChars === null).length} passed through · +${C_BLOCK.length} chars/injection`);
console.log(`replan    ${replanFired ? 'YES' : 'no'}`);
const oc = events.findLast((e) => e.type === 'outer-close');
console.log(`close     first judgment ${oc?.verdict ?? '-'}${oc?.stage ? ` (stage ${oc.stage})` : ''}${events.some((e) => e.type === 'fix-loop') ? ` → fix loop ran → ${outcome}` : ''}`);
if (Object.keys(stageCycles).length) {
  console.log('cycles');
  for (const [k, v] of Object.entries(stageCycles)) console.log(`          ${k.padEnd(28)} ${Object.entries(v).map(([verdict, n]) => `${verdict}×${n}`).join(' · ')}`);
}
for (const e of results.escalations) console.log(`ESCALATION ${e.category}: ${e.decision.slice(0, 160)}`);
console.log(`\nbaselines COLD (recorded, not re-measured): $2.21 / 8.9min · $2.47 — aurora-u, different patient, same shape`);
console.log(`          every comparison off them is ${N1}`);

if (leaks.length) {
  console.log(`\nSPINE LEAK: ${leaks.length} secret-shaped strings in ${spineFile} — the hard line is broken; the drafted plan is NOT recorded in the results file`);
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
if (outcomeClass === 'casualty') {
  console.log(`\nCASUALTY  ${outcome} is a transport casualty, never evidence. The frozen rules allow ONE relaunch, and the relaunch is YOURS to fire:`);
  console.log(`  git -C ${wd} reset --hard ${SEED} && git -C ${wd} clean -fd`);
  console.log(`  ANTHROPIC_API_KEY=... node scripts/reuse-exec-probe.mjs --approve ${specHash}`);
  console.log('  after one relaunch, STOP — a second casualty is provider instability, not a readable row.');
}

// ── the bridge assertion. R1: this probe never mints and never edits a bridge; the
// guarantee is asserted, not claimed.
const changed = bridgeDiff(bridgesBefore, bridgeSnapshot());
results.bridgeGuard.changed = changed;
mkdirSync(dirname(fileURLToPath(OUT)), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);

console.log(`\nbridges   ${changed.length === 0 ? `${Object.keys(bridgesBefore).length} unchanged (asserted) — this probe mints nothing (R1)` : `CHANGED: ${changed.join(', ')}`}`);
if (changed.length) {
  console.error('BRIDGE MUTATION: a bridge file changed while this probe ran. This probe must never write one (R1).');
  process.exitCode = 4;
}
console.log(`spine     ${spineFile}`);
console.log(`wrote     ${fileURLToPath(OUT)}`);
console.log(`patient   left AS THE RUN LEFT IT (read it before anything resets it to the seed)`);
