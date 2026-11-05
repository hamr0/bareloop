// borrowed-from: fwdloop test/m13-am4.test.js@df6cc3e (re-shaped: bareloop's Reuse is the New job card itself, one door; the real panel server, real signed specs, the model boundary stubbed)
// ITEM33-BUILD piece 8: Reuse shows the job's Flow type and MCP; an unchanged card reuses the signed plan (no drafting); a changed Flow type or MCP is a changed job -> drafts anew under a NEW name.
// The Job tab reads the signed MCP block. $0, no model, no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { getStartFrom, getRunJob } from '../src/panel/server.js';
import { resolveFlowCard } from '../src/panel/authorsession.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import { world, makeRepo, keysHome, draftSeams, draftSpec, makeRun, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

const LIST = 'https://github.com/o/r/issues';

/** a world with a green TICKETS run and a green PLAIN run (both real signed specs), the panel server up with the model boundary stubbed */
async function setup(t) {
  const oldHome = process.env.HOME;
  const seen = {};
  const w = await world(t, { serve: false });
  process.env.HOME = w.home;   // the $0 ticket-line proof reads the person's config from the process home
  t.after(() => { process.env.HOME = oldHome; });
  const keys = keysHome(w.cfg);
  const repo = makeRepo(path.join(w.base, 'repo'));
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: FAKE_TOOLS.map((name) => ({ name, hint: 'read-only' })) });
  const where = { home: w.cfg, mcpHome: w.home };
  const pick = resolveFlowCard({ flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}` }, where);
  const inputs = `repo: ${repo}\nissues: ${LIST}`;
  const tcard = baseCard({ source: repo, jobName: 'tick-job', inputs, flowType: 'tickets', mcp: 'github' });
  const tk = (await draftSpec(w, keys, tcard, { flowType: pick.flowType, pick: pick.pick })).spec;
  const pl = (await draftSpec(w, keys, baseCard({ source: repo, jobName: 'plain-job' }), null)).spec;
  const out1 = path.join(w.base, 'o1'); const out2 = path.join(w.base, 'o2');
  mkdirSync(out1); mkdirSync(out2);
  makeRun(w.cfg, { runid: 'tkrun001', spec: tk, card: tcard, out: out1 });
  makeRun(w.cfg, { runid: 'plrun001', spec: pl, card: baseCard({ source: repo, jobName: 'plain-job' }), out: out2 });
  const srv = await world(t, { files: { '.mcp.json': { mcpServers: { github: JSON.parse('{"command":"true"}') } } }, panel: { home: w.cfg, mcpHome: w.home, sessionDeps: draftSeams(seen) }, serve: true });
  return { w, srv, tk, pl, repo, inputs, keys, where, seen };
}

test('the Reuse prefill shows the job\'s Flow type and MCP; a plain job\'s prefill carries neither key', async (t) => {
  const s = await setup(t);
  assert.equal(s.tk.flowType, 'tickets');
  const a = getStartFrom('tkrun001', { home: s.w.cfg });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.card.flowType, 'tickets');
  assert.equal(a.card.mcp, 'github');
  const b = getStartFrom('plrun001', { home: s.w.cfg });
  assert.equal('flowType' in b.card, false);
  assert.equal('mcp' in b.card, false);
});

test('the Job tab reads the signed MCP block in the card\'s own words; a plain job has none', async (t) => {
  const s = await setup(t);
  const j = getRunJob('tkrun001', { home: s.w.cfg });
  assert.deepEqual(j.mcp, { flowType: 'Tickets MCP', server: 'github', tools: FAKE_TOOLS });
  assert.equal(getRunJob('plrun001', { home: s.w.cfg }).mcp, null);
});

test('workflow: a changed MCP or flow type is a different workflow, and the plain job\'s key does not move', async (t) => {
  const s = await setup(t);
  assert.notEqual(workflowKey(s.tk), workflowKey({ ...s.tk, flowType: 'mcp' }));
  assert.notEqual(workflowKey(s.tk), workflowKey({ ...s.tk, mcp: { ...s.tk.mcp, server: 'other' } }));
  assert.notEqual(jobSpecHash(s.tk), jobSpecHash(s.pl));
});

test('POST /api/author/start with Reuse: unchanged Flow type + MCP reuses the signed plan (no drafting) and keeps the origin\'s name; a Tickets job needs its ticket number', async (t) => {
  const s = await setup(t);
  const card = (over = {}) => ({ ...baseCard({ source: s.repo, jobName: 'tick-job', inputs: s.inputs, flowType: 'tickets', mcp: 'github' }), startFrom: 'tkrun001', ...over });
  const none = await s.srv.post('/api/author/start', card());
  assert.equal(none.status, 400);
  assert.match(none.body.error, /^This job reads a ticket\. Type the ticket number to read/);
  const ok = await s.srv.post('/api/author/start', card({ ticket: '17' }));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.reuse, true, 'the signed plan is reused');
  assert.equal(ok.body.state.card.ticket, '17');
});

test('POST /api/author/start with Reuse: a changed Flow type is a changed job - it drafts anew (reuse false) and refuses the origin\'s own name', async (t) => {
  const s = await setup(t);
  // tickets -> plain: a different workflow; the name box must hold a new one
  const asPlain = { ...baseCard({ source: s.repo, jobName: 'tick-job', inputs: `repo: ${s.repo}` }), startFrom: 'tkrun001' };
  const same = await s.srv.post('/api/author/start', asPlain);
  assert.equal(same.status, 400);
  assert.match(same.body.error, /A job named "tick-job" already exists and is a different job/);
  const renamed = await s.srv.post('/api/author/start', { ...asPlain, jobName: 'tick-job-2' });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.reuse, false, 'a changed Flow type drafts');
  // and the other server name, same flow type: also a change
  await s.srv.post(`/api/author/${renamed.body.sessionId}/abandon`, {});
  const other = await s.srv.post('/api/author/start', { ...asPlain, jobName: 'tick-job-3', inputs: s.inputs, flowType: 'tickets', mcp: 'other', ticket: '5' });
  assert.equal(other.status, 400, 'an MCP Settings does not list is refused');
  assert.match(other.body.error, /other is not in any MCP config/);
});
