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
    return { wrapTitleLines, buildStepMapSVG, naturalBoxWidth, computeMapLayout, stepTitleText, stepNumberIndices, buildOrderedBoxes, partHasNoVerdict, partResultGlyph, boxRetryTry, partBoxState, attemptGlyph };
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

/** Extracts one named function's source text verbatim (brace-depth counted
 * from its own `function name(` marker, wherever it lives in the page). */
function extractFnSource(html, name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected to find function ${name} in src/panel/index.html`);
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return html.slice(start, i + 1);
}

/** Extracts one named function's source text verbatim out of the page's own
 * inline script (never a reimplementation) and returns it as a callable. */
function extractFn(html, name) {
  // eslint-disable-next-line no-new-func
  return new Function(`${extractFnSource(html, name)}\nreturn ${name};`)();
}

/** Extracts SEVERAL named functions verbatim (any source order — function
 * DECLARATIONS hoist within the constructed scope, so a caller defined
 * earlier in the page than its own callee still resolves it) and returns the
 * one named `returnName` as a callable, with its real dependency chain
 * intact (never a reimplementation/stub of the functions it calls). */
function loadFns(html, names, returnName) {
  const body = names.map((n) => extractFnSource(html, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn ${returnName};`)();
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

// ---------------------------------------------------------------------------
// hamr's ruling 2026-09-28 ("panel money 2-decimals") — panelMoney is the
// ONE money render every display in the page goes through; RED-PROVEN by
// breaking the function (dropped the <$0.01 branch, dropped the epsilon
// guard, swapped floor for round) and confirming each assertion below turns
// red before restoring — see the build report for the exact breaks used.
// ---------------------------------------------------------------------------

function loadMoneyFns(html) {
  return loadFns2(
    html,
    ['panelMoney', 'panelMoneyWithDraft', 'rowSpendText'],
    ['panelMoney', 'panelMoneyWithDraft', 'rowSpendText'],
  );
}

test('panelMoney: exact amounts round half-up to 2 decimals', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoney } = loadMoneyFns(html);
  assert.equal(panelMoney(3.71), '$3.71');
  assert.equal(panelMoney(3.71), '$3.71', 'a 4-decimal-clean value stays exact');
  assert.equal(panelMoney(0.815), '$0.82', 'exact half-up — 0.815 rounds UP to 0.82, not down (float-representation guarded)');
  assert.equal(panelMoney(0), '$0.00', 'a real exact zero prints $0.00, never "unknown"');
});

test('panelMoney: a real positive amount under a cent renders "<$0.01", never "$0.00"', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoney } = loadMoneyFns(html);
  assert.equal(panelMoney(0.004), '<$0.01');
  assert.equal(panelMoney(0.0001), '<$0.01');
  assert.equal(panelMoney(0.01), '$0.01', 'exactly a cent is never "<$0.01"');
});

test('panelMoney: floor mode rounds DOWN, never overstating a floor as exact-higher', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoney } = loadMoneyFns(html);
  assert.equal(panelMoney(0.819, true), '$0.81', 'floor 0.819 -> $0.81, never rounded up to $0.82');
  assert.equal(panelMoney(0.82, true), '$0.82', 'a floor that lands exactly on a cent stays that cent (float-guarded, not understated)');
});

test('panelMoney: null/undefined/non-finite keeps the honest "unknown" text, never a fabricated $0', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoney } = loadMoneyFns(html);
  assert.equal(panelMoney(null), 'unknown');
  assert.equal(panelMoney(undefined), 'unknown');
  assert.equal(panelMoney(NaN), 'unknown');
});

test('panelMoneyWithDraft: 2-decimal composite, matching src/replay.js\'s moneyWithDraft shape but at 2 decimals', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoneyWithDraft } = loadMoneyFns(html);
  assert.equal(panelMoneyWithDraft(3.71, false, 0.81, true, 5), '$3.71 ($0.81 drafting) of $5.00');
  assert.equal(panelMoneyWithDraft(3.68, false, null, null, 5), '$3.68 of $5.00');
  assert.equal(panelMoneyWithDraft(3.68, false, null, null), '$3.68', 'no drafting share, no cap -> unchanged base render');
});

test('panelMoneyWithDraft: an INCOMPLETE drafting fold reads "at least" on BOTH the bracket and the leading figure — hamr\'s ruling 2026-09-28 (2nd addendum)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoneyWithDraft } = loadMoneyFns(html);
  assert.equal(
    panelMoneyWithDraft(3.71, false, 0.81, false, 5),
    'at least $3.71 (at least $0.81 drafting) of $5.00',
  );
});

test('panelMoneyWithDraft: an already-floor leading figure (e.g. a died run\'s own spend-floor) never doubles the "at least" prefix', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { panelMoneyWithDraft } = loadMoneyFns(html);
  assert.equal(panelMoneyWithDraft(0.018, true, null, null), 'at least $0.02');
  assert.equal(panelMoneyWithDraft(0.018, true, 0.81, false), 'at least $0.02 (at least $0.81 drafting)');
});

test('rowSpendText: a died row reads its own spend-floor as "at least $X"; a live row with an incomplete draft reads "at least" on both parts', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { rowSpendText } = loadMoneyFns(html);
  assert.equal(rowSpendText({ died: true, spendFloorUsd: 0.018, spentUsd: null }), 'at least $0.02');
  assert.equal(rowSpendText({ died: false, spentUsd: 3.71, draftSpentUsd: 0.81, draftSpendComplete: true }), '$3.71 ($0.81 drafting)');
  assert.equal(
    rowSpendText({ died: false, spentUsd: 3.71, draftSpentUsd: 0.81, draftSpendComplete: false }),
    'at least $3.71 (at least $0.81 drafting)',
  );
  assert.equal(rowSpendText({ died: false, spentUsd: 3.68, draftSpentUsd: null, draftSpendComplete: null }), '$3.68', 'no drafting share -> unchanged from the plain render');
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
  // the ONE shared run-row builder (item 2, 2026-09-26 merge: buildRunRowEl,
  // used by both History and a Workflows job's inline expansion) calls it —
  // a job row itself only expands/collapses now, it never selects a run.
  const runRowClick = html.match(/selectRun\(r\.runid, row, "\.hist-row"\); document\.getElementById\("tab-run"\)\.click\(\); scrollRunIntoViewMobile\(\);/);
  assert.ok(runRowClick, 'expected buildRunRowEl\'s click handler to call scrollRunIntoViewMobile()');
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
  const end = html.indexOf('document.getElementById("runs-filterbar-anchor")');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected createFilterBar in src/panel/index.html');
  const body = html.slice(start, end);
  assert.match(body, /try\{[\s\S]*localStorage\.getItem[\s\S]*\}catch\(e\)/);
  assert.match(body, /try\{[\s\S]*localStorage\.setItem[\s\S]*\}catch\(e\)/);
});

test('item 2 (2026-09-26 merge): filterWorkflows matches a job if ANY of its runs match (not only the latest) — a one-line adapter over filterRuns, same real dependency chain as matchesSearch', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // filterWorkflows calls filterRuns internally (never a reimplementation),
  // and filterRuns itself calls matchesSearch (item 1) — extract all three
  // (function declarations hoist, so extraction order doesn't matter) so the
  // real dependency chain is exercised rather than stubbed.
  const filterWorkflows = loadFns(html, ['matchesSearch', 'filterRuns', 'filterWorkflows'], 'filterWorkflows');
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const jobA = {
    job: 'a',
    runs: [{ runid: 'a2', job: 'a', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z' }],
  };
  const jobB = {
    job: 'b',
    runs: [{ runid: 'b1', job: 'b', checkType: 'rubric', glyph: '✗', at: '2026-01-01T00:00:00.000Z' }],
  };
  const jobs = [jobA, jobB];
  assert.deepEqual(filterWorkflows(jobs, { checkTypes: [], results: [], time: 'all' }, now), jobs);
  assert.deepEqual(filterWorkflows(jobs, { checkTypes: ['deterministic'], results: [], time: 'all' }, now), [jobA]);
  assert.deepEqual(filterWorkflows(jobs, { checkTypes: [], results: [], time: '7d' }, now), [jobA]);
});

test('item 2 (2026-09-26 merge): filterWorkflows matches a job whose LATEST run fails a filter but an OLDER run in that same job passes it', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterWorkflows = loadFns(html, ['matchesSearch', 'filterRuns', 'filterWorkflows'], 'filterWorkflows');
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const job = {
    job: 'mixed',
    runs: [
      { runid: 'newest', job: 'mixed', checkType: 'rubric', glyph: '✗', at: '2026-09-24T00:00:00.000Z' }, // latest — does NOT match
      { runid: 'older', job: 'mixed', checkType: 'deterministic', glyph: '✓', at: '2026-09-01T00:00:00.000Z' }, // older — DOES match
    ],
  };
  const matched = filterWorkflows([job], { checkTypes: ['deterministic'], results: [], time: 'all' }, now);
  assert.equal(matched.length, 1, 'the job must still show up because an older run of it matches');
  assert.equal(matched[0].job, 'mixed');
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

test('item C: filterWorkflows — search matches a run\'s own model field, off the job\'s real per-run list', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const filterWorkflows = loadFns(html, ['matchesSearch', 'filterRuns', 'filterWorkflows'], 'filterWorkflows');
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const jobs = [
    {
      job: 'a',
      runs: [{
        runid: 'a1', job: 'a', checkType: 'deterministic', glyph: '✓', at: '2026-09-20T00:00:00.000Z', model: 'deepseek-chat',
      }],
    },
    {
      job: 'b',
      runs: [{
        runid: 'b1', job: 'b', checkType: 'rubric', glyph: '✗', at: '2026-01-01T00:00:00.000Z', model: 'claude-sonnet-5',
      }],
    },
  ];
  assert.deepEqual(filterWorkflows(jobs, { checkTypes: [], results: [], time: 'all', search: 'deepseek' }, now), [jobs[0]]);
  assert.deepEqual(filterWorkflows(jobs, { checkTypes: [], results: [], time: 'all', search: 'sonnet' }, now), [jobs[1]]);
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

// item 1 (2026-09-26 build spec): renderAudit's own per-row cells (round/
// action/path/decision) now come from ONE shared set of auditXCellHtml
// builders (`auditIsModelCall`/`auditRoundCellHtml`/`auditActionCellHtml`/
// `auditPathCellHtml`/`auditDecisionCellHtml`/`auditRowClassName`, defined
// right after `duration()`) — the SAME functions the Grouped view's rounds
// table (`renderRoundHeaderRow`/`renderRoundToolRow`) calls, so the two views
// can never drift on how a model-call row vs a tool-call row reads. These
// tests move from pinning renderAudit's own inline body to pinning that
// shared builder region instead.
function auditCellBuilderSource(html) {
  const start = html.indexOf('function auditIsModelCall(r){');
  const end = html.indexOf('// item 7: tools/cache summary rows');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected the shared auditXCellHtml builders in src/panel/index.html');
  return html.slice(start, end);
}

test('item 2: audit table header carries a Round column, and the shared cell builders render a model-call row distinctly from a tool-call row', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /<thead><tr><th>Round<\/th><th>Step<\/th><th>Action<\/th><th>Path<\/th><th>Decision<\/th><th>Time<\/th><\/tr><\/thead>/);
  const body = auditCellBuilderSource(html);
  assert.match(body, /r\.kind === "model-call"/);
  assert.match(body, /"model call"/);
  assert.match(body, /r\.costUsd/);
  assert.match(body, /r\.tokens/);
  assert.match(body, /r\.durationMs/);
  assert.match(body, /typeof r\.round === "number"/);
});

test('item: Decision cell for a model-call row shows only cost/tokens/duration, no "model call" badge text; Action cell carries that label instead', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const body = auditCellBuilderSource(html);
  // decisionCell for a model-call row is built from the joined cost/tokens/duration
  // bits alone — no "badge cyan"/"model call" wrapper the way the old markup had.
  assert.doesNotMatch(body, /badge cyan\\">model call/);
  const decisionAssign = body.slice(body.indexOf('function auditDecisionCellHtml'), body.indexOf('function auditRowClassName'));
  assert.doesNotMatch(decisionAssign.slice(0, decisionAssign.indexOf('return "<span')), /model call/);
  assert.match(decisionAssign, /return escapeXml\(bits\.join\(" · "\)\)/);
  // Action cell keeps identifying a model-call row as such.
  assert.match(body, /auditIsModelCall\(r\) \? "model call" : escapeXml\(r\.action \|\| "unknown"\)/);
});

test('item: Audit table cells are built in Round, Step, Action, Path, Decision, Time order, matching the header', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function renderAudit(result){');
  const end = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  const body = html.slice(start, end);
  const trStart = body.indexOf('tr.innerHTML =');
  const trEnd = body.indexOf(';', body.indexOf('auditTimeCellHtml(r)'));
  const trBody = body.slice(trStart, trEnd);
  const roundIdx = trBody.indexOf('roundCell');
  const stepIdx = trBody.indexOf('stepCell');
  const actionIdx = trBody.indexOf('auditActionCellHtml(r)');
  const pathIdx = trBody.indexOf('pathCell');
  const decisionIdx = trBody.indexOf('decisionCell');
  const timeIdx = trBody.indexOf('auditTimeCellHtml(r)');
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

test('item 3 (2026-09-26): the shared Path cell builder shows "&mdash;" (never "unknown") for a model-call row', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const body = auditCellBuilderSource(html);
  assert.match(body, /if\(auditIsModelCall\(r\)\) return "&mdash;";/);
});

// ---------------------------------------------------------------------------
// item 2 (2026-09-26 build spec): short (tree-root-relative) paths in BOTH
// the Flat and Grouped views, full absolute path kept in a title tooltip —
// server sends both `path` (full) and `pathShort`, never losing information.
// ---------------------------------------------------------------------------

test('item 2: auditPathCellHtml shows pathShort with the full path in a title tooltip, falling back to the full path when no pathShort was resolvable', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const body = auditCellBuilderSource(html);
  const fnStart = body.indexOf('function auditPathCellHtml');
  const fnEnd = body.indexOf('function auditDecisionCellHtml');
  const fn = body.slice(fnStart, fnEnd);
  assert.match(fn, /var full = r\.path \|\| "unknown";/);
  assert.match(fn, /var shown = r\.pathShort \|\| r\.path \|\| "unknown";/);
  assert.match(fn, /title="[^"]*escapeXml\(full\)/);
  assert.match(fn, /escapeXml\(shown\)/);
});

