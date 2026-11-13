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
function runHome(mutate = (/** @type {any[]} */ recs) => recs, audit = (/** @type {string} */ text) => text) {
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
  if (audit !== null) writeFileSync(join(dir, 'u-mwenvde5-gate-audit.jsonl'), audit(readFileSync(join(FIX, 'u-mwenvde5-gate-audit.jsonl'), 'utf8')));
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
  assert.deepEqual(ac.always.map((g) => g.result), ['passed', 'held', 'passed'], 'the write fence reads the gate\'s own record of this run');
  assert.equal(ac.always[1].word, 'held · 0 writes blocked', 'the real gate audit of mwenvde5 records 1 allowed write and no denial');
  assert.match(rowHtml(ac.always[0]), /\[default\]<\/span>.*<b class="st-word">passed<\/b>/);
  assert.match(rowHtml(ac.always[1]), /<b class="st-word">held · 0 writes blocked<\/b>/);
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
  assert.deepEqual(ac.always.map((g) => g.result), ['none', 'held', 'none'], 'the fence row reads the gate record, which this run has');
});

test('the page draws the three sections with bold headings and no second check list in the drafting table', () => {
  assert.match(PAGE, /sec\("Checks", ac\.checks[^]*sec\("Not checked", ac\.notChecked[^]*sec\("Always checked", ac\.always/);
  assert.doesNotMatch(PAGE, /data-testid="drafting-check"/);
});

test('the write fence row counts the gate\'s denied write/edit attempts for this run, nothing else (crafted audit)', () => {
  const ac0 = getRunDetail('mwenvde5', { home: runHome() }).auditChecks;
  const w = readFileSync(join(FIX, 'u-mwenvde5-gate-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.action?.type === 'write');
  const rows = [
    { ...w, decision: 'deny', action: { ...w.action, path: '/x/outside.txt' } },
    { ...w, decision: 'deny', action: { ...w.action, type: 'edit', path: '/x/other.txt' } },
    { ...w, decision: 'deny', action: { type: 'read', path: '/x/secret.txt' } }, // a denied READ is not a blocked write
    { ...w, decision: 'allow', action: { ...w.action, path: '/x/ok.txt' } }, // an allowed write is not counted
  ];
  const home = runHome(undefined, (t) => `${t}${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const ac = getRunDetail('mwenvde5', { home }).auditChecks;
  assert.equal(ac0.always[1].word, 'held · 0 writes blocked');
  assert.equal(ac.always[1].word, 'held · 2 writes blocked');
  assert.match(rowHtml(ac.always[1]), /<b class="st-word">held · 2 writes blocked<\/b>/);
});

test('a run with no gate audit says the gate\'s record is missing: never held, never passed', () => {
  const ac = getRunDetail('mwenvde5', { home: runHome(undefined, null) }).auditChecks;
  assert.equal(ac.always[1].result, 'record-missing');
  assert.equal(ac.always[1].word, "the gate's record for this run is missing");
  assert.match(rowHtml(ac.always[1]), /<b class="st-word">the gate's record for this run is missing<\/b>/);
});
