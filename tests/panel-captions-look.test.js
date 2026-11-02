// hamr 2026-11-02 (carried from fwdloop 0ae68fb..7d710ff): panel caption looks. $0, static page checks on src/panel/index.html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const body = (start) => { const i = PAGE.indexOf(start); assert.ok(i >= 0, `rule ${start}`); return PAGE.slice(i, PAGE.indexOf('}', i)); };

test('1. Chat job card captions are 13px bold accent pills on a tint, no left bar', () => {
  const r = body('#job-card .field > label:not(.jf-thinking)');
  assert.match(r, /font-size:13px/); assert.match(r, /font-weight:700/); assert.match(r, /text-transform:none/);
  assert.match(r, /color:var\(--accent\)/); assert.match(r, /border-radius:999px/); assert.match(r, /display:inline-block/);
  assert.match(r, /background:color-mix\(in srgb,var\(--accent\) 16%,transparent\)/);
  assert.doesNotMatch(r, /border-left/);
  assert.match(PAGE, /#job-card \.cap-field > label/, 'the $ / time cap captions are pills too');
});

test('2. no [n] numbers on either tab row', () => {
  assert.doesNotMatch(PAGE, /counter-reset:\s*(tabnum|rtabnum)/);
  assert.doesNotMatch(PAGE, /counter-increment:\s*(tabnum|rtabnum)/);
  assert.doesNotMatch(PAGE, /\.(tabrow|rp-tabrow) button(\[aria-selected="true"\])?::before/);
  assert.doesNotMatch(PAGE, /counter\((tabnum|rtabnum)\)/);
});
