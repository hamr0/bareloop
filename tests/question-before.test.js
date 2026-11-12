// hamr 2026-11-12 (bareloop's own two questions, signed with the question box): items D and E. The fit-check question shows [Go on] [Stop] and no box; the Destination question shows
// [Yes, set it to <folder>] [No, keep <current>] and a box for a different Destination, checked at $0 by the card's own Destination check. Real panel sessions; the model is scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path, { join } from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { decideFit, fitQuestionText, FIT_ANSWER } from '../src/fitcheck.js';
import { runDestPoint, destQuestionText, DEST_ANSWER } from '../src/destpoint.js';
import { boxFor, panelQuestionText, refuseChoice, CHOICE_SAYS } from '../src/questionbox.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
const reply = (points) => JSON.stringify({ points });
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { tmp, HERE } from './qbox-world.mjs';

// ── D: the fit check ──
const JOB_TEXT = 'List 3 flights from New York JFK to Miami with price and departure time';
const ASKS = ['flights from New York JFK', 'to Miami', 'price', 'departure time'];
const QUOTES = ['Leaves John F. Kennedy International Airport at 11:20 AM on Friday, November 20', 'arrives at Miami International Airport at 2:31 PM on Friday, November 20', '$289', '11:20 AM'];
const replyOf = (missing) => JSON.stringify({ asks: ASKS.map((ask, i) => (i < missing ? { line: 1, ask, found: false, quote: null } : { line: 1, ask, found: true, quote: QUOTES[i] })) });
const fitFn = async (o) => {
  o.onCall({ label: 'fit-check', costUsd: 0.004, unpricedRounds: 0, raw: replyOf(2) });
  const d = decideFit(replyOf(2), o.jobLines, o.texts);
  return { state: d.state, asks: d.asks, notFound: d.notFound, reason: null, cause: null, budgetStop: null, calls: [] };
};
function fitPanel() {
  const file = join(tmp(), 'flights.txt'); copyFileSync(join(HERE, 'fixtures', 'fit', 'jfk-mia.txt'), file);
  const sessionsRoot = tmp('qb-fit-sess-');
  const legs = [];
  const PLAN = { goal: 'List flights.', checks: [{ text: 'three flights are listed', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'qb-fit', jobText: `1. ${JOB_TEXT}`, inputs: `Flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(tmp('qb-fit-home-')), sessionsRoot, generate: async () => { throw new Error('no model call'); },
    lookFn: async () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } }),
    fitFn,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'line 1: nothing. Nothing was signed.' }] }; },
  });
  const log = () => readFileSync(join(sessionsRoot, readdirSync(sessionsRoot)[0], DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { session, legs, log };
}
const fitAsking = (s) => s.state.pendingAsk?.source === 'fit-check';

test('D: the fit question has [Go on] [Stop] and no answer box; the box shows it without the typed words, the stored question and the CLI keep them', async () => {
  const { session } = fitPanel();
  assert.ok(await until(() => fitAsking(session)), `${session.state.phase} / ${session.state.error}`);
  const ask = session.state.pendingAsk;
  assert.deepEqual(ask.box.choices, [{ choice: 'go-on', label: 'Go on' }, { choice: 'stop', label: 'Stop' }]);
  assert.equal(ask.box.orLabel, null, 'no answer box');
  assert.equal(ask.box.text.endsWith('.'), true);
  assert.doesNotMatch(ask.box.text, /Type go on/);
  assert.match(ask.box.text, /^I found 2 of 4 of your asks on this page\. Not found: flights from New York JFK \(line 1\), to Miami \(line 1\)\.$/);
  assert.ok(ask.question.endsWith(FIT_ANSWER), 'the stored question keeps its words');
  assert.equal(session.state.messages.at(-1).askOpen, true);
  assert.equal(panelQuestionText({ question: 'Not found: x. Type go on to keep drafting.', source: 'fit-check' }), 'Not found: x. Type go on to keep drafting.', 'only the exact suffix');
});

test('D: Go on = today\'s "go on" (drafting continues); the human row says the choice', async () => {
  const { session, legs, log } = fitPanel();
  assert.ok(await until(() => fitAsking(session)));
  assert.deepEqual(session.send('', 'go-on'), { ok: true });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  const h = log().filter((e) => e.kind === 'human');
  assert.deepEqual(h.map((e) => [e.source, e.answer, e.choice]), [['fit-check', 'go on', 'go-on']]);
  assert.equal(legs.length, 0);
});

test('D: Stop = today\'s "anything else stops"; any other choice is refused with the generic words and the question stays open', async () => {
  const { session } = fitPanel();
  assert.ok(await until(() => fitAsking(session)));
  for (const c of ['agree', 'yes', 'rule', 'path', 'maybe', 5]) {
    const r = session.send('go on', c);
    assert.deepEqual([r.ok, r.error], [false, CHOICE_SAYS.bad], String(c));
  }
  assert.ok(fitAsking(session), 'still open');
  assert.deepEqual(session.send('', 'stop'), { ok: true });
  assert.ok(await until(() => ['refused', 'error', 'stopped'].includes(session.state.phase)), session.state.phase);
  assert.match(String(session.state.error), /Stopped before drafting: the page does not show everything the job asks for/);
});

test('D: no choice (the old words path) still works: typing "go on" goes on', async () => {
  const { session } = fitPanel();
  assert.ok(await until(() => fitAsking(session)));
  assert.deepEqual(session.send('go on'), { ok: true });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
});

// ── E: the Destination question ──
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
const point = { line: 1, file: 'src/mod.js', folder: 'src/' };
const loopOf = (replies) => () => ({ run: async () => ({ text: replies.shift(), usage: { inputTokens: 10, outputTokens: 5 } }) });
async function destSession(t) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  mkdirSync(path.join(repo, 'docs')); writeFileSync(path.join(repo, 'docs', 'a.md'), '#\n');
  mkdirSync(path.join(repo, 'lib')); writeFileSync(path.join(repo, 'lib', 'b.js'), '//\n');
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'docs']);
  const seams = draftSeams({});
  const got = {};
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { got.writeScope = o.writeScope; return inner(o); };
  const destFn = (o) => runDestPoint({ ...o, createLoop: loopOf([reply([point])]) });
  const card = baseCard({ source: repo, jobName: 'qb-dest', jobText: 'Fix the bug in src/mod.js so the tests pass\n~ no new deps\ntsc clean', destination: 'docs/' });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  const log = () => readFileSync(path.join(w.base, 's', readdirSync(path.join(w.base, 's'))[0], DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { s, got, log };
}
const destAsking = (s) => s.state.pendingAsk?.source === 'dest-point';
async function fence(s, got) {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => got.writeScope !== undefined));
  return got.writeScope;
}

test('E: the Destination question has [Yes, set it to <folder>] [No, keep <current>] and the box "Or type a different Destination:"; the typed-words tail is hidden in the panel only', async (t) => {
  const { s } = await destSession(t);
  assert.ok(await until(() => destAsking(s)), `${s.state.phase} ${s.state.error}`);
  const ask = s.state.pendingAsk;
  assert.deepEqual(ask.box.choices, [{ choice: 'yes', label: 'Yes, set it to src/' }, { choice: 'no', label: 'No, keep docs/' }]);
  assert.equal(ask.box.orLabel, 'Or type a different Destination:');
  assert.equal(ask.box.sendChoice, 'path');
  assert.equal(ask.box.text, 'Line 1 needs src/mod.js changed, but Destination is docs/, so the job could not change it. Set Destination to src/?');
  assert.ok(ask.question.endsWith(DEST_ANSWER), 'the stored question (and the CLI) keep "Type yes to set it, or no to keep it as it is."');
  assert.equal(ask.question, destQuestionText(point, 'docs/'));
});

test('E: Yes sets the fence and the card Destination; the log row says yes with the real from/to', async (t) => {
  const { s, got, log } = await destSession(t);
  assert.ok(await until(() => destAsking(s)));
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  assert.deepEqual(await fence(s, got), ['src/']);
  assert.equal(s.state.card.destination, 'src/');
  const row = log().find((e) => e.kind === 'dest-answer');
  assert.deepEqual([row.answer, row.from, row.to], ['yes', 'docs/', 'src/']);
  assert.deepEqual(log().filter((e) => e.kind === 'human').map((e) => [e.source, e.answer, e.choice]), [['dest-point', 'yes', 'yes']], 'the human row keeps the answer words and the button');
});

test('E: No keeps Destination as it is', async (t) => {
  const { s, got } = await destSession(t);
  assert.ok(await until(() => destAsking(s)));
  assert.deepEqual(s.send('', 'no'), { ok: true });
  assert.deepEqual(await fence(s, got), ['docs/']);
  assert.equal(s.state.card.destination, 'docs/');
});

test('E: a typed Destination that passes the card\'s own check is taken (fence, card, log row "typed")', async (t) => {
  const { s, got, log } = await destSession(t);
  assert.ok(await until(() => destAsking(s)));
  assert.deepEqual(s.send('lib/', 'path'), { ok: true });
  assert.deepEqual(await fence(s, got), ['lib/']);
  assert.equal(s.state.card.destination, 'lib/');
  const row = log().find((e) => e.kind === 'dest-answer');
  assert.deepEqual([row.answer, row.from, row.to], ['typed', 'docs/', 'lib/']);
});

test('E: a typed Destination the card check refuses (absolute, not in the repo) keeps the question open with that check\'s own words; nothing is logged or said', async (t) => {
  const { s, log } = await destSession(t);
  assert.ok(await until(() => destAsking(s)));
  const before = JSON.stringify(s.state.messages);
  const abs = s.send('/tmp/elsewhere', 'path');
  assert.deepEqual([abs.ok, abs.error], [false, 'Destination must be a path inside the repo, like src/digest.js']);
  const gone = s.send('nope/', 'path');
  assert.equal(gone.ok, false);
  assert.match(gone.error, /^Destination `nope\/` is not a folder or file in this repo\. /);
  assert.equal(s.send('  ', 'path').error, CHOICE_SAYS.blank);
  assert.equal(JSON.stringify(s.state.messages), before);
  assert.ok(destAsking(s), 'still open');
  assert.equal(log().some((e) => e.kind === 'dest-answer'), false, 'nothing logged');
  assert.equal(s.send('', 'agree').error, CHOICE_SAYS.bad, 'a look choice is not one of this question\'s');
  assert.deepEqual(s.send('', 'yes'), { ok: true }, 'and a good answer still lands');
});

test('E: no choice (old words path): "yes" and "no" still work, anything else asks again', async (t) => {
  const { s, got } = await destSession(t);
  assert.ok(await until(() => destAsking(s)));
  s.send('maybe');
  assert.ok(await until(() => s.state.messages.some((m) => /Type yes or no/.test(m.text))));
  s.send('yes');
  assert.deepEqual(await fence(s, got), ['src/']);
});

test('boxFor / refuseChoice: the choice tables of the two questions', () => {
  assert.equal(refuseChoice({ kind: 'answer', source: 'dest-point' }, 'path'), null);
  assert.equal(refuseChoice({ kind: 'answer', source: 'dest-point' }, 'go-on'), CHOICE_SAYS.bad);
  assert.equal(refuseChoice({ kind: 'answer', source: 'fit-check' }, 'go-on'), null);
  assert.equal(refuseChoice({ kind: 'answer', source: 'fit-check' }, 'path'), CHOICE_SAYS.bad);
  assert.equal(boxFor({ kind: 'answer', source: 'fit-check', question: fitQuestionText({ found: 1, total: 2, notFound: [{ line: 1, ask: 'x' }] }) })?.orLabel, null);
});
