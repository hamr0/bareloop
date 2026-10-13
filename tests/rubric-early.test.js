// PART 1b item 5 — the THREE EARLY TESTS (src/factcheck.js, PRD RF13–RF15) on the person's real frozen input: the words, FOUND,
// ONE per record, TELLS right from wrong. Real data: a copy of this repo's CHANGELOG.md (46 real records). bareguard 0.23 does
// every extraction and comparison; the only double is `probeFn` blinded on purpose, to prove the red for a blind check fires.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { earlyFactTests, earlyFactTestsOfDeclaration, backstopFactTests, MAX_TEST_RECORDS } from '../src/factcheck.js';
import { splitRecords, factRows, sampleOf } from '../src/facts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(HERE, '..', 'CHANGELOG.md'), 'utf8');
const records = splitRecords(text, { start: '## [', end: '\n' });
const dateOf = (r) => /(\d{4}-\d{2}-\d{2})/.exec(r.text)?.[1] ?? null;
const dated = records.filter((r) => dateOf(r)).length;

const part = (facts, over = {}) => ({ text: 'x', class: 'fact', source: 'Changelog', record: { start: '## [', end: '\n' }, facts, ...over });
const VERSION = { name: 'version', shape: 'text', anchor: '## [', until: ']' };
const RELEASED = { name: 'released', shape: 'date', rule: { op: 'gte', value: '2026-10-01' } };
const codes = (r) => r.reds.map((x) => x.code);

test('a sound fact list passes: FOUND counts come from the real records, and the rule\'s split is shown', async () => {
  assert.ok(records.length > 30 && dated === records.length - 1, 'the real file: every release heading has a date (some with a dash, some with an em dash) except [Unreleased]');
  const r = await earlyFactTests({ part: part([VERSION, RELEASED, { name: 'tag', shape: 'phrase', phrase: 'Unreleased' }]), text, line: 1 });
  assert.deepEqual(r.reds, []);
  assert.equal(r.tested.records, records.length);
  const [v, d, t] = r.tested.facts;
  assert.equal(v.found, records.length);
  assert.equal(d.found, dated);
  assert.equal(d.pass + d.fail, dated, 'every found record is either a pass or a fail');
  const expectPass = records.filter((x) => dateOf(x) && dateOf(x) >= '2026-10-01').length;
  assert.equal(d.pass, expectPass, 'the split matches a plain count of the real headings');
  assert.equal(t.found, 1, 'only the [Unreleased] record says "Unreleased"');
  assert.match(v.caught, /^\d+\/\d+$/);
  assert.equal(v.caught.split('/')[0], v.caught.split('/')[1], 'a value changed by code is caught every time');
});

test('the words: a label, unit, phrase or record marker that is not in the input stops drafting and names the word and the input', async () => {
  const r = await earlyFactTests({ part: part([{ name: 'from', shape: 'phrase', phrase: 'SFO' }, { name: 'price', shape: 'money', unit: 'US dollars', anchor: 'Departs' }]), text, line: 3 });
  assert.deepEqual(codes(r), ['rubric-fact-word-missing', 'rubric-fact-word-missing', 'rubric-fact-word-missing']);
  assert.match(r.reds[0].detail, /^line 3: '[^']+' is not in the input "Changelog"\. Change the check to the words the input really uses \(copy them from the input\), or remove it\. Nothing was signed\.$/);
  assert.ok(r.reds.some((x) => x.detail.includes("'Departs'")));
  assert.ok(r.reds.some((x) => x.detail.includes("'SFO'")) && r.reds.some((x) => x.detail.includes("'US dollars'")));
  const m = await earlyFactTests({ part: part([VERSION], { record: { start: 'Flight details' } }), text, line: 1 });
  assert.deepEqual(codes(m), ['rubric-fact-word-missing']);
  const e = await earlyFactTests({ part: part([VERSION], { record: { start: '## [', end: 'no such end' } }), text, line: 1 });
  assert.deepEqual(codes(e), ['rubric-fact-word-missing']);
});

