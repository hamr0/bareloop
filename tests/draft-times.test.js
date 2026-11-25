// hamr 2026-11-24 (signed, ITEM33-BUILD "Part B", A1-A5): the drafting list in chat shows each finished step's "took M:SS" and the running step's
// "M:SS so far", signs ✓ / ▶ / ✗, and under the list "Drafting so far: M:SS". Every time is read from the drafting log's step-start / step-end
// lines (src/draftspend.js is the one owner of the math), moves in 30 s steps (no ticking clock), costs $0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ds from '../src/draftspend.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'draft-times-')); made.push(d); return d; };
const T0 = Date.parse('2026-11-24T10:00:00.000Z');
const iso = (/** @type {number} */ secs) => new Date(T0 + secs * 1000).toISOString();
/** a drafting log: step 0 ran 0:00-0:42, step 1 failed 0:42-0:50, step 2 started 0:50 and is running */
function logDir() {
  const dir = tmp();
  const lines = [
    { kind: 'step-start', no: 0, id: 'setup', label: 'checking setup', at: iso(0) },
    { kind: 'step-end', no: 0, status: 'done', label: 'checking setup', at: iso(42) },
    { kind: 'step-start', no: 1, id: 'copy', label: 'making worktree', at: iso(42) },
    { kind: 'step-end', no: 1, status: 'failed', label: 'making worktree', at: iso(50) },
    { kind: 'step-start', no: 2, id: 'draft', label: 'drafting', at: iso(50) },
  ];
  writeFileSync(join(dir, 'draft-log.jsonl'), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  return dir;
}
const stateOf = (/** @type {string} */ outDir) => ({
  outDir, phase: 'drafting',
  steps: [{ id: 'setup', label: 'checking setup', status: 'done', detail: '' }, { id: 'copy', label: 'making worktree', status: 'failed', detail: 'x' }, { id: 'draft', label: 'drafting', status: 'running', detail: '' }],
});

test('A1/A5: a finished step reads "took M:SS", the running one "M:SS so far", from the log alone', () => {
  const v = ds.withDraftTimes(stateOf(logDir()), T0 + 125_000);
  assert.deepEqual(v.steps.map((/** @type {any} */ s) => s.time), ['took 0:42', 'took 0:08', '1:00 so far']);
});

test('A3: the running time moves in 30 s steps - 59 s into the step still reads 0:30, 60 s reads 1:00', () => {
  const dir = logDir();
  assert.equal(ds.withDraftTimes(stateOf(dir), T0 + 50_000 + 59_000).steps[2].time, '0:30 so far');
  assert.equal(ds.withDraftTimes(stateOf(dir), T0 + 50_000 + 60_000).steps[2].time, '1:00 so far');
  assert.equal(ds.withDraftTimes(stateOf(dir), T0 + 50_000 + 29_000).steps[2].time, '0:00 so far');
});

test('A2: "Drafting so far: M:SS" counts from the first step, 30 s steps; none once no step is running', () => {
  const dir = logDir();
  assert.equal(ds.withDraftTimes(stateOf(dir), T0 + 125_000).draftSoFar, 'Drafting so far: 2:00');
  appendEnd(dir);
  assert.equal(ds.withDraftTimes(stateOf(dir), T0 + 300_000).draftSoFar, null);
});
function appendEnd(/** @type {string} */ dir) {
  writeFileSync(join(dir, 'draft-log.jsonl'), `${readFileSync(join(dir, 'draft-log.jsonl'), 'utf8')}${JSON.stringify({ kind: 'step-end', no: 2, status: 'done', label: 'drafting', at: iso(100) })}\n`);
}

test('a step the log never saw (the pushed "signed" line) carries no time, and no log at all changes nothing', () => {
  const dir = logDir();
  const st = stateOf(dir);
  st.steps.push({ id: 'signed', label: 'signed hash', status: 'done', detail: '' });
  assert.equal(ds.withDraftTimes(st, T0 + 125_000).steps[3].time, null);
  const none = ds.withDraftTimes({ outDir: tmp(), steps: st.steps }, T0);
  assert.ok(none.steps.every((/** @type {any} */ s) => s.time === null));
  assert.equal(none.draftSoFar, null);
});

test('the session route serves the times with the state (GET /api/author/<id>)', () => {
  const dir = logDir();
  const routes = createAuthorRoutes({ port: 1, token: 'tok' });
  const session = /** @type {any} */ ({ id: 'abc123', state: stateOf(dir) });
  routes.sessions.set(session.id, session);
  /** @type {any} */ let out = null;
  const req = { method: 'GET', headers: { 'x-bareloop-token': 'tok', host: '127.0.0.1:1' } };
  const res = { writeHead() {}, end(/** @type {string} */ txt) { out = JSON.parse(txt); } };
  assert.equal(routes.handle(req, res, '/api/author/abc123', null), true);
  assert.equal(out.state.steps[0].time, 'took 0:42');
  assert.match(out.state.steps[2].time, /^\d+:\d\d so far$/);
  assert.match(out.state.draftSoFar, /^Drafting so far: \d+:\d\d$/);
});

/** the page's renderProgress, extracted */
function fn(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, name);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
test('page: the list draws ✓ / ▶ / ✗, each time beside its step, and the "Drafting so far" line under the list', () => {
  const row = { hidden: true, innerHTML: '' };
  const src = ['renderProgress', 'progressLabelFor', 'escapeXml'].map(fn).join('\n');
  // eslint-disable-next-line no-new-func
  const render = new Function('progressRow', `${src}\nreturn renderProgress;`)(row);
  render({ steps: [
    { id: 'setup', label: 'checking setup', status: 'done', detail: '', time: 'took 0:42' },
    { id: 'copy', label: 'making worktree', status: 'failed', detail: 'x', time: 'took 0:08' },
    { id: 'draft', label: 'drafting', status: 'running', detail: '', time: '1:00 so far' },
  ], draftSoFar: 'Drafting so far: 2:00' });
  const lis = row.innerHTML.match(/<li [^]*?<\/li>/g);
  assert.match(lis[0], /step-sign">✓<\/span>[^]*took 0:42/);
  assert.match(lis[1], /step-sign">✗<\/span>[^]*took 0:08/);
  assert.match(lis[2], /step-sign">▶<\/span>[^]*1:00 so far/);
  assert.match(lis[3], /data-testid="drafting-so-far"[^]*Drafting so far: 2:00/);
  assert.equal(lis.length, 4);
  render({ steps: [{ id: 'setup', label: 'checking setup', status: 'done', detail: '' }] });
  assert.doesNotMatch(row.innerHTML, /drafting-so-far|took/, 'no times, no line: nothing is made up');
});
