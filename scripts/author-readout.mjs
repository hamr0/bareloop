// The authoring runner's SIGNING readout — the goal, and the stages that will
// judge it — in the one place a test can reach it.
//
// `run-author.mjs` is a script: importing it runs it, and the block this replaces
// is only reached after a real scout and a real model call. So the lines a person
// actually signs against live here instead, and the runner calls them — the same
// reason `u-readout.mjs` exists.
//
// F87 is the whole point of the pairing. The goal must state everything the close
// will judge, and NOTHING derives one from the other or checks them against each
// other; an unstated stage is a cost the run discovers at its tail. The only
// defence is that the person signing reads both halves at once — and neither
// signing surface offered that: this one printed the declaration and never the
// goal, run-u's --approve gate printed the goal and never the declaration.
// A half of a reading is not a smaller reading; it is a different one.
//
// The ceiling parse and the crash record below are here for the same one reason,
// not because they are readouts: the runner is a script, and a rule no test can
// reach is a rule nothing checks.
import { scrubRaw } from '../src/text.js';
import { redactSecrets } from '../src/validate.js';
import { JUDGED_FLOOR_KIND } from '../src/kinds.js';

/**
 * @param {{goal?: string|null, closeDecl?: any}} spec the RESOLVED spec — the bytes
 *   that get hashed and signed, never the operator's draft and never the authored
 *   half on its own.
 * @returns {string[]} one console line each, in print order.
 */
export function declarationLines({ goal, closeDecl }) {
  // An absent goal reads as ABSENT. A bare `goal` label with nothing after it is
  // indistinguishable from a goal that says nothing, and this readout exists to
  // make exactly that kind of silence visible.
  const lines = [`goal       ${goal === undefined || goal === null || goal === '' ? '(none — the draft carried no goal, and a close judges against one)' : JSON.stringify(goal)}`];
  lines.push('declaration');
  for (const s of closeDecl?.stages ?? []) {
    lines.push(`  ${s.name}  [${s.kind}]${s.offer === false ? '  (not lendable)' : ''}${(s.needs ?? []).length ? `  needs: ${s.needs.join(', ')}` : ''}`);
    lines.push(`      params ${JSON.stringify(s.params ?? {})}`);
  }
  for (const n of closeDecl?.notes ?? []) lines.push(`  note: ${n}`);
  return lines;
}

/**
 * THE TWO SIGNED JUDGED ARTIFACTS, as a person reads them before signing
 * (softgreen modules 4+5). Absent on a close that judges nothing, which is why
 * this returns an EMPTY list rather than a "no card" line: a green close has no
 * rubric and saying so every run is noise, not information.
 *
 * The CARD is printed in full — it is short, it is the whole standard the judge
 * will hold the work to, and it is the signer's own words. The CASES are printed
 * as a ROSTER (id, verdict, itemized reds) rather than in full: ten real source
 * artifacts is a page of code the terminal cannot usefully show, and what a
 * signer checks at this surface is that both polarities are there and that each
 * red names something they recognise. The artifacts themselves are in the spec
 * file, which is named right above this block.
 * @param {{closeDecl?: any}} spec the RESOLVED spec
 * @returns {string[]}
 */
export function rubricLines({ closeDecl }) {
  const judged = (closeDecl?.stages ?? []).filter((/** @type {any} */ s) => s?.kind === JUDGED_FLOOR_KIND);
  if (!judged.length) return [];
  /** @type {string[]} */
  const lines = ['rubric card (what the judge will hold the work to — YOUR words, signed)'];
  for (const it of judged[0]?.params?.card?.items ?? []) lines.push(`  [${it.rule}] ${it.text}`);
  const cases = closeDecl?.calibration?.cases ?? null;
  if (cases === null) {
    lines.push('calibration  NONE STORED — a judged close is not signable without one');
    return lines;
  }
  const pass = cases.filter((/** @type {any} */ c) => c?.expect?.verdict === 'pass').length;
  lines.push(`calibration set (${cases.length} case(s): ${pass} pass, ${cases.length - pass} red)`);
  for (const c of cases) {
    const reds = (c?.expect?.reds ?? []).map((/** @type {any} */ r) => `${r.rule}@${r.fn}`).join(', ');
    lines.push(`  ${String(c?.expect?.verdict ?? '?').padEnd(4)} ${c?.id}${reds ? `  → ${reds}` : ''}`);
  }
  return lines;
}

/**
 * THE CALIBRATION GATE'S OWN READOUT — the one gate that spends money, and the
 * one whose rows a signer has to read case by case.
 *
 * ITEMIZED, never an aggregate percentage: "9/10" tells a person nothing about
 * which line of their own rubric is wrong, and the fix for a miss is a card line
 * or a corrected case (§4.3's ceiling). A CASUALTY prints under its own name and
 * says so, because a dead judge is not a failed set.
 * @param {any} calibration `signing.gates.calibration`
 * @returns {string[]}
 */
