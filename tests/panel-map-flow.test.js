// hamr ruling A (2026-10-09): the step map chips show the FLOW — an arrow between consecutive chips (glued to the chip
// before it), a leading arrow on the first chip of each wrapped line (a post-render layout pass), and `↻N` inside a
// chip that took more than one try. Parts come from the server's own getRunDetail over a real-shape spine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'panel', 'index.html'), 'utf8');
const body = PAGE.slice(PAGE.indexOf('function escapeXml'), PAGE.indexOf('function renderStepMap('));
// eslint-disable-next-line no-new-func
const g = new Function(`${body}\nreturn { buildStepMapHTML, buildOrderedBoxes, markLineStarts, stepMapKeyHTML };`)();

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const at = (s) => `2026-10-01T10:00:${String(s).padStart(2, '0')}.000Z`;

/** a finished run: step "a" green on try 1, step "b" red on try 1 then green on try 2 (two exit-evals), step "c" green */
function realParts() {
  const home = mkdtempSync(join(tmpdir(), 'map-flow-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const plan = { schema: 'plan-v1', steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const ev = (step, iteration, pass, s, seq) => ({ type: 'exit-eval', step, iteration, results: [{ type: 'check-passes', pass }], ts: at(s), seq });
  const rows = [
    { type: 'job-start', job: 'job', specHash: 'h1', budgetUsd: 8, shape: 'plan', goal: 'g', ts: at(0), seq: 1 },
    { type: 'plan-accepted', plan, ts: at(1), seq: 2 },
    { type: 'step-start', step: 'a', ts: at(2), seq: 3 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, phase: 'step:a', ts: at(3), seq: 4 },
    ev('a', 1, true, 4, 5),
    { type: 'step-end', step: 'a', outcome: 'green', ts: at(5), seq: 6 },
    { type: 'step-start', step: 'b', ts: at(6), seq: 7 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, phase: 'step:b', ts: at(7), seq: 8 },
    ev('b', 1, false, 8, 9),
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, phase: 'step:b', ts: at(9), seq: 10 },
    ev('b', 2, true, 10, 11),
    { type: 'step-end', step: 'b', outcome: 'green', ts: at(11), seq: 12 },
    { type: 'step-start', step: 'c', ts: at(12), seq: 13 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.1, phase: 'step:c', ts: at(13), seq: 14 },
    ev('c', 1, true, 14, 15),
    { type: 'step-end', step: 'c', outcome: 'green', ts: at(15), seq: 16 },
    { type: 'job-end', outcome: 'green', spentUsd: 0.4, spendComplete: true, ts: at(16), seq: 17 },
  ];
  const spine = join(dir, 'u-flow.jsonl');
  writeFileSync(spine, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: at(0), runid: 'flow', job: 'job', spine, patient: null, via: 'run-u', pid: 999999, capUsd: 8 }, { home });
  return getRunDetail('flow', { home }).parts;
}

const items = (html) => [...html.matchAll(/<span class="map-item"[^>]*>(.*?)<\/span>(?=<span class="map-item"|<\/div>)/gs)].map((m) => m[1]);

test('flow arrows: one after every chip except the last (inside the same unit, so it never wraps alone); a lead arrow on every chip but the first', () => {
  const parts = realParts();
  const html = g.buildStepMapHTML(g.buildOrderedBoxes(parts, false));
  const units = html.split('<span class="map-item"').slice(1);
  assert.ok(units.length >= 3, `real parts give ${units.length} chips`);
  units.forEach((u, i) => {
    const trailing = (u.match(/class="map-arrow"/g) || []).length;
    assert.equal(trailing, i < units.length - 1 ? 1 : 0, `unit ${i}: trailing arrow ${i < units.length - 1 ? 'present' : 'absent on the last'}`);
    assert.equal((u.match(/class="map-lead"/g) || []).length, i > 0 ? 1 : 0, `unit ${i}: lead arrow only on non-first`);
    if (trailing) assert.ok(u.indexOf('class="map-arrow"') > u.search(/<(button|span) [^>]*class="map-chip/), 'arrow follows its chip inside the unit');
  });
  assert.doesNotMatch(items(html).at(-1) ?? '', /map-arrow/);
  // CSS: unit is nowrap-glued; the lead arrow hangs out of flow and shows only under .line-start
  assert.match(PAGE, /\.map-item\{[^}]*display:inline-flex/);
  assert.match(PAGE, /\.map-lead\{display:none;position:absolute;/);
  assert.match(PAGE, /\.map-item\.line-start \.map-lead\{display:block;\}/);
});

test('↻N: a step that took two tries (from real getRunDetail parts) shows ↻2 inside the box before the sign, keeps the dashed class; single-try steps show none', () => {
  const parts = realParts();
  const b = parts.find((p) => p.label === 'b');
  assert.equal(b.attempts.length, 2, 'fixture really is a 2-try step');
  const html = g.buildStepMapHTML(g.buildOrderedBoxes(parts, false));
  assert.match(html, /\bretry\b[^>]*data-retry="2"[^>]*>\[<span class="chip-retry">↻2<\/span> <span class="chip-sign">✓<\/span> 2 b/);
  assert.equal((html.match(/chip-retry/g) || []).length, 1, 'only the retried step carries ↻N');
  assert.equal((html.match(/data-retry=/g) || []).length, 1);
  assert.match(g.stepMapKeyHTML([{}]), /↻N = took N tries \(dashed box\)/);
});

test('line-start pass (stubbed layout): the first chip whose offsetTop is below its predecessor gets .line-start; same-line chips and the first chip never do; re-running re-toggles', () => {
  const mk = (top) => { const s = new Set(); return { offsetTop: top, classList: { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c) } }; };
  const els = [mk(0), mk(0), mk(0), mk(30), mk(30), mk(60)];
  g.markLineStarts(els);
  assert.deepEqual(els.map((e) => e.classList.has('line-start')), [false, false, false, true, false, true]);
  // the window narrows: everything stacks one per line
  [0, 30, 60, 90, 120, 150].forEach((t, i) => { els[i].offsetTop = t; });
  g.markLineStarts(els);
  assert.deepEqual(els.map((e) => e.classList.has('line-start')), [false, true, true, true, true, true]);
  // it widens back: classes are removed, not left stale
  els.forEach((e) => { e.offsetTop = 0; });
  g.markLineStarts(els);
  assert.deepEqual(els.map((e) => e.classList.has('line-start')), [false, false, false, false, false, false]);
});

test('layout wiring: render and resize both run the pass, debounced; the toggle only touches an out-of-flow arrow (no reflow loop)', () => {
  assert.match(PAGE, /mount\.innerHTML = buildStepMapHTML\(steps\) \+ stepMapKeyHTML\(steps\);\s*layoutMap\(\);/);
  assert.match(PAGE, /new ResizeObserver\(layoutMapSoon\)/);
  assert.match(PAGE, /clearTimeout\(layoutTimer\)/);
});
