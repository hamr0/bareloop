// Destination fence (hamr 2026-11-22): the dest-point call, for a Change code job, also asks per job line "can this be done inside Destination?"; code keeps an `inside:"no"` line that names
// no file as a point with no file, and the question is worded by code. The replies in tests/fixtures/dest-fence-replies.json are RAW replies of deepseek-flash to this prompt (live, 2026-11-22).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { decideDestPoint, destQuestionText, destPrompt, runDestPoint, destinationIsRoot, DEST_ANSWER, DEST_ANSWER_FOLDER } from '../src/destpoint.js';
import { boxFor, refuseChoice, CHOICE_SAYS } from '../src/questionbox.js';
import { createSession } from '../src/panel/authorsession.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

const REPLIES = JSON.parse(readFileSync(new URL('./fixtures/dest-fence-replies.json', import.meta.url), 'utf8'));
const HEAD_PROMPT = JSON.parse(readFileSync(new URL('./fixtures/dest-prompt-head.json', import.meta.url), 'utf8'));
const FILES = ['src/sum.js', 'docs/a.md', 'README.md', 'package.json'];
const LINES = [{ n: 1, text: 'Fix any failing test on branch: chore/barebrowse-031' }];
const decide = (id, destination, o = {}) => decideDestPoint(REPLIES[id].raw, { jobLines: LINES, files: FILES, destination, change: true, ...o });
const NULL_POINT = { line: 1, file: null, folder: null };

test('decideDestPoint: a Change code line the AI says is not inside Destination and that names no file is a point with no file', () => {
  assert.deepEqual(decide('F1', 'docs/'), { status: 'ok', points: [NULL_POINT], dropped: 0 });
  assert.deepEqual(decide('F2', 'docs/').points, [NULL_POINT]);
  assert.deepEqual(decide('P1', 'docs/').points, [], 'inside: yes is no question');
});

test('decideDestPoint: the file-less point is dropped for a root Destination, a line that is not a job line, a not-Change job, and a line the AI named a file for', () => {
  assert.deepEqual(decide('F1', '.').points, [], 'Destination is already the repo root');
  assert.deepEqual(decide('F1', 'src/, ./').points, [], 'a root piece among others');
  assert.deepEqual(decideDestPoint(REPLIES.F1.raw, { jobLines: [{ n: 2, text: 'x' }], files: FILES, destination: 'docs/', change: true }).points, [], 'line 1 is not a job line');
  assert.deepEqual(decide('F1', 'docs/', { change: false }).points, [], 'not a Change code job: `lines` is never read');
  assert.deepEqual(decideDestPoint(REPLIES.F1.raw, { jobLines: LINES, files: FILES, destination: 'docs/' }).points, [], 'change absent = not a Change code job');
  // the AI named a file for line 1 (README.md, folder ""), so `inside` is ignored: it is the file's own point (next test), never also a file-less one
  assert.deepEqual(decide('F3', 'src/'), { status: 'ok', points: [], dropped: 1 }, 'README.md is not in this line\'s words: dropped, and not turned into a file-less point');
  assert.equal(destinationIsRoot('.'), true); assert.equal(destinationIsRoot('src/'), false); assert.equal(destinationIsRoot(''), false);
});

test('decideDestPoint: a file at the top of the repo (folder "") outside Destination is a point whose proposed Destination is the file itself', () => {
  const r = decide('F3', 'src/', { jobLines: [{ n: 1, text: REPLIES.F3.job }] });
  assert.deepEqual(r, { status: 'ok', points: [{ line: 1, file: 'README.md', folder: 'README.md' }], dropped: 0 });
  assert.deepEqual(decideDestPoint(REPLIES.F3.raw, { jobLines: [{ n: 1, text: REPLIES.F3.job }], files: FILES, destination: 'src/' }).points.length, 1, 'with no `change` too: the file check alone');
  const own = (raw, o = {}) => decideDestPoint(raw, { jobLines: [{ n: 1, text: 'Update README.md' }], files: FILES, destination: 'src/', ...o });
  assert.deepEqual(own('{"points":[{"line":1,"file":"README.md","folder":"."}]}').points, [{ line: 1, file: 'README.md', folder: 'README.md' }], 'folder "." is read as the top');
  assert.deepEqual(own('{"points":[{"line":1,"file":"README.md","folder":""}]}', { destination: 'README.md' }).points, [], 'Destination already covers it');
  assert.deepEqual(own('{"points":[{"line":1,"file":"README.md","folder":""}]}', { destination: '.' }).points, [], 'Destination is the whole repo');
  assert.equal(own('{"points":[{"line":1,"file":"README.md","folder":""}]}', { files: ['src/sum.js'] }).points.length, 0, 'not in the committed tree');
  assert.equal(own('{"points":[{"line":1,"file":"src/sum.js","folder":""}]}', { jobLines: [{ n: 1, text: 'Fix src/sum.js' }] }).points.length, 0, 'a nested file with no folder is still dropped');
  assert.equal(destQuestionText({ line: 1, file: 'README.md', folder: 'README.md' }, 'src/'), `Line 1 needs README.md changed, but Destination is src/, so the job could not change it. Set Destination to README.md?${DEST_ANSWER}`);
});

