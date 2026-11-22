// Destination fence (hamr 2026-11-22, spec GO): for a Change code job, the draft asks about Destination AFTER the scout, by code alone. A job line that names a file keeps the
// file check (src/destpoint.js, the AI points, code decides). A line that names NO file: code checks Destination holds at least one path the scout reported as code or tests
// (`sourcePaths`/`testPaths`, only those really in the committed tree); if not, ONE closed question (approve the scout's folders, or type a folder), 2 wrong answers then stop.
// The reply texts in tests/fixtures/dest-fence-replies.json are RAW replies of deepseek-flash (live, 2026-11-22) to an EARLIER prompt that also asked "inside yes/no"; the AI's `lines`
// is gone now, and these tests show it is ignored. The prompt golden (dest-prompt-head.json) is the text of 06760df9~1.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as dp from '../src/destpoint.js';
import { boxFor, refuseChoice, CHOICE_SAYS } from '../src/questionbox.js';
import { createSession } from '../src/panel/authorsession.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { draftStopText } from '../src/authorreadout.js';
import { classifySurvey } from '../src/authorscout.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

const REPLIES = JSON.parse(readFileSync(new URL('./fixtures/dest-fence-replies.json', import.meta.url), 'utf8'));
const HEAD_PROMPT = JSON.parse(readFileSync(new URL('./fixtures/dest-prompt-head.json', import.meta.url), 'utf8'));
const SCOUT_RAW = JSON.parse(readFileSync(new URL('./fixtures/dest-fence-scout.json', import.meta.url), 'utf8')).raw;
const FILES = ['src/sum.js', 'src/panel/a.js', 'bin/x.mjs', 'tests/t.test.js', 'tests/fixtures/f.json', 'docs/a.md', 'README.md', 'package.json'];
const FACTS = { sourcePaths: ['src/', 'bin/'], testPaths: ['tests/'] };
const SCOUT = ['src/', 'bin/', 'tests/'];
// the live F1 text names a branch ("... on branch: X"), which the panel reads as a review-by-branch token in a test repo with no such branch; the session tests use the same ask without the token
const F1_TEXT = 'Fix any failing test in the project';

test('destPrompt: every job gets the words it had at 06760df9~1, byte for byte (no per-line ask, a stray `change` changes nothing)', () => {
  const o = { jobLines: [{ n: 1, text: 'Fix the bug in src/sum.js so the tests in test/sum.test.js pass' }, { n: 2, text: 'make npm test pass' }], destination: 'docs/' };
  assert.equal(dp.destPrompt(o), HEAD_PROMPT);
  assert.equal(dp.destPrompt({ ...o, change: true }), HEAD_PROMPT, 'the AI is no longer asked "inside yes/no" for a Change code job');
  assert.doesNotMatch(dp.destPrompt({ ...o, change: true }), /inside/);
});

test('decideDestPoint: the AI\'s `lines` guess is ignored; only a named file outside Destination is a point', () => {
  const jobLines = [{ n: 1, text: REPLIES.F1.job }];
  assert.deepEqual(dp.decideDestPoint(REPLIES.F1.raw, { jobLines, files: FILES, destination: 'docs/', change: true }), { status: 'ok', points: [], dropped: 0 });
  assert.deepEqual(dp.decideDestPoint(REPLIES.P2.raw, { jobLines, files: FILES, destination: 'src/', change: true }).points, []);
  // a named top-of-repo file stays a point whose Destination is the file (06760df9)
  const r = dp.decideDestPoint(REPLIES.F3.raw, { jobLines: [{ n: 1, text: REPLIES.F3.job }], files: FILES, destination: 'src/' });
  assert.deepEqual(r, { status: 'ok', points: [{ line: 1, file: 'README.md', folder: 'README.md' }], dropped: 0 });
});

test('namedLines: the job lines the AI named a real file for (inside Destination or not); nothing for malformed, made-up, or not-in-the-line files', () => {
  const lines = [{ n: 1, text: 'Add a section to docs/a.md' }, { n: 2, text: 'fix the crash' }, { n: 3, text: 'edit src/ghost.js' }];
  const reply = JSON.stringify({ points: [{ line: 1, file: 'docs/a.md', folder: 'docs/' }, { line: 2, file: 'src/sum.js', folder: 'src/' }, { line: 3, file: 'src/ghost.js', folder: 'src/' }] });
  assert.deepEqual(dp.namedLines(reply, { jobLines: lines, files: FILES }), [1], 'line 2 does not hold the path, line 3 names a file that is not in the tree');
  assert.deepEqual(dp.namedLines(REPLIES.P3.raw, { jobLines: [{ n: 1, text: REPLIES.P3.job }], files: [...FILES, 'docs/wiki/scheduling.md'] }), [1]);
  assert.deepEqual(dp.namedLines(REPLIES.F3.raw, { jobLines: [{ n: 1, text: REPLIES.F3.job }], files: FILES }), [1], 'a top-of-repo file counts');
  for (const bad of ['not json', '{}', '{"points":5}', 'null', '']) assert.deepEqual(dp.namedLines(bad, { jobLines: lines, files: FILES }), []);
});

