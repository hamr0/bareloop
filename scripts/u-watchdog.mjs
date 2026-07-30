// The OUTSIDE watchdog (F67) — the only stop that survives a frozen run.
//
// MEASURED reason it exists. U run ms3jh76q spent 81.5 minutes emitting nothing,
// then died `read ETIMEDOUT` — the kernel giving up on a socket the process never
// read. The in-process stall fuse (F66) did not fire once, and it is not broken:
// firing was reproduced against that run's exact shape (four rounds, then
// silence). It never RAN, because a timer in the same event loop as whatever
// froze that loop shares its fate. Every guard bareloop had lived inside the run:
//
//   bare-agent's timeoutMs   idle SOCKET timer — resets on bytes, saw nothing wrong
//   the wall clock           read BETWEEN rounds — no round ever arrived
//   the stall fuse (F66)     a setTimeout — cannot fire on a blocked event loop
//
// So this one is a separate process and shares nothing with the run. It reads one
// file's mtime and calls kill(2). That is the whole design.
//
// It is deliberately DUMB, and each omission is load-bearing:
//   - it parses no JSON (a malformed spine must not blind the guard)
//   - it imports nothing from src/ (no shared code means no shared failure)
//   - it holds no model of what the run is doing (nothing to get out of sync)
//   - it reads bytes and ticks, not meaning (cost is one stat(2) + one small read)
//
// TWO triggers, ONE reconciled decision (hamr's ruling, 2026-07-30: "the kill from
// outside should check for activity/bytes or other markers for activity, not a
// silent kill"):
//   STALE  no progress for longer than the worst LEGAL silence → the run is wedged
//   DEAD   past the deadline (wall + stages × close timeout) AND every activity
//          marker flat → the process is not executing anything at all
// Past the deadline but still ACTIVE is NOT a kill any more. The in-process fuses
// and the money cap own bounding a run that is alive; this guard owns processes
// that are dead. A live run is never killed from outside purely by the clock —
// that is the point of the change, and the previous behaviour could destroy a
// verdict mid-close. Overshoot is reported LOUD on every poll instead. The full
// decision table sits above the decision code.
//
// The kill is RECORDED next to the spine, and it is never silent: before the
// signal goes out this process says which deadline passed, which markers it
// checked, their last values and ages, and why it judged the process dead. A run
// stopped by the arbiter must never read as a mystery crash — that is the
// distinction between a governance stop and a casualty, and it decides whether the
// row is evidence or noise (F45/F48).
//
// Usage:
//   node scripts/u-watchdog.mjs --spine <path> --pid <n>
//        [--stale-ms N] [--wall-ms N] [--grace-ms N] [--dead-ms N] [--poll-ms N]
import { statSync, readFileSync, writeFileSync } from 'node:fs';

