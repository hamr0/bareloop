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
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeStagesOf } from '../src/plan.js';

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
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  // BOTH numbers are sized on measurement, and they move together on purpose.
  //
  // The old pair was `--stale-ms 600` against an `await sleep(200)` + appendFileSync
  // round trip — 3:1 on paper. Measured in this exact shape under 3x CPU
  // oversubscription (25 runs): the widest cold gap per run was p50 231ms, max 335ms,
  // i.e. the worst beat ate 56% of the window and the real margin was 1.79x. The beat
  // is the load-sensitive half (line 27), so the window is widened to ~6x that worst
  // gap rather than the beat being chased faster.
  //
  // Widening alone would have DISARMED the test: 8 beats is 1.6s of observation, and
  // against a 2s window a guard that ignored the spine entirely could not have killed
  // anything inside it — the assertion would pass on a broken watchdog. So the
  // observation widens with it. 5s is 2.5x the stale window: a guard that read this
  // beating spine as flat kills at ~2.1s, ~3s before the assertion runs.
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '2000', '--poll-ms', '100']);
  const beat = setInterval(() => { try { appendFileSync(spine, '{"type":"worker-round"}\n'); } catch { /* raced teardown */ } }, 200);
  t.after(() => clearInterval(beat));
  await sleep(5000);
  clearInterval(beat);
  assert.equal(alive(w.proc.pid), true, 'a progressing run must not be touched');
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'and no kill was even attempted — a live run leaves the guard silent');
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

/** a victim that spawns the guard and REPORTS ITS EXIT CODE. `guardedRun` unrefs the
 * guard and makes it a grandchild of the test, so its exit code is unobservable there —
 * and a startup refusal is exactly an exit code. The victim keeps the handle (no
 * `unref`) so the 'exit' event is delivered, and it outlives the guard on a timer.
 * @param {{ after: (fn: () => void) => void }} t
 * @param {string[]} args watchdog flags; `--pid` is added by the victim (its own)
 */
function guardedExit(t, args) {
  const src = `const { spawn } = require('node:child_process');
    const c = spawn(process.execPath, [${JSON.stringify(WATCHDOG)}, ...${JSON.stringify(args)}, '--pid', String(process.pid)], { stdio: ['ignore', 'inherit', 'inherit'] });
    c.on('exit', (code) => { process.stdout.write('WATCHDOG_EXIT ' + code + '\\n'); });
    setInterval(() => {}, 1000);`;
  const p = spawn(process.execPath, ['-e', src], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  return { proc: p, output: () => out };
}

test('a NON-POSITIVE --wall-ms is REFUSED loudly, never defaulted into an unarmed deadline', async (t) => {
  // The hole this closes: `num()` fell back to its default on anything that was not a
  // finite positive number, so `--wall-ms 0` disarmed the deadline trigger SILENTLY
  // while the caller's own banner said "armed for 0min". Both producers can reach zero
  // — run-u's `Math.max(0, WALL_MS - priorWallMs)` and run-reuse's `plannedWallMs` — and
  // a wall remainder of nothing is a decision for the operator (W-2: past the wall
  // nothing new starts), never an unbounded launch. It is the same
  // NaN/undefined-disarms-a-guard class run-u.mjs already names one flag over.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedExit(t, ['--spine', spine, '--stale-ms', '60000', '--poll-ms', '100', '--wall-ms', '0']);
  assert.equal(await waitUntil(() => /WATCHDOG_EXIT/.test(w.output()), 20_000), true, 'the guard must decide at startup, not arm and stay quiet');
  assert.match(w.output(), /WATCHDOG_EXIT 2/, 'a flag the operator got wrong is an operator error (exit 2), the same code the parent-link refusal uses');
  assert.match(w.output(), /REFUSED/);
  assert.match(w.output(), /--wall-ms/, 'the refusal names the flag it could not accept');
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'a refusal is not a verdict — it leaves no marker');
  assert.equal(alive(w.proc.pid), true, 'and it kills nothing on the way out');
});

test('a garbled numeric flag is refused too — a silent default is a second ceiling nobody chose', async (t) => {
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedExit(t, ['--spine', spine, '--stale-ms', 'soon', '--poll-ms', '100']);
  assert.equal(await waitUntil(() => /WATCHDOG_EXIT/.test(w.output()), 20_000), true);
  assert.match(w.output(), /WATCHDOG_EXIT 2/);
  assert.match(w.output(), /--stale-ms/);
});

