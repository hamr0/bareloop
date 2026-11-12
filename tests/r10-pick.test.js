// R10 = fwdloop M10 amendment 16 (ported, ruled 2026-11-09): the check-pick. ONE suggestion call per rubric job, code keeps or drops each suggestion, CODE asks (a proposal or
// "I can't check this"), the plan carries exactly the checks the person picked and the drafter writes none. Real bareguard 0.31 (the vocabulary, the rubric); the model is a script
// that can only DELIVER a tool call. No network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepOrDrop, scopedRules, rowsFromAnswer, SUGGEST_SCHEMA, SUGGEST_TOOL, plainWords, CANT_CHECK_WORDS } from '../src/checkpick.js';
import { CheckBlock } from '../src/checkblock.js';
import { questionsOfBlock } from '../src/blockasks.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { runCheckSuggest } from '../src/checksuggest.js';
import { authorClose, GREEN_QUESTIONS, MAX_QUESTIONS } from '../src/authorflow.js';
import { authorCloseForJob as forJob } from '../src/authorjob.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';
import { cardOfClose } from '../src/rubricstep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'r10-pick-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const changelogCopy = () => { const f = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), f); return f; };

// ---- keep-or-drop: each drop is a test that fails first (the module is new) ----------------------------------------------------------------
test('keepOrDrop keeps a check whose rule, fields, number and words are the guardrail\'s own', () => {
  assert.deepEqual(keepOrDrop('under 80 words', { rule: 'maxWords', value: 80 }), { kept: true, check: { rule: 'maxWords', value: 80 } });
  assert.deepEqual(keepOrDrop('exactly 3 bullets', { rule: 'listItems', value: 3 }), { kept: true, check: { rule: 'listItems', value: 3 } });
  assert.deepEqual(keepOrDrop('must say nonstop', { rule: 'mustCarry', phrases: ['nonstop'] }), { kept: true, check: { rule: 'mustCarry', phrases: ['nonstop'] } });
});
test('keepOrDrop drops: a number the guardrail never named (79 for "under 80"), a rule off bareguard\'s list, a field the rule does not take, a made-up word, none', () => {
  assert.equal(keepOrDrop('under 80 words', { rule: 'maxWords', value: 79 }).kept, false);
  assert.equal(keepOrDrop('under 80 words', { rule: 'maxWords', value: 90 }).kept, false);
  assert.match(/** @type {any} */ (keepOrDrop('under 80 words', { rule: 'regexMatch', value: 80 })).why, /not on bareguard's list/);
  assert.match(/** @type {any} */ (keepOrDrop('under 80 words', { rule: 'maxWords', value: 80, names: ['x'] })).why, /does not take names/);
  assert.match(/** @type {any} */ (keepOrDrop('has an intro and a summary', { rule: 'sections', names: ['Intro', 'Conclusion'] })).why, /not in the guardrail's words/);
  assert.match(/** @type {any} */ (keepOrDrop('must say nonstop', { rule: 'mustCarry', phrases: ['nonstop flight'] })).why, /not in the guardrail's words/);
  assert.equal(/** @type {any} */ (keepOrDrop('anything', { rule: 'none' })).why, 'none');
  assert.equal(keepOrDrop('anything', null).kept, false);
  assert.match(/** @type {any} */ (keepOrDrop('3 sections: a, b', { rule: 'sections', names: ['a', 'b'] })).why, /says 3 sections/);
});
test('keepOrDrop drops a rule that IS on bareguard\'s list but is not offered here', () => {
  const r = /** @type {any} */ (keepOrDrop('at least 5', { rule: 'min', value: 5 }));
  assert.equal(r.kept, false);
  assert.match(r.why, /is on bareguard's list but is not offered here/);
});
test('the answer form is one anyOf variant per offered rule plus none, each with exactly that rule\'s own fields', () => {
  const v = SUGGEST_SCHEMA.properties.checks.items.anyOf.map((/** @type {any} */ x) => x.properties.rule.const);
  assert.deepEqual(v, ['nonEmpty', 'maxWords', 'minWords', 'maxLines', 'listItems', 'maxListItems', 'minListItems', 'sections', 'sectionOrder', 'sectionWords', 'mustCarry', 'blockLines', 'none']);
  const mw = SUGGEST_SCHEMA.properties.checks.items.anyOf.find((/** @type {any} */ x) => x.properties.rule.const === 'maxWords');
  assert.deepEqual(Object.keys(mw.properties).sort(), ['guardrail', 'line', 'rule', 'value']);
  assert.equal(mw.additionalProperties, false);
});

// ---- scope ------------------------------------------------------------------------------------------------------------------------------------
test('scopedRules: every ~ rule of a local-file job; a page job only for a rule that names a word number; a look-tied or look-dropped rule is left to it; a repeat is one', () => {
  const lines = [{ n: 1, text: 'a', rule: 'under 80 words; use plain words; under 80 words', rules: ['under 80 words', 'use plain words', 'under 80 words'] }, { n: 2, text: 'b', rule: 'nonstop', rules: ['nonstop'] }];
  assert.deepEqual(scopedRules(lines, { inputs: [{ value: '/x/CHANGELOG.md' }] }).map((r) => `${r.line}.${r.rule}`), ['1.1', '1.2', '2.1']);
  assert.deepEqual(scopedRules(lines, { inputs: [{ value: 'https://example.com/p' }] }).map((r) => `${r.line}.${r.rule}`), ['1.1'], 'a page job: only the rule with a word number');
  assert.deepEqual(scopedRules(lines, { inputs: [], look: { facts: [{ line: 1, forRule: 2 }], dropped: [{ line: 2, rule: 1 }] } }).map((r) => `${r.line}.${r.rule}`), ['1.1']);
});

// ---- the asks: fwd's exact words; a proposal is not counted, a can't-check is ---------------------------------------------------------------
test('the asks (questionsOfBlock): fwd\'s words, `counted` only for "I can\'t check this"', () => {
  const b = new CheckBlock({ texts: { Changelog: 'x' }, labels: ['Changelog'] });
  b.fromJob([{ n: 1, text: 'Summarise', rules: ['under 80 words', 'be nice'] }]);
  b.addLook([]);
  b.applyDelta({ label: 'pre', pre: true, edits: [{ op: 'pick', line: 1, rules: [1], check: { rule: 'maxWords', value: 80 } }] });
  b.reconcile();
  const [a, c] = questionsOfBlock(b, [{ line: 1, rule: 1 }, { line: 1, rule: 2 }]);
  assert.equal(a.question, 'Line 1, guardrail "under 80 words": I propose at most 80 words. Answer "agree" to use it, or type your own words (your answer is added as a new ~ rule on line 1), or answer "drop it" to leave it Not checked.');
  assert.equal(c.question, `Line 1, guardrail "be nice": ${CANT_CHECK_WORDS} Type your own words (your answer is added as a new ~ rule on line 1), or answer "drop it" to leave it Not checked.`);
  assert.deepEqual([a.counted, c.counted, a.ask, c.ask, a.source], [false, true, 'check', 'no-check', 'look']);
  assert.equal(rowsFromAnswer([{ line: 1, rule: 1, text: 'x' }], { checks: [] })[0].why, 'no entry');
});

// ---- settle + apply -----------------------------------------------------------------------------------------------------------------------------
const RULES = [{ line: 1, rule: 1, text: 'under 80 words' }, { line: 1, rule: 2, text: 'be nice' }, { line: 1, rule: 3, text: 'no jargon' }];
const LINES_AFTER = [{ n: 1, text: 'Summarise', rule: 'x', rules: ['under 80 words', 'be nice', 'no jargon', 'at most 80 words', 'be very nice'] }];
const draftWith = (parts, refused = []) => ({ stages: [{ name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }], refused });
test('picks on the block: the pick is the line\'s only shape check, carries the guardrail and its added ~ rule; the others are Not checked with the reason; nothing the drafter could write is left to drop', () => {
  const b = new CheckBlock({ texts: { Changelog: 'x' }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'Summarise', rules: ['under 80 words', 'be nice', 'no jargon', 'at most 80 words', 'be very nice'] }]);
  b.addLook([]);
  b.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }, { line: 1, rule: 2, check: null, added: 'be very nice', own: true }], left: [{ line: 1, rule: 3 }] });
  const c = b.reconcile();
  const parts = c.stages.flatMap((st) => st.params.parts);
  assert.deepEqual(parts.map((p) => p.check), ['maxWords', 'cited']);
  assert.deepEqual(parts[0], { text: 'under 80 words', class: 'countable', check: 'maxWords', value: 80, rules: [1, 4] });
  const refused = b.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => [r.rule, r.reason.slice(0, 21)]);
  assert.deepEqual(refused, [[2, 'Your own words are on'], [3, 'You chose to leave it'], [5, 'Your own words are on']]);
  const row = cardOfClose({ closeDecl: { genre: 'text', lang: 'text', stages: c.stages, list: b.signedRows(), refused: b.rows.filter((r) => r.kind === 'rule' && r.state !== 'built').map((r) => ({ line: r.line, rule: r.rule, reason: String(r.reason) })) }, jobLines: [{ n: 1, text: 'Summarise', rule: 'x', rules: ['under 80 words', 'be nice', 'no jargon', 'at most 80 words', 'be very nice'] }] });
  assert.ok(row.checkItems.some((x) => x.text === 'the text is at most 80 words'));
  assert.ok(row.notChecked.some((n) => /^line 1: "no jargon" — You chose to leave it Not checked/.test(n)));
});
test('no pick: every counting rule stays unbuilt and none is checked (nothing to ask in the CLI: Not checked in plain words)', () => {
  const b = new CheckBlock({ texts: { Changelog: 'x' }, labels: ['Changelog'], asks: false });
  b.fromJob([{ n: 1, text: 'Summarise', rules: ['under 80 words', 'be nice', 'no jargon'] }]);
  b.addLook([]);
  b.reconcile();
  assert.deepEqual(b.rows.filter((r) => r.kind === 'rule').map((r) => r.state), ['not-checked', 'not-checked', 'not-checked']);
  assert.ok(b.rows.filter((r) => r.kind === 'rule').every((r) => typeof r.reason === 'string' && r.reason.length > 10));
});

