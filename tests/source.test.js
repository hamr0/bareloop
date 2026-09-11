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
} from '../src/source.js';

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

test('prepareSource: a symlinked file inside a folder refuses source-symlink, never followed', async () => {
  const source = tmp('bareloop-src-symlink-');
  writeFileSync(join(source, 'real.txt'), 'real');
  symlinkSync(join(source, 'real.txt'), join(source, 'link.txt'));
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-symlink');
  assert.ok(!existsSync(into));
});

test('prepareSource: a folder that is itself a git repo root refuses source-is-repo', async () => {
  const source = tmp('bareloop-src-repo-');
  execFileSync('git', ['init', '-q'], { cwd: source });
  writeFileSync(join(source, 'a.txt'), 'x');
  const into = join(tmp('bareloop-into-parent-'), 'job1');

  const r = await prepareSource({ source, into });
  assert.equal(r.code, 'source-is-repo');
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

test('proveDestination: an existing file refuses destination-exists (never overwrite)', async () => {
  const into = tmp('bareloop-into-');
  const destParent = tmp('bareloop-dest-');
  const destination = join(destParent, 'already-there.txt');
  writeFileSync(destination, 'do not touch');
  const r = await proveDestination(destination, { into });
  assert.equal(r.code, 'destination-exists');
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
  assert.equal(readFileSync(destination, 'utf8'), body);

  // a second copyOut against the SAME destination must never clobber it, even
  // though the source file is unchanged — bareloop never overwrites
  writeFileSync(join(tree, 'output', 'result.md'), 'a different run wrote this');
  const r2 = await copyOut({ tree, output: 'output/result.md', destination });
  assert.equal(r2.code, 'destination-exists');
  assert.equal(readFileSync(destination, 'utf8'), body, 'the original delivered file must be untouched');
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
  assert.match(src, /const dp = await proveDestination\(frontDoor\.destination, \{ into: wd \}\)/, 'the $0 preflight stop');
  assert.match(src, /if \(outcome === 'green' && frontDoor\)/, 'the copy-out gate fires on the ONE outcome string a graded close mints');
  assert.match(src, /const co = await copyOut\(\{ tree: wd, output: frontDoor\.output, destination: frontDoor\.destination \}\)/, 'the copy-out call site');
  assert.match(src, /emit\('destination-written'/);
  assert.match(src, /emit\('destination-refused'/);
});
