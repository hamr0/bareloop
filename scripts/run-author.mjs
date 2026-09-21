// RUN-AUTHOR — the first LIVE end-to-end of the close-authoring pipeline (M1–M4b).
//
// The picked class's interview answers in; a REAL scout over a REAL repository; a REAL model
// filling the typed declaration form; the operator's own half of the spec folded
// in; the job validator; and D9's three mechanical gates. What comes out is a
// resolved spec, its hash, and the evidence to sign against.
//
// IT STOPS AT prepareSigning. It never signs and it never runs the job: the
// approvals array and the human's word are the arbiter relocating to the user,
// not disappearing (src/authorjob.js §3). There is no --approve here because
// there is nothing here to approve — signing and running are run-u's territory.
//
// A REFUSAL IS A RESULT. If the interview refuses, or the close cannot be
// authored, or a stage cannot run against the patient, or nothing is red at the
// seed — that comes back verbatim, is written to the out dir, and exits 1. It is
// counted demand against bareloop's own catalogue, never an error to swallow.
//
//   node scripts/run-author.mjs \
//     --source /path/to/prepared/tree --answers answers.json --draft specdraft.json \
//     --verdict green --out /path/to/outdir [--timeout 300000] \
//     [--budget 2.50]
//
//   --source       REPLACES --patient (PRD item 33 M3, ruling 2). It must be a
//                  PREPARED tree — the `tree/` a source door already froze
//                  (`scripts/prep-source.mjs`, or `run-interview.mjs`'s own
//                  Source/Destination questions): `readSourceManifest(dirname
//                  (source))` must find a manifest of kind 'repo' beside it.
//                  An unprepared path dies loud, naming the exact command to
//                  prepare one first; a prepared NON-repo source (a plain
//                  folder/file/URL) stops with the same honest "no checks yet"
//                  message `run-interview.mjs` gives (M3 ruling 7 → M4).
//
//   --budget       THE AUTHORING CEILING, in dollars, and it has NO DEFAULT. The
//                  pipeline pays for a survey (up to three attempts plus a
//                  reserved round) and a declaration loop (an author call, its
//                  revises, and each one's malformed-emission retries); with a
//                  ceiling set, the run stops BETWEEN calls the moment the spend
//                  reaches it. Left off, the run is UNBOUNDED and says so on
//                  stdout before it spends anything — a defaulted cap would be a
//                  silent second ceiling (the `maxWallMs` precedent), and an
//                  unbounded run must be a VISIBLE operator choice, never a state
//                  arrived at by omission.
//
//   --verdict      THE RADIO (PRD v1.57 §1): green | soft-green. It is the
//                  USER's answer, so it is asked rather than defaulted — a
//                  defaulted class would be this script answering a question the
//                  person was asked.
//   answers.json   {"1": "...", ...}  the picked class's own frozen questions,
//                  keyed by the LIBRARY's own numbers (`requiredAnswersFor`) —
//                  green: five, soft-green: those five plus two more (the signed
//                  rubric card and the frozen calibration set). Never a
//                  count spelled here: two slots have already been deleted (D13's
//                  genre confirm, then the repo question hamr dropped once the
//                  mandatory --patient made it redundant), and a hardcoded number
//                  would have gone stale twice.
//   specdraft.json the OPERATOR half of a job-v1 spec — budgets, fence, cadence,
//                  goal, tools, escalation. NO close, NO verdictType: the close is
//                  what this pipeline authors, and the class comes from --verdict.
//                  There is no --provider flag either: the scout's and the
//                  drafter's provider is the draft's OWN `provider` field (PRD
//                  item 34 L17) — `run-interview.mjs` asks for it and writes it
//                  in; a draft missing one, or naming one the provider factory
//                  does not know, dies here loud, listing the known table.
import {
  readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  authorCloseForJob, assembleSpec, prepareSigning, refusalEvents,
  VERDICT_CLASSES, LIVE_CLASSES, MENU_CLASSES, questionsFor, AUTHORED_SPEC_FIELDS,
  REFUSAL_LIB, REFUSAL_CATEGORY,
} from '../src/authorjob.js';
import {
  makeLoopGenerate, CONFIRM_MENU, CONFIRM_SYSTEM,
} from '../src/authorflow.js';
import { defaultJudgeLoop, resolveJobJudge } from '../src/judged.js';
import { validateJob, jobSpecHash, resolveWorkerModel } from '../src/job.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
import { detectLanguage } from '../src/detectlang.js';
import { closeJudges, GATE_AUDIT_FILE } from '../src/kinds.js';
import { resolveProvider, buildRunnerProviders, apiKeyProblem } from '../src/providers.js';
import { readSourceManifest, missingDependencies } from '../src/source.js';
import { tallyCalls } from '../src/text.js';
import {
  declarationLines, rubricLines, calibrationLines, parseCeiling, ceilingLine, crashRecord, phaseLine,
  openQuestionLines, answeredQuestionLines, fellBackLines,
} from './author-readout.mjs';

/** the close precheck / seed read spawns real toolchains; the slowest stage is a
 * suite. Headroom, not a budget — and it is passed EXPLICITLY rather than left
 * to a default, because a defaulted cap is a silent second ceiling. */
const DEFAULT_TIMEOUT_MS = 300_000;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

// `--patient` IS GONE (PRD item 33 M3, ruling 2): `--source` replaces it, and
// must be a PREPARED tree — see the usage comment above. Stopped loud rather
// than silently ignored, the same rule `--lang`'s removal already applies.
if (arg('patient') !== null) {
  die('--patient is no longer a flag — use --source <tree>, the prepared copy a source door produces '
    + '(scripts/prep-source.mjs, or run-interview.mjs\'s own Source/Destination questions). PRD item 33 M3, ruling 2.');
}
const sourceArg = arg('source');
const answersArg = arg('answers');
const draftArg = arg('draft');
const outArg = arg('out');
const verdictArg = arg('verdict');
// `--lang` IS GONE (PRD item 33 M3, ruling 3): language is a FACT of the
// repository, read off its own manifest, never a flag a person sets. Stopped
// loud rather than silently ignored, same rule the interview script applies.
if (arg('lang') !== null) {
  die('--lang is no longer a flag — language is auto-detected from --source\'s own manifest '
    + '(package.json/pyproject.toml/setup.py), never asked or set (PRD item 33 M3, ruling 3). Drop --lang and rerun.');
}
const timeoutArg = arg('timeout');
const TIMEOUT_MS = timeoutArg === null ? DEFAULT_TIMEOUT_MS : Number(timeoutArg);
/** NO DEFAULT, deliberately: `null` is "nobody set one" and means UNBOUNDED. It
 * is never filled in here — the whole point of the flag is that the number is
 * the operator's, and a script that supplies one on their behalf has set a
 * ceiling nobody chose. Parsed through `author-readout.mjs` so the rule has a
 * home a test can reach. */
const { ceilingUsd: CEILING_USD, error: budgetError } = parseCeiling(arg('budget'));

if (!sourceArg || !answersArg || !draftArg || !outArg || verdictArg === null) {
  die('usage: node scripts/run-author.mjs --source <tree> --answers <answers.json> --draft <specdraft.json> '
    + `--verdict <${MENU_CLASSES.join('|')}> --out <outdir> [--timeout <ms>] [--budget <usd>]`);
}
// A malformed ceiling dies at the door rather than silently reading as absent.
if (budgetError) die(budgetError);
// the menu is handed over enumerated; an unknown value is a typo, and the
// interview refuses it as one (a LOCKED class is a different answer — it reaches
// the pipeline and comes back as counted demand). The CHECK stays against the
// full `VERDICT_CLASSES` (so an off-menu pick reaches the pipeline's counted
// refusal rather than dying here as a typo); the PRINTED text names only the
// menu (item 34 L19: nothing customer-facing names an off-menu class).
const VERDICT = /** @type {string} */ (verdictArg);
if (!VERDICT_CLASSES.includes(VERDICT)) die(`--verdict ${VERDICT} is not a verdict class — one of ${MENU_CLASSES.join(' | ')}`);
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) die(`--timeout ${timeoutArg} is not a positive number of milliseconds`);

const SOURCE = resolve(/** @type {string} */ (sourceArg));
if (!existsSync(SOURCE)) die(`--source ${SOURCE} does not exist — the scout reads a prepared source tree off the machine, never out of prose`);
const OUT = resolve(/** @type {string} */ (outArg));

