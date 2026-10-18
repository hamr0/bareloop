# What fwd should borrow from bareloop's rubric work (for fwd M10, real IO)

Written 2026-10-18 by the bareloop session, for the fwdloop session. hamr signs it on fwd's side.
Source tree: bareloop branch feat/thinking-retries (HEAD 5766aea). Every file:line below was opened today.
F-numbers are in docs/wiki/FINDINGS.md. Idea A core spec: docs/product/ITEM33-BUILD.md (called ITEM33 below), section "Idea A core: build spec" at line 1134.

hamr's goal, his words: a job that checks something online (flights shape), with actions and hitl. "hitl is rubric with hitl". It checks the page and asks. Same for a local sheet when a citation is not found. "Borrow what fits our work."

Fit to fwd's rules (kept, not contradicted):
- The AI side is drafting-time only. It names words. It never grades.
- CODE decides every check and every ask. No LLM judge. The machine never invents a check.
- Trigger, cap, ask position, allow-list, send target stay signed arbiter data. A borrowed piece may add words to a step's check. It may never add an ask position.

---

## 1. What to borrow, item by item

### 1.1 The AI page-word map (src/pagemap.js)
- What: ONE paid call per page input. The AI maps each job line and each `~` rule to the page's OWN words. Answer form is JSON facts: name, from (line N / line N rule M), shape (place, money, time, phrase), words, currency list, unit list (prompt src/pagemap.js:36-52, parse :56-70).
- The prompt tells it: never grade, never invent, copy from the page character for character (src/pagemap.js:28).
- No JSON repair. Malformed twice = plain stop, nothing signed (src/pagemap.js:76, 160).
- Why it exists: the older look picked labels from a code-made list, and that list could never hold a marker written after the number ("EUR490 total") (ITEM33:1142-1143, F226, F227). Real-page POCs found the AI finds a page's own words well (F226: "Leaves John F. Kennedy International Airport at", "From" with "US dollars").
- Adapt for fwd: keep it drafting-time. Its output is only a list of CANDIDATE words. Nothing the AI says reaches a typed close until the code rules below keep it. Raw answer goes in the draft log scrubbed (src/pagemap.js:107; seen live in draft-log.jsonl of session smve5pxqxw84p, label "page-map", cost $0.00032).
- Run it per input, including local files (ITEM33 design choice 2, line 1328).

### 1.2 Code rules that keep or drop each word (src/pagerules.js, one pure function `applyPageRules`, :135)
- Found-on-page. A word is kept only if the saved page holds it (count at least 1) (src/pagerules.js:154, 178). Why: the AI can name a word that is not there. Cheap and total.
- N2, per line. A label written 2+ times inside ONE page line is dropped (:248, measure at :48). Why: F228 "at" and F234 "-": an ambiguous label makes every honest quote red. Born from the signed-but-unwinnable runs mv7qabx4 and mvcur592.
- R1, same value. Extra labels survive only if they read the same set of values as the first listed one (:235-246). Why: F226 "any one alternative works" widened the check (an "Arrival time:" alternative let an arrival pass as a departure).
- U1 + R1L. A label that has a number right BEFORE it, never after (the "490 total" / "282 pp" shape) becomes a UNIT. A currency or unit form that reads a different set of numbers than the primary is dropped (:103-118, 182, 205-217). Why: F235 Airbnb ("total" comes after the price) and the guard's measured risk that `EUR` alone lets "Pay EUR0 today" pass a price rule (.claude/scratch/idea-a-pages/guard-answers-2026-10-17.md:6, 12 such lines on that page).
- S1. A fact name that counts results ("second flight") is refused: one result is one record, ask for N results (:122, 146-153). Two facts of one result may not share shape AND label (:284-290). Why: F234, six position-named facts in one changelog result, the run could not pass.
- Currency and unit LISTS on a money fact. Currency symbols only (the signs dollar, euro and pound), at most 3 currencies, 10 units, unit at most 100 chars (src/facts.js:28-30; cut by code and said, src/pagerules.js:219). A code like "EUR" is a unit (:213). Why: bareguard ruling #65, F228. Every listed form WIDENS the check, so R1L runs over the list.
- Adapt for fwd: all of these are pure code, no model, $0, run on the saved page. They fit typed closes as they stand. fwd only needs a `fact` shape to put the kept words in.

