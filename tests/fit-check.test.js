// FIT CHECK (docs/product/ITEM33-BUILD.md "Addendum 2026-10-21 - fit check build spec", F243, fit POC v6): the pure decision and the one paid call.
// The pages are three REAL saved barebrowse captures (tests/fixtures/fit, sha256-pinned, copied from the POC), the quotes are the ones the model
// really returned in the POC's calls.jsonl; the model is a scripted provider through the REAL bare-agent Loop. No network, every test is $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideFit, runFitCheck, fitPrompt, fitQuestionText, FIT_CALL_LABEL, FIT_SYSTEM, FIT_ABSENT_NOTE } from '../src/fitcheck.js';
import { reply } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHA = {
  'jfk-mia': 'ad00a9a9052c038d1afaed88a572cb6467778ef3988ed8948acd0d8a5aa2a980',
  'mia-jfk': 'e22e30d4dae6a8ee0f270366f4e831a43fea8eb3a60b7e0680ccf6cb8c1bfb0d',
  barcelona: 'cb63e3860c1103408d6592fc31f949036adb0536044ccd80891a47f220495497',
  'bos-den': 'b6b8c6bfd2571a96cdc62f070e78140dd9924b3338859cf32702d4764c62c1e9',
};
const page = (/** @type {keyof typeof SHA} */ k) => {
  const buf = readFileSync(join(HERE, 'fixtures', 'fit', `${k}.txt`));
  assert.equal(createHash('sha256').update(buf).digest('hex'), SHA[k], `${k} fixture changed`);
  return buf.toString('utf8');
};

const JOB = [{ n: 1, text: 'List 3 flights from New York JFK to Miami with price and departure time', rule: 'nonstop', rules: ['nonstop'] }];
/** the AI's real quotes from the POC (pair 1, on the JFK-to-Miami page), asks copied from the job line */
const GOOD = { asks: [
  { line: 1, ask: 'flights from New York JFK', found: true, quote: 'Leaves John F. Kennedy International Airport at 11:20 AM on Friday, November 20' },
  { line: 1, ask: 'to Miami', found: true, quote: 'arrives at Miami International Airport at 2:31 PM on Friday, November 20' },
  { line: 1, ask: 'price', found: true, quote: '$289' },
  { line: 1, ask: 'departure time', found: true, quote: '11:20 AM' },
] };
const NONE = { asks: GOOD.asks.map((a) => ({ line: 1, ask: a.ask, found: false, quote: null })) };
const J = (/** @type {unknown} */ o) => JSON.stringify(o);

test('decideFit: every ask found with a quote that is on the page = fits (whitespace and case do not matter)', () => {
  const d = decideFit(J(GOOD), JOB, { Flights: page('jfk-mia') });
  assert.equal(d.status, 'ok');
  if (d.status !== 'ok') return;
  assert.equal(d.state, 'fits');
  assert.deepEqual(d.notFound, []);
  assert.equal(d.asks.length, 4);
  const spaced = { asks: GOOD.asks.map((a) => ({ ...a, quote: a.quote.toUpperCase().replace(/ /g, '  ') })) };
  assert.equal(/** @type {any} */ (decideFit(J(spaced), JOB, { Flights: page('jfk-mia') })).state, 'fits');
});

test('decideFit: the same job on the page of the reverse trip = ask, every ask listed with its line', () => {
  const d = /** @type {any} */ (decideFit(J(NONE), JOB, { Flights: page('mia-jfk') }));
  assert.equal(d.state, 'ask');
  assert.deepEqual(d.notFound, [
    { line: 1, ask: 'flights from New York JFK' }, { line: 1, ask: 'to Miami' }, { line: 1, ask: 'price' }, { line: 1, ask: 'departure time' },
  ]);
});

test('decideFit: found:true with a quote that is NOT on the page is made up and counts as not found', () => {
  const lie = { asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, quote: 'Leaves Paris Charles de Gaulle at 9:00 AM' } : a)) };
  const d = /** @type {any} */ (decideFit(J(lie), JOB, { Flights: page('jfk-mia') }));
  assert.equal(d.state, 'ask');
  assert.deepEqual(d.notFound, [{ line: 1, ask: 'flights from New York JFK' }]);
  assert.equal(d.asks[0].madeUp, true);
  assert.equal(d.asks[1].madeUp, false);
  // found:true with no quote at all is made up too, and an empty quote is no quote
  for (const q of [null, '', '   ']) {
    const x = { asks: GOOD.asks.map((a, i) => (i === 2 ? { ...a, quote: q } : a)) };
    assert.equal(/** @type {any} */ (decideFit(J(x), JOB, { Flights: page('jfk-mia') })).asks[2].madeUp, true, JSON.stringify(q));
  }
});

