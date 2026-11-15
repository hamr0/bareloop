// hamr 2026-11-12 (as fwdloop M10 am29 + am30 + am31): a look question's intent is a typed CHOICE (Agree / Drop it / the box's own words), never words read. Item B. Real panel
// sessions over a real rubric job: the proposal and can't-check asks come from the real check-suggestion path and the real look path; the model boundary is scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offersOf, panelQuestionText, refuseChoice, resolveChoice, CHOICE_SAYS, boxFor } from '../src/questionbox.js';
import { join } from 'node:path';
import { DEST_ANSWER } from '../src/destpoint.js';
import { createSession } from '../src/panel/authorsession.js';
import { parseMapAnswer, readingQuestion, readingOfQuestion } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { lookFactOf } from '../src/inputlook.js';
import { rubricSession, until, tmp, HERE } from './qbox-world.mjs';
import { copyFileSync, writeFileSync } from 'node:fs';
import { ANTH_CFG } from './helpers.js';

const PICK_JOB = '1. Summarise the latest release\n~ under 80 words\n~ be nice';
const PICKS = [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }, { line: 1, guardrail: 2, rule: 'none' }];
const asking = (s) => s.state.pendingAsk?.kind === 'answer';
/** open the first question of a pick draft */
async function pickDraft(jobText = PICK_JOB) {
  const w = rubricSession({ jobText, picks: PICKS });
  assert.ok(await until(() => asking(w.session)), `${w.session.state.phase} / ${w.session.state.error}`);
  return w;
}
const human = (w) => w.log().filter((e) => e.kind === 'human');

test('offersOf: Agree only with a proposal; Drop it only on a look ask about one of the person\'s ~ rules where "drop it" leaves it Not checked (fwd am29 + am30)', () => {
  assert.deepEqual(offersOf({ source: 'look', ask: 'reading', reading: 'x between 1 and 2', rule: 1 }), { agree: true, drop: true }, 'a reading ask: agree it, drop it, or type the right reading (hamr 2026-11-15 ruling)');
  assert.deepEqual(offersOf({ source: 'look', ask: 'check', check: { rule: 'maxWords', value: 80 }, rule: 1 }), { agree: true, drop: true });
  assert.deepEqual(offersOf({ source: 'look', ask: 'cant-check', rule: 2 }), { agree: false, drop: false }, 'a rule with nothing to agree to is not asked at all (hamr 2026-11-15)');
  assert.deepEqual(offersOf({ source: 'look', ask: 'check', check: { rule: 'maxWords', value: 80 } }), { agree: true, drop: false }, 'no rule number: nothing to drop');
  assert.deepEqual(offersOf({ source: 'look', ask: 'reading', rule: 1 }), { agree: false, drop: true }, 'a reading ask with no reading words offers no Agree');
  assert.deepEqual(offersOf({ source: 'try-3', rule: 1 }), { agree: false, drop: false }, 'a drafter question: box and Send only');
});

test('panelQuestionText: a look question carries no typed-answer words and is shown whole; only the Destination question\'s own tail is cut (an exact suffix)', () => {
  const reading = readingQuestion(2, 'not a red-eye', 'departure time between 06:00 and 21:00');
  assert.equal(reading, 'Your line 2 says "not a red-eye". I read it as: departure time between 06:00 and 21:00. Agree?');
  assert.equal(panelQuestionText({ question: reading, source: 'look', line: 2 }), reading);
  assert.equal(readingOfQuestion(reading), 'departure time between 06:00 and 21:00');
  assert.equal(readingOfQuestion(`${reading} Answer "agree", or type your own reading (your answer replaces that ~ rule on line 2).`), 'departure time between 06:00 and 21:00', 'an archived question with the old answer words still reads');
  const own = 'Your line 1 says "x". Answer "agree" somewhere in the middle of my own prose, then more.';
  assert.equal(panelQuestionText({ question: own, source: 'look', line: 1 }), own);
  assert.equal(panelQuestionText({ question: `Set it? ${DEST_ANSWER}`, source: 'dest-point' }), 'Set it? ');
});

