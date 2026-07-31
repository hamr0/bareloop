// The OUTSIDE watchdog (F67) — the only stop that survives a frozen run.
//
// Why it cannot live inside the run, measured: U run ms3jh76q went 81.5 minutes
// with zero spine events, zero stalls from the in-process fuse, and died `read
// ETIMEDOUT` — the kernel giving up on a socket nobody was reading. A timer in the
// same event loop as the thing that froze it shares its fate; the in-process fuse
// is provably correct (reproduced firing in that exact shape) and still never ran.
// So this one is a SEPARATE PROCESS, and it depends on nothing inside node: it
// reads one file's mtime and calls kill(2).
//
// It is deliberately dumb. It parses no JSON, imports nothing from src/, and holds
// no state about what the run is doing — every one of those would be a way for the
// run's failure to become the watchdog's failure.
//
// These tests spawn REAL processes against REAL files. A watchdog validated
// against a mocked clock and a mocked victim proves nothing about the case it
// exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WATCHDOG = new URL('../scripts/u-watchdog.mjs', import.meta.url).pathname;
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** poll until cond() or deadline — fixed sleeps made these tests fail under full-suite
 * CPU load (parallel tree-sitter indexing starves the poll timers); a bounded wait keeps
 * the assertion able to fail while removing the load sensitivity. */
const waitUntil = async (/** @type {() => boolean} */ cond, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(150); }
  return cond();
};

/** @param {{ after: (fn: () => void) => void }} t the test's own context — the temp tree is
 * registered for teardown here, so a file that runs 8 tests leaves 0 directories behind
 * (measured: 56 stranded `wd-*` trees before this). */
function tmp(t) {
  const d = mkdtempSync(join(tmpdir(), 'wd-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return { dir: d, spine: join(d, 'spine.jsonl') };
}

/** A guarded run: the victim SPAWNS ITS OWN WATCHDOG and then wedges.
 *
 * The parent/child relationship is not fixture decoration — the watchdog's liveness
 * check is `process.ppid === <watched pid>`, so a fixture that spawned the watchdog
 * beside the victim (as a sibling) would be exercising a wiring that run-u.mjs can
 * never produce, and would prove nothing about the deployed guard. The victim inherits
 * this test's pipes to the watchdog, so `output()` is the watchdog's own stderr.
 *
 * Registered for teardown so a FAILING assertion can never leak either process: a test
 * file that strands processes is worse than one that fails.
 *
 * @param {{ after: (fn: () => void) => void }} t
 * @param {string[]} args watchdog flags; `--pid` is added by the victim (its own)
 * @param {{ freeze?: boolean }} [opts] freeze: block the victim's event loop forever
 */
function guardedRun(t, args, opts = {}) {
  // uv_spawn runs synchronously, so the watchdog exists before the busy loop starts —
  // a `for(;;)` victim can still be the one that spawned its own guard.
  // the flags are baked into the source, not passed on the command line: `node -e <src>
  // --spine …` makes node itself try to parse `--spine` as a node option.
  const src = `const { spawn } = require('node:child_process');
    const c = spawn(process.execPath, [${JSON.stringify(WATCHDOG)}, ...${JSON.stringify(args)}, '--pid', String(process.pid)], { stdio: ['ignore', 'inherit', 'inherit'] });
    c.unref();
    process.stdout.write('WATCHDOG_PID ' + c.pid + '\\n');
    ${opts.freeze ? 'for(;;);' : 'setInterval(() => {}, 1000);'}`;
  const p = spawn(process.execPath, ['-e', src], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  let out = '';
  let wdPid = 0;
  p.stdout.on('data', (d) => {
    out += d;
    const m = String(out).match(/WATCHDOG_PID (\d+)/);
    if (m) wdPid = Number(m[1]);
  });
  p.stderr.on('data', (d) => { out += d; });
  t.after(() => { try { if (wdPid) process.kill(wdPid, 'SIGKILL'); } catch { /* already gone */ } });
  return { proc: p, output: () => out, watchdogPid: () => wdPid };
}

const alive = (/** @type {number} */ pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a run whose spine keeps growing is never killed', async (t) => {
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '600', '--poll-ms', '100']);
  // beat the spine faster than the stale window for well over that window
  for (let i = 0; i < 8; i++) { await sleep(200); appendFileSync(spine, `{"type":"worker-round","i":${i}}\n`); }
  assert.equal(alive(w.proc.pid), true, 'a progressing run must not be touched');
});

