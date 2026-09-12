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

test('prepareSource: a repo source with a gitignored file AND an untracked file — neither reaches the tree or the seed (D1, closes F165)', async () => {
  const source = tmp('bareloop-src-repo-ignored-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, '.gitignore'), 'ignored.txt\n');
  writeFileSync(join(source, 'a.txt'), 'tracked');
  writeFileSync(join(source, 'ignored.txt'), 'gitignored — a real project relies on this staying out');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'root']);
  // untracked, never added at all — not even gitignored, simply never `git add`ed
  writeFileSync(join(source, 'scratch.txt'), 'untracked — never staged, never committed');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  const tree = join(into, 'tree');
  assert.ok(existsSync(join(tree, 'a.txt')));
  assert.ok(!existsSync(join(tree, 'ignored.txt')), 'a gitignored file in the SOURCE repo must never reach the copied tree');
  assert.ok(!existsSync(join(tree, 'scratch.txt')), 'an untracked file in the SOURCE repo must never reach the copied tree');
  const inSeed = execFileSync('git', ['-C', tree, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(!inSeed.includes('ignored.txt') && !inSeed.includes('scratch.txt'), 'neither file may reach the hidden-git SEED either');
});

test('prepareSource: a node_modules/.bin-shaped symlink (untracked, as npm actually creates it) never trips source-symlink for a repo source (D1, closes F164)', async () => {
  const source = tmp('bareloop-src-repo-nodemodules-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, 'package.json'), '{"name":"x"}\n');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'root']);
  // exactly npm's own shape: node_modules is untracked (gitignored in any
  // real JS repo) and .bin/* are symlinks into an installed package
  mkdirSync(join(source, 'node_modules', '.bin'), { recursive: true });
  mkdirSync(join(source, 'node_modules', 'some-pkg', 'bin'), { recursive: true });
  writeFileSync(join(source, 'node_modules', 'some-pkg', 'bin', 'cli.js'), '#!/usr/bin/env node\n');
  symlinkSync(join(source, 'node_modules', 'some-pkg', 'bin', 'cli.js'), join(source, 'node_modules', '.bin', 'some-pkg'));
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(!existsSync(join(into, 'tree', 'node_modules')), 'node_modules is untracked and must never reach the copy at all');
});

test('prepareSource: a TRACKED symlink escaping the repo root refuses source-symlink; one that stays inside is copied verbatim as a link (D1)', async () => {
  const outside = tmp('bareloop-src-repo-symlink-outside-target-');
  writeFileSync(join(outside, 'secret.txt'), 'outside the source root');

  const source = tmp('bareloop-src-repo-symlink-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, 'a.txt'), 'x');
  mkdirSync(join(source, 'sub'), { recursive: true });
  writeFileSync(join(source, 'sub', 'target.txt'), 'inside the source root');
  symlinkSync(join(source, 'sub', 'target.txt'), join(source, 'link-inside.txt'));
  symlinkSync(join(outside, 'secret.txt'), join(source, 'link-outside.txt'));
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'tracked symlinks']);

  const r1 = await prepareSource({ source, into: join(tmp('bareloop-into-parent-'), 'job1') });
  assert.equal(r1.code, 'source-symlink', 'a tracked symlink resolving OUTSIDE the source root must refuse');

  // remove the escaping link and retry — the inside-pointing one must pass
  execFileSync('rm', [join(source, 'link-outside.txt')]);
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'drop the escaping link']);
  const into2 = join(tmp('bareloop-into-parent-'), 'job2');
  const r2 = await prepareSource({ source, into: into2 });
  assert.equal(r2.stop, null, r2.stop ?? undefined);
  const linkPath = join(into2, 'tree', 'link-inside.txt');
  const stat2 = await import('node:fs/promises').then((m) => m.lstat(linkPath));
  assert.ok(stat2.isSymbolicLink(), 'a symlink staying inside the root is copied VERBATIM as a link, never dereferenced into a copy of its target');
});

