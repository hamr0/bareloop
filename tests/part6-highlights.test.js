// Part 6 highlights, READ + SHOW: /result attaches what the check read (the run's `rubric-evidence` record) to each result, and the proof fold
// marks those words. REAL data: mve5y8fa (archived, no evidence record) with the evidence a real bareguard 0.25 grade of its saved page and
// delivered step file returns, appended as the engine would write it. Page functions are cut from index.html's own source.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, copyFileSync, mkdirSync, writeFileSync, appendFileSync, utimesSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePart5World } from './part5-world.mjs';
import { getRunResult } from '../src/panel/server.js';
import { gradeStep, sha256Of } from '../src/rubricstep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'part5');
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const src = (name) => {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
};
const ESC = 'function escapeXml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}';
const NONE = /var RESULT_NONE = "([^"]+)";/.exec(PAGE)[1];
const names = ['resultFileWords', 'resultField', 'resultProofHtml', 'resultFactsLine'];
const fns = new Function(`${ESC}\nvar RESULT_NONE = ${JSON.stringify(NONE)};\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)();

const SPEC = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const STAGE = SPEC.closeDecl.stages.find((s) => s.kind === 'rubric-step');
const FLIGHTS = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const STEP = readFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), 'utf8');
/** bareguard's real evidence for this page and step file */
const realEvidence = async () => JSON.parse(JSON.stringify((await gradeStep(
  { params: STAGE.params, bytes: STEP, outputBytes: STEP, inputs: { flights: FLIGHTS } }, { flights: sha256Of(FLIGHTS) },
)).evidence));

/** the real /result body of mve5y8fa; `evidence` (when given) is appended to its spine as the engine's `rubric-evidence` record */
function result(evidence, stepText = null) {
  const w = makePart5World();
  const delivered = join(dirname(w.out('mve5y8fa')), 'delivered', 'steps', '1-2026-10-18.json');
  mkdirSync(dirname(delivered), { recursive: true });
  if (stepText === null) copyFileSync(join(FX, 'mve5y8fa.step-1-2026-10-18.json'), delivered); else writeFileSync(delivered, stepText);
  const spine = w.spine('mve5y8fa');
  const text = readFileSync(spine, 'utf8');
  const rec = JSON.parse(text.split('\n').find((l) => l.includes('"type":"destination-written"')));
  // a rewritten step file must still hash to what the run recorded: the recorded sha is replaced by the new file's
  const recorded = stepText === null ? text : text.replaceAll(sha256Of(STEP), sha256Of(stepText));
  writeFileSync(spine, recorded.replace(rec.path, delivered));
  if (evidence) appendFileSync(spine, `${JSON.stringify({ type: 'rubric-evidence', step: 1, iteration: 1, evidence })}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  return getRunResult('mve5y8fa', { home: w.home });
}
/** the marked words of one rendered fold, in order */
const marked = (html) => [...html.matchAll(/<mark>([\s\S]*?)<\/mark>/g)].map((m) => m[1]);
const folds = (html) => [...html.matchAll(/data-testid="result-quote"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);

test('the mve5y8fa fixture: 3 results, each fold marks the 8 words the check read; "Departure time:" is marked once per result', async () => {
  const line = result(await realEvidence()).lines[0];
  assert.equal(line.rows.length, 3);
  const fs = folds(fns.resultFactsLine(line));
  assert.equal(fs.length, 3);
  for (const f of fs) {
    const m = marked(f);
    assert.equal(m.length, 8, `marks: ${JSON.stringify(m)}`);
    assert.equal(m.filter((x) => x === 'Departure time:').length, 1);
    assert.deepEqual(m.slice(0, 3), ['From', '144', 'US dollars']);
  }
  // the marked words are exactly bareguard's spans over its own text, nothing found by searching
  const ev = await realEvidence();
  line.rows.forEach((r, k) => assert.deepEqual(r.proof.marks.map(([a, b]) => r.proof.text.slice(a, b)), [...ev[k].spans].sort((x, y) => x.start - y.start).map((s) => ev[k].text.slice(s.start, s.end))));
  assert.equal(fs[0].replace(/<\/?mark>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"), line.rows[0].proof.text);
});

test('a membership token that is not this claim\'s (canon, no matched) is not marked; the claim\'s own (matched) is', async () => {
  const ev = await realEvidence();
  const t = ev[0].text;
  const at = t.indexOf('Total duration');
  const foreign = { decide: 1, role: 'value', start: at, end: at + 14, canon: '99:99' };
  ev[0].spans.push(foreign);
  const without = marked(folds(fns.resultFactsLine(result(ev).lines[0]))[0]);
  assert.equal(without.length, 8, 'a foreign token adds no mark');
  assert.equal(without.includes('Total duration'), false);
  foreign.matched = true;
  const withIt = marked(folds(fns.resultFactsLine(result(ev).lines[0]))[0]);
  assert.equal(withIt.length, 9);
  assert.ok(withIt.includes('Total duration'));
});

test('overlapping and duplicate spans merge into one mark', async () => {
  const ev = await realEvidence();
  const first = ev[0].spans.find((s) => s.role === 'phrase');
  ev[0].spans.push({ ...first }, { decide: 0, role: 'value', start: first.start + 2, end: first.end + 6 });
  const m = marked(folds(fns.resultFactsLine(result(ev).lines[0]))[0]);
  assert.equal(m.length, 8, 'the duplicate and the overlap fold into the span they touch');
  assert.ok(m.includes(ev[0].text.slice(first.start, first.end + 6)), JSON.stringify(m));
});

test('an old run (no record), a malformed claim (no text) and another try\'s quote show the plain quote, no mark', async () => {
  const plain = fns.resultFactsLine(result().lines[0]);
  assert.equal(marked(plain).length, 0);
  assert.equal(/<mark/.test(plain), false);
  assert.ok(plain.includes('From 144 US dollars. Nonstop flight with American.'));
  const ev = await realEvidence();
  ev[1] = { check: ev[1].check, claim: 1, spans: [] };
  ev[2].text = `${ev[2].text} (another try)`;
  const line = result(ev).lines[0];
  assert.equal(marked(folds(fns.resultFactsLine(line))[0]).length, 8, 'claim 0 is still marked');
  assert.equal(line.rows[1].proof, undefined);
  assert.equal(line.rows[2].proof, undefined, 'a quote the check did not read is not marked');
  const hs = folds(fns.resultFactsLine(line));
  assert.equal(marked(hs[1]).length, 0);
  assert.equal(marked(hs[2]).length, 0);
});

test('a quote holding <script> stays escaped inside and around the marks', () => {
  const text = 'a <script>alert("x")</script> b & c';
  const html = fns.resultProofHtml({ quote: text, proof: { text, marks: [[2, 29]] } });
  assert.equal(html, 'a <mark>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</mark> b &amp; c');
  const around = fns.resultProofHtml({ quote: text, proof: { text, marks: [[0, 1], [30, 31]] } });
  assert.equal(/<script|<\/script/.test(around), false);
  assert.equal(fns.resultProofHtml({ quote: '<b>x</b>' }), '&lt;b&gt;x&lt;/b&gt;', 'no proof: the plain quote, escaped');
});

test('the page never searches a quote for a word: the proof function only cuts the server\'s offsets', () => {
  assert.equal(/\.indexOf\(|\.includes\(|\.search\(|\.match\(|\.replace\(|new RegExp|\.test\(|\.exec\(/.test(src('resultProofHtml')), false);
});

test('money: the price box reads the way the page wrote it ("144 US dollars"); a foreign token, a malformed claim and no evidence keep today\'s text', async () => {
  const ev = await realEvidence();
  const file = JSON.parse(STEP);
  const rows = result(ev).lines[0].rows;
  rows.forEach((r, k) => {
    assert.equal(r.cells[0], `${file.results[k].values.price} US dollars`);
    assert.equal(r.cells[1], file.results[k].values['departure time'], 'a time is the file\'s own value');
    assert.equal(r.cells[2], 'Nonstop', 'a phrase is the signed phrase');
  });
  const foreign = await realEvidence();
  foreign[0].spans.push({ decide: 0, role: 'value', start: 300, end: 303, canon: '999' });
  assert.equal(result(foreign).lines[0].rows[0].cells[0], '144 US dollars', 'a membership token that is not the claim\'s is not part of the amount');
  const bad = await realEvidence();
  bad[1] = { check: bad[1].check, claim: 1, spans: [] };
  const mixed = result(bad).lines[0].rows;
  assert.equal(mixed[0].cells[0], '144 US dollars');
  assert.equal(mixed[1].cells[0], `$${file.results[1].values.price}`, 'malformed claim: today\'s text');
  assert.ok(result().lines[0].rows.every((r, k) => r.cells[0] === `$${file.results[k].values.price}`), 'no evidence: today\'s text');
});

test('money: a symbol-first amount ("€144") is shown as the page wrote it; spans too far apart (over 40 characters) keep the fact\'s own spelling', async () => {
  const file = JSON.parse(STEP);
  const was = 'From 144 US dollars.';
  assert.ok(file.results[0].quote.startsWith(was), 'the fixture quote this rewrites');
  // the same real evidence and quote, laid out the way a page that writes the symbol first would be: "From €144."
  file.results[0].quote = file.results[0].quote.replace(was, 'From \u20AC144.');
  const stepText = JSON.stringify(file);
  const ev = await realEvidence();
  const shift = was.length - 'From \u20AC144.'.length; // 10
  ev[0].text = ev[0].text.replace(was, 'From \u20AC144.');
  ev[0].spans = ev[0].spans.filter((sp) => !(sp.decide === 0 && (sp.role === 'value' || sp.role === 'unit')))
    .map((sp) => (sp.start >= 19 ? { ...sp, start: sp.start - shift, end: sp.end - shift } : sp));
  ev[0].spans.push({ decide: 0, role: 'currency', start: 5, end: 6 }, { decide: 0, role: 'value', start: 6, end: 9 });
  assert.equal(result(ev, stepText).lines[0].rows[0].cells[0], '\u20AC144', 'symbol first: the amount as the page wrote it');
  // value and symbol more than 40 characters apart: not one short run, so today's text (the fact's own sign)
  const far = JSON.parse(JSON.stringify(ev));
  far[0].spans = far[0].spans.map((sp) => (sp.decide === 0 && sp.role === 'currency' ? { ...sp, start: 60, end: 61 } : sp));
  assert.equal(result(far, stepText).lines[0].rows[0].cells[0], '$144', 'a far-apart layout falls back to the fact\'s own spelling');
});
