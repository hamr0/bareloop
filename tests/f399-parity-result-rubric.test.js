// F399 parity pins, Result tab (rubric jobs) (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Result tab (rubric jobs)").
// Fixtures: trimmed REAL spines (tests/fixtures: f399/mv5e1ktb green text job, audit-checks-mwenvde5 green facts job, audit-lines-mwndngl5 green shape+facts job).
// No real run carries a red close with per-row `why`/`unclaimed`, an `.md` file with `pairedTaken`, or the delivered files still on disk, so those cases are a real spine
// plus PLANTED records or files (said in each test); the expected values are the planted records' own words, read by a plain scan, not through a reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { getRunResult, getRunDetail, RESULT_FILE_GONE, RESULT_FILE_CHANGED, RESULT_MD_RENAMED, RESULT_JUDGED_GONE, RESULT_JUDGED_CHANGED } from '../src/panel/server.js';
import { realWorld, plantDelivered, spineAt, specAt } from './f399-raw.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'f399rr-'));
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');
/** a red run from the real green mwndngl5 spine: the final close says no to line 1, with a planted failed row (`why`) and an unclaimed gap */
const redLine1 = (/** @type {any[]} */ recs) => recs.filter((r) => r.type !== 'destination-written').map((r) => {
  if (r.type === 'outer-close') return { ...r, verdict: 'needs_revision', stages: r.stages.map((/** @type {any} */ s) => (s.name === 'line-1' ? { ...s, verdict: 'needs_revision', rows: s.rows.map((/** @type {any} */ x) => (x.key === 'L1.~1' ? { ...x, result: 'failed', why: 'line 1: the title is empty' } : x)), unclaimed: ['line 1: item 9 has no owner'] } : s)) };
  if (r.type === 'job-end') return { ...r, outcome: 'step-red' };
  return r;
});

test('result-row-why-parity: a failed row\'s words are the final close\'s own `why`, the same words on the Result tab and the Audit box (real mwndngl5 + a planted failed row)', () => {
  const w = realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: redLine1 });
  const r = getRunResult('mwndngl5', w.opts);
  const row = r.lines[0].checkRows.find((/** @type {any} */ x) => x.key === 'L1.~1');
  assert.equal(row.result, 'failed');
  assert.equal(row.why, 'line 1: the title is empty');
  const audit = getRunDetail('mwndngl5', w.opts).auditChecks.lines[0].checks.find((/** @type {any} */ x) => x.key === 'L1.~1');
  assert.equal(audit.why, row.why);
  assert.ok(r.lines[0].checkRows.filter((/** @type {any} */ x) => x.key !== 'L1.~1').every((/** @type {any} */ x) => x.why === undefined), 'a row the record gives no why shows none');
});

test('result-unclaimed-reads-checksOf: a failed line\'s unclaimed gap words are the stage\'s own `unclaimed`, shown under the line on the Result tab and as a failed row in the Audit (planted)', () => {
  const w = realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: redLine1 });
  assert.deepEqual(getRunResult('mwndngl5', w.opts).lines[0].unclaimed, ['line 1: item 9 has no owner']);
  const a = getRunDetail('mwndngl5', w.opts).auditChecks.lines[0].checks;
  assert.deepEqual(a.filter((/** @type {any} */ x) => x.key === undefined).map((/** @type {any} */ x) => [x.text, x.result]), [['line 1: item 9 has no owner', 'failed']]);
  // the green real run records none
  const g = realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j' });
  assert.deepEqual(getRunResult('mwndngl5', g.opts).lines[0].unclaimed, []);
});

test('result-notchecked-texts-parity: the Not-checked words under a line are the signed list\'s `not-checked` rows\' reasons, and the Audit says the same words (real mwenvde5, mwndngl5)', () => {
  for (const [fixture, id, line] of [['audit-checks-mwenvde5', 'mwenvde5', 'every claim quotes its input — this line finds facts, so it has no text to quote'], ['audit-lines-mwndngl5', 'mwndngl5', 'whether each one is true — you judge it at Accept']]) {
    const spec = specAt(`${fixture}/resolved-spec.json`);
    const reasons = spec.closeDecl.list.filter((/** @type {any} */ x) => x.state === 'not-checked').map((/** @type {any} */ x) => x.reason);
    assert.ok(reasons.some((x) => line.endsWith(x)), `${id}: ${reasons}`);
    const w = realWorld({ fixture, id, job: 'j' });
    const r = getRunResult(id, w.opts);
    const shown = [...r.lines.flatMap((/** @type {any} */ l) => l.notChecked), ...r.notChecked];
    assert.ok(shown.includes(line), `${id}: ${JSON.stringify(shown)}`);
    const audit = getRunDetail(id, w.opts).auditChecks;
    assert.ok([...audit.notChecked.map((/** @type {any} */ x) => x.text), ...audit.lines.flatMap((/** @type {any} */ l) => l.notChecked.map((/** @type {any} */ x) => x.text))].some((t) => line.startsWith(t) || t === line), JSON.stringify(audit.notChecked));
  }
});