test('scoutCodePaths: only the scout\'s paths that really exist in the committed tree, de-duplicated, folders with a trailing slash', () => {
  assert.deepEqual(dp.scoutCodePaths(FACTS, FILES), SCOUT);
  assert.deepEqual(dp.scoutCodePaths({ sourcePaths: ['src', './bin/', 'ghost/', 'src/'], testPaths: ['tests/fixtures/', 'package.json'] }, FILES), ['src/', 'bin/', 'tests/fixtures/', 'package.json']);
  // a path another entry already covers is not suggested twice: the parent stays, a file the folders do not cover stays as written
  assert.deepEqual(dp.scoutCodePaths({ sourcePaths: ['src/', 'bin/x.mjs', 'src/panel/'], testPaths: ['tests/fixtures/', 'tests/', 'src/sum.js'] }, FILES), ['src/', 'bin/x.mjs', 'tests/']);
  assert.deepEqual(dp.scoutCodePaths({ sourcePaths: ['tests/fixtures/'], testPaths: ['tests/'] }, FILES), ['tests/']);
  for (const facts of [null, undefined, {}, { sourcePaths: 'src/' }, { sourcePaths: [], testPaths: [] }, { sourcePaths: ['ghost/', '..', '/etc', '', '.', 5, null] }]) assert.deepEqual(dp.scoutCodePaths(facts, FILES), [], JSON.stringify(facts));
});

test('destinationHoldsCode: Destination covers at least one committed file under a scout path (no AI)', () => {
  const holds = (d, e = SCOUT) => dp.destinationHoldsCode(d, e, FILES);
  assert.equal(holds('docs/'), false);
  assert.equal(holds('src/'), true);
  assert.equal(holds('tests/'), true);
  assert.equal(holds('src/panel/'), true, 'narrower than a scout folder still holds some of its code');
  assert.equal(holds('docs/, tests/'), true);
  assert.equal(holds('.'), true);
  assert.equal(holds('README.md'), false);
  assert.equal(holds('docs/\nbin/x.mjs'), true);
  assert.equal(holds('src/*.js'), true);
  assert.equal(holds('docs/', ['package.json']), false);
  assert.equal(holds('package.json', ['package.json']), true);
});

test('destFenceQuestion: worded by code, names the line, Destination and the scout folders', () => {
  const q = dp.destFenceQuestion({ destination: 'docs/', entries: SCOUT });
  assert.equal(q, `No line of the job names a file, and Destination docs/ holds none of the code or tests (src/, bin/, tests/). Set Destination to src/, bin/, tests/, or type a folder.${dp.DEST_ANSWER_APPROVE}`);
  assert.match(dp.destFenceQuestion({ destination: 'a/\nb/', entries: ['src/'] }), /Destination a\/, b\/ holds none/);
});

test('the question box: the closed question offers Yes (the scout folders) and the typed box, never No; refuseChoice agrees', () => {
  const step = { kind: 'answer', source: 'dest-point', closed: true, question: dp.destFenceQuestion({ destination: 'docs/', entries: SCOUT }), line: 1, folder: 'src/, bin/, tests/', current: 'docs/' };
  const box = boxFor(step);
  assert.deepEqual(box?.choices, [{ choice: 'yes', label: 'Yes, set it to src/, bin/, tests/' }]);
  assert.equal(box?.text, 'No line of the job names a file, and Destination docs/ holds none of the code or tests (src/, bin/, tests/). Set Destination to src/, bin/, tests/, or type a folder.');
  assert.equal(box?.sendChoice, 'path');
  assert.equal(refuseChoice(step, 'no'), CHOICE_SAYS.notOffered);
  assert.equal(refuseChoice(step, 'yes'), null); assert.equal(refuseChoice(step, 'path'), null);
  const open = { ...step, closed: undefined, question: dp.destQuestionText({ line: 1, file: 'src/a.js', folder: 'src/' }, 'docs/'), folder: 'src/' };
  assert.deepEqual(boxFor(open)?.choices.map((c) => c.choice), ['yes', 'no'], 'the file question keeps its No');
});

