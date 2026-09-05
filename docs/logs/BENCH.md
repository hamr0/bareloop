# BENCH — bench pass results

Results ledger for the frozen two-row bench described in
`docs/product/BENCH-PREREG.md`. Read that document first — it is the only place the rows,
patients, money ceiling, n rule, signature rule, and decision rules are frozen. This file
holds only the rows the bench has actually produced.

| release | job | spec hash | seed | outcome | spentUsd (spendComplete) | wallMs | runid | n | notes |
|---|---|---|---|---|---|---|---|---|---|

| v0.19.1 + docs (G4 test fire, hamr 2026-09-05 — NOT a release-triggered pass) | `litectx-u-types` | `42a7c427…` | `96813a4` | green | $6.1772 (true) | 870,000 (14.5 min) | `u-mtotxw1z` | 1 | 1 step, no replan; G4 reading: DID NOT FIRE (cold green). Bridge stored only. |

Release-triggered passes: none yet since the 2026-08-30 freeze (v0.17.0 fired the
establish/re-baseline runs recorded in BENCH-PREREG, not ledger rows).
