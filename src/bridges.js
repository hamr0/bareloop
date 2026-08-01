// Layer 3 — the REUSE registry (design record:
// docs/plans/2026-08-01-layer-3-reuse-design.md, D1/D2/D6, frozen 2026-08-01).
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
import { isObj, isNonEmptyString } from './validate.js';
import { TOOL_MENU, LOCKED_TOOLS } from './job.js';
import { stageClose } from './plan.js';

export const BRIDGE_SCHEMA = 'bridge-v1';

/** @typedef {{code: string, path: string, detail?: string}} Red */

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
/** the exact field set of a bridge entry — anything else is a smuggle channel
 * (a stored `status`, a stored score, a hand-written note that outranks the
 * history). Same inexpressibility guard both config documents use. */
const BRIDGE_FIELDS = ['schema', 'name', 'goal', 'specHash', 'closeStageNames', 'toolsUsed', 'versions', 'history'];
/** a VERSION is one green's plan-as-executed plus that green's receipts.
 * `specHash` is optional and per-version on purpose: the five real probe-era
 * bridges carry THREE distinct spec hashes across greens of the same job, so a
 * single top-level hash cannot hold them without dropping provenance. */
const VERSION_FIELDS = ['plan', 'runid', 'greenAt', 'patient', 'costUsd', 'wallMs', 'rounds', 'specHash'];
/** a HISTORY row is one run against this bridge, green or not */
const HISTORY_FIELDS = ['at', 'runid', 'patient', 'outcome', 'failingStage', 'costUsd', 'spendComplete', 'wallMs', 'rounds'];

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

  // R1's coherence, checked only once everything it reads is itself valid (a
  // second red on an already-broken field would bury the real defect): every green
  // mints exactly one version, and a red mints none.
  if (reds.length === 0) {
    const greens = e.history.filter((/** @type {any} */ h) => h.outcome === 'green').length;
    if (greens !== e.versions.length) {
      red('history-mismatch', 'history', `${greens} green row(s) but ${e.versions.length} version(s) — a green mints exactly one version and a red mints none (R1)`);
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
  return { version, row: { at, runid: o.runid, patient: o.patient, outcome: 'green', failingStage: null, costUsd: o.costUsd, spendComplete: o.spendComplete, wallMs: o.wallMs, rounds: o.rounds } };
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
 * @returns {{name: string|null, goal: string|null, status: 'candidate'|'proven'|null, greens: number, reds: number, lastOutcome: string|null, greenCost: {minUsd: number|null, maxUsd: number|null, minWallMs: number|null, maxWallMs: number|null, unpricedCount: number, untimedCount: number}}}
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
  const stages = (stageClose(j.close) ?? []).map((/** @type {any} */ s) => (isObj(s) ? s.name : null));
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
