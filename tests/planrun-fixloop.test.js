// Layer 2 module 4b — the plan executor — deny streaks and bounded notes, the outer close-fix loop, trend, bridges, softgreen and judge wiring, provider deadlines.
// Split from the former tests/planrun.test.js (hamr 2026-10-11) for parallel runs; tests moved
// verbatim. Shared fixtures: tests/planrun-fixtures.js. Original header: integration-grade — real
// bare-agent Loop, real Gate, real spawned checks and closes, scripted provider (the one legitimate seam).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPlan, planPrompt, boundedNote, BOUND_REASON_MAX } from '../src/planrun.js';
import { validateJob } from '../src/job.js';
import { scriptedProvider, scriptedNativeFactory } from './helpers.js';
import { scanSecrets } from '../src/validate.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
// the ONE trim announcement this repo spells (src/kinds.js) — the bounded-attempt
// note reuses it rather than inventing a second way to say "this text was cut"
import { GAP_TRIM_MARKER } from '../src/kinds.js';
import { tcall, makePatient, JOB, PLAN, collector, go, fakeClock, dyingAt, strictCloseOverCheck, afterFixLoop, countingClose } from './planrun-fixtures.js';

test('CLOSE-FIX-LOOP casualty: a transport death inside the outer fix loop rides out under its OWN name, and the metered rounds that DID complete survive', async (t) => {
  const wd = makePatient(t);
  // Same shape as the fix-loop test: the close is stricter than the check, so
  // the step greens and the close reds once, opening the fix loop. Call 4 is the
  // fix worker's first round, and it dies on the wire.
  writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('ok') && t.includes('import')) process.exit(0);
console.log('FAILED close: the test never imports the module'); process.exit(1);\n`);
  const provider = dyingAt([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },            // the step greens; the close then reds
  ], 4);
  const { outcome, events } = await go(wd, provider);

  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened — the casualty is inside it, not before it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red', 'ralph files the casualty correctly ON THE SPINE');

  // The fix loop restores the casualty's own name exactly as the step loop does
  // (planrun.js:1140-1147): ralph catches the middle throw and returns the flat
  // 'escalated', and the caller re-reads `lastEscalation.category`. Anything
  // else is the F11 two-instruments-disagreeing shape — and run.js's F44 branch
  // keys spendComplete on the OUTCOME, so a laundered label reports an
  // exact-looking total for a call that never billed back. (Was a pinned
  // doctrine gap; fixed with hamr's explicit go, 2026-07-30.)
  assert.equal(outcome, 'provider-red',
    'a transport casualty in the fix loop is a casualty — never laundered into a bare escalated');
  assert.equal(outcome, esc.category,
    'the returned outcome and the spine escalation name the SAME category (F11)');

  // whatever the label, the money record must survive the casualty: the rounds
  // that completed were really spent and really billed (F12 per-round metering)
  const rounds = events.filter((e) => e.type === 'worker-round');
  assert.ok(rounds.length >= 4, `scout + draft + the two step rounds stay on the spine, got ${rounds.length}`);
  assert.ok(rounds.some((r) => r.phase === 'scout') && rounds.some((r) => r.phase === 'plan'),
    'the pre-casualty phases keep their attribution — a casualty never erases the spend that preceded it');
  assert.ok(rounds.every((r) => 'costUsd' in r), 'every surviving round still carries its cost field (F6)');
});


// ── a DENY STREAK ends the ATTEMPT, never the RUN ───────────────────────────
//
// Run u-msn227nq: the count stage told the worker "8 match(es)" and no address,
// so it went looking for the arbiter's own books — .smoke, .litectx,
// gate-audit.jsonl. The fence denied all three, exactly as designed. Then
// bare-agent's BA-11 deny-spin guard returned `denied:shell_read`, this router
// filed it as terminal `gate-red`, and a converging run died with $1.77 and 21
// minutes left on the wall.
//
// The guard is right and stays: a spinning worker must not burn the wallet. What
// was wrong is the CATEGORY. A denial streak is the same shape as `max_turns` —
// the attempt ran, produced real work, and was CUT SHORT by a governance bound.
// So it routes the same way: bounded attempt, judged, gap forward, loop continues
// under unchanged caps. The fence held; nothing escalates because governance
// worked. `halt:` (money) and `truncated:` (transport) are untouched — their own
// tests above and below pin them.
//
// The fixture drives the REAL mechanism end to end: a real Gate with the real
// deny list, real out-of-scope tool calls, the real Loop's own streak counter.
// Nothing hands the router a hand-made error string.
const DENY_PLAN = (wd) => JSON.stringify({
  schema: 'plan-v1',
  steps: [{
    id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
    tools: ['read', 'write'], rounds: 6, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }],
});

/** the three arbiter books the live worker probed, in the order it probed them */
const ARBITER_BOOKS = (wd) => ['.smoke', '.litectx', 'gate-audit.jsonl'].map((p) => join(wd, p));


test('DENY STREAK (loop path): a worker the fence stops three times has its ATTEMPT bounded — the run judges the partial work and carries on, it does not die gate-red (u-msn227nq)', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: DENY_PLAN(wd) },
    // attempt 1: a REAL write that lands (so there is partial work to judge) but
    // does not satisfy the check, then the three denied probes that trip BA-11
    {
      toolCalls: [
        tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'no assertion yet\n' }),
        ...ARBITER_BOOKS(wd).map((p, i) => tcall(`d${i}`, 'shell_read', { path: p })),
      ],
    },
    // attempt 2: fed the check's gap, it writes the real thing
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  const { outcome, events } = await go(wd, provider);

  assert.equal(outcome, 'green', 'the deny streak cost an attempt, not the run');
  const bounded = events.filter((e) => e.type === 'attempt-bounded');
  assert.equal(bounded.length, 1, 'exactly one attempt was bounded');
  assert.match(bounded[0].reason ?? '', /^denied:/, 'the record names WHICH bound cut the attempt — a deny streak is not a round bound');
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'gate-red').length, 0,
    'the fence doing its job is not an escalation: governance worked, so nothing is decision-ready');
  // the run really did keep going: two graded attempts, not one
  assert.ok(events.filter((e) => e.type === 'exit-eval').length >= 2,
    'the bounded attempt was JUDGED and a second attempt followed');
  assert.equal(existsSync(join(wd, 'tests', 'test_x.mjs')), true);

  // and the denials were REAL — the fence recorded them, the fixture did not fake them
  const audit = readFileSync(join(wd, 'gate-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const denies = audit.filter((r) => r.decision === 'deny' && r.action?.type === 'read');
  assert.ok(denies.length >= 3, `the gate really denied the arbiter-book probes (${denies.length} deny records)`);
});


test('DENY STREAK (native path): the clipipe surface routes its own denial terminal the same way — one bound attempt, run continues', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  const nativeProvider = scriptedNativeFactory([
    { turns: [{ text: 'scout' }] },
    { turns: [{ text: DENY_PLAN(wd) }] },
    {
      turns: [
        { tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'no assertion yet\n' } },
        ...ARBITER_BOOKS(wd).map((p) => ({ tool: 'shell_read', args: { path: p } })),
      ],
    },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }, { text: 'now wrote it' }] },
  ]);
  const { events, emit } = collector();
  const outcome = await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, remainingUsd: () => 1.5 });

  assert.equal(outcome, 'green', 'the native deny terminal is a bounded attempt too — one surface, one doctrine');
  const bounded = events.filter((e) => e.type === 'attempt-bounded' && e.native === true);
  assert.equal(bounded.length, 1);
  assert.match(bounded[0].reason ?? '', /^denied:/);
  assert.equal(events.filter((e) => e.type === 'escalation' && e.category === 'gate-red').length, 0);
});


// ── the bounded-attempt NOTE names the bound that actually fired ────────────
//
// A deny streak and a round-bound cutoff both used to set the same bare
// `attemptBounded = roundIteration`, so the next attempt's prompt rendered ONE
// sentence for both: "CUT OFF after N tool rounds. Reading is bounded; writing
// is not." After a deny streak that is false twice over — wrong cause AND a
// count that never ran out — and it aims the worker at the READ BUDGET when the
// thing that stopped it was the FENCE. The reason was recorded on the spine and
// nowhere the worker could see it.
//
// The note is MECHANICAL: it quotes the recorded `denied:<tool>` terminal and
// says which bound fired. It invents nothing — no streak count (bare-agent's
// return carries none), no path (same), no advice about scope it cannot verify.
/** the step prompts, in order — the two the worker actually bought for this step */
const stepPromptsOf = (calls) => calls.filter((c) => c.includes('asserting the module exports'));

/** the frozen round-bound sentence, respelled ONCE here so a drift is a red */
const ROUND_BOUND_NOTE = (n) => `Your previous attempt was CUT OFF after ${n} tool rounds. `
  + 'Reading is bounded; writing is not. Form a hypothesis EARLY and make the change.';


test('boundedNote unit: a DENY-streak bound quotes the recorded terminal; a ROUND bound keeps the frozen sentence byte-identical', () => {
  const denied = boundedNote({ iteration: 1, cause: 'denied', reason: 'denied:shell_read' }, 6);
  assert.match(denied, /denied:shell_read/, 'the worker is told what the gate actually recorded');
  assert.ok(!denied.includes('CUT OFF after'), 'never the round-bound wording — the rounds did not run out');
  assert.ok(!denied.includes('Reading is bounded'), 'and never the read-budget aim: the fence stopped it, not the budget');

  assert.equal(boundedNote({ iteration: 1, cause: 'rounds', reason: null }, 6), ROUND_BOUND_NOTE(6),
    'the round-bound case is unchanged, to the byte');
  assert.equal(boundedNote({ iteration: 1, cause: 'wall', reason: null }, 6), ROUND_BOUND_NOTE(6),
    'and so is every other non-denial bound');
  assert.equal(boundedNote(undefined, 6), null, 'an unbounded attempt renders nothing');
});


test('boundedNote unit: an over-long recorded reason is TRIMMED and the trim ANNOUNCES itself (the one marker, not a second spelling)', () => {
  const long = `denied:${'x'.repeat(BOUND_REASON_MAX * 2)}`;
  const note = boundedNote({ iteration: 1, cause: 'denied', reason: long }, 6);
  assert.ok(!note.includes(long), 'the raw over-long reason never reaches the prompt whole');
  assert.ok(note.includes(GAP_TRIM_MARKER), `a silent trim is the blind-instrument class: ${note.slice(-160)}`);
  assert.match(note, /denied:xxx/, 'what IS shown is the recorded reason, from its front');
});


test('DENY STREAK (loop path): the NEXT attempt is told the FENCE cut it — the recorded terminal, not a false round-bound count', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: DENY_PLAN(wd) },
    {
      toolCalls: [
        tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'no assertion yet\n' }),
        ...ARBITER_BOOKS(wd).map((p, i) => tcall(`d${i}`, 'shell_read', { path: p })),
      ],
    },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  await go(wd, provider);

  const steps = stepPromptsOf(provider.calls);
  assert.ok(steps.length >= 2, 'a second attempt was bought — that is the prompt under test');
  const next = steps[1];
  assert.match(next, /denied:shell_read/, 'the worker is handed the bound that actually fired');
  assert.ok(!next.includes('CUT OFF after 6 tool rounds'),
    'the false round-bound claim is gone: the attempt was cut at the fence with rounds still unspent');
  assert.ok(!next.includes('Reading is bounded'), 'and it is no longer mis-aimed at the read budget');
});


test('DENY STREAK (native path): the clipipe surface hands its worker the same recorded terminal — one doctrine, both surfaces', async (t) => {
  const wd = makePatient(t);
  const jv = validateJob(JOB(wd, { provider: 'clipipe-subscription' }));
  /** @type {string[]} */
  const prompts = [];
  const inner = scriptedNativeFactory([
    { turns: [{ text: 'scout' }] },
    { turns: [{ text: DENY_PLAN(wd) }] },
    {
      turns: [
        { tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'no assertion yet\n' } },
        ...ARBITER_BOOKS(wd).map((p) => ({ tool: 'shell_read', args: { path: p } })),
      ],
    },
    { turns: [{ tool: 'shell_write', args: { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' } }, { text: 'now wrote it' }] },
  ]);
  const nativeProvider = (opts) => {
    const p = inner(opts);
    const gen = p.generate.bind(p);
    return { ...p, generate: async (messages, tools) => { prompts.push(String(messages?.at?.(-1)?.content ?? '')); return gen(messages, tools); } };
  };
  const { emit } = collector();
  await runPlan(jv.job, { workdir: wd, nativeProvider, emit, capRuns: 3, remainingUsd: () => 1.5 });

  const steps = stepPromptsOf(prompts);
  assert.ok(steps.length >= 2, 'the native run bought a second attempt');
  assert.match(steps[1], /denied:shell_read/);
  assert.ok(!steps[1].includes('CUT OFF after 6 tool rounds'));
});


test('ROUND BOUND unchanged: an attempt that really did spend its rounds still gets the frozen sentence, to the byte', async (t) => {
  const wd = makePatient(t);
  const onePlan = JSON.stringify({
    schema: 'plan-v1',
    steps: [{
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['read', 'write'], rounds: 1, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }],
  });
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: onePlan },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'no assertion yet\n' })] },
    { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok — asserts x\n' })] },
    { text: 'wrote it' },
  ]);
  const { events } = await go(wd, provider);
  assert.ok(events.some((e) => e.type === 'attempt-bounded' && e.reason === undefined),
    'this attempt was cut by the ROUND bound — no denial reason on the record');
  const steps = stepPromptsOf(provider.calls);
  assert.ok(steps.length >= 2, 'a second attempt followed the round-bounded one');
  // EQUALITY on the block, not `includes`: the prompt is assembled by joining blocks
  // on a blank line, so the note is one whole block and nothing may be bolted onto
  // either end of it. A substring test passed a deliberately mutated note (a prefix
  // slipped straight through), which is a guard that cannot fail — the thing this
  // test exists to prevent. The `trim` is for the SEPARATOR only: the preceding gap
  // block ends in its own newline, so the join leaves the note with a leading blank
  // line. Whitespace at the seam is the renderer's business; the sentence is not.
  assert.ok(steps[1].split('\n\n').map((b) => b.trim()).includes(ROUND_BOUND_NOTE(1)),
    `the frozen wording is untouched, whole and unadorned: ${steps[1].slice(-300)}`);
});


test('CLOSE-FIX-LOOP money halt: a fix loop that cap-halts on a DRAINED wallet returns cap-halt, never escalated — a money cut is never a capability read (F45, MED-4)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                 // the step greens; the close then reds
    { text: 'fix attempt' },              // the fix worker's first round — priced above the drained wallet
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  // The drain is targeted at the RUN'S OWN STATE (the fix loop has opened), never
  // by counting calls on the injected wallet — a call-count trigger measures "how
  // many times has remainingUsd been read", which silently retargets whenever the
  // number of reads changes.
  let fixOpen = false;
  const emit2 = (/** @type {string} */ type, /** @type {any} */ data = {}) => {
    if (type === 'fix-loop') fixOpen = true;
    return emit(type, data);
  };
  const outcome = await runPlan(jv.job, {
    workdir: wd, provider, emit: emit2, capRuns: 3,
    remainingUsd: () => (fixOpen ? 0.0001 : 1.5),
  });
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened — the halt is inside it, not before it');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ralph emits the money-gate halt as cap-halt (its ONE category for both halts)');
  assert.equal(outcome, 'cap-halt',
    'a drained wallet in the fix loop is the resume-to-cap checkpoint, not "the fix failed" — the step loop already splits this exact pair');
});


test('CLOSE-FIX-LOOP exhaustion CONTROL: attempts spent WITH money left stays escalated — the designed "close still red" terminal (MED-4 must not swallow it)', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },                 // the step greens; the close then reds
    { text: 'fix attempt — writes nothing' }, // sticks: every fix attempt leaves the close red
  ]);
  const { events, emit } = collector();
  const jv = validateJob(JOB(wd));
  const outcome = await runPlan(jv.job, { workdir: wd, provider, emit, capRuns: 2, remainingUsd: () => 1.5 });
  assert.ok(events.some((e) => e.type === 'fix-loop'), 'the fix loop opened');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'cap-halt', 'ralph names attempt-exhaustion cap-halt too — the SAME category, which is why the wallet is the split');
  assert.equal(outcome, 'escalated',
    'attempts spent with money on the table is a capability terminal, and it must keep riding out as escalated');
});


/** a close whose RED OUTPUT tracks the tree (a real suite's does), so two
 * consecutive grades can legitimately differ. Still stricter than the `clean-run`
 * check, which is what opens the fix loop at all. @param {string} wd */
const byteReportingClose = (wd) => writeFileSync(join(wd, 'close.mjs'), `import { existsSync, readFileSync } from 'node:fs';
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
if (t.includes('import')) process.exit(0);
console.log(\`FAILED close: \${t.length} bytes, still no import\`); process.exit(1);\n`);


test('W-2: the wall past the outer close STOPS the fix loop on the verdict already minted — one close post-steps, zero fix rounds, no re-grade of an unchanged tree', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-at-outer-close',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
        { text: 'wrote it' },
      ][n - 1] ?? { text: 'a fix attempt that must never be bought' };
      if (n === 4) clk.advance(700_000); // the step greened, and the clock is now spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  assert.equal(outcome, 'wall-halt', 'time ran out — a governance stop, never "the fix failed"');
  const inFix = afterFixLoop(events);
  assert.equal(inFix.filter((e) => e.type === 'close-verdict').length, 0,
    'ZERO closes ran inside the fix loop: the only post-steps grade is the outer close, and it is the one the run stops on');
  assert.equal(events.filter((e) => e.type === 'outer-close').length, 1, 'exactly one close ran after the steps');
  assert.equal(events.filter((e) => e.type === 'worker-round' && e.phase === 'fix').length, 0,
    'not a single fix-worker round was bought past the deadline');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.match(esc.detail, /needs_revision/, 'the detail states the verdict that STANDS — the grade is kept, never re-derived');
  assert.match(esc.detail, /stage "verdict"/, 'and which stage rendered it');
  // The denominator is GONE, deliberately (v1.46 §4): `capRuns` retired as this
  // loop's governor, so quoting "0 of 3" would state a bound that no longer decides
  // anything. What is spent is the fact; there is no longer a number it is "of".
  assert.match(esc.detail, /after 0 fix iteration/, 'and how much of the loop was actually spent');
  assert.doesNotMatch(esc.detail, /of \d+ fix iteration/, 'never a denominator that no longer governs');
  assert.match(esc.detail, /trend: unknown/, 'no stage reported a comparable number twice, and the honest reading says so rather than guessing a direction');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'lever one: more time');
  assert.match(esc.options.join(' | '), /revise the goal/, 'lever two: a different goal — the trend is what tells the human which');
  assert.match(esc.options.join(' | '), /abandon/, 'lever three');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'never a socket to debug');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level TIME record carries the clock\'s own numbers');
  assert.equal(wh.cutMidCall, false, 'read BETWEEN iterations, not inside a call (F64 is the other reading)');
  assert.equal(wh.phase, 'fix');
  assert.equal(wh.trend, 'unknown', 'the trend rides as a FIELD, not only as prose');
  assert.equal(wh.iterationsUsed, 0);
  assert.equal(wh.verdict, 'needs_revision');
  assert.equal(wh.requestedMs, 600_000);
});


