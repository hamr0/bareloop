// MCP + tickets piece 1a (ITEM33-BUILD Part G R2b): a ticket for a deterministic (code-repo) job. Step 2: `proveInputFiles` learns the ticket line kind.
// Later steps of this file: the run-start freeze into <workdir>/.bareloop-input/<label>.txt (private exclude), the gate, the books.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveInputFiles } from '../src/source.js';
import { parseInputs } from '../src/jobblock.js';
import { initPatientRepo, gitInPatient } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FAKE = join(HERE, 'fixtures', 'fake-mcp-server.mjs');
export const LIST = 'https://github.com/flutter/flutter/issues';
const MCP = { server: 'github', tools: ['issue_read'] };

/** @param {import('node:test').TestContext} t @param {string} prefix */
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** a scratch HOME whose ~/.mcp.json has a `github` server = the fake; process.env.HOME is restored after the test */
export function mcpHome(/** @type {import('node:test').TestContext} */ t, /** @type {Record<string,string>} */ env = {}, server = 'github') {
  const home = tmp(t, 'ticket-repo-home-');
  const old = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { process.env.HOME = old; });
  const calls = join(home, 'calls.jsonl');
  writeFileSync(join(home, '.mcp.json'), JSON.stringify({ mcpServers: { [server]: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, ...env } } } }));
  return { home, calls };
}

/** a scratch git repo with one tracked file */
function scratchRepo(/** @type {import('node:test').TestContext} */ t) {
  const dir = tmp(t, 'ticket-repo-');
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  initPatientRepo(repo);
  writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 1;\n');
  gitInPatient(repo, ['add', '-A']);
  gitInPatient(repo, ['commit', '-q', '-m', 'files']);
  return repo;
}

