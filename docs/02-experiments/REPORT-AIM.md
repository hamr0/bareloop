# REPORT-AIM — is aim movable at all?

**Status: CLOSED. The answer is no — and the axis we spent seven arms measuring was never
connected to the thing we thought we were measuring.**

Date: 2026-07-14 · Model: `claude-sonnet-5` (fixed across every arm) · 151 samples · $4.99
Harness: `probe.mjs` / `probe-e.mjs` — **one Anthropic API call per sample. No bare-agent, no
tool loop, no gate.** Whatever this measures, it is a property of the model and the prompt, not
of our middle.

---

## 1. The question

Every real run of job #1 fails the same way: the worker traces the failing tests, walks **up** the
abstraction stack to the facade, and never descends **into** the imported helper where the planted
bug lives (`tokenize.js`, `keywords()`, `w.length >= 3` → `> 3`, which silently drops every
3-character query term). We called this **aim**, and before rewriting the loop as plan-v1 we
needed to know whether aim is movable by anything the arbiter is *allowed* to supply.

**The task.** The model is shown the close's output, the three failing test files in full, and
**one** source file. It is told plainly that it has not been shown every file. It must answer:

> Name the ONE file you would open NEXT in order to find the root cause of these failures.
> End your reply with exactly one line: `NEXT_FILE: <repository-relative path>`

**HIT** = the nomination names `tokenize.js` / `keywords` / `splitIdent`. Scored **only** from the
`NEXT_FILE:` line — never from a substring match anywhere in the reply. (This matters: the source
file we show *contains an import line mentioning `./tokenize.js`*, so a content-match grader would
fire on the prompt echoing itself.) Parse failures: 0/151. Truncated replies: 0/151.

---

## 2. The arms

| arm | file shown | close output | intervention |
|---|---|---|---|
| **C0** | `src/store.js` | names only | baseline |
| **C1** | `src/store.js` | names only | root-cause reframe (verbatim from the shipped `reframe()`) |
| **C2** | `src/store.js` | names only | force-the-descent (enumerate your imports, justify each) |
| **D0/D1/D2** | `src/index.js` | names only | same three, with the file whose line 19 **imports the buggy symbol** |
| **E0** | `src/index.js` | **+ assertion detail** | the close passes through what `node --test` already computes |
| **PC** | `src/index.js` | names only **+ hint** | **positive control** — the diagnosis, hand-written by me |
| **NC0 / ND2** | either | green | **negative control** — clean HEAD, suite passes |

The C-arms were confounded and the D-arms exist to fix it: the C-arms showed `store.js`, but the
tests import from `index.js`, so nominating `index.js` was a *defensible* next hop, not a failure
of aim. The D-arms show `index.js`, where `tokenize.js` is the only unexamined dependency carrying
the buggy symbol. **The confound made no difference** — see below, and that is the finding.

---

## 3. The result

```
arm                                      hits/n     rate     95% CI (Wilson)
C0  baseline           (store.js)          0/20     0.0%   [0.0%, 16.1%]
C1  root-cause reframe (store.js)          0/20     0.0%   [0.0%, 16.1%]
C2  force-the-descent  (store.js)          0/20     0.0%   [0.0%, 16.1%]
D0  baseline           (index.js)          0/20     0.0%   [0.0%, 16.1%]
D1  root-cause reframe (index.js)          0/20     0.0%   [0.0%, 16.1%]
D2  force-the-descent  (index.js)          0/20     0.0%   [0.0%, 16.1%]
E0  RICH CLOSE         (index.js)          0/20     0.0%   [0.0%, 16.1%]
PC  POSITIVE CONTROL   (diagnosis given)    5/5   100.0%   [56.6%, 100.0%]   p < 0.0001 vs D0
NC0 NEG CONTROL        (clean, green)       0/3     0.0%
ND2 NEG CONTROL        (clean, green)       0/3     0.0%

POOLED across every LEGITIMATE intervention (C0-2, D0-2, E0):  0/140
```

**0/140.** Nothing the arbiter may legitimately supply moves aim. The only arm that ever hits is
the one where I wrote the answer into the prompt.

---

## 4. Why the previous seven arms were unreadable

The hit rate is the boring part. **The nomination distribution is the finding:**

```
C0/C1/C2   (shown store.js)  → nominated src/index.js   20/20, 20/20, 20/20
D0/D1/D2   (shown index.js)  → nominated src/store.js   20/20, 20/20, 20/20
E0         (shown index.js)  → nominated src/store.js   20/20
NC0        (shown store.js, CLEAN REPO, GREEN SUITE) → nominated src/index.js   3/3
ND2        (shown index.js,  CLEAN REPO, GREEN SUITE) → nominated src/store.js   3/3
```

