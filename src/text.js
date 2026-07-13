// Shared model-output helpers. extractArtifact is the ONE parser for every
// model-output extraction (interpret's artifact, extract's rules, the
// runner's drafted config) — two parsers that disagree about the same output
// are two instruments (F2/F21, the adaptlearn instrument caveat). It replaced
// N0's stripFences when the fence-robust upgrade landed at N2. priceOf is the
// ONE spelling of the honest-null cost read for the same reason (F6).

/**
 * Fence-robust artifact extraction (F2 port requirements #1/#2):
 * - the FIRST fenced block anywhere is the artifact — prose-wrapped and
 *   mid-text fences extract clean (the F21 instrument caveat: prose written
 *   to the target corrupted the close signal);
 * - no fence → the trimmed whole text, with N0's unclosed-leading-fence strip
 *   as the fallback (reference parity);
 * - nothing extractable → `code: null` plus a named reason: artifact-red
 *   material for the caller's OWN axis, never a silent empty write.
 * Never throws.
 * @param {string|null|undefined} t
 * @returns {{ code: string|null, red: string|null }}
 */
export function extractArtifact(t) {
  const text = String(t ?? '');
  const m = text.match(/```[^\n`]*\n?([\s\S]*?)```/);
  if (m) {
    const code = m[1].trim();
    return code ? { code, red: null } : { code: null, red: 'empty fenced block' };
  }
  const bare = text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return bare ? { code: bare, red: null } : { code: null, red: 'empty response' };
}

/**
 * The ONE spelling of the F6 honest-null cost read on a bare-agent result.
 * `metrics.costUsd` is the honest null when NOTHING priced — never fall
 * through to `cost` when metrics exist: `cost` sums priced rounds only, so an
 * all-unpriced run reports cost 0 and `?? cost` would launder the explicit
 * unknown into a silent $0 (the F6 class — four shipped launderings were this
 * exact fallback chain hand-spelled). `unpricedRounds` makes a PARTIALLY
 * unpriced run visible (costUsd finite but an under-count).
 * @param {any} r a Loop.run() result (or null)
 * @returns {{ costUsd: number|null, unpricedRounds: number }}
 */
export function priceOf(r) {
  return {
    costUsd: r?.metrics ? r.metrics.costUsd : (r?.cost ?? null),
    unpricedRounds: r?.metrics?.unpricedRounds ?? 0,
  };
}
