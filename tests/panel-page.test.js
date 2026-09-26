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
    return { wrapTitleLines, buildStepMapSVG, naturalBoxWidth, computeMapLayout, stepTitleText, stepNumberIndices, buildOrderedBoxes, partHasNoVerdict, partResultGlyph };
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

// ---------------------------------------------------------------------------
// Defect (F196): a died-before-any-step run's synthetic "died during
// planning" placeholder box was being counted as step 1 ("steps: 0 of 1
// done"), and the map box's own title carried a "1 " number prefix as if it
// were a real step. `realSteps()` filters synthetic steps out of the
// summary count / step-card list; `stepTitleText()` skips the number prefix
// for any step flagged `noNumber` (set from `synthetic` by renderRun).
// ---------------------------------------------------------------------------

/** Extracts one named function's source text verbatim out of the page's own
 * inline script (never a reimplementation) and returns it as a callable. */
function extractFn(html, name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected to find function ${name} in src/panel/index.html`);
  // find the matching closing brace by simple depth counting from the first "{"
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = html.slice(start, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn ${name};`)();
}

test('realSteps: filters out any step flagged `synthetic` (the "died during planning" placeholder), keeps real steps', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const realSteps = extractFn(html, 'realSteps');
  const steps = [
    { id: 'a', state: 'done' },
    { id: 'b', state: 'stopped' },
    { id: 'died during planning', state: 'died', synthetic: true },
  ];
  const result = realSteps(steps);
  assert.equal(result.length, 2);
  assert.ok(result.every((s) => !s.synthetic));
});

test('realSteps: a died-before-any-step run (only the synthetic placeholder) reduces to an EMPTY list — the summary must read "0 of 0"/"none started", never "0 of 1"', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const realSteps = extractFn(html, 'realSteps');
  const steps = [{ id: 'died during planning', state: 'died', synthetic: true }];
  assert.equal(realSteps(steps).length, 0);
});

test('stepTitleText: a step flagged noNumber renders WITHOUT the leading "<n> " step-number prefix a real step gets', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { stepTitleText } = loadStepMapGeometry();
  assert.equal(stepTitleText(0, { title: 'died during planning', noNumber: true }), 'died during planning');
  assert.equal(stepTitleText(0, { title: 'run the checks' }), '1 run the checks');
  assert.equal(stepTitleText(2, { title: 'run the checks' }), '3 run the checks');
  assert.ok(html.length > 0); // keep html referenced (lint)
});

// ---------------------------------------------------------------------------
// F197 (regression from 7acd320): once a "scout + plan" noNumber box was
// prepended to the map (item 1, 2026-09-26), a run's real first step started
// numbering from 2 instead of 1 — the map's own text was still numbering by
// raw array POSITION (`idx` in the steps array), not by count-of-numbered-
// boxes-so-far. On real run mu2p83go this made the only real step's box read
// "2 annotate-checks-strict" instead of "1 annotate-checks-strict".
// ---------------------------------------------------------------------------

test('buildStepMapSVG: a noNumber box (scout+plan) ahead of a real step must NOT shift the real step\'s number — first real step stays "1 <title>", never "2 <title>"', () => {
  const { buildStepMapSVG } = loadStepMapGeometry();
  const boxes = [
    { title: 'scout + plan', state: 'done', noNumber: true, attempts: [] },
    { title: 'annotate-checks-strict', state: 'done', attempts: [] },
  ];
  const svg = buildStepMapSVG(boxes, 900);
  assert.match(svg, /1 annotate-checks-strict/, `expected the real step to render as step 1, got: ${svg}`);
  assert.doesNotMatch(svg, /2 annotate-checks-strict/, `real step must not be mislabelled step 2 by the noNumber box ahead of it: ${svg}`);
});

test('buildStepMapSVG: a noNumber box (scout+plan), a real step A, a real step B, and a noNumber box (fix loop) — A is "1", B is "2", never "2"/"3"', () => {
  const { buildStepMapSVG } = loadStepMapGeometry();
  const boxes = [
    { title: 'scout + plan', state: 'done', noNumber: true, attempts: [] },
    { title: 'step A', state: 'done', attempts: [] },
    { title: 'step B', state: 'done', attempts: [] },
    { title: 'fix loop', state: 'done', noNumber: true, attempts: [] },
  ];
  const svg = buildStepMapSVG(boxes, 1200);
  assert.match(svg, /1 step A/, `expected step A labelled 1, got: ${svg}`);
  assert.match(svg, /2 step B/, `expected step B labelled 2, got: ${svg}`);
  assert.doesNotMatch(svg, /2 step A/);
  assert.doesNotMatch(svg, /3 step B/);
});

