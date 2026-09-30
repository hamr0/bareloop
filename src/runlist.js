// PANEL-BUILD.md P1 (2026-09-24 rulings) — "one home for runs": a single LIST
// of every run bareloop has started, never a move of the runs themselves.
// Patient copies stay exactly where they already live (`bareloop-patients/…`
// for run-u, `<bundleDir>/runs/<runid>/` for `bareloop run`); jobs stay in
// `jobs/` (moving them into the home is deferred to P3, hamr picked "A").
// This module is the ONE place that list lives: `~/.config/bareloop/
// runs.jsonl` — the same directory the keys file (PRD §7d) lives in, kept
// separate from any repo tree (secrets/run metadata never enter the tree,
// the spine, or a repo's own configs).
//
// One JSON object per line: `{ at, runid, job, spine, patient, via }`.
// `spine`/`patient` are always ABSOLUTE paths (or `patient: null` when the
// caller doesn't know one) — a relative path here would resolve differently
// depending on who later reads the file. `via` says how the row was minted:
// `'run-u'` (src/userrun.js, the person-path run), `'bundle'`
// (src/userrun.js's bundle door, `bareloop run`), or `'backfill'` (`bareloop runs
// backfill`, reconstructed from an archived spine already on disk).
//
// SECRETS: a row carries only paths/ids/names — never a key, a prompt, or any
// value read out of the run's own tree. Nothing here reads a spine's payload
// beyond `job`/`ts` on its `job-start` record.
//
// No new env var: grepped the tree for an existing HOME-override convention
// before adding one (2026-09-24) — none exists (`src/tools.js`'s
// `expandHome` calls `os.homedir()` directly, same as every other caller).
// This module follows that precedent and adds an injectable `home` param for
// tests instead, the same test-seam shape `deps.provider` already is
// elsewhere in this codebase.

import {
  existsSync, mkdirSync, appendFileSync, chmodSync, readdirSync, statSync,
  readFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  join, dirname, basename, resolve,
} from 'node:path';
import { parseJsonl, isSidecarByName, looksLikeSpine, resolveSiblings } from './replayio.js';

/**
 * `~/.config/bareloop` (or the injected override) — the one home directory
 * for both the keys file (PRD §7d, not this module's concern) and the run
 * list.
 * @param {string} [override] test seam; a caller in production never passes it
 * @returns {string}
 */
export function runlistHome(override) {
  return override ?? join(homedir(), '.config', 'bareloop');
}

/**
 * `<home>/runs.jsonl`.
 * @param {string} [home]
 * @returns {string}
 */
export function runlistPath(home) {
  return join(runlistHome(home), 'runs.jsonl');
}

/**
 * @typedef {{ at: string, runid: string, job: string, spine: string, patient: string|null, via: 'run-u'|'bundle'|'backfill', pid?: number, capUsd?: number }} RunRow
 * `pid`/`capUsd` (optional; older and backfilled rows carry neither): the runner's process id and the
 * leg's $ cap — what the monthly limit holds while that pid is a live bareloop runner (src/monthly.js).
 */

/**
 * Append one row to the run list, mkdir -p'ing the home directory first.
 * IDEMPOTENT BY RUNID: a row already carrying `row.runid` is never
 * duplicated (a resume, or a re-run of `backfill`, must not double-list one
 * run) — the file is read once first to check.
 *
 * Perms: the home directory is created `0700` and the file kept `0600`
 * (chmod'd after every append, in case it pre-existed with wider perms) —
 * the same "outside any repo, keys-file-adjacent" posture PRD §7d states for
 * `.env` in this same directory, even though this file carries no secret
 * itself.
 *
 * THROWS on any IO failure (permission denied, disk full, …) — the caller
 * (a live run) is required to catch this and continue the run rather than
 * let a list-append failure abort paid work (hamr's rule: a panel list must
 * never block real work). This function itself does not swallow, so a
 * direct caller (e.g. `backfillRuns`, a $0 path) sees the real error.
 * @param {RunRow} row
 * @param {{ home?: string }} [opts]
 * @returns {{ appended: boolean, reason?: 'duplicate-runid' }}
 */
