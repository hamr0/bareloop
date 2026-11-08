// R8 (piece 10): the ticket grid on the page. The page's OWN pure drawing functions are cut out of src/panel/index.html by name and fed the REAL payloads (grid + the opened run's generic /result) of
// archived ticket runs (tests/fixtures/ticket-grid). The page types none of the bucket, status, money or check words the server owns. A ticket job's Result tab is the grid instead of the five boxes;
// every other job's tab (generic or rubric) is drawn exactly as before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGridWorld } from './ticket-grid-world.mjs';
import { getJobGrid, getRunResult } from '../src/panel/server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const src = (name) => {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `page function ${name}`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
};
const ESC = 'function escapeXml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}';
const names = ['gridGlyph', 'stateDotHTML', 'resultField', 'resultDoorHtml', 'resultDiffHtml', 'stageQuestionText', 'stageNumberText',
  'tgMark', 'tgCell', 'tgRowData', 'tgChecksLine', 'tgOpenHtml', 'tgRowHTML', 'tgStatsHTML', 'tgTableHTML', 'gridCardHTML', 'gridOpenOwn'];
let cut = null;
const make = (data) => new Function('resultData', 'gridRowData', 'gridUi', `${ESC}\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)(data, {}, { rows: {}, open: {}, ownFor: null });
const fns = new Proxy({}, { get: (_, k) => { cut ??= make(null); return cut[k]; } });
const strip = (h) => h.replace(/<[^>]+>/g, '');
const NOW = Date.parse('2026-11-08T12:00:00Z');

function real() {
  const w = makeGridWorld({ skipped: [{ runid: 'sk-12', ticket: 12, at: '2026-11-07T20:00:00.000Z', words: 'the ticket is closed' }] });
  const grid = getJobGrid('mw3gso0m', { home: w.home, now: NOW });
  const rd = (id) => getRunResult(id, { home: w.home });
  return { grid, passed: rd('mw3gso0m'), stopped: rd('mw6lmvdg') };
}
const ui = (o = {}) => ({ rows: {}, open: {}, anyway: null, msg: '', ...o });

test('the table: run | steps done | checks the close\'s | cost | time; four fold rows with the server\'s labels and counts; Needs you and Stopped open, Passed and Skipped folded', () => {
  const { grid } = real();
  const h = fns.tgTableHTML(grid, ui(), null);
  assert.deepEqual([...h.matchAll(/<th class="(?:r|t)">([^<]*)/g)].map((m) => m[1]), ['run', 'steps', 'checks', 'cost', 'time']);
  assert.match(h, /data-testid="grid-fold-wait"[^>]*aria-expanded="true"><span class="tg-foldin">▾ Needs you \(0\)</);
  assert.match(h, /data-testid="grid-fold-stop"[^>]*aria-expanded="true"><span class="tg-foldin">▾ Stopped \(1\)</);
  assert.match(h, /data-testid="grid-fold-done"[^>]*aria-expanded="false"><span class="tg-foldin">▸ Passed \(1\)</);
  assert.match(h, /data-testid="grid-fold-skip"[^>]*aria-expanded="false"><span class="tg-foldin">▸ Skipped \(1\)</);
  assert.equal(h.includes('#7 ·'), false, 'a folded bucket draws no rows');
  assert.match(h, /title="#17 · fwdloop test: P3 skip check"/);
});

test('the stats line: counts from the groups\' own labels, the money the server spelled (never typed here)', () => {
  const { grid } = real();
  const h = fns.tgStatsHTML(grid);
  assert.match(strip(h), /^0 needs you · 1 stopped · 1 passed · 1 skipped · spent \$/);
  assert.ok(h.includes(`<b>${grid.stats.spent}</b>`));
});

test('cells: the mark and the server\'s own text; a cell with no text draws the mark alone', () => {
  assert.equal(fns.tgCell({ mark: 'g', text: '6 of 6' }), '<td class="c"><span class="glyph-green">✓</span><span class="tg-val">6 of 6</span></td>');
  assert.equal(fns.tgCell({ mark: 'r', text: '' }), '<td class="c"><span class="glyph-red">✗</span></td>');
  assert.match(fns.tgCell({ mark: 'q', text: 'unknown' }), /glyph-q.*unknown/);
  assert.match(fns.tgCell({ mark: 'n', text: '' }), /glyph-nr/);
});

test('the opened passed row: ticket line with its link, what changed with the last diff, the checks line, the work as TEXT, no door unless it is the run in hand, then the run id', () => {
  const { grid, passed } = real();
  const row = grid.groups.find((g) => g.key === 'done').rows[0];
  const h = fns.tgOpenHtml(row, passed, false);
  assert.match(h, /data-testid="grid-ticket"><b>#7 fwdloop test: P1 walk 2<\/b> &middot; <a data-testid="grid-ticket-link" class="link" href="https:\/\/github\.com\/hamr0\/hol-guard\/issues\/7" target="_blank" rel="noopener noreferrer">/);
  assert.match(h, /data-testid="grid-changed">changed: src\/sum\.js \(\+1 −1\)</);
  assert.match(h, /<pre class="rs-diff" data-testid="grid-diff">[^]*<span class="rs-del">-export const sum = \(xs\) =&gt; xs\.reduce\(\(a, b\) =&gt; a - b, 0\);<\/span>/);
  assert.match(strip(h.match(/data-testid="grid-checks">(.*?)<\/div>/)[1]), /^checks: 6 of 6 ✓ &middot; /);
  assert.match(h, /did all the old tests still exist\?/);
  assert.equal(h.includes('data-testid="grid-why"'), false, 'a passed run is not "why it stopped"');
  assert.equal(h.includes('result-accept'), false);
  assert.match(h, /<button class="tk-rl" type="button" data-testid="ticket-run" data-run="mw3gso0m">mw3gso0m<\/button><\/div>$/);
  const mine = fns.tgOpenHtml(row, passed, true);
  assert.ok(mine.includes(fns.resultDoorHtml(passed.door)), 'the very same door markup, for the run the person opened');
  assert.equal(h.includes('<button class="btn"'), false);
});

test('the opened stopped row: why it stopped in the Run tab\'s own words, the checks line says none ran when the close never ran, no work line without a branch', () => {
  const { grid, stopped } = real();
  const row = grid.groups.find((g) => g.key === 'stop').rows[0];
  const h = fns.tgOpenHtml(row, stopped, false);
  assert.match(h, /data-testid="grid-why">failed: Goal not met — the checks said no \(cap-halt/);
  assert.match(h, /data-testid="grid-checks">checks: the close did not run any check for this run</);
  assert.match(h, /data-testid="grid-ticket"><b>#17 fwdloop test: P3 skip check</);
});

test('an opened row whose payload is not there yet says it is loading; one with no result tab (404) says nothing more; a run that waits at the door but is not the one in hand points to it', () => {
  const { grid } = real();
  const row = grid.groups.find((g) => g.key === 'done').rows[0];
  assert.match(fns.tgOpenHtml(row, null, false), /data-testid="grid-loading"/);
  assert.equal(fns.tgOpenHtml(row, { none: true, kind: 'none' }, false).includes('grid-loading'), false);
  assert.match(fns.tgOpenHtml({ ...row, needs: 'Accept' }, { none: true, kind: 'none' }, false), /data-testid="grid-door-elsewhere"/);
});

test('a skipped row is always open: the badge word and the reason from the server, Run it anyway only when the server allows it; its box needs words before Go', () => {
  const { grid } = real();
  const skip = grid.groups.find((g) => g.key === 'skip').rows[0];
  const h = fns.tgRowHTML(skip, ui(), null);
  assert.match(h, /<span class="badge grey">skipped<\/span><span data-testid="ticket-reason">the ticket is closed<\/span><button class="btn small" type="button" data-testid="ticket-anyway-open" data-number="12">Run it anyway<\/button>/);
  assert.equal(h.includes('grid-open'), false, 'no arrow: a skipped run has no steps to open');
  const none = fns.tgRowHTML({ ...skip, anyway: false }, ui(), null);
  assert.equal(none.includes('ticket-anyway-open'), false);
  const box = fns.tgRowHTML(skip, ui({ anyway: { number: 12, text: '' } }), null);
  assert.match(box, /data-testid="ticket-anyway-box"><textarea data-testid="ticket-anyway-text"[^>]*><\/textarea><button class="btn small" type="button" data-testid="ticket-anyway-go" disabled>/);
  assert.equal(box.includes('ticket-anyway-open'), false, 'the button swaps for the reason box');
  const typed = fns.tgRowHTML(skip, ui({ anyway: { number: 12, text: 'wrong label' } }), null);
  assert.match(typed, />wrong label<\/textarea><button class="btn small" type="button" data-testid="ticket-anyway-go">/);
});

test('the run in hand opens by itself, in its bucket, once; the row data of that run is the already loaded generic payload', () => {
  const { grid, passed } = real();
  const f = make(passed);
  const u = { rows: {}, open: {}, ownFor: null };
  // gridOpenOwn writes the page's own gridUi: cut it with the state the test hands in
  const own = new Function('gridUi', `${src('gridOpenOwn')}\nreturn gridOpenOwn;`)(u);
  own(grid, 'mw3gso0m');
  assert.deepEqual(u, { rows: { mw3gso0m: true }, open: { done: true }, ownFor: 'mw3gso0m' });
  u.rows.mw3gso0m = false; own(grid, 'mw3gso0m');
  assert.equal(u.rows.mw3gso0m, false, 'a person who closed it is not overruled on the next poll');
  assert.equal(f.tgRowData('mw3gso0m'), passed);
  assert.equal(f.tgRowData('mw6lmvdg'), null);
});

test('a ticket title cannot inject markup anywhere in the grid', () => {
  const { grid, passed } = real();
  const evil = JSON.parse(JSON.stringify(grid));
  evil.groups[2].rows[0].title = '<img src=x onerror=alert(1)>';
  evil.groups[2].rows[0].url = 'javascript:alert(1)';
  const h = fns.tgTableHTML(evil, ui({ open: { done: true }, rows: { mw3gso0m: true } }), null) + fns.tgOpenHtml(evil.groups[2].rows[0], passed, false);
  assert.equal(h.includes('<img'), false);
  assert.equal(h.includes('javascript:'), false);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('renderResult: the grid takes the tab only for a ticket job (`resultGrid` for THIS run); the generic and rubric branches, syncResultTab and its gate are untouched', () => {
  const f = src('renderResult');
  const g = f.indexOf('resultGrid && resultGrid.runid === detail.runid');
  const gen = f.indexOf('if(data.kind === "generic")');
  assert.ok(g > 0 && gen > g, 'the grid branch comes first');
  assert.match(f, /gridCardHTML\(resultGrid, gridUi, detail\)/);
  assert.match(f, /if\(data\.kind === "generic"\)\{ paintResultBody\(body, resultGenericHtml\(data, detail\), detail, typed, rerunOpen\); return; \}/);
  assert.match(f, /resultLineCard\(line, ownPages, data\.pageNote\)/);
  assert.match(src('syncResultTab'), /var show = detail\.hasResult === true;/);
  assert.match(src('loadResult'), /\/grid"\)\.catch\(function\(\)\{ return null; \}\)/, 'a plain job\'s 404 is just no grid');
  assert.match(src('clearResult'), /resultGrid = null/);
});

test('Run it anyway posts job + ticket + reason to the click route, and nothing else; the grid never lets a blank reason out of the page', () => {
  const f = src('gridClick');
  assert.match(f, /authorPost\("\/api\/author\/ticket-anyway", \{ job: g\.job, ticket: a\.number, reason: a\.text\.trim\(\) \}\)/);
  assert.match(f, /if\(!a \|\| a\.text\.trim\(\) === ""\)\{ gridUi\.msg = "Please write a reason to run it anyway\."/);
});

test('narrow screens: the table scrolls inside its own box and the long lines wrap, so the page itself never scrolls sideways', () => {
  assert.match(PAGE, /\.grid-wrap\{overflow:auto;max-width:100%;\}/);
  assert.match(PAGE, /table\.grid\.tg tr\.step-sub td\{white-space:normal;overflow-wrap:anywhere/);
  assert.match(PAGE, /\.tg-line\{[^}]*overflow-wrap:anywhere/);
  assert.match(PAGE, /\.tg-rowname\{[^}]*max-width:min\(300px,60vw\)/);
});
