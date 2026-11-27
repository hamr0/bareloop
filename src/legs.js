// P5-R (hamr 2026-10-02: "one run, one id, one file ... never two") — a RESUMED run is the SAME run.
// Its spine is one append-only file; each resume appends a `leg-resume` marker and then the new
// leg's own records. This module is the ONE owner of "where does a leg start and end": every reader
// that needs a leg (the resume reader, replay, the monthly limit, the panel, the readout) asks
// `legsOf` and never re-derives a boundary on its own — two spellings of one boundary is how a
// money figure counts leg 1 twice.
//
// Pure: no imports, no file IO. The text-level torn-line rule lives in `parseSpineText` below, beside
// the boundary rule it depends on (a torn line is tolerated exactly where the writer leaves one).
//
// A spine with NO marker (every run written before P5-R, and every run nobody resumed) is ONE leg:
// `legsOf` over it returns that file's records, unchanged.

/** The marker record's `type`. */
export const LEG_RESUME = 'leg-resume';

/**
 * @typedef {object} Leg
 * @property {number} leg 1-based position in file order (the marker's own `leg` field is never trusted over the order)
 * @property {any|null} start the leg's first record (the `leg-resume` marker for leg 2+; the file's first record for leg 1)
 * @property {any|null} end the leg's last record
 * @property {any[]} records every record of the leg, in file order, marker included
 * @property {any|null} jobStart the leg's own `job-start` (null: it ended before runJob wrote one)
 * @property {any|null} jobEnd the leg's own LAST `job-end` (null: it died, or it is still running)
 * @property {string|null} outcome the leg's terminal: its `job-end` outcome, else a `run-end` outcome ONLY for a leg that ended before runJob
 *   wrote a `job-start` (a $0 refusal: nothing ran, so its `run-end` is its end), else null. A leg that HAS a `job-start` and no `job-end` is
 *   live or died: `run-end` is written after every ralph pass inside a live leg, so reading it would call a running leg 'green'.
 * @property {string|null} after leg 1: null. Leg 2+: how the PREVIOUS leg ended, as the marker declares it
 *   (else derived from that leg's own terminal), `'died'` when it recorded none
 * @property {number|null} startMs `Date.parse` of the start record's `ts`
 * @property {number|null} endMs `Date.parse` of the end record's `ts`
 */

