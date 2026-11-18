// S3 CALL SITES, end to end: the real engine (`main --spec`, in-process) on a rubric spec whose stage carries a `sheet` part over the real tests/fixtures/sheets/expenses.csv, a scripted worker that writes the step file,
// the real source door, real git, real bareguard. Proves the three wirings: run start (freeze + numbered view, src/userrun.js), the stage close (src/kinds.js `runRubricStep`), and delivery (the report's code-computed total).
// $0: the provider is the scripted seam, no key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { rubricGoal } from '../src/rubricstep.js';
import { buildSheetPart } from '../src/sheetclaims.js';
import { scriptedProvider } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPENSES = join(HERE, 'fixtures', 'sheets', 'expenses.csv');
const SPEC0 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));
const WHERE = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const cells = (/** @type {string} */ l) => { const out = []; let c = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };
const data = readFileSync(EXPENSES, 'utf8').split('\n').filter((l) => l !== '').map(cells).map((c, i) => ({ row: i + 1, amount: Number(c[2].replaceAll(',', '')) })).slice(1);
const OVER = data.filter((d) => d.amount > 500).map((d) => d.row);
const OVER_SUM = Math.round(data.filter((d) => d.amount > 500).reduce((s, d) => s + d.amount, 0) * 100) / 100;

async function run(/** @type {import('node:test').TestContext} */ t, /** @type {number[]} */ named, math = true) {
  const dir = mkdtempSync(join(tmpdir(), 'sheet-e2e-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dest = join(dir, 'out');
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], into, destination: dest });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const all = [
    { id: 'l1r1', rule: 'cells', table: 'expenses', claim: 'l1r1', op: 'rows', where: WHERE, covers: [1] },
    { id: 'l1a1', rule: 'cells', table: 'expenses', claim: 'l1a1', op: 'sumIf', column: 'Amount', where: WHERE, covers: [], row: 'agent' },
    { id: 'l1a2', rule: 'cells', table: 'expenses', claim: 'l1a2', op: 'countIf', where: WHERE, covers: [], row: 'agent' },
  ];
  const checks = math ? all : all.slice(0, 1);
  const base = SPEC0.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const stage = { ...base, params: { step: 1, parts: [buildSheetPart({ text: 'rows over 500, their count and total', checks })] } };
  const closeDecl = { ...SPEC0.closeDecl, stages: SPEC0.closeDecl.stages.map((/** @type {any} */ s) => (s.kind === 'rubric-step' ? stage : s)) };
  delete closeDecl.list; delete closeDecl.picks;
  const jobLines = [{ n: 1, text: 'List the big expenses and what they add up to', rule: '' }];
  const spec = {
    ...SPEC0, job: 'expenses-sheet', jobLines, inputs: [{ n: 1, label: 'expenses', value: EXPENSES }], provider: 'anthropic-api', closeDecl,
    goal: rubricGoal({ jobLines, files: prep.prep.manifest.inputs, closeDecl }),
  };
  delete spec.baseUrl; delete spec.model;
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
  const step = JSON.stringify({ text: 'Total 99999.99 over 7 rows', claims: { l1r1: { rows: named }, l1a1: { value: 99999.99 }, l1a2: { value: 7 } } });
  const provider = scriptedProvider([
    { text: 'input/expenses.csv holds the sheet' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: step } }] },
    { text: 'wrote' },
  ]);
  const home = mkdtempSync(join(tmpdir(), 'sheet-e2e-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  /** @type {string[]} */ const err = [];
  /** @type {string[]} */ const out = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home });
  return { rc, err: err.join('\n'), out: out.join('\n'), into, dest, tree: prep.prep.tree, provider };
}

