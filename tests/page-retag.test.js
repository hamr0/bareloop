// A limit tagged to the bare line while its ~ rule has no fact is sent back to the AI ONCE (live: run mvqy5oxl's Dell job, draft smvqyl9u3hzum).
// Scripted provider at the `provider.generate` seam; code never edits `from`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runPageMap, askableFromLook, RETAG_CALL_LABEL, MAP_CALL_LABEL } from '../src/pagemap.js';
import { reply } from './helpers.js';

const dell = readFileSync(new URL('./fixtures/pageforms/dell-de.txt', import.meta.url), 'utf8');
const jobLines = [{ n: 1, text: 'List every laptop on the page with its name and price.', rules: ['price is under 1500 euros'] }];
const ans = (/** @type {string} */ from, /** @type {any} */ extra = {}) => JSON.stringify({ facts: [{ name: 'price', from, shape: 'money', words: ['AB', 'Preis'], currency: ['€'], lang: 'de', decimal: ',', ...extra }] });
const READ = { reading: { op: 'lt', value: 1500 } };
const BARE = ans('line 1', READ);
const TAGGED = ans('line 1 rule 1', READ);

function playing(/** @type {any[]} */ steps) {
  const seen = { calls: 0, messages: /** @type {any[]} */ ([]) };
  return {
    seen,
    async generate(/** @type {any[]} */ messages) {
      const s = steps[Math.min(seen.calls, steps.length - 1)];
      seen.calls += 1;
      seen.messages.push([...messages]);
      return reply(s);
    },
  };
}
const go = async (/** @type {any[]} */ steps, /** @type {any} */ extra = {}) => {
  const provider = playing(steps);
  /** @type {any[]} */
  const booked = [];
  const r = await runPageMap({ texts: { Dell: dell }, inputs: [{ n: 1, label: 'Dell' }], jobLines, provider, onCall: (c) => booked.push(c), sleep: async () => {}, ...extra });
  const asks = r.facts ? askableFromLook(r.facts.look, jobLines) : [];
  return { r, provider, booked, asks };
};

test('Dell: a limit tagged to "line 1" is sent back once; the second answer "line 1 rule 1" is used, 2 calls booked, no question', async () => {
  const { r, provider, booked, asks } = await go([{ text: BARE, costUsd: 0.01 }, { text: TAGGED, costUsd: 0.01 }]);
  assert.equal(provider.seen.calls, 2);
  assert.deepEqual(r.calls.map((c) => c.label), [MAP_CALL_LABEL, RETAG_CALL_LABEL]);
  assert.deepEqual(booked.map((c) => c.label), [MAP_CALL_LABEL, RETAG_CALL_LABEL]);
  assert.equal(r.raws.length, 2);
  assert.deepEqual(asks, []);
  const note = provider.seen.messages[1].at(-1).content;
  assert.match(note, /Your answer gave the fact "price" a limit \(lt 1500\) with from: "line 1"\. Line 1 has ~ rule 1, "price is under 1500 euros", and no fact answers it\. If that limit comes from rule 1, set from to "line 1 rule 1"\. If it does not, leave it as it is\.\nReturn the whole answer again\./);
  assert.ok(provider.seen.messages[1].length >= 3, 'same conversation: prompt, first answer, note');
});

test('the second answer unchanged: today\'s question still fires, 2 calls', async () => {
  const { provider, asks } = await go([{ text: BARE }, { text: BARE }]);
  assert.equal(provider.seen.calls, 2);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].ask, 'cant-check');
});

test('the second answer malformed: the first is kept (no repair), the question fires, still one follow-up', async () => {
  const { r, provider, asks } = await go([{ text: BARE }, { text: 'not json' }, { text: TAGGED }]);
  assert.equal(r.state, 'PRESENT');
  assert.equal(provider.seen.calls, 2);
  assert.equal(asks.length, 1);
});

test('no unanswered rule, or no reading: no follow-up, 1 call', async () => {
  for (const text of [TAGGED, ans('line 1'), ans('line 1 rule 1')]) {
    const { provider } = await go([{ text }]);
    assert.equal(provider.seen.calls, 1, text);
  }
});

test('the cap reached by the map call: no follow-up, the first answer stands', async () => {
  const { r, provider, asks } = await go([{ text: BARE, costUsd: 0.5 }, { text: TAGGED }], { ceilingUsd: 0.5 });
  assert.equal(provider.seen.calls, 1);
  assert.equal(r.state, 'PRESENT');
  assert.equal(asks.length, 1);
});
