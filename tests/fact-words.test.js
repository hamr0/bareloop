// PART 1c item (d) - the FOUND-ONCE check (src/factwords.js): code proves every word a fact depends on is really in the source (once is
// enough, white-space blind) and every label is PICKED from the input's own list. Real data: the repo's CHANGELOG.md and, when the
// machine holds it, a SAVED real Google Flights page copied into a temp dir (never committed).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countExact, countPhrase, checkFactWords, checkDeclarationWords, proverOf, squash } from '../src/factwords.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAVED = '/tmp/claude-1000/-home-hamr-PycharmProjects-bareloop/3358eeaf-508a-4b57-b441-d799865adbe2/scratchpad/live1d/input/flights-sfo-lax.txt';
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const CHANGELOG = readFileSync(join(HERE, '..', 'CHANGELOG.md'), 'utf8');
const NN = ' ';

test('countExact is white-space blind (U+202F, U+00A0) and exact in case; empty words are never found', () => {
  const src = `Departure time: 9:09${NN}AM and again 9:09 AM`;
  assert.equal(countExact(src, '9:09 AM'), 2);
  assert.equal(countExact(src, `Departure${NN}time:`), 1);
  assert.equal(countExact(src, 'departure time:'), 0, 'a label is exact in case');
  assert.equal(countExact(src, ''), 0);
  assert.equal(squash(`a${NN}${NN}b`), 'a b');
});

test('countPhrase finds WHOLE words, case and spacing aside: SFO is not found inside sfocus', () => {
  assert.equal(countPhrase('Flights to SFO and back', 'sfo'), 1);
  assert.equal(countPhrase('the sfocus group', 'SFO'), 0);
  assert.equal(countPhrase('**Non  stop** flight', 'non stop'), 1);
  assert.equal(countPhrase('x', ''), 0);
});

const part = (facts, over = {}) => ({ text: 't', class: 'fact', source: 'Changelog', facts, ...over });

test('a label that is PICKED from the input\'s list passes; one that is typed - the job\'s own word, an invented label - is a red naming the word, the input and the list', () => {
  const ok = checkFactWords({ part: part([{ name: 'version', shape: 'text', anchor: '## [', until: ']' }, { name: 'released', shape: 'date', anchor: '] -' }]), text: CHANGELOG, line: 1 });
  assert.deepEqual(ok, []);
  const bad = checkFactWords({ part: part([{ name: 'version', shape: 'text', anchor: 'Release number:', until: ']' }, { name: 'released', shape: 'date', anchor: 'from' }]), text: CHANGELOG, line: 1 });
  assert.deepEqual(bad.map((r) => r.code), ['rubric-fact-label-off-list', 'rubric-fact-label-off-list']);
  assert.match(bad[0].detail, /^line 1: fact "version": the label "Release number:" is not one of the labels the input "Changelog" holds before a text value\. A label is picked from that list, never typed: /);
  assert.match(bad[0].detail, /Nothing was signed\.$/);
  assert.match(bad[1].detail, /the label "from" is not one of the labels the input "Changelog" holds before a date/);
  // the list is per shape: a date label is not a money label
  const wrongShape = checkFactWords({ part: part([{ name: 'cost', shape: 'money', currency: '$', anchor: '] -' }]), text: CHANGELOG, line: 2 });
  assert.equal(wrongShape[0].code, 'rubric-fact-label-off-list');
});

test('until, phrase and unit must be in the source: a word not found is a red naming the word and the input', () => {
  const r = checkFactWords({ part: part([
    { name: 'a', shape: 'text', anchor: '## [', until: '@@nowhere@@' },
    { name: 'b', shape: 'phrase', phrase: 'Totally Absent Phrase' },
    { name: 'c', shape: 'money', unit: 'quatloos', anchor: undefined },
    { name: 'd', shape: 'phrase', phrase: 'Keep a Changelog' },
  ]), text: CHANGELOG, line: 3 });
  assert.deepEqual(r.map((x) => x.code), ['rubric-fact-word-missing', 'rubric-fact-word-missing', 'rubric-fact-word-missing']);
  assert.match(r[0].detail, /"@@nowhere@@" is not in the input "Changelog"/);
  assert.match(r[1].detail, /"Totally Absent Phrase" is not in the input "Changelog"/);
  assert.match(r[2].detail, /the unit "quatloos" is not in the input "Changelog"/);
});

