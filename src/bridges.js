// Layer 3 — the REUSE registry (design record:
// docs/02-features/2026-08-01-layer-3-reuse-design.md, D1/D2/D6, frozen 2026-08-01).
//
// A BRIDGE is the plan a green actually executed, kept so the next run of the same
// SHAPE starts from it instead of cold. This module is the box and the label on it:
// storage (D1), the derived status (D6), and the LOAD GATE (D2 as split by the
// 2026-08-01 addendum). It authors nothing and decides nothing about a run — the
// arbiter is untouched, and every function here is either a pure derivation or an
// explicit read/write of a plain JSON file.
//
// Three rulings are load-bearing and are enforced by shape, not by convention:
//
//  - **R1 — only a green writes the box.** `appendGreen` mints a version AND a
//    history row; `appendRed` writes a history row and NEVER touches `versions`.
//    A red demotes, it does not edit the recipe.
//  - **D6 — status is DERIVED, never stored.** Storing it would let a hand-edit or
//    a half-written file claim a promotion no green paid for. There is deliberately
//    NO probability score: n=1 is an anecdote in either direction (F24's
//    withdrawal), and a percentage over 2–3 runs is fake precision. If a score ever
//    earns its way in, its threshold is hamr's, from a measured base rate.
//  - **F6 — unpriced is never free.** `costUsd`/`wallMs`/`rounds` are `number` or
//    an EXPLICIT `null`; the key is required either way, so "unknown" has to be
//    said rather than omitted, and `??0` can never launder it into a floor. The
//    same discipline extends to time. `spendComplete` travels with every row (F44),
//    and an unknown cost cannot claim a complete spend.
//
// Storage is a DIRECTORY of plain files — no database, no new dependency, no
// default location (the registry path is operator-supplied, and a missing one reds
// rather than being conjured). Layout stays minimal until something reads it back:
// housekeeping must not be dressed as a design tension while nothing consumes it.
//
// Demoted and failed-since entries are never deleted — the ledger runs both
// directions (PRD §2: the green that minted it AND the contrast that attributed it).

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isObj, isNonEmptyString, sweepNestedQuantifiers } from './validate.js';
import { TOOL_MENU, LOCKED_TOOLS, VERDICT_TYPES } from './job.js';
import { closeStagesOf } from './plan.js';
// the three doors, in their ONE spelling. A second copy of "what a person may
// answer" here would be a second vocabulary to drift from the one the runner
// applies — the same rule the outcome classes already live under. `kinds.js` is
// already in this module's transitive graph (job → declaredclose → kinds), so
// this costs nothing at load and buys a single source for the door names.
import { HUMAN_DECISIONS } from './kinds.js';

export const BRIDGE_SCHEMA = 'bridge-v1';

/**
 * SOFTGREEN MODULE 6 — the verdict classes whose greens are minted QUARANTINED.
 *
 * The standing ruling (PRD v1.53, given a mechanism by v1.71 §3): *softgreen
 * passes are quarantined from learning credit until the judged floor is proven*,
 * and **the signer's `accept` at the review door is what releases it**.
 *
 * `soft-green` and NOT `hitl`: the hold is about the young JUDGE, not about every
 * class that is not `green`. A hitl close is rendered by a PERSON at close time —
 * there is no unproven ruler in it to distrust. A green earns its credit at its
 * own close, exactly as it always has.
 */
export const QUARANTINED_VERDICTS = Object.freeze(['soft-green']);

/** the red CODE a hold travels under — the gate emits it, the listing splits the
 * held rows out of the broken ones on it, and the runner reads it back. One
 * spelling, because three literals is how a hold silently becomes a breakage. */
export const QUARANTINED_CODE = 'quarantined';

/** does a green under this verdict class earn its learning credit at the close, or
 * does it wait for a person? Absent/unknown means green's behaviour, byte for byte
 * — the pre-softgreen path is the default and stays untouched.
 * @param {unknown} verdictType @returns {boolean} */
export function quarantinesCredit(verdictType) {
  return typeof verdictType === 'string' && QUARANTINED_VERDICTS.includes(verdictType);
}

/** @typedef {{code: string, path: string, detail?: string}} Red */

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
/** the exact field set of a bridge entry — anything else is a smuggle channel
 * (a stored `status`, a stored score, a hand-written note that outranks the
 * history). Same inexpressibility guard both config documents use. */
const BRIDGE_FIELDS = ['schema', 'name', 'goal', 'specHash', 'closeStageNames', 'toolsUsed', 'versions', 'history'];
/** a VERSION is one green's plan-as-executed plus that green's receipts.
 * `specHash` is optional and per-version on purpose: the five real probe-era
 * bridges carry THREE distinct spec hashes across greens of the same job, so a
 * single top-level hash cannot hold them without dropping provenance.
 *
 * `quarantined` is softgreen module 6's hold and is OPTIONAL: absent is the green
 * path, byte for byte, and `false` means a signer released it (a flag, never a
 * deletion — the record keeps saying that this green was once held). */
const VERSION_FIELDS = ['plan', 'runid', 'greenAt', 'patient', 'costUsd', 'wallMs', 'rounds', 'specHash', 'quarantined'];
/** a HISTORY row is one run against this bridge, green or not. `quarantined` is the
 * version's twin (they are minted and released together, in one place each);
 * `doors` is the REPORT CARD — every disposition a signer took on this run, in
 * order, as recorded facts. Deliberately no rate and no score: D6's no-score rule
 * applies to the judge exactly as it applies to the workflow. */
const HISTORY_FIELDS = ['at', 'runid', 'patient', 'outcome', 'failingStage', 'costUsd', 'spendComplete', 'wallMs', 'rounds', 'quarantined', 'doors'];
/** one door: what the person said, and when. Nothing else — a note that outranked
 * the decision would be the smuggle channel the field sets exist to close. */
const DOOR_FIELDS = ['decision', 'at'];

