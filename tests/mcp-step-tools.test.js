// borrowed-from: fwdloop test/m13-p2-step-tools.test.js@a701e58 (re-shaped: fwd's runFlow/resolvePrimitives is bareloop's validatePlan + planPrompt + runPlan worker build; fwd's canrun.js findMcpPlanRed lives in validatePlan)
// MCP + tickets piece 6, R2c: a plan step may call only the MCP tools the job signed (`mcpTools`, a subset of `mcp.tools`), validated at $0 before any token
// (stray tool = verb-escape; a generic MCP job with no calling step = red; a Tickets job's own issue_read/list_issues need no step), and the drafter is told.
// Real: validatePlan, planPrompt. The worker half (real bridge, real Gate, a scripted provider, no network) is in the later sections of this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Gate } from 'bareguard';
import { validatePlan } from '../src/plan.js';
import { planPrompt, runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { toolAction, TOOL_BY_VERB, CTX_TOOLS, mcpStrategy } from '../src/tools.js';
import { mcpAllowlist } from '../src/stepmcp.js';
import { scriptedProvider } from './helpers.js';
import { tcall, makePatient, JOB as PATIENT_JOB, PLAN, collector } from './planrun-fixtures.js';

const JOB = {
  schema: 'job-v1', job: 'ticket-fix', description: 'fix what a ticket reports', provider: 'anthropic-api', cadence: { unit: 'week', every: 1 }, budgetUsd: 1.8,
  writeScope: ['tests/**'], goal: 'Write a test that covers what the ticket reports.', verdictType: 'green',
  close: [
    { name: 'clean-run', cmd: 'python -m pytest -ra tests/test_x.py', expect: 0, gapKeep: '^FAILED', sha256: 'a'.repeat(64) },
    { name: 'verdict', cmd: 'python grade.py', expect: 0, sha256: 'a'.repeat(64) },
  ],
  tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
};
const MCP = { server: 'github', tools: ['issue_read', 'list_issues', 'add_issue_comment'] };
const step = (over = {}) => ({
  id: 'look', action: 'Look the ticket up and write notes.', tools: ['read', 'write'], rounds: 6, target: 'tests/notes.md',
  exit: [{ type: 'artifact-written', path: 'tests/notes.md' }], ...over,
});
const plan = (...steps) => ({ schema: 'plan-v1', steps });
const reds = (job, p) => validatePlan(p, { job }).reds;

test('a step granting a subset of the job\'s mcp tools validates', () => {
  const v = validatePlan(plan(step({ mcpTools: ['issue_read'] })), { job: { ...JOB, mcp: MCP, flowType: 'mcp' } });
  assert.deepEqual(v.reds, []);
  assert.equal(v.ok, true);
});

test('a step naming a tool outside the signed list is exactly one verb-escape red naming the tool and the legal values', () => {
  const r = reds({ ...JOB, mcp: MCP, flowType: 'mcp' }, plan(step({ mcpTools: ['issue_read', 'delete_repo'] })));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'verb-escape');
  assert.equal(r[0].path, 'steps.0.mcpTools');
  assert.equal(r[0].verb, 'delete_repo');
  assert.match(r[0].detail, /delete_repo/);
  assert.match(r[0].detail, /issue_read, list_issues, add_issue_comment/, 'the red hands over the legal values');
  assert.match(r[0].detail, /"mcpTools": \["issue_read"\]/, 'and a legal example');
});

test('a Tickets job (an mcp block, no flowType) is stray-checked too', () => {
  const r = reds({ ...JOB, mcp: MCP }, plan(step({ mcpTools: ['nope'] })));
  assert.deepEqual(r.map((x) => x.code), ['verb-escape']);
});

test('mcpTools on a job that signed no mcp server is a verb-escape, not silently inert', () => {
  const r = reds(JOB, plan(step({ mcpTools: ['issue_read'] })));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'verb-escape');
  assert.match(r[0].detail, /no MCP server/);
});

