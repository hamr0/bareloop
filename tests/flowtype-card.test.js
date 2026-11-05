// borrowed-from: fwdloop test/m13-p4-card.test.js@ac85780 and test/m13-p4-flowtype.test.js@ac85780 (re-shaped: bareloop's card validators, createSession and the signed spec)
// ITEM33-BUILD piece 8: the New job card's Flow type and MCP, $0, no server started by the pick. The job gets every tool of the MCP's newest OK check (set by code); a never-checked
// MCP refuses before any session with one sentence; a PLAIN card writes no flow key, so every old job and bridge keeps its hash.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { cardFields, CARD_FIELDS, jobBoxesChanged, resolveFlowCard, ticketBoxProblem, flowOfCard } from '../src/panel/authorsession.js';
import { jobSpecHash, workflowKey, validateJob, flowTypeOf, FLOW_TYPE_LABELS } from '../src/job.js';
import { world, makeRepo, keysHome, draftSeams, draftSpec, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

const LIST = 'https://github.com/o/r/issues';
const OLD = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8'));
const checked = (w, tools = FAKE_TOOLS) => appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: tools.map((name) => ({ name, hint: null })) });
const where = (w) => ({ home: w.cfg, mcpHome: w.home });

test('the card fields carry flowType, mcp and ticket; a plain card (no keys) and flowType "plain" are the same card', () => {
  for (const f of ['flowType', 'mcp', 'ticket']) assert.ok(CARD_FIELDS.includes(f), f);
  assert.deepEqual(cardFields({ jobName: 'j', flowType: 'mcp', mcp: 'github', ticket: '5', stray: 1 }), { jobName: 'j', flowType: 'mcp', mcp: 'github', ticket: '5' });
  assert.deepEqual(flowOfCard({}), { flowType: 'plain', mcp: '' });
  assert.deepEqual(flowOfCard({ flowType: 'plain', mcp: 'github' }), { flowType: 'plain', mcp: '' }, 'plain carries no MCP, whatever a stray key says');
  assert.deepEqual(flowOfCard({ flowType: 'tickets', mcp: ' github ' }), { flowType: 'tickets', mcp: 'github' });
  assert.deepEqual(FLOW_TYPE_LABELS, { plain: 'plain', mcp: 'MCP', tickets: 'Tickets MCP' });
});

test('resolveFlowCard: plain passes with no MCP at all; a checked MCP gets ALL its tools; never checked is the one sentence', async (t) => {
  const w = await world(t, { serve: false });
  assert.deepEqual(resolveFlowCard({}, where(w)), { ok: true, flowType: 'plain', pick: null });
  assert.deepEqual(resolveFlowCard({ flowType: 'mcp', mcp: 'github' }, where(w)), { ok: false, error: 'press check tools in Settings > MCP first' });
  checked(w);
  const r = resolveFlowCard({ flowType: 'mcp', mcp: 'github' }, where(w));
  assert.deepEqual(r, { ok: true, flowType: 'mcp', pick: { server: 'github', tools: FAKE_TOOLS } });
});

test('resolveFlowCard: no MCP picked, an unknown one, a remote one and an unknown flow type are each refused by name', async (t) => {
  const w = await world(t, { files: { '.mcp.json': { mcpServers: { github: { command: 'true' }, hosted: { url: 'https://x.test/mcp' } } } }, serve: false });
  const say = (card) => resolveFlowCard(card, where(w)).error;
  assert.equal(say({ flowType: 'mcp', mcp: '' }), 'Pick an MCP.');
  assert.match(say({ flowType: 'mcp', mcp: 'nope' }), /nope is not in any MCP config/);
  assert.equal(say({ flowType: 'mcp', mcp: 'hosted' }), 'hosted is a remote server, not supported yet');
  assert.match(say({ flowType: 'chat', mcp: 'github' }), /Flow type must be one of plain, mcp, tickets/);
});

test('resolveFlowCard: Tickets MCP needs the ticket list address as an Inputs line; MCP does not', async (t) => {
  const w = await world(t, { serve: false });
  checked(w);
  const bad = resolveFlowCard({ flowType: 'tickets', mcp: 'github', inputs: 'repo: /r' }, where(w));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /^Tickets MCP needs the ticket list address as an Inputs line/);
  assert.equal(resolveFlowCard({ flowType: 'tickets', mcp: 'github', inputs: `repo: /r\nissues: ${LIST}` }, where(w)).ok, true);
  assert.equal(resolveFlowCard({ flowType: 'mcp', mcp: 'github', inputs: 'repo: /r' }, where(w)).ok, true);
});

test('jobBoxesChanged: a changed flow type or MCP is a changed job; absent and "plain" are the same; the Ticket box never counts', () => {
  const origin = baseCard({ jobName: 'j' });
  assert.equal(jobBoxesChanged(origin, origin), false);
  assert.equal(jobBoxesChanged({ ...origin, flowType: 'plain' }, origin), false, 'plain = no key');
  assert.equal(jobBoxesChanged({ ...origin, flowType: 'mcp', mcp: 'github' }, origin), true, 'plain -> MCP');
  const gm = { ...origin, flowType: 'mcp', mcp: 'github' };
  assert.equal(jobBoxesChanged(gm, gm), false);
  assert.equal(jobBoxesChanged({ ...gm, flowType: 'tickets' }, gm), true, 'MCP -> Tickets MCP');
  assert.equal(jobBoxesChanged({ ...gm, mcp: 'other' }, gm), true, 'another server');
  assert.equal(jobBoxesChanged({ ...origin }, gm), true, 'MCP -> plain');
  assert.equal(jobBoxesChanged({ ...gm, ticket: '9' }, gm), false, 'the ticket is a run box');
});