// ── THE SPINE, BOOTSTRAPPED FIRST — before anything that can refuse, before
// any provider is resolved or built, and before the API key is even read.
// Moved here (out of its old position, further down, right before the first
// paid span) so that EVERY refusal this script can produce — starting with
// the manifest and language checks immediately below — has somewhere to
// record itself. A `die()` before this point is still bare stderr+exit(2):
// those are pure operator/config errors (missing flags, a bad number) with
// no spine to write into yet and nothing they represent counts as demand.
mkdirSync(OUT, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(OUT, `author-${runid}.jsonl`);
/** the spine: one JSONL line per event, appended. This runner owns it, exactly
 * as the shell owns `runJob`'s — `authorjob.js` emits nothing itself.
 * @param {string} type @param {any} [data] */
const emit = (type, data = {}) => {
  appendFileSync(spineFile, `${JSON.stringify({ type, ts: new Date().toISOString(), ...data })}\n`);
};
/** @param {string} name @param {any} body */
const writeOut = (name, body) => {
  const f = join(OUT, name);
  writeFileSync(f, `${JSON.stringify(body, null, 2)}\n`);
  return f;
};

// F186 — the scout's gate audit (`src/authorscout.js`'s `defaultSurveyor`,
// default `auditPath = join(workdir, GATE_AUDIT_FILE)`) writes the
// arbiter's own book DIRECTLY INTO THE PATIENT TREE, at its root — the same
// place `scripts/run-u.mjs` later looks for a fresh worker run's own audit.
// The patient's `.gitignore` denies `*.jsonl`, so a cold `git clean -fd`
// never removes it: it survives across every authoring run against the
// same tree, accreting rows from every run_id that has ever touched it,
// until something moves it out of the way. `run-u.mjs`'s own half of this
// fix (item 3b) moves a STALE audit aside at launch; this half archives
// THIS run's own audit OUT of the tree the moment authoring is done, so a
// later run — authoring or worker — never finds it there at all.
//
// Idempotent by construction (checks `existsSync` itself) so it is safe to
// call from more than one exit path without double-moving or throwing on
// the second call. Best-effort: a rename failure is reported, never thrown
// — the same F70 reasoning the crash handler already follows (a report
// that can itself crash defeats the report).
let gateAuditArchived = false;
const archiveGateAudit = () => {
  if (gateAuditArchived) return;
  gateAuditArchived = true;
  const treeAudit = join(SOURCE, GATE_AUDIT_FILE);
  if (!existsSync(treeAudit)) return;
  const archived = join(OUT, `author-${runid}-${GATE_AUDIT_FILE}`);
  try {
    renameSync(treeAudit, archived);
    console.log(`gate audit ${archived} (moved out of the patient tree — F186)`);
  } catch (e) {
    console.error(`gate audit could not be archived out of the patient tree: ${/** @type {NodeJS.ErrnoException} */ (e)?.message ?? e}`);
  }
};

// ── --SOURCE MUST BE A PREPARED TREE (PRD item 33 M3, ruling 2) ─────────────
// `--source` replaced `--patient`; it is no longer just "a repository on the
// machine" — it must be the FROZEN COPY a source door already produced
// (`scripts/prep-source.mjs`, or `run-interview.mjs`'s own Source/Destination
// questions), so `dirname(SOURCE)` (the door's own `into`) carries a
// `source.json` manifest right beside `tree/`, which IS `SOURCE` here. A
// config error (never prepared, or a manifest that cannot be read) dies
// loud, before the API key is even read — same standing as every other
// argv/config `die()` in this file.
const manifestRead = await readSourceManifest(dirname(SOURCE));
if (manifestRead.stop !== null) {
  die(`--source ${SOURCE}: ${manifestRead.code} — ${manifestRead.stop}`);
}
if (!manifestRead.present) {
  die(`--source ${SOURCE} was never prepared through the source front door — no source.json beside it. Prepare it first:\n`
    + '  node scripts/prep-source.mjs --source <path-or-url> --into <dir>\n'
    + 'then rerun this script with --source <dir>/tree.');
}
// A manifest that EXISTS but names a NON-repo kind (a plain folder/file/URL)
// is a different thing entirely: the source was prepared correctly, and
// there is simply no check catalogue for it yet (M3 ruling 7 → M4). F191
// (D5 amended 2026-09-21): that honest stop fires immediately, right after
// `author-start`, at $0 — no scout, no confirm turn, no model call. D5's
// original shape (a plain-folder job gets a paid confirm turn first) is
// unreachable by construction now that the close catalogue is code-genre
// only, so no confirm turn over a plain folder could ever confirm a plan
// this build can close (see the stop itself, below, for the full story).
// `IS_REPO_SOURCE` gates the language-detection block right below (a plain
// folder has no genre to detect) and the branch further down that decides
// which of the two paths this run actually takes.
const IS_REPO_SOURCE = manifestRead.manifest.kind === 'repo';

// ── LANGUAGE, DETECTED — never asked (PRD item 33 M3, ruling 3) ──────────────
// $0, no provider, run BEFORE the API key is even read — this script must
// reach here on `--source` alone, with no `--lang` needed. Run against the
// PREPARED TREE, never the original patient the door froze it from. Same
// four outcomes `run-interview.mjs` reads (that script normally catches the
// two that stop something first, but this script is also runnable standalone
// against a hand-written answers.json/specdraft.json, so it repeats the same
// two early stops rather than relying on the interview having run first):
//   - `ambiguous`             — two languages' manifests at the same level;
//                               stopped here with the honest list (the
//                               confirm-turn UI to ask a person is later M3).
//                               An OPERATOR FIX (point --source at the right
//                               subfolder), never demand — no spine record.
//   - `language-unsupported`  — a known manifest with no genre data yet;
//                               stopped here, before the API key check, so a
//                               job that can never be authored costs nothing.
//                               COUNTED DEMAND: emitted through the same
//                               `refusalEvents()` channel every other refusal
//                               in this script uses, so it folds into the
//                               ledger's admission count (src/ledger.js
//                               `classifyIncidents`) instead of vanishing.
//   - `resolved` / `no-code-job` — carried into `lang` below exactly where
//     the old `--lang` value flowed; `no-code-job` reads as `'none-detected'`,
//     which the existing GENRE_LANGUAGES check further down refuses on its
//     own (M3 ruling 7: a plain-folder job is not an error here, it is simply
//     not a code-genre job this pipeline can close yet).
// Only meaningful for a REPO source (PRD item 33 M3 piece 4, step S6): a
// plain folder has no genre to detect and no code-shaped manifest to walk —
// `LANG`/`langResult` stay at their "nothing to see" values and the confirm
// turn further down runs with `isRepo: false` (D5), which is what already
// skips the repo-only "worse than before" ask and the language pick alike.
let langResult = /** @type {ReturnType<typeof detectLanguage>|null} */ (null);
let LANG = 'none-detected';
if (IS_REPO_SOURCE) {
  langResult = detectLanguage(SOURCE);
  // AMBIGUOUS NO LONGER DIES (PRD item 33 M3 piece 4, step S4): the confirm
  // turn's own $0 half asks the person which language this job is about,
  // BEFORE the scout (D7) — `langResult` travels into `authorCloseForJob`
  // below exactly as it is here, and its `ambiguous` shape is what triggers
  // that ask. `LANG` below is a placeholder for this outcome only: whatever
  // the person picks interactively is what actually lands in `closeDecl.lang`.
  if (langResult.kind === 'language-unsupported') {
    const r = langResult.refusal;
    console.log(`REFUSED (${r.kind})  verb=${r.verb}  path=${r.path}`);
    console.log(r.detail);
    for (const o of r.options) console.log(`  · ${o}`);
    for (const e of refusalEvents(r)) emit(e.type, e);
    console.log(`\nRecorded as admission demand in the spine: ${spineFile}`);
    // A stop this early has no `authored`/`signing` result to fall through to —
    // the rest of this file's flow assumes a resolved language, a provider and
    // a spec draft, none of which exist yet. `process.exitCode` plus falling
    // through would require wrapping everything below in a guard, which is the
    // rewrite the task asked not to make; `process.exit(1)` is kept here,
    // deliberately, rather than reworked into that shape.
    process.exit(1);
  }
  LANG = langResult.kind === 'resolved' ? langResult.lang
    : langResult.kind === 'ambiguous' ? langResult.candidates[0]
      : 'none-detected';
  if (langResult.kind === 'ambiguous') {
    console.log(`Source has more than one supported language's manifest at the same (nearest) level: `
      + `${langResult.candidates.join(', ')} (in ${langResult.dir}).`);
    console.log('This will be asked, interactively, in the confirm turn below — before any paid call.');
  }

  // ── item 33 close-out: the install gap, refused at $0 (hamr's ruling
  // 2026-09-14, option A) ── `prepareSource` copies only git-tracked files, so
  // a JS/TS repo's copy never carries `node_modules`, and every close stage
  // needing a tool (`tsc`, a test runner) would instrument-stop. bareloop
  // never runs an install itself — this refuses BEFORE the scout, before the
  // API key is even read, naming the exact command the person runs themselves
  // in the copy. Routed through the same `refusalEvents()` channel every other
  // $0 refusal in this script uses (the `language-unsupported` block above),
  // never an ad-hoc print, so it folds into the ledger's admission count the
  // same way.
  const depsGap = missingDependencies(SOURCE, manifestRead.manifest.sourceSubdir ?? '');
  if (depsGap) {
    const detail = `${SOURCE} has a package.json listing dependencies but the copy has no node_modules (${depsGap.reason}) — every `
      + 'close stage needing a tool would instrument-stop. bareloop never runs an install itself; run this in the copy, then rerun '
      + `run-author.mjs against the same --source:\n  cd ${SOURCE} && ${depsGap.command}`;
    const refusal = {
      kind: 'request-red', verb: 'source-deps-missing', path: 'source', detail,
      options: [`run \`${depsGap.command}\` inside ${SOURCE}, then rerun run-author.mjs with the same --source`],
      red: {
        code: 'request-red', path: 'source', detail, verb: 'source-deps-missing', lib: REFUSAL_LIB, category: REFUSAL_CATEGORY,
      },
    };
    console.log(`REFUSED (${refusal.kind})  verb=${refusal.verb}  path=${refusal.path}`);
    console.log(refusal.detail);
    for (const o of refusal.options) console.log(`  · ${o}`);
    for (const e of refusalEvents(refusal)) emit(e.type, e);
    console.log(`\nRecorded as admission demand in the spine: ${spineFile}`);
    process.exit(1);
  }
}

/** @param {string} label @param {string} file */
const readJson = (label, file) => {
  const p = resolve(file);
  if (!existsSync(p)) die(`--${label} ${p} does not exist`);
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return die(`--${label} ${p} is not readable JSON: ${e.message}`); }
};
const answers = readJson('answers', /** @type {string} */ (answersArg));
const draft = readJson('draft', /** @type {string} */ (draftArg));
// The draft is the OPERATOR half, and `assembleSpec` refuses one that already
// carries the authored half rather than merging over it. Asked HERE — before the
// scout, before any paid call — so a draft that cannot compose costs nothing to
// find out about; without this the same refusal arrives after the model has been
// paid, which is a true answer at the wrong price.
const carried = AUTHORED_SPEC_FIELDS.filter((f) => draft?.[f] !== undefined);
if (carried.length) {
  die(`--draft ${draftArg} carries ${carried.join(', ')} — the draft is the operator's half only. `
    + 'The close is what this pipeline authors and the class comes from --verdict; a draft that names either would be '
    + 'silently overwritten, and a signed spec that does not contain what its author typed is the failure nobody sees.');
}