export function appendRun(row, opts = {}) {
  const home = runlistHome(opts.home);
  const path = runlistPath(opts.home);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const { records } = parseJsonl(path);
    // only RUN rows count: a settled/released event names the same runid for another purpose
    if (records.some((r) => r && !r.type && r.runid === row.runid)) {
      return { appended: false, reason: 'duplicate-runid' };
    }
  }
  appendFileSync(path, `${JSON.stringify(row)}\n`);
  try { chmodSync(path, 0o600); } catch { /* best-effort perms; the append above already landed */ }
  return { appended: true };
}

/**
 * @typedef {{ runid: string, type: 'settled'|'released', by: string, at: string, reason?: string, spentUsd?: number, spendComplete?: boolean }} RunEvent
 * A claim's write-back, appended (never rewritten) beside the run rows. `settled` = the run's claim on the
 * monthly limit is over (`spentUsd`/`spendComplete` are its final figure, `by` is WHO wrote it: the run itself
 * at its `job-end`, or the next run that found its process gone, `reason: 'process gone'`). `released` = the
 * claim was taken and then given back unspent, its run never started. The month's totals keep reading real
 * spend off the spines; an event only releases the hold and records who wrote it.
 */

/**
 * Append one {@link RunEvent}. Not locked: one short line, one append. THROWS on IO failure.
 * @param {RunEvent} event
 * @param {{ home?: string }} [opts]
 * @returns {void}
 */
