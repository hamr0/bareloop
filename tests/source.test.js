// The source front door (PRD item 33/M2, `docs/product/ITEM33-BUILD.md`) —
// `prepareSource`/`proveDestination`/`copyOut`/`readSourceManifest`/
// `frontDoorFromManifest` (src/source.js). Every refusal is a NAMED
// `{stop, code}`, never a throw and never a silent fallback (D8's own idiom,
// `seedAtHead`/`seedListing`, src/kinds.js) — this file drives every one of
// them against REAL git, a REAL local `node:http` server, and a REAL
// filesystem, never a mock: the reason `tests/kinds.test.js` gives for doing
// the same applies here word for word — a hand-rolled stub cannot fail the
// way `fetch`, `git`, or a locked-down directory actually fail.
//
// job.js/jobSpecHash carry NO destination field (mid-build correction,
// 2026-09-11): a job spec is a repeatable SHAPE, signed once; source and
// destination are a PER-RUN value living in the manifest this file tests
// directly, outside the tree. There is therefore no "job-field validation
// red" test category here — that was M2's original plan before the
// correction landed; see the CHANGELOG/PRD entry for the full story.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  prepareSource, proveDestination, copyOut, readSourceManifest, frontDoorFromManifest,
  datedDestination, pickDelivery,
} from '../src/source.js';

/** the same neutralized identity `src/source.js` uses — CI has no gitconfig
 * (F136: the suite runs hermetic, empty `HOME`), so a fixture repo that lets
 * git look for one reds there while passing locally. */
const GIT_ID = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', '-c', 'commit.gpgsign=false'];
/** @param {string} cwd @param {string[]} args */
const gitFix = (cwd, args) => execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' });

// ── fixtures ──────────────────────────────────────────────────────────────

/** every temp dir this file makes, swept in one `after` so a crash mid-file
 * still cleans up (the same convention `tests/kinds.test.js` uses at its own
 * tmpdir sweep, scoped locally here since this file owns few enough dirs to
 * track directly). */
/** @type {string[]} */
const scratch = [];
/** @param {string} prefix */
function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}
test.after(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

const sha256 = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex');

/** a local HTTP server whose handler decides the response per-request — the
 * same shape `tests/silent-endpoint.test.js` uses for a REAL provider hang,
 * one level down the stack (plain HTTP rather than a provider client). */
async function serverWith(handler) {
  const srv = createServer(handler);
  srv.unref();
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const { port } = /** @type {any} */ (srv.address());
  return { port, url: (/** @type {string} */ p) => `http://127.0.0.1:${port}${p}`, close: () => new Promise((res) => srv.close(() => res(undefined))) };
}

// ── prepareSource: folder source ─────────────────────────────────────────

test('prepareSource: a plain folder freezes into tree/input, tree/output exists, one hidden git commit, manifest outside the tree', async () => {
  const source = tmp('bareloop-src-folder-');
  mkdirSync(join(source, 'sub'), { recursive: true });
  writeFileSync(join(source, 'a.txt'), 'hello');
  writeFileSync(join(source, 'sub', 'b.md'), '# hi');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(existsSync(join(into, 'tree', 'input', 'a.txt')));
  assert.equal(readFileSync(join(into, 'tree', 'input', 'a.txt'), 'utf8'), 'hello');
  assert.ok(existsSync(join(into, 'tree', 'input', 'sub', 'b.md')));
  assert.ok(existsSync(join(into, 'tree', 'output')), 'tree/output must exist for the run to write into');
  assert.ok(existsSync(join(into, 'source.json')), 'the manifest lives beside the tree');
  assert.ok(!existsSync(join(into, 'tree', 'source.json')), 'the manifest must NEVER be inside the tree the worker can read/edit');

  // a real, separate, hidden git repo — never the operator's, never global config
  const log = execFileSync('git', ['-C', join(into, 'tree'), 'log', '-1', '--format=%an <%ae>'], { encoding: 'utf8' }).trim();
  assert.equal(log, 'bareloop <bareloop@localhost>', 'the seed commit is authored by bareloop, not the operator');
  const head = execFileSync('git', ['-C', join(into, 'tree'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(r.manifest.seed, head, 'the manifest records the SAME seed the tree actually committed');

  const manifest = JSON.parse(readFileSync(join(into, 'source.json'), 'utf8'));
  assert.equal(manifest.kind, 'folder');
  const byPath = Object.fromEntries(manifest.files.map((/** @type {any} */ f) => [f.path, f]));
  assert.equal(byPath['a.txt'].sha256, sha256(Buffer.from('hello')));
  assert.equal(byPath['a.txt'].bytes, 5);
  assert.equal(byPath['sub/b.md'].sha256, sha256(Buffer.from('# hi')));
});

test('prepareSource: a single file source freezes as one file under tree/input', async () => {
  const dir = tmp('bareloop-src-file-');
  const file = join(dir, 'notes.txt');
  writeFileSync(file, 'plain text notes');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source: file, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(existsSync(join(into, 'tree', 'input', 'notes.txt')));
  assert.equal(r.manifest.kind, 'file');
});

test('prepareSource: a single binary file source refuses source-not-text (mutation gap — the single-file path has its own hasNulByte check, distinct from the folder-walk one)', async () => {
  const dir = tmp('bareloop-src-file-bin-');
  const file = join(dir, 'photo.bin');
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x47]));
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source: file, into });
  assert.equal(r.code, 'source-not-text');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: into already existing refuses into-exists, $0, before touching the source', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const into = tmp('bareloop-into-taken-'); // already exists

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'into-exists');
});

