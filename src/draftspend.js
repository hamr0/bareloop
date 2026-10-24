// Drafting spend that never became a run (self-review 2026-10-05, hamr's ruling A).
//
// A panel authoring session pays for model calls (survey, declaration, confirm turn) BEFORE any run exists.
// That spend rode only in memory (`state.draftSpentUsd`) and reached disk when the session was signed and run
// (`--draft-spent-usd` -> the run's spine). Abandon, a refusal, or a panel restart lost it, while the monthly
// limit and the Money tab never counted it. So the session appends one `call` line to `<session dir>/draft-log.jsonl`
// after EVERY metered call (one owner: the session's `onCall`, src/panel/authorsession.js), and the money readers
// (`readLegs`, src/monthly.js) fold those lines with `tallyCalls` for every session folder that NEVER became a run.
// (Records ruling 2026-10-24: the total used to be a second file, `draft-spend.json`, rewritten beside the log. Things
// written and read together live together, so the log is the only record. A session folder from before the change that
// has the old file and no call lines is still read from that file, so old money is never lost.)
//
// "Became a run" = some run-list row's `spine` or `patient` path sits inside that session's folder: a signed run
// already carries its drafting spend through `--draft-spent-usd`, so counting the log too would double it.
// Month attribution is the first call's `at` (`startedAt`): fixed once written, so a session's
// figure never moves between months as spend continues, the same start-date rule a run's leg uses.
// `spendComplete: false` = "at least", never $0 (F6).
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { readRunList, runlistHome } from './runlist.js';
import { tallyCalls } from './text.js';

/** the OLD per-session total, no longer written; read only for a session folder that predates the log's call lines carrying it */
export const DRAFT_SPEND_FILE = 'draft-spend.json';
/** the session's drafting LOG: an append-only JSONL (one owner: the session, src/panel/authorsession.js). Three event kinds, see {@link DraftEvent}. */
export const DRAFT_LOG_FILE = 'draft-log.jsonl';

/**
 * One line of the drafting log. `no` = the step's position in the session's progress list (a step id can repeat).
 *  - `step-start`  {no, id, label, at}
 *  - `step-end`    {no, status: 'done'|'failed', label, at}   (a re-opened step writes `step-reopen` {no, at} first)
 *  - `step-label`  {no, label, at}   (the step reads `label` from now on, status and times untouched: the thinking row's "the model thought anyway" / "can't change it" / "not confirmed")
 *  - `human`       {no, source: 'confirm'|'try-3'|'look', question, answer, line?, at}: one question the person was asked and what they answered (the answer is secret-masked
 *    before it is written; the row is written only when BOTH exist, so a question nobody answered leaves no row)
 *  - `call`        {no, step, label, model, provider, baseUrl, thinking, thinkingSupport, thinkingStatus?, costUsd (null stays null), unpricedRounds, at}: one METERED model call
 *    (`thinking` = the tick's mode: off | on; `thinkingSupport` = bare-agent's lookup for the model: true | false | 'unverified';
 *    `thinkingStatus` = bare-agent's own verdict for the call's run: applied | unsupported | ignored | unknown, present only when thinkingMode was sent)
 *    (no token counts: the call path does not carry them without reworking the library, so none are recorded)
 * @typedef {{kind: string, no: number, at: string, [k: string]: any}} DraftEvent
 */

/**
 * Append one event to `<dir>/draft-log.jsonl`. Best-effort: a disk fault never stops the draft.
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

/** @param {string} p @param {string} dir @returns {boolean} */
const inside = (p, dir) => typeof p === 'string' && (resolve(p) === dir || resolve(p).startsWith(dir + sep));

/**
 * One session's drafting spend from its log's `call` lines (the same `tallyCalls` reader the session's `onCall` uses).
 * `null` = the log holds no call and nothing unparseable. A line that cannot be parsed is skipped like in
 * {@link readDraftSteps}, but it may have been a call, so it makes the figure an "at least" (a torn line never reads low as exact).
 * @param {string} name the session folder name
 * @param {string} text the log
 * @returns {DraftSpend|null}
 */
function spendFromLog(name, text) {
  /** @type {{costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  /** @type {any[]} */
  const lines = [];
  let torn = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { torn = true; continue; }
    if (!ev || typeof ev !== 'object') { torn = true; continue; }
    if (ev.kind !== 'call') continue;
    calls.push({ costUsd: typeof ev.costUsd === 'number' ? ev.costUsd : null, unpricedRounds: Number(ev.unpricedRounds) || 0 });
    lines.push(ev);
  }
  if (calls.length === 0) {
    return torn ? { sessionId: name, spentUsd: 0, spendComplete: false, provider: null, baseUrl: null, model: null, startedAt: 'unreadable', updatedAt: 'unreadable' } : null;
  }
  const t = tallyCalls(calls);
  /** @param {string} k @returns {string|null} the latest call line's value that has one */
  const last = (k) => { for (let i = lines.length - 1; i >= 0; i -= 1) if (typeof lines[i][k] === 'string') return lines[i][k]; return null; };
  return {
    sessionId: name, spentUsd: t.knownUsd, spendComplete: t.spendComplete && !torn,
    provider: last('provider'), baseUrl: last('baseUrl'), model: last('model'),
    startedAt: String(lines[0].at), updatedAt: String(lines[lines.length - 1].at),
  };
}

