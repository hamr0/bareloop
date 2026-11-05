// MCP + tickets piece 2 (R5), through the real card door (createSession, the draft seams of tests/flowtype-world.mjs): a Tickets card tells the drafter it reads tickets
// (`authorOpts.ticket`) and signs the filter the drafter PROPOSED; a generic MCP card and a plain card tell it nothing and sign no filter, whatever a drafter says.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { createSession } from '../src/panel/authorsession.js';
import { validateJob } from '../src/job.js';
import { world, makeRepo, keysHome, draftSeams, until, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

/** draft a card with `proposal` as what the (scripted) authoring step returns as the drafter's ticket filter; returns the signed spec, the options the authoring step was given, and the plan card */
async function draftWith(w, keys, card, flow, proposal) {
  const seen = {};
  const seams = draftSeams(seen);
  const inner = seams.authorFn;
  const got = { opts: null };
  seams.authorFn = async (o) => { got.opts = o; const r = await inner(o); return proposal === undefined ? r : { ...r, ticketFilter: proposal }; };
  const session = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keys, sessionsRoot: path.join(w.base, `sess-${Math.random().toString(36).slice(2)}`), ...seams, ...(flow ? { flow } : {}) });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `no menu (${session.state.phase} ${session.state.error})`);
  session.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase)), 'never prepared');
  assert.equal(session.state.phase, 'prepared', session.state.error);
  const spec = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
  return { spec, got, session };
}

const LIST = 'https://github.com/o/r/issues';

test('a Tickets card: the authoring step is told it reads tickets, and the proposed filter is SIGNED (validates)', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const keys = keysHome(path.join(w.base, 'keys'));
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: FAKE_TOOLS.map((name) => ({ name, hint: null })) });
  const card = baseCard({ source: repo, jobName: 'flow-tickets', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}` });
  const { spec, got } = await draftWith(w, keys, card, { flowType: 'tickets', pick: { server: 'github', tools: FAKE_TOOLS } }, { priority: ['P1'] });
  assert.equal(got.opts.ticket, true, 'the authoring step is told');
  assert.deepEqual(spec.ticketFilter, { priority: ['P1'] });
  assert.equal(spec.flowType, 'tickets');
  assert.equal(validateJob(spec, { shellCapUsd: spec.budgetUsd }).ok, true);
});

test('a Tickets card whose drafter proposes none signs none', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const keys = keysHome(path.join(w.base, 'keys'));
  const card = baseCard({ source: repo, jobName: 'flow-tickets2', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}` });
  const { spec } = await draftWith(w, keys, card, { flowType: 'tickets', pick: { server: 'github', tools: FAKE_TOOLS } }, undefined);
  assert.equal('ticketFilter' in spec, false);
});

test('a generic MCP card and a plain card: the authoring step is told nothing, and a stray proposal is never signed', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const keys = keysHome(path.join(w.base, 'keys'));
  const mcp = await draftWith(w, keys, baseCard({ source: repo, jobName: 'flow-mcp2', flowType: 'mcp', mcp: 'github' }), { flowType: 'mcp', pick: { server: 'github', tools: FAKE_TOOLS } }, { priority: ['P1'] });
  assert.equal(mcp.got.opts.ticket, undefined);
  assert.equal('ticketFilter' in mcp.spec, false);
  const plain = await draftWith(w, keys, baseCard({ source: repo, jobName: 'flow-plain2' }), { flowType: 'plain', pick: null }, { priority: ['P1'] });
  assert.equal(plain.got.opts.ticket, undefined);
  assert.equal('ticketFilter' in plain.spec, false);
});