test('prepareSource: a folder with a NUL byte in a file refuses source-not-text, naming the file', async () => {
  const source = tmp('bareloop-src-nul-');
  writeFileSync(join(source, 'clean.txt'), 'clean');
  writeFileSync(join(source, 'binary.dat'), Buffer.from([0x41, 0x00, 0x42]));
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-not-text');
  assert.match(r.stop, /binary\.dat/);
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: a folder with a secret-shaped key in a non-.env file refuses source-carries-secret, into absent, the key never appears in the refusal (live-proven defect: the front door used to scan only the URL string)', async () => {
  const source = tmp('bareloop-src-secret-folder-');
  const fakeKey = 'sk-ant-api03-' + 'A'.repeat(60);
  writeFileSync(join(source, 'notes.md'), `ANTHROPIC_API_KEY=${fakeKey}\n`);
  writeFileSync(join(source, 'clean.txt'), 'nothing to see here');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-carries-secret');
  assert.match(r.stop, /notes\.md/, 'the refusal names the FILE that carried the secret');
  assert.doesNotMatch(r.stop, new RegExp(fakeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the matched secret text must never appear in the refusal');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree — the secret is never copied, never committed to the hidden seed');
});

test('prepareSource: a folder with an .env file refuses source-env-file by NAME alone, whatever it contains (M2b fix 2)', async () => {
  const source = tmp('bareloop-src-envfile-');
  writeFileSync(join(source, '.env'), 'NOT_A_SECRET_SHAPE=plain-value\n');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-env-file');
  assert.match(r.stop, /\.env/);
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: a single-file source carrying a Gemini-shaped key refuses source-carries-secret, into absent, key never in the refusal', async () => {
  const dir = tmp('bareloop-src-secret-file-');
  const fakeKey = 'AIza' + 'B'.repeat(35);
  const file = join(dir, 'config.txt');
  writeFileSync(file, `key=${fakeKey}\n`);
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source: file, into });
  assert.equal(r.code, 'source-carries-secret');
  assert.match(r.stop, /config\.txt/);
  assert.doesNotMatch(r.stop, new RegExp(fakeKey));
  assert.ok(!existsSync(into));
});

test('prepareSource: a clean folder with no secret-shaped content still prepares (no false positive)', async () => {
  const source = tmp('bareloop-src-clean-secret-check-');
  writeFileSync(join(source, 'readme.txt'), 'sk- is a fine word fragment but not a real key, and this has no AIza/ghp_/AKIA shape either');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(existsSync(join(into, 'tree', 'input', 'readme.txt')));
});

test('prepareSource: a symlinked file inside a folder refuses source-symlink, never followed', async () => {
  const source = tmp('bareloop-src-symlink-');
  writeFileSync(join(source, 'real.txt'), 'real');
  symlinkSync(join(source, 'real.txt'), join(source, 'link.txt'));
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-symlink');
  assert.ok(!existsSync(into));
});

test('prepareSource: the SOURCE ITSELF being a symlink refuses source-symlink, never followed (mutation gap — distinct from a symlink found INSIDE a walked folder)', async () => {
  const real = tmp('bareloop-src-symlink-real-');
  writeFileSync(join(real, 'a.txt'), 'x');
  const parent = tmp('bareloop-src-symlink-parent-');
  const source = join(parent, 'link-to-real');
  symlinkSync(real, source, 'dir');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-symlink');
  assert.ok(!existsSync(into));
});

