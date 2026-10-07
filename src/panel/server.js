// PANEL-BUILD.md P1 — the read-only panel server. `node:http` ONLY (no new
// dependency — the one-production-dependency bar already spends its one slot
// on bare-agent, LIBRARY_CONVENTIONS.md). Layering law (PANEL-BUILD.md §2):
// this file is one more CALLER of the same `src/` library functions
// `src/cli.js` calls — `src/replayio.js`'s read side and `src/runlist.js`'s
// run list — never a re-implementation of either.
//
// READ-ONLY, BY CONSTRUCTION: GET/HEAD only (anything else -> 405) EXCEPT the two
// human-click-guarded route families in their own modules (`/api/author/*`,
// `/api/settings/*` — P3/P4a); no endpoint here runs a job, spends money, signs, or
// returns a key/.env value. Nothing
// here imports `src/providers.js` or touches `process.env` for a secret —
// grepped before writing this file, and the same discipline is kept here.
//
// PATH SAFETY: a URL may name a runid ONLY (validated against
// `RUNID_RE` below); the server looks that runid up in the run list and
// reads ONLY the path stored there for that row. A URL segment is NEVER
// joined into a filesystem path directly — the one exception is the fixed,
// whitelisted `/` route, which always serves this same directory's own
// `index.html`, never a URL-derived filename.
//
// Bound to 127.0.0.1 ONLY (PANEL-BUILD.md P1's own port-4700 note). A taken
// port fails LOUDLY (prints the port, exits non-zero) — this module never
// silently tries another port (hamr's rule, restated across this codebase
// for every cap/threshold: a shell never widens what it was asked to do).

import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import {
  dirname, join, basename, relative, isAbsolute, sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunList, DIED_MTIME_MS, runIsAlive } from '../runlist.js';
import { draftingPartFor } from '../draftspend.js';
import {
  replayOne, parseJsonl, resolveSiblings, isSidecarByName,
} from '../replayio.js';
import { summarizeForAllLine, auditWindowsOf } from '../replay.js';
import { legsOf, legsWallMs, stopFilePath } from '../legs.js';
import { chainSpend } from '../ledger.js';
import { runBehaviour } from '../behaviour.js';
import { SPEND_RECORD_TYPES, floorsFromRecords } from '../ledger.js';
import { jobSpecHash, workflowKey } from '../job.js';
import { confirmProtections } from '../authorflow.js';
import { createAuthorRoutes, mintToken, checkHostGuard, panelMoney2 } from './authorroutes.js';
import { createRunRoutes } from './runroutes.js';
import { createImportRoutes, readImports, bundleStatus, IMPORT_CHANGED_LINE } from './importroutes.js';
import { parseImportedRunId, safeSpinePath, spineStartedAt } from './importrun.js';
import { checkBundleDeps, resolveBundleSpec } from '../bundle.js';
import { checkCloseByteSignature } from '../close-integrity.js';
import { keysHome } from '../keysfile.js';
import { rowsForHome, findRow, modelChoiceFor } from '../providerrows.js';
import { resolveProvider } from '../providers.js';
import { REUSE_LOCKED_FIELDS, REUSE_OPEN_FIELDS } from './authorsession.js';
import { readResume, checkpointAgeGate, CHECKPOINT_OUTCOMES } from '../reuse.js';
import { statusFor, partStatusFor, GOAL_MET_LINE } from './status.js';
import { createSettingsRoutes } from './settingsroutes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Largest POST body the panel buffers (job cards are short prose); a bigger one is refused with 413. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * A runid, as it appears in a URL path segment — never a raw filesystem
 * path. `~` is included so a backfill-disambiguated runid (F197:
 * `src/runlist.js`'s `backfillRuns`, e.g. `run~2` when two archived spines
 * derive the same filename-based runid) is a legal, reachable id, never a
 * 400.
 */
export const RUNID_RE = /^[A-Za-z0-9._~-]+$/;

/** Default bind port (PANEL-BUILD.md P1: checked free on the build machine, not guaranteed elsewhere — the server still fails loudly on collision, see {@link createPanelServer}). */
export const DEFAULT_PORT = 4700;

/**
 * `[✓]`/`[✗]`/`[▶]` — the ONLY vocabulary a result is ever rendered in
 * (auto-memory `ui-verdict-words.md`: never the words green/red/soft-green
 * anywhere in the page). `null` (no `job-end` reached — a killed-mid-run or
 * still-running spine) reads `▶` — the same "in progress / unresolved" glyph
 * P1's own four-glyph vocabulary reserves for that state; a genuinely still-
 * running attempt and an archived spine that never reached its own end are
 * the same fact from this read-only side: no verdict has been recorded yet.
 * @param {string|null} outcome
 * @returns {'✓'|'✗'|'▶'}
 */
export function glyphForOutcome(outcome) {
  return /** @type {'✓'|'✗'|'▶'} */ (statusFor({ outcome }).sign);
}

/**
 * Soft-green was admitted at commit 30df0f9 (2026-08-18) — before that,
 * `green` was the only admissible verdict type, so a run started before this
 * moment that carries no `verdictType` at all (pre-F117 spine) really was
 * deterministic; there was no other check type it could have been. Tighten-
 * only, named so a future change is a deliberate, visible edit (item 3,
 * 2026-09-25).
 */
export const SOFTGREEN_ADMITTED_ISO = '2026-08-18T00:00:00.000Z';

/**
 * `true` when `atIso` parses to a moment strictly before {@link
 * SOFTGREEN_ADMITTED_ISO}. An unparseable/missing `atIso` reads `false`
 * (never assumed old) — an unknown date is a genuinely unknown check type,
 * not a free pass to guess "old".
 * @param {string|null|undefined} atIso
 * @returns {boolean}
 */
function isPreSoftgreen(atIso) {
  const t = typeof atIso === 'string' ? Date.parse(atIso) : NaN;
  return Number.isFinite(t) && t < Date.parse(SOFTGREEN_ADMITTED_ISO);
}

/**
 * `deterministic` (green) / `rubric` (soft-green) / `unknown` (a class this
 * reader doesn't recognize) — the settled UI wording (PANEL-BUILD.md §6),
 * never the internal `green`/`soft-green` spelling. Item 3 (2026-09-25): a
 * spine with NO `verdictType` (pre-F117) is genuinely ambiguous UNLESS its
 * own run date (`atIso`, the job-start ts) predates {@link
 * SOFTGREEN_ADMITTED_ISO} — in that one case, `deterministic` was the only
 * check type that could have run, so it is reported as such (not fabricated:
 * derived from the frozen historical fact that soft-green did not exist
 * yet), paired with {@link checkTypeTitle}'s tooltip explaining the
 * derivation rather than presenting it as if it had been directly recorded.
 * `atIso` is optional so every existing single-arg caller/test keeps its
 * prior behavior (no date -> 'unknown', same as before this item).
 * @param {string|null} verdictType
 * @param {string|null} [atIso] the run's own job-start timestamp
 * @returns {'deterministic'|'rubric'|'unknown'}
 */
export function checkTypeLabel(verdictType, atIso) {
  if (verdictType === 'green') return 'deterministic';
  if (verdictType === 'soft-green') return 'rubric';
  if (isPreSoftgreen(atIso)) return 'deterministic';
  return 'unknown';
}

/**
 * The tooltip/title text for {@link checkTypeLabel}'s pre-softgreen-cutoff
 * branch — `null` for every other case (a real `verdictType` needs no
 * explanation; a genuinely unknown one has none to give).
 * @param {string|null} verdictType
 * @param {string|null} [atIso]
 * @returns {string|null}
 */
export function checkTypeTitle(verdictType, atIso) {
  if (verdictType === 'green' || verdictType === 'soft-green') return null;
  if (isPreSoftgreen(atIso)) return 'not recorded — deterministic was the only check type before 2026-08-18';
  return null;
}

// DIED (hamr's ruling B, 2026-09-25): a run with no `job-end` is `died` [?], never [✗], once nothing is
// running it — `runIsAlive` (src/runlist.js: the row's pid first, the spine-mtime rule DIED_MTIME_MS only
// for a row with no pid; the monthly limit reads the same rule); the constant is re-exported here for the panel's callers.
export { DIED_MTIME_MS };

/**
 * Plain-words description of ONE spine record, for the died "why" sentence's
 * "Last thing it did: …" clause. Built from the REAL record shapes this
 * codebase's own spines carry (grepped, and read directly off a real dead
 * archive — poc-sjisejl8 — while building this), never a guess: an
 * unrecognized `type` still gets an honest, literal fallback rather than a
 * silently wrong label.
 * @param {any} r
 * @returns {string}
 */
function describeLastRecord(r) {
  if (!r || typeof r !== 'object') return 'nothing (no record at all)';
  const type = typeof r.type === 'string' ? r.type : 'unknown';
  if (type === 'worker-round' || type === 'worker-turn' || type === 'judge-round') {
    if (typeof r.phase === 'string' && r.phase.startsWith('step:')) {
      const stepId = r.phase.slice('step:'.length);
      return typeof r.iteration === 'number' ? `step ${stepId} iteration ${r.iteration}` : `step ${stepId}`;
    }
    if (typeof r.phase === 'string' && r.phase.length > 0) return `a ${r.phase} model call`;
    return type === 'judge-round' ? 'a judge model call' : 'a model call';
  }
  /** @type {Record<string, (r: any) => string>} */
  const labels = {
    'job-start': () => 'starting the job',
    'scout-start': () => 'starting the scout',
    'scout-result': () => 'the scout finishing',
    'check-run': () => 'a check run',
    'check-preflight': () => 'a preflight check',
    'check-menu': () => 'building the check menu',
    'step-start': (rec) => `starting step ${rec.step ?? '?'}`,
    'step-end': (rec) => `finishing step ${rec.step ?? '?'}`,
    'iteration-start': (rec) => `starting iteration ${rec.iteration ?? '?'}`,
    'exit-eval': (rec) => `an exit check${typeof rec.step === 'string' ? ` for step ${rec.step}` : ''}`,
    materials: () => 'gathering materials',
    'plan-validate': () => 'validating the plan',
    'plan-accepted': () => 'accepting the plan',
    'plan-executed': () => 'finishing the plan',
    'work-branch': () => 'preparing the work branch',
    'scope-menu': () => 'building the scope menu',
    'close-verdict': () => 'a close verdict',
    'close-precheck': () => 'a close precheck',
    'close-timing': () => 'timing the close',
    'primitive-smoke': () => 'a primitive smoke check',
    engagement: () => 'starting the engagement',
    'wall-clock': () => 'reading the wall clock',
    ladder: () => 'a strike-ladder check',
    'fix-loop': () => 'a fix-loop iteration',
    'transport-retry': () => 'a transport retry',
    'memory-cache': () => 'reading the memory cache',
    'run-start': () => 'starting the run',
    'run-end': () => 'ending the run',
    'outer-close': () => 'the outer close',
    'attempt-bounded': () => 'bounding the attempt',
    'middle-done': () => 'finishing a middle step',
    'resume-seed': () => 'seeding a resume',
    escalation: (rec) => `an escalation${typeof rec.category === 'string' ? ` (${rec.category})` : ''}`,
  };
  const label = labels[type];
  return label ? label(r) : `a ${type} record`;
}

/**
 * `YYYY-MM-DD HH:MM` (local time, 24h, zero-padded) — the ONE
 * timestamp-WITH-TIME format this page ever shows (a plain date elsewhere
 * stays `YYYY-MM-DD`, e.g. `row.at.slice(0,10)`, untouched — that's a
 * different, shorter field, not this helper's concern). Used instead of a
 * locale-dependent `toLocaleString()` spelling (F195: the died "why" line
 * read `9/9/2026, 11:49:40 AM`, inconsistent with every other date on the
 * page) so a future second timestamp-with-time spot routes through the same
 * one function rather than growing its own `toLocale*` call.
 * @param {string|number|Date} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'an unknown time';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Died-run derivation: `died` (the mtime rule above), the plain-words
 * `why` sentence, the priced-rounds spend floor, and the first→last
 * record wall floor — all `null`/`false` when this run is NOT died (a real
 * `job-end` was reached, or the file is still fresh). Reads the spine's raw
 * records directly (never re-derives from `replayRun`'s own windowed
 * fields, which assume a `job-end` exists) — the ONE owner of this
 * derivation, used by every caller below (`/api/runs`, `/api/runs/:id`) so
 * the two never drift apart.
 * @param {import('../runlist.js').RunRow} row the run's listed row (its pid, else its spine's mtime, says whether it is still running)
 * @param {any[]} records raw parsed spine records (already read once by the caller)
 * @param {string|null} outcome `replayRun`'s own `summary.outcome`
 * @returns {{died: boolean, why: string|null, lastThing: string|null, spendFloorUsd: number|null, wallFloorMs: number|null}}
 */
function deriveDeath(row, records, outcome) {
  const notDied = {
    died: false, why: null, lastThing: null, spendFloorUsd: null, wallFloorMs: null,
  };
  if (outcome !== null && outcome !== undefined) return notDied; // a real job-end was reached
  // no job-end yet — the floor derivation is identical whether this turns
  // out to be a died run or one that is genuinely still running (build item
  // 6): computed here, once, before the died/still-running branch below.
  const floors = floorsFromRecords(records);
  if (runIsAlive(row)) return { ...notDied, ...floors }; // something is still running it — genuinely `running`, not died

  const withTs = records.filter((r) => r && typeof r === 'object' && typeof r.ts === 'string');
  const last = withTs.length ? withTs[withTs.length - 1] : null;
  const when = last ? formatTimestamp(last.ts) : 'an unknown time';
  const lastThing = `${describeLastRecord(last)} at ${when}`;
  const why = `died — no ending was recorded (killed, crashed, or the machine slept). Last thing it did: ${lastThing}.`;

  return {
    died: true, why, lastThing, ...floors,
  };
}

/**
 * `duration()`'s own local twin (replay.js keeps its copy private) — used
 * ONLY for the died-row "at least …" wall figure, so this formatting can
 * never silently drift from the row's own normal wall column shape (`6m08s`).
 * @param {number} ms
 * @returns {string}
 */
function formatDurationMs(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  let m = Math.floor(s / 60);
  let rem = Math.round(s - m * 60);
  if (rem === 60) { m += 1; rem = 0; }
  return `${m}m${String(rem).padStart(2, '0')}s`;
}

/**
 * P5 item 2 — may this run be resumed, and under which spec file? The ONE owner of
 * "would the engine accept `--resume` for this run" on the panel side: it asks the SAME
 * library readers the engine's own refusals come from (`readResume` with
 * `CHECKPOINT_OUTCOMES`, `checkpointAgeGate`), plus the two facts the panel needs to
 * spawn it (a signed spec file beside the run, whose hash is the one the run was signed
 * under). `ok:false` means the panel declines to offer a button the engine would refuse
 * by design; it carries a plain `why`.
 *
 * The spec file is the run's own `resolved-spec.json` or one of its
 * `resolved-spec-r<k>.json` siblings (a resume under raised caps writes one), picked by
 * HASH against the run's `job-start.specHash` — a run resumed under raised caps must be
 * resumed again under ITS caps, never the original's. No match = no resume offered.
 * @param {{ spine: string, job: string, pid?: number }} row
 * @param {any[]} records the run's raw spine records
 * @returns {{ok: true, specPath: string, spec: any, specHash: string, budgetUsd: number|null,
 *   maxWallMin: number|null, spentUsd: number|null, spendComplete: boolean,
 *   draftSpentUsd: number|null, draftSpendComplete: boolean|null, wallUsedMs: number|null}|{ok: false, why: string}}
 */
