// THE STALE-POINTER SERVE (readshim L1's other half).
//
// The shim's cap steers the worker at `ctx_recall` → `ctx_get` for a whole
// function. `ctx_get` is content-hash gated and throws `StalePointerError` the
// moment the file changed on disk after indexing — which is the NORMAL case for
// a worker that just edited the file it is working on. Measured in Phase 2's A1
// arm: 10 ctx_get calls, 5 stale, 0 bytes each, every one a file the worker had
// just edited. The round is paid for and returns nothing.
//
// So a stale pointer serves the REQUESTED LINE RANGE fresh from disk, labelled
// as a raw line slice rather than the chunk that was asked for — litectx refuses
// to do this itself precisely because an UNLABELLED line slice can be a
// different symbol's body (see its StalePointerError docstring). The label is
// what makes it legal here; without it this would be the same lie.
//
// The single most important property under test is the LAST one: a ranged serve
// must never contribute to the delivery ledger's `full`. A slice is not the
// file, and a ledger that thinks otherwise answers the next read with "you
// already have it" while the worker holds 90 lines of 900 — the exact
// untruthful-pointer failure the shim exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StalePointerError } from 'litectx';
import { createReadShim, wrapReadTool, readShimArm, READ_SHIM_CAP } from '../src/readshim.js';
import { createCtxTools } from '../src/tools.js';

const mkdir = () => mkdtempSync(join(tmpdir(), 'shimstale-'));

/** A read tool that hands back whatever is at `path` in `files`, like shell_read. */
const readTool = (files) => ({
  name: 'shell_read',
  execute: async ({ path }) => files[path],
});

// ── serving ────────────────────────────────────────────────────────────────

