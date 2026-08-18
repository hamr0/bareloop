// RUN-INTERVIEW — the close-authoring interview, at the terminal, one question at
// a time.
//
// D10 says the interview runs INSIDE bareloop, and `runInterview` (src/authorjob.js)
// is that interview: a PURE FUNCTION over answers, with no prompt loop in it, so it
// can be tested without a terminal and reused by a panel later. What was missing was
// the other half — something that actually ASKS. Until now the only way in was to
// hand-write an answers.json and a spec draft, which is precisely the SWE tax the
// premise of this product refuses (*"the user might not and mostly isn't swe"*).
//
// THIS SCRIPT IS GLUE, and deliberately thin:
//   - the QUESTIONS are the library's frozen sets (`questionsFor` /
//     `requiredAnswersFor`, keyed by verdict class). Never re-worded here, never
//     re-ordered, never stored — the script prints what the library hands it;
//   - the REFUSALS are the library's (`runInterview`): a locked class refuses at
//     admission as counted demand, an unfinished interview reds by question number;
//   - the SCRUB is the library's: what lands on disk is `runInterview`'s own
//     redacted copy of the answers, never the raw keystrokes;
//   - the SPEC DRAFT is checked by `validateJob`, the same validator that will judge
//     it after the paid call, so a typo'd slug or an under-floor wall is found for
//     $0 rather than after a scout and a model call.
//
// IT NEVER TALKS TO A PROVIDER. The paid step is `run-author.mjs`, under ITS OWN
// ceiling (`--budget`), and this script either offers to spawn it or prints the
// exact command. Two ceilings, two names, and they are kept apart on screen:
//   --budget      the AUTHORING ceiling — what the close-authoring call may spend;
//   budgetUsd     the JOB's budget — what the RUN may spend, signed into the spec.
//
//   node scripts/run-interview.mjs \
//     --patient /path/to/repo --verdict hitl --out /path/to/outdir \
//     [--budget 2.50] [--lang js]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import {
  runInterview, questionsFor, requiredAnswersFor,
  VERDICT_CLASSES, LOCKED_CLASSES, AUTHORED_SPEC_FIELDS,
} from '../src/authorjob.js';
import { validateJob } from '../src/job.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
import { parseCeiling, ceilingLine } from './author-readout.mjs';

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

const patientArg = arg('patient');
const outArg = arg('out');
const verdictArg = arg('verdict');
// An ABSENT `--lang` takes the default; a PRESENT one with no value is an operator
// error and stops LOUD, on the same rule the ceiling below is parsed by. `?? 'js'`
// alone would not catch it — `arg` returns the EMPTY STRING for a flag typed with
// nothing after it, and nullish-coalescing passes an empty string straight through.
// The consequence was not cosmetic: `--lang` and its value are printed as the NEXT
// STEP's command, and an empty value collapses them into `--lang  --budget 2.5`, so
// the copy-pasted command hands run-author the word `--budget` as its language.
const langArg = arg('lang');
if (langArg !== null && langArg.trim() === '') {
  die('--lang was given with no value — pass a language (e.g. `--lang js`), or omit the flag to take the default. It is NOT defaulted here: the flag and its value are printed back as the paid step\'s own command, and an empty one silently eats the flag that follows it.');
}
const LANG = langArg ?? 'js';
/** the AUTHORING ceiling, parsed by the same rule `run-author.mjs` parses it with
 * (`parseCeiling`): absent is UNBOUNDED and announced, a malformed value is an
 * error rather than a silent fallback. It is not stored in anything — it is handed
 * straight to the child, which is the process that spends it. */
const { ceilingUsd: CEILING_USD, error: budgetError } = parseCeiling(arg('budget'));

if (!patientArg || !outArg || verdictArg === null) {
  die('usage: node scripts/run-interview.mjs --patient <repoPath> '
    + `--verdict <${VERDICT_CLASSES.join('|')}> --out <outdir> [--budget <usd>] [--lang js]`);
}
if (budgetError) die(budgetError);
// the menu is handed over ENUMERATED — an unknown value is a typo, refused as one.
// A LOCKED class is a different answer entirely: it is admissible input, and the
// LIBRARY refuses it below as counted demand.
const VERDICT = /** @type {string} */ (verdictArg);
if (!VERDICT_CLASSES.includes(VERDICT)) die(`--verdict ${VERDICT} is not a verdict class — one of ${VERDICT_CLASSES.join(' | ')}`);

