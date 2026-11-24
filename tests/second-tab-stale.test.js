// hamr 2026-11-24 (walk mwuxqx4f): a run open in tab 1 ended `stopped`; a Resume clicked in tab 2 left tab 1 on "stopped" + a Resume button until a reload.
// Root cause: refreshOpenRun refetched a finished run's detail only for a scheduled job; nothing looked at the Runs list's own sign/word for the open run.
// The page's own functions, extracted verbatim.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/** the open run's detail as the page first saw it (`stopped`), then the list says what it says */
async function listSays(row) {
  const fetched = [];
  const rendered = [];
  const getJSON = (url) => {
    fetched.push(url);
    if (url === '/api/runs') return Promise.resolve({ runs: [row] });
    return Promise.resolve({ runid: 'r1', glyph: '▶', died: false, status: { sign: '▶', word: 'running' } });
  };
  const make = new Function('getJSON', 'renderRun', 'setRunsData', 'runsFilterBar', 'paintOnline', 'Date', `var currentRunid = 'r1', runIsLive = false, selectToken = 1, lastRunDetailSig = null,
    openIsScheduled = false, lastOpenFetchAt = 0, RUNS_LIST_POLL_MS = 10000, lastRunsListRefreshAt = 0, lastRunsPayloadSig = null, lastRunsSig = null, pollFailStreak = 0,
    openStatusSig = 'stopped-glyph|stopped';
    function sig(o){ return JSON.stringify(o); } function withScrollPreserved(ids, fn){ fn(); }
    function statusSigOf(r){ return r ? String(r.glyph) + "|" + (r.status && r.status.word ? r.status.word : "") : null; }
    ${fnSrc('refreshOpenRun')}
    ${fnSrc('refreshRunsList')}
    return refreshRunsList;`);
  const refreshRunsList = make(getJSON, (d) => rendered.push(d), () => {}, { refresh() {} }, () => {}, { now: () => 1_000_000 });
  await refreshRunsList(true);
  await new Promise((r) => setTimeout(r, 5));
  return { fetched, rendered };
}

test('page: the list saying the open run is now running refetches its detail even though the page last saw it finished', async () => {
  const w = await listSays({ runid: 'r1', glyph: '▶', status: { sign: '▶', word: 'running' } });
  assert.ok(w.fetched.includes('/api/runs/r1'), 'the open run detail was refetched');
  assert.equal(w.rendered[0].glyph, '▶');
});

test('page: a list row that still reads what the page shows does not refetch a finished run', async () => {
  const w = await listSays({ runid: 'r1', glyph: 'stopped-glyph', status: { word: 'stopped' } });
  assert.deepEqual(w.fetched, ['/api/runs']);
});