test('FOUND: a check that finds nothing in any record stops drafting ("found in 0 of N")', async () => {
  // "ver": a number right after "[" — a release is "0.41.0" (a version, not a number token), so nothing is found in any record
  const r = await earlyFactTests({ part: part([{ name: 'ver', shape: 'number', anchor: '[' }]), text, line: 1 });
  assert.deepEqual(codes(r), ['rubric-fact-not-found']);
  assert.match(r.reds[0].detail, new RegExp(`fact "ver" is found in 0 of ${records.length} records in "Changelog"`));
  assert.equal(r.tested.facts[0].found, 0);
  const ph = await earlyFactTests({ part: part([{ name: 'tag', shape: 'phrase', phrase: 'Fixed' }], { record: { start: '## [', end: '\n' } }), text, line: 1 });
  assert.deepEqual(codes(ph), ['rubric-fact-not-found'], 'the heading line alone never says "Fixed"');
});

test('ONE per record: a rule on a value that a whole record holds many times over is "ambiguous — add a label"; a label cures it', async () => {
  const bullets = { record: { start: '\n- ', end: '\n' } };
  const many = await earlyFactTests({ part: part([{ name: 'n', shape: 'number', rule: { op: 'gte', value: 1 } }], bullets), text, line: 2 });
  assert.deepEqual(codes(many), ['rubric-fact-ambiguous']);
  assert.match(many.reds[0].detail, /holds more than one number in \d+ of \d+ records — ambiguous\. Add a label \(anchor\)/);
});

test('TELLS: the caught count is real, and a check that does not go red when a value is changed cannot be signed (blind probe, on purpose)', async () => {
  const ok = await earlyFactTests({ part: part([RELEASED]), text, line: 1 });
  assert.deepEqual(ok.reds, []);
  assert.match(ok.tested.facts[0].caught, /^5\/5$/);
  // a probe that cannot see a changed value (as a broken check would): bareguard's real answers, except that a value the record does not
  // hold and that is not the probe is reported as passing
  const realProbe = await probeOf();
  const r = await earlyFactTests({ part: part([{ name: 'when', shape: 'date' }]), text, line: 1, probeFn: async (d, t, v) => {
    const items = await realProbe(d, t, v);
    // blind ONLY a value that is neither the probe nor a real date of this record: i.e. the changed-by-code ones
    return v !== undefined && v !== '0001-01-01' && !t.includes(v) ? [] : items;
  } });
  assert.ok(codes(r).includes('rubric-fact-untested'), JSON.stringify(r.reds));
  assert.match(r.reds[0].detail, /cannot tell right from wrong here: a value changed by code in a real record still passed/);
});

/** the module's own probe, reached through a no-op run (it is not exported): a fact on a one-line text captures the call shape */
async function probeOf() {
  const { createHash } = await import('node:crypto');
  const { createRubric, checkStep } = await import('bareguard');
  return async (decide, t, value) => {
    const spec = { schema: 1, goal: 'x', inputs: [{ name: 'R', sha256: createHash('sha256').update(t).digest('hex') }], checkpoints: { 1: { gating: false, checks: [{ id: 'c', rule: 'cited', claims: 'cites:R', source: 'R', decides: [decide] }] } } };
    const r = await checkStep(createRubric(spec), '1', { 'cites:R': [{ claim: 'x', quote: t, ...(value === undefined ? {} : { values: { d0: value } }) }] }, { inputs: { R: t } });
    return r.full.gaps.flatMap((g) => (g.items ?? []).map((it) => { const m = /^#0:(?:d0:)?([a-z-]+)(?::([\s\S]*))?$/.exec(it); return { reason: m[1], detail: m[2] ?? '' }; }));
  };
}

test('a declaration: each fact part gets its `tested` evidence filled in by code (a model-written one is replaced), and the card shows it', async () => {
  const stage = { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ ...part([VERSION, RELEASED]), tested: { records: 1, of: 1, facts: [] }, sample: 'forged' }] } };
  const sample = sampleOf(text);
  const r = await earlyFactTestsOfDeclaration({ stages: [stage] }, { Changelog: text }, (t) => sampleOf(t).note);
  assert.deepEqual(r.reds, []);
  const p = r.declaration.stages[0].params.parts[0];
  assert.equal(p.tested.records, records.length);
  assert.equal(p.sample, sample.note);
  const rows = factRows(p);
  assert.match(rows[0], new RegExp(`^fact · version — text, .* — tested on the real input: found ${records.length}/${records.length}, a changed value caught 5/5$`));
  assert.match(rows[1], new RegExp(`found ${dated}/${records.length}, \\d+ pass, \\d+ fail`));
  assert.ok(rows.some((x) => x === `fact · input — the AI read ${sample.note}`));
  assert.equal(stage.params.parts[0].sample, 'forged', 'the input declaration is untouched');
  // a fact part whose input is not at hand is never signed untested
  const none = await earlyFactTestsOfDeclaration({ stages: [stage] }, null);
  assert.deepEqual(none.reds.map((x) => x.code), ['rubric-fact-unread']);
});

