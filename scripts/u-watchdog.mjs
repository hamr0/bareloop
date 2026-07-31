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
//   - it reads bytes, not meaning (cost is one stat(2) per poll)
//
// TWO triggers, ONE reconciled decision (hamr's ruling, 2026-07-30: "the kill from
// outside should check for activity/bytes or other markers for activity, not a
// silent kill"):
//   STALE  no progress for longer than the worst LEGAL silence → the run is wedged
//   DEAD   past the deadline (wall + stages × close timeout) AND the spine flat for
//          the whole dead window → the process is producing nothing, and its own
//          deadline has already funded every legal silence
// Past the deadline but still ACTIVE is NOT a kill any more. The in-process fuses
// and the money cap own bounding a run that is alive; this guard owns processes
// that are dead. A live run is never killed from outside purely by the clock —
// that is the point of the change, and the previous behaviour could destroy a
// verdict mid-close. Overshoot is reported LOUD on every poll instead. The full
// decision table sits above the decision code.
//
// The kill is RECORDED next to the spine, and it is never silent: before the
// signal goes out this process says which deadline passed, which marker it
// checked, its last value and age, and why it judged the process dead. A run
// stopped by the arbiter must never read as a mystery crash — that is the
// distinction between a governance stop and a casualty, and it decides whether the
// row is evidence or noise (F45/F48).
//
// Usage:
//   node scripts/u-watchdog.mjs --spine <path> --pid <n>
//        [--stale-ms N] [--wall-ms N] [--grace-ms N] [--dead-ms N] [--poll-ms N]
import { statSync, writeFileSync } from 'node:fs';

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
// How long the spine must be flat, PAST the deadline, before the process is judged
// dead. Derived, not chosen: it is the in-process stall fuse's own window (F66,
// hamr's 5 minutes). Past the deadline the grace has ALREADY paid
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

// ── THE ACTIVITY MARKER ─────────────────────────────────────────────────────────
// "Is it dead" is answered by EVIDENCE, never by the clock alone. ONE marker:
//
//   spine  PROGRESS. Bytes reaching the run's own append-only log. Growth here is
//          the run doing the job. One stat(2): size OR mtime moving counts.
//
// ONE on purpose. A second, CPU-liveness marker (utime+stime+cutime+cstime from
// /proc/<pid>/stat) was built here and then MEASURED broken in BOTH directions, so
// it is deleted rather than kept as decoration:
//   - it read DEAD on a live run. A close runs its suite in a CHILD, and a child's
//     ticks are credited to the parent only when the parent REAPS it — so the
//     busiest minutes of a multi-minute close show a parent whose own ticks never
//     move.
//   - it read ALIVE on a dead one. run-u's event-loop lag sampler wakes this very
//     process every second, moving its ticks roughly every 3.3s; at the production
//     constants (deadMs 300_000 against pollMs 5_000) the marker could therefore
//     never go flat, and the deadline kill could effectively never fire. The kill
//     tests only passed at --dead-ms 500 — three orders of magnitude below what
//     production runs on.
// An instrument that cannot see the variable makes every reading unusable, and a
// veto that is always ON is not a safety, it is a disarmed trigger. hamr's ruling,
// 2026-07-30: "keep what is simpler/available" — the spine, which is the marker
// that actually distinguishes progress from silence.

/** spine size+mtime in one stat(2). A missing file reads as the watchdog's own
 * start: a run that wedges BEFORE its first event is the most stalled run there
 * is, and treating "no file" as "no news is good news" would blind the guard to
 * exactly that case. */
const readSpine = () => { try { const st = statSync(spine); return { mtimeMs: st.mtimeMs, size: st.size }; } catch { return { mtimeMs: startedAt, size: -1 }; } };

let spineSeen = readSpine();
let spineMovedAt = spineSeen.mtimeMs;

/** advance the marker's last-movement stamp. Called once per poll, before any
 * decision reads it. */
function sampleMarkers(/** @type {number} */ now) {
  const st = readSpine();
  if (st.size !== spineSeen.size) spineMovedAt = now;
  if (st.mtimeMs > spineMovedAt) spineMovedAt = st.mtimeMs;
  spineSeen = st;
}
/** what every log line and every kill record says about the marker: its value and
 * its age. Kept under a `markers` key — the record is a read-once forensic
 * artifact, and a reader comparing an old kill to a new one should see the shape
 * hold and the CPU entry simply be gone. */