for (const [label, bad] of [['empty', []], ['a duplicate', ['issue_read', 'issue_read']], ['a non-string', [7]], ['not a list', 'issue_read']]) {
  test(`mcpTools that is ${label} is an invalid-value red`, () => {
    const r = reds({ ...JOB, mcp: MCP }, plan(step({ mcpTools: bad })));
    assert.deepEqual(r.map((x) => x.code), ['invalid-value']);
    assert.equal(r[0].path, 'steps.0.mcpTools');
  });
}

test('a generic MCP job (flowType mcp) with no step granting one of its tools is red', () => {
  const r = reds({ ...JOB, mcp: MCP, flowType: 'mcp' }, plan(step()));
  assert.equal(r.length, 1);
  assert.equal(r[0].code, 'missing-required');
  assert.equal(r[0].path, 'steps');
  assert.match(r[0].detail, /github/);
  assert.match(r[0].detail, /"mcpTools": \["issue_read"\]/);
});

test('a Tickets job\'s own tools need no calling step', () => {
  assert.deepEqual(reds({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] }, flowType: 'tickets' }, plan(step())), []);
  assert.deepEqual(reds({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } }, plan(step())), []);
});

test('a plain job is unchanged: no mcp block, no mcpTools, no new red', () => {
  assert.deepEqual(reds(JOB, plan(step())), []);
});

