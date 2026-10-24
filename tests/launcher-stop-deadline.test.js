// stop's wait-until-gone deadline is real clock time: a panel that is still answering, but slowly (close to the probe timeout), makes
// each poll take that long, so counting 100 ms per loop would let `bareloop stop` wait many times the deadline. (A probe that
// times out reads as "gone", so the slow case that matters is a slow ANSWER, not a hang.)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { stopCmd } from '../src/launcher.js';

/** @type {Array<() => void>} */
const closers = [];
after(() => { for (const c of closers) c(); });

test('stop gives up at the deadline in real time even when every probe answers just under its timeout', async () => {
  // answers the first whoami at once (so stop finds the panel), then every later one after 350 ms (probe timeout is 400 ms)
  let answered = false;
  let myPort = 0;
  const sockets = new Set();
  const s = httpServer((_q, res) => {
    const reply = () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app: 'bareloop', version: '1.0.0', pid: 4242, port: myPort, drafts: 0, schedules: 0 }));
    };
    if (!answered) { answered = true; reply(); return; }
    setTimeout(reply, 350);
  });
  s.on('connection', (c) => { sockets.add(c); c.on('close', () => sockets.delete(c)); });
  const port = await new Promise((r) => { s.listen(0, '127.0.0.1', () => r(/** @type {import('node:net').AddressInfo} */ (s.address()).port)); });
  myPort = port;
  closers.push(() => { for (const c of sockets) c.destroy(); s.close(); });
  const lines = [];
  const io = { out: (x) => lines.push(x), err: (x) => lines.push(`ERR ${x}`) };
  const t0 = performance.now();
  const rc = await stopCmd(['--yes'], io, {
    home: '/nonexistent-bareloop-home', ports: [port], timeoutMs: 400, deadlineMs: 500, nodeVersion: '22.1.0', version: '1.0.0',
    kill: (_pid, sig) => { if (sig === 0) { const e = new Error('no such process'); /** @type {any} */ (e).code = 'ESRCH'; throw e; } }, // the pid goes at once; the port keeps answering slowly
  });
  const took = performance.now() - t0;
  assert.equal(rc, 1, lines.join(" / "));
  assert.match(lines.join('\n'), /still answers/);
  // deadline 500 + at most one slow probe 400 (+ the first find) — the old loop counted 100 ms a turn and took ~6 probes (~2.4 s)
  assert.ok(took < 1700, `stop took ${Math.round(took)} ms; expected about 500 + one probe`);
});
