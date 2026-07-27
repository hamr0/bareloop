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

/** a hand-driven clock + timer queue: nothing here touches real time */
function fakeTimers() {
  let nowMs = 0;
  /** @type {{ at: number, fn: () => void, id: number, live: boolean }[]} */
  const queue = [];
  let nextId = 1;
  return {
    now: () => nowMs,
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
  const call = () => { attempts += 1; return new Promise((res) => { settle = res; }); };
  const p = w.watch(call);
  // four rounds, each arriving just inside the window: 4x longer than the window
  // in total, and it must NOT trip once.
  for (let i = 0; i < 4; i++) {
    T.advance(STALL_MS - 1);
    w.beat();
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

test('timers are released — a settled watch leaves nothing armed', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  await w.watch(() => Promise.resolve('done'));
  assert.equal(T.pending(), 0, 'a leaked timer keeps the process alive after the run ends');
});

test('beats after settle are inert — a late round cannot re-arm a finished watch', async () => {
  const T = fakeTimers();
  const w = createStallWatch({ stallMs: STALL_MS, ...T });
  await w.watch(() => Promise.resolve('done'));
  w.beat();
  assert.equal(T.pending(), 0);
});
