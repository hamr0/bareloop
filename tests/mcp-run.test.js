// borrowed-from: fwdloop test/m12-p1-run.test.js@ac85780 (ported: fwd's runFlow/freezeInputs is bareloop's run-u + refreezeUrlInputs; the refusals are the existing `refused before start` path)
// MCP + tickets piece 1, through the REAL run start: a rubric/plain-folder job whose Inputs line is a GitHub issues address and whose signed spec carries `mcp`.
// `run-u --spec ... --ticket N` reads the ticket through the person's MCP server (a fake stdio server, scratch HOME, no network, no model) and freezes it as the
// run's input. Secret shapes in the ticket are MASKED before the sha. Every refusal is plain words at $0.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveRubricInputs, refreezeUrlInputs, readSourceManifest } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const LIST = 'https://github.com/flutter/flutter/issues';
const TOKEN = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`;
const MCP = { server: 'github', tools: ['issue_read'] };
const sha = (/** @type {string|Buffer} */ s) => createHash('sha256').update(s).digest('hex');
const DRAFT_PAGE = `DRAFT-LIST ${'Issues list page text. Open issues of the repository. '.repeat(8)}`;

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** a scratch HOME whose ~/.mcp.json has a `github` server = the fake (env says how it answers); process.env.HOME is restored after the test */
function mcpHome(/** @type {import('node:test').TestContext} */ t, /** @type {Record<string,string>} */ env = {}, server = 'github') {
  const home = tmp(t, 'mcp-run-home-');
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; });
  const calls = join(home, 'calls.jsonl');
  writeFileSync(join(home, '.mcp.json'), JSON.stringify({ mcpServers: { [server]: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, ...env } } } }));
  return { home, calls };
}

/** every file under `root`, as [path, Buffer] (dangling links and sockets skipped) */
function allFiles(/** @type {string} */ root, /** @type {Array<[string, Buffer]>} */ acc = []) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) allFiles(p, acc);
    else if (e.isFile() && lstatSync(p).size < 5_000_000) acc.push([p, readFileSync(p)]);
  }
  return acc;
}
/** the files under `root` that carry `needle`; includes git's history in any repo found (blobs are compressed on disk, so ask git) */
function filesCarrying(/** @type {string} */ root, /** @type {string} */ needle) {
  const hits = allFiles(root).filter(([p, b]) => !p.includes(`${path.sep}.git${path.sep}`) && b.includes(needle)).map(([p]) => p);
  for (const [p] of allFiles(root)) {
    if (!p.endsWith(`${path.sep}.git${path.sep}HEAD`)) continue;
    const repo = path.dirname(path.dirname(p));
    const log = execFileSync('git', ['-C', repo, 'log', '-p', '--all'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (log.includes(needle)) hits.push(`${repo} (git history)`);
  }
  return hits;
}

/** a prepared rubric-style copy whose Inputs line 1 is the issues address (the drafting copy = the list page text) */
async function prepared(/** @type {import('node:test').TestContext} */ t, /** @type {string} */ value = LIST) {
  const dir = tmp(t, 'mcp-run-');
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Issues', value }], into, fetchUrl: async (u) => ({ ok: true, text: DRAFT_PAGE, url: u }) });
  assert.equal(prep.ok, true, JSON.stringify(prep));
  if (!prep.ok) throw new Error('unreachable');
  return { dir, into, prep: prep.prep };
}
const never = async () => { throw new Error('the page reader must not be called for a ticket row'); };

describe('refreezeUrlInputs: a second fetcher for MCP ticket rows', () => {
  test('the ticket is read through the MCP, MASKED before the sha, frozen as the run copy; the manifest row carries mcp, ticket and masked; the page reader is not used', async (t) => {
    const { calls } = mcpHome(t, { FAKE_PLANT: TOKEN });
    const p = await prepared(t);
    const seed0 = p.prep.manifest.seed;
    const r = await refreezeUrlInputs({ into: p.into, fetchUrl: never, ticket: { number: 100047, mcp: MCP } });
    assert.equal(r.ok, true, JSON.stringify(r));
    const m = (await readSourceManifest(p.into)).manifest;
    const row = m.inputs[0];
    const frozen = readFileSync(join(p.prep.tree, 'input', 'issues.txt'), 'utf8');
    assert.match(frozen, /Tap the back arrow/, 'the ticket body is in the frozen file');
    assert.ok(!frozen.includes(TOKEN), 'the planted token is masked in the frozen bytes');
    assert.equal(row.sha256, sha(frozen), 'the sha is of the MASKED frozen bytes');
    assert.equal(row.draftSha256, sha(DRAFT_PAGE));
    assert.equal(row.masked, 1);
    assert.deepEqual(row.ticket, { number: 100047, title: 'Crash on tap', state: 'open', source: 'mcp' });
    assert.deepEqual(row.mcp, { server: 'github', exposed: ['github_issue_read'], missing: [], calls: [{ tool: 'issue_read', owner: 'flutter', repo: 'flutter', issue_number: 100047 }] });
    assert.equal(row.url, LIST, 'the signed Inputs line (the list address) is unchanged');
    assert.notEqual(m.seed, seed0);
    assert.equal(execFileSync('git', ['-C', p.prep.tree, 'status', '--porcelain'], { encoding: 'utf8' }), '', 'the ticket is not read as a worker write');
    assert.equal(execFileSync('git', ['-C', p.prep.tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), m.seed);
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l).name), ['issue_read'], 'only the signed tool was called');
    assert.deepEqual(filesCarrying(p.dir, TOKEN), [], 'the token is in no file under the run folder, nor in the git history');
    assert.deepEqual(m.files.find((/** @type {any} */ f) => f.path === 'issues.txt')?.sha256, sha(frozen), 'the files list names the same bytes');
  });

  test('a page input keeps its secret-shape REFUSAL (masking is for ticket rows only)', async (t) => {
    mcpHome(t);
    const p = await prepared(t, 'https://example.com/some/page');
    const r = await refreezeUrlInputs({ into: p.into, fetchUrl: async (u) => ({ ok: true, text: `${DRAFT_PAGE} ${TOKEN}`, url: u }), ticket: { number: 5, mcp: MCP } });
    assert.equal(r.ok, false);
  });

  test('no ticket given = the old behaviour, a list address is fetched as an ordinary page', async (t) => {
    mcpHome(t);
    const p = await prepared(t);
    const asked = [];
    const r = await refreezeUrlInputs({ into: p.into, fetchUrl: async (u) => { asked.push(u); return { ok: true, text: `RUN-LIST ${DRAFT_PAGE}`, url: u }; } });
    assert.equal(r.ok, true);
    assert.deepEqual(asked, [LIST]);
    assert.equal((await readSourceManifest(p.into)).manifest.inputs[0].mcp, undefined);
  });

  const refusals = [
    ['the server is not in any config', { server: 'other' }, {}, /^Input "Issues": github is not in ~\/\.mcp\.json\. The run did not start\. Nothing spent\.$/],
    ['the tool is not offered', {}, { FAKE_TOOLS: JSON.stringify([{ name: 'get_file_contents' }]) }, /github does not offer issue_read\. The run did not start/],
    ['the server asks for a device login', {}, { FAKE_REPLY: 'device' }, /GitHub token unavailable.*The run did not start\. Nothing spent\.$/],
    ['the reply is empty', {}, { FAKE_REPLY: 'empty' }, /issue_read returned nothing for .*\/100047.*The run did not start/],
    ['the server fails the call', {}, { FAKE_REPLY: 'error' }, /issue_read failed: Could not resolve to a Repository/],
  ];
  for (const [name, o, env, want] of refusals) {
    test(`refused at $0, nothing frozen: ${name}`, async (t) => {
      mcpHome(t, env, o.server);
      const p = await prepared(t);
      const before = readFileSync(join(p.into, 'source.json'), 'utf8');
      const r = await refreezeUrlInputs({ into: p.into, fetchUrl: never, ticket: { number: 100047, mcp: MCP } });
      assert.equal(r.ok, false);
      assert.match(String(!r.ok && r.error), want);
      assert.equal(readFileSync(join(p.into, 'source.json'), 'utf8'), before, 'the record is untouched');
      assert.equal(readFileSync(join(p.prep.tree, 'input', 'issues.txt'), 'utf8'), DRAFT_PAGE, 'the drafting copy is untouched');
    });
  }

  test('a ticket job whose Inputs name no GitHub issues address, or two of them, is refused in plain words', async (t) => {
    mcpHome(t);
    const none = await prepared(t, 'https://example.com/page');
    const r0 = await refreezeUrlInputs({ into: none.into, fetchUrl: never, ticket: { number: 1, mcp: MCP } });
    assert.match(String(!r0.ok && r0.error), /reads a ticket.*none of its Inputs is a GitHub issues address.*Nothing spent/);
    const dir = tmp(t, 'mcp-run-two-');
    const two = await proveRubricInputs({ inputs: [{ n: 1, label: 'A', value: LIST }, { n: 2, label: 'B', value: 'https://github.com/o/p/issues' }], into: join(dir, 's'), fetchUrl: async (u) => ({ ok: true, text: DRAFT_PAGE, url: u }) });
    assert.equal(two.ok, true);
    const r2 = await refreezeUrlInputs({ into: join(dir, 's'), fetchUrl: never, ticket: { number: 1, mcp: MCP } });
    assert.match(String(!r2.ok && r2.error), /more than one of its Inputs is a GitHub issues address/);
  });
});

// ── the real engine: run-u --spec --ticket ─────────────────────────────────────────────────────────────────────────────────
async function engine(/** @type {import('node:test').TestContext} */ t, { extraSpec = {}, argv = ['--ticket', '100047'], env = {}, mcpEnv = { FAKE_PLANT: TOKEN }, edit } = /** @type {any} */ ({})) {
  mcpHome(t, mcpEnv);
  const p = await prepared(t);
  const closeSource = `import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const page = readFileSync(join(process.cwd(), 'input', 'issues.txt'), 'utf8');
