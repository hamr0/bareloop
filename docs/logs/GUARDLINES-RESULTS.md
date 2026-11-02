# GUARDLINES results (records; scratch tables copied)

## Round 1 (prereg 1b75452) - verdict FAIL
slot | final | draft cost | line-2 failure (frozen def.) | tries
OFF1 | prepared | 0.0405 | y (dup files-changed T1; job-line-uncovered L2 T2) | 3
OFF2 | prepared | 0.0361 | y (dup T1) | 3
OFF3 | plan-red | 0.0269 | y (dup T1; uncovered T2) | 3
OFF4 | prepared | 0.0418 | y (dup T1; uncovered T2) | 3
OFF5 | plan-red(signing gate) | 0.0411 | y (uncovered T1) | 3
OFF6 | plan-red | 0.0289 | y (dup T1; uncovered T2,T3) | 3
ON1 | prepared | 0.0259 | y (dup T1) | 3
ON2 | prepared | 0.0287 | y (dup T1) | 3
ON3 | plan-red(signing gate) | 0.0659 | y (dup T1; uncovered T3) | 3
ON4 | prepared | 0.0311 | y (dup T1) | 3
ON5 | prepared | 0.0356 | y (dup T1) | 2-3
ON6 | plan-red | 0.0358 | y (dup T1; uncovered T2) | 3
(+ OFF1 aborted at confirm menu, $0.0165, harness fix; counted in the $ total, not a row)
OFF plan-red 3/6, ON plan-red 2/6. Drafter used guardLines in ON (all 6) - the legal move is found; but the first try
duplicated the changed-from-seed guard in 12/12 drafts of BOTH arms, and ON3/ON6 still ended on job-line-uncovered.
VERDICT: FAIL - rule (1) ON 0/6 line-2 failures NOT met (ON = 6/6 by the frozen definition; 2/6 even counting only final reds);
rule (2) met (2 <= 3). Nothing built.

## Round 2 (prereg 9410fe8) - verdict PASS
Spend this round $0.2273 (cap $0.50), incl. ONB5 (stopped at a confirm-turn question before drafting; re-run once as ONB5b).
slot | final | cost | guard dup-kind | line-2 failure | other reds recorded | guardLines in accepted spec
ONB1 | prepared | 0.0683 | no | no | none | changed-from-seed+no-suppressions -> [2]
ONB2 | prepared | 0.0296 | no | no | F84 scoped count | same
ONB3 | prepared | 0.0344 | no | no | D5 "guard not in declaration" | same
ONB4 | prepared | 0.0240 | no | no | D5 (T1), check not run at start | same
ONB5b| prepared | 0.0252 | no | no | no-suppressions scope | same
ONB6 | prepared | 0.0311 | no | no | scope; D5 | same
ON2 plan-red 0/6; OFF (round 1) plan-red 3/6; OFF dup files-changed on try 1: 6/6, line-2 failure 6/6.
VERDICT: PASS - (1) guard duplicate-kind 0/6, (2) line-2 failures 0/6, (3) plan-red 0 <= 3.
Caveats: ONB5 replaced (harness did not answer a confirm question; not a draft). D5 reds in 3/6 suggest "never declare them" reads
as "omit them" - the build rewords to keep the guard stages as given.
