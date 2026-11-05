// ITEM33-BUILD piece 8, the by-hand Tickets run. DIVERGENCE FROM fwd (ITEM33-BUILD R4): fwd's by-hand run takes `newestUnrunTicket` (src/ticket-next.js), which needs the ticket
// LOOK (`lookTickets`, the schedule rung R5/R6: not built here). So the card takes a ticket NUMBER typed by the person, checked with `ticketNumberOf` (the one reader `--ticket` also uses)
// and handed to `run-u --ticket <n>`. $0: the spawn is a stub, no run starts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { createAuthorRoutes, signRun } from '../src/panel/authorroutes.js';
import { ticketNumberOf, TICKET_MAX } from '../src/ticketshape.js';
import { world, makeRepo, keysHome, draftSeams, baseCard, FAKE_TOOLS } from './flowtype-world.mjs';

const LIST = 'https://github.com/o/r/issues';

test('ticketNumberOf: digits only, no zero in front, 1 to 9,999,999,999; the same words the CLI uses', () => {
  assert.equal(ticketNumberOf('42'), 42);
  assert.equal(ticketNumberOf(' 42 '), 42);
  assert.equal(ticketNumberOf(String(TICKET_MAX)), TICKET_MAX);
  for (const bad of ['', '0', '007', '-1', '1.5', '4 2', 'abc', '10000000000', undefined, null, 42]) assert.equal(ticketNumberOf(bad), undefined, String(bad));
});

test('the start door asks for the ticket number of a Tickets MCP job, refuses garbage, and refuses a number on any other job', async (t) => {
  const w = await world(t, { serve: false });
  // the $0 ticket-line proof reads the person's config from the process home (R2b's `proveTicketLine`), so this test's HOME is the fixture person's home
  const oldHome = process.env.HOME;
  process.env.HOME = w.home;
  t.after(() => { process.env.HOME = oldHome; });
  const repo = makeRepo(path.join(w.base, 'repo'));
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: FAKE_TOOLS.map((name) => ({ name, hint: null })) });
  const routes = createAuthorRoutes({ port: 1, token: 'x', home: keysHome(w.cfg), mcpHome: w.home, env: {}, sessionsRoot: path.join(w.base, 'sessions'), sessionDeps: draftSeams({}) });
  const inputs = [{ n: 1, label: 'repo', value: repo }, { n: 2, label: 'issues', value: LIST }];
  const tk = (over = {}) => baseCard({ source: repo, jobName: 'flow-t', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}`, ...over });
  // R6: a blank Ticket box is no longer refused here - it means "the newest ticket this job has not run", found by `run-u` at run start (tests/ticket-next-run.test.js)
  const bad = await routes.startSession(tk({ ticket: '4x' }), null, inputs);
  assert.match(bad.error, /^The ticket must be a whole number from 1 to 9,999,999,999, not "4x"\./);
  assert.equal(routes.sessions.size, 0, 'nothing started on a refusal');
  const plain = await routes.startSession(baseCard({ source: repo, jobName: 'flow-p', ticket: '5' }), null, [inputs[0]]);
  assert.match(plain.error, /only for a Tickets MCP job/);
  const ok = await routes.startSession(tk({ ticket: '42' }), null, inputs);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.session.state.card.ticket, '42');
});

function signed(card) {
  const dir = path.join(card.dir);
  const specPath = path.join(dir, 'resolved-spec.json');
  writeFileSync(specPath, '{}');
  return { state: { phase: 'prepared', specHash: 'abc123', resolvedSpecPath: specPath, outDir: dir, messages: [], card: card.card } };
}

test('signRun hands a Tickets MCP run its typed number as `--ticket <n>`; a card with none, or a bad one, passes no flag', async (t) => {
  const w = await world(t, { serve: false });
  const argsOf = (card) => {
    let got = null;
    const r = signRun(signed({ dir: w.base, card }), 'abc123', { env: {}, spawnFn: (cmd, args) => { got = args; return { unref: () => {} }; }, bareloopBin: '/x/bin/bareloop.mjs', sessionsRoot: path.join(w.base, 'sessions'), home: w.cfg });
    assert.equal(r.ok, true, JSON.stringify(r));
    return got;
  };
  const withTicket = argsOf({ flowType: 'tickets', mcp: 'github', ticket: '42' });
  const i = withTicket.indexOf('--ticket');
  assert.ok(i !== -1, '--ticket is a literal argv element');
  assert.equal(withTicket[i + 1], '42');
  assert.ok(withTicket.indexOf('run-u') < i, 'it follows run-u');
  assert.equal(argsOf({ flowType: 'tickets', mcp: 'github', ticket: ' 7 ' })[argsOf({ flowType: 'tickets', mcp: 'github', ticket: ' 7 ' }).indexOf('--ticket') + 1], '7');
  assert.equal(argsOf({ jobName: 'plain' }).includes('--ticket'), false);
  assert.equal(argsOf({ flowType: 'tickets', mcp: 'github', ticket: '0' }).includes('--ticket'), false, 'a number the CLI would refuse is never passed');
  assert.equal(argsOf({ flowType: 'tickets', mcp: 'github', ticket: '1; rm -rf /' }).includes('--ticket'), false);
});
