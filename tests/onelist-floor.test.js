// Addendum 2026-11-14 (c) piece 1: the `$` floor row of every line is DRAWN (card, Job tab, Audit) and the separate "line N file" note folds into it: one row, not two.
// Real saved signed spec: tests/fixtures/check-list-live-mwc2u3yh/resolved-spec.json (a text line with a fact part and two `~` count picks, floor row signed with no words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cardOfClose, checksOfClose, lineCarriesText } from '../src/rubricstep.js';
import * as RS from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { confirmProtections } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { CheckBlock } from '../src/checkblock.js';

const SPEC = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/check-list-live-mwc2u3yh/resolved-spec.json', import.meta.url)), 'utf8'));

test('the signed card draws the floor row of line 1 as a `$` default row keyed to its list row, with the line file named', () => {
  const card = cardOfClose({ closeDecl: SPEC.closeDecl, jobLines: SPEC.jobLines });
  const floor = card.checkItems.filter((c) => c.key === 'L1.$floor');
  assert.equal(floor.length, 1, 'the floor is one row on the card');
  assert.equal(floor[0].by, 'default');
  assert.deepEqual(floor[0].fromLine, [1]);
  assert.match(floor[0].text, /output\/steps\/1\.json/);
  assert.match(floor[0].text, /must exist, be complete JSON/);
  assert.equal(lineCarriesText(SPEC.closeDecl, 1), true);
  assert.match(floor[0].text, /carry text/);
});

test('the Job tab draws the same floor row under its line, tagged default', () => {
  const plan = planFromSpec(SPEC);
  const rows = plan.lines[0].checks.filter((c) => /must exist, be complete JSON/.test(c.name));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].by, 'default');
});

test('a facts-only line says its floor has no text check', () => {
  const b = new CheckBlock({ texts: { page: 'Flights\nFrom $389 US dollars\n' }, labels: ['page'], asks: false });
  b.fromJob([{ n: 1, text: 'List the price', rules: [] }]);
  b.addLook([{ line: 1, name: 'price', shape: 'money', source: 'page', words: ['From'], unit: ['US dollars'], currency: ['$'], decimal: '.' }], []);
  const cd = { stages: b.closeView().stages, list: b.signedRows() };
  assert.equal(lineCarriesText(cd, 1), false);
  assert.match(RS.floorText(cd, 1), /no text check/);
  assert.doesNotMatch(RS.floorText(cd, 1), /and carry text/);
  const floor = cardOfClose({ closeDecl: cd, jobLines: [{ n: 1, text: 'List the price' }] }).checkItems.filter((c) => c.key === 'L1.$floor');
  assert.equal(floor.length, 1);
  assert.match(floor[0].text, /no text check/);
});

test('the protections no longer carry a second "line N file" note when the signed list holds the floor row; an old close with no list keeps it', () => {
  const withList = confirmProtections({ verdictType: 'soft-green', lang: RUBRIC_LANG, writeScope: ['output/'], jobLines: SPEC.jobLines, closeDecl: SPEC.closeDecl });
  assert.equal(withList.filter((l) => /^line 1 file/.test(l)).length, 0, JSON.stringify(withList));
  const { list: _drop, ...old } = SPEC.closeDecl;
  const noList = confirmProtections({ verdictType: 'soft-green', lang: RUBRIC_LANG, writeScope: ['output/'], jobLines: SPEC.jobLines, closeDecl: old });
  assert.equal(noList.filter((l) => /^line 1 file/.test(l)).length, 1);
  // an old close draws no floor row on the card (nothing to read it from)
  assert.equal(checksOfClose(old).filter((c) => c.by === 'default' && /must exist/.test(c.text)).length, 0);
});