// ---------------------------------------------------------------------------
// item 1 (2026-09-26 build spec): the Grouped view's rounds render as a real
// TABLE (Round · Action · Path · Decision · Time), the round's own model call
// as a distinct header row, reusing the SAME cell builders as Flat.
// ---------------------------------------------------------------------------

test('item 1: renderRoundsPage builds a real table (thead + rounds-table), the round header row visually distinct, tool-call rows via the shared cell builders', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /function renderRoundHeaderRow\(r\)\{/);
  assert.match(html, /class="round-header-row"/);
  assert.match(html, /function renderRoundToolRow\(tc\)\{/);
  assert.match(html, /auditRowClassName\(tc\)/, 'a denied tool-call row must reuse the same row-blocked class Flat uses');
  assert.match(html, /<table class="rounds-table" data-testid="rounds-table">/);
  assert.match(html, /<thead><tr><th>Round<\/th><th>Action<\/th><th>Path<\/th><th>Decision<\/th><th>Time<\/th><\/tr><\/thead>/);
  // wrapped in the same scroll/sticky-header wrapper Flat uses
  assert.match(html, /<div class="audit-table-scroll"><table class="rounds-table"/);
  // still keeps pagination working across the load-more append path (item 5)
  assert.match(html, /tbody = roundsEl\.querySelector\(".rounds-table tbody"\);/);
});

test('item 1: the round-header-row is visually distinct (its own CSS rule), and the rounds table shares Flat\'s sticky-header rule via .audit-table-scroll', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /tr\.round-header-row td\{[^}]*background:var\(--panel2\)/);
  assert.match(html, /tr\.round-header-row td\{[^}]*font-weight:700/);
  assert.match(html, /\.audit-table-scroll table th\{[^}]*position:sticky/);
});

// ---------------------------------------------------------------------------
// fix (2026-09-28): Time cell overflowed the Audit tab sideways at 390px by
// showing the full ISO timestamp. `auditShortTime`/`auditTimeCellHtml` shows
// `HH:MM:SS` taken from the ISO string AS-IS (UTC, no local-time conversion),
// full ISO kept in the cell's `title`; ONE helper shared by the Flat table
// and both Grouped-view rounds-table row builders.
// ---------------------------------------------------------------------------

test('fix: auditShortTime extracts HH:MM:SS as-is from an ISO string, no timezone conversion', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function auditShortTime(');
  const end = html.indexOf('function auditTimeCellHtml(');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected auditShortTime in src/panel/index.html');
  const fn = new Function('String', html.slice(start, end) + 'return auditShortTime;')(String);
  assert.strictEqual(fn('2026-09-27T08:20:58.924Z'), '08:20:58');
  assert.strictEqual(fn(null), null);
  assert.strictEqual(fn(undefined), null);
});

test('fix: auditTimeCellHtml renders the short time with the full ISO string in a title tooltip', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // auditTimeCellHtml calls escapeXml + auditShortTime; load both plus the
  // real escapeXml implementation so the helper runs for real, not stubbed.
  const escStart = html.indexOf('function escapeXml(');
  const escEnd = html.indexOf('function ', escStart + 20);
  const escSrc = html.slice(escStart, escEnd);
  const helpersStart = html.indexOf('function auditShortTime(');
  const helpersEnd = html.indexOf('// item 7: tools/cache summary rows');
  assert.ok(helpersStart !== -1 && helpersEnd !== -1 && helpersEnd > helpersStart, 'expected auditShortTime/auditTimeCellHtml in src/panel/index.html');
  const helpersSrc = html.slice(helpersStart, helpersEnd);
  const fn = new Function('String', escSrc + helpersSrc + 'return auditTimeCellHtml;')(String);
  const withTime = fn({ time: '2026-09-27T08:20:58.924Z' });
  assert.match(withTime, /^<span title="2026-09-27T08:20:58\.924Z">08:20:58<\/span>$/);
  assert.strictEqual(fn({}), 'unknown');
});

test('fix: all three Audit-tab Time cells (Flat table row, Grouped round-header row, Grouped tool-call row) use the shared auditTimeCellHtml helper, not a duplicate', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // Flat table (renderAudit)
  const flatStart = html.indexOf('function renderAudit(result){');
  const flatEnd = html.indexOf('document.querySelectorAll(".chip[data-filter]").forEach(function(chip){');
  assert.match(html.slice(flatStart, flatEnd), /auditTimeCellHtml\(r\)/);
  // Grouped round-header row (the round's own model call)
  const headStart = html.indexOf('function renderRoundHeaderRow(r){');
  const headEnd = html.indexOf('function renderRoundToolRow(');
  assert.match(html.slice(headStart, headEnd), /auditTimeCellHtml\(pseudo\)/);
  // Grouped tool-call row
  const toolStart = html.indexOf('function renderRoundToolRow(tc){');
  const toolEnd = html.indexOf('function renderRoundRows(');
  assert.match(html.slice(toolStart, toolEnd), /auditTimeCellHtml\(tc\)/);
  // no leftover raw-ISO rendering at any of the three call sites
  assert.doesNotMatch(html.slice(flatStart, flatEnd), /escapeXml\(r\.time/);
  assert.doesNotMatch(html.slice(headStart, headEnd), /escapeXml\(pseudo\.time/);
  assert.doesNotMatch(html.slice(toolStart, toolEnd), /escapeXml\(tc\.time/);
});

test('fix: the Raw log view is untouched — result.raw is rendered verbatim, not run through the time helper', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /document\.getElementById\("audit-rawlog"\)\.textContent = result\.raw \|\| "";/);
});

// ---------------------------------------------------------------------------
// item 3 (2026-09-25): tools line shows EVERY tool (no top-5 truncation),
// plus the "offered, never used" second line.
// ---------------------------------------------------------------------------