test('draftStopText: the destination stop is the code\'s own sentence', () => {
  const t = draftStopText({ stop: 'destination-stop', reds: [{ code: 'destination-stop', path: 'destination', detail: 'Destination docs/ still holds none of the code or tests.' }], spend: { knownUsd: 0.01, spendComplete: true } });
  assert.match(t, /^Destination docs\/ still holds none of the code or tests\./);
});

// ── the real session ──
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
async function session(t, { replyRaw, destination, jobText, facts = FACTS, scoutState = 'PRESENT', extra = [] }) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  for (const f of ['docs/a.md', 'docs/wiki/scheduling.md', 'bin/x.mjs', 'tests/t.test.js', 'lib/b.js', 'README.md', ...extra]) { mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); writeFileSync(path.join(repo, f), '//\n'); }
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'files']);
  const seams = draftSeams({});
  seams.scout = { state: scoutState, facts, calls: [], raws: [] };
  const got = {};
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { got.writeScope = o.writeScope; return inner(o); };
  const destFn = (o) => runDest(o, replyRaw);
  const card = baseCard({ source: repo, jobName: 'df-job', jobText, destination });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  const log = () => readFileSync(path.join(w.base, 's', readdirSync(path.join(w.base, 's'))[0], DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { s, got, log };
}
const runDest = (o, replyRaw) => dp.runDestPoint({ ...o, createLoop: () => ({ run: async () => ({ text: replyRaw, usage: { inputTokens: 10, outputTokens: 5 } }) }) });
const asking = (s) => s.state.pendingAsk?.source === 'dest-point';
async function fence(s, got) {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu / question (${s.state.phase} ${s.state.error} ${s.state.pendingAsk?.source})`);
  s.signPrepare();
  assert.ok(await until(() => got.writeScope !== undefined));
  return got.writeScope;
}
const noAsk = async (t, o, expectScope) => {
  const { s, got } = await session(t, o);
  assert.deepEqual(await fence(s, got), expectScope);
  assert.equal(s.state.messages.some((m) => /Destination/.test(m.text) && /(holds none|names a file|needs)/.test(m.text)), false, 'no Destination question was said');
};

test('session F1: a job whose lines name no file, Destination docs/, scout code in src/ bin/ tests/ -> ONE closed question; Yes sets the fence to the scout folders and the spec SIGNS', async (t) => {
  const { s, got, log } = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  const ask = s.state.pendingAsk;
  assert.equal(ask.question, dp.destFenceQuestion({ destination: 'docs/', entries: SCOUT }));
  assert.deepEqual(ask.box.choices.map((c) => c.label), ['Yes, set it to src/, bin/, tests/']);
  assert.notDeepEqual(s.send('', 'no'), { ok: true }, 'no "keep it" button: the door refuses it');
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  assert.deepEqual(await fence(s, got), ['src/', 'bin/', 'tests/']);
  assert.equal(s.state.card.destination, 'src/, bin/, tests/');
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared / refused at signing (${s.state.phase} ${s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, ['src/', 'bin/', 'tests/'], 'the SIGNED spec carries the answer');
  const row = log().find((e) => e.kind === 'dest-fence');
  assert.deepEqual([row?.state, row?.answer, row?.entries], ['asked', 'yes', SCOUT]);
});

test('session F2: the same ask for "Fix the bug where the panel crashes on an empty job" with Destination docs/', async (t) => {
  const { s } = await session(t, { replyRaw: REPLIES.F2.raw, destination: 'docs/', jobText: REPLIES.F2.job });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(s.state.pendingAsk.closed, true);
});

test('session F3: a named top-of-repo file outside Destination asks the FILE question once (set Destination to the file) and nothing more', async (t) => {
  const { s, got } = await session(t, { replyRaw: REPLIES.F3.raw, destination: 'src/', jobText: REPLIES.F3.job });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.match(s.state.pendingAsk.question, /^Line 1 needs README\.md changed, but Destination is src\/, so the job could not change it\. Set Destination to README\.md\?/);
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  assert.deepEqual(await fence(s, got), ['README.md'], 'the named line is not asked a second time');
});

test('session P1 P4 (Destination .), P2 (src/), P3 (a named docs file inside docs/): no question', async (t) => {
  await noAsk(t, { replyRaw: REPLIES.P1.raw, destination: '.', jobText: F1_TEXT }, ['.']);
  await noAsk(t, { replyRaw: REPLIES.P4.raw, destination: '.', jobText: REPLIES.P4.job }, ['.']);
  await noAsk(t, { replyRaw: REPLIES.P2.raw, destination: 'src/', jobText: REPLIES.P2.job }, ['src/']);
  await noAsk(t, { replyRaw: REPLIES.P3.raw, destination: 'docs/', jobText: REPLIES.P3.job }, ['docs/']);
});

test('session: a typed folder that holds the code signs; a typed folder that holds none is wrong, twice stops the draft in plain words', async (t) => {
  const a = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(a.s)));
  assert.deepEqual(a.s.send('tests/', 'path'), { ok: true });
  assert.deepEqual(await fence(a.s, a.got), ['tests/']);
  assert.ok(await until(() => a.s.state.phase === 'prepared'), `never prepared (${a.s.state.phase} ${a.s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(a.s.state.resolvedSpecPath, 'utf8')).writeScope, ['tests/']);

  const b = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(b.s)));
  assert.deepEqual(b.s.send('docs/wiki/', 'path'), { ok: true });
  assert.ok(await until(() => b.s.state.messages.some((m) => /holds none of the code or tests/.test(m.text) && /docs\/wiki\//.test(m.text))), 'a wrong answer says why, then asks again');
  assert.ok(await until(() => asking(b.s) && b.s.state.pendingAsk.question.startsWith('No line of the job')), 'asked a second time');
  assert.deepEqual(b.s.send('lib/', 'path'), { ok: true });
  assert.ok(await until(() => b.s.state.phase === 'refused'), `did not stop (${b.s.state.phase})`);
  assert.match(b.s.state.error, /still holds none of the code or tests/);
  assert.match(b.s.state.error, /docs\//);
  assert.equal(b.s.state.pendingAsk, null);
});

test('session: a typed whole-repo "." is not taken (it cannot be signed as a fence): counts as a wrong answer', async (t) => {
  const { s } = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(s)));
  s.send('.', 'path');
  assert.ok(await until(() => s.state.messages.some((m) => /whole repo/.test(m.text))), 'says why');
  assert.ok(await until(() => asking(s) && s.state.pendingAsk.question.startsWith('No line of the job')));
});

