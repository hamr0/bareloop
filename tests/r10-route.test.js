// R10: the start route hands `carryFrom` (the id of the draft a Revise / Start over follows) to the new session, which reads that draft's picks record from its own folder - a
// pick already made is then not asked again. Through the real route function (startSession) and the real session; the model is a script.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'r10-route-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

test('the start route: card.carryFrom reaches the session, whose kept pick is neither suggested nor asked; without it the same card is asked', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const home = tmp('r10-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const sessionsRoot = tmp('r10-sess-');
  mkdirSync(join(sessionsRoot, 'sold1'));
  writeFileSync(join(sessionsRoot, 'sold1', 'picks-record.json'), JSON.stringify({ picks: [{ lineWords: 'summarise the latest release', occurrence: 0, ruleText: 'under 80 words', added: null, check: { rule: 'maxWords', value: 80 }, own: false, left: false }] }));
  let suggested = 0;
  const deps = () => ({
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } }),
    pickGenerate: async (_m, tools) => { suggested += 1; await tools[0].execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: false, stop: 'x', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
  });
  const card = (extra = {}) => ({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-route', jobText: 'Summarise the latest release\n~ under 80 words', inputs: `Changelog: ${file}`, destination: join(tmp(), 'out'), capUsd: 1, ...extra });
  const inputs = [{ n: 1, label: 'Changelog', value: file }];
  const kept = createAuthorRoutes({ port: 1, token: 'x', home, env: {}, sessionsRoot, sessionDeps: deps() });
  const r = await kept.startSession(card({ carryFrom: 'sold1' }), null, inputs);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(await until(() => r.session.state.pendingAsk?.kind === 'menu'), `${r.session.state.phase} ${JSON.stringify(r.session.state.pendingAsk)}`);
  assert.equal(suggested, 0, 'a kept pick is never sent to the suggestion call');
  const fresh = createAuthorRoutes({ port: 1, token: 'x', home, env: {}, sessionsRoot, sessionDeps: deps() });
  const r2 = await fresh.startSession(card(), null, inputs);
  assert.ok(await until(() => r2.session.state.pendingAsk?.kind === 'answer'), 'without carryFrom the rule is asked');
  assert.equal(suggested, 1);
});
