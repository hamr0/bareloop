// The stall watchdog (F66) — the instrument that fires on the ABSENCE of ROUNDS.
//
// Why this exists at all, measured: bare-agent's `timeoutMs` is an IDLE-SOCKET
// timeout (`req.setTimeout` in provider-http.js — the timer resets on every byte,
// and its own docstring says "a slow-but-streaming response is not killed"). On
// U run ms3197n8 the socket stayed alive for 274 minutes with ZERO rounds emitted
// and then died `read ECONNRESET`; bare-agent's timer never fired once, the run
// burned 287.3min against a 45min wall, and $3.23 bought nothing. The bound WAS
// passed (loop.js:732 forwards options per call) — it simply watches the wrong
// quantity.
//
// So the heartbeat is a COMPLETED ROUND, not a byte. That swap is the whole fix.
//
// Self-heal, not a stop (hamr): a stall abandons the call and REISSUES it. The
// run never comes back to the operator saying "it timed out, do something" —
// that would be the product failing at its own premise. Only after
// `maxStalls` does the step give up and hand the run its replan trigger.
//
// Timers are injected, so every test is deterministic — no sleeps, no flake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStallWatch, StallError } from '../src/stall.js';

/** a hand-driven timer queue: nothing here touches real time. The watch reads the
 * clock only through these timers — it holds no `now` of its own, so there is none
 * to inject (an injected knob nothing reads is a knob that lies about what is under
 * test, F16). */
function fakeTimers() {
  let nowMs = 0;
  /** @type {{ at: number, fn: () => void, id: number, live: boolean }[]} */
  const queue = [];
  let nextId = 1;
  return {
    setTimer: (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
      const t = { at: nowMs + ms, fn, id: nextId++, live: true };
      queue.push(t);
      return t.id;
    },
    clearTimer: (/** @type {number} */ id) => {
      const t = queue.find((x) => x.id === id);
      if (t) t.live = false;
    },
    /** advance time, firing every timer whose deadline has passed */
    advance(ms) {
      const target = nowMs + ms;
      for (;;) {
        const due = queue.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        nowMs = due.at;
        due.live = false;
        due.fn();
      }
      nowMs = target;
    },
    pending: () => queue.filter((t) => t.live).length,
  };
}

const STALL_MS = 300_000; // 5 minutes — hamr's number

test('a call that finishes before the stall window resolves untouched', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  const p = w.watch(() => Promise.resolve('done'));
  assert.equal(await p, 'done');
  assert.equal(w.stalls(), 0);
});

test('no round for the stall window REISSUES the call rather than failing', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  let attempts = 0;
  /** first attempt never settles — the hang. Second returns. */
  const call = () => {
    attempts += 1;
    return attempts === 1 ? new Promise(() => {}) : Promise.resolve('healed');
  };
  const p = w.watch(call);
  T.advance(STALL_MS);
  assert.equal(await p, 'healed');
  assert.equal(attempts, 2, 'the stalled call must be reissued, not surfaced to the caller');
  assert.equal(w.stalls(), 1);
});

test('a beat RESETS the window — a slow but progressing call is never cut', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  let attempts = 0;
  let settle = /** @type {(v: string) => void} */ ((_) => {});
  /** @type {number} */
  let gen = -1;
  const call = (/** @type {number} */ g) => { attempts += 1; gen = g; return new Promise((res) => { settle = res; }); };
  const p = w.watch(call);
  // four rounds, each arriving just inside the window: 4x longer than the window
  // in total, and it must NOT trip once.
  for (let i = 0; i < 4; i++) {
    T.advance(STALL_MS - 1);
    w.beat(gen);
  }
  settle('slow but alive');
  assert.equal(await p, 'slow but alive');
  assert.equal(attempts, 1, 'a beating call must never be reissued');
  assert.equal(w.stalls(), 0);
});

