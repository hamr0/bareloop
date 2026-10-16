// ONE DOOR (hamr 2026-10-15, PRD v1.101): Reuse workflow is the single button on every run; it opens the Chat card with EVERY box open;
// the CARD's job boxes (job text, check type, thinking) decide the path, never the drafted spec. Server side over real HTTP on scratch
// homes (a malformed key refuses every session at $0, no model is reached); page side with the page's own functions extracted from
// src/panel/index.html against tiny fakes (no jsdom). The symbols the old code lacks are read off a namespace import so each test can
// FAIL by assertion against the pre-change tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sess from '../src/panel/authorsession.js';
import { endedFor } from '../src/panel/server.js';
import { validateJobCard } from '../src/panel/authorsession.js';
import { keyRows } from '../src/providerrows.js';
import { ANTH_CFG } from './helpers.js';
import { makeRun, panel, specOf, tmp } from './trigger-world.mjs';
import { writeFileSync as wf } from 'node:fs';

const git = (dir, args) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
});
function makeRepo() {
  const dir = tmp('od-repo-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
/** a home whose key is malformed: every session refuses at $0, so no model is ever reached */
function badKeyHome() {
  const d = tmp('od-home-');
  wf(join(d, '.env'), 'ANTHROPIC_API_KEY=bad key\n', { mode: 0o600 });
  wf(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}
/** the card the page would POST after Reuse workflow, with a real repo for Inputs line 1 */
const cardOf = (pre, over = {}) => ({ ...pre.card, inputs: `repo: ${makeRepo()}`, ...over });

// ── server ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('GET start-from names whether the origin earned a green and the next free <base>-N; nothing is locked', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'digest' }), outcome: 'green' });
  makeRun(home, { runid: 'r1', spec: specOf({ job: 'other' }), outcome: 'step-red' });
  const p = await panel({ home });
  const g = (await p.get('/api/author/start-from?runid=g1')).body;
  assert.equal(g.green, true);
  assert.equal(g.nextName, 'digest-2');
  assert.equal(g.card.jobName, 'digest', 'the box opens on the origin name');
  assert.equal('locked' in g || 'open' in g, false);
  const r = (await p.get('/api/author/start-from?runid=r1')).body;
  assert.equal(r.green, false);
  assert.equal(r.nextName, 'other-2');
});

test('nextFreeJobName: x-2 edited suggests x-3 (base = the part before -<digits> when that part is itself a job), else the origin is the base; run list and jobs/ both count', () => {
  const dir = tmp('od-jd-');
  assert.equal(sess.nextFreeJobName('x', [], { jobsDir: dir }), 'x-2');
  assert.equal(sess.nextFreeJobName('x', ['x', 'x-2'], { jobsDir: dir }), 'x-3');
  assert.equal(sess.nextFreeJobName('x-2', ['x', 'x-2'], { jobsDir: dir }), 'x-3', 'never x-2-2');
  assert.equal(sess.nextFreeJobName('x-2', ['x-2'], { jobsDir: dir }), 'x-2-2', 'x is no job, so x-2 is its own base');
  writeFileSync(join(dir, 'x.json'), '{}');
  writeFileSync(join(dir, 'x-3.json'), '{}');
  assert.equal(sess.nextFreeJobName('x-2', ['x-2'], { jobsDir: dir }), 'x-4', 'a jobs/ file makes the base a job and a taken name');
});

test('POST start: a GREEN origin with no job box changed reuses the signed plan under the ORIGIN name, whatever run boxes changed or name was typed', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'digest' }), outcome: 'green' });
  const p = await panel({ home });
  const pre = (await p.get('/api/author/start-from?runid=g1')).body;
  const r = await p.post('/api/author/start', cardOf(pre, { startFrom: 'g1', capUsd: 7, destination: 'lib/', jobName: 'a-typed-name' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reuse, true, 'no drafting');
  assert.equal(r.body.state.card.jobName, 'digest');
});

