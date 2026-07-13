// Shared model-output helpers. extractArtifact is the ONE parser for every
// model-output extraction (interpret's artifact, extract's rules, the
// runner's drafted config) — two parsers that disagree about the same output
// are two instruments (F2/F21, the adaptlearn instrument caveat). It replaced
// N0's stripFences when the fence-robust upgrade landed at N2. priceOf is the
// ONE spelling of the honest-null cost read for the same reason (F6).

// A fence counts as the artifact's WRAPPER only when it opens within this many
// lines of the response — the chatty-preamble shape ("Here's the fix:\n```…").
// A fence buried deeper inside an unfenced reply is the artifact's OWN content
// (a doc generator's example block): extracting it truncated a whole module to
// its 2-line fragment with red:null (review 2026-07-13, confirmed by execution).
// The trade-off is documented and pinned: past the window, prose + fence is
// treated as the artifact verbatim — with the no-fences persona, long-preamble
// replies are the rare shape; truncated artifacts corrupted the close signal.
const FENCE_PREAMBLE_LINES = 5;

/**
 * Fence-robust artifact extraction (F2 port requirements #1/#2):
 * - a fenced block opening within the first {@link FENCE_PREAMBLE_LINES} lines
 *   is the artifact — prose-wrapped and preamble fences extract clean (the F21
 *   instrument caveat: prose written to the target corrupted the close signal);
 * - a fence opening deeper is the artifact's own content — the trimmed whole
 *   text is the artifact (fence-heavy artifacts belong in tool mode, where the
 *   worker writes files directly and nothing is parsed);
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
    if (text.slice(0, /** @type {number} */ (m.index)).split('\n').length - 1 < FENCE_PREAMBLE_LINES) {
      const code = m[1].trim();
      return code ? { code, red: null } : { code: null, red: 'empty fenced block' };
    }
    // deep fence = the artifact's own content: verbatim, NO fence strips — the
    // N0 fallback below would eat a trailing example fence off a real artifact
    return { code: text.trim(), red: null };
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
