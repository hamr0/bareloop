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
 * @property {string|null} outcome the leg's terminal: its `job-end` outcome, else a `run-end` outcome (a $0 refusal), else null
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
      : (typeof runEnd?.outcome === 'string' ? runEnd.outcome : null);
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