test('POST start: a changed JOB box (green or red origin) is accepted and DRAFTS a new workflow under the card\'s name', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'digest' }), outcome: 'green' });
  makeRun(home, { runid: 'r1', spec: specOf({ job: 'stuck' }), outcome: 'step-red' });
  const p = await panel({ home });
  for (const [id, name] of [['g1', 'digest-2'], ['r1', 'stuck-2']]) {
    // eslint-disable-next-line no-await-in-loop
    const pre = (await p.get(`/api/author/start-from?runid=${id}`)).body;
    // eslint-disable-next-line no-await-in-loop
    const r = await p.post('/api/author/start', cardOf(pre, { startFrom: id, jobText: `${pre.card.jobText}\n~ a new rule`, jobName: name }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reuse, false, `${id}: drafting`);
    assert.equal(r.body.state.card.jobName, name);
    // eslint-disable-next-line no-await-in-loop
    await p.post(`/api/author/${r.body.sessionId}/abandon`, {});
  }
});

test('POST start: a RED origin with no job box changed DRAFTS (an unproven plan is never reused) and signs under the ORIGIN name', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'r1', spec: specOf({ job: 'stuck' }), outcome: 'cap-halt' });
  const p = await panel({ home });
  const pre = (await p.get('/api/author/start-from?runid=r1')).body;
  const r = await p.post('/api/author/start', cardOf(pre, { startFrom: 'r1', jobName: 'typed-other', capUsd: 3 }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reuse, false);
  assert.equal(r.body.state.card.jobName, 'stuck', 'the origin name is forced');
});

test('POST start: a changed job under a name owned by ANOTHER job (or the origin itself) is refused at $0 in the plain sentence', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'digest' }), outcome: 'green' });
  makeRun(home, { runid: 'b1', spec: specOf({ job: 'other' }), outcome: 'green' });
  const p = await panel({ home });
  const pre = (await p.get('/api/author/start-from?runid=g1')).body;
  for (const name of ['other', 'digest']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await p.post('/api/author/start', cardOf(pre, { startFrom: 'g1', jobText: 'something else entirely', jobName: name }));
    assert.equal(r.status, 400, name);
    assert.equal(r.body.error, `A job named "${name}" already exists and is a different job. Pick another name.`);
  }
  assert.equal((await p.get('/api/author/live')).body.sessionId, null, 'nothing was started');
});

test('jobBoxesChanged: job text, check type and thinking decide; run boxes and the name never do', () => {
  const o = { jobName: 'j', checkType: 'deterministic', jobText: 'a\n~ b', inputs: 'repo: /x', destination: 'src/', capUsd: 1, model: 'm' };
  assert.equal(typeof sess.jobBoxesChanged, 'function');
  assert.equal(sess.jobBoxesChanged(o, o), false);
  assert.equal(sess.jobBoxesChanged({ ...o, inputs: 'repo: /y', destination: 'lib/', capUsd: 9, maxWallMs: 5, model: 'n', jobName: 'k' }, o), false);
  assert.equal(sess.jobBoxesChanged({ ...o, jobText: 'a' }, o), true);
  assert.equal(sess.jobBoxesChanged({ ...o, checkType: 'rubric' }, o), true);
  assert.equal(sess.jobBoxesChanged({ ...o, thinking: true }, o), true);
});