// THE AUTHORING PROVIDER (PRD item 34 L17) — resolved from the DRAFT's OWN
// `provider` field, the same rule `scripts/run-u.mjs` applies to the worker
// (`resolveProvider(spec.provider)`, no CLI flag, no default): authoring used
// to hardcode `anthropic-api` for both the scout and the drafter, which is
// exactly the scattering `src/providers.js`'s factory exists to stop. The
// draft interview (`run-interview.mjs`) now asks for a provider the same way
// it asks for everything else the operator owns; this script just resolves
// whatever it wrote down. Missing or unrecognized dies here, loud, the same
// message `resolveProvider` throws (it names the known table).
//
// STILL UNPROVEN LIVE past Anthropic: the drafting floor (PRD v1.36:
// sonnet-tier minimum) has only ever run against `anthropic-api` in practice.
// A DeepSeek draft is legal here today, but proving it is M3's DeepSeek proof
// run, not this script.
const providerEntry = (() => {
  try { return resolveProvider(draft?.provider); } catch (e) { return die(/** @type {Error} */ (e).message); }
})();
const PROVIDER_NAME = /** @type {string} */ (draft.provider);
// The same tier run-u drafts and works on. The declaration is authored by a
// model, so the floor is the drafter floor (PRD v1.36: sonnet MINIMUM).
const MODEL = /** @type {NonNullable<typeof providerEntry>} */ (providerEntry).tiers.sonnet;
// spec.baseUrl (PRD item 28, ruling (d)) — the same forwarding rule run-u
// applies: forwarded only when the draft names one, every provider
// constructor defaults it on its own when absent.
const baseUrl = typeof draft?.baseUrl === 'string' ? draft.baseUrl : undefined;

// THE JUDGE THIS RUN'S OWN WORKER RESOLVES TO (PRD item 32.1) — resolved ONCE,
// here, from the DRAFT, and reused for BOTH the compose-time stamp (the
// declaration-authoring call's own `judgeModel` argument, below) and the
// calibration gate (`prepareSigning`'s `judgeModel` argument, further down).
// `resolveJobJudge` is the one
// spelling of "the named provider's own `tiers.sonnet` defaults an absent
// model, then a signed `judge` override wins" that `scripts/run-u.mjs`
// applies at run time (`resolveWorkerModel` + `resolveJudge`) — spelling that
// composition twice by hand, once here at the wrong identity (the AUTHORING
// provider/model) and once at the gate, was the bug this fixes: a close
// calibrated against judge X got stamped with model Y, and only the run-time
// read (`scripts/run-u.mjs:1144`) used the job's real worker, so the mismatch
// surfaced as a recalibration refusal on the close's first real run.
// `assembleSpec` carries `provider`/`model`/`judge` from the draft into the
// spec untouched, so resolving again from the assembled spec below (where the
// identity is guaranteed valid, because `validateJob` has already passed by
// then) returns the byte-identical pair — one rule, read twice, not two rules.
//
// This first read runs BEFORE `validateJob` has seen the draft, so a draft
// naming an unresolvable provider or a malformed `judge` override THROWS here
// — caught, because that draft is going to red cleanly at `validateJob` a few
// lines below regardless, and the placeholder this falls back to is discarded
// unsigned the moment it does.
const resolveDraftJudge = (/** @type {any} */ d) => {
  try {
    return resolveJobJudge(d, PROVIDER_NAME, resolveWorkerModel);
  } catch {
    return { provider: PROVIDER_NAME, model: MODEL };
  }
};
const draftJudge = resolveDraftJudge(draft);

// Secrets load from the environment; they never enter argv (a command line is
// world-readable on /proc) and they are never printed.
const AUTHOR_ENV_KEY = /** @type {NonNullable<typeof providerEntry>} */ (providerEntry).envKey;
const apiKey = process.env[AUTHOR_ENV_KEY];
if (!apiKey) { console.error(`${AUTHOR_ENV_KEY} not set (secrets load from the environment — never the tree, never argv)`); process.exit(2); }
// F181 — a key that carries a line break/control char/stray whitespace (a
// two-line secret-store entry, e.g.) reads as "set" by the presence check
// above and then crashes Node's own header-encode inside the paid span. This
// refuses at the SAME door, before any provider is constructed, and never
// echoes the value or the reason's source.
const AUTHOR_KEY_PROBLEM = apiKeyProblem(apiKey);
if (AUTHOR_KEY_PROBLEM) { console.error(`${AUTHOR_ENV_KEY} ${AUTHOR_KEY_PROBLEM} — refusing rather than crashing mid-call (never trimmed or repaired; fix the value at its source)`); process.exit(2); }
/** The judge's key follows the RESOLVED judge provider's own env var, with
 * `JUDGE_API_KEY` as the role-named override in front (PRD item 32.3) — the same
 * contract `scripts/run-u.mjs` keeps, so one story covers both surfaces. When the
 * judge IS the authoring provider this is the key already read above. */
const judgeKeyFor = (/** @type {string} */ providerName) => (
  process.env.JUDGE_API_KEY ?? process.env[resolveProvider(providerName).envKey]
);

/** F6 — an unpriced call makes the TOTAL unknown, and unknown is reported as
 * UNKNOWN. `?? 0` launders unknown into $0, and a bare floor that reads as exact
 * is F6 in an honest coat, so the floor is marked `≥`.
 * @param {any} cost a `makeCostBook().report()` */
const costLine = (cost) => {
  // `cost === null` is not an unknown: `authorCloseForJob` returns a cost book on
  // every path that reaches a model and `null` on every path that refuses before
  // one (the interview, the language check, the seed read). So this states the
  // FACT — no call was made — rather than reporting a number in either direction.
  if (!cost) return 'not metered — this path refused before any model call';
  if (cost.costUsd === null) {
    return `UNKNOWN — ≥$${cost.knownUsd.toFixed(6)} known across ${cost.calls?.length ?? 0} call(s), `
      + `${cost.nullCostCalls} unpriced call(s), ${cost.unpricedRounds} unpriced round(s)`;
  }
  return `$${cost.costUsd.toFixed(6)} across ${cost.calls?.length ?? 0} call(s) (spend complete)`;
};

