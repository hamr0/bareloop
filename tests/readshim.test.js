// The read shim (L1 pointer + L4 cap), driven through the REAL bare-agent
// `shell_read` against real files on disk — the tool the runner actually wraps,
// never a stand-in that returns whatever the test wants (a fixture tool would
// prove the ledger's arithmetic and nothing about the seam).
//
// The load-bearing case is the FIRST test: a >cap file re-read unchanged must
// come back as the next unseen slice, never as "you already have it". The $0
// replay over 1,844 archived reads measured the naive path+hash pointer telling
// that lie 250 times, median 73,348 bytes hidden per lie — BA-17 read-blinding,
// reproduced by design. Every pointer here is asserted against what was
// DELIVERED, which is the whole correctness claim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { wrapReadTool, READ_SHIM_CAP } from '../src/readshim.js';

const require = createRequire(import.meta.url);
const { createShellTools } = require('bare-agent/tools');

/** the real shell_read, freshly built (the runner builds one per worker too) */
const rawRead = () => createShellTools().tools.find((/** @type {{name: string}} */ t) => t.name === 'shell_read');

/** a file whose every 1000-byte block is self-identifying, so a delivered slice
 * can be located by content rather than by trusting a reported offset */
function bigFile(dir, name, blocks) {
  const body = Array.from({ length: blocks }, (_, i) => `BLOCK-${String(i).padStart(4, '0')} ${'x'.repeat(982)}\n`).join('');
  const p = join(dir, name);
  writeFileSync(p, body);
  return { path: p, body };
}

const patient = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'readshim-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

test('the naive hazard: a >cap file re-read unchanged returns the NEXT UNSEEN SLICE, never a bare pointer', async (t) => {
  const d = patient(t);
  const { path, body } = bigFile(d, 'big.txt', 60);           // ~60 KB, 2.4x the cap
  const rd = wrapReadTool(rawRead());

  const first = await rd.execute({ path });
  assert.ok(first.includes('BLOCK-0000'), 'the first read starts at byte 0');
  assert.ok(!first.includes('BLOCK-0030'), 'and stops at the cap — a 60 KB file is not delivered whole');

  const second = await rd.execute({ path });
  // the lie the naive design tells here: "unchanged — you already have it",
  // while the worker holds 24 KB of 60 KB
  assert.ok(!/unchanged/i.test(second), 'a partly-seen file is never answered with a pointer');
  assert.ok(second.includes('BLOCK-0025'), 'the continuation carries bytes the worker had never seen');
  assert.ok(!second.includes('BLOCK-0000'), 'and does not re-send bytes it already paid for');

  const third = await rd.execute({ path });
  assert.ok(third.includes('BLOCK-0059'), 'the third slice reaches the end of the file');

  // every byte of the file has now been delivered exactly once, in order — the
  // property the pointer is allowed to rely on, checked against the file itself
  const delivered = [first, second, third].map((s) => s.replace(/\n\n\[bareloop:[^\]]*\]$/, '')).join('');
  assert.equal(delivered, body, 'the three slices reconstruct the file byte for byte');
});

test('a fully-delivered file re-read unchanged DOES get a pointer', async (t) => {
  const d = patient(t);
  const p = join(d, 'small.txt');
  writeFileSync(p, 'export const x = 1;\n');
  const rd = wrapReadTool(rawRead());

  const first = await rd.execute({ path: p });
  assert.equal(first, 'export const x = 1;\n', 'an under-cap first read is the tool\'s own bytes, untouched');

  const second = await rd.execute({ path: p });
  assert.match(second, /unchanged/, 'the worker already holds every byte — the pointer is truthful here');
  assert.ok(second.length < first.length + 200, 'and it is a pointer, not the bytes again');
});

test('a CHANGED file re-delivers from the start, under the cap rules', async (t) => {
  const d = patient(t);
  const p = join(d, 'mod.mjs');
  writeFileSync(p, 'export const x = 1;\n');
  const rd = wrapReadTool(rawRead());
  await rd.execute({ path: p });

  writeFileSync(p, 'export const x = 2;\n');
  const second = await rd.execute({ path: p });
  assert.equal(second, 'export const x = 2;\n', 'the new bytes, whole — a pointer here would hide the edit');
});

test('a SHRUNK file re-delivers: coverage never survives a content change (the POC\'s Math.max masking direction)', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  await rd.execute({ path });                                  // holds bytes 0..cap
  writeFileSync(path, 'tiny\n');                               // now 5 bytes — fully inside prior coverage

  const after = await rd.execute({ path });
  assert.equal(after, 'tiny\n', 'stale coverage must not answer for a file that shrank under it');
});

test('the cap notice steers at the retrieval verbs (a capped worker with no way to aim is BA-17 on purpose)', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  const first = await rd.execute({ path });
  assert.match(first, /ctx_recall/, 'the notice names the verb that finds a symbol');
  assert.match(first, /ctx_get/, 'and the verb that reads one in full');
  assert.ok(Buffer.byteLength(first, 'utf8') < READ_SHIM_CAP + 600, 'the notice is a line, not a payload');
});

test('a THROWN read (the file is not there) propagates and leaves no ledger entry behind it', async (t) => {
  const d = patient(t);
  const rd = wrapReadTool(rawRead());
  const p = join(d, 'later.txt');
  await assert.rejects(() => rd.execute({ path: p }), /ENOENT/, 'the tool\'s own failure is the worker\'s result, unwrapped');
  writeFileSync(p, 'appeared\n');
  assert.equal(await rd.execute({ path: p }), 'appeared\n', 'a path that failed once still delivers its bytes when it exists');
});

