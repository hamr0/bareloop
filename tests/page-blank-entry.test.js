// A blank entry in a words/currency/unit list names nothing: it is left out at parse (not a repair of the JSON), and a kept fact's word drops are
// read notes, never Not checked (run mvqy5oxl, Dell: the AI's exact answer put `"" is not written on the page.` under Not checked beside the rule's check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMapAnswer } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { dropRows, dropLine, splitReadNotes } from '../src/pagedropwords.js';

const dell = readFileSync(new URL('./fixtures/pageforms/dell-de.txt', import.meta.url), 'utf8');
const jobLines = [{ n: 1, text: 'List every laptop on the page with its name and price.', rules: ['price is under 1500 euros'] }];
const REAL = '{"facts":[{"name":"price","from":"line 1 rule 1","shape":"money","words":["AB","Preis"],"currency":["€"],"unit":[""],"lang":"de","decimal":",","reading":{"op":"lt","value":1500}}]}';
const card = (/** @type {any} */ mapping) => {
  const r = applyPageRules(dell, mapping, jobLines);
  const lines = dropRows(r.dropped).map((row) => dropLine(row, jobLines, (l) => l.rules));
  return { r, ...splitReadNotes(lines, r.facts.map((/** @type {any} */ f) => f.name)), lines };
};

test('blank entries: the real Dell answer parses with the blank unit left out (absent), words and currency untouched', () => {
  const p = parseMapAnswer(REAL);
  assert.equal(p.ok, true);
  assert.deepEqual(p.ok && p.mapping.facts[0].words, ['AB', 'Preis']);
  assert.equal(p.ok && p.mapping.facts[0].unit, undefined);
});

test('blank entries: empty and whitespace-only entries are dropped from words, currency and unit; a non-string is still malformed', () => {
  const p = parseMapAnswer('{"facts":[{"name":"p","shape":"money","words":["AB"," ",""],"currency":["€","\\t"],"unit":["", "  "]}]}');
  assert.equal(p.ok && JSON.stringify(p.mapping.facts[0].words), '["AB"]');
  assert.equal(p.ok && JSON.stringify(p.mapping.facts[0].currency), '["€"]');
  assert.equal(p.ok && p.mapping.facts[0].unit, undefined);
  assert.equal(parseMapAnswer('{"facts":[{"name":"p","shape":"money","words":[1]}]}').ok, false);
});

test('Dell card: the rule is a check only; its word drops are read notes; no "" anywhere', () => {
  const p = parseMapAnswer(REAL);
  assert.ok(p.ok);
  const c = card(p.mapping);
  assert.equal(c.r.facts.length, 1);
  assert.deepEqual(c.notChecked, []);
  assert.ok(c.readNotes.length > 0);
  assert.ok(!JSON.stringify(c.lines).includes('\\"\\"'));
});

test('a rule whose fact really drops still shows under Not checked', () => {
  const c = card({ facts: [{ name: 'price', from: 'line 1 rule 1', shape: 'money', words: ['Nonexistent'], currency: ['zzz'], unit: [] }] });
  assert.equal(c.r.facts.length, 0);
  assert.ok(c.notChecked.length > 0);
  assert.ok(c.notChecked.every((t) => t.startsWith('line 1:')));
});
