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
//     `requiredAnswersFor`, keyed by verdict class), now the RESHAPED unified
//     form (PRD item 33 M3 piece 3): Goal / Success / Guardrails, soft-green
//     adding Judge Examples. Source and Destination are MECHANICAL fields —
//     proven against the machine rather than typed — and their wording is
//     ALSO the library's (`SOURCE_FIELD`, `destinationFieldFor`,
//     `src/authorflow.js`), so this script prints what the library hands it
//     for all six fields, never re-worded here, never re-ordered, never stored;
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
//     --verdict soft-green --provider anthropic-api \
//     --out /path/to/outdir [--budget 2.50] [--base-url https://api.deepseek.com/v1]
//
//   --provider     REQUIRED, NO DEFAULT (PRD item 34 L17): bareloop is
//                  LLM-agnostic, and a default here would silently lock every
//                  interview back onto one vendor. It is asked, once, and
//                  written into the draft's `provider` field — run-author.mjs
//                  then needs no flag of its own; it just resolves what this
//                  wrote down.
//
//   --base-url     OPTIONAL, NO DEFAULT (PRD item 33 close-out, "authoring
//                  provider selectable" — L17 named the provider but never
//                  admitted the endpoint): the table entry a provider name
//                  resolves to (`src/providers.js`) can be reached through an
//                  OpenAI-compatible gateway other than its own default host —
//                  DeepSeek, today's one secondary, is reached as
//                  `--provider openai-api --base-url https://api.deepseek.com/v1`.
//                  Absent, the field is left OUT of the draft entirely (never
//                  written as `null`/`''`): every provider constructor already
//                  defaults its own endpoint when none is given. When given, it
//                  goes into the draft's `baseUrl` field beside `provider` and
//                  through the SAME `validateJob` pass every other field takes
//                  below — an `http://` URL to a public host, an embedded
//                  `user:pass@`, or an unparseable string reds at $0, before
//                  anything is written (`src/job.js`'s existing `baseUrl` rule,
//                  PRD item 28 ruling (d): https:// required, http:// admitted
//                  only to a loopback host, never a credential in the URL).
//
// SOURCE AND DESTINATION REPLACE --patient (PRD item 33 M3, ruling 2,
// `docs/product/ITEM33-BUILD.md` "M3 — the intake form and confirm turn"): they
// are now the interview's own FIRST TWO QUESTIONS, asked before the picked
// class's frozen set, each proven mechanically for $0 the moment it is
// answered (`prepareSource`/`proveDestination`, `src/source.js`). For a repo
// source, Destination fills the signed `writeScope` field — the fence
// question this used to ask separately is GONE, folded into Destination. A
// non-repo source gets the form up to here and then an honest named stop:
// bareloop has no checks for that kind of job yet (ruling 7 → M4).
import {
  writeFileSync, mkdirSync, existsSync, readFileSync, statSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import {
  runInterview, questionsFor, requiredAnswersFor,
  VERDICT_CLASSES, LOCKED_CLASSES, UNLISTED_CLASSES, MENU_CLASSES, AUTHORED_SPEC_FIELDS, CONFIRM_AUTHORED_FIELDS,
  PLAIN_FOLDER_DEFERRED_FIELDS,
} from '../src/authorjob.js';
import {
  SOURCE_FIELD, destinationFieldFor, labelsFor,
} from '../src/authorflow.js';
import { validateJob, validateBaseUrl, PROVIDERS } from '../src/job.js';
import { resolveProvider, probeWarningLines, apiKeyProblem } from '../src/providers.js';
import { scanSecrets, redactSecrets } from '../src/validate.js';
import { detectLanguage } from '../src/detectlang.js';
import { prepareSource, proveDestination, looksLikeRepoSource, missingDependencies } from '../src/source.js';
import { parseCeiling, ceilingLine } from './author-readout.mjs';

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

// `--patient` IS GONE (PRD item 33 M3, ruling 2): Source and Destination are
// asked as the interview's own first two questions now, and each is proven
// against the machine the moment it is typed — never a flag handed on the
// command line. Stopped loud rather than silently ignored, the same rule
// `--lang`'s removal already applies below.
if (arg('patient') !== null) {
  die('--patient is no longer a flag — Source is now the interview\'s first question '
    + '(PRD item 33 M3, ruling 2). Drop --patient and rerun; you will be asked for the source there.');
}
const outArg = arg('out');
const verdictArg = arg('verdict');
const providerArg = arg('provider');
// OPTIONAL, NO DEFAULT (see the header comment above) — `null` means the flag
// was never given at all, and the draft carries no `baseUrl` field for that
// case (not `null`, not `''`: an absent field vs. an empty one mean different
// things to `validateJob`). `''` (the flag given with nothing after it) is a
// real, deliberate operator input — it is NOT special-cased here, and reds
// below through the same `validateJob` pass every other field takes, the same
// way an empty `--verdict`/`--provider` value already does elsewhere in this
// file.
const baseUrlArg = arg('base-url');
// `--lang` IS GONE (PRD item 33 M3, ruling 3): language is a FACT of the
// repository, read off its own manifest, never a flag a person sets. A
// `--lang` on the command line now is an operator error, stopped loud rather
// than silently ignored — the old default (`js`) would otherwise keep
// working by accident and hide that the flag no longer does anything.
if (arg('lang') !== null) {
  die('--lang is no longer a flag — language is auto-detected from Source\'s own manifest '
    + '(package.json/pyproject.toml/setup.py), never asked or set (PRD item 33 M3, ruling 3). Drop --lang and rerun.');
}
/** the AUTHORING ceiling, parsed by the same rule `run-author.mjs` parses it with
 * (`parseCeiling`): absent is UNBOUNDED and announced, a malformed value is an
 * error rather than a silent fallback. It is not stored in anything — it is handed
 * straight to the child, which is the process that spends it. */
const { ceilingUsd: CEILING_USD, error: budgetError } = parseCeiling(arg('budget'));

if (!outArg || verdictArg === null || !providerArg) {
  die('usage: node scripts/run-interview.mjs '
    + `--verdict <${MENU_CLASSES.join('|')}> --provider <${PROVIDERS.join('|')}> --out <outdir> [--budget <usd>] [--base-url <url>]`);
}
if (budgetError) die(budgetError);
// VALIDATED HERE, before a single line of the interview prints (never left to
// wait for `validateJob`'s pass over the finished draft, far below) — a typo
// must not cost the person the whole interview. `validateBaseUrl` is the ONE
// spelling of the shape rule (`src/job.js`), reused rather than re-checked by
// hand. The message NEVER echoes the raw value: it may carry credentials
// (`user:pass@host`), and naming the rule that refused it is enough.
if (baseUrlArg !== null) {
  const baseUrlErr = validateBaseUrl(baseUrlArg);
  if (baseUrlErr) die(`--base-url invalid — ${baseUrlErr}`);
}
// the menu is handed over ENUMERATED — an unknown value is a typo, refused as one.
// A LOCKED or UNLISTED class is a different answer entirely: it is admissible
// input, and the LIBRARY refuses it below as counted demand. `VERDICT_CLASSES` is
// the right list for the typo check for exactly that reason — narrowing it to the
// menu here would turn counted demand into an unrecorded typo (PRD item 31.1).
const VERDICT = /** @type {string} */ (verdictArg);
// the CHECK stays against the full `VERDICT_CLASSES` (see above); the PRINTED text
// names only the menu (item 34 L19: nothing customer-facing names an off-menu class).
if (!VERDICT_CLASSES.includes(VERDICT)) die(`--verdict ${VERDICT} is not a verdict class — one of ${MENU_CLASSES.join(' | ')}`);

// NO DEFAULT (PRD item 34 L17) — a default here would silently re-lock every
// interview onto one vendor. Missing or empty already died above, at the same
// usage message every other required flag shares, listing the same menu
// `src/job.js`'s own validator (`PROVIDERS`) admits. Membership is NOT
// re-checked here beyond that: `validateJob`, a few lines below, already reds
// an off-menu `provider` the same way it reds every other field — spelling
// that check twice would be the second rule this file keeps refusing to write.
const PROVIDER = /** @type {string} */ (providerArg);

const OUT = resolve(/** @type {string} */ (outArg));
/** the source door's own scratch root, fresh and unique per interview run —
 * created by `prepareSource` itself (never here: `into-exists` is its own
 * refusal for a reason), so only the PATH is decided up front. Under `--out`
 * per PRD item 33 M3 ruling 2. */
const runid = Date.now().toString(36);
const INTO = join(OUT, `source-${runid}`);

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

// ── the header (the part known before the interview starts) ─────────────────
say('INTERVIEW — your job, in your own words. Nothing here spends a cent.');
say(`  verdict  ${VERDICT}  (YOUR pick — the close this authors promises to stay at or below it)`);
say(`  provider ${PROVIDER}${baseUrlArg === null ? '' : `  (endpoint ${baseUrlArg})`}`);
say(`  out      ${OUT}`);
say(`  ${ceilingLine(CEILING_USD)}`);
say('  no model is called from here: this collects your answers and hands them to run-author.mjs, which does the paid part under the ceiling above');
say('  (answers can be several lines — press Enter on an empty line, i.e. Enter twice, to finish an answer)');
// PRD item 31.3's probe rule, same warning `scripts/run-u.mjs` already prints
// at launch — never a refusal, just visible before money is about to be spent.
for (const line of probeWarningLines(PROVIDER) ?? []) say(`  ${line}`);

// ── the OFF-MENU classes refuse BEFORE a single question, Source included ────
// Not this script's rule and not this script's words: `runInterview` is the
// admission path, and a locked pick comes back as a `request-red` refusal that is
// COUNTED demand for the class. Asking Source (which proves against the machine
// and can itself cost real disk I/O) for a job nothing here can close is an
// interview at the wrong price.
if (LOCKED_CLASSES.includes(VERDICT) || UNLISTED_CLASSES.includes(VERDICT)) {
  const iv = runInterview({ answers: {}, verdictType: VERDICT });
  const r = iv.refusal;
  say(`REFUSED (${r?.kind ?? 'request-red'})  verb=${r?.verb ?? VERDICT}  path=${r?.path ?? 'verdictType'}`);
  say(r?.detail ?? '');
  for (const o of r?.options ?? []) say(`  · ${o}`);
  say('\nNothing was asked and nothing was written — the refusal IS the record.');
  process.exit(1);
}

// ── 1. SOURCE — the form's first field (PRD item 33 M3, ruling 2) ────────────
say('');
say('── SOURCE ' + '─'.repeat(58));
// LIBRARY WORDING (PRD item 33 M3 piece 3, ruling 1) — this script prints what
// `src/authorflow.js` hands it and writes none of its own.
say(SOURCE_FIELD.prompt);
const sourceRaw = await readAnswer('the source',
  'Source is required — this is what the job reads. Again:');
const isUrl = /^https?:\/\//i.test(sourceRaw);
const SOURCE = isUrl ? sourceRaw : resolve(sourceRaw);
if (!isUrl && !existsSync(SOURCE)) {
  die(`${SOURCE} does not exist — Source is a folder, subfolder, file, or URL bareloop can actually read.`);
}
// the SAME rule `prepareSource` uses to route its own destination check
// (`looksLikeRepoSource`, `src/source.js`) — never a second, hand-typed copy
// of it. A Source that is a SUBFOLDER inside a git repo IS a repo source
// (PRD item 33 M3 ruling 2 addendum, 2026-09-13, landed 2a020d8): the
// boundary walks up to the NEAREST ancestor's `.git`, not only a `.git`
// sitting directly inside Source itself. It freezes as a repo (kind
// 'repo'), the same authoritative outcome `prepareSource`'s own walk
// produces for it — reported, never fought, below.
const IS_REPO = looksLikeRepoSource(SOURCE);

// ── LANGUAGE, DETECTED — never asked (PRD item 33 M3, ruling 3) ──────────────
// $0, no provider: reads the repo's own manifest, nearest wins, walking up to
// the repo root. Only run for a local DIRECTORY source — a URL or a single
// file skips detection entirely (M3 ruling 2/3: "not a code job"). Two of the
// four outcomes stop the interview before a single class question, on the
// same "counted demand, never a silent fallback" rule the old `--lang`
// comment already named:
//   - `ambiguous`             — two different languages' manifests at the same
//                               level; this script stays PROVIDER-FREE (D1),
//                               so it does not ask which one here — it says
//                               so and continues the form. The confirm turn
//                               (`run-author.mjs`, step S4) asks the person,
//                               interactively, before any paid call (D7).
//   - `language-unsupported`  — a known manifest (go.mod, Cargo.toml, ...)
//                               this catalogue has no genre data for yet.
//                               Refusing HERE, before any question, saves the
//                               person answering a form for a job that would
//                               only be refused later anyway.
// The other two outcomes are not errors and do not stop anything:
//   - `resolved`      — 'js' or 'python', carried through exactly where the
//                       old `--lang` value flowed.
//   - `no-code-job`   — no manifest anywhere in the walk. NOT a refusal (M3
//                       ruling 7): a plain-folder job still gets the form; it
//                       only gets an honest "no checks yet" stop later (M4).
let LANG = 'none-detected';
if (!isUrl && statSync(SOURCE).isDirectory()) {
  const langResult = detectLanguage(SOURCE);
  if (langResult.kind === 'ambiguous') {
    // NO LONGER DIES (PRD item 33 M3 piece 4, step S5): `LANG` takes the
    // first candidate as a placeholder — this script never signs anything
    // and never writes `lang` anywhere the placeholder could be mistaken for
    // the real pick; `run-author.mjs`'s own confirm turn resolves it for
    // real, interactively, before the scout (D7), and that pick — not this
    // one — is what lands in `closeDecl.lang`.
    say(`Source has more than one supported language's manifest at the same (nearest) level: `
      + `${langResult.candidates.join(', ')} (in ${langResult.dir}).`);
    say('Which one this job is about will be asked in the confirm turn, before any paid call, when you run run-author.mjs.');
    LANG = langResult.candidates[0];
  } else if (langResult.kind === 'language-unsupported') {
    const r = langResult.refusal;
    say(`REFUSED (${r.kind})  verb=${r.verb}  path=${r.path}`);
    say(r.detail);
    for (const o of r.options) say(`  · ${o}`);
    // Honest, not "the refusal IS the record": THIS script has no spine (D10 —
    // a spine here would be a new record format) and writes nothing at all, so
    // there is nothing anywhere that counts this stop as demand. Only
    // run-author.mjs's OWN language check (item 34 M3 loose-end fix) — reached
    // by running that script directly against a prepared --source — is what
    // records a language-unsupported stop as counted demand.
    say('\nNothing was asked and nothing was written, and nothing here recorded this stop: run-interview.mjs keeps no '
      + 'spine of its own. run-author.mjs, run directly against a prepared --source, is what records a language-unsupported '
      + 'stop as counted demand.');
    process.exit(1);
  } else {
    LANG = langResult.kind === 'resolved' ? langResult.lang : 'none-detected';
  }
}
say(`  source   ${SOURCE}`);
say(`  lang     ${LANG}`);

// ── 2. DESTINATION — the form's second field (PRD item 33 M3, ruling 2) ─────
// For a REPO source: the answer IS the write fence (`writeScope`) — exactly
// the FENCE question this interview used to ask separately, later, in the
// operator's half. That later question is GONE; `draft.writeScope` comes
// from here now.
// For every other kind: an absolute DIRECTORY the run may write into (never
// a filename) — proven against the machine, in a loop, so a bad answer is
// RE-ASKED rather than a hard exit (the same idiom every other answer in this
// script already uses).
say('');
say('── DESTINATION ' + '─'.repeat(53));
/** @type {string} */
let destinationRaw;
// LIBRARY WORDING (PRD item 33 M3 piece 3, ruling 1) — printed from
// `src/authorflow.js`'s own field, not re-typed here.
const destinationField = destinationFieldFor(IS_REPO);
if (IS_REPO) {
  say(destinationField.prompt);
  destinationRaw = await readAnswer('the destination', 'the destination is not optional: a run with no fence is ungated spend. Again:');
} else {
  say(destinationField.prompt);
  for (;;) {
    const raw = await readAnswer('the destination', 'the destination is not optional — a run that cannot land its result should never spend. Again:');
    // NEVER resolved against cwd here: `proveDestination` itself refuses a
    // relative answer by name (`destination-not-absolute`) — pre-resolving
    // would silently turn a person's typo'd relative path into an absolute
    // one on their behalf, the exact "never accepted, never filled in" rule
    // every other answer in this script already keeps.
    const dp = await proveDestination(raw, { into: INTO });
    if (dp.stop === null) { destinationRaw = raw; break; }
    say(`  ${dp.code}: ${dp.stop}`);
  }
}

// ── prepareSource — $0, no provider, BEFORE any class question (M3 ruling 2) ─
// Freezes Source into a hidden, scratch copy this job actually works from —
// H1's fix, the person never sees the git repo — and (for a non-repo source)
// re-proves Destination one more time against the machine, right before it
// matters, closing the gap between the interactive check above and the
// authoritative one `prepareSource` itself makes.
say('');
say(`preparing the source — a hidden, frozen copy this job works from ($0, no provider)…`);
const prep = await prepareSource({ source: SOURCE, into: INTO, destination: destinationRaw });
if (prep.stop !== null) {
  const field = prep.code.startsWith('destination') ? 'Destination' : prep.code === 'into-exists' ? 'the prepared copy' : 'Source';
  say(`REFUSED (${prep.code})  field=${field}`);
  say(prep.stop);
  say('\nNothing was authored.');
  process.exit(1);
}
say(`  tree     ${prep.tree}`);
say(`  kind     ${prep.manifest.kind}`);
say(`  seed     ${prep.manifest.seed}`);

// ── item 33 close-out: the install gap, named at $0, and WAITED FOR (F182 fix,
// hamr's ruling 2026-09-14 option A, candidate direction (a)) ── `prepareSource`
// copies only git-tracked files, so a JS/TS repo's copy never carries
// `node_modules`. bareloop NEVER runs an install itself — it names the gap and
// the exact command, and the person runs it themselves, in another terminal,
// in the copy. This script now PAUSES right here and re-checks, so the
// "Run it now?" offer at hand-off (below) is actually reachable once the
// install finishes — F182: previously the interview fell straight through to
// the class questions and only re-checked once, too late to ever offer.
const depsGap = prep.manifest.kind === 'repo'
  ? missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '')
  : null;
