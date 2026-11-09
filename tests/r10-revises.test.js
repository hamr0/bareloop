// fwd M4e amendment 14 item 3, mapped onto bareloop: a draft has 2 revises ("2 revises left"), the third is refused at $0 (no model call, the plan is not thrown away), the button then reads
// Start over, Start over gives 2 new revises and carries the picks, and a refresh keeps the count. Real panel server over a real socket, the real routes and sessions; the model is a script.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanelServer } from '../src/panel/server.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'r10-rev-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!(await fn()) && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

async function world(t) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const home = tmp('r10-rev-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const sessionsRoot = tmp('r10-rev-sess-');
  const calls = { confirm: 0, pick: 0 };
  const sessionDeps = {
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } }),
    pickGenerate: async (_m, tools) => { calls.pick += 1; await tools[0].execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { calls.confirm += 1; await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: false, stop: 'x', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
  };
  const { port, token, close } = await createPanelServer({ port: 0, sessionsRoot, env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionDeps });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', 'x-bareloop-token': token };
  const post = async (path, body) => { const r = await fetch(`${base}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body ?? {}) }); return { status: r.status, body: await r.json() }; };
  const get = async (path) => (await fetch(`${base}${path}`, { headers: H })).json();
  const card = (extra = {}) => ({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-rev', jobText: 'Summarise the latest release\n~ under 80 words', inputs: `Changelog: ${file}`, destination: join(tmp(), 'out'), capUsd: 1, ...extra });
  /** start a draft and wait for its plan menu */
  const draft = async (extra) => {
    const r = await post('/api/author/start', card(extra));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.sessionId;
    assert.ok(await until(async () => (await get(`/api/author/${id}`)).state.pendingAsk?.kind === 'answer' || (await get(`/api/author/${id}`)).state.pendingAsk?.kind === 'menu'), 'asked or menu');
    return id;
  };
  /** the page's Revise: end the draft (kind revise), then start the next one from the card */
  const revise = async (from) => {
    const a = await post(`/api/author/${from}/abandon`, { kind: 'revise' });
    if (a.status !== 200) return { ok: false, abandon: a };
    return { ok: true, id: await draft({ carryFrom: from, carryKind: 'revise' }) };
  };
  const state = async (id) => (await get(`/api/author/${id}`)).state;
  return { post, get, card, draft, revise, state, calls, sessionsRoot };
}

test('count shown: a fresh draft has 2 revises left, a revise 1, the second 0 - the server says it, the page only words it', async (t) => {
  const w = await world(t);
  const d0 = await w.draft();
  assert.equal((await w.state(d0)).revisesLeft, 2);
  const r1 = await w.revise(d0);
  assert.equal(r1.ok, true);
  assert.equal((await w.state(r1.id)).revisesLeft, 1);
  const r2 = await w.revise(r1.id);
  assert.equal((await w.state(r2.id)).revisesLeft, 0);
});

test('a third revise is refused at $0: no model call, and the plan on the table is not ended', async (t) => {
  const w = await world(t);
  const d0 = await w.draft();
  const r1 = await w.revise(d0);
  const r2 = await w.revise(r1.id);
  const before = { ...w.calls };
  const third = await w.revise(r2.id);
  assert.equal(third.ok, false);
  assert.equal(third.abandon.status, 409);
  assert.match(third.abandon.body.error, /used its 2 revises\. Start over/);
  const s = await w.state(r2.id);
  assert.notEqual(s.phase, 'abandoned', 'the draft on the table is not ended');
  assert.ok(s.pendingAsk, 'and still waits for the person');
  // and a page that skipped the abandon is refused at the start, before any session or model call
  assert.equal((await w.post(`/api/author/${r2.id}/abandon`, {})).status, 200);
  const direct = await w.post('/api/author/start', w.card({ carryFrom: r2.id, carryKind: 'revise' }));
  assert.equal(direct.status, 409);
  assert.match(direct.body.error, /Nothing was sent/);
  assert.deepEqual(w.calls, before, 'no model call');
});

test('Start over after the second revise gives 2 new revises and carries the picks record', async (t) => {
  const w = await world(t);
  const d0 = await w.draft();
  const r1 = await w.revise(d0);
  const r2 = await w.revise(r1.id);
  writeFileSync(join(w.sessionsRoot, r2.id, 'picks-record.json'), JSON.stringify({ picks: [{ lineWords: 'summarise the latest release', occurrence: 0, ruleText: 'under 80 words', added: null, check: { rule: 'maxWords', value: 80 }, own: false, left: false }] }));
  assert.equal((await w.post(`/api/author/${r2.id}/abandon`, { kind: 'startover' })).status, 200, 'Start over is never refused');
  const pickCallsBefore = w.calls.pick;
  const fresh = await w.draft({ carryFrom: r2.id, carryKind: 'startover' });
  assert.equal((await w.state(fresh)).revisesLeft, 2, 'its own 2 revises');
  assert.equal(w.calls.pick, pickCallsBefore, 'the kept pick is not asked again');
  assert.equal((await w.revise(fresh)).ok, true, 'and they work');
});

test('a refresh keeps the count: the live session comes back with revisesLeft, and the count is on disk beside the draft', async (t) => {
  const w = await world(t);
  const d0 = await w.draft();
  const r1 = await w.revise(d0);
  const live = await w.get('/api/author/live');
  assert.equal(live.sessionId, r1.id);
  assert.equal(live.state.revisesLeft, 1);
  assert.equal(JSON.parse(readFileSync(join(w.sessionsRoot, r1.id, 'revises.json'), 'utf8')).used, 1);
  assert.equal(existsSync(join(w.sessionsRoot, d0, 'revises.json')), true);
});

test('the count rides the chain: each draft that follows the last by Revise is one more revise used', async (t) => {
  const w = await world(t);
  const d0 = await w.draft();
  const r1 = await w.revise(d0);
  // the page chains the link to the newest draft (doStart), so a redraft after a red revise follows that revise
  const r2 = await w.revise(r1.id);
  assert.equal((await w.state(r2.id)).revisesLeft, 0);
});