/**
 * One session's LEGACY `draft-spend.json` (written before the log's call lines carried the total). An unreadable one is unknown
 * spend: an "at least" of $0, dated unknown.
 * @param {string} name @param {string} file @returns {DraftSpend}
 */
function spendFromLegacyFile(name, file) {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    if (!j || typeof j !== 'object' || !Number.isFinite(j.spentUsd)) throw new Error('unreadable');
    return {
      sessionId: String(j.sessionId ?? name), spentUsd: j.spentUsd, spendComplete: j.spendComplete === true,
      provider: typeof j.provider === 'string' ? j.provider : null, baseUrl: typeof j.baseUrl === 'string' ? j.baseUrl : null,
      model: typeof j.model === 'string' ? j.model : null, startedAt: String(j.startedAt), updatedAt: String(j.updatedAt),
    };
  } catch {
    return { sessionId: name, spentUsd: 0, spendComplete: false, provider: null, baseUrl: null, model: null, startedAt: 'unreadable', updatedAt: 'unreadable' };
  }
}

/**
 * Every session folder's drafting spend that never became a run: folded from the log's `call` lines, else read from a legacy
 * `draft-spend.json`; a folder with neither is skipped.
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
    const logFile = join(dir, DRAFT_LOG_FILE);
    const legacy = join(dir, DRAFT_SPEND_FILE);
    const hasLog = existsSync(logFile);
    const hasLegacy = existsSync(legacy);
    if (!hasLog && !hasLegacy) continue;
    if (rows.some((r) => inside(r.spine, dir) || (r.patient && inside(r.patient, dir)))) continue;
    /** @type {DraftSpend|null} */
    let d = null;
    if (hasLog) {
      try { d = spendFromLog(name, readFileSync(logFile, 'utf8')); } catch {
        // a log that names money but cannot be read is unknown spend, unless the legacy file still has the figure
        d = hasLegacy ? null : { sessionId: name, spentUsd: 0, spendComplete: false, provider: null, baseUrl: null, model: null, startedAt: 'unreadable', updatedAt: 'unreadable' };
      }
    }
    if (d === null && hasLegacy) d = spendFromLegacyFile(name, legacy);
    if (d !== null) out.push(d);
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
 * PRD v1.106 Part 5 Q1: one answered question as the two lines the Audit's drafting table shows under its step. ONE place owns the words.
 * @param {{question: string, answer: string, source?: string, line?: number, at?: string}} h
 * @returns {{question: string, answer: string, source: string, line?: number, at?: string, askedText: string, saidText: string}}
 */
export function humanRowWords(h) {
  return {
    question: h.question, answer: h.answer, source: typeof h.source === 'string' ? h.source : 'confirm',
    ...(Number.isInteger(h.line) ? { line: h.line } : {}), ...(h.at ? { at: h.at } : {}),
    askedText: `you were asked: ${h.question}`, saidText: `you said: ${h.answer}`,
  };
}

/**
 * Fold `<dir>/draft-log.jsonl` into one record per drafting step, each with its calls. A line that cannot be parsed is
 * skipped (a torn last line must not hide the rest).
 * @param {string} dir
 * @returns {{no: number, id: string, label: string, status: 'running'|'done'|'failed', startedAt: string, endedAt: string|null, wallMs: number|null,
 *   calls: {label: string, model: string|null, costUsd: number|null, unpricedRounds: number, at: string}[],
 *   humans: ReturnType<typeof humanRowWords>[]}[]}
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
      byNo.set(ev.no, { no: ev.no, id: String(ev.id), label: String(ev.label), status: 'running', startedAt: ev.at, endedAt: null, wallMs: null, calls: [], humans: [] });
    } else if (ev.kind === 'step-end' && byNo.has(ev.no)) {
      const x = byNo.get(ev.no);
      x.status = ev.status === 'failed' ? 'failed' : 'done';
      x.endedAt = ev.at;
      if (typeof ev.label === 'string') x.label = ev.label;
    } else if (ev.kind === 'step-label' && byNo.has(ev.no)) {
      if (typeof ev.label === 'string') byNo.get(ev.no).label = ev.label;
    } else if (ev.kind === 'step-reopen' && byNo.has(ev.no)) {
      const x = byNo.get(ev.no);
      x.status = 'running';
      x.endedAt = null;
    } else if (ev.kind === 'human' && byNo.has(ev.no) && typeof ev.question === 'string' && typeof ev.answer === 'string') {
      byNo.get(ev.no).humans.push(humanRowWords({ question: ev.question, answer: ev.answer, source: ev.source, ...(Number.isInteger(ev.line) ? { line: ev.line } : {}), at: ev.at }));
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
