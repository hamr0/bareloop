// The thin reader/writer around src/learn.js (cross-run learnings, ITEM33-BUILD.md rev 2). All file IO lives here and
// the pure rules live in learn.js; nothing in either file can reach a model.
//
// ONE ledger per user: `<keys home>/learn/ledger.json` (~/.config/bareloop/learn/ledger.json in production; tests inject a
// scratch home and never create the real directory). It lives outside every person's repo, is written atomically
// (temp file + rename) and mode 600, and every string in it passes the one secret inventory before it is written.

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { keysHome } from './keysfile.js';
import { readConfig } from './config.js';
import { emptyLedger, redactDeep, countLedger, holdPending, releasePending, recordHealth, buildCards, placeOf, renderHints } from './learn.js';
import { stageQuestionsByName } from './stagewords.js';

/**
 * `<home>/learn/ledger.json`.
 * @param {string} [home] test seam; production never passes it
 * @returns {string}
 */
export function ledgerPath(home) {
  return join(keysHome(home), 'learn', 'ledger.json');
}

/**
 * Read the ledger. A missing file is an empty ledger; an unreadable or wrong-shaped one is reported as `problem` (and the
 * writer then refuses to replace it: an append-only record is never silently reset).
 * @param {string} [home]
 * @returns {{ledger: import('./learn.js').Ledger, exists: boolean, problem: string|null}}
 */
export function readLedger(home) {
  const file = ledgerPath(home);
  if (!existsSync(file)) return { ledger: emptyLedger(), exists: false, problem: null };
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    if (!d || typeof d !== 'object' || d.version !== 1 || !Array.isArray(d.rows) || !Array.isArray(d.pending)) {
      return { ledger: emptyLedger(), exists: true, problem: `${file} is not a version-1 learnings ledger — fix or remove it` };
    }
    return { ledger: { ...emptyLedger(), ...d }, exists: true, problem: null };
  } catch (/** @type {any} */ e) {
    return { ledger: emptyLedger(), exists: true, problem: `${file} is not readable JSON (${e?.code ?? 'parse error'}) — fix or remove it` };
  }
}

/**
 * Write the ledger atomically (temp + rename, mode 600), every string masked through the one secret inventory.
 * @param {import('./learn.js').Ledger} ledger @param {string} [home]
 * @returns {string} the file written
 */
export function writeLedger(ledger, home) {
  const file = ledgerPath(home);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(redactDeep(ledger), null, 1)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  return file;
}

/**
 * Fold ONE finished run into the ledger on disk: a deterministic job's cards COUNT now; a rubric job's cards are HELD
 * until a human Accept (they are written to `pending`, never counted, never readable). The run's health line is recorded
 * either way. Never throws on a bad ledger file: it reports `problem` and writes nothing.
 * @param {{home?: string, runid: string, build: import('./learn.js').CardBuild, workflow: string, place: string|null, specHash: string|null, trust: 'deterministic'|'rubric', at: string, now?: Date}} o
 * @returns {{wrote: boolean, counted: number, held: number, problem: string|null}}
 */
export function foldRunIntoLedger({ home, runid, build, workflow, place, specHash, trust, at, now = new Date() }) {
  const cur = readLedger(home);
  if (cur.problem) return { wrote: false, counted: 0, held: 0, problem: cur.problem };
  let L = cur.ledger;
  let counted = 0;
  let held = 0;
  if (trust === 'rubric') {
    L = holdPending(L, { runid, cards: build.cards, workflow, place, specHash, at }, now);
    held = build.cards.length;
  } else {
    const before = L.rows.reduce((n, r) => n + r.runIds.filter((x) => x === runid).length, 0);
    L = countLedger(L, { runid, cards: build.cards, workflow, place, specHash, trust, now });
    counted = L.rows.reduce((n, r) => n + r.runIds.filter((x) => x === runid).length, 0) - before;
  }
  L = recordHealth(L, runid, build, at, now);
  writeLedger(L, home);
  return { wrote: true, counted, held, problem: null };
}

/**
 * The human Accept at the review door: release the run's held rubric cards so they count (only forward, only here).
 * @param {{home?: string, runid: string, now?: Date}} o
 * @returns {{released: number, problem: string|null}}
 */
export function releaseRun({ home, runid, now = new Date() }) {
  const cur = readLedger(home);
  if (cur.problem) return { released: 0, problem: cur.problem };
  const r = releasePending(cur.ledger, runid, now);
  if (r.ledger !== cur.ledger) writeLedger(r.ledger, home);
  return { released: r.released, problem: null };
}

/**
 * The ONE setting: `learningHints` in config.json. Ships OFF (absent = off). OFF still writes the tally ($0) and the planner
 * is simply handed nothing, so an ON/OFF contrast has data at once. An unreadable config reads as OFF.
 * @param {string} [home]
 * @returns {boolean}
 */
export function learningHintsOn(home) {
  const c = readConfig({ home });
  return c.problem === null && c.config.learningHints === true;
}

/** @param {string} p @returns {any[]} the parsed rows of a JSONL file; missing or torn lines are skipped */
function readJsonl(p) {
  if (!existsSync(p)) return [];
  /** @type {any[]} */
  const rows = [];
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    if (!l) continue;
    try { rows.push(JSON.parse(l)); } catch { /* a torn line is skipped, never a crash */ }
  }
  return rows;
}

/** a path resolved to its real location when it exists, else as written @param {string} p */
const realOr = (p) => { try { return realpathSync(p); } catch { return p; } };

/**
 * THE RUN-END TALLY ($0, code only, no model): turn the finished run's whole record into cards and fold them into the
 * ledger (a rubric job's are held until Accept). Called once from the one engine's run-end block (src/userrun.js
 * `execute`, shared by the panel, the CLI and the bundle runner), inside its own try/catch: it is a record, never a verdict,
 * and can never change a run's outcome, exit code or spend. It runs whether the hints setting is on or off.
 * @param {{home?: string, runid: string, events: any[], auditFiles?: string[], spec: any, specHash: string|null, workdir: string|null, trust: 'deterministic'|'rubric', now?: Date}} o
 * @returns {{wrote: boolean, counted: number, held: number, problem: string|null, noise: string|null, cards: number}}
 */
export function learnAtRunEnd({ home, runid, events, auditFiles = [], spec, specHash, workdir, trust, now = new Date() }) {
  const audit = auditFiles.flatMap(readJsonl);
  const build = buildCards({ runid, events, audit, workdir, spec, questions: stageQuestionsByName(spec) });
  const at = events.findLast((e) => e?.type === 'job-end')?.ts ?? now.toISOString();
  const r = foldRunIntoLedger({
    home, runid, build, workflow: String(spec.job), place: placeOf(spec, realOr), specHash, trust, at, now,
  });
  return { ...r, noise: build.noise, cards: build.cards.length };
}

/**
 * The block the planner is handed for this job, made ONCE at run start from the ledger as it stood — empty when the
 * setting is off, when there is no ledger, or when nothing is readable. The one `renderHints` render, never a second.
 * @param {{home?: string, spec: any, specHash: string|null, now?: Date}} o
 * @returns {{text: string, ids: string[]}|null}
 */
export function hintsForRun({ home, spec, specHash, now = new Date() }) {
  if (!learningHintsOn(home)) return null;
  const cur = readLedger(home);
  if (cur.problem) return null;
  const r = renderHints(cur.ledger, { workflow: String(spec.job), place: placeOf(spec, realOr), specHash, now });
  return r.text ? r : null;
}
