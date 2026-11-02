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

test('3. field captions elsewhere are 12px bold accent; checkbox/radio labels keep their own colour', () => {
  for (const sel of ['\n  label{', '.money-item label{']) {
    const r = body(sel);
    assert.match(r, /font-size:12px/, sel); assert.match(r, /font-weight:700/, sel); assert.match(r, /color:var\(--accent\)/, sel);
    assert.doesNotMatch(r, /text-dim/, sel);
  }
  assert.match(body('\n  label{'), /text-transform:uppercase/, 'case kept');
  assert.match(body('.field label.jf-thinking{'), /color:var\(--text-dim\)/);
  assert.match(body('.pv-legacy{'), /color:var\(--text-dim\)/);
  assert.match(body('.radio-row label{display:flex'), /color:var\(--text\)/);
});

test('4. Runs tab section captions are colour bars with a count pill; tokens in all three blocks; the helper takes the cap', () => {
  for (const t of ['w', 's', 'j', 'r']) {
    assert.equal((PAGE.match(new RegExp(`--cap-${t}:#[0-9a-f]{6};`, 'g')) ?? []).length, 3, `--cap-${t} in dark, light-media and light-attr blocks`);
    assert.match(PAGE, new RegExp(`\\.rl-cap\\.rl-cap-${t}\\{--cap-c:var\\(--cap-${t}\\)`));
  }
  const cap = body('.rl-cap{');
  assert.match(cap, /border-left:5px solid var\(--cap-c\)/); assert.match(cap, /background:var\(--cap-bg\)/); assert.match(cap, /color:var\(--cap-ink\)/);
  assert.match(body('.rl-cap .rl-n{'), /border-radius:10px/);
  assert.match(body('.rl-cap .rl-p{'), /font-size:0/);
  assert.match(PAGE, /\.rl-jobcard::before\{/);
  assert.match(PAGE, /function rlSectHtml\(label, n, note, cap\)/);
  assert.match(PAGE, /rlSectHtml\("Scheduled", m\.scheduled\.length, "", "s"\)/);
  assert.match(PAGE, /rlSectHtml\("Jobs", m\.jobs\.length, .*, "j"\)/);
  assert.match(PAGE, /label: "Running now", cap: "r"/);
  assert.match(PAGE, /label: "Needs you", cap: "w"/);
});