test('the run-time backstop: the same words / found / one-per-record tests on the source the worker reads; a changed source stops in plain words', async () => {
  const p = part([VERSION, RELEASED]);
  assert.deepEqual(await backstopFactTests({ part: p, text, line: 1 }), []);
  const changed = text.replaceAll('## [', '# [');
  const why = await backstopFactTests({ part: p, text: changed, line: 1 });
  assert.ok(why.length >= 1);
  assert.match(why[0], /^line 1: '## \[' is not in the input "Changelog"/);
  assert.equal(why[0].endsWith('Nothing was signed.'), false, 'the sign-time suffix is dropped at run time');
});

test('a big input is tested on its first records and the count says so', async () => {
  const big = Array.from({ length: MAX_TEST_RECORDS + 20 }, (_, i) => `## [1.0.${i}] - 2026-01-01\n`).join('');
  const r = await earlyFactTests({ part: part([VERSION]), text: big, line: 1 });
  assert.equal(r.tested.records, MAX_TEST_RECORDS);
  assert.equal(r.tested.of, MAX_TEST_RECORDS + 20);
  assert.deepEqual(r.notes, [`tested on the first ${MAX_TEST_RECORDS} of ${MAX_TEST_RECORDS + 20} records`]);
});

test('a phrase that the quoted slice cuts off is a red: the end marker sits before it', async () => {
  const flights = 'Departure time: 8:15 AM Price 389 US dollars Nonstop\n'.repeat(3);
  const p = { source: 'F', record: { start: 'Departure time:', end: 'Nonstop' }, facts: [{ name: 'stops', shape: 'phrase', phrase: 'Nonstop' }] };
  const r = await earlyFactTests({ part: p, text: flights, line: 1 });
  assert.deepEqual(codes(r), ['rubric-fact-not-found']);
});

test('money, number and time facts (the changelog holds none): FOUND, the pass / fail split and the changed-value test on a flight-shaped text', async () => {
  // the changelog has no prices or clock times, so this one text is built to look like a result list: six records, prices 300..500
  const flights = Array.from({ length: 6 }, (_, i) => `Departure time: ${String(6 + i * 4).padStart(2, '0')}:15 AM Price ${300 + i * 40} US dollars Nonstop\n`).join('').replaceAll(/(\d\d):15 AM/g, (_, h) => `${Number(h) % 12 || 12}:15 ${Number(h) < 12 ? 'AM' : 'PM'}`);
  const p = { text: 'x', class: 'fact', source: 'Flights', record: { start: 'Departure time:', end: '\n' }, facts: [
    { name: 'price', shape: 'money', unit: 'US dollars', anchor: 'Price', rule: { op: 'lte', value: 450 } },
    { name: 'departs', shape: 'time', anchor: 'Departure time:', rule: { op: 'between', lo: '06:00', hi: '21:00' } },
    { name: 'fare', shape: 'number', anchor: 'Price' },
    { name: 'stops', shape: 'phrase', phrase: 'Nonstop' },
  ] };
  const r = await earlyFactTests({ part: p, text: flights, line: 1 });
  assert.deepEqual(r.reds, [], JSON.stringify(r.reds));
  const [price, departs, fare, stops] = r.tested.facts;
  assert.deepEqual([price.found, price.pass, price.fail], [6, 4, 2], 'prices 300 340 380 420 pass, 460 500 fail');
  assert.deepEqual([departs.found], [6]);
  assert.equal(departs.pass + departs.fail, 6);
  assert.equal(fare.found, 6);
  assert.equal(stops.found, 6);
  assert.ok(price.caught === '5/5' && fare.caught === '5/5' && departs.caught === '5/5');
});