test('result-saved-landed-parity + result-saved-state-words: the Saved card names each delivered file with its recorded bytes and says ok / gone / changed with the code-owned words (real mv5e1ktb records; files planted)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl');
  const want = recs.filter((r) => r.type === 'destination-written');
  // as archived the files are not on this machine: both are gone
  const gone = getRunResult('mv5e1ktb', realWorld({ fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j' }).opts);
  assert.deepEqual(gone.delivered.map((/** @type {any} */ d) => [d.name, d.bytes, d.state, d.words]), want.map((r) => [basename(r.path), r.bytes, 'gone', RESULT_FILE_GONE]));
  const d = scratch();
  try {
    const bodies = [JSON.stringify({ text: 'one', cites: {} }), JSON.stringify({ text: 'two', cites: {} })];
    const w = realWorld({ fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j', mutate: (r) => plantDelivered(r, d, bodies) });
    const ok = getRunResult('mv5e1ktb', w.opts).delivered;
    assert.deepEqual(ok.map((/** @type {any} */ x) => [x.name, x.bytes, x.state, x.words]), want.map((r, i) => [basename(r.path), Buffer.byteLength(bodies[i]), 'ok', null]));
    writeFileSync(join(d, '1', basename(want[0].path)), 'edited after the run');
    rmSync(join(d, '2', basename(want[1].path)));
    const after = getRunResult('mv5e1ktb', w.opts).delivered;
    assert.deepEqual(after.map((/** @type {any} */ x) => [x.state, x.words]), [['changed', RESULT_FILE_CHANGED], ['gone', RESULT_FILE_GONE]]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('result-line-file-parity: a line\'s saved file is the delivered file named `<n>-<date>.json` (real mv5e1ktb: line 1 -> file 0, line 2 -> file 1)', () => {
  const recs = spineAt('f399/mv5e1ktb/u-mv5e1ktb.jsonl').filter((r) => r.type === 'destination-written');
  const w = realWorld({ fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j' });
  const r = getRunResult('mv5e1ktb', w.opts);
  for (const l of r.lines) {
    const idx = recs.findIndex((x) => basename(x.path).startsWith(`${l.n}-`));
    assert.ok(idx >= 0);
    assert.equal(l.file.i, idx, `line ${l.n}`);
  }
  assert.deepEqual(r.lines.map((/** @type {any} */ l) => l.file.i), [0, 1]);
});

test('result-md-renamed-note: a delivered .md file gets its own card line; one saved under a new name carries the code-owned note naming the name that was taken (planted records on real mv5e1ktb)', () => {
  const d = scratch();
  try {
    const bodies = [JSON.stringify({ text: 'one', cites: {} }), JSON.stringify({ text: 'two', cites: {} }), '# report\n'];
    const w = realWorld({
      fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j',
      mutate: (recs) => {
        const withMd = [...recs.slice(0, recs.findIndex((r) => r.type === 'door-decision')), { type: 'destination-written', path: '/x/report-2026-10-12.md', bytes: 0, sha256: 'x', pairedTaken: '/x/steps/1-2026-10-12.json' }, ...recs.slice(recs.findIndex((r) => r.type === 'door-decision'))];
        return plantDelivered(withMd, d, bodies);
      },
    });
    const r = getRunResult('mv5e1ktb', w.opts);
    assert.equal(r.md.length, 1);
    assert.equal(r.md[0].name, 'report-2026-10-12.md');
    assert.equal(r.md[0].state, 'ok');
    assert.equal(r.md[0].note, RESULT_MD_RENAMED('1-2026-10-12.json'));
    assert.equal(r.md[0].note, 'saved under a new name because 1-2026-10-12.json was already taken');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('result-judged-file-parity: a red run shows the last file the check read, from the output-judged record: its rows while it matches, the code-owned words when gone / changed (planted red run on real mwndngl5)', () => {
  const body = JSON.stringify({ results: [{ title: 'Evaluate queue libraries', status: 'in progress', quote: 'x' }] });
  /** @param {any[]} recs */
  const red = (recs) => redLine1(recs).map((r) => (r.type === 'output-judged' ? { ...r, sha256: sha(body), bytes: Buffer.byteLength(body) } : r));
  const w = realWorld({ fixture: 'audit-lines-mwndngl5', id: 'mwndngl5', job: 'j', mutate: red });
  const tree = join(w.root, 'session', 'source-seed', 'tree');
  mkdirSync(join(tree, 'output', 'steps'), { recursive: true });
  const f = join(tree, 'output', 'steps', '1.json');
  const none = getRunResult('mwndngl5', w.opts).lines[0].file;
  assert.deepEqual([none.state, none.words], ['gone', RESULT_JUDGED_GONE]);
  assert.equal(none.judged, true);
  writeFileSync(f, body);
  const ok = getRunResult('mwndngl5', w.opts).lines[0].file;
  assert.deepEqual([ok.state, ok.words, ok.judged], ['ok', null, true]);
  assert.equal(getRunResult('mwndngl5', w.opts).lines[0].passed, false, 'a red run never shows a tick');
  writeFileSync(f, `${body} `);
  const changed = getRunResult('mwndngl5', w.opts).lines[0].file;
  assert.deepEqual([changed.state, changed.words], ['changed', RESULT_JUDGED_CHANGED]);
});

test('result-facts-grid-parity: each result row\'s quote, proof marks and cells are the saved file\'s quote plus the run\'s rubric-evidence spans; money is shown as the check read it (real mwenvde5 evidence, planted file)', () => {
  const recs = spineAt('audit-checks-mwenvde5/u-mwenvde5.jsonl');
  const ev = recs.findLast((r) => r.type === 'rubric-evidence').evidence.filter((/** @type {any} */ e) => e.check === 'p1-facts').slice(0, 2);
  const body = JSON.stringify({ results: ev.map((/** @type {any} */ e) => ({ quote: e.text, values: { price: '166', 'departure time': e.text.includes('5:39') ? '5:39 AM' : '7:55 AM' } })) });
  const d = scratch();
  try {
    const w = realWorld({ fixture: 'audit-checks-mwenvde5', id: 'mwenvde5', job: 'j', mutate: (r) => plantDelivered(r, d, [body]) });
    const fact = getRunResult('mwenvde5', w.opts).lines[0];
    assert.equal(fact.kind, 'facts');
    assert.equal(fact.rows.length, 2);
    fact.rows.forEach((/** @type {any} */ row, /** @type {number} */ k) => {
      assert.equal(row.quote, ev[k].text);
      assert.equal(row.proof.text, ev[k].text);
      assert.deepEqual(row.proof.marks, ev[k].spans.map((/** @type {any} */ s) => [s.start, s.end]).sort((/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] - b[0]), 'the marks are the evidence spans, in text order');
      assert.equal(row.cells[0], '166 US dollars', 'the money as the check read it off the quote');
      assert.equal(row.cells[2], 'Boston Logan International Airport');
    });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('result-answer-cites-parity: a text line\'s answer and its cites are the saved file\'s `text` and `cites` (real mv5e1ktb job, planted file in its real shape)', () => {
  const d = scratch();
  try {
    const one = { text: 'v0.3.1, v0.3.0, v0.2.9', cites: { Changelog: [{ claim: 'v0.3.1', quote: '## v0.3.1 - 2026-10-01' }, { claim: 'v0.3.0', quote: '## v0.3.0 - 2026-09-20' }] } };
    const bodies = [JSON.stringify(one), JSON.stringify({ text: 'a short summary', cites: {} })];
    const w = realWorld({ fixture: 'f399/mv5e1ktb', id: 'mv5e1ktb', job: 'j', mutate: (r) => plantDelivered(r, d, bodies) });
    const [l1, l2] = getRunResult('mv5e1ktb', w.opts).lines;
    assert.equal(l1.kind, 'text');
    assert.equal(l1.answer, one.text);
    assert.deepEqual(l1.cites, [{ label: 'Changelog', items: one.cites.Changelog }]);
    assert.equal(l2.answer, 'a short summary');
    assert.deepEqual(l2.cites, []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
