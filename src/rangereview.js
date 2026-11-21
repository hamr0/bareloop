// REVIEW BY GIT RANGE OR BRANCH (docs/product/ITEM33-BUILD.md "Part 2 build spec"): the ONE owner of the typed token, its refusals, its ends and the per-file diffs a review reads.
// A job STEP line may carry the exact typed text `range: A..B` or `branch: NAME` (local branches only). Code reads only those tokens; it never guesses intent from other words.
// Code (never the worker) runs the read-only git of src/prcheckout.js (stripped env, no hooks, `diff` on its allow-list) at run start, before any token is spent:
//   a range is checked at both ends; a branch is diffed against main (merge-base(main, NAME)..NAME); one diff file per changed file is written under `output/review-diff/`, never into the person's repo, never committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnClose } from './ralph.js';
import { prGitArgs, prGitEnv, firstReason, checkoutAt } from './prcheckout.js';

const SHA = /^[0-9a-f]{40}$/;
const TAIL = 'Nothing spent.';

/** where a run's per-file diffs live, inside the run's worktree (code-written inputs: untracked, never committed, never a worker edit) */
export const DIFF_DIR = 'output/review-diff';

/** @typedef {{kind: 'range', a: string, b: string, line: number}|{kind: 'branch', name: string, line: number}} RangeToken */

/**
 * Every exact typed token in every step line: `range: A..B` and `branch: NAME` (the line's own text only; a `~` guardrail or an input line is never read). A line can carry both kinds.
 * @param {{n: number, text: string}[]|null|undefined} jobLines @returns {RangeToken[]}
 */
export function rangeTokens(jobLines) {
  /** @type {RangeToken[]} */ const out = [];
  for (const l of Array.isArray(jobLines) ? jobLines : []) {
    const text = String(l?.text ?? '');
    for (const m of text.matchAll(/(?:^|\s)range: (\S+?)\.\.(\S+)(?=\s|$)/g)) out.push({ kind: 'range', a: m[1], b: m[2], line: l.n });
    for (const m of text.matchAll(/(?:^|\s)branch: (\S+)(?=\s|$)/g)) out.push({ kind: 'branch', name: m[1], line: l.n });
  }
  return out;
}

/** one range or one branch per job; more is refused in plain words @param {{n: number, text: string}[]|null|undefined} jobLines @returns {string|null} */
export function manyTokensRefusal(jobLines) {
  const t = rangeTokens(jobLines);
  return t.length > 1 ? `A job can name one range or one branch, and this one names ${t.length} (${t.map((x) => (x.kind === 'range' ? `range: ${x.a}..${x.b}` : `branch: ${x.name}`)).join(', ')}). Keep one. ${TAIL}` : null;
}

/** a review-only token met on a job that changes code (`range:` only; `branch:` is legal on a change job) @param {{kind: string, line: number}} t */
export const changeRefusal = (t) => `Line ${t.line} names a ${t.kind} to review, but this job changes code. A ${t.kind} can only be reviewed, not changed. Write it as a review, or take the ${t.kind} out. ${TAIL}`;

/**
 * Both ends of a review exist, as commits of THIS repo: a range's two ends, or a local branch's tip and its merge-base with `main`. Read-only git, stripped env.
 * @param {{repo: string, token: RangeToken, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} o
 * @returns {Promise<{ok: true, a: string, b: string}|{ok: false, error: string}>}
 */
