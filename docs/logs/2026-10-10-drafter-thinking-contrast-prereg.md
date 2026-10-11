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

### Run 2026-10-10/11 (DeepSeek deepseek-flash)

Run from HEAD 0862295. Driver: scratch script `draft-contrast.mjs` using the panel's createSession path. Patient: `pulselog-p7-ask` at f3206b2. Job text from the panel session smv2k6bczlvk3 card. Per-draft result JSONs are kept in the session scratchpad, not committed. Order interleaved.

| # | arm | phase | signable hash | tries | cut-off requests | question offered / asked | cost | wall |
|---|-----|-------|---------------|-------|------------------|--------------------------|------|------|
| 1 | ON  | refused | no | 3 | 0 | yes/no | $0.057 | 252s |
| 2 | OFF | refused | no | 3 | 0 | yes/no | $0.019 | 123s |
| 3 | ON  | refused | no | 3 | 0 | yes/no | $0.057 | 254s |
| 4 | OFF | refused | no | 3 | 0 | yes/no | $0.012 | 82s |
| 5 | ON  | refused | no | 3 | 1 (author call hit 32000 tokens, retried) | yes/no | $0.084 | 355s |
| 6 | OFF | refused | no | 3 | 0 | yes/no | $0.011 | 69s |
| 7 | ON  | refused | no | 3 | 0 | yes/no | $0.071 | 305s |
| 8 | OFF | refused | no | 3 | 0 | yes/no | $0.011 | 77s |

- Total $0.322 of the $2.00 stop. All 8 spendComplete=true.
- Thinking field present on 54/54 OFF-arm requests, 0/53 ON-arm requests.
- Draft-call completion tokens: ON 8,416-32,000 per call; OFF 6-3,372.
- All 8 refused with the same reason: "Nothing in the close fails on the repository as it is, so there is nothing for a run to do." In all 8 the try-3 question was offered in the schema and the drafter never asked one.

### Decision (frozen rule applied)

OFF had fewer cut-offs (0 vs 1), reached a signable job as often (0 vs 0), and showed no new failure kind. The rule says FLIP the drafter default to thinking OFF.

Caveats: the deciding margin is one cut-off; signable is 0/4 vs 0/4, so that leg is vacuous; plan quality was not measured; one job only.

Observed, outside the decision rule: OFF was about 5x cheaper ($0.013 vs $0.067 mean) and about 3x faster.

### hamr ruling 2026-10-11

Drafting-only thinking control, default OFF, exposed later as one Settings checkbox "thinking on" for all jobs (drafting only for now). Worker and judge unchanged.

### Separate observation (not decided here)

On this job the blocker is the drafter producing closes already green at seed and never using the offered try-3 question, not cut-offs.
