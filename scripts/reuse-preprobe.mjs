// REUSE pre-probe — the Layer 3 opening gate's COLLECTION harness (D9).
//
// Prereg: docs/02-experiments/REUSE-PREPROBE-PREREG.md (FROZEN 2026-08-01) — every
// rule below is that document's, not this script's. Design record:
// docs/plans/2026-08-01-layer-3-reuse-design.md (D2 mechanical gate, D4 bridge-as-draft,
// D8 scout stays ON, D9 this probe gates the build).
//
// The question: does having a same-shape bridge in hand change what gets DRAFTED at all?
// Three arms x n=3 drafts, one model call per sample, nothing executed.
//   A — cold: the spec only (today's behaviour, the control)
//   B — readable lineage: + the bridge plan as READING MATERIAL
//   C — mechanical start: the bridge plan handed as the STARTING DRAFT to tweak
//
// COLLECTION ONLY. This script computes and stores the frozen read axes and the
// verdict INPUTS; it prints no verdict language. Reading them against §5's discard
// rules is the operator's, per the prereg.
//
// ─────────────────────────────────────────────────────────────────────────────
// FIDELITY — what is the real instrument here, stated rather than assumed
// (the standing rule: a rule/check is validated only against its REAL instrument,
// never a fixture; the N3 pre-probe's forked prompt copy is the mistake not repeated):
//
// - The DRAFTER'S PROMPT is not built here at all. It is CAPTURED, byte-exact, off a
//   real `runPlan()` of `jobs/litectx-u-types.json` against the real patient: the
//   provider wrapper below records the `DRAFT-PLAN` prompt the shipped drafter actually
//   issues and then aborts the call before it spends. So arm A's prompt IS the shipped
//   prompt, carrying the real scout survey, the real `legalScopes` menu, the real check
//   menu derived from the close, and the real materials block. B and C append one block
//   each to that same captured string — one variable per arm, everything else identical.
// - The SCOUT is the shipped scout (src/planrun.js:933-977), run ONCE inside that same
//   `runPlan` call, with the shipped round bound, tool grant, fence and F59 recovery.
//   It is NOT re-implemented here (probe-materials.mjs mirrored it; this does not).
// - The VALIDATOR is the shipped `validatePlan`, and the D2 gate read on the bridge is
//   that same function against THIS job.
// - The DRAFT CALL WIRING is mirrored, not imported: `mkWorker` is closure-scoped inside
//   `runPlan` and cannot be reached, so the 9 samples run on a plain `Loop` with the
//   drafter's exact configuration — `system: PERSONA_TOOLS + strategyFor([])` (which is
//   PERSONA_TOOLS, since a no-tools grant adds no strategy), no tools, `cacheMessages`,
//   `maxTokens: 32000`. Same model, same params, all nine samples identical.
//
// DEVIATIONS from the prereg as written — named, never papered over (see NOTES at the
// bottom of the results file, which carries the same list):
//  1. §2 says "no close". Reaching the shipped scout means calling `runPlan`, and
//     `runPlan` runs the close PRECHECK and the check PREFLIGHT before the scout exists.
//     Both are $0 and deterministic; there is no seam that skips them. The alternative —
//     hand-writing the scout — is a forked instrument, which the standing rule forbids
//     more strongly than this costs.
//  2. §2 says "no writes to any patient". The shipped scout writes the arbiter's own
//     books into the tree (`gate-audit.jsonl`, the `.litectx` store) — that is what the
//     real scout does. No source file is touched: the scout's grant excludes every
//     write-class verb and its fence is empty. The harness asserts the patient's tracked
//     tree is byte-identical before and after, moves the gate audit out, and removes a
//     `.litectx` store it created.
//  3. §7 sizes the $1.00 cap as "~9 drafts x ~$0.06". The scout is not in that sizing but
//     must come out of the same cap. It does, and the cap is enforced cap-not-estimate.
//  4. The materials block in the captured prompt quotes the PROBE's wallet, not the job's
//     $10 — `remainingUsd` is one function feeding both the scout's Gate budget and the
//     drafter's balance line, and bounding the scout inside the frozen $1 cap is the
//     obligation that wins. It is a CONSTANT across all nine samples, so it cannot bias a
//     within/between-arm contrast; it does mean these are plans drafted against a ~$1
//     balance. Recorded, not hidden.
//
//   node scripts/reuse-preprobe.mjs --dry-run          # $0 plumbing check, DRY output
//   node scripts/reuse-preprobe.mjs                    # prints the approval line
//   ANTHROPIC_API_KEY=... node scripts/reuse-preprobe.mjs --approve <specHash>
import { readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { runPlan } from '../src/planrun.js';
import { validatePlan } from '../src/plan.js';
import { jobSpecHash } from '../src/job.js';
import { PERSONA_TOOLS, strategyFor } from '../src/tools.js';
import { extractArtifact } from '../src/text.js';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');
const { Loop } = require('bare-agent');

// ── frozen parameters ───────────────────────────────────────────────────────
/** prereg §7: $1.00 HARD cap, TOTAL, cap-not-estimate — the scout's spend is inside it */
const CAP_USD = 1.00;
/** prereg §7's own sizing figure, used ONLY as the pre-first-draft affordability estimate
 * (after that the estimate is the observed rate, never a constant) */
const SIZING_PER_DRAFT_USD = 0.06;
/** prereg §2: n=3 per arm, 9 total */
const N_PER_ARM = 3;
/** prereg §2: sonnet, the drafter tier floor (PRD v1.36); same model across all arms.
 * Spelled the way run-u.mjs spells its sonnet tier. */
const MODEL = 'claude-sonnet-5';
/** runPlan's default per-step rounds ceiling — the same number the shipped drafter's
 * prompt and validator are built against (run.js passes no override) */
const MAX_STEP_ROUNDS = 40;
/** run-u.mjs's CAP_RUNS. It is NOT in the drafting prompt (the branch removed both that
 * interpolation and `attempts` from the drafting menu); it is passed to runPlan below,
 * where it survives as the close-fix loop's blind fallback — the bound for a close whose
 * output carries no number the progress rule could read. */
const CAP_RUNS = 4;
/** run-u.mjs's CLOSE_TIMEOUT_MS — the litectx suite is the slow stage (~53s) */
const CLOSE_TIMEOUT_MS = 900_000;
/** a provider-red row is a casualty and is REPLACED, never counted (prereg §6). Bounded
 * so a provider outage cannot spin the harness against the cap. */
const MAX_REPLACEMENTS_PER_SAMPLE = 2;

// The target job and its patient. WORKDIR/SEED are the same pair `scripts/run-u.mjs`
// targets under its `litectx-types` entry (its JOBS table, run-u.mjs:32-37) — copied with
// this pointer rather than imported, because run-u.mjs is an executable runner and
// importing it would fire a paid run.
const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/litectx-u';
const SEED = '96813a43bbcbac6a808ff610c6751a8736e2903e';
/** prereg §2: the source bridge — the newest aurora green, a DIFFERENT patient, same shape */
const BRIDGE_FILE = '/home/hamr/PycharmProjects/bareloop-patients/aurora-u-bareloop/bridge-aurora-u-spawner-types-ms7flkok.json';

const argv = process.argv.slice(2);
const arg = (/** @type {string} */ n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : (argv[i + 1] ?? ''); };
const DRY = argv.includes('--dry-run');

const spec = JSON.parse(readFileSync(new URL('../jobs/litectx-u-types.json', import.meta.url), 'utf8'));
const specHash = jobSpecHash(spec);
const bridge = JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
const bridgePlanText = JSON.stringify(bridge.plan, null, 2);

const runid = Date.now().toString(36);
const OUT = DRY
  // never the real results path (`scratch-*` is gitignored): a DRY row must never be
  // mistaken for evidence, and the surest way is for it not to live where evidence lives
  ? new URL(`../scratch-reuse-preprobe-dry-${runid}.json`, import.meta.url)
  : new URL(`../docs/02-experiments/reuse-preprobe-${runid}.json`, import.meta.url);

// ── the arm framings. ONE block appended to the captured prompt; nothing else differs.
const ARM_FRAME = {
  A: null,
  B: `

FOR REFERENCE ONLY — a plan from a DIFFERENT repository. This is reading material, not your draft.
A previous run of a same-shape job (the same four close stages) greened on a DIFFERENT repository
with the plan below. Its paths do not exist here and it is not a draft you can submit. Draft YOUR
plan for THIS repository from scratch; consult the one below only if something in it is useful.

${bridgePlanText}`,
  C: `

YOUR STARTING DRAFT — begin from the plan below and tweak it.
This plan greened a same-shape job (the same four close stages) on a DIFFERENT repository. Take it
as your starting draft rather than starting from a blank page: keep what carries over, change what
this repository needs. Everything you submit must be legal for THIS job as described above — its
paths, scopes, verbs, bounds and check names. Output the finished plan as the single JSON object
required above, and nothing else.

${bridgePlanText}`,
};

// ── the one ledger. Unpriced is never free (F6): a null cost cannot be summed, so it
// flags the row instead of accumulating $0.
let spentUsd = 0;
let unpricedRounds = 0;
/** @type {number[]} observed per-draft costs — the affordability estimate, measured not assumed */
const draftCosts = [];
/** @type {string|null} set when the cap binds; the stop IS the result (prereg §7) */
let stoppedByCap = null;

const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', WORKDIR, ...a], { encoding: 'utf8' }).trim();

// ── preconditions ───────────────────────────────────────────────────────────
if (!existsSync(WORKDIR)) { console.error(`patient not found: ${WORKDIR}`); process.exit(2); }
const patientHead = git(['rev-parse', 'HEAD']);
const patientDirty = git(['status', '--porcelain']);
const atSeed = patientHead === SEED && patientDirty === '';

console.log('REUSE pre-probe — draft-only, 3 arms x 3, sonnet');
console.log(`  prereg   docs/02-experiments/REUSE-PREPROBE-PREREG.md (FROZEN)`);
console.log(`  job      jobs/litectx-u-types.json  hash ${specHash}`);
console.log(`  patient  ${WORKDIR} @ ${patientHead.slice(0, 12)}${patientDirty ? ' (DIRTY)' : ' clean'}`);
console.log(`  bridge   ${BRIDGE_FILE.split('/').pop()}  (${bridge.plan.steps.length} steps, greened ${bridge.greenAt})`);
console.log(`  cap      $${CAP_USD.toFixed(2)} HARD, total, cap-not-estimate`);

// The patient must be CLEAN AT SEED. A tree left half-solved by the last U run is not the
// tree a real run's scout surveys — and worse, a fully solved one makes the close precheck
// return `satisfied`, at which point `runPlan` returns `already-green` and there is no
// scout at all. Resetting it is a WRITE, which this harness does not do; so it refuses and
// hands the operator the command. The check is identical in both modes; only the ACTION on
// failure differs, and the dry output records which it took.
const SEED_HINT = `  the patient must be clean at its frozen seed:\n    git -C ${WORKDIR} reset --hard ${SEED} && git -C ${WORKDIR} clean -fd`;

if (!DRY) {
  // the approval line first — it is what an operator invoking this bare came for; the
  // preconditions below are what stops an APPROVED run that cannot be trusted
  if (arg('approve') !== specHash) {
    if (arg('approve') !== null) console.error(`\nREFUSED: --approve ${arg('approve')} does not match this spec version.`);
    console.log(`\nTo approve and run:\n  ANTHROPIC_API_KEY=... node scripts/reuse-preprobe.mjs --approve ${specHash}`);
    if (!atSeed) console.log(`\nNOTE: the patient is NOT clean at seed, and the probe will refuse until it is.\n${SEED_HINT}`);
    process.exit(arg('approve') === null ? 0 : 1);
  }
  if (!atSeed) {
    console.error(`\nREFUSED: patient is not clean at seed ${SEED.slice(0, 12)}.\n${SEED_HINT}`);
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree)');
    process.exit(2);
  }
}

