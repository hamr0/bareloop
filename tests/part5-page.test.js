// PRD v1.106 Part 5 (C): the page DRAWS the fold from the server's words, using the page's own functions pulled out of src/panel/index.html
// by name and fed the real getRunDetail / getRunRounds output of the two archived runs. The page types none of the check, try or door words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunDetail, getRunRounds } from '../src/panel/server.js';
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
const escapeXml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attemptGlyph = (o) => (o === 'green' ? '✓' : (o === null || o === undefined ? '?' : '✗'));
const glyphSpan = (g) => (g === '✓' ? `<span class="glyph-green">${g}</span>` : (g === '✗' ? `<span class="glyph-red">${g}</span>` : g));
const money = (v) => (typeof v === 'number' ? (v > 0 && v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`) : 'unknown');
const dur = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : 'unknown');
const mk = (names, ...rest) => new Function(...names, `${rest.join('\n')}\nreturn ${rest.at(-1).match(/function (\w+)/)[1]};`);

const tryBlockHtml = mk(['escapeXml', 'attemptGlyph', 'glyphSpan'], fnSrc('tryBlockHtml'))(escapeXml, attemptGlyph, glyphSpan);
const doorTableHtml = new Function('escapeXml', 'auditTimeCellHtml', `${fnSrc('doorTableHtml')}\nreturn doorTableHtml;`)(escapeXml, (r) => escapeXml(r.time || ''));
const actorMarkHtml = new Function('escapeXml', `${fnSrc('actorMarkHtml')}\nreturn actorMarkHtml;`)(escapeXml);
const cells = {
  auditActionCellHtml: (r) => (r.kind === 'model-call' ? 'model call' : escapeXml(r.action || 'unknown')),
  auditPathCellHtml: (r) => (r.kind === 'model-call' ? '&mdash;' : escapeXml(r.pathShort || r.path || 'unknown')),
  auditDecisionCellHtml: (r) => (r.kind === 'model-call' ? `${money(r.costUsd)} · ${r.tokens} tokens · ${dur(r.durationMs)}` : escapeXml(r.decision || '')),
  auditRoundCellHtml: (r) => (typeof r.round === 'number' ? String(r.round) : '&mdash;'),
  auditTimeCellHtml: (r) => escapeXml(r.time || 'unknown'),
  auditRowClassName: () => '',
};
const stepRowHtml = new Function('glyphSpan', 'escapeXml', ...Object.keys(cells), `${fnSrc('stepRowHtml')}\nreturn stepRowHtml;`)(glyphSpan, escapeXml, ...Object.values(cells));

const world = makePart5World();
const opts = { home: world.home };
const red = getRunDetail('mvdg1xo3', opts);
const green = getRunDetail('mve5y8fa', opts);
const stepIdx = (d, nth = 0) => d.parts.map((p, i) => [p, i]).filter(([p]) => p.kind === 'step')[nth][1];
const tryHtml = (d, nth, n) => { const part = d.parts[stepIdx(d, nth)]; return tryBlockHtml(part, part.tries[n - 1], false, stepIdx(d, nth)); };

test('a failed try: line with the first reason and (+8 more); numbered checks in the order they ran; the reasons folded, all nine', () => {
  const h = tryHtml(red, 0, 1);
  assert.match(h, /try 1 <span class="glyph-red">✗<\/span> &middot; thinking off &middot; result 1, fact &quot;DepartureWindow&quot;: the label &quot;Departure time:&quot; is not in the quote \(\+8 more\)/);
  assert.match(h, /1 <span class="glyph-red">✗<\/span> line 1 — does its output pass the line&#39;s checks\?|1 <span class="glyph-red">✗<\/span> line 1 — does its output pass the line's checks\?/);
  assert.match(h, /\(9 reasons\) &middot; from line 1 ~ under \$450; not a red-eye; nonstop/);
  assert.match(h, /2 <span class="glyph-green">✓<\/span> did it change any file\?  \(1 file\(s\) changed under output\/\*\*\)/);
  assert.equal((h.match(/<div>result /g) ?? []).length, 9, 'every reason, none dropped');
  assert.match(h, /<summary>the 9 reasons<\/summary>/);
  assert.doesNotMatch(h, /not run/, 'D1: a check that ran never reads not run');
});

test('a passed try (green run): both checks passed, no gap, no reasons fold, no judged line on an old spine', () => {
  const h = tryHtml(green, 0, 1);
  assert.match(h, /try 1 <span class="glyph-green">✓<\/span> &middot; thinking off<\/div>/);
  assert.match(h, /1 <span class="glyph-green">✓<\/span> did it change any file\?/);
  assert.match(h, /2 <span class="glyph-green">✓<\/span> line 1 — does its output pass the line.s checks\? &middot; from line 1 ~ under \$450; not a red-eye; nonstop/);
  assert.doesNotMatch(h, /try-reasons|try-judged|output judged/);
});

test('D2 on the page: the fourth try of step 2 reads "try 4 · … cut off before its checks ran" with no glyph and no checks', () => {
  const h = tryHtml(red, 1, 4);
  assert.match(h, /^<div class="try-line"[^>]*>try 4 &middot; thinking on &middot; cut off before its checks ran<\/div>$|^<div class="try-line"[^>]*>try 4 &middot; cut off before its checks ran<\/div>$/);
  assert.doesNotMatch(h, /try-check/);
});

test('Round table rows: model call / tool / check, with the Try column, "model · read", and a check row', () => {
  const page = getRunRounds('mvdg1xo3', { part: stepIdx(red, 0), all: true }, opts);
  const html = page.rows.slice(0, 4).map(stepRowHtml).join('');
  assert.match(html, /<tr class="round-header-row"><td>1<\/td><td>1<\/td><td>model call<\/td>/);
  assert.match(html, /<td>1<\/td><td>1<\/td><td>model &middot; read<\/td><td>[^<]*flights\.txt/);
  const check = getRunRounds('mvdg1xo3', { part: stepIdx(red, 0), all: true, limit: 200 }, opts).rows.find((r) => r.kind === 'check');
  assert.match(stepRowHtml(check), /<td>&mdash;<\/td><td>1<\/td><td>check<\/td><td>output\/steps\/1\.json<\/td><td><span class="glyph-red">✗<\/span> 1 failed, 1 passed<\/td>/);
});

test('door fold and markers: the door table has the human row; the marker text is the server\'s', () => {
  const door = green.parts.at(-1);
  const html = doorTableHtml(door);
  assert.match(html, /<th>Round<\/th><th>Try<\/th><th>Action<\/th><th>Path<\/th><th>Decision<\/th><th>Time<\/th>/);
  assert.match(html, /<td>&mdash;<\/td><td>&mdash;<\/td><td>human<\/td><td>output\/steps\/1\.json<\/td><td>paused for you<\/td>/);
  assert.match(actorMarkHtml(door), /\[human · ask\]/);
  assert.match(actorMarkHtml(green.parts[stepIdx(green)]), /\[model\]/);
  assert.equal(actorMarkHtml({ kind: 'scout' }), '');
});

test('the page types none of the new words (they all come from the server)', () => {
  const CODE_ONLY = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const w of [/cut off before/, /paused for you/, /waiting for you(?!r)/, /you accepted/, /\[human/, /\[model\]/, /did it change any file/, /reasons<\/summary>/]) {
    assert.doesNotMatch(CODE_ONLY, w, `page must not type ${w}`);
  }
});

test('the flat Audit view says its round numbers count the whole run', () => {
  assert.match(PAGE, /data-testid="audit-flat-roundnote"[^>]*>Round numbers here count the whole run\. In the Grouped view each step counts its own rounds from 1\./);
});
