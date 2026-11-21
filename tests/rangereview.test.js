// Part 2 item 1 (ITEM33-BUILD "Part 2 build spec"): src/rangereview.js, the one owner of the range/branch review token, its refusals, its ends and its per-file diffs. REAL git on a real repo (tests/range-world.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rangeTokens, manyTokensRefusal, changeRefusal, resolveRange, writeRangeDiffs, rangeNoteOfSpec, DIFF_DIR } from '../src/rangereview.js';
import { makeRangeWorld, out } from './range-world.mjs';
import { gitInPatient } from './helpers.js';

const lines = (/** @type {string[]} */ ...texts) => texts.map((text, i) => ({ n: i + 1, text }));

test('rangeTokens reads only the exact typed tokens, in every line, and never guesses from other words', () => {
  assert.deepEqual(rangeTokens(lines('Review range: v1..v2 for bugs')), [{ kind: 'range', a: 'v1', b: 'v2', line: 1 }]);
  assert.deepEqual(rangeTokens(lines('Look at it', 'Review branch: feat/x for bugs')), [{ kind: 'branch', name: 'feat/x', line: 2 }]);
  assert.deepEqual(rangeTokens(lines('Review the range v1..v2', 'branch feat', 'Range: v1..v2', 'range:v1..v2')), [], 'no token without the exact typed shape');
  assert.equal(rangeTokens(lines('range: v1..v2 and branch: feat')).length, 2, 'a line can carry both kinds');
  assert.deepEqual(rangeTokens(null), []);
});

test('more than one token is refused in plain words; one or none is not', () => {
  assert.equal(manyTokensRefusal(lines('range: v1..v2')), null);
  assert.equal(manyTokensRefusal(lines('fix it')), null);
  assert.equal(manyTokensRefusal(lines('range: v1..v2', 'branch: feat')),
    'A job can name one range or one branch, and this one names 2 (range: v1..v2, branch: feat). Keep one. Nothing spent.');
  assert.match(String(manyTokensRefusal(lines('branch: a branch: b'))), /names 2 /);
});

test('changeRefusal names the line and the kind, in plain words', () => {
  assert.equal(changeRefusal({ kind: 'range', line: 1 }),
    'Line 1 names a range to review, but this job changes code. A range can only be reviewed, not changed. Write it as a review, or take the range out. Nothing spent.');
});

test('resolveRange: a range resolves both ends; a branch is merge-base(main, branch)..tip; every refusal ends "Nothing spent."', async (t) => {
  const w = makeRangeWorld(t);
  const r = await resolveRange({ repo: w.repo, token: { kind: 'range', a: w.c0, b: 'v1', line: 1 } });
  assert.deepEqual(r, { ok: true, a: w.c0, b: w.c1 });
  const b = await resolveRange({ repo: w.repo, token: { kind: 'branch', name: 'feat', line: 1 } });
  assert.deepEqual(b, { ok: true, a: w.c0, b: w.c2 });
  for (const [token, re] of [
    [{ kind: 'range', a: 'v9.9.9', b: 'v1', line: 1 }, /"v9\.9\.9" is not a commit, tag or branch of this repo, so the range cannot be reviewed\. Nothing spent\.$/],
    [{ kind: 'range', a: w.c0, b: 'deadbeef'.repeat(5), line: 1 }, /is not a commit, tag or branch of this repo.*Nothing spent\.$/],
    [{ kind: 'range', a: '--output=x', b: 'v1', line: 1 }, /not a commit/],
    [{ kind: 'branch', name: 'nope', line: 1 }, /^This repo has no branch named "nope"\. Nothing spent\.$/],
  ]) {
    const x = await resolveRange({ repo: w.repo, token: /** @type {any} */ (token) });
    assert.equal(x.ok, false);
    assert.match(/** @type {any} */ (x).error, /** @type {RegExp} */ (re));
  }
  // a repo with no `main`
  gitInPatient(w.repo, ['branch', '-m', 'main', 'trunk']);
  const nm = await resolveRange({ repo: w.repo, token: { kind: 'branch', name: 'feat', line: 1 } });
  assert.equal(nm.ok, false);
  assert.equal(/** @type {any} */ (nm).error, 'This repo has no branch named main, so branch "feat" cannot be compared with it. Use a range (range: A..B) instead. Nothing spent.');
});

test('writeRangeDiffs: files.txt is git diff --name-only, each .diff is git diff A..B -- path, byte for byte, nothing else is there', async (t) => {
  const w = makeRangeWorld(t);
  const res = await writeRangeDiffs({ repo: w.repo, worktree: w.wt, a: w.c0, b: w.c2 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const names = out(w.repo, ['diff', '--name-only', `${w.c0}..${w.c2}`]).split('\n');
  assert.deepEqual(names, ['src/a.js', 'src/new file.js', 'src/old.js'], 'fixture check: edit, add (with a space in the name), delete');
  assert.equal(readFileSync(join(w.wt, DIFF_DIR, 'files.txt'), 'utf8'), `${names.join('\n')}\n`);
  for (const f of names) {
    const want = gitInPatient(w.repo, ['diff', `${w.c0}..${w.c2}`, '--', f]);
    assert.ok(want.length > 0);
    assert.equal(readFileSync(join(w.wt, DIFF_DIR, `${f}.diff`)).toString('utf8'), want, `${f}.diff`);
  }
  const all = [];
  (function walk(/** @type {string} */ d) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else all.push(p.slice(join(w.wt, DIFF_DIR).length + 1)); } })(join(w.wt, DIFF_DIR));
  assert.deepEqual(all.sort(), ['files.txt', 'src/a.js.diff', 'src/new file.js.diff', 'src/old.js.diff']);
  // the removed line is in the .diff (only the diff can serve it)
  assert.match(readFileSync(join(w.wt, DIFF_DIR, 'src/old.js.diff'), 'utf8'), /^-export const old = 1;$/m);
  assert.ok(!existsSync(join(w.repo, DIFF_DIR)), 'nothing is written into the person\'s repo');
});

test('rangeNoteOfSpec: null without a token (and on a change spec); a note only on a review spec that carries one', () => {
  const review = (/** @type {string} */ text) => ({ verdictType: 'soft-green', closeDecl: { source: 'repo' }, jobLines: lines(text) });
  assert.equal(rangeNoteOfSpec(review('Review the code for bugs')), null);
  assert.equal(rangeNoteOfSpec({ verdictType: 'green', jobLines: lines('range: a..b') }), null);
  assert.equal(rangeNoteOfSpec(null), null);
  assert.match(String(rangeNoteOfSpec(review('Review range: v1..v2 for bugs'))), /^This review covers v1\.\.v2\. /);
  assert.match(String(rangeNoteOfSpec(review('Review branch: feat for bugs'))), /^This review covers main\.\.feat\. /);
});
