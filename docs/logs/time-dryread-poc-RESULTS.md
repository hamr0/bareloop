# Time dry read POC: RESULTS (phases 1 and 2)

Pre-registration: docs/logs/time-dryread-poc-PREREG.md, commit 46574ab0cc849b28f4857ff3a95e50d6cf311274, sha256 8502f5a2217397b98a3581a3b306149d328909a3983101600eecb6d51cb008a9. Rule code timedry.mjs unchanged since phase 1. labels-C.json sha256 81d64415f121839480038b9a14e59619cb9efada2efd4db7bfe0679c8943a44a (verified equal before grading).

## Phase 1 summary (details: RESULTS-phase1.md)
- R1 PASS: 10 of 10 time labels of GREEN archived runs kept; the only drop ("at", 0 of 180 lines read) was in a step-red run.
- R2 PASS: JFK-LAX "Departure time" (no colon) 0 of 32 read, dropped as reads-no-time; "Departure time:" 32 of 32, kept.
- R3 PASS: dry read OFF keeps the F236 label (control can differ).

## R4: Data C (unseen pages, map labels the page rules KEPT, run once through the frozen rule)

| kind | label | operator verdict | candidates | green reads | dry read ON | OFF control | outcome |
|---|---|---|---|---|---|---|---|
| cinema (moviefone) | "3:30 PM" | BAD | 0 | 0 | DROPPED | kept | right (BAD dropped) |
| train (MBTA Providence) | "Departure" | GOOD | 74 | 74 | kept | kept | right (GOOD kept) |
| events (BBC fixtures) | "kick off" | GOOD | 12 | 12 | kept | kept | right (GOOD kept) |

Cinema: the kept fact carried 29 time-like "labels" (every showtime string). Run with the label alone and with all 29 kept words: both 0 candidates, 0 green, dropped (same result).
Wrong drops of a GOOD label: 0. BAD labels kept (misses): 0.
**R4 PASS** (no GOOD label dropped). Raw: results-C.json.

## Overall
**Overall PASS**: R1 PASS, R2 PASS, R3 PASS, R4 PASS (no wrong drop, no miss).

## Spend
Map calls for Data C: $0.027464 total measured, deepseek-flash, thinking off. Phases 1 and 2 grading: $0 (no model).

## Honest limits
- Data A and B are one site (Google Flights), and 14 of 15 archived specs share one label spelling ("Departure time:"). R1 and R2 are strong for that kind only.
- Data C is n = 3 pages, one label each. A pass is an anecdote, not a general claim.
- The train GOOD is weak semantically: the 74 matching lines are "Track Change Early Departure 5:17 AM" alert lines, not per-station departures from the timetable. It is GOOD by the frozen mechanical definition only; the rule would keep it, and a run would then check alert lines, not the timetable the person wanted. The rule cannot see that (it only asks "can the checker read a time after this label").
- The cinema label is a value ("3:30 PM"), not a label word: the AI mapped the times themselves. The drop is right, but the test exercises "no time follows" trivially (0 candidates) and does not test the grading step on that page. No BAD label with candidates but 0 green was seen on Data C; that case is covered only by the F236 fixture and the archived "at" label.
- No BAD label was kept, but with one BAD label the miss rate is unmeasured.
- The rule ignores signed bounds (windows), as dryReadMoney does; a label that reads but never inside the window is not caught here, by design.
- The POC code is throwaway and is never shipped; a PASS leads only to a build spec shown to hamr.