test('A2: an end marker that is in the input but not in some records is its own red naming the marker and how many records lack it', async () => {
  // three records; the third never says "DONE" after its start, so its slice would silently be the whole record
  const mini = 'REC one DONE\nREC two DONE\nREC three, no end marker here\n';
  const p = { text: 'x', class: 'fact', source: 'Mini', record: { start: 'REC ', end: 'DONE' }, facts: [{ name: 'tag', shape: 'text' }] };
  const r = await earlyFactTests({ part: p, text: mini, line: 1 });
  assert.deepEqual(r.reds.map((x) => x.code), ['rubric-fact-record-end']);
  assert.match(r.reds[0].detail, /the end marker "DONE" is not found after "REC " in 1 of the 3 records in "Mini"/);
  assert.doesNotMatch(r.reds[0].detail, /longer than/, 'it must not read as "too long"');
  // every record lacking it reads "none of the N records"
  const none = await earlyFactTests({ part: { ...p, record: { start: 'REC ', end: 'o' } }, text: 'REC a\nREC b\n', line: 1 });
  assert.match(none.reds.map((x) => x.detail).join(' '), /(not in the input|none of the 2 records)/);
  // all records hold it: no such red
  const ok = await earlyFactTests({ part: p, text: 'REC one DONE\nREC two DONE\n', line: 1 });
  assert.ok(!ok.reds.some((x) => x.code === 'rubric-fact-record-end'));
  // an end marker that is the very first thing after a record (it opens the next record too) still ends that record
  const edge = splitRecords('\n- a\n- b\n', { start: '\n- ', end: '\n' });
  assert.deepEqual(edge.map((x) => x.endFound), [true, true]);
});

test('A1: a record that is too long is named by its first line, with its length, the end marker given (or none) and an example from that record', async () => {
  const big = `## [9.9.9] - 2026-01-02\n${'- a bullet line\n'.repeat(400)}`;
  const doc = `${big}## [9.9.8] - 2026-01-01\n- small\n`;
  const p = { text: 'x', class: 'fact', source: 'Changelog', record: { start: '## [' }, facts: [{ name: 'tag', shape: 'phrase', phrase: 'small' }] };
  const none = await earlyFactTests({ part: p, text: doc, line: 1 });
  assert.deepEqual(codes(none), ['rubric-fact-record-long']);
  const d = none.reds[0].detail;
  assert.match(d, /the record in "Changelog" that starts "## \[9\.9\.9\] - 2026-01-02" is \d{4} characters long/);
  assert.match(d, /no end marker was given/);
  assert.match(d, /For example, end the slice at the end of its first line \(record\.end = "\\n"\), which cuts this record to 23 characters/);
  // an end marker that IS found but still leaves it long is named
  const given = await earlyFactTests({ part: { ...p, record: { start: '## [', end: '- small' } }, text: `${big}- small\n`, line: 1 });
  assert.match(given.reds.map((x) => x.detail).join(' '), /the end marker given was "- small"/);
  // the cure the message gives actually clears it
  const fixed = await earlyFactTests({ part: { ...p, record: { start: '## [', end: '\n' }, facts: [{ name: 'v', shape: 'text', anchor: '## [', until: ']' }] }, text: doc, line: 1 });
  assert.deepEqual(fixed.reds, []);
});