test('decideDestPoint: an odd `lines` is ignored, a file point and a file-less point sort by line, the same line is one point', () => {
  const two = [{ n: 1, text: 'Edit src/sum.js' }, { n: 2, text: 'fix the crash' }];
  const o = (lines) => decideDestPoint(JSON.stringify({ points: [{ line: 1, file: 'src/sum.js', folder: 'src/' }], lines }), { jobLines: two, files: FILES, destination: 'docs/', change: true });
  for (const bad of ['x', null, 5, [1, null, { line: 'a', inside: 'no' }, { line: 2 }, { line: 2, inside: 'maybe' }]]) assert.deepEqual(o(bad).points.map((p) => p.file), ['src/sum.js'], JSON.stringify(bad));
  assert.deepEqual(o([{ line: 2, inside: 'no' }, { line: 2, inside: 'no' }, { line: 1, inside: 'no' }]).points, [{ line: 1, file: 'src/sum.js', folder: 'src/' }, { line: 2, file: null, folder: null }]);
});

test('destPrompt: a job that is not Change code gets the words it had at HEAD, byte for byte; Change code carries the per-line ask and the lines reply', () => {
  const o = { jobLines: [{ n: 1, text: 'Fix the bug in src/sum.js so the tests in test/sum.test.js pass' }, { n: 2, text: 'make npm test pass' }], destination: 'docs/' };
  assert.equal(destPrompt(o), HEAD_PROMPT, 'rubric and Review code (no `change`)');
  assert.equal(destPrompt({ ...o, change: false }), HEAD_PROMPT);
  const p = destPrompt({ ...o, change: true });
  assert.ok(p.startsWith(HEAD_PROMPT.slice(0, HEAD_PROMPT.indexOf('Reply with JSON'))), 'the same opening and the same file rule');
  assert.match(p, /can be done by changing only files inside the Destination/);
  assert.match(p, /"lines":\[\{"line":<line number>,"inside":"yes"\|"no"\}\]/);
  assert.match(p, /Destination[^\n]*: docs\//);
});

test('the file-less question is worded by code; a point with a file keeps today\'s words', () => {
  assert.equal(destQuestionText(NULL_POINT, 'docs/'), `Line 1 may need code changed outside Destination (docs/).${DEST_ANSWER_FOLDER}`);
  assert.match(destQuestionText(NULL_POINT, 'a/\nb/'), /outside Destination \(a\/, b\/\)\./);
  assert.equal(destQuestionText({ line: 1, file: 'src/sum.js', folder: 'src/' }, 'docs/'), 'Line 1 needs src/sum.js changed, but Destination is docs/, so the job could not change it. Set Destination to src/? Type yes to set it, or no to keep it as it is.');
});

test('the question box: a file-less point offers No and the typed box only, no Yes; a point with a file keeps Yes', () => {
  const step = { kind: 'answer', source: 'dest-point', question: destQuestionText(NULL_POINT, 'docs/'), line: 1, folder: null, current: 'docs/' };
  const box = boxFor(step);
  assert.deepEqual(box?.choices, [{ choice: 'no', label: 'No, keep docs/' }]);
  assert.equal(box?.text, 'Line 1 may need code changed outside Destination (docs/).');
  assert.equal(box?.sendChoice, 'path');
  assert.equal(refuseChoice(step, 'yes'), CHOICE_SAYS.notOffered);
  assert.equal(refuseChoice(step, 'no'), null); assert.equal(refuseChoice(step, 'path'), null);
  const withFile = { ...step, question: destQuestionText({ line: 1, file: 'src/a.js', folder: 'src/' }, 'docs/'), folder: 'src/' };
  assert.deepEqual(boxFor(withFile)?.choices.map((c) => c.choice), ['yes', 'no']);
  assert.equal(refuseChoice(withFile, 'yes'), null);
});

// ── the real session ──
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });
async function session(t, { replyRaw, checkType, jobText = 'Fix any failing test in the project' }) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  mkdirSync(path.join(repo, 'docs')); writeFileSync(path.join(repo, 'docs', 'a.md'), '#\n');
  mkdirSync(path.join(repo, 'lib')); writeFileSync(path.join(repo, 'lib', 'b.js'), '//\n');
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'docs']);
  const seams = draftSeams({});
  const got = {};
  const inner = seams.authorFn;
  seams.authorFn = async (o) => { got.writeScope = o.writeScope; return inner(o); };
  const calls = [];
  const destFn = (o) => { calls.push(o); return runDestPoint({ ...o, createLoop: () => ({ run: async () => ({ text: replyRaw, usage: { inputTokens: 10, outputTokens: 5 } }) }) }); };
  const card = baseCard({ source: repo, jobName: 'df-job', jobText, destination: 'docs/', ...(checkType ? { checkType } : {}) });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  const log = () => readFileSync(path.join(w.base, 's', readdirSync(path.join(w.base, 's'))[0], DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { s, got, calls, log };
}
const asking = (s) => s.state.pendingAsk?.source === 'dest-point';
async function fence(s, got) {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => got.writeScope !== undefined));
  return got.writeScope;
}

