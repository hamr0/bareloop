// The source front door (PRD item 33/M2, `docs/product/ITEM33-BUILD.md`) — a
// plain folder, a plain file, or one URL the machine can reach, frozen into a
// hidden git tree BEFORE any token spends, so the run and the close judge the
// SAME bytes (hamr's ruling, PRD item 33, 2026-09-10). H1's fix: the person
// never sees the git repo — it is scratch plumbing this module owns, not a
// `--patient` a job author writes by hand.
//
// Three functions, three moments in a job's life:
//   - `prepareSource` — BUILD the frozen tree, once, at prep time ($0, no
//     provider). This is where H1 (a plain folder needs no repo) and H7 (PDF
//     and Word input have no reader here — logged, not built) actually live.
//   - `proveDestination` — PROVE the drop-off point is writable, at $0,
//     before any token spends (a job that cannot land its output should
//     never buy a worker turn first).
//   - `copyOut` — COPY the run's own output to that drop-off point, once,
//     on a minted green (never a red, never a stop — this module makes no
//     verdict and changes none).
//
// Every failure here is a NAMED refusal, never a throw and never a silent
// fallback: `{stop: null, ...}` on success, `{stop: <message>, code: <name>}`
// on refusal — the same discriminated shape `seedAtHead`/`seedListing`
// (src/kinds.js) already use for a $0 precheck a runner has to print and act
// on rather than catch.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, lstat, stat, access, copyFile, cp, open, rm, realpath, readlink, symlink, constants as fsConstants } from 'node:fs/promises';
import { dirname, join, resolve, sep, basename } from 'node:path';
import { git } from './kinds.js';
import { MAX_BUFFER } from './kinds.js';
import { PROVIDER_TIMEOUT_MS } from './clock.js';
import { scanSecrets, SECRET_PATTERNS, SECRET_PATTERN_NAMES } from './validate.js';

/** @typedef {{stop: string, code: string}} SourceRefusal a named, non-throwing stop */

/** the seed commit's identity — NEVER the operator's, NEVER global config
 * (CI has no gitconfig, and this repo never touches one either way): the
 * hidden tree is bareloop's own scratch plumbing, so its one commit is
 * authored by bareloop, not by whoever happens to run it. `commit.gpgsign`
 * is pinned off for the same reason a global config is never read: a
 * machine with `commit.gpgsign=true` in ITS OWN global config would
 * otherwise make this $0 step fail on a signing key that has nothing to do
 * with the job. */
const GIT_IDENTITY = ['-c', 'user.name=bareloop', '-c', 'user.email=bareloop@localhost', '-c', 'commit.gpgsign=false'];

/** a live-proven defect (found reviewing M2b fix 7): a copied `.git/hooks`
 * carries the SOURCE repo's own scripts, and `git commit` runs them —
 * `pre-commit`/`commit-msg`/`post-commit` are arbitrary code, and copying a
 * repo source would otherwise execute whatever the original author put
 * there, inside bareloop's own process, before a single token spends. The
 * hooks directory is stripped after the `.git` copy (below) AND every git
 * call this door makes pins `core.hooksPath` to a path that is never
 * created, so a `core.hooksPath` set in the copied `.git/config` to point
 * somewhere else on disk cannot resurrect the hole either. Belt and braces,
 * not redundant: either alone leaves a way back in. */
const NO_HOOKS = ['-c', 'core.hooksPath=/dev/null/bareloop-no-hooks'];

/** content-types this door accepts for a URL source (hamr: "start with
 * already supported files") — `text/*` covers `text/csv` already; it is kept
 * spelled out because the PRD ruling names it explicitly and a reader
 * checking this list against that ruling should find it there verbatim. */
