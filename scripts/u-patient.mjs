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
import { rmSync, existsSync } from 'node:fs';
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