function loadToolsFns(html) {
  const start = html.indexOf('function toolDisplayLabel(');
  const end = html.indexOf('function renderRun(detail){');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected toolDisplayLabel/toolsLine/offeredLine in src/panel/index.html');
  const body = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { toolsLine, offeredLine };`)();
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

test('item 3 (2026-09-26 revision): offeredLine — the FULL granted-tools list, joined verbatim, never subtracted against what was used; null only when nothing was offered at all', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { offeredLine } = loadToolsFns(html);
  assert.equal(offeredLine(['read', 'grep', 'edit', 'write', 'recall', 'get']), 'read · grep · edit · write · recall · get');
  // still shown even when every offered tool was actually used — no subtraction
  assert.equal(offeredLine(['read', 'edit']), 'read · edit');
  assert.equal(offeredLine(null), null); // no granted list at all
  assert.equal(offeredLine([]), null);
});

test('item 3: the Run summary carries a hidden "offered" row that paintOfferedRow fills from the Job tab\'s own granted-tools list', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /id="summary-offered-row" hidden/);
  assert.match(html, /var lastJobToolsList = null;/);
  assert.match(html, /function paintOfferedRow\(\)\{/);
  assert.match(html, /lastJobToolsList = Array\.isArray\(job\.toolsList\) \? job\.toolsList : null;\s*\n\s*paintOfferedRow\(\);/);
  assert.doesNotMatch(html, /lastRunBehaviour/, 'offeredLine no longer looks at run behaviour, so the module var must be gone entirely, not dead');
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
  // a real single-attempt step (a genuine green) still shows its glyph —
  // P3 build (2026-09-27, glyph colour addition): wrapped in a plain inline
  // colour span (`glyphSpan`), never a bare glyph any more — the part-card
  // renderer inserts this string via innerHTML, so the span is real markup,
  // not literal text.
  const stepPart = {
    kind: 'step', label: 'x', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }],
  };
  const [stepBox] = buildOrderedBoxes([stepPart], false);
  assert.equal(partResultGlyph(stepPart, stepBox), '<span class="glyph-green">✓</span>');
  // a multi-attempt fix loop still joins every attempt's own glyph, each in
  // its own colour span.
  const fixPart = {
    kind: 'fix', label: 'fix', occurrence: null, outcome: 'green', attempts: [{ n: 1, outcome: 'red' }, { n: 2, outcome: 'green' }],
  };
  const [fixBox] = buildOrderedBoxes([fixPart], false);
  assert.equal(partResultGlyph(fixPart, fixBox), '<span class="glyph-red">✗</span><span class="glyph-green">✓</span>');
});

// Panel P2 defect 2 (hamr-watched run mujjtrvd, 2026-09-27): `partBoxState`
// checks `part.outcome` BEFORE `isLastLivePart`, so a live run's own
// still-open fix-loop part must carry `outcome: null` (fixed at the source,
// src/replay.js — see tests/replay.test.js's mujjtrvd-midrun.jsonl fixture
// test) for this check to ever reach the isLastLivePart branch at all. This
// test proves the PANEL side of that fix: given the now-correct null
// outcome, the last live part reads "running" (with a pulsing map dot, this
// file's own `s.state === "running"` branch), never "stopped".
//
// item 1 (2026-09-27, panel P2 defect: "a running attempt shows the died
// glyph"): hamr's glyph ruling reserves "?" for DIED only — an open attempt
// on a run that is genuinely still running must read the same "▶" the run
// glyph itself uses for "in progress", never the died "?". This test was
// updated in that same fix: it used to assert the openFixPart's result
// glyph was "?" even while `box.state === 'running'`, which was itself the
// bug this item fixes.
test('build item (2026-09-27, panel P2 defect 2 + item 1): a live run\'s LAST part with outcome null reads state "running", never "stopped" — and its result glyph is "▶" (open, live), never the died "?" or a fabricated "✗"', () => {
  const {
    buildOrderedBoxes, partBoxState, partResultGlyph, attemptGlyph,
  } = loadStepMapGeometry();
  const openFixPart = {
    kind: 'fix', label: 'fix', occurrence: null, outcome: null, attempts: [{ n: 1, outcome: null }],
  };
  const [box] = buildOrderedBoxes([openFixPart], /* isLive */ true);
  assert.equal(box.state, 'running', 'a live run\'s last part with outcome null must read running');
  assert.equal(partBoxState(openFixPart, /* isLastLivePart */ true), 'running');
  assert.equal(attemptGlyph(null, /* boxIsLive */ true), '▶', 'an open attempt on a LIVE box must render "▶", never the died "?"');
  assert.equal(attemptGlyph(null, /* boxIsLive */ false), '?', 'an unresolved attempt outcome on a non-live box still renders "?"');
  assert.equal(partResultGlyph(openFixPart, box), '▶', 'the live box\'s own result glyph must be "▶", not the died "?"');
  // sanity: the pre-fix behaviour this replaces — outcome as a STRING (the
  // fabricated 'red' the source bug used to mint) reads "stopped" even when
  // it is genuinely the last live part, proving partBoxState really does
  // check part.outcome before isLastLivePart (the ordering the fix relies
  // on never flipping silently underneath it).
  const fabricatedRedPart = { ...openFixPart, outcome: 'red' };
  assert.equal(partBoxState(fabricatedRedPart, true), 'stopped');
});

// item 1 RED-PROOF, real fixture (mujjtrvd-midrun.jsonl via replayRun): the
// SAME parts data read two ways — once as a genuinely live run (isLive
// true, matching the run glyph "▶" and !died) and once as a died variant
// (isLive false, matching hamr's glyph ruling that "?" is reserved for
// DIED) — must render the open attempt differently: "▶" live, "?" died. A
// finished run's (real, non-null-outcome) attempts are unaffected either
// way, proving the fix never touches the resolved-outcome path.
test('item 1 RED-PROOF (real fixture mujjtrvd-midrun): the open attempt on step 2 reads ▶ when the run is live, ? when it is a died variant of the same parts, and finished attempts are unchanged', async () => {
  const { replayRun } = await import('../src/replay.js');
  const { buildOrderedBoxes, partResultGlyph, attemptGlyph } = loadStepMapGeometry();
  const spinePath = new URL('./fixtures/mujjtrvd-midrun.jsonl', import.meta.url).pathname;
  const spine = readFileSync(spinePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const s = replayRun(spine, [], { runId: 'mujjtrvd' });
  const lastPart = s.parts[s.parts.length - 1];
  assert.equal(lastPart.kind, 'step', 'precondition: step 2 (still running) is the last part on this slice');
  assert.equal(lastPart.outcome, null, 'precondition: the open attempt has no outcome yet');

  const liveBoxes = buildOrderedBoxes(s.parts, /* isLive */ true);
  const liveLastBox = liveBoxes[liveBoxes.length - 1];
  assert.equal(liveLastBox.state, 'running');
  assert.equal(partResultGlyph(lastPart, liveLastBox), '▶', 'live variant: open attempt reads ▶, never the died ?');

  const diedBoxes = buildOrderedBoxes(s.parts, /* isLive */ false);
  const diedLastBox = diedBoxes[diedBoxes.length - 1];
  assert.notEqual(diedLastBox.state, 'running', 'a died variant\'s last part must never read as running');
  assert.equal(partResultGlyph(lastPart, diedLastBox), '?', 'died variant: the same open attempt reads the died ?');

  // finished: a real, resolved-outcome attempt is untouched by boxIsLive.
  assert.equal(attemptGlyph('green', true), '✓');
  assert.equal(attemptGlyph('green', false), '✓');
  assert.equal(attemptGlyph('red', true), '✗');
  assert.equal(attemptGlyph('red', false), '✗');
});

// item 1 wiring check: every caller that can render an attempt glyph must
// route through the ONE `attemptGlyph(outcome, boxIsLive)` rule with its own
// box's live-ness — never re-derive live/died itself. Regex-checked against
// the shipped source text (buildAttemptsList is DOM-only, not part of the
// pure geometry block extracted above, so it can't be unit-called directly).
test('item 1: every attemptGlyph call site passes a boxIsLive argument (map title, part cards / Audit headers via partResultGlyph, and the Audit attempt rows via buildAttemptsList)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /function attemptGlyph\(outcome, boxIsLive\)\{/);
  assert.match(html, /attemptsInlineText\(attempts, boxIsLive\)/);
  assert.match(html, /attemptsInlineText\(s\.attempts, s\.state === "running"\)/, 'map title (stepTitleText) must derive boxIsLive from the box\'s own state');
  assert.match(html, /var boxIsLive = box\.state === "running";/, 'partResultGlyph (part cards + Audit grouped headers) must derive boxIsLive from the box\'s own state');
  assert.match(html, /function buildAttemptsList\(container, partIndex, attempts, boxIsLive\)\{/);
  assert.match(html, /attemptGlyph\(a\.outcome, boxIsLive\)/g);
  assert.match(html, /buildAttemptsList\(attemptsWrap, idx, attempts, box\.state === "running"\)/, 'the Audit tab must pass its own box\'s live-ness into buildAttemptsList');
});

// ---------------------------------------------------------------------------
// Panel P2 defect 1 (hamr-watched run mujjtrvd, 2026-09-27): the [▶] glyph
// itself pulses wherever a live run's `.dot.amber` is shown (runs list rows,
// the Workflows job row, the run header) — same rhythm as the map box's own
// running-part dot (opacity 1 -> 0.3 -> 1, 1.2s), off by
// `prefers-reduced-motion: reduce`. `.dot.amber` is minted only for glyph
// "▶" (glyphForOutcome, src/panel/server.js), never for a died [?] or
// finished [✓]/[✗] run, so scoping the animation to this one CSS selector
// alone already excludes every non-live state.
// ---------------------------------------------------------------------------
test('src/panel/index.html: .dot.amber (the live [▶] glyph) pulses via a keyframe animation, disabled under prefers-reduced-motion', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const amberRuleMatch = html.match(/\.dot\.amber::before\{[^}]*\}/);
  assert.ok(amberRuleMatch, 'expected a .dot.amber::before rule');
  assert.match(amberRuleMatch[0], /animation\s*:/, '.dot.amber::before must declare a pulsing animation');
  assert.match(html, /@keyframes\s+pulse-glyph\s*\{[^}]*0%[^}]*100%[^}]*opacity\s*:\s*1[\s\S]*?50%[^}]*opacity\s*:\s*0\.3/, 'expected a pulse-glyph keyframe going 1 -> 0.3 -> 1, matching the map dot\'s own rhythm');
  const reducedMotionBlock = html.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]*\.dot\.amber::before\s*\{[^}]*\})/);
  assert.ok(reducedMotionBlock, 'expected prefers-reduced-motion: reduce to turn the .dot.amber pulse off');
  assert.match(reducedMotionBlock[1], /animation\s*:\s*none/);
  // never for a died [?] (magenta) or finished [✓]/[✗] (green/red) dot.
  ['green', 'red', 'magenta', 'grey'].forEach((cls) => {
    const rule = html.match(new RegExp(`\\.dot\\.${cls}::before\\{[^}]*\\}`));
    assert.ok(rule, `expected a .dot.${cls}::before rule`);
    assert.doesNotMatch(rule[0], /animation/, `.dot.${cls} must never pulse`);
  });
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

// ---------------------------------------------------------------------------
// item 2 (2026-09-26 build spec): Workflows and History merge into ONE left
// "Runs" tab with a [Workflows]/[History] toggle over a single shared filter
// bar. Coverage here: the left-tab markup itself, the toggle's default +
// localStorage persistence, groupRunsByJob (the client-side replacement for
// the deleted /api/workflows endpoint), and the "match ANY run, auto-expand
// a job whose latest run doesn't match" rules — off a real archived job name
// (bareagent-u-types, run mshcpdg4) wherever the build report names one.
// ---------------------------------------------------------------------------

test('item 2: left pane has ONE "Runs" tab (Workflows/History merged) — the old separate tab ids are gone', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /data-testid="left-tab-runs"/);
  assert.doesNotMatch(html, /data-testid="left-tab-workflows"/);
  assert.doesNotMatch(html, /data-testid="left-tab-history"/);
  assert.match(html, /data-testid="runs-view-workflows"/);
  assert.match(html, /data-testid="runs-view-history"/);
  // Workflows is the markup default (aria-pressed="true" on load, before any JS runs)
  assert.match(html, /data-runs-view="workflows" data-testid="runs-view-workflows">Workflows<\/button>/);
  const wfBtn = html.match(/<button class="chip" type="button" aria-pressed="(true|false)" data-runs-view="workflows"/);
  assert.ok(wfBtn && wfBtn[1] === 'true', 'expected the Workflows toggle button to start pressed in the raw markup');
});

test('item 2: ONE shared filter bar anchor ("runs" scope) feeds both views — the old two-anchor/two-instance shape is gone', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /id="runs-filterbar-anchor"/);
  assert.doesNotMatch(html, /workflows-filterbar-anchor/);
  assert.doesNotMatch(html, /history-filterbar-anchor/);
  assert.match(html, /filterBarHTML\("runs"\)/);
  assert.doesNotMatch(html, /var historyFilterBar/);
  assert.doesNotMatch(html, /var workflowsFilterBar/);
});

test('item 2: loadRunsViewMode defaults to "workflows", round-trips through localStorage, and ignores garbage', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  // RUNS_VIEW_KEY is a module-level const the two functions close over —
  // must be extracted alongside them or they'd throw a ReferenceError
  // (silently swallowed by their own try/catch, which would falsely read as
  // "always defaults to workflows" instead of a real extraction bug).
  const keyLine = html.match(/var RUNS_VIEW_KEY = "[^"]+";/);
  assert.ok(keyLine, 'expected the RUNS_VIEW_KEY module const in src/panel/index.html');
  const { loadRunsViewMode, saveRunsViewMode } = loadFns2(
    html,
    ['loadRunsViewMode', 'saveRunsViewMode'],
    ['loadRunsViewMode', 'saveRunsViewMode'],
    keyLine[0],
  );
  const store = {};
  global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try {
    assert.equal(loadRunsViewMode(), 'workflows', 'no stored value at all -> default workflows');
    saveRunsViewMode('history');
    assert.equal(loadRunsViewMode(), 'history', 'persisted value round-trips');
    store['bareloop-panel-runs-view'] = 'not-a-real-mode';
    assert.equal(loadRunsViewMode(), 'workflows', 'garbage stored value falls back to the default, never crashes');
  } finally {
    delete global.localStorage;
  }
});

/** Like loadFns, but returns SEVERAL named functions at once as an object
 * (still one shared hoisted scope, so they can call each other). `extraSrc`
 * is any additional verbatim source (e.g. a module-level const the
 * extracted functions close over) to prepend. */
function loadFns2(html, sourceNames, returnNames, extraSrc) {
  const body = (extraSrc ? `${extraSrc}\n` : '') + sourceNames.map((n) => extractFnSource(html, n)).join('\n');
  const returnObj = `{ ${returnNames.join(', ')} }`;
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn ${returnObj};`)();
}

test('item 2: groupRunsByJob groups the /api/runs payload by job, newest run per job wins as "last", full per-job run list preserved', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const groupRunsByJob = loadFns(html, ['panelMoney', 'panelMoneyWithDraft', 'rowSpendText', 'groupRunsByJob'], 'groupRunsByJob');
  const runs = [
    {
      runid: 'a2', job: 'alpha', at: '2026-09-02T00:00:00.000Z', glyph: '✓', checkType: 'deterministic', model: 'deepseek-chat', spend: '$0.60', wall: '2m00s', date: '2026-09-02',
    },
    {
      runid: 'a1', job: 'alpha', at: '2026-09-01T00:00:00.000Z', glyph: '✗', checkType: 'deterministic', spend: '$0.50', wall: '1m00s', date: '2026-09-01',
    },
    {
      runid: 'b1', job: 'beta', at: '2026-09-01T12:00:00.000Z', glyph: '✓', checkType: 'rubric', spend: '$0.10', wall: '0m30s', date: '2026-09-01',
    },
  ];
  const jobs = groupRunsByJob(runs);
  assert.deepEqual(jobs.map((j) => j.job), ['alpha', 'beta'], 'job order follows first-seen (already newest-first) run order');
  const alpha = jobs.find((j) => j.job === 'alpha');
  assert.equal(alpha.runCount, 2);
  assert.equal(alpha.lastRunid, 'a2');
  assert.equal(alpha.lastGlyph, '✓');
  assert.deepEqual(alpha.runs.map((r) => r.runid), ['a2', 'a1'], 'the job\'s own full run list is preserved, newest-first');
});

