// IDEA A CORE item 1 (docs/product/ITEM33-BUILD.md "Addendum 2026-10-18 — Idea A core: build spec", sections 4.1, 5, 8 test 7): THE MAP CALL.
// The model is a scripted provider through the REAL bare-agent Loop (the `provider.generate` seam); nothing reaches the network, every test is $0.
// The answers are the AI's REAL saved maps (tests/fixtures/idea-a, sha256-pinned), the page a real barebrowse capture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPageMap, mapPrompt, parseMapAnswer, MAP_UNREADABLE, MAP_CALL_LABEL, MAP_SYSTEM } from '../src/pagemap.js';
import { tallyCalls } from '../src/text.js';
import { reply } from './helpers.js';
import { loadFixture, JOBS } from './idea-a-fixtures.js';

const fx = loadFixture('sfo1');
const INPUTS = [{ n: 1, label: 'Flights' }];
const TEXTS = { Flights: fx.page };

/** a provider that plays `steps` in order (an Error is thrown, an object is a reply) and counts its calls */
function playing(/** @type {any[]} */ steps) {
  const seen = { calls: 0, prompts: /** @type {string[]} */ ([]) };
  return {
    seen,
    async generate(/** @type {any[]} */ messages) {
      const s = steps[Math.min(seen.calls, steps.length - 1)];
      seen.calls += 1;
      seen.prompts.push(messages.filter((m) => m.role === 'user').at(-1).content);
      if (s instanceof Error) throw s;
      return reply(s);
    },
  };
}
const run = (/** @type {any} */ provider, /** @type {any} */ extra = {}) => {
  /** @type {any[]} */
  const booked = [];
  return runPageMap({ texts: TEXTS, inputs: INPUTS, jobLines: JOBS.flights, provider, onCall: (c) => booked.push(c), sleep: async () => {}, ...extra }).then((r) => ({ r, booked }));
};