export async function resolveRange({ repo, token, env = process.env, run = spawnClose }) {
  const childEnv = prGitEnv(env);
  const git = (/** @type {string} */ sub, /** @type {string[]} */ rest) => run('git', prGitArgs(sub, rest), { env: childEnv, cwd: repo, timeoutMs: 60_000 });
  const commitOf = async (/** @type {string} */ spec) => {
    if (spec === '' || spec.startsWith('-')) return null;
    const r = await git('rev-parse', ['--verify', '--quiet', `${spec}^{commit}`]);
    const sha = r.stdout.trim();
    return !r.error && r.status === 0 && SHA.test(sha) ? sha : null;
  };
  if (token.kind === 'range') {
    const a = await commitOf(token.a);
    if (a === null) return { ok: false, error: `"${token.a}" is not a commit, tag or branch of this repo, so the range cannot be reviewed. ${TAIL}` };
    const b = await commitOf(token.b);
    if (b === null) return { ok: false, error: `"${token.b}" is not a commit, tag or branch of this repo, so the range cannot be reviewed. ${TAIL}` };
    return { ok: true, a, b };
  }
  const tip = await commitOf(`refs/heads/${token.name}`);
  if (tip === null) return { ok: false, error: `This repo has no branch named "${token.name}". ${TAIL}` };
  const main = await commitOf('refs/heads/main');
  if (main === null) return { ok: false, error: `This repo has no branch named main, so branch "${token.name}" cannot be compared with it. Use a range (range: A..B) instead. ${TAIL}` };
  const mb = await git('merge-base', [main, tip]);
  const base = mb.stdout.trim();
  if (mb.error || mb.status !== 0 || !SHA.test(base)) return { ok: false, error: `Branch "${token.name}" shares no history with main. ${TAIL}` };
  return { ok: true, a: base, b: tip };
}

/**
 * Write `output/review-diff/` into the run's worktree: `files.txt` (== `git diff --name-only A..B`, one path per line) and one `<path>.diff` per changed file (== `git diff A..B -- <path>`, byte for byte).
 * Called AFTER the run's cold reset (which cleans untracked files) and before any token. Never writes into the person's repo.
 * @param {{repo: string, worktree: string, a: string, b: string, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} o
 * @returns {Promise<{ok: true, files: string[]}|{ok: false, error: string}>}
 */
export async function writeRangeDiffs({ repo, worktree, a, b, env = process.env, run = spawnClose }) {
  const childEnv = prGitEnv(env);
  const git = (/** @type {string} */ sub, /** @type {string[]} */ rest) => run('git', prGitArgs(sub, rest), { env: childEnv, cwd: repo, timeoutMs: 60_000 });
  const names = await git('diff', ['--name-only', '--no-ext-diff', '-z', `${a}..${b}`]);
  if (names.error || names.status !== 0) return { ok: false, error: `Git could not list the changed files (${firstReason(names.stderr)}). ${TAIL}` };
  const files = names.stdout.split('\0').filter(Boolean);
  mkdirSync(join(worktree, DIFF_DIR), { recursive: true });
  writeFileSync(join(worktree, DIFF_DIR, 'files.txt'), files.length > 0 ? `${files.join('\n')}\n` : '');
  for (const f of files) {
    const d = await git('diff', ['--no-ext-diff', `${a}..${b}`, '--', `:(literal)${f}`]);
    if (d.error || d.status !== 0) return { ok: false, error: `Git could not diff ${f} (${firstReason(d.stderr)}). ${TAIL}` };
    const file = join(worktree, DIFF_DIR, `${f}.diff`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, d.stdout);
  }
  return { ok: true, files };
}

/** a review spec: the text close over a repo source (the rubric road) @param {any} spec */
const isReviewSpec = (spec) => spec?.verdictType === 'soft-green' && spec?.closeDecl?.source === 'repo';

/**
 * The planner's block for a signed spec: null unless the spec is a review that carries a token (so every other prompt stays byte-identical). The words are FROZEN from live round W.
 * `<A..B>` is the typed range, or `main..NAME` for a branch.
 * @param {any} spec @returns {string|null}
 */
