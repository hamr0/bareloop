// R10: a `~` rule that is a COUNT bareguard checks (words, list items / lines, sections) always reaches the pick offer, whatever the page look said about it (hamr, 2026-11-09).
// Real data: the page-map answers of paid round 2 drafts 4 and 5 (sessions smw9ie5pi52mf, smw9ieiiyrm5n; trimmed copies under tests/fixtures), run through the REAL runPageMap
// (page rules, dry reads), the real scopedRules / askableFromLook and the real door (authorCloseForJob); real bareguard. The model is a script that can only deliver a tool call.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scopedRules, isCountable, guardrailItemCount, plainWords, SUGGEST_TOOL } from '../src/checkpick.js';
import { runPageMap, askableFromLook } from '../src/pagemap.js';
import { authorCloseForJob as forJob } from '../src/authorjob.js';
import { RUBRIC_LANG, validateDeclaration, classGuards, catalogueForLang, genreForLang } from '../src/authoring.js';
import { checksOfClose } from '../src/rubricstep.js';
import { proveRubricInputs } from '../src/source.js';
import { reply } from './helpers.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const LOOKS = JSON.parse(fx('r10-countable-look.json'));
const PAGE = fx('r10-countable-changelog.md');
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rule: 'exactly 3 bullets; under 80 words', rules: ['exactly 3 bullets', 'under 80 words'] }];
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'r10-countable-')); made.push(d); return d; };
/** the look the real page-map step makes from a logged answer */
async function lookOf(key) {
  const r = await runPageMap({ texts: { Changelog: PAGE }, inputs: [{ n: 1, label: 'Changelog' }], jobLines, sleep: async () => {}, provider: { async generate() { return reply({ text: LOOKS[key].raw, costUsd: 0 }); } } });
  assert.equal(r.state, 'PRESENT');
  return r.facts.look;
}
const FILE_INPUT = [{ value: '/x/CHANGELOG.md' }];
const key = (rs) => rs.map((r) => `${r.line}.${r.rule}`);

test('the real draft-4 look: rule 1 is tied to a kept phrase fact, rule 2 is on the dropped list; BOTH countable rules are still scoped, the kept fact stays', async () => {
  const look = await lookOf('d4');
  assert.ok(look.facts.some((f) => f.line === 1 && f.forRule === 1), 'the kept look fact tied to rule 1 stays');
  assert.ok(look.dropped.some((d) => d.line === 1 && d.rule === 2), 'rule 2 is on the look\'s dropped list');
  assert.deepEqual(key(scopedRules(jobLines, { inputs: FILE_INPUT, look })), ['1.1', '1.2']);
});

test('the real draft-5 look: the same, and no "I can\'t check this on the page" is left once the pick path owns rule 2', async () => {
  const look = await lookOf('d5');
  assert.ok(look.facts.some((f) => f.line === 1 && f.forRule === 1));
  assert.deepEqual(key(scopedRules(jobLines, { inputs: FILE_INPUT, look })), ['1.1', '1.2']);
});

test('askableFromLook asks nothing about a count rule (R10 one owner, fwd am24): the pick path owns it; the look\'s facts stay', async () => {
  const look = await lookOf('d4');
  assert.deepEqual(askableFromLook(look, jobLines).map((a) => [a.rule, a.ask]), []);
  assert.ok(look.facts.some((f) => f.forRule === 1));
});

test('countable reader: words, list items, lines and sections; nothing else', () => {
  for (const t of ['under 80 words', 'at most 600 words', 'exactly 3 bullets', 'exactly three bullet points', '5 list items', 'at most 10 lines', '4 sections', 'about 3 short sections']) assert.equal(isCountable(t), true, t);
  for (const t of ['be friendly', 'under $80', 'cheaper than 80 dollars', 'no more than 3 stops', 'mention the version', 'in English']) assert.equal(isCountable(t), false, t);
  assert.equal(guardrailItemCount('exactly three bullets'), 3);
  assert.equal(guardrailItemCount('exactly 3 bullets'), 3);
  assert.equal(guardrailItemCount('be friendly'), null);
});

test('guard: a rule that is not a count keeps today\'s behaviour - a look-tied or look-dropped one is NOT scoped', () => {
  const lines = [{ n: 1, text: 'a', rule: 'be friendly; under $80', rules: ['be friendly', 'under $80'] }];
  const look = { facts: [{ line: 1, forRule: 1, name: 'tone' }], dropped: [{ line: 1, rule: 2, fact: 'under $80', reason: 'no-label' }] };
  assert.deepEqual(scopedRules(lines, { inputs: FILE_INPUT, look }), []);
  assert.deepEqual(key(scopedRules(lines, { inputs: FILE_INPUT, look: null })), ['1.1', '1.2']);
});

