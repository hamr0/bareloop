// T10 — plan-share analysis. $0, archival, applies the FROZEN read only.
// Prereg: docs/product/N3-T10-PLAN-SHARE-PREREG.md
//   Q1 spend share by phase · Q2 terminal category · Q3 first-draft redraft rate
//   node scripts/n3-t10-plan-share.mjs <spineDir> [...]

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('usage: n3-t10-plan-share.mjs <spineDir> [...]'); process.exit(2); }

const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.jsonl') && !f.includes('gate-audit')).map((f) => join(d, f)));

const runs = [];
let planValidate = { total: 0, firstFail: 0 };
const terminal = {};

for (const f of files) {
  let lines;
  try { lines = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean); } catch { continue; }
  if (!lines.length) continue;
  const evs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (!evs.some((e) => e.type === 'job-start')) continue;
  // CORRECTION (audit 2026-07-25): restrict to the PLAN-V1 flow. Legacy `steps[]` runs
  // (interpret.js) emit unlabelled worker-rounds and have NO plan phase by construction —
  // 59% of archived spend. Including them corrupts the denominator (blind-instrument class).
  const isPlanV1 = evs.some((e) => e.type === 'plan-accepted' || e.type === 'plan-validate');
  if (!isPlanV1) continue;

  // Q1 — spend by phase bucket, from the metered worker-round events (F12: money is per ROUND).
  const spend = { plan: 0, scout: 0, exec: 0, other: 0 };
  let unpriced = 0;
  for (const e of evs) {
    if (e.type !== 'worker-round') continue;
    const c = e.costUsd;
    if (c == null) { unpriced++; continue; }              // F6: unpriced is never $0
    const ph = String(e.phase ?? '');
    if (ph === 'plan') spend.plan += c;
    else if (ph === 'scout') spend.scout += c;
    else if (ph.startsWith('step:') || ph === 'fix') spend.exec += c;
    else spend.other += c;
  }
  const total = spend.plan + spend.scout + spend.exec + spend.other;

  // Q2 — terminal category
  const end = evs.find((e) => e.type === 'job-end');
  const cat = end?.outcome ?? evs.find((e) => e.type === 'escalation')?.category ?? 'unknown';
  terminal[cat] = (terminal[cat] ?? 0) + 1;

  // Q3 — first-draft validation outcome
  for (const e of evs.filter((x) => x.type === 'plan-validate')) {
    if (String(e.phase ?? '').endsWith('-1')) { planValidate.total++; if (!e.ok) planValidate.firstFail++; }
  }

  const executed = evs.some((e) => e.type === 'step-start');
  runs.push({ f: f.split('/').pop(), total, spend, unpriced, executed, cat });
}

const withSpend = runs.filter((r) => r.total > 0 && r.executed);
const share = (k) => withSpend.map((r) => r.spend[k] / r.total);
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const pct = (x) => Number.isNaN(x) ? ' -- ' : (100 * x).toFixed(2) + '%';

console.log(`\n=== T10 plan-share — ${files.length} spine files, ${runs.length} runs, ${withSpend.length} with spend AND executed steps ===`);
console.log(`\nQ1 — spend share by phase (runs that reached execution):`);
console.log(`  plan (draft+redraft) : mean ${pct(mean(share('plan')))}   max ${pct(Math.max(...share('plan')))}`);
console.log(`  scout                : mean ${pct(mean(share('scout')))}`);
console.log(`  execute + fix        : mean ${pct(mean(share('exec')))}`);
console.log(`  total metered spend across these runs: $${withSpend.reduce((s, r) => s + r.total, 0).toFixed(2)}`);
const unp = runs.reduce((s, r) => s + r.unpriced, 0);
if (unp) console.log(`  NOTE: ${unp} unpriced rounds excluded from cost (F6 honest-null, never counted as $0)`);

console.log(`\nQ2 — terminal category across ALL ${runs.length} archived runs:`);
for (const [k, v] of Object.entries(terminal).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(22)} ${v}`);

console.log(`\nQ3 — first-draft plan validation: ${planValidate.firstFail}/${planValidate.total} failed` +
  (planValidate.total ? ` (${(100 * planValidate.firstFail / planValidate.total).toFixed(0)}% forced a redraft)` : ''));
