// F399 parity pins, Audit tab (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Audit tab").
// Fixtures: trimmed REAL spines (tests/fixtures: audit-lines-mwndngl5 shape+facts, audit-checks-mwenvde5 facts, f399/mwtf8p8s repo job with the one list, audit-grid mvtatlxw code job with a fix loop and no list,
// export-run flight-c1 two tries each with an output-judged record). Where no real run has the case (a red per-row `why`, an unclaimed gap, a first-red close that never reached the rest, a place-rules record),
// the case is a real spine plus PLANTED records, said in the test. Expected values are the records' own words by a plain scan (tests/f399-raw.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunDetail, getRunRounds } from '../src/panel/server.js';
import { checksOf } from '../src/runread.js';
import { makeAuditGridWorld, RUNID as GRID, makeRubricGridWorld, RUBRIC_RUNID } from './audit-grid-world.mjs';
import { realWorld, spineAt, specAt, rawClose } from './f399-raw.mjs';

/** a red run from the real green mwndngl5 spine: the final close says no to line 1 (a planted failed row with its `why`, an unclaimed gap) */
const redLine1 = (/** @type {any[]} */ recs) => recs.filter((r) => r.type !== 'destination-written').map((r) => {
  if (r.type === 'outer-close') return { ...r, verdict: 'needs_revision', stages: r.stages.map((/** @type {any} */ s) => (s.name === 'line-1' ? { ...s, verdict: 'needs_revision', rows: s.rows.map((/** @type {any} */ x) => (x.key === 'L1.~1' ? { ...x, result: 'failed', why: 'line 1: the title is empty' } : x)), unclaimed: ['line 1: item 9 has no owner'] } : s)) };
  if (r.type === 'job-end') return { ...r, outcome: 'step-red' };
  return r;
});
const audit = (/** @type {string} */ fixture, /** @type {string} */ id, /** @type {any} */ mutate) => getRunDetail(id, realWorld({ fixture, id, job: 'j', mutate }).opts).auditChecks;
const allRows = (/** @type {any} */ a) => [...a.lines.flatMap((/** @type {any} */ l) => l.checks), ...a.always];

test('audit-checks-head-parity: the head counts (passed / failed / not reached / not checked) are the tally of the rows, and each line row\'s result is the final close\'s own row result (real mwndngl5 green; planted red)', () => {
  const g = audit('audit-lines-mwndngl5', 'mwndngl5', undefined);
  const rec = rawClose(spineAt('audit-lines-mwndngl5/u-mwndngl5.jsonl'));
  const recorded = new Map(rec.stages.flatMap((/** @type {any} */ s) => (s.rows ?? []).map((/** @type {any} */ x) => [x.key, x.result])));
  for (const row of g.lines[0].checks.filter((/** @type {any} */ x) => x.key)) assert.equal(row.result, recorded.get(row.key), row.key);
  const tally = (/** @type {any} */ a) => { const all = [...a.checks, ...a.always]; return { passed: all.filter((x) => x.result === 'passed' || x.result === 'held').length, failed: all.filter((x) => x.result === 'failed').length, notReached: all.filter((x) => x.result === 'not-reached').length, notChecked: a.notChecked.length }; };
  assert.deepEqual(tally(g), { passed: 6, failed: 0, notReached: 0, notChecked: 1 });
  const red = audit('audit-lines-mwndngl5', 'mwndngl5', redLine1);
  assert.deepEqual(tally(red), { passed: 5, failed: 2, notReached: 0, notChecked: 1 }, 'one failed row plus the unclaimed gap');
});

test('audit-row-tags-parity: a row\'s tag is the signed list row\'s `by`, its kind word truth / shape / file follows the part (real mwndngl5 and mwenvde5)', () => {
  for (const [fixture, id] of [['audit-lines-mwndngl5', 'mwndngl5'], ['audit-checks-mwenvde5', 'mwenvde5']]) {
    const spec = specAt(`${fixture}/resolved-spec.json`);
    const stage = spec.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
    const byKey = new Map(spec.closeDecl.list.map((/** @type {any} */ x) => [x.key, x]));
    for (const row of audit(fixture, id, undefined).lines[0].checks.filter((/** @type {any} */ x) => x.key)) {
      const sp = /** @type {any} */ (byKey.get(row.key));
      assert.equal(row.by, sp.by, `${id} ${row.key}`);
      const cls = sp.part ? stage.params.parts[sp.part.part].class : null;
      assert.equal(row.kind, sp.kind === 'floor' ? 'file' : (cls === 'shape' ? 'shape' : 'truth'), `${id} ${row.key}`);
    }
  }
});

