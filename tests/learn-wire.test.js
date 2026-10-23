// Cross-run learnings, part 5: the wiring (ITEM33-BUILD.md rev 2, sections 6-8 and RULING 10).
// Real runs through the real engine (src/userrun.js `execute` via startRun) with the scripted provider; a scratch home
// everywhere, never ~/.config/bareloop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobSpecHash } from '../src/job.js';
import { startRun, answerDoor } from '../src/userrun.js';
import { runPlan } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { updateConfig, readConfig, ConfigError } from '../src/config.js';
import { learnAtRunEnd, hintsForRun, learningHintsOn, readLedger, writeLedger } from '../src/learnstore.js';
import { renderHints, emptyLedger, holdPending, HINT_HEADER, parseHintBlock } from '../src/learn.js';
import { parseSpineText } from '../src/legs.js';
import { readRunList } from '../src/runlist.js';
import { scriptedProvider, initPatientRepo } from './helpers.js';
import { tcall, makePatient, JOB, PLAN, collector, countRun, todos } from './planrun-fixtures.js';
import { loadRun } from './learn-fixtures.js';

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'l', GIT_AUTHOR_EMAIL: 'l@t', GIT_COMMITTER_NAME: 'l', GIT_COMMITTER_EMAIL: 'l@t' };
const git = (/** @type {string} */ cwd, /** @type {string[]} */ a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV }).trim();
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const TOOLS = ['read', 'grep', 'write', 'edit', 'recall', 'get'];
const LESSON = 'check "clean-run" failed in tests/test_x.mjs; fixed later in the same run.';
const scratch = (/** @type {any} */ t) => { const d = mkdtempSync(join(tmpdir(), 'bareloop-learnwire-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

/** the F46 shape: attempt 1 writes the file without the marker (the check reds), attempt 2 fixes it (the check greens) */
const script = (/** @type {string} */ wd) => [
  { text: 'scout notes' }, { text: PLAN(wd) },
  { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'not yet\n' })] }, { text: 'wrote a test' },
  { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — fixed\n' })] }, { text: 'fixed' },
];

/** one real run through the engine; returns what the person would see and where the spine is */
async function runOnce(/** @type {any} */ t, /** @type {string} */ home, /** @type {{provider?: any, ctx?: any}} */ o = {}) {
  const wd = makePatient(t);
  git(wd, ['add', '-A']);
  git(wd, ['commit', '-q', '-m', 'seed']);
  const seed = git(wd, ['rev-parse', 'HEAD']);
  const spec = JOB(wd, { tools: TOOLS });
  const provider = o.provider ?? scriptedProvider(script(wd));
  /** @type {string[]} */ const out = [];
  /** @type {string[]} */ const err = [];
  let threw = null;
  try {
    await startRun(spec, { workdir: wd, seed, spineName: 'learn-wire-bareloop', approve: jobSpecHash(spec), ...(o.ctx ?? {}), deps: { provider, env: {}, out: (/** @type {string} */ s) => out.push(s), err: (/** @type {string} */ s) => err.push(s), runlistHome: home } });
  } catch (/** @type {any} */ e) { threw = e; }
  const spine = spineOf(home);
  return { wd, spec, provider, out: out.join('\n'), err: err.join('\n'), threw, events: spine.events, runid: spine.runid, outcome: /^outcome\s+(\S+)/m.exec(out.join('\n'))?.[1] ?? null };
}
/** the spine the run listed in the (scratch) run list */
function spineOf(/** @type {string} */ home) {
  const row = readRunList({ home }).rows.at(-1);
  if (!row) return { events: [], runid: null };
  return { events: parseSpineText(readFileSync(row.spine, 'utf8')).records, runid: row.runid };
}

// ── no model, anywhere ───────────────────────────────────────────────────────────────────────────
/** the local files a module reaches by `import`, and the bare package names it imports */
function closure(/** @type {string} */ entry) {
  /** @type {Map<string, string[]>} */ const seen = new Map();
  const walk = (/** @type {string} */ f) => {
    if (seen.has(f)) return;
    const deps = [...readFileSync(f, 'utf8').matchAll(/^\s*import[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
    seen.set(f, deps);
    for (const d of deps) if (d.startsWith('.')) walk(resolve(dirname(f), d));
  };
  walk(entry);
  return { files: [...seen.keys()].map((f) => f.split('/').at(-1)), external: [...new Set([...seen.values()].flat().filter((d) => !d.startsWith('.') && !d.startsWith('node:')))] };
}
const FORBIDDEN = /^(providers|transport|planrun|run|userrun|ralph|authoring|authorflow|authorrun|authorjob|interviewrun|judged|cardauthor|pagemap|authorscout|thinking|modellist)\.js$/;

test('MUST-FAIL 2: no model call anywhere in learnings — the import closure reaches no provider, and a thrown fetch is never touched', async (t) => {
  for (const entry of ['learn.js', 'learnstore.js', 'stagewords.js']) {
    const c = closure(join(SRC, entry));
    assert.deepEqual(c.files.filter((f) => FORBIDDEN.test(f)), [], `${entry} must not reach a provider module`);
    assert.deepEqual(c.external, entry === 'stagewords.js' ? [] : ['bareguard'], `${entry}: the only package is bareguard's redact`);
  }
  // the detector itself can fail: a file that imports bare-agent shows up
  const bad = mkdtempSync(join(tmpdir(), 'closure-'));
  t.after(() => rmSync(bad, { recursive: true, force: true }));
  writeFileSync(join(bad, 'm.js'), "import { Loop } from 'bare-agent';\nimport './providers.js';\n");
  writeFileSync(join(bad, 'providers.js'), '\n');
  const c = closure(join(bad, 'm.js'));
  assert.deepEqual(c.external, ['bare-agent']);
  assert.ok(c.files.some((f) => FORBIDDEN.test(f)));
  // behaviourally: with every network door thrown shut, the tally, the setting read and the render still work
  const real = globalThis.fetch;
  let called = 0;
  globalThis.fetch = /** @type {any} */ (() => { called += 1; throw new Error('a learnings step must never call a model'); });
  t.after(() => { globalThis.fetch = real; });
  const home = scratch(t);
  const r = loadRun('mvk2e4uy');
  const res = learnAtRunEnd({ home, runid: 'mvk2e4uy', events: r.events, auditFiles: [], spec: { job: 'pulselog-panel-strict' }, specHash: 'h', workdir: r.workdir, trust: 'deterministic' });
  assert.equal(res.wrote, true);
  assert.equal(hintsForRun({ home, spec: { job: 'pulselog-panel-strict' }, specHash: 'h' }), null);
  assert.equal(called, 0);
});

// ── the setting ──────────────────────────────────────────────────────────────────────────────────
test('the ONE setting: learningHints in config.json, absent = OFF, only true/false accepted, an unreadable config reads OFF', (t) => {
  const home = scratch(t);
  assert.equal(learningHintsOn(home), false);
  updateConfig({ learningHints: true }, { home });
  assert.equal(learningHintsOn(home), true);
  assert.equal(readConfig({ home }).config.learningHints, true);
  updateConfig({ learningHints: false }, { home });
  assert.equal(learningHintsOn(home), false);
  assert.throws(() => updateConfig({ learningHints: 'yes' }, { home }), ConfigError);
  updateConfig({ learningHints: null }, { home });
  assert.equal('learningHints' in readConfig({ home }).config, false, 'null removes it: back to OFF');
  writeFileSync(join(home, 'config.json'), '{ nope');
  assert.equal(learningHintsOn(home), false);
});

// ── the engine: tally always, hints only when ON, planner only ──────────────────────────────────
test('the run-end call site: a real run through execute tallies its lesson into the ledger at $0 (setting OFF), and the verdict is untouched', async (t) => {
  const home = scratch(t);
  const r = await runOnce(t, home);
  assert.equal(r.threw, null, r.err);
  assert.equal(r.outcome, 'green');
  assert.equal(r.provider.calls.length, 6, 'the scripted run used exactly its six model calls: the learn step added none');
  const L = readLedger(home).ledger;
  assert.equal(L.rows.length, 1);
  assert.equal(L.rows[0].count, 1);
  assert.equal(L.rows[0].lesson, LESSON);
  assert.deepEqual(L.rows[0].runIds, [r.runid]);
  assert.equal(L.rows[0].sample.whatChanged?.files[0].path, 'tests/test_x.mjs', 'What changed comes from the run\'s own attempt-diff');
  assert.match(L.rows[0].sample.whatChanged?.files[0].diff ?? '', /-not yet\n\+ok — fixed/);
  assert.equal(r.events.some((e) => e.type === 'learnings'), false, 'OFF: the planner is handed nothing');
  assert.ok(!r.provider.calls.some((c) => c.includes(HINT_HEADER)));
  assert.equal(L.health[/** @type {string} */ (r.runid)].noise, null);
});

test('ON: the planner at the draft is handed the block; no worker is; the spine records it byte-for-byte; OFF still keeps counting', async (t) => {
  const home = scratch(t);
  await runOnce(t, home); // run 1 (OFF): the ledger now holds the lesson
  const before = readLedger(home).ledger;
  updateConfig({ learningHints: true }, { home });
  const r2 = await runOnce(t, home);
  assert.equal(r2.outcome, 'green');
  const rec = r2.events.filter((e) => e.type === 'learnings');
  assert.equal(rec.length, 1, 'recorded once, at the draft');
  assert.equal(rec[0].phase, 'draft');
  // byte check: the recorded text == a fresh render from the ledger as it stood at run start
  const ctx = { workflow: 'plan-patient', place: null, specHash: jobSpecHash(r2.spec), now: new Date() };
  assert.equal(rec[0].text, renderHints(before, ctx).text);
  assert.ok(rec[0].text.includes(LESSON));
  // who saw it: the planner prompt (call 1) only. Scout (0) and every step/fix prompt (2+) did not, nor any system prompt
  const calls = r2.provider.calls;
  assert.ok(calls[1].includes(rec[0].text), 'the planner got the exact recorded block');
  assert.ok(!calls[0].includes('Hints from earlier runs') && !calls[0].includes(LESSON), 'the scout did not');
  for (const c of calls.slice(2)) assert.ok(!c.includes('Hints from earlier runs') && !c.includes(LESSON), 'no step/fix worker saw it');
  for (const s of r2.provider.systems) assert.ok(!s.includes(LESSON) && !s.includes('Hints from earlier runs'));
  // the tally counted run 2 as well. This lesson has no error kind (kind `other`), and by the spec's rule such a card never matches
  // another, so run 2 is a SECOND row at count 1 rather than a second count on the first (see the report: an open question)
  assert.equal(readLedger(home).ledger.rows.length, 2);
  // switch it OFF: nothing recorded, nothing handed over, but the tally keeps counting
  updateConfig({ learningHints: false }, { home });
  const r3 = await runOnce(t, home);
  assert.equal(r3.events.some((e) => e.type === 'learnings'), false);
  assert.ok(!r3.provider.calls.some((c) => c.includes(LESSON)));
  assert.equal(readLedger(home).ledger.rows.length, 3, 'OFF still tallies');
});

test('a learn step that fails prints one WARNING and changes nothing about the run: same outcome, same calls, same spend line', async (t) => {
  const good = scratch(t);
  const ok = await runOnce(t, good);
  const bad = scratch(t);
  writeFileSync(join(bad, 'learn'), 'a FILE where the learn directory must go, so the ledger write throws');
  const r = await runOnce(t, bad);
  assert.equal(r.threw, null);
  assert.match(r.err, /WARNING: could not record this run's lessons in the learnings ledger/);
  assert.equal(r.outcome, ok.outcome);
  assert.equal(r.provider.calls.length, ok.provider.calls.length);
  const spent = (/** @type {string} */ s) => /^spent\s+(\$[\d.]+)/m.exec(s)?.[1];
  assert.equal(spent(r.out), spent(ok.out));
  assert.equal(readFileSync(join(bad, 'learn'), 'utf8').startsWith('a FILE'), true, 'and nothing was clobbered');
});

test('a real home is never touched: with no config home (an injected env and no home) the engine writes no ledger at all', async (t) => {
  const wd = makePatient(t);
  git(wd, ['add', '-A']);
  git(wd, ['commit', '-q', '-m', 'seed']);
  const seed = git(wd, ['rev-parse', 'HEAD']);
  const spec = JOB(wd, { tools: TOOLS });
  const fakeHome = scratch(t);
  const prev = process.env.HOME;
  process.env.HOME = fakeHome; // any default-home write would land here, where the test can see it
  t.after(() => { process.env.HOME = prev; });
  try {
    await startRun(spec, { workdir: wd, seed, spineName: 'learn-wire-bareloop', approve: jobSpecHash(spec), deps: { provider: scriptedProvider(script(wd)), env: {}, out: () => {}, err: () => {} } });
  } catch { /* the run's own outcome is not what this test reads */ }
  assert.equal(existsSync(join(fakeHome, '.config', 'bareloop', 'learn')), false);
});

// ── the planner only: draft + FIRST replan (runPlan level) ──────────────────────────────────────
const SENTINEL = 'SENTINEL-LEDGER-TEXT-7f3a';
const HINTS = { text: `${HINT_HEADER}\n1. [this job, seen 2 times] ${SENTINEL}`, ids: ['row-1'] };

/** drive runPlan with learnHints; returns the prompts split by the provider call that made them */
async function planWith(/** @type {any} */ t, /** @type {any[]} */ steps) {
  const wd = makePatient(t);
  const provider = scriptedProvider(steps(wd));
  const jv = validateJob(JOB(wd));
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 2, remainingUsd: () => 1.5, learnHints: HINTS });
  return { outcome, events, provider };
}

test('MUST-FAIL 1: no worker prompt holds ledger text; the planner holds it at the draft and the FIRST replan only', async (t) => {
  const { outcome, events, provider } = await planWith(t, (wd) => [
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' }, { text: 'still thinking' },       // plan A's step writes nothing twice -> replan
    { text: PLAN(wd, [{ id: 'write-test-2', action: 'Actually write tests/test_x.mjs now.', tools: ['write'], rounds: 6, target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }] }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] }, { text: 'done' },
  ]);
  assert.equal(outcome, 'green');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1);
  const holders = provider.calls.map((c, i) => [i, c.includes(SENTINEL)]).filter(([, h]) => h).map(([i]) => i);
  assert.deepEqual(holders, [1, 4], 'only the draft prompt (call 1) and the replan draft prompt (call 4)');
  assert.ok(provider.calls[1].startsWith('DRAFT-PLAN') && provider.calls[4].startsWith('DRAFT-PLAN'), 'both are the planner');
  for (const s of provider.systems) assert.ok(!s.includes(SENTINEL), 'no system prompt either');
  assert.deepEqual(events.filter((e) => e.type === 'learnings').map((e) => e.phase), ['draft', 'replan']);
  assert.equal(events.find((e) => e.type === 'learnings').text, HINTS.text);
});

test('a SECOND replan (the arbiter\'s variance grant) is handed nothing', async (t) => {
  const wd = makePatientCounting(t);
  const step = (/** @type {string} */ id) => JSON.stringify({ schema: 'plan-v1', steps: [{ id, action: 'Remove TODO markers from src/mod.mjs.', tools: ['write'], rounds: 6, target: 'src/mod.mjs', exit: [{ type: 'tree-changed', scope: 'src/**' }, { type: 'check-passes', name: 'typecheck' }] }] });
  const attempt = (/** @type {string} */ id, /** @type {string} */ body) => [
    { text: `attempt ${id}`, toolCalls: [tcall(id, 'shell_write', { path: join(wd, 'src', 'mod.mjs'), content: body })] },
    { text: `attempt ${id} done` },
  ];
  const { events, provider } = await countRun(wd, [
    { text: 'scout' }, { text: step('plan-a') }, ...attempt('1', todos(24)), ...attempt('2', todos(15)),
    { text: step('plan-b') }, ...attempt('3', todos(10)),
    { text: step('plan-c') }, ...attempt('4', todos(0)),
  ], { 2: 0.5, 3: 0.16 }, { over: { learnHints: HINTS } });
  assert.equal(events.filter((e) => e.type === 'replan').length, 2, 'the fixture really produced two replans');
  assert.deepEqual(events.filter((e) => e.type === 'learnings').map((e) => e.phase), ['draft', 'replan'], 'the draft and the FIRST replan; not the second');
  const planner = provider.calls.map((c, i) => [i, c.startsWith('DRAFT-PLAN'), c.includes(SENTINEL)]).filter(([, isPlanner]) => isPlanner);
  assert.equal(planner.length, 3);
  assert.deepEqual(planner.map(([, , has]) => has), [true, true, false]);
  assert.equal(provider.calls.filter((c) => c.includes(SENTINEL)).length, 2);
});

function makePatientCounting(/** @type {any} */ t) {
  const wd = mkdtempSync(join(tmpdir(), 'learn-count-'));
  t.after(() => rmSync(wd, { recursive: true, force: true }));
  initPatientRepo(wd);
  mkdirSync(join(wd, 'src'));
  writeFileSync(join(wd, 'src', 'mod.mjs'), todos(30));
  writeFileSync(join(wd, 'count.mjs'), `import { readFileSync } from 'node:fs';
const n = (readFileSync(new URL('./src/mod.mjs', import.meta.url), 'utf8').match(/TODO/g) ?? []).length;
if (n === 0) { console.log('clean'); } else {
  console.log('red: tsc --strict reports ' + n + ' error(s) in src/mod.mjs');
  process.exitCode = 1;
}
`);
  return wd;
}

test('a prompt without hints is byte-identical to what it was (the planner prompt only grows when there is a block)', async (t) => {
  const { planPrompt } = await import('../src/planrun.js');
  const job = /** @type {any} */ (validateJob(JOB(makePatient(t))).job);
  const a = planPrompt(job, 'scout', null, 40, null, null, null);
  assert.equal(planPrompt(job, 'scout', null, 40, null, null, null, null, {}, null, false, null), a);
  assert.equal(planPrompt(job, 'scout', null, 40, null, null, null, null, {}, null, false, ''), a);
  const withHints = planPrompt(job, 'scout', null, 40, null, null, null, null, {}, null, false, HINTS.text);
  assert.ok(withHints.includes(HINTS.text));
  assert.equal(withHints.replace(`\n${HINTS.text}\n`, ''), a, 'and the block is the only difference');
});

// ── Audit: read-only view of what the planner got ───────────────────────────────────────────────
test('the Audit detail carries exactly what the spine recorded the planner was handed (and the page shows it with nothing editable)', async (t) => {
  const { getRunDetail } = await import('../src/panel/server.js');
  const home = scratch(t);
  await runOnce(t, home);
  updateConfig({ learningHints: true }, { home });
  const r = await runOnce(t, home);
  const rec = r.events.find((e) => e.type === 'learnings');
  assert.ok(rec);
  const detail = getRunDetail(/** @type {string} */ (r.runid), { home });
  assert.deepEqual(detail.learnings, [{ phase: 'draft', text: rec.text, chars: rec.text.length, ids: rec.ids, hints: parseHintBlock(rec.text) }]);
  assert.equal(detail.learnings[0].hints.length, rec.ids.length, 'the hint fields number what the planner was handed');
  // a run that was handed nothing shows nothing
  updateConfig({ learningHints: false }, { home });
  const r3 = await runOnce(t, home);
  assert.deepEqual(getRunDetail(/** @type {string} */ (r3.runid), { home }).learnings, []);
  const html = readFileSync(join(SRC, 'panel', 'index.html'), 'utf8');
  const block = html.slice(html.indexOf('id="audit-learnings"'), html.indexOf('id="audit-groups"'));
  assert.match(html.slice(html.indexOf('function renderAuditLearnings(')), /Read-only\. /);
  // the ONE <button> is the section's own fold header (the same box as the other Audit sections); nothing else is clickable or editable
  assert.equal((block.match(/<button/g) ?? []).length, 1, 'exactly one button: the section fold');
  assert.match(block, /<button type="button" id="audit-learnings-summary" class="btn audit-part-toggle"/);
  assert.doesNotMatch(block, /<input|<textarea|contenteditable/, 'no edit, no Reject, no per-hint button');
});

// ── the Accept door releases a held rubric run ───────────────────────────────────────────────────
test('MUST-FAIL 3 at the call site: a held (rubric) run counts only when the human Accept answers its door; a pause or a repeat does not', async (t) => {
  const home = scratch(t);
  const r = await runOnce(t, home, { ctx: { reviewDoor: true } });
  assert.equal(r.outcome, 'green');
  assert.ok(r.events.some((e) => e.type === 'review-door'), 'the run ended at its review door');
  // what a RUBRIC run leaves behind: its cards held in pending, nothing counted. (The deterministic run above counted its
  // own; replace that with the hold a softgreen run would have written, from the very same cards.)
  const counted = readLedger(home).ledger;
  const cards = counted.rows.map((x) => x.sample);
  assert.equal(cards.length, 1);
  const hold = holdPending(emptyLedger(), { runid: /** @type {string} */ (r.runid), cards, workflow: 'plan-patient', place: null, specHash: jobSpecHash(r.spec), at: cards[0].at }, new Date(cards[0].at));
  writeLedger(hold, home);
  assert.equal(readLedger(home).ledger.rows.length, 0);
  assert.equal(readLedger(home).ledger.pending.length, 1);
  /** @type {string[]} */ const dbg = [];
  const answer = (/** @type {string} */ decide) => answerDoor(/** @type {string} */ (r.runid), { decide }, {
    spec: r.spec, workdir: r.wd, seed: git(r.wd, ['rev-parse', 'HEAD']), spineName: 'learn-wire-bareloop', approve: jobSpecHash(r.spec),
    deps: { provider: scriptedProvider([{ text: 'never called' }]), env: {}, out: (/** @type {string} */ x) => dbg.push(x), err: (/** @type {string} */ x) => dbg.push(x), runlistHome: home },
  }).catch((/** @type {any} */ e) => e);
  await answer('pause');
  assert.equal(readLedger(home).ledger.rows.length, 0, 'a pause releases nothing');
  assert.equal(readLedger(home).ledger.pending.length, 1);
  const res = await answer('accept');
  assert.equal(res, 0, dbg.join('\n'));
  const after = readLedger(home).ledger;
  assert.equal(after.pending.length, 0, 'the Accept released the hold');
  assert.equal(after.rows.length, 1);
  assert.equal(after.rows[0].trust, 'rubric');
  assert.equal(after.rows[0].count, 1);
  await answer('accept');
  assert.equal(readLedger(home).ledger.rows[0].count, 1, 'a repeat Accept counts nothing more');
});


// ── the call sites exist where the spec names them ────────────────────────────────────────────────
test('source tripwires: ONE run-end call in execute right after the settle (own try/catch, rubric derived from the quarantine rule); the door Accept releases; hints go to runJob', () => {
  const src = readFileSync(join(SRC, 'userrun.js'), 'utf8');
  const settle = src.indexOf("type: 'settled', by: runid, spentUsd: fin.usd");
  const call = src.indexOf('learnAtRunEnd({', settle);
  assert.ok(settle > 0 && call > settle && call - settle < 2500, 'the learn step sits right after the settle');
  assert.equal(src.match(/learnAtRunEnd\(\{/g)?.length, 1, 'one call site: execute is shared by all three doors');
  assert.match(src.slice(call - 400, call + 700), /try \{[\s\S]*learnAtRunEnd[\s\S]*\} catch/, 'in its own try/catch');
  assert.match(src.slice(call, call + 600), /trust: quarantinesCredit\(spec\.verdictType\) \? 'rubric' : 'deterministic'/);
  assert.match(src, /releaseRun\(\{ home: cfgHome/);
  assert.match(src, /\.\.\.\(learnHints === null \? \{\} : \{ learnHints \}\)/);
  assert.equal(readFileSync(join(SRC, 'panel', 'server.js'), 'utf8').includes('learnAtRunEnd'), false, 'no second call site in src/panel/');
});
