// borrowed-from: fwdloop test/m13-p3-mcp-settings.test.js@d453892 (re-shaped: bareloop's panel server + injected homes instead of fwd's createSettings + chromium; the page is checked from the HTML the panel serves, the look by hand-taken screenshots)
// ITEM33-BUILD piece 7: where MCPs come from, and Settings > MCP. $0, no model call, no network.
// REAL: the panel server's settings routes, mcpSources / mcpConfigFor, bare-agent's listServerTools and bridge. FAKE: the MCP servers
// (tests/fixtures/cwd-mcp-server.mjs writes a marker file at start, so "was it started" is a file; fake-mcp-server.mjs answers a ticket read).
// Every test has a fixture person's home (`mcpHome`, injected) and a fixture config home (`home`); HOME itself is a scratch dir too (npm test is hermetic),
// and the real ~/.mcp.json and ~/.config/bareloop are never touched.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanelServer } from '../src/panel/server.js';
import { mcpConfigFor, mcpSources, DEFAULT_MCP_PLACES } from '../src/mcpsources.js';
import { countMcpUse } from '../src/mcpuse.js';
import { readTicketMcp } from '../src/ticketmcp.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MARK = path.join(FIX, 'cwd-mcp-server.mjs');
const FAKE = path.join(FIX, 'fake-mcp-server.mjs');
const ENVS = path.join(FIX, 'env-names-mcp-server.mjs');
const KEY = 'KEYCANARY-r3-7c1e9a';
const CMD = 'CMDCANARY-r3-4b2d8f';

/**
 * A scratch world: the person's home, the config home, a project folder (the cwd). `files` = {relative path under the person's home: json}.
 * The panel is started with `mcpHome` = that home; the process cwd is the project folder (restored after).
 */
async function world(t, files = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-'));
  const home = path.join(base, 'person');
  const cfg = path.join(base, 'cfg');
  const proj = path.join(base, 'proj');
  for (const d of [home, cfg, proj]) mkdirSync(d, { recursive: true });
  for (const [rel, json] of Object.entries(files)) { mkdirSync(path.dirname(path.join(home, rel)), { recursive: true }); writeFileSync(path.join(home, rel), JSON.stringify(json)); }
  const cwd = process.cwd();
  process.chdir(proj);
  const { port, token, close } = await createPanelServer({ port: 0, home: cfg, mcpHome: home, env: {}, sessionsRoot: path.join(base, 'sessions') });
  t.after(async () => { await close(); process.chdir(cwd); rmSync(base, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${port}`;
  const H = { 'x-bareloop-token': token, 'content-type': 'application/json' };
  const get = async (p) => { const r = await fetch(`${origin}${p}`, { headers: H }); return { status: r.status, body: await r.json() }; };
  const post = async (p, body) => { const r = await fetch(`${origin}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { base, home, cfg, proj, origin, H, port, get: () => get('/api/settings/mcp'), post, getRaw: get };
}
const marker = (dir) => path.join(dir, 'started.txt');
const markServer = (out, extra = {}) => ({ command: process.execPath, args: [MARK], env: { CWD_OUT: out, ...extra } });
const fakeServer = (extra = {}) => ({ command: process.execPath, args: [FAKE], env: { FAKE_MCP_SERVER: '1', ...extra } });
const find = (body, name) => body.places.flatMap((p) => p.servers.map((s) => ({ ...s, place: p.path }))).filter((s) => s.name === name);

test('a project folder .mcp.json is never read: its server is not listed, not checkable, never started', async (t) => {
  const w = await world(t, { '.mcp.json': { mcpServers: { github: fakeServer() } } });
  const out = marker(w.base);
  writeFileSync(path.join(w.proj, '.mcp.json'), JSON.stringify({ mcpServers: { canary: markServer(out) } }));
  const r = await w.get();
  assert.equal(find(r.body, 'canary').length, 0, 'the project server is listed');
  assert.equal(mcpConfigFor('canary', { mcpHome: w.home }), null);
  const c = await w.post('/api/settings/mcp-check', { server: 'canary' });
  assert.equal(c.body.refused, 'unknown-mcp');
  assert.equal(existsSync(out), false, 'the project server was started');
});

test('check tools starts a server only on a press: a GET starts nothing; the press starts that one, once, with the home folder as its cwd', async (t) => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-mk-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const out = marker(outDir);
  const w = await world(t, { '.mcp.json': { mcpServers: { canary: markServer(out) } } });
  await w.get(); await w.get();
  assert.equal(existsSync(out), false, 'a GET started the server');
  const c = await w.post('/api/settings/mcp-check', { server: 'canary' });
  assert.deepEqual([c.status, c.body.ok, c.body.checked], [200, true, true]);
  assert.equal(existsSync(out), true, 'the press did not start it');
  assert.equal(readFileSync(out, 'utf8'), w.home, 'the server did not start in the person\'s home folder (and not in the project folder)');
});

test('check tools hands the server PATH and HOME and no parent *_KEY (the route uses the same passEnv as a run)', async (t) => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-env-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const out = path.join(outDir, 'names.json');
  const w = await world(t, { '.mcp.json': { mcpServers: { envs: { command: process.execPath, args: [ENVS], env: { ENV_NAMES_OUT: out, OWN_SETTING: 'x' } } } } });
  process.env.BARELOOP_R3_CANARY_KEY = 'canary-not-a-key';
  try { assert.equal((await w.post('/api/settings/mcp-check', { server: 'envs' })).body.ok, true); } finally { delete process.env.BARELOOP_R3_CANARY_KEY; }
  const names = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(names.includes('BARELOOP_R3_CANARY_KEY'), false, 'a parent *_KEY name reached the MCP');
  for (const n of ['PATH', 'HOME', 'OWN_SETTING']) assert.equal(names.includes(n), true, `${n} must reach the MCP`);
});

test('check tools starts ONLY the named server: a second server in the same file is not started (inherent to listServerTools; confirmServer is belt and braces, so this is not fail-first on that one line)', async (t) => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-only-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const w = await world(t, { '.mcp.json': { mcpServers: { one: markServer(marker(path.join(outDir))), two: markServer(path.join(outDir, 'two.txt')) } } });
  assert.equal((await w.post('/api/settings/mcp-check', { server: 'one' })).body.ok, true);
  assert.equal(existsSync(path.join(outDir, 'started.txt')), true);
  assert.equal(existsSync(path.join(outDir, 'two.txt')), false, 'the other server in the file was started');
});

