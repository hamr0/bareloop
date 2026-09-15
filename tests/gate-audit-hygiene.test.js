// F186 — the printed BEHAVIOUR line (and any replay of an archived run)
// counted tool calls from EVERY prior run that ever touched the patient
// tree, not just the run being read, because the scout's gate audit
// (`src/authorscout.js`'s `defaultSurveyor`) writes the arbiter's own book
// directly into the patient tree at its root, and the tree's `.gitignore`
// denies `*.jsonl` so a cold `git clean -fd` never removes it — it
// accretes rows from every run_id that has ever touched the tree.
//
// Two halves, fixed at the SOURCE (never by filtering `runBehaviour` on
// `run_id` — a single run legitimately spans several run_ids, so that
// would be the wrong fix):
//
//   (a) scripts/run-author.mjs archives ITS OWN gate audit out of the tree
//       the moment authoring ends, on every exit path that could have run
//       the scout — pinned from source below (no provider seam to drive
//       it live in this suite, same idiom tests/close-timeout.test.js and
//       tests/judge-key-demand.test.js already use for run-author/run-u
//       internals with no export surface).
//
//   (b) scripts/run-u.mjs moves any STALE audit aside at launch, right
//       after coldReset and before this run's own Gate ever opens, through
//       the newly-exported `moveStaleGateAudit` (scripts/u-patient.mjs,
//       beside the existing shared `coldReset`) — driven directly against
//       a real tmpdir here, no provider needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveStaleGateAudit } from '../scripts/u-patient.mjs';

const RUN_AUTHOR_SRC = readFileSync(new URL('../scripts/run-author.mjs', import.meta.url), 'utf8');
const RUN_U_SRC = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');

// ── (b) moveStaleGateAudit — driven directly, real tmpdir, no provider ─────

function makeTree(t) {
  const wd = mkdtempSync(join(tmpdir(), 'gate-audit-hygiene-'));
  const spineDir = mkdtempSync(join(tmpdir(), 'gate-audit-hygiene-spine-'));
  t.after(() => { rmSync(wd, { recursive: true, force: true }); rmSync(spineDir, { recursive: true, force: true }); });
  return { wd, spineDir };
}

test('moveStaleGateAudit moves a pre-existing gate-audit.jsonl out of the tree, and returns its new path', (t) => {
  const { wd, spineDir } = makeTree(t);
  writeFileSync(join(wd, 'gate-audit.jsonl'), '{"run_id":"stranger","action":"shell_read"}\n');
  const moved = moveStaleGateAudit(wd, spineDir, 'abc123');
  assert.equal(moved, join(spineDir, 'pre-abc123-gate-audit.jsonl'));
  assert.equal(existsSync(join(wd, 'gate-audit.jsonl')), false, 'the tree no longer carries it');
  assert.equal(existsSync(moved), true, 'it landed at the returned path');
  assert.match(readFileSync(moved, 'utf8'), /stranger/, 'the CONTENT travelled, not just a fresh empty file');
});

test('moveStaleGateAudit is a no-op (returns null, moves nothing) when the tree carries no audit', (t) => {
  const { wd, spineDir } = makeTree(t);
  const moved = moveStaleGateAudit(wd, spineDir, 'abc123');
  assert.equal(moved, null);
  assert.equal(existsSync(join(spineDir, 'pre-abc123-gate-audit.jsonl')), false);
});

test('a run\'s OWN audit, written AFTER moveStaleGateAudit ran, is excluded from what got moved aside', (t) => {
  const { wd, spineDir } = makeTree(t);
  // nothing stale present — first call moves nothing
  assert.equal(moveStaleGateAudit(wd, spineDir, 'run1'), null);
  // THIS run writes its own audit, the way its real Gate would
  writeFileSync(join(wd, 'gate-audit.jsonl'), '{"run_id":"run1","action":"edit"}\n');
  // the end-of-run rename (run-u.mjs's own, mirrored here) claims it as run1's
  assert.equal(existsSync(join(spineDir, 'pre-run1-gate-audit.jsonl')), false, 'nothing was staged aside — run1 wrote its own file cleanly');
  const content = readFileSync(join(wd, 'gate-audit.jsonl'), 'utf8');
  assert.match(content, /"run_id":"run1"/);
  assert.doesNotMatch(content, /stranger/);
});