test('the Ended block offers Reuse workflow on EVERY ending, exactly once, and never an `edit` action', () => {
  const alive = { died: false, lastThing: null };
  const sum = (outcome) => ({ outcome, stopReason: null, spentUsd: 1, budgetUsd: 2 });
  const ok = { ok: true };
  const rows = [
    endedFor(sum('green'), alive, {}), endedFor(sum('step-red'), alive, {}), endedFor(sum('cap-halt'), alive, { resume: ok }),
    endedFor(sum('stopped'), alive, { resume: ok }), endedFor({ outcome: null, stopReason: null, spentUsd: null, budgetUsd: 2 }, { died: true, lastThing: null }, { resume: ok }),
  ];
  for (const e of rows) {
    assert.equal(e.actions.filter((a) => a.id === 'reuse').length, 1, JSON.stringify(e.actions));
    assert.deepEqual(e.actions.find((a) => a.id === 'reuse'), { id: 'reuse', label: 'Reuse workflow' });
    assert.equal(e.actions.some((a) => a.id === 'edit'), false);
    assert.doesNotMatch(`${e.reason} ${e.next}`, /Edit in chat/);
  }
});

test('"Edit in chat" is gone from every shipped file and every code-owned word', () => {
  for (const f of ['../src/panel/index.html', '../src/panel/server.js', '../src/panel/authorroutes.js', '../src/panel/authorsession.js', '../bareloop.context.md']) {
    const text = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    assert.doesNotMatch(text, /Edit in chat|withEditAction|editInChat|btn-edit-chat/, f);
  }
});

test('job name: a panel job lives in its session folder, never repo jobs/ — so a second draft under the SAME name is not refused by validateJobCard (checked against the real repo jobs/ dir)', () => {
  const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG });
  const card = { jobName: 'pulselog-digest', checkType: 'deterministic', model: 'claude-sonnet-5', jobText: 'g', inputs: 'repo: /s', destination: 'o', capUsd: 1 };
  assert.deepEqual(validateJobCard(card, { rows }), { ok: true }, 'drafting the same name again is accepted');
  assert.equal(validateJobCard({ ...card, jobName: 'pulselog-u-types' }, { rows }).ok, false, 'only a name that IS a repo jobs/*.json is refused');
  assert.deepEqual(validateJobCard({ ...card, jobName: 'pulselog-u-types' }, { rows, allowName: 'pulselog-u-types' }), { ok: true }, 'the origin\'s own name on an unchanged red reuse is the same job');
});