// ── the provider ────────────────────────────────────────────────────────────
/** the sentinel: the drafter's prompt has been captured, so the call must not spend */
class DraftPromptCaptured extends Error {
  constructor() {
    super('reuse-preprobe: drafter prompt captured — aborting the call before it spends');
    this.name = 'DraftPromptCaptured';
    /** @type {string} a category of its own, so this abort can never be read later as a
     * real transport casualty in the escalation record */
    this.category = 'probe-capture-stop';
  }
}

/** which sample is in flight — the coordinate the DRY stub's scripted faults key off.
 * A coordinate, never a call COUNT: a fake that decides "where am I" by counting calls
 * silently retargets the moment the number of calls changes (the standing rule). */
let sampleTag = /** @type {string|null} */ (null);
/** DRY coordinates already served their one scripted casualty (so the replacement lands) */
const dryCasualtyFired = new Set();

/** DRY provider: a scripted stub. It exists to exercise PLUMBING and nothing else — the
 * standing lesson is that scripted fakes mask real bugs, so every DRY artifact says so.
 * It deliberately injects ONE truncation and ONE casualty at fixed coordinates, because
 * the branches most likely to be wrong are the ones a happy-path fake never reaches. */
const dryProvider = {
  name: 'dry-stub',
  model: 'DRY',
  /** @type {(m: any[], t?: any[], o?: any) => Promise<any>} */
  async generate(messages) {
    if (sampleTag === 'B#2') {
      // the REAL truncation shape: bare-agent short-circuits `max_tokens` into
      // `error: 'truncated:max_tokens'` — the row must land as truncated, not casualty
      return { text: '{"schema":"plan-v1","steps":[{"id":"cut', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'max_tokens', model: 'DRY', costUsd: 0 };
    }
    if (sampleTag === 'C#2' && !dryCasualtyFired.has('C#2')) {
      dryCasualtyFired.add('C#2');
      throw new Error('DRY scripted transport failure (overloaded_error) — exercises the casualty/replacement path');
    }
    const first = messages.find((/** @type {any} */ m) => m.role === 'user');
    const content = typeof first?.content === 'string' ? first.content : '';
    const text = content.startsWith('DRAFT-PLAN')
      ? JSON.stringify({
        schema: 'plan-v1',
        steps: [{
          id: 'dry-step', action: 'DRY stub plan — plumbing only, never evidence.',
          tools: ['read', 'grep', 'edit'], rounds: 20, target: 'src/index.js',
          exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }],
        }],
      })
      : 'DRY stub survey: src/ holds the library; index.js is the entry point.';
    return { text, toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn', model: 'DRY', costUsd: 0 };
  },
};

