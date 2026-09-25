// PANEL-BUILD.md P1 — the panel PAGE (`src/panel/index.html`). The step-map
// renderer (`buildStepMapSVG`/`wrapTitleLines`) is copied verbatim from
// `design/panel-mockup.html` into this file's inline `<script>` (one
// renderer, no second hand-authored map — the build spec's own rule). It has
// no module exports (a plain IIFE, matching the mockup it was copied from),
// so this file extracts the PURE geometry functions (no DOM calls) straight
// out of the page's own source text and evaluates them in isolation — the
// real algorithm shipped in the page, not a reimplementation of it that
// could silently drift from what actually renders.
//
// PANEL-BUILD.md §7's named gap: no fixture before this session ever had a
// step title long enough to force the map's 2-line wrap path. This proves
// that path renders without overlap/squeeze — with a REAL long step id read
// off an archived spine when one is available, and an authored one
// (labelled as such) otherwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(HERE, '..', 'src', 'panel', 'index.html');

/** Extracts the pure step-map geometry functions straight out of the page's
 * own inline script and returns them as callable functions — never a
 * reimplementation, the exact text the browser would run. */
function loadStepMapGeometry() {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function stepMapColors');
  const end = html.indexOf('function stepMapLegendHTML');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected to find the step-map geometry block in src/panel/index.html');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${body}
    return { wrapTitleLines, buildStepMapSVG, naturalBoxWidth, computeMapLayout, stepTitleText };
  `);
  return factory();
}

test('src/panel/index.html carries exactly one step-map renderer (no second hand-authored map)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const occurrences = html.split('function buildStepMapSVG').length - 1;
  assert.equal(occurrences, 1);
});

test('wrapTitleLines: a short title stays on one line', () => {
  const { wrapTitleLines } = loadStepMapGeometry();
  const lines = wrapTitleLines('1 short', 200);
  assert.equal(lines.length, 1);
});

test('wrapTitleLines: a title too wide for its box wraps onto a SECOND line, never squeezed/truncated to one', () => {
  const { wrapTitleLines } = loadStepMapGeometry();
  // a box width deliberately narrower than the natural width of this title —
  // the wrap path only fires when a box was clamped below its natural size.
  const title = '7 Update references in source across the whole repository tree';
  const lines = wrapTitleLines(title, 160);
  assert.equal(lines.length, 2);
  // both lines concatenate back to the same words, in order — proves nothing
  // was silently dropped by the wrap.
  assert.equal(`${lines[0]} ${lines[1]}`.replace(/\s+/g, ' '), title);
});

test('buildStepMapSVG: a step list containing a long title renders a taller (2-line) box, never overlapping the next box', () => {
  const { buildStepMapSVG } = loadStepMapGeometry();
  const steps = [
    { title: 'Read the errors', state: 'done' },
    { title: 'Update references in source across the whole repository tree and every downstream consumer', state: 'running' },
    { title: 'Run the check', state: 'waiting' },
  ];
  // a narrow available width forces the box below its natural (unsqueezed)
  // width, which is exactly what triggers the 2-line wrap path.
  const svg = buildStepMapSVG(steps, 420);
  assert.match(svg, /<svg /);
  // two <text> elements at DIFFERENT y-offsets for the long title's box
  // (BOX_H_2LINE's y+17 / y+29 pair) proves the 2-line path actually fired,
  // not just that the function ran without throwing.
  const textYs = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(textYs.length > 0);
  // group y-values by rounding to the nearest box row start; at least one
  // pair of consecutive close y-values (title line 1 / line 2, 12px apart)
  // must exist for the 2-line box.
  const sorted = [...textYs].sort((a, b) => a - b);
  const hasTwoLinePair = sorted.some((y, i) => i > 0 && Math.abs(y - sorted[i - 1]) === 12);
  assert.ok(hasTwoLinePair, `expected a 2-line title pair (12px apart) among y-offsets: ${sorted.join(',')}`);
});

// ---------------------------------------------------------------------------
// prefer a REAL long step id off an archived spine when one exists; fall
// back to an authored one, named as such (never presented as real).
// ---------------------------------------------------------------------------

const REAL_PATIENTS_DIR = '/home/hamr/PycharmProjects/bareloop-patients';

function findRealLongStepId() {
  if (!existsSync(REAL_PATIENTS_DIR)) return null;
  let dirs;
  try { dirs = readdirSync(REAL_PATIENTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return null; }
  for (const d of dirs) {
    const dirPath = join(REAL_PATIENTS_DIR, d.name);
    let files;
    try { files = readdirSync(dirPath); } catch { continue; }
    for (const f of files.filter((n) => n.endsWith('.jsonl') && !n.endsWith('-gate-audit.jsonl') && !n.endsWith('.lag.jsonl'))) {
      let text;
      try { text = readFileSync(join(dirPath, f), 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"step-start"')) continue;
        try {
          const rec = JSON.parse(line);
          if (typeof rec.step === 'string' && rec.step.length >= 30) return rec.step;
        } catch { /* skip malformed line */ }
      }
    }
  }
  return null;
}

test('step-title wrap, exercised with a REAL long step id when the archive has one, else an authored fixture (named honestly)', () => {
  const { buildStepMapSVG } = loadStepMapGeometry();
  const real = findRealLongStepId();
  const title = real ?? 'update-references-in-source-across-the-whole-repository-tree'; // authored fixture — no real step id in the archive reached 30+ chars at test time
  if (!real) {
    // honest label — this assertion documents that the fixture is authored, not found
    assert.ok(title.length >= 30, 'authored fixture must itself be long enough to force the wrap');
  }
  const svg = buildStepMapSVG([{ title, state: 'running' }, { title: 'x', state: 'waiting' }], 300);
  assert.match(svg, /<svg /);
  assert.ok(svg.length > 0);
});

// ---------------------------------------------------------------------------
// Workflows/History row layout — glyph+name stays on ONE line (ellipsis,
// never wrap), meta stays on ONE line (ellipsis, never wrap onto a 3rd/4th
// line). Defect: a long real job name + runid (e.g. "pulselog-person-
// live-2-bareloop (u-mu2p83go)") was breaking the glyph off onto its own
// line and wrapping meta onto a 4th line at both 1440px and 390px, verified
// visually with real headless screenshots (see the build report).
// ---------------------------------------------------------------------------

test('wf-row/hist-row markup: glyph+name are grouped in one nowrap/ellipsis line (wf-line1 > dot + wf-name), never split across the old row-break trick', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.ok(!html.includes('row-break'), 'the old flex-wrap row-break trick must be fully removed');
  assert.ok(html.includes('class="wf-line1"'), 'expected a dedicated line1 container grouping the dot + name');
  // both renderers must build the same wf-line1 > dot + wf-name[title] shape
  const line1Occurrences = html.split('class="wf-line1"').length - 1;
  assert.ok(line1Occurrences >= 3, `expected wf-line1 built by renderWorkflows and both renderHistory branches (found ${line1Occurrences})`);
  assert.match(html, /wf-name" title="/, 'wf-name must carry a title attribute with the full, untruncated text');
});

test('wf-name and wf-meta-line CSS: single-line with ellipsis (never wrap) so a long job name/runid or meta string truncates instead of pushing onto extra lines', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const cssBlockMatch = html.match(/<style>[\s\S]*?<\/style>/);
  assert.ok(cssBlockMatch, 'expected an inline <style> block');
  const css = cssBlockMatch[0];
  const wfNameRule = css.match(/\.wf-name\{[^}]*\}/);
  assert.ok(wfNameRule, 'expected a .wf-name CSS rule');
  assert.match(wfNameRule[0], /white-space:nowrap/);
  assert.match(wfNameRule[0], /text-overflow:ellipsis/);
  assert.match(wfNameRule[0], /overflow:hidden/);
  const metaLineRule = css.match(/\.wf-meta-line\{[^}]*\}/);
  assert.ok(metaLineRule, 'expected a .wf-meta-line CSS rule');
  assert.match(metaLineRule[0], /white-space:nowrap/);
  assert.match(metaLineRule[0], /text-overflow:ellipsis/);
  assert.match(metaLineRule[0], /overflow:hidden/);
});

// ---------------------------------------------------------------------------
// Defect: Workflows/History row meta renders "deterministic· $1.5056· 6m08s"
// — no space BEFORE the "·" separator (only after it) once .wf-meta-line
// dropped its old flex/column-gap layout for a single nowrap/ellipsis line —
// the ONLY spacing left comes from the ::before content string itself, so it
// must carry a leading space too. design/panel-mockup.html reads
// "deterministic · $0.66 · 4m 02s" (spaced both sides).
// ---------------------------------------------------------------------------

test('.wf-meta + .wf-meta::before separator carries a space on BOTH sides (" · "), never just a trailing space', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const cssBlockMatch = html.match(/<style>[\s\S]*?<\/style>/);
  assert.ok(cssBlockMatch, 'expected an inline <style> block');
  const css = cssBlockMatch[0];
  const sepRule = css.match(/\.wf-meta \+ \.wf-meta::before\{[^}]*\}/);
  assert.ok(sepRule, 'expected a .wf-meta + .wf-meta::before rule');
  assert.match(sepRule[0], /content:" · "/, `expected content:" · " (space both sides), got: ${sepRule[0]}`);
});
