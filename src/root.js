// Layer R — the root: the within-run ratchet (LAYERS.md item 2; design record
// docs/plans/2026-07-19-layer-r-design.md). One state that survives attempts
// inside ONE run so a never-green run stops repeating itself (F21). Role is
// CONTINUITY ONLY — F39 measured that hand-delivered state buys no conversion;
// the semantic converter is Layer 2's job, not this module's.
//
// Ownership: the SHELL authors the root, mechanically, from the arbiter's own
// books — per-attempt write-sets (the gate audit, via the F32 workerWrites
// seam) and the close's kept-failure lines. The worker authors nothing and
// gains no verb; delivery is injection into the next attempt's prompt, so the
// adaptlearn-F6 write-only-decoy class is structurally excluded.
//
// Engagement is FIXATION-GATED (RSI-LEARNINGS §3.3: the rejected-edit buffer's
// lift is a fixation phenomenon and an honest null on a strong model when not
// stuck — pay only when stuck). Content ESCALATES: first detection injects a
// capped mechanical summary; a second consecutive detection injects the
// worker's own prior failed edit content verbatim ("write something
// STRUCTURALLY DIFFERENT" — the BA-14 mechanism, 50%→100% under fixation).
// Both stages fire on DIFFERENT attempts, so every stuck episode yields a
// per-stage read for the acceptance battery.
//
// Scope: within-run scratch, discarded at run end — NEVER across-run memory
// (only a green mints that, and this module touches no inheritance channel).
// Spine events carry counts and paths only, never content: verbatim edit text
// is worker-authored and the spine is append-only (what a log captures, it
// captures forever).

// The shell's kept-failures trim announcement (ralph): its presence in a gap means
// failures were dropped past the gap cap, so the visible kept lines are an
// UNRELIABLE red-set for comparison. Imported (never re-spelled) so the detector
// keys off the exact string the shell emits — a magic string here would drift.
import { GAP_KEEP_TRIM_MARKER } from './ralph.js';

/**
 * Strip a trailing duration stamp from a kept-failure line. Real `node --test`
 * spec-reporter lines are NEVER byte-stable across runs (`✖ multiplies
 * (1.738ms)` vs `(1.637ms)` — POC 2026-07-19), so naive equality reads every
 * attempt as "reds moved" and the detector never fires. COMPARISON-ONLY: the
 * gap the worker sees is never rewritten.
 * @param {string} line
 */
export const normalizeRedLine = (line) => line.replace(/ \(\d+(?:\.\d+)?m?s\)\s*$/, '');

// Bounds — every trim is ANNOUNCED in the note (F28: silent truncation is the
// disease; a cure that truncates silently is the same disease).
const TEE_CAP_BYTES = 2000;   // per-file content retained for the verbatim stage
const VERBATIM_MAX_FILES = 3; // files surfaced per verbatim injection
const SUMMARY_MAX_PATHS = 10; // paths named in the summary line

/**
 * The root collector. One per run; state dies with the run.
 *
 * Call order (wired by the interpreter's middle):
 *   observe({iteration: 1, writes})            → null (nothing to compare)
 *   noteWrite(path, content)                   → tee, per landed write/edit
 *   observe({iteration: N, gap, writes})       → null | {stage, note, event}
 * `writes` is the CUMULATIVE allow-decision write/edit path list from the gate
 * audit (the F32 instrument); the per-attempt set is the delta between calls —
 * so a gate-DENIED write is never counted and never surfaced (it never landed).
 *
 * @param {{gapKeep?: string, redact?: (s: string) => string}} [opts] the signed
 *   spec's kept-failures pattern (the red-set source; without it the detector
 *   degrades to write-overlap alone and the event says so) and the shell's
 *   secret scrubber (verbatim content is scrubbed before it rides a prompt).
 */
