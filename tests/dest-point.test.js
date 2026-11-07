// R7b (3), hamr's option A: the drafting AI POINTS when a job line's file to change lies outside Destination; plain code checks every claim and asks ONE typed yes/no question
// (words owned by code); "yes" sets the session's fence AND the card's Destination, "no" goes on unchanged. $0: the model is a fake loop / a stub seam; the check, the question,
// the wiring and the signed fence are the real code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { destinationCovers, decideDestPoint, destQuestionText, yesNoOf, runDestPoint, destPrompt, DEST_CALL_LABEL } from '../src/destpoint.js';
import { createSession } from '../src/panel/authorsession.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

const FILES = ['src/sum.js', 'src/deep/x.js', 'docs/a.md', 'README.md', 'test/sum.test.js'];
const LINES = [{ n: 1, text: 'Fix the bug in src/sum.js so the tests in test/sum.test.js pass' }, { n: 2, text: 'make npm test pass' }];
const reply = (points) => JSON.stringify({ points });
const good = { line: 1, file: 'src/sum.js', folder: 'src/' };

test('destinationCovers: a folder, a file, several pieces, a glob and the root cover; a sibling folder and a longer name do not', () => {
  for (const [f, d] of [['src/sum.js', 'src/'], ['src/sum.js', 'src'], ['src/sum.js', 'src/sum.js'], ['src/sum.js', 'docs/, src/'], ['src/deep/x.js', 'src/**'], ['src/sum.js', 'src/*.js'], ['src/sum.js', '.'], ['src/sum.js', './src/']]) {
    assert.equal(destinationCovers(f, d), true, `${f} in ${d}`);
  }
  for (const [f, d] of [['src/sum.js', 'docs/'], ['src/sum.js', 'sr'], ['src/deep/x.js', 'src/*.js'], ['src/sum.js', 'src/sum.jsx'], ['src/sum.js', '']]) assert.equal(destinationCovers(f, d), false, `${f} not in ${d}`);
});

test('decideDestPoint: a real file named in its own line and outside Destination is a point; every other claim is dropped, a made-up file is no question', () => {
  const o = (destination, points) => decideDestPoint(reply(points), { jobLines: LINES, files: FILES, destination });
  assert.deepEqual(o('docs/', [good]), { status: 'ok', points: [{ line: 1, file: 'src/sum.js', folder: 'src/' }], dropped: 0 });
  assert.deepEqual(o('src/', [good]).points, [], 'inside Destination: no question');
  assert.equal(o('docs/', [{ ...good, file: 'src/made-up.js' }]).points.length, 0, 'a made-up file is no question');
  assert.equal(o('docs/', [{ line: 2, file: 'src/sum.js', folder: 'src/' }]).points.length, 0, 'the line does not hold that path (no guessing the intent)');
  assert.equal(o('docs/', [{ line: 9, file: 'src/sum.js', folder: 'src/' }]).points.length, 0, 'not a job line');
  assert.equal(o('docs/', [{ ...good, folder: 'lib/' }]).points.length, 0, 'the folder is not a parent of the file');
  assert.equal(o('docs/', [{ ...good, folder: '' }]).points.length, 0);
  assert.equal(o('docs/', [{ ...good, file: 'src/sum.j' }]).points.length, 0, 'a path the repo does not hold');
  assert.deepEqual(o('docs/', [{ line: 1, file: 'test/sum.test.js', folder: 'test/' }, good]).points.map((p) => p.file), ['test/sum.test.js', 'src/sum.js'], 'both are outside; ordered by line (stable), the first named first');
  const two = [{ n: 1, text: 'Edit src/sum.js' }, { n: 2, text: 'and edit docs/a.md' }];
  assert.deepEqual(decideDestPoint(reply([{ line: 2, file: 'docs/a.md', folder: 'docs/' }, { line: 1, file: 'src/sum.js', folder: 'src/' }]), { jobLines: two, files: FILES, destination: 'test/' }).points.map((p) => p.line), [1, 2], 'the lowest line is asked first');
  for (const bad of ['not json', '[]', '{}', JSON.stringify({ points: [1] }), JSON.stringify({ points: [{ line: 'x', file: 'a', folder: 'b' }] })]) assert.equal(decideDestPoint(bad, { jobLines: LINES, files: FILES, destination: 'docs/' }).status, 'malformed', bad);
});