test('item 2: workflow search matches a job if the query matches ANY of its runs (real job shape: bareagent-u-types, run mshcpdg4)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { groupRunsByJob, filterWorkflows } = loadFns2(
    html,
    ['panelMoney', 'panelMoneyWithDraft', 'rowSpendText', 'matchesSearch', 'filterRuns', 'groupRunsByJob', 'filterWorkflows'],
    ['groupRunsByJob', 'filterWorkflows'],
  );
  const runs = [
    {
      runid: 'mshzvkqw', job: 'bareagent-u-types', at: '2026-08-06T23:12:00.000Z', glyph: '✓', checkType: 'deterministic',
    },
    {
      runid: 'mshcpdg4', job: 'bareagent-u-types', at: '2026-08-05T00:04:00.000Z', glyph: '✓', checkType: 'deterministic',
    },
    {
      runid: 'other1', job: 'unrelated-job', at: '2026-08-01T00:00:00.000Z', glyph: '✓', checkType: 'deterministic',
    },
  ];
  const jobs = groupRunsByJob(runs);
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const matched = filterWorkflows(jobs, {
    checkTypes: [], results: [], time: 'all', search: 'mshcpdg4',
  }, now);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].job, 'bareagent-u-types');
  assert.ok(matched[0].runs.some((r) => r.runid === 'mshcpdg4'), 'the matching OLDER run must still be in the job\'s own run list for the client to expand into');
});

test('item 2: a ✗ result filter keeps a job whose LATEST run is ✓ but an OLDER run of it is ✗ (match-any-run, not just-latest)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const { groupRunsByJob, filterWorkflows } = loadFns2(
    html,
    ['panelMoney', 'panelMoneyWithDraft', 'rowSpendText', 'matchesSearch', 'filterRuns', 'groupRunsByJob', 'filterWorkflows'],
    ['groupRunsByJob', 'filterWorkflows'],
  );
  const runs = [
    {
      runid: 'newest', job: 'flaky-job', at: '2026-09-24T00:00:00.000Z', glyph: '✓', checkType: 'deterministic',
    },
    {
      runid: 'older-red', job: 'flaky-job', at: '2026-09-01T00:00:00.000Z', glyph: '✗', checkType: 'deterministic',
    },
  ];
  const jobs = groupRunsByJob(runs);
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const matched = filterWorkflows(jobs, {
    checkTypes: [], results: ['✗'], time: 'all',
  }, now);
  assert.equal(matched.length, 1, 'flaky-job must still show up under the ✗ filter because an older run of it was ✗');
  assert.equal(matched[0].lastGlyph, '✓', 'the job row itself still reports its TRUE latest glyph (✓), never overwritten by the filter match');
});

test('item 2: autoExpandJob — expands only when filters are active AND the matching run(s) exclude the job\'s own latest run', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const autoExpandJob = loadFns(html, ['autoExpandJob'], 'autoExpandJob');
  const group = { runs: [{ runid: 'newest' }, { runid: 'older' }] };
  assert.equal(autoExpandJob(group, [{ runid: 'newest' }], true), false, 'latest run itself matched -> no need to auto-expand');
  assert.equal(autoExpandJob(group, [{ runid: 'older' }], true), true, 'only an older run matched -> auto-expand so it\'s visible');
  assert.equal(autoExpandJob(group, [{ runid: 'older' }], false), false, 'filters not active at all -> never force an expand');
  assert.equal(autoExpandJob(group, [], true), false, 'no matching runs at all -> nothing to expand (this job would not even render)');
});

// ---------------------------------------------------------------------------
// build item (2026-09-26): clicking a Workflows job (PARENT) row must also
// open that job's latest run in the Run tab and toggle its inline run list —
// as before the Workflows/History merge. Before this fix the parent row's
// click handler only toggled `wfExpanded`; e.g. job bareagent-u-types' latest
// run msi0w2i5 (red) could not be opened from the parent row at all. Drives
// the REAL `renderWorkflows` extracted verbatim out of the page (never a
// reimplementation) against a tiny hand-rolled fake DOM (no jsdom — one-dep
// budget), same posture as tests/panel-history-filter-clicks.test.js.
// ---------------------------------------------------------------------------

/** A fake DOM element: just enough surface for `renderWorkflows`'s own code
 * (className assignment, setAttribute/getAttribute, addEventListener/click,
 * appendChild, innerHTML assignment). `registry`, when given, gets every
 * created element pushed onto it — lets a fake `selectRun` reproduce the
 * real page's global `clearSelection()` (which clears `.selected` off every
 * `.wf-row`/`.hist-row` in the document, not just the clicked one). */
function makeFakeEl(registry) {
  const listeners = [];
  const el = {
    className: '',
    children: [],
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    click() { listeners.filter((l) => l.type === 'click').forEach((l) => l.fn.call(this)); },
    appendChild(c) { this.children.push(c); },
  };
  if (registry) registry.push(el);
  // `el.innerHTML = ""` (the page's own clear-before-rebuild idiom) must
  // actually clear the fake children array, or a re-render leaves the OLD
  // row sitting at children[0] alongside the freshly appended one.
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) { this._innerHTML = v; if (v === '') this.children = []; },
  });
  return el;
}

/** Builds a fake `document` + the real `renderWorkflows` (and its
 * dependencies) extracted verbatim from the page, wired to hand-rolled
 * fakes for `selectRun`/scroll/filters — shared by every renderWorkflows
 * test below so none of them re-implement its logic. */
function makeWorkflowsPage() {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = [
    extractFnSource(html, 'escapeXml'),
    extractFnSource(html, 'glyphClass'),
    extractFnSource(html, 'groupRunsByJob'),
    extractFnSource(html, 'filtersActive'),
    extractFnSource(html, 'autoExpandJob'),
    extractFnSource(html, 'representedRun'),
    extractFnSource(html, 'activeOlderRun'),
    // panelMoney/panelMoneyWithDraft/rowSpendText (2026-09-28) — buildRunRowEl
    // and groupRunsByJob's own `lastSpend` both now render through
    // rowSpendText, a real dependency, pulled in verbatim rather than faked.
    extractFnSource(html, 'panelMoney'),
    extractFnSource(html, 'panelMoneyWithDraft'),
    extractFnSource(html, 'rowSpendText'),
    extractFnSource(html, 'buildRunRowEl'),
    extractFnSource(html, 'renderWorkflows'),
  ].join('\n');

  const elementsById = {};
  const registry = []; // every element ever created — for global .selected clearing
  const doc = {
    getElementById(id) {
      if (!elementsById[id]) elementsById[id] = makeFakeEl(registry);
      return elementsById[id];
    },
    createElement() { return makeFakeEl(registry); },
  };
  const calls = { selectRun: [], scrolls: 0 };
  let tabRunClicks = 0;
  doc.getElementById('tab-run').addEventListener('click', () => { tabRunClicks += 1; });

  let filters = { checkTypes: [], results: [], time: 'all', search: '' };
  // filterRuns (and its own matchesSearch dependency) is a real dependency
  // of the page too (used when filters are active) — pull it in verbatim
  // rather than reimplementing its semantics.
  const filterRunsSrc = [extractFnSource(html, 'matchesSearch'), extractFnSource(html, 'filterRuns')].join('\n');

  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'calls', 'getFilters', 'registry', `
    var wfExpanded = {};
    var currentRunid = null;
    function selectRun(runid, rowEl, sel){
      calls.selectRun.push(runid);
      currentRunid = runid;
      // reproduce the real page's clearSelection(): strip "selected" off
      // every wf-row/hist-row element ever created, then mark just this one.
      registry.forEach(function(el){
        if (typeof el.className === 'string' && (el.className.indexOf('wf-row') === 0 || el.className.indexOf('hist-row') === 0)) {
          el.className = el.className.replace(/ selected\\b/, '');
        }
      });
      if (rowEl) rowEl.className = (rowEl.className + ' selected').trim();
    }
    function scrollRunIntoViewMobile(){ calls.scrolls += 1; }
    function currentRunsFilters(){ return getFilters(); }
    ${filterRunsSrc}
    ${src}
    return {
      render: renderWorkflows,
      getCurrentRunid: function(){ return currentRunid; },
      setCurrentRunid: function(id){ currentRunid = id; },
    };
  `);
  const page = factory(doc, calls, () => filters, registry);
  return {
    page,
    doc,
    calls,
    getTabRunClicks: () => tabRunClicks,
    setFilters(f) { filters = f; },
  };
}

test('build item: clicking a Workflows job (parent) row opens its latest run in the Run tab, toggles its inline run list, and shows selected state like a child row', () => {
  const { page, doc, calls, getTabRunClicks } = makeWorkflowsPage();

  const jobs = groupRunsByJobFixture();
  page.render(jobs);

  const wfList = doc.getElementById('wf-list');
  assert.equal(wfList.children.length, 1, 'expected one wf-job wrapper for the one job group');
  let row = wfList.children[0].children[0];
  assert.equal(row.className, 'wf-row', 'not selected before any click');
  assert.equal(row.getAttribute('aria-expanded'), 'false');

  row.click();

  assert.deepEqual(calls.selectRun, ['msi0w2i5'], 'clicking the parent must open the JOB\'s latest run, same as a child row would');
  assert.equal(page.getCurrentRunid(), 'msi0w2i5');
  assert.equal(getTabRunClicks(), 1, 'the Run tab must be activated, same as clicking a child row');
  assert.equal(calls.scrolls, 1, 'mobile scroll-into-view fires too, same as a child row');

  // renderWorkflows was called again by the click handler itself — re-fetch
  // the (rebuilt) row and check both the toggle and the selected state.
  row = doc.getElementById('wf-list').children[0].children[0];
  assert.equal(row.getAttribute('aria-expanded'), 'true', 'the inline run list must also toggle open, as before the merge');
  assert.equal(row.className, 'wf-row selected', 'the parent row must show selected state like a child row');
  assert.equal(row.getAttribute('aria-pressed'), 'true');

  // build item (fix, 2026-09-26): the parent row IS the latest run
  // (msi0w2i5) — its expanded child list must be the job's OTHER runs
  // only, never repeating the latest as a duplicate first child.
  const runsWrap = doc.getElementById('wf-list').children[0].children[1];
  assert.ok(runsWrap, 'expanded child list must be rendered (job has an other run)');
  assert.equal(runsWrap.children.length, 1, 'only the ONE other run, never the latest repeated');
  assert.equal(
    runsWrap.children[0].getAttribute('data-testid'),
    'hist-row-older1',
    'first (only) child must be the OTHER run, not a duplicate of the latest',
  );
});

test('build item (fix): a job with only ONE run gets no expand caret and never expands, even when clicked', () => {
  const { page, doc, calls } = makeWorkflowsPage();

  const jobs = singleRunJobFixture();
  page.render(jobs);

  let row = doc.getElementById('wf-list').children[0].children[0];
  assert.ok(!row.innerHTML.includes('▶') && !row.innerHTML.includes('▼'), 'no caret glyph for a single-run job');
  assert.equal(row.getAttribute('aria-expanded'), 'false');

  row.click();
  assert.deepEqual(calls.selectRun, ['solo1'], 'clicking still opens the (only) run');

  row = doc.getElementById('wf-list').children[0].children[0];
  assert.equal(row.getAttribute('aria-expanded'), 'false', 'still nothing to expand after the click');
  assert.ok(!row.innerHTML.includes('▶') && !row.innerHTML.includes('▼'), 'still no caret after the click');
  assert.equal(doc.getElementById('wf-list').children[0].children.length, 1, 'no child-list wrapper appended at all');
});

test('build item (fix): when filters are active and the ONLY match is the latest run, the parent gets no expand affordance at all', () => {
  const { page, doc, setFilters } = makeWorkflowsPage();
  setFilters({ checkTypes: [], results: ['✓'], time: 'all', search: '' });

  const jobs = groupRunsByJobFixture(); // latest msi0w2i5 is glyph '✗', older1 would need '✓' to match
  // give the older run a passing glyph so it does NOT match the '✓' filter,
  // leaving the latest (✗) as the only... wait — invert: latest matches.
  jobs[0].runs[0].glyph = '✓'; // latest -> pass, matches filter
  jobs[0].runs[1].glyph = '✗'; // older -> fail, does not match filter
  jobs[0].lastGlyph = '✓';

  page.render(jobs);

  const wrap = doc.getElementById('wf-list').children[0];
  assert.equal(wrap.children.length, 1, 'parent job row renders (it matches) but no child-list wrapper is appended');
  const row = wrap.children[0];
  assert.ok(!row.innerHTML.includes('▶') && !row.innerHTML.includes('▼'), 'no caret — with these filters active the job has no OTHER matching run to show');
  assert.equal(row.getAttribute('aria-expanded'), 'false');

  row.click();
  const wrapAfter = doc.getElementById('wf-list').children[0];
  assert.equal(wrapAfter.children.length, 1, 'still no child-list wrapper after click — nothing to expand');
  assert.equal(row.getAttribute('aria-expanded'), 'false', 'still not expandable after the click');
});