// ---- the call over the structured ladder ----------------------------------------------------------------------------------------------------
const scripted = (args, calls = []) => async (_m, tools) => {
  calls.push(tools.map((t) => t.name));
  if (args !== null) await tools.find((t) => t.name === SUGGEST_TOOL).execute(args);
  return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0007, unpricedRounds: 0 } };
};
test('runCheckSuggest: one forced typed tool call, its cost booked and reported through onCall; an unusable answer (twice) reads "I can\'t check this" for every non-count rule, never a guess', async () => {
  const seen = []; const booked = [];
  const ok = await runCheckSuggest({ jobLines: [{ n: 1, text: 'Summarise' }], scoped: RULES.slice(0, 1), generate: scripted({ checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }] }, seen), onCall: (c) => booked.push(c) });
  assert.equal(ok.state, 'ok');
  assert.deepEqual(seen, [[SUGGEST_TOOL]]);
  assert.deepEqual(ok.rows[0].check, { rule: 'maxWords', value: 80 });
  assert.deepEqual(booked.map((c) => [c.label, c.costUsd]), [['check-suggest', 0.0007]]);
  const bad = await runCheckSuggest({ jobLines: [{ n: 1, text: 'Summarise' }], scoped: RULES.slice(0, 2), generate: scripted(null) });
  assert.equal(bad.state, 'absent');
  assert.equal(bad.calls.length, 2, 'one retry, both booked');
  assert.deepEqual(bad.rows.map((r) => r.check), [{ rule: 'maxWords', value: 80 }, null], 'a count rule gets code\'s own proposal (R10 D3); "be nice" reads "I can\'t check this"');
});

