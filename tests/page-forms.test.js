// RUBRIC GAPS 1 AND 2, built (docs/product/ITEM33-BUILD.md "Addendum 2026-10-27", F249): the page forms bareguard 0.27.0 reads - a date in a signed
// language (`lang`), a decimal comma (`decimal`), a currency sign glued after or spaced after the number. Every page here is lines copied from a REAL
// barebrowse capture (tests/fixtures/pageforms, header lines included) and the reader is the REAL bareguard. All $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACT_LANGS, factShapeReds, factDecides, factSentence, factBrief } from '../src/facts.js';
import { MAP_SHAPES, mapPrompt, parseMapAnswer } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { dropSentence } from '../src/pagedropwords.js';
import { lookFactOf, renderLookReport } from '../src/inputlook.js';

const page = (/** @type {string} */ name) => readFileSync(new URL(`./fixtures/pageforms/${name}.txt`, import.meta.url), 'utf8');
const jobLines = [{ n: 1, text: 'the value' }];
/** @param {any} fact @returns {string[]} the reds a one-fact part gives, as `path: detail` */
function reds(fact) {
  /** @type {string[]} */
  const out = [];
  factShapeReds({ source: 'page', facts: [fact] }, 'part', (_c, path, detail) => out.push(`${path}: ${detail}`));
  return out;
}

// ── facts.js: the fields ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('facts: lang is a date field (en de fr es it pt nl), decimal a number or money field ("." or ","), and each is refused anywhere else', () => {
  assert.deepEqual(Object.keys(FACT_LANGS), ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl']);
  assert.deepEqual(reds({ name: 'when', shape: 'date', anchor: 'Last updated:', lang: 'de' }), []);
  assert.deepEqual(reds({ name: 'when', shape: 'date', anchor: 'x' }), [], 'no lang = ISO only, as before');
  assert.equal(reds({ name: 'when', shape: 'date', lang: 'xx' }).length, 1);
  assert.match(reds({ name: 'when', shape: 'time', lang: 'de' })[0], /only a date fact carries lang/);
  assert.match(reds({ name: 'rate', shape: 'number', lang: 'en' })[0], /only a date fact carries lang/);
  assert.deepEqual(reds({ name: 'rate', shape: 'number', anchor: 'Rated', decimal: ',' }), []);
  assert.deepEqual(reds({ name: 'price', shape: 'money', currency: '€', decimal: ',' }), []);
  assert.deepEqual(reds({ name: 'price', shape: 'money', currency: '€', decimal: '.' }), []);
  assert.match(reds({ name: 'rate', shape: 'number', decimal: ';' })[0], /one of "\." \| ","/);
  assert.match(reds({ name: 'when', shape: 'date', decimal: ',' })[0], /only a number or money fact carries decimal/);
  assert.match(reds({ name: 'x', shape: 'phrase', phrase: 'a', decimal: ',' })[0], /only a number or money fact carries decimal/);
});

test('facts: the signed lang and decimal reach bareguard\'s decide, and only when signed', () => {
  const d = factDecides({ facts: [
    { name: 'a', shape: 'date', anchor: 'Last updated:', lang: 'de' },
    { name: 'b', shape: 'money', currency: ['€'], decimal: ',' },
    { name: 'c', shape: 'number', anchor: 'Rated' },
  ] });
  assert.deepEqual(d[0], { valueKind: 'date', anchor: 'Last updated:', lang: 'de' });
  assert.deepEqual(d[1], { valueKind: 'money', currency: ['€'], decimal: ',' });
  assert.deepEqual(d[2], { valueKind: 'number', anchor: 'Rated' });
});

test('facts: the plan row and the worker brief say the page form, and that the worker writes the canonical value', () => {
  assert.match(factSentence({ name: 'when', shape: 'date', anchor: 'Letzte Änderung:', lang: 'de' }, 'page'), /date, month names in German, after "Letzte Änderung:"/);
  assert.match(factSentence({ name: 'price', shape: 'money', unit: ['€'], decimal: ',' }, 'page'), /money in €, decimal comma/);
  assert.match(factBrief({ name: 'when', shape: 'date', lang: 'es' }), /write the date as YYYY-MM-DD \(the quote writes it with Spanish month names\)/);
  assert.match(factBrief({ name: 'price', shape: 'money', unit: ['€'], decimal: ',' }), /point before the decimals.*1057\.65/);
  assert.equal(factBrief({ name: 'price', shape: 'money', unit: ['€'] }), 'price — an amount in €', 'a fact signing no page form reads as before');
});