if (depsGap) {
  say('');
  say(`  The copy above has no installed packages (${depsGap.reason}).`);
  say('  bareloop never runs an install itself — run this in the copy, in another terminal:');
  say(`    cd ${prep.tree} && ${depsGap.command}`);
  say('');
  // Loops on the SAME check `missingDependencies` above already ran — never a
  // second, hand-typed copy of the rule. `skip` (or end of input) carries on
  // exactly as before this fix: the hand-off re-check further down still
  // suppresses the offer and says so. Any other line (including a blank
  // Enter) re-checks rather than being treated as a typo — the only way to
  // stop waiting is the one word `skip`.
  for (;;) {
    prompt('  Press Enter once it has finished to check again, or type skip to carry on without it: ');
    const l = await nextLine();
    if (l === null || String(l).trim().toLowerCase() === 'skip') break;
    const recheck = missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '');
    if (!recheck) { say('  packages found — carrying on.'); break; }
    say(`  still missing (${recheck.reason}) — try again, or type skip to carry on without it.`);
  }
}

// ── ruling 7 → D5 = A, amended 2026-09-21 (F191; PRD item 33 M3 piece 4,
// step S6): a non-repo source does not stop HERE — this script stays
// PROVIDER-FREE (D1) and has nothing of its own to stop for. D5 ORIGINALLY
// read "the honest no-checks-yet stop moves to AFTER the confirm turn": a
// plain folder's confirm turn crashed live instead (`classGuards` has no
// language to key off for one, run `mu4hc7sp`, F191) — the confirm turn is
// unreachable by construction for this kind of source, so it never runs one.
// `run-author.mjs` now stops immediately, at $0, with no confirm turn and no
// model call at all — this message says that truthfully, not the old promise.
const IS_PLAIN_FOLDER = prep.manifest.kind !== 'repo';
if (IS_PLAIN_FOLDER) {
  say('');
  say(`Source is not a code repository — it is a plain ${prep.manifest.kind} job. bareloop has no checks for this kind`);
  say('of job yet (a later build). The form continues, but running run-author.mjs will stop right away, at $0 —');
  say('no confirm turn, no model call, nothing written.');
}