// ---- the whole drafting loop: the plan carries only what was picked ----------------------------------------------------------------------------
test('authorClose with picks: exactly the picked check reaches the plan (a drafter\'s own 79 for "under 80" or made-up section is inexpressible: the AI sends edits); the drafter\'s message does not restate the picks', async () => {
  const file = changelogCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) return;
  const prep = proved.prep;
  const line = { n: 1, text: 'Summarise the latest release', rule: 'under 80 words; be nice; no jargon; at most 80 words', rules: ['under 80 words', 'be nice', 'no jargon', 'at most 80 words'] };
  /** @type {string[]} */ const prompts = [];
  const generate = async (m, tools) => {
    prompts.push(m[0].content);
    await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [{ op: 'pick', line: 1, rules: [1], check: { rule: 'maxWords', value: 79 } }] });
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const block = new CheckBlock({ texts: { Changelog: 'x' }, labels: ['Changelog'], asks: false });
  block.fromJob([line]);
  block.addLook([]);
  block.carry({ picks: [{ line: 1, rule: 1, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }], left: [{ line: 1, rule: 2 }, { line: 1, rule: 3 }] });
  block.reconcile();
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: '1. Summarise the latest release' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines: [line], inputs: [{ n: 1, label: 'Changelog', value: file }], block,
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds));
  const parts = r.declaration.stages[1].params.parts;
  assert.deepEqual(parts.filter((p) => p.check !== 'cited').map((p) => [p.check, p.value]), [['maxWords', 80]], 'only the pick; a drafter pick edit of 79 on a settled rule is refused ("already on the list" would be the proposal of an asked rule)');
  assert.deepEqual(parts[0].rules, [1, 4]);
  assert.deepEqual(r.declaration.refused.map((x) => x.rule).sort(), [2, 3]);
  assert.doesNotMatch(prompts[0].split('INPUT "Changelog"')[0], /SETTLED BY CODE|THE LIST OF CHECKS/, 'no injected text restates what code settled');
});