export function appendRunEvent(event, opts = {}) {
  const path = runlistPath(opts.home);
  mkdirSync(runlistHome(opts.home), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  try { chmodSync(path, 0o600); } catch { /* best-effort perms */ }
}

/**
 * Tolerant reader — reuses {@link parseJsonl} (never a second hand-rolled
 * parser). An absent file reads as an empty list, not an error: a fresh
 * install has never run `appendRun` yet. FOLDS the file: `rows` are the RUNS
 * only (an event line is never listed as a run, and a run whose claim was
 * `released` never started, so it is not listed either); `events` are the
 * write-backs, in file order.
 * @param {{ home?: string }} [opts]
 * @returns {{ rows: RunRow[], skipped: number, events: RunEvent[] }}
 */
export function readRunList(opts = {}) {
  const path = runlistPath(opts.home);
  if (!existsSync(path)) return { rows: [], skipped: 0, events: [] };
  const { records, skipped } = parseJsonl(path);
  // the FIRST settle for a runid is authoritative: two runs may both close the same dead claim, and the
  // second note is a duplicate (a `released` line likewise); file order decides, later copies are ignored
  const seen = new Set();
  /** @type {RunEvent[]} */
  const events = records.filter((r) => {
    if (!r || (r.type !== 'settled' && r.type !== 'released')) return false;
    const key = `${r.type}:${r.runid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const released = new Set(events.filter((e) => e.type === 'released').map((e) => e.runid));
  const rows = records.filter((r) => r && !r.type && !released.has(r.runid));
  return { rows, skipped, events };
}

/**
 * Is this pid a live bareloop runner? `process.kill(pid, 0)` says whether the
 * pid exists (EPERM = it exists, just not ours); `/proc/<pid>/cmdline` says whether it is a
 * bareloop runner — a recycled pid that now belongs to some other program is NOT. A runner is
 * a node executable (argv[0] is `node`, `nodejs`, `node22`, ...) with a later argv entry named
 * `bareloop`, `bareloop.mjs`, `run-u.mjs` or `u-watchdog.mjs` (the basename, so the npm bin
 * symlink counts), or a process whose argv[0] is itself one of those names. A non-node program
 * that merely has such a name in its arguments (`nvim /x/bareloop`, `git -C /x/bareloop`) is not
 * a runner. Residual, accepted: a recycled pid that is a node program with such an argument
 * still reads as a runner. The wrong direction to err is "not a runner" on a real live run — it
 * would release that run's cap. Where `/proc` is unreadable (not Linux, or not ours) the
 * existence test alone decides: alive. The ONE spelling — the monthly limit's holds, and
 * `--resume`'s old-pid check share it.
 * @param {number} pid
 * @returns {boolean}
 */
export function isLiveRunner(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (/** @type {any} */ e) { if (e?.code !== 'EPERM') return false; }
  /** @type {string|null} */
  let cmdline = null;
  try { cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { /* no /proc, or not ours */ }
  if (cmdline === null) return true;
  const names = ['bareloop', 'bareloop.mjs', 'run-u.mjs', 'u-watchdog.mjs'];
  const [argv0 = '', ...rest] = cmdline.split('\0');
  const first = basename(argv0);
  if (names.includes(first)) return true;
  return first.startsWith('node') && rest.some((a) => names.includes(basename(a)));
}

/**
 * The runid a spine file names, for BOTH layouts this scan understands:
 * the bundle layout (`.../runs/<runid>/spine.jsonl` — the runid lives in the
 * directory name, since every bundle run is literally named `spine.jsonl`)
 * and every other convention ({@link resolveSiblings}'s filename-based
 * read, e.g. `u-<id>.jsonl`).
 * @param {string} spinePath
 * @returns {string}
 */
function runidForSpine(spinePath) {
  const base = basename(spinePath);
  const parent = dirname(spinePath);
  if (base === 'spine.jsonl' && basename(dirname(parent)) === 'runs') {
    return basename(parent);
  }
  return resolveSiblings(spinePath).runId;
}

// DIED (hamr's ruling B, 2026-09-25): a run with no `job-end` never shares
// the failed glyph — [✗] stays reserved for a run whose close/arbiter
// actually rendered a "no" (a real result). A spine that just stops, with
// no ending ever recorded, is a DIFFERENT fact (killed, crashed, or the
// machine slept) and gets its own [?] glyph. The distinguishing signal is
// the spine FILE's own mtime, never wall-clock "now minus job-start" (a
// resumed/paused run can legitimately sit quiet for a long time without
// having died): still fresh (written to within this window) reads as the
// existing `running` [▶] state; older than this reads as died. Tighten-only,
// named so a future change is a deliberate, visible edit. Lives here (not in
// the panel) because the monthly limit reads the same rule (src/monthly.js).
export const DIED_MTIME_MS = 10 * 60 * 1000;

// A backfill scan of a real patients directory can be arbitrarily deep
// (person-path runs archive several levels down: `<dir>/<proj>/out/
// source-<x>/<proj>-bareloop/u-<id>.jsonl`, 4 levels under the dir a person
// actually points `backfill` at) — a non-recursive/immediate-subdir-only
// scan silently misses every run nested past that first level (measured:
// the newest real run in a 2026-09-09-capped panel was 12 days stale while
// real runs existed through 2026-09-21). Tighten-only cap, named so a future
// change to it is a deliberate, visible edit, never a silent number bump.
export const MAX_BACKFILL_DEPTH = 6;

/**
 * Every `.jsonl` file under `dir`, recursively, that is not a sidecar by
 * name — bounded to {@link MAX_BACKFILL_DEPTH} directory levels below `dir`
 * itself (`dir` is depth 0). Never descends into `node_modules` or `.git`
 * (a copied repo source or a bundle's own worktree can carry either, and
 * neither ever holds a real archived spine worth scanning). Never follows a
 * symlinked directory (a symlink is skipped outright — `Dirent.isDirectory`/
 * `isFile` both read false for one, since `readdirSync` with `withFileTypes`
 * types by `lstat`, not the link's target — so it silently falls out of
 * both branches below rather than needing a separate check).
 * @param {string} dir
 * @param {number} [maxDepth]
 * @returns {string[]}
 */
function jsonlFilesIn(dir, maxDepth = MAX_BACKFILL_DEPTH) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {string} d @param {number} depth */
  function walk(d, depth) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (depth < maxDepth) walk(join(d, entry.name), depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl') && !isSidecarByName(entry.name)) {
        found.add(join(d, entry.name));
      }
    }
  }
  if (existsSync(dir)) walk(dir, 0);
  return [...found].sort();
}

/**
 * `bareloop runs backfill <dir>` — recursively scan `dir` (bounded to
 * {@link MAX_BACKFILL_DEPTH} levels, never into `node_modules`/`.git`,
 * never following a symlinked directory) for archived spine files — both
 * the free-standing layout (e.g. `<dir>/<x>/u-<id>.jsonl`, at any depth) and
 * the bundle layout (`<dir>/.../runs/<runid>/spine.jsonl`) — and add one row
 * per spine whose RESOLVED ABSOLUTE PATH is not already in the list.
 *
 * F197: dedup is by spine path, never by `runidForSpine`'s own derived
 * runid. A spine carrying no `runid` field falls back to a filename-derived
 * id (e.g. `run` for a `run.jsonl` with no runid inside) — a SECOND such
 * file elsewhere (same basename, different directory: not a rare shape,
 * `bareloop-patients/quickstart-proof/run.jsonl` is a real example) is a
 * DIFFERENT run, not a duplicate, and dedup-by-runid would have silently
 * dropped it. When the derived runid collides with one already in the list
 * (pre-existing or added earlier in this same pass), the row's OWN runid is
 * disambiguated (`<base>~2`, `<base>~3`, …) so every row keeps a runid the
 * panel's `/api/runs/:runid` lookup can resolve unambiguously — see
 * {@link RUNID_RE} in `src/panel/server.js`, updated to allow `~`.
 *
 * IDEMPOTENT: running twice adds nothing the second time (the resolved-path
 * set already contains every spine this pass would otherwise re-add). Never
 * silent about what it found: every candidate `.jsonl` is bucketed into
 * exactly one of added / already listed / skipped (not a spine, or
 * unreadable).
 * @param {string} dir
 * @param {{ home?: string }} [opts]
 * @returns {{ added: number, alreadyListed: number, skipped: number, addedRows: RunRow[] }}
 */
export function backfillRuns(dir, opts = {}) {
  if (!existsSync(dir)) throw new Error(`backfillRuns: no such directory: ${dir}`);

  const candidates = new Set(jsonlFilesIn(dir));

  const { rows: existingRows } = readRunList(opts);
  const knownPaths = new Set(existingRows.map((r) => (r && typeof r.spine === 'string' ? resolve(r.spine) : null)).filter(Boolean));
  const knownRunids = new Set(existingRows.map((r) => r && r.runid).filter(Boolean));

  let added = 0;
  let alreadyListed = 0;
  let skipped = 0;
  /** @type {RunRow[]} */
  const addedRows = [];

  for (const spinePath of [...candidates].sort()) {
    const resolvedPath = resolve(spinePath);
    if (knownPaths.has(resolvedPath)) { alreadyListed += 1; continue; }
    let parsed;
    try {
      parsed = parseJsonl(spinePath);
    } catch {
      skipped += 1;
      continue;
    }
    if (!looksLikeSpine(parsed.records)) { skipped += 1; continue; }
    const baseRunid = runidForSpine(spinePath);
    let runid = baseRunid;
    if (knownRunids.has(runid)) {
      let n = 2;
      while (knownRunids.has(`${baseRunid}~${n}`)) n += 1;
      runid = `${baseRunid}~${n}`;
    }
    const jobStart = parsed.records.find((r) => r && r.type === 'job-start') ?? null;
    const job = typeof jobStart?.job === 'string' ? jobStart.job : '(unknown job)';
    // `at`: the job-start record's own `ts` (stamped by src/spine.js's
    // `makeSpine`) when present; else the earliest timestamped record on the
    // spine; else the file's own mtime, honestly — never a fabricated "now".
    const earliestTs = parsed.records.find((r) => typeof r?.ts === 'string')?.ts ?? null;
    const at = typeof jobStart?.ts === 'string' ? jobStart.ts
      : earliestTs ?? statSync(spinePath).mtime.toISOString();
    // `patient`: no spine record carries the run's workdir (verified against
    // src/run.js's own `job-start` emit, 2026-09-24) — reported honestly as
    // `null` rather than guessed from directory layout, which does not hold
    // across the archive's several naming conventions (see src/replayio.js's
    // own file-header comment).
    const row = {
      at, runid, job, spine: resolvedPath, patient: null, via: /** @type {const} */ ('backfill'),
    };
    const result = appendRun(row, opts);
    if (result.appended) {
      added += 1; addedRows.push(row); knownPaths.add(resolvedPath); knownRunids.add(runid);
    } else {
      // only reachable if two candidates in the SAME pass resolve to the
      // same path under different spellings, or an unexpected runid clash
      // appendRun itself caught — either way, honestly counted, never lost.
      alreadyListed += 1;
    }
  }

  return { added, alreadyListed, skipped, addedRows };
}

/**
 * One printable line per row for `bareloop runs` (no subcommand): `job
 * (runid) · date · spine path`, with `file missing` appended when the row's
 * `spine` no longer exists on disk (an archive moved/pruned since the row
 * was written — never silently listed as if it were still there).
 * @param {RunRow} row
 * @returns {string}
 */
export function formatRunRow(row) {
  const date = typeof row.at === 'string' ? row.at.slice(0, 10) : '(unknown date)';
  const missing = existsSync(row.spine) ? '' : ' — file missing';
  return `${row.job} (${row.runid}) · ${date} · ${row.spine}${missing}`;
}