export function calibrationLines(calibration) {
  if (!calibration) return ['  4 calibration  not reached'];
  if (calibration.stop === 'calibration-missing') {
    return ['  4 calibration  FAIL — this close judges, and no calibration set is stored with it'];
  }
  if (calibration.stop === 'no-judge') {
    return ['  4 calibration  FAIL — no judge seam was wired, so the gate never ran (a wiring gap, never a pass)'];
  }
  const graded = calibration.graded ?? [];
  const styles = calibration.injection?.styles ?? [];
  /** @type {string[]} */
  const lines = [`  4 calibration  ${calibration.ok ? 'PASS' : 'FAIL'} — ${graded.filter((/** @type {any} */ g) => g.ok).length}/`
    + `${graded.length} case(s) graded correctly, ${styles.filter((/** @type {any} */ s) => s.resisted).length}/${styles.length} `
    + `injection style(s) resisted  [judge ${calibration.judgeModel}]`];
  if (calibration.casualty) {
    lines.push(`      CASUALTY on ${calibration.casualty.kind} "${calibration.casualty.at}" [${calibration.casualty.axis}] `
      + '— a broken judge is no evidence about the set');
  }
  for (const g of graded.filter((/** @type {any} */ x) => !x.ok)) lines.push(`      WRONG  ${g.id}: ${g.detail}`);
  for (const s of styles.filter((/** @type {any} */ x) => !x.resisted)) lines.push(`      LEAK   ${s.style}: ${s.detail}`);
  lines.push(`      certified  card ${String(calibration.cardHash ?? 'unknown').slice(0, 12)}  cases `
    + `${String(calibration.casesHash ?? 'unknown').slice(0, 12)}  set ${String(calibration.setHash ?? 'unknown').slice(0, 12)}`);
  return lines;
}

/**
 * THE AUTHORING CEILING, parsed from `--budget`. Housed here for the same reason
 * the readout above is: the runner is a script, and a rule no test can reach is a
 * rule nothing checks.
 *
 * ABSENT IS UNBOUNDED, and that is the only way to get there. A malformed value
 * is an ERROR rather than a fallback: `--budget banana` silently collapsing to
 * "no ceiling" is precisely the failure this flag exists to prevent, wearing the
 * operator's own typo. Zero and negatives are rejected on the same rule — a
 * ceiling that can fund nothing is a typo for "unbounded" far more often than it
 * is a request, and the honest way to ask for nothing is not to ask.
 *
 * There is NO DEFAULT anywhere in this function, deliberately: a defaulted cap is
 * a silent second ceiling (the `maxWallMs` precedent), and the number is the
 * operator's to set or to decline.
 * @param {string|null} raw the argv value, or null when the flag was not given
 * @returns {{ceilingUsd: number|null, error: string|null}}
 */
export function parseCeiling(raw) {
  if (raw === null) return { ceilingUsd: null, error: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      ceilingUsd: null,
      error: `--budget ${raw} is not a positive number of dollars — omit the flag entirely to run UNBOUNDED, which is `
        + 'stated on stdout; there is no way to ask for a ceiling and get none by accident',
    };
  }
  return { ceilingUsd: n, error: null };
}

/**
 * The ceiling's header line. An UNBOUNDED run is ANNOUNCED — printed before the
 * provider is built, so it reaches stdout ahead of the first paid byte rather
 * than being inferred from the total afterwards. An unbounded run is legal; it is
 * never allowed to be an accident.
 * @param {number|null} ceilingUsd
 */
export function ceilingLine(ceilingUsd) {
  return ceilingUsd === null
    ? 'budget   UNBOUNDED — no --budget was given, so nothing stops this pipeline spending; spend is reported, never capped'
    : `budget   $${ceilingUsd} ceiling — the pipeline stops BETWEEN metered calls once the spend reaches it`;
}

/**
 * ONE PROGRESS PHASE, as a console line.
 *
 * The pipeline used to run up to ~15 minutes saying nothing between
 * `author-start` and its result — a real survey ladder, a real declaration
 * ladder, and a real toolchain per close stage, all inside one await. Silence
 * and a hang are the same bytes on a terminal, and the operator's only lever is
 * to kill a run that may be working.
 *
 * It says WHAT is happening, never how far along it is: there is no honest
 * fraction to print (a survey attempt has no progress, and a suite stage
 * finishes when it finishes), and an invented percentage is a number nobody
 * measured. What it does carry is the two facts a person waiting actually uses —
 * which phase, and how long the last thing took.
 *
 * `durationMs` prints as UNKNOWN when it is absent rather than as 0 (F6's rule,
 * in its time form): a stage whose duration was never measured did not take no
 * time.
 * @param {string} phase @param {any} [data]
 * @returns {string}
 */
