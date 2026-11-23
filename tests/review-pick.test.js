// REVIEW THE CODE, clean build item 1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the crossroads of a Deterministic repo job, and the WRITER of the signed source. ONE shared function (`chooseRoad`)
// serves both doors; the binary question is one prompt register; failure is OPEN toward "change" (today's D flow). $0: the model is a scripted loop / a stub seam.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decideReviewPick, reviewPickPrompt, runReviewPick, chooseRoad, makePick, REVIEW_CALL_LABEL, REVIEW_PICK_SYSTEM } from '../src/reviewpick.js';
import { isPromptFile } from '../src/promptregisters.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { createSession } from '../src/panel/authorsession.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LINES = [{ n: 1, text: 'List the slow code in src/', rules: ['at least 3 items'] }, { n: 2, text: 'say why' }];
const loopOf = (replies, seen = []) => () => ({ run: async (msgs) => { seen.push(msgs); const r = replies.shift(); if (r instanceof Error) throw r; return { text: r, usage: { inputTokens: 10, outputTokens: 5 } }; } });
const kind = (k) => JSON.stringify({ kind: k });

test('the reply is read in code: exactly {"kind":"review"} or {"kind":"change"}, anything else is malformed (never repaired)', () => {
  assert.equal(decideReviewPick(kind('review')), 'review');
  assert.equal(decideReviewPick(` ${kind('change')} \n`), 'change');
  for (const bad of ['review', 'not json', '[]', '{}', JSON.stringify({ kind: 'Review' }), JSON.stringify({ kind: 'maybe' }), '```json\n{"kind":"review"}\n```', null, undefined]) assert.equal(decideReviewPick(bad), 'malformed', String(bad));
});

test('the prompt is ONE binary question over the job lines and their ~ rules, with the one legal reply; it is a labelled prompt register', () => {
  const p = reviewPickPrompt(LINES);
  assert.match(p, /LINE 1: List the slow code in src\/\n {2}~ at least 3 items/);
  assert.match(p, /LINE 2: say why/);
  assert.match(p, /CHANGE the code of the repository[^?]*, or to REVIEW it/);
  assert.match(p, /\{"kind":"change"\} or \{"kind":"review"\}/);
  assert.equal(REVIEW_CALL_LABEL, 'review-pick');
  assert.match(REVIEW_PICK_SYSTEM, /one question/);
  assert.equal(isPromptFile('src/reviewpick.js'), true, 'a commit touching it needs the Failure/Addresses/Corrects labels');
});

test('runReviewPick: books its call, one retry on a malformed reply, then absent (the D flow); a transport failure is retried once', async () => {
  const booked = [];
  const base = { jobLines: LINES, onCall: (c) => booked.push(c.label) };
  const a = await runReviewPick({ ...base, createLoop: loopOf([kind('review')]) });
  assert.deepEqual([a.answer, a.reason], ['review', null]);
  assert.deepEqual(booked, [REVIEW_CALL_LABEL]);
  assert.equal((await runReviewPick({ ...base, createLoop: loopOf([kind('change')]) })).answer, 'change');
  const seen = [];
  assert.equal((await runReviewPick({ ...base, createLoop: loopOf(['junk', kind('review')], seen) })).answer, 'review');
  assert.equal(seen.length, 2, 'one retry');
  const dead = await runReviewPick({ ...base, createLoop: loopOf(['junk', 'junk']) });
  assert.equal(dead.answer, 'absent');
  assert.match(dead.reason, /not readable twice/);
  const capped = await runReviewPick({ ...base, ceilingUsd: 0, createLoop: loopOf([kind('review')]) });
  assert.deepEqual([capped.answer, /spend ceiling/.test(String(capped.reason))], ['absent', true], 'the cap binds: no question, the D flow');
});

test('chooseRoad: ONLY a green job on a repo source with job lines is asked; a review takes the rubric road (soft-green, the text language); a change returns nothing the D flow reads', async () => {
  let asked = 0;
  const pick = (answer) => async () => { asked += 1; return { answer, reason: null }; };
  const r = await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: LINES, pick: pick('review') });
  assert.deepEqual(r, { review: true, answer: 'review', reason: null, verdictType: 'soft-green', lang: RUBRIC_LANG, rubricFiles: true, writeScope: ['output/'], source: 'repo' });
  assert.equal(RUBRIC_LANG, 'text');
  assert.deepEqual(await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: LINES, pick: pick('change') }), { review: false, answer: 'change', reason: null });
  assert.deepEqual(await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: LINES, pick: async () => ({ answer: 'absent', reason: 'it failed' }) }), { review: false, answer: 'absent', reason: 'it failed' }, 'failure is open: the D flow');
  asked = 0;
  for (const o of [{ verdictType: 'soft-green' }, { isRepoSource: false }, { jobLines: [] }, { jobLines: null }, { pick: null }]) {
    const got = await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: LINES, pick: pick('review'), ...o });
    assert.deepEqual(got, { review: false, answer: null, reason: null }, JSON.stringify(Object.keys(o)));
  }
  assert.equal(asked, 0, 'no question is asked for any other job');
});