// ---- the job door: asks before any draft, the cap counts only "I can't check this" ------------------------------------------------------------------
async function doorWorld(lines, { answer, suggest, look = { facts: [], prose: [], notFound: [] } } = {}) {
  const file = changelogCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(proved.ok, true);
  if (!proved.ok) throw new Error('unreachable');
  /** @type {string[]} */ const order = [];
  /** @type {any[]} */ const asked = [];
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look } };
  const r = await forJob({
    answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG, jobLines: JSON.parse(JSON.stringify(lines)), inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, onPhase: (p) => order.push(p),
    lookFn: async () => survey,
    pickGenerate: scripted(suggest),
    answerQuestions: async (o) => {
      asked.push(o.questions);
      const jl = JSON.parse(JSON.stringify(lines)); const picks = []; const left = [];
      for (const q of o.questions) {
        const a = answer(q);
        if (a === 'drop it') { left.push({ line: q.line, rule: q.rule }); continue; }
        const text = a === 'agree' && q.ask === 'check' ? plainWords(q.check) : a;
        picks.push({ line: q.line, rule: q.rule, check: a === 'agree' && q.ask === 'check' ? q.check : null, added: text, ...(a === 'agree' && q.ask === 'check' ? {} : { own: true }) });
        jl[0].rule += `; ${text}`; jl[0].rules.push(text);
      }
      const choices = o.questions.map((q) => { const a = answer(q); return a === 'drop it' ? { key: q.key, choice: 'drop', text: a } : (a === 'agree' && q.ask === 'check' ? { key: q.key, choice: 'agree', text: '' } : { key: q.key, choice: 'rule', text: a }); });
      return { jobLines: jl, answers: { 1: 'ans' }, left, picks, choices };
    },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { order.push('authorFn'); seen = o; return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  return { r, order, asked, get seen() { return seen; }, survey };
}
const L2 = [{ n: 1, text: 'Summarise', rule: 'under 80 words; be nice', rules: ['under 80 words', 'be nice'] }];
test('the door: a proposal and a "can\'t check" are asked before any draft; agree/own words become ~ rules; the drafter gets the picks; the suggestion call\'s cost joins the survey\'s', async () => {
  const w = await doorWorld(L2, { suggest: { checks: [{ line: 1, guardrail: 1, rule: 'maxWords', value: 80 }, { line: 1, guardrail: 2, rule: 'none' }] }, answer: (q) => (q.ask === 'check' ? 'agree' : 'be gentle') });
  assert.deepEqual(w.order.filter((x) => ['check-suggest', 'check-ask', 'authorFn'].includes(x)), ['check-suggest', 'check-ask', 'authorFn']);
  assert.deepEqual(w.asked[0].map((q) => [q.ask, q.line, q.rule]), [['check', 1, 1], ['no-check', 1, 2]]);
  const ruleRows = w.seen.block.rows.filter((r) => r.kind === 'rule');
  assert.deepEqual(ruleRows.map((r) => [r.rule, r.pick?.rule ?? null, r.text]), [[1, 'maxWords', 'under 80 words'], [2, null, 'be nice'], [3, null, 'at most 80 words'], [4, null, 'be gentle']]);
  assert.equal(ruleRows[1].cantAsked, true, 'the asked rule is settled by the person\'s own words (a typed row holds them)');
  assert.equal(w.seen.jobLines[0].rules.at(-1), 'be gentle');
  assert.deepEqual(w.survey.calls.map((c) => c.label), ['check-suggest'], 'the call\'s spend joins the survey\'s, so the one ceiling holds it');
});
test('the cap: proposals never count; the look\'s asks plus "I can\'t check this" asks over MAX_QUESTIONS stop at $0 with the list and ask nothing', async () => {
  const many = [{ n: 1, text: 'Do', rule: 'a; b; c; d', rules: ['a', 'b', 'c', 'd'] }];
  const four = await doorWorld(many, { suggest: { checks: [] }, answer: () => 'drop it' });
  assert.equal(four.r.stop, 'look-asks-too-many');
  assert.equal(four.asked.length, 0);
  assert.match(four.r.reds[0].detail, /Your job has 4 rules I can't check or had to guess\./);
  assert.match(four.r.reds[0].detail, /line 1 "a" → I can't check this/);
  // the look's own ask counts with the pick asks: one look ask + three "I can't check this" = four = refused, and nothing is put to the person (the block knows every ask before it asks one)
  const withLook = [{ n: 1, text: 'List flights', rule: 'not a red-eye; b; c; d', rules: ['not a red-eye', 'b', 'c', 'd'] }];
  const lookFacts = { facts: [{ line: 1, name: 'Departure', shape: 'time', source: 'Changelog', words: ['Unreleased'], forRule: 1, reading: { op: 'between', lo: '06:00', hi: '21:00' } }], prose: [], notFound: [] };
  const five = await doorWorld(withLook, { suggest: { checks: [] }, answer: () => 'drop it', look: lookFacts });
  assert.equal(five.r.stop, 'look-asks-too-many');
  assert.equal(five.asked.length, 0, 'nothing is asked: the block counts every ask up front (the old flow put the look ask to the person first and refused after), and the stop lists every ask');
  assert.match(five.r.reds[0].detail, /Your job has 4 rules I can't check or had to guess\./);
  const three = [{ n: 1, text: 'Do', rule: 'a; b; c', rules: ['a', 'b', 'c'] }];
  const exactly = await doorWorld(three, { suggest: { checks: [] }, answer: () => 'drop it' });
  assert.equal(exactly.asked[0].length, 3, 'exactly MAX_QUESTIONS counted asks are asked, not refused');
  const proposals = [{ n: 1, text: 'Do', rule: 'under 1 words; under 2 words; under 3 words; under 4 words', rules: ['under 1 words', 'under 2 words', 'under 3 words', 'under 4 words'] }];
  const ok = await doorWorld(proposals, { suggest: { checks: [1, 2, 3, 4].map((n) => ({ line: 1, guardrail: n, rule: 'maxWords', value: n })) }, answer: () => 'agree' });
  assert.equal(ok.asked[0].length, 4, 'four proposals are asked, none counts');
  assert.ok(ok.asked[0].length > MAX_QUESTIONS);
  assert.equal(ok.order.includes('authorFn'), true);
});
test('no pickGenerate: nothing is suggested or asked (a test seam) and the draft gets no picks', async () => {
  const file = changelogCopy();
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('x');
  let seen = null;
  await forJob({ answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG, jobLines: JSON.parse(JSON.stringify(L2)), inputs: [{ n: 1, label: 'Changelog', value: file }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    lookFn: async () => ({ state: 'PRESENT', calls: [], raws: [], facts: { rubricFiles: true, inputs: [], look: { facts: [{ line: 1, forRule: 1, name: 'a', shape: 'phrase', source: 'Changelog', words: ['Unreleased'] }, { line: 1, forRule: 2, name: 'b', shape: 'phrase', source: 'Changelog', words: ['Unreleased'] }], prose: [], notFound: [] } } }),
    answerQuestions: async () => { throw new Error('asked'); }, generate: async () => { throw new Error('no'); },
    authorFn: async (o) => { seen = o; return { ok: false, stop: 'x', reds: [], cost: null, iterations: [], raws: [] }; } });
  assert.ok(seen.block, 'the draft gets the block');
  assert.equal(seen.block.rows.some((r) => r.pick), false, 'and no picks');
});

test('the plan card: a pick is one `[you picked]` check row under its line (planFromConfirm), in the one table\'s plain words', async () => {
  const { planFromConfirm } = await import('../src/panel/jobplan.js');
  const plan = planFromConfirm([{ n: 1, text: 'Summarise', rule: 'under 80 words', rules: ['under 80 words'] }], { checkItems: [], picked: [{ line: 1, text: 'at most 80 words' }] });
  assert.deepEqual(plan.lines[0].picked, ['at most 80 words']);
  assert.equal(planFromConfirm([{ n: 1, text: 'x', rule: '', rules: [] }], { checkItems: [] }).lines[0].picked, undefined);
});
