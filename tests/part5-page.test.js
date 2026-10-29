// PRD v1.106 Part 5 (C): the page DRAWS the door fold and markers from the server's words, using the page's own functions pulled out of
// src/panel/index.html by name and fed the real getRunDetail / getRunRounds output of the two archived runs. The page types none of the door
// words. (The step's try blocks and single Round table became the Audit grid, PRD v1.119: tests/audit-grid-page.test.js.)
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
const doorTableHtml = new Function('escapeXml', 'auditTimeCellHtml', `${fnSrc('doorTableHtml')}\nreturn doorTableHtml;`)(escapeXml, (r) => escapeXml(r.time || ''));
const actorMarkHtml = new Function('escapeXml', `${fnSrc('actorMarkHtml')}\nreturn actorMarkHtml;`)(escapeXml);
const world = makePart5World();
const opts = { home: world.home };
const red = getRunDetail('mvdg1xo3', opts);
const green = getRunDetail('mve5y8fa', opts);
const stepIdx = (d, nth = 0) => d.parts.map((p, i) => [p, i]).filter(([p]) => p.kind === 'step')[nth][1];

test('the Round table the page used to draw for a whole step is still served (?all=1): model call, tool and check rows, each with its Try', () => {
  const page = getRunRounds('mvdg1xo3', { part: stepIdx(red, 0), all: true }, opts);
  assert.deepEqual(page.rows.slice(0, 2).map((r) => [r.kind, r.try]), [['model', 1], ['tool', 1]]);
  const check = getRunRounds('mvdg1xo3', { part: stepIdx(red, 0), all: true, limit: 200 }, opts).rows.find((r) => r.kind === 'check');
  assert.deepEqual([check.try, check.sign, check.text, check.path], [1, '✗', '1 failed, 1 passed', 'output/steps/1.json']);
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