### 1.3 Not checked + a plain reason for every drop (src/pagedropwords.js, withDropNotes src/rubricstep.js:701)
- What: every word, fact or `~` rule the rules remove becomes a `dropped` entry with a reason code. One table turns the code into a plain sentence (src/pagedropwords.js:11-24). Nothing else may write a drop sentence.
- A `~` rule whose fact is gone goes to the step's `refused` list WITH its rule number; a drop tied to no rule goes to `notes` (ITEM33:1198-1203). Never a line-level refusal without a rule number (it would silence the other reds on the line).
- A drop of a word that leaves the fact still checkable is shown too (a narrower check is said).
- The drafter cannot bring a dropped word back: `rubric-fact-word-dropped` (src/factwords.js:91).
- Why: F238. On run mvdg1xo3's real labels the drops were SILENT: the "nonstop" rule ended unchecked and nothing said so.
- Adapt for fwd: this is the best fit. fwd already ends "anything fitting no close class falls to hitl". A dropped guardrail has two exits only: Not checked with reason, or a code-forced ask (section 2). Never silent.

### 1.4 Older pieces that matter
- Required facts: quote plus values, code decides per result. The worker must quote the page; code checks the quote is word for word on the saved page and reads the value with rules (ITEM33 Part 1b, line 551; F224: checker held, every planted wrong row red, every honest row green).
- Label must read a value of the right kind. Today code only does this for money and number facts (U1 drops "no value either side", src/pagerules.js:177-181). Time and text labels that read nothing are NOT dropped (V4 left out, F236, F237 "Departure time:" / "O" / "StaticText"). fwd should add it from day one for its own labels: see trap 5.1.
- Label repeats. M1: a per-result label must occur at least N times on the page, else it is a sort tab or a switch, not a result word (src/factwords.js:105, 119; ITEM33:897). M4: a "must say" phrase must repeat too (src/factwords.js:131; ITEM33:909). Born from live runs mv73swnx and mv76jhj1.
- Found-once proof. Every word a check depends on must be on the saved page, white-space blind (U+202F before AM/PM is one space) (src/factwords.js:1-10, 22-41).
- Page fetched at drafting AND again at run start; the close grades the run's OWN saved page, not the drafting copy (ITEM33:845-849; src/userrun.js:2606 refreezeUrlInputs; src/source.js:1344-1351). Why: prices change between draft and run.
- Page must be settled: wait for network idle, bounded (src/pagefetch.js:102; L1 ITEM33:869). An empty or header-only page is a $0 plain stop and is never asked about (L2 ITEM33:874; src/pagefetch.js:110-111).
- Code-forces the AI's number to be marked: a limit that is not in the person's own words must carry `aiProposal`, or it is a $0 red (src/rubricstep.js:611). A one-sided limit on an AI-made time is a red; it must be a `between` range (src/rubricstep.js:614). Card shows "AI's proposal - check it" (src/facts.js:215).

### 1.5 Left OUT of bareloop's core, and why (do not borrow yet)
- V4 (a label that reads no value is dropped, for time and text): frozen record only. In the core it fired on one page, the page it was written after (F238). hamr's rule: a rule comes back only when a live run fails for want of exactly it (ITEM33:1296-1297).
- R2 / R2a-c (grow a place label to the left so direction is checked): left out; F235 showed reversed direction is caught 0/10 without it. Known gap: a place that appears once has no per-result place check (ITEM33:1312).
- R3 / R3U (a page-once phrase and a record proxy): left out, same reason.
- pageClaims (page-level "this page says X once" checks, second `cited` check): left out. Page-level phrases are not checked (ITEM33:1314).
- Advice for fwd: the left-out rules cover direction and page-level claims. If the flights job needs "Boston to Chicago and not the reverse", fwd hits the same gap. Log it as a finding when it fails live; do not copy frozen rules fitted to one page (trap 5.3).

---

## 2. The two asks, in fwd terms