test('W-2 CONTROL: with time still on the clock the fix loop iterates exactly as before — the check must cost the healthy run nothing', async (t) => {
  const wd = makePatient(t);
  strictCloseOverCheck(wd);
  const clk = fakeClock(); // never advanced: the wall is set and never reached
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok but no module use\n' })] },
    { text: 'wrote it' },
    { text: 'fix attempt — writes nothing, so the close stays red' },
  ]);
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 2 });

  assert.equal(outcome, 'escalated', 'attempts spent with time and money left is the designed capability terminal');
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 2,
    'both fix iterations ran and both were graded — the wall check fired zero times');
  assert.equal(events.filter((e) => e.type === 'worker-round' && e.phase === 'fix').length, 2, 'both fix workers were bought');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no time record on a run that never ran out of time');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'cap-halt');
});


/**
 * The trend fixtures. IDENTICAL in every respect but one: what the single fix
 * attempt writes, and therefore whether the close it triggers reports the same
 * bytes as the grade before it. Same close, same plan, same clock, same call
 * positions — so a difference in the trend can only come from the gaps.
 *
 * Both closes below are deliberately NUMBERLESS to the trend instrument (no line
 * is marked `red`), which is the case the byte comparison exists for: it is the
 * FALLBACK inside `unknown`, never a verdict of its own.
 * @param {string} fixContent what the fix worker writes on its one attempt
 * @param {(wd: string) => void} [close] the close to install (default: byte-reporting)
 */
