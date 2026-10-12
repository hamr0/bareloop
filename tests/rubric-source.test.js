// PART 1a (docs/product/ITEM33-BUILD.md "Addendum 2026-10-12") — the rubric job's local-file front door:
// `proveRubricInputs` / `isRubricFilesManifest` (src/source.js). Real data: a copy of this repo's own CHANGELOG.md is the
// rubric input, real git builds the hidden tree, real files carry the refusals. No model is involved anywhere.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { proveRubricInputs, isRubricFilesManifest, readSourceManifest, RUBRIC_INPUT_MAX_BYTES } from '../src/source.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rubric-source-')); made.push(d); return d; };
const sha = (/** @type {Buffer|string} */ b) => createHash('sha256').update(b).digest('hex');

/** a scratch dir holding a REAL copy of the repo's own CHANGELOG.md */
function changelogCopy() {
  const dir = tmp();
  const file = join(dir, 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  return { dir, file };
}

test('a local file is frozen: hidden git tree, input/ copy, and source.json inputs carry label, rel and sha256', async () => {
  const { file } = changelogCopy();
  const into = join(tmp(), 'seed');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  const real = readFileSync(file);
  assert.deepEqual(r.prep.manifest.inputs, [{ label: 'Changelog', rel: 'input/CHANGELOG.md', sha256: sha(real) }]);
  assert.equal(readFileSync(join(r.prep.tree, 'input', 'CHANGELOG.md')).equals(real), true);
  assert.equal(existsSync(join(r.prep.tree, '.git')), true);
  assert.equal(existsSync(join(r.prep.tree, 'output', '.gitkeep')), true);
  // the manifest on disk is the one the run reads back, with the inputs in it
  const back = await readSourceManifest(into);
  assert.equal(back.stop, null);
  assert.deepEqual(back.manifest?.inputs, r.prep.manifest.inputs);
  assert.equal(back.manifest?.source, file, 'source names the person\'s file, not the scratch staging folder');
  assert.equal(isRubricFilesManifest(back.manifest), true);
});

test('two inputs with one file name never overwrite each other under input/', async () => {
  const a = join(tmp(), 'notes.md'); writeFileSync(a, 'alpha text\n');
  const b = join(tmp(), 'notes.md'); writeFileSync(b, 'beta text\n');
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'A', value: a }, { n: 2, label: 'B', value: b }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.deepEqual(r.prep.manifest.inputs.map((/** @type {any} */ i) => i.rel), ['input/notes.md', 'input/2-notes.md']);
  assert.equal(readFileSync(join(r.prep.tree, 'input', '2-notes.md'), 'utf8'), 'beta text\n');
});

test('a URL or a search line is refused in the exact plain words, naming the line, before anything is written', async () => {
  const { file } = changelogCopy();
  for (const [value, label] of [['https://example.com/page', 'Page'], ['best flights', 'search']]) {
    const into = join(tmp(), 'seed');
    const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }, { n: 2, label, value }], into });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, 'line 2: web inputs (URLs, search) arrive in a later build. Nothing spent.');
    assert.equal(existsSync(into), false, 'a refusal leaves nothing on disk');
  }
});

test('refusals: relative path, missing, folder, symlink, env file, oversize, non-UTF-8, NUL, repeated label', async () => {
  const { dir, file } = changelogCopy();
  const link = join(dir, 'link.md'); symlinkSync(file, link);
  const env = join(dir, '.env'); writeFileSync(env, 'X=1\n');
  const big = join(dir, 'big.txt'); writeFileSync(big, Buffer.alloc(RUBRIC_INPUT_MAX_BYTES + 1, 0x61));
  const latin = join(dir, 'latin.txt'); writeFileSync(latin, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])); // "caf\xe9" — not UTF-8
  const nul = join(dir, 'nul.txt'); writeFileSync(nul, Buffer.from([0x61, 0x00, 0x62]));
  const cases = [
    [{ label: 'X', value: 'notes.md' }, /must be the full path of a file/],
    [{ label: 'X', value: join(dir, 'nope.md') }, /does not exist/],
    [{ label: 'X', value: dir }, /is not a file/],
    [{ label: 'X', value: link }, /symlink/],
    [{ label: 'X', value: env }, /environment file/],
    [{ label: 'X', value: big }, /MiB limit/],
    [{ label: 'X', value: latin }, /not UTF-8 text/],
    [{ label: 'X', value: nul }, /not a text file/],
    [{ label: 'changelog', value: file, dup: true }, /already used by an earlier line/],
  ];
  for (const [bad, re] of cases) {
    const inputs = [{ n: 1, label: 'Changelog', value: file }, { n: 2, label: bad.label, value: bad.value }];
    const r = await proveRubricInputs({ inputs, into: join(tmp(), 'seed') });
    assert.equal(r.ok, false, `${bad.value} should be refused`);
    if (r.ok) return;
    assert.match(r.error, /^line 2: /);
    assert.match(r.error, re);
    assert.match(r.error, /Nothing spent\.$/);
  }
});

test('a file carrying a known secret shape is refused by the same front door, with the file named and the secret not echoed', async () => {
  const dir = tmp();
  const secret = `sk-ant-${'a1B2c3D4e5F6'.repeat(4)}`;
  const f = join(dir, 'notes.md'); writeFileSync(f, `my key is ${secret}\n`);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Notes', value: f }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, 'source-carries-secret');
  assert.equal(r.error.includes(secret), false);
});

test('the destination, when given, is proven by the same door (an absolute directory), and a bad one refuses before the copy', async () => {
  const { file } = changelogCopy();
  const dest = join(tmp(), 'out');
  const ok = await proveRubricInputs({ inputs: [{ n: 1, label: 'C', value: file }], into: join(tmp(), 'seed'), destination: dest });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  if (ok.ok) assert.equal(ok.prep.manifest.destination, dest);
  const bad = await proveRubricInputs({ inputs: [{ n: 1, label: 'C', value: file }], into: join(tmp(), 'seed2'), destination: 'relative/dir' });
  assert.equal(bad.ok, false);
});

test('isRubricFilesManifest is false for a repo, a plain folder without inputs, and nothing', () => {
  assert.equal(isRubricFilesManifest(null), false);
  assert.equal(isRubricFilesManifest(undefined), false);
  assert.equal(isRubricFilesManifest({ kind: 'repo', inputs: [{ label: 'a' }] }), false);
  assert.equal(isRubricFilesManifest({ kind: 'folder' }), false);
  assert.equal(isRubricFilesManifest({ kind: 'folder', inputs: [] }), false);
  assert.equal(isRubricFilesManifest({ kind: 'folder', inputs: [{ label: 'a' }] }), true);
});

test('looksLikeLocalFile: true for an existing absolute file only — a folder, a URL, a relative or missing path are not', async () => {
  const { looksLikeLocalFile } = await import('../src/source.js');
  const { dir, file } = changelogCopy();
  assert.equal(looksLikeLocalFile(file), true);
  assert.equal(looksLikeLocalFile(dir), false);
  assert.equal(looksLikeLocalFile('https://example.com/x.md'), false);
  assert.equal(looksLikeLocalFile('CHANGELOG.md'), false);
  assert.equal(looksLikeLocalFile(join(dir, 'missing.md')), false);
});
