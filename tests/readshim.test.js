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
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { wrapReadTool, readShimArm, readShimStrategy, READ_SHIM_CAP, READ_SHIM_STRATEGY } from '../src/readshim.js';

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

// ---------------------------------------------------------------------------
// THE ARMS (Phase 2 pre-registration, 2026-08-18). Four arms, and the whole
// battery is unreadable unless each one runs EXACTLY the levers its row names:
// an arm that quietly carries a neighbour's lever attributes that lever's effect
// to the wrong row, and no reading of the results can recover it afterwards.
//
// So every arm below is asserted on BOTH sides — what is on AND what is off.
// A test that only checks the levers it expects to fire cannot tell an arm from
// a superset of it, which is precisely the failure mode.

/** a file that changed under the worker's feet, given back through `rd` */
const changeAndRead = async (rd, path, from, to) => {
  const cur = readFileSync(path, 'utf8');
  writeFileSync(path, cur.replace(from, to));
  return rd.execute({ path });
};

test('ARM false (A0): the seam is not wrapped at all — the tool the runner built is the tool the worker gets', async (t) => {
  const d = patient(t);
  const { path, body } = bigFile(d, 'big.txt', 60);
  const raw = rawRead();
  const before = raw.execute;
  const rd = wrapReadTool(raw, { arm: readShimArm(false) });

  assert.equal(rd, raw, 'the same tool object');
  assert.equal(rd.execute, before, 'with the SAME execute — A0 is the seam untouched, not a wrapper that behaves the same');

  const first = await rd.execute({ path });
  assert.equal(first, body, 'a 60 KB file comes back whole, byte for byte');
  const second = await rd.execute({ path });
  assert.equal(second, body, 'and again — no ledger, no pointer');
  assert.ok(!first.includes('bareloop:'), 'the shim left no mark of any kind');
  assert.equal(await changeAndRead(rd, path, 'BLOCK-0042', 'BLOCK-XXXX'), body.replace('BLOCK-0042', 'BLOCK-XXXX'), 'and a changed file is the file, never a diff');
});

test('ARM cap (A1): cap ON, pointer ON, slice ON — and the diff OFF', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead(), { arm: readShimArm('cap') });

  // ON: the cap binds and the notice says so
  const first = await rd.execute({ path });
  assert.ok(first.includes('BLOCK-0000') && !first.includes('BLOCK-0030'), 'the cap binds the first read');
  assert.match(first, /this read is capped/, 'and the capped-slice notice rides with it');
  // ON: the next unseen slice, never a re-send and never a premature pointer
  const second = await rd.execute({ path });
  assert.ok(second.includes('BLOCK-0025') && !second.includes('BLOCK-0000'), 'the re-read continues where it stopped');
  assert.ok(!/unchanged/i.test(second), 'a partly-seen file is never pointed at');
  const third = await rd.execute({ path });
  assert.ok(third.includes('BLOCK-0059'), 'and the third slice ends the file');
  // ON: the pointer, once coverage is complete
  assert.match(await rd.execute({ path }), /unchanged/, 'a fully-delivered unchanged file is answered with the pointer');

  // OFF: the diff. The worker holds this file IN FULL and one line changed —
  // the exact state A3 diffs from — and this arm must re-deliver instead.
  const after = await changeAndRead(rd, path, 'BLOCK-0042', 'BLOCK-XXXX');
  assert.ok(!/^@@ /m.test(after), 'no hunk header: the diff lever is not in this arm');
  assert.ok(!/DIFF against/.test(after), 'and no diff framing');
  assert.ok(after.includes('BLOCK-0000'), 'the changed file re-delivers from byte 0, exactly as it did before L2 existed');
  assert.match(after, /this read is capped/, 'under the ordinary cap rules');
});

test('ARM diff (A2): diff ON — and the cap OFF, the pointer OFF', async (t) => {
  const d = patient(t);
  const { path, body } = bigFile(d, 'big.txt', 60);      // 60 KB, 2.4x the cap
  const rd = wrapReadTool(rawRead(), { arm: readShimArm('diff') });

  // OFF: the cap. A file well over READ_SHIM_CAP arrives WHOLE, unannotated.
  const first = await rd.execute({ path });
  assert.equal(first, body, 'a 60 KB first read is the whole file, byte for byte');
  assert.ok(!first.includes('bareloop:'), 'and carries no notice — there is no bound to announce');
  assert.ok(Buffer.byteLength(first, 'utf8') > READ_SHIM_CAP * 2, 'sanity: the fixture really is far over the cap the other arms apply');

  // OFF: the pointer. The worker demonstrably holds the file whole (that is what
  // makes the diff below legal), so this is the pointer's own best case — and
  // this arm still hands the bytes back, because the pointer belongs to A1.
  const second = await rd.execute({ path });
  assert.equal(second, body, 'an unchanged re-read re-delivers');
  assert.ok(!/unchanged|already hold/i.test(second), 'no pointer: that saving is A1\'s lever, not this arm\'s');

  // ON: the diff.
  const after = await changeAndRead(rd, path, 'BLOCK-0042', 'BLOCK-XXXX');
  assert.match(after, /DIFF against/, 'a changed file comes back as a labelled diff');
  assert.match(after, /^@@ /m, 'with a hunk header');
  assert.match(after, /^-BLOCK-0042/m, 'the line that went');
  assert.match(after, /^\+BLOCK-XXXX/m, 'and the line that came');
  assert.ok(!after.includes('BLOCK-0007'), 'untouched regions are not re-sent');
  assert.ok(!/this read is capped/.test(after), 'and no cap notice — nothing was capped');
});

