// The stall watchdog (F66) — the only instrument that fires on the ABSENCE of ROUNDS.
//
// MEASURED reason this exists. bare-agent's `timeoutMs` is an IDLE-SOCKET timeout:
// `applyRequestTimeout` is one `req.setTimeout(...)` in provider-http.js, and Node
// resets that timer on every byte. Its own docstring is explicit — "the timer
// resets on activity, so a slow-but-streaming response is not killed". On U run
// ms3197n8 the connection stayed alive for 274 minutes with ZERO rounds emitted,
// then died `read ECONNRESET`. bare-agent's timer never fired; the run spent
// 287.3min against a 45min wall and $3.23 for nothing. The bound was correctly
// derived and correctly forwarded (loop.js:732 passes options per provider call) —
// it just watches bytes, and bytes kept flowing while the run made no progress.
//
// So the heartbeat here is A COMPLETED ROUND, not a byte. That swap IS the fix,
// and it is the one signal bare-agent cannot see from inside the HTTP request.
//
// SELF-HEAL, not a stop (hamr's ruling): "the goal is always self heal and killing
// and coming back is not an option — what would we tell the user, it timed out, do
// something?!" A stall abandons the call and REISSUES it; the operator never hears
// about it. Only after `maxStalls` does the watch give up, and even then it does
// not end the run — it throws `step-stalled`, which the step loop reads as a
// replan trigger. The run adapts; it does not surrender.
//
// What still bounds this, so self-heal cannot run away: the wallet is unchanged (a
// reissue spends from the same signed budget), the wall clock still ends the run,
// and the step's round bound is untouched. The one honest cost is that an
// abandoned call MAY already have been billed, so a reissue can pay twice — that
// is capped by the wallet, and unknown spend is reported as unknown, never zero
// (F6/F44). It is also exactly why `Retry` was left unwired; self-heal is the
// ruling that overrides it.
//
// Timers are injected so the whole mechanism is deterministically testable — a
// watchdog validated with real sleeps is a flake generator, and one that is never
// watched failing is not validated at all.

/** hamr's number: no completed round for five minutes is a stall. */
export const STALL_MS = 300_000;
/** hamr's number: three stalls on one call, then stop reissuing and replan. */
export const MAX_STALLS = 3;

/**
 * A stall gave up. Carries the category the step loop's replan trigger reads and
 * the `lib` attribution stamped AT THE THROW SITE (never sniffed from prose).
 */
export class StallError extends Error {
  /** @param {string} message @param {number} stalls */
  constructor(message, stalls) {
    super(message);
    this.name = 'StallError';
    /** @type {string} */
    this.category = 'step-stalled';
    /** @type {string} */
    this.lib = 'bare-agent';
    /** @type {number} */
    this.stalls = stalls;
  }
}

/**
 * @typedef {Object} StallWatch
 * @property {<T>(call: (gen: number) => Promise<T>) => Promise<T>} watch run `call`,
 *   reissuing it whenever it goes `stallMs` without a beat; rejects `StallError` past
 *   `maxStalls`. Each issue is handed its GENERATION — the token every callback that
 *   call installs must carry back, so a corpse's callbacks cannot touch the live call.
 * @property {(gen: number) => void} beat a round completed on generation `gen` — reset
 *   the window. From any other generation it is inert.
 * @property {(gen: number) => boolean} isCurrent is `gen` still the call this watch is
 *   waiting on? The caller reads it to withhold everything else a dead call would do.
 * @property {() => number} stalls how many stalls this watch has absorbed
 */

/**
 * Start a stall watchdog.
 * @param {{ stallMs?: number, maxStalls?: number, onStall?: (n: number) => void,
 *          setTimer?: (fn: () => void, ms: number) => any,
 *          clearTimer?: (id: any) => void }} [opts]
 *   `onStall` is announced for EVERY stall including the last — a trim or a
 *   recovery that happens silently is indistinguishable from one that never
 *   happened (F28's rule, applied to time).
 * @returns {StallWatch}
 */
export function createStallWatch({
  stallMs = STALL_MS,
  maxStalls = MAX_STALLS,
  onStall = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let stalls = 0;
  /** @type {any} */
  let timerId = null;
  /** the generation of the call currently being watched: NOTHING from an ABANDONED
   * call may touch the one that replaced it — not its trip, not its late settlement,
   * and not its beats. The corpse keeps streaming (ms3197n8's socket lived 274min
   * after we would have moved on), so every callback it installed keeps firing; the
   * generation is the token that tells those callbacks apart from the live call's.
   * It is handed to each issued call and carried back through `beat`/`isCurrent`. */
  let generation = 0;
  let settled = true;
  /** @type {((v: any) => void) | null} */
  let resolve = null;
  /** @type {((e: any) => void) | null} */
  let reject = null;
  /** @type {((gen: number) => Promise<any>) | null} */
  let theCall = null;

  const disarm = () => {
    if (timerId !== null) { clearTimer(timerId); timerId = null; }
  };

  /** @param {number} gen */
  function arm(gen) {
    disarm();
    timerId = setTimer(() => {
      timerId = null;
      if (settled || gen !== generation) return; // a trip from a superseded call
      trip();
    }, stallMs);
  }

  function trip() {
    stalls += 1;
    onStall(stalls);
    generation += 1; // everything from the abandoned call is now inert
    if (stalls >= maxStalls) {
      settled = true;
      disarm();
      reject?.(new StallError(
        `no round completed for ${Math.round(stallMs / 1000)}s, ${stalls} times — giving up on this call`,
        stalls,
      ));
      return;
    }
    issue(); // self-heal: abandon the hung call, start a fresh one
  }

  function issue() {
    const gen = generation;
    arm(gen);
    let p;
    try {
      // the call is TOLD its generation: the callbacks it wires (metering, the round
      // bound, the wall cut) outlive the call itself, and this is the only token that
      // lets them ask "am I still the live one?".
      p = /** @type {(g: number) => Promise<any>} */ (theCall)(gen);
    } catch (e) { // a synchronous throw is a real failure, not a stall
      settled = true;
      disarm();
      reject?.(e);
      return;
    }
    p.then(
      (v) => {
        if (settled || gen !== generation) return; // an abandoned call finally answered
        settled = true;
        disarm();
        resolve?.(v);
      },
      (e) => {
        // The abandoned socket dies LATER — ms3197n8's did, at +274min. Nobody is
        // listening any more, and an unhandled rejection here would take the whole
        // run down. Swallowing it is the point, not an oversight.
        if (settled || gen !== generation) return;
        settled = true;
        disarm();
        reject?.(e);
      },
    );
  }

  /** @type {<T>(call: (gen: number) => Promise<T>) => Promise<T>} */
  function watch(call) {
    theCall = call;
    settled = false;
    generation += 1;
    return new Promise((res, rej) => {
      resolve = res;
      reject = rej;
      issue();
    });
  }

  return {
    stalls: () => stalls,
    // A beat is SCOPED TO ITS CALL. Rounds do arrive from a call we abandoned, and
    // re-arming on one is not a harmless late timer: it re-arms the watch that is
    // timing the REPLACEMENT, so the corpse feeds the watchdog and the live call can
    // hang for the rest of the run without ever tripping. A beat after the watch has
    // settled is inert for the same reason.
    /** @param {number} gen the generation `watch` handed the call that produced this round */
    beat(gen) {
      if (settled || gen !== generation) return;
      arm(generation);
    },
    /** @param {number} gen @returns {boolean} */
    isCurrent: (gen) => !settled && gen === generation,
    watch,
  };
}
