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
import { mkdir, readdir, readFile, writeFile, lstat, stat, access, copyFile, constants as fsConstants } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
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

/** content-types this door accepts for a URL source (hamr: "start with
 * already supported files") — `text/*` covers `text/csv` already; it is kept
 * spelled out because the PRD ruling names it explicitly and a reader
 * checking this list against that ruling should find it there verbatim. */
const TEXT_CONTENT_TYPES = [/^text\//, /^application\/json/, /^application\/xml/];

/** @param {string} code @param {string} stop @returns {SourceRefusal} */
const refuse = (code, stop) => ({ stop, code });

/**
 * Validate an `output` value the ONE way, everywhere it is read or written —
 * mutation review finding (PRD item 33/M2 fixes): `prepareSource` is about to
 * SIGN a value into a fresh manifest, and `copyOut`/`frontDoorFromManifest`
 * may be reading one back off a manifest a person can hand-edit; the same
 * string hurts either caller the same way (`output/../../x` resolves,
 * `resolve(tree, output)`, to a path OUTSIDE the tree, and `copyOut` would
 * then happily read whatever sits there). One validator, one refusal code,
 * used by all three.
 * @param {unknown} output
 * @returns {{stop: null}|SourceRefusal}
 */
function validateOutput(output) {
  if (typeof output !== 'string' || output.length === 0) {
    return refuse('output-invalid', 'output must be a non-empty relative path');
  }
  if (output.includes('\\')) {
    return refuse('output-invalid', `${output} must be a POSIX path — no backslashes`);
  }
  if (output.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(output)) {
    return refuse('output-invalid', `${output} must be relative, never absolute`);
  }
  const segments = output.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return refuse('output-invalid', `${output} must be a normalized path — no empty, "." or ".." segments`);
  }
  if (segments[0] !== 'output') {
    return refuse('output-invalid', `${output} must start with "output/" — the run's own output directory, never anywhere else in the tree`);
  }
  if (segments.length === 1) {
    return refuse('output-invalid', 'output must name a FILE under output/, never the bare "output" directory itself');
  }
  if (output === 'output/.gitkeep') {
    return refuse('output-invalid', 'output/.gitkeep is the seed placeholder that makes the empty directory exist in git — never a delivered file');
  }
  return { stop: null };
}

/** @param {Buffer} buf @returns {boolean} */
function hasNulByte(buf) {
  // "first 8 KB" (PRD/M2 text) — a NUL anywhere further in a huge log-shaped
  // file is not this door's problem; the point is a cheap, bounded sniff, not
  // a full-file binary detector.
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
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
 * @param {{rel: string, buf: Buffer}[]} files
 * @returns {{rel: string, names: string[]}[]} one entry per file that hit,
 *   empty when none did
 */
function scanFilesForSecrets(files) {
  const hits = [];
  for (const f of files) {
    const text = f.buf.toString('utf8');
    const names = SECRET_PATTERN_NAMES.filter((_, i) => SECRET_PATTERNS[i].test(text));
    if (names.length) hits.push({ rel: f.rel, names });
  }
  return hits;
}

/**
 * Walk a folder recursively, refusing on the first symlink or NUL-byte file
 * it finds. Returns every REGULAR file, relative to `root`. A symlink is
 * named and never followed (PRD ruling) — walking into it would silently
 * widen the frozen copy to whatever the link points at, which nobody signed.
 * @param {string} root
 * @returns {Promise<{stop: null, files: string[]}|SourceRefusal>}
 */
async function walkFolder(root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const notText = [];
  /** @param {string} dir @param {string} rel */
  async function walk(dir, rel) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) return refuse('source-symlink', `${relPath} is a symlink — named, never followed (a followed link would silently widen the frozen copy to whatever it points at)`);
      if (e.isDirectory()) {
        // a nested `.git` is not this door's business (only the SOURCE ROOT is
        // checked for `source-is-repo`) — a plain folder that happens to
        // contain a vendored repo is still a plain folder from here
        const sub = await walk(join(dir, e.name), relPath);
        if (sub) return sub;
      } else if (e.isFile()) {
        const buf = await readFile(join(dir, e.name));
        if (hasNulByte(buf)) notText.push(relPath);
        else files.push(relPath);
      }
      // neither file, dir, nor symlink (a socket, a fifo) — silently skipped;
      // nothing this door reads or writes can be one
    }
    return null;
  }
  const walkStop = await walk(root, '');
  if (walkStop) return walkStop;
  if (notText.length) {
    return refuse('source-not-text', `${notText.length} file(s) carry a NUL byte in their first 8KB — text only for now (hole H7: PDF/Word input needs a reader this door does not have): ${notText.join(', ')}`);
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
 * @returns {Promise<{stop: null, buf: Buffer, contentType: string}|SourceRefusal>}
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
  return { stop: null, buf: Buffer.concat(chunks), contentType };
}

