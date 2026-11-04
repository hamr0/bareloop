// MCP PR reader, through the REAL run start (ITEM33-BUILD piece 1a "PR-verification job" + piece 12): a repo job whose ticket line is a PULLS list and `--ticket 1`
// reads the pull request with `pull_request_read` (fake stdio server, scratch HOME, no network), then piece 12 checks the PR head out of a LOCAL bare repo serving
// refs/pull/1/head (tests/pr-checkout-world.mjs). A rubric/plain-folder job with the same line freezes the PR text only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { prepareSource, proveInputFiles, proveRubricInputs, refreezeUrlInputs, readSourceManifest } from '../src/source.js';
import { parseInputs } from '../src/jobblock.js';
import { main } from '../src/userrun.js';
import { scriptedProvider, gitInPatient } from './helpers.js';
import { makeWorld, out, OWNER, REPO } from './pr-checkout-world.mjs';
import { worktreePath } from '../src/worktree.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const PULLS = `https://github.com/${OWNER}/${REPO}/pulls`;
const TOKEN = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`;
const MCP = { server: 'github', tools: ['pull_request_read'] };

// green only on code that has the PR's file: the close judges the TREE the run starts with
const CLOSE_SOURCE = `import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('FIXTURE judged=1');
process.exit(existsSync(join(process.cwd(), 'src', 'only-on-pr.js')) ? 0 : 1);
`;

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** a scratch HOME whose ~/.mcp.json has a `github` server = the fake; process.env.HOME is restored after the test */
function mcpHome(/** @type {import('node:test').TestContext} */ t, /** @type {Record<string,string>} */ env = {}) {
  const home = tmp(t, 'mcp-pr-home-');
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; });
  const calls = join(home, 'calls.jsonl');
  writeFileSync(join(home, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, ...env } } } }));
  return { home, calls };
}

function allFiles(/** @type {string} */ root, /** @type {Array<[string, Buffer]>} */ acc = []) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) allFiles(p, acc);
    else if (e.isFile() && lstatSync(p).size < 5_000_000) acc.push([p, readFileSync(p)]);
  }
  return acc;
}
/** the files under `root` that carry `needle`, plus every git repo's history */
function carrying(/** @type {string} */ root, /** @type {string} */ needle) {
  const hits = allFiles(root).filter(([p, b]) => !p.includes(`${path.sep}.git${path.sep}`) && b.includes(needle)).map(([p]) => p);
  for (const [p] of allFiles(root)) {
    if (!p.endsWith(`${path.sep}.git${path.sep}HEAD`)) continue;
    const repo = path.dirname(path.dirname(p));
    if (execFileSync('git', ['-C', repo, 'log', '-p', '--all'], { encoding: 'utf8', maxBuffer: 1 << 26 }).includes(needle)) hits.push(`${repo} (git history)`);
  }
  return hits;
}

/** the world's repo job: a ticket job (flowType tickets) whose Inputs line 2 is the pulls list; `mcp` is what the job signed */
async function session(/** @type {import('node:test').TestContext} */ t, { mcpEnv = {}, mcp = MCP, argv = ['--ticket', '1'] } = /** @type {any} */ ({})) {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['worktree', 'remove', '--force', w.wt]);
  const home = mcpHome(t, { FAKE_PR_HEAD: w.prSha, FAKE_PR_BASE: w.baseSha, FAKE_PLANT: TOKEN, ...(typeof mcpEnv === 'function' ? mcpEnv(w) : mcpEnv) });
  const dir = tmp(t, 'mcp-pr-session-');
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'pr-ticket-job', description: 'PR reader fixture: the close is green on the PR code.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['src/**'], goal: 'Make src/only-on-pr.js exist.', verdictType: 'green',
    mcp, flowType: 'tickets', inputs: [{ n: 1, label: 'repo', value: w.repo }, { n: 2, label: 'PRs', value: PULLS }],
    close: [{ name: 'has-pr-file', cmd: `node ${closeScript} has-pr-file`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const prep = await prepareSource({ source: w.repo, into, destination: 'src/', worktree: worktreePath(w.repo, 'sess1') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  /** @type {string[]} */ const o = []; /** @type {string[]} */ const e = [];
  const runs = tmp(t, 'mcp-pr-runs-');
  const provider = scriptedProvider([]);
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...argv], { provider, env: {}, out: (s) => o.push(s), err: (s) => e.push(s), runlistHome: runs });
  return { ...w, dir, into, rc, out: o.join('\n'), err: e.join('\n'), runs, home, provider };
}

const jobStart = (/** @type {string} */ into) => {
  const d = join(into, 'pr-ticket-job-bareloop');
  return readdirSync(d).filter((n) => /^u-.*\.jsonl$/.test(n)).flatMap((n) => readFileSync(join(d, n), 'utf8').trim().split('\n').map((l) => JSON.parse(l))).find((x) => x.type === 'job-start');
};

describe('a repo job whose ticket line is a pulls list, on the real engine', () => {
  test('--ticket 1: the PR is read, the run checks out its head (seed = head), job-start carries the pr and the masked ticket record, no token anywhere, the provider is never called', async (t) => {
    const r = await session(t);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.match(r.out, /outcome\s+already-green/, 'the close was green on the PR head, which only the checkout provides');
    const m = JSON.parse(readFileSync(join(r.into, 'source.json'), 'utf8'));
    assert.deepEqual([m.seed, m.prHead, m.prNumber, m.prBase], [r.prSha, r.prSha, 1, { ref: 'main', sha: r.baseSha }]);
    const start = jobStart(r.into);
    assert.deepEqual(start.pr, { number: 1, ownerRepo: `${OWNER}/${REPO}`, head: r.prSha, base: { ref: 'main', sha: r.baseSha }, mergeBase: r.baseSha });
    const tk = start.ticket;
    assert.deepEqual([tk.number, tk.title, tk.state, tk.source, tk.masked, tk.url], [1, 'Bump the thing', 'open', 'mcp', 1, `https://github.com/${OWNER}/${REPO}/pull/1`]);
    assert.deepEqual(tk.mcp.calls, [{ tool: 'pull_request_read', owner: OWNER, repo: REPO, method: 'get', pullNumber: 1 }]);
    assert.ok(!JSON.stringify(start).includes(TOKEN) && !JSON.stringify(start).includes('Updates the thing'), 'the record has neither the text nor the token');
    assert.deepEqual(carrying(r.dir, TOKEN), []);
    assert.deepEqual(carrying(r.runs, TOKEN), []);
    assert.ok(!r.out.includes(TOKEN) && !r.err.includes(TOKEN));
    assert.equal(r.provider.messagesLog.length, 0);
    assert.equal(out(r.repo, ['for-each-ref', 'refs/bareloop']), '', 'the private ref went with the worktree');
    assert.equal(out(r.repo, ['symbolic-ref', '--short', 'HEAD']), 'main');
  });

  test('the PR moved after the read: ONE re-read and ONE re-fetch, the run lands on the head the re-read names', async (t) => {
    const r = await session(t, { mcpEnv: (/** @type {any} */ w) => ({ FAKE_PR_HEADS: `${w.laterSha},${w.prSha}` }) });
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.equal(JSON.parse(readFileSync(join(r.into, 'source.json'), 'utf8')).prHead, r.prSha);
    const calls = readFileSync(r.home.calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l).name);
    assert.deepEqual(calls, ['pull_request_read', 'pull_request_read'], 'one read, one re-read');
  });

  test('a PR whose head the server names differently every time is the spec\'s refusal: $0, no private ref left, the provider never called', async (t) => {
    const r = await session(t, { mcpEnv: (/** @type {any} */ w) => ({ FAKE_PR_HEAD: w.laterSha }) });
    assert.equal(r.rc, 2, `${r.out}\n${r.err}`);
    assert.match(r.err, /The pull request changed while the run was starting\. Run it again\. Nothing spent\./);
    assert.equal(out(r.repo, ['for-each-ref', 'refs/bareloop']), '');
    assert.equal(r.provider.messagesLog.length, 0);
  });

  test('a reply with no head is "no code to fetch"; a job that did not sign pull_request_read is refused in plain words before any server starts', async (t) => {
    const r = await session(t, { mcpEnv: { FAKE_PR_NOHEAD: '1' } });
    assert.equal(r.rc, 2);
    assert.match(r.err, /Pull request #1 has no code to fetch \(GitHub did not offer its head\)\. Nothing spent\./);
    const u = await session(t, { mcp: { server: 'github', tools: ['issue_read'] } });
    assert.equal(u.rc === 0, false);
    assert.match(u.err, /pull_request_read, the tool that reads a pull request, is not among the tools this job signed\. The run did not start\. Nothing spent\./);
    assert.equal(existsSync(u.home.calls), false, 'no server was started');
  });
});