// ── page ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
function build(fnNames, scope = {}, vars = '', ret = '') {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${vars}\n${fnNames.map(fnSrc).join('\n')}\nreturn {${[...fnNames, ret].filter(Boolean).join(',')}};`)(...keys.map((k) => scope[k]));
}
const escapeXml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** the card state machine: real jobBoxesChangedNow / reusePathNow / syncReuseName against a mutable fake card */
function cardWorld({ green, name = 'x-2', nextName = 'x-3', origin = { checkType: 'deterministic', jobText: 'fix\n~ rule', thinking: false } }) {
  const box = { value: name };
  const live = { ...origin, destination: 'src/' };
  const api = build(['jobBoxesChangedNow', 'reusePathNow', 'syncReuseName'], {
    currentCard: () => ({ ...live }), document: { getElementById: () => box },
  }, `var startFrom = {runid: "r1"}, reuseOn = false, nameTouched = false, reuseOrigin = ${JSON.stringify({ card: origin, green, name, nextName })};`, '__t: (v) => { nameTouched = v; }, __touched: () => nameTouched');
  return { api, box, live };
}

test('page: the Job name box shows the origin until a job box changes, then the next free <base>-N (renamable); changing back restores the origin; a name typed while nothing changed is put back', () => {
  const { api, box, live } = cardWorld({ green: true });
  api.syncReuseName();
  assert.equal(box.value, 'x-2');
  live.jobText = 'fix\n~ rule\n~ another';
  api.syncReuseName();
  assert.equal(box.value, 'x-3', 'x-2 edited suggests x-3');
  box.value = 'my-own'; api.__t(true);
  api.syncReuseName();
  assert.equal(box.value, 'my-own', 'a renamed box stays while the job stays changed');
  live.jobText = 'fix\n~ rule';
  api.syncReuseName();
  assert.equal(box.value, 'x-2', 'back to the origin\'s job: the origin name returns');
  assert.equal(api.__touched(), false);
  live.checkType = 'rubric';
  api.syncReuseName();
  assert.equal(box.value, 'x-3', 'check type is a job box');
  live.checkType = 'deterministic'; live.thinking = true;
  api.syncReuseName();
  assert.equal(box.value, 'x-3', 'thinking is a job box');
  live.thinking = false; live.destination = 'lib/'; live.jobText = '  fix\n~ rule  ';
  api.syncReuseName();
  assert.equal(box.value, 'x-2', 'run boxes and whitespace never count');
});

test('page: the main button flips live - Sign & run on the reuse path (green origin, job boxes unchanged), Start drafting otherwise', () => {
  const word = (green, mutate) => {
    const { api, live } = cardWorld({ green });
    mutate?.(live);
    const mb = build(['mainButtonFor']).mainButtonFor;
    return mb({ session: false, startOk: true }, true, api.reusePathNow()).text;
  };
  assert.equal(word(true), 'Sign & run');
  assert.equal(word(true, (l) => { l.jobText = 'changed'; }), 'Start drafting');
  assert.equal(word(true, (l) => { l.destination = 'lib/'; }), 'Sign & run', 'a run box never flips it');
  assert.equal(word(false), 'Start drafting', 'a red origin always drafts');
  assert.equal(word(false, (l) => { l.jobText = 'changed'; }), 'Start drafting');
  assert.match(fnSrc('renderMain'), /reusePathNow\(\)/);
});

test('page: one Reuse workflow button on green, red, stopped and died runs; no Edit in chat button anywhere; the click passes the run name for the origin line', () => {
  const calls = [];
  const bar = { innerHTML: '', hidden: true, q: {}, querySelector(sel) { const k = /"(.+)"/.exec(sel)?.[1]; return this.q[k] ?? null; } };
  const mount = (detail) => {
    const { renderRunActions } = build(['runLabel', 'runName', 'renderRunActions'], { document: { getElementById: () => bar }, escapeXml, reuseWorkflow: (...a) => calls.push(a), resumeInChat() {} }, 'var stopAsked = {};');
    bar.q = { 'btn-reuse': { addEventListener(_e, fn) { bar.q['btn-reuse'].fn = fn; } } };
    renderRunActions(detail);
    return bar.innerHTML;
  };
  const REUSE = { id: 'reuse', label: 'Reuse workflow' };
  const RESUME = { id: 'resume', label: 'Resume' };
  const base = { runid: 'r1', job: 'digest', runNo: 4, died: false, live: false, resume: { ok: true } };
  for (const [what, d] of [['green', { ...base, ended: { actions: [REUSE] } }], ['red', { ...base, ended: { actions: [REUSE] } }],
    ['stopped', { ...base, ended: { actions: [RESUME, REUSE] } }], ['died', { ...base, died: true, ended: { actions: [RESUME, REUSE] } }]]) {
    const html = mount(d);
    assert.equal((html.match(/data-testid="btn-reuse"/g) || []).length, 1, what);
    assert.doesNotMatch(html, /btn-edit-chat|Edit in chat/, what);
  }
  bar.q['btn-reuse'].fn();
  assert.deepEqual(calls.at(-1), ['r1', '', 'digest (run-4)']);
  assert.doesNotMatch(mount({ ...base, live: true, ended: null }), /btn-reuse/, 'a live run has Stop only');
});

test('page: applyReuse locks nothing unless it is the schedule card, and the POST names only the origin (no editFrom)', () => {
  assert.match(fnSrc('applyReuse'), /setReuseLocked\(lock\)/);
  assert.doesNotMatch(fnSrc('applyReuse'), /setReuseLocked\(true\)/);
  assert.match(fnSrc('applyScheduleCard'), /applyReuse\(\{runid: d\.runid, prefill: d\.prefill, lock: true\}\)/);
  assert.doesNotMatch(PAGE, /editFrom/);
});