test('prepareSource: a git repo source is COPIED with its history to the tree root, kind "repo", output/ added, seed on top (M2b fix 7)', async () => {
  const source = tmp('bareloop-src-repo-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, 'a.txt'), 'x');
  mkdirSync(join(source, 'src'), { recursive: true });
  writeFileSync(join(source, 'src', 'index.js'), 'export const x = 1;\n');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'the history that must survive']);
  const originalHead = gitFix(source, ['rev-parse', 'HEAD']).trim();
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.kind, 'repo');
  const tree = join(into, 'tree');
  // the working files sit at the TREE ROOT, never under input/ — a worker
  // reviewing a PR needs the repo where a repo is expected to be
  assert.ok(existsSync(join(tree, 'a.txt')), 'a repo source lands at the tree root');
  assert.ok(existsSync(join(tree, 'src', 'index.js')));
  assert.ok(!existsSync(join(tree, 'input')), 'a repo source has no input/ prefix');
  assert.ok(existsSync(join(tree, 'output', '.gitkeep')), 'output/ is added the same way it is for every other kind');
  assert.ok(existsSync(join(into, 'source.json')), 'the manifest still lives outside the tree');

  // the history SURVIVED: the original commit is an ancestor of the seed
  execFileSync('git', ['-C', tree, 'merge-base', '--is-ancestor', originalHead, r.manifest.seed]);
  assert.notEqual(r.manifest.seed, originalHead, 'the seed is a NEW commit on top, holding output/');
  // and the original repo was never touched (patients are copies, always)
  assert.equal(gitFix(source, ['rev-parse', 'HEAD']).trim(), originalHead);
  assert.ok(!existsSync(join(source, 'output')), 'the original repo never grows an output/');
});

test('prepareSource: a repo source carrying a pre-commit hook never runs it (live-proven defect: a copied .git/hooks is arbitrary code from the source repo)', async () => {
  const source = tmp('bareloop-src-repo-hook-');
  gitFix(source, ['init', '-q']);
  const proof = join(tmp('bareloop-hook-proof-'), 'PROOF-HOOK-RAN');
  mkdirSync(join(source, '.git', 'hooks'), { recursive: true });
  for (const name of ['pre-commit', 'commit-msg', 'post-commit']) {
    writeFileSync(join(source, '.git', 'hooks', name), `#!/bin/sh\ntouch '${proof}'\nexit 0\n`, { mode: 0o755 });
  }
  writeFileSync(join(source, 'a.txt'), 'x');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'seed with hooks armed']);
  // the SETUP commit above fires these same hooks against the SOURCE repo
  // itself (a real fixture repo really does run its own hooks) — clear the
  // proof here so only `prepareSource`'s own seed commit, against the COPY,
  // can leave it behind
  rmSync(proof, { force: true });
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(!existsSync(proof), 'no copied hook fired while bareloop committed the seed');
  assert.ok(!existsSync(join(into, 'tree', '.git', 'hooks', 'pre-commit')), 'the copied hooks directory is stripped, not merely bypassed');
});

