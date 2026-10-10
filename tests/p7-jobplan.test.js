// P7: the job plan MODEL (src/panel/jobplan.js), the Job tab's new fields (getRunJob), and the Inputs proving at the
// Start route. One model feeds the chat's plan bubble and the Job tab; an older spec (no jobLines) renders through the
// "older job" fallback. Real readers, scratch homes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planFromSpec, planFromConfirm, checkClassOfKind } from '../src/panel/jobplan.js';
import { getRunJob, signedLine, jobTextFromSpec, inputsTextFromSpec, createPanelServer } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';

/** @type {string[]} */ const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'p7-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

const NEW_SPEC = {
  schema: 'job-v1', job: 'p7-job', description: 'd', provider: 'anthropic-api', budgetUsd: 2, goal: 'flights sorted', verdictType: 'soft-green',
  writeScope: ['out/'],
  jobLines: [{ n: 1, text: 'Find 3 flights', rule: 'PASS: quoted from the page; FAIL: invented price' }, { n: 2, text: 'Sort them cheapest first', rule: 'direct only' }, { n: 3, text: 'Write a table', rule: '' }],
  inputs: [{ n: 1, label: 'repo', value: '/home/me/r' }, { n: 2, label: 'prefs', value: 'docs/prefs.md' }],
  closeDecl: {
    genre: 'types', lang: 'js', notes: ['looks nice is not checked'],
    stages: [
      { name: 'changed-from-seed', kind: 'files-changed', params: {} },
      { name: 'flights-found', fromLine: [1], kind: 'judged-floor', params: {} },
      { name: 'sorted-by-price', fromLine: [2], kind: 'command-exit', params: {} },
    ],
    refused: [{ line: 3, reason: 'no command can check a table layout' }],
  },
};

test('planFromSpec: each stage lands under the job line it names; stages with no fromLine are Always on; refusals and notes ride along', () => {
  const p = planFromSpec(NEW_SPEC);
  assert.equal(p.older, false);
  assert.deepEqual(p.lines.map((l) => [l.n, l.text, l.rule, l.checks, l.refused]), [
    [1, 'Find 3 flights', 'PASS: quoted from the page; FAIL: invented price', [{ name: 'flights-found', cls: 'judge' }], []],
    [2, 'Sort them cheapest first', 'direct only', [{ name: 'sorted-by-price', cls: 'machine check' }], []],
    [3, 'Write a table', '', [], ['no command can check a table layout']],
  ]);
  assert.deepEqual(p.alwaysOn, ['changed-from-seed']);
  assert.deepEqual(p.notChecked, ['looks nice is not checked']);
  assert.deepEqual(p.loose, []);
});

test('planFromSpec: an OLDER spec shows the signed goal as line 1 and every stage name as a check, flagged older', () => {
  const { jobLines: _a, inputs: _b, ...older } = NEW_SPEC;
  const p = planFromSpec({ ...older, closeDecl: { ...older.closeDecl, stages: older.closeDecl.stages.map(({ fromLine: _f, ...s }) => s), refused: undefined } });
  assert.equal(p.older, true);
  assert.equal(p.lines.length, 1);
  assert.equal(p.lines[0].text, 'flights sorted');
  assert.deepEqual(p.lines[0].checks.map((c) => c.name), ['changed-from-seed', 'flights-found', 'sorted-by-price']);
  assert.deepEqual(p.alwaysOn, []);
  // a command-close (array) spec reads as machine checks
  const cmd = planFromSpec({ goal: 'g', close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }] });
  assert.deepEqual(cmd.lines[0].checks, [{ name: 'suite-green', cls: 'machine check' }]);
});

test('planFromConfirm: the person\'s lines, the model\'s checks under the line each names (class not known yet), the real protections as Always on', () => {
  const p = planFromConfirm(
    [{ n: 1, text: 'Fix it', rule: '' }, { n: 2, text: 'Run tests', rule: 'quiet' }],
    { checkItems: [{ text: 'tsc clean', fromLine: [1] }, { text: 'tests pass', fromLine: [2] }, { text: 'stray', fromLine: [9] }], notChecked: ['style'], protections: ['no-suppressions'] },
  );
  assert.deepEqual(p.lines.map((l) => l.checks), [[{ name: 'tsc clean', cls: null }], [{ name: 'tests pass', cls: null }]]);
  assert.deepEqual(p.loose, [{ name: 'stray', cls: null }]);
  assert.deepEqual([p.notChecked, p.alwaysOn], [['style'], ['no-suppressions']]);
  assert.equal(checkClassOfKind('judged-floor'), 'judge');
  assert.equal(checkClassOfKind('command-exit'), 'machine check');
  assert.equal(checkClassOfKind('nope'), null);
});

test('signedLine / jobTextFromSpec / inputsTextFromSpec', () => {
  assert.match(signedLine('2026-10-10T12:02:00.000Z', 'a3f9c1deadbeef'), /^2026-10-10 \d\d:\d\d · a3f9c1$/);
  assert.equal(signedLine(null, 'abc123'), null);
  assert.equal(signedLine('2026-10-10T12:02:00.000Z', 'abc'), null);
  assert.equal(jobTextFromSpec(NEW_SPEC), 'Find 3 flights\n~ PASS: quoted from the page\n~ FAIL: invented price\nSort them cheapest first\n~ direct only\nWrite a table');
  assert.equal(jobTextFromSpec({ goal: 'old goal' }), 'old goal');
  assert.equal(inputsTextFromSpec(NEW_SPEC, '/x'), 'repo: /home/me/r\nprefs: docs/prefs.md');
  assert.equal(inputsTextFromSpec({}, '/x'), 'repo: /x');
  assert.equal(inputsTextFromSpec({}, ''), '');
});