const arg = (/** @type {string} */ n, /** @type {string|null} */ dflt = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const num = (/** @type {string} */ n, /** @type {number|null} */ dflt) => {
  const v = arg(n);
  if (v === null) return dflt;
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
};

const spine = arg('spine');
const pid = Number(arg('pid'));
if (!spine || !Number.isInteger(pid) || pid <= 0) {
  console.error('usage: u-watchdog.mjs --spine <path> --pid <n> [--stale-ms N] [--wall-ms N] [--grace-ms N] [--dead-ms N] [--poll-ms N]');
  process.exit(2);
}
// The watched pid must be this process's PARENT. kill(pid, 0) answers "is SOME
// process holding this pid" — after a SIGKILL/OOM the kernel can recycle the
// run's pid onto a stranger, and an armed guard would SIGTERM/SIGKILL it and
// leave a marker blaming the run. The parent link cannot be recycled: run-u
// spawns this guard as its direct child, and `process.ppid` flips to init
// within one poll of the parent dying — verified live, including under SIGKILL.
// A guard pointed at a non-parent refuses LOUD at startup (exit 2, no marker):
// an armed guard aimed at a stranger is worse than no guard, and a silent no-op
// is the blind-instrument class.
if (process.ppid !== pid) {
  console.error(`[u-watchdog] REFUSED: --pid ${pid} is not this process's parent (ppid ${process.ppid}) — the liveness check is the parent link, which pid reuse cannot forge`);
  process.exit(2);
}
// Defaults are DERIVED, not chosen: the stale window is twice the in-process fuse
// (F66, hamr's 5 min), so the inner guard always gets its three tries first and
// this one only speaks when the inner one could not. It stays a flag because a
// threshold is arbiter territory — a number the agent picks off its own sample is
// fitted, not set.
const staleMs = num('stale-ms', 600_000) ?? 600_000;
const wallMs = num('wall-ms', null);
// The wall's grace covers the CLOSE, which legitimately runs after the last round
// and is the longest legal silence a healthy run produces. It is sized the same way
// the run's own clock sizes its enforced deadline (src/clock.js: maxWallMs +
// closeStages × closeTimeoutMs) and the same way the stale window is sized —
// STAGES × the close timeout, because a staged close (PRD v1.28) gives EVERY stage
// the full timeout. The 900_000 default is ONE stage: the single-predicate floor,
// not a number any staged job should run on. A caller with a staged close passes
// its own (scripts/run-u.mjs does; a 4-stage close needs 60min, not 15min, and the
// stale window already got this arithmetic under F67 while the grace did not).
const graceMs = num('grace-ms', 900_000) ?? 900_000;
// How long every activity marker must be flat, PAST the deadline, before the
// process is judged dead. Derived, not chosen: it is the in-process stall fuse's
// own window (F66, hamr's 5 minutes). Past the deadline the grace has ALREADY paid
// for every legal close stage, so there is no legal silence left to protect — one
// fuse window is patience, not budget. Never above the stale window, which would
// make it inert.
const deadMs = Math.min(num('dead-ms', 300_000) ?? 300_000, staleMs);
const pollMs = num('poll-ms', 5_000) ?? 5_000;

const startedAt = Date.now();
const iso = (/** @type {number} */ ms) => new Date(ms).toISOString();
// Liveness is the PARENT LINK, not kill(pid, 0): once the parent dies this
// process is reparented and ppid stops matching — reuse-proof where a pid probe
// is not (see the startup refusal above).
const alive = () => process.ppid === pid;

// ── ACTIVITY MARKERS ────────────────────────────────────────────────────────────
// "Is it dead" is answered by EVIDENCE, never by the clock alone. Two independent
// markers, and they are deliberately NOT symmetric:
//
//   spine  PROGRESS. Bytes reaching the run's own append-only log. Growth here is
//          the run doing the job. One stat(2): size OR mtime moving counts.
//   cpu    LIVENESS. utime+stime (plus reaped children's, since a close runs its
//          suite in a child while the parent's own time stays flat) from
//          /proc/<pid>/stat. FLAT means the process is executing nothing at all.
//          MOVING means it is executing something — which is NOT the same as
//          progressing: a spun-out event loop burns 100% CPU forever (exactly
//          F67's own hard-frozen victim). So the CPU marker may only ever VETO the
//          deadline kill; it never vetoes the stale kill, and it can therefore
//          delay a kill to the stale window but never past it.
//
// The /proc read is safe against the pid-reuse hazard for the same reason the
// liveness check is: every poll re-checks the parent link FIRST, and a pid the
// kernel recycled cannot be this process's parent. Do not read /proc without that
// check in front of it.

/** spine size+mtime in one stat(2). A missing file reads as the watchdog's own
 * start: a run that wedges BEFORE its first event is the most stalled run there
 * is, and treating "no file" as "no news is good news" would blind the guard to
 * exactly that case. */
const readSpine = () => { try { const st = statSync(spine); return { mtimeMs: st.mtimeMs, size: st.size }; } catch { return { mtimeMs: startedAt, size: -1 }; } };
/** utime+stime+cutime+cstime in clock ticks, or null when /proc is not readable
 * (non-Linux, or the process is gone). The comm field can itself contain spaces
 * and parentheses, so the fields are counted from the LAST ')' — the standard
 * parse, and the reason this is not a naive split. */
const readCpuTicks = () => {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = raw.slice(raw.lastIndexOf(')') + 2).split(' '); // f[0] is field 3 (state)
    const ticks = Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14]); // utime stime cutime cstime
    return Number.isFinite(ticks) ? ticks : null;
  } catch { return null; }
};

