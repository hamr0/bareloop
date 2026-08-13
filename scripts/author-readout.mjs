// The authoring runner's SIGNING readout — the goal, and the stages that will
// judge it — in the one place a test can reach it.
//
// `run-author.mjs` is a script: importing it runs it, and the block this replaces
// is only reached after a real scout and a real model call. So the lines a person
// actually signs against live here instead, and the runner calls them — the same
// reason `u-readout.mjs` exists.
//
// F87 is the whole point of the pairing. The goal must state everything the close
// will judge, and NOTHING derives one from the other or checks them against each
// other; an unstated stage is a cost the run discovers at its tail. The only
// defence is that the person signing reads both halves at once — and neither
// signing surface offered that: this one printed the declaration and never the
// goal, run-u's --approve gate printed the goal and never the declaration.
// A half of a reading is not a smaller reading; it is a different one.

/**
 * @param {{goal?: string|null, closeDecl?: any}} spec the RESOLVED spec — the bytes
 *   that get hashed and signed, never the operator's draft and never the authored
 *   half on its own.
 * @returns {string[]} one console line each, in print order.
 */
export function declarationLines({ goal, closeDecl }) {
  // An absent goal reads as ABSENT. A bare `goal` label with nothing after it is
  // indistinguishable from a goal that says nothing, and this readout exists to
  // make exactly that kind of silence visible.
  const lines = [`goal       ${goal === undefined || goal === null || goal === '' ? '(none — the draft carried no goal, and a close judges against one)' : JSON.stringify(goal)}`];
  lines.push('declaration');
  for (const s of closeDecl?.stages ?? []) {
    lines.push(`  ${s.name}  [${s.kind}]${s.offer === false ? '  (not lendable)' : ''}${(s.needs ?? []).length ? `  needs: ${s.needs.join(', ')}` : ''}`);
    lines.push(`      params ${JSON.stringify(s.params ?? {})}`);
  }
  for (const n of closeDecl?.notes ?? []) lines.push(`  note: ${n}`);
  return lines;
}

/**
 * THE AUTHORING CEILING, parsed from `--budget`. Housed here for the same reason
 * the readout above is: the runner is a script, and a rule no test can reach is a
 * rule nothing checks.
 *
 * ABSENT IS UNBOUNDED, and that is the only way to get there. A malformed value
 * is an ERROR rather than a fallback: `--budget banana` silently collapsing to
 * "no ceiling" is precisely the failure this flag exists to prevent, wearing the
 * operator's own typo. Zero and negatives are rejected on the same rule — a
 * ceiling that can fund nothing is a typo for "unbounded" far more often than it
 * is a request, and the honest way to ask for nothing is not to ask.
 *
 * There is NO DEFAULT anywhere in this function, deliberately: a defaulted cap is
 * a silent second ceiling (the `maxWallMs` precedent), and the number is the
 * operator's to set or to decline.
 * @param {string|null} raw the argv value, or null when the flag was not given
 * @returns {{ceilingUsd: number|null, error: string|null}}
 */
export function parseCeiling(raw) {
  if (raw === null) return { ceilingUsd: null, error: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      ceilingUsd: null,
      error: `--budget ${raw} is not a positive number of dollars — omit the flag entirely to run UNBOUNDED, which is `
        + 'stated on stdout; there is no way to ask for a ceiling and get none by accident',
    };
  }
  return { ceilingUsd: n, error: null };
}

/**
 * The ceiling's header line. An UNBOUNDED run is ANNOUNCED — printed before the
 * provider is built, so it reaches stdout ahead of the first paid byte rather
 * than being inferred from the total afterwards. An unbounded run is legal; it is
 * never allowed to be an accident.
 * @param {number|null} ceilingUsd
 */
export function ceilingLine(ceilingUsd) {
  return ceilingUsd === null
    ? 'budget   UNBOUNDED — no --budget was given, so nothing stops this pipeline spending; spend is reported, never capped'
    : `budget   $${ceilingUsd} ceiling — the pipeline stops BETWEEN metered calls once the spend reaches it`;
}