test('maxStalls is a CEILING: the (maxStalls+1)th stall throws StallError', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, ...T });
  let attempts = 0;
  const call = () => { attempts += 1; return new Promise(() => {}); }; // always hangs
  const p = w.watch(call);
  const err = p.then(() => null, (e) => e);
  for (let i = 0; i < 4; i++) T.advance(STALL_MS);
  const e = await err;
  assert.ok(e instanceof StallError, `expected StallError, got ${e}`);
  assert.equal(w.stalls(), 3, 'the counter stops at the ceiling');
  assert.equal(attempts, 3, 'three issues, then give up — never a fourth');
  assert.match(e.message, /3/);
});

test('the error carries the category the replan trigger reads', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 1, ...T });
  const p = w.watch(() => new Promise(() => {}));
  const err = p.then(() => null, (e) => e);
  T.advance(STALL_MS * 2);
  const e = await err;
  assert.equal(e.category, 'step-stalled');
  assert.equal(e.lib, 'bare-agent');
});

test('a stall is ANNOUNCED, never silent — onStall sees each one', async () => {
  const T = fakeTimers();
  /** @type {number[]} */
  const seen = [];
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, onStall: (n) => seen.push(n), ...T });
  const p = w.watch(() => new Promise(() => {}));
  const err = p.then(() => null, (e) => e);
  for (let i = 0; i < 4; i++) T.advance(STALL_MS);
  await err;
  assert.deepEqual(seen, [1, 2, 3], 'every stall is reported, in order, including the last');
});

// ─── L4: the wall is consulted BEFORE the watch spends again ───

/** settle-or-not, never a hang: a watch that WRONGLY reissues leaves the promise
 * pending forever, and an unbounded await would turn that red into a suite that
 * stops instead of a test that fails (the ZOMBIE test's capture pattern). */
const capture = (/** @type {Promise<any>} */ p) => {
  /** @type {{ err?: any, ok?: any } | null} */
  let outcome = null;
  p.then((v) => { outcome = { ok: v }; }, (e) => { outcome = { err: e }; });
  return async () => { await new Promise((r) => setImmediate(r)); return outcome; };
};

test('L4: past the wall a stall does NOT reissue — the run already declined to authorize that spend', async () => {
  const T = fakeTimers();
  let atWall = false;
  let attempts = 0;
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, expired: () => atWall, ...T });
  const call = () => { attempts += 1; return new Promise(() => {}); }; // always hangs
  const read = capture(w.watch(call));
  T.advance(STALL_MS); // stall #1 with time left: self-heal, exactly as before
  assert.equal(attempts, 2, 'a stall INSIDE the wall still reissues — self-heal is the ruling');
  atWall = true;
  T.advance(STALL_MS); // stall #2, now past the deadline
  const e = (await read())?.err;
  assert.equal(attempts, 2, 'no third issue: a reissue past the wall is spend the run has already refused');
  assert.equal(w.stalls(), 2, 'the stall that hit the wall is still counted and announced');
  assert.ok(e instanceof Error, `the caller must be TOLD, not left waiting on a call that will never be made — got ${e}`);
  assert.match(e.message, /wall-clock cap/i, 'the message names the wall, not the model');
});

test('L4: the terminal says the WALL bound the run, never that the model stalled — step-stalled would buy a replan a run out of time cannot fund', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, expired: () => true, ...T });
  const read = capture(w.watch(() => new Promise(() => {})));
  T.advance(STALL_MS);
  const e = (await read())?.err;
  assert.ok(e, 'the wall stop must surface as a rejection');
  assert.equal(e.category, 'wall-halt', 'an EXISTING category every consumer already routes — never a new one');
  assert.notEqual(e.category, 'step-stalled', 'step-stalled is planrun\'s replan trigger; replanning past the wall spends a draft on a finished run');
  assert.ok(!(e instanceof StallError), 'StallError IS the step-stalled category — the wall stop must not wear its name');
  assert.equal(e.lib, undefined, 'the wall is bareloop\'s own instrument: no upstream package is charged for a governance stop');
  assert.equal(e.stalls, 1, 'what happened on the way here is still on the error');
});

