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
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
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

// ── A KILL LEAVES A BODY, TOO ────────────────────────────────────────────────
//
// The crash catch above covers a throw. It does NOT cover a signal: ^C on a run
// that looks hung, a closed terminal, a harness stopping the process group. Those
// left the same one-line spine the crash used to — `author-start` and silence,
// byte-for-byte what a run still in flight looks like — and took 100% of the
// spend record with them (F6/F12: a halted attempt's spend was invisible by 300×).
//
// The instrument below is a TWIN, and what is twinned is stated honestly: the
// handler and the cost/phase recorders are the RUNNER'S OWN BYTES, extracted from
// source and executed; the ~10 lines around them (a temp spine, a stub `emit`
// call site) are the test's. The alternative is not a better test — it is no test
// at all, because the real script installs these only AFTER the key guard, and
// past that line every path costs real money.

/** the progress/cost/kill region: from the metered list to the close of the
 * signal loop. INDENT-ANCHORED at both ends (`\n}` at column 0), the same
 * lesson the governance block above already paid for. */
const KILL = /const metered = \[\];[\s\S]*?\n\}\n/.exec(SRC)?.[0];
/** F6's own renderer, extracted with it — the killed report must not spell the
 * spend a second way */
const COSTLINE = /const costLine = \(cost\) => \{[\s\S]*?\n\};\n/.exec(SRC)?.[0];

test('the kill region is still BOUNDED — this guard reads the handler, not the rest of the file', () => {
  assert.ok(KILL, 'the kill/progress region moved — this guard no longer reads the code it guards');
  assert.ok(COSTLINE, 'costLine moved');
  assert.ok(!/authorCloseForJob/.test(KILL), 'KILL ran past the handler into the paid flow');
  assert.ok(!/catch \(err\)/.test(KILL), 'KILL ran past the handler into the crash catch');
});

