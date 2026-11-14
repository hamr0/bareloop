// hamr 2026-11-14 (rubric vs deterministic split, piece 5): a Tickets + rubric job goes through the check-list path (RUBRIC_FILES). The ticket line is the
// ONLY input, renumbered from 1 in ONE place (`cardInputs`, src/panel/authorsession.js) that the fresh card, the session and Reuse (`buildReuseSpec`) all read.
// The drafting-time read takes the newest unrun ticket (`newestUnrunTicket`) and reads it (`readTicket`): no ticket-number box. POC rounds 1-2 (runs mwg70fd7 /
// mwg3pov1): round 1 died at signing, spec-invalid inputs[0].n expected 1, because the ticket line kept its card number 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cardInputs, buildReuseSpec, createSession, startDestinationProblem, validateJobCard } from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';
import { validateJob } from '../src/job.js';
import { ANTH_CFG } from './helpers.js';

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
function makeRepo() {
  const dir = tmp('tix-rubric-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const LIST = 'https://github.com/hamr0/hol-guard/issues';
const MCP = { server: 'github', tools: ['issue_read', 'list_issues'] };
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 15); }); return fn(); };

test('cardInputs: in a Tickets + rubric job the ticket line is the only input, renumbered from 1; every other job keeps its lines as typed', () => {
  const repo = makeRepo();
  const inputs = `repo: ${repo}\nTickets: ${LIST}`;
  const tr = cardInputs({ checkType: 'rubric', flowType: 'tickets', mcp: 'github', inputs });
  assert.deepEqual(tr, { ok: true, inputs: [{ n: 1, label: 'Tickets', value: LIST }] });
  assert.deepEqual(cardInputs({ checkType: 'rubric', flowType: 'tickets', mcp: 'github', inputs: `Tickets: ${LIST}` }).inputs, [{ n: 1, label: 'Tickets', value: LIST }]);
  const det = cardInputs({ checkType: 'deterministic', flowType: 'tickets', mcp: 'github', inputs });
  assert.deepEqual(det.inputs.map((i) => i.n), [1, 2], 'a deterministic Tickets job (a repo job) keeps its repo and its ticket line');
  assert.deepEqual(cardInputs({ checkType: 'rubric', inputs }).inputs.map((i) => i.n), [1, 2], 'a plain rubric job is not touched');
});

test('Reuse takes the SAME owner: buildReuseSpec renumbers the ticket line, so the reused spec validates (round 1 of the POC died here, spec-invalid inputs[0].n)', () => {
  const origin = { schema: 'job-v1', job: 'tix', goal: 'read the ticket', budgetUsd: 1, writeScope: ['output/'], verdictType: 'soft-green', mcp: { server: 'github', tools: MCP.tools }, flowType: 'tickets', inputs: [{ n: 1, label: 'Tickets', value: LIST }] };
  const card = { checkType: 'rubric', flowType: 'tickets', mcp: 'github', inputs: `repo: /home/me/repo\nTickets: ${LIST}`, destination: '/tmp/out', capUsd: 2 };
  const spec = buildReuseSpec(origin, card);
  assert.deepEqual(spec.inputs, cardInputs(card).inputs, 'one owner, never a second copy');
  assert.deepEqual(spec.inputs, [{ n: 1, label: 'Tickets', value: LIST }]);
  const bad = validateJob({ ...origin, inputs: [{ n: 2, label: 'Tickets', value: LIST }] });
  assert.ok(bad.reds.some((r) => /^inputs(\.|\[)0(\.|\])n?/.test(String(r.path))), `a ticket line left at number 2 is the red the POC hit: ${JSON.stringify(bad.reds.map((r) => r.path))}`);
});

test('the Destination of a Tickets + rubric card is a drop-off folder, because its input is the ticket and not the repo line', () => {
  const repo = makeRepo();
  const card = { checkType: 'rubric', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nTickets: ${LIST}`, destination: 'src/' };
  assert.match(String(startDestinationProblem(card)), /Destination must be the full path of a folder/);
  assert.equal(startDestinationProblem({ ...card, destination: '/tmp/out' }), null);
});

test('drafting reads the NEWEST unrun ticket and freezes its text as the one input (no ticket-number box); the session works on that input alone', async () => {
  const repo = makeRepo();
  const home = tmp('tix-rubric-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const TEXT = '{"number":19,"title":"r7 live test: fix sum","state":"open"}';
  const asked = [];
  const PLAN = { goal: 'Read the ticket.', checks: [], questions: [], notChecked: [] };
  const seen = [];
  const session = createSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'tix-rubric', jobText: '1. Quote the ticket title', inputs: `repo: ${repo}\nTickets: ${LIST}`, destination: join(tmp('tix-rubric-out-'), 'out'), capUsd: 1, flowType: 'tickets', mcp: 'github' }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: join(home, 'panel-sessions'), flow: { flowType: 'tickets', pick: MCP },
    newestUnrunTicket: async (o) => { asked.push(['newest', o.mcp, o.inputs.map((i) => [i.n, i.label])]); return { ok: true, number: 19 }; },
    readTicketFn: async (row) => { asked.push(['read', row.number, row.listUrl]); return { ok: true, ticket: { text: TEXT, url: `${LIST}/19`, number: 19 } }; },
    generate: async () => { throw new Error('no model call'); },
    confirmGenerate: async (convo, tools) => { seen.push(convo); await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
  });
  assert.ok(await waitFor(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.deepEqual(asked, [['newest', MCP, [[1, 'Tickets']]], ['read', 19, LIST]], 'the newest unrun ticket was looked up through the product\'s own lookup, then read');
  const manifest = JSON.parse(readFileSync(join(session.state.outDir, 'source-seed', 'source.json'), 'utf8'));
  assert.equal(manifest.kind !== 'repo', true, 'no repo, no worktree: the ticket is the input');
  assert.deepEqual(manifest.inputs.map((i) => [i.label, i.url, i.sha256]), [['Tickets', LIST, createHash('sha256').update(TEXT).digest('hex')]], 'the frozen input row is the ticket line, number 1, carrying the list address run start re-reads');
  assert.match(seen[0][0].content, /the person pointed at these inputs: 1 Tickets /);
  session.abandon();
});

test('the card: rubric on a repo is refused, but a Tickets + rubric card (the repo line is not its input) is accepted', () => {
  const repo = makeRepo();
  const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG });
  const card = { checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'tix-rubric-card', jobText: 'Quote the ticket title', inputs: `repo: ${repo}\nTickets: ${LIST}`, destination: '/tmp/out', capUsd: 1 };
  assert.equal(validateJobCard(card, { rows }).error, 'A repo job uses a Deterministic check.');
  assert.deepEqual(validateJobCard({ ...card, flowType: 'tickets', mcp: 'github' }, { rows }), { ok: true });
});
