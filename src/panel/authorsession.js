// PANEL-BUILD.md P3 — the chat/authoring session engine. LAYERING LAW
// (PANEL-BUILD.md §2): this file is one more CALLER of the same `src/`
// library functions `bareloop interview`/`bareloop author` already call
// (`src/interviewrun.js`, `src/authorrun.js`) — it mirrors their library
// calls (the same functions, in the same order, with the same $0-before-paid
// discipline), it never drives either script's own readline loop, and it
// never reimplements anything arbiter-territory: `validateJob`,
// `jobSpecHash`, `prepareSigning`'s gates, `checkApproval` all stay in the
// library, called here exactly as `src/authorrun.js` calls them.
//
// WHAT THIS FILE DOES NOT DO: sign anything (`prepareSigning` only PREPARES —
// see its own doc, "it stops at prepareSigning"), spawn a run, or read a
// provider key anywhere but from the injected `env` (never logged, never
// sent to the page — `src/panel/server.js`'s own routes own that boundary).
//
// THE ASK CHANNEL: `runConfirmTurn` (via `authorCloseForJob`) takes one
// interactive seam, `ask(step) -> Promise<string|null>` — `src/authorrun.js`
// backs it with a readline loop over stdin; this backs the IDENTICAL seam
// with an HTTP-driven resolver queue of depth one (`answer()`, called from
// `src/panel/server.js`'s POST routes). Nothing here changes what a step
// means or what an answer does — only where the answer comes from.

import { applyConfiguredKey, judgeRatesFor, keyNameFor, modelChoiceFor, ratesFor, rowsForHome } from '../providerrows.js';
import { ConfigError } from '../config.js';
import {
  mkdirSync, existsSync, writeFileSync, readdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import {
  prepareSource, proveDestination, missingDependencies, looksLikeRepoSource, nearestGitAncestor, nonRepoSourceMessage,
} from '../source.js';
import {
  worktreePath, uncommittedCount, shortHead, removeWorktree,
} from '../worktree.js';
import { detectLanguage } from '../detectlang.js';
import {
  validateJob, jobSpecHash, workflowKey, resolveWorkerModel,
} from '../job.js';
import {
  authorCloseForJob, assembleSpec, AUTHORED_SPEC_FIELDS, CONFIRM_AUTHORED_FIELDS, PLAIN_FOLDER_DEFERRED_FIELDS,
} from '../authorjob.js';
import { prepareSigning } from '../authorjob.js';
import { checkCloseByteSignature } from '../close-integrity.js';
import {
  questionsFor, requiredAnswersFor, makeLoopGenerate, CONFIRM_SYSTEM,
} from '../authorflow.js';
import {
  resolveProvider, buildRunnerProviders, apiKeyProblem,
} from '../providers.js';
import { resolveJobJudge, defaultJudgeLoop } from '../judged.js';
import { closeJudges } from '../kinds.js';
import { redactSecrets } from '../validate.js';
import { tallyCalls } from '../text.js';
import { writeDraftSpend, appendDraftLog } from '../draftspend.js';
import { PLAIN_PROPOSAL_STOPS, proposalStopText, redsRecord } from '../authorreadout.js';
import { runNpmCi, NPM_CI_LOCKS } from '../npminstall.js';

/**
 * THE PROGRESS LIST's one table (hamr 2026-10-04, "one place showing all"): every pipeline step the left Chat panel
 * lists, in the order they first appear, each with a stable id and a plain code-owned label. A step is one line that
 * updates in place (running -> done or failed with its reason); the thread carries only chat turns.
 * @type {Readonly<Record<string, string>>}
 */
export const STEP_LABELS = Object.freeze({
  setup: 'checking setup',
  copy: 'making worktree',
  check: 'checking source',
  install: 'waiting on install',
  reuse: 'reusing signed workflow',
  read: 'reading repo',
  scout: 'scouting repo',
  listing: 'listing files',
  confirm: 'confirming plan',
  draft: 'drafting',
  calibrate: 'calibrating',
  gates: 'checking signing gates',
  hash: 'generating hash',
  signed: 'signed hash',
});

/**
 * The library's own `onPhase(name, ...)` calls (`src/authorjob.js`/`src/authorflow.js`) -> the step each one advances.
 * A phase with no entry leaves the current step as it was.
 * @type {Readonly<Record<string, keyof typeof STEP_LABELS>>}
 */
export const PHASE_STEP = Object.freeze({
  'confirm-language-pick': 'confirm',
  'confirm-round': 'confirm',
  'confirm-done': 'confirm',
  'author-call': 'draft',
  'author-fallback': 'draft',
  'seed-read': 'read',
  'seed-read-done': 'read',
  stage: 'gates',
  seed: 'read',
  scout: 'scout',
  'scout-done': 'scout',
  confirm: 'confirm',
  'confirm-turn-done': 'confirm',
  listing: 'listing',
  'listing-done': 'listing',
  author: 'draft',
  rubric: 'calibrate',
  'rubric-done': 'calibrate',
  'rubric-scrubbed': 'calibrate',
});

/** @typedef {{id: string, label: string, status: 'running'|'done'|'failed', detail: string}} StepLine */

/** @param {StepLine[]} steps @param {string} id the LATEST line carrying this id (the list is a time-ordered log; an id can repeat) */
export function latestStep(steps, id) {
  for (let i = steps.length - 1; i >= 0; i -= 1) if (steps[i].id === id) return steps[i];
  return undefined;
}

/**
 * The progress list is a chronological log of segments (hamr 2026-10-05): starting a different step closes the running
 * line; a step that already has a line and starts again AFTER other steps gets a NEW line appended at the end (the
 * earlier line keeps its status and detail). Existing lines are never moved. Re-starting the step that is still the
 * LAST line just resumes that line.
 * @param {StepLine[]} steps @param {string} id @param {string} [detail] (absent = keep what the line has)
 */
export function advanceSteps(steps, id, detail) {
  for (const x of steps) if (x.status === 'running' && x.id !== id) x.status = 'done';
  const last = steps.at(-1);
  if (last && last.id === id) { last.status = 'running'; if (detail !== undefined) last.detail = detail; return; }
  steps.push({ id, label: STEP_LABELS[id] ?? id, status: 'running', detail: detail ?? '' });
}

/** source-door refusals that come from CHECKING the copied source (the scan/freeze), not from reaching it */
const SOURCE_CHECK_CODES = new Set([
  'source-carries-secret', 'source-env-file', 'source-symlink', 'source-nested-repo', 'source-not-text',
  'source-file-oversize', 'source-changed-after-scan', 'source-untracked-in-repo',
]);

/** the confirm turn's own fixed round cap (`src/authorflow.js`'s
 * `runConfirmTurn`: `for (let round = 1; round <= 2; round += 1)`) — named
 * here, once, rather than re-guessed at every `onPhase('confirm-round')`
 * below. Not itself exported from the library as a named constant (it is
 * the loop bound the confirm turn's own doc calls "D3" / "ruling 5"); this is
 * this file's one place that would need editing if that cap ever changed. */
const CONFIRM_ROUND_CAP = 2;

/**
 * The confirm turn's plan as the chat shows it: ONE owner of the text (hamr, 2026-10-09: the one-blob "Plan: ...
 * Checks: ... Not checked: ..." was unreadable). Each section is a heading on its own line, its content on the next,
 * and a blank line between sections. `#NOT CHECKED:` and `#QUESTIONS:` appear only when there is something to say.
 * The CLI composes its own plan screen (src/authorrun.js) and shares no text with this one.
 * @param {{goal?: string, checks?: string[], notChecked?: string[], questions?: string[]}} p
 * @returns {string}
 */
export function planText(p) {
  const sections = [
    `#PLAN:\n${JSON.stringify(p.goal ?? '')}`,
    `#CHECKS:\n${(p.checks ?? []).join(' · ') || '(none)'}`,
  ];
  if ((p.notChecked ?? []).length) sections.push(`#NOT CHECKED:\n${(p.notChecked ?? []).join(' · ')}`);
  if ((p.questions ?? []).length) sections.push(`#QUESTIONS:\n${(p.questions ?? []).join(' · ')}`);
  sections.push('Sign & run to confirm this plan, or Revise to describe a change.');
  return sections.join('\n\n');
}

/** @param {string} name @returns {boolean} kebab-case slug, same rule `job.js`'s `SLUG_RE` enforces */
function isSlug(name) {
  return typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * `true` when `jobs/<name>.json` already exists in the repo's own jobs/ dir
 * (resolved from THIS module's own on-disk location, never `process.cwd()`,
 * the same rule `src/panel/server.js`'s `jobsDir()` follows) — P3 is new-jobs-
 * only (Q4=A), so a name collision refuses at $0 rather than silently
 * overwriting or authoring a second spec under one name.
 * @param {string} name
 * @param {{jobsDir?: string}} [opts] test seam
 * @returns {boolean}
 */
export function jobNameTaken(name, opts = {}) {
  const dir = opts.jobsDir ?? join(new URL('../../jobs', import.meta.url).pathname);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).includes(`${name}.json`);
  } catch { return false; }
}

/** the form's fields, in card order — what `card.json` stores, verbatim (P5 item 3) */
export const CARD_FIELDS = Object.freeze(['jobName', 'checkType', 'model', 'goal', 'source', 'destination', 'success', 'guardrails', 'judgeExamples', 'capUsd', 'maxWallMs']);

/**
 * Only the form's own fields, nothing else a request body might carry (`startFrom`, stray keys).
 * @param {any} card
 * @returns {Record<string, any>}
 */
export function cardFields(card) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const f of CARD_FIELDS) if (card?.[f] !== undefined) out[f] = card[f];
  return out;
}