const PATIENT = resolve(/** @type {string} */ (patientArg));
// asked HERE, before a person answers twenty questions: the scout reads a repository
// off the machine, and finding out it is not there afterwards is a true answer at the
// wrong price (run-author.mjs makes the same check for the same reason).
if (!existsSync(PATIENT)) die(`--patient ${PATIENT} does not exist — the close is authored against a repository on this machine, never out of prose`);
const OUT = resolve(/** @type {string} */ (outArg));

// ── the locked classes refuse BEFORE a single question ───────────────────────
// Not this script's rule and not this script's words: `runInterview` is the
// admission path, and a locked pick comes back as a `request-red` refusal that is
// COUNTED demand for the class. Asking its questions first would be an interview
// for a job nothing here can close.
if (LOCKED_CLASSES.includes(VERDICT)) {
  const iv = runInterview({ answers: {}, verdictType: VERDICT, repoPath: PATIENT });
  const r = iv.refusal;
  console.log(`REFUSED (${r?.kind ?? 'request-red'})  verb=${r?.verb ?? VERDICT}  path=${r?.path ?? 'verdictType'}`);
  console.log(r?.detail ?? '');
  for (const o of r?.options ?? []) console.log(`  · ${o}`);
  console.log('\nNothing was asked and nothing was written — the refusal IS the record.');
  process.exit(1);
}

const QUESTIONS = questionsFor(VERDICT);
const REQUIRED = requiredAnswersFor(VERDICT);

// ── the terminal ─────────────────────────────────────────────────────────────
// `terminal: false` on purpose: the TTY's own canonical mode gives backspace and
// echo, and a piped stdin (a scripted session, a test) behaves identically. The
// async iterator makes END OF INPUT a value — `null` — instead of a promise that
// never settles, which is what a half-answered interview must be able to say.
const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
const say = (/** @type {string} */ s = '') => process.stdout.write(`${s}\n`);
const prompt = (/** @type {string} */ s) => process.stdout.write(s);
/** @returns {Promise<string|null>} the next line, or null at end of input */
const nextLine = async () => {
  const { value, done } = await lines.next();
  if (done) { say(); return null; }
  // A TTY echoes what a person types; a PIPE does not, and the transcript then reads
  // as a wall of prompts with no answers under them. Since a scripted session IS how
  // this gets signed off and logged, the non-TTY case echoes the line itself — never
  // the TTY case, where it would print everything twice.
  //
  // SCRUBBED on the way out, through the one inventory: this echo is the only place
  // the script writes a keystroke anywhere but back to the person's own terminal, and
  // a piped session is being logged by definition.
  if (!process.stdin.isTTY) say(redactSecrets(String(value)));
  return String(value);
};

/** input ended before the interview did. NOTHING is written: a half-collected
 * answers.json that looks finished is worse than no file at all.
 * @param {string} where */
const stdinEnded = (where) => {
  say('');
  say(`INPUT ENDED — stdin closed at ${where}, so this interview never finished.`);
  say('Nothing was written: a half-collected set of answers that LOOKS finished is the one failure nobody sees.');
  process.exit(2);
};

/**
 * One free-text answer, possibly several lines. A blank line ends it; an answer
 * that is blank is RE-ASKED with the rule named, never accepted and never filled
 * in on the person's behalf.
 * @param {string} where what to say if stdin ends here
 * @param {string} rule why an empty answer cannot stand
 */
const readAnswer = async (where, rule) => {
  for (;;) {
    /** @type {string[]} */
    const got = [];
    for (;;) {
      prompt(got.length ? '  … ' : '  > ');
      const l = await nextLine();
      if (l === null) { if (got.length) break; stdinEnded(where); }
      if (String(l).trim() === '') break;
      got.push(String(l));
    }
    // SCRUBBED AT CAPTURE, through the one inventory. `runInterview` scrubs at its
    // own ingest too and that is the seam of record — this is the same function, one
    // step earlier, so that no raw keystroke can reach stdout by a route that does
    // not go through the library (the answer recap below the goal prompt was exactly
    // such a route, and printed a typed key back verbatim).
    const text = redactSecrets(got.join('\n').trim());
    if (text) return text;
    say(`  (nothing typed) ${rule}`);
  }
};