test('an OMITTED --wall-ms is still legal: the guard says "no wall" and the stale trigger stays armed', async (t) => {
  // The control that keeps the refusal above from being a blanket ban: run-u OMITS the
  // flag entirely on a spec with no `maxWallMs` (an unbounded run is a visible operator
  // choice), and that path must keep working — a refusal on absence would break it.
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '500', '--poll-ms', '100']);
  await waitUntil(() => !alive(w.proc.pid));
  assert.match(w.output(), /no wall/, 'the unbounded choice is loud on BOTH sides of the process boundary');
  assert.equal(alive(w.proc.pid), false, 'and the STALE trigger — which needs no wall — is still armed');
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
  const stages = closeStagesOf(spec)?.length || 1;
  // DERIVED from the spec, never pinned to a count: the close's stage list is a
  // signed, editable thing (the F84 split took this spec from 4 stages to 5), and
  // a test that hardcoded the number would red on a legal close edit while saying
  // nothing about the arithmetic it exists to guard.
  assert.ok(stages >= 4, `the U target runs a multi-stage close — got ${stages}`);
  const timeout = Number(/const CLOSE_TIMEOUT_MS = ([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ''));
  assert.equal(timeout, 900_000, 'every stage runs under the full close timeout (src/clock.js W5)');
  const ONE_STAGE_DEFAULT = 900_000; // the watchdog's own default — the defect's value
  assert.ok(stages * timeout - ONE_STAGE_DEFAULT >= 2_700_000,
    `the grace this spec needs is ${(stages * timeout) / 60_000} minutes — at least the 45 the one-stage default lost, got ${(stages * timeout - ONE_STAGE_DEFAULT) / 60_000}`);
  // The count comes from the RUNNER's own derivation, so the guard and the thing it
  // guards read one number. Reading `spec.close` alone saw an AUTHORED close
  // (`closeDecl`) as one stage — the arm below is that defect, measured.
  assert.match(src, /const closeStages = closeStagesOf\(spec\)\?\.length \|\| 1;/);
  assert.match(src, /const worstCloseSilenceMs = CLOSE_TIMEOUT_MS \* closeStages;/);
  assert.match(src, /'--grace-ms', String\(worstCloseSilenceMs\)/, 'and it is actually passed to the guard');

  // AN AUTHORED CLOSE IS THE SAME ARITHMETIC. A `closeDecl` spec carries no
  // `close` field at all, so the old reading sized a six-stage declaration at ONE
  // — 15 minutes of legal silence against 90 — and the outside guard would have
  // SIGKILLed a live verdict mid-close. That is the shape F70 names: the guard
  // carrying the failure mode it guards.
  const declared = { closeDecl: { genre: 'TYPES', lang: 'js', stages: spec.close.map((/** @type {any} */ s) => ({ name: s.name })) } };
  assert.equal(closeStagesOf(declared)?.length, spec.close.length, 'the declared stages are counted, not collapsed to 1');
  // and the floor is live rather than decorative: run-u reads its spec raw off disk
  // and does not validateJob it until runJob, so a spec naming NO close reaches here
  assert.equal(closeStagesOf({ job: 'no-close-named' }), null);
  assert.equal(closeStagesOf({ job: 'no-close-named' })?.length || 1, 1);
});

test('neither caller can hand the guard a zero wall: both REFUSE the launch above the spawn', () => {
  // The other half of the refusal tested at the top of this file. The guard now stops
  // on `--wall-ms 0` instead of defaulting it away — but a runner that reached that
  // point at all would be launching a paid run with no time in it (W-2: past the wall
  // nothing new starts), so each caller owns the same zero one step earlier. Pinned in
  // SOURCE because neither refusal is reachable from here: run-u's needs a real
  // patient repository past its approval gate (tests/resume-u.test.js drives that one
  // end to end), and run-reuse's needs a registry, a signed envelope and a dead reuse
  // spine. What this locks is the ORDER — a refusal below the spawn is a guard armed
  // with the number the refusal exists to reject.
  for (const [file, guard] of [
    ['../scripts/run-u.mjs', /RESUME_WALL_MS !== null && RESUME_WALL_MS <= 0/],
    ['../scripts/run-reuse.mjs', /if \(plannedWallMs <= 0\) \{/],
  ]) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const refusalAt = src.search(guard);
    const spawnAt = src.indexOf("'--wall-ms'");
    assert.ok(refusalAt > 0, `${file}: the wall-exhausted refusal is gone`);
    assert.ok(spawnAt > 0, `${file}: the guard's wall flag is gone`);
    assert.ok(refusalAt < spawnAt, `${file}: the refusal must sit ABOVE the spawn — below it, the run is already paying`);
    assert.match(src, /WALL ALREADY EXHAUSTED/, `${file}: the stop is decision-ready and says so in words`);
  }
});

