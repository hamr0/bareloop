#!/usr/bin/env node
// PRD build-list item 5 (TODO #8), Q9 answered (hamr, 2026-08-25): "a check".
// A commit that changes a prompt register (src/promptregisters.js's
// PROMPT_REGISTERS — the model-facing system/strategy/instruction strings a
// worker or judge reads) must say, in its own message, three things:
//   Failure:   what failure caused the change — AND which run caused it
//              (hamr's addition, 2026-08-25): the line must cite a run,
//              `run <id>` or `run u-<id>` (case-insensitive, multiple refs
//              fine) — FORMAT ONLY, never verified against a real spine file
//              (the patient lives outside this repo, unreachable from here).
//   Addresses: what it addresses
//   Corrects:  what it corrects
// Convention-only was rejected — doctrine already on record is "a frozen rule
// without a wired detector is prose" (docs/product/2026-08-23-agreed-build-list.md
// :187-189). Enforcement is wired into `npm test` (package.json's `test`
// script); CI runs `npm test` and (since #2b, below) only adds the env var
// that names the real pre-push range.
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
// #2b (2026-08-27, hamr's word, CI edit approved): when the env var
// `PROMPT_COMMIT_RANGE` is set (CI's `.github/workflows/ci.yml` sets it to
// `github.event.before..github.sha` on push events), it is used INSTEAD of
// `--range` and needs no HEAD~1 fallback — `github.event.before` is the real
// pre-push tip, so the range already covers every commit of a linear
// multi-commit direct push, not just the last one. If it fails to resolve
// (e.g. `github.event.before` is 40 zeros on a brand-new branch push), that
// is reported and the run falls back to the `--range` arg's own path
// (including its existing `loadRangeWithMainPushFallback` HEAD~1 fallback,
// which remains the ONLY coverage for local runs with no env var set).
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

/** @param {string} ref @returns {string|null} */
function resolveShaQuiet(ref) {
  try {
    return git(['rev-parse', ref]).trim();
  } catch {
    return null;
  }
}

// PR #23 review item 7 (2026-08-26): `origin/main..HEAD` resolves to ZERO
// commits the instant a routine change pushes DIRECT to main (this repo's
// own norm — see .claude/remember/MEMORY.md's "Push direct to main"), because
// `origin/main` catches up to local `HEAD` on that same push — the range the
// prompt-commit rule was built to inspect ends up inspecting NOTHING there,
// silently, on exactly the workflow this repo actually uses most. Detected
// ONLY by the narrow, measured condition — a zero-commit range AND
// `HEAD === origin/main` (never just "zero commits", which can also mean a
// legitimate empty range for other reasons) — and it falls back to
// `HEAD~1..HEAD`, the commit(s) that just landed, PRINTING that it did rather
// than silently substituting a different range. This is a PARTIAL fix,
// stated as such: on a MERGE commit, `HEAD~1` is the first parent, so
// `HEAD~1..HEAD` covers the merge commit itself PLUS every commit unique to
// the merged-in branch (measured on a real merge in this repo's own history,
// 4904d76: `git rev-list 4904d76~1..4904d76` lists 10 commits, not 1) — but
// on a LINEAR multi-commit direct push (`git push` after several local
// commits, no merge involved) it still only re-covers the LAST one. Full
// coverage of that linear case needs the actual pre-push range — #2b
// (2026-08-27, hamr's word) supplies it in CI via `PROMPT_COMMIT_RANGE`
// (`github.event.before..sha`, see `main()`), so this HEAD~1 fallback is now
// the LOCAL/no-env-var path only; CI always has the env var set on push
// events and never reaches this function's fallback branch there.
/**
 * @param {string} range the originally requested range (only used for the
 *   printed message — the fallback range itself is always `HEAD~1..HEAD`)
 * @returns {{skipped: true, reason: string} | {skipped: false, commits: import('./promptcommitlib.mjs').PromptCommitInput[]}}
 */
