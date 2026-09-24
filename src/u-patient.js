// THE COLD RESET, in ONE place.
//
// `run-u.mjs` has always owned this: a cold run starts at the frozen seed with the
// `.litectx` store removed, because a run that inherits the previous run's edits — or
// the previous run's isolate-verb memory (stash/remember persist in the store) — is
// measuring the wrong thing. The reuse rung's OFF arm and every cold contrast depend
// on it.
//
// It moved here the day a BATTERY driver needed to rehearse it (the read-shim Phase 2
// battery's `--dry-run` has to prove the patient really does go cold between rows).
// The alternative was a second spelling of `git reset --hard` in the battery, and two
// spellings of "cold" is exactly how one driver's rows come to start from a different
// tree than the other's — the blind-instrument class, at the patient.
//
// Nothing here decides anything and nothing here is arbiter territory: it is the
// mechanical preparation of a tree, and both callers print what it did.
import { execFileSync } from 'node:child_process';
import {
  rmSync, existsSync, renameSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Reset a patient to its frozen seed and drop its `.litectx` store.
 *
 * @param {string} wd absolute path to the patient's tree (a git repo with >=1 commit)
 * @param {string} seed the frozen seed commit
 * @returns {{ head: string, storeRemoved: boolean }} `head` is the short sha the tree
 *   now stands at; `storeRemoved` says whether a store was actually there to remove
 *   (so a caller can print the truth rather than a claim).
 */
export function coldReset(wd, seed) {
  const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', wd, ...a], { encoding: 'utf8' }).trim();
  git(['reset', '--hard', seed]);
  git(['clean', '-fd']);
  const store = join(wd, '.litectx');
  const storeRemoved = existsSync(store);
  rmSync(store, { recursive: true, force: true });
  return { head: git(['rev-parse', '--short', 'HEAD']), storeRemoved };
}

/**
 * F186 — the patient's own `.gitignore` denies `*.jsonl`, so `coldReset`'s
 * `git clean -fd` (no `-x`) never removes a `gate-audit.jsonl` already
 * sitting at the tree root — it can only be there from an EARLIER run
 * against this same patient (an authoring scout, or a prior worker run)
 * that never got archived out. Left in place, THIS run's own Gate (which
 * writes to that same path) would append to it, and the end-of-run rename
 * that claims the whole file as "this run's own audit" would silently
 * carry every earlier run's rows too — a harness slicing a shared append-
 * only log has to account for every writer inside its window.
 *
 * Call this AFTER `coldReset` and BEFORE this run's own Gate ever opens: at
 * that point a `gate-audit.jsonl` sitting in the tree is provably not this
 * run's, because coldReset just proved the tree is unable to have produced
 * one since the seed reset. NOT for a resume — a halted run's own gate
 * audit already in the tree it resumes into is that SAME run's prior leg,
 * not a stranger's; callers on the resume path must not call this.
 *
 * @param {string} wd absolute path to the patient's tree, just cold-reset
 * @param {string} spineDir absolute path to this run's spine directory
 * @param {string} runid this run's own id (the same one every other spine
 *   file for this run is named after)
 * @returns {string|null} the path the stale file was moved to, or `null`
 *   when there was nothing to move
 */
export function moveStaleGateAudit(wd, spineDir, runid) {
  const staleAudit = join(wd, 'gate-audit.jsonl');
  if (!existsSync(staleAudit)) return null;
  const preFile = join(spineDir, `pre-${runid}-gate-audit.jsonl`);
  renameSync(staleAudit, preFile);
  return preFile;
}