export function createRoot({ gapKeep, redact = (s) => s } = {}) {
  const keepRe = gapKeep ? new RegExp(gapKeep, 'm') : null;
  /**
   * The comparable red-set, or null when it CANNOT be trusted — one clean UNKNOWN
   * covering three cases, so the detector honestly degrades to write-overlap alone
   * rather than making the strong "reds unchanged" claim off a blind instrument:
   *   - no gapKeep pattern at all (no red-set instrument);
   *   - a TRIMMED window (ralph dropped failures past the cap): failures beyond the
   *     window can move while the visible lines stay identical (Finding 5);
   *   - zero matches on a judged gap: an empty kept-set is UNKNOWN, not "zero
   *     failures" — [] === [] would false-read as "reds unchanged" (Finding 2).
   * @param {string} gap @returns {string[]|null} normalized kept lines, or null when untrustworthy
   */
  const keptSet = (gap) => {
    if (!keepRe || gap.includes(GAP_KEEP_TRIM_MARKER)) return null;
    const lines = [...new Set(gap.split('\n').filter((l) => keepRe.test(l)).map(normalizeRedLine))].sort();
    return lines.length ? lines : null;
  };

  /** @type {{writes: string[], reds: string[]|null, tee: Map<string, {content: string, trimmed: boolean}>}[]} finalized attempts */
  const attempts = [];
  /** @type {Set<string>} cumulative audit write-set at the last observe */
  let prevCumulative = new Set();
  /** @type {Map<string, {content: string, trimmed: boolean}>} tee for the attempt currently running */
  let tee = new Map();
  /** @type {{path: string, entry: {content: string, trimmed: boolean}}|null} the write awaiting its gate verdict */
  let pending = null;
  let streak = 0;

  /**
   * Capture a write/edit's content as PENDING — staged against the gate verdict
   * that has not been rendered yet (Finding 6). Scrub at CAPTURE, BEFORE
   * truncating (repo doctrine: secrets scrub at the source, and staging IS the
   * source — a staged secret must be scrubbed even if the write is later
   * discarded). Every SECRET_PATTERN is a prefix+min-length shape (sk-…{16,}),
   * so a secret straddling the cap would lose the bytes that make it match and a
   * partial token would ride the note unredacted — redact the FULL content
   * first, then cap the already-scrubbed string.
   * @param {string} path @param {string} content
   */
  const stageWrite = (path, content) => {
    const scrubbed = redact(content);
    const trimmed = scrubbed.length > TEE_CAP_BYTES;
    pending = { path, entry: { content: scrubbed.slice(0, TEE_CAP_BYTES), trimmed } };
  };

  return {
    stageWrite,

    /**
     * The staged write was ALLOWED and landed: retain it for the verbatim stage.
     * Memory-only — never the spine. Last LANDED write per path wins (the tree's
     * final state for that attempt is what failed the close). A no-op when
     * nothing is staged, so a read/grep/recall verdict costs nothing.
     */
    commitWrite() {
      if (pending) tee.set(pending.path, pending.entry);
      pending = null;
    },

    /**
     * The staged write was DENIED or HALTED: it is not in the file, so it must
     * never be surfaced as "your own change that landed". Drops the stage and
     * leaves whatever DID land for that path untouched.
     */
    discardWrite() { pending = null; },

    /**
     * Stage and commit in one call — the post-allow write site (text mode
     * gate-checks and writes before it calls this, so the verdict is already in).
     * @param {string} path @param {string} content
     */
    noteWrite(path, content) {
      stageWrite(path, content);
      if (pending) tee.set(pending.path, pending.entry);
      pending = null;
    },

    /**
     * Called at the START of attempt `iteration`, with the PREVIOUS attempt's
     * gap. Finalizes that attempt from the books, runs the detector, and
     * returns the injection for the attempt about to run — or null (inert).
     * @param {{iteration: number, gap?: string, writes: string[]}} o
     * @returns {null | {stage: 'summary'|'verbatim', note: string, event: object}}
     */
    observe({ iteration, gap, writes }) {
      const cumulative = new Set(writes);
      if (!gap) { // first attempt: nothing judged yet, nothing to compare
        prevCumulative = cumulative;
        tee = new Map();
        pending = null;
        return null;
      }
      // finalize the attempt that just failed: its writes are the audit delta
      const delta = [...cumulative].filter((p) => !prevCumulative.has(p));
      // an edit to a file already written in an earlier attempt is not in the
      // delta — the tee saw it, and a teed landed path IS this attempt's work
      for (const p of tee.keys()) if (cumulative.has(p) && !delta.includes(p)) delta.push(p);
      attempts.push({ writes: delta, reds: gap ? keptSet(gap) : null, tee });
      prevCumulative = cumulative;
      tee = new Map();
      // a stage whose verdict never arrived (the attempt ended mid-flight) is not
      // a landed write and must not survive into the next attempt's tee
      pending = null;

      if (attempts.length < 2) return null;
      const [prev, last] = attempts.slice(-2);
      const overlap = last.writes.filter((p) => prev.writes.includes(p));
      // Both UNKNOWN → no trustworthy red-set either side: write-overlap alone
      // decides (writes-only mode, named below). One known and one UNKNOWN → the
      // red-set is not provably the same, so it counts as MOVEMENT, never a fire
      // (a real red-set followed by a crash/empty gap is new information, not
      // repetition). Both known → the honest set comparison.
      const redsSame = last.reds === null && prev.reds === null ? null
        : last.reds === null || prev.reds === null ? false
        : JSON.stringify(last.reds) === JSON.stringify(prev.reds);
      const fixated = overlap.length > 0 && redsSame !== false;
      if (!fixated) { streak = 0; return null; }
      streak += 1;

      const stage = streak === 1 ? 'summary' : 'verbatim';
      const mode = redsSame === null ? 'writes-only' : 'reds+writes';
      const shownPaths = overlap.slice(0, SUMMARY_MAX_PATHS);
      const morePaths = overlap.length - shownPaths.length;
      const event = {
        iteration, stage, mode, streak,
        paths: shownPaths, ...(morePaths > 0 ? { pathsElided: morePaths } : {}),
        redSetSize: last.reds ? last.reds.length : null,
      };

      if (stage === 'summary') {
        const redsClause = mode === 'reds+writes'
          ? 'and the set of failing tests did not change at all'
          : 'with no visible progress';
        return {
          stage, event,
          note: `RATCHET: you are repeating yourself. Your last two attempts both rewrote ${shownPaths.join(', ')}`
            + `${morePaths > 0 ? ` (and ${morePaths} more)` : ''} ${redsClause}. `
            + 'Do NOT retry the same change — form a DIFFERENT hypothesis before your next edit.',
        };
      }
      // verbatim: surface the worker's own last failed content for the repeated
      // paths — scrubbed, capped, every trim announced
      const files = overlap.filter((p) => last.tee.has(p)).slice(0, VERBATIM_MAX_FILES);
      const moreFiles = overlap.filter((p) => last.tee.has(p)).length - files.length;
      const blocks = files.map((p) => {
        const t = /** @type {{content: string, trimmed: boolean}} */ (last.tee.get(p));
        return `--- ${p}${t.trimmed ? ` (truncated to first ${TEE_CAP_BYTES} chars)` : ''} ---\n${redact(t.content)}`;
      });
      return {
        stage, event,
        note: 'RATCHET: you are STILL repeating yourself. These are your OWN previous changes — they landed, '
          + 'and they did NOT fix the failing set:\n'
          + blocks.join('\n')
          + (moreFiles > 0 ? `\n(and ${moreFiles} more repeated file${moreFiles > 1 ? 's' : ''}, elided)` : '')
          + '\nDo not write these again. Write something STRUCTURALLY DIFFERENT, or change a different file.',
      };
    },
  };
}