First, bareloop has THREE asks today, not two:
- I1 early ask on a rule the look could not find (src/authorjob.js:653-662, wording src/inputlook.js:317-336). Under the new page map this is DEAD: the map always returns `notFound: []` (src/pagemap.js:170). So its trigger never fires. fwd should not copy I1; section 2a replaces it.
- Confirm-turn ask: the confirm model may return `questions`; each is forced to be answered before Confirm or Type-the-goal (src/authorflow.js:2380-2397, used 2448 and 2467). Panel shows "A question the plan raised (i of n)" (src/panel/authorsession.js:548).
- Late ask (try-3), after two failed drafting tries: the last try may return questions; code keeps at most 2, each on a line the failed tries named (MAX_QUESTIONS src/authorflow.js:121, normalizeQuestions :164). Answer required, no skip; the answer is appended WORD FOR WORD as a `~` rule on the named line, then drafting runs once more and may not ask again (src/panel/authorsession.js:1026-1046, authorjob.js:765-781).

Both bareloop asks today depend on the MODEL choosing to ask. Evidence the model does not:
- F218: 8 drafts, the try-3 question was offered, asked 0 times; it cites fwd's own POC am26 (0 of 20 jobs). Your 0 of 40 agrees.
- Counter-datum, n=1, an anecdote: bareloop live run mve5y8fa (DeepSeek deepseek-flash, Google Flights BOS to ORD). The confirm turn raised 2 questions (relayed by hamr; I could not find the question text in any file of session smve5pxqxw84p, see the gap below):
  - "For 'not a red-eye': I propose flights departing between 06:00 and 21:00 - is that range right for you?"
  - "The input states prices with the label 'From' ... a starting fare - do you still want the under-$450 limit applied to that 'From' price?"
- Recommendation anyway: CODE forces the ask. Do not depend on the model choosing.

