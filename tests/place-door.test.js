// PLACE RULES, the review door (hamr ruling 2026-11-11, "fix it"): an Accept re-proves the close's mechanical stages, and a door Rerun starts a fresh
// engagement without re-reading the input. Both must use the value THE SAME RUN read (its own `place-rules` spine record, the helper a resume uses), never
// the signed drafting words. A run with no such record is refused in plain words. The signed spec file is never touched.
// Real engine (`run-u --spec ... --door`, in-process), real source door, real bareguard grading; only the worker is scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider, readSpine } from './helpers.js';

const tmp = (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const DRAFT_LOG = '# Changelog\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const RUN_LOG = '# Changelog\n\n## [0.56.0] - 2026-11-10\n\n- second\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };
const NO_RECORD = 'This run has no record of the values it read, so it cannot be checked again. Use Reuse workflow.';

function placeSpec(/** @type {string} */ file) {
  return {
    schema: 'job-v1', job: 'newest-release', description: 'place-rule fixture.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['output/'],
    goal: 'Quote the newest release heading of the changelog.', verdictType: 'soft-green', escalation: { mode: 'decision-ready' },
    jobLines: [{ n: 1, text: 'Quote the newest release heading', rule: '' }],
    inputs: [{ n: 1, label: 'changelog', value: file }],
    closeDecl: {
      genre: 'TEXT', lang: 'text',
      stages: [
        { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } },
        {
          name: 'line-1-newest-release', kind: 'rubric-step', fromLine: [1],
          params: { step: 1, parts: [{ text: 'Quote the newest release heading', class: 'fact', source: 'changelog', facts: [{ name: 'version', shape: 'phrase', phrase: '0.55.0', place: PLACE }] }] },
        },
      ],
    },
  };
}

/** a green place-rule run (signed 0.55.0, read 0.56.0) that stands at its review door, then the door call */
async function greenAtDoor(/** @type {import('node:test').TestContext} */ t) {
  const dir = tmp(t, 'place-door-');
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, DRAFT_LOG);
  const spec = placeSpec(file);
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  writeFileSync(file, RUN_LOG);
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'changelog', value: file }], into });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'line-1-newest-release' }],
  }] });
  const provider = scriptedProvider([
    { text: 'input/CHANGELOG.md holds the changelog' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: `${JSON.stringify({ results: [{ quote: '## [0.56.0] - 2026-11-10', values: {} }] })}\n` } }] },
    { text: 'wrote' },
  ]);
  const home = tmp(t, 'place-door-home-');
  /** @type {string[]} */ const err = [];
  /** @type {string[]} */ const outL = [];
  const io = { provider, env: {}, out: (/** @type {any} */ s) => outL.push(String(s)), err: (/** @type {any} */ s) => err.push(String(s)), runlistHome: home };
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), '--review-door'], io);
  const row = readRunList({ home }).rows[0];
  const events = readSpine(row.spine);
  const door = (/** @type {string} */ decision, /** @type {string[]} */ extra = []) => {
    err.length = 0; outL.length = 0;
    return main(['--spec', specPath, '--door', row.spine, '--decide', decision, '--approve', jobSpecHash(spec), ...extra], io)
      .then((r) => ({ rc: r, err: err.join('\n'), out: outL.join('\n') }));
  };
  return { spec, specPath, row, events, rc, door, io, tree: prep.prep.tree, first: { err: err.join('\n'), out: outL.join('\n') } };
}

test('a run that read 0.56.0 (signed 0.55.0) greens at its door, and Accept passes on the value that run read; the signed spec is byte-identical', async (t) => {
  const w = await greenAtDoor(t);
  assert.equal(w.rc, 0, JSON.stringify(w.first));
  assert.equal(w.events.findLast((e) => e.type === 'job-end').outcome, 'green');
  assert.ok(w.events.some((e) => e.type === 'review-door'), 'the run stands at its review door');
  const bytes = readFileSync(w.specPath, 'utf8');
  const r = await w.door('accept');
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  assert.match(r.out, /ACCEPTED/);
  assert.equal(readFileSync(w.specPath, 'utf8'), bytes, 'the signed spec file is byte-identical after the accept');
  assert.equal(JSON.parse(bytes).closeDecl.stages[1].params.parts[0].facts[0].phrase, '0.55.0');
});

test('a run with no place-rules record is refused at Accept in plain words, and nothing falls back to the signed drafting words', async (t) => {
  const w = await greenAtDoor(t);
  assert.equal(w.rc, 0, JSON.stringify(w.first));
  const lines = readFileSync(w.row.spine, 'utf8').split('\n').filter((l) => l !== '' && !l.includes('"place-rules"'));
  writeFileSync(w.row.spine, `${lines.join('\n')}\n`);
  const r = await w.door('accept');
  assert.notEqual(r.rc, 0);
  assert.ok(r.err.includes(NO_RECORD), r.err);
  assert.ok(!readFileSync(w.row.spine, 'utf8').includes('"door-decision"'), 'nothing was recorded');
});

test('a door Rerun without a place-rules record is refused in the same words, before any spend', async (t) => {
  const w = await greenAtDoor(t);
  const lines = readFileSync(w.row.spine, 'utf8').split('\n').filter((l) => l !== '' && !l.includes('"place-rules"'));
  writeFileSync(w.row.spine, `${lines.join('\n')}\n`);
  const r = await w.door('rerun', ['--text', 'again']);
  assert.notEqual(r.rc, 0);
  assert.ok(r.err.includes(NO_RECORD), r.err);
});

test('a door Rerun binds the value the answered run read (0.56.0, signed 0.55.0) and greens on it with a scripted worker', async (t) => {
  const w = await greenAtDoor(t);
  assert.equal(w.rc, 0, JSON.stringify(w.first));
  // a rerun is a fresh engagement (a new run id and spine): the scout, the plan and the worker are scripted again; the provider is replaced (the first one is spent)
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'line-1-newest-release' }],
  }] });
  w.io.provider = scriptedProvider([
    { text: 'input/CHANGELOG.md holds the changelog' }, { text: plan },
    { toolCalls: [{ id: 't2', name: 'shell_write', arguments: { path: join(w.tree, 'output', 'steps', '1.json'), content: `${JSON.stringify({ results: [{ quote: '## [0.56.0] - 2026-11-10', values: {} }] })}\n` } }] },
    { text: 'wrote' },
  ]);
  const r = await w.door('rerun', ['--text', 'again']);
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  const rows = readRunList({ home: w.io.runlistHome }).rows;
  assert.equal(rows.length, 2, 'the rerun is a second run');
  const events = readSpine(rows.find((x) => x.spine !== w.row.spine).spine);
  assert.equal(events.findLast((e) => e.type === 'job-end').outcome, 'green', 'the rerun greens on 0.56.0, the value the answered run read');
});
