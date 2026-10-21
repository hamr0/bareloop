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

import { judgePick, judgeRatesFor, judgeRowFor, keyValueOf, modelChoiceFor, ratesOfLine, rowsForHome } from '../providerrows.js';
import { ConfigError } from '../config.js';
import {
  mkdirSync, existsSync, writeFileSync, readdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import {
  prepareSource, proveDestination, proveRubricInputs, looksLikeRubricInput, missingDependencies, looksLikeRepoSource, nearestGitAncestor, nonRepoSourceMessage,
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
  questionsFor, requiredAnswersFor, makeLoopGenerate, CONFIRM_SYSTEM, SOFTGREEN_JUDGE_EXAMPLES_KEY,
} from '../authorflow.js';
import {
  resolveProvider, buildRunnerProviders, apiKeyProblem,
} from '../providers.js';
import { resolveJobJudge, defaultJudgeLoop } from '../judged.js';
import { assertThinkingMode, thinkingPlanFor, thinkingRowText } from '../thinking.js';
import { closeJudges } from '../kinds.js';
import { RUBRIC_LANG } from '../authoring.js';
import { rubricGoal, reconcileRubricPlan } from '../rubricstep.js';
import { redactSecrets } from '../validate.js';
import { isDropIt, isAgree } from '../pagemap.js';
import { FIT_ABSENT_NOTE } from '../fitcheck.js';
import { tallyCalls } from '../text.js';
import { writeDraftSpend, appendDraftLog } from '../draftspend.js';
import { PLAIN_PROPOSAL_STOPS, proposalStopText, signingStopText, draftStopText, redsRecord, declarationRecord, calibrationSummary, tryRefusedText } from '../authorreadout.js';
import { runNpmCi, NPM_CI_LOCKS } from '../npminstall.js';
import {
  parseJobBlock, parseInputs, jobBlockFitsCheck, renderJobLines, renderExamples, signedJobLines,
} from '../jobblock.js';
import { planFromConfirm } from './jobplan.js';

/**
 * THE PROGRESS LIST's one table (hamr 2026-10-04, "one place showing all"): every pipeline step the left Chat panel
 * lists, in the order they first appear, each with a stable id and a plain code-owned label. A step is one line that
 * updates in place (running -> done or failed with its reason); the thread carries only chat turns.
 * @type {Readonly<Record<string, string>>}
 */
export const STEP_LABELS = Object.freeze({
  thinking: 'thinking',
  setup: 'checking setup',
  copy: 'making worktree',
  check: 'checking source',
  install: 'waiting on install',
  reuse: 'reusing signed workflow',
  read: 'reading repo',
  scout: 'scouting repo',
  look: 'looking at your input',
  listing: 'listing files',
  confirm: 'confirming plan',
  draft: 'drafting',
  calibrate: 'calibrating',
  gates: 'checking signing gates',
  hash: 'generating hash',
  signed: 'signed hash',
  fetching: 'fetching the page…',
});

/**
 * The same steps, worded for a job on the person's own local FILES (Part 1a): there is no worktree and no repo to read.
 * Code-owned, one table beside STEP_LABELS; a step with no entry keeps its STEP_LABELS word.
 * @type {Readonly<Record<string, string>>}
 */
export const FILE_JOB_STEP_LABELS = Object.freeze({
  copy: 'copying input files',
  read: 'reading input files',
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
  look: 'look',
  'look-done': 'look',
  // F243: the fit check's one call is counted in the look's line, like the look
  'fit-check': 'look',
  'fit-check-done': 'look',
  confirm: 'confirm',
  'confirm-turn-done': 'confirm',
  listing: 'listing',
  'listing-done': 'listing',
  author: 'draft',
  rubric: 'calibrate',
  'rubric-done': 'calibrate',
  'rubric-scrubbed': 'calibrate',
});

export { thinkingRowText };

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
 * @param {Readonly<Record<string, string>>} [labels] the label table (a file job passes its own)
 */
export function advanceSteps(steps, id, detail, labels = STEP_LABELS) {
  for (const x of steps) if (x.status === 'running' && x.id !== id) x.status = 'done';
  const last = steps.at(-1);
  if (last && last.id === id) { last.status = 'running'; if (detail !== undefined) last.detail = detail; return; }
  steps.push({ id, label: labels[id] ?? id, status: 'running', detail: detail ?? '' });
}

/** source-door refusals that come from CHECKING the copied source (the scan/freeze), not from reaching it */
const SOURCE_CHECK_CODES = new Set([
  'source-carries-secret', 'source-env-file', 'source-symlink', 'source-nested-repo', 'source-not-text',
  'source-file-oversize', 'source-changed-after-scan', 'source-untracked-in-repo',
]);

/** the line under the plan bubble, in plain words (the bubble itself is drawn by the page's one `renderJobPlan`) */
export const PLAN_FOOTER = 'Sign & run to confirm this plan, or Revise to edit the boxes and draft again.';

/**
 * The confirm turn's plan as a chat message (P7): a STRUCTURED `{role:'bot', kind:'plan', plan}` the page draws with the
 * same renderer the Job tab uses — each numbered job line, its `~` rule, its drafted checks folded; the AI's own "not
 * checked"; the always-on guards. `questions` (what the plan still asks) ride inside the plan. One owner of the shape.
 * @param {{goal?: string, checks?: string[], checkItems?: {text: string, fromLine: number[]|null}[], notChecked?: string[], questions?: string[], protections?: string[]}} p the confirm turn's plan
 * @param {{n: number, text: string, rule: string}[]|null} jobLines
 * @returns {{role: 'bot', kind: 'plan', text: string, plan: ReturnType<typeof planFromConfirm> & {goal: string, questions: string[]}}}
 */
export function planMessage(p, jobLines) {
  return {
    role: 'bot', kind: 'plan', text: PLAN_FOOTER,
    plan: { ...planFromConfirm(jobLines, p), goal: String(p.goal ?? ''), questions: [...(p.questions ?? [])] },
  };
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

/**
 * The next free name for a NEW workflow made from `origin` (RULED 2026-10-15, v1.101): `<base>-N`, N the next free number from 2.
 * Base: when the origin ends in `-<digits>` AND the part before it is itself a job (in the run list or jobs/), that part (so `x-2`
 * suggests `x-3`, never `x-2-2`); else the origin's own name. Free = not a run-list job and not {@link jobNameTaken}.
 * @param {string} origin
 * @param {Iterable<string>} runJobs job names in the panel's run list
 * @param {{jobsDir?: string}} [opts] test seam for {@link jobNameTaken}
 * @returns {string}
 */
export function nextFreeJobName(origin, runJobs, opts = {}) {
  const used = new Set(runJobs);
  const m = /^(.+)-\d+$/.exec(origin);
  const base = m && (used.has(m[1]) || jobNameTaken(m[1], opts)) ? m[1] : origin;
  for (let n = 2; ; n += 1) {
    const name = `${base}-${n}`;
    if (!used.has(name) && !jobNameTaken(name, opts)) return name;
  }
}

/** the form's fields, in card order — what `card.json` stores, verbatim (P5 item 3) */
export const CARD_FIELDS = Object.freeze(['jobName', 'checkType', 'provider', 'model', 'thinking', 'jobText', 'inputs', 'destination', 'capUsd', 'maxWallMs']);

/**
 * The repo a card names: Inputs line 1 (P7 — the Source box is gone; the first input IS the repo). `''` when the Inputs
 * box does not parse (the card validator refuses that before anything uses this).
 * @param {any} card
 * @returns {string}
 */
export function cardSource(card) {
  const p = parseInputs(card?.inputs);
  return p.ok ? p.inputs[0].value : '';
}

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
 * REUSE WORKFLOW, ONE DOOR (RULED 2026-10-15, v1.101; replaces v1.88's five open boxes). Every box on the card is open. What decides
 * the path is the CARD compared with the origin run's card, never the drafted spec: the JOB boxes are the job text (numbered lines,
 * `~` rules, `~ PASS`/`~ FAIL`), the check type and the thinking tick. The RUN boxes (Inputs, Destination, Model, $ cap, Time cap)
 * never decide it. A green origin with no job box changed reuses the signed plan verbatim (no drafting); anything else drafts.
 */
export const JOB_BOXES = Object.freeze(['jobText', 'checkType', 'thinking']);

/**
 * Did any JOB box on `card` change from what the origin run prefilled (`origin`)? Whitespace is not compared (a one-line input drops
 * a text's newlines); an absent thinking tick reads as off.
 * @param {Record<string, any>} card the form as it was submitted
 * @param {Record<string, any>} origin the form as the server prefilled it
 * @returns {boolean}
 */
export function jobBoxesChanged(card, origin) {
  const text = (/** @type {any} */ v) => (typeof v === 'string' ? v.replace(/\s+/g, '') : '');
  return text(card?.jobText) !== text(origin?.jobText)
    || (card?.checkType === 'rubric') !== (origin?.checkType === 'rubric')
    || (card?.thinking === true) !== (origin?.thinking === true);
}

/**
 * The spec a reuse signs: a COPY of the origin's signed spec with ONLY the open fields set from the card —
 * `writeScope` from Destination, `inputs` from the Inputs box (P7), `budgetUsd` from the $ cap, `maxWallMs` from the Time cap (absent when blank), and the
 * worker (`provider`/`baseUrl`/`model`) from the Model Name chosen in Settings > Providers, spelled exactly as normal
 * authoring spells it (`baseUrl` only when the row has one; `model` only when the Name is not the provider's default
 * tier). A RUBRIC (soft-green) origin with no explicit `judge` first has its judge pinned to the ORIGIN's resolved judge
 * identity — the judge must not change because the worker did (`resolveJobJudge`, the one spelling); an explicit
 * `judge` is kept; a deterministic job has no judge to move. The repo (Inputs line 1) is in a spec only as `inputs`. The copy
 * hashes to a NEW `jobSpecHash` and the SAME `workflowKey` — the caller checks the second after building.
 * @param {any} originSpec
 * @param {Record<string, any>} card
 * @param {readonly import('../providerrows.js').KeyRow[]} [rows] the Settings rows; without them (or without `card.model`) the worker is left as signed
 * @returns {any}
 */
export function buildReuseSpec(originSpec, card, rows) {
  const spec = JSON.parse(JSON.stringify(originSpec));
  // an ABSOLUTE Destination is a per-run output folder (a plain-files job): it is never part of the signed spec, and the spec's own
  // fence (inside the run's tree) stays as signed. A repo job's Destination is the fence and is relative (an absolute one is refused).
  if (!isAbsoluteDestination(String(card.destination ?? '').trim())) spec.writeScope = String(card.destination ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const ip = parseInputs(card.inputs);
  if (ip.ok) spec.inputs = ip.inputs; else delete spec.inputs;
  spec.budgetUsd = card.capUsd;
  if (typeof card.maxWallMs === 'number' && Number.isFinite(card.maxWallMs) && card.maxWallMs > 0) spec.maxWallMs = card.maxWallMs;
  else delete spec.maxWallMs;
  const choice = rows && typeof card.model === 'string' ? modelChoiceFor(rows, { provider: card.provider, model: card.model }) : null;
  if (choice) {
    if (spec.verdictType === 'soft-green' && !spec.judge) spec.judge = resolveJobJudge(originSpec, originSpec.provider ?? choice.provider, resolveWorkerModel);
    resolveProvider(choice.provider);
    spec.provider = choice.provider;
    if (choice.baseUrl) spec.baseUrl = choice.baseUrl; else delete spec.baseUrl;
    spec.model = choice.name; // a job always carries its own model
  }
  return spec;
}

/**
 * `$0` validation for a REUSE start: the signed job carries the goal, checks and guardrails, so those boxes are not
 * required here — only what the new session itself needs: Inputs, a Destination, a Model that is a Settings Name,
 * and the cap. (The spec built from the open boxes is validated by the route with `validateJob`.)
 * @param {any} card
 * @param {{rows?: readonly import('../providerrows.js').KeyRow[]}} [opts]
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateReuseCard(card, opts = {}) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'missing job card' };
  const pick = judgePick(opts.rows ?? [], { provider: card.provider, model: card.model });
  if (!pick.ok) return { ok: false, error: pick.say };
  const ip = parseInputs(card.inputs);
  if (!ip.ok) return { ok: false, error: ip.error };
  if (typeof card.destination !== 'string' || card.destination.trim() === '') return { ok: false, error: 'Destination is required' };
  if (typeof card.capUsd !== 'number' || !Number.isFinite(card.capUsd) || card.capUsd <= 0) {
    return { ok: false, error: '$ cap is required and must be a positive number' };
  }
  return { ok: true };
}

/** A Destination written as an absolute path (POSIX or a Windows drive path). @param {string} destination @returns {boolean} */
const isAbsoluteDestination = (destination) => /^(\/|[a-zA-Z]:[\\/])/.test(destination);

export { nonRepoSourceMessage };

/** the refusal for a plain-files rubric job whose Destination is not an absolute folder (ends with the words the session start shows) */
export const FILES_DESTINATION_WORDS = 'Destination must be the full path of a folder, like /home/me/out — the finished files are delivered there. Nothing spent.';

/**
 * THE ONE Destination check of a session start, at $0, before any session, copy or model call. The session's own pipeline, the HTTP
 * start (`startSession`), the schedule's two clicks and a scheduled fire's `wouldAccept` all call THIS (never a copy of it), so a start
 * that would be refused for its Destination is refused before anything is made.
 * @param {{inputs?: unknown, destination?: unknown, checkType?: unknown}} card the Inputs text (line 1 = the source), the Destination and the check type
 * @returns {string|null} the plain refusal, or null when the Destination is fine
 */
export function startDestinationProblem(card) {
  const ip = parseInputs(card?.inputs);
  const source = ip.ok ? (ip.inputs[0]?.value ?? '') : '';
  const destination = typeof card?.destination === 'string' ? card.destination : '';
  const isRepoLike = looksLikeRepoSource(source);
  const repo = repoDestinationProblem(destination, isRepoLike);
  if (repo !== null) return repo;
  if (card?.checkType === 'rubric' && !isRepoLike && !isAbsoluteDestination(destination)) return FILES_DESTINATION_WORDS;
  return null;
}

/**
 * The ONE Destination rule for a REPO source (fresh card and Reuse card alike): there Destination is the write fence,
 * relative to the repo, so an absolute path is refused — at $0, before any copy or model call. A FOLDER source (or a
 * source that does not peek as a repo) keeps today's behaviour: its Destination is an absolute output directory.
 * @param {string} destination
 * @param {boolean} isRepoLike `looksLikeRepoSource(cardSource(card))`
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
 * @param {{jobsDir?: string, allowName?: string, rows?: readonly import('../providerrows.js').KeyRow[]}} [opts] `rows` = the Settings rows (the Model menu); jobsDir is a server-side test seam — NEVER read off the client card; `allowName` = the origin job's own name on an unchanged red Reuse (it is the same job, not a collision)
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateJobCard(card, opts = {}) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'missing job card' };
  const { jobName, checkType, model, destination, capUsd } = card;
  if (!isSlug(jobName)) return { ok: false, error: 'Job name must be a kebab-case slug (letters, digits, dashes)' };
  if (jobName !== opts.allowName && jobNameTaken(jobName, { jobsDir: opts.jobsDir })) {
    return { ok: false, error: `a job named "${jobName}" already exists — P3 is new jobs only (Q4=A)` };
  }
  if (checkType !== 'deterministic' && checkType !== 'rubric') return { ok: false, error: 'Check type must be deterministic or rubric' };
  const pick = judgePick(opts.rows ?? [], { provider: card.provider, model });
  if (!pick.ok) return { ok: false, error: pick.say };
  if (card.thinking !== undefined && typeof card.thinking !== 'boolean') return { ok: false, error: 'Thinking on must be on or off' };
  const jb = parseJobBlock(card.jobText);
  if (!jb.ok) return { ok: false, error: jb.error };
  const ib = parseInputs(card.inputs);
  if (!ib.ok) return { ok: false, error: ib.error };
  // P1=B: PASS/FAIL examples are required of a rubric job only when it holds a judged part. A rubric on the person's own
  // local files (first input not a repo) holds none in this build; a rubric on a repo composes the judged floor.
  const rubricFiles = checkType === 'rubric' && looksLikeRubricInput(ib.inputs[0].value);
  const misfit = jobBlockFitsCheck(jb.lines, checkType === 'rubric', { judged: !rubricFiles });
  if (misfit) return { ok: false, error: misfit };
  if (typeof destination !== 'string' || destination.trim() === '') return { ok: false, error: 'Destination is required' };
  if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd <= 0) {
    return { ok: false, error: '$ cap is required and must be a positive number' };
  }
  return { ok: true };
}

/**
 * ONE session's engine — created already RUNNING (the caller awaits nothing;
 * the pipeline drives itself, reporting through `state`). `state.pendingAsk`
 * is the ONE thing a person answers next; `answer()`/`send()`/
 * `signPrepare()` are the only ways in.
 * @param {any} card the validated job card (see {@link validateJobCard})
 * @param {{env?: Record<string,string|undefined>, sessionsRoot?: string, home?: string, timeoutMs?: number,
 *   scout?: any, generate?: Function, confirmGenerate?: Function, authorFn?: Function,
 *   prepareSigningFn?: Function, npmCiFn?: Function, lookFn?: Function|null, fetchUrl?: (url: string) => Promise<{ok: true, text: string, url: string}|{ok: false, error: string}>, draftThinking?: "on"|"off", reuse?: {spec: any, workflowKey: string}}} [deps] `scout`..`prepareSigningFn` are
 *   TEST SEAMS ONLY — see the note just above where each is read, below. `reuse` (Reuse workflow) is NOT a seam: the
 *   caller (`/api/author/start`) sets it only when the server's own same-job rule held.
 * @returns {any} the session object
 */
export function createSession(card, deps = {}) {
  const env = deps.env ?? process.env;
  // The drafter's THINKING mode ('on' | 'off'): the card's "Thinking on" tick (unticked = 'off'), signed into the job only when ticked.
  // `deps.draftThinking` is an operator override for tests/probes; a bad value throws here, before a session exists.
  const draftThinking = assertThinkingMode(deps.draftThinking ?? (card.thinking === true ? 'on' : 'off'));
  // P7: the person's own words, parsed ONCE by the one parser (src/jobblock.js). The card validator refused a malformed
  // block before a session exists; a reuse card's job text is the origin's and is not drafted from.
  const jobParsed = parseJobBlock(card.jobText);
  const jobLines = jobParsed.ok ? jobParsed.lines : [];
  const inputsParsed = parseInputs(card.inputs);
  const INPUTS = inputsParsed.ok ? inputsParsed.inputs : [];
  /** the repo — Inputs line 1 */
  const SOURCE = INPUTS[0]?.value ?? '';
  const sessionsRoot = deps.sessionsRoot ?? join(process.env.HOME ?? '/tmp', '.config', 'bareloop', 'panel-sessions');
  // config.json lives beside the sessions dir (~/.config/bareloop) unless a home is injected
  const configHome = deps.home ?? dirname(sessionsRoot);
  const timeoutMs = deps.timeoutMs ?? 300_000;
  // TEST SEAMS ONLY (never set by `src/panel/authorroutes.js`'s real caller):
  // override the declaration composer and/or `prepareSigning` itself so a
  // test can drive the REAL confirm turn / ask() channel /
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

  /** a rubric job on local files words its copy/read steps for files (set once the card is known) */
  let fileJob = card.checkType === 'rubric' && looksLikeRubricInput(parseInputs(card.inputs).ok ? (/** @type {any} */ (parseInputs(card.inputs))).inputs[0].value : '');
  /** @param {string} id @param {string} [detail] (absent = keep what the step has) start (or restart) a step; whatever step was running is finished */
  const stepStart = (id, detail) => {
    const labels = fileJob ? { ...STEP_LABELS, ...FILE_JOB_STEP_LABELS } : STEP_LABELS;
    advanceSteps(state.steps, id, detail, labels);
    state.progressLabel = labels[id] ?? id;
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
  /** a structured message (the plan bubble): the page draws it, the thread keeps it as data */
  const sayPlan = (/** @type {any} */ plan) => { state.messages.push(planMessage(plan, jobLines)); };

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
  const ask = (step) => new Promise((resolveFn0) => {
    // PRD v1.106 Part 5 Q1: every question the person answers (the confirm card's, the early look ask, the last-try ask) is one `human` row in the
    // drafting log, with the answer secret-masked BEFORE it is written. Written only when the answer exists (a blank one re-asks and leaves nothing).
    const resolveFn = step.kind !== 'answer' ? resolveFn0 : (/** @type {string|null} */ value) => {
      const said = value === null ? '' : redactSecrets(String(value).trim());
      if (said !== '' && typeof step.question === 'string') {
        const running = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
        appendDraftLog(outDir, {
          kind: 'human', no: running === -1 ? Math.max(0, state.steps.length - 1) : running, source: typeof step.source === 'string' ? step.source : 'confirm',
          question: redactSecrets(step.question), answer: said, ...(Number.isInteger(step.line) ? { line: step.line } : {}), at: new Date().toISOString(),
        });
      }
      resolveFn0(value);
    };
    state.pendingAsk = step;
    resolvePending = resolveFn;
    if (step.kind === 'language') say('bot', `${step.field?.prompt ?? 'Which language is this job about?'} (${(step.candidates ?? []).join(', ')})`);
    else if (step.kind === 'menu') {
      sayPlan(step.plan ?? {});
    } else if (step.kind === 'answer' && step.source === 'fit-check') say('bot', step.question);
    else if (step.kind === 'answer') say('bot', `A question the plan raised (${step.index} of ${step.total})${Number.isInteger(step.line) ? `, about job line ${step.line}` : ''}: ${step.question}`);
    else if (step.kind === 'goal') say('bot', 'Type the goal sentence yourself.');
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

  let lastTryRefused = false;
  const onPhase = (name, data = {}) => {
    // COLLAPSED INTO THE PROGRESS INDICATOR ONLY (build item 3) — this used
    // to also `say('system', `… ${name}`)`, one jargon chat bubble per
    // library phase (`… confirm-turn-done`, `… seed-read`, …), read back to
    // back with the plain-language refusal that often followed a phase like
    // `confirm-turn-done` in the very next line (build item 2's "the
    // refusal line appears twice"). The thread now carries only what a
    // person needs to read; the step-by-step detail lives in one line.
    // ONE owner of the drafting line's detail (model + cap): the drafting line is started here, by the real author phase
    if (PHASE_STEP[name]) stepStart(PHASE_STEP[name], PHASE_STEP[name] === 'draft' ? `${card.model}, $${card.capUsd.toFixed(2)} cap` : undefined);
    // WHY a try was refused: the drafting log keeps it beside the call that made it (it used to say only "retry 3 of 3"), and the
    // progress line shows it briefly, in code's words
    // F243: the fit check's result is one drafting-log row (the asks, what was found, what the quote proved); an `absent` check says so in chat
    if (name === 'fit-check-done') {
      const running = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
      appendDraftLog(outDir, {
        kind: 'fit-check', no: running === -1 ? Math.max(0, state.steps.length - 1) : running, state: String(data.state ?? 'absent'),
        asks: (Array.isArray(data.asks) ? data.asks : []).map((/** @type {any} */ a) => ({
          line: a.line, ask: redactSecrets(String(a.ask)), found: a.found === true, quote: typeof a.quote === 'string' ? redactSecrets(a.quote) : null, madeUp: a.madeUp === true,
        })),
        notFound: (Array.isArray(data.notFound) ? data.notFound : []).map((/** @type {any} */ x) => ({ line: x.line, ask: redactSecrets(String(x.ask)) })), at: new Date().toISOString(),
      });
      if (data.state === 'absent') say('bot', FIT_ABSENT_NOTE);
    }
    if (name === 'author-try-failed') {
      lastTryRefused = true;
      const no = state.steps.findLastIndex((/** @type {any} */ x) => x.id === 'draft');
      const reason = tryRefusedText(data);
      appendDraftLog(outDir, {
        kind: 'try-refused', no: no === -1 ? state.steps.length - 1 : no, call: String(data.call ?? ''), reason,
        ...(Array.isArray(data.reds) && data.reds.length ? { reds: redsRecord(data.reds) } : {}), ...declarationRecord(data.declaration), at: new Date().toISOString(),
      });
      stepDetail('draft', `${data.call}: refused — ${reason.length > 160 ? `${reason.slice(0, 160)}…` : reason}`);
    }
    // a drafting call after the first (`author-call` i >= 1, of up to `of + 1`) is relabelled in plain words, so a long silence on call 2
    // of 3 does not read as a hang. The loop drafts again after a try that PASSED too (the drafter sees its own seed-read), so
    // "retry" is said only when the previous try was actually refused; otherwise it is "look". The same one line, never a second one.
    if (name === 'author-call' && Number.isInteger(data.i) && data.i >= 1 && Number.isInteger(data.of)) {
      const label = `${STEP_LABELS.draft} (${lastTryRefused ? 'retry' : 'look'} ${data.i + 1} of ${data.of + 1})`;
      lastTryRefused = false;
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
    // bare-agent's own verdict on the call's run — `thinkingStatus`: 'applied' | 'unsupported' | 'ignored' | 'unknown' — present only
    // when thinkingMode was sent. The first drafting row then says what REALLY happened ("the model thought anyway", "can't change it",
    // "not confirmed"); a row that moved to a worse word never moves back.
    if (draftThinkingPlan !== null && call.thinkingStatus !== undefined && call.thinkingStatus !== thinkingStatusSeen
      && !(thinkingStatusSeen !== null && thinkingStatusSeen !== 'applied' && call.thinkingStatus === 'applied')) {
      thinkingStatusSeen = call.thinkingStatus;
      const row = latestStep(state.steps, 'thinking');
      if (row) {
        row.label = thinkingRowText({ mode: draftThinkingPlan.mode, support: draftThinkingPlan.support, status: call.thinkingStatus });
        appendDraftLog(outDir, { kind: 'step-label', no: state.steps.indexOf(row), label: row.label, at: new Date().toISOString() });
      }
    }
    appendDraftLog(outDir, {
      kind: 'call', no: callNo, step: state.steps[callNo]?.id ?? null, label: call.label, model: draftIdentity?.model ?? null,
      thinking: draftThinkingPlan === null ? null : draftThinkingPlan.mode, thinkingSupport: draftThinkingPlan === null ? null : draftThinkingPlan.support,
      ...(call.thinkingStatus === undefined ? {} : { thinkingStatus: call.thinkingStatus }),
      // idea A core: the page-word map's scrubbed answer (src/pagemap.js) - unsigned, kept so a run can be replayed at $0
      ...(typeof call.raw === 'string' ? { raw: call.raw } : {}),
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
  /** what the drafting calls will carry for thinking — the tick's mode and bare-agent's support answer — set once the Model resolves; null before
   * @type {ReturnType<typeof thinkingPlanFor>|null} */
  let draftThinkingPlan = null;
  /** the worst-so-far `thinkingStatus` a drafting call reported (null until one did) @type {string|null} */
  let thinkingStatusSeen = null;
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
    const keyRows = rowsForHome(configHome, env);
    const pick = judgePick(keyRows, { provider: card.provider, model: card.model });
    const modelChoice = pick.ok ? pick.choice : null;
    // hamr 2026-10-11: the FIRST drafting row says whether the drafter thinks, before any other line ("checking setup" follows).
    // A Reuse session drafts nothing, so it has no row. A provider shape that cannot be built is refused below, in words.
    if (modelChoice && deps.reuse === undefined) {
      try {
        draftThinkingPlan = thinkingPlanFor({ providerName: modelChoice.provider, model: modelChoice.name, baseUrl: modelChoice.baseUrl ?? null }, draftThinking);
        state.steps.push({ id: 'thinking', label: thinkingRowText({ mode: draftThinkingPlan.mode, support: draftThinkingPlan.support }), status: 'done', detail: '' });
        logSteps();
      } catch { draftThinkingPlan = null; }
    }
    stepStart('setup');
    if (!modelChoice) { refuse(pick.ok ? 'Pick a model. Nothing was spent.' : pick.say); return; }
    draftIdentity = { provider: modelChoice.provider, baseUrl: modelChoice.baseUrl ?? null, model: modelChoice.name };
    let providerEntry;
    try { providerEntry = resolveProvider(modelChoice.provider); } catch (e) { refuse(/** @type {Error} */ (e).message); return; }
    // the key is the chosen row's own variable (P8: no built-in name)
    const keyCfg = keyRows;
    const draftKeyName = modelChoice.envName;
    const apiKey = keyValueOf(env, draftKeyName);
    if (!apiKey) { refuse(`${draftKeyName} not set. Stopped — nothing spent.`); return; }
    // the customer's own price on this row (USD per 1M in config.json), resolved once here at $0 and
    // handed to every model call this session makes; a bad price refuses, never falls back to the guess
    /** @type {import('../providerrows.js').PriceResult} */
    let draftPrice = null;
    {
      const chosenRow = keyCfg.find((r) => r.envName === modelChoice.envName);
      const dl = chosenRow?.models.find((l) => l.model === modelChoice.name);
      const dp = dl ? ratesOfLine(dl) : null;
      draftPrice = dp ? { ...dp, envName: modelChoice.envName } : null;
    }
    const keyProblem = apiKeyProblem(apiKey);
    if (keyProblem) { refuse(`${draftKeyName} ${keyProblem}. Stopped — nothing spent.`); return; }

    const verdictType = card.checkType === 'rubric' ? 'soft-green' : 'green';
    const into = join(outDir, 'source-seed');
    const isRepoLike = looksLikeRepoSource(SOURCE);
    // PART 1a: a RUBRIC job whose first input is not a repo works on the person's own local FILES — every numbered input
    // line is one file, frozen by `proveRubricInputs`; there is no repo, no language and no scout (docs/product/ITEM33-BUILD.md)
    const RUBRIC_FILES = card.checkType === 'rubric' && !isRepoLike;
    // hamr's ruling B (2026-10-05): ONE rule for both a fresh card and a reuse card, at $0, before the copy and any model call
    const destProblem = startDestinationProblem(card);
    if (destProblem !== null) { refuse(destProblem); return; }

    state.phase = 'preparing-source';
    stepStart('copy');
    // P6 item 1 (hamr 2026-10-05, Q1 = A / Q3 = A): a REPO source gets a worktree in the person's own repo, made now at
    // drafting start — `.bareloop/wt/<session id>` at their current commit. Edits they have not committed are not in it,
    // and the progress line says so (a notice, never a refusal).
    const repoRoot = isRepoLike ? nearestGitAncestor(resolve(SOURCE))?.dir ?? null : null;
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
    /** @type {any} */
    let prep;
    if (RUBRIC_FILES) {
      const proved = await proveRubricInputs({ inputs: INPUTS, into, destination: card.destination, ...(deps.fetchUrl ? { fetchUrl: deps.fetchUrl } : {}) });
      prep = proved.ok ? proved.prep : { stop: proved.error, code: proved.code };
    } else {
      prep = await prepareSource({
        source: SOURCE, into, ...(isRepoLike || destIsDir ? { destination: card.destination } : {}),
        ...(repoRoot === null ? {} : { worktree: worktreePath(repoRoot, id) }),
      });
    }
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
    let LANG = RUBRIC_FILES ? RUBRIC_LANG : 'none-detected';
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
    if (!IS_REPO_SOURCE && !RUBRIC_FILES) {
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
      /** @type {import('../providerrows.js').PriceResult} */
      let judgePrice = null;
      if (judge) {
        const judgeRow = judgeRowFor(keyCfg, judge, modelChoice.provider, keyCfg.find((r) => r.envName === modelChoice.envName) ?? null);
        try {
          judgePrice = judgeRatesFor(judge, modelChoice.provider, modelChoice.baseUrl, draftPrice, keyCfg);
        } catch (e) {
          if (!(e instanceof ConfigError)) throw e;
          refuse(`${e.message} — refusing before gate 4 spends anything`);
          return;
        }
        const judgeKeyValue = env.JUDGE_API_KEY ?? (judge.provider === modelChoice.provider ? apiKey : keyValueOf(env, judgeRow?.envName));
        const judgeKeyProblem = judgeKeyValue ? apiKeyProblem(judgeKeyValue) : null;
        if (!judgeKeyValue || judgeKeyProblem) {
          refuse(`the judge key is not usable (${judgeKeyProblem ?? 'not set'}) — refusing before gate 4 spends anything`);
          return;
        }
        judgeProvider = buildRunnerProviders({
          providerName: modelChoice.provider, apiKey, model: MODEL, baseUrl: modelChoice.baseUrl, legacyMaxTokens: modelChoice.legacyMaxTokens,
          judgeApiKey: judgeKeyValue, judgeModel: judge.model, judgeProviderName: judge.provider,
          judgeBaseUrl: judge.provider === modelChoice.provider ? modelChoice.baseUrl : (judgeRow?.baseUrl.trim() || undefined),
          judgeLegacyMaxTokens: judge.provider === modelChoice.provider ? modelChoice.legacyMaxTokens : (judgeRow?.legacyMaxTokens ?? false),
        }).judgeProvider;
      }
      const signing = await prepareSigningFn({
        spec, workdir: prep.tree, seedRef: seedRef, timeoutMs,
        shellCapUsd: spec.budgetUsd, ceilingUsd: card.capUsd, priorCalls: [...metered],
        judgeLoop: judgeProvider ? (o) => defaultJudgeLoop({ provider: judgeProvider, system: o.system, rates: judgePrice?.rates ?? null, thinking: spec.thinking === true }) : null,
        judgeModel: judge?.model ?? null,
        onJudgeCost: (c) => onCall({ label: `${c.label}:${c.id}`, costUsd: c.costUsd, unpricedRounds: c.unpricedRounds }),
      });
      const signingFile = join(outDir, 'signing.json');
      writeFileSync(signingFile, `${JSON.stringify(signing, null, 2)}\n`);
      // The `calibrating` line is the rubric phase the person watched; its ✓ was set long before the gate graded
      // anything. Once the gate has a result, the line says THAT, on its own line (hamr, 2026-10-09).
      const calSum = calibrationSummary(signing.gates?.calibration);
      const calStep = latestStep(state.steps, 'calibrate');
      if (calSum && calStep) {
        calStep.status = calSum.ok ? 'done' : 'failed';
        calStep.detail = calSum.note;
        logSteps();
      }

      if (!signing.ok) {
        // plain words for the person (src/authorreadout.js, the one owner the CLI prints too); the full reds go into
        // the drafting log on the failed step, so the cause survives the session
        const runningNo = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
        appendDraftLog(outDir, {
          kind: 'step-reds', no: runningNo === -1 ? state.steps.length - 1 : runningNo, stop: 'signing-gates-failed',
          reds: redsRecord(signing.reds ?? [], { signing: true }), at: new Date().toISOString(),
        });
        refuse(signingStopText({
          reds: signing.reds ?? [], refusal: signing.refusal,
          spend: { knownUsd: state.draftSpentUsd, spendComplete: state.draftSpendComplete },
        }));
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

    // a rubric job on files writes only inside the hidden tree's own `output/`; its Destination is a drop-off folder
    // (proven above, per run), never a fence
    const writeScope = RUBRIC_FILES ? ['output/'] : card.destination.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    /** @type {any} the confirm turn (below) fills `goal` in once accepted —
     * declared loosely rather than typed field-by-field, since this object's
     * own shape is a `job-v1` draft `validateJob` itself is the real
     * authority on, not a second hand-typed interface here. */
    const draft = {
      schema: 'job-v1',
      job: card.jobName,
      description: `${card.jobName} — authored through the bareloop panel (${verdictType}, ${LANG})`,
      // P7: the person's own words, signed beside the model's goal sentence
      jobLines: signedJobLines(jobLines),
      inputs: INPUTS,
      provider: modelChoice.provider,
      ...(modelChoice.baseUrl ? { baseUrl: modelChoice.baseUrl } : {}),
      // a job always carries its own model (P8: there is no provider default to omit it against)
      model: modelChoice.name,
      // the "Thinking on" tick is signed ONLY when ticked (unticked writes no field: the hash stays what it would have been)
      ...(card.thinking === true && draftThinkingPlan?.support !== false ? { thinking: true } : {}),
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
    const answers = { 1: renderJobLines(jobLines) };
    if (verdictType === 'soft-green') answers[SOFTGREEN_JUDGE_EXAMPLES_KEY] = renderExamples(jobLines);
    // a rubric job on files holds no judged part in this build, so the PASS/FAIL examples are not required of it
    const required = RUBRIC_FILES ? [1] : requiredAnswersFor(verdictType);
    for (const n of required) {
      if (!answers[n]) { refuse(`the ${verdictType} check type needs ${required.length} answers and one is missing (key ${n})`); return; }
    }

    const draftJudge = (() => {
      try { return resolveJobJudge(draft, modelChoice.provider, resolveWorkerModel); } catch { return { provider: modelChoice.provider, model: modelChoice.name }; }
    })();
    const { provider } = buildRunnerProviders({
      providerName: modelChoice.provider, apiKey, model: MODEL, baseUrl: modelChoice.baseUrl, legacyMaxTokens: modelChoice.legacyMaxTokens,
      judgeApiKey: apiKey, judgeModel: MODEL, judgeProviderName: modelChoice.provider, judgeBaseUrl: modelChoice.baseUrl,
    });
    // TEST SEAMS (see the constructor's own note): a test overrides
    // `generate`/`confirmGenerate` directly (bypassing this real, constructed
    // `provider` for the model boundary) and/or `scout` (bypassing the real
    // paid scout) so it can drive the REAL confirm turn/ask()/hash
    // machinery below with a deterministic fake, never a live provider call.
    // no NEW model call starts after an abandon; a call already in flight books its usage via onCall and is discarded
    const noCallAfterAbandon = (fn) => (...a) => { if (abandoned) throw new Error('abandoned — no new model call'); return fn(...a); };
    const generate = noCallAfterAbandon(deps.generate ?? makeLoopGenerate(provider, { rates: draftPrice?.rates ?? null, draftThinking }));
    const confirmGenerate = noCallAfterAbandon(deps.confirmGenerate ?? makeLoopGenerate(provider, { system: CONFIRM_SYSTEM, rates: draftPrice?.rates ?? null, draftThinking }));

    // P7 item 5 (fwdloop am24/25): the last drafting try, after two failed ones, may ask. Each question comes through the same
    // ask path as every other (the chat box + Send); the answer is REQUIRED (a blank one asks again, there is no skip) and is
    // added WORD FOR WORD as a `~` rule on the job line it names — never rewritten. The lines are mutated in place, so the
    // signed `jobLines`, the answers text and the plan card all read the same words.
    const answerQuestions = async (/** @type {{questions: {line: number, question: string, rule?: number, source?: string, ask?: string, reading?: string}[], dropped: {reason: string, raw: any}[], confirmed: any}} */ o) => {
      if (o.dropped.length) appendDraftLog(outDir, { kind: 'questions-dropped', no: Math.max(0, state.steps.length - 1), dropped: o.dropped, at: new Date().toISOString() });
      const total = o.questions.length;
      /** @type {{line: number, rule: number}[]} */
      const left = [];
      for (let k = 0; k < total; k += 1) {
        const q = o.questions[k];
        let text = '';
        for (;;) {
          const a = await ask({ kind: 'answer', source: typeof q.source === 'string' ? q.source : 'try-3', index: k + 1, total, question: q.question, line: q.line });
          if (a === null) return null;
          // one `~` line is one line: the person's own words, newlines folded to spaces, nothing else touched
          text = String(a).replace(/\s*\n\s*/g, ' ').trim();
          if (text) break;
          say('bot', 'An answer is needed here — there is no skip. Type it in the box below and press Send.');
        }
        // PRD v1.107 Part 5b: a code-forced look question about a `~` rule. A can't-check ask answered "drop it" adds NO rule; the caller puts that
        // rule on the look's Not checked list. A reading ask answered "agree" adds the code's reading, in plain words, as the `~` rule (so the
        // bound is now the person's own words); anything else typed is the person's own rule, word for word.
        if (q.source === 'look' && q.ask === 'reading' && typeof q.reading === 'string' && isAgree(text)) text = q.reading;
        if (q.source === 'look' && q.ask === 'cant-check' && Number.isInteger(q.rule) && isDropIt(text)) { left.push({ line: q.line, rule: /** @type {number} */ (q.rule) }); continue; }
        const line = jobLines.find((l) => l.n === q.line);
        if (line) { line.rule = line.rule ? `${line.rule}; ${text}` : text; line.rules.push(text); }
      }
      draft.jobLines = signedJobLines(jobLines);
      answers[1] = renderJobLines(jobLines);
      state.messages.push({ ...planMessage(o.confirmed ?? {}, jobLines), text: left.length === total ? 'Noted: those stay Not checked. Drafting.' : 'Your answers are in as ~ rules on those job lines. Drafting again.' });
      return { jobLines, answers, left };
    };

    // F243: the fit check's one question, through the same `ask` (the chat box + Send; a blank answer asks again, there is no skip)
    const fitAsk = async (/** @type {string} */ question) => {
      for (;;) {
        const a = await ask({ kind: 'answer', source: 'fit-check', index: 1, total: 1, question });
        if (a === null) return null;
        if (String(a).trim()) return String(a);
        say('bot', 'An answer is needed here — there is no skip. Type it in the box below and press Send.');
      }
    };

    state.phase = 'drafting';
    // no early "drafting" line: the real author phase (PHASE_STEP) starts it, carrying draftDetail (see onPhase)
    // build item 4 — the DISPLAY id (card.model, e.g. "deepseek-flash"), not
    // the internal resolved tier model string (MODEL) or the raw provider
    // name — the same id the Model field's own dropdown showed.
    const authored = await authorCloseForJob({
      judgeModel: draftJudge.model,
      answers, verdictType, repoPath: prep.tree, lang: LANG,
      questions: questionsFor(verdictType),
      jobLines, inputs: INPUTS,
      writeScope, provider, generate,
      ceilingUsd: card.capUsd,
      rates: draftPrice?.rates ?? null,
      draftThinking,
      onPhase, onCall,
      ask, answerQuestions, confirmGenerate, isRepo: !RUBRIC_FILES, langResult,
      ...(deps.scout ? { scout: deps.scout } : {}),
      // PART 1c: a test that replaces the model boundary (`generate`) must not reach the real paid look; `deps.lookFn` brings its own
      ...(deps.lookFn !== undefined ? { lookFn: deps.lookFn } : (deps.generate ? { lookFn: null } : {})),
      // F243: the fit check asks through the ordinary ask path; like the look, a test that replaces the model boundary never reaches the real paid call
      fitAsk,
      ...(deps.fitFn !== undefined ? { fitFn: deps.fitFn } : (deps.generate ? { fitFn: null } : {})),
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
      // ITEM 6 (P7): every drafting stop says WHY in plain words (the reds travel into the drafting log beside it) — the bare
      // "Stopped: provider-red" of live session smv2bzdqmp0f8 carried a code and no reason.
      const stopReds = authored.reds ?? [];
      if (stopReds.length) {
        const no = state.steps.findLastIndex((/** @type {any} */ x) => x.status === 'running');
        appendDraftLog(outDir, { kind: 'step-reds', no: no === -1 ? state.steps.length - 1 : no, stop: authored.stop ?? 'authoring-failed', reds: redsRecord(stopReds), at: new Date().toISOString() });
      }
      refuse(authored.stop === 'confirm-abandoned' || authored.stop === 'confirm-restart'
        ? `Stopped: ${authored.stop}${authored.refusal ? ` — ${authored.refusal.detail}` : ''}`
        : draftStopText({
          stop: String(authored.stop ?? 'authoring-failed'), reds: stopReds, refusal: authored.refusal,
          spend: { knownUsd: state.draftSpentUsd, spendComplete: state.draftSpendComplete },
          wholeJob: RUBRIC_FILES,
        }), authored.stop === 'confirm-abandoned' ? 'abandoned' : 'refused');
      return;
    }

    if (RUBRIC_FILES) draft.goal = redactSecrets(rubricGoal({ jobLines, files: prep.manifest.inputs, confirmedGoal: authored.confirmed?.goal ?? null, closeDecl: authored.closeDecl }));
    else if (authored.confirmed?.goal) draft.goal = redactSecrets(String(authored.confirmed.goal));
    const spec = assembleSpec(draft, { ...authored, verdictType: /** @type {string} */ (authored.verdictType) });
    // PART 1a (run mv5bk400): the plan the person confirmed named three checks for line 1; the composer wrote ONE stage and put
    // "lists 3 releases" in its notes, so the card promised a check the close never ran. The card AFTER drafting is now built
    // from the close itself, and every confirmed check no part carries out is moved to Not checked, in code, before signing.
    if (RUBRIC_FILES) {
      const rec = reconcileRubricPlan({
        confirmed: authored.confirmed?.checkItems ?? [], notChecked: authored.confirmed?.notChecked ?? [], closeDecl: spec.closeDecl, jobLines,
      });
      state.finalPlan = { goal: String(draft.goal ?? ''), checkItems: rec.checkItems, notChecked: rec.notChecked, protections: authored.confirmed?.protections ?? [], moved: rec.moved };
    }
    await finish(spec, authored.seedRef);
    if (state.finalPlan && state.phase === 'prepared') {
      // The confirm turn's plan bubble (and a try-3 "answers are in" one) is the DRAFTER's wording of the checks, written before
      // any close existed. Once the close is signed-ready its card is the only plan the person sees: the earlier ones are
      // dropped, so drafter prose can never sit above (and be read instead of) the code's sentences (run mv5e1ktb).
      state.messages = state.messages.filter((/** @type {any} */ m) => m.kind !== 'plan');
      state.messages.push({
        ...planMessage({ checkItems: state.finalPlan.checkItems, checks: state.finalPlan.checkItems.map((/** @type {any} */ c) => c.text), notChecked: state.finalPlan.notChecked, protections: state.finalPlan.protections, questions: [] }, jobLines),
        text: 'These are the checks the signed close will run, and what it will not check. Sign & run to accept them, or Revise to edit the boxes and draft again.',
      });
    }
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
      if (state.pendingAsk.kind === 'menu') return { ok: false, error: 'use Sign & run for a plan, never Send — the chat can never sign or pick a plan action' };
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
    /** click 1 — the confirm pick. Never signs on its own. */
    signPrepare: () => {
      if (!state.pendingAsk || state.pendingAsk.kind !== 'menu') return { ok: false, error: 'no plan is waiting for a decision right now' };
      answer('confirm');
      return { ok: true };
    },
  };
}