const baseProvider = DRY ? dryProvider : new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: MODEL });

/** @type {{prompt: string|null, source: string}} */
const captured = { prompt: null, source: 'runPlan (real drafter call, intercepted)' };
/** The capture wrapper. It forwards every call untouched EXCEPT the drafter's, which it
 * records and then aborts — the prompt is the artifact we need and the completion is not,
 * so the abort happens before any request leaves the process ($0, by construction). */
const capturingProvider = {
  name: `${baseProvider.name ?? 'provider'}+reuse-preprobe-capture`,
  model: baseProvider.model,
  /** @type {(m: any[], t?: any[], o?: any) => Promise<any>} */
  async generate(messages, tools = [], options = {}) {
    const first = messages.find((/** @type {any} */ m) => m.role === 'user');
    const content = typeof first?.content === 'string' ? first.content : '';
    // Identified by the prompt's own opening word, never by counting calls: a harness
    // that infers "where am I" from a call index silently retargets the moment the
    // number of calls changes (the standing rule).
    if (content.startsWith('DRAFT-PLAN')) {
      if (captured.prompt === null) captured.prompt = content;
      throw new DraftPromptCaptured();
    }
    return baseProvider.generate(messages, tools, options);
  },
};

// ── phase 1: CAPTURE — one real runPlan, stopped at the drafter's door ───────
/** @type {any[]} */
const events = [];
const emit = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
  const ev = { type, ...data };
  events.push(ev);
  // the ledger counts ROUNDS, exactly as run.js's meter does (F12) — an attempt that
  // halts mid-flight still lands its real spend here
  if (type === 'worker-round') {
    const c = data?.costUsd;
    if (typeof c === 'number' && Number.isFinite(c)) spentUsd += c;
    else unpricedRounds += 1;
  }
  return ev;
};