test('a key or a command is on no route and not on the page (also when the server cannot start and the library message holds the command)', async (t) => {
  const w = await world(t, {
    '.mcp.json': { mcpServers: { good: fakeServer({ GITHUB_TOKEN: KEY, FAKE_NOTE: CMD }), ghost: { command: `/nonexistent/${CMD}/serve`, args: ['--token', KEY], env: { TOKEN: KEY } } } },
  });
  const seen = [];
  seen.push(JSON.stringify((await w.get()).body));
  seen.push(JSON.stringify((await w.post('/api/settings/mcp-check', { server: 'good' })).body));
  const bad = await w.post('/api/settings/mcp-check', { server: 'ghost' });
  seen.push(JSON.stringify(bad.body));
  seen.push(JSON.stringify((await w.get()).body));
  seen.push(JSON.stringify((await w.post('/api/settings/mcp-path', { path: '~/.claude.json' })).body));
  seen.push(JSON.stringify((await w.get()).body));
  seen.push(readFileSync(path.join(w.cfg, 'mcp-checks.jsonl'), 'utf8'));
  const ghost = find(JSON.parse(seen[3]), 'ghost')[0];
  assert.equal(ghost.check.ok, false, 'the failed start is recorded as a failed check');
  assert.equal(ghost.check.error, 'The server did not start.', 'one fixed sentence, never the library\'s words');
  for (const text of seen) { assert.ok(!text.includes(KEY), 'a key is shown'); assert.ok(!text.includes(CMD), 'a command is shown'); }
  const html = await (await fetch(`${w.origin}/`)).text();
  assert.ok(!html.includes(KEY) && !html.includes(CMD));
});