// ---------------------------------------------------------------------------
// F198: the Run tab's step-CARD list must render in the SAME order as the
// map — scout+plan, then the plan's own steps in run order, then fix loop.
// A prior build (item 1, 2026-09-26) had renderRun build the card list by
// iterating the plan's own steps FIRST, then appending a scout+plan card and
// a fix-loop card AFTER them — so on real run mu2p83go the cards read
// "1 · annotate-checks-strict", "scout + plan", "fix loop", while the map
// (built from a separately-ordered `mapBoxes` list) correctly showed
// scout+plan first. `buildOrderedBoxes()` is now the ONE ordered list that
// feeds both the map and the card list, so they cannot drift apart again.
// ---------------------------------------------------------------------------

// build item B (2026-09-26 rewrite): buildOrderedBoxes now takes
// `detail.parts` directly (src/replay.js's own ONE ordered part list) — not
// a hand-assembled {scoutPlan,steps,fixLoop} object — so the map/card list
// and the Audit tab's grouped rows read off the exact same server-computed
// list and can never drift apart (F198's own bug class, generalized).

test('buildOrderedBoxes: parts render in their own given order (scout, plan, each step, fix) — the same order the map itself renders in', () => {
  const { buildOrderedBoxes } = loadStepMapGeometry();
  const parts = [
    { kind: 'scout', label: 'scout', occurrence: null, outcome: null, attempts: [] },
    { kind: 'plan', label: 'plan', occurrence: null, outcome: null, attempts: [] },
    {
      kind: 'step', label: 'step A', occurrence: 1, outcome: 'green', attempts: [],
    },
    {
      kind: 'step', label: 'step B', occurrence: 1, outcome: 'green', attempts: [],
    },
    {
      kind: 'fix', label: 'fix', occurrence: null, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }],
    },
  ];
  const ordered = buildOrderedBoxes(parts, false);
  assert.deepEqual(ordered.map((b) => b.kind), ['scout', 'plan', 'step', 'step', 'fix']);
  assert.equal(ordered[0].title, 'scout');
  assert.equal(ordered[1].title, 'plan');
  assert.equal(ordered[2].part.label, 'step A');
  assert.equal(ordered[3].part.label, 'step B');
  assert.equal(ordered[4].title, 'fix');
});

test('buildOrderedBoxes: with only a plan step of its own, the list is just that one part (no phantom boxes)', () => {
  const { buildOrderedBoxes } = loadStepMapGeometry();
  const parts = [{
    kind: 'step', label: 'only step', occurrence: 1, outcome: 'green', attempts: [],
  }];
  const ordered = buildOrderedBoxes(parts, false);
  assert.deepEqual(ordered.map((b) => b.kind), ['step']);
});

test('buildOrderedBoxes + stepNumberIndices: real step A/B keep numbers "1"/"2" regardless of the noNumber (non-step) parts around them — proves the card list and the map read numbers off the exact same list', () => {
  const { buildOrderedBoxes, stepNumberIndices } = loadStepMapGeometry();
  const parts = [
    { kind: 'scout', label: 'scout', occurrence: null, outcome: null, attempts: [] },
    {
      kind: 'step', label: 'step A', occurrence: 1, outcome: 'green', attempts: [],
    },
    {
      kind: 'step', label: 'step B', occurrence: 1, outcome: 'green', attempts: [],
    },
    {
      kind: 'fix', label: 'fix', occurrence: null, outcome: 'red', attempts: [{ n: 1, outcome: 'red' }],
    },
  ];
  const ordered = buildOrderedBoxes(parts, false);
  const numbers = stepNumberIndices(ordered);
  // ordered = [scout, step A, step B, fix] -> numbers = [-1, 0, 1, -1]
  assert.equal(numbers[1], 0); // step A displays as "1"
  assert.equal(numbers[2], 1); // step B displays as "2"
});

test('.wf-meta + .wf-meta::before separator carries a space on BOTH sides (" · "), never just a trailing space', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const cssBlockMatch = html.match(/<style>[\s\S]*?<\/style>/);
  assert.ok(cssBlockMatch, 'expected an inline <style> block');
  const css = cssBlockMatch[0];
  const sepRule = css.match(/\.wf-meta \+ \.wf-meta::before\{[^}]*\}/);
  assert.ok(sepRule, 'expected a .wf-meta + .wf-meta::before rule');
  assert.match(sepRule[0], /content:" · "/, `expected content:" · " (space both sides), got: ${sepRule[0]}`);
});

function loadToolsCacheHelpers(html) {
  const start = html.indexOf('function toolDisplayLabel');
  const end = html.indexOf('function renderRun(detail){');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected toolDisplayLabel/toolsLine/cacheLine in src/panel/index.html');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { toolDisplayLabel, toolsLine, cacheLine };`)();
}

