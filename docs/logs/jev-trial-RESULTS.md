# Jev drafting-classifier trial: results (2026-10-26)

Rules are the frozen ones in `jev-trial-PREREG.md`, narrowed by `jev-trial-AMEND-1.md` and `jev-trial-AMEND-2.md`. Nothing was re-tuned after an answer was read. Raw files: `.claude/scratch/jev-trial/` (untracked scratch): `results-cinema-flights.json`, `results.json` (train), `grade.out`, `grade-train.out`, `datamode/`.

## Headline

- Jev (`jev-1.14.0`, default context) passed every frozen rule in both runs, with no wrong answer: 18 of 18 on the cinema and flights pages, 17 of 17 on the train page.
- The train page only worked once it was fetched in barebrowse's new data mode. On today's act layout it was refused (87,087 chars, HTTP 400 `max_tokens_exceeded`; AMEND-1).
- DeepSeek (deepseek-flash, thinking off, information only) also got the train page 17 of 17 in data mode. So the hard part was the page layout, not the judge.
- The trial is small (35 questions on 3 pages) and underpowered for a general claim.

## Run 1: cinema + flights, today's act layout (AMEND-1)

Rule, result, pass:

- Control (2 trivial items right): 2 of 2. Pass.
- J1, overall at least 90%: 18 of 18 (100%). Pass.
- J2, hard items at least 9 of 10: 10 of 10. Pass.
- J3, confident items (p at least 0.9 or at most 0.1) at least 95% right, and at least 10 confident: 18 confident, 18 right. Pass. Middle band (0.1 to 0.9): 0 items.
- Overall: PASS.

Per page:

- Cinema (Moviefone SF, 8 items, 6 hard): Jev 8 of 8, p from 0.08 to 0.99. DeepSeek 8 of 8.
- Flights (Google Flights BOS to ORD, 10 items, 4 hard, includes the 2 controls f00a "Boston" present p 0.98, f00b "Zorblax" absent p 0.02): Jev 10 of 10, p from 0.02 to 0.99; the lowest-confidence yes was f07 at 0.92, the highest no f08 at 0.09. DeepSeek: no result. Its flights call died on "socket hang up", so all 10 flights items read as unparsed.

DeepSeek totals as the grader prints them (8 of 18, hard 6 of 10, unparsed 10) are a casualty of that one failed call, not a score. The only DeepSeek comparison in this run is cinema, 8 of 8. There is no flights comparison.

Spend: Jev $0.001057 (flights 17,671 input tokens $0.000742; cinema 7,507 tokens $0.000315). DeepSeek cinema $0.003721. Total $0.004779, a floor only (the dead call is unpriced). Cap $0.50.

## Run 2: train, barebrowse data mode (AMEND-2)

Page: MBTA Providence line timetable, fetched 2026-10-26 with barebrowse's opt-in `mode: 'data'` (local branch `feat/data-mode` at 496260b, NOT published): 13,707 chars against the act page's 87,087. Items: 17 of the 19 held train items (t17 and t19 dropped before the run as unsound; see AMEND-2). Graded on its own, not pooled with run 1.

Rule, result, pass:

- Control (t01, t02): 2 of 2. Pass.
- J1: 17 of 17 (100%). Pass.
- J2: hard 13 of 13 (100%). Pass.
- J3: 16 confident, 16 right (100%). Pass. Middle band: 1 item, t13 at p 0.22 (right answer no; Jev said no).
- Overall: PASS.

By kind (all right): wrong-label 4 of 4 (t05 to t08, the "Early Departure" alert versus scheduled-time trap), row/column 8 of 8 (t09 to t16), adjacency 1 of 1 (t18), presence 2 of 2, controls 2 of 2.

DeepSeek (information only): 17 of 17, hard 13 of 13, nothing unparsed.

Spend: Jev $0.000354 (8,419 input tokens). DeepSeek $0.004060, about 11 times Jev's. Total $0.004414.

## Spend across the trial

Jev $0.001411, DeepSeek $0.007781 (plus one unpriced dead call), about $0.0092 in all against the $0.50 cap. Plus one probe of 284 tokens (about $0.00001) before AMEND-1.

## What this does and does not show

- The reading: the new layout is what fixed the train page. Jev got the page at all only in data mode, and on that layout DeepSeek was also perfect. This is a READING, not measured: DeepSeek was never run on the old act train layout, so we do not know whether it would have failed there.
- Jev is accurate and cheap on these items, and its probabilities were honest on the 34 confident answers here (all right). It is not needed for accuracy: DeepSeek matched it wherever it ran.
- Not tested: DeepSeek on the act train page; DeepSeek on flights; the real flow (the drafting AI writing the questions from a job); any page beyond these three; Jev's calibration beyond our own items.
- n is 35 questions on 3 pages, written by the operator and checked by a second reader. A perfect score on a small set is a good sign, not proof, and cannot support a general claim. J3 reached its minimum count only because most answers were confident.
- Data mode is unpublished. Adopting it needs a $0 replay on saved pages first.
- The act layout still lacks row and column headers on each cell, which is why a layout change, not a judge, is the lever.

## Conclusion

The real win is barebrowse data mode. Adopt it once it is published, after a $0 replay on saved pages. Jev stays PARKED: the trial shows it is accurate and cheap, not that it is needed. Jev is closed and hosted, so it could only ever be an optional row, never a dependency.
