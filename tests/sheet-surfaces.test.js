// S5: the surfaces of a sheet job, over a REAL engine-produced run ($0, scripted worker): the Result tab's per-check rows carry what was found ("rows checked - 7 rows") for a green check and bareguard's own gap
// words for a red one, never a cell's text (a string planted in a Description cell must appear nowhere in the payload). The plan card / Job tab model shows the sheet rows with their tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunResult } from '../src/panel/server.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { runSheetJob, PLANTED } from './sheet-surfaces-world.mjs';

test('Result tab, green: each check of the sheet line is a passed row that says what was found; no cell text anywhere', async () => {
  const r = await runSheetJob();
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  assert.match(r.out, /outcome\s+green/);
  assert.ok(r.csv.includes(PLANTED) && r.over.length >= 5, 'the planted cell is in an over-500 row of the sheet');
  const res = getRunResult(r.runid, { home: r.home });
  assert.ok(res, 'the run has a Result tab');
  const rows = res.lines[0].checkRows;
  assert.ok(rows.length >= 3, JSON.stringify(rows));
  assert.ok(rows.every((x) => x.result === 'passed'), JSON.stringify(rows));
  const sheetRows = rows.filter((x) => typeof x.found === 'string');
  assert.ok(sheetRows.length >= 2, `a found line on the sheet checks: ${JSON.stringify(rows)}`);
  assert.ok(sheetRows.some((x) => x.found === `rows checked — ${r.over.length} rows`), JSON.stringify(sheetRows.map((x) => x.found)));
  assert.equal(JSON.stringify(res).includes(PLANTED), false, 'a cell string never reaches the Result payload');
});

test('Result tab, red (a wrong row named): the failed row keeps bareguard\'s gap words (the row number), no found line on it, still no cell text', async () => {
  const probe = await runSheetJob();
  const wrong = probe.over.slice(1);
  const r = await runSheetJob({ named: wrong });
  assert.doesNotMatch(r.out, /outcome\s+green/);
  const res = getRunResult(r.runid, { home: r.home });
  const rows = res.lines[0].checkRows;
  const bad = rows.filter((x) => x.result === 'failed');
  assert.ok(bad.length >= 1, JSON.stringify(rows));
  assert.ok(bad.every((x) => x.found === undefined && typeof x.why === 'string'), JSON.stringify(bad));
  assert.equal(JSON.stringify(res).includes(PLANTED), false);
});

test('plan card and Job tab model: the sheet line shows the [you] rule row, the [agent] row and the [default] row, with their tags', async () => {
  const r = await runSheetJob();
  const plan = planFromSpec(r.spec, null);
  const line = plan.lines.find((l) => l.n === 1);
  const by = line.checks.map((c) => c.by);
  assert.ok(by.includes('you') && by.includes('agent') && by.includes('default'), JSON.stringify(line.checks));
  assert.ok(line.checks.some((c) => /rows/.test(c.name)), JSON.stringify(line.checks));
  const mine = line.checks.find((c) => c.by === 'you');
  assert.match(mine.name, /covers "Amount over 500"/, `the rule is read in the person's own words, never "rule 1": ${mine.name}`);
});
