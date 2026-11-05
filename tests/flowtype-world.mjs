// ITEM33-BUILD piece 8 (R4): the scratch world the flowtype-*.test.js files share. A fixture person's home (the MCP config places), a fixture config home (mcp-checks.jsonl,
// config.json), and the REAL panel server on a port the OS picks. FAKE: the MCP server (tests/fixtures/ticket-write-mcp.mjs: four tools, two of them WRITE tools).
// HOME itself is a scratch dir too (npm test is hermetic); the real ~/.mcp.json and ~/.config/bareloop are never touched.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanelServer } from '../src/panel/server.js';

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
/** the fake GitHub server's four tools, two of them write tools */
export const FAKE_TOOLS = ['issue_read', 'list_issues', 'add_issue_comment', 'issue_write'];

/** a config entry for the fake server (the files it needs sit in `dir`) */
export function fakeServer(dir) {
  const ticket = path.join(dir, 'ticket.json');
  writeFileSync(ticket, JSON.stringify({ number: 7, title: 'Add a retry', state: 'open', body: 'please', labels: [{ name: 'bug' }] }));
  return { command: process.execPath, args: [path.join(FIX, 'ticket-write-mcp.mjs')], env: { TICKET_FILE: ticket, CALLS_FILE: path.join(dir, 'calls.jsonl') } };
}

/**
 * @param {import('node:test').TestContext} t
 * @param {{ files?: Record<string, any>, serve?: boolean, panel?: Record<string, any> }} [o] `files` = {path under the person's home: json}; `serve:false` skips the panel server; `panel` = extra createPanelServer options
 */
