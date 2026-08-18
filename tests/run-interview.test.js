// THE INTERACTIVE INTERVIEW (scripts/run-interview.mjs) — the front door.
//
// The library half is a pure function with no terminal in it (`runInterview`,
// src/authorjob.js, D10) and it is tested as one. What these cover is the SCRIPT:
// that the frozen questions reach a person BYTE FOR BYTE and in order, that a blank
// answer is re-asked rather than accepted, that a locked class refuses through the
// library before a single question is asked, that what lands on disk is the shape
// `run-author.mjs` consumes — and that every refusal happens for $0, before the
// paid step is even offered.
//
// The instrument is the REAL script with a SCRIPTED stdin: it never reads a key and
// never spawns the paid child (every scenario answers the final offer with "n" or
// ends input, and the default is no). Nothing here talks to a provider.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// the LIBRARY's own frozen sets — the expectations below are DERIVED from them, so a
// question that is ever re-worded moves the test with it instead of leaving a stale
// literal that passes while the person is asked something else
import { questionsFor, requiredAnswersFor, VERDICT_CLASSES, LOCKED_CLASSES, AUTHORED_SPEC_FIELDS } from '../src/authorjob.js';

const SCRIPT = new URL('../scripts/run-interview.mjs', import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), 'run-interview-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a fresh out dir per scenario, so "nothing was written" is a real assertion */
const outDir = () => join(base, `out-${n += 1}`);

/**
 * Drive the real script with a scripted stdin. `lines` are typed one per line; a
 * free-text answer is ended by an empty string, exactly as a person ends one with a
 * blank line.
 * `key` is the SHELL's state, not a value this script ever reads: it gates
 * whether the paid-step offer is put at all, and the default is unkeyed. The
 * scenarios that set one use a value no provider would accept — nothing here
 * talks to a provider, and every keyed scenario still answers the offer "n".
 * @param {{verdict?: string, patient?: string, out: string, budget?: string|null,
 *   key?: string, lines: string[]}} o
 */
const interview = ({ verdict = 'hitl', patient = base, out, budget = '2.50', key = '', lines }) => {
  const args = ['--patient', patient, '--verdict', verdict, '--out', out, ...(budget === null ? [] : ['--budget', budget])];
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 120_000, input: `${lines.join('\n')}\n`,
    // no key VALUE reaches this script and it must never need one
    env: { ...process.env, ANTHROPIC_API_KEY: key },
  });
  if (r.status === null) throw new Error(`run-interview.mjs never exited (${r.error?.code ?? r.signal ?? '?'}):\n${(r.stdout ?? '').slice(0, 400)}`);
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** one free-text answer: the text, then the blank line that ends it */
const a = (/** @type {string} */ s) => [s, ''];
/** a complete, valid session for a class, ending with "n" at the paid-step offer */
const session = (verdict, over = {}) => [
  ...requiredAnswersFor(verdict).flatMap((q) => a(`answer to question ${q}`)),
  ...a(over.job ?? 'litectx-maintainer'),
  ...a(over.goal ?? 'Make src/ pass the checker with no suppressions and the suite still green.'),
  ...a(over.scope ?? 'src/**'),
  ...a(over.budget ?? '5'),
  ...a(over.wall ?? '30'),
  over.run ?? 'n',
];

// ══ the frozen questions reach the person, verbatim and in order ═══════════════

test('the class\'s own frozen questions are asked ONE AT A TIME, byte for byte, in order', () => {
  const out = outDir();
  const r = interview({ out, lines: session('hitl') });
  assert.equal(r.code, 0, r.out);

  const qs = questionsFor('hitl');
  const nums = requiredAnswersFor('hitl');
  // DERIVED, never a literal: the hitl set is the green set plus the human stage's
  // own ask, and green has now lost two slots (D13's genre confirm, then the repo
  // question). A hardcoded count here would have gone stale twice.
  assert.equal(nums.length, requiredAnswersFor('green').length + 1, 'the hitl set is the green questions plus the human stage\'s own ask');
  assert.deepEqual(nums, nums.map((_, i) => i + 1), 'numbered contiguously from 1 — the number shown is the key the answer is filed under');
  let at = -1;
  nums.forEach((q, i) => {
    const line = `${q}. ${qs[q]}`;
    const seen = r.out.indexOf(line);
    assert.ok(seen > at, `question ${q} is asked, verbatim, after question ${nums[i - 1] ?? '(start)'}: ${JSON.stringify(line)}`);
    at = seen;
    assert.match(r.out, new RegExp(`── ${i + 1} of ${nums.length} `), 'and it is numbered so a person knows how far in they are');
  });
});

