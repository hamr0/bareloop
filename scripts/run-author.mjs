// RUN-AUTHOR — the first LIVE end-to-end of the close-authoring pipeline (M1–M4b).
//
// Seven interview answers in; a REAL scout over a REAL repository; a REAL model
// filling the typed declaration form; the operator's own half of the spec folded
// in; the job validator; and D9's three mechanical gates. What comes out is a
// resolved spec, its hash, and the evidence to sign against.
//
// IT STOPS AT prepareSigning. It never signs and it never runs the job: the
// approvals array and the human's word are the arbiter relocating to the user,
// not disappearing (src/authorjob.js §3). There is no --approve here because
// there is nothing here to approve — signing and running are run-u's territory.
//
// A REFUSAL IS A RESULT. If the interview refuses, or the close cannot be
// authored, or a stage cannot run against the patient, or nothing is red at the
// seed — that comes back verbatim, is written to the out dir, and exits 1. It is
// counted demand against bareloop's own catalogue, never an error to swallow.
//
//   node scripts/run-author.mjs \
//     --patient /path/to/repo --answers answers.json --draft specdraft.json \
//     --verdict green --out /path/to/outdir [--lang js] [--timeout 300000] \
//     [--budget 2.50]
//
//   --budget       THE AUTHORING CEILING, in dollars, and it has NO DEFAULT. The
//                  pipeline pays for a survey (up to three attempts plus a
//                  reserved round) and a declaration loop (an author call, its
//                  revises, and each one's malformed-emission retries); with a
//                  ceiling set, the run stops BETWEEN calls the moment the spend
//                  reaches it. Left off, the run is UNBOUNDED and says so on
//                  stdout before it spends anything — a defaulted cap would be a
//                  silent second ceiling (the `maxWallMs` precedent), and an
//                  unbounded run must be a VISIBLE operator choice, never a state
//                  arrived at by omission.
//
//   --verdict      THE RADIO (PRD v1.57 §1): green | soft-green | hitl. It is the
//                  USER's answer, so it is asked rather than defaulted — a
//                  defaulted class would be this script answering a question the
//                  person was asked. v1 admits `green`; the other two return the
//                  honest counted refusal.
//   answers.json   {"1": "...", ..., "6": "..."}  the picked class's own frozen
//                  questions (green: six; the seventh slot was D13's genre
//                  confirm and is DELETED — the interview never asks about a
//                  genre, and that refusal moved to the composer).
//   specdraft.json the OPERATOR half of a job-v1 spec — budgets, fence, cadence,
//                  goal, tools, escalation. NO close, NO verdictType: the close is
//                  what this pipeline authors, and the class comes from --verdict.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import {
  authorCloseForJob, assembleSpec, prepareSigning, refusalEvents,
  VERDICT_CLASSES, questionsFor, AUTHORED_SPEC_FIELDS,
} from '../src/authorjob.js';
import { makeLoopGenerate } from '../src/authorflow.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { scanSecrets } from '../src/validate.js';
import { declarationLines, parseCeiling, ceilingLine } from './author-readout.mjs';

const require = createRequire(import.meta.url);
const { AnthropicProvider } = require('bare-agent/providers');

// The same tier run-u drafts and works on. The declaration is authored by a
// model, so the floor is the drafter floor (PRD v1.36: sonnet MINIMUM).
const MODEL = 'claude-sonnet-5';
/** the close precheck / seed read spawns real toolchains; the slowest stage is a
 * suite. Headroom, not a budget — and it is passed EXPLICITLY rather than left
 * to a default, because a defaulted cap is a silent second ceiling. */
const DEFAULT_TIMEOUT_MS = 300_000;

const arg = (/** @type {string} */ n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] ?? ''); };
const die = (/** @type {string} */ m) => { console.error(m); process.exit(2); };