/**
 * D6's status ladder, walked in history order. Pure, total, and never throws —
 * it is called on whatever a file happens to contain.
 *
 * - **candidate** — at least one green.
 * - **proven** — greens on ≥2 DISTINCT patients (R2: the same SHAPE on a second
 *   instance; two greens on ONE patient is a lookup table, which the memorization
 *   audit kills).
 * - a **red** on a PROVEN entry drops it to candidate, and re-promotion then needs
 *   greens on two distinct patients AGAIN — that is what "until a new green on a
 *   second distinct patient re-proves" means, so the demoting red clears the
 *   distinct-patient set rather than leaving the old count standing to re-promote
 *   the entry on the first repeat green.
 * - a red on a CANDIDATE changes nothing: there is nothing below the entry bar, and
 *   the entry stays in the record with the red beside it.
 * - a **QUARANTINED green is not evidence** (softgreen module 6). The row exists and
 *   the run happened, but a judged green earns nothing until the signer's `accept`
 *   releases it, so it neither clears the entry bar nor adds a distinct patient. An
 *   entry whose only greens are held derives `null` — below the bar, not demoted.
 * - a **CASUALTY is not a red.** Only the literal outcome `'red'` demotes; every
 *   other non-green outcome (`provider-red`, `wall-halt`, `close-crashed`, …) is a
 *   casualty, and casualties are never evidence in either direction.
 *
 * @param {unknown} history the bridge's per-run rows, oldest first
 * @returns {'candidate'|'proven'|null} null = below the entry bar (no green yet)
 */
export function deriveStatus(history) {
  if (!Array.isArray(history)) return null;
  let everGreen = false;
  /** distinct patients greened SINCE the last demoting red */
  const patients = new Set();
  for (const row of history) {
    if (!isObj(row)) continue;
    const r = /** @type {Record<string, any>} */ (row);
    if (r.outcome === 'green') {
      if (r.quarantined === true) continue; // held: minted, visible, and worth nothing yet
      if (!isNonEmptyString(r.patient)) continue; // an unattributable green cannot prove a second instance
      everGreen = true;
      patients.add(r.patient);
    } else if (r.outcome === 'red' && patients.size >= 2) {
      patients.clear();
    }
  }
  if (!everGreen) return null;
  return patients.size >= 2 ? 'proven' : 'candidate';
}

/**
 * Shared numeric-or-explicitly-unknown check (F6). The KEY must be present: an
 * absent cost is not the same claim as a known-unknown one, and letting it be
 * absent is exactly how `?? 0` gets written downstream.
 * @param {Record<string, any>} o
 * @param {string} key
 * @param {string} at path prefix
 * @param {(code: string, path: string, detail?: string) => void} red
 * @param {boolean} [integer] wallMs/rounds are integers; costUsd is not
 */
function nullableNumber(o, key, at, red, integer = false) {
  if (!(key in o)) { red('missing-required', `${at}${key}`, 'number, or an EXPLICIT null for unknown — an omitted key is how an unknown becomes a silent 0 (F6)'); return; }
  const v = o[key];
  if (v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (integer && !Number.isInteger(v))) {
    red('invalid-value', `${at}${key}`, `${integer ? 'non-negative integer' : 'non-negative number'} or null`);
  }
}

/** nullable STRING with the same present-key discipline (specHash, greenAt, at, failingStage)
 * @param {Record<string, any>} o @param {string} key @param {string} at
 * @param {(code: string, path: string, detail?: string) => void} red */
function nullableString(o, key, at, red) {
  if (!(key in o)) { red('missing-required', `${at}${key}`, 'a string, or an EXPLICIT null for unknown'); return; }
  const v = o[key];
  if (v !== null && !isNonEmptyString(v)) red('invalid-value', `${at}${key}`, 'a non-empty string, or null');
}

/**
 * Validate a bridge entry (`schema: "bridge-v1"`). Never throws on JSON text or
 * plain parsed data — the same ingest contract both config validators hold; every
 * failure is a named red. Returns the parsed entry on ok, null on any red.
 * @param {object|string|unknown} input parsed entry, or raw JSON text
 * @returns {{ ok: boolean, reds: Red[], bridge: any }}
 */
