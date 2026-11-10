// R10 (hamr 2026-11-09, fwd's way): on a RUBRIC job a part the drafter wrote as `none` or `judged` (the job sentence, "that it is the LATEST")
// is listed under Not checked with its words; it no longer fails the plan. The drafts are the REAL round-4 declarations (tests/fixtures/r10-uncheckable-drafts.json).
// Real bareguard validates; no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { withFactBindings, withDropNotes, settlePersonsWords } from '../src/rubricstep.js';
import * as cp from '../src/checkpick.js';
import { planFromSpec } from '../src/panel/jobplan.js';

const FX = JSON.parse(readFileSync(new URL('./fixtures/r10-uncheckable-drafts.json', import.meta.url), 'utf8'));
const jobLines = [{ n: 1, text: 'Summarise the latest release in the changelog', rules: ['exactly 3 bullets', 'under 80 words', 'exactly 3 list items', 'at most 80 words'] }];
const rules = [{ line: 1, rule: 1, text: 'exactly 3 bullets' }, { line: 1, rule: 2, text: 'under 80 words' }];
const picks = [{ line: 1, rule: 1, check: { rule: 'listItems', value: 3 }, added: 'exactly 3 list items' }, { line: 1, rule: 2, check: { rule: 'maxWords', value: 80 }, added: 'at most 80 words' }];
const settled = cp.settleRules(rules, picks, [], jobLines);
const opts = () => ({ catalogue: catalogueForLang(RUBRIC_LANG), listing: ['input/CHANGELOG.md', 'output/.gitkeep'], guards: classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG }), envOwned: [], verdictType: 'soft-green', writeScope: ['output/'], jobLines, inputLabels: ['Changelog'] });
// the draft gate's own order (authorflow.js `picked`, then the settle/validate chain); `moveUncheckable` is absent on the old engine, where the chain is just applyPicks
const gate = (d, rubric = true) => validateDeclaration(withFactBindings(withDropNotes(settlePersonsWords(cp.applyPicks(cp.moveUncheckable ? cp.moveUncheckable(d, jobLines, rubric) : d, settled), jobLines), undefined, jobLines)), opts());
const codes = (v) => v.reds.map((r) => r.code);

for (const [key, why] of [['d8-revise-1', 'the job sentence as `none`'], ['d2-author', 'the job sentence + "that it is the LATEST" as `none`'], ['d4-revise-1', 'a lone `none` part, the stage is left with no parts']]) {
  test(`${key} (${why}): no unsortable red, the words are listed under Not checked`, () => {
    const v = gate(FX[key].declaration);
    assert.deepEqual(codes(v), [], JSON.stringify(v.reds.map((r) => r.detail)));
    assert.equal(v.ok, true);
    const notes = (v.declaration.notes ?? []).join('\n');
    assert.match(notes, /No rule can check this, so you judge it at Accept\./);
    assert.match(notes, /Summarise the latest release in the changelog|summarise the latest release/i);
    assert.ok(!JSON.stringify(v.declaration.stages).includes('"class":"none"'));
    // the person's text: plain words, no JSON
    const plan = planFromSpec({ closeDecl: v.declaration, jobLines });
    const shown = [...plan.notChecked, ...plan.lines.flatMap((l) => l.refused)].filter((t) => t.includes(cp.UNCHECKABLE_WORDS)).join('\n');
    assert.match(shown, /^line 1: "[^"]+" \u2014 No rule can check this, so you judge it at Accept\.$/m);
    assert.ok(!/[{}[\]]|"class"|"text"/.test(shown.replace(/"[^"]*"/g, '')), shown);
  });
}

test('d3-author (the job sentence as `judged`): the judged red is gone, the draft\'s OTHER reds stand', () => {
  const v = gate(FX['d3-author'].declaration);
  assert.ok(!codes(v).includes('rubric-part-judged'), codes(v).join());
  assert.deepEqual([...new Set(codes(v))], ['invalid-value'], 'the duplicate fact names are still a red');
});

test('d2-author: the real check part (rules 1 and 2) stays a check; only the none part moves', () => {
  const v = gate(FX['d2-author'].declaration);
  const parts = v.declaration.stages.find((s) => s.kind === 'rubric-step').params.parts;
  assert.ok(parts.some((p) => p.class === 'countable' && p.check === 'listItems'), 'the picked count is still checked');
  assert.ok(parts.length >= 2);
});

test('a `none` part that carries a ~ rule no other part carries becomes a refused entry for that rule, never a line-level refusal', () => {
  const d = JSON.parse(JSON.stringify(FX['d4-revise-1'].declaration));
  const st = d.stages.find((s) => s.kind === 'rubric-step');
  st.params.parts = [{ text: 'under 80 words', class: 'judged', rules: [2] }]; delete d.refused;
  const out = cp.moveUncheckable(d, jobLines, true);
  assert.deepEqual(out.refused, [{ line: 1, rule: 2, reason: cp.UNCHECKABLE_WORDS }]);
  assert.equal(out.refused.some((r) => !Object.hasOwn(r, 'rule')), false);
  assert.equal(out.stages.find((s) => s.kind === 'rubric-step').params.parts.length, 0);
});

test('guard parts, source reds and fact-twice are untouched by the move', () => {
  const d = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [{ text: 'web', class: 'guard' }, { text: 'a', class: 'fact' }, { text: 'b', class: 'fact' }] } }] };
  assert.deepEqual(cp.moveUncheckable(d, jobLines, true), d);
});

test('NOT a rubric job: the same `none` / `judged` parts are returned untouched, their reds stand as before', () => {
  for (const key of ['d4-revise-1', 'd3-author']) {
    const d = FX[key].declaration;
    assert.equal(cp.moveUncheckable(d, jobLines, false), d, 'same object, nothing moved');
    const v = gate(d, false);
    assert.ok(codes(v).some((c) => c === 'rubric-part-unsortable' || c === 'rubric-part-judged'), codes(v).join());
  }
});

test('d3-revise-2 (five `none` parts, four are verbatim copies of the person\'s own rules): only the job sentence is listed; the rules stay checked by the picks, never called Not checked', () => {
  const v = gate(FX['d3-revise-2'].declaration);
  assert.deepEqual(codes(v), [], JSON.stringify(v.reds.map((r) => r.detail)));
  assert.deepEqual(v.declaration.notes.filter((n) => n.includes(cp.UNCHECKABLE_WORDS)), ['line 1: "Summarise the latest release in the changelog" — No rule can check this, so you judge it at Accept.']);
  assert.ok(!(v.declaration.refused ?? []).some((r) => r.reason === cp.UNCHECKABLE_WORDS), 'no rule was moved to Not checked by the move (the drafter\'s own refused entries are its own)');
  const parts = v.declaration.stages.find((s) => s.kind === 'rubric-step').params.parts;
  assert.deepEqual(parts.map((p) => p.check).sort(), ['listItems', 'maxWords']);
});

test('round-1 author (one `judged` part reading "<job sentence>, <rule>, <rule>..." with rules [1,2]): only the sentence is listed, the picks keep the rules', () => {
  const v = gate(FX['r1-author'].declaration);
  assert.deepEqual(codes(v), []);
  assert.deepEqual(v.declaration.notes.filter((n) => n.includes(cp.UNCHECKABLE_WORDS)), ['line 1: "Summarise the latest release in the changelog" — No rule can check this, so you judge it at Accept.']);
  assert.deepEqual(v.declaration.stages.find((s) => s.kind === 'rubric-step').params.parts.map((p) => p.check).sort(), ['listItems', 'maxWords']);
});
