// prompt-commit-check exit criteria (PRD build-list item 5 / TODO #8, Q9
// answered 2026-08-25: "a check"). Exercises the PURE decision path
// (`scripts/promptcommitlib.mjs`) with inputs constructed in-process — no
// tmp git repo, no shelling out to git, and consequently no tmp dir to clean
// up: every case here passes commits/messages straight in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommitMessage, evaluateCommits, PROMPT_COMMIT_LABELS, FAILURE_NEEDS_RUN_REF } from '../scripts/promptcommitlib.mjs';
import { isPromptFile, PROMPT_REGISTERS } from '../src/promptregisters.js';

// 'mszcthk1' is a REAL archived run id (bareloop.context.md's own replayRun
// example), used here rather than an invented one.
const COMPLIANT = 'fix: tighten PERSONA_TOOLS\n\n'
  + 'Failure: run mszcthk1 — worker read the arbiter spine after being told it was denied\n'
  + 'Addresses: PERSONA_TOOLS did not name the spine file explicitly\n'
  + 'Corrects: spells the denied paths from ARBITER_BOOK_STORES\n';

test('PROMPT_REGISTERS inventory is non-empty and isPromptFile matches every entry', () => {
  assert.ok(PROMPT_REGISTERS.length > 0);
  for (const { file } of PROMPT_REGISTERS) {
    assert.equal(isPromptFile(file), true, `expected isPromptFile to match ${file}`);
  }
  assert.equal(isPromptFile('src/plan.js'), false);
  assert.equal(isPromptFile(''), false);
  assert.equal(isPromptFile(/** @type {any} */ (null)), false);
});

test('isPromptFile matches an absolute path ending in a registered file', () => {
  assert.equal(isPromptFile('/home/x/bareloop/src/tools.js'), true);
  assert.equal(isPromptFile('./src/readshim.js'), true);
});

test('validateCommitMessage: a compliant message passes with no missing labels', () => {
  const { ok, missing } = validateCommitMessage(COMPLIANT);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

for (const label of PROMPT_COMMIT_LABELS) {
  test(`validateCommitMessage: message missing ${label} fails and names it`, () => {
    const withoutLabel = COMPLIANT.split('\n').filter((line) => !line.toLowerCase().startsWith(`${label.toLowerCase()}:`)).join('\n');
    const { ok, missing } = validateCommitMessage(withoutLabel);
    assert.equal(ok, false);
    assert.deepEqual(missing, [label]);
  });

  test(`validateCommitMessage: ${label} present but empty fails and names it`, () => {
    const emptied = COMPLIANT.split('\n').map((line) => (line.toLowerCase().startsWith(`${label.toLowerCase()}:`) ? `${label}:` : line)).join('\n');
    const { ok, missing } = validateCommitMessage(emptied);
    assert.equal(ok, false);
    assert.deepEqual(missing, [label]);
  });
}

test('validateCommitMessage: label matching is case-insensitive at line start', () => {
  const lowered = COMPLIANT.replace('Failure:', 'failure:').replace('Addresses:', 'ADDRESSES:').replace('Corrects:', 'CoRrEcTs:');
  const { ok, missing } = validateCommitMessage(lowered);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: message missing all three labels fails and names all three', () => {
  const { ok, missing } = validateCommitMessage('fix: tighten PERSONA_TOOLS\n\nno labels here at all\n');
  assert.equal(ok, false);
  assert.deepEqual(missing, [...PROMPT_COMMIT_LABELS]);
});

test('validateCommitMessage: Failure present but no run ref fails with FAILURE_NEEDS_RUN_REF, other labels unaffected', () => {
  const noRunRef = COMPLIANT.replace('Failure: run mszcthk1 — worker read the arbiter spine after being told it was denied', 'Failure: worker read the arbiter spine after being told it was denied');
  const { ok, missing } = validateCommitMessage(noRunRef);
  assert.equal(ok, false);
  assert.deepEqual(missing, [FAILURE_NEEDS_RUN_REF]);
});

test('validateCommitMessage: "run u-<id>" form passes', () => {
  const withPrefixed = COMPLIANT.replace('run mszcthk1', 'run u-mszcthk1');
  const { ok, missing } = validateCommitMessage(withPrefixed);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: "run <id>" form (no u- prefix) passes', () => {
  const { ok, missing } = validateCommitMessage(COMPLIANT);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: two run refs cited on the Failure line both pass', () => {
  const twoRuns = COMPLIANT.replace('Failure: run mszcthk1 — ', 'Failure: run mszcthk1 and run u-mszcfaof — ');
  const { ok, missing } = validateCommitMessage(twoRuns);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: run-ref matching is case-insensitive on the "run" keyword', () => {
  const upperRun = COMPLIANT.replace('Failure: run mszcthk1', 'Failure: RUN mszcthk1');
  const { ok, missing } = validateCommitMessage(upperRun);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('evaluateCommits: a commit touching no prompt file passes regardless of message', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'abc123', message: 'no labels, does not matter', files: ['src/plan.js', 'README.md'] }],
    isPromptFile,
  );
  assert.equal(ok, true);
  assert.deepEqual(offenders, []);
});

test('evaluateCommits: a commit touching a prompt file with a compliant message passes', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'def456', message: COMPLIANT, files: ['src/tools.js'] }],
    isPromptFile,
  );
  assert.equal(ok, true);
  assert.deepEqual(offenders, []);
});

test('evaluateCommits: a commit touching a prompt file with a non-compliant message fails and names the sha + missing labels', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'ghi789', message: 'no labels here', files: ['src/readshim.js'] }],
    isPromptFile,
  );
  assert.equal(ok, false);
  assert.deepEqual(offenders, [{ sha: 'ghi789', missing: [...PROMPT_COMMIT_LABELS] }]);
});

test('evaluateCommits: multiple commits in a range, mixed compliance', () => {
  const commits = [
    { sha: 'a1', message: 'unrelated change', files: ['README.md'] },
    { sha: 'a2', message: COMPLIANT, files: ['src/authorflow.js'] },
    // 'x' after Failure: has no run ref, on top of the pre-existing missing Addresses
    { sha: 'a3', message: 'Failure: x\nAddresses:\nCorrects: z', files: ['src/judged.js'] },
    { sha: 'a4', message: 'touches two prompt files, no labels', files: ['src/tools.js', 'src/planrun.js'] },
  ];
  const { ok, offenders } = evaluateCommits(commits, isPromptFile);
  assert.equal(ok, false);
  assert.deepEqual(offenders, [
    { sha: 'a3', missing: ['Addresses', FAILURE_NEEDS_RUN_REF] },
    { sha: 'a4', missing: [...PROMPT_COMMIT_LABELS] },
  ]);
});