test('audit-row-why-parity: a failed row\'s reason words are the final close\'s own `why` (planted failed row on real mwndngl5)', () => {
  const row = audit('audit-lines-mwndngl5', 'mwndngl5', redLine1).lines[0].checks.find((/** @type {any} */ x) => x.key === 'L1.~1');
  assert.deepEqual([row.result, row.why], ['failed', 'line 1: the title is empty']);
});

test('audit-unclaimed-parity: a failed stage\'s unclaimed gap words are listed under its line as failed rows with no key (planted)', () => {
  const a = audit('audit-lines-mwndngl5', 'mwndngl5', redLine1);
  assert.deepEqual(a.lines[0].checks.filter((/** @type {any} */ x) => x.key === undefined).map((/** @type {any} */ x) => [x.text, x.result]), [['line 1: item 9 has no owner', 'failed']]);
  assert.equal(audit('audit-lines-mwndngl5', 'mwndngl5', undefined).lines[0].checks.filter((/** @type {any} */ x) => x.key === undefined).length, 0);
});

test('audit-always-keyed-parity: "Always checked" keyed rows ($ defaults) read the final close\'s own row for the key; the fence row reads the gate\'s record (real mwndngl5)', () => {
  const a = audit('audit-lines-mwndngl5', 'mwndngl5', undefined);
  const rec = rawClose(spineAt('audit-lines-mwndngl5/u-mwndngl5.jsonl'));
  const guard = rec.stages.flatMap((/** @type {any} */ s) => s.rows ?? []).find((/** @type {any} */ x) => x.key === 'J.$guard.changed-from-seed');
  assert.deepEqual(a.always.map((/** @type {any} */ x) => [x.text, x.result, x.by]), [['did the run change a file?', guard.result, 'default'], ['only files in output/ changed?', 'held', 'default']]);
  // a failed record turns the keyed row failed (planted)
  const red = audit('audit-lines-mwndngl5', 'mwndngl5', (/** @type {any[]} */ recs) => recs.map((r) => (r.type === 'outer-close' ? { ...r, verdict: 'needs_revision', stages: r.stages.map((/** @type {any} */ s) => (s.name === 'changed-from-seed' ? { ...s, verdict: 'needs_revision', rows: [{ key: 'J.$guard.changed-from-seed', result: 'failed' }] } : s)) } : r)));
  assert.equal(red.always[0].result, 'failed');
  // a `fence` record (blocked 3) is what the row says; the sidecar fallback would say 0
  const held = audit('audit-lines-mwndngl5', 'mwndngl5', (/** @type {any[]} */ recs) => [...recs.slice(0, -1), { type: 'fence', held: true, blocked: 3 }, recs.at(-1)]);
  assert.equal(held.always[1].word, 'held · 3 writes blocked');
});

test('audit-guard-rows-unkeyed-parity: with no signed list the Always rows are the guards\' names from code and each state is the final close\'s stage verdict (real mvtatlxw, a job with no list)', () => {
  const w = makeAuditGridWorld();
  const a = getRunDetail(GRID, w.opts).auditChecks;
  const close = rawClose(spineAt('audit-grid/u-mvtatlxw.jsonl'));
  assert.ok(close.stages.length > 0 && close.stages.every((/** @type {any} */ s) => s.verdict === 'satisfied'));
  assert.ok(a.always.length > 0);
  assert.ok(a.always.every((/** @type {any} */ x) => x.by === 'default' && x.result !== 'failed'), JSON.stringify(a.always.map((/** @type {any} */ x) => [x.text, x.result])));
  assert.ok(a.always.some((/** @type {any} */ x) => /changed|change a file/i.test(x.text) && x.result === 'passed'));
});

