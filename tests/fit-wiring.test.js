// FIT CHECK wiring (docs/product/ITEM33-BUILD.md "Addendum 2026-10-21 - fit check build spec", F243): where the check sits in drafting, what the person is asked,
// what each answer does, and what the panel records. The page is a real saved capture (tests/fixtures/fit); the model boundary is a fake fitFn that decides
// through the REAL decideFit over the AI's real quotes. No network, no model.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorCloseForJob } from '../src/authorjob.js';
import { createSession } from '../src/panel/authorsession.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { draftStopText } from '../src/authorreadout.js';
import { decideFit, FIT_ABSENT_NOTE } from '../src/fitcheck.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'fit-wiring-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const pageCopy = () => { const f = join(tmp(), 'flights.txt'); copyFileSync(join(HERE, 'fixtures', 'fit', 'jfk-mia.txt'), f); return f; };
const keysHome = () => { const d = tmp('fit-wiring-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (/** @type {() => any} */ fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

const JOB_TEXT = 'List 3 flights from New York JFK to Miami with price and departure time';
const LINES = () => [{ n: 1, text: JOB_TEXT, rule: '', rules: [] }];
const ASKS = ['flights from New York JFK', 'to Miami', 'price', 'departure time'];
/** the AI's real quotes (POC pair 1) for the asks, in order */
const QUOTES = ['Leaves John F. Kennedy International Airport at 11:20 AM on Friday, November 20', 'arrives at Miami International Airport at 2:31 PM on Friday, November 20', '$289', '11:20 AM'];
const replyOf = (/** @type {number} */ missing) => JSON.stringify({ asks: ASKS.map((ask, i) => (i < missing
  ? { line: 1, ask, found: false, quote: null } : { line: 1, ask, found: true, quote: QUOTES[i] })) });
/** a fitFn that books one fit-check call and decides through the real decideFit; `missing` = how many leading asks the "AI" did not find */
const fitFnOf = (/** @type {number} */ missing, /** @type {string[]} */ order = []) => async (/** @type {any} */ o) => {
  order.push('fitFn');
  o.onCall({ label: 'fit-check', costUsd: 0.004, unpricedRounds: 0, raw: replyOf(missing) });
  const d = /** @type {any} */ (decideFit(replyOf(missing), o.jobLines, o.texts));
  return { state: d.state, asks: d.asks, notFound: d.notFound, reason: null, cause: null, calls: [], budgetStop: null };
};
const ABSENT = async (/** @type {any} */ o) => { o.onCall({ label: 'fit-check', costUsd: 0.002, unpricedRounds: 0 }); return { state: 'absent', asks: [], notFound: [], reason: 'cut', cause: 'unparseable', calls: [], budgetStop: null }; };

const survey = () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
  facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Flights' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } });
const draftOk = { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }], notes: [] }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] };

