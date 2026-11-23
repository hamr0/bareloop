// REVIEW THE CODE, clean build (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)", items 1-3): the whole PANEL door on a real repo. The live defect of the flag-threaded build (session smwoxacawshq3, first live draft; faf1fbc1): a Deterministic repo job the drafter picks as "review" took the rubric road (RUBRIC_FILES true) and then read
// `prep.manifest.inputs` for the worker's goal. A repo's manifest has no `inputs` list (only a file job's has), so the draft died at the end with
// "internal error: Cannot read properties of undefined (reading 'flatMap')" (rubricGoal, src/rubricstep.js). $0: the real session, a real git repo, the recorded drafter answers (review-pick "review",
// ledger count 3-3, the author's edits, the four `~` rules); only the model boundary is scripted.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSession } from '../src/panel/authorsession.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG } from './helpers.js';

/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(path.join(tmpdir(), p)); made.push(d); return d; };
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
const until = async (fn, ms = 60000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 50); }); return fn(); };
const ok = { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } };
const RULES = ['each idea names a file and a function', 'each idea quotes the slow code', 'each idea says why it would be faster', 'at least 3 ideas'];

test('a review draft on a repo reaches the signed-ready state: the goal lists no input files, and nothing throws (session smwoxacawshq3)', async () => {
  const repo = tmp('review-sess-repo-');
  mkdirSync(path.join(repo, 'src'));
  writeFileSync(path.join(repo, 'package.json'), '{"name":"x","version":"1.0.0"}\n');
  writeFileSync(path.join(repo, 'src', 'slow.js'), 'export function slow(list) {\n  return list.filter((x) => x.ok).map((x) => x.id).sort();\n}\n');
  mkdirSync(path.join(repo, 'reports'));
  writeFileSync(path.join(repo, 'reports', 'README.md'), 'reports\n');
  git(repo, ['init', '-q', '-b', 'main']); git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'seed']);
  const home = tmp('review-sess-home-');
  writeFileSync(path.join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  writeFileSync(path.join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  const cannot = [1, 2, 3, 4].map((r) => ({ from: `line 1 rule ${r}`, why: 'the page is a repository listing only' }));
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'repo' }], look: { facts: [], prose: [], notFound: [], dropped: [], cannot } } };
  const PLAN = { goal: 'List what could make the draft step faster.', checks: [], notChecked: [], questions: [] };
  let n = 0;
  const session = createSession({
    checkType: 'deterministic', model: 'claude-sonnet-5', jobName: 'review-sess-job', inputs: `repo: ${repo}`, destination: 'reports/', capUsd: 1,
    jobText: `1. Look at src/ and list what could make the draft step faster, no code changes\n${RULES.map((r) => `~ ${r}`).join('\n')}`,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('review-sess-root-'),
    generate: async () => { throw new Error('no model call'); },
    reviewPick: async () => ({ answer: 'review' }),
    lookFn: async () => survey,
    ledgerGenerate: async (_m, tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [{ line: 1, kind: 'count', min: 3, max: 3 }] }); return ok; },
    pickGenerate: async (_m, tools) => { await tools[0].execute({ rows: [] }); return ok; },
    noteFn: async () => ({ state: 'ABSENT', answers: [], calls: [] }),
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    editGenerate: async (_m, tools) => {
      const edits = n++ === 0 ? [{ op: 'add', kind: 'count', line: 1, min: 3, max: 3 }, ...[1, 2, 3].map((rule) => ({ op: 'not-checkable', line: 1, rule, reason: 'no check on the inputs can say it' }))] : [];
      await tools.find((t) => t.name === 'row_edits' || t.name.includes('edit')).execute({ edits });
      return ok;
    },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  session.signPrepare?.();
  assert.ok(await until(() => ['prepared', 'refused', 'error', 'abandoned'].includes(session.state.phase)), session.state.phase);
  assert.equal(session.state.phase, 'prepared', `${session.state.error ?? ''} ${JSON.stringify(session.state.steps.map((x) => `${x.id}:${x.status}`))}`);
  const spec = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
  assert.match(spec.goal, /The input files \(label: file\):\n\n/, 'a review lists no input files');
  assert.equal(spec.closeDecl.lang, 'text');
  assert.equal(spec.closeDecl.source, 'repo', 'the crossroads wrote the signed source');
  assert.deepEqual(spec.writeScope, ['output/'], 'the rubric road\'s own fence; Destination is where code writes the report');
  const stage = spec.closeDecl.stages.find((x) => x.kind === 'rubric-step');
  assert.equal(stage.params.parts.find((x) => x.class === 'shape').cite, 'repo', 'Part A is the table\'s: the cite rides the shape part');
});
