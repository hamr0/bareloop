// The read-shim Phase 2 battery's ARITHMETIC and READERS — everything the driver
// decides with, extracted so it is reachable by a test.
//
// `scripts/run-battery-readshim.mjs` is the executable half: it spawns rows, waits on
// spines and prints. This half holds the parts that can be WRONG SILENTLY — the arm
// map, the run order, the ceiling gate, the spend reader, the tool-share reader and
// the arm statistics. This programme's recurring defect is an instrument that reads a
// number nobody can falsify (F45 and its five relatives), so the rule here is: every
// number the readout prints comes from a function in this file, and every function in
// this file is tested against REAL archived spines, never a fixture that was authored
// to contain the answer.
//
// Nothing here spends money, opens a socket, or mutates a tree.

/** ARMS — the prereg's four, and the `readShim` value each one IS.
 *
 * `readShimArm` (src/readshim.js) is the resolver and the only thing that says what
 * levers a value carries; this map only says which prereg NAME maps to which value,
 * and the driver asks `readShimArm` for the levers so the battery's idea of an arm can
 * never drift from the library's. */
export const ARMS = Object.freeze([
  Object.freeze({ name: 'A0', flag: false, label: 'shim OFF — byte-identical to today (the baseline)' }),
  Object.freeze({ name: 'A1', flag: 'cap', label: 'cap + pointer + next-unseen-slice + G1' }),
  Object.freeze({ name: 'A2', flag: 'diff', label: 'diff only' }),
  Object.freeze({ name: 'A3', flag: true, label: 'all levers' }),
]);

/** The CLI spelling `run-u.mjs --read-shim` takes. Same four names, so a row's arm is
 * the same word in the plan, on the child's command line, and in the readout. */
export const ARM_CLI = Object.freeze({ A0: 'A0', A1: 'A1', A2: 'A2', A3: 'A3' });

/** Is this filename a RUN's spine, and not one of the sidecars that live beside it?
 *
 * `run-u.mjs` writes `u-<runid>.jsonl` and then hangs three more files off it in the
 * same directory: `u-<runid>-gate-audit.jsonl`, `u-<runid>.jsonl.lag.jsonl` and
 * `u-<runid>.jsonl.watchdog.json`. A naive `/^u-.*\.jsonl$/` matches the LAG file too
 * — caught by the dry run, and it is not cosmetic: the driver detects a row's spine as
 * "the new .jsonl that appeared", so a sidecar matching would make every launch look
 * like two new spines and abort the row it had just paid to start.
 *
 * The runid is `Date.now().toString(36)`, so the whole name is base36 between the
 * prefix and the extension — nothing else this directory holds can satisfy that.
 * @param {string} f a bare filename
 */
export const isSpineFile = (f) => /^u-[0-9a-z]+\.jsonl$/.test(f);

// ── SPEND ACCOUNTING ────────────────────────────────────────────────────────
//
// `src/run.js`'s ledger sums exactly ONE record type — `worker-round` — and its own
// comment says why the attempt-level records are excluded: "worker-result and
// worker-plan are attempt TOTALS of these same rounds — they stay on the spine for
// display and are deliberately NOT accounted." Summing them would double-count a
// whole run. So the accounted set below is the library's, not a second opinion.
//
// The prereg's rule is the OTHER direction: "Any spend record type carrying `costUsd`
// must be accounted, `judge-round` included — a slicing instrument that misses a
// writer is the F45 class." There is no `judge-round` record type in this repo today
// (verified: across every archived spine under bareloop-patients, `worker-round` is
// the only event carrying a top-level `costUsd` at all). A hardcoded allow-list would
// therefore satisfy the rule today and silently fail the day one is added — which is
// precisely the failure the rule names.
//
// So the reader is DATA-DRIVEN and fail-loud: it sums the accounted types, it names the
// echoes it is deliberately skipping, and any OTHER record carrying a non-zero
// `costUsd` is reported as an UNACCOUNTED WRITER — counted into the row's spend (so
// the ceiling can never under-read) and printed by name (so nobody can mistake the
// library's ledger for the whole of the money).
//
// 2026-08-23 — `judge-round` ARRIVED. The comment above predicted it and the tripwire
// below `the accounted/echo sets are the ones src/run.js documents` is what caught it,
// on the rebase onto v0.12.0's softgreen rung: the judged floor buys a pinned locate
// call per artifact, so a close now has spend of its own and `src/run.js:37` accounts
// two types. It is added here rather than left to the unaccounted bucket because it is
// no longer a surprise writer — it is a documented one, and the library's own ledger
// sums it. The fail-loud path stays exactly as it was for the NEXT one.
//
// This list is deliberately a re-spelling rather than an import: this module is pure
// arithmetic reachable by a test, and importing `src/run.js` would drag the runner (and
// litectx) behind it. The tripwire test asserts the two spellings are identical, so a
// divergence is a RED rather than a silent under-read — which is how this very edit was
// found.
export const ACCOUNTED_ROUND_TYPES = Object.freeze(['worker-round', 'judge-round']);
/** attempt-level ECHOES of the accounted rounds. Named explicitly, because "we did not
 * see one" and "we knew to skip it" are different claims. */
