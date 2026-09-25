// PANEL-BUILD.md P1 — the read-only panel server. `node:http` ONLY (no new
// dependency — the one-production-dependency bar already spends its one slot
// on bare-agent, LIBRARY_CONVENTIONS.md). Layering law (PANEL-BUILD.md §2):
// this file is one more CALLER of the same `src/` library functions
// `src/cli.js` calls — `src/replayio.js`'s read side and `src/runlist.js`'s
// run list — never a re-implementation of either.
//
// READ-ONLY, BY CONSTRUCTION: GET/HEAD only (anything else -> 405); no
// endpoint runs a job, spends money, signs, or reads a key/.env. Nothing
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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunList } from '../runlist.js';
import {
  replayOne, parseJsonl, resolveSiblings, isSidecarByName,
} from '../replayio.js';
import { summarizeForAllLine } from '../replay.js';
import { runBehaviour } from '../behaviour.js';
import { SPEND_RECORD_TYPES } from '../ledger.js';
import { jobSpecHash } from '../job.js';
import { confirmProtections } from '../authorflow.js';

const HERE = dirname(fileURLToPath(import.meta.url));

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
  if (outcome === 'green' || outcome === 'already-green' || outcome === 'satisfied') return '✓';
  if (outcome === null || outcome === undefined) return '▶';
  return '✗';
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

// DIED (hamr's ruling B, 2026-09-25): a run with no `job-end` never shares
// the failed glyph — [✗] stays reserved for a run whose close/arbiter
// actually rendered a "no" (a real result). A spine that just stops, with
// no ending ever recorded, is a DIFFERENT fact (killed, crashed, or the
// machine slept) and gets its own [?] glyph. The distinguishing signal is
// the spine FILE's own mtime, never wall-clock "now minus job-start" (a
// resumed/paused run can legitimately sit quiet for a long time without
// having died): still fresh (written to within this window) reads as the
// existing `running` [▶] state; older than this reads as died. Tighten-only,
// named so a future change is a deliberate, visible edit.
export const DIED_MTIME_MS = 10 * 60 * 1000;

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
 * derivation, used by every caller below (`/api/runs`, `/api/workflows`,
 * `/api/runs/:id`) so the three never drift apart.
 * @param {string} spinePath
 * @param {any[]} records raw parsed spine records (already read once by the caller)
 * @param {string|null} outcome `replayRun`'s own `summary.outcome`
 * @returns {{died: boolean, why: string|null, spendFloorUsd: number|null, wallFloorMs: number|null}}
 */