export async function world(t, o = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'bareloop-r4-'));
  const home = path.join(base, 'person');
  const cfg = path.join(base, 'cfg');
  const proj = path.join(base, 'proj');
  for (const d of [home, cfg, proj]) mkdirSync(d, { recursive: true });
  const files = o.files ?? { '.mcp.json': { mcpServers: { github: fakeServer(base) } } };
  for (const [rel, json] of Object.entries(files)) { mkdirSync(path.dirname(path.join(home, rel)), { recursive: true }); writeFileSync(path.join(home, rel), JSON.stringify(json)); }
  const w = { base, home, cfg, proj, close: async () => {} };
  if (o.serve !== false) {
    const cwd = process.cwd();
    process.chdir(proj);
    const srv = await createPanelServer({ port: 0, home: cfg, mcpHome: home, env: {}, sessionsRoot: path.join(base, 'sessions'), ...(o.panel ?? {}) });
    w.close = async () => { await srv.close(); process.chdir(cwd); };
    w.srv = srv;   // R7: the schedule door and the scheduler the panel built
    const origin = `http://127.0.0.1:${srv.port}`;
    const H = { 'x-bareloop-token': srv.token, 'content-type': 'application/json' };
    Object.assign(w, {
      origin, H, port: srv.port, token: srv.token,
      get: async (p) => { const r = await fetch(`${origin}${p}`, { headers: H }); return { status: r.status, body: await r.json() }; },
      post: async (p, body) => { const r = await fetch(`${origin}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; },
      page: async () => (await fetch(`${origin}/`, { headers: H })).text(),
    });
  }
  t.after(async () => { await w.close(); rmSync(base, { recursive: true, force: true }); });
  return w;
}

// ── the drafting seams, in the shape tests/p5-startfrom.test.js uses: the REAL session, the REAL confirm turn, the model boundary stubbed (no network) ──
import { execFileSync } from 'node:child_process';
import { classGuards } from '../src/authoring.js';
import { ANTH_CFG } from './helpers.js';

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
/** a minimal real repo under `dir` (one committed file) */
export function makeRepo(dir) {
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  writeFileSync(path.join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
/** a config home whose .env carries one filled key and whose config.json ticks a priced model: the Model menu the card picks from */
export function keysHome(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify(ANTH_CFG));
  return dir;
}
function fakeDeclaration() {
  const g = classGuards({ verdictType: 'green', lang: 'js' }).map((x) => ({ name: x.name, kind: x.kind, params: { ...x.params, ...(x.fill.includes('allowPrefixes') ? { allowPrefixes: ['src/'] } : {}) } }));
  return { stages: [g[0], { name: 'verdict', fromLine: [1], kind: 'command-exit', params: { cmd: 'node', args: ['-e', ''], expectExit: 0 } }, g[1]], refused: [{ line: 2, reason: 'fixture' }], notes: [] };
}
/**
 * createSession deps that drive a session to `prepared` with no model: every `prepareSigningFn` call stores the spec it was handed in `seen.spec`.
 * @param {{spec?: any}} seen
 */
export function draftSeams(seen) {
  const plan = { goal: 'fix things v1', checks: [{ text: 'tsc clean', fromLine: [1] }], questions: [], notChecked: [] };
  return {
    scout: { state: 'PRESENT', facts: { sourcePaths: ['src/mod.js'], testPaths: [] }, calls: [], raws: [] },
    generate: async () => { throw new Error('generate must not be called'); },
    confirmGenerate: async (_c, tools) => { if (tools?.[0]?.execute) await tools[0].execute(plan); return { text: JSON.stringify(plan), error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: true, declaration: fakeDeclaration(), genreEnv: null, cost: { costUsd: 0.002, knownUsd: 0.002, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
    prepareSigningFn: async (o) => {
      seen.spec = o.spec;
      return { ok: true, specHash: 'cafef00dbeef0123', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: { declaration: { ok: true, grounded: true }, precheck: { ok: true, stops: [] }, seedVerdict: { ok: true, workRed: ['verdict'], redAtSeed: ['verdict'], greenAtSeed: [] }, calibration: null } };
    },
  };
}
export async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => { setTimeout(r, 10); }); } return false; }
/** the card the tests start from (Inputs line 1 is the repo) */
export const baseCard = ({ source = '/x', ...o } = {}) => ({ checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'flow-job', jobText: 'fix things\n~ no new deps\ntsc clean', inputs: `repo: ${source}`, destination: 'src/', capUsd: 2, ...o });

// ── one listed run laid out the way a panel run is (tests/p5-startfrom.test.js `makeRun`) ──
import { utimesSync } from 'node:fs';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
/**
 * @param {string} home the config home @param {{runid: string, spec: any, card?: any, outcome?: string, out: string}} o
 */
export function makeRun(home, { runid, spec, card = null, outcome = 'green', out }) {
  const into = path.join(out, 'source-seed');
  const dir = path.join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(into, 'source.json'), JSON.stringify({ source: '/the/original/source', destination: 'src/' }));
  writeFileSync(path.join(out, 'resolved-spec.json'), JSON.stringify(spec));
  if (card) writeFileSync(path.join(out, 'card.json'), JSON.stringify(card));
  const sh = jobSpecHash(spec);
  const ts = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const recs = [{ type: 'job-start', job: spec.job, specHash: sh, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: ts(0), seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 1, ts: ts(1), seq: 2 }, { type: 'job-end', outcome, spentUsd: 1, spendComplete: true, ts: ts(5), seq: 3 }];
  const spine = path.join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({ at: '2026-10-01T10:00:00.000Z', runid, job: spec.job, spine, patient: null, via: 'run-u' }, { home });
  return { spine, specHash: sh };
}

import { readFileSync } from 'node:fs';
import { createSession } from '../src/panel/authorsession.js';
/**
 * A REAL signed spec, made by the panel's own drafting path with the model boundary stubbed (the session driven to `prepared`).
 * @param {{base: string}} w @param {string} keys a config home from keysHome() @param {any} card @param {{flowType: string, pick: any}|null} flow
 */
export async function draftSpec(w, keys, card, flow) {
  const seen = {};
  const session = createSession(card, { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keys, sessionsRoot: path.join(w.base, `sess-${Math.random().toString(36).slice(2)}`), ...draftSeams(seen), ...(flow ? { flow } : {}) });
  if (!(await until(() => session.state.pendingAsk?.kind === 'menu'))) throw new Error(`no menu (${session.state.phase} ${session.state.error})`);
  session.signPrepare();
  await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase));
  if (session.state.phase !== 'prepared') throw new Error(`not prepared: ${session.state.phase} ${session.state.error}`);
  return { spec: JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8')), session };
}