test('same name in two paths: the first in the list wins, the later one is marked shadowed, and the check and the start use the first file', async (t) => {
  const d1 = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-a-'));
  const d2 = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-b-'));
  t.after(() => { rmSync(d1, { recursive: true, force: true }); rmSync(d2, { recursive: true, force: true }); });
  const out1 = path.join(d1, 'one.txt'); const out2 = path.join(d2, 'two.txt');
  const w = await world(t, { '.mcp.json': { mcpServers: { dup: markServer(out1) } }, '.cursor/mcp.json': { mcpServers: { dup: markServer(out2), other: markServer(out2) } } });
  const r = await w.get();
  assert.deepEqual(find(r.body, 'dup').map((s) => [s.place, s.shadowedBy]), [['~/.mcp.json', null], ['~/.cursor/mcp.json', '~/.mcp.json']]);
  assert.equal(find(r.body, 'other')[0].shadowedBy, null);
  assert.equal(mcpConfigFor('dup', { mcpHome: w.home }).file, path.join(w.home, '.mcp.json'));
  const c = await w.post('/api/settings/mcp-check', { server: 'dup' });
  assert.equal(c.body.ok, true);
  assert.equal(existsSync(out1), true, 'the first (winning) server was not the one started');
  assert.equal(existsSync(out2), false, 'the shadowed server was started');
});

/** a file under the PROCESS home (the scratch HOME of npm test), for the run readers that look in `os.homedir()`; removed after. Refuses to touch a real home. */
function inProcessHome(t, rel, json) {
  const home = process.env.HOME;
  assert.ok(home && home.startsWith(tmpdir()), `this needs the scratch HOME npm test sets (HOME=${home})`);
  const f = path.join(home, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(json));
  t.after(() => rmSync(f, { force: true }));
  return f;
}

test('a remote server (no start command) is listed, marked remote, refused a check, and refused by a run reader; nothing starts', async (t) => {
  const w = await world(t, { '.mcp.json': { mcpServers: { beeper: { type: 'http', url: 'https://example.invalid/mcp' } } } });
  const r = await w.get();
  assert.equal(find(r.body, 'beeper')[0].remote, true);
  assert.equal(find(r.body, 'beeper')[0].check, null);
  const c = await w.post('/api/settings/mcp-check', { server: 'beeper' });
  assert.equal(c.body.refused, 'remote-mcp');
  assert.equal(c.body.say, 'A remote server is not supported yet. Nothing was started.');
  assert.equal(existsSync(path.join(w.cfg, 'mcp-checks.jsonl')), false, 'a refused press wrote a check line');
  // the run reader looks in the process home (the scratch HOME): the same remote server there is refused at $0
  inProcessHome(t, '.mcp.json', { mcpServers: { beeper: { type: 'http', url: 'https://example.invalid/mcp' } } });
  const read = await readTicketMcp({ listUrl: 'https://github.com/o/r/issues', number: 1, mcp: { server: 'beeper', tools: ['issue_read'] }, home: w.cfg });
  assert.deepEqual([read.ok, read.error], [false, 'beeper is a remote server, not supported yet']);
});

