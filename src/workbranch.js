// THE WORK BRANCH — runner mechanics, arbiter side. PRD Addendum v1.57 §3,
// hamr's ruling verbatim:
//
//   "The agent creates a NEW BRANCH before it touches any code — a HARD RULE, no
//    exceptions. Not a default, not a preference: no job edits the branch it was
//    handed, and none edits `main`. Blast radius is bounded by where the work
//    lands, not only by what the fence allows. Named with a meaningful slug —
//    tool and problem, human-readable, of the form `bareloop-typecheck-fix`. A
//    human scanning `git branch` must be able to tell what the run was for
//    without opening the spec, which a run-id slug does not give them."
//
// WHAT IT IS AND IS NOT, stated here rather than left to be inferred (v1.57's own
// known-limitations discipline). bareloop never commits: the run leaves its work
// in the tree. So the guarantee this module actually delivers is precise —
//
//   * the run's tree is standing on a branch NOBODY handed it, from the first
//     moment a write-capable worker can exist to the end of the run, and
//   * the handed ref (`main`, or whatever was checked out) is never moved,
//     never written through, and never the thing a later commit attaches to.
//
// It is NOT containment: v1.41's local-trust model stands untouched, and a close
// or worker child can still reach anything the operator's OS user can reach. The
// branch bounds where the work LANDS. That is the whole claim.
//
// THE NAME IS OURS, NEVER THE MODEL'S. A branch name is arbiter bookkeeping: it
// says which history a run's blast radius belongs to. A model-authored one would
// be the agent authoring the arbiter's own books, so the name is DERIVED,
// mechanically and deterministically, from the SIGNED spec's own `job` field
// (see `workBranchName`).
//
// WHY THIS FILE OWNS ITS OWN git SEAM. `src/kinds.js` has one too, and its
// docstring says what it is: "git, read-only, in a repository" — the CLOSE's
// measuring instrument, whose faults are close faults. This one MUTATES the
// repository (it creates and checks out a ref) and its faults are runner
// instrument stops before a single token is bought. Two verbs, two failure
// vocabularies, two owners; the read-only one is not exported and could not be
// shared without widening it into a write seam.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Every work branch carries it. It is what makes `main`, `master` and every
 * branch a human could plausibly have handed the run INEXPRESSIBLE as a work
 * branch name — a structural guarantee rather than a denylist somebody has to
 * keep current. */
export const WORK_BRANCH_PREFIX = 'bareloop-';

/** The full legal shape of a work branch. Deliberately narrower than git's own
 * `check-ref-format`: the kebab alphabet the job validator already holds every
 * spec slug to (`src/job.js` SLUG_RE), plus the prefix. Everything git forbids —
 * `..`, `@{`, a trailing `.lock`, a leading `-`, a `/` component, control
 * characters — is unreachable inside it, so ref-safety is a property of the
 * alphabet and never a sanitiser somebody has to remember to call. */
export const WORK_BRANCH_RE = /^bareloop-[a-z0-9][a-z0-9-]*$/;

/** The slug's ceiling, before any collision suffix. A ref component has a
 * filesystem-length limit and a human scanning `git branch` has a much smaller
 * one; 60 characters is longer than every job slug in `jobs/` and short enough
 * to read in a column. */
export const MAX_SLUG_LEN = 60;

/** How far the collision walk goes before it STOPS and says so. A run that
 * cannot find a free name in this many attempts is looking at a patient nobody
 * has swept in a very long time, and silently walking to `-500` would be the
 * runner papering over an operator problem. */
export const MAX_BRANCH_COLLISIONS = 50;

/** git, in a repository, WRITE-CLASS. A non-zero exit is a value, never a throw:
 * every caller here decides for itself whether git refusing is a stop.
 * @param {string} cwd @param {string[]} args
 * @returns {Promise<{ok: boolean, out: string, err: string}>}
 */
async function git(cwd, args) {
  try {
    const { stdout, stderr } = await exec('git', args, {
      cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024,
    });
    return { ok: true, out: String(stdout ?? ''), err: String(stderr ?? '') };
  } catch (e) {
    const err = /** @type {any} */ (e);
    // A spawn failure (no git on PATH, cwd does not exist) has no streams at all;
    // its `message` is the only thing there is to report, and reporting nothing
    // would turn "git is not installed" into a mysterious silent refusal.
    const detail = String(err?.stderr ?? '').trim() || String(err?.message ?? err).trim();
    return { ok: false, out: String(err?.stdout ?? ''), err: detail };
  }
}