// From here on, EVERYTHING that used to read the original patient path reads
// the PREPARED COPY instead (`prep.tree`) — the original is never touched
// again (patients are copies, always).
const TREE = prep.tree;
// `writeScope` IS Destination's proven fence for a REPO source (ruling 2) —
// for a plain folder, Destination is an OUTPUT directory, never a fence, and
// this build authors no close for that kind of job at all (D5), so the
// draft below carries NO `writeScope` field for one (`PLAIN_FOLDER_DEFERRED_
// FIELDS`, `src/authorjob.js`) rather than a meaningless one derived from an
// output path.
const writeScope = IS_PLAIN_FOLDER ? null : destinationRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

const QUESTIONS = questionsFor(VERDICT);
const LABELS = labelsFor(VERDICT);
const REQUIRED = requiredAnswersFor(VERDICT);
say('');
say(`  asks     ${REQUIRED.length} frozen question(s) for this class, then the numbers and names the job spec needs`);

// ── 3. the class's own frozen questions, one at a time ───────────────────────
/** @type {Record<string, string>} */
const answers = {};
let asked = 0;
for (const n of REQUIRED) {
  asked += 1;
  say('');
  say(`── ${asked} of ${REQUIRED.length} ${'─'.repeat(Math.max(0, 56 - String(asked).length))}`);
  // the FIELD LABEL, from the signed table (PRD item 33 M3 piece 3's wording
  // fix) — printed on its own line so the literal `${n}. ${QUESTIONS[n]}` below
  // stays byte-identical to what the library holds, which is what the wizard
  // test suite (`tests/run-interview.test.js`) asserts verbatim and in order.
  // A key with no signed-table row prints no label.
  if (LABELS[n]) say(LABELS[n]);
  // the frozen wording, printed as the library holds it. Numbered by the library's
  // own key, so the number a person sees is the number their answer is filed under.
  say(`${n}. ${QUESTIONS[n]}`);
  answers[n] = await readAnswer(`question ${n}`,
    'that one is required — every question in this class\'s set has to be answered before a close can be authored from it. Again:');
}