test('the GREEN class gets its own set, one shorter than hitl — read from the library, never from a copy here', () => {
  const out = outDir();
  const r = interview({ verdict: 'green', out, lines: session('green') });
  assert.equal(r.code, 0, r.out);
  // DERIVED from the library on both sides. Green has lost two slots since it was
  // frozen (D13's genre confirm, then the repo question hamr dropped once
  // `--patient` made it a second answer for a fact the machine already holds), so a
  // literal count here would have gone stale twice while still passing once.
  const greenNums = requiredAnswersFor('green');
  const hitlNums = requiredAnswersFor('hitl');
  const last = hitlNums[hitlNums.length - 1];
  assert.equal(greenNums.length + 1, hitlNums.length, 'the hitl set is green plus the human stage\'s own ask');
  assert.match(r.out, new RegExp(`── ${greenNums.length} of ${greenNums.length} `));
  assert.doesNotMatch(r.out, new RegExp(`── ${greenNums.length + 1} of `), 'the extra slot belongs to hitl: a human stage needs an ask, and a green close has none');
  assert.doesNotMatch(r.out, new RegExp(questionsFor('hitl')[last].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('tripwire: the script SPELLS no question of its own', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  for (const v of VERDICT_CLASSES.filter((c) => !LOCKED_CLASSES.includes(c))) {
    for (const q of Object.values(questionsFor(v))) {
      assert.ok(!src.includes(String(q)), `"${q}" is the library's wording — a second copy in a script is how an interview drifts from the one that was frozen`);
    }
  }
  assert.match(src, /questionsFor\(/, 'it asks the library for them');
  assert.match(src, /requiredAnswersFor\(/, 'and for which of them are required');
});

// ══ what lands on disk ═════════════════════════════════════════════════════════

test('it writes exactly what run-author.mjs consumes: the answers, and the OPERATOR half of a spec', () => {
  const out = outDir();
  const r = interview({ out, lines: session('hitl') });
  assert.equal(r.code, 0, r.out);

  const answers = JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'));
  const hitlNums = requiredAnswersFor('hitl');
  assert.deepEqual(Object.keys(answers).map(Number), hitlNums, 'keyed by the question numbers, which is how run-author reads them');
  // the LAST answer is the human stage's own ask, and it is the one a green run has
  // no slot for — named by the library's own last number rather than by a literal
  const last = hitlNums[hitlNums.length - 1];
  assert.equal(answers[last], `answer to question ${last}`);

  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.schema, 'job-v1');
  assert.equal(draft.job, 'litectx-maintainer');
  assert.equal(draft.budgetUsd, 5);
  assert.equal(draft.maxWallMs, 30 * 60_000, 'minutes are what a person types; milliseconds are what the spec holds');
  assert.deepEqual(draft.writeScope, ['src/**']);
  assert.equal(draft.provider, 'anthropic-api');
  for (const f of AUTHORED_SPEC_FIELDS) {
    assert.equal(draft[f], undefined, `${f} is the AUTHORED half — a draft carrying it is refused by assembleSpec, never merged over`);
  }
  assert.equal(draft.tools, undefined, 'an omitted menu hashes as the concrete current TOOL_MENU (MED-1) — naming one here would freeze today\'s list into the operator\'s half');

  // and the exact command that consumes them, with both files named
  assert.match(r.out, new RegExp(`run-author\\.mjs .*--answers ${join(out, 'answers.json')}`));
  assert.match(r.out, new RegExp(`--draft ${join(out, 'specdraft.json')}`));
  assert.match(r.out, /--verdict hitl/);
  assert.match(r.out, /--budget 2\.5\b/, 'the authoring ceiling travels to the process that spends it');
});

test('the two ceilings are never the same number on screen: the AUTHORING one and the JOB\'s', () => {
  const out = outDir();
  const r = interview({ out, budget: '2.50', lines: session('hitl', { budget: '5' }) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /budget +\$2\.5 ceiling/, 'the authoring ceiling, announced in the header before anything is asked');
  assert.match(r.out, /NOT the authoring ceiling/, 'and named as a different thing where the job\'s own budget is asked');
  assert.match(r.out, /\$2\.5\), which is not the job's \$5/, 'and again where the paid step is offered');
});

test('an unbounded authoring run is ANNOUNCED rather than arrived at by omission', () => {
  const out = outDir();
  const r = interview({ out, budget: null, lines: session('hitl') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /budget +UNBOUNDED/);
  const cmd = r.out.split('\n').find((l) => l.includes('run-author.mjs --patient')) ?? '';
  assert.ok(cmd, 'the paid step is still offered');
  assert.doesNotMatch(cmd, /--budget/, 'and no ceiling is invented for the child either — unbounded is passed on as unbounded');
});

test('the wall is ASKED, and `none` records the unbounded choice as a choice', () => {
  const out = outDir();
  const r = interview({ out, lines: session('hitl', { wall: 'none' }) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.maxWallMs, undefined, 'absent is what job-v1 spells unbounded — never a number nobody chose');
  assert.match(r.out, /wall UNBOUNDED \(you said none/, 'and it is said out loud: an unbounded run must be a VISIBLE operator choice');
});

test('a multi-line answer survives as the person typed it', () => {
  const out = outDir();
  const lines = [
    ...requiredAnswersFor('hitl').slice(0, 1).flatMap(() => ['first line', 'second line', '']),
    ...requiredAnswersFor('hitl').slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('a goal'), ...a('src/**'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'))['1'], 'first line\nsecond line');
});

test('a secret typed into an answer is SCRUBBED by the library seam before it reaches disk', () => {
  const out = outDir();
  const key = `sk-${'a1b2c3d4e5f6g7h8'.repeat(2)}`;
  const lines = [
    ...a(`the token is ${key}`),
    ...requiredAnswersFor('hitl').slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('a goal'), ...a('src/**'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  const raw = readFileSync(join(out, 'answers.json'), 'utf8');
  assert.doesNotMatch(raw, /sk-a1b2c3/, 'an answer becomes a prompt ingredient, a spine record and a signed artefact at once — a file that captures a key captures it forever');
  assert.match(raw, /the token is /, 'and the rest of what they said is untouched');
  assert.doesNotMatch(r.out, /sk-a1b2c3/, 'nor onto the TRANSCRIPT: a piped session is being logged by definition, and the echo is the one place a keystroke leaves the terminal');
});

// ══ the refusals, all of them for $0 ═══════════════════════════════════════════

test('a LOCKED class refuses through the library BEFORE a single question is asked', () => {
  const out = outDir();
  const locked = LOCKED_CLASSES[0];
  const r = interview({ verdict: locked, out, lines: ['n'] });
  assert.equal(r.code, 1, 'a refusal is a RESULT — counted demand, not an error and not a success');
  assert.match(r.out, /REFUSED \(request-red\)/);
  assert.match(r.out, new RegExp(`verb=${locked}`));
  assert.match(r.out, /Nothing was asked and nothing was written/);
  assert.doesNotMatch(r.out, /── 1 of /, 'asking a locked class\'s questions would be an interview for a job nothing here can close');
  assert.equal(existsSync(out), false);
});

test('an unknown verdict is a TYPO, refused with the menu handed over enumerated', () => {
  const out = outDir();
  const r = interview({ verdict: 'greenish', out, lines: ['n'] });
  assert.equal(r.code, 2);
  assert.match(r.out, new RegExp(`one of ${VERDICT_CLASSES.join(' \\| ')}`));
  assert.equal(existsSync(out), false);
});

test('a patient that is not on the machine refuses at the door, not after twenty questions', () => {
  const out = outDir();
  const r = interview({ patient: join(base, 'no-such-repo'), out, lines: ['n'] });
  assert.equal(r.code, 2);
  assert.match(r.out, /does not exist/);
  assert.doesNotMatch(r.out, /── 1 of /);
});

test('a blank answer is RE-ASKED with the rule named — never accepted, never filled in', () => {
  const out = outDir();
  const lines = [
    '', '', // two blank lines at question 1: the answer is empty, twice
    ...a('finally an answer'),
    ...requiredAnswersFor('hitl').slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('a goal'), ...a('src/**'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /that one is required/);
  assert.equal(JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'))['1'], 'finally an answer');
});

test('a number that is not a number is re-asked, and the field is named', () => {
  const out = outDir();
  const lines = [
    ...requiredAnswersFor('hitl').flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('a goal'), ...a('src/**'),
    ...a('five dollars'), ...a('5'),
    ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /"five dollars" is not a positive number/);
  assert.match(r.out, /budgetUsd is a number this run is held to/);
  assert.equal(JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8')).budgetUsd, 5);
});

test('stdin ending mid-interview writes NOTHING — a half-collected set that looks finished is the failure nobody sees', () => {
  const out = outDir();
  const r = interview({ out, lines: [...a('one answer'), ...a('another')] });
  assert.equal(r.code, 2);
  assert.match(r.out, /INPUT ENDED/);
  assert.match(r.out, /question 3/, 'and it says exactly where it stopped');
  assert.equal(existsSync(out), false);
});

test('a draft the JOB VALIDATOR would refuse is refused HERE, for $0, before the paid step is offered', () => {
  const out = outDir();
  // a slug the validator rejects and a wall under its own floor, together: the two
  // classes of red a person can type. Both would otherwise surface after a real
  // scout and a real model call — a true answer at the wrong price.
  const r = interview({ out, lines: session('hitl', { job: 'Litectx Maintainer', wall: '1' }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /THE SPEC DRAFT DOES NOT VALIDATE/);
  assert.match(r.out, /invalid-value at job/);
  assert.match(r.out, /bounds at maxWallMs/);
  assert.doesNotMatch(r.out, /run-author\.mjs --patient/, 'the paid step is not offered over a draft that cannot be signed');
  assert.equal(existsSync(out), false);
});

test('tripwire: the draft\'s validity is the LIBRARY\'s reading, and the authored half is filtered by NAME', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /validateJob\(draft/, 'the same validator that judges it after the paid call');
  assert.match(src, /AUTHORED_SPEC_FIELDS/, 'and which reds are expected is read off the data that names the halves, never re-listed here');
  assert.doesNotMatch(src, /new AnthropicProvider|generate\(/, 'this script never talks to a provider: the paid step is a different process under a different ceiling');
});

// ══ the handoff ════════════════════════════════════════════════════════════════

test('the paid step is OFFERED, never taken: the default is no, and saying nothing runs nothing', () => {
  const out = outDir();
  // input simply ENDS at the offer — the same as pressing return. A KEYED shell,
  // because the offer is only put when it could actually be taken (below).
  const r = interview({ out, key: 'sk-test-not-a-real-key', lines: session('hitl').slice(0, -1) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Run it now\? \[y\/N\]/);
  assert.match(r.out, /Not run\./);
  assert.match(r.out, /the two files are already on disk/);
});

// ── AN OFFER THAT CAN ONLY BE REFUSED IS NOT PUT ──────────────────────────────
//
// `run-author.mjs` exits 2 at its own key guard, before a spine exists. So with
// the shell unkeyed, "Run it now?" has exactly one reachable outcome: a yes
// spawns a child that dies at the door and reports an operator/config error as
// though it were the result of an authoring run.

test('with no key in the shell, the run offer is NOT PUT — the question has only one possible answer', () => {
  const out = outDir();
  // the full session INCLUDING its trailing "y": if the offer were still put,
  // this would spawn the paid child. It must not be read at all.
  const r = interview({ out, lines: session('hitl', { run: 'y' }) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Run it now\?/, 'the offer is put over a shell that cannot take it');
  assert.doesNotMatch(r.out, /close-authoring, run /, 'a "y" was read and the paid child was spawned without a key');
  assert.match(r.out, /Not offered — there is no key in this shell/);
  assert.match(r.out, /the two files are already on disk/);
});

test('the offer names the key it will need, without ever printing one — and says how to set it', () => {
  const out = outDir();
  const r = interview({ out, lines: session('hitl') });
  assert.match(r.out, /ANTHROPIC_API_KEY is not set in this shell/);
  assert.match(r.out, /ANTHROPIC_API_KEY=\.\.\. node scripts\/run-author\.mjs/, 'the command shows the shape, never a value');
  assert.match(r.out, /set the key in the shell you run it from/, 'the explainer says what to DO, not only what is wrong');
  // and it never guesses at WHICH secret store, nor prints a command that would
  // put a key on a readable command line
  // named commands only — a bare word like "pass" appears in ordinary prose (the
  // goal answer itself says "pass the checker"), and a guard that matches that is
  // matching the wrong thing
  assert.doesNotMatch(r.out, /pass show|gpg |security find-generic-password|1password|op read|export ANTHROPIC_API_KEY=\S/);
});

test('the two files are on disk EITHER WAY — the offer is the only thing the key gates', () => {
  const unkeyed = outDir();
  const keyed = outDir();
  assert.equal(interview({ out: unkeyed, lines: session('hitl') }).code, 0);
  assert.equal(interview({ out: keyed, key: 'sk-test-not-a-real-key', lines: session('hitl') }).code, 0);
  for (const out of [unkeyed, keyed]) {
    assert.ok(existsSync(join(out, 'answers.json')), `${out} lost its answers`);
    assert.ok(existsSync(join(out, 'specdraft.json')), `${out} lost its draft`);
  }
});