// ── pagemap.js: the map's shapes, its answer form and its prompt ─────────────────────────────────────────────────────────────

test('pagemap: the map may name date and number, and lang / decimal ride the answer; a bad value is a malformed answer (no repair)', () => {
  assert.deepEqual([...MAP_SHAPES], ['place', 'money', 'time', 'date', 'number', 'phrase']);
  const ok = (/** @type {any} */ f) => parseMapAnswer(JSON.stringify({ facts: [{ name: 'x', shape: 'date', words: ['L'], ...f }] })).ok;
  assert.equal(ok({ lang: 'de' }), true);
  assert.equal(ok({ shape: 'number', decimal: ',' }), true);
  assert.equal(ok({ lang: 'xx' }), false);
  assert.equal(ok({ lang: 5 }), false);
  assert.equal(ok({ decimal: ';' }), false);
  assert.equal(ok({ shape: 'weekday' }), false);
});

test('pagemap: the prompt describes date and number, lang and decimal, and says a label appears once and sits right before the value', () => {
  const p = mapPrompt({ jobLines, label: 'page', text: 'x' });
  assert.match(p, /"shape":"place\|money\|time\|date\|number\|phrase"/);
  assert.match(p, /"lang":"<en\|de\|fr\|es\|it\|pt\|nl>","decimal":"<\. or ,>"/);
  assert.match(p, /- date: words = the label\(s\) written right BEFORE the date/);
  assert.match(p, /- number: words = the label\(s\) written right BEFORE a plain number/);
  assert.ok(p.includes('A label must appear ONCE on its page line and sit right before the value; when the value stands alone on its line, give no label.'));
});

// ── pagerules.js: lang and decimal must be on the page ──────────────────────────────────────────────────────────────────────

/** @param {string} name @param {any} fact */
const rules = (name, fact) => applyPageRules(page(name), { facts: [{ from: 'line 1', ...fact }] }, jobLines);

test('pagerules: a date fact is read by shape; its signed lang is kept when a full month name of that language is on the page (en, de, es)', () => {
  const en = rules('govuk-en', { name: 'item date', shape: 'date', words: ["E5 Defence Ministers' Statement:"], lang: 'en' });
  assert.deepEqual(en.dropped, []);
  assert.deepEqual([en.facts[0].shape, en.facts[0].lang, en.facts[0].words], ['date', 'en', ["E5 Defence Ministers' Statement:"]]);
  const de = rules('stripe-de', { name: 'update date', shape: 'date', words: ['Letzte Änderung:'], lang: 'de' });
  assert.deepEqual(de.dropped, []);
  assert.equal(de.facts[0].lang, 'de');
  const es = rules('stripe-es', { name: 'update date', shape: 'date', words: ['Última actualización:'], lang: 'es' });
  assert.deepEqual(es.dropped, []);
  assert.equal(es.facts[0].lang, 'es');
});

test('pagerules: a lang the page does not write (de on an English-only page) drops the whole fact to Not checked, in plain words', () => {
  const r = rules('govuk-en', { name: 'item date', shape: 'date', words: ["E5 Defence Ministers' Statement:"], lang: 'de' });
  assert.deepEqual(r.facts, []);
  assert.deepEqual(r.dropped.map((d) => [d.fact, d.word, d.reason, d.other]), [['item date', undefined, 'lang-not-on-page', 'de']]);
  assert.equal(dropSentence(r.dropped[0]), 'the page shows no month name in German, so the date is not checked.');
  const en = rules('stripe-es', { name: 'update date', shape: 'date', words: ['Última actualización:'], lang: 'en' });
  assert.equal(en.dropped[0].reason, 'lang-not-on-page', 'an es page holds no English month name');
});

