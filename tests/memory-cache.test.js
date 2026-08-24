// MEMORY-CACHE: the read shim's own counters — `pointered`, `capped`,
// `bytesWithheld` — exercised through the REAL bare-agent `shell_read` against
// real files on disk, same posture as tests/readshim.test.js: a fixture tool
// would prove the arithmetic and nothing about the seam it actually wraps.
//
// `bytesWithheld` must be EXACT, never estimated (the brief's own rule), so
// every assertion below checks it against a number derived from the file's
// real size and the real cap — never a hardcoded constant that could drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createReadShim, readShimArm, READ_SHIM_CAP } from '../src/readshim.js';

const require = createRequire(import.meta.url);
const { createShellTools } = require('bare-agent/tools');

const rawRead = () => createShellTools().tools.find((/** @type {{name: string}} */ t) => t.name === 'shell_read');

const patient = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'memory-cache-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

test('a full read then an unchanged re-read counts 1 pointered, bytesWithheld == the held size', async (t) => {
  const d = patient(t);
  const p = join(d, 'small.txt');
  const body = 'export const x = 1;\n';
  writeFileSync(p, body);

  const shim = createReadShim({ arm: readShimArm(true) });
  const rd = shim.wrapRead(rawRead());

  const first = await rd.execute({ path: p });
  assert.equal(first, body, 'first read is the tool\'s own bytes, untouched');
  assert.deepEqual(shim.summary(), { pointered: 0, capped: 0, bytesWithheld: 0 }, 'nothing withheld yet — the whole file was just sent');

  const second = await rd.execute({ path: p });
  assert.match(second, /unchanged/, 'the re-read is answered with a pointer');
  assert.deepEqual(
    shim.summary(),
    { pointered: 1, capped: 0, bytesWithheld: Buffer.byteLength(body, 'utf8') },
    'exactly one pointered response, and bytesWithheld is exactly the size the worker already held',
  );
});

test('a >24KB first read counts 1 capped, bytesWithheld == size minus the delivered slice', async (t) => {
  const d = patient(t);
  const p = join(d, 'big.txt');
  const body = 'x'.repeat(READ_SHIM_CAP * 3); // real, uncrafted-shape data well over the cap
  writeFileSync(p, body);
  const total = Buffer.byteLength(body, 'utf8');

  const shim = createReadShim({ arm: readShimArm(true) });
  const rd = shim.wrapRead(rawRead());

  const first = await rd.execute({ path: p });
  const delivered = Buffer.byteLength(first.replace(/\n\n\[bareloop:[^\]]*\]$/, ''), 'utf8');
  assert.ok(delivered <= READ_SHIM_CAP, 'the delivered slice never exceeds the cap');
  assert.ok(delivered < total, 'a >cap file is not delivered whole on the first read');

  assert.deepEqual(
    shim.summary(),
    { pointered: 0, capped: 1, bytesWithheld: total - delivered },
    'exactly one capped response, and bytesWithheld is exactly the tail this call did not send',
  );
});

test('an UNARMED shim counts and reports nothing — a real re-read of an unchanged file is not answered with a pointer, and no onCount fires', async (t) => {
  const d = patient(t);
  const p = join(d, 'small.txt');
  writeFileSync(p, 'export const x = 1;\n');

  let onCountCalls = 0;
  const shim = createReadShim({ arm: readShimArm(false), onCount: () => { onCountCalls += 1; } });
  const tool = rawRead();
  const wrapped = shim.wrapRead(tool);
  assert.equal(wrapped, tool, 'an OFF arm wraps nothing — the tool object itself is untouched');

  await wrapped.execute({ path: p });
  const second = await wrapped.execute({ path: p });
  assert.ok(!/unchanged/i.test(second), 'A0 has no pointer lever — a re-read is the tool\'s own bytes again');
  assert.equal(onCountCalls, 0, 'onCount never fires when the arm is off');
  assert.deepEqual(shim.summary(), { pointered: 0, capped: 0, bytesWithheld: 0 }, 'an unarmed shim has nothing to report — absence, not a fabricated zero from real activity');
});
