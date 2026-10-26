# POC — time dry read (F236): pre-registration

Frozen before any number exists. The sha256 of this file is recorded in the commit that adds it. Nothing below changes after a result is read.
A failing page is a FINDING. It is never a re-tune and never a per-page patch.

## Question

Today a time fact whose label never reads a time on the page is still signed (F236: "Departure time" without the colon, JFK-LAX). The run can
never pass it. The money and phrase facts already have a $0 "can it read" step (src/pagedry.js). Does the same step for TIME facts:

- drop the labels that read no time (so the person sees "Not checked" with a plain reason at drafting, before any money), and
- never drop a label that a run can pass (a wrong drop hides a check the person wanted: the costly mistake)?

## The rule under test (frozen)

For each kept time fact, on the frozen page text:

1. Candidate lines: every page line that contains the fact's label (any of its words) AND, anywhere after the label on that line, something
   that looks like a clock time (`H:MM` or `HH:MM`, optional AM/PM). The finder is deliberately LOOSE: it only collects candidates.
2. Each candidate is graded as an HONEST claim (quote = that line, value = that line's first time after the label) by the real `gradeStep`
   (src/rubricstep.js), exactly as `dryReadMoney` does. `gradeStep` alone decides. No copy of its logic.
3. 0 green lines: the fact is dropped as `reads-no-time` and shows under Not checked. 1 or more: kept. No counts, no pass bar.

## Data

- **A. Archive ($0).** Every time fact in the 60 archived `resolved-spec.json` files under `~/.config/bareloop/panel-sessions/` (15 specs carry a
  time fact; the labels are "Departure time:" x14, "departing", "at"), each with that session's own frozen page. Read only, copied to scratch.
- **B. The F236 case.** `tests/fixtures/idea-a/jfk-lax.page.txt` with label "Departure time" (no colon), and with "Departure time:".
- **C. Unseen pages, other kinds.** Three pages that are not flights, fetched with barebrowse AFTER this file is committed: a cinema showtimes
  page, a train or bus timetable page, and an events or sports fixtures page (public, no login). For each, the real page map is run once
  (DeepSeek deepseek-flash, thinking off, about $0.0003 a page) to get the labels an AI really picks. Before the rule is run, the operator
  writes each mapped time label as GOOD (a result line shows a time right after it) or BAD (it never does) into `labels-C.json`, and its sha256
  goes into the results before grading.

Known limit: A and B are all Google Flights (one kind). C is the only evidence on other kinds, n = 3 pages, so a pass is an anecdote there, not a
general claim.

## Decision rules (frozen)

- **R1, no wrong drops on the archive.** Every time label in a spec whose run ended GREEN is kept. One drop = FAIL.
- **R2, the F236 case.** "Departure time" (no colon) on JFK-LAX is dropped with Not checked words. "Departure time:" on the same page is kept.
- **R3, the control can fail.** With the time dry read OFF, the F236 label is kept (shows the harness sees the difference). If R3 does not hold,
  the whole POC is UNREADABLE.
- **R4, unseen pages.** Every label marked GOOD in `labels-C.json` is kept. One GOOD label dropped = FAIL. A BAD label that is kept is
  reported as a miss (the run would still fail later, the old behaviour), not a FAIL.
- **Overall PASS** = R1 and R2 and R3 hold and R4 has no wrong drop. Anything else = FAIL, reported with the label, the page line and the reason.

## What a PASS leads to

Only a build spec shown to hamr. The POC code is never shipped. The build is a rewrite in src/pagedry.js beside `dryReadMoney`, called from
`runPageMap`, with the Not checked words from code.