const TEXT_CONTENT_TYPES = [/^text\//, /^application\/json/, /^application\/xml/];

/** an environment file, refused by NAME whatever it contains (hamr's ruling,
 * PRD item 33/M2b fix 2). The content scan (`scanFilesForSecrets`) catches a
 * key it KNOWS the shape of; this catches the file people keep keys in even
 * when the shape is one nobody inventoried yet — the two are belt and braces,
 * not duplicates. */
const ENV_FILE = /^\.env($|\.)/;

/** how many same-day deliveries one destination name can take before the door
 * gives up (`profile-2026-09-12.md`, `-2`, … `-99`). A cap, never a silent
 * overwrite: past it, `destination-exists`. */
const MAX_SAME_DAY = 99;

/** @param {string} code @param {string} stop @returns {SourceRefusal} */
const refuse = (code, stop) => ({ stop, code });

/** @param {Buffer} buf @returns {boolean} */
function hasNulByte(buf) {
  // "first 8 KB" (PRD/M2 text) — a NUL anywhere further in a huge log-shaped
  // file is not this door's problem; the point is a cheap, bounded sniff, not
  // a full-file binary detector.
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Sniff a file's first 8KB for a NUL byte WITHOUT reading the whole file — a
 * folder source may legally carry a file right up against `MAX_BUFFER`, and
 * reading it twice (once to sniff, once to freeze) doubles the cost of the
 * cheapest check here for nothing.
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function sniffNul(path) {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    return hasNulByte(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

/** @param {Buffer} buf @returns {string} */
const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Scan every frozen file's CONTENT for a known secret shape, using the SAME
 * inventory `scanSecrets` reads (`SECRET_PATTERNS`, src/validate.js) — never
 * a second, hand-typed pattern list. This is the fix for the live-proven
 * defect: the front door scanned only the URL string, so a plain folder or
 * file carrying a real API key (an `.env`, a checked-in credential) was
 * frozen into the tree and committed to the hidden git seed untouched.
 *
 * Names the file(s) and the PATTERN NAME(S) only — computed by testing each
 * pattern in isolation (never by reading `scanSecrets`' own matched text),
 * so the actual secret substring never has to exist in a variable that could
 * leak into a refusal, a manifest, stdout, or a log. Whole-file content is
 * decoded and tested, never a sampled prefix (the NUL sniff samples 8KB; a
 * secret check must not — a key can sit anywhere in a large file).
 * @param {string} text one file's decoded content
 * @returns {string[]} the names of every pattern that hit, empty when none did
 */
function secretPatternNames(text) {
  return SECRET_PATTERN_NAMES.filter((_, i) => SECRET_PATTERNS[i].test(text));
}

/**
 * Walk a plain folder recursively, refusing on the first symlink, nested
 * repo, environment file, oversize file, or binary file it finds. Returns
 * every REGULAR file, relative to `root`. This is the PLAIN-FOLDER path only
 * — a repo source is enumerated by `listRepoFiles` instead (D1 rework,
 * `docs/product/ITEM33-BUILD.md`), which reads git's own tracked-file list
 * rather than walking the filesystem, so nothing gitignored or untracked
 * (npm's `node_modules/.bin/*` symlinks included) is ever a candidate here.
 *
 * A symlink is named and never followed (PRD ruling) — walking into it would
 * silently widen the frozen copy to whatever the link points at, which nobody
 * signed. A `.git` anywhere below the root is a NESTED repo (M2b fix 6): its
 * objects are a second history nobody declared, and `git add` would either
 * swallow it as a gitlink or drop its files entirely, so the seed would not
 * hold what the manifest says it holds.
 * @param {string} root
 * @returns {Promise<{stop: null, files: string[]}|SourceRefusal>}
 */
async function walkFolder(root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const notText = [];
  /** @type {string[]} */
  const oversize = [];
  /** @param {string} dir @param {string} rel */
  async function walk(dir, rel) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) return refuse('source-symlink', `${relPath} is a symlink — named, never followed (a followed link would silently widen the frozen copy to whatever it points at)`);
      if (e.name === '.git') {
        return refuse('source-nested-repo', `${relPath} is a nested git repo — refused, because the seed commit cannot hold a second history honestly (the files under it would be swallowed as a gitlink or dropped outright, and the manifest would then claim bytes the seed does not carry)`);
      }
      if (ENV_FILE.test(e.name)) {
        return refuse('source-env-file', `${relPath} is an environment file — refused by NAME, whatever it contains (hard line: secrets never enter the tree)`);
      }
      if (e.isDirectory()) {
        const sub = await walk(join(dir, e.name), relPath);
        if (sub) return sub;
      } else if (e.isFile()) {
        const st = await stat(join(dir, e.name));
        if (st.size > MAX_BUFFER) { oversize.push(`${relPath} (${st.size}B)`); continue; }
        if (await sniffNul(join(dir, e.name))) { notText.push(relPath); continue; }
        files.push(relPath);
      }
      // neither file, dir, nor symlink (a socket, a fifo) — silently skipped;
      // nothing this door reads or writes can be one
    }
    return null;
  }
  const walkStop = await walk(root, '');
  if (walkStop) return walkStop;
  if (oversize.length) {
    return refuse('source-file-oversize', `${oversize.length} file(s) are over the ${MAX_BUFFER}B per-file ceiling — a source door freezes what a run can actually read, never a file it would only ever see a truncated prefix of: ${oversize.join(', ')}`);
  }
  if (notText.length) {
    return refuse('source-not-text', `${notText.length} file(s) carry a NUL byte in their first 8KB — text only for now (hole H7: PDF/Word input needs a reader this door does not have): ${notText.join(', ')}`);
  }
  return { stop: null, files };
}

/**
 * Enumerate a REPO source's files the D1 way (hamr's ruling, verbatim:
 * "copy only what git tracks"): `git ls-files --stage` in the source, never a
 * filesystem walk — closes F164 (npm's `node_modules/.bin/*` symlinks are
 * never candidates at all, because they are never tracked) and F165 (nothing
 * gitignored or untracked can reach this list, so nothing gitignored can
 * reach the tree or the seed no matter what `git add` flag runs later).
 *
 * Each tracked path's WORKING-TREE content is what gets frozen (so
 * uncommitted edits to a tracked file come along) — this function only
 * enumerates and classifies; the caller reads bytes.
 *
 * A gitlink entry (mode `160000`, a real submodule) is refused
 * `source-nested-repo` — it names a second history the seed cannot hold
 * honestly, the same reason a nested `.git` is refused for a plain folder.
 * A symlink entry (mode `120000`) is refused `source-symlink` ONLY when it
 * resolves outside `root` — one that stays inside is legal tracked content
 * and is copied verbatim as a link (never dereferenced).
 * @param {string} root the repo's working directory (its `.git` is handled
 *   separately by the caller, which copies it verbatim)
 * @returns {Promise<{stop: null, files: {rel: string, abs?: string, symlinkTarget?: string}[]}|SourceRefusal>}
 */
async function listRepoFiles(root) {
  const ls = await git(root, ['ls-files', '-z', '--stage']);
  if (!ls.ok) return refuse('source-git-failed', `git ls-files failed in ${root}: ${ls.err}`);
  const entries = ls.out.split('\0').filter(Boolean);
  /** @type {{rel: string, abs?: string, symlinkTarget?: string}[]} */
  const files = [];
  const rootReal = await realpath(root);
  for (const entry of entries) {
    // "<mode> <sha> <stage>\t<path>" — the mode tells a gitlink (submodule)
    // and a symlink apart from an ordinary tracked file without ever reading
    // bytes for it.
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const mode = entry.slice(0, tab).split(' ')[0];
    const rel = entry.slice(tab + 1);
    if (mode === '160000') {
      return refuse('source-nested-repo', `${rel} is a submodule (a gitlink entry) — refused, the same reason a nested .git is: a second history the seed commit cannot hold honestly`);
    }
    if (ENV_FILE.test(basename(rel))) {
      return refuse('source-env-file', `${rel} is an environment file — refused by NAME, whatever it contains (hard line: secrets never enter the tree)`);
    }
    if (mode === '120000') {
      let target;
      try { target = await readlink(join(root, rel)); } catch (e) {
        return refuse('source-unreadable', `${rel}: tracked symlink could not be read (${/** @type {Error} */ (e)?.message ?? e})`);
      }
      let resolved = null;
      try { resolved = await realpath(join(root, rel)); } catch { /* a dangling link resolves to nothing — treated as outside, below */ }
      if (resolved === null || !(resolved === rootReal || resolved.startsWith(`${rootReal}${sep}`))) {
        return refuse('source-symlink', `${rel} is a symlink resolving outside ${root} — refused (a link leaving the source root would silently widen the frozen copy to whatever it points at); a link that stays inside the root is legal tracked content and is copied verbatim`);
      }
      files.push({ rel, symlinkTarget: target });
    } else {
      files.push({ rel, abs: join(root, rel) });
    }
  }
  return { stop: null, files };
}

/**
 * Fetch a URL source ONCE — plain `fetch`, no credentials, no cookies, no
 * custom headers — under an injectable deadline (production default
 * `PROVIDER_TIMEOUT_MS`, reused from `src/clock.js` rather than a second
 * number; a test injects a short one so a silent-server case does not cost
 * real minutes). The body is read as it streams so an oversize response is
 * caught at `MAX_BUFFER` (`src/kinds.js`, reused) WITHOUT ever buffering more
 * than the ceiling — a `response.text()` on a large body would have already
 * paid the memory cost this exists to cap.
 * @param {string} url
 * @param {number} timeoutMs
 * Redirects are FOLLOWED but never invisible (M2b fix 5): the URL the body
 * actually came from (`res.url`) rides back out, into the manifest and onto
 * `prep-source`'s stdout, so a link that quietly lands on a login page or a
 * different host is something a person can SEE before a single token spends.
 * @returns {Promise<{stop: null, buf: Buffer, contentType: string, finalUrl: string}|SourceRefusal>}
 */
async function fetchOnce(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { signal: ac.signal, redirect: 'follow', credentials: 'omit' });
  } catch (e) {
    if (/** @type {any} */ (e)?.name === 'AbortError') {
      return refuse('source-fetch-timeout', `${url} did not answer inside ${timeoutMs}ms — a timeout REFUSES here, it never falls back to a partial or cached read`);
    }
    return refuse('source-fetch-failed', `${url} could not be fetched: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return refuse('source-fetch-failed', `${url} answered ${res.status} ${res.statusText}`);
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!TEXT_CONTENT_TYPES.some((re) => re.test(contentType))) {
    return refuse('source-not-text', `${url} answered content-type "${contentType || '(none)'}" — text only for now (${TEXT_CONTENT_TYPES.map((r) => r.source).join(', ')})`);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    // a body-less 2xx (204, or a fetch polyfill with no stream) — nothing to
    // freeze, and an empty file would lie about having read something
    return refuse('source-fetch-failed', `${url} answered with no readable body`);
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BUFFER) {
      try { await reader.cancel(); } catch { /* best-effort — the fetch is being abandoned either way */ }
      return refuse('source-fetch-oversize', `${url} exceeded the ${MAX_BUFFER}B ceiling — the body is truncated, so any content read from it would be unknown, not zero`);
    }
    chunks.push(value);
  }
  return { stop: null, buf: Buffer.concat(chunks), contentType, finalUrl: res.url || url };
}

/**
 * Build the frozen source tree — `<into>/tree/input/…` (the copy), `<into>/tree/output/`
 * (empty, where the run writes), `<into>/source.json` (the manifest, OUTSIDE
 * the tree so no worker can read or edit it). One hidden git commit seeds the
 * tree with a neutralized identity; the seed sha rides in the manifest and is
 * what every close in this run measures against (`seedAtHead`, src/kinds.js).
 *
 * `destination`, when given, is recorded in the manifest (never in a signed
 * job spec — a job spec is a repeatable SHAPE, source/destination a PER-RUN
 * value, see `readSourceManifest`'s own comment) as the run's declared
 * drop-off point. D3 rework (hamr's ruling, 2026-09-12, condensed in
 * `docs/product/ITEM33-BUILD.md`): **destination is a DIRECTORY, never a
 * filename** — it may already exist (need not be empty), and it may sit
 * inside the source itself (the same-dir case: "i can limit your actions to
 * a certain fix in a certain dir and your output will also be there"). A job
 * may produce more than one file; the agent names them, and `copyOut`
 * delivers every non-empty file it finds under `output/`, each under its own
 * dated name. There is therefore no separate `output` field any more — the
 * old single-file `output-invalid` guard existed only to stop a
 * manifest-declared path from escaping the tree, and that vector is closed
 * structurally now: `copyOut` always reads `output/` itself, never a path a
 * manifest could have been hand-edited to name.
 *
 * A `kind: 'repo'` source's `destination` is a DIFFERENT thing entirely
 * (hamr: "destination if for code on a green then that would be the place
 * agent allowed to do changes") — it names the WRITE FENCE inside the copied
 * repo, the signed `writeScope` field's job (`src/job.js:363`), not a
 * filesystem drop-off point this door proves or copies into. It is recorded
 * as declared, unvalidated by `proveDestination`, and `frontDoorFromManifest`
 * never hands a repo source's destination to `copyOut` — wiring it into
 * `writeScope` is M3/M4's job, not this one.
 * @param {{source: string, into: string, destination?: string,
 *   fetchTimeoutMs?: number}} args `fetchTimeoutMs` is test-only — production
 *   callers omit it and get `PROVIDER_TIMEOUT_MS`.
 * @returns {Promise<{stop: null, into: string, tree: string, manifestPath: string, manifest: object}|SourceRefusal>}
 */
export async function prepareSource({ source, into, destination, fetchTimeoutMs = PROVIDER_TIMEOUT_MS }) {
  const intoAbs = resolve(into);
  if (existsSync(intoAbs)) {
    return refuse('into-exists', `${intoAbs} already exists — a source door writes a FRESH tree, never reuses one (the export worktree rule)`);
  }
  const isUrl = /^https?:\/\//i.test(source);
  // a CHEAP peek (a stat, never a read) at whether this source is going to
  // turn out to be a repo — needed here, before the source is actually
  // walked below, because a repo source's destination takes a DIFFERENT path
  // (the write-fence recording above) than every other kind's (the directory
  // proof). The real walk below makes the authoritative kind determination
  // (and refuses source-is-linked-worktree when `.git` is a file); this peek
  // only has to agree with it closely enough to route the destination check
  // correctly, and it does — both read the same `.git` existence test.
  let looksLikeRepoSource = false;
  if (!isUrl) {
    try {
      const peekAbs = resolve(source);
      const peekStat = await lstat(peekAbs);
      looksLikeRepoSource = peekStat.isDirectory() && existsSync(join(peekAbs, '.git'));
    } catch { /* an unreadable source is reported properly by the real walk below */ }
  }
  // hamr's ruling (PRD item 33): source AND destination are proven at job
  // start, $0 — and review finding #2 sharpens WHEN: before `into` is
  // created, never after, so a refused destination leaves nothing on disk
  // (no half-built tree for a job that was never going to be able to land
  // its result). Order matters here: this runs before any source is read,
  // fetched, or walked.
  if (destination !== undefined) {
    if (looksLikeRepoSource) {
      if (typeof destination !== 'string' || destination.length === 0) {
        return refuse('destination-invalid', 'destination must be a non-empty value — a repo source records it as the declared write fence, wired into writeScope in a later milestone');
      }
    } else {
      const dp = await proveDestination(destination, { into: intoAbs });
      if (dp.stop !== null) return dp;
    }
  }

  /** @type {{kind: 'url'|'file'|'folder'|'repo', files: {rel: string, abs?: string, buf?: Buffer, symlinkTarget?: string}[], root?: string, finalUrl?: string}} */
  let frozen;

  if (isUrl) {
    let u;
    try { u = new URL(source); } catch { return refuse('source-unreadable', `${source} does not parse as a URL`); }
    if (u.username !== '' || u.password !== '') {
      return refuse('source-unreadable', 'no embedded credentials (user:pass@host) — secrets never enter a source door, and a URL is fetched with no credentials at all');
    }
    if (scanSecrets(source).length) {
      return refuse('source-unreadable', 'the URL carries a known secret-token shape — secrets never enter the tree/manifest (hard line #3)');
    }
    const fetched = await fetchOnce(source, fetchTimeoutMs);
    if (fetched.stop !== null) return fetched;
    // the URL the body ACTUALLY came from, after any redirect (M2b fix 5) —
    // scanned the same way the typed one was, because a redirect target is a
    // string this door is about to write into the manifest. Reviewed and
    // deliberately NOT also re-checked for embedded credentials the way the
    // typed URL is: proven live (this session) that `fetch`'s own redirect
    // handling in 'cors' mode (the default this door uses) already returns a
    // network error — `source-fetch-failed` — for any redirect whose target
    // carries a `user:pass@host` userinfo, so a second check here would be
    // unreachable dead code, never provable by a real test.
    if (scanSecrets(fetched.finalUrl).length) {
      return refuse('source-unreadable', 'the URL redirected to a location carrying a known secret-token shape — secrets never enter the tree/manifest (hard line #3)');
    }
    // no reliable filename off a URL in general — the last path segment when
    // there is one, else a fixed name; either way ONE file, never a listing
    const last = new URL(fetched.finalUrl).pathname.split('/').filter(Boolean).at(-1);
    const rel = last || 'source.txt';
    if (ENV_FILE.test(rel)) {
      return refuse('source-env-file', `${fetched.finalUrl} names an environment file — refused by NAME, whatever it contains (hard line: secrets never enter the tree)`);
    }
    frozen = { kind: 'url', files: [{ rel, buf: fetched.buf }], finalUrl: fetched.finalUrl };
  } else {
    const sourceAbs = resolve(source);
    let st;
    try { st = await lstat(sourceAbs); } catch { return refuse('source-unreadable', `${source} does not exist or cannot be read`); }
    if (st.isSymbolicLink()) return refuse('source-symlink', `${source} is a symlink — named, never followed`);
    if (st.isDirectory()) {
      // M2b fix 7 (hamr: yes — the PR-review job): a git repo IS an allowed
      // source now. It is COPIED with its history, never used in place (the
      // patients-are-copies rule), and gets the same `output/`, manifest,
      // destination and copy-out every other source gets. Its own guards
      // (the input stays untouched) arrive with M4.
      const dotGit = join(sourceAbs, '.git');
      let isRepo = false;
      if (existsSync(dotGit)) {
        // a `.git` FILE (a linked worktree or a submodule) points its gitdir
        // somewhere else entirely — copying it would aim every git command,
        // the seed commit included, at the ORIGINAL repo. Refused, never
        // followed, for the same reason a symlink is.
        if (!(await lstat(dotGit)).isDirectory()) {
          return refuse('source-is-linked-worktree', `${source}/.git is a file, not a directory — this is a linked worktree or a submodule, whose real git directory lives elsewhere; point the door at the repo itself (a copy would silently commit into the original)`);
        }
        isRepo = true;
      }
      if (isRepo) {
        const walked = await listRepoFiles(sourceAbs);
        if (walked.stop !== null) return walked;
        frozen = { kind: 'repo', root: sourceAbs, files: walked.files };
      } else {
        const walked = await walkFolder(sourceAbs);
        if (walked.stop !== null) return walked;
        frozen = {
          kind: 'folder',
          root: sourceAbs,
          files: walked.files.map((rel) => ({ rel, abs: join(sourceAbs, rel) })),
        };
      }
    } else if (st.isFile()) {
      const name = /** @type {string} */ (source.split(sep).at(-1) ?? source);
      if (ENV_FILE.test(name)) {
        return refuse('source-env-file', `${source} is an environment file — refused by NAME, whatever it contains (hard line: secrets never enter the tree)`);
      }
      if (st.size > MAX_BUFFER) {
        return refuse('source-file-oversize', `${source} is ${st.size}B, over the ${MAX_BUFFER}B per-file ceiling — a source door freezes what a run can actually read, never a file it would only ever see a truncated prefix of`);
      }
      const buf = await readFile(sourceAbs);
      if (hasNulByte(buf.subarray(0, 8192))) return refuse('source-not-text', `${source} carries a NUL byte in its first 8KB — text only for now (hole H7)`);
      frozen = { kind: 'file', files: [{ rel: name, buf }] };
    } else {
      return refuse('source-unreadable', `${source} is neither a regular file, a folder, nor an http(s) URL`);
    }
    // D3 rework: a destination sitting inside the source is now LEGAL —
    // hamr's same-dir case ("i can limit your actions to a certain fix in a
    // certain dir and your output will also be there"). `destination-in-source`
    // is gone; `copyOut` never overwrites an existing file (dated names,
    // `COPYFILE_EXCL`), so a same-dir destination cannot clobber the source.
  }

  // a repo source keeps its own shape (the history is the point, and a
  // worker reviewing a PR needs the repo AT the tree root); every other kind
  // is frozen under `input/`, leaving `output/` as the only place a run writes
  const underInput = frozen.kind !== 'repo';
  /** @param {string} rel */
  const treeRel = (rel) => (underInput ? `input/${rel}` : rel);

  // hard line (CLAUDE.md): secrets never enter the tree, the spine, the
  // configs, or the ledger — an append-only log that captures a key captures
  // it forever. Every frozen file's content is scanned BEFORE anything is
  // written under `into` (no mkdir has run yet — a refusal here leaves
  // nothing on disk, `into` itself included). The matched text is never
  // read into this refusal — only the file path and the pattern name. One
  // file at a time: a repo source can be far larger than memory if every
  // buffer is held at once.
  //
  // D2 (closes the F166 residual): a BINARY file (a NUL byte in its first
  // 8KB) used to be hashed and never scanned — a named hole sitting on a hard
  // line. It now runs through the SAME `SECRET_PATTERNS` inventory, decoded
  // `latin1` rather than `utf8` — `latin1` is byte-preserving (one byte, one
  // code point), so an ASCII key sitting inside a compiled artifact still
  // matches; `utf8` would have thrown or mangled bytes on arbitrary binary
  // content. No second pattern list, ever.
  /** @type {{rel: string, names: string[]}[]} */
  const secretHits = [];
  /** @type {{path: string, bytes: number, sha256: string}[]} */
  const fileMeta = [];
  for (const f of frozen.files) {
    const buf = f.buf ?? (f.symlinkTarget !== undefined ? Buffer.from(f.symlinkTarget, 'utf8') : await readFile(/** @type {string} */ (f.abs)));
    fileMeta.push({ path: f.rel, bytes: buf.length, sha256: sha256Hex(buf) });
    const isBinary = f.symlinkTarget === undefined && hasNulByte(buf.subarray(0, 8192));
    const names = secretPatternNames(buf.toString(isBinary ? 'latin1' : 'utf8'));
    if (names.length) secretHits.push({ rel: f.rel, names });
  }
  if (secretHits.length) {
    const detail = secretHits.map((h) => `${h.rel} (${h.names.join(', ')})`).join('; ');
    return refuse('source-carries-secret', `${secretHits.length} file(s) carry a known secret shape — refused before anything was written (hard line #3, secrets never enter the tree): ${detail}`);
  }

  const treeDir = join(intoAbs, 'tree');
  const outputDir = join(treeDir, 'output');
  await mkdir(treeDir, { recursive: true });
  if (frozen.kind === 'repo') {
    // the history, copied verbatim — `verbatimSymlinks` so git's own internal
    // links are never dereferenced into copies of what they point at
    await cp(join(/** @type {string} */ (frozen.root), '.git'), join(treeDir, '.git'), { recursive: true, verbatimSymlinks: true });
    // strip the copied hooks (see NO_HOOKS above) — `force: true` because a
    // repo with no hooks configured has no `hooks/` to remove at all
    await rm(join(treeDir, '.git', 'hooks'), { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });
  // git tracks no empty directories — a `.gitkeep` is what makes `output/`
  // actually exist in the seed commit the close measures changes against
  await writeFile(join(outputDir, '.gitkeep'), '');
  for (const f of frozen.files) {
    const dest = join(treeDir, treeRel(f.rel));
    await mkdir(dirname(dest), { recursive: true });
    if (f.buf) await writeFile(dest, f.buf);
    else if (f.symlinkTarget !== undefined) await symlink(f.symlinkTarget, dest);
    else await copyFile(/** @type {string} */ (f.abs), dest);
  }

  if (frozen.kind !== 'repo') {
    const init = await git(treeDir, ['init', '-q']);
    if (!init.ok) return refuse('source-git-failed', `git init failed in ${treeDir}: ${init.err}`);
  }
  // `-f` (M2b fix 6) for a PLAIN FOLDER/FILE/URL source only: a `.gitignore`
  // sitting INSIDE such a source must never decide what the seed holds — the
  // hidden git tree has no gitignore of its own yet, so "gitignored" has no
  // honest meaning there. Every file this door froze is a file it promised
  // in the manifest, and a close measures the run's writes against the seed —
  // a file present on disk but absent from the seed would read as the worker
  // having written it.
  //
  // D1 rework (F165): a REPO source drops `-f`. Only tracked files ever reach
  // the copied tree (`listRepoFiles`, above) — nothing gitignored in the
  // SOURCE repo is a candidate to add at all — so a plain `add -A` here adds
  // modifications to already-tracked paths and never force-resurrects
  // anything the source repo chose to ignore (`node_modules`, a gitignored
  // `.env`, this repo's own `.claude/`).
  const addArgs = frozen.kind === 'repo' ? ['add', '-A'] : ['add', '-A', '-f'];
  const add = await git(treeDir, [...NO_HOOKS, ...addArgs]);
  if (!add.ok) return refuse('source-git-failed', `git add failed in ${treeDir}: ${add.err}`);
  const commit = await git(treeDir, [...GIT_IDENTITY, ...NO_HOOKS, 'commit', '-q', '-m', 'bareloop: source front door seed']);
  if (!commit.ok) return refuse('source-git-failed', `git commit failed in ${treeDir}: ${commit.err}`);
  const head = await git(treeDir, ['rev-parse', 'HEAD']);
  if (!head.ok) return refuse('source-git-failed', `git rev-parse HEAD failed in ${treeDir}: ${head.err}`);
  const seed = head.out.trim();

  // M2b fix 6, the CHECK rather than the hope: the manifest says the seed
  // holds these files, so read the seed back and prove it does. A bare
  // emptiness check would miss partial omission (memory: a completeness guard
  // built on an emptiness check misses exactly this), so the two sets are
  // diffed, both ways, by name.
  const listed = await git(treeDir, ['ls-tree', '-r', '--name-only', 'HEAD']);
  if (!listed.ok) return refuse('source-git-failed', `git ls-tree failed in ${treeDir}: ${listed.err}`);
  const inSeed = new Set(listed.out.split('\n').map((l) => l.trim()).filter(Boolean));
  const missing = fileMeta.map((f) => treeRel(f.path)).filter((p) => !inSeed.has(p));
  if (missing.length) {
    return refuse('source-seed-incomplete', `${missing.length} frozen file(s) are missing from the seed commit — the manifest would claim bytes the seed does not carry, and a close would read them as the worker's own writes: ${missing.join(', ')}`);
  }

  const manifest = {
    kind: frozen.kind,
    source,
    ...(frozen.finalUrl === undefined ? {} : { finalUrl: frozen.finalUrl }),
    fetchedAt: new Date().toISOString(),
    files: fileMeta,
    seed,
    destination: destination ?? null,
  };
  const manifestPath = join(intoAbs, 'source.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { stop: null, into: intoAbs, tree: treeDir, manifestPath, manifest };
}

/**
 * The delivered name (M2b fix 4, kept under D3): a destination FILE of
 * `/home/me/profile.md` lands as `/home/me/profile-2026-09-12.md`, and a
 * SECOND delivery of the same name the same day as
 * `profile-2026-09-12-2.md`, `-3`, … (the work-branch collision rule, the same
 * spelling `prepareWorkBranch` uses). The date is the delivery's, not the
 * run's: what a person wants to know opening the folder later is when the file
 * arrived. D3: `destination` here is a FULL FILE PATH inside the destination
 * DIRECTORY (`copyOut` builds one per output file it delivers) — this
 * function itself is unchanged from M2b, it is just no longer handed the
 * bare top-level destination directly.
 *
 * Nothing is ever overwritten, which is why the name is computed rather than
 * taken: a plain `profile.md` would eventually collide with the person's own
 * file or a previous run's, and the only honest answers to a collision are
 * "refuse" or "a new name" — hamr picked a new name.
 * @param {string} destination the absolute FILE path as declared
 * @param {Date} now
 * @param {number} n 1 = the plain dated name, 2+ = the same-day suffix
 * @returns {string}
 */
export function datedDestination(destination, now, n) {
  const dir = dirname(destination);
  const base = destination.slice(dir.length + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return join(dir, `${stem}-${day}${n > 1 ? `-${n}` : ''}${ext}`);
}

/**
 * The first dated name that is free, or a refusal when every same-day slot up
 * to `MAX_SAME_DAY` is taken. Used by `copyOut` at delivery time (per output
 * file) so a same-day repeat delivery of the same name never disagrees with
 * what "landable" means.
 * @param {string} destination an absolute FILE path
 * @param {Date} [now]
 * @returns {{stop: null, path: string}|SourceRefusal}
 */
export function pickDelivery(destination, now = new Date()) {
  for (let n = 1; n <= MAX_SAME_DAY; n++) {
    const candidate = datedDestination(destination, now, n);
    if (!existsSync(candidate)) return { stop: null, path: candidate };
  }
  return refuse('destination-exists', `every same-day name for ${destination} is taken (up to -${MAX_SAME_DAY}) — bareloop never overwrites a person's file`);
}

/**
 * Prove a destination DIRECTORY is landable — $0, mechanical, before any
 * token spends (PRD item 33 ruling: "source and destination are proven at
 * job start"). D3 rework (hamr's ruling, 2026-09-12): **destination is a
 * directory, never a filename** — it may already exist, and need not be
 * empty (a job may write into a folder that already holds other files, or
 * even sit inside the source itself, the same-dir case). What this proves is
 * narrower than the M2/M2b version: only that the directory is USABLE
 * (exists as a directory and is writable, or can be created) — it can say
 * nothing about individual delivered FILE names, because those are not known
 * until the run actually produces them (the agent names its own output
 * files); per-file same-day collisions are handled at delivery time, inside
 * `copyOut`, via `pickDelivery`.
 * @param {unknown} destination absolute directory path
 * @param {{into: string}} o `into` — the run's own scratch root (prepared by
 *   `prepareSource`, or a run's own `workdir` when there is no source door);
 *   the destination may never sit inside it.
 * @returns {Promise<{stop: null}|SourceRefusal>}
 */
export async function proveDestination(destination, { into }) {
  if (typeof destination !== 'string' || destination.length === 0) {
    return refuse('destination-invalid', 'destination must be a non-empty absolute path');
  }
  if (!destination.startsWith(sep) && !/^[a-zA-Z]:[\\/]/.test(destination)) {
    return refuse('destination-not-absolute', `${destination} is not absolute — the destination is a LOCAL directory the person moves elsewhere themselves, never a scope-relative path`);
  }
  const destAbs = resolve(destination);
  const intoAbs = resolve(into);
  if (destAbs === intoAbs || destAbs.startsWith(`${intoAbs}${sep}`)) {
    return refuse('destination-contained', `${destination} sits inside ${into} — the drop-off point may never be inside the run's own scratch tree`);
  }
  let dstat = null;
  try { dstat = await stat(destAbs); } catch { /* does not exist yet — proven creatable below */ }
  if (dstat !== null) {
    if (!dstat.isDirectory()) {
      return refuse('destination-not-directory', `${destination} exists and is not a directory — the destination is a DIRECTORY a job writes one or more named files into, never a filename itself`);
    }
    try {
      await access(destAbs, fsConstants.W_OK);
    } catch {
      return refuse('destination-not-writable', `${destination} exists but is not writable`);
    }
    return { stop: null };
  }
  const parent = dirname(destAbs);
  let pstat;
  try { pstat = await stat(parent); } catch {
    return refuse('destination-parent-missing', `${parent} does not exist — create it first, or point the destination somewhere that does`);
  }
  if (!pstat.isDirectory()) {
    return refuse('destination-parent-missing', `${parent} is not a directory`);
  }
  try {
    await access(parent, fsConstants.W_OK);
  } catch {
    return refuse('destination-parent-unwritable', `${parent} exists but is not writable`);
  }
  return { stop: null };
}

/**
 * Recursively list every REGULAR file under `dir`, relative to it, excluding
 * `.gitkeep` (the seed placeholder that makes the empty `output/` directory
 * exist in git — never a delivered file). A symlink is skipped, never
 * followed — this door has no reason to ever deliver one, since nothing this
 * run itself wrote under `output/` should be a link at all.
 * @param {string} dir @param {string} [rel]
 * @returns {Promise<string[]>}
 */
async function listOutputFiles(dir, rel = '') {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  /** @type {string[]} */
  let out = [];
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (relPath === '.gitkeep') continue;
    if (e.isDirectory()) out = out.concat(await listOutputFiles(join(dir, e.name), relPath));
    else if (e.isFile()) out.push(relPath);
  }
  return out;
}

/**
 * Copy the run's own output to the proven destination DIRECTORY — once per
 * file, never overwriting (`COPYFILE_EXCL`, so even a file that appears
 * between `proveDestination` and here refuses rather than clobbers), on a
 * minted green only. This function renders no verdict and changes none: a
 * refusal here is reported beside the green it could not deliver, never
 * folded back into it.
 *
 * D3 rework (hamr's ruling, 2026-09-12): a job may produce MORE THAN ONE
 * file (his example: a flight search producing one sheet for "SFO→LAX
 * red-eye" and another for "SFO under $700") — the agent names them
 * meaningfully, and EVERY non-empty file under `tree/output/` (excluding
 * `output/.gitkeep`) is delivered, each under its own dated name
 * (`datedDestination`/`pickDelivery`, M2b fix 4, unchanged). An empty file is
 * silently skipped (not a delivered result, same judgment M2b made for the
 * single-file case) rather than refusing the whole batch over one empty
 * file; the refusal is reserved for the case where NOTHING is left to
 * deliver at all.
 *
 * `into`, when given, is the run's own SCRATCH ROOT (`prepareSource`'s
 * `into`, of which `tree` is the `tree/` subdirectory) — review finding #3:
 * a destination sitting inside `<into>` but outside `tree` (e.g. dropped
 * straight in the scratch area, never inside the frozen tree) must still
 * refuse `destination-contained`, which a containment check against `tree`
 * alone cannot see. Omitted, it defaults to `tree` (the pre-fix behaviour),
 * for direct callers that only ever had a tree, never an `into`.
 * @param {{tree: string, into?: string, destination: string}} o
 * @returns {Promise<{stop: null, files: {path: string, bytes: number, sha256: string}[]}|SourceRefusal>}
 */
export async function copyOut({ tree, into, destination }) {
  const prove = await proveDestination(destination, { into: into ?? tree });
  if (prove.stop !== null) return prove;
  const destAbs = resolve(destination);
  await mkdir(destAbs, { recursive: true });
  const outputDir = join(tree, 'output');
  const candidates = await listOutputFiles(outputDir);
  /** @type {{path: string, bytes: number, sha256: string}[]} */
  const delivered = [];
  for (const rel of candidates) {
    const srcPath = join(outputDir, rel);
    const buf = await readFile(srcPath);
    if (buf.length === 0) continue; // an empty file is not a delivered result — skipped, never refused
    const declaredFile = join(destAbs, rel);
    await mkdir(dirname(declaredFile), { recursive: true });
    const pick = pickDelivery(declaredFile);
    if (pick.stop !== null) return pick;
    try {
      // `COPYFILE_EXCL` is the race backstop for a file that appears between
      // `pickDelivery` choosing a free name and this line — a mutation that
      // drops it survives every test in this file for exactly that reason,
      // and is a known, accepted survivor, not a gap.
      await copyFile(srcPath, pick.path, fsConstants.COPYFILE_EXCL);
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 'EEXIST') return refuse('destination-exists', `${pick.path} already exists — bareloop never overwrites a person's file`);
      return refuse('destination-write-failed', `copying to ${pick.path} failed: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
    }
    delivered.push({ path: pick.path, bytes: buf.length, sha256: sha256Hex(buf) });
  }
  if (delivered.length === 0) {
    return refuse('destination-output-missing', `no non-empty file exists under ${outputDir} — the run never produced anything this job was declared to write`);
  }
  return { stop: null, files: delivered };
}

/**
 * Read a source-door manifest, if one is there. mid-build spec correction
 * (2026-09-11, the main session, on hamr's question about export): a job
 * spec is a SHAPE, signed once — source and destination are a PER-RUN value,
 * the way `bareloop run <bundle> --repo <path>` varies the repo instance
 * without touching the bundle's signature. Baking an absolute destination
 * path into `job.js`/`jobSpecHash` would sign one instance where the spec is
 * meant to describe a repeatable shape, so the run instance lives HERE
 * instead — the manifest `prepareSource` already writes outside the tree —
 * and nothing was added to the job schema.
 *
 * Absence is reported as absence: a patient the JOBS table points at
 * directly, never having gone through `prepareSource`, has no manifest, and
 * that IS "repo jobs untouched" — nothing here invents a destination for a
 * job that never declared one. A manifest that EXISTS but cannot be read or
 * parsed is a named stop, never a silent skip: the run has evidence
 * something is there and wrong, and hiding that is worse than refusing on it.
 * @param {string} into the manifest's own directory — `<into>/source.json`
 *   (a run-u-style caller passes `dirname(workdir)`, since `workdir` IS
 *   `<into>/tree`)
 * @returns {Promise<{stop: null, present: false, manifest: null}|{stop: null, present: true, manifest: Record<string, any>}|SourceRefusal>}
 */
export async function readSourceManifest(into) {
  const manifestPath = join(resolve(into), 'source.json');
  if (!existsSync(manifestPath)) return { stop: null, present: false, manifest: null };
  let raw;
  try { raw = await readFile(manifestPath, 'utf8'); } catch (e) {
    return refuse('source-manifest-unreadable', `${manifestPath} exists but could not be read: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch (e) {
    return refuse('source-manifest-invalid', `${manifestPath} is not valid JSON: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return refuse('source-manifest-invalid', `${manifestPath} must contain a JSON object`);
  }
  return { stop: null, present: true, manifest };
}

/**
 * Reduce a `readSourceManifest` success result to the `{destination}` a
 * runner acts on, or `null` when there is none to act on (no manifest, one
 * that never declared a destination, or — D3 — a `kind: 'repo'` manifest,
 * whose `destination` names the WRITE FENCE inside the copied repo, never a
 * filesystem drop-off point this door proves or copies into: "repo jobs
 * UNCHANGED", `writeScope` already does that job, `src/job.js:363`). Pure
 * extraction of the one piece of `run-u.mjs`'s front-door reading that has
 * any logic in it (the rest is spine emits and control flow) —
 * unit-testable apart from the script, which is otherwise unreachable
 * without a live provider key.
 * @param {{present: boolean, manifest: Record<string, any>|null}} read
 * @returns {{destination: string}|null}
 */
export function frontDoorFromManifest(read) {
  if (!read.present || !read.manifest) return null;
  if (read.manifest.kind === 'repo') return null;
  const { destination } = read.manifest;
  if (typeof destination !== 'string' || !destination) return null;
  return { destination };
}