test('ticketBoxProblem: Tickets MCP needs a number the CLI would accept; any other flow takes none', () => {
  assert.match(ticketBoxProblem({}, 'tickets'), /^This job reads a ticket\. Type the ticket number to read \(a whole number from 1 to 9,999,999,999\)\.$/);
  assert.match(ticketBoxProblem({ ticket: 'abc' }, 'tickets'), /^The ticket must be a whole number from 1 to 9,999,999,999, not "abc"\.$/);
  for (const bad of ['0', '-3', '007', '1.5', '12345678901', '4 2']) assert.notEqual(ticketBoxProblem({ ticket: bad }, 'tickets'), null, bad);
  assert.equal(ticketBoxProblem({ ticket: '42' }, 'tickets'), null);
  assert.equal(ticketBoxProblem({ ticket: ' 42 ' }, 'tickets'), null);
  assert.equal(ticketBoxProblem({}, 'mcp'), null);
  assert.equal(ticketBoxProblem({}, 'plain'), null);
  assert.match(ticketBoxProblem({ ticket: '5' }, 'plain'), /only for a Tickets MCP job/);
});

test('a spec signed BEFORE this build (the real archived one, run mv5bk400) still hashes and keys exactly as it did, and reads as plain', () => {
  assert.equal(jobSpecHash(OLD), 'db2333d0a54886349093bb64dc0a4c9a1f263ffe1562de1faf720280fdca640b', 'the real archived spec (run mv5bk400) hashes as before');
  assert.equal(workflowKey(OLD), 'fb777a06e2d14c38a9a7a6be9f4c636cd4845d4b81555a60f2c4d62f028fb090');
  assert.equal(flowTypeOf(OLD), 'plain');
  assert.equal('flowType' in OLD || 'mcp' in OLD, false);
});

test('the START door (startSession): a never-checked MCP is refused with the one sentence BEFORE any session exists; a checked one starts', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const routes = createAuthorRoutes({ port: 1, token: 'x', home: keysHome(w.cfg), mcpHome: w.home, env: {}, sessionsRoot: path.join(w.base, 'sessions'), sessionDeps: draftSeams({}) });
  const card = baseCard({ source: repo, jobName: 'flow-a', flowType: 'mcp', mcp: 'github' });
  const ip = { inputs: [{ n: 1, label: 'repo', value: repo }] };
  const refused = await routes.startSession(card, null, ip.inputs);
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 400);
  assert.equal(refused.error, 'press check tools in Settings > MCP first');
  assert.equal(routes.sessions.size, 0, 'no session was made');
  checked(w);
  const started = await routes.startSession(card, null, ip.inputs);
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(routes.sessions.size, 1);
  assert.deepEqual(started.session.state.card.mcp, 'github');
});

test('the signed spec: a PLAIN card writes no flowType and no mcp; an MCP card signs flowType and EVERY tool of the newest check; the agent cannot set either', async (t) => {
  const w = await world(t, { serve: false });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const keys = keysHome(path.join(w.base, 'keys'));
  checked(w);
  const drafted = async (card, flow) => (await draftSpec(w, keys, card, flow)).spec;
  const plain = await drafted(baseCard({ source: repo, jobName: 'flow-plain' }), { flowType: 'plain', pick: null });
  assert.equal('flowType' in plain, false, 'plain writes NO flowType key');
  assert.equal('mcp' in plain, false);
  const bare = await drafted(baseCard({ source: repo, jobName: 'flow-bare' }), null);
  assert.deepEqual(Object.keys(plain).sort(), Object.keys(bare).sort(), 'no flow decision at all signs the same fields as a plain card');

  const pick = resolveFlowCard({ flowType: 'mcp', mcp: 'github' }, where(w));
  const mcpSpec = await drafted(baseCard({ source: repo, jobName: 'flow-mcp', flowType: 'mcp', mcp: 'github' }), { flowType: pick.flowType, pick: pick.pick });
  assert.equal(mcpSpec.flowType, 'mcp');
  assert.deepEqual(mcpSpec.mcp, { server: 'github', tools: FAKE_TOOLS }, 'EVERY tool, write tools included, none dropped');
  assert.equal(validateJob(mcpSpec, { shellCapUsd: mcpSpec.budgetUsd }).ok, true, JSON.stringify(validateJob(mcpSpec, { shellCapUsd: mcpSpec.budgetUsd }).reds));
  assert.notEqual(jobSpecHash(mcpSpec), jobSpecHash({ ...mcpSpec, flowType: undefined, mcp: undefined }), 'the pick is in the hash');
  assert.notEqual(workflowKey(mcpSpec), workflowKey({ ...mcpSpec, flowType: undefined, mcp: undefined }), 'and in the workflow key: a changed MCP is a new workflow');
});
