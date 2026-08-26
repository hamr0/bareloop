// Generic run replay (PRD build-list TODO #6): today no failed run can be
// reconstructed in under five minutes — every byte is on disk (the spine
// JSONL + its gate-audit sidecar) but only hand-slicing JSONL reads it. This
// is a report-only reader: point it at a run's spine records, get the whole
// story back as one object and one printable page. Reads only, writes
// NOTHING, mints no verdict, touches nothing in the arbiter — same posture
// as `runBehaviour` (src/behaviour.js), which this reuses rather than
// re-implementing.
//
// Field provenance (every field this module reads, grepped to its `emit(`
// site so nothing here is a guessed shape):
//   job-start      {job, specHash, budgetUsd, shape, goal, verdictType, model?, ...}
//                                                                  src/run.js:227-256,303
//     `verdictType`/`model` (F117, PRD TODO #20, landed 2026-08-25): `verdictType` is
//     a REQUIRED spec field (src/job.js:552 reds `missing-required` before job-start
//     ever fires), so it is always real on every spine carrying it — `null` here means
//     only "older than the field", never "unset". `model` rides along only when the
//     shell-owned provider binding itself carried a `.model` string at job-start time
//     (src/planrun.js:76's own comment: bare-agent's Loop reads `baseProvider.model`
//     directly) — absent on a native/clipipe call path, never guessed.
//     `code` (F118, the run→code direction, landed same day): `{version, sha}`
//     from `codeVersion()` (src/codeversion.js) — `sha` is null when the
//     process ran from an npm install with no `.git`; the whole `code` key is
//     absent on any spine older than this landing.
//   job-end        {outcome, spentUsd, spendComplete, engagementSpentUsd}
//                                                                  src/run.js:288,378-413
//   escalation     {category, decisionReady, verdicts?, spend?, decision, options, detail?}
//                                                                  src/ralph.js:576,648,693;
//                                                                  src/planrun.js (many sites)
//   step-start     {step, rounds, tools}                          src/planrun.js:2699
//   step-end       {step, outcome}                                src/planrun.js:2973
//   worker-round   {phase, iteration, kind, costUsd, pricing, tokens, usage}
//                                                                  src/planrun.js:2288-2297
//     `phase` is `step:<step.id>` for a plan step's own attempts, `scout` /
//     `plan` / `fix` for the other worker phases — src/planrun.js:2735,2515,3359.
//     `costUsd` is `arg?.costUsd ?? null` — a null is an HONEST unpriced round
//     (F6), never summed as $0 by this module.
//   exit-eval      {step, iteration, results: [{type, pass, detail?}]}
//                                                                  src/planrun.js:2897
//     each `results[i].type` is one of plan.js's EXIT_TYPES; `check-passes`
//     and `tree-changed` are the two this module reads.
//   transport-retry {phase, attempt, error, recovered}             src/planrun.js:126
//     (F119, live-proven 2026-08-25 on u-mt8yk53k, two records): `attempt` is
//     always `1` (`withTransportRetry`'s own comment there — one retry,
//     transport-only, hamr's ruling); `recovered` is knowable only once the
//     retried attempt settles, so it is never speculative. src/run.js:266,393
//     treats the record's PRESENCE alone (never `recovered`) as a one-way
//     floor on `spendComplete` — the first attempt may already have been
//     billed and threw before returning any usage figure.
//   memory-cache   {pointered, capped, bytesWithheld, approxTokens} src/planrun.js:3619
//   work-branch    {branch, created, resumed, from, base, repo, collided?}
//                                                                  src/planrun.js:1589
//     absent on any archived spine older than PRD v1.57 §3's work-branch
//     rung (measured: 0 records in bareagent-u-bareloop's Aug-3/4 archive) —
//     reads `none recorded`, never a fabricated/derived branch name.
//   plan-executed  {steps, replanned, replans}                    src/planrun.js:2688
//     `replans` (a number) is likewise absent on an older archived spine
//     (same vintage as work-branch's gap) — this module falls back to
//     counting `materials` records with `phase:'replan'` (src/planrun.js:2520,
//     one per replan draft) when the field itself is missing, never guesses 0.
//   run-start      {capRuns|strikeLimit, close}                   src/ralph.js:554
//   iteration-start {iteration}                                   src/ralph.js:583
//   close-verdict  {iteration, verdict, gap?, detail?, stages?, judgedCount?}
//                                                                  src/ralph.js:674
//     A close-verdict with an ARRAY `stages` field came from `runCloseStages`
//     (src/ralph.js:328's `runStages`, which always sets `stages` on its
//     return — src/planrun.js:1496's `judgeClose`, the operator's REAL close).
//     A close-verdict with NO `stages` field came from a PLAN STEP's own
//     micro-loop, judged by the exit evaluator instead of a command
//     (src/planrun.js:2907's `ralph({judge, ...})` — ralph.js's own docs:
//     "`judge`... replaces runClose for this loop"). These are two DIFFERENT
//     verdict sources sharing one emit type; only the `stages`-carrying kind
//     is "the close" this module's CLOSE section reports (see `resolveClose`).
//   outer-close    {verdict, stage?, stages?, gap?, detail?, judgedCount?}
//                                                                  src/planrun.js:3296
//     the FINAL close-fix-loop verdict — always the operator's real close (no
//     step-level equivalent of this emit type exists).
//   run-end        {outcome, iterations}                          src/ralph.js:577,657,676,698
//   wall-clock/wall-halt  see chainClock below.
//   (every record's own) ts, seq, type                            src/spine.js
// Gate-audit rows (the tool-call sidecar) are handed to `runBehaviour`
// unmodified — see src/behaviour.js for ITS field provenance (`run_id`,
// `phase`, `action.{type,path,args}`, `decision`); this module additionally
// reads each row's own `ts` (present on every gate-audit row emitted by
// src/tools.js's gate) to window tool calls into the step/iteration that was
// running when they happened — gate-audit rows carry no `step` field and no
// `seq` shared with the spine (their own `seq` is a separate per-audit-file
// counter), so `ts` is the only windowing key available for them.
//
// `runId` is NOT a spine field: nowhere does a job's own run id (the `u-<id>`
// in its filename) land inside a record. It only exists as the filename, so
// it is accepted as caller-supplied metadata via the third `opts` argument —
// the same shape `runBehaviour(events, {runId})` already uses for its own
// (different) runId — never invented as a fabricated record field.
//
// Explicitly NOT surfaced, and why: the signed verdict CLASS (green/softgreen)
// and the worker MODEL name live only in the signed spec — no spine record
// carries either (a `judgedCount` on a close-verdict is not a reliable stand-in:
// it appears on plain green closes too, not only softgreen ones). Adding them
// would be a spine-WRITER change to `job-start` (src/run.js), which this
// report-only reader does not make on its own authority — parked for hamr's
// explicit word (PRD TODO #20, F117).

import { runBehaviour, formatBehaviour } from './behaviour.js';
import { shortSha } from './codeversion.js';

/**
 * @param {unknown} e
 * @returns {e is Record<string, any>}
 */
function isRecord(e) {
  return e !== null && typeof e === 'object' && !Array.isArray(e);
}

/**
 * @param {unknown} e
 * @returns {e is {type: string, [k: string]: any}}
 */
function isSpineEvent(e) {
  return isRecord(e) && typeof e.type === 'string';
}

/** @param {string|undefined} ts @returns {number|null} */
function parseTs(ts) {
  if (typeof ts !== 'string') return null;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : null;
}

/**
 * Trim a string to `max` chars with an explicit `…[+N chars]` marker —
 * NEVER a silent truncation, and never a trailing ellipsis alone
 * (indistinguishable from a detail that just happened to end there). Used
 * for the full-report `stopReason` (400 chars) and the per-occurrence
 * `↳ tripped:` line (120 chars) — both multi-line contexts where the fuller
 * honesty marker earns its keep. The header block's `goal:` line and the
 * `--all` table's `reason` column use the plainer {@link hardTrim} instead,
 * because THEIR job is staying exactly one line.
 * @param {unknown} s
 * @param {number} max
 * @returns {string|null}
 */
