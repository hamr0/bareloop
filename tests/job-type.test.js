// "Result tab A + Job type everywhere" (docs/product/ITEM33-BUILD.md, hamr 2026-11-21), item 1: ONE code-owned Job type line (src/sourcedefaults.js `jobTypeLine`), printed by every view: the draft card, the draft
// readout, the Job tab, the Result tab and the Audit header. None spells it; a rubric job on files has none. REAL specs (the archived walk-branch review mwqnkvx5, a repo change job, a files rubric job), the real
// session for the card, the real server readers for the rest.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { getRunJob, getRunResult, getRunDetail } from '../src/panel/server.js';
import { buildReadout } from '../src/authorreadout.js';
import { jobTypeLine } from '../src/sourcedefaults.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG } from './helpers.js';
import { makeReviewWorld, FX_A } from './result-a-world.mjs';
import { makeResultWorld } from './result-tab-world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (/** @type {string} */ f) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', f), 'utf8'));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (/** @type {string} */ p) => { const d = mkdtempSync(path.join(tmpdir(), p)); made.push(d); return d; };
const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
const until = async (/** @type {() => any} */ fn, ms = 60000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 50); }); return fn(); };
const ok = { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } };

const REVIEW = () => JSON.parse(readFileSync(path.join(FX_A, 'mwqnkvx5.resolved-spec.json'), 'utf8'));
const CHANGE = () => load('repo-list/smwhvmfsxd5t8-spec.json');
const RUBRIC = () => load('mv5bk400-resolved-spec.json');

test('the one owner words the pair from the signed source and class: Review code, Change code, nothing for a rubric job on files', () => {
  assert.equal(jobTypeLine(REVIEW()), 'Job type: Review code');
  assert.equal(jobTypeLine(CHANGE()), 'Job type: Change code');
  assert.equal(jobTypeLine(RUBRIC()), null);
  assert.equal(jobTypeLine({}), null);
  assert.equal(jobTypeLine(null), null);
});

/** the draft card: a real session drafting a review on a real repo; the plan bubble the page draws */
async function reviewCard() {
  const repo = tmp('jobtype-repo-');
  mkdirSync(path.join(repo, 'src'));
  writeFileSync(path.join(repo, 'package.json'), '{"name":"x","version":"1.0.0"}\n');
  writeFileSync(path.join(repo, 'src', 'slow.js'), 'export function slow(list) {\n  return list.filter((x) => x.ok).map((x) => x.id).sort();\n}\n');
  mkdirSync(path.join(repo, 'reports'));
  writeFileSync(path.join(repo, 'reports', 'README.md'), 'reports\n');
  git(repo, ['init', '-q', '-b', 'main']); git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'seed']);
  const home = tmp('jobtype-home-');
  writeFileSync(path.join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  writeFileSync(path.join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const cannot = [1, 2, 3, 4].map((r) => ({ from: `line 1 rule ${r}`, why: 'the page is a repository listing only' }));
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'repo' }], look: { facts: [], prose: [], notFound: [], dropped: [], cannot } } };
  const PLAN = { goal: 'List what could make the draft step faster.', checks: [], notChecked: [], questions: [] };
  let n = 0;
  const session = createSession({
    checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'jobtype-job', inputs: `repo: ${repo}`, destination: 'reports/', capUsd: 1,
    jobText: '1. Look at src/ and list what could make the draft step faster, no code changes\n~ each idea names a file\n~ each idea says why\n~ each idea quotes the slow code\n~ at least 3 ideas',
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('jobtype-root-'),
    generate: async () => { throw new Error('no model call'); },
    reviewPick: async () => ({ answer: 'review' }),
    lookFn: async () => survey,
    ledgerGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [{ line: 1, kind: 'count', min: 3, max: 3 }] }); return ok; },
    pickGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools[0].execute({ rows: [] }); return ok; },
    noteFn: async () => ({ state: 'ABSENT', answers: [], calls: [] }),
    confirmGenerate: async (/** @type {any} */ _c, /** @type {any[]} */ tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => {
      const edits = n++ === 0 ? [{ op: 'add', kind: 'count', line: 1, min: 3, max: 3 }, ...[1, 2, 3].map((rule) => ({ op: 'not-checkable', line: 1, rule, reason: 'no check on the inputs can say it' }))] : [];
      await tools.find((t) => t.name === 'row_edits' || t.name.includes('edit')).execute({ edits });
      return ok;
    },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  return session.state.messages.findLast((/** @type {any} */ m) => m.kind === 'plan').plan;
}

test('the Job type line is byte-equal on the draft card, the readout, the Job tab, the Result tab and the Audit header', async () => {
  const want = 'Job type: Review code';
  const card = (await reviewCard()).jobType;
  const readout = buildReadout({ spec: REVIEW(), rounds: 1, costUsd: 0.01 }).split('\n')[1];
  const w = makeReviewWorld();
  const jobTab = getRunJob(w.runid, { home: w.home }).plan.jobType;
  const result = getRunResult(w.runid, { home: w.home }).jobType;
  const audit = getRunDetail(w.runid, { home: w.home }).jobType;
  assert.deepEqual([card, readout, jobTab, result, audit], [want, want, want, want, want]);
  // a change job (a real archived code close): the other word of the pair, on the readout, the Job tab, the Result tab and the Audit header
  const c = makeResultWorld(['mvkj03w7']);
  const wantC = 'Job type: Change code';
  const specC = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'result-tab', 'mvkj03w7.resolved-spec.json'), 'utf8'));
  assert.equal(specC.verdictType, 'green');
  assert.deepEqual([
    buildReadout({ spec: specC, rounds: 1, costUsd: 0.01 }).split('\n')[1],
    getRunJob('mvkj03w7', { home: c.home }).plan.jobType, getRunResult('mvkj03w7', { home: c.home }).jobType, getRunDetail('mvkj03w7', { home: c.home }).jobType,
  ], [wantC, wantC, wantC, wantC]);
});

test('a rubric job on files shows no Job type line on any view (the readout opens on its blank line)', () => {
  const lines = buildReadout({ spec: RUBRIC(), rounds: 1, costUsd: 0.01 }).split('\n');
  assert.equal(lines[1], '');
  assert.equal(lines.some((l) => l.startsWith('Job type')), false);
});
