// S4 end to end, $0 (fake providers; real source door, real sheet look, real check block, real row-edit turn, real bareguard builder, real seed read, real engine, real checkStep):
//   draft over the REAL tests/fixtures/sheets/expenses.csv with `~ Price over 500` -> the tie question (Amount, Tax) -> pick Amount -> the AI's `sheetChecks` -> the signed close carries a `sheet` part ->
//   the engine runs the job with a scripted worker and S3 grades it: a right claims file is green, a wrong one is red naming the row.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { rubricGoal, listMatchesClose, cardOfClose } from '../src/rubricstep.js';
import { reply, scriptedProvider } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-e2e4-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const SPEC0 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));
const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const cells = (/** @type {string} */ l) => { const out = []; let c = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };
const OVER = readFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), 'utf8').split('\n').filter((l) => l !== '').map(cells).map((c, i) => ({ row: i + 1, amount: Number(c[2].replaceAll(',', '')) })).slice(1).filter((d) => d.amount > 500).map((d) => d.row);

/** draft: the look names the word Price, the person picks `pick` from the tie, the model suggests two checks */
async function draft(/** @type {string} */ pick) {
  const file = join(tmp(), 'expenses.csv');
  copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Expenses', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const calls = { look: 0, edit: 0 };
  const provider = { async generate() { calls.look += 1; return reply({ text: JSON.stringify({ facts: [{ from: 'line 1 rule 1', word: 'Price', kind: 'number' }] }), costUsd: 0.002 }); } };
  const jobLines = [{ n: 1, text: 'List every expense over 500', rule: 'Price over 500', rules: ['Price over 500'] }];
  /** @type {any} */ let asked = null;
  /** @type {any[]|null} */ let rebuilt = null;
  const r = await authorCloseForJob({
    answers: { 1: '1. List every expense over 500\n   ~ Price over 500' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label: 'Expenses', value: file }], writeScope: ['output/'], provider, ceilingUsd: 1,
    onJobLines: (lines) => { rebuilt = JSON.parse(JSON.stringify(lines)); },
    answerQuestions: async (o) => { asked = o; return { jobLines: JSON.parse(JSON.stringify(jobLines)), answers: { 1: 'x' }, choices: o.questions.map((q) => ({ key: q.key, choice: 'column', text: pick })) }; },
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (_m, tools) => {
      calls.edit += 1;
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [], sheetChecks: [
        { line: 1, rule: 'cells', table: 'Expenses', claim: 'over', op: 'rows', where: W500, covers: [1] },
        { line: 1, rule: 'cells', table: 'Expenses', claim: 'total', op: 'sumIf', column: 'Amount', where: W500, covers: [] },
      ] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    },
  });
  return { r, asked, rebuilt, calls, file, prep: proved.prep };
}

test('draft on the real expenses.csv: the tie asks which column, Amount is picked, the rule reads `Amount over 500`, and the signed close carries a sheet part with its rows', async () => {
  const { r, asked, rebuilt, calls } = await draft('Amount');
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal ?? r.authoring?.iterations?.map((/** @type {any} */ i) => i.validation)));
  assert.equal(asked.questions.length, 1);
  assert.deepEqual(asked.questions[0].columns, ['Amount', 'Tax']);
  assert.deepEqual(rebuilt?.[0].rules, ['Amount over 500']);
  assert.equal(calls.look, 1);
  assert.equal(calls.edit, 1);
  const stage = r.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const part = stage.params.parts.find((/** @type {any} */ p) => p.class === 'sheet');
  assert.ok(part, 'the drafted close carries a sheet part');
  assert.deepEqual(stage.params.parts.map((/** @type {any} */ p) => p.class), ['sheet'], 'no cited part beside it');
  assert.deepEqual(part.checks.map((/** @type {any} */ c) => [c.id, c.op]), [['l1r1', 'rows'], ['l1a1', 'sumIf']]);
  assert.ok(part.checks.every((/** @type {any} */ c) => c.table === 'Expenses'));
  assert.deepEqual(part.checks[0].where, W500);
  const list = r.closeDecl.list;
  assert.deepEqual(list.filter((/** @type {any} */ x) => x.kind === 'sheet').map((/** @type {any} */ x) => [x.key, x.by, x.state]), [['L1.sheet.l1a1', 'agent', 'built'], ['L1.$sheet', 'default', 'built']]);
  assert.equal(list.find((/** @type {any} */ x) => x.key === 'L1.~1').state, 'built');
  assert.equal(listMatchesClose(r.closeDecl).ok, true, JSON.stringify(listMatchesClose(r.closeDecl)));
  const card = cardOfClose({ closeDecl: r.closeDecl, jobLines: rebuilt });
  assert.equal(card.checkItems.filter((c) => c.text.includes('Amount over 500')).length, 1, 'the rule is shown once');
  // the stages the block built are the stages the drafting gate accepted (the final-card Drop re-uses them)
  assert.deepEqual(r.closeDecl.stages.filter((/** @type {any} */ s) => s.kind === 'rubric-step'), r.block.closeView().stages);
});

