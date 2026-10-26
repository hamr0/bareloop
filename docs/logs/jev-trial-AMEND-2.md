# Jev trial — amendment 2 (2026-10-26), written before any answer on the train items exists

Ruling (hamr, 2026-10-26: "test barebrowse, test train as well"): run the 19 held train items on barebrowse's opt-in `mode: 'data'`
snapshot of the same MBTA page (barebrowse branch feat/data-mode at 496260b, not published), fetched live 2026-10-26 with bareloop's own
fetch settings: `datamode/train.data.txt`, 13,707 chars (the act page was 87,087 chars and over Jev's default context).

Schedule check: a fresh act fetch the same day differs from the saved act page only in the alert count (8 to 9 alerts); the timetable is
byte-identical, so the items' answers carry over.

Second-reader check on the data-mode page (before any answer): 17 CONFIRMED, 0 WRONG, 2 AMBIGUOUS. Dropped before the run:
- t17: asked for three consecutive LINES; data mode joins them into one line.
- t19: "first cell after the row label" is unsound: data mode (and act) drop the "Does not stop" cells, while the table's real first column
  (Trip 6002) does not stop at Wickford.

Run: the 17 remaining train items (both trivial controls t01/t02 kept), Jev `jev-1.14.0` at default context, DeepSeek deepseek-flash as the
comparator, one call each, same scripts (only the train page path changes). Decision rules unchanged: control first, J1, J2 (90% of the hard
items), J3 (UNDERPOWERED if fewer than 10 confident items). This run is graded on its own, not pooled with the cinema+flights run.

Honest limit: the page format changed (act to data), so this run tests Jev on barebrowse's data mode, not on today's act pages.
