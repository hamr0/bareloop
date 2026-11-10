// borrowed-from: fwdloop test/m12-p3-skipped.test.js + m12-p3-skipped-start.test.js@v0.29.0 (ported: fwd's flow history row is bareloop's `settled` event on the runs.jsonl row)
// MCP + tickets piece 2 (R5), through the REAL run start: a Tickets job whose signed `ticketFilter` does not let the frozen ticket through ENDS `skipped` at run start,
// right after the ticket is frozen and before any worker or model call. The run is already listed (pid + cap); the skip appends ONE `settled` event
// ({reason:'skipped', words, spentUsd:0, spendComplete:true}) so the books balance; no spine, no learnings row; exit code 0. Fake MCP server, scratch HOME, no model.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { readRunList, isSettled } from '../src/runlist.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const LIST = 'https://github.com/flutter/flutter/issues';
const MCP = { server: 'github', tools: ['issue_read'] };
const DRAFT_PAGE = `DRAFT-LIST ${'Issues list page text. Open issues of the repository. '.repeat(8)}`;

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** a scratch HOME whose ~/.mcp.json has a `github` server = the fake; `issue` = the FAKE_ISSUE merge over the ticket it answers with */
function mcpHome(/** @type {import('node:test').TestContext} */ t, /** @type {Record<string, any>} */ issue = {}) {
  const home = tmp(t, 'skipped-home-');
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; });
  writeFileSync(join(home, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_ISSUE: JSON.stringify(issue) } } } }));
  return home;
}

/** every file name under `root` */
function names(/** @type {string} */ root, /** @type {string[]} */ acc = []) {
  for (const e of readdirSync(root, { withFileTypes: true })) { acc.push(join(root, e.name)); if (e.isDirectory()) names(join(root, e.name), acc); }
  return acc;
}

/** run the real engine on a Tickets job (rubric-style copy, the ticket frozen at run start) */
async function engine(/** @type {import('node:test').TestContext} */ t, { issue = {}, ticketFilter, argv = ['--ticket', '7'] } = /** @type {any} */ ({})) {
  mcpHome(t, issue);
  const dir = tmp(t, 'skipped-run-');
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Issues', value: LIST }], into, fetchUrl: async (u) => ({ ok: true, text: DRAFT_PAGE, url: u }) });
  assert.equal(prep.ok, true, JSON.stringify(prep));
  if (!prep.ok) throw new Error('unreachable');
  const closeSource = `import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('FIXTURE judged=1');
process.exit(existsSync(join(process.cwd(), 'output', 'out.txt')) ? 0 : 1);
`;
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'skip-job', description: 'Ticket filter fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/**'],
    goal: 'Write output/out.txt.', verdictType: 'green', mcp: MCP, flowType: 'tickets', ...(ticketFilter ? { ticketFilter } : {}),
    close: [{ name: 'out-exists', cmd: `node ${closeScript} out-exists`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-out', action: 'Write output/out.txt', tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'output/out.txt',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'out-exists' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout: output/ is empty' }, { text: plan },
    { toolCalls: [{ id: 't2', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'out.txt'), content: 'done\n' } }] },
    { text: 'wrote it' },
  ]);
  const home = tmp(t, 'skipped-runs-');
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...argv], { provider, env: {}, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: home });
  const list = readRunList({ home });
  return { rc, out: out.join('\n'), err: err.join('\n'), home, provider, list, row: list.rows[0], settled: list.events.find((e) => e.type === 'settled') };
}

