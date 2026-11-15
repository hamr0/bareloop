// R10 (fwd am17, am18, am20, am21) through the REAL panel session: a draft that follows an earlier one (a Revise, or a Start over) keeps the picks whose line words and rule
// words still match (not sent to the suggestion call, not asked, not counted), asks only what is new or changed, a deleted rule takes its pick, a moved line keeps its pick on
// its new number, and an edited agreed `~` line is asked once, about the edited words (the answer replaces it; the old line never comes back). The model is a script.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { SUGGEST_TOOL } from '../src/checkpick.js';
import { KEPT_WORDS } from '../src/pickrecord.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'r10-carry-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const keysHome = () => { const d = tmp('r10-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };
const FILE = join(tmp(), 'CHANGELOG.md');
copyFileSync(join(HERE, '..', 'CHANGELOG.md'), FILE);
const SESSIONS = tmp('r10-sess-');
const HOME = keysHome();
const SURVEY = () => ({ state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } });

/**
 * One draft through the real session. `suggest(askedRules)` answers the suggestion call; `answers` are the buttons pressed in order (Agree only: a rule with no check is not asked, hamr 2026-11-15); returns what the drafter was handed.
 * @param {string} jobText @param {{carryFrom?: string, suggest?: (rules: any[]) => any, answers?: string[]}} [o]
 */
async function draft(jobText, { carryFrom, suggest = () => ({ checks: [] }), answers = [] } = {}) {
  /** @type {any[]} */ const legs = [];
  /** @type {string[][]} */ const suggestSeen = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'r10-carry', jobText, inputs: `Changelog: ${FILE}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: HOME, sessionsRoot: SESSIONS, ...(carryFrom ? { carryFrom } : {}),
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => SURVEY(),
    pickGenerate: async (m, tools) => {
      suggestSeen.push([m[0].content]);
      const guardrails = [...String(m[0].content).matchAll(/^\s+g(\d+): (.*)$/gm)].map((x) => ({ rule: Number(x[1]), text: x[2] }));
      await tools.find((t) => t.name === SUGGEST_TOOL).execute(suggest(guardrails));
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } };
    },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'g', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  /** @type {string[]} */ const asked = [];
  for (const a of answers) {
    assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
    const q = session.state.pendingAsk.question;
    asked.push(session.state.messages.filter((/** @type {any} */ m) => m.role === 'bot').at(-1).text);
    session.send('', a);
    await until(() => session.state.pendingAsk?.kind !== 'answer' || session.state.pendingAsk?.question !== q);
  }
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `no ask expected here, but: ${session.state.phase} / ${session.state.error} / ${JSON.stringify(session.state.pendingAsk)}`);
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => legs.length === 1));
  const log = readFileSync(join(session.state.outDir, 'draft-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { session, leg: legs[0], asked, suggestSeen, log };
}
/**
 * What the drafter was handed, read from the check block's rows (the old `checkPicks` is gone): `picks` = an agreed check or the person's own words for a rule, `left` = a rule left Not checked,
 * `rules` = the `~` rules of every line (the agreed lines included); `kept` marks what a Revise carried from the last draft.
 */
const view = (/** @type {any} */ leg) => {
  const rows = leg.block.rows.filter((/** @type {any} */ r) => r.kind === 'rule');
  const own = (/** @type {any} */ r) => r.cantAsked === true && !r.pick;
  return {
    picks: rows.filter((/** @type {any} */ r) => r.pick || own(r)).map((/** @type {any} */ r) => ({ line: r.line, rule: r.rule, check: r.pick ?? null, kept: r.keptFromLast === true, own: own(r) })),
    left: rows.filter((/** @type {any} */ r) => r.left === true).map((/** @type {any} */ r) => ({ line: r.line, rule: r.rule, kept: r.keptFromLast === true })),
    rules: rows.map((/** @type {any} */ r) => ({ line: r.line, text: r.text })),
  };
};
const maxWords = (rules) => ({ checks: rules.map((g) => { const n = /(\d+) words/.exec(g.text); return n ? { line: 1, guardrail: g.rule, rule: 'maxWords', value: Number(n[1]) } : { line: 1, guardrail: g.rule, rule: 'none' }; }) });

test('the first draft writes a record of words only (no line or rule number), and its card holds the answered rule IN PLACE of the asked one (one in, one out)', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words\n~ be nice', { suggest: maxWords, answers: ['agree'] });
  const rec = JSON.parse(readFileSync(join(a.session.state.outDir, 'picks-record.json'), 'utf8'));
  assert.deepEqual(rec.picks.map((e) => [e.ruleText, e.check?.rule ?? null, e.own]), [['at most 80 words', 'maxWords', false]], 'the record keeps the FINAL words of each rule (a rule with no check was not asked, so it has no entry)');
  assert.equal(JSON.stringify(rec).match(/"(line|rule)":\s*\d/), null, 'no line or rule number is stored');
  assert.equal(a.session.state.card.jobText, 'Summarise the latest release\n~ at most 80 words\n~ be nice', 'a Revise reopens the boxes WITH the rules as the answers replaced them');
});

test('am17: a draft that changes nothing about the rules asks nothing, makes no suggestion call, keeps its pick (kept from last draft) and logs it', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words\n~ under 40 words', { suggest: maxWords, answers: ['agree', 'agree'] });
  const b = await draft(a.session.state.card.jobText, { carryFrom: a.session.id, suggest: () => { throw new Error('the suggestion call must not run'); } });
  assert.equal(b.suggestSeen.length, 0);
  assert.deepEqual(view(b.leg).picks.map((p) => [p.rule, p.check?.rule, p.kept]), [[1, 'maxWords', true], [2, 'maxWords', true]]);
  assert.deepEqual(b.log.filter((e) => e.kind === 'check-pick').map((e) => e.how), [KEPT_WORDS, KEPT_WORDS]);
  assert.equal(b.log.some((e) => e.kind === 'call' && e.label === 'check-suggest'), false);
  assert.deepEqual(JSON.parse(readFileSync(join(b.session.state.outDir, 'picks-record.json'), 'utf8')).picks.length, 2, 'the record is carried forward');
});

test('am17 (3): a rule whose words changed is suggested and asked (only that one); the other keeps its pick; the changed one keeps no old check', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words\n~ under 40 words', { suggest: maxWords, answers: ['agree', 'agree'] });
  const b = await draft('Summarise the latest release\n~ under 60 words\n~ at most 40 words\n', { carryFrom: a.session.id, suggest: maxWords, answers: ['agree'] });
  assert.equal(b.suggestSeen.length, 1);
  assert.match(b.suggestSeen[0][0], /g1: under 60 words/);
  assert.doesNotMatch(b.suggestSeen[0][0], /40 words/, 'the kept rule is not sent to the call');
  assert.match(b.asked[0], /Line 1, guardrail "under 60 words": I propose at most 60 words\./);
  assert.deepEqual(view(b.leg).picks.map((p) => [p.rule, p.check.value, p.kept === true]), [[1, 60, false], [2, 40, true]]);
});

test('am17 (3): a deleted rule takes its pick with it (no ask, no check, not in the next record)', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words\n~ under 40 words', { suggest: maxWords, answers: ['agree', 'agree'] });
  const b = await draft('Summarise the latest release\n~ at most 40 words', { carryFrom: a.session.id, suggest: () => { throw new Error('no call'); } });
  assert.deepEqual(view(b.leg).picks.map((p) => [p.rule, p.check.value]), [[1, 40]]);
  assert.deepEqual(JSON.parse(readFileSync(join(b.session.state.outDir, 'picks-record.json'), 'utf8')).picks.map((e) => e.ruleText), ['at most 40 words']);
});

test('am18: a line added at the top asks nothing and every pick lands on its line\'s NEW number', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words', { suggest: maxWords, answers: ['agree'] });
  const b = await draft(`List the headings\n${a.session.state.card.jobText}`, { carryFrom: a.session.id, suggest: () => { throw new Error('no call'); } });
  assert.deepEqual(view(b.leg).picks.map((p) => [p.line, p.rule, p.check.value]), [[2, 1, 80]]);
  assert.deepEqual(view(b.leg).rules.map((r) => [r.line, r.text]), [[2, 'at most 80 words']], 'the answered rule is the one rule (one in, one out)');
});

test('am18 (3): a line whose own words changed is a new line - its pick is not carried (settled from its own words here), the other line keeps its pick', async () => {
  const perLine = (g) => ({ checks: g.map((x) => ({ line: /80/.test(x.text) ? 1 : 2, guardrail: x.rule, rule: 'maxWords', value: Number(/(\d+) words/.exec(x.text)[1]) })) });
  const a = await draft('Summarise the latest release\n~ under 80 words\nList the headings\n~ under 20 words', { suggest: perLine, answers: ['agree', 'agree'] });
  assert.ok(a.asked.length === 2);
  const b = await draft(a.session.state.card.jobText.replace('latest', 'newest'), { carryFrom: a.session.id, suggest: perLine, answers: [] });
  assert.equal(b.asked.length, 0, 'line 1 changed words, but its agreed rule "at most 80 words" is its own check, so it is settled as written (no obvious asks)');
  assert.deepEqual(view(b.leg).picks.map((p) => [p.line, p.kept === true]).sort(), [[1, false], [2, true]]);
});

test('am18 (3): two lines with the same words are matched in their order - each keeps its own pick, nothing is asked', async () => {
  const a = await draft('Summarise it\n~ under 80 words\nSummarise it\n~ under 40 words\nSummarise it\n~ under 20 words', { suggest: (g) => ({ checks: g.map((x) => ({ line: /80/.test(x.text) ? 1 : (/40/.test(x.text) ? 2 : 3), guardrail: x.rule, rule: 'maxWords', value: Number(/(\d+) words/.exec(x.text)[1]) })) }), answers: ['agree', 'agree', 'agree'] });
  const b = await draft(a.session.state.card.jobText, { carryFrom: a.session.id, suggest: () => { throw new Error('no call'); } });
  assert.deepEqual(view(b.leg).picks.map((p) => [p.line, p.rule, p.check.value]).sort(), [[1, 1, 80], [2, 1, 40], [3, 1, 20]]);
});

test('am17 (4): rules with no check are not asked, so they never count toward the cap - four of them plus one proposal still asks once', async () => {
  const a = await draft('Do it\n~ be nice\n~ be brief\n~ be kind\n~ be calm\n~ under 80 words', { suggest: maxWords, answers: ['agree'] });
  assert.equal(a.asked.length, 1);
  assert.doesNotMatch(String(a.session.state.error), /rules I can't check/, 'four unasked rules are not a questionnaire');
  assert.deepEqual(view(a.leg).left, [], 'they are Not checked with code\'s reason, not "left" by a choice');
  assert.equal(a.leg.block.rows.filter((r) => r.kind === 'rule' && r.state === 'not-checked').length, 4);
});

test('am17 (5): the model never sees a pick - the suggestion call of a following draft carries none of the carried words', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words\n~ be nice', { suggest: maxWords, answers: ['agree'] });
  const b = await draft(`${a.session.state.card.jobText}\n~ nonstop`, { carryFrom: a.session.id, suggest: maxWords, answers: [] });
  assert.doesNotMatch(JSON.stringify(b.suggestSeen), /at most 80 words|maxWords/);
});

test('one rule in, one rule out: an agreed rule edited in the box is just the rule; its words are the check, so nothing is asked and a draft that changes nothing keeps it', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words', { suggest: maxWords, answers: ['agree'] });
  assert.equal(a.session.state.card.jobText, 'Summarise the latest release\n~ at most 80 words');
  const b = await draft('Summarise the latest release\n~ at most 60 words', { carryFrom: a.session.id, suggest: () => { throw new Error('no call: the words are the check'); } });
  assert.equal(b.asked.length, 0);
  assert.deepEqual(b.leg.jobLines[0].rules, ['at most 60 words']);
  assert.deepEqual(view(b.leg).picks.map((p) => [p.rule, p.check.value]), [[1, 60]]);
  const c = await draft(b.session.state.card.jobText, { carryFrom: b.session.id, suggest: () => { throw new Error('no call'); } });
  assert.deepEqual(view(c.leg).picks.map((p) => [p.check.value]), [[60]]);
  assert.equal(c.asked.length, 0);
});

test('a rule edited to words no check can prove is not asked: it is Not checked with code\'s reason', async () => {
  const a = await draft('Summarise the latest release\n~ under 80 words', { suggest: maxWords, answers: ['agree'] });
  const own = await draft('Summarise the latest release\n~ a bit shorter', { carryFrom: a.session.id, suggest: () => ({ checks: [{ line: 1, guardrail: 1, rule: 'none' }] }) });
  assert.equal(own.asked.length, 0);
  assert.deepEqual(own.leg.jobLines[0].rules, ['a bit shorter']);
  const row = own.leg.block.rows.find((r) => r.kind === 'rule');
  assert.deepEqual([row.state, row.reason], ['not-checked', 'No rule can check this, so you judge it at Accept.']);
});

test('no record (or a carryFrom that is not a session id): every rule is asked, as on a first draft; a path is never followed out of the sessions folder', async () => {
  // a record planted OUTSIDE the sessions folder, reachable by `..`, must not be read
  const outside = join(dirname(SESSIONS), `${SESSIONS.split('/').at(-1)}-out`);
  made.push(outside);
  mkdirSync(join(outside, 'sx'), { recursive: true });
  writeFileSync(join(outside, 'sx', 'picks-record.json'), JSON.stringify({ picks: [{ lineWords: 'summarise the latest release', occurrence: 0, ruleText: 'under 80 words', added: null, check: { rule: 'maxWords', value: 80 }, own: false, left: false }] }));
  const rel = `../${SESSIONS.split('/').at(-1)}-out/sx`;
  const b = await draft('Summarise the latest release\n~ under 80 words', { carryFrom: rel, suggest: maxWords, answers: ['agree'] });
  assert.equal(b.asked.length, 1, 'the planted record was not read');
  const c = await draft('Summarise the latest release\n~ under 80 words', { suggest: maxWords, answers: ['agree'] });
  assert.equal(c.asked.length, 1);
});
