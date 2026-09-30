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
// HOLD UNTIL DONE (hamr 2026-09-30): a run CLAIMS its whole leg cap when it starts (`claimRun`: append
// the run's row FIRST, carrying its `pid` and `capUsd`, then read the list — only the claims ABOVE its row
// count, so whoever runs first holds) and holds it until it is done. While the row's pid is a live bareloop runner the
// run is counted at max(spend so far, capUsd) however quiet its spine; a run with a `job-end` counts
// its real spend; a claim whose process is gone counts its floor and is settled — with an attributed
// `settled` entry — by whichever later run finds it (the first note wins). An older row with no `pid` keeps the spine
// mtime rule (a fresh spine, written to within DIED_MTIME_MS, is in flight). Only the refusal check
// reserves; the Money tab keeps showing real spend (`usd`).
//
// Honesty: a run whose spend is not fully known (a died/still-running spine, an unpriced
// round, a missing spine file) makes the month total an "at least" figure — never a clean
// number. The refusal text stays exactly `Max $X (monthly limit)`; `atLeast` travels beside it.
import { existsSync, statSync } from 'node:fs';
import { readConfig, configPath, ConfigError } from './config.js';
import { readRunList, appendRun, appendRunEvent, isLiveRunner, DIED_MTIME_MS } from './runlist.js';
import { parseJsonl } from './replayio.js';
import { SPEND_RECORD_TYPES, spendProvenance, floorsFromRecords } from './ledger.js';
import { findRow } from './providerrows.js';

// The Money tab's per-provider breakdown groups a run by the endpoint it ran on and names
// the groups it knows the vendor of. This is HISTORY labelling for spend already recorded
// (an archived run keeps its provider whatever Settings holds today) — not the Providers
// rows, which come from the keys file (src/providerrows.js).
/** @type {readonly {id: string, name: string}[]} */
const MONEY_LABELS = Object.freeze([
  { id: 'anthropic', name: 'Anthropic' }, { id: 'openai', name: 'OpenAI' },
  { id: 'gemini', name: 'Gemini' }, { id: 'deepseek', name: 'DeepSeek' },
]);

/**
 * Which known vendor a run's `(provider, baseUrl)` belongs to. `openai-api` with no override
 * is OpenAI; with DeepSeek's host it is DeepSeek; with any OTHER override it is none (null —
 * never silently pooled into OpenAI's figures).
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @returns {string|null} a MONEY_LABELS id, or null
 */
function rowIdFor(provider, baseUrl) {
  if (provider === 'anthropic-api') return 'anthropic';
  if (provider === 'gemini-api') return 'gemini';
  if (provider === 'openai-api') {
    if (!baseUrl) return 'openai';
    try {
      const host = new URL(baseUrl).hostname;
      if (host === 'api.deepseek.com') return 'deepseek';
    } catch { /* an unparseable override is no known vendor */ }
    return null;
  }
  return null;
}

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
 * One run's wall time off its spine: job-start -> job-end when the run ended (exact), else the
 * first -> last record floor (the SAME floor a died / still-running run's "at least" wall uses,
 * `floorsFromRecords`). `ms` null = unknown — never 0.
 * @param {any[]} records
 * @returns {{ ms: number|null, complete: boolean }}
 */