const trendRun = async (t, fixContent, close = byteReportingClose) => {
  const wd = makePatient(t);
  close(wd);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-after-one-fix',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
        { text: 'wrote it' },                                                                    // step greens; outer close reds → G0
        { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: fixContent })] },
        { text: 'fix attempt done' },                                                            // …and the wall passes HERE
      ][n - 1] ?? { text: 'never bought' };
      if (n === 6) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  return go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
};


test('W-2 UNIFIED (a): a wall halt whose close reported NUMBERS reads the per-stage trend — converging, where the byte instrument could only ever have said "it changed"', async (t) => {
  // The unification's whole point. The retired `gapTrend` compared two strings: it
  // could say the output moved, never which WAY. Here the same stop reads the close's
  // own falling count (2 → 1) and hands the human the lever that follows from a
  // direction, on the same evidence the money halt one branch over reads.
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-after-one-converging-fix',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A\n' })] },
        { text: 'wrote it' },                                                                  // outer close: 2 missing
        { toolCalls: [tcall('t2', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A B\n' })] },
        { text: 'fix attempt done' },                                                          // fix close: 1 missing
      ][n - 1] ?? { text: 'never bought' };
      if (n === 6) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'converging', 'the verdict stage fell — a DIRECTION, which no byte comparison can produce');
  assert.equal(wh.motion, null, 'motion is the fallback, and a fallback beside a real number is a second opinion nobody asked for');
  assert.equal(wh.iterationsUsed, 1);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  // F85: the series opens at 3, not at 2. The PRECHECK is first-red-wins and reds on
  // `clean-run` here, so it never reaches `verdict` at all — the stage's real seed is
  // the one the check PREFLIGHT rendered, and the run trend is now fed it. Pinned by
  // the precheck assertion below rather than asserted in prose: without it this
  // expectation could be updated to whatever the code happens to print.
  assert.equal(events.find((e) => e.type === 'close-precheck').stage, 'clean-run',
    'the precheck redded at an EARLIER stage, which is why `verdict` had no baseline before the preflight');
  assert.match(esc.detail, /verdict 3 → 2 → 1/, 'the series it judged is shown, from the seed on, so a human can check the instrument');
  assert.match(esc.detail, /top up|maxWallMs/i, 'converging work is what more allowance finishes');
});


test('W-2 UNIFIED: the wall reads the RUN\'s trend, not the fix loop\'s — the grade that existed BEFORE this leg\'s work is part of the chain', async (t) => {
  // The discriminating case for WHICH instance the wall reads. The fix loop's own
  // reader opens at the outer close and can never see the precheck; the run's reader
  // is fed by every grade the arbiter renders, precheck first ("the seed the work is
  // measured against"). Here the wall lands with ZERO fix iterations spent, so the
  // fix loop holds exactly one grade and could only say "unknown" — while the run
  // plainly went 2 → 1. Reading the loop's reader here would tell the human "I can't
  // tell" about a run that had visibly converged.
  const wd = makePatient(t);
  countingClose(wd, ['A', 'B', 'C']);
  // the patient starts with a test that already satisfies `clean-run`, so the PRECHECK
  // reds on the same stage the outer close does — two readings of one axis
  writeFileSync(join(wd, 'tests', 'test_x.mjs'), 'ok A\n');
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-at-outer-close-with-numbers',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok A B\n' })] },
        { text: 'wrote it' },
      ][n - 1] ?? { text: 'a fix attempt that must never be bought' };
      if (n === 4) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');
  assert.equal(events.find((e) => e.type === 'close-precheck').verdict, 'needs_revision',
    'the precheck really did render a grade — otherwise there is nothing for the two readers to disagree about');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.iterationsUsed, 0, 'zero fix iterations: the fix loop holds ONE grade and cannot make a trend out of it');
  assert.equal(wh.trend, 'converging', 'the RUN went 2 → 1 — the precheck is the baseline the step\'s work is measured against');
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /verdict 2 → 1/,
    'and the series that says so is shown, the same one the money halt would show at this instant');
});


