// PART 1b live fix B3 — every rubric red has a plain sentence: no "has no plain wording yet" for rubric-step-twice, for invalid-value on a
// fact field, or for any rubric red code. The code list is read from source, so a NEW rubric red code fails here until it is mapped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plainReasons, signingReasons, redsRecord, draftStopText } from '../src/authorreadout.js';
import { rubricStepShapeReds } from '../src/rubricstep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, '..', 'src', f), 'utf8');
/** every rubric red code the rubric-step code can raise, read from the three source files that raise them */
const CODES = [...new Set(['rubricstep.js', 'facts.js', 'factcheck.js'].flatMap((f) => [...read(f).matchAll(/\bred\('(rubric-[a-z-]+)'/g)].map((m) => m[1])))].sort();

test('B3: the source scan finds the rubric red codes (so the sweep below cannot pass over nothing)', () => {
  assert.ok(CODES.length >= 22, `found ${CODES.length}: ${CODES.join(', ')}`);
  for (const c of ['rubric-step-twice', 'rubric-fact-record-long', 'rubric-fact-record-end', 'rubric-rule-dropped', 'rubric-contradiction']) assert.ok(CODES.includes(c), c);
});

test('B3: every rubric red code reads as a plain sentence on both doors (proposal and signing), never "unmapped"', () => {
  for (const code of CODES) {
    const red = { code, path: 'stages[1].params.parts[0]', detail: `line 1: a sentence for ${code}. Nothing was signed.` };
    for (const [door, rs] of [['proposal', plainReasons([red])], ['signing', signingReasons([red])]]) {
      assert.equal(rs.length, 1, `${door} ${code}`);
      assert.notEqual(rs[0].kind, 'unmapped', `${door}: ${code} has no plain wording`);
      assert.doesNotMatch(rs[0].sentence, /no plain wording yet/);
      assert.match(rs[0].sentence, new RegExp(`a sentence for ${code}\\.`), `${door}: the red's own whole sentence is what is said`);
    }
  }
});

test('B3: the two live sessions\' reds (rubric-step-twice; invalid-value on a fact field) read in plain words, in the log record and the stop text', () => {
  const live = [
    { code: 'rubric-step-twice', path: 'stages[3].params.step', detail: 'line 2: stages "a" and "b" both read the file for job line 2. Give each job line one stage.' },
    { code: 'invalid-value', path: 'stages[1].params.parts[0].facts[4].until', detail: 'until closes a text fact only' },
    { code: 'invalid-value', path: 'stages[1].params.parts[0].facts[0].anchor', detail: 'a phrase is fixed words the quote must contain; it has no anchor, until or rule' },
  ];
  const rec = redsRecord(live);
  assert.ok(rec.every((r) => r.kind !== 'unmapped'), JSON.stringify(rec.map((r) => r.kind)));
  assert.match(rec[1].plain, /\(stage 2, part 1, fact 5, field "until"\): until closes a text fact only\.$/);
  const stop = draftStopText({ stop: 'max-revisions', reds: live, spend: { knownUsd: 0.005, spendComplete: true } });
  assert.doesNotMatch(stop, /no plain wording/);
  assert.match(stop, /\(stage 2, part 1, fact 5, field "until"\): until closes a text fact only\./, 'the stop text is not cut to 60 characters');
  assert.match(stop, /Give each job line one stage\./);
});

test('B3: every shape red the rubric-step validator can raise on a fact part is mapped (a sweep of broken parts)', () => {
  const good = () => ({ text: 't', class: 'fact', source: 'In', record: { start: 'R' }, facts: [{ name: 'p', shape: 'money', currency: '$', rule: { op: 'lt', value: 5 } }] });
  const m = (f) => { const x = good(); f(x); return x; };
  const parts = [
    m((x) => { x.facts[0].until = 'z'; }), m((x) => { x.facts[0].shape = 'phrase'; x.facts[0].phrase = 'p'; x.facts[0].anchor = 'a'; }),
    m((x) => { x.facts[0].shape = 'text'; x.facts[0].rule = { op: 'lt', value: 5 }; }), m((x) => { x.record = {}; }), m((x) => { x.facts = []; }),
    m((x) => { x.facts[0].shape = 'colour'; }), m((x) => { x.facts[0].rule = { op: 'between', value: 3 }; }), m((x) => { x.zzz = 1; }), m((x) => { delete x.text; }),
    m((x) => { x.count = { min: 5, max: 2 }; }), m((x) => { x.facts[0].unit = 'US dollars'; }), m((x) => { x.facts[0].name = 'p1'; }),
  ];
  let seen = 0;
  for (const part of parts) {
    for (const r of rubricStepShapeReds({ step: 1, parts: [part] }, 'stages[0].params')) {
      seen += 1;
      const [pr] = plainReasons([r]);
      assert.notEqual(pr.kind, 'unmapped', JSON.stringify(r));
      const [sr] = signingReasons([r]);
      assert.notEqual(sr.kind, 'unmapped', JSON.stringify(r));
      assert.notEqual(sr.kind, 'declaration', 'a rubric shape red is worded where it lands, not as a generic refusal');
    }
  }
  assert.ok(seen >= 10, `the sweep raised ${seen} reds`);
  // a non-rubric invalid-value keeps the generic declaration wording
  assert.equal(signingReasons([{ code: 'invalid-value', path: 'stages[0].params.allowPrefixes', detail: 'x' }])[0].kind, 'declaration');
});