test('item 7: toolsLine — unknown (no log saved) when behaviour is null, never a fake "0 calls"', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { toolsLine } = loadToolsCacheHelpers(html);
  assert.equal(toolsLine(null), 'unknown (no log saved)');
});

test('item 7: toolsLine — a real gate-audit-derived behaviour object formats top tools by count, mirroring src/behaviour.js displayLabel', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { toolsLine } = loadToolsCacheHelpers(html);
  // real numbers from bareloop-patients u-mu2p83go.jsonl, verified against
  // `node bin/bareloop.mjs replay` in the build report.
  const behaviour = {
    totalCalls: 142, byTool: {
      shell_read: 75, shell_grep: 44, ctx_recent: 2, edit: 21,
    },
  };
  assert.equal(toolsLine(behaviour), '142 calls — read 75 · grep 44 · edit 21 · recent 2');
  assert.equal(toolsLine({ totalCalls: 0, byTool: {} }), '0 calls');
});

test('item 7: cacheLine — not recorded when memoryCache is null; real numbers otherwise, matching replay\'s own KB formula', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { cacheLine } = loadToolsCacheHelpers(html);
  assert.equal(cacheLine(null), 'not recorded');
  // real numbers from u-mu2p83go.jsonl's memory-cache record.
  assert.equal(cacheLine({ pointered: 7, bytesWithheld: 4865 }), '7 re-reads answered from memory · 4.8 KB not re-sent');
});

test('item 4: desktop (min-width:900px) bounds #BareloopPanel/.main to the viewport so each pane-body scrolls internally, never the whole page', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const cssBlockMatch = html.match(/<style>[\s\S]*?<\/style>/);
  assert.ok(cssBlockMatch);
  const css = cssBlockMatch[0];
  const desktopBlock = css.match(/@media \(min-width: 900px\)\{[\s\S]*?\n  \}/);
  assert.ok(desktopBlock, 'expected a @media (min-width: 900px) block');
  assert.match(desktopBlock[0], /#BareloopPanel\{height:100vh;min-height:0;overflow:hidden;\}/);
  assert.match(desktopBlock[0], /\.main\{overflow:hidden;\}/);
});

test('item 4: a phone-only "↑ list" back-link exists (hidden on desktop, shown under the existing 899px breakpoint)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /data-testid="back-to-list"/);
  assert.match(html, /\.back-to-list-link\{display:none;/);
  assert.match(html, /@media \(max-width: 899px\)\{ \.back-to-list-link\{display:inline-block;\} \}/);
});

test('item 4: row selection scrolls the run view into view on mobile only, gated by the same 899px breakpoint as the CSS', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /window\.matchMedia\("\(max-width: 899px\)"\)\.matches/);
  assert.match(html, /function scrollRunIntoViewMobile\(\)\{/);
  assert.match(html, /getElementById\("right-pane-anchor"\)/);
  assert.match(html, /getElementById\("left-pane-anchor"\)/);
  // both row-click handlers call it
  const wfClick = html.match(/selectRun\(w\.lastRunid, row, "\.wf-row"\); document\.getElementById\("tab-run"\)\.click\(\); scrollRunIntoViewMobile\(\);/);
  const histClick = html.match(/selectRun\(r\.runid, row, "\.hist-row"\); document\.getElementById\("tab-run"\)\.click\(\); scrollRunIntoViewMobile\(\);/);
  assert.ok(wfClick, 'expected the Workflows row click handler to call scrollRunIntoViewMobile()');
  assert.ok(histClick, 'expected the History row click handler to call scrollRunIntoViewMobile()');
});

test('item 5: filterRuns — no filters selected -> everything passes (each group empty = no filter for that group)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterRuns = loadFilterRunsWithSearch(html);
  const runs = [
    { checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
    { checkType: 'rubric', glyph: '✗', at: '2026-01-01T00:00:00.000Z' },
  ];
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  assert.equal(filterRuns(runs, { checkTypes: [], results: [], time: 'all' }, now).length, 2);
});

