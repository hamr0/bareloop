// Run behaviour summary CLI (build-list §2) — prints the report-only
// tool-use block for one run, or for every run_id found in a gate-audit
// file when none is named. Reads only; touches no spine, mints no verdict.
//
//   node scripts/behaviour-readout.mjs <gate-audit.jsonl> [run_id]

import { readFileSync } from 'node:fs';
import { runBehaviour, formatBehaviour } from '../src/behaviour.js';

const [, , file, runId] = process.argv;

if (!file) {
  console.error('usage: node scripts/behaviour-readout.mjs <gate-audit.jsonl> [run_id]');
  process.exitCode = 1;
} else {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');

  const events = [];
  let skipped = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      skipped += 1; // a malformed line never throws the readout — it's a count, not a crash
    }
  }

  const runIds = runId ? [runId] : [...new Set(events.map((e) => e?.run_id).filter(Boolean))];

  if (runIds.length === 0) {
    console.log('no run_id found in this file');
  } else {
    for (const id of runIds) {
      console.log(`--- ${id} ---`);
      console.log(formatBehaviour(runBehaviour(events, { runId: id })));
    }
  }
  if (skipped > 0) console.log(`\n(${skipped} malformed line${skipped === 1 ? '' : 's'} skipped)`);
}