test('prepareSource: a repo source carrying an ASCII key inside a BINARY file refuses source-carries-secret (D2, closes the F166 residual)', async () => {
  const source = tmp('bareloop-src-repo-binarysecret-');
  gitFix(source, ['init', '-q']);
  // NUL byte up front (so hasNulByte's 8KB sniff sees it) plus a real key
  // shape further in the "binary" content
  const binary = Buffer.concat([Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]), Buffer.from('\npadding\nsk-ant-api03-thisisatestkeyshapethatlookslikearealone1234567890\n')]);
  writeFileSync(join(source, 'artifact.bin'), binary);
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'binary with a key']);
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-carries-secret');
  assert.ok(!r.stop.includes('sk-ant-'), 'the refusal names the pattern, never the matched text');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
});

test('prepareSource: a plain binary file with NO secret shape still prepares clean (D2 does not false-positive on ordinary binary content)', async () => {
  const source = tmp('bareloop-src-repo-binaryok-');
  gitFix(source, ['init', '-q']);
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x00, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  writeFileSync(join(source, 'photo.png'), binary);
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'clean binary']);
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(existsSync(join(into, 'tree', 'photo.png')));
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

test('prepareSource: a nested .git BELOW the root refuses source-nested-repo for a plain folder (M2b fix 6)', async () => {
  const folder = tmp('bareloop-src-nested-');
  mkdirSync(join(folder, 'vendor', 'lib'), { recursive: true });
  writeFileSync(join(folder, 'a.txt'), 'x');
  gitFix(join(folder, 'vendor', 'lib'), ['init', '-q']);
  const r1 = await prepareSource({ source: folder, into: join(tmp('bareloop-into-parent-'), 'job1') });
  assert.equal(r1.code, 'source-nested-repo');
});

test('prepareSource: a REPO source enumerates by "git ls-files", so an untracked nested repo below the root is simply never a candidate — nothing under it is copied or refused (D1 rework, F164/F165: tracked-only enumeration makes the old filesystem-walk nested-repo check unreachable, and therefore unneeded, for this path)', async () => {
  const repo = tmp('bareloop-src-repo-nested-');
  gitFix(repo, ['init', '-q']);
  writeFileSync(join(repo, 'a.txt'), 'x');
  gitFix(repo, ['add', '-A']);
  gitFix(repo, ['commit', '-q', '-m', 'root']);
  // an EMBEDDED, untracked repo — never `git add`ed to the outer repo, so it
  // never appears in `git ls-files` and nothing under it is a candidate for
  // the copy at all (the D1 safety property: only what git tracks is ever
  // read or written).
  mkdirSync(join(repo, 'vendor'), { recursive: true });
  gitFix(join(repo, 'vendor'), ['init', '-q']);
  writeFileSync(join(repo, 'vendor', 'untracked.txt'), 'never tracked, never copied');
  const into = join(tmp('bareloop-into-parent-'), 'job2');
  const r = await prepareSource({ source: repo, into });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.ok(!existsSync(join(into, 'tree', 'vendor', 'untracked.txt')), 'untracked content under the embedded repo must never reach the copy');
  assert.ok(!existsSync(join(into, 'tree', 'vendor', '.git')), 'the embedded repo\'s own .git must never be copied');
});