test('guard: a page job still scopes only a rule that names a word number (a bullet count stays with the page words)', () => {
  assert.deepEqual(key(scopedRules(jobLines, { inputs: [{ value: 'https://example.com/p' }], look: { facts: [], dropped: [] } })), ['1.2']);
});

// ---- the door: both asks reach the person, and the prepared plan carries the fact and both picks ----------------------------------------------------
async function door(look) {
  const copy = join(tmp(), 'CHANGELOG.md');
  copyFileSync(new URL('./fixtures/r10-countable-changelog.md', import.meta.url), copy);
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: copy }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('unreachable');
  /** @type {any[]} */ const asked = [];
  /** @type {any} */ let seen = null;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look } };
  const suggest = { checks: [{ line: 1, guardrail: 1, rule: 'listItems', value: 3 }, { line: 1, guardrail: 2, rule: 'maxWords', value: 80 }] };
  await forJob({
    answers: { 1: '1. x' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG, jobLines: JSON.parse(JSON.stringify(jobLines)), inputs: [{ n: 1, label: 'Changelog', value: copy }], writeScope: ['output/'],
    provider: { fake: true }, ceilingUsd: 1, onPhase: () => {},
    lookFn: async () => survey,
    pickGenerate: async (_m, tools) => { await tools.find((t) => t.name === SUGGEST_TOOL).execute(suggest); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0007, unpricedRounds: 0 } }; },
    answerQuestions: async (o) => {
      asked.push(o.questions);
      const jl = JSON.parse(JSON.stringify(jobLines)); const picks = [];
      for (const q of o.questions) { picks.push({ line: q.line, rule: q.rule, check: q.check, added: plainWords(q.check) }); jl[0].rule += `; ${plainWords(q.check)}`; jl[0].rules.push(plainWords(q.check)); }
      return { jobLines: jl, answers: { 1: 'ans' }, left: [], picks, choices: o.questions.map((q) => ({ key: q.key, choice: 'agree', text: '' })) };
    },
    generate: async () => { throw new Error('no model call'); },
    authorFn: async (o) => { seen = o; return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
  });
  return { asked, seen };
}
for (const k of ['d4', 'd5']) {
  test(`the door on the real ${k} look: the person is asked "I propose" for both rules, no "can't check", and the prepared plan carries the fact [agent] plus both picks [you]`, async () => {
    const look = await lookOf(k);
    const { asked, seen } = await door(look);
    assert.deepEqual(asked.flat().map((q) => [q.ask, q.line, q.rule]), [['check', 1, 1], ['check', 1, 2]], 'both proposals, no look ask');
    const block = seen.block;
    assert.deepEqual(block.rows.filter((r) => r.kind === 'rule' && r.pick).map((r) => r.pick.rule), ['listItems', 'maxWords']);
    assert.ok(look.facts.some((f) => f.forRule === 1), 'the look\'s fact is still there beside the pick');
    // the plan: the block's own close (the look's fact plus both picks), through the real draft gate
    const built = block.reconcile();
    const v = validateDeclaration({ stages: [...classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }).map((g) => ({ name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: ['output/'] } })), ...built.stages], picks: built.map.flatMap((m) => { const part = built.parts[m.part]; return part.class === 'countable' && Array.isArray(part.rules) ? [{ line: m.line, part }] : []; }) }, {
      catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }),
      envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines: seen.jobLines, inputLabels: ['Changelog'],
    });
    assert.equal(v.ok, true, JSON.stringify(v.reds));
    const closeDecl = { genre: genreForLang(RUBRIC_LANG), lang: RUBRIC_LANG, stages: v.declaration.stages, picks: v.declaration.picks };
    assert.equal(closeDecl.picks.length, 2);
    const rows = checksOfClose(closeDecl);
    assert.deepEqual(rows.map((r) => r.by), rows.map((_r, i) => (i < rows.length - 2 ? 'agent' : 'you')));
    assert.ok(rows.some((r) => r.by === 'agent'));
    assert.deepEqual(rows.slice(-2).map((r) => r.text), ['the text has exactly 3 list items', 'the text is at most 80 words']);
  });
}
