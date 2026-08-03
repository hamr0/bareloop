// The step ladder's governor — PROGRESS, not a count (design 2026-08-03).
//
// MEASURED reason this exists. The step loop was bounded by a fixed number of
// check-iterations (`capRuns`, 4 in the operator's runner). Two real spines show
// what that cost: u-msd916dh went 30 → 22 → 17 → 11 scope errors across its
// iterations and was cut with $1.30 and ~6 minutes still unspent; u-mscxuziw went
// 13 → 1 and was cut the same way. The count could not tell converging work from
// thrash, so it stopped both at the same place. And the one lever the plan could
// pull — a step's `attempts` field — could only ever TIGHTEN below the shell's
// number, so the correct heal was inexpressible: drafters measurably tightened to
// 3, then to 2 on replan.
//
// The replacement asks the question the count could not: **is this iteration
// making progress?** Two signals, read per RED iteration:
//
//   gap-new  the failing exits' text, normalized and hashed, against every gap
//            hash seen so far in this step's ladder. A SEEN-SET, never last-only:
//            a real A→B→A oscillator exists in the archive and last-only reads it
//            as progress.
//   wrote    did the worker make real write-class actions THIS iteration — read
//            from the gate audit's own record COUNT (the F32 instrument:
//            run-scoped, allow-decision, write AND edit). Never git status, never
//            a tree diff. It must be a COUNT and not the path SET, because a plan
//            step rewrites its one target every attempt — the set is constant
//            after iteration 1 and would read every later iteration as idle (the
//            same Finding-3 trap Layer R documents one module over).
//
// A **strike** is a red iteration that is a repeat OR wrote nothing. Strikes are
// STICKY — never reset, never repaid by a good iteration in between — because the
// question the ceiling answers is "has this step spent enough of the run failing
// to make progress", and a counter that a single good iteration zeroes can be held
// open forever by alternating.
//
// What still bounds a converging step, so this cannot run away: the wallet (the
// worker's Gate carries the run's remaining budget), the run's wall clock (W-2, at
// the head of every attempt), the variance meter (A), and the stall fuse. Those
// are unchanged and each still ends the ladder on its own authority. This module
// replaces exactly ONE of the old bounds: exhaustion-by-count.

import { createHash } from 'node:crypto';

/**
 * The strike ceiling. Shell-owned, exactly where the fixed count was: the runner
 * sets it, the agent cannot express it, and it is arbiter territory — a step's own
 * plan may not tighten it and may not raise it. Two is hamr's number.
 */
export const STRIKE_LIMIT = 2;

/**
 * The volatile bytes, stripped before hashing. COMPARISON-ONLY: the gap the worker
 * sees is never rewritten (the `normalizeRedLine` rule, one module over).
 *
 * Every entry is a byte a re-run changes while the failure does not. Without them
 * a `node --test` gap is never byte-stable (its duration stamps move every run),
 * so every repeat would read as a novel gap and the repeat signal would be dead —
 * an instrument that cannot see the variable.
 * @type {[RegExp, string][]}
 */
const VOLATILE = [
  // TAP's own timing line, dropped WHOLE: its value is the only thing on it
  [/^[ \t]*#?[ \t]*duration_ms[ \t]*[:=].*$/gm, ''],
  // ISO-8601 stamps, wherever they appear in a close's output
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>'],
  // any millisecond figure (`(1.738ms)`, `took 12 ms`)
  [/\d+(?:\.\d+)?[ \t]*ms\b/g, '<ms>'],
];

/**
 * Normalize a gap for comparison. Deliberately NARROW: only bytes a re-run changes
 * on its own are removed. Error COUNTS, file names and line numbers all survive —
 * a trajectory like "30 errors" → "22 errors" must read as two different gaps, and
 * a normalizer that scrubbed numbers would turn the converging case this module
 * exists to protect into an instant strike.
 * @param {string} text @returns {string}
 */
export function normalizeGap(text) {
  let s = String(text ?? '');
  for (const [re, to] of VOLATILE) s = s.replace(re, to);
  // runs of spaces/tabs collapse (a re-run can re-pad a column); newlines do NOT —
  // line structure is real content
  return s.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/gm, '').trim();
}

/**
 * The comparable key for a gap: the normalized text, hashed. Hashed rather than
 * kept whole because the seen-set lives for the whole step and a close's output
 * can be tens of KB — and because the set holds no content, nothing here can leak
 * model or file bytes into a record.
 * @param {string} text @returns {string}
 */
