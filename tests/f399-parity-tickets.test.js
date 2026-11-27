// F399 parity pins, Tickets (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "Tickets").
// Fixtures: trimmed REAL spines (tests/fixtures/ticket-grid: mw3gso0m passed #7 with six close stages, mw6lmvdg stopped #17 whose close never ran; tests/fixtures/result-tab/mw1zse2m a ticket repo job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRunResult, getJobGrid } from '../src/panel/server.js';
import { makeResultWorld } from './result-tab-world.mjs';
import { makeGridWorld } from './ticket-grid-world.mjs';
import { spineAt, rawClose } from './f399-raw.mjs';

test('tickets-box-parity: the ticket box on the Result tab and the grid row\'s number, title and link are the run\'s own job-start ticket record (real mw1zse2m, mw3gso0m, mw6lmvdg)', () => {
  const w = makeResultWorld(['mw1zse2m']);
  const t = spineAt('result-tab/u-mw1zse2m.jsonl').find((r) => r.type === 'job-start').ticket;
  assert.deepEqual(getRunResult('mw1zse2m', { home: w.home }).ticket, { number: t.number, title: t.title, url: t.url });
  const g = makeGridWorld();
  const grid = getJobGrid('mw3gso0m', { home: g.home, now: Date.parse('2026-11-08T00:00:00Z') });
  for (const id of ['mw3gso0m', 'mw6lmvdg']) {
    const raw = spineAt(`ticket-grid/u-${id}.jsonl`).find((r) => r.type === 'job-start').ticket;
    const row = grid.groups.flatMap((/** @type {any} */ x) => x.rows).find((/** @type {any} */ x) => x.runId === id);
    assert.deepEqual([row.number, row.title, row.url], [raw.number, raw.title, raw.url], id);
  }
});

test('ticket-grid-checks-parity: the grid row\'s "checks passed of total" are the final close\'s stage counts; a run whose close never ran shows the steps\' own checks (real mw3gso0m 6 of 6; real mw6lmvdg close never ran)', () => {
  const g = makeGridWorld();
  const grid = getJobGrid('mw3gso0m', { home: g.home, now: Date.parse('2026-11-08T00:00:00Z') });
  const rows = grid.groups.flatMap((/** @type {any} */ x) => x.rows);
  const done = rows.find((/** @type {any} */ x) => x.runId === 'mw3gso0m');
  const c = rawClose(spineAt('ticket-grid/u-mw3gso0m.jsonl'));
  const passed = c.stages.filter((/** @type {any} */ s) => s.verdict === 'satisfied').length;
  assert.deepEqual(done.checks, { mark: 'g', text: `${passed} of ${c.stages.length}` });
  assert.equal(c.stages.length, 6);
  const stopped = rows.find((/** @type {any} */ x) => x.runId === 'mw6lmvdg');
  assert.equal(rawClose(spineAt('ticket-grid/u-mw6lmvdg.jsonl')), null, 'the close never ran');
  // golden = today's value: the steps' own checks, 3 distinct, 1 standing green at the last try (the parity run of the built readers shows no difference)
  assert.deepEqual(stopped.checks, { mark: 'r', text: '2 red' });
});