test('prepareSource: a REAL submodule (a gitlink entry in the index) refuses source-nested-repo — a second history the seed cannot hold honestly', async () => {
  const submoduleRepo = tmp('bareloop-src-submodule-target-');
  gitFix(submoduleRepo, ['init', '-q']);
  writeFileSync(join(submoduleRepo, 'x.txt'), 'x');
  gitFix(submoduleRepo, ['add', '-A']);
  gitFix(submoduleRepo, ['commit', '-q', '-m', 'submodule target']);

  const repo = tmp('bareloop-src-repo-withsubmodule-');
  gitFix(repo, ['init', '-q']);
  writeFileSync(join(repo, 'a.txt'), 'x');
  gitFix(repo, ['add', '-A']);
  gitFix(repo, ['commit', '-q', '-m', 'root']);
  gitFix(repo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', submoduleRepo, 'vendor/sub']);
  gitFix(repo, ['commit', '-q', '-m', 'add submodule']);

  const into = join(tmp('bareloop-into-parent-'), 'job3');
  const r = await prepareSource({ source: repo, into });
  assert.equal(r.code, 'source-nested-repo');
  assert.ok(!existsSync(into), 'a refused prep never builds a partial tree');
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

// ── D3: destination is a DIRECTORY, never a filename (hamr's ruling, 2026-09-12) ──

test('prepareSource: a legal destination directory rides into the manifest, with no output field at all', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = tmp('bareloop-dest-parent-');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.destination, destination);
  assert.ok(!('output' in r.manifest), 'D3 drops the single-file output field entirely — outputs are discovered from output/ at delivery time');
});

test('prepareSource: a destination DIRECTORY that already exists is legal (D3 — it need not be empty)', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destination = tmp('bareloop-dest-existing-');
  writeFileSync(join(destination, 'unrelated.txt'), 'a file already here, untouched by prep');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(readFileSync(join(destination, 'unrelated.txt'), 'utf8'), 'a file already here, untouched by prep');
});

test('prepareSource: a destination equal to the SOURCE directory is legal (D3 — the same-dir case, hamr\'s ruling)', async () => {
  const source = tmp('bareloop-src-samedir-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination: source });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.destination, source);
});

test('prepareSource: a destination that exists but is a FILE, not a directory, refuses destination-not-directory', async () => {
  const source = tmp('bareloop-src-');
  writeFileSync(join(source, 'a.txt'), 'x');
  const destParent = tmp('bareloop-dest-parent-');
  const destination = join(destParent, 'not-a-dir.txt');
  writeFileSync(destination, 'a file, not a directory');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination });
  assert.equal(r.code, 'destination-not-directory');
});

test('prepareSource: for a REPO source, destination is recorded as the declared write fence — never proven as a filesystem drop-off point (D3)', async () => {
  const source = tmp('bareloop-src-repo-destfence-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, 'a.txt'), 'x');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'root']);
  // a value that would refuse destination-not-absolute for every OTHER kind —
  // proving the repo path never runs proveDestination on it at all
  const destination = 'src/**';
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into, destination });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.manifest.destination, destination);
  assert.equal(frontDoorFromManifest({ present: true, manifest: r.manifest }), null, 'a repo destination is never handed to copyOut');
});

// ── review finding #3: destination proven against the SCRATCH ROOT, not just the tree ──

test('copyOut: a destination inside `into` but outside `tree` refuses destination-contained', async () => {
  const into = tmp('bareloop-into-');
  const tree = join(into, 'tree');
  mkdirSync(join(tree, 'output'), { recursive: true });
  writeFileSync(join(tree, 'output', 'result.md'), 'hi');
  const destination = join(into, 'dropoff'); // inside `into`, outside `tree` — the gap this closes

  const r = await copyOut({ tree, into, destination });
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

test('proveDestination: a legal destination directory proves clean, whether or not it exists yet', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const notYet = join(destParent, 'dropoff'); // does not exist yet — proven CREATABLE
  const r1 = await proveDestination(notYet, { into });
  assert.equal(r1.stop, null, r1.stop ?? undefined);
  assert.ok(!existsSync(notYet), 'proving never creates the directory itself — that is copyOut\'s job, on a green');

  mkdirSync(notYet); // now it exists — still legal, and need not be empty
  writeFileSync(join(notYet, 'preexisting.txt'), 'already here');
  const r2 = await proveDestination(notYet, { into });
  assert.equal(r2.stop, null, r2.stop ?? undefined);
});

test('proveDestination: a relative path refuses destination-not-absolute', async () => {
  const into = tmp('bareloop-into-');
  const r = await proveDestination('relative/dropoff', { into });
  assert.equal(r.code, 'destination-not-absolute');
});

test('proveDestination: an existing FILE (not a directory) at the destination refuses destination-not-directory', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'already-a-file.txt');
  writeFileSync(destination, 'a file, not a directory');
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-not-directory');
});

