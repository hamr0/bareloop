# MAP — first-read map of a big file: pre-registration (SIGNED 2026-10-31, frozen; no number exists yet)

Status: SIGNED by hamr 2026-10-31 ("signed 2"); frozen before any number.
Sources: `.claude/scratch/a-map-read/READ.md` ($0 archive read, 13 bigfile runs), HARNESS2 section 9 item A, F262, `docs/logs/SEEDGAP-PREREG.md` (same style and held-fixed arms). Rulings carried over: one lever at a time; throwaway engine copy, never product code, until a result; the ON/OFF switch enters the signed hash, the text does not. hamr ruled 2026-10-31: build the map in bareloop over litectx `getNode(path).chunks`; ask litectx for an `outline(path)` primitive later, only if this works.

## Question

If the first `shell_read` of a big file in an ask returns a map (symbol and line range per part) instead of file bytes, do workers on bigfile make fewer failed `ctx_get` lookups (no-chunk) and use fewer turns?

This is declared a COST lever, not a green lever. READ.md: with the seed note, workers already open `_resourceFromRule` with a valid `ctx_get` in 6 of 8 asks and wrote in only 3. The map hands out exact handles; it does not make the worker recognise a one-character defect.

## Riskiest assumption

That the 41% no-chunk rate (97 of 234 `ctx_get` calls, 13 archived bigfile runs; the worker types a range it computed instead of copying a handle) is caused by not having the handles, and that a map in the first read removes it. Not assumed: that the worker uses the map, or that it then writes. Also open: a map may just add one read (the worker asks again for the whole file).

## The change (ON arm)

In the read shim (`src/readshim.js`). No new tool; the tool menu is unchanged. Experimental spec field `readMap` (default OFF while experimental; true = on); it folds into the spec hash like `seedNote` did.

When ON, the FIRST `shell_read` in an ask of a file that is 200 lines or more AND not a test file (path segment `test/`, `tests/`, `__tests__/`, or name `*.test.*` / `*.spec.*`) returns a map instead of file bytes:

- header: `<path> (<N> lines) — map, not the file:`
- one line per named chunk: `symbol start-end`
- a chunk that CONTAINS another named chunk is left out (e.g. `Gate 579-2212`, a 1,633-line class chunk where `ctx_get Gate` would return the whole class)
- footer: open a part with `ctx_get <path> <start>-<end>`, or read again for the whole file
- capped at 4,000 characters, with a `+N more` line when cut

Rules:

- The SECOND `shell_read` of the same path in the same ask is today's behaviour (whole file, paged as now).
- No litectx index, or no named chunks for the file: today's behaviour, and a report-only spine record says why.
- The shim never marks the file delivered when it serves a map (over-delivery is acceptable, a false "already delivered" is not).
- A `ctx_get` with a map line's exact range must open that chunk. Checked at $0 on bigfile before any paid run (every map range matches a chunk handle); if one does not, the build stops there.
- Spine: one report-only `read-map` record per map served (path, lines, symbols, chars). Counts only, no text.
- The index is built at run start when `readMap` is on (HARNESS2 NEXT 2c), so the map never waits on a ctx tool being granted.
- Expected from READ.md: gate.js map is 51 named symbols, about 1,100 chars. Test files get no map because litectx names almost nothing in them (`test("...")` callbacks).

## Patient, provider, held fixed

- Patient: `bigfile` (h1-bigfile, bareguard copy, one planted character in `_resourceFromRule`, src/gate.js), same as SEEDGAP. Seed state checked clean before launch.
- Provider: Fireworks, Settings row `FIREWORKS_API_KEY`, model `accounts/fireworks/models/deepseek-v4p1-flash`. Every paid run states provider and model in its first line. Probe the model with 2 consecutive 200s before firing.
- Held fixed in BOTH arms: seed note ON, carry memo ON, handoff note ON, learnings OFF, read shim at product default, thinking per the one rule. Record the commit sha and this state per run in the results file.
- Wall time: the operator-set value used in the SEEDGAP battery, recorded per run.