console.log(`== close-authoring, run ${runid} ==  ${PROVIDER_NAME}/${MODEL}${baseUrl === undefined ? '' : `  (endpoint ${redactSecrets(baseUrl)})`}`);
console.log(`  source   ${SOURCE}`);
console.log(`  verdict  ${VERDICT}  (the USER's pick — this run authors a close that promises to stay at or below it)`);
console.log(`  lang     ${LANG}`);
console.log(`  draft    ${resolve(/** @type {string} */ (draftArg))} (job "${draft?.job ?? '?'}")`);
console.log(`  out      ${OUT}`);
console.log(`  timeout  ${TIMEOUT_MS}ms per close stage`);
// THE UNBOUNDED RUN IS ANNOUNCED. Printed before the provider is even built, so
// it is on stdout ahead of the first paid byte rather than discovered in the
// total afterwards.
console.log(`  ${ceilingLine(CEILING_USD)}`);
console.log('  stops at prepareSigning — this script NEVER signs and NEVER runs the job\n');

// F190 (docs/logs/FINDINGS.md) — this used to be a hand-rolled `makeProvider`
// call, a duplicate of the SAME construction `buildRunnerProviders` already
// owns for `src/cli.js`. Routed through the one owner now: the judge half of
// this call is a THROWAWAY (`judgeProviderName`/`judgeModel`/`judgeBaseUrl` all
// equal the author's own identity, so `buildRunnerProviders`' own reuse check
// returns the SAME instance as `provider` rather than constructing a second
// one) — the real judge identity is not resolved until after `validateJob`,
// further down, where a second call takes only its `.judgeProvider`.
const { provider } = buildRunnerProviders({
  providerName: PROVIDER_NAME, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl,
  judgeApiKey: apiKey, judgeModel: MODEL, judgeProviderName: PROVIDER_NAME, judgeBaseUrl: baseUrl,
});
emit('author-start', { runid, source: SOURCE, lang: LANG, verdictType: VERDICT, provider: PROVIDER_NAME, model: MODEL, baseUrl: baseUrl ?? null, job: draft?.job ?? null, timeoutMs: TIMEOUT_MS, ceilingUsd: CEILING_USD });

// ── EVERYTHING FROM HERE IS INSIDE ONE CATCH (F191) ──────────────────────────
// This USED TO start ~300 lines further down, right before the repo-shaped
// scout/authoring call — reasoned as "the argv and config die() paths run
// before the spine file exists, and a crash record with no spine to land in
// is a record nobody can read". That reason expired the moment the spine
// STARTED existing, one line above, at `author-start` — not ~300 lines later.
// Live run `mu4hc7sp` (F191) proved the gap live: a crash inside the OLD
// plain-folder confirm-turn branch (which used to sit between `author-start`
// and the old net's start) left a two-record spine with no ending at all —
// the exact "died and said nothing" failure this net exists to prevent.
// Moving the net's start here closes that gap: EVERYTHING from `author-start`
// on — the plain-folder stop below included — is now covered, whether or not
// it spends a cent (the crash message below says which).
//
// `rl` and `metered` are declared here, OUTSIDE the try, rather than where
// they are constructed/used below — the `catch`/`finally` blocks that read
// them (the crash message's own spend check, and the reader-close, F71) are
// SIBLINGS of the try, not nested inside it, so a binding made only inside
// the try would not exist there.
/** @type {ReturnType<typeof createInterface>|undefined} */
let rl;
/** EVERY METERED CALL, in the order they landed, in the ONE shape `costLine`
 * already reads. A second hand-spelled running total is exactly the pair this
 * file has already paid for once (the cap-halt/pricing-red type), so the totals
 * are DERIVED from this list through `tallyCalls` — the same reader the library's
 * own cost book uses — rather than accumulated a second time here.
 * @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
const metered = [];
try {
  // ── WHAT IS HAPPENING, AND WHAT IT HAS COST, WHILE IT IS STILL HAPPENING ─────
//
// Everything below reports; nothing below governs. The ceiling is enforced where
// it always was — `capStop`, between metered calls, inside the library — and no
// decision anywhere reads these.

/** the run's spend AS OF NOW, shaped exactly like a `makeCostBook().report()` so
 * `costLine` renders it with no second spelling. F6 rides intact: an unpriced
 * call makes `costUsd` null and the known half is reported as a `≥` floor. */
const costSoFar = () => ({ ...tallyCalls(metered), calls: metered.map((c) => ({ ...c })) });

/** the phase the run is inside, for the killed report below. A plain string
 * rather than a stack: the question a killed run has to answer is "where did my
 * money go", and the phase plus the cost line answers it. */
let phase = 'starting';
/** @param {string} name @param {any} [data] */
const onPhase = (name, data = {}) => {
  phase = name;
  // BEST-EFFORT, and deliberately: this is progress reporting on a PAID run, and
  // a full disk or a closed pipe must never take down work that is being paid
  // for. The run's real records (`authored.json`, the crash catch, `author-end`)
  // are all downstream of this and unaffected.
  try {
    console.log(phaseLine(name, data));
    emit('author-phase', { phase: name, ...data });
  } catch { /* a reporter that kills the run it reports on is worse than silence (F70) */ }
};
/** @param {{label: string, costUsd: number|null, unpricedRounds: number}} call */
const onCall = (call) => {
  metered.push({ ...call });
  try {
    const t = tallyCalls(metered);
    console.log(`·   ${call.label} — ${costLine(costSoFar())}`);
    // `costUsd` rides as `null` when the call was unpriced — `?? 0` launders
    // unknown into $0 (F6), and this record is what a killed run is read from.
    emit('author-cost', {
      label: call.label, costUsd: call.costUsd, unpricedRounds: call.unpricedRounds,
      knownUsdSoFar: t.knownUsd, spendCompleteSoFar: t.spendComplete, calls: metered.length,
      ceilingUsd: CEILING_USD,
    });
  } catch { /* see onPhase */ }
};

// ── A KILL LEAVES A BODY, exactly as a crash does ────────────────────────────
//
// SIGINT (the operator's own ^C on a run that looks hung), SIGTERM and SIGHUP
// (a closed terminal, a harness stopping the group) used to end this process
// with the spine holding ONE line — `author-start` — which is byte-for-byte what
// a run still in flight looks like, and with 100% of the spend record dying with
// the process. The paid calls had happened; nothing on disk said so.
//
// SIGKILL is NOT covered and cannot be: it is uncatchable by design, and there
// is no handler to write for it.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    try {
      emit('author-killed', { signal: sig, phase, ...costSoFar() });
      emit('author-end', { outcome: 'killed', signal: sig });
    } catch { /* a killed-handler that crashes destroys its own report (F70) */ }
    console.error(`\nKILLED by ${sig} during ${phase} — spine: author-killed + author-end`);
    console.error(`  spent ${costLine(costSoFar())}`);
    console.error(`  spine ${spineFile}`);
    // RE-RAISED rather than exited: the honest exit code for a signal death is
    // 128+signo, and setting an exit code here — any of them — would report a
    // killed run under a name this runner's vocabulary already spends on
    // something else. The listener is removed first so the default disposition
    // takes it (and so the handler cannot re-enter itself).
    // `appendFileSync` inside `emit` is synchronous, so the record is already on
    // disk before this line runs.
    process.removeAllListeners(sig);
    process.kill(process.pid, sig);
  });
}

// ── THE ONE INTERACTIVE SEAM (PRD item 33 M3 piece 4, step S4) ───────────────
// The confirm turn (`runConfirmTurn`, wired below through `authorCloseForJob`)
// is the ONLY interactive part of this script — the survey, the declaration
// loop and D9's gates are all unattended. `terminal: false` for the same
// reason `run-interview.mjs` uses it (that script's own `nextLine`,
// scripts/run-interview.mjs:142-160): the TTY's own canonical mode already
// gives backspace and echo, and a piped stdin (a scripted session, a test)
// behaves identically either way — this is copied from that idiom rather
// than re-invented.
rl = createInterface({ input: process.stdin, terminal: false });
const rlLines = rl[Symbol.asyncIterator]();
/** @returns {Promise<string|null>} the next line, or null at end of input —
 * the same "input ended" signal `run-interview.mjs`'s own `nextLine` uses. */
const nextLine = async () => {
  const { value, done } = await rlLines.next();
  if (done) { console.log(); return null; }
  // a TTY echoes what a person types; a pipe does not, and a scripted
  // session is being logged by definition — same rule, same reason.
  if (!process.stdin.isTTY) console.log(redactSecrets(String(value)));
  return String(value);
};
/** one free-text answer, possibly several lines; a blank line ends it.
 * `allowBlank` lets the FIRST line be blank — `worseThanBefore`'s "nothing
 * beyond Guardrails" is a legal, non-required answer, unlike every other
 * free-text step below.
 * @param {boolean} allowBlank @returns {Promise<string|null>} */