// The handle space is litectx's: 0-BASED and INCLUSIVE, the space `LINE_SPACE`
// tells the worker it is in. Asserted here as a property of the SERVE because a
// serve that renumbered would return the wrong lines with no error at all — and
// the integration test at the bottom of this file pins the same claim against
// real litectx rather than against this comment.
test('a stale pointer serves the requested line range fresh from disk, 0-based inclusive', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'a.py');
    writeFileSync(file, ['L0', 'L1', 'L2', 'L3', 'L4'].join('\n'));
    const shim = createReadShim({ arm: readShimArm('cap') });
    const r = shim.serveStale({ file, path: 'a.py', startLine: 1, endLine: 3, detail: 'stale' });
    assert.equal(r.outcome, 'stale-served');
    assert.match(r.text, /L1\nL2\nL3/);
    assert.doesNotMatch(r.text, /L0/);
    assert.doesNotMatch(r.text, /L4/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the served slice is labelled a stale raw line slice, not the chunk asked for', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'a.py');
    writeFileSync(file, 'one\ntwo\nthree\n');
    const shim = createReadShim({ arm: readShimArm('cap') });
    const { text } = shim.serveStale({ file, path: 'pkg/a.py', startLine: 2, endLine: 2, detail: 'stale' });
    assert.match(text, /STALE/);            // names the pointer's state
    assert.match(text, /pkg\/a\.py/);       // names the file
    assert.match(text, /DIFFERENT code/);   // warns the range may have moved
    assert.match(text, /ctx_recall/);       // names the recovery
    assert.match(text, /\[bareloop:/);      // TRUSTED framing, same register as the cap notice
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a ranged serve respects the cap and says it was cut', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'big.py');
    const line = 'x'.repeat(999);
    writeFileSync(file, Array.from({ length: 200 }, () => line).join('\n'));
    const shim = createReadShim({ arm: readShimArm('cap') });
    const { text, outcome } = shim.serveStale({ file, path: 'big.py', startLine: 1, endLine: 200, detail: 'stale' });
    assert.equal(outcome, 'stale-served');
    const body = text.slice(text.indexOf(']\n\n') + 3);   // past the notice and its blank line
    assert.ok(Buffer.byteLength(body, 'utf8') <= READ_SHIM_CAP, `body ${Buffer.byteLength(body, 'utf8')} > cap`);
    assert.match(text, /cut at the 24576-byte read limit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a serve past the end of the file is a refusal RESULT, never a throw', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'short.py');
    writeFileSync(file, 'a\nb\n');
    const shim = createReadShim({ arm: readShimArm('cap') });
    const { text, outcome } = shim.serveStale({ file, path: 'short.py', startLine: 90, endLine: 120, detail: 'd' });
    assert.equal(outcome, 'stale-past-eof');
    assert.match(text, /past its end/);
    assert.match(text, /only 2 lines long/);
    assert.match(text, /ctx_recall/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a serve of a file that is gone is a refusal RESULT, never a throw', () => {
  const shim = createReadShim({ arm: readShimArm('cap') });
  const { text, outcome } = shim.serveStale({ file: join(mkdir(), 'nope.py'), path: 'nope.py', startLine: 1, endLine: 3, detail: 'd' });
  assert.equal(outcome, 'stale-absent');
  assert.match(text, /no longer on disk/);
});

test('an end line past EOF serves what exists and says where the file ends', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'a.py');
    writeFileSync(file, 'a\nb\nc\n');
    const shim = createReadShim({ arm: readShimArm('cap') });
    const { text, outcome } = shim.serveStale({ file, path: 'a.py', startLine: 1, endLine: 99, detail: 'd' });
    assert.equal(outcome, 'stale-served');
    assert.match(text, /b\nc/);
    assert.match(text, /lines 1-2 is STALE/);   // clamped to the file's last index
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an arm without the cap serves nothing — A0 and A2 are untouched', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'a.py');
    writeFileSync(file, 'a\nb\n');
    for (const flag of [false, 'diff']) {
      const shim = createReadShim({ arm: readShimArm(flag) });
      assert.equal(shim.serveStale({ file, path: 'a.py', startLine: 1, endLine: 2, detail: 'd' }), null);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the ledger property (the one that must never regress) ──────────────────

test('LEDGER: a ranged serve never marks the file delivered', async () => {
  const dir = mkdir();
  try {
    const body = `${Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')}\n`;
    const file = join(dir, 'a.py');
    writeFileSync(file, body);
    // BOTH path spellings, because the ledger is keyed by the string the read
    // tool was called with and the serve is handed two of them (`file` absolute,
    // `path` repo-relative). A test that spells them differently proves nothing:
    // a serve that wrote the ledger under the OTHER key would sail through it.
    for (const key of ['a.py', file]) {
      const shim = createReadShim({ arm: readShimArm('cap') });
      const tool = shim.wrapRead(readTool({ [key]: body }));

      // The whole file, by line range, through the stale path — every byte of it.
      const served = shim.serveStale({ file, path: key, startLine: 1, endLine: 40, detail: 'd' });
      assert.equal(served.outcome, 'stale-served');
      assert.ok(served.text.includes('line 39'), 'the serve really did cover the whole file');

      // A read of that path must still hand over the bytes. If the serve had
      // contributed to the ledger, this would answer with the pointer instead.
      const r = await tool.execute({ path: key });
      assert.doesNotMatch(r, /unchanged since you read it/, `pointer minted from a ranged serve (key ${key})`);
      assert.equal(r, body);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('LEDGER: a ranged serve never advances the read seam continuation point', async () => {
  const dir = mkdir();
  try {
    const line = `${'y'.repeat(99)}\n`;
    const body = line.repeat(600);             // ~60KB, well over the cap
    const file = join(dir, 'big.py');
    writeFileSync(file, body);
    for (const key of ['big.py', file]) {
      const shim = createReadShim({ arm: readShimArm('cap') });
      const tool = shim.wrapRead(readTool({ [key]: body }));

      const first = await tool.execute({ path: key });
      assert.match(first, /bytes 0-\d+ of \d+ shown/);
      const firstBytes = Number(/bytes 0-(\d+) of/.exec(first)[1]);

      shim.serveStale({ file, path: key, startLine: 1, endLine: 600, detail: 'd' });

      const second = await tool.execute({ path: key });
      assert.match(second, new RegExp(`bytes ${firstBytes}-`), `the seam continues where the READ left off (key ${key})`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the ctx_get seam ───────────────────────────────────────────────────────

const fakeLc = (thrown) => ({ get: () => { throw thrown; }, recall: async () => [] });
const getTool = (lc, opts) => createCtxTools(lc, '/work', () => {}, opts).find((t) => t.name === 'ctx_get');

test('ctx_get routes a typed StalePointerError to the serve hook', async () => {
  const seen = [];
  const tool = getTool(fakeLc(new StalePointerError('a.py')), {
    onStalePointer: (req) => { seen.push(req); return { text: 'SERVED BYTES', outcome: 'stale-served' }; },
  });
  const out = await tool.execute({ path: 'a.py', startLine: 4, endLine: 9 });
  assert.equal(out, 'SERVED BYTES');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, 'a.py');
  assert.equal(seen[0].startLine, 4);
  assert.equal(seen[0].endLine, 9);
  assert.equal(seen[0].file, '/work/a.py');   // the path the gate judged, resolved the same way
});

test('ctx_get with NO hook is byte-identical to before — A0 is untouched', async () => {
  const err = new StalePointerError('a.py');
  const tool = getTool(fakeLc(err));
  const out = await tool.execute({ path: 'a.py', startLine: 4, endLine: 9 });
  assert.equal(out, `stale pointer: ${err.message}`);
});

test('a non-stale ctx_get failure never reaches the serve hook', async () => {
  let called = false;
  const tool = getTool(fakeLc(new Error('database is locked')), {
    onStalePointer: () => { called = true; return { text: 'x', outcome: 'stale-served' }; },
  });
  const out = await tool.execute({ path: 'a.py', startLine: 1, endLine: 2 });
  assert.equal(called, false, 'a generic throw is not a stale pointer');
  assert.equal(out, 'stale pointer: database is locked');
});

test('a hook that declines leaves the plain stale-pointer refusal in place', async () => {
  const err = new StalePointerError('a.py');
  const tool = getTool(fakeLc(err), { onStalePointer: () => null });
  const out = await tool.execute({ path: 'a.py', startLine: 1, endLine: 2 });
  assert.equal(out, `stale pointer: ${err.message}`);
});

test('the stale serve is reported on the spine with its own outcome and byte count', async () => {
  const events = [];
  const lc = fakeLc(new StalePointerError('a.py'));
  const tool = createCtxTools(lc, '/work', (t, d) => events.push([t, d]), {
    onStalePointer: () => ({ text: 'SERVED', outcome: 'stale-served' }),
  }).find((t) => t.name === 'ctx_get');
  await tool.execute({ path: 'a.py', startLine: 1, endLine: 2 });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'ctx-tool');
  assert.equal(events[0][1].outcome, 'stale-served');
  assert.equal(events[0][1].bytes, 6);
  assert.equal(events[0][1].detail, undefined, 'the served TEXT never rides the spine');
});

test('wrapReadTool still returns the tool it was given', async () => {
  const t = readTool({ '/x': 'hello' });
  assert.equal(wrapReadTool(t, { arm: readShimArm('cap') }), t);
  assert.equal(await t.execute({ path: '/x' }), 'hello');
});

// ── against real litectx ────────────────────────────────────────────────────
// The unit tests above pin the serve against a line space this file ASSERTS.
// This one pins it against the line space litectx actually issues, on a real
// index, through a real drift — which is the only version that can catch a
// renumbering. It is the test that failed the first implementation: litectx
// handles are 0-based inclusive and the serve had read them as 1-based, so it
// returned the wrong lines with no error anywhere.

test('INTEGRATION: a stale serve returns the same lines ctx_get would have, on a real index', async () => {
  const { LiteCtx } = await import('litectx');
  const dir = mkdir();
  try {
    const src = ['# module', '', 'def alpha():', '    return 1', '', 'def beta():', '    return 2', ''].join('\n');
    const file = join(dir, 'm.py');
    writeFileSync(file, src);
    const lc = new LiteCtx({ root: dir });
    await lc.index({ force: true });
    const hit = (await lc.recall('beta', { kind: 'code', n: 5 })).find((h) => h.chunk?.symbol === 'beta');
    assert.ok(hit, 'litectx found the symbol');
    const { startLine, endLine } = hit.chunk;
    const before = lc.get('m.py', { startLine, endLine }).text;
    assert.match(before, /def beta/);

    // Drift the file the way a worker does — edit it, without moving the chunk.
    writeFileSync(file, `${src}\n# a worker's edit\n`);
    assert.throws(() => lc.get('m.py', { startLine, endLine }), { name: 'StalePointerError' });

    const shim = createReadShim({ arm: readShimArm('cap') });
    const served = shim.serveStale({ file, path: 'm.py', startLine, endLine, detail: 'd' });
    assert.equal(served.outcome, 'stale-served');
    const body = served.text.slice(served.text.indexOf(']\n\n') + 3);
    assert.equal(body, `${before}\n`, 'the served slice IS the chunk the stale pointer named');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a serve against a file that is now empty refuses without printing an index of -1', () => {
  const dir = mkdir();
  try {
    const file = join(dir, 'gone.py');
    writeFileSync(file, '');
    const shim = createReadShim({ arm: readShimArm('cap') });
    const { text, outcome } = shim.serveStale({ file, path: 'gone.py', startLine: 0, endLine: 4, detail: 'd' });
    assert.equal(outcome, 'stale-past-eof');
    assert.match(text, /is now empty/);
    assert.doesNotMatch(text, /-1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
