// fwd v0.38.0 swap (M19 am14b, F400), S1: a refused draft is a typed `{box, words}`. The box is a literal at the refusing call site.
//  (a) POST /api/author/start answers `{ok:false, error, box}` (a table: every mapped refusal, and null for the null list);
//  (b) a session refusal that runs before any AI call records `state.refusal = {box, words}` beside `state.error`, and the drafting step still shows its ✗.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPanelServer } from '../src/panel/server.js';
import { createSession, validateJobCard } from '../src/panel/authorsession.js';
import { ANTH_CFG } from './helpers.js';
import { keyRows } from '../src/providerrows.js';

/** @type {string[]} */
const tmpDirs = [];
test.after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (/** @type {string} */ prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); tmpDirs.push(d); return d; };
const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'rb', GIT_AUTHOR_EMAIL: 'rb@test', GIT_COMMITTER_NAME: 'rb', GIT_COMMITTER_EMAIL: 'rb@test' },
});
function makeRepo() {
  const dir = tmp('refusal-box-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
function keysHome(text = 'ANTHROPIC_API_KEY=fake-not-a-real-key\n') {
  const d = tmp('refusal-box-home-');
  writeFileSync(join(d, '.env'), text, { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}
const card = (/** @type {string} */ repo, /** @type {any} */ over = {}) => ({
  checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'refusal-box-job', jobText: 'fix things\ntsc clean\n~ keep it small',
  inputs: `repo: ${repo}`, destination: 'src/', capUsd: 2, ...over,
});

async function server(/** @type {import('node:test').TestContext} */ t, /** @type {any} */ o = {}) {
  const { port, token, close } = await createPanelServer({ port: 0, sessionsRoot: tmp('refusal-box-sess-'), env: o.env ?? {}, home: o.home ?? keysHome() });
  t.after(() => close());
  return { base: `http://127.0.0.1:${port}`, token };
}
const post = async (/** @type {any} */ s, /** @type {any} */ body) => {
  const r = await fetch(`${s.base}/api/author/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': s.token }, body: JSON.stringify(body) });
  return { status: r.status, body: /** @type {any} */ (await r.json()) };
};

test('POST /api/author/start: every mapped refusal names its box; the null list names none', async (t) => {
  const repo = makeRepo();
  const s = await server(t);
  /** @type {[string, any, string|null][]} */
  const table = [
    ['job name not a slug', card(repo, { jobName: 'Not A Slug' }), 'name'],
    ['model no row names', card(repo, { model: 'no-such-model' }), 'model'],
    ['job text empty', card(repo, { jobText: '' }), 'job'],
    ['rubric on a repo', card(repo, { checkType: 'rubric' }), 'job'],
    ['inputs empty', card(repo, { inputs: '' }), 'inputs'],
    ['inputs line 1 not in a repo', card(repo, { inputs: 'repo: /no/such/dir-refusal-box' }), 'inputs'],
    ['destination empty', card(repo, { destination: '' }), 'dest'],
    ['destination absolute on a repo', card(repo, { destination: '/etc' }), 'dest'],
    ['cap missing', card(repo, { capUsd: undefined }), 'capUsd'],
    ['check type', card(repo, { checkType: 'bogus' }), null],
    ['thinking value', card(repo, { thinking: 'yes' }), null],
    ['flow type', card(repo, { flowType: 'bogus' }), null],
    ['MCP not picked', card(repo, { flowType: 'mcp' }), null],
    ['no such run to reuse', card(repo, { startFrom: 'no-such-run-id' }), null],
  ];
  for (const [what, c, box] of table) {
    // eslint-disable-next-line no-await-in-loop
    const r = await post(s, c);
    assert.equal(r.body.ok, false, `${what}: refused`);
    assert.equal(typeof r.body.error, 'string', `${what}: error stays for old callers`);
    assert.ok('box' in r.body, `${what}: carries a box key`);
    assert.equal(r.body.box, box, `${what}: box`);
  }
});

test('validateJobCard: a taken job name pins the name box', () => {
  const jobsDir = tmp('refusal-box-jobs-');
  writeFileSync(join(jobsDir, 'taken-name.json'), '{}');
  const r = /** @type {any} */ (validateJobCard(card('/x', { jobName: 'taken-name' }), { jobsDir, rows: keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG }) }));
  assert.equal(r.ok, false);
  assert.equal(r.box, 'name');
});

/** drive a session until it settles */
async function settled(/** @type {any} */ s, ms = 4000) {
  const t0 = Date.now();
  while (!['refused', 'error'].includes(s.state.phase) && Date.now() - t0 < ms) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 10); });
  }
  return s.state;
}
function sess(/** @type {any} */ c, /** @type {any} */ o = {}) {
  return createSession(c, { env: o.env ?? { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: o.home ?? keysHome(), sessionsRoot: tmp('refusal-box-sess2-') });
}

test('session: each refusal that runs before any AI call records state.refusal with its box, and the drafting list still shows the failed step', async () => {
  const repo = makeRepo();
  /** @type {[string, any, any, string, RegExp|null][]} */
  const cases = [
    ['key not set', card(repo), { env: {} }, 'model', /ANTHROPIC_API_KEY not set/],
    ['key looks wrong', card(repo), { env: { ANTHROPIC_API_KEY: 'sk-a\tb' } }, 'model', /contains a tab/],
    ['no model picked', card(repo, { model: 'no-such-model' }), {}, 'model', null],
    ['destination', card(repo, { destination: '/etc' }), {}, 'dest', /inside the repo/],
    ['no ~ rule', card(repo, { jobText: 'fix things\ntsc clean' }), {}, 'job', /Add at least one rule/],
    ['range token the repo cannot use', card(repo, { jobText: 'review it\n~ be short\nrange: nope1..nope2' }), {}, 'job', null],
    ['source not found', card(repo, { inputs: 'repo: /no/such/dir-refusal-box' }), {}, 'inputs', null],
  ];
  for (const [what, c, o, box, words] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const st = await settled(sess(c, o));
    assert.equal(st.phase, 'refused', `${what}: refused`);
    assert.deepEqual(st.refusal, { box, words: st.error }, `${what}: refusal record`);
    if (words) assert.match(st.error, words, what);
    assert.ok(st.steps.some((x) => x.status === 'failed' || x.status === 'error' || x.status === 'fail'), `${what}: the drafting list keeps its failed step (${JSON.stringify(st.steps.map((x) => x.status))})`);
  }
});

test('session: a refusal outside the boxed list (an old job in a Reuse) records box null', async () => {
  const repo = makeRepo();
  const spec = { verdictType: 'green', jobLines: [{ rules: ['PASS: it works'] }] };
  const st = await settled(createSession(card(repo), { env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('refusal-box-sess3-'), reuse: { spec, workflowKey: 'k' } }));
  assert.equal(st.phase, 'refused');
  assert.deepEqual(st.refusal, { box: null, words: st.error });
});