export function resumePlanFor(row, records) {
  if (runIsAlive(row)) return { ok: false, why: 'it is still running' };
  // P5-R: a resumed run is one file of several legs. What may be resumed again is the LATEST leg, under the spec
  // THAT leg ran with (its `job-start.specHash` — a leg resumed under raised caps carries the re-signed hash), so
  // resume #2 is offered under the latest signed caps, never the first leg's.
  const legs = legsOf(records);
  const jobStart = (legs.findLast((l) => l.jobStart !== null) ?? null)?.jobStart ?? null;
  if (!jobStart) return { ok: false, why: 'its log has no start record' };
  const dead = readResume(records, { direct: true, resumableOutcomes: CHECKPOINT_OUTCOMES });
  if (!dead.started) return { ok: false, why: 'its log has no start record' };
  if (dead.greened) return { ok: false, why: 'it already met its goal' };
  if (dead.ended) return { ok: false, why: 'it ended with an answer, not a stop' };
  if (!dead.restart) return { ok: false, why: 'it never opened an attempt to continue' };
  const age = checkpointAgeGate(records);
  if (!age.ok) return { ok: false, why: String(age.detail ?? 'its checkpoint has expired') };
  const near = sourceNearSpine(row.spine);
  if (!near.specPath) return { ok: false, why: 'the signed job file is not beside this run' };
  // P6 item 1: a worktree run resumes IN its worktree — a folder that is gone is a resume the engine would refuse
  const wt = worktreeOfRun(row, records);
  if (wt && !wt.exists) return { ok: false, why: `its worktree folder ${wt.folder} is gone` };
  const dir = dirname(near.specPath);
  /** @type {string[]} */
  let names = [];
  try { names = readdirSync(dir).filter((n) => n === 'resolved-spec.json' || /^resolved-spec-r\d+\.json$/.test(n)); } catch { names = []; }
  for (const n of names) {
    let spec;
    try { spec = JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { continue; }
    if (!spec || typeof spec !== 'object') continue;
    const specHash = jobSpecHash(spec);
    if (specHash !== jobStart.specHash || spec.job !== dead.job) continue;
    const draft = typeof jobStart.draftSpentUsd === 'number' && jobStart.draftSpentUsd > 0 ? jobStart.draftSpentUsd : null;
    const spentKnown = typeof dead.spentUsd === 'number' && Number.isFinite(dead.spentUsd);
    return {
      ok: true,
      specPath: join(dir, n),
      spec,
      specHash,
      budgetUsd: typeof spec.budgetUsd === 'number' ? spec.budgetUsd : null,
      maxWallMin: typeof spec.maxWallMs === 'number' ? spec.maxWallMs / 60000 : null,
      spentUsd: spentKnown ? dead.spentUsd + (draft ?? 0) : null,
      spendComplete: spentKnown && dead.spendComplete !== false && (draft === null || jobStart.draftSpendComplete !== false),
      draftSpentUsd: draft,
      draftSpendComplete: draft === null ? null : jobStart.draftSpendComplete !== false,
      wallUsedMs: typeof dead.restart.priorWallMs === 'number' && Number.isFinite(dead.restart.priorWallMs) ? dead.restart.priorWallMs : null,
    };
  }
  return { ok: false, why: 'no signed job file beside this run matches the hash it ran under' };
}

/**
 * P5-R — the Audit tab's LEG DIVIDERS (hamr 2026-10-02: "clear audit mention resume"). One per resume, CODE-OWNED
 * fixed sentences (ui-verdict-words: never model text) built from how the previous leg ended (`after`) and what the
 * run had spent when it stopped:
 * `── stopped: money cap reached ($8.00) · resumed 2026-10-03 14:10 ──`.
 * `beforePart` is the index of the first part of the leg that picked up (the parts list length when that leg has not
 * started a part yet). Money is the chain's own spend at that leg's end on the ONE basis ({@link chainSpend}).
 * @param {any[]} spineRecords the run's raw records
 * @param {any[]} parts `summary.parts` (each carries `leg` on a resumed run)
 * @returns {{leg: number, beforePart: number, after: string|null, at: string|null, text: string}[]}
 */
export function legDividersFor(spineRecords, parts) {
  const legs = legsOf(spineRecords);
  /** @type {{leg: number, beforePart: number, after: string|null, at: string|null, text: string}[]} */
  const out = [];
  for (let k = 1; k < legs.length; k += 1) {
    const l = legs[k];
    const first = parts.findIndex((p) => typeof p.leg === 'number' && p.leg >= l.leg);
    const spent = chainSpend(legs.slice(0, k).flatMap((x) => x.records));
    const money = `${spent.complete ? '' : 'at least '}${panelMoney2(spent.usd)}`;
    const a = l.after;
    let stopped;
    if (a === 'cap-halt') stopped = `money cap reached (${money})`;
    else if (a === 'wall-halt') stopped = 'time cap reached';
    else if (a === 'provider-red') stopped = 'the model provider failed';
    else if (a === 'step-stalled') stopped = 'a step stopped making progress';
    else if (a === 'stopped') stopped = 'you stopped it';
    else if (a === 'hitl-pause') stopped = 'paused for a decision';
    else if (a === 'died' || a === null) stopped = 'no ending was recorded';
    else stopped = String(a);
    const at = typeof l.start?.at === 'string' ? l.start.at : (typeof l.start?.ts === 'string' ? l.start.ts : null);
    out.push({
      leg: l.leg,
      beforePart: first === -1 ? parts.length : first,
      after: a,
      at,
      text: `stopped: ${stopped} · resumed ${at ? formatTimestamp(at) : 'at an unknown time'}`,
    });
  }
  return out;
}

/** outcomes whose ending is "the checks said no" (a graded answer from a working close) */
const GOAL_NOT_MET = new Set(['plan-red', 'check-red', 'step-red', 'escalated']);

/**
 * P5 item 1 — the ENDED block: why a run ended, what to do next, and which buttons the
 * engine would accept. CODE-OWNED FIXED SENTENCES (ui-verdict-words: never model text);
 * the only slot-fills are numbers and the engine's own recorded detail. ONE owner,
 * feeding both `getRunDetail` (`ended`) and `summarizeRow` (`endedLine`). `null` while
 * a run is live (no Ended block while running).
 *
 * The table (outcome → reason / next / buttons) is PANEL-BUILD.md P5 item 1. The
 * Resume button appears only when `o.resume` says the engine would accept it; "Reuse workflow"
 * (replaces P5 item 3, 2026-10-03) is offered on green rows only, and starts a NEW run.
 * @param {{outcome: string|null, stopReason: string|null, spentUsd: number|null, budgetUsd: number|null, lastEscalation?: any}} summary
 * @param {{died: boolean, lastThing: string|null}} death
 * @param {{resume?: {ok: boolean, why?: string}|null, destinationRefused?: string|null, moneyHalt?: boolean,
 *   worktree?: {folder: string, repo: string, branch: string|null, exists: boolean}|null}} [o]
 *   `worktree` (P6 item 1): the run's worktree in the person's repo, from {@link worktreeOfRun}; absent for every other run
 * @returns {{reason: string, next: string, line: string, actions: {id: string, label: string}[]}|null}
 */
export function endedFor(summary, death, o = {}) {
  const base = withEditAction(endedBase(summary, death, o));
  const wt = o.worktree;
  if (!base || !wt) return base;
  // P6 item 1 — the run worked on a worktree in the person's own repo. GREEN: the branch carries the work (the folder is
  // removed by the engine) and the merge stays the person's — the two commands are shown as TEXT, never run by a button.
  // Any other ending: the worktree folder stays (Resume needs it), so the block names it.
  const green = !death.died && (summary.outcome === 'green' || summary.outcome === 'already-green' || summary.outcome === 'satisfied');
  if (green) {
    if (!wt.branch) return base;
    const kept = wt.exists ? ` The worktree folder ${wt.folder} is still there.` : '';
    return { ...base, next: `In ${wt.repo}: git merge ${wt.branch} — or throw the work away: git branch -D ${wt.branch}.${kept}` };
  }
  return wt.exists ? { ...base, next: `${base.next} Your work is in ${wt.folder}.` } : base;
}

/**
 * "Edit in chat" (hamr 2026-10-07): offered on EVERY non-green ending (failed, capped, stopped, died, every other red),
 * after Resume when both show; a green ending keeps Reuse workflow only. ONE place, so no ending branch can forget it.
 * @param {{reason: string, next: string, line: string, actions: {id: string, label: string}[]}|null} ended
 */
function withEditAction(ended) {
  if (!ended || ended.actions.some((a) => a.id === 'reuse')) return ended;
  return { ...ended, actions: [...ended.actions, { id: 'edit', label: 'Edit in chat' }] };
}

/** @param {any} summary @param {any} death @param {any} o */
function endedBase(summary, death, o) {
  const resumeOk = !!(o.resume && o.resume.ok);
  /** @type {{id: string, label: string}[]} */
  const RESUME = [{ id: 'resume', label: 'Resume' }];
  /** Reuse workflow (replaces P5 item 3's Start from this, hamr 2026-10-03): the same signed job on a new source — a NEW
   *  run, never a rerun. Offered on GREEN rows only; every red row says "Change the job: Clear the card and draft a new one" instead. */
  const REUSE = [{ id: 'reuse', label: 'Reuse workflow' }];
  const CHANGE = 'Change the job: Clear the card and draft a new one.';
  const detailOf = (/** @type {string|null} */ s) => {
    if (typeof s !== 'string' || s.length === 0) return '';
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  };
  /** a resumable ending whose Resume the engine would refuse: say so, never offer the button */
  const resumeOr = (/** @type {string} */ okNext) => (resumeOk ? okNext : `Resume is not available for this run${o.resume && o.resume.why ? ` (${o.resume.why})` : ''}.`);

  if (death.died) {
    return {
      reason: `Stopped with no ending recorded${death.lastThing ? ` (last thing it did: ${death.lastThing})` : ''}.`,
      next: resumeOr('Resume.'),
      line: resumeOk ? 'no ending recorded — resume' : 'no ending recorded',
      actions: resumeOk ? RESUME : [],
    };
  }
  const raw = summary.outcome;
  if (raw === null || raw === undefined) return null;
  const outcome = raw;
  const esc = summary.lastEscalation;
  const cat = typeof esc?.category === 'string' ? esc.category : null;

  // `escalated` is a TERMINAL: its sentence may name the real governor, but it is never
  // resumable. Two governors, never mixed (F198): the STRIKE ladder (the fix loop stopped
  // improving) also files category `cap-halt` — it is the MONEY cap only when the spine
  // says so (a `money-halt` record, or the job-end outcome `cap-halt` itself).
  if (outcome === 'escalated') {
    const strikes = esc?.spend?.strikes;
    const limit = esc?.spend?.strikeLimit;
    if (cat === 'cap-halt' && o.moneyHalt) {
      const money = typeof summary.spentUsd === 'number' && typeof summary.budgetUsd === 'number'
        ? ` (${panelMoney2(summary.spentUsd)} of ${panelMoney2(summary.budgetUsd)})` : '';
      return {
        reason: `Money cap reached${money}.`, next: CHANGE, line: 'money cap', actions: [],
      };
    }
    if (cat === 'cap-halt' && typeof strikes === 'number' && typeof limit === 'number') {
      return {
        reason: `The fix loop stopped improving (${strikes} of ${limit} tries, no check got better).`,
        next: CHANGE,
        line: 'stopped improving',
        actions: [],
      };
    }
    if (cat === 'wall-halt') {
      return { reason: 'Time cap reached.', next: CHANGE, line: 'time cap', actions: [] };
    }
    if (cat === 'provider-red') {
      const d = detailOf(summary.stopReason);
      return {
        reason: `The model provider failed${d ? ` (${d})` : ''}.`, next: CHANGE, line: 'provider failed', actions: [],
      };
    }
  }

  if (outcome === 'green' || outcome === 'already-green' || outcome === 'satisfied') {
    if (o.destinationRefused) {
      return {
        reason: 'Goal met, but the output could not be delivered.',
        next: 'Fix the destination, then Reuse workflow.',
        line: `${GOAL_MET_LINE} — not delivered`,
        actions: REUSE,
      };
    }
    return { reason: 'Goal met.', next: 'Nothing to do.', line: GOAL_MET_LINE, actions: REUSE };
  }
  if (outcome === 'cap-halt') {
    const money = typeof summary.spentUsd === 'number' && typeof summary.budgetUsd === 'number'
      ? ` (${panelMoney2(summary.spentUsd)} of ${panelMoney2(summary.budgetUsd)})` : '';
    return {
      reason: `Money cap reached${money}.`,
      next: resumeOr('Raise the cap, then Resume.'),
      line: resumeOk ? 'money cap — resume' : 'money cap',
      actions: resumeOk ? RESUME : [],
    };
  }
  if (outcome === 'wall-halt') {
    return {
      reason: 'Time cap reached.',
      next: resumeOr('Raise the time, then Resume.'),
      line: resumeOk ? 'time cap — resume' : 'time cap',
      actions: resumeOk ? RESUME : [],
    };
  }
  if (outcome === 'stopped') {
    // P5 item 5: the PERSON ended the leg (Stop). Nothing failed; the finished steps stand.
    return {
      reason: 'You stopped it.',
      next: resumeOr('Resume.'),
      line: resumeOk ? 'you pressed Stop — resume' : 'you pressed Stop',
      actions: resumeOk ? RESUME : [],
    };
  }
  if (outcome === 'provider-red') {
    const d = detailOf(summary.stopReason);
    return {
      reason: `The model provider failed${d ? ` (${d})` : ''}.`,
      next: resumeOr('Resume.'),
      line: resumeOk ? 'provider failed — resume' : 'provider failed',
      actions: resumeOk ? RESUME : [],
    };
  }
  if (outcome === 'step-stalled') {
    return {
      reason: 'A step stopped making progress.',
      next: resumeOr('Resume, or change the job: Clear the card and draft a new one.'),
      line: resumeOk ? 'step stalled — resume' : 'step stalled',
      actions: resumeOk ? RESUME : [],
    };
  }
  if (GOAL_NOT_MET.has(outcome)) {
    const d = detailOf(summary.stopReason);
    return {
      reason: `Goal not met — the checks said no${d ? ` (${d})` : ''}.`,
      next: CHANGE,
      line: 'checks said no',
      actions: [],
    };
  }
  if (outcome === 'close-red') {
    return {
      reason: 'The check itself broke (instrument fault), not your goal.',
      next: CHANGE,
      line: 'check broke',
      actions: [],
    };
  }
  // the raw engine detail is never shown here (it can name retired surfaces); the code is enough
  return {
    reason: `Stopped before or outside the work (code: ${outcome}).`,
    next: CHANGE,
    line: 'stopped before the work',
    actions: [],
  };
}

/**
 * The Ended block for one listed run (P5 item 1): asks {@link resumePlanFor} only when
 * the run's ending is one a resume could ever apply to, so a finished green never reads
 * its spec files. Returns the block, the resume plan (for the confirm box's numbers) and
 * nothing else — the sentences all live in {@link endedFor}.
 * @param {{ spine: string, job: string, pid?: number }} row
 * @param {any[]} records
 * @param {any} summary `replayOne`'s summary
 * @param {{died: boolean, lastThing: string|null}} death
 */
/** the timestamp of the spine's LAST `job-end` record, or null (live, died, or no timestamp) */
function lastJobEndTs(/** @type {any[]} */ records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (r && r.type === 'job-end') return typeof r.ts === 'string' ? r.ts : null;
  }
  return null;
}

function endedForRow(row, records, summary, death, withWorktree = false) {
  const out = summary.outcome;
  const maybeResumable = death.died || out === 'escalated' || (typeof out === 'string' && CHECKPOINT_OUTCOMES.includes(out));
  const resume = maybeResumable ? resumePlanFor(row, records) : null;
  const refused = [...records].reverse().find((r) => r && r.type === 'destination-refused') ?? null;
  const ended = endedFor(summary, death, {
    resume,
    moneyHalt: records.some((r) => r && r.type === 'money-halt'),
    destinationRefused: refused ? String(refused.detail ?? refused.code ?? 'the destination refused it') : null,
    worktree: withWorktree ? worktreeOfRun(row, records) : null,
  });
  const esc = summary.lastEscalation;
  const status = statusFor({
    outcome: out, died: death.died, category: typeof esc?.category === 'string' ? esc.category : null,
    moneyHalt: records.some((r) => r && r.type === 'money-halt'),
  });
  return { ended, resume, status };
}

/**
 * P5 item 6 — a run whose row is listed (its runner is alive) but whose spine does not
 * exist YET: the runner appends the row first, then opens the spine. It is `starting`,
 * never `file missing`. Carries the same field names a normal row/detail does so every
 * client reader (filters, groups) sees a live `▶` run, with every figure honestly null.
 * @param {{ runid: string, job: string, at: string, via: string }} row
 * @returns {any}
 */
function startingStub(row) {
  return {
    runid: row.runid,
    job: row.job,
    at: row.at,
    via: row.via,
    fileMissing: false,
    starting: true,
    died: false,
    glyph: '▶',
    status: statusFor({ outcome: null }),
    outcome: null,
    endedLine: null,
    ended: null,
    resume: null,
    checkType: 'unknown',
    checkTypeTitle: null,
    model: null,
    spend: 'unknown',
    wall: 'unknown',
    date: typeof row.at === 'string' ? row.at.slice(0, 10) : null,
    spentUsd: null,
    spendComplete: false,
    spendFloorUsd: null,
    wallFloorMs: null,
    draftSpentUsd: null,
    draftSpendComplete: null,
    budgetUsd: null,
    steps: [],
    parts: [],
  };
}

/**
 * One `/api/runs` row, or `{ ...row, fileMissing: true }` when the row's
 * spine no longer exists on disk — never silently listed as if it were
 * still there (the same rule {@link import('../runlist.js').formatRunRow}
 * already applies to the CLI's own listing).
 * @param {import('../runlist.js').RunRow} row
 * @returns {any}
 */
function summarizeRow(row) {
  if (!existsSync(row.spine)) {
    if (runIsAlive(row)) return startingStub(row);
    return {
      runid: row.runid, job: row.job, at: row.at, via: row.via, fileMissing: true,
    };
  }
  let summary;
  let rawRecords;
  try {
    summary = replayOne(row.spine, { skipAudit: true });
    rawRecords = parseJsonl(row.spine).records;
  } catch (e) {
    return {
      runid: row.runid, job: row.job, at: row.at, via: row.via, fileMissing: false, readError: String(/** @type {Error} */ (e).message),
    };
  }
  const line = summarizeForAllLine(summary);
  const death = deriveDeath(row, rawRecords, summary.outcome);
  const { ended, status } = endedForRow(row, rawRecords, summary, death);
  return {
    runid: row.runid,
    job: row.job,
    at: row.at,
    via: row.via,
    fileMissing: false,
    died: death.died,
    endedLine: ended ? ended.line : null,
    // P5-R: one card per run — how many times it was resumed (a resumed run is the same run, never a second card)
    resumedCount: Math.max(0, summary.legs.length - 1),
    glyph: status.sign,
    status,
    checkType: checkTypeLabel(summary.verdictType, row.at),
    checkTypeTitle: checkTypeTitle(summary.verdictType, row.at),
    model: summary.model,
    // died: never "unknown" when a priced round exists — glyph [?] already
    // carries the word "died", so the row meta text itself never repeats it.
    // `spend` is the LIBRARY's own 4-decimal string (never changed here —
    // `--all`'s CLI listing reads the same `summarizeForAllLine`, F: "do not
    // change the library's CLI output"). The panel page renders its own
    // 2-decimal text off the numeric fields below instead of this string.
    spend: death.died ? (death.spendFloorUsd !== null ? `at least $${death.spendFloorUsd.toFixed(4)}` : 'unknown') : line.spend,
    wall: death.died ? (death.wallFloorMs !== null ? `at least ${formatDurationMs(death.wallFloorMs)}` : 'unknown') : line.wall,
    date: typeof row.at === 'string' ? row.at.slice(0, 10) : null,
    // numeric fields for the panel's own 2-decimal render (hamr's ruling
    // 2026-09-28, "panel money 2-decimals") — `spentUsd`/`spendComplete` are
    // `null`/`false` on a died row (no job-end, see `spendFloorUsd` instead);
    // `draftSpentUsd`/`draftSpendComplete` are `null` when this run carried
    // no drafting fold at all, exactly like `summary.draftSpentUsd` itself.
    spentUsd: death.died ? null : summary.spentUsd,
    spendComplete: death.died ? false : summary.spendComplete,
    // P5 item 6: the SAME floors the right pane reads (`deriveDeath`), for a died OR a
    // still-running spine — so a live card and its pane show the same numbers. Both
    // null once a job-end exists (the real figures above are complete then).
    spendFloorUsd: death.spendFloorUsd,
    wallFloorMs: death.wallFloorMs,
    draftSpentUsd: summary.draftSpentUsd,
    draftSpendComplete: summary.draftSpendComplete,
    budgetUsd: summary.budgetUsd,
  };
}

