// PRD item 31.1 — `hitl` is OFF THE AUTHORING MENU but its code is KEPT.
//
// hamr, 2026-09-09: *"retire hitl from list, keep its code"*, and when the two
// halves of that were shown to collide: *"yeah, if it's not on menu, you can't
// reach it, from menu."* This file is the executable form of that sentence, and
// it exists because BOTH halves are easy to break in opposite directions:
//
//   * lock `hitl` in `LOCKED_CLASSES` and `validateCloseDecl` refuses it
//     (src/declaredclose.js:306) — the runtime, the battery and two whole test
//     files become unreachable. That is not "keeping the code", it is abandoning
//     it in place, and the suite would have to delete the tests that prove it.
//   * leave it on the menu and the product still offers a class it retired at
//     v1.71 and moved to fwdloop (PRD item 29) — which is the bug this closes.
//
// So the guarantee under test has TWO sides and neither is optional:
//   AUTHORING refuses  ·  VALIDATION and the RUNTIME still accept.
//
// The state before this change was not a locked class. It was `runInterview`
// returning `ok:true, refusal:null, reds:0` for a `hitl` pick — an authorable
// job for a class this product no longer closes — because `LOCKED_CLASSES` was
// empty and nothing else read the menu. A source comment at src/authorjob.js:38
// claimed the opposite (*"v1 STILL ADMITS ONLY green"*), which is how the first
// draft of item 31 was written backwards. Hence: this file asserts against the
// RUNNING code, never against prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  runInterview, requiredAnswersFor,
  VERDICT_CLASSES, LOCKED_CLASSES, UNLISTED_CLASSES, MENU_CLASSES, LIVE_CLASSES,
} from '../src/authorjob.js';
import { LOCKED_VERDICTS, VERDICT_TYPES } from '../src/job.js';
import { classGuards } from '../src/authoring.js';

const SCRIPT = new URL('../scripts/run-interview.mjs', import.meta.url).pathname;

/** every required answer for a class, filled in — so a refusal can never be a
 * missing-answer red wearing a refusal's clothes. */
const answersFor = (/** @type {string} */ cls) => Object.fromEntries(
  requiredAnswersFor(cls).map((n) => [n, `an answer for question ${n}`]),
);

// ── the three lists, and what each one MEANS ────────────────────────────────

test('the three class lists are distinct facts, not three spellings of one', () => {
  // LOCKED   — no guard battery exists. Cannot validate, cannot run.
  // UNLISTED — battery exists, validates and RUNS. Never OFFERED.
  // MENU     — what authoring offers = LIVE minus UNLISTED.
  assert.deepEqual([...LOCKED_CLASSES], [], 'nothing is locked today: every class the radio names has a battery');
  assert.deepEqual([...UNLISTED_CLASSES], ['hitl'], 'hitl is off the menu (PRD item 31.1) — and it is the only one');
  assert.deepEqual([...MENU_CLASSES], ['green', 'soft-green'], 'the two shapes bareloop offers: deterministic, and rubric');

  // MENU is a strict subset of LIVE, and the difference is exactly UNLISTED.
  for (const c of MENU_CLASSES) assert.ok(LIVE_CLASSES.includes(c), `${c} is offered, so it must also be runnable`);
  assert.deepEqual(
    LIVE_CLASSES.filter((c) => !MENU_CLASSES.includes(c)).sort(),
    [...UNLISTED_CLASSES].sort(),
    'the ONLY thing separating what runs from what is offered is the unlisted set',
  );
});

test('an unlisted class is NOT locked in the spec validator — that is the whole point of the split', () => {
  // The twin lists still agree, and they still agree on EMPTY. Locking hitl here
  // is what would make its close unvalidatable, so this assertion is the one
  // standing between "kept" and "abandoned in place".
  assert.deepEqual([...LOCKED_CLASSES], [...LOCKED_VERDICTS], 'the spec radio and the authoring surface pin identical');
  assert.ok(!LOCKED_VERDICTS.includes('hitl'), 'a hitl SPEC must still validate — its code is kept, only its offer is withdrawn');
  assert.ok(VERDICT_TYPES.includes('hitl'), 'and the class is still named by the schema');
});

test('hitl still HAS a guard battery — the thing a locked class does not have', () => {
  // `classGuards` is what `validateCloseDecl` checks a close against. A class
  // with no battery must refuse; this proves hitl is not that case, which is why
  // it belongs in UNLISTED and not in LOCKED.
  const g = classGuards({ verdictType: 'hitl', lang: 'js' });
  assert.ok(Array.isArray(g) && g.length > 0, 'hitl has real guards, so a hitl close can still be validated and run');
});

// ── AUTHORING refuses ───────────────────────────────────────────────────────

