// The one check list of a rubric job (src/checklist.js): rows, the word proof, `~` wins, week-only, the `$` defaults, the empty list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CL from '../src/checklist.js';

const TEXT = '## [0.54.1] - 2026-11-04\n### Fixed\n- one\n- two\n';
const texts = { Changelog: TEXT };
const jobLines = [{ n: 1, text: 'Summarise the latest release', rule: 'exactly 3 bullets', rules: ['exactly 3 bullets'] }];
const look = { facts: [
  { line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] },
  { line: 1, name: 'invented', shape: 'phrase', source: 'Changelog', words: ['zzz nowhere'] },
  { line: 1, name: 'bullets', shape: 'number', source: 'Changelog', words: [], forRule: 1 },
], dropped: [] };
const build = (o = {}) => CL.buildLedger({ jobLines, look, texts, inputLabels: ['Changelog'], ...o });

test('A1 rows: a ~ rule is by you, a look fact by the agent, the word proof drops an invented word, a fact tied to a ~ rule is dropped (~ wins), every key is unique', () => {
  const rows = build();
  const by = (k) => rows.find((r) => r.key === k);
  assert.equal(by('L1.~1').by, 'you');
  assert.equal(by('L1.fact.release heading').state, 'listed');
  assert.equal(by('L1.fact.release heading').by, 'agent');
  assert.equal(by('L1.fact.invented').state, 'dropped');
  assert.match(by('L1.fact.invented').reason, /not in the input/);
  assert.match(by('L1.fact.bullets').reason, /a ~ rule wins/);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test('A1 extra proposals: count has no words and skips the proof; a phrase must be in the input; ~ wins; at most 3 stand; an unknown input is dropped', () => {
  const extra = [
    { line: 1, kind: 'cited', source: 'Changelog' },
    { line: 1, kind: 'count', min: 1, max: 1 },
    { line: 1, kind: 'count', max: 3 },
    { line: 1, kind: 'phrase', source: 'Changelog', phrase: '### Fixed' },
    { line: 1, kind: 'phrase', source: 'Changelog', phrase: 'not in the file' },
    { line: 1, kind: 'phrase', source: 'Nope', phrase: '### Fixed' },
  ];
  const rows = build({ look: { facts: [] }, extra });
  const bang = rows.filter((r) => r.from === 'agent');
  assert.match(bang.find((r) => r.kind === 'cited').reason, /already on the list/);
  assert.equal(bang.find((r) => r.kind === 'count' && r.min === 1).state, 'listed');
  assert.match(bang.find((r) => r.kind === 'count' && r.max === 3).reason, /a ~ rule wins/);
  assert.equal(bang.find((r) => r.kind === 'phrase' && r.words[0] === '### Fixed' && r.source === 'Changelog').state, 'listed');
  assert.match(bang.find((r) => r.words[0] === 'not in the file').reason, /not in the input/);
  assert.match(bang.find((r) => r.source === 'Nope').reason, /not one of the inputs/);
  assert.ok(bang.filter((r) => r.state === 'listed').length <= CL.MAX_BANG);
});

test('A1 a fourth proposal is dropped with the cap reason', () => {
  const extra = ['## [', '### Fixed', '- one', '- two'].map((phrase) => ({ line: 1, kind: 'phrase', source: 'Changelog', phrase }));
  const rows = build({ look: { facts: [] }, jobLines: [{ n: 1, text: 'x' }], extra });
  const bang = rows.filter((r) => r.from === 'agent');
  assert.equal(bang.filter((r) => r.state === 'listed').length, 3);
  assert.match(bang.find((r) => r.state === 'dropped').reason, /more than 3/);
});

const textJob = [{ n: 1, text: 'Find the release heading' }, { n: 2, text: 'Summarise it' }];
const factLook = { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], dropped: [] };

test('A1 $ rows: a text line with one input gets a $ cited row (by default, listed); a text line after a fact line also gets the numbers tie; the floor is shown, never a real check', () => {
  const rows = build({ jobLines: textJob, look: factLook });
  const by = (k) => rows.find((r) => r.key === k);
  assert.equal(by('L1.$cited'), undefined, 'a fact line has no text to quote');
  assert.deepEqual([by('L2.$cited').by, by('L2.$cited').from, by('L2.$cited').state, by('L2.$cited').source], ['default', 'default', 'listed', 'Changelog']);
  assert.deepEqual([by('L2.$numbers').kind, by('L2.$numbers').after], ['numbers', [1]]);
  assert.equal(by('L1.$floor').kind, 'floor');
  assert.equal(by('L1.$floor').state, 'built');
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test('A1 $ rows: more than one input -> the $ cited row is not-checked with its reason', () => {
  const rows = build({ look: { facts: [] }, texts: { A: 'x', B: 'y' }, inputLabels: ['A', 'B'] });
  const c = rows.find((r) => r.key === 'L1.$cited');
  assert.equal(c.state, 'not-checked');
  assert.match(c.reason, /more than one input/);
});

test('A8 weekOnly reads a version or a date, not a price, a percent or plain words', () => {
  for (const t of ['0.54.1', 'v1.2', '2026-11-04', '04/11/2026', 'Nov 4, 2026', '4 November 2026', 'November 2026', 'released 0.54.1 on Nov 4']) assert.equal(CL.weekOnly(t), true, t);
  for (const t of ['## [', '$4.50', '12.5%', '1 result', 'Fixed', 'crushed eggshell', 'may', '3 bullets']) assert.equal(CL.weekOnly(t), false, t);
});

test('A8 a look fact or a phrase proposal whose words hold a version or a date is dropped with the plain reason; a ~ rule naming a version is untouched', () => {
  const lk = { facts: [
    { line: 1, name: 'release version', shape: 'phrase', source: 'Changelog', words: ['0.54.1'] },
    { line: 1, name: 'release date', shape: 'date', source: 'Changelog', words: ['2026-11-04'] },
    { line: 1, name: 'heading', shape: 'phrase', source: 'Changelog', words: ['## ['] },
  ], dropped: [] };
  const jl = [{ n: 1, text: 'Summarise', rule: 'must say 0.54.1', rules: ['must say 0.54.1'] }];
  const rows = build({ jobLines: jl, look: lk, extra: [{ line: 1, kind: 'phrase', source: 'Changelog', phrase: '2026-11-04' }] });
  const by = (k) => rows.find((r) => r.key === k);
  // place rules (look strip): a PHRASE look fact whose version the input's newest heading carries is kept; a date-shape look fact stays dropped
  assert.equal(by('L1.fact.release version').state, 'listed');
  assert.equal(by('L1.fact.release date').reason, CL.WEEK_ONLY_WORDS);
  assert.equal(by('L1.fact.heading').state, 'listed');
  // place rules (P1): an ISO date the input's newest heading carries is kept, a place rule fits it at the draft (it is no longer week-only)
  assert.equal(by('L1.phrase.2026-11-04').state, 'listed');
  assert.equal(by('L1.~1').state, 'listed');
});

test('A9 an empty list (only the floor, or only dropped rows) is logged as ONE explicit record; a list with a real row is not', () => {
  const floorOnly = build({ jobLines: [{ n: 1, text: 'x' }], look: { facts: [] }, texts: null, inputLabels: [] });
  assert.ok(floorOnly.every((r) => r.kind === 'floor'));
  assert.equal(CL.isEmptyList(floorOnly), true);
  const e = CL.ledgerRecord(floorOnly).filter((r) => r.rowKind === 'empty');
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].state, e[0].reason, e[0].key], ['empty', 'empty list: nothing to check', 'empty']);
  const droppedOnly = build({ jobLines: [{ n: 1, text: 'x' }], look: { facts: [{ line: 1, name: 'v', shape: 'number', source: 'Changelog', words: ['0.54.1'] }] }, texts: null, inputLabels: [] });
  assert.equal(CL.isEmptyList(droppedOnly), true);
  // with an input, a line whose look facts were all dropped is a text line: it gets the $ cited row, so the list is not empty
  const textAgain = build({ jobLines: [{ n: 1, text: 'x' }], look: { facts: [{ line: 1, name: 'v', shape: 'number', source: 'Changelog', words: ['0.54.1'] }] } });
  assert.equal(textAgain.find((r) => r.key === 'L1.$cited').state, 'listed');
  assert.equal(CL.isEmptyList(textAgain), false);
  assert.equal(CL.ledgerRecord(build()).some((r) => r.rowKind === 'empty'), false);
});

