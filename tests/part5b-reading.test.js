// PRD v1.107 Part 5b ("the look reads, code asks"): the page map may carry a `reading` (a limit of the signed-rule shape) on a time or money fact; CODE
// asks about a reading whose bound the person did not write, and about a rule the page cannot check; more than MAX_QUESTIONS asks stops the draft with a
// list. Real data: the page, job and look of run mve5y8fa (tests/fixtures/part5). The REAL map answer of that run predates the `reading` field, so the
// answer used here is that same raw with ONE added field (`reading` on its "departure time" fact) - a re-shape, not a run of the model.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { askableFromLook, parseMapAnswer, tooManyAsksText, isAgree, stripAgreeLead, mapPrompt } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { lookFactOf } from '../src/inputlook.js';
import { checkRubricRules } from '../src/rubricstep.js';
import { draftStopText } from '../src/authorreadout.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'part5');
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'part5b-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const draftLog = readFileSync(join(FX, 'mve5y8fa.draft-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rawReal = draftLog.find((e) => e.label === 'page-map').raw;
const page = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const READING = { op: 'between', lo: '06:00', hi: '21:00' };
/** the real raw with a `reading` added on the "departure time" fact (the only change) */
const withReading = (reading = READING) => { const m = JSON.parse(rawReal); m.facts.find((f) => f.name === 'departure time').reading = reading; return JSON.stringify(m); };
/** the look of the re-shaped answer over the real page, as the product builds it (applyPageRules, lookFactOf) */
const lookOf = (raw = withReading()) => {
  const p = parseMapAnswer(raw);
  assert.ok(p.ok);
  const kept = applyPageRules(page, /** @type {any} */ (p).mapping, spec.jobLines);
  return { facts: kept.facts.map((f) => lookFactOf(f, 'flights')), prose: [], notFound: [], dropped: kept.dropped };
};
const AGREED = 'departure time between 06:00 and 21:00';

test('the real raw of mve5y8fa (no reading) still parses; the re-shaped one parses and the reading rides the kept fact and the look fact', () => {
  assert.ok(parseMapAnswer(rawReal).ok, 'an old answer without the field is fine');
  const look = lookOf();
  const dep = look.facts.find((f) => f.name === 'departure time');
  assert.deepEqual(dep?.reading, READING);
  assert.equal(dep?.forRule, 2);
  assert.equal(look.facts.filter((f) => f.reading).length, 1, 'only the fact the AI gave a reading for');
});

test('a malformed `reading` is a malformed map answer (no repair)', () => {
  const bad = [
    { op: 'near', lo: '06:00', hi: '21:00' }, { op: 'between', lo: '06:00' }, { op: 'between', lo: '06:00', hi: '21:00', value: '1' },
    { op: 'lt', value: 450 }, { op: 'lt', lo: '06:00' }, { op: 'between', lo: 6, hi: 21 }, { op: 'lt', value: '' }, 'between 06:00 and 21:00', null, [], { op: 'lt', value: '06:00', extra: 1 },
  ];
  for (const r of bad) assert.equal(parseMapAnswer(withReading(r)).ok, false, JSON.stringify(r));
  // a reading on a fact that is not time or money is malformed too; a money reading holds numbers
  const m = JSON.parse(rawReal);
  m.facts.find((f) => f.name === 'nonstop').reading = { op: 'lt', value: '1' };
  assert.equal(parseMapAnswer(JSON.stringify(m)).ok, false);
  const m2 = JSON.parse(rawReal);
  m2.facts.find((f) => f.name === 'price').reading = { op: 'lt', value: 450 };
  assert.ok(parseMapAnswer(JSON.stringify(m2)).ok, 'a money reading with a number is legal');
});

test('the map prompt tells the AI about `reading`', () => {
  assert.match(mapPrompt({ jobLines: spec.jobLines, label: 'flights', text: page }), /"reading":<optional/);
});