/** authorCloseForJob over the real page, with the stage order recorded */
async function job(/** @type {any} */ extra) {
  const file = pageCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Flights', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('inputs not proved');
  /** @type {string[]} */ const order = [];
  /** @type {any[]} */ const phases = [];
  const r = await authorCloseForJob({
    answers: { 1: `1. ${JOB_TEXT}` }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: LINES(), inputs: [{ n: 1, label: 'Flights', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    onPhase: (/** @type {string} */ p, /** @type {any} */ d) => { phases.push([p, d]); },
    lookFn: async () => { order.push('lookFn'); return survey(); },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async () => { order.push('authorFn'); return draftOk; },
    ...extra(order),
  });
  return { r, order, phases };
}

test('fits: the check runs once, BEFORE the look, nothing is asked and drafting goes on', async () => {
  /** @type {string[]} */ const asked = [];
  const { r, order } = await job((o) => ({ fitFn: fitFnOf(0, o), fitAsk: async (/** @type {string} */ q) => { asked.push(q); return 'go on'; } }));
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  assert.deepEqual(order.filter((x) => ['fitFn', 'lookFn', 'authorFn'].includes(x)), ['fitFn', 'lookFn', 'authorFn']);
  assert.deepEqual(asked, []);
});

test('ask + "go on" (any case, a closing full stop): the one question is asked in code\'s words, then the look runs', async () => {
  for (const say of ['go on', 'Go on.', '  GO ON ']) {
    /** @type {string[]} */ const asked = [];
    const { r, order } = await job((o) => ({ fitFn: fitFnOf(2, o), fitAsk: async (/** @type {string} */ q) => { o.push('fitAsk'); asked.push(q); return say; } }));
    assert.equal(r.ok, true, say);
    assert.deepEqual(order.filter((x) => ['fitFn', 'fitAsk', 'lookFn', 'authorFn'].includes(x)), ['fitFn', 'fitAsk', 'lookFn', 'authorFn'], say);
    assert.equal(asked.length, 1);
    assert.equal(asked[0], 'I found 2 of 4 of your asks on this page. Not found: flights from New York JFK (line 1), to Miami (line 1). Type go on to keep drafting, or anything else to stop and change the job or the page.');
    assert.deepEqual(r.interview.answers, { 1: `1. ${JOB_TEXT}` }, 'the answer changes nothing in the job');
  }
});

test('ask + any other words: fit-stopped, the look and the draft never run, the job lines are untouched (the answer is not a ~ rule)', async () => {
  const { r, order } = await job((o) => ({ fitFn: fitFnOf(1, o), fitAsk: async () => 'the page is wrong, I will change it' }));
  assert.equal(r.ok, false);
  assert.equal(r.stop, 'fit-stopped');
  assert.deepEqual(order, ['fitFn']);
  assert.equal(r.reds[0].code, 'fit-stopped');
  assert.equal(r.reds[0].detail, 'flights from New York JFK (line 1)');
});

test('ask + no answer (the session was abandoned) = confirm-abandoned', async () => {
  const { r, order } = await job((o) => ({ fitFn: fitFnOf(1, o), fitAsk: async () => null }));
  assert.equal(r.stop, 'confirm-abandoned');
  assert.deepEqual(order, ['fitFn']);
});

test('absent: nothing is asked, drafting goes on, and the phase carries state absent for the chat note', async () => {
  /** @type {string[]} */ const asked = [];
  const { r, order, phases } = await job((o) => ({ fitFn: async (/** @type {any} */ a) => { o.push('fitFn'); return ABSENT(a); }, fitAsk: async (/** @type {string} */ q) => { asked.push(q); return 'go on'; } }));
  assert.equal(r.ok, true);
  assert.deepEqual(order.filter((x) => ['fitFn', 'lookFn', 'authorFn'].includes(x)), ['fitFn', 'lookFn', 'authorFn']);
  assert.deepEqual(asked, []);
  assert.equal(phases.find((p) => p[0] === 'fit-check-done')[1].state, 'absent');
});

test('no answer seam (the CLI door, any test that does not inject one): the fit check does not run at all', async () => {
  const { r, order } = await job((o) => ({ fitFn: fitFnOf(4, o) }));
  assert.equal(r.ok, true);
  assert.deepEqual(order.filter((x) => ['fitFn', 'lookFn'].includes(x)), ['lookFn']);
});

test('draftStopText: fit-stopped says what was not found, what to do, and what was spent, in the spec\'s words', () => {
  const t = draftStopText({ stop: 'fit-stopped', reds: [{ code: 'fit-stopped', path: 'jobLines', detail: 'to Miami (line 1), price (line 2)' }], spend: { knownUsd: 0.004, spendComplete: true }, wholeJob: true });
  assert.equal(t, 'Stopped before drafting: the page does not show everything the job asks for (to Miami (line 1), price (line 2)). Change the job or the page and draft again. Spent so far: $0.0040.');
  assert.equal(FIT_ABSENT_NOTE, 'The fit check did not finish; drafting goes on.');
});

/** a panel session over the real page; `fit` is the injected fitFn */
function panel(/** @type {any} */ fit, /** @type {any} */ extraDeps = {}) {
  const sessionsRoot = tmp('fit-wiring-sess-');
  /** @type {string[]} */ const order = [];
  /** @type {any[]} */ const legs = [];
  const PLAN = { goal: 'List flights.', checks: [{ text: 'three flights are listed', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'fit-wiring-job', jobText: `1. ${JOB_TEXT}`,
    inputs: `Flights: ${pageCopy()}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => { order.push('lookFn'); return survey(); },
    ...(fit === undefined ? {} : { fitFn: fit(order) }),
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'line 1: nothing. Nothing was signed.' }] }; },
    ...extraDeps,
  });
  const logRows = () => {
    try { return readFileSync(join(sessionsRoot, readdirSync(sessionsRoot)[0], DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
  };
  return { session, order, legs, logRows };
}

test('the panel: fits = no question, the look runs, the call is booked as fit-check in the drafting log', async () => {
  const { session, order, logRows } = panel((o) => fitFnOf(0, o));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.deepEqual(order, ['fitFn', 'lookFn']);
  assert.ok(logRows().some((e) => e.kind === 'call' && e.label === 'fit-check' && e.costUsd === 0.004));
  const row = logRows().find((e) => e.kind === 'fit-check');
  assert.equal(row.state, 'fits');
  assert.equal(row.asks.length, 4);
  assert.deepEqual(row.notFound, []);
});

test('the panel: ask + "go on" goes through the ordinary ask path (a blank answer asks again), one human row, then the look runs', async () => {
  const { session, order, logRows } = panel((o) => fitFnOf(2, o));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.pendingAsk.source, 'fit-check');
  assert.match(session.state.pendingAsk.question, /^I found 2 of 4 of your asks on this page\. Not found: flights from New York JFK \(line 1\), to Miami \(line 1\)\. Type go on/);
  assert.deepEqual(order, ['fitFn'], 'asked before the look');
  session.send('   ');
  assert.ok(await until(() => session.state.messages.some((/** @type {any} */ m) => /An answer is needed/.test(m.text))));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('Go on.');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  assert.deepEqual(order, ['fitFn', 'lookFn']);
  const humans = logRows().filter((e) => e.kind === 'human');
  assert.deepEqual(humans.map((h) => [h.source, h.answer]), [['fit-check', 'Go on.']]);
  const row = logRows().find((e) => e.kind === 'fit-check');
  assert.equal(row.state, 'ask');
  assert.deepEqual(row.notFound, [{ line: 1, ask: 'flights from New York JFK' }, { line: 1, ask: 'to Miami' }]);
  assert.equal(row.asks[0].found, false);
  assert.equal(row.asks[2].found, true);
});

test('the panel: ask + other words stops with fit-stopped in plain words and the spend so far; the look never ran', async () => {
  const { session, order, legs } = panel((o) => fitFnOf(1, o));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('stop, wrong page');
  assert.ok(await until(() => session.state.phase === 'refused'), `${session.state.phase}`);
  assert.equal(session.state.error, 'Stopped before drafting: the page does not show everything the job asks for (flights from New York JFK (line 1)). Change the job or the page and draft again. Spent so far: $0.0040.');
  assert.deepEqual(order, ['fitFn']);
  assert.equal(legs.length, 0);
});

test('the panel: absent says the plain note in chat and drafting goes on with no question', async () => {
  const { session, order, logRows } = panel((o) => async (/** @type {any} */ a) => { o.push('fitFn'); return ABSENT(a); });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.deepEqual(order, ['fitFn', 'lookFn']);
  assert.ok(session.state.messages.some((/** @type {any} */ m) => m.text === 'The fit check did not finish; drafting goes on.'));
  assert.equal(logRows().find((e) => e.kind === 'fit-check').state, 'absent');
});

test('the panel: with the model boundary replaced and no fitFn injected, the real fit check does not reach a provider', async () => {
  const { session, order } = panel(undefined);
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.deepEqual(order, ['lookFn']);
});