test('a spine that goes cold gets the run killed', async (t) => {
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '500', '--poll-ms', '100']);
  await waitUntil(() => !alive(w.proc.pid)); // never append again — the run has gone quiet
  assert.equal(alive(w.proc.pid), false, 'a wedged run must be stopped from outside');
  assert.match(w.output(), /stale/i);
});

test('a victim whose event loop is HARD-FROZEN still dies — the exact case F67 exists for', async (t) => {
  // ms3jh76q's shape: the run's event loop is blocked, so no in-process guard can
  // run and no JS signal listener could ever be serviced. The kill still lands
  // because the run path installs NO signal handlers (verified: zero process.on
  // sites in src/ or run-u.mjs), so SIGTERM keeps its kernel default disposition —
  // probed live before this test was written. A busy-loop victim, not setInterval:
  // a healthy-loop victim would prove nothing about the frozen case. It still spawns
  // its own guard first — uv_spawn is synchronous, so the freeze cannot beat it.
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '500', '--poll-ms', '100'], { freeze: true });
  await waitUntil(() => !alive(w.proc.pid));
  assert.equal(alive(w.proc.pid), false, 'a frozen run must die to the outside kill — nothing inside it can act');
  assert.match(w.output(), /stale/i);
});

test('the kill is RECORDED — a stopped run must not read as a mystery crash', async (t) => {
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '500', '--poll-ms', '100']);
  await waitUntil(() => existsSync(join(dir, 'spine.jsonl.watchdog.json')));
  const marker = join(dir, 'spine.jsonl.watchdog.json');
  assert.ok(existsSync(marker), 'the watchdog leaves its verdict on disk, next to the spine it was watching');
  const rec = JSON.parse(readFileSync(marker, 'utf8'));
  assert.equal(rec.reason, 'stale');
  assert.equal(rec.killed, true);
  assert.ok(rec.staleMs >= 500, 'it records the bound it enforced, not just that it fired');
  assert.ok(typeof rec.lastEventAt === 'string' && rec.lastEventAt.length > 0);
});

test('a run PAST the deadline but still ACTIVE is NOT killed — and says so, loudly, every poll', async (t) => {
  // hamr's ruling (2026-07-30): "the kill from outside should check for
  // activity/bytes or other markers for activity, not a silent kill". The clock
  // alone no longer kills: the in-process fuses and the money cap bound a run that
  // is alive, and this guard bounds one that is dead. Killing a progressing run at
  // the deadline is how a live verdict gets destroyed mid-close.
  //
  // Its liveness is BYTES — the beat below appends real spine events. That is the
  // only liveness the guard reads (the CPU marker was removed as measured-broken),
  // and this test is the live half of the should-differ spine pair whose dead half
  // is the kill test below.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--wall-ms', '400', '--grace-ms', '200', '--dead-ms', '400', '--poll-ms', '100']);
  const beat = setInterval(() => { try { appendFileSync(spine, '{"type":"worker-round"}\n'); } catch { /* raced teardown */ } }, 100);
  await waitUntil(() => /PAST DEADLINE/.test(w.output()));
  await sleep(1500); // ~15 further polls, every one of them past the deadline
  clearInterval(beat);
  assert.equal(alive(w.proc.pid), true, 'a live, progressing run is never killed from outside by the clock alone');
  assert.match(w.output(), /PAST DEADLINE by \d+s/, 'the overshoot is named — not killing is not the same as going quiet');
  assert.match(w.output(), /still ACTIVE on spine/, 'and it names WHICH marker is still moving');
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'no kill, no verdict');
});

