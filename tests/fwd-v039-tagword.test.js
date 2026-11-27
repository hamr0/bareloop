// fwd v0.39.0 am8b (34c4faa4), copied 2026-11-27 (ITEM33-BUILD Addendum 2026-11-27, hamr "1B, 2B"): the page's one answer to "what is the tag word of this row" is
// `tagWordOf` (src/panel/index.html); `ckTagHtml` and `byTagOf` ask it. A word the server never sends (not you, agent, default) now draws an EMPTY tag text (span and data-by stay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name, page = PAGE) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = page.indexOf('{', start);
  for (; i < page.length; i += 1) { if (page[i] === '{') depth += 1; else if (page[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return page.slice(start, i + 1);
}
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** the page's `ckTagHtml` and `byTagOf` as they were before this change (v0.64.0): the oracle */
const OLD_CK = 'function ckTagHtml(by){ return \'<span class="by tagcol" data-testid="plan-by"\' + (by ? \' data-by="\' + escapeXml(by) + \'"\' : "") + ">" + (by ? "[" + escapeXml(by) + "]" : "") + "</span>"; }';
const oldCk = new Function('escapeXml', `${OLD_CK}\nreturn ckTagHtml;`)(escapeXml);
const newCk = () => new Function('escapeXml', `${fnSrc('tagWordOf')}\n${fnSrc('ckTagHtml')}\nreturn ckTagHtml;`)(escapeXml);
const newBy = () => new Function(`${fnSrc('tagWordOf')}\n${fnSrc('byTagOf')}\nreturn byTagOf;`)();

test('guard: no page function other than tagWordOf builds a tag word from a row\'s `by`', () => {
  let page = PAGE;
  try { page = PAGE.replace(fnSrc('tagWordOf'), ''); } catch { /* not there yet: nothing to take out */ }
  const hits = [];
  page.split('\n').forEach((l, i) => {
    if (/^\s*(?:\/\/|\/\*)/.test(l)) return;
    if (/\[(?:you|agent|default)\]/.test(l) || /"\[" \+ escapeXml\(by\)/.test(l)) hits.push(`index.html:${i + 1}: ${l.trim().slice(0, 100)}`);
  });
  assert.deepEqual(hits, []);
});

test('same answer: the new ckTagHtml draws what the old one drew for you, agent, default, empty and missing', () => {
  const ck = newCk();
  for (const by of ['you', 'agent', 'default', '', undefined, null]) assert.equal(ck(by), oldCk(by), String(by));
  assert.match(ck('you'), />\[you\]<\/span>$/);
  assert.match(ck('agent'), /data-by="agent">\[agent\]<\/span>$/);
});

test('ruled 2B: an unknown word draws an EMPTY tag text; the span and its data-by stay', () => {
  const ck = newCk();
  assert.equal(oldCk('sheet'), '<span class="by tagcol" data-testid="plan-by" data-by="sheet">[sheet]</span>');
  assert.equal(ck('sheet'), '<span class="by tagcol" data-testid="plan-by" data-by="sheet"></span>');
  assert.equal(ck('toString'), '<span class="by tagcol" data-testid="plan-by" data-by="toString"></span>', 'a word on Object.prototype is not a tag');
});

test('byTagOf keeps its sign and tag for the three words and nothing for any other', () => {
  const by = newBy();
  assert.match(by('you'), /data-by="you">~ \[you\]<\/span>/);
  assert.match(by('agent'), /data-by="agent">! \[agent\]<\/span>/);
  assert.match(by('default'), /data-by="default">\$ \[default\]<\/span>/);
  for (const w of [null, undefined, '', 'sheet', 'toString']) assert.equal(by(w), '');
  assert.match(by('you', 'shape'), /data-form="shape">\[shape\]<\/span>$/);
});