function deriveDeath(spinePath, records, outcome) {
  const notDied = {
    died: false, why: null, spendFloorUsd: null, wallFloorMs: null,
  };
  if (outcome !== null && outcome !== undefined) return notDied; // a real job-end was reached
  let mtimeMs;
  try { mtimeMs = statSync(spinePath).mtimeMs; } catch { return notDied; }
  if (Date.now() - mtimeMs <= DIED_MTIME_MS) return notDied; // still fresh — genuinely `running`, not died

  const withTs = records.filter((r) => r && typeof r === 'object' && typeof r.ts === 'string');
  const last = withTs.length ? withTs[withTs.length - 1] : null;
  const when = last ? formatTimestamp(last.ts) : 'an unknown time';
  const why = `died — no ending was recorded (killed, crashed, or the machine slept). Last thing it did: ${describeLastRecord(last)} at ${when}.`;

  let spendSum = 0;
  let pricedCount = 0;
  for (const r of records) {
    if (!r || typeof r !== 'object' || !SPEND_RECORD_TYPES.includes(r.type)) continue; // worker-result echoes excluded by construction — not a spend type
    if (typeof r.costUsd === 'number' && Number.isFinite(r.costUsd)) { spendSum += r.costUsd; pricedCount += 1; }
  }
  const spendFloorUsd = pricedCount > 0 ? spendSum : null;

  const firstMs = withTs.length ? Date.parse(withTs[0].ts) : NaN;
  const lastMs = withTs.length ? Date.parse(withTs[withTs.length - 1].ts) : NaN;
  const wallFloorMs = Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs >= firstMs ? lastMs - firstMs : null;

  return {
    died: true, why, spendFloorUsd, wallFloorMs,
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
 * One `/api/runs` row, or `{ ...row, fileMissing: true }` when the row's
 * spine no longer exists on disk — never silently listed as if it were
 * still there (the same rule {@link import('../runlist.js').formatRunRow}
 * already applies to the CLI's own listing).
 * @param {import('../runlist.js').RunRow} row
 * @returns {any}
 */
function summarizeRow(row) {
  if (!existsSync(row.spine)) {
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
  const death = deriveDeath(row.spine, rawRecords, summary.outcome);
  return {
    runid: row.runid,
    job: row.job,
    at: row.at,
    via: row.via,
    fileMissing: false,
    died: death.died,
    glyph: death.died ? '?' : glyphForOutcome(summary.outcome),
    checkType: checkTypeLabel(summary.verdictType, row.at),
    checkTypeTitle: checkTypeTitle(summary.verdictType, row.at),
    model: summary.model,
    // died: never "unknown" when a priced round exists — glyph [?] already
    // carries the word "died", so the row meta text itself never repeats it.
    spend: death.died ? (death.spendFloorUsd !== null ? `at least $${death.spendFloorUsd.toFixed(4)}` : 'unknown') : line.spend,
    wall: death.died ? (death.wallFloorMs !== null ? `at least ${formatDurationMs(death.wallFloorMs)}` : 'unknown') : line.wall,
    date: typeof row.at === 'string' ? row.at.slice(0, 10) : null,
  };
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
 * arbitrary one. Reused by `/api/workflows`'s own grouping so the two
 * endpoints never compute the glyph/checkType mapping twice.
 * @param {{ home?: string }} [opts]
 * @returns {any[]}
 */
export function listRuns(opts = {}) {
  const { rows } = readRunList(opts);
  const atMs = (r) => {
    const t = typeof r?.at === 'string' ? Date.parse(r.at) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return rows
    .map((row, index) => ({ row, index })) // index: stable tie-break, see doc above
    .sort((a, b) => (atMs(b.row) - atMs(a.row)) || (a.index - b.index))
    .map(({ row }) => summarizeRow(row));
}

/**
 * `GET /api/workflows` — the run list grouped by job name: run count, last
 * run date, last result glyph/check type. Sorted by last-run date, newest
 * first (a job never run yet has no row here at all — P1 has no concept of
 * an unsigned/never-run job, unlike the mockup's Workflows tab; that gap is
 * named in the build report, not papered over).
 * @param {{ home?: string }} [opts]
 * @returns {any[]}
 */
export function listWorkflows(opts = {}) {
  const rows = listRuns(opts);
  /** @type {Map<string, any>} */
  const byJob = new Map();
  for (const r of rows) {
    const existing = byJob.get(r.job);
    if (!existing) {
      byJob.set(r.job, {
        job: r.job,
        runCount: 1,
        lastAt: r.at,
        lastRunid: r.runid,
        lastGlyph: r.glyph ?? '▶',
        lastCheckType: r.checkType ?? 'unknown',
        lastSpend: r.spend ?? 'unknown',
        lastWall: r.wall ?? 'unknown',
        lastDate: r.date,
      });
    } else {
      existing.runCount += 1;
      // rows are already newest-first, so the FIRST row seen for a job is its latest
    }
  }
  return [...byJob.values()];
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
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
  if (!row) return null;
  if (!existsSync(row.spine)) {
    return {
      runid, job: row.job, at: row.at, via: row.via, fileMissing: true,
    };
  }
  const summary = replayOne(row.spine);
  const timelineKind = summary.timelineKind;
  const units = timelineKind === 'iterations' ? summary.iterations : summary.steps;
  const rawSpineRecords = parseJsonl(row.spine).records;
  const death = deriveDeath(row.spine, rawSpineRecords, summary.outcome);
  const steps = units.map((u, idx) => {
    const isLast = idx === units.length - 1;
    /** @type {'done'|'stopped'|'running'|'waiting'|'died'} */
    let state;
    const outcome = timelineKind === 'iterations' ? u.verdict : u.outcome;
    const isGreen = outcome === 'green' || outcome === 'already-green' || outcome === 'satisfied';
    if (outcome !== null && outcome !== undefined) state = isGreen ? 'done' : 'stopped';
    else if (isLast && death.died) state = 'died';
    else if (isLast && summary.outcome === null) state = 'running';
    else state = 'waiting';
    return {
      id: timelineKind === 'iterations' ? `iteration ${u.iteration ?? idx + 1}` : u.id,
      occurrence: timelineKind === 'iterations' ? null : u.occurrence,
      outcome: outcome ?? null,
      state,
      rounds: u.rounds,
      toolCalls: u.toolCalls,
      wallMs: u.wallMs,
      spentUsd: u.spentUsd,
      unpricedRounds: u.unpricedRounds,
      checks: timelineKind === 'iterations' ? null : u.checks,
      treeChanged: timelineKind === 'iterations' ? null : u.treeChanged,
      tripped: u.tripped,
    };
  });
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
      synthetic: true,
    });
  }
  return {
    runid: summary.runId ?? runid,
    job: summary.job ?? row.job,
    goal: summary.goal,
    checkType: checkTypeLabel(summary.verdictType, row.at),
    checkTypeTitle: checkTypeTitle(summary.verdictType, row.at),
    model: summary.model,
    budgetUsd: summary.budgetUsd,
    glyph: death.died ? '?' : glyphForOutcome(summary.outcome),
    outcome: summary.outcome,
    died: death.died,
    stopReason: death.died ? death.why : summary.stopReason,
    spentUsd: summary.spentUsd,
    // died: a spend floor summed from real priced rounds present in the
    // file — never null/unknown when at least one priced round exists.
    // `null` on a non-died run (the normal `spentUsd`/`wallMs` fields above
    // are already the real, complete figures there).
    spendFloorUsd: death.died ? death.spendFloorUsd : null,
    wallFloorMs: death.died ? death.wallFloorMs : null,
    spendComplete: summary.spendComplete,
    wallMs: summary.wallMs,
    timelineKind,
    steps,
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
    // share one filename — see {@link runAuditWindow}'s doc) — never
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
    behaviour: scopedBehaviour(row.spine, rawSpineRecords),
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
 * sidecar path). No `step`/`run_id` field in the gate-audit row is a
 * reliable enough key on its own (the file header's own doc: gate-audit rows
 * carry no `step`; a shared file can even reuse a `run_id` across archived
 * copies), so `ts` bounded by this run's own `job-start`/`job-end` — the one
 * pair of timestamps `replayRun` already trusts for the SAME purpose (its
 * per-occurrence `buildOccurrenceMetrics` windowing) — is the only honest
 * scope. `endTs` is `Infinity` when no `job-end` was ever reached (a died/
 * still-running run) — never clamped to this spine's own last record's `ts`,
 * which would wrongly exclude a real tool call the gate logged just AFTER
 * the spine's own last record landed (spine and gate-audit are written by
 * different seams and are not guaranteed to interleave exactly). The
 * measured real contamination above is rows from an EARLIER run, before
 * this run's own `job-start` — bounding only the lower edge already fixes
 * that; bounding the upper edge too would risk the opposite, newly-
 * introduced failure on the far more common still-running/died shape.
 * @param {any[]} spineRecords
 * @returns {{startTs: number, endTs: number}}
 */
function runAuditWindow(spineRecords) {
  const jobStart = spineRecords.find((r) => r && r.type === 'job-start') ?? null;
  const jobEnd = [...spineRecords].reverse().find((r) => r && r.type === 'job-end') ?? null;
  const startMs = jobStart && typeof jobStart.ts === 'string' ? Date.parse(jobStart.ts) : -Infinity;
  const endMs = jobEnd && typeof jobEnd.ts === 'string' ? Date.parse(jobEnd.ts) : Infinity;
  return {
    startTs: Number.isFinite(startMs) ? startMs : -Infinity,
    endTs: Number.isFinite(endMs) ? endMs : Infinity,
  };
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
function makeRoundLookup(spineRecords) {
  const roundTsMs = spineRecords
    .filter((r) => r && SPEND_RECORD_TYPES.includes(r.type) && typeof r.ts === 'string')
    .map((r) => Date.parse(r.ts))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
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
 * `runBehaviour`, fed only the gate-audit rows inside this run's own ts
 * window (see {@link runAuditWindow}) — the panel-side fix for the same
 * contamination `getRunAudit` fixes for the Audit tab, kept as ONE shared
 * scoping function so the Audit tab and the Run tab's tools/cache summary
 * can never disagree with each other about which rows belong to this run.
 * `null` when no gate-audit sidecar exists at all (never a fake all-zero
 * object — same rule `replayRun`'s own `auditAvailable` already follows).
 * @param {string} spinePath
 * @param {any[]} spineRecords
 * @returns {ReturnType<typeof runBehaviour>|null}
 */
function scopedBehaviour(spinePath, spineRecords) {
  const { auditPath } = resolveSiblings(spinePath);
  if (!auditPath || !existsSync(auditPath)) return null;
  const { records } = parseJsonl(auditPath);
  const { startTs, endTs } = runAuditWindow(spineRecords);
  const windowed = records.filter((r) => {
    if (!r || typeof r !== 'object' || typeof r.ts !== 'string') return false;
    const ms = Date.parse(r.ts);
    return Number.isFinite(ms) && ms >= startTs && ms <= endTs;
  });
  return runBehaviour(windowed);
}

/**
 * `GET /api/runs/:runid/audit` — the Audit tab's rows, off the run's own
 * gate-audit sidecar (name-convention resolution, `src/replayio.js`'s
 * `resolveSiblings`), scoped to this run's own ts window (see {@link
 * runAuditWindow} — a sidecar can carry other runs' rows). A row's real
 * fields (`ts`, `action.type`, `action.path`, `decision`) — `step` is
 * honestly `null` (no gate-audit row carries one; see `src/replay.js`'s own
 * header comment) rather than guessed from a seq-window the way `replayRun`'s
 * internal windowing does for its own aggregate counts. `round` — see
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
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
  if (!row) return null;
  if (!existsSync(row.spine)) {
    return {
      runid, rows: [], raw: '', empty: true, reason: 'no-sidecar',
    };
  }
  const { auditPath } = resolveSiblings(row.spine);
  if (!auditPath || !existsSync(auditPath)) {
    return {
      runid, rows: [], raw: '', empty: true, reason: 'no-sidecar',
    };
  }
  const { records: spineRecords } = parseJsonl(row.spine);
  const { startTs, endTs } = runAuditWindow(spineRecords);
  const roundOf = makeRoundLookup(spineRecords);

  const { records } = parseJsonl(auditPath);
  const rawText = readFileSync(auditPath, 'utf8');
  const windowed = records.filter((r) => {
    if (!r || typeof r !== 'object' || typeof r.ts !== 'string') return false;
    const ms = Date.parse(r.ts);
    return Number.isFinite(ms) && ms >= startTs && ms <= endTs;
  });
  const auditRows = windowed.map((r) => {
    const isModelCall = r.action && r.action.type === 'llm';
    const resultObj = isModelCall && r.result && typeof r.result === 'object' ? r.result : null;
    return {
      time: typeof r.ts === 'string' ? r.ts : null,
      action: r.action && typeof r.action.type === 'string' ? r.action.type : null,
      path: r.action && typeof r.action.path === 'string' ? r.action.path : null,
      decision: typeof r.decision === 'string' ? r.decision : null,
      step: null,
      round: roundOf(r.ts),
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
  const { rows } = readRunList(opts);
  const row = rows.find((r) => r && r.runid === runid);
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
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ home?: string, port: number }} opts
 */
export function handleRequest(req, res, opts) {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'method not allowed — this panel is read-only (GET/HEAD only)');
    return;
  }

  let url;
  try {
    url = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1');
  } catch {
    sendText(res, 400, 'bad request');
    return;
  }
  const { pathname } = url;

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
  if (pathname === '/api/workflows') { send(200, { workflows: listWorkflows({ home: opts.home }) }); return; }

  const runMatch = /^\/api\/runs\/([^/]+)(\/(audit|job))?$/.exec(pathname);
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
 * @param {{ port?: number, home?: string }} [opts]
 * @returns {Promise<{ server: import('node:http').Server, port: number, close: () => Promise<void> }>}
 */
export function createPanelServer(opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const home = opts.home;
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        handleRequest(req, res, { home, port });
      } catch (e) {
        sendText(res, 500, `internal error: ${/** @type {Error} */ (e).message}`);
      }
    });
    server.once('error', (e) => {
      const err = /** @type {any} */ (e);
      err.port = port;
      reject(err);
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port,
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
 * @param {{ out: (s: string) => void, err: (s: string) => void, runlistHome?: string }} ctx
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
    const { port: boundPort } = await createPanelServer({ port, home: ctx.runlistHome });
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