test('W-2 trend (c): with NO number anywhere, a fix attempt that MOVED the close reads unknown + something-changed — and its close ran to completion even though the wall passed mid-attempt', async (t) => {
  const { outcome, events } = await trendRun(t, 'ok and six more bytes\n');
  assert.equal(outcome, 'wall-halt');

  // the in-flight case, which falls out of WHERE the check sits rather than out of
  // a second mechanism: the deadline landed during fix attempt 1, that attempt's
  // close still ran and graded real pre-deadline work, and only THEN did the loop
  // stop. A close is never bounded — a wall that kills grading leaves the run
  // unreadable after the money is spent (F45).
  assert.equal(afterFixLoop(events).filter((e) => e.type === 'close-verdict').length, 1,
    'the expiring attempt was still graded; the SECOND iteration is the one that never started');
  assert.ok(events.some((e) => e.type === 'wall-bounded' && e.phase === 'fix'),
    'the wall did land inside that attempt — otherwise this proves nothing about the in-flight case');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'unknown', 'no stage reported a comparable number, and motion is never promoted to a direction (F6)');
  assert.equal(wh.motion, 'changed', 'the old "moving" signal, preserved in substance and labelled as what it is');
  assert.equal(wh.iterationsUsed, 1);
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /still changing/,
    'the tree was still moving under the close when time ran out — a reading, not a verdict');
});


test('W-2 trend (b): with NO number anywhere, a fix attempt that changed NOTHING the close can see reads unknown + nothing-changed — and points the human at the goal, not the clock', async (t) => {
  const { outcome, events } = await trendRun(t, 'ok\n'); // byte-identical to what step one wrote
  assert.equal(outcome, 'wall-halt');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.trend, 'unknown', 'byte equality is evidence of no MOTION, which is not evidence of a direction');
  assert.equal(wh.motion, 'unchanged', 'the old "stalled" signal, preserved in substance');
  assert.equal(wh.iterationsUsed, 1);
  assert.match(events.filter((e) => e.type === 'escalation').at(-1).detail, /revise the goal\/spec/,
    'more time does not make an unreachable goal reachable — the frozen output is what points at the goal');
});


// ── W-2 at the STEP site. The fix loop's wall read has a sibling one layer up: a
// STEP that would BEGIN past the deadline. The variance meter cannot see that one —
// it measures a step's share against what the run had left when the step STARTED,
// and a step that started with nothing left has a time share of 0 forever, so the
// meter never fires and the step burns every attempt it is allowed. Each of those
// attempts is worthless by construction: the metered clock check stops the worker on
// its FIRST round so it writes nothing, and the judge still runs the step's exits —
// themselves close stages, at the full close timeout each — to re-mint the red
// already on the record. Same ruling as the fix loop's: when time is up, keep the
// grade we already have and stop.

/** the events emitted from the FIRST `step-start` onward — the step loop's own
 * record, separated from the close precheck's (which spawns the same check stages). */
const afterStepStart = (events) => {
  const i = events.findIndex((e) => e.type === 'step-start');
  assert.ok(i >= 0, 'a step opened — every assertion below is about what happened inside the step loop');
  return events.slice(i);
};


test('W-2 (step site): a step that would START past the deadline is never funded — zero attempts, zero rounds, zero exit checks', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'wall-before-step-one',
    async generate() {
      n += 1;
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'a step attempt that must never be bought' };
      if (n === 2) clk.advance(700_000); // the plan is drafted, and the clock is spent
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  assert.equal(outcome, 'wall-halt', 'time ran out before the step could start — a governance stop, never a step-red');
  assert.equal(n, 2, 'not one provider call was bought past the deadline');
  const inStep = afterStepStart(events);
  assert.equal(inStep.filter((e) => e.type === 'worker-round').length, 0, 'zero rounds inside the step');
  assert.equal(inStep.filter((e) => e.type === 'exit-eval').length, 0,
    'the judge never ran: a step\'s exits are close stages, and re-grading an untouched tree with them is the cost this closes');
  assert.equal(inStep.filter((e) => e.type === 'check-run').length, 0, 'so no check stage was spawned either');
  assert.equal(inStep.filter((e) => e.type === 'iteration-start').length, 1,
    'exactly ONE attempt was opened and it was refused at its head — never capRuns of them');
  assert.equal(inStep.filter((e) => e.type === 'middle-done').length, 0, 'and that attempt never ran');
  assert.equal(events.filter((e) => e.type === 'outer-close').length, 0,
    'nor does the run mint a fresh full close past the deadline: the grade it has is the close precheck\'s');

  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'wall-halt', 'the escalation names the same category the outcome does (F11)');
  assert.match(esc.options.join(' | '), /maxWallMs/, 'lever one: more time');
  assert.match(esc.options.join(' | '), /revise the goal/, 'lever two: a different goal');
  assert.doesNotMatch(esc.decision, /transport|network|socket/i, 'never a socket to debug');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the run-level TIME record carries the clock\'s own numbers');
  assert.equal(wh.cutMidCall, false,
    'read BETWEEN attempts with no call in flight — F64 is the other reading, and the job-end money floor keys on exactly this field');
  assert.equal(wh.phase, 'step:write-test');
  assert.equal(wh.stepsDone, 0);
  assert.equal(wh.stepsPlanned, 1);
  assert.equal(wh.attemptsUsed, 0);
  assert.equal(wh.requestedMs, 600_000);
});


test('W-2 (step site): the wall-halt record carries the LADDER state — never a count that no longer bounds anything here', async (t) => {
  // This record used to carry `capRuns` (the run's cap) alongside `stepAttemptCap`
  // (the step's tightening), named separately so one key could not carry two
  // meanings. Neither number bounds a step any more — the strike ladder does — and a
  // field whose name means something it no longer measures is worse than an absent
  // one, because a reader cannot tell it went stale. The fix site still writes
  // `capRuns` and still means it: that loop is still counted.
  //
  // The plan still declares `attempts: 1` on purpose: it is the shape that USED to
  // change this record, so a stale reading would show up here first.
  const wd = makePatient(t);
  const clk = fakeClock();
  const tightened = PLAN(wd, [{
    id: 'write-test', action: 'Write tests/test_x.mjs.', tools: ['write'], rounds: 4,
    attempts: 1, target: 'tests/test_x.mjs',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }]);
  let n = 0;
  const provider = {
    name: 'wall-before-tightened-step',
    async generate() {
      n += 1;
      const scripted = [{ text: 'scout' }, { text: tightened }][n - 1] ?? { text: 'never bought' };
      if (n === 2) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });
  assert.equal(outcome, 'wall-halt');

  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.equal(wh.phase, 'step:write-test', 'the STEP site wrote this record — the fix site is the other one');
  assert.equal(wh.strikes, 0, 'the ladder was governing this step, so the ladder state is what the record states');
  assert.equal(wh.strikeLimit, 2);
  assert.equal(wh.distinctGaps, 0, 'the step was refused at its head, so it judged nothing');
  assert.equal(wh.capRuns, undefined, 'the close-fix cap never bounded this step and no longer claims to');
  assert.equal(wh.stepAttemptCap, undefined, 'and the tightening it named bounds nothing either — the field is inert');
});