test('past the deadline with the spine flat, the run is killed — and the kill names the deadline and the marker', async (t) => {
  // The other half of the pair. Same shape as the test above, one difference: this
  // victim writes nothing, so the spine is cold. `--stale-ms 60000` puts the stale
  // trigger far out of reach, so the ONLY thing that can fire here is the deadline
  // trigger.
  //
  // The window is sized at the PRODUCTION RATIO, not at a value that merely fires
  // fast: dead:poll is 60:1 here exactly as it is in production (300_000 : 5_000),
  // so the marker has to stay flat across ~60 real polls to earn the kill. The
  // earlier version of this test ran at `--dead-ms 500` — three orders below
  // production — which is precisely how a marker that can never go flat at the real
  // constants passed its tests anyway.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--wall-ms', '400', '--grace-ms', '200', '--dead-ms', '3000', '--poll-ms', '50']);
  await waitUntil(() => !alive(w.proc.pid));
  assert.equal(alive(w.proc.pid), false, 'past its deadline and producing nothing at all, the run is dead — that is this guard\'s job');
  assert.match(w.output(), /KILL wall-dead/, 'the kill is announced before the signal, never after');
  assert.match(w.output(), /past the deadline/i, 'it says WHICH deadline passed');
  assert.match(w.output(), /marker checked/, 'and which marker it looked at');
  assert.match(w.output(), /"spine":\{.*"coldMs"/, 'with the spine marker\'s own last value and age');
  const rec = JSON.parse(readFileSync(join(dir, 'spine.jsonl.watchdog.json'), 'utf8'));
  assert.equal(rec.reason, 'wall-dead');
  assert.equal(rec.enforcedMs, 600, 'the deadline it enforced is wall + grace, on the record');
  assert.match(rec.judgement, /flat/, 'the record says why the process was judged dead, not just that it was killed');
  assert.ok(rec.markers.spine.coldMs >= 3000, 'the marker age is the evidence — it belongs in the record');
});

test('a busy-looping victim past the deadline is killed too — burning CPU is not progress', async (t) => {
  // This test used to assert the opposite: that a /proc CPU marker held this victim
  // alive. That marker is gone, because it was MEASURED broken both directions —
  // dead-reading a live close (a child's ticks land on the parent only at reap) and
  // alive-reading a dead run (run-u's own 1s lag sampler moves the parent's ticks
  // every ~3.3s, so at the production dead window it could never go flat). hamr's
  // ruling: "keep what is simpler/available" — the spine.
  //
  // So the pair below is deliberately no longer a should-differ pair on CPU: this
  // victim and the idle one above differ ONLY in CPU, and must now share a fate.
  // The should-differ pair that proves the marker is wired is the SPINE one — the
  // beating-spine test above lives, this cold-spine one dies.
  //
  // It is not a duplicate of the hard-frozen F67 test either: that one reaches this
  // same victim through the STALE trigger, this one through the DEADLINE trigger
  // (`--stale-ms 60000` holds stale out of reach). A `for(;;)` process is wedged —
  // it will never finish a job — and both triggers must be able to reap it.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--wall-ms', '400', '--grace-ms', '200', '--dead-ms', '3000', '--poll-ms', '50'], { freeze: true });
  await waitUntil(() => !alive(w.proc.pid));
  assert.equal(alive(w.proc.pid), false, 'a spun-out loop burns CPU forever and produces nothing — the deadline trigger must still reap it');
  assert.match(w.output(), /KILL wall-dead/, 'and it dies to the deadline trigger, not only to the stale one');
  // The victim burns a core the whole time, so a CPU marker would have vetoed this
  // kill forever. Nothing in the guard's own words may name CPU as liveness — this
  // is the assertion that fails the moment the marker is wired back in. (The
  // `still ACTIVE on spine` lines before the kill are correct and expected: the
  // deadline at wall+grace is crossed before the dead window has run out.)
  assert.doesNotMatch(w.output(), /cpu/i, 'CPU is not liveness any more — only real spine bytes hold the kill off');
  const rec = JSON.parse(readFileSync(join(dir, 'spine.jsonl.watchdog.json'), 'utf8'));
  assert.equal(rec.reason, 'wall-dead');
});

test('the watchdog exits on its own when the run finishes normally', async (t) => {
  // The exit is now the PARENT LINK doing its job: the run dies, this process is
  // reparented, `process.ppid` stops matching the watched pid, and the guard leaves.
  // The watchdog is a grandchild of the test now, so its exit CODE is not directly
  // observable — the two things that matter are asserted instead: the process is gone
  // (no stray guard) and it killed nothing on the way out (no marker, next test).
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--poll-ms', '100']);
  await waitUntil(() => w.watchdogPid() > 0);
  const wd = w.watchdogPid();
  assert.ok(wd > 0, 'the run spawned its guard');
  w.proc.kill('SIGKILL'); // the run ends — the hard way, the case pid reuse comes from
  assert.equal(await waitUntil(() => !alive(wd)), true, 'a watchdog that outlives its run is a stray process');
});

test('no marker is written when nothing was killed', async (t) => {
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--poll-ms', '100']);
  await sleep(600);
  w.proc.kill('SIGKILL');
  await sleep(600);
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'a clean run leaves no verdict behind');
});