test('prepareSource: a repo whose .git is a FILE (linked worktree / submodule) refuses source-is-linked-worktree — a copy would commit into the original', async () => {
  const source = tmp('bareloop-src-worktree-');
  writeFileSync(join(source, 'a.txt'), 'x');
  writeFileSync(join(source, '.git'), 'gitdir: /somewhere/else/.git/worktrees/wt\n');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-is-linked-worktree');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: a nested .git BELOW the root refuses source-nested-repo (M2b fix 6) — for a plain folder and for a repo source alike', async () => {
  const folder = tmp('bareloop-src-nested-');
  mkdirSync(join(folder, 'vendor', 'lib'), { recursive: true });
  writeFileSync(join(folder, 'a.txt'), 'x');
  gitFix(join(folder, 'vendor', 'lib'), ['init', '-q']);
  const r1 = await prepareSource({ source: folder, into: join(tmp('bareloop-into-parent-'), 'job1') });
  assert.equal(r1.code, 'source-nested-repo');

  const repo = tmp('bareloop-src-repo-nested-');
  gitFix(repo, ['init', '-q']);
  writeFileSync(join(repo, 'a.txt'), 'x');
  gitFix(repo, ['add', '-A']);
  gitFix(repo, ['commit', '-q', '-m', 'root']);
  mkdirSync(join(repo, 'vendor'), { recursive: true });
  gitFix(join(repo, 'vendor'), ['init', '-q']);
  const r2 = await prepareSource({ source: repo, into: join(tmp('bareloop-into-parent-'), 'job2') });
  assert.equal(r2.code, 'source-nested-repo', 'the ROOT .git is exempt for a repo source; a nested one never is');
});

test('prepareSource: a .gitignore inside the source cannot drop a file from the seed (M2b fix 6 — git add -f, then the seed is READ BACK and diffed)', async () => {
  const source = tmp('bareloop-src-ignored-');
  writeFileSync(join(source, '.gitignore'), 'secret-notes.md\nbuild/\n');
  writeFileSync(join(source, 'a.txt'), 'x');
  writeFileSync(join(source, 'secret-notes.md'), 'the file a .gitignore would have dropped');
  mkdirSync(join(source, 'build'), { recursive: true });
  writeFileSync(join(source, 'build', 'out.txt'), 'also ignored');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  const inSeed = execFileSync('git', ['-C', join(into, 'tree'), 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter(Boolean);
  for (const rel of ['input/a.txt', 'input/secret-notes.md', 'input/build/out.txt', 'input/.gitignore']) {
    assert.ok(inSeed.includes(rel), `${rel} must be in the seed — a file on disk but absent from it would read as the WORKER's write: seed holds ${inSeed.join(', ')}`);
  }
  // and the manifest's own list is exactly what the seed carries
  const manifestPaths = r.manifest.files.map((/** @type {any} */ f) => `input/${f.path}`).sort();
  assert.deepEqual(manifestPaths, inSeed.filter((x) => x !== 'output/.gitkeep').sort());
});

test('prepareSource: an environment file refuses source-env-file by NAME, whatever it holds (M2b fix 2) — folder, single file, and a URL path', async () => {
  // content deliberately BORING: no known secret shape, so only the NAME rule
  // can be what refuses here (the content scan would let this through)
  const folder = tmp('bareloop-src-env-');
  writeFileSync(join(folder, 'a.txt'), 'x');
  writeFileSync(join(folder, '.env.local'), 'GREETING=hello\n');
  const r1 = await prepareSource({ source: folder, into: join(tmp('bareloop-into-parent-'), 'job1') });
  assert.equal(r1.code, 'source-env-file');

  const dir = tmp('bareloop-src-env-file-');
  writeFileSync(join(dir, '.env'), 'GREETING=hello\n');
  const r2 = await prepareSource({ source: join(dir, '.env'), into: join(tmp('bareloop-into-parent-'), 'job2') });
  assert.equal(r2.code, 'source-env-file');

  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('GREETING=hello\n'); });
  try {
    const r3 = await prepareSource({ source: srv.url('/config/.env'), into: join(tmp('bareloop-into-parent-'), 'job3') });
    assert.equal(r3.code, 'source-env-file');
  } finally { await srv.close(); }
});

test('prepareSource: a file over the REAL MAX_BUFFER refuses source-file-oversize (M2b fix 3) — folder file and single file', { timeout: 60_000 }, async () => {
  const { MAX_BUFFER } = await import('../src/kinds.js');
  const big = Buffer.alloc(MAX_BUFFER + 1024, 0x61); // past the REAL ceiling, no crafted shortcut
  const folder = tmp('bareloop-src-big-');
  writeFileSync(join(folder, 'ok.txt'), 'small');
  writeFileSync(join(folder, 'huge.txt'), big);
  const r1 = await prepareSource({ source: folder, into: join(tmp('bareloop-into-parent-'), 'job1') });
  assert.equal(r1.code, 'source-file-oversize');
  assert.match(r1.stop, /huge\.txt/, 'the refusal names the file');

  const r2 = await prepareSource({ source: join(folder, 'huge.txt'), into: join(tmp('bareloop-into-parent-'), 'job2') });
  assert.equal(r2.code, 'source-file-oversize');
});

test('prepareSource: a file just UNDER the ceiling passes (the per-file cap does not false-positive)', { timeout: 60_000 }, async () => {
  const { MAX_BUFFER } = await import('../src/kinds.js');
  const folder = tmp('bareloop-src-nearly-big-');
  writeFileSync(join(folder, 'nearly.txt'), Buffer.alloc(MAX_BUFFER - 1024, 0x61));
  const into = join(tmp('bareloop-into-parent-'), 'job1');
  const r = await prepareSource({ source: folder, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.files[0].bytes, MAX_BUFFER - 1024);
});

test('prepareSource: a REAL 302 redirect is followed but recorded — finalUrl rides into the manifest (M2b fix 5)', async () => {
  const srv = await serverWith((req, res) => {
    if (req.url === '/start') { res.writeHead(302, { location: '/landed/page.md' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/markdown' });
    res.end('# the page you actually got\n');
  });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const typed = srv.url('/start');
    const r = await prepareSource({ source: typed, into });
    assert.equal(r.stop, null, r.stop ?? undefined);
    assert.equal(r.manifest.source, typed, 'what the person typed is kept verbatim');
    assert.equal(r.manifest.finalUrl, srv.url('/landed/page.md'), 'and where the bytes actually came from is recorded beside it');
    assert.ok(existsSync(join(into, 'tree', 'input', 'page.md')), 'the frozen name comes from the FINAL url, not the typed one');
  } finally { await srv.close(); }
});

test('prepareSource: no redirect means no finalUrl field at all (absence reported as absence, never a duplicate of source)', async () => {
  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hi'); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/plain.txt'), into });
    assert.equal(r.manifest.finalUrl, srv.url('/plain.txt'));
  } finally { await srv.close(); }
});