// ---------------------------------------------------------------------------
// L2 (the DIFF lever). The claim under test is narrow on purpose: a diff is a
// statement ABOUT bytes the worker already has, so it is legal only when the
// ledger proves it has all of them, and only when it is smaller than the slice
// it replaces. Both guards are load-bearing — the first is the same lie class
// the pointer exists to prevent, the second turns a saving into a loss.

/** deliver `path` in full through the shim, whatever it takes */
async function readWhole(rd, path) {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const r = await rd.execute({ path });
    out.push(r);
    if (!/this read is capped/.test(r)) break;
  }
  return out;
}

test('L2: a file the worker holds IN FULL comes back as a DIFF when it changes', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);                  // 60 KB, three reads to hold whole
  const rd = wrapReadTool(rawRead());
  const slices = await readWhole(rd, path);
  assert.equal(slices.length, 3, 'the file really did take three capped reads to deliver');

  // one line edited, deep in the file — the archetypal re-read after an edit
  const edited = slices.map((s) => s.replace(/\n\n\[bareloop:[^\]]*\]$/, '')).join('')
    .replace('BLOCK-0042', 'BLOCK-XXXX');
  writeFileSync(path, edited);

  const after = await rd.execute({ path });
  assert.match(after, /\[bareloop:/, 'the diff carries the same TRUSTED framing as the other notices');
  assert.match(after, /diff/i, 'and says plainly that it is a diff, not the file');
  assert.match(after, /^@@ /m, 'a unified-style hunk header locates the change');
  assert.match(after, /^-BLOCK-0042/m, 'the line that went');
  assert.match(after, /^\+BLOCK-XXXX/m, 'and the line that came');
  assert.ok(!after.includes('BLOCK-0007'), 'untouched regions are not re-sent — that is the whole point');
});

test('L2: the diff is SMALLER than the content it replaces', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  const slices = await readWhole(rd, path);
  const whole = slices.map((s) => s.replace(/\n\n\[bareloop:[^\]]*\]$/, '')).join('');
  writeFileSync(path, whole.replace('BLOCK-0042', 'BLOCK-XXXX'));

  const after = await rd.execute({ path });
  assert.ok(Buffer.byteLength(after, 'utf8') < READ_SHIM_CAP,
    `a one-line edit must cost far less than a capped re-delivery (got ${Buffer.byteLength(after, 'utf8')})`);
  // one hunk is the changed line plus four context lines, and this fixture's
  // lines are ~1 KB each — so the floor here is the fixture's, not the diff's
  assert.ok(Buffer.byteLength(after, 'utf8') < READ_SHIM_CAP / 3, 'and in practice one hunk plus its framing, not a payload');
});

test('L2: PARTIAL coverage gets NO diff — a diff against bytes the worker never had is the pointer lie again', async (t) => {
  const d = patient(t);
  const { path, body } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  await rd.execute({ path });                                  // only the first 24 KB, ever
  writeFileSync(path, body.replace('BLOCK-0042', 'BLOCK-XXXX'));

  const after = await rd.execute({ path });
  assert.ok(!/^@@ /m.test(after), 'no diff: the worker never held the old version whole');
  assert.ok(after.includes('BLOCK-0000'), 'it re-delivers from byte 0 under the cap rules instead');
  assert.match(after, /this read is capped/, 'with the ordinary cap notice');
});

test('L2: an OVERSIZED diff falls back to the capped re-delivery — never an unbounded diff', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  await readWhole(rd, path);                                   // held in full

  // every line different: the diff would be ~2x the file, a loss over the slice
  const rewritten = Array.from({ length: 60 }, (_, i) => `NEWBLOCK-${String(i).padStart(4, '0')} ${'y'.repeat(979)}\n`).join('');
  writeFileSync(path, rewritten);

  const after = await rd.execute({ path });
  assert.ok(!/^@@ /m.test(after), 'the diff was bigger than the slice it replaces, so it is not sent');
  assert.ok(after.includes('NEWBLOCK-0000'), 're-delivery starts at byte 0');
  assert.match(after, /this read is capped/, 'under the ordinary cap');
  assert.ok(Buffer.byteLength(after, 'utf8') < READ_SHIM_CAP + 600, 'and is bounded by the cap, like any other slice');
});

test('L2: after a diff the ledger says the worker holds the NEW content — the next read is a truthful pointer', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  const slices = await readWhole(rd, path);
  const whole = slices.map((s) => s.replace(/\n\n\[bareloop:[^\]]*\]$/, '')).join('');
  // a LENGTH-changing edit, so the pointer's byte count can only be right by
  // reading the new content — not by echoing the old total back unchanged
  const next = whole.replace('BLOCK-0042 xx', 'BLOCK-XXXX ');
  writeFileSync(path, next);
  const diff = await rd.execute({ path });
  assert.match(diff, /^@@ /m, 'precondition: the diff did fire');

  const after = await rd.execute({ path });
  assert.match(after, /unchanged/, 'a diff against a complete copy leaves the worker holding the new file whole');
  assert.ok(after.includes(String(Buffer.byteLength(next, 'utf8'))), 'and the pointer names the NEW total');
});

test('L2: after a FALLBACK the ledger says only what was delivered — the next read continues, it does not point', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead());
  await readWhole(rd, path);
  const rewritten = Array.from({ length: 60 }, (_, i) => `NEWBLOCK-${String(i).padStart(4, '0')} ${'y'.repeat(979)}\n`).join('');
  writeFileSync(path, rewritten);
  const fallback = await rd.execute({ path });
  assert.ok(!/^@@ /m.test(fallback), 'precondition: the oversized diff fell back');

  const after = await rd.execute({ path });
  assert.ok(!/unchanged/i.test(after), 'the worker holds 24 KB of 60 KB — a pointer here is the lie');
  assert.ok(after.includes('NEWBLOCK-0025'), 'it continues with bytes never delivered');
});
