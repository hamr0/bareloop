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
//   - it uses mtime, not content (an append is an append; cost is one stat(2))
//
// Two independent triggers, because they catch different failures:
//   STALE  the spine stopped growing        → the run is wedged
//   WALL   elapsed exceeded the cap + grace → the run is out of time, however
//          healthy it looks. hamr: "outside shell timer is running regardless of
//          whats happening inside."
//
// The kill is RECORDED next to the spine. A run stopped by the arbiter must never
// read as a mystery crash — that is the distinction between a governance stop and
// a casualty, and it decides whether the row is evidence or noise (F45/F48).
//
// Usage:
//   node scripts/u-watchdog.mjs --spine <path> --pid <n>
//        [--stale-ms N] [--wall-ms N] [--grace-ms N] [--poll-ms N]
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
  console.error('usage: u-watchdog.mjs --spine <path> --pid <n> [--stale-ms N] [--wall-ms N] [--grace-ms N] [--poll-ms N]');
  process.exit(2);
}
// Defaults are DERIVED, not chosen: the stale window is twice the in-process fuse
// (F66, hamr's 5 min), so the inner guard always gets its three tries first and
// this one only speaks when the inner one could not. It stays a flag because a
// threshold is arbiter territory — a number the agent picks off its own sample is
// fitted, not set.
const staleMs = num('stale-ms', 600_000) ?? 600_000;
const wallMs = num('wall-ms', null);
// The wall's grace covers the close, which legitimately runs after the last round
// (the litectx suite alone is ~55s). Killing during a close would destroy a real
// verdict to save a few seconds.
const graceMs = num('grace-ms', 900_000) ?? 900_000;
const pollMs = num('poll-ms', 5_000) ?? 5_000;

const startedAt = Date.now();
const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** last spine growth, or the watchdog's own start when the file does not exist
 * yet: a run that wedges BEFORE its first event is the most stalled run there is,
 * and treating a missing file as "no news is good news" would blind the guard to
 * exactly that case. */
const lastBeat = () => { try { return statSync(spine).mtimeMs; } catch { return startedAt; } };

function stop(/** @type {string} */ reason, /** @type {object} */ detail) {
  const record = {
    watchdog: 'u-watchdog', reason, killed: true, pid, spine,
    at: new Date().toISOString(),
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
    staleMs, wallMs, graceMs,
    lastEventAt: new Date(lastBeat()).toISOString(),
    ...detail,
  };
  // Write the verdict BEFORE the kill: if this process dies mid-stop, the record
  // of why must already be on disk. A kill with no explanation is the failure
  // mode this whole file exists to prevent.
  try { writeFileSync(`${spine}.watchdog.json`, `${JSON.stringify(record, null, 2)}\n`); } catch { /* best-effort */ }
  console.error(`[u-watchdog] ${reason}: killing pid ${pid} — ${JSON.stringify(detail)}`);
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  // SIGTERM lets the run flush its spine. A wedged event loop cannot run a signal
  // handler, so SIGKILL is the one that actually lands — but only after giving the
  // recoverable case its chance.
  setTimeout(() => {
    if (alive()) { try { process.kill(pid, 'SIGKILL'); } catch { /* raced */ } }
    process.exit(1);
  }, 10_000);
}

console.error(`[u-watchdog] watching pid ${pid} — stale ${Math.round(staleMs / 1000)}s${wallMs ? `, wall ${Math.round(wallMs / 1000)}s (+${Math.round(graceMs / 1000)}s grace)` : ', no wall'}`);

const tick = setInterval(() => {
  if (!alive()) { clearInterval(tick); process.exit(0); } // the run finished on its own
  const now = Date.now();
  const cold = now - lastBeat();
  if (cold >= staleMs) { clearInterval(tick); stop('stale', { coldMs: cold }); return; }
  if (wallMs !== null && now - startedAt >= wallMs + graceMs) {
    clearInterval(tick);
    stop('wall', { requestedMs: wallMs, enforcedMs: wallMs + graceMs });
  }
}, pollMs);