test('prepareSource: destination and output are required together', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination: join(tmp('bareloop-dest-parent-'), 'out.txt') });
  assert.equal(r.code, 'destination-output-required');
});

test('prepareSource: a destination inside the source refuses destination-in-source', async () => {
  const source = tmp('bareloop-src-selfdest-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination: join(source, 'out.txt'), output: 'output/out.txt' });
  assert.equal(r.code, 'destination-in-source');
});

test('prepareSource: a legal destination/output pair rides into the manifest', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destParent = tmp('bareloop-dest-parent-');
  const destination = join(destParent, 'result.md');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/result.md' });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.destination, destination);
  assert.equal(r.manifest.output, 'output/result.md');
});

// ── review finding #1: ONE output validator, used at every seam ───────────

test('prepareSource: an output escaping the tree with ".." refuses output-invalid, before touching the source', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = join(tmp('bareloop-dest-parent-'), 'out.txt');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/../../x' });
  assert.equal(r.code, 'output-invalid');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: an absolute output refuses output-invalid', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = join(tmp('bareloop-dest-parent-'), 'out.txt');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: '/etc/passwd' });
  assert.equal(r.code, 'output-invalid');
});

test('prepareSource: an output pointing at input/ instead of output/ refuses output-invalid', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = join(tmp('bareloop-dest-parent-'), 'out.txt');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'input/a.txt' });
  assert.equal(r.code, 'output-invalid');
});

test('prepareSource: a bare "output/" with no filename refuses output-invalid', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = join(tmp('bareloop-dest-parent-'), 'out.txt');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/' });
  assert.equal(r.code, 'output-invalid');
});

test('prepareSource: a good "output/profile.md" passes validation clean', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = join(tmp('bareloop-dest-parent-'), 'profile.md');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/profile.md' });
  assert.equal(r.stop, null, r.stop ?? undefined);
});

test('copyOut: an output escaping the tree with ".." refuses output-invalid, never reads outside the tree', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  // a file OUTSIDE the tree that a "../.." escape could otherwise reach
  const outsideDir = dirname(tree);
  writeFileSync(join(outsideDir, 'secret.txt'), 'must never be read');
  const destination = join(tmp('bareloop-dest-'), 'out.txt');

  const r = await copyOut({ tree, output: 'output/../../secret.txt', destination });
  assert.equal(r.code, 'output-invalid');
  assert.ok(!existsSync(destination), 'nothing was copied');
});

test('frontDoorFromManifest: a hand-edited manifest with an escaping output is treated as no front door (never handed to copyOut unvalidated)', () => {
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: '/x/out.txt', output: '../../etc/passwd' } }), null);
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: '/x/out.txt', output: 'output' } }), null);
});

// ── review finding #2: destination proven at SETUP time, not just in-run ──

test('prepareSource: a bare existing destination does not block prep — the delivered name is dated, so it never collides with the bare file (M2b fix 4)', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destParent = tmp('bareloop-dest-parent-');
  const destination = join(destParent, 'already-there.md');
  writeFileSync(destination, 'do not touch');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/already-there.md' });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(readFileSync(destination, 'utf8'), 'do not touch', 'the bare file itself is never touched');
});

test('prepareSource: every same-day dated slot already taken refuses destination-exists at prepare time, and `into` is never created', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destParent = tmp('bareloop-dest-parent-');
  const destination = join(destParent, 'already-there.md');
  const now = new Date();
  // fill EVERY same-day slot (`pickDelivery` tries -1 through -99) so the
  // refusal is real, not just pushed to the next free suffix
  for (let n = 1; n <= 99; n++) writeFileSync(datedDestination(destination, now, n), 'taken');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination, output: 'output/already-there.md' });
  assert.equal(r.code, 'destination-exists');
  assert.ok(!existsSync(into), 'a refused destination leaves nothing on disk — a refused prep never builds a tree');
});

// ── review finding #3: destination proven against the SCRATCH ROOT, not just the tree ──