test('refuseChoice / resolveChoice: the door\'s words, word for word (fwd am31)', () => {
  const step = (over) => ({ kind: 'answer', source: 'look', rule: 1, offers: { agree: false, drop: true }, ...over });
  assert.equal(CHOICE_SAYS.bad, 'That answer is not one of the choices. Nothing was saved.');
  assert.equal(CHOICE_SAYS.notOffered, 'That choice is not offered for this question. Nothing was saved.');
  assert.equal(CHOICE_SAYS.noRule, 'That question is about the job line, not one of your ~ rules, so there is nothing to drop. Nothing was saved.');
  for (const bad of ['maybe', '', 5, null, {}, 'Agree', 'go-on']) assert.equal(refuseChoice(step({}), bad), CHOICE_SAYS.bad, String(bad));
  assert.equal(refuseChoice(step({}), 'agree'), CHOICE_SAYS.notOffered, 'agree with no proposal');
  assert.equal(refuseChoice(step({ rule: undefined, offers: { agree: false, drop: false } }), 'drop'), CHOICE_SAYS.noRule, 'drop on a question with no ~ rule number');
  assert.equal(refuseChoice(step({ source: 'try-3', rule: undefined, offers: undefined }), 'drop'), CHOICE_SAYS.bad, 'a drafter question has no buttons: only its typed words');
  assert.equal(refuseChoice(step({ source: 'try-3', rule: undefined, offers: undefined }), 'rule'), null, 'the drafter\'s own question keeps its typed answer');
  assert.equal(refuseChoice(step({ rule: 3, offers: { agree: false, drop: false } }), 'drop'), CHOICE_SAYS.notOffered, 'a rule number but nothing to drop is not offered');
  assert.equal(refuseChoice({ kind: 'menu' }, 'rule'), CHOICE_SAYS.notOffered, 'only a question the person answers takes a choice');
  for (const ok of ['agree', 'drop']) assert.equal(refuseChoice(step({ offers: { agree: true, drop: true } }), ok), null);
  assert.equal(refuseChoice(step({ ask: 'check', offers: { agree: true, drop: true } }), 'rule'), CHOICE_SAYS.notOffered, 'a proposed-check question has no typed words (hamr 2026-11-15)');
  assert.equal(refuseChoice(step({ ask: 'reading', offers: { agree: true, drop: true } }), 'rule'), null, 'a reading question takes the right reading in words');
  assert.deepEqual(resolveChoice('agree', 'ignored'), { value: 'agree', shown: 'Agree' });
  assert.deepEqual(resolveChoice('drop', ''), { value: 'drop it', shown: 'Drop it' });
  assert.deepEqual(resolveChoice('rule', 'agree, why not\nplease'), { value: 'agree, why not please', shown: 'agree, why not please' }, 'the box\'s words, kept whole, one line');
  assert.deepEqual(resolveChoice('rule', '  '), { error: CHOICE_SAYS.blank });
});

test('boxFor: Agree and Drop it buttons follow the offers; a check question has NO typing box (buttons only); a drafter question has the box and Send only', () => {
  const both = boxFor({ kind: 'answer', source: 'look', index: 1, total: 2, line: 1, question: 'q', offers: { agree: true, drop: true } });
  assert.deepEqual(both?.choices, [{ choice: 'agree', label: 'Agree' }, { choice: 'drop', label: 'Drop it' }]);
  assert.equal(both?.orLabel, null, 'buttons only: no box to type a new rule');
  assert.deepEqual(boxFor({ kind: 'answer', source: 'look', line: 1, question: 'q', offers: { agree: false, drop: true } })?.choices, [{ choice: 'drop', label: 'Drop it' }]);
  const plain = boxFor({ kind: 'answer', source: 'try-3', line: 1, question: 'q' });
  assert.deepEqual(plain?.choices, []);
  assert.equal(plain?.sendChoice, 'rule');
  assert.equal(plain?.orLabel, 'Type your answer:', 'the drafter\'s own question has no button, so it keeps its one line');
});

