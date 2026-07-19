// POC — Layer R root: the riskiest assumption is DETECTION, not injection.
// Can the shell see "the reds did not move" from real close output? (Design
// record docs/plans/2026-07-19-layer-r-design.md; first run 2026-07-19.)
//
// Aimed at the load-bearing claims, with negatives that can fail:
//   1. REAL `node --test` output, run twice on an identical tree — are the
//      kept-failure lines byte-stable? (Finding: NO — duration stamps. A naive
//      equality detector would read every attempt as "reds moved" and never
//      fire. This is the fact the build's normalizer exists for.)
//   2. Negative control: fix ONE test and rerun — does the normalized
//      comparison still see movement? (If both conditions matched, the
//      variable isn't wired in and the test can't fail.)
//   3. Detector truth table incl. negatives: different file → no fixation;
//      reds moved → no fixation; no prior attempt → no fixation.
//   4. The verbatim-stage tee: capped content capture at the translator seam
//      WITHOUT altering the bytes-only gate action.
//
// Run: node poc/layer-r-root.mjs   (exits 1 on any failed expectation)

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
const check = (name, got, want = true) => {
  const ok = got === want;
  console.log(`${ok ? 'ok ' : 'NOT OK'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)})`}`);
  if (!ok) failed += 1;
};

// ── a real failing suite, uncrafted output ─────────────────────────────────
const base = mkdtempSync(join(tmpdir(), 'layer-r-poc-'));
mkdirSync(join(base, 'src'), { recursive: true });
const suite = join(base, 'sum.test.mjs');
writeFileSync(suite, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));
test('multiplies-alias', () => assert.equal(sum(2, 2), 5)); // fails
test('zero identity', () => assert.equal(sum(7, 0), 5));    // fails
`);
writeFileSync(join(base, 'src', 'sum.mjs'), 'export function sum(a, b) { return a + b; }\n');

const runClose = (reporter) => {
  const r = spawnSync('node', ['--test', `--test-reporter=${reporter}`, suite], { encoding: 'utf8' });
  return `${r.stdout}\n${r.stderr}`;
};

// 1. spec reporter, identical tree, two runs
const s1 = runClose('spec');
const s2 = runClose('spec');
const keptRaw = (out) => out.split('\n').filter((l) => /^✖ /.test(l));
check('spec: full output NOT identical across identical runs', s1 === s2, false);
check('spec: raw ✖ lines NOT stable either (duration stamps)', JSON.stringify(keptRaw(s1)) === JSON.stringify(keptRaw(s2)), false);

const norm = (l) => l.replace(/ \(\d+(?:\.\d+)?m?s\)\s*$/, '');
const keptNorm = (out) => JSON.stringify([...new Set(keptRaw(out).map(norm))].sort());
check('spec: NORMALIZED kept sets stable (detector can fire)', keptNorm(s1) === keptNorm(s2));

// 2. negative control: fix one test → the same instrument must see movement
writeFileSync(suite, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));
test('multiplies-alias', () => assert.equal(sum(2, 3), 5)); // fixed
test('zero identity', () => assert.equal(sum(7, 0), 5));    // still fails
`);
const s3 = runClose('spec');
check('spec: one test fixed → normalized sets DIFFER (movement seen)', keptNorm(s1) !== keptNorm(s3));

// TAP (what a piped `node --test` close emits): `not ok` lines carry no stamps
const t1 = runClose('tap');
const t2 = runClose('tap');
const keptTap = (out) => JSON.stringify(out.split('\n').filter((l) => /^not ok /.test(l)).sort());
check('tap: not-ok lines byte-stable across identical runs', keptTap(t1) === keptTap(t2));

// 3. detector truth table (the shape src/root.js implements)
const redSet = (kept) => JSON.stringify([...new Set(kept.map(norm))].sort());
const fixated = (prev, cur) => prev !== null
  && cur.writes.some((p) => prev.writes.includes(p))
  && redSet(cur.kept) === redSet(prev.kept);
const K1 = ['✖ multiplies-alias (1.7ms)', '✖ zero identity (0.3ms)'];
const K2 = ['✖ multiplies-alias (2.9ms)', '✖ zero identity (0.1ms)'];
const a1 = { writes: ['/r/src/x.js'], kept: K1 };
check('truth: same file + same reds (new stamps) → FIXATED', fixated(a1, { writes: ['/r/src/x.js'], kept: K2 }));
check('truth: different file + same reds → not fixated', fixated(a1, { writes: ['/r/src/y.js'], kept: K2 }), false);
check('truth: same file + reds moved → not fixated', fixated(a1, { writes: ['/r/src/x.js'], kept: [K2[1]] }), false);
check('truth: no prior attempt → not fixated', fixated(null, a1), false);

// 4. tee at the translator seam: capped capture, gate action unchanged
const CAP = 2000;
const store = new Map();
const tee = (name, args) => {
  if (name === 'shell_write') store.set(args.path, { content: String(args.content).slice(0, CAP), trimmed: String(args.content).length > CAP });
  return { type: 'write', path: args.path, args: { bytes: String(args.content).length } };
};
const act = tee('shell_write', { path: '/r/src/x.js', content: 'x'.repeat(5000) });
check('tee: content capped at the seam', store.get('/r/src/x.js').content.length === CAP);
check('tee: trim recorded, not silent', store.get('/r/src/x.js').trimmed);
check('tee: gate action stays bytes-only (audit unchanged)', JSON.stringify(act.args) === '{"bytes":5000}');

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