test('the prompt ports the POC call: the numbered job, each ~ rule, "a result is one item", the answer form, the shape meanings, then the page', () => {
  const p = mapPrompt({ jobLines: JOBS.flights, label: 'Flights', text: 'PAGE-BODY' });
  assert.match(p, /LINE 1: List 3 flights from San Francisco to Los Angeles\n~ rule 1: under \$450\n~ rule 2: not a red-eye\n~ rule 3: nonstop/);
  assert.match(p, /A "result" is one item the page lists/);
  assert.match(p, /\{"facts":\[\{"name":.*"shape":"place\|money\|time\|phrase","words":\[.*"currency":.*"unit":/);
  assert.match(p, /money: words = the label\(s\) written right BEFORE the amount/);
  assert.match(p, /PAGE TEXT \(the input "Flights"\):\nPAGE-BODY$/);
  assert.match(MAP_SYSTEM, /never grade and never invent words/);
});

test('parseMapAnswer: the AI\'s eight REAL saved answers all read; prose, a fenced block, another form, an unknown shape are malformed (no repair)', () => {
  for (const k of ['sfo1', 'sfo2', 'ord-den', 'jfk-lax', 'lax-jfk', 'bos-ord', 'airbnb-lisbon', 'airbnb-porto']) {
    assert.equal(parseMapAnswer(loadFixture(k).mapText).ok, true, k);
  }
  for (const bad of ['Here is the map: {"facts":[]}', '```json\n{"facts":[]}\n```', '{"facts":"none"}', '[]', '', null, '{"facts":[{"name":"x","shape":"colour","words":[]}]}',
    '{"facts":[{"name":"x","shape":"money","words":"From"}]}', '{"facts":[{"name":"x","shape":"money","words":["a"],"unit":"total"}]}', '{"facts":[7]}']) {
    assert.equal(parseMapAnswer(bad).ok, false, String(bad));
  }
});

test('runPageMap: one call, the answer read by code - a PRESENT survey in the look envelope, the spend booked per call, the scrubbed answer kept', async () => {
  const { r, booked } = await run(playing([{ text: fx.mapText, costUsd: 0.0021 }]));
  assert.equal(r.state, 'PRESENT');
  assert.equal(r.budgetStop, null);
  assert.deepEqual(r.facts.inputs, [{ n: 1, label: 'Flights' }]);
  assert.equal(r.facts.rubricFiles, true);
  assert.deepEqual(r.facts.look.facts.map((/** @type {any} */ f) => f.name), fx.map.facts.map((/** @type {any} */ f) => f.name));
  assert.equal(r.facts.look.facts[0].source, 'Flights');
  const price = r.facts.look.facts.find((/** @type {any} */ f) => f.name === 'price');
  assert.equal(price.forRule, 1, '"rule 1" ties the fact to the ~ rule under line 1');
  assert.equal(price.line, 1);
  assert.deepEqual(r.calls, [{ label: MAP_CALL_LABEL, costUsd: 0.0021, unpricedRounds: 0 }]);
  assert.equal(booked.length, 1, 'the call is booked through onCall, which is what writes draft-spend.json');
  assert.equal(booked[0].label, MAP_CALL_LABEL);
  assert.equal(booked[0].raw, fx.mapText, 'the answer rides the call into the drafting log');
  assert.equal(r.raws[0].label, MAP_CALL_LABEL);
  assert.deepEqual(tallyCalls(r.calls), { costUsd: 0.0021, knownUsd: 0.0021, spendComplete: true, nullCostCalls: 0, unpricedRounds: 0 });
});

test('runPageMap: a secret shape in the answer is masked in the kept raw and in the booked call', async () => {
  const secret = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const text = JSON.stringify({ facts: [{ name: 'price', from: 'rule 1', shape: 'money', words: [`From ${secret}`], unit: ['US dollars'] }] });
  const { r, booked } = await run(playing([{ text }]));
  assert.doesNotMatch(r.raws[0].text, /AAAAAAAAAA/);
  assert.doesNotMatch(booked[0].raw, /AAAAAAAAAA/);
});

test('runPageMap: malformed twice is a plain-word stop - two calls, both booked, no Resume (an ABSENT survey, cause unparseable)', async () => {
  const { r, booked } = await run(playing([{ text: 'I could not read the page, sorry.' }]));
  assert.equal(r.state, 'ABSENT');
  assert.equal(r.reason, MAP_UNREADABLE);
  assert.equal(r.reason, "The AI's answer about the page was not readable twice. Nothing was signed.");
  assert.equal(r.cause, 'unparseable');
  assert.equal(booked.length, 2);
  assert.equal(r.facts, null);
});

test('runPageMap: malformed once is retried ONCE with the same message and the second answer is used', async () => {
  const p = playing([{ text: '```json\n{"facts":[]}\n```', costUsd: 0.001 }, { text: fx.mapText, costUsd: 0.002 }]);
  const { r, booked } = await run(p);
  assert.equal(r.state, 'PRESENT');
  assert.equal(booked.length, 2);
  assert.equal(p.seen.prompts[0], p.seen.prompts[1], 'the same message is asked again');
  assert.equal(tallyCalls(r.calls).knownUsd, 0.003);
});

test('runPageMap: a truncated answer (max_tokens) counts as malformed - cut off twice is the same plain stop', async () => {
  const cut = { text: fx.mapText.slice(0, 60), stopReason: 'max_tokens' };
  const twice = await run(playing([cut]));
  assert.equal(twice.r.state, 'ABSENT');
  assert.equal(twice.r.reason, MAP_UNREADABLE);
  const once = await run(playing([cut, { text: fx.mapText }]));
  assert.equal(once.r.state, 'PRESENT', 'a cut answer is retried once; the whole one then reads');
});

test('runPageMap: a transport error is retried ONCE and the spend is then NOT complete (the first attempt may be billed); twice is a plain failed-call stop', async () => {
  const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const healed = await run(playing([reset, { text: fx.mapText, costUsd: 0.002 }]));
  assert.equal(healed.r.state, 'PRESENT');
  assert.equal(healed.booked.length, 2, 'both attempts are booked');
  assert.equal(healed.booked[0].costUsd, null, 'the thrown attempt is booked unpriced, never $0');
  assert.equal(tallyCalls(healed.r.calls).spendComplete, false);
  const dead = await run(playing([reset]));
  assert.equal(dead.r.state, 'ABSENT');
  assert.equal(dead.r.cause, 'call-failed');
  assert.match(dead.r.reason, /the call about the page failed: .*socket hang up/);
  assert.equal(dead.booked.length, 2, 'ONE retry, never more');
});

test('runPageMap: a 429 waits the vendor\'s stated time once and asks again - a refusal, so nothing was billed; a non-transport throw is not swallowed', async () => {
  /** @type {number[]} */
  const waits = [];
  const limited = Object.assign(new Error('Rate limit. Please try again in 2s.'), { status: 429 });
  const { r, booked } = await run(playing([limited, { text: fx.mapText }]), { sleep: async (/** @type {number} */ ms) => { waits.push(ms); } });
  assert.equal(r.state, 'PRESENT');
  assert.deepEqual(waits, [2250], 'the stated 2s plus the library\'s margin');
  assert.equal(booked.length, 1, 'a refused call books nothing');
  await assert.rejects(run(playing([new TypeError('a bug')])), /a bug/);
});

test('runPageMap: the money cap is checked BEFORE the call - a spent ceiling makes the call never happen', async () => {
  const p = playing([{ text: fx.mapText }]);
  const { r } = await run(p, { ceilingUsd: 0 });
  assert.equal(r.state, 'ABSENT');
  assert.equal(r.budgetStop, 'cap-halt');
  assert.equal(p.seen.calls, 0, 'the provider was never asked');
  // and between the two tries: the first malformed answer spends the ceiling, so the second try is not made
  const q = playing([{ text: 'nope', costUsd: 0.5 }, { text: fx.mapText }]);
  const second = await run(q, { ceilingUsd: 0.5 });
  assert.equal(second.r.budgetStop, 'cap-halt');
  assert.equal(q.seen.calls, 1);
});

test('runPageMap: a job with two page inputs makes one call per input, and each fact carries its own input label as `source`', async () => {
  const p = playing([{ text: fx.mapText }]);
  const r = await runPageMap({ texts: { A: fx.page, B: fx.page }, inputs: [{ n: 1, label: 'A' }, { n: 2, label: 'B' }], jobLines: JOBS.flights, provider: p });
  assert.equal(p.seen.calls, 2);
  assert.deepEqual([...new Set(r.facts.look.facts.map((/** @type {any} */ f) => f.source))], ['A', 'B']);
  assert.match(p.seen.prompts[0], /the input "A"/);
  assert.match(p.seen.prompts[1], /the input "B"/);
});