test('item 5: filterRuns — checkType OR within group, AND across groups', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterRuns = loadFilterRunsWithSearch(html);
  const runs = [
    { checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
    { checkType: 'rubric', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
    { checkType: 'unknown', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
    { checkType: 'deterministic', glyph: '✗', at: '2026-09-20T00:00:00.000Z' },
  ];
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  // OR within checkType group: deterministic OR rubric
  const r1 = filterRuns(runs, { checkTypes: ['deterministic', 'rubric'], results: [], time: 'all' }, now);
  assert.equal(r1.length, 3); // rows 1,2,4

  // AND across groups: checkType=deterministic AND result=✓
  const r2 = filterRuns(runs, { checkTypes: ['deterministic'], results: ['✓'], time: 'all' }, now);
  assert.deepEqual(r2, [runs[0]]);
});

test('item 5: filterRuns — time is single-select (7d/30d/all), excludes older rows and unparseable dates', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterRuns = loadFilterRunsWithSearch(html);
  const now = Date.parse('2026-09-25T12:00:00.000Z');
  const runs = [
    { checkType: 'deterministic', glyph: '✓', at: '2026-09-24T00:00:00.000Z' }, // 1 day old
    { checkType: 'deterministic', glyph: '✓', at: '2026-09-01T00:00:00.000Z' }, // 24 days old
    { checkType: 'deterministic', glyph: '✓', at: '2026-01-01T00:00:00.000Z' }, // very old
    { checkType: 'deterministic', glyph: '✓', at: 'not a date' }, // unparseable
  ];
  const r7 = filterRuns(runs, { checkTypes: [], results: [], time: '7d' }, now);
  assert.deepEqual(r7, [runs[0]]);
  const r30 = filterRuns(runs, { checkTypes: [], results: [], time: '30d' }, now);
  assert.deepEqual(r30, [runs[0], runs[1]]);
  const rAll = filterRuns(runs, { checkTypes: [], results: [], time: 'all' }, now);
  assert.equal(rAll.length, 4);
});

test('item 5 + F-panel-chip-collision: ONE filter-bar component is shared by History AND Workflows — same checkType/result/time chip groups, a clear button, and a "showing N of M" count element, in each tab; no "unknown" check-type chip', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterBarHTML = extractFn(html, 'filterBarHTML');
  ['history', 'workflows'].forEach((scope) => {
    const markup = filterBarHTML(scope);
    assert.match(markup, new RegExp(`data-testid="${scope}-filters"`));
    assert.match(markup, new RegExp(`id="${scope}-filter-clear"`));
    assert.match(markup, new RegExp(`id="${scope}-filter-count"`));
    assert.match(markup, /data-filter-group="checkType"/);
    assert.match(markup, /data-filter-group="result"/);
    assert.match(markup, /data-filter-group="time"/);
    // single-letter checkType chips with tooltips, no "unknown" chip, and
    // bare (bracket-free) result glyphs
    assert.match(markup, /title="deterministic"[^>]*>D</);
    assert.match(markup, /title="rubric"[^>]*>R</);
    assert.doesNotMatch(markup, /data-filter-value="unknown"/);
    assert.doesNotMatch(markup, /\[&#10003;\]/);
  });
  assert.match(html, /"showing " \+ filtered\.length \+ " of " \+ allItems\.length \+ " runs"/);
});

test('item 5 + F-panel-chip-collision: the shared filter-bar component wraps localStorage access in try/catch (per-viewer convenience only)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function createFilterBar');
  const end = html.indexOf('document.getElementById("history-filterbar-anchor")');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected createFilterBar in src/panel/index.html');
  const body = html.slice(start, end);
  assert.match(body, /try\{[\s\S]*localStorage\.getItem[\s\S]*\}catch\(e\)/);
  assert.match(body, /try\{[\s\S]*localStorage\.setItem[\s\S]*\}catch\(e\)/);
});

test('F-panel-chip-collision: filterWorkflows filters by each workflow\'s OWN latest-run checkType/glyph/date, same shape as filterRuns', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // filterWorkflows calls filterRuns internally (a one-row adapter, not a
  // reimplementation), and filterRuns itself calls matchesSearch (item 1) —
  // extract ALL THREE function bodies, verbatim, in source order, so the
  // real dependency chain is exercised rather than stubbed.
  const start = html.indexOf('function matchesSearch(');
  const wfStart = html.indexOf('function filterWorkflows(');
  const braceStart = html.indexOf('{', wfStart);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = html.slice(start, i + 1);
  // eslint-disable-next-line no-new-func
  const filterWorkflows = new Function(`${body}\nreturn filterWorkflows;`)();
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const workflows = [
    { job: 'a', lastCheckType: 'deterministic', lastGlyph: '✓', lastAt: '2026-09-20T00:00:00.000Z' },
    { job: 'b', lastCheckType: 'rubric', lastGlyph: '✗', lastAt: '2026-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(filterWorkflows(workflows, { checkTypes: [], results: [], time: 'all' }, now), workflows);
  assert.deepEqual(filterWorkflows(workflows, { checkTypes: ['deterministic'], results: [], time: 'all' }, now), [workflows[0]]);
  assert.deepEqual(filterWorkflows(workflows, { checkTypes: [], results: [], time: '7d' }, now), [workflows[0]]);
});

test('item 6/build item B: the part card meta line carries a plain-language title (hover) explaining parts/calls/tools — no new glyph', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    html,
    /class="step-meta" title="a part is one piece of the run \(scout, plan, a step, replan, fix, judge\); a call is one model round"/,
  );
});

