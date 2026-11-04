// borrowed-from: fwdloop test/m12-p1-reader.test.js@30b3dcc (ported: scratch dirs from node:fs, the readers from src/ticketmcp.js; the freezeInputs half is tests/mcp-run.test.js)
// The ticket reader. A real bare-agent MCP bridge against a fake stdio server (tests/fixtures/fake-mcp-server.mjs), an explicit config path, no network, no model.
// Each refusal names the real cause; none ever reads as empty content.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTicketMcp, MCP_PASS_ENV, mcpStartOpts } from '../src/ticketmcp.js';
import { mcpSources, mcpConfigFor } from '../src/mcpsources.js';
import { mcpPathProblem } from '../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, 'fixtures', 'fake-mcp-server.mjs');
const LIST = 'https://github.com/flutter/flutter/issues';
const MCP = { server: 'github', tools: ['issue_read'] };

/** a scratch dir with a `.mcp.json` whose `github` server is the fake; `env` is what the fake reads, `server` renames the entry, `command` swaps the command */
function world(t, { env = {}, server = 'github', command = process.execPath, args = [FAKE], noServers = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bareloop-mcp-reader-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = path.join(dir, 'calls.jsonl');
  const configPath = path.join(dir, 'mcp.json');
  writeFileSync(configPath, JSON.stringify({ mcpServers: noServers ? {} : { [server]: { command, args, env: { FAKE_MCP_SERVER: '1', FAKE_CALLS: calls, ...env } } } }));
  const read = (over = {}) => readTicketMcp({ listUrl: LIST, number: 100047, mcp: MCP, configPath, ...over });
  const callsMade = () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { dir, configPath, read, callsMade };
}

describe('reads one ticket through only the job\'s tools', () => {
  test('issue_read for owner/repo/N from the list address; the record says what was exposed, missing and called', async (t) => {
    const w = world(t);
    const r = await w.read();
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    assert.match(r.text, /"number":100047/);
    assert.equal(r.url, 'https://github.com/flutter/flutter/issues/100047');
    assert.deepEqual(r.record, {
      server: 'github', exposed: ['github_issue_read'], missing: [], calls: [{ tool: 'issue_read', owner: 'flutter', repo: 'flutter', issue_number: 100047 }],
    });
    assert.deepEqual(w.callsMade(), [{ name: 'issue_read', arguments: { method: 'get', owner: 'flutter', repo: 'flutter', issue_number: 100047 } }]);
  });
  test('the server offers more tools than the job lists: only the job\'s tool exists for the run, and only it is called', async (t) => {
    const w = world(t); // the fake offers issue_read AND list_issues
    const r = await w.read();
    assert.equal(r.ok, true);
    assert.deepEqual(r.record.exposed, ['github_issue_read']);
    assert.deepEqual(w.callsMade().map((c) => c.name), ['issue_read']);
  });
  test('a list address that is not owner/repo issues, or a bad ticket number, is refused before any server starts', async (t) => {
    const w = world(t);
    for (const [over, want] of [
      [{ listUrl: 'https://example.com/a/b/issues' }, /not a GitHub issues address/],
      [{ number: 0 }, /ticket number/],
      [{ number: 1.5 }, /ticket number/],
      [{ number: '7' }, /ticket number/],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await w.read(over);
      assert.equal(r.ok, false);
      assert.match(r.error, want);
    }
    assert.deepEqual(w.callsMade(), []);
  });
  test('the job must list issue_read for the reader to use it', async (t) => {
    const w = world(t);
    const r = await w.read({ mcp: { server: 'github', tools: ['list_issues'] } });
    assert.equal(r.ok, false);
    assert.match(r.error, /does not list issue_read/);
    assert.deepEqual(w.callsMade(), []);
  });
  test('the repo\'s own .mcp.json is never read: a ./.mcp.json in the cwd that has the server changes nothing when the config lacks it', async (t) => {
    const w = world(t, { noServers: true });
    writeFileSync(path.join(w.dir, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: process.execPath, args: [FAKE] } } }));
    const before = process.cwd();
    process.chdir(w.dir);
    try {
      const r = await w.read();
      assert.equal(r.ok, false);
      assert.equal(r.error, 'github is not in ~/.mcp.json');
    } finally { process.chdir(before); }
  });
});

describe('refusals that name the real cause', () => {
  test('server not in the config', async (t) => {
    const w = world(t, { server: 'other' });
    const r = await w.read();
    assert.deepEqual([r.ok, r.error], [false, 'github is not in ~/.mcp.json']);
  });
  test('server did not start: the first error line, nothing else', async (t) => {
    const w = world(t, { command: '/nonexistent/bareloop-no-such-binary', args: [] });
    const r = await w.read();
    assert.equal(r.ok, false);
    assert.match(r.error, /^github did not start: /);
    assert.doesNotMatch(r.error, /\n/);
  });
  test('server does not offer the tool', async (t) => {
    const w = world(t, { env: { FAKE_TOOLS: JSON.stringify([{ name: 'get_file_contents', annotations: { readOnlyHint: true } }]) } });
    const r = await w.read();
    assert.deepEqual([r.ok, r.error], [false, 'github does not offer issue_read']);
  });
  test('hints are info only: a tool with no mark, a false mark or a junk mark is read and called like any other', async (t) => {
    for (const annotations of [undefined, { readOnlyHint: false }, { readOnlyHint: 'true' }, { destructiveHint: false }]) {
      const w = world(t, { env: { FAKE_TOOLS: JSON.stringify([{ name: 'issue_read', ...(annotations ? { annotations } : {}) }]) } });
      // eslint-disable-next-line no-await-in-loop
      const r = await w.read();
      assert.equal(r.ok, true, JSON.stringify(annotations) + (r.ok ? '' : ` ${r.error}`));
      assert.deepEqual(w.callsMade().map((c) => c.name), ['issue_read'], 'the signed tool is called');
    }
  });
  test('the server answers with the device-login text: GitHub token unavailable, never content', async (t) => {
    const w = world(t, { env: { FAKE_REPLY: 'device' } });
    const r = await w.read();
    assert.deepEqual([r.ok, r.error], [false, 'GitHub token unavailable — the server asked for a login (is pass locked?)']);
  });
  test('an empty reply and an error reply are refused, never frozen as empty', async (t) => {
    const e = await world(t, { env: { FAKE_REPLY: 'empty' } }).read();
    assert.equal(e.ok, false);
    assert.match(e.error, /github: issue_read returned nothing for .*\/100047/);
    const x = await world(t, { env: { FAKE_REPLY: 'error' } }).read();
    assert.equal(x.ok, false);
    assert.equal(x.error, 'github: issue_read failed: Could not resolve to a Repository');
  });
});

