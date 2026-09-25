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
// (src/cli.js:doRun, `bareloop run`), or `'backfill'` (`bareloop runs
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
} from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
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
 * @typedef {{ at: string, runid: string, job: string, spine: string, patient: string|null, via: 'run-u'|'bundle'|'backfill' }} RunRow
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
    if (records.some((r) => r && r.runid === row.runid)) {
      return { appended: false, reason: 'duplicate-runid' };
    }
  }
  appendFileSync(path, `${JSON.stringify(row)}\n`);
  try { chmodSync(path, 0o600); } catch { /* best-effort perms; the append above already landed */ }
  return { appended: true };
}

/**
 * Tolerant reader — reuses {@link parseJsonl} (never a second hand-rolled
 * parser). An absent file reads as an empty list, not an error: a fresh
 * install has never run `appendRun` yet.
 * @param {{ home?: string }} [opts]
 * @returns {{ rows: RunRow[], skipped: number }}
 */
export function readRunList(opts = {}) {
  const path = runlistPath(opts.home);
  if (!existsSync(path)) return { rows: [], skipped: 0 };
  const { records, skipped } = parseJsonl(path);
  return { rows: records, skipped };
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

/**
 * Every `.jsonl` file sitting directly in `dir` that is not a sidecar by
 * name — the same non-recursive listing `listSpines` (src/replayio.js) does,
 * duplicated here rather than imported because `listSpines` also runs
 * `replayOne` per file (full replay summary) and this scan only needs the
 * raw parsed records to test `looksLikeSpine` — a directory of a few hundred
 * archived spines should not pay for a full gate-audit-adjacent replay just
 * to be scanned for backfill.
 * @param {string} dir
 * @returns {string[]}
 */
function jsonlFilesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl') && !isSidecarByName(f))
    .map((f) => join(dir, f))
    .sort();
}

/**
 * `bareloop runs backfill <dir>` — scan `dir` and its immediate
 * subdirectories for archived spine files (both the free-standing layout,
 * e.g. `<dir>/<x>/u-<id>.jsonl`, and the bundle layout,
 * `<dir>/<x>/runs/<runid>/spine.jsonl`, plus `dir` itself in either shape)
 * and add one row per spine whose runid is not already in the list.
 * IDEMPOTENT: running twice adds nothing the second time (the same
 * runid-dedup `appendRun` already does). Never silent about what it found:
 * every candidate `.jsonl` is bucketed into exactly one of added / already
 * listed / skipped (not a spine, or unreadable).
 * @param {string} dir
 * @param {{ home?: string }} [opts]
 * @returns {{ added: number, alreadyListed: number, skipped: number, addedRows: RunRow[] }}
 */
export function backfillRuns(dir, opts = {}) {
  if (!existsSync(dir)) throw new Error(`backfillRuns: no such directory: ${dir}`);

  /** @type {Set<string>} */
  const candidates = new Set();
  const roots = [dir];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) roots.push(join(dir, entry.name));
  }
  for (const root of roots) {
    for (const f of jsonlFilesIn(root)) candidates.add(f);
    const runsDir = join(root, 'runs');
    if (existsSync(runsDir)) {
      for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const spinePath = join(runsDir, entry.name, 'spine.jsonl');
        if (existsSync(spinePath)) candidates.add(spinePath);
      }
    }
  }

  const { rows: existingRows } = readRunList(opts);
  const known = new Set(existingRows.map((r) => r && r.runid).filter(Boolean));

  let added = 0;
  let alreadyListed = 0;
  let skipped = 0;
  /** @type {RunRow[]} */
  const addedRows = [];

  for (const spinePath of [...candidates].sort()) {
    let parsed;
    try {
      parsed = parseJsonl(spinePath);
    } catch {
      skipped += 1;
      continue;
    }
    if (!looksLikeSpine(parsed.records)) { skipped += 1; continue; }
    const runid = runidForSpine(spinePath);
    if (known.has(runid)) { alreadyListed += 1; continue; }
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
    const row = { at, runid, job, spine: spinePath, patient: null, via: /** @type {const} */ ('backfill') };
    const result = appendRun(row, opts);
    if (result.appended) { added += 1; addedRows.push(row); known.add(runid); }
    else alreadyListed += 1;
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
