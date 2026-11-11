// PLACE RULES, P3 (docs/product/ITEM33-BUILD.md, "Place rules build spec"): the run start reads each place-rule fact from the run's OWN copy of its input,
// by code, before any provider call, and binds the value as that fact's phrase on the run's in-memory spec. The riskiest part is HERE: the value must be
// bound AFTER the approval/signature check without any later hash check failing, and it must never reach the signed spec.
// Real engine (`run-u --spec`, in-process), real source door, real bareguard grading; only the worker is scripted.
//
// Every place a spec hash is computed during a run, and what this file asserts about it:
//   1. userrun.js `approvals` + the `--approve` check  (before the bind)     -> the run is not refused as unapproved
//   2. run.js `checkApproval(rawSpec, approvals)`      (before the bind)     -> the run reaches a verdict, not `unapproved-spec`
//   3. run.js `job-start.specHash = jobSpecHash(job)`  (before the bind)     -> the spine records the SIGNED hash
//   4. src/runfiles.js `signedSpecForRun` (the panel's lookup, hash vs job-start) -> still finds the signed file for the run
//   5. userrun.js `specHash` into the learnings / bridge rows (the signed const)  -> the learnings row carries the signed hash
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash, workflowKey } from '../src/job.js';
import { main } from '../src/userrun.js';
import { readRunList } from '../src/runlist.js';
import { signedSpecForRun } from '../src/runfiles.js';
import { scriptedProvider, readSpine } from './helpers.js';

const tmp = (/** @type {import('node:test').TestContext} */ t, /** @type {string} */ p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');

/** the changelog the job was DRAFTED on (newest release 0.55.0) and the one this run reads (newest release 0.56.0) */
const DRAFT_LOG = '# Changelog\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const RUN_LOG = '# Changelog\n\n## [0.56.0] - 2026-11-10\n\n- second\n\n## [0.55.0] - 2026-11-04\n\n- first\n';
const PLACE = { kind: 'headingBetween', prefix: '## [', end: ']', shape: 'semver', skip: ['Unreleased'] };

/** a signed rubric job with ONE phrase fact whose words are the DRAFTING version and which carries a place rule */
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

/** the run: the spec is signed on the DRAFT changelog; the run's own copy of the input is `runLog` */
async function world(/** @type {import('node:test').TestContext} */ t, /** @type {string} */ runLog = RUN_LOG, /** @type {string} */ quote = '## [0.56.0] - 2026-11-10') {
  const dir = tmp(t, 'place-run-');
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, DRAFT_LOG);
  const spec = placeSpec(file);
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  // a Reuse on a newer input: the run's frozen copy is the NEW changelog
  writeFileSync(file, runLog);
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'changelog', value: file }], into });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json',
    exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: 'line-1-newest-release' }],
  }] });
  const provider = scriptedProvider([
    { text: 'input/CHANGELOG.md holds the changelog' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: `${JSON.stringify({ results: [{ quote, values: {} }] })}\n` } }] },
    { text: 'wrote' },
  ]);
  const home = tmp(t, 'place-home-');
  /** @type {string[]} */ const err = [];
  /** @type {string[]} */ const outLines = [];
  const run = () => main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => outLines.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home })
    .then((rc) => ({ rc, err: err.join('\n'), out: outLines.join('\n') }));
  return { dir, spec, specPath, into, home, provider, run };
}

test('the run grades on the value its own copy of the input holds (0.56.0), the signed phrase being 0.55.0, and every hash check still passes', async (t) => {
  const w = await world(t);
  const signedHash = jobSpecHash(w.spec);
  const bytesBefore = readFileSync(w.specPath, 'utf8');
  const r = await w.run();
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  const row = readRunList({ home: w.home }).rows[0];
  const events = readSpine(row.spine);
  const end = events.findLast((e) => e.type === 'job-end');
  assert.equal(end.outcome, 'green', 'the close graded the worker\'s quote of 0.56.0 against the BOUND phrase (a signed 0.55.0 could not be in that quote)');
  // 1+2: not refused as unapproved
  assert.notEqual(end.outcome, 'unapproved-spec');
  // 3: the spine records the SIGNED hash, not a hash of the bound copy
  const start = events.find((e) => e.type === 'job-start');
  assert.equal(start.specHash, signedHash);
  // 4: the panel's own lookup (job-start hash vs the signed file) still finds the signed spec
  const found = signedSpecForRun(row, events);
  assert.ok(found, 'the signed spec is found by its recorded hash');
  assert.equal(found.specHash, signedHash);
  // the signed spec file is byte-identical after the run, and still hashes to what was signed
  assert.equal(readFileSync(w.specPath, 'utf8'), bytesBefore, 'the signed spec file is byte-identical after the run');
  assert.equal(sha(readFileSync(w.specPath, 'utf8')), sha(bytesBefore));
  assert.equal(jobSpecHash(JSON.parse(readFileSync(w.specPath, 'utf8'))), signedHash);
  assert.equal(JSON.parse(readFileSync(w.specPath, 'utf8')).closeDecl.stages[1].params.parts[0].facts[0].phrase, '0.55.0', 'the drafting words stay in the file');
  // the workflow key does not move from run to run: it is the key of the signed spec
  assert.equal(workflowKey(JSON.parse(readFileSync(w.specPath, 'utf8'))), workflowKey(w.spec));
});

test('a worker quote of the OLD release does not green: the close reads the bound value, not the signed words', async (t) => {
  // the run's own copy still holds 0.55.0 in an older section, so the quote is really in the input; only the BOUND phrase (0.56.0) rejects it
  const w = await world(t, RUN_LOG, '## [0.55.0] - 2026-11-04');
  const r = await w.run();
  const row = readRunList({ home: w.home }).rows[0];
  const end = readSpine(row.spine).findLast((e) => e.type === 'job-end');
  assert.notEqual(end.outcome, 'green', `${r.err}\n${r.out}`);
});