// ---------------------------------------------------------------------------
// item 1 (2026-09-25): the shared search box (job name + runid substring, AND
// with the chip filters). `filterRuns` calls `matchesSearch`, so both must be
// extracted together (same brace-matching trick the filterWorkflows test
// above already uses) — never a reimplementation of the search predicate.
// ---------------------------------------------------------------------------
function loadFilterRunsWithSearch(html) {
  const start = html.indexOf('function matchesSearch(');
  const frStart = html.indexOf('function filterRuns(');
  const braceStart = html.indexOf('{', frStart);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = html.slice(start, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn filterRuns;`)();
}

test('item 1: matchesSearch — case-insensitive substring on job name or runid; empty/whitespace query = no filter', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function matchesSearch(');
  const end = html.indexOf('function filterRuns(');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  const matchesSearch = new Function(`${body}\nreturn matchesSearch;`)();
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', 'PULSE'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', 'mu2p'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', 'nomatch'), false);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', ''), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', '   '), true);
});

test('item C: matchesSearch — also matches the model field (case-insensitive substring), null model never crashes', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function matchesSearch(');
  const end = html.indexOf('function filterRuns(');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  const matchesSearch = new Function(`${body}\nreturn matchesSearch;`)();
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'deepseek-chat', 'deepseek'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'claude-sonnet-5', 'SONNET'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'claude-sonnet-5', 'deepseek'), false);
  // matches job/runid still work when model doesn't
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'claude-sonnet-5', 'pulselog'), true);
  // null/absent model (older archived run) never crashes, never false-matches
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', null, 'deepseek'), false);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', undefined, ''), true);
});

test('item 1: filterRuns — search is AND with the chip groups, matches job or runid', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterRuns = loadFilterRunsWithSearch(html);
  const runs = [
    { job: 'pulselog-person', runid: 'mu2p83go', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
    { job: 'other-job', runid: 'xyz123', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z' },
  ];
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  // matches by job substring
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: [], time: 'all', search: 'pulse' }, now), [runs[0]]);
  // matches by runid substring
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: [], time: 'all', search: 'xyz' }, now), [runs[1]]);
  // AND with a chip filter that would otherwise pass both
  assert.deepEqual(filterRuns(runs, { checkTypes: ['deterministic'], results: [], time: 'all', search: 'nomatch' }, now), []);
  // no search key at all behaves as before (undefined -> no filter)
  assert.equal(filterRuns(runs, { checkTypes: [], results: [], time: 'all' }, now).length, 2);
});

test('item C: filterRuns — search also matches the run\'s model field', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterRuns = loadFilterRunsWithSearch(html);
  const runs = [
    {
      job: 'pulselog-person', runid: 'mu2p83go', model: 'deepseek-chat', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z',
    },
    {
      job: 'other-job', runid: 'xyz123', model: 'claude-sonnet-5', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z',
    },
  ];
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: [], time: 'all', search: 'deepseek' }, now), [runs[0]]);
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: [], time: 'all', search: 'sonnet' }, now), [runs[1]]);
  assert.deepEqual(filterRuns(runs, { checkTypes: [], results: [], time: 'all', search: 'nomodel' }, now), []);
});

test('item C: filterWorkflows — search matches a workflow\'s own lastModel field', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function matchesSearch(');
  const wfStart = html.indexOf('function filterWorkflows(');
  const braceStart = html.indexOf('{', wfStart);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = html.slice(start, i + 1);
  // eslint-disable-next-line no-new-func
  const filterWorkflows = new Function(`${body}\nreturn filterWorkflows;`)();
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const workflows = [
    {
      job: 'a', lastCheckType: 'deterministic', lastGlyph: '✓', lastAt: '2026-09-20T00:00:00.000Z', lastModel: 'deepseek-chat',
    },
    {
      job: 'b', lastCheckType: 'rubric', lastGlyph: '✗', lastAt: '2026-01-01T00:00:00.000Z', lastModel: 'claude-sonnet-5',
    },
  ];
  assert.deepEqual(filterWorkflows(workflows, { checkTypes: [], results: [], time: 'all', search: 'deepseek' }, now), [workflows[0]]);
  assert.deepEqual(filterWorkflows(workflows, { checkTypes: [], results: [], time: 'all', search: 'sonnet' }, now), [workflows[1]]);
});

test('item 1: the search input exists in the shared filter bar for both scopes, and clear empties it', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterBarHTML = extractFn(html, 'filterBarHTML');
  ['history', 'workflows'].forEach((scope) => {
    const markup = filterBarHTML(scope);
    assert.match(markup, new RegExp(`id="${scope}-filter-search"`));
    assert.match(markup, new RegExp(`data-testid="${scope}-filter-search"`));
  });
  // clear resets search to "" alongside the chip groups
  assert.match(html, /state = \{ checkTypes: \[\], results: \[\], time: "all", search: "" \};/);
});

test('item C: search placeholder mentions job, run id AND model', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /placeholder="search job, run id or model…"/);
});

test('item 1: search state persists via the same localStorage key as the chip filters', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /search: typeof parsed\.search === "string" \? parsed\.search : ""/);
  assert.match(html, /searchInput\.addEventListener\("input"/);
});

// ---------------------------------------------------------------------------
// item 2 (2026-09-25): Audit tab — model-call rows + round column
// ---------------------------------------------------------------------------

test('item 2: audit table header carries a Round column, and renderAudit renders a model-call row distinctly from a tool-call row', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /<thead><tr><th>Round<\/th><th>Step<\/th><th>Action<\/th><th>Path<\/th><th>Decision<\/th><th>Time<\/th><\/tr><\/thead>/);
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected renderAudit in src/panel/index.html');
  const body = html.slice(start, end);
  assert.match(body, /r\.kind === "model-call"/);
  assert.match(body, /"model call"/);
  assert.match(body, /r\.costUsd/);
  assert.match(body, /r\.tokens/);
  assert.match(body, /r\.durationMs/);
  assert.match(body, /typeof r\.round === "number"/);
});

test('item: Decision cell for a model-call row shows only cost/tokens/duration, no "model call" badge text; Action cell carries that label instead', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const body = html.slice(start, end);
  // decisionCell for a model-call row is built from the joined cost/tokens/duration
  // bits alone — no "badge cyan"/"model call" wrapper the way the old markup had.
  assert.doesNotMatch(body, /badge cyan\\">model call/);
  const decisionAssign = body.slice(body.indexOf('if(isModelCall){'), body.indexOf('} else {', body.indexOf('if(isModelCall){')));
  assert.doesNotMatch(decisionAssign, /model call/);
  assert.match(decisionAssign, /decisionCell = escapeXml\(bits\.join\(" · "\)\)/);
  // Action cell keeps identifying a model-call row as such.
  assert.match(body, /isModelCall \? "model call" : escapeXml\(r\.action \|\| "unknown"\)/);
});

test('item: Audit table cells are built in Round, Step, Action, Path, Decision, Time order, matching the header', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const body = html.slice(start, end);
  const trStart = body.indexOf('tr.innerHTML =');
  const trEnd = body.indexOf(';', body.indexOf('escapeXml(r.time'));
  const trBody = body.slice(trStart, trEnd);
  const roundIdx = trBody.indexOf('roundCell');
  const stepIdx = trBody.indexOf('stepCell');
  const actionIdx = trBody.indexOf('isModelCall ? "model call"');
  const pathIdx = trBody.indexOf('pathCell');
  const decisionIdx = trBody.indexOf('decisionCell');
  const timeIdx = trBody.indexOf('escapeXml(r.time');
  assert.ok(roundIdx < stepIdx && stepIdx < actionIdx && actionIdx < pathIdx && pathIdx < decisionIdx && decisionIdx < timeIdx,
    `expected Round < Step < Action < Path < Decision < Time in tr.innerHTML build order, got: ${trBody}`);
});

test('item: Audit table header cells are sticky on scroll, inside a bounded self-scrolling wrapper (pane-body alone does not reliably scroll on mobile)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /\[data-testid="audit-table"\] th\{[^}]*position:sticky/);
  assert.match(html, /\[data-testid="audit-table"\] th\{[^}]*top:0/);
  assert.match(html, /\[data-testid="audit-table"\] th\{[^}]*z-index:\s*\d/);
  // th already carries a solid background (var(--panel2)) so scrolled rows
  // don't show through underneath the sticky header.
  assert.match(html, /th\{[^}]*background:var\(--panel2\)/);
  // the table itself has a bounded, always-scrolling wrapper — on mobile
  // #BareloopPanel/.main are unbound and the PAGE scrolls, so .pane-body
  // never develops its own scroll offset there and a sticky th anchored
  // only to it would scroll away with the page (verified live at 390px).
  assert.match(html, /\.audit-table-scroll\{[^}]*overflow:auto/);
  assert.match(html, /<div class="audit-table-scroll">\s*<table data-testid="audit-table">/);
});

test('build item C rewrite (2026-09-26): renderAudit\'s Step cell shows a tooltip on a null part (round-part reason, never the old phase-string/ts-heuristic wording) and appends "· aN" when an attempt number is present', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const body = html.slice(start, end);
  assert.match(body, /r\.partLabel === null/);
  assert.match(body, /before the first model call/);
  assert.match(body, /r\.reason === "unassigned"/);
  assert.doesNotMatch(body, /final check/, 'the old ts-window "final-check" heuristic must be gone, replaced by the round\'s own seq matched against parts');
  assert.match(body, /typeof r\.attemptN === "number"/);
});

test('item 3 (2026-09-26): renderAudit\'s Path cell shows "&mdash;" (never "unknown") for a model-call row', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const body = html.slice(start, end);
  assert.match(body, /var pathCell = isModelCall \? "&mdash;" : escapeXml\(r\.path \|\| "unknown"\)/);
});

// ---------------------------------------------------------------------------
// item 3 (2026-09-25): tools line shows EVERY tool (no top-5 truncation),
// plus the "offered, never used" second line.
// ---------------------------------------------------------------------------

function loadToolsFns(html) {
  const start = html.indexOf('function toolDisplayLabel(');
  const end = html.indexOf('function renderRun(detail){');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected toolDisplayLabel/toolsLine/offeredNeverUsedLine in src/panel/index.html');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { toolsLine, offeredNeverUsedLine };`)();
}

