// THE AUTHORING RUNNER'S OWN SPINE VOCABULARY — `scripts/run-author.mjs`.
//
// Read from SOURCE, and that is not laziness. `run-author.mjs` is a top-level
// script: importing it runs it, and the governance block under test is reachable
// only AFTER a real scout and a real model call have been paid for. The repo
// already carries this pattern for the same reason (tests/watchdog.test.js reads
// run-u.mjs's grace arithmetic out of source; tests/authoring.test.js pushed the
// readout and the ceiling parse into `scripts/author-readout.mjs` so a test could
// reach them at all). What cannot be extracted without moving the emit itself is
// pinned here instead of going unchecked.
//
// The defect this locks out: the block emitted its spine event under the
// HARDCODED type `cap-halt` on both arms, so a `pricing-red` — the F6 stop that
// fires when the spend cannot be seen at all — was written to
// `author-<runid>.jsonl` as `{type:'cap-halt', category:'pricing-red'}`. The
// console said the right thing and the log demoted the real stop to a payload
// field. Nothing reads that spine by type yet, which is exactly the shape F45
// names: a shared append-only log sliced by type, misread because one writer
// spelled its event as another writer's event.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { capStop } from '../src/text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = readFileSync(join(REPO, 'scripts/run-author.mjs'), 'utf8');

/** the governance block: from its guard to the emit that closes it */
const BLOCK = /if \(authored\.stop === 'cap-halt' \|\| authored\.stop === 'pricing-red'\) \{[\s\S]*?\n\}\n/.exec(SRC)?.[0];

test('the governance stop is emitted under ITS OWN name, never hardcoded to cap-halt', () => {
  assert.ok(BLOCK, 'the governance block moved — this guard no longer reads the code it guards');
  // the emit's TYPE is the stop itself
  assert.match(BLOCK, /emit\(authored\.stop, \{/, 'the spine type must BE the stop, not a literal');
  // and the literal is gone from the block entirely: an `emit('cap-halt'` here is
  // the defect returning, whichever arm it sits on
  assert.ok(!/emit\('cap-halt'/.test(BLOCK), "emit('cap-halt') is back — a pricing-red would be logged as a cap-halt again");
  // the category rides along, so a reader that keys on either field reads the
  // same answer — the two never disagree again
  assert.match(BLOCK, /category: authored\.stop/);
});

test('both arms of the emit are real stops the money predicate can actually return', () => {
  // Not a fixture: `capStop` is THE one money-ceiling predicate (src/text.js), and
  // the runner's guard must admit exactly what it can produce. A third stop added
  // upstream and not admitted here would print nothing and log nothing.
  const produced = new Set([
    capStop({ ceilingUsd: 1, knownUsd: 1, spendComplete: true }),      // money gone
    capStop({ ceilingUsd: 1, knownUsd: 0.5, spendComplete: false }),   // meter blind
  ]);
  assert.deepEqual([...produced].sort(), ['cap-halt', 'pricing-red'],
    'capStop no longer produces the two stops this block was written against');
  for (const stop of produced) {
    assert.ok(BLOCK.includes(`'${stop}'`), `the runner does not admit the stop capStop returns: ${stop}`);
  }
  // and nothing outside that set is admitted — a null (no ceiling, or under it)
  // must never reach the block
  assert.equal(capStop({ ceilingUsd: null, knownUsd: 99, spendComplete: false }), null);
  assert.equal(capStop({ ceilingUsd: 1, knownUsd: 0.5, spendComplete: true }), null);
});

test('the spine MEANING splits by stop — a blind meter is never spelled as a spent wallet', () => {
  // The console already printed two different readings; the spine printed one.
  // A `type:'pricing-red'` event carrying "not under cap" contradicts its own type
  // and sends the operator to raise a number when the repair is to bind a priced
  // provider. One `meaning`, computed from the stop, used by both surfaces.
  assert.ok(BLOCK, 'the governance block moved');
  assert.match(BLOCK, /const meaning = authored\.stop === 'cap-halt'/,
    'the meaning must be derived from the stop, not hardcoded');
  assert.match(BLOCK, /meaning,/, 'and the spine must carry that derived reading, not its own copy');
  assert.ok(!/meaning: 'not under cap/.test(BLOCK),
    'the spine re-spells the cap-halt meaning inline — two hand-written answers is two instruments');
  // the cap-halt arm keeps the shipped vocabulary verbatim, exactly as ralph.js
  // and planrun.js spell it, so the two populations stay comparable
  const shipped = readFileSync(join(REPO, 'src/ralph.js'), 'utf8');
  const phrase = /meaning: ('not under cap[^']*')/.exec(shipped)?.[1];
  assert.ok(phrase, 'ralph.js no longer spells a cap-halt meaning — the shared vocabulary moved');
  assert.ok(BLOCK.includes(phrase), `the cap-halt arm drifted from the shipped spelling ${phrase}`);
});
