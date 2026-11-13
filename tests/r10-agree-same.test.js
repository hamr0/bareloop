// F318 live run mwc2u3yh: answering "agree" to "I propose at most 80 words" on the rule "at most 80 words" added a second identical ~ line. Agreeing to a reading that is the
// rule's own words (case, spacing, trailing punctuation aside) adds no line and the pick cites the existing rule; agreeing to DIFFERENT words still adds one.
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

async function agreeOn(rule) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
  /** @type {any[]} */ const legs = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-same', jobText: `1. Summarise the latest release\n~ ${rule}`,
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('r10-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    pickGenerate: async (_m, tools) => {
      await tools.find((t) => t.name === SUGGEST_TOOL).execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  session.send('agree');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => legs.length === 1));
  return legs[0];
}

test('F318 (3) agree to the rule\'s own words adds no second ~ line; the pick cites the existing rule', async () => {
  const leg = await agreeOn('at most 80 words');
  assert.deepEqual(leg.jobLines[0].rules, ['at most 80 words']);
  assert.equal(leg.jobLines[0].rule, 'at most 80 words');
  // the pick sits on the existing rule's row: one `~` row, no follower row (F318 (3), the block's `follow`)
  const rows = leg.block.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(rows.map((r) => [r.line, r.rule, r.pick ?? null]), [[1, 1, { rule: 'maxWords', value: 80 }]]);
});

test('F318 (3) the same words in another case, spacing and with a full stop are still the same rule', async () => {
  const leg = await agreeOn('At  most 80 WORDS.');
  assert.deepEqual(leg.jobLines[0].rules, ['At  most 80 WORDS.']);
});

test('F318 (3) agree to DIFFERENT words still adds the ~ line (hamr: agreeing to a reading adds a line)', async () => {
  const leg = await agreeOn('under 80 words');
  assert.deepEqual(leg.jobLines[0].rules, ['under 80 words', 'at most 80 words']);
});