/**
 * The spec's own words, reduced to the kebab alphabet. Lossy on purpose: the
 * output alphabet IS the ref-safety guarantee, so anything outside it collapses
 * to a separator rather than being escaped into something clever.
 * @param {unknown} s
 * @returns {string} `''` when nothing usable survives
 */
function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/, '');
}

/**
 * The branch name a job's run works on, DERIVED from the signed spec.
 *
 * **The source is `spec.job`, and the choice is load-bearing.** It is the one
 * human-authored, REQUIRED, kebab-case name the spec carries; it is inside the
 * spec hash, so the branch name cannot drift from what the operator signed; and
 * it is stable across a resume and across a cold re-run of the same spec, which
 * is precisely why the collision walk below has to exist. In practice it already
 * reads as tool-and-problem (`bareagent-u-types`, `litectx-u-types`), which is
 * the shape hamr's ruling asks for.
 *
 * **The goal prose was REJECTED as a source**, and not for tidiness: a goal is
 * long, is edited freely between runs without changing what the job IS, and
 * opens on boilerplate ("An existing pytest test suite for the SOAR
 * orchestrator…"). Deriving from it would make the branch name unstable under
 * edits that change nothing, and unreadable when it was stable. A run id was
 * rejected by the ruling itself.
 *
 * Deterministic, pure, and total: any input yields a name matching
 * `WORK_BRANCH_RE`, so a caller never has to check.
 * @param {any} spec a job-v1 spec (validated or raw)
 * @returns {string}
 */
export function workBranchName(spec) {
  const slug = slugify(spec?.job);
  // `job` is REQUIRED and kebab-validated by `validateJob`, which runs before the
  // runner ever reaches here — so the fallback is unreachable through `runJob`.
  // It exists because this function is exported and total: a name is the wrong
  // thing to throw about, and `bareloop-job` is honest ("a bareloop job") rather
  // than invented.
  return `${WORK_BRANCH_PREFIX}${slug || 'job'}`;
}

/** does a local branch of this name exist? @param {string} cwd @param {string} name */
async function branchExists(cwd, name) {
  const r = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
  return r.ok;
}

/**
 * Put the run on its OWN branch, before it can touch any code.
 *
 * The three shapes, and each one's honest answer:
 *
 *  - **Cold.** `name` is free → create it at HEAD and switch. The handed branch
 *    keeps its ref and its history; a new branch at HEAD moves no commit, so this
 *    costs the patient nothing and changes nothing it can measure (the declared
 *    close's seed is HEAD either way).
 *  - **Cold, and the name is taken.** Suffix `-2`, `-3`… until one is free.
 *    Deterministic given the repository, and it NEVER reuses another run's
 *    branch — a second run of the same spec is a second blast radius.
 *  - **Resume.** `resume` names the branch the killed leg recorded on its own
 *    spine. It is checked out, never re-created and never suffixed: the work the
 *    operator already paid for is sitting on it, and minting `-2` beside it would
 *    strand exactly the progress a resume exists to keep. A `resume` branch that
 *    is GONE is a STOP, never a silent fresh start — the run would be grading a
 *    tree whose history it does not own.
 *
 * **Every failure is a stop with a name.** Not a git repository, no git on PATH,
 * a checkout git refuses, a crowded namespace, a resume branch a human deleted:
 * each comes back as `stop` and `branch: null`. There is no fallback to "just
 * work on whatever was handed to us" anywhere in this function, because that
 * fallback IS the thing the hard rule forbids.
 *
 * A DETACHED head is not a failure. Creating a branch from it is exactly the
 * bounding the rule asks for (and it attaches a head that was floating), so it
 * succeeds with `from: null` — there was no branch to be handed, and the record
 * says so rather than inventing one.
 *
 * @param {string} workdir the patient (the fence's root)
 * @param {object} o
 * @param {string} o.name the derived name (`workBranchName`); refused unless it
 *   matches `WORK_BRANCH_RE`, which is what makes `main` unreachable even from a
 *   hand-passed argument
 * @param {string|null} [o.resume] RESUME — the branch this run already owns
 * @returns {Promise<{stop: string, branch: null}
 *   | {stop: null, branch: string, created: boolean, resumed: boolean, from: string|null, base: string|null,
 *      repo: string, collided: number}>}
 */