const patientArg = arg('patient');
const answersArg = arg('answers');
const draftArg = arg('draft');
const outArg = arg('out');
const verdictArg = arg('verdict');
const LANG = arg('lang') ?? 'js';
const timeoutArg = arg('timeout');
const TIMEOUT_MS = timeoutArg === null ? DEFAULT_TIMEOUT_MS : Number(timeoutArg);
/** NO DEFAULT, deliberately: `null` is "nobody set one" and means UNBOUNDED. It
 * is never filled in here — the whole point of the flag is that the number is
 * the operator's, and a script that supplies one on their behalf has set a
 * ceiling nobody chose. Parsed through `author-readout.mjs` so the rule has a
 * home a test can reach. */
const { ceilingUsd: CEILING_USD, error: budgetError } = parseCeiling(arg('budget'));

if (!patientArg || !answersArg || !draftArg || !outArg || verdictArg === null) {
  die('usage: node scripts/run-author.mjs --patient <repoPath> --answers <answers.json> --draft <specdraft.json> '
    + `--verdict <${VERDICT_CLASSES.join('|')}> --out <outdir> [--lang js] [--timeout <ms>] [--budget <usd>]`);
}
// A malformed ceiling dies at the door rather than silently reading as absent.
if (budgetError) die(budgetError);
// the menu is handed over enumerated; an unknown value is a typo, and the
// interview refuses it as one (a LOCKED class is a different answer — it reaches
// the pipeline and comes back as counted demand)
const VERDICT = /** @type {string} */ (verdictArg);
if (!VERDICT_CLASSES.includes(VERDICT)) die(`--verdict ${VERDICT} is not a verdict class — one of ${VERDICT_CLASSES.join(' | ')}`);
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) die(`--timeout ${timeoutArg} is not a positive number of milliseconds`);

const PATIENT = resolve(/** @type {string} */ (patientArg));
if (!existsSync(PATIENT)) die(`--patient ${PATIENT} does not exist — the scout reads a repository off the machine, never out of prose`);
const OUT = resolve(/** @type {string} */ (outArg));

/** @param {string} label @param {string} file */
const readJson = (label, file) => {
  const p = resolve(file);
  if (!existsSync(p)) die(`--${label} ${p} does not exist`);
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return die(`--${label} ${p} is not readable JSON: ${e.message}`); }
};
const answers = readJson('answers', /** @type {string} */ (answersArg));
const draft = readJson('draft', /** @type {string} */ (draftArg));
// The draft is the OPERATOR half, and `assembleSpec` refuses one that already
// carries the authored half rather than merging over it. Asked HERE — before the
// scout, before any paid call — so a draft that cannot compose costs nothing to
// find out about; without this the same refusal arrives after the model has been
// paid, which is a true answer at the wrong price.
const carried = AUTHORED_SPEC_FIELDS.filter((f) => draft?.[f] !== undefined);
if (carried.length) {
  die(`--draft ${draftArg} carries ${carried.join(', ')} — the draft is the operator's half only. `
    + 'The close is what this pipeline authors and the class comes from --verdict; a draft that names either would be '
    + 'silently overwritten, and a signed spec that does not contain what its author typed is the failure nobody sees.');
}

// Secrets load from the environment; they never enter argv (a command line is
// world-readable on /proc) and they are never printed.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (secrets load from the environment — never the tree, never argv)'); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const runid = Date.now().toString(36);
const spineFile = join(OUT, `author-${runid}.jsonl`);
/** the spine: one JSONL line per event, appended. This runner owns it, exactly
 * as the shell owns `runJob`'s — `authorjob.js` emits nothing itself.
 * @param {string} type @param {any} [data] */
const emit = (type, data = {}) => {
  appendFileSync(spineFile, `${JSON.stringify({ type, ts: new Date().toISOString(), ...data })}\n`);
};
/** @param {string} name @param {any} body */
const writeOut = (name, body) => {
  const f = join(OUT, name);
  writeFileSync(f, `${JSON.stringify(body, null, 2)}\n`);
  return f;
};