test('a spine that never appears is measured from the watchdog start, not treated as fine', async (t) => {
  // The run can wedge BEFORE it writes its first event. Treating "no file" as
  // "no news is good news" would make the earliest failure the one it cannot see.
  const { spine } = tmp(t);
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '500', '--poll-ms', '100']);
  await waitUntil(() => !alive(w.proc.pid));
  assert.equal(alive(w.proc.pid), false, 'a run that never emits anything is the most stalled run there is');
});

test('a watchdog aimed at a pid that is not its parent REFUSES to arm — the pid-reuse hazard', async (t) => {
  // The hazard, concretely: run-u dies to SIGKILL/OOM, this process survives it, and
  // the kernel recycles the run's pid onto something unrelated. `kill(pid, 0)` cannot
  // tell the difference — it answers "is SOME process holding this pid" — so the guard
  // would SIGTERM then SIGKILL a stranger and leave a marker on disk blaming the run.
  // The parent link cannot be recycled, so the guard now requires it and REFUSES
  // otherwise: an armed guard pointed at a stranger is worse than no guard, and a guard
  // that silently no-ops is the blind-instrument class. Fail loud, at startup.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const stranger = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => { try { stranger.kill('SIGKILL'); } catch { /* already gone */ } });
  // spawned as a SIBLING of the stranger, exactly as an inherited-pid guard would be
  const p = spawn(process.execPath, [WATCHDOG, '--spine', spine, '--pid', String(stranger.pid), '--stale-ms', '500', '--poll-ms', '100'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  const code = await Promise.race([
    new Promise((res) => p.on('exit', (c) => res(c))),
    sleep(10_000).then(() => 'timeout'),
  ]);
  assert.equal(code, 2, 'it refuses at startup rather than arming against a pid it cannot trust');
  assert.match(out, /parent/i);
  await sleep(1200); // well past the 500ms stale window it would have enforced
  assert.equal(alive(stranger.pid), true, 'the process it was pointed at is untouched');
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'a refusal is not a verdict — it leaves no marker');
});

test('run-u sizes the wall grace as stages x close timeout — and passes it', () => {
  // The defect this locks out: `--grace-ms` was never passed at all, so a 4-stage
  // close ran against the watchdog's own ONE-stage default (900s). The outside
  // deadline landed at wall+15min while a legal close can still be mid-verdict at
  // wall+60min — the guard could destroy a live verdict, on the exact axis the
  // grace exists to protect. The sibling `--stale-ms` already had this arithmetic.
  //
  // Read from SOURCE because run-u.mjs cannot be imported: it is a top-level script
  // that resets the patient repo and spawns a run on load. The arithmetic is checked
  // against the real spec, and the wiring against the real flag.
  const src = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');
  const spec = JSON.parse(readFileSync(new URL('../jobs/aurora-u-spawner-types.json', import.meta.url), 'utf8'));
  const stages = Array.isArray(spec.close) ? spec.close.length : 1;
  assert.equal(stages, 4, 'the U target runs a 4-stage close — the case the one-stage default under-sized by 45 minutes');
  const timeout = Number(/const CLOSE_TIMEOUT_MS = ([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ''));
  assert.equal(timeout, 900_000, 'every stage runs under the full close timeout (src/clock.js W5)');
  assert.equal(stages * timeout, 3_600_000, 'so the grace this spec needs is 60 minutes, not 15');
  // legacy object-form close = ONE stage; `spec.close.length` on it is undefined, and
  // a NaN flag would have disarmed the window silently rather than loudly
  assert.match(src, /const closeStages = Array\.isArray\(spec\.close\) \? spec\.close\.length : 1;/);
  assert.match(src, /const worstCloseSilenceMs = CLOSE_TIMEOUT_MS \* closeStages;/);
  assert.match(src, /'--grace-ms', String\(worstCloseSilenceMs\)/, 'and it is actually passed to the guard');
});
