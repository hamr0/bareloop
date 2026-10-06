import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveFile } from '../src/movefile.js';

const scratch = (/** @type {import('node:test').TestContext} */ t, base = tmpdir()) => {
  const d = mkdtempSync(join(base, 'movefile-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const BYTES = Buffer.from([0, 1, 2, 255, 10, 13, 200]);
const exdev = () => { throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' }); };

test('moveFile: same device is a plain rename', (t) => {
  const d = scratch(t);
  writeFileSync(join(d, 'a'), BYTES);
  moveFile(join(d, 'a'), join(d, 'b'));
  assert.deepEqual(readFileSync(join(d, 'b')), BYTES);
  assert.equal(existsSync(join(d, 'a')), false);
});

test('moveFile: EXDEV from rename falls back to copy + unlink — identical bytes at dst, src gone', (t) => {
  const d = scratch(t);
  writeFileSync(join(d, 'a'), BYTES);
  moveFile(join(d, 'a'), join(d, 'b'), { rename: exdev });
  assert.deepEqual(readFileSync(join(d, 'b')), BYTES);
  assert.equal(existsSync(join(d, 'a')), false);
});

test('moveFile: any other error rethrows and leaves src in place', (t) => {
  const d = scratch(t);
  writeFileSync(join(d, 'a'), BYTES);
  const eacces = () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); };
  assert.throws(() => moveFile(join(d, 'a'), join(d, 'b'), { rename: eacces }), { code: 'EACCES' });
  assert.deepEqual(readFileSync(join(d, 'a')), BYTES);
  assert.equal(existsSync(join(d, 'b')), false);
  // a missing source (real rename, ENOENT) is not swallowed either
  assert.throws(() => moveFile(join(d, 'nope'), join(d, 'c')), { code: 'ENOENT' });
});

const crossDev = (() => { try { return statSync('/dev/shm').dev !== statSync(tmpdir()).dev; } catch { return false; } })();
test('moveFile: REAL cross-device move (/dev/shm -> tmpdir)', { skip: crossDev ? false : '/dev/shm is on the same device as tmpdir' }, (t) => {
  const a = scratch(t, '/dev/shm'); const b = scratch(t);
  writeFileSync(join(a, 'f'), BYTES);
  assert.throws(() => moveFile(join(a, 'f'), join(b, 'f'), { rename: (x, y) => { throw Object.assign(new Error('x'), { code: 'EOTHER', x, y }); } }), { code: 'EOTHER' });
  moveFile(join(a, 'f'), join(b, 'f'));
  assert.deepEqual(readFileSync(join(b, 'f')), BYTES);
  assert.equal(existsSync(join(a, 'f')), false);
});
