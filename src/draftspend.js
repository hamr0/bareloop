// Drafting spend that never became a run (self-review 2026-10-05, hamr's ruling A).
//
// A panel authoring session pays for model calls (survey, declaration, confirm turn) BEFORE any run exists.
// That spend rode only in memory (`state.draftSpentUsd`) and reached disk when the session was signed and run
// (`--draft-spent-usd` -> the run's spine). Abandon, a refusal, or a panel restart lost it, while the monthly
// limit and the Money tab never counted it. So the session writes `<session dir>/draft-spend.json` after EVERY
// metered call (one owner: the session's `onCall`, src/panel/authorsession.js), and the money readers
// (`readLegs`, src/monthly.js) add every session folder that carries one and NEVER became a run.
//
// "Became a run" = some run-list row's `spine` or `patient` path sits inside that session's folder: a signed run
// already carries its drafting spend through `--draft-spent-usd`, so counting the file too would double it.
// Month attribution is the file's `startedAt` (the first metered call): fixed once written, so a session's
// figure never moves between months as spend continues, the same start-date rule a run's leg uses.
// `spendComplete: false` = "at least", never $0 (F6).
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { readRunList, runlistHome } from './runlist.js';

export const DRAFT_SPEND_FILE = 'draft-spend.json';
/** the session's drafting LOG: an append-only JSONL beside draft-spend.json (one owner: the session, src/panel/authorsession.js). Three event kinds, see {@link DraftEvent}. */
export const DRAFT_LOG_FILE = 'draft-log.jsonl';

/**
 * One line of the drafting log. `no` = the step's position in the session's progress list (a step id can repeat).
 *  - `step-start`  {no, id, label, at}
 *  - `step-end`    {no, status: 'done'|'failed', label, at}   (a re-opened step writes `step-reopen` {no, at} first)
 *  - `call`        {no, step, label, model, costUsd (null stays null), unpricedRounds, at}: one METERED model call
 *    (no token counts: the call path does not carry them without reworking the library, so none are recorded)
 * @typedef {{kind: string, no: number, at: string, [k: string]: any}} DraftEvent
 */

/**
 * Append one event to `<dir>/draft-log.jsonl`. Best-effort like draft-spend.json: a disk fault never stops the draft.
 * @param {string} dir the session's folder
 * @param {DraftEvent} ev
 * @returns {void}
 */
export function appendDraftLog(dir, ev) {
  try { appendFileSync(join(dir, DRAFT_LOG_FILE), `${JSON.stringify(ev)}\n`); } catch { /* money already spent stays in memory */ }
}

/**
 * @typedef {object} DraftSpend
 * @property {string} sessionId
 * @property {number} spentUsd the known floor of the session's drafting spend
 * @property {boolean} spendComplete false = `spentUsd` is a floor ("at least")
 * @property {string|null} provider the worker's provider shape (`anthropic-api` | `openai-api` | ...)
 * @property {string|null} baseUrl
 * @property {string|null} model
 * @property {string} startedAt ISO, the first metered call
 * @property {string} updatedAt ISO, the latest metered call
 */

/**
 * (Re)write `<dir>/draft-spend.json` atomically (tmp + rename).
 * @param {string} dir the session's folder
 * @param {DraftSpend} rec
 * @returns {void}
 */