/**
 * REUSE WORKFLOW (hamr 2026-10-03, replaces P5 item 3's same-job rule; Model opened 2026-10-04): a reuse card has exactly
 * FIVE open boxes — Source, Destination, Model, $ cap, Time cap — and every other box is the signed workflow, shown greyed and never
 * editable. The page greys them; THIS is what refuses (the server never trusts the page). Changing any locked box
 * is a different job: Clear the card, which drafts.
 */
export const REUSE_OPEN_FIELDS = Object.freeze(['source', 'destination', 'model', 'capUsd', 'maxWallMs']);
/** every card field that is NOT open on a reuse card, in card order */
export const REUSE_LOCKED_FIELDS = Object.freeze(CARD_FIELDS.filter((f) => !REUSE_OPEN_FIELDS.includes(f)));
const REUSE_LABELS = Object.freeze(/** @type {Record<string, string>} */ ({
  jobName: 'Job name', checkType: 'Check type', goal: 'Goal', success: 'Success', guardrails: 'Guardrails', judgeExamples: 'Judge examples',
}));

/**
 * The first LOCKED box on `card` that differs from what the signed workflow prefilled (`origin`), or `null` when
 * every locked box is untouched. Blank and absent read alike; whitespace is not compared.
 * @param {Record<string, any>} card the form as it was submitted
 * @param {Record<string, any>} origin the form as the server prefilled it
 * @returns {string|null} the offending field's label
 */
export function lockedFieldChanged(card, origin) {
  // whitespace is ignored: a one-line <input> drops a goal's newlines, and the signed copy never takes text from the card anyway
  const norm = (/** @type {any} */ v) => (v === undefined || v === null ? '' : (typeof v === 'string' ? v.replace(/\s+/g, '') : v));
  const bad = REUSE_LOCKED_FIELDS.find((f) => norm(card?.[f]) !== norm(origin?.[f]));
  return bad === undefined ? null : (REUSE_LABELS[bad] ?? bad);
}

/**
 * The spec a reuse signs: a COPY of the origin's signed spec with ONLY the open fields set from the card —
 * `writeScope` from Destination, `budgetUsd` from the $ cap, `maxWallMs` from the Time cap (absent when blank), and the
 * worker (`provider`/`baseUrl`/`model`) from the Model Name chosen in Settings > Providers, spelled exactly as normal
 * authoring spells it (`baseUrl` only when the row has one; `model` only when the Name is not the provider's default
 * tier). A RUBRIC (soft-green) origin with no explicit `judge` first has its judge pinned to the ORIGIN's resolved judge
 * identity — the judge must not change because the worker did (`resolveJobJudge`, the one spelling); an explicit
 * `judge` is kept; a deterministic job has no judge to move. Source is not in a spec (it lives beside the run). The copy
 * hashes to a NEW `jobSpecHash` and the SAME `workflowKey` — the caller checks the second after building.
 * @param {any} originSpec
 * @param {Record<string, any>} card
 * @param {readonly import('../providerrows.js').KeyRow[]} [rows] the Settings rows; without them (or without `card.model`) the worker is left as signed
 * @returns {any}
 */