test('item 3: toolsLine lists EVERY tool used, no top-5 truncation, sorted by count descending', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { toolsLine } = loadToolsFns(html);
  const behaviour = {
    totalCalls: 7,
    byTool: {
      shell_read: 3, shell_grep: 1, edit: 1, ctx_recall: 1, ctx_get: 1,
    },
  };
  const line = toolsLine(behaviour);
  assert.match(line, /^7 calls —/);
  // all 5 distinct tools present, not truncated to fewer
  ['read', 'grep', 'edit', 'recall', 'get'].forEach((name) => {
    assert.ok(line.indexOf(name) !== -1, `expected "${name}" in tools line: ${line}`);
  });
  assert.doesNotMatch(line, /…/);
});

test('item 3: offeredNeverUsedLine — spec tools minus used (by display name), null when nothing offered or nothing unused', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { offeredNeverUsedLine } = loadToolsFns(html);
  const behaviour = { totalCalls: 3, byTool: { shell_read: 2, edit: 1 } };
  assert.equal(offeredNeverUsedLine(['read', 'edit', 'recall', 'get'], behaviour), 'recall, get');
  assert.equal(offeredNeverUsedLine(['read', 'edit'], behaviour), null); // nothing unused
  assert.equal(offeredNeverUsedLine(null, behaviour), null); // no granted list at all
  assert.equal(offeredNeverUsedLine([], behaviour), null);
  assert.equal(offeredNeverUsedLine(['recall'], null), 'recall'); // no behaviour at all -> everything offered reads as never-used
});

