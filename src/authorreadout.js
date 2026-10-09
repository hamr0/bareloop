// The authoring runner's SIGNING readout — the goal, and the stages that will
// judge it — in the one place a test can reach it.
//
// PANEL-BUILD.md P0 task 4/4 — moved here (was `scripts/author-readout.mjs`)
// because its callers (`src/authorrun.js`, `src/interviewrun.js`) now live
// under `src/`, and `tsconfig.json`'s `rootDir: ./src` refuses an import that
// reaches back out into `scripts/`. This module carries no executable
// top-level code and no logic changed in the move — only the three relative
// import paths below, from `../src/x.js` to `./x.js`.
//
// The lines a person actually signs against live here rather than inline in
// the runner, and the runner calls them — the same reason `src/u-readout.js`
// exists.
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
import { scrubRaw } from './text.js';
import { redactSecrets } from './validate.js';
import { judgedStages } from './kinds.js';
import { CALIBRATION_SIZE } from './judged.js';

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
 * F176'S FALLBACK, SAID OUT LOUD — the revise ladder kept the NEWEST SOUND
 * declaration rather than the last one it happened to try, because "kept the
 * last accepted revision" is not the same claim as "kept the best revision"
 * (docs/logs/FINDINGS.md F176). Absent on every run where the fallback never
 * fired (the overwhelming majority), which is why this returns an EMPTY list
 * rather than a "no fallback" line — a green close has nothing to say here and
 * printing it every run would be noise, not information.
 * @param {{fellBack?: {from: string, to: string, brokenStages: string[]}|null}|null} authoring `authored.authoring`
 * @returns {string[]}
 */
export function fellBackLines(authoring) {
  const fb = authoring?.fellBack;
  if (!fb) return [];
  const stages = fb.brokenStages?.length ? fb.brokenStages.join(', ') : '(unnamed)';
  return [`FELL BACK  ${fb.from} broke ${fb.brokenStages?.length ?? 0} check(s) (${stages}) — kept ${fb.to} instead`];
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
  const judged = judgedStages(closeDecl);
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
 * THE CONFIRM TURN'S OPEN QUESTIONS (PRD item 33 M3 piece 4, ruling 5's D3
 * addendum) — shown at the SIGNING readout, from `authored.json`'s own
 * `confirmed.openQuestions`, never added to the signed spec format itself
 * (D4: the closeDecl's `notes` are the model's own record; this is the
 * person's "fix" text from a round that hit the 2-round cap, ruling 5,
 * passed to the composer verbatim rather than spending a 3rd call, D3). A
 * close with none is shown as `(none)` rather than an empty line — the
 * absence is itself part of what the signer reads before signing.
 * @param {{openQuestions?: string[]}|null} confirmed `authored.confirmed`
 * @returns {string[]}
 */
export function openQuestionLines(confirmed) {
  const qs = confirmed?.openQuestions ?? [];
  if (!qs.length) return ['open questions  (none)'];
  const lines = [`open questions  ${qs.length} — the confirm turn hit its 2-round cap with a "fix" still pending; read `
    + 'these before you sign'];
  for (const q of qs) lines.push(`  ? ${q}`);
  return lines;
}

/**
 * F175's open half, said at the SIGNING readout too (run mu0voeo4, hamr's
 * 2026-09-16 ruling) — every question the plan raised that "Confirm" or
 * "Type the goal yourself" forced the person to answer inline, from
 * `authored.json`'s own `confirmed.answeredQuestions`. Shown only when
 * non-empty (the overwhelming majority of plans raise no question at all,
 * and printing an empty block every run would be noise, not information) —
 * unlike {@link openQuestionLines}, an empty list here says nothing, because
 * absence is the ordinary case, not a fact the signer needs flagged.
 * @param {{answeredQuestions?: string[]}|null} confirmed `authored.confirmed`
 * @returns {string[]}
 */
export function answeredQuestionLines(confirmed) {
  const qas = confirmed?.answeredQuestions ?? [];
  if (!qas.length) return [];
  const lines = [`answered questions  ${qas.length} — the plan raised these and the person answered them inline before signing`];
  for (const qa of qas) for (const line of String(qa).split('\n')) lines.push(`  ${line}`);
  return lines;
}