test('pagerules: a date with no lang is kept as ISO-only (no check, nothing carried)', () => {
  const r = rules('govuk-en', { name: 'item date', shape: 'date', words: ["E5 Defence Ministers' Statement:"] });
  assert.equal(r.facts[0].lang, undefined);
});

test('pagerules: decimal "," is kept on a page with a comma-decimal amount (saturn "48,49€", thomann "1.057,65 €")', () => {
  const sat = rules('saturn-de', { name: 'price', shape: 'money', words: [], currency: ['€'], decimal: ',' });
  assert.equal(sat.dropped.some((d) => d.reason === 'decimal-not-on-page'), false);
  assert.equal(sat.facts[0].decimal, ',');
  const tho = rules('thomann-de', { name: 'price', shape: 'money', words: ['UVP:'], unit: ['€'], decimal: ',' });
  assert.equal(tho.dropped.some((d) => d.reason === 'decimal-not-on-page'), false);
  assert.equal(tho.facts[0].decimal, ',');
});

test('pagerules: decimal "," on a page with no comma-decimal amount drops to Not checked; a thousands-grouped count ("133,330 chars") is not one', () => {
  const gov = rules('govuk-en', { name: 'rate', shape: 'number', words: ['Statement:'], decimal: ',' });
  assert.deepEqual(gov.facts, []);
  assert.deepEqual(gov.dropped.map((d) => [d.fact, d.word, d.reason]), [['rate', undefined, 'decimal-not-on-page']]);
  assert.equal(dropSentence(gov.dropped[0]), 'the page shows no amount written with a comma before the decimals, so it is not checked.');
  // ldlc's header line reads "133,330 chars → 64,161 chars": a bare \d,\d{2} matches it; its prices are whole ("799€", "1 089€")
  assert.match(page('ldlc-fr'), /133,330 chars/);
  const ldlc = rules('ldlc-fr', { name: 'price', shape: 'money', words: [], currency: ['€'], decimal: ',' });
  assert.equal(ldlc.dropped[0].reason, 'decimal-not-on-page');
});

test('pagerules: a field on a shape that does not take it is not carried (lang off a number, decimal off a date)', () => {
  const a = rules('saturn-de', { name: 'price', shape: 'money', words: [], currency: ['€'], lang: 'de' });
  assert.equal(a.facts[0].lang, undefined);
  const b = rules('govuk-en', { name: 'item date', shape: 'date', words: ["E5 Defence Ministers' Statement:"], decimal: ',' });
  assert.equal(b.facts[0].decimal, undefined);
  assert.deepEqual(b.dropped, []);
});

// ── the drafter is told every new rule in the same change ───────────────────────────────────────────────────────────────────

test('look: the kept lang / decimal ride the look fact and the drafter\'s block says to sign them; a drop shows as NOT CHECKED with its reason', () => {
  const r = rules('stripe-de', { name: 'update date', shape: 'date', words: ['Letzte Änderung:'], lang: 'de' });
  const f = lookFactOf(r.facts[0], 'page');
  assert.equal(f.lang, 'de');
  const block = renderLookReport({ facts: [f], prose: [], notFound: [], dropped: [] });
  assert.match(block, /lang "de" \(the page writes the month name in this language: sign it as the fact's lang\)/);
  const m = lookFactOf(rules('saturn-de', { name: 'price', shape: 'money', words: [], currency: ['€'], decimal: ',' }).facts[0], 'page');
  assert.match(renderLookReport({ facts: [m], prose: [], notFound: [], dropped: [] }), /decimal "," \(the page writes this mark before the decimals: sign it as the fact's decimal\)/);
  const dropped = rules('govuk-en', { name: 'item date', shape: 'date', words: ['Statement:'], lang: 'de' }).dropped;
  assert.match(renderLookReport({ facts: [], prose: [], notFound: [], dropped }), /NOT CHECKED: "item date" - the page shows no month name in German, so the date is not checked\./);
});

test('drafter: the composer brief and the fact schema carry lang and decimal', async () => {
  const { REQUIRED_FACTS_BRIEF } = await import('../src/authorflow.js');
  assert.match(REQUIRED_FACTS_BRIEF, /whose look line gives a "lang" is signed with that lang/);
  assert.match(REQUIRED_FACTS_BRIEF, /a date as YYYY-MM-DD/);
});
