// The carry note says how each earlier try ended. The outcome must come from the check result the engine knew when the try
// settled, never from whether the NEXT prompt happens to carry the retry marker (a replan or a new step carries none).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCarryStore } from '../src/carrystore.js';
import { runScripted } from './carry-scenario.js';

const base = mkdtempSync(join(tmpdir(), 'carry-outcome-'));
after(() => rmSync(base, { recursive: true, force: true }));
const RETRY = "base\n\nPrevious attempt failed this step's checks:\nFAILED x";
const mk = (name) => createCarryStore({ workdir: join(base, name), emit: () => {}, strikeLimit: 2 });
/** one ask as planrun drives it: begin, (worker), end, then the check result lands */
const ask = async (s, { phase, iteration, prompt, result, bounded, rounds = 6 }) => {
  const note = await s.beginAsk({ phase, iteration, prompt });
  s.endAsk({ bounded, iteration, rounds });
  s.settleAsk(result ?? "unknown");
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
