// Shared text helpers. extractArtifact is the ONE parser for every
// model-output extraction (interpret's artifact, extract's rules, the
// runner's drafted config) — two parsers that disagree about the same output
// are two instruments (F2/F21, the adaptlearn instrument caveat). It replaced
// N0's stripFences when the fence-robust upgrade landed at N2.

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
