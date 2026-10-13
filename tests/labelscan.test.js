// PART 1c - the LABEL LIST (src/labelscan.js): code scans a source at $0 and lists, per shape, the words right before a value with
// how often each occurs; the look and the drafter pick labels only from it. One generic scan: the same function reads a flights page
// and a changelog. Real data: the repo's own CHANGELOG.md, and a SAVED real Google Flights page copied into a temp dir (the page
// itself is never committed; the test skips, saying so, on a machine that does not hold the saved copy).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLabels, labelOnList, renderLabelList, normLabel, LABEL_SHAPES } from '../src/labelscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAVED = '/tmp/claude-1000/-home-hamr-PycharmProjects-bareloop/3358eeaf-508a-4b57-b441-d799865adbe2/scratchpad/live1d/input/flights-sfo-lax.txt';

/** a small hand-built flight-shaped page: the shapes of a real results page (page-reader tags, U+202F before AM/PM), none of its content */
const NNBSP = ' ';
const flight = (n, price, dep, arr) => [
  `- link "From ${price} US dollars. Nonstop flight with Alpha Air. Leaves First City International Airport at ${dep} on Thursday, March 5 and arrives at Second City International Airport at ${arr} on Thursday, March 5. Total duration 1 hr 30 min. Select flight" [ref=${n}49]`,
  `  - generic "Departure time: ${dep}." [ref=${n}97]`,
  `  - generic "Arrival time: ${arr}." [ref=${n}98]`,
].join('\n');
const HAND = [flight(1, 43, `9:09${NNBSP}AM`, `10:41${NNBSP}AM`), flight(2, 59, `12:00${NNBSP}PM`, `1:28${NNBSP}PM`), flight(3, 71, `6:00${NNBSP}AM`, `7:30${NNBSP}AM`)].join('\n');

const has = (scan, shape, label) => scan[shape].some((r) => r.label === label);

test('a hand-built flight-shaped page: the label before each price, time and place is listed with its count, and no page-reader id is ever a label', () => {
  const s = scanLabels(HAND);
  assert.ok(has(s, 'money', 'From'));
  assert.ok(has(s, 'time', 'Departure time:'));
  assert.ok(has(s, 'time', 'Arrival time:'));
  assert.ok(has(s, 'text', 'Leaves'));
  assert.ok(has(s, 'text', 'arrives at'));
  assert.equal(s.money.find((r) => r.label === 'From')?.count, 3);
  assert.equal(s.text.find((r) => r.label === 'Leaves')?.count, 3);
  for (const shape of LABEL_SHAPES) for (const r of s[shape]) {
    assert.doesNotMatch(r.label, /ref=|\d/, `${shape}: ${r.label}`);
    assert.ok(r.count >= 2, 'only a label that repeats is listed');
  }
  // ids are the list's own and stable
  assert.deepEqual(s.money.map((r) => r.id), s.money.map((_, i) => `m${i + 1}`));
});

test('a value written with U+202F before AM/PM is still found, and a label with a different kind of space is the same label', () => {
  const s = scanLabels(HAND);
  assert.ok(s.time.some((r) => /^\d{1,2}:\d{2} AM/.test(r.example)), JSON.stringify(s.time.slice(0, 3)));
  assert.equal(labelOnList(s, 'time', `Departure${NNBSP}time:`)?.label, 'Departure time:');
  assert.equal(labelOnList(s, 'time', '  "Departure time:"  ')?.label, 'Departure time:');
  assert.equal(normLabel(`a${NNBSP}${NNBSP}b c`), 'a b c');
});

test('labelOnList: by id or exact words, scoped to its shape; a word not on the list is null (the $0 red), never a near match', () => {
  const s = scanLabels(HAND);
  const dep = s.time.find((r) => r.label === 'Departure time:');
  assert.equal(labelOnList(s, 'time', dep.id), dep);
  assert.equal(labelOnList(s, 'time', 'Departure time:'), dep);
  assert.equal(labelOnList(s, 'money', 'Departure time:'), null, 'a time label is not a money label');
  assert.equal(labelOnList(s, 'time', 'Departs'), null);
  assert.equal(labelOnList(s, 'time', 'Departure'), null, 'a part of a label is not the label');
  assert.equal(labelOnList(s, 'time', ''), null);
  assert.equal(labelOnList(s, 'time', 5), null);
  assert.equal(labelOnList(s, 'nope', 'From'), null);
});

test('renderLabelList: one block per shape that has labels, each row with its id, words, count and an example', () => {
  const out = renderLabelList('Flights', scanLabels(HAND));
  assert.match(out, /^LABELS IN THE INPUT "Flights" - pick a label ONLY from this list/);
  assert.match(out, /money \(the words right before a money\):/);
  assert.match(out, /m1 {2}"From" {2}x3 {2}e\.g\. "43 US dollars"/);
  assert.match(renderLabelList('Empty', scanLabels('nothing to see')), /\(no repeated label was found before a value\)/);
});

test('the saved REAL Google Flights page (copied into a temp dir): Departure time:, From, Leaves and arrives at are on the list', (t) => {
  if (!existsSync(SAVED)) { t.skip('the saved results page is not on this machine'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'labelscan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const copy = join(dir, 'flights.txt');
  copyFileSync(SAVED, copy);
  const s = scanLabels(readFileSync(copy, 'utf8'));
  assert.ok(has(s, 'time', 'Departure time:'), JSON.stringify(s.time));
  assert.ok(has(s, 'money', 'From'), JSON.stringify(s.money));
  assert.ok(has(s, 'text', 'Leaves'), JSON.stringify(s.text));
  assert.ok(has(s, 'text', 'arrives at'), JSON.stringify(s.text));
  assert.ok(s.time.find((r) => r.label === 'Departure time:').count >= 40, 'counted over the 40+ flights on the page');
  for (const shape of LABEL_SHAPES) for (const r of s[shape]) assert.doesNotMatch(r.label, /ref=/);
});

test('the repo CHANGELOG: `## [` (before each version) and `] -` (before a date) are on the list - the same scan, no site table', () => {
  const s = scanLabels(readFileSync(join(HERE, '..', 'CHANGELOG.md'), 'utf8'));
  const head = s.text.find((r) => r.label === '## [');
  assert.ok(head, JSON.stringify(s.text.slice(0, 8)));
  assert.ok(head.count >= 20, `## [ x${head.count}`);
  assert.match(head.example, /^\d+\.\d+\.\d+/);
  const dash = s.date.find((r) => r.label === '] -');
  assert.ok(dash, JSON.stringify(s.date.slice(0, 8)));
  assert.match(dash.example, /^\d{4}-\d{2}-\d{2}$/);
});

test('a scan is bounded and never throws: an empty text, a huge line and a non-string give empty lists', () => {
  for (const x of ['', null, undefined, 42]) assert.deepEqual(Object.values(scanLabels(/** @type {any} */ (x))).map((r) => r.length), [0, 0, 0, 0, 0]);
  const big = scanLabels(`Price $5 `.repeat(200000));
  assert.ok(big.money.length <= 40);
});
