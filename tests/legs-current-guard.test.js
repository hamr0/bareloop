// hamr 2026-11-24 (F397, "one owner per fact"): the run's last job-end / last escalation / money-halt are facts about ONE leg, and src/legs.js
// `currentLegView` is their only reader. This guard fails the moment a src file other than legs.js scans a spine for one of them on its own,
// unless the site is named below WITH the reason it is whole-run or one-leg on purpose. A new site that scans for them must either ask the
// owner or be added here with its reason (a deliberate, reviewed act - never a silent second spelling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); }
  return out;
};
const TYPES = ['job-end', 'escalation', 'money-halt'];
const SCAN = /(findLast\(|\.some\(|\.filter\(|\.find\(|\blast\()/;

/** @type {Record<string, {n: number, why: string}>} key `<file>|<type>` - the sites that scan a spine for one of the three on purpose */
const ALLOWED = {
  'src/ledger.js|job-end': { n: 1, why: 'legSpend: its input IS one leg\'s records (documented), read for that leg\'s own spend' },
  'src/monthly.js|job-end': { n: 3, why: 'per-leg slices: legWallOne / inFlightCapUsd get ONE leg\'s records; readLegs walks every leg on its own date' },
  'src/learn.js|job-end': { n: 1, why: 'buildCards folds the WHOLE spine (all legs) into cards at run end, where the last job-end is the leg that just ended' },
  'src/learnstore.js|job-end': { n: 1, why: 'the stamp of the run-end tally of the whole spine (same call as buildCards)' },
  'src/reuse.js|job-end': { n: 2, why: 'the legacy try loop reads one try\'s own events (a try is one run, both attempts folded) and checkpointAgeGate reads the latest leg it was handed' },
  'src/u-readout.js|job-end': { n: 1, why: 'deathAtOf already scopes to the latest leg through legsOf before it asks' },
  'src/userrun.js|job-end': { n: 1, why: 'the run-end settle reads `events`, already the latest leg\'s records (legsOf(...).at(-1))' },
  'src/userrun.js|escalation': { n: 1, why: 'the CLI prints every escalation of the run' },
  'src/userrun.js|money-halt': { n: 1, why: 'the CLI footer reads the same latest-leg `events`' },
  'src/replay.js|escalation': { n: 3, why: 'legCapKind reads ONE leg; the per-step trip windows and the part boundaries are seq-bounded and span the whole run on purpose' },
  'src/replay.js|money-halt': { n: 1, why: 'legCapKind reads ONE leg (the history of each leg, not the current one)' },
};

test('no src file other than legs.js scans a spine for the last job-end / escalation / money-halt outside the named allow-list', () => {
  /** @type {Record<string, string[]>} */
  const found = {};
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (rel === 'src/legs.js') continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /\bemit\(/.test(line) || !SCAN.test(line)) return;
      for (const type of TYPES) if (line.includes(`'${type}'`)) (found[`${rel}|${type}`] ??= []).push(`${i + 1}: ${t.slice(0, 100)}`);
    });
  }
  const problems = [];
  for (const [key, lines] of Object.entries(found)) {
    const allowed = ALLOWED[key]?.n ?? 0;
    if (lines.length !== allowed) problems.push(`${key}: ${lines.length} scan(s), allow-list says ${allowed}\n    ${lines.join('\n    ')}`);
  }
  for (const [key, a] of Object.entries(ALLOWED)) if (a.n > 0 && !(key in found)) problems.push(`${key}: allow-listed (${a.why}) but no longer found - remove it`);
  assert.deepEqual(problems, [], `ask src/legs.js currentLegView instead of scanning the spine:\n${problems.join('\n')}`);
});

test('the old per-reader helper is gone: no `lastJobEndTs` definition anywhere in src', () => {
  for (const file of walk(join(ROOT, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /function lastJobEndTs\b/, relative(ROOT, file));
  }
});
