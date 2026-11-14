// Addendum 2026-11-14 (c) piece 4, the CALLER: the real runner (`runJob` -> planrun) hands the signed list to the close, so the spine's `outer-close` stage entries carry a result per row. REAL data: archived run mve5y8fa's
// signed spec, saved page and delivered step file (tests/fixtures/part5), graded by the real bareguard; the list is the signed form of that spec's own parts (one row per fact, the floor, the guard).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJob } from '../src/run.js';
import { jobSpecHash } from '../src/job.js';
import { makeSpine } from '../src/spine.js';
import { proveRubricInputs } from '../src/source.js';
import { readSpine, scriptedProvider } from './helpers.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
const SPEC = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const STAGE = SPEC.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
const PAGE = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const STEP = readFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), 'utf8');
const FACTS = STAGE.params.parts[0].facts.map((/** @type {any} */ f) => f.name);
const LIST = [
  ...FACTS.map((/** @type {string} */ n) => ({ line: 1, key: `L1.fact.${n}`, from: 'look', by: 'agent', kind: 'fact', state: 'built', part: { line: 1, part: 0 }, facts: [n] })),
  { line: 1, key: 'L1.$floor', from: 'default', by: 'default', kind: 'floor', state: 'built' },
  { line: 0, key: 'J.$guard.changed-from-seed', from: 'default', by: 'default', kind: 'guard', state: 'built' },
];
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('the spine\'s outer close records a result per row of the signed list: every fact row, the floor and the guard passed (real mve5y8fa, green)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'onelist-run-'));
  made.push(d);
  const file = join(d, 'flights.txt');
  writeFileSync(file, PAGE);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'flights', value: file }], into: join(d, 'seed') });
  if (!r.ok) throw new Error('unreachable');
  const job = { ...SPEC, provider: 'anthropic-api', inputs: [{ n: 1, label: 'flights', value: file }], closeDecl: { ...SPEC.closeDecl, list: LIST } };
  delete job.baseUrl; delete job.model;
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: STAGE.name }] }] });
  const provider = scriptedProvider([
    { text: 'input/flights.txt holds the page' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(r.prep.tree, 'output', 'steps', '1.json'), content: STEP } }] },
    { text: 'wrote' },
  ]);
  const spinePath = join(d, 'spine.jsonl');
  const outcome = await runJob(job, { approvals: [{ specHash: jobSpecHash(job), signer: 'hamr', ts: 'now' }], workdir: r.prep.tree, provider, emit: makeSpine(spinePath) });
  assert.equal(outcome, 'green');
  const oc = readSpine(spinePath).findLast((e) => e.type === 'outer-close');
  const by = Object.fromEntries(oc.stages.flatMap((/** @type {any} */ s) => (s.rows ?? []).map((/** @type {any} */ x) => [x.key, x.result])));
  assert.deepEqual(by, { 'J.$guard.changed-from-seed': 'passed', ...Object.fromEntries(LIST.filter((x) => x.line === 1).map((x) => [x.key, 'passed'])) });
});
