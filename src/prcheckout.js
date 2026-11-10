// MCP + tickets piece 12 (ITEM33-BUILD addendum, "Piece 12 - check out the PR's code (head) into the run's worktree"): at RUN START, before the work branch and the seed
// read, the run's own worktree is moved to the head commit of a GitHub pull request. Plain git against the remote of the person's repo that names the PR's
// `owner/repo`; never the MCP, never a URL built from ticket text, never a push. The head sha comes from the frozen PR record through ONE accessor (`prHeadSha`).
//
// What this file is NOT: a PR reader. The frozen PR record is made by a reader that does not exist yet (its MCP tool name and toolset are an OPEN item for hamr).
// This file consumes a record that carries `head.sha` and refuses, in the spec's words, when it does not.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnClose } from './ralph.js';
import { npmEnv as credentialStrippedEnv } from './npminstall.js';
import { redactSecrets } from './validate.js';
import { prRefName, removePrRef } from './worktree.js';

export { prRefName };

/** the ONLY git subcommands this piece may run (spec item 10a): anything else throws before a process is made. Nothing that writes to a remote, to the person's config or to their index is on the list. */
export const PR_GIT_SUBCOMMANDS = Object.freeze(['fetch', 'rev-parse', 'checkout', 'merge-base', 'update-ref', 'worktree']);

/** the hard deadline of the fetch, in ms (spec item 3: 120 s; tighten-only, like the other clamps) */
export const PR_FETCH_DEADLINE_MS = 120_000;

/** none of the person's git hooks run for anything this piece does (the same spelling as src/worktree.js) */
const NO_HOOKS = Object.freeze(['-c', 'core.hooksPath=/dev/null/bareloop-no-hooks']);

/** the belt of spec item 10c: even if something tried a push through the fetching remote, its push address is a dead word */
const NO_PUSH = 'no-push-by-bareloop';

const PR_URL = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d{1,10})\/?$/;
const SHA = /^[0-9a-f]{40}$/;

/**
 * The PR address a ticket list gives: `https://github.com/<owner>/<repo>/pull/<n>`.
 * @param {unknown} url
 * @returns {{ok: true, owner: string, repo: string, number: number}|{ok: false, error: string}}
 */
export function parsePrAddress(url) {
  const m = typeof url === 'string' ? PR_URL.exec(url.trim()) : null;
  if (!m) return { ok: false, error: 'This is not a GitHub pull request address.' };
  const number = Number(m[3]);
  if (!Number.isSafeInteger(number) || number < 1) return { ok: false, error: 'This is not a GitHub pull request address.' };
  return { ok: true, owner: m[1], repo: m[2], number };
}

/**
 * THE one accessor of the frozen PR record's head commit: GitHub's own `head.sha`. Everything in this file reads the head through here, so the day the reader's record
 * names it differently there is one line to change. A record without a full 40-hex sha has no head (null).
 * @param {any} record @returns {string|null}
 */
export function prHeadSha(record) {
  const sha = record?.head?.sha;
  return typeof sha === 'string' && SHA.test(sha) ? sha : null;
}

/** the PR's base as the record gives it (`base.ref`, `base.sha`), or null when it names none @param {any} record @returns {{ref: string|null, sha: string}|null} */
export function prBaseOf(record) {
  const sha = record?.base?.sha;
  if (typeof sha !== 'string' || !SHA.test(sha)) return null;
  return { ref: typeof record.base.ref === 'string' ? record.base.ref : null, sha };
}

/**
 * The remotes a git config text declares, with their addresses AS WRITTEN (before any `insteadOf` rewrite): `[remote "name"]` sections, `url = ...` lines.
 * Read from the config file instead of `git remote`, which would need a subcommand this piece is not allowed and prints the rewritten address.
 * @param {string} text @returns {{name: string, url: string}[]}
 */
