// Addendum 2026-11-14 (c) piece 4: the Audit and the Result tab show a pass or fail mark PER ROW, read from the close's own per-row record (`rows` on a stage entry of the final close), never one result shared by the
// line. Real run mwenvde5 (tests/fixtures/audit-checks-mwenvde5: signed spec, draft log, spine); the close's records are edited to carry rows the way the real close records them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail, getRunResult } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const FIX = fileURLToPath(new URL('./fixtures/audit-checks-mwenvde5/', import.meta.url));
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function runHome(mutate = (/** @type {any[]} */ recs) => recs) {
  const home = mkdtempSync(join(tmpdir(), 'onelist-results-'));
  dirs.push(home);
  const sess = join(home, 'panel-sessions', 'smwent3irqxty');
  const dir = join(sess, 'source-seed', 'checkblock-flights-2-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, 'resolved-spec.json'), join(sess, 'resolved-spec.json'));
  copyFileSync(join(FIX, 'draft-log.jsonl'), join(sess, 'draft-log.jsonl'));
  const recs = readFileSync(join(FIX, 'u-mwenvde5.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spine = join(dir, 'u-mwenvde5.jsonl');
  writeFileSync(spine, `${mutate(recs).map((r) => JSON.stringify(r)).join('\n')}\n`);
  copyFileSync(join(FIX, 'u-mwenvde5-gate-audit.jsonl'), join(dir, 'u-mwenvde5-gate-audit.jsonl'));
  appendRun({ at: '2026-11-13T07:34:26.189Z', runid: 'mwenvde5', job: 'checkblock-flights-2', spine, patient: null, via: 'run-u', pid: 999999, capUsd: 0.5 }, { home });
  return home;
}
/** the final close with the line-1 stage red, carrying these rows (the record the real close writes: `rows`, `unclaimed`) */
const redClose = (/** @type {any} */ line) => (/** @type {any[]} */ recs) => recs.map((r) => (r.type === 'outer-close'
  ? { ...r, verdict: 'unsatisfied', stages: r.stages.map((/** @type {any} */ s) => (s.name === 'line-1' ? { ...s, verdict: 'unsatisfied', ...line } : s)) } : r));
const ROWS = [
  { key: 'L1.~1', result: 'failed', why: 'result 1, fact "price": the value is not what the quote holds (500 is not 389)' },
  { key: 'L1.~2', result: 'passed' }, { key: 'L1.$floor', result: 'passed' }, { key: 'L1.fact.origin', result: 'passed' },
  { key: 'L1.fact.destination', result: 'passed' }, { key: 'L1.count.3-', result: 'passed' }, { key: 'L1.phrase.nonstop', result: 'passed' },
];

function fnSrc(/** @type {string} */ name) {
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
const rowHtml = new Function(`${fnSrc('escapeXml')}\n${fnSrc('tagWordOf')}\n${fnSrc('byTagOf')}\n${fnSrc('ckTagHtml')}\n${fnSrc('ckRowHtml')}\n${fnSrc('stateDotHTML')}\n${fnSrc('auditCheckRowHtml')}\nreturn auditCheckRowHtml;`)();

test('Audit: each check row reads ITS row\'s recorded result: the failed row failed with its reason, the rest of the line passed', () => {
  const ac = getRunDetail('mwenvde5', { home: runHome(redClose({ rows: ROWS })) }).auditChecks;
  const by = Object.fromEntries(ac.checks.map((/** @type {any} */ c) => [c.key, c.result]));
  assert.deepEqual(by, { 'L1.~1': 'failed', 'L1.~2': 'passed', 'L1.fact.origin': 'passed', 'L1.fact.destination': 'passed', 'L1.count.3-': 'passed', 'L1.phrase.nonstop': 'passed', 'L1.$floor': 'passed' });
  assert.match(ac.checks.find((/** @type {any} */ c) => c.key === 'L1.~1').why, /the value is not what the quote holds/);
  assert.match(rowHtml(ac.checks.find((/** @type {any} */ c) => c.key === 'L1.~1')), /<b class="st-word">failed<\/b>.*the value is not what the quote holds/);
  assert.doesNotMatch(rowHtml(ac.checks.find((/** @type {any} */ c) => c.key === 'L1.~2')), /audit-check-why/);
});

test('Audit: a gap no row owns is its own failed item of the line, in the gap\'s words; the rows it does not name pass', () => {
  const ac = getRunDetail('mwenvde5', { home: runHome(redClose({ rows: ROWS.map((r) => ({ ...r, result: 'passed', why: undefined })), unclaimed: ['result 1: the quote is not found word for word in "flights"'] })) }).auditChecks;
  assert.equal(ac.checks.filter((/** @type {any} */ c) => c.result === 'failed').length, 1);
  const u = ac.checks.find((/** @type {any} */ c) => c.result === 'failed');
  assert.equal(u.text, 'line 1 · result 1: the quote is not found word for word in "flights"');
  assert.equal(u.by, null);
});

test('Audit: a close recorded before rows existed (no `rows` on the stage) keeps today\'s reading: the stage verdict is every row of its line\'s result', () => {
  const ac = getRunDetail('mwenvde5', { home: runHome(redClose({})) }).auditChecks;
  assert.ok(ac.checks.every((/** @type {any} */ c) => c.result === 'failed'), JSON.stringify(ac.checks.map((/** @type {any} */ c) => c.result)));
});

test('Result tab: each line carries its rows with their own mark (and the unclaimed gaps), from the same record', () => {
  const r = getRunResult('mwenvde5', { home: runHome(redClose({ rows: ROWS, unclaimed: ['x gap'] })) });
  const line = r.lines[0];
  const by = Object.fromEntries(line.checkRows.map((/** @type {any} */ c) => [c.key, c.result]));
  assert.equal(by['L1.~1'], 'failed');
  assert.equal(by['L1.fact.origin'], 'passed');
  assert.equal(line.checkRows.length, 7);
  assert.match(line.checkRows.find((/** @type {any} */ c) => c.key === 'L1.~1').why, /500 is not 389/);
  assert.deepEqual(line.unclaimed, ['x gap']);
  assert.equal(line.checkRows.every((/** @type {any} */ c) => typeof c.text === 'string' && c.text !== ''), true);
});

test('Result tab page: the line draws one mark per row (and the reason of a failed one); the old single line tick is not the only mark', () => {
  assert.match(PAGE, /data-testid="result-checkrows"/);
  const draw = new Function(`${fnSrc('escapeXml')}\n${fnSrc('tagWordOf')}\n${fnSrc('byTagOf')}\n${fnSrc('resultField')}\n${fnSrc('resultCheckRowsHtml')}\nreturn resultCheckRowsHtml;`)();
  const html = draw({ checkRows: [{ text: 'a', by: 'you', result: 'failed', why: 'because' }, { text: 'b', by: 'default', result: 'passed' }], unclaimed: ['gap words'] });
  assert.match(html, /data-result="failed"[^]*because/);
  assert.match(html, /data-result="passed"/);
  assert.match(html, /gap words/);
});
