// The close TREND — one instrument, two consumers (PRD v1.46 §2 and §4).
//
// It answers ONE question about a run's own close grades: **is this getting
// better?** The money halt's decision-ready readout asks it to pick the human's
// lever (a top-up finishes converging work; it is waste on a run that is out of
// ideas), and the close-fix loop's governor asks it whether to keep paying for
// another attempt. Both readings come from here so the two can never disagree.
//
// THE ACCURACY LAW, and it is the whole reason this module exists as its own
// file: **a series is PER STAGE, compared only against itself.** The operator's
// own $0 sweep instrument flattened a staged close's grades into one list and
// read `12, 2, 5, 0` as a regression — the 2 → 5 step. What actually happened
// (u-msew1uy5) was two axes falling at once: suppressions 12 → 5 while the type
// errors that scrub re-exposed went 2 → 0. Merging the axes did not make the read
// noisy, it made it WRONG in the opposite direction, and it would have told hamr
// to abandon a converging run. Here the stages are separate buckets by
// construction, so the mistake is inexpressible rather than avoided by care.
//
// Two signals, both mechanical, both off the close's own output:
//
//   count   the first number on the first RED-marked line of the stage that
//           rendered the verdict. Lower is better; the comparison is against the
//           BEST that stage has ever reported, never the last (an A→B→A
//           oscillator repays its own strike forever under last-only — the same
//           reason src/ladder.js keeps a seen-set).
//   stage   WHERE in the ordered close the run now stops. `runStages` is
//           first-red-wins, so reaching a LATER stage than ever before means the
//           wall the run was stuck behind is gone — progress no per-stage number
//           can see. Falling back to an EARLIER stage is the opposite, and it is
//           a reading, not an unknown.
//
// F6 governs the third answer. A stage whose output carries no number donates
// NOTHING — not a zero, not a strike. A governor that struck on ignorance would
// be minting a verdict out of a blind instrument, which is the defect class this
// repo has shipped six times. What bounds the loop while the instrument is blind
// is `blindCap`: the fixed count this rule replaces, kept as the fallback for
// exactly the case the new instrument cannot read, and lifted the moment it can.
//
// KNOWN LIMIT, stated rather than discovered later. "Lower is better" is a
// direction this module cannot derive from prose, and a minority of close stages
// report a FLOOR instead of a fault count (`N tests executed, below the seed's
// M`) where a rising number is the improvement. Those read as "not improving",
// never as converging — the fail-safe direction, and deliberately so: a false
// "flat" costs one conservative stop, a false "converging" costs a top-up spent
// on a dead run. Never sharpened to chase it (the F49 precedent): the dangerous
// direction is the other one.

/** The strikes that end the close-fix loop. Shell-owned, exactly where the fixed
 * count was, and the SAME number the step ladder uses — hamr's 2. Validated by a
 * $0 replay over all 8 archived fix loops: 0 greens harmed (every historical
 * fix-loop green converted in <= 2 verdicts) and 1 real waste case caught
 * (reuse-msc6w93z, dead flat at 2 errors for 7 verdicts until the wall). */
export const FIX_STRIKE_LIMIT = 2;

/** `runStages` prefixes every staged gap with its own header — the stage name is
 * therefore already IN the gap and needs no second seam to travel beside it. */
const STAGE_HEADER = /^close stage "([^"]+)" failed:[ \t]*\r?\n?/;

/** A line the close itself marked as a judgment. Every shipped close spells it
 * `red:`, `gate-red:`, `form-red:` or `clean-red:`, so `\bred\b` reads all four
 * without a per-close pattern. Deliberately NOT a bare "first number anywhere":
 * a path, a timestamp or an echoed tool line would donate a number that means
 * nothing, and a wrong number is worse than none (F6 — the honest answer is a
 * null, and it has one). */
const RED_LINE = /\bred\b/i;

/** the count on that line — the first STANDALONE number. No sign: a failure count
 * is never negative, and a leading `-?` turns `foo-3` into -3. Decimals kept
 * (`fault-detection rate 27.5%`). Standalone means not embedded in a word or a
 * dotted token: the digit in a rule id (`D1a`) or a version (`v1.2`) is not a
 * count, and reading one donated a constant wrong number to the governor (review
 * F1 — the live repro was types-close's `D1a — … went 2 → 5` reading as 1). */
const COUNT = /(?<![\w.])\d+(?:\.\d+)?(?!\w)/g;