test('the words are code\'s: one question, the answers are yes / no only', () => {
  assert.equal(destQuestionText({ line: 1, file: 'src/sum.js', folder: 'src/' }, 'docs/'),
    'Line 1 needs src/sum.js changed, but Destination is docs/, so the job could not change it. Set Destination to src/? Type yes to set it, or no to keep it as it is.');
  assert.match(destQuestionText({ line: 1, file: 'a/b.js', folder: 'a/' }, 'x/\ny/'), /Destination is x\/, y\/, so/);
  for (const y of ['yes', 'Yes.', ' Y ']) assert.equal(yesNoOf(y), 'yes');
  for (const n of ['no', 'No.', 'n']) assert.equal(yesNoOf(n), 'no');
  for (const x of ['', 'maybe', 'yes please', null]) assert.equal(yesNoOf(x), null);
});

test('the drafter is TOLD the rule with a legal example, and sees only the job lines and the Destination', () => {
  const p = destPrompt({ jobLines: LINES, destination: 'docs/' });
  assert.match(p, /copied exactly from that line/);
  assert.match(p, /Example: for the line "LINE 1: Fix the bug in src\/sum\.js/);
  assert.match(p, /\{"points":\[\{"line":1,"file":"src\/sum\.js","folder":"src\/"\}\]\}/);
  assert.match(p, /LINE 1: Fix the bug in src\/sum\.js/);
  assert.match(p, /Destination[^\n]*: docs\//);
  assert.doesNotMatch(p, /README\.md/, 'the file list never goes to the model');
});

/** a loop whose replies are scripted; counts calls */
const loopOf = (replies, seen = []) => () => ({ run: async (msgs) => { seen.push(msgs); const r = replies.shift(); if (r instanceof Error) throw r; return { text: r, usage: { inputTokens: 10, outputTokens: 5 } }; } });
test('runDestPoint: books its call, one retry on a malformed reply, then absent (drafting goes on); no point = none', async () => {
  const booked = [];
  const base = { jobLines: LINES, files: FILES, destination: 'docs/', onCall: (c) => booked.push(c.label) };
  const a = await runDestPoint({ ...base, createLoop: loopOf([reply([good])]) });
  assert.deepEqual([a.state, a.point], ['point', good]);
  assert.deepEqual(booked, [DEST_CALL_LABEL]);
  assert.equal((await runDestPoint({ ...base, createLoop: loopOf([reply([])]) })).state, 'none');
  const seen = [];
  assert.equal((await runDestPoint({ ...base, createLoop: loopOf(['junk', reply([good])], seen) })).state, 'point');
  assert.equal(seen.length, 2, 'one retry');
  const dead = await runDestPoint({ ...base, createLoop: loopOf(['junk', 'junk']) });
  assert.equal(dead.state, 'absent');
  assert.match(dead.reason, /not readable twice/);
});

// ── the wiring, through the real session ──
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
async function session(t, { destination, replyPoints, jobText = 'Fix the bug in src/mod.js so the tests pass\n~ no new deps\ntsc clean' }) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  mkdirSync(path.join(repo, 'docs'));
  writeFileSync(path.join(repo, 'docs', 'a.md'), '#\n');
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'docs']);
  const seams = draftSeams({});
  const got = {};
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { got.writeScope = o.writeScope; return inner(o); };
  const calls = [];
  const destFn = (o) => { calls.push(o); return runDestPoint({ ...o, createLoop: loopOf([reply(replyPoints)]) }); };
  const card = baseCard({ source: repo, jobName: 'dp-job', jobText, destination });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  return { s, calls, card, got };
}
/** wait for the plan menu, click it, and read the fence the composer was handed (the one the job is then signed with) */
async function signedFence(s, got) {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => got.writeScope !== undefined), 'the composer was never reached');
  return got.writeScope;
}
const point = { line: 1, file: 'src/mod.js', folder: 'src/' };