/**
 * The Resume route's reader (P5 item 2): the listed row plus the resume plan, from the
 * ONE {@link resumePlanFor} the Ended block asks. `null` when the runid is not listed
 * or its spine is gone.
 * @param {string} runid
 * @param {{ home?: string }} [opts]
 * @returns {{row: any, plan: any}|null}
 */
export function getResumeContext(runid, opts = {}) {
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
  if (!row || !existsSync(row.spine)) return null;
  return { row, plan: resumePlanFor(row, parseJsonl(row.spine).records) };
}

/**
 * The Stop route's reader (P5 item 5): the listed row, whether its LATEST leg is live (`runIsAlive`: the row's pid
 * is the latest leg's, folded from the run list's `leg-start`), and whether its spine exists yet. `null` when the
 * runid is not listed.
 * @param {string} runid
 * @param {{ home?: string }} [opts]
 * @returns {{row: any, live: boolean, spineExists: boolean}|null}
 */
export function getStopContext(runid, opts = {}) {
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
  if (!row) return null;
  return { row, live: runIsAlive(row), spineExists: existsSync(row.spine) };
}

/**
 * @param {any} r
 * @returns {number}
 */
function atMs(r) {
  const t = typeof r?.at === 'string' ? Date.parse(r.at) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * The ONE owner of run names (P6 item 7): runs of the same job (`row.job`) are numbered oldest `at` first, 1-based
 * (ties keep file order). A resume is one row, so it counts once; died and stopped runs are rows too. Every view
 * reads this number — the page never counts on its own.
 * @param {any[]} rows
 * @returns {Map<string, number>} runid → N
 */
function runNumbers(rows) {
  /** @type {Map<string, any[]>} */
  const byJob = new Map();
  rows.forEach((row, index) => {
    if (!row || typeof row.runid !== 'string') return;
    const g = byJob.get(row.job) || [];
    g.push({ row, index });
    byJob.set(row.job, g);
  });
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const g of byJob.values()) {
    g.sort((a, b) => (atMs(a.row) - atMs(b.row)) || (a.index - b.index));
    g.forEach(({ row }, i) => out.set(row.runid, i + 1));
  }
  return out;
}

/**
 * `GET /api/runs` — every listed run, NEWEST FIRST BY `at` (never by file/
 * append order — a backfill scan appends rows in sorted-PATH order, which
 * does not track chronological `at` order; a plain `.reverse()` here once
 * silently mis-sorted any list `appendRun` didn't build strictly
 * chronologically), each enriched with a cheap ($0, `skipAudit:true`)
 * summary. A row with an unparseable/missing `at` sorts last (Unix epoch 0),
 * never crashes the sort or floats to the top. Ties (identical `at`) keep
 * their original file order among themselves (stable sort) rather than an
 * arbitrary one. The Workflows view (item 2, 2026-09-26 merge) groups this
 * SAME payload by job client-side (`groupRunsByJob` in `index.html`) rather
 * than a second server-side endpoint, so the glyph/checkType mapping is
 * still computed in exactly one place.
 * @param {{ home?: string }} [opts]
 * @returns {any[]}
 */
export function listRuns(opts = {}) {
  const { rows } = readRunList(opts);
  const nos = runNumbers(rows);
  return rows
    .map((row, index) => ({ row, index })) // index: stable tie-break, see doc above
    .sort((a, b) => (atMs(b.row) - atMs(a.row)) || (a.index - b.index))
    .map(({ row }) => ({ ...summarizeRow(row), runNo: nos.get(row.runid) }));
}

/**
 * The run's DRAFTING PART (hamr 2026-10-06, option A), or null: it exists only when the run came out of a panel
 * session whose drafting log carries a metered call (src/draftspend.js, `draftingPartFor`) and the spine carries the
 * drafting figure. It is the FIRST element of `detail.parts`, so EVERY index a reader is handed — `detail.parts`,
 * `legDividers.beforePart`, the flat Audit rows' `partIndex`, the rounds endpoint's `part` — lives in ONE index space
 * (the shown list), shifted by {@link draftingShift} in exactly those four places and nowhere else.
 * @param {any} row @param {any} summary a `replayOne` summary of the row's spine @param {{ home?: string }} opts
 * @returns {any|null}
 */
function draftingFor(row, summary, opts) {
  return draftingPartFor(row, { draftSpentUsd: summary.draftSpentUsd, draftSpendComplete: summary.draftSpendComplete }, opts);
}

/** @param {any} row @param {any} summary @param {{ home?: string }} opts @returns {0|1} how far the drafting part pushes every other part's index */
function draftingShift(row, summary, opts) {
  return draftingFor(row, summary, opts) ? 1 : 0;
}

/**
 * The run-list row of a run, for the readers below. An IMPORTED run (`<importId>~<runid>`, see importrun.js) is not in
 * the run list: its row is built from the imports file and a checked path inside that bundle's own `runs/` folder
 * (read only, no pid — never live, never resumable from here). `undefined` when no such run.
 * @param {string} runid
 * @param {{ home?: string }} opts
 * @returns {any}
 */
function findRunRow(runid, opts) {
  const imp = parseImportedRunId(runid);
  if (imp) {
    const bundle = readImports(opts.home).find((x) => x.id === imp.importId);
    const spine = bundle ? safeSpinePath(bundle.dir, imp.runid) : null;
    if (!bundle || !spine) return undefined;
    return { runid, job: bundle.job, at: spineStartedAt(spine), via: 'import', spine, patient: null };
  }
  return readRunList(opts).rows.find((r) => r && r.runid === runid);
}

/**
 * `GET /api/runs/:runid` — the full replay for the Run tab: steps (or
 * iterations), counters, summary-box fields. Looks `runid` up in the run
 * list FIRST and reads only the path stored there (path safety — see file
 * header); `null` when the runid is not in the list at all (caller renders
 * 404).
 * @param {string} runid
 * @param {{ home?: string }} [opts]
 * @returns {any|null}
 */
export function getRunDetail(runid, opts = {}) {
  const d = getRunDetailBody(runid, opts);
  if (!d) return d;
  const runNo = runNumbers(readRunList(opts).rows).get(runid);
  return runNo === undefined ? d : { ...d, runNo };
}

/**
 * @param {string} runid
 * @param {{ home?: string }} opts
 * @returns {any|null}
 */
function getRunDetailBody(runid, opts) {
  const row = findRunRow(runid, opts);
  if (!row) return null;
  if (!existsSync(row.spine)) {
    if (runIsAlive(row)) return startingStub(row);
    return {
      runid, job: row.job, at: row.at, via: row.via, fileMissing: true,
    };
  }
  // build item 7 (2026-09-28): resolve the audit path through the ONE
  // shared resolver (`resolveAuditPathsForRow`, already the sole owner for
  // `scopedBehaviour`/`getRunAudit`) BEFORE calling `replayOne`, and hand it
  // the result — otherwise `replayOne`'s own internal resolution only ever
  // finds the FINISHED-run convention, so a still-LIVE run's part-level
  // `byTool`/`toolCalls` (summary.parts, read from `replayRun`) read
  // "unknown" even though the SAME run's Run-tab tools/cache summary and
  // Audit tab (both driven through `resolveAuditPathsForRow` already) can
  // see the during-run sidecar just fine.
  const rawSpineRecords = parseJsonl(row.spine).records;
  const auditPaths = resolveAuditPathsForRow(row, rawSpineRecords);
  const summary = replayOne(row.spine, { auditPathOverride: auditPaths.length > 0 ? auditPaths : null });
  const timelineKind = summary.timelineKind;
  // the drafting part (see draftingFor) heads the parts list; the enrichment below touches the spine's own parts only
  const draftingPartHere = draftingFor(row, summary, opts);
  const draftingShiftHere = draftingShift(row, summary, opts);
  const enrichedParts = enrichPartsWithStageKind(summary.parts, stageKindMetaFromSpec(resolveSpecForRow(row)));
  const death = deriveDeath(row, rawSpineRecords, summary.outcome);
  const { ended, resume, status } = endedForRow(row, rawSpineRecords, summary, death, true);
  // judgeModel (Summary box "judge:" line): the FIRST `judge-round`'s own
  // `model` field (src/planrun.js:1704's `onJudgeCost` emit) — a soft-green
  // close's own paid judge seam, distinct from the worker `model` above.
  // `null` whenever no judge-round was ever recorded (the common case —
  // src/replay.js's own note: no real archived run measured against this
  // build carries one yet), never guessed from the worker model.
  const judgeRoundWithModel = rawSpineRecords.find(
    (r) => r && typeof r === 'object' && r.type === 'judge-round' && typeof r.model === 'string' && r.model.length > 0,
  );
  const judgeModel = judgeRoundWithModel ? judgeRoundWithModel.model : null;

  /** @param {string|null} outcome @param {boolean} isLast */
  const stateFor = (outcome, isLast) => {
    const isGreen = outcome === 'green' || outcome === 'already-green' || outcome === 'satisfied';
    if (outcome !== null && outcome !== undefined) return isGreen ? 'done' : 'stopped';
    if (isLast && death.died) return 'died';
    if (isLast && summary.outcome === null) return 'running';
    return 'waiting';
  };

  // item 4 (2026-09-25): a PLAN run keeps one box per step, each carrying its
  // own `attempts` (src/replay.js's new per-step field — one entry per
  // exit-eval that actually ran, reusing that SAME windowing, never a second
  // one). A LOOP-shape run (no step-start at all — an older/non-plan run,
  // `timelineKind:'iterations'`) used to render ONE box PER ITERATION
  // (labelled "1 iteration 1", "2 iteration 2", …, each counted as if it
  // were its own step); it now renders as ONE implicit step whose `attempts`
  // are the run's own iterations, since a loop-shape run's iterations ARE
  // its attempts (there is no separate step layer above them to attach to).
  /** @type {any[]} */
  let steps;
  if (timelineKind === 'iterations') {
    const units = summary.iterations;
    const attempts = units.map((u, idx) => ({
      n: idx + 1,
      iteration: u.iteration,
      outcome: (u.verdict === 'green' || u.verdict === 'already-green' || u.verdict === 'satisfied') ? 'green' : 'red',
    }));
    const rounds = units.reduce((acc, u) => acc + u.rounds, 0);
    const allToolsKnown = units.every((u) => typeof u.toolCalls === 'number');
    const toolCalls = allToolsKnown ? units.reduce((acc, u) => acc + (u.toolCalls ?? 0), 0) : null;
    const allWallKnown = units.every((u) => typeof u.wallMs === 'number');
    const wallMs = allWallKnown ? units.reduce((acc, u) => acc + (u.wallMs ?? 0), 0) : null;
    const unpricedRounds = units.reduce((acc, u) => acc + u.unpricedRounds, 0);
    const spentUsd = unpricedRounds > 0 ? null : units.reduce((acc, u) => acc + (u.spentUsd ?? 0), 0);
    steps = units.length === 0 ? [] : [{
      id: summary.job ?? row.job,
      occurrence: null,
      outcome: summary.outcome,
      state: stateFor(summary.outcome, true),
      rounds,
      toolCalls,
      wallMs,
      spentUsd,
      unpricedRounds,
      checks: null,
      treeChanged: null,
      tripped: units.length ? units[units.length - 1].tripped : null,
      attempts,
    }];
  } else {
    steps = summary.steps.map((u, idx) => {
      const isLast = idx === summary.steps.length - 1;
      return {
        id: u.id,
        occurrence: u.occurrence,
        outcome: u.outcome ?? null,
        state: u.stopReason ? 'stopped' : stateFor(u.outcome, isLast),
        rounds: u.rounds,
        toolCalls: u.toolCalls,
        wallMs: u.wallMs,
        spentUsd: u.spentUsd,
        unpricedRounds: u.unpricedRounds,
        checks: u.checks,
        treeChanged: u.treeChanged,
        tripped: u.tripped,
        attempts: u.attempts,
      };
    });
    // P5-R: a step cut off by its leg's halt and CONTINUED by the next leg is ONE step — the summary counts steps, not
    // parts. The continued part replaces the stopped one in this list (so it is done iff its continuation is), and the
    // two parts' rounds/time/spend/attempts are added up (an unknown figure stays unknown).
    /** @type {any[]} */
    const merged = [];
    summary.steps.forEach((u, idx) => {
      const cur = steps[idx];
      const prev = merged[merged.length - 1];
      if (u.continued === true && prev && prev.id === cur.id) {
        const add = (/** @type {number|null} */ a, /** @type {number|null} */ b) => (typeof a === 'number' && typeof b === 'number' ? a + b : null);
        merged[merged.length - 1] = {
          ...cur,
          occurrence: prev.occurrence,
          rounds: add(prev.rounds, cur.rounds),
          toolCalls: add(prev.toolCalls, cur.toolCalls),
          wallMs: add(prev.wallMs, cur.wallMs),
          spentUsd: add(prev.spentUsd, cur.spentUsd),
          unpricedRounds: (prev.unpricedRounds ?? 0) + (cur.unpricedRounds ?? 0),
          attempts: [...(prev.attempts ?? []), ...(cur.attempts ?? [])].map((a, n) => ({ ...a, n: n + 1 })),
        };
      } else merged.push(cur);
    });
    steps = merged;
  }
  // died before any step/iteration ever started (steps empty — the run was
  // still in scout/planning) — one placeholder box, never an empty map. Its
  // "id" IS the map's own display text (the map renders `String(s.id)`
  // verbatim), so no separate client-side special case is needed for the
  // map. `synthetic: true` marks it as a LABEL, not a real step — F196: it
  // was being counted into "steps: 0 of 1 done" (should read "0 of 0"), and
  // the map box carried a "1" number as if it were a real step 1. The
  // client (index.html) excludes any `synthetic` step from both the summary
  // count and the numbered step-card list; the map keeps the one box but
  // renders it without a leading step number.
  if (death.died && steps.length === 0) {
    steps.push({
      id: 'died during planning',
      occurrence: null,
      outcome: null,
      state: 'died',
      rounds: null,
      toolCalls: null,
      wallMs: null,
      spentUsd: null,
      unpricedRounds: 0,
      checks: null,
      treeChanged: null,
      tripped: null,
      attempts: [],
      synthetic: true,
    });
  }
  return {
    // build item (2026-09-26): the LISTED runid (this function's own
    // `runid` parameter, from `runlist`'s row) is the identity — never
    // `summary.runId`, which `resolveSiblings` derives from the spine
    // FILENAME STEM and silently drops a `~2`-style collision suffix
    // runlist assigns when two spines share a basename in different dirs
    // (getRunAudit/getRunRounds/getRunJob already return the parameter
    // directly; this was the one holdout).
    runid,
    job: summary.job ?? row.job,
    goal: summary.goal,
    checkType: checkTypeLabel(summary.verdictType, row.at),
    checkTypeTitle: checkTypeTitle(summary.verdictType, row.at),
    model: summary.model,
    provider: summary.provider,
    judgeModel,
    budgetUsd: summary.budgetUsd,
    glyph: status.sign,
    status,
    // the header's times: when the run started (its list row) and when its last job-end was written (null while live / died)
    startedAt: typeof row.at === 'string' ? row.at : null,
    endedAt: lastJobEndTs(rawSpineRecords),
    outcome: summary.outcome,
    died: death.died,
    stopReason: death.died ? death.why : summary.stopReason,
    // P5 item 1: the Ended block — `{reason, next, line, actions}` (code-owned fixed
    // sentences, {@link endedFor}), `null` while the run is live. `resume` carries the
    // numbers the Resume confirm box prefills (the signed caps, spent so far); `null`
    // whenever Resume is not offered.
    ended,
    // P5 item 5: is the run's LATEST leg live (the page offers Stop only then), and has a stop been asked for
    // (the request file exists beside the spine) — the page reads "stopping after this turn…" until the leg ends
    live: row.via !== 'import' && runIsAlive(row),
    stopping: row.via !== 'import' && runIsAlive(row) && existsSync(stopFilePath(row.spine)),
    // P5-R: the run's legs in order (`after` = how the leg before ended) and the resume count — the Audit tab's
    // dividers and the map's connectors read these; never a second derivation of where a leg starts
    legs: summary.legs,
    // drafting belongs to leg 1: a divider's `beforePart` moves with the parts list it indexes
    legDividers: legDividersFor(rawSpineRecords, summary.parts).map((d) => ({ ...d, beforePart: d.beforePart + draftingShiftHere })),
    resumedCount: Math.max(0, summary.legs.length - 1),
    resume: resume && resume.ok ? {
      budgetUsd: resume.budgetUsd, maxWallMin: resume.maxWallMin, spentUsd: resume.spentUsd, spendComplete: resume.spendComplete,
      wallUsedMs: resume.wallUsedMs,
    } : null,
    spentUsd: summary.spentUsd,
    // draftSpentUsd (hamr's ruling 2026-09-28) — the drafting share of this
    // run's cap, or null when this run carried none. `src/replay.js`'s
    // `moneyWithDraft` is the one place that decides how to render it.
    draftSpentUsd: summary.draftSpentUsd,
    // draftSpendComplete (hamr's ruling 2026-09-28, 2nd addendum) — whether
    // the drafting share above was EXACT; `null` when there is no drafting
    // share to qualify at all. Read by the panel's own `panelMoneyWithDraft`.
    draftSpendComplete: summary.draftSpendComplete,
    // a spend/wall floor summed from real priced rounds/timestamped records
    // present in the file — never null/unknown when at least one priced
    // round exists. `deriveDeath` already returns `null` for both whenever
    // a real job-end WAS reached (the normal `spentUsd`/`wallMs` fields
    // above are the real, complete figures there); build item 6
    // (2026-09-28) widened this from "died runs only" to ALSO cover a
    // genuinely still-running spine, so the Run tab can show a running
    // floor instead of "unknown" while a run is live.
    spendFloorUsd: death.spendFloorUsd,
    wallFloorMs: death.wallFloorMs,
    spendComplete: summary.spendComplete,
    wallMs: summary.wallMs,
    timelineKind,
    steps,
    // scoutPlan/fixLoop (panel build item 1, 2026-09-26): reused VERBATIM off
    // `replayOne`'s own already-computed fields — never a second windowing
    // pass here. Both `null` on the common case (no scout/plan rounds, or the
    // close was satisfied on its first outer-close precheck with no fix loop
    // ever starting) — see src/replay.js's own construction comments.
    scoutPlan: summary.scoutPlan,
    fixLoop: summary.fixLoop,
    // parts (panel build item B/C, 2026-09-26): the ONE ordered part list
    // (`src/replay.js`'s own field, computed once server-side) — drives the
    // Run tab's map+cards and the Audit tab's grouped rows. Passed through
    // VERBATIM (never re-derived client-side) EXCEPT each attempt's own
    // declared-close `stages` array, which gets its per-stage `kind`/
    // `direction`/`baselineKind` attached here (build item, 2026-09-28: the
    // gap 764a9ef named — the signed closeDecl is the only place this lives,
    // and it is not part of `replayOne`'s own spine-derived shape) — see
    // {@link enrichPartsWithStageKind}. `kindMeta` is `null` (every stage
    // passes through unchanged) whenever no spec resolves at all, so the two
    // tabs still never disagree about order/counts/blocked-call figures.
    // a run that DIED (no job-end, runner gone — `death`, decided once above) leaves its last part in flight: that part reads
    // `died`, never the "happened, so passed" default. Replay alone cannot tell died from still running, so the verdict lives here.
    parts: (draftingPartHere && Array.isArray(enrichedParts) ? [draftingPartHere, ...enrichedParts] : enrichedParts)?.map((p, i, all) => ({ ...p, status: partStatusFor(death.died && i === all.length - 1 && p.kind !== 'drafting' && p.outcome == null && !p.stopReason ? { ...p, stopReason: 'died' } : p) })),
    replans: summary.replans,
    close: summary.close,
    branch: summary.branch,
    date: typeof row.at === 'string' ? row.at.slice(0, 10) : null,
    at: row.at,
    via: row.via,
    skipped: summary.skipped,
    // item 7 (2026-09-25), corrected item 2 (2026-09-25): the Run summary's
    // tools/cache rows. `behaviour` is {@link scopedBehaviour} — the SAME
    // gate-audit rows the Audit tab now shows (this run's own job-start..
    // job-end ts window, item 2's fix for a real measured defect: a
    // gate-audit sidecar CAN carry other runs' rows when several spines
    // share one filename — see {@link runAuditWindows}'s doc) — never
    // `replayRun`'s own top-level `summary.behaviour`, which reads the
    // WHOLE sidecar file unscoped and is contaminated on a real archived run
    // (measured: pulselog-person-live-2's mu2p83go reads 142 unscoped tool
    // calls vs 82 once scoped to this run's own window; `bareloop replay`'s
    // CLI output, src/replay.js, still reports the old unscoped figure —
    // untouched here, flagged separately, out of this panel-only fix's
    // scope). `null` when no gate-audit sidecar was ever found (never a fake
    // all-zero object). `memoryCache` is still reused verbatim from
    // `replayRun` (a single spine record, never audit-sidecar-sourced, so it
    // carries no contamination risk); `null` when the spine carries no
    // `memory-cache` record at all (never armed on this run).
    behaviour: scopedBehaviour(row, rawSpineRecords),
    memoryCache: summary.memoryCache,
  };
}

