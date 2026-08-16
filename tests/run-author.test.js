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

/** the governance block: from its guard to the emit that closes it. Both ends are
 * INDENT-ANCHORED, because the whole flow now sits inside one `try {`: a pattern
 * closing on a bare `\n}\n` swallowed everything down to the catch's own brace and
 * the guard silently became a guard over the rest of the file — every assertion
 * below still passing while reading a block it was never written against. */
const BLOCK = /\n {2}if \(authored\.stop === 'cap-halt' \|\| authored\.stop === 'pricing-red'\) \{[\s\S]*?\n {2}\}\n/.exec(SRC)?.[0];
/** the crash catch: the whole handler, from its brace to its brace */
const CATCH = /\n\} catch \(err\) \{[\s\S]*?\n\}\n/.exec(SRC)?.[0];

test('the governance block is still BOUNDED — the guard reads a block, not the rest of the file', () => {
  // The instrument's own pre-flight. `BLOCK` is a lazy regex over source, and the
  // failure mode is not that it stops matching (that fails loud) but that it
  // matches TOO MUCH: every `assert.ok(BLOCK.includes(...))` below is satisfied by
  // a bigger haystack, so the guard passes while checking nothing it names. This is
  // the blind-instrument class, on the test side.
  assert.ok(BLOCK, 'the governance block moved — this guard no longer reads the code it guards');
  assert.ok(!/catch \(/.test(BLOCK), 'BLOCK ran past the governance stop into the crash handler');
  assert.ok(!/author-end/.test(BLOCK), 'BLOCK ran past the governance stop into the flow below it');
});

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

// ── A CRASH LEAVES A BODY ────────────────────────────────────────────────────
//
// The defect these lock out was watched live: a real run's spine
// (`author-<runid>.jsonl`) held exactly ONE line, `author-start`, and nothing
// else. The paid pipeline threw, the error went to the operator's terminal as an
// unhandled rejection, and the record of the run stopped mid-sentence — which is
// byte-for-byte indistinguishable from a run still in flight.
//
// Read from SOURCE for the same reason the block above is: the span only reached
// by paying for a scout and a model call cannot be driven from a test, and the
// alternative to pinning it here is not pinning it at all. What CAN be extracted
// was — `crashRecord` lives in `scripts/author-readout.mjs` and is exercised on
// real thrown values in tests/authoring.test.js.

test('the paid span is inside a catch, and only the paid span is', () => {
  assert.ok(CATCH, 'the crash handler is gone — a throw in the paid span leaves no spine body again');
  // the try opens AFTER the spine exists and after author-start is on it. Opening
  // it earlier would put the argv/config `die()` paths inside a handler whose
  // whole job is to write to a file that does not exist yet.
  const start = SRC.indexOf("emit('author-start'");
  const tryAt = SRC.indexOf('\ntry {\n');
  assert.ok(start !== -1 && tryAt !== -1, 'the try/author-start pair moved');
  assert.ok(start < tryAt, 'the try opens BEFORE author-start — a crash would have no spine to land in');
  // and the paid call itself is inside it
  assert.ok(SRC.indexOf('authorCloseForJob({') > tryAt, 'the paid call sits outside the catch');
});

test('the catch writes a BODY: the crash and the end, each said once', () => {
  assert.ok(CATCH, 'the crash handler is gone');
  // the crash record, built by the ONE helper — a hand-rolled object here would be
  // a second scrub boundary, and an unredacted stack is the worst string in this
  // system to write to a file that outlives the run
  assert.match(CATCH, /emit\('author-crash', crashRecord\(err\)\)/,
    'the crash body must go through crashRecord — an inline object bypasses the redactor and the bound');
  // and the run's END, under an outcome no other arm uses
  assert.match(CATCH, /emit\('author-end', \{ outcome: 'crashed' \}\)/,
    "a spine with no author-end reads as a run still in flight — that IS the defect");
  // the detail is said ONCE. Re-spelling the error onto author-end is two
  // instruments over one fact, which this file has already paid for once.
  assert.ok(!/outcome: 'crashed',/.test(CATCH), 'author-end carries a second copy of the crash detail');
});

test('the catch does not swallow, does not retry, and does not exit()', () => {
  assert.ok(CATCH, 'the crash handler is gone');
  // the operator's whole error, on stderr, and FIRST — before the two writes that
  // could themselves fail
  assert.match(CATCH, /console\.error\(err\)/, 'the raw error must still reach the terminal in full');
  const printed = CATCH.indexOf('console.error(err)');
  const emitted = CATCH.indexOf("emit('author-crash'");
  assert.ok(printed !== -1 && emitted !== -1 && printed < emitted,
    'the error is written down before it is printed — a full disk would then swallow it');
  // NOTHING is re-run. A catch that re-enters the pipeline spends real money on a
  // failure nobody has read yet.
  assert.ok(!/await /.test(CATCH), 'the catch awaits something — a crash handler must not retry');
  assert.ok(!/authorCloseForJob|prepareSigning/.test(CATCH), 'the catch re-enters the pipeline');
  // F71 — process.exit() can discard queued stdout, and this handler runs with a
  // readout already queued behind it (the leak scan and the spine line)
  assert.ok(!/process\.exit\(/.test(CATCH), 'process.exit() in the crash path can discard the readout it just wrote (F71)');
  assert.match(CATCH, /process\.exitCode = 4/, 'the crash needs its own exit code, distinct from 1/2/3');
  // and the record survives its own writer failing: an appendFileSync that throws
  // must not take the printed error down with it (F70 — a guard carrying the
  // failure mode it guards)
  assert.match(CATCH, /catch \(spineErr\)/, 'the spine write is unguarded — a failing emit would crash the crash handler');
});

test('exit code 4 is the CRASH, and nothing else in this runner claims it', () => {
  // 1 = a refusal or a failed gate, 2 = operator/config, 3 = a leak. Sharing a
  // code would file a crash as one of those — a bug read as a result.
  const codes = [...SRC.matchAll(/process\.exit(?:Code = |\()(\d)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(codes)].sort(), ['1', '2', '3', '4'], 'the runner\'s exit vocabulary changed');
  assert.equal(codes.filter((c) => c === '4').length, 1, 'a second site claims exit 4 — the crash code is no longer distinct');
});