export function remotesOfConfig(text) {
  /** @type {{name: string, url: string}[]} */
  const out = [];
  let name = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (head) { name = head[1].toLowerCase() === 'remote' && head[2] !== undefined ? head[2].replace(/\\(.)/g, '$1') : null; continue; }
    if (name === null) continue;
    const kv = /^url\s*=\s*(.*)$/i.exec(line);
    if (kv) out.push({ name, url: kv[1].trim().replace(/^"(.*)"$/, '$1') });
  }
  return out;
}

/**
 * Does a remote address name `github.com/<owner>/<repo>`? https, ssh:// and the scp-like `git@github.com:owner/repo.git` forms; case-blind, `.git` optional.
 * @param {string} url @param {string} owner @param {string} repo
 */
export function remoteNames(url, owner, repo) {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/@\s]*@)?github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m !== null && m[1].toLowerCase() === owner.toLowerCase() && m[2].toLowerCase() === repo.toLowerCase();
}

/** the remote to fetch from: `origin` when it names the repo, else the first that does; null = none @param {{name: string, url: string}[]} remotes @returns {{name: string, url: string}|null} */
export function matchRemote(remotes, owner, repo) {
  const hits = remotes.filter((r) => remoteNames(r.url, owner, repo));
  return hits.find((r) => r.name === 'origin') ?? hits[0] ?? null;
}

/** an address that carries a login: `https://user:pass@host`, `https://token@host`, or `ssh://user:pass@host` (a bare ssh user such as `git@` is not a secret) @param {string} url */
export function urlCarriesLogin(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/@\s]*)@/i.exec(url.trim());
  if (m === null) return false;
  return /^https?$/i.test(m[1]) || m[2].includes(':');
}

/** the address with any login masked, for the words a person reads @param {string} url */
export function maskUrl(url) {
  return url.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1***@');
}

/**
 * The environment of every git child of this piece: the panel's env MINUS what `CLOSE_ENV_DENY` names (the one deny list, never re-spelled), KEEPING `HOME` and
 * `SSH_AUTH_SOCK` (the documented exception: stripping it breaks git over ssh), with prompts off - no human is mid-run, so a credential question is a refusal, never a wait.
 * @param {NodeJS.ProcessEnv} base @returns {NodeJS.ProcessEnv}
 */
export function prGitEnv(base) {
  const env = credentialStrippedEnv(base);
  // the repo is named by the cwd; an inherited GIT_DIR would aim a child at some other repo
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
  env.GIT_TERMINAL_PROMPT = '0';
  env.SSH_ASKPASS_REQUIRE = 'never';
  return env;
}

/**
 * The argv of one git call. The subcommand is checked against `PR_GIT_SUBCOMMANDS` HERE, before any process exists.
 * @param {string} sub @param {string[]} rest @param {string[]} [cfg] extra `-c key=value` words
 * @returns {string[]}
 */
export function prGitArgs(sub, rest, cfg = []) {
  if (!PR_GIT_SUBCOMMANDS.includes(sub)) throw new Error(`git ${sub} is not one of the git calls the pull request checkout may make`);
  return [...NO_HOOKS, ...cfg.flatMap((c) => ['-c', c]), sub, ...rest];
}

/**
 * The fetch (spec item 3): the PR's head ref from the base repo into bareloop's private ref, so the object survives gc during the run and no branch, tag or FETCH_HEAD is touched.
 * The `+` lets a Rerun move the ref when the PR was force-pushed since the last run.
 * @param {string} remote @param {number} n @param {{writeFetchHead?: boolean}} [o] `false` (default) = `--no-write-fetch-head`
 * @returns {string[]} the subcommand's own args (after `fetch`)
 */
export function fetchRest(remote, n, { writeFetchHead = false } = {}) {
  return ['--no-tags', '--no-recurse-submodules', ...(writeFetchHead ? [] : ['--no-write-fetch-head']), remote, `+refs/pull/${n}/head:${prRefName(n)}`];
}

/** git's reason, one line, with logins in addresses and secret shapes masked @param {string} stderr @param {string} [fallback] */
export function firstReason(stderr, fallback = 'no reason given') {
  const line = redactSecrets(stderr).split('\n').map((l) => l.trim()).find((l) => l !== '') ?? fallback;
  return line.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, '$1***@').slice(0, 300);
}