export function validateBridge(input) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };

  let b = input;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) {
      return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: String(/** @type {Error} */ (e).message) }], bridge: null };
    }
  }
  if (!isObj(b)) return { ok: false, reds: [{ code: 'parse-error', path: '$', detail: 'a bridge entry is a JSON object' }], bridge: null };
  const e = /** @type {Record<string, any>} */ (b);

  for (const key of Object.keys(e)) if (!BRIDGE_FIELDS.includes(key)) red('unknown-field', key, `fields: ${BRIDGE_FIELDS.join(', ')}`);

  if (e.schema === undefined) red('missing-required', 'schema');
  else if (e.schema !== BRIDGE_SCHEMA) red('invalid-value', 'schema', `expected "${BRIDGE_SCHEMA}", got ${JSON.stringify(e.schema)}`);
  // the name IS the filename (saveBridge builds the path from it), so the slug is
  // checked here rather than trusted from a distance — deliberately the same
  // alphabet as the job validator's, never a looser one ('.' would admit '..')
  if (!isNonEmptyString(e.name) || !SLUG_RE.test(e.name)) red('invalid-value', 'name', 'kebab-case slug — the registry filename is built from it');
  if (!isNonEmptyString(e.goal)) red('invalid-value', 'goal', 'the job sentence this bridge greened — the listing shows it (D3)');
  nullableString(e, 'specHash', '', red);

  if (!Array.isArray(e.closeStageNames) || e.closeStageNames.length === 0) {
    red('invalid-value', 'closeStageNames', 'non-empty ordered array of stage names — the load gate compares the job\'s close against it');
  } else {
    e.closeStageNames.forEach((/** @type {unknown} */ n, /** @type {number} */ i) => {
      if (!isNonEmptyString(n) || !SLUG_RE.test(n)) red('invalid-value', `closeStageNames.${i}`, 'kebab-case stage name');
    });
  }

  if (!Array.isArray(e.toolsUsed) || e.toolsUsed.length === 0 || !e.toolsUsed.every(isNonEmptyString)) {
    red('invalid-value', 'toolsUsed', 'non-empty array of verbs — the union of the plan\'s step tools, judged against the signed menu at load');
  } else {
    // a verb outside the menu could never pass the load gate against ANY job, so it
    // is a broken entry rather than a stale one — and a LOCKED verb in a stored
    // recipe is the arbiter's line, not a matching question
    const bad = e.toolsUsed.filter((/** @type {string} */ t) => !TOOL_MENU.includes(t));
    if (bad.length) red('invalid-value', 'toolsUsed', `not in the tool menu: ${bad.join(', ')}${bad.some((/** @type {string} */ t) => LOCKED_TOOLS.includes(t)) ? ` (locked-but-listed: ${LOCKED_TOOLS.join(', ')} — a stored recipe can never carry one)` : ''} — menu: ${TOOL_MENU.join('|')}`);
  }

  if (!Array.isArray(e.versions)) red('invalid-value', 'versions', 'array of {plan, runid, greenAt, patient, costUsd, wallMs, rounds}');
  else if (e.versions.length === 0) red('entry-bar', 'versions', 'a bridge enters the registry only on a green (D6): no version, no entry — failed plans are never stored');
  else e.versions.forEach((/** @type {unknown} */ v, /** @type {number} */ i) => validateVersion(v, `versions.${i}.`, red));

  if (!Array.isArray(e.history)) red('invalid-value', 'history', 'array of per-run rows');
  else e.history.forEach((/** @type {unknown} */ h, /** @type {number} */ i) => validateHistoryRow(h, `history.${i}.`, red));

  // PRD v1.60 §1 — the operator-regex admissibility sweep, whose population was
  // `jobs/*.json` and is now every signed spec wherever it lives. A bridge ships
  // its plans VERBATIM, and a stored `artifact-written.pattern` reaches the same
  // untimed exit evaluator on the same main event loop that F49 measured. The
  // reject is UNCHANGED (`hasNestedQuantifier`, one inventory) — only the
  // population is wider, so a clean bridge is byte-identically clean.
  //
  // Whole-entry rather than per-field, because a bridge's regexes sit inside a
  // plan stored as opaque data (`isObj(o.plan)` is all this validator asserts
  // about it): enumerating a path into a document this one deliberately does not
  // parse is how a sweep goes blind the next time the plan schema moves.
  sweepNestedQuantifiers(e, red);

  // R1's coherence, checked only once everything it reads is itself valid (a
  // second red on an already-broken field would bury the real defect): every green
  // mints exactly one version, and a red mints none.
  if (reds.length === 0) {
    const greenRows = e.history.filter((/** @type {any} */ h) => h.outcome === 'green');
    if (greenRows.length !== e.versions.length) {
      red('history-mismatch', 'history', `${greenRows.length} green row(s) but ${e.versions.length} version(s) — a green mints exactly one version and a red mints none (R1)`);
    } else {
      // THE HOLD HAS TWO HALVES AND THEY ARE ONE FACT (softgreen module 6). The
      // version carries it because the version is what INHERITS; the row carries
      // it because the row is what the status ladder reads. Both are written in
      // one place and released in one place, so a disagreement on disk is a
      // hand-edit or a half-written file claiming a release nobody granted — and
      // a hold that survives on only one half is worse than either state, because
      // each reader would answer the credit question differently.
      const holds = (/** @type {any[]} */ rows) => rows.filter((r) => r.quarantined === true).map((r) => r.runid).sort().join(',');
      if (holds(e.versions) !== holds(greenRows)) {
        red('quarantine-mismatch', 'history', `the versions hold [${holds(e.versions) || '—'}] and the green rows hold [${holds(greenRows) || '—'}]`
          + ' — one hold, two halves: they are minted together and released together, so a difference is not a state this record can be in');
      }
    }
  }

  return { ok: reds.length === 0, reds, bridge: reds.length === 0 ? e : null };
}

/** @param {unknown} v @param {string} at @param {(code: string, path: string, detail?: string) => void} red */
function validateVersion(v, at, red) {
  if (!isObj(v)) { red('invalid-value', at.slice(0, -1), 'a version is an object'); return; }
  const o = /** @type {Record<string, any>} */ (v);
  for (const key of Object.keys(o)) if (!VERSION_FIELDS.includes(key)) red('unknown-field', `${at}${key}`, `fields: ${VERSION_FIELDS.join(', ')}`);
  if (o.plan === undefined) red('missing-required', `${at}plan`, 'the plan AS EXECUTED (post-replan) — the run-as-executed artifact is what inherits');
  else if (!isObj(o.plan)) red('invalid-value', `${at}plan`, 'the plan object as executed');
  if (!isNonEmptyString(o.runid)) red('invalid-value', `${at}runid`);
  if (!isNonEmptyString(o.patient)) red('invalid-value', `${at}patient`, 'the instance this green ran against — the distinct-patient count IS the status (D6)');
  nullableString(o, 'greenAt', at, red);
  if ('specHash' in o && o.specHash !== null && !isNonEmptyString(o.specHash)) red('invalid-value', `${at}specHash`, 'the hash signed when this version greened');
  nullableNumber(o, 'costUsd', at, red);
  nullableNumber(o, 'wallMs', at, red, true);
  nullableNumber(o, 'rounds', at, red, true);
  if ('quarantined' in o && typeof o.quarantined !== 'boolean') {
    red('invalid-value', `${at}quarantined`, 'boolean — true while held, false once the signer released it. ABSENT is the green path (a class whose greens were never held)');
  }
}