/** F6 — an unpriced call makes the TOTAL unknown, and unknown is reported as
 * UNKNOWN. `?? 0` launders unknown into $0, and a bare floor that reads as exact
 * is F6 in an honest coat, so the floor is marked `≥`.
 * @param {any} cost a `makeCostBook().report()` */
const costLine = (cost) => {
  // `cost === null` is not an unknown: `authorCloseForJob` returns a cost book on
  // every path that reaches a model and `null` on every path that refuses before
  // one (the interview, the language check, the seed read). So this states the
  // FACT — no call was made — rather than reporting a number in either direction.
  if (!cost) return 'not metered — this path refused before any model call';
  if (cost.costUsd === null) {
    return `UNKNOWN — ≥$${cost.knownUsd.toFixed(6)} known across ${cost.calls?.length ?? 0} call(s), `
      + `${cost.nullCostCalls} unpriced call(s), ${cost.unpricedRounds} unpriced round(s)`;
  }
  return `$${cost.costUsd.toFixed(6)} across ${cost.calls?.length ?? 0} call(s) (spend complete)`;
};

console.log(`== close-authoring, run ${runid} ==  ${MODEL}`);
console.log(`  patient  ${PATIENT}`);
console.log(`  verdict  ${VERDICT}  (the USER's pick — this run authors a close that promises to stay at or below it)`);
console.log(`  lang     ${LANG}`);
console.log(`  draft    ${resolve(/** @type {string} */ (draftArg))} (job "${draft?.job ?? '?'}")`);
console.log(`  out      ${OUT}`);
console.log(`  timeout  ${TIMEOUT_MS}ms per close stage`);
// THE UNBOUNDED RUN IS ANNOUNCED. Printed before the provider is even built, so
// it is on stdout ahead of the first paid byte rather than discovered in the
// total afterwards.
console.log(`  ${ceilingLine(CEILING_USD)}`);
console.log('  stops at prepareSigning — this script NEVER signs and NEVER runs the job\n');

const provider = new AnthropicProvider({ apiKey, model: MODEL });
emit('author-start', { runid, patient: PATIENT, lang: LANG, verdictType: VERDICT, model: MODEL, job: draft?.job ?? null, timeoutMs: TIMEOUT_MS, ceilingUsd: CEILING_USD });

// ── 1. answers → scout → the model fills the form → a close DECLARATION ──────
// `provider` drives the scout; `generate` is the declaration model boundary (one
// bare-agent Loop per call, the tool wired to end the call it is used in).
const authored = await authorCloseForJob({
  answers,
  verdictType: VERDICT,
  repoPath: PATIENT,
  lang: LANG,
  // the picked class's own frozen set — LOCKED classes never reach here, they
  // refuse at admission before their questions are ever asked
  questions: VERDICT === 'green' ? questionsFor(VERDICT) : null,
  provider,
  generate: makeLoopGenerate(provider),
  // ONE number, both paid seams (the survey's and the declaration loop's) — the
  // advertised ceiling and the enforced ceiling are the same ceiling
  ceilingUsd: CEILING_USD,
});
const authoredFile = writeOut('authored.json', authored);
emit('authored', { ok: authored.ok, stop: authored.stop, seedRef: authored.seedRef, cost: authored.cost, reds: authored.reds });

console.log(`authoring  ${authored.ok ? 'OK' : 'NOT OK'}  stop=${authored.stop ?? 'none'}  seed=${authored.seedRef ?? 'unread'}`);
console.log(`cost       ${costLine(authored.cost)}`);
console.log(`written    ${authoredFile}`);