let spineSeen = readSpine();
let spineMovedAt = spineSeen.mtimeMs;
let cpuTicks = readCpuTicks();
let cpuMovedAt = startedAt;
// Degrade EXPLICITLY, never silently: an instrument that quietly stops reading one
// of its two markers is the blind-instrument class, and the reader of the kill
// record must be able to see which markers actually existed.
let cpuOk = cpuTicks !== null;
if (!cpuOk) console.error(`[u-watchdog] NOTICE: /proc/${pid}/stat is not readable on this platform — the CPU liveness marker is UNAVAILABLE; degrading to the spine marker alone (the stale trigger is unaffected; the deadline trigger now judges on progress only)`);

/** advance each marker's last-movement stamp. Called once per poll, before any
 * decision reads them. */
function sampleMarkers(/** @type {number} */ now) {
  const st = readSpine();
  if (st.size !== spineSeen.size) spineMovedAt = now;
  if (st.mtimeMs > spineMovedAt) spineMovedAt = st.mtimeMs;
  spineSeen = st;
  if (cpuOk) {
    const t = readCpuTicks();
    if (t === null) {
      cpuOk = false;
      console.error(`[u-watchdog] NOTICE: /proc/${pid}/stat stopped being readable — the CPU liveness marker is DROPPED from here on; the spine marker alone decides`);
    } else if (t !== cpuTicks) { cpuTicks = t; cpuMovedAt = now; }
  }
}
/** what every log line and every kill record says about the markers: the value,
 * its age, and — when a marker is missing — that it is missing. */
const markerReport = (/** @type {number} */ now) => ({
  spine: { path: spine, bytes: spineSeen.size < 0 ? 'no file yet' : spineSeen.size, lastMovedAt: iso(spineMovedAt), coldMs: now - spineMovedAt },
  cpu: cpuOk
    ? { ticks: cpuTicks, lastMovedAt: iso(cpuMovedAt), coldMs: now - cpuMovedAt }
    : { unavailable: `/proc/${pid}/stat not readable — spine-only` },
});
const coldMs = (/** @type {number} */ now) => ({ spine: now - spineMovedAt, cpu: cpuOk ? now - cpuMovedAt : null });

function stop(/** @type {string} */ reason, /** @type {string} */ judgement, /** @type {object} */ detail) {
  const now = Date.now();
  const markers = markerReport(now);
  const record = {
    watchdog: 'u-watchdog', reason, killed: true, pid, spine,
    at: iso(now),
    startedAt: iso(startedAt),
    elapsedMs: now - startedAt,
    staleMs, wallMs, graceMs, deadMs,
    lastEventAt: iso(spineMovedAt),
    judgement, markers,
    ...detail,
  };
  // Write the verdict BEFORE the kill: if this process dies mid-stop, the record
  // of why must already be on disk. A kill with no explanation is the failure
  // mode this whole file exists to prevent.
  try { writeFileSync(`${spine}.watchdog.json`, `${JSON.stringify(record, null, 2)}\n`); } catch { /* best-effort */ }
  // NEVER a silent kill (hamr, 2026-07-30). Three lines, in the order a reader
  // needs them: what fired, which bound it was measured against, and the exact
  // marker evidence that says the process is dead rather than slow.
  console.error(`[u-watchdog] KILL ${reason}: pid ${pid} judged DEAD — ${judgement}`);
  console.error(`[u-watchdog]   deadline: ${JSON.stringify({ elapsedMs: record.elapsedMs, wallMs, graceMs, staleMs, deadMs, ...detail })}`);
  console.error(`[u-watchdog]   markers checked: ${JSON.stringify(markers)}`);
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  // SIGTERM lets the run flush its spine. A wedged event loop cannot run a signal
  // handler, so SIGKILL is the one that actually lands — but only after giving the
  // recoverable case its chance.
  setTimeout(() => {
    if (alive()) { try { process.kill(pid, 'SIGKILL'); } catch { /* raced */ } }
    process.exit(1);
  }, 10_000);
}