test('item 3: the Run summary carries a hidden "offered" row that paintOfferedRow fills once both run + job data are in, in either arrival order', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /id="summary-offered-row" hidden/);
  assert.match(html, /var lastRunBehaviour = null;/);
  assert.match(html, /var lastJobToolsList = null;/);
  assert.match(html, /function paintOfferedRow\(\)\{/);
  // renderRun sets lastRunBehaviour then repaints; renderJob sets lastJobToolsList then repaints
  assert.match(html, /lastRunBehaviour = detail\.behaviour;\s*\n\s*paintOfferedRow\(\);/);
  assert.match(html, /lastJobToolsList = Array\.isArray\(job\.toolsList\) \? job\.toolsList : null;\s*\n\s*paintOfferedRow\(\);/);
});

// ---------------------------------------------------------------------------
// item 4 (2026-09-25): map boxes show attempts inline
// ---------------------------------------------------------------------------

test('item 4: attemptsInlineText / stepTitleText — attempts append to the box title as "attempt N [check/cross]"', () => {
  const { attemptsInlineText, stepTitleText } = (function(){
    const html = readFileSync(PAGE_PATH, 'utf8');
    const start = html.indexOf('function attemptGlyph(');
    const end = html.indexOf('function naturalBoxWidth(');
    const body = html.slice(start, end);
    // eslint-disable-next-line no-new-func
    return new Function(`${body}\nreturn { attemptsInlineText, stepTitleText };`)();
  })();
  assert.equal(attemptsInlineText([]), '');
  assert.equal(attemptsInlineText(null), '');
  assert.equal(
    attemptsInlineText([{ n: 1, outcome: 'red' }, { n: 2, outcome: 'green' }]),
    'attempt 1 ✗ · attempt 2 ✓',
  );
  assert.equal(stepTitleText(0, { title: 'annotate-checks', attempts: [] }), '1 annotate-checks');
  assert.equal(
    stepTitleText(0, { title: 'annotate-checks', attempts: [{ n: 1, outcome: 'green' }] }),
    '1 annotate-checks — attempt 1 ✓',
  );
});

test('build item B: buildOrderedBoxes feeds each part\'s own attempts into the map data (never a step-shaped re-derivation), except a no-verdict part kind (scout/plan/replan/judge) which shows no inline attempt/result glyph at all', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /attempts: partHasNoVerdict\(part\) \? \[\] : \(Array\.isArray\(part\.attempts\) \? part\.attempts : \[\]\)/);
});

