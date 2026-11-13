// N-2 through the panel (hamr ruling 2026-11-13; live draft A = smwelq2l6srdb): Drop and Add on the confirm card are instant, $0 row edits through the live check block (no model call, no new draft), every one reconciled;
// the card is drawn again from the rows; a Revise keeps them; signing reads the rows. Refusals are plain words over the real route.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { runPageMap } from '../src/pagemap.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG, reply } from './helpers.js';
import { readDraft } from './card-drafts-helper.js';

/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'card-dnd-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

/** a session of draft A over the real page and the real page-map reply, parked at the confirm menu. `calls` counts every model seam; the stub drafter keeps the block it is given */
async function parked(/** @type {{sessionsRoot?: string, carryFrom?: string, home?: string}} */ o = {}) {
  const d = readDraft('A');
  const map = await runPageMap({
    texts: { flights: d.page }, inputs: [{ n: 1, label: 'flights' }], jobLines: d.jobLines, sleep: async () => {}, onCall: () => {},
    provider: { async generate() { return reply({ text: d.raw, costUsd: 0.001 }); } },
  });
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look: map.facts.look } };
  const home = o.home ?? tmp('card-dnd-home-');
  if (!o.home) { writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG)); }
  const file = join(tmp(), 'flights.txt');
  writeFileSync(file, d.page);
  const sessionsRoot = o.sessionsRoot ?? tmp('card-dnd-sess-');
  const calls = { look: 0, ledger: 0, confirm: 0, generate: 0, author: 0 };
  const seen = /** @type {{block: any}} */ ({ block: null });
  const PLAN = { goal: 'List 3 flights from Boston to Chicago.', checks: [], notChecked: [], questions: [] };
  const extra = [{ line: 1, kind: 'count', min: 3, max: 3 }, { line: 1, kind: 'phrase', phrase: 'Nonstop', source: 'flights' }];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'card-dnd-job', jobText: '1. List 3 flights from Boston to Chicago\n~ under $450\n~ departure between 05:00 and 21:59', inputs: `flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot,
    ...(o.carryFrom ? { carryFrom: o.carryFrom, carryKind: 'revise' } : {}),
    generate: async () => { calls.generate += 1; throw new Error('no model call'); },
    lookFn: async () => { calls.look += 1; return survey; },
    ledgerGenerate: async (_m, tools) => { calls.ledger += 1; await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { calls.confirm += 1; await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (a) => { calls.author += 1; seen.block = a.block; return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  const plan = () => /** @type {any} */ ([...session.state.messages].reverse().find((m) => m.kind === 'plan')).plan;
  return { session, calls, seen, plan, sessionsRoot, home };
}
const names = (/** @type {any} */ plan) => plan.lines[0].checks.map((/** @type {any} */ c) => `${c.by}:${c.name.split(' — ')[0]}`);

test('the confirm card draws the split: job-derived [agent] rows with a key (Drop), the suggestion under Suggested (Add); a [you] row has no Drop key to use', async () => {
  const { session, plan } = await parked();
  const p = plan();
  assert.equal(p.editable, true);
  assert.ok(names(p).includes('agent:fact · origin airport') || names(p).some((n) => /^agent:fact · origin/.test(n)), JSON.stringify(names(p)));
  assert.ok(p.lines[0].checks.filter((/** @type {any} */ c) => c.by === 'agent').every((/** @type {any} */ c) => typeof c.key === 'string'), 'every [agent] row carries its row key');
  assert.deepEqual(p.suggested.map((/** @type {any} */ x) => x.key), ['L1.phrase.nonstop']);
  assert.match(p.suggested[0].text, /must say "Nonstop"/);
  assert.ok(!names(p).some((n) => /Nonstop/.test(n)), 'a suggestion is not among the checks');
  session.abandon();
});

test('Drop and Add are $0: no model call is made, the card is redrawn from the rows, every row is reconciled', async () => {
  const { session, calls, plan, seen } = await parked();
  const before = { ...calls };
  assert.deepEqual(session.rowEdit('add', 'L1.phrase.nonstop'), { ok: true });
  assert.ok(names(plan()).some((n) => /^agent:fact · .*Nonstop|^agent:phrase|^agent:fact · nonstop/i.test(n)) || plan().lines[0].checks.some((/** @type {any} */ c) => /must say "Nonstop"/.test(c.name)), JSON.stringify(names(plan())));
  assert.deepEqual(plan().suggested ?? [], [], 'it left the Suggested section');
  assert.deepEqual(session.rowEdit('drop', 'L1.fact.origin'), { ok: true });
  assert.ok(!plan().lines[0].checks.some((/** @type {any} */ c) => /^fact · origin/.test(c.name)), 'the dropped row is off the card');
  assert.deepEqual(calls, before, 'not one model seam was called by a Drop or an Add');
  // the confirm pick goes on to the drafter, which reads the rows: the block it is given carries both choices
  session.signPrepare();
  assert.ok(await until(() => calls.author === 1));
  const signed = seen.block.signedRows();
  assert.equal(signed.find((/** @type {any} */ r) => r.key === 'L1.fact.origin').state, 'dropped');
  const n = signed.find((/** @type {any} */ r) => r.key === 'L1.phrase.nonstop');
  assert.equal(n.state, 'built');
  assert.deepEqual(n.facts, ['Nonstop']);
});

test('refusals are plain words and change nothing: an unknown row, a [you] row, a not-offered Add, no plan waiting', async () => {
  const { session, plan } = await parked();
  const before = JSON.stringify(plan());
  assert.match(String(/** @type {any} */ (session.rowEdit('drop', 'L9.nothing')).error), /there is no such check on the list/);
  assert.match(String(/** @type {any} */ (session.rowEdit('drop', 'L1.~1')).error), /comes from a rule you wrote/);
  assert.match(String(/** @type {any} */ (session.rowEdit('add', 'L1.fact.origin')).error), /only a suggested check can be added/);
  assert.match(String(/** @type {any} */ (session.rowEdit('boom', 'L1.fact.origin')).error), /not one of the choices/);
  assert.equal(JSON.stringify(plan()), before);
  session.signPrepare();
  assert.match(String(/** @type {any} */ (session.rowEdit('drop', 'L1.fact.origin')).error), /no plan is waiting/);
});

test('a Revise keeps the choices: the next draft starts with the row dropped and the suggestion added, and code still judges them', async () => {
  const first = await parked();
  first.session.rowEdit('drop', 'L1.fact.origin');
  first.session.rowEdit('add', 'L1.phrase.nonstop');
  first.session.abandon();
  const next = await parked({ sessionsRoot: first.sessionsRoot, home: first.home, carryFrom: first.session.id });
  const p = next.plan();
  assert.ok(!p.lines[0].checks.some((/** @type {any} */ c) => /^fact · origin/.test(c.name)), 'the dropped row stays off the card');
  assert.ok(p.lines[0].checks.some((/** @type {any} */ c) => /must say "Nonstop"/.test(c.name)), 'the added suggestion stays added');
  assert.deepEqual((p.suggested ?? []).map((/** @type {any} */ x) => x.key), ['L1.fact.origin'], 'the dropped row waits under Suggested');
  next.session.abandon();
});

test('over the real route: POST /api/author/<id>/row-edit answers 200, and refuses in plain words with 400 (unknown row, a [you] row)', async () => {
  const { session } = await parked();
  const routes = createAuthorRoutes({ port: 1, token: 'tok' });
  routes.sessions.set(session.id, session);
  const post = (/** @type {any} */ body) => {
    /** @type {any} */ let out = null; let status = 0;
    const req = { method: 'POST', headers: { 'x-bareloop-token': 'tok', host: '127.0.0.1:1', 'content-type': 'application/json' } };
    const res = { writeHead(s) { status = s; }, end(txt) { out = JSON.parse(txt); } };
    assert.equal(routes.handle(req, res, `/api/author/${session.id}/row-edit`, body), true);
    return { status, out };
  };
  const unknown = post({ op: 'drop', key: 'L9.nothing' });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.out.ok, false);
  assert.equal(unknown.out.error, 'there is no such check on the list');
  const mine = post({ op: 'drop', key: 'L1.~2' });
  assert.equal(mine.status, 400);
  assert.match(mine.out.error, /comes from a rule you wrote; edit the job to change it/);
  const ok = post({ op: 'add', key: 'L1.phrase.nonstop' });
  assert.equal(ok.status, 200);
  assert.equal(ok.out.ok, true);
  session.abandon();
});