test('getRunJob: a P7 run returns the plan, jobLines, inputs, specHash and the Signed line from the FIRST job-start; an older run falls back', () => {
  const home = tmp('p7-home-');
  const mk = (runid, spec) => {
    const out = tmp('p7-out-');
    const into = join(out, 'source-seed');
    const dir = join(into, `${spec.job}-bareloop`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/the/original/source', destination: 'out/' }));
    writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
    const h = jobSpecHash(spec);
    const recs = [
      { type: 'job-start', job: spec.job, specHash: h, goal: spec.goal, ts: '2026-10-10T08:00:00.000Z', seq: 1 },
      { type: 'job-end', outcome: 'green', spentUsd: 0.1, spendComplete: true, ts: '2026-10-10T08:05:00.000Z', seq: 2 },
      { type: 'leg-resume', leg: 2, after: 'green', ts: '2026-10-10T09:00:00.000Z', seq: 3 },
      { type: 'job-start', job: spec.job, specHash: h, goal: spec.goal, ts: '2026-10-10T09:00:00.000Z', seq: 4 },
    ];
    const spine = join(dir, `u-${runid}.jsonl`);
    writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
    const old = new Date(Date.now() - 3 * 3600 * 1000);
    utimesSync(spine, old, old);
    appendRun({ at: '2026-10-10T08:00:00.000Z', runid, job: spec.job, spine, patient: null, via: 'run-u' }, { home });
    return h;
  };
  const h = mk('newrun01', NEW_SPEC);
  const j = getRunJob('newrun01', { home });
  assert.equal(j.plan.older, false);
  assert.equal(j.plan.lines.length, 3);
  assert.deepEqual(j.jobLines, NEW_SPEC.jobLines);
  assert.deepEqual(j.inputs, NEW_SPEC.inputs);
  assert.equal(j.specHash, h);
  assert.equal(j.signedAt, '2026-10-10T08:00:00.000Z', 'the FIRST job-start, not the resume leg');
  assert.equal(j.signed, signedLine('2026-10-10T08:00:00.000Z', h));
  const { jobLines: _a, inputs: _b, ...older } = NEW_SPEC;
  mk('oldrun01', { ...older, job: 'p7-old-job' });
  const o = getRunJob('oldrun01', { home });
  assert.equal(o.plan.older, true);
  assert.equal(o.jobLines, null);
  assert.deepEqual(o.inputs, [{ n: 1, label: 'repo', value: '/the/original/source' }], 'the source falls back to the run\'s own source.json');
});

test('Start route: Inputs lines 2+ are proven at $0 before a session — a miss is a 400 naming the line', async (t) => {
  const home = tmp('p7-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const repo = tmp('p7-repo-');
  const g = (a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'package.json'), '{}');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'seed']);
  const { close, port, token } = await createPanelServer({ port: 0, env: {}, home, sessionsRoot: tmp('p7-sess-') });
  t.after(() => close());
  const post = (body) => fetch(`http://127.0.0.1:${port}/api/author/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bareloop-token': token }, body: JSON.stringify(body) });
  const card = { checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'p7-route-job', jobText: 'Fix it', destination: 'src/', capUsd: 1 };
  const miss = await post({ ...card, inputs: `repo: ${repo}\nspec: docs/missing.md` });
  assert.equal(miss.status, 400);
  assert.match((await miss.json()).error, /Inputs, line 2: docs\/missing\.md does not exist in the repo/);
  const search = await post({ ...card, inputs: `repo: ${repo}\nsearch: flights to Lisbon` });
  assert.match((await search.json()).error, /Inputs, line 2: only files inside the repo for now/);
  const rel = await post({ ...card, inputs: 'repo: relative/path' });
  assert.match((await rel.json()).error, /Inputs, line 1: the repo must be an absolute path/);
});

test('a check that serves several job lines is shown under EACH line it serves (spec and confirm plan)', () => {
  const spec = { ...NEW_SPEC, closeDecl: { ...NEW_SPEC.closeDecl, stages: [{ name: 'one-judge', fromLine: [1, 2, 3], kind: 'judged-floor', params: {} }], refused: undefined } };
  const p = planFromSpec(spec);
  assert.deepEqual(p.lines.map((l) => l.checks.map((c) => c.name)), [['one-judge'], ['one-judge'], ['one-judge']]);
  const c = planFromConfirm([{ n: 1, text: 'a', rule: '' }, { n: 2, text: 'b', rule: '' }], { checkItems: [{ text: 'both', fromLine: [1, 2] }, { text: 'nowhere', fromLine: [7] }] });
  assert.deepEqual(c.lines.map((l) => l.checks.map((x) => x.name)), [['both'], ['both']]);
  assert.deepEqual(c.loose.map((x) => x.name), ['nowhere']);
});
