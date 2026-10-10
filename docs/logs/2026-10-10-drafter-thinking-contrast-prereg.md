# Drafter thinking ON/OFF contrast — pre-registration (frozen 2026-10-10)

**FROZEN 2026-10-10, before any number exists.** Signed by hamr's word "go", in-turn,
2026-10-10. Nothing below loosens after a number exists.

## Why

Since the P7 job block, 4 of 13 drafter calls in live panel draft sessions were cut off at
the 32,000-token output cap (session smv2k6bczlvk3, run smv2k6bc, is among them). Before
P7 it was ~0 of ~40. All four were on the JSDoc rubric-style job, where line 1 cannot be
checked by a machine. The same job and wording gave 0 cut-offs in one session and 3 in
another. The likely cause is DeepSeek's hidden reasoning running long; the saved logs
cannot show it.

Commit 24effc9 added `draftCallOptions(provider, mode)` with mode `'default'` or `'off'`.
`'off'` sends deepseek-flash `thinking:{type:'disabled'}` (the F192 judge precedent). The
default is unchanged.

## Design

- Provider/model: DeepSeek, deepseek-flash. Drafting only — never signed, never run.
- Job: the hard JSDoc job, on the clean pulselog copy `pulselog-p7-ask`.
- Arms: thinking ON (mode `'default'`, today's behaviour) vs thinking OFF (mode `'off'`).
  4 drafts per arm, interleaved ON, OFF, ON, OFF, ... (8 total) so time of day does not
  skew it.
- Money: $0.50 cap per draft; $2.00 hard stop for the whole contrast. Expected ~$0.50–1.00.
- Measured per draft: number of answers cut off at the output cap; whether the draft
  reaches a signable job; number of tries used; cost.

## Decision rule (frozen)

Flip the drafter default to thinking OFF only if OFF has fewer cut-offs AND reaches a
signable job at least as often as ON, AND no new kind of failure appears under OFF.
Otherwise no change. If both arms show 0 cut-offs, that is a tie, and a tie means no change.

## Declared up front

- UNDERPOWERED: n=4 per arm can only show a large difference, not a small one.
- Plan QUALITY is not measured, only whether drafting finishes.
- A provider-red draft is a casualty, not evidence: re-probe the provider, do not count it.
- Frozen rules never loosen after numbers exist.

## Results

Results get appended below this heading in a later commit; the sections above never change.