describe('proveInputFiles: a pulls address on a repo job', () => {
  const prove = (/** @type {string} */ text, /** @type {any} */ opts) => { const p = parseInputs(text); assert.ok(p.ok, text); return proveInputFiles(p.inputs, opts); };
  test('proven at $0 when pull_request_read is signed; refused naming it when only issue_read is; the issues line stays proven by issue_read', async (t) => {
    mcpHome(t);
    const w = makeWorld(t);
    assert.equal((await prove(`repo: ${w.repo}\nPRs: ${PULLS}`, { mcp: MCP })).ok, true);
    const no = await prove(`repo: ${w.repo}\nPRs: ${PULLS}`, { mcp: { server: 'github', tools: ['issue_read'] } });
    assert.equal(no.ok, false);
    assert.match(String(!no.ok && no.error), /line 2: pull_request_read, the tool that reads a pull request, is not among the tools this job signed/);
    assert.equal((await prove(`repo: ${w.repo}\nIssues: https://github.com/${OWNER}/${REPO}/issues`, { mcp: { server: 'github', tools: ['issue_read'] } })).ok, true);
    const wrong = await prove(`repo: ${w.repo}\nIssues: https://github.com/${OWNER}/${REPO}/issues`, { mcp: MCP });
    assert.match(String(!wrong.ok && wrong.error), /issue_read, the tool that reads a ticket, is not among/);
  });
});