## Arms and n

- OFF 3, ON 3, interleaved (OFF first, then ON, alternating).
- Per-run cap $1.00. Total stop $3.00. Expected spend about $1.50-2 (SEEDGAP, 6 runs, was $1.40). Cap-not-estimate: a run that hits the cap stops; no widening.

## Measures

PRIMARY: pooled `ctx_get` no-chunk rate per arm = no-chunk calls / all `ctx_get` calls, worker asks only (scout and close-fix excluded), counted from the real gate audit (run_id-scoped), pooled across the arm's 3 runs. Baseline for reference only, not a decision input: 41% (97/234) over 13 archived bigfile runs, which mixed arms and counted scouts.

SECONDARY (reported, frozen direction: lower is better):

- worker rounds per ask until the first valid `ctx_get` that opens the plant `_resourceFromRule` (lines 2184-2188)
- total worker turns per run
- booked cost per run

REPORT-ONLY, never read as a win or a loss: greens; writes per ask; maps served and their sizes; second-read (fallback) rate after a map; any `shell_read` of gate.js after a map; planner rounds; wall time.

## Delivery check

Every ON run serves at least 1 map (`read-map` record); every OFF run serves 0. Otherwise that run is unreadable (casualty). Also byte-diff the shim's first-read output for gate.js between arms before reading any result: two should-differ arms with identical reads mean the map never reached the worker.

## Decision rules (frozen at sign)

- SIGNAL: ON no-chunk rate is at most half of the OFF rate AND the ON arm has at least 10 `ctx_get` calls. Read as "a first-read map cuts failed lookups on this job", n=3, one patient. Next step is a larger n or a second big-file job, and the `outline(path)` ask to litectx; not a default flip.
- FAIL: ON rate above half of OFF, with the ON arm at 10 or more `ctx_get` calls. Lever closed for this job; finding is "the map does not cut no-chunk on bigfile".
- UNREADABLE: the ON arm has fewer than 10 `ctx_get` calls (workers did not use the handles). Report why (they read whole instead? second-read rate?). No rerun to rescue it.
- Secondaries do not enter the rule. A fall in turns or cost with no fall in no-chunk is reported next to the primary, not read as a SIGNAL.
- Default stays OFF unless hamr rules after the result.

## Casualties

Provider-red, transport failure, a 429 that ends the run, or a failed delivery check: casualty, excluded from the denominators and replaced once; never evidence. 2 provider-red in a row: stop and re-probe the provider. A run stopped by its cap counts normally (it is a result).

## Underpowered, declared now

n = 3 per arm, one job, one patient, one model. UNDERPOWERED. A SIGNAL is a leaning, not proof. No percentage claim beyond "this arm's rate".

## What is NOT claimed

- Greens. The map is a cost lever; the remaining gap (recognising the one-character defect) is untouched.
- Anything beyond bigfile and this model. Other jobs, other models, test-heavy files (the map is not built for them) are untested.
- The M2 tools (`ctx_compress`, `ctx_peek`, `ctx_stash`): dropped. READ.md: all three are 0 of 1,354 bigfile calls; peek and stash have nothing to fix when every worker starts fresh.
- That the map finds the failing test: litectx names almost nothing in test files, so grep or the seed note still connects the title to a name.

## For hamr to confirm at sign

1. `readMap` default OFF, experimental; first read only, 200 lines or more, non-test files.
2. Primary = pooled no-chunk rate, worker asks only; SIGNAL at half or less with 10 or more ON calls.
3. n = 3 per arm, caps $1 per run and $3 total, Fireworks deepseek-v4p1-flash.

Signed: hamr ("signed", 2026-10-31)

---
sha256 of this file above this footer (frozen, never edited again): 4d4dfa2732d05112ac640d9cf2c8c45cfddb5c12c1c9622ac72844190e3f1b24
