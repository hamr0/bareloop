// A page refresh must not lose a live authoring session (hamr, live 2026-10-05): GET /api/author/live names the one
// live session and the Chat tab re-attaches to it on load. Server half over a real socket; page half by source, in the
// same posture as panel-chat-clear-page.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPanelServer } from '../src/panel/server.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';

const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
function makeRepo() {
  const dir = tmp('reattach-repo-');
  const git = (a) => execFileSync('git', a, { cwd: dir, env: gitEnv });
  git(['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// x\n');
  git(['add', '-A']); git(['commit', '-q', '-m', 'seed']);
  return dir;
}
function keysHome() {
  const d = tmp('reattach-home-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  return d;
}
async function start(t) {
  const { port, token, close } = await createPanelServer({
    port: 0, sessionsRoot: tmp('reattach-sessions-'), env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(),
  });
  t.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', 'x-bareloop-token': token };
  return { base, token, H };
}
const card = (source) => ({
  checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'reattach-job', goal: 'fix things', source,
  destination: 'src/', success: 'tsc clean', guardrails: 'no new deps', judgeExamples: '', capUsd: 2,
});

test('GET /api/author/live: null with no session, the live id (with its card) while one runs, null again after Abandon', async (t) => {
  const { base, H } = await start(t);
  const none = await (await fetch(`${base}/api/author/live`, { headers: H })).json();
  assert.equal(none.ok, true);
  assert.equal(none.sessionId, null);
  assert.equal(none.state, null);

  const started = await (await fetch(`${base}/api/author/start`, { method: 'POST', headers: H, body: JSON.stringify(card(makeRepo())) })).json();
  assert.equal(started.ok, true);
  const live = await (await fetch(`${base}/api/author/live`, { headers: H })).json();
  assert.equal(live.sessionId, started.sessionId, 'the one live session is named');
  assert.equal(live.state.id, started.sessionId);
  assert.equal(live.state.card.jobName, 'reattach-job', 'the page refills the card from the session, not from page storage');
  assert.equal(live.state.card.capUsd, 2);
  assert.equal(live.state.reuse, false);

  const ab = await (await fetch(`${base}/api/author/${started.sessionId}/abandon`, { method: 'POST', headers: H, body: '{}' })).json();
  assert.equal(ab.ok, true);
  const after = await (await fetch(`${base}/api/author/live`, { headers: H })).json();
  assert.equal(after.sessionId, null, 'an abandoned session is terminal: never re-attached');
});

test('GET /api/author/live: guarded like every author route (no token 403, wrong Origin 403) and GET only (405)', async (t) => {
  const { base, token } = await start(t);
  assert.equal((await fetch(`${base}/api/author/live`)).status, 403);
  assert.equal((await fetch(`${base}/api/author/live`, { headers: { 'x-bareloop-token': token, origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/author/live`, { method: 'POST', headers: { 'x-bareloop-token': token, 'content-type': 'application/json' }, body: '{}' })).status, 405);
});

test('GET /api/author/live: a signed (or any terminal) session is never offered; a live reuse session is', () => {
  const routes = createAuthorRoutes({ port: 1, token: 'tok' });
  const mk = (id, phase, reuse = false) => ({ id, state: { id, phase, reuse, card: { jobName: id } } });
  const call = () => {
    let out = null;
    const req = { method: 'GET', headers: { 'x-bareloop-token': 'tok', host: '127.0.0.1:1' } };
    const res = { writeHead() {}, end(txt) { out = JSON.parse(txt); } };
    assert.equal(routes.handle(req, res, '/api/author/live', null), true);
    return out;
  };
  for (const p of ['signed', 'refused', 'error', 'signing-failed', 'abandoned']) {
    routes.sessions.clear();
    routes.sessions.set('a', mk('a', p));
    assert.equal(call().sessionId, null, `${p} is terminal`);
  }
  routes.sessions.clear();
  routes.sessions.set('a', mk('a', 'signed'));
  routes.sessions.set('b', mk('b', 'prepared', true));
  const r = call();
  assert.equal(r.sessionId, 'b');
  assert.equal(r.state.reuse, true, 'reuse sessions count too');
});

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}

test('page: on load and on opening the Chat tab (no session attached) it asks /api/author/live and attaches; no localStorage', () => {
  const r = fnSrc('reattachLive');
  assert.match(r, /if\(sessionId \|\| sessionLive\) return;/, 'never when this tab already holds a session');
  assert.match(r, /authorGet\("\/api\/author\/live"\)/);
  assert.match(r, /attachSession\(j\)/);
  assert.match(PAGE, /getElementById\("tab-chat"\)\.addEventListener\("click", reattachLive\);\s*reattachLive\(\);/, 'wired on tab open AND once at load');
  assert.doesNotMatch(fnSrc('attachSession') + r, /localStorage|sessionStorage/);
});

test('page: attachSession takes the session over as if this tab had started it (id, card, lock, poll, thread, progress, Abandon)', () => {
  const a = fnSrc('attachSession');
  assert.match(a, /sessionId = j\.sessionId;\s*sessionLive = true;/, 'live session id: Start stays disabled, button reads Abandon');
  for (const id of ['jf-name', 'jf-goal', 'jf-source', 'jf-dest', 'jf-success', 'jf-guardrails', 'jf-judge', 'jf-cap-money', 'jf-cap-time']) {
    assert.match(a, new RegExp(`"${id}"`), `${id} refilled from the session's card`);
  }
  assert.match(a, /renderMessages\(st\);\s*renderActions\(st\);/);
  assert.match(a, /setInterval\(poll, 2000\)/);
  assert.match(a, /reuseSession = st\.reuse === true;/);
  assert.match(a, /if\(reuseSession\) setReuseLocked\(true\)/);
});

test('page: attachSession runs against a fake DOM and wires the live session (fail-first proof of the behaviour)', () => {
  const els = {};
  const el = (id) => (els[id] ??= { id, value: '', textContent: '', hidden: false, disabled: false, classList: { toggle() {} } });
  const radios = [{ value: 'deterministic', checked: true }, { value: 'rubric', checked: false }];
  const calls = [];
  const modelSelect = { options: [], value: '', insertAdjacentHTML() { this.options.push({ value: 'claude-sonnet-5' }); } };
  const src = `${fnSrc('attachSession')}\nreturn attachSession;`;
  // sessionId/sessionLive are page-level vars; run the body with them as closure vars via a wrapper
  const body = src.replace('return attachSession;', 'return {attachSession, get: () => ({sessionId, sessionLive, reuseSession, signClickedOnce})};');
  const g = new Function('document', 'modelSelect', 'openNewCard', 'setVal', 'renderMessages', 'renderActions', 'setReuseLocked', 'poll', 'escapeXml', 'setInterval', 'clearInterval', 'fitCardBoxes', 'renderPicker',
    `var sessionId = null, sessionLive = false, reuseSession = false, autoSigned = false, signClickedOnce = false, pollTimer = null, reuseCheckType = "deterministic", reusePickedName = "";\n${fnSrc('setVerdict')}\n${body}`);
  const doc = { getElementById: el, querySelectorAll: () => ({ forEach: (fn) => radios.forEach(fn) }) };
  const out = g(doc, modelSelect, () => calls.push('openNewCard'), (id, v) => { el(id).value = v; }, () => calls.push('messages'), () => calls.push('actions'),
    (on) => calls.push(`lock:${on}`), () => calls.push('poll'), (x) => x, (fn, ms) => { calls.push(`interval:${ms}`); return 7; }, () => {}, () => calls.push('fit'), () => calls.push('picker'));
  out.attachSession({ sessionId: 's1', state: { reuse: false, card: { checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'j', goal: 'g', capUsd: 3, maxWallMs: 120000 } } });
  assert.deepEqual(out.get(), { sessionId: 's1', sessionLive: true, reuseSession: false, signClickedOnce: false });
  assert.equal(el('jf-goal').value, 'g');
  assert.equal(el('jf-cap-money').value, 3);
  assert.equal(el('jf-cap-time').value, 2);
  assert.equal(radios.find((r) => r.checked).value, 'rubric');
  assert.deepEqual(calls.filter((c) => c !== 'lock:false'), ['openNewCard', 'picker', 'fit', 'messages', 'actions', 'interval:2000', 'poll']);
});
