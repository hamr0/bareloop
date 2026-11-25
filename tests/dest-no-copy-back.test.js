// hamr 2026-11-24 (ITEM33 addendum Part A item 7): the Destination has ONE record (source.json). The draft no longer copies it back onto the card: the card the session
// keeps is the form as submitted, and every reader of "the Destination now" (the served state, the draft readout, the schedule's sign) reads the record.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as dp from '../src/destpoint.js';
import { createSession, recordedDestination } from '../src/panel/authorsession.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPLIES = JSON.parse(readFileSync(new URL('./fixtures/dest-fence-replies.json', import.meta.url), 'utf8'));
const FACTS = { sourcePaths: ['src/', 'bin/'], testPaths: ['tests/'] };
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'ignore' });

test('a Destination answer updates the record only: the session\'s card keeps the typed value, recordedDestination reads the record and card.json keeps no copy', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  for (const f of ['docs/a.md', 'bin/x.mjs', 'tests/t.test.js', 'README.md']) { mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); writeFileSync(path.join(repo, f), '//\n'); }
  git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'files']);
  const seams = draftSeams({});
  seams.scout = { state: 'PRESENT', facts: FACTS, calls: [], raws: [] };
  const destFn = (o) => dp.runDestPoint({ ...o, createLoop: () => ({ run: async () => ({ text: REPLIES.F1.raw, usage: { inputTokens: 10, outputTokens: 5 } }) }) });
  const card = baseCard({ source: repo, jobName: 'no-copy', jobText: 'Fix any failing test in the project\n~ keep it small', destination: 'docs/' });
  const s = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams, destFn });
  const dir = join(w.base, 's', readdirSync(join(w.base, 's'))[0]);
  assert.ok(await until(() => s.state.pendingAsk?.source === 'dest-point'), `no question (${s.state.phase} ${s.state.error})`);
  assert.deepEqual(s.send('', 'yes'), { ok: true });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `no menu (${s.state.phase} ${s.state.error})`);
  s.signPrepare();
  assert.ok(await until(() => s.state.phase === 'prepared'), `never prepared (${s.state.phase} ${s.state.error})`);
  const record = JSON.parse(readFileSync(join(dir, 'source-seed', 'source.json'), 'utf8')).destination;
  assert.equal(record, 'src/, bin/, tests/');
  assert.equal(s.state.card.destination, 'docs/', 'nothing copied the record back onto the card');
  assert.equal(recordedDestination(s.state), record, 'the one reader says the record');
  assert.equal('destination' in JSON.parse(readFileSync(join(dir, 'card.json'), 'utf8')), false, 'card.json keeps no Destination copy');
});

test('the draft no longer assigns the record onto card / state.card (no second writer of the Destination)', () => {
  const src = readFileSync(new URL('../src/panel/authorsession.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /card = \{ \.\.\.card, destination/);
  assert.doesNotMatch(src, /state\.card = \{ \.\.\.state\.card, destination/);
});