function trimTo(s, max) {
  if (typeof s !== 'string' || s.length === 0) return null;
  const trimmed = s.trimEnd(); // trailing newlines (common in captured stderr) never open the marker on a blank line
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  return `${cut}…[+${trimmed.length - max} chars]`;
}

/**
 * Plain one-line trim: normalizes whitespace/newlines to single spaces, then
 * hard-cuts at `max` chars with a bare `…` — no `[+N chars]` marker (unlike
 * {@link trimTo}). Feeds the header's `goal:` line and the `--all` table's
 * `reason` column, both single-line-by-design.
 * @param {unknown} s
 * @param {number} max
 * @returns {string|null}
 */
function hardTrim(s, max) {
  if (typeof s !== 'string') return null;
  const oneLine = s.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return null;
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

const STOP_REASON_DETAIL_MAX = 400;
const TRIP_DETAIL_MAX = 120;
const GOAL_MAX = 100;
const ALL_REASON_MAX = 60;

/** A field the header expects but this particular spine never recorded
 * (an older archive predating the field, or a run that died before the
 * record fired) — printed literally, never blank, never a fabricated 0. */
const NONE_RECORDED = 'none recorded';

/**
 * `stopReason` for a non-green outcome: `category — decision — detail`, every
 * part present that the escalation actually carries (see the field-site
 * comment at its one call site in {@link replayRun}). Falls back to the bare
 * outcome string when the run stopped before any escalation record exists.
 * @param {any} lastEscalation
 * @param {string|null} outcome
 * @returns {string|null}
 */
function buildStopReason(lastEscalation, outcome) {
  if (!lastEscalation) return outcome;
  // `category` is dropped when it is IDENTICAL to the job-end outcome (the
  // common case: outcome 'provider-red' from an escalation category
  // 'provider-red') — the header already prints the outcome immediately
  // before this string, so repeating it verbatim is noise, not information.
  // A run where they genuinely differ (outcome 'escalated' from category
  // 'cap-halt', e.g.) keeps the category — that IS new information.
  const category = lastEscalation.category !== outcome ? lastEscalation.category : null;
  const parts = [category, lastEscalation.decision, trimTo(lastEscalation.detail, STOP_REASON_DETAIL_MAX)]
    .filter((p) => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' — ') : outcome;
}

/**
 * The LAST escalation whose `seq` falls inside `(startSeq, endSeq]` — an
 * occurrence/iteration "tripped" by an escalation. Inclusive on the upper
 * bound (unlike the round/check windowing below, which is exclusive on both
 * ends) because on the ITERATIONS timeline the escalation record can BE the
 * boundary itself. Harmless on the STEPS timeline: no escalation record ever
 * shares a step-end's exact `seq`.
 * @param {any[]} escalations
 * @param {number} startSeq
 * @param {number} endSeq
 * @returns {any|null}
 */
function findTrip(escalations, startSeq, endSeq) {
  const inWindow = escalations.filter((e) => typeof e.seq === 'number' && e.seq > startSeq && e.seq <= endSeq);
  return inWindow.length ? inWindow[inWindow.length - 1] : null;
}

/**
 * Sum `costUsd` over an already seq-windowed slice of `worker-round` records.
 * Doctrine (F6, same rule as the run-level spend floor): a `null`/non-finite
 * `costUsd` on ANY round in the window makes the whole occurrence's spend
 * `null` (unknown) — NEVER 0, and never a partial sum stamped as exact. Zero
 * rounds in the window is a REAL zero (nothing ran, nothing was spent), not
 * an unknown one, so that case alone returns `0`.
 * @param {any[]} rounds
 * @returns {{spentUsd: number|null, unpricedRounds: number}}
 */
function windowSpend(rounds) {
  if (rounds.length === 0) return { spentUsd: 0, unpricedRounds: 0 };
  let sum = 0;
  let unpriced = 0;
  for (const r of rounds) {
    if (typeof r.costUsd === 'number' && Number.isFinite(r.costUsd)) sum += r.costUsd;
    else unpriced += 1;
  }
  return { spentUsd: unpriced > 0 ? null : sum, unpricedRounds: unpriced };
}

/**
 * @param {number|null} startTs
 * @param {number|null} endTs
 * @returns {number|null}
 */
function windowWallMs(startTs, endTs) {
  if (startTs === null || endTs === null) return null;
  const d = endTs - startTs;
  return d >= 0 ? d : null; // an out-of-order ts pair reads as unknown, never a negative duration
}

/**
 * `transport-retry` records (F119) whose `seq` falls inside `(startSeq,
 * endSeq)` — same open-interval windowing as {@link windowSpend}'s rounds.
 * Multiple retries in one window all count; the displayed error text is the
 * FIRST record's (every retry is `attempt:1` per src/planrun.js:126's own
 * comment — one transport-only retry — so the first record represents the
 * group even when more than one fired in the same occurrence). `label` is
 * `recovered` only when EVERY retry in the window recovered, `not recovered`
 * when none did, and `partially recovered` on a genuine mix — never
 * collapsed to one word that hides a real split.
 * @param {any[]} retries
 * @param {number} startSeq
 * @param {number} endSeq
 * @returns {{count: number, label: string, error: string|null}|null}
 */
function windowTransportRetries(retries, startSeq, endSeq) {
  const inWindow = retries.filter((r) => typeof r.seq === 'number' && r.seq > startSeq && r.seq < endSeq);
  if (inWindow.length === 0) return null;
  const recoveredCount = inWindow.filter((r) => r.recovered === true).length;
  const label = recoveredCount === inWindow.length ? 'recovered' : recoveredCount === 0 ? 'not recovered' : 'partially recovered';
  return { count: inWindow.length, label, error: hardTrim(inWindow[0].error, 80) };
}

/**
 * The REASON(S) behind a `spendComplete:false` job-end, derived from spine
 * records — never guessed, never picking just one when more than one truly
 * applies. Mirrors src/run.js:229-276's four one-way floor flags plus the
 * resume fold's own fifth: transport retry (any `transport-retry` record's
 * presence, src/run.js:266,393 — `recovered` is irrelevant to the flag),
 * unpriced round (a `worker-round`/`judge-round` with non-finite `costUsd`;
 * `ACCOUNTED_ROUND_TYPES`, src/run.js:38,380), cut mid-call (a `wall-halt`
 * record with `cutMidCall:true`, src/run.js:257,389), stall (a `stall`
 * record, src/run.js:246,385), prior leg floor (`job-start.priorSpendComplete
 * === false`, src/run.js:240,328). Returns `[]` when `spendComplete` is true
 * (nothing to explain) OR when it is false but this spine carries no
 * derivable evidence at all (an older archive, or a floor inherited from a
 * resumed leg not in this file) — the caller prints the honest
 * "reason not in spine" fallback for that empty case, never a guess.
 * @param {any[]} spine
 * @param {any} jobStart
 * @param {boolean} spendComplete
 * @returns {string[]}
 */
function floorReasons(spine, jobStart, spendComplete) {
  if (spendComplete) return [];
  const reasons = [];
  const transportRetryCount = spine.filter((e) => e.type === 'transport-retry').length;
  if (transportRetryCount > 0) reasons.push(`transport retry ×${transportRetryCount}`);
  const unpricedRoundCount = spine.filter((e) => (e.type === 'worker-round' || e.type === 'judge-round')
    && !(typeof e.costUsd === 'number' && Number.isFinite(e.costUsd))).length;
  if (unpricedRoundCount > 0) reasons.push('unpriced round(s)');
  if (spine.some((e) => e.type === 'wall-halt' && e.cutMidCall === true)) reasons.push('cut mid-call');
  if (spine.some((e) => e.type === 'stall')) reasons.push('stall');
  if (jobStart && jobStart.priorSpendComplete === false) reasons.push('prior leg floor');
  return reasons;
}

/**
 * Which `close-verdict`/`outer-close` record is "the close" — the
 * OPERATOR's real, signed close, never a plan step's own exit-eval judge
 * loop (see the file header's `close-verdict` entry for why `stages` is the
 * reliable discriminator). Picks the LAST qualifying record BY SEQ — never a
 * type preference: `outer-close` (src/planrun.js:3296's `judgeClose()`) is
 * the PRECHECK against the real close, fired ONCE before the fix loop even
 * starts, so when it comes back red the fix loop's OWN staged close-verdicts
 * (src/planrun.js:3539, `runCloseStages`-backed like `outer-close` itself)
 * run strictly AFTER it and are the true final answer — measured on
 * u-msf70nei: `outer-close` at seq 14 reads `needs_revision`, but the fix
 * loop's own close-verdict at seq 97 (LATER) reads `satisfied`, and that is
 * what the run actually ended on (`job-end.outcome:'green'`). Picking
 * `outer-close` unconditionally would have reported a run that went green as
 * still needing revision.
 * @param {any[]} spine
 * @returns {{source: 'close-verdict'|'outer-close', iteration: number|null,
 *   verdict: string|null, stages: any[]|null}|null}
 */
function resolveClose(spine) {
  const candidates = spine.filter((e) => (e.type === 'close-verdict' && Array.isArray(e.stages)) || e.type === 'outer-close');
  const picked = candidates.length ? candidates[candidates.length - 1] : null;
  if (!picked) return null;
  return {
    source: picked.type === 'outer-close' ? 'outer-close' : 'close-verdict',
    iteration: typeof picked.iteration === 'number' ? picked.iteration : null,
    verdict: picked.verdict ?? null,
    stages: Array.isArray(picked.stages) ? picked.stages : null,
  };
}

/**
 * Reconstruct one run's whole story from its spine + gate-audit. Pure: no
 * IO, no spine writes, no verdict. Malformed/non-object entries in either
 * array are skipped and counted, never thrown on.
 *
 * A step id can recur (a replan re-executes the same step): `steps[].occurrence`
 * is 1 for that id's first step-start..step-end pair, 2 for its second, etc.
 * Every field on an occurrence — rounds, toolCalls, checks, treeChanged, wallMs,
 * spentUsd — is scoped to records strictly between ITS OWN start/end `seq`,
 * never pooled across every occurrence sharing the id.
 *
 * A run whose spine carries no `step-start` at all (the plan's only step was
 * already-green-skipped on a resumed leg, or a genuinely legacy loop-only
 * shape) has no STEPS timeline to build — `timelineKind` reads `'iterations'`
 * and `iterations[]` is populated from `iteration-start`/`close-verdict`/
 * `run-end`/`escalation` instead. `steps`/`iterations` are never both
 * populated: exactly one is non-empty, selected by `timelineKind`.
 *
 * @param {any[]} spineEvents parsed records from `u-<id>.jsonl`
 * @param {any[]} [auditEvents] parsed records from the sibling `-gate-audit.jsonl`
 * @param {{runId?: string|null}} [opts] `runId`: caller-supplied (the spine
 *   carries no run-id field of its own — see the file header)
 */
export function replayRun(spineEvents, auditEvents = [], { runId = null } = {}) {
  let skipped = 0;

  /** @type {any[]} */
  const spine = [];
  for (const e of Array.isArray(spineEvents) ? spineEvents : []) {
    if (isSpineEvent(e)) spine.push(e);
    else skipped += 1;
  }
  /** @type {any[]} */
  const audit = [];
  for (const e of Array.isArray(auditEvents) ? auditEvents : []) {
    if (isRecord(e)) audit.push(e);
    else skipped += 1;
  }

  const jobStart = spine.find((e) => e.type === 'job-start') ?? null;
  const jobEnd = spine.findLast((e) => e.type === 'job-end') ?? null;
  const outcome = jobEnd ? (jobEnd.outcome ?? null) : null;
  const isGreen = outcome === 'green' || outcome === 'already-green';

  const escalations = spine.filter((e) => e.type === 'escalation');
  const lastEscalation = escalations.length ? escalations[escalations.length - 1] : null;
  // detail field sites (grepped): src/run.js:342 (smoke-red), src/ralph.js:656
  // (the DECISIONS passthrough — `detail: String(e.message || e)`),
  // src/planrun.js:2427 (the `relay()` transport/cap/wall relay), plus every
  // declared-close-red site (src/planrun.js:1111,1129,1656,1693,1742,3315)
  // and the wall-halt sites (src/planrun.js:2990,3208-3209).
  const stopReason = isGreen ? null : buildStopReason(lastEscalation, outcome);

  const spentUsd = jobEnd && typeof jobEnd.spentUsd === 'number' && Number.isFinite(jobEnd.spentUsd) ? jobEnd.spentUsd : null;
  const spendComplete = jobEnd ? jobEnd.spendComplete === true && spentUsd !== null : false;
  const floorReasonList = floorReasons(spine, jobStart, spendComplete);

  const wallMs = windowWallMs(parseTs(jobStart?.ts), parseTs(jobEnd?.ts));

  // chainClock: the SIGNED wall, read off the run's own clock record —
  // src/planrun.js:1203 (`wall-clock`) or `emitWallHalt` (src/planrun.js:1269)
  // — both spread `clock.report()` (src/clock.js:235-247: `bounded,
  // requestedMs, closeStages, enforcedMs, elapsedMs, remainingMs`).
  // `elapsedMs` on EITHER is chain-scoped by construction (`createClock`'s
  // `priorElapsedMs` fold, src/clock.js:174). wall-halt is preferred: it is
  // the TERMINAL reading, taken at the moment the wall actually stopped the
  // run. wall-clock (emitted once, near the top of every run) is the
  // fallback — it reads the chain's folded elapsed at THIS ENGAGEMENT'S
  // START, never this run's own end.
  /** @type {{source: 'wall-halt'|'wall-clock', elapsedMs: number, requestedMs: number|null, enforcedMs: number|null, bounded: boolean}|null} */
  let chainClock = null;
  {
    const wallHalts = spine.filter((e) => e.type === 'wall-halt');
    const wallClocks = spine.filter((e) => e.type === 'wall-clock');
    const source = wallHalts.length ? wallHalts[wallHalts.length - 1]
      : wallClocks.length ? wallClocks[wallClocks.length - 1] : null;
    if (source && typeof source.elapsedMs === 'number' && Number.isFinite(source.elapsedMs)) {
      chainClock = {
        source: /** @type {'wall-halt'|'wall-clock'} */ (wallHalts.length ? 'wall-halt' : 'wall-clock'),
        elapsedMs: source.elapsedMs,
        requestedMs: typeof source.requestedMs === 'number' && Number.isFinite(source.requestedMs) ? source.requestedMs : null,
        enforcedMs: typeof source.enforcedMs === 'number' && Number.isFinite(source.enforcedMs) ? source.enforcedMs : null,
        bounded: source.bounded === true,
      };
    }
  }

  // work-branch: src/planrun.js:1589. Absent on any archive older than the
  // work-branch rung (measured, see file header) — `null`, never a derived name.
  const workBranchRecords = spine.filter((e) => e.type === 'work-branch');
  const branch = workBranchRecords.length && typeof workBranchRecords[workBranchRecords.length - 1].branch === 'string'
    ? workBranchRecords[workBranchRecords.length - 1].branch : null;

  const stepStarts = spine.filter((e) => e.type === 'step-start');
  const stepEnds = spine.filter((e) => e.type === 'step-end');
  const workerRounds = spine.filter((e) => e.type === 'worker-round');
  const exitEvals = spine.filter((e) => e.type === 'exit-eval');

  // F119: every `transport-retry` record on this spine, and the (derived,
  // never guessed) reason(s) behind a `spendComplete:false` job-end — see
  // {@link floorReasons}'s own doc for the full mapping back to src/run.js.
  const transportRetries = spine.filter((e) => e.type === 'transport-retry');

  // resumed / resumeSeed / thisFileSpend — a RESUMED run's `job-end.spentUsd`
  // is the CHAIN total (prior legs folded in: src/run.js:227's `chainFoldUsd`
  // seeds `spentUsd` from `job-start.priorSpentUsd`), so it can NEVER equal
  // the sum of THIS file's own worker-rounds, and the header must say so
  // rather than let the two numbers silently disagree (measured:
  // u-msf70nei's header read $5.3389 while its own 55 rounds sum to
  // $1.2127). `resumed` is read off `job-start.priorSpentUsd` — the SAME
  // condition src/run.js itself uses to decide whether to fold — not off
  // `resume-seed`'s presence: resume-seed (src/planrun.js:2622) is a
  // NARROWER record that fires only when a plan is actually reloaded
  // mid-flight, and its absence does NOT mean "not resumed". Measured
  // directly: 4 real archived runs (litectx-maintainer's msx7xoe0, msx87qqs,
  // msxf9129, msxf2mwi) carry `job-start.priorSpentUsd` — a real chain fold —
  // with NO resume-seed record at all (resumed before any plan reload was
  // needed); keying "resumed" on resume-seed alone would have printed
  // `resumed: no` on genuinely resumed runs and mis-explained their spend.
  const resumed = jobStart && typeof jobStart.priorSpentUsd === 'number' && Number.isFinite(jobStart.priorSpentUsd) && jobStart.priorSpentUsd > 0;

  // resumeSeed: the DETAIL fields (phase/completed/skipping/divergence) —
  // present only on the narrower resume-seed record; `resumed` above stays
  // true even when this is null (see above).
  const resumeSeedRecords = spine.filter((e) => e.type === 'resume-seed');
  const lastResumeSeed = resumeSeedRecords.length ? resumeSeedRecords[resumeSeedRecords.length - 1] : null;
  const resumeSeed = lastResumeSeed ? {
    phase: lastResumeSeed.phase ?? null,
    completed: Array.isArray(lastResumeSeed.completed) ? lastResumeSeed.completed.length : null,
    skipping: typeof lastResumeSeed.skipping === 'number' ? lastResumeSeed.skipping : null,
    divergence: typeof lastResumeSeed.divergence === 'string' ? lastResumeSeed.divergence : null,
  } : null;

  // thisFileSpend: prefer `job-end.engagementSpentUsd` (F103, src/run.js:284
  // — THIS engagement's own spend, folded out of the chain total) when the
  // record carries it; older archived spines can predate the field (measured
  // absent on u-msf70nei itself, an Aug-4 run) — fall back to summing this
  // file's own `worker-round.costUsd`. Either way, an unpriced round anywhere
  // in THIS FILE makes the figure `null` (never a partial sum stamped exact,
  // F6's rule) — checked directly against this file's rounds regardless of
  // which source supplies the value, because `engagementSpentUsd` is built
  // from the SAME priced-only sum and can carry the identical floor.
  const totalRoundsInFile = workerRounds.length;
  const unpricedRoundsInFile = workerRounds.filter((r) => !(typeof r.costUsd === 'number' && Number.isFinite(r.costUsd))).length;
  const summedRounds = workerRounds.reduce((acc, r) => (typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? acc + r.costUsd : acc), 0);
  const hasEngagementField = jobEnd && typeof jobEnd.engagementSpentUsd === 'number' && Number.isFinite(jobEnd.engagementSpentUsd);
  const thisFileSpend = {
    value: unpricedRoundsInFile > 0 ? null : (hasEngagementField ? jobEnd.engagementSpentUsd : summedRounds),
    source: /** @type {'engagementSpentUsd'|'summed rounds'} */ (hasEngagementField ? 'engagementSpentUsd' : 'summed rounds'),
    totalRounds: totalRoundsInFile,
    unpricedRounds: unpricedRoundsInFile,
  };

  /** @param {any} e */
  const tripOf = (e) => (e ? {
    category: e.category ?? null,
    // `decision` is the fallback, not an addition: some escalation sites
    // (e.g. ralph.js's ladder-exhaustion `cap-halt`) carry no `detail` at
    // all, and the useful text lives in `decision` instead — the same
    // fallback chain `buildStopReason` already uses above, so a tripped
    // occurrence is never left with just a bare category word when the
    // record actually explains itself.
    detail: trimTo(e.detail, TRIP_DETAIL_MAX) ?? trimTo(e.decision, TRIP_DETAIL_MAX),
  } : null);

  const usedEndSeqs = new Set();
  const idOccurrence = new Map();

  const steps = stepStarts.map((ss) => {
    const id = ss.step;
    const startSeq = typeof ss.seq === 'number' ? ss.seq : -Infinity;
    const startTs = parseTs(ss.ts);
    const startTsForAudit = startTs ?? -Infinity;

    const end = stepEnds
      .filter((se) => se.step === id && typeof se.seq === 'number' && se.seq >= startSeq && !usedEndSeqs.has(se.seq))
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
    if (end) usedEndSeqs.add(end.seq);
    const endSeq = end && typeof end.seq === 'number' ? end.seq : Infinity;
    const endTs = end ? parseTs(end.ts) : null;
    const endTsForAudit = endTs ?? Infinity;

    const phaseTag = `step:${id}`;
    const roundsInWindow = workerRounds.filter((r) => r.phase === phaseTag
      && typeof r.seq === 'number' && r.seq > startSeq && r.seq < endSeq);

    let passed = 0;
    let failed = 0;
    let treeChanged = false;
    for (const ee of exitEvals) {
      if (ee.step !== id) continue;
      if (!(typeof ee.seq === 'number' && ee.seq > startSeq && ee.seq < endSeq)) continue;
      for (const r of Array.isArray(ee.results) ? ee.results : []) {
        if (!isRecord(r)) continue;
        if (r.type === 'check-passes') { if (r.pass) passed += 1; else failed += 1; }
        if (r.type === 'tree-changed' && r.pass) treeChanged = true;
      }
    }

    const windowed = audit.filter((a) => {
      const t = parseTs(a.ts);
      return t !== null && t >= startTsForAudit && t <= endTsForAudit;
    });

    idOccurrence.set(id, (idOccurrence.get(id) ?? 0) + 1);
    const { spentUsd: stepSpentUsd, unpricedRounds } = windowSpend(roundsInWindow);

    return {
      id,
      occurrence: idOccurrence.get(id),
      outcome: end ? (end.outcome ?? null) : null,
      rounds: roundsInWindow.length,
      toolCalls: runBehaviour(windowed).totalCalls,
      checks: { passed, failed },
      treeChanged,
      wallMs: windowWallMs(startTs, endTs),
      spentUsd: stepSpentUsd,
      unpricedRounds,
      tripped: tripOf(findTrip(escalations, startSeq, endSeq)),
      transportRetries: windowTransportRetries(transportRetries, startSeq, endSeq),
    };
  });

  // ── ITERATIONS timeline (loop-shape runs: no step-start at all). No
  // `phase` filter on the rounds: the seq window between one iteration-start
  // and the next close-verdict/run-end/escalation already isolates that
  // iteration's own rounds.
  const iterationStarts = spine.filter((e) => e.type === 'iteration-start');
  const timelineKind = /** @type {'steps'|'iterations'} */ (stepStarts.length > 0 ? 'steps' : (iterationStarts.length > 0 ? 'iterations' : 'steps'));
  const boundaries = spine.filter((e) => e.type === 'close-verdict' || e.type === 'run-end' || e.type === 'escalation');

  const iterations = timelineKind === 'iterations' ? iterationStarts.map((is) => {
    const startSeq = typeof is.seq === 'number' ? is.seq : -Infinity;
    const startTs = parseTs(is.ts);
    const startTsForAudit = startTs ?? -Infinity;

    const end = boundaries
      .filter((b) => typeof b.seq === 'number' && b.seq > startSeq)
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
    const endSeq = end && typeof end.seq === 'number' ? end.seq : Infinity;
    const endTs = end ? parseTs(end.ts) : null;
    const endTsForAudit = endTs ?? Infinity;

    const roundsInWindow = workerRounds.filter((r) => typeof r.seq === 'number' && r.seq > startSeq && r.seq < endSeq);
    const windowed = audit.filter((a) => {
      const t = parseTs(a.ts);
      return t !== null && t >= startTsForAudit && t <= endTsForAudit;
    });
    const { spentUsd: iterSpentUsd, unpricedRounds } = windowSpend(roundsInWindow);

    const verdict = end
      ? (end.type === 'close-verdict' ? (end.verdict ?? null)
        : end.type === 'run-end' ? (end.outcome ?? null)
          : end.type === 'escalation' ? (end.category ?? null) : null)
      : null;

    return {
      iteration: typeof is.iteration === 'number' ? is.iteration : null,
      verdict,
      boundary: end ? end.type : null,
      // this iteration's OWN close-verdict, when that is what ended it —
      // distinct from the top-level `close` (the run's FINAL close), because
      // an escalated/red iteration's own close-verdict is still worth
      // showing inline even when the run never reached a final close.
      closeStage: end && end.type === 'close-verdict'
        ? { verdict: end.verdict ?? null, stages: Array.isArray(end.stages) ? end.stages : null }
        : null,
      rounds: roundsInWindow.length,
      toolCalls: runBehaviour(windowed).totalCalls,
      wallMs: windowWallMs(startTs, endTs),
      spentUsd: iterSpentUsd,
      unpricedRounds,
      tripped: tripOf(findTrip(escalations, startSeq, endSeq)),
      transportRetries: windowTransportRetries(transportRetries, startSeq, endSeq),
    };
  }) : [];

  // Retries whose seq fell OUTSIDE every occurrence window built above (a
  // retry during scout/plan/fix-loop phases the steps/iterations timelines
  // don't cover, or a spine with no windows at all) — counted against
  // whichever timeline is actually populated, never both (see `timelineKind`'s
  // own doc: exactly one of steps/iterations is non-empty).
  const windowedRetryCount = (timelineKind === 'iterations' ? iterations : steps)
    .reduce((acc, u) => acc + (u.transportRetries ? u.transportRetries.count : 0), 0);
  const transportRetriesOutsideWindows = transportRetries.length - windowedRetryCount;

  // replans: `plan-executed.replans` (src/planrun.js:2688) when present;
  // an older archived spine can predate that field (measured — see file
  // header), so this falls back to counting `materials` records stamped
  // `phase:'replan'` (src/planrun.js:2520, one per replan draft) rather than
  // guessing 0. Both are real counts of a discrete recorded event, never
  // "unknown" — a run that never replanned really did replan 0 times.
  const planExecutedRecords = spine.filter((e) => e.type === 'plan-executed');
  const lastPlanExecuted = planExecutedRecords.length ? planExecutedRecords[planExecutedRecords.length - 1] : null;
  const replans = lastPlanExecuted && typeof lastPlanExecuted.replans === 'number'
    ? lastPlanExecuted.replans
    : spine.filter((e) => e.type === 'materials' && e.phase === 'replan').length;

  const close = resolveClose(spine);

  const memoryCacheRecords = spine.filter((e) => e.type === 'memory-cache');
  const memoryCache = memoryCacheRecords.length ? memoryCacheRecords[memoryCacheRecords.length - 1] : null;

  const last = spine.length ? spine[spine.length - 1] : null;
  const before = spine.length > 1 ? spine.slice(Math.max(0, spine.length - 4), spine.length - 1) : [];
  const shown = new Set([last, ...before]);
  const escalationOutsideWindow = lastEscalation && !shown.has(lastEscalation) ? lastEscalation : null;

  return {
    runId,
    job: jobStart?.job ?? null,
    // F117 (PRD TODO #20, landed): `verdictType` (src/run.js:303's job-start
    // emit) — `null` on any spine older than that landing (measured:
    // u-msdsmkid, an Aug-3 archived run, predates the field). `model` is
    // narrower still: only present when the shell-owned provider binding
    // itself carried a `.model` string at job-start time (src/run.js's own
    // comment there) — a native/clipipe call path can legitimately have
    // neither, and this reader reports that honestly rather than guessing.
    verdictType: typeof jobStart?.verdictType === 'string' ? jobStart.verdictType : null,
    model: typeof jobStart?.model === 'string' ? jobStart.model : null,
    // F118 (parked-half landed): `job-start.code` — absent on any spine older
    // than that landing (this run predates the field entirely, distinct from
    // `sha` being null because the run happened to run from an npm install
    // with no `.git`). `code: null` here means "not recorded (pre-F118
    // spine)"; `code: {version, sha}` with `sha: null` means "recorded, but
    // this process had no `.git` to read a sha from" — the two are never
    // conflated.
    code: jobStart && jobStart.code && typeof jobStart.code === 'object'
      ? {
          version: typeof jobStart.code.version === 'string' ? jobStart.code.version : null,
          sha: typeof jobStart.code.sha === 'string' ? jobStart.code.sha : null,
        }
      : null,
    goal: typeof jobStart?.goal === 'string' ? jobStart.goal : null,
    // the RAW last escalation record (or null) — the source `stopReason` was
    // built from, exposed directly rather than only reachable through
    // `ending` (which carries it conditionally, only when it falls OUTSIDE
    // the 3-before display window — a display concern, not "did an
    // escalation happen at all"). `summarizeForAllLine`'s `reason` column
    // needs the latter question answered unconditionally.
    lastEscalation,
    budgetUsd: jobStart && typeof jobStart.budgetUsd === 'number' && Number.isFinite(jobStart.budgetUsd) ? jobStart.budgetUsd : null,
    specHash: typeof jobStart?.specHash === 'string' ? jobStart.specHash : null,
    branch,
    outcome,
    stopReason,
    spentUsd,
    spendComplete,
    floorReasons: floorReasonList,
    transportRetryCount: transportRetries.length,
    transportRetriesOutsideWindows,
    wallMs,
    chainClock,
    resumed,
    resumeSeed,
    thisFileSpend,
    // spendMismatch: a NON-resumed run's own `job-end.spentUsd` IS this
    // file's whole spend (no fold to explain a gap) — so on a cold run,
    // `spentUsd` and `thisFileSpend.value` disagreeing by more than a cent's
    // rounding noise is a REAL finding, not an expected honest split, and is
    // never hidden. `null` when there is nothing to compare (a resumed run,
    // where a gap is expected and already explained; or `thisFileSpend`
    // itself unknown) or when the two already agree within $0.0001.
    spendMismatch: (!resumed && spentUsd !== null && thisFileSpend.value !== null && Math.abs(spentUsd - thisFileSpend.value) > 0.0001)
      ? { spentUsd, thisFileUsd: thisFileSpend.value, diffUsd: spentUsd - thisFileSpend.value }
      : null,
    timelineKind,
    steps,
    iterations,
    replans,
    close,
    ending: { record: last, before, escalation: escalationOutsideWindow },
    behaviour: runBehaviour(audit),
    memoryCache,
    skipped,
  };
}

/** @param {number|null} n 4-decimal money — spend/cost figures. */
function money(n) {
  return n === null ? 'unknown' : `$${n.toFixed(4)}`;
}

/** @param {number|null} n 2-decimal money — a signed BUDGET figure, never a spend one. */
function money2(n) {
  return n === null ? 'unknown' : `$${n.toFixed(2)}`;
}

/**
 * The `$`/`spend` column for one occurrence/iteration row: `unpricedRounds >
 * 0` reads `unknown (N unpriced rounds)` — never `$0`, never a partial sum
 * stamped as exact (F6's rule, in a row's coat). Zero rounds is a real
 * `$0.0000`.
 * @param {{spentUsd: number|null, unpricedRounds: number}} row
 */
function rowMoney(row) {
  return row.unpricedRounds > 0
    ? `unknown (${row.unpricedRounds} unpriced round${row.unpricedRounds === 1 ? '' : 's'})`
    : money(row.spentUsd);
}

/** @param {number|null} ms */
function duration(ms) {
  if (ms === null) return 'unknown';
  if (ms < 0) return 'unknown'; // a malformed/out-of-order ts pair — never render a negative time
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  let m = Math.floor(s / 60);
  let rem = Math.round(s - m * 60);
  if (rem === 60) { m += 1; rem = 0; } // a remainder that rounds up to a full minute carries, never prints "Xm60s"
  return `${m}m${String(rem).padStart(2, '0')}s`;
}

/** 1 → '1st', 2 → '2nd', 3 → '3rd', 4 → '4th', 11/12/13 → '11th'/'12th'/'13th', … */
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** GREEN/RED/UNKNOWN — visible outcome word for a step row, an iteration
 * row, or the run's own outcome. `satisfied`/`green`/`already-green` are the
 * only green-equivalent values across every source this reads (step-end
 * outcome, close-verdict verdict, run-end outcome); everything else non-null
 * is RED; `null` (nothing recorded yet) is UNKNOWN.
 * @param {string|null} v
 */
function resultWord(v) {
  if (v === null) return 'UNKNOWN';
  return (v === 'green' || v === 'already-green' || v === 'satisfied') ? 'GREEN' : 'RED';
}

/**
 * The `↳ tripped:`/`↳ close:` line under one row, or `null` when neither applies.
 * @param {{category: string|null, detail: string|null}|null} tripped
 */
function trippedLine(tripped) {
  if (!tripped) return null;
  const bits = [tripped.category, tripped.detail].filter((p) => typeof p === 'string' && p.length > 0);
  return bits.length ? `tripped: ${bits.join(' — ')}` : null;
}

/**
 * `<verdict>[ — <failing stage names>]` for an iteration's OWN close-verdict
 * (`iterations[].closeStage`) — distinct from the top-level CLOSE section,
 * which reports the run's FINAL close.
 * @param {{verdict: string|null, stages: any[]|null}|null} closeStage
 */
function closeStageLine(closeStage) {
  if (!closeStage || !closeStage.verdict) return null;
  const failing = Array.isArray(closeStage.stages) ? closeStage.stages.filter((s) => s.verdict !== 'satisfied').map((s) => s.name) : [];
  return `close: ${closeStage.verdict}${failing.length ? ` — ${failing.join(', ')}` : ''}`;
}

/**
 * The `↳ transport retry ×N (…)` line under one step/iteration row (F119),
 * or `null` when no retry fell inside that occurrence's window.
 * @param {{count: number, label: string, error: string|null}|null} tr
 */
function transportRetryLine(tr) {
  if (!tr) return null;
  return `transport retry ×${tr.count} (${tr.label}) — ${tr.error ?? 'no error text recorded'}`;
}

/**
 * Render one close's stages, red stage FIRST (marked `✗`), the rest `name
 * OK` in their original order. There is at most one non-satisfied stage in
 * any one `stages` array (`runStages` stops at the first red — src/ralph.js's
 * `runStages`), so "first" here is really "the only one, moved to the front".
 * @param {any[]|null} stages
 * @returns {string|null}
 */
function renderStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const redIdx = stages.findIndex((s) => s.verdict !== 'satisfied');
  const ordered = redIdx === -1 ? stages : [stages[redIdx], ...stages.filter((_, i) => i !== redIdx)];
  return ordered.map((s) => (s.verdict !== 'satisfied' ? `✗ ${s.name} FAIL(${s.verdict})` : `${s.name} OK`)).join(' · ');
}