describe('a rubric / plain-folder job with a pulls line: the PR text only, no checkout', () => {
  test('the PR is read with pull_request_read and frozen masked as the run input; nothing is fetched or checked out', async (t) => {
    const { calls } = mcpHome(t, { FAKE_PLANT: TOKEN });
    const dir = tmp(t, 'mcp-pr-rubric-');
    const into = join(dir, 'source-seed');
    const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'PRs', value: PULLS }], into, fetchUrl: async (u) => ({ ok: true, text: `DRAFT-LIST ${'Pull requests list page text. '.repeat(10)}`, url: u }) });
    assert.equal(prep.ok, true, JSON.stringify(prep));
    if (!prep.ok) return;
    const r = await refreezeUrlInputs({ into, fetchUrl: async () => { throw new Error('the page reader must not be called for a ticket row'); }, ticket: { number: 12, mcp: MCP } });
    assert.equal(r.ok, true, JSON.stringify(r));
    const row = (await readSourceManifest(into)).manifest.inputs[0];
    const frozen = readFileSync(join(prep.prep.tree, 'input', 'prs.txt'), 'utf8');
    assert.match(frozen, /"title":"Bump the thing"/);
    assert.ok(!frozen.includes(TOKEN), 'masked');
    assert.deepEqual(row.ticket, { number: 12, title: 'Bump the thing', state: 'open', source: 'mcp' });
    assert.equal(row.mcp.calls[0].tool, 'pull_request_read');
    assert.equal(row.url, PULLS, 'the signed Inputs line is unchanged');
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l).name), ['pull_request_read']);
    const manifest = (await readSourceManifest(into)).manifest;
    assert.equal(manifest.prHead, undefined, 'no PR head: a plain-folder job has no repository to check out');
    assert.deepEqual(carrying(dir, TOKEN), []);
  });
});