test('decideFit: a quote from ANY of the inputs counts', () => {
  const two = { Flights: page('mia-jfk'), Other: page('jfk-mia') };
  assert.equal(/** @type {any} */ (decideFit(J(GOOD), JOB, two)).state, 'fits');
});

test('decideFit: malformed = not JSON, another form, an ask not copied from its own line, an unknown line, a line with no ask, found not a boolean', () => {
  const texts = { Flights: page('jfk-mia') };
  const bad = [
    'Here you go: {"asks":[]}', '```json\n{"asks":[]}\n```', '[]', '', '{"asks":"none"}', '{"asks":[]}',
    J({ asks: GOOD.asks.map((a, i) => (i === 3 ? { ...a, ask: 'leaves in the morning' } : a)) }),
    J({ asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, line: 2 } : a)) }),
    J({ asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, line: 'one' } : a)) }),
    J({ asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, found: 'yes' } : a)) }),
    J({ asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, quote: 5 } : a)) }),
    J({ asks: GOOD.asks.map((a, i) => (i === 0 ? { ...a, ask: '' } : a)) }),
    J({ asks: [7] }),
  ];
  for (const b of bad) assert.equal(decideFit(b, JOB, texts).status, 'malformed', b.slice(0, 60));
  // a ~ rule word is not in the line: "nonstop" asked as an ask is not copied from the job line
  assert.equal(decideFit(J({ asks: [...GOOD.asks, { line: 1, ask: 'nonstop', found: false, quote: null }] }), JOB, texts).status, 'malformed');
  // every job line needs at least one ask
  const two = [...JOB, { n: 2, text: 'Show the airline', rules: [] }];
  assert.equal(decideFit(J(GOOD), two, texts).status, 'malformed');
  assert.equal(decideFit(J({ asks: [...GOOD.asks, { line: 2, ask: 'the airline', found: false, quote: null }] }), two, texts).status, 'ok');
});