export function gapKey(text) {
  return createHash('sha256').update(normalizeGap(text), 'utf8').digest('hex');
}

/**
 * Build one ladder. ONE PER STEP: the seen-set and the strike count are the step's
 * own history, and a ladder shared across steps would strike a fresh step for a gap
 * an earlier one had already seen.
 *
 * @param {object} opts
 * @param {number} [opts.limit] strikes that end the step (default `STRIKE_LIMIT`)
 * @param {() => number} opts.writeCount the CUMULATIVE count of the worker's
 *   allow-decision write/edit records so far this step (planrun reads it off the
 *   gate audit). Required, and a throw when it is missing rather than a silent
 *   degradation to repeats-only: a strike rule running on one of its two signals
 *   with nothing on the record saying so is the blind-instrument class, and this
 *   is the BA-4 param-guard class where a throw is the right answer.
 */
export function createLadder({ limit = STRIKE_LIMIT, writeCount }) {
  if (typeof writeCount !== 'function') {
    throw new TypeError('createLadder requires a writeCount seam — a strike rule with one signal wired is prose, not a bound');
  }
  /** @type {Map<string, number>} gap key → the iteration it was FIRST seen at */
  const firstSeen = new Map();
  /** @type {{at: number, firstAt: number}[]} */
  const repeats = [];
  /** @type {number[]} iterations in which the worker wrote nothing */
  const idle = [];
  let strikes = 0;
  let iterations = 0;
  let priorWrites = 0;

  return {
    /**
     * Read one RED iteration. Called by ralph after the judge has rendered a
     * non-green, non-fault verdict — a green never reaches here, so every reading
     * is a failing iteration by construction.
     * @param {{iteration: number, gap?: string}} o
     * @returns {{iteration: number, strike: boolean, strikes: number, limit: number,
     *   wrote: boolean, repeatOf: number|null, distinctGaps: number}}
     */
    record({ iteration, gap }) {
      iterations = iteration;
      const key = gapKey(gap ?? '');
      const firstAt = firstSeen.get(key);
      const repeated = firstAt !== undefined;
      if (repeated) repeats.push({ at: iteration, firstAt: /** @type {number} */ (firstAt) });
      else firstSeen.set(key, iteration);

      // the DELTA, not the total: the audit is append-only across the whole step
      const total = writeCount();
      const wrote = total > priorWrites;
      priorWrites = total;
      if (!wrote) idle.push(iteration);

      const strike = repeated || !wrote;
      if (strike) strikes += 1; // sticky: nothing anywhere decrements this
      return {
        iteration, strike, strikes, limit, wrote,
        repeatOf: repeated ? /** @type {number} */ (firstAt) : null,
        distinctGaps: firstSeen.size,
      };
    },
    /** has the step run out of strikes? */
    struckOut: () => strikes >= limit,
    /** the ladder's own books — counts and iteration numbers, never gap content */
    report: () => ({
      iterations, strikes, limit, distinctGaps: firstSeen.size,
      repeats: repeats.map((r) => ({ ...r })),
      idle: [...idle],
    }),
    /**
     * The mechanism, in one sentence, for the replan brief. It is the only channel
     * the redrafting planner adapts to, so it states WHICH shape ended the step and
     * the evidence for it — never a label on its own, and never a culprit file
     * beyond what the close itself reported (F28): the inputs here are iteration
     * numbers and counts, so naming one is inexpressible.
     * @returns {string}
     */
    brief() {
      const parts = [];
      if (repeats.length) {
        const last = repeats[repeats.length - 1];
        parts.push(`it repeated itself — the exit output at iteration ${last.at} had already been seen at iteration ${last.firstAt}`);
      }
      if (idle.length) parts.push(`it stalled — no file was written in iteration(s) ${idle.join(', ')}`);
      const trajectory = `${firstSeen.size} distinct exit output(s) over ${iterations} iteration(s)`;
      const converging = repeats.length === 0
        ? ' Every attempt moved the exit output, so the step was converging when it struck out.'
        : '';
      return `The step ladder ended it on ${strikes} strike(s) of ${limit}: ${parts.join('; ')}. `
        + `Gap trajectory: ${trajectory}.${converging}`;
    },
  };
}
