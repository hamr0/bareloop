// hamr 2026-11-23: EVERY new job needs at least one `~` rule (Change, Review and rubric alike). CODE counts the `~` lines at $0, BEFORE any model call (the review pick included); no model judges them.
// ONE owner (src/reviewpick.js `needsRuleRefusal`), called at the start of both doors. Only a NEW draft is checked: a Reuse replays a signed plan and is never asked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as rp from '../src/reviewpick.js';
import { createSession } from '../src/panel/authorsession.js';
import { main as authorMain } from '../src/authorrun.js';
import { prepareSource } from '../src/source.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { makeRangeWorld } from './range-world.mjs';

const WORDS = 'Add at least one rule (~) for this job — for example what the result must include, or what must stay true.';

test('needsRuleRefusal: code counts the ~ rules on the job lines; none = the one ask, one on any line = null', () => {
  assert.equal(rp.NEEDS_RULE_WORDS, WORDS);
  assert.equal(rp.needsRuleRefusal([{ n: 1, text: 'x' }]), WORDS);
  assert.equal(rp.needsRuleRefusal([{ n: 1, text: 'x', rule: '', rules: [] }]), WORDS);
  assert.equal(rp.needsRuleRefusal([{ n: 1, text: 'x' }, { n: 2, text: 'y', rules: ['must say why'] }]), null);
  assert.equal(rp.needsRuleRefusal([{ n: 1, text: 'x', rule: 'old field' }]), null);
  assert.equal(rp.needsRuleRefusal(null), null, 'no lines to count = nothing to refuse');
  assert.equal(rp.needsRuleRefusal([]), null);
});

test('panel door: a rubric (url/page-shaped) job with zero ~ is refused in the new words and no model function is called', async (t) => {
  const base = mkdtempSync(path.join(tmpdir(), 'needs-rule-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const file = path.join(base, 'in.txt'); writeFileSync(file, 'hello world\n');
  let called = 0;
  const boom = async () => { called += 1; throw new Error('a model function was called'); };
  const s = createSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'nr-rubric', jobText: '1. List the words', inputs: `Input: ${file}`, destination: path.join(base, 'out'), capUsd: 1 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(base, 'keys')), sessionsRoot: path.join(base, 's'),
    generate: boom, confirmGenerate: boom, authorFn: boom, reviewPick: boom,
  });
  assert.ok(await until(() => s.state.phase === 'refused' || s.state.phase === 'error' || s.state.pendingAsk !== null), `no stop (${s.state.phase})`);
  assert.equal(s.state.phase, 'refused', s.state.error);
  assert.ok(String(s.state.error).includes(WORDS), String(s.state.error));
  assert.equal(called, 0);
});

async function repoSession(t, jobText) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const seams = draftSeams({});
  let picks = 0;
  const s = createSession(baseCard({ source: repo, jobName: 'nr-repo', jobText, destination: 'src/' }), {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams,
    reviewPick: async () => { picks += 1; return { answer: 'review', reason: null }; },
  });
  return { s, picks: () => picks };
}

test('panel door: a review-shaped repo job with zero ~ is refused BEFORE the pick is called', async (t) => {
  const x = await repoSession(t, 'List the slow code in src/\nsay why');
  assert.ok(await until(() => x.s.state.phase === 'refused' || x.s.state.pendingAsk !== null), `no stop (${x.s.state.phase})`);
  assert.equal(x.s.state.phase, 'refused');
  assert.ok(String(x.s.state.error).includes(WORDS), String(x.s.state.error));
  assert.equal(x.picks(), 0, 'the pick AI was never called');
});

test('panel door: a job with one ~ passes through unchanged (the pick is asked)', async (t) => {
  const x = await repoSession(t, 'List the slow code in src/\n~ at least 3 items');
  assert.ok(await until(() => x.s.state.pendingAsk?.kind === 'menu' || x.s.state.phase === 'refused' || x.s.state.phase === 'error'), `no menu (${x.s.state.phase} ${x.s.state.error})`);
  assert.equal(x.picks(), 1);
  assert.notEqual(x.s.state.phase, 'refused', x.s.state.error);
});

async function cli(t, jobLines) {
  const w = makeRangeWorld(t);
  const base = mkdtempSync(path.join(tmpdir(), 'needs-rule-cli-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const p = await prepareSource({ source: w.repo, into: path.join(base, 'into'), destination: 'src/', worktree: path.join(base, 'into', 'tree') });
  assert.equal(p.stop, null, JSON.stringify(p));
  writeFileSync(path.join(base, 'answers.json'), '{}');
  writeFileSync(path.join(base, 'draft.json'), JSON.stringify({ schema: 'job-v1', job: 'nr-job', description: 'x', provider: 'anthropic-api', model: 'claude-sonnet-5', jobLines, goal: 'g', writeScope: ['src/'] }));
  let picks = 0; let e = ''; let o = '';
  const rc = await authorMain(['--source', /** @type {any} */ (p).tree, '--answers', path.join(base, 'answers.json'), '--draft', path.join(base, 'draft.json'), '--verdict', 'green', '--out', path.join(base, 'out')], {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, keysHome: keysHome(path.join(base, 'keys')), stdout: { write: (/** @type {string} */ s) => { o += s; } }, stderr: { write: (/** @type {string} */ s) => { e += s; } },
    reviewPick: async () => { picks += 1; return { answer: 'review', reason: null }; },
  });
  const spine = readdirSync(path.join(base, 'out')).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl')).map((f) => readFileSync(path.join(base, 'out', f), 'utf8')).join('');
  return { rc, e, o, spine, picks };
}

test('CLI door: zero ~ is refused in the same words before the pick (exit 2, the spine ends); one ~ reaches the pick', async (t) => {
  const r = await cli(t, [{ n: 1, text: 'Review the code in src/' }]);
  assert.equal(r.rc, 2, `${r.e}\n${r.o}`);
  assert.ok(r.e.includes(WORDS), r.e);
  assert.equal(r.picks, 0);
  assert.match(r.spine, /"author-end"/);
  const ok = await cli(t, [{ n: 1, text: 'Review the code in src/', rules: ['say why'] }]);
  assert.equal(ok.picks, 1, `${ok.e}\n${ok.o}`);
});