test('W-2 (step site) CONTROL: a step ALREADY RUNNING when the wall passes keeps its old behaviour — the attempt finishes, the judge runs, and the METER is what stops it', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  // The replanned plan KEEPS check-passes(clean-run): Rule B (check-shed) refuses a
  // redraft that drops an inherited check, and this test's subject is the WALL, not
  // the shed — the step is refused at the deadline before its exits ever run.
  const replanned = PLAN(wd, [{
    id: 'second-go', action: 'Write it properly.', tools: ['write'], rounds: 4,
    target: 'tests/test_x.mjs', exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
  }]);
  let n = 0;
  const provider = {
    name: 'wall-during-step-one',
    async generate() {
      n += 1;
      const scripted = [
        { text: 'scout' },
        { text: PLAN(wd) },
        { text: 'writing', toolCalls: [tcall('1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'nope\n' })] },
        { text: 'attempt 1 done' },   // …and the wall passes HERE, with the step under way
        { text: replanned },
      ][n - 1] ?? { text: 'never bought' };
      if (n === 4) clk.advance(700_000);
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now, capRuns: 3 });

  // scoped to the FIRST step — the step that was already running when the wall passed.
  // The boundary is that step's OWN terminal (`step-end`), which exists whatever the
  // run does next; it used to be the `replan` event, and keying a window on an event
  // the run may legitimately never emit is how a slice silently retargets.
  const stepOne = afterStepStart(events).slice(0, afterStepStart(events).findIndex((e) => e.type === 'step-end'));
  assert.equal(stepOne.filter((e) => e.type === 'middle-done').length, 1,
    'the in-flight attempt ran to completion — the wall never cuts work already under way');
  assert.equal(stepOne.filter((e) => e.type === 'exit-eval').length, 1, 'and its judge ran: grading real work always completes (F45)');

  const variance = events.find((e) => e.type === 'variance');
  assert.ok(variance, 'the METER is the instrument for a step that was already running — it sees the whole remaining time gone');
  assert.equal(variance.axis, 'time');
  assert.equal(variance.timeShare, 1);
  assert.equal(variance.iteration, 2, 'stopped at the HEAD of attempt 2, so attempt 1\'s work is not discarded');
  assert.equal(events.filter((e) => e.type === 'escalation')[0].category, 'step-variance',
    'a running step is stopped by the meter exactly as before — never by the step-site wall check');
  // The TAIL changed with hamr's ruling *"past the wall no new fix cycle or step
  // starts"*. It used to route to the ONE replan, buy the redraft, and refuse the
  // REPLANNED plan's first step at its head — two provider calls and a whole doomed
  // cycle to reach the same terminal. The meter's stop is now the terminal itself.
  assert.equal(events.filter((e) => e.type === 'replan').length, 0,
    'the doomed replan is not funded — the redraft would be paid for and its first step refused at its own head');
  assert.equal(events.filter((e) => e.type === 'plan-accepted').length, 1, 'the run drafted one plan and ran it');
  assert.equal(outcome, 'wall-halt');
  assert.equal(events.filter((e) => e.type === 'wall-halt').at(-1).phase, 'step:write-test',
    'the record names the step the clock actually stopped, not a successor that never began');
  assert.equal(events.filter((e) => e.type === 'escalation').at(-1).category, 'wall-halt',
    'and the outcome and the escalation name the same category (F11)');
});


test('SCOUT casualty: a transport death on the survey call ends the run as provider-red BEFORE a plan is ever drafted', async (t) => {
  const wd = makePatient(t);
  const provider = dyingAt([{ text: 'never reached' }], 0);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'plan-validate').length, 0, 'the run ended before any plan was validated');
  assert.equal(events.filter((e) => e.type === 'plan-accepted').length, 0);
  assert.ok(events.some((e) => e.type === 'scout-start'), 'the scout had started — the casualty is attributed to the phase that died');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.equal(esc.phase, 'scout');
  assert.equal(esc.lib, 'bare-agent', 'the typed lib field is stamped at the throw site, never sniffed from prose');
});


// ---- F146/F149 (PRD item 30.5) — a provider-red's escalation carries the upstream
// error BODY, redacted and bounded, not just the bare HTTP status ----

test('F146: a provider-red escalation carries the upstream body sentence, scrubbed of the secret it also carried — never the bare status alone', async (t) => {
  const secretKey = `sk-ant-api03-${'A'.repeat(90)}`;
  const body = { error: 'System message must be at the beginning', echo: secretKey };
  // Guard against a vacuous pass: the fixture must actually contain a shape
  // SECRET_PATTERNS matches, or "0 leaks" would prove nothing.
  assert.ok(scanSecrets(JSON.stringify(body)).length > 0, 'test fixture must contain a real secret shape or the leak assertion below is vacuous');
  const wd = makePatient(t);
  const thrower = () => Object.assign(new Error('HTTP 400'), { status: 400, body });
  const provider = dyingAt([{ text: 'never reached' }], 0, thrower);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.ok(esc.detail.includes('System message must be at the beginning'),
    'the body sentence that actually explains the 400 must reach the escalation detail (F146 — the number alone explained nothing)');
  assert.ok(!esc.detail.includes(secretKey), 'the raw key must never reach the escalation detail');
  assert.equal(scanSecrets(JSON.stringify(events)).length, 0, 'no secret shape survives anywhere on the emitted spine');
  // The scout path runs the same error through categorize() TWICE (once inside
  // mkWorker's ask/askFrom when it throws, once again inside relay() before it
  // reads e.message) — the BODY_MARKER guard must make that idempotent, never
  // doubling the suffix.
  const occurrences = esc.detail.split(' — body: ').length - 1;
  assert.equal(occurrences, 1, 'the body suffix must appear exactly once, even though categorize() runs twice on the same thrown error (ask() then relay())');
});


test('F146: a mid-STEP provider throw (ralph.js\'s own dumb-passthrough catch, never touched by this fix) still carries the body sentence — categorize() stamps the message once, before ralph ever reads it', async (t) => {
  const secretKey = `sk-ant-api03-${'B'.repeat(90)}`;
  const body = { error: 'System message must be at the beginning', echo: secretKey };
  assert.ok(scanSecrets(JSON.stringify(body)).length > 0, 'test fixture must contain a real secret shape or the leak assertion below is vacuous');
  const wd = makePatient(t);
  // scout + a valid plan, then the STEP worker's provider throws on its first
  // round — same shape as the F11/F44 mid-step casualty test above, but with a
  // real HTTP body instead of a bare transport message.
  const base = scriptedProvider([{ text: 'scout notes' }, { text: PLAN(wd) }]);
  let n = 0;
  const provider = {
    calls: base.calls,
    async generate(/** @type {any} */ messages, /** @type {any} */ tools) {
      if (n++ >= 2) throw Object.assign(new Error('HTTP 400'), { status: 400, body });
      return base.generate(messages, tools);
    },
  };
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'provider-red', 'a mid-step HTTP throw is a provider-red casualty, never step-red');
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  assert.equal(esc.category, 'provider-red');
  assert.ok(esc.detail.includes('System message must be at the beginning'),
    'ralph.js reads this categorized error\'s .message verbatim (String(e.message || e)) — the sentence must already be baked in by categorize()');
  assert.ok(!esc.detail.includes(secretKey), 'the raw key must never reach the step-loop escalation detail');
  assert.equal(scanSecrets(JSON.stringify(events)).length, 0, 'no secret shape survives anywhere on the emitted spine');
});


test('F146: an oversized upstream body is capped at 600 chars in the escalation detail', async (t) => {
  const body = { error: 'x'.repeat(5000) };
  const wd = makePatient(t);
  const thrower = () => Object.assign(new Error('HTTP 400'), { status: 400, body });
  const provider = dyingAt([{ text: 'never reached' }], 0, thrower);
  const { events } = await go(wd, provider);
  const esc = events.filter((e) => e.type === 'escalation').at(-1);
  const bodyPart = esc.detail.slice(esc.detail.indexOf(' — body: ') + ' — body: '.length);
  assert.ok(bodyPart.length <= 600, `the appended body must be capped at 600 chars, got ${bodyPart.length}`);
});


// ---- W4: ONE close staging, shared by the prompt, the validator and the runner ----