/** @param {unknown} h @param {string} at @param {(code: string, path: string, detail?: string) => void} red */
function validateHistoryRow(h, at, red) {
  if (!isObj(h)) { red('invalid-value', at.slice(0, -1), 'a history row is an object'); return; }
  const o = /** @type {Record<string, any>} */ (h);
  for (const key of Object.keys(o)) if (!HISTORY_FIELDS.includes(key)) red('unknown-field', `${at}${key}`, `fields: ${HISTORY_FIELDS.join(', ')}`);
  nullableString(o, 'at', at, red);
  if (!isNonEmptyString(o.runid)) red('invalid-value', `${at}runid`);
  if (!isNonEmptyString(o.patient)) red('invalid-value', `${at}patient`);
  // 'green' | 'red' | a casualty class. The set is deliberately OPEN: the
  // escalation categories are the runner's vocabulary and a closed copy here would
  // be a second spelling to drift (an unknown category must be COUNTED, never
  // silently dropped). Only 'red' demotes; everything else non-green is a casualty.
  if (!isNonEmptyString(o.outcome)) red('invalid-value', `${at}outcome`, "'green', 'red', or a casualty class");
  else if (o.outcome === 'green' && o.failingStage !== null) red('invalid-value', `${at}failingStage`, 'a green names no failing stage');
  nullableString(o, 'failingStage', at, red);
  nullableNumber(o, 'costUsd', at, red);
  nullableNumber(o, 'wallMs', at, red, true);
  nullableNumber(o, 'rounds', at, red, true);
  // the hold, and the disposition record beside it (softgreen module 6)
  if ('quarantined' in o) {
    if (typeof o.quarantined !== 'boolean') red('invalid-value', `${at}quarantined`, 'boolean — true while held, false once released');
    else if (o.outcome !== 'green') red('invalid-value', `${at}quarantined`, 'only a GREEN row can be held: a red and a casualty minted no credit, so there is none to withhold');
  }
  if ('doors' in o) {
    if (!Array.isArray(o.doors)) red('invalid-value', `${at}doors`, 'array of {decision, at} — every disposition a signer took on this run, in order');
    else {
      o.doors.forEach((/** @type {unknown} */ d, /** @type {number} */ i) => {
        if (!isObj(d)) { red('invalid-value', `${at}doors.${i}`, 'a door is an object {decision, at}'); return; }
        const dd = /** @type {Record<string, any>} */ (d);
        for (const key of Object.keys(dd)) if (!DOOR_FIELDS.includes(key)) red('unknown-field', `${at}doors.${i}.${key}`, `fields: ${DOOR_FIELDS.join(', ')}`);
        if (!HUMAN_DECISIONS.includes(dd.decision)) red('invalid-value', `${at}doors.${i}.decision`, `one of ${HUMAN_DECISIONS.join(' | ')} — there is no fourth door`);
        nullableString(dd, 'at', `${at}doors.${i}.`, red);
      });
    }
  }
  if (typeof o.spendComplete !== 'boolean') red('invalid-value', `${at}spendComplete`, 'boolean — it travels with the spend on every row (F44)');
  else if (o.costUsd === null && o.spendComplete === true) {
    red('invalid-value', `${at}spendComplete`, 'an UNKNOWN cost cannot be a COMPLETE spend — a bare floor that reads as exact is F6 in an honest coat');
  }
}

/**
 * Shared run-record contract for both appenders. One home, so a green's receipts
 * and a red's receipts can never drift into two shapes.
 * @param {unknown} record
 * @param {(code: string, path: string, detail?: string) => void} red
 */
function validateRunRecord(record, red) {
  if (!isObj(record)) { red('invalid-value', 'record', 'a run record is an object'); return; }
  const o = /** @type {Record<string, any>} */ (record);
  if (!isNonEmptyString(o.runid)) red('invalid-value', 'runid');
  if (!isNonEmptyString(o.patient)) red('invalid-value', 'patient');
  nullableString(o, 'at', '', red);
  nullableNumber(o, 'costUsd', '', red);
  nullableNumber(o, 'wallMs', '', red, true);
  nullableNumber(o, 'rounds', '', red, true);
  if (typeof o.spendComplete !== 'boolean') red('invalid-value', 'spendComplete', 'boolean — it travels with the spend (F44)');
  else if (o.costUsd === null && o.spendComplete === true) red('invalid-value', 'spendComplete', 'an unknown cost cannot be a complete spend (F6)');
}

/**
 * The two rows a green writes, built in ONE place: the version (R1's
 * run-as-executed artifact) and its history row. `mintBridge` and `appendGreen`
 * both go through here — two spellings of a green would be the two-transforms
 * class applied to the ledger itself.
 * @param {Record<string, any>} o a run record already through validateRunRecord
 * @returns {{version: Record<string, any>, row: Record<string, any>}}
 */
function greenParts(o) {
  const at = o.at ?? null;
  /** @type {Record<string, any>} */
  const version = { plan: o.plan, runid: o.runid, greenAt: at, patient: o.patient, costUsd: o.costUsd, wallMs: o.wallMs, rounds: o.rounds };
  if (o.specHash !== undefined) version.specHash = o.specHash;
  /** @type {Record<string, any>} */
  const row = { at, runid: o.runid, patient: o.patient, outcome: 'green', failingStage: null, costUsd: o.costUsd, spendComplete: o.spendComplete, wallMs: o.wallMs, rounds: o.rounds };
  // softgreen module 6 — the HOLD, decided in the one place a green is built, from
  // the class the run was signed under. The key is ABSENT rather than `false` for
  // every other class: an absent key is the pre-softgreen record byte for byte, and
  // a `false` on a green would say "a signer released this", which nobody did.
  if (quarantinesCredit(o.verdictType)) { version.quarantined = true; row.quarantined = true; }
  return { version, row };
}

/**
 * Shared green-record contract (the run record plus its plan).
 * @param {unknown} record
 * @param {(code: string, path: string, detail?: string) => void} red
 */
