// Part 2 item 3 (ITEM33-BUILD "Part 2 build spec"): the crossroads refuses, in plain words and before any run spend, a job that names more than one range/branch token, and a `range:` on a job the drafter reads as a change.
// ONE shared function (`chooseRoad`), BOTH doors: the panel's session (src/panel/authorsession.js) and the CLI's author script (src/authorrun.js), the same words. A `branch:` on a change job is legal (the work branch starts at its tip).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chooseRoad } from '../src/reviewpick.js';
import { createSession } from '../src/panel/authorsession.js';
import { main as authorMain } from '../src/authorrun.js';
import { prepareSource } from '../src/source.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

const MANY = 'A job can name one range or one branch, and this one names 2 (range: v1..v2, branch: feat). Keep one. Nothing spent.';
const CHANGE_RANGE = 'Line 1 names a range to review, but this job changes code. A range can only be reviewed, not changed. Write it as a review, or take the range out. Nothing spent.';
const ruled = (/** @type {string} */ text) => [{ n: 1, text, rule: 'keep the API', rules: ['keep the API'] }];
const lines = (/** @type {string[]} */ ...t) => t.map((text, i) => ({ n: i + 1, text }));
const picker = (/** @type {string} */ answer) => { const calls = []; return Object.assign(async (/** @type {any} */ l) => { calls.push(l); return { answer, reason: null }; }, { calls }); };
const road = (/** @type {any} */ jobLines, /** @type {any} */ pick) => chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines, pick });

test('chooseRoad: many tokens are refused BEFORE the pick (no call is made); a range on a change pick is refused; a branch on a change pick is not; a review with a token is not', async () => {
  const p1 = picker('review');
  assert.deepEqual(await road(lines('Review range: v1..v2 and branch: feat'), p1), { review: false, answer: null, reason: null, refusal: MANY });
  assert.equal(p1.calls.length, 0, 'refused before the AI is asked');
  assert.equal((await road(lines('Review range: v1..v2 for bugs'), picker('change'))).refusal, CHANGE_RANGE);
  assert.deepEqual(await road(ruled('Make branch: feat pass the tests'), picker('change')), { review: false, answer: 'change', reason: null }, 'branch on a change job: legal');
  const rv = await road(lines('Review range: v1..v2 for bugs'), picker('review'));
  assert.equal(rv.review, true);
  assert.equal('refusal' in rv, false);
  assert.deepEqual(await road(ruled('fix the tests'), picker('change')), { review: false, answer: 'change', reason: null });
});

// ── panel door
async function panel(t, jobText, pick) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const seams = draftSeams({});
  let authored = 0;
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { authored += 1; return inner(o); };
  const card = baseCard({ source: repo, jobName: 'rv-job', jobText, destination: 'src/' });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, reviewPick: async () => ({ answer: pick, reason: null }) });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu' || s.state.phase === 'refused' || s.state.phase === 'error'), `nothing happened (${s.state.phase})`);
  return { s, authored: () => authored };
}

test('panel door: two tokens, and a range on a change job, are refused in the plain words; nothing is authored', async (t) => {
  const a = await panel(t, 'Review range: v1..v2 for bugs\nand branch: feat\n~ say why', 'review');
  assert.equal(a.s.state.phase, 'refused');
  assert.equal(a.s.state.error, MANY);
  assert.equal(a.authored(), 0);
  // main..main: both ends exist in the real repo, so the draft-start check passes and the change-pick refusal (which needs the pick) is the one that fires
  const b = await panel(t, 'Review range: main..main for bugs\n~ say why', 'change');
  assert.equal(b.s.state.phase, 'refused');
  assert.equal(b.s.state.error, CHANGE_RANGE);
  assert.equal(b.authored(), 0);
});

// ── CLI door: the real author script over a real prepared repo copy, the draft's lines carry the tokens
async function cli(t, jobLines, reviewPick) {
  const base = mkdtempSync(path.join(tmpdir(), 'range-cli-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = makeRepo(path.join(base, 'repo'));
  const prep = await prepareSource({ source: repo, into: path.join(base, 'into'), destination: 'src/', worktree: path.join(base, 'into', 'tree') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  writeFileSync(path.join(base, 'answers.json'), '{}');
  writeFileSync(path.join(base, 'draft.json'), JSON.stringify({ schema: 'job-v1', job: 'rv-job', description: 'x', provider: 'anthropic-api', model: 'claude-sonnet-5', jobLines, goal: 'g', writeScope: ['src/'] }));
  let o = ''; let e = '';
  const rc = await authorMain(['--source', /** @type {any} */ (prep).tree, '--answers', path.join(base, 'answers.json'), '--draft', path.join(base, 'draft.json'), '--verdict', 'green', '--out', path.join(base, 'out')], {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, keysHome: keysHome(path.join(base, 'keys')), stdout: { write: (/** @type {string} */ s) => { o += s; } }, stderr: { write: (/** @type {string} */ s) => { e += s; } }, ...(reviewPick ? { reviewPick } : {}),
  });
  const spine = readdirSync(path.join(base, 'out')).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl')).map((f) => readFileSync(path.join(base, 'out', f), 'utf8')).join('');
  return { rc, o, e, spine };
}

test('CLI door: two tokens, and a range on a change job, are refused in the SAME plain words, exit 2, the spine ends, nothing is spent', async (t) => {
  const a = await cli(t, [{ n: 1, text: 'Review range: v1..v2 for bugs' }, { n: 2, text: 'and branch: feat', rules: ['say why'] }]);
  assert.equal(a.rc, 2, `${a.e}\n${a.o}`);
  assert.match(a.e, new RegExp(MANY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(a.spine, /"author-end"/);
  assert.doesNotMatch(a.spine, /author-cost/);
  const b = await cli(t, [{ n: 1, text: 'Review range: main..main for bugs', rules: ['say why'] }], async () => ({ answer: 'change', reason: null }));
  assert.equal(b.rc, 2, `${b.e}\n${b.o}`);
  assert.ok(b.e.includes(CHANGE_RANGE), b.e);
});