test('wiring: Destination docs/ and a job line naming src/mod.js -> ONE typed question; "yes" sets the fence and the card Destination, drafting goes on, the signed spec is fenced to src/', async (t) => {
  const { s, calls, card, got } = await session(t, { destination: 'docs/', replyPoints: [point] });
  assert.ok(await until(() => s.state.pendingAsk?.source === 'dest-point'), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(s.state.pendingAsk.kind, 'answer');
  assert.equal(s.state.pendingAsk.question, 'Line 1 needs src/mod.js changed, but Destination is docs/, so the job could not change it. Set Destination to src/? Type yes to set it, or no to keep it as it is.');
  assert.ok(calls[0].files.includes('src/mod.js') && calls[0].destination === 'docs/');
  assert.equal(s.send('maybe').ok, true);
  assert.ok(await until(() => s.state.messages.some((m) => /Type yes or no/.test(m.text))), 'anything else asks again');
  assert.equal(s.state.pendingAsk?.source, 'dest-point');
  assert.equal(s.send('yes').ok, true);
  assert.deepEqual(await signedFence(s, got), ['src/'], 'the fence the composer drafts under, so the one signed');
  assert.equal(s.state.card.destination, 'src/', 'the session\'s card (the page re-fills its box from it) says src/');
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, ['src/'], 'the SIGNED spec carries the answer');
  assert.equal(card.destination, 'docs/', 'the caller\'s own object is never mutated');
});

test('wiring: "no" keeps Destination as it is and drafting goes on with the old fence', async (t) => {
  const { s, got } = await session(t, { destination: 'docs/', replyPoints: [point] });
  assert.ok(await until(() => s.state.pendingAsk?.source === 'dest-point'));
  s.send('no');
  assert.deepEqual(await signedFence(s, got), ['docs/']);
  assert.equal(s.state.card.destination, 'docs/');
});

test('wiring: a file already inside Destination, a made-up file, or a line that does not hold the path asks NOTHING', async (t) => {
  for (const [destination, replyPoints] of [['src/', [point]], ['docs/', [{ ...point, file: 'src/ghost.js' }]], ['docs/', [{ ...point, line: 2 }]], ['docs/', []]]) {
    const { s, got } = await session(t, { destination, replyPoints });
    assert.deepEqual(await signedFence(s, got), [destination]);
    assert.equal(s.state.messages.some((m) => /Destination to/.test(m.text)), false);
  }
});

// ── the page re-fills the Destination box from the session's own card (the box is locked while a session is live) ──
import { world as pageWorld } from './flowtype-world.mjs';
test('page: syncDestinationFromSession sets the Destination box from the session\'s card when it changed, and touches nothing otherwise', async (t) => {
  const PAGE = await (await pageWorld(t, { serve: true })).page();
  const start = PAGE.indexOf('function syncDestinationFromSession(');
  assert.ok(start !== -1, 'the page has syncDestinationFromSession');
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  const box = { value: 'docs/' }; let fitted = 0;
  // eslint-disable-next-line no-new-func
  const sync = new Function('document', 'fitCardBoxes', `${PAGE.slice(start, i + 1)}\nreturn syncDestinationFromSession;`)({ getElementById: (id) => (id === 'jf-dest' ? box : null) }, () => { fitted += 1; });
  sync({ card: { destination: 'src/' } });
  assert.deepEqual([box.value, fitted], ['src/', 1]);
  sync({ card: { destination: 'src/' } });
  assert.equal(fitted, 1, 'unchanged: no re-fit');
  sync({}); sync({ card: {} }); sync(null);
  assert.equal(box.value, 'src/');
  assert.match(PAGE, /function renderActions\(state\)\{[\s\S]{0,400}syncDestinationFromSession\(state\)/, 'renderActions calls it on every poll');
});