export async function prepareWorkBranch(workdir, { name, resume = null }) {
  const wanted = String(name ?? '');
  if (!WORK_BRANCH_RE.test(wanted)) {
    return { stop: `the work branch name ${JSON.stringify(wanted)} is not a bareloop work branch (${WORK_BRANCH_RE.source}) — a run never works on a branch it was handed`, branch: null };
  }

  // Is there a repository at all? Asked FIRST and by its own question, so "this
  // patient is not a git checkout" reads as itself instead of arriving later
  // disguised as a checkout failure.
  //
  // `--show-toplevel` rather than `--git-dir`, and the answer is REPORTED: git
  // resolves upwards, so a workdir that is a SUBDIRECTORY of a repository gets a
  // branch in that enclosing repository — a blast radius wider than the operator
  // handed over. That is the pre-existing semantics of every other git read in
  // the flow (`seedAtHead`, `changedSet`), so it is not changed here; what it must
  // not be is invisible, and the record names the repository that got the branch.
  const inside = await git(workdir, ['rev-parse', '--show-toplevel']);
  if (!inside.ok) {
    return { stop: `the work branch cannot be created in ${workdir}: ${inside.err || 'not a git repository'}`, branch: null };
  }
  const repo = inside.out.trim().split('\n')[0].trim() || workdir;

  // WHERE the run was handed. A symbolic HEAD names the handed branch; a detached
  // one names nothing, and `null` is the honest reading of that (never the string
  // "HEAD", which a reader cannot tell from a branch called HEAD).
  const sym = await git(workdir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const from = sym.ok ? sym.out.trim() || null : null;
  const rev = await git(workdir, ['rev-parse', 'HEAD']);
  const base = rev.ok ? (rev.out.trim().split('\n')[0].trim() || null) : null;

  if (resume !== null && resume !== undefined) {
    const own = String(resume);
    if (!WORK_BRANCH_RE.test(own)) {
      return { stop: `the recorded work branch ${JSON.stringify(own)} is not a bareloop work branch (${WORK_BRANCH_RE.source}) — this resume would continue on a branch the run does not own`, branch: null };
    }
    if (!await branchExists(workdir, own)) {
      return { stop: `the work branch ${JSON.stringify(own)} this run was killed on no longer exists in ${workdir} — the resume stops rather than starting a new branch beside work it cannot see`, branch: null };
    }
    // Already standing on it (the ordinary case — a kill leaves the tree where it
    // was) is a NO-OP, deliberately: `git checkout` onto the current branch is
    // harmless today, and not running it at all is what keeps a dirty in-flight
    // tree out of git's hands entirely.
    if (from !== own) {
      const co = await git(workdir, ['checkout', own]);
      if (!co.ok) return { stop: `could not return to the work branch ${JSON.stringify(own)} in ${workdir}: ${co.err}`, branch: null };
    }
    return { stop: null, branch: own, created: false, resumed: true, from, base, repo, collided: 0 };
  }

  // The collision walk. `-2` is the first suffix rather than `-1`, so the branch a
  // human reads without a number is the first run and the numbers count runs the
  // way a person does.
  let collided = 0;
  let candidate = wanted;
  while (await branchExists(workdir, candidate)) {
    collided += 1;
    if (collided >= MAX_BRANCH_COLLISIONS) {
      return { stop: `every work-branch name from ${JSON.stringify(wanted)} through ${JSON.stringify(`${wanted}-${MAX_BRANCH_COLLISIONS}`)} is already taken in ${workdir} — sweep the patient's old work branches rather than letting the runner walk further`, branch: null };
    }
    candidate = `${wanted}-${collided + 1}`;
  }

  const co = await git(workdir, ['checkout', '-b', candidate]);
  if (!co.ok) {
    return { stop: `could not create the work branch ${JSON.stringify(candidate)} in ${workdir}: ${co.err}`, branch: null };
  }
  return { stop: null, branch: candidate, created: true, resumed: false, from, base, repo, collided };
}