/** A before→after line (`… went 2 → 5`) states its own trend; the CURRENT value
 * is the last number, and reading the first would grade every iteration with the
 * constant seed baseline — flat by construction. Only such lines read last; every
 * other line keeps first-number (the live fleet's reference-suffixed lines —
 * `5 tests executed, below the seed's 12` — carry the truth up front).
 * KNOWN LIMIT (same rule as the header's): an arrow line with a TRAILING reference
 * number (`went 5 → 2 (seed was 30)`) would read the reference. No shipped close
 * emits that shape; if one appears, the fix is that close's line format — this
 * detector is never sharpened per-close (the F49 precedent). */
const ARROW = /→/;

/**
 * Read one close gap into its stage and its count. Pure, and both halves are
 * independently nullable: a gap with no header still yields its count, a gap
 * with no red-marked line still yields its stage.
 * @param {string} [gap] the close's gap, exactly as `runStages` built it
 * @returns {{stage: string|null, value: number|null}}
 */
export function readGrade(gap) {
  const text = String(gap ?? '');
  const h = STAGE_HEADER.exec(text);
  // The header is REMOVED before the red scan, never merely skipped over: a stage
  // whose NAME contains "red" would otherwise donate its own (numberless) header
  // line as the reading and mask the real count two lines down.
  const body = h ? text.slice(h[0].length) : text;
  const line = body.split('\n').find((l) => RED_LINE.test(l));
  const nums = line ? line.match(COUNT) : null;
  const pick = nums && nums.length ? (ARROW.test(/** @type {string} */ (line)) ? nums[nums.length - 1] : nums[0]) : null;
  const n = pick !== null ? Number(pick) : NaN;
  return { stage: h ? h[1] : null, value: Number.isFinite(n) ? n : null };
}

/** the bucket key for a gap that named no stage — its own series, never merged
 * into a named stage's (that would be the flattening this module forbids) */
const UNSTAGED = '(unstaged)';

/**
 * Build one trend reader. ONE PER SERIES: the money readout wants the whole run's
 * close grades (the precheck is the seed the work is measured against), while the
 * fix governor wants only the grades its own loop produced. Two instances, one
 * rule — never one instance with a phase field, which is how a shared reader comes
 * to answer two questions with one number.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.stageOrder] the staged close's stage names IN ORDER, so
 *   "the run got further than it ever had" is readable. Empty disables that signal
 *   entirely (an unknown ordering is unknown, never assumed).
 * @param {number} [opts.limit] consecutive no-progress readings that strike the
 *   loop out (default `FIX_STRIKE_LIMIT`).
 * @param {number|null} [opts.blindCap] the RETIRED count, kept as the bound for
 *   the case the instrument cannot read at all. Counted in iterations PAST the
 *   baseline, so a blind loop runs exactly the number of attempts the old fixed
 *   count bought it. `null` = no fallback bound (money and the wall still apply).
 */