export function phaseLine(phase, data = {}) {
  const ms = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) ? `${(v / 1000).toFixed(1)}s` : 'unknown');
  switch (phase) {
    case 'seed': return '· reading the seed commit…';
    case 'scout': return `· scout running (up to ${data.attempts ?? '?'} attempt(s)) — a real survey over the repository…`;
    case 'scout-done': return `· scout ${data.state ?? 'unknown'} — ${data.facts ?? 0} fact(s)`;
    case 'listing': return '· listing the files the declaration may name…';
    case 'listing-done': return `· listing ${data.stop ? `STOPPED (${data.stop})` : `${data.files ?? 'unknown'} file(s)`}`;
    case 'author': return '· authoring the close declaration…';
    case 'author-call': return `· ${data.call} (call ${(data.i ?? 0) + 1} of up to ${(data.of ?? 0) + 1})…`;
    case 'seed-read': return `· measuring ${data.stages ?? '?'} stage(s) at the seed — each one runs a real toolchain…`;
    case 'stage': return `·   ${data.stage} [${data.kind}] ${data.verdict} — ${ms(data.durationMs)}`;
    case 'seed-read-done': return `· seed read done (${data.stages ?? '?'} stage(s))`;
    // softgreen modules 4+5: the compile, and the paid gate that grades it
    case 'rubric': return `· compiling the rubric card and ${data.size ?? '?'} calibration cases from your own answers…`;
    case 'rubric-done': return `· rubric ${data.ok ? 'compiled' : `NOT compiled (${data.stop ?? 'unknown'})`} after ${data.attempts ?? '?'} attempt(s)`;
    case 'rubric-scrubbed': return `· MASKED before storing: ${(data.paths ?? []).join(', ')} — the stored bytes differ from what was typed`;
    case 'calibration': return `· calibration gate: ${data.cases ?? '?'} case(s) + ${data.styles ?? '?'} injection style(s), one real judge call each…`;
    // A phase this renderer does not know is PRINTED, not swallowed: the callers
    // are the library's own seams and a new one appearing unrendered is how a
    // readout silently stops covering what it reports on.
    default: return `· ${phase} ${JSON.stringify(data ?? {})}`;
  }
}

/** an ABSENT field stays absent — `null`, never a filled-in guess — and every
 * field that survives goes through the ONE redactor on its way to a file that
 * outlives the run. `name`/`message`/`code` are short, but `message` is the field
 * most likely in this whole record to quote a path, a URL or an environment value
 * back at us, so it rides the same inventory as everything else.
 * @param {unknown} v */
const field = (v) => (v === undefined || v === null ? null : redactSecrets(String(v)));

/**
 * ONE crashed authoring run, ready for the spine.
 *
 * It exists because a crash used to leave NO body. `run-author.mjs` awaited the
 * paid pipeline at the top level, so a throw anywhere inside it went to the
 * operator's terminal as an unhandled rejection and the spine kept exactly one
 * line — `author-start` — which is byte-for-byte what a run still in flight looks
 * like. The terminal scrolls; the spine is the record.
 *
 * The STACK is the evidence (the incident that minted this had no idea WHERE the
 * throw came from), and a stack is the one field here that can be arbitrarily
 * long and can quote anything the process had open. So it goes through `scrubRaw`
 * — the ONE persist boundary for a raw blob — which redacts it over the same
 * `SECRET_PATTERNS` inventory the validator reds on and bounds it with the bound
 * announcing its own size (F28). Nothing here is hand-rolled: a second spelling
 * of either rule is how the two drift.
 *
 * A non-Error throw (a string, a plain object) is honest rather than coerced into
 * an Error shape: it has no `name`, so `name` is `null`, and `String(err)` is what
 * lands in the raw.
 * @param {unknown} err whatever was thrown
 * @returns {{name: string|null, message: string|null, code: string|null,
 *   raw: ReturnType<typeof scrubRaw>}}
 */
export function crashRecord(err) {
  const e = /** @type {any} */ (err);
  const obj = e !== null && (typeof e === 'object' || typeof e === 'function');
  const stack = obj && typeof e.stack === 'string' && e.stack ? e.stack : String(err);
  // ONE level of `cause`, and no recursion: a wrapped throw names its origin in
  // exactly that field, and `scrubRaw` already knows how a diagnosis becomes
  // persistable (it redacts `reason` through the same inventory). Walking a chain
  // would be speculative code standing over a shape nothing here has produced.
  const cause = obj ? e.cause : undefined;
  return {
    name: field(obj ? e.name : undefined),
    message: field(obj ? e.message : undefined),
    code: field(obj ? e.code : undefined),
    raw: scrubRaw({
      label: 'author-crash',
      attempt: 1,
      text: stack,
      reason: cause === undefined || cause === null ? null : String(cause?.message ?? cause),
    }),
  };
}
