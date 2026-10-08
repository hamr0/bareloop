# Rubric (soft-green) learnings — a brainstorm folded against the record

*2026-10-06. Source: a brainstorm between hamr and a Claude session (tree-ab), with the fwd
session answering on fwdloop's HITL flow. This is a CONTEXT document on the RSI-LEARNINGS
pattern: it records the reasoning, the worked examples and the doubts. It changes no doctrine
by itself. The specs it led to are a DRAFT addendum under PRD item 33 ("2026-10-06 — rubric
job shape, DRAFT"), to be tuned with hamr before anything is ruled or built.*

## 1. Terms — eval, arbiter, rubric are three layers

| Term | School-exam picture | In bareloop |
|---|---|---|
| eval | "the exam", in general | not a bareloop term — the industry word for any test of model output |
| arbiter | the examiner who says pass or fail | the **close** — the list of stages that runs after the worker; it alone decides the verdict, and the worker cannot argue with it |
| rubric | the marking scheme for essay questions | the **rubric card** read by ONE kind of stage (`judged-floor`), used only when a command cannot check the bar |

Arbiter ⊃ stages ⊃ (sometimes) one rubric stage. A green job's arbiter has no rubric at all
(e.g. `pulse-again`: six commands — `tsc`, `npm test`, counts and exit codes).

## 2. How the judge works today

- **LOCATE / DECIDE split** (`src/judged.js` header). A pinned cheap model is asked only for
  facts and verbatim quotes, never "did this pass?". `decide()` is plain code over an owned,
  enumerated rule table.
- **Unsure = red.** Missing facts, a parse failure, truncation, or a quote the artifact does
  not contain all decide red. Deliberately not a partial-credit model.
- **The rulebook is ours and tiny**: `has-doc`, `params`, `returns` — all JS doc comments.
  A rule we do not implement is inexpressible on a card.
- **The ceiling**: the pipe catches violations of STATED card items only. An omission the
  card never named, and a lie that needs an oracle, fall through to the human at the end.
  The fix for a miss is a new card line and a re-sign — never a smarter judge.

## 3. Calibration — what it adds, and the doubt

**What it is.** Testing the examiner before letting them mark real exams: the whole pipe
(judge model + prompts + rule code + the signer's card) grades 10 cases whose right answer is
already known, at authoring time, before the job can be signed. Floor 10/10, right verdict
AND right reason (`(rule, fn)` match). It does not re-run on every job run.

**Worked example** (card item: rule `has-doc`):

```js
/** Adds two numbers. */
function add(a, b) { return a + b; }

function sub(a, b) { return a - b; }
```

Expected: red, `has-doc`, `sub`. The judge quotes `add` → `/** Adds two numbers. */`,
`sub` → none; code checks the quote is real; `decide()` → red on `has-doc`/`sub`; matches →
case passes. A red on `add` would FAIL the case: right verdict for the wrong reason is luck.

**What it adds.** Without it, the first sign of a broken judge is a run that passed when it
should not have — and a false pass is silent. Calibration catches, before any real run:

| What goes wrong | Example | Caught by |
|---|---|---|
| judge quotes the wrong line | `Base fare: $349` and not `Total: $409` | a "$349 + fees" case grading pass |
| the card is vague | "under $400" with no word on fees | same case — the signer meant total |
| judge model too weak | reads `11:40 PM` as morning | the red-eye case grading pass |
| a bug in the rule code | 12-hour time, PM wrong | the red-eye case again |
| the signer's own card contradicts itself | "under 600 words, 250ish each" (3 × 250 = 750) | every honest case fails |

It adds little when the output is structured data (`{"total": 318.40, "stops": 0}`): plain
code checks it, nothing to calibrate. It earns its cost only because a model reads free text.

**The doubt (hamr's, shared).** Model-drafted cases are partly circular — a model writes the
test, then a model passes it — and drift toward the easy, obvious cases. And calibration runs
ONCE: a judge right 90% of the time can score 10/10 on a single pass by luck (the POC already
measured `paramNames` drifting between reps on the same file).

**The alternative: calibration by mutation.** Take a real, known-good artifact built from the
job's real source; make one deterministic edit per card line; the expected answer is known by
construction — nobody labels it, no model proposes it. Same move as pulselog's mutation-tested
privacy invariant (plant the leak on purpose, prove the check catches it).

| Mutation | Expected answer |
|---|---|
| original | pass |
| delete the JSDoc above `sub` | red, `has-doc`, `sub` |
| `Total: $318.40` → `$409.00` | red, price |
| add a second flight segment | red, nonstop |
| drop the total, keep the base fare | red, price (unsure) |

Mutation measures the one judge error quote-checking cannot: did it find the RIGHT line, not
just A line that exists.

## 4. Repetition — averaging vs. a disagreement alarm

- **Averaging** (llm-as-a-verifier): ask K times, average the scores (14, 17, 12 → 14.3).
  Needs a score. bareloop has none to average.
- **Disagreement alarm** (fits bareloop): ask twice; if the answers differ (`Total: $318.40`
  vs `$349`) → unsure → red. Same doctrine as unsure = red.
- **Where it helps most — calibration**: grade each case N times (e.g. 3 → 30 gradings),
  require all correct. Turns "it passed once" into "it is stable".
- **Live runs**: the alarm fails the stage. It never opens a question to a human mid-run
  (fwd's line, §7).
- **Cost**: each repeat is a paid judge call — cents on a cheap model, inside the job budget
  that already funds the judge. Today bareloop's only retry is for unreadable output
  (`JUDGE_ATTEMPTS`).

## 5. Against llm-as-a-verifier (github.com/llm-as-a-verifier/llm-as-a-verifier)

Not adopted — hamr's direction is our own judge, validated. Recorded because the comparison
sharpened the design. Its aim is to RANK candidate trajectories; ours is to GATE one result.

| | llm-as-a-verifier | bareloop |
|---|---|---|
| uncertainty | measured — logprobs over score tokens | collapsed — unsure = red, no partial credit |
| repetition | K passes, averaged | not today; proposed as a disagreement alarm (§4) |
| granularity | 20-point score | pass/red, but every red itemized `(rule, fn)` |
| decomposition | C criteria | card items × functions (or × steps, §6) |

## 6. What rubric jobs are for

**Scope.** Rubric is not for code jobs. It is for research and search: fetch from the web or
read local sources, a judge checks each step along the way, one human accepts or reruns at
the end. A human needed mid-flow → that job is fwdloop's.

**Good fit**: the output comes from fetched pages or given files, every claim can be quoted
from a source, and the human only needs to approve the final result.

| Job | A `~` line it would carry |
|---|---|
| search with conditions — flights, hotels, apartments, used cars | price under $X, quoted from the listing |
| job search | remote, salary ≥ $X, posted in the last 7 days, each quoted from the posting |
| buying research | laptop ≤ $1200 with 32 GB RAM, quoted from the maker's page |
| tool / vendor comparison | license, price, latest release, each quoted from its own page |
| research brief | every claim cites a fetched source that contains the quote |
| company due diligence | funding, headcount, lawsuits, each with its source |
| grant / tender finder | deadline after today, eligibility line quoted |
| writing against a source (resume vs JD) | every claimed match quotes the resume AND the JD |

**What to promote it for: "research you don't have to fact-check."** Deep-research tools
already search; their weakness is invented or wrong citations. bareloop's angle: every fact
quoted from a page it actually fetched, code checks the quote, you approve once. Strongest
form uses the job file's existing `cadence` — **recurring watch jobs** ("check daily; tell me
when a nonstop LAX→SFO under $400 shows up"), silent when nothing matches, like pulselog.

**Not a fit — greenfield ("build me X from scratch").** Every close compares against the
seed; an empty repo gives nothing to compare. The workable middle: a human (or Claude Code)
writes the skeleton and failing tests, and bareloop's job is "make them pass without touching
the tests". Interactive, unclear-spec work stays with an interactive agent.

## 7. fwd's input — fwdloop's HITL, and the line with bareloop

Answer from the fwd session, 2026-10-06 (read-only, about fwdloop):

- fwdloop's ask is a SIGNED line in the human's prose (`ask 30m: check it with me`); the
  drafter cannot add, drop or move one. At the ask the runner parks and exits ($0 while
  paused); the human answers accept / redo / rerun. Accept binds the **artifact's sha256**,
  not a verdict; the send ships exactly that artifact. Code: fwdloop `src/ask.js`
  (`answerAsk` :446), `src/runner.js` (`resumeRun` :1705), `src/send.js`,
  `src/signed-text.js`; ladder M1 amendment 3, M4b amendment 3; FINDINGS F43, F44.
- **The machine never creates an ask.** A judge's unsure or a disagreement alarm can only
  halt red, or ride as evidence into the next signed ask downstream.
- **A judged step needs a human after it**, checked mechanically at sign. For bareloop that
  human is the end-of-run door (accept / rerun), which every rubric job already has.
- **Happened-check before any judge**: artifact exists, non-empty, typed `done` boolean.
  Non-empty alone never proves a step happened.
- **Provenance**: inputs pinned by frozen copy + sha256 at job start; the judge cites the
  frozen inputs, never agent-written text.
- **Third outcomes named** — crash, unparseable, unpriced; unparseable = red, never green.
- fwdloop's standing v1 rule is no LLM judge (soft-green there = a human-declared shape). In
  bareloop the judged floor is built; the two products differ here on purpose.
- Unresolved: fwd's "a correct red on a clean input counts as a catch, not a miss" (for
  scoring calibration) — meaning not yet clear; ask before using it.

## 8. Worked examples

**Flight — LAX→SFO, under $400, nonstop, no red-eye.** The judge must read something the
worker cannot write (the arbiter's own record of the fetched page — PRD item 33 already rules
this), never the worker's summary. Checks: route quoted; TOTAL price < 400; exactly one
segment; departs 06:00–21:00. Calibration cases include the trap "$349 + fees" with no total
→ red (unsure), because a loose judge would pass it. Booking itself is never bareloop's
(irreversible, payment); the run finds and verifies, the human books. Also: every one of these
criteria is a number — given structured data, one `jq` would check it with no judge; the judge
earns its place only because the page is text for people.

**Resume vs JD** (hamr's step-shape example, reviewed):

```
1 Read my resume
~ names, roles and dates found
2 Read the JD to compare it against
~ requirements listed
3 Write a summary resume: how it matches the JD, work history blurb,
  professional skills, soft skills
~ 3 sections, under 600 words, each match quotes a resume line and a JD line
4 Write it out
~ file written to destination
  ── built in: you accept or rerun before anything is final ──
```

What the review found in the original draft: (a) "under 600 words, 250ish each" contradicts
itself; (b) not every `~` needs a model — word and section counts are code; (c) the real risk
(inventing experience) had no `~` line — the citation line is it; (d) the explicit `Ask` and
"nothing goes out before I accept" lines go away — the end door is built in; (e) the parser
must not read a `4>` inside step text as a new step.

## 9. Built-in checks and where they show

Five checks every step gets, none written or removable by the signer: **happened** (output
exists, not empty, not cut off), **cited** (every quote is verbatim in the source), **frozen**
(the judge read the frozen, hashed copy), **clean** (the judge answered — no crash,
unparseable or unpriced), **agreement** (two reads matched). Plus, at the end, **you accept**.

They show in three places, each answering a different question:

| Where | Question | Form |
|---|---|---|
| authoring, under the Job box | what will be checked? | one locked legend line |
| Run tab, step list | did it pass? | chips per step — `(happened) (cited) (frozen) (clean) (agreement)` + the `~` checks, green/red, legend at the top |
| Audit / logs tab | what's the proof? | each judge call as a row: quote, source, the source's sha |

```
3  Write a summary resume…                                    ✗
   (happened) (cited) (frozen) (clean) (agreement)
   ~ 3 sections ✓   ~ under 600 words ✗ 742   ~ quotes resume + JD ✓
```
