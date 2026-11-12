// hamr 2026-11-12 (live draft session smwe2qz5g3xrq, "List 3 flights from Boston to Chicago" with two ~ rules): the CheckBlock built both ~ rules, a result count and two look facts and marked the
// `$cited` row Not checked, but the confirm card showed only "AI's summary", the job line, "How the page was read" and "Always checked": it read the confirm turn's own plan (empty for a rubric job),
// not the block's rows. The card now draws the rows through the signed card's own readers. The look is the REAL runPageMap over the session's saved page lines with the session's own saved reply.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { runPageMap } from '../src/pagemap.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG, reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(HERE, 'fixtures', 'confirm-card', 'smwe2qz5g3xrq.json'), 'utf8'));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'confirm-card-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

/** the confirm card of a session over the real saved page, the real page map and the session's own count suggestion */
async function confirmCard() {
  const map = await runPageMap({
    texts: { flights: fx.page }, inputs: [{ n: 1, label: 'flights' }], jobLines: fx.jobLines, sleep: async () => {}, onCall: () => {},
    provider: { async generate() { return reply({ text: JSON.stringify({ facts: fx.pageMapFacts }), costUsd: 0.001 }); } },
  });
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look: map.facts.look } };
  const home = tmp('confirm-card-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const file = join(tmp(), 'flights.txt');
  writeFileSync(file, fx.page);
  const PLAN = { goal: 'List 3 flights from Boston to Chicago.', checks: [], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'confirm-card-job', jobText: '1. List 3 flights from Boston to Chicago\n~ under $450\n~ departure between 05:00 and 21:59', inputs: `flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('confirm-card-sess-'),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    ledgerGenerate: async (_m, tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [{ line: 1, kind: 'count', min: 3, max: 3 }] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } }; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  const msg = [...session.state.messages].reverse().find((m) => m.kind === 'plan');
  session.signPrepare?.();
  return /** @type {any} */ (msg).plan;
}

test('the confirm card draws every row the block built under its line, and every Not checked row with its reason (session smwe2qz5g3xrq)', async () => {
  const plan = await confirmCard();
  const built = fx.ledgerRows.filter((/** @type {any} */ r) => r.state === 'built' && r.rowKind !== 'floor');
  const notChecked = fx.ledgerRows.filter((/** @type {any} */ r) => r.state === 'not-checked');
  assert.equal(built.length, 5, 'the session built two ~ rules, two look facts and a count');
  assert.equal(notChecked.length, 1);
  const names = plan.lines[0].checks.map((/** @type {any} */ c) => c.name);
  // each built row, by what the signed card's readers say it is: a ~ rule is the fact it limits, a look fact its name, the count its range
  const shows = {
    'L1.~1': /^fact · price .*at most 450/, 'L1.~2': /^fact · departure time .*between 05:00 and 21:59/,
    'L1.fact.origin airport': /^fact · origin airport .*Boston Logan International Airport/, 'L1.fact.destination airport': /^fact · destination airport .*Chicago O'Hare International Airport/,
    'L1.count.3-3': /^fact · results — exactly 3 results/,
  };
  for (const r of built) assert.ok(names.some((/** @type {string} */ n) => /** @type {RegExp} */ (/** @type {any} */ (shows)[r.key]).test(n)), `${r.key} is not on the card: ${JSON.stringify(names)}`);
  assert.equal(names.length, built.length, 'one card row per built row, no more');
  for (const r of notChecked) assert.ok(plan.notChecked.some((/** @type {string} */ n) => n.includes(r.reason)), `${r.key} (${r.reason}) is not under Not checked: ${JSON.stringify(plan.notChecked)}`);
});
