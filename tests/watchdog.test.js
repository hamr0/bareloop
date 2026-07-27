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
import { mkdtempSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WATCHDOG = new URL('../scripts/u-watchdog.mjs', import.meta.url).pathname;
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'wd-'));
  return { dir: d, spine: join(d, 'spine.jsonl') };
}

/** a victim that never exits on its own — stands in for a wedged run.
 * Registered for teardown so a FAILING assertion can never leak it: a test file
 * that strands processes is worse than one that fails. */
function victim(/** @type {{ after: (fn: () => void) => void }} */ t) {
  const p = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  return p;
}

/** @param {{ after: (fn: () => void) => void }} t @param {string[]} args */
function watchdog(t, args) {
  const p = spawn(process.execPath, [WATCHDOG, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { try { p.kill('SIGKILL'); } catch { /* already gone */ } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  return { proc: p, output: () => out };
}

const alive = (/** @type {number} */ pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('a run whose spine keeps growing is never killed', async (t) => {
  const { spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '600', '--poll-ms', '100']);
  // beat the spine faster than the stale window for well over that window
  for (let i = 0; i < 8; i++) { await sleep(200); appendFileSync(spine, `{"type":"worker-round","i":${i}}\n`); }
  assert.equal(alive(v.pid), true, 'a progressing run must not be touched');
});

test('a spine that goes cold gets the run killed', async (t) => {
  const { spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '500', '--poll-ms', '100']);
  await sleep(2000); // never append again — the run has gone quiet
  assert.equal(alive(v.pid), false, 'a wedged run must be stopped from outside');
  assert.match(w.output(), /stale/i);
});

test('the kill is RECORDED — a stopped run must not read as a mystery crash', async (t) => {
  const { dir, spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '500', '--poll-ms', '100']);
  await sleep(2000);
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
  const { spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '60000', '--wall-ms', '600', '--grace-ms', '200', '--poll-ms', '100']);
  const beat = setInterval(() => appendFileSync(spine, '{"type":"worker-round"}\n'), 100);
  await sleep(2500);
  clearInterval(beat);
  assert.equal(alive(v.pid), false, 'a healthy-but-overrunning run is still out of time');
  assert.match(w.output(), /wall/i);
});

test('the watchdog exits on its own when the run finishes normally', async (t) => {
  const { spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '60000', '--poll-ms', '100']);
  const exited = new Promise((res) => w.proc.on('exit', (c) => res(c)));
  v.kill('SIGKILL'); // the run ends
  const code = await Promise.race([exited, sleep(4000).then(() => 'timeout')]);
  assert.equal(code, 0, 'a watchdog that outlives its run is a stray process');
});

test('no marker is written when nothing was killed', async (t) => {
  const { dir, spine } = tmp();
  writeFileSync(spine, '{"type":"job-start"}\n');
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '60000', '--poll-ms', '100']);
  await sleep(600);
  v.kill('SIGKILL');
  await sleep(600);
  assert.equal(existsSync(join(dir, 'spine.jsonl.watchdog.json')), false, 'a clean run leaves no verdict behind');
});

test('a spine that never appears is measured from the watchdog start, not treated as fine', async (t) => {
  // The run can wedge BEFORE it writes its first event. Treating "no file" as
  // "no news is good news" would make the earliest failure the one it cannot see.
  const { spine } = tmp();
  const v = victim(t);
  const w = watchdog(t, ['--spine', spine, '--pid', String(v.pid), '--stale-ms', '500', '--poll-ms', '100']);
  await sleep(2000);
  assert.equal(alive(v.pid), false, 'a run that never emits anything is the most stalled run there is');
});
