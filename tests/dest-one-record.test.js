// hamr's ruling: ONE Destination. Its home is the original record, source.json's `destination` (every job kind has it). The Destination questions (dest-point, dest-fence; Yes or typed)
// update THAT record first; the card, the Job tab, the Reuse prefill and the signed fence read or are built from it, so no screen can show a second value.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as dp from '../src/destpoint.js';
import { createSession, recordedDestination } from '../src/panel/authorsession.js';
import { getRunJob, getStartFrom } from '../src/panel/server.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { keysHome as trigHome, makeRun, specOf } from './trigger-world.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPLIES = JSON.parse(readFileSync(new URL('./fixtures/dest-fence-replies.json', import.meta.url), 'utf8'));
const FACTS = { sourcePaths: ['src/', 'bin/'], testPaths: ['tests/'] };
const F1_TEXT = 'Fix any failing test in the project';
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });

async function session(t, { replyRaw, destination, jobText }) {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  for (const f of ['docs/a.md', 'bin/x.mjs', 'tests/t.test.js', 'README.md']) { mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); writeFileSync(path.join(repo, f), '//\n'); }
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'files']);
  const seams = draftSeams({});
  seams.scout = { state: 'PRESENT', facts: FACTS, calls: [], raws: [] };
  const destFn = (o) => dp.runDestPoint({ ...o, createLoop: () => ({ run: async () => ({ text: replyRaw, usage: { inputTokens: 10, outputTokens: 5 } }) }) });
  const card = baseCard({ source: repo, jobName: 'one-job', jobText: `${jobText}\n~ keep it small`, destination });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  const dir = () => join(w.base, 's', readdirSync(join(w.base, 's'))[0]);
  const record = () => JSON.parse(readFileSync(join(dir(), 'source-seed', 'source.json'), 'utf8')).destination;
  return { s, dir, record };
}
const asking = (s) => s.state.pendingAsk?.source === 'dest-point';
const signed = async (s) => {
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
};

test('(a) dest-fence Yes: source.json, the card (card.json) and the signed writeScope all carry the new Destination', async (t) => {
  const { s, dir, record } = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(s)), `no question (${s.state.phase} ${s.state.error})`);
  assert.equal(record(), 'docs/', 'the record starts as the card said');
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  await signed(s);
  assert.equal(record(), 'src/, bin/, tests/');
  assert.equal(JSON.parse(readFileSync(join(dir(), 'card.json'), 'utf8')).destination, 'src/, bin/, tests/');
  assert.equal(recordedDestination(s.state), 'src/, bin/, tests/');
  assert.deepEqual(JSON.parse(readFileSync(s.state.resolvedSpecPath, 'utf8')).writeScope, ['src/', 'bin/', 'tests/']);
});

test('(b) a typed Destination (dest-fence typed, and the dest-point file question typed) does the same', async (t) => {
  const a = await session(t, { replyRaw: REPLIES.F1.raw, destination: 'docs/', jobText: F1_TEXT });
  assert.ok(await until(() => asking(a.s)));
  assert.deepEqual(a.s.send('tests/', 'path'), { ok: true });
  await signed(a.s);
  assert.equal(a.record(), 'tests/');
  assert.equal(JSON.parse(readFileSync(join(a.dir(), 'card.json'), 'utf8')).destination, 'tests/');
  assert.deepEqual(JSON.parse(readFileSync(a.s.state.resolvedSpecPath, 'utf8')).writeScope, ['tests/']);

  const b = await session(t, { replyRaw: REPLIES.F3.raw, destination: 'src/', jobText: REPLIES.F3.job });
  assert.ok(await until(() => asking(b.s)));
  assert.deepEqual(b.s.send('', 'yes'), { ok: true });
  await signed(b.s);
  assert.equal(b.record(), 'README.md');
  assert.deepEqual(JSON.parse(readFileSync(b.s.state.resolvedSpecPath, 'utf8')).writeScope, ['README.md']);
});

test('(a) the Job tab and the Reuse prefill read the record, never the signed fence or the saved card', () => {
  const home = trigHome();
  const run = makeRun(home, { runid: 'r1', spec: { ...specOf(), writeScope: ['docs/'] } });
  writeFileSync(join(run.out, 'source-seed', 'source.json'), JSON.stringify({ source: '/tw/in', destination: 'src/, scripts/, bin/, tests/' }));
  writeFileSync(join(run.out, 'card.json'), JSON.stringify({ destination: 'docs/', inputs: '1. repo: /tw/in' }));
  assert.equal(getRunJob('r1', { home }).destination, 'src/, scripts/, bin/, tests/');
  assert.equal(getStartFrom('r1', { home }).card.destination, 'src/, scripts/, bin/, tests/');
});

test('(c) a plain-folder job (absolute drop-off in the record) and a review job (output/ fence, report path in the record) keep their Destination', () => {
  const home = trigHome();
  const run = makeRun(home, { runid: 'r1', spec: { ...specOf({ files: true }), writeScope: ['output/'] } });
  writeFileSync(join(run.out, 'source-seed', 'source.json'), JSON.stringify({ source: '/tw/in', destination: '/tw/out-folder' }));
  assert.equal(getStartFrom('r1', { home }).card.destination, '/tw/out-folder');
  const home2 = trigHome();
  const run2 = makeRun(home2, { runid: 'r2', spec: { ...specOf({ files: true }), writeScope: ['output/'] } });
  writeFileSync(join(run2.out, 'source-seed', 'source.json'), JSON.stringify({ source: '/tw/in', destination: 'docs/' }));
  assert.equal(getRunJob('r2', { home: home2 }).destination, 'docs/');
  assert.equal(getStartFrom('r2', { home: home2 }).card.destination, 'docs/', 'a review job\'s Reuse box shows its report folder, not its output/ fence');
});

test('(d) no reader shows the signed writeScope as Destination (pin on the readers named in the ruling; the "write fence" line is a fence, not Destination)', () => {
  for (const f of ['src/panel/server.js', 'src/panel/schedulestart.js']) {
    const bad = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').filter((l) => /writeScope\s*\.join/.test(l) && /destination/i.test(l));
    assert.deepEqual(bad, [], `${f} must not display writeScope as Destination`);
  }
});