test('L4: the wall outranks the maxStalls ceiling — the last stall of an expired run is a wall-halt, not a give-up on the model', async () => {
  const T = fakeTimers();
  let atWall = false;
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, expired: () => atWall, ...T });
  const read = capture(w.watch(() => new Promise(() => {})));
  T.advance(STALL_MS); // #1
  T.advance(STALL_MS); // #2
  atWall = true;
  T.advance(STALL_MS); // #3 — the ceiling AND the wall, both true
  const e = (await read())?.err;
  assert.ok(e, 'either terminal rejects; the question is which one it names');
  assert.equal(e.category, 'wall-halt', 'both are true and only one is the remedy the operator can act on (raise maxWallMs)');
  assert.equal(w.stalls(), 3);
});

test('L4 regression control: with a LIVE wall the watch reissues exactly as it always did, up to the ceiling', async () => {
  const T = fakeTimers();
  let attempts = 0;
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, expired: () => false, ...T });
  const p = w.watch(() => { attempts += 1; return new Promise(() => {}); });
  const err = p.then(() => null, (e) => e);
  for (let i = 0; i < 4; i++) T.advance(STALL_MS);
  const e = await err;
  assert.ok(e instanceof StallError, 'a live wall changes nothing: the model gave up, and that is step-stalled');
  assert.equal(e.category, 'step-stalled');
  assert.equal(attempts, 3, 'three issues, then the ceiling — byte-identical to the no-callback behaviour');
  assert.equal(w.stalls(), 3);
});

test('L4 backward compatibility: a watch built WITHOUT the wall callback behaves exactly as today', async () => {
  const T = fakeTimers();
  let attempts = 0;
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, ...T }); // no `expired`
  const p = w.watch(() => { attempts += 1; return new Promise(() => {}); });
  const err = p.then(() => null, (e) => e);
  for (let i = 0; i < 4; i++) T.advance(STALL_MS);
  const e = await err;
  assert.ok(e instanceof StallError);
  assert.equal(attempts, 3, 'an absent wall is not an expired one — a caller with no clock must never be cut short');
});

test('a real rejection is NOT a stall — it propagates and is never reissued', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  let attempts = 0;
  const boom = new Error('ECONNREFUSED');
  const p = w.watch(() => { attempts += 1; return Promise.reject(boom); });
  await assert.rejects(p, /ECONNREFUSED/);
  assert.equal(attempts, 1);
  assert.equal(w.stalls(), 0, 'a transport error is not a stall');
});

test('the abandoned call cannot crash the process when it later rejects', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  let attempts = 0;
  /** @type {(e: Error) => void} */
  let killIt = () => {};
  const call = () => {
    attempts += 1;
    return attempts === 1 ? new Promise((_, rej) => { killIt = rej; }) : Promise.resolve('healed');
  };
  const p = w.watch(call);
  T.advance(STALL_MS);
  // the dangling socket dies LATER, exactly as ms3197n8's did (ECONNRESET at
  // +274min). Nothing is listening any more — if the watch did not swallow it,
  // this is an unhandled rejection that takes the whole run down.
  killIt(new Error('read ECONNRESET'));
  assert.equal(await p, 'healed');
  await new Promise((r) => setImmediate(r)); // let any unhandled rejection surface
});

test('an abandoned call that dies MID-FLIGHT cannot kill the healthy one that replaced it', async () => {
  // The ms3197n8 shape exactly: the hung socket eventually returned ECONNRESET —
  // at +274min, long after we would have moved on. If the abandoned call can still
  // settle the caller's promise, the reissue is decorative: the run dies anyway,
  // just later. The reissued call MUST still be pending when the old one dies.
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  let attempts = 0;
  /** @type {(e: Error) => void} */
  let killOld = () => {};
  /** @type {(v: string) => void} */
  let finishNew = () => {};
  const call = () => {
    attempts += 1;
    return attempts === 1
      ? new Promise((_, rej) => { killOld = rej; })
      : new Promise((res) => { finishNew = res; });
  };
  const p = w.watch(call);
  T.advance(STALL_MS); // stall → abandon #1, issue #2 (which does NOT settle yet)
  assert.equal(attempts, 2);
  killOld(new Error('read ECONNRESET')); // the corpse rejects, mid-flight
  await new Promise((r) => setImmediate(r)); // let that rejection propagate
  finishNew('healed');
  assert.equal(await p, 'healed', 'the dead call must not be able to settle the live one');
});

