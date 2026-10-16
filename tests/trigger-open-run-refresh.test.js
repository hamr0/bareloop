// The rubric-2 failure: why hamr saw nothing (the open page never refetched a finished run). The page's own functions, extracted verbatim.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ why hamr saw nothing: the open page never refetched a finished run
// (`refreshOpenRun` returned at once for a run that is not live, so SCHEDULED / NEXT of a finished run stayed as first painted)
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
/** the page's own refreshOpenRun over a finished run, with a fake server answer and clock */
function openRun({ scheduled, ageMs }) {
  const calls = [];
  const rendered = [];
  const getJSON = (url) => { calls.push(url); return Promise.resolve({ glyph: '✓', runid: 'r1', schedule: { scheduled: true, nextRed: true, next: 'The last try did not start: x' } }); };
  const make = new Function('getJSON', 'renderRun', 'Date', `var currentRunid = 'r1', runIsLive = false, selectToken = 1, lastRunDetailSig = null,
    openIsScheduled = ${scheduled}, lastOpenFetchAt = ${1_000_000 - ageMs}, RUNS_LIST_POLL_MS = 10000;
    function sig(o){ return JSON.stringify(o); } function withScrollPreserved(ids, fn){ fn(); }
    ${fnSrc('refreshOpenRun')}
    return refreshOpenRun;`);
  const refreshOpenRun = make(getJSON, (d) => rendered.push(d), { now: () => 1_000_000 });
  return { refreshOpenRun, calls, rendered };
}

test('page: a finished run of a SCHEDULED job is refetched on the list cadence, so a refused fire turns NEXT red without a click', async () => {
  const w = openRun({ scheduled: true, ageMs: 11_000 });
  await w.refreshOpenRun();
  assert.equal(w.calls.length, 1);
  assert.equal(w.rendered[0].schedule.nextRed, true);
});

test('page: not before the cadence is up, and never for a finished run of an unscheduled job', async () => {
  const early = openRun({ scheduled: true, ageMs: 2_000 });
  await early.refreshOpenRun();
  assert.equal(early.calls.length, 0);
  const plain = openRun({ scheduled: false, ageMs: 60_000 });
  await plain.refreshOpenRun();
  assert.equal(plain.calls.length, 0);
});