test('W4: an object-form predicate close is STAGED once — the drafter, the validator and the runner see the same one-stage menu, at the same close cost as the equivalent single-stage list', async (t) => {
  // Before the hoist there were TWO derivations: planPrompt and validatePlan
  // called checkMenu on the RAW spec (an object is not an array → empty menu),
  // while runPlan called it on the SYNTHESIZED [{name:'close',…}]. So the runner
  // announced and preflighted a stage the drafter was never offered and the
  // validator would have redded check-unknown — and it ran the close command a
  // second time for a ruler nobody could reference.
  const run = async (close) => {
    const wd = makePatient(t);
    // a COUNTING close: it appends one line per execution, so the number of times
    // the operator's command actually ran is on disk, not inferred from events
    const closeSrc = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
appendFileSync(new URL('./close-runs.log', import.meta.url), 'run\\n');
const p = new URL('./tests/test_x.mjs', import.meta.url).pathname;
if (existsSync(p) && readFileSync(p, 'utf8').includes('ok')) { console.log('suite: 1 passed'); process.exit(0); }
console.log('FAILED tests/test_x.mjs — file missing or has no ok assertion'); process.exit(1);\n`;
    writeFileSync(join(wd, 'close.mjs'), closeSrc);
    const plan = JSON.stringify({ schema: 'plan-v1', steps: [{
      id: 'write-test', action: 'Write tests/test_x.mjs asserting the module exports.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'close' }],
    }] });
    const provider = scriptedProvider([
      { text: 'scout' }, { text: plan },
      { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
      { text: 'wrote it' },
    ]);
    // PRD item 27/M2: the object (single-predicate) form of `close` is out of
    // `signCloseScripts`' array-only scope, so JOB()'s auto-sign never
    // touches it — sign it here directly against the real file just written.
    const signedClose = Array.isArray(close) ? close : { ...close, sha256: hashCloseScriptBytes(closeSrc) };
    const { outcome, events } = await go(wd, provider, { job: JOB(wd, { close: signedClose }) });
    const log = join(wd, 'close-runs.log');
    const runs = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0;
    return { outcome, events, runs };
  };

  const obj = await run({ type: 'predicate', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' });
  assert.equal(obj.outcome, 'green', 'the plan referenced the staged stage by name and the run completed');
  assert.deepEqual(obj.events.find((e) => e.type === 'check-menu').offered, ['close']);
  assert.deepEqual(obj.events.filter((e) => e.type === 'check-preflight').map((e) => e.name), ['close']);
  assert.equal(obj.events.filter((e) => e.type === 'close-precheck').length, 1, 'the precheck is one close judgment, not two');
  assert.ok(obj.events.some((e) => e.type === 'check-run' && e.name === 'close'),
    'the step actually referenced the staged stage as its ruler — without that the menu claim is decoration');

  // parity: the object form is EXACTLY the one-stage list it stands for, so its
  // close command must execute the same number of times — no extra run for an
  // unreferenceable ruler, and no silently skipped preflight either
  const arr = await run([{ name: 'close', cmd: 'node close.mjs', expect: 0, gapKeep: '^FAILED' }]);
  assert.equal(arr.outcome, 'green');
  assert.equal(obj.runs, arr.runs,
    `the object form must cost exactly what its staged equivalent costs (object ${obj.runs} vs list ${arr.runs})`);
  assert.deepEqual(
    obj.events.filter((e) => ['check-menu', 'check-preflight', 'check-run'].includes(e.type)),
    arr.events.filter((e) => ['check-menu', 'check-preflight', 'check-run'].includes(e.type)),
    'and the two shapes produce the same menu/preflight/check record',
  );
});


test('W3: the incoherent narrowed-scope plan is rejected at the VALIDATION gate on the shipped path — it never reaches the worker to burn attempts on refusals', async (t) => {
  // The defect this closes, end to end: `scope` narrows the step's gate to
  // tests/**, `target` names src/mod.mjs — each half legal against the SIGNED
  // fence, so the plan used to validate green and every write the step made was
  // then denied by the narrowed gate, burning its attempts with no red anywhere.
  // Run against the runner's OWN derived scope menu, not a hand-passed one.
  const wd = makePatient(t);
  const job = JOB(wd, { writeScope: ['tests/**', 'src/**'] });
  const bad = JSON.stringify({ schema: 'plan-v1', steps: [{
    id: 'write-test', action: 'Edit the module.',
    tools: ['write'], rounds: 6, target: 'src/mod.mjs', scope: 'tests/**',
    exit: [{ type: 'tree-changed', scope: 'tests/**' }],
  }] });
  const provider = scriptedProvider([{ text: 'scout' }, { text: bad }, { text: bad }]);
  const { outcome, events } = await go(wd, provider, { job });
  assert.equal(outcome, 'plan-red');
  const red = events.filter((e) => e.type === 'plan-red').find((e) => e.path === 'steps.0.target');
  assert.equal(red?.code, 'step-scope-escape', `got ${JSON.stringify(events.filter((e) => e.type === 'plan-red'))}`);
  assert.match(red.detail ?? '', /tests\/\*\*/, 'the gap names the step\'s own narrowed scope so the redraft can aim');
  assert.equal(events.filter((e) => e.type === 'step-start').length, 0, 'no step ever ran — the burn is what this closes');
});


// ── Layer 3 module 3: MECHANICAL START — the bridge as the drafter's starting
// draft (design record 2026-08-01, D3/D4/D5 + the D2-SPLIT addendum).
//
// The probe (scripts/reuse-exec-probe.mjs) proved the mechanism by INJECTING at
// the provider seam; this graduates it into the shipped path. What the tests hold:
//  - D2 (split): the load gate runs AT THE DOOR — before the close precheck, before
//    the scout, before any token. A refusal is the `recipe-stale` terminal, never a
//    crash and never an automatic silent fall-back to cold drafting.
//  - D4: the bridge is a STARTING DRAFT — appended to the SAME drafting prompt, judged
//    by the SAME validator. No second, looser path exists for an inherited plan.
//  - D5: the one-replan ceiling is untouched, and a REPLAN draft never re-injects the
//    bridge — it drafts from the run's own state (the probe's own rule, kept).
//  - the COLD path is byte-identical when no bridge is passed (the F47 "works both
//    ways" lesson): no marker in the prompt, and no new event on the spine.

/** the recipe's plan: same SHAPE, and its paths are the OTHER repository's — instance-bound
 * fields are EXPECTED to be wrong here, which is the whole D2-split finding */
const BRIDGE_PLAN = {
  schema: 'plan-v1',
  steps: [{
    id: 'write-the-missing-test', action: 'Write the missing test file, as the recipe did on the other repository.',
    tools: ['write'], rounds: 6, target: 'spec/other_spec.mjs',
    exit: [{ type: 'tree-changed', scope: 'spec/**' }],
  }],
};

/** an OLDER version of the same recipe — `versions` is oldest-first, so this one must NOT
 * be the plan that reaches the prompt */
const BRIDGE_PLAN_OLD = { schema: 'plan-v1', steps: [{ id: 'stale-first-cut', action: 'the superseded first cut', tools: ['write'], rounds: 4, target: 'spec/old_spec.mjs', exit: [{ type: 'tree-changed', scope: 'spec/**' }] }] };

const greenRow = (runid, patient) => ({ at: '2026-07-30T00:00:00Z', runid, patient, outcome: 'green', failingStage: null, costUsd: 2.21, spendComplete: true, wallMs: 534_000, rounds: 40 });

const version = (plan, runid, patient) => ({ plan, runid, greenAt: '2026-07-30T00:00:00Z', patient, costUsd: 2.21, wallMs: 534_000, rounds: 40 });

const BRIDGE = (over = {}) => ({
  schema: 'bridge-v1',
  name: 'plan-patient-suite',
  goal: 'Write the missing test so the suite greens.',
  specHash: null,
  closeStageNames: ['clean-run', 'verdict'],
  toolsUsed: ['write'],
  versions: [version(BRIDGE_PLAN_OLD, 'ms-older', 'other-repo'), version(BRIDGE_PLAN, 'ms-newest', 'third-repo')],
  history: [greenRow('ms-older', 'other-repo'), greenRow('ms-newest', 'third-repo')],
  ...over,
});

const MARKER = 'YOUR STARTING DRAFT';


test('planPrompt COLD is byte-identical with the starting-draft argument absent, null, or undefined (the F47 works-both-ways pin)', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const args = [job, 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 }];
  const cold = planPrompt(...args);
  assert.equal(planPrompt(...args, null), cold, 'an explicit null is the cold render');
  assert.equal(planPrompt(...args, undefined), cold, 'and so is an explicit undefined');
  assert.ok(!cold.includes(MARKER), 'no mechanical-start marker exists on the cold path');
});


test('planPrompt with a starting draft: the cold prompt is intact as a PREFIX, plus the verbatim framing and the plan pretty-printed', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const args = [job, 'scout notes', null, 40, null, undefined, { balanceUsd: 1.5 }];
  const cold = planPrompt(...args);
  const warm = planPrompt(...args, BRIDGE_PLAN);
  assert.ok(warm.startsWith(cold), 'the shipped prompt is unchanged and the block is ADDITIVE — never surgery on its interior');
  // the framing is the pre-probe's arm C, the language the draft read was measured on
  assert.match(warm, /YOUR STARTING DRAFT — begin from the plan below and tweak it\./);
  assert.match(warm, /Take it\nas your starting draft rather than starting from a blank page: keep what carries over, change what\nthis repository needs\./);
  assert.match(warm, /Everything you submit must be legal for THIS job as described above/);
  // the stage count is TRUE for THIS job (two stages), never the probe job's hardcoded four
  assert.match(warm, /the same two close stages/);
  assert.ok(warm.includes(JSON.stringify(BRIDGE_PLAN, null, 2)), 'the plan rides pretty-printed, exactly as the probe handed it over');
});


test('planPrompt keeps the reds appendix LAST: a redraft is still told to fix its reds after the starting draft', () => {
  const wd = '/tmp/does-not-matter';
  const job = JOB(wd);
  const reds = [{ code: 'invalid-value', path: 'steps.0.scope' }];
  const warm = planPrompt(job, 'scout', reds, 40, null, undefined, { balanceUsd: 1.5 }, BRIDGE_PLAN);
  assert.ok(warm.indexOf(MARKER) < warm.indexOf('Your previous plan was REJECTED'),
    'the block lands BEFORE the reds instruction — the probe recorded the opposite ordering as its own known wart');
  assert.ok(warm.trimEnd().endsWith('Output ONLY the corrected JSON object.'), 'the last word to a redrafting planner is still the validator\'s');
});


test('a bridge that PASSES the load gate becomes the drafter\'s starting draft; bridge-loaded names the NEWEST version', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE() });
  assert.equal(outcome, 'green');
  const loaded = events.find((e) => e.type === 'bridge-loaded');
  assert.ok(loaded, `bridge-loaded is on the spine — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(loaded.name, 'plan-patient-suite');
  assert.equal(loaded.versions, 2);
  assert.equal(loaded.runid, 'ms-newest', 'the NEWEST version is the one that inherits (versions are oldest-first)');
  assert.ok(!events.some((e) => e.type === 'bridge-gate'), 'a passing gate is recorded as the load, not as a refusal');

  const draft = provider.calls[1];
  assert.ok(draft.includes(MARKER), 'the DRAFT prompt carries the mechanical start');
  assert.ok(draft.includes(JSON.stringify(BRIDGE_PLAN, null, 2)), 'and it carries the newest version\'s plan');
  assert.ok(!draft.includes(JSON.stringify(BRIDGE_PLAN_OLD, null, 2)), 'never the superseded one');
  assert.ok(!provider.calls[0].includes(MARKER), 'the SCOUT is untouched — the bridge is a drafting material, not a worker\'s');
  for (const p of provider.calls.slice(2)) assert.ok(!p.includes(MARKER), 'and no step worker ever sees it');
});


test('the tweaked draft passes the SAME validator — no second, looser path exists for an inherited plan (D4)', async (t) => {
  const wd = makePatient(t);
  // the drafter hands back the recipe UNCHANGED: its `spec/**` scope is outside this
  // job's signed fence, so the shipped validator must red it exactly as it would a cold draft
  const provider = scriptedProvider([
    { text: 'scout' },
    { text: JSON.stringify(BRIDGE_PLAN) },
    { text: JSON.stringify(BRIDGE_PLAN) },
  ]);
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE() });
  assert.equal(outcome, 'plan-red', 'an inherited plan that does not fit THIS job is rejected like any other');
  assert.ok(events.some((e) => e.type === 'plan-red'), 'and the reds are on the spine');
  assert.ok(provider.calls[2].includes(MARKER), 'the arm HOLDS across a validator-rejected redraft — one red must not silently convert the run to cold');
});