// ── F72 park B: kill-CHECKS-before-kill, on the record.
//
// W-3 (hamr, 2026-07-30): "the kill from outside should check for activity/bytes or
// other markers for activity, not a silent kill". The guard already checks and already
// speaks; what these tests hold is that the CHECK ITSELF survives to disk, in a form a
// reader can audit after the fact — which trigger fired, what the marker actually said
// at the moment of decision, whether the process was even still there, and which
// numbers the guard was armed with. F72 is why every stamp is UTC: two clocks in two
// timezones (journal local, spine UTC) manufactured a false 87-minute reading that had
// to be withdrawn.
//
// RATIO NOTE. The stale trigger here runs at 120:1 (stale 3000 : poll 25), which is the
// guard's OWN default ratio (600_000 : 5_000) — the marker must read flat across ~120
// real polls to earn the kill. The two shipped callers configure it HIGHER still
// (run-u.mjs and run-reuse.mjs pass `--stale-ms worstCloseSilence + 600_000`, which is
// 4_200_000 : 5_000 = 840:1 on the 4-stage U spec), and a higher ratio is strictly more
// flat polls, i.e. strictly harder to reach. Testing at 5:1 is what let a marker that
// could never go flat at production constants pass its tests once already.

/** a victim that INSTALLS a SIGTERM handler and ignores it — the wedged-but-signalable
 * case. `freeze` cannot be used for this: a hard-frozen loop never services a handler,
 * so it dies to SIGTERM's kernel default and would prove nothing about the escalation.
 *
 * The handler also reports whether the report was ALREADY on disk when the signal
 * arrived. That is the only vantage point from which the write-then-signal order is
 * observable at all: from outside, a report written a microsecond after SIGTERM looks
 * identical to one written before it.
 *
 * @param {{ after: (fn: () => void) => void }} t
 * @param {string[]} args
 * @param {string} markerPath the report the guard is expected to have written first
 */