test('checkDeclarationWords: every fact part is proved against its own input; an input that cannot be read is a red, never a skipped check', () => {
  const decl = (facts, source = 'Changelog') => ({ stages: [{ name: 'l1', kind: 'rubric-step', params: { step: 1, parts: [part(facts, { source })] } }, { name: 'g', kind: 'files-changed', params: {} }] });
  assert.deepEqual(checkDeclarationWords(decl([{ name: 'version', shape: 'text', anchor: '## [' }]), { Changelog: CHANGELOG }), []);
  const bad = checkDeclarationWords(decl([{ name: 'version', shape: 'text', anchor: 'Edition' }]), { Changelog: CHANGELOG });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].path, 'stages[0].params.parts[0]');
  const unread = checkDeclarationWords(decl([{ name: 'version', shape: 'text' }], 'Other'), { Changelog: CHANGELOG });
  assert.deepEqual(unread.map((r) => r.code), ['rubric-fact-unread']);
  assert.deepEqual(checkDeclarationWords(decl([{ name: 'v', shape: 'text' }]), null).map((r) => r.code), ['rubric-fact-unread']);
  assert.deepEqual(checkDeclarationWords(null, {}), []);
});

test('the saved REAL flights page (temp copy): the picked labels and the direction phrases are proved, white-space blind; the job\'s own words are refused', (t) => {
  if (!existsSync(SAVED)) { t.skip('the saved results page is not on this machine'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'fact-words-'));
  made.push(dir);
  const copy = join(dir, 'flights.txt');
  copyFileSync(SAVED, copy);
  const text = readFileSync(copy, 'utf8');
  const flights = (facts) => ({ text: 'f', class: 'fact', source: 'Flights', facts });
  const ok = checkFactWords({ line: 1, text, part: flights([
    { name: 'price', shape: 'money', unit: 'US dollars', anchor: 'From' },
    { name: 'departs', shape: 'time', anchor: 'Departure time:' },
    { name: 'origin', shape: 'phrase', phrase: 'Leaves San Francisco International Airport' },
    { name: 'dest', shape: 'phrase', phrase: 'arrives at Los Angeles International Airport' },
  ]) });
  assert.deepEqual(ok, []);
  const typed = checkFactWords({ line: 1, text, part: flights([{ name: 'departs', shape: 'time', anchor: 'Departs' }, { name: 'to', shape: 'text', anchor: 'Whither' }]) });
  assert.deepEqual(typed.map((r) => r.code), ['rubric-fact-label-off-list', 'rubric-fact-label-off-list']);
  const prove = proverOf({ Flights: text });
  assert.ok(prove('Flights', 'Leaves San Francisco International Airport') > 40);
  assert.equal(prove('Flights', 'Leaves Nowhere Airport'), 0);
  assert.equal(prove('Nope', 'x'), 0);
});

// ── M1 (Part 1c full-run fixes): a label that starts each result must repeat as often as results were asked for ─────────────────────
const MV73_PAGE = '/home/hamr/.config/bareloop/panel-sessions/smv73148pw343/source-seed/tree/input/flights.txt';

