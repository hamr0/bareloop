// PANEL-BUILD.md P0 — the spine/gate-audit READ side. Lifted out of
// `scripts/run-replay.mjs` (verbatim logic, moved so it is callable
// in-process rather than only as a script) plus one more reader
// (`readHistoryLog`) for `bareloop history`'s bundle-registry file. This
// module is the IO layer ONLY: it resolves paths, parses JSONL tolerantly
// (a malformed line is counted and skipped, never thrown on), and hands
// parsed records to `src/replay.js`'s pure `replayRun`/`formatReplay`/
// `summarizeForAllLine`/`formatAllLines` — it never recomputes anything
// those already derive (PANEL-BUILD.md P0: "feed replay.js, never
// duplicate it").
//
// NAME-AGNOSTIC spine detection (coordinator fix, 2026-08-25, carried over
// verbatim from the script this replaces): the patient corpus does not agree
// on a filename convention — `u-<id>.jsonl` (run-u), `battery-A1-<id>.jsonl`
// / `l2accept-L1-<id>.jsonl` (batteries), `layer-r-probe-P1-<id>.jsonl`,
// `types-screen-C-<id>.jsonl`, `reuse-<id>.jsonl` (first record
// `reuse-start`), `job2-<id>.jsonl` all measured across the real archive. A
// spine is therefore identified by CONTENT, never by a naming pattern: any
// `*.jsonl` that is not a gate-audit/lag sidecar BY NAME
// (`*-gate-audit.jsonl`, `*.lag.jsonl` — the one convention that IS
// universal, because every spine resolves its own audit sibling this same
// way) and whose records include at least one `job-start` or `run-start` is
// a spine. A `.jsonl` that matches neither test is reported as
// `<name> not-a-spine` — never silently dropped, never silently misread as
// an empty/unknown run.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { replayRun, summarizeForAllLine } from './replay.js';

/**
 * Parse one JSONL file into records, tolerant of a malformed line (counted
 * in `skipped`, never thrown on). Mirrors `scripts/behaviour-readout.mjs`'s
 * own parse.
 * @param {string} file
 * @returns {{records: any[], skipped: number}}
 */
export function parseJsonl(file) {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  /** @type {any[]} */
  const records = [];
  let skipped = 0;
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

/**
 * `true` when `name` (a bare filename, not a path) is a gate-audit or lag
 * sidecar by NAME convention — the one filename rule that holds across the
 * whole archive.
 * @param {string} name
 */
export function isSidecarByName(name) {
  return name.endsWith('-gate-audit.jsonl') || name.endsWith('.lag.jsonl');
}

/**
 * `true` when `records` carries at least one `job-start` (present on every
 * real spine checked, first record or not — a reuse/battery run nests one or
 * more ordinary `runJob` calls inside it) or `run-start` (ralph's own inner
 * loop marker, present on most but not all real spines).
 * @param {any[]} records
 */
export function looksLikeSpine(records) {
  return records.some((r) => r && (r.type === 'job-start' || r.type === 'run-start'));
}

/**
 * `<name>.jsonl` → `<name>-gate-audit.jsonl` in the same directory, and the
 * bare run id for display — the run id lives only in the filename (no spine
 * record carries it; see `src/replay.js`'s header). A leading `u-` (the
 * run-u convention) is stripped; every other prefix (`battery-A1-`,
 * `reuse-`, …) is kept verbatim, since it is the only thing distinguishing
 * that run from its siblings in the same directory.
 * @param {string} spinePath
 * @returns {{runId: string, auditPath: string|null}}
 */
export function resolveSiblings(spinePath) {
  const dir = dirname(spinePath);
  const base = basename(spinePath);
  const stem = base.replace(/\.jsonl$/, '');
  const runId = stem.startsWith('u-') ? stem.slice(2) : stem;
  const auditPath = join(dir, `${stem}-gate-audit.jsonl`);
  return { runId, auditPath: existsSync(auditPath) ? auditPath : null };
}

/**
 * Read one run's spine (+ its gate-audit sidecar, when present) off disk and
 * hand both to {@link replayRun}. Read-only, $0, mints no verdict.
 * @param {string} spinePath absolute or cwd-relative path to a `.jsonl` spine
 * @param {{preParsedSpine?: {records: any[], skipped: number}, skipAudit?: boolean}} [opts]
 *   `preParsedSpine`: avoids a second parse of the same file when the caller
 *   ({@link listSpines}) already read it once to run {@link looksLikeSpine}.
 *   `skipAudit` (PR #23 review item 5, 2026-08-26, carried over): a
 *   directory listing never opens the gate-audit sidecar at all —
 *   `summarizeForAllLine` reads none of the fields that sidecar feeds inside
 *   `replayRun`, so reading every run's sidecar in a directory listing was
 *   pure unused I/O, multiplied by every spine found.
 * @returns {ReturnType<typeof replayRun>}
 */
export function replayOne(spinePath, opts = {}) {
  const { preParsedSpine, skipAudit = false } = opts;
  const { runId, auditPath } = resolveSiblings(spinePath);
  const spine = preParsedSpine ?? parseJsonl(spinePath);
  const audit = (!skipAudit && auditPath) ? parseJsonl(auditPath) : { records: [], skipped: 0 };
  const summary = replayRun(spine.records, audit.records, { runId });
  summary.skipped += spine.skipped + audit.skipped;
  return summary;
}

/**
 * List every spine found directly in `dir` (not recursive — same as the
 * script this replaces): one entry per `.jsonl` file that is not a sidecar
 * by name, each either `{kind:'spine', row}` ({@link summarizeForAllLine}'s
 * row) or `{kind:'not-a-spine', name}` when the file's content doesn't look
 * like a spine. Feeds `formatAllLines` (`src/replay.js`) for the printed
 * table — this function does no formatting of its own, only IO + detection.
 * @param {string} dir
 * @returns {Array<{kind: 'spine', row: ReturnType<typeof summarizeForAllLine>}|{kind: 'not-a-spine', name: string}>}
 */
export function listSpines(dir) {
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl') && !isSidecarByName(f))
    .sort();
  return candidates.map((f) => {
    const path = join(dir, f);
    const spine = parseJsonl(path);
    if (!looksLikeSpine(spine.records)) return { kind: /** @type {const} */ ('not-a-spine'), name: f };
    const summary = replayOne(path, { preParsedSpine: spine, skipAudit: true });
    return { kind: /** @type {const} */ ('spine'), row: summarizeForAllLine(summary) };
  });
}

/**
 * Read a bundle's `history.jsonl` (one `bareloop run` row per line, written
 * by `appendHistory` in `src/bundle.js`) — the single reader for this file,
 * replacing `src/cli.js`'s own hand-rolled `readFileSync`/split. Tolerant of
 * a malformed line the same way {@link parseJsonl} is (counted in
 * `skipped`, never thrown on).
 * @param {string} file absolute path to `history.jsonl`
 * @returns {{rows: any[], skipped: number}}
 */
export function readHistoryLog(file) {
  const { records, skipped } = parseJsonl(file);
  return { rows: records, skipped };
}
