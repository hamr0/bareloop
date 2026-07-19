// Layer R — the root (within-run ratchet). Unit criteria from the design record
// (docs/plans/2026-07-19-layer-r-design.md): shell-authored, fixation-gated,
// escalating summary→verbatim, comparison-only normalization, caps announced.
// The detector reads the arbiter's own books (write-sets + kept-failure lines);
// the worker authors nothing and gains no verb.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, normalizeRedLine } from '../src/root.js';
import { GAP_KEEP_TRIM_MARKER } from '../src/ralph.js';

const KEEP = '^✖ ';

// Real node --test spec-reporter shapes (POC 2026-07-19): every ✖ line carries
// a per-run duration stamp, so naive equality reads every attempt as "reds
// moved" and the detector never fires.
const GAP_A = '✖ multiplies (1.738615ms)\n✖ divides with remainder (0.338861ms)\nℹ fail 2';
const GAP_A2 = '✖ multiplies (2.913001ms)\n✖ divides with remainder (0.15ms)\nℹ fail 2'; // same reds, new stamps
const GAP_MOVED = '✖ divides with remainder (0.2ms)\nℹ fail 1'; // one test fixed

test('normalizeRedLine strips duration stamps only', () => {
  assert.equal(normalizeRedLine('✖ multiplies (1.738615ms)'), '✖ multiplies');
  assert.equal(normalizeRedLine('✖ multiplies (2.9s)'), '✖ multiplies');
  // parenthetical that is NOT a duration is content — untouched
  assert.equal(normalizeRedLine('✖ handles (a, b) input'), '✖ handles (a, b) input');
});

test('attempts 1 and 2 never inject (no prior to compare)', () => {
  const root = createRoot({ gapKeep: KEEP });
  assert.equal(root.observe({ iteration: 1, writes: [] }), null);
  root.noteWrite('/r/src/x.js', 'edit one');
  assert.equal(root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] }), null);
});

test('same file + same reds (durations differ) → summary injection at attempt 3', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'edit one');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'edit two');
  const inj = root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  assert.ok(inj, 'fixation detected across the duration stamps');
  assert.equal(inj.stage, 'summary');
  assert.match(inj.note, /x\.js/, 'the summary names the repeated file');
  assert.match(inj.note, /did not change/i);
  assert.ok(!inj.note.includes('edit two'), 'summary stage carries NO verbatim content');
  assert.equal(inj.event.mode, 'reds+writes');
});

test('persisting fixation escalates to verbatim with the teed content', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'first failed edit');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'second failed edit');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'third failed edit');
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  assert.equal(inj.stage, 'verbatim');
  assert.match(inj.note, /third failed edit/, 'verbatim carries the model\'s own last failed content');
  assert.match(inj.note, /STRUCTURALLY DIFFERENT/i);
});

test('reds moved → episode closes, no injection, streak resets', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] }); // summary fired
  root.noteWrite('/r/src/x.js', 'c');
  const inj = root.observe({ iteration: 4, gap: GAP_MOVED, writes: ['/r/src/x.js'] });
  assert.equal(inj, null, 'movement is progress — the ratchet stays silent');
});

test('different file + same reds → no fixation', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/y.js', 'b');
  assert.equal(root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js', '/r/src/y.js'] }), null);
});

test('no gapKeep → detector degrades to write-overlap alone, and SAYS so', () => {
  const root = createRoot({});
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: 'some red output', writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: 'other red output', writes: ['/r/src/x.js'] });
  assert.ok(inj, 'write-overlap alone can fire when no red-set exists');
  assert.equal(inj.event.mode, 'writes-only', 'the degraded mode is NAMED on the record');
});

test('verbatim content is capped per file with the trim ANNOUNCED (F28 discipline)', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'Z'.repeat(10_000));
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  assert.equal(inj.stage, 'verbatim');
  assert.ok(inj.note.length < 5_000, `verbatim block is bounded (got ${inj.note.length})`);
  assert.match(inj.note, /truncated/i, 'the trim is announced, never silent');
});

test('teed content for a path the audit never allowed is not surfaced (denied writes never landed)', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'landed');
  root.noteWrite('/r/outside/evil.js', 'denied by the gate');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'landed again');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'landed a third time');
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  assert.equal(inj.stage, 'verbatim');
  assert.ok(!inj.note.includes('denied by the gate'), 'un-landed content stays out');
});