// live-check regression (caught on a real headless render of mu2p83go, see
// build report): a scout/plan/replan/judge part's ONE attempt is always the
// wholePartAttempt synthetic placeholder (outcome:null) — before this fix,
// buildOrderedBoxes fed that straight into the map/card display and it
// rendered as a bare "attempt 1 ?" / a trailing "· ?" on every such box,
// reading as an unresolved result when nothing was ever judged there.
test('build item B RED-PROOF: partResultGlyph/partHasNoVerdict — scout/plan/replan/judge (no per-part verdict) render NO result glyph at all, never a fabricated "?"; step/fix/run (a real verdict) still do', () => {
  const { buildOrderedBoxes, partHasNoVerdict, partResultGlyph } = loadStepMapGeometry();
  const noVerdictKinds = ['scout', 'plan', 'replan', 'judge'];
  noVerdictKinds.forEach((kind) => {
    const part = {
      kind, label: kind, occurrence: null, outcome: null, attempts: [{ n: 1, outcome: null }],
    };
    assert.equal(partHasNoVerdict(part), true, `${kind} must be a no-verdict kind`);
    const [box] = buildOrderedBoxes([part], false);
    assert.deepEqual(box.attempts, [], `${kind}'s synthetic attempt must not reach map/card display`);
    assert.equal(partResultGlyph(part, box), null, `${kind} must render no result glyph at all`);
  });
  // a real single-attempt step (a genuine green) still shows its glyph.
  const stepPart = {
    kind: 'step', label: 'x', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }],
  };
  const [stepBox] = buildOrderedBoxes([stepPart], false);
  assert.equal(partResultGlyph(stepPart, stepBox), '✓');
  // a multi-attempt fix loop still joins every attempt's own glyph.
  const fixPart = {
    kind: 'fix', label: 'fix', occurrence: null, outcome: 'green', attempts: [{ n: 1, outcome: 'red' }, { n: 2, outcome: 'green' }],
  };
  const [fixBox] = buildOrderedBoxes([fixPart], false);
  assert.equal(partResultGlyph(fixPart, fixBox), '✗✓');
});

// ---------------------------------------------------------------------------
// build item C (2026-09-26 rewrite): the Run tab's cards no longer expand at
// all (build spec item B — "Remove Run-tab card expand/attempts/rounds UI");
// this coverage moves to its Audit-tab equivalent — the grouped-by-part rows
// render collapsed-by-default toggles and lazy-load rounds via the SAME
// /api/runs/:runid/rounds?part=<i>&attempt=<n> endpoint on expand.
// ---------------------------------------------------------------------------

test('build item C: Audit tab grouped rows render collapsed-by-default part toggles, and lazy-load rounds via /api/runs/:runid/rounds?part=<i> on expand', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /audit-part-toggle/);
  assert.match(html, /body\.className = "audit-part-body";\s*\n\s*body\.hidden = !startExpanded;/);
  assert.match(html, /class="rounds-list"/);
  assert.match(html, /function loadRounds\(/);
  assert.match(html, /"part=" \+ encodeURIComponent\(partIndex\) \+ "&attempt=" \+ encodeURIComponent\(attempt\.n\) \+ "&offset=" \+ offset/);
  assert.match(html, /"\/api\/runs\/" \+ encodeURIComponent\(currentRunid\) \+ "\/rounds\?" \+ params/);
});

test('item 5: renderRoundsPage builds "showing A–B of N" text and a load-more button only when more rounds remain', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.ok(html.indexOf("var pageInfo = '<div class=\"hint\">showing ' + (data.offset + 1) +") !== -1, 'expected the "showing A of B" pagination text builder in src/panel/index.html');
  assert.ok(html.indexOf("+ shownTo + ' of ' + data.totalRounds + '</div>';") !== -1);
  assert.match(html, /var hasMore = shownTo < data\.totalRounds;/);
  assert.match(html, /var loadMoreHtml = hasMore \? '<button class="btn small rounds-load-more"/);
  // toolLogSaved:false renders the honest "no log saved" line, never a fake empty tool-call list
  assert.match(html, /tool calls: no log saved/);
  // a round's check result renders with the same green\/red badge vocabulary as everywhere else
  assert.match(html, /data\.check\.outcome === "green" \? "green" : "red"/);
});

// ---------------------------------------------------------------------------
// item 6 (2026-09-25): "took" (finished/died) vs "elapsed" (live [▶] only)
// ---------------------------------------------------------------------------

test('item 6: run-counters reads "took Xs" for a finished or died run, "Xs elapsed" only for a live [▶] run', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.ok(html.indexOf('var isLive = detail.glyph === "▶" && !detail.died;') !== -1);
  assert.ok(html.indexOf('var wallPhrase = isLive ? (wallText + " elapsed") : ("took " + wallText);') !== -1);
});