test('audit-notchecked-texts-parity: Not-checked rows carry the signed list\'s reason words, with the tag of their `by` (real mwtf8p8s: a ~ rule nothing can check; real mwndngl5: a $ default)', () => {
  const t = specAt('f399/mwtf8p8s/resolved-spec.json').closeDecl.list.find((/** @type {any} */ x) => x.state === 'not-checked');
  const a = audit('f399/mwtf8p8s', 'mwtf8p8s', undefined);
  assert.equal(a.notChecked.length, 1);
  assert.equal(a.notChecked[0].by, t.by);
  assert.ok(a.notChecked[0].text.endsWith(t.reason), a.notChecked[0].text);
  const n = specAt('audit-lines-mwndngl5/resolved-spec.json').closeDecl.list.find((/** @type {any} */ x) => x.state === 'not-checked' && x.kind === 'prose');
  const b = audit('audit-lines-mwndngl5', 'mwndngl5', undefined);
  assert.equal(b.notChecked[0].by, n.by);
  assert.equal(b.notChecked[0].text, n.reason);
});

test('audit-line-blocks-parity: one block per signed job line with its text; a shape line carries the shape head; a job with no shape part has none (real mwndngl5 shape+facts, mwenvde5 facts)', () => {
  for (const [fixture, id] of [['audit-lines-mwndngl5', 'mwndngl5'], ['audit-checks-mwenvde5', 'mwenvde5']]) {
    const spec = specAt(`${fixture}/resolved-spec.json`);
    const a = audit(fixture, id, undefined);
    assert.deepEqual(a.lines.map((/** @type {any} */ l) => [l.n, l.text]), spec.jobLines.map((/** @type {any} */ l) => [l.n, l.text]));
    const hasShape = spec.closeDecl.stages.some((/** @type {any} */ s) => (s.params?.parts ?? []).some((/** @type {any} */ p) => p.class === 'shape'));
    assert.equal(a.shapeHead !== undefined, hasShape, id);
  }
  assert.equal(audit('audit-lines-mwndngl5', 'mwndngl5', undefined).shapeHead, "Shape checks · code checks each item's form, not whether it is true");
});

test('audit-not-reached-parity: rows of stages the final close never ran read "not reached"; the reader\'s notReached is the declared stages the close did not run (real mwtf8p8s + a planted first-red close)', () => {
  const spec = specAt('f399/mwtf8p8s/resolved-spec.json');
  const names = spec.closeDecl.stages.map((/** @type {any} */ s) => s.name);
  const plant = (/** @type {any[]} */ rs) => {
    const i = rs.findLastIndex((r) => r.type === 'job-end');
    return [...rs.slice(0, i), { type: 'outer-close', verdict: 'needs_revision', stages: [{ name: names[0], verdict: 'satisfied' }, { name: names[1], verdict: 'needs_revision' }], declared: true }, { ...rs[i], outcome: 'step-red' }, ...rs.slice(i + 1)];
  };
  const w = realWorld({ fixture: 'f399/mwtf8p8s', id: 'mwtf8p8s', job: 'walk-stop', mutate: plant });
  const a = getRunDetail('mwtf8p8s', w.opts).auditChecks;
  const stageRows = a.lines[0].checks.filter((/** @type {any} */ x) => x.key && x.key.startsWith('S.'));
  assert.deepEqual(stageRows.map((/** @type {any} */ x) => [x.key, x.result]), [['S.tests-executed-not-dropped', 'failed'], ['S.suite-zero-failing-tests', 'not-reached'], ['S.suite-exits-clean', 'not-reached']]);
  assert.equal(stageRows[2].word, 'not reached');
  const c = checksOf(plant(spineAt('f399/mwtf8p8s/u-mwtf8p8s.jsonl')), null, { spec });
  assert.deepEqual(c?.notReached, names.slice(2));
});

