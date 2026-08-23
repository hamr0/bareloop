// Layer 3 — D3's DISPLAY half: the workflow LISTING, and the prompt that asks for a
// pick (design record docs/product/2026-08-01-layer-3-reuse-design.md, D3).
//
// hamr's ruling, verbatim: *"i think there should be a listing for workflows names that
// user can choose or auto-choose, or do we want llm to always decide (we still need to
// keep a way for user to inspect and view existing workflows … but llm can override and
// say none matches the ask and that agent has to create a new one)"*.
//
// **Both functions are pure text.** Nothing here reads a file, calls a model, or decides
// a run: the selection CALL, the operator's pin/shortlist/force-cold flow, and the parse
// of the answer are the runner's (modules 4/5). Choosing is not authoring — the user
// picks among workflows the agent authored and greens minted, and never writes a step, a
// check or a plan (PRD v1.28, unbroken).
//
// Two display rules are load-bearing rather than cosmetic:
//
//  - **F6 — unpriced is never free.** An unknown cost or duration renders as UNKNOWN, and
//    a band that skipped unknowns says how many it skipped. A `$0.00` where nothing was
//    priced is a floor that reads as exact, which is the dishonesty F6 exists to stop; the
//    same discipline extends to time.
//  - **A listing shorter than its directory must say so.** `loadRegistry` skips-and-reports
//    a malformed entry; a listing that quietly shows the survivors would leave the picker
//    choosing from a set nobody told it was incomplete — the blind-instrument class.
//
// There is deliberately NO score and no ranking beyond name order (D6): n=1 is an anecdote
// in either direction, a percentage over 2–3 runs is fake precision, and if a score ever
// earns its way in its threshold is hamr's, from a measured base rate.

import { listingRow, QUARANTINED_CODE } from './bridges.js';

/** minutes, one decimal — the granularity a human picks a workflow at (the unit is
 * written once, by the band) */
const minutes = (/** @type {number} */ ms) => (ms / 60_000).toFixed(1);
const usd = (/** @type {number} */ n) => `$${n.toFixed(2)}`;

/**
 * One aggregate, rendered honestly (F6). `min`/`max` are null when NOTHING in the set was
 * known — the answer is UNKNOWN, never a zero — and a partial set carries the count it
 * could not read.
 * @param {number|null} min @param {number|null} max
 * @param {(n: number) => string} fmt
 * @param {number} unknown how many of the greens carried no figure
 * @param {number} total how many greens there are
 * @param {string} word the honest name for a missing figure ('unpriced' | 'untimed')
 * @param {string} [suffix] the unit, written ONCE after the range ("8.9–31.6 min", never
 *   "8.9 min–31.6 min")
 */
