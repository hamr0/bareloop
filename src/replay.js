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
//   job-start   {job, specHash, budgetUsd, shape, goal, ...}      src/run.js:227-256
//   job-end     {outcome, spentUsd, spendComplete, engagementSpentUsd}
//                                                                  src/run.js:288,378-413
//   escalation  {category, decisionReady, verdicts?, spend?, decision, options, detail?}
//                                                                  src/ralph.js:576,648;
//                                                                  src/planrun.js (many sites)
//   step-start  {step, rounds, tools}                             src/planrun.js:2699
//   step-end    {step, outcome}                                   src/planrun.js:2973
//   worker-round {phase, iteration, kind, costUsd, pricing, tokens, usage}
//                                                                  src/planrun.js:2288
//     `phase` is `step:<step.id>` for a plan step's own attempts, `scout` /
//     `plan` / `fix` for the other worker phases — src/planrun.js:2735,2515,3359.
//   exit-eval   {step, iteration, results: [{type, pass, detail?}]}
//                                                                  src/planrun.js:2897
//     each `results[i].type` is one of plan.js's EXIT_TYPES; `check-passes`
//     and `tree-changed` are the two this module reads (checks passed/failed,
//     whether the step's own tree actually moved).
//   memory-cache {pointered, capped, bytesWithheld, approxTokens} src/planrun.js:3619
//   (every record's own) ts, seq, type                            src/spine.js
// Gate-audit rows (the tool-call sidecar) are handed to `runBehaviour`
// unmodified — see src/behaviour.js for ITS field provenance (`run_id`,
// `phase`, `action.{type,path,args}`, `decision`); this module additionally
// reads each row's own `ts` (present on every gate-audit row emitted by
// src/tools.js's gate) to window tool calls into the step that was running
// when they happened — gate-audit rows carry no `step` field of their own.
//
// `runId` is NOT a spine field: nowhere does a job's own run id (the `u-<id>`
// in its filename) land inside a record. It only exists as the filename, so
// it is accepted as caller-supplied metadata via the third `opts` argument —
// the same shape `runBehaviour(events, {runId})` already uses for its own
// (different) runId — never invented as a fabricated record field.

import { runBehaviour, formatBehaviour } from './behaviour.js';

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

/** How much of an escalation's `detail` rides onto the header line before it is
 * truncated with an explicit marker — long enough for a real transport error or
 * a close's failure text, short enough that the header stays one screenful. */
const STOP_REASON_DETAIL_MAX = 400;

/**
 * Trim a `detail` string to {@link STOP_REASON_DETAIL_MAX} chars with an
 * explicit `…[+N chars]` marker — NEVER a silent truncation, and never a
 * trailing ellipsis alone (indistinguishable from a detail that just happened
 * to end there).
 * @param {unknown} detail
 * @returns {string|null}
 */
function trimDetail(detail) {
  if (typeof detail !== 'string' || detail.length === 0) return null;
  const trimmed = detail.trimEnd(); // trailing newlines (common in captured stderr) never open the marker on a blank line
  if (trimmed.length <= STOP_REASON_DETAIL_MAX) return trimmed;
  const cut = trimmed.slice(0, STOP_REASON_DETAIL_MAX);
  return `${cut}…[+${trimmed.length - STOP_REASON_DETAIL_MAX} chars]`;
}

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
  // 'provider-red') — formatReplay's header already prints the outcome
  // immediately before this string, so repeating it verbatim is noise, not
  // information. A run where they genuinely differ (outcome 'escalated' from
  // category 'cap-halt', e.g.) keeps the category — that IS new information.
  const category = lastEscalation.category !== outcome ? lastEscalation.category : null;
  const parts = [category, lastEscalation.decision, trimDetail(lastEscalation.detail)]
    .filter((p) => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' — ') : outcome;
}

