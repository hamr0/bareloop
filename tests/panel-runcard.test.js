// PANEL-BUILD.md P5 item 6 — run-card fixes: a run whose spine is not written yet reads
// `starting…` (never `file missing`), and a LIVE card shows the same running money/time
// the right pane shows.
//
// Real seams: a real child process that looks like a bareloop runner (the same helper
// shape tests/monthly.test.js uses) is the "alive" runner, the run list is a real
// `runs.jsonl` in a scratch home, and the page's own functions are extracted verbatim.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getRunDetail, listRuns } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

/** @type {string[]} */
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'panel-runcard-'));
  tmpDirs.push(d);
  return d;
}

/** a real live process whose argv names run-u.mjs (a bareloop runner), killed by PID after the test */
function spawnRunner(t) {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'run-u.mjs'], { stdio: 'ignore' });
  t.after(() => { try { process.kill(/** @type {number} */ (c.pid), 'SIGKILL'); } catch { /* already gone */ } });
  return /** @type {number} */ (c.pid);
}

function row(home, runid, spine, pid) {
  appendRun({
    at: '2026-10-02T09:00:00.000Z', runid, job: 'fix-types', spine, patient: null, via: 'run-u', ...(pid ? { pid } : {}),
  }, { home });
}

test('a listed run whose runner is alive but whose spine does not exist yet is `starting`, on both the list and the detail', (t) => {
  const home = tmp();
  const dir = tmp();
  row(home, 'start1', join(dir, 'u-start1.jsonl'), spawnRunner(t));
  const r = listRuns({ home }).find((x) => x.runid === 'start1');
  assert.equal(r.starting, true);
  assert.equal(r.fileMissing, false);
  assert.equal(r.glyph, '▶', 'a starting run is live, never ✗ and never ?');
  const d = getRunDetail('start1', { home });
  assert.equal(d.starting, true);
  assert.equal(d.fileMissing, false);
  assert.equal(d.glyph, '▶');
  assert.equal(d.ended, null, 'no Ended block while starting');
});

test('a listed run whose runner is gone and whose spine does not exist is still `file missing` — starting needs a live runner', () => {
  const home = tmp();
  const dir = tmp();
  row(home, 'gone1', join(dir, 'u-gone1.jsonl'), 2147483000); // no such pid
  const r = listRuns({ home }).find((x) => x.runid === 'gone1');
  assert.equal(r.fileMissing, true);
  assert.equal(r.starting, undefined);
  assert.equal(getRunDetail('gone1', { home }).fileMissing, true);
});

/** a live spine: priced rounds, no job-end, ts spanning 7m30s */
function liveSpine(dir, runid) {
  const spine = join(dir, `u-${runid}.jsonl`);
  const recs = [
    { type: 'job-start', job: 'fix-types', specHash: 'h', budgetUsd: 8, shape: 'plan', goal: 'g', ts: '2026-10-02T09:00:00.000Z', seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.4, ts: '2026-10-02T09:03:00.000Z', seq: 2 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.35, ts: '2026-10-02T09:07:30.000Z', seq: 3 },
  ];
  writeFileSync(spine, `${recs.map((x) => JSON.stringify(x)).join('\n')}\n`);
  return spine;
}

test('a LIVE row carries the same spend/wall floors the detail (right pane) carries — card and pane agree', (t) => {
  const home = tmp();
  const dir = tmp();
  row(home, 'live1', liveSpine(dir, 'live1'), spawnRunner(t));
  const r = listRuns({ home }).find((x) => x.runid === 'live1');
  const d = getRunDetail('live1', { home });
  assert.equal(r.glyph, '▶');
  assert.equal(r.died, false);
  assert.ok(Math.abs(r.spendFloorUsd - 0.75) < 1e-9, `card floor ${r.spendFloorUsd}`);
  assert.equal(r.wallFloorMs, 450_000);
  assert.equal(r.spendFloorUsd, d.spendFloorUsd);
  assert.equal(r.wallFloorMs, d.wallFloorMs);
});

test('a FINISHED row carries no floors (its real figures are complete)', () => {
  const home = tmp();
  const dir = tmp();
  const spine = join(dir, 'u-fin1.jsonl');
  writeFileSync(spine, `${[
    { type: 'job-start', job: 'fix-types', specHash: 'h', budgetUsd: 8, ts: '2026-10-02T09:00:00.000Z', seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.4, ts: '2026-10-02T09:03:00.000Z', seq: 2 },
    { type: 'job-end', outcome: 'green', spentUsd: 0.4, spendComplete: true, ts: '2026-10-02T09:04:00.000Z', seq: 3 },
  ].map((x) => JSON.stringify(x)).join('\n')}\n`);
  row(home, 'fin1', spine);
  const r = listRuns({ home }).find((x) => x.runid === 'fin1');
  assert.equal(r.spendFloorUsd, null);
  assert.equal(r.wallFloorMs, null);
});

// ---- the page's own card text, extracted verbatim ----

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
function cardFns() {
  // eslint-disable-next-line no-new-func
  return new Function(`
    ${['panelMoney', 'panelMoneyWithDraft', 'duration', 'liveSpendText', 'liveWallPhrase', 'rowIsLive', 'rowWallText', 'rowSpendText'].map(fnSrc).join('\n')}
    return { rowSpendText: rowSpendText, rowWallText: rowWallText, liveSpendText: liveSpendText, liveWallPhrase: liveWallPhrase };
  `)();
}

