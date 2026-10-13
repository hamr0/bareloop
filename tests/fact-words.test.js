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