test('the drafter prompt tells the planner about mcpTools and its legal values; a plain job\'s prompt does not mention it', () => {
  const withMcp = planPrompt({ ...JOB, mcp: MCP, flowType: 'mcp' }, 'scout', null, 40, null, null, null);
  assert.match(withMcp, /"mcpTools"/);
  assert.match(withMcp, /\["issue_read","list_issues","add_issue_comment"\]/, 'the legal values are the job\'s signed tools');
  assert.match(withMcp, /"mcpTools":\s*\["issue_read"\]/, 'a legal example rides with the rule');
  assert.match(withMcp, /at least one step/, 'a generic job is told a step must call a tool');
  const tickets = planPrompt({ ...JOB, mcp: { server: 'github', tools: ['issue_read', 'list_issues'] } }, 'scout', null, 40, null, null, null);
  assert.match(tickets, /"mcpTools"/);
  assert.doesNotMatch(tickets, /at least one step/, 'a Tickets job\'s own tools need no step, so it is not told that');
  assert.doesNotMatch(planPrompt(JOB, 'scout', null, 40, null, null, null), /mcpTools/);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// The worker half: runPlan with a REAL bridge (a fake stdio server, scratch HOME), a REAL bareguard Gate, a scripted provider. No network, no key.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const THREE = JSON.stringify([{ name: 'issue_read' }, { name: 'list_issues' }, { name: 'add_issue_comment' }]);   // the server offers all three; the step signs one
const SIGNED = { server: 'github', tools: ['issue_read', 'list_issues', 'add_issue_comment'] };

/** a scratch HOME whose ~/.mcp.json has a `github` server = the fake; `tag` rides the child's argv so a test can find ITS child in /proc (never by name alone) */
function mcpHome(t, { env = {}, config } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mcp-step-home-'));
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; rmSync(home, { recursive: true, force: true }); });
  const tag = `mcp-step-tag-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const calls = join(home, 'calls.jsonl');
  writeFileSync(join(home, '.mcp.json'), JSON.stringify(config ?? { mcpServers: { github: { command: process.execPath, args: [FAKE, tag], env: { FAKE_MCP_SERVER: '1', FAKE_TOOLS: THREE, FAKE_CALLS: calls, ...env } } } }));
  return { home, tag, calls };
}
const callsOf = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
/** the pids whose argv carries `tag` (own children only: the tag is unique to this test) */
const pidsWith = (tag) => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).filter((d) => { try { return readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').includes(tag); } catch { return false; } }).map(Number);
const gone = async (pids) => { for (let i = 0; i < 60 && pids.some((p) => existsSync(`/proc/${p}`)); i += 1) await new Promise((r) => { setTimeout(r, 100); }); return pids.filter((p) => existsSync(`/proc/${p}`)); };
const auditRows = (wd) => readFileSync(join(wd, 'gate-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.phase === 'gate');

const STEP = (over = {}) => [{
  id: 'write-test', action: 'Look the ticket up with the tool, then write tests/test_x.mjs with an ok assertion.', tools: ['read', 'write'], rounds: 8, target: 'tests/test_x.mjs',
  exit: [{ type: 'artifact-written', path: 'tests/test_x.mjs', pattern: 'ok' }], mcpTools: ['issue_read'], ...over,
}];
const ISSUE = { method: 'get', owner: 'o', repo: 'r', issue_number: 7 };

/**
 * Run one MCP step under a scripted provider. `script(wd)` builds the provider script once the patient exists; `watch(provider, ctx)` may wrap generate (to look
 * at the world mid-run).
 */
async function runMcp(t, { script, steps = STEP(), jobOver = {}, env, config, watch } = {}) {
  const h = mcpHome(t, { env, config });
  const wd = makePatient(t);
  const jv = validateJob(PATIENT_JOB(wd, { mcp: SIGNED, flowType: 'mcp', ...jobOver }));
  assert.deepEqual(jv.reds, [], 'the test job must be validateJob-green');
  const provider = scriptedProvider(script ? script(wd) : [
    { text: 'scout' }, { text: PLAN(wd, steps) },
    { toolCalls: [tcall('1', 'github_issue_read', ISSUE)] },
    { toolCalls: [tcall('2', 'shell_read', { path: join(wd, 'src', 'mod.mjs') })] },
    { toolCalls: [tcall('3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  if (watch) watch(provider, { wd, ...h });
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 3, remainingUsd: () => 1.5 });
  return { wd, ...h, provider, events, outcome };
}
const stepCall = (provider) => provider.toolsOffered.findIndex((names) => names.includes('shell_write'));

test('a step with mcpTools is offered exactly those bridge tools beside its verbs; the unsigned ones do not exist, and the server never hears of them', async (t) => {
  const r = await runMcp(t, {
    script: (wd) => [
      { text: 'scout' }, { text: PLAN(wd, STEP()) },
      { toolCalls: [tcall('1', 'github_issue_read', ISSUE)] },
      { toolCalls: [tcall('2', 'github_list_issues', {}), tcall('3', 'github_add_issue_comment', { body: 'pwn' })] },
      { toolCalls: [tcall('4', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
      { text: 'done' },
    ],
  });
  const k = stepCall(r.provider);
  assert.ok(k > 0, 'the step worker ran');
  const offered = r.provider.toolsOffered[k];
  assert.ok(offered.includes('github_issue_read'), `the granted tool is offered: ${offered}`);
  assert.deepEqual(offered.filter((n) => n.startsWith('github_')), ['github_issue_read'], 'ONLY the granted bridge tool is offered');
  assert.equal(offered.some((n) => /^mcp_/.test(n)), false, 'no discover/invoke meta tool');
  // the scout and the drafter never see a bridge tool
  assert.equal(r.provider.toolsOffered.slice(0, k).flat().some((n) => n.startsWith('github_')), false, 'scout/drafter have no MCP tool');
  // the model asked for two unsigned tools: it was told by name that they do not exist, and the server heard only issue_read
  const told = JSON.stringify(r.provider.messagesLog.at(-1));
  assert.match(told, /Unknown tool: github_list_issues/);
  assert.match(told, /Unknown tool: github_add_issue_comment/);
  assert.deepEqual(callsOf(r.calls).map((c) => c.name), ['issue_read']);
  assert.equal(r.outcome, 'green', JSON.stringify(r.events.filter((e) => e.type === 'escalation')));
});

test('with the allowlist on, the step\'s own fs verbs and the MCP call all pass the REAL gate; the audit names the allowlist as the rule', async (t) => {
  const r = await runMcp(t);
  const rows = auditRows(r.wd);
  const allowed = (pred) => rows.filter((x) => x.decision === 'allow' && pred(x.action));
  assert.equal(allowed((a) => a.type === 'github_issue_read').length, 1, 'the MCP call is an allow row');
  assert.ok(allowed((a) => a.type === 'read').length >= 1, 'shell_read still allowed');
  assert.ok(allowed((a) => a.type === 'write').length >= 1, 'shell_write still allowed');
  assert.deepEqual(rows.filter((x) => x.decision === 'deny'), [], 'no deny row on a correct run');
  assert.ok(rows.filter((x) => x.decision === 'allow' && x.action.type !== 'llm').every((x) => x.rule === 'tools.allowlist'), 'every tool decision came through the allowlist rule');
  assert.equal(r.outcome, 'green');
});

test('a step with NO mcpTools builds no allowlist (the gate is exactly as before)', async (t) => {
  const r = await runMcp(t, {
    steps: STEP({ mcpTools: undefined }), jobOver: { mcp: undefined, flowType: undefined },
    script: (wd) => [{ text: 'scout' }, { text: PLAN(wd, STEP({ mcpTools: undefined })) },
      { toolCalls: [tcall('3', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] }, { text: 'done' }],
  });
  const rows = auditRows(r.wd).filter((x) => x.action.type !== 'llm');
  assert.ok(rows.length > 0);
  assert.ok(rows.every((x) => x.rule === 'default'), `no allowlist rule: ${[...new Set(rows.map((x) => x.rule))]}`);
  assert.equal(r.provider.toolsOffered.flat().some((n) => n.startsWith('github_')), false);
});

test('the gate\'s allowlist is exclusive: an unsigned tool name is DENIED by the real gate; the list is action TYPES, so a list of tool NAMES denies the fs verbs (fwd F116)', async () => {
  const wd = mkdtempSync(join(tmpdir(), 'mcp-allow-'));
  try {
    const mk = async (allowlist) => { const g = new Gate({ fs: { writeScope: [wd], readScope: [wd] }, tools: { allowlist }, audit: { path: join(wd, 'a.jsonl') }, humanChannel: async () => ({ decision: 'terminate' }) }); await g.init(); return g; };
    const right = await mk(mcpAllowlist(['read', 'write', 'edit', 'stash'], 'github', ['issue_read'], wd));
    const act = (name, args) => toolAction(name, { path: join(wd, 'a.txt'), ...args }, wd);
    for (const n of ['shell_read', 'shell_write', 'shell_edit', 'ctx_stash']) assert.equal((await right.check(act(n, { id: 'k', text: 't' }))).outcome, 'allow', `${n} allowed`);
    assert.equal((await right.check(act('github_issue_read', {}))).outcome, 'allow');
    const d = await right.check(act('github_add_issue_comment', { body: 'x' }));
    assert.equal(d.outcome, 'deny');
    assert.equal(d.rule, 'tools.allowlist.exclusive');
    assert.match(d.reason, /github_add_issue_comment/);
    // fwd's spelling (tool NAMES) is the trap: it denies the step's own read
    const names = await mk(['shell_read', 'shell_write', 'github_issue_read']);
    assert.equal((await names.check(act('shell_read', {}))).outcome, 'deny');
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('mcpAllowlist lists the action types of the GRANTED verbs only (derived from toolAction, no second spelling) plus the signed bridge names', () => {
  assert.deepEqual(mcpAllowlist(['read', 'grep', 'recall', 'get'], 'github', ['issue_read', 'list_issues'], '/w'), ['read', 'github_issue_read', 'github_list_issues']);
  assert.deepEqual(mcpAllowlist(['read', 'write', 'edit', 'stash', 'remember', 'forget'], 'github', ['issue_read'], '/w'), ['read', 'write', 'edit', 'ctx_stash', 'ctx_remember', 'ctx_forget', 'github_issue_read']);
  // every verb the menu has resolves to an allowlist entry (a new verb with a new action type cannot be silently denied)
  const all = mcpAllowlist(Object.keys(TOOL_BY_VERB), 'github', ['issue_read'], '/w');
  for (const n of [...Object.values(TOOL_BY_VERB), ...CTX_TOOLS]) assert.ok(all.includes(toolAction(n, { path: '/w/a' }, '/w').type), `${n} -> ${toolAction(n, { path: '/w/a' }, '/w').type} is listed`);
});

test('a granted MCP tool ships with a strategy line naming exactly the granted tools; a step without them gets none', async (t) => {
  assert.equal(mcpStrategy([]), '');
  assert.match(mcpStrategy(['github_issue_read']), /github_issue_read/);
  assert.doesNotMatch(mcpStrategy(['github_issue_read']), /list_issues/);
  const r = await runMcp(t);
  const sys = r.provider.systems[stepCall(r.provider)];
  assert.ok(sys.includes(mcpStrategy(['github_issue_read']).trim()), 'the step worker\'s system prompt carries the line');
  assert.equal(r.provider.systems[0].includes('github_'), false, 'the scout does not');
});

test('the bridge child is started once for the step and is GONE after a green step', async (t) => {
  let during = [];
  const r = await runMcp(t, { watch: (p, ctx) => { const g = p.generate.bind(p); p.generate = async (m, tools) => { if ((tools ?? []).some((x) => x.name === 'github_issue_read')) during = [...new Set([...during, ...pidsWith(ctx.tag)])]; return g(m, tools); }; } });
  assert.equal(r.outcome, 'green');
  assert.equal(during.length, 1, `one bridge child while the step ran: ${during}`);
  assert.deepEqual(await gone(during), [], 'the child outlived the step');
});

test('the bridge child is GONE after a step that never goes green (its last try ends red)', async (t) => {
  let during = [];
  const r = await runMcp(t, {
    script: (wd) => [{ text: 'scout' }, { text: PLAN(wd, STEP()) }, { toolCalls: [tcall('1', 'github_issue_read', ISSUE)] }, { text: 'I read it and have nothing to write' }],
    watch: (p, ctx) => { const g = p.generate.bind(p); p.generate = async (m, tools) => { if ((tools ?? []).some((x) => x.name === 'github_issue_read')) during = [...new Set([...during, ...pidsWith(ctx.tag)])]; return g(m, tools); }; },
  });
  assert.notEqual(r.outcome, 'green');
  assert.ok(during.length >= 1, 'a child ran while the step ran');
  assert.deepEqual(await gone(during), [], 'a bridge child outlived the step');
});

test('a server missing from ~/.mcp.json stops the step in plain words naming it, with no child left and no provider call for the step', async (t) => {
  const r = await runMcp(t, { config: { mcpServers: { other: { command: process.execPath, args: [FAKE, 'x'], env: { FAKE_MCP_SERVER: '1' } } } } });
  const esc = r.events.find((e) => e.type === 'escalation');
  assert.ok(esc, 'an escalation was recorded');
  assert.match(esc.detail, /github is not in ~\/\.mcp\.json/);
  assert.equal(stepCall(r.provider), -1, 'the step worker never reached the provider');
  assert.notEqual(r.outcome, 'green');
});

test('a signed tool the server does not offer stops the step in plain words naming it', async (t) => {
  const r = await runMcp(t, { env: { FAKE_TOOLS: JSON.stringify([{ name: 'list_issues' }]) } });
  const esc = r.events.find((e) => e.type === 'escalation');
  assert.match(esc?.detail ?? '', /github does not offer issue_read/);
  assert.equal(stepCall(r.provider), -1);
});