export function legWall(records) {
  const jobStart = records.find((r) => r && r.type === 'job-start') ?? null;
  const jobEnd = records.findLast((r) => r && r.type === 'job-end') ?? null;
  const a = Date.parse(jobStart?.ts);
  const b = Date.parse(jobEnd?.ts);
  if (jobEnd && Number.isFinite(a) && Number.isFinite(b) && b >= a) return { ms: b - a, complete: true };
  return { ms: floorsFromRecords(records).wallFloorMs, complete: false };
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
 * @property {string|null} model job-start's model (older spines carry a model but no provider)
 * @property {number|null} wallMs this leg's wall time (null = unknown; a floor when `!wallComplete`)
 * @property {boolean} wallComplete the wall is the exact job-start -> job-end span
 * @property {number} vouchedRounds rounds priced by a rate somebody vouched for (`provider`/`caller`)
 * @property {number} otherRounds every other round: a built-in guess, unpriced, or no provenance on record
 * @property {number} reservedUsd what the refusal check counts: `usd`, or the leg's cap when the run is in flight
 * @property {boolean} unreadable the spine was missing/unreadable or the listed date was bad (spend unknown)
 */

/**
 * What the refusal check counts for one run: its spend, unless it is IN FLIGHT (`job-start`, no
 * `job-end`, spine written to within DIED_MTIME_MS of `nowMs`), when it is the larger of that
 * spend and the leg's own cap — the signed `budgetUsd` on the spine's `job-start` less the fold
 * a resumed leg inherited (`priorSpentUsd`), the same figure the run-start seam computes
 * (`legCapUsd`, src/userrun.js). A spine that records no `budgetUsd` reserves nothing extra.
 * @param {any[]} records
 * @param {string} spinePath
 * @param {number} nowMs
 * @param {number} usd the leg's spend so far
 * @returns {number}
 */
function inFlightCapUsd(records, spinePath, nowMs, usd) {
  if (records.some((r) => r && r.type === 'job-end')) return usd;
  const start = records.find((r) => r && r.type === 'job-start') ?? null;
  if (!start || !(typeof start.budgetUsd === 'number' && Number.isFinite(start.budgetUsd))) return usd;
  let mtimeMs;
  try { mtimeMs = statSync(spinePath).mtimeMs; } catch { return usd; }
  if (nowMs - mtimeMs > DIED_MTIME_MS) return usd; // stale — died, counts its floor
  const fold = typeof start.priorSpentUsd === 'number' && Number.isFinite(start.priorSpentUsd) ? start.priorSpentUsd : 0;
  return Math.max(usd, Math.max(0, start.budgetUsd - fold));
}

/**
 * The rows listed EARLIER in the run list than `runid`'s own row (file order is claim order). No
 * `runid`, or a runid not in the list, = every row.
 * @param {import('./runlist.js').RunRow[]} rows
 * @param {string} [runid]
 * @returns {import('./runlist.js').RunRow[]}
 */
function rowsAbove(rows, runid) {
  if (runid === undefined) return rows;
  const i = rows.findIndex((r) => r.runid === runid);
  return i < 0 ? rows : rows.slice(0, i);
}

/**
 * Every listed run as one {@link Leg}. The ONE reader the month total, the all-time total
 * and the per-provider figures share.
 * @param {{ home?: string, now?: () => number, aboveRunid?: string }} [opts] `now` = the clock for the no-pid in-flight test; `aboveRunid` = read only the runs listed EARLIER in the file than that run (a claim yields to the claims above it, never below)
 * @returns {Leg[]}
 */
export function readLegs(opts = {}) {
  const nowMs = (opts.now ?? Date.now)();
  const { rows: allRows, events } = readRunList({ home: opts.home });
  const rows = rowsAbove(allRows, opts.aboveRunid);
  const settled = new Set(events.filter((e) => e.type === 'settled').map((e) => e.runid));
  /** @type {Leg[]} */
  const legs = [];
  for (const row of rows) {
    const at = new Date(row.at);
    const base = { at, provider: null, baseUrl: null, model: null, wallMs: null, wallComplete: false, usd: 0, complete: false, tokens: 0, vouchedRounds: 0, otherRounds: 0, reservedUsd: 0, unreadable: true };
    // Rule 2 (hold-until-done): a row that carries its runner's `pid` is HELD at its cap while that
    // pid is a live bareloop runner, however quiet its spine — killed = process gone, not silence.
    // An older row with no `pid` keeps the spine-mtime rule (`inFlightCapUsd`), never guessed alive.
    const hasPid = Number.isInteger(row.pid);
    const heldCap = hasPid && !settled.has(row.runid) && typeof row.capUsd === 'number' && Number.isFinite(row.capUsd) && isLiveRunner(/** @type {number} */ (row.pid)) ? row.capUsd : null;
    if (Number.isNaN(at.getTime()) || !existsSync(row.spine)) { legs.push({ ...base, reservedUsd: heldCap ?? 0 }); continue; }
    /** @type {any[]} */
    let records;
    try { records = parseJsonl(row.spine).records; } catch { legs.push({ ...base, reservedUsd: heldCap ?? 0 }); continue; }
    const start = records.find((r) => r && r.type === 'job-start') ?? null;
    const leg = legSpend(records);
    const prov = spendProvenance(records);
    const wall = legWall(records);
    legs.push({
      at,
      model: typeof start?.model === 'string' ? start.model : null,
      wallMs: wall.ms,
      wallComplete: wall.complete,
      provider: typeof start?.provider === 'string' ? start.provider : null,
      baseUrl: typeof start?.baseUrl === 'string' ? start.baseUrl : null,
      usd: leg.usd,
      complete: leg.complete,
      tokens: legTokens(records),
      vouchedRounds: prov.vouched.rounds,
      otherRounds: prov.guessed.rounds + prov.unpriced.rounds + prov.unknown.rounds,
      reservedUsd: hasPid ? (records.some((r) => r && r.type === 'job-end') || heldCap === null ? leg.usd : Math.max(leg.usd, heldCap))
        : inFlightCapUsd(records, row.spine, nowMs, leg.usd),
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
 * @param {{ home?: string, now?: () => number, aboveRunid?: string }} [opts] `aboveRunid`: see {@link readLegs}
 * @returns {{ usd: number, atLeast: boolean, runs: number, reservedUsd: number }} `usd` = real spend (the Money tab's figure); `reservedUsd` = the same with in-flight runs at their cap (the refusal check's)
 */
export function monthSpend(opts = {}) {
  const nowDate = new Date((opts.now ?? Date.now)());
  let usd = 0;
  let reservedUsd = 0;
  let atLeast = false;
  let runs = 0;
  for (const leg of readLegs({ home: opts.home, now: opts.now, aboveRunid: opts.aboveRunid })) {
    // an unreadable date could belong to this month — unknown, never dropped
    if (Number.isNaN(leg.at.getTime())) { atLeast = true; continue; }
    if (!sameLocalMonth(leg.at, nowDate)) continue;
    runs += 1;
    if (leg.unreadable) { atLeast = true; reservedUsd += leg.reservedUsd; continue; }
    usd += leg.usd;
    reservedUsd += leg.reservedUsd;
    if (!leg.complete) atLeast = true;
  }
  return { usd, atLeast, runs, reservedUsd };
}

/**
 * The Money tab's figures: all-time and this-month spend, and per-provider breakdown
 * (rows from `rowIdFor`; a run on no known row lands under its own provider name, never
 * pooled into another row). Any leg with unknown spend makes the figure it belongs to
 * an "at least".
 * @param {{ home?: string, now?: () => number, rows?: readonly import('./providerrows.js').KeyRow[] }} [opts] `rows` = the Providers rows: when given, `tokensByRow` sums each row's tokens
 * @returns {{ tokensByRow: Record<string, number>, total: {usd: number, atLeast: boolean, tokens: number}, month: {usd: number, atLeast: boolean, tokens: number},
 *   byProvider: Record<string, {label: string, monthUsd: number, monthAtLeast: boolean, totalUsd: number, totalAtLeast: boolean, tokens: number, vouchedRounds: number, otherRounds: number, monthWallMs: number|null, monthWallAtLeast: boolean, totalWallMs: number|null, totalWallAtLeast: boolean}> }}
 */
export function spendSummary(opts = {}) {
  const nowDate = new Date((opts.now ?? Date.now)());
  const total = { usd: 0, atLeast: false, tokens: 0 };
  const month = { usd: 0, atLeast: false, tokens: 0 };
  /** @type {Record<string, {label: string, monthUsd: number, monthAtLeast: boolean, totalUsd: number, totalAtLeast: boolean, tokens: number, vouchedRounds: number, otherRounds: number, monthWallMs: number|null, monthWallAtLeast: boolean, totalWallMs: number|null, totalWallAtLeast: boolean}>} */
  const byProvider = {};
  /** runs per provider in each scope, and how many had a known wall — unknown is never 0
   * @type {Record<string, {monthRuns: number, monthKnown: number, totalKnown: number}>} */
  const wallSeen = {};
  /** total tokens of the runs each Providers row served (matched by shape + endpoint + model) @type {Record<string, number>} */
  const tokensByRow = {};
  for (const leg of readLegs({ home: opts.home })) {
    let served = opts.rows ? findRow(opts.rows, { provider: leg.provider, baseUrl: leg.baseUrl, model: leg.model }) : null;
    // an older spine records a model but no provider: it counts toward the row whose Name EXACTLY
    // equals that model. Two rows sharing the Name make it ambiguous, so it counts toward neither.
    if (opts.rows && leg.provider === null && leg.model !== null) {
      const named = opts.rows.filter((r) => r.name === leg.model);
      served = named.length === 1 ? named[0] : null;
    }
    if (served) tokensByRow[served.envName] = (tokensByRow[served.envName] ?? 0) + leg.tokens;
    const inMonth = Number.isNaN(leg.at.getTime()) ? true : sameLocalMonth(leg.at, nowDate);
    const id = rowIdFor(leg.provider, leg.baseUrl);
    // an older spine carries a model but no provider: say so honestly, one row per model —
    // never a provider guessed from the model's name
    const notRecorded = id === null && leg.provider === null;
    const key = id ?? (notRecorded ? `not-recorded:${leg.model ?? ''}` : `other:${leg.provider}${leg.baseUrl ? ` @ ${leg.baseUrl}` : ''}`);
    const label = id ? (MONEY_LABELS.find((r) => r.id === id)?.name ?? id)
      : (notRecorded ? (leg.model ? `not recorded (model ${leg.model})` : 'not recorded') : key.slice('other:'.length));
    const p = (byProvider[key] ??= { label, monthUsd: 0, monthAtLeast: false, totalUsd: 0, totalAtLeast: false, tokens: 0, vouchedRounds: 0, otherRounds: 0, monthWallMs: 0, monthWallAtLeast: false, totalWallMs: 0, totalWallAtLeast: false });
    const w = (wallSeen[key] ??= { monthRuns: 0, monthKnown: 0, totalKnown: 0 });
    const unknown = leg.unreadable || !leg.complete;
    const wallKnown = !leg.unreadable && leg.wallMs !== null;
    const wallAtLeast = !wallKnown || !leg.wallComplete;
    total.usd += leg.usd; total.tokens += leg.tokens; if (unknown) total.atLeast = true;
    p.totalUsd += leg.usd; p.tokens += leg.tokens; p.vouchedRounds += leg.vouchedRounds; p.otherRounds += leg.otherRounds; if (unknown) p.totalAtLeast = true;
    if (wallKnown) { p.totalWallMs = /** @type {number} */ (p.totalWallMs) + /** @type {number} */ (leg.wallMs); w.totalKnown += 1; }
    if (wallAtLeast) p.totalWallAtLeast = true;
    if (inMonth) {
      month.usd += leg.usd; month.tokens += leg.tokens; if (unknown) month.atLeast = true;
      p.monthUsd += leg.usd; if (unknown) p.monthAtLeast = true;
      w.monthRuns += 1;
      if (wallKnown) { p.monthWallMs = /** @type {number} */ (p.monthWallMs) + /** @type {number} */ (leg.wallMs); w.monthKnown += 1; }
      if (wallAtLeast) p.monthWallAtLeast = true;
    }
  }
  // runs in scope but not one with a known wall = unknown (null), never a clean 0
  for (const [key, p] of Object.entries(byProvider)) {
    const w = wallSeen[key];
    if (w.totalKnown === 0) p.totalWallMs = null;
    if (w.monthRuns > 0 && w.monthKnown === 0) p.monthWallMs = null;
  }
  return { tokensByRow, total, month, byProvider };
}

/**
 * @typedef {object} MonthlyRoom
 * @property {boolean} ok
 * @property {number|null} leftUsd what is left this month (null = no limit set)
 * @property {number|null} limitUsd the person's monthly limit (null = none)
 * @property {boolean} atLeast the month's spend is a floor, so `leftUsd` is a ceiling
 */

/**
 * The person's monthly limit off a parsed config.json: key absent (or null) = no limit (null);
 * a number above 0 = the limit; ANY other value present is a broken setting and throws
 * `ConfigError` — a limit the file names but this code cannot read never reads as "no limit".
 * @param {Record<string, any>} config
 * @param {string} [home]
 * @returns {number|null}
 */
export function monthlyLimitOf(config, home) {
  const limit = config.monthlyLimitUsd;
  if (limit === undefined || limit === null) return null;
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) return limit;
  const shown = typeof limit === 'number' ? String(limit) : JSON.stringify(limit);
  throw new ConfigError(`${configPath(home)} has monthlyLimitUsd = ${shown}, which is not a number above 0 — fix it or remove the line`);
}

/**
 * Does a run with this $ cap fit in what is left this month (a run still held counts at its full cap)? No limit set (key absent or null) = ok, no check; a limit that is present but not a
 * number above 0 throws `ConfigError`.
 * Compared in whole cents. Also throws `ConfigError` when config.json is unreadable — a gate
 * whose own instrument is broken refuses; it never silently runs with no limit.
 * @param {{ capUsd: number, home?: string, now?: () => number, aboveRunid?: string }} args `aboveRunid`: count only the claims listed above that run (a claim in progress)
 * @returns {MonthlyRoom}
 */
export function checkMonthlyRoom({ capUsd, home, now, aboveRunid }) {
  const cfg = readConfig({ home });
  if (cfg.problem) throw new ConfigError(cfg.problem);
  const limit = monthlyLimitOf(cfg.config, home);
  if (limit === null) {
    return { ok: true, leftUsd: null, limitUsd: null, atLeast: false };
  }
  const spent = monthSpend({ home, now, aboveRunid });
  const leftCents = Math.max(0, Math.floor((limit - spent.reservedUsd) * 100 + 1e-6));
  const capCents = Math.ceil(capUsd * 100 - 1e-6); // a non-finite cap never fits (NaN/Infinity compare false) — never read as $0
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

/**
 * Close every claim ABOVE `aboveRunid` (file order) whose process is gone: a pid-bearing run row with no
 * `settled` entry whose pid is not a live bareloop runner gets `{ type: 'settled', by: <closer>, reason:
 * 'process gone', spentUsd: <its spine's floor>, spendComplete: false }` appended — so every claim gets a
 * write-back, attributed. Two runs may both close the same dead claim; readers take the FIRST note.
 * @param {{ home?: string, by: string, aboveRunid?: string }} args `by` = the run doing the closing
 * @returns {number} how many notes were appended
 */
export function settleDeadClaims({ home, by, aboveRunid }) {
  const { rows, events } = readRunList({ home });
  const settled = new Set(events.filter((e) => e.type === 'settled').map((e) => e.runid));
  let n = 0;
  for (const row of rowsAbove(rows, aboveRunid)) {
    if (!Number.isInteger(row.pid) || settled.has(row.runid) || isLiveRunner(/** @type {number} */ (row.pid))) continue;
    let spentUsd = 0;
    try { spentUsd = legSpend(parseJsonl(row.spine).records).usd; } catch { /* no spine: nothing was recorded spent */ }
    appendRunEvent({ runid: row.runid, type: 'settled', by, reason: 'process gone', spentUsd, spendComplete: false, at: new Date().toISOString() }, { home });
    n += 1;
  }
  return n;
}

/**
 * The CLAIM (hamr 2026-09-30: whoever runs first claims the limit and holds it; no lock file, records
 * only): the run APPENDS its row first (`row` carries its `pid` and `capUsd`), then reads the run list.
 * Only the claims ABOVE its own row count — a live one is held at its cap (a dead one is closed with an
 * attributed note and counts its real spend); rows below yield to it. If `capUsd` fits, it runs; if not
 * it appends `{type:'released', reason:'refused'}` and reports the refusal, nothing spent. No limit set =
 * no claim (`claimed: false`; the caller lists the run as it always did). An unreadable config, or a row
 * that cannot be written, throws `ConfigError` — the gate refuses, never reads "no limit".
 * @param {{ row: import('./runlist.js').RunRow, capUsd: number, home?: string, now?: () => number }} args
 * @returns {{ room: MonthlyRoom, claimed: boolean }}
 */
export function claimRun({ row, capUsd, home, now }) {
  const cfg = readConfig({ home });
  if (cfg.problem) throw new ConfigError(cfg.problem);
  if (monthlyLimitOf(cfg.config, home) === null) return { room: { ok: true, leftUsd: null, limitUsd: null, atLeast: false }, claimed: false };
  try { appendRun(row, { home }); } catch (/** @type {any} */ e) {
    throw new ConfigError(`cannot write this run's claim to the run list (${e.message})`);
  }
  settleDeadClaims({ home, by: row.runid, aboveRunid: row.runid });
  const room = checkMonthlyRoom({ capUsd, home, now, aboveRunid: row.runid });
  if (!room.ok) {
    try { appendRunEvent({ runid: row.runid, type: 'released', by: row.runid, reason: 'refused', at: new Date().toISOString() }, { home }); } catch { /* the refusal stands; a stranded row of a dead process is closed by the next run */ }
    return { room, claimed: false };
  }
  return { room, claimed: true };
}
