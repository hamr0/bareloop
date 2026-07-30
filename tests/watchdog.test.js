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

test('the wall is enforced from OUTSIDE even while the spine is healthy', async (t) => {
  // hamr's framing: "outside shell timer is running regardless of whats happening
  // inside". A run that keeps producing events forever is still out of time, and
  // the between-rounds check inside the run cannot be trusted to notice if the run
  // is the thing that is broken.
  const { spine } = tmp(t);
  writeFileSync(spine, '{"type":"job-start"}\n');
  const w = guardedRun(t, ['--spine', spine, '--stale-ms', '60000', '--wall-ms', '600', '--grace-ms', '200', '--poll-ms', '100']);
  const beat = setInterval(() => { try { appendFileSync(spine, '{"type":"worker-round"}\n'); } catch { /* raced teardown */ } }, 100);
  await waitUntil(() => !alive(w.proc.pid));
  clearInterval(beat);
  assert.equal(alive(w.proc.pid), false, 'a healthy-but-overrunning run is still out of time');
  assert.match(w.output(), /wall/i);
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
