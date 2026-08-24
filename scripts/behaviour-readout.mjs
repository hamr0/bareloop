// Run behaviour summary CLI (build-list §2) — prints the report-only
// tool-use block for one run, or for every run_id found in a gate-audit
// file when none is named. Reads only; touches no spine, mints no verdict.
//
//   node scripts/behaviour-readout.mjs <gate-audit.jsonl> [run_id] [spine.jsonl]
//
// The optional third positional is the run's SPINE file (not the gate audit) —
// when given and it holds a `memory-cache` record (src/readshim.js's end-of-run
// readout), that line prints after the behaviour block. Absent, or the record
// isn't there, this stays silent — it never fabricates the line.

import { readFileSync } from 'node:fs';
import { runBehaviour, formatBehaviour } from '../src/behaviour.js';

const [, , file, runId, spinePath] = process.argv;

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
  if (spinePath) {
    try {
      const spineRaw = readFileSync(spinePath, 'utf8');
      const spineEvents = spineRaw.trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const mc = spineEvents.findLast((e) => e?.type === 'memory-cache');
      if (mc) {
        const kb = (mc.bytesWithheld / 1024).toFixed(1);
        const kTokens = (mc.approxTokens / 1000).toFixed(1);
        console.log(`MEMORY-CACHE  ${mc.pointered} re-reads answered from memory · ${mc.capped} reads capped · ${kb} KB withheld (~${kTokens}k tokens not re-sent)`);
      }
    } catch { /* an unreadable spine says nothing here — this readout is report-only */ }
  }
  if (skipped > 0) console.log(`\n(${skipped} malformed line${skipped === 1 ? '' : 's'} skipped)`);
}
