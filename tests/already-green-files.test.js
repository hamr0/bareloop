// An `already-green` ending DELIVERS on a plain-folder (files source) job like a `green` (live bug class, run mwvwcxvy: a Stop in a leftover step, Resume,
// the close precheck passes -> already-green; the run counts as a pass, so what it produced must land at Destination). The real engine (`main --spec`,
// in-process) on the sheet-CSV rubric job of tests/sheet-run-e2e.test.js, a scripted worker, a scratch HOME. $0: the provider is the scripted seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveRubricInputs, copyOut } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { rubricGoal } from '../src/rubricstep.js';
import { buildSheetPart } from '../src/sheetclaims.js';
import { readRunList } from '../src/runlist.js';
import { stopFilePath } from '../src/legs.js';
import { scriptedProvider, reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPENSES = join(HERE, 'fixtures', 'sheets', 'expenses.csv');
const SPEC0 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));
const WHERE = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const cells = (/** @type {string} */ l) => { const out = []; let c = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };
const OVER = readFileSync(EXPENSES, 'utf8').split('\n').filter((l) => l !== '').map(cells).map((c, i) => ({ row: i + 1, amount: Number(c[2].replaceAll(',', '')) })).slice(1).filter((d) => d.amount > 500).map((d) => d.row);
const ANSWER = JSON.stringify({ text: 'the big expenses', claims: { l1r1: { rows: OVER } } });

async function world(/** @type {import('node:test').TestContext} */ t) {
  const dir = mkdtempSync(join(tmpdir(), 'ag-files-'));
  const home = mkdtempSync(join(tmpdir(), 'ag-files-home-'));
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });
  const dest = join(dir, 'out');
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], into, destination: dest });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const checks = [{ id: 'l1r1', rule: 'cells', table: 'expenses', claim: 'l1r1', op: 'rows', where: WHERE, covers: [1] }];
  const base = SPEC0.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const stage = { ...base, params: { step: 1, parts: [buildSheetPart({ text: 'rows over 500', checks })] } };
  const closeDecl = { ...SPEC0.closeDecl, stages: SPEC0.closeDecl.stages.map((/** @type {any} */ s) => (s.kind === 'rubric-step' ? stage : s)) };
  delete closeDecl.list; delete closeDecl.picks;
  const jobLines = [{ n: 1, text: 'List the big expenses', rule: '' }];
  const spec = { ...SPEC0, job: 'expenses-sheet', jobLines, inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], provider: 'anthropic-api', closeDecl, goal: rubricGoal({ jobLines, files: prep.prep.manifest.inputs, closeDecl }) };
  delete spec.baseUrl; delete spec.model;
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
  const tree = prep.prep.tree;
  const putAnswer = () => { mkdirSync(join(tree, 'output', 'steps'), { recursive: true }); writeFileSync(join(tree, 'output', 'steps', '1.json'), ANSWER); };
  /** @param {string[]} args @param {any} provider */
  const go = async (args, provider) => {
    /** @type {string[]} */ const out = [];
    const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec), ...args], { provider, env: {}, out: (/** @type {any} */ s) => out.push(String(s)), err: () => {}, runlistHome: home });
    return { rc, out: out.join('\n') };
  };
  return { dir, home, dest, into, tree, plan, putAnswer, go };
}
const spineRecords = (/** @type {string} */ out) => { const p = /^spine\s+(\S+)/m.exec(out)?.[1]; return p ? readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; };

test('a RESUMED already-green files-source run copies what its tree holds to Destination and records destination-written', async (t) => {
  const w = await world(t);
  /** @type {string|null} */ let spine = null;
  let calls = 0;
  const leg1 = { name: 'queue', async generate() { calls += 1; if (calls === 2) { spine = readRunList({ home: w.home }).rows[0].spine; writeFileSync(stopFilePath(spine), ''); } return reply(calls === 1 ? { text: 'scout notes' } : { text: w.plan }); } };
  const o1 = await w.go([], leg1);
  assert.match(o1.out, /outcome\s+stopped/, o1.out);
  assert.ok(spine);
  assert.equal(existsSync(w.dest), false, 'nothing delivered by a stopped leg');
  w.putAnswer(); // the answer is in the tree, so on resume the close already passes
  const o2 = await w.go(['--resume', spine], scriptedProvider([{ text: 'never reached' }]));
  assert.equal(o2.rc, 0, o2.out);
  assert.match(o2.out, /outcome\s+already-green/, o2.out);
  const written = spineRecords(o2.out).filter((e) => e.type === 'destination-written');
  assert.deepEqual(written.map((e) => e.path.slice(e.path.lastIndexOf('.'))).sort(), ['.json', '.md'], 'the step file and the one run report, as a green delivers');
  assert.equal(readdirSync(join(w.dest, 'steps')).length, 1, 'the step file landed at Destination');
  assert.equal(readFileSync(join(w.dest, 'steps', readdirSync(join(w.dest, 'steps'))[0]), 'utf8'), ANSWER);
});

// A COLD already-green on a files source cannot be staged end to end: the run resets the tree to its seed at start (an untracked output/ is wiped), and a rubric close needs the
// worker's output file, so the close never passes on a seed. What a cold already-green WOULD reach is copyOut over a tree with no output, proven here: a plain-words refusal, nothing written.
test('copyOut over a tree with NO worker output (nothing under output/) throws nothing and writes nothing: it refuses in plain words', async (t) => {
  const w = await world(t);
  const co = await copyOut({ tree: w.tree, into: w.into, destination: w.dest });
  assert.equal(co.files?.length ?? 0, 0);
  assert.equal(typeof co.stop, 'string');
  assert.match(String(co.stop), /no non-empty file exists under/);
  assert.deepEqual(existsSync(w.dest) ? readdirSync(w.dest, { recursive: true }) : [], [], 'no junk file at Destination');
});