const markerReport = (/** @type {number} */ now) => ({
  spine: { path: spine, bytes: spineSeen.size < 0 ? 'no file yet' : spineSeen.size, lastMovedAt: iso(spineMovedAt), coldMs: now - spineMovedAt },
});
const spineColdMs = (/** @type {number} */ now) => now - spineMovedAt;

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
  console.error(`[u-watchdog]   marker checked: ${JSON.stringify(markers)}`);
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  // SIGTERM lets the run flush its spine. A wedged event loop cannot run a signal
  // handler, so SIGKILL is the one that actually lands — but only after giving the
  // recoverable case its chance.
  setTimeout(() => {
    if (alive()) { try { process.kill(pid, 'SIGKILL'); } catch { /* raced */ } }
    process.exit(1);
  }, 10_000);
}

console.error(`[u-watchdog] watching pid ${pid} — marker [spine], stale ${Math.round(staleMs / 1000)}s${wallMs ? `, wall ${Math.round(wallMs / 1000)}s (+${Math.round(graceMs / 1000)}s grace, then ${Math.round(deadMs / 1000)}s of a flat spine)` : ', no wall'}`);

// ── THE DECISION ────────────────────────────────────────────────────────────────
// One table, evaluated every poll after the marker is sampled. "Past deadline"
// means elapsed >= wallMs + graceMs, where the grace is stages × close timeout.
//
//   past deadline | spine (progress)  | action
//   --------------+-------------------+--------------------------------------------
//   any           | cold >= staleMs   | KILL 'stale'
//   no            | cold <  staleMs   | quiet — the run is inside its worst legal
//                 |                   |   silence
//   yes           | cold <  deadMs    | LOUD, no kill (still progressing)
//   yes           | cold >= deadMs    | KILL 'wall-dead'
//
// Two things this table says on purpose:
//   1. Only BYTES hold a kill off. Nothing else is consulted — in particular not
//      CPU, which was measured unable to tell a working process from a spun-out
//      one and, worse, unable to go flat at all at the production constants (see
//      THE ACTIVITY MARKER above). A hard-frozen event loop burns 100% CPU forever
//      and emits nothing; it is F67's own case, and it must die on both triggers.
//   2. Past the deadline with the spine still moving, NOTHING is killed. The
//      in-process fuses (F66), the wall clock and the money cap own bounding a run
//      that is alive; this guard owns processes that are dead. It says so loudly
//      every poll rather than going quiet — the overshoot is still a fact the
//      operator must see, it is just not this process's to end.
const tick = setInterval(() => {
  if (!alive()) { clearInterval(tick); process.exit(0); } // the run finished on its own
  const now = Date.now();
  sampleMarkers(now);
  const spineCold = spineColdMs(now);
  const elapsed = now - startedAt;

  if (spineCold >= staleMs) {
    clearInterval(tick);
    stop('stale', `the spine has not grown for ${Math.round(spineCold / 1000)}s, past the ${Math.round(staleMs / 1000)}s window sized above the worst LEGAL silence (a full staged close) — the run is producing nothing, whatever it is or is not burning CPU on`, { coldMs: spineCold });
    return;
  }
  if (wallMs === null || elapsed < wallMs + graceMs) return;

  const overMs = elapsed - (wallMs + graceMs);
  if (spineCold < deadMs) {
    // LOUD, every poll. hamr: the outside kill checks for activity/bytes, not the
    // clock alone — so an overrun that is still working gets named, not executed.
    console.error(`[u-watchdog] PAST DEADLINE by ${Math.round(overMs / 1000)}s (wall ${Math.round(wallMs / 1000)}s + ${Math.round(graceMs / 1000)}s close grace) — NOT killing: still ACTIVE on spine (grew ${Math.round(spineCold / 1000)}s ago, ${spineSeen.size < 0 ? 'no file yet' : `${spineSeen.size} bytes`}). This guard stops DEAD processes; a live run is bounded by its own fuses and its money cap.`);
    return;
  }
  clearInterval(tick);
  stop('wall-dead', `${Math.round(overMs / 1000)}s past the deadline (wall ${Math.round(wallMs / 1000)}s + ${Math.round(graceMs / 1000)}s close grace, which has already funded every legal close stage) AND the spine flat for at least ${Math.round(deadMs / 1000)}s — no bytes are reaching the run's own log, so there is nothing left that could still be producing a verdict`, { requestedMs: wallMs, enforcedMs: wallMs + graceMs, pastDeadlineMs: overMs });
}, pollMs);
