// F399 (hamr's ruling 2026-11-25): reuse `readTry` reads the run's FINAL close through src/runread.js. Byte-identical to the old reader except the two named bugs:
//  bug 4: `failingStage` named an earlier red close's stage although the final close passed (runs muutlcko, mvtatlxw ...);
//  bug 5: `closeReached` was false on an already-green leg (it wrote no outer-close; runs mwue75ih, mwvwcxvy).
// OLD below is a frozen copy of the two lines the old reader held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTry } from '../src/reuse.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (/** @type {string} */ p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\/u-[^/]*\.jsonl$/.test(p) && !p.endsWith('gate-audit.jsonl')) out.push(p); } return out; };
const nonEmpty = (/** @type {any} */ x) => typeof x === 'string' && x !== '';
const OLD = (/** @type {any[]} */ events) => {
  const oc = events.filter((e) => e.type === 'outer-close').at(-1) ?? null;
  const cv = events.filter((e) => e.type === 'close-verdict' && nonEmpty(e.stage)).at(-1) ?? null;
  const stage = cv ?? oc;
  return { failingStage: nonEmpty(stage?.stage) ? stage.stage : null, closeReached: oc !== null };
};
const NAMED = { 'audit-grid/u-mvtatlxw.jsonl': 'bug 4 (mvtatlxw)', 'final-close/u-mwue75ih.jsonl': 'bug 5 (mwue75ih)', 'already-green-result/u-mwvwcxvy.jsonl': 'bug 5 (mwvwcxvy)',
  'currentleg/u-mwuxqx4f.jsonl': 'bug 4 (mwuxqx4f)',
  // same class as bug 4: the fix loop's red line-2 close, then a satisfied final close (seq 90): the old reader kept line-2
  'audit-checks-fixloop-mwg3pov1/u-mwg3pov1.jsonl': 'bug 4 (mwg3pov1, same class)' };

test('bug 4 (run mvtatlxw): failingStage is the FINAL close\'s (satisfied: none), not an earlier red close\'s stage', () => {
  const ev = load(join(FX, 'audit-grid/u-mvtatlxw.jsonl'));
  assert.notEqual(OLD(ev).failingStage, null, 'the old reader named a stale red stage');
  assert.equal(readTry(ev).failingStage, null);
});

test('bug 5 (runs mwue75ih, mwvwcxvy): closeReached is true on an already-green leg', () => {
  for (const f of ['final-close/u-mwue75ih.jsonl', 'already-green-result/u-mwvwcxvy.jsonl']) {
    const ev = load(join(FX, f));
    assert.equal(OLD(ev).closeReached, false, `${f}: the old reader said no close was reached`);
    assert.equal(readTry(ev).closeReached, true, f);
  }
});

test('parity over every real archived spine under tests/fixtures: readTry equals the old reader on both fields, except the named bug runs', () => {
  const files = walk(FX);
  assert.ok(files.length >= 8, `${files.length} spines`);
  const differ = [];
  for (const f of files) {
    const ev = load(f);
    const rel = f.slice(FX.length + 1);
    const o = OLD(ev); const n = readTry(ev);
    if (o.failingStage !== n.failingStage || o.closeReached !== n.closeReached) differ.push(rel);
  }
  for (const rel of differ) assert.ok(rel in NAMED, `${rel} differs from the old reader and is not a named bug run`);
});