let captureOutcome = null;
/** did the scout CREATE the litectx store, or was it already there? (only ours is removed) */
const litectxPreexisting = existsSync(join(WORKDIR, '.litectx'));
if (DRY && !atSeed) {
  // The one thing the dry run cannot exercise, said plainly rather than glossed: the
  // capture leg needs a clean-at-seed patient (and the real close it implies).
  captured.source = 'CANNED (dry run: patient not clean at seed, so the runPlan capture leg was NOT exercised)';
  captured.prompt = `DRAFT-PLAN\n(DRY CANNED PROMPT — the real drafter prompt was NOT captured on this run.)\n\nGoal:\n${spec.goal}\n\nRepository survey (from a read-only scout):\n(dry: no scout ran)`;
  console.log(`\ncapture  SKIPPED — ${captured.source}`);
  console.log(SEED_HINT);
} else {
  console.log(`\ncapture  driving the shipped runPlan (close precheck + check preflight + scout), then aborting at the drafter${DRY ? ' [DRY]' : ''}`);
  try {
    captureOutcome = await runPlan(spec, {
      workdir: WORKDIR,
      provider: capturingProvider,
      emit,
      // the PROBE's wallet, not the job's — deviation 4 in the header. It bounds the
      // scout's Gate inside the frozen cap, and it is what the materials block quotes.
      remainingUsd: () => Math.max(CAP_USD - spentUsd, 0),
      capRuns: CAP_RUNS,
      closeTimeoutMs: CLOSE_TIMEOUT_MS,
    });
  } catch (e) {
    console.error(`\ncapture leg threw: ${e?.message ?? e}`);
    process.exit(3);
  }
  const scoutBytes = events.findLast((e) => e.type === 'scout-result')?.bytes ?? null;
  console.log(`         outcome ${captureOutcome} · scout ${scoutBytes ?? 'none'} bytes · $${spentUsd.toFixed(4)}`);
  // The plan flow must never have reached EXECUTE: this probe drafts, it does not run.
  if (events.some((e) => e.type === 'step-start' || e.type === 'plan-accepted')) {
    console.error('ABORT: the capture leg reached the plan/step stage — this probe must never execute a plan.');
    process.exit(3);
  }
  if (captured.prompt === null) {
    console.error(`ABORT: no DRAFT-PLAN prompt was captured (runPlan returned "${captureOutcome}" before the drafter ran).`);
    console.error('       Nothing was drafted and nothing is written. Read the events for the reason.');
    process.exit(3);
  }
}

/** the capture leg's spend — everything on the ledger before the first draft */
const captureCostUsd = spentUsd;

// ── patient hygiene: the arbiter's books are the scout's own, and they leave with us
const auditSrc = join(WORKDIR, 'gate-audit.jsonl');
const outDir = fileURLToPath(new URL('.', OUT));
if (existsSync(auditSrc)) renameSync(auditSrc, join(outDir, `reuse-preprobe-${runid}-gate-audit.jsonl`));
// A `.litectx` store the scout CREATED is removed; one that was already there is left
// alone (it is not ours to delete).
if (!litectxPreexisting) rmSync(join(WORKDIR, '.litectx'), { recursive: true, force: true });
const patientHeadAfter = git(['rev-parse', 'HEAD']);
const patientDirtyAfter = git(['status', '--porcelain']);
const readOnlyHeld = patientHeadAfter === patientHead && patientDirtyAfter === patientDirty;
if (!readOnlyHeld) {
  console.error('\nABORT: the patient tree changed under a read-only probe — refusing to write results.');
  console.error(`  before: ${patientHead.slice(0, 12)} / ${patientDirty.split('\n').length} entries`);
  console.error(`  after:  ${patientHeadAfter.slice(0, 12)} / ${patientDirtyAfter.split('\n').length} entries`);
  process.exit(3);
}

// ── phase 2: the 9 drafts ───────────────────────────────────────────────────
/** ONE draft: the drafter's own call shape (system, no tools, cacheMessages, 32k). */
async function draftOnce(/** @type {string} */ prompt) {
  let costUsd = 0;
  let priced = true;
  const loop = new Loop({
    provider: DRY ? dryProvider : baseProvider,
    // strategyFor([]) is '' — a no-tools grant adds no strategy sentence. Written as the
    // shipped expression rather than the constant so it cannot drift from mkWorker's.
    system: PERSONA_TOOLS + strategyFor([]),
    onLlmResult: async (/** @type {any} */ a) => {
      if (typeof a?.costUsd === 'number' && Number.isFinite(a.costUsd)) costUsd += a.costUsd;
      else priced = false; // F6: unknown is never laundered to $0
    },
  });
  const r = await loop.run([{ role: 'user', content: prompt }], [], { cacheMessages: true, maxTokens: 32000 });
  return { text: r.text ?? '', costUsd, priced, stop: r.stopReason ?? null, error: r.error ?? null };
}