// ---- A3: the one paid call -----------------------------------------------------------------------------------------------------------------
const scripted = (args, seen = []) => async (m, tools) => {
  seen.push({ tools: tools.map((t) => t.name), user: m.at(-1).content });
  if (args !== null) await tools.find((t) => t.name === CL.LEDGER_TOOL).execute(args);
  return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } };
};

test('A3 runLedgerSuggest: one typed tool call, its cost booked and reported through onCall; the user text shows the job and the input', async () => {
  const seen = []; const booked = [];
  const r = await CL.runLedgerSuggest({ jobLines, texts, generate: scripted({ extra: [{ line: 1, kind: 'count', min: 1, max: 1 }] }, seen), onCall: (c) => booked.push(c) });
  assert.deepEqual(r.extra, [{ line: 1, kind: 'count', min: 1, max: 1 }]);
  assert.equal(r.reason, null);
  assert.deepEqual(seen.map((s) => s.tools), [[CL.LEDGER_TOOL]]);
  assert.match(seen[0].user, /1\. Summarise the latest release/);
  assert.match(seen[0].user, /g1: exactly 3 bullets/);
  assert.match(seen[0].user, /Input "Changelog":/);
  assert.deepEqual(booked.map((c) => [c.label, c.costUsd]), [['ledger-suggest', 0.0009]]);
  assert.equal(r.calls.length, 1);
});

