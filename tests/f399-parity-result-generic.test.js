// F399 parity pins, Result tab (generic jobs: D change, D review) (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Result tab (generic)").
// Fixtures: trimmed REAL spines (tests/fixtures/result-tab: mvkj03w7 green with numbers, mvy0cx24 red first stage; f399/mwtf8p8s a repo job with the one list).
// mwtf8p8s ended close-red (no final close), so the one-list rows and the fence row are read on that real spine plus ONE planted final close (said in the test).
// Expected values are the records' own fields by a plain scan (tests/f399-raw.mjs), never read back through a reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunResult } from '../src/panel/server.js';
import { makeResultWorld, makeRepoWithBranch, git } from './result-tab-world.mjs';
import { realWorld, spineAt, specAt, rawClose } from './f399-raw.mjs';

const RT = (/** @type {string} */ id) => ({ spine: spineAt(`result-tab/u-${id}.jsonl`), spec: specAt(`result-tab/${id}.resolved-spec.json`) });
const resultOf = (/** @type {string} */ id) => { const w = makeResultWorld([id]); return getRunResult(id, { home: w.home }); };

test('result-generic-checks-parity: "The checks" lists each stage of the final close with its pass/fail word, and the head counts them (real mvkj03w7 all pass, mvy0cx24 first stage fails)', () => {
  for (const id of ['mvkj03w7', 'mvy0cx24']) {
    const { spine, spec } = RT(id);
    const close = rawClose(spine);
    const declared = spec.closeDecl.stages.map((/** @type {any} */ s) => s.name);
    const passed = close.stages.filter((/** @type {any} */ s) => s.verdict === 'satisfied').length;
    const notReached = declared.length - close.stages.length;
    const c = resultOf(id).checks;
    assert.equal(c.head, `${passed} of ${close.stages.length} passed${notReached ? ` · ${notReached} not reached` : ''} · the close ran them after the worker stopped`);
    for (const s of close.stages) assert.equal(c.stages.find((/** @type {any} */ x) => x.name === s.name).status.word, s.verdict === 'satisfied' ? 'passed' : 'failed', `${id} ${s.name}`);
  }
  assert.equal(resultOf('mvkj03w7').checks.head, '7 of 7 passed · the close ran them after the worker stopped');
  assert.equal(resultOf('mvy0cx24').checks.head, '1 of 2 passed · 5 not reached · the close ran them after the worker stopped');
});

test('result-generic-numbers-parity: a stage keeps the record\'s own value, baseline and notes, and the signed direction (real mvkj03w7 and mvy0cx24)', () => {
  for (const id of ['mvkj03w7', 'mvy0cx24']) {
    const { spine } = RT(id);
    const close = rawClose(spine);
    const c = resultOf(id).checks;
    for (const s of close.stages) {
      const got = c.stages.find((/** @type {any} */ x) => x.name === s.name);
      assert.equal(got.value, typeof s.value === 'number' ? s.value : null, `${id} ${s.name} value`);
      assert.equal(got.baseline, typeof s.baseline === 'number' ? s.baseline : null, `${id} ${s.name} baseline`);
      assert.equal(got.notes, typeof s.notes === 'string' && s.notes !== '' ? s.notes : null, `${id} ${s.name} notes`);
    }
  }
  const t = resultOf('mvkj03w7').checks.stages.find((/** @type {any} */ x) => x.name === 'tests-kept');
  assert.deepEqual([t.value, t.baseline, t.direction], [67, 67, 'higher-is-better']);
  const e = resultOf('mvy0cx24').checks.stages.find((/** @type {any} */ x) => x.name === 'typecheck-target-zero-errors');
  assert.deepEqual([e.value, e.baseline, e.direction, e.passed], [1, 0, 'lower-is-better', false]);
});

test('result-generic-notreached-parity: the stages the signed close declares but the final close never ran read "not reached" (real mvy0cx24: the close stopped at its first red)', () => {
  const { spine, spec } = RT('mvy0cx24');
  const ran = new Set(rawClose(spine).stages.map((/** @type {any} */ s) => s.name));
  const want = spec.closeDecl.stages.map((/** @type {any} */ s) => s.name).filter((/** @type {string} */ n) => !ran.has(n));
  assert.equal(want.length, 5);
  const c = resultOf('mvy0cx24').checks;
  assert.deepEqual(c.stages.filter((/** @type {any} */ x) => x.notReached).map((/** @type {any} */ x) => x.name), want);
  assert.equal(c.notReached, 5);
  assert.ok(c.stages.filter((/** @type {any} */ x) => x.notReached).every((/** @type {any} */ x) => x.status.word === 'not reached'));
  assert.equal(resultOf('mvkj03w7').checks.notReached, 0);
});