test('makePick binds the door\'s provider: the call goes through runReviewPick and is booked', async () => {
  const booked = [];
  const r = await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: LINES, pick: makePick({ onCall: (c) => booked.push(c.label), createLoop: loopOf([kind('review')]) }) });
  assert.equal(r.review, true);
  assert.deepEqual(booked, [REVIEW_CALL_LABEL]);
});

test('both doors call the ONE shared function (not two copies)', () => {
  for (const f of ['../src/authorrun.js', '../src/panel/authorsession.js']) {
    const src = readFileSync(join(HERE, f), 'utf8');
    assert.match(src, /import \{[^}]*\bchooseRoad\b[^}]*\} from '(\.\.?)\/(\.\.\/)?reviewpick\.js'/, `${f} imports chooseRoad`);
    assert.equal((src.match(/\bchooseRoad\(/g) ?? []).length, 1, `${f} calls it once`);
    assert.doesNotMatch(src, /reviewPickPrompt|decideReviewPick|runReviewPick/, `${f} holds no copy of the question`);
  }
});

// ── the wiring, through the real panel session ──
async function session(t, { pick, jobText = 'List the slow code in src/\n~ at least 3 items' }) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const seams = draftSeams({});
  const got = { calls: [] };
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { got.calls.push({ verdictType: o.verdictType, lang: o.lang, writeScope: o.writeScope, source: o.source }); return inner(o); };
  const asked = [];
  const reviewPick = pick === undefined ? undefined : async (lines) => { asked.push(lines.map((l) => l.n)); return pick; };
  const card = baseCard({ source: repo, jobName: 'rv-job', jobText, destination: 'src/' });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, ...(reviewPick ? { reviewPick } : {}) });
  return { s, got, asked };
}
/** wait for the plan menu, click it, and wait until the composer was handed its arguments */
async function drafted({ s, got }) {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu' || s.state.phase === 'refused' || s.state.phase === 'error'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => got.calls.length > 0), `the composer was never reached (${s.state.phase} ${s.state.error})`);
}

test('panel door: a D repo job the drafter picks as "review" is drafted on the rubric road (soft-green, text close language)', async (t) => {
  const x = await session(t, { pick: { answer: 'review', reason: null } });
  const { got, asked } = x;
  await drafted(x);
  assert.deepEqual(asked, [[1]], 'the question was asked once, over the job lines');
  assert.deepEqual([got.calls[0].verdictType, got.calls[0].lang], ['soft-green', 'text']);
  assert.deepEqual(got.calls[0].writeScope, ['output/'], 'a review\'s fence is the rubric road\'s own: output/ alone, Destination is where code writes the report (clean item 4)');
  assert.equal(got.calls[0].source, 'repo', 'the crossroads WRITES the signed source');
});

test('panel door: "change" is today\'s D flow, untouched (green, the repo language)', async (t) => {
  const x = await session(t, { pick: { answer: 'change', reason: null }, jobText: 'List the slow code in src/\n~ at least 3 items' });
  const { got, asked } = x;
  await drafted(x);
  assert.deepEqual(asked, [[1]]);
  assert.deepEqual([got.calls[0].verdictType, got.calls[0].lang], ['green', 'js']);
  assert.deepEqual(got.calls[0].writeScope, ['src/'], 'the D fence is Destination alone, as before');
  assert.equal(got.calls[0].source, 'files', 'a change signs no repo source');
});

test('panel door: a test that replaces the model boundary asks NO question and the job is a change', async (t) => {
  const x = await session(t, { pick: undefined });
  const { got } = x;
  await drafted(x);
  assert.equal(got.calls[0].verdictType, 'green');
});

test('chooseRoad no longer counts ~ rules (hamr 2026-11-23: the count moved to the doors\' start, tests/job-needs-rule.test.js, before any model call): a no-~ change/review/absent pick is read as before', async () => {
  const pick = (answer) => async () => ({ answer, reason: null });
  const bare = [{ n: 1, text: 'Fix the failing test' }];
  const ch = await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: bare, pick: pick('change') });
  assert.deepEqual(ch, { review: false, answer: 'change', reason: null });
  assert.equal((await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: bare, pick: pick('review') })).review, true);
  assert.equal((await chooseRoad({ verdictType: 'green', isRepoSource: true, jobLines: bare, pick: pick('absent') })).refusal, undefined);
});
