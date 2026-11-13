// hamr 2026-11-12 (fwd M10 am32 A): the panel send route refuses an ANSWER with no typed `choice` while a question is open; nothing is logged and the question stays open.
// Through the real route (handle) and a real panel session over a real rubric job (the model boundary scripted).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAY = 'This page is out of date. Reload it and answer again. Nothing was saved.';
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'am32-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (/** @type {() => any} */ fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

async function asking() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const home = tmp('am32-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const deps = {
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } }),
    pickGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools[0].execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; },
    confirmGenerate: async (/** @type {any} */ _c, /** @type {any[]} */ tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: false, stop: 'x', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
  };
  const routes = createAuthorRoutes({ port: 1, token: 'tok', home, env: {}, sessionsRoot: tmp('am32-sess-'), sessionDeps: deps });
  const r = await routes.startSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'am32', jobText: 'Summarise the latest release\n~ under 80 words', inputs: `Changelog: ${file}`, destination: join(tmp(), 'out'), capUsd: 1 }, null, [{ n: 1, label: 'Changelog', value: file }]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(await until(() => r.session.state.pendingAsk?.kind === 'answer'), `${r.session.state.phase}`);
  const post = (/** @type {any} */ body) => {
    let status = 0; let out = null;
    const req = { method: 'POST', headers: { 'x-bareloop-token': 'tok', host: '127.0.0.1:1' } };
    const res = { writeHead(c) { status = c; }, end(txt) { out = JSON.parse(txt); } };
    assert.equal(routes.handle(req, res, `/api/author/${r.session.id}/send`, body), true);
    return { status, out };
  };
  return { session: r.session, post };
}
const logOf = (/** @type {any} */ s) => readFileSync(join(s.state.outDir, DRAFT_LOG_FILE), 'utf8');

test('an answer with no choice is refused in the signed words; nothing is logged and the question stays open; a choice still lands', async () => {
  const { session, post } = await asking();
  const before = logOf(session);
  const asked = session.state.pendingAsk;
  for (const body of [{ text: 'under 60 words' }, {}, { text: 'agree' }]) {
    const { status, out } = post(body);
    assert.equal(status, 400);
    assert.equal(out.refused, 'bad-choice');
    assert.equal(out.error, SAY);
  }
  assert.equal(logOf(session), before, 'nothing logged');
  assert.equal(session.state.pendingAsk, asked, 'the same question is still open');
  const ok = post({ text: 'under 60 words', choice: 'rule' });
  assert.equal(ok.status, 200, JSON.stringify(ok.out));
  assert.ok(await until(() => session.state.pendingAsk?.kind !== 'answer' || session.state.pendingAsk !== asked));
});

test('a send that is not an answer to an open question is not touched by the door (no question: the old refusal)', async () => {
  const { session, post } = await asking();
  session.abandon();
  const { status, out } = post({ text: 'hi' });
  assert.equal(status, 400);
  assert.notEqual(out.error, SAY);
});
