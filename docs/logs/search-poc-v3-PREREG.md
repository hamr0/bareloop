> Copied 2026-10-24 from .claude/scratch/search-poc3/ (untracked); scripts stay there: run.mjs, grade.mjs, dry.mjs.
# Search POC v3 — pre-registration (FROZEN before any number exists)

Question (the riskiest assumption under the signed search spec, ITEM33-BUILD.md addendum 2026-10-21):
does `search: <site>` reach a page that fits an information job, and does a second search (run start, Q2 a) land on the same host?
POC v2 (`.claude/scratch/search-poc2/RESULTS.md`) said: Overall FAIL by the frozen rule, 1 of 4 fit.

## Flow (the signed spec, steps 1-5, nothing added)
1. barebrowse library `connect({incognito:true, blockPrivateNetwork:true})`, goto the site exactly as a person types it (no ?hl / ?kl), snapshot.
2. CODE picks the box: first `searchbox`, else `combobox`, else `textbox`. None = case result `no-box`.
3. One AI call returns `{"words": "..."}`; code types, presses Enter, waits, snapshots the results page.
4. `runFitCheck` (src/fitcheck.js as on main) on the results page. fits = evidence.
5. Else one AI call returns up to 5 link refs; code drops refs not links in the snapshot and names holding a gate word
   (pay, book, buy, send, submit, sign up, sign in, checkout, card); opens each in order, fit check; first fits = evidence.
   A page under the minimum size or a bot challenge = not fitting.
Run-start check: each case runs steps 1-5 a SECOND time, fresh (new AI words). Recorded: fit or not, and the host of the fitting page.

## Provider and caps
DeepSeek `deepseek-flash`, thinking off, key from `~/.config/bareloop/.env`. Hard cap $0.40 for the whole POC; cap hit = stop, verdict FAIL (incomplete).

## Cases (one run each, two searches each)
1. google.com × List the last 3 releases of Node.js with version and date
2. duckduckgo.com × List the last 3 releases of Node.js with version and date
3. duckduckgo.com × List the last 3 releases of Python with version and release date
4. google.com × Give the population of Portugal with the year of the figure
5. duckduckgo.com × List the 3 tallest buildings in the world with their height in meters
6. google.com × List the last 3 releases of Firefox with version and release date

## Frozen pass rule
- FIT: search 1 reaches a fitting page in at least 5 of 6 cases.
- SAME HOST: of the cases that fit in search 1, search 2 fits on the same host in all but at most 1.
- PASS = FIT and SAME HOST. Anything else = FAIL. A blocked site or bot challenge counts as a miss, never excluded.
- Underpowered by design: n=1 per case. A PASS licenses the build; it is not a rate claim.

## Reported only (not part of the verdict)
- For each miss, the fit check's notFound list, split into instruction words (List, Give, last 3, ...) vs data words
  (version, date, price ...), to see whether misses come from the search or from the fit check's asks.
- Words typed, links chosen, links dropped by the gate, page sizes, cost per case.
