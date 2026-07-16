// TESTGEN battery babysitter — operator-side orchestration for a flapping provider.
// Amendment 2026-07-16h: casualty rows (provider-red) are re-run to keep n=5, funded
// under the SAME $30 authorization. This script changes no experiment semantics: it
// probes the provider for stability, invokes the frozen runner for only the REMAINING
// valid rows, tallies cross-invocation spend against the $30 total, and backs off
// between invocations. Each invocation still enforces every honest stop internally.
//
//   ANTHROPIC_API_KEY=... node scripts/testgen-battery-babysitter.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HASH = '8ab3aa189278869b71e9be8c33b41a4976e2f4c0b85ac856a029db18753813c3';
const SPINE_DIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar-bareloop';
const MODEL = 'claude-sonnet-5';
const TOTAL_CAP_USD = 30;
const PRIOR_SPEND_USD = 1.59; // casualties before the babysitter existed (runids mrnuypg4, mrnv9e1k, mrnvc7is, mrnvf3sa)
const TARGET_VALID = 5;
const MAX_INVOCATIONS = 8;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(2); }

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);

async function probeOnce() {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    return res.status;
  } catch { return 0; }
}

/** 2 consecutive 200s, 60s apart, on the battery's own model; up to ~2h of probing */
async function probeStable() {
  let ok = 0;
  for (let i = 1; i <= 24; i++) {
    const code = await probeOnce();
    console.log(`${ts()} probe ${i}: HTTP ${code} (consecutive ok: ${ok})`);
    if (code === 200) {
      ok += 1;
      if (ok >= 2) return true;
      await sleep(60_000);
    } else {
      ok = 0;
      await sleep(300_000);
    }
  }
  return false;
}

function newestResults() {
  const files = readdirSync(SPINE_DIR).filter((f) => f.startsWith('testgen-bat-results-'));
  if (!files.length) return null;
  const newest = files.map((f) => ({ f, m: statSync(join(SPINE_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0].f;
  return JSON.parse(readFileSync(join(SPINE_DIR, newest), 'utf8'));
}

let validTotal = 0;
let spendTotal = PRIOR_SPEND_USD;
let greens = 0, convPrimary = 0, convLadder = 0;
/** @type {any[]} */
const validRows = [];

for (let inv = 1; inv <= MAX_INVOCATIONS; inv++) {
  if (validTotal >= TARGET_VALID) break;
  if (spendTotal + 5 > TOTAL_CAP_USD) {
    console.log(`${ts()} STOP: $${spendTotal.toFixed(2)} spent — one more $5 run would exceed the $${TOTAL_CAP_USD} authorization`);
    break;
  }
  console.log(`\n${ts()} === invocation ${inv}: probing for stability (${TARGET_VALID - validTotal} rows remaining) ===`);
  const stable = await probeStable();
  if (!stable) { console.log(`${ts()} STOP: provider never stabilized within the probe window`); break; }

  const remaining = TARGET_VALID - validTotal;
  console.log(`${ts()} firing runner: --runs ${remaining}`);
  try {
    execFileSync('node', ['scripts/run-battery-testgen.mjs', '--approve', HASH, '--runs', String(remaining)],
      { stdio: 'inherit', env: process.env, cwd: new URL('..', import.meta.url).pathname });
  } catch { /* runner exits non-zero only on preflight refusals; results JSON is still the record */ }

  const results = newestResults();
  if (!results) { console.log(`${ts()} no results file found — stopping`); break; }
  const valid = (results.rows ?? []).filter((/** @type {any} */ r) => !r.casualty);
  validRows.push(...valid);
  validTotal += valid.length;
  spendTotal += results.cumulativeUsd ?? 0;
  greens += results.summary?.greens ?? 0;
  convPrimary += (results.rows ?? []).filter((/** @type {any} */ r) => !r.casualty && r.conversionPrimary).length;
  convLadder += (results.rows ?? []).filter((/** @type {any} */ r) => !r.casualty && r.conversionLadder).length;
  console.log(`${ts()} invocation ${inv} done: +${valid.length} valid rows (total ${validTotal}/${TARGET_VALID}), spend total $${spendTotal.toFixed(4)} of $${TOTAL_CAP_USD}`);
  if (results.stop && results.stop.includes('ATTEMPT-1 GREEN')) { console.log(`${ts()} DRIFT STOP from runner — battery invalid, halting babysitter`); break; }
  await sleep(120_000);
}

console.log(`\n=== BABYSITTER SUMMARY ===`);
console.log(`valid rows ${validTotal}/${TARGET_VALID}   greens ${greens}   conversion primary ${convPrimary}   ladder ${convLadder}   total spend $${spendTotal.toFixed(4)} of $${TOTAL_CAP_USD} (incl. $${PRIOR_SPEND_USD} prior casualties)`);
for (const r of validRows) {
  const a = (r.attempts ?? []).map((/** @type {any} */ x) => `${x.phase}${x.rate != null ? ':' + x.rate + '%' : ''}(r${x.rank})`).join(' → ');
  console.log(`  ${r.run}: ${a}  primary=${r.conversionPrimary} ladder=${r.conversionLadder} green=${r.green} $${(r.spentUsd ?? 0).toFixed(4)}`);
}
process.exit(0);