/**
 * A number the spec needs. Parsing only — every BOUND (the wall floor, the budget's
 * ceiling coupling, the slug's alphabet) belongs to `validateJob`, which runs over
 * the whole draft below rather than being re-spelled a field at a time here.
 * @param {string} where @param {string} field @param {(s: string) => number|null} parse
 * @param {boolean} [allowNull] whether the field's own "not set" answer is legal
 */
const readNumber = async (where, field, parse, allowNull = false) => {
  for (;;) {
    const raw = await readAnswer(where, `${field} has no default — it is yours to set. Again:`);
    const v = parse(raw);
    if (v === null && allowNull) return null;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    say(`  "${raw}" is not a positive number${allowNull ? ' (or the word `none`)' : ''} — ${field} is a number this run is held to. Again:`);
  }
};

// ── the header ───────────────────────────────────────────────────────────────
say('INTERVIEW — your job, in your own words. Nothing here spends a cent.');
say(`  patient  ${PATIENT}`);
say(`  verdict  ${VERDICT}  (YOUR pick — the close this authors promises to stay at or below it)`);
say(`  lang     ${LANG}`);
say(`  out      ${OUT}`);
say(`  ${ceilingLine(CEILING_USD)}`);
say(`  asks     ${REQUIRED.length} frozen question(s) for this class, then the numbers and names the job spec needs`);
say('  no model is called from here: this collects your answers and hands them to run-author.mjs, which does the paid part under the ceiling above');
say('  (answers can be several lines — press Enter on an empty line, i.e. Enter twice, to finish an answer)');

// ── 1. the class's own frozen questions, one at a time ───────────────────────
/** @type {Record<string, string>} */
const answers = {};
let asked = 0;
for (const n of REQUIRED) {
  asked += 1;
  say('');
  say(`── ${asked} of ${REQUIRED.length} ${'─'.repeat(Math.max(0, 56 - String(asked).length))}`);
  // the frozen wording, printed as the library holds it. Numbered by the library's
  // own key, so the number a person sees is the number their answer is filed under.
  say(`${n}. ${QUESTIONS[n]}`);
  answers[n] = await readAnswer(`question ${n}`,
    'that one is required — every question in this class\'s set has to be answered before a close can be authored from it. Again:');
}

// ── 2. the OPERATOR's half of the spec — the part nothing authors for you ────
say('');
say('── THE JOB SPEC — the operator\'s half, and nothing here authors it for you ──');
say('  the close is what run-author writes; these are the fence, the money and the clock it runs under.');
say('');
say('The NAME of this job: kebab-case, letters and digits and dashes (e.g. `litectx-maintainer`).');
say('It names the spec file you sign, the branch the run works on, and the spine it writes.');
const jobName = await readAnswer('the job name',
  'the job needs a name — it is what the spec file, the run\'s work branch and its spine are all called. Again:');
say('');
// F87 said in plain words, which is the only form it can be said in HERE: the person
// answering is not reading the findings, and a finding number in a prompt is a private
// reference standing where an instruction belongs. The RULE is unchanged — the goal
// must state everything the close will check — and so is its price, now named as a
// price rather than as a citation.
say('The GOAL — what the run is judged on at the end. In one or two sentences: what must be true at the end for');
say('this to count as done? Say everything you\'ll check — anything you leave out here still gets checked at the');
say('very end, and finding it only then wastes the run\'s money.');
say('Your own answers, to save you scrolling:');
for (const n of REQUIRED.slice(0, 3)) say(`  ${n}. ${QUESTIONS[n]}  →  ${answers[n].split('\n').join(' ')}`);
const goal = await readAnswer('the goal', 'the goal is what the close judges against — there is no run without one. Again:');

say('');
say('The FENCE: which files the worker is allowed to WRITE — everything else is read-only.');
say('Patterns are relative to the repo root, comma-separated (e.g. `src/**`). The run works on a copy of the');
say('repo, so absolute paths are refused. The agent may narrow this and may never widen it.');
const scopeText = await readAnswer('the write scope', 'the fence is not optional: a run with no fence is ungated spend. Again:');
const writeScope = scopeText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