// ── (a) run-author.mjs — pinned from source, no provider seam to drive live ─

test('run-author.mjs defines an idempotent archiveGateAudit() that renames the tree\'s audit into OUT, named after this run', () => {
  assert.match(RUN_AUTHOR_SRC, /const archiveGateAudit = \(\) => \{/, 'the helper exists');
  assert.match(RUN_AUTHOR_SRC, /if \(gateAuditArchived\) return;/, 'idempotent — safe to call from more than one exit path');
  assert.match(RUN_AUTHOR_SRC, /renameSync\(treeAudit, archived\)/, 'it actually moves the file, not copies it');
  assert.match(RUN_AUTHOR_SRC, /`author-\$\{runid\}-\$\{GATE_AUDIT_FILE\}`/, 'archived under THIS run\'s own id, in OUT — never left ambiguous between runs');
});

test('run-author.mjs calls archiveGateAudit() from the finally block (every ordinary exit path AND the crash catch)', () => {
  const finallyBlock = /\} finally \{[\s\S]*?\n\}/.exec(RUN_AUTHOR_SRC)?.[0];
  assert.ok(finallyBlock, 'the finally block moved — this guard no longer reads the block it pins');
  assert.match(finallyBlock, /archiveGateAudit\(\);/, 'the finally block, reached by every ordinary exit AND the crash catch above it, archives the audit');
});

test('run-author.mjs also calls archiveGateAudit() before the judge-key process.exit(2) — the one path that bypasses finally', () => {
  const judgeKeyBlock = /if \(judgeKeyProblem\) \{[\s\S]*?process\.exit\(2\);\s*\n\s*\}/.exec(RUN_AUTHOR_SRC)?.[0];
  assert.ok(judgeKeyBlock, 'the judge-key refusal block moved — this guard no longer reads the block it pins');
  assert.match(judgeKeyBlock, /archiveGateAudit\(\);/, 'process.exit() skips finally entirely, so this path must call it explicitly');
});

// ── (b) run-u.mjs — pinned from source (a real launch needs a provider) ────

test('run-u.mjs calls moveStaleGateAudit AFTER coldReset, only on the cold (non-resume) branch', () => {
  const coldBranch = /\} else \{[\s\S]*?const cold = coldReset\(wd, SEED\);[\s\S]*?\n\}/.exec(RUN_U_SRC)?.[0];
  assert.ok(coldBranch, 'the cold-reset else-branch moved — this guard no longer reads the branch it pins');
  assert.match(coldBranch, /moveStaleGateAudit\(wd, spineDir, runid\)/, 'called with this run\'s own wd/spineDir/runid');
  // and it must run strictly AFTER coldReset within that branch, not before
  const coldIdx = coldBranch.indexOf('coldReset(wd, SEED)');
  const moveIdx = coldBranch.indexOf('moveStaleGateAudit(');
  assert.ok(coldIdx >= 0 && moveIdx > coldIdx, 'moveStaleGateAudit must run AFTER coldReset, never before');
});

test('run-u.mjs never calls moveStaleGateAudit on the resume (dead) branch — a resumed run\'s own prior-leg audit must be left alone', () => {
  const resumeBranch = /if \(dead\) \{[\s\S]*?\n\} else \{/.exec(RUN_U_SRC)?.[0];
  assert.ok(resumeBranch, 'the resume branch moved — this guard no longer reads the branch it pins');
  assert.doesNotMatch(resumeBranch, /moveStaleGateAudit/, 'a resume\'s own halted-run audit is a continuation, not a stranger — never moved aside');
});

test('run-u.mjs never adds a run_id filter to runBehaviour — the fix is at the SOURCE of the audit file, never a narrower read of it', () => {
  assert.doesNotMatch(RUN_U_SRC, /runBehaviour\([^)]*run_?[Ii]d/, 'runBehaviour must stay called with the whole (now correctly-scoped) audit, no id filter bolted on');
});