The model nominates **whichever of the two orchestration files we withheld**. Flip which file it
sees, and the answer flips with it — deterministically, 140/140, in both directions. Give it a
**clean repository with a passing suite** and it still nominates the same file, with the same
confidence, in the same words.

**So the nomination never carried any information about the bug.** It is a function of the
prompt's *structure* — "name the file you didn't show me" — not of the failure evidence. The dial
was not connected to the engine. Every previous arm (control, caching, retrieval, decomposition)
that we scored on this axis was reading an unconnected dial, which is why they all read the same.
**"Decomposition does not fix aim" (F24) is hereby withdrawn as a result.** It was never a
measurement.

This is the third instrument in this project that could not see its own variable
(ledger/cache-tiers, gate-audit/read-shape, harness/git-status). It is the same lesson, paid for a
fourth time: **decompose before you diagnose.**

---

## 5. The mechanism (why it rules the culprit OUT)

The model does not *miss* `tokenize.js`. Under the force-the-descent wrapper it **considers it and
explicitly rules it out by name**, e.g. D2#01:

> `ftsMatch`, `keywords` (from `./tokenize.js`) — used in recall for FTS matching; **not implicated**
> in W4 or reviewCandidates-threshold logic or recency-vs-recall logging.

It is triaging from the failing tests' **titles** — *W4 cross-tenant clobber*, *promotion
threshold*, *recency demand signal* — which describe three unrelated-sounding store features. From
titles alone, a tokenizer is genuinely not implicated. The reasoning is sound; the inputs are
wrong.

And `PC` shows what fixes it: told the one property the failing assertions share, it goes straight
down into the import, 5/5.

---

## 6. E0 — the honest counterpart of PC, and the one that mattered

PC's hint (*"every failing assertion involves a query term of exactly three characters"*) is the
diagnosis in prose. It proves the instrument can return a positive; it proves **nothing** about
any close a real job could run.

But `node --test` **already computes** the assertion detail, and our close throws it away, passing
the worker only the ✖ names. The three failures are one symptom:

```
"A's row survived B's same-id write"   actual []     expected ['A is 44']
"agent fact past threshold only ..."   actual []     expected ['fact:hot']
"recall found the fact"                actual false  expected true
```

**Every lookup comes back empty.** That reads as a retrieval bug — and the worker had never seen it.
So E0 passes the runner's TAP diagnostic through **verbatim**, and is otherwise **byte-identical to
D0** (asserted, not assumed: an identity audit compares the other three prompt blocks byte-for-byte
against `prompt-D0.txt`, and a leak audit confirms the close never says *tokenize*, *keywords*,
*length*, or *three*).

**E0 = 0/20.** Worse than a null: E0 does not even **mention** `tokenize.js` anywhere in its reply
(0/20), where the *force-the-descent wrapper* at least got it to 12/20. Handing the model the raw
`actual []` / `expected [...]` values did not move it one inch toward the retrieval path.

**The close-format lever is dead.** The gap between "the runner's evidence" and "the diagnosis" is
exactly the gap the model cannot cross, and it is the whole of the task.

---

## 7. The call

The pre-registered decision fires: **job #1 is the wrong benchmark, and we say so.**

Not because the model is weak, and **not because of bare-agent** — this probe never touched it.
Because job #1's defect requires a single inductive leap (*three failing assertions across three
unrelated features share one property: the query terms are short*) that the model does not make
from any input short of being told the answer, and **the arbiter is not allowed to tell it the
answer.** A benchmark whose only passing configuration is "leak the diagnosis" measures nothing we
are trying to build.

What this does **not** license:

- It does not say the loop is fine. F20 (unbounded attempt) and F21 (no ratchet) are real and
  fixed/open on their own evidence.
- It does not say plan-v1 is wrong. It says plan-v1 **cannot be evaluated on job #1**, because job
  #1 cannot distinguish a good workflow from a bad one — every arm scores 0.
- It does not retire the close-output doctrine. A close that names failures is still strictly
  better than one that hides them; it is simply **not sufficient**, and E0 is the receipt.

**What job #2 must have:** a defect whose root cause is reachable by *elimination* rather than by
*induction* — where reading the right file settles it, so that a workflow which reads more of the
right files scores higher than one that does not. Job #1 has no such gradient: you either leap or
you don't, and no amount of scaffolding produces the leap.

**Open and honest:** `PC` is n=5 and the negative controls are n=3. They are thin. The 0/140 is
not thin, and the nomination-distribution result (140/140 determined by which file was withheld,
including on a green suite) does not depend on either.