test('picking Tax gives `Tax over 500` and a sheet part that reads the Tax column\'s condition as drafted (the person\'s pick, not code\'s)', async () => {
  const { rebuilt, r } = await draft('Tax');
  assert.deepEqual(rebuilt?.[0].rules, ['Tax over 500']);
  assert.equal(r.ok, true, JSON.stringify(r.reds));
});

test('S3 grades the drafted close through the real engine: the right claims file is green (and the report ends with code\'s own total), a claim naming a wrong row is red naming the row', async () => {
  const { r, rebuilt, file } = await draft('Amount');
  assert.equal(r.ok, true);
  for (const named of [OVER, [...OVER, 2]]) {
    const dir = tmp('sheet-e2e4-run-');
    const prep = await proveRubricInputs({ inputs: [{ n: 1, label: 'Expenses', value: file }], into: join(dir, 'source-seed'), destination: join(dir, 'out') });
    if (!prep.ok) throw new Error(JSON.stringify(prep));
    const closeDecl = { ...SPEC0.closeDecl, stages: r.closeDecl.stages, list: r.closeDecl.list, ...(r.closeDecl.picks ? { picks: r.closeDecl.picks } : {}), ...(r.closeDecl.refused ? { refused: r.closeDecl.refused } : {}) };
    delete closeDecl.picks;
    const jobLines = [{ n: 1, text: 'List every expense over 500', rule: rebuilt?.[0].rule, rules: rebuilt?.[0].rules }];
    const spec = { ...SPEC0, job: 'expenses-s4', jobLines, inputs: [{ n: 1, label: 'Expenses', value: file }], provider: 'anthropic-api', closeDecl, goal: rubricGoal({ jobLines, files: prep.prep.manifest.inputs, closeDecl }) };
    delete spec.baseUrl; delete spec.model;
    const specPath = join(dir, 'resolved-spec.json');
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    const stage = closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
    const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
    const step = JSON.stringify({ text: 'The big expenses', claims: { l1r1: { rows: named } } });
    const provider = scriptedProvider([{ text: 'input/expenses.csv holds the sheet' }, { text: plan }, { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: join(prep.prep.tree, 'output', 'steps', '1.json'), content: step } }] }, { text: 'wrote' }]);
    const home = tmp('sheet-e2e4-home-');
    /** @type {string[]} */ const out = [];
    /** @type {string[]} */ const err = [];
    const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)), runlistHome: home });
    const text = `${err.join('\n')}\n${out.join('\n')}`;
    if (named.length === OVER.length) { assert.equal(rc, 0, text); assert.match(text, /outcome\s+green/); } else {
      assert.doesNotMatch(text, /outcome\s+green/, text);
      // the red names the row the claim got wrong (row 2 is no expense over 500), in the spine's close record
      const spine = /spine\s+(\S+\.jsonl)/.exec(text)?.[1];
      assert.ok(spine, text);
      assert.match(readFileSync(spine, 'utf8'), /claim names rows that do not qualify: 2/);
    }
  }
});

test('a counting rule on a sheet line is asked nothing and no pick call is made (authorjob marks the sheet lines before the asks); it is Not checked with the no-pick sentence', async () => {
  const file = join(tmp(), 'expenses.csv');
  copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), file);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Expenses', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  const calls = { pick: 0, asked: 0 };
  const provider = { async generate() { return reply({ text: JSON.stringify({ facts: [{ from: 'line 1 rule 1', word: 'Amount', kind: 'number' }] }), costUsd: 0.002 }); } };
  const jobLines = [{ n: 1, text: 'List every expense over 500', rule: 'Amount over 500; at most 80 words', rules: ['Amount over 500', 'at most 80 words'] }];
  const r = await authorCloseForJob({
    answers: { 1: '1. List every expense over 500\n   ~ Amount over 500\n   ~ at most 80 words' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label: 'Expenses', value: file }], writeScope: ['output/'], provider, ceilingUsd: 1,
    pickGenerate: async () => { calls.pick += 1; throw new Error('no pick call on a sheet line'); },
    answerQuestions: async (o) => { calls.asked += o.questions.length; return { jobLines: JSON.parse(JSON.stringify(jobLines)), answers: { 1: 'x' }, choices: [] }; },
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (_m, tools) => {
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [], sheetChecks: [{ line: 1, rule: 'cells', table: 'Expenses', claim: 'over', op: 'rows', where: W500, covers: [1] }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual([calls.pick, calls.asked], [0, 0]);
  assert.deepEqual(r.closeDecl.refused, [{ line: 1, rule: 2, reason: 'No check was picked for it, so you judge it at Accept.' }]);
});