console.error(`[u-watchdog] watching pid ${pid} — markers [spine${cpuOk ? ' + cpu' : ' only (no /proc)'}], stale ${Math.round(staleMs / 1000)}s${wallMs ? `, wall ${Math.round(wallMs / 1000)}s (+${Math.round(graceMs / 1000)}s grace, then ${Math.round(deadMs / 1000)}s of flat markers)` : ', no wall'}`);

// ── THE DECISION ────────────────────────────────────────────────────────────────
// One table, evaluated every poll after the markers are sampled. "Past deadline"
// means elapsed >= wallMs + graceMs, where the grace is stages × close timeout.
//
//   past deadline | spine (progress)  | cpu (liveness)   | action
//   --------------+-------------------+------------------+---------------------------
//   any           | cold >= staleMs   | any              | KILL 'stale'
//   no            | cold <  staleMs   | any              | quiet — the run is inside
//                 |                   |                  |   its worst legal silence
//   yes           | cold <  deadMs    | any              | LOUD, no kill (progressing)
//   yes           | cold >= deadMs    | cold <  deadMs   | LOUD, no kill (executing)
//   yes           | cold >= deadMs    | cold >= deadMs   | KILL 'wall-dead'
//                 |                   | or unavailable   |
//
// Two things this table says on purpose:
//   1. The CPU marker cannot veto 'stale'. A hard-frozen event loop burns CPU
//      forever and emits nothing — F67's own case, and the one this guard exists
//      for. CPU-moving means "executing", never "progressing", so it may only
//      delay the deadline kill up to the stale window, never past it.
//   2. Past the deadline with a marker still moving, NOTHING is killed. The
//      in-process fuses (F66), the wall clock and the money cap own bounding a run
//      that is alive; this guard owns processes that are dead. It says so loudly
//      every poll rather than going quiet — the overshoot is still a fact the
//      operator must see, it is just not this process's to end.
const tick = setInterval(() => {
  if (!alive()) { clearInterval(tick); process.exit(0); } // the run finished on its own
  const now = Date.now();
  sampleMarkers(now);
  const cold = coldMs(now);
  const elapsed = now - startedAt;

  if (cold.spine >= staleMs) {
    clearInterval(tick);
    stop('stale', `the spine has not grown for ${Math.round(cold.spine / 1000)}s, past the ${Math.round(staleMs / 1000)}s window sized above the worst LEGAL silence (a full staged close) — the run is producing nothing, whatever it is or is not burning CPU on`, { coldMs: cold.spine });
    return;
  }
  if (wallMs === null || elapsed < wallMs + graceMs) return;

  const overMs = elapsed - (wallMs + graceMs);
  const moving = [];
  if (cold.spine < deadMs) moving.push(`spine (grew ${Math.round(cold.spine / 1000)}s ago, ${spineSeen.size < 0 ? 'no file yet' : `${spineSeen.size} bytes`})`);
  if (cpuOk && /** @type {number} */ (cold.cpu) < deadMs) moving.push(`cpu (${cpuTicks} ticks, moved ${Math.round(/** @type {number} */ (cold.cpu) / 1000)}s ago)`);
  if (moving.length) {
    // LOUD, every poll. hamr: the outside kill checks for activity markers, not the
    // clock alone — so an overrun that is still working gets named, not executed.
    console.error(`[u-watchdog] PAST DEADLINE by ${Math.round(overMs / 1000)}s (wall ${Math.round(wallMs / 1000)}s + ${Math.round(graceMs / 1000)}s close grace) — NOT killing: still ACTIVE on ${moving.join(', ')}. This guard stops DEAD processes; a live run is bounded by its own fuses and its money cap.`);
    return;
  }
  clearInterval(tick);
  stop('wall-dead', `${Math.round(overMs / 1000)}s past the deadline (wall ${Math.round(wallMs / 1000)}s + ${Math.round(graceMs / 1000)}s close grace, which has already funded every legal close stage) AND every activity marker flat for at least ${Math.round(deadMs / 1000)}s — no bytes, no CPU, nothing left that could still be running`, { requestedMs: wallMs, enforcedMs: wallMs + graceMs, pastDeadlineMs: overMs });
}, pollMs);