export function buildReuseSpec(originSpec, card, rows) {
  const spec = JSON.parse(JSON.stringify(originSpec));
  spec.writeScope = String(card.destination ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  spec.budgetUsd = card.capUsd;
  if (typeof card.maxWallMs === 'number' && Number.isFinite(card.maxWallMs) && card.maxWallMs > 0) spec.maxWallMs = card.maxWallMs;
  else delete spec.maxWallMs;
  const choice = rows && typeof card.model === 'string' ? modelChoiceFor(rows, card.model) : null;
  if (choice) {
    if (spec.verdictType === 'soft-green' && !spec.judge) spec.judge = resolveJobJudge(originSpec, originSpec.provider ?? choice.provider, resolveWorkerModel);
    const entry = resolveProvider(choice.provider);
    spec.provider = choice.provider;
    if (choice.baseUrl) spec.baseUrl = choice.baseUrl; else delete spec.baseUrl;
    if (choice.name !== entry.tiers.sonnet) spec.model = choice.name; else delete spec.model;
  }
  return spec;
}

/**
 * `$0` validation for a REUSE start: the signed job carries the goal, checks and guardrails, so those boxes are not
 * required here — only what the new session itself needs: a Source, a Destination, a Model that is a Settings Name,
 * and the cap. (The spec built from the open boxes is validated by the route with `validateJob`.)
 * @param {any} card
 * @param {{rows?: readonly import('../providerrows.js').KeyRow[]}} [opts]
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateReuseCard(card, opts = {}) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'missing job card' };
  if (!modelChoiceFor(opts.rows ?? [], card.model)) return { ok: false, error: 'Model must be one of the Names in Settings > Providers' };
  if (typeof card.source !== 'string' || card.source.trim() === '') return { ok: false, error: 'Source is required' };
  if (typeof card.destination !== 'string' || card.destination.trim() === '') return { ok: false, error: 'Destination is required' };
  if (typeof card.capUsd !== 'number' || !Number.isFinite(card.capUsd) || card.capUsd <= 0) {
    return { ok: false, error: '$ cap is required and must be a positive number' };
  }
  return { ok: true };
}

/** A Destination written as an absolute path (POSIX or a Windows drive path). @param {string} destination @returns {boolean} */
const isAbsoluteDestination = (destination) => /^(\/|[a-zA-Z]:[\\/])/.test(destination);

export { nonRepoSourceMessage };

/**
 * The ONE Destination rule for a REPO source (fresh card and Reuse card alike): there Destination is the write fence,
 * relative to the repo, so an absolute path is refused — at $0, before any copy or model call. A FOLDER source (or a
 * source that does not peek as a repo) keeps today's behaviour: its Destination is an absolute output directory.
 * @param {string} destination
 * @param {boolean} isRepoLike `looksLikeRepoSource(card.source)`
 * @returns {string|null} the plain refusal, or null when the Destination is fine
 */
export function repoDestinationProblem(destination, isRepoLike) {
  return isRepoLike && isAbsoluteDestination(destination) ? 'Destination must be a path inside the repo, like src/digest.js' : null;
}

/**
 * `$0` validation of the job card fields the server must check BEFORE it
 * creates a session or spends anything — never inside the async pipeline,
 * so a bad card refuses synchronously, in the same HTTP response.
 * @param {any} card
 * @param {{jobsDir?: string, rows?: readonly import('../providerrows.js').KeyRow[]}} [opts] `rows` = the Settings rows (the Model menu); jobsDir is a server-side test seam — NEVER read off the client card
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateJobCard(card, opts = {}) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'missing job card' };
  const { jobName, checkType, model, goal, source, destination, success, guardrails, capUsd } = card;
  if (!isSlug(jobName)) return { ok: false, error: 'Job name must be a kebab-case slug (letters, digits, dashes)' };
  if (jobNameTaken(jobName, { jobsDir: opts.jobsDir })) {
    return { ok: false, error: `a job named "${jobName}" already exists — P3 is new jobs only (Q4=A)` };
  }
  if (checkType !== 'deterministic' && checkType !== 'rubric') return { ok: false, error: 'Check type must be deterministic or rubric' };
  if (!modelChoiceFor(opts.rows ?? [], model)) return { ok: false, error: 'Model must be one of the Names in Settings > Providers' };
  for (const [field, label] of [[goal, 'Goal'], [source, 'Source'], [destination, 'Destination'], [success, 'Success'], [guardrails, 'Guardrails']]) {
    if (typeof field !== 'string' || field.trim() === '') return { ok: false, error: `${label} is required` };
  }
  if (checkType === 'rubric' && (typeof card.judgeExamples !== 'string' || card.judgeExamples.trim() === '')) {
    return { ok: false, error: 'Judge examples is required for a rubric (soft-green) check type' };
  }
  if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd <= 0) {
    return { ok: false, error: '$ cap is required and must be a positive number' };
  }
  return { ok: true };
}

/**
 * ONE session's engine — created already RUNNING (the caller awaits nothing;
 * the pipeline drives itself, reporting through `state`). `state.pendingAsk`
 * is the ONE thing a person answers next; `answer()`/`send()`/`revise()`/
 * `signPrepare()` are the only ways in.
 * @param {any} card the validated job card (see {@link validateJobCard})
 * @param {{env?: Record<string,string|undefined>, sessionsRoot?: string, home?: string, timeoutMs?: number,
 *   scout?: any, generate?: Function, confirmGenerate?: Function, authorFn?: Function,
 *   prepareSigningFn?: Function, npmCiFn?: Function, reuse?: {spec: any, workflowKey: string}}} [deps] `scout`..`prepareSigningFn` are
 *   TEST SEAMS ONLY — see the note just above where each is read, below. `reuse` (Reuse workflow) is NOT a seam: the
 *   caller (`/api/author/start`) sets it only when the server's own same-job rule held.
 * @returns {any} the session object
 */
export function createSession(card, deps = {}) {
  const env = deps.env ?? process.env;
  const sessionsRoot = deps.sessionsRoot ?? join(process.env.HOME ?? '/tmp', '.config', 'bareloop', 'panel-sessions');
  // config.json lives beside the sessions dir (~/.config/bareloop) unless a home is injected
  const configHome = deps.home ?? dirname(sessionsRoot);
  const timeoutMs = deps.timeoutMs ?? 300_000;
  // TEST SEAMS ONLY (never set by `src/panel/authorroutes.js`'s real caller):
  // override the declaration composer and/or `prepareSigning` itself so a
  // test can drive the REAL confirm turn / ask() channel / revise-round /
  // hash-matching machinery this file owns, without also re-running (and
  // re-proving) `authorClose`'s own composer ladder or `prepareSigning`'s own
  // gates — both already have their own test suites. Absent, both default to
  // the real library functions, exactly as production always runs.
  const authorFnOverride = deps.authorFn ?? null;
  const prepareSigningFn = deps.prepareSigningFn ?? prepareSigning;
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const outDir = join(sessionsRoot, id);
  mkdirSync(outDir, { recursive: true });

  /** @type {any} */
  const state = {
    id,
    // the form as submitted + whether it is a reuse session: a refreshed page re-attaches to a live session from these
    card: cardFields(card),
    reuse: deps.reuse !== undefined,
    messages: /** @type {{role: string, text: string}[]} */ ([]),
    pendingAsk: /** @type {any} */ (null),
    cost: /** @type {any} */ (null),
    revisesLeft: CONFIRM_ROUND_CAP,
    specHash: /** @type {string|null} */ (null),
    resolvedSpecPath: /** @type {string|null} */ (null),
    error: /** @type {string|null} */ (null),
    outDir,
    // draftSpentUsd (hamr's ruling 2026-09-28, "one cap covers drafting +
    // run") — the KNOWN FLOOR of this session's own drafting spend, updated
    // by `onCall` below off the SAME `metered` list `state.cost` already
    // reads (never a second running total). Never $0 when a call came back
    // unpriced (F6: unpriced is never free) — `known` below is the floor
    // either way. `signRun` (src/panel/authorroutes.js) reads this figure
    // straight off `state` to pass `--draft-spent-usd` to `run-u`.
    draftSpentUsd: 0,
    // draftSpendComplete (hamr's ruling 2026-09-28, 2nd addendum) — was the
    // floor above EXACT? Updated alongside `draftSpentUsd` by `onCall` below,
    // off the same `tallyCalls` read `costSoFar()` (src/authorrun.js) uses for
    // this same pipeline's own drafting-spend line — an unpriced OR
    // unpriced-rounds-carrying call flips this false and it never heals.
    // `signRun` reads it to pass `--draft-spend-incomplete` to `run-u`.
    draftSpendComplete: true,
    // the short, human step label the progress indicator shows next to its
    // animated glyph (build item 3) — updated by `onPhase` below and by this
    // file's own top-level phase transitions; never a chat bubble of its own
    // (build item 2: onPhase used to post one, and it read as jargon/
    // duplicate of the refusal that often followed it in the same breath).
    progressLabel: /** @type {string|null} */ (null),
    // the progress list (STEP_LABELS): one entry per pipeline step, updated in place — see stepStart/stepEnd below
    steps: /** @type {{id: string, label: string, status: 'running'|'done'|'failed', detail: string}[]} */ ([]),
  };

  // The drafting LOG's step events (src/draftspend.js, DRAFT_LOG_FILE): after every progress-list change, diff the list
  // against what was already logged and append the start / end / re-open of each line — the ONE writer of step times.
  /** @type {('running'|'ended')[]} */
  const loggedSteps = [];
  const logSteps = () => {
    const at = new Date().toISOString();
    state.steps.forEach((/** @type {any} */ x, no) => {
      if (loggedSteps[no] === undefined) { appendDraftLog(outDir, { kind: 'step-start', no, id: x.id, label: x.label, at }); loggedSteps[no] = 'running'; }
      if (x.status === 'running' && loggedSteps[no] === 'ended') { appendDraftLog(outDir, { kind: 'step-reopen', no, at }); loggedSteps[no] = 'running'; }
      if (x.status !== 'running' && loggedSteps[no] === 'running') { appendDraftLog(outDir, { kind: 'step-end', no, status: x.status, label: x.label, at }); loggedSteps[no] = 'ended'; }
    });
  };

  /** @param {string} id @param {string} [detail] (absent = keep what the step has) start (or restart) a step; whatever step was running is finished */
  const stepStart = (id, detail) => {
    advanceSteps(state.steps, id, detail);
    state.progressLabel = STEP_LABELS[id] ?? id;
    logSteps();
  };
  /** @param {string} id @param {string} detail set a step's latest line's detail without changing its status */
  const stepDetail = (id, detail) => { const x = latestStep(state.steps, id); if (x) x.detail = detail; };
  /** @param {string} id @param {string} label the latest line of `id` reads `label` instead of its table label (the install step: bareloop installing vs the person) */
  const stepLabel = (id, label) => { const x = latestStep(state.steps, id); if (x) x.label = label; };
  /** finish the running step as done (or the latest line of `id`, when given) */
  const stepDone = (id) => { for (const x of state.steps) if (x.status === 'running' && (id === undefined || x.id === id)) x.status = 'done'; logSteps(); };
  /** @param {string} reason the running step (else the last one) fails with the code-owned reason on its own line */
  const stepFail = (reason) => {
    let x = state.steps.find((/** @type {any} */ y) => y.status === 'running');
    if (!x) {
      x = state.steps.at(-1);
      if (!x || x.status === 'failed') { x = { id: 'stopped', label: 'stopped', status: 'running', detail: '' }; state.steps.push(x); }
    }
    x.status = 'failed';
    x.detail = reason;
    logSteps();
  };

  /** @param {'bot'|'you'|'system'} role @param {string} text */
  const say = (role, text) => { state.messages.push({ role, text }); };

  /** @type {((value: string|null) => void)|null} */
  let resolvePending = null;

  /** @type {(() => void)|null} the F182-mirrored install-gap wait's own
   * resolver — a SEPARATE channel from `resolvePending`/`ask()` above (the
   * confirm turn hasn't started yet when this one is live), signalled by
   * `checkDeps()`, below, itself called only from the "Check again" POST
   * route (`src/panel/authorroutes.js`). */
  let resolveDepsCheck = null;
  /** @returns {Promise<void>} resolves once `checkDeps()` is called */
  const waitForDepsCheck = () => new Promise((resolveFn) => { resolveDepsCheck = resolveFn; });

  /**
   * The confirm turn's own `ask` seam — HTTP-backed, depth one. `describe`
   * renders the SAME plain-language prompts `src/authorrun.js`'s own `ask`
   * writes to its terminal, adapted for the chat thread rather than stdout.
   * @param {{kind: string, [k: string]: any}} step
   * @returns {Promise<string|null>}
   */
  const ask = (step) => new Promise((resolveFn) => {
    state.pendingAsk = step;
    resolvePending = resolveFn;
    if (step.kind === 'language') say('bot', `${step.field?.prompt ?? 'Which language is this job about?'} (${(step.candidates ?? []).join(', ')})`);
    else if (step.kind === 'menu') {
      say('bot', planText(step.plan ?? {}));
    } else if (step.kind === 'answer') say('bot', `A question the plan raised (${step.index} of ${step.total}): ${step.question}`);
    else if (step.kind === 'goal') say('bot', 'Type the goal sentence yourself.');
    else if (step.kind === 'fix') say('bot', 'What should change?');
  });

  /** @param {string|null} value @returns {boolean} */
  const answer = (value) => {
    if (!resolvePending) return false;
    const r = resolvePending;
    resolvePending = null;
    state.pendingAsk = null;
    r(value);
    return true;
  };

  /** @param {'menu'|'fix'|'answer'|'language'|'goal'} kind @param {number} timeoutMsInner */
  const waitForPendingKind = async (kind, timeoutMsInner = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMsInner) {
      if (state.pendingAsk?.kind === kind) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 10); });
    }
    return state.pendingAsk?.kind === kind;
  };

  const onPhase = (name, data = {}) => {
    if (name === 'confirm-round' && typeof data.round === 'number') {
      state.revisesLeft = Math.max(0, CONFIRM_ROUND_CAP - (data.round - 1));
    }
    // COLLAPSED INTO THE PROGRESS INDICATOR ONLY (build item 3) — this used
    // to also `say('system', `… ${name}`)`, one jargon chat bubble per
    // library phase (`… confirm-turn-done`, `… seed-read`, …), read back to
    // back with the plain-language refusal that often followed a phase like
    // `confirm-turn-done` in the very next line (build item 2's "the
    // refusal line appears twice"). The thread now carries only what a
    // person needs to read; the step-by-step detail lives in one line.
    // ONE owner of the drafting line's detail (model + cap): the drafting line is started here, by the real author phase
    if (PHASE_STEP[name]) stepStart(PHASE_STEP[name], PHASE_STEP[name] === 'draft' ? `${card.model}, $${card.capUsd.toFixed(2)} cap` : undefined);
    // a drafting call after the first (`author-call` i >= 1, of up to `of + 1`) is a RETRY: the line says so in plain words, so a
    // long silence on call 2 of 3 does not read as a hang. The same one line, relabelled — never a second line.
    if (name === 'author-call' && Number.isInteger(data.i) && data.i >= 1 && Number.isInteger(data.of)) {
      const label = `${STEP_LABELS.draft} (retry ${data.i + 1} of ${data.of + 1})`;
      stepLabel('draft', label);
      state.progressLabel = label;
    }
  };
  // ABANDON (hamr's ruling 2026-10-05): once abandoned the phase is frozen at 'abandoned' — whatever the in-flight
  // run() does afterwards (a late refuse, a phase write) never overwrites it, so the one-at-a-time lock stays released.
  let abandoned = false;
  let phaseValue = 'starting';
  Object.defineProperty(state, 'phase', {
    enumerable: true,
    get: () => phaseValue,
    set: (v) => { if (!abandoned) phaseValue = v; },
  });
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const metered = [];
  const onCall = (call) => {
    metered.push({ label: call.label, costUsd: call.costUsd ?? null, unpricedRounds: call.unpricedRounds ?? 0 });
    // hamr's ruling 2026-09-28 (2nd addendum) — the SAME `tallyCalls` reader
    // `src/authorrun.js`'s own `costSoFar()` uses over this same call-shape
    // list, so this session's floor/complete read can never drift from the
    // CLI author path's: `spendComplete` is false the moment ANY call came
    // back with a null costUsd or a nonzero unpricedRounds (F6), never just
    // costUsd===null alone as this used to read.
    const t = tallyCalls(metered);
    state.cost = t.spendComplete ? `$${t.knownUsd.toFixed(4)}` : `≥$${t.knownUsd.toFixed(4)} (unpriced calls present)`;
    state.draftSpentUsd = t.knownUsd;
    state.draftSpendComplete = t.spendComplete;
    // self-review 2026-10-05 (hamr's ruling A): the figure reaches DISK after every metered call, from this same
    // tally, so an abandoned / refused / restarted session's drafting spend still counts (src/draftspend.js)
    const nowIso = new Date().toISOString();
    draftStartedAt ??= nowIso;
    // the same call, one line in the drafting LOG (the part a run's views show first): the step running right now,
    // the call's label, the drafting model, its cost (null stays null: unpriced is never $0). One owner: this onCall.
    const runningNo = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
    const callNo = runningNo === -1 ? state.steps.length - 1 : runningNo;
    appendDraftLog(outDir, {
      kind: 'call', no: callNo, step: state.steps[callNo]?.id ?? null, label: call.label, model: draftIdentity?.model ?? null,
      costUsd: call.costUsd ?? null, unpricedRounds: call.unpricedRounds ?? 0, at: nowIso,
    });
    try {
      writeDraftSpend(outDir, {
        sessionId: id, spentUsd: t.knownUsd, spendComplete: t.spendComplete, provider: draftIdentity?.provider ?? null,
        baseUrl: draftIdentity?.baseUrl ?? null, model: draftIdentity?.model ?? null, startedAt: draftStartedAt, updatedAt: nowIso,
      });
    } catch { /* money already spent stays in memory for a signed run; a disk fault never stops the draft */ }
  };
  /** @type {string|null} */
  let draftStartedAt = null;
  /** P6 item 1: the worktree this session made in the person's repo (null until made, and again once removed) @type {{repo: string, dir: string}|null} */
  let madeWorktree = null;
  /** a session that ends WITHOUT ever running (refused, errored, abandoned) takes its worktree with it; a signed one keeps it for the run */
  const dropWorktree = () => {
    if (madeWorktree === null) return;
    const w = madeWorktree;
    madeWorktree = null;
    removeWorktree(w.repo, w.dir);
  };
  /** @type {{provider: string, baseUrl: string|null, model: string}|null} the worker the drafting calls ran on, set once the Model Name resolves */
  let draftIdentity = null;

  // A terminal stop is recorded ONCE, on `state` (phase + error) — never also as a chat bubble: the page shows it in the
  // one progress line, so a thread copy was the same refusal a second and third time (hamr's live reuse test 2026-10-04).
  /** @param {string} message @param {string} [phase] */
  const refuse = (message, phase = 'refused') => {
    if (abandoned) return;
    dropWorktree();
    state.phase = phase;
    state.error = message;
    stepFail(message);
  };

  async function run() {
    // ── keys, at $0, before anything is prepared ────────────────────────
    stepStart('setup');
    const keyRows = rowsForHome(configHome);
    const modelChoice = modelChoiceFor(keyRows, card.model);
    if (!modelChoice) { refuse(`Model "${card.model}" is not a Name in Settings > Providers. Stopped — nothing spent.`); return; }
    draftIdentity = { provider: modelChoice.provider, baseUrl: modelChoice.baseUrl ?? null, model: modelChoice.name };
    let providerEntry;
    try { providerEntry = resolveProvider(modelChoice.provider); } catch (e) { refuse(/** @type {Error} */ (e).message); return; }
    // P4a item 4 — the key variable the person picked in Settings stands in for the built-in one
    const keyCfg = keyRows;
    const draftEnv = applyConfiguredKey(env, modelChoice.provider, modelChoice.baseUrl, keyCfg, modelChoice.name);
    const draftKeyName = keyNameFor(modelChoice.provider, modelChoice.baseUrl, keyCfg, modelChoice.name).name;
    const apiKey = draftEnv[providerEntry.envKey];
    if (!apiKey) { refuse(`${draftKeyName} not set. Stopped — nothing spent.`); return; }
    // the customer's own price on this row (USD per 1M in config.json), resolved once here at $0 and
    // handed to every model call this session makes; a bad price refuses, never falls back to the guess
    /** @type {ReturnType<typeof ratesFor>} */
    let draftPrice = null;
    try { draftPrice = ratesFor(modelChoice.provider, modelChoice.baseUrl, keyCfg, modelChoice.name); } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      refuse(`${e.message}. Stopped — nothing spent.`);
      return;
    }
    const keyProblem = apiKeyProblem(apiKey);
    if (keyProblem) { refuse(`${draftKeyName} ${keyProblem}. Stopped — nothing spent.`); return; }

    const verdictType = card.checkType === 'rubric' ? 'soft-green' : 'green';
    const into = join(outDir, 'source-seed');
    const isRepoLike = looksLikeRepoSource(card.source);
    // hamr's ruling B (2026-10-05): ONE rule for both a fresh card and a reuse card, at $0, before the copy and any model call
    const destProblem = repoDestinationProblem(card.destination, isRepoLike);
    if (destProblem !== null) { refuse(destProblem); return; }

    state.phase = 'preparing-source';
    stepStart('copy');
    // P6 item 1 (hamr 2026-10-05, Q1 = A / Q3 = A): a REPO source gets a worktree in the person's own repo, made now at
    // drafting start — `.bareloop/wt/<session id>` at their current commit. Edits they have not committed are not in it,
    // and the progress line says so (a notice, never a refusal).
    const repoRoot = isRepoLike ? nearestGitAncestor(resolve(card.source))?.dir ?? null : null;
    if (repoRoot !== null) {
      const dirty = uncommittedCount(repoRoot);
      if (dirty > 0) {
        stepDetail('copy', `${dirty} uncommitted change(s) in your repo are not in this job — it starts from commit ${shortHead(repoRoot) ?? 'HEAD'}.`);
      }
    }
    // ONE rule for Destination (the same for a fresh card and a reuse card): for a REPO source it is the write fence
    // (writeScope globs, relative to the repo — set into the spec below, never proven as a directory); for a FOLDER source
    // it is an absolute output directory, proven by `prepareSource` -> `proveDestination`. The door routes on a peek at
    // the source; a source that does not peek as a repo (missing path, typo, a linked worktree) would otherwise have its
    // fence read as a directory and refused as "not absolute" — hiding the real problem with the Source. A scope-shaped
    // (relative) Destination is therefore handed to the door only when the source is repo-like.
    const destIsDir = isAbsoluteDestination(card.destination);
    const prep = await prepareSource({
      source: card.source, into, ...(isRepoLike || destIsDir ? { destination: card.destination } : {}),
      ...(repoRoot === null ? {} : { worktree: worktreePath(repoRoot, id) }),
    });
    if (repoRoot !== null && prep.stop === null && prep.manifest?.worktree) madeWorktree = { repo: repoRoot, dir: prep.manifest.worktree };
    if (abandoned) dropWorktree();
    if (prep.stop !== null) {
      // reaching the source and checking it are two lines: a scan/freeze refusal means the copy itself worked
      if (SOURCE_CHECK_CODES.has(/** @type {any} */ (prep).code)) stepStart('check');
      refuse(prep.stop);
      return;
    }
    stepStart('check');

    const IS_REPO_SOURCE = prep.manifest.kind === 'repo';
    let LANG = 'none-detected';
    /** @type {any} */
    let langResult = null;
    if (IS_REPO_SOURCE) {
      langResult = detectLanguage(prep.tree);
      if (langResult.kind === 'language-unsupported') {
        refuse(`${langResult.refusal.detail}`);
        return;
      }
      LANG = langResult.kind === 'resolved' ? langResult.lang : (langResult.kind === 'ambiguous' ? langResult.candidates[0] : 'none-detected');

      // ── the install gap, WAITED FOR, never a dead end (build item 1,
      // mirroring F182's fix in `src/interviewrun.js`) ── the tree this
      // session works from (`prep.tree`) is the job's own WORKTREE (P6 item 1:
      // a detached checkout of the person's current commit, inside their
      // repo), so a JS/TS repo's tree never carries `node_modules` until
      // someone installs there. Refusing outright here was ITSELF the F182
      // class of bug one layer up. For an npm lock file bareloop
      // runs `npm ci --ignore-scripts` itself first (P6 item 3, below); any other
      // gap (or a failed install) waits on the person: this re-checks the SAME
      // worktree on demand, via the "Check again" button (`checkDeps()`, below),
      // instead of ending the session.
      let depsGap = missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '');
      // P6 item 3: a committed npm lock file -> bareloop runs `npm ci --ignore-scripts` itself, $0, before
      // any model call. Any failure (or another lock file) falls through to the wait below, unchanged.
      /** @type {string|null} */
      let installFailed = null;
      if (depsGap && depsGap.lockFile && NPM_CI_LOCKS.includes(depsGap.lockFile)) {
        stepStart('install', 'Installing packages (npm ci)…');
        stepLabel('install', 'installing packages');
        state.progressLabel = 'installing packages';
        const ci = await (deps.npmCiFn ?? runNpmCi)(depsGap.dir, {});
        if (ci.ok) {
          depsGap = missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '');
          if (!depsGap) {
            stepDetail('install', 'Installed packages (npm ci).');
            stepDone('install');
            stepStart('check');
          } else installFailed = 'it ran but node_modules is still missing';
        } else installFailed = ci.reason;
      }
      if (depsGap) {
        state.phase = 'install-needed';
        stepLabel('install', STEP_LABELS.install); // the person is the one installing now
        stepStart('install', `${installFailed ? `Installing packages (npm ci) failed: ${redactSecrets(installFailed)}. ` : ''}Packages missing in the job's worktree. Run: cd ${prep.tree} && ${depsGap.command}`);
        for (;;) {
          state.pendingAsk = { kind: 'install-needed', tree: prep.tree, command: depsGap.command, reason: depsGap.reason };
          // eslint-disable-next-line no-await-in-loop
          await waitForDepsCheck();
          state.pendingAsk = null;
          depsGap = missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '');
          if (!depsGap) break;
          stepDetail('install', `Still missing (${depsGap.reason}). Install, then Check again. Run: cd ${prep.tree} && ${depsGap.command}`);
        }
        stepDone('install');
        stepStart('check');
        state.phase = 'drafting';
      }
    }
    if (!IS_REPO_SOURCE) {
      refuse(nonRepoSourceMessage(prep.manifest.kind));
      return;
    }

    /**
     * The signing half — shared by the drafted path and the same-job path: write the resolved spec, check it,
     * run signing gates 1–3 (gate 4 only for a rubric), and land in `prepared`. `seedRef` null = the gates resolve
     * the seed themselves.
     * @param {any} spec @param {string|null} seedRef
     */
    const finish = async (spec, seedRef) => {
      if (abandoned) return;
      const specFile = join(outDir, 'resolved-spec.json');
      writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
      state.resolvedSpecPath = specFile;

      const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
      if (!jv.ok) {
        refuse(`spec-invalid: ${jv.reds.map((r) => r.code).join(', ')}`);
        return;
      }

      // An operator-written COMMAND close (an imported job's) has no declaration to ground: `prepareSigning` refuses it
      // by design ("its stages are signed as written"). Its gate here is the byte signature of every close script —
      // checked now, and again by the engine at run start and before every close run — and the hash the person signs
      // is the spec's own, exactly as `bareloop run <bundle>` signs the bundle's. Nothing about the close is judged.
      if (!spec.closeDecl) {
        const bytes = checkCloseByteSignature(spec, outDir);
        if (!bytes.ok) {
          refuse(`a close script does not match its signed bytes (${bytes.reds.map((r) => r.stage).join(', ')}) — refusing to sign`);
          return;
        }
        const hash = jobSpecHash(spec);
        writeFileSync(join(outDir, 'signing.json'), `${JSON.stringify({
          ok: true, specHash: hash, note: 'command close — signed as written; close script bytes verified', gates: { closeBytes: { ok: true } },
        }, null, 2)}\n`);
        state.specHash = hash;
        writeFileSync(join(outDir, 'card.json'), `${JSON.stringify(cardFields(card), null, 2)}\n`);
        state.phase = 'prepared';
        stepStart('hash', `spec hash ${hash}`);
        stepDone();
        return;
      }

      state.phase = 'signing-gates';
      stepStart('gates', 'gates 1–3 cost $0; gate 4 only for a rubric');
      const judges = closeJudges(spec.closeDecl);
      const judge = judges ? resolveJobJudge(spec, modelChoice.provider, resolveWorkerModel) : null;
      let judgeProvider = null;
      /** @type {ReturnType<typeof ratesFor>} */
      let judgePrice = null;
      if (judge) {
        try {
          judgePrice = judgeRatesFor(judge, modelChoice.provider, modelChoice.baseUrl, draftPrice, keyCfg);
        } catch (e) {
          if (!(e instanceof ConfigError)) throw e;
          refuse(`${e.message} — refusing before gate 4 spends anything`);
          return;
        }
        const judgeKeyValue = env.JUDGE_API_KEY ?? (judge.provider === modelChoice.provider ? draftEnv : applyConfiguredKey(env, judge.provider, undefined, keyCfg, judge.model))[resolveProvider(judge.provider).envKey];
        const judgeKeyProblem = judgeKeyValue ? apiKeyProblem(judgeKeyValue) : null;
        if (!judgeKeyValue || judgeKeyProblem) {
          refuse(`the judge key is not usable (${judgeKeyProblem ?? 'not set'}) — refusing before gate 4 spends anything`);
          return;
        }
        judgeProvider = buildRunnerProviders({
          providerName: modelChoice.provider, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl: modelChoice.baseUrl,
          judgeApiKey: judgeKeyValue, judgeModel: judge.model, judgeProviderName: judge.provider,
          judgeBaseUrl: judge.provider === modelChoice.provider ? modelChoice.baseUrl : undefined,
        }).judgeProvider;
      }
      const signing = await prepareSigningFn({
        spec, workdir: prep.tree, seedRef: seedRef, timeoutMs,
        shellCapUsd: spec.budgetUsd, ceilingUsd: card.capUsd, priorCalls: [...metered],
        judgeLoop: judgeProvider ? (o) => defaultJudgeLoop({ provider: judgeProvider, system: o.system, rates: judgePrice?.rates ?? null }) : null,
        judgeModel: judge?.model ?? null,
        onJudgeCost: (c) => onCall({ label: `${c.label}:${c.id}`, costUsd: c.costUsd, unpricedRounds: c.unpricedRounds }),
      });
      const signingFile = join(outDir, 'signing.json');
      writeFileSync(signingFile, `${JSON.stringify(signing, null, 2)}\n`);

      if (!signing.ok) {
        refuse(`signing gates failed — ${signing.reds.map((r) => r.code).join(', ') || 'no work red at seed'}`);
        return;
      }
      state.specHash = signing.specHash;
      // P5 item 3 — the form text, VERBATIM, beside the resolved spec: what "Start from this" prefills from.
      // Written at sign-prepare (the session reached `prepared`), only by sessions created from now on.
      writeFileSync(join(outDir, 'card.json'), `${JSON.stringify(cardFields(card), null, 2)}\n`);
      state.phase = 'prepared';
      stepStart('hash', `spec hash ${signing.specHash}`);
      stepDone();
    };
    // REUSE WORKFLOW: the route hands in a COPY of the origin's signed spec with only the four open boxes set (see
    // `buildReuseSpec`). No scout, no draft, no confirm turn: $0 of drafting. The signing gates still run against THIS
    // session's fresh copy of the source (gates 1-3 are $0; a rubric's gate 4 is the only spend). The jobSpecHash is
    // NEW (the caps and fence are in it); the workflowKey must be the origin's — a spec that drifted past the open
    // fields is refused, never signed. The person's click on Sign & run is the signature, as for any job.
    const MODEL = modelChoice.name;
    if (deps.reuse) {
      state.phase = 'drafting';
      stepStart('reuse', 'drafting skipped ($0)');
      const reused = JSON.parse(JSON.stringify(deps.reuse.spec));
      if (workflowKey(reused) !== deps.reuse.workflowKey) {
        refuse('the reused spec is not the signed workflow (more than Source, Destination and the caps differ) — refusing');
        return;
      }
      await finish(reused, null);
      return;
    }

    const writeScope = card.destination.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    /** @type {any} the confirm turn (below) fills `goal` in once accepted —
     * declared loosely rather than typed field-by-field, since this object's
     * own shape is a `job-v1` draft `validateJob` itself is the real
     * authority on, not a second hand-typed interface here. */
    const draft = {
      schema: 'job-v1',
      job: card.jobName,
      description: `${card.jobName} — authored through the bareloop panel (${verdictType}, ${LANG})`,
      provider: modelChoice.provider,
      ...(modelChoice.baseUrl ? { baseUrl: modelChoice.baseUrl } : {}),
      // the Name is the model id: signed into the spec only when it is not the provider's own default
      ...(modelChoice.name !== providerEntry.tiers.sonnet ? { model: modelChoice.name } : {}),
      cadence: { unit: 'day', every: 1 },
      budgetUsd: card.capUsd,
      ...(typeof card.maxWallMs === 'number' ? { maxWallMs: card.maxWallMs } : {}),
      writeScope,
      escalation: { mode: 'decision-ready' },
    };
    const draftReds = validateJob(draft, { shellCapUsd: draft.budgetUsd }).reds
      .filter((r) => ![...AUTHORED_SPEC_FIELDS, ...CONFIRM_AUTHORED_FIELDS, ...PLAIN_FOLDER_DEFERRED_FIELDS]
        .some((f) => String(r.path) === f || String(r.path).startsWith(`${f}.`)));
    if (draftReds.length) {
      refuse(`the spec draft does not validate — ${draftReds.map((r) => `${r.code} at ${r.path}`).join('; ')}`);
      return;
    }

    /** @type {Record<string, string>} */
    const answers = { 1: card.goal, 2: card.success, 3: card.guardrails };
    if (verdictType === 'soft-green') answers[4] = card.judgeExamples;
    const required = requiredAnswersFor(verdictType);
    for (const n of required) {
      if (!answers[n]) { refuse(`the ${verdictType} check type needs ${required.length} answers and one is missing (key ${n})`); return; }
    }

    const draftJudge = (() => {
      try { return resolveJobJudge(draft, modelChoice.provider, resolveWorkerModel); } catch { return { provider: modelChoice.provider, model: providerEntry.tiers.sonnet }; }
    })();
    const { provider } = buildRunnerProviders({
      providerName: modelChoice.provider, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl: modelChoice.baseUrl,
      judgeApiKey: apiKey, judgeModel: MODEL, judgeProviderName: modelChoice.provider, judgeBaseUrl: modelChoice.baseUrl,
    });
    // TEST SEAMS (see the constructor's own note): a test overrides
    // `generate`/`confirmGenerate` directly (bypassing this real, constructed
    // `provider` for the model boundary) and/or `scout` (bypassing the real
    // paid scout) so it can drive the REAL confirm turn/ask()/revise/hash
    // machinery below with a deterministic fake, never a live provider call.
    // no NEW model call starts after an abandon; a call already in flight books its usage via onCall and is discarded
    const noCallAfterAbandon = (fn) => (...a) => { if (abandoned) throw new Error('abandoned — no new model call'); return fn(...a); };
    const generate = noCallAfterAbandon(deps.generate ?? makeLoopGenerate(provider, { rates: draftPrice?.rates ?? null }));
    const confirmGenerate = noCallAfterAbandon(deps.confirmGenerate ?? makeLoopGenerate(provider, { system: CONFIRM_SYSTEM, rates: draftPrice?.rates ?? null }));

    state.phase = 'drafting';
    // no early "drafting" line: the real author phase (PHASE_STEP) starts it, carrying draftDetail (see onPhase)
    // build item 4 — the DISPLAY id (card.model, e.g. "deepseek-flash"), not
    // the internal resolved tier model string (MODEL) or the raw provider
    // name — the same id the Model field's own dropdown showed.
    const authored = await authorCloseForJob({
      judgeModel: draftJudge.model,
      answers, verdictType, repoPath: prep.tree, lang: LANG,
      questions: questionsFor(verdictType),
      writeScope, provider, generate,
      ceilingUsd: card.capUsd,
      rates: draftPrice?.rates ?? null,
      onPhase, onCall,
      ask, confirmGenerate, isRepo: true, langResult,
      ...(deps.scout ? { scout: deps.scout } : {}),
      ...(authorFnOverride ? { authorFn: authorFnOverride } : {}),
    });

    if (!authored.ok && PLAIN_PROPOSAL_STOPS.includes(String(authored.stop))) {
      // a refused rubric proposal: the person gets the reason in plain words (src/authorreadout.js, the one owner the
      // CLI prints too), and the full reds go into the drafting log on the failed step so the cause survives the session
      const cases = authored.judged?.signed?.cases ?? authored.judged?.proposal?.proposal?.cases ?? null;
      const reds = authored.reds ?? [];
      const runningNo = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
      appendDraftLog(outDir, {
        kind: 'step-reds', no: runningNo === -1 ? state.steps.length - 1 : runningNo, stop: authored.stop,
        reds: redsRecord(reds, { cases }), at: new Date().toISOString(),
      });
      refuse(proposalStopText({
        stop: String(authored.stop), reds, cases,
        spend: { knownUsd: state.draftSpentUsd, spendComplete: state.draftSpendComplete },
        source: authored.judged?.source === 'signer' ? 'signer' : 'proposal',
      }));
      return;
    }
    if (!authored.ok) {
      refuse(`Stopped: ${authored.stop ?? 'authoring-failed'}${authored.refusal ? ` — ${authored.refusal.detail}` : ''}`, authored.stop === 'confirm-abandoned' ? 'abandoned' : 'refused');
      return;
    }

    if (authored.confirmed?.goal) draft.goal = redactSecrets(String(authored.confirmed.goal));
    const spec = assembleSpec(draft, { ...authored, verdictType: /** @type {string} */ (authored.verdictType) });
    await finish(spec, authored.seedRef);
  }

  // fire-and-forget — the caller (src/panel/server.js) never awaits this; it
  // polls `state` instead. A crash anywhere in `run()` is caught here so it
  // can never take the panel server process down with it.
  run().catch((e) => {
    refuse(`internal error: ${/** @type {Error} */ (e)?.message ?? String(e)}`, 'error');
  });

  return {
    id,
    state,
    /** @param {string} text */
    send: (text) => {
      if (!state.pendingAsk) return { ok: false, error: 'nothing is being asked right now' };
      if (state.pendingAsk.kind === 'menu') return { ok: false, error: 'use Sign & run or Revise for a plan, never Send — the chat can never sign or pick a plan action' };
      if (state.pendingAsk.kind === 'install-needed') return { ok: false, error: 'install the packages, then click Check again — nothing to send here' };
      say('you', text);
      answer(text);
      return { ok: true };
    },
    /** The Abandon button (hamr's ruling 2026-10-05): ends a LIVE, unsigned session. Spend already booked stays booked
     * (`draftSpentUsd`/`cost` are never touched); the phase freezes at 'abandoned' (a TERMINAL phase, so the
     * one-at-a-time lock releases); a parked ask or install wait is released so the run unwinds. */
    abandon: () => {
      if (['refused', 'abandoned', 'error', 'signed', 'signing-failed'].includes(state.phase)) return { ok: false, error: 'this session is not live — nothing to abandon' };
      abandoned = true;
      phaseValue = 'abandoned';
      dropWorktree();
      state.error = 'Abandoned by you — money already spent stays booked.';
      state.pendingAsk = null;
      if (resolvePending) { const r = resolvePending; resolvePending = null; r(null); }
      if (resolveDepsCheck) { const r = resolveDepsCheck; resolveDepsCheck = null; r(); }
      return { ok: true };
    },
    /** the [Check again] button — re-runs the SAME `missingDependencies`
     * check on the SAME copy, never a second install of its own. */
    checkDeps: () => {
      if (state.phase !== 'install-needed' || !resolveDepsCheck) return { ok: false, error: 'not waiting on an install check right now' };
      const r = resolveDepsCheck;
      resolveDepsCheck = null;
      r();
      return { ok: true };
    },
    /** @param {string} text */
    revise: async (text) => {
      if (!state.pendingAsk || state.pendingAsk.kind !== 'menu') return { ok: false, error: 'no plan is waiting for a Revise right now' };
      if (state.revisesLeft <= 0) return { ok: false, error: 'no revises left (D3: max 2 rounds)' };
      answer('fix');
      const reached = await waitForPendingKind('fix', 3000);
      if (!reached) return { ok: false, error: 'the confirm turn did not ask for a fix in time' };
      say('you', text);
      answer(text);
      return { ok: true };
    },
    /** click 1 — the confirm pick. Never signs on its own. */
    signPrepare: () => {
      if (!state.pendingAsk || state.pendingAsk.kind !== 'menu') return { ok: false, error: 'no plan is waiting for a decision right now' };
      answer('confirm');
      return { ok: true };
    },
  };
}
