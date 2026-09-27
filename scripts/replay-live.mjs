#!/usr/bin/env node
// $0 replay instrument (PANEL-BUILD.md P2, piece 4) — reconstructs a
// LIVE-LOOKING run from an already-archived, real spine, for panel dev/
// screenshot proof without a paid provider call. It is NOT the finish line
// (a real paid run watched start-to-end) — that stays hamr's own call.
//
// What it does: copies `<sourceSpine>`'s lines into a NEW file under
// `<outDir>`, record by record, sleeping between records according to their
// own `ts` gaps divided by `--speed` (default 20, so a run that took ~20
// minutes replays in ~1 minute), capping any single sleep at 3s so a real
// gap (e.g. a several-minute tool call) never stalls the demo. Then appends
// ONE run-list row via `src/runlist.js`'s `appendRun` so the copy shows up
// in `bareloop panel`'s Runs list like any other run — appended BEFORE the
// pacing loop starts, same as a real run (`src/userrun.js`), so the panel
// can show it live from its very first record, not only after it finishes.
//
// Distinct-run identity (dedupe): `appendRun` is idempotent BY RUNID
// (src/runlist.js) — re-listing the SOURCE run's own runid would be a
// no-op, not a new row. So this script mints a NEW runid,
// `replay-<sourceRunId>-<epochMs>`, and writes the copy to a NEW file named
// `u-<newRunId>.jsonl` (the free-standing/`run-u` naming convention
// `resolveSiblings` already understands, src/replayio.js) — never reusing
// the source's own runid or filename. The SPINE CONTENT itself (every
// line, every `ts`, every field) is copied byte-for-byte unchanged; only
// the runlist row's own `job` field gets a `· replay` suffix so it never
// silently merges into the source run's own Workflows job group.
//
// The source spine's gate-audit sidecar (`<stem>-gate-audit.jsonl`), if
// present, is copied WHOLE (unpaced) under the matching new sidecar name
// before the pacing loop starts, so the Audit tab works throughout the
// replay too — its rows are windowed by the server against the (unchanged)
// spine ts range, never by the sidecar's own internal `run_id` field.
//
// Never writes into a real `~/.config/bareloop` — always invoke this with
// a scratch HOME (`appendRun` takes no `home` override here on purpose; it
// falls through to `runlistHome()`'s own `os.homedir()`, the same
// convention every other caller in this codebase follows — see
// src/runlist.js's own header on why there is no separate env var).
//
// Usage: node scripts/replay-live.mjs <sourceSpine> <outDir> [--speed N]
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, appendFileSync,
} from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { appendRun } from '../src/runlist.js';

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function parseArgs(argv) {
  const positional = [];
  let speed = 20;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--speed') {
      speed = Number(argv[i + 1]);
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  const [sourceSpine, outDir] = positional;
  return { sourceSpine, outDir, speed };
}

async function main() {
  const { sourceSpine, outDir, speed } = parseArgs(process.argv.slice(2));
  if (!sourceSpine || !outDir) {
    console.error('usage: node scripts/replay-live.mjs <sourceSpine> <outDir> [--speed N]');
    process.exitCode = 2;
    return;
  }
  if (!existsSync(sourceSpine)) {
    console.error(`replay-live: source spine not found: ${sourceSpine}`);
    process.exitCode = 2;
    return;
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    console.error(`replay-live: --speed must be a positive number, got ${JSON.stringify(process.argv)}`);
    process.exitCode = 2;
    return;
  }
  const CAP_MS = 3000;

  const raw = readFileSync(sourceSpine, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) {
    console.error('replay-live: source spine has no records');
    process.exitCode = 2;
    return;
  }
  const records = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
  const jobStart = records.find((r) => r && r.type === 'job-start');
  if (!jobStart) {
    console.error('replay-live: source spine has no job-start record — refusing (not a real spine)');
    process.exitCode = 2;
    return;
  }

  const sourceStem = basename(sourceSpine).replace(/\.jsonl$/, '');
  const sourceRunId = sourceStem.startsWith('u-') ? sourceStem.slice(2) : sourceStem;
  const newRunId = `replay-${sourceRunId}-${Date.now()}`;
  const newStem = `u-${newRunId}`;

  mkdirSync(outDir, { recursive: true });
  const outSpinePath = join(outDir, `${newStem}.jsonl`);
  if (existsSync(outSpinePath)) {
    console.error(`replay-live: refusing to overwrite an existing file: ${outSpinePath}`);
    process.exitCode = 2;
    return;
  }

  // Sidecar, copied whole and unpaced, before the pacing loop — the Audit
  // tab must work from the first poll, not only once the replay finishes.
  const sourceAuditPath = join(dirname(sourceSpine), `${sourceStem}-gate-audit.jsonl`);
  if (existsSync(sourceAuditPath)) {
    copyFileSync(sourceAuditPath, join(outDir, `${newStem}-gate-audit.jsonl`));
  }

  // Start the output file empty, then append the run-list row BEFORE any
  // pacing write — a real run (src/userrun.js) lists itself at job START,
  // before its first paid call, so the panel can show it `▶` immediately;
  // this instrument mirrors that ordering.
  writeFileSync(outSpinePath, '');
  const appendResult = appendRun({
    at: new Date().toISOString(),
    runid: newRunId,
    job: `${jobStart.job} · replay`,
    spine: outSpinePath,
    patient: null,
    via: 'backfill',
  });
  console.log(`replay-live: runlist row: ${JSON.stringify(appendResult)}`);
  console.log(`replay-live: runid=${newRunId} spine=${outSpinePath} speed=${speed}x records=${lines.length}`);

  let prevTs = null;
  for (let i = 0; i < lines.length; i += 1) {
    const rec = records[i];
    const ts = rec && typeof rec.ts === 'string' ? Date.parse(rec.ts) : NaN;
    if (i > 0 && Number.isFinite(ts) && Number.isFinite(prevTs)) {
      const gapMs = Math.max(0, ts - prevTs);
      const sleepMs = Math.min(CAP_MS, gapMs / speed);
      if (sleepMs > 0) await sleep(sleepMs); // eslint-disable-line no-await-in-loop
    }
    if (Number.isFinite(ts)) prevTs = ts;
    // appendFileSync each record individually so the file's own mtime
    // advances on every write — this is what keeps the panel's died-mtime
    // check (server.js DIED_MTIME_MS) reading the run as fresh/`▶` for the
    // whole replay, exactly like a real in-progress run.
    appendFileSync(outSpinePath, `${lines[i]}\n`);
  }

  console.log(`replay-live: done — ${lines.length} records written to ${outSpinePath}`);
}

main();