export function createTrend({ stageOrder = [], limit = FIX_STRIKE_LIMIT, blindCap = null } = {}) {
  /** @type {Map<string, number[]>} stage → every count it reported, in order */
  const series = new Map();
  /** @type {Map<string, number>} stage → the BEST (lowest) count it ever reported */
  const best = new Map();
  /** the furthest stage index reached so far; null until a KNOWN stage is seen */
  let bestStageIdx = null;
  let iterations = 0;
  let noProgress = 0;
  let comparableEver = false;
  /** did the close ever get FURTHER through its stages than it had before? Kept
   * separately from the counts because it is the one kind of progress no per-stage
   * number can express — and it is the only evidence a run that never reported the
   * same stage twice has. */
  let advancedEver = false;

  const idxOf = (/** @type {string} */ stage) => stageOrder.indexOf(stage);

  return {
    /**
     * Read one RED close grade. A green never reaches here (both callers stop on
     * satisfied), so every reading is a failing grade by construction.
     * @param {{gap?: string, stage?: string|null, value?: number|null}} o either a
     *   raw gap (parsed here) or an already-read `{stage, value}` — never both
     *   spellings of the same reading in one call.
     * @returns {{iteration: number, stage: string, value: number|null, improved: boolean,
     *   comparable: boolean, noProgress: number, limit: number, stageIndex: number}}
     */
    record({ gap, stage, value } = {}) {
      const read = stage === undefined && value === undefined ? readGrade(gap) : { stage: stage ?? null, value: value ?? null };
      const st = read.stage ?? UNSTAGED;
      const v = typeof read.value === 'number' && Number.isFinite(read.value) ? read.value : null;
      const idx = idxOf(st);

      // ── the two comparisons, each against this stage's OWN history ──
      const priorBest = best.get(st);
      const countComparable = v !== null && priorBest !== undefined;
      const countImproved = countComparable && v < /** @type {number} */ (priorBest);
      // the ordering signal only exists between two KNOWN positions that DIFFER —
      // an unnamed stage has no position, and standing still says nothing
      const stageComparable = idx >= 0 && bestStageIdx !== null && idx !== bestStageIdx;
      const stageImproved = stageComparable && idx > /** @type {number} */ (bestStageIdx);

      const comparable = countComparable || stageComparable;
      const improved = countImproved || stageImproved;

      // ── fold the reading in AFTER the comparison (a reading never beats itself) ──
      if (v !== null) {
        if (!series.has(st)) series.set(st, []);
        /** @type {number[]} */ (series.get(st)).push(v);
        if (priorBest === undefined || v < priorBest) best.set(st, v);
      }
      if (idx >= 0 && (bestStageIdx === null || idx > bestStageIdx)) bestStageIdx = idx;
      if (stageImproved) advancedEver = true;
      iterations += 1;
      if (comparable) {
        comparableEver = true;
        noProgress = improved ? 0 : noProgress + 1;
      }
      // an UNCOMPARABLE reading neither strikes nor repays: it is an absence of
      // evidence, and the governor must not mint either verdict from one (F6)

      return { iteration: iterations, stage: st, value: v, improved, comparable, noProgress, limit, stageIndex: idx };
    },

    /** has the loop run out of ideas — or, while the instrument is blind, out of
     * the count it replaced? Money and the wall are unchanged and bound it either way. */
    struckOut: () => noProgress >= limit
      || (!comparableEver && blindCap !== null && iterations - 1 >= blindCap),

    /** the reader's own books. COUNTS AND STAGE NAMES ONLY — no close bytes ever
     * enter a record from here, because the spine is append-only forever. */
    report: () => ({
      iterations, strikes: noProgress, limit,
      blind: !comparableEver,
      stages: [...series.entries()].map(([name, vals]) => ({ stage: name, values: [...vals] })),
    }),

    /**
     * The DECISION-READY readout (PRD v1.46 §2): which way the run was going when
     * something cut it, in the three verdicts hamr named, and the lever each
     * implies. The library only reports — it never adjusts a budget (hard line).
     * @returns {{trend: 'converging'|'flat'|'unknown', reading: string, lever: string,
     *   series: {stage: string, values: number[]}[]}}
     */
    verdict() {
      const rows = [...series.entries()].map(([name, vals]) => ({ stage: name, values: [...vals] }));
      // The HEADLINE verdict rests on numbers only, and the reason is not purity: a
      // stage advance is guaranteed on essentially every run that does any work at
      // all (the precheck reds at stage 1, the plan fixes stage 1, the close walks
      // on), so an ordering-only "converging" would be true of almost every run and
      // could not discriminate the one thing hamr asked it to — whether another
      // dollar finishes this. It stays a real signal for the STRIKE rule, where the
      // question is the different one of whether the LAST attempt helped.
      const numeric = rows.filter((r) => r.values.length > 1);
      const render = numeric.map((r) => `${r.stage} ${r.values.join(' → ')}`).join('; ');
      // convergence is defined PER STAGE and per stage only: some axis is lower than
      // where it started. First-vs-last, because the question a halt asks is "did
      // this run make net progress", not "did the last attempt help".
      const fell = numeric.some((r) => r.values[r.values.length - 1] < r.values[0]);

      // No stage ever reported a comparable number: the honest answer, stated rather
      // than rounded up to either direction. A "flat" here would recommend rewriting
      // a goal on no evidence at all; a "converging" would recommend spending on the
      // same. The ordering movement, where there was any, rides in the READING as
      // context — it just does not get to decide (F6: an unknown stays an unknown,
      // even when something adjacent to it is known).
      if (numeric.length === 0) {
        return {
          trend: 'unknown',
          reading: advancedEver
            ? 'no stage reported a comparable number twice — nothing the instrument can compare, though the close did reach a later stage than it had before'
            : 'no stage reported a comparable number twice — nothing the instrument can compare, so the direction is unknown rather than assumed',
          lever: 'read the last close output before choosing between a top-up and a different goal',
          series: rows,
        };
      }
      return fell
        ? {
          trend: 'converging',
          reading: `still progressing — ${render}`,
          lever: 'top up budgetUsd and resume; the work was still converging when the money ran out (a spec edit, so the new hash needs re-approval)',
          series: rows,
        }
        : {
          trend: 'flat',
          reading: `no stage improved — ${render}`,
          lever: 'more money is unlikely to help; revise the goal/spec first (same re-approval)',
          series: rows,
        };
    },
  };
}
