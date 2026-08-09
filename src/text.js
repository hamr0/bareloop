// Shared model-output helpers. extractArtifact is the ONE parser for every
// model-output extraction (interpret's artifact, extract's rules, the
// runner's drafted config) — two parsers that disagree about the same output
// are two instruments (F2/F21, the adaptlearn instrument caveat). It replaced
// N0's stripFences when the fence-robust upgrade landed at N2. priceOf is the
// ONE spelling of the honest-null cost read for the same reason (F6).
// `scrubRaw` is the third: the ONE way a model's raw output becomes a persisted
// record, for the same reason again — a second writer that forgets the scrub is
// a leak on the very trail the scrub exists to protect.

import { redactSecrets } from './validate.js';

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

// ── THE RAW MODEL OUTPUT, AS A PERSISTED RECORD ─────────────────────────────
//
// Run mslhn707 died on a survey that broke JSON at position 1339 and left NO
// copy of what the model actually said: the red named the position, the process
// exited, and the only artifact that could have decided whether the malformation
// is recurring (and therefore whether the scout must move to a structure-forced
// tool call) went with it. A raw that is not written down is a diagnosis nobody
// can make twice.
//
// Everything a persisted raw needs is HERE rather than at each writer, and the
// reason is the `scrubRed` reason one layer up: the scrub, the bound and the
// announcement are properties of PERSISTING A RAW, not of any one caller
// remembering them. A future writer that reaches for a raw reaches for this.

/**
 * The ceiling on ONE persisted raw. Sized to the survey's own prompt-ingredient
 * cap (`AUTHOR_SCOUT_BLOB_MAX`, 8000) rather than picked: the largest raw this
 * repository produces is a survey, the archive's real surveys ran 5991-8056
 * bytes, and a record that cannot hold one whole specimen cannot answer the
 * question it exists for. The two constants are deliberately independent
 * numbers — one bounds a PROMPT, this one bounds a RECORD.
 */
export const RAW_PERSIST_MAX = 8000;

/**
 * The announced-trim marker for a persisted raw. A NEW spelling rather than a
 * reuse of `GAP_TRIM_MARKER` ('gap trimmed:'), and that is a decision, not
 * decoration: `src/root.js` READS `GAP_TRIM_MARKER` to mean *this gap was cut,
 * so Layer R must not compare it*, so a second producer of those bytes in a
 * different population is exactly the F90 hazard — a reader must know every
 * producer of its marker. Nothing reads this one yet; it exists so the trim
 * announces itself (F28) and so a future reader has an unambiguous key.
 */
export const RAW_TRIM_MARKER = 'raw trimmed:';

/**
 * ONE raw model emission, ready to persist.
 *
 * Three things happen here and NONE of them is optional at a call site:
 *   - the text goes through the ONE redactor (`redactSecrets`, over the ONE
 *     `SECRET_PATTERNS` inventory). A raw is the single most likely record in
 *     this system to carry a live credential: it is whatever a model read out
 *     of a repository, verbatim, and it lands in a file that outlives the run;
 *   - it is BOUNDED, and the bound ANNOUNCES itself with the full size (F28 —
 *     a bound eats detail, never evidence). The cut is decoded rather than
 *     sliced so a multi-byte character is never split in half;
 *   - it carries its own address: which call produced it (`label`, the same
 *     spelling the cost book meters under) and which attempt (`attempt`), plus
 *     the typed failure that describes it when there is one.
 *
 * `cause`/`reason` are `null` when the emission was fine — an ABSENT failure is
 * absent, never an empty string that reads like a diagnosis nobody wrote.
 * @param {{label: string, attempt: number, text: unknown, cause?: string|null,
 *   reason?: string|null, cap?: number}} o
 * @returns {{label: string, attempt: number, bytes: number, trimmed: boolean,
 *   text: string, cause: string|null, reason: string|null}}
 */
export function scrubRaw({ label, attempt, text, cause = null, reason = null, cap = RAW_PERSIST_MAX }) {
  const scrubbed = redactSecrets(String(text ?? ''));
  const buf = Buffer.from(scrubbed, 'utf8');
  const trimmed = buf.length > cap;
  // walk the cut BACK off any continuation byte (0b10xxxxxx): a byte-wise slice
  // through a multi-byte character renders as a replacement char, and a record
  // that garbles the evidence is a worse instrument than one that keeps a byte
  // less of it
  let end = cap;
  while (trimmed && end > 0 && (buf[end] & 0xC0) === 0x80) end -= 1;
  const kept = trimmed ? buf.subarray(0, end).toString('utf8') : scrubbed;
  // the two diagnosis fields are rendered by `stampRaw` below, never here: the
  // writer that stamps them LATER must go through the same one place, or the
  // scrub becomes a property of when you knew the verdict
  return stampRaw({
    label,
    attempt,
    // the FULL size, always — the number a trim is measured against
    bytes: buf.length,
    trimmed,
    // WITHHELD is measured off `end`, not off `cap`: the multi-byte walk-back above
    // can cut up to three bytes short of the cap, and announcing `length - cap` would
    // under-report the withheld bytes by exactly that much. An announced bound that
    // states a number it did not withhold is the announcement failing at its one job.
    text: trimmed
      ? `${kept}\n[${RAW_TRIM_MARKER} ${buf.length - end} of ${buf.length} bytes withheld — the cap is ${cap} per raw]`
      : kept,
    cause: null,
    reason: null,
  }, { cause, reason });
}

/**
 * Stamp a persisted raw with the verdict that DESCRIBES it — through the same
 * boundary the raw's own text rode.
 *
 * It exists because the verdict is not known when the raw is created: a writer
 * records the emission the moment the call returns (so a metered call can never
 * be missing its output), and only classifies it afterwards. The obvious
 * shape — assigning `cause`/`reason` onto the stored object at that later
 * point — writes an UNSCRUBBED string into a record that is already past the
 * one redactor, and `reason` is the worst field to do it to: it quotes the
 * transport's own error prose, which nobody in this repo wrote and nobody
 * bounds. So the stamp is a function, not an assignment, and `scrubRaw` renders
 * its own two fields through it: ONE place decides how a diagnosis becomes
 * persistable, exactly as ONE place decides it for the text.
 *
 * `cause` is enumerated (`SURVEY_CAUSES`) and passes through untouched; a mask
 * over a closed set would only hide a bug in the set.
 * @template {{cause: string|null, reason: string|null}} T
 * @param {T} raw @param {{cause?: string|null, reason?: string|null}} o @returns {T}
 */
export function stampRaw(raw, { cause = null, reason = null }) {
  raw.cause = cause ?? null;
  raw.reason = reason === null || reason === undefined ? null : redactSecrets(reason);
  return raw;
}
