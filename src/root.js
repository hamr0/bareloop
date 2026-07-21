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
/**
 * A teed write: the content the worker emitted, plus whether it actually reached
 * the file. `landed` is the OUTCOME axis (Finding 7) — the gate's allow is an
 * intent record written before the tool runs, and a shell_edit whose anchor
 * misses returns a refusal RESULT with the file untouched (bare-agent
 * tools/shell.js:190). A note that says "these are your changes" is a claim
 * about the file's contents and must be true, so it reads this flag, never the
 * audit. The DETECTOR deliberately does not: see `observe`.
 * @typedef {{content: string, trimmed: boolean, landed: boolean}} TeeEntry
 */

const TEE_CAP_BYTES = 2000;   // per-file content retained for the verbatim stage
const VERBATIM_MAX_FILES = 3; // files surfaced per verbatim injection
const SUMMARY_MAX_PATHS = 10; // paths named in the summary line

/**
 * The root collector. One per run; state dies with the run.
 *
 * Call order (wired by the interpreter's middle):
 *   observe({iteration: 1, writes})            → null (nothing to compare)
 *   stageWrite(path, content)                  → stage, before the tool runs
 *   settleWrite(landed) | discardWrite()       → the outcome, after it ran
 *   noteWrite(path, content)                   → stage+settle, text mode (which
 *                                                writes before it reports)
 *   observe({iteration: N, gap, writes})       → null | {stage, note, event}
 * `writes` is the CUMULATIVE allow-decision write/edit path list from the gate
 * audit (the F32 instrument); the per-attempt set is the delta between calls —
 * so a gate-DENIED write is never counted (the tool never ran at all).
 *
 * Finding 7 — the two axes, deliberately NOT merged. An allow-decision records
 * what the worker REACHED FOR, which is the right instrument for "is it
 * repeating itself"; whether those bytes reached the file is a different
 * question, and only the note (a claim about file contents) needs it. Collapsing
 * them either way is a bug: settling the note on the allow makes it lie, and
 * running the detector off the file makes it blind to a worker re-firing an
 * identical edit whose anchor never matches — measured null on every attempt.
 *
 * @param {{gapKeep?: string, redact?: (s: string) => string, writesInformative?: boolean}} [opts]
 *   the signed spec's kept-failures pattern (the red-set source; without it the
 *   detector degrades to write-overlap alone and the event says so), the shell's
 *   secret scrubber (verbatim content is scrubbed before it rides a prompt), and
 *   `writesInformative` (Finding 3, default true): whether the per-attempt
 *   write-set carries information. In TOOL mode the worker CHOOSES which files to
 *   write, so re-writing the same file is a real repetition signal; in TEXT mode
 *   the one target is rewritten every attempt by construction, so write-overlap
 *   is constant-true and carries none — with no red-set to compare, the detector
 *   cannot tell repetition from progress and must stay inert (it would otherwise
 *   steer a progressing worker off course, violating "inert when not stuck").
 */