test('session: a proposal ask carries Agree + Drop it, its box shows the question without the typed-answer words, the stored question keeps them; Agree = today\'s agree; the rule with no check is not asked', async () => {
  const w = await pickDraft();
  const ask = w.session.state.pendingAsk;
  assert.equal(ask.total, 1, 'only the proposal is a question (option A, hamr 2026-11-15)');
  assert.deepEqual(ask.box.choices.map((c) => c.choice), ['agree', 'drop']);
  assert.equal(ask.box.text, 'Line 1, guardrail "under 80 words": I propose at most 80 words.');
  assert.equal(ask.question, 'Line 1, guardrail "under 80 words": I propose at most 80 words.', 'no typed-answer words: buttons only');
  assert.equal(ask.box.orLabel, null, 'no box to type in');
  assert.equal(w.bot().at(-1).text.endsWith('I propose at most 80 words.'), true, 'the thread holds the panel copy');
  assert.deepEqual(w.session.send('', 'agree'), { ok: true });
  assert.ok(await until(() => w.session.state.pendingAsk?.kind === 'menu'));
  assert.equal(w.session.signPrepare().ok, true);
  assert.ok(await until(() => w.legs.length === 1));
  // ruling 1 (2026-11-12): agree writes a `~` line into the signed job lines AND a row with the SAME rule number; the agreed rule's row carries the pick (no aiProposal)
  assert.deepEqual(w.legs[0].jobLines[0].rules, ['at most 80 words', 'be nice'], 'one rule in, one rule out: the agreed words REPLACED "under 80 words"');
  const blockRows = w.legs[0].block.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(blockRows.map((r) => [r.rule, r.text, r.pick ?? null, r.left ?? false]), [[1, 'at most 80 words', { rule: 'maxWords', value: 80 }, false], [2, 'be nice', null, false]]);
  assert.equal(blockRows[1].reason, 'No rule can check this, so you judge it at Accept.');
  const rows = human(w);
  assert.deepEqual(rows.map((r) => [r.answer, r.choice]), [['agree', 'agree']], 'the human row keeps the answer words, and says which button');
  assert.deepEqual(w.log().filter((e) => e.kind === 'check-pick').map((e) => [e.rule, e.how]), [[1, 'agree']]);
  assert.deepEqual(w.session.state.messages.filter((m) => m.role === 'you').map((m) => m.text), ['Agree']);
});

test('Drop it on a proposal leaves the rule Not checked (the person\'s own choice, REASON.left)', async () => {
  const w = await pickDraft();
  assert.deepEqual(w.session.send('', 'drop'), { ok: true });
  assert.ok(await until(() => w.session.state.pendingAsk?.kind === 'menu'));
  w.session.signPrepare();
  assert.ok(await until(() => w.legs.length === 1));
  const rows = w.legs[0].block.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(rows.map((r) => [r.rule, r.left ?? false]), [[1, true], [2, false]]);
});

test('a refused choice leaves the question open: nothing said, nothing logged, nothing resolved (bad value, not offered)', async () => {
  const w = await pickDraft();
  const before = JSON.stringify(w.session.state.messages);
  for (const [text, choice, say] of [['', 'maybe', CHOICE_SAYS.bad], ['', 7, CHOICE_SAYS.bad], ['x', null, CHOICE_SAYS.bad]]) {
    const r = w.session.send(text, choice);
    assert.equal(r.ok, false, `${choice}`);
    assert.equal(r.error, say);
  }
  assert.equal(JSON.stringify(w.session.state.messages), before, 'no chat line was added and the open question is still held back');
  assert.equal(w.session.state.pendingAsk.kind, 'answer');
  assert.equal(w.session.state.pendingAsk.box.text.includes('under 80 words'), true, 'still the first question');
  assert.deepEqual(human(w), [], 'nothing logged');
  assert.deepEqual(w.session.send('', 'agree'), { ok: true });
  assert.ok(await until(() => w.session.state.pendingAsk?.kind === 'menu'));
});

test('a rule nothing can check (real look path) is not asked: the draft goes straight to the plan with the rule Not checked', async () => {
  const a = rubricSession({ jobText: '1. Find the last 3 releases\n~ one per week' });
  assert.ok(await until(() => a.session.state.pendingAsk?.kind === 'menu'), `${a.session.state.phase} / ${a.session.state.error}`);
  a.session.signPrepare();
  assert.ok(await until(() => a.legs.length === 1));
  assert.deepEqual(a.legs[0].jobLines[0].rules, ['one per week']);
  assert.equal(a.legs[0].block.rows.find((r) => r.kind === 'rule').reason, 'No rule can check this, so you judge it at Accept.');
  assert.equal(human(a).length, 0, 'no question, no human row');
});