/** @param {any} r @returns {number|null} */
function tsOf(r) {
  const t = typeof r?.ts === 'string' ? Date.parse(r.ts) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Split one spine's parsed records into its legs. Pure.
 * @param {any[]} events one spine's parsed records, in file order
 * @returns {Leg[]} always at least one leg for a non-empty list; `[]` for an empty one
 */
export function legsOf(events) {
  const list = Array.isArray(events) ? events.filter((e) => e && typeof e === 'object') : [];
  if (list.length === 0) return [];
  /** @type {any[][]} */
  const groups = [[]];
  for (const e of list) {
    // a marker opens a new leg — but never an EMPTY leg 1: a file whose first record IS a marker
    // (a spine somebody truncated) still reads as leg 1 = the marker, not an invented empty leg
    if (e.type === LEG_RESUME && groups[groups.length - 1].length > 0) groups.push([]);
    groups[groups.length - 1].push(e);
  }
  /** @type {Leg[]} */
  const legs = [];
  groups.forEach((records, i) => {
    const jobStart = records.find((r) => r.type === 'job-start') ?? null;
    const jobEnd = records.findLast((r) => r.type === 'job-end') ?? null;
    const runEnd = records.findLast((r) => r.type === 'run-end') ?? null;
    const outcome = typeof jobEnd?.outcome === 'string' ? jobEnd.outcome
      : (jobStart === null && typeof runEnd?.outcome === 'string' ? runEnd.outcome : null);
    const marker = records[0].type === LEG_RESUME ? records[0] : null;
    const prev = i > 0 ? legs[i - 1] : null;
    /** @type {string|null} */
    let after = null;
    if (i > 0) after = typeof marker?.after === 'string' && marker.after !== '' ? marker.after : (prev?.outcome ?? 'died');
    legs.push({
      leg: i + 1,
      start: records[0],
      end: records[records.length - 1],
      records,
      jobStart,
      jobEnd,
      outcome,
      after,
      startMs: tsOf(records[0]),
      endMs: tsOf(records[records.length - 1]),
    });
  });
  return legs;
}

/**
 * @typedef {object} CurrentLegView
 * @property {number} legIndex 1-based number of the run's latest leg (0: an empty spine)
 * @property {number} legCount how many legs the spine holds
 * @property {any[]} records the latest leg's OWN records (marker included)
 * @property {boolean} live the latest leg has no `job-end` (callers still combine this with `runIsAlive` / `deriveDeath`: a died leg reads live here too)
 * @property {any|null} jobEnd the latest leg's own last `job-end`
 * @property {string|null} endedTs that `job-end`'s stamp (null: live, died, or an unstamped record)
 * @property {string|null} outcome that `job-end`'s outcome and nothing else - never a `run-end`, never an earlier leg's
 * @property {any|null} lastEscalation the latest leg's own last `escalation`
 * @property {boolean} moneyHalt the latest leg recorded a `money-halt`
 * @property {string|null} reused the latest leg's `check-reused` line, while it still speaks (see {@link currentLegView})
 * @property {{endedTs: string|null, outcome: string|null}|null} previous how the leg before ended (null: this is leg 1)
 */

/**
 * THE ONE owner of "what is true of the run's CURRENT leg" (hamr 2026-11-24, run mwuxqx4f): the run's last `job-end`, last escalation, money
 * halt and reused-check line are facts about ONE leg. A reader that scanned the whole spine for them showed the PREVIOUS leg's end time, Stop
 * reason and "Checks not run again" on a leg that was still running. Every panel / replay reader of those facts asks here; none scans the
 * spine for them on its own (tests/legs-current-guard.test.js fails if one does). Pure, built on {@link legsOf}.
 *
 * `reused` speaks for the START PASS it was written in (src/planrun.js `tellReuse`, only ever emitted there: the precheck and the preflight
 * loop). That pass ends at the leg's `plan-accepted`; the first `check-start` AFTER that plan is a later pass (a real test run), and it
 * retires the line. The start pass's own `check-start` records (one per check stage, written after the `check-reused` too) never do. Nothing
 * else retires it.
 * @param {any[]} records one spine's parsed records, in file order
 * @returns {CurrentLegView|null} null for an empty spine
 */
export function currentLegView(records) {
  const legs = legsOf(records);
  const cur = legs.at(-1);
  if (!cur) return null;
  const prev = legs.length > 1 ? legs[legs.length - 2] : null;
  const recs = cur.records;
  /** @type {string|null} */
  let reused = null;
  let planSeen = false;
  for (const r of recs) {
    if (r.type === 'check-reused' && typeof r.text === 'string') { reused = r.text; planSeen = false; } else if (reused !== null && r.type === 'plan-accepted') planSeen = true;
    else if (reused !== null && planSeen && r.type === 'check-start') reused = null;
  }
  return {
    legIndex: cur.leg,
    legCount: legs.length,
    records: recs,
    live: cur.jobEnd === null,
    jobEnd: cur.jobEnd,
    endedTs: typeof cur.jobEnd?.ts === 'string' ? cur.jobEnd.ts : null,
    outcome: typeof cur.jobEnd?.outcome === 'string' ? cur.jobEnd.outcome : null,
    lastEscalation: recs.findLast((r) => r.type === 'escalation') ?? null,
    moneyHalt: recs.some((r) => r.type === 'money-halt'),
    reused,
    previous: prev ? { endedTs: typeof prev.jobEnd?.ts === 'string' ? prev.jobEnd.ts : null, outcome: prev.outcome } : null,
  };
}

/**
 * THE ONE owner of "which close record is FINAL for the run's CURRENT leg" (hamr 2026-11-25, "go B", run mwvwcxvy). A leg that ended
 * `already-green` ran no close of its own: its final close is its last `close-precheck`. Any other leg's is its last staged `close-verdict`
 * or `outer-close`; a leg with none yet (still live) reads null. NEVER a record from an earlier leg - a whole-spine scan showed leg 1's red
 * close under a leg 2 that went already-green. A precheck lacks the staged close's `iteration` (record) and `unclaimed` (stage): readers
 * tolerate those being undefined. Screen readers (Result / Audit / replay) ask here and scan nothing for it
 * (tests/legs-final-close.test.js fails if one does).
 * @param {any[]} records one spine's parsed records, in file order
 * @returns {any|null}
 */
export function finalCloseOf(records) {
  const leg = currentLegView(records);
  if (!leg) return null;
  if (leg.outcome === 'already-green') return leg.records.findLast((r) => r.type === 'close-precheck') ?? null;
  return leg.records.findLast((r) => (r.type === 'close-verdict' && Array.isArray(r.stages)) || r.type === 'outer-close') ?? null;
}

/**
 * The legs' WORKING time, gap excluded (hamr 2026-10-02, 2A: only working time charges the wall). Each leg
 * counts first record → last record; the quiet time between one leg's end and the next leg's marker is
 * nobody's. `null` = unknown (no leg carries two parseable stamps) — never 0. A leg whose stamps are
 * unreadable adds nothing, so the figure is a FLOOR, `complete: false`.
 * @param {Leg[]} legs
 * @returns {{ ms: number|null, complete: boolean }}
 */
export function legsWallMs(legs) {
  let ms = 0;
  let known = 0;
  let complete = legs.length > 0;
  for (const l of legs) {
    if (l.startMs !== null && l.endMs !== null && l.endMs >= l.startMs) { ms += l.endMs - l.startMs; known += 1; } else complete = false;
  }
  return { ms: known === 0 ? null : ms, complete: complete && known > 0 };
}

/**
 * Parse a spine's TEXT, tolerant exactly where the writer leaves damage. A kill mid-append leaves a torn
 * line; a resume never edits it (the spine is append-only forever) — it writes one `\n` and starts a fresh
 * line, so the torn bytes end up alone on their own line, immediately BEFORE a `leg-resume` marker. That
 * line, and the file's own last two lines (the older tail rule: a kill mid-append of the file's final
 * record), are tolerated and named. An unparseable line anywhere else is `corrupt`: a reconstruction from
 * it would invent a history.
 * @param {string} raw
 * @returns {{ records: any[], tolerated: {line: number, why: 'tail'|'before-leg-resume'}[], corrupt: {line: number, message: string}|null }}
 *   `line` is 1-based. Only the FIRST corrupt line is reported.
 */
export function parseSpineText(raw) {
  const lines = String(raw).split('\n');
  /** @type {any[]} */
  const records = [];
  /** @type {{line: number, why: 'tail'|'before-leg-resume'}[]} */
  const tolerated = [];
  /** @type {{line: number, message: string}|null} */
  let corrupt = null;
  const BAD = Symbol('torn');
  /** @type {any[]} undefined = blank line, BAD = unparseable */
  const parsed = lines.map((l) => {
    if (!l.trim()) return undefined;
    try { return JSON.parse(l); } catch { return BAD; }
  });
  /** the next non-blank line's parse result after index i, skipping blanks */
  const nextOf = (/** @type {number} */ i) => {
    for (let j = i + 1; j < lines.length; j += 1) if (parsed[j] !== undefined) return parsed[j];
    return undefined;
  };
  lines.forEach((line, i) => {
    const p = parsed[i];
    if (p === undefined) return;
    if (p !== BAD) { records.push(p); return; }
    if (i >= lines.length - 2) { tolerated.push({ line: i + 1, why: 'tail' }); return; }
    // EXACTLY one torn line directly before a marker: the shape a resume leaves. Two in a row is not that
    // shape — the first of them has a corrupt line (not a marker) after it, and is reported.
    const next = nextOf(i);
    if (next && next.type === LEG_RESUME) { tolerated.push({ line: i + 1, why: 'before-leg-resume' }); return; }
    if (corrupt === null) {
      let message = 'unparseable';
      try { JSON.parse(line); } catch (/** @type {any} */ e) { message = e.message; }
      corrupt = { line: i + 1, message };
    }
  });
  return { records, tolerated, corrupt };
}

/**
 * Where leg `leg`'s watchdog kill note lives. Leg 1 keeps the name every run has always had
 * (`<spine>.watchdog.json`); a resumed leg's note sits beside it (`<spine>.leg<N>.watchdog.json`) so one
 * leg never overwrites another's evidence of how it died.
 * @param {string} spineFile
 * @param {number} leg 1-based
 * @returns {string}
 */
export function watchdogNotePath(spineFile, leg) {
  return leg <= 1 ? `${spineFile}.watchdog.json` : `${spineFile}.leg${leg}.watchdog.json`;
}

/**
 * P5 item 5 (Stop) — where a run's STOP REQUEST lives: a file beside its spine. The panel's stop route writes it;
 * the engine reads it at the round seam of a step worker (src/planrun.js `metered`) and consumes it. One spelling, here, so the route
 * and the engine can never name two files. A request belongs to ONE leg: the engine deletes it when it honours it,
 * when the leg ends, and again at the start of the next leg (src/userrun.js).
 * @param {string} spineFile
 * @returns {string}
 */
export function stopFilePath(spineFile) {
  return `${spineFile}.stop`;
}

/**
 * Did a run (or one leg) END on a cap? The ONE spelling of the rule every surface follows (hamr 2026-10-08): the
 * outcome is `cap-halt` / `wall-halt`, or it is `escalated` and the last escalation's category names the cap —
 * `wall-halt`, or `cap-halt` backed by a `money-halt` record (a strike-ladder `cap-halt` is not the money cap).
 * @param {{outcome: string|null|undefined, category?: string|null, moneyHalt?: boolean}} o
 * @returns {'money'|'time'|null}
 */
export function capKindOf(o) {
  if (o.outcome === 'cap-halt') return 'money';
  if (o.outcome === 'wall-halt') return 'time';
  if (o.outcome !== 'escalated') return null;
  if (o.category === 'wall-halt') return 'time';
  return o.category === 'cap-halt' && o.moneyHalt ? 'money' : null;
}

/**
 * The code-owned words for a window a halt ended without its own verdict (replay's `stopReason`, the Audit rows, the status table). ONE
 * table: `endOf` writes them, {@link endKindOfWords} reads them back. hamr 2026-11-26 (ruling 4): the provider failure has one wording.
 */
export const END_WORDS = Object.freeze({
  'capped-money': 'money cap',
  'capped-time': 'time cap',
  stopped: 'you stopped it',
  provider: 'the model provider failed',
  'check-timeout': 'tests did not finish',
  stalled: 'step stalled',
  died: 'died',
});

/** @typedef {'passed'|'failed'|'stopped'|'capped-money'|'capped-time'|'provider'|'stalled'|'check-timeout'|'died'|'open'} EndKind */

/** @type {Map<string, EndKind>} */
const KIND_OF_WORDS = new Map(/** @type {[string, EndKind][]} */ (Object.entries(END_WORDS).map(([kind, words]) => [words, /** @type {EndKind} */ (kind)])));

/**
 * The end kind of an outcome / escalation category the ENGINE already wrote (a lookup, never a mapping of a check verdict: a timed-out verdict becomes
 * `check-timeout` only in `closeFaultEnding`, src/ralph.js, F393; this module never reads a verdict).
 * @type {Record<string, EndKind>}
 */
const KIND_OF_WRITTEN = { 'provider-red': 'provider', 'check-timeout': 'check-timeout', 'step-stalled': 'stalled', stopped: 'stopped' };

/**
 * The end kind a stop-reason sentence stands for: one of {@link END_WORDS}' kinds, `'failed'` for any other sentence (a raw outcome the
 * leg ended on), null for none.
 * @param {string|null|undefined} words
 * @returns {EndKind|null}
 */
export function endKindOfWords(words) {
  if (typeof words !== 'string' || words === '') return null;
  return KIND_OF_WORDS.get(words) ?? 'failed';
}

/** a leg's own cap and last escalation: the facts a window's end is read against @param {Leg} leg */
function legFactsOf(/** @type {LegEnd} */ leg) {
  const esc = leg.records.findLast((r) => r && r.type === 'escalation') ?? null;
  const cap = capKindOf({ outcome: leg.outcome, category: leg.outcome === 'escalated' ? (esc?.category ?? null) : null, moneyHalt: leg.records.some((r) => r && r.type === 'money-halt') });
  return { cap, esc };
}

/** @typedef {Pick<Leg, 'outcome'|'records'>} LegEnd */

/**
 * @typedef {object} EndOfInput
 * @property {{green: boolean, outcome: string|null}|null} [own] the window's own end record (a step-end): whether it is a green, and its outcome. Absent: the window has no end of its own
 * @property {{seq?: number, category?: string|null, spend?: any}|null} [trip] the window's own last escalation (a `stop`'s category for a fix try)
 * @property {LegEnd|null} [leg] the leg the window ran in (a real {@link Leg}, or just its outcome and records)
 * @property {'leg'|'last-leg'|'single-leg'|null} [cutBy] a window with no end of its own: `'leg'` a later leg started so the leg's halt cut it,
 *   `'last-leg'` it ran in the run's last leg of a resumed run (cut only when that leg ended non-green), `'single-leg'` a one-leg run (only a cap ends it)
 * @property {'money'|'time'|null} [legCap] the cap the window's leg ended on when the caller has no leg slice (the run's own cap)
 * @property {boolean} [legGreen] with `cutBy: 'last-leg'`: the leg ended on a reusable green (the caller's `isReusableGreen`), which cuts nothing
 * @property {boolean} [died] the run died (an external fact: pid / mtime, never in the spine)
 * @property {boolean} [live] the window is still running
 */

/**
 * THE ONE owner of "how did this window end" (hamr 2026-11-26, rulings 1-4; Addendum 2026-11-26m). A window is a step, a piece of a part, a fix
 * try. The window's own escalation decides first (the person's Stop; a cap `wall-halt` / `cap-halt` that is its leg's LAST escalation in a leg that
 * ended on that cap; any other `cap-halt` is the strike ladder, `ladder: true` (the leg's `money-halt` decides, not `spend.strikes`: hamr's ruling, and the run-level Ended block's rule since tests/panel-ended.test.js mup3h70u); a provider / stall / check-timeout the leg ended on), then its
 * own end record, then the leg's end for a window with none of its own, then `died` / `open`. Every reader (replay, the panel's server and status
 * table) asks here; none spells a category, a `money-halt` or a cap sentence on its own (tests/part-end-owner-guard.test.js).
 * @param {EndOfInput} w
 * @returns {{end: EndKind, cutBy: 'own-end'|'leg'|'window', words: string|null, ladder: boolean}}
 */
export function endOf(w) {
  const leg = w.leg ?? null;
  const facts = leg ? legFactsOf(leg) : { cap: w.legCap ?? null, esc: null };
  /** @param {EndKind} end @param {'own-end'|'leg'|'window'} cutBy @param {string|null} [words] @param {boolean} [ladder] */
  const res = (end, cutBy, words, ladder = false) => ({ end, cutBy, words: words === undefined ? (/** @type {Record<string, string>} */ (END_WORDS)[end] ?? null) : words, ladder });
  /** the leg's halt, read as the window's end */
  const byLegEnd = () => {
    if (facts.cap === 'money') return res('capped-money', 'leg');
    if (facts.cap === 'time') return res('capped-time', 'leg');
    if (leg === null) return null;
    const o = leg.outcome;
    if (o === null) return res('died', 'leg');
    if (Object.hasOwn(KIND_OF_WRITTEN, o)) return res(KIND_OF_WRITTEN[o], 'leg');
    return res('failed', 'leg', o);
  };
  if (w.own) {
    if (w.own.green) return res('passed', 'own-end', null);
    const trip = w.trip ?? null;
    const c = trip?.category ?? null;
    // the window's own escalation counts as the leg's cap only when it IS the leg's last escalation (an earlier ladder step in a capped leg stays a ladder)
    const isLegsLast = leg === null || (facts.esc !== null && (trip === facts.esc || (typeof trip?.seq === 'number' && trip.seq === facts.esc.seq)));
    if (w.own.outcome === 'escalated' && trip) {
      if (c === 'stopped') return res('stopped', 'own-end');
      if (c === 'wall-halt') return res('capped-time', 'own-end');
      if (c === 'cap-halt') {
        if (facts.cap === 'money' && isLegsLast) return res('capped-money', 'own-end');
        return res('failed', 'own-end', null, true);
      }
      const k = c !== null && Object.hasOwn(KIND_OF_WRITTEN, c) && c !== 'stopped' ? KIND_OF_WRITTEN[c] : null;
      // a provider / stall / timeout counts when the leg ended on that very outcome (the category and the outcome share a name)
      if (k !== null && (leg === null || (isLegsLast && leg.outcome === c))) return res(k, 'own-end');
    }
    return res('failed', 'own-end', null);
  }
  if (w.cutBy === 'single-leg') {
    if (facts.cap === 'money') return res('capped-money', 'leg');
    if (facts.cap === 'time') return res('capped-time', 'leg');
  } else if (w.cutBy === 'leg' || (w.cutBy === 'last-leg' && leg !== null && leg.outcome !== null && w.legGreen !== true)) {
    const r = byLegEnd();
    if (r) return r;
  }
  if (w.died) return res('died', 'window');
  return res('open', 'window', null);
}