test('D5: a REPLAN draft never re-injects the bridge — it drafts from the run\'s own state, and the one-replan ceiling is untouched', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { text: 'thinking about it' },   // attempt 1: no write
    { text: 'still thinking' },      // attempt 2: no write → cap → replan
    { text: PLAN(wd, [{
      id: 'write-test-2', action: 'Actually write tests/test_x.mjs now.',
      tools: ['write'], rounds: 6, target: 'tests/test_x.mjs',
      exit: [{ type: 'tree-changed', scope: 'tests/**' }, { type: 'check-passes', name: 'clean-run' }],
    }]) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider, { capRuns: 2, bridge: BRIDGE() });
  assert.equal(outcome, 'green');
  assert.equal(events.filter((e) => e.type === 'replan').length, 1, 'exactly one replan — reuse buys no extra revision allowance');
  const replanDraft = provider.calls[4];
  assert.ok(replanDraft.includes('What happened when the previous plan ran:'), 'this IS the replan draft');
  assert.ok(!replanDraft.includes(MARKER), 'and it carries NO starting draft — the run\'s own state is the material now');
  assert.equal(events.filter((e) => e.type === 'bridge-loaded').length, 1, 'the bridge is loaded once, at the door');
});


test('a bridge that FAILS the load gate is the recipe-stale terminal: zero tokens, no close precheck, never a crash', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]);
  // same job, a recipe that inspects something else — the D2-split gate's stage-kind check
  const { outcome, events } = await go(wd, provider, { bridge: BRIDGE({ closeStageNames: ['typecheck', 'suite-green'] }) });
  assert.equal(outcome, 'recipe-stale');
  assert.equal(provider.calls.length, 0, 'refused at the door — not one token was spent');
  assert.ok(!events.some((e) => e.type === 'close-precheck'), 'and not one close stage was run either');
  assert.ok(!events.some((e) => e.type === 'scout-start'));
  const gate = events.find((e) => e.type === 'bridge-gate');
  assert.ok(gate, `bridge-gate is on the spine — events: ${events.map((e) => e.type).join(' ')}`);
  assert.equal(gate.outcome, 'recipe-stale');
  assert.equal(gate.name, 'plan-patient-suite');
  assert.equal(gate.reds[0].code, 'recipe-stale');
  assert.match(gate.reds[0].path, /closeStageNames/);
  assert.ok(!events.some((e) => e.type === 'bridge-loaded'));
  const esc = events.find((e) => e.type === 'escalation');
  assert.equal(esc?.category, 'recipe-stale');
  assert.equal(esc.decisionReady, true, 'cold drafting is the CALLER\'s decision — never an automatic silent fall-back');
  assert.ok(esc.options.some((o) => /cold/i.test(o)), `the cold option is offered by name: ${JSON.stringify(esc?.options)}`);
});


