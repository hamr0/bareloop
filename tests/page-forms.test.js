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

// ── pagerules.js: a currency sign is filed by how the page writes it next to the number ─────────────────────────────────────

const money = (/** @type {string} */ name, /** @type {any} */ fact) => rules(name, { name: 'price', shape: 'money', words: [], ...fact });

test('sign by page form: a sign GLUED after the number is a currency, whichever box the AI used (saturn "48,49€", ldlc "1 089€")', () => {
  for (const name of ['saturn-de', 'ldlc-fr']) {
    const cur = money(name, { currency: ['€'] });
    assert.deepEqual([cur.facts[0].currency, cur.facts[0].unit], [['€'], undefined], name);
    const uni = money(name, { unit: ['€'] });
    assert.deepEqual([uni.facts[0].currency, uni.facts[0].unit], [['€'], undefined], `${name}: listed as a unit, filed as the currency it is`);
  }
});

test('sign by page form: a sign SPACED after the number is a unit, whichever box the AI used (thomann "UVP: 429,99 €")', () => {
  const uni = money('thomann-de', { words: ['UVP:'], unit: ['€'] });
  assert.deepEqual([uni.facts[0].unit, uni.facts[0].currency], [['€'], undefined]);
  const cur = money('thomann-de', { words: ['UVP:'], currency: ['€'] });
  assert.deepEqual([cur.facts[0].unit, cur.facts[0].currency], [['€'], undefined], 'listed as a currency, filed as the unit it is');
  assert.deepEqual(cur.dropped, []);
});

test('sign by page form: a sign listed in both boxes whose page form needs ONE box is said once, in the box the page form picks', () => {
  const sp = money('thomann-de', { words: ['UVP:'], unit: ['€'], currency: ['€'] });
  assert.deepEqual(sp.dropped.map((d) => [d.word, d.reason, d.other]), [['€', 'sign-twice', 'unit']]);
  assert.equal(dropSentence(sp.dropped[0]), '"€" was listed twice, as a unit and as a currency; it is used once, as the unit.');
  assert.deepEqual([sp.facts[0].unit, sp.facts[0].currency], [['€'], undefined]);
  const gl = money('saturn-de', { unit: ['€'], currency: ['€'] });
  assert.deepEqual(gl.dropped.map((d) => [d.word, d.reason, d.other]), [['€', 'sign-twice', 'currency']]);
  assert.match(dropSentence(gl.dropped[0]), /used once, as the currency\.$/);
  assert.deepEqual([gl.facts[0].unit, gl.facts[0].currency], [undefined, ['€']]);
});

test('sign by page form: a page that writes the sign BOTH ways (thomann: "UVP: 429,99 €" and "50€") files it in both boxes and keeps both', () => {
  const r = money('thomann-de', { unit: ['€'], currency: ['€'] });
  assert.deepEqual(r.dropped, [], 'a sign legally in both boxes is not sign-twice and not r1l');
  assert.deepEqual([r.facts[0].unit, r.facts[0].currency], [['€'], ['€']]);
  const one = money('thomann-de', { currency: ['€'] });
  assert.deepEqual([one.facts[0].unit, one.facts[0].currency], [['€'], ['€']], 'listed in one box only, the page still writes both');
});

test('sign by page form: a sign before the number stays a currency (the earlier behaviour)', () => {
  const r = applyPageRules('url: x\n1 chars\nTotal $144\nTotal $200\n', { facts: [{ name: 'price', from: 'line 1', shape: 'money', words: ['Total'], unit: ['$'] }] }, jobLines);
  assert.deepEqual([r.facts[0].currency, r.facts[0].unit], [['$'], undefined]);
});

// ── the claim text is written as the quote writes the value; the typed value stays canonical (real bareguard 0.27.0) ──────────

import { createHash } from 'node:crypto';
import { factClaims, writtenSpans } from '../src/facts.js';
import { gradeStep } from '../src/rubricstep.js';

/** grade one result of a fact part over a fixture page with the real bareguard: `fact` is the signed fact, `quote` a page line, `value` what the worker wrote */
async function grade(/** @type {string} */ name, /** @type {any} */ fact, /** @type {string} */ quote, /** @type {string} */ value) {
  const text = page(name);
  assert.ok(quote !== '' && text.includes(quote), `the quote is a real line of ${name}`);
  const params = { step: 1, parts: [{ text: 'x', class: 'fact', source: 'page', covers: [1], facts: [{ name: 'fact', ...fact }] }] };
  return gradeStep({ params, bytes: JSON.stringify({ results: [{ quote, values: { fact: value } }] }), outputBytes: null, inputs: { page: text } }, { page: createHash('sha256').update(text).digest('hex') });
}
const GOV = '- link "E5 Defence Ministers\' Statement: 26 October 2026" [ref=2434]';
const DE = '- heading "Letzte Änderung: 16. Januar 2026" [level=4] [ref=50]';
const ES = '- heading "Última actualización: 16 de enero de 2026" [level=4] [ref=50]';