function validateGreenRecord(record, red) {
  validateRunRecord(record, red);
  const o = /** @type {Record<string, any>} */ (isObj(record) ? record : {});
  if (o.plan === undefined) red('missing-required', 'plan', 'the plan AS EXECUTED (post-replan) — a green mints the artifact that actually ran, not the one proposed');
  else if (!isObj(o.plan)) red('invalid-value', 'plan', 'the plan object as executed');
  // the class this green was signed under decides whether it is HELD (module 6).
  // Optional — absent is green's own path — but a value OUTSIDE the radio reds
  // rather than falling through to "not a quarantined class": a typo that mints a
  // judged green with its credit already released is exactly the failure this
  // whole module exists to prevent, and it must never be a silent one.
  if (o.verdictType !== undefined && !VERDICT_TYPES.includes(o.verdictType)) {
    red('invalid-value', 'verdictType', `the class this run was signed under, one of ${VERDICT_TYPES.join(' | ')} `
      + '— it decides whether this green is held; an unrecognised one is a typo, and a typo must not mint an unheld judged green');
  }
}

/**
 * FIRST GREEN MINTS: build a new registry entry from one green. The entry bar is
 * a green (D6) — there is deliberately no way to create an entry without one, so
 * a failed plan cannot enter the registry even by accident.
 * @param {unknown} meta `{ name, goal, specHash, closeStageNames, toolsUsed }` —
 *   `specHash` may be an explicit null (one probe-era bridge on disk has none), and
 *   the KEY is required so an unknown hash has to be said rather than omitted.
 * @param {unknown} record `{ runid, patient, at, plan, costUsd, spendComplete, wallMs, rounds, specHash? }`
 * @returns {{ ok: boolean, reds: Red[], bridge: any }}
 */
export function mintBridge(meta, record) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };
  if (!isObj(meta)) return { ok: false, reds: [{ code: 'invalid-value', path: 'meta', detail: 'a bridge label is an object { name, goal, specHash, closeStageNames, toolsUsed }' }], bridge: null };
  const m = /** @type {Record<string, any>} */ (meta);
  validateGreenRecord(record, red);
  if (reds.length) return { ok: false, reds, bridge: null };
  const { version, row } = greenParts(/** @type {Record<string, any>} */ (record));
  const entry = {
    schema: BRIDGE_SCHEMA,
    name: m.name,
    goal: m.goal,
    // NOT `?? null`: an ABSENT key is a different claim from a declared unknown,
    // and validateBridge reds it as missing-required rather than laundering it
    specHash: m.specHash,
    closeStageNames: Array.isArray(m.closeStageNames) ? [...m.closeStageNames] : m.closeStageNames,
    toolsUsed: Array.isArray(m.toolsUsed) ? [...m.toolsUsed] : m.toolsUsed,
    versions: [version],
    history: [row],
  };
  const v = validateBridge(entry);
  return v.ok ? { ok: true, reds: [], bridge: entry } : { ok: false, reds: v.reds, bridge: null };
}

/**
 * A green on an EXISTING bridge: the plan AS EXECUTED becomes its next version,
 * and the run gets a history row. Pure — returns a NEW entry; the input is never
 * mutated, so a caller that reds still holds the bridge it read from disk.
 * @param {unknown} bridge a validated bridge entry
 * @param {unknown} record `{ runid, patient, at, plan, costUsd, spendComplete, wallMs, rounds, specHash? }`
 * @returns {{ ok: boolean, reds: Red[], bridge: any }}
 */
export function appendGreen(bridge, record) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };
  const base = validateBridge(bridge);
  if (!base.ok) return { ok: false, reds: [{ code: 'bridge-invalid', path: 'bridge', detail: base.reds.map((r) => `${r.code}:${r.path}`).join(', ') }], bridge: null };
  validateGreenRecord(record, red);
  if (reds.length) return { ok: false, reds, bridge: null };
  const { version, row } = greenParts(/** @type {Record<string, any>} */ (record));
  return { ok: true, reds: [], bridge: { ...base.bridge, versions: [...base.bridge.versions, version], history: [...base.bridge.history, row] } };
}

/**
 * A red (or a casualty): a history row ONLY. R1 — the bridge file is never edited
 * in place by a red; the recipe that greened stays exactly as it greened, and the
 * status derivation reads the demotion off the history.
 * @param {unknown} bridge a validated bridge entry
 * @param {unknown} record `{ runid, patient, at, outcome, failingStage, costUsd, spendComplete, wallMs, rounds }`
 * @returns {{ ok: boolean, reds: Red[], bridge: any }}
 */
export function appendRed(bridge, record) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(code: string, path: string, detail?: string) => void} */
  const red = (code, path, detail) => { reds.push(detail ? { code, path, detail } : { code, path }); };
  const base = validateBridge(bridge);
  if (!base.ok) return { ok: false, reds: [{ code: 'bridge-invalid', path: 'bridge', detail: base.reds.map((r) => `${r.code}:${r.path}`).join(', ') }], bridge: null };
  validateRunRecord(record, red);
  const o = /** @type {Record<string, any>} */ (isObj(record) ? record : {});
  if (!isNonEmptyString(o.outcome)) red('invalid-value', 'outcome', "'red' or a casualty class");
  else if (o.outcome === 'green') red('invalid-value', 'outcome', 'a green goes through appendGreen — it must mint its version, and a green recorded here would leave the box unwritten (R1)');
  nullableString(o, 'failingStage', '', red);
  if (reds.length) return { ok: false, reds, bridge: null };

  const next = {
    ...base.bridge,
    history: [...base.bridge.history, { at: o.at ?? null, runid: o.runid, patient: o.patient, outcome: o.outcome, failingStage: o.failingStage, costUsd: o.costUsd, spendComplete: o.spendComplete, wallMs: o.wallMs, rounds: o.rounds }],
  };
  return { ok: true, reds: [], bridge: next };
}

// ── softgreen module 6: the hold, and the door that releases it ─────────────