/**
 * The `[startTs, endTs]` window (both epoch ms, `endTs` possibly
 * `Infinity`) that actually belongs to ONE run inside a gate-audit sidecar
 * that can be SHARED across several runs' spines pointing at the same
 * filename (measured directly on a real archived patient — pulselog-person-
 * live-2, run mu2p83go: its sidecar carries rows from 7 distinct `run_id`s
 * spanning 06:56Z to 13:25Z on one day, but the run's own `job-start`..
 * `job-end` window is 13:19:40Z..13:25:48Z; every row before that window
 * belongs to an EARLIER, unrelated run that happened to reuse the same
 * sidecar path). F195: this is a thin wrapper over `src/replay.js`'s own
 * {@link auditWindow} — the ONE owner of this rule (`replayRun` itself now
 * applies it too, so `bareloop replay` and the panel can never disagree
 * about which rows belong to a run) — kept here only to find `job-start`/
 * `job-end` off the raw `spineRecords` array the panel already has in hand.
 * @param {any[]} spineRecords
 * @returns {{startTs: number, endTs: number}[]} one window per leg of the run (P5-R); one for a run nobody resumed
 */
function runAuditWindows(spineRecords) {
  return auditWindowsOf(spineRecords);
}

/** @param {string} ts @param {{startTs: number, endTs: number}[]} windows */
function inAnyWindow(ts, windows) {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) && windows.some((w) => ms >= w.startTs && ms <= w.endTs);
}

/**
 * The `round` column (item 2, 2026-09-25): which model-call round was
 * running when an audit row happened, derived from ts ordering against this
 * spine's own round-spending records (`SPEND_RECORD_TYPES` —
 * `worker-round`/`judge-round`/`worker-turn`, the same canonical set
 * `src/replay.js` itself imports rather than re-spelling). Round N's window
 * opens at that Nth record's own `ts` (measured on mu2p83go: a round record's
 * `ts` lands within ~10ms of its own gate-audit `llm` row, i.e. essentially
 * simultaneous — the round record fires right as the model call is logged,
 * before its resulting tool calls run) and stays open until the NEXT round
 * record's `ts`, so every tool call the round's own model turn asked for
 * lands inside it. A row whose `ts` falls BEFORE the first round record
 * (scout/materials/pre-round activity) gets `null` — never a fabricated
 * round 0 or round 1 — same honesty rule as an unparseable ts.
 * @param {any[]} spineRecords
 * @returns {(rowTs: string|null) => number|null}
 */
/**
 * Every `SPEND_RECORD_TYPES` round record on this spine with a parseable
 * `ts`, sorted ascending — the ONE shared derivation {@link makeRoundLookup}
 * (the `round` number column) and {@link makePartLookup} (the Audit
 * tab's `step` column, item 2, 2026-09-26) both build on, so the two can
 * never disagree about which record is "round N".
 * @param {any[]} spineRecords
 * @returns {any[]}
 */
