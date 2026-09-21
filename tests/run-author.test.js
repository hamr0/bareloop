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
import {
  readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { capStop } from '../src/text.js';
import { prepareSource } from '../src/source.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = readFileSync(join(REPO, 'scripts/run-author.mjs'), 'utf8');

/** `archiveGateAudit`'s own catch: from its `try {` to the brace that closes the
 * whole arrow function, so the guard below reads only this one catch, never the
 * rest of the file. */
const ARCHIVE_CATCH = /const archiveGateAudit = \(\) => \{[\s\S]*?\n\};\n/.exec(SRC)?.[0];

// CLAUDE.md forbids `as any` / `@type {any}` casts anywhere in the repo.
// archiveGateAudit's rename-failure catch (commit 3596f2b, F186) had one:
// `/** @type {any} */ (e)?.message`. Fixed to narrow via NodeJS.ErrnoException,
// matching the local idiom (src/ralph.js:252).
test('archiveGateAudit narrows its catch error without an `any` cast (CLAUDE.md forbids `as any`/`@type {any}`)', () => {
  assert.ok(ARCHIVE_CATCH, 'archiveGateAudit moved or was renamed — this guard no longer reads the code it guards');
  assert.ok(!/@type \{any\}/.test(ARCHIVE_CATCH), 'an `any` cast is back in archiveGateAudit\'s catch');
  assert.match(ARCHIVE_CATCH, /NodeJS\.ErrnoException/, 'the error should be narrowed via NodeJS.ErrnoException, the repo\'s existing idiom (src/ralph.js)');
});

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
  assert.ok(start < tryAt, 'author-start emits BEFORE the try opens — a crash would have no spine to land in');
  // and the paid call itself is inside it
  assert.ok(SRC.indexOf('authorCloseForJob({') > tryAt, 'the paid call sits outside the catch');
});