test('an added path round-trips through config.json: it is listed (added), its servers count, remove takes it away, other settings and the MCP files stay as they were', async (t) => {
  const w = await world(t, { '.mcp.json': { mcpServers: { github: fakeServer() } }, '.claude.json': { mcpServers: { barebrowse: fakeServer() } } });
  writeFileSync(path.join(w.cfg, 'config.json'), JSON.stringify({ monthlyLimitUsd: 7 }));
  const files = [path.join(w.home, '.mcp.json'), path.join(w.home, '.claude.json')];
  const filesBefore = files.map((f) => readFileSync(f, 'utf8'));
  assert.equal(find((await w.get()).body, 'barebrowse').length, 0, 'listed before it was added');
  // typed with a leading ~: stored absolute (config.json holds absolute paths only)
  const add = await w.post('/api/settings/mcp-path', { path: '~/.claude.json' });
  assert.equal(add.body.ok, true);
  const claudeJson = path.join(w.home, '.claude.json');
  assert.deepEqual(JSON.parse(readFileSync(path.join(w.cfg, 'config.json'), 'utf8')), { monthlyLimitUsd: 7, mcpPaths: [claudeJson] });
  const after1 = (await w.get()).body.places.find((p) => p.added);
  assert.deepEqual([after1.added, after1.status, after1.servers.map((s) => s.name)], [true, 'found', ['barebrowse']]);
  // the same path again (either spelling), a default place, a relative path, a line break and an empty one are refused with nothing saved
  for (const [p, refused] of [['~/.claude.json', 'path-listed'], [claudeJson, 'path-listed'], ['~/.mcp.json', 'path-listed'], ['claude.json', 'bad-path'], ['/a\n/b', 'bad-path'], ['', 'bad-path']]) {
    assert.equal((await w.post('/api/settings/mcp-path', { path: p })).body.refused, refused, JSON.stringify(p));
  }
  assert.deepEqual(JSON.parse(readFileSync(path.join(w.cfg, 'config.json'), 'utf8')).mcpPaths, [claudeJson]);
  assert.equal((await w.post('/api/settings/mcp-path-remove', { path: '~/.mcp.json' })).body.refused, 'path-unknown', 'a default place cannot be removed');
  assert.equal((await w.post('/api/settings/mcp-path-remove', { path: after1.path })).body.ok, true, 'the page sends the path as listed');
  assert.deepEqual(JSON.parse(readFileSync(path.join(w.cfg, 'config.json'), 'utf8')), { monthlyLimitUsd: 7 });
  assert.deepEqual(files.map((f) => readFileSync(f, 'utf8')), filesBefore, 'an MCP config file was written');
});

test('a run reader takes the winning file: a server found only in a later place, or only in an added path, is read from there', async (t) => {
  const w = await world(t);
  inProcessHome(t, '.cursor/mcp.json', { mcpServers: { github: fakeServer() } });
  const extra = inProcessHome(t, 'extra/servers.json', { mcpServers: { only_added: fakeServer() } });
  assert.equal((await w.post('/api/settings/mcp-path', { path: extra })).body.ok, true);
  const opts = { home: w.cfg };
  assert.equal(mcpConfigFor('github', opts).file, path.join(process.env.HOME, '.cursor', 'mcp.json'));
  assert.equal(mcpConfigFor('only_added', opts).file, extra);
  for (const server of ['github', 'only_added']) {
    const r = await readTicketMcp({ listUrl: 'https://github.com/o/r/issues', number: 1, mcp: { server, tools: ['issue_read'] }, home: w.cfg });
    assert.equal(r.ok, true, `${server}: ${r.error}`);
  }
});

test('the check log is append-only: two presses are two lines, the first line is never rewritten, a tool row is a name and a hint, and the page reads the newest', async (t) => {
  const w = await world(t, { '.mcp.json': { mcpServers: { github: fakeServer({ GITHUB_TOKEN: KEY }) } } });
  const file = path.join(w.cfg, 'mcp-checks.jsonl');
  await w.post('/api/settings/mcp-check', { server: 'github' });
  const one = readFileSync(file, 'utf8');
  assert.equal(one.split('\n').filter(Boolean).length, 1);
  const first = JSON.parse(one);
  assert.deepEqual(Object.keys(first).sort(), ['at', 'ok', 'path', 'server', 'tools']);
  assert.deepEqual(first.tools.map((x) => x.name), ['issue_read', 'list_issues', 'pull_request_read']);
  assert.deepEqual(first.tools.map((x) => Object.keys(x).sort()), [['hint', 'name'], ['hint', 'name'], ['hint', 'name']]);
  assert.deepEqual(first.tools.map((x) => x.hint), ['read-only', 'read-only', 'read-only']);
  assert.equal(one.includes(KEY), false, 'an env value is in the log');
  assert.equal(one.includes(process.execPath), false, 'a command is in the log');
  await w.post('/api/settings/mcp-check', { server: 'github' });
  const two = readFileSync(file, 'utf8');
  assert.equal(two.split('\n').filter(Boolean).length, 2);
  assert.ok(two.startsWith(one), 'the first line was rewritten');
  // a newer line (a later failed press, written by hand into the log) is the one the page shows; a torn last line is skipped
  writeFileSync(file, `${two}${JSON.stringify({ server: 'github', path: '~/.mcp.json', at: '2099-01-01T00:00:00.000Z', ok: false, error: 'The check failed.' })}\n{"server":"github","pa`);
  assert.deepEqual(find((await w.get()).body, 'github')[0].check, { at: '2099-01-01T00:00:00.000Z', ok: false, error: 'The check failed.' });
});

