// The U runner's end-of-run readout, in the one place a test can reach it.
//
// `run-u.mjs` is a script: importing it runs it. So the one line of it whose
// arithmetic was WRONG lives here instead, and the runner calls it.
//
// F83, the small unfixed item: the banner printed money FOLDED (`job-end`'s total
// across every leg of a resume) and wall LEG-ONLY (`Date.now() - started` of this
// process), both against the SAME signed cap, and said which for neither. On
// u-msf70nei that read `wall 12.8min of 45min` for a leg that resumed onto 24.9
// already-burnt minutes. Nothing was mis-ENFORCED — `createClock` folds
// `priorElapsedMs` and the outside watchdog armed on the 20.1min remainder — the
// readout simply computed the wall a second way, which is the two-transforms class
// (F9) the clock's own `enforcedMs` comment exists to refuse.
//
// Both figures stay on the line. The folded total is the one the cap governs, so it
// leads; the leg is what this process actually bought, and dropping it would trade
// one blindness for the other.

/** minutes, at the precision the readout has ever claimed (~90%, hamr's ruling) */
const min = (/** @type {number} */ ms) => (ms / 60_000).toFixed(1);

/**
 * The banner's wall line: what this run has consumed of its signed cap.
 * @param {{legMs: number, priorWallMs?: number, wallLabel: string}} o
 *   `legMs`: wall this process bought. `priorWallMs`: wall its predecessors burnt,
 *   as `readResume` folded it (0/absent on a cold run). `wallLabel`: the signed cap
 *   as the runner spells it, including the honest UNBOUNDED prose.
 * @returns {string}
 */
export function wallLine({ legMs, priorWallMs = 0, wallLabel }) {
  // the belt every sibling fold site carries (src/clock.js's `prior`, readResume's
  // four): a non-finite or negative fold contributes 0. A NaN here would render
  // `NaNmin` and a negative would report LESS wall than the leg demonstrably took.
  const prior = typeof priorWallMs === 'number' && Number.isFinite(priorWallMs) && priorWallMs > 0 ? priorWallMs : 0;
  // a cold run has no fold and gets exactly the line it always got
  if (prior === 0) return `${min(legMs)}min of ${wallLabel}`;
  return `${min(legMs + prior)}min of ${wallLabel} (this leg ${min(legMs)}min)`;
}

/**
 * F97 — the DOOMED RESUME read, the one the operator should make before signing.
 *
 * `u-msn0uccv` spent $0.82 re-entering the exact plan whose action was the diagnosed
 * defect, carrying `priorReplans: 2` and `priorReplanGrantUsed: true`. A resume does
 * not re-draft — `scout-skipped {reason:"resumed"}` and the plan comes back
 * byte-for-byte — so with the replan ledger empty there was no mechanism left that
 * could replace it. Two attempts, 26 rounds, 0 writes, `step-red` with money and
 * minutes still on the clock. Nothing in the library was at fault; every part of that
 * leg reported honestly. The DECISION to fire was the defect, and the read that would
 * have refused it costs $0: both facts are already parsed by the preview gate.
 *
 * WARNING ONLY. This never blocks and never changes behaviour — a resume of a
 * mechanical gap (a named wall, a count) converts on re-entry all the time, and the
 * operator is the one who can tell which kind of gap it is. Blocking here would be
 * this file inventing a gate; the arbiter's gates are signed, not derived from a
 * readout module.
 *
 * @param {{seed?: {phase?: string}|null, replans?: number, replanGrantUsed?: boolean}|null} [restart]
 *   `readResume`'s `restart` fold: WHERE it picks up and WHAT LEDGER it inherited.
 * @returns {boolean} true only for the shape F97 measured.
 */
export function doomedResume(restart) {
  // WHERE. `phase: 'steps'` is the re-entry that reloads the accepted plan and runs
  // it again. `'close'` is not this shape and must not warn: every step FINISHED, so
  // nothing failed plan is being re-entered, and the outer close fix loop writes
  // without spending a replan. `null` (no `plan-accepted` in the window) is the cold
  // path — that resume re-drafts, which is the very escape this warning is about.
  if (restart?.seed?.phase !== 'steps') return false;
  // WHAT IT HAS LEFT. The ceiling is a latch of ONE (PRD v1.12 — unlimited replanning
  // launders thrash as adaptation) plus the arbiter's single variance-granted extra
  // (F85-C). Both spent is zero capacity; a count above zero with the grant STILL
  // UNEARNED is conditional capacity, and warning there would fire the banner on the
  // commonest resume there is, which trains the eye to skip the line that matters.
  //
  // The count is belted the way every other fold site belts one, and in the fail-safe
  // direction FOR A WARNING: an unreadable ledger is not evidence of exhaustion, so it
  // stays silent rather than claiming a fact it cannot read (F6 — unknown is never
  // rounded into a claim).
  const spent = typeof restart.replans === 'number' && Number.isFinite(restart.replans) && restart.replans > 0;
  return spent && restart.replanGrantUsed === true;
}