test('proveDestination: an existing but unwritable destination DIRECTORY refuses destination-not-writable', async (t) => {
  if (process.getuid && process.getuid() === 0) { t.skip('root ignores directory permission bits'); return; }
  const into = tmp('bareloop-into-');
  const destination = tmp('bareloop-dest-locked-');
  chmodSync(destination, 0o555);
  t.after(() => chmodSync(destination, 0o755));
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-not-writable');
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
  const destination = join(destParent, 'nope', 'dropoff');
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-parent-missing');
});

test('proveDestination: an unwritable parent directory refuses destination-parent-unwritable', async (t) => {
  if (process.getuid && process.getuid() === 0) { t.skip('root ignores directory permission bits'); return; }
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-locked-');
  chmodSync(destParent, 0o555);
  t.after(() => chmodSync(destParent, 0o755)); // give it back so the sweep can remove it
  const r = await proveDestination(join(destParent, 'dropoff'), { into });
  assert.equal(r.code, 'destination-parent-unwritable');
});

test('proveDestination: a destination inside `into` refuses destination-contained', async () => {
  const into = tmp('bareloop-into-');
  const r = await proveDestination(join(into, 'sneaky'), { into });
  assert.equal(r.code, 'destination-contained');
});

// ── copyOut ────────────────────────────────────────────────────────────────

test('copyOut: copies the produced file, matches bytes/sha256, and never overwrites a second time (D3: destination is now the DIRECTORY, files ride back as an array)', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  const body = 'the run wrote this';
  writeFileSync(join(tree, 'output', 'result.md'), body);
  const destination = tmp('bareloop-dest-');

  const r1 = await copyOut({ tree, destination });
  assert.equal(r1.stop, null, r1.stop ?? undefined);
  assert.equal(r1.files.length, 1);
  assert.equal(r1.files[0].bytes, Buffer.byteLength(body));
  assert.equal(r1.files[0].sha256, sha256(Buffer.from(body)));
  // M2b fix 4, kept under D3: each file lands under its OWN dated name
  const declaredFile = join(destination, 'result.md');
  assert.equal(r1.files[0].path, datedDestination(declaredFile, new Date(), 1));
  assert.ok(!existsSync(declaredFile), 'the bare declared name is never written');
  assert.equal(readFileSync(r1.files[0].path, 'utf8'), body);

  // a second copyOut the SAME day must never clobber the first — it lands at -2
  writeFileSync(join(tree, 'output', 'result.md'), 'a different run wrote this');
  const r2 = await copyOut({ tree, destination });
  assert.equal(r2.stop, null, r2.stop ?? undefined);
  assert.equal(r2.files[0].path, datedDestination(declaredFile, new Date(), 2));
  assert.equal(readFileSync(r1.files[0].path, 'utf8'), body, 'the first delivered file must be untouched');
  assert.equal(readFileSync(r2.files[0].path, 'utf8'), 'a different run wrote this');
});

test('copyOut: SEVERAL files under output/ are all delivered, each under its own dated name (D3 — a job may produce more than one file)', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  writeFileSync(join(tree, 'output', 'sfo-lax-redeye.md'), 'red-eye options');
  writeFileSync(join(tree, 'output', 'sfo-under-700.md'), 'budget options');
  writeFileSync(join(tree, 'output', '.gitkeep'), ''); // the seed placeholder — never delivered
  const destination = tmp('bareloop-dest-multi-');

  const r = await copyOut({ tree, destination });
  assert.equal(r.stop, null, r.stop ?? undefined);
  assert.equal(r.files.length, 2, 'both real output files are delivered, .gitkeep is not');
  const names = r.files.map((f) => f.path.split('/').at(-1)).sort();
  assert.ok(names[0].startsWith('sfo-lax-redeye-') && names[1].startsWith('sfo-under-700-'));
});