export const ECHO_ROUND_TYPES = Object.freeze(['worker-result', 'worker-plan']);

/**
 * Read one run's spine into the numbers the battery needs.
 *
 * @param {any[]} events the spine's parsed records, in order
 * @returns {{
 *   accountedUsd: number, accountedRounds: number, unpricedRounds: number,
 *   echoes: Record<string, number>,
 *   unaccounted: {type: string, count: number, sumUsd: number}[], unaccountedUsd: number,
 *   outcome: string|null, ledgerUsd: number|null, spendComplete: boolean,
 *   spendUsd: number, divergenceUsd: number|null, wallMs: number|null
 * }}
 */
export function readSpend(events) {
  let accountedUsd = 0;
  let accountedRounds = 0;
  let unpricedRounds = 0;
  /** @type {Record<string, number>} */
  const echoes = {};
  /** @type {Map<string, {type: string, count: number, sumUsd: number}>} */
  const unaccounted = new Map();
  /** @type {any} */
  let end = null;
  let firstTs = null;
  let lastTs = null;

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    if (typeof e.ts === 'string') { firstTs ??= e.ts; lastTs = e.ts; }
    if (e.type === 'job-end') end = e;
    const hasCost = Object.prototype.hasOwnProperty.call(e, 'costUsd');
    if (!hasCost) continue;
    const c = e.costUsd;
    if (ACCOUNTED_ROUND_TYPES.includes(e.type)) {
      accountedRounds += 1;
      // F6 — unpriced is never free. A null cost is counted as an UNKNOWN, never as $0.
      if (typeof c === 'number' && Number.isFinite(c)) accountedUsd += c;
      else unpricedRounds += 1;
      continue;
    }
    if (ECHO_ROUND_TYPES.includes(e.type)) { echoes[e.type] = (echoes[e.type] ?? 0) + 1; continue; }
    // anything else carrying money: a writer the library's ledger does not sum
    if (typeof c === 'number' && Number.isFinite(c) && c !== 0) {
      const row = unaccounted.get(e.type) ?? { type: e.type, count: 0, sumUsd: 0 };
      row.count += 1; row.sumUsd += c;
      unaccounted.set(e.type, row);
    }
  }

  const unaccountedUsd = [...unaccounted.values()].reduce((a, r) => a + r.sumUsd, 0);
  const ledgerUsd = typeof end?.spentUsd === 'number' && Number.isFinite(end.spentUsd) ? end.spentUsd : null;
  const observed = accountedUsd + unaccountedUsd;
  // The row's spend is the LARGER of what the library reported and what this reader
  // could see. Two readers of one run must not silently disagree, and where they do
  // the ceiling gets the bigger number — never the flattering one.
  const spendUsd = ledgerUsd === null ? observed : Math.max(ledgerUsd, observed);
  return {
    accountedUsd, accountedRounds, unpricedRounds,
    echoes,
    unaccounted: [...unaccounted.values()], unaccountedUsd,
    outcome: typeof end?.outcome === 'string' ? end.outcome : null,
    ledgerUsd,
    // a run that never emitted job-end has no complete-spend claim to inherit
    spendComplete: end?.spendComplete !== false && end !== null,
    spendUsd,
    divergenceUsd: ledgerUsd === null ? null : Number((observed - ledgerUsd).toFixed(6)),
    wallMs: firstTs && lastTs ? Date.parse(lastTs) - Date.parse(firstTs) : null,
  };
}

// ── THE SECONDARY AXIS: did the steer actually steer ────────────────────────
/** the retrieval pair G1 exists to force onto a capped step */
export const RETRIEVAL_TOOLS = Object.freeze(['ctx_recall', 'ctx_get']);