test('reading ask: the real "not a red-eye" rule (bound not in the person\'s words) raises ONE ask, in code-owned words, with the reading as the agree text; page-tied rules raise none', () => {
  const qs = askableFromLook(lookOf(), spec.jobLines);
  assert.equal(qs.length, 1, '"under $450" and "nonstop" are carried by page words');
  assert.deepEqual([qs[0].line, qs[0].rule, qs[0].source, qs[0].ask], [1, 2, 'look', 'reading']);
  assert.equal(qs[0].reading, AGREED);
  assert.equal(qs[0].question, `Your line 1 says "not a red-eye". I read it as: ${AGREED}. Agree? Answer "agree", or type your own reading (your answer is added as a new ~ rule on line 1).`);
  assert.deepEqual(askableFromLook(lookOf(rawReal), spec.jobLines), [], 'no reading on the fact and the rule tied: a page rule, nothing asked');
});

test('reading ask: a bound the person wrote is theirs and asks nothing; one of two bounds missing still asks; an agreed reading (now in their words) asks nothing', () => {
  const lines = (rule) => [{ ...spec.jobLines[0], rules: ['under $450', rule, 'nonstop'], rule: `under $450; ${rule}; nonstop` }];
  assert.deepEqual(askableFromLook(lookOf(), lines('departs between 06:00 and 21:00')), []);
  assert.deepEqual(askableFromLook(lookOf(), lines('departs between 6:00 and 21:00')), [], 'a leading zero is the same number (the rubric-fact-unmarked spelling)');
  assert.equal(askableFromLook(lookOf(), lines('not before 06:00')).length, 1);
  assert.deepEqual(askableFromLook(lookOf(), lines(`not a red-eye; ${AGREED}`)), [], 'after "agree" the bound is in the person\'s words');
});

test('the early ask and rubric-fact-unmarked share one test: an agreed reading leaves the fact plain, an unagreed one is the AI\'s own number', () => {
  const dep = { name: 'departure time', shape: 'time', anchor: 'Departure time:', rule: READING };
  const price = { name: 'price', shape: 'money', unit: 'US dollars', rule: { op: 'lt', value: 450 } };
  const stagesOf = (rules) => [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'flights', class: 'fact', source: 'flights', facts: [price, dep], rules }] } }];
  const go = (jobLine) => { const out = []; checkRubricRules(stagesOf(jobLine.rules.map((_, i) => i + 1)), { jobLines: [jobLine], refused: [], red: (code) => out.push(code) }); return out; };
  const l = spec.jobLines[0];
  assert.deepEqual(go(l), ['rubric-fact-unmarked']);
  assert.deepEqual(go({ ...l, rules: [...l.rules, AGREED] }), []);
});

test('can\'t check: a rule no kept fact carries is asked "Drop it?" in code-owned words; readings come before can\'t-check asks; the same rule is asked once', () => {
  const full = lookOf();
  const look = { ...full, facts: full.facts.filter((f) => f.forRule !== 3) };
  const qs = askableFromLook(look, spec.jobLines);
  assert.deepEqual(qs.map((q) => [q.rule, q.ask]), [[2, 'reading'], [3, 'cant-check']]);
  assert.equal(qs[1].question, 'Your line 1 says "nonstop". I can\'t check this on the page. Drop it? Answer "drop it", or type how to check it (your answer is added as a new ~ rule on line 1).');
  const order = askableFromLook({ facts: [] }, [{ n: 1, text: 'x', rules: ['a', 'a'] }, { n: 2, text: 'y', rules: ['b'] }]);
  assert.deepEqual(order.map((q) => [q.line, q.ruleText]), [[1, 'a'], [2, 'b']]);
});

test('isAgree: agree / yes, any case, a closing stop; a typed reading is not agreement', () => {
  for (const a of ['agree', 'Agree.', ' YES ', 'yes!']) assert.equal(isAgree(a), true, a);
  for (const a of ['agree, but 7am', 'no', 'drop it', '']) assert.equal(isAgree(a), false, a);
});