// ── 4. the OPERATOR's half of the spec — the part nothing authors for you ────
say('');
say('── THE JOB SPEC — the operator\'s half, and nothing here authors it for you ──');
say('  the close is what run-author writes; these are the money and the clock it runs under.');
say('');
say('The NAME of this job: kebab-case, letters and digits and dashes (e.g. `litectx-maintainer`).');
say('It names the spec file you sign, the branch the run works on, and the spine it writes.');
const jobName = await readAnswer('the job name',
  'the job needs a name — it is what the spec file, the run\'s work branch and its spine are all called. Again:');
say('');
// THE GOAL QUESTION IS GONE (PRD item 33 M3, ruling 5's 2026-09-13 addendum,
// D2 = option B): it used to be asked HERE, as a near-duplicate of the form's
// own Goal field, right after the recap printed the person's own answer back
// (F87's overlap, named but not fixed at the time). It is not merged away —
// it is REPLACED: the confirm turn (`runConfirmTurn`, wired into
// `scripts/run-author.mjs`, step S4) drafts the signed goal sentence from
// the person's Goal/Success answers, shows every check it names, and the
// person confirms or fixes it there, within its own 2-round cap. This script
// writes NO `goal` field at all — `run-author.mjs` sets `draft.goal` from
// the confirm turn's accepted plan before assembling the spec. `goal` never
// joins `AUTHORED_SPEC_FIELDS` (it stays an operator field by the letter of
// the rule); it is simply not THIS script's to ask for any more.
say('');
say(`The JOB's budget, in dollars — what the RUN may spend. This is NOT the authoring ceiling above (${ceilingLine(CEILING_USD).replace(/^budget\s+/, '')}).`);
const budgetUsd = await readNumber('the job budget', 'budgetUsd', (s) => Number(s));