function band(min, max, fmt, unknown, total, word, suffix = '') {
  if (min === null || max === null) return `UNKNOWN (${total || 'no'} green${total === 1 ? '' : 's'}, none ${word === 'unpriced' ? 'priced' : 'timed'})`;
  const core = `${min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`}${suffix}`;
  return unknown > 0 ? `${core} (${unknown} of ${total} ${word})` : core;
}

/**
 * D3's listing: what the operator inspects and what the selecting model reads — the SAME
 * text, so the two can never be choosing from different sets.
 *
 * Per bridge, one compact block: name, the job sentence it greened, status, greens/reds
 * with the last outcome, and the cost/time band of its greens.
 *
 * Total and never throws: a listing is a display surface, and one malformed entry must
 * not take the whole listing down (`listingRow` holds the same contract). Deterministic
 * by name, whatever order the entries arrived in — a set that reshuffles between calls
 * would make one picker's answer unreadable against another's.
 *
 * @param {unknown} registry `loadRegistry`'s result (`{ok, reds, bridges}`) or a bare
 *   array of entries. The RESULT form is preferred: it carries the skip reds, and the
 *   skips are the half a bare array cannot tell you about.
 * @returns {string}
 */
export function renderListing(registry) {
  const r = /** @type {any} */ (registry);
  const bridges = (Array.isArray(r) ? r : (Array.isArray(r?.bridges) ? r.bridges : [])).filter((b) => b && typeof b === 'object');
  const reds = Array.isArray(r?.reds) ? r.reds : [];
  const rows = bridges.map(listingRow).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // TWO KINDS OF SKIP, and they are never written as one. An unreadable entry is a
  // broken file; a HELD one (softgreen module 6) is a perfectly good workflow whose
  // judged green no signer has accepted yet. Saying "could not be read" about the
  // second would send the operator to fix a file that is not broken.
  const broken = reds.filter((/** @type {any} */ x) => x?.code !== QUARANTINED_CODE);
  const held = reds.filter((/** @type {any} */ x) => x?.code === QUARANTINED_CODE);
  const skipped = [
    broken.length
      ? [`\n\nNOTE: ${broken.length} registry entr${broken.length === 1 ? 'y' : 'ies'} could not be read and ${broken.length === 1 ? 'is' : 'are'} NOT listed — this listing is smaller than the directory:`,
        ...broken.map((/** @type {any} */ x) => `  ${x.path ?? '(unknown file)'}${x.detail ? ` — ${x.detail}` : ''}`)].join('\n')
      : '',
    held.length
      ? [`\n\nNOTE: ${held.length} workflow${held.length === 1 ? ' is' : 's are'} HELD and NOT offered — a judged green earns no reuse until the person who owns the job accepts it:`,
        ...held.map((/** @type {any} */ x) => `  ${x.path ?? '(unnamed)'}${x.detail ? ` — ${x.detail}` : ''}`)].join('\n')
      : '',
  ].join('');

  if (!rows.length) {
    return `WORKFLOWS ON RECORD — none.\nThere are no workflows to reuse; a plan has to be drafted from scratch.${skipped}`;
  }

  const blocks = rows.map((row) => {
    const g = row.greenCost;
    return [
      // an entry whose only greens are HELD has no status — but "NO-GREEN" would be
      // false about it: it greened, and a person has simply not accepted the judged
      // verdict yet. The distinct word is the whole difference between "this never
      // worked" and "this is waiting on you".
      `[${row.name ?? '(unnamed)'}]  ${(row.status ?? (row.quarantinedGreens > 0 ? 'held' : 'no-green')).toUpperCase()}`,
      `  goal   ${row.goal ?? '(no goal recorded)'}`,
      `  runs   ${row.greens} green · ${row.reds} red${row.lastOutcome ? `  (last: ${row.lastOutcome})` : ''}`,
      `  green  cost ${band(g.minUsd, g.maxUsd, usd, g.unpricedCount, row.greens, 'unpriced')}`
        + ` · time ${band(g.minWallMs, g.maxWallMs, minutes, g.untimedCount, row.greens, 'untimed', ' min')}`,
    ].join('\n');
  });

  return `WORKFLOWS ON RECORD — ${rows.length}\nCANDIDATE = greened once · PROVEN = greened on two distinct repositories. There is deliberately no success score.\n\n${blocks.join('\n\n')}${skipped}`;
}

/**
 * The SELECT-WORKFLOW prompt: the text a later module sends to ask which workflow (if
 * any) the run should start from. Pure — it sends nothing and parses nothing.
 *
 * D3's two standing rules are IN the prompt rather than enforced after the fact:
 *  - *"none matches"* is a first-class answer, and it means the agent drafts new. A picker
 *    with no way to decline would return the closest thing on the shelf every time, which
 *    is how a registry becomes a lookup table.
 *  - a PINNED workflow may be refused **only explicitly, with a reason** — never silently
 *    ignored or quietly substituted. The operator's pick is the operator's; overriding it
 *    invisibly is the one thing a picker must not be able to do.
 *
 * The output contract is stated so the answer is machine-readable, but the PARSE belongs
 * to the runner that sends this (modules 4/5) — and the runner's parser and this shape are
 * one contract in two places, which is why the shape is spelled out here rather than left
 * to the model.
 *
 * @param {string} listing `renderListing`'s text — verbatim, so the picker sees exactly
 *   what the human inspecting the registry sees
 * @param {string} ask the job's goal sentence, in the operator's own words
 * @param {string|null} [pinned] the operator's PIN, stated IN the call. D3 rules that a
 *   pin is never bypassed and never silently overridden — so the pin does not skip the
 *   call, it enters it, and the model's only legal ways out are confirming it or
 *   refusing it by name with a reason. Stated here rather than assembled by the runner:
 *   a second spelling of the pin sentence is a second prompt, and the two would drift.
 * @returns {string}
 */
export function selectionPrompt(listing, ask, pinned = null) {
  const pin = pinned
    ? `\nThe operator has PINNED the workflow "${pinned}". Start from it unless it is genuinely the
wrong kind of recipe for this ask. If you cannot use it, you must say so by picking a
DIFFERENT name (or null) and giving the reason — the operator's pick is then handed back
to the operator, never quietly replaced by yours.\n`
    : '';
  return `SELECT-WORKFLOW
A previous run's workflow can be handed to the planner as a STARTING DRAFT for a new job —
it saves the planner starting from a blank page. Your job is to decide whether any workflow
on record is close enough to be worth starting from, or whether this ask needs a new plan.

The ask:
${ask}

${listing}
${pin}
Rules:
- Pick AT MOST ONE workflow, by its exact name, copied character for character from the listing.
- A workflow is worth reusing when it did the same KIND of work — the same sort of change,
  judged the same sort of way. It does NOT have to name the same files: it ran on a different
  repository, so its paths, scopes and targets are expected to be wrong here and the planner
  will replace them.
- If none of them matches this ask, say so plainly and pick nothing.
  The agent then drafts a new plan from scratch. "None matches" is a real answer, and a bad
  starting draft costs more than a blank page.
- If the operator PINNED a workflow, you may refuse it — but only EXPLICITLY, and with a
  reason. Never silently ignore the pin or quietly substitute another one.
- You are choosing, not authoring. You cannot edit, merge or invent a workflow here; the
  planner does the tweaking afterwards, and the job's own verification is the only truth.

Output ONLY this JSON object, no fences and no commentary:
{"choice": "<exact name from the listing>" or null, "reason": "<one sentence>"}`;
}
