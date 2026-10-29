// The Audit grid on the page (PRD v1.119, build spec B-D): the page's OWN pure drawing functions, pulled out of src/panel/index.html by name and fed
// the real getRunDetail output of two archived runs: mvtatlxw (tests/fixtures/audit-grid: a step retried once, a fix loop of four tries ending in a
// provider drop, no fix try running all 8 declared checks) and mvdg1xo3 (tests/fixtures/part5: a step retried five times, a try cut off). The page
// types none of the check or error words; only the one multi-failing-check case below is authored (no archived try has two red checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunDetail } from '../src/panel/server.js';
import { makeAuditGridWorld, RUNID } from './audit-grid-world.mjs';
import { makePart5World } from './part5-world.mjs';

const PAGE = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name}`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
const NAMES = ['escapeXml', 'attemptGlyph', 'stageQuestionText', 'stageNumberText', 'gridGlyph', 'gridPlural', 'gridStepTryOf', 'gridFixTryOf', 'gridRowsOf', 'gridModelOf', 'gridCellOf', 'gridFailsOf', 'gridDefaultOpen', 'gridTableHtml', 'gridErrorsHtml', 'gridRoundsHtml'];
const g = new Function(`${NAMES.map(fnSrc).join('\n')}\nreturn { ${NAMES.join(', ')} };`)();

const grid = makeAuditGridWorld();
const run = getRunDetail(RUNID, grid.opts);
const partOf = (d, kind, nth = 0) => d.parts.filter((p) => p.kind === kind)[nth];
const fixModel = g.gridModelOf(partOf(run, 'fix'), false);
const strip = (h) => h.replace(/<[^>]+>/g, '');
const cellsOf = (html, row) => {
  const tr = html.split('<tr>').find((x) => x.includes(`<td class="q">${row} `));
  return tr ? [...tr.matchAll(/<td class="c">(.*?)<\/td>/g)].map((m) => m[1]) : [];
};

test('fix grid: columns are the four tries (✗ ✗ ✗ ?), each with its thinking words, the opening close saying so', () => {
  const html = g.gridTableHtml('p5', fixModel);
  const heads = [...html.matchAll(/<th class="t">(.*?)<\/th>/g)].map((m) => strip(m[1].replace('<span class="hint">', ' | ')));
  assert.deepEqual(heads, ['try 1 ✗ | opening close', 'try 2 ✗ | thinking on', 'try 3 ✗ | thinking on', 'try 4 ? | thinking on']);
  assert.match(html, /<th class="t">try 4 <span class="glyph-q">\?<\/span>/);
});

test('fix grid: one row per DECLARED check, in declared order, "N question"; ✓ before the first red, · after it, a ✗ button on the red', () => {
  const html = g.gridTableHtml('p5', fixModel);
  const questions = [...html.matchAll(/<td class="q">(.*?)<\/td>/g)].map((m) => m[1]);
  assert.equal(questions.length, 8);
  assert.equal(questions[0], '1 did it change any file?');
  assert.equal(questions[7], '8 no casts or silencers added?');
  const third = cellsOf(html, 3);
  assert.match(third[0], /class="cell fail"[^>]*data-fx="1:3"[^>]*title="try 1, check #3: failed - click to read its errors"/, 'try 1 failed check #3');
  assert.match(third[1], /class="cell fail"/);
  assert.match(third[2], /class="cell pass" title="passed"/, 'try 3 got past check #3');
  const first = cellsOf(html, 1);
  assert.ok(first.slice(0, 3).every((c) => /class="cell pass"/.test(c)), 'check #1 passed in tries 1-3');
  const sixth = cellsOf(html, 6);
  assert.match(sixth[0], /class="cell notrun" title="not run \(first-red-wins stopped the close\)"><span class="glyph-nr">·<\/span>/, 'first-red-wins: check #6 never ran in try 1');
  assert.match(sixth[2], /class="cell pass"/, 'but it ran and passed in try 3');
  assert.equal((html.match(/class="cell fail"/g) ?? []).length, 3, 'three red cells: one per red try');
});

test('fix grid: the provider-dropped try is "?" in every row (not clickable, title says no verdict); a number a check read is in its pass title', () => {
  const html = g.gridTableHtml('p5', fixModel);
  for (let r = 1; r <= 8; r += 1) assert.match(cellsOf(html, r)[3], /<span class="cell unk" title="try 4: no verdict"><span class="glyph-q">\?<\/span><\/span>/);
  assert.match(cellsOf(html, 2)[0], /title="passed: 0 left, need 0"/, 'a count check names its number');
});

test('errors list: one row per red or verdict-less try, row text "try N · #K ✗ · first line · (+M more)", the full first line on hover', () => {
  const html = g.gridErrorsHtml('p5', fixModel, { open: {}, more: {} });
  assert.match(html, /^<div class="fx-label">errors<\/div>/);
  assert.equal((html.match(/<div class="fx-row/g) ?? []).length, 4, 'tries 1-3 red, try 4 no verdict: four rows');
  const row1 = html.split('<div class="fx-row').find((x) => x.includes('data-fxrow="1"'));
  const head = row1.split('</button>')[0];
  assert.match(head, /<span class="fx-caret">▸<\/span><span class="fx-try">try 1<\/span><span class="fx-chk">#3 <span class="glyph-red">✗<\/span><\/span><span class="fx-first" /, 'caret, try N, #K ✗, first line');
  assert.match(row1, /<span class="fx-first" title="&quot;npx tsc --noEmit --strict&quot; exited 2, expected 0">/);
  assert.match(row1, /<span class="fx-count">\(\+39 more\)<\/span>/);
});

test('errors list: only the LAST red try is open on load; rows are independent buttons; a try with every check passing has no row', () => {
  const open = g.gridDefaultOpen(fixModel);
  assert.deepEqual(open, { 3: true });
  const html = g.gridErrorsHtml('p5', fixModel, { open, more: {} });
  assert.equal((html.match(/class="fx-row open"/g) ?? []).length, 1);
  assert.match(html, /<button type="button" class="fx-rowhead" id="fxrow-p5-3" data-fxrow="3" aria-expanded="true">/);
  assert.match(html, /data-fxrow="1" aria-expanded="false"/);
  const both = g.gridErrorsHtml('p5', fixModel, { open: { 1: true, 3: true }, more: {} });
  assert.equal((both.match(/class="fx-row open"/g) ?? []).length, 2, 'rows open independently');
  const stepModel = g.gridModelOf(partOf(run, 'step', 0), false);
  assert.equal(g.gridErrorsHtml('p2', stepModel, { open: {}, more: {} }), '', 'a step whose only try passed has no errors list at all');
});

test('error lines: an open row shows the first 8 lines then "+M more lines"; the toggle shows all and offers "show first 8 only"', () => {
  const capped = g.gridErrorsHtml('p5', fixModel, { open: { 1: true }, more: {} });
  assert.equal((capped.match(/<div>/g) ?? []).length, 8);
  assert.match(capped, /<button type="button" class="fx-more" data-fxmore="1:3">\+32 more lines<\/button>/);
  const all = g.gridErrorsHtml('p5', fixModel, { open: { 1: true }, more: { '1:3': true } });
  assert.equal((all.match(/<div>/g) ?? []).length, 40);
  assert.match(all, /<button type="button" class="fx-more" data-fxmore="1:3">show first 8 only<\/button>/);
  const short = g.gridErrorsHtml('p5', fixModel, { open: { 2: true }, more: {} });
  assert.doesNotMatch(short.split('data-fxrow="2"')[1].split('data-fxrow="3"')[0], /fx-more/, 'a try with 5 lines has no more-lines button');
});

test('errors list: the verdict-less try is a faint "?" row with the code-owned words, not a button', () => {
  const html = g.gridErrorsHtml('p5', fixModel, { open: {}, more: {} });
  const q = html.split('<div class="fx-row').find((x) => x.startsWith(' fx-row-q'));
  assert.ok(q, 'the ? row exists');
  assert.match(q, /<span class="fx-try">try 4<\/span><span class="fx-chk"><span class="glyph-q">\?<\/span><\/span><span class="fx-first fx-faint">provider dropped \(socket hang up\), no check ran<\/span>/);
  assert.doesNotMatch(q, /<button|data-fxrow|aria-expanded/);
});

test('step retry (zero-target-errors): rows are the step\'s own checks, try 1 red with 11 lines open by default, try 2 green gets no row', () => {
  const model = g.gridModelOf(partOf(run, 'step', 2), false);
  const html = g.gridTableHtml('p4', model);
  assert.deepEqual([...html.matchAll(/<td class="q">(.*?)<\/td>/g)].map((m) => m[1]), ['1 did it change any file?', '2 no failing tests?']);
  assert.match(cellsOf(html, 2)[0], /class="cell fail"/);
  assert.match(cellsOf(html, 2)[1], /class="cell pass"/);
  const errors = g.gridErrorsHtml('p4', model, { open: g.gridDefaultOpen(model), more: {} });
  assert.equal((errors.match(/<div class="fx-row/g) ?? []).length, 1);
  assert.match(errors, /try 1<\/span><span class="fx-chk">#2 <span class="glyph-red">✗<\/span><\/span>/);
  assert.match(errors, /<span class="fx-count">\(\+10 more\)<\/span>/);
  assert.match(errors, /\+3 more lines<\/button>/, '11 lines, 8 shown');
});

test('step rows are in DECLARED order though the server numbers checks in RUN order (a real step ran line-1 before changed-from-seed); a cut-off try is a "?" column and row', () => {
  const world = makePart5World();
  const red = getRunDetail('mvdg1xo3', { home: world.home });
  const model = g.gridModelOf(partOf(red, 'step', 1), false);
  const html = g.gridTableHtml('p4', model);
  assert.deepEqual([...html.matchAll(/<td class="q">(.*?)<\/td>/g)].map((m) => m[1].replace(/&#39;/g, "'")), ['1 did it change any file?', "2 line 1 — does its output pass the line's checks?"]);
  assert.match(html, /<th class="t">try 4 <span class="glyph-q">\?<\/span>/);
  assert.match(cellsOf(html, 1)[3], /class="cell unk"/);
  const errors = g.gridErrorsHtml('p4', model, { open: g.gridDefaultOpen(model), more: {} });
  assert.match(errors, /fx-row-q[^>]*>.*try 4.*cut off before its checks ran/);
  assert.deepEqual(g.gridDefaultOpen(model), { 3: true }, 'the last try with a verdict that failed (try 4 has none)');
});

test('several red checks in one try (authored: no archived try has two): "+J more checks", a sub-heading per check, lines counted across them', () => {
  const mk = (n, name, lines) => ({ n, name, question: `q${n}`, reasons: lines });
  const cell = (r) => ({ name: r.name, question: r.question, status: 'fail', number: null, reasons: r.reasons });
  const rows = [mk(1, 'a', ['a1', 'a2']), mk(2, 'b', ['b1']), mk(3, 'c', ['c1', 'c2', 'c3'])];
  const t = { n: 1, glyph: '✗', hint: '', noVerdict: null, known: true, inflight: false, order: ['a', 'b', 'c'], cells: { a: cell(rows[0]), b: cell(rows[1]), c: cell(rows[2]) }, attempt: { n: 1 }, calls: 1, opening: false };
  const model = { tries: [t], rows: rows.map((r) => ({ n: r.n, name: r.name, question: r.question })) };
  const html = g.gridErrorsHtml('p1', model, { open: { 1: true }, more: {} });
  assert.match(html, /<span class="fx-chk">#1 <span class="glyph-red">✗<\/span> <span class="fx-faint">\+2 more checks<\/span><\/span>/);
  assert.match(html, /<span class="fx-count">\(\+5 more\)<\/span>/, '6 lines in all, first one shown');
  assert.deepEqual([...html.matchAll(/<div class="fx-sub">(.*?)<\/div>/g)].map((m) => m[1]), ['#1 q1', '#2 q2', '#3 q3']);
  const two = { ...model, tries: [{ ...t, order: ['a', 'b'], cells: { a: t.cells.a, b: t.cells.b } }] };
  assert.match(g.gridErrorsHtml('p1', two, { open: {}, more: {} }), /\+1 more check<\/span>/, 'singular for one more');
  assert.doesNotMatch(g.gridErrorsHtml('p1', { tries: [{ ...t, order: ['a'], cells: { a: t.cells.a } }], rows: [model.rows[0]] }, { open: { 1: true }, more: {} }), /fx-sub/, 'one failing check: no sub-heading');
});

test('rounds per try: a fold per try labelled "try N rounds (K calls)", the opening close (no model call) a note instead of a fold', () => {
  const html = g.gridRoundsHtml(fixModel);
  assert.match(html, /^<div class="sub-label">rounds per try<\/div><div class="fold-list">/);
  assert.match(html, /<summary>try 2 rounds \(\d+ calls?\)<\/summary>/);
  assert.match(html, /<summary>try 4 rounds \(\d+ calls?\)<\/summary>/);
  assert.equal((html.match(/<details class="rounds-fold"/g) ?? []).length + (html.match(/class="step-rounds-note"/g) ?? []).length, 4, 'every try has a fold or a note');
  assert.match(html, /no rounds: the opening close ran before any model call/);
});

test('wiring: the part body calls the one grid builder for steps and the fix loop, folds fetch the existing per-attempt endpoint, and the old views are gone', () => {
  assert.match(PAGE, /buildGridBody\(body, idx, part, box\.state === "running"\);/);
  assert.match(PAGE, /loadRounds\(d\.querySelector\("\.rf-body"\), partIndex, t\.attempt, 0\);/);
  assert.doesNotMatch(PAGE, /function (buildAttemptsList|buildStepFold|tryBlockHtml|loadStepRows|stepRowHtml)\(/);
  assert.doesNotMatch(PAGE, /dupOf|\.dup\b/, 'the mock\'s lab-only duplicate-wording marker is not built');
});