// THE GOVERNANCE STOP, read out on BOTH paths. A money stop can land with a
// signable close already authored and measured (`ok:true` — the cap tripped
// before a LATER revise), and burying it in that case would let a run that ran
// out of money read as a run that simply finished. It is not an error and it is
// not a verdict on the close: nothing retries, nothing is rolled back, and every
// artifact the run paid for is on disk exactly where it was written.
if (authored.stop === 'cap-halt' || authored.stop === 'pricing-red') {
  const c = authored.cost ?? {};
  // ONE reading of what this stop MEANS, spent on the console AND on the spine.
  // Two hand-spelled answers is two instruments, and this is exactly the pair
  // that must not disagree: a `cap-halt` says the money is gone, a `pricing-red`
  // says the meter went blind (F6), and they send the operator to different
  // repairs — one raises a number, the other binds a priced provider.
  const meaning = authored.stop === 'cap-halt'
    ? 'not under cap — not "can\'t"' // the shipped vocabulary, spelled the way ralph spells it
    : 'the spend cannot be SEEN, so the ceiling cannot govern it — a blind meter, not a spent wallet (F6)';
  console.log(`\n${authored.stop.toUpperCase()} — the authoring pipeline stopped on the operator's ceiling, not on anything it read`);
  console.log(`  ceiling  $${CEILING_USD}`);
  console.log(`  spent    ${costLine(authored.cost)}`);
  console.log(`  the cap binds BETWEEN calls, so nothing was cut off mid-flight — everything paid for is in ${OUT}`);
  console.log(authored.stop === 'cap-halt'
    ? '  the stop IS the checkpoint: raise --budget and re-run, or read what is here and stop'
    : '  unpriced is never free (F6) — a ceiling that cannot see the spend cannot enforce it, so the run stopped rather than spend blind');
  // THE TYPE IS THE STOP. It used to be the literal 'cap-halt' on both arms, so a
  // `pricing-red` was written down as a cap-halt with its real name demoted to a
  // payload field. Every OTHER emitter in this tree keys the two apart — ralph and
  // planrun emit `type:'cap-halt'` only ever with `category:'cap-halt'`, and a
  // pricing-red rides its own name (run.js's escalation) — so this was the one
  // site in the repo where the type and the category could disagree, and
  // type-keyed slicing is precisely how F45 misread a shared log.
  //
  // Latent, not live: nothing reads the author spine by type today. The nearest
  // reader is `classifyIncidents` (src/ledger.js), which sets `capHalted` on
  // `type === 'cap-halt'` and would therefore have armed the capability-gap fuse
  // — "the run cap-halted" — on a run whose wallet was never empty. Under its own
  // name a pricing-red instead falls through every branch and is simply not
  // counted, which is the FAIL-SAFE direction: uncounted, never miscounted.
  //
  // No falsy type can reach here: the `if` above narrows `authored.stop` to
  // exactly these two strings, so a guard would be speculative code standing over
  // an unreachable case rather than protection.
  emit(authored.stop, {
    category: authored.stop, meaning,
    ceilingUsd: CEILING_USD, spentUsd: c.costUsd ?? null, knownUsd: c.knownUsd ?? null,
    spendComplete: c.spendComplete ?? null,
  });
}

