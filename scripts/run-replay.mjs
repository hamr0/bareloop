// Generic run replay CLI (PRD build-list TODO #6) — point it at a run's
// spine file and get the whole story back. Reads only, mints no verdict,
// touches no spine.
//
//   node scripts/run-replay.mjs <spine.jsonl>
//   node scripts/run-replay.mjs --all <dir>
//
// The single-run form resolves the sibling `-gate-audit.jsonl` automatically
// and prints `formatReplay`'s one-page report. `--all <dir>` lists every
// spine found directly in that directory: id, outcome, spend, stop reason.
//
// NAME-AGNOSTIC (coordinator fix, 2026-08-25): the patient corpus does not
// agree on a filename convention — `u-<id>.jsonl` (run-u), `battery-A1-<id>.jsonl`
// / `l2accept-L1-<id>.jsonl` (batteries), `layer-r-probe-P1-<id>.jsonl`,
// `types-screen-C-<id>.jsonl`, `reuse-<id>.jsonl` (first record `reuse-start`),
// `job2-<id>.jsonl` all measured across the real archive (see the report this
// change shipped with). A spine is therefore identified by CONTENT, never by a
// naming pattern: any `*.jsonl` that is not a gate-audit/lag sidecar BY NAME
// (`*-gate-audit.jsonl`, `*.lag.jsonl` — the one convention that IS universal,
// because every spine resolves its own audit sibling this same way) and whose
// records include at least one `job-start` (present on EVERY real spine
// checked, first record or not — a reuse/battery run nests one or more
// ordinary `runJob` calls inside it) or `run-start` (ralph's own inner-loop
// marker, present on most but not all: a run that dies before ralph's first
// iteration has none). A `.jsonl` that matches neither the sidecar-by-name
// pattern nor the spine-by-content test (measured in the real archive:
// `litectx-types-bareloop/types-check-log.jsonl` and `types-close-log.jsonl`,
// bare `{ts, check, ...}` rows with no `type` field at all; and files whose
// OWN name says "orphan-gate-audit" but do not end in the recognised
// suffix) is reported as `<name> not-a-spine` — never silently dropped, and
// never silently misread as an empty/unknown run.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { replayRun, formatReplay, summarizeForAllLine, formatAllLines } from '../src/replay.js';

/**
 * Parse one JSONL file into records, mirroring scripts/behaviour-readout.mjs:
 * a malformed line is counted and skipped, never thrown on.
 * @param {string} file
 * @returns {{records: any[], skipped: number}}
 */
function parseJsonl(file) {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
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

/** @param {string} name (basename) */
function isSidecarByName(name) {
  return name.endsWith('-gate-audit.jsonl') || name.endsWith('.lag.jsonl');
}

/** @param {any[]} records */
function looksLikeSpine(records) {
  return records.some((r) => r && (r.type === 'job-start' || r.type === 'run-start'));
}

/**
 * `<name>.jsonl` → `<name>-gate-audit.jsonl` in the same directory, and the
 * bare id for display — the run id lives only in the filename (no spine
 * record carries it; see src/replay.js's header). A leading `u-` (the run-u
 * convention) is stripped; every other prefix (`battery-A1-`, `reuse-`, …) is
 * kept verbatim, since it is the only thing distinguishing that run from its
 * siblings in the same directory.
 * @param {string} spinePath
 */
function resolveSiblings(spinePath) {
  const dir = dirname(spinePath);
  const base = basename(spinePath);
  const stem = base.replace(/\.jsonl$/, '');
  const runId = stem.startsWith('u-') ? stem.slice(2) : stem;
  const auditPath = join(dir, `${stem}-gate-audit.jsonl`);
  return { runId, auditPath: existsSync(auditPath) ? auditPath : null };
}

/**
 * @param {string} spinePath
 * @param {{records: any[], skipped: number}} [preParsedSpine] avoids a second
 *   parse of the same file when the caller (--all) already read it once to
 *   run {@link looksLikeSpine}
 * @param {{skipAudit?: boolean}} [opts] `skipAudit` (PR #23 review item 5,
 *   2026-08-26): `--all` never opens the gate-audit sidecar at all —
 *   `summarizeForAllLine` reads none of the fields (`toolCalls`/behaviour)
 *   that sidecar feeds inside `replayRun`, so reading every run's sidecar in
 *   a directory listing was pure unused I/O, multiplied by every spine found.
 */
function replayOne(spinePath, preParsedSpine, { skipAudit = false } = {}) {
  const { runId, auditPath } = resolveSiblings(spinePath);
  const spine = preParsedSpine ?? parseJsonl(spinePath);
  const audit = (!skipAudit && auditPath) ? parseJsonl(auditPath) : { records: [], skipped: 0 };
  const summary = replayRun(spine.records, audit.records, { runId });
  summary.skipped += spine.skipped + audit.skipped;
  return summary;
}

const args = process.argv.slice(2);

if (args[0] === '--all') {
  const dir = args[1];
  if (!dir) {
    console.error('usage: node scripts/run-replay.mjs --all <dir>');
    process.exitCode = 1;
  } else if (!existsSync(dir)) {
    console.error(`no such directory: ${dir}`);
    process.exitCode = 1;
  } else {
    const candidates = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && !isSidecarByName(f))
      .sort();
    if (candidates.length === 0) {
      console.log(`no .jsonl files found in ${dir}`);
    } else {
      const entries = candidates.map((f) => {
        const path = join(dir, f);
        const spine = parseJsonl(path);
        if (!looksLikeSpine(spine.records)) return { kind: 'not-a-spine', name: f };
        const summary = replayOne(path, spine, { skipAudit: true });
        return { kind: 'spine', row: summarizeForAllLine(summary) };
      });
      console.log(formatAllLines(entries));
    }
  }
} else {
  const spinePath = args[0];
  if (!spinePath) {
    console.error('usage: node scripts/run-replay.mjs <spine.jsonl>');
    console.error('       node scripts/run-replay.mjs --all <dir>');
    process.exitCode = 1;
  } else if (!existsSync(spinePath)) {
    console.error(`no such file: ${spinePath}`);
    process.exitCode = 1;
  } else {
    const { records } = parseJsonl(spinePath);
    if (!looksLikeSpine(records)) {
      console.error(`${spinePath} does not look like a spine (no job-start or run-start record found)`);
      process.exitCode = 1;
    } else {
      const summary = replayOne(spinePath);
      console.log(formatReplay(summary));
    }
  }
}
