# Jev trial — amendment 1 (2026-10-26), written before any Jev or comparator answer exists

What happened: the first launch stopped at the first call. Jev refused the train page under the frozen default context with
HTTP 400 `{"detail":{"error_type":"max_tokens_exceeded"}}` (87,087 chars; a one-question probe gave the same). No answer was returned for
any item and nothing was graded. Spend so far: one 284-token probe on a one-line text (about $0.00001) to read the error.

Ruling (hamr, 2026-10-26, option 2): skip the train page for now; run cinema and flights only, at the frozen default context. The 19 train
items (incl. both trivial controls t01/t02) are held unchanged in `jev-trial-items-35.json` for a later run on barebrowse's slimmer
table format.

Changes, all made before any answer:
- Items: the 16 cinema + flights items, unchanged, plus two new trivial controls on the flights page (f00a "Boston" present, 57 lines;
  f00b "Zorblax" absent, 0 lines), replacing t01/t02. 18 items, 10 hard, 10 true.
- Decision rules: unchanged. J2 = at least 90% of the 10 hard items (9 of 10). J3 needs at least 10 confident items, which 18 items may not
  give: if so it is UNDERPOWERED and the trial cannot PASS, as frozen.
- Honest limit added: without the train page, the wrong-label (alert vs schedule) and row/column cases are NOT tested in this run.