say('');
say(`The JOB's budget, in dollars — what the RUN may spend. This is NOT the authoring ceiling above (${ceilingLine(CEILING_USD).replace(/^budget\s+/, '')}).`);
const budgetUsd = await readNumber('the job budget', 'budgetUsd', (s) => Number(s));

say('');
say('The WALL, in MINUTES — how long the run may take. There is no default anywhere in bareloop for this:');
say('an unbounded run is legal and must be a VISIBLE choice, so it is asked rather than assumed.');
say('Type a number of minutes, or the word `none` to run with no wall at all.');
const wallMin = await readNumber('the wall', 'maxWallMs', (s) => (/^none$/i.test(s) ? null : Number(s)), true);

// ── 3. what gets written ─────────────────────────────────────────────────────
// THE LIBRARY'S OWN READING of the answers, not the raw keystrokes: `runInterview`
// validates completeness against the class's required set and scrubs every answer at
// INGEST (an answer becomes a prompt ingredient, a spine record and a signed artefact
// all at once, and a log that captures a key captures it forever).
const iv = runInterview({ answers, verdictType: VERDICT, repoPath: PATIENT });
if (!iv.ok) {
  say('');
  if (iv.refusal) {
    say(`REFUSED (${iv.refusal.kind})  verb=${iv.refusal.verb ?? 'none'}  path=${iv.refusal.path}`);
    say(iv.refusal.detail);
    for (const o of iv.refusal.options ?? []) say(`  · ${o}`);
  }
  for (const red of iv.reds ?? []) say(`RED ${red.code} at ${red.path}: ${red.detail}`);
  say('\nNothing was written — the interview the library reads is not the one that was answered.');
  process.exit(1);
}

/** the OPERATOR half, and only that half. `close`, `closeDecl` and `verdictType` are
 * what the pipeline authors (`AUTHORED_SPEC_FIELDS`); a draft carrying any of them is
 * refused by `assembleSpec` rather than merged over, so this must not write one. */
const draft = {
  schema: 'job-v1',
  job: jobName,
  // a record LABEL, never a statement of intent: the goal above is where intent
  // lives, and this field only has to say which job's file you are looking at
  description: `${jobName} — authored through the bareloop interview (${VERDICT}, ${LANG}) against ${PATIENT}`,
  // F48: only `anthropic-api` is a guaranteed peer, so it is stated rather than asked
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd,
  ...(wallMin === null ? {} : { maxWallMs: Math.round(wallMin * 60_000) }),
  writeScope,
  goal: redactSecrets(goal),
  escalation: { mode: 'decision-ready' },
  // `tools` is deliberately OMITTED: an omitted menu hashes as the concrete current
  // TOOL_MENU (MED-1), which pins WHICH menu was signed and makes a widening flip the
  // hash. Naming one here would freeze today's list into the operator's own half.
};

// THE SAME VALIDATOR that will judge this after the paid call, run now for $0. Its
// reds about the AUTHORED half are expected — that half does not exist yet, by
// design — so they are filtered BY FIELD NAME off `AUTHORED_SPEC_FIELDS` rather than
// by re-listing them here. Everything else is a typo the person can fix in a second
// now, or pay a scout and a model call to discover.
const draftReds = validateJob(draft, { shellCapUsd: draft.budgetUsd }).reds
  .filter((r) => !AUTHORED_SPEC_FIELDS.some((f) => String(r.path) === f || String(r.path).startsWith(`${f}.`)));