/**
 * `ctx_recall`/`ctx_get` share of the worker's TOOL calls, off the gate audit — the
 * arbiter's own book, which is the only record of what the worker actually asked for.
 *
 * Denominator: every audited action that is a tool call. `llm` rows are rounds, not
 * tools, and governance rows (`action: null` — a halt, a terminate) are neither; both
 * are excluded, and the excluded counts come back so a shrunken denominator cannot
 * hide. A tool's name is `action.args.tool` where the primitive records one
 * (shell_read, ctx_get, …) and the action type otherwise (write, edit).
 *
 * @param {any[]} rows parsed gate-audit records
 */
export function readToolShare(rows) {
  /** @type {Record<string, number>} */
  const byTool = {};
  let total = 0, llmRows = 0, governanceRows = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const a = r.action;
    if (a === null || a === undefined) { governanceRows += 1; continue; }
    if (a.type === 'llm') { llmRows += 1; continue; }
    const name = (a.args && typeof a.args.tool === 'string' ? a.args.tool : null) ?? (typeof a.type === 'string' ? a.type : 'unknown');
    byTool[name] = (byTool[name] ?? 0) + 1;
    total += 1;
  }
  const retrieval = RETRIEVAL_TOOLS.reduce((s, t) => s + (byTool[t] ?? 0), 0);
  return {
    byTool, total, retrieval, llmRows, governanceRows,
    // an honest null, never 0/0 rendered as 0% (F6 in a percentage coat)
    share: total === 0 ? null : retrieval / total,
  };
}

// ── CASUALTIES ─────────────────────────────────────────────────────────────
//
// "Provider-red rows are casualties, never evidence" (prereg DISCARD rule). The set is
// widened by exactly the failures that are the HARNESS's rather than the worker's: an
// unpriced run cannot be governed, a degraded primitive makes no verdict trustworthy,
// a patient that refused a branch never ran, and a row this driver could not launch or
// could not find a spine for produced nothing to read.
//
// Everything else — green, step-red, close-red, cap-halt, wall-halt, escalated — IS
// evidence. A cap-halt is the worker failing to finish inside its allowance, and under
// the VETO that is exactly the signal the battery exists to protect.
export const CASUALTY_OUTCOMES = Object.freeze([
  'provider-red', 'pricing-red', 'smoke-red', 'branch-red',
]);
/** driver-side casualties: the row never produced a readable run at all */
export const DRIVER_CASUALTIES = Object.freeze([
  'launch-failed', 'no-spine', 'no-job-end', 'driver-timeout', 'ceiling-stop',
]);

/** @param {string|null} outcome */
export function isCasualty(outcome) {
  if (outcome === null) return true; // no job-end is not a result, it is a missing row
  return CASUALTY_OUTCOMES.includes(outcome) || DRIVER_CASUALTIES.includes(outcome);
}

/**
 * Is this plan row FINISHED, for a battery being continued from its results file?
 *
 * A row is finished when it produced a RESULT (a casualty did not), or when it is a
 * casualty that has already spent the one relaunch its class was entitled to.
 *
 * The grant is read off the ROW (`relaunchGranted`), never inferred from the class
 * ledger. The class is added to that ledger at the moment the grant is made, so a
 * "has this class been relaunched?" test reads TRUE for the very row the grant was
 * made FOR — the row would be marked settled, never re-run, and the arm would end at
 * n-1 with nothing saying so. That is the silent-instrument shape, in the one place a
 * battery cannot afford it.
 *
 * @param {{row: number, outcome: string|null, relaunchGranted?: boolean}[]} rows
 * @param {number} n the plan row number
 */
export function rowSettled(rows, n) {
  const mine = rows.filter((r) => r.row === n);
  if (mine.length === 0) return false;
  if (mine.some((r) => !isCasualty(r.outcome))) return true;
  return mine[mine.length - 1].relaunchGranted !== true;
}

// ── THE RUN ORDER ──────────────────────────────────────────────────────────
/**
 * INTERLEAVED, never blocked: A0,A1,A2,A3,A0,A1,… Provider conditions drift over the
 * hours a 12-row battery takes; three A0s in a row would confound that drift with the
 * treatment and there would be no way afterwards to tell which one moved the number.
 *
 * @param {readonly {name: string}[]} arms
 * @param {number} n rows per arm
 * @returns {{row: number, arm: string, cycle: number}[]}
 */