test('runInterview REFUSES an unlisted class — counted demand, never an authorable job', () => {
  const r = runInterview({ answers: answersFor('hitl'), verdictType: 'hitl', repoPath: '/tmp/anywhere' });
  assert.equal(r.ok, false, 'this is the regression: it returned ok:true before PRD item 31.1');
  assert.equal(r.verdictType, null, 'the class the user picked cannot be honoured, so it is not returned');
  assert.ok(r.refusal, 'and it refuses rather than redding — the demand is COUNTED');
  assert.equal(r.refusal.verb, 'hitl', 'the verb IS the class, so the ledger can attribute the demand');
  assert.equal(r.refusal.path, 'verdictType');
  assert.deepEqual(r.reds, [], 'a refusal is not a red: the answers were all present and valid');
});

test('the unlisted refusal says BUILT-BUT-NOT-OFFERED, never "not built yet" — two different facts', () => {
  const r = runInterview({ answers: answersFor('hitl'), verdictType: 'hitl', repoPath: '/tmp/anywhere' });
  const { detail, options } = r.refusal;
  // The locked sentence ("v1 cannot close that yet", "wait for the rung") would be
  // a LIE here: the class is built, and there is no rung left to wait for.
  assert.doesNotMatch(detail, /cannot close that yet/, 'hitl IS closable — the product just stopped offering it');
  assert.match(detail, /no longer offers/, 'the honest reason: withdrawn, not unbuilt');
  assert.match(detail, /still validates and still runs/, 'and it says the code is kept, which is the ruling');
  assert.match(options.join(' '), /fwdloop/, 'it points at the product that took the class over (PRD item 29)');
  assert.doesNotMatch(options.join(' '), /verdict-classes rung/, 'nothing is waiting on a rung for a class already built');
  for (const c of MENU_CLASSES) assert.match(detail, new RegExp(c), `the refusal names ${c} — the menu it can still have`);
});

test('the classes still ON the menu are untouched by the withdrawal', () => {
  for (const cls of MENU_CLASSES) {
    const r = runInterview({ answers: answersFor(cls), verdictType: cls, repoPath: '/tmp/anywhere' });
    assert.equal(r.ok, true, `${cls} must still author: ${JSON.stringify(r.refusal ?? r.reds)}`);
    assert.equal(r.refusal, null, `${cls} is offered, so nothing refuses it`);
    assert.equal(r.verdictType, cls, 'and the pick is echoed back, never derived');
  }
});

test('an unknown class is still a TYPO red, not a withdrawal refusal — the two never pool', () => {
  const r = runInterview({ answers: {}, verdictType: 'gold-star', repoPath: '/tmp/anywhere' });
  assert.equal(r.ok, false);
  assert.equal(r.refusal, null, 'a typo is not counted demand for a class — nobody asked for "gold-star"');
  assert.ok(r.reds.some((d) => d.path === 'verdictType'), 'it reds on the field instead');
});

// ── the CLI wizard refuses before it asks anything ──────────────────────────

test('run-interview.mjs refuses an unlisted class BEFORE asking a single question', () => {
  const out = mkdtempSync(join(tmpdir(), 'unlisted-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--patient', tmpdir(), '--verdict', 'hitl', '--out', join(out, 'o')], {
      encoding: 'utf8', input: '', env: { ...process.env, ANTHROPIC_API_KEY: '' },
    });
    assert.equal(r.status, 1, 'an off-menu pick is a non-zero exit — the wizard wrote nothing');
    assert.match(r.stdout, /REFUSED \(request-red\)/, 'and it comes back on the counted path');
    assert.match(r.stdout, /verb=hitl/);
    assert.match(r.stdout, /no longer offers/, 'the library\'s own sentence, not a copy in the script');
    assert.match(r.stdout, /Nothing was asked and nothing was written/);
    // the questions themselves must never appear: an interview for a job nothing
    // here can author is the exact waste this gate exists to prevent.
    for (const n of requiredAnswersFor('hitl')) {
      assert.doesNotMatch(r.stdout, new RegExp(`── 1 of ${requiredAnswersFor('hitl').length} `), `question ${n} was asked anyway`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('the wizard usage line offers the MENU, never a class it will refuse', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  const said = `${r.stdout}${r.stderr}`;
  assert.match(said, /--verdict <green\|soft-green>/, 'the usage line is built from MENU_CLASSES');
  assert.doesNotMatch(said, /--verdict <[^>]*hitl/, 'it must not advertise a class it refuses one line later');
});

test('an unlisted class is still admissible INPUT — a typo dies earlier, and differently', () => {
  // The typo check deliberately reads VERDICT_CLASSES (the whole menu), not the
  // offered subset: narrowing it would turn COUNTED DEMAND into an unrecorded
  // typo, and the demand ledger is what the verdict-classes rung reads.
  const r = spawnSync(process.execPath, [SCRIPT, '--patient', tmpdir(), '--verdict', 'not-a-class', '--out', '/tmp/none'], {
    encoding: 'utf8',
  });
  const said = `${r.stdout}${r.stderr}`;
  assert.match(said, /is not a verdict class/, 'a typo is refused as a typo');
  assert.doesNotMatch(said, /REFUSED \(request-red\)/, 'and it never reaches the counted-demand path');
  assert.ok(VERDICT_CLASSES.includes('hitl'), 'while hitl stays a real class name, so it reaches that path');
});