test('F240 stripAgreeLead: a leading agree word + separator goes, the rest stays word for word; bare, stop-closed and mid-sentence yes are untouched', () => {
  const real = 'yes, check it as departure between 05:00 and 21:59';
  assert.equal(stripAgreeLead(real), 'check it as departure between 05:00 and 21:59');
  assert.equal(stripAgreeLead('Yes, Departs by 7am'), 'Departs by 7am');
  assert.equal(stripAgreeLead('AGREE: departs by 7am'), 'departs by 7am');
  assert.equal(stripAgreeLead('yes - departs by 7am'), 'departs by 7am');
  assert.equal(stripAgreeLead('yes, drop it'), 'drop it');
  for (const a of ['yes', 'Yes', 'agree', 'yes.', 'agree!', 'say yes to a window seat', 'yesterday it left at 7am', 'agreed, departs by 7am', 'yes departs by 7am', 'agree with the shown price', 'yes or no questions only']) assert.equal(stripAgreeLead(a), a, a);
});

test('tooManyAsksText lists EVERY ask and its reading, in code-owned words; a secret is masked; draftStopText prints it whole', () => {
  const full = lookOf();
  const asks = askableFromLook({ ...full, facts: full.facts.filter((f) => f.forRule !== 3) }, [{ ...spec.jobLines[0] }, { n: 2, text: 'y', rules: [`keep sk-ant-api03-${'a'.repeat(40)}`] }]);
  assert.equal(asks.length, 3);
  const text = tooManyAsksText(asks);
  assert.ok(text.startsWith('Your job has 3 rules I can\'t check or had to guess. Please rewrite it so each one says what to look for. My readings: line 1 "not a red-eye" → departure time between 06:00 and 21:00; '));
  assert.match(text, /line 1 "nonstop" → I can't check this on the page; line 2 "keep \[REDACTED/);
  assert.ok(!text.includes('sk-ant'));
  const stop = draftStopText({ stop: 'look-asks-too-many', reds: [{ code: 'look-asks-too-many', path: 'jobLines', detail: text }], spend: { knownUsd: 0.0003, spendComplete: true }, wholeJob: true });
  assert.ok(stop.startsWith(text));
  assert.match(stop, /Spent so far: /);
});

// ── the whole path through the panel session, over the real page and job ──
function sessionOver({ lookFacts, jobText, confirmCalls = [] }) {
  const sessionsRoot = tmp('part5b-sess-');
  const home = tmp('part5b-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const file = join(tmp(), 'flights.txt');
  copyFileSync(join(FX, 'mve5y8fa.flights.txt'), file);
  /** @type {any[]} */ const legs = [];
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look: { facts: lookFacts, prose: [], notFound: [], dropped: [] } } };
  const PLAN = { goal: 'List flights.', checks: [{ text: 'three flights are listed', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'part5b-job', jobText, inputs: `flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { confirmCalls.push(1); await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'line 1: nothing. Nothing was signed.' }] }; },
  });
  const sessionDir = () => join(sessionsRoot, readdirSync(sessionsRoot)[0]);
  return { session, legs, sessionDir };
}
const JOB = '1. List 3 flights from Boston to Chicago\n~ under $450\n~ not a red-eye\n~ nonstop';

test('session: "agree" writes the reading as a `~` rule in plain words next to the original (nothing is rewritten) and the answer is recorded as typed', async () => {
  const { session, legs, sessionDir } = sessionOver({ lookFacts: lookOf().facts, jobText: JOB });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.pendingAsk.source, 'look');
  assert.match(session.state.pendingAsk.question, /^Your line 1 says "not a red-eye"\. I read it as: departure time between 06:00 and 21:00\. Agree\?/);
  session.send('agree');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  session.signPrepare();
  assert.ok(await until(() => legs.length === 1));
  assert.deepEqual(legs[0].jobLines[0].rules, ['under $450', 'not a red-eye', 'nonstop', AGREED]);
  const human = readFileSync(join(sessionDir(), DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'human');
  assert.deepEqual(human.map((h) => [h.source, h.line, h.answer]), [['look', 1, 'agree']]);
});

test('session: a typed answer becomes the `~` rule instead; "drop it" on a reading ask is just typed words (it is only the drop answer of a can\'t-check ask)', async () => {
  const { session, legs } = sessionOver({ lookFacts: lookOf().facts, jobText: JOB });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('departs between 05:00 and 22:00');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  session.signPrepare();
  assert.ok(await until(() => legs.length === 1));
  assert.equal(legs[0].jobLines[0].rules.at(-1), 'departs between 05:00 and 22:00');
});

test('F240 session: "yes, <own reading>" signs the reading without the leading "yes,"; the log keeps the answer as typed', async () => {
  const { session, legs, sessionDir } = sessionOver({ lookFacts: lookOf().facts, jobText: JOB });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('yes, check it as departure between 05:00 and 21:59');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  session.signPrepare();
  assert.ok(await until(() => legs.length === 1));
  assert.equal(legs[0].jobLines[0].rules.at(-1), 'check it as departure between 05:00 and 21:59');
  const human = readFileSync(join(sessionDir(), DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'human');
  assert.equal(human[0].answer, 'yes, check it as departure between 05:00 and 21:59');
});

test('F240 session: "yes, drop it" on a can\'t-check ask drops it like "drop it"', async () => {
  const facts = lookOf().facts.filter((f) => f.forRule !== 3);
  const survey = sessionOver({ lookFacts: facts, jobText: JOB });
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'answer'));
  survey.session.send('agree');
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'answer' && /nonstop/.test(survey.session.state.pendingAsk.question)));
  survey.session.send('Yes, drop it.');
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'menu'));
  survey.session.signPrepare();
  assert.ok(await until(() => survey.legs.length === 1));
  assert.deepEqual(survey.legs[0].jobLines[0].rules, ['under $450', 'not a red-eye', 'nonstop', AGREED]);
});

test('session: "drop it" on a can\'t-check ask adds no rule and the rule lands on the look\'s Not checked list', async () => {
  const facts = lookOf().facts.filter((f) => f.forRule !== 3);
  const survey = sessionOver({ lookFacts: facts, jobText: JOB });
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'answer'));
  survey.session.send('agree');                       // the reading ask first
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'answer' && /nonstop/.test(survey.session.state.pendingAsk.question)));
  survey.session.send('Drop it.');
  assert.ok(await until(() => survey.session.state.pendingAsk?.kind === 'menu'));
  survey.session.signPrepare();
  assert.ok(await until(() => survey.legs.length === 1));
  assert.deepEqual(survey.legs[0].jobLines[0].rules, ['under $450', 'not a red-eye', 'nonstop', AGREED], 'only the agreed reading was added; "drop it" added nothing');
});

test('session: MORE than the cap (4 asks) asks nothing, makes no confirm call, drafts nothing, and stops with the list of every ask and its reading', async () => {
  const confirmCalls = [];
  const full = lookOf().facts.filter((f) => f.forRule === 2); // rules 1 and 3 have no kept fact: two can't-check asks + the reading
  const job = '1. List 3 flights from Boston to Chicago\n~ under $450\n~ not a red-eye\n~ nonstop\n~ with a window seat';
  const { session, legs } = sessionOver({ lookFacts: full, jobText: job, confirmCalls });
  assert.ok(await until(() => session.state.phase === 'refused'), `${session.state.phase}`);
  assert.equal(session.state.pendingAsk ?? null, null, 'nothing was asked');
  assert.equal(confirmCalls.length, 0);
  assert.equal(legs.length, 0);
  const said = session.state.error;
  assert.match(said, /Your job has 4 rules I can't check or had to guess\. Please rewrite it so each one says what to look for\. My readings: line 1 "not a red-eye" → departure time between 06:00 and 21:00; line 1 "under \$450" → I can't check this on the page; line 1 "nonstop" → I can't check this on the page; line 1 "with a window seat" → I can't check this on the page\./);
  assert.match(said, /Spent so far:/);
});

test('session: exactly the cap (3 asks) is asked, not stopped', async () => {
  const full = lookOf().facts.filter((f) => f.forRule === 2);
  const { session } = sessionOver({ lookFacts: full, jobText: JOB });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.pendingAsk.total, 3);
});
