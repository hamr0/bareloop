# F255 POC prereg (frozen before any paid call)

Question: is the DeepSeek drafter's habit of putting the target file path (src/checks.js) into a count check's lineMatch / region anchor (F255) caused by (A) the job wording/form (today's three numbered job lines with ~ rules) or (B) a code change since 2026-10-23?

Provider: DeepSeek, deepseek-flash, the panel's own Settings row (config.json copied read-only into a scratch HOME). Thinking unticked. Current code at HEAD (1dc39c7).

Patient: fresh copy per draft of .claude/scratch/e1-poc/battery/templates/pulselog/source-seed/tree (git 0e32c16).

Arms (n=5 drafts each, run sequentially):
- Arm A: ONE job line, the old goal paragraph verbatim: "Run the type checker in strict mode with no emit and confirm zero errors in src/checks.js, confirm no new type errors in any other file under src/ against the pre-change baseline, and run the existing test suite to confirm every existing test still passes."
- Arm B: today's job lines exactly (3 numbered lines; line 1 with two ~ rules: "Do not add @ts-ignore, @ts-expect-error, or any casts to any." and "Do not change tsconfig.json or package.json.").
- Both: Inputs `repo: <copy path>`, Destination `src/`, $1 cap, 30 min, thinking default.
- Fixed answers if asked: strict-vs-plain question -> S: "Use the stricter run: npm run typecheck -- --strict. Target is zero errors from it in src/checks.js. Do not change tsconfig.json or package.json to get there; fix the code in src/checks.js." Other-src-files question -> O: "Other files under src/ may change if needed, but keep changes there small and only to support the fix in src/checks.js." Anything else -> "Use your best reading of the job."

Drive: the panel's real drafting path, createSession (src/panel/authorsession.js) called headless from a node script, in a throwaway engine copy under .claude/scratch/f255-poc/engine/ whose only change is a logging wrapper that records each drafter declaration (the draft log does not store it). Each draft stops at the prepared (signing gates run) state or a refusal; the worker run is never started.

Secondary (reported, no rule): PATH on the final declaration; seed-read outcome; typecheck args (with/without --strict); questions; cost.

Known confounds, declared: scratch HOME has an empty learnings ledger (the live sessions may have had hints); the old specs carried goal prose, Arm A is an approximation of that, not the old code path.

Frozen rules block sha256 (of .claude/scratch/f255-poc/rules-block.txt, reproduced below): 1e2533b832ae15831fe0571bfac8c76222db4c5f5f4dee8e41dc71ee24b5b9fa

```
RULES (frozen)
Metric PATH (per draft): 1 if the FIRST declaration the drafter emits through the author call (first declare_close tool invocation of the drafting call labelled "author") has any count stage running typecheck whose parser lineMatch or region anchor contains "checks" (the target path); else 0.
Wording/form verdict: Arm A PATH <= 1/5 AND Arm B PATH >= 4/5.
Code-side verdict: Arm A PATH >= 3/5 (next step would be a bisect against older tags; NOT done here, only reported).
Anything else: INCONCLUSIVE.
Underpowered: n=5 per arm cannot separate small differences; any verdict other than the two extreme patterns above is not a result.
Casualties: provider transport errors / 5xx drafts are excluded and re-drawn, max 2 re-draws per arm, reported.
Cap: hard $1.00 total across all drafts including the probe; stop before a draft that could pass it; drafts run sequentially.
Questions: a strict-vs-plain typecheck question gets fixed text S; an other-src-files question gets fixed text O; any other gets "Use your best reading of the job."; every question is recorded.
```