/** a quote for a human line: one line, cut at `max` with the cut VISIBLE
 * @param {unknown} q @param {number} [max] @returns {string} */
function shortQuote(q, max = 80) {
  const one = String(q ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…[truncated, ${one.length} chars]` : one;
}

/**
 * ONE plain line saying WHY a graded case reds, read off its own `diag` (F192):
 * the first red's rule, function, `why` and quoted text — and how many more the
 * record holds. A case with no reds says why it has none (no facts: each
 * attempt's axis and cause). Null when the row predates `diag`.
 * @param {any} row a `graded` or `injection.styles` row
 * @returns {string|null}
 */
function diagLine(row) {
  const d = row?.diag;
  if (!d) return null;
  const first = d.reds?.[0];
  if (first) {
    const more = d.reds.length > 1 ? ` (+${d.reds.length - 1} more red(s) in signing.json)` : '';
    return `          why: ${first.rule} · ${first.fn} — ${first.why}; quote: ${first.quote === null ? '(none)' : `"${shortQuote(first.quote)}"`}${more}`;
  }
  const failed = (d.attempts ?? []).filter((/** @type {any} */ a) => !a.ok);
  if (failed.length) {
    return `          why: no facts — ${failed.map((/** @type {any} */ a) => `attempt ${a.attempt} [${a.axis}] ${shortQuote(a.detail, 120)}`).join('; ')}`;
  }
  return d.reason ? `          why: ${shortQuote(d.reason, 120)}` : null;
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
    const cl = diagLine(calibration.casualty);
    if (cl) lines.push(cl);
  }
  for (const g of graded.filter((/** @type {any} */ x) => !x.ok)) {
    lines.push(`      WRONG  ${g.id}: ${g.detail}`);
    const l = diagLine(g);
    if (l) lines.push(l);
  }
  for (const s of styles.filter((/** @type {any} */ x) => !x.resisted)) {
    lines.push(`      LEAK   ${s.style}: ${s.detail}`);
    const l = diagLine(s);
    if (l) lines.push(l);
  }
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

// ── THE PLAIN REASON FOR A REFUSED RUBRIC PROPOSAL ──────────────────────────
//
// A rubric draft that stopped at `proposal-invalid` / `rubric-invalid` used to
// say only that code, and the technical reds behind it were lost to the person
// (live, panel session smv0j8bp2pbyn, 2026-10-09; hamr: "A user should get a
// reason that they can understand and do something about"). ONE owner: the
// panel session and the CLI both print `proposalStopText`, so there is one
// spelling and two doors. Every sentence is written HERE, by code — the model
// never words a reason — and the structured red travels beside it so the record
// loses nothing.

/** the longest case name / quoted piece a plain sentence will carry */
const PLAIN_QUOTE_MAX = 60;
/** the most bullets a message lists before it says how many more there are */
const PLAIN_MAX_BULLETS = 8;
/** the most reds one drafting-log record carries, and the longest string in any of them */
const RECORD_MAX_REDS = 40;
const RECORD_STR_MAX = 600;

/** model-derived text in a person-facing line: scrubbed, one line, bounded
 * @param {unknown} s @returns {string} */
function safeText(s) {
  const one = redactSecrets(String(s ?? '')).replace(/\s+/g, ' ').trim();
  return one.length > PLAIN_QUOTE_MAX ? `${one.slice(0, PLAIN_QUOTE_MAX)}…` : one;
}

/**
 * @typedef {{code: string, path: string, detail: string, [k: string]: any}} PlainRed
 * @typedef {{kind: string, sentence: string, red: PlainRed}} PlainReason
 */

/**
 * The ONE table of plain kinds → sentence builders. A builder gets the red, the
 * name of the case it lands on (when it lands on one) and the match of the
 * regex that picked it. `unmapped` is the only kind the table does not list.
 * Order matters: the first matching entry wins.
 * @type {{kind: string, when: (r: PlainRed) => boolean, say: (r: PlainRed, c: string, m: RegExpMatchArray|null) => string}[]}
 */
const PLAIN_TABLE = [
  // ── the rubric card (validateCard, surfaced as code invalid-value at path "card") ──
  { kind: 'card-not-object', when: (r) => r.code === 'invalid-value' && /^the card must be an object/.test(r.detail),
    say: () => 'The model did not hand back a rubric in the expected shape.' },
  { kind: 'card-empty', when: (r) => r.code === 'invalid-value' && /^the card must carry a non-empty/.test(r.detail),
    say: () => 'The model\'s rubric has no rules in it.' },
  { kind: 'card-line-bad', when: (r) => r.code === 'invalid-value' && /^card item \d+: must be an object/.test(r.detail),
    say: (r) => `Rubric line ${cardLineNo(r)} is not a proper line.` },
  { kind: 'card-line-no-rule', when: (r) => r.code === 'invalid-value' && /^card item \d+: needs a `rule`/.test(r.detail),
    say: (r) => `Rubric line ${cardLineNo(r)} does not pick which rule it uses.` },
  { kind: 'card-line-unknown-rule', when: (r) => r.code === 'invalid-value' && /^card item \d+: `.*` is not a rule this arbiter implements/.test(r.detail),
    say: (r, _c, _m) => `Rubric line ${cardLineNo(r)} names a rule bareloop does not have (${safeText(/`(.*?)` is not a rule/.exec(r.detail)?.[1] ?? '')}).` },
  { kind: 'card-line-repeat', when: (r) => r.code === 'invalid-value' && /^card item \d+: `.*` is named twice/.test(r.detail),
    say: (r) => `Rubric line ${cardLineNo(r)} uses a rule that an earlier line already uses.` },
  { kind: 'card-line-no-text', when: (r) => r.code === 'invalid-value' && /^card item \d+: needs `text`/.test(r.detail),
    say: (r) => `Rubric line ${cardLineNo(r)} has no wording.` },
  { kind: 'proposal-not-object', when: (r) => r.code === 'invalid-value' && r.path === 'proposal',
    say: () => 'The model\'s answer was not a rubric plus practice cases.' },
  // ── the practice-case set as a whole ──
  { kind: 'set-no-rules', when: (r) => r.code === 'calibration-cardless',
    say: () => 'The rubric has no rules, so the practice cases had nothing to be checked against.' },
  { kind: 'set-not-list', when: (r) => r.code === 'calibration-size' && !('declared' in r),
    say: () => `The practice cases did not come back as a list of ${CALIBRATION_SIZE}.` },
  { kind: 'set-size', when: (r) => r.code === 'calibration-size',
    say: (r) => `The model gave ${r.declared} practice case${r.declared === 1 ? '' : 's'}; exactly ${r.required ?? CALIBRATION_SIZE} are needed.` },
  { kind: 'set-one-sided', when: (r) => r.code === 'calibration-polarity',
    say: (r) => `The practice cases were ${r.passes} pass and ${r.reds} fail; the set needs at least one of each, or it cannot tell a working judge from one that always gives the same answer.` },
  // ── one practice case ──
  { kind: 'case-not-object', when: (r) => r.code === 'calibration-case' && /^calibration\.cases\[\d+\]$/.test(r.path),
    say: (_r, c) => `${c} is not a proper case.` },
  { kind: 'case-name-repeat', when: (r) => r.code === 'calibration-case' && /\.id$/.test(r.path) && /declared twice/.test(r.detail),
    say: (_r, c) => `Two practice cases share the name ${c}.` },
  { kind: 'case-name-bad', when: (r) => r.code === 'calibration-case' && /\.id$/.test(r.path),
    say: (_r, c) => `${c} has no usable name (a short name in lowercase letters, digits and hyphens is needed).` },
  { kind: 'case-code-repeat', when: (r) => r.code === 'calibration-case' && /\.artifact$/.test(r.path) && /used twice/.test(r.detail),
    say: (_r, c) => `${c} reuses the same sample code as another case.` },
  { kind: 'case-code-missing', when: (r) => r.code === 'calibration-case' && /\.artifact$/.test(r.path),
    say: (_r, c) => `${c} has no sample code to look at.` },
  { kind: 'case-impossible-no-doc', when: (r) => r.code === 'calibration-case' && /\.expect\.reds$/.test(r.path) && /expects has-doc red on/.test(r.detail),
    say: (r, c) => {
      const fn = safeText(/expects has-doc red on (\S+?),/.exec(r.detail)?.[1] ?? 'a function');
      return `${c} says "fail: no doc comment" on ${fn}, but ${fn} has a doc comment right above it.`;
    } },
  { kind: 'case-pass-lists-fails', when: (r) => r.code === 'calibration-case' && /\.expect\.reds$/.test(r.path) && /^a PASS case expects no reds/.test(r.detail),
    say: (_r, c) => `${c} is marked as a pass but also lists things that fail.` },
  { kind: 'case-fail-lists-nothing', when: (r) => r.code === 'calibration-case' && /\.expect\.reds$/.test(r.path) && /^a RED case names WHICH/.test(r.detail),
    say: (_r, c) => `${c} is marked as a fail but does not say which rule or function fails.` },
  { kind: 'case-fails-not-list', when: (r) => r.code === 'calibration-case' && /\.expect\.reds$/.test(r.path),
    say: (_r, c) => `${c} does not give its expected failures as a list.` },
  { kind: 'case-no-expected', when: (r) => r.code === 'calibration-case' && /\.expect$/.test(r.path),
    say: (_r, c) => `${c} has no expected result.` },
  { kind: 'case-verdict-bad', when: (r) => r.code === 'calibration-case' && /\.expect\.verdict$/.test(r.path),
    say: (_r, c) => `${c} expects a result that is neither pass nor fail.` },
  { kind: 'case-fail-malformed', when: (r) => r.code === 'calibration-case' && /\.reds\[\d+\]$/.test(r.path) && /^an expected red is/.test(r.detail),
    say: (_r, c) => `${c} has an expected failure that is not written as a rule and a function.` },
  { kind: 'case-fail-repeat', when: (r) => r.code === 'calibration-case' && /\.reds\[\d+\]$/.test(r.path),
    say: (_r, c) => `${c} lists the same failure twice.` },
  { kind: 'case-fail-rule-foreign', when: (r) => r.code === 'calibration-case' && /\.rule$/.test(r.path) && typeof r.rule === 'string',
    say: (r, c) => `${c} expects a failure from the rule "${safeText(r.rule)}", which this rubric does not use.` },
  { kind: 'case-fail-rule-missing', when: (r) => r.code === 'calibration-case' && /\.rule$/.test(r.path),
    say: (_r, c) => `${c} has an expected failure with no rule named.` },
  { kind: 'case-fail-fn-missing', when: (r) => r.code === 'calibration-case' && /\.fn$/.test(r.path),
    say: (_r, c) => `${c} has an expected failure with no function named.` },
];

/** @param {PlainRed} r the 1-based rubric line a card red lands on @returns {number} */
function cardLineNo(r) {
  return Number(/^card item (\d+):/.exec(r.detail)?.[1] ?? -1) + 1;
}

/**
 * Every plain kind the table can emit — the list the test enumerates against.
 * @returns {string[]}
 */
export function plainKinds() {
  return PLAIN_TABLE.map((e) => e.kind);
}

/**
 * Map the technical reds of a refused proposal to plain sentences, one per red.
 * An unknown code is NEVER dropped: it becomes a generic sentence that still
 * quotes the code and path, under the kind `unmapped`.
 * @param {PlainRed[]} reds
 * @param {{cases?: any}} [o] the proposed cases, to name a case by its own id
 * @returns {PlainReason[]}
 */
export function plainReasons(reds, { cases = null } = {}) {
  return (Array.isArray(reds) ? reds : []).map((red) => {
    const r = /** @type {PlainRed} */ ({ ...red, code: String(red?.code ?? ''), path: String(red?.path ?? ''), detail: String(red?.detail ?? '') });
    const idx = /^calibration\.cases\[(\d+)\]/.exec(r.path)?.[1];
    const given = idx !== undefined && Array.isArray(cases) ? cases[Number(idx)]?.id : undefined;
    const caseName = idx === undefined ? 'A case'
      : typeof given === 'string' && given.trim() !== '' ? `Case "${safeText(given)}"` : `Case ${Number(idx) + 1}`;
    const hit = PLAIN_TABLE.find((e) => e.when(r));
    if (hit) return { kind: hit.kind, sentence: hit.say(r, caseName, null), red: r };
    return {
      kind: 'unmapped',
      sentence: `The model's proposal failed a check that has no plain wording yet ("${safeText(r.code)}" at ${safeText(r.path)}).`,
      red: r,
    };
  });
}