/**
 * The CLOSE section body (one line, or the `none` fallback — never omitted).
 * @param {ReturnType<typeof resolveClose>} close
 */
function closeLine(close) {
  if (!close || !close.verdict) return 'none — the run ended before any close ran';
  const prefix = close.iteration !== null ? `iteration ${close.iteration} · ` : '';
  const stagesText = renderStages(close.stages);
  const stagesPart = stagesText ? ` · ${/** @type {any[]} */ (close.stages).length} stages: ${stagesText}` : '';
  return `${prefix}${close.verdict}${stagesPart}`;
}

/**
 * Left-pad a table: given rows (arrays of cell strings) and a header row,
 * compute per-column widths across header + rows and return every row
 * (header included) padEnd-joined with a 2-space gap. The LAST column is
 * never padded (a trailing pad on free text like `reason`/`goal` is
 * pointless whitespace).
 * @param {string[]} header
 * @param {string[][]} rows
 * @returns {string[]} formatted lines, header first
 */
function alignTable(header, rows) {
  const nCols = header.length;
  const widths = Array.from({ length: nCols }, (_, i) => Math.max(header[i].length, ...rows.map((r) => (r[i] ?? '').length)));
  const render = (/** @type {string[]} */ cells) => cells.map((c, i) => (i === nCols - 1 ? c : c.padEnd(widths[i]))).join('  ');
  return [render(header), ...rows.map(render)];
}