test('session: a scout with no code or test paths (none, not in the tree, or the wrong shape) asks nothing and goes on (fail-open)', async (t) => {
  for (const facts of [{}, { sourcePaths: [], testPaths: [] }, { sourcePaths: ['ghost/'], testPaths: ['nowhere/'] }, { sourcePaths: 'src/' }]) {
    await noAsk(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT, facts }, ['docs/']);
  }
});

test('session: a call that fails, or a malformed reply, still lets the code check run on the unnamed line (the file check is open)', async (t) => {
  const { s } = await session(t, { replyRaw: 'not json', destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(s.state.pendingAsk.closed, true);
});

test('session with the REAL scout answer (fixture of session smwrjvir01wu9): the suggested list is src/, bin/bareloop.mjs, tests/ (tests/fixtures/ is covered by tests/); Yes signs exactly that writeScope', async (t) => {
  const survey = classifySurvey(SCOUT_RAW, { bytes: Buffer.byteLength(SCOUT_RAW), error: null });
  assert.equal(survey.state, 'PRESENT');
  assert.deepEqual([survey.facts.sourcePaths, survey.facts.testPaths], [['src/', 'bin/bareloop.mjs'], ['tests/', 'tests/fixtures/']]);
  const { s, got } = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT, facts: survey.facts, extra: ['bin/bareloop.mjs', 'tests/fixtures/f.json'] });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(s.state.pendingAsk.question, dp.destFenceQuestion({ destination: 'docs/', entries: ['src/', 'bin/bareloop.mjs', 'tests/'] }));
  assert.match(s.state.pendingAsk.question, /\(src\/, bin\/bareloop\.mjs, tests\/\)/);
  assert.deepEqual(s.state.pendingAsk.box.choices.map((c) => c.label), ['Yes, set it to src/, bin/bareloop.mjs, tests/']);
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  assert.deepEqual(await fence(s, got), ['src/', 'bin/bareloop.mjs', 'tests/']);
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared / refused at signing (${s.state.phase} ${s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, ['src/', 'bin/bareloop.mjs', 'tests/']);
});

test('session: a typed SUBfolder that holds committed code or tests (tests/fixtures/, src/panel/) is accepted and signs as typed', async (t) => {
  for (const typed of ['tests/fixtures/', 'src/panel/']) {
    const { s, got } = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT, extra: ['tests/fixtures/f.json', 'src/panel/p.js'] });
    assert.ok(await until(() => asking(s)));
    assert.deepEqual(s.send(typed, 'path'), { ok: true });
    assert.deepEqual(await fence(s, got), [typed]);
    assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
    assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, [typed]);
  }
});
