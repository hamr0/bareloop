// A check that hit the limit (hamr, 2026-11-21): said in plain words from code, the real stop text kept in the drafting log, and a
// STARTING check that timed out stops the draft at once - the AI is never asked to revise what it did not cause.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as kinds from '../src/kinds.js';
import * as shell from '../src/shell.js';
import * as readout from '../src/authorreadout.js';
import { createSession } from '../src/panel/authorsession.js';
import { makeRangeWorld } from './range-world.mjs';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';
import { gitInPatient } from './helpers.js';

const LIMIT = shell.CHECK_LIMIT_MS;
const WORDS = (span) => `Your tests did not finish inside ${span}, so bareloop could not see where they start. Nothing ran and no run money was spent.`;

test('the words: the limit in minutes, from the limit that really bound the check', () => {
  assert.equal(LIMIT, 30 * 60_000, 'the spec says 30 minutes; the words below must say what the limit is');
  assert.equal(readout.checkTimedOutText(LIMIT), WORDS('30 minutes'));
  assert.equal(readout.checkTimedOutText(5 * 60_000), WORDS('5 minutes'), 'whatever limit really bound the check is the one named');
  assert.equal(readout.checkTimedOutText(60_000), WORDS('1 minute'));
  assert.equal(readout.checkTimedOutText(45_000), WORDS('45 seconds'));
});

test('a stage that timed out carries the limit that bound it, in its detail; a stage that failed another way carries none', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-words-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'seed');
  const seed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  const ctx = { workdir: dir, seedRef: seed, gapKeep: '', timeoutMsDefault: 400 };
  const slow = await kinds.runStage({ name: 'tests', kind: 'command-exit', params: { cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},5000)'], expectExit: 0 } }, ctx);
  assert.equal(slow.detail.fault, shell.STOP_FAULTS.TIMED_OUT);
  assert.equal(slow.detail.limitMs, 400);
  const tight = await kinds.runStage({ name: 'tests', kind: 'command-exit', params: { cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},5000)'], expectExit: 0, timeoutMs: 250 } }, ctx);
  assert.equal(tight.detail.limitMs, 400, 'an old spec\'s authored 250 is ignored: the one limit bound the check (F393)');
  const gone = await kinds.runStage({ name: 'tests', kind: 'command-exit', params: { cmd: 'no-such-binary-xyz', args: [], expectExit: 0 } }, ctx);
  assert.equal(gone.detail.limitMs, undefined);
});

test('the drafting stop for a timed-out starting check is the plain words, with the real stop text beneath', () => {
  const red = { code: 'check-timed-out', path: 'closeDecl.stages.tests', limitMs: LIMIT, detail: 'INSTRUMENT: "npm" did not finish inside 1800000ms' };
  const text = readout.draftStopText({ stop: 'check-timed-out', reds: [red], spend: { knownUsd: 0.02, spendComplete: true } });
  assert.ok(text.startsWith(WORDS('30 minutes')), text);
  assert.match(text, /INSTRUMENT: "npm" did not finish inside 1800000ms/);
  assert.match(text, /What to do:/);
});

test('the signing gates say the same words when a check timed out there', () => {
  const text = readout.signingStopText({ reds: [{ code: 'broken-close', path: 'closeDecl.stages.tests', limitMs: LIMIT, detail: 'INSTRUMENT: "npm" did not finish inside 1800000ms' }] });
  assert.match(text, new RegExp(WORDS('30 minutes').replace(/[.]/g, '\\.')));
  assert.doesNotMatch(text, /cannot run on this repository/);
  // a broken check that did NOT time out keeps its old words
  const other = readout.signingStopText({ reds: [{ code: 'broken-close', path: 'closeDecl.stages.tests', detail: 'x' }] });
  assert.match(other, /cannot run on this repository/);
});

// ── the drafting log keeps the real stop text beside the plain reason ───────────────────────────────────────────────
test('the try-refused row of the drafting log carries the check\'s real stop text, scrubbed', async (t) => {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  const seams = draftSeams({});
  const inner = seams.authorFn;
  seams.authorFn = async (o) => {
    o.onPhase('author-call', { call: 'author', i: 0, of: 2 });
    o.onPhase('author-try-failed', { call: 'author', i: 0, of: 2, reason: 'a check could not run at the starting point (tests)', stops: [{ stage: 'tests', text: 'INSTRUMENT: "npm" could not be run (ENOENT) sk-AAAAbbbbCCCCdddd1234' }] });
    return inner(o);
  };
  const sessionsRoot = path.join(w.base, 's');
  const s = createSession(baseCard({ source: wr.repo }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot, ...seams });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  const log = readFileSync(path.join(sessionsRoot, s.id, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const row = log.find((e) => e.kind === 'try-refused');
  assert.ok(row, 'a try-refused row was written');
  assert.equal(row.reason, 'a check could not run at the starting point (tests)');
  assert.equal(row.stops.length, 1);
  assert.equal(row.stops[0].stage, 'tests');
  assert.match(row.stops[0].text, /^INSTRUMENT: "npm" could not be run \(ENOENT\)/);
  assert.equal(JSON.stringify(row).includes('sk-AAAAbbbbCCCCdddd1234'), false, 'secrets masked');
});

test('the panel refuses a draft whose starting check timed out with the plain words, one try, nothing signed', async (t) => {
  const w = await world(t, { serve: false });
  const wr = makeRangeWorld(t);
  writeFileSync(path.join(wr.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(wr.repo, ['add', '-A']);
  gitInPatient(wr.repo, ['commit', '-q', '-m', 'pkg']);
  const seams = draftSeams({});
  seams.authorFn = async () => ({ ok: false, declaration: null, stop: 'check-timed-out', genreEnv: null, cost: { costUsd: 0.002, knownUsd: 0.002, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'check-timed-out', path: 'closeDecl.stages.tests', limitMs: LIMIT, detail: 'INSTRUMENT: "npm" did not finish inside 1800000ms' }] });
  const s = createSession(baseCard({ source: wr.repo }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
  assert.ok(await until(() => ['refused', 'error'].includes(s.state.phase) || s.state.pendingAsk?.kind === 'menu'), `${s.state.phase}`);
  if (s.state.pendingAsk?.kind === 'menu') s.signPrepare();
  assert.ok(await until(() => ['refused', 'error'].includes(s.state.phase)), `${s.state.phase} ${s.state.error}`);
  assert.equal(s.state.phase, 'refused');
  assert.ok(String(s.state.error).startsWith(WORDS('30 minutes')), String(s.state.error));
});