test('M1: a label counted fewer times than the line asks for results is a red naming the label, its count and N; one counted enough passes (CHANGELOG)', () => {
  // `## [` sits before 45 text values, `(` 179: both repeat; a label the list counts once cannot be in each of 3 results
  const ok = checkFactWords({ part: part([{ name: 'version', shape: 'text', anchor: '## [' }], { count: { min: 3, max: 3 } }), text: CHANGELOG, line: 1 });
  assert.deepEqual(ok, []);
  // a synthetic page with a once-only label and a repeated one, scanned by the real scanner
  const text = ['Sort: Cheapest from $37', ...Array.from({ length: 5 }, (_, i) => `Flight ${i}: From $${50 + i} Leaves 10:0${i} AM`)].join('\n');
  const rare = checkFactWords({ part: part([{ name: 'cheapest', shape: 'money', currency: '$', anchor: 'Cheapest from' }], { count: { min: 3, max: 3 }, source: 'Page' }), text, line: 1 });
  assert.deepEqual(rare.map((r) => r.code), ['rubric-fact-label-rare']);
  assert.match(rare[0].detail, /the label "Cheapest from" is in the input "Page" only 1 time, but this line asks for 3 results/);
  assert.match(rare[0].detail, /at least 3 times/);
  assert.deepEqual(checkFactWords({ part: part([{ name: 'price', shape: 'money', currency: '$', anchor: 'From' }], { count: { min: 3, max: 3 }, source: 'Page' }), text, line: 1 }), []);
  // a line asking for one result, or with no count, may use a once-only label
  assert.deepEqual(checkFactWords({ part: part([{ name: 'cheapest', shape: 'money', currency: '$', anchor: 'Cheapest from' }], { count: { min: 1, max: 1 }, source: 'Page' }), text, line: 1 }), []);
  assert.deepEqual(checkFactWords({ part: part([{ name: 'cheapest', shape: 'money', currency: '$', anchor: 'Cheapest from' }], { source: 'Page' }), text, line: 1 }), []);
});

test('M1 on the REAL frozen page of run mv73swnx (copied to a temp dir, never committed): "Cheapest from" and "departing" are refused for 3 results, "Departure time:" and "From" accepted', { skip: !existsSync(MV73_PAGE) }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'm1-page-'));
  made.push(dir);
  const copy = join(dir, 'flights.txt');
  copyFileSync(MV73_PAGE, copy);
  const text = readFileSync(copy, 'utf8');
  const p = part([
    { name: 'from price', shape: 'money', currency: '$', anchor: 'From' },
    { name: 'cheapest price', shape: 'money', currency: '$', anchor: 'Cheapest from' },
    { name: 'departure time', shape: 'time', anchor: 'Departure time:' },
    { name: 'departing date', shape: 'date', anchor: 'departing' },
  ], { count: { min: 3, max: 3 }, source: 'Flights' });
  const reds = checkFactWords({ part: p, text, line: 1 });
  assert.deepEqual(reds.map((r) => r.code), ['rubric-fact-label-rare', 'rubric-fact-label-rare']);
  assert.match(reds[0].detail, /fact "cheapest price": the label "Cheapest from" is in the input "Flights" only 1 time, but this line asks for 3 results/);
  assert.match(reds[1].detail, /fact "departing date": the label "departing" is in the input "Flights" only 1 time/);
  const good = checkFactWords({ part: part([{ name: 'departure time', shape: 'time', anchor: 'Departure time:' }], { count: { min: 3, max: 3 }, source: 'Flights' }), text, line: 1 });
  assert.deepEqual(good, []);
});

test('M1: the ONE rulebook tells it, the brief and the confirm note carry it, and the red reaches the person in its own plain words', async () => {
  const { RUBRIC_RULES, REQUIRED_FACTS_BRIEF } = await import('../src/authorflow.js');
  const { proposalStopText } = await import('../src/authorreadout.js');
  assert.match(RUBRIC_RULES, /asks for N results[\s\S]*N or more times/);
  assert.ok(REQUIRED_FACTS_BRIEF.includes(RUBRIC_RULES), 'the brief interpolates the one rulebook');
  const decl = { stages: [{ kind: 'rubric-step', params: { step: 1, parts: [part([{ name: 'c', shape: 'money', currency: '$', anchor: 'Cheapest from' }], { count: { min: 3, max: 3 }, source: 'Page' })] } }] };
  const text = ['Sort: Cheapest from $37', ...Array.from({ length: 5 }, (_, i) => `Flight ${i}: From $${50 + i}`)].join('\n');
  const reds = checkDeclarationWords(decl, { Page: text });
  assert.deepEqual(reds.map((r) => r.code), ['rubric-fact-label-rare']);
  assert.match(proposalStopText({ reds }), /"Cheapest from" is in the input "Page" only 1 time, but this line asks for 3 results/);
});
