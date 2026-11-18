// REUSE of a signed SHEET job (hamr's live walk 2026-11-18, $0): Reuse skips the author loop, which is where a draft records the sheet's table fingerprint
// (`recordSheetShas`) before the signing gates, so the gates refused with "this run recorded no table fingerprint". Real prepareSigning (no stub), real source door, scripted model for the fresh draft only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, buildReuseSpec } from '../src/panel/authorsession.js';
import { workflowKey } from '../src/job.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-reuse-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (/** @type {() => boolean} */ fn, ms = 20000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };
const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const SUGGESTIONS = [
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'over', op: 'rows', where: W500, covers: [1] },
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'total', op: 'sumIf', column: 'Amount', where: W500, covers: [] },
];
const SHA = /^[0-9a-f]{64}$/;
const home = () => { const h = tmp('sheet-reuse-home-'); writeFileSync(join(h, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(h, 'config.json'), JSON.stringify(ANTH_CFG)); return h; };
const csv = () => { const f = join(tmp(), 'expenses.csv'); copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), f); return f; };
const sourceJson = (/** @type {any} */ s) => JSON.parse(readFileSync(join(s.state.outDir, 'source-seed', 'source.json'), 'utf8'));

test('Reuse of a signed sheet rubric job reaches the signable phase through the REAL signing gates, and records the same table fingerprint a fresh draft records', async () => {
  const file = csv();
  const card = { checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'sheet-reuse-job', jobText: '1. List every expense over 500 and what they add up to\n~ Amount over 500', inputs: `Expenses: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1 };
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Expenses' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const PLAN = { goal: 'List the expenses over 500.', checks: [], notChecked: [], questions: [] };
  const env = { ANTHROPIC_API_KEY: 'fake-not-a-real-key' };
  // fresh draft (the control): real prepareSigning
  const draft = createSession(card, {
    env, home: home(), sessionsRoot: tmp('sheet-reuse-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    ledgerGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } }; },
    confirmGenerate: async (/** @type {any} */ _c, /** @type {any[]} */ tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [], sheetChecks: SUGGESTIONS }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  assert.ok(await until(() => draft.state.pendingAsk?.kind === 'menu'), `${draft.state.phase} / ${draft.state.error}`);
  assert.equal(draft.signPrepare().ok, true);
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(draft.state.phase)));
  assert.equal(draft.state.phase, 'prepared', String(draft.state.error));
  const drafted = sourceJson(draft).inputs[0].tableSha;
  assert.match(drafted, SHA, 'the draft records the fingerprint');
  const origin = JSON.parse(readFileSync(draft.state.resolvedSpecPath, 'utf8'));
  assert.ok(origin.closeDecl.stages.some((/** @type {any} */ s) => s.kind === 'rubric-step'));

  // Reuse: no author loop, the same real signing gates
  const file2 = csv();
  const reuseSpec = buildReuseSpec(origin, { ...card, inputs: `Expenses: ${file2}`, destination: join(tmp(), 'delivered2') }, null);
  const reuse = createSession({ ...card, inputs: `Expenses: ${file2}` }, {
    env, home: home(), sessionsRoot: tmp('sheet-reuse-sess-'),
    reuse: { spec: reuseSpec, workflowKey: workflowKey(origin) },
    generate: async () => { throw new Error('a reuse must never call the model'); },
    confirmGenerate: async () => { throw new Error('a reuse must never call the model'); },
    authorFn: async () => { throw new Error('a reuse must never author'); },
  });
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(reuse.state.phase)));
  assert.equal(reuse.state.phase, 'prepared', `${reuse.state.error} ${JSON.stringify(reuse.state.messages?.slice(-2))}`);
  assert.match(sourceJson(reuse).inputs[0].tableSha, SHA, 'the reuse records the fingerprint before the gates');
  assert.equal(sourceJson(reuse).inputs[0].tableSha, drafted, 'same CSV, same fingerprint as the fresh draft');
});
