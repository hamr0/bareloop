// Part 2 (hamr 2026-11-21): the CLI door refuses the job-text range/branch refusals at the START, in the SAME words as the panel door (src/rangereview.js `draftRefusal`, one helper): before the pick (no model call), exit 2, the spine ends, nothing spent.
// The real author script over a real prepared repo copy (real git, tests/range-world.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main as authorMain } from '../src/authorrun.js';
import { prepareSource } from '../src/source.js';
import { keysHome } from './flowtype-world.mjs';
import { makeRangeWorld } from './range-world.mjs';
import { gitInPatient } from './helpers.js';

const BAD_END = '"v9.9.9" is not a commit, tag or branch of this repo, so the range cannot be reviewed. Nothing spent.';
const NO_BRANCH = 'This repo has no branch named "no-such-branch". Nothing spent.';
const NO_MAIN = 'This repo has no branch named main, so branch "feat" cannot be compared with it. Use a range (range: A..B) instead. Nothing spent.';
const lines = (/** @type {string[]} */ ...t) => t.map((text, i) => ({ n: i + 1, text }));

// ── CLI door: the real author script over a real prepared repo copy
async function cli(/** @type {import('node:test').TestContext} */ t, /** @type {{n: number, text: string}[]} */ jobLines, /** @type {(repo: string) => void} */ prep = () => {}) {
  const w = makeRangeWorld(t);
  prep(w.repo);
  const base = mkdtempSync(path.join(tmpdir(), 'range-cli-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const p = await prepareSource({ source: w.repo, into: path.join(base, 'into'), destination: 'src/', worktree: path.join(base, 'into', 'tree') });
  assert.equal(p.stop, null, JSON.stringify(p));
  writeFileSync(path.join(base, 'answers.json'), '{}');
  writeFileSync(path.join(base, 'draft.json'), JSON.stringify({ schema: 'job-v1', job: 'rv-job', description: 'x', provider: 'anthropic-api', model: 'claude-sonnet-5', jobLines, goal: 'g', writeScope: ['src/'] }));
  let picks = 0; let e = ''; let o = '';
  const rc = await authorMain(['--source', /** @type {any} */ (p).tree, '--answers', path.join(base, 'answers.json'), '--draft', path.join(base, 'draft.json'), '--verdict', 'green', '--out', path.join(base, 'out')], {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, keysHome: keysHome(path.join(base, 'keys')), stdout: { write: (/** @type {string} */ s) => { o += s; } }, stderr: { write: (/** @type {string} */ s) => { e += s; } },
    reviewPick: async () => { picks += 1; return { answer: 'review', reason: null }; },
  });
  const spine = readdirSync(path.join(base, 'out')).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl')).map((f) => readFileSync(path.join(base, 'out', f), 'utf8')).join('');
  return { rc, e, o, spine, picks };
}

for (const [name, jl, words] of /** @type {[string, {n: number, text: string}[], string][]} */ ([
  ['a range end that is not there', lines('Review range: v9.9.9..v1 for bugs'), BAD_END],
  ['a branch that is not there', lines('Review branch: no-such-branch for bugs'), NO_BRANCH],
])) {
  test(`CLI door: ${name} is refused in the SAME words before the pick (exit 2, the spine ends, nothing is spent)`, async (t) => {
    const r = await cli(t, jl);
    assert.equal(r.rc, 2, `${r.e}\n${r.o}`);
    assert.ok(r.e.includes(words), r.e);
    assert.equal(r.picks, 0, 'no pick call');
    assert.match(r.spine, /"author-end"/);
    assert.doesNotMatch(r.spine, /author-cost/);
  });
}

test('CLI door: a review branch in a repo with no main is refused after the pick, in the same words', async (t) => {
  const r = await cli(t, lines('Review branch: feat for bugs'), (repo) => gitInPatient(repo, ['branch', '-m', 'main', 'trunk']));
  assert.equal(r.rc, 2, `${r.e}\n${r.o}`);
  assert.ok(r.e.includes(NO_MAIN), r.e);
});