test('session: a Change code job whose reply says "no" with no file asks for a folder (no Yes); a typed folder signs, a typed yes is not taken, and the draft log holds the null point', async (t) => {
  const { s, got, calls, log } = await session(t, { replyRaw: REPLIES.F1.raw });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(calls[0].change, true);
  const ask = s.state.pendingAsk;
  assert.equal(ask.question, destQuestionText(NULL_POINT, 'docs/'));
  assert.deepEqual(ask.box.choices.map((c) => c.label), ['No, keep docs/']);
  assert.notDeepEqual(s.send('', 'yes'), { ok: true }, 'the yes button is not offered, the door refuses it');
  assert.deepEqual(s.send('lib/', 'path'), { ok: true });
  assert.deepEqual(await fence(s, got), ['lib/']);
  assert.equal(s.state.card.destination, 'lib/');
  const dp = log().find((e) => e.kind === 'dest-point');
  assert.deepEqual([dp.state, dp.line, dp.file, dp.folder], ['point', 1, null, null]);
  const da = log().find((e) => e.kind === 'dest-answer');
  assert.deepEqual([da.answer, da.from, da.to], ['typed', 'docs/', 'lib/']);
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, ['lib/'], 'the SIGNED spec carries the answer');
});

test('session: a top-of-repo file outside Destination asks to set Destination to the file; Yes SIGNS (writeScope is the file) and No keeps', async (t) => {
  const raw = '{"points":[{"line":1,"file":"package.json","folder":""}],"lines":[{"line":1,"inside":"no"}]}';
  const a = await session(t, { replyRaw: raw, jobText: 'Bump the version in package.json' });
  assert.ok(await until(() => asking(a.s)), `no question (${a.s.state.phase} ${a.s.state.error})`);
  assert.equal(a.s.state.pendingAsk.question, `Line 1 needs package.json changed, but Destination is docs/, so the job could not change it. Set Destination to package.json?${DEST_ANSWER}`);
  assert.deepEqual(a.s.state.pendingAsk.box.choices.map((c) => c.label), ['Yes, set it to package.json', 'No, keep docs/']);
  assert.deepEqual(a.s.send('', 'yes'), { ok: true });
  assert.deepEqual(await fence(a.s, a.got), ['package.json']);
  assert.ok(await until(() => a.s.state.phase === 'prepared'), `never prepared / refused at signing (${a.s.state.phase} ${a.s.state.error})`);
  assert.deepEqual(JSON.parse(readFileSync(a.s.state.resolvedSpecPath, 'utf8')).writeScope, ['package.json'], 'the SIGNED spec carries the file');
  const b = await session(t, { replyRaw: raw, jobText: 'Bump the version in package.json' });
  assert.ok(await until(() => asking(b.s)));
  assert.deepEqual(b.s.send('', 'no'), { ok: true });
  assert.deepEqual(await fence(b.s, b.got), ['docs/']);
});

test('session: a typed folder takes the existing typed road; No keeps Destination and drafting goes on', async (t) => {
  const a = await session(t, { replyRaw: REPLIES.F1.raw });
  assert.ok(await until(() => asking(a.s)));
  assert.deepEqual(a.s.send('lib/', 'path'), { ok: true });
  assert.deepEqual(await fence(a.s, a.got), ['lib/']);
  assert.equal(a.s.state.card.destination, 'lib/');
  const b = await session(t, { replyRaw: REPLIES.F1.raw });
  assert.ok(await until(() => asking(b.s)));
  assert.deepEqual(b.s.send('', 'no'), { ok: true });
  assert.deepEqual(await fence(b.s, b.got), ['docs/']);
  assert.equal(b.s.state.card.destination, 'docs/');
});

test('session: an inside: yes reply, or a call that fails, asks nothing (fail-open)', async (t) => {
  for (const replyRaw of [REPLIES.P1.raw, 'not json', REPLIES.P4.raw]) {
    const { s, got } = await session(t, { replyRaw });
    assert.deepEqual(await fence(s, got), ['docs/']);
    assert.equal(s.state.messages.some((m) => /Destination/.test(m.text) && /outside/.test(m.text)), false);
  }
});
