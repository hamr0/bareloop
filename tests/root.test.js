// Layer R — the root (within-run ratchet). Unit criteria from the design record
// (docs/plans/2026-07-19-layer-r-design.md): shell-authored, fixation-gated,
// escalating summary→verbatim, comparison-only normalization, caps announced.
// The detector reads the arbiter's own books (write-sets + kept-failure lines);
// the worker authors nothing and gains no verb.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, normalizeRedLine } from '../src/root.js';

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