/**
 * Render a {@link replayRun} summary as one printable page: a header block
 * (goal/shape/signed/branch/outcome/spent), a timeline (steps or iterations,
 * whichever the spine has), the CLOSE section (never omitted), the ending
 * (last record + 3 before it, plus an out-of-window escalation), the
 * behaviour block, and the MEMORY-CACHE line (always printed — `not armed on
 * this run` when there is no record, never silently absent).
 * @param {ReturnType<typeof replayRun>} summary
 * @returns {string}
 */
export function formatReplay(summary) {
  const lines = [];
  lines.push(`RUN ${summary.runId ?? '(unknown id)'} · ${summary.job ?? NONE_RECORDED}`);

  lines.push(`goal:    ${hardTrim(summary.goal, GOAL_MAX) ?? NONE_RECORDED}`);

  const shapeLabel = summary.timelineKind === 'iterations' ? 'loop' : 'plan';
  const shapeCount = summary.timelineKind === 'iterations'
    ? `${summary.iterations.length} iteration${summary.iterations.length === 1 ? '' : 's'}`
    : `${summary.steps.length} step${summary.steps.length === 1 ? '' : 's'}, ${summary.replans} replan${summary.replans === 1 ? '' : 's'}`;
  lines.push(`shape:   ${shapeLabel} · ${shapeCount}`);

  // F117 (PRD TODO #20): a spine older than the field lands reads
  // "not recorded (pre-F117 spine)" — distinct wording from `model`'s bare
  // "not recorded", because a missing `verdictType` is always an archive-age
  // gap (the field is REQUIRED on every job — src/job.js:552), while a
  // missing `model` can happen on ANY spine, old or new, whenever the
  // provider binding itself carries none (a native/clipipe call path).
  lines.push(`class:   ${summary.verdictType ?? 'not recorded (pre-F117 spine)'}`);
  lines.push(`model:   ${summary.model ?? 'not recorded'}`);

  // F118: the run→code direction (the commit→run half landed same day as
  // the prompt-commit check). `code` absent entirely = pre-F118 spine; a
  // present `code` with `sha: null` is a real, honest reading (an
  // npm-installed copy with no `.git` at run time), never conflated with
  // "not recorded".
  if (summary.code) {
    const versionPart = summary.code.version ?? 'unknown version';
    const shaPart = shortSha(summary.code.sha) ?? 'sha unknown';
    lines.push(`code:    bareloop ${versionPart} @ ${shaPart}`);
  } else {
    lines.push('code:    not recorded (pre-F118 spine)');
  }

  const signedWall = summary.chainClock && typeof summary.chainClock.requestedMs === 'number' ? duration(summary.chainClock.requestedMs) : NONE_RECORDED;
  const specShort = summary.specHash ? summary.specHash.slice(0, 8) : NONE_RECORDED;
  lines.push(`signed:  ${money2(summary.budgetUsd)} budget · ${signedWall} wall · spec ${specShort}`);

  lines.push(`branch:  ${summary.branch ?? NONE_RECORDED}`);

  // resumed: read off `job-start.priorSpentUsd` (the general fold signal —
  // see `replayRun`'s own comment), never off `resume-seed` alone (a
  // narrower record: measured absent on real resumed archived runs).
  // `resumeSeed`'s detail (phase/completed/skipping/divergence) rides along
  // when it exists; a resumed leg with no resume-seed record still reads
  // `resumed: yes`, honestly, just without that extra clause.
  if (summary.resumed) {
    if (summary.resumeSeed) {
      const { phase, completed, skipping, divergence } = summary.resumeSeed;
      const counts = completed !== null && skipping !== null ? `${skipping} of ${completed} completed step(s) skipped` : 'no step count recorded';
      lines.push(`resumed: yes — phase ${phase ?? 'unknown'}, ${counts}${divergence ? `, divergence: ${divergence}` : ''}`);
    } else {
      lines.push('resumed: yes (no resume-seed detail recorded)');
    }
  } else {
    lines.push('resumed: no');
  }

  lines.push(`outcome: ${summary.outcome ?? 'unknown'}${summary.stopReason ? ` — ${summary.stopReason}` : ''}`);

  // `wall:` is explicitly labeled "this file" — job-start→job-end of the ONE
  // spine handed in, which on a RESUMED leg is only the latest engagement,
  // not the whole signed chain. `clock:` is the other true number: chain-
  // scoped by construction (src/clock.js's `priorElapsedMs` fold) — never
  // one printed as if it were the other. `spent:` carries the SAME split for
  // money: a resumed run's `job-end.spentUsd` is the CHAIN total (prior legs
  // folded in), which can never equal this file's own rounds, so both figures
  // print, each labeled with its source — never one silently standing in for
  // the other (measured: u-msf70nei's header used to read $5.3389 while its
  // own 55 rounds sum to $1.2127).
  const tf = summary.thisFileSpend;
  const thisFileText = tf.unpricedRounds > 0
    ? `this file unknown (${tf.unpricedRounds} of ${tf.totalRounds} rounds unpriced; ${tf.source})`
    : `this file ${money(tf.value)} (${tf.totalRounds} round${tf.totalRounds === 1 ? '' : 's'}, all priced; ${tf.source})`;
  let spentLine;
  if (summary.resumed) {
    spentLine = `spent:   ${money(summary.spentUsd)} chain total (job-end; prior legs folded) · ${thisFileText} · of ${money2(summary.budgetUsd)} signed`;
  } else {
    spentLine = `spent:   ${money(summary.spentUsd)}${summary.spentUsd !== null && !summary.spendComplete ? ' (floor, not exact)' : ''} of ${money2(summary.budgetUsd)} signed`;
    // a NON-resumed run has nothing to fold — `job-end.spentUsd` IS this
    // file's whole spend, so a real disagreement here is a FINDING, printed,
    // never hidden (measured: 0 of 47 non-resumed archived runs trip this).
    if (summary.spendMismatch) {
      spentLine += ` · ${thisFileText} — MISMATCH vs job-end (diff $${summary.spendMismatch.diffUsd.toFixed(4)}), never hidden`;
    }
  }
  // F119: WHY a `spendComplete:false` figure is a floor, derived from this
  // spine's own records (never guessed) — see {@link floorReasons}. A floor
  // with no derivable evidence (an older archive, or a resumed leg's floor
  // inherited from a file not in hand) prints the honest fallback, never a
  // blank or a fabricated single cause.
  if (!summary.spendComplete) {
    spentLine += summary.floorReasons.length
      ? ` · floor because: ${summary.floorReasons.join(', ')}`
      : ' · floor (reason not in spine)';
  }
  spentLine += ` · wall ${duration(summary.wallMs)} (this file)`;
  if (summary.chainClock) {
    const { elapsedMs, requestedMs, source } = summary.chainClock;
    const signed = typeof requestedMs === 'number' ? `${duration(requestedMs)} signed` : 'no wall signed';
    // `wall-halt` is a TERMINAL reading — elapsedMs was taken at the moment the
    // wall actually stopped THIS run, so "X of Y signed" is an honest end-of-run
    // figure. `wall-clock` fires once, at the TOP of the engagement, before this
    // run did anything — its elapsedMs is whatever chain time a resumed leg
    // already inherited, not this run's own duration. Printing it as "0.0s of
    // 30m00s signed" reads as "this run took 0 seconds" — the unknown/partial-
    // rendered-as-zero honesty class this reader exists to refuse — so the
    // wall-clock line names what the number IS instead of implying an
    // end-of-run total that was never taken.
    const clockLine = source === 'wall-halt'
      ? `clock: ${duration(elapsedMs)} of ${signed} (chain, from wall-halt)`
      : `clock: ${signed} · ${duration(elapsedMs)} inherited from prior legs at start (from wall-clock; no end-of-run reading in this file)`;
    spentLine += ` · ${clockLine}`;
  }
  lines.push(spentLine);

  lines.push('');
  if (summary.timelineKind === 'iterations') {
    lines.push('TIMELINE (iterations — loop-shape run)');
    // F119: retries whose seq fell outside every iteration window (scout/plan
    // phases the iterations timeline doesn't cover) — printed only when there
    // ARE any; a run with every retry accounted for inside a row has nothing
    // extra to say here.
    if (summary.transportRetriesOutsideWindows > 0) {
      lines.push(`  transport retries outside steps: ${summary.transportRetriesOutsideWindows}`);
    }
    if (summary.iterations.length === 0) {
      lines.push('  (no iterations reached)');
    } else {
      const header = ['#', 'iteration', 'result', 'rounds', 'tools', 'wall', 'spend'];
      const rows = summary.iterations.map((it, i) => [
        String(i + 1),
        `iteration ${it.iteration ?? '?'}`,
        resultWord(it.verdict),
        `${it.rounds} round${it.rounds === 1 ? '' : 's'}`,
        `${it.toolCalls} tool${it.toolCalls === 1 ? '' : 's'}`,
        duration(it.wallMs),
        rowMoney(it),
      ]);
      const rendered = alignTable(header, rows);
      const indent = ' '.repeat(String(summary.iterations.length).length + 2 + 2);
      for (let i = 0; i < rendered.length; i += 1) {
        lines.push(`  ${rendered[i]}`);
        if (i === 0) continue; // header row carries no tripped/close note
        const it = summary.iterations[i - 1];
        const note = it.boundary === 'close-verdict' ? closeStageLine(it.closeStage) : trippedLine(it.tripped);
        if (note) lines.push(`${indent}↳ ${note}`);
        const retryNote = transportRetryLine(it.transportRetries);
        if (retryNote) lines.push(`${indent}↳ ${retryNote}`);
      }
    }
  } else {
    lines.push('TIMELINE (steps)');
    if (summary.transportRetriesOutsideWindows > 0) {
      lines.push(`  transport retries outside steps: ${summary.transportRetriesOutsideWindows}`);
    }
    if (summary.steps.length === 0) {
      lines.push('  (no steps reached)');
    } else {
      const header = ['#', 'step', 'result', 'rounds', 'tools', 'checks', 'tree', 'wall', 'spend'];
      const rows = summary.steps.map((s, i) => [
        String(i + 1),
        `${s.id}${s.occurrence > 1 ? ` (${ordinal(s.occurrence)})` : ''}`,
        resultWord(s.outcome),
        `${s.rounds} round${s.rounds === 1 ? '' : 's'}`,
        `${s.toolCalls} tool${s.toolCalls === 1 ? '' : 's'}`,
        `${s.checks.passed}/${s.checks.failed}`,
        s.treeChanged ? 'changed' : 'unchanged',
        duration(s.wallMs),
        rowMoney(s),
      ]);
      const rendered = alignTable(header, rows);
      const indent = ' '.repeat(String(summary.steps.length).length + 2 + 2);
      for (let i = 0; i < rendered.length; i += 1) {
        lines.push(`  ${rendered[i]}`);
        if (i === 0) continue;
        const note = trippedLine(summary.steps[i - 1].tripped);
        if (note) lines.push(`${indent}↳ ${note}`);
        const retryNote = transportRetryLine(summary.steps[i - 1].transportRetries);
        if (retryNote) lines.push(`${indent}↳ ${retryNote}`);
      }
    }
  }

  lines.push('');
  lines.push('CLOSE');
  lines.push(`  ${closeLine(summary.close)}`);

  lines.push('');
  lines.push('ENDING');
  if (summary.ending.escalation) {
    lines.push(`  ! last escalation (seq ${summary.ending.escalation.seq ?? '?'}, outside the 3-before window): ${JSON.stringify(summary.ending.escalation)}`);
  }
  for (const r of summary.ending.before) lines.push(`  ${JSON.stringify(r)}`);
  if (summary.ending.record) lines.push(`> ${JSON.stringify(summary.ending.record)}`);
  else lines.push('  (empty spine)');

  lines.push('');
  lines.push('BEHAVIOUR');
  lines.push(formatBehaviour(summary.behaviour));
  // ALWAYS printed — an absent record must never read as silence (the same
  // rule as the CLOSE section's `none` fallback above).
  if (summary.memoryCache) {
    const mc = summary.memoryCache;
    const kb = (mc.bytesWithheld / 1024).toFixed(1);
    const kTokens = (mc.approxTokens / 1000).toFixed(1);
    lines.push(`MEMORY-CACHE  ${mc.pointered} re-reads answered from memory · ${mc.capped} reads capped · ${kb} KB withheld (~${kTokens}k tokens not re-sent)`);
  } else {
    lines.push('MEMORY-CACHE  not armed on this run');
  }
  if (summary.skipped > 0) lines.push(`\n(${summary.skipped} malformed line${summary.skipped === 1 ? '' : 's'} skipped)`);
  return lines.join('\n');
}

