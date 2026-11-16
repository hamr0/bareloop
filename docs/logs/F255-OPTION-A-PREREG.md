# F255 option A prompt POC prereg (frozen before any paid call)

Question: does adding ONE rule plus ONE correct example to the close drafter's prompt (hamr signed option A, 2026-10-29) stop the DeepSeek drafter from putting the target file path (src/checks.js) into a count check's lineMatch / region anchor (F255), without raising the refusal rate?

Provider: DeepSeek, deepseek-flash, the panel's own Settings row (config.json copied read-only into scratch HOME .claude/scratch/f255-poc-a/home). Thinking unticked. Code at HEAD f41c12d (src identical to the previous POC's 1dc39c7 for the drafter path).

Patient: fresh copy per draft of .claude/scratch/e1-poc/battery/templates/pulselog/source-seed/tree. Job = the previous POC's Arm B job lines exactly (3 numbered lines; line 1 with two ~ rules), Inputs `repo: <copy path>`, Destination `src/`, $1 cap, 30 min. Fixed answers to questions identical to the previous POC (S / O / best reading; see rules).

Drive: createSession (src/panel/authorsession.js) headless, through the real drafting path, stopped at prepared / refused; the worker is never started. Both engine copies carry the same logging wrapper (records each declare_close declaration and each full sent prompt per call) and are otherwise byte-identical to HEAD src except the lever.

Arms (n=10 each, sequential, alternating O1,N1,O2,N2,...):
- OLD: .claude/scratch/f255-poc-a/engine-old = HEAD src + logging wrapper.
- NEW: .claude/scratch/f255-poc-a/engine-new = OLD + the lever below, in catalogueBlock() of src/authorflow.js (the prompt block that describes THE PARSER fields lineMatch / capture / aggregate / region / sign to the drafter), appended after the `sign` paragraph. Nothing else differs (to be proven by a byte diff of one OLD and one NEW sent prompt, in RESULT.md).

Lever, exact rendered text added to the drafter prompt (rule, blank line, example):

```
To count lines about one file or folder, keep lineMatch general (match the error line itself, e.g.
"error TS\d+") and put the file or folder in scope.includePrefixes. Never put a file path inside
lineMatch or inside a region anchor: once that file is clean the command still fails on other files,
nothing matches, and the check stops as a broken instrument instead of reading zero.

    {"kind": "count-not-worse", "params": {"cmd": "npm", "args": ["run", "typecheck", "--", "--strict"],
      "parser": {"terms": [{"lineMatch": "error TS\\d+", "capture": null, "sign": 1, "aggregate": "sum", "region": "whole-output"}]},
      "scope": {"includePrefixes": ["src/target.js"]}, "direction": "lower-is-better", "baseline": 0}}
```

Exact source diff between the two engine copies (authorflow.js, template-literal escaping shown as in source):

```diff
@@ -1072,7 +1072,16 @@
   region      "whole-output", or {anchor, capture} to search only inside the part of the output the
               anchor locates. A region that cannot be located is a broken instrument.
   sign        ${SIGNS.join(' | ')}. Subtraction is how you exclude things that were reported but did
-              not actually happen.`;
+              not actually happen.
+
+To count lines about one file or folder, keep lineMatch general (match the error line itself, e.g.
+"error TS\\d+") and put the file or folder in scope.includePrefixes. Never put a file path inside
+lineMatch or inside a region anchor: once that file is clean the command still fails on other files,
+nothing matches, and the check stops as a broken instrument instead of reading zero.
+
+    {"kind": "count-not-worse", "params": {"cmd": "npm", "args": ["run", "typecheck", "--", "--strict"],
+      "parser": {"terms": [{"lineMatch": "error TS\\\\d+", "capture": null, "sign": 1, "aggregate": "sum", "region": "whole-output"}]},
+      "scope": {"includePrefixes": ["src/target.js"]}, "direction": "lower-is-better", "baseline": 0}}`;
 }
 
 /**
```

Metric per draft: PATH_first, PATH_final (same definition and analyzer as the previous POC), REFUSED (final phase refused, any reason) plus the reason text. Secondary, reported without rule: --strict yes/no, questions, cost, outcome.

Known confounds, declared: scratch HOME has an empty learnings ledger; the example uses a placeholder file (src/target.js) so it does not name checks.js, but the example's shape (includePrefixes + general lineMatch) is the answer to the question asked, so a NEW improvement shows the prompt can steer the habit, not that the habit is gone in live sessions. n=10 is underpowered for small effects.

Frozen rules block sha256 (of .claude/scratch/f255-poc-a/rules-block.txt, reproduced below): 5fe1cee35b67cfc4affa49e07b874ca2a93176c9b2cb350e6efd83b9351e4b6e

```
RULES (frozen)
Metric PATH_first (per draft): 1 if the FIRST declaration the drafter emits through the author call (first captured declare_close invocation, f255-decls.jsonl line 1) has any count stage running typecheck whose parser lineMatch or region anchor contains "checks" (the target path); else 0.
Metric PATH_final: same test on the LAST captured declaration (author, revise-1 or revise-2). Same analyzer as the previous POC (.claude/scratch/f255-poc/analyze.py, copied to .claude/scratch/f255-poc-a/analyze.py).
REFUSED (per draft): 1 if the final phase is "refused" (any reason), else 0; the reason text is recorded.
PASS iff NEW PATH_first <= 1/10 AND OLD PATH_first >= 3/10 AND NEW REFUSED <= OLD REFUSED.
If OLD PATH_first <= 2/10: INVALID (the habit did not show in OLD); report, no verdict.
Otherwise: FAIL.
Underpowered: n=10 per arm cannot separate small effects; a PASS or FAIL is a reading of these 20 drafts only.
Casualties: provider transport errors / 5xx / phase error drafts are excluded and re-drawn, max 3 re-draws per arm, reported.
Cap: hard $1.50 total across all drafts including the probe (summed from real per-draft costs); stop before a draft that could pass it; drafts run sequentially, alternating O1,N1,O2,N2,...
Questions: a strict-vs-plain typecheck question gets fixed text S; an other-src-files question gets fixed text O; any other gets "Use your best reading of the job."; every question is recorded.
```