/**
 * Build the frozen source tree — `<into>/tree/input/…` (the copy), `<into>/tree/output/`
 * (empty, where the run writes), `<into>/source.json` (the manifest, OUTSIDE
 * the tree so no worker can read or edit it). One hidden git commit seeds the
 * tree with a neutralized identity; the seed sha rides in the manifest and is
 * what every close in this run measures against (`seedAtHead`, src/kinds.js).
 *
 * `destination`/`output`, when given, are recorded in the manifest (never in
 * a signed job spec — a job spec is a repeatable SHAPE, source/destination a
 * PER-RUN value, see `readSourceManifest`'s own comment) as the run's
 * declared drop-off point — `destination` absolute, `output` relative under
 * `output/`. Required TOGETHER, the same shape `job.js`'s `judge` field
 * requires its provider/model together: a destination with no output name,
 * or an output name with nowhere to land, is a state nobody can act on
 * honestly.
 * @param {{source: string, into: string, destination?: string, output?: string,
 *   fetchTimeoutMs?: number}} args `fetchTimeoutMs` is test-only — production
 *   callers omit it and get `PROVIDER_TIMEOUT_MS`.
 * @returns {Promise<{stop: null, into: string, tree: string, manifestPath: string, manifest: object}|SourceRefusal>}
 */
