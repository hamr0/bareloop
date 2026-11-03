// stop's wait-until-gone deadline is clock time: a panel that is still answering, but slowly (close to the probe timeout), makes
// each poll take that long, so counting 100 ms per loop would let `bareloop stop` wait many times the deadline. (A probe that
// times out reads as "gone", so the slow case that matters is a slow ANSWER, not a hang.)
// The clock, the sleeps and the probe replies are all fake here (`clock`, `sleep`, `fetchImpl` deps), so machine load cannot move
// a probe past its timeout and flip the result (it did, in 2 of 4 full runs on 2026-11-02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopCmd } from '../src/launcher.js';

test('stop gives up at the deadline even when every probe answers just under its timeout (fake clock)', async () => {
  let fake = 0; // the fake monotonic clock, ms
  let probes = 0;
  const whoami = { app: 'bareloop', version: '1.0.0', pid: 4242, port: 4700, drafts: 0, schedules: 0 };
  // the first whoami answers at once (so stop finds the panel); every later one takes 350 ms of fake time (probe timeout is 400 ms)
  const fetchImpl = /** @type {typeof fetch} */ (async () => {
    probes += 1;
    if (probes > 1) fake += 350;
    return /** @type {any} */ ({ ok: true, json: async () => whoami });
  });
  const lines = [];
  const io = { out: (x) => lines.push(x), err: (x) => lines.push(`ERR ${x}`) };
  const rc = await stopCmd(['--yes'], io, {
    home: '/nonexistent-bareloop-home', ports: [4700], timeoutMs: 400, deadlineMs: 500, nodeVersion: '22.1.0', version: '1.0.0',
    fetchImpl, clock: () => fake, sleep: async (ms) => { fake += ms; },
    kill: (_pid, sig) => { if (sig === 0) { const e = new Error('no such process'); /** @type {any} */ (e).code = 'ESRCH'; throw e; } }, // the pid goes at once; the port keeps answering slowly
  });
  assert.equal(rc, 1, lines.join(' / '));
  assert.match(lines.join('\n'), /still answers/);
  // deadline 500 + at most one slow probe 350 + one poll sleep — the old loop counted 100 ms a turn and took ~6 probes (~2.4 s)
  assert.ok(fake < 1700, `stop took ${fake} ms of fake time; expected about 500 + one probe`);
  assert.ok(probes <= 4, `stop probed ${probes} times (the first find + at most 3 waits)`);
});