test('softgreen module 6: a HELD workflow is refused at the same door — a judged green earns no reuse until a signer accepts it', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]);
  // every version held: selection already skips these, and this is the same rule at the
  // point of CONSUMPTION, so a caller handing one in directly cannot spend ungranted credit
  const held = BRIDGE({
    versions: [{ ...version(BRIDGE_PLAN, 'ms-newest', 'third-repo'), quarantined: true }],
    history: [{ ...greenRow('ms-newest', 'third-repo'), quarantined: true }],
  });
  const { outcome, events } = await go(wd, provider, { bridge: held });
  assert.equal(outcome, 'recipe-stale');
  assert.equal(provider.calls.length, 0, 'refused at the door — not one token was spent');
  const gate = events.find((e) => e.type === 'bridge-gate');
  assert.equal(gate?.outcome, 'quarantined', 'and it says HELD, not stale: the recipe is the right kind, it is simply unaccepted');
  assert.equal(gate.reds[0].code, 'quarantined');
  assert.ok(!events.some((e) => e.type === 'bridge-loaded'));
  assert.match(events.find((e) => e.type === 'escalation')?.options.join(' ') ?? '', /accept/i, 'the door that would release it is offered by name');

  // the RELEASED half of the same fixture inherits exactly as it always did
  const released = BRIDGE({
    versions: [{ ...version(BRIDGE_PLAN, 'ms-newest', 'third-repo'), quarantined: false }],
    history: [{ ...greenRow('ms-newest', 'third-repo'), quarantined: false, doors: [{ decision: 'accept', at: '2026-08-18T00:00:00Z' }] }],
  });
  const ok = await go(wd, scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]), { bridge: released });
  assert.ok(ok.events.some((e) => e.type === 'bridge-loaded'), 'released is reused, and the run carries on');
});


test('a MALFORMED bridge is refused at the same door, by its own reds — never a throw on the way to reading its plan', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([{ text: 'scout' }, { text: PLAN(wd) }]);
  for (const bad of [BRIDGE({ versions: [], history: [] }), BRIDGE({ schema: 'bridge-v2' }), { not: 'a bridge' }, 'nonsense']) {
    const { outcome, events } = await go(wd, provider, { bridge: bad });
    assert.equal(outcome, 'recipe-stale', `refused: ${JSON.stringify(bad).slice(0, 60)}`);
    assert.ok(events.find((e) => e.type === 'bridge-gate')?.reds.length > 0, 'the reds say WHY, they are never an empty refusal');
    assert.equal(provider.calls.length, 0);
  }
});


test('COLD path unchanged: with no bridge opt, no bridge event fires and the drafting prompt carries no starting draft', async (t) => {
  const wd = makePatient(t);
  const provider = scriptedProvider([
    { text: 'scout notes' },
    { text: PLAN(wd) },
    { toolCalls: [tcall('t1', 'shell_write', { path: join(wd, 'tests', 'test_x.mjs'), content: 'ok\n' })] },
    { text: 'done' },
  ]);
  const { outcome, events } = await go(wd, provider);
  assert.equal(outcome, 'green');
  assert.ok(!events.some((e) => e.type === 'bridge-loaded' || e.type === 'bridge-gate'), 'no bridge event exists on a cold run');
  for (const p of provider.calls) assert.ok(!p.includes(MARKER), 'and nothing anywhere carries a starting draft');
});


// ── BA-19 / F72 park D: the TOTAL-duration deadline at the provider seam.
//
// BA-18's `timeoutMs` bounds socket INACTIVITY only, so a call that trickles bytes
// forever is invisible to it (F66: 274 minutes inside one call, the bound correctly
// passed). BA-19 adds an absolute ceiling. Wiring it raises exactly one question this
// repo has already answered once, on the other bound: when it trips, is that the
// operator's own governance number binding, or a dead socket? F64's answer is the
// clock, not the error code — and these three tests hold both halves of it.

/** bare-agent's BA-19 rejection shape (`provider-http.js` applyRequestDeadline):
 * a DIFFERENT code from the idle bound's, no category, and terminal */
const deadlineError = () => Object.assign(new Error('[AnthropicProvider] request exceeded its total deadline of 600000ms'), { code: 'EDEADLINE', retryable: false, context: { bound: 'deadline' } });


test('BA-19: a wall-derived DEADLINE trip is a wall-halt, not a provider-red — the run set that ceiling from its own remaining time, so the trip is governance (F64, on the new bound)', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'deadline-trip',
    async generate() {
      n += 1;
      // the worker's first round: the call outlives the wall and bare-agent's
      // TOTAL-duration timer — the one this run armed — destroys the request
      if (n === 3) { clk.advance(700_000); throw deadlineError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'wall-halt', 'a deadline this run derived is the run running out of time — never a casualty');
  const cats = events.filter((e) => e.type === 'escalation').map((e) => e.category);
  assert.ok(cats.includes('wall-halt'), `the escalation names the same category the outcome does — saw ${cats.join(', ')}`);
  assert.ok(!cats.includes('provider-red'), 'nothing on the spine may call the operator\'s own ceiling a transport failure');
  const wh = events.filter((e) => e.type === 'wall-halt').at(-1);
  assert.ok(wh, 'the clock\'s numbers reach the spine, exactly as on the idle bound');
  assert.equal(wh.cutMidCall, true, 'the deadline landed INSIDE a call — that is the whole reason this bound exists');
  const esc = events.filter((e) => e.type === 'escalation').find((e) => e.category === 'wall-halt');
  assert.match(esc.options.join(' '), /maxWallMs/, 'the lever is raise-the-cap, not retry-the-provider');
});


test('BA-19 control: a DEADLINE trip with wall time REMAINING stays a provider-red — the discriminator is the clock, never the code, so a deadline this run did not derive is still transport (F64\'s pre-registered must-not-change control)', async (t) => {
  const wd = makePatient(t);
  const clk = fakeClock();
  let n = 0;
  const provider = {
    name: 'foreign-deadline',
    async generate() {
      n += 1;
      // identical rejection, identical call position; the clock is NOT expired, so
      // this ceiling cannot have come from the wall (a provider constructed with its
      // own deadlineMs, say) and the row is a casualty like any other
      if (n === 3) { clk.advance(1_000); throw deadlineError(); }
      const scripted = [{ text: 'scout' }, { text: PLAN(wd) }][n - 1] ?? { text: 'done' };
      return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
    },
  };
  const { outcome, events } = await go(wd, provider, { job: JOB(wd, { maxWallMs: 600_000 }), now: clk.now });

  assert.equal(outcome, 'provider-red');
  assert.equal(events.filter((e) => e.type === 'wall-halt').length, 0, 'no wall-halt record on a run that never ran out of time');
});


test('BA-19 wiring: every provider call carries a deadlineMs derived from the wall REMAINING at that call — and an unbounded run carries none at all (the knob is absent, not 0 and not a default)', async (t) => {
  // The blind-instrument guard on this whole module: a `deadlineMs` computed and never
  // handed to the provider is F50 in a new coat ("wired ≠ the code exists"). bare-agent
  // forwards loop.run's options straight into provider.generate (loop.js:732), so the
  // observable is the third argument.
  /** @param {any[]} seen */
  const capturing = (seen) => {
    let n = 0;
    return {
      name: 'capture-options',
      async generate(_messages, _tools, options) {
        n += 1;
        seen.push(options ?? {});
        const scripted = [{ text: 'scout' }, { text: PLAN(_wd) }][n - 1] ?? { text: 'done' };
        return { ...scripted, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, stopReason: 'end_turn' };
      },
    };
  };
  let _wd = makePatient(t);
  /** @type {any[]} */
  const bounded = [];
  const clk = fakeClock();
  await go(_wd, capturing(bounded), { job: JOB(_wd, { maxWallMs: 600_000 }), now: clk.now });
  assert.ok(bounded.length >= 2, 'the scout and the drafter both went through the seam');
  for (const o of bounded) {
    assert.equal(typeof o.deadlineMs, 'number', 'a bounded run arms the total-duration ceiling on every call');
    assert.equal(o.deadlineMs, 600_000, 'and the number is the wall\'s remainder read at call time (this fake clock never advances, so it is the full wall)');
    assert.ok(o.deadlineMs >= o.timeoutMs, 'the idle bound trips first on a SILENT socket; only a live-but-never-finishing stream reaches the deadline (bare-agent provider-http.js:92)');
  }

  _wd = makePatient(t);
  /** @type {any[]} */
  const unbounded = [];
  await go(_wd, capturing(unbounded), { now: fakeClock().now }); // JOB() sets no maxWallMs
  assert.ok(unbounded.length >= 2);
  for (const o of unbounded) {
    assert.ok(!('deadlineMs' in o), 'an operator who set no wall gets NO ceiling — omitted entirely, so nothing downstream can read a default into it (F45)');
    assert.equal(typeof o.timeoutMs, 'number', 'the idle bound is unchanged: BA-18 still bounds a hang with no run budget');
  }
});