export function createRoot({ gapKeep, redact = (s) => s, writesInformative = true } = {}) {
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

  /** @type {{writes: string[], reds: string[]|null, tee: Map<string, TeeEntry>}[]} finalized attempts */
  const attempts = [];
  /** @type {Set<string>} cumulative audit write-set at the last observe */
  let prevCumulative = new Set();
  /** @type {Map<string, TeeEntry>} tee for the attempt currently running */
  let tee = new Map();
  /** @type {{path: string, entry: TeeEntry}|null} the write awaiting its outcome */
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
    pending = { path, entry: { content: scrubbed.slice(0, TEE_CAP_BYTES), trimmed, landed: false } };
  };

  return {
    stageWrite,

    /**
     * The staged write RAN — record what it actually did (Finding 7). Retained
     * either way: an attempted-but-unapplied edit is still the worker reaching
     * for the same file, which is what the detector measures, and dropping it
     * here would blind the ratchet to the purest fixation there is (a worker
     * re-firing an identical edit whose anchor never matches — measured null on
     * every attempt under a tree-diff detector, 2026-07-20). Only the NOTE's
     * wording turns on `landed`. Last write per path wins (the tree's final
     * state for that attempt is what failed the close).
     * @param {boolean} landed whether the content is now in the file
     */
    settleWrite(landed) {
      if (pending) tee.set(pending.path, { ...pending.entry, landed });
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
      if (pending) tee.set(pending.path, { ...pending.entry, landed: true });
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
      // `gap` is guaranteed truthy here (the `if (!gap) return` guard above handled
      // the empty case); reds === null comes only from keptSet's own UNKNOWN logic.
      attempts.push({ writes: delta, reds: keptSet(gap), tee });
      // The detector only ever compares the last two finalized attempts, so older
      // ones (and their teed content) are dead state — keep just the two (Finding 7).
      if (attempts.length > 2) attempts.shift();
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
      // Finding 3: when writes carry no information (text mode — the one target is
      // rewritten every attempt regardless of progress), write-overlap alone can
      // never establish fixation; only a KNOWN-unmoved red-set can. So the
      // degraded writes-only path (redsSame === null) is available to fire only
      // when writes ARE informative (tool mode). With informative writes the prior
      // behavior stands: overlap + reds-not-known-to-have-moved.
      const redsGate = writesInformative ? redsSame !== false : redsSame === true;
      const fixated = overlap.length > 0 && redsGate;
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

      // Finding 7: what the worker REACHED FOR fired the detector; what it
      // ACHIEVED decides the wording. Only paths this attempt actually teed can
      // answer the outcome question — a path known solely from the audit is
      // unattributable, so it falls back to the neutral (landed) phrasing rather
      // than guessing.
      const attempted = overlap.filter((p) => last.tee.has(p));
      const noneApplied = attempted.length > 0
        && attempted.every((p) => !(/** @type {TeeEntry} */ (last.tee.get(p)).landed));

      if (stage === 'summary') {
        const redsClause = mode === 'reds+writes'
          ? 'and the set of failing tests did not change at all'
          : 'with no visible progress';
        // The unapplied case is the MECHANICAL genre (F38: gaps that name a wall
        // convert; semantic ones stall) — naming the missed anchor is strictly
        // more actionable than "form a different hypothesis", because the
        // hypothesis may have been right and only the anchor wrong.
        const body = noneApplied
          ? `Your last two attempts both tried to change ${shownPaths.join(', ')}`
            + `${morePaths > 0 ? ` (and ${morePaths} more)` : ''} and NEITHER EDIT APPLIED — `
            + 'the text you anchored on was not found in the file, so nothing changed. '
            + 'Re-read the file and quote the exact text (whitespace and indentation included) before editing again.'
          : `Your last two attempts both rewrote ${shownPaths.join(', ')}`
            + `${morePaths > 0 ? ` (and ${morePaths} more)` : ''} ${redsClause}. `
            + 'Do NOT retry the same change — form a DIFFERENT hypothesis before your next edit.';
        return { stage, event, note: `RATCHET: you are repeating yourself. ${body}` };
      }
      // verbatim: surface the worker's own last content for the repeated paths —
      // scrubbed, capped, every trim announced. Grouped by OUTCOME, because the
      // two groups need opposite advice: content that landed and failed must not
      // be written again, while content that never applied may have been the
      // right change aimed at the wrong anchor — telling that worker to "write
      // something structurally different" would steer it away from a correct fix.
      const files = attempted.slice(0, VERBATIM_MAX_FILES);
      const moreFiles = attempted.length - files.length;
      /** @param {string} p */
      const block = (p) => {
        const t = /** @type {TeeEntry} */ (last.tee.get(p));
        // t.content was already scrubbed by redact() in stageWrite before storage
        // (Finding 6): re-redacting here is redundant work over already-masked text.
        return `--- ${p}${t.trimmed ? ` (truncated to first ${TEE_CAP_BYTES} chars)` : ''} ---\n${t.content}`;
      };
      const landedFiles = files.filter((p) => /** @type {TeeEntry} */ (last.tee.get(p)).landed);
      const unappliedFiles = files.filter((p) => !(/** @type {TeeEntry} */ (last.tee.get(p)).landed));
      const sections = [];
      if (landedFiles.length) {
        sections.push('These are your OWN previous changes — they landed, and they did NOT fix the failing set:\n'
          + landedFiles.map(block).join('\n')
          + '\nDo not write these again. Write something STRUCTURALLY DIFFERENT, or change a different file.');
      }
      if (unappliedFiles.length) {
        sections.push('This is text you tried to write, and it did NOT apply — the anchor was not found, '
          + 'so the file is UNCHANGED and none of this is in it:\n'
          + unappliedFiles.map(block).join('\n')
          + '\nRe-read the file and copy the exact text you mean to replace, character for character, before editing again.');
      }
      return {
        stage, event,
        note: `RATCHET: you are STILL repeating yourself. ${sections.join('\n\n')}`
          + (moreFiles > 0 ? `\n(and ${moreFiles} more repeated file${moreFiles > 1 ? 's' : ''}, elided)` : ''),
      };
    },
  };
}