test('all three catchable kills are handled — and SIGKILL is not pretended to be', () => {
  assert.ok(KILL);
  assert.match(KILL, /\['SIGINT', 'SIGTERM', 'SIGHUP'\]/, 'a terminal ^C, a harness stop and a closed terminal are three different deaths and one record');
  // SIGKILL is uncatchable. It may be NAMED (saying so is the honest thing) but
  // it must never be registered — a listener that can never fire reads as cover
  // this runner does not have.
  assert.ok(!/process\.on\('SIGKILL'|'SIGKILL',/.test(KILL), 'SIGKILL is uncatchable — a handler for it is a promise nothing keeps');
});

test('the killed report is written, then the signal is RE-RAISED — never exited', () => {
  assert.ok(KILL);
  assert.match(KILL, /emit\('author-killed', \{ signal: sig, phase, \.\.\.costSoFar\(\) \}\)/,
    'the report names WHICH signal, WHERE it landed, and what had been spent');
  assert.match(KILL, /emit\('author-end', \{ outcome: 'killed', signal: sig \}\)/,
    'a spine with no author-end reads as a run still in flight — that IS the defect');
  // F70 — a killed-handler that crashes destroys the report it exists to make
  assert.match(KILL, /\} catch \{/, 'the emits are unguarded — a failing append would take the report down with it');
  // the honest exit code for a signal death is 128+signo, and only the default
  // disposition produces it. `process.exit(0)` here reports a killed run as clean.
  assert.match(KILL, /process\.removeAllListeners\(sig\);\s*\n\s*process\.kill\(process\.pid, sig\)/,
    'the listener must be removed BEFORE the re-raise, or the handler re-enters itself');
  assert.ok(!/process\.exit\(/.test(KILL), 'process.exit() in the kill path invents an exit code and can discard queued output (F71)');
});

test('the running cost is ONE list read through the shared tally — never a second hand-spelled total', () => {
  assert.ok(KILL);
  // the pair this file has already paid for once (the cap-halt/pricing-red type):
  // a second accumulator is a second instrument, and these two must never disagree
  assert.match(KILL, /tallyCalls\(metered\)/, 'the totals are DERIVED from the call list, through the library\'s own reader');
  assert.match(KILL, /costUsd: call\.costUsd/, 'an unpriced call rides as null — `?? 0` launders unknown into $0 (F6)');
  assert.ok(!/costUsd: [^cn]/.test(KILL), 'a hand-computed cost appeared in the cost record');
  assert.match(KILL, /costLine\(costSoFar\(\)\)/, 'and the console reading goes through the one renderer');
});

test('the reporters never take down the run they report on', () => {
  assert.ok(KILL);
  // this is progress reporting on a PAID run: a full disk or a closed pipe must
  // not kill work that is being paid for, and the run's real records are all
  // downstream of these
  const guarded = [...KILL.matchAll(/\} catch \{/g)].length;
  assert.ok(guarded >= 3, `onPhase, onCall and the kill handler must each be guarded (saw ${guarded})`);
});

// ── THE THIRD PAID SEAM IS BOUNDED BY THE SAME NUMBER ────────────────────────
//
// `--budget` bounds the scout and the declaration loop through the library's cost
// book. The calibration gate is this runner's THIRD paid seam — up to ten locate
// calls plus a five-artifact battery — and it ran with no ceiling at all: the
// advertised budget and the enforced budget being two different numbers, which is
// the one thing a governance number may never be. Pinned from source for the same
// reason the block above is: the call site is reachable only after a real scout and
// a real model call have been paid for.

/** the `prepareSigning` call, from its opening to its closing paren */
const SIGN = /const signing = await prepareSigning\(\{[\s\S]*?\n {6}\}\);/.exec(SRC)?.[0];

test('the calibration gate runs under the OPERATOR\'s ceiling, with prior spend folded in', () => {
  assert.ok(SIGN, 'the prepareSigning call moved — this guard no longer reads the code it guards');
  assert.ok(!/authorCloseForJob/.test(SIGN), 'SIGN ran past the signing call into the flow around it');
  assert.match(SIGN, /ceilingUsd: CEILING_USD/, 'the gate must run under the same operator number as the other two seams');
  // …and the fold. A ceiling that starts this seam's tally at zero is a second
  // ceiling wearing the first one's number, and re-invoking it would widen it.
  assert.match(SIGN, /priorCalls: \[\.\.\.metered\]/, 'the run\'s spend so far must be folded into the gate\'s ceiling');
  // the fold reads the ONE metered list this runner already keeps — never a second
  // hand-spelled total (the pair this file has paid for once already)
  assert.ok(!/priorCalls: \[\{/.test(SIGN), 'priorCalls must be the run\'s own call list, not a hand-built one');
});

// ── the twin: the extracted bytes, actually signalled ────────────────────────

const twinBase = mkdtempSync(join(tmpdir(), 'run-author-kill-'));
process.on('exit', () => rmSync(twinBase, { recursive: true, force: true }));

/**
 * Run the runner's OWN kill/cost bytes in a child, signal it, and read what it
 * left behind. Only the ~10 lines of scaffolding around the extracted region are
 * the test's: the spine path, a stub `emit`, and one call to each recorder.
 * @param {string} sig
 */
const twin = (sig) => new Promise((resolve, reject) => {
  const dir = mkdtempSync(join(twinBase, 'run-'));
  const spine = join(dir, 'spine.jsonl');
  const file = join(dir, 'twin.mjs');
  writeFileSync(file, [
    "import { appendFileSync } from 'node:fs';",
    `import { tallyCalls } from ${JSON.stringify(join(REPO, 'src/text.js'))};`,
    `import { phaseLine } from ${JSON.stringify(join(REPO, 'scripts/author-readout.mjs'))};`,
    `const spineFile = ${JSON.stringify(spine)};`,
    'const CEILING_USD = 2.5;',
    "const emit = (type, data = {}) => { appendFileSync(spineFile, `${JSON.stringify({ type, ts: new Date().toISOString(), ...data })}\\n`); };",
    COSTLINE,
    KILL,
    // one real paid call and one real phase, then hold the process open exactly
    // as an awaited pipeline would
    "onPhase('scout', { attempts: 3 });",
    "onCall({ label: 'author-scout', costUsd: 0.03, unpricedRounds: 0 });",
    "onCall({ label: 'author', costUsd: null, unpricedRounds: 2 });",
    "process.stdout.write('READY\\n');",
    'setInterval(() => {}, 1000);',
  ].join('\n'));

  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  let signalled = false;
  child.stdout.on('data', (b) => {
    out += b;
    // signalled on the marker, never on a timer: a fixed sleep is load-sensitive
    // and would flake instead of failing
    if (!signalled && out.includes('READY')) { signalled = true; child.kill(sig); }
  });
  child.stderr.on('data', (b) => { err += b; });
  child.on('error', reject);
  child.on('close', (code, signal) => {
    const events = existsSync(spine)
      ? readFileSync(spine, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    resolve({ code, signal, out, err, events });
  });
});

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`${sig} leaves a BODY: the phase it died in, the spend, and an author-end`, async () => {
    const r = await twin(sig);

    const killed = r.events.find((e) => e.type === 'author-killed');
    assert.ok(killed, `no author-killed on the spine — this is the one-line-spine defect returning\n${r.err}`);
    assert.equal(killed.signal, sig);
    assert.equal(killed.phase, 'scout', 'the phase is WHERE the money went — the question a killed run has to answer');
    // the spend survived the process. `costUsd` is null because one call was
    // unpriced (F6: unknown is reported as unknown), and the KNOWN half is still
    // on the record rather than being lost with it.
    assert.equal(killed.costUsd, null, 'an unpriced call makes the total unknown, and unknown is what is written');
    assert.equal(killed.knownUsd, 0.03);
    assert.equal(killed.spendComplete, false);
    assert.deepEqual(killed.calls.map((/** @type {any} */ c) => c.label), ['author-scout', 'author']);

    const end = r.events.find((e) => e.type === 'author-end');
    assert.ok(end, 'a spine with no author-end reads as a run still in flight');
    assert.equal(end.outcome, 'killed');
    assert.equal(end.signal, sig);
    // ORDER: the killed detail is written before the end, and the end is last
    assert.ok(r.events.indexOf(killed) < r.events.indexOf(end));
    assert.equal(r.events.at(-1).type, 'author-end');

    // the honest death: BY the signal, not an invented exit code
    assert.equal(r.signal, sig, `the process did not die by ${sig} (code ${r.code}) — the re-raise was swallowed`);
    assert.equal(r.code, null);
    assert.match(r.err, new RegExp(`KILLED by ${sig} during scout`));
  });
}

test('twin: the paid calls were on the spine BEFORE the kill — a run that dies mid-flight still has its spend', async () => {
  const r = await twin('SIGTERM');
  const costs = r.events.filter((e) => e.type === 'author-cost');
  assert.deepEqual(costs.map((c) => [c.label, c.costUsd, c.unpricedRounds]), [
    ['author-scout', 0.03, 0],
    ['author', null, 2],
  ], 'each metered call is reported as it lands, with its own price — null stays null (F6)');
  assert.equal(costs[0].knownUsdSoFar, 0.03);
  assert.equal(costs[1].spendCompleteSoFar, false, 'the unpriced call makes the running total unknown from then on');
  assert.equal(costs[1].ceilingUsd, 2.5, 'the ceiling rides along, so the record can be read against it');

  const phases = r.events.filter((e) => e.type === 'author-phase');
  assert.deepEqual(phases.map((p) => [p.phase, p.attempts]), [['scout', 3]]);
  assert.match(r.out, /· scout running \(up to 3 attempt\(s\)\)/, 'and the person watching was told, in words');
});

test('exit code 4 is the CRASH, and nothing else in this runner claims it', () => {
  // 1 = a refusal or a failed gate, 2 = operator/config, 3 = a leak. Sharing a
  // code would file a crash as one of those — a bug read as a result.
  const codes = [...SRC.matchAll(/process\.exit(?:Code = |\()(\d)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(codes)].sort(), ['1', '2', '3', '4'], 'the runner\'s exit vocabulary changed');
  assert.equal(codes.filter((c) => c === '4').length, 1, 'a second site claims exit 4 — the crash code is no longer distinct');
});

// ── the judge born wrong: compose-time stamp vs the calibration gate ────────
//
// The defect: `judgeModel` handed to `authorCloseForJob` (the STAMP written
// into `closeDecl.calibration.judgeModel`) used to be this authoring run's
// own drafting identity (`MODEL`, always `anthropic-api`'s sonnet) — and the
// calibration gate a few lines below ALSO defaulted to `PROVIDER_NAME`/`MODEL`
// rather than the job's own worker. Both sites agreed with EACH OTHER and
// disagreed with `scripts/run-u.mjs:1144`, which resolves the judge from
// `spec.provider` and the job's real resolved worker model. A job whose
// worker was not `anthropic-api` (DeepSeek via `openai-api`, say) got a close
// calibrated and stamped under one identity and graded, at its first real
// run, against a different one — the recalibration guard's whole job is to
// refuse exactly that.
//
// This is executed, not grep'd: the two exact statements below are extracted
// live out of `scripts/run-author.mjs` — the same `let draftJudge; try {...}`
// block that runs before any paid call, and the same `const judge = judges
// ? ... : null;` the calibration gate reads — and spliced into a real child
// process alongside the actual `resolveJobJudge`/`resolveWorkerModel`
// exports, so a regression here fails on the REAL wired bytes, not a stand-in.
const PROVIDER_CONST_LINE = /^const PROVIDER_NAME = 'anthropic-api';$/m.exec(SRC)?.[0];
const MODEL_CONST_LINE = /^const MODEL = resolveProvider\(PROVIDER_NAME\)\.tiers\.sonnet;$/m.exec(SRC)?.[0];
const DRAFT_JUDGE = /const resolveDraftJudge = [\s\S]*?\nconst draftJudge = resolveDraftJudge\(draft\);/.exec(SRC)?.[0];
const GATE_JUDGE = /const judge = judges\n[\s\S]*?: null;/.exec(SRC)?.[0];
// the STAMP: the actual argument `authorCloseForJob` is called with — extracted
// separately from `DRAFT_JUDGE` because computing the right identity and USING
// it at the call site are two different ways to reintroduce the bug (the
// twin below executes `DRAFT_JUDGE`, but nothing short of reading this exact
// line proves the call site spends it rather than the old `MODEL`).
const AUTHOR_JUDGE_ARG = /\n {4}judgeModel: [^,\n]+,\n/.exec(SRC)?.[0];

test('the judge-identity block is still BOUNDED — the twin below reads exact statements, not the rest of the file', () => {
  assert.ok(PROVIDER_CONST_LINE, 'the authoring provider constant moved or was reworded');
  assert.ok(MODEL_CONST_LINE, 'the authoring model constant moved or was reworded');
  assert.ok(DRAFT_JUDGE, 'the draft-judge resolution moved — this guard no longer reads the code it guards');
  assert.match(DRAFT_JUDGE, /resolveJobJudge\(d, PROVIDER_NAME, resolveWorkerModel\)/, 'the compose-time identity must be resolved from the DRAFT, not the authoring identity');
  assert.match(DRAFT_JUDGE, /resolveDraftJudge\(draft\)/, 'and it must actually be called on the operator\'s draft');
  assert.ok(GATE_JUDGE, 'the calibration gate\'s judge resolution moved — this guard no longer reads the code it guards');
  assert.match(GATE_JUDGE, /resolveJobJudge\(spec, PROVIDER_NAME, resolveWorkerModel\)/, 'the gate must resolve from the assembled SPEC through the same function the stamp uses');
  assert.ok(AUTHOR_JUDGE_ARG, 'the authorCloseForJob call\'s judgeModel argument moved — this guard no longer reads the line it guards');
  assert.equal(AUTHOR_JUDGE_ARG.trim(), 'judgeModel: draftJudge.model,',
    'the compose-time CALL SITE must actually spend the resolved draftJudge, not the authoring MODEL — computing the right '
    + 'identity above and then not using it at the call site is exactly how this defect happened the first time');
});

/**
 * Actually RUN `draftJudge`'s resolution and the gate's `judge` resolution,
 * spliced verbatim out of `scripts/run-author.mjs`, in a real child process
 * against a real `draft` — proving the two live statements, not a
 * paraphrase of them, produce one identity.
 * @param {any} draft
 */
const judgeTwin = (draft) => new Promise((res, reject) => {
  const dir = mkdtempSync(join(twinBase, 'judge-'));
  const file = join(dir, 'judge-twin.mjs');
  writeFileSync(file, [
    `import { resolveJobJudge } from ${JSON.stringify(join(REPO, 'src/judged.js'))};`,
    `import { resolveWorkerModel } from ${JSON.stringify(join(REPO, 'src/job.js'))};`,
    `import { resolveProvider } from ${JSON.stringify(join(REPO, 'src/providers.js'))};`,
    /** @type {string} */ (PROVIDER_CONST_LINE),
    /** @type {string} */ (MODEL_CONST_LINE),
    `const draft = ${JSON.stringify(draft)};`,
    /** @type {string} */ (DRAFT_JUDGE),
    'const judges = true;',
    "const spec = { ...draft, verdictType: 'green', closeDecl: {} };", // the `assembleSpec` fold: provider/model/judge carried through unchanged
    /** @type {string} */ (GATE_JUDGE),
    'console.log(JSON.stringify({ stamp: draftJudge, gate: judge }));',
  ].join('\n'));
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { err += b; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`judge twin exited ${code}\n${err}`));
    try { return res(JSON.parse(out)); } catch (e) { return reject(new Error(`judge twin did not print JSON: ${out}\n${err}`)); }
  });
});

test('a non-anthropic worker: the compose-time stamp and the calibration gate agree with EACH OTHER and with the job\'s real worker', async () => {
  const draft = { provider: 'openai-api' }; // no model, no judge override — DeepSeek via openai-api, item 30.7's secondary provider
  const { stamp, gate } = await judgeTwin(draft);
  // the job's own worker resolves to deepseek-chat (openai-api's only tier) —
  // NOT anthropic's sonnet, which is what the old hardcoded PROVIDER_NAME/MODEL
  // stamped regardless of the draft's own provider.
  assert.deepEqual(stamp, { provider: 'openai-api', model: 'deepseek-chat' });
  assert.deepEqual(gate, stamp, 'the calibration gate must certify the SAME identity the stamp promised — a mismatch is exactly the recalibration refusal this fixes');
});

test('an explicit draft model wins over the provider\'s own tier default, at both sites', async () => {
  const draft = { provider: 'openai-api', model: 'deepseek-reasoner' };
  const { stamp, gate } = await judgeTwin(draft);
  assert.deepEqual(stamp, { provider: 'openai-api', model: 'deepseek-reasoner' });
  assert.deepEqual(gate, stamp);
});

test('a signed judge override wins at both sites, regardless of the worker', async () => {
  const draft = { provider: 'anthropic-api', judge: { provider: 'gemini-api', model: 'gemini-2.5-flash' } };
  const { stamp, gate } = await judgeTwin(draft);
  assert.deepEqual(stamp, { provider: 'gemini-api', model: 'gemini-2.5-flash' });
  assert.deepEqual(gate, stamp);
});

test('the resolved identity matches what scripts/run-u.mjs itself resolves at run time — not just self-agreement', async () => {
  // Mirrors run-u.mjs:300-311's worker-model resolution and its 1144 judge
  // resolution directly (imported live, not re-typed): spec.provider's own
  // provider-table entry, spec.model if named else that provider's tiers.sonnet,
  // then resolveJudge over spec.judge. If the twin above agreed with itself but
  // NOT with this, the close would still be born mismatched from the runner
  // that actually grades it.
  const { resolveProvider } = await import('../src/providers.js');
  const { resolveWorkerModel } = await import('../src/job.js');
  const { resolveJudge } = await import('../src/judged.js');
  const draft = { provider: 'openai-api' };
  const providerEntry = resolveProvider(draft.provider);
  const { model } = resolveWorkerModel({ specModel: draft.model, flagModel: undefined, defaultModel: providerEntry.tiers.sonnet });
  const expected = resolveJudge({ specJudge: draft.judge, workerProvider: draft.provider, workerModel: model });

  const { stamp, gate } = await judgeTwin(draft);
  assert.deepEqual(stamp, expected);
  assert.deepEqual(gate, expected);
});