const wrote = existsSync(join(process.cwd(), 'output', 'out.txt'));
console.log('FIXTURE judged=1');
process.exit(page.includes('Tap the back arrow') && wrote ? 0 : 1);
`;
  const closeScript = join(p.dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'ticket-run-job', description: 'MCP ticket run-start fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/**'],
    goal: 'Write output/out.txt.', verdictType: 'green', mcp: MCP, flowType: 'tickets',
    close: [{ name: 'ticket-copy', cmd: `node ${closeScript} ticket-copy`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' }, ...extraSpec,
  };
  const specPath = join(p.dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  if (edit) await edit(p);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-out', action: 'Write output/out.txt', tools: ['read', 'recall', 'get', 'write'], rounds: 6, target: 'output/out.txt',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'ticket-copy' }],
  }] });
  const provider = scriptedProvider([
    { text: 'scout: output/ is empty' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_read', arguments: { path: join(p.prep.tree, 'input', 'issues.txt') } }] },
    { toolCalls: [{ id: 't2', name: 'shell_write', arguments: { path: join(p.prep.tree, 'output', 'out.txt'), content: 'done\n' } }] },
    { text: 'wrote it' },
  ]);
  const home = tmp(t, 'mcp-run-runs-');
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...argv], { provider, env, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: home });
  return { rc, out: out.join('\n'), err: err.join('\n'), home, provider, ...p };
}

describe('run-u --spec --ticket: the engine', () => {
  test('a ticket run is green on the frozen ticket; the planted token appears in NO file under the run folder, the spine, the gate audit, the runs list or the git history', async (t) => {
    const r = await engine(t);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.match(r.out, /outcome\s+green/);
    const m = (await readSourceManifest(r.into)).manifest;
    assert.equal(m.inputs[0].masked, 1);
    assert.equal(m.inputs[0].ticket.number, 100047);
    assert.equal(m.inputs[0].sha256, sha(readFileSync(join(r.prep.tree, 'input', 'issues.txt'))));
    const spineAndAudit = allFiles(r.into).map(([p]) => p).filter((p) => /spine|gate-audit|\.jsonl$/.test(p));
    assert.ok(spineAndAudit.length > 0, 'the run left a spine / audit to grep');
    assert.deepEqual(filesCarrying(r.dir, TOKEN), []);
    assert.deepEqual(filesCarrying(r.home, TOKEN), []);
    assert.ok(!r.out.includes(TOKEN) && !r.err.includes(TOKEN));
    assert.ok(!JSON.stringify(r.provider.messagesLog).includes(TOKEN), 'the model never saw the token');
  });

  test('a ticket the MCP cannot give stops the run before any spend: plain words, the runs list settles it as refused before start', async (t) => {
    const r = await engine(t, { mcpEnv: { FAKE_REPLY: 'device' } });
    assert.notEqual(r.rc, 0);
    assert.match(r.err, /GitHub token unavailable.*The run did not start\. Nothing spent\./);
    assert.equal(r.provider.messagesLog.length, 0, 'no model call was made');
    const rows = readFileSync(join(r.home, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const settled = rows.find((x) => x.type === 'settled');
    assert.equal(settled?.reason, 'refused before start');
    assert.equal(settled?.spentUsd, 0);
  });

  describe('--ticket / --anyway at argv, before any approval or spend', () => {
    test('a ticket job without --ticket is refused in plain words', async (t) => {
      const r = await engine(t, { argv: [] });
      assert.notEqual(r.rc, 0);
      assert.match(r.err, /reads a ticket.*--ticket <number>/);
      assert.equal(r.provider.messagesLog.length, 0);
    });
    test('--anyway needs --ticket', async (t) => {
      const r = await engine(t, { argv: ['--anyway'] });
      assert.notEqual(r.rc, 0);
      assert.match(r.err, /--anyway needs --ticket/);
    });
    for (const bad of ['0', 'abc', '1.5', '-3', '99999999999', '']) {
      test(`a bad ticket number ${JSON.stringify(bad)} is refused`, async (t) => {
        const r = await engine(t, { argv: ['--ticket', bad] });
        assert.notEqual(r.rc, 0);
        assert.match(r.err, /--ticket takes a whole number from 1 to 9,999,999,999/);
      });
    }
    test('--ticket on a job with no ticket source is refused', async (t) => {
      const r = await engine(t, { extraSpec: { mcp: undefined, flowType: undefined } });
      assert.notEqual(r.rc, 0);
      assert.match(r.err, /--ticket is for a job that reads tickets/);
    });
    test('--anyway with --ticket is accepted (its effect, skipping the filter, arrives with the filter)', async (t) => {
      const r = await engine(t, { argv: ['--ticket', '100047', '--anyway'] });
      assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    });
    test('a ticket job on a code repo (a worktree run) is refused: that freeze is not built yet, and the run must not go on without its ticket', async (t) => {
      const r = await engine(t, { edit: async (p) => {
        const f = join(p.into, 'source.json');
        const m = JSON.parse(readFileSync(f, 'utf8'));
        writeFileSync(f, JSON.stringify({ ...m, worktree: p.prep.tree }));
      } });
      assert.notEqual(r.rc, 0);
      assert.match(r.err, /code repository.*not available yet/);
      assert.equal(r.provider.messagesLog.length, 0);
    });
  });

  test('a RESUME does not ask for a ticket again: the ticket gate applies to a fresh start only (the run keeps the copy its first start froze)', async (t) => {
    const r = await engine(t, { argv: ['--resume', 'nosuchrun1'] });
    assert.doesNotMatch(r.err, /reads a ticket|--ticket/, r.err);
    assert.ok(existsSync(FAKE));
  });
});