describe('proveInputFiles: the ticket line kind (R2b step 2)', () => {
  const prove = (/** @type {string} */ text, /** @type {any} */ opts) => { const p = parseInputs(text); assert.ok(p.ok, text); return proveInputFiles(p.inputs, opts); };

  test('with the job\'s mcp, a GitHub issues address on line 2+ is proven at $0 as "the MCP can read it"; line 1 stays the repo', async (t) => {
    mcpHome(t);
    const repo = scratchRepo(t);
    const r = await prove(`repo: ${repo}\nissues: ${LIST}\nsrc: src/a.js`, { mcp: MCP });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  test('without mcp (every existing caller) the same line is the old refusal: only files inside the repo for now', async (t) => {
    mcpHome(t);
    const repo = scratchRepo(t);
    const r = await prove(`repo: ${repo}\nissues: ${LIST}`);
    assert.equal(r.ok, false);
    assert.match(/** @type {any} */ (r).error, /line 2: only files inside the repo for now/);
  });

  test('each miss is a red naming its line, in plain words, at $0: server not in any config, issue_read not signed, two ticket lines, line 1 as the ticket', async (t) => {
    mcpHome(t, {}, 'other');
    const repo = scratchRepo(t);
    const err = async (/** @type {string} */ text, /** @type {any} */ mcp) => /** @type {any} */ (await prove(text, { mcp })).error;
    assert.match(await err(`repo: ${repo}\nissues: ${LIST}`, MCP), /line 2: github is not in ~\/\.mcp\.json/);
    assert.match(await err(`repo: ${repo}\nissues: ${LIST}`, { server: 'other', tools: ['list_issues'] }), /line 2: .*issue_read.*not among the tools this job signed/);
    assert.match(await err(`repo: ${repo}\na: ${LIST}\nb: https://github.com/o/r/issues`, { server: 'other', tools: ['issue_read'] }), /line 3: .*only one ticket address/);
    assert.match(await err(`repo: ${repo}\nissues: https://github.com/o/r/pulls/3`, { server: 'other', tools: ['issue_read'] }), /line 2: only files inside the repo for now/);
  });
});

// ── step 3: the run-start freeze for a repo job ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, lstatSync, symlinkSync, realpathSync } from 'node:fs';
import { prepareSource } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { main } from '../src/userrun.js';
import { redactSecrets } from '../src/validate.js';
import { freezeRepoTicket, TICKET_INPUT_DIR } from '../src/ticketrepo.js';
import { scriptedProvider, patientGitEnv } from './helpers.js';

const TOKEN = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`;
const sha = (/** @type {string|Buffer} */ s) => createHash('sha256').update(s).digest('hex');
const gitOut = (/** @type {string} */ cwd, /** @type {string[]} */ a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: patientGitEnv(), maxBuffer: 1 << 26 }).trim();

/** every file under `root` (dangling links skipped), as [path, Buffer] */
function allFiles(/** @type {string} */ root, /** @type {Array<[string, Buffer]>} */ acc = []) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory()) allFiles(p, acc);
    else if (e.isFile() && lstatSync(p).size < 5_000_000) acc.push([p, readFileSync(p)]);
  }
  return acc;
}
/** the files under `root` that carry `needle`, plus every git repo's full history (`log -p --all`, blobs are compressed on disk so ask git) */
function carrying(/** @type {string} */ root, /** @type {string} */ needle) {
  const hits = allFiles(root).filter(([p, b]) => !p.includes(`${path.sep}.git${path.sep}`) && b.includes(needle)).map(([p]) => p);
  for (const [p] of allFiles(root)) {
    if (!p.endsWith(`${path.sep}.git${path.sep}HEAD`)) continue;
    const repo = path.dirname(path.dirname(p));
    if (gitOut(repo, ['log', '-p', '--all']).includes(needle)) hits.push(`${repo} (git history)`);
  }
  return hits;
}

/** a real repo job's prepared copy: the person's repo, a detached worktree of it (prepareSource's own worktree door), and its source.json */
async function repoJob(/** @type {import('node:test').TestContext} */ t) {
  const repo = realpathSync(scratchRepo(t));
  const dir = path.dirname(repo);
  const into = join(dir, 'source-seed');
  const prep = await prepareSource({ source: repo, into, destination: 'src/', worktree: join(repo, '.bareloop', 'wt', 's1') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  if (prep.stop !== null) throw new Error('unreachable');
  return { repo, dir, into, wt: prep.tree, prep };
}
const INPUTS = (/** @type {string} */ repo) => [{ n: 1, label: 'repo', value: repo }, { n: 2, label: 'Issues', value: LIST }];

describe('freezeRepoTicket: the ticket frozen outside the tracked tree (R2b step 3)', () => {
  test('the frozen file is <workdir>/.bareloop-input/<label>.txt, MASKED, its sha is of the masked bytes; the record carries no token and no text', async (t) => {
    const { calls } = mcpHome(t, { FAKE_PLANT: TOKEN });
    const j = await repoJob(t);
    const r = await freezeRepoTicket({ workdir: j.wt, inputs: INPUTS(j.repo), ticket: { number: 100047, mcp: MCP } });
    assert.equal(r.ok, true, JSON.stringify(r));
    if (!r.ok) return;
    const file = join(j.wt, TICKET_INPUT_DIR, 'issues.txt');
    assert.ok(existsSync(file));
    const text = readFileSync(file, 'utf8');
    assert.match(text, /Tap the back arrow/);
    assert.ok(!text.includes(TOKEN), 'masked');
    assert.equal(r.record.sha256, sha(readFileSync(file)));
    assert.equal(r.record.masked, 1);
    assert.equal(r.record.file, `${TICKET_INPUT_DIR}/issues.txt`);
    assert.deepEqual({ number: r.record.number, title: r.record.title, state: r.record.state, source: r.record.source }, { number: 100047, title: 'Crash on tap', state: 'open', source: 'mcp' });
    assert.equal(r.record.url, `${LIST}/100047`);
    assert.deepEqual(r.record.mcp.calls, [{ tool: 'issue_read', owner: 'flutter', repo: 'flutter', issue_number: 100047 }]);
    assert.ok(!JSON.stringify(r.record).includes(TOKEN) && !JSON.stringify(r.record).includes('Tap the back arrow'), 'the record is metadata only');
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l).name), ['issue_read']);
  });

  test('hidden by git\'s PRIVATE exclude (the common dir\'s info/exclude, shared by the linked worktree): not in git status of the worktree or of the person\'s repo, not in the tracked .gitignore', async (t) => {
    mcpHome(t);
    const j = await repoJob(t);
    await freezeRepoTicket({ workdir: j.wt, inputs: INPUTS(j.repo), ticket: { number: 1, mcp: MCP } });
    assert.equal(gitOut(j.wt, ['status', '--porcelain']), '', 'the worktree reads clean: the ticket is not a worker write');
    assert.equal(gitOut(j.repo, ['status', '--porcelain']), '', 'the person\'s own repo reads clean');
    const common = path.resolve(j.wt, gitOut(j.wt, ['rev-parse', '--git-common-dir']));
    assert.match(readFileSync(join(common, 'info', 'exclude'), 'utf8'), /^\/\.bareloop-input\/$/m);
    assert.equal(existsSync(join(j.repo, '.gitignore')), false, 'the tracked .gitignore is never written');
    assert.match(gitOut(j.wt, ['check-ignore', '-v', `${TICKET_INPUT_DIR}/issues.txt`]), /info\/exclude/);
  });

  test('refusals are plain words at $0 and write nothing: server missing from the config, tool not offered, no ticket line in the Inputs, a tracked .bareloop-input (even a symlink out of the tree)', async (t) => {
    mcpHome(t, {}, 'other');
    const j = await repoJob(t);
    const r1 = await freezeRepoTicket({ workdir: j.wt, inputs: INPUTS(j.repo), ticket: { number: 1, mcp: MCP } });
    assert.equal(r1.ok, false);
    assert.match(String(!r1.ok && r1.error), /^Input "Issues": github is not in ~\/\.mcp\.json\. The run did not start\. Nothing spent\.$/);
    const r2 = await freezeRepoTicket({ workdir: j.wt, inputs: [{ n: 1, label: 'repo', value: j.repo }], ticket: { number: 1, mcp: { server: 'other', tools: ['issue_read'] } } });
    assert.match(String(!r2.ok && r2.error), /none of its Inputs \(after the repo\) is the issues page.*The run did not start\. Nothing spent\./);
    assert.equal(existsSync(join(j.wt, TICKET_INPUT_DIR)), false, 'nothing written by a refusal');
    // a repo that TRACKS the folder name as a symlink: writing through it would leave the tree
    const out = tmp(t, 'ticket-repo-out-');
    symlinkSync(out, join(j.wt, TICKET_INPUT_DIR));
    gitInPatient(j.wt, ['add', '-f', TICKET_INPUT_DIR]);
    gitInPatient(j.wt, ['commit', '-q', '-m', 'tracked link']);
    const r3 = await freezeRepoTicket({ workdir: j.wt, inputs: INPUTS(j.repo), ticket: { number: 1, mcp: { server: 'other', tools: ['issue_read'] } } });
    assert.equal(r3.ok, false);
    assert.match(String(!r3.ok && r3.error), /\.bareloop-input.*already in this repository.*The run did not start\. Nothing spent\./);
    assert.deepEqual(readdirSync(out), [], 'nothing was written through the link');
  });
});

// ── the real engine: run-u --spec --ticket on a repo job ───────────────────────────────────────────────────────────────────
async function engine(/** @type {import('node:test').TestContext} */ t, { argv = ['--ticket', '100047'], mcpEnv = { FAKE_PLANT: TOKEN }, steps } = /** @type {any} */ ({})) {
  mcpHome(t, mcpEnv);
  const j = await repoJob(t);
  const closeSource = `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const a = readFileSync(join(process.cwd(), 'src', 'a.js'), 'utf8');
console.log('FIXTURE judged=1');
process.exit(a.includes('= 2') ? 0 : 1);
`;
  const closeScript = join(j.dir, 'close.mjs');
  writeFileSync(closeScript, closeSource);
  const spec = {
    schema: 'job-v1', job: 'ticket-repo-job', description: 'MCP ticket on a code repo, run-start fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['src/**'],
    goal: 'Make src/a.js export a = 2.', verdictType: 'green', mcp: MCP, flowType: 'tickets', inputs: INPUTS(j.repo),
    close: [{ name: 'a-is-two', cmd: `node ${closeScript} a-is-two`, expect: 0, sha256: hashCloseScriptBytes(closeSource) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(j.dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'fix-a', action: 'Make src/a.js export a = 2', tools: ['read', 'recall', 'get', 'write'], rounds: 8, target: 'src/a.js',
    exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'a-is-two' }],
  }] });
  const frozen = join(j.wt, TICKET_INPUT_DIR, 'issues.txt');
  const provider = scriptedProvider([
    { text: 'scout: src/a.js is tiny' }, { text: plan },
    ...(steps ?? [
      { toolCalls: [{ id: 't1', name: 'shell_read', arguments: { path: frozen } }] },
      { toolCalls: [{ id: 't2', name: 'shell_write', arguments: { path: frozen, content: 'tampered\n' } }] },
      { toolCalls: [{ id: 't2b', name: 'shell_read', arguments: { path: frozen } }] },
      { toolCalls: [{ id: 't3', name: 'shell_write', arguments: { path: join(j.wt, 'src', 'a.js'), content: 'export const a = 2;\n' } }] },
      { text: 'wrote it' },
    ]),
  ]);
  const home = tmp(t, 'ticket-repo-runs-');
  /** @type {string[]} */ const out = []; /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...argv], { provider, env: {}, out: (s) => out.push(s), err: (s) => err.push(s), runlistHome: home });
  return { rc, out: out.join('\n'), err: err.join('\n'), home, provider, spec, frozen, ...j };
}

describe('run-u --spec --ticket on a code-repo job (R2b step 3)', () => {
  test('the old refusal is gone: a ticket job on a code repository now starts and reaches green', async (t) => {
    const r = await engine(t);
    assert.doesNotMatch(r.err, /not available yet/);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    assert.match(r.out, /outcome\s+green/);
  });

  test('the worker READS the frozen ticket (masked) and a WRITE to it is refused by the real gate (file unchanged); the model never saw the token', async (t) => {
    const r = await engine(t);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    const log = JSON.stringify(r.provider.messagesLog);
    assert.match(log, /Tap the back arrow/, 'the read returned the ticket text to the worker');
    assert.ok(!log.includes(TOKEN));
    assert.equal(log.split('Tap the back arrow').length - 1 >= 2, true, 'the worker read the ticket before AND after its refused write: the file was not changed');
    const audit = allFiles(r.dir).filter(([p]) => /gate-audit/.test(p)).flatMap(([, b]) => b.toString('utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const rows = audit.filter((a) => JSON.stringify(a).includes('.bareloop-input'));
    assert.ok(rows.some((a) => /read/.test(JSON.stringify(a)) && /allow/.test(JSON.stringify(a))), 'the gate audit shows the read allowed');
    assert.ok(rows.some((a) => /write/.test(JSON.stringify(a)) && /deny/.test(JSON.stringify(a))), 'the gate audit shows the write denied');
  });

  test('NOT in git status, NOT in the final work-branch commit; the token is in no file of the run folder, spine, gate audit, runs list, stdout/stderr, nor any git history', async (t) => {
    const r = await engine(t);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    const branches = gitOut(r.repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter((b) => b !== 'main');
    assert.ok(branches.length >= 1, `a work branch exists: ${branches}`);
    for (const b of branches) {
      const files = gitOut(r.repo, ['ls-tree', '-r', '--name-only', b]).split('\n');
      assert.ok(!files.some((f) => f.includes('.bareloop-input')), `not in the tree of ${b}`);
      assert.ok(gitOut(r.repo, ['log', '--name-only', '--format=', b]).split('\n').every((f) => !f.includes('.bareloop-input')), `not in any commit of ${b}`);
    }
    assert.match(gitOut(r.repo, ['show', `${branches[0]}:src/a.js`]), /a = 2/, 'the work itself is on the branch');
    if (existsSync(r.wt)) assert.equal(gitOut(r.wt, ['status', '--porcelain']), '');
    assert.deepEqual(carrying(r.dir, TOKEN), []);
    assert.deepEqual(carrying(r.home, TOKEN), []);
    assert.ok(!r.out.includes(TOKEN) && !r.err.includes(TOKEN));
  });

  test('the record: the spine\'s job-start carries ticket {number,title,state,source,sha256,bytes,masked,file,url,mcp}, matching the frozen bytes, with no text and no token', async (t) => {
    const r = await engine(t);
    assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
    const spines = allFiles(r.dir).filter(([p]) => p.endsWith('.jsonl') && !/gate-audit/.test(p));
    const starts = spines.flatMap(([, b]) => b.toString('utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((e) => e.type === 'job-start');
    assert.equal(starts.length, 1);
    const tk = starts[0].ticket;
    assert.ok(tk, 'job-start has a ticket record');
    // the worktree (and with it the frozen file) is removed at a green end; the record is what remains. The expected bytes are the fake server's reply, masked.
    const reply = `{"number":100047,"title":"Crash on tap","state":"open","body":"Tap the back arrow token ${TOKEN}","labels":[{"name":"P2"}]}`;
    assert.equal(tk.sha256, sha(redactSecrets(reply)));
    assert.equal(tk.bytes, Buffer.byteLength(redactSecrets(reply)));
    assert.equal(tk.masked, 1);
    assert.equal(tk.number, 100047);
    assert.equal(tk.file, `${TICKET_INPUT_DIR}/issues.txt`);
    assert.equal(tk.source, 'mcp');
    assert.deepEqual(tk.mcp.calls, [{ tool: 'issue_read', owner: 'flutter', repo: 'flutter', issue_number: 100047 }]);
    assert.ok(!JSON.stringify(tk).includes('Tap the back arrow') && !JSON.stringify(tk).includes(TOKEN));
  });

  test('refused at $0 before any model call: the MCP cannot give the ticket; and a repo ticket job with no --ticket', async (t) => {
    const r = await engine(t, { mcpEnv: { FAKE_REPLY: 'device' } });
    assert.notEqual(r.rc, 0);
    assert.match(r.err, /GitHub token unavailable.*The run did not start\. Nothing spent\./);
    assert.equal(r.provider.messagesLog.length, 0);
    assert.equal(existsSync(join(r.wt, TICKET_INPUT_DIR, 'issues.txt')), false);
    const none = await engine(t, { argv: [] });
    assert.notEqual(none.rc, 0);
    assert.match(none.err, /--ticket <number>/);
    assert.equal(none.provider.messagesLog.length, 0);
  });
});
