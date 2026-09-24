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
//
// SOURCE AND DESTINATION (PRD item 33 M3, ruling 2) are the interview's own first
// two questions now — there is no `--patient` flag any more. `repoBase` below is a
// REAL git repository (neutralized identity, the same rule `tests/source.test.js`
// uses — CI has no gitconfig), because a repo Source is what makes Destination mean
// the write fence, which is the shape every pre-existing test here already assumed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
// the LIBRARY's own frozen sets — the expectations below are DERIVED from them, so a
// question that is ever re-worded moves the test with it instead of leaving a stale
// literal that passes while the person is asked something else
import {
  questionsFor, requiredAnswersFor, VERDICT_CLASSES, LOCKED_CLASSES, UNLISTED_CLASSES, MENU_CLASSES,
  AUTHORED_SPEC_FIELDS,
} from '../src/authorjob.js';
import { PROVIDERS } from '../src/job.js';
import { resolveProvider } from '../src/providers.js';
import { SOURCE_FIELD, DESTINATION_FIELD_REPO, labelsFor } from '../src/authorflow.js';

// The fixture class for every wizard test below: the LONGEST question set the
// menu still offers, so a test that walks every question walks the widest one.
// DERIVED from the menu, never a literal — it was `hitl` until PRD item 31.1
// took that class off the menu, and a literal here would have silently become a
// test of a class the product no longer offers.
const CLASS = MENU_CLASSES.reduce((a, b) => (requiredAnswersFor(b).length > requiredAnswersFor(a).length ? b : a));

const SCRIPT = new URL('../scripts/run-interview.mjs', import.meta.url).pathname;
// PANEL-BUILD.md P0 task 3/4 — the ORCHESTRATION this file's two source-text
// tripwires (below) pin moved off scripts/run-interview.mjs (now a thin
// adapter) into src/interviewrun.js's own `main(argv, deps)`; SCRIPT (above)
// still spawns the real CLI entry point for every BEHAVIOURAL test in this
// file, unchanged.
const ENGINE_SRC = new URL('../src/interviewrun.js', import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), 'run-interview-'));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
let n = 0;

/** a fresh out dir per scenario, so "nothing was written" is a real assertion */
const outDir = () => join(base, `out-${n += 1}`);

/** the same neutralized identity `src/source.js`/`tests/source.test.js` use — CI
 * has no gitconfig (F136: the suite runs hermetic, empty `HOME`). */
const GIT_ID = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', '-c', 'commit.gpgsign=false'];
/** @param {string} cwd @param {string[]} args */
const gitFix = (cwd, args) => execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' });

/** the REAL git repo the wizard tests point Source at — `package.json` so
 * language detection resolves 'js' (never left to the empty-repo "no-code-job"
 * reading, which a bug in the repo/non-repo routing could hide behind). */
const repoBase = mkdtempSync(join(base, 'repo-'));
writeFileSync(join(repoBase, 'package.json'), '{}');
mkdirSync(join(repoBase, 'src'), { recursive: true });
writeFileSync(join(repoBase, 'src', 'index.js'), 'export const x = 1;\n');
gitFix(repoBase, ['init', '-q']);
gitFix(repoBase, ['add', '-A']);
gitFix(repoBase, ['commit', '-q', '-m', 'seed']);

/**
 * Drive the real script with a scripted stdin. `lines` are typed one per line; a
 * free-text answer is ended by an empty string, exactly as a person ends one with a
 * blank line.
 * `key` is the SHELL's state, not a value this script ever reads: it gates
 * whether the paid-step offer is put at all, and the default is unkeyed. The
 * scenarios that set one use a value no provider would accept — nothing here
 * talks to a provider, and every keyed scenario still answers the offer "n".
 * `provider` defaults to `anthropic-api` (item 34 L17 made it a REQUIRED flag with
 * no library default) — `null` omits `--provider` entirely, for the scenarios that
 * test the missing-flag refusal itself.
 * @param {{verdict?: string, out: string, budget?: string|null,
 *   provider?: string|null, baseUrl?: string|null, key?: string, lines: string[]}} o
 */
const interview = ({
  verdict = CLASS, out, budget = '2.50', provider = 'anthropic-api', baseUrl = null, key = '', lines,
}) => {
  const args = [
    '--verdict', verdict, '--out', out,
    ...(budget === null ? [] : ['--budget', budget]),
    ...(provider === null ? [] : ['--provider', provider]),
    ...(baseUrl === null ? [] : ['--base-url', baseUrl]),
  ];
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 120_000, input: `${lines.join('\n')}\n`,
    // no key VALUE reaches this script and it must never need one. `key` only
    // ever targets ANTHROPIC_API_KEY (the fixture default provider); the other
    // two table entries are forced BLANK regardless of the real shell's own
    // env, so a provider-swap scenario's "not set" reading can never depend on
    // whatever happens to be exported in the machine actually running the test.
    env: {
      ...process.env, ANTHROPIC_API_KEY: key, OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    },
  });
  if (r.status === null) throw new Error(`run-interview.mjs never exited (${r.error?.code ?? r.signal ?? '?'}):\n${(r.stdout ?? '').slice(0, 400)}`);
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/**
 * A truly INTERACTIVE driver, for the one scenario that needs a real side effect
 * (creating `node_modules` in the prepared copy) to land BETWEEN two prompts —
 * `spawnSync`/`interview()` above feed the whole scripted transcript up front and
 * cannot do that. `steps` run in order; each optionally waits for a pattern to
 * appear in the output so far, then optionally runs an action (e.g. writing a
 * file into the tree path captured from an earlier step), then optionally sends
 * one line. Polls, capped at 20s per wait — a step that never arrives is a test
 * failure, not a hang.
 * @param {{verdict?: string, out: string, key?: string, provider?: string,
 *   steps: {wait?: RegExp, action?: (out: string) => void, send?: string}[]}} o
 */