export function rowPlan(arms, n) {
  if (!Number.isInteger(n) || n < 1) throw new TypeError(`rowPlan: n must be a positive integer, got ${JSON.stringify(n)}`);
  /** @type {{row: number, arm: string, cycle: number}[]} */
  const rows = [];
  for (let cycle = 1; cycle <= n; cycle += 1) {
    for (const a of arms) rows.push({ row: rows.length + 1, arm: a.name, cycle });
  }
  return rows;
}

// ── THE CEILING ────────────────────────────────────────────────────────────
/**
 * Checked BEFORE launching each row, on the WORST CASE that row could cost — the
 * signed per-row `budgetUsd`, not an average of what rows have cost so far. An average
 * is a forecast; the budget is the number the run is actually allowed to reach, and a
 * ceiling gate that starts a row it cannot fund has already widened the ceiling.
 *
 * Prior spend folds IN (a battery re-invoked must not get a fresh allowance), and the
 * ceiling is never widened — `ok:false` means STOP and report, not "raise it".
 *
 * @param {{ceilingUsd: number, priorUsd: number, spentUsd: number, rowBudgetUsd: number}} o
 */
export function ceilingGate({ ceilingUsd, priorUsd, spentUsd, rowBudgetUsd }) {
  const committed = priorUsd + spentUsd;
  const projected = committed + rowBudgetUsd;
  return {
    ok: projected <= ceilingUsd,
    committed: Number(committed.toFixed(6)),
    projected: Number(projected.toFixed(6)),
    headroom: Number((ceilingUsd - committed).toFixed(6)),
    ceilingUsd,
  };
}

// ── ARM STATISTICS ─────────────────────────────────────────────────────────
/** the median, spelled once. Even counts average the two middle values. */
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Per-arm statistics. CASUALTIES ARE EXCLUDED FROM EVERY NUMBER and reported as their
 * own count — a casualty is not a zero, not a red, and not an n.
 *
 * @param {{arm: string, outcome: string|null, spendUsd?: number, spendComplete?: boolean, share?: number|null}[]} rows
 * @param {readonly {name: string}[]} arms
 */
export function armStats(rows, arms) {
  return arms.map((a) => {
    const mine = rows.filter((r) => r.arm === a.name);
    const casualties = mine.filter((r) => isCasualty(r.outcome));
    const valid = mine.filter((r) => !isCasualty(r.outcome));
    const greens = valid.filter((r) => r.outcome === 'green');
    const spends = valid.map((r) => r.spendUsd).filter((/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v));
    const shares = valid.map((r) => r.share).filter((/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v));
    return {
      arm: a.name,
      n: valid.length,
      casualties: casualties.length,
      casualtyOutcomes: casualties.map((r) => r.outcome ?? 'no-job-end'),
      greens: greens.length,
      // an honest null on an empty arm — never 0% green, which reads as "tried and failed"
      greenRate: valid.length === 0 ? null : greens.length / valid.length,
      medianUsd: median(spends),
      spends,
      // any floor in the arm makes the arm's median a floor too (F6 travels)
      spendComplete: valid.every((r) => r.spendComplete !== false),
      medianShare: median(shares),
    };
  });
}

// ── THE PRE-REGISTERED UNRESOLVED NOTICE ───────────────────────────────────
//
// Printed VERBATIM and UNCONDITIONALLY by the readout. The prereg declares the A2/A3
// cost comparison unresolvable at n=3 BEFORE any number exists, precisely so that no
// post-hoc story — including a flattering one — can be told about it. An instrument
// that prints this only when the numbers look awkward is an instrument that has
// already picked a side.
export const UNRESOLVED_NOTICE = [
  'DECLARED IN ADVANCE (prereg, 2026-08-18) — A2/A3 COST IS UNRESOLVED AT n=3.',
  'The replay puts L2 diff at 1.4-2.2 points on top of cap+pointer (3-5% standalone).',
  'At n=3, run-to-run spend variance is far larger than 2%, so the A2/A3 cost comparison',
  'CANNOT resolve. Whatever the numbers below show for A2 and A3 on cost — including if',
  'they look favourable — they are NOT evidence of an effect in either direction.',
  'What A2/A3 legitimately answer: does the diff break anything, does it change the',
  "worker's behaviour, does it green. Capability and safety, not cost.",
].join('\n');