test('A3 runLedgerSuggest: an unusable answer (twice) is NOT a guessed list: no proposals, a reason, both calls booked', async () => {
  const r = await CL.runLedgerSuggest({ jobLines, texts, generate: scripted(null) });
  assert.deepEqual(r.extra, []);
  assert.equal(typeof r.reason, 'string');
  assert.equal(r.calls.length, 2, 'one retry, both booked');
});

test('A3 the call system text is the signed one (count and phrase only, up to 3, or an empty list)', () => {
  assert.equal(CL.LEDGER_SYSTEM, 'You look at the inputs of a job and name checks the inputs themselves support, beyond the guardrails the person wrote.\n'
    + 'Call suggest_extra_checks once with up to 3 entries, or with an empty list.\n'
    + '- kind "count": how many results the input shows or the job asks for (min and/or max, whole numbers).\n'
    + '- kind "phrase": fixed words copied verbatim from an input (phrase, and source = that input\'s label).\n'
    + 'Use only what you can see in the inputs. Do not repeat a guardrail the person wrote. If the inputs support none, send an empty list.');
  assert.deepEqual(CL.LEDGER_SCHEMA.properties.extra.items.properties.kind.enum, ['count', 'phrase']);
});

// ---- A6 / A7 / A8: after each try -------------------------------------------------------------------------------------------------------------
const decl = (parts, extra = {}) => ({ stages: [{ name: 'changed', kind: 'files-changed', params: {} }, { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts } }], ...extra });
const partsOf = (d) => d.stages[1].params.parts;

test('A6 applyLedger: a fact with a listed name stays; an off-list fact, count and cited go to Not checked "not on the list"; a fact\'s count rides with its kept fact; ~ parts stay', () => {
  const rows = build();
  const d = decl([
    { text: 'x', class: 'fact', source: 'Changelog', facts: [{ name: 'release heading', shape: 'phrase', phrase: '## [' }, { name: 'made up', shape: 'phrase', phrase: 'q' }], count: { min: 3 } },
    { text: 'exactly 3 bullets', class: 'countable', check: 'listItems', value: 3, rules: [1] },
    { text: 'quote it', class: 'countable', check: 'cited', source: 'Changelog' },
    { text: 'judged thing', class: 'judged' },
  ]);
  const r = CL.applyLedger(d, rows);
  const parts = partsOf(r.declaration);
  assert.deepEqual(parts[0].facts.map((f) => f.name), ['release heading']);
  assert.deepEqual(parts[0].count, { min: 3 }, 'the count rides with its kept fact');
  assert.ok(parts.some((p) => p.check === 'listItems'));
  assert.ok(!parts.some((p) => p.check === 'cited'));
  assert.ok(parts.some((p) => p.class === 'judged'));
  assert.deepEqual(r.refused.map((x) => x.kind).sort(), ['cited', 'fact']);
  assert.ok(r.refused.every((x) => x.reason === 'not on the list'));
  assert.ok(r.declaration.notes.every((n) => n.includes(CL.OFF_LIST_WORDS)));
  assert.equal(r.units, 5);
});

