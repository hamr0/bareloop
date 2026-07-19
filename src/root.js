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
  /** @param {string} gap @returns {string[]|null} normalized kept lines, or null when no pattern */
  const keptSet = (gap) => keepRe
    ? [...new Set(gap.split('\n').filter((l) => keepRe.test(l)).map(normalizeRedLine))].sort()
    : null;

  /** @type {{writes: string[], reds: string[]|null, tee: Map<string, {content: string, trimmed: boolean}>}[]} finalized attempts */
  const attempts = [];
  /** @type {Set<string>} cumulative audit write-set at the last observe */
  let prevCumulative = new Set();
  /** @type {Map<string, {content: string, trimmed: boolean}>} tee for the attempt currently running */
  let tee = new Map();
  let streak = 0;

  return {
    /**
     * Retain a landed write/edit's content for the verbatim stage. Memory-only
     * — never the spine. Last write per path wins (the tree's final state for
     * that attempt is what failed the close).
     * @param {string} path @param {string} content
     */
    noteWrite(path, content) {
      const trimmed = content.length > TEE_CAP_BYTES;
      tee.set(path, { content: content.slice(0, TEE_CAP_BYTES), trimmed });
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

      if (attempts.length < 2) return null;
      const [prev, last] = attempts.slice(-2);
      const overlap = last.writes.filter((p) => prev.writes.includes(p));
      const redsSame = last.reds === null || prev.reds === null
        ? null // no red-set instrument — write-overlap alone decides, named below
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