function sortedRoundRecords(spineRecords) {
  return spineRecords
    .filter((r) => r && SPEND_RECORD_TYPES.includes(r.type) && typeof r.ts === 'string' && Number.isFinite(Date.parse(r.ts)))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function makeRoundLookup(spineRecords) {
  const roundTsMs = sortedRoundRecords(spineRecords).map((r) => Date.parse(r.ts));
  return (rowTs) => {
    if (typeof rowTs !== 'string') return null;
    const ms = Date.parse(rowTs);
    if (!Number.isFinite(ms)) return null;
    let lo = 0;
    let hi = roundTsMs.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (roundTsMs[mid] <= ms) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found === -1 ? null : found + 1; // 1-indexed round number
  };
}

/**
 * One owner for "where does THIS run's gate-audit sidecar live on disk right
 * now" — used by both {@link scopedBehaviour} (Run tab) and {@link
 * getRunAudit} (Audit tab), so the two can never disagree. Two cases:
 *  (a) the FINISHED convention ({@link resolveSiblings}: `<spine-stem>-
 *      gate-audit.jsonl` beside the spine) — `run-u`'s end-of-run rename
 *      (`src/userrun.js:1727-1729`) and every existing archived-run test
 *      already reads this shape;
 *  (b) LIVE fallback (panel P2 defect 3, hamr-watched run mujjtrvd,
 *      2026-09-27): while a run has no `job-end` yet, its sidecar is still
 *      sitting at its DURING-RUN path, `<row.patient>/gate-audit.jsonl` —
 *      `run-u` writes it at `wd` (`src/userrun.js:1727`'s `auditSrc`) and
 *      `bareloop run`/`via:'bundle'` writes it at the worktree
 *      (`src/cli.js:448`'s `auditSrc`); `row.patient` already carries
 *      exactly that path for both (`src/userrun.js:1355`, `src/cli.js:418`),
 *      so this one fallback covers both without knowing which via wrote it.
 *      Only tried when (a) found nothing AND this run's own spine carries no
 *      `job-end` yet, so a finished run never pays the extra stat and never
 *      risks reading a stale leftover file ((a)'s rename already moved it
 *      away by the time job-end lands). `row.patient` is `null` on a
 *      `backfill` row (never a live run) and on some pre-cutoff `run-u` rows
 *      — both correctly fall through to `null` here.
 * Callers still scope the rows they read from this file by this run's own
 * job-start..job-end ts window ({@link runAuditWindows}) — a shared tree/
 * worktree gate-audit file can carry another run's rows too (this file's own
 * header comment on `runAuditWindow`), live or finished.
 *
 * NOT handled here (a separate, pre-existing gap, out of this fix's scope):
 * a FINISHED `via:'bundle'` run's sidecar is renamed to a bare
 * `gate-audit.jsonl` inside its own `runs/<runid>/` dir (`src/cli.js:449`),
 * but its spine is named `spine.jsonl`, so {@link resolveSiblings} looks for
 * `spine-gate-audit.jsonl` and never finds it — a finished bundle run reads
 * `no-sidecar`/`toolLogSaved:false` even though its tool log really was
 * saved. Reported, not fixed here (a naming mismatch in `src/cli.js`'s own
 * rename target, not a panel-server read-path bug).
 * @param {{spine: string, patient: string|null}} row
 * @param {any[]} spineRecords
 * @returns {string[]} every file the run's tool log is in, earliest leg first (empty: none was ever written)
 */
function resolveAuditPathsForRow(row, spineRecords) {
  /** @type {string[]} */
  const paths = [];
  const { auditPath } = resolveSiblings(row.spine);
  if (auditPath && existsSync(auditPath)) paths.push(auditPath);
  // P5-R: a resumed run's LIVE leg writes its tool log in the patient tree while the earlier legs' rows already sit in
  // the run's own file — both are the run's, in that order. "Live" = the LATEST leg has no job-end yet.
  const last = legsOf(spineRecords).at(-1);
  const hasJobEnd = last ? last.jobEnd !== null : spineRecords.some((r) => r && r.type === 'job-end');
  if (hasJobEnd) return paths;
  if (paths.length > 0 && legsOf(spineRecords).length <= 1) return paths; // a never-resumed run's sibling is the whole log
  if (typeof row.patient !== 'string' || row.patient.length === 0) return paths;
  const live = join(row.patient, 'gate-audit.jsonl');
  if (existsSync(live) && !paths.includes(live)) paths.push(live);
  return paths;
}

/**
 * `runBehaviour`, fed only the gate-audit rows inside this run's own ts
 * window (see {@link runAuditWindows}) — the panel-side fix for the same
 * contamination `getRunAudit` fixes for the Audit tab, kept as ONE shared
 * scoping function so the Audit tab and the Run tab's tools/cache summary
 * can never disagree with each other about which rows belong to this run.
 * `null` when no gate-audit sidecar exists at all (never a fake all-zero
 * object — same rule `replayRun`'s own `auditAvailable` already follows).
 * `auditPath` resolution (finished sibling, or the live during-run fallback)
 * is {@link resolveAuditPathsForRow} — the one shared owner.
 * @param {{spine: string, patient: string|null}} row
 * @param {any[]} spineRecords
 * @returns {ReturnType<typeof runBehaviour>|null}
 */
function scopedBehaviour(row, spineRecords) {
  const auditPaths = resolveAuditPathsForRow(row, spineRecords);
  if (auditPaths.length === 0) return null;
  const windows = runAuditWindows(spineRecords);
  const windowed = auditPaths.flatMap((ap) => parseJsonl(ap).records).filter((r) => r && typeof r === 'object' && typeof r.ts === 'string' && inAnyWindow(r.ts, windows));
  return runBehaviour(windowed);
}

/**
 * The Audit tab's part/attempt columns (build item C, 2026-09-26) — REPLACES
 * `makeRoundPhaseLookup`'s phase-string heuristic (deleted here): that
 * function mislabelled replan rounds as `plan` and needed a whole per-kind
 * switch statement to recognize scout/plan/fix/step phases. `summary.parts`
 * (`src/replay.js`'s own ONE ordered part list) already carries every part's
 * own attempt seq windows (`startSeq`/`endSeq`, exclusive/inclusive same as
 * every other windowing rule in this codebase) — a round's OWN `seq` matched
 * against those windows tells you which part+attempt it belongs to directly,
 * with no phase-string special-casing and no risk of a replan window being
 * mislabelled as its neighbouring plan/step window (each part owns a
 * disjoint, contiguous seq range by construction — see `src/replay.js`'s
 * `parts` builder).
 *
 * `partIndex`/`attemptN` are `null` (never a guessed 0) when the round's own
 * seq falls before this run's very first part-attempt window (should not
 * happen on a spine with at least a `job-start`, since the first part's first
 * attempt always opens at `-Infinity`, but a malformed/partial spine is
 * handled honestly rather than assumed).
 * @param {ReturnType<typeof import('../replay.js').replayRun>} summary
 * @returns {(roundRecord: any|null) => {partIndex: number|null, partLabel: string|null, attemptN: number|null, reason: 'no-round'|'unassigned'|null}}
 */
function makePartLookup(summary) {
  const parts = Array.isArray(summary.parts) ? summary.parts : [];
  return (roundRecord) => {
    if (!roundRecord) return {
      partIndex: null, partLabel: null, attemptN: null, reason: 'no-round',
    };
    const seq = typeof roundRecord.seq === 'number' ? roundRecord.seq : null;
    if (seq === null) return {
      partIndex: null, partLabel: null, attemptN: null, reason: 'unassigned',
    };
    for (let pi = 0; pi < parts.length; pi += 1) {
      const attempts = Array.isArray(parts[pi].attempts) ? parts[pi].attempts : [];
      for (const a of attempts) {
        if (typeof a.startSeq === 'number' && typeof a.endSeq === 'number' && seq > a.startSeq && seq <= a.endSeq) {
          return {
            partIndex: pi, partLabel: partDisplayLabel(parts[pi]), attemptN: a.n, reason: null,
          };
        }
      }
    }
    return {
      partIndex: null, partLabel: null, attemptN: null, reason: 'unassigned',
    };
  };
}

/**
 * The part's own display label — the step id (plus a "(try N)" suffix on a
 * replanned occurrence) for a `kind:'step'` part, else the part's plain
 * `label` (scout/plan/replan/fix/judge/run). ONE owner shared by the Audit
 * tab's grouped rows and this file's flat-row lookup above.
 * @param {any} part
 * @returns {string}
 */
function partDisplayLabel(part) {
  if (part.kind === 'step' && part.occurrence > 1) return `${part.label} (try ${part.occurrence})`;
  return part.label;
}

/**
 * The run's tree root (the patient's own working directory) — used to
 * shorten every path the Audit tab shows (item 2, 2026-09-26 build spec).
 * Resolution order, honest at every step, never a guessed root:
 *  (a) `row.patient` — the run list's own recorded workdir (`run-u`/`bundle`
 *      rows carry it directly — see `src/runlist.js`'s `RunRow` shape,
 *      `src/userrun.js:1355`/`src/cli.js:418`); the real thing, trusted as-is;
 *  (b) the source-seed layout's own `tree/` dir — the same `into` derivation
 *      {@link sourceNearSpine} uses (`dirname(dirname(spine))`, only when its
 *      basename starts with `source-`) plus `tree` (verified against
 *      `src/userrun.js`'s own `specWorkdir = join(into, 'tree')`, and against
 *      a real archived run, pulselog-person-live-2's mu2p83go, whose row
 *      carries `patient: null` since it was `runs backfill`-added — a
 *      backfilled person-path run's tree root is ONLY ever recovered this
 *      way); only trusted when that directory actually exists on disk;
 *  else `null` — every path stays absolute, never shortened against a guess.
 * @param {{ spine: string, patient: string|null }} row
 * @returns {string|null}
 */
function treeRootForRun(row) {
  if (typeof row.patient === 'string' && row.patient.length > 0) return row.patient;
  const into = dirname(dirname(row.spine));
  if (!basename(into).startsWith('source-')) return null;
  const tree = join(into, 'tree');
  return existsSync(tree) ? tree : null;
}

/**
 * Shortens an absolute `path` to be relative to `root` when it genuinely
 * lives under `root` (the tree root itself shortens to `'.'`) — a path
 * outside `root`, or a `null`/missing `root`, is returned exactly as given,
 * never truncated to something that only LOOKS relative (item 2).
 * @param {string|null} path
 * @param {string|null} root
 * @returns {string|null}
 */
function shortenPath(path, root) {
  if (typeof path !== 'string' || path.length === 0 || !root) return path;
  const rel = relative(root, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return path;
  return rel;
}

/**
 * `GET /api/runs/:runid/audit` — the Audit tab's rows, off the run's own
 * gate-audit sidecar (name-convention resolution, `src/replayio.js`'s
 * `resolveSiblings`), scoped to this run's own ts window (see {@link
 * runAuditWindow} — a sidecar can carry other runs' rows). A row's real
 * fields (`ts`, `action.type`, `action.path`, `decision`) plus `partIndex`/
 * `partLabel`/`attemptN` — see {@link makePartLookup} (build item C,
 * 2026-09-26 rewrite): derived from the row's own ROUND's `seq` matched
 * against `summary.parts`' own attempt windows, never phase-string guessing.
 * `reason` names WHY `partIndex` is `null`: `'no-round'` (the row's `ts` falls
 * before the very first model call) vs `'unassigned'` (a round exists but its
 * seq matched no part window — an honest gap, never fabricated) vs `null`
 * when `partIndex` is real.
 * `round` — see
 * {@link makeRoundLookup}. A `phase:'record'`/`action.type:'llm'` row (item
 * 2: every MODEL CALL, `decision` always `null` on the real record) is
 * marked `kind:'model-call'` with its own `result.{costUsd,tokens,
 * durationMs}` surfaced directly (never re-derived); every other row is
 * `kind:'tool-call'`, unchanged.
 * `reason` distinguishes the two ways this can come back empty (item 1,
 * 2026-09-25): `'no-sidecar'` — no gate-audit sidecar was ever written for
 * this run (an older version, or a run-u/native path that never emitted one)
 * — vs `'sidecar-empty'` — a sidecar file DOES exist but has zero rows FOR
 * THIS RUN'S OWN WINDOW (the run made no tool/model calls the gate audited,
 * or every row on disk belongs to a different run sharing the same
 * filename). The client renders these as two different sentences; never a
 * bare empty table for either.
 * @param {string} runid
 * @param {{ home?: string }} [opts]
 * @returns {{runid: string, rows: any[], raw: string, empty: boolean, reason: 'no-sidecar'|'sidecar-empty'|null}|null}
 */
export function getRunAudit(runid, opts = {}) {
  const row = findRunRow(runid, opts);
  if (!row) return null;
  if (!existsSync(row.spine)) {
    return {
      runid, rows: [], raw: '', empty: true, reason: 'no-sidecar',
    };
  }
  const { records: spineRecords, skipped: spineSkipped } = parseJsonl(row.spine);
  // {@link resolveAuditPathsForRow} needs `spineRecords` (to know whether this
  // run has reached `job-end` yet) before it can decide whether the LIVE
  // during-run fallback is even worth trying — so the spine is parsed once,
  // here, before the sidecar path is resolved (moved up from right after the
  // old `resolveSiblings`-only check this replaces).
  const auditPaths = resolveAuditPathsForRow(row, spineRecords);
  if (auditPaths.length === 0) {
    return {
      runid, rows: [], raw: '', empty: true, reason: 'no-sidecar',
    };
  }
  const windows = runAuditWindows(spineRecords);
  const roundOf = makeRoundLookup(spineRecords);
  const roundRecords = sortedRoundRecords(spineRecords);
  // `preParsedSpine` avoids a second parse of the same spine file just read
  // above; `skipAudit:true` since this call only needs `summary.parts`' own
  // attempt seq windows (for {@link makePartLookup}), never `replayOne`'s own
  // audit-derived `behaviour` field.
  const summary = replayOne(row.spine, {
    preParsedSpine: { records: spineRecords, skipped: spineSkipped },
    skipAudit: true,
  });
  const partOf = makePartLookup(summary);
  const shift = draftingShift(row, summary, opts); // the drafting part heads the shown list: every index moves with it

  const { records } = { records: auditPaths.flatMap((ap) => parseJsonl(ap).records) };
  const windowed = records.filter((r) => r && typeof r === 'object' && typeof r.ts === 'string' && inAnyWindow(r.ts, windows));
  // item 1 (build item, 2026-09-26): "Raw log" must show only THIS run's own
  // window, same rule as `windowed` above (a sidecar can carry other runs'
  // rows — see {@link runAuditWindows}'s doc). Filtered at the LINE level
  // (never the parsed-record level) so a matched line stays byte-for-byte —
  // "raw" means raw, not a re-serialized JSON.stringify of the parsed
  // object. A line whose `ts` can't be parsed (malformed JSON, or a
  // well-formed row missing/mistyping `ts`) is dropped rather than guessed
  // into the window, matching the same honesty rule `windowed` already
  // follows for its own rows.
  const rawText = auditPaths.map((ap) => readFileSync(ap, 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => {
      let r;
      try { r = JSON.parse(line); } catch { return false; }
      return !!r && typeof r === 'object' && typeof r.ts === 'string' && inAnyWindow(r.ts, windows);
    })
    .join('\n');
  // item 2 (2026-09-26 build spec): every row's path shortened relative to
  // the run's own tree root — computed ONCE here, never per-row, since the
  // root never changes within one run's rows.
  const treeRoot = treeRootForRun(row);
  const auditRows = windowed.map((r) => {
    const isModelCall = r.action && r.action.type === 'llm';
    const resultObj = isModelCall && r.result && typeof r.result === 'object' ? r.result : null;
    const n = roundOf(r.ts);
    const {
      partIndex, partLabel, attemptN, reason,
    } = partOf(n === null ? null : roundRecords[n - 1]);
    const path = r.action && typeof r.action.path === 'string' ? r.action.path : null;
    return {
      time: typeof r.ts === 'string' ? r.ts : null,
      action: r.action && typeof r.action.type === 'string' ? r.action.type : null,
      path,
      pathShort: shortenPath(path, treeRoot),
      decision: typeof r.decision === 'string' ? r.decision : null,
      partIndex: partIndex === null ? null : partIndex + shift,
      partLabel,
      attemptN,
      reason,
      round: n,
      kind: isModelCall ? 'model-call' : 'tool-call',
      costUsd: resultObj && typeof resultObj.costUsd === 'number' && Number.isFinite(resultObj.costUsd) ? resultObj.costUsd : null,
      tokens: resultObj && typeof resultObj.tokens === 'number' && Number.isFinite(resultObj.tokens) ? resultObj.tokens : null,
      durationMs: resultObj && typeof resultObj.durationMs === 'number' && Number.isFinite(resultObj.durationMs) ? resultObj.durationMs : null,
    };
  });
  const empty = auditRows.length === 0;
  return {
    runid, rows: auditRows, raw: rawText, empty, reason: empty ? 'sidecar-empty' : null,
  };
}

/** The default/max page size for {@link getRunRounds} — tighten-only,
 * named so a future change is a deliberate, visible edit (item 5,
 * 2026-09-25). */
export const ROUNDS_PAGE_DEFAULT = 50;
export const ROUNDS_PAGE_MAX = 200;

/**
 * `GET /api/runs/:runid/rounds?part=<index>&attempt=<n>&offset=&limit=`
 * — build item C (2026-09-26 rewrite): the Audit tab's expandable attempt
 * detail, built server-side in one endpoint and rendered lazily on expand.
 * REPLACES the earlier step-id/occurrence/`FIX_LOOP_STEP_ID`-sentinel/
 * `timelineKind` branching (three separate ways to resolve a window,
 * deleted here) with ONE rule: `part` indexes directly into
 * `summary.parts` (`src/replay.js`'s own ONE ordered part list — scout,
 * plan, each step occurrence, replan, fix, judge, or a single `run` part on
 * an old spine), and `attempt` indexes into THAT part's own `attempts` array
 * — every part kind already carries at least one (a real per-attempt list
 * for `step`/`fix`, or a single synthetic whole-part attempt for
 * scout/plan/replan/judge/run, `src/replay.js`'s `wholePartAttempt`). No
 * second windowing pass: each attempt's own `startSeq`/`endSeq` is read
 * directly off `replayOne`'s already-computed summary.
 * Tool calls per round reuse {@link getRunAudit}'s own already-scoped,
 * already-round-tagged rows — filtered to this round's number, never
 * re-derived. `toolLogSaved:false` (no gate-audit sidecar at all) still
 * returns every round from the spine's own worker-round records, each with
 * `toolCalls: null` (never a fabricated empty array — the client renders
 * "tool calls: no log saved").
 * Pagination: `offset`/`limit` slice the ATTEMPT's rounds list (never a
 * round's own tool-call list) — `limit` defaults to {@link
 * ROUNDS_PAGE_DEFAULT}, clamped to {@link ROUNDS_PAGE_MAX}; the response
 * always carries `totalRounds` so the client can print "showing A–B of N",
 * never a silently truncated list.
 * `null` when the run isn't listed, the requested part/attempt index doesn't
 * resolve to a real window, or the spine file is missing — the caller
 * renders 404, same posture as {@link getRunAudit}/{@link getRunJob}.
 * @param {string} runid
 * @param {{ part?: number, attempt?: number, offset?: number, limit?: number }} query
 * @param {{ home?: string }} [opts]
 * @returns {any|null}
 */
export function getRunRounds(runid, query = {}, opts = {}) {
  const row = findRunRow(runid, opts);
  if (!row) return null;
  if (!existsSync(row.spine)) return null;

  const partIndex = typeof query.part === 'number' && Number.isInteger(query.part) && query.part >= 0 ? query.part : 0;
  const attempt = typeof query.attempt === 'number' && Number.isInteger(query.attempt) && query.attempt > 0 ? query.attempt : 1;
  const offset = typeof query.offset === 'number' && Number.isInteger(query.offset) && query.offset >= 0 ? query.offset : 0;
  const limit = typeof query.limit === 'number' && Number.isInteger(query.limit) && query.limit > 0
    ? Math.min(query.limit, ROUNDS_PAGE_MAX) : ROUNDS_PAGE_DEFAULT;

  const summary = replayOne(row.spine);
  // `part` is an index into the SHOWN list (`detail.parts`): when the drafting part heads it, index 0 is the drafting
  // part (it has no rounds table) and the spine's own part k is shown at k + 1
  const shift = draftingShift(row, summary, opts);
  if (shift && partIndex === 0) return null;
  const part = Array.isArray(summary.parts) ? summary.parts[partIndex - shift] : null;
  if (!part) return null;
  const a = Array.isArray(part.attempts) ? part.attempts[attempt - 1] : null;
  if (!a) return null;
  /** @type {{startSeq: number, endSeq: number, outcome: string|null, detail: string|null}} */
  const window = {
    startSeq: a.startSeq,
    endSeq: a.endSeq,
    outcome: a.outcome,
    detail: a.detail ?? (a.verdict || a.stages ? closeStageDetail({ verdict: a.verdict, stages: a.stages }) : null),
  };
  const stepLabel = partDisplayLabel(part);

  const { records: spineRecords } = parseJsonl(row.spine);
  const roundOf = makeRoundLookup(spineRecords);
  const roundRecordsInWindow = spineRecords
    .filter((r) => r && SPEND_RECORD_TYPES.includes(r.type) && typeof r.seq === 'number' && r.seq > window.startSeq && r.seq <= window.endSeq)
    .sort((a, b) => a.seq - b.seq);

  const auditResult = getRunAudit(runid, opts);
  const toolLogSaved = !!auditResult && auditResult.reason !== 'no-sidecar';
  /** @type {Map<number, any[]>} */
  const toolsByRound = new Map();
  if (toolLogSaved) {
    for (const r of auditResult.rows) {
      if (r.kind !== 'tool-call' || typeof r.round !== 'number') continue;
      const bucket = toolsByRound.get(r.round) ?? [];
      bucket.push(r);
      toolsByRound.set(r.round, bucket);
    }
  }

  const totalRounds = roundRecordsInWindow.length;
  const page = roundRecordsInWindow.slice(offset, offset + limit);
  const rounds = page.map((r) => {
    const n = roundOf(r.ts);
    const modelCallRow = toolLogSaved ? auditResult.rows.find((a) => a.kind === 'model-call' && a.round === n) : null;
    return {
      n,
      ts: typeof r.ts === 'string' ? r.ts : null,
      costUsd: typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? r.costUsd : null,
      tokens: typeof r.tokens === 'number' && Number.isFinite(r.tokens) ? r.tokens : null,
      durationMs: modelCallRow ? modelCallRow.durationMs : null,
      toolCalls: toolLogSaved ? (n === null ? [] : (toolsByRound.get(n) ?? [])) : null,
    };
  });

  return {
    runid,
    part: partIndex,
    partKind: part.kind,
    step: stepLabel,
    occurrence: part.kind === 'step' ? part.occurrence : null,
    attempt,
    rounds,
    totalRounds,
    offset,
    limit,
    check: { outcome: window.outcome, detail: window.detail },
    toolLogSaved,
  };
}

/**
 * The `↳ close:`-style text for one iteration's OWN close-verdict — same
 * shape as `src/replay.js`'s private `closeStageLine`, but that helper is
 * not exported (a formatting concern of the CLI's printable page); the
 * `/rounds` endpoint needs the same "failing stage names" text as plain
 * data, not a pre-formatted line, so it is derived here instead of importing
 * a print-only helper.
 * @param {{verdict: string|null, stages: any[]|null}|null} closeStage
 * @returns {string|null}
 */
function closeStageDetail(closeStage) {
  if (!closeStage || !closeStage.verdict) return null;
  const failing = Array.isArray(closeStage.stages) ? closeStage.stages.filter((s) => s && s.verdict !== 'satisfied').map((s) => s.name) : [];
  return failing.length ? `failing: ${failing.join(', ')}` : null;
}

/**
 * `<x>/runs/<runid>/spine.jsonl` -> `<x>` (the bundle directory carrying
 * `spec.json` — see `src/bundle.js`'s own export layout). `null` for every
 * other spine layout (run-u's free-standing spines have no bundle dir at
 * all — resolving one would mean guessing, which this function refuses to
 * do).
 * @param {string} spinePath
 * @returns {string|null}
 */
function bundleDirForSpine(spinePath) {
  if (basename(spinePath) !== 'spine.jsonl') return null; // only the bundle layout uses this bare filename
  const runsDir = dirname(dirname(spinePath)); // <x>/runs/<runid> -> <x>/runs
  if (basename(runsDir) !== 'runs') return null; // not actually the bundle layout
  return dirname(runsDir); // <x>/runs -> <x>
}

/**
 * `<out>/source-<seed>/<job>-bareloop/u-<runid>.jsonl` -> the two files an
 * authoring session leaves BESIDE that layout — `<out>/resolved-spec.json`
 * (the signed spec `--spec`/a JOBS-table row ran) and
 * `<out>/source-<seed>/source.json` (the source front door's manifest) —
 * verified against `src/userrun.js`'s own construction (`specWorkdir = join(into,
 * 'tree')`, `spineDir = join(wd, '..', target.spine)`, both `--spec` and the
 * `pulselog-person-strict` JOBS-table row read `into` the same way) and a real
 * archived run (pulselog-person-live-2, run mu2p83go): `dirname(spine)` is
 * `<into>/<job>-bareloop`, `dirname(dirname(spine))` is `<into>` itself
 * (`source-<seed>`, carrying `source.json`), and `dirname(dirname(dirname(spine)))`
 * is `<out>` (carrying `resolved-spec.json`).
 *
 * Only resolves when `<into>`'s own name starts with `source-` — the one
 * shape marker this convention always carries — and each file is checked to
 * actually exist before being handed back; any other spine layout (the bundle
 * `spine.jsonl`, a JOBS-table row whose workdir has no source-seed copy, e.g.
 * `litectx-u`) returns both fields `null`, never a guessed path (build spec
 * item 2, 2026-09-25: "don't search the disk broadly — fall through").
 * @param {string} spinePath
 * @returns {{ specPath: string|null, sourceJsonPath: string|null }}
 */
function sourceNearSpine(spinePath) {
  const into = dirname(dirname(spinePath)); // <into>/<job>-bareloop/u-x.jsonl -> <into>
  if (!basename(into).startsWith('source-')) return { specPath: null, sourceJsonPath: null };
  const sourceJsonPath = join(into, 'source.json');
  const specPath = join(dirname(into), 'resolved-spec.json'); // <into> -> <out>
  return {
    specPath: existsSync(specPath) ? specPath : null,
    sourceJsonPath: existsSync(sourceJsonPath) ? sourceJsonPath : null,
  };
}

/**
 * P6 item 1 — the worktree a run worked on in the person's own repo, read off the run's own `source.json` (the manifest
 * the source door wrote: `worktree` + `repo`) and its spine's `work-branch` record. `null` for every run that has none
 * (a copied-tree run, a bundle run, an import). `exists` is whether the folder is still on disk: a green run's folder is
 * removed by the engine, any other ending leaves it.
 * @param {{ spine: string }} row
 * @param {any[]} records the run's raw spine records
 * @returns {{folder: string, repo: string, branch: string|null, exists: boolean}|null}
 */
function worktreeOfRun(row, records) {
  const near = sourceNearSpine(row.spine);
  if (!near.sourceJsonPath) return null;
  let m;
  try { m = JSON.parse(readFileSync(near.sourceJsonPath, 'utf8')); } catch { return null; }
  if (typeof m?.worktree !== 'string' || m.worktree === '' || typeof m?.repo !== 'string') return null;
  const wb = records.findLast((r) => r && r.type === 'work-branch' && typeof r.branch === 'string') ?? null;
  return { folder: m.worktree, repo: m.repo, branch: wb ? wb.branch : null, exists: existsSync(m.worktree) };
}

/**
 * The resolved SPEC OBJECT for a run — routes (a) bundle `spec.json`, (b)
 * `jobs/<job>.json`, (c) the run's own `resolved-spec.json` beside the spine
 * (the three real-spec routes {@link getRunJob}'s `fromSpec` also tries, in
 * the same order; never route (d), the run's own job-start record, which
 * carries no `closeDecl` for {@link stageKindMetaFromSpec} to read a
 * stage's kind from). A specHash mismatch against `jobs/<job>.json` is NOT
 * checked here — the Job tab's own mismatch note is a display concern of
 * that endpoint, not a reason to withhold a stage's kind (the declaration a
 * hash mismatch flags is still the one the close actually ran under until
 * the run is repeated). `null` when no route resolves or every candidate
 * fails to parse as an object — never a guessed spec.
 * @param {{ spine: string, job: string }} row
 * @returns {any|null}
 */
function resolveSpecForRow(row) {
  if (!existsSync(row.spine)) return null;
  const bundleDir = bundleDirForSpine(row.spine);
  const bundleSpecPath = bundleDir ? join(bundleDir, 'spec.json') : null;
  if (bundleSpecPath && existsSync(bundleSpecPath)) {
    try {
      const spec = JSON.parse(readFileSync(bundleSpecPath, 'utf8'));
      if (spec && typeof spec === 'object') return spec;
    } catch { /* falls through to the next route */ }
  }
  const jobsSpecPath = join(jobsDir(), `${row.job}.json`);
  if (existsSync(jobsSpecPath)) {
    try {
      const spec = JSON.parse(readFileSync(jobsSpecPath, 'utf8'));
      if (spec && typeof spec === 'object') return spec;
    } catch { /* falls through to the next route */ }
  }
  const near = sourceNearSpine(row.spine);
  if (near.specPath) {
    try {
      const spec = JSON.parse(readFileSync(near.specPath, 'utf8'));
      if (spec && typeof spec === 'object') return spec;
    } catch { /* no spec resolvable */ }
  }
  return null;
}

/**
 * THE PLAIN-QUESTION OWNER (plain-checks build, 2026-09-28, hamr's ruling:
 * the "checks N/M" headline is WITHDRAWN — "confusing, reads like 6 failed
 * when 5 never ran"). ONE pure function mapping a declared stage's own
 * signed `kind`+`params` (plus the close's own `genre`, also a signed field)
 * to a short plain-English question a person can read without knowing the
 * catalogue — never a second spelling on the client, and never anything the
 * model authored (the catalogue's kinds/params are the whole vocabulary this
 * reads).
 *
 * Every branch is traced straight off `src/kinds.js`'s runner semantics and
 * the TYPES genre template (`src/authoring.js` `TYPES_GENRE_TEMPLATE`,
 * `classGuards`'s `MECHANICAL_GUARDS`) — never guessed:
 *   - `files-changed` is always the `changed-from-seed` guard: "did it
 *     change any file?"
 *   - `pattern-absent-in-diff` is always the `no-suppressions` guard: "no
 *     casts or silencers added?"
 *   - `command-exit` is the genre's `suite-green` stage (the only shipped use
 *     of this kind): "does the test suite pass?"
 *   - `count-not-worse` splits three ways on its own declared
 *     `direction`/`baseline` (never the runtime number — see
 *     {@link stageKindMetaFromSpec}'s own doc for why the baseline KIND must
 *     travel separately from the measured figure):
 *       - `higher-is-better` + `baseline: 'seed'` is the genre's `tests-kept`
 *         floor: "did all the old tests still exist?"
 *       - `lower-is-better` + `baseline: 0` is the genre's in-scope
 *         `typecheck` stage — UNLESS its own `cmd`+`args` is the SAME
 *         command a `command-exit` stage in the same close already runs
 *         (`suiteCmdKeys`, below): the TYPES template's `suite-green` is "the
 *         suite exits clean AND reports zero failing tests — TWO assertions"
 *         over ONE population (the same `npm test`/`pytest` invocation), so a
 *         `count-not-worse` stage sharing that exact command is the failing-
 *         test-count half of that pair, never a typecheck stage: "no failing
 *         tests?" — derived from the same cmd+args correlation (the stage
 *         counts the suite's own failing tests), never from the stage's own
 *         name string. The live check that found this (run mul5fofw's own
 *         `suite-zero-failing-tests`, cmd `npm test`, same as its sibling
 *         `suite-green` command-exit stage) would otherwise have read "test/
 *         has 0 type errors?", which is false: its parser counts FAILING
 *         TESTS (`^# fail (\d+)$`), not type-checker output. hamr's ruling:
 *         name this half honestly rather than reusing "type errors" for a
 *         population it was never about, or falling back to the stage's raw
 *         name. When the command differs from every sibling `command-exit`
 *         stage, the declared `scope.includePrefixes` naming exactly ONE path
 *         is quoted verbatim (a signed param, never invented): "<path> has 0
 *         type errors?" — otherwise the generic "type errors is 0?", never a
 *         guessed filename.
 *       - `lower-is-better` + `baseline: 'seed'` with a non-empty
 *         `scope.excludePrefixes` is the genre's `typecheck-outside` ceiling:
 *         "other files didn't get more type errors?"
 * The "type errors" wording is genre-owned (`GENRE_WHAT`), because TYPES is
 * the only genre this catalogue admits today (doc-genre kinds are not yet
 * built) — an unrecognised genre, or a `count-not-worse` shape none of the
 * three above matches, returns `null` rather than invent a fourth shape.
 *
 * `null` means "no honest plain question" — the caller (buildAttemptsList,
 * partLine1Text's `attemptChecksLine`) falls back to the stage's OWN name,
 * exactly as it already does for a stage with no resolvable kind at all.
 * @param {{kind: string|null, params: any, genre: string|null, suiteCmdKeys: Set<string>}} o
 * @returns {string|null}
 */
const GENRE_WHAT = Object.freeze({ TYPES: 'type errors' });

/** `cmd`+`args`, as a comparable key — the one signal (besides `kind`
 * itself) that two stages measure the SAME command's output, used to tell a
 * genuine typecheck stage apart from the TYPES genre's other `lower-is-
 * better`/`baseline: 0` stage (the failing-test-count half of `suite-green`'s
 * "two assertions"), which shares that stage's own shape but not its
 * population. `null` for a stage whose `cmd` isn't a non-empty string —
 * never matches anything, so it never falsely suppresses a real typecheck
 * question.
 * @param {any} params @returns {string|null} */
function cmdKey(params) {
  if (!params || typeof params.cmd !== 'string' || params.cmd.length === 0) return null;
  const args = Array.isArray(params.args) ? params.args : [];
  return JSON.stringify([params.cmd, args]);
}

function stageQuestionText({
  kind, params, genre, suiteCmdKeys,
}) {
  if (kind === 'files-changed') return 'did it change any file?';
  if (kind === 'pattern-absent-in-diff') return 'no casts or silencers added?';
  if (kind === 'command-exit') return 'does the test suite pass?';
  if (kind !== 'count-not-worse' || !params || typeof params !== 'object') return null;
  const what = Object.hasOwn(GENRE_WHAT, String(genre)) ? GENRE_WHAT[String(genre)] : null;
  if (params.direction === 'higher-is-better' && params.baseline === 'seed') {
    return 'did all the old tests still exist?';
  }
  if (!what) return null;
  const scope = params.scope && typeof params.scope === 'object' ? params.scope : null;
  if (params.direction === 'lower-is-better' && params.baseline === 0) {
    const key = cmdKey(params);
    if (key !== null && suiteCmdKeys instanceof Set && suiteCmdKeys.has(key)) return 'no failing tests?';
    const include = scope && Array.isArray(scope.includePrefixes) ? scope.includePrefixes : null;
    if (include && include.length === 1 && typeof include[0] === 'string' && include[0].length > 0) {
      return `${include[0]} has 0 ${what}?`;
    }
    return `${what} is 0?`;
  }
  if (params.direction === 'lower-is-better' && params.baseline === 'seed') {
    const exclude = scope && Array.isArray(scope.excludePrefixes) ? scope.excludePrefixes : null;
    if (exclude && exclude.length > 0) return `other files didn't get more ${what}?`;
    return null;
  }
  return null;
}

/**
 * Per-stage `{kind, direction, baselineKind, question}`, keyed by stage NAME,
 * off a resolved spec's own signed `closeDecl.stages` — the facts the client
 * needs to pick §3a's numeric wording (down-to-a-goal / up-out-of-a-total /
 * not-worse-than-a-baseline / pass-fail-only) AND the plain-checks build's
 * own question text ({@link stageQuestionText}), never guessed from the
 * runtime number or the stage's model-authored name alone: a `lower-is-better`
 * stage whose SEED happened to measure 0 is numerically indistinguishable
 * from a `baseline: 0` declared goal, so the declared baseline KIND (`'seed'`
 * vs the literal `0`) has to travel separately from the measured number.
 * Iteration order is `spec.closeDecl.stages`' own DECLARED order (a `Map`
 * preserves insertion order) — the plain-checks build's client reads this
 * same order for a stage's `#N` position and for which declared stages never
 * ran. `null` when the spec has no `closeDecl.stages` array at all (a
 * command-close spec, or no spec resolved).
 * @param {any} spec
 * @returns {Map<string, {kind: string|null, direction: string|null, baselineKind: 'seed'|0|null, question: string|null}>|null}
 */
function stageKindMetaFromSpec(spec) {
  if (!spec || typeof spec !== 'object' || !spec.closeDecl || !Array.isArray(spec.closeDecl.stages)) return null;
  const genre = typeof spec.closeDecl.genre === 'string' ? spec.closeDecl.genre : null;
  // every command-exit stage's own cmd+args, gathered FIRST (a separate pass)
  // so stageQuestionText can tell the failing-test-count half of suite-green's
  // "two assertions" apart from a genuine typecheck stage — see its own doc.
  /** @type {Set<string>} */
  const suiteCmdKeys = new Set();
  for (const s of spec.closeDecl.stages) {
    if (s && s.kind === 'command-exit') {
      const key = cmdKey(s.params);
      if (key !== null) suiteCmdKeys.add(key);
    }
  }
  /** @type {Map<string, {kind: string|null, direction: string|null, baselineKind: 'seed'|0|null, question: string|null}>} */
  const map = new Map();
  for (const s of spec.closeDecl.stages) {
    if (!s || typeof s.name !== 'string' || s.name.length === 0) continue;
    const kind = typeof s.kind === 'string' ? s.kind : null;
    const params = s.params && typeof s.params === 'object' ? s.params : null;
    const direction = params && typeof params.direction === 'string' ? params.direction : null;
    const baselineKind = params && (params.baseline === 'seed' || params.baseline === 0) ? params.baseline : null;
    const question = stageQuestionText({
      kind, params, genre, suiteCmdKeys,
    });
    map.set(s.name, {
      kind, direction, baselineKind, question,
    });
  }
  return map;
}

/**
 * Attaches one stage's `{kind, direction, baselineKind, question}` (from
 * {@link stageKindMetaFromSpec}'s map) onto its already-recorded runtime
 * shape (`{name, verdict, value?, baseline?, …}`, straight off the spine) —
 * a shallow copy, never a mutation of the spine-derived object, and only when
 * BOTH a name and a matching declaration entry exist; otherwise the stage
 * passes through unchanged (the client's existing name fallback still
 * renders for it).
 * @param {any} stage
 * @param {Map<string, {kind: string|null, direction: string|null, baselineKind: 'seed'|0|null, question: string|null}>|null} kindMeta
 * @returns {any}
 */
function attachStageKind(stage, kindMeta) {
  if (!stage || typeof stage !== 'object' || typeof stage.name !== 'string' || !kindMeta) return stage;
  const meta = kindMeta.get(stage.name);
  if (!meta) return stage;
  return {
    ...stage, kind: meta.kind, direction: meta.direction, baselineKind: meta.baselineKind, question: meta.question,
  };
}

/**
 * `summary.parts` (verbatim except each attempt's `stages` array, which gets
 * {@link attachStageKind} applied per stage) — a shallow re-map, never a
 * mutation of `replayOne`'s own returned objects (other endpoints, e.g.
 * {@link getRunAudit}, call `replayOne` fresh per request, but this stays
 * defensive rather than relying on that).
 *
 * Also stamps each attempt with `declaredStagesTotal` (checks-count fix,
 * 2026-09-28): `kindMeta.size` — the number of stages the signed
 * `closeDecl` DECLARED, never `stages.length` (the number that RAN). First-
 * red-wins means an attempt that stopped early carries a `stages` array
 * shorter than the declaration; the client reads this field for the total
 * count so an unrun stage still counts in the total exactly once, computed
 * here and never re-derived client-side — "checks 1/2" on a 7-stage close
 * (hamr's live catch) was this exact bug.
 *
 * `declaredStages` (plain-checks build, 2026-09-28): every declared stage's
 * `{name, question}`, in DECLARED order — `Array.from(kindMeta)` walks a
 * `Map`'s own insertion order, which is `spec.closeDecl.stages`' order. The
 * client zips this against the attempt's own (shorter, when first-red-wins
 * stopped it early) `stages` array BY NAME to render every declared stage in
 * the expanded view, including ones that never ran ("· not run") — never by
 * POSITION, because a stage's declared index is exactly what `#N` in the
 * headline/expanded view already means, and a name lookup is robust to any
 * future reordering between the resolved spec and the executed close.
 *
 * Both fields are `null`/omitted whenever `kindMeta` is `null` — no spec
 * resolved, or the spec carries no `closeDecl.stages` at all — so the client
 * falls back to `stages.length` and renders only the stages that ran, exactly
 * as before this build.
 * @param {any[]|null|undefined} parts
 * @param {Map<string, any>|null} kindMeta
 * @returns {any[]|null|undefined}
 */
function enrichPartsWithStageKind(parts, kindMeta) {
  if (!Array.isArray(parts)) return parts;
  const declaredStagesTotal = kindMeta ? kindMeta.size : null;
  const declaredStages = kindMeta
    ? Array.from(kindMeta, ([name, meta]) => ({ name, question: meta.question }))
    : null;
  return parts.map((part) => ({
    ...part,
    attempts: Array.isArray(part.attempts) ? part.attempts.map((a) => ({
      ...a,
      stages: (kindMeta && Array.isArray(a.stages)) ? a.stages.map((s) => attachStageKind(s, kindMeta)) : a.stages,
      ...(declaredStagesTotal ? { declaredStagesTotal } : {}),
      ...(declaredStages ? { declaredStages } : {}),
    })) : part.attempts,
  }));
}

/**
 * The close's stage names, in declared order — `close[].name` (a hand-authored
 * command close) or `closeDecl.stages[].name` (an authored declaration); the
 * two are mutually exclusive (`validateJob`'s own `close-duplicated` red).
 * `null` when neither carries a named stage (an old/malformed spec) — never a
 * fabricated placeholder.
 * @param {any} spec
 * @returns {string|null}
 */
function successFromSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const stages = Array.isArray(spec.close) ? spec.close
    : (spec.closeDecl && Array.isArray(spec.closeDecl.stages) ? spec.closeDecl.stages : null);
  if (!stages) return null;
  const names = stages.filter((s) => s && typeof s.name === 'string' && s.name.length > 0).map((s) => s.name);
  return names.length > 0 ? names.join(' · ') : null;
}

/**
 * The write fence plus the guard checks a close actually carries — reusing
 * {@link confirmProtections} (`src/authorflow.js`), the SAME function the
 * authoring CLI's confirm turn shows a person, never a second hand-typed list
 * (build spec item 2). Guard names only resolve for a `closeDecl` spec
 * (`classGuards` needs its `lang`+the spec's `verdictType`); an old-shape
 * `close`-array spec falls back to the write fence alone — its guard stages
 * (e.g. `no-suppressions`) already show up in {@link successFromSpec}'s own
 * stage list, and inventing a second detector to relabel them as "guards" here
 * would be exactly the per-age special-casing the build spec rules out.
 * `confirmProtections` itself can throw for an unrecognized verdictType/lang
 * (a spec this panel was never validated against) — caught here so a stale or
 * hand-edited spec never 500s the Job tab, only shows less than it could.
 * @param {any} spec
 * @returns {string|null}
 */
function guardrailsFromSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const writeScope = Array.isArray(spec.writeScope) && spec.writeScope.every((s) => typeof s === 'string')
    ? spec.writeScope : null;
  const fenceLine = writeScope && writeScope.length > 0
    ? `write fence — the run may only change files matching: ${writeScope.join(', ')}` : null;
  if (spec.closeDecl && typeof spec.closeDecl.lang === 'string' && typeof spec.verdictType === 'string') {
    try {
      const lines = confirmProtections({ verdictType: spec.verdictType, lang: spec.closeDecl.lang, writeScope });
      if (lines.length > 0) return lines.join(' · ');
    } catch { /* falls through to the write-fence-only line below */ }
  }
  return fenceLine;
}

/**
 * The granted tool list, RAW (as declared, in order) — `null` when the spec
 * carries none (a job may legally declare no `tools` at all). The one owner
 * of this array; {@link toolsFromSpec}'s joined display string is derived
 * from it, and item 3 (2026-09-25)'s "offered, never used" line on the Run
 * tab reads this raw array directly (`toolsList` on the Job response) rather
 * than reverse-parsing the joined string.
 * @param {any} spec
 * @returns {string[]|null}
 */
function toolsListFromSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  if (!Array.isArray(spec.tools) || spec.tools.length === 0) return null;
  const names = spec.tools.filter((t) => typeof t === 'string' && t.length > 0);
  return names.length > 0 ? names : null;
}

