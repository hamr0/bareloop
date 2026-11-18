// S5 test world: the REAL engine (`main --spec`, in-process, scripted worker, $0) on a sheet job whose close is built by the real CheckBlock (so the signed spec carries the one list and the sheet part), laid out the way a
// panel-authored run is (<dir>/resolved-spec.json, <dir>/source-seed/{source.json,tree/,<job>-bareloop/u-<id>.jsonl}) with an injected scratch HOME. Never writes outside its scratch dirs.
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveRubricInputs } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { rubricGoal } from '../src/rubricstep.js';
import { CheckBlock } from '../src/checkblock.js';
import { buildSheetChecks } from '../src/sheetbuild.js';
import { parseCsv, sheetTable } from '../src/csv.js';
import { scriptedProvider } from './helpers.js';
import { track } from './tmp-track.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXPENSES = join(HERE, 'fixtures', 'sheets', 'expenses.csv');
export const PLANTED = 'PLANTED-CELL-STRING-9X';
const SPEC0 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));
const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const LINE = { n: 1, text: 'List the big expenses and what they add up to', rule: 'Amount over 500', rules: ['Amount over 500'] };
const SUGG = [
  { line: 1, rule: 'cells', table: 'expenses', claim: 'over', op: 'rows', where: W500, covers: [1] },
  { line: 1, rule: 'cells', table: 'expenses', claim: 'n', op: 'countIf', where: W500, covers: [] },
];
const cells = (/** @type {string} */ l) => { const out = []; let c = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };

/** @param {string} csv the sheet's text @returns {number[]} the sheet rows whose Amount is over 500 (header = row 1) */
export function overRows(csv) {
  return csv.split('\n').filter((l) => l !== '').map(cells).map((c, i) => ({ row: i + 1, a: Number(c[2].replaceAll(',', '')) })).slice(1).filter((d) => d.a > 500).map((d) => d.row);
}

/**
 * Run the expenses sheet job once. `named` = the rows the scripted worker names; `claimN` = the count it claims (the second check's value is the worker's own).
 * @param {{named?: number[], planted?: boolean}} [o]
 */
export async function runSheetJob({ named, planted = true } = {}) {
  const dir = track(mkdtempSync(join(tmpdir(), 'sheet-s5-')));
  const csvText = readFileSync(EXPENSES, 'utf8');
  const csv = planted ? csvText.replace('item 8,595.74', `${PLANTED},595.74`) : csvText;
  const csvPath = join(dir, 'expenses.csv');
  writeFileSync(csvPath, csv);
  const over = overRows(csv);
  const into = join(dir, 'source-seed');
  const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'expenses', value: csvPath }], into, destination: join(dir, 'out') });
  if (!prep.ok) throw new Error(JSON.stringify(prep));
  const table = sheetTable(parseCsv(csv));
  const b = new CheckBlock({ texts: { expenses: csv }, labels: ['expenses'], asks: false, split: true });
  b.fromJob([LINE]);
  b.setGuards(['changed-from-seed'], ['output/']);
  b.setSheetLines([1]);
  b.reconcile();
  b.setSheet(await buildSheetChecks({ lines: [LINE], tables: { expenses: table }, suggestions: SUGG }));
  const v = b.closeView();
  const closeDecl = { ...SPEC0.closeDecl, stages: [...SPEC0.closeDecl.stages.filter((/** @type {any} */ x) => x.kind !== 'rubric-step'), ...v.stages.filter((/** @type {any} */ x) => x.kind === 'rubric-step')], list: v.list };
  delete closeDecl.picks;
  const jobLines = [LINE];
  const spec = {
    ...SPEC0, job: 'expenses-sheet', jobLines, inputs: [{ n: 1, label: 'expenses', value: csvPath }], provider: 'anthropic-api', closeDecl,
    goal: rubricGoal({ jobLines, files: prep.prep.manifest.inputs, closeDecl }),
  };
  delete spec.baseUrl; delete spec.model;
  const claimName = (/** @type {number} */ i) => v.stages.find((/** @type {any} */ s) => s.params?.step === 1).params.parts.find((/** @type {any} */ p) => p.class === 'sheet').checks[i].claim;
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const claims = { [claimName(0)]: { rows: named ?? over } };
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }] }] });
  const step = JSON.stringify({ text: `Over 500: ${over.length} rows`, claims });
  const provider = scriptedProvider([
    { text: 'input/expenses.csv holds the sheet' }, { text: plan },
    { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: step } }] },
    { text: 'wrote' },
  ]);
  const home = track(mkdtempSync(join(tmpdir(), 'sheet-s5-home-')));
  /** @type {string[]} */ const out = [];
  /** @type {string[]} */ const err = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home });
  if (rc !== 0 && !existsSync(join(home, 'runs.jsonl'))) throw new Error(`run failed rc=${rc}\n${err.join('\n')}\n${out.join('\n')}`);
  const runs = readFileSync(join(home, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.runid);
  return { rc, out: out.join('\n'), err: err.join('\n'), dir, into, tree: prep.prep.tree, home, spec, over, csv, runid: runs[0]?.runid, claimName, files: readdirSync(dir) };
}