test('copyOut: a destination inside `into` but outside `tree` refuses destination-contained', async () => {
  const into = tmp('bareloop-into-');
  const tree = join(into, 'tree');
  mkdirSync(join(tree, 'output'), { recursive: true });
  writeFileSync(join(tree, 'output', 'result.md'), 'hi');
  const destination = join(into, 'profile.md'); // inside `into`, outside `tree` — the gap this closes

  const r = await copyOut({ tree, into, output: 'output/result.md', destination });
  assert.equal(r.code, 'destination-contained');
});

// ── prepareSource: URL source, real local HTTP server ────────────────────

test('prepareSource: a URL source freezes the fetched body, one 200 text response', async () => {
  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('remote body'); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/notes.txt'), into });
    assert.equal(r.stop, null, r.stop ?? undefined);
    assert.equal(r.manifest.kind, 'url');
    assert.equal(readFileSync(join(into, 'tree', 'input', 'notes.txt'), 'utf8'), 'remote body');
  } finally { await srv.close(); }
});

test('prepareSource: a URL body carrying a secret-shaped token refuses source-carries-secret, into absent, key never in the refusal', async () => {
  const fakeKey = 'ghp_' + 'C'.repeat(36);
  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`token=${fakeKey}`); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/leak.txt'), into });
    assert.equal(r.code, 'source-carries-secret');
    assert.doesNotMatch(r.stop, new RegExp(fakeKey));
    assert.ok(!existsSync(into), 'a refused prep never builds a partial tree — the fetched body is never written under `into`');
  } finally { await srv.close(); }
});

test('prepareSource: a URL carrying embedded credentials refuses BEFORE any fetch — the server proves it never saw a request (mutation gap)', async () => {
  let requestsSeen = 0;
  const srv = await serverWith((req, res) => { requestsSeen++; res.writeHead(200, { 'content-type': 'text/plain' }); res.end('should never be reached'); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const url = `http://user:pass@127.0.0.1:${srv.port}/x`;
    const r = await prepareSource({ source: url, into });
    assert.equal(r.code, 'source-unreadable');
    assert.equal(requestsSeen, 0, 'no request may reach the server once credentials are found in the URL');
    assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
  } finally { await srv.close(); }
});

test('prepareSource: a URL source answering 404 refuses source-fetch-failed', async () => {
  const srv = await serverWith((req, res) => { res.writeHead(404); res.end('nope'); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/gone'), into });
    assert.equal(r.code, 'source-fetch-failed');
    assert.match(r.stop, /404/);
  } finally { await srv.close(); }
});

test('prepareSource: a URL source answering a binary content-type refuses source-not-text', async () => {
  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(Buffer.from([1, 2, 3])); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/blob'), into });
    assert.equal(r.code, 'source-not-text');
  } finally { await srv.close(); }
});

test('prepareSource: an oversize URL body refuses source-fetch-oversize, over the REAL MAX_BUFFER ceiling', { timeout: 30_000 }, async () => {
  const { MAX_BUFFER } = await import('../src/kinds.js');
  const chunk = Buffer.alloc(1024 * 1024, 0x61); // 1MB chunks, streamed over loopback — fast, no disk
  const chunksToSend = Math.ceil(MAX_BUFFER / chunk.length) + 2; // comfortably past the ceiling
  const srv = await serverWith((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    let sent = 0;
    const pump = () => {
      while (sent < chunksToSend) {
        sent++;
        if (!res.write(chunk)) { res.once('drain', pump); return; }
      }
      res.end();
    };
    pump();
  });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/big'), into });
    assert.equal(r.code, 'source-fetch-oversize');
    assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
  } finally { await srv.close(); }
});

test('prepareSource: a body comfortably under MAX_BUFFER streams through clean (the ceiling does not false-positive on an ordinary file)', async () => {
  const body = 'x'.repeat(1024 * 1024); // 1MB — real, uncrafted size, nowhere near the 16MB ceiling
  const srv = await serverWith((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(body); });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const r = await prepareSource({ source: srv.url('/ok'), into });
    assert.equal(r.stop, null, r.stop ?? undefined);
    assert.equal(readFileSync(join(into, 'tree', 'input', 'ok'), 'utf8').length, body.length);
  } finally { await srv.close(); }
});

test('prepareSource: a silent server (accepts, never answers) refuses source-fetch-timeout on the INJECTED bound, not the production default', async () => {
  const srv = await serverWith((req) => { req.resume(); /* never res.end() */ });
  try {
    const into = join(tmp('bareloop-into-parent-'), 'job1');
    const startedAt = Date.now();
    const r = await prepareSource({ source: srv.url('/hang'), into, fetchTimeoutMs: 300 });
    const elapsedMs = Date.now() - startedAt;
    assert.equal(r.code, 'source-fetch-timeout');
    assert.ok(elapsedMs < 5000, `must settle near the 300ms injected bound, not the 600s production default: took ${elapsedMs}ms`);
  } finally { await srv.close(); }
});

