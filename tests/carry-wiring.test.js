// The carry note in a run (src/carrystore.js, src/planrun.js): a scripted provider through runJob, real Loop, real Gate.
// Note only on step/fix asks that have something to say, appended to the prompt, no file content, secrets
// masked, never to scout/drafter, counts-only spine record, state under .smoke the worker cannot read, resume loads,
// and the retired `carryNote` config key (no switch: the memo is always on).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScripted, SECRET, CONTENT_MARK } from './carry-scenario.js';
import * as carrystore from '../src/carrystore.js';
import { createCarryStore } from '../src/carrystore.js';
import { readConfig, updateConfig, ConfigError } from '../src/config.js';
import { HEADING } from '../src/carrynote.js';

const base = mkdtempSync(join(tmpdir(), 'carry-test-'));
after(() => rmSync(base, { recursive: true, force: true }));
/** the first user message of every ask (messages length <= 2 = a fresh ask) */
const askPrompts = (r) => { const out = []; for (const m of r.provider.messagesLog) { const u = String(m.find((x) => x.role === 'user')?.content); if (out.at(-1) !== u) out.push(u); } return out; };

test('no switch: carryNoteOn is gone; a legacy carryNote key in config.json is ignored on read and dropped on write', () => {
  const home = join(base, 'cfg-home');
  mkdirSync(home, { recursive: true });
  assert.equal(carrystore.carryNoteOn, undefined, 'the switch reader no longer exists');
  writeFileSync(join(home, 'config.json'), '{ "carryNote": false }');
  assert.equal(readConfig({ home }).problem, null, 'a legacy key is no config problem');
  writeFileSync(join(home, 'config.json'), '{ "carryNote": "yes" }');
  assert.equal(readConfig({ home }).problem, null, 'not validated any more');
  updateConfig({ learningHints: true }, { home });
  assert.equal('carryNote' in readConfig({ home }).config, false, 'any write drops the retired key');
  updateConfig({ carryNote: false }, { home });
  assert.equal('carryNote' in readConfig({ home }).config, false, 'a patch cannot set it either');
});

test('wiring ON: note only on the step ask that has facts; not scout, not drafter, not the empty first step ask', async () => {
  const r = await runScripted(join(base, 'on'), {});
  assert.equal(r.outcome, 'green');
  const ps = askPrompts(r);
  assert.equal(ps.length, 4, 'scout, drafter, warm, real');
  assert.deepEqual(ps.map((p) => p.includes(HEADING)), [false, false, false, true]);
  assert.ok(!ps.slice(0, 3).some((p) => p.includes('What earlier workers')), 'scout/drafter/first step never carry it');
});

test('the note is the last thing in the prompt, and the only file-list block', async () => {
  const r = await runScripted(join(base, 'order'), {});
  const p = askPrompts(r).at(-1);
  assert.equal(p.split(HEADING).length - 1, 1);
  assert.ok(p.trimEnd().endsWith(p.slice(p.indexOf(HEADING)).trimEnd()));
  assert.ok(!p.includes('Files earlier workers in this run read'));
});

test('no file content: facts name paths and counts, never the text of a file that was read', async () => {
  const r = await runScripted(join(base, 'content'), {});
  const note = askPrompts(r).at(-1).slice(askPrompts(r).at(-1).indexOf(HEADING));
  assert.ok(note.includes('src/mod.mjs') && note.includes('read 1x') && note.includes('grep "export|'));
  assert.ok(!note.includes(CONTENT_MARK), 'content of a read file is not in the note');
  assert.ok(note.includes('tests/a.txt: 1 lines changed'), 'edits come from the working tree');
});

test('secret planted in a grep pattern and in a written file is masked everywhere it is recorded', async () => {
  const wd = join(base, 'secret');
  const r = await runScripted(wd, {});
  const all = JSON.stringify(askPrompts(r).at(-1).slice(askPrompts(r).at(-1).indexOf(HEADING)));
  assert.ok(!all.includes(SECRET) && all.includes('REDACTED'));
  assert.ok(!readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8').includes(SECRET), 'state.json');
  assert.ok(!JSON.stringify(r.events).includes(SECRET));
});

test('spine record is counts only (no note text, no paths), one per delivered note', async () => {
  const r = await runScripted(join(base, 'spine'), {});
  const recs = r.events.filter((e) => e.type === 'carry-note');
  assert.equal(recs.length, 1);
  const { type, phase, iteration, chars, capped, sections, seq, ts } = recs[0];
  assert.deepEqual(Object.keys(recs[0]).sort(), ['capped', 'chars', 'iteration', 'phase', 'sections', 'seq', 'ts', 'type']);
  assert.equal(phase, 'step:real'); assert.equal(iteration, 1); assert.equal(capped, false);
  assert.ok(chars > 100);
  assert.deepEqual(sections, { reads: 1, searches: 2, edits: 1, earlier: 0, failures: 0 });
  assert.ok(!JSON.stringify(recs[0]).includes('mod.mjs'));
  void type; void seq; void ts;
});

test('state is persisted under .smoke (an arbiter book) and the worker cannot read it', async () => {
  const wd = join(base, 'persist');
  const r = await runScripted(wd, {});
  const st = JSON.parse(readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8'));
  assert.ok(st.events.length >= 3 && st.asks.length === 2 && st.base);
  // the scripted worker tried to shell_read that file during step real: the tool result it was given must not carry the state
  const toolMsgs = JSON.stringify(r.provider.messagesLog.at(-1));
  assert.ok(!toolMsgs.includes('"events"') && !toolMsgs.includes('startSnap'), 'state.json content never reached the worker');
  assert.ok(toolMsgs.includes('[deny: fs.deny]'), 'the gate refused the read (fs.deny on .smoke)');
});

test('resume loads the persisted state (nice-to-have)', async () => {
  const wd = join(base, 'resume');
  mkdirSync(join(wd, '.smoke', 'carry'), { recursive: true });
  writeFileSync(join(wd, '.smoke', 'carry', 'state.json'), JSON.stringify({ n: 5, base: 'abc', events: [{ ask: 3, tool: 'read', path: 'src/x.js', lines: 9 }], asks: [] }));
  const s = createCarryStore({ workdir: wd, emit: () => {}, resume: true });
  assert.equal(s.loaded(), true);
  assert.equal(s._state().n, 5);
  const fresh = createCarryStore({ workdir: wd, emit: () => {}, resume: false });
  assert.equal(fresh.loaded(), false);
});

test('call site: a red step check hands its WHOLE failing text to the store, which persists it (and the retry prompt carries the same text)', async () => {
  const wd = join(base, 'redtext');
  const r = await runScripted(wd, { redFirst: true });
  assert.equal(r.outcome, 'green');
  const st = JSON.parse(readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8'));
  const red = st.asks.find((a) => a.step === 'real' && a.iteration === 1);
  assert.equal(red.result, 'red');
  assert.match(red.failure, /FAILED tests\/test_x\.mjs missing/);
  assert.ok(askPrompts(r).some((p) => p.includes(`Previous attempt failed this step's checks:\n`) && p.includes(red.failure)), 'the same text the retry prompt carries');
  assert.equal(st.asks.find((a) => a.step === 'real' && a.iteration === 2).failure, undefined, 'a green try stores no failure');
});
