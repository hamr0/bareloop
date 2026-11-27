// hamr 2026-11-25 ("go B", run mwvwcxvy): ONE owner of "which close record is FINAL for the run's CURRENT leg" - src/legs.js `finalCloseOf`.
// A resumed already-green leg ran no close of its own: its final close is its last `close-precheck`. The whole-spine readers showed null
// (mwvwcxvy, mwue75ih) or leg 1's red close under leg 2 (mvtatlxw). Spines are REAL (tests/fixtures: already-green-result, audit-grid, final-close).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalCloseOf, currentLegView } from '../src/legs.js';
import { replayRun, formatReplay } from '../src/replay.js';
import { checksOf } from '../src/runread.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const load = (/** @type {string} */ f) => readFileSync(join(HERE, 'fixtures', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const GREEN = load('already-green-result/u-mwvwcxvy.jsonl');
const GRID = load('audit-grid/u-mvtatlxw.jsonl');
const MWUE = load('final-close/u-mwue75ih.jsonl');
const key = (/** @type {any} */ r) => (r ? `${r.type}#${r.seq}:${r.verdict}` : null);

test('single leg that ended green: its last staged close-verdict / outer-close', () => {
  const recs = [
    { seq: 1, type: 'outer-close', verdict: 'needs_revision', stages: [{ name: 'a', verdict: 'needs_revision' }] },
    { seq: 2, type: 'close-verdict', verdict: 'satisfied', stages: [{ name: 'a', verdict: 'satisfied' }] },
    { seq: 3, type: 'close-verdict', verdict: 'needs_revision' }, // a step's own judge loop: no stages, never "the close"
    { seq: 4, type: 'job-end', outcome: 'green' },
  ];
  assert.equal(finalCloseOf(recs)?.seq, 2);
  assert.equal(finalCloseOf([]), null);
});

test('multi-leg already-green runs (real spines): the current leg\'s own close-precheck, never an earlier leg\'s record, never null', () => {
  for (const [name, recs] of [['mwvwcxvy', GREEN], ['mvtatlxw', GRID], ['mwue75ih', MWUE]]) {
    const view = currentLegView(recs);
    assert.equal(view.outcome, 'already-green', name);
    const fc = finalCloseOf(recs);
    assert.ok(fc, `${name}: a close is found`);
    assert.equal(fc.type, 'close-precheck', name);
    assert.ok(view.records.includes(fc), `${name}: the record belongs to the current leg`);
    assert.equal(fc.verdict, 'satisfied', name);
  }
});

test('a live leg with no close yet reads null even when the leg before it ended red (never the earlier leg\'s close)', () => {
  const marker = GRID.findLastIndex((r) => r.type === 'leg-resume');
  assert.ok(marker > 0, 'the fixture is a resumed run');
  assert.ok(GRID.slice(0, marker).some((r) => r.type === 'close-verdict' && r.verdict === 'needs_revision' && Array.isArray(r.stages)), 'leg 1 holds a red staged close');
  const cut = GRID.slice(0, marker + 1); // leg 2 has just started
  assert.equal(currentLegView(cut).live, true);
  assert.equal(finalCloseOf(cut), null);
});

test('replay: the run\'s CLOSE on the resumed already-green mvtatlxw reads leg 2\'s satisfied precheck, not leg 1\'s needs_revision', () => {
  const s = replayRun(GRID, []);
  assert.equal(s.close?.source, 'close-precheck');
  assert.equal(s.close?.verdict, 'satisfied');
  assert.match(formatReplay(s), /\n {2}satisfied · \d+ stages: /);
  assert.doesNotMatch(formatReplay(s), /needs_revision · \d+ stages/);
  for (const [name, recs] of [['mwvwcxvy', GREEN], ['mwue75ih', MWUE]]) assert.equal(replayRun(recs, []).close?.verdict, 'satisfied', `${name}: not "none - the run ended before any close ran"`);
});

const shapeRedsFromRecords = (/** @type {any[]} */ recs, /** @type {string} */ stage, /** @type {number} */ line) => checksOf(recs, null, { spec: { closeDecl: { stages: [{ name: stage, kind: 'rubric-step', params: { step: line, parts: [{ class: 'shape', fields: [] }] } }], list: [] } } })?.shapeItems.get(stage) ?? [];
test('checksOf.shapeItems reads only the current leg\'s final close: an earlier leg\'s gap never leaks into a resumed already-green leg', () => {
  const red = { seq: 1, type: 'close-verdict', verdict: 'needs_revision', stages: [{ name: 's', verdict: 'needs_revision' }], gap: 'line 2: item 1: "status" is not one of the allowed values' };
  const recs = [red, { seq: 2, type: 'job-end', outcome: 'red' }, { seq: 3, type: 'leg-resume' }, { seq: 4, type: 'close-precheck', verdict: 'satisfied', stages: [{ name: 's', verdict: 'satisfied' }] }, { seq: 5, type: 'job-end', outcome: 'already-green' }];
  assert.deepEqual(shapeRedsFromRecords(recs, 's', 2), []);
  assert.notDeepEqual(shapeRedsFromRecords(recs.slice(0, 2), 's', 2), [], 'the red leg itself still reads its gap lines');
});

// the guard: no src file other than legs.js hand-scans a spine for the final close
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); }
  return out;
};
const SCAN = /(findLast\(|\.some\(|\.filter\(|\.find\(|\blast\()/;
const TYPES = ['close-verdict', 'outer-close', 'close-precheck'];
/** @type {Record<string, {n: number, why: string}>} the sites that scan for a close on purpose: history, trend or emitters, NOT "the final close of the current leg" (reuse.js is a separate, later ruling) */
const ALLOWED = {
  'src/runread.js': { n: 1, why: 'checksOf shape-items fallback for a run recorded before the `shape-items` record: a RED run has no staged final close (its close-verdicts carry the plain gap lines and no stages), so it reads the current leg\'s last gap-bearing close-verdict; leg-scoped, never an earlier leg\'s' },
  'src/reuse.js': { n: 1, why: 'the close-trend governor `readGrade` reads every red close of the whole spine in order (engine and arbiter territory: moving it would change close semantics). readTry now asks src/runread.js (F399)' },
  'src/replay.js': { n: 2, why: 'the fix-loop timeline: per-iteration boundaries and the precheck, seq-bounded across the whole run (history)' },
  'src/userrun.js': { n: 1, why: 'the CLI run-end reads the outer-close of its own `events` (the latest leg, already scoped)' },
};

test('no src file other than legs.js hand-scans a spine for the final close outside the named allow-list', () => {
  /** @type {Record<string, string[]>} */
  const found = {};
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (rel === 'src/legs.js') continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /\bemit\(/.test(line) || !SCAN.test(line)) return;
      if (TYPES.some((type) => line.includes(`'${type}'`))) (found[rel] ??= []).push(`${i + 1}: ${t.slice(0, 110)}`);
    });
  }
  const problems = [];
  for (const [rel, lines] of Object.entries(found)) {
    const allowed = ALLOWED[rel]?.n ?? 0;
    if (lines.length !== allowed) problems.push(`${rel}: ${lines.length} scan(s), allow-list says ${allowed}\n    ${lines.join('\n    ')}`);
  }
  for (const [rel, a] of Object.entries(ALLOWED)) if (!found[rel]) problems.push(`${rel}: allow-listed (${a.why}) but no scan found - drop the entry`);
  assert.deepEqual(problems, [], 'a reader of "the final close" asks finalCloseOf (src/legs.js), or is named in ALLOWED with its reason');
});
