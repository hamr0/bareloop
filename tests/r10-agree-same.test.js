// One rule in, one rule out (hamr 2026-11-14; replaces the F318 dedupe, live runs mwc2u3yh and mwgjnrkz). An answer REPLACES the rule it was asked about, so the job text never holds two rules from one
// Agree; a rule whose own words ARE the check ("at most 80 words", case, spacing and a full stop aside) is settled as written and asks nothing, so a replaced rule never re-asks on a re-draft.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { SUGGEST_TOOL } from '../src/checkpick.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'r10-same-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const keysHome = () => { const d = tmp('r10-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

/** @param {string} rule the job's one ~ rule @param {{send?: string|null, jobText?: string}} [o] `send`: the answer typed (null = nothing is asked and the draft goes straight to the menu) */
async function draftWith(rule, { send = 'agree', jobText = `1. Summarise the latest release\n~ ${rule}` } = {}) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
  /** @type {any[]} */ const legs = [];
  let suggestCalls = 0;
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-same', jobText,
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('r10-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    pickGenerate: async (_m, tools) => {
      suggestCalls += 1;
      await tools.find((t) => t.name === SUGGEST_TOOL).execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  let asked = 0;
  if (send !== null) {
    assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
    asked = 1;
    session.send(send);
  }
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error} / ${JSON.stringify(session.state.pendingAsk)}`);
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => legs.length === 1));
  return { leg: legs[0], session, asked, suggestCalls };
}

test('agree to different words REPLACES the rule: one rule in the job text, the rows and the signed rows (live run mwgjnrkz showed two)', async () => {
  const { leg, session } = await draftWith('under 80 words');
  assert.deepEqual(leg.jobLines[0].rules, ['at most 80 words']);
  assert.equal(leg.jobLines[0].rule, 'at most 80 words');
  assert.equal(session.state.card.jobText, '1. Summarise the latest release\n~ at most 80 words');
  const rows = leg.block.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(rows.map((r) => [r.line, r.rule, r.text, r.pick ?? null]), [[1, 1, 'at most 80 words', { rule: 'maxWords', value: 80 }]]);
  assert.deepEqual(leg.block.signedRows().filter((r) => r.kind === 'rule').map((r) => [r.rule, r.state]), [[1, 'built']]);
});

test('typed words replace the asked rule the same way: one rule, the typed one', async () => {
  const { leg, session } = await draftWith('under 80 words', { send: 'at most 60 words' });
  assert.deepEqual(leg.jobLines[0].rules, ['at most 60 words']);
  assert.equal(session.state.card.jobText, '1. Summarise the latest release\n~ at most 60 words');
  assert.deepEqual(leg.block.rows.filter((r) => r.kind === 'rule').map((r) => [r.rule, r.text]), [[1, 'at most 60 words']]);
});

test('no obvious asks: a rule whose own words are the check (in another case, spacing, with a full stop) asks nothing and is built as written', async () => {
  for (const rule of ['at most 80 words', 'At  most 80 WORDS.']) {
    const { leg, asked, suggestCalls } = await draftWith(rule, { send: null });
    assert.deepEqual([asked, suggestCalls], [0, 0], rule);
    assert.deepEqual(leg.jobLines[0].rules, [rule]);
    assert.deepEqual(leg.block.rows.filter((r) => r.kind === 'rule').map((r) => [r.rule, r.state, r.pick?.rule]), [[1, 'built', 'maxWords']], rule);
  }
});

test('a re-draft from the replaced job text asks NOTHING for that rule (count asks = 0), and makes no suggestion call', async () => {
  const first = await draftWith('under 80 words');
  const again = await draftWith('', { send: null, jobText: first.session.state.card.jobText });
  assert.deepEqual([again.asked, again.suggestCalls], [0, 0]);
  assert.deepEqual(again.leg.jobLines[0].rules, ['at most 80 words']);
});