/**
 * One `--all` row's raw field strings for one real spine:
 * `id  job  shape  outcome  spend  wall  steps  reason`. `reason` is
 * `category — <first clause of detail, cut at 60 chars>` off the last
 * escalation — never the generic `decision` prose. `-` on a green row;
 * `no job-end (killed mid-run)` when the spine never reached a `job-end` at
 * all (outcome itself is `null`) — a distinct, named case, not folded into
 * the ordinary escalation reason.
 * @param {ReturnType<typeof replayRun>} summary
 * @returns {{id: string, resumed: boolean, job: string, shape: string, class: string, model: string, outcome: string, hadTransportRetries: boolean, spend: string, wall: string, steps: string, reason: string}}
 */
export function summarizeForAllLine(summary) {
  const isGreen = summary.outcome === 'green' || summary.outcome === 'already-green';
  const shape = summary.timelineKind === 'iterations' ? 'loop' : 'plan';
  const units = summary.timelineKind === 'iterations' ? summary.iterations : summary.steps;
  const stepsCol = summary.timelineKind === 'iterations' ? `${units.length} it` : `${units.length}`;

  let reason = '-';
  if (summary.outcome === null) {
    reason = 'no job-end (killed mid-run)';
  } else if (!isGreen && summary.lastEscalation) {
    // Re-derive `category`/`detail` from the escalation itself rather than
    // re-parsing the already-composed `stopReason` string, which may have
    // DROPPED the category when it duplicated the outcome (`buildStopReason`)
    // — this compact row has no adjacent "outcome:" line to lean on the way
    // the full report's header does, so the category is always shown here.
    // `detail` ONLY — never `decision` (the coordinator's own ruling for
    // this column specifically: `decision` is the generic per-category
    // sentence every run in that category shares, and this row has no room
    // to show both). A `cap-halt` whose escalation carries no `detail` at
    // all (ralph.js's ladder-exhaustion site) prints the bare category —
    // still real information, just without a clause. Contrast the full
    // report's `↳ tripped:` line ({@link tripOf}), which DOES fall back to
    // `decision` there, because that view has the room and hamr's own
    // signed illustration showed it doing so.
    const esc = summary.lastEscalation;
    const category = esc.category ?? null;
    const clause = hardTrim(esc.detail, ALL_REASON_MAX);
    reason = [category, clause].filter((p) => typeof p === 'string' && p.length > 0).join(' — ') || '-';
  }

  return {
    // `*` marks a resumed row directly on the id — `--all`'s spend column
    // stays the CHAIN total (that is what a reader scanning the whole
    // directory asks first), but a chain total on a resumed row is a
    // DIFFERENT claim than a cold run's spend, and the asterisk plus
    // {@link formatAllLines}'s footnote say so rather than let the two kinds
    // of number sit in one column looking identical.
    id: `${summary.runId ?? '(unknown)'}${summary.resumed ? '*' : ''}`,
    resumed: summary.resumed === true,
    job: summary.job ?? NONE_RECORDED,
    shape,
    // `-` (never `NONE_RECORDED`'s longer prose) — this is a compact table
    // column, same posture as `reason`'s own `-` for a green row.
    class: summary.verdictType ?? '-',
    // model strings (`claude-sonnet-5`) are kept FULL, never truncated — a
    // wrong/uncertain model reading is exactly the kind of thing a reader
    // scanning the whole directory needs to see in full, not guess at from
    // a cut string.
    model: summary.model ?? '-',
    // F119: no new column — the retry count rides on the outcome word itself,
    // `⟲N`, the same posture as the `*` resumed marker riding on `id`. Never
    // shown on a run with zero retries.
    outcome: `${summary.outcome ?? 'unknown'}${summary.transportRetryCount > 0 ? ` ⟲${summary.transportRetryCount}` : ''}`,
    hadTransportRetries: summary.transportRetryCount > 0,
    spend: money(summary.spentUsd),
    wall: duration(summary.wallMs),
    steps: stepsCol,
    reason,
  };
}