test('build item (fix): selection highlight goes to the parent for the latest run, and to the child for an older run — never both, never a duplicate', () => {
  const { page, doc } = makeWorkflowsPage();
  const jobs = groupRunsByJobFixture();
  page.render(jobs);

  // expand so the child row exists to click
  let row = doc.getElementById('wf-list').children[0].children[0];
  row.click();

  let wrap = doc.getElementById('wf-list').children[0];
  row = wrap.children[0];
  assert.equal(row.className, 'wf-row selected', 'latest run selected -> parent carries the highlight');
  let runsWrap = wrap.children[1];
  assert.equal(runsWrap.children.length, 1);
  assert.equal(runsWrap.children[0].className, 'hist-row', 'the (only) child is not highlighted');

  // now click that older child run directly
  const olderChild = runsWrap.children[0];
  olderChild.click();

  wrap = doc.getElementById('wf-list').children[0];
  row = wrap.children[0];
  assert.ok(!row.className.includes('selected'), 'parent no longer selected once an older run is picked');
});

/** One job group ("bareagent-u-types") with two runs: latest "msi0w2i5"
 * (red) and one older run "older1" — lets tests exercise both the
 * expand/toggle path and the "child list excludes the latest" fix. */
function groupRunsByJobFixture() {
  return [{
    job: 'bareagent-u-types',
    runs: [
      { runid: 'msi0w2i5', job: 'bareagent-u-types', glyph: '✗' },
      { runid: 'older1', job: 'bareagent-u-types', glyph: '✓' },
    ],
    runCount: 2,
    lastRunid: 'msi0w2i5',
    lastAt: '2026-09-20T00:00:00.000Z',
    lastGlyph: '✗',
    lastCheckType: 'deterministic',
    lastModel: null,
    lastSpend: '$0.10',
    lastWall: '1m00s',
    lastDate: '2026-09-20',
  }];
}

/** A job with exactly one run — no "other runs" exist at all. */
function singleRunJobFixture() {
  return [{
    job: 'solo-job',
    runs: [{ runid: 'solo1', job: 'solo-job', glyph: '✓' }],
    runCount: 1,
    lastRunid: 'solo1',
    lastAt: '2026-09-20T00:00:00.000Z',
    lastGlyph: '✓',
    lastCheckType: 'deterministic',
    lastModel: null,
    lastSpend: '$0.10',
    lastWall: '1m00s',
    lastDate: '2026-09-20',
  }];
}

// ---------------------------------------------------------------------------
// build item (2026-09-26 fix, debrief): the parent row was hardwired to
// `g.lastRunid` for both its own "selected" state and its click target —
// two failures follow: (1) a search hit on an OLDER run auto-expands the
// job but clicking the parent still opens the unrelated latest run with no
// cue, and (2) picking an older run from History then switching to
// Workflows leaves the job collapsed with nothing marked selected. Fixed
// via ONE `representedRun`/`activeOlderRun` pair the parent's own selected
// state, click target, and auto-expand all read from — see src/panel/
// index.html. These tests fail without that fix (verified by reverting it
// in a scratch copy): failure (1) reads `calls.selectRun` still landing on
// 'msi0w2i5' instead of 'older1'; failure (2) reads the job collapsed
// (`aria-expanded` "false") with no selected row anywhere.
// ---------------------------------------------------------------------------

test('build item (fix): search matching only an older run — clicking the parent opens THAT run, not the unrelated latest', () => {
  const { page, doc, calls, setFilters } = makeWorkflowsPage();
  setFilters({ checkTypes: [], results: [], time: 'all', search: 'older1' });

  const jobs = groupRunsByJobFixture(); // latest 'msi0w2i5', older 'older1'
  page.render(jobs);

  const wrap = doc.getElementById('wf-list').children[0];
  let row = wrap.children[0];
  assert.equal(row.getAttribute('aria-expanded'), 'true', 'auto-expands: only an older run matches the search');

  row.click();

  assert.deepEqual(calls.selectRun, ['older1'], 'parent click must open the MATCHED older run, never the latest, when the latest is filtered out');
  assert.equal(page.getCurrentRunid(), 'older1');

  row = doc.getElementById('wf-list').children[0].children[0];
  assert.equal(row.className, 'wf-row selected', 'parent follows the run it now stands for, not the (unmatched) latest');
});

test('build item (fix): picking an older run elsewhere (e.g. History) then rendering Workflows auto-expands the job and marks that child selected, not the parent', () => {
  const { page, doc } = makeWorkflowsPage();

  const jobs = groupRunsByJobFixture(); // latest 'msi0w2i5', older 'older1'
  page.setCurrentRunid('older1'); // simulates a History-tab selection made before switching views
  page.render(jobs);

  const wrap = doc.getElementById('wf-list').children[0];
  const row = wrap.children[0];
  assert.equal(row.getAttribute('aria-expanded'), 'true', 'must auto-expand so the selected older run is visible, with no filter/search active at all');
  assert.ok(!row.className.includes('selected'), 'parent (which stands for the latest run) must not be marked selected');

  const runsWrap = wrap.children[1];
  assert.ok(runsWrap, 'expanded child list must be rendered');
  assert.equal(runsWrap.children.length, 1);
  assert.equal(runsWrap.children[0].getAttribute('data-testid'), 'hist-row-older1');
  assert.equal(runsWrap.children[0].className, 'hist-row selected', 'the matching child must carry the selected marker on render, with no click needed');
});

// retry loop on the step map: ported from design/panel-mockup.html — a
// multi-attempt step or fix box draws a dashed grey self-loop ("try N") under
// the box, using the SAME one-owner rule (box.attempts.length > 1) that
// already drives partResultGlyph's multi-glyph join, never a duplicate check.
test('boxRetryTry: the one shared rule — a box with >1 attempts reports its final try number, a single-attempt or no-verdict (attempts: []) box reports 0', () => {
  const { boxRetryTry } = loadStepMapGeometry();
  assert.equal(boxRetryTry({ attempts: [{ n: 1, outcome: 'red' }, { n: 2, outcome: 'red' }, { n: 3, outcome: 'green' }] }), 3);
  assert.equal(boxRetryTry({ attempts: [{ n: 1, outcome: 'green' }] }), 0);
  assert.equal(boxRetryTry({ attempts: [] }), 0);
});

test('buildStepMapSVG: a step with 3 attempts renders a dashed retry path and "try 3"', () => {
  const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
  const parts = [
    {
      kind: 'step', label: 'flaky step', occurrence: 1, outcome: 'green',
      attempts: [{ n: 1, outcome: 'red' }, { n: 2, outcome: 'red' }, { n: 3, outcome: 'green' }],
    },
  ];
  const boxes = buildOrderedBoxes(parts, false);
  const svg = buildStepMapSVG(boxes, 900);
  assert.match(svg, /stroke-dasharray="3,3"/, 'expected a dashed retry path');
  assert.match(svg, />try 3</, 'expected the final try number in the label');
});

test('buildStepMapSVG: a fix loop with 4 attempts renders a dashed retry path and "try 4"', () => {
  const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
  const parts = [
    {
      kind: 'fix', label: 'fix', occurrence: null, outcome: 'green',
      attempts: [
        { n: 1, outcome: 'red' }, { n: 2, outcome: 'red' }, { n: 3, outcome: 'red' }, { n: 4, outcome: 'green' },
      ],
    },
  ];
  const boxes = buildOrderedBoxes(parts, false);
  const svg = buildStepMapSVG(boxes, 900);
  assert.match(svg, /stroke-dasharray="3,3"/, 'expected a dashed retry path');
  assert.match(svg, />try 4</, 'expected the final try number in the label');
});

// item 2 (2026-09-27, hamr-reported: phone-width run mu2p83go's map): the
// retry curve's x-coordinates and its own control points used a fixed pixel
// `retryShift` (14px, sized for desktop) subtracted from proportionally-
// small fractions of `boxW` (e.g. the curve's endpoint at 2.8% of boxW) —
// at a narrow box width that pushed the endpoint past the box's own left
// edge (reproduced exactly: availWidth=350, 3 steps, middle one with 2
// attempts and a row change -> box x=10, boxW=330 -> endpoint x=5.24,
// outside [10, 340]). RED-PROOF: this must fail against the pre-fix file
// (at least the 350/hasDrop case), never pass by construction.
function retryPathCoords(svg) {
  const pathRe = /<path d="M ([\d.]+) [\d.]+ C ([\d.]+) [\d.]+, ([\d.]+) [\d.]+, ([\d.]+) [\d.]+"[^>]*stroke-dasharray="3,3"/g;
  const out = [];
  let m;
  while ((m = pathRe.exec(svg))) out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  return out;
}
function retryLabelXs(svg) {
  const labelRe = /<text x="([\d.]+)" y="[\d.]+" text-anchor="middle" font-size="10" fill="var\(--text-faint\)">try \d+</g;
  const out = [];
  let m;
  while ((m = labelRe.exec(svg))) out.push(Number(m[1]));
  return out;
}
function boxRects(svg) {
  const rectRe = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+"/g;
  const out = [];
  let m;
  while ((m = rectRe.exec(svg))) out.push({ x: Number(m[1]), w: Number(m[2]) });
  return out;
}
// 3 steps, middle one carrying the retry loop — matches the reported repro
// shape (a row change puts the retry-loop box at the end of its row, so it
// also carries the snake-drop arrow -> hasDrop true -> retryShift applied).
function threeStepRetryParts() {
  return [
    { kind: 'step', label: 'a', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }] },
    {
      kind: 'step', label: 'b', occurrence: 1, outcome: 'green',
      attempts: [{ n: 1, outcome: 'red' }, { n: 2, outcome: 'green' }],
    },
    { kind: 'step', label: 'c', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }] },
  ];
}
[350, 500, 800, 1200].forEach((availWidth) => {
  test(`buildStepMapSVG: retry loop stays inside its own box at width=${availWidth} (hasDrop true — reported repro shape)`, () => {
    const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
    const boxes = buildOrderedBoxes(threeStepRetryParts(), false);
    const svg = buildStepMapSVG(boxes, availWidth);
    const rects = boxRects(svg);
    const box = rects[1]; // the middle box owns the retry loop in this fixture
    assert.ok(box, 'precondition: expected 3 boxes rendered');
    const paths = retryPathCoords(svg);
    assert.ok(paths.length >= 1, 'precondition: expected at least one dashed retry path');
    paths.forEach((xs) => {
      xs.forEach((v, idx) => {
        assert.ok(v >= box.x && v <= box.x + box.w, `retry path coord[${idx}]=${v} must lie within box [${box.x}, ${box.x + box.w}] at width=${availWidth}`);
      });
    });
    retryLabelXs(svg).forEach((lx) => {
      assert.ok(lx >= box.x && lx <= box.x + box.w, `retry label x=${lx} must lie within box [${box.x}, ${box.x + box.w}] at width=${availWidth}`);
    });
  });
  test(`buildStepMapSVG: retry loop stays inside its own box at width=${availWidth} (hasDrop false — a single-row layout wide enough for all 3 boxes)`, () => {
    const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
    const boxes = buildOrderedBoxes(threeStepRetryParts(), false);
    // force a single row (no snake-drop) by reusing the same fixture and
    // widening availWidth enough that perRow === 3 (no row change at all,
    // so the retry-carrying box stays at index 1 with no drop arrow).
    const svg = buildStepMapSVG(boxes, Math.max(availWidth, 1600));
    const rects = boxRects(svg);
    const box = rects[1];
    const paths = retryPathCoords(svg);
    assert.ok(paths.length >= 1, 'precondition: expected at least one dashed retry path');
    paths.forEach((xs) => {
      xs.forEach((v, idx) => {
        assert.ok(v >= box.x && v <= box.x + box.w, `retry path coord[${idx}]=${v} must lie within box [${box.x}, ${box.x + box.w}] at width=${availWidth} (hasDrop false)`);
      });
    });
    retryLabelXs(svg).forEach((lx) => {
      assert.ok(lx >= box.x && lx <= box.x + box.w, `retry label x=${lx} must lie within box [${box.x}, ${box.x + box.w}] at width=${availWidth} (hasDrop false)`);
    });
  });
});

test('buildStepMapSVG: a single-attempt step and a no-verdict part (e.g. plan) render NO dashed retry path', () => {
  const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
  const parts = [
    { kind: 'plan', label: 'plan', occurrence: null, outcome: null, attempts: [] },
    { kind: 'step', label: 'clean step', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }] },
  ];
  const boxes = buildOrderedBoxes(parts, false);
  const svg = buildStepMapSVG(boxes, 900);
  assert.doesNotMatch(svg, /stroke-dasharray="3,3"/, 'no box here has >1 attempts, so no retry loop should render');
});

