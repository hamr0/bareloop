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
    assert.match(await err(`repo: ${repo}\nissues: https://github.com/o/r/pulls`, { server: 'other', tools: ['issue_read'] }), /line 2: only files inside the repo for now/);
  });
});