/** the frozen read axes (prereg §3), computed mechanically off the drafted plan JSON */
const PATH_WITH_SLASH = /(?:[\w@.-]+\/)+[\w@.*-]+/g;
const BARE_FILENAME = /\b[\w-]+\.(?:js|mjs|cjs|ts|mts|cts|json|py|md|yml|yaml|toml)\b/g;
/** normalise a path-shaped token to something `existsSync` can answer for */
function normPath(/** @type {string} */ t) {
  let p = t.trim().replace(/[.,;:)\]}'"`]+$/, '').replace(/^\.\//, '');
  p = p.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/+$/, '');
  if (!p || p.includes('://') || p.startsWith('-') || p === '**' || p === '*') return null;
  return p;
}
function harvestPaths(/** @type {any} */ plan) {
  /** @type {Set<string>} */
  const out = new Set();
  const add = (/** @type {any} */ t) => { if (typeof t === 'string') { const p = normPath(t); if (p) out.add(p); } };
  for (const s of plan.steps ?? []) {
    add(s?.target); add(s?.scope);
    for (const e of s?.exit ?? []) { add(e?.path); add(e?.scope); }
    const action = typeof s?.action === 'string' ? s.action : '';
    for (const m of action.match(PATH_WITH_SLASH) ?? []) add(m);
    for (const m of action.match(BARE_FILENAME) ?? []) add(m);
  }
  return [...out];
}
function axesOf(/** @type {any} */ plan) {
  if (!plan || !Array.isArray(plan.steps)) return null;
  const steps = plan.steps;
  const refs = harvestPaths(plan).map((p) => ({ path: p, real: existsSync(join(WORKDIR, p)) }));
  return {
    stepCount: steps.length,
    declaredRounds: steps.reduce((/** @type {number} */ a, /** @type {any} */ s) => a + (Number(s?.rounds) || 0), 0),
    verbsPerStep: steps.map((/** @type {any} */ s) => (Array.isArray(s?.tools) ? [...s.tools].sort() : [])),
    verbUnion: [...new Set(steps.flatMap((/** @type {any} */ s) => s?.tools ?? []))].sort(),
    targets: steps.map((/** @type {any} */ s) => s?.target ?? null),
    scopes: steps.map((/** @type {any} */ s) => s?.scope ?? null),
    exitTypes: steps.map((/** @type {any} */ s) => (s?.exit ?? []).map((/** @type {any} */ e) => e?.type)),
    checkNames: [...new Set(steps.flatMap((/** @type {any} */ s) => (s?.exit ?? []).filter((/** @type {any} */ e) => e?.type === 'check-passes').map((/** @type {any} */ e) => e?.name)))].sort(),
    models: steps.map((/** @type {any} */ s) => s?.model ?? null),
    fileRefs: {
      realCount: refs.filter((r) => r.real).length,
      guessedCount: refs.filter((r) => !r.real).length,
      real: refs.filter((r) => r.real).map((r) => r.path),
      guessed: refs.filter((r) => !r.real).map((r) => r.path),
    },
  };
}

/** arm C read 2 — how much of the bridge survived into the draft. TWO definitions,
 * both recorded, because a CROSS-PATIENT pair makes the target-based one degenerate by
 * construction: the bridge's targets are aurora paths and this job's fence is `src/**`,
 * so a legal draft can NEVER keep a bridge target. Reporting only the strict read would
 * hand back a guaranteed zero and call it a measurement. */
const KMD_DEFS = {
  strict: 'per bridge step, matched against ALL drafted steps: kept = identical tools SET and identical target; modified = exactly one of those matches; dropped = neither. Degenerate across patients (the bridge targets sit outside this job\'s writeScope, so a valid draft cannot keep one).',
  structural: 'per bridge step, matched ORDINALLY against the drafted step at the same index: kept = identical tools SET and identical exit-type sequence (and identical check-passes names); modified = exactly one of those matches; dropped = neither, or no drafted step at that index.',
};
function keptModifiedDropped(/** @type {any} */ plan) {
  const bs = bridge.plan.steps;
  const ds = Array.isArray(plan?.steps) ? plan.steps : [];
  const setEq = (/** @type {any[]} */ a, /** @type {any[]} */ b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  const exitSig = (/** @type {any} */ s) => JSON.stringify((s?.exit ?? []).map((/** @type {any} */ e) => [e?.type, e?.name ?? null]));
  const strict = { kept: 0, modified: 0, dropped: 0 };
  const structural = { kept: 0, modified: 0, dropped: 0 };
  bs.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    const toolsHit = ds.some((/** @type {any} */ d) => setEq(d?.tools, b?.tools));
    const targetHit = ds.some((/** @type {any} */ d) => d?.target === b?.target);
    strict[toolsHit && targetHit ? 'kept' : (toolsHit || targetHit ? 'modified' : 'dropped')] += 1;
    const d = ds[i];
    const tSame = !!d && setEq(d?.tools, b?.tools);
    const eSame = !!d && exitSig(d) === exitSig(b);
    structural[tSame && eSame ? 'kept' : (tSame || eSame ? 'modified' : 'dropped')] += 1;
  });
  return { strict, structural, bridgeSteps: bs.length };
}

