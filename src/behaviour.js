// The run behaviour summary (PRD build-list §2, agreed 2026-08-23): ONE
// report-only text block computed entirely from a run's gate-audit JSONL.
// It gates NOTHING, mints no verdict, writes NOTHING to the spine — a pure
// read of records that already exist. "We can see what a run cost, never
// what it wasted" is the gap this closes; item 4's five-minute-replay test
// gets this as its cheap first slice.
//
// Gate-audit rows this reads (observed shape, this repo's real archive):
//   {ts, seq, run_id, phase, action: {type, path?, args?}, decision, ...}
// `action.type` is one of `llm` (a provider round, NOT a tool call — always
// excluded), `read`, `edit`, `ctx_remember`. `action.args.tool` names the
// concrete tool for read-shaped actions (`shell_read`, `shell_grep`,
// `ctx_recall`, `ctx_get`, `ctx_recent`, `ctx_impact`, `ctx_related`);
// edit/ctx_remember rows carry no `args.tool`. `decision` is `allow` for a
// gated tool call, `null` for an llm row, or `deny`.

/**
 * Stable JSON — keys sorted at every level — so two calls with the same
 * arguments in a different insertion order (or a different property visit
 * order out of JSON.parse) hash to the same string. Used only to build the
 * exact-repeat key below; it is not a general-purpose canonicalizer.
 * @param {any} v
 * @returns {string}
 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/**
 * The exact-repeat key for one tool-call action: `type` + `path` + a stable
 * serialization of the WHOLE `args` object.
 *
 * Load-bearing, and deliberately not `{type, path}`: this repo's own history
 * is a blind-instrument catalogue of collapsed keys reading two DIFFERENT
 * things as the same thing (a ledger that summed input+output with no cache
 * tiers, a gate audit that collapsed reads to `{type,path}`, `git status` as
 * "did it write?"). If the gate ever starts recording byte ranges or offsets
 * in `args`, two different slices of the same file must NOT count as a
 * repeat — dropping `args` from the key would silently manufacture that
 * exact confound here. This detector is exactly as sharp as what the gate
 * records, no sharper: a tool that reads the same bytes through two
 * differently-shaped argument objects will not be caught, and that is an
 * honest limit, not a bug.
 * @param {{type?: string, path?: string, args?: any}} action
 * @returns {string}
 */
function repeatKey(action) {
  return `${action?.type ?? ''} ${action?.path ?? ''} ${stableStringify(action?.args ?? null)}`;
}

/**
 * The display label for one tool-call breakdown row. Kept SEPARATE from the
 * counting key (`args.tool || action.type`, computed inline in
 * {@link runBehaviour}): the summary object stores the raw tool name so a
 * consumer can trace a count back to its source, and only {@link
 * formatBehaviour} shortens it for the printed line — the agreed shape reads
 * "read"/"grep"/"recall", not "shell_read"/"shell_grep"/"ctx_recall".
 * @param {string} key
 * @returns {string}
 */
function displayLabel(key) {
  return key.replace(/^shell_/, '').replace(/^ctx_/, '');
}

/**
 * Summarize what a run DID with its tools, from its gate-audit records
 * alone. Pure and read-only: no IO, no spine writes, no verdict.
 *
 * Counting rules:
 *   - `llm` rows are provider rounds, never tool calls — always excluded.
 *   - a tool call counts toward `totalCalls`/`byTool`/`uniquePaths`/repeats
 *     only when `decision === 'allow'`; a `deny` is tallied separately in
 *     `denied` and touches nothing else (denied ≠ done).
 *   - `byTool` is keyed by `action.args.tool` when present, else
 *     `action.type` (an edit or ctx_remember has no `args.tool`).
 *   - exact repeats: see {@link repeatKey}. A first occurrence of an action
 *     is not itself a "repeat" — only the 2nd, 3rd, ... occurrences count,
 *     so `repeats` can never exceed `totalCalls - byTool-group-count`.
 * @param {Array<{run_id?: string, action?: {type?: string, path?: string, args?: any}, decision?: string|null}>} events
 * @param {{runId?: string}} [opts]
 * @returns {{totalCalls: number, byTool: Record<string, number>, denied: number,
 *   uniquePaths: number, repeats: number, repeatPct: number|null}}
 */
export function runBehaviour(events, { runId } = {}) {
  const list = Array.isArray(events) ? events : [];
  const scoped = runId === undefined ? list : list.filter((e) => e?.run_id === runId);

  const byTool = /** @type {Record<string, number>} */ ({});
  const paths = new Set();
  const keyCounts = new Map();
  let totalCalls = 0;
  let denied = 0;

  for (const e of scoped) {
    const action = e?.action ?? {};
    if (action.type === 'llm') continue; // a provider round, never a tool call
    if (e?.decision === 'deny') { denied += 1; continue; }
    if (e?.decision !== 'allow') continue; // neither allow nor deny: not a counted call

    totalCalls += 1;
    const tool = action.args?.tool ?? action.type ?? 'unknown';
    byTool[tool] = (byTool[tool] ?? 0) + 1;
    if (action.path) paths.add(action.path);

    const k = repeatKey(action);
    keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }

  let repeats = 0;
  for (const count of keyCounts.values()) if (count > 1) repeats += count - 1;

  return {
    totalCalls,
    byTool,
    denied,
    uniquePaths: paths.size,
    repeats,
    repeatPct: totalCalls > 0 ? Math.round((repeats / totalCalls) * 100) : null,
  };
}

/**
 * Render a {@link runBehaviour} summary as the agreed printable block
 * (2–4 short lines). A zero-call run formats plainly ("0 tool calls") rather
 * than a NaN-laced percentage — an empty run is a complete, reportable
 * answer, not a division error.
 * @param {ReturnType<typeof runBehaviour>} summary
 * @returns {string}
 */
export function formatBehaviour(summary) {
  const { totalCalls, byTool, denied, repeats, repeatPct } = summary; // uniquePaths: data-only, not in the agreed printed shape
  const lines = [];

  if (totalCalls === 0) {
    lines.push('0 tool calls');
  } else {
    const breakdown = Object.entries(byTool)
      .sort((a, b) => b[1] - a[1])
      .map(([tool, n]) => `${n} ${displayLabel(tool)}`)
      .join(', ');
    lines.push(`${totalCalls} tool call${totalCalls === 1 ? '' : 's'} · ${breakdown}`);
    lines.push(`${repeats} exact repeat${repeats === 1 ? '' : 's'} (~${repeatPct}%)`);
  }
  if (denied > 0) lines.push(`${denied} denied`);

  return lines.join('\n');
}
