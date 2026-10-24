> Copied 2026-10-24 from .claude/scratch/search-poc5/ (untracked); scripts stay there: run.mjs, grade.mjs, dry.mjs.
# Search POC v5 — pre-registration (FROZEN before any number exists)

Same question and design A as POC v4 (`.claude/scratch/search-poc4/PREREG.md`). v4 said Overall FAIL
(CANDIDATES 1/6, ANSWERS 0/6). v5 changes exactly the two named causes plus one harness fault, nothing else:
1. ASKS FIXED ONCE: v4 ran the fit check per page, and each call split the main line into different ask strings,
   so coverage could not be counted. v5 makes ONE `runFitCheck` call per case with ALL vetted candidate pages as
   separate labelled texts (`texts`, which src/fitcheck.js already takes). The asks are split once.
2. MULTI-LINE QUOTES: v4's worker quoted the version line only; the date sat 3 lines lower, so every claim was red.
   $0 check before this file (real `gradeStep`, case1-saved.txt): a 4-line quote holding both values = green,
   version +1 = red, wrong date = red. v5's worker is told a quote may span several ADJACENT lines copied exactly,
   and must hold every value of the claim.
3. Harness: when going back to the results page fails, code goes to the recorded results address again (v4 case 5 crash).

## Flow (one search per case)
1. barebrowse library `connect({incognito:true, blockPrivateNetwork:true})`, goto the bare site, snapshot.
2. CODE picks the box (searchbox > combobox > textbox). One AI call writes `{"words": "..."}` from the main line; code types, Enter, waits, snapshots.
3. One AI call picks up to 5 result links (candidates); code drops non-links and gate-word names (pay, book, buy, send,
   submit, sign up, sign in, checkout, card). The results page itself is a candidate too.
4. Code opens each candidate and snapshots; under the minimum size or a bot challenge = dropped.
5. VET: ONE `runFitCheck` call, given ONLY the main line and every remaining candidate as its own label.
   For each found ask, code finds which candidate(s) hold its quote. KEEP a candidate that holds at least one found
   ask's quote; drop the rest (never saved).
6. COVERAGE: every ask of that one call that is not ignored (bare numbers) is found. Else case result `no-cover`.
7. SAVED SET = kept pages only, joined into ONE input text under `=== page N: <address> ===`, with its sha256.
8. Worker: one AI call gets the main line, its `~` lines and the saved set; writes the rubric fact file
   (claims, each `{quote, values:{subject, details}}`); told: copy the quote exactly, it may span adjacent lines,
   it must hold every value.
9. Grade with the REAL `gradeStep` and the SAME fact part as v4 (`.claude/scratch/search-poc4/grade.mjs`: two
   bind-only text facts `subject`, `details`; checks quote on input, each value in quote, each number in quote).
10. Can-fail: for each case with at least one PASSING claim, code breaks ONE passing claim twice: (a) one number +1,
   (b) the quote replaced by a real line from the saved set that does not hold the claim's values. Each graded alone.

Scope limit (as v4): `~` rules are not turned into checks here; the worker sees them.

## Provider and caps
DeepSeek `deepseek-flash`, thinking off, key from `~/.config/bareloop/.env`. Hard cap $0.80; cap hit = stop, FAIL (incomplete).

## Cases (as v4) and their frozen answer subjects
1. duckduckgo.com — `1. Node.js releases with version and date` / `~ the last 3 releases` — answer: at least 3 passing claims
2. google.com — `1. population of Portugal with the year of the figure` — answer: a passing claim naming Portugal
3. duckduckgo.com — `1. tallest buildings in the world with height in meters` / `~ the 3 tallest` — answer: at least 3 passing claims
4. duckduckgo.com — `1. latest Node.js release and latest Python release with version and date` — answer: passing claims naming Node.js and Python
5. google.com — `1. population of Portugal and of Spain with the year of the figure` — answer: passing claims naming Portugal and Spain
6. google.com — `1. latest TypeScript version and latest Rust version with release date` — answer: passing claims naming TypeScript and Rust
"Naming X" = X appears (case-insensitive) in the claim's subject value or its quote.

## Frozen pass rule
- CANDIDATES: in at least 5 of 6 cases, coverage holds (step 6).
- ANSWERS: in at least 4 of 6 cases, the frozen answer subject above is met.
- CAN FAIL: at least 4 broken copies exist (from passing claims) and every one is rejected. Fewer than 4 = FAIL.
- PASS = CANDIDATES and ANSWERS and CAN FAIL. Blocked site / bot challenge = a miss, never excluded.
- Underpowered by design: n=1 per case. A PASS licenses a build spec, not a rate claim.

## Reported only
- Per case: candidates, kept/dropped with the asks each held, the asks of the one fit call, cost (fit vs worker), saved-set size.
- Per passing claim: how many lines its quote spans and its length in characters (watch for whole-block quotes).
- Whether two-source cases drew passing claims from more than one kept page.