### 2a. Ask before paid drafting (confirm-card ask): meaning and reshape
When CODE fires it (proposal for fwd; each trigger is a code test, no model choice):
- T1, a number the AI made up. Any fact whose limit is not in the person's words (the exact test already exists: src/rubricstep.js:611, `aiProposal`; field src/facts.js:21). Fires for "not a red-eye".
- T2, a guardrail the page cannot hold in its own words. Every `~` rule whose map facts all dropped, or that the map tied to no fact (the `dropped` list, src/pagerules.js:135; no-label reason src/pagedropwords.js:20).
- T3, a page label that is not one of the job's own words. A money or number fact whose kept label does not occur in the job line or its guardrail text (example: the job says "price", the page's kept label is "From"). This is MY PROXY for the "From = starting fare" ambiguity. It is a code string test, but it is UNPROVEN: the live test in section 4 must show it fires on "From" and does not fire on every label. If it over-fires, fall back to T1+T2 only.
- Cap: at most 2 asks (bareloop's own cap, src/authorflow.js:121). Beyond the cap, the rest go to Not checked with reason. Never an unbounded interview.
- Never fires for an empty or unreadable page (L2).

Exact question shape (code writes the words, never the model):
- Line n, guardrail "<the guardrail as written>": <one plain sentence from a code table: "I propose <range or number>" / "the page writes this as <label> <example value>">.
- Options, a choice not free text: (1) yes, use it; (2) change the numbers (a short box, the person's own words); (3) leave it Not checked.
- bareloop's old wording for reference: "Line N, rule M - "<rule>": I could not find <words> in your input ... What do you mean by it? Your answer is added as a new ~ rule on line N." (src/inputlook.js:333).

How the answer becomes data:
- (1) yes: the fact stays; code stamps it confirmed by the person (new field BESIDE `aiProposal`, never a new value inside an enum, per bareloop doctrine). The card then reads "you confirmed", not "AI's proposal - check it".
- (2) change: the person's text is added WORD FOR WORD as a `~` rule on the SAME job line (src/panel/authorsession.js:1041). With 1-for-1 intake, guardrail n stays on line n. Because the bound is now in the person's words, the aiProposal test (src/rubricstep.js:611) stops flagging it.
- (3) leave: code writes a `refused` entry with the rule number (the withDropNotes path, src/rubricstep.js:701; reader :726). Not checked, with the reason "you chose to leave it".

Where it is recorded. bareloop's own GAP, stated plainly:
- Today the confirm Q and A are handed to the drafter as "QUESTIONS THE PERSON ANSWERED - these answers are binding" (src/authorflow.js:1219-1220) and kept on `confirmed.answeredQuestions` (:2460, :2477).
- The panel never records them: no write of them in src/panel/authorsession.js, no `answered` handling anywhere in src/panel/*.js. The only reader is the CLI signing readout (src/authorrun.js:1287, answeredQuestionLines src/authorreadout.js:139). The panel is the drafting surface; I did not verify the CLI path further.
- Checked on the live session: draft-log.jsonl of smve5pxqxw84p holds 43 lines and 0 mention "answer". The question text appears in no file of that session.
- The signed spec carries the conclusion only as DRAFTER PROSE in `closeDecl.notes` (resolved-spec.json notes[1] and notes[2]: "...is the AI's proposal the person confirmed", "...as the person confirmed"). That is model-written and cannot be trusted as a record.
- After the yes, the plan card still says "AI's proposal - check it" (src/facts.js:215 has no confirmed state).
- fwd should record from day one: draft log (kind ask: trigger, line, question, options, answer, timestamp) -> Audit fold (fits am29's diaries) -> signed job text "you confirmed ..." written by CODE from that log entry. Never the drafter's words.

### 2b. Late ask after two failed tries (try-3)
- When code fires it: ONLY after two drafting tries have failed, on a line a failed try named. Never first. Same cap of 2 and same plain wording table. Answer required, no skip (src/panel/authorsession.js:1026-1046).
- Which question: code-built from the failed try's red (the red names the line and the rule), not model-invented. bareloop still lets the drafter propose questions on try 3 (normalizeQuestions keeps only ones on lines the previous try's reds named, src/authorflow.js:159-175). For fwd, drop the model's option: code asks "line n: <red in plain words>. Reshape it how? (1) use <code-built alternative>, (2) your own words, (3) leave Not checked".
- Answer becomes a `~` rule on that line, word for word. Drafting runs ONCE more over the same inputs and may not ask again (src/authorjob.js:765-781).
- Recorded: same as 2a, plus the refused try's declaration already in the draft log (kind try-refused, src/panel/authorsession.js:580).

### 2c. The hitl ask at RUN time is not one of these
- A run-time check that cannot verify (quote not on the run's own saved page, value out of rule) must fall to the job's ALREADY SIGNED ask position, as a pure stop carrying the evidence (the quote, the page copy's hash, the code's reason). That matches "unjudged hitl output is carried as evidence into the next signed ask".
- Do not invent a new ask at run time. The drafting-time asks above exist so run-time surprises are rare.

---

## 3. Local-sheet case (CSV, docx; a citation not found)

What bareloop's front door accepts today (src/source.js):
- A rubric input file: absolute path, a regular file, not a symlink, not `.env` by name, at most 5 MiB (RUBRIC_INPUT_MAX_BYTES src/source.js:1231, checks :1285-1297), valid UTF-8, no NUL byte (:1296-1297).
- A CSV is text, so it is accepted. A .docx or .xlsx is a zip with NUL bytes, so it is refused: "not a text file - text files only for now" (hole H7, src/source.js:292, :602, :1297). Word and PDF readers are parked.
- The map runs for every rubric input, local files included (ITEM33 design choice 2, line 1328).

Honest limit of the borrowed code on a sheet:
- bareloop reads "label, then a value on the same line". A CSV header sits on line 1 and the values on other lines. That is the F237 shape ("Departure time:" on a different line from the result) which bareloop has NOT solved (ITEM33:1310). So the rules in 1.2 do not transfer to cells unchanged. fwd needs its own column reader. The DISCIPLINE transfers, not the code.

What fwd's cell/quote check should do instead of failing at run time (proposal):
- At drafting, code checks each needed fact against the sheet, $0:
  - each header or column word the job needs is found ONCE (found-once proof, src/factwords.js:22-41), white-space blind and case-careful;
  - under that column, a value of the right kind (number, date, text) exists in at least N rows (the M1 idea: a column must be present in as many rows as results asked for);
  - the column word is not duplicated (N2 idea: two columns with one header cannot say which value is meant).
- If a word is missing: code reshapes from what the sheet holds (a different column that passes the same tests) and ASKS (2a, T2 shape): "Line n: the sheet has no column 'Price'. It has 'Amount' with numbers in 40 of 40 rows. Use it? (1) yes, (2) your own words, (3) leave Not checked".
- If nothing fits: Not checked, with a plain reason from the table. Never a silent run-time fail.
- At run time, a cell quote not found in the run's own saved copy of the sheet falls to the signed ask (2c) carrying the row, the column and the code's reason.
- Freeze the sheet at run start, as the page is (src/userrun.js:2606): the close grades the run's copy.

---

## 4. First live test, BEFORE fwd builds anything

Hardest case, one job:
- Google Flights page, one-way, a route with at least 20 results (bareloop's saved BOS to ORD page has 27: F238).
- Guardrails: one with no page word ("not a red-eye"); one with a meaning ambiguity ("under $450" while the page writes "From 144 US dollars", the "From" = starting fare question); one "nonstop" (F237's dropped rule).
- One action that needs a human ask, declared as a signed ask position (for the test, a stub step "send the three flights to hamr": the ask fires before the send, and nothing is sent until the answer).

Stage A, drafting only, bareloop's built page map, about $0.004 a draft (cheap instrument first, per bareloop's measured-cost rule):
- Evidence for cost: run mve5y8fa's drafting was $0.003521 (draft-spend.json of smve5pxqxw84p), of which the page-map call was $0.00032 and the confirm call $0.00073 (draft-log.jsonl).
- Do 3 drafts of the same job. n=1 on a nondeterministic AI is an anecdote either way; 3 gives a base rate.

Stage B, $0, replay the ask triggers on the SAVED map (from draft-log.jsonl "raw" of smve5pxqxw84p, or a fresh one):
- Write the T1/T2/T3 tests as a small script over `applyPageRules` output. This measures the triggers without building fwd.

Stage C, one full run, only if A and B pass.

Pass/fail bar, written now, before any run:
- P1: the fetch is settled: the saved page holds at least 20 results. Else stop and log (L1/L2), not a bar failure.
- P2: every word the map names that survives is found on the saved page (code, 100%). Any kept word absent is a FAIL.
- P3: the asks. Code-forced asks fire for exactly these: "not a red-eye" (T1) and the "From" ambiguity (T3). Zero asks from a model choice. At most 2 before drafting. If T3 also fires on every other label, T3 FAILS and is dropped.
- P4: every `~` rule is either a check or a Not checked line with a plain reason. Silent drops = 0. Test: the set of removed words/rules equals the set of listed reasons (bareloop's own test shape, ITEM33:1261).
- P5: no signed fact reads nothing on the saved page. Check each signed label by an independent script, not the checker (F237 class). Any one is a FAIL.
- P6: the Q and A are in the draft log, the Audit and the signed job text (3 places).
- P7 (stage C): the three output values match the page: each quote is word for word on the run's own saved page and the price/time value equals the page's. Independent script.
- P8 (stage C): the action's signed ask fires once, as a pure stop, with the evidence carried. Nothing sent before the answer.
- P9: cost at or under $0.50 and 20 min.
- A green on a planted-cheat variant (a reversed route page, or a "Pay-0" style neighbour) is a row-invalid red flag, never a pass (bareloop's G2 rule).

Cost from real numbers:
- Success case: run mve5y8fa was green. The spine job-end says run $0.005420 (rounds sum to the same), drafting $0.003521, settled row in ~/.config/bareloop/runs.jsonl line 339 says $0.008941 total. Correction: hamr relayed "total $0.0054 incl. $0.0035 drafting"; run.log line 13 reads "spent $0.0054 ($0.0035 drafting) of $1.00" but the arithmetic says $0.0054 is the run alone and the total is about $0.0089.
- Failure case: F237's mvdg1xo3 spent $0.1804 on the run (spendComplete false), $0.1869 in the settled row; F234's mvcur592 spent $0.2306. So $0.50 is above both failures.
- Suggest: DeepSeek deepseek-flash, drafter thinking OFF, cap $0.50, 20 min, hamr's go per run. No paid fire without the $0 stage B first.

---

## 5. Traps bareloop hit, and what to do differently fresh

5.1 A label that is on the page but reads no value (F237, F236). "StaticText" (369 times, no number after it), "O" (a fragment of O'Hare), "Departure time" (the colon sits after it). Found-on-page passes them all. bareloop's core still does NOT drop time and text labels that read nothing (V4 out). Do differently: for every kept label, code reads the values it gives and drops one that reads none, with a reason. Prove it on the real labels of F237, not a fixture.

5.2 Silent drops (F238). Build the Not-checked list first, and a test that fails if any removed word has no reason line.

5.3 Rules fitted to one page. bareloop wrote v2, v3, v4 each after the page that broke the last one; the numbers on the seen pages were "a fit, not a test" (F226, F235). Frozen-rule discipline: write the rules and the pass bar and freeze them in a commit BEFORE fetching an unseen page; a failing page is a finding, never a re-tune (F236).

5.4 Site reach (F227). Booking, Expedia, eBay and Skyscanner block barebrowse, headless and headed. Google Flights, Airbnb, Amazon load. A test page that cannot load tells nothing; log a reach finding, do not patch.

5.5 Repeated anchors (F228, F234). Labels like "at", "-", "$" repeat inside one line or one result. N2 handles it; do not skip it.

5.6 Position-named facts (F234). "second price", "third date" in one result. S1 refuses them. Tell the drafter in the same change (bareloop rule: a validator rule the drafter is not told about fails every draft).

5.7 Page loads late. A snapshot right after goto can be empty or partial: the same URL gave 77,951 chars / 44 flights, 8,801 chars / 3 flights and 719 chars (L1, ITEM33:869). Wait for network idle, bounded; stop plainly on a header-only page.

5.8 "Any one alternative works" widens a check (F226). Keep R1: extra labels must read the same values as the first.

5.9 Currency sign lets a cheat pass. With "EUR" alone as currency, "Pay EUR0 today" (12 lines on the Airbnb page) satisfies "under 400" (guard-answers-2026-10-17.md:6). The guard's advice: sign the unit ("total") with NO currency. Every listed form widens the check.

5.10 The two-line quote. A result's price and its departure time can sit on different tree lines, so one quote cannot hold both (F237, F235 "weak spot 6"; ITEM33:1310). Not solved in bareloop. Expect it on Google Flights; this is the likeliest live failure.

5.11 POC-only proof is not live proof. Every real defect (F234, F237, the Part 1c fixes ITEM33:864-920) came from a live run, not from POC pages. Do the live test before building.

5.12 Cost: drafter thinking OFF was about 5x cheaper and 3x faster ($0.013 vs $0.067 mean) and made no worse drafts in that contrast (docs/logs/2026-10-10-drafter-thinking-contrast-prereg.md:73). Keep OFF for drafting.

5.13 Unproven in bareloop: the idea A core has built-and-tested code (commits to fd78723) but the live proof plan (ITEM33:1286-1297) was not yet complete when this was written. Treat every rule as "test-proven plus one green live run (mve5y8fa)", not as proven. n=1.

---

## 6. Open questions only hamr can rule on (recommended answer after each)

1. Does fwd add ONE new typed close class, "page reads": a quote on the run's own saved page plus a code value rule? Without it, flights falls to hitl on every run. Recommend: yes, as a closed class; the AI never grades it.
2. Is the code-forced ask (2a) allowed to appear BEFORE signing as a drafting-time stop, separate from the signed ask line? Recommend: yes; the answers are recorded and signed as text, and signed ask positions stay arbiter data.
3. Cap on drafting-time asks: 2 (bareloop's), rest to Not checked? Recommend: 2.
4. T3 ("page label is not in the job's words") as the meaning-ambiguity trigger: build only if stage B shows it fires on "From" and not on everything. Recommend: test first, decide after.
5. On "yes", stamp a "you confirmed" field beside `aiProposal`? Recommend: yes; fixes the card still saying "AI's proposal" (bareloop gap, src/facts.js:215).
6. Record Q and A in draft log, Audit and signed job text from day one, written by code? Recommend: yes, all three.
7. Local sheet: CSV only for now, docx/xlsx refused with a plain reason (bareloop H7)? Recommend: yes; a reader is a later piece.
8. Does fwd reuse bareloop's code (copy, as fwd already copies bareloop UI) or rewrite? Recommend: rewrite the rules in fwd's own seams (graduation is a rewrite, not a copy); keep the rule list and tests as the spec.
9. Spend: stage A about $0.012 for 3 drafts, stage C up to $0.50 cap, DeepSeek deepseek-flash. Recommend: A and B now, C on a separate go.
10. Which route and date for the test page? Recommend: a route unseen by bareloop (not BOS-ORD, JFK-LAX, LAX-JFK, ORD-DEN, SFO-LAX), fetched only after the pass bar is frozen.