/**
 * The version that would INHERIT — the newest one whose credit has actually been
 * released. `versions` is oldest-first, so this is normally the last of them; it
 * differs only when a judged green sits on top of a released one, and in that case
 * the RELEASED plan is what a reuse starts from. A held version is not a worse
 * recipe, it is an unjudged one: nobody has said yet whether the ruler that passed
 * it was right, and starting the next run from it would spend the credit before it
 * was granted.
 *
 * Total and never throws — it is read at selection time and at the load door.
 * @param {unknown} bridge
 * @returns {any|null} null when every version is held (or there are none)
 */
export function newestEligibleVersion(bridge) {
  const e = /** @type {Record<string, any>} */ (isObj(bridge) ? bridge : {});
  const versions = Array.isArray(e.versions) ? e.versions.filter(isObj) : [];
  for (let i = versions.length - 1; i >= 0; i -= 1) if (versions[i].quarantined !== true) return versions[i];
  return null;
}

/**
 * May this workflow be offered for reuse at all? A held entry is SKIPPED WITH A
 * REASON everywhere it is skipped — the same visible-skip discipline an unreadable
 * registry file already gets, because a shelf that quietly shrinks teaches the
 * operator that the registry is empty when it is merely holding.
 * @param {unknown} bridge
 * @returns {{ok: boolean, reason: string}} `reason` is '' when ok
 */
export function reuseEligibility(bridge) {
  if (newestEligibleVersion(bridge) !== null) return { ok: true, reason: '' };
  const held = Array.isArray(/** @type {any} */ (bridge)?.versions) ? /** @type {any[]} */ (/** @type {any} */ (bridge).versions).length : 0;
  return {
    ok: false,
    reason: held
      ? `held: ${held === 1 ? 'its green was' : `all ${held} of its greens were`} rendered by the judged floor and no signer has accepted `
        + 'one yet — a judged green earns no reuse until a person takes the door and accepts it'
      : 'no version to reuse',
  };
}

/**
 * THE REVIEW DOOR, written down (PRD v1.71 §3). The person read the finished run
 * and said one of three things; this records that on the run's own row, and — for
 * `accept` on a HELD green — releases the learning credit that green has been
 * carrying unspent.
 *
 * Three properties, and each is a ruling rather than a convenience:
 *
 *  - **the door never changes the loop's verdict.** A green row stays a green row,
 *    whatever the person then does with it. `rerun` and `pause` are dispositions,
 *    recorded and nothing more; a rerun's own outcome is a NEW run's row.
 *  - **release is FORWARD-ONLY.** Nothing here can set `quarantined` back to true,
 *    so a signer who accepts and later reruns has recorded a disagreement — which
 *    is a datum worth keeping — without un-granting credit already granted. There
 *    is deliberately no re-hold path at all: it would be a way to walk the ledger
 *    backwards, which the ruling forbids.
 *  - **releasing is not minting.** A door aimed at a run with no green row of its
 *    own is a named red — never an invented entry. That is slice 1's already-green
 *    rule holding from the other side: `accept` confirms a verdict, it never
 *    creates one.
 *
 * Idempotent by shape: a decision identical to the last one recorded is a no-op
 * that returns the entry unchanged, so a double-click at the door cannot inflate
 * the report card (and `released` says whether THIS call was the one that freed it).
 *
 * Pure — returns a NEW entry; the input is never mutated.
 * @param {unknown} bridge a validated bridge entry
 * @param {unknown} door `{ runid, decision, at }` — `at` may be an explicit null
 * @returns {{ ok: boolean, reds: Red[], bridge: any, released: boolean }}
 */
export function recordDoor(bridge, door) {
  /** @type {Red[]} */
  const reds = [];
  const base = validateBridge(bridge);
  if (!base.ok) return { ok: false, reds: [{ code: 'bridge-invalid', path: 'bridge', detail: base.reds.map((r) => `${r.code}:${r.path}`).join(', ') }], bridge: null, released: false };
  if (!isObj(door)) return { ok: false, reds: [{ code: 'invalid-value', path: 'door', detail: `a door is an object { runid, decision, at } — decision one of ${HUMAN_DECISIONS.join(' | ')}` }], bridge: null, released: false };
  const d = /** @type {Record<string, any>} */ (door);
  if (!isNonEmptyString(d.runid)) reds.push({ code: 'invalid-value', path: 'runid', detail: 'the run whose result the person just read' });
  if (!HUMAN_DECISIONS.includes(d.decision)) {
    reds.push({ code: 'invalid-value', path: 'decision', detail: `one of ${HUMAN_DECISIONS.join(' | ')} — there is no fourth door` });
  }
  if (d.at !== undefined && d.at !== null && !isNonEmptyString(d.at)) reds.push({ code: 'invalid-value', path: 'at', detail: 'a timestamp string, or an EXPLICIT null' });
  if (reds.length) return { ok: false, reds, bridge: null, released: false };

  const at = d.at ?? null;
  const idx = base.bridge.history.findIndex((/** @type {any} */ h) => h.outcome === 'green' && h.runid === d.runid);
  if (idx === -1) {
    return {
      ok: false,
      reds: [{
        code: 'no-row-for-run',
        path: 'runid',
        detail: `this workflow holds no GREEN row for run "${d.runid}", so there is no disposition to record and nothing to release. `
          + 'A door answers a run that earned a row — an already-green run, a red and a casualty all earned none, and accept mints nothing',
      }],
      bridge: null,
      released: false,
    };
  }

  const row = base.bridge.history[idx];
  const doors = Array.isArray(row.doors) ? row.doors : [];
  if (doors.at(-1)?.decision === d.decision) return { ok: true, reds: [], bridge: base.bridge, released: false };

  const releases = d.decision === 'accept' && row.quarantined === true;
  /** @type {Record<string, any>} */
  const nextRow = { ...row, doors: [...doors, { decision: d.decision, at }] };
  if (releases) nextRow.quarantined = false;
  const next = {
    ...base.bridge,
    // the version's half of the same one fact, flipped in the same breath
    versions: releases
      ? base.bridge.versions.map((/** @type {any} */ v) => (v.runid === d.runid && v.quarantined === true ? { ...v, quarantined: false } : v))
      : base.bridge.versions,
    history: base.bridge.history.map((/** @type {any} */ h, /** @type {number} */ i) => (i === idx ? nextRow : h)),
  };
  const v = validateBridge(next);
  return v.ok ? { ok: true, reds: [], bridge: next, released: releases } : { ok: false, reds: v.reds, bridge: null, released: false };
}