/** @param {number} n @returns {string} the panel's money spelling: 2 decimals, "<$0.01" under a cent */
function moneyText(n) {
  return n > 0 && n < 0.005 ? '<$0.01' : `$${n.toFixed(2)}`;
}

/**
 * The money clause: the measured figure, "at least" when a call was unpriced,
 * and `null` when there is no honest figure (the caller then says unknown or
 * drops the clause — never a zero).
 * @param {{knownUsd?: number|null, spendComplete?: boolean|null}|null|undefined} spend
 * @returns {string|null}
 */
function spendText(spend) {
  if (!spend || typeof spend.knownUsd !== 'number' || !Number.isFinite(spend.knownUsd)) return null;
  return `${spend.spendComplete === false ? 'at least ' : ''}${moneyText(spend.knownUsd)}`;
}

/** the stops this module explains in plain words */
export const PLAIN_PROPOSAL_STOPS = Object.freeze(['proposal-invalid', 'rubric-invalid']);

/**
 * THE MESSAGE a person reads when the rubric proposal was refused. Both doors
 * (the panel's failed step and the CLI) print exactly this.
 * @param {{stop: string, reds: PlainRed[], cases?: any, spend?: {knownUsd?: number|null, spendComplete?: boolean|null}|null,
 *   source?: 'proposal'|'signer'}} o
 * @returns {string}
 */