---
# Appendix: phase 1 detail
Pre-registration: docs/logs/time-dryread-poc-PREREG.md, committed 46574ab0cc849b28f4857ff3a95e50d6cf311274, sha256 8502f5a2217397b98a3581a3b306149d328909a3983101600eecb6d51cb008a9. Unchanged.
Rule code: timedry.mjs (imports the repo's real gradeStep and linesOf; no copied checker logic). The claim is signed as `{shape:'time', anchor: label}` with no `rule` bound (a window like 05:00-21:00 is not part of "can it read", same as dryReadMoney leaving the bounds out). Runners: run-A.mjs, run-B.mjs. Raw: results-A.json, results-B.json.

### Data A: 15 archived specs with a time fact (all Google Flights)
Labels: "Departure time:" x14, "at" x1. (PREREG also listed "departing": that is a DATE fact in smv73148pw343, not a time fact, so it is not in the data.) Outcome = last job-end in the session's own spine.

| session | job | label | run outcome | candidates | green reads | result |
|---|---|---|---|---|---|---|
| smv73148pw343 | flights1 | Departure time: | step-red | 45 | 45 | kept |
| smv76hqei3xq2 | flights2 | Departure time: | step-red | 45 | 45 | kept |
| smv7q1w53of5n | flights-3 | at | step-red | 180 | 0 | DROPPED |
| smvdfyexzv0vm | flights-bos-ord | Departure time: | step-red | 27 | 27 | kept |
| smve5pxqxw84p | flight-idea1 | Departure time: | green | 27 | 27 | kept |
| smvez1a4asm7k | flight-revised | Departure time: | green | 27 | 27 | kept |
| smvfly51dki7f | flight-revised | Departure time: | green | 27 | 27 | kept |
| smvfphezhwn5l | flight-revised | Departure time: | green | 27 | 27 | kept |
| smvh6zycqcqjy | flights-2 | Departure time: | green | 16 | 16 | kept |
| smvh7axzsav1i | flights-2 | Departure time: | green | 16 | 16 | kept |
| smvh7bxou4win | flights-3 | Departure time: | step-red | 16 | 16 | kept |
| smviejacde4qx | flights-a | Departure time: | green | 14 | 14 | kept |
| smvif0by4xpfx | flight-a1 | Departure time: | green | 14 | 14 | kept |
| smviiwey5mcgi | flight-a1 | Departure time: | green | 15 | 15 | kept |
| smvij5q3rx96z | flight-c1 | Departure time: | green | 22 | 22 | kept |

10 green runs, 5 step-red runs. 14 kept, 1 dropped. Every label with 1+ candidate in the 14 "Departure time:" rows read on every candidate (greens = candidates).

### Decisions
- R1 PASS. All 10 time labels of GREEN runs are kept (10 of 10). The one drop ("at", smv7q1w53of5n, 0 of 180 candidate lines read) belongs to a step-red run, so it is not a wrong drop; it is a correct drop of a label the run could not pass. Caveat: all 10 greens are one label spelling on one site, so this is weak evidence for general labels.
- R2 PASS. JFK-LAX page (tests/fixtures/idea-a/jfk-lax.page.txt), 32 candidate lines each: "Departure time" (no colon): 0 of 32 green, DROPPED as reads-no-time. "Departure time:" (colon): 32 of 32 green, kept.
- R3 PASS. With the dry read OFF (same code, same page), "Departure time" is kept (the 0-of-32 read is still measured and shown), so the harness sees the difference; with it ON the same input is dropped. POC readable.
- R4: not graded in phase 1 (Data C needs the model's map and the operator's GOOD/BAD labels, committed before the rule is run).

### Phase-1 verdict
R1, R2, R3 hold. Overall PASS still waits on R4.

### Data C prep (no model called)
See dataC/*.meta.json, dataC/fetch-log.jsonl.
- cinema: https://www.moviefone.com/showtimes/san-francisco-ca/ (redirects to /showtimes/theaters/san-francisco-ca/), 14,909 chars, sha256 c2ea8d0dce431c4a006903d24b3c3455785db2a548a630da96e2c178b599fc5a. Refused first: fandango.com (only site header and menus came back). Weak page: a theater list with bare time chips ("3:30 PM") and no per-time label word, so a time label here may legitimately be BAD.
- train: https://www.mbta.com/schedules/CR-Providence/timetable, 87,087 chars, sha256 72c216fb2f5678b329755f3f4cd7cdfe011dbffea4dc9bf16c9a66fb8c0e9f13. (caltrain.com fetched OK but held 0 clock times, skipped.) Times are bare cells under a trip column, row = station.
- events: https://www.bbc.com/sport/football/scores-fixtures, 24,631 chars, sha256 7a55eb89dd1467a8541a2901505d0a9ff99f73f3d958f2890652789e49540fdc. Per fixture the link text reads "... kick off 20:00 ...". First try espn.com/nba/schedule fetched OK but its only clock times were scoreboard tick marks (12:00 AM, 12:30 AM...), no start times: set aside as events-espn-rejected.*.
- map-C.mjs written, not run. Cost note: the train prompt is about 88,800 chars, so that one call costs more than the PREREG's "about $0.0003 a page" guess; script ceiling is $0.05 per page and the real cost is measured and printed.
