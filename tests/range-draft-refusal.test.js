// Part 2 (hamr 2026-11-21): "a refusal for no branch shouldn't have started a run, a refusal for the job should be at draft, failure is red, refusal should be at the draft."
// The job-text refusals that git alone decides (many tokens, a range end or a branch that is not there, a review branch with no `main`) happen at the START of drafting: before the worktree, before npm ci, before any model call,
// in BOTH doors, in the SAME words (src/rangereview.js `draftRefusal`). This file: the panel door (the real session, existing seams). REAL git in a real temp repo (tests/range-world.mjs). The CLI door: tests/range-draft-refusal-cli.test.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { draftRefusal } from '../src/rangereview.js';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { makeRangeWorld } from './range-world.mjs';
import { gitInPatient } from './helpers.js';

const MANY = 'A job can name one range or one branch, and this one names 2 (range: v1..v2, branch: feat). Keep one. Nothing spent.';
const BAD_END = '"v9.9.9" is not a commit, tag or branch of this repo, so the range cannot be reviewed. Nothing spent.';
const NO_BRANCH = 'This repo has no branch named "no-such-branch". Nothing spent.';
const NO_MAIN = 'This repo has no branch named main, so branch "feat" cannot be compared with it. Use a range (range: A..B) instead. Nothing spent.';
const lines = (/** @type {string[]} */ ...t) => t.map((text, i) => ({ n: i + 1, text }));

/** the range repo with a lock-filed package.json on main, so a drafting that got as far as the install WOULD call npm ci */
function repoWithInstall(/** @type {import('node:test').TestContext} */ t) {
  const w = makeRangeWorld(t);
  writeFileSync(path.join(w.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { 'left-pad': '1.3.0' } }));
  writeFileSync(path.join(w.repo, 'package-lock.json'), '{}');
  gitInPatient(w.repo, ['add', '-A']);
  gitInPatient(w.repo, ['commit', '-q', '-m', 'deps']);
  return w;
}

async function panel(/** @type {import('node:test').TestContext} */ t, /** @type {string|((w: {c0: string, c1: string, c2: string}) => string)} */ jobTextOf, /** @type {string} */ pick, /** @type {(repo: string) => void} */ prep = () => {}) {
  const w = await world(t, { serve: false });
  const rw = repoWithInstall(t);
  prep(rw.repo);
  const jobText = typeof jobTextOf === 'function' ? jobTextOf(rw) : jobTextOf;
  const seams = draftSeams({});
  const calls = { author: 0, npm: 0, pick: 0, generate: 0 };
  const inner = seams.authorFn;
  seams.authorFn = async (/** @type {any} */ o) => { calls.author += 1; return inner(o); };
  const card = baseCard({ source: rw.repo, jobName: 'rv-job', jobText, destination: 'src/' });
  const s = createSession(card, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams,
    npmCiFn: async (/** @type {string} */ dir) => { calls.npm += 1; mkdirSync(path.join(dir, 'node_modules'), { recursive: true }); return { ok: true }; },
    reviewPick: async () => { calls.pick += 1; return { answer: pick, reason: null }; },
  });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu' || s.state.phase === 'refused' || s.state.phase === 'error' || s.state.phase === 'install-needed'), `nothing happened (${s.state.phase})`);
  const worktrees = existsSync(path.join(rw.repo, '.bareloop', 'wt')) ? readdirSync(path.join(rw.repo, '.bareloop', 'wt')) : [];
  return { s, calls, worktrees, rw };
}

for (const [name, text, words] of /** @type {[string, string, string][]} */ ([
  ['two tokens', 'Review range: v1..v2 for bugs\nand branch: feat', MANY],
  ['a range end that is not there', 'Review range: v9.9.9..v1 for bugs', BAD_END],
  ['a branch that is not there', 'Review branch: no-such-branch for bugs', NO_BRANCH],
])) {
  test(`panel door: ${name} is refused at the START of drafting: no worktree, no npm ci, no pick, no model call`, async (t) => {
    const a = await panel(t, text, 'review');
    assert.equal(a.s.state.phase, 'refused', `phase ${a.s.state.phase}`);
    assert.equal(a.s.state.error, words);
    assert.deepEqual(a.worktrees, [], 'no worktree was made');
    assert.deepEqual(a.calls, { author: 0, npm: 0, pick: 0, generate: 0 }, 'nothing ran');
  });
}

test('panel door: a review branch in a repo with no main is refused in the plain words right after the pick (git cannot know change-or-review before it); a change job\'s branch is NOT refused', async (t) => {
  const noMain = (/** @type {string} */ repo) => gitInPatient(repo, ['branch', '-m', 'main', 'trunk']);
  const a = await panel(t, 'Review branch: feat for bugs', 'review', noMain);
  assert.equal(a.s.state.phase, 'refused');
  assert.equal(a.s.state.error, NO_MAIN);
  assert.equal(a.calls.author, 0);
  const b = await panel(t, 'Make branch: feat pass the tests\n~ keep the API', 'change', noMain);
  assert.notEqual(b.s.state.phase, 'refused', String(b.s.state.error));
});

test('draftRefusal: one helper, the same words; a legal token, or none, is null', async (t) => {
  const w = makeRangeWorld(t);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('range: v1..v2', 'branch: feat') }), MANY);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('range: v9.9.9..v1') }), BAD_END);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('range: v1..feat') }), null);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('branch: feat') }), null);
  assert.equal(await draftRefusal({ repo: w.repo, jobLines: lines('fix it') }), null);
});

test('panel door: a range given as SHORT hashes and as FULL hashes drafts (reaches the menu, no refusal)', async (t) => {
  for (const [label, text] of /** @type {[string, (w: {c0: string, c1: string}) => string][]} */ ([
    ['short', (w) => `Review range: ${w.c0.slice(0, 7)}..${w.c1.slice(0, 7)} for bugs`],
    ['full', (w) => `Review range: ${w.c0}..${w.c1} for bugs`],
  ])) {
    const a = await panel(t, text, 'review');
    assert.equal(a.s.state.pendingAsk?.kind, 'menu', `${label}: phase ${a.s.state.phase} ${a.s.state.error ?? ''}`);
    assert.equal(a.s.state.phase === 'refused', false, label);
  }
});