test('claims: a canonical date reads green against the quote\'s own spelling - govuk "26 October 2026", stripe-de "16. Januar 2026", stripe-es "16 de enero de 2026"', async () => {
  const g = await grade('govuk-en', { shape: 'date', anchor: "E5 Defence Ministers' Statement:", lang: 'en' }, GOV, '2026-10-26');
  assert.deepEqual([g.verdict, g.gapLines], ['green', []]);
  const d = await grade('stripe-de', { shape: 'date', anchor: 'Letzte Änderung:', lang: 'de' }, DE, '2026-01-16');
  assert.deepEqual([d.verdict, d.gapLines], ['green', []]);
  const e = await grade('stripe-es', { shape: 'date', anchor: 'Última actualización:', lang: 'es' }, ES, '2026-01-16');
  assert.deepEqual([e.verdict, e.gapLines], ['green', []]);
});

test('claims: a canonical amount reads green against a decimal comma - saturn "48,49€" (glued), thomann "1.057,65 €" (spaced, dot thousands), ldlc "1 089€" (space thousands)', async () => {
  const lineOf = (/** @type {string} */ name, /** @type {string} */ part) => page(name).split('\n').find((l) => l.includes(part)) ?? '';
  const sa = await grade('saturn-de', { shape: 'money', currency: ['€'], decimal: ',' }, lineOf('saturn-de', '48,49€').trim(), '48.49');
  assert.deepEqual([sa.verdict, sa.gapLines], ['green', []]);
  const th = await grade('thomann-de', { shape: 'money', anchor: 'UVP:', unit: ['€'], decimal: ',' }, lineOf('thomann-de', '1.057,65').trim(), '1057.65');
  assert.deepEqual([th.verdict, th.gapLines], ['green', []]);
  const ld = await grade('ldlc-fr', { shape: 'money', currency: ['€'], decimal: ',' }, lineOf('ldlc-fr', '089€').trim(), '1089');
  assert.deepEqual([ld.verdict, ld.gapLines], ['green', []]);
});

test('claims: the typed binding is untouched - a wrong canonical value is red, and the value spelled as the quote writes it is not a canonical value', async () => {
  const wrong = await grade('govuk-en', { shape: 'date', anchor: "E5 Defence Ministers' Statement:", lang: 'en' }, GOV, '2026-10-27');
  assert.equal(wrong.verdict, 'red');
  assert.match(wrong.gapLines.join('\n'), /the value is not what the quote holds/);
  const spelled = await grade('govuk-en', { shape: 'date', anchor: "E5 Defence Ministers' Statement:", lang: 'en' }, GOV, '26 October 2026');
  assert.equal(spelled.verdict, 'red');
  assert.match(spelled.gapLines.join('\n'), /the value is not written as a value of this kind/);
  const comma = await grade('thomann-de', { shape: 'money', anchor: 'UVP:', unit: ['€'], decimal: ',' }, page('thomann-de').split('\n').find((l) => l.includes('429,99'))?.trim() ?? '', '429,99');
  assert.equal(comma.verdict, 'red', 'a comma in a claim value under decimal "," is never read');
});

test('claims: factClaims writes the text from the as-written span, values stay canonical; with no span, or a fact signing no page form, the text is the worker\'s value as before', () => {
  const part = { facts: [{ name: 'when', shape: 'date', lang: 'de' }, { name: 'price', shape: 'money', unit: ['€'] }] };
  const r = [{ quote: 'q', values: { when: '2026-01-16', price: '389' } }];
  assert.deepEqual(factClaims(part, r, [{ 0: '16. Januar 2026' }])[0], { claim: 'when: 16. Januar 2026; price: 389', quote: 'q', values: { d0: '2026-01-16', d1: '389' } });
  assert.equal(factClaims(part, r)[0].claim, 'when: 2026-01-16; price: 389');
});

test('claims: writtenSpans reads bareguard\'s evidence - the value span of a page-form fact, nothing for a fact with no page form or a quote bareguard could not read', () => {
  const part = { facts: [{ name: 'when', shape: 'date', lang: 'de' }, { name: 'price', shape: 'money', unit: ['€'] }] };
  const ev = [
    { check: 'p1-facts', claim: 0, text: 'Letzte Änderung: 16. Januar 2026', spans: [{ decide: 0, role: 'anchor', start: 0, end: 16 }, { decide: 0, role: 'value', start: 17, end: 32, matched: true }, { decide: 1, role: 'value', start: 0, end: 3 }] },
    { check: 'p1-facts', claim: 1, spans: [] },
  ];
  assert.deepEqual(writtenSpans(part, ev), [{ 0: '16. Januar 2026' }]);
  assert.deepEqual(writtenSpans(part, undefined), []);
});

test('claims: a fact part with no page form is checked once and its claim text is the worker\'s value (no change to any earlier spec)', async () => {
  const text = 'Total: $389 for 2';
  const params = { step: 1, parts: [{ text: 'x', class: 'fact', source: 'page', covers: [1], facts: [{ name: 'fact', shape: 'money', anchor: 'Total:', currency: ['$'] }] }] };
  const g = await gradeStep({ params, bytes: JSON.stringify({ results: [{ quote: text, values: { fact: '389' } }] }), outputBytes: null, inputs: { page: text } }, { page: createHash('sha256').update(text).digest('hex') });
  assert.equal(g.verdict, 'green');
});
