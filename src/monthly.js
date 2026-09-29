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
import { SPEND_RECORD_TYPES, spendProvenance } from './ledger.js';
import { PROVIDER_ROWS, rowIdFor } from './providerrows.js';

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
 * Tokens a spine's rounds processed (input + output + cache read + cache write — all four,
 * so a cache-heavy run is not under-reported), off the real `usage` field names.
 * @param {any[]} records
 * @returns {number}
 */
export function legTokens(records) {
  let n = 0;
  for (const r of records) {
    if (!r || !SPEND_RECORD_TYPES.includes(r.type) || !r.usage) continue;
    for (const k of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens']) {
      const v = r.usage[k];
      if (typeof v === 'number' && Number.isFinite(v)) n += v;
    }
  }
  return n;
}

/**
 * @typedef {object} Leg
 * @property {Date} at when the run was listed
 * @property {string|null} provider job-start's provider (null = an older spine that carried none)
 * @property {string|null} baseUrl
 * @property {number} usd this leg's spend (a floor when `!complete`)
 * @property {boolean} complete every figure behind `usd` is known
 * @property {number} tokens
 * @property {number} vouchedRounds rounds priced by a rate somebody vouched for (`provider`/`caller`)
 * @property {number} otherRounds every other round: a built-in guess, unpriced, or no provenance on record
 * @property {boolean} unreadable the spine was missing/unreadable or the listed date was bad (spend unknown)
 */

/**
 * Every listed run as one {@link Leg}. The ONE reader the month total, the all-time total
 * and the per-provider figures share.
 * @param {{ home?: string }} [opts]
 * @returns {Leg[]}
 */
export function readLegs(opts = {}) {
  const { rows } = readRunList({ home: opts.home });
  /** @type {Leg[]} */
  const legs = [];
  for (const row of rows) {
    const at = new Date(row.at);
    const base = { at, provider: null, baseUrl: null, usd: 0, complete: false, tokens: 0, vouchedRounds: 0, otherRounds: 0, unreadable: true };
    if (Number.isNaN(at.getTime()) || !existsSync(row.spine)) { legs.push(base); continue; }
    /** @type {any[]} */
    let records;
    try { records = parseJsonl(row.spine).records; } catch { legs.push(base); continue; }
    const start = records.find((r) => r && r.type === 'job-start') ?? null;
    const leg = legSpend(records);
    const prov = spendProvenance(records);
    legs.push({
      at,
      provider: typeof start?.provider === 'string' ? start.provider : null,
      baseUrl: typeof start?.baseUrl === 'string' ? start.baseUrl : null,
      usd: leg.usd,
      complete: leg.complete,
      tokens: legTokens(records),
      vouchedRounds: prov.vouched.rounds,
      otherRounds: prov.guessed.rounds + prov.unpriced.rounds + prov.unknown.rounds,
      unreadable: false,
    });
  }
  return legs;
}

/**
 * @param {Date} at
 * @param {Date} now
 * @returns {boolean} same LOCAL calendar month
 */
const sameLocalMonth = (at, now) => at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();

/**
 * @param {{ home?: string, now?: () => number }} [opts]
 * @returns {{ usd: number, atLeast: boolean, runs: number }}
 */
export function monthSpend(opts = {}) {
  const nowDate = new Date((opts.now ?? Date.now)());
  let usd = 0;
  let atLeast = false;
  let runs = 0;
  for (const leg of readLegs({ home: opts.home })) {
    // an unreadable date could belong to this month — unknown, never dropped
    if (Number.isNaN(leg.at.getTime())) { atLeast = true; continue; }
    if (!sameLocalMonth(leg.at, nowDate)) continue;
    runs += 1;
    if (leg.unreadable) { atLeast = true; continue; }
    usd += leg.usd;
    if (!leg.complete) atLeast = true;
  }
  return { usd, atLeast, runs };
}

/**
 * The Money tab's figures: all-time and this-month spend, and per-provider breakdown
 * (rows from `rowIdFor`; a run on no known row lands under its own provider name, never
 * pooled into another row). Any leg with unknown spend makes the figure it belongs to
 * an "at least".
 * @param {{ home?: string, now?: () => number }} [opts]
 * @returns {{ total: {usd: number, atLeast: boolean}, month: {usd: number, atLeast: boolean},
 *   byProvider: Record<string, {label: string, monthUsd: number, monthAtLeast: boolean, totalUsd: number, totalAtLeast: boolean, tokens: number, vouchedRounds: number, otherRounds: number}> }}
 */
export function spendSummary(opts = {}) {
  const nowDate = new Date((opts.now ?? Date.now)());
  const total = { usd: 0, atLeast: false };
  const month = { usd: 0, atLeast: false };
  /** @type {Record<string, {label: string, monthUsd: number, monthAtLeast: boolean, totalUsd: number, totalAtLeast: boolean, tokens: number, vouchedRounds: number, otherRounds: number}>} */
  const byProvider = {};
  for (const leg of readLegs({ home: opts.home })) {
    const inMonth = Number.isNaN(leg.at.getTime()) ? true : sameLocalMonth(leg.at, nowDate);
    const id = rowIdFor(leg.provider, leg.baseUrl);
    const key = id ?? `other:${leg.provider ?? 'unknown'}${leg.baseUrl ? ` @ ${leg.baseUrl}` : ''}`;
    const label = id ? (PROVIDER_ROWS.find((r) => r.id === id)?.name ?? id) : key.slice('other:'.length);
    const p = (byProvider[key] ??= { label, monthUsd: 0, monthAtLeast: false, totalUsd: 0, totalAtLeast: false, tokens: 0, vouchedRounds: 0, otherRounds: 0 });
    const unknown = leg.unreadable || !leg.complete;
    total.usd += leg.usd; if (unknown) total.atLeast = true;
    p.totalUsd += leg.usd; p.tokens += leg.tokens; p.vouchedRounds += leg.vouchedRounds; p.otherRounds += leg.otherRounds; if (unknown) p.totalAtLeast = true;
    if (inMonth) {
      month.usd += leg.usd; if (unknown) month.atLeast = true;
      p.monthUsd += leg.usd; if (unknown) p.monthAtLeast = true;
    }
  }
  return { total, month, byProvider };
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