test('ARM diff (A2): the diff still refuses what it cannot honestly assert — an oversized diff re-delivers WHOLE', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead(), { arm: readShimArm('diff') });
  await rd.execute({ path });

  // every line different: the diff would be ~2x the file, a loss over re-sending it
  const rewritten = Array.from({ length: 60 }, (_, i) => `NEWBLOCK-${String(i).padStart(4, '0')} ${'y'.repeat(979)}\n`).join('');
  writeFileSync(path, rewritten);
  const after = await rd.execute({ path });
  assert.ok(!/^@@ /m.test(after), 'the diff was bigger than the re-delivery it replaces, so it is not sent');
  assert.equal(after, rewritten, 'and the fallback is the whole new file — uncapped, like every other read in this arm');
});

test('ARM true (A3): every lever at once — cap, slice, pointer AND diff', async (t) => {
  const d = patient(t);
  const { path } = bigFile(d, 'big.txt', 60);
  const rd = wrapReadTool(rawRead(), { arm: readShimArm(true) });

  const first = await rd.execute({ path });
  assert.ok(first.includes('BLOCK-0000') && !first.includes('BLOCK-0030'), 'cap');
  const slices = [first, ...await readWhole(rd, path)];
  assert.ok(slices.some((s) => s.includes('BLOCK-0059')), 'slice: the file is delivered in full across re-reads');
  assert.match(await rd.execute({ path }), /unchanged/, 'pointer');
  assert.match(await changeAndRead(rd, path, 'BLOCK-0042', 'BLOCK-XXXX'), /^@@ /m, 'diff');
});

test('ARM true is byte-identical to the DEFAULT — no caller written against the boolean changed meaning', async (t) => {
  const d = patient(t);
  const run = async (opts) => {
    const { path } = bigFile(d, `b${Math.random()}.txt`, 60);
    const rd = wrapReadTool(rawRead(), opts);
    const out = [await rd.execute({ path }), await rd.execute({ path }), await rd.execute({ path }), await rd.execute({ path })];
    out.push(await changeAndRead(rd, path, 'BLOCK-0042', 'BLOCK-XXXX'));
    // the paths differ per run, so compare on the shim's OWN framing and payload
    return out.map((s) => s.replace(/\/[^\s\]]*b0\.[0-9]+\.txt/g, '<path>'));
  };
  assert.deepEqual(await run({ arm: readShimArm(true) }), await run(undefined), 'explicit A3 and the default wrap agree on every response');
});

test('an unrecognised arm THROWS at the guard — a typo must never coerce into a truthy shim', () => {
  for (const bad of ['diff ', 'Diff', 'cap+diff', 'all', '', 'true', 1, 0, null, {}, ['cap']]) {
    assert.throws(() => readShimArm(/** @type {any} */ (bad)), /unknown arm/,
      `${JSON.stringify(bad)} must be refused, not coerced`);
  }
  // …and the four legal spellings are, and stay, legal
  assert.deepEqual(readShimArm(false), { on: false, cap: false, pointer: false, diff: false, g1: false });
  assert.deepEqual(readShimArm(undefined), readShimArm(false), 'an omitted flag is A0, not an error');
  assert.deepEqual(readShimArm('cap'), { on: true, cap: true, pointer: true, diff: false, g1: true });
  assert.deepEqual(readShimArm('diff'), { on: true, cap: false, pointer: false, diff: true, g1: false });
  assert.deepEqual(readShimArm(true), { on: true, cap: true, pointer: true, diff: true, g1: true });
});

test('the persona line describes the arm that is actually installed, and nothing else', () => {
  assert.equal(readShimStrategy(readShimArm(false)), '', 'A0 says nothing');
  assert.equal(readShimStrategy(readShimArm('cap')), READ_SHIM_STRATEGY, 'A1 states the bound');
  assert.equal(readShimStrategy(readShimArm(true)), READ_SHIM_STRATEGY, 'A3 states the same bound, unchanged');
  const a2 = readShimStrategy(readShimArm('diff'));
  assert.match(a2, /DIFF/, 'A2 explains the diff it will actually be sent');
  assert.ok(!/24KB|24 KB|capped|continues where/i.test(a2), 'and never mentions a limit that is not in force — a prompt describing machinery that is off is a lie to the worker');
});

test('REGRESSION: a zero-byte read never mints a pointer for a delivery that never happened', async (t) => {
  const d = patient(t);
  const empty = join(d, 'empty.txt');
  writeFileSync(empty, '');
  const rd = wrapReadTool(rawRead());

  // 0 >= 0 is true, so the pointer's `start >= total` test held on a file the ledger
  // had never seen — the FIRST read of an empty file claimed the worker already had it.
  const first = await rd.execute({ path: empty });
  assert.ok(!/unchanged since you read it/.test(first), 'a first read is never a pointer');
  assert.equal(first, '', 'it delivers the file, which is nothing');
  // and once it HAS been delivered, the pointer is legal and truthful
  assert.match(await rd.execute({ path: empty }), /unchanged since you read it/);

  // the worse half: a file TRUNCATED to empty since it was handed over must never come
  // back as "unchanged — you already hold all of it", or the worker keeps believing in
  // content that is gone.
  const shrunk = join(d, 'shrunk.txt');
  writeFileSync(shrunk, 'hello\n');
  assert.equal(await rd.execute({ path: shrunk }), 'hello\n');
  writeFileSync(shrunk, '');
  const after = await rd.execute({ path: shrunk });
  assert.ok(!/unchanged since you read it/.test(after), 'an emptied file is a CHANGED file, never a pointer');
  assert.equal(after, '', 'the worker is handed the new content: nothing');
});
