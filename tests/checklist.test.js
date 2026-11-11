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
  assert.equal(by('L1.fact.release version').reason, CL.WEEK_ONLY_WORDS);
  assert.equal(by('L1.fact.release date').reason, CL.WEEK_ONLY_WORDS);
  assert.equal(by('L1.fact.heading').state, 'listed');
  assert.equal(by('L1.phrase.2026-11-04').reason, CL.WEEK_ONLY_WORDS);
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