/**
 * One row of D3's listing: what the user (and the selecting LLM) sees per bridge —
 * name, the job sentence it greened, status, greens/reds, and the cost/time BAND of
 * its greens. Deliberately no score (D6).
 *
 * The cost band SKIPS unknowns and says how many it skipped: an aggregate that
 * treats a null as 0 reports a floor that reads as exact, which is F6 in an honest
 * coat. With no priced green at all, every bound is null — never 0.
 *
 * Total and never throws: the listing is a display surface, and one malformed
 * entry must not take the whole listing down (loadRegistry already reports it).
 * @param {unknown} bridge
 * @returns {{name: string|null, goal: string|null, status: 'candidate'|'proven'|null, greens: number, reds: number, quarantinedGreens: number, doorDecisions: {runid: string|null, decision: string|null, at: string|null}[], lastOutcome: string|null, greenCost: {minUsd: number|null, maxUsd: number|null, minWallMs: number|null, maxWallMs: number|null, unpricedCount: number, untimedCount: number}}}
 */
export function listingRow(bridge) {
  const e = /** @type {Record<string, any>} */ (isObj(bridge) ? bridge : {});
  const history = Array.isArray(e.history) ? e.history.filter(isObj) : [];
  const versions = Array.isArray(e.versions) ? e.versions.filter(isObj) : [];
  const nums = (/** @type {string} */ key) => versions.map((v) => v[key]).filter((/** @type {unknown} */ v) => typeof v === 'number');
  const usd = nums('costUsd');
  const wall = nums('wallMs');
  return {
    name: isNonEmptyString(e.name) ? e.name : null,
    goal: isNonEmptyString(e.goal) ? e.goal : null,
    status: deriveStatus(history),
    greens: history.filter((h) => h.outcome === 'green').length,
    // 'red' EXACTLY — a casualty is not a red, in the listing for the same reason
    // it is not one in the status ladder (provider-red rows are never evidence)
    reds: history.filter((h) => h.outcome === 'red').length,
    // softgreen module 6, both halves of it. `quarantinedGreens` is why an entry
    // with greens can still derive no status; `doorDecisions` is the REPORT CARD —
    // every disposition a signer took, verbatim and in order. Facts, not a rate: an
    // agreement percentage over three runs is the fake precision D6 already refuses
    // for the workflow, and the judge gets no looser rule than the recipe does.
    quarantinedGreens: history.filter((h) => h.outcome === 'green' && h.quarantined === true).length,
    doorDecisions: history.flatMap((h) => (Array.isArray(h.doors) ? h.doors.filter(isObj).map((/** @type {any} */ x) => ({ runid: isNonEmptyString(h.runid) ? h.runid : null, decision: x.decision ?? null, at: x.at ?? null })) : [])),
    lastOutcome: isNonEmptyString(history.at(-1)?.outcome) ? history.at(-1).outcome : null,
    greenCost: {
      minUsd: usd.length ? Math.min(...usd) : null,
      maxUsd: usd.length ? Math.max(...usd) : null,
      minWallMs: wall.length ? Math.min(...wall) : null,
      maxWallMs: wall.length ? Math.max(...wall) : null,
      unpricedCount: versions.length - usd.length,
      untimedCount: versions.length - wall.length,
    },
  };
}

/**
 * D2's LOAD-TIME gate, as SPLIT by the 2026-08-01 addendum. Exactly three checks —
 * *"is this the right KIND of recipe?"*, asked at the box:
 *
 *  1. **verdict type matches.** v1 admits `green` only, and a bridge only ever
 *     exists because a green minted it, so the bridge side is `green` by
 *     construction and the check reads the JOB's declared type. **The day a second
 *     verdict class is admitted, the bridge entry must carry its own verdictType
 *     and this becomes a two-sided comparison** — recorded here so it cannot be
 *     quietly assumed to already be one.
 *  2. **close-stage KINDS match.** v1 simplification: the same stage NAMES in the
 *     same ORDER is the definition of the same kinds. The probes' R2-legal pair
 *     matched on four identical stage names over different patients, which is the
 *     material this rule was ruled on; a real kind-comparison (what each stage
 *     INSPECTS, independent of what it was named) is a later rung's problem and is
 *     not pretended here.
 *  3. **every stored verb fits THIS job's signed menu.** An omitted `tools` means
 *     the concrete current TOOL_MENU — the same predicate `resolveSpec` and
 *     `validatePlan` read (MED-1), so what the gate judges is what was signed.
 *
 * **NOTHING about paths, scopes or targets.** Those are instance-bound and are
 * EXPECTED to red: every recipe from a different day names yesterday's bricks, and
 * that is what a recipe IS, not a flaw. The pre-probe measured the drafter
 * replacing them unaided (3/3 legal after tweak), while the gate as originally
 * frozen would have refused all six of them at the door. The full `validatePlan`
 * still judges the TWEAKED draft at draft time — nothing executes unvalidated, and
 * no second, looser path exists for an inherited plan (D4).
 *
 * A failing gate is the **recipe-stale / wrong-kind** OUTCOME — a distinct result
 * with cold drafting offered, never a throw.
 * @param {unknown} bridge
 * @param {unknown} job the validateJob-green spec this run is signed against
 * @returns {{ ok: boolean, reds: Red[] }}
 */