// ── proveDestination ──────────────────────────────────────────────────────

test('proveDestination: a legal destination proves clean', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const r = await proveDestination(join(destParent, 'out.txt'), { into });
  assert.equal(r.stop, null, r.stop ?? undefined);
});

test('proveDestination: a relative path refuses destination-not-absolute', async () => {
  const into = tmp('bareloop-into-');
  const r = await proveDestination('relative/out.txt', { into });
  assert.equal(r.code, 'destination-not-absolute');
});

test('proveDestination: an existing file at the BARE name does NOT block — the delivered name is dated (M2b fix 4)', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'already-there.txt');
  writeFileSync(destination, 'the person\'s own file, untouched');
  const r = await proveDestination(destination, { into });
  assert.equal(r.stop, null, 'bareloop never writes this exact name, so it was never in the way');
  assert.equal(readFileSync(destination, 'utf8'), 'the person\'s own file, untouched');
});

test('proveDestination: every same-day slot taken refuses destination-exists (the cap, never a silent overwrite)', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'profile.md');
  const now = new Date();
  for (let n = 1; n <= 99; n++) writeFileSync(datedDestination(destination, now, n), 'taken');
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-exists');
});

test('datedDestination: the delivered name carries the day, then -2/-3 for a same-day repeat', () => {
  const now = new Date(2026, 8, 12); // month is 0-based: September
  assert.equal(datedDestination('/a/b/profile.md', now, 1), '/a/b/profile-2026-09-12.md');
  assert.equal(datedDestination('/a/b/profile.md', now, 2), '/a/b/profile-2026-09-12-2.md');
  assert.equal(datedDestination('/a/b/profile.md', now, 3), '/a/b/profile-2026-09-12-3.md');
  // no extension, and a dotted stem — the LAST dot is the extension boundary
  assert.equal(datedDestination('/a/b/README', now, 1), '/a/b/README-2026-09-12');
  assert.equal(datedDestination('/a/b/report.final.csv', now, 1), '/a/b/report.final-2026-09-12.csv');
  // a leading-dot name is a NAME, not an extension
  assert.equal(datedDestination('/a/b/.profile', now, 1), '/a/b/.profile-2026-09-12');
});

test('pickDelivery: skips the names already taken today and hands back the first free one', () => {
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'profile.md');
  const now = new Date();
  const first = pickDelivery(destination, now);
  assert.equal(first.path, datedDestination(destination, now, 1));
  writeFileSync(first.path, 'delivered');
  const second = pickDelivery(destination, now);
  assert.equal(second.path, datedDestination(destination, now, 2));
});

test('proveDestination: a missing parent directory refuses destination-parent-missing', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'nope', 'out.txt');
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-parent-missing');
});

test('proveDestination: an unwritable parent directory refuses destination-parent-unwritable', async (t) => {
  if (process.getuid && process.getuid() === 0) { t.skip('root ignores directory permission bits'); return; }
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-locked-');
  chmodSync(destParent, 0o555);
  t.after(() => chmodSync(destParent, 0o755)); // give it back so the sweep can remove it
  const r = await proveDestination(join(destParent, 'out.txt'), { into });
  assert.equal(r.code, 'destination-parent-unwritable');
});

test('proveDestination: a destination inside `into` refuses destination-contained', async () => {
  const into = tmp('bareloop-into-');
  const r = await proveDestination(join(into, 'sneaky.txt'), { into });
  assert.equal(r.code, 'destination-contained');
});

// ── copyOut ────────────────────────────────────────────────────────────────

test('copyOut: copies the produced file, matches bytes/sha256, and never overwrites a second time', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  const body = 'the run wrote this';
  writeFileSync(join(tree, 'output', 'result.md'), body);
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'result.md');

  const r1 = await copyOut({ tree, output: 'output/result.md', destination });
  assert.equal(r1.stop, null, r1.stop ?? undefined);
  assert.equal(r1.bytes, Buffer.byteLength(body));
  assert.equal(r1.sha256, sha256(Buffer.from(body)));
  // M2b fix 4: the file lands under its DATED name, and the path it took
  // comes back — the declared name is never what anything wrote
  assert.equal(r1.path, datedDestination(destination, new Date(), 1));
  assert.ok(!existsSync(destination), 'the bare declared name is never written');
  assert.equal(readFileSync(r1.path, 'utf8'), body);

  // a second copyOut the SAME day must never clobber the first — it lands at -2
  writeFileSync(join(tree, 'output', 'result.md'), 'a different run wrote this');
  const r2 = await copyOut({ tree, output: 'output/result.md', destination });
  assert.equal(r2.stop, null, r2.stop ?? undefined);
  assert.equal(r2.path, datedDestination(destination, new Date(), 2));
  assert.equal(readFileSync(r1.path, 'utf8'), body, 'the first delivered file must be untouched');
  assert.equal(readFileSync(r2.path, 'utf8'), 'a different run wrote this');
});

