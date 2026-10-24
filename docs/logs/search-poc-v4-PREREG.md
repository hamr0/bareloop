> Copied 2026-10-24 from .claude/scratch/search-poc4/ (untracked); scripts stay there: run.mjs, grade.mjs, dry.mjs.
# Search POC v4 — pre-registration (FROZEN before any number exists)

Question: for OPEN RESEARCH jobs, can `search: <site>` find candidate pages by the job's MAIN line, vet each page,
save only the kept ones, and do the SAME claim checks still grade right?
Follows POC v3 (`.claude/scratch/search-poc3/RESULTS.md`, Overall FAIL: same-host re-search 1/4). v4 drops the
re-search: the search runs once, at run start, and that run's kept pages are its evidence.
Design A (hamr 2026-10-24): the numbered job line IS the main ask; the `~` lines under it are the rest, checked later on claims.

## Flow (one search per case)
1. barebrowse library `connect({incognito:true, blockPrivateNetwork:true})`, goto the bare site, snapshot.
2. CODE picks the box (searchbox > combobox > textbox). One AI call writes `{"words": "..."}` from the main line; code types, Enter, waits, snapshots.
3. One AI call picks up to 5 result links (candidates); code drops non-links and gate-word names (pay, book, buy, send,
   submit, sign up, sign in, checkout, card). The results page itself is a candidate too.
4. VET each candidate: code opens it, snapshots; a page under the minimum size or a bot challenge is dropped.
   `runFitCheck` (src/fitcheck.js as on main) on that page alone, given ONLY the main line (never the `~` lines).
   KEEP the page if it holds at least one of the main line's asks; else drop it (never saved).
5. COVERAGE: code checks the kept pages together hold every ask of the main line. No coverage = case result `no-cover`.
6. SAVED SET = kept pages only, joined into ONE input text, each under `=== page N: <address> ===`, with its sha256.
7. Worker: one AI call gets the main line, its `~` lines and the saved set, and writes the step answer as a rubric fact
   file (claims, each with its quote), the same shape a rubric step writes today.
8. Grade with the REAL checker: `gradeStep` (src/rubricstep.js), a fact part on that one input, part shape copied
   from a real signed rubric spec on disk (no hand-made rule).
9. Can-fail: for each graded answer, code makes 2 broken copies of ONE real claim: (a) one number changed by +1,
   (b) the quote replaced by a real line from a DIFFERENT kept page that does not hold the claim's values
   (if only one page was kept: a line from the same page that does not hold them). Each graded alone.

Scope limit: turning `~` rules into checks is the existing drafting machinery, already proven on pasted pages; v4 does
not re-test it. The worker sees the `~` lines; the checker here grades the cited/number checks only.

## Provider and caps
DeepSeek `deepseek-flash`, thinking off, key from `~/.config/bareloop/.env`. Hard cap $0.80; cap hit = stop, FAIL (incomplete).

## Cases (information jobs only; 3 one-topic, 3 that need two sources)
1. duckduckgo.com — `1. Node.js releases with version and date` / `~ the last 3 releases`
2. google.com — `1. population of Portugal with the year of the figure`
3. duckduckgo.com — `1. tallest buildings in the world with height in meters` / `~ the 3 tallest`
4. duckduckgo.com — `1. latest Node.js release and latest Python release with version and date`
5. google.com — `1. population of Portugal and of Spain with the year of the figure`
6. google.com — `1. latest TypeScript version and latest Rust version with release date`

## Frozen pass rule
- CANDIDATES: in at least 5 of 6 cases, the kept pages cover the main line (step 5).
- ANSWERS: in at least 4 of 6 cases, the worker's answer passes the real checker AND answers every subject of the
  main line (two-source cases: both).
- CAN FAIL: every broken copy is rejected. One accepted broken copy = FAIL.
- PASS = CANDIDATES and ANSWERS and CAN FAIL. Blocked site / bot challenge = a miss, never excluded.
- Underpowered by design: n=1 per case. A PASS licenses a build spec, not a rate claim.

## Reported only
- Per page: kept or dropped, and which main-line asks it held. Per case: pages kept, cost (fit vs worker), saved-set size.
- Share of kept pages that hold at least one passing claim (reported, not a pass line: two good duplicate pages are not a defect).
- Whether two-source cases drew passing claims from more than one page.