/** a run row whose spine sits in the layout `sourceNearSpine` knows: <out>/source-<seed>/<job>-bareloop/u-<id>.jsonl, source.json at <out>/source-<seed>/ */
function fakeRun(base, id, { manifest, spine = [], audit, worktreeAudit } = {}) {
  const into = path.join(base, id, 'source-abc');
  mkdirSync(path.join(into, `job-bareloop`), { recursive: true });
  mkdirSync(path.join(into, 'tree'), { recursive: true });
  if (manifest) writeFileSync(path.join(into, 'source.json'), JSON.stringify(manifest));
  const sp = path.join(into, 'job-bareloop', `u-${id}.jsonl`);
  writeFileSync(sp, spine.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
  if (audit) writeFileSync(path.join(into, 'tree', 'gate-audit.jsonl'), audit);
  if (worktreeAudit) { mkdirSync(worktreeAudit.dir, { recursive: true }); writeFileSync(path.join(worktreeAudit.dir, 'gate-audit.jsonl'), worktreeAudit.text); }
  return { runid: id, spine: sp, into };
}
const gate = (type, decision, ts) => `${JSON.stringify({ ts, seq: 1, run_id: 'g', phase: 'gate', action: { type, args: {} }, decision })}\n`;

test('use counts come from what runs record: ticket reads in source.json and a repo job\'s first job-start, gate-audit rows for step calls; a denied call is counted apart, a torn row skipped', async (t) => {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-use-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const r1 = fakeRun(base, 'r1', { manifest: { mcp: { server: 'github', calls: [{ tool: 'issue_read' }, { tool: 'issue_read' }] } } });
  utimesSync(path.join(r1.into, 'source.json'), new Date('2026-10-29T08:00:00Z'), new Date('2026-10-29T08:00:00Z'));
  const wtDir = path.join(base, 'wt');
  const r2 = fakeRun(base, 'r2', {
    manifest: { worktree: wtDir },
    audit: gate('github_list_issues', 'allow', '2026-10-30T10:00:00.000Z') + gate('github_create_issue', 'deny', '2026-10-30T10:01:00.000Z') + gate('git_status', 'allow', '2026-10-30T10:02:00.000Z')
      + gate('read', 'allow', '2026-10-30T10:03:00.000Z') + gate('gh_x_deep_tool', 'allow', '2026-10-30T10:04:00.000Z') + gate('gh_other', 'allow', '2026-10-30T10:05:00.000Z') + '{"phase":"gate","action":{"type":"github_is',
  });
  // a repo job: the ticket read rides on the FIRST job-start; the resumed leg's job-start repeats it and must not be counted twice
  const jobStart = (ts) => ({ type: 'job-start', ts, ticket: { number: 7, mcp: { server: 'github', calls: [{ tool: 'issue_read' }] } } });
  const r3 = fakeRun(base, 'r3', { manifest: { worktree: path.join(base, 'wt3') }, spine: [jobStart('2026-10-31T09:00:00.000Z'), jobStart('2026-10-31T09:30:00.000Z')],
    worktreeAudit: { dir: path.join(base, 'wt3'), text: gate('github_issue_read', 'allow', '2026-10-31T09:10:00.000Z') } });
  const u = countMcpUse([r1, r2, r3, r1, { runid: 'bundle', spine: path.join(base, 'nowhere', 'spine.jsonl') }], ['github', 'git', 'gh', 'gh_x']);
  const g = u.get('github');
  assert.equal(g.calls, 5, '2 (r1 source.json) + 1 (r2 gate audit) + 1 (r3 first job-start only) + 1 (r3 worktree audit); r1 listed twice is one run');
  assert.deepEqual([g.runs, g.denied], [3, 1]);
  assert.deepEqual(Object.fromEntries(g.tools), { issue_read: 4, list_issues: 1 });
  assert.equal(g.last, '2026-10-31T09:10:00.000Z');
  const gi = u.get('git');
  assert.deepEqual([gi.calls, gi.runs, gi.denied, Object.fromEntries(gi.tools)], [1, 1, 0, { status: 1 }], 'github_ rows were counted for the shorter name "git"');
  // a step tool row belongs to the LONGEST server name that prefixes it with "_": gh_x_deep_tool is gh_x's "deep_tool", not gh's "x_deep_tool"
  assert.deepEqual([...u.get('gh_x').tools], [['deep_tool', 1]]);
  assert.deepEqual([...u.get('gh').tools], [['other', 1]]);
});

test('a tool named like an Object.prototype member is counted as its own name, and the route and a never-used tool read 0 (Object.hasOwn, not "in")', async (t) => {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r3-proto-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const r = fakeRun(base, 'p1', { manifest: { mcp: { server: 'github', calls: [{ tool: 'constructor' }, { tool: '__proto__' }, { tool: 'toString' }] } }, audit: gate('github_hasOwnProperty', 'allow', '2026-11-01T00:00:00.000Z') });
  const g = countMcpUse([r], ['github']).get('github');
  assert.deepEqual([...g.tools].sort(), [['__proto__', 1], ['constructor', 1], ['hasOwnProperty', 1], ['toString', 1]]);
  assert.equal(g.calls, 4);
});

test('GET mcp carries the use counts of the runs in the run list (route level), a shadowed or remote server carries none', async (t) => {
  const w = await world(t, { '.mcp.json': { mcpServers: { github: fakeServer(), beeper: { type: 'http', url: 'https://example.invalid/mcp' } } }, '.cursor/mcp.json': { mcpServers: { github: fakeServer() } } });
  const run = fakeRun(w.base, 'u1', { manifest: { mcp: { server: 'github', calls: [{ tool: 'constructor' }, { tool: 'issue_read' }] } } });
  writeFileSync(path.join(w.cfg, 'runs.jsonl'), `${JSON.stringify({ at: '2026-11-02T00:00:00.000Z', runid: 'u1', job: 'j', spine: run.spine, patient: null, via: 'run-u' })}\n`);
  const rows = find((await w.get()).body, 'github');
  assert.deepEqual([rows[0].use.calls, rows[0].use.runs], [2, 1]);
  assert.equal(Object.hasOwn(rows[0].use.tools, 'constructor'), true);
  assert.equal(rows[1].use, null, 'the shadowed one carries no counts');
  assert.equal(find((await w.get()).body, 'beeper')[0].use, null);
});

test('mcpSources reads only explicit places: a fixture home with nothing in it lists the four places as missing, and listing writes nothing', async (t) => {
  const w = await world(t);
  const src = mcpSources({ home: w.cfg, mcpHome: w.home });
  assert.deepEqual(src.places.map((p) => [p.path, p.status]), [['~/.mcp.json', 'missing'], ['~/.claude/mcp_servers.json', 'missing'], ['~/.config/Claude/claude_desktop_config.json', 'missing'], ['~/.cursor/mcp.json', 'missing']]);
  await w.get();
  assert.deepEqual(readdirSync(w.cfg).filter((n) => n !== 'runs.jsonl'), [], 'listing wrote into the config home');
});

// Part-2 fix 5 (test HOME isolation): discovery in a test reads the injected fixture home, never the real one.
test('in-process MCP discovery reads the INJECTED home: a server planted in the process HOME is not listed, not checkable, never started; the default places sit under HOME', async (t) => {
  assert.ok(process.env.HOME && process.env.HOME !== '/home/hamr', 'this suite runs with a scratch HOME (npm test / scripts/hermetic.mjs)');
  // the default (un-injected) places are exactly the four under THIS process's HOME, so a test that forgot to inject would read here
  assert.equal(homedir(), process.env.HOME);
  assert.ok(DEFAULT_MCP_PLACES().every((p) => p.startsWith(`${process.env.HOME}/`)));
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'bareloop-r3-iso-')), 'planted.txt');
  t.after(() => rmSync(path.dirname(out), { recursive: true, force: true }));
  const planted = path.join(process.env.HOME, '.mcp.json');
  writeFileSync(planted, JSON.stringify({ mcpServers: { planted: markServer(out) } }));
  t.after(() => rmSync(planted, { force: true }));
  const w = await world(t, { '.mcp.json': { mcpServers: { fixture: fakeServer() } } });
  const src = mcpSources({ home: w.cfg, mcpHome: w.home });
  assert.ok(src.places.every((p) => p.file.startsWith(`${w.home}/`) && !p.file.startsWith(`${process.env.HOME}/`)), 'a discovery path is not under the fixture home');
  const r = await w.get();
  assert.equal(find(r.body, 'planted').length, 0, 'the planted server in HOME was listed');
  assert.equal(find(r.body, 'fixture').length, 1);
  assert.equal((await w.post('/api/settings/mcp-check', { server: 'planted' })).body.refused, 'unknown-mcp');
  assert.equal(existsSync(out), false, 'the planted server was started');
  // control: with no injection the same planted file IS what is read (so the injection, not an empty HOME, is what hid it)
  assert.equal(mcpConfigFor('planted', {})?.file, planted);
});