export function rangeNoteOfSpec(spec) {
  if (!isReviewSpec(spec)) return null;
  const t = rangeTokens(spec?.jobLines)[0];
  if (t === undefined) return null;
  const span = t.kind === 'range' ? `${t.a}..${t.b}` : `main..${t.name}`;
  return `This review covers ${span}. The changed files are listed in ${DIFF_DIR}/files.txt; each file's changes are in ${DIFF_DIR}/<path>.diff. Plan ONE step that reads and writes: write output/steps/1.json as soon as you have your first finding, then add each new finding to it as you read. Do not plan a separate step that only re-checks the answer.`;
}

/**
 * The tip of a LOCAL branch of the repo, for a change job's `branch:` (its work branch starts there). Plain words when the branch is not there.
 * @param {{repo: string, name: string, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} o
 * @returns {Promise<{ok: true, sha: string}|{ok: false, error: string}>}
 */
export async function branchTip({ repo, name, env = process.env, run = spawnClose }) {
  const r = name === '' || name.startsWith('-') ? null : await run('git', prGitArgs('rev-parse', ['--verify', '--quiet', `refs/heads/${name}^{commit}`]), { env: prGitEnv(env), cwd: repo, timeoutMs: 60_000 });
  const sha = r === null ? '' : r.stdout.trim();
  return r !== null && !r.error && r.status === 0 && SHA.test(sha) ? { ok: true, sha } : { ok: false, error: `This repo has no branch named "${name}". ${TAIL}` };
}

/**
 * RUN START, before the seed is read and before any token: what the spec's token asks of the worktree. null = the spec names no token (nothing happens, the run is byte-identical).
 * A review: both ends checked, the worktree put at the end (the range's `B`, or the branch tip) through the one `checkoutAt`; the ends ride back so the run records them. A change job's `branch:`: the worktree at the
 * branch's tip, so the work branch starts there; a change job's `range:` is refused (belt: the doors refuse it at drafting). More than one token is refused.
 * @param {{spec: any, repo: string, worktree: string, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} o
 * @returns {Promise<null|{ok: true, sha: string, range: {a: string, b: string}|null}|{ok: false, error: string}>}
 */
export async function rangeAtRunStart({ spec, repo, worktree, env = process.env, run = spawnClose }) {
  const many = manyTokensRefusal(spec?.jobLines);
  if (many !== null) return { ok: false, error: many };
  const token = rangeTokens(spec?.jobLines)[0];
  if (token === undefined) return null;
  /** @param {string} sha @param {{a: string, b: string}|null} range */
  const at = async (sha, range) => {
    const co = await checkoutAt({ repo, worktree, sha, env, run });
    return co.ok ? { ok: /** @type {const} */ (true), sha, range } : { ok: /** @type {const} */ (false), error: `The code could not be checked out (${co.reason}). ${TAIL}` };
  };
  if (isReviewSpec(spec)) {
    const r = await resolveRange({ repo, token, env, run });
    return r.ok ? at(r.b, { a: r.a, b: r.b }) : r;
  }
  if (token.kind === 'range') return { ok: false, error: changeRefusal(token) };
  const tip = await branchTip({ repo, name: token.name, env, run });
  return tip.ok ? at(tip.sha, null) : tip;
}

/**
 * Record a started range/branch run on the run's `source.json`: `seed` (the end sha, so a resume's moved-HEAD gate and a rerun's cold reset both stand on it, as for a PR head) and, for a review, `range: {a, b}`.
 * Only these fields change.
 * @param {string} into the prepared copy's folder (holds source.json) @param {{sha: string, range: {a: string, b: string}|null}} r
 */
export function recordRangeOnManifest(into, r) {
  const file = join(into, 'source.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.seed = r.sha;
  if (r.range !== null) manifest.range = { a: r.range.a, b: r.range.b };
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** the recorded range ends of a run's manifest (null when it names none) @param {any} manifest @returns {{a: string, b: string}|null} */
export const rangeOfManifest = (manifest) => (SHA.test(String(manifest?.range?.a)) && SHA.test(String(manifest?.range?.b)) ? { a: manifest.range.a, b: manifest.range.b } : null);