test('the send route hands the body\'s `choice` to the session', () => {
  assert.match(readFileSync(fileURLToPath(new URL('../src/panel/authorroutes.js', import.meta.url)), 'utf8'), /session\.send\(String\(body\?\.text \?\? ''\), body\?\.choice\)/);
});

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
test('page: a choice button posts its choice alone; the box\'s Send posts the box\'s words with the box\'s own choice (a new rule), never agree or drop it', () => {
  const start = PAGE.indexOf('function doQuestion(');
  assert.ok(start !== -1);
  const src = PAGE.slice(start, PAGE.indexOf('qSend.addEventListener', start));
  const posts = [];
  const mk = () => ({ disabled: false });
  const f = new Function('qBusy', 'sessionId', 'lastState', 'qSend', 'qC1', 'qC2', 'qError', 'qAnswer', 'qSendChoice', 'authorPost', 'chatPostOutcome', 'poll', `${src}\nreturn doQuestion;`)(
    false, 's1', { pendingAsk: { box: {} } }, mk(), mk(), mk(), { textContent: '' }, { value: 'agree, why not' }, 'rule', (path, body) => { posts.push([path, body]); return new Promise(() => {}); }, () => ({ ok: true }), () => {});
  f('agree');
  assert.deepEqual(posts.at(-1), ['/api/author/s1/send', { choice: 'agree' }]);
});

// ── a reading ask, over the real page and job of run mve5y8fa (the look of tests/part5b-reading.test.js: the real raw plus ONE added `reading` field) ──
const FX = join(HERE, 'fixtures', 'part5');
const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const rawReal = readFileSync(join(FX, 'mve5y8fa.draft-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.label === 'page-map').raw;
function readingSession() {
  const m = JSON.parse(rawReal); m.facts.find((f) => f.name === 'departure time').reading = { op: 'between', lo: '06:00', hi: '21:00' };
  const kept = applyPageRules(readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8'), /** @type {any} */ (parseMapAnswer(JSON.stringify(m))).mapping, spec.jobLines);
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look: { facts: kept.facts.map((f) => lookFactOf(f, 'flights')), prose: [], notFound: [], dropped: kept.dropped } } };
  const file = join(tmp(), 'flights.txt'); copyFileSync(join(FX, 'mve5y8fa.flights.txt'), file);
  const home = tmp('qbox-home-'); writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const legs = [];
  const PLAN = { goal: 'List flights.', checks: [{ text: 'three flights are listed', fromLine: [1] }], notChecked: [], questions: [] };
  const session = createSession({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'qbox-reading', jobText: '1. List 3 flights from Boston to Chicago\n~ under $450\n~ not a red-eye\n~ nonstop', inputs: `flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1 }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot: tmp('qbox-sess-'), generate: async () => { throw new Error('no model call'); }, lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'line 1: nothing. Nothing was signed.' }] }; },
  });
  return { session, legs };
}
test('a reading ask: Agree writes the reading as a ~ rule; Drop it and a box for the right reading are offered; typed words with no choice are refused', async () => {
  const w = readingSession();
  assert.ok(await until(() => asking(w.session)), `${w.session.state.phase} / ${w.session.state.error}`);
  const ask = w.session.state.pendingAsk;
  assert.deepEqual(ask.box.choices.map((c) => c.choice), ['agree', 'drop']);
  assert.equal(ask.box.orLabel, 'Or type the right reading:');
  assert.equal(ask.box.text, 'Your line 1 says "not a red-eye". I read it as: departure time between 06:00 and 21:00. Agree?');
  w.session.send('', 'agree');
  assert.ok(await until(() => w.session.state.pendingAsk?.kind === 'menu'));
  w.session.signPrepare();
  assert.ok(await until(() => w.legs.length === 1));
  assert.deepEqual(w.legs[0].jobLines[0].rules, ['under $450', 'departure time between 06:00 and 21:00', 'nonstop']);
  const w2 = readingSession();
  assert.ok(await until(() => asking(w2.session)));
  assert.equal(w2.session.send('agree').ok, false, 'typed words with no choice are refused');
});
