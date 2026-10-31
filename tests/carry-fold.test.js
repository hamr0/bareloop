// The fold (hamr 2026-10-31): the handoff note is part of the carry memo. ONE block (the memo's files-read lines carry the
// function line ranges), ONE switch (`carryNote` in config.json; a legacy `handoffNote:false` in a job spec = memo off).
// Scripted provider, real Loop, real Gate, real LiteCtx index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { scriptedProvider, patientGitEnv } from './helpers.js';
import { tcall, makePatient, JOB, go } from './planrun-fixtures.js';
import { jobSpecHash, validateJob } from '../src/job.js';
import { createCarryStore } from '../src/carrystore.js';
import { render, HEADING, CAP, isCarryExcluded } from '../src/carrynote.js';
import { replayRun } from '../src/replay.js';

const OLD_HEADING = '== Files earlier workers in this run read';
const askPrompts = (provider) => [...new Set(provider.messagesLog)].map((m) => m.find((x) => x.role !== 'system').content);

const patient = (t) => {
  const wd = makePatient(t);
  writeFileSync(join(wd, 'src', 'mod.mjs'), 'export function alpha(a) {\n  return a + 1;\n}\n\nexport function beta(b) {\n  return b * 2;\n}\n');
  const git = (args) => execFileSync('git', args, { cwd: wd, env: patientGitEnv() });
  git(['add', 'src/mod.mjs']);
  git(['commit', '-q', '-m', 'mod']);
  return wd;
};
const TOOLS = ['read', 'write', 'edit', 'recall', 'get'];
const twoSteps = () => JSON.stringify({
  schema: 'plan-v1',
  steps: [
    { id: 'look', action: 'Read src/mod.mjs and write tests/test_x.mjs.', tools: ['read', 'write'], rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }] },
    { id: 'more', action: 'Write tests/test_y.mjs.', tools: ['write', 'recall', 'get'], rounds: 6, target: 'tests/test_y.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] },
  ],
});
const readMod = (wd) => tcall('r1', 'shell_read', { path: join(wd, 'src', 'mod.mjs') });
const w = (wd, name, content) => tcall(`w-${name}`, 'shell_write', { path: join(wd, 'tests', name), content });
const script = (wd) => [
  { text: 'scout notes' }, { text: twoSteps() },
  { toolCalls: [readMod(wd)] }, { toolCalls: [w(wd, 'test_x.mjs', 'ok - x\n')] }, { text: 'one' },
  { toolCalls: [w(wd, 'test_y.mjs', 'ok - y\n')] }, { text: 'two' },
];
const stepTwoOf = (provider) => askPrompts(provider).find((p) => p.includes('Write tests/test_y.mjs.'));

test('fold 1: a job spec with handoffNote:false turns the memo off for that job', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(script(wd));
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS, handoffNote: false }), carryNote: true });
  assert.equal(outcome, 'green');
  assert.ok(askPrompts(provider).every((p) => !p.includes(HEADING) && !p.includes(OLD_HEADING)));
  assert.equal(events.filter((e) => e.type === 'carry-note' || e.type === 'handoff-note').length, 0);
  assert.equal(existsSync(join(wd, '.smoke', 'carry')), false, 'no state written');
});

test('fold 2: the memo\'s files-read line carries the function line ranges', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(script(wd));
  const { outcome } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }), carryNote: true });
  assert.equal(outcome, 'green');
  assert.match(stepTwoOf(provider), /^- src\/mod\.mjs \(\d+ lines\) · read 1x · functions: alpha \d+-\d+, beta \d+-\d+$/m);
});

test('fold 3: the worker sees the file list exactly once (no second block)', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(script(wd));
  await go(wd, provider, { job: JOB(wd, { tools: TOOLS }), carryNote: true });
  const p = stepTwoOf(provider);
  assert.ok(!p.includes(OLD_HEADING), 'the separate handoff block is gone');
  assert.equal(p.split(HEADING).length - 1, 1);
  assert.equal(p.match(/^- src\/mod\.mjs/gm).length, 1);
});

