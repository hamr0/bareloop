#!/usr/bin/env node
// PRD build-list item 5 (TODO #8), Q9 answered (hamr, 2026-08-25): "a check".
// A commit that changes a prompt register (src/promptregisters.js's
// PROMPT_REGISTERS — the model-facing system/strategy/instruction strings a
// worker or judge reads) must say, in its own message, three things:
//   Failure:   what failure caused the change
//   Addresses: what it addresses
//   Corrects:  what it corrects
// Convention-only was rejected — doctrine already on record is "a frozen rule
// without a wired detector is prose" (docs/product/2026-08-23-agreed-build-list.md
// :187-189). Enforcement is LOCAL ONLY, wired into `npm test` (package.json's
// `test` script) rather than any `.github/workflows/*` file — CI already runs
// `npm test`, so the rule is enforced there without an ask-first CI edit.
//
// Two modes, both read-only (never edits anything, never writes a file, never
// touches git state beyond the read commands below):
//
//   --range <rev-range>       validate every commit in the range that touches
//                              a prompt-register file, e.g. `origin/main..HEAD`.
//                              An unresolvable range (no such ref — a fresh
//                              clone with no `origin`, a detached checkout
//                              that never fetched) is a SKIP, not a violation:
//                              there is no baseline to compare against.
//
//   --message-file <path>     validate one message (e.g. `.git/COMMIT_EDITMSG`
//                              from a `commit-msg` hook) against the files
//                              currently staged (`git diff --cached`).
//
// Exits non-zero (via `process.exitCode`, never `process.exit()`, so any
// already-queued stdout survives) and lists every offending commit + its
// missing labels on a violation; exits 0 with a one-line summary otherwise.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isPromptFile } from '../src/promptregisters.js';
import { evaluateCommits, PROMPT_COMMIT_LABELS } from './promptcommitlib.mjs';

/** @param {string[]} args @returns {string} */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** @param {string[]} argv @returns {{range?: string, messageFile?: string}} */
function parseArgs(argv) {
  const out = /** @type {{range?: string, messageFile?: string}} */ ({});
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--range') out.range = argv[i += 1];
    else if (argv[i] === '--message-file') out.messageFile = argv[i += 1];
  }
  return out;
}

/**
 * Load every commit in `range` as a `PromptCommitInput`. A range git cannot
 * resolve (unknown ref on either side) is reported as a SKIP, never a red —
 * a missing baseline is not a rule violation.
 * @param {string} range
 * @returns {{skipped: true, reason: string} | {skipped: false, commits: import('./promptcommitlib.mjs').PromptCommitInput[]}}
 */
function loadRangeCommits(range) {
  let shas;
  try {
    shas = git(['rev-list', range]).trim();
  } catch (err) {
    const e = /** @type {{stderr?: Buffer, message?: string}} */ (err);
    const detail = e.stderr ? String(e.stderr).trim().split('\n')[0] : String(e.message ?? err).split('\n')[0];
    return { skipped: true, reason: `range "${range}" could not be resolved (${detail})` };
  }
  if (shas === '') return { skipped: false, commits: [] };
  const commits = shas.split('\n').map((sha) => {
    const message = git(['show', '-s', '--format=%B', sha]);
    const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean);
    return { sha, message, files };
  });
  return { skipped: false, commits };
}

/** @param {string} messageFile @returns {import('./promptcommitlib.mjs').PromptCommitInput} */
function loadStagedCommit(messageFile) {
  const message = readFileSync(messageFile, 'utf8');
  const files = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  return { sha: '(staged)', message, files };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.range && !args.messageFile) {
    console.error('usage: prompt-commit-check.mjs --range <rev-range> | --message-file <path>');
    process.exitCode = 2;
    return;
  }

  /** @type {import('./promptcommitlib.mjs').PromptCommitInput[]} */
  let commits;
  if (args.range) {
    const loaded = loadRangeCommits(args.range);
    if (loaded.skipped) {
      console.log(`prompt-commit-check: SKIPPED — ${loaded.reason}; no baseline to compare, not a violation.`);
      process.exitCode = 0;
      return;
    }
    commits = loaded.commits;
  } else {
    commits = [loadStagedCommit(/** @type {string} */ (args.messageFile))];
  }

  const { ok, offenders } = evaluateCommits(commits, isPromptFile);

  if (ok) {
    console.log(`prompt-commit-check: OK — ${commits.length} commit(s) checked, 0 touching a prompt register with a missing label.`);
    process.exitCode = 0;
    return;
  }

  console.error('prompt-commit-check: FAILED — these commits change a prompt register but are missing required message labels:');
  for (const offender of offenders) {
    console.error(`  ${offender.sha}: missing ${offender.missing.join(', ')} (required: ${PROMPT_COMMIT_LABELS.join(', ')})`);
  }
  process.exitCode = 1;
}

main();
