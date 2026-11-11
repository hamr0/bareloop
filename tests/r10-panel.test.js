// R10 (fwd am16) through the REAL panel session: the pick asks come through the ordinary ask path in fwd's words, `agree` writes the plain words as a ~ rule and picks the check,
// "drop it" and own words leave Not checked, and every pick is recorded in the drafting log (the suggestion call too, its cost booked, its answer logged). No network: the model
// is a script that can only deliver a tool call.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
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
const tmp = (p = 'r10-panel-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const keysHome = () => { const d = tmp('r10-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

test('the panel: a proposal and a can\'t-check are asked in fwd\'s words; agree writes the plain words as a ~ rule; the picks reach the drafter; the draft log holds the call and each pick', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
  /** @type {any[]} */ const legs = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-job', jobText: '1. Summarise the latest release\n~ under 80 words\n~ be nice',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('r10-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    pickGenerate: async (_m, tools) => {
      await tools.find((t) => t.name === SUGGEST_TOOL).execute({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }, { line: 1, guardrail: 2, rule: 'none' }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => { const P = { goal: 'g', checks: [], notChecked: [], questions: [] }; await tools[0].execute(P); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  const said = () => session.state.messages.filter((/** @type {any} */ m) => m.role === 'bot').at(-1).text;
  assert.match(said(), /\(1 of 2\), about job line 1: Line 1, guardrail "under 80 words": I propose at most 80 words\. Answer "agree" to use it/);
  assert.equal(legs.length, 0, 'asked before any draft');
  session.send('agree');
  assert.ok(await until(() => /\(2 of 2\)/.test(said())));
  assert.match(said(), /Line 1, guardrail "be nice": I can't check this\. Your own words, or Not checked\?/);
  session.send('drop it');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), 'then the plan is confirmed as usual');
  // the plan menu (before signing) draws the agreed pick once, as a `[you picked]` row
  const menuPlan = session.state.messages.filter((/** @type {any} */ m) => m.kind === 'plan').at(-1).plan;
  assert.deepEqual(menuPlan.lines[0].picked, ['at most 80 words']);
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => legs.length === 1));
  assert.deepEqual(legs[0].jobLines[0].rules, ['under 80 words', 'be nice', 'at most 80 words']);
  assert.deepEqual(legs[0].checkPicks.picks, [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }]);
  assert.deepEqual(legs[0].checkPicks.left, [{ line: 1, rule: 2 }]);
  const log = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(log.some((e) => e.kind === 'call' && e.label === 'check-suggest' && e.costUsd === 0.0009), 'the suggestion call is booked like a drafting call');
  const picks = log.filter((e) => e.kind === 'check-pick');
  assert.deepEqual(picks.map((e) => [e.rule, e.how]), [[1, 'agree'], [2, 'drop it']]);
  assert.deepEqual(picks[0].picked, { rule: 'maxWords', value: 80 });
});

test('the prepared plan card (through the real drafting loop) has ONE row for the pick (a `[you picked]` check row, no separate "You picked" row), and the unpicked rule under Not checked', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-card', jobText: '1. Summarise the latest release\n~ exactly 3 bullets\n~ be kind', inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('r10-sess-'),
    lookFn: async () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } }),
    pickGenerate: async (_m, tools) => { await tools[0].execute({ checks: [{ line: 1, guardrail: 1, rule: 'listItems', value: 3 }, { line: 1, guardrail: 2, rule: 'none' }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    generate: async (_m, tools) => {
      await tools[0].execute({ stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }, { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'made up', class: 'countable', check: 'maxWords', value: 79, rules: [2] }] } }] });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('agree');
  assert.ok(await until(() => /\(2 of 2\)/.test(session.state.messages.filter((/** @type {any} */ m) => m.role === 'bot').at(-1).text)));
  session.send('drop it');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  assert.deepEqual(session.state.messages.filter((/** @type {any} */ m) => m.kind === 'plan').at(-1).plan.lines[0].picked, ['exactly 3 list items'], 'the plan menu draws the pick once too');
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => session.state.phase === 'prepared'), `${session.state.phase} ${session.state.error}`);
  const plan = session.state.messages.filter((/** @type {any} */ m) => m.kind === 'plan').at(-1).plan;
  assert.deepEqual(plan.lines[0].picked, ['exactly 3 list items']);
  // the pick is drawn once, from `picked`; the drafter's made-up maxWords 79 is not on the card; the one list's own default check (a text line quotes its input) is, tagged [default]
  assert.deepEqual(plan.lines[0].checks.map((c) => [c.name, c.by]), [['every claim is backed by a quote copied from "Changelog"', 'default']]);
  assert.ok(plan.notChecked.some((n) => /"be kind" — You chose to leave it Not checked/.test(n)), JSON.stringify(plan.notChecked));
  // labels: the close's row for the pick is the person's, and the draft log records the checks the draft ended with, each marked
  const logged = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.kind === 'draft-checks');
  assert.deepEqual(logged.map((e) => e.checks.map((c) => [c.line, c.text, c.by])), [[[1, 'the text has exactly 3 list items', 'you']]]);
});