/** @type {any[]} */
const rows = [];
const ORDER = /** @type {const} */ (['A', 'B', 'C']);
console.log(`\ndrafts   9 samples (3 arms x ${N_PER_ARM}), one model call each`);
outer:
for (const arm of ORDER) {
  for (let i = 1; i <= N_PER_ARM; i++) {
    let replacements = 0;
    for (;;) {
      // cap-not-estimate, checked BEFORE the spend: the estimate is the worst OBSERVED
      // draft so far, and only the very first draft uses the prereg's sizing figure.
      const estimate = draftCosts.length ? Math.max(...draftCosts) : SIZING_PER_DRAFT_USD;
      if (spentUsd + estimate > CAP_USD) {
        stoppedByCap = `stopped before ${arm}#${i}: $${spentUsd.toFixed(4)} spent, next draft estimated $${estimate.toFixed(4)}, cap $${CAP_USD.toFixed(2)}`;
        console.log(`  CAP     ${stoppedByCap}`);
        break outer;
      }
      const prompt = /** @type {string} */ (captured.prompt) + (ARM_FRAME[arm] ?? '');
      sampleTag = `${arm}#${i}`;
      /** @type {any} */
      let row;
      try {
        const r = await draftOnce(prompt);
        spentUsd += r.costUsd;
        if (!r.priced) unpricedRounds += 1;
        draftCosts.push(r.costUsd);
        // The two §6 classes are NOT the same row and bare-agent hands both back through
        // the same field: an API truncation surfaces as `error: 'truncated:max_tokens'`
        // (loop.js's BA-6 short-circuit), and reading it as a transport failure would
        // REPLACE a row the prereg says to keep-and-exclude. Truncation is decided first.
        const truncated = (typeof r.error === 'string' && r.error.startsWith('truncated:'))
          || r.stop === 'max_tokens' || r.text.trim() === '';
        if (r.error && !truncated) {
          // a transport/overload failure is a CASUALTY, never evidence (prereg §6)
          row = { arm, i, outcome: 'casualty', casualty: r.error, costUsd: r.priced ? r.costUsd : null, priced: r.priced };
        } else {
          const code = extractArtifact(r.text).code ?? '';
          const pv = validatePlan(code, { job: spec, maxStepRounds: MAX_STEP_ROUNDS });
          let plan = null;
          try { plan = JSON.parse(code); } catch { /* unparseable — recorded as such */ }
          row = {
            arm, i,
            // a truncation is EXCLUDED from the denominator, never counted as a miss (§6)
            outcome: truncated ? 'truncated' : 'read',
            truncated,
            costUsd: r.priced ? r.costUsd : null,
            priced: r.priced,
            stop: r.stop,
            // a truncated row is EXCLUDED, so it carries no validator verdict at all: a
            // `false` computed off a half-written plan is exactly the "miss" §6 forbids
            validatorOk: truncated ? null : pv.ok,
            validatorReds: truncated ? null : pv.reds,
            plan,
            axes: truncated ? null : axesOf(plan),
            ...(arm === 'C' && !truncated ? { bridgeReuse: keptModifiedDropped(plan) } : {}),
            ...(r.error ? { providerError: r.error } : {}),
            rawChars: r.text.length,
          };
        }
      } catch (e) {
        row = { arm, i, outcome: 'casualty', casualty: String(e?.message ?? e), costUsd: null, priced: false };
      }
      rows.push(row);
      const money = row.costUsd == null ? 'UNPRICED' : `$${row.costUsd.toFixed(4)}`;
      console.log(`  ${arm}#${i}  ${row.outcome.padEnd(9)} ${money.padStart(9)}  steps=${row.axes?.stepCount ?? '-'} valid=${row.validatorOk ?? '-'} real/guessed=${row.axes ? `${row.axes.fileRefs.realCount}/${row.axes.fileRefs.guessedCount}` : '-'}${row.casualty ? `  ${row.casualty}` : ''}`);
      if (row.outcome !== 'casualty') break;
      if (++replacements > MAX_REPLACEMENTS_PER_SAMPLE) {
        stoppedByCap = `stopped at ${arm}#${i}: ${MAX_REPLACEMENTS_PER_SAMPLE + 1} consecutive casualties — provider instability, not evidence`;
        console.log(`  STOP    ${stoppedByCap}`);
        break outer;
      }
    }
  }
}

// ── phase 3: the verdict INPUTS (computed and stored; read by the operator) ──
const readable = rows.filter((r) => r.outcome === 'read');
const byArm = (/** @type {string} */ a) => readable.filter((r) => r.arm === a);
const nums = (/** @type {any[]} */ rs, /** @type {(x: any) => number|null} */ f) => rs.map(f).filter((/** @type {any} */ x) => typeof x === 'number');
const stat = (/** @type {number[]} */ xs) => (xs.length
  ? { n: xs.length, values: xs, min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, spread: Math.max(...xs) - Math.min(...xs) }
  : { n: 0, values: [], min: null, max: null, mean: null, spread: null });
/** the axis extractors — the SAME function feeds A's within-arm spread and B's delta, so
 * the yardstick and the thing measured against it can never be different constructs */
const NUMERIC_AXES = {
  stepCount: (/** @type {any} */ r) => r.axes?.stepCount ?? null,
  declaredRounds: (/** @type {any} */ r) => r.axes?.declaredRounds ?? null,
  distinctVerbs: (/** @type {any} */ r) => r.axes?.verbUnion.length ?? null,
  realFileRefs: (/** @type {any} */ r) => r.axes?.fileRefs.realCount ?? null,
  guessedFileRefs: (/** @type {any} */ r) => r.axes?.fileRefs.guessedCount ?? null,
  costUsd: (/** @type {any} */ r) => r.costUsd ?? null,
};
/** set-valued axes: the spread is the largest pairwise symmetric difference */
const SET_AXES = {
  verbUnion: (/** @type {any} */ r) => r.axes?.verbUnion ?? [],
  targets: (/** @type {any} */ r) => (r.axes?.targets ?? []).filter(Boolean),
  checkNames: (/** @type {any} */ r) => r.axes?.checkNames ?? [],
};
const symDiff = (/** @type {any[]} */ a, /** @type {any[]} */ b) => {
  const A = new Set(a); const B = new Set(b);
  return [...A].filter((x) => !B.has(x)).length + [...B].filter((x) => !A.has(x)).length;
};
const pairwiseWithin = (/** @type {any[]} */ rs, /** @type {(r: any) => any[]} */ f) => {
  /** @type {number[]} */ const d = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) d.push(symDiff(f(rs[i]), f(rs[j])));
  return d;
};
const pairwiseBetween = (/** @type {any[]} */ x, /** @type {any[]} */ y, /** @type {(r: any) => any[]} */ f) => {
  /** @type {number[]} */ const d = [];
  for (const a of x) for (const b of y) d.push(symDiff(f(a), f(b)));
  return d;
};