test('result-generic-onelist-parity: a repo job\'s one list shows each row with its tag from the signed list, the $ fence row from the gate\'s record, a ~ row Not checked (real mwtf8p8s + one planted final close)', () => {
  const spec = specAt('f399/mwtf8p8s/resolved-spec.json');
  const names = spec.closeDecl.stages.map((/** @type {any} */ s) => s.name);
  /** @param {any[]} extra records added before the job-end */
  const plant = (extra) => (/** @type {any[]} */ rs) => {
    const i = rs.findLastIndex((r) => r.type === 'job-end');
    const close = { type: 'outer-close', verdict: 'satisfied', stages: names.map((/** @type {string} */ n) => ({ name: n, verdict: 'satisfied' })), declared: true };
    return [...rs.slice(0, i), close, ...extra, { ...rs[i], outcome: 'green' }, ...rs.slice(i + 1)];
  };
  const tagOf = { you: '~ [you]', agent: '! [agent]', default: '$ [default]' };
  const w = realWorld({ fixture: 'f399/mwtf8p8s', id: 'mwtf8p8s', job: 'walk-stop', mutate: plant([]) });
  const c = getRunResult('mwtf8p8s', w.opts).checks;
  // every signed list row that is built appears once, with the tag its `by` gives; the ~ row with no rule is Not checked
  for (const row of spec.closeDecl.list.filter((/** @type {any} */ x) => x.state === 'built')) {
    const st = c.stages.find((/** @type {any} */ x) => x.name === row.key);
    assert.ok(st, row.key);
    assert.ok(st.question.startsWith(tagOf[/** @type {'you'|'agent'|'default'} */ (row.by)]), `${row.key}: ${st.question}`);
  }
  const nc = c.stages.find((/** @type {any} */ x) => x.question.startsWith('~ [you]'));
  assert.deepEqual([nc.status.word, nc.notReached], ['not checked', true]);
  assert.equal(c.stages.find((/** @type {any} */ x) => x.name === 'J.$fence').status.word, "the gate's record for this run is missing");
  const held = realWorld({ fixture: 'f399/mwtf8p8s', id: 'mwtf8p8s', job: 'walk-stop', mutate: plant([{ type: 'fence', held: true, blocked: 2 }]) });
  const f = getRunResult('mwtf8p8s', held.opts).checks.stages.find((/** @type {any} */ x) => x.name === 'J.$fence');
  assert.deepEqual([f.status.word, f.passed], ['held · 2 writes blocked', true]);
});

test('result-fence-line-parity: the fence line says what the signed scope allowed and how many files the run wrote, from the edit records (real mvkj03w7, mvy0cx24; real mwtf8p8s wrote outside)', () => {
  for (const id of ['mvkj03w7', 'mvy0cx24']) {
    const paths = [...new Set(RT(id).spine.filter((/** @type {any} */ r) => r.type === 'attempt-diff').flatMap((/** @type {any} */ r) => r.files.map((/** @type {any} */ f) => f.path)))];
    assert.deepEqual(paths, ['src/checks.js']);
    assert.equal(resultOf(id).changed.scopeLine, 'only src/ was allowed; the run wrote 1 file, no other.');
  }
  const w = realWorld({ fixture: 'f399/mwtf8p8s', id: 'mwtf8p8s', job: 'walk-stop' });
  const wrote = spineAt('f399/mwtf8p8s/u-mwtf8p8s.jsonl').filter((r) => r.type === 'attempt-diff').flatMap((r) => r.files.map((/** @type {any} */ f) => f.path));
  assert.deepEqual([...new Set(wrote)], ['tests/codeversion.test.js']);
  assert.equal(getRunResult('mwtf8p8s', w.opts).changed.scopeLine, 'only tests/ was allowed, but the run wrote tests/codeversion.test.js.');
});

test('result-work-box-parity: the work box names the branch and made-from commit the run recorded, the final commit asked of git; no box once the branch is gone (real mvkj03w7 work-branch record)', () => {
  const rec = RT('mvkj03w7').spine.find((/** @type {any} */ r) => r.type === 'work-branch');
  const w = makeResultWorld(['mvkj03w7'], { repoFor: { mvkj03w7: true } });
  const repo = makeRepoWithBranch(w.root, rec.branch);
  const wk = getRunResult('mvkj03w7', { home: w.home }).work;
  assert.equal(wk.branch, rec.branch);
  assert.equal(wk.madeFrom, rec.base.slice(0, 7));
  assert.equal(wk.finalCommit, repo.final.slice(0, 7));
  assert.equal(wk.merge, `git merge ${rec.branch}`);
  assert.equal(wk.drop, `git branch -D ${rec.branch}`);
  git(repo.repo, 'branch', '-D', rec.branch);
  assert.equal(getRunResult('mvkj03w7', { home: w.home }).work, null);
});