const readFreeText = async (allowBlank) => {
  /** @type {string[]} */
  const got = [];
  for (;;) {
    process.stdout.write(got.length ? '  … ' : '  > ');
    const l = await nextLine();
    if (l === null) return got.length ? redactSecrets(got.join('\n').trim()) : null;
    if (String(l).trim() === '') { if (got.length || allowBlank) break; continue; }
    got.push(String(l));
  }
  // SCRUBBED AT CAPTURE (same rule as run-interview.mjs's own readAnswer): no
  // raw keystroke reaches anywhere — a prompt, a spine record, a file on
  // disk — by a route that does not go through the one redactor first.
  return redactSecrets(got.join('\n').trim());
};
/** `runConfirmTurn`'s own `ask` seam — one async function from "what's being
 * asked" to the person's answer, or `null` meaning input ended (never a
 * process exit here: this is a library call, and the library decides what a
 * `null` means at each step — `confirm-abandoned` for every kind except the
 * menu's `start-over`, which is a distinct explicit pick).
 * @param {{kind: string, [k: string]: any}} step @returns {Promise<string|null>} */
const ask = async (step) => {
  console.log('');
  if (step.kind === 'worseThanBefore') {
    console.log(step.field.prompt);
    console.log('  (press Enter on a blank line for "nothing beyond Guardrails")');
    return readFreeText(true);
  }
  if (step.kind === 'language') {
    console.log(step.field.prompt);
    for (const c of step.candidates ?? []) console.log(`  · ${c}`);
    return readFreeText(false);
  }
  if (step.kind === 'menu') {
    const p = step.plan ?? {};
    console.log('THE PLAN — read before you pick:');
    console.log(`  goal          ${JSON.stringify(p.goal ?? '')}`);
    console.log('  checks it will compose:');
    for (const c of p.checks ?? []) console.log(`    · ${c}`);
    console.log('  protections (always-on guards, never named in the goal):');
    for (const g of p.protections ?? []) console.log(`    · ${g}`);
    if ((p.notChecked ?? []).length) {
      console.log('  you asked for these, but nothing checks them:');
      for (const n of p.notChecked ?? []) console.log(`    · ${n}`);
    }
    if ((p.questions ?? []).length) {
      console.log('  open questions:');
      for (const q of p.questions ?? []) console.log(`    ? ${q}`);
    }
    const keys = /** @type {(keyof typeof CONFIRM_MENU)[]} */ (Object.keys(CONFIRM_MENU));
    keys.forEach((k, i) => console.log(`  ${i + 1}. ${CONFIRM_MENU[k]}`));
    for (;;) {
      process.stdout.write(`  pick [1-${keys.length} or the word]: `);
      const l = await nextLine();
      if (l === null) return null;
      const raw = String(l).trim().toLowerCase();
      const byIndex = keys[Number(raw) - 1];
      if (byIndex) return byIndex;
      if (/** @type {string[]} */ (keys).includes(raw)) return raw;
      console.log(`  not a choice — type a number 1-${keys.length}, or one of: ${keys.join(', ')}`);
    }
  }
  if (step.kind === 'answer') {
    // F175's open half (2026-09-16): the plan raised a question of its own —
    // "Confirm"/"Type the goal yourself" cannot proceed until it is
    // answered, right here, with no extra model call. A blank line re-asks
    // the same question ("Start over" or "Fix" are the ways out).
    console.log(`Question ${step.index} of ${step.total} the plan raised — it must be answered before the plan can `
      + 'be signed (pick "Start over" or "Fix" instead if you cannot answer it):');
    console.log(`  ? ${step.question}`);
    return readFreeText(false);
  }
  if (step.kind === 'goal') {
    console.log('Type the goal sentence yourself — it REPLACES the drafted one; the checks and protections stand.');
    return readFreeText(false);
  }
  if (step.kind === 'fix') {
    console.log('What should change? Describe the fix — it feeds the next round (up to 2 rounds total).');
    return readFreeText(false);
  }
  return null;
};
/** the confirm turn's OWN model boundary (PRD item 33 M3 ruling 5 addendum) —
 * bound to `CONFIRM_SYSTEM`, never the authoring `generate` above (that one
 * is bound to `AUTHOR_SYSTEM`). Same provider instance, a different system
 * prompt: reusing `generate` would run the wrong system prompt silently. */
const confirmGenerate = makeLoopGenerate(provider, { system: CONFIRM_SYSTEM });

