// F399 parity pins, Sheet results (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Sheet results").
// UNDERPOWERED: 0 sheet runs exist in the archive. The run here is the REAL engine over a scripted worker ($0, tests/sheet-surfaces-world.mjs): the spine, the signed spec and the delivered
// files are the engine's own, but the SHEET and the worker's answer are authored, so this pins the views against the records of a hand-built run, never against a real one.
// Expected values are computed from the CSV and the delivered step file by plain scans, not through a reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunResult } from '../src/panel/server.js';
import { readRunList } from '../src/runlist.js';
import { outputOf } from '../src/runread.js';
import { runSheetJob } from './sheet-surfaces-world.mjs';

const spineOf = (/** @type {string} */ runid, /** @type {string} */ home) => readFileSync(/** @type {any} */ (readRunList({ home }).rows.find((x) => x.runid === runid)).spine, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('sheet-found-line-parity: a passed sheet row says what was found - "rows checked - N rows" / "count checked - N rows" - N being the rows the delivered file\'s claim names (engine run over an authored sheet)', async () => {
  const r = await runSheetJob();
  assert.equal(r.rc, 0, `${r.err}\n${r.out}`);
  const spine = spineOf(r.runid, r.home);
  const step = spine.filter((x) => x.type === 'destination-written').find((x) => /\/steps\/1-/.test(x.path));
  const claims = JSON.parse(readFileSync(step.path, 'utf8')).claims;
  const named = /** @type {number[]} */ (claims[r.claimName(0)].rows);
  assert.deepEqual(named, r.over, 'the worker named exactly the sheet rows over 500 (read off the CSV)');
  const rows = getRunResult(r.runid, { home: r.home }).lines[0].checkRows;
  assert.deepEqual(rows.filter((/** @type {any} */ x) => typeof x.found === 'string').map((/** @type {any} */ x) => x.found), [`rows checked — ${named.length} rows`, `count checked — ${named.length} rows`]);
  assert.ok(rows.filter((/** @type {any} */ x) => typeof x.found !== 'string').every((/** @type {any} */ x) => x.result === 'passed'));
});

test('sheet-report-totals-parity: the code-written lines at the end of the report - the rows named and the Count - are computed by code from the rows the worker named; the report is the delivered .md the reader holds (engine run over an authored sheet)', async () => {
  const r = await runSheetJob();
  const spine = spineOf(r.runid, r.home);
  const md = outputOf(spine, null, { read: true })?.files.find((f) => f.path.endsWith('.md'));
  assert.equal(md?.state, 'ok');
  const text = md?.content?.toString('utf8') ?? '';
  assert.ok(text.includes(`- Rows where Amount > 500: ${r.over.join(', ')}\n- Count: ${r.over.length}\n`), text);
  assert.ok(text.indexOf('### Checked by code') < text.indexOf("### The AI's answer (not checked"), 'code\'s lines come before the AI\'s answer');
  // a wrong row named: nothing is delivered, so no report carries a count the sheet does not hold
  const bad = await runSheetJob({ named: r.over.slice(1) });
  assert.equal(outputOf(spineOf(bad.runid, bad.home), null)?.files.some((f) => f.path.endsWith('.md')), false);
});