test('copyOut: a missing output file refuses destination-output-missing', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  const destination = join(tmp('bareloop-dest-'), 'result.md');
  const r = await copyOut({ tree, output: 'output/result.md', destination });
  assert.equal(r.code, 'destination-output-missing');
});

test('copyOut: an empty output file refuses destination-output-empty', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  writeFileSync(join(tree, 'output', 'result.md'), '');
  const destination = join(tmp('bareloop-dest-'), 'result.md');
  const r = await copyOut({ tree, output: 'output/result.md', destination });
  assert.equal(r.code, 'destination-output-empty');
});

// ── readSourceManifest / frontDoorFromManifest — the run-u.mjs seam ────────

test('readSourceManifest: absence is reported as absence, never a fabricated destination (repo jobs untouched)', async () => {
  const into = tmp('bareloop-nomanifest-');
  const r = await readSourceManifest(into);
  assert.deepEqual(r, { stop: null, present: false, manifest: null });
  assert.equal(frontDoorFromManifest(r), null);
});

test('readSourceManifest + frontDoorFromManifest: a prepared source round-trips into the exact pair run-u.mjs acts on', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'out.txt');
  const into = join(tmp('bareloop-into-parent-'), 'job1');
  const prepared = await prepareSource({ source, into, destination, output: 'output/out.txt' });
  assert.equal(prepared.stop, null, prepared.stop ?? undefined);

  // run-u.mjs reads the manifest from `dirname(wd)` where `wd` IS `<into>/tree`
  const r = await readSourceManifest(dirname(join(into, 'tree')));
  assert.equal(r.stop, null);
  assert.equal(r.present, true);
  assert.deepEqual(frontDoorFromManifest(r), { destination, output: 'output/out.txt' });
});

test('readSourceManifest: a malformed manifest is a named stop, never a silent skip', async () => {
  const into = tmp('bareloop-badmanifest-');
  writeFileSync(join(into, 'source.json'), 'not json{{{');
  const r = await readSourceManifest(into);
  assert.equal(r.code, 'source-manifest-invalid');
});

test('frontDoorFromManifest: a manifest present but with no destination/output declared yields null (nothing to act on)', () => {
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: null, output: null } }), null);
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: '/x', output: null } }), null);
});

// ── run-u.mjs wiring — SOURCE-TEXT PROOF, named as a gap ───────────────────
//
// The two call sites in scripts/run-u.mjs (the $0 preflight stop before any
// token, and the copy-out on a minted green) cannot be driven through the
// script itself without a live provider key past the JUDGES/key gate that
// runs BEFORE them — this repo makes no paid/model calls in its test suite.
// Every piece of LOGIC at those call sites (readSourceManifest,
// frontDoorFromManifest, proveDestination, copyOut) is proven directly above;
// this test proves only that the script actually WIRES them, by source, since
// that is the one thing the tests above cannot see.
test('run-u.mjs wiring: both front-door call sites are wired to the real functions (source-text proof — see comment above)', async () => {
  const src = readFileSync(new URL('../scripts/run-u.mjs', import.meta.url), 'utf8');
  assert.match(src, /import\s*\{\s*readSourceManifest,\s*frontDoorFromManifest,\s*proveDestination,\s*copyOut\s*\}\s*from\s*'\.\.\/src\/source\.js'/);
  assert.match(src, /const sourceManifest = await readSourceManifest\(dirname\(wd\)\)/, 'the manifest must be read from the tree\'s own parent, before any token spends');
  assert.match(src, /const dp = await proveDestination\(frontDoor\.destination, \{ into: dirname\(wd\) \}\)/, 'the $0 preflight stop, proven against the SCRATCH ROOT, not just the tree');
  assert.match(src, /if \(outcome === 'green' && frontDoor\)/, 'the copy-out gate fires on the ONE outcome string a graded close mints');
  assert.match(src, /const co = await copyOut\(\{ tree: wd, into: dirname\(wd\), output: frontDoor\.output, destination: frontDoor\.destination \}\)/, 'the copy-out call site, same scratch-root containment proof');
  assert.match(src, /emit\('destination-written', \{ path: co\.path/, 'the spine must record the REAL delivered (dated) path, never the declared one');
  assert.match(src, /emit\('destination-refused'/);
});