test('verbatim content passes through the injected redactor (secrets never ride the note)', () => {
  const root = createRoot({ gapKeep: KEEP, redact: (s) => s.replace(/ghp_\w+/g, '[REDACTED]') });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'const token = "ghp_abc123";');
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  assert.ok(inj.note.includes('[REDACTED]'), 'redactor ran over the verbatim content');
  assert.ok(!inj.note.includes('ghp_abc123'));
});

test('event payloads carry counts and paths, never content (append-only spine law)', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'SECRET-ISH CONTENT');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'SECRET-ISH CONTENT 2');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'SECRET-ISH CONTENT 3');
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  const flat = JSON.stringify(inj.event);
  assert.ok(!flat.includes('SECRET-ISH'), 'the spine event never carries content');
  assert.ok(Array.isArray(inj.event.paths) && inj.event.paths.includes('/r/src/x.js'));
  assert.equal(typeof inj.event.streak, 'number');
});

test('a NEW episode after progress starts back at summary — the streak truly resets', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] }); // episode 1: summary
  root.noteWrite('/r/src/x.js', 'c');
  root.observe({ iteration: 4, gap: GAP_MOVED, writes: ['/r/src/x.js'] }); // progress — episode closes
  root.noteWrite('/r/src/x.js', 'd');
  const inj = root.observe({ iteration: 5, gap: GAP_MOVED, writes: ['/r/src/x.js'] }); // episode 2 opens
  assert.ok(inj, 'second episode detected');
  assert.equal(inj.stage, 'summary', 'a fresh episode starts at summary, never inherits the old streak');
  assert.equal(inj.event.streak, 1);
});

// Edge, pinned: a worker-crash gap (ralph's synthetic message) contains no
// kept-failure lines. Two in a row after same-file writes still fires the
// ratchet on write-overlap, ON TOP of the crash gap's own revert instruction —
// compatible, and deliberate. Post-Finding-2 it fires in the honest WRITES-ONLY
// mode (an empty kept-set is UNKNOWN, not a proven "reds unchanged"), never the
// strong reds+writes claim off a blind instrument. The fire-vs-silent contract
// is unchanged; only the mode label and wording tightened.
test('two consecutive crash-style gaps (no kept lines) + same file → ratchet fires (writes-only)', () => {
  const root = createRoot({ gapKeep: KEEP });
  const CRASH = 'Your edit CRASHED the test suite — it can no longer even load and judge (…).';
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: CRASH, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: CRASH, writes: ['/r/src/x.js'] });
  assert.ok(inj, 'repeated crash after repeated same-file writes is fixation');
  assert.equal(inj.stage, 'summary');
  assert.equal(inj.event.mode, 'writes-only', 'no kept lines → UNKNOWN reds → write-overlap decides, and the mode says so');
  assert.ok(!/did not change/i.test(inj.note), 'never the strong "unchanged" claim off an empty kept-set');
});

test('honest red then crash → red-sets differ → no fixation (the crash is new information)', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: 'Your edit CRASHED the test suite …', writes: ['/r/src/x.js'] });
  assert.equal(inj, null);
});

// ---- review fixes (2026-07-20) ----

// Finding 1: the tee stored content.slice(0, CAP) and redact() ran only later,
// over the already-truncated string. Every SECRET_PATTERN is a prefix+min-length
// shape (sk-…{16,}), so a secret straddling the cut loses the bytes that make it
// match — a partial token then rides UNREDACTED into the worker prompt. The scrub
// must happen at CAPTURE, before the truncation (repo doctrine: secrets scrub at
// capture). Uses a realistic prefix+min-length redactor, exactly the shape family.
test('Finding 1: a secret straddling the tee cap is redacted BEFORE truncation — no fragment rides the note', () => {
  const CAP = 2000; // TEE_CAP_BYTES (module-internal)
  const redact = (/** @type {string} */ s) => s.replace(/sk-[a-zA-Z0-9]{16,}/g, '[SK]');
  const root = createRoot({ gapKeep: KEEP, redact });
  const inWindow = 'sk-' + 'c'.repeat(30);              // fully inside the first CAP chars → must be masked
  const straddle = 'sk-' + 'b'.repeat(40);              // its 'sk-' sits before CAP, the token extends past it
  // NON-alnum filler is load-bearing: an alphanumeric filler would let the greedy
  // sk-…{16,} bridge inWindow→straddle into one match, masking the bug — the test
  // must be able to FAIL, so the two secrets stay independently matchable.
  const filler = ' '.repeat(CAP - 10 - inWindow.length); // places straddle's 'sk-' at offset CAP-10
  const content = inWindow + filler + straddle + ' TAIL';
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', content);
  const inj = root.observe({ iteration: 4, gap: GAP_A, writes: ['/r/src/x.js'] });
  assert.equal(inj.stage, 'verbatim');
  assert.ok(!inj.note.includes('sk-'), 'not even the truncated straddle fragment survives (redact ran on the full content first)');
  assert.ok(inj.note.includes('[SK]'), 'the in-window secret is masked');
});