test('page: a live card reads "$X so far · running Ym" — the SAME strings the right pane builds — never "unknown"', () => {
  const f = cardFns();
  const live = {
    glyph: '▶', died: false, spentUsd: null, spendFloorUsd: 0.75, wallFloorMs: 450_000, draftSpentUsd: null, draftSpendComplete: null, wall: 'unknown',
  };
  assert.equal(f.rowSpendText(live), '$0.75 so far');
  assert.equal(f.rowWallText(live), 'running 7m30s');
  assert.equal(f.rowSpendText(live), f.liveSpendText(0.75, null, null));
  assert.equal(f.rowWallText(live), f.liveWallPhrase(450_000));
  // a finished row is untouched
  const done = { glyph: '✓', died: false, spentUsd: 0.4, spendComplete: true, spendFloorUsd: null, wall: '4m00s' };
  assert.equal(f.rowSpendText(done), '$0.40');
  assert.equal(f.rowWallText(done), '4m00s');
});

test('page: a starting row reads "starting…", and the card/pane have a starting branch', () => {
  const f = cardFns();
  assert.equal(f.rowSpendText({ starting: true, glyph: '▶' }), 'starting…');
  assert.match(PAGE, /data-testid="hist-starting-/);
  assert.match(fnSrc('renderRun'), /if\(detail\.starting\)\{/);
  assert.match(fnSrc('renderRun'), /starting… the run has not written its log yet/);
});

test('page: a LIVE run\'s summary headline reads "running <duration>", never the literal "undefined" (wallText was unset on the live branch)', () => {
  const els = {};
  const mk = (id) => ({
    id, hidden: false, className: '', innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, appendChild() {}, querySelector() { return mk('q'); }, querySelectorAll() { return []; },
  });
  const document = { getElementById(id) { return els[id] ?? (els[id] = mk(id)); }, createElement() { return mk('c'); } };
  // everything renderRun CALLS but this test is not about is a no-op stub; the functions that
  // build the strings under test (money, duration, live phrases, escapeXml) are the page's own
  const stubs = ['buildOrderedBoxes', 'stepNumberIndices'].map((n) => `function ${n}(){return [];}`)
    .concat(['renderStepMap', 'partResultGlyph', 'partLine1Text', 'toolBreakdownLine', 'modelLine', 'toolsLine', 'cacheLine', 'paintOfferedRow', 'offeredLine', 'renderAuditGroups', 'renderJob', 'applyAuditFilter', 'renderRunActions']
      .map((n) => `function ${n}(){return "";}`)).join('\n');
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `
    var lastEndedSig = null; var lastJobToolsList = null;
    ${stubs}
    ${['escapeXml', 'runLabel', 'runName', 'glyphClass', 'statusWordHtml', 'fmtLocalDateTime', 'setRunHeader', 'liveStepText', 'runHeaderBody', 'panelMoney', 'panelMoneyWithDraft', 'duration', 'liveSpendText', 'liveWallPhrase', 'realSteps', 'renderEnded', 'renderRun'].map(fnSrc).join('\n')}
    return renderRun;
  `)(document);
  render({
    runid: 'r', job: 'j', glyph: '▶', died: false, checkType: 'deterministic', date: '2026-10-02', spentUsd: null, spendFloorUsd: 0.75, wallFloorMs: 450_000, budgetUsd: 8, draftSpentUsd: null, steps: [], parts: [], ended: null, model: null,
  });
  const headline = els['run-summary'].innerHTML.match(/<div class="summary-headline">.*?<\/div>/)[0];
  assert.doesNotMatch(headline, /undefined/);
  assert.match(headline, /\$0\.75 so far/);
  assert.match(headline, /running 7m30s/);
});

test('page: the SUMMARY headline wears the status word from the status table right after the sign: `[sign] **failed** · deterministic · $ · wall`', () => {
  const els = {};
  const mk = (id) => ({
    id, hidden: false, className: '', innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, appendChild() {}, querySelector() { return mk('q'); }, querySelectorAll() { return []; },
  });
  const document = { getElementById(id) { return els[id] ?? (els[id] = mk(id)); }, createElement() { return mk('c'); } };
  const stubs = ['buildOrderedBoxes', 'stepNumberIndices'].map((n) => `function ${n}(){return [];}`)
    .concat(['renderStepMap', 'partResultGlyph', 'partLine1Text', 'toolBreakdownLine', 'modelLine', 'toolsLine', 'cacheLine', 'paintOfferedRow', 'offeredLine', 'renderAuditGroups', 'renderJob', 'applyAuditFilter', 'renderRunActions']
      .map((n) => `function ${n}(){return "";}`)).join('\n');
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `
    var lastEndedSig = null; var lastJobToolsList = null;
    ${stubs}
    ${['escapeXml', 'runLabel', 'runName', 'glyphClass', 'statusWordHtml', 'fmtLocalDateTime', 'setRunHeader', 'liveStepText', 'runHeaderBody', 'panelMoney', 'panelMoneyWithDraft', 'duration', 'liveSpendText', 'liveWallPhrase', 'realSteps', 'renderEnded', 'renderRun'].map(fnSrc).join('\n')}
    return renderRun;
  `)(document);
  render({
    runid: 'r', job: 'j', glyph: '✗', died: false, status: { key: 'failed', sign: '✗', word: 'failed' }, checkType: 'deterministic', date: '2026-10-02',
    spentUsd: 3.5, spendComplete: true, budgetUsd: 8, wall: '10m00s', wallMs: 600000, steps: [], parts: [], ended: null, model: null,
  });
  const headline = els['run-summary'].innerHTML.match(/<div class="summary-headline">.*?<\/div>/)[0];
  assert.match(headline, /^<div class="summary-headline"><span class="dot red"><\/span><b class="st-word" data-testid="summary-status">failed<\/b> &middot; <b>deterministic<\/b> &middot; /);
});
