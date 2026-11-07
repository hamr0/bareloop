// R7b rulings (hamr 2026-11-07, live runs mw6skdyk and mw6u5794): a by-hand Tickets session looks for a new ticket at START, at $0, before any session, copy, draft or model call,
// through the ONE newest-unrun reader (src/ticketnext.js). Nothing new, or a look that cannot read, refuses in the card's one error line; Reuse on a Tickets job takes the same road.
// A plain card, a scheduled fire (headless) and a typed ticket never look. $0: a stub reader, the real routes, a scratch world.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { world, makeRepo, keysHome, draftSeams, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

const LIST = 'https://github.com/o/r/issues';

async function rig(t, reader) {
  const w = await world(t, { serve: false });
  const oldHome = process.env.HOME;
  process.env.HOME = w.home;
  t.after(() => { process.env.HOME = oldHome; });
  const repo = makeRepo(path.join(w.base, 'repo'));
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: FAKE_TOOLS.map((name) => ({ name, hint: null })) });
  const calls = [];
  const routes = createAuthorRoutes({ port: 1, token: 'x', home: keysHome(w.cfg), mcpHome: w.home, env: {}, sessionsRoot: path.join(w.base, 'sessions'), sessionDeps: draftSeams({}),
    newestUnrunTicket: async (o) => { calls.push(o); return reader(o); } });
  const inputs = [{ n: 1, label: 'repo', value: repo }, { n: 2, label: 'issues', value: LIST }];
  const tk = (over = {}) => baseCard({ source: repo, jobName: 'chk-job', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}`, ...over });
  return { routes, inputs, tk, calls, repo, w };
}

test('nothing new: the start is refused in the card\'s own words, nothing is made, the reader got this job\'s name, inputs and signed tools', async (t) => {
  const r = await rig(t, () => ({ ok: false, nothingNew: true, say: 'No new ticket since #17. Nothing to run.' }));
  const out = await r.routes.startSession(r.tk(), null, r.inputs);
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
  assert.equal(out.error, 'No new ticket since #17. Nothing to run. Nothing spent.');
  assert.equal(r.routes.sessions.size, 0, 'no session, no draft');
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].job, 'chk-job');
  assert.deepEqual(r.calls[0].mcp.tools.sort(), [...FAKE_TOOLS].sort());
});

test('a look that cannot read (a locked pass) is refused at Start with the SAME cause words as the run-start refusal, and "Nothing spent."', async (t) => {
  const say = 'The newest ticket could not be looked up. The reason: GitHub token unavailable — is pass locked? Fix that, then start the job again.';
  const r = await rig(t, () => ({ ok: false, say }));
  const out = await r.routes.startSession(r.tk(), null, r.inputs);
  assert.equal(out.error, `${say} Nothing spent.`);
  assert.equal(r.routes.sessions.size, 0);
});

test('a new ticket: the session starts; a plain card, a scheduled fire (headless) and a typed ticket never look', async (t) => {
  const r = await rig(t, () => ({ ok: true, number: 18 }));
  assert.equal((await r.routes.startSession(r.tk(), null, r.inputs)).ok, true);
  assert.equal(r.calls.length, 1);
  const r2 = await rig(t, () => { throw new Error('must not look'); });
  const plain = await r2.routes.startSession(baseCard({ source: r2.repo, jobName: 'plain-job' }), null, [r2.inputs[0]]);
  assert.equal(plain.ok, true, JSON.stringify(plain));
  const headless = await r2.routes.startSession(r2.tk({ jobName: 'hl-job', ticket: '17' }), null, r2.inputs, { headless: true });
  assert.equal(headless.ok, true, JSON.stringify(headless));
  assert.equal(r2.calls.length, 0, 'no look');
});

test('a generic MCP card (not Tickets) never looks for a ticket', async (t) => {
  const r = await rig(t, () => { throw new Error('must not look'); });
  const out = await r.routes.startSession(r.tk({ flowType: 'mcp', jobName: 'mcp-job' }), null, [r.inputs[0]]);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(r.calls.length, 0);
});

test('Reuse workflow on a Tickets job goes through the same check, under the origin job\'s name', async (t) => {
  const r = await rig(t, () => ({ ok: false, nothingNew: true, say: 'No new ticket since #9. Nothing to run.' }));
  const spec = { schema: 'job-v1', job: 'origin-job', flowType: 'tickets', mcp: { server: 'github', tools: FAKE_TOOLS }, writeScope: ['src/'] };
  const out = await r.routes.startSession(r.tk({ jobName: 'typed-new-name' }), { spec, workflowKey: 'k' }, r.inputs);
  assert.equal(out.error, 'No new ticket since #9. Nothing to run. Nothing spent.');
  assert.equal(r.calls[0].job, 'origin-job');
  assert.equal(r.routes.sessions.size, 0);
});