// Finding 2: with gapKeep PRESENT but never matched, keptSet returned a real []
// each attempt; [] === [] read as "reds unchanged" and the note fired in the
// strong reds+writes mode ("the set of failing tests did not change at all") off
// a disconnected instrument. An empty judged kept-set is UNKNOWN, not zero — it
// must degrade to writes-only, the honest mode.
test('Finding 2: gapKeep present but never matched → UNKNOWN reds → writes-only, no "unchanged" claim', () => {
  const root = createRoot({ gapKeep: KEEP });
  const NOMATCH = 'build output line one\nbuild output line two'; // no ✖ lines: the pattern matches nothing
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: NOMATCH, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: NOMATCH, writes: ['/r/src/x.js'] });
  assert.ok(inj, 'write-overlap still fires the ratchet');
  assert.equal(inj.event.mode, 'writes-only', 'an empty judged kept-set is UNKNOWN, never a proven "reds unchanged"');
  assert.ok(!/did not change/i.test(inj.note), 'must not claim the failing set was unchanged off a blind instrument');
});

// Finding 2 boundary: a real red-set followed by an empty one is genuine CHANGE
// (the crash is new information), not fixation — the degrade must not turn an
// asymmetric kept-set into a false fire.
test('Finding 2 boundary: a real kept-set then an empty one reads as movement, never fixation', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });   // real reds
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: 'no failing lines here', writes: ['/r/src/x.js'] }); // empty reds
  assert.equal(inj, null, 'reds went from a real set to unknown — that is movement, not repetition');
});

// Finding 5: ralph caps kept lines at 50-line/8192-byte and appends a trim marker
// when failures beyond the window are dropped. keptSet re-derived the compared
// red-set from the already-capped text with no trim signal, so failures past the
// window could move while the visible (compared) lines stayed identical → a false
// "no progress". A trimmed window is UNRELIABLE: degrade to writes-only.
test('Finding 5: a trimmed gapKeep window makes the kept-set UNRELIABLE → writes-only, no "unchanged" claim', () => {
  const root = createRoot({ gapKeep: KEEP });
  const trimmed = (/** @type {string} */ visible) =>
    `${visible}\n── kept failures matching /^✖ / (50, 7 ${GAP_KEEP_TRIM_MARKER} 50-line/8192-byte cap) ──`;
  const g1 = trimmed('✖ a (1.0ms)\n✖ b (1.0ms)');
  const g2 = trimmed('✖ a (2.0ms)\n✖ b (2.0ms)'); // identical VISIBLE reds, new stamps — but the window was trimmed
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: g1, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: g2, writes: ['/r/src/x.js'] });
  assert.ok(inj, 'write-overlap still fires');
  assert.equal(inj.event.mode, 'writes-only', 'a trimmed window is not a trustworthy red-set');
  assert.ok(!/did not change/i.test(inj.note));
});

test('Finding 5 regression: an UNtrimmed gapKeep window keeps the strong reds+writes mode', () => {
  const root = createRoot({ gapKeep: KEEP });
  root.observe({ iteration: 1, writes: [] });
  root.noteWrite('/r/src/x.js', 'a');
  root.observe({ iteration: 2, gap: GAP_A, writes: ['/r/src/x.js'] });
  root.noteWrite('/r/src/x.js', 'b');
  const inj = root.observe({ iteration: 3, gap: GAP_A2, writes: ['/r/src/x.js'] });
  assert.equal(inj.event.mode, 'reds+writes', 'no trim marker → trustworthy red-set → strong mode preserved');
});
