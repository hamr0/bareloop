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
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { readRunList, runlistHome } from './runlist.js';

export const DRAFT_SPEND_FILE = 'draft-spend.json';

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
