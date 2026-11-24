// ONE rule for reading the Destination out of a source.json manifest: a non-empty string, else no Destination. `manifestDestination` is that
// rule on an already-loaded manifest; `readManifestDestination` (a file read) and both userrun.js sites (the review door's landing and the
// green-worktree report copy-out) go through it, so an empty-string record is "no Destination" everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifestDestination, readManifestDestination } from '../src/source.js';

test('manifestDestination: a non-empty string is the record; an empty string, a non-string, no key and no manifest are no Destination', () => {
  assert.equal(manifestDestination({ destination: 'docs/' }), 'docs/');
  for (const bad of [{ destination: '' }, { destination: 7 }, { destination: null }, {}, null, undefined]) assert.equal(manifestDestination(bad), null, JSON.stringify(bad));
});

test('readManifestDestination answers by the same rule (empty string = null; unreadable file = null)', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'bl-mdest-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  writeFileSync(join(d, 'a.json'), JSON.stringify({ destination: 'out/' }));
  writeFileSync(join(d, 'b.json'), JSON.stringify({ destination: '' }));
  assert.equal(readManifestDestination(join(d, 'a.json')), 'out/');
  assert.equal(readManifestDestination(join(d, 'b.json')), null);
  assert.equal(readManifestDestination(join(d, 'missing.json')), null);
});

test('userrun.js applies no Destination rule of its own: both sites read the loaded manifest through manifestDestination', () => {
  const src = readFileSync(new URL('../src/userrun.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /typeof (man\.manifest|wtManifest)\?\.destination === 'string'/, 'no hand-written string test on the manifest destination');
  assert.equal((src.match(/manifestDestination\(/g) ?? []).length >= 2, true, 'both sites call manifestDestination');
});