/**
 * @typedef {object} PrCheckout
 * @property {string} sha the PR's head commit, now the worktree's detached HEAD @property {number} number @property {string} ownerRepo `owner/repo`
 * @property {string} remote the remote the fetch used @property {string} ref the private ref @property {{ref: string|null, sha: string}|null} base @property {string|null} mergeBase
 */

/**
 * RUN START for a PR job: fetch the PR's head, verify it is the sha the frozen record names, and move the run's worktree there (detached). Every refusal is plain words
 * that end in "Nothing spent." and leaves no private ref behind. Never pushes; the person's own tree is never touched (the worktree is the run's).
 * @param {object} o
 * @param {string} o.repo the person's repo root (the worktree's `repo` in source.json) @param {string} o.worktree the run's worktree
 * @param {{url: string, record: any, reread?: () => Promise<any>}} o.pr `url` = the PR address; `record` = the frozen PR record; `reread` = optional: read the record again (one try, spec item 5)
 * @param {NodeJS.ProcessEnv} [o.env] @param {number} [o.timeoutMs] @param {typeof spawnClose} [o.run] test seam for the child process
 * @returns {Promise<{ok: true, checkout: PrCheckout}|{ok: false, error: string}>}
 */
export async function checkoutPrHead({ repo, worktree, pr, env = process.env, timeoutMs = PR_FETCH_DEADLINE_MS, run = spawnClose }) {
  const tail = 'Nothing spent.';
  const addr = parsePrAddress(pr.url);
  if (!addr.ok) return addr;
  const { owner, repo: name, number: n } = addr;
  const ref = prRefName(n);
  const noCode = { ok: /** @type {const} */ (false), error: `Pull request #${n} has no code to fetch (GitHub did not offer its head). ${tail}` };
  const want = prHeadSha(pr.record);
  if (want === null) return noCode;

  const childEnv = prGitEnv(env);
  const git = (/** @type {string} */ cwd, /** @type {string} */ sub, /** @type {string[]} */ rest, /** @type {string[]} */ cfg = []) => run('git', prGitArgs(sub, rest, cfg), { env: childEnv, cwd, timeoutMs });
  const out = (/** @type {{stdout: string}} */ r) => r.stdout.trim();

  // which remote: the person's own repo config, matched by owner/repo; no address is ever built from the ticket
  const common = await git(repo, 'rev-parse', ['--git-common-dir']);
  if (common.error || common.status !== 0) return { ok: false, error: `Git could not fetch pull request #${n} (${firstReason(common.stderr, 'this folder is not a git repository')}). Check your git login for this repo. ${tail}` };
  let configText = '';
  try { configText = readFileSync(join(resolve(repo, out(common)), 'config'), 'utf8'); } catch { configText = ''; }
  const remote = matchRemote(remotesOfConfig(configText), owner, name);
  if (remote === null) return { ok: false, error: `No remote in this repo points at ${owner}/${name}, so the pull request's code cannot be fetched. ${tail}` };
  if (urlCarriesLogin(remote.url)) return { ok: false, error: `The remote ${remote.name} (${maskUrl(remote.url)}) has a login in its address, which bareloop will not use; use an ssh address or a git credential helper. ${tail}` };

  /** @param {string} message @returns {{ok: false, error: string}} */
  const failed = (message) => { removePrRef(repo, n); return { ok: false, error: message }; };
  const cfg = [`remote.${remote.name}.pushurl=${NO_PUSH}`];
  /** one fetch + rev-parse; a git that does not know --no-write-fetch-head (before 2.29) is run again without it @param {boolean} writeFetchHead */
  const fetchOnce = async (writeFetchHead = false) => {
    const r = await git(repo, 'fetch', fetchRest(remote.name, n, { writeFetchHead }), cfg);
    if (!writeFetchHead && r.status !== 0 && /no-write-fetch-head/.test(r.stderr) && /unknown|unrecognized/i.test(r.stderr)) return fetchOnce(true);
    return r;
  };
  /** @returns {Promise<{ok: true, sha: string}|{ok: false, error: string}>} */
  const fetchAndRead = async () => {
    const f = await fetchOnce();
    if (f.error) {
      if (/** @type {any} */ (f.error).code === 'ETIMEDOUT') return { ok: false, error: `Fetching pull request #${n} took longer than ${Math.round(timeoutMs / 1000)} seconds. ${tail}` };
      return { ok: false, error: `Git could not fetch pull request #${n} (${firstReason(String(f.error.message ?? f.error))}). Check your git login for this repo. ${tail}` };
    }
    if (f.status !== 0) return { ok: false, error: `Git could not fetch pull request #${n} (${firstReason(f.stderr)}). Check your git login for this repo. ${tail}` };
    const rp = await git(repo, 'rev-parse', ['--verify', '--quiet', `${ref}^{commit}`]);
    if (rp.error || rp.status !== 0 || !SHA.test(out(rp))) return { ok: false, error: `Git could not fetch pull request #${n} (the fetched ref could not be read). Check your git login for this repo. ${tail}` };
    return { ok: true, sha: out(rp) };
  };

  let got = await fetchAndRead();
  if (!got.ok) return failed(got.error);
  let sha = want;
  if (got.sha !== want) {
    // the PR moved after it was read: ONE re-read of the record and ONE re-fetch; the frozen text and the checked-out code must describe the same commit
    const moved = { ok: /** @type {const} */ (false), error: `The pull request changed while the run was starting. Run it again. ${tail}` };
    const again = typeof pr.reread === 'function' ? await pr.reread() : null;
    const wantAgain = again === null ? null : prHeadSha(again);
    if (wantAgain === null) return failed(moved.error);
    got = await fetchAndRead();
    if (!got.ok) return failed(got.error);
    if (got.sha !== wantAgain) return failed(moved.error);
    sha = wantAgain;
  }

  // the checkout: the run's OWN worktree, detached at the head; nothing is committed
  const co = await git(worktree, 'checkout', ['--detach', sha]);
  if (co.error || co.status !== 0) return failed(`Git could not fetch pull request #${n} (it could not be checked out: ${firstReason(co.stderr || String(co.error?.message ?? ''))}). Check your git login for this repo. ${tail}`);

  const base = prBaseOf(pr.record);
  let mergeBase = null;
  if (base !== null) {
    const mb = await git(repo, 'merge-base', [base.sha, sha]);
    mergeBase = !mb.error && mb.status === 0 && SHA.test(out(mb)) ? out(mb) : null; // a base this repo has not got is unrecorded, not a refusal
  }
  return { ok: true, checkout: { sha, number: n, ownerRepo: `${owner}/${name}`, remote: remote.name, ref, base, mergeBase } };
}

/**
 * A RESUME's check (spec item 12): the recorded PR head is an ancestor of the worktree's HEAD, so the work branch still holds the PR's code. No fetch.
 * @param {string} worktree @param {string} prHead @param {{run?: typeof spawnClose, env?: NodeJS.ProcessEnv}} [o]
 * @returns {Promise<boolean>}
 */
export async function prHeadIsAncestor(worktree, prHead, { run = spawnClose, env = process.env } = {}) {
  if (!SHA.test(prHead)) return false;
  const r = await run('git', prGitArgs('merge-base', ['--is-ancestor', prHead, 'HEAD']), { env: prGitEnv(env), cwd: worktree, timeoutMs: PR_FETCH_DEADLINE_MS });
  return !r.error && r.status === 0;
}

/**
 * Write the checkout into the run's `source.json` (spec item 6): `seed:<sha>`, `prHead`, `prNumber`, `prBase:{ref,sha}`. Only these fields change.
 * @param {string} into the prepared copy's folder (holds source.json) @param {PrCheckout} c
 */
export function recordPrOnManifest(into, c) {
  const file = join(resolve(into), 'source.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.seed = c.sha;
  manifest.prHead = c.sha;
  manifest.prNumber = c.number;
  manifest.prBase = c.base;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
