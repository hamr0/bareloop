// live run mwg3pov1: a run whose close was red once, then went green in the fix loop. The Audit's check list must read the run's FINAL close (the fix loop's last
// staged `close-verdict`), not the one `outer-close` precheck emitted before the loop. The fixture is that real run (spine, signed spec, draft log, gate audit; paths masked).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const FIX = fileURLToPath(new URL('./fixtures/audit-checks-fixloop-mwg3pov1/', import.meta.url));
/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** @param {(recs: any[]) => any[]} [mutate] */
function runHome(mutate = (recs) => recs) {
  const home = mkdtempSync(join(tmpdir(), 'audit-fixloop-'));
  dirs.push(home);
  const sess = join(home, 'panel-sessions', 'smwg3la83gmq5');
  const dir = join(sess, 'source-seed', 'changelog-recent-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, 'resolved-spec.json'), join(sess, 'resolved-spec.json'));
  copyFileSync(join(FIX, 'draft-log.jsonl'), join(sess, 'draft-log.jsonl'));
  copyFileSync(join(FIX, 'u-mwg3pov1-gate-audit.jsonl'), join(dir, 'u-mwg3pov1-gate-audit.jsonl'));
  const recs = readFileSync(join(FIX, 'u-mwg3pov1.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spine = join(dir, 'u-mwg3pov1.jsonl');
  writeFileSync(spine, `${mutate(recs).map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at: '2026-11-14T07:45:41.000Z', runid: 'mwg3pov1', job: 'changelog-recent', spine, patient: null, via: 'run-u', pid: 999999, capUsd: 0.5 }, { home });
  return home;
}

test('a run green after the fix loop shows no failed check in the Audit list (real run mwg3pov1)', () => {
  const ac = getRunDetail('mwg3pov1', { home: runHome() }).auditChecks;
  assert.ok(ac);
  const rows = [...ac.checks, ...ac.always];
  assert.ok(rows.length > 0);
  assert.deepEqual(rows.filter((r) => r.result === 'failed').map((r) => r.text), []);
});

test('the same run with its fix loop cut off still reads the precheck close: line 2 failed', () => {
  const ac = getRunDetail('mwg3pov1', { home: runHome((recs) => recs.filter((r) => !(r.type === 'close-verdict' && Array.isArray(r.stages)))) }).auditChecks;
  assert.ok([...ac.checks, ...ac.always].some((r) => r.result === 'failed'));
});

test('a stage the latest close never reached reads "not reached" (grey, uncounted), never the precheck result; the fold counts it apart (real run mvy0cx24 shape)', () => {
  // the precheck lists all three stages (line-2 red); the fix loop's latest close stops at line-1 red, so line-2 was not reached
  const ac = getRunDetail('mwg3pov1', { home: runHome((recs) => {
    const last = recs.findLastIndex((r) => r.type === 'close-verdict' && Array.isArray(r.stages));
    return recs.map((r, i) => (i === last ? { ...r, verdict: 'needs_revision', stages: [{ name: 'changed-from-seed', verdict: 'satisfied' }, { name: 'line-1', verdict: 'needs_revision' }] } : r));
  }) }).auditChecks;
  const rows = [...ac.checks, ...ac.always];
  const l2 = rows.filter((r) => /^line 2/.test(r.text));
  assert.ok(l2.length > 0 && l2.every((r) => r.result === 'not-reached' && r.word === 'not reached'), JSON.stringify(l2));
  assert.ok(rows.some((r) => r.result === 'failed' && /^line 1/.test(r.text)));
});