test('audit-try-checks-parity: each try\'s checks in the parts list are the try\'s own exit-eval results: type, pass and, for a red check, its reasons (real mvtatlxw step zero-target-errors: try 1 red, try 2 green)', () => {
  const w = makeAuditGridWorld();
  const d = getRunDetail(GRID, w.opts);
  const part = d.parts.find((/** @type {any} */ p) => p.id === 'step:zero-target-errors:1');
  const raw = spineAt('audit-grid/u-mvtatlxw.jsonl').filter((r) => r.type === 'exit-eval' && r.step === 'zero-target-errors');
  assert.equal(part.attempts.length, raw.length);
  raw.forEach((ev, i) => {
    assert.deepEqual(part.attempts[i].checks.map((/** @type {any} */ c) => [c.type, c.pass]), ev.results.map((/** @type {any} */ x) => [x.type, x.pass]), `try ${i + 1}`);
  });
  const red = part.attempts[0].checks[1];
  assert.equal(red.pass, false);
  assert.equal(red.reasons.length, 11);
  assert.ok(raw[0].results[1].detail.includes(red.reasons[0]));
});

test('audit-try-judged-file-parity: a try\'s "output judged" line names the file its check read, from the try\'s own output-judged record (real flight-c1: two tries, two records)', () => {
  const w = makeRubricGridWorld();
  const d = getRunDetail(RUBRIC_RUNID, w.opts);
  const part = d.parts.find((/** @type {any} */ p) => p.kind === 'step');
  const raw = spineAt('export-run/smvij5q3rx96z/source-seed/flight-c1-bareloop/u-mvij7kuk.jsonl').filter((r) => r.type === 'output-judged');
  assert.equal(raw.length, 2);
  raw.forEach((rec, i) => {
    const line = part.attempts[i].judged[0];
    assert.ok(line.includes(rec.path), line);
    assert.ok(line.includes(`${rec.sha256.slice(0, 4)}…${rec.sha256.slice(-2)}`), line);
  });
  assert.notEqual(raw[0].sha256, raw[1].sha256);
});

test('audit-rounds-check-parity: the rounds drill-down\'s check detail names the failing stages of the try\'s own close (real mvtatlxw fix part: tries 1-2 fail typecheck-clean-exit, try 3 no-suppressions)', () => {
  const w = makeAuditGridWorld();
  const d = getRunDetail(GRID, w.opts);
  const fix = d.parts.findIndex((/** @type {any} */ p) => p.kind === 'fix');
  const raw = spineAt('audit-grid/u-mvtatlxw.jsonl').filter((r) => r.type === 'close-verdict' && Array.isArray(r.stages));
  const failing = (/** @type {any} */ c) => c.stages.filter((/** @type {any} */ s) => s.verdict !== 'satisfied').map((/** @type {any} */ s) => s.name);
  assert.deepEqual(failing(raw[0]), ['typecheck-clean-exit']);
  assert.deepEqual(failing(raw[1]), ['no-suppressions']);
  const detail = (/** @type {number} */ n) => getRunRounds(GRID, { part: fix, attempt: n }, w.opts).check;
  assert.deepEqual(detail(1), { outcome: 'red', detail: 'failing: typecheck-clean-exit' });
  assert.deepEqual(detail(3), { outcome: 'red', detail: 'failing: no-suppressions' });
});

test('audit-place-rules-parity: the place-rules block says, per rule, the value the run start read, "(was X)" when it changed, or why none was found (hand-built place-rules record on real mwenvde5)', () => {
  const rows = [{ key: 'L1/price', found: true, value: '166', was: '160' }, { key: 'L1/fare', found: true, value: '200', was: '200' }, { key: 'L1/version', found: false, reason: 'no-file' }];
  const planted = (/** @type {any[]} */ recs) => { const i = recs.findIndex((r) => r.type === 'plan-accepted'); return [...recs.slice(0, i), { type: 'place-rules', rows }, ...recs.slice(i)]; };
  const w = realWorld({ fixture: 'audit-checks-mwenvde5', id: 'mwenvde5', job: 'j', mutate: planted });
  const lines = ['price: 166 (was 160)', 'fare: 200', 'version: not found (the input could not be read)'];
  assert.deepEqual(getRunDetail('mwenvde5', w.opts).placeRules, lines);
  // the reader holds the same lines (the view calls src/placerule.js placeRuleLines on the whole spine; checksOf.placeRules is that same call)
  assert.deepEqual(checksOf(planted(spineAt('audit-checks-mwenvde5/u-mwenvde5.jsonl')), null)?.placeRules, lines);
  assert.equal(getRunDetail('mwenvde5', realWorld({ fixture: 'audit-checks-mwenvde5', id: 'mwenvde5', job: 'j' }).opts).placeRules, null);
});
