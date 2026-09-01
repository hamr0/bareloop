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
 * A token count, k/M-abbreviated — 2 decimals at and above a million (the tail's own
 * `.2M`-shaped resolution matters more once six figures are folded into a suffix), 1
 * decimal in the thousands, and the bare integer under that (a two- or three-digit
 * round is more readable plain than as `"0.2k"`).
 * @param {number} n
 * @returns {string}
 */
export function fmtTokens(n) {
  if (!Number.isFinite(n)) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * THE TOKENS TAIL LINE — hamr's 2026-09-01 order: `job-end` carries dollars only, and
 * the run tail never prints a token total anywhere, though tokens exist per round on
 * `worker-round.usage` and `judge-round.usage`
 * ({inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens}).
 *
 * Summed off THIS LEG's own spine, over every round TYPE that spends money —
 * worker-round AND judge-round (house rule: a spend-slicing instrument must enumerate
 * every round type that spends, or it silently undercounts). `worker-result` is an
 * ATTEMPT-LEVEL ECHO of round sums, not a round, and is deliberately never matched
 * here — folding it in would double the real figure.
 *
 * A round whose `usage` is missing or not an object (today: every `judge-round` — the
 * payload at `src/planrun.js`'s `onJudgeCost` does not carry one) is counted as
 * UNKNOWN, never laundered into a silent 0 — the same rule `costUsd` already lives by
 * (F6/F44): an unpriced round is reported as unpriced, not folded into the total as
 * if it cost nothing.
 *
 * @param {{events: any[]}} o `events` this leg's own parsed spine, never a folded
 *   chain — a resumed leg's tokens are this leg's own bill, same as `rounds` above it.
 * @returns {string}
 */
export function tokensLine({ events }) {
  const list = Array.isArray(events) ? events : [];
  const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let unpriced = 0;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if (e.type !== 'worker-round' && e.type !== 'judge-round') continue;
    const u = e.usage;
    if (!u || typeof u !== 'object') { unpriced += 1; continue; }
    inputTokens += num(u.inputTokens);
    outputTokens += num(u.outputTokens);
    cacheReadTokens += num(u.cacheReadTokens);
    cacheCreationTokens += num(u.cacheCreationTokens);
  }
  const total = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const note = unpriced > 0 ? ` (${unpriced} round${unpriced === 1 ? '' : 's'} unpriced/no usage)` : '';
  return `${fmtTokens(total)} · in ${fmtTokens(inputTokens)} · out ${fmtTokens(outputTokens)} · `
    + `cache-read ${fmtTokens(cacheReadTokens)} · cache-write ${fmtTokens(cacheCreationTokens)}${note}`;
}

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
 * THE REVIEW DOOR's package (softgreen module 8) — the same evidence, at the door
 * at the END of a run rather than at a stage inside the close.
 *
 * It is a SEPARATE renderer from `evidencePackage` and deliberately so: that one
 * opens with *"this run reached the one stage a machine cannot render, and it is
 * waiting on you"*, which at a review door would be false twice over — the machine
 * rendered every stage, and the run is over. What a person needs told here is the
 * opposite fact: a verdict was minted, it STANDS, and what happens to the work is
 * theirs. The stage/changed/diff body is shared, because it is the same evidence.
 * @param {{door: any, diff?: any}} o
 * @returns {string[]}
 */
export function reviewDoorPackage({ door, diff }) {
  const d = door ?? {};
  const held = d.quarantined === true;
  /** @type {string[]} */
  const out = [];
  out.push(`REVIEW DOOR — this run's close minted ${String(d.outcome ?? 'a verdict')} and it STANDS. Nothing you do here changes it.`);
  if (held) {
    out.push('  held     this green was rendered by the judged floor, so it has earned NO reuse and NO learning credit until you accept it');
  }
  // the body: what the machine judged, what moved, and the lines themselves —
  // rendered by the SAME code the pause screen uses, off the same record shape.
  // The ASK line is dropped when there is no ask: a door asks nothing of its own
  // (it offers three answers to a verdict already minted), and the pause renderer's
  // stand-in sentence would be inventing a question nobody declared. Keyed on the
  // gutter rather than on that sentence's wording, which is not this file's to pin.
  const hasAsk = typeof d.ask === 'string' && d.ask.trim() !== '';
  out.push(...evidencePackage({ pause: { ...d, ask: d.ask ?? null }, diff }).slice(1)
    .filter((l) => hasAsk || !l.startsWith('  ask ')));
  return out;
}

/**
 * THE DOOR LIST ITSELF — the header, the order, and the gutter, spelled ONCE.
 *
 * Both screens that offer the three doors (the step-level pause and the review
 * door at the end of a run) show the same list in the same order for the same
 * reason; only the CONSEQUENCES differ, so only the prose is passed in. Spelling
 * the structure twice is how the two screens come to disagree about which door
 * leads — and the order is the whole design input (see `doorLines`).
 * @param {{rerun: string, accept: string, pause: string}} prose what each door
 *   costs on THIS screen, without its trailing colon
 * @param {{rerun: string, accept: string, pause: string}} cmd the exact command
 *   each door costs, so nobody has to reconstruct one
 * @returns {string[]}
 */
function threeDoors(prose, cmd) {
  return [
    'THREE DOORS — no fourth, and no decision is taken for you: nothing happens without the flag.',
    `  rerun   ${prose.rerun}:\n            ${cmd.rerun}`,
    `  accept  ${prose.accept}:\n            ${cmd.accept}`,
    `  pause   ${prose.pause}:\n            ${cmd.pause}`,
  ];
}

/**
 * The three doors AT THE REVIEW DOOR. Same order and the same rule as
 * `doorLines` (rerun leads, ~40% rubber-stamp), different consequences: this run
 * is OVER, so a rerun is a fresh engagement rather than a continuation, and a
 * pause keeps the door rather than a step checkpoint.
 * @param {{rerun: string, accept: string, pause: string, ttlDays: number, held: boolean}} o
 * @returns {string[]}
 */
export function runDoorLines({ rerun, accept, pause, ttlDays, held }) {
  return threeDoors({
    rerun: '"I don\'t like it, go again" — your words become the requirement a FRESH engagement plans against (its own clock, what is left of the signed budget)',
    accept: `${held ? 'releases this run\'s learning credit' : 'confirms it'} — and the close\'s MECHANICAL stages re-run first, because the tree can move after a run ends`,
    pause: `not now. Nothing runs and nothing is spent; the door keeps for ${ttlDays} days and then expires on its own, which is all that "cancel" ever meant`,
  }, { rerun, accept, pause });
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
 * The third door is PAUSE (2026-08-18), not cancel. hamr: *"what's the point of
 * cancel anyways? pause can resume — that would be more honest"*. A person who does
 * not want to carry on today is not making a permanent judgment, and the door should
 * not ask them to: the checkpoint keeps, and an unanswered one expires on its own.
 *
 * @param {{rerun: string, accept: string, pause: string}} invocations the exact
 *   command each door costs, so nobody has to reconstruct one
 * @returns {string[]}
 */
export function doorLines({ rerun, accept, pause }) {
  return threeDoors({
    rerun: 'your words BECOME the gap the worker fixes from, and the run continues under what is left of the budget',
    accept: 'green — minted on FRESH evidence (the mechanical stages re-run first, since the tree may have moved)',
    pause: 'not now. Nothing is run and nothing is spent; the checkpoint keeps and this run resumes from the start of its last step whenever you come back',
  }, { rerun, accept, pause });
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
 * WHERE A RESUME PICKS UP — the preview's `at` line, which is what says how much of
 * the signed dollars this leg can still spend.
 *
 * `readStepCheckpoint` (src/reuse.js) knows two phases and a null: `steps` (re-enter
 * the plan at the first unfinished step), `close` (every step landed; the close and
 * its fix loop are what is left), and no checkpoint at all (the halt landed before a
 * plan was accepted). The runner rendered those three directly, and a PAUSE fits none
 * of them cleanly:
 *
 *  - a pause happens AFTER the plan's steps, at the close's human stage. On the
 *    fixture a person actually meets, the checkpoint reads `phase:'steps'` with every
 *    step green (the pause site emits no `outer-close` of its own), so the step
 *    arithmetic ran off the end and printed `at step 2 of 1 "(unknown)"` — a step
 *    count larger than the plan and an id nobody drafted. hamr found it on the first
 *    resume preview he read;
 *  - and the same walk-off is reachable one terminal over, with no person involved:
 *    a kill between the last `step-end` and the `outer-close` leaves exactly that
 *    shape, and read `step 3 of 2`.
 *
 * So the count is never allowed to exceed the plan, and the PHASE is said in words.
 * Rendering only; it decides nothing and bounds nothing.
 *
 * @param {{seed: {phase?: string, plan?: any, completedSteps?: any[]}|null|undefined,
 *   paused: boolean}} o `seed` is `readResume`'s `restart.seed`; `paused` is the
 *   recorded terminal being `hitl-pause` — read off the spine, never off a flag.
 * @returns {string[]} lines, ready to print
 */
export function resumeAtLines({ seed, paused }) {
  const at = (/** @type {string} */ s) => `  at       ${s}`;
  const reloaded = '           the plan is reloaded from that run\'s own spine: no re-scout, no re-draft';
  if (!seed) {
    // the pause has its OWN cold shape (src/planrun.js's close precheck: every
    // mechanical stage already passed on the untouched tree, so the run asked its
    // person before drafting anything). "the beginning" is where a resume of it
    // starts and is not the phase it stopped in — both facts, in that order.
    if (paused) {
      return [at('the human review — no plan was ever accepted: this run reached its human stage at the close PRECHECK, '
        + 'before it drafted anything'),
      '           an accept re-runs the mechanical stages for no tokens; a rerun starts the plan from the beginning'];
    }
    return [at('the beginning — it halted before a plan was accepted, so nothing paid is re-payable')];
  }
  const total = Array.isArray(seed.plan?.steps) ? seed.plan.steps.length : 0;
  const done = Array.isArray(seed.completedSteps) ? seed.completedSteps.length : 0;
  if (paused) {
    return [at(`the human review — all ${total} step(s) finished and are SKIPPED; the close reached its human stage, `
      + 'and it re-runs for no tokens (what your answer costs after that is the door you pick)'), reloaded];
  }
  if (seed.phase === 'close') {
    return [at(`the close and its fix loop — all ${total} step(s) are done and are SKIPPED; the close re-runs for no tokens`), reloaded];
  }
  // the plan is EXHAUSTED but no close was recorded: the halt landed between the last
  // step and the close's first reading. There is no next step to name, and inventing
  // one is what produced `step 3 of 2 "(unknown)"`.
  if (done >= total) {
    return [at(`the close — all ${total} step(s) finished and are SKIPPED, and the run stopped before the close rendered; `
      + 'it runs next, for no tokens'), reloaded];
  }
  return [at(`step ${done + 1} of ${total} ${JSON.stringify(seed.plan.steps[done]?.id ?? '(unknown)')} — ${done} already finished and SKIPPED, not re-paid`), reloaded];
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