test('the prompt: the numbered job lines WITHOUT their ~ rules, the whole text of every input under its label, the answer form', () => {
  const p = fitPrompt({ jobLines: JOB, texts: { Flights: 'PAGE-A', Hotels: 'PAGE-B' } });
  assert.match(p, /LINE 1: List 3 flights from New York JFK to Miami with price and departure time/);
  assert.doesNotMatch(p, /nonstop/);
  assert.match(p, /the input "Flights"[^\n]*\nPAGE-A/);
  assert.match(p, /the input "Hotels"[^\n]*\nPAGE-B/);
  assert.match(p, /\{"asks":\[\{"line":.*"ask":.*"found":.*"quote":/);
  assert.match(FIT_SYSTEM, /never invent words/);
});

test('fitQuestionText: the exact words, with the count and each not-found ask and its line', () => {
  const q = fitQuestionText({ found: 2, total: 4, notFound: [{ line: 1, ask: 'to Miami' }, { line: 2, ask: 'price' }] });
  assert.equal(q, 'I found 2 of 4 of your asks on this page. Not found: to Miami (line 1), price (line 2). Type go on to keep drafting, or anything else to stop and change the job or the page.');
});

/** a provider that plays `steps` in order and counts its calls */
function playing(/** @type {any[]} */ steps) {
  const seen = { calls: 0, prompts: /** @type {string[]} */ ([]), options: /** @type {any[]} */ ([]) };
  return {
    seen,
    async generate(/** @type {any[]} */ messages, /** @type {any} */ _tools, /** @type {any} */ opts) {
      const s = steps[Math.min(seen.calls, steps.length - 1)];
      seen.calls += 1;
      seen.prompts.push(messages.filter((m) => m.role === 'user').at(-1).content);
      seen.options.push(opts);
      if (s instanceof Error) throw s;
      return reply(s);
    },
  };
}
const run = (/** @type {any} */ provider, /** @type {any} */ extra = {}) => {
  /** @type {any[]} */
  const booked = [];
  return runFitCheck({ jobLines: JOB, texts: { Flights: page('jfk-mia') }, provider, onCall: (c) => booked.push(c), sleep: async () => {}, ...extra }).then((r) => ({ r, booked }));
};

test('runFitCheck: one call; fits; the spend is booked with the label fit-check, the reply kept', async () => {
  const p = playing([{ text: J(GOOD), costUsd: 0.0053 }]);
  const { r, booked } = await run(p);
  assert.equal(r.state, 'fits');
  assert.equal(p.seen.calls, 1);
  assert.equal(booked.length, 1);
  assert.equal(booked[0].label, FIT_CALL_LABEL);
  assert.equal(FIT_CALL_LABEL, 'fit-check');
  assert.equal(booked[0].costUsd, 0.0053);
  assert.equal(booked[0].raw, J(GOOD));
  assert.equal(r.budgetStop, null);
});

test('runFitCheck: an ask comes back as ask with the not-found list; callOptions (the thinking rule) travel to the call', async () => {
  const p = playing([{ text: J(NONE) }]);
  const { r } = await run(p, { texts: { Flights: page('mia-jfk') }, callOptions: { thinkingMode: 'off' } });
  assert.equal(r.state, 'ask');
  assert.equal(r.notFound.length, 4);
  assert.equal(p.seen.options[0].thinkingMode, 'off');
});

test('runFitCheck: a malformed reply is retried once and the second can fit; two malformed = absent (open), both calls booked', async () => {
  const healed = playing([{ text: 'not json' }, { text: J(GOOD) }]);
  const a = await run(healed);
  assert.equal(a.r.state, 'fits');
  assert.equal(healed.seen.calls, 2);
  assert.equal(a.booked.length, 2);
  const dead = playing([{ text: 'not json' }]);
  const b = await run(dead);
  assert.equal(b.r.state, 'absent');
  assert.equal(dead.seen.calls, 2);
  assert.equal(b.booked.length, 2);
  assert.equal(FIT_ABSENT_NOTE, 'The fit check did not finish; drafting goes on.');
});

test('runFitCheck: a cut reply (max_tokens) is absent with no retry; a failed call is retried once (transport) then absent', async () => {
  const cut = playing([{ text: '{"asks":[{"line":1,', stopReason: 'max_tokens' }]);
  const a = await run(cut);
  assert.equal(a.r.state, 'absent');
  assert.equal(cut.seen.calls, 1);
  assert.equal(a.booked.length, 1);
  const boom = playing([Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' })]);
  const b = await run(boom);
  assert.equal(b.r.state, 'absent');
  assert.equal(boom.seen.calls, 2, 'one retry for a transport failure');
});

test('runFitCheck: a cap already spent (here a zero ceiling) stops BEFORE the call - absent, nothing asked of the model', async () => {
  const p = playing([{ text: J(GOOD) }]);
  const { r, booked } = await run(p, { ceilingUsd: 0 });
  assert.equal(r.state, 'absent');
  assert.equal(r.budgetStop, 'cap-halt');
  assert.equal(p.seen.calls, 0);
  assert.equal(booked.length, 0);
});

// F243 live (run mviepi4i, panel session smviejacde4qx): the job line "lis 3 flights" came back with the asks "3" and "flights"; the person was asked
// "Not found: 3 (line 1)". A bare number is a count, not a thing the page shows: code ignores it. The reply and page below are the real ones.
const LIS = [{ n: 1, text: 'lis 3 flights' }];
const LIVE = '{"asks":[{"line":1,"ask":"3","found":false,"quote":null},{"line":1,"ask":"flights","found":true,"quote":"Top flights"}]}';

test('decideFit: the real live reply for "lis 3 flights" fits - the bare "3" is ignored, kept in the asks with ignored: number', () => {
  const d = decideFit(LIVE, LIS, { Page: page('bos-den') });
  assert.equal(d.status, 'ok');
  if (d.status !== 'ok') return;
  assert.equal(d.state, 'fits');
  assert.deepEqual(d.notFound, []);
  assert.equal(d.asks.length, 2);
  assert.equal(/** @type {any} */ (d.asks[0]).ignored, 'number');
  assert.equal(/** @type {any} */ (d.asks[1]).ignored, undefined);
});

test('decideFit: a number-only ask is ignored in any spelling (1,000 / 10 / 1.5), but an ask that merely contains a number is a normal ask', () => {
  for (const n of ['1,000', '10', '1.5', '3 000']) {
    const d = decideFit(JSON.stringify({ asks: [{ line: 1, ask: n, found: false, quote: null }, { line: 1, ask: 'flights', found: true, quote: 'Top flights' }] }), [{ n: 1, text: `lis ${n} flights` }], { Page: page('bos-den') });
    assert.equal(/** @type {any} */ (d).state, 'fits', n);
    assert.equal(/** @type {any} */ (d).asks[0].ignored, 'number', n);
  }
  const d = decideFit(JSON.stringify({ asks: [{ line: 1, ask: '3 flights', found: false, quote: null }] }), LIS, { Page: page('bos-den') });
  assert.equal(/** @type {any} */ (d).state, 'ask');
  assert.equal(/** @type {any} */ (d).asks[0].ignored, undefined);
  assert.deepEqual(/** @type {any} */ (d).notFound, [{ line: 1, ask: '3 flights' }]);
});

test('decideFit: a job line whose only ask is a bare number has nothing to check - fits, not malformed', () => {
  const d = decideFit(JSON.stringify({ asks: [{ line: 1, ask: '3', found: false, quote: null }] }), LIS, { Page: page('bos-den') });
  assert.equal(d.status, 'ok');
  assert.equal(/** @type {any} */ (d).state, 'fits');
  assert.deepEqual(/** @type {any} */ (d).notFound, []);
});