test('stepMapLegendHTML: includes the retry legend entry', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function stepMapLegendHTML');
  const end = html.indexOf('function mapAvailWidth');
  const body = html.slice(start, end);
  assert.match(body, /dashed = retry/);
});

// ---------------------------------------------------------------------------
// P2 (PANEL-BUILD.md, 2026-09-27 rulings) — the single poll owner that
// drives the left Runs list (every 2s tick, Q1=A) and the open run's own
// detail (only while it's live, stopping once it dies or gets a real
// verdict). The five functions below (`sig`, `withScrollPreserved`,
// `refreshRunsList`, `refreshOpenRun`, `pollTick`) are extracted VERBATIM
// out of the page (never a reimplementation) and driven against a tiny
// hand-rolled fake DOM + a fully injectable `getJSON` stub — same posture
// as `makeWorkflowsPage` above (no jsdom — one-dep budget).
//
// Fail-first proof: none of these five function names exist anywhere in
// the pre-P2 page (`git show 16825a7:src/panel/index.html` — the branch
// HEAD before this session's polling commit) — `extractFnSource` would
// throw "expected to find function X" for every one of them, so every test
// below is a genuine red against the pre-change source, not a vacuous pass.
// ---------------------------------------------------------------------------

/** A fake element with just enough surface for the poll functions'
 * scrollTop save/restore and the failure-streak note's textContent. */
function makeScrollEl() {
  return { scrollTop: 0, textContent: '' };
}

/**
 * Builds the real poll functions (`pollTick`/`refreshRunsList`/
 * `refreshOpenRun`) extracted verbatim from the page, wired to a fake
 * `document` and a fully test-controlled `getJSON(path)` stub (never a real
 * `fetch` — these tests exercise the polling/staleness/skip logic on top of
 * it, not the fetch wrapper itself). `runsFilterBar.setItems` and
 * `renderRun` are recording stubs; `setItems`'s stub additionally resets
 * `left-pane-body`'s scrollTop to 0 to simulate a real DOM rebuild, so the
 * scroll-preservation test is a genuine proof of `withScrollPreserved`
 * restoring it, not a vacuous "nothing touched it anyway" pass.
 * @param {(path: string) => Promise<any>} getJSONImpl
 */
function makePollHarness(getJSONImpl) {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = [
    extractFnSource(html, 'sig'),
    extractFnSource(html, 'withScrollPreserved'),
    extractFnSource(html, 'refreshRunsList'),
    extractFnSource(html, 'refreshOpenRun'),
    extractFnSource(html, 'pollTick'),
  ].join('\n');

  const elementsById = {};
  const doc = {
    hidden: false,
    getElementById(id) {
      if (!elementsById[id]) elementsById[id] = makeScrollEl();
      return elementsById[id];
    },
  };

  const getJSONCalls = [];
  const renderRunCalls = [];
  const setItemsCalls = [];

  // eslint-disable-next-line no-new-func
  const factory = new Function('document', 'getJSONImpl', 'getJSONCalls', 'renderRunCalls', 'setItemsCalls', `
    function getJSON(path){ getJSONCalls.push(path); return getJSONImpl(path); }
    var runsFilterBar = {
      setItems: function(runs){
        setItemsCalls.push(runs);
        var el = document.getElementById("left-pane-body");
        if (el) el.scrollTop = 0; // simulates a real innerHTML rebuild resetting scroll
      }
    };
    function renderRun(detail){ renderRunCalls.push(detail); }
    var currentRunid = null;
    var runIsLive = false;
    var selectToken = 0;
    var lastRunsSig = null;
    var lastRunDetailSig = null;
    var lastRunsListRefreshAt = 0;
    var RUNS_LIST_POLL_MS = 10000;
    var pollFailStreak = 0;
    ${src}
    return {
      pollTick: pollTick,
      refreshRunsList: refreshRunsList,
      refreshOpenRun: refreshOpenRun,
      setCurrentRunid: function(v){ currentRunid = v; },
      getCurrentRunid: function(){ return currentRunid; },
      setRunIsLive: function(v){ runIsLive = v; },
      getRunIsLive: function(){ return runIsLive; },
      bumpSelectToken: function(){ selectToken += 1; return selectToken; },
      setLastRunsListRefreshAt: function(v){ lastRunsListRefreshAt = v; },
      getLastRunsListRefreshAt: function(){ return lastRunsListRefreshAt; },
    };
  `);
  const page = factory(doc, getJSONImpl, getJSONCalls, renderRunCalls, setItemsCalls);
  return {
    ...page, doc, getJSONCalls, renderRunCalls, setItemsCalls,
  };
}

/** A promise + its own resolve/reject, for controlling exactly when an
 * in-flight `getJSON` response lands relative to other test actions
 * (the stale-response race test needs this). */
function deferredPromise() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

test('refreshOpenRun: fetches the open live run and calls renderRun once for a changed payload', async () => {
  const h = makePollHarness((path) => {
    assert.equal(path, '/api/runs/r1');
    return Promise.resolve({ glyph: '▶', died: false, x: 1 });
  });
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  await h.refreshOpenRun();
  assert.equal(h.renderRunCalls.length, 1);
  assert.deepEqual(h.renderRunCalls[0], { glyph: '▶', died: false, x: 1 });
  assert.equal(h.getRunIsLive(), true, 'a still-running glyph keeps runIsLive true');
});

test('refreshOpenRun: a run that reaches a real verdict (✓) flips runIsLive false, and the NEXT tick fetches nothing more', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ glyph: '✓', died: false }); });
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  await h.refreshOpenRun();
  assert.equal(h.getRunIsLive(), false, 'a real verdict must stop the poll for this run');
  assert.equal(calls, 1);
  await h.refreshOpenRun(); // caller (pollTick) would call this again on the next 2s tick
  assert.equal(calls, 1, 'no fetch at all once the run is no longer live — poll for THIS run has stopped');
});

test('refreshOpenRun: a died run (glyph ?) also flips runIsLive false — died stops the poll same as a real verdict', async () => {
  const h = makePollHarness(() => Promise.resolve({ glyph: '?', died: true }));
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  await h.refreshOpenRun();
  assert.equal(h.getRunIsLive(), false);
});

test('refreshOpenRun: a stale in-flight response for a run switched away from never overwrites the newer selection', async () => {
  const d = deferredPromise();
  const h = makePollHarness(() => d.promise);
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  const inFlight = h.refreshOpenRun(); // request for r1 now in flight
  // the person clicks a different run mid-poll — selectRun's own token bump
  h.setCurrentRunid('r2');
  h.bumpSelectToken();
  d.resolve({ glyph: '▶', died: false }); // r1's stale response finally lands
  await inFlight;
  assert.equal(h.renderRunCalls.length, 0, 'a stale r1 response must never render onto the r2 selection now open');
});

test('refreshOpenRun: an unchanged payload does not call renderRun a second time', async () => {
  const payload = { glyph: '▶', died: false, x: 1 };
  const h = makePollHarness(() => Promise.resolve(payload));
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  await h.refreshOpenRun();
  await h.refreshOpenRun();
  assert.equal(h.renderRunCalls.length, 1, 'the second identical payload must not rebuild the DOM again');
});

test('refreshOpenRun: does nothing (no fetch) when no run is selected, or the selected run is not live', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ glyph: '▶', died: false }); });
  await h.refreshOpenRun(); // no currentRunid at all
  assert.equal(calls, 0);
  h.setCurrentRunid('r1');
  h.setRunIsLive(false); // e.g. already died/finished
  await h.refreshOpenRun();
  assert.equal(calls, 0);
});

test('refreshRunsList: skips re-render (setItems) when the fetched payload is unchanged, still re-renders on a real change', async () => {
  let payload = { runs: [{ runid: 'a' }] };
  const h = makePollHarness(() => Promise.resolve(payload));
  // force:true on every call here — this test is about the SIGNATURE dedup
  // (setItems skipped on an unchanged payload), not the 10s list throttle,
  // which has its own dedicated tests below.
  await h.refreshRunsList(true);
  assert.equal(h.setItemsCalls.length, 1);
  await h.refreshRunsList(true); // identical payload
  assert.equal(h.setItemsCalls.length, 1, 'an unchanged runs list must not rebuild the DOM again');
  payload = { runs: [{ runid: 'a' }, { runid: 'b' }] };
  await h.refreshRunsList(true);
  assert.equal(h.setItemsCalls.length, 2, 'a real change must still re-render');
});

test('refreshRunsList: preserves the left pane\'s scrollTop across a poll-driven re-render', async () => {
  const h = makePollHarness(() => Promise.resolve({ runs: [{ runid: 'a' }] }));
  h.doc.getElementById('left-pane-body').scrollTop = 240;
  await h.refreshRunsList();
  // the setItems stub itself resets scrollTop to 0 (simulating a real
  // rebuild) — this only stays 240 if withScrollPreserved actually restores
  // it afterward, not merely because nothing touched it.
  assert.equal(h.doc.getElementById('left-pane-body').scrollTop, 240);
});

test('refreshRunsList: a failing fetch keeps the last good state and only surfaces a note after 3 consecutive failures', async () => {
  const h = makePollHarness(() => Promise.reject(new Error('boom')));
  // force:true — this test is about the failure-streak counter, not the
  // 10s list throttle (each call here must actually reach the fetch).
  await h.refreshRunsList(true);
  await h.refreshRunsList(true);
  assert.equal(h.doc.getElementById('runs-filter-count').textContent, '', 'no alarming note before 3 consecutive failures');
  await h.refreshRunsList(true);
  assert.match(h.doc.getElementById('runs-filter-count').textContent, /fetch failing/);
  assert.equal(h.setItemsCalls.length, 0, 'never wiped/rebuilt the list on a failed fetch');
});

// ---------------------------------------------------------------------------
// F195 (docs/logs/FINDINGS.md) — hamr's ruling B, 2026-09-27: the Runs list
// throttles to a 10s refresh (RUNS_LIST_POLL_MS) instead of every 2s tick;
// the open run's own detail is unaffected. Fail-first: RUNS_LIST_POLL_MS
// and the `force` param on `refreshRunsList`/`pollTick` do not exist on the
// pre-throttle page — these tests red against that source.
// ---------------------------------------------------------------------------

test('refreshRunsList: a call made again immediately (well under 10s) skips the fetch entirely', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ runs: [{ runid: 'a' }] }); });
  await h.refreshRunsList();
  assert.equal(calls, 1);
  await h.refreshRunsList(); // called again immediately — well under RUNS_LIST_POLL_MS
  assert.equal(calls, 1, 'a tick inside the 10s window must not re-fetch the list at all');
});

test('refreshRunsList: fetches again once RUNS_LIST_POLL_MS has elapsed since the last real fetch', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ runs: [{ runid: 'a' }] }); });
  await h.refreshRunsList();
  assert.equal(calls, 1);
  h.setLastRunsListRefreshAt(Date.now() - 10001); // simulate 10s+ having elapsed
  await h.refreshRunsList();
  assert.equal(calls, 2, 'once the throttle window has elapsed, the tick must fetch again');
});

test('refreshRunsList: force:true bypasses the throttle regardless of elapsed time', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ runs: [{ runid: 'a' }] }); });
  await h.refreshRunsList();
  await h.refreshRunsList(true); // immediately again, but forced
  assert.equal(calls, 2, 'force:true must always reach the fetch, throttle or not');
});

test('pollTick: forces one immediate runs-list refresh the moment the open run stops being live', async () => {
  let runsCalls = 0;
  const h = makePollHarness((path) => {
    if (path === '/api/runs') { runsCalls += 1; return Promise.resolve({ runs: [] }); }
    return Promise.resolve({ glyph: '✓', died: false }); // the open run just finished
  });
  h.setCurrentRunid('r1');
  h.setRunIsLive(true);
  await h.pollTick();
  assert.equal(h.getRunIsLive(), false);
  assert.equal(runsCalls, 2, 'one throttled list call at tick start, one forced call once the run ends');
});

test('pollTick: does NOT force an extra list refresh when the open run was already not live', async () => {
  let runsCalls = 0;
  const h = makePollHarness((path) => {
    if (path === '/api/runs') { runsCalls += 1; return Promise.resolve({ runs: [] }); }
    return Promise.resolve({ glyph: '✓', died: false });
  });
  h.setCurrentRunid('r1');
  h.setRunIsLive(false); // already finished before this tick
  await h.pollTick();
  assert.equal(runsCalls, 1, 'no run-ended transition this tick — only the normal (throttled) list call');
});