const A = byArm('A'); const B = byArm('B'); const C = byArm('C');
/** @type {Record<string, any>} */
const withinArmA = {};
for (const [k, f] of Object.entries(NUMERIC_AXES)) withinArmA[k] = stat(nums(A, f));
for (const [k, f] of Object.entries(SET_AXES)) withinArmA[k] = stat(pairwiseWithin(A, f));
/** @type {Record<string, any>} */
const bVsA = {};
for (const [k, f] of Object.entries(NUMERIC_AXES)) {
  const a = stat(nums(A, f)); const b = stat(nums(B, f));
  bVsA[k] = { armA: a, armB: b, meanDelta: (a.mean != null && b.mean != null) ? b.mean - a.mean : null, armAWithinSpread: a.spread };
}
for (const [k, f] of Object.entries(SET_AXES)) {
  bVsA[k] = { betweenAB: stat(pairwiseBetween(A, B, f)), armAWithinSpread: stat(pairwiseWithin(A, f)) };
}
/** @type {Record<string, any>} */
const cVsA = {};
for (const [k, f] of Object.entries(NUMERIC_AXES)) {
  const a = stat(nums(A, f)); const c = stat(nums(C, f));
  cVsA[k] = { armA: a, armC: c, meanDelta: (a.mean != null && c.mean != null) ? c.mean - a.mean : null, armAWithinSpread: a.spread };
}
for (const [k, f] of Object.entries(SET_AXES)) {
  cVsA[k] = { betweenAC: stat(pairwiseBetween(A, C, f)), armAWithinSpread: stat(pairwiseWithin(A, f)) };
}

// C read 1 — the D2 MECHANICAL GATE, run with the shipped validator against THIS job.
// The offered scope menu is the one the real run emitted, so the gate is answered against
// exactly what this job offers (never a menu re-derived here).
const scopeMenu = events.findLast((e) => e.type === 'scope-menu')?.offered;
const bridgeGate = validatePlan(bridgePlanText, {
  job: spec, maxStepRounds: MAX_STEP_ROUNDS,
  ...(Array.isArray(scopeMenu) && scopeMenu.length ? { scopes: scopeMenu } : {}),
});