test('a ZOMBIE round cannot keep the replacement alive — a beat is generation-scoped', async () => {
  // MED-2, demonstrated live: the abandoned call does not stop existing. Its socket
  // is exactly the ms3197n8 shape — still open, still streaming rounds — and every
  // one of those rounds calls back. If a corpse's beat re-arms the watch, it re-arms
  // it on the call that REPLACED it, and that replacement can then hang for the rest
  // of the run without ever tripping: the watchdog is fed by the thing it abandoned.
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, maxStalls: 3, ...T });
  /** @type {number[]} */
  const gens = [];
  let attempts = 0;
  const call = (/** @type {number} */ gen) => { attempts += 1; gens.push(gen); return new Promise(() => {}); };
  /** @type {{ err?: any, ok?: any } | null} */
  let outcome = null;
  w.watch(call).then((v) => { outcome = { ok: v }; }, (e) => { outcome = { err: e }; });
  T.advance(STALL_MS); // stall #1 → call#1 abandoned, call#2 issued
  assert.equal(attempts, 2);
  const zombie = gens[0];
  // the corpse now beats four times per window, forever, while the replacement
  // produces nothing at all. The replacement MUST still trip out to StallError.
  for (let i = 0; i < 16; i++) {
    T.advance(STALL_MS / 4);
    w.beat(zombie);
  }
  await new Promise((r) => setImmediate(r));
  assert.ok(
    /** @type {any} */ (outcome)?.err instanceof StallError,
    'the replacement never tripped — an abandoned call kept its successor\'s watch alive',
  );
  assert.equal(w.stalls(), 3);
});

test('a superseded generation is never current again — the seam that withholds beat() and loop.stop() from a corpse', async () => {
  // The fuse's callbacks (metering, the round bound, the wall cut) are wired per
  // Loop, and after a reissue TWO calls can be firing them. `isCurrent` is how the
  // caller tells its own rounds from a dead call's: the corpse's spend is still
  // metered (F6/F44 — an orphaned round is really billed), but it must never beat
  // the watch and never stop the live call.
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  /** @type {number[]} */
  const gens = [];
  let attempts = 0;
  /** @type {(v: string) => void} */
  let finishNew = () => {};
  const call = (/** @type {number} */ gen) => {
    attempts += 1;
    gens.push(gen);
    return attempts === 1 ? new Promise(() => {}) : new Promise((res) => { finishNew = res; });
  };
  const p = w.watch(call);
  assert.equal(w.isCurrent(gens[0]), true, 'the call in flight is the one the watch is timing');
  T.advance(STALL_MS);
  assert.equal(attempts, 2);
  assert.notEqual(gens[1], gens[0], 'each issued call gets its own generation token');
  assert.equal(w.isCurrent(gens[0]), false, 'the abandoned call is inert: no beat, no stop, on the live call');
  assert.equal(w.isCurrent(gens[1]), true);
  finishNew('healed');
  assert.equal(await p, 'healed');
  assert.equal(w.isCurrent(gens[1]), false, 'a late round after the watch settles is inert too');
});

test('timers are released — a settled watch leaves nothing armed', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  await w.watch(() => Promise.resolve('done'));
  assert.equal(T.pending(), 0, 'a leaked timer keeps the process alive after the run ends');
});

test('beats after settle are inert — a late round cannot re-arm a finished watch', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  /** @type {number} */
  let gen = -1;
  await w.watch((/** @type {number} */ g) => { gen = g; return Promise.resolve('done'); });
  w.beat(gen); // the call's OWN generation, arriving late: still inert once settled
  assert.equal(T.pending(), 0);
});
