// THE SEED NOTE (EXPERIMENTAL, default OFF; docs/logs/SEEDGAP-PREREG.md): what the job's own check said on the untouched tree.
// Built by code from the preflight's own stage results — no extra close run, no model call, no verdict change. Read-only text for the
// planner's first draft and the first worker of the first step. The switch is the signed spec's `seedNote` (absent = off, `true` = on).
// Only a count-not-worse stage red at seed qualifies: a command-exit gap is capped noise that cannot carry the failure, and
// changed-from-seed is the "nothing changed yet" fact every run starts with. The stage text is passed as the stage rendered it, masked.

export const SEED_NOTE_HEADING = "At start, the job's own check said:";
/** the one stage kind whose text qualifies */
export const SEED_NOTE_KIND = 'count-not-worse';

/**
 * @param {{stage: string|null|undefined, kind: string|null|undefined, gap: string|null|undefined}[]} reds one entry per preflight verdict
 *   that was RED at seed (stage = the stage that rendered it, kind = that stage's declared kind, gap = the verdict's gap text)
 * @param {(s: string) => string} scrub the run's secret mask
 * @returns {{ text: string, stages: string[] }|null} null when no qualifying stage was red (nothing to say)
 */
export function buildSeedNote(reds, scrub) {
  /** @type {Map<string, string>} */
  const kept = new Map();
  for (const r of reds) {
    if (r.kind !== SEED_NOTE_KIND || typeof r.stage !== 'string' || typeof r.gap !== 'string' || !r.gap.trim()) continue;
    if (!kept.has(r.stage)) kept.set(r.stage, scrub(r.gap));
  }
  if (kept.size === 0) return null;
  return { text: `${SEED_NOTE_HEADING}\n${[...kept.values()].join('\n')}`, stages: [...kept.keys()] };
}