// ── the results file ────────────────────────────────────────────────────────
const clip = (/** @type {any} */ v, /** @type {number} */ n = 2000) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…[${v.length} chars]` : v);
const results = {
  probe: 'reuse-preprobe',
  dry: DRY,
  ...(DRY ? { DRY_NOTICE: 'PLUMBING ONLY. Every number here came from a scripted stub provider, not a model. It is not evidence of anything and must never be read as a result.' } : {}),
  prereg: 'docs/02-experiments/REUSE-PREPROBE-PREREG.md',
  designRecord: 'docs/plans/2026-08-01-layer-3-reuse-design.md',
  runid,
  startedAt: new Date().toISOString(),
  model: DRY ? null : MODEL,
  capUsd: CAP_USD,
  spentUsd,
  unpricedRounds,
  stoppedByCap,
  nPerArm: N_PER_ARM,
  inputs: {
    job: 'jobs/litectx-u-types.json',
    specHash,
    workdir: WORKDIR,
    patientSeed: SEED,
    patientHead,
    patientCleanAtSeed: atSeed,
    patientUnchangedByProbe: readOnlyHeld,
    bridgeFile: BRIDGE_FILE,
    bridgeJob: bridge.job,
    bridgeRunid: bridge.runid,
    bridgeSpecHash: bridge.specHash,
    bridgeGreenAt: bridge.greenAt,
    bridgeSteps: bridge.plan.steps.length,
  },
  capture: {
    source: captured.source,
    runPlanOutcome: captureOutcome,
    costUsd: captureCostUsd,
    litectxStoreCreatedByProbe: !litectxPreexisting,
    scoutBytes: events.findLast((e) => e.type === 'scout-result')?.bytes ?? null,
    scoutEmpty: events.some((e) => e.type === 'scout-empty'),
    closePrecheckVerdict: events.find((e) => e.type === 'close-precheck')?.verdict ?? null,
    checkMenu: events.find((e) => e.type === 'check-menu')?.offered ?? null,
    scopeMenu: scopeMenu ?? null,
    draftPromptChars: captured.prompt?.length ?? 0,
    draftPrompt: captured.prompt,
    events: events.map((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, clip(v)]))),
  },
  arms: {
    A: { what: 'cold — the spec only (the control)', frame: null },
    B: { what: 'readable lineage — the bridge plan as reading material', frame: ARM_FRAME.B },
    C: { what: 'mechanical start — the bridge plan as the starting draft', frame: ARM_FRAME.C },
  },
  rows,
  readAxes: {
    definitions: {
      realFileReference: 'a path-shaped token named anywhere in the plan (target, scope, exit path/scope, or inside a step action) that EXISTS in the patient tree; "guessed" is the same token when it does not exist. F60\'s own construct, answered against the tree rather than a prose shadow of it.',
      ...KMD_DEFS,
    },
    withinArmA,
    bVsA,
    cVsA,
    cReads: {
      bridgePassesD2Gate: bridgeGate.ok,
      bridgeGateReds: bridgeGate.reds,
      bridgeReusePerRow: C.map((r) => ({ i: r.i, ...r.bridgeReuse })),
      draftingCostVsA: cVsA.costUsd,
    },
  },
  notes: [
    'COLLECTION ONLY — this file carries no verdict. Reading it against the prereg\'s frozen discard rules (§5) is the operator\'s.',
    'Deviation 1: the prereg says "no close"; reaching the shipped scout requires runPlan, which runs the close precheck and check preflight first ($0, deterministic). There is no seam that skips them, and hand-writing the scout would be a forked instrument.',
    'Deviation 2: the prereg says "no writes to any patient"; the shipped scout writes the arbiter\'s own books (gate-audit.jsonl, the .litectx store). No source file is touched (the scout has no write-class verb and an empty fence), and the tracked tree is asserted unchanged before and after.',
    'Deviation 3: the $1.00 sizing line funds 9 drafts only; the scout comes out of the same cap, so the cap can bind earlier than the sizing implies. Cap-not-estimate is enforced before every draft.',
    'Deviation 4: the materials block in the captured prompt quotes the PROBE\'s wallet (~$1), not the job\'s $10 — one remainingUsd feeds both the scout\'s Gate budget and the drafter\'s balance line, and bounding the scout inside the frozen cap wins. Constant across all nine samples, so it cannot bias the contrast.',
    'The strict kept/modified/dropped read is degenerate across patients by construction (the bridge\'s targets sit outside this job\'s writeScope). The structural read is the one that can move.',
  ],
};
writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);

// ── the compact table ───────────────────────────────────────────────────────
const f = (/** @type {any} */ v, /** @type {number} */ d = 2) => (typeof v === 'number' ? v.toFixed(d) : '-');
console.log('\n── rows ──');
console.log('arm#  outcome    cost      steps  rounds  verbs  realRefs  guessedRefs  valid');
for (const r of rows) {
  console.log(`${r.arm}#${r.i}  ${r.outcome.padEnd(9)}  ${(r.costUsd == null ? 'UNPRICED' : `$${r.costUsd.toFixed(4)}`).padStart(9)}  ${String(r.axes?.stepCount ?? '-').padStart(5)}  ${String(r.axes?.declaredRounds ?? '-').padStart(6)}  ${String(r.axes?.verbUnion.length ?? '-').padStart(5)}  ${String(r.axes?.fileRefs.realCount ?? '-').padStart(8)}  ${String(r.axes?.fileRefs.guessedCount ?? '-').padStart(11)}  ${String(r.validatorOk ?? '-')}`);
}
console.log('\n── arm A within-arm spread (the yardstick) ──');
for (const k of Object.keys(NUMERIC_AXES)) console.log(`  ${k.padEnd(18)} values ${JSON.stringify(withinArmA[k].values)}  spread ${f(withinArmA[k].spread, 4)}`);
for (const k of Object.keys(SET_AXES)) console.log(`  ${k.padEnd(18)} pairwise symdiff ${JSON.stringify(withinArmA[k].values)}  max ${f(withinArmA[k].max, 0)}`);
console.log('\n── B vs A (mean delta | A within-arm spread) ──');
for (const k of Object.keys(NUMERIC_AXES)) console.log(`  ${k.padEnd(18)} ${f(bVsA[k].meanDelta, 4).padStart(10)} | ${f(bVsA[k].armAWithinSpread, 4)}`);
for (const k of Object.keys(SET_AXES)) console.log(`  ${k.padEnd(18)} between max ${f(bVsA[k].betweenAB.max, 0)} | within max ${f(bVsA[k].armAWithinSpread.max, 0)}`);
console.log('\n── C reads ──');
console.log(`  bridge passes the D2 mechanical gate against this job: ${bridgeGate.ok}${bridgeGate.ok ? '' : ` (${bridgeGate.reds.length} reds: ${[...new Set(bridgeGate.reds.map((r) => r.code))].join(', ')})`}`);
for (const r of C) console.log(`  C#${r.i} bridge steps kept/modified/dropped — strict ${r.bridgeReuse.strict.kept}/${r.bridgeReuse.strict.modified}/${r.bridgeReuse.strict.dropped} · structural ${r.bridgeReuse.structural.kept}/${r.bridgeReuse.structural.modified}/${r.bridgeReuse.structural.dropped} (of ${r.bridgeReuse.bridgeSteps})`);
console.log(`  drafting cost mean — A ${f(cVsA.costUsd.armA.mean, 4)} · C ${f(cVsA.costUsd.armC.mean, 4)}`);

console.log(`\nspent    $${spentUsd.toFixed(4)} of $${CAP_USD.toFixed(2)}${unpricedRounds ? `  ·  ${unpricedRounds} UNPRICED rounds (F6: unknown is never $0)` : ''}`);
if (stoppedByCap) console.log(`STOPPED  ${stoppedByCap}\n         the stop IS the result (prereg §7) — nothing is widened to manufacture a readable row.`);
console.log(`rows     ${readable.length} readable · ${rows.filter((r) => r.outcome === 'truncated').length} truncated (excluded from the denominator) · ${rows.filter((r) => r.outcome === 'casualty').length} casualties (replaced, never evidence)`);
console.log(`wrote    ${OUT.pathname}`);
if (DRY) console.log('DRY      plumbing only — a scripted stub answered every call. Nothing here is evidence.');