say('');
say('The WALL, in MINUTES — how long the run may take. There is no default anywhere in bareloop for this:');
say('an unbounded run is legal and must be a VISIBLE choice, so it is asked rather than assumed.');
say('Type a number of minutes, or the word `none` to run with no wall at all.');
const wallMin = await readNumber('the wall', 'maxWallMs', (s) => (/^none$/i.test(s) ? null : Number(s)), true);

// ── 5. what gets written ─────────────────────────────────────────────────────
// THE LIBRARY'S OWN READING of the answers, not the raw keystrokes: `runInterview`
// validates completeness against the class's required set and scrubs every answer at
// INGEST (an answer becomes a prompt ingredient, a spine record and a signed artefact
// all at once, and a log that captures a key captures it forever). `repoPath` is the
// PREPARED COPY (`TREE`), never the original Source.
const iv = runInterview({ answers, verdictType: VERDICT, repoPath: TREE });
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
 * refused by `assembleSpec` rather than merged over, so this must not write one.
 * `goal` is DELIBERATELY ABSENT too (PRD item 33 M3, ruling 5's addendum, step S5) —
 * not because this script authors it, but because it no longer asks for it: the
 * confirm turn drafts and confirms the goal sentence, and `run-author.mjs` writes
 * `draft.goal` from that before assembling the spec (`CONFIRM_AUTHORED_FIELDS`). */
const draft = {
  schema: 'job-v1',
  job: jobName,
  // a record LABEL, never a statement of intent — the confirm turn's own
  // drafted goal sentence is where intent lives, and this field only has to
  // say which job's file you are looking at. Against the PREPARED COPY,
  // never the original Source.
  description: `${jobName} — authored through the bareloop interview (${VERDICT}, ${LANG}) against ${TREE}`,
  // bareloop is LLM-agnostic (PRD item 34 L17) — the operator's own pick, asked
  // rather than defaulted, one vendor from the SAME table the worker draws from.
  provider: PROVIDER,
  // ABSENT when `--base-url` was never given (`baseUrlArg === null`) — never
  // written as `null`/`''`; every provider constructor defaults its own
  // endpoint on its own in that case (PRD item 28 ruling (d)).
  ...(baseUrlArg === null ? {} : { baseUrl: baseUrlArg }),
  cadence: { unit: 'day', every: 1 },
  budgetUsd,
  ...(wallMin === null ? {} : { maxWallMs: Math.round(wallMin * 60_000) }),
  // ABSENT for a plain folder (`writeScope === null`, D5/step S6) — never a
  // meaningless fence derived from an output directory.
  ...(writeScope === null ? {} : { writeScope }),
  escalation: { mode: 'decision-ready' },
  // `tools` is deliberately OMITTED: an omitted menu hashes as the concrete current
  // TOOL_MENU (MED-1), which pins WHICH menu was signed and makes a widening flip the
  // hash. Naming one here would freeze today's list into the operator's own half.
};

// THE SAME VALIDATOR that will judge this after the paid call, run now for $0. Its
// reds about the AUTHORED half are expected — that half does not exist yet, by
// design — so they are filtered BY FIELD NAME off `AUTHORED_SPEC_FIELDS` rather than
// by re-listing them here. `CONFIRM_AUTHORED_FIELDS` (just `goal`) joins the same
// filter for the same reason: this draft has no goal yet either, and `validateJob`
// would otherwise red `missing-required` at a field the confirm turn — not this
// script — is what fills in (step S5). `PLAIN_FOLDER_DEFERRED_FIELDS` (just
// `writeScope`) joins it too (step S6): a repo draft always carries one, so this
// is a no-op there, and a plain-folder draft's own `missing-required` at
// `writeScope` is likewise expected — nothing in this build fills that in for a
// plain-folder job at all yet (M4). Everything else is a typo the person can fix
// in a second now, or pay a scout and a model call to discover.
const draftReds = validateJob(draft, { shellCapUsd: draft.budgetUsd }).reds
  .filter((r) => ![...AUTHORED_SPEC_FIELDS, ...CONFIRM_AUTHORED_FIELDS, ...PLAIN_FOLDER_DEFERRED_FIELDS]
    .some((f) => String(r.path) === f || String(r.path).startsWith(`${f}.`)));
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
say(`  fence    ${draft.writeScope ? draft.writeScope.join(', ') : '(none — a plain-folder job has no fence yet, M4)'}`);
if (draft.baseUrl !== undefined) say(`  endpoint ${draft.baseUrl}`);
// no goal line here — the confirm turn (run-author.mjs, step S4) drafts and
// confirms the goal sentence next; this draft carries none yet

// The hard line, on the two files this run just wrote. Count and PATH only — echoing
// a matched secret to stdout is the same leak, one hop on.
const leaks = [answersFile, draftFile].flatMap((f) => scanSecrets(readFileSync(f, 'utf8')).map(() => f));
if (leaks.length) {
  say('');
  say(`LEAK: ${leaks.length} secret-shaped string(s) across ${new Set(leaks).size} written file(s) — the hard line is broken; do NOT author from these`);
  process.exit(3); // distinct from 2 (operator/config) and 1 (a refusal)
}

// ── 6. the paid step, which is a DIFFERENT process under a DIFFERENT ceiling ─
const RUN_AUTHOR = fileURLToPath(new URL('./run-author.mjs', import.meta.url));
const childArgs = [
  '--source', TREE, '--answers', answersFile, '--draft', draftFile,
  '--verdict', VERDICT, '--out', OUT,
  ...(CEILING_USD === null ? [] : ['--budget', String(CEILING_USD)]),
];
say('');
// Repo and plain-folder sources hand off to genuinely different pipelines
// (D5 amended 2026-09-21, F191): a repo gets a real scout and stops at
// prepareSigning; a plain folder gets NEITHER a scout NOR a confirm turn —
// `run-author.mjs` stops immediately, at $0, no model call at all (the
// confirm turn is unreachable by construction for a source with no code
// language, see the D5 amendment above). Saying "scout", "confirm turn" or
// "prepareSigning" for a plain folder would describe a run that cannot
// happen on this source.
if (IS_REPO) {
  say('NEXT — the paid step: a real scout over that repository and a real model filling the declaration form.');
  say(`It runs under the AUTHORING ceiling (${CEILING_USD === null ? 'UNBOUNDED — you gave no --budget' : `$${CEILING_USD}`}), which is not the job's $${draft.budgetUsd}.`);
  say('It stops at prepareSigning: it never signs, and it never runs the job.');
} else {
  say('NEXT — running run-author.mjs on this source stops right away, at $0: no scout, no confirm turn, no model call.');
  say('It never signs and never runs the job — bareloop has no checks for this kind of job yet.');
}
say('');
// THE KEY NAME FOLLOWS THE CHOSEN PROVIDER (PRD item 34 L17) — no more
// hardcoded `ANTHROPIC_API_KEY`. `PROVIDER` already passed `validateJob`
// below by the time this prints, so `resolveProvider` here cannot throw on
// anything this script itself let through; the try/catch is only for the
// off-menu case `validateJob` reds but does not stop the write for (an
// admitted-but-uncrafted table entry would otherwise crash this print).
let providerEntry = null;
try { providerEntry = resolveProvider(PROVIDER); } catch { providerEntry = null; }
const providerEnvKey = providerEntry?.envKey ?? null;
say(`  ${providerEnvKey ?? 'YOUR_PROVIDER_API_KEY'}=... node scripts/run-author.mjs ${childArgs.join(' ')}`);
// An `openai-api` + `baseUrl` draft (DeepSeek, today's one secondary, reached
// this way) still reads its key from `OPENAI_API_KEY` — there is no separate
// "DeepSeek key" env var, and a person pointed only at the command above could
// reasonably miss that. Said once, plainly, never a key VALUE.
if (draft.baseUrl !== undefined && providerEnvKey) {
  say(`  (the endpoint above is reached through the "${PROVIDER}" table entry, so its key still goes in ${providerEnvKey} — there is no separate endpoint-specific key variable)`);
}
// NO KEY, NO OFFER. `run-author.mjs` refuses without one and exits 2 at its own
// door, before a spine exists — so with the shell unkeyed this question has
// exactly one possible outcome for the person, and putting it anyway spends
// their attention on a choice they do not have. What is actionable instead is
// the command above and the one line that says how to make it work.
// F181 — a key that IS set can still carry a shape run-author will refuse
// (a line break/control char/stray whitespace, e.g. a two-line secret-store
// entry). A malformed key must not count as KEYED: this offer must read the
// same "will it actually run" question run-author itself asks at its door.
const rawKeyValue = providerEnvKey ? process.env[providerEnvKey] : undefined;
const keyProblem = rawKeyValue ? apiKeyProblem(rawKeyValue) : null;
const KEYED = providerEnvKey !== null && Boolean(rawKeyValue) && !keyProblem;
if (!KEYED) {
  say('');
  if (providerEnvKey && keyProblem) {
    say(`  (${providerEnvKey} is set but ${keyProblem} — run-author refuses without a clean key; secrets are never trimmed or repaired, only reported)`);
  } else {
    say(providerEnvKey
      ? `  (${providerEnvKey} is not set in this shell — run-author refuses without it; secrets load from the environment, never the tree)`
      : `  (provider "${PROVIDER}" is not in the runnable table — run-author will refuse it loud; this is not a key problem)`);
  }
  // The repair, in plain words and WITHOUT a command: which secret store a person
  // keeps their key in is theirs, and printing one specific incantation would be
  // this script guessing at their setup — while the one thing it must never do is
  // put a key anywhere a command line can be read from.
  if (providerEnvKey && !keyProblem) say('  set the key in the shell you run it from, e.g. from your secret store, then paste the command above.');
}
// re-checked at the hand-off, not just once right after prepareSource: this is
// the LAST $0 point before the offer below could spend on a run that would
// only instrument-stop at its first tool-needing close stage. Still fires ⇒
// no offer, the same shape the KEYED gate above already uses.
const depsGapAtHandoff = prep.manifest.kind === 'repo'
  ? missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '')
  : null;
if (depsGapAtHandoff) {
  say('');
  say(`  The copy still has no installed packages (${depsGapAtHandoff.reason}) — run-author would only instrument-stop on it.`);
  say(`    cd ${prep.tree} && ${depsGapAtHandoff.command}`);
  say('  then run run-author.mjs yourself with the command above.');
}
say('');
// The default is NO, and it is the same lean the pause's doors take: the answer that
// costs nothing is the one you get by saying nothing. Only an explicit yes spends.
// Unkeyed, or with an unresolved install gap, the offer is never made and the
// answer is the default one — not a refusal typed on the person's behalf, but
// the only answer the state admits.
const OFFERABLE = KEYED && !depsGapAtHandoff;
let answer = '';
if (OFFERABLE) {
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
  say(OFFERABLE
    ? 'Not run. The command above is yours to fire when you are ready — the two files are already on disk.'
    : !KEYED
      ? 'Not offered — there is no key in this shell to run it with. The command above is yours to fire once you set one; the two files are already on disk.'
      : 'Not offered — the copy still has no installed packages. Install them, then fire the command above yourself; the two files are already on disk.');
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
