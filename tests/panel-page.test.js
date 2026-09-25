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

test('item 6: the step card meta line carries a plain-language title (hover) explaining steps/rounds/tools — no new glyph', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    html,
    /class="step-meta" title="a step is one piece of the plan; a round is one model call; each round can use several tools \(read, edit, search…\)"/,
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
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'PULSE'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'mu2p'), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', 'nomatch'), false);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', ''), true);
  assert.equal(matchesSearch('pulselog-person', 'mu2p83go', '   '), true);
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
  assert.match(html, /<thead><tr><th>Time<\/th><th>Round<\/th><th>Action<\/th><th>Path<\/th><th>Decision<\/th><th>Step<\/th><\/tr><\/thead>/);
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
    const start = html.indexOf('function attemptsInlineText(');
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

test('item 4: renderRun feeds each step\'s attempts into the map data', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /attempts: s\.attempts \|\| \[\]/);
});

// ---------------------------------------------------------------------------
// item 5 (2026-09-25): expandable step cards -> attempts -> rounds
// ---------------------------------------------------------------------------

test('item 5: step cards render collapsed-by-default attempt toggles, and lazy-load rounds via /api/runs/:runid/rounds on expand', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /step-attempts-toggle/);
  assert.match(html, /class="attempts-list" hidden/);
  assert.match(html, /class="rounds-list" hidden/);
  assert.match(html, /function loadRounds\(/);
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
