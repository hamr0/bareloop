// hamr 2026-11-12 (bareloop's own two questions, signed with the question box): item E (item D, the fit-check question, went with the fit check on 2026-11-14). The Destination question shows
// [Yes, set it to <folder>] [No, keep <current>] and a box for a different Destination, checked at $0 by the card's own Destination check. Real panel sessions; the model is scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path, { join } from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { runDestPoint, destQuestionText, DEST_ANSWER } from '../src/destpoint.js';
import { boxFor, panelQuestionText, refuseChoice, CHOICE_SAYS } from '../src/questionbox.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
const reply = (points) => JSON.stringify({ points });
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { tmp, HERE } from './qbox-world.mjs';

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

test('boxFor / refuseChoice: the choice table of the Destination question', () => {
  assert.equal(refuseChoice({ kind: 'answer', source: 'dest-point' }, 'path'), null);
  assert.equal(refuseChoice({ kind: 'answer', source: 'dest-point' }, 'go-on'), CHOICE_SAYS.bad);
});