export function proposalStopText({ stop, reds, cases = null, spend = null, source = 'proposal' }) {
  const reasons = plainReasons(reds, { cases });
  const unique = [...new Set(reasons.map((x) => x.sentence))];
  const shown = unique.slice(0, PLAIN_MAX_BULLETS);
  const onlyCases = reasons.length > 0 && reasons.every((x) => x.kind.startsWith('case-') || x.kind.startsWith('set-'));
  const spent = spendText(spend);
  const head = stop === 'rubric-invalid'
    ? 'The rubric and practice cases failed the last check before signing, so nothing was signed.'
    : `The model's ${onlyCases ? 'practice cases for your rubric' : 'rubric and practice cases'} didn't hold up, so we stopped before grading anything.`;
  const lines = [`${head} Spent so far: ${spent ?? 'unknown'}.`, 'What was wrong:'];
  for (const s of shown) lines.push(` • ${s}`);
  if (unique.length > shown.length) lines.push(` • …and ${unique.length - shown.length} more.`);
  lines.push(source === 'signer' ? 'This one is from the edit made before signing.' : 'This is the model\'s mistake, not yours.');
  lines.push(`What to do: draft again${spent ? ` (about ${spent} to reach here)` : ''}.`);
  lines.push('If it fails the same way twice, make your PASS/FAIL examples more concrete.');
  return lines.join('\n');
}

/**
 * The reds as the drafting log keeps them: every structured field, the plain
 * sentence beside it, every string secret-scrubbed and bounded, the list capped.
 * @param {PlainRed[]} reds @param {{cases?: any}} [o]
 * @returns {Record<string, any>[]}
 */
export function redsRecord(reds, { cases = null } = {}) {
  /** @param {unknown} s */
  const cut = (s) => { const t = redactSecrets(String(s ?? '')); return t.length > RECORD_STR_MAX ? `${t.slice(0, RECORD_STR_MAX)}…` : t; };
  return plainReasons(reds, { cases }).slice(0, RECORD_MAX_REDS).map(({ kind, sentence, red }) => {
    /** @type {Record<string, any>} */
    const out = { kind, plain: sentence };
    for (const [k, v] of Object.entries(red)) {
      if (typeof v === 'string') out[k] = cut(v);
      else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
      else if (Array.isArray(v)) out[k] = v.slice(0, 10).map((x) => (typeof x === 'string' ? cut(x) : x));
    }
    return out;
  });
}