describe('a skipped ticket ends at run start', () => {
  const cases = [
    ['priority P3 against a P1 filter', { labels: [{ name: 'P3' }] }, { priority: ['P1'] }, 'priority P3, not P1'],
    ['no priority label against a P1 filter', { labels: [{ name: 'bug' }] }, { priority: ['P1'] }, 'no P1 label on the ticket'],
    ['a ticket with NO labels key against a P1 filter (GitHub omits it)', { labels: '__omit__' }, { priority: ['P1'] }, 'no P1 label on the ticket'],
    ['a label the filter does not list', { labels: [{ name: 'docs' }] }, { labels: ['bug'] }, 'label bug not on the ticket'],
    ['a closed ticket, with a filter', { state: 'closed', labels: [{ name: 'P1' }] }, { priority: ['P1'] }, 'the ticket is closed'],
  ];
  for (const [name, issue, ticketFilter, words] of cases) {
    test(`${name}: exit 0, one settled event at $0, no model call, no spine, no learnings row`, async (t) => {
      const r = await engine(t, { issue, ticketFilter });
      assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
      assert.equal(r.provider.messagesLog.length, 0, 'no model call was made');
      assert.ok(r.row, 'the run is listed');
      assert.equal(existsSync(r.row.spine), false, 'a skipped run owns no spine');
      const ev = r.list.events.filter((e) => e.type === 'settled');
      assert.equal(ev.length, 1, 'exactly one settled event');
      assert.deepEqual({ reason: ev[0].reason, words: ev[0].words, spentUsd: ev[0].spentUsd, spendComplete: ev[0].spendComplete }, { reason: 'skipped', words, spentUsd: 0, spendComplete: true });
      assert.equal(isSettled(r.list.events, r.row), true, 'the monthly claim is freed');
      assert.equal(r.list.events.some((e) => e.type === 'released'), false, 'settled, not released: the row stays listed');
      assert.deepEqual(names(r.home).filter((p) => /learn|bridge|credit/i.test(p)), [], 'no learnings, bridge or credit file');
    });
  }

  test('--anyway runs the skipped ticket: no settled event, the run goes on to its worker', async (t) => {
    const r = await engine(t, { issue: { labels: [{ name: 'P3' }] }, ticketFilter: { priority: ['P1'] }, argv: ['--ticket', '7', '--anyway'] });
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.ok(r.provider.messagesLog.length > 0, 'the worker ran');
    assert.equal(r.list.events.some((e) => e.reason === 'skipped'), false);
  });
});

describe('a ticket the filter lets through runs', () => {
  const cases = [
    ['a priority match', { labels: [{ name: 'P1' }] }, { priority: ['P1'] }],
    ['an odd spelling of the priority (Priority: P1)', { labels: [{ name: 'Priority: P1' }] }, { priority: ['P1'] }],
    ['a priority on another scale is UNSURE and is carried, never skipped', { labels: [{ name: 'priority/important-soon' }] }, { priority: ['P1'] }],
    ['a label match', { labels: [{ name: 'Bug' }] }, { labels: ['bug'] }],
    ['no filter at all, an open ticket with no labels key', { labels: '__omit__' }, undefined],
  ];
  for (const [name, issue, ticketFilter] of cases) {
    test(`${name}: the worker runs, nothing is settled as skipped`, async (t) => {
      const r = await engine(t, { issue, ticketFilter });
      assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
      assert.ok(r.provider.messagesLog.length > 0, 'the worker ran');
      assert.equal(r.list.events.some((e) => e.reason === 'skipped'), false);
    });
  }
});

// R9 (9.4, fwd 83b6d02): an UNSURE verdict runs the ticket and the run's `job-start` carries WHY (`ticketFilter.unsure`, the reason text only), so the grid can wear its grey mark; a sure verdict leaves the field out.
describe('an unsure filter verdict is recorded on the run', () => {
  const jobStart = (r) => readFileSync(r.row.spine, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.type === 'job-start');
  test('a priority on another scale: job-start.ticketFilter.unsure holds the reason', async (t) => {
    const r = await engine(t, { issue: { labels: [{ name: 'priority/important-soon' }] }, ticketFilter: { priority: ['P1'] } });
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.match(jobStart(r).ticketFilter.unsure, /not on the P0-P3 scale/);
  });
  test('a sure verdict (a priority match) records nothing', async (t) => {
    const r = await engine(t, { issue: { labels: [{ name: 'P1' }] }, ticketFilter: { priority: ['P1'] } });
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.equal('ticketFilter' in jobStart(r), false);
  });
});
