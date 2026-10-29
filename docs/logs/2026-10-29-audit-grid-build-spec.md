# Audit grid — build spec (OK by hamr 2026-10-29: "A")

Source: PRD v1.119 (docs/product/PRD.md:2102-2113), signed mock `design/audit-grid-mock.html` variant F
(markup 200-209, JS 3042-3135, events 3145-3192). Branch `feat/audit-grid` off main 11bcd41. One sonnet builder.

## 0. One deviation from the PRD (hamr chose A, 2026-10-29)

PRD says "render-only over existing part data". True for STEP parts. Not true for the FIX part:
`src/replay.js:1416` maps every fix attempt with `detail: null` and drops `source`. The error text exists in
the spine (`close-verdict.gap`, real example: run 01-pulselog-OFF-r1 seq 116) but never reaches the page.
Plan A (my pick): the fix attempt map also carries, from data already in the spine, nothing computed:
- `reasons`: the failing stage's gap lines (first-red-wins, so at most one failing check per fix try)
- `source`: so the opening-close try shows "opening close" instead of thinking words
- per-try stop words for a try with no verdict (see C4)

## A. Data (server side, smallest change)

A1. `src/replay.js` fix-attempt map: add `reasons` (gap split into lines, after the `stageGap` header line), `source`.
A2. Step rows are joined to the DECLARED check list by `name` (server `n` is run order; rows must be declared order, as in the mock's `F.run.declared`).
A3. No-verdict words, code-owned, one table:
   - step try cut off: existing `CUT_OFF_WORDS` ("cut off before its checks ran")
   - try dropped by the provider: "provider dropped (<cause>), no check ran", cause = the stop detail's short form (e.g. "socket hang up")
   - stopped by the person: "you stopped it, no check ran"; died: "died, no check ran"
A4. No new fields on step parts.

## B. Grid (one builder for step AND fix parts, like mock `fxPart`)

Per part, in the part body, top to bottom:
1. `div.hint` tools breakdown + `div.step-tally` (UNCHANGED).
2. Grid box `div.grid-wrap.audit-table-scroll` > `table.grid.fgrid`. Scrolls inside its box; sticky header; no page side-scroll at phone width.
3. Header: `th.q` "check", then per try `th.t`: "try N" + glyph (✓ ✗ ?) + `span.hint` on its own line = the try's thinking words ("thinking on" / "thinking off" / "thinking on (this model can't change it)"), or "opening close" for the opening-close try, or nothing on old runs.
4. Rows: one per declared check, `td.q` = "N question" (`stageQuestionText`, code-owned).
5. Cells: pass `✓` (title "passed[: number]"), fail = button `✗` (title "try N, check #K: failed - click to read its errors"), not run `·` (title "not run (first-red-wins stopped the close)"), no verdict `?` (title "try N: no verdict").

## C. Errors list under each grid (`div.fx-errors`, label "errors")

C1. One row per try with a ✗ or a ?. All-pass tries: no row. Nothing failed: no list.
C2. Row text: `try N · #K ✗ [+J more check(s)] · <first error line, one line, full text on hover> · (+M more)`.
C3. Open a row (click it, or click any ✗ cell of that try; those cells get a red outline while open): first 8 error lines, then button "+M more lines" / "show first 8 only". Several failing checks in one try: a "#K question" sub-heading each. Rows open independently.
C4. "?" row: not clickable, faint, reads the A3 words.
C5. Default on load: only the LAST failed try's row is open per part.

## D. Rounds (UNCHANGED content, new place)

Folded under the errors list: label "rounds per try", one fold per try "try N rounds (N calls)", lazy-loaded from the EXISTING per-attempt endpoint `/api/runs/:id/rounds?part=&attempt=`, 20 rows a page + load more. Replaces the step's single `all=1` table.

## E. Removed

The boxed fix view (`buildAttemptsList`: "attempt N ✗ · …" buttons + checks-list) and the stacked step try blocks (`buildStepFold`/`tryBlockHtml`). Part header, map, cards, Run tab: untouched.

## F. Not built (mock lab-only)

`dupOf` / `.dup` (dead in the mock); the "try 4 · … (the ? column)" note line; variants A–E; lab chrome. Look = panel's own classes; new CSS ported from mock lines 61, 87-89, 106-126, 150-170 only.

## G. Tests

- Update: tests/panel-page.test.js (1192-1201, 1241, 2455-2460), tests/thinking-audit.test.js:114-127, tests/part5-page.test.js (whole try-block file), tests/panel-audit-arrows.test.js:53-54.
- New: render tests on a COMMITTED real-spine fixture under tests/fixtures (a run with a step retry, a fix loop with ✗, a not-run, and a provider-dropped try), never authored-to-fit; replay test for A1 (gap lines reach `attempts[].reasons`).
- Gate: `npm test` via hermetic, exit code + last line quoted; scratch HOME; runs.jsonl line count before/after.

## H. Done means

1. Gate green on the final commit, pushed, CI green.
2. My own screenshot of a real run's Audit tab beside the mock variant F, control by control.
3. hamr clicks through. Only then "done".
