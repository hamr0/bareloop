// The carry note in a run (src/carrystore.js, src/planrun.js): a scripted provider through runJob, real Loop, real Gate.
// Note only on step/fix asks that have something to say, appended after the handoff note, no file content, secrets
// masked, never to scout/drafter, counts-only spine record, state under .smoke the worker cannot read, resume loads,
// and the `carryNote` switch in config.json (absent = on; OFF leaves the worker prompt untouched).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScripted, SECRET, CONTENT_MARK } from './carry-scenario.js';
import { carryNoteOn, createCarryStore } from '../src/carrystore.js';
import { readConfig, updateConfig, ConfigError } from '../src/config.js';
import { HEADING } from '../src/carrynote.js';
import { HANDOFF_HEADING } from '../src/handoff.js';

const base = mkdtempSync(join(tmpdir(), 'carry-test-'));
after(() => rmSync(base, { recursive: true, force: true }));
/** the first user message of every ask (messages length <= 2 = a fresh ask) */
const askPrompts = (r) => { const out = []; for (const m of r.provider.messagesLog) { const u = String(m.find((x) => x.role === 'user')?.content); if (out.at(-1) !== u) out.push(u); } return out; };

test('switch: carryNote in config.json, absent = ON, explicit false = OFF, true = ON, only true/false accepted, an unreadable config reads OFF', () => {
  const home = join(base, 'cfg-home');
  mkdirSync(home, { recursive: true });
  assert.equal(carryNoteOn(home), true, 'absent means on');
  updateConfig({ carryNote: false }, { home });
  assert.equal(carryNoteOn(home), false, 'explicit false means off');
  updateConfig({ carryNote: true }, { home });
  assert.equal(carryNoteOn(home), true);
  assert.equal(readConfig({ home }).config.carryNote, true);
  assert.throws(() => updateConfig({ carryNote: 'yes' }, { home }), ConfigError);
  updateConfig({ carryNote: null }, { home });
  assert.equal('carryNote' in readConfig({ home }).config, false, 'null removes it');
  assert.equal(carryNoteOn(home), true, 'back to the default: on');
  writeFileSync(join(home, 'config.json'), '{ "carryNote": "yes" }');
  assert.equal(readConfig({ home }).problem !== null, true, 'a non-boolean in the file is a config problem');
  assert.equal(carryNoteOn(home), false, 'an invalid config reads OFF');
  writeFileSync(join(home, 'config.json'), '{ nope');
  assert.equal(carryNoteOn(home), false, 'an unreadable config reads OFF');
});

test('wiring ON: note only on the step ask that has facts; not scout, not drafter, not the empty first step ask', async () => {
  const r = await runScripted(join(base, 'on'), { carryNote: true });
  assert.equal(r.outcome, 'green');
  const ps = askPrompts(r);
  assert.equal(ps.length, 4, 'scout, drafter, warm, real');
  assert.deepEqual(ps.map((p) => p.includes(HEADING)), [false, false, false, true]);
  assert.ok(!ps.slice(0, 3).some((p) => p.includes('What earlier workers')), 'scout/drafter/first step never carry it');
});

test('note comes AFTER the handoff note, and is the last thing in the prompt', async () => {
  const r = await runScripted(join(base, 'order'), { carryNote: true });
  const p = askPrompts(r).at(-1);
  assert.ok(p.indexOf(HANDOFF_HEADING) >= 0 && p.indexOf(HANDOFF_HEADING) < p.indexOf(HEADING));
  assert.ok(p.trimEnd().endsWith(p.slice(p.indexOf(HEADING)).trimEnd()));
});

test('no file content: facts name paths and counts, never the text of a file that was read', async () => {
  const r = await runScripted(join(base, 'content'), { carryNote: true });
  const note = askPrompts(r).at(-1).slice(askPrompts(r).at(-1).indexOf(HEADING));
  assert.ok(note.includes('src/mod.mjs') && note.includes('read 1x') && note.includes('grep "export|'));
  assert.ok(!note.includes(CONTENT_MARK), 'content of a read file is not in the note');
  assert.ok(note.includes('tests/a.txt: 1 lines changed'), 'edits come from the working tree');
});

test('secret planted in a grep pattern and in a written file is masked everywhere it is recorded', async () => {
  const wd = join(base, 'secret');
  const r = await runScripted(wd, { carryNote: true });
  const all = JSON.stringify(askPrompts(r).at(-1).slice(askPrompts(r).at(-1).indexOf(HEADING)));
  assert.ok(!all.includes(SECRET) && all.includes('REDACTED'));
  assert.ok(!readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8').includes(SECRET), 'state.json');
  assert.ok(!JSON.stringify(r.events).includes(SECRET));
});

test('spine record is counts only (no note text, no paths), one per delivered note', async () => {
  const r = await runScripted(join(base, 'spine'), { carryNote: true });
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
  const r = await runScripted(wd, { carryNote: true });
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

test('wiring OFF: no note, no record, no state dir; the prompts are exactly the ON prompts without the note', async () => {
  const wd = join(base, 'off');
  const r = await runScripted(wd, { carryNote: false });
  assert.equal(r.outcome, 'green');
  assert.ok(!JSON.stringify(r.provider.messagesLog).includes('What earlier workers in this run did'));
  assert.equal(r.events.filter((e) => /carry/.test(e.type)).length, 0);
  assert.equal(existsSync(join(wd, '.smoke', 'carry')), false);
  const norm = (run, name) => askPrompts(run).map((p) => p.split(join(base, name)).join('<wd>'));
  const dflt = await runScripted(join(base, 'dflt'), {});
  assert.deepEqual(norm(dflt, 'dflt'), norm(r, 'off'), 'the library default (no option) is off, and the same');
  const on = await runScripted(join(base, 'off-vs-on'), { carryNote: true });
  const stripped = norm(on, 'off-vs-on').map((p) => (p.includes(HEADING) ? p.slice(0, p.indexOf(HEADING)).replace(/\n\n$/, '') : p));
  assert.deepEqual(stripped, norm(r, 'off'), 'ON differs from OFF by the appended note and nothing else');
});


test('call site: a red step check hands its WHOLE failing text to the store, which persists it (and the retry prompt carries the same text)', async () => {
  const wd = join(base, 'redtext');
  const r = await runScripted(wd, { carryNote: true, redFirst: true });
  assert.equal(r.outcome, 'green');
  const st = JSON.parse(readFileSync(join(wd, '.smoke', 'carry', 'state.json'), 'utf8'));
  const red = st.asks.find((a) => a.step === 'real' && a.iteration === 1);
  assert.equal(red.result, 'red');
  assert.match(red.failure, /FAILED tests\/test_x\.mjs missing/);
  assert.ok(askPrompts(r).some((p) => p.includes(`Previous attempt failed this step's checks:\n`) && p.includes(red.failure)), 'the same text the retry prompt carries');
  assert.equal(st.asks.find((a) => a.step === 'real' && a.iteration === 2).failure, undefined, 'a green try stores no failure');
});
