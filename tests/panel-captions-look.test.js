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

test('4b. a Jobs-list card carries rl-jobcard (the divider between job cards)', () => {
  assert.match(PAGE, /var top = '<div class="rl-card rl-jobcard'/);
});

test('5. Run tab ENDED/NEXT/SCHEDULE labels, Summary and Map captions are accent bold; a red state still wins', () => {
  const lab = body('.ended-label{');
  assert.match(lab, /color:var\(--accent\)/); assert.match(lab, /font-weight:700/); assert.match(lab, /font-size:11px/);
  assert.match(body('.ended-row.is-red .ended-label,'), /color:var\(--red\)/);
  assert.match(body('.next-label{'), /color:var\(--accent\);font-weight:700/);
  for (const sel of ['.summary-box::before{', '.map-box::before{']) {
    const r = body(sel);
    assert.match(r, /font-size:12px/, sel); assert.match(r, /font-weight:700/, sel); assert.match(r, /color:var\(--accent\)/, sel);
  }
});

test('5. Run summary row labels are accent bold, scoped to #run-summary (the Import box keeps its faint labels)', () => {
  const r = body('#run-summary .sum-label{');
  assert.match(r, /color:var\(--accent\)/); assert.match(r, /font-weight:700/);
  assert.match(body('\n  .sum-label{'), /color:var\(--text-faint\)/, 'the shared rule stays faint for the Import box');
});

test('6. Chat job card pills carry a small grey `required` inside the label, for exactly the fields validateJobCard refuses when empty', () => {
  assert.equal((PAGE.match(/--req:#[0-9a-f]{6};/g) ?? []).length, 3, 'a --req token in each of the three token blocks');
  const r = body('#job-card .req{');
  assert.match(r, /font-size:11px/); assert.match(r, /font-weight:400/); assert.match(r, /color:var\(--req\)/);
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'), PAGE.indexOf('id="chat-card-error"'));
  const marked = [...card.matchAll(/<label for="([^"]+)">[^<]*<span class="req"[^>]*>required<\/span><\/label>/g)].map((m) => m[1]);
  assert.deepEqual(marked, ['jf-name', 'jf-job', 'jf-inputs', 'jf-dest', 'jf-cap-money']);
  assert.doesNotMatch(card, /jf-cap-time">[^<]*<span class="req"/, 'the time cap is optional');
});

test('7. Audit tab caption words are accent, scoped to #audit-body; values, [ N lines ] buttons and glyph colours keep their own', () => {
  const th = body('#audit-body table th{');
  assert.match(th, /color:var\(--accent\)/); assert.match(th, /font-weight:700/);
  const caps = body('#audit-body .sub-label,');
  for (const sel of ['#audit-body .sub-label', '#audit-body .fx-label', '#audit-body td.hint']) assert.ok(caps.includes(sel), sel);
  assert.match(caps, /color:var\(--accent\)/); assert.match(caps, /font-weight:700/);
  assert.match(body('#audit-body .fx-try{'), /color:var\(--accent\)/);
  assert.match(body('\n  th{'), /color:var\(--text-dim\)/, 'the global th rule (Settings tables) stays dim');
  assert.match(body('.sub-label{'), /color:var\(--text-faint\)/, 'the shared .sub-label stays faint outside the Audit tab');
  assert.match(body('.fx-label{'), /color:var\(--text-faint\)/);
  assert.doesNotMatch(body('.fx-more{'), /accent/, 'the [ +N more lines ] button keeps its own colour');
});

test('8. Runs tab search block is a light card (fwdloop V1): tinted card, accent SEARCH caption, 1px accent input', () => {
  assert.match(PAGE, /--accent:#7aa2f7; --plan:#7aa2f7;\s*--search-tint:var\(--panel2\);/);
  assert.equal((PAGE.match(/--accent:#2668c2; --plan:#2668c2;\s*--search-tint:#f5f7fc;/g) || []).length, 2, 'both light blocks');
  const dash = body('#panel-runs .rl-dash{');
  assert.match(dash, /border:0/); assert.doesNotMatch(dash, /var\(--accent\)/);
  const note = body('#panel-runs .rl-faint[data-testid="rl-filter-note"]{');
  assert.match(note, /color:var\(--accent\)/); assert.match(note, /font-weight:700/);
  assert.match(note, /background:var\(--search-tint\)/); assert.match(note, /border-radius:6px 6px 0 0/);
  assert.match(body('#panel-runs .rl-faint[data-testid="rl-filter-note"]::before{'), /content:"SEARCH  "/);
  const anchor = body('#runs-filterbar-anchor{');
  assert.match(anchor, /background:var\(--search-tint\)/); assert.match(anchor, /border-radius:0 0 6px 6px/);
  assert.doesNotMatch(anchor, /border-bottom/);
  assert.match(body('#runs-filterbar-anchor input[type="search"]'), /border:1px solid var\(--accent\)/);
  assert.match(body('#runs-filterbar-anchor input:focus{'), /outline:2px solid var\(--accent\)/);
  assert.match(PAGE, /<div class="rl-dash"><\/div>\s*<div class="rl-faint" data-testid="rl-filter-note">/, 'hooks exist, no HTML change');
});
