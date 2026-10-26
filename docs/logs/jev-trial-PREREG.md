# Trial — Jev as a drafting-time "can you see this?" checker (rubric only): pre-registration

Frozen before any Jev answer exists. The sha256 of this file, and of `items.json`, are recorded in the commit that adds them. Nothing below
changes after an answer is read. A bad result is a FINDING. It is never a re-worded question and never a re-tune.

## Question

At drafting, after the AI has read the job and the page (as today), can Jev (TypeSafe, a typed yes/no classifier with a probability) answer
plain "do you see X on this page" questions about the SAVED page correctly, including the hard cases today's code cannot catch:

- the WRONG-label case (the page shows a time after the label, but the wrong kind of time: MBTA "Early Departure" alerts vs a station's
  scheduled times),
- row/column binding (a time in a timetable grid belongs to one station and one trip),
- adjacency ("does X come right after Y, with nothing between")?

And are its probabilities honest (when it says 0.9, is it right about 9 times in 10)?

Use, if it ever ships: drafting only, before the person signs. A confident yes keeps a check; no or unsure makes the rule Not checked or a
question to the person. It never reaches bareguard as a verdict (judges stay parked, bareguard ruling #50, hamr 2026-10-26).

## Set-up (frozen)

- Model: `jev-1.14.0` (pinned id, never an alias), `POST https://api.typesafe.ai/v1/systemone`, default context (no long-context header).
  Each page is one `state`; each item is one `noul` question with `instructions` and `criteria.true` / `criteria.false`.
- Pages (already saved, sha256 recorded in the POC folders, nothing refetched):
  1. MBTA Providence line timetable — `.claude/scratch/time-dryread-poc/dataC/train.page.txt` (sha256 72c216fb…)
  2. Moviefone San Francisco showtimes — `.claude/scratch/time-dryread-poc/dataC/cinema.page.txt` (sha256 c2ea8d0d…)
  3. Google Flights BOS to ORD — `tests/fixtures/idea-a/bos-ord.page.txt`
- Items: `items.json`, about 30 yes/no questions, about half true. Each item carries: the page, the question as Jev gets it, the RIGHT answer,
  and the page line numbers that prove it (or the reason it is false). At least 10 items are HARD: wrong-label traps, row/column binding and
  adjacency. Items are written from the page text and checked by a second reader against the cited lines before the freeze. Neither
  reader sees any model answer first.
- Comparator (information only, not a pass rule): the same items to DeepSeek `deepseek-flash`, thinking off, one call per page answering all
  that page's items as JSON yes/no, the product's provider row and price. This is "how the AI we use today does on the same questions".
- Cost cap: $0.50 for the whole trial (Jev about $0.003; DeepSeek about $0.03). Measured per call and printed.

## Decision rules (frozen)

- **J1, overall.** Jev (yes = probability >= 0.5) gets at least 90% of all items right.
- **J2, hard items.** Jev gets at least 9 of 10 HARD items right, or the same share if there are more than 10.
- **J3, honest probabilities.** Of the items where Jev is confident (probability >= 0.9 or <= 0.1), at least 95% are right. The count in the
  middle band (0.1 to 0.9) is reported. If fewer than 10 items are confident, J3 is UNDERPOWERED, said in the headline, and the trial cannot
  PASS on J3.
- **Control.** Two items are deliberately trivial (a word that plainly appears on the page, and one that plainly does not). If Jev misses
  either, the harness is suspect: stop and report UNREADABLE before any other number is read.
- **Overall.** PASS = J1, J2 and J3 hold. PASS leads only to a build-spec conversation with hamr (drafting aid, rubric only, optional provider
  row). It is not a build. FAIL = reported with every wrong item, its question, Jev's probability and the cited lines.

## Honest limits, stated before the data

n is about 30 items on 3 pages, so a PASS is a good sign, not proof. Questions are written by the operator, not by today's drafting AI. The
real flow (the AI writes the questions from the job) is a second step, only if this one passes. Jev's own calibration is unpublished, so J3 is
the first public-looking number we would have for it, on our data only.
