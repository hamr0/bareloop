// The carry note says how each earlier try ended. The outcome must come from the check result the engine knew when the try
// settled, never from whether the NEXT prompt happens to carry the retry marker (a replan or a new step carries none).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCarryStore } from '../src/carrystore.js';
import { CAP } from '../src/carrynote.js';
import { runScripted } from './carry-scenario.js';

const base = mkdtempSync(join(tmpdir(), 'carry-outcome-'));
after(() => rmSync(base, { recursive: true, force: true }));
const RETRY = "base\n\nPrevious attempt failed this step's checks:\nFAILED x";
const mk = (name) => createCarryStore({ workdir: join(base, name), emit: () => {}, strikeLimit: 2 });
/** one ask as planrun drives it: begin, (worker), end, then the check result lands */
const ask = async (s, { phase, iteration, prompt, result, bounded, rounds = 6, failure }) => {
  const note = await s.beginAsk({ phase, iteration, prompt });
  s.endAsk({ bounded, iteration, rounds });
  s.settleAsk(result ?? "unknown", failure);
  return note;
};

test('step try 1 red, try 2 red (strike 2), replan, new step: the note never says an earlier try passed', async () => {
  const s = mk('replan');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red' });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: 'red' });
  const note = await ask(s, { phase: 'step:b', iteration: 1, prompt: 'a replanned step, no retry marker', result: 'green' });
  assert.match(note, /Last try: step "a", try 2[^\n]*Its check failed\./, note);
  assert.ok(!/Its check passed/.test(note), `an earlier red try was reported as passed:\n${note}`);
  assert.match(note, /step "a" try 1: Its check failed\./);
});

test('a green step followed by the next step: its check passed', async () => {
  const s = mk('green');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'green' });
  const note = await ask(s, { phase: 'step:b', iteration: 1, prompt: 'next step', result: 'green' });
  assert.match(note, /Last try: step "a", try 1[^\n]*Its check passed\./, note);
});

test('a bounded try keeps its bound words; a try whose check never ran is not called passed', async () => {
  const s = mk('bounded');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red', bounded: { iteration: 1, cause: 'rounds' }, rounds: 6 });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: undefined });
  const note = await ask(s, { phase: 'step:b', iteration: 1, prompt: 'plain', result: 'green' });
  assert.match(note, /step "a" try 1: Ran out of calls \(6 of 6\)\./, note);
  assert.ok(!/Its check passed/.test(note), `a try with no check result was reported as passed:\n${note}`);
  assert.match(note, /Last try: step "a", try 2[^\n]*No check result was recorded/, note);
});