export function loadGate(bridge, job) {
  /** @type {Red[]} */
  const reds = [];
  /** @type {(path: string, detail: string) => void} */
  const red = (path, detail) => { reds.push({ code: 'recipe-stale', path, detail }); };
  if (!isObj(bridge)) return { ok: false, reds: [{ code: 'recipe-stale', path: 'bridge', detail: 'not a bridge entry' }] };
  if (!isObj(job)) return { ok: false, reds: [{ code: 'recipe-stale', path: 'job', detail: 'not a job spec' }] };
  const b = /** @type {Record<string, any>} */ (bridge);
  const j = /** @type {Record<string, any>} */ (job);

  // 1. verdict type
  if (j.verdictType !== 'green') {
    red('verdictType', `this job declares ${JSON.stringify(j.verdictType)}; a v1 bridge is minted by a green verdict only`);
  }

  // 2. close-stage kinds (v1: names in order)
  const stages = (closeStagesOf(j) ?? []).map((/** @type {any} */ s) => (isObj(s) ? s.name : null));
  const stored = Array.isArray(b.closeStageNames) ? b.closeStageNames : null;
  if (!stored || stored.length !== stages.length || !stored.every((/** @type {unknown} */ n, /** @type {number} */ i) => n === stages[i])) {
    red('closeStageNames', `bridge close [${(stored ?? ['<none>']).join(' → ')}] vs this job's close [${(stages.length ? stages : ['<none>']).join(' → ')}] — same names in the same order is v1's definition of the same kinds`);
  }

  // 3. verbs within the signed menu (MED-1: an omitted `tools` IS the full menu)
  const menu = Array.isArray(j.tools) ? j.tools : TOOL_MENU;
  const used = Array.isArray(b.toolsUsed) ? b.toolsUsed : null;
  if (!used) red('toolsUsed', 'the bridge does not record the verbs it used, so they cannot be judged against the signed menu');
  else {
    const outside = used.filter((/** @type {string} */ t) => !menu.includes(t));
    if (outside.length) red('toolsUsed', `${outside.join(', ')} outside this job's signed menu [${menu.join('|')}] — the agent never widens its own grant`);
  }

  return { ok: reds.length === 0, reds };
}

// --- storage (D1): plain files in an operator-supplied directory ------------

/** @param {string} dir @returns {boolean} */
function isDir(dir) {
  try { return statSync(dir).isDirectory(); } catch { return false; }
}

/**
 * Read one bridge file. Never throws — a missing/unreadable file and a malformed
 * one are both named reds, because the registry is read at selection time and one
 * bad file must not take the run down.
 * @param {string} file
 * @returns {{ ok: boolean, reds: Red[], bridge: any }}
 */
export function loadBridge(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (err) {
    return { ok: false, reds: [{ code: 'read-error', path: file, detail: String(/** @type {Error} */ (err).message) }], bridge: null };
  }
  const r = validateBridge(text);
  return r.ok ? r : { ok: false, reds: r.reds.map((x) => ({ ...x, path: `${file}:${x.path}` })), bridge: null };
}

/**
 * Read a whole registry directory. A malformed entry is SKIPPED AND REPORTED —
 * one red per bad file, the good entries still returned, sorted by name for a
 * stable listing. `ok` is false when anything was skipped, so a caller can surface
 * the skip instead of silently listing fewer workflows than exist on disk.
 * @param {string} dir the operator-supplied registry path (no default location)
 * @returns {{ ok: boolean, reds: Red[], bridges: any[] }}
 */
export function loadRegistry(dir) {
  if (!isDir(dir)) return { ok: false, reds: [{ code: 'registry-missing', path: dir, detail: 'the registry path is operator-supplied and is never conjured — create it, or point at the right one' }], bridges: [] };
  /** @type {Red[]} */
  const reds = [];
  /** @type {any[]} */
  const bridges = [];
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch (err) {
    return { ok: false, reds: [{ code: 'registry-unreadable', path: dir, detail: String(/** @type {Error} */ (err).message) }], bridges: [] };
  }
  for (const f of files) {
    const file = join(dir, f);
    const r = loadBridge(file);
    if (r.ok) bridges.push(r.bridge);
    else reds.push({ code: 'entry-invalid', path: file, detail: r.reds.map((x) => x.code).join(', ') });
  }
  bridges.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { ok: reds.length === 0, reds, bridges };
}

/**
 * Write one bridge entry, ATOMICALLY (temp + rename): a registry read concurrent
 * with a write must see the old entry or the new one, never a half-written file
 * that then reads as a malformed skip. An INVALID entry is refused before anything
 * touches the disk — the registry never holds a file its own validator rejects.
 * @param {string} dir the operator-supplied registry directory (must exist)
 * @param {unknown} bridge
 * @returns {{ ok: boolean, reds: Red[], file: string|null }}
 */
export function saveBridge(dir, bridge) {
  const v = validateBridge(bridge);
  if (!v.ok) return { ok: false, reds: v.reds, file: null };
  if (!isDir(dir)) return { ok: false, reds: [{ code: 'registry-missing', path: dir, detail: 'the registry path is operator-supplied and is never conjured' }], file: null };
  const file = join(dir, `${v.bridge.name}.json`);
  const tmpFile = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmpFile, `${JSON.stringify(v.bridge, null, 2)}\n`);
    renameSync(tmpFile, file);
  } catch (err) {
    rmSync(tmpFile, { force: true });
    return { ok: false, reds: [{ code: 'write-error', path: file, detail: String(/** @type {Error} */ (err).message) }], file: null };
  }
  return { ok: true, reds: [], file };
}

/**
 * Create a registry directory. Separate from `saveBridge` ON PURPOSE: saving must
 * never conjure a registry from a typo'd path, so making one is an explicit act.
 * @param {string} dir
 * @returns {string} the directory
 */
export function makeRegistry(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** @param {string} dir @returns {boolean} does a registry directory exist */
export function registryExists(dir) {
  return existsSync(dir) && isDir(dir);
}