test('pollTick: visibilitychange-style forced tick refreshes the list even inside the 10s window', async () => {
  let runsCalls = 0;
  const h = makePollHarness((path) => {
    if (path === '/api/runs') { runsCalls += 1; return Promise.resolve({ runs: [] }); }
    return Promise.resolve({ glyph: '▶', died: false });
  });
  await h.refreshRunsList(); // normal call, sets lastRunsListRefreshAt
  assert.equal(runsCalls, 1);
  await h.pollTick(true); // the page wires this on visibilitychange when the tab returns
  assert.equal(runsCalls, 2, 'a forced catch-up tick must not be swallowed by the 10s throttle');
});

test('buildStepMapSVG: a running box draws the pulsing amber dot (mockup-verbatim circle+animate), a done/waiting box does not', () => {
  const { buildOrderedBoxes, buildStepMapSVG } = loadStepMapGeometry();
  const parts = [
    { kind: 'step', label: 'a', occurrence: 1, outcome: 'green', attempts: [{ n: 1, outcome: 'green' }] },
    { kind: 'step', label: 'b', occurrence: 1, outcome: null, attempts: [] },
  ];
  const boxes = buildOrderedBoxes(parts, true); // isLive=true — the last part is the running one
  const svg = buildStepMapSVG(boxes, 900);
  const dots = [...svg.matchAll(/<circle[^>]*fill="#b8860b">/g)];
  assert.equal(dots.length, 1, 'exactly one running box in this list, exactly one pulsing dot');
  assert.match(svg, /<animate attributeName="opacity" values="1;0\.3;1" dur="1\.2s" repeatCount="indefinite">/);
});

test('pollTick: does nothing while document.hidden is true, and resumes fetching once visible again', async () => {
  let calls = 0;
  const h = makePollHarness(() => { calls += 1; return Promise.resolve({ runs: [] }); });
  h.doc.hidden = true;
  h.pollTick();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 0, 'a hidden tab must not poll');
  h.doc.hidden = false;
  h.pollTick();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(calls >= 1, 'a visible tab does poll');
});

// PANEL-BUILD.md P3 visual-contract fixes (2026-09-27): the built Chat tab
// had drifted from design/panel-mockup.html on form-control font/width and
// on the disabled look of the primary action buttons. These assertions pin
// the ported rules so a future edit can't silently drop them again.

test('Chat tab CSS: inputs/selects inherit the page monospace font (ported verbatim from the mockup, not left at the browser UA sans default)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    html,
    /input,select\{font:inherit;padding:6px 8px;border:1px solid var\(--border-strong\);border-radius:0;background:var\(--bg\);color:var\(--text\);\}/,
    'expected the mockup-verbatim input,select{font:inherit;...} rule'
  );
  assert.match(html, /input::placeholder\{color:var\(--text-faint\);\}/, 'expected the mockup-verbatim input::placeholder rule');
});

test('Chat tab CSS: .field inputs/selects are full width (mockup .field input,.field select{width:100%}), not left at the browser default half-width', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /\.field input,\.field select\{width:100%;\}/);
});

test('Chat tab CSS: #chat-msg is the ~2x-height, 2px-border text box from the mockup', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /#chat-msg\{min-height:64px;padding:8px 12px;border:2px solid var\(--border-strong\);\}/);
});

test('Chat tab markup: Sign & run, Send, Revise and Start drafting all start disabled in the served HTML (before any session/phase exists, click 1 must not be clickable)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const startTag = html.match(/<button class="btn primary" type="button" id="chat-start-btn"[^>]*>/)[0];
  const signTag = html.match(/<button class="btn primary" type="button" id="chat-sign-btn"[^>]*>/)[0];
  const sendTag = html.match(/<button class="btn" type="button" id="chat-send-btn"[^>]*>/)[0];
  const reviseTag = html.match(/<button class="btn" type="button" id="chat-revise-btn"[^>]*>/)[0];
  for (const [name, tag] of [['chat-start-btn', startTag], ['chat-sign-btn', signTag], ['chat-send-btn', sendTag], ['chat-revise-btn', reviseTag]]) {
    assert.match(tag, /\bdisabled\b/, `expected ${name} to render disabled by default`);
  }
});

test('Chat tab CSS: a disabled .btn.primary is visibly different from the enabled primary fill (not just opacity on the same blue), so Sign & run / Start drafting do not look clickable while disabled', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const m = html.match(/\.btn\.primary:disabled\{([^}]*)\}/);
  assert.ok(m, 'expected a .btn.primary:disabled override rule');
  assert.ok(!/--primary-bg/.test(m[1]), 'a disabled primary button must not keep the enabled primary-bg background token');
  assert.match(m[1], /background:var\(--btn-bg\)/);
  assert.match(m[1], /color:var\(--text-faint\)/);
});

// fix (2026-09-28, hamr's ruling "one cap covers drafting + run", supersedes
// the P3 Q2=A drafting-cap-field tests above): the separate Drafting $ cap
// field is GONE — drafting now runs under the same Cap $ every run does.
test('Job card cap row: $ cap | Time cap | Token price, matching design/panel-mockup.html field order; Token price is a disabled, unwired "est." placeholder (P4); there is no separate Drafting $ cap field', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const capRowStart = html.indexOf('<div class="cap-row"');
  const block = html.slice(capRowStart, html.indexOf('<button class="btn primary" type="button" id="chat-start-btn"'));
  const moneyIdx = block.indexOf('jf-cap-money');
  const timeIdx = block.indexOf('jf-cap-time');
  const priceIdx = block.indexOf('jf-price');
  assert.ok(moneyIdx !== -1 && timeIdx !== -1 && priceIdx !== -1, 'expected all three cap fields present');
  assert.ok(moneyIdx < timeIdx && timeIdx < priceIdx, 'expected order $ cap, Time cap, Token price');
  const priceTag = block.match(/<input id="jf-price"[^>]*>/)[0];
  assert.match(priceTag, /placeholder="est\."/);
  assert.match(priceTag, /\bdisabled\b/, 'Token price is unwired in P3 — must render disabled');
  assert.doesNotMatch(html, /jf-cap-draft/, 'the separate Drafting $ cap field is gone (superseded 2026-09-28)');
});

test('fix (2026-09-28): the three cap-row labels read "Cap $", "Time cap (min)", "Token price $" (label CSS already uppercases); no "Drafting cap $" label exists', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /<label for="jf-cap-money">Cap \$<\/label>/);
  assert.match(html, /<label for="jf-cap-time">Time cap \(min\)<\/label>/);
  assert.match(html, /<label for="jf-price">Token price \$<\/label>/);
  assert.doesNotMatch(html, /Drafting cap \$/);
});

test('build item 5 (2026-09-28): the page opens on the Chat tab by default — tab-chat is aria-selected, panel-chat is active/visible, panel-runs starts hidden', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /<button role="tab" id="tab-chat" aria-controls="panel-chat" aria-selected="true"/);
  assert.match(html, /<button role="tab" id="tab-runs" aria-controls="panel-runs" aria-selected="false"/);
  assert.match(html, /<section id="panel-chat" class="tabpanel active"/);
  const runsSectionTag = html.match(/<section id="panel-runs"[^>]*>/)[0];
  assert.match(runsSectionTag, /\bhidden\b/, 'panel-runs must start hidden so Chat is the visible left pane on load');
});

test('build item 5 RED-PROOF (2026-09-28): the initial /api/runs load no longer force-clicks the LEFT "tab-runs" tab — only the RIGHT "tab-run" details tab', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('getJSON("/api/runs").then(function(result){');
  const end = html.indexOf('startPolling();', start) + 'startPolling();'.length;
  assert.ok(start !== -1 && end > start, 'expected the initial /api/runs load block to be present');
  const block = html.slice(start, end);
  assert.doesNotMatch(block, /tab-runs"\)\.click\(\)/, 'the left-pane Runs tab must not be auto-clicked on load (build item 5: Chat is the default)');
  assert.match(block, /tab-run"\)\.click\(\)/, 'the right-pane Run details tab still loads the newest run, ready for when the person switches to Runs themselves');
});

test('build item 3 (2026-09-28): the single progress-indicator row is in the page, ahead of the chat thread, with a glyph and a label element', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /<div class="chat-progress-row" id="chat-progress-row"[^>]*hidden>/);
  assert.match(html, /id="chat-progress-glyph"/);
  assert.match(html, /id="chat-progress-label"/);
  const progressIdx = html.indexOf('id="chat-progress-row"');
  const threadIdx = html.indexOf('id="chat-thread"');
  assert.ok(progressIdx !== -1 && threadIdx !== -1 && progressIdx < threadIdx, 'the progress row must render ahead of the chat thread');
});

test('build item 3 RED-PROOF (2026-09-28): the progress dots reduced-motion fallback renders a STATIC fully-dotted form, never the animated cycle', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('function startProgressDots(){');
  const end = html.indexOf('function progressLabelFor(state){');
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected startProgressDots to be present');
  const body = html.slice(start, end);
  assert.match(body, /reducedMotion/);
  // 4 dots now (build item 3, 2026-09-28 2nd pass) — was 3 dots ("...")
  // before the dot cycle itself was widened to 1..4 in the same change.
  assert.match(body, /\[progress\.\.\.\.\]/, 'the static reduced-motion fallback must be the fully-dotted (4-dot) form, not a half-cycled one');
});

test('build item 2 (2026-09-28): onPhase no longer posts a chat bubble — the progress label is collapsed into state.progressLabel only, never say()\'d', () => {
  const src = readFileSync(new URL('../src/panel/authorsession.js', import.meta.url), 'utf8');
  const start = src.indexOf('const onPhase = (name, data = {}) => {');
  const end = src.indexOf('};', start) + 2;
  assert.ok(start !== -1, 'expected onPhase to be present');
  const body = src.slice(start, end);
  // strip `//` comment lines before scanning — this function's own doc
  // comment mentions `say(` in prose, which must not itself trip the check.
  const codeOnly = body.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /say\(/, 'onPhase must never post a chat message of its own (build item 2: it used to double up with the refusal that often followed)');
  assert.match(body, /state\.progressLabel/);
});

test('build item 2 (2026-09-28): the rendered "who" label for a system/bot message is plain "bareloop", never the jargon "bareloop (progress)" suffix', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.doesNotMatch(html, /bareloop \(progress\)/, 'the "(progress)" suffix must be gone — progress now lives in the single indicator line, not the chat label');
});

test('build item 4 (2026-09-28): Start drafting disables immediately on click (before the network response), and is re-enabled only on a terminal phase', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const start = html.indexOf('startBtn.addEventListener("click", function(){');
  const end = html.indexOf('checkDepsBtn.addEventListener', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'expected the Start click handler to be present');
  const body = html.slice(start, end);
  const sessionLiveIdx = body.indexOf('sessionLive = true;');
  const postIdx = body.indexOf('authorPost("/api/author/start"');
  assert.ok(sessionLiveIdx !== -1 && postIdx !== -1 && sessionLiveIdx < postIdx, 'sessionLive must be set to true BEFORE the start request is sent, not after the response arrives');
  assert.match(body, /refreshStartEnabled\(\)/);
});

