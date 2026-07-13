// The rules extractor — the lineage's inheritance representation. One sealed
// LLM call after a green run distills/updates the lineage's rules list from
// LEDGER FACTS only: the green config, the prior rules, and the revision diff
// if the run recovered mid-run (the diff is the lesson — failure-transition
// evidence, free in the event log). It never sees the close, the tests, or the
// worker's code: rules describe the WORKFLOW, and showing the judge would open
// the config-level fit-to-pass surface (PRD §2).
//
// N3 extends this with the contrast-bit rule (design law #3: verdict admits,
// contrast attributes — the extractor may claim a knob only with ≥1
// ledger-counted contrast bit; adaptlearn F16/F18 showed bare greens lose
// working features). At N0 the extractor is the adaptlearn-proven distiller.
//
// Honesty invariants:
// - One shot, no retry: malformed output is a red as DATA — the caller keeps
//   the lineage's prior rules; there is never a silent empty inheritance.
// - The ≤MAX_RULES/≤MAX_RULE_CHARS bound is stated to the model but ENFORCED
//   mechanically post-call, and enforcement rejects whole — never trims
//   (rejecting a half-applicable output beats silently part-applying it).
// - Extractor spend is carried in costUsd and lands on the run's cost line —
//   a representation whose upkeep rides free corrupts the ranking (design
//   law #4: green gates, cost ranks).

import { createRequire } from 'node:module';

import { extractArtifact, priceOf } from './text.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

export const MAX_RULES = 5;
export const MAX_RULE_CHARS = 200;

/**
 * Distill/update a lineage's rules from one green run's ledger facts.
 * @param {object} opts
 * @param {object} opts.config the config that went green
 * @param {object} opts.provider a bareagent provider — SHELL-owned, sealed
 * @param {string[]|null} opts.priorRules the lineage's current rules, if any
 * @param {string[]} [opts.revisionDiff] changed config paths, when the run recovered mid-run
 * @returns {Promise<{rules: string[]|null, valid: boolean, reds: Array<object>, costUsd: number|null, raw: string}>}
 *   costUsd is null when the spend could not be priced — the explicit-unknown
 *   signal (F6: unpriced is never free); callers must not coerce it to 0
 */
export async function extractRules({ config, provider, priorRules, revisionDiff }) {
  const loop = new Loop({ provider, system: 'You emit exactly one JSON document and nothing else.' });
  const prompt = `An automated coding workflow just completed a run that PASSED its hidden judgement.
You maintain this workflow lineage's inherited rules: short, general lessons about how to
configure the workflow for this task family. You never see the tasks' tests or code — only
workflow facts.

The config that went green:
${JSON.stringify(config, null, 2)}
${revisionDiff && revisionDiff.length > 0 ? `
This run stalled and recovered after revising these config paths mid-run (the revision that
turned red into green — strong evidence about what mattered):
${revisionDiff.join(', ')}
` : ''}${priorRules && priorRules.length > 0 ? `
The lineage's current rules — revise them: keep what still holds, drop what this run
contradicts, add at most what this run actually evidences:
${JSON.stringify(priorRules, null, 2)}
` : `
The lineage has no rules yet. Write only what this single run actually evidences.
`}
Output ONLY a JSON array of strings: at most ${MAX_RULES} rules, each at most ${MAX_RULE_CHARS}
characters. No markdown fences, no commentary.`;

  // Never throw (the module contract): a provider blip during post-green
  // extraction must not lose the green run's bookkeeping — it degrades to a
  // red as data and the caller keeps the lineage's prior rules. Loop defaults
  // throwOnError: true, so a transient 500 WOULD reject without this.
  let r;
  try {
    r = await loop.run([{ role: 'user', content: prompt }]);
  } catch (e) {
    // a transport throw means the spend is UNKNOWN, not zero (F6)
    return { rules: null, valid: false, reds: [{ code: 'provider-error', detail: String(/** @type {Error} */ (e).message ?? e) }], costUsd: null, raw: '' };
  }
  const { costUsd } = priceOf(r); // the ONE honest-null cost read (F6)
  const raw = extractArtifact(r.text ?? '').code ?? '';
  if (r.error) {
    return { rules: null, valid: false, reds: [{ code: 'provider-error', detail: String(r.error) }], costUsd, raw };
  }
  /** @type {(code: string, detail: string) => {rules: null, valid: false, reds: Array<object>, costUsd: number|null, raw: string}} */
  const red = (code, detail) => ({ rules: null, valid: false, reds: [{ code, detail }], costUsd, raw });

  let rules;
  try { rules = JSON.parse(raw); } catch (e) {
    return red('parse-error', String(/** @type {Error} */ (e).message));
  }
  if (!Array.isArray(rules) || rules.length === 0 || !rules.every((x) => typeof x === 'string')) {
    return red('rules-shape', 'expected a non-empty JSON array of strings');
  }
  if (rules.length > MAX_RULES || rules.some((x) => x.length > MAX_RULE_CHARS)) {
    return red('rules-bound', `max ${MAX_RULES} rules of ${MAX_RULE_CHARS} chars — rejected whole, never trimmed`);
  }
  return { rules, valid: true, reds: [], costUsd, raw };
}