// F191 — the net USED TO start ~300 lines after `author-start` (right before
// the repo-shaped `authorCloseForJob` call), leaving a real gap: everything
// in between (the plain-folder confirm turn, among it) could throw with only
// `author-start` on the spine and nothing saying the run had died. Live run
// `mu4hc7sp` hit exactly that gap. This proves the net now starts
// IMMEDIATELY after `author-start` — allowing only blank lines and comments
// between them, never executable code that could throw uncaught.
test('F191: the crash net starts IMMEDIATELY after author-start — no gap of executable code in between', () => {
  const start = SRC.indexOf("emit('author-start'");
  assert.ok(start !== -1);
  const afterStart = SRC.indexOf('\n', start) + 1;
  const between = SRC.slice(afterStart, SRC.indexOf('\ntry {\n', afterStart) + 1);
  // strip line comments, block comments, and the two bindings that MUST be
  // hoisted here (a plain `let`/`const` declaration with no call on its right
  // side — nothing that can throw) — anything left over is a gap.
  const codeOnly = between
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*let rl;\s*$/m, '')
    .replace(/^\s*const metered = \[\];\s*$/m, '')
    .trim();
  assert.equal(codeOnly, '', `only comments and the two hoisted bindings may sit between author-start and the try — found: ${JSON.stringify(codeOnly.slice(0, 200))}`);
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

// F191 — the net now starts before any paid call can have happened (right
// after author-start), so "died inside the paid span" is a claim that can be
// FALSE the moment the net covers a $0-only stop. The message must say which
// happened, honestly, off the run's own metered list.
test('F191: the crash message is truthful about whether anything was ever paid for', () => {
  assert.ok(CATCH);
  assert.match(CATCH, /died \$\{metered\.length \? 'inside the paid span' : 'before any paid call'\}/,
    'the crash message must read the real metered list, never a fixed claim baked into the string');
  assert.doesNotMatch(CATCH, /died inside the paid span\. Nothing was signed/,
    'the old fixed wording ("died inside the paid span", unconditionally) must be gone');
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

/** the progress/cost/kill region: from `costSoFar` to the close of the signal
 * loop. INDENT-ANCHORED at both ends (`\n}` at column 0), the same lesson the
 * governance block above already paid for. F191 moved `const metered = [];`
 * itself OUTSIDE the try (hoisted alongside `rl`, for the same
 * catch/finally-is-a-sibling reason) — this region starts one declaration
 * later than it used to, right after that hoist, so it never swallows the
 * bare `try {` that now sits between them. */
const KILL = /const costSoFar = \(\)[\s\S]*?\n\}\n/.exec(SRC)?.[0];
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
    // hoisted OUTSIDE the try in the real file (F191) — declared here in the
    // test's own ~10 lines of scaffolding for the same reason.
    'const metered = [];',
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
// PRD item 34 L17: the authoring provider is no longer a hardcoded literal —
// it is resolved from the DRAFT's own `provider` field, the same block that
// dies loud on a missing/unresolvable one. Extracted whole (`let providerEntry;`
// through the `baseUrl` line that closes it) so the twin below runs the REAL
// resolution, not a re-typed stand-in of it.
const PROVIDER_BLOCK = /\nconst providerEntry = \(\(\) => \{\n[\s\S]*?\nconst baseUrl = typeof draft\?\.baseUrl === 'string' \? draft\.baseUrl : undefined;\n/.exec(SRC)?.[0];
const DRAFT_JUDGE = /const resolveDraftJudge = [\s\S]*?\nconst draftJudge = resolveDraftJudge\(draft\);/.exec(SRC)?.[0];
const GATE_JUDGE = /const judge = judges\n[\s\S]*?: null;/.exec(SRC)?.[0];
// the STAMP: the actual argument `authorCloseForJob` is called with — extracted
// separately from `DRAFT_JUDGE` because computing the right identity and USING
// it at the call site are two different ways to reintroduce the bug (the
// twin below executes `DRAFT_JUDGE`, but nothing short of reading this exact
// line proves the call site spends it rather than the old `MODEL`).
const AUTHOR_JUDGE_ARG = /\n {4}judgeModel: [^,\n]+,\n/.exec(SRC)?.[0];

test('the judge-identity block is still BOUNDED — the twin below reads exact statements, not the rest of the file', () => {
  assert.ok(PROVIDER_BLOCK, 'the authoring provider resolution moved or was reworded');
  assert.match(PROVIDER_BLOCK, /resolveProvider\(draft\?\.provider\)/, 'the provider must be resolved from the DRAFT, never a hardcoded literal (item 34 L17)');
  assert.ok(!/'anthropic-api'/.test(PROVIDER_BLOCK), 'a forced anthropic-api literal is back in the provider resolution');
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
    // `die` is referenced only inside the provider block's catch arm, never
    // called by any draft this twin is fed (every draft below names a real
    // provider) — a no-op stand-in keeps that arm syntactically reachable
    // without pulling in the real script's process.exit.
    'const die = (m) => { throw new Error(m); };',
    `const draft = ${JSON.stringify(draft)};`,
    /** @type {string} */ (PROVIDER_BLOCK),
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
  // the job's own worker resolves to deepseek-flash (openai-api's only tier) —
  // NOT anthropic's sonnet, which is what the old hardcoded PROVIDER_NAME/MODEL
  // stamped regardless of the draft's own provider.
  assert.deepEqual(stamp, { provider: 'openai-api', model: 'deepseek-flash' });
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

// ── F190: the judge provider was built without the job's baseUrl ───────────
//
// Live run `mu4hec9u` (`docs/logs/FINDINGS.md`): a DeepSeek job's judge call
// (`judged-locate:pass-arith-sum`) went to `openai-api`'s DEFAULT host
// carrying a DeepSeek key and model id, because the judge provider was
// constructed as `makeProvider(judge.provider, { apiKey, model })` — no
// `baseUrl` — while the AUTHOR provider a few hundred lines earlier already
// forwarded it correctly. The call failed and returned null; the spine
// recorded `costUsd: null, unpricedRounds: 0` — the `r === null` branch, not
// an unpriced round — and the run died `pricing-red` with 0 of 10
// calibration cases graded.
//
// **2026-09-21 update.** The original fix (commit 56bbee8) hand-copied
// `scripts/run-u.mjs`'s same-provider conditional a SECOND time. Routed
// through the ONE owner now (`buildRunnerProviders`, `src/providers.js`,
// already `src/cli.js`'s own construction seam) — both the author provider
// and this judge provider go through it. This twin extracts the ACTUAL
// `judgeProvider` construction statement out of `scripts/run-author.mjs` and
// runs it in a real child process against the REAL `buildRunnerProviders`/
// `resolveProvider` (`src/providers.js`) — so it proves the constructed
// provider's own `.baseUrl` property, not a re-typed paraphrase of the
// conditional.
const JUDGE_PROVIDER_ARG = /const judgeProvider = judge\n[\s\S]*?\n {8}: null;/.exec(SRC)?.[0];
// the author's OWN provider construction (a few hundred lines earlier) —
// asserted UNCHANGED: this fix touches only the judge seam, and a regression
// here (e.g. someone "fixing" the author line too, or dropping its own
// baseUrl forwarding) would be an unrelated, unreviewed change to a call site
// this finding never named as broken.
const AUTHOR_PROVIDER_LINE = /const \{ provider \} = buildRunnerProviders\(\{[\s\S]*?\n\}\);/.exec(SRC)?.[0];

test('the judge-provider construction statement is still BOUNDED, and the author provider line is untouched', () => {
  assert.ok(JUDGE_PROVIDER_ARG, 'the judgeProvider construction moved or was reworded — this guard no longer reads the code it guards');
  assert.match(JUDGE_PROVIDER_ARG, /buildRunnerProviders\(\{/, 'the judge provider must be routed through the one owner, not a hand-rolled makeProvider call');
  assert.match(JUDGE_PROVIDER_ARG, /judgeBaseUrl: judge\.provider === PROVIDER_NAME \? baseUrl : undefined/,
    'the same-provider conditional (mirroring scripts/run-u.mjs) is gone from the judge provider construction');
  assert.ok(AUTHOR_PROVIDER_LINE, 'the author provider construction line moved or was reworded — F190 must not have touched this call site');
  assert.match(AUTHOR_PROVIDER_LINE, /buildRunnerProviders\(\{/, 'the author provider must also be routed through the one owner (F190, 2026-09-21)');
});

/**
 * Actually CONSTRUCT a judge provider through the real `judgeProvider`
 * statement spliced out of `scripts/run-author.mjs`, in a real child process
 * against the real `buildRunnerProviders`/`resolveProvider`
 * (`src/providers.js`), and report the constructed instance's own `.baseUrl`
 * (every table entry — anthropic-api/openai-api/gemini-api — reads its
 * endpoint into that exact property; see `src/providers.js`'s table-comment).
 * `judgeKeyFor`/`apiKey` are stubbed (fixed fake strings, deliberately
 * DIFFERENT from each other) because key RESOLUTION is F181's concern, not
 * this one — only the endpoint the constructed client ends up holding is at
 * issue. `providerEntry`/`MODEL` are resolved the same way the real script
 * resolves them (`resolveProvider(PROVIDER_NAME)`, `.tiers.sonnet`) — never a
 * hand-picked pair that could drift from what `run-author.mjs` itself does.
 * @param {{judgeProvider: string, judgeModel: string, providerName: string, authorBaseUrl: string|undefined}} args
 */
const providerTwin = ({
  judgeProvider, judgeModel, providerName, authorBaseUrl,
}) => new Promise((res, reject) => {
  const dir = mkdtempSync(join(twinBase, 'provider-'));
  const file = join(dir, 'provider-twin.mjs');
  writeFileSync(file, [
    `import { buildRunnerProviders, resolveProvider } from ${JSON.stringify(join(REPO, 'src/providers.js'))};`,
    "const judgeKeyFor = () => 'fake-judge-key';",
    `const judge = ${JSON.stringify({ provider: judgeProvider, model: judgeModel })};`,
    `const PROVIDER_NAME = ${JSON.stringify(providerName)};`,
    "const apiKey = 'fake-author-key';",
    'const providerEntry = resolveProvider(PROVIDER_NAME);',
    'const MODEL = providerEntry.tiers.sonnet;',
    `const baseUrl = ${authorBaseUrl === undefined ? 'undefined' : JSON.stringify(authorBaseUrl)};`,
    /** @type {string} */ (JUDGE_PROVIDER_ARG),
    'console.log(JSON.stringify({ baseUrl: judgeProvider.baseUrl }));',
  ].join('\n'));
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { err += b; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`provider twin exited ${code}\n${err}`));
    try { return res(JSON.parse(out)); } catch (e) { return reject(new Error(`provider twin did not print JSON: ${out}\n${err}`)); }
  });
});

test('F190: same-provider judge receives the AUTHOR\'s baseUrl (the mu4hec9u defect, fixed)', async () => {
  const { baseUrl } = await providerTwin({
    judgeProvider: 'openai-api', judgeModel: 'deepseek-flash', providerName: 'openai-api',
    authorBaseUrl: 'https://api.deepseek.com/v1',
  });
  assert.equal(baseUrl, 'https://api.deepseek.com/v1',
    'same-provider judge must receive the author\'s own baseUrl — this is the exact live defect (run mu4hec9u): '
    + 'without it, a DeepSeek key was sent to openai-api\'s default host');
});

test('F190: a DIFFERENT judge provider never inherits the author\'s baseUrl — it gets its OWN default host', async () => {
  const { baseUrl } = await providerTwin({
    judgeProvider: 'gemini-api', judgeModel: 'gemini-2.5-flash', providerName: 'anthropic-api',
    authorBaseUrl: 'https://api.deepseek.com/v1',
  });
  assert.notEqual(baseUrl, 'https://api.deepseek.com/v1',
    'a different vendor must never be pointed at the author\'s endpoint — this is the exact silent-misconfiguration endpointKey exists to prevent');
  assert.match(baseUrl, /^https:\/\/.*google/i, 'gemini-api\'s own default host, untouched by the author\'s baseUrl');
});

// ── --provider comes from the DRAFT, at $0, before any paid call ────────────
//
// PRD item 34 L17 deleted the forced `PROVIDER_NAME = 'anthropic-api'` — the
// scout's and drafter's identity is resolved from the draft's OWN `provider`
// field. The die-loud path fires BEFORE the scout, before `apiKey` is even
// checked, so this is provable with a real spawned process for $0: no key is
// exported, and a real run never reaches the paid span.
const SCRIPT = join(REPO, 'scripts/run-author.mjs');
const runBase = mkdtempSync(join(tmpdir(), 'run-author-cli-'));
process.on('exit', () => rmSync(runBase, { recursive: true, force: true }));
let n = 0;

/** the same neutralized identity `src/source.js`/`tests/source.test.js` use — CI
 * has no gitconfig (F136: hermetic, empty `HOME`). */
const GIT_ID = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', '-c', 'commit.gpgsign=false'];
/** @param {string} cwd @param {string[]} args */
const gitFix = (cwd, args) => execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' });

/** `--source` REPLACED `--patient` (PRD item 33 M3, ruling 2): every call site
 * below must hand `run-author.mjs` a PREPARED tree, never a raw repo path — a
 * small, fast, real git repo (never the whole `REPO`) is prepared ONCE here
 * and reused, since none of these tests care about its content, only that
 * language detection resolves 'js' and the manifest says kind 'repo'. */
const provisionRepo = mkdtempSync(join(runBase, 'provision-'));
writeFileSync(join(provisionRepo, 'package.json'), '{}');
gitFix(provisionRepo, ['init', '-q']);
gitFix(provisionRepo, ['add', '-A']);
gitFix(provisionRepo, ['commit', '-q', '-m', 'seed']);
const provisioned = await prepareSource({ source: provisionRepo, into: join(runBase, 'provision-into') });
assert.equal(provisioned.stop, null, provisioned.stop ?? undefined);
const PREPARED_TREE = provisioned.tree;

/** @param {Record<string, unknown>} draft */
const runAuthor = (draft) => {
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  writeFileSync(draftFile, JSON.stringify(draft));
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', PREPARED_TREE, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' } });
  return { code: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

test('a draft with no provider field dies loud, at $0, before any paid call', () => {
  const r = runAuthor({});
  assert.equal(r.code, 2);
  assert.match(r.text, /unknown provider/);
  assert.doesNotMatch(r.text, /== close-authoring, run/, 'the header (and the spine it opens) must never print — this dies before either exists');
});

test('a draft naming a provider the factory does not know dies the same way, naming the known table', () => {
  const r = runAuthor({ provider: 'made-up-vendor' });
  assert.equal(r.code, 2);
  assert.match(r.text, /unknown provider "made-up-vendor"/);
  assert.match(r.text, /Known providers: anthropic-api, openai-api, gemini-api/);
});

test('there is no --provider FLAG on this script — the provider comes only from the draft', () => {
  assert.doesNotMatch(SRC, /arg\('provider'\)/, 'run-author must never read its own --provider flag; run-interview owns that ask');
});

// ── --source REPLACES --patient (PRD item 33 M3, ruling 2) ──────────────────

test('--patient is refused, loud — --source replaced it', () => {
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  writeFileSync(draftFile, '{}');
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--patient', PREPARED_TREE, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  assert.equal(r.status, 2);
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.match(text, /--patient is no longer a flag/);
  assert.match(text, /use --source <tree>/);
  assert.equal(existsSync(out), false);
});

test('--source that was never prepared through the source front door dies loud, naming the exact command to fix it', () => {
  const unprepared = mkdtempSync(join(runBase, 'unprepared-'));
  writeFileSync(join(unprepared, 'package.json'), '{}');
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  writeFileSync(draftFile, '{}');
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', unprepared, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  assert.equal(r.status, 2);
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.match(text, /was never prepared through the source front door/);
  assert.match(text, /node scripts\/prep-source\.mjs --source <path-or-url> --into <dir>/, 'the exact command to run first is quoted');
  assert.match(text, /--source <dir>\/tree/);
  // no spine was ever opened — this is a config error, same standing as every
  // other argv/config die() in this script
  assert.equal(existsSync(out) && readdirSync(out).some((f) => f.startsWith('author-')), false);
});

// PRD item 33 M3 piece 4, step S6 (D5 = A): the "no checks yet" stop MOVED
// from before the key check to after the confirm turn — a plain-folder job
// now needs a real provider connection (the confirm turn is paid) before it
// can even reach that stop. This suite pays for nothing, so the far side of
// that move (the confirm turn actually running, and the stop landing after
// it) is unit-tested on `runConfirmTurn` directly (confirmturn.test.js) and
// pinned from source below — what THIS test proves at $0 is that the stop
// genuinely no longer fires before the key gate.
test('a --source prepared from a NON-repo (a plain folder), with a valid provider but no key, now dies at the API KEY CHECK — the old early stop is gone', async () => {
  const folder = mkdtempSync(join(runBase, 'plain-folder-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const prep = await prepareSource({ source: folder, into: join(runBase, `plain-into-${n += 1}`) });
  assert.equal(prep.stop, null, prep.stop ?? undefined);
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  // a REAL provider is needed to reach the key check at all — the old fixture's
  // empty draft ('{}') died even earlier (unknown provider) once the plain-folder
  // stop moved past provider resolution
  writeFileSync(draftFile, JSON.stringify({ provider: 'anthropic-api' }));
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', prep.tree, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' } });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 2, text);
  assert.match(text, /ANTHROPIC_API_KEY not set/);
  assert.doesNotMatch(text, /bareloop has no checks for this kind/, 'the old early stop must not fire before the key check any more');
  // no spine FILE at all — `appendFileSync` inside `emit` creates it lazily on
  // its first write, and `author-start` (the first emit in this file) fires
  // AFTER the key check, so nothing ever wrote to it
  const spineFiles = readdirSync(out).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl'));
  assert.equal(spineFiles.length, 0, 'no event ever reached the spine before the key gate — the file was never created');
});

// F181 — a key that IS set (so the presence check above passes) but carries
// an embedded line break must refuse at $0, before any provider is
// constructed and before any spine record exists — never crash mid-call.
// Dummy value only ("sk-test\nmeta"), never a real secret shape.
test('a key with an embedded newline refuses at $0 — before any spine record exists', async () => {
  const folder = mkdtempSync(join(runBase, 'plain-folder-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const prep = await prepareSource({ source: folder, into: join(runBase, `plain-into-${n += 1}`) });
  assert.equal(prep.stop, null, prep.stop ?? undefined);
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  writeFileSync(draftFile, JSON.stringify({ provider: 'anthropic-api' }));
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', prep.tree, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env, ANTHROPIC_API_KEY: 'sk-test\nmeta', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    },
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 2, text);
  assert.match(text, /ANTHROPIC_API_KEY contains a line break/);
  assert.doesNotMatch(text, /sk-test/, 'the key value itself must never be echoed');
  const spineFiles = readdirSync(out).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl'));
  assert.equal(spineFiles.length, 0, 'no event ever reached the spine before the key gate — the file was never created');
});

// F191 (docs/logs/FINDINGS.md) — a REAL end-to-end run, past the key gate,
// proving the plain-folder stop at $0 with a valid-shaped (but fake) key: no
// provider is ever constructed against the network on this path (the stop
// fires before any model call), so a fake key never gets used for real and
// this test pays nothing.
test('F191: a plain-folder source stops immediately at $0 — author-start then author-end, no scout, no confirm turn, no model call', async () => {
  const folder = mkdtempSync(join(runBase, 'plain-folder-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const prep = await prepareSource({ source: folder, into: join(runBase, `plain-into-${n += 1}`) });
  assert.equal(prep.stop, null, prep.stop ?? undefined);
  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  writeFileSync(draftFile, JSON.stringify({ provider: 'anthropic-api' }));
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', prep.tree, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env, ANTHROPIC_API_KEY: 'sk-fake-never-used', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    },
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 1, text);
  assert.match(text, /This is a plain folder, not a code project\. bareloop can't check this kind of job yet\. Nothing was spent\. Your source was not changed\./);
  const spineFiles = readdirSync(out).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl'));
  assert.equal(spineFiles.length, 1);
  const events = readFileSync(join(out, spineFiles[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(events.map((e) => e.type), ['author-start', 'job-red', 'author-end'],
    'exactly author-start, the request-red, then author-end — no author-phase, no author-cost: nothing was ever metered');
  assert.equal(events.at(-1).outcome, 'not-authored');
  assert.equal(events.at(-1).stop, 'non-code-source');
  const authored = JSON.parse(readFileSync(join(out, 'authored.json'), 'utf8'));
  assert.equal(authored.ok, false);
  assert.equal(authored.confirmed, null);
  assert.equal(authored.stop, 'non-code-source');
  assert.equal(authored.cost, null, 'not metered — this path never reached a model call');
});

// The far side of the move — pinned from SOURCE, for the same reason the
// governance/kill/sign blocks above are: it is reachable only past a real
// key and a real model call, which this suite never pays for.
const PLAIN_FOLDER_BLOCK = /if \(!IS_REPO_SOURCE\) \{[\s\S]*?\n\}\n/.exec(SRC)?.[0];

test('the plain-folder branch is still BOUNDED — this guard reads the branch, not the rest of the file', () => {
  assert.ok(PLAIN_FOLDER_BLOCK, 'the plain-folder branch moved — this guard no longer reads the code it guards');
  assert.ok(!/authorCloseForJob/.test(PLAIN_FOLDER_BLOCK), 'the plain-folder branch must never run the repo-shaped authorCloseForJob');
});

// F191 (2026-09-21): the confirm turn over a plain folder is GONE — it is
// unreachable by construction (a plain folder has no code language, and
// `classGuards`/`confirmProtections` throws without one; live run
// `mu4hc7sp` crashed inside exactly that). The stop now fires immediately,
// at $0, with no scout and no model call at all.
test('a plain-folder job runs NO SCOUT and NO CONFIRM TURN — the stop is immediate, at $0, no model call', () => {
  assert.ok(PLAIN_FOLDER_BLOCK);
  assert.doesNotMatch(PLAIN_FOLDER_BLOCK, /runAuthorScout|scoutFn/, 'no scout for a plain folder (D5) — its register is code-only');
  assert.doesNotMatch(PLAIN_FOLDER_BLOCK, /runConfirmTurn\(/, 'F191 — the confirm turn is unreachable for a plain folder (no language for classGuards) and must never run here');
  assert.doesNotMatch(PLAIN_FOLDER_BLOCK, /confirmGenerate|generate:/, 'no model boundary is ever touched on this path');
});

test('the plain-folder branch has exactly ONE exit, and it is the honest $0 stop — never a fall-through into the repo-shaped flow', () => {
  assert.ok(PLAIN_FOLDER_BLOCK);
  const exits = [...PLAIN_FOLDER_BLOCK.matchAll(/process\.exit\(1\)/g)].length;
  assert.equal(exits, 1, `F191's stop is the ONLY way out of this branch now — no confirm turn, no second path (saw ${exits})`);
});

test('the plain-folder "no checks yet" stop is still named request-red/non-code-source, and reaches author-end with zero provider calls', () => {
  assert.ok(PLAIN_FOLDER_BLOCK);
  assert.match(PLAIN_FOLDER_BLOCK, /code: 'request-red', path: 'source', verb: 'non-code-source', lib: 'bareloop',/);
  assert.match(PLAIN_FOLDER_BLOCK, /outcome: 'not-authored', stop: 'non-code-source'/);
  assert.match(PLAIN_FOLDER_BLOCK, /This is a plain folder, not a code project\. bareloop can't check this kind of /,
    'the exact person-facing text F191 specifies');
  assert.match(PLAIN_FOLDER_BLOCK, /Nothing was spent\. Your source was not changed\./);
});

// ── PRD item 33 M3 piece 4, step S4 — run-author.mjs becomes INTERACTIVE ────
//
// The confirm turn (`runConfirmTurn`, via `authorCloseForJob`) is this
// script's one interactive seam. Pinned from SOURCE for the same reason the
// blocks above are: the wiring is reachable only after a real scout and a
// real model call, which this suite never pays for.

test('ambiguous language no longer dies — it travels through as langResult, for the confirm turn\'s own $0 ask (D7)', () => {
  assert.ok(!/langResult\.kind === 'ambiguous'\) \{\s*\n\s*die\(/.test(SRC),
    'an ambiguous-language die() came back — the confirm turn (D7) is what asks this now, before the scout');
  assert.match(SRC, /langResult\.kind === 'ambiguous' \? langResult\.candidates\[0\]/,
    'LANG needs a placeholder for the ambiguous case — the person\'s real pick lands in closeDecl.lang via the confirm turn');
});

test('the confirm turn is wired into the authorCloseForJob call: ask, its OWN confirmGenerate, isRepo, langResult', () => {
  const CALL = /const authored = await authorCloseForJob\(\{[\s\S]*?\n {2}\}\);/.exec(SRC)?.[0];
  assert.ok(CALL, 'the authorCloseForJob call moved — this guard no longer reads the code it guards');
  assert.match(CALL, /\bask, confirmGenerate, isRepo: true, langResult,/);
  // the confirm turn's model boundary must be its OWN — bound to CONFIRM_SYSTEM,
  // never the authoring `generate` (bound to AUTHOR_SYSTEM); reusing `generate`
  // would run the wrong system prompt silently
  assert.match(SRC, /const confirmGenerate = makeLoopGenerate\(provider, \{ system: CONFIRM_SYSTEM \}\);/);
  assert.doesNotMatch(CALL, /confirmGenerate: generate\b/, 'the confirm turn must never reuse the AUTHOR_SYSTEM-bound generate');
});

test('rl.close() runs in a finally around the whole paid span — never inline at one exit path only', () => {
  const finallyBlock = /\} finally \{[\s\S]*?\n\}\n/.exec(SRC)?.[0];
  assert.ok(finallyBlock, 'no finally block follows the crash catch');
  assert.match(finallyBlock, /rl\.close\(\)/);
  assert.match(finallyBlock, /catch \{/, 'closing the interactive seam must not crash the readout it follows (F70)');
});

test('the confirm turn\'s accepted goal lands on the DRAFT before assembleSpec — goal stays an operator field (D2)', () => {
  const idx = SRC.indexOf('authored.confirmed?.goal');
  const assembleAt = SRC.indexOf('const spec = assembleSpec(draft, authored);');
  assert.ok(idx !== -1 && assembleAt !== -1 && idx < assembleAt,
    'draft.goal must be set from the confirm turn\'s accepted goal BEFORE assembleSpec reads the draft');
  assert.match(SRC, /draft\.goal = redactSecrets\(String\(authored\.confirmed\.goal\)\);/);
});

test('the signing readout prints the confirm turn\'s open questions (D4: the signed spec format itself is unchanged)', () => {
  assert.match(SRC, /openQuestionLines\(authored\.confirmed\)/);
  const specAt = SRC.indexOf('const specFile = writeOut');
  const idx = SRC.indexOf('openQuestionLines(authored.confirmed)');
  assert.ok(specAt !== -1 && idx > specAt, 'the open questions print in the signing readout, not before the spec is written');
});

test('F175 open half: the signing readout also prints the questions the person ANSWERED inline, beside the open ones', () => {
  assert.match(SRC, /answeredQuestionLines\(authored\.confirmed\)/);
  const specAt = SRC.indexOf('const specFile = writeOut');
  const idx = SRC.indexOf('answeredQuestionLines(authored.confirmed)');
  assert.ok(specAt !== -1 && idx > specAt, 'the answered questions print in the signing readout, not before the spec is written');
});

test('run-author.mjs\'s ask seam has a `kind: \'answer\'` branch (F175 open half) that shows the question, its index/total, and reads free text', () => {
  const branch = /if \(step\.kind === 'answer'\) \{[\s\S]*?\n {2}\}/.exec(SRC)?.[0];
  assert.ok(branch, 'no kind: "answer" branch found in the ask seam');
  assert.match(branch, /step\.question/);
  assert.match(branch, /step\.index/);
  assert.match(branch, /step\.total/);
  assert.match(branch, /readFreeText\(false\)/, 'a blank answer must re-ask, same as every other required free-text step');
});

test('confirm-abandoned and confirm-restart get their own friendlier console line, and both still reach author-end via the generic stop', () => {
  assert.match(SRC, /authored\.stop === 'confirm-abandoned' \|\| authored\.stop === 'confirm-restart'/);
  const NOT_AUTHORED = /if \(!authored\.ok\) \{[\s\S]*?\n {2}\}/.exec(SRC)?.[0];
  assert.ok(NOT_AUTHORED);
  assert.match(NOT_AUTHORED, /emit\('author-end', \{ outcome: 'not-authored', stop: authored\.stop \}\);/,
    'confirm-abandoned/confirm-restart fall through this generic branch — author-end records the real stop either way');
});

// ── install-gap refusal (PRD item 33 close-out, hamr's ruling 2026-09-14) ───
// `prepareSource` copies only git-tracked files, so a JS/TS repo's copy never
// carries `node_modules`. run-author.mjs must refuse at $0 — before the scout,
// before even the provider/key gates below it in the file — naming the exact
// command, and it must be routed through the SAME `refusalEvents()` channel
// `language-unsupported` uses (a real `job-red`/`escalation` pair on the
// spine), never an ad-hoc print.

test('a --source prepared from a repo whose package.json lists dependencies with no node_modules refuses source-deps-missing, at $0, before the provider/key gates', async () => {
  const depsRepo = mkdtempSync(join(runBase, 'deps-repo2-'));
  writeFileSync(join(depsRepo, 'package.json'), JSON.stringify({ dependencies: { left: '1.0.0' } }));
  gitFix(depsRepo, ['init', '-q']);
  gitFix(depsRepo, ['add', '-A']);
  gitFix(depsRepo, ['commit', '-q', '-m', 'seed']);
  const prep = await prepareSource({ source: depsRepo, into: join(runBase, `deps-into-${n += 1}`) });
  assert.equal(prep.stop, null, prep.stop ?? undefined);

  const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
  const answersFile = join(dir, 'answers.json');
  const draftFile = join(dir, 'specdraft.json');
  writeFileSync(answersFile, '{}');
  // no `provider` field at all — proves this refusal fires BEFORE provider
  // resolution (which would otherwise die 'unknown provider' first)
  writeFileSync(draftFile, '{}');
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [
    SCRIPT, '--source', prep.tree, '--answers', answersFile, '--draft', draftFile,
    '--verdict', 'green', '--out', out,
  ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' } });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.equal(r.status, 1, text);
  assert.match(text, /REFUSED \(request-red\)  verb=source-deps-missing/);
  assert.match(text, /npm ci|npm install/, 'the exact install command is named');
  assert.doesNotMatch(text, /unknown provider/, 'this must refuse BEFORE the provider is even resolved');
  assert.doesNotMatch(text, /== close-authoring, run/, 'no scout header — no paid span was ever entered');

  const spineFiles = readdirSync(out).filter((f) => f.startsWith('author-') && f.endsWith('.jsonl'));
  assert.equal(spineFiles.length, 1, 'the $0 refusal is still counted admission demand — it writes to the spine');
  const lines = readFileSync(join(out, spineFiles[0]), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((e) => e.type === 'job-red' && e.verb === 'source-deps-missing'));
  assert.ok(lines.some((e) => e.type === 'escalation' && e.category === 'close-unauthorable'));
});

test('a --source prepared from a repo whose deps ARE already installed never refuses source-deps-missing', async () => {
  const nmRepo = mkdtempSync(join(runBase, 'deps-repo-havenm-'));
  writeFileSync(join(nmRepo, 'package.json'), JSON.stringify({ dependencies: { left: '1.0.0' } }));
  mkdirSync(join(nmRepo, 'node_modules', 'left'), { recursive: true });
  writeFileSync(join(nmRepo, 'node_modules', 'left', 'index.js'), 'module.exports = 1;\n');
  gitFix(nmRepo, ['init', '-q']);
  gitFix(nmRepo, ['add', '-A']);
  gitFix(nmRepo, ['commit', '-q', '-m', 'seed']);
  const prep = await prepareSource({ source: nmRepo, into: join(runBase, `havenm-into-${n += 1}`) });
  assert.equal(prep.stop, null, prep.stop ?? undefined);

  const r = (() => {
    const dir = mkdtempSync(join(runBase, `cli-${n += 1}-`));
    const answersFile = join(dir, 'answers.json');
    const draftFile = join(dir, 'specdraft.json');
    writeFileSync(answersFile, '{}');
    writeFileSync(draftFile, '{}'); // still no provider — reaches the SAME 'unknown provider' die either way
    const out = join(dir, 'out');
    return spawnSync(process.execPath, [
      SCRIPT, '--source', prep.tree, '--answers', answersFile, '--draft', draftFile,
      '--verdict', 'green', '--out', out,
    ], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' } });
  })();
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.doesNotMatch(text, /source-deps-missing/);
  assert.match(text, /unknown provider/, 'falls through to the next $0 gate exactly as it would without this build');
});