/**
 * Reconstruct one run's whole story from its spine + gate-audit. Pure: no
 * IO, no spine writes, no verdict. Malformed/non-object entries in either
 * array are skipped and counted, never thrown on.
 *
 * A step id can recur (a replan re-executes the same step): `steps[].occurrence`
 * is 1 for that id's first step-start..step-end pair, 2 for its second, etc.
 * Every field on an occurrence — rounds, toolCalls, checks, treeChanged — is
 * scoped to records strictly between ITS OWN start/end `seq`, never pooled
 * across every occurrence sharing the id.
 *
 * @param {any[]} spineEvents parsed records from `u-<id>.jsonl`
 * @param {any[]} [auditEvents] parsed records from the sibling `-gate-audit.jsonl`
 * @param {{runId?: string|null}} [opts] `runId`: caller-supplied (the spine
 *   carries no run-id field of its own — see the file header)
 * @returns {{
 *   runId: string|null, job: string|null, outcome: string|null,
 *   stopReason: string|null, spentUsd: number|null, spendComplete: boolean,
 *   wallMs: number|null,
 *   chainClock: {source: 'wall-halt'|'wall-clock', elapsedMs: number,
 *     requestedMs: number|null, enforcedMs: number|null, bounded: boolean}|null,
 *   steps: Array<{id: string, occurrence: number, rounds: number, toolCalls: number,
 *     checks: {passed: number, failed: number}, treeChanged: boolean, outcome: string|null}>,
 *   ending: {record: any|null, before: any[], escalation: any|null},
 *   behaviour: ReturnType<typeof runBehaviour>,
 *   memoryCache: any|null,
 *   skipped: number,
 * }}
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
  // The doctrine this mirrors (F6/F44 etc): unknown is reported as unknown, never
  // laundered into something tidier. A green run has no stop to explain (null,
  // not the string "green"); a red run's stop is built from the last
  // escalation's own `category` + `decision` + `detail` — all three, because
  // `decision` alone is the GENERIC one-line prose every category shares
  // (e.g. "The provider path failed mid-run…" fires for every transport
  // casualty) while `detail` carries the run's OWN failure, verbatim (a TLS
  // "bad record mac", a specific mypy error, a specific stack trace). Dropping
  // `detail` is how the actual reason a run died stayed invisible in the
  // report meant to show it. Falls back to the bare outcome string when the
  // run stopped before any escalation could fire at all (job-red / plan-red /
  // smoke-red never escalate — src/run.js).
  // `detail` field sites (grepped): src/run.js:342 (smoke-red), src/ralph.js:656
  // (the DECISIONS passthrough — `detail: String(e.message || e)`),
  // src/planrun.js:2427 (the `relay()` transport/cap/wall relay this
  // u-mszcthk1 run's own provider-red escalation came from — `detail` built at
  // planrun.js:2396, `String(e?.message ?? e)`), plus every declared-close-red
  // site (src/planrun.js:1111,1129,1656,1693,1742,3315) and the wall-halt sites
  // (src/planrun.js:2990,3208-3209).
  const stopReason = isGreen ? null : buildStopReason(lastEscalation, outcome);

  const spentUsd = jobEnd && typeof jobEnd.spentUsd === 'number' && Number.isFinite(jobEnd.spentUsd) ? jobEnd.spentUsd : null;
  // An absent spend figure is itself an unknown (F6's class): `spendComplete`
  // can never read true over a null `spentUsd`, whatever the record's own flag
  // says, or a reader would trust an "exact" claim about a number it doesn't have.
  const spendComplete = jobEnd ? jobEnd.spendComplete === true && spentUsd !== null : false;

  // wallMs: derived from the two timestamps every run that reaches a terminal
  // carries (job-start.ts, job-end.ts) — not a spine field itself, but built
  // only from ts values this module already reads. Null (never 0) when either
  // end is missing, e.g. a spine captured mid-run with no job-end yet.
  let wallMs = null;
  {
    const t0 = parseTs(jobStart?.ts);
    const t1 = parseTs(jobEnd?.ts);
    if (t0 !== null && t1 !== null) wallMs = t1 - t0;
  }

  // chainClock: the SIGNED wall, read off the run's own clock record —
  // src/planrun.js:1203 (`wall-clock`, spread from `clock.report()` at
  // src/clock.js:235-247: `bounded, requestedMs, closeStages, enforcedMs,
  // elapsedMs, remainingMs`) or the wall-halt emit site (src/planrun.js:1269,
  // `emitWallHalt` — same `clock.report()` spread plus `meaning`/`cutMidCall`/
  // caller `extra`). `elapsedMs` on EITHER is chain-scoped by construction:
  // `createClock`'s `priorElapsedMs` fold (src/clock.js:174) seeds the clock
  // with whatever wall a RESUMED leg already inherited, so this number — unlike
  // `wallMs` above, which is only this one file's own job-start..job-end span —
  // can legitimately outrun this file's own duration on a resumed run (F103).
  // wall-halt is preferred when present: it is the TERMINAL reading, taken at
  // the exact moment the wall actually stopped the run. wall-clock (emitted
  // once, near the top of every run) is the fallback — it reads the chain's
  // folded elapsed at THIS ENGAGEMENT'S START, not this run's own end, which is
  // why the source is always named on the printed line: never let one number
  // silently stand in for the other, the exact bug this fixes.
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

  const stepStarts = spine.filter((e) => e.type === 'step-start');
  const stepEnds = spine.filter((e) => e.type === 'step-end');
  const workerRounds = spine.filter((e) => e.type === 'worker-round');
  const exitEvals = spine.filter((e) => e.type === 'exit-eval');

  // A step id can recur (a replan re-executes the same step, F17's own
  // example — `fix-loop-strict` in u-msdsmkid runs once, escalates, then runs
  // again to green): each step-start..step-end pair is its own OCCURRENCE, and
  // every record between them belongs to THAT occurrence alone, never pooled
  // across every occurrence sharing the id. Attribution is by `seq` — the
  // spine's own monotonic order, never `ts` — because every record in one
  // spine (step-start, worker-round, exit-eval, step-end) shares the SAME seq
  // counter (src/spine.js's `makeSpine`), so `seq` is an exact, gap-free
  // ordering where two ts-stamped-in-the-same-millisecond records are not.
  // `usedEndSeqs` stops a step-end from being claimed by more than one
  // occurrence (stepStarts is walked in spine/seq order, so the earliest
  // unclaimed matching step-end is always this occurrence's own).
  const usedEndSeqs = new Set();
  const idOccurrence = new Map();

  const steps = stepStarts.map((ss) => {
    const id = ss.step;
    const startSeq = typeof ss.seq === 'number' ? ss.seq : -Infinity;
    const startTs = parseTs(ss.ts) ?? -Infinity;

    const end = stepEnds
      .filter((se) => se.step === id && typeof se.seq === 'number' && se.seq >= startSeq && !usedEndSeqs.has(se.seq))
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
    if (end) usedEndSeqs.add(end.seq);
    const endSeq = end && typeof end.seq === 'number' ? end.seq : Infinity;
    const endTs = parseTs(end?.ts) ?? Infinity;

    const phaseTag = `step:${id}`;
    const rounds = workerRounds.filter((r) => r.phase === phaseTag
      && typeof r.seq === 'number' && r.seq > startSeq && r.seq < endSeq).length;

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

    // toolCalls: the gate-audit carries no `step` OR `seq` shared with the
    // spine (its own `seq` is a SEPARATE per-audit-file counter — src/behaviour.js's
    // header), so a step's tool calls are the one thing still windowed by TIME —
    // every audit row stamped between this occurrence's start and its paired end.
    const windowed = audit.filter((a) => {
      const t = parseTs(a.ts);
      return t !== null && t >= startTs && t <= endTs;
    });

    idOccurrence.set(id, (idOccurrence.get(id) ?? 0) + 1);

    return {
      id,
      occurrence: idOccurrence.get(id),
      rounds,
      toolCalls: runBehaviour(windowed).totalCalls,
      checks: { passed, failed },
      treeChanged,
      outcome: end ? (end.outcome ?? null) : null,
    };
  });

  const memoryCacheRecords = spine.filter((e) => e.type === 'memory-cache');
  const memoryCache = memoryCacheRecords.length ? memoryCacheRecords[memoryCacheRecords.length - 1] : null;

  const last = spine.length ? spine[spine.length - 1] : null;
  const before = spine.length > 1 ? spine.slice(Math.max(0, spine.length - 4), spine.length - 1) : [];
  // The LAST escalation is the record most likely to carry the run's real
  // reason for stopping (see stopReason above) — but a run can keep emitting
  // records after its final escalation (u-mszcthk1's own escalation sits at
  // seq 77, 4 records before its job-end at seq 81), which pushes it outside
  // the fixed 3-before window and silently drops it from the report. Carried
  // as its own field — never spliced into `before`, which stays exactly "the
  // 3 records immediately preceding the last one" — only when it is not
  // already one of the records already shown (reference-equal: both come from
  // the same `spine` array, so `===` is exact, no id/seq comparison needed).
  const shown = new Set([last, ...before]);
  const escalationOutsideWindow = lastEscalation && !shown.has(lastEscalation) ? lastEscalation : null;

  return {
    runId,
    job: jobStart?.job ?? null,
    outcome,
    stopReason,
    spentUsd,
    spendComplete,
    wallMs,
    chainClock,
    steps,
    ending: { record: last, before, escalation: escalationOutsideWindow },
    behaviour: runBehaviour(audit),
    memoryCache,
    skipped,
  };
}

/** @param {number|null} n */
function money(n) {
  return n === null ? 'unknown' : `$${n.toFixed(4)}`;
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

/**
 * Render a {@link replayRun} summary as one printable page: header, a
 * timeline (one line per step), the ending (last record + 3 before it,
 * compact JSON), the behaviour block, and the MEMORY-CACHE line when armed.
 * @param {ReturnType<typeof replayRun>} summary
 * @returns {string}
 */
export function formatReplay(summary) {
  const lines = [];
  lines.push(`RUN ${summary.runId ?? '(unknown id)'} — ${summary.job ?? '(unknown job)'}`);
  lines.push(`outcome: ${summary.outcome ?? 'unknown'}${summary.stopReason ? ` — ${summary.stopReason}` : ''}`);
  // `wall:` is explicitly labeled "this file" — job-start→job-end of the ONE
  // spine handed in, which on a RESUMED leg is only the latest engagement, not
  // the chain the operator actually signed a wall for. `clock:` (below) is the
  // other true number: the SIGNED wall read off the run's own wall-halt/wall-clock
  // record, which is chain-scoped by construction (src/clock.js's `priorElapsedMs`
  // fold). Two real numbers, two labels — never one printed as if it were the other.
  lines.push(`spend: ${money(summary.spentUsd)}${summary.spentUsd !== null && !summary.spendComplete ? ' (floor, not exact)' : ''} · wall: ${duration(summary.wallMs)} (this file, job-start→job-end)`);
  if (summary.chainClock) {
    const { elapsedMs, requestedMs, source } = summary.chainClock;
    const signed = typeof requestedMs === 'number' ? `${duration(requestedMs)} signed` : 'no wall signed';
    // `wall-halt` is a TERMINAL reading — elapsedMs was taken at the moment the
    // wall actually stopped THIS run, so "X of Y signed" is an honest end-of-run
    // figure. `wall-clock` fires once, at the TOP of the engagement, before this
    // run did anything — its elapsedMs is whatever chain time a resumed leg
    // already inherited (F103's fold), not this run's own duration. Printing it
    // as "0.0s of 30m00s signed" reads as "this run took 0 seconds", which is
    // exactly the "unknown/partial rendered as zero" honesty class this whole
    // reader exists to refuse — so the wall-clock line names what the number
    // IS (inherited-at-start) and says outright that no end-of-run chain
    // reading exists in this file, rather than implying one.
    const clockLine = source === 'wall-halt'
      ? `clock: ${duration(elapsedMs)} of ${signed} (chain, from wall-halt)`
      : `clock: ${signed} · ${duration(elapsedMs)} inherited from prior legs at start (from wall-clock; no end-of-run reading in this file)`;
    lines.push(clockLine);
  }
  lines.push('');
  lines.push('TIMELINE');
  if (summary.steps.length === 0) {
    lines.push('  (no steps reached)');
  } else {
    for (const s of summary.steps) {
      const marker = s.occurrence > 1 ? ` (${ordinal(s.occurrence)})` : '';
      lines.push(`  ${s.id}${marker}: ${s.outcome ?? 'unknown'} · ${s.rounds} round${s.rounds === 1 ? '' : 's'} · ${s.toolCalls} tool call${s.toolCalls === 1 ? '' : 's'} · checks ${s.checks.passed} passed / ${s.checks.failed} failed · tree ${s.treeChanged ? 'changed' : 'unchanged'}`);
    }
  }
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
  if (summary.memoryCache) {
    const mc = summary.memoryCache;
    const kb = (mc.bytesWithheld / 1024).toFixed(1);
    const kTokens = (mc.approxTokens / 1000).toFixed(1);
    lines.push(`MEMORY-CACHE  ${mc.pointered} re-reads answered from memory · ${mc.capped} reads capped · ${kb} KB withheld (~${kTokens}k tokens not re-sent)`);
  }
  if (summary.skipped > 0) lines.push(`\n(${summary.skipped} malformed line${summary.skipped === 1 ? '' : 's'} skipped)`);
  return lines.join('\n');
}