function ignoringRun(t, args, markerPath) {
  const src = `const { spawn } = require('node:child_process');
    const { existsSync } = require('node:fs');
    const c = spawn(process.execPath, [${JSON.stringify(WATCHDOG)}, ...${JSON.stringify(args)}, '--pid', String(process.pid)], { stdio: ['ignore', 'inherit', 'inherit'] });
    c.unref();
    process.on('SIGTERM', () => { process.stdout.write('MARKER_AT_SIGTERM ' + existsSync(${JSON.stringify(markerPath)}) + '\\nIGNORED_SIGTERM\\n'); });
    process.stdout.write('WATCHDOG_PID ' + c.pid + '\\n');
    setInterval(() => {}, 1000);`;
  const p = spawn(process.execPath, ['-e', src], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  let out = '';
  let wdPid = 0;
  p.stdout.on('data', (d) => { out += d; const m = String(out).match(/WATCHDOG_PID (\d+)/); if (m) wdPid = Number(m[1]); });
  p.stderr.on('data', (d) => { out += d; });
  t.after(() => { try { if (wdPid) process.kill(wdPid, 'SIGKILL'); } catch { /* already gone */ } });
  return { proc: p, output: () => out };
}

test('the pre-kill report carries every check the decision was made on: the trigger, the marker\'s value AND age, whether the process was still there, and every bound the guard was armed with', async (t) => {
  const { dir, spine } = tmp(t);
  const body = '{"type":"job-start"}\n';
  writeFileSync(spine, body);
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '3000', '--poll-ms', '25', '--wall-ms', '900000', '--grace-ms', '60000', '--dead-ms', '300000', '--term-grace-ms', '500']);
  const marker = join(dir, 'spine.jsonl.watchdog.json');
  await waitUntil(() => existsSync(marker), 20_000);
  const rec = JSON.parse(readFileSync(marker, 'utf8'));

  assert.equal(rec.reason, 'stale', 'WHICH trigger fired — a reader must never have to infer it from prose');
  assert.equal(rec.killed, true);
  assert.equal(rec.pid, w.proc.pid, 'and WHICH process it was aimed at');
  assert.equal(rec.pidAlive, true, 'whether the target was still alive when the decision was taken — a kill aimed at a corpse is a different event from one that stopped a running process');

  // the marker's own evidence: the value and the age, not a verdict about them
  assert.equal(rec.markers.spine.bytes, body.length, 'the spine\'s SIZE at the decision — the byte count W-3 asks the guard to check');
  assert.ok(rec.markers.spine.coldMs >= 3000, `the age that earned the kill (${rec.markers.spine.coldMs}ms against a 3000ms window)`);
  assert.equal(rec.markers.spine.path, spine);

  // every number it was armed with, so the decision is reproducible from the record alone
  // `deadMs` is asked for as 300_000 and ENFORCED at 3000, because the guard clamps it
  // to the stale window (a dead window above it could never be reached). The record
  // must show what it was ARMED with, never what was requested — a record quoting the
  // request would make the arithmetic in it wrong, which is the whole reason it exists.
  assert.deepEqual(
    { staleMs: rec.staleMs, wallMs: rec.wallMs, graceMs: rec.graceMs, deadMs: rec.deadMs, pollMs: rec.pollMs, termGraceMs: rec.termGraceMs },
    { staleMs: 3000, wallMs: 900_000, graceMs: 60_000, deadMs: 3000, pollMs: 25, termGraceMs: 500 },
  );

  // F72: ONE timezone, everywhere. The withdrawn "87 awake minutes with no guard
  // firing" claim came from reading a LOCAL journal stamp against a UTC spine — the
  // blind-instrument class in a new coat. Every stamp this file writes is UTC ISO, and
  // that is asserted rather than assumed.
  for (const [k, v] of [['at', rec.at], ['startedAt', rec.startedAt], ['lastEventAt', rec.lastEventAt], ['markers.spine.lastMovedAt', rec.markers.spine.lastMovedAt]]) {
    assert.match(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${k} must be UTC ISO with the Z — a local stamp read against the UTC spine manufactured a false finding once (F72)`);
    assert.equal(new Date(v).toISOString(), v, `${k} must round-trip`);
  }
  assert.ok(Date.parse(rec.at) - Date.parse(rec.lastEventAt) >= 3000, 'the two stamps are on the same clock, so their difference is the age it acted on');
  assert.equal(existsSync(`${marker}.tmp`), false, 'the report lands by rename — no temp file survives a successful write');
});

test('a run that IGNORES SIGTERM is SIGKILLed after the grace — the escalation is real, and the report is already on disk before either signal', async (t) => {
  // The recoverable case gets its chance first: SIGTERM lets a live run flush its spine.
  // A run that installs a handler and does nothing with it must not be able to outlive
  // its own guard by catching the polite signal — that would be F70 again (a guard
  // defeated through the mechanism it was given to be gentle).
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const marker = join(dir, 'spine.jsonl.watchdog.json');
  const w = ignoringRun(t, ['--spine', spine, '--stale-ms', '3000', '--poll-ms', '25', '--term-grace-ms', '1000'], marker);
  await waitUntil(() => existsSync(marker), 20_000);
  const killedAt = Date.now();
  assert.equal(await waitUntil(() => !alive(w.proc.pid), 20_000), true, 'a SIGTERM-swallowing run still dies — SIGKILL is not catchable');
  assert.match(w.output(), /IGNORED_SIGTERM/, 'and the victim really did swallow the first signal — otherwise this test proves nothing about the escalation');
  assert.match(w.output(), /MARKER_AT_SIGTERM true/, 'the report was on disk by the time the victim ran its handler');
  // WEAK ON PURPOSE, and recorded as weak: the line above cannot fail. Signal delivery
  // is asynchronous relative to the sender's next statements, so a report written
  // microseconds AFTER `process.kill` still lands before the victim's handler is
  // scheduled — measured by moving the write below the SIGTERM, where this assertion
  // still passed. The ordering requirement is real (a guard killed mid-stop must
  // already have said why) but it is not observable from outside the guard, so it is
  // pinned at the only place it IS observable: the source. That mutant dies here.
  const src = readFileSync(new URL('../scripts/u-watchdog.mjs', import.meta.url), 'utf8');
  const wrote = src.indexOf('renameSync(tmpPath, reportPath)');
  const signalled = src.indexOf("process.kill(pid, 'SIGTERM')");
  assert.ok(wrote > 0 && signalled > 0, 'both sites still exist under these names');
  assert.ok(wrote < signalled, 'the report is written BEFORE the signal goes out — a kill with no explanation on disk is the failure mode this whole file exists to prevent');
  assert.ok(Date.now() - killedAt >= 500, 'the grace was actually given, not skipped: SIGKILL is the last resort, never the first move');
  assert.match(w.output(), /SIGKILL/, 'the escalation is announced too — a hard kill is never quieter than a polite one');
});

test('a report that CANNOT be written does not defeat the kill — the guard must not be disarmable through its own reporting (F70)', async (t) => {
  // The failure is real, not simulated: a DIRECTORY sits on the report path, so the
  // rename cannot land. Nothing in the kill path may depend on that write succeeding —
  // a guard whose trigger runs through its own logging is a guard with an off switch.
  const { dir, spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  mkdirSync(join(dir, 'spine.jsonl.watchdog.json'));
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '3000', '--poll-ms', '25', '--term-grace-ms', '500']);
  assert.equal(await waitUntil(() => !alive(w.proc.pid), 20_000), true, 'the kill proceeds with no report at all');
  assert.match(w.output(), /KILL stale/, 'and the decision is still spoken in full on stderr — the record is degraded, never silent');
  assert.match(w.output(), /REPORT WRITE FAILED/, 'the failure to record is itself reported, so a missing marker is never read as "the guard never fired"');
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json.tmp')), false, 'and a failed write leaves no half-report behind to be mistaken for one');
});
