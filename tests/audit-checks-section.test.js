// hamr ruling A (2026-11-13), live run mwenvde5: the Audit lists the card's own sections (Checks, Not checked, Always checked), every row with its tag and, after the run, its
// recorded result (the spine's outer-close stage verdicts), never a second list and never a "passed" nothing recorded. The fixture is that real run (spine, signed spec, draft log).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const FIX = fileURLToPath(new URL('./fixtures/audit-checks-mwenvde5/', import.meta.url));
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** the real run in a scratch home; `mutate` edits its spine lines first */
function runHome(mutate = (/** @type {any[]} */ recs) => recs) {
  const home = mkdtempSync(join(tmpdir(), 'audit-checks-'));
  dirs.push(home);
  const sess = join(home, 'panel-sessions', 'smwent3irqxty');
  const dir = join(sess, 'source-seed', 'checkblock-flights-2-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, 'resolved-spec.json'), join(sess, 'resolved-spec.json'));
  copyFileSync(join(FIX, 'draft-log.jsonl'), join(sess, 'draft-log.jsonl'));
  const recs = readFileSync(join(FIX, 'u-mwenvde5.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spine = join(dir, 'u-mwenvde5.jsonl');
  writeFileSync(spine, `${mutate(recs).map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: '2026-11-13T07:34:26.189Z', runid: 'mwenvde5', job: 'checkblock-flights-2', spine, patient: null, via: 'run-u', pid: 999999, capUsd: 0.5 }, { home });
  return home;
}

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
const rowHtml = new Function(`${fnSrc('escapeXml')}\n${fnSrc('byTagOf')}\n${fnSrc('stateDotHTML')}\n${fnSrc('auditCheckRowHtml')}\nreturn auditCheckRowHtml;`)();

test('the Audit lists Checks, Not checked and Always checked, each row tagged, with its recorded result (real run mwenvde5)', () => {
  const ac = getRunDetail('mwenvde5', { home: runHome() }).auditChecks;
  assert.ok(ac, 'the run detail carries the Audit check list');
  assert.equal(ac.checks.length, 6);
  assert.ok(ac.checks.every((c) => c.result === 'passed'), JSON.stringify(ac.checks));
  assert.deepEqual(ac.checks.map((c) => c.by), ['you', 'you', 'agent', 'agent', 'agent', 'agent']);
  assert.match(ac.checks[0].text, /^line 1 · fact · price/);
  assert.equal(ac.notChecked.length, 1);
  assert.equal(ac.notChecked[0].by, 'default');
  assert.equal(ac.notChecked[0].result, 'not-checked');
  assert.match(ac.notChecked[0].text, /every claim quotes its input — this line finds facts, so it has no text to quote/);
  assert.equal(ac.always.length, 3);
  assert.deepEqual(ac.always.map((g) => g.text.split(' — ')[0]), ['changed-from-seed', 'write fence', 'line 1 file']);
  assert.ok(ac.always.every((g) => g.by === 'default'));
  assert.deepEqual(ac.always.map((g) => g.result), ['passed', 'none', 'passed'], 'the write fence is held by the gate, which records no verdict: it says so, never "passed"');
  assert.match(rowHtml(ac.always[0]), /\[default\]<\/span>.*<b class="st-word">passed<\/b>/);
  assert.match(rowHtml(ac.always[1]), /<b class="st-word">no result recorded<\/b>/);
  assert.match(rowHtml(ac.notChecked[0]), /<b class="st-word">not checked<\/b>/);
  assert.match(rowHtml(ac.checks[0]), /\[you\]<\/span>.*<b class="st-word">passed<\/b>/);
});

test('a guard that failed in the close reads failed, and so does the line it guards', () => {
  const home = runHome((recs) => recs.map((r) => (r.type === 'outer-close'
    ? { ...r, verdict: 'unsatisfied', stages: r.stages.map((s) => (s.name === 'changed-from-seed' ? { ...s, verdict: 'unsatisfied' } : s)) } : r)));
  const ac = getRunDetail('mwenvde5', { home }).auditChecks;
  assert.equal(ac.always[0].result, 'failed');
  assert.equal(ac.always[2].result, 'passed');
  assert.match(rowHtml(ac.always[0]), /<b class="st-word">failed<\/b>/);
});

test('a run whose close recorded nothing says no result recorded for every row, never passed', () => {
  const home = runHome((recs) => recs.filter((r) => !['outer-close', 'check-run', 'exit-eval', 'close-verdict', 'step-end'].includes(r.type)));
  const ac = getRunDetail('mwenvde5', { home }).auditChecks;
  assert.ok(ac.checks.every((c) => c.result === 'none'), JSON.stringify(ac.checks));
  assert.ok(ac.always.every((g) => g.result === 'none'));
});

test('the page draws the three sections with bold headings and no second check list in the drafting table', () => {
  assert.match(PAGE, /sec\("Checks", ac\.checks[^]*sec\("Not checked", ac\.notChecked[^]*sec\("Always checked", ac\.always/);
  assert.doesNotMatch(PAGE, /data-testid="drafting-check"/);
});
