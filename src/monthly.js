// PANEL-BUILD.md P4a item 2 — the monthly $ limit (R1, R2, R3).
//
// `monthSpend` sums what this local calendar month's runs spent, read off each run's own
// spine (the run list `~/.config/bareloop/runs.jsonl` carries no money). `checkMonthlyRoom`
// asks whether a run's $ cap fits in what is left. It is called at the ONE run-start seam
// both the CLI (`bareloop run-u`) and the panel (which spawns `run-u`) pass through
// (`execute` in src/userrun.js), before any token spends, and by the panel's cap note.
// The limit REFUSES, never warns; the page and the chat can never raise it (a person
// edits it by hand in Settings — src/config.js).
//
// Honesty: a run whose spend is not fully known (a died/still-running spine, an unpriced
// round, a missing spine file) makes the month total an "at least" figure — never a clean
// number. The refusal text stays exactly `Max $X (monthly limit)`; `atLeast` travels beside it.
import { existsSync } from 'node:fs';
import { readConfig, ConfigError } from './config.js';
import { readRunList } from './runlist.js';
import { parseJsonl } from './replayio.js';
import { SPEND_RECORD_TYPES } from './ledger.js';

/**
 * One run's own spend, off its spine records: this LEG's figure (never the chain fold),
 * plus the drafting spend the run was signed with (counted once — on the first leg only).
 * @param {any[]} records
 * @returns {{ usd: number, complete: boolean }}
 */
export function legSpend(records) {
  const jobStart = records.find((r) => r && r.type === 'job-start') ?? null;
  const jobEnd = records.findLast((r) => r && r.type === 'job-end') ?? null;
  const rounds = records.filter((r) => r && SPEND_RECORD_TYPES.includes(r.type));
  const pricedSum = rounds.reduce((a, r) => (typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? a + r.costUsd : a), 0);
  const unpriced = rounds.filter((r) => !(typeof r.costUsd === 'number' && Number.isFinite(r.costUsd))).length;
  let usd = pricedSum;
  let complete = false;
  if (jobEnd) {
    const eng = jobEnd.engagementSpentUsd;
    usd = typeof eng === 'number' && Number.isFinite(eng) ? eng : pricedSum;
    complete = jobEnd.spendComplete === true && unpriced === 0;
  }
  // drafting spend: a RESUMED / door-rerun leg carries the flag again but the first leg already counted it
  const resumed = !!jobStart && 'priorSpentUsd' in jobStart;
  if (jobStart && !resumed && typeof jobStart.draftSpentUsd === 'number' && Number.isFinite(jobStart.draftSpentUsd) && jobStart.draftSpentUsd > 0) {
    usd += jobStart.draftSpentUsd;
    if (jobStart.draftSpendComplete === false) complete = false;
  }
  return { usd, complete };
}

/**
 * @param {{ home?: string, now?: () => number }} [opts]
 * @returns {{ usd: number, atLeast: boolean, runs: number }}
 */
export function monthSpend(opts = {}) {
  const nowDate = new Date((opts.now ?? Date.now)());
  const { rows } = readRunList({ home: opts.home });
  let usd = 0;
  let atLeast = false;
  let runs = 0;
  for (const row of rows) {
    const at = new Date(row.at);
    if (Number.isNaN(at.getTime())) { atLeast = true; continue; } // an unreadable date could belong to this month — unknown, never dropped
    if (at.getFullYear() !== nowDate.getFullYear() || at.getMonth() !== nowDate.getMonth()) continue;
    runs += 1;
    if (!existsSync(row.spine)) { atLeast = true; continue; }
    /** @type {any[]} */
    let records;
    try { records = parseJsonl(row.spine).records; } catch { atLeast = true; continue; }
    const leg = legSpend(records);
    usd += leg.usd;
    if (!leg.complete) atLeast = true;
  }
  return { usd, atLeast, runs };
}

/**
 * @typedef {object} MonthlyRoom
 * @property {boolean} ok
 * @property {number|null} leftUsd what is left this month (null = no limit set)
 * @property {number|null} limitUsd the person's monthly limit (null = none)
 * @property {boolean} atLeast the month's spend is a floor, so `leftUsd` is a ceiling
 */

/**
 * Does a run with this $ cap fit in what is left this month? No limit set = ok, no check.
 * Compared in whole cents. Throws `ConfigError` when config.json is unreadable — a gate
 * whose own instrument is broken refuses; it never silently runs with no limit.
 * @param {{ capUsd: number, home?: string, now?: () => number }} args
 * @returns {MonthlyRoom}
 */
export function checkMonthlyRoom({ capUsd, home, now }) {
  const cfg = readConfig({ home });
  if (cfg.problem) throw new ConfigError(cfg.problem);
  const limit = cfg.config.monthlyLimitUsd;
  if (!(typeof limit === 'number' && Number.isFinite(limit) && limit > 0)) {
    return { ok: true, leftUsd: null, limitUsd: null, atLeast: false };
  }
  const spent = monthSpend({ home, now });
  const leftCents = Math.max(0, Math.floor((limit - spent.usd) * 100 + 1e-6));
  const capCents = Math.ceil((Number.isFinite(capUsd) ? capUsd : 0) * 100 - 1e-6);
  return { ok: capCents <= leftCents, leftUsd: leftCents / 100, limitUsd: limit, atLeast: spent.atLeast };
}

/**
 * The ONE refusal text, everywhere (CLI, panel cap note, panel Sign refusal).
 * @param {MonthlyRoom} room
 * @returns {string|null} null when the run fits
 */
export function monthlyRefusalText(room) {
  if (room.ok || room.leftUsd === null) return null;
  return `Max $${room.leftUsd.toFixed(2)} (monthly limit)`;
}