const interviewInteractive = async ({
  verdict = CLASS, out, key = '', provider = 'anthropic-api', steps,
}) => {
  const args = ['--verdict', verdict, '--out', out, '--budget', '2.50', '--provider', provider];
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env: {
      ...process.env, ANTHROPIC_API_KEY: key, OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    },
  });
  let buf = '';
  child.stdout.on('data', (d) => { buf += d.toString(); });
  child.stderr.on('data', (d) => { buf += d.toString(); });
  const waitFor = async (re) => {
    const deadline = Date.now() + 20_000;
    while (!re.test(buf)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${re} in:\n${buf.slice(0, 2000)}`);
      // eslint-disable-next-line no-await-in-loop -- a deliberate poll, not a batch
      await new Promise((r) => { setTimeout(r, 20); });
    }
  };
  for (const step of steps) {
    if (step.wait) await waitFor(step.wait); // eslint-disable-line no-await-in-loop
    if (step.action) step.action(buf);
    if (step.send !== undefined) child.stdin.write(`${step.send}\n`);
  }
  const code = await new Promise((resolve) => {
    const killTimer = setTimeout(() => { child.kill(); resolve(null); }, 20_000);
    child.on('exit', (c) => { clearTimeout(killTimer); resolve(c); });
  });
  return { code, out: buf };
};

/** one free-text answer: the text, then the blank line that ends it */
const a = (/** @type {string} */ s) => [s, ''];
/** the SOURCE + DESTINATION pair every complete session starts with (PRD item 33
 * M3, ruling 2) — `source` defaults to the real repo fixture above, `destination`
 * to a fence glob (repo Source: Destination IS the write fence). */
const front = (over = {}) => [...a(over.source ?? repoBase), ...a(over.destination ?? 'src/**')];
/** a complete, valid session for a class, ending with "n" at the paid-step offer.
 * NO GOAL LINE (PRD item 33 M3 piece 4, step S5): the interview no longer asks a
 * separate goal question — the confirm turn (run-author.mjs) drafts and confirms
 * it instead. A session that still scripted one would silently shift every line
 * after it onto the wrong prompt (see the FAIL-FIRST test below, which is exactly
 * how that shift was caught while updating this fixture). */
const session = (verdict, over = {}) => [
  ...front(over),
  ...requiredAnswersFor(verdict).flatMap((q) => a(`answer to question ${q}`)),
  ...a(over.job ?? 'litectx-maintainer'),
  ...a(over.budget ?? '5'),
  ...a(over.wall ?? '30'),
  over.run ?? 'n',
];

/** the same complete session, with the F182 install-gap PAUSE's lines spliced in
 * right after Source/Destination (before the class questions) — where the pause
 * actually sits. `pauseAnswers` are single lines (the pause reads one line per
 * loop turn with no blank terminator, unlike every free-text answer around it):
 * e.g. `['skip']`, or `['', 'skip']` for "still missing, then give up". */
const sessionWithPause = (verdict, pauseAnswers, over = {}) => [
  ...front(over),
  ...pauseAnswers,
  ...requiredAnswersFor(verdict).flatMap((q) => a(`answer to question ${q}`)),
  ...a(over.job ?? 'litectx-maintainer'),
  ...a(over.budget ?? '5'),
  ...a(over.wall ?? '30'),
  over.run ?? 'n',
];

// ══ the frozen questions reach the person, verbatim and in order ═══════════════

test('the class\'s own frozen questions are asked ONE AT A TIME, byte for byte, in order', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);

  const qs = questionsFor(CLASS);
  const nums = requiredAnswersFor(CLASS);
  // DERIVED, never a literal, on BOTH sides: a non-green class is the green set
  // plus that class's own extra asks. Green has lost two slots since it was frozen
  // (D13's genre confirm, then the repo question), and the fixture class changed
  // from hitl to soft-green at PRD item 31.1 — a hardcoded count here would have
  // gone stale three times. The DELTA is not asserted, only that there IS one.
  assert.ok(nums.length > requiredAnswersFor('green').length,
    `the ${CLASS} set is the green questions plus that class's own asks`);
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

test('the GREEN class gets its own set, shorter than the judged one — read from the library, never from a copy here', () => {
  const out = outDir();
  const r = interview({ verdict: 'green', out, lines: session('green') });
  assert.equal(r.code, 0, r.out);
  // DERIVED from the library on both sides. Green has lost two slots since it was
  // frozen (D13's genre confirm, then the repo question hamr dropped once
  // `--patient` made it a second answer for a fact the machine already holds), so a
  // literal count here would have gone stale twice while still passing once.
  const greenNums = requiredAnswersFor('green');
  const judgedNums = requiredAnswersFor(CLASS);
  const last = judgedNums[judgedNums.length - 1];
  assert.ok(greenNums.length < judgedNums.length, `the ${CLASS} set is green plus that class's own asks`);
  assert.match(r.out, new RegExp(`── ${greenNums.length} of ${greenNums.length} `));
  assert.doesNotMatch(r.out, new RegExp(`── ${greenNums.length + 1} of `), `the extra slots belong to ${CLASS}: a rubric needs its own asks, and a green close has none`);
  assert.doesNotMatch(r.out, new RegExp(questionsFor(CLASS)[last].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('tripwire: the script SPELLS no question of its own', () => {
  const src = readFileSync(ENGINE_SRC, 'utf8');
  for (const v of VERDICT_CLASSES.filter((c) => !LOCKED_CLASSES.includes(c))) {
    for (const q of Object.values(questionsFor(v))) {
      assert.ok(!src.includes(String(q)), `"${q}" is the library's wording — a second copy in a script is how an interview drifts from the one that was frozen`);
    }
  }
  assert.match(src, /questionsFor\(/, 'it asks the library for them');
  assert.match(src, /requiredAnswersFor\(/, 'and for which of them are required');
});

// ══ THE UNIFIED FORM'S ORDER (PRD item 33 M3 piece 3) ══════════════════════════

test('the GREEN interview shows exactly Source, Destination, Goal, Success, Guardrails, in that order, and never Judge Examples', () => {
  const out = outDir();
  const r = interview({ verdict: 'green', out, lines: session('green') });
  assert.equal(r.code, 0, r.out);
  const q = questionsFor('green');
  const order = [SOURCE_FIELD.prompt, DESTINATION_FIELD_REPO.prompt, q[1], q[2], q[3]];
  let at = -1;
  for (const text of order) {
    const seen = r.out.indexOf(text);
    assert.ok(seen > at, `expected to find ${JSON.stringify(text.slice(0, 40))}... after position ${at}`);
    at = seen;
  }
  const judgeQ = questionsFor('soft-green')[requiredAnswersFor('soft-green').length];
  assert.ok(!r.out.includes(judgeQ), 'a green interview never shows the Judge Examples question');
});

test('the SOFT-GREEN interview shows Source, Destination, Goal, Success, Guardrails, then Judge Examples LAST', () => {
  const out = outDir();
  const r = interview({ verdict: 'soft-green', out, lines: session('soft-green') });
  assert.equal(r.code, 0, r.out);
  const q = questionsFor('soft-green');
  const judgeKey = requiredAnswersFor('soft-green').at(-1);
  const order = [SOURCE_FIELD.prompt, DESTINATION_FIELD_REPO.prompt, q[1], q[2], q[3], q[judgeKey]];
  let at = -1;
  for (const text of order) {
    const seen = r.out.indexOf(text);
    assert.ok(seen > at, `expected to find ${JSON.stringify(text.slice(0, 40))}... after position ${at}`);
    at = seen;
  }
});

test('the SOFT-GREEN interview shows each free-text field\'s LABEL, in order, from the signed table (PRD item 33 M3 piece 3 wording fix)', () => {
  const out = outDir();
  const r = interview({ verdict: 'soft-green', out, lines: session('soft-green') });
  assert.equal(r.code, 0, r.out);
  const labels = labelsFor('soft-green');
  assert.deepEqual(labels, {
    1: 'Goal', 2: 'What success looks like', 3: 'Guardrails', 4: 'Judge examples',
  });
  // Source and Destination already have their own section headers (── SOURCE ──,
  // ── DESTINATION ──); this asserts the ORDER of the SECTIONS plus the newly-shown
  // labels for the four free-text fields, together, exactly as a person sees them.
  const order = ['── SOURCE', '── DESTINATION', labels[1], labels[2], labels[3], labels[4]];
  let at = -1;
  for (const text of order) {
    const seen = r.out.indexOf(text);
    assert.ok(seen > at, `expected to find ${JSON.stringify(text)} after position ${at}`);
    at = seen;
  }
});

test('"worse than before" is gone from the form entirely (PRD item 33 M3 piece 3 wording fix — it is asked by the confirm turn instead, run-author.mjs, repo-only, never by THIS script)', () => {
  const out = outDir();
  const r = interview({ verdict: 'soft-green', out, lines: session('soft-green') });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /worse than before/i);
});

test('the script prints the LIBRARY\'s Source/Destination wording, not its own — changing the library string changes the printed prompt', () => {
  const out = outDir();
  const r = interview({ verdict: 'green', out, lines: session('green') });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes(SOURCE_FIELD.prompt), 'the Source prompt printed is the library\'s own string');
  assert.ok(r.out.includes(DESTINATION_FIELD_REPO.prompt), 'the Destination prompt printed is the library\'s own string');
});

// ══ SOURCE / DESTINATION (PRD item 33 M3, ruling 2) ════════════════════════════

test('a repo Source: Destination fills writeScope DIRECTLY, and no separate FENCE question is ever asked', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS, { destination: 'src/**, tests/**' }) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.deepEqual(draft.writeScope, ['src/**', 'tests/**']);
  assert.doesNotMatch(r.out, /The FENCE: which files the worker is allowed to WRITE/, 'no second, separate fence question — Destination already asked it');
  // and it is asked as DESTINATION, up front, BEFORE the class's own questions
  assert.match(r.out, /── DESTINATION/);
  const destAt = r.out.indexOf('── DESTINATION');
  const firstQAt = r.out.indexOf('── 1 of ');
  assert.ok(destAt !== -1 && firstQAt !== -1 && destAt < firstQAt, 'Destination is asked before the class questions');
});

test('a SUBFOLDER Source inside a repo takes the REPO route: it asks the repo Destination wording and writes writeScope, relative to the repo root (ruling 2 addendum, 2026-09-13)', () => {
  const out = outDir();
  const subfolder = join(repoBase, 'src');
  const r = interview({ out, lines: session(CLASS, { source: subfolder, destination: 'src/**' }) });
  assert.equal(r.code, 0, r.out);
  // the REPO wording, not the plain-directory one — same field the repo-root
  // fixture above gets, because a subfolder Source is a repo job now
  assert.ok(r.out.includes(DESTINATION_FIELD_REPO.prompt), 'a subfolder Source gets the repo Destination wording');
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.deepEqual(draft.writeScope, ['src/**']);
  assert.match(r.out, /kind {5}repo/, 'the prepared source freezes as kind "repo", not "folder"');
});

test('the printed hand-off gives run-author.mjs --source, never --patient', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  const treeLine = /^ {2}tree {5}(\S+)/m.exec(r.out)?.[1];
  assert.ok(treeLine, `the prepared tree path was not printed:\n${r.out}`);
  assert.ok(existsSync(treeLine), `the printed tree path does not exist on disk: ${treeLine}`);
  assert.match(r.out, new RegExp(`run-author\\.mjs --source ${treeLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
  assert.doesNotMatch(r.out, /--patient/);
});

test('the original repo Source is never touched — prepareSource COPIES, it never writes back', () => {
  const out = outDir();
  const before = readFileSync(join(repoBase, 'package.json'), 'utf8');
  const beforeHead = gitFix(repoBase, ['rev-parse', 'HEAD']).trim();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(repoBase, 'package.json'), 'utf8'), before);
  assert.equal(gitFix(repoBase, ['rev-parse', 'HEAD']).trim(), beforeHead, 'the original repo\'s HEAD must not move');
});

// PRD item 33 M3 piece 4, step S6 (D5 = A): the form no longer STOPS for a
// plain folder — it continues, and the honest "no checks yet" gap moves to
// AFTER the confirm turn, in run-author.mjs (D5's own stop, over the $0 seed
// listing rather than a scout).
test('a non-repo Source (a plain folder): the form CONTINUES (D5=A) — no writeScope in the draft, the $0 stop moves to run-author.mjs (F191)', () => {
  const out = outDir();
  const folder = mkdtempSync(join(base, 'plain-folder-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const destDir = mkdtempSync(join(base, 'plain-dest-'));
  const lines = [
    ...a(folder), ...a(destDir),
    ...requiredAnswersFor(CLASS).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /bareloop has no checks for this kind/);
  assert.match(r.out, /the form continues/i);
  assert.match(r.out, /stop right away, at \$0/);
  assert.doesNotMatch(r.out, /confirm turn still runs/, 'F191 — the confirm turn is unreachable for a plain folder now, never promised');
  assert.match(r.out, /── 1 of /, 'the class questions DO start now (D5) — only run-author.mjs stops on this kind of job');
  assert.ok(existsSync(join(out, 'specdraft.json')), 'the draft IS written — a plain-folder job is not refused here any more');
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.writeScope, undefined, 'a plain-folder job has no fence yet (PLAIN_FOLDER_DEFERRED_FIELDS) — never one derived from the output directory');
});

// F191 (2026-09-21): a plain folder gets NO scout AND NO confirm turn — the
// hand-off text describing the paid step must say so, never promise a model
// call or describe the repo-only scout/prepareSigning pipeline this source
// never reaches.
test('a non-repo Source: the hand-off says the $0 stop plainly, never a confirm turn, a scout, or prepareSigning', () => {
  const out = outDir();
  const folder = mkdtempSync(join(base, 'plain-folder-handoff-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const destDir = mkdtempSync(join(base, 'plain-dest-handoff-'));
  const lines = [
    ...a(folder), ...a(destDir),
    ...requiredAnswersFor(CLASS).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /stops right away, at \$0: no scout, no confirm turn, no model call/);
  assert.match(r.out, /bareloop has no checks for this kind of job yet/);
  assert.doesNotMatch(r.out, /walks you through the confirm turn/);
  assert.doesNotMatch(r.out, /a real scout over that repository/);
  assert.doesNotMatch(r.out, /It stops at prepareSigning/);
});

test('a repo Source: the hand-off still describes the real scout and stops at prepareSigning, byte for byte', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /NEXT — the paid step: a real scout over that repository and a real model filling the declaration form\./);
  assert.match(r.out, /It stops at prepareSigning: it never signs, and it never runs the job\./);
});

test('a bad Destination (not absolute) is a NAMED refusal and the question is RE-ASKED, never silently fixed', () => {
  const out = outDir();
  const folder = mkdtempSync(join(base, 'plain-folder-'));
  writeFileSync(join(folder, 'a.txt'), 'hello');
  const goodDest = mkdtempSync(join(base, 'plain-dest-'));
  const r = interview({ out, lines: [...a(folder), ...a('relative/dir'), ...a(goodDest), 'n'] });
  assert.match(r.out, /destination-not-absolute/);
  // and it recovered — the retry loop accepted the SECOND, valid answer and
  // reached the (honest, non-repo) stop rather than exiting on the bad one
  assert.match(r.out, /bareloop has no checks for this kind/);
});

test('language detection still runs on the ORIGINAL Source path — an unsupported manifest stops before any question, uncounted', () => {
  const out = outDir();
  const goRepo = mkdtempSync(join(base, 'go-repo-'));
  writeFileSync(join(goRepo, 'go.mod'), 'module example.com/x\n');
  gitFix(goRepo, ['init', '-q']);
  gitFix(goRepo, ['add', '-A']);
  gitFix(goRepo, ['commit', '-q', '-m', 'go']);
  const r = interview({ out, lines: [...a(goRepo), 'n'] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /REFUSED \(request-red\)/);
  assert.match(r.out, /language-unsupported/);
  assert.doesNotMatch(r.out, /── DESTINATION/, 'stops before Destination is even asked');
  assert.match(r.out, /run-interview\.mjs keeps no/, 'this script has no spine — the stop says so, plainly');
});

// PRD item 33 M3 piece 4, step S5 — ambiguous language no longer dies here; it
// travels through as a placeholder LANG and the confirm turn (run-author.mjs)
// resolves it for real, interactively, before the scout (D7).
test('an ambiguous language (two manifests at the same level) no longer dies — the interview continues, the pick is deferred to the confirm turn', () => {
  const out = outDir();
  const ambiguousRepo = mkdtempSync(join(base, 'ambiguous-repo-'));
  writeFileSync(join(ambiguousRepo, 'package.json'), '{}');
  writeFileSync(join(ambiguousRepo, 'pyproject.toml'), '[project]\nname = "x"\n');
  mkdirSync(join(ambiguousRepo, 'src'), { recursive: true });
  writeFileSync(join(ambiguousRepo, 'src', 'index.js'), 'export const x = 1;\n');
  gitFix(ambiguousRepo, ['init', '-q']);
  gitFix(ambiguousRepo, ['add', '-A']);
  gitFix(ambiguousRepo, ['commit', '-q', '-m', 'ambiguous']);
  const r = interview({ out, lines: session(CLASS, { source: ambiguousRepo }) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Picking one interactively is a later build/, 'the old die() message must be gone');
  assert.match(r.out, /more than one supported language's manifest/);
  assert.match(r.out, /asked in the confirm turn/, 'the interview says WHERE this gets resolved, and defers rather than guessing');
  // the interview reaches Destination, the class questions and the write, exactly
  // as a resolved-language session would — nothing here stops early
  assert.match(r.out, /── DESTINATION/);
  assert.ok(existsSync(join(out, 'specdraft.json')), 'the draft is still written — ambiguity here is not a refusal');
});

test('--patient is refused, loud — Source replaced it', () => {
  const out = outDir();
  const args = ['--patient', repoBase, '--verdict', CLASS, '--provider', 'anthropic-api', '--out', out];
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 30_000, input: 'n\n',
    env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
  });
  assert.equal(r.status, 2);
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.match(text, /--patient is no longer a flag/);
  assert.match(text, /Source is now the interview's first question/);
  assert.equal(existsSync(out), false);
});

// ══ what lands on disk ═════════════════════════════════════════════════════════

test('it writes exactly what run-author.mjs consumes: the answers, and the OPERATOR half of a spec', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);

  const answers = JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'));
  const judgedNums = requiredAnswersFor(CLASS);
  assert.deepEqual(Object.keys(answers).map(Number), judgedNums, 'keyed by the question numbers, which is how run-author reads them');
  // the LAST answer is the human stage's own ask, and it is the one a green run has
  // no slot for — named by the library's own last number rather than by a literal
  const last = judgedNums[judgedNums.length - 1];
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
  // PRD item 33 M3 piece 4, step S5: the interview writes NO goal at all — the
  // confirm turn (run-author.mjs) drafts and confirms it, and sets draft.goal
  // itself from the accepted plan before assembleSpec.
  assert.equal(draft.goal, undefined, 'goal is set later by run-author.mjs from the confirm turn\'s own accepted plan — this script asks no goal question at all');

  // and the exact command that consumes them, with both files named
  assert.match(r.out, new RegExp(`run-author\\.mjs --source .* --answers ${join(out, 'answers.json')}`));
  assert.match(r.out, new RegExp(`--draft ${join(out, 'specdraft.json')}`));
  assert.match(r.out, new RegExp(`--verdict ${CLASS}`));
  assert.match(r.out, /--budget 2\.5\b/, 'the authoring ceiling travels to the process that spends it');
});

// PRD item 33 M3, ruling 5's 2026-09-13 addendum (D2 = option B), step S5 —
// FAIL-FIRST against the pre-S5 script (see the commit message: reverting
// this line and rerunning reds it, because the old script printed exactly
// this prompt and wrote `goal` onto the draft).
test('the GOAL question is never asked — the confirm turn drafts and confirms it instead', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /The GOAL — what the run is judged on/, 'the interview\'s own separate goal question must be gone');
  assert.doesNotMatch(r.out, /the goal is what the close judges against/, 're-ask wording for a question that is no longer asked');
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.goal, undefined);
});

test('the two ceilings are never the same number on screen: the AUTHORING one and the JOB\'s', () => {
  const out = outDir();
  const r = interview({ out, budget: '2.50', lines: session(CLASS, { budget: '5' }) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /budget +\$2\.5 ceiling/, 'the authoring ceiling, announced in the header before anything is asked');
  assert.match(r.out, /NOT the authoring ceiling/, 'and named as a different thing where the job\'s own budget is asked');
  assert.match(r.out, /\$2\.5\), which is not the job's \$5/, 'and again where the paid step is offered');
});

test('an unbounded authoring run is ANNOUNCED rather than arrived at by omission', () => {
  const out = outDir();
  const r = interview({ out, budget: null, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /budget +UNBOUNDED/);
  const cmd = r.out.split('\n').find((l) => l.includes('run-author.mjs --source'));
  assert.ok(cmd, 'the paid step is still offered');
  assert.doesNotMatch(cmd, /--budget/, 'and no ceiling is invented for the child either — unbounded is passed on as unbounded');
});

test('the wall is ASKED, and `none` records the unbounded choice as a choice', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS, { wall: 'none' }) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.maxWallMs, undefined, 'absent is what job-v1 spells unbounded — never a number nobody chose');
  assert.match(r.out, /wall UNBOUNDED \(you said none/, 'and it is said out loud: an unbounded run must be a VISIBLE operator choice');
});

test('a multi-line answer survives as the person typed it', () => {
  const out = outDir();
  const lines = [
    ...front(),
    ...requiredAnswersFor(CLASS).slice(0, 1).flatMap(() => ['first line', 'second line', '']),
    ...requiredAnswersFor(CLASS).slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'))['1'], 'first line\nsecond line');
});

test('a secret typed into an answer is SCRUBBED by the library seam before it reaches disk', () => {
  const out = outDir();
  const key = `sk-${'a1b2c3d4e5f6g7h8'.repeat(2)}`;
  const lines = [
    ...front(),
    ...a(`the token is ${key}`),
    ...requiredAnswersFor(CLASS).slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  const raw = readFileSync(join(out, 'answers.json'), 'utf8');
  assert.doesNotMatch(raw, /sk-a1b2c3/, 'an answer becomes a prompt ingredient, a spine record and a signed artefact at once — a file that captures a key captures it forever');
  assert.match(raw, /the token is /, 'and the rest of what they said is untouched');
  assert.doesNotMatch(r.out, /sk-a1b2c3/, 'nor onto the TRANSCRIPT: a piped session is being logged by definition, and the echo is the one place a keystroke leaves the terminal');
});

// ══ the refusals, all of them for $0 ═══════════════════════════════════════════

test('the SOFT-GREEN class runs its own four-question interview, derived from the library', () => {
  // This slot used to hold the locked-class refusal, with soft-green as its
  // exemplar. Softgreen module 3 admitted the class, so the refusal is unreachable
  // (`LOCKED_CLASSES` is empty and the script's branch keys on it) and what
  // replaces it is the positive the admission bought: the script asks the class's
  // own set, one at a time, and files every answer — including the one the judged
  // floor needs (Judge Examples, compiled at module 4, PRD item 33 M3 piece 3).
  assert.deepEqual([...LOCKED_CLASSES], [], 'nothing left to refuse');
  const out = outDir();
  const r = interview({ verdict: 'soft-green', out, lines: session('soft-green') });
  assert.equal(r.code, 0, r.out);
  const nums = requiredAnswersFor('soft-green');
  assert.equal(nums.length, requiredAnswersFor('green').length + 1, 'green\'s trio plus Judge Examples');
  const qs = questionsFor('soft-green');
  for (const q of nums) assert.ok(r.out.includes(`${q}. ${qs[q]}`), `question ${q} is asked verbatim`);
  assert.match(r.out, new RegExp(`── ${nums.length} of ${nums.length} `));
  const answers = JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'));
  assert.deepEqual(Object.keys(answers).map(Number), nums, 'every answer is filed, module 4\'s inputs included');
});

test('an unknown verdict is a TYPO, refused with the menu handed over enumerated', () => {
  const out = outDir();
  const r = interview({ verdict: 'greenish', out, lines: ['n'] });
  assert.equal(r.code, 2);
  // item 34 L19: the printed text names only the menu, never an off-menu class
  // (the includes() CHECK below this still runs against the full VERDICT_CLASSES).
  assert.match(r.out, new RegExp(`one of ${MENU_CLASSES.join(' \\| ')}`));
  assert.equal(existsSync(out), false);
});

// ══ --provider (PRD item 34 L17): required, no default, no re-lock ═══════════

test('--provider is REQUIRED — missing it refuses at the usage door, naming the same menu src/job.js admits', () => {
  const out = outDir();
  const r = interview({ provider: null, out, lines: ['n'] });
  assert.equal(r.code, 2);
  assert.match(r.out, /^usage: node scripts\/run-interview\.mjs/);
  assert.match(r.out, new RegExp(`--provider <${PROVIDERS.join('\\|')}>`), 'the usage line names the same menu src/job.js\'s own validator admits');
  assert.equal(existsSync(out), false);
});

test('--provider given with no value refuses the same way — an empty flag is not a silent default', () => {
  const out = outDir();
  const r = interview({ provider: '', out, lines: ['n'] });
  assert.equal(r.code, 2);
  assert.match(r.out, /^usage: node scripts\/run-interview\.mjs/);
  assert.equal(existsSync(out), false);
});

test('--provider lands in the draft VERBATIM, and no anthropic-api literal is forced on a different pick', () => {
  const out = outDir();
  const r = interview({ provider: 'openai-api', out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.provider, 'openai-api');
});

test('the offer\'s key name FOLLOWS the chosen provider, never a hardcoded ANTHROPIC_API_KEY', () => {
  const out = outDir();
  const r = interview({ provider: 'openai-api', out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  const envKey = resolveProvider('openai-api').envKey;
  assert.equal(envKey, 'OPENAI_API_KEY');
  assert.match(r.out, new RegExp(`${envKey} is not set in this shell`));
  assert.match(r.out, new RegExp(`${envKey}=\\.\\.\\. node scripts/run-author\\.mjs`));
  assert.doesNotMatch(r.out, /ANTHROPIC_API_KEY/, 'a different provider must never surface the old hardcoded key name');
});

// ══ --base-url (PRD item 33 close-out: L17 named the provider but never the
// endpoint) — OPTIONAL, no default, DeepSeek reached through openai-api ═══════

test('--base-url given: the draft carries baseUrl VERBATIM, alongside provider', () => {
  const out = outDir();
  const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
  const r = interview({ provider: 'openai-api', baseUrl: DEEPSEEK_URL, out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal(draft.provider, 'openai-api');
  assert.equal(draft.baseUrl, DEEPSEEK_URL);
});

test('--base-url absent: the draft has no baseUrl KEY at all — never null, never empty string', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  const draft = JSON.parse(readFileSync(join(out, 'specdraft.json'), 'utf8'));
  assert.equal('baseUrl' in draft, false, 'an absent flag must leave the field OUT of the draft, not written as null/\'\'');
});

// The two tests below cover the follow-up fix: a bad `--base-url` used to
// refuse only at the END of the interview (through `validateJob`, after
// source prep, every question, budget and wall). It now refuses at flag-parse
// time, sharing `src/job.js`'s `validateBaseUrl` rule, before a single line of
// the interview is printed — a typo must not cost the whole interview, and a
// credential-carrying URL must never be echoed to the terminal before the
// refusal (`redactSecrets` does NOT mask a `user:pass@host` URL — confirmed
// separately, out of scope for this fix, so the die() message must not repeat
// the raw value at all).

test('--base-url http:// to a public host refuses BEFORE the first interview question — nothing written, no session consumed', () => {
  const out = outDir();
  // no scripted answers at all — proving refusal-before-any-question by
  // construction (an empty session cannot satisfy even the first prompt), not
  // just by matching text in the output.
  const r = interview({
    provider: 'openai-api', baseUrl: 'http://gateway.example.com/v1', out, lines: [],
  });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /--base-url invalid/);
  assert.match(r.out, /https:\/\//, 'the shared validateBaseUrl rule names itself (https:// required)');
  assert.doesNotMatch(r.out, /── SOURCE/, 'died before the Source section — no question was ever asked');
  assert.doesNotMatch(r.out, /── 1 of /);
  assert.equal(existsSync(out), false, 'nothing was written at all — not even the out dir');
});

test('--base-url carrying credentials refuses BEFORE anything prints, and the credential itself never reaches stdout/stderr', () => {
  const out = outDir();
  const CREDENTIAL_URL = 'https://bob:hunter2secretpass@api.deepseek.com/v1';
  const r = interview({ provider: 'openai-api', baseUrl: CREDENTIAL_URL, out, lines: [] });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /--base-url invalid/);
  assert.match(r.out, /no embedded credentials/, 'the rule is named');
  assert.doesNotMatch(r.out, /hunter2secretpass/, 'the credential itself must never be echoed, in either direction of the refusal');
  assert.doesNotMatch(r.out, /── SOURCE/, 'died before the Source section — no question was ever asked');
  assert.equal(existsSync(out), false);
});

test('the hand-off names the endpoint and points the key hint at OPENAI_API_KEY — no separate endpoint-specific key variable', () => {
  const out = outDir();
  const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
  const r = interview({ provider: 'openai-api', baseUrl: DEEPSEEK_URL, out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`endpoint\\s+${DEEPSEEK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(r.out, /OPENAI_API_KEY/);
  assert.match(r.out, /there is no separate endpoint-specific key variable/);
});

test('--base-url never appears when the flag was never given — the hand-off carries no stale endpoint hint', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /endpoint-specific key variable/);
});

test('a Source that is not on the machine refuses at the door, not after any class question', () => {
  const out = outDir();
  const r = interview({ out, lines: [...a(join(base, 'no-such-repo')), 'n'] });
  assert.equal(r.code, 2);
  assert.match(r.out, /does not exist/);
  assert.doesNotMatch(r.out, /── 1 of /);
});

test('a blank answer is RE-ASKED with the rule named — never accepted, never filled in', () => {
  const out = outDir();
  const lines = [
    ...front(),
    '', '', // two blank lines at question 1: the answer is empty, twice
    ...a('finally an answer'),
    ...requiredAnswersFor(CLASS).slice(1).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'), 'n',
  ];
  const r = interview({ out, lines });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /that one is required/);
  assert.equal(JSON.parse(readFileSync(join(out, 'answers.json'), 'utf8'))['1'], 'finally an answer');
});

test('a number that is not a number is re-asked, and the field is named', () => {
  const out = outDir();
  const lines = [
    ...front(),
    ...requiredAnswersFor(CLASS).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'),
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
  const r = interview({ out, lines: [...front(), ...a('one answer'), ...a('another')] });
  assert.equal(r.code, 2);
  assert.match(r.out, /INPUT ENDED/);
  assert.match(r.out, /question 3/, 'and it says exactly where it stopped');
  // `out` itself may already hold the PREPARED SOURCE tree by this point (Source
  // and Destination are proven, and the copy frozen, BEFORE the class questions
  // that ended early) — what must never exist is the answers/draft pair the
  // interview writes only once it actually finishes.
  assert.equal(existsSync(join(out, 'answers.json')), false);
  assert.equal(existsSync(join(out, 'specdraft.json')), false);
});

test('a draft the JOB VALIDATOR would refuse is refused HERE, for $0, before the paid step is offered', () => {
  const out = outDir();
  // a slug the validator rejects and a wall under its own floor, together: the two
  // classes of red a person can type. Both would otherwise surface after a real
  // scout and a real model call — a true answer at the wrong price.
  const r = interview({ out, lines: session(CLASS, { job: 'Litectx Maintainer', wall: '1' }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /THE SPEC DRAFT DOES NOT VALIDATE/);
  assert.match(r.out, /invalid-value at job/);
  assert.match(r.out, /bounds at maxWallMs/);
  assert.doesNotMatch(r.out, /run-author\.mjs --source/, 'the paid step is not offered over a draft that cannot be signed');
  assert.equal(existsSync(join(out, 'specdraft.json')), false);
});

test('tripwire: the draft\'s validity is the LIBRARY\'s reading, and the authored half is filtered by NAME', () => {
  const src = readFileSync(ENGINE_SRC, 'utf8');
  assert.match(src, /validateJob\(draft/, 'the same validator that judges it after the paid call');
  assert.match(src, /AUTHORED_SPEC_FIELDS/, 'and which reds are expected is read off the data that names the halves, never re-listed here');
  assert.doesNotMatch(src, /new AnthropicProvider|generate\(/, 'this script never talks to a provider: the paid step is a different process under a different ceiling');
});

// ══ the handoff ════════════════════════════════════════════════════════════════

test('the paid step is OFFERED, never taken: the default is no, and saying nothing runs nothing', () => {
  const out = outDir();
  // input simply ENDS at the offer — the same as pressing return. A KEYED shell,
  // because the offer is only put when it could actually be taken (below).
  const r = interview({ out, key: 'sk-test-not-a-real-key', lines: session(CLASS).slice(0, -1) });
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
  const r = interview({ out, lines: session(CLASS, { run: 'y' }) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Run it now\?/, 'the offer is put over a shell that cannot take it');
  assert.doesNotMatch(r.out, /close-authoring, run /, 'a "y" was read and the paid child was spawned without a key');
  assert.match(r.out, /Not offered — there is no key in this shell/);
  assert.match(r.out, /the two files are already on disk/);
});

test('the offer names the key it will need, without ever printing one — and says how to set it', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.match(r.out, /ANTHROPIC_API_KEY is not set in this shell/);
  assert.match(r.out, /ANTHROPIC_API_KEY=\.\.\. node scripts\/run-author\.mjs/, 'the command shows the shape, never a value');
  assert.match(r.out, /set the key in the shell you run it from/, 'the explainer says what to DO, not only what is wrong');
  // and it never guesses at WHICH secret store, nor prints a command that would
  // put a key on a readable command line — named commands only, never a bare
  // word like "pass" that could appear in ordinary prose elsewhere in the
  // transcript (the interview no longer asks a goal question that used to say
  // "pass the checker", step S5, but the rule stands regardless of what any
  // one session's answers happen to contain)
  assert.doesNotMatch(r.out, /pass show|gpg |security find-generic-password|1password|op read|export ANTHROPIC_API_KEY=\S/);
});

test('the two files are on disk EITHER WAY — the offer is the only thing the key gates', () => {
  const unkeyed = outDir();
  const keyed = outDir();
  assert.equal(interview({ out: unkeyed, lines: session(CLASS) }).code, 0);
  assert.equal(interview({ out: keyed, key: 'sk-test-not-a-real-key', lines: session(CLASS) }).code, 0);
  for (const out of [unkeyed, keyed]) {
    assert.ok(existsSync(join(out, 'answers.json')), `${out} lost its answers`);
    assert.ok(existsSync(join(out, 'specdraft.json')), `${out} lost its draft`);
  }
});

// ══ install-gap detector (PRD item 33 close-out, hamr's ruling 2026-09-14) ═════
// `prepareSource` copies only git-tracked files, so a JS/TS repo's copy never
// carries `node_modules`. This script must name the gap and the exact command
// at $0, and must never OFFER to start the paid step over a copy that would
// only instrument-stop.

/** a repo fixture with a package.json that DECLARES dependencies but ships no
 * lockfile and no node_modules — `missingDependencies` must fire `npm install`. */
const depsRepo = mkdtempSync(join(base, 'repo-deps-'));
writeFileSync(join(depsRepo, 'package.json'), JSON.stringify({ dependencies: { left: '1.0.0' } }));
mkdirSync(join(depsRepo, 'src'), { recursive: true });
writeFileSync(join(depsRepo, 'src', 'index.js'), 'export const x = 1;\n');
gitFix(depsRepo, ['init', '-q']);
gitFix(depsRepo, ['add', '-A']);
gitFix(depsRepo, ['commit', '-q', '-m', 'seed']);

test('a repo Source whose package.json lists dependencies with no node_modules: the exact install command is printed right after the seed line', () => {
  const out = outDir();
  const r = interview({ out, lines: sessionWithPause(CLASS, ['skip'], { source: depsRepo }) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /The copy above has no installed packages/);
  assert.match(r.out, /cd .+tree && npm install/, 'the printed command names the copy\'s own tree path, not a bare "npm install"');
});

test('a repo Source whose package.json lists dependencies with no node_modules: no "start it now" offer, even with a key in the shell', () => {
  const out = outDir();
  const r = interview({ out, key: 'sk-test-not-a-real-key', lines: sessionWithPause(CLASS, ['skip'], { source: depsRepo }) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Run it now\?/, 'the offer must never be made over a copy missing its dependencies');
  assert.match(r.out, /Not offered — the copy still has no installed packages/);
  assert.match(r.out, /run-author\.mjs/, 'the command to fire once installed is still printed');
});

// ══ F182 — the pause: "Run it now?" is now reachable ══════════════════════════
// `scripts/run-interview.mjs` now waits right where the gap is printed instead of
// falling straight through to the class questions and only re-checking once, too
// late to ever offer.

test('F182 (a): gap + skip — the interview continues past the pause with no recheck message, and hand-off says not offered', () => {
  const out = outDir();
  const r = interview({
    out, key: 'sk-test-not-a-real-key', lines: sessionWithPause(CLASS, ['skip'], { source: depsRepo }),
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Press Enter once it has finished to check again, or type skip to carry on without it: /);
  assert.doesNotMatch(r.out, /still missing/);
  assert.doesNotMatch(r.out, /packages found/);
  assert.doesNotMatch(r.out, /Run it now\?/);
  assert.match(r.out, /Not offered — the copy still has no installed packages/);
});

test('F182 (b): gap + Enter while still missing — prints "still missing" and re-prompts, then skip carries on', () => {
  const out = outDir();
  const r = interview({
    out, key: 'sk-test-not-a-real-key', lines: sessionWithPause(CLASS, ['', 'skip'], { source: depsRepo }),
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /still missing \(.*no node_modules\) — try again, or type skip to carry on without it\./);
  assert.doesNotMatch(r.out, /Run it now\?/);
  assert.match(r.out, /Not offered — the copy still has no installed packages/);
});

test('F182 (c): gap + the copy gets its node_modules + Enter — "packages found", then the offer is actually reachable', async () => {
  const out = outDir();
  // front() (Source, Destination) plus one '' line for the pause's Enter —
  // the rest is sent by the interactive driver's own steps below, one prompt
  // at a time, so the node_modules side effect can land in between.
  // Every free-text answer (class questions, job name, budget, wall) is
  // terminated by its own blank line — `a()` already shapes that.
  const rest = [
    ...requiredAnswersFor(CLASS).flatMap((q) => a(`answer to question ${q}`)),
    ...a('litectx-maintainer'), ...a('5'), ...a('30'),
  ];
  const r = await interviewInteractive({
    out,
    key: 'sk-test-not-a-real-key',
    steps: [
      // front() (Source, Destination) only — the pause's own '' (Enter) line is
      // deliberately held back and sent as its OWN step below, after the
      // node_modules side effect, so it cannot be consumed early.
      { send: front({ source: depsRepo }).join('\n') },
      { wait: /Press Enter once it has finished to check again/ },
      {
        action: (bufSoFar) => {
          const treeLine = /^ {2}tree {5}(\S+)/m.exec(bufSoFar)?.[1];
          assert.ok(treeLine, `tree path not printed yet:\n${bufSoFar}`);
          // exactly what `missingDependencies` looks for (src/source.js): a
          // `node_modules` directory at the same level as the package.json it
          // found — never a real install, just the directory's presence.
          mkdirSync(join(treeLine, 'node_modules', 'left'), { recursive: true });
          writeFileSync(join(treeLine, 'node_modules', 'left', 'index.js'), 'module.exports = 1;\n');
        },
      },
      { send: '' }, // the Enter — sent only now that node_modules actually exists
      { wait: /packages found — carrying on\./ },
      { send: rest.join('\n') },
      { wait: /Run it now\? \[y\/N\] / },
      { send: 'n' },
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /packages found — carrying on\./);
  assert.match(r.out, /Run it now\? \[y\/N\] /, 'F182: the offer is reachable once the gap is resolved in the loop, not just when there was never a gap');
  assert.doesNotMatch(r.out, /Not offered — the copy still has no installed packages/);
});

test('F182 (d): gap + EOF on stdin during the pause — no infinite loop, ends the interview rather than hanging', () => {
  const out = outDir();
  // ONLY front() — input ends right at the pause's first prompt, with nothing
  // queued after it (the real EOF case: a piped/non-interactive session that
  // simply has no more lines). Must not hang the 120s test timeout.
  const r = interview({ out, lines: [...front({ source: depsRepo })] });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /INPUT ENDED/, 'EOF during the pause behaves like `skip` and lets the rest of the (now-exhausted) interview end honestly, not hang');
  assert.doesNotMatch(r.out, /still missing/, 'EOF must not be read as a recheck attempt in a loop');
});

test('F182 (e): no gap at all — no pause prompt is ever printed', () => {
  const out = outDir();
  const r = interview({ out, lines: session(CLASS) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /Press Enter once it has finished/);
  assert.doesNotMatch(r.out, /has no installed packages/);
});

test('a repo Source with dependencies but node_modules ALREADY present: no install-gap message, offer proceeds normally', () => {
  const nmRepo = mkdtempSync(join(base, 'repo-deps-havenm-'));
  writeFileSync(join(nmRepo, 'package.json'), JSON.stringify({ dependencies: { left: '1.0.0' } }));
  // `prepareSource` copies only TRACKED files, so `node_modules` has to be
  // committed here (unrealistic for a real project, but the only way to land
  // it in the prepared copy without this test running a real install) to
  // prove the detector's own true/false split — the real-install, real-copy
  // live proof (a real `npm ci` in a real prepared tree) is done separately,
  // outside the test suite (see the build report).
  mkdirSync(join(nmRepo, 'node_modules', 'left'), { recursive: true });
  writeFileSync(join(nmRepo, 'node_modules', 'left', 'index.js'), 'module.exports = 1;\n');
  gitFix(nmRepo, ['init', '-q']);
  gitFix(nmRepo, ['add', '-A']);
  gitFix(nmRepo, ['commit', '-q', '-m', 'seed']);
  const out = outDir();
  const r = interview({ out, lines: session(CLASS, { source: nmRepo }) });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /has no installed packages/);
});