// ── PLAIN-FOLDER SOURCE: A NAMED $0 STOP, NO MODEL CALL (F191; PRD item 33 M3
// piece 4, step S6, D5 amended 2026-09-21) ──────────────────────────────────
// This USED TO run the whole confirm turn first (over a $0 manual listing,
// via `runConfirmTurn`), THEN give this stop once the person confirmed a plan
// — D5's original shape. Live run `mu4hc7sp` (docs/logs/FINDINGS.md F191)
// crashed inside that confirm turn instead: `confirmProtections`
// (`src/authorflow.js`) calls `classGuards` (`src/authoring.js`), which is
// keyed by CODE LANGUAGE and THROWS on a plain folder's `lang:
// 'none-detected'` ("no TYPES genre data for language ...") — a plain folder
// has no language, so the very computation the confirm turn needs to show
// real, code-derived protections (F174's fix) cannot run for one. The crash
// left a two-record spine (`author-start`, `author-phase confirm`) with no
// ending at all.
//
// The fix is not a guard around that crash — it is recognizing D5's premise
// (a plain folder gets a paid confirm turn before the honest "no checks yet"
// stop) is now unreachable by construction: the close catalogue is code-genre
// only, so no confirm turn over a plain folder could ever confirm a plan this
// build can close. The stop fires HERE, immediately, at $0, no scout, no
// confirm turn, no model call — a plain folder's spine is exactly
// `author-start` → `author-end{outcome:'not-authored', stop:'non-code-source'}`.
if (!IS_REPO_SOURCE) {
  const message = "This is a plain folder, not a code project. bareloop can't check this kind of "
    + 'job yet. Nothing was spent. Your source was not changed.';
  console.log(`\n${message}`);
  const red = {
    code: 'request-red', path: 'source', verb: 'non-code-source', lib: 'bareloop',
    detail: `--source ${SOURCE} freezes a "${manifestRead.manifest.kind}" job — the close catalogue is code-genre only today.`,
  };
  emit('job-red', red);
  writeOut('authored.json', { ok: false, confirmed: null, stop: 'non-code-source', cost: null, reds: [red] });
  emit('author-end', { outcome: 'not-authored', stop: 'non-code-source' });
  console.log(`\nspine      ${spineFile}`);
  process.exitCode = 1;
} else {

// ── THE REPO-SHAPED CONTINUATION OF THE SAME TRY THAT OPENED RIGHT AFTER
// `author-start`, above — see that comment for why the net starts there and
// not here. What follows is: a real scout, a real model call, and a real
// toolchain per close stage.
// ── 1. answers → scout → the model fills the form → a close DECLARATION ──────
  // `provider` drives the scout; `generate` is the declaration model boundary (one
  // bare-agent Loop per call, the tool wired to end the call it is used in).
  const authored = await authorCloseForJob({
    // the judge that will certify this close's calibration set, if it composes a
    // judged stage (PRD item 32.1). A DRAFT CAN carry a signed `judge` override
    // already (`judge` is an OPERATOR field, not one of `AUTHORED_SPEC_FIELDS`) —
    // `draftJudge`, resolved once above from the draft's own `provider`/`model`/
    // `judge`, is what the spec will resolve to at run time (`scripts/run-u.mjs`),
    // not this authoring run's own drafting identity.
    judgeModel: draftJudge.model,
    answers,
    verdictType: VERDICT,
    repoPath: SOURCE,
    lang: LANG,
    // the picked class's own frozen set — a LOCKED class never reaches here, it
    // refuses at admission before its questions are ever asked, and asking for a
    // locked set THROWS. Keyed off `LIVE_CLASSES` rather than the literal `green`
    // so admitting a class (softgreen module 3 did exactly that) does not leave
    // this line silently handing its questions back as `null`.
    questions: LIVE_CLASSES.includes(VERDICT) ? questionsFor(VERDICT) : null,
    // Q2 IS GONE (PRD item 33 M3 piece 3) — the operator's own `writeScope`
    // (Destination's proven fence, `run-interview.mjs`) is what tells the
    // composer what may change and what is read-only now; a draft with no
    // fence is not this script's business to invent one for, so an absent or
    // malformed field travels as `null` and `authorPrompt` simply states nothing.
    writeScope: Array.isArray(draft.writeScope) ? draft.writeScope : null,
    provider,
    generate: makeLoopGenerate(provider),
    // ONE number, both paid seams (the survey's and the declaration loop's) — the
    // advertised ceiling and the enforced ceiling are the same ceiling
    ceilingUsd: CEILING_USD,
    // …and the two reporting seams. The library emits nothing itself (the
    // `runJob` → `runPlan` shape): this runner owns the spine and the terminal.
    onPhase, onCall,
    // PRD item 33 M3 piece 4 (step S4) — the confirm turn. `isRepo: true` is
    // safe unconditionally here: the manifest.kind !== 'repo' stop above
    // (before the key is even read) already refused every non-repo source,
    // so every path that reaches this call is a repo job. `langResult`
    // travels through unchanged — its `ambiguous` shape is what the confirm
    // turn's own $0 half (D7) asks about, before the scout.
    ask, confirmGenerate, isRepo: true, langResult,
  });
  const authoredFile = writeOut('authored.json', authored);
  emit('authored', { ok: authored.ok, stop: authored.stop, seedRef: authored.seedRef, cost: authored.cost, reds: authored.reds });

  console.log(`authoring  ${authored.ok ? 'OK' : 'NOT OK'}  stop=${authored.stop ?? 'none'}  seed=${authored.seedRef ?? 'unread'}`);
  console.log(`cost       ${costLine(authored.cost)}`);
  console.log(`written    ${authoredFile}`);
  for (const l of fellBackLines(authored.authoring)) console.log(l);

  // THE CONFIRM TURN'S OWN STOPS (PRD item 33 M3 piece 4, step S4) — neither is
  // a refusal (`authored.refusal` is null on both) and neither is a red
  // (`authored.reds` is empty on both), so without this they would otherwise
  // fall through the generic "no refusal and no reds" line below. `author-end`
  // still records the stop either way (the generic branch further down carries
  // it through `stop: authored.stop` regardless) — this is only the FRIENDLIER
  // console line, said once, in the person's own words.
  if (authored.stop === 'confirm-abandoned' || authored.stop === 'confirm-restart') {
    console.log(`\n${authored.stop.toUpperCase()} — the confirm turn did not produce a signed plan.`);
    console.log(authored.stop === 'confirm-abandoned'
      ? '  input ended before you answered — nothing was signed, nothing runs, and nothing beyond this line is written.'
      : '  you chose to start over — rerun the interview from the beginning with the answers you want to change.');
  }

  // THE GOVERNANCE STOP, read out on BOTH paths. A money stop can land with a
  // signable close already authored and measured (`ok:true` — the cap tripped
  // before a LATER revise), and burying it in that case would let a run that ran
  // out of money read as a run that simply finished. It is not an error and it is
  // not a verdict on the close: nothing retries, nothing is rolled back, and every
  // artifact the run paid for is on disk exactly where it was written.
  if (authored.stop === 'cap-halt' || authored.stop === 'pricing-red') {
    const c = authored.cost ?? {};
    // ONE reading of what this stop MEANS, spent on the console AND on the spine.
    // Two hand-spelled answers is two instruments, and this is exactly the pair
    // that must not disagree: a `cap-halt` says the money is gone, a `pricing-red`
    // says the meter went blind (F6), and they send the operator to different
    // repairs — one raises a number, the other binds a priced provider.
    const meaning = authored.stop === 'cap-halt'
      ? 'not under cap — not "can\'t"' // the shipped vocabulary, spelled the way ralph spells it
      : 'the spend cannot be SEEN, so the ceiling cannot govern it — a blind meter, not a spent wallet (F6)';
    console.log(`\n${authored.stop.toUpperCase()} — the authoring pipeline stopped on the operator's ceiling, not on anything it read`);
    console.log(`  ceiling  $${CEILING_USD}`);
    console.log(`  spent    ${costLine(authored.cost)}`);
    console.log(`  the cap binds BETWEEN calls, so nothing was cut off mid-flight — everything paid for is in ${OUT}`);
    console.log(authored.stop === 'cap-halt'
      ? '  the stop IS the checkpoint: raise --budget and re-run, or read what is here and stop'
      : '  unpriced is never free (F6) — a ceiling that cannot see the spend cannot enforce it, so the run stopped rather than spend blind');
    // THE TYPE IS THE STOP. It used to be the literal 'cap-halt' on both arms, so a
    // `pricing-red` was written down as a cap-halt with its real name demoted to a
    // payload field. Every OTHER emitter in this tree keys the two apart — ralph and
    // planrun emit `type:'cap-halt'` only ever with `category:'cap-halt'`, and a
    // pricing-red rides its own name (run.js's escalation) — so this was the one
    // site in the repo where the type and the category could disagree, and
    // type-keyed slicing is precisely how F45 misread a shared log.
    //
    // Latent, not live: nothing reads the author spine by type today. The nearest
    // reader is `classifyIncidents` (src/ledger.js), which sets `capHalted` on
    // `type === 'cap-halt'` and would therefore have armed the capability-gap fuse
    // — "the run cap-halted" — on a run whose wallet was never empty. Under its own
    // name a pricing-red instead falls through every branch and is simply not
    // counted, which is the FAIL-SAFE direction: uncounted, never miscounted.
    //
    // No falsy type can reach here: the `if` above narrows `authored.stop` to
    // exactly these two strings, so a guard would be speculative code standing over
    // an unreachable case rather than protection.
    emit(authored.stop, {
      category: authored.stop, meaning,
      ceilingUsd: CEILING_USD, spentUsd: c.costUsd ?? null, knownUsd: c.knownUsd ?? null,
      spendComplete: c.spendComplete ?? null,
    });
  }

  if (!authored.ok) {
    // Verbatim, and in full. A refusal is COUNTED demand against bareloop's own
    // catalogue (the `request-red` admission path) — narrating around it destroys
    // the evidence the verdict-classes rung waits on.
    if (authored.refusal) {
      const r = authored.refusal;
      console.log(`\nREFUSED (${r.kind})  verb=${r.verb ?? 'none'}  path=${r.path}`);
      console.log(r.detail);
      for (const o of r.options ?? []) console.log(`  · ${o}`);
      if (r.red) console.log(`  red: ${JSON.stringify(r.red)}`);
      for (const e of refusalEvents(r)) emit(e.type, e);
    }
    for (const red of authored.reds ?? []) {
      console.log(`\nRED ${red.code} at ${red.path}\n${red.detail}`);
      emit('job-red', red);
    }
    if (!authored.refusal && !(authored.reds ?? []).length) console.log(`\nNo refusal and no reds — the stop is "${authored.stop}" on its own (read ${authoredFile}).`);
    console.log(`\nSTOPPED at authoring. Nothing was assembled, nothing was validated, nothing was signed.`);
    emit('author-end', { outcome: 'not-authored', stop: authored.stop });
    process.exitCode = 1;
  } else {
    // PRD item 33 M3, ruling 5 addendum (step S4): the confirm turn drafts the
    // signed goal sentence and the person confirms/fixes it there — the
    // interview's own separate goal question is what this REPLACES (D2's
    // "the confirmed goal replaces it"). `goal` stays an OPERATOR field
    // (D2: it does not join `AUTHORED_SPEC_FIELDS`), so it is set on the
    // DRAFT here, before assembling, exactly where the interview's own
    // answer would otherwise have landed. Absent only if this authoring run
    // predates the confirm turn's own `ask` wiring (`authored.confirmed` is
    // `null` for every caller that runs no confirm turn) — the draft's own
    // goal (if any) then stands untouched.
    if (authored.confirmed?.goal) {
      draft.goal = redactSecrets(String(authored.confirmed.goal));
    }
    // ── 2. the operator's half + the authored half → one spec ──────────────────
    const spec = assembleSpec(draft, authored);
    const specFile = writeOut('resolved-spec.json', spec);
    console.log(`\nverdictType ${authored.verdictType} (the person's own pick, validated — never inferred)`);
    // F87: the goal and the stages that judge it are ONE reading. This surface used to
    // print the declaration alone, which shows a signer everything the close measures
    // and nothing about whether the goal ever said so. Rendered from the RESOLVED spec
    // — the bytes that get hashed — and out of `scripts/author-readout.mjs`, because
    // this block is otherwise reachable only after a paid scout and a paid model call,
    // and a readout no test can reach is a readout nothing checks.
    for (const l of declarationLines(spec)) console.log(l);
    // …and, for a close that JUDGES, the two artifacts the judge is signed with.
    // NAMED DEFERRAL, said out loud rather than implied: this script's ONE
    // interactive seam is the confirm turn above (PRD item 33 M3 piece 4,
    // step S4) — it does not ALSO offer the D5 fix step here, so the
    // proposal is signed AS PROPOSED. The library seam exists
    // (`authorCloseForJob({signerFix})`) and the interactive surface for IT
    // is the interview's and the UI's (N6), which is the same split the
    // guard battery already lives under here: shown, not edited at this surface.
    const rubric = rubricLines(spec);
    if (rubric.length) {
      for (const l of rubric) console.log(l);
      console.log(`  source     ${authored.judged?.source ?? 'unknown'}`
        + (authored.judged?.source === 'proposal' ? '  (proposed and stored unedited — this script offers no fix step)' : ''));
      for (const s of authored.judged?.scrubbed ?? []) console.log(`  MASKED     ${s.path} — the stored bytes differ from what was typed`);
    }
    console.log(`written    ${specFile}`);

    // `shellCapUsd` COUPLES to the spec's own budget, exactly as run-u does it at the
    // launch site. Left off, both gates below judge against validateJob's default
    // ceiling of 2 — a silent second ceiling, and the worst-placed one there is: the
    // draft's `budgetUsd` is the operator's own signed input, so a $4 draft would be
    // paid for in full (interview, scout, declaration) and only THEN redded on a
    // number nobody set. The advertised budget and the enforced budget are the same
    // number; the agent may tighten and never widen, and neither may this script.
    const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
    emit('job-validate', { ok: jv.ok, reds: jv.reds });
    if (!jv.ok) {
      console.log(`\nSPEC INVALID — ${jv.reds.length} red(s):`);
      for (const red of jv.reds) console.log(`  ${red.code} at ${red.path}: ${red.detail}`);
      console.log('\nSTOPPED at validateJob. The draft and the authored close do not compose into a runnable spec.');
      emit('author-end', { outcome: 'spec-invalid' });
      process.exitCode = 1;
    } else {
      // ── 3. D9's gates. Nothing here judges the close; it measures it. ────────
      //
      // THE JUDGE SEAM, wired only when the close actually judges. It is a
      // A SEPARATE provider instance for the judge: its tier is never the
      // drafter's model and never agent-selectable, and §4.2's safety argument is
      // worth exactly as much as the tier its injection evidence was measured on.
      // Absent it, `prepareSigning` refuses the close as a wiring gap rather than
      // signing an ungraded ruler.
      const judges = closeJudges(spec.closeDecl);
      // THE JUDGE, RESOLVED (PRD item 32.1) — the job's OWN worker provider and
      // model by default, a signed `judge` override when the spec names one.
      // Resolved from the ASSEMBLED SPEC through the same `resolveJobJudge` call
      // as `draftJudge` above; `provider`/`model`/`judge` reached here unchanged
      // from the draft, so this is the identical pair — the calibration gate
      // STAMPS the graded set with whatever this resolves to, so the identity
      // that certifies the floor here must be the identity the close will later
      // refuse to grade without (and the identity `scripts/run-u.mjs` resolves).
      const judge = judges
        ? resolveJobJudge(spec, PROVIDER_NAME, resolveWorkerModel)
        : null;
      // F181 — the judge key is required exactly when `judges` is true (this
      // script has no presence check on it today; adding one is out of this
      // finding's scope). What this door DOES owe, the same as the worker
      // key above: a resolved value that IS present but carries a shape an
      // HTTP header cannot refuses here, before the calibration gate spends
      // anything, rather than crashing mid-call.
      if (judges) {
        const judgeKeyValue = judgeKeyFor(judge.provider);
        const judgeKeyProblem = judgeKeyValue ? apiKeyProblem(judgeKeyValue) : null;
        if (judgeKeyProblem) {
          const judgeEnvName = process.env.JUDGE_API_KEY ? 'JUDGE_API_KEY' : resolveProvider(judge.provider).envKey;
          console.error(`${judgeEnvName} ${judgeKeyProblem} — refusing rather than crashing mid-call (never trimmed or repaired; fix the value at its source)`);
          // F186 — the scout above already ran and may have left its own gate
          // audit in the tree; this is a process.exit() path, which skips the
          // finally block below (and the common tail after it), so it is
          // archived here explicitly rather than relying on either.
          archiveGateAudit();
          process.exit(2);
        }
      }
      // F190 — `baseUrl` rides along only when the judge is the SAME provider
      // as the author/worker: a spec's `baseUrl` is the AUTHOR's endpoint, and
      // handing it to a different vendor's client is the silent-misconfiguration
      // class `endpointKey` exists to prevent (a DeepSeek key sent to the
      // openai-api default host, e.g.). Routed through `buildRunnerProviders`
      // (the ONE owner of this construction — `src/cli.js` and, above,
      // this file's own author provider) rather than a hand-rolled
      // `makeProvider` call: the `providerName`/`apiKey`/`model`/`tierModels`/
      // `baseUrl` half repeats the author's own identity (so its `provider`
      // half of the return, unused here, is a throwaway — never a second live
      // instance of the author's client), and the `judge*` half is this run's
      // OWN resolved judge — the identical conditional `scripts/run-u.mjs`'s
      // own call already applies.
      const judgeProvider = judge
        ? buildRunnerProviders({
          providerName: PROVIDER_NAME, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl,
          judgeApiKey: judgeKeyFor(judge.provider), judgeModel: judge.model, judgeProviderName: judge.provider,
          judgeBaseUrl: judge.provider === PROVIDER_NAME ? baseUrl : undefined,
        }).judgeProvider
        : null;
      if (judges) {
        console.log(`\ncalibration gate — REAL judge calls at ${judge.model} on ${judge.provider}, one per case plus the injection battery.`);
        console.log('  this is the only gate that spends money, and it runs after every free one.');
      }
      const signing = await prepareSigning({
        spec, workdir: SOURCE, seedRef: authored.seedRef, timeoutMs: TIMEOUT_MS,
        // gate 1a re-runs the job validator inside prepareSigning — same coupling, or
        // the spec that just passed above would fail the gate that signs it
        shellCapUsd: spec.budgetUsd,
        // …and the SAME operator ceiling the scout and the declaration loop ran under,
        // with everything they spent folded in. The gate is this run's third and
        // largest paid seam; without both halves the advertised budget and the
        // enforced budget are two different numbers, and re-invoking a seam under one
        // number would silently widen it.
        ceilingUsd: CEILING_USD,
        priorCalls: [...metered],
        judgeLoop: judgeProvider ? (o) => defaultJudgeLoop({ provider: judgeProvider, system: o.system }) : null,
        // the seam's other half (PRD item 32.1): the graded set is STAMPED with
        // this, and the close later refuses to grade under any other identity.
        judgeModel: judge?.model ?? null,
        // the gate's spend joins the run's ONE metered list, under the judge call's
        // own label — a close's calibration is money like any other money (F12)
        onJudgeCost: (c) => onCall({ label: `${c.label}:${c.id}`, costUsd: c.costUsd, unpricedRounds: c.unpricedRounds }),
      });
      const signingFile = writeOut('signing.json', signing);
      emit('signing', { ok: signing.ok, specHash: signing.specHash, seedRef: signing.seedRef, gates: signing.gates });

      const g = signing.gates ?? {};
      console.log('\ngates');
      console.log(`  1 declaration  ${g.declaration?.ok ? 'PASS' : 'FAIL'}  grounded=${g.declaration?.grounded ?? '-'}${g.declaration?.scoped ? `  scoped=${JSON.stringify(g.declaration.scoped)}` : ''}`);
      console.log(`  2 precheck     ${g.precheck === null ? 'not reached' : (g.precheck.ok ? 'PASS — every stage ran' : `FAIL — ${g.precheck.stops.length} stage(s) could not run`)}`);
      // ruling 3: the judged-ONLY close clears this gate on its calibration, so the
      // line says PASS and names the proof — printing FAIL beside a signable spec
      // would be the readout disagreeing with the gate it reports on
      console.log(`  3 seed verdict ${g.seedVerdict === null
        ? 'not reached'
        : (g.seedVerdict.ok
          ? `PASS — work red at seed: ${g.seedVerdict.workRed.join(', ')}`
          : (g.seedVerdict.satisfiedBy === 'calibration'
            ? 'PASS via the CALIBRATION gate — this close\'s only work stage is judged'
            : 'FAIL — no work stage is red at the seed'))}`);
      if (g.seedVerdict) {
        console.log(`      red at seed:   ${g.seedVerdict.redAtSeed.join(', ') || '(none)'}`);
        console.log(`      green at seed: ${g.seedVerdict.greenAtSeed.join(', ') || '(none)'}`);
        // ruling 3: a judged-ONLY close clears gate 3 on its calibration instead,
        // and the surface SAYS which proof carried it rather than leaving a reader
        // to wonder why an empty workRed list passed
        if (g.seedVerdict.satisfiedBy === 'calibration') {
          console.log('      a judged stage skips the seed read (ruling 8), so this close\'s proof that it CAN fail is');
          console.log('      the graded calibration set below — signed cases it must red as well as ones it must pass.');
        }
      }
      if (judges) for (const l of calibrationLines(g.calibration)) console.log(l);

      /** the seed evidence a user READS to decide whether this close measures their
       * job. `value`/`baseline` print as `unknown` when absent — never as 0. */
      const row = (/** @type {any} */ r) => {
        console.log(`  ${r.verdict.toUpperCase().padEnd(16)} ${r.stage} [${r.kind}]  value=${r.value ?? 'unknown'}  baseline=${r.baseline ?? 'unknown'}${r.baselineSource ? ` (${r.baselineSource})` : ''}`);
        for (const l of (r.gap ?? []).slice(0, 8)) console.log(`      | ${l}`);
        if ((r.gap ?? []).length > 8) console.log(`      | … ${r.gap.length - 8} more gap line(s) — full text in ${signingFile}`);
      };
      if ((signing.work ?? []).length) { console.log('\nwork stages at the seed'); for (const r of signing.work) row(r); }
      if ((signing.guards ?? []).length) { console.log('\nguard stages at the seed'); for (const r of signing.guards) row(r); }
      if ((signing.stops ?? []).length) { console.log('\nstages that could NOT RUN (a broken instrument is a casualty, never a verdict)'); for (const r of signing.stops) row(r); }

      if (signing.refusal) {
        const r = signing.refusal;
        console.log(`\nREFUSED (${r.kind})  verb=${r.verb ?? 'none'}  path=${r.path}`);
        console.log(r.detail);
        for (const o of r.options ?? []) console.log(`  · ${o}`);
        for (const e of refusalEvents(r)) emit(e.type, e);
      }
      for (const red of signing.reds ?? []) {
        console.log(`\nRED ${red.code} at ${red.path}\n${red.detail}`);
        emit('job-red', red);
      }

      console.log(`\nwritten    ${signingFile}`);
      const hash = jobSpecHash(spec);
      // A hash printed beside a refusal reads like something to sign. It is the
      // record of WHICH bytes were measured, and on a failed gate it says so.
      console.log(`spec hash  ${hash}${signing.ok ? '' : '  (for the record — this spec did NOT clear the gates and is not signable)'}`);
      // The hash prepareSigning returns is over the VALIDATED spec; this one is
      // over the assembled bytes. They are the same object by construction, and a
      // divergence would mean the validator normalized something — say it rather
      // than pick one.
      if (signing.specHash && signing.specHash !== hash) {
        console.log(`  NOTE  prepareSigning hashed ${signing.specHash} — the validator normalized the spec; sign the resolved one.`);
      }
      // THE WHOLE RUN's spend, off the ONE metered list — which now has two
      // populations in it. Gates 1-3 spend no tokens (they run commands); gate 4
      // buys a real judge call per case, so a line saying "the gates spend no
      // tokens" would have been false the moment a judged close reached here.
      console.log(`authoring  ${costLine(authored.cost)}`);
      console.log(`total cost ${costLine(costSoFar())}${judges ? '   (includes the calibration gate\'s judge calls)' : '   (gates 1-3 spend no tokens — they run commands)'}`);

      if (!signing.ok) {
        console.log('\nSIGNING NOT PREPARED — the close did not clear D9\'s gates. Nothing was signed and nothing was run.');
        emit('author-end', { outcome: 'gates-failed', specHash: hash });
        process.exitCode = 1;
      } else {
        console.log('\nSIGNING PREPARED — NOT SIGNED. This script stops here, by design.');
        console.log(`  the resolved spec is ${specFile} and it hashes to ${hash}`);
        console.log('  read the seed evidence above; if the close measures your job, the signature is yours to give.');
        for (const l of openQuestionLines(authored.confirmed)) console.log(`  ${l}`);
        for (const l of answeredQuestionLines(authored.confirmed)) console.log(`  ${l}`);
        // F185 — the loose end this fix closes: until now this screen named no
        // command that actually RUNS the spec it just wrote, so reaching a
        // running job from here needed a developer to hand-add a JOBS row and
        // copy this file into jobs/. scripts/run-u.mjs now accepts `--spec
        // <path>` and reads this SAME prepared copy's own source manifest for
        // the workdir and seed — so the command below is the whole of what a
        // person needs to run their own job, nothing left to hand off.
        // `providerEntry.envKey` (never a hardcoded ANTHROPIC_API_KEY) is the
        // same F187 rule scripts/run-u.mjs's own hint already follows.
        console.log('\nTo run it (the same signature and gates as any other job — nothing here bypasses them):');
        console.log(`  ${providerEntry.envKey}=... node scripts/run-u.mjs --spec ${specFile} --approve ${hash}`);
        emit('author-end', { outcome: 'prepared', specHash: hash });
      }
    }
  }
}
} catch (err) {
  // THE OPERATOR'S COPY FIRST, and whole — the same bytes the unhandled rejection
  // used to print, on the same stream. First because it must not depend on the two
  // writes below succeeding: a diagnosis that reaches the person only if the disk
  // is writable is a diagnosis with a dependency nobody asked for.
  //
  // F191 — the net now starts right after `author-start`, before ANY paid call
  // (the plain-folder stop above spends nothing, ever). "died inside the paid
  // span" was already false for that path and would be false again for any
  // future $0-only stop this net comes to cover — `metered.length` (hoisted
  // above the try for exactly this reason) says which happened, honestly,
  // rather than a fixed claim baked into the message.
  console.error(`\nCRASHED — the authoring run died ${metered.length ? 'inside the paid span' : 'before any paid call'}. Nothing was signed, and nothing was retried.`);
  console.error(err);
  // ...and the spine's copy, through the ONE persist boundary (`crashRecord` →
  // `scrubRaw` → the same `SECRET_PATTERNS` inventory the validator reds on). A
  // stack is exactly the string most likely to carry a live credential out of a
  // process, and this file outlives the run.
  //
  // BEST-EFFORT, and that is the point: a crash handler that crashes destroys the
  // report it was built to make (F70). If the record cannot be built or the append
  // fails, that failure is said out loud and the original error above still stands.
  try {
    emit('author-crash', crashRecord(err));
    // The run ENDED, and it ended a way no other arm ends. `author-end` is the one
    // record that says a run stopped AT ALL, so a crash that omits it leaves a spine
    // that reads as still-running. The detail is NOT repeated here — it is on the
    // `author-crash` record above, because two hand-spelled copies of one fact are
    // two instruments, and this file has already paid once for letting a pair of
    // those disagree (the cap-halt/pricing-red type).
    emit('author-end', { outcome: 'crashed' });
    console.error(`  written to the spine as author-crash + author-end{outcome:'crashed'}`);
  } catch (spineErr) {
    console.error(`  AND THE SPINE COULD NOT BE WRITTEN: ${/** @type {any} */ (spineErr)?.message ?? spineErr}`);
    console.error('  the error above is the only record of this run — copy it before it scrolls');
  }
  console.error(`  spine ${spineFile}`);
  // 4, distinct from 1 (a refusal or a failed gate), 2 (operator/config) and 3 (a
  // leak). A crash is none of those: it is the run failing to reach a verdict at
  // all, and sharing an exit code with a refusal would file a bug as a result.
  process.exitCode = 4;
} finally {
  // `rl.close()` here, not inline at every exit path above: this file has
  // MANY of those (a refusal, a failed gate, a signed readout, a crash), and
  // a reader left open on ANY of them is a process that never lets go of
  // stdin. BEST-EFFORT (F70's rule again) — closing the interactive seam must
  // never take the readout it follows down with it.
  try { rl.close(); } catch { /* see onPhase */ }
  // F186 — same reasoning, same place: EVERY exit path that reaches this
  // finally (a refusal, a failed gate, a signed readout, or the crash catch
  // above) may have run the scout, and the scout's gate audit must never be
  // left in the patient tree for a later run to inherit. archiveGateAudit()
  // is idempotent, so this is safe even on the one path (the judge-key
  // refusal above) that already called it before exiting early.
  archiveGateAudit();
}