/**
 * The granted tool list, verbatim, in declared order — `null` when the spec
 * carries none (a job may legally declare no `tools` at all).
 * @param {any} spec
 * @returns {string|null}
 */
function toolsFromSpec(spec) {
  const names = toolsListFromSpec(spec);
  return names ? names.join(' · ') : null;
}

/**
 * `<src/panel>/../../jobs` — the repo's `jobs/` directory of signed specs,
 * resolved from the bareloop PACKAGE ROOT (this module's own on-disk
 * location), never from `process.cwd()` — a panel launched from any working
 * directory must resolve the same jobs/ dir (item 2, 2026-09-25).
 * @returns {string}
 */
function jobsDir() {
  return join(HERE, '..', '..', 'jobs');
}

/**
 * `GET /api/runs/:runid/job` — the Job tab, filled from the first source
 * that actually resolves (item 2, 2026-09-25), in order:
 *  (a) the bundle's own `spec.json` (a `bareloop run` bundle keeps one
 *      beside its `runs/` dir) — the pre-existing path, unchanged;
 *  (b) `jobs/<job>.json` in the repo's own jobs/ dir (resolved from the
 *      package root) — its `jobSpecHash` is compared against the run's own
 *      job-start `specHash`; a mismatch is shown, never hidden (the job may
 *      have been edited since this run signed it);
 *  (c) NEW (item 2, 2026-09-25): the run's own `resolved-spec.json`, found
 *      beside the spine via {@link sourceNearSpine} — a person-path (`--spec`
 *      or a source-seed-backed JOBS-table row) run's signed copy, never
 *      searched for, only read when the on-disk shape unambiguously names it;
 *  (d) the run's own job-start record (goal/model/budgetUsd/verdictType only
 *      — a narrower, unsigned record, `resolved:false`);
 *  else every spec-only field reads `'not recorded'`, never fabricated.
 * `resolvedFrom` names which of these actually supplied the fields, shown in
 * the page. `source`/`destination` are resolved SEPARATELY from the rest (any
 * branch above may supply the goal/close/etc while carrying no source.json of
 * its own) — from the source front door's manifest when `sourceNearSpine`
 * finds one, else the run list's own recorded `patient` path for a `source`
 * with no manifest, else `'not recorded'`. `success`/`guardrails`/`tools` come
 * from the resolved SPEC only (a) (b) (c) — a job-start record and `none()`
 * carry no close/writeScope/tools at all, so those stay `'not recorded'`.
 * @param {string} runid
 * @param {{ home?: string }} [opts]
 * @returns {any|null}
 */