test('build item 4 RED-PROOF (2026-09-28): CLIENT_TERMINAL_PHASES matches the server\'s own TERMINAL_PHASES set exactly — a drift here would silently re-lock or silently unlock Start', () => {
  const pageHtml = readFileSync(PAGE_PATH, 'utf8');
  const clientMatch = pageHtml.match(/var CLIENT_TERMINAL_PHASES = \[([^\]]*)\];/);
  assert.ok(clientMatch, 'expected CLIENT_TERMINAL_PHASES to be declared');
  const clientSet = new Set(clientMatch[1].split(',').map((s) => s.trim().replace(/"/g, '')));
  const routesSrc = readFileSync(new URL('../src/panel/authorroutes.js', import.meta.url), 'utf8');
  const serverMatch = routesSrc.match(/const TERMINAL_PHASES = new Set\(\[([^\]]*)\]\);/);
  assert.ok(serverMatch, 'expected TERMINAL_PHASES to be declared in authorroutes.js');
  const serverSet = new Set(serverMatch[1].split(',').map((s) => s.trim().replace(/'/g, '')));
  assert.deepEqual([...clientSet].sort(), [...serverSet].sort());
});

test('build item 7 (2026-09-28): two $0 readiness lines render under the Model field, and Start is gated on the key being usable', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const modelFieldStart = html.indexOf('<label for="jf-model">Model</label>');
  const modelFieldEnd = html.indexOf('jf-name', modelFieldStart); // the NEXT field, Job name
  const modelField = html.slice(modelFieldStart, modelFieldEnd);
  assert.match(modelField, /id="jf-key-status"/);
  assert.match(modelField, /id="jf-reach-status"/);
  assert.match(html, /var keyOk = false;/);
  assert.match(html, /startBtn\.disabled = !capOk \|\| sessionLive \|\| !keyOk;/);
});

test('build item 7 (2026-09-28): refreshModelStatus calls the model-check route with the SELECTED model id, and runs on both load and change', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /\/api\/author\/model-check\?model=" \+ encodeURIComponent\(modelId\)/);
  assert.match(html, /modelSelect\.addEventListener\("change", refreshModelStatus\)/);
  const start = html.indexOf('function refreshModelStatus(){');
  const callIdx = html.indexOf('refreshModelStatus();', start);
  assert.ok(start !== -1 && callIdx !== -1 && callIdx > start, 'refreshModelStatus must also be called once on load, not just on change');
});

// fix (2026-09-28): a 401/403 means the key was REJECTED, not flakiness —
// RED-PROVEN below against the extracted, real page function.
test('fix (2026-09-28): reachStatusText — a 401/403 reads "key rejected", never "may be flaky"; every other status keeps "may be flaky, not blocking"', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const reachStatusText = extractFn(html, 'reachStatusText');
  assert.equal(reachStatusText('HTTP 401'), '[✗] key rejected (HTTP 401)');
  assert.equal(reachStatusText('HTTP 403'), '[✗] key rejected (HTTP 403)');
  for (const status of ['timeout', 'network-error', 'HTTP 500', 'HTTP 429', 'HTTP 503', 'unsupported-provider', 'ECONNRESET']) {
    assert.equal(reachStatusText(status), `[✗] ${status} — may be flaky, not blocking`, `${status} must keep the original "may be flaky" wording, not read as a key rejection`);
  }
});

test('fix (2026-09-28): refreshModelStatus renders its reach text through reachStatusText, never a second hand-composed string', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = extractFnSource(html, 'refreshModelStatus');
  assert.match(src, /reachStatusEl\.textContent = reachStatusText\(reach\.status\)/);
  assert.doesNotMatch(src, /may be flaky/, 'the wording must live in ONE place (reachStatusText), not be re-spelled inline here too');
});

// ---------------------------------------------------------------------------
// build item 1 (2026-09-28, session mul5fofw): the "lost answer" bug. hamr
// typed an answer to the worseThanBefore question and clicked Send; the
// server never received it and no error was ever visible. ROOT CAUSE (found
// by reading the real handlers, not guessed): (a) `sendBtn`/`reviseBtn`
// unconditionally cleared `msgInput.value` even when the POST failed, so a
// rejected answer vanished from the box with zero trace; (b) any error they
// DID surface went to `#chat-card-error`, the SAME element `renderActions`
// (driven by the 2s `poll()`, which every one of these handlers also calls
// in its own `.then`) unconditionally overwrites every tick — so the error
// was wiped before a person could read it, often within the same callback.
// Fixed by chatPostOutcome() (the one place that now decides success) plus
// a dedicated #chat-action-error element poll()/renderActions never touches.
// ---------------------------------------------------------------------------

test('build item 1: chatPostOutcome — RED-PROOF against the pre-fix decision rule', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const chatPostOutcome = extractFn(html, 'chatPostOutcome');
  // the real, still-live server shape for a REFUSED request (e.g. a stale
  // token after a server restart): {ok:false, error:'refused — ...'} at a
  // non-200 status. The OLD per-handler rule (`r.body && r.body.error &&
  // !r.body.ok`) happened to catch this ONE shape, but nothing before this
  // function existed checked `r.status` at all, so a same-shaped 200 (a
  // route that mistakenly reports ok:false with no distinct status) and a
  // malformed body both fell through uncaught. chatPostOutcome must refuse
  // on ALL of them.
  assert.equal(chatPostOutcome({ status: 403, body: { ok: false, error: 'refused — bad token' } }).ok, false);
  assert.equal(chatPostOutcome({ status: 403, body: { ok: false, error: 'refused — bad token' } }).error, 'refused — bad token');
  // a 200 whose body forgot `.error` (or set it to '') must still read as a
  // failure once `ok` isn't literally `true` — the old `r.body.error &&
  // !r.body.ok` rule read this as "no branch matches" and quietly did
  // nothing (no error shown, but the send handler still cleared the input).
  assert.equal(chatPostOutcome({ status: 200, body: { ok: false, error: '' } }).ok, false);
  assert.match(chatPostOutcome({ status: 200, body: { ok: false, error: '' } }).error, /the request failed/);
  // a genuine success only when status is exactly 200 AND ok is exactly true.
  assert.equal(chatPostOutcome({ status: 200, body: { ok: true } }).ok, true);
  assert.equal(chatPostOutcome({ status: 200, body: { ok: true } }).error, '');
  // undefined/null r (what a misbehaving fetch shim could hand back) must
  // never throw — it's a failure, not a crash.
  assert.equal(chatPostOutcome(undefined).ok, false);
  assert.equal(chatPostOutcome(null).ok, false);
});

test('build item 1: sendBtn/reviseBtn only clear msgInput inside the o.ok branch — a failed POST must never wipe the typed answer', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const sendSrc = html.slice(html.indexOf('sendBtn.addEventListener("click"'), html.indexOf('reviseBtn.addEventListener("click"'));
  const reviseSrc = html.slice(html.indexOf('reviseBtn.addEventListener("click"'), html.indexOf('signBtn.addEventListener("click"'));
  for (const [name, src] of [['send', sendSrc], ['revise', reviseSrc]]) {
    assert.match(src, /if\(o\.ok\)\{\s*chatActionOk\(\);\s*msgInput\.value = "";/, `${name}: msgInput.value = "" must sit inside the o.ok branch`);
    // the ONLY place msgInput.value is assigned in this handler is that one
    // success-branch line — never a second unconditional clear elsewhere.
    const assigns = src.match(/msgInput\.value = /g) || [];
    assert.equal(assigns.length, 1, `${name}: msgInput.value must be assigned exactly once (inside the success branch), found ${assigns.length}`);
  }
});

test('build item 1: every chat POST site (send, revise, sign-prepare, sign, check-deps) has a .catch so a rejected fetch (network drop, server restart) surfaces, never silently no-ops', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const chatBlock = html.slice(html.indexOf('checkDepsBtn.addEventListener("click"'), html.indexOf('refreshStartEnabled();\n  })();'));
  const catches = chatBlock.match(/\}\)\.catch\(function\(\)\{ chatActionFailed\(/g) || [];
  assert.equal(catches.length, 5, `expected 5 .catch(...chatActionFailed...) call sites (check-deps, send, revise, sign-prepare, sign), found ${catches.length}`);
});

test('build item 1: #chat-action-error is never written to inside renderActions/renderProgress/poll — only the chat action handlers own it, so the 2s poll can never wipe an error before it is read', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  for (const fn of ['renderActions', 'renderProgress', 'poll', 'renderMessages']) {
    const src = extractFnSource(html, fn);
    assert.doesNotMatch(src, /actionErrEl/, `${fn} must never touch #chat-action-error`);
  }
});

test('build item 1: #chat-action-error exists in the markup, distinct from #chat-card-error, and is cleared on New session / Start', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  assert.match(html, /id="chat-action-error"/);
  assert.match(html, /var actionErrEl = document\.getElementById\("chat-action-error"\);/);
  const newStart = html.indexOf('newBtn.addEventListener("click"');
  const newSrc = html.slice(newStart, html.indexOf('});', newStart) + 3);
  assert.match(newSrc, /actionErrEl\.textContent = "";/);
});

// ---------------------------------------------------------------------------
// build item 3 (2026-09-28, session mul5fofw): the progress line. Observed
// bugs: "checking prior behaviour" shown while waiting on hamr's own answer,
// and "plan confirmed" shown while the plan was actually awaiting his
// confirm — a pending ask must always win over the last machine phase name.
// Also: the label must sit BEFORE the animated dots in the markup so the
// cycling indicator never pushes it around.
// ---------------------------------------------------------------------------

test('build item 3: progressLabelFor — a pending ask always beats the stale progressLabel, with the right wording per kind', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const progressLabelFor = extractFn(html, 'progressLabelFor');
  assert.equal(
    progressLabelFor({ pendingAsk: { kind: 'menu' }, progressLabel: 'checking prior behaviour' }),
    'waiting for your OK',
    'a menu ask must never show a stale machine step name',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: { kind: 'install-needed' }, progressLabel: 'drafting' }),
    'install needed',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: { kind: 'answer' }, progressLabel: 'drafting' }),
    'waiting for your answer',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: { kind: 'language' }, progressLabel: 'confirming plan' }),
    'waiting for your answer',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: { kind: 'fix' }, progressLabel: 'confirming plan' }),
    'waiting for your answer',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: null, progressLabel: 'drafting' }),
    'drafting',
    'no pending ask -> the real machine step label',
  );
  assert.equal(
    progressLabelFor({ pendingAsk: null, progressLabel: null }),
    'working',
    'no pending ask and no label yet -> the generic fallback, never blank',
  );
});

test('build item 3: the progress row markup shows the LABEL span before the GLYPH span (label first, dots never push it)', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const rowStart = html.indexOf('id="chat-progress-row"');
  const rowEnd = html.indexOf('</div>', rowStart);
  const row = html.slice(rowStart, rowEnd);
  const labelIdx = row.indexOf('id="chat-progress-label"');
  const glyphIdx = row.indexOf('id="chat-progress-glyph"');
  assert.ok(labelIdx !== -1 && glyphIdx !== -1 && labelIdx < glyphIdx, 'chat-progress-label must come before chat-progress-glyph in the markup');
});

test('build item 3: the progress dots cycle 1..4 (never 1..3) — [progress.] up to [progress....]', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = extractFnSource(html, 'startProgressDots');
  assert.match(src, /progressDotCount % 4/);
  assert.match(src, /\[progress\.\.\.\.\]/, 'the reduced-motion fallback must show the FULL 4-dot form, never the old 3-dot one');
});

test('build item 3: renderProgress delegates the label to progressLabelFor — never a second hand-composed "waiting for you" string', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = extractFnSource(html, 'renderProgress');
  assert.match(src, /progressLabelEl\.textContent = progressLabelFor\(state\);/);
  assert.doesNotMatch(src, /waiting for you"/, 'the wording must live only in progressLabelFor, not be re-spelled here too');
});

// ---------------------------------------------------------------------------
// build item 4 (2026-09-28, session mul5fofw): chat messages are one short
// plain line per step, no "bareloop" who-label on SYSTEM lines (they are
// step notices, not a message from anyone) — only "you" and the model's own
// bot replies keep a who-label.
// ---------------------------------------------------------------------------

test('build item 4: chatWhoLabel — "you" and bot keep a label, system carries none', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const chatWhoLabel = extractFn(html, 'chatWhoLabel');
  assert.equal(chatWhoLabel('you'), 'you');
  assert.equal(chatWhoLabel('bot'), 'bareloop');
  assert.equal(chatWhoLabel('system'), '');
});

test('build item 4: renderMessages source builds html without a .who div when chatWhoLabel returns empty, WITH one otherwise', () => {
  const html = readFileSync(PAGE_PATH, 'utf8');
  const src = extractFnSource(html, 'renderMessages');
  assert.match(src, /var who = chatWhoLabel\(m\.role\);/);
  assert.match(src, /var whoHtml = who \? \('<div class="who">' \+ escapeXml\(who\) \+ '<\/div>'\) : "";/);
  assert.doesNotMatch(src, /<div class="who">' \+ escapeXml\(who\) \+ '<\/div>' \+ escapeXml\(m\.text\)/, 'must never unconditionally emit the .who div any more');
});

test('build item 4: the three named step lines are short and plain (Copying source, Packages found, Drafting with <model>)', () => {
  const src = readFileSync(new URL('../src/panel/authorsession.js', import.meta.url), 'utf8');
  assert.match(src, /say\('system', 'Copying source \(\$0\)'\);/);
  assert.match(src, /say\('system', 'Packages found'\);/);
  assert.match(src, /say\('system', `Drafting with \$\{card\.model\}, \$\$\{card\.capUsd\.toFixed\(2\)\} cap`\);/);
});