describe('the server gets PATH and HOME only, and the home folder as its start folder (G0 re-proved through the reader)', () => {
  test('the constants and a provider key in the parent env never reaches the server', async (t) => {
    assert.deepEqual([...MCP_PASS_ENV], ['PATH', 'HOME']);
    assert.deepEqual(Object.keys(mcpStartOpts()).sort(), ['cwd', 'passEnv']);
    const names = path.join(mkdtempSync(path.join(tmpdir(), 'bareloop-mcp-env-')), 'names.json');
    t.after(() => rmSync(path.dirname(names), { recursive: true, force: true }));
    process.env.FAKE_PROVIDER_KEY = 'canary-xyz';
    t.after(() => { delete process.env.FAKE_PROVIDER_KEY; });
    const w = world(t, { args: [path.join(HERE, 'fixtures', 'env-names-mcp-server.mjs')], env: { ENV_NAMES_OUT: names } });
    // the env-names server answers issue_read like any server; it records the env names it was started with
    await w.read();
    const seen = JSON.parse(readFileSync(names, 'utf8'));
    assert.ok(!seen.includes('FAKE_PROVIDER_KEY'), `leaked: ${seen}`);
    assert.deepEqual(seen, ['ENV_NAMES_OUT', 'FAKE_CALLS', 'FAKE_MCP_SERVER', 'HOME', 'PATH'], 'PATH, HOME and the server\'s own env entry only');
  });
});

describe('where a server is found: first name wins across the places and config.json mcpPaths', () => {
  /** a scratch HOME with the 4 default places empty, and a config home */
  function homes(t) {
    const root = mkdtempSync(path.join(tmpdir(), 'bareloop-mcp-sources-'));
    const oldHome = process.env.HOME;
    t.after(() => { process.env.HOME = oldHome; rmSync(root, { recursive: true, force: true }); });
    process.env.HOME = path.join(root, 'home');
    mkdirSync(path.join(root, 'home'), { recursive: true });
    const cfgHome = path.join(root, 'cfg');
    mkdirSync(cfgHome, { recursive: true });
    const put = (file, servers) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ mcpServers: servers })); };
    return { root, home: path.join(root, 'home'), cfgHome, put, setPaths: (paths) => writeFileSync(path.join(cfgHome, 'config.json'), JSON.stringify({ mcpPaths: paths })) };
  }
  test('~/.mcp.json beats an added path with the same name; the later one reads as shadowed; a remote server is flagged', (t) => {
    const h = homes(t);
    const added = path.join(h.root, 'extra.json');
    h.put(path.join(h.home, '.mcp.json'), { github: { command: 'node', args: [] } });
    h.put(added, { github: { command: 'node', args: ['x'] }, only: { url: 'https://example.invalid/mcp' } });
    h.setPaths([added]);
    const src = mcpSources({ home: h.cfgHome });
    const flat = src.places.flatMap((p) => p.servers.map((s) => ({ place: p.path, ...s })));
    assert.deepEqual(flat.map((s) => [s.name, s.shadowedBy === null, s.remote]), [['github', true, false], ['github', false, false], ['only', true, true]]);
    assert.equal(mcpConfigFor('github', { home: h.cfgHome })?.file, path.join(h.home, '.mcp.json'));
    assert.deepEqual(mcpConfigFor('only', { home: h.cfgHome }), { file: added, remote: true });
    assert.equal(mcpConfigFor('nope', { home: h.cfgHome }), null);
  });
  test('the reader finds a server that only an added path has, with no explicit config path; a remote server is refused by name', async (t) => {
    const h = homes(t);
    const added = path.join(h.root, 'extra.json');
    h.put(added, { github: { command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1' } } });
    h.setPaths([added]);
    const r = await readTicketMcp({ listUrl: LIST, number: 5, mcp: MCP, home: h.cfgHome });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    h.put(added, { github: { url: 'https://example.invalid/mcp' } });
    const x = await readTicketMcp({ listUrl: LIST, number: 5, mcp: MCP, home: h.cfgHome });
    assert.deepEqual([x.ok, x.error], [false, 'github is a remote server, not supported yet']);
  });
  test('a broken config.json is reported as a problem, never as "no paths"', (t) => {
    const h = homes(t);
    writeFileSync(path.join(h.cfgHome, 'config.json'), '{nope');
    assert.match(mcpSources({ home: h.cfgHome }).problem ?? '', /cannot be read/);
  });
  test('mcpPathProblem: absolute paths only, no duplicates', () => {
    assert.equal(mcpPathProblem(['/a/b.json', '/c.json']), null);
    for (const bad of ['x', [''], ['rel/path.json'], ['~/x.json'], ['/a', '/a'], [1], ['/a\0b']]) assert.notEqual(mcpPathProblem(bad), null, JSON.stringify(bad));
  });
});