function loadRangeWithMainPushFallback(range) {
  const loaded = loadRangeCommits(range);
  if (loaded.skipped || loaded.commits.length > 0) return loaded;

  const headSha = resolveShaQuiet('HEAD');
  const originMainSha = resolveShaQuiet('origin/main');
  if (headSha === null || originMainSha === null || headSha !== originMainSha) return loaded;

  const fallback = loadRangeCommits('HEAD~1..HEAD');
  console.log(`prompt-commit-check: range ${range} is empty at main — checked HEAD~1..HEAD instead; `
    + 'on a merge commit this covers the merge and every commit it brought in; on a linear multi-commit '
    + 'direct push only the last commit — CI covers that case via PROMPT_COMMIT_RANGE (#2b).');
  return fallback;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.range && !args.messageFile) {
    console.error('usage: prompt-commit-check.mjs --range <rev-range> | --message-file <path>');
    process.exitCode = 2;
    return;
  }

  // Security (release-gate finding, 2026-08-27): `git rev-list` takes the
  // range positionally with no way to disambiguate it from an option — unlike
  // `show`/`diff-tree` below, `rev-list -- <range>` does NOT work (verified
  // against a real repo: `--` makes rev-list treat everything after it as a
  // PATH filter, not a revision range, and it errors out with a usage
  // message instead of resolving anything). So a `--range` value that starts
  // with `-` (e.g. `--output=<path>`) would otherwise be parsed by git as an
  // option of its own. Reject it up front, before any git call runs.
  if (args.range !== undefined && args.range.startsWith('-')) {
    console.error(`prompt-commit-check: --range value "${args.range}" looks like an option (starts with "-"), `
      + 'not a rev-range — refusing to pass it to git. Use a real range, e.g. "origin/main..HEAD".');
    process.exitCode = 2;
    return;
  }

  // #2b (2026-08-27, hamr's word): CI supplies the real pre-push range via
  // PROMPT_COMMIT_RANGE, which supersedes --range when present and needs no
  // HEAD~1 fallback of its own. Same option-shaped-value guard as --range.
  // Honoured in --range mode ONLY — a commit-msg hook (--message-file) must
  // never be redirected by a stray env var.
  const envRange = args.range ? process.env.PROMPT_COMMIT_RANGE : undefined;
  if (envRange && envRange.startsWith('-')) {
    console.error(`prompt-commit-check: PROMPT_COMMIT_RANGE value "${envRange}" looks like an option (starts with "-"), `
      + 'not a rev-range — refusing to pass it to git.');
    process.exitCode = 2;
    return;
  }

  /** @type {import('./promptcommitlib.mjs').PromptCommitInput[]} */
  let commits;
  if (envRange) {
    const loaded = loadRangeCommits(envRange);
    if (!loaded.skipped) {
      console.log(`prompt-commit-check: using PROMPT_COMMIT_RANGE=${envRange}`);
      commits = loaded.commits;
    } else {
      console.log(`prompt-commit-check: PROMPT_COMMIT_RANGE=${envRange} could not be resolved (${loaded.reason}); `
        + `falling back to the --range arg (${args.range}).`);
      const fallback = loadRangeWithMainPushFallback(/** @type {string} */ (args.range));
      if (fallback.skipped) {
        console.log(`prompt-commit-check: SKIPPED — ${fallback.reason}; no baseline to compare, not a violation.`);
        process.exitCode = 0;
        return;
      }
      commits = fallback.commits;
    }
  } else if (args.range) {
    const loaded = loadRangeWithMainPushFallback(args.range);
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
    console.log(`prompt-commit-check: OK — ${commits.length} commit(s) checked, 0 touching a prompt register with a missing/incomplete label.`);
    process.exitCode = 0;
    return;
  }

  console.error(`prompt-commit-check: FAILED — these commits change a prompt register but their message does not satisfy the rule `
    + `(non-empty ${PROMPT_COMMIT_LABELS.join(', ')} labels; Failure: must also cite the run that caused it, e.g. "run mszcthk1"):`);
  for (const offender of offenders) {
    console.error(`  ${offender.sha}: ${offender.missing.map((m) => (PROMPT_COMMIT_LABELS.includes(m) ? `missing ${m}` : m)).join('; ')}`);
  }
  process.exitCode = 1;
}

main();