/**
 * Render every row {@link summarizeForAllLine} built for one directory's
 * spines as a fixed-column, aligned table WITH a header row (plus any
 * `<name>  not-a-spine` lines interleaved at their original position — those
 * are not part of the aligned columns, since a filename carries no outcome/
 * spend/wall of its own). Never CSV: columns are padded, not delimited.
 * @param {Array<{kind: 'spine', row: ReturnType<typeof summarizeForAllLine>}|{kind: 'not-a-spine', name: string}>} entries
 * @returns {string}
 */
export function formatAllLines(entries) {
  const header = ['id', 'job', 'shape', 'class', 'model', 'outcome', 'spend', 'wall', 'steps', 'reason'];
  const spineEntries = entries.filter((e) => e.kind === 'spine');
  const rows = spineEntries.map((e) => {
    const r = /** @type {any} */ (e).row;
    return [r.id, r.job, r.shape, r.class, r.model, r.outcome, r.spend, r.wall, r.steps, r.reason];
  });
  // No header at all when there is nothing tabular to head — a directory of
  // ONLY `not-a-spine` files gets its plain filename lines with no bare
  // column header floating above them.
  if (rows.length === 0) return entries.map((e) => `${/** @type {any} */ (e).name}  not-a-spine`).join('\n');

  const rendered = alignTable(header, rows);
  // Re-interleave: `alignTable` only saw the spine rows, so walk the ORIGINAL
  // entry order and pull each formatted spine line back into its real
  // position among the `not-a-spine` lines (rendered separately, not padded
  // into the same columns — a filename carries no outcome/spend/wall).
  const out = [rendered[0]]; // header
  let spineIdx = 1;
  for (const e of entries) {
    if (e.kind === 'not-a-spine') out.push(`${e.name}  not-a-spine`);
    else { out.push(rendered[spineIdx]); spineIdx += 1; }
  }
  if (spineEntries.some((e) => /** @type {any} */ (e).row.resumed)) {
    out.push('* resumed run — spend is the chain total, see detail');
  }
  // F119: same footnote posture as the resumed `*` above.
  if (spineEntries.some((e) => /** @type {any} */ (e).row.hadTransportRetries)) {
    out.push('⟲N transport retry(ies), recovered inline — see the full replay for detail');
  }
  return out.join('\n');
}