// The hard line, on the artifacts this run just wrote. Count and PATH only —
// echoing a matched secret to stdout is the same leak, one hop on.
//
// (discovered live, item 4 of the 2026-09-21 /debrief fix-all-4 batch): a
// crash mid-writeOut can leave a path here naming something that EXISTS but
// is NOT the file this run wrote (e.g. a pre-existing directory the write
// tripped on) — `existsSync` alone is true for a directory, and
// `readFileSync` on one throws EISDIR, uncaught, AFTER the try/catch above
// already handled the real crash — a second, unrelated crash stealing the
// first one's honest report. `statSync(f).isFile()` scopes this scan to
// what was actually written, never what merely exists at that path.
const written = [spineFile, join(OUT, 'authored.json'), join(OUT, 'resolved-spec.json'), join(OUT, 'signing.json')]
  .filter((f) => existsSync(f) && statSync(f).isFile());
const leaks = written.flatMap((f) => scanSecrets(readFileSync(f, 'utf8')).map(() => f));
if (leaks.length) {
  console.log(`\nLEAK: ${leaks.length} secret-shaped string(s) across ${new Set(leaks).size} written file(s) — the hard line is broken; do NOT sign this spec`);
  // distinct from 2 (operator/config) and 1 (a refusal or a failed gate). It also
  // OVERRIDES a 4 set by the crash catch above, deliberately: a secret sitting in a
  // file is the harder line of the two, and the crash keeps both of its own louder
  // channels — the whole error on stderr and its own `author-crash` spine record.
  process.exitCode = 3;
}
console.log(`\nspine      ${spineFile}`);
// F71 — never process.exit() after output: exit() can discard queued stdout and
// produce a clean-looking short readout of a run that said more than that.