export function getRunJob(runid, opts = {}) {
  const row = findRunRow(runid, opts);
  if (!row) return null;

  const near = existsSync(row.spine) ? sourceNearSpine(row.spine) : { specPath: null, sourceJsonPath: null };
  let manifest = null;
  if (near.sourceJsonPath) {
    try { manifest = JSON.parse(readFileSync(near.sourceJsonPath, 'utf8')); } catch { manifest = null; }
  }

  /** @param {string|null} v @returns {string} */
  const notRecorded = (v) => (typeof v === 'string' && v.length > 0 ? v : 'not recorded');
  const sourceDisplay = () => {
    if (manifest && typeof manifest.source === 'string' && manifest.source.length > 0) return manifest.source;
    if (typeof row.patient === 'string' && row.patient.length > 0) return row.patient;
    return 'not recorded';
  };
  const destDisplay = () => {
    if (manifest && typeof manifest.destination === 'string' && manifest.destination.length > 0) return manifest.destination;
    return 'not recorded';
  };

  // Read this run's own job-start record once — feeds the model fallback
  // below, (b)'s hash comparison, and (d)'s own fallback.
  let jobStart = null;
  if (existsSync(row.spine)) {
    try {
      const { records } = parseJsonl(row.spine);
      jobStart = records.find((r) => r && typeof r === 'object' && r.type === 'job-start') ?? null;
    } catch { jobStart = null; }
  }
  // A spec is a repeatable SHAPE and may legally omit `model` (resolved at
  // run time — `resolveWorkerModel`, e.g. `resolved-spec.json` for run
  // mu2p83go carries no `model` key at all, `deepseek-flash` was resolved and
  // only the job-start record says so): the job-start record's own `model` is
  // the real fact for what actually ran, shown whenever the spec itself is
  // silent on it — never a second age-conditioned code path, just the more
  // specific of two real fields.
  const modelDisplay = (/** @type {any} */ spec) => notRecorded(
    typeof spec.model === 'string' && spec.model.length > 0 ? spec.model
      : (typeof jobStart?.model === 'string' ? jobStart.model : null),
  );

  /** @param {any} spec @param {boolean} resolved @param {string} resolvedFrom @param {string|null} note */
  const fromSpec = (spec, resolved, resolvedFrom, note) => ({
    runid,
    job: typeof spec.job === 'string' ? spec.job : row.job,
    resolved,
    resolvedFrom,
    checkType: checkTypeLabel(typeof spec.verdictType === 'string' ? spec.verdictType : null, row.at),
    checkTypeTitle: checkTypeTitle(typeof spec.verdictType === 'string' ? spec.verdictType : null, row.at),
    model: modelDisplay(spec),
    description: typeof spec.description === 'string' && spec.description.length > 0 ? spec.description : null,
    goal: notRecorded(typeof spec.goal === 'string' ? spec.goal : null),
    budgetUsd: typeof spec.budgetUsd === 'number' ? spec.budgetUsd : null,
    maxWallMs: typeof spec.maxWallMs === 'number' ? spec.maxWallMs : null,
    source: sourceDisplay(),
    destination: destDisplay(),
    success: notRecorded(successFromSpec(spec)),
    guardrails: notRecorded(guardrailsFromSpec(spec)),
    tools: notRecorded(toolsFromSpec(spec)),
    toolsList: toolsListFromSpec(spec),
    note,
  });
  const none = () => ({
    runid,
    job: row.job,
    resolved: false,
    resolvedFrom: 'none',
    checkType: 'unknown',
    checkTypeTitle: null,
    model: 'not recorded',
    description: null,
    goal: 'not recorded',
    budgetUsd: null,
    maxWallMs: null,
    source: sourceDisplay(),
    destination: destDisplay(),
    success: 'not recorded',
    guardrails: 'not recorded',
    tools: 'not recorded',
    toolsList: null,
    note: 'no resolvable spec for this run (only bareloop-run bundle-layout runs carry one; a run-u run has none on disk)',
  });

  // (a) bundle spec.json — unchanged path, still tried first.
  if (existsSync(row.spine)) {
    const bundleDir = bundleDirForSpine(row.spine);
    const specPath = bundleDir ? join(bundleDir, 'spec.json') : null;
    if (specPath && existsSync(specPath)) {
      let spec = null;
      try { spec = JSON.parse(readFileSync(specPath, 'utf8')); } catch { spec = null; }
      if (spec && typeof spec === 'object') {
        return fromSpec(spec, true, 'bundle spec.json', null);
      }
    }
  }

  // (b) jobs/<job>.json in the repo's own jobs/ dir.
  const jobsSpecPath = join(jobsDir(), `${row.job}.json`);
  if (existsSync(jobsSpecPath)) {
    let spec = null;
    try { spec = JSON.parse(readFileSync(jobsSpecPath, 'utf8')); } catch { spec = null; }
    if (spec && typeof spec === 'object') {
      const specHash = typeof jobStart?.specHash === 'string' ? jobStart.specHash : null;
      let mismatch = false;
      if (specHash) {
        try { mismatch = jobSpecHash(spec) !== specHash; } catch { mismatch = false; }
      }
      const note = mismatch ? 'this job was edited after this run (spec hash differs)' : null;
      return fromSpec(spec, true, `jobs/${row.job}.json`, note);
    }
  }

  // (c) NEW — the run's own resolved-spec.json, found beside the spine.
  if (near.specPath) {
    let spec = null;
    try { spec = JSON.parse(readFileSync(near.specPath, 'utf8')); } catch { spec = null; }
    if (spec && typeof spec === 'object') {
      return fromSpec(spec, true, "the run's own resolved-spec.json", null);
    }
  }

  // (d) the run's own job-start record — narrower, unsigned.
  if (jobStart) {
    return {
      runid,
      job: typeof jobStart.job === 'string' ? jobStart.job : row.job,
      resolved: false,
      resolvedFrom: "the run's own start record",
      checkType: checkTypeLabel(typeof jobStart.verdictType === 'string' ? jobStart.verdictType : null, row.at),
      checkTypeTitle: checkTypeTitle(typeof jobStart.verdictType === 'string' ? jobStart.verdictType : null, row.at),
      model: notRecorded(typeof jobStart.model === 'string' ? jobStart.model : null),
      description: null,
      goal: notRecorded(typeof jobStart.goal === 'string' ? jobStart.goal : null),
      budgetUsd: typeof jobStart.budgetUsd === 'number' ? jobStart.budgetUsd : null,
      maxWallMs: null,
      source: sourceDisplay(),
      destination: destDisplay(),
      success: 'not recorded',
      guardrails: 'not recorded',
      tools: 'not recorded',
      toolsList: null,
      note: "from the run's own start record",
    };
  }

  return none();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// REUSE WORKFLOW (hamr 2026-10-03; replaces P5 item 3's "Start from this"). A GREEN run — or an imported job — can be
// run again as the SAME signed workflow on a new source. This section is the ONE owner of (a) the prefill, (b) which
// boxes are locked, (c) the track record. The page asks; it never decides. A reuse is a NEW run (a new runid).
// Nothing here drafts: changing the goal, checks, guardrails, judge examples or model is Clear (then draft).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The signed spec a run's LATEST leg ran under — the `resolved-spec*.json` beside the run whose hash is the one its
 * latest `job-start` carries (the same lookup `resumePlanFor` does). `null` = no such file.
 * @param {{ spine: string }} row
 * @param {any[]} records
 * @returns {{spec: any, specPath: string, specHash: string}|null}
 */
function signedSpecForRun(row, records) {
  const jobStart = (legsOf(records).findLast((l) => l.jobStart !== null) ?? null)?.jobStart ?? null;
  if (!jobStart || typeof jobStart.specHash !== 'string') return null;
  const near = sourceNearSpine(row.spine);
  if (!near.specPath) return null;
  const dir = dirname(near.specPath);
  /** @type {string[]} */
  let names = [];
  try { names = readdirSync(dir).filter((n) => n === 'resolved-spec.json' || /^resolved-spec-r\d+\.json$/.test(n)); } catch { names = []; }
  for (const n of names) {
    let spec;
    try { spec = JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { continue; }
    if (!spec || typeof spec !== 'object') continue;
    if (jobSpecHash(spec) === jobStart.specHash) return { spec, specPath: join(dir, n), specHash: jobStart.specHash };
  }
  return null;
}

/**
 * The worker a signed spec ran: provider, baseUrl and model, the model falling back to the provider's default tier
 * when the spec names none (the same fallback `resolveWorkerModel` makes at run time).
 * @param {any} spec
 * @returns {{provider: string, baseUrl?: string, model: string}}
 */
function workerOfSpec(spec) {
  const provider = typeof spec?.provider === 'string' ? spec.provider : '';
  let model = typeof spec?.model === 'string' ? spec.model : '';
  if (!model) { try { model = resolveProvider(provider).tiers.sonnet; } catch { model = ''; } }
  return { provider, ...(typeof spec?.baseUrl === 'string' && spec.baseUrl ? { baseUrl: spec.baseUrl } : {}), model };
}
/** @param {{provider: string, baseUrl?: string, model: string}} w @returns {string} one spelling of "the same worker" */
const workerId = (w) => `${w.provider}\u0000${w.baseUrl ?? ''}\u0000${w.model}`;
/**
 * The worker the reuse card's CURRENT Model box names: the Settings row's provider, baseUrl and Name. `null` when the
 * box is blank or names no row.
 * @param {string} model a Settings Name
 * @param {{ home?: string }} opts
 * @returns {{provider: string, baseUrl?: string, model: string}|null}
 */
function workerOfChoice(model, opts) {
  const c = modelChoiceFor(rowsForHome(keysHome(opts.home)), model);
  return c ? { provider: c.provider, ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}), model: c.name } : null;
}

/**
 * The track record of a WORKFLOW: every LISTED run whose signed spec (the one its latest leg ran under) has this
 * `workflowKey` — the same goal, checks, guardrails, model and close, whatever source, destination or caps. One run =
 * ONE entry (a resumed run is one run, its FINAL outcome — `legsOf`), and a run that is still live is neither green
 * nor not-green yet. `avgSpendUsd` / `avgWallMs` average the FINISHED runs (a recorded terminal) whose figure is exact
 * (chain spend priced; working time from readable stamps, resume gaps excluded) — `null` when no run qualifies, never 0.
 * Read from the runs the panel already lists: no registry, no plan handover (hamr ruling A).
 * `opts.worker` narrows the record to runs on the same WORKER (provider + baseUrl + model — Model is open on a reuse, so
 * the key no longer separates models): `undefined` = every model, a worker = only runs whose signed spec ran that one,
 * `null` = no model chosen, so no run matches.
 * @param {string} key a {@link workflowKey}
 * @param {{ home?: string, worker?: {provider: string, baseUrl?: string, model: string}|null }} [opts]
 * @returns {{runs: number, green: number, notGreen: number, live: number, finished: number, avgSpendUsd: number|null, avgWallMs: number|null}}
 */
export function trackRecordFor(key, opts = {}) {
  const { rows } = readRunList(opts);
  let green = 0;
  let notGreen = 0;
  let live = 0;
  let finished = 0;
  let spendSum = 0;
  let spendN = 0;
  let wallSum = 0;
  let wallN = 0;
  for (const row of rows) {
    if (!row || !existsSync(row.spine)) continue;
    let records;
    try { records = parseJsonl(row.spine).records; } catch { continue; }
    const legs = legsOf(records);
    const signed = signedSpecForRun(row, records);
    if (!signed || workflowKey(signed.spec) !== key) continue;
    if (opts.worker !== undefined && (opts.worker === null || workerId(workerOfSpec(signed.spec)) !== workerId(opts.worker))) continue;
    const outcome = legs.at(-1)?.outcome ?? null;
    if (outcome === null && runIsAlive(row)) { live += 1; continue; }
    if (outcome === 'green') green += 1; else notGreen += 1;
    // the averages read FINISHED runs only (a recorded terminal), and only figures that are exact: an unpriced run
    // or one with unreadable stamps is left out, never counted as $0 or 0 min (unknown is never zero)
    if (outcome === null) continue;
    finished += 1;
    const sp = chainSpend(records);
    if (sp.complete) { spendSum += sp.usd; spendN += 1; }
    const wall = legsWallMs(legs);
    if (wall.ms !== null && wall.complete) { wallSum += wall.ms; wallN += 1; }
  }
  return {
    runs: green + notGreen + live, green, notGreen, live, finished,
    avgSpendUsd: spendN > 0 ? spendSum / spendN : null,
    avgWallMs: wallN > 0 ? wallSum / wallN : null,
  };
}

/**
 * The estimate line above a reuse card (code-owned fixed text): `Same job — G green · N not green · about $X and
 * M min a run`, from the workflow's own listed runs. What is unknown is said, never rendered as $0 or 0 min.
 * @param {{runs?: number, green: number, notGreen: number, finished?: number, avgSpendUsd: number|null, avgWallMs?: number|null}|null} record
 * @returns {string}
 */
export function reuseLine(record) {
  if (!record) return 'Same job';
  if ('runs' in record && record.runs === 0) return 'Same job — no runs yet on this model';
  const head = `Same job — ${record.green} green · ${record.notGreen} not green`;
  const wallMs = record.avgWallMs ?? null;
  const cost = record.avgSpendUsd === null ? null : panelMoney2(record.avgSpendUsd);
  const mins = wallMs === null ? null : (wallMs < 60_000 ? '<1' : String(Math.round(wallMs / 60_000)));
  if (cost !== null && mins !== null) return `${head} · about ${cost} and ${mins} min a run`;
  if (cost !== null) return `${head} · about ${cost} a run, time not recorded`;
  if (mins !== null) return `${head} · about ${mins} min a run, cost not recorded`;
  return (record.finished ?? record.green + record.notGreen) === 0
    ? `${head} · no finished run yet to price or time`
    : `${head} · cost and time not recorded`;
}

/**
 * `start-from` (the route keeps its name) for one listed run: the card prefilled from the run's SIGNED job, which
 * boxes are locked and which are open, and the track record. Locked boxes carry the signed values, read by the
 * SAME readers the Job tab uses (`successFromSpec`/`guardrailsFromSpec`); the open four — Source, Destination, the
 * $ cap and the Time cap — start at what the run had. `ok:false` when the run's signed job is not on disk (nothing
 * to copy: change the job: Clear the card). `null` when the runid is not listed.
 * @param {string} runid
 * @param {{ home?: string, model?: string }} [opts] `model` = the Model box's current Name (the estimate counts only runs on that worker); absent = the card's own Model
 * @returns {{ok: true, origin: {runid: string, job: string}, card: Record<string, any>, from: 'signed job',
 *   locked: readonly string[], open: readonly string[], note: string|null,
 *   specHash: string, workflowKey: string, spec: any, specPath: string,
 *   trackRecord: ReturnType<typeof trackRecordFor>, line: string}|{ok: false, error: string}|null}
 */
export function getStartFrom(runid, opts = {}) {
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
  if (!row) return null;
  if (!existsSync(row.spine)) return { ok: false, error: 'this run has no log on disk — nothing to reuse' };
  const records = parseJsonl(row.spine).records;
  const signed = signedSpecForRun(row, records);
  if (!signed) return { ok: false, error: "this run's signed job is not on disk — nothing to reuse (change the job: Clear the card and draft a new one)" };
  const near = sourceNearSpine(row.spine);
  const spec = signed.spec;
  /** @type {Record<string, any>} */
  let saved = {};
  if (near.specPath) {
    try {
      const raw = JSON.parse(readFileSync(join(dirname(near.specPath), 'card.json'), 'utf8'));
      if (raw && typeof raw === 'object') saved = raw;
    } catch { saved = {}; }
  }
  let manifest = null;
  if (near.sourceJsonPath) { try { manifest = JSON.parse(readFileSync(near.sourceJsonPath, 'utf8')); } catch { manifest = null; } }
  const jobStart = records.find((r) => r && r.type === 'job-start') ?? null;
  const card = reuseCardFromSpec(spec, {
    model: typeof saved.model === 'string' && saved.model ? saved.model
      : (findRow(rowsForHome(keysHome(opts.home)), { provider: spec.provider, baseUrl: spec.baseUrl, model: spec.model })?.name
        ?? (typeof jobStart?.model === 'string' ? jobStart.model : '')),
    source: typeof saved.source === 'string' && saved.source ? saved.source : (typeof manifest?.source === 'string' ? manifest.source : (typeof row.patient === 'string' ? row.patient : '')),
    judgeExamples: typeof saved.judgeExamples === 'string' ? saved.judgeExamples : '',
    jobName: row.job,
  });
  const key = workflowKey(spec);
  const trackRecord = trackRecordFor(key, { ...opts, worker: workerOfChoice(opts.model ?? card.model, opts) });
  return {
    ok: true,
    origin: { runid, job: row.job },
    card,
    from: 'signed job',
    locked: REUSE_LOCKED_FIELDS,
    open: REUSE_OPEN_FIELDS,
    note: card.checkType === 'rubric' && card.judgeExamples === '' ? 'judge examples were not saved for this run' : null,
    specHash: signed.specHash,
    workflowKey: key,
    spec,
    specPath: signed.specPath,
    trackRecord,
    line: reuseLine(trackRecord),
  };
}

/**
 * The Reuse workflow picker's list: one entry per JOB (same-job identity = `workflowKey`, the one `getStartFrom` uses)
 * that has at least one GREEN local run, newest green first. `runid` = that job's newest green run, so the page hands
 * it to the existing start-from flow unchanged; `line` is `getStartFrom`'s own estimate line (never a second
 * spelling). Local runs only — an imported job keeps its Reuse button in the Import view. $0, read-only.
 * @param {{ home?: string, model?: string }} [opts] `model` passes through to the estimate line, as start-from's does
 * @returns {{job: string, runid: string, checkType: 'deterministic'|'rubric', line: string}[]}
 */
export function listReuseJobs(opts = {}) {
  const { rows } = readRunList(opts);
  const seen = new Set();
  /** @type {{job: string, runid: string, checkType: 'deterministic'|'rubric', line: string}[]} */
  const jobs = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row || !existsSync(row.spine)) continue;
    let records;
    try { records = parseJsonl(row.spine).records; } catch { continue; }
    const outcome = legsOf(records).at(-1)?.outcome ?? null;
    // the same endings the Run tab's own Reuse button is offered on (`endedBase`)
    if (outcome !== 'green' && outcome !== 'already-green' && outcome !== 'satisfied') continue;
    const signed = signedSpecForRun(row, records);
    if (!signed) continue;
    const key = workflowKey(signed.spec);
    if (seen.has(key)) continue;
    const pre = getStartFrom(row.runid, opts);
    if (!pre || !pre.ok) continue;
    seen.add(key);
    jobs.push({ job: pre.card.jobName, runid: row.runid, checkType: pre.card.checkType === 'rubric' ? 'rubric' : 'deterministic', line: pre.line });
  }
  return jobs;
}