test('run start records the tableSha and writes the numbered view; the close grades the named rows; a green delivers ONE report whose text ends with code\'s own total and count', async (t) => {
  const r = await run(t, OVER);
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  assert.match(r.out, /outcome\s+green/);
  const m = JSON.parse(readFileSync(join(r.into, 'source.json'), 'utf8'));
  assert.match(m.inputs[0].tableSha, /^[0-9a-f]{64}$/, 'run start (src/userrun.js) recorded the fingerprint');
  assert.equal(m.inputs[0].view, 'input/expenses.rows.txt');
  assert.equal(existsSync(join(r.tree, 'input', 'expenses.rows.txt')), true);
  const delivered = readdirSync(join(r.dest, 'steps')).sort();
  // the report is ONE markdown file for the run at the destination root; the step folder holds only the JSON
  assert.equal(delivered.length, 1, `only the JSON in steps/: ${delivered.join(', ')}`);
  assert.equal(delivered.some((f) => f.includes('.total') || f.endsWith('.md')), false);
  const jsonName = delivered[0];
  const mdName = readdirSync(r.dest).find((f) => f.endsWith('.md'));
  assert.match(mdName ?? '', /^expenses-sheet-\d{4}-\d{2}-\d{2}\.md$/, 'one run report named by the job and the day');
  const obj = JSON.parse(readFileSync(join(r.dest, 'steps', jsonName), 'utf8'));
  const md = readFileSync(join(r.dest, mdName), 'utf8');
  // `l1a1` is a box the worker invented (no check of the signed close reads it): left out (hamr 2026-11-18). The worker's own text sits under the not-checked heading WITHOUT code's report lines; code's lines are the Total / Count bullets, in the order of the signed checks.
  assert.match(md, /^# expenses-sheet — run-1\nPassed · \d{1,2} [A-Z][a-z]{2} \d{4}\n\n## 1\. List the big expenses and what they add up to\n\n### Checked by code\n/);
  assert.ok(md.includes(`- Rows where Amount > 500: ${OVER.join(', ')}\n- Total: ${OVER_SUM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n- Count: ${OVER.length}\n\n### The AI's answer (not checked — you judge it at Accept)\nTotal 99999.99 over 7 rows\n`), md);
  assert.ok(md.endsWith('Total 99999.99 over 7 rows\n') && !/computed by code|l1a1/.test(md), 'the report lines are not printed twice');
  // both files are recorded on the spine, each with the sha256 of what was written
  const spineDir = readdirSync(r.into).map((d) => join(r.into, d)).find((d) => readdirSync(d).some((f) => /^u-[a-z0-9]+\.jsonl$/.test(f)));
  assert.ok(spineDir, 'the run\'s spine folder');
  const spine = readFileSync(join(spineDir, readdirSync(spineDir).find((f) => /^u-[a-z0-9]+\.jsonl$/.test(f))), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const written = spine.filter((x) => x.type === 'destination-written');
  assert.equal(written.length, 2);
  for (const w of written) assert.equal(w.sha256, createHash('sha256').update(readFileSync(w.path)).digest('hex'));
  assert.deepEqual(written.map((w) => basename(w.path)).sort(), [jsonName, mdName].sort());
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(obj.text.startsWith('Total 99999.99 over 7 rows\n\n'), 'the worker\'s text is kept as written');
  assert.ok(obj.text.includes(`Total of rows ${OVER.join(', ')}: ${fmt(OVER_SUM)} (computed by code from the rows named)`), obj.text);
  assert.ok(obj.text.endsWith(`Count of rows ${OVER.join(', ')}: ${OVER.length} (computed by code from the rows named)`), 'code\'s lines are at the END of the text');
  assert.equal(JSON.parse(readFileSync(join(r.tree, 'output', 'steps', '1.json'), 'utf8')).text, 'Total 99999.99 over 7 rows', 'the graded tree file is unchanged by delivery');
  assert.equal(existsSync(join(r.tree, 'output', 'steps', '1.total.txt')), false);
});

test('a worker that names the wrong rows does not go green: no delivery', async (t) => {
  const r = await run(t, OVER.slice(1));
  assert.match(r.out, /outcome\s+\S+/);
  assert.doesNotMatch(r.out, /outcome\s+green/, 'the run is not green');
  assert.equal(existsSync(join(r.dest, 'steps')), false, 'nothing delivered on a red');
});

test('REQUEST CONSTRUCTION at the provider boundary: the worker\'s real requests (system + every message the provider received) carry each box\'s example, the claim name and the rows.txt input line, and NOTHING of any check (no op, condition, bound, column, or claim-check text)', async (t) => {
  const r = await run(t, OVER);
  assert.match(r.out, /outcome\s+green/);
  const { rubricVocabulary } = await import('bareguard');
  // what the provider RECEIVED: the system prompts and every non-assistant message (the worker's own scripted replies, echoed back in later turns, are what the worker said, not what it was told)
  const wire = JSON.stringify({ systems: r.provider.systems, messages: r.provider.messagesLog.map((m) => m.filter((x) => x.role !== 'assistant')) });
  assert.ok(r.provider.messagesLog.length >= 3, 'the provider was really called');
  assert.ok(wire.includes(JSON.stringify(rubricVocabulary.rules.cells.ops.rows.example.output.answer).replaceAll('"', '\\"')), 'the rows box example reached the provider');
  assert.ok(wire.includes('l1r1'), 'the claim name reached the provider');
  assert.ok(wire.includes('input/expenses.rows.txt'), 'the numbered-view input line reached the provider');
  assert.match(wire, /numbered by its sheet row/);
  assert.ok(wire.includes('Do not write a total or a count for the rows you name'), 'this step has a sumIf/countIf, so the worker is told code adds them up');
  for (const secret of ['sumIf', 'countIf', 'daysSince', 'noDuplicates', '\\"where\\"', '\\"cmp\\"', '\\"op\\"', 'Amount', 'dateFormats', 'asOf', 'l1a1', 'l1a2']) {
    assert.equal(wire.includes(secret), false, `the provider request carries "${secret}"`);
  }
  assert.equal(/\b500\b/.test(wire), false, 'the bound 500 is not in the request');
});

test('REQUEST CAPTURE: with no sumIf/countIf check the provider request does NOT carry the "do not write totals" line (the line is conditional)', async (t) => {
  const r = await run(t, OVER, false);
  assert.match(r.out, /outcome\s+green/);
  const wire = JSON.stringify({ systems: r.provider.systems, messages: r.provider.messagesLog.map((m) => m.filter((x) => x.role !== 'assistant')) });
  assert.ok(wire.includes('numbered by its sheet row'), 'the sheet brief itself is there');
  assert.equal(wire.includes('Do not write a total or a count'), false);
  const delivered = readdirSync(join(r.dest, 'steps'));
  assert.equal(JSON.parse(readFileSync(join(r.dest, 'steps', delivered[0]), 'utf8')).text, 'Total 99999.99 over 7 rows', 'no sum/count check: the delivered text is the worker\'s, unchanged');
});