if (!authored.ok) {
  // Verbatim, and in full. A refusal is COUNTED demand against bareloop's own
  // catalogue (the `request-red` admission path) — narrating around it destroys
  // the evidence the verdict-classes rung waits on.
  if (authored.refusal) {
    const r = authored.refusal;
    console.log(`\nREFUSED (${r.kind})  verb=${r.verb ?? 'none'}  path=${r.path}`);
    console.log(r.detail);
    for (const o of r.options ?? []) console.log(`  · ${o}`);
    if (r.red) console.log(`  red: ${JSON.stringify(r.red)}`);
    for (const e of refusalEvents(r)) emit(e.type, e);
  }
  for (const red of authored.reds ?? []) {
    console.log(`\nRED ${red.code} at ${red.path}\n${red.detail}`);
    emit('job-red', red);
  }
  if (!authored.refusal && !(authored.reds ?? []).length) console.log(`\nNo refusal and no reds — the stop is "${authored.stop}" on its own (read ${authoredFile}).`);
  console.log(`\nSTOPPED at authoring. Nothing was assembled, nothing was validated, nothing was signed.`);
  emit('author-end', { outcome: 'not-authored', stop: authored.stop });
  process.exitCode = 1;
} else {
  // ── 2. the operator's half + the authored half → one spec ──────────────────
  const spec = assembleSpec(draft, authored);
  const specFile = writeOut('resolved-spec.json', spec);
  console.log(`\nverdictType ${authored.verdictType} (the person's own pick, validated — never inferred)`);
  // F87: the goal and the stages that judge it are ONE reading. This surface used to
  // print the declaration alone, which shows a signer everything the close measures
  // and nothing about whether the goal ever said so. Rendered from the RESOLVED spec
  // — the bytes that get hashed — and out of `scripts/author-readout.mjs`, because
  // this block is otherwise reachable only after a paid scout and a paid model call,
  // and a readout no test can reach is a readout nothing checks.
  for (const l of declarationLines(spec)) console.log(l);
  console.log(`written    ${specFile}`);

  // `shellCapUsd` COUPLES to the spec's own budget, exactly as run-u does it at the
  // launch site. Left off, both gates below judge against validateJob's default
  // ceiling of 2 — a silent second ceiling, and the worst-placed one there is: the
  // draft's `budgetUsd` is the operator's own signed input, so a $4 draft would be
  // paid for in full (interview, scout, declaration) and only THEN redded on a
  // number nobody set. The advertised budget and the enforced budget are the same
  // number; the agent may tighten and never widen, and neither may this script.
  const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
  emit('job-validate', { ok: jv.ok, reds: jv.reds });
  if (!jv.ok) {
    console.log(`\nSPEC INVALID — ${jv.reds.length} red(s):`);
    for (const red of jv.reds) console.log(`  ${red.code} at ${red.path}: ${red.detail}`);
    console.log('\nSTOPPED at validateJob. The draft and the authored close do not compose into a runnable spec.');
    emit('author-end', { outcome: 'spec-invalid' });
    process.exitCode = 1;
  } else {
    // ── 3. D9's three gates. Nothing here judges the close; it measures it. ───
    const signing = await prepareSigning({
      spec, workdir: PATIENT, seedRef: authored.seedRef, timeoutMs: TIMEOUT_MS,
      // gate 1a re-runs the job validator inside prepareSigning — same coupling, or
      // the spec that just passed above would fail the gate that signs it
      shellCapUsd: spec.budgetUsd,
    });
    const signingFile = writeOut('signing.json', signing);
    emit('signing', { ok: signing.ok, specHash: signing.specHash, seedRef: signing.seedRef, gates: signing.gates });

    const g = signing.gates ?? {};
    console.log('\ngates');
    console.log(`  1 declaration  ${g.declaration?.ok ? 'PASS' : 'FAIL'}  grounded=${g.declaration?.grounded ?? '-'}${g.declaration?.scoped ? `  scoped=${JSON.stringify(g.declaration.scoped)}` : ''}`);
    console.log(`  2 precheck     ${g.precheck === null ? 'not reached' : (g.precheck.ok ? 'PASS — every stage ran' : `FAIL — ${g.precheck.stops.length} stage(s) could not run`)}`);
    console.log(`  3 seed verdict ${g.seedVerdict === null ? 'not reached' : (g.seedVerdict.ok ? `PASS — work red at seed: ${g.seedVerdict.workRed.join(', ')}` : 'FAIL — no work stage is red at the seed')}`);
    if (g.seedVerdict) {
      console.log(`      red at seed:   ${g.seedVerdict.redAtSeed.join(', ') || '(none)'}`);
      console.log(`      green at seed: ${g.seedVerdict.greenAtSeed.join(', ') || '(none)'}`);
    }

    /** the seed evidence a user READS to decide whether this close measures their
     * job. `value`/`baseline` print as `unknown` when absent — never as 0. */
    const row = (/** @type {any} */ r) => {
      console.log(`  ${r.verdict.toUpperCase().padEnd(16)} ${r.stage} [${r.kind}]  value=${r.value ?? 'unknown'}  baseline=${r.baseline ?? 'unknown'}${r.baselineSource ? ` (${r.baselineSource})` : ''}`);
      for (const l of (r.gap ?? []).slice(0, 8)) console.log(`      | ${l}`);
      if ((r.gap ?? []).length > 8) console.log(`      | … ${r.gap.length - 8} more gap line(s) — full text in ${signingFile}`);
    };
    if ((signing.work ?? []).length) { console.log('\nwork stages at the seed'); for (const r of signing.work) row(r); }
    if ((signing.guards ?? []).length) { console.log('\nguard stages at the seed'); for (const r of signing.guards) row(r); }
    if ((signing.stops ?? []).length) { console.log('\nstages that could NOT RUN (a broken instrument is a casualty, never a verdict)'); for (const r of signing.stops) row(r); }

    if (signing.refusal) {
      const r = signing.refusal;
      console.log(`\nREFUSED (${r.kind})  verb=${r.verb ?? 'none'}  path=${r.path}`);
      console.log(r.detail);
      for (const o of r.options ?? []) console.log(`  · ${o}`);
      for (const e of refusalEvents(r)) emit(e.type, e);
    }
    for (const red of signing.reds ?? []) {
      console.log(`\nRED ${red.code} at ${red.path}\n${red.detail}`);
      emit('job-red', red);
    }

    console.log(`\nwritten    ${signingFile}`);
    const hash = jobSpecHash(spec);
    // A hash printed beside a refusal reads like something to sign. It is the
    // record of WHICH bytes were measured, and on a failed gate it says so.
    console.log(`spec hash  ${hash}${signing.ok ? '' : '  (for the record — this spec did NOT clear the gates and is not signable)'}`);
    // The hash prepareSigning returns is over the VALIDATED spec; this one is
    // over the assembled bytes. They are the same object by construction, and a
    // divergence would mean the validator normalized something — say it rather
    // than pick one.
    if (signing.specHash && signing.specHash !== hash) {
      console.log(`  NOTE  prepareSigning hashed ${signing.specHash} — the validator normalized the spec; sign the resolved one.`);
    }
    console.log(`total cost ${costLine(authored.cost)}   (the gates spend no tokens — they run commands)`);

    if (!signing.ok) {
      console.log('\nSIGNING NOT PREPARED — the close did not clear D9\'s gates. Nothing was signed and nothing was run.');
      emit('author-end', { outcome: 'gates-failed', specHash: hash });
      process.exitCode = 1;
    } else {
      console.log('\nSIGNING PREPARED — NOT SIGNED. This script stops here, by design.');
      console.log(`  the resolved spec is ${specFile} and it hashes to ${hash}`);
      console.log('  read the seed evidence above; if the close measures your job, the signature is yours to give.');
      emit('author-end', { outcome: 'prepared', specHash: hash });
    }
  }
}

// The hard line, on the artifacts this run just wrote. Count and PATH only —
// echoing a matched secret to stdout is the same leak, one hop on.
const written = [spineFile, join(OUT, 'authored.json'), join(OUT, 'resolved-spec.json'), join(OUT, 'signing.json')].filter((f) => existsSync(f));
const leaks = written.flatMap((f) => scanSecrets(readFileSync(f, 'utf8')).map(() => f));
if (leaks.length) {
  console.log(`\nLEAK: ${leaks.length} secret-shaped string(s) across ${new Set(leaks).size} written file(s) — the hard line is broken; do NOT sign this spec`);
  process.exitCode = 3; // distinct from 2 (operator/config) and 1 (a refusal or a failed gate)
}
console.log(`\nspine      ${spineFile}`);
// F71 — never process.exit() after output: exit() can discard queued stdout and
// produce a clean-looking short readout of a run that said more than that.
