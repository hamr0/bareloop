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