/**
 * The reuse card for a signed spec: locked boxes from the spec through the Job tab's own readers, open boxes from
 * the spec's own fence and caps (Source and the saved text from the caller — a spec carries neither).
 * @param {any} spec
 * @param {{model: string, source: string, judgeExamples: string, jobName: string}} extra
 * @returns {Record<string, any>}
 */
function reuseCardFromSpec(spec, extra) {
  const writeScope = Array.isArray(spec.writeScope) ? spec.writeScope.filter((/** @type {any} */ x) => typeof x === 'string') : [];
  return {
    jobName: typeof spec.job === 'string' && spec.job ? spec.job : extra.jobName,
    checkType: spec.verdictType === 'soft-green' ? 'rubric' : 'deterministic',
    model: typeof spec.model === 'string' && spec.model && !extra.model ? spec.model : extra.model,
    goal: typeof spec.goal === 'string' ? spec.goal : '',
    source: extra.source,
    destination: writeScope.join(', '),
    success: successFromSpec(spec) ?? '',
    guardrails: guardrailsFromSpec(spec) ?? '',
    judgeExamples: extra.judgeExamples,
    capUsd: typeof spec.budgetUsd === 'number' ? spec.budgetUsd : null,
    maxWallMs: typeof spec.maxWallMs === 'number' ? spec.maxWallMs : undefined,
  };
}

/**
 * P5 item 4 — the facts of a spec for an IMPORTED job's view, read by the SAME readers the Job tab uses for a run
 * (so an imported job and a run read alike): check type, goal, success checks, guardrails, model, caps.
 * @param {any} spec
 * @returns {{checkType: string, goal: string, success: string, guardrails: string, model: string, budgetUsd: number|null, maxWallMs: number|null}}
 */
function describeSpec(spec) {
  const nr = (/** @type {string|null} */ v) => (typeof v === 'string' && v.length > 0 ? v : 'not recorded');
  return {
    checkType: checkTypeLabel(typeof spec.verdictType === 'string' ? spec.verdictType : null, null),
    goal: nr(typeof spec.goal === 'string' ? spec.goal : null),
    success: nr(successFromSpec(spec)),
    guardrails: nr(guardrailsFromSpec(spec)),
    model: nr(typeof spec.model === 'string' ? spec.model : null),
    budgetUsd: typeof spec.budgetUsd === 'number' ? spec.budgetUsd : null,
    maxWallMs: typeof spec.maxWallMs === 'number' ? spec.maxWallMs : null,
  };
}

/**
 * Reuse workflow, for an IMPORTED job: the bundle is read AGAIN now and must be clean (`readBundle` — its own hash
 * covers every close script, so a swapped script is `bundle-tampered` here), must resolve its own `bareloop`
 * dependency (`checkBundleDeps`), and every close stage's signed sha256 must match the script's bytes on disk
 * (`checkCloseByteSignature`, over the spec with `$BARELOOP_BUNDLE` resolved to this folder — the same in-memory
 * substitution `bareloop run <bundle>` makes). The reuse spec is that resolved spec; the close scripts stay where
 * they were just verified (the engine re-verifies their bytes at run start and before every close run). The person
 * signs it on this machine at [Sign & run]. Same card, same locked/open boxes as a run's reuse. `null` when no such
 * imported job.
 * @param {string} id
 * @param {{ home?: string, model?: string }} [opts] `model` as for {@link getStartFrom}
 * @returns {{ok: true, origin: {runid: null, job: string, importId: string}, card: Record<string, any>, from: 'imported job',
 *   locked: readonly string[], open: readonly string[], note: string|null, specHash: string, workflowKey: string, spec: any,
 *   specPath: null, trackRecord: ReturnType<typeof trackRecordFor>, line: string}|{ok: false, error: string}|null}
 */
export function getStartFromImport(id, opts = {}) {
  const row = readImports(opts.home).find((r) => r.id === id);
  if (!row) return null;
  const st = bundleStatus(row);
  if (st.status === 'changed') return { ok: false, error: IMPORT_CHANGED_LINE };
  if (st.status !== 'ok') return { ok: false, error: `${st.statusText ?? 'this imported job cannot be read'} — re-import it before reusing it` };
  const deps = checkBundleDeps(row.dir);
  if (!deps.ok) return { ok: false, error: deps.reds[0]?.detail ?? 'the imported job cannot resolve its own dependency' };
  const { spec } = resolveBundleSpec(st.bundle, row.dir);
  const bytes = checkCloseByteSignature(spec, row.dir);
  if (!bytes.ok) return { ok: false, error: `a close script of this imported job does not match its signed bytes (${bytes.reds.map((r) => r.stage).join(', ')}) — refusing to reuse it` };
  // the bundle's provider is no longer forced: Model is open on a reuse, so the person's chosen Settings row is the worker.
  // The card opens on the row matching the bundle's own provider when there is one, else blank (the page's menu picks).
  const rows = rowsForHome(keysHome(opts.home));
  const named = findRow(rows, { provider: spec.provider, baseUrl: spec.baseUrl, model: spec.model })?.name ?? '';
  const card = reuseCardFromSpec(spec, { model: named, source: '', judgeExamples: '', jobName: row.job });
  const key = workflowKey(spec);
  const trackRecord = trackRecordFor(key, { ...opts, worker: workerOfChoice(opts.model ?? card.model, opts) });
  return {
    ok: true,
    origin: { runid: null, job: row.job, importId: id },
    card,
    from: 'imported job',
    locked: REUSE_LOCKED_FIELDS,
    open: REUSE_OPEN_FIELDS,
    note: 'a Source is needed — an exported job carries none; it is checked and signed on this machine',
    specHash: jobSpecHash(spec),
    workflowKey: key,
    spec,
    specPath: null,
    trackRecord,
    line: reuseLine(trackRecord),
  };
}

/** @param {any} res @param {number} code @param {any} body */
function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

/** @param {any} res @param {number} code @param {string} text */
function sendText(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Handle one request against the read-only API + the page. Exported
 * separately from {@link createPanelServer} so tests can drive it without a
 * real listening socket where that is simpler (most path-safety/405 tests
 * still go through a real socket, per the build spec).
 *
 * PANEL-BUILD.md P3: this file's own GET/HEAD-only rule stands for every
 * route it owns; `/api/author/*` is the ONE family of routes that may be
 * POSTed to, and it is handled entirely by {@link createAuthorRoutes}
 * (`src/panel/authorroutes.js`) — a separate module so this file's own
 * "read-only, by construction" header comment stays true of everything else
 * in it. `opts.authorRoutes` is absent on every P1/P2 caller (read-only
 * tests, and the CLI's own `panelMain` when no author routes are wired) —
 * only `createPanelServer` below always supplies one.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ home?: string, port: number, token?: string, authorRoutes?: ReturnType<typeof createAuthorRoutes>, settingsRoutes?: ReturnType<typeof createSettingsRoutes>, runRoutes?: ReturnType<typeof createRunRoutes>, importRoutes?: ReturnType<typeof createImportRoutes> }} opts
 */
export function handleRequest(req, res, opts) {
  /** the ONE writable route family for a path, or null — `/api/author/*` (authoring) or
   * `/api/settings/*` (Settings, P4a): separate modules, each behind the human-click guard.
   * @param {any} o @param {string} p */
  function routesFor(o, p) {
    if (o.authorRoutes && p.startsWith('/api/author')) return o.authorRoutes;
    if (o.settingsRoutes && p.startsWith('/api/settings')) return o.settingsRoutes;
    if (o.runRoutes && /^\/api\/runs\/[^/]+\/(resume|stop)$/.test(p)) return o.runRoutes;
    if (o.importRoutes && (p === '/api/fs/list' || p === '/api/imports' || p.startsWith('/api/imports/'))) return o.importRoutes;
    return null;
  }
  const method = req.method ?? 'GET';

  let url;
  try {
    url = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1');
  } catch {
    sendText(res, 400, 'bad request');
    return;
  }
  const { pathname } = url;

  // every read names the panel's own address as Host — no token needed to read, but another origin's
  // page (a rebound DNS name) must not be able to fetch the run list
  if ((method === 'GET' || method === 'HEAD') && !checkHostGuard(req, { port: opts.port }).ok) {
    sendText(res, 403, 'wrong Host — this panel answers only at its own 127.0.0.1 address');
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    const routes = routesFor(opts, pathname);
    if (routes) {
      let raw = '';
      let size = 0;
      let refused = false;
      req.on('data', (c) => {
        if (refused) return;
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          refused = true;
          raw = '';
          res.once('finish', () => { req.destroy(); });
          res.setHeader('connection', 'close');
          sendText(res, 413, `request body over ${MAX_BODY_BYTES} bytes`);
          return;
        }
        raw += c;
      });
      req.on('end', () => {
        if (refused) return;
        /** @type {any} */
        let body = null;
        if (raw.length > 0) { try { body = JSON.parse(raw); } catch { body = null; } }
        // this callback runs OUTSIDE createServer's try/catch (which covers only the synchronous GET path), so a
        // synchronous throw in a route handler (a full disk, a permission fault) would be an uncaught exception that
        // takes the whole panel down: answer 500 JSON instead and keep serving
        try {
          routes.handle(req, res, pathname, body);
        } catch (e) {
          if (res.headersSent) { res.end(); return; }
          sendJson(res, 500, { ok: false, error: `internal error: ${/** @type {Error} */ (e)?.message ?? String(e)}` });
        }
      });
      return;
    }
    sendText(res, 405, 'method not allowed — this route does not accept this method (GET/HEAD only)');
    return;
  }
  const getRoutes = routesFor(opts, pathname);
  if (getRoutes) {
    getRoutes.handle(req, res, pathname, null);
    return;
  }

  const send = (code, body) => {
    if (method === 'HEAD') {
      const text = JSON.stringify(body);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end();
      return;
    }
    sendJson(res, code, body);
  };

  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = join(HERE, 'index.html');
    let html;
    try {
      html = readFileSync(indexPath, 'utf8');
    } catch {
      sendText(res, 500, 'panel page missing on disk');
      return;
    }
    html = html.replace(/__BARELOOP_PANEL_PORT__/g, String(opts.port));
    // PANEL-BUILD.md P3's human-click guard: a per-server-start token,
    // templated into the page exactly like the port — absent on every P1/P2
    // caller (no `opts.token`), which is fine: the page's own JS only reads
    // it to send on a POST, and there are none to send without P3's routes.
    html = html.replace(/__BARELOOP_PANEL_TOKEN__/g, String(opts.token ?? ''));
    if (method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
    res.end(html);
    return;
  }

  if (pathname === '/api/runs') { send(200, { runs: listRuns({ home: opts.home }) }); return; }

  const runMatch = /^\/api\/runs\/([^/]+)(\/(audit|job|rounds))?$/.exec(pathname);
  if (runMatch) {
    const rawRunid = runMatch[1];
    const sub = runMatch[3] ?? null;
    // PATH SAFETY: a runid must match RUNID_RE before it is used for
    // ANYTHING — including the lookup itself. A runid carrying a slash
    // (encoded or not — `decodeURIComponent` runs first via `URL`'s own
    // pathname decoding) never reaches the run-list lookup at all.
    const runid = rawRunid;
    if (!RUNID_RE.test(runid)) { sendText(res, 400, 'bad runid'); return; }
    if (sub === 'audit') {
      const result = getRunAudit(runid, { home: opts.home });
      if (!result) { sendText(res, 404, 'no such run'); return; }
      send(200, result);
      return;
    }
    if (sub === 'job') {
      const result = getRunJob(runid, { home: opts.home });
      if (!result) { sendText(res, 404, 'no such run'); return; }
      send(200, result);
      return;
    }
    if (sub === 'rounds') {
      /** @param {string|null} v @returns {number|undefined} */
      const num = (v) => (v !== null && /^\d+$/.test(v) ? Number(v) : undefined);
      const query = {
        part: num(url.searchParams.get('part')),
        attempt: num(url.searchParams.get('attempt')),
        offset: num(url.searchParams.get('offset')),
        limit: num(url.searchParams.get('limit')),
      };
      const result = getRunRounds(runid, query, { home: opts.home });
      if (!result) { sendText(res, 404, 'no such run/part/attempt'); return; }
      send(200, result);
      return;
    }
    const result = getRunDetail(runid, { home: opts.home });
    if (!result) { sendText(res, 404, 'no such run'); return; }
    send(200, result);
    return;
  }

  sendText(res, 404, 'not found');
}

/**
 * Start the panel server. Binds `127.0.0.1` ONLY. A taken port is a LOUD,
 * non-zero-exit failure — this never falls back to another port (see file
 * header). Resolves once actually listening; rejects on a bind error
 * (including `EADDRINUSE`) with a `.port` field on the error for the
 * caller's message.
 *
 * PANEL-BUILD.md P3: a fresh {@link mintToken} token and one {@link
 * createAuthorRoutes} instance are built here, ONCE per server start, and
 * held for the server's lifetime — `opts.env`/`opts.sessionsRoot`/
 * `opts.spawnFn`/`opts.bareloopBin` are test seams the author routes take
 * (a real caller passes none of them and {@link createAuthorRoutes} defaults
 * each one to the real environment/spawn/binary, this file itself touching
 * none of them, and the real
 * `~/.config/bareloop/panel-sessions`, the real `child_process.spawn`, and
 * this package's own `bin/bareloop.mjs`).
 * @param {{ port?: number, home?: string, env?: Record<string,string|undefined>,
 *   sessionsRoot?: string, spawnFn?: (...a: any[]) => any, bareloopBin?: string,
 *   fetchImpl?: typeof fetch, settleMs?: number, userHome?: string,
 *   openFolderSpawn?: (cmd: string, args: string[], o: object) => any, platform?: string }} [opts]
 * @returns {Promise<{ server: import('node:http').Server, port: number, token: string, close: () => Promise<void> }>}
 */
export function createPanelServer(opts = {}) {
  const requestedPort = opts.port ?? DEFAULT_PORT;
  const home = opts.home;
  const token = mintToken();
  return new Promise((resolve, reject) => {
    // Bound port is resolved from the live socket (`server.address().port`)
    // once listening starts, not the requested value — this is what makes
    // `port: 0` (OS-assigned ephemeral port) work for callers such as the
    // test suite, while `--port N` / DEFAULT_PORT callers still get back
    // exactly the port they asked for.
    let boundPort = requestedPort;
    /** @type {ReturnType<typeof createAuthorRoutes>|undefined} */
    let authorRoutes;
    /** @type {ReturnType<typeof createSettingsRoutes>|undefined} */
    let settingsRoutes;
    /** @type {ReturnType<typeof createRunRoutes>|undefined} */
    let runRoutes;
    /** @type {ReturnType<typeof createImportRoutes>|undefined} */
    let importRoutes;
    const server = createServer((req, res) => {
      try {
        handleRequest(req, res, {
          home, port: boundPort, token, authorRoutes, settingsRoutes, runRoutes, importRoutes,
        });
      } catch (e) {
        sendText(res, 500, `internal error: ${/** @type {Error} */ (e).message}`);
      }
    });
    server.once('error', (e) => {
      const err = /** @type {any} */ (e);
      err.port = requestedPort;
      reject(err);
    });
    server.listen(requestedPort, '127.0.0.1', () => {
      const addr = server.address();
      boundPort = typeof addr === 'object' && addr !== null ? addr.port : requestedPort;
      authorRoutes = createAuthorRoutes({
        port: boundPort,
        token,
        env: opts.env,
        sessionsRoot: opts.sessionsRoot,
        spawnFn: opts.spawnFn,
        bareloopBin: opts.bareloopBin,
        fetchImpl: opts.fetchImpl,
        home,
        startFrom: {
          get: (runid, o = {}) => getStartFrom(runid, { home, ...o }),
          getImport: (id, o = {}) => getStartFromImport(id, { home, ...o }),
          listJobs: (o = {}) => listReuseJobs({ home, ...o }),
        },
      });
      settingsRoutes = createSettingsRoutes({
        port: boundPort, token, home, env: opts.env, fetchImpl: opts.fetchImpl,
        openFolderSpawn: opts.openFolderSpawn, platform: opts.platform,
      });
      runRoutes = createRunRoutes({
        port: boundPort,
        token,
        home,
        env: opts.env,
        spawnFn: opts.spawnFn,
        bareloopBin: opts.bareloopBin,
        settleMs: opts.settleMs,
        getResumeContext: (runid) => getResumeContext(runid, { home }),
        getStopContext: (runid) => getStopContext(runid, { home }),
      });
      importRoutes = createImportRoutes({
        port: boundPort, token, home, userHome: opts.userHome, describeSpec,
      });
      resolve({
        server,
        port: boundPort,
        token,
        close: () => new Promise((res2) => { server.close(() => res2(undefined)); }),
      });
    });
  });
}

/**
 * `bareloop panel [--port N]` — the CLI entry (`src/cli.js` dispatch).
 * Never picks a different port on collision (see file header): prints a
 * loud, named error to stderr and returns 1.
 * @param {string[]} argv
 * @param {{ out: (s: string) => void, err: (s: string) => void, runlistHome?: string, env?: Record<string,string|undefined> }} ctx
 *   `env` is the RAW shell env (never the start-time merge with the keys file) — the routes
 *   re-merge `~/.config/bareloop/.env` onto it per request so Reload keys is real;
 *   undefined = the process env.
 * @returns {Promise<number>}
 */
export async function panelMain(argv, ctx) {
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') {
      const v = Number(argv[i + 1]);
      if (!Number.isInteger(v) || v <= 0 || v > 65535) { ctx.err(`--port must be a valid TCP port, got ${JSON.stringify(argv[i + 1])}`); return 1; }
      port = v;
      i += 1;
    }
  }
  try {
    const { port: boundPort } = await createPanelServer({ port, home: ctx.runlistHome, env: ctx.env });
    ctx.out(`bareloop panel — read-only, http://127.0.0.1:${boundPort} (Ctrl-C to stop)`);
    // never resolves on its own — the process stays up until killed, same
    // shape any other long-running dev server takes.
    await new Promise(() => {});
    return 0;
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err && err.code === 'EADDRINUSE') {
      ctx.err(`bareloop panel: port ${port} is already in use — pass --port to use a different one (never picked automatically)`);
      return 1;
    }
    ctx.err(`bareloop panel: failed to start — ${err && err.message ? err.message : String(err)}`);
    return 1;
  }
}