test('fold 4: over the cap, the function ranges are dropped FIRST (failures, edits, searches, files all stay)', () => {
  const events = Array.from({ length: 40 }, (_, i) => ({ ask: 1, tool: 'read', path: `src/file-${i}.js`, lines: 100 }));
  const fnRanges = Object.fromEntries(events.map((e) => [e.path, Array.from({ length: 12 }, (_, k) => `fn${k}_${'z'.repeat(30)} ${k * 10 + 1}-${k * 10 + 9}`).join(', ')]));
  const notes = {
    events: [...events, { ask: 1, tool: 'grep', pattern: 'needle', scope: 'src', matches: 2, firstMatches: ['src/a.js:3'] }],
    edits: [{ path: 'src/file-0.js', lines: 4, hunks: ['+x'] }],
    failures: [{ label: 'at start', text: 'FAILED the count check' }],
    earlier: [], lastAsk: 1,
  };
  const without = render({ ...notes }, 1e9);
  const withR = render({ ...notes, fnRanges }, 1e9);
  assert.ok(withR.text.includes('functions:') && withR.text.length > CAP, 'ranges are what push it over the cap');
  assert.ok(without.text.length <= CAP, 'without ranges it fits');
  const r = render({ ...notes, fnRanges });
  assert.equal(r.capped, true);
  assert.ok(!r.text.includes('functions:'), 'ranges gone');
  assert.ok(r.text.includes('FAILED the count check') && r.text.includes('grep "needle"') && r.text.includes('src/file-39.js') && r.text.includes('src/file-0.js: 4 lines changed'));
  assert.ok(r.text.length <= CAP);
});

test('fold 5: carryNote off (the one switch) = nothing: no memo, no old block, no record, no state', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(script(wd));
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }), carryNote: false });
  assert.equal(outcome, 'green');
  assert.ok(askPrompts(provider).every((p) => !p.includes(HEADING) && !p.includes(OLD_HEADING)));
  assert.equal(events.filter((e) => e.type === 'carry-note' || e.type === 'handoff-note').length, 0);
  assert.equal(existsSync(join(wd, '.smoke', 'carry')), false);
});

test('fold 5b: runPlan with NO carryNote option builds the memo (library default ON, hamr 2026-10-31)', async (t) => {
  const wd = patient(t);
  const provider = scriptedProvider(script(wd));
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { tools: TOOLS }) });
  assert.equal(outcome, 'green');
  assert.ok(stepTwoOf(provider).includes(HEADING), 'the memo is in the prompt with the option absent');
  assert.ok(events.some((e) => e.type === 'carry-note'));
  assert.equal(existsSync(join(wd, '.smoke', 'carry')), true);
});

test('fold 6: an old spine with handoff-note records still replays', () => {
  const spine = readFileSync(new URL('./fixtures/audit-grid/u-mvtatlxw.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(spine.some((e) => e.type === 'handoff-note'), 'the fixture really carries handoff-note records');
  const sum = replayRun(spine);
  assert.ok(sum && sum.steps.length > 0, 'replays to a summary with its steps');
});

test('fold 7: a resumed store keeps the file list (and its function ranges) on disk', async () => {
  const wd = mkdtempSync(join(tmpdir(), 'carry-fold-'));
  try {
    writeFileSync(join(wd, 'f.js'), 'function a() {\n}\n');
    mkdirSync(join(wd, '.smoke', 'carry'), { recursive: true });
    writeFileSync(join(wd, '.smoke', 'carry', 'state.json'), JSON.stringify({ n: 3, base: null, events: [{ ask: 2, tool: 'read', path: 'f.js', lines: 2 }], asks: [] }));
    const s = createCarryStore({ workdir: wd, emit: () => {}, resume: true });
    const text = await s.beginAsk({ phase: 'step:x', iteration: 1, prompt: '', getNode: () => ({ chunks: [{ symbol: 'a', startLine: 1, endLine: 2 }] }) });
    assert.match(text, /^- f\.js \(2 lines\) · read 1x · functions: a 1-2$/m);
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('fold 8: handoffNote stays accepted (legacy): validates, enters the hash only when present; excluded paths unchanged', (t) => {
  const wd = patient(t);
  const base = JOB(wd);
  assert.notEqual(jobSpecHash(base), jobSpecHash({ ...base, handoffNote: false }));
  assert.equal(validateJob({ ...base, handoffNote: false }).reds.length, 0);
  assert.equal(jobSpecHash({ schema: 'job-v1', job: 'old-spec', thinking: false, budgetUsd: 1, writeScope: ['a/**'] }), 'e6ca118c3f6cf71646334ffc3b5fa67ea52e7e0d023d3e711f458237fa6aa96e');
  for (const rel of ['.smoke/spine.jsonl', '.litectx/index.db', 'gate-audit.jsonl', '.git/config', 'a/.git/HEAD', '../outside.txt', '/etc/passwd']) assert.ok(isCarryExcluded(rel), rel);
  assert.ok(!isCarryExcluded('src/mod.mjs') && !isCarryExcluded('.gitignore'));
});
