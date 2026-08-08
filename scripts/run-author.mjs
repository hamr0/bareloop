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
//     --out /path/to/outdir [--lang js] [--timeout 300000]
//
//   answers.json   {"1": "...", ..., "7": "yes"}   the seven frozen questions
//   specdraft.json the OPERATOR half of a job-v1 spec — budgets, fence, cadence,
//                  goal, tools, escalation. NO close, NO verdictType: those two
//                  are what this pipeline authors and derives.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { authorCloseForJob, assembleSpec, prepareSigning, refusalEvents, TYPES_QUESTIONS } from '../src/authorjob.js';
import { makeLoopGenerate } from '../src/authorflow.js';
import { validateJob, jobSpecHash } from '../src/job.js';
import { scanSecrets } from '../src/validate.js';

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
const LANG = arg('lang') ?? 'js';
const timeoutArg = arg('timeout');
const TIMEOUT_MS = timeoutArg === null ? DEFAULT_TIMEOUT_MS : Number(timeoutArg);

if (!patientArg || !answersArg || !draftArg || !outArg) {
  die('usage: node scripts/run-author.mjs --patient <repoPath> --answers <answers.json> --draft <specdraft.json> --out <outdir> [--lang js] [--timeout <ms>]');
}
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
console.log(`  lang     ${LANG}`);
console.log(`  draft    ${resolve(/** @type {string} */ (draftArg))} (job "${draft?.job ?? '?'}")`);
console.log(`  out      ${OUT}`);
console.log(`  timeout  ${TIMEOUT_MS}ms per close stage`);
console.log('  stops at prepareSigning — this script NEVER signs and NEVER runs the job\n');

const provider = new AnthropicProvider({ apiKey, model: MODEL });
emit('author-start', { runid, patient: PATIENT, lang: LANG, model: MODEL, job: draft?.job ?? null, timeoutMs: TIMEOUT_MS });

// ── 1. answers → scout → the model fills the form → a close DECLARATION ──────
// `provider` drives the scout; `generate` is the declaration model boundary (one
// bare-agent Loop per call, the tool wired to end the call it is used in).
const authored = await authorCloseForJob({
  answers,
  repoPath: PATIENT,
  lang: LANG,
  questions: TYPES_QUESTIONS,
  provider,
  generate: makeLoopGenerate(provider),
});
const authoredFile = writeOut('authored.json', authored);
emit('authored', { ok: authored.ok, stop: authored.stop, seedRef: authored.seedRef, cost: authored.cost, reds: authored.reds });

console.log(`authoring  ${authored.ok ? 'OK' : 'NOT OK'}  stop=${authored.stop ?? 'none'}  seed=${authored.seedRef ?? 'unread'}`);
console.log(`cost       ${costLine(authored.cost)}`);
console.log(`written    ${authoredFile}`);

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
  console.log(`\nverdictType ${authored.verdictType} (DERIVED from the interview, never picked)`);
  console.log('declaration');
  for (const s of authored.closeDecl.stages ?? []) {
    console.log(`  ${s.name}  [${s.kind}]${s.offer === false ? '  (not lendable)' : ''}${(s.needs ?? []).length ? `  needs: ${s.needs.join(', ')}` : ''}`);
    console.log(`      params ${JSON.stringify(s.params ?? {})}`);
  }
  for (const n of authored.closeDecl.notes ?? []) console.log(`  note: ${n}`);
  console.log(`written    ${specFile}`);

  const jv = validateJob(spec);
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