test('call site: the engine hands the check result to the store, so state.json records it per ask', async () => {
  const wd = join(base, 'wired');
  const r = await runScripted(wd, { carryNote: true });
  assert.equal(r.outcome, 'green');
  const st = JSON.parse(readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8'));
  const real = st.asks.find((a) => a.step === 'real');
  assert.equal(real.result, 'green');
});

test('a bounded red try says BOTH how it ended and its check result; bounded with no check says so', async () => {
  const s = mk('bothends');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red', bounded: { iteration: 1, cause: 'rounds' }, rounds: 24 });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: 'green', bounded: { iteration: 2, cause: 'wall' } });
  await ask(s, { phase: 'step:a', iteration: 3, prompt: RETRY, result: undefined, bounded: { iteration: 3, cause: 'rounds' }, rounds: 5 });
  const note = await ask(s, { phase: 'step:b', iteration: 1, prompt: 'x', result: 'green' });
  assert.match(note, /step "a" try 1: Ran out of calls \(24 of 24\)\. Its check failed\./, note);
  assert.match(note, /step "a" try 2: Stopped by the wall clock\. Its check passed\./, note);
  assert.match(note, /Last try: step "a", try 3[^\n]*Ran out of calls \(5 of 5\)\. Check not run\./, note);
});

const FAIL = (n) => `FAILED tests/test_x.mjs: expected ${n} lines, got 0\n  at assertion line ${n}\n  see output above`;
test('earlier failures: whole text, folded when similar (a number changes), newest failure left out', async () => {
  const s = mk('failures');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red', failure: FAIL(11) });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: 'red', failure: FAIL(12) });
  await ask(s, { phase: 'step:a', iteration: 3, prompt: RETRY, result: 'red', failure: 'totally different wall: lint complains about unused imports in module core' });
  await ask(s, { phase: 'step:a', iteration: 4, prompt: RETRY, result: 'red', failure: 'NEWEST-FAILURE-TEXT zebra quokka' });
  const note = await ask(s, { phase: 'step:a', iteration: 5, prompt: RETRY, result: 'red' });
  const at = note.indexOf('Earlier failures (folded):');
  assert.ok(at > note.indexOf('Earlier tries (folded):'), note);
  const sec = note.slice(at);
  assert.ok(sec.includes('- step "a" try 2 · 1 similar:\n    FAILED tests/test_x.mjs: expected 12 lines, got 0\n      at assertion line 12\n      see output above'), sec);
  assert.ok(!sec.includes('expected 11'), 'folded member shown only through its group');
  assert.ok(sec.includes('- step "a" try 3:\n    totally different wall'), sec);
  assert.ok(!note.includes('NEWEST-FAILURE-TEXT'), 'the newest failure is the prompt\'s job, not the note\'s');
  void CAP;
});

test('a long failure text is kept whole (no 8-line clip) and masked', async () => {
  const s = mk('whole');
  const long = Array.from({ length: 30 }, (_, i) => `line ${i} AKIAABCDEFGHIJKLMNOP`).join('\n');
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red', failure: long });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: 'red', failure: 'second' });
  const note = await ask(s, { phase: 'step:a', iteration: 3, prompt: RETRY, result: 'red', failure: 'third' });
  assert.ok(note.includes('    line 29 '), 'line 30 present');
  assert.ok(!note.includes('AKIAABCDEFGHIJKLMNOP') && note.includes('REDACTED'));
  assert.ok(!JSON.stringify(s._state()).includes('AKIAABCDEFGHIJKLMNOP'), 'stored masked');
});

test('state.json keeps failures across a resume; a v0.52.0 state (no failure text) loads and renders without throwing', async () => {
  const wd = join(base, 'resumed');
  const s = createCarryStore({ workdir: wd, emit: () => {}, strikeLimit: 2 });
  await ask(s, { phase: 'step:a', iteration: 1, prompt: 'base', result: 'red', failure: 'kept across resume' });
  await ask(s, { phase: 'step:a', iteration: 2, prompt: RETRY, result: 'red', failure: 'newer one' });
  const r = createCarryStore({ workdir: wd, emit: () => {}, strikeLimit: 2, resume: true });
  assert.equal(r.loaded(), true);
  const note = await ask(r, { phase: 'step:a', iteration: 3, prompt: RETRY, result: 'red' });
  assert.ok(note.includes('    kept across resume'), note);
  const old = join(base, 'old052');
  mkdirSync(join(old, '.smoke', 'carry'), { recursive: true });
  writeFileSync(join(old, '.smoke', 'carry', 'state.json'), JSON.stringify({ n: 2, base: null, events: [], asks: [{ n: 1, kind: 'step', step: 'a', iteration: 1, startSnap: {}, result: 'red', red: true, changed: [] }, { n: 2, kind: 'step', step: 'a', iteration: 2, startSnap: {}, result: 'red', red: true, changed: [] }] }));
  const o = createCarryStore({ workdir: old, emit: () => {}, strikeLimit: 2, resume: true });
  const n2 = await ask(o, { phase: 'step:a', iteration: 3, prompt: RETRY, result: 'red' });
  assert.ok(n2.includes('Last try: step "a", try 2') && !n2.includes('Earlier failures'), n2);
});
