// Shared text helpers. stripFences is deliberately minimal at N0 (reference
// parity): it strips ONE leading and ONE trailing markdown fence. The
// fence-robust upgrade (prose-wrapped, mid-text fences — adaptlearn F21's
// instrument caveat, filed in FINDINGS F2) lands here at N2, in one place:
// interpret's artifact path and extract's rules path must never disagree
// about what the same model output parses to.

/** @param {string} t */
export const stripFences = (t) => t.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '');