const getPage = async (w) => (await fetch(`${w.origin}/`)).text();
const rule = (html, sel) => new RegExp(`\\n  ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`).exec(html)?.[1];

test('the page: the MCP tab sits between Providers and Money, on the Providers classes, with every control and sentence of fwd\'s tab (bareloop wording), and the CSS that keeps it from scrolling sideways', async (t) => {
  const w = await world(t);
  const html = await getPage(w);
  assert.match(html, /<button role="tab" id="tab-providers"[^>]*>Providers<\/button>\s*<button role="tab" id="tab-mcp" aria-controls="panel-mcp" aria-selected="false" data-testid="settings-tab-mcp">MCP<\/button>\s*<button role="tab" id="tab-money"/);
  for (const id of ['panel-mcp', 'mcp-paths', 'mcp-add-open', 'mcp-add-box', 'mcp-problem']) assert.ok(html.includes(`id="${id}"`), id);
  for (const tid of ['mcp-table-wrap', 'mcp-paths', 'mcp-add-open', 'mcp-problem', 'mcp-row', 'mcp-path', 'mcp-check', 'mcp-remove', 'mcp-tool', 'mcp-add-in', 'mcp-add-go', 'mcp-add-msg']) assert.ok(html.includes(`data-testid="${tid}"`), tid);
  assert.ok(html.includes('>Path and MCP</div>') && html.includes('+ add a path</button>'));
  for (const s of ["Read only. bareloop never edits these files and never shows keys. A project folder's .mcp.json is never read.", 'check tools starts the server once, only when pressed.', '&mdash; = no hint; shown, not blocked. Hints are info only.',
    'same name as above, not used', 'remote server, not supported yet', 'never checked', 'Press check tools to list its tools.', "can't be read", 'not found', 'type a path to an MCP config file', 'never used', 'denied</span>']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('class="pv-head mc-k"') && html.includes('<span>PATH / MCP</span><span>TOOLS</span><span>CHECKED</span>') && html.includes('<span>TOOL</span><span>HINT</span><span class="n">USED</span>'));
  assert.match(rule(html, '.pv-head.mc-k,.pv-krow.mc-k') ?? '', /--pv-cols:minmax\(0,1\.6fr\) minmax\(0,1\.5fr\) minmax\(0,\.8fr\) 150px/);
  assert.match(rule(html, '.table-wrap'), /overflow-x:auto/);
  assert.match(html, /\.pv-mrow\.mc-t,\.pv-mhead\.mc-t\{--pv-cols:minmax\(0,2fr\) minmax\(0,1fr\) minmax\(0,\.6fr\);\}/, 'three tool columns under 1280px');
  assert.match(html, /wireTabs\(\[document\.getElementById\("tab-providers"\), document\.getElementById\("tab-mcp"\), document\.getElementById\("tab-money"\)\]\)/);
  // press-only: the page's only call that starts a server is the click handler's POST; opening Settings or the tab only GETs
  assert.equal((html.match(/mcp-check/g) ?? []).filter(Boolean).length >= 1, true);
  assert.ok(!/authorGet\("\/api\/settings\/mcp-check/.test(html));
  assert.ok(html.includes('Object.prototype.hasOwnProperty.call(s.use.tools, t.name)'), 'a tool count is read with an own-property test');
  assert.ok(!html.includes('/.env') || html.includes('~/.config/bareloop/.env'), 'the MCP tab does not name the keys file');
});
