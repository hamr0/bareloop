// A resumed already-green run's Result tab reads like a green run's (live bug, run mwvwcxvy: passed, Stop in a leftover step, Resume -> the close
// precheck passed -> `already-green` -> an empty Result tab). The REAL archived spine of that run (tests/fixtures/already-green-result), laid out like a
// panel-authored run in a scratch dir with an injected scratch HOME. The already-green leg writes no `check-run`; its stages' verdicts and rows live on
// the `close-precheck` / `review-door` records, so that is what the tab reads.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { appendRun } from '../src/runlist.js';
import { getRunResult, checksLineOf } from '../src/panel/server.js';
import { track } from './tmp-track.mjs';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'already-green-result');

function world() {
  const runid = 'mwvwcxvy';
  const root = track(mkdtempSync(join(tmpdir(), 'ag-result-')));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session-ag');
  const into = join(out, 'source-seed');
  const dir = join(into, 'long-walk-bareloop');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'repo', source: '/x', destination: 'docs/' }));
  copyFileSync(join(FX, 'mwvwcxvy.resolved-spec.json'), join(out, 'resolved-spec.json'));
  const spine = join(dir, `u-${runid}.jsonl`);
  copyFileSync(join(FX, `u-${runid}.jsonl`), spine);
  appendRun({ at: '2026-11-25T09:03:30.000Z', runid, job: 'long-walk', spine, patient: null, via: 'run-u' }, { home });
  return { home, runid };
}

test('a resumed already-green review run: every check row of its Result tab reads passed and no "gap" is shown', () => {
  const w = world();
  const r = getRunResult(w.runid, { home: w.home });
  assert.ok(r, 'the run has a Result tab');
  assert.ok(r.lines.length >= 1);
  for (const l of r.lines) {
    assert.equal(l.passed, true, `line ${l.n} passed`);
    assert.ok(l.checkRows.length >= 1, 'the line shows its rows');
    assert.deepEqual(l.checkRows.map((x) => x.result), l.checkRows.map(() => 'passed'), `line ${l.n} rows`);
  }
  assert.equal(r.gap, null, 'a passed run states no gap');
});

// Audit's checks read through the same owner as the Result tab (finalCloseRecordOf): a resumed already-green leg's checks are ITS OWN close-precheck's,
// never an earlier leg's staged close. The real spine's leg 1 closes without a staged record, so one is added to it (a leg-1 staged `close-verdict` with a red stage,
// placed before `leg-resume`) to make the earlier leg's close readable; the resumed leg's real close-precheck (2 stages, both satisfied) must still win.
test('Audit checks of a resumed already-green run come from the resumed leg\'s close-precheck, not an earlier leg\'s close-verdict', () => {
  const records = readFileSync(join(FX, 'u-mwvwcxvy.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spec = JSON.parse(readFileSync(join(FX, 'mwvwcxvy.resolved-spec.json'), 'utf8'));
  const at = records.findIndex((r) => r.type === 'leg-resume');
  assert.ok(at > 0);
  const early = { type: 'close-verdict', iteration: 1, verdict: 'needs_revision', stages: [{ name: 'changed-from-seed', verdict: 'needs_revision', rows: [{ key: 'J.$guard.changed-from-seed', result: 'failed' }] }] };
  const withEarly = [...records.slice(0, at), early, ...records.slice(at)];
  assert.equal(checksLineOf(withEarly, spec), '2 run · 2 passed · 0 failed', 'the resumed leg\'s own close-precheck, not leg 1\'s red close');
});
