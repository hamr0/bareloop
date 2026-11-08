// borrowed-from: fwdloop src/panel/jobgrid.js@v0.29.0 (adapted: bareloop's status table decides every bucket, `panelMoney2` is the one money spelling, the wall is the run list's own wording, and the
// cells are the mockup's: steps done, the close's checks, cost, time). ITEM33-BUILD piece 10 (R8): the Result tab's ONE grid for a ticket job.
// Pure of the panel: `getJobGrid` (src/panel/server.js) reads the run list and the spines and hands plain entries in. Nothing is written.
import { GROUP_OF, TICKET_GROUPS } from './tickets.js';
import { panelMoney2 } from '../panelmoney.js';

/** the buckets, in the mockup's order */
export const GRID_BUCKETS = TICKET_GROUPS;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * ONE decider of a run's bucket: its status key through {@link GROUP_OF}; a run waiting at its review door (the run list's own `needs: 'Accept'`) needs the person, whatever its status.
 * Anything the table does not know reads as Stopped.
 * @param {string|null|undefined} statusKey @param {'Accept'|'Resume'|null|undefined} needs @returns {'wait'|'stop'|'done'|'skip'}
 */
export function bucketOf(statusKey, needs) {
  if (needs === 'Accept') return 'wait';
  return /** @type {any} */ (GROUP_OF[/** @type {keyof typeof GROUP_OF} */ (statusKey ?? '')] ?? 'stop');
}

/**
 * A money figure in the panel's one spelling: `at least $0.08` when only a floor is known, `unknown` when nothing is (never `$0.00` for unknown).
 * @param {number|null} usd @param {boolean} complete
 */
export function moneyWords(usd, complete) {
  if (usd === null) return 'unknown';
  return `${complete ? '' : 'at least '}${panelMoney2(usd)}`;
}

/**
 * The stats line's money: the sum of the rows' money; a floor when any row's figure is a floor or unknown; `usd: null` = nothing is known.
 * @param {Array<{usd: number|null, complete: boolean}>} moneys
 */
export function sumMoney(moneys) {
  const known = moneys.filter((m) => m.usd !== null);
  return { usd: known.length === 0 ? null : known.reduce((a, m) => a + (m.usd ?? 0), 0), complete: moneys.every((m) => m.usd !== null && m.complete) };
}

/**
 * One run's money: the run list's own figure (complete unless it says the figure is a floor), else the live/died floor, else unknown.
 * @param {{spentUsd?: unknown, spendComplete?: unknown, spendFloorUsd?: unknown}} e
 */
export function entryMoney(e) {
  if (isNum(e.spentUsd)) return { usd: /** @type {number} */ (e.spentUsd), complete: e.spendComplete !== false };
  if (isNum(e.spendFloorUsd)) return { usd: /** @type {number} */ (e.spendFloorUsd), complete: false };
  return { usd: null, complete: false };
}

/**
 * The grid of one ticket job: every run a row in its bucket, newest first inside each bucket, and the stats line's numbers.
 * @param {{entries: Array<{runId: string, runNo?: number|null, at: number|null, statusKey: string, sign: string, word: string, needs: 'Accept'|'Resume'|null, number: number|null, title: string|null, url: string|null,
 *   steps: {done: number, total: number}|null, checks: {passed: number, total: number}|null, spentUsd: number|null, spendComplete: boolean, spendFloorUsd: number|null, wall: string|null, reason: string|null}>,
 *   scheduleLine?: string|null}} a
 */
export function buildJobGrid({ entries, scheduleLine = null }) {
  const rows = entries.map((e) => {
    const bucket = bucketOf(e.statusKey, e.needs);
    const ended = e.statusKey !== 'running' && e.statusKey !== 'waiting';
    const money = entryMoney(e);
    const skip = bucket === 'skip';
    /** @type {{mark: 'g'|'r'|'q'|'n', text: string}} */
    const steps = skip || e.steps === null ? { mark: skip ? 'n' : (ended ? 'q' : 'n'), text: '' }
      : { mark: e.steps.done === e.steps.total ? 'g' : (ended ? 'r' : 'n'), text: `${e.steps.done} of ${e.steps.total}` };
    /** @type {{mark: 'g'|'r'|'q'|'n', text: string}} */
    const checks = skip || e.checks === null ? { mark: skip ? 'n' : (ended ? 'q' : 'n'), text: '' }
      : (e.checks.passed === e.checks.total ? { mark: 'g', text: `${e.checks.passed} of ${e.checks.total}` } : { mark: 'r', text: `${e.checks.total - e.checks.passed} red` });
    const walled = e.wall !== null && e.wall !== '' && e.wall !== 'unknown';
    return {
      runId: e.runId, runNo: e.runNo ?? null, number: e.number, title: e.title, url: e.url,
      name: e.number !== null ? `#${e.number}` : e.runId, bucket, status: { key: e.statusKey, sign: e.sign, word: e.word }, needs: e.needs, at: e.at,
      steps, checks,
      cost: { mark: money.usd !== null && money.complete ? 'g' : 'q', text: moneyWords(money.usd, money.complete) },
      time: { mark: skip ? 'n' : (walled ? 'g' : 'q'), text: skip ? '' : (walled ? /** @type {string} */ (e.wall) : 'unknown') },
      reason: e.reason,
      money,
    };
  });
  // "Run it anyway" is offered on a skipped row only while no later run read that ticket: a ticket that ran since is not skipped any more
  const newestAt = new Map();
  for (const r of rows) if (r.number !== null) newestAt.set(r.number, Math.max(newestAt.get(r.number) ?? -Infinity, r.at ?? -Infinity));
  const order = (/** @type {any} */ a, /** @type {any} */ b) => ((b.at ?? -Infinity) - (a.at ?? -Infinity)) || (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0);
  const groups = GRID_BUCKETS.map((g) => ({
    ...g,
    rows: rows.filter((r) => r.bucket === g.key).sort(order).map(({ money, ...row }) => ({
      ...row, anyway: g.key === 'skip' && row.number !== null && (row.at ?? -Infinity) >= (newestAt.get(row.number) ?? -Infinity),
    })),
  }));
  const total = sumMoney(rows.map((r) => r.money));
  return {
    groups,
    scheduleLine,
    stats: {
      counts: Object.fromEntries(groups.map((g) => [g.key, g.rows.length])),
      spent: moneyWords(total.usd, total.complete), spentUsd: total.usd, spentComplete: total.complete,
    },
  };
}