test('copyOut: an empty output file is SKIPPED, never delivered and never a refusal on its own — but the batch refuses destination-output-missing when NOTHING non-empty exists', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  writeFileSync(join(tree, 'output', 'empty.md'), '');
  const destination1 = tmp('bareloop-dest-allempty-');
  const r1 = await copyOut({ tree, destination: destination1 });
  assert.equal(r1.code, 'destination-output-missing');

  writeFileSync(join(tree, 'output', 'real.md'), 'content');
  const destination2 = tmp('bareloop-dest-mixed-');
  const r2 = await copyOut({ tree, destination: destination2 });
  assert.equal(r2.stop, null, r2.stop ?? undefined);
  assert.equal(r2.files.length, 1, 'the empty file is skipped, the non-empty one delivered');
});

test('copyOut: no file at all under output/ refuses destination-output-missing', async () => {
  const tree = tmp('bareloop-tree-');
  mkdirSync(join(tree, 'output'), { recursive: true });
  const destination = tmp('bareloop-dest-');
  const r = await copyOut({ tree, destination });
  assert.equal(r.code, 'destination-output-missing');
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
  const destination = tmp('bareloop-dest-');
  const into = join(tmp('bareloop-into-parent-'), 'job1');
  const prepared = await prepareSource({ source, into, destination });
  assert.equal(prepared.stop, null, prepared.stop ?? undefined);

  // run-u.mjs reads the manifest from `dirname(wd)` where `wd` IS `<into>/tree`
  const r = await readSourceManifest(dirname(join(into, 'tree')));
  assert.equal(r.stop, null);
  assert.equal(r.present, true);
  assert.deepEqual(frontDoorFromManifest(r), { destination });
});

test('readSourceManifest + frontDoorFromManifest: a REPO source\'s manifest never yields a front door (repo destination is the write fence, not a copy-out target)', async () => {
  const source = tmp('bareloop-src-repo-frontdoor-');
  gitFix(source, ['init', '-q']);
  writeFileSync(join(source, 'a.txt'), 'x');
  gitFix(source, ['add', '-A']);
  gitFix(source, ['commit', '-q', '-m', 'root']);
  const into = join(tmp('bareloop-into-parent-'), 'job1');
  const prepared = await prepareSource({ source, into, destination: 'src/**' });
  assert.equal(prepared.stop, null, prepared.stop ?? undefined);

  const r = await readSourceManifest(dirname(join(into, 'tree')));
  assert.equal(r.present, true);
  assert.equal(frontDoorFromManifest(r), null);
});

test('readSourceManifest: a malformed manifest is a named stop, never a silent skip', async () => {
  const into = tmp('bareloop-badmanifest-');
  writeFileSync(join(into, 'source.json'), 'not json{{{');
  const r = await readSourceManifest(into);
  assert.equal(r.code, 'source-manifest-invalid');
});

test('frontDoorFromManifest: a manifest present but with no destination declared yields null (nothing to act on)', () => {
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: null } }), null);
  assert.equal(frontDoorFromManifest({ present: true, manifest: { destination: '' } }), null);
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
  assert.match(src, /const co = await copyOut\(\{ tree: wd, into: dirname\(wd\), destination: frontDoor\.destination \}\)/, 'the copy-out call site, same scratch-root containment proof');
  assert.match(src, /emit\('destination-written', \{ path: f\.path/, 'the spine must record the REAL delivered (dated) path, never the declared one, for EVERY file copyOut returns');
  assert.match(src, /emit\('destination-refused'/);
});
