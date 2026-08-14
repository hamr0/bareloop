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
 * THE EVIDENCE PACKAGE (N4, ruling 2) — what a person is shown before they answer.
 *
 * *"Before/after changes plus every mechanical stage's result; never a bare
 * 'approve?'"*. The LIBRARY assembles the facts and puts them on the `hitl-pause`
 * spine record — the ask the close itself declared, every stage's own result, and
 * WHICH files the run changed (`src/planrun.js`'s `emitHitlPause`). This renders
 * them, and adds the one thing a library cannot state honestly from where it sits:
 * the LINE-level diff, which needs a screen and a repository in front of it.
 *
 * Nothing here derives a verdict, and nothing here decides. It is a readout of a
 * record that already exists — so an absence is written as prose (F6: an empty
 * stage list is "the checkpoint carries none", never a blank screen that reads as
 * "nothing happened") and a trim is announced (F28).
 *
 * @param {{pause: any, diff: {lines: string[], truncated?: number, untracked?: string[],
 *   unavailable?: string|null}|null}} o `pause` the spine record; `diff` what the
 *   runner read off the patient, or null when it did not look.
 * @returns {string[]} lines, ready to print
 */
export function evidencePackage({ pause, diff }) {
  const p = pause ?? {};
  /** @type {string[]} */
  const out = [];
  out.push('HUMAN REVIEW — this run reached the one stage a machine cannot render, and it is waiting on you.');
  out.push(`  ask      ${typeof p.ask === 'string' && p.ask.trim() ? p.ask : '(the close declared no question — review the result as it stands)'}`);

  const stages = Array.isArray(p.stages) ? p.stages : [];
  if (!stages.length) {
    out.push('  stages   no stage results on the checkpoint — nothing here can say what the machine judged, so read the diff below and the run\'s own spine');
  } else {
    out.push('  stages   what the machine judged before it stopped, in the order it judged it:');
    const w = Math.max(...stages.map((s) => String(s?.name ?? '?').length));
    for (const s of stages) {
      const name = String(s?.name ?? '?').padEnd(w);
      const verdict = String(s?.verdict ?? 'unknown').padEnd(12);
      // the MEASUREMENT, where a stage made one: `baseline → value` is the
      // before/after a number can state, and it is the half of "before/after" a
      // diff cannot show
      const measured = typeof s?.value === 'number'
        ? (typeof s?.baseline === 'number' ? `  ${s.baseline} → ${s.value}` : `  ${s.value}`)
        : '';
      // and whatever the stage ANNOUNCED about its own reading (a trim, a scope)
      const notes = typeof s?.notes === 'string' && s.notes.trim() ? `  (${s.notes.trim()})` : '';
      const waiting = s?.verdict === 'human-pause' ? '  ← waiting on you' : '';
      out.push(`           ${name}  ${verdict}${measured}${notes}${waiting}`.trimEnd());
    }
  }

  const changed = p.changed ?? {};
  const paths = Array.isArray(changed.paths) ? changed.paths : [];
  if (typeof changed.unreadable === 'string' && changed.unreadable.trim()) {
    // F6 — an unreadable set is UNKNOWN, and it must never render as a clean tree
    out.push(`  changed  UNKNOWN — the run could not read its own changed set: ${changed.unreadable.trim()}`);
  } else if (!paths.length) {
    out.push('  changed  no changed files recorded on the checkpoint');
  } else {
    const more = typeof changed.more === 'number' && changed.more > 0 ? `, and ${changed.more} more not listed` : '';
    out.push(`  changed  ${paths.length} file(s) this run touched${more}:`);
    for (const f of paths) out.push(`           ${f}`);
  }

  if (diff) {
    if (typeof diff.unavailable === 'string' && diff.unavailable) {
      out.push(`  diff     line-level diff UNAVAILABLE — ${diff.unavailable}`);
    } else {
      const lines = Array.isArray(diff.lines) ? diff.lines : [];
      const untracked = Array.isArray(diff.untracked) ? diff.untracked : [];
      out.push('  diff     the patient AS IT STANDS NOW, against the seed (it can move while a run is paused — that is why accept re-runs the mechanical stages):');
      for (const l of lines) out.push(`           ${l}`);
      if (typeof diff.truncated === 'number' && diff.truncated > 0) {
        out.push(`           … ${diff.truncated} more diff line(s) not shown — read the patient for the rest`);
      }
      if (untracked.length) {
        out.push(`           NEW file(s), which have no diff at all: ${untracked.join(', ')}`);
      }
      if (!lines.length && !untracked.length) out.push('           (the tree matches the seed — nothing to show)');
    }
  }
  return out;
}

/**
 * THE THREE DOORS, rendered — and the 2026-08-12 §4 rule is the ORDER.
 *
 * ~40% of human reviewers approve without reading. That datum is a design input:
 * the default must lean toward rerun and never toward accept, because a default
 * that costs one extra cycle when wrong is cheap and a default that mints a green
 * nobody read is the failure mode the whole class exists to prevent.
 *
 * "Default" here is which door the prompt LEADS with — never an action taken for
 * the operator. No door happens without its flag, and this says so.
 *
 * @param {{rerun: string, accept: string, cancel: string}} invocations the exact
 *   command each door costs, so nobody has to reconstruct one
 * @returns {string[]}
 */
export function doorLines({ rerun, accept, cancel }) {
  return [
    'THREE DOORS — no fourth, and no decision is taken for you: nothing happens without the flag.',
    `  rerun   your words BECOME the gap the worker fixes from, and the run continues under what is left of the budget:\n            ${rerun}`,
    `  accept  green — minted on FRESH evidence (the mechanical stages re-run first, since the tree may have moved):\n            ${accept}`,
    `  cancel  terminal. No gap, no continuation; the work stays on the run's own branch exactly as it is:\n            ${cancel}`,
  ];
}

/**
 * WHEN THE DEAD LEG STOPPED — the input `readResume` folds into `priorWallMs`, and
 * therefore what the resumed leg's wall remainder is computed from.
 *
 * The runner has two candidate witnesses and they answer different questions:
 *
 *  - the WATCHDOG's kill record (`<spine>.watchdog.json`), which is written when the
 *    outside guard reaps a run. For a run that was killed it is later and better
 *    evidence than the last spine event: the process was alive, silently, right up to
 *    the signal, and billing only to its last emitted event would under-report the
 *    wall it really burnt.
 *  - the SPINE's own landed terminal (`job-end`). A run that wrote one did not die —
 *    it ENDED ITSELF and dated its own stop.
 *
 * So the preference order is not "the later record wins", it is "the run's own record
 * wins when there is one". N4 §1.6 is where that distinction stopped being academic:
 * a `hitl-pause` is a clean terminal a person may answer days later, and any record
 * dated after it bills their deciding time to the run's wall. The POC measured the
 * shape — a report 45 days after the pause made `RESUME_WALL_MS` exactly 0, dooming
 * the resumed leg before it opened, on a run that had barely started. W-2 holds by
 * construction only if this reads the pause.
 *
 * Returning `null` is not a failure: it hands `readResume` back its own documented
 * default (the last event's timestamp), which for a clean terminal IS the terminal.
 *
 * @param {{watchdogAt?: unknown, events?: unknown}} o `watchdogAt` as the report
 *   spells it (an ISO string, or anything at all — the file is read off disk);
 *   `events` the dead spine, parsed.
 * @returns {number|null} ms, or null to leave the default in place
 */
export function deathAtOf({ watchdogAt, events } = {}) {
  const list = Array.isArray(events) ? events : [];
  // a landed terminal is the run dating its own stop — nothing outside it is better
  // evidence about a run that was never killed
  if (list.some((e) => e !== null && typeof e === 'object' && /** @type {any} */ (e).type === 'job-end')) return null;
  const at = typeof watchdogAt === 'string' ? Date.parse(watchdogAt) : NaN;
  // an unreadable stamp is UNKNOWN, never a NaN handed to a fold (F6): the caller's
  // own default is the honest fallback
  return Number.isFinite(at) ? at : null;
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