export function writeDraftSpend(dir, rec) {
  const file = join(dir, DRAFT_SPEND_FILE);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`);
  renameSync(tmp, file);
}

/** @param {string} p @param {string} dir @returns {boolean} */
const inside = (p, dir) => typeof p === 'string' && (resolve(p) === dir || resolve(p).startsWith(dir + sep));

/**
 * Every session folder's drafting spend that never became a run.
 * @param {{ home?: string, sessionsRoot?: string }} [opts] `home` = the bareloop config dir (as everywhere in src/monthly.js); the sessions live in `<home>/panel-sessions` unless `sessionsRoot` names them
 * @returns {DraftSpend[]}
 */
export function readOrphanDraftSpends(opts = {}) {
  const root = resolve(opts.sessionsRoot ?? join(runlistHome(opts.home), 'panel-sessions'));
  if (!existsSync(root)) return [];
  /** @type {string[]} */
  let names;
  try { names = readdirSync(root); } catch { return []; }
  const { rows } = readRunList({ home: opts.home });
  /** @type {DraftSpend[]} */
  const out = [];
  for (const name of names) {
    const dir = join(root, name);
    const file = join(dir, DRAFT_SPEND_FILE);
    if (!existsSync(file)) continue;
    if (rows.some((r) => inside(r.spine, dir) || (r.patient && inside(r.patient, dir)))) continue;
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      if (!j || typeof j !== 'object' || !Number.isFinite(j.spentUsd)) throw new Error('unreadable');
      out.push({
        sessionId: String(j.sessionId ?? name), spentUsd: j.spentUsd, spendComplete: j.spendComplete === true,
        provider: typeof j.provider === 'string' ? j.provider : null, baseUrl: typeof j.baseUrl === 'string' ? j.baseUrl : null,
        model: typeof j.model === 'string' ? j.model : null, startedAt: String(j.startedAt), updatedAt: String(j.updatedAt),
      });
    } catch {
      // a file that names money but cannot be read is unknown spend: an "at least" of $0, dated unknown
      out.push({ sessionId: name, spentUsd: 0, spendComplete: false, provider: null, baseUrl: null, model: null, startedAt: 'unreadable', updatedAt: 'unreadable' });
    }
  }
  return out;
}

/**
 * The session folder a run-list row became a run in: the folder under `<home>/panel-sessions` that carries a drafting
 * log and holds the row's `spine` or `patient` ("became a run", the same rule as {@link readOrphanDraftSpends}).
 * A Reuse-workflow run, a CLI run and an imported run sit in no such folder.
 * @param {{spine?: string, patient?: string|null}} row
 * @param {{ home?: string, sessionsRoot?: string }} [opts]
 * @returns {string|null}
 */
export function sessionDirForRow(row, opts = {}) {
  const root = resolve(opts.sessionsRoot ?? join(runlistHome(opts.home), 'panel-sessions'));
  /** @type {string[]} */
  let names;
  try { names = readdirSync(root); } catch { return null; }
  for (const name of names) {
    const dir = join(root, name);
    if (!existsSync(join(dir, DRAFT_LOG_FILE))) continue;
    if (inside(/** @type {string} */ (row.spine), dir) || (row.patient && inside(row.patient, dir))) return dir;
  }
  return null;
}

/**
 * Fold `<dir>/draft-log.jsonl` into one record per drafting step, each with its calls. A line that cannot be parsed is
 * skipped (a torn last line must not hide the rest).
 * @param {string} dir
 * @returns {{no: number, id: string, label: string, status: 'running'|'done'|'failed', startedAt: string, endedAt: string|null, wallMs: number|null,
 *   calls: {label: string, model: string|null, costUsd: number|null, unpricedRounds: number, at: string}[]}[]}
 */
export function readDraftSteps(dir) {
  /** @type {string} */
  let text;
  try { text = readFileSync(join(dir, DRAFT_LOG_FILE), 'utf8'); } catch { return []; }
  /** @type {Map<number, any>} */
  const byNo = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev !== 'object' || !Number.isInteger(ev.no)) continue;
    if (ev.kind === 'step-start') {
      byNo.set(ev.no, { no: ev.no, id: String(ev.id), label: String(ev.label), status: 'running', startedAt: ev.at, endedAt: null, wallMs: null, calls: [] });
    } else if (ev.kind === 'step-end' && byNo.has(ev.no)) {
      const x = byNo.get(ev.no);
      x.status = ev.status === 'failed' ? 'failed' : 'done';
      x.endedAt = ev.at;
      if (typeof ev.label === 'string') x.label = ev.label;
    } else if (ev.kind === 'step-reopen' && byNo.has(ev.no)) {
      const x = byNo.get(ev.no);
      x.status = 'running';
      x.endedAt = null;
    } else if (ev.kind === 'call') {
      const c = { label: String(ev.label), model: typeof ev.model === 'string' ? ev.model : null, costUsd: typeof ev.costUsd === 'number' ? ev.costUsd : null, unpricedRounds: Number(ev.unpricedRounds) || 0, at: String(ev.at) };
      byNo.get(ev.no)?.calls.push(c);
    }
  }
  const steps = [...byNo.values()].sort((a, b) => a.no - b.no);
  for (const x of steps) {
    const a = Date.parse(x.startedAt);
    const b = x.endedAt === null ? NaN : Date.parse(x.endedAt);
    x.wallMs = Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
  }
  return steps;
}

/**
 * The DRAFTING PART of a run (hamr 2026-10-06, option A): the first part of the run's views, built from the session's
 * drafting log. `null` when the run did not come out of a panel session, or the log carries no metered call (a Reuse
 * workflow run, a CLI run, a run older than the log). The part's money is the SPINE's figure (`job-start.draftSpentUsd`,
 * passed in) — the log's calls are shown beside it, never summed into a second total; `null` spine figure = no part.
 * @param {{spine?: string, patient?: string|null}} row
 * @param {{draftSpentUsd: number|null, draftSpendComplete: boolean|null}} spine the run's own drafting figures
 * @param {{ home?: string, sessionsRoot?: string }} [opts]
 * @returns {any|null}
 */
export function draftingPartFor(row, spine, opts = {}) {
  if (spine.draftSpentUsd === null) return null;
  const dir = sessionDirForRow(row, opts);
  if (!dir) return null;
  const steps = readDraftSteps(dir);
  const calls = steps.reduce((n, x) => n + x.calls.length, 0);
  if (calls === 0) return null;
  const starts = steps.map((x) => Date.parse(x.startedAt)).filter(Number.isFinite);
  const ends = steps.map((x) => (x.endedAt === null ? NaN : Date.parse(x.endedAt))).filter(Number.isFinite);
  return {
    kind: 'drafting', id: 'drafting', label: 'drafting', occurrence: 1, leg: 1, outcome: null, blocked: 0,
    attempts: [], rounds: calls, toolCalls: 0, byTool: null,
    wallMs: starts.length && ends.length ? Math.max(0, Math.max(...ends) - Math.min(...starts)) : null,
    spentUsd: spine.draftSpentUsd, spendComplete: spine.draftSpendComplete !== false, unpricedRounds: 0,
    draftSteps: steps,
  };
}
