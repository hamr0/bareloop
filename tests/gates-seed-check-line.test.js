// hamr 2026-11-21 (session smwqsiwgokb3s): the "checking signing gates" step sat 5+ minutes with no hint, because the gates run the repo's own check once on the seed.
// While prepareSigning runs, a code close's gates step carries ONE plain `>` line, written by code; a text close (nothing to run) keeps its old line. The real session code path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { makeRangeWorld } from './range-world.mjs';
import { writeFileSync } from 'node:fs';
import { gitInPatient } from './helpers.js';
import { world, keysHome, draftSeams, until, baseCard } from './flowtype-world.mjs';

/** the range repo with a package.json on main, so the language reads js */
function jsRepo(/** @type {import('node:test').TestContext} */ t) {
  const w = makeRangeWorld(t);
  writeFileSync(path.join(w.repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  gitInPatient(w.repo, ['add', '-A']);
  gitInPatient(w.repo, ['commit', '-q', '-m', 'pkg']);
  return w.repo;
}

const WORDS = "Running your repo's own check once before signing (on a big repo this can take minutes).";

test('a code close: while the gates run, the gates step\'s detail is the one plain line, shown at the START', async (t) => {
  const w = await world(t, { serve: false });
  const seams = draftSeams({});
  /** @type {any} */ let during = null;
  /** @type {any} */ let s;
  const inner = seams.prepareSigningFn;
  seams.prepareSigningFn = async (/** @type {any} */ o) => { during = structuredClone(s.state.steps.find((/** @type {any} */ x) => x.id === 'gates')); return inner(o); };
  s = createSession(baseCard({ source: jsRepo(t) }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(s.state.phase, 'prepared', String(s.state.error));
  assert.equal(during?.status, 'running');
  assert.equal(during?.detail, WORDS);
});

test('a close with nothing to run at the seed (text close): the gates step keeps its old line', async (t) => {
  const w = await world(t, { serve: false });
  const seams = draftSeams({});
  const inner = seams.authorFn;
  seams.authorFn = async (/** @type {any} */ o) => { const r = await inner(o); r.declaration.stages = r.declaration.stages.filter((/** @type {any} */ x) => x.kind !== 'command-exit'); r.declaration.refused = [{ line: 1, reason: 'fixture' }, { line: 2, reason: 'fixture' }]; return r; };
  /** @type {any} */ let during = null;
  /** @type {any} */ let s;
  const inner2 = seams.prepareSigningFn;
  seams.prepareSigningFn = async (/** @type {any} */ o) => { during = structuredClone(s.state.steps.find((/** @type {any} */ x) => x.id === 'gates')); return inner2(o); };
  s = createSession(baseCard({ source: jsRepo(t) }), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(path.join(w.base, 'keys')), sessionsRoot: path.join(w.base, 's'), ...seams });
  assert.ok(await until(() => s.state.pendingAsk?.kind === 'menu'), `${s.state.phase} ${s.state.error}`);
  s.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(s.state.phase)));
  assert.equal(during?.detail, 'gates 1–3 cost $0', `${s.state.phase} ${s.state.error}`);
});