test('A6 a fact part with no listed fact and no rule is removed whole, its count with it; an unchanged declaration comes back as it was', () => {
  const rows = build({ look: { facts: [] } });
  const r = CL.applyLedger(decl([{ text: 'x', class: 'fact', source: 'Changelog', facts: [{ name: 'q', shape: 'phrase', phrase: 'q' }], count: { min: 1 } }]), rows);
  assert.deepEqual(r.refused.map((x) => x.kind).sort(), ['count', 'fact']);
  assert.equal(partsOf(r.declaration).length, 0);
  const same = decl([{ text: 'n', class: 'none' }]);
  assert.deepEqual(CL.applyLedger(same, rows).declaration, same);
});

test('A6 a count part counts only where a ! count row stands', () => {
  const withRow = build({ look: { facts: [] }, extra: [{ line: 1, kind: 'count', min: 2 }], jobLines: [{ n: 1, text: 'x' }] });
  const mk = () => decl([{ text: 'at least 2', class: 'countable', check: 'minClaims', value: 2 }]);
  assert.equal(CL.applyLedger(mk(), withRow).refused.length, 0);
  const without = build({ look: { facts: [] }, jobLines: [{ n: 1, text: 'x' }] });
  assert.deepEqual(CL.applyLedger(mk(), without).refused.map((x) => x.kind), ['minClaims']);
});

test('A7 a text stage gets ONE default cited part (the drafter\'s own cited parts are replaced), a fact stage none', () => {
  const rows = build({ look: { facts: [] } });
  const d = decl([
    { text: 'x', class: 'countable', check: 'cited', source: 'Changelog' },
    { text: 'the summary says 0.54.1', class: 'countable', check: 'cited', source: 'Changelog' },
    { text: 'exactly 3 bullets', class: 'countable', check: 'listItems', value: 3, rules: [1] },
  ]);
  const r = CL.applyLedger(d, rows, { labels: ['Changelog'] });
  const parts = partsOf(r.declaration);
  assert.equal(parts.filter((p) => p.check === 'cited').length, 1);
  assert.equal(parts.find((p) => p.check === 'cited').source, 'Changelog');
  assert.deepEqual(r.refused, []);
  assert.equal(r.units, 1, 'only the pick-carrying part counted; the default is not a drafter unit');
  const fs = CL.applyLedger(decl([{ text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'release heading', shape: 'phrase', phrase: '## [' }] }]), build(), { labels: ['Changelog'] });
  assert.ok(!partsOf(fs.declaration).some((p) => p.check === 'cited'));
});

test('A7 a stage whose fact parts were all refused as off-list is a text stage after all and gets the default cited part', () => {
  const rows = build({ look: { facts: [] } });
  const r = CL.applyLedger(decl([{ text: 'x', class: 'fact', source: 'Changelog', facts: [{ name: 'made up', shape: 'phrase', phrase: 'q' }] }]), rows, { labels: ['Changelog'] });
  assert.deepEqual(partsOf(r.declaration).map((p) => p.check), ['cited']);
  assert.equal(r.refused.length, 1);
});

test('A7 ensureCited decides the default AFTER everything settled: a step with no fact part gets it, a step holding a fact part or a job with two inputs is untouched', () => {
  const pre = decl([{ text: 'exactly 3 bullets', class: 'countable', check: 'listItems', value: 3, rules: [1] }]);
  assert.deepEqual(partsOf(CL.ensureCited(pre, ['Changelog'])).map((p) => p.check), ['listItems', 'cited']);
  assert.deepEqual(CL.ensureCited(pre, ['Changelog', 'B']), pre);
  const withFact = decl([{ text: 's', class: 'fact', facts: [] }]);
  assert.equal(partsOf(CL.ensureCited(withFact, ['Changelog'])).length, 1);
});

test('A8 applyLedger refuses a drafter fact whose phrase holds a version (reason week-only, plain words in the notes) unless a ~ rule carries it', () => {
  const rows = build({ look: { facts: [] } });
  const r = CL.applyLedger(decl([
    { text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'release version', shape: 'phrase', phrase: '0.54.1' }], rules: [1] },
    { text: 'g', class: 'fact', source: 'Changelog', facts: [{ name: 'release date', shape: 'phrase', phrase: 'Nov 4, 2026' }] },
  ]), rows, { labels: ['Changelog'] });
  assert.deepEqual(r.refused.map((x) => [x.words, x.reason]), [['release date', 'week-only']]);
  assert.ok(r.declaration.notes.some((n) => n.includes(CL.WEEK_ONLY_WORDS)));
  assert.equal(partsOf(r.declaration).length, 1);
});