export async function prepareSource({ source, into, destination, output, fetchTimeoutMs = PROVIDER_TIMEOUT_MS }) {
  if ((destination === undefined) !== (output === undefined)) {
    return refuse('destination-output-required', 'destination and output are signed together — a destination with no output name, or an output name with nowhere to land, is a state nobody can act on');
  }
  const intoAbs = resolve(into);
  if (existsSync(intoAbs)) {
    return refuse('into-exists', `${intoAbs} already exists — a source door writes a FRESH tree, never reuses one (the export worktree rule)`);
  }
  // hamr's ruling (PRD item 33): source AND destination are proven at job
  // start, $0 — and review finding #2 sharpens WHEN: before `into` is
  // created, never after, so a refused destination leaves nothing on disk
  // (no half-built tree for a job that was never going to be able to land
  // its result). Order matters here: this runs before any source is read,
  // fetched, or walked.
  if (destination !== undefined) {
    const ov = validateOutput(output);
    if (ov.stop !== null) return ov;
    const dp = await proveDestination(destination, { into: intoAbs });
    if (dp.stop !== null) return dp;
  }

  const isUrl = /^https?:\/\//i.test(source);
  /** @type {{kind: 'url'|'file'|'folder', files: {rel: string, buf: Buffer}[]}} */
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
    // no reliable filename off a URL in general — the last path segment when
    // there is one, else a fixed name; either way ONE file, never a listing
    const last = u.pathname.split('/').filter(Boolean).at(-1);
    const rel = last || 'source.txt';
    frozen = { kind: 'url', files: [{ rel, buf: fetched.buf }] };
  } else {
    const sourceAbs = resolve(source);
    let st;
    try { st = await lstat(sourceAbs); } catch { return refuse('source-unreadable', `${source} does not exist or cannot be read`); }
    if (st.isSymbolicLink()) return refuse('source-symlink', `${source} is a symlink — named, never followed`);
    if (st.isDirectory()) {
      if (existsSync(join(sourceAbs, '.git'))) {
        return refuse('source-is-repo', `${source} is itself a git repo root — repo jobs keep --patient; this door is for plain folders, files and URLs`);
      }
      const walked = await walkFolder(sourceAbs);
      if (walked.stop !== null) return walked;
      const files = [];
      for (const rel of walked.files) files.push({ rel, buf: await readFile(join(sourceAbs, rel)) });
      frozen = { kind: 'folder', files };
    } else if (st.isFile()) {
      const buf = await readFile(sourceAbs);
      if (hasNulByte(buf)) return refuse('source-not-text', `${source} carries a NUL byte in its first 8KB — text only for now (hole H7)`);
      frozen = { kind: 'file', files: [{ rel: /** @type {string} */ (source.split(sep).at(-1) ?? source), buf }] };
    } else {
      return refuse('source-unreadable', `${source} is neither a regular file, a folder, nor an http(s) URL`);
    }
    // the destination may never land inside the source it is drawn from — a
    // "clean" run would otherwise overwrite the very material it read
    if (destination !== undefined) {
      const destAbs = resolve(destination);
      if (destAbs === sourceAbs || destAbs.startsWith(`${sourceAbs}${sep}`)) {
        return refuse('destination-in-source', `${destination} sits inside ${source} — the drop-off point may never be the material it was read from`);
      }
    }
  }

  // hard line (CLAUDE.md): secrets never enter the tree, the spine, the
  // configs, or the ledger — an append-only log that captures a key captures
  // it forever. Every frozen file's content is scanned BEFORE anything is
  // written under `into` (no mkdir has run yet — a refusal here leaves
  // nothing on disk, `into` itself included). The matched text is never
  // read into this refusal — only the file path and the pattern name.
  const secretHits = scanFilesForSecrets(frozen.files);
  if (secretHits.length) {
    const detail = secretHits.map((h) => `${h.rel} (${h.names.join(', ')})`).join('; ');
    return refuse('source-carries-secret', `${secretHits.length} file(s) carry a known secret shape — refused before anything was written (hard line #3, secrets never enter the tree): ${detail}`);
  }

  const treeDir = join(intoAbs, 'tree');
  const inputDir = join(treeDir, 'input');
  const outputDir = join(treeDir, 'output');
  await mkdir(inputDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  // git tracks no empty directories — a `.gitkeep` is what makes `output/`
  // actually exist in the seed commit the close measures changes against
  await writeFile(join(outputDir, '.gitkeep'), '');
  for (const f of frozen.files) {
    const dest = join(inputDir, f.rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, f.buf);
  }

  const init = await git(treeDir, ['init', '-q']);
  if (!init.ok) return refuse('source-git-failed', `git init failed in ${treeDir}: ${init.err}`);
  const add = await git(treeDir, ['add', '-A']);
  if (!add.ok) return refuse('source-git-failed', `git add failed in ${treeDir}: ${add.err}`);
  const commit = await git(treeDir, [...GIT_IDENTITY, 'commit', '-q', '-m', 'bareloop: source front door seed']);
  if (!commit.ok) return refuse('source-git-failed', `git commit failed in ${treeDir}: ${commit.err}`);
  const head = await git(treeDir, ['rev-parse', 'HEAD']);
  if (!head.ok) return refuse('source-git-failed', `git rev-parse HEAD failed in ${treeDir}: ${head.err}`);
  const seed = head.out.trim();

  const manifest = {
    kind: frozen.kind,
    source,
    fetchedAt: new Date().toISOString(),
    files: frozen.files.map((f) => ({ path: f.rel, bytes: f.buf.length, sha256: sha256Hex(f.buf) })),
    seed,
    destination: destination ?? null,
    output: output ?? null,
  };
  const manifestPath = join(intoAbs, 'source.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { stop: null, into: intoAbs, tree: treeDir, manifestPath, manifest };
}

/**
 * Prove a destination is landable — $0, mechanical, before any token spends
 * (PRD item 33 ruling: "source and destination are proven at job start").
 * Refuses rather than overwrites (bareloop never overwrites a person's file)
 * and rather than landing inside the run's own scratch tree.
 * @param {unknown} destination absolute path
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
    return refuse('destination-not-absolute', `${destination} is not absolute — the destination is a LOCAL file the person moves elsewhere themselves, never a scope-relative path`);
  }
  const destAbs = resolve(destination);
  const intoAbs = resolve(into);
  if (destAbs === intoAbs || destAbs.startsWith(`${intoAbs}${sep}`)) {
    return refuse('destination-contained', `${destination} sits inside ${into} — the drop-off point may never be inside the run's own scratch tree`);
  }
  if (existsSync(destAbs)) {
    return refuse('destination-exists', `${destination} already exists — bareloop never overwrites a person's file`);
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
 * Copy the run's own output to the proven destination — once, never
 * overwriting (the copy uses `COPYFILE_EXCL`, so even a file that appeared
 * between `proveDestination` and here refuses rather than clobbers), on a
 * minted green only. This function renders no verdict and changes none: a
 * refusal here is reported beside the green it could not deliver, never
 * folded back into it.
 * `into`, when given, is the run's own SCRATCH ROOT (`prepareSource`'s
 * `into`, of which `tree` is the `tree/` subdirectory) — review finding #3:
 * a destination sitting inside `<into>` but outside `tree` (e.g. dropped
 * straight in the scratch area, never inside the frozen tree) must still
 * refuse `destination-contained`, which a containment check against `tree`
 * alone cannot see. Omitted, it defaults to `tree` (the pre-fix behaviour),
 * for direct callers that only ever had a tree, never an `into`.
 * @param {{tree: string, into?: string, output: string, destination: string}} o
 * @returns {Promise<{stop: null, bytes: number, sha256: string}|SourceRefusal>}
 */
export async function copyOut({ tree, into, output, destination }) {
  const ov = validateOutput(output);
  if (ov.stop !== null) return ov;
  const prove = await proveDestination(destination, { into: into ?? tree });
  if (prove.stop !== null) return prove;
  const outputPath = resolve(tree, output);
  let buf;
  try { buf = await readFile(outputPath); } catch {
    return refuse('destination-output-missing', `${output} does not exist under ${tree} — the run never produced the file this job was declared to write`);
  }
  if (buf.length === 0) {
    return refuse('destination-output-empty', `${output} exists but is empty — an empty file is not a delivered result`);
  }
  // `COPYFILE_EXCL` is the race backstop for a file that appears between
  // `proveDestination` above and this line — `proveDestination` already
  // refuses an EXISTING file, so this flag is untestable without actually
  // winning a filesystem race (spawning a second writer timed to land inside
  // that window); a mutation that drops it survives every test in this file
  // for exactly that reason, and is a known, accepted survivor, not a gap.
  try {
    await copyFile(outputPath, destination, fsConstants.COPYFILE_EXCL);
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'EEXIST') return refuse('destination-exists', `${destination} already exists — bareloop never overwrites a person's file`);
    return refuse('destination-write-failed', `copying to ${destination} failed: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
  }
  return { stop: null, bytes: buf.length, sha256: sha256Hex(buf) };
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
 * Reduce a `readSourceManifest` success result to the `{destination, output}`
 * pair a runner acts on, or `null` when there is none to act on (no
 * manifest, or one that never declared a destination). Pure extraction of the
 * one piece of `run-u.mjs`'s front-door reading that has any logic in it
 * (the rest is spine emits and control flow) — unit-testable apart from the
 * script, which is otherwise unreachable without a live provider key.
 * @param {{present: boolean, manifest: Record<string, any>|null}} read
 * @returns {{destination: string, output: string}|null}
 */
export function frontDoorFromManifest(read) {
  if (!read.present || !read.manifest) return null;
  const { destination, output } = read.manifest;
  if (typeof destination !== 'string' || !destination) return null;
  // review finding #1: the manifest is hand-editable — a shape a person (or
  // a bug) put there that would let `output` escape the tree (`../../x`, an
  // absolute path, the bare `output/` directory) is treated the SAME as no
  // output declared at all, never passed through to `copyOut` unvalidated.
  if (validateOutput(output).stop !== null) return null;
  return { destination, output };
}
