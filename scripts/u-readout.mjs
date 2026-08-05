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