// ---- A9: every row ends built / not-checked (reason) / dropped (reason) ----------------------------------------------------------------------
test('A9 resolveLedger: every standing row ends built or not-checked with a reason; dropped keeps its reason; the record has one object per row', () => {
  const rows = build({ extra: [{ line: 1, kind: 'count', min: 1, max: 1 }] });
  const d = decl([{ text: 'x', class: 'fact', source: 'Changelog', facts: [{ name: 'release heading', shape: 'phrase', phrase: '## [' }] }], { refused: [{ line: 1, rule: 1, reason: 'judge it' }] });
  const fin = CL.resolveLedger(rows, d);
  for (const r of fin) { assert.ok(['built', 'not-checked', 'dropped'].includes(r.state)); assert.ok(r.state === 'built' || (typeof r.reason === 'string' && r.reason !== '')); }
  const by = (k) => fin.find((r) => r.key === k);
  assert.equal(by('L1.fact.release heading').state, 'built');
  assert.equal(by('L1.~1').state, 'not-checked');
  assert.equal(by('L1.~1').reason, 'judge it');
  assert.equal(by('L1.$floor').state, 'built');
  assert.equal(fin.find((r) => r.kind === 'count').state, 'not-checked');
  assert.equal(by('L1.fact.invented').state, 'dropped');
  assert.equal(CL.ledgerRecord(fin).length, fin.length);
  assert.ok(CL.ledgerRecord(fin).every((r) => r.rowKind && r.kind === undefined && r.key && r.by && r.from && r.state));
});

test('A9 a ~ rule a part carries is built; a fact\'s own count builds a ! count row; a default put on a line the list did not foresee gets its row', () => {
  const rows = build({ extra: [{ line: 1, kind: 'count', min: 1, max: 1 }] });
  const d = decl([
    { text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'release heading', shape: 'phrase', phrase: '## [' }], count: { min: 1, max: 1 } },
    { text: 'exactly 3 bullets', class: 'countable', check: 'listItems', value: 3, rules: [1] },
  ]);
  const fin = CL.resolveLedger(rows, d);
  assert.equal(fin.find((r) => r.key === 'L1.~1').state, 'built');
  assert.equal(fin.find((r) => r.kind === 'count').state, 'built');
  // the list foresaw a fact line; the drafter made it a text line, and code put the default there
  const text = CL.applyLedger(decl([{ text: 'n', class: 'none' }]), rows, { labels: ['Changelog'] }).declaration;
  const fin2 = CL.resolveLedger(rows, text);
  assert.equal(fin2.find((r) => r.key === 'L1.$cited').state, 'built');
  assert.equal(fin2.find((r) => r.key === 'L1.$cited').from, 'default');
});

test('A9 a $ cited row on a line the drafter made a fact line is not-checked with a reason', () => {
  const rows = build({ look: { facts: [] } });
  const d = CL.applyLedger(decl([{ text: 'f', class: 'fact', source: 'Changelog', facts: [{ name: 'q', shape: 'phrase', phrase: 'q' }], rules: [1] }]), rows, { labels: ['Changelog'] }).declaration;
  const c = CL.resolveLedger(rows, d).find((r) => r.key === 'L1.$cited');
  assert.equal(c.state, 'not-checked');
  assert.match(c.reason, /finds facts/);
});

// ---- A5: the drafter's block ------------------------------------------------------------------------------------------------------------------
test('A5 the drafter block lists only standing rows, says "$" rows are code\'s, and states the count-part rule', () => {
  const rows = build({ jobLines: textJob, look: factLook });
  const b = CL.ledgerBlock(rows);
  assert.match(b, /THE LIST OF CHECKS/);
  assert.match(b, /! fact "release heading"/);
  assert.match(b, /line 2, \$ default: every claim is backed by a quote copied from "Changelog" \(code adds it; write no part for it\)/);
  assert.match(b, /line 2, \$ default: every number in the text is in a quote checked on line 1/);
  assert.match(b, /a count part only where a "!" count row is listed or it counts a listed fact/);
  assert.doesNotMatch(CL.ledgerBlock(build()), /invented/);
  assert.match(CL.ledgerBlock(build()), /~ rule 1: "exactly 3 bullets"/);
  assert.doesNotMatch(b, /the person confirmed|CONFIRMED/);
});