if (draftReds.length) {
  say('');
  say(`THE SPEC DRAFT DOES NOT VALIDATE — ${draftReds.length} red(s), found for $0 rather than after a paid call:`);
  for (const r of draftReds) say(`  ${r.code} at ${r.path}: ${r.detail}`);
  say('');
  say('Nothing was written. Run the interview again with those answers corrected.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const answersFile = join(OUT, 'answers.json');
const draftFile = join(OUT, 'specdraft.json');
writeFileSync(answersFile, `${JSON.stringify(iv.answers, null, 2)}\n`);
writeFileSync(draftFile, `${JSON.stringify(draft, null, 2)}\n`);

say('');
say(`written  ${answersFile}   the ${REQUIRED.length} answers, in the shape run-author.mjs consumes`);
say(`written  ${draftFile}   the operator half — no close and no verdictType: those are what run-author authors`);
say(`  job      ${draft.job}`);
say(`  budget   $${draft.budgetUsd} for the RUN  ·  wall ${draft.maxWallMs === undefined ? 'UNBOUNDED (you said none — no outside deadline)' : `${draft.maxWallMs / 60_000}min`}`);
say(`  fence    ${draft.writeScope.join(', ')}`);
say(`  goal     ${JSON.stringify(draft.goal)}`);

// The hard line, on the two files this run just wrote. Count and PATH only — echoing
// a matched secret to stdout is the same leak, one hop on.
const leaks = [answersFile, draftFile].flatMap((f) => scanSecrets(readFileSync(f, 'utf8')).map(() => f));
if (leaks.length) {
  say('');
  say(`LEAK: ${leaks.length} secret-shaped string(s) across ${new Set(leaks).size} written file(s) — the hard line is broken; do NOT author from these`);
  process.exit(3); // distinct from 2 (operator/config) and 1 (a refusal)
}

// ── 4. the paid step, which is a DIFFERENT process under a DIFFERENT ceiling ─
const RUN_AUTHOR = fileURLToPath(new URL('./run-author.mjs', import.meta.url));
const childArgs = [
  '--patient', PATIENT, '--answers', answersFile, '--draft', draftFile,
  '--verdict', VERDICT, '--out', OUT, '--lang', LANG,
  ...(CEILING_USD === null ? [] : ['--budget', String(CEILING_USD)]),
];
say('');
say('NEXT — the paid step: a real scout over that repository and a real model filling the declaration form.');
say(`It runs under the AUTHORING ceiling (${CEILING_USD === null ? 'UNBOUNDED — you gave no --budget' : `$${CEILING_USD}`}), which is not the job's $${draft.budgetUsd}.`);
say('It stops at prepareSigning: it never signs, and it never runs the job.');
say('');
say(`  ANTHROPIC_API_KEY=... node scripts/run-author.mjs ${childArgs.join(' ')}`);
// NO KEY, NO OFFER. `run-author.mjs` refuses without one and exits 2 at its own
// door, before a spine exists — so with the shell unkeyed this question has
// exactly one possible outcome for the person, and putting it anyway spends
// their attention on a choice they do not have. What is actionable instead is
// the command above and the one line that says how to make it work.
const KEYED = Boolean(process.env.ANTHROPIC_API_KEY);
if (!KEYED) {
  say('');
  say('  (ANTHROPIC_API_KEY is not set in this shell — run-author refuses without it; secrets load from the environment, never the tree)');
  // The repair, in plain words and WITHOUT a command: which secret store a person
  // keeps their key in is theirs, and printing one specific incantation would be
  // this script guessing at their setup — while the one thing it must never do is
  // put a key anywhere a command line can be read from.
  say('  set the key in the shell you run it from, e.g. from your secret store, then paste the command above.');
}
say('');
// The default is NO, and it is the same lean the pause's doors take: the answer that
// costs nothing is the one you get by saying nothing. Only an explicit yes spends.
// Unkeyed, the offer is never made and the answer is the default one — not a
// refusal typed on the person's behalf, but the only answer the state admits.
let answer = '';
if (KEYED) {
  prompt('Run it now? [y/N] ');
  const l = await nextLine();
  answer = l === null ? '' : String(l).trim().toLowerCase();
}
// the reader lets go of stdin BEFORE the child is spawned: `stdio:'inherit'` hands
// the same descriptor over, and two readers on one terminal is a keystroke landing
// in whichever of them happens to be listening.
rl.close();
if (answer !== 'y' && answer !== 'yes') {
  say('');
  say(KEYED
    ? 'Not run. The command above is yours to fire when you are ready — the two files are already on disk.'
    : 'Not offered — there is no key in this shell to run it with. The command above is yours to fire once you set one; the two files are already on disk.');
  // F71 — never process.exit() after output: exit() can discard queued stdout.
  process.exitCode = 0;
} else {
  say('');
  const child = spawnSync(process.execPath, [RUN_AUTHOR, ...childArgs], { stdio: 'inherit' });
  if (child.error) {
    say(`run-author could not be started (${child.error.message}) — the command above still stands.`);
    process.exitCode = 2;
  } else {
    // the child's own exit is the answer: a refusal there is a RESULT, and flattening
    // it to 0 here would report a stop as a success one process up.
    process.exitCode = child.status ?? 2;
  }
}
