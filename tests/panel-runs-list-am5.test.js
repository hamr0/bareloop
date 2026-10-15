// PANEL-BUILD.md P9 v2 section O (fwdloop M11 am5 + am6, signed by hamr 2026-10-14): the Runs search by words, a run word is exact, a day word,
// the matches-only older fold (at most 7 + the selected run), the hints, and line 1 of every run card. Pure page functions over fake runs, $0.
// Mirrors fwdloop test/m11-am5.test.js; bareloop keeps its extra plain-word fields (model, status word, why, spend, wall, check type).
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
const NAMES = ['escapeXml', 'runLabel', 'glyphClass', 'panelMoney', 'panelMoneyWithDraft', 'liveSpendText', 'liveWallPhrase', 'duration', 'rowIsLive', 'rowWallText', 'rowSpendText',
  'rlShortDate', 'runAtText', 'rlRunParts', 'runMatchesSearch', 'groupRunsByJob', 'filterRuns', 'filterWorkflows', 'filtersActive', 'rlModel', 'rlSectHtml', 'rlJumpCardHtml', 'rlRunTagHtml', 'rlScheduledCardHtml',
  'rlRunCardHtml', 'rlJobCardHtml', 'rlJobsHtml', 'filterBarHTML'];
const lib = new Function(`var RL_CHIPS = [];\n${NAMES.map(fnSrc).join('\n')}\nreturn {${NAMES.join(',')}};`)();
const LIMITS = { quietDays: 30, olderRuns: 7, needsYouDays: 7 };
const NONE = { checkTypes: [], results: [], time: 'all', search: '' };
const S = (search) => ({ ...NONE, search });
/** a LOCAL wall-clock time as an ISO stamp: the day a human sees is the local day */
const local = (y, mo, d, h = 13, mi = 46) => new Date(y, mo - 1, d, h, mi).toISOString();

const run = (job, n, over = {}) => ({
  runid: `${job}-${n}`, job, runNo: n, at: local(2026, 10, 12), model: 'deepseek-flash', checkType: 'deterministic', glyph: '✓', status: { sign: '✓', word: 'passed' },
  endedLine: 'goal met', spentUsd: 0.01, spendComplete: true, wall: '1m00s', live: false, needs: null, ...over,
});
const runsOf = (job, k, over = {}) => Array.from({ length: k }, (_, i) => run(job, k - i, typeof over === 'function' ? over(k - i) : over));
const entry = (job) => ({ job, headRunid: null, quiet: false, activityMs: 1 });
function model(runs, { filters = NONE, sel = { runid: null }, open = {} } = {}) {
  const jobs = [...new Set(runs.map((r) => r.job))].map((j) => ({ ...entry(j), headRunid: runs.find((r) => r.job === j).runid }));
  const data = { runs, jobs, scheduled: [] };
  return lib.rlModel(data, lib.filterWorkflows(lib.groupRunsByJob(runs, jobs), filters, Date.now()), filters, LIMITS, sel, open);
}
const hit = (rows, search) => lib.filterRuns(rows, S(search), Date.now()).map((r) => r.runid);
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&middot;/g, '·');
const l1 = (html) => html.match(/<span class="rl-l1">([\s\S]*?)<\/span><span class="rl-l2">/)[1];

test('items 1-2: a run word is exact: run-2 never matches run-20 or run-230; case does not matter', () => {
  const rows = [2, 20, 230].map((n) => run('aging', n));
  assert.deepEqual(hit(rows, 'run-2'), ['aging-2']);
  assert.deepEqual(hit(rows, 'RUN-20'), ['aging-20']);
  assert.deepEqual(hit(rows, 'run-230'), ['aging-230']);
  assert.deepEqual(hit(rows, 'run-3'), []);
});

test('item 1: words split at spaces and every word must match: `aging run-23` finds run-23 of aging-live-4 only; plain words still search the extra fields', () => {
  const rows = [run('aging-live-4', 23), run('aging-live-4', 2), run('kyc', 23), run('aging-live-4', 230, { model: 'sonnet-5' })];
  assert.deepEqual(hit(rows, 'aging run-23'), ['aging-live-4-23']);
  assert.deepEqual(hit(rows, '  aging   run-23 '), ['aging-live-4-23'], 'extra spaces do nothing');
  assert.deepEqual(hit(rows, 'kyc run-2'), [], 'every word must match');
  assert.deepEqual(hit(rows, 'live sonnet'), ['aging-live-4-230'], 'a plain word is still a substring of the model');
  assert.deepEqual(hit(rows, 'passed goal'), ['aging-live-4-23', 'aging-live-4-2', 'kyc-23', 'aging-live-4-230'], 'the status word and the why are still searched');
});

test('item 3: MM/DD matches the LOCAL day the card shows, in any year; a run from another day does not match', () => {
  const rows = [
    run('a', 1, { at: local(2026, 10, 12, 0, 5) }), run('a', 2, { at: local(2026, 10, 12, 23, 55) }), run('a', 3, { at: local(2026, 10, 13, 0, 5) }),
    run('a', 4, { at: local(2026, 10, 11, 23, 55) }), run('a', 5, { at: local(2025, 10, 12, 9, 0) }),
  ];
  assert.deepEqual(hit(rows, '10/12'), ['a-1', 'a-2', 'a-5']);
  assert.deepEqual(hit(rows, '10/13'), ['a-3']);
  assert.deepEqual(hit(rows, '10/14'), []);
  for (const r of rows) assert.ok(hit([r], lib.rlShortDate(r.at).slice(0, 5)).includes(r.runid), `${r.runid} found by the date on its card`);
});

test('item 3: YYYY-MM-DD matches that local day of that year only; a run with no date never matches a day word', () => {
  const rows = [run('a', 1, { at: local(2026, 10, 12) }), run('a', 2, { at: local(2025, 10, 12) }), run('a', 3, { at: local(2026, 10, 13) }), run('a', 4, { at: null })];
  assert.deepEqual(hit(rows, '2026-10-12'), ['a-1']);
  assert.deepEqual(hit(rows, '2025-10-12'), ['a-2']);
  assert.deepEqual(hit(rows, '10/12'), ['a-1', 'a-2']);
});

test('item 3: a part date matches nothing, not even through the date text on the card (10/1 is not 10/12 or 10/01); a non-day shape (13/45) matches nothing', () => {
  const rows = [run('a', 1, { at: local(2026, 10, 12) }), run('a', 2, { at: local(2026, 10, 1) })];
  assert.deepEqual(hit(rows, '10/1'), []);
  assert.deepEqual(hit(rows, '10/'), []);
  assert.deepEqual(hit(rows, '13/45'), []);
  assert.deepEqual(hit(rows, '2026-13-45'), []);
  assert.deepEqual(hit(rows, '10/01'), ['a-2']);
});

test('items 1-3 together: job + run word + day word, all must match', () => {
  const rows = [run('aging', 23, { at: local(2026, 10, 12) }), run('aging', 24, { at: local(2026, 10, 13) }), run('kyc', 23, { at: local(2026, 10, 12) })];
  assert.deepEqual(hit(rows, 'aging 10/12'), ['aging-23']);
  assert.deepEqual(hit(rows, 'aging run-23 10/12'), ['aging-23']);
  assert.deepEqual(hit(rows, 'aging run-23 10/13'), []);
});

test('item 4: while searching, the older fold shows only matching runs, newest first, at most 7, plus the selected run', () => {
  const day = (n) => ({ at: n % 2 === 0 ? local(2026, 10, 12) : local(2026, 10, 13) });
  const rows = runsOf('flights', 40, day);
  const card = model(rows, { filters: S('10/12') }).jobs[0];
  assert.equal(card.older.open, true);
  assert.deepEqual(card.older.shown.map((r) => r.runid), ['flights-38', 'flights-36', 'flights-34', 'flights-32', 'flights-30', 'flights-28', 'flights-26'], 'matches only, newest first, 7');
  assert.equal(card.older.hidden, 12, 'older matches run-38 down to run-2 are 19; 7 shown');
  const sel = model(rows, { filters: S('10/12'), sel: { runid: 'flights-5' } }).jobs[0];
  assert.equal(sel.older.shown.length, 8);
  assert.ok(sel.older.shown.some((r) => r.runid === 'flights-5'));
  assert.ok(sel.older.shown.every((r) => r.runid === 'flights-5' || Number(r.runid.split('-')[1]) % 2 === 0), 'no other non-matching run');
  assert.equal(sel.older.hidden, 12, 'the selected run is shown, so it is not counted as hidden');
});

test('item 4: a search that matches no older run shows no older run; a chip counts as searching', () => {
  const none = model(runsOf('flights', 12), { filters: S('run-12') }).jobs[0];
  assert.deepEqual(none.older.shown, []);
  assert.equal(none.older.hidden, 0);
  const rows = runsOf('f', 20, (n) => (n % 5 === 0 ? { glyph: '✗', status: { sign: '✗', word: 'failed' } } : {}));
  const card = model(rows, { filters: { ...NONE, results: ['✗'] } }).jobs[0];
  assert.deepEqual(card.older.shown.map((r) => r.runid), ['f-15', 'f-10', 'f-5']);
});

test('item 5 (words replaced by am7 item 4): no search: `k more older runs, <oldest> to <newest>. Search to find one.` with the dates of the HIDDEN k only; no date when one has none', () => {
  const rows = runsOf('f', 12, (n) => ({ at: local(2026, 9, n) })); // run-n on 09/n
  const html = lib.rlJobsHtml(model(rows, { open: { f: true } }));
  assert.match(text(html), /4 more older runs, 09\/01 to 09\/04\. Search to find one\./, '11 older, 7 shown (run-11..run-5); hidden run-4..run-1');
  assert.doesNotMatch(html, /use search/);
  const undated = runsOf('g', 12, (n) => ({ at: n === 2 ? null : local(2026, 9, n) }));
  assert.match(text(lib.rlJobsHtml(model(undated, { open: { g: true } }))), /4 more older runs\. Search to find one\./, 'a hidden run with no date drops the range');
});

test('item 5 (words replaced by am9): while searching the hint counts the rest (dates per am9); nothing hidden, no line', () => {
  const html = text(lib.rlJobsHtml(model(runsOf('f', 30), { filters: S('f') })));
  assert.match(html, /22 more matches on 10\/12\. Add a run number to narrow it\./, '29 older matches, 7 shown');
  assert.doesNotMatch(html, /search above|older ·/);
  assert.doesNotMatch(text(lib.rlJobsHtml(model(runsOf('f', 3), { filters: S('f') }))), /more match/);
});

test('item 5 (words replaced by am8): the Runs search box reads `job, run-23, or date 10/13`', () => {
  assert.match(lib.filterBarHTML('runs'), /placeholder="job, run-23, or date 10\/13"/);
});

test('item 6: run card line 1 is `run-2 · 10/12 13:46 · deepseek-flash` in the same-size .rl-rest span, never the small raised .rl-faint', () => {
  const r = run('aging', 2, { at: local(2026, 10, 12, 13, 46) });
  assert.equal(text(l1(lib.rlRunCardHtml(r, false, false))), 'run-2 · 10/12 13:46 · deepseek-flash');
  assert.doesNotMatch(l1(lib.rlRunCardHtml(r, false, false)), /rl-faint/);
  assert.match(l1(lib.rlRunCardHtml(r, false, false)), /<span class="rl-rest">&middot; /);
  const rest = PAGE.match(/\.rl-rest\{[^}]*\}/);
  assert.ok(rest, 'the .rl-rest rule exists');
  assert.doesNotMatch(rest[0], /font-size|margin/, 'the rest of line 1 sets no size or margin of its own');
  assert.doesNotMatch(PAGE, /#panel-runs \.rl-rest[^{]*\{[^}]*(font-size|margin)/, 'and nothing under #panel-runs raises it');
});

test('am6: Running now and Scheduled line 1: the time, cost and next-run text sit in the same-size .rl-rest span after ` · `, not in .rl-faint; Needs you keeps its pill', () => {
  const live = lib.rlJumpCardHtml(run('aging-live-4', 7, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: true, liveSince: '2026-10-12T10:00:00.000Z', priorWallMs: 0 }), false);
  assert.doesNotMatch(l1(live), /rl-faint/);
  assert.match(l1(live), /<span class="rl-rest">&middot; /);
  assert.equal(text(l1(live)).replace(/\s+/g, ' '), 'aging-live-4 · run-7 · · $0.01', 'the since text is written into the empty span by the page at run time');
  const sch = lib.rlScheduledCardHtml({ job: 'aging-live-4', at: 'Mon 09:00', in: 'in 2d', words: 'weekly', runId: 'aging-live-4-7' });
  assert.doesNotMatch(l1(sch), /rl-faint/);
  assert.equal(text(l1(sch)), 'aging-live-4 · Mon 09:00');
  assert.equal(text(l1(lib.rlScheduledCardHtml({ job: 'k', at: null, in: null, words: 'file', runId: null }))), 'k', 'no next-run time: nothing is made up');
  assert.match(lib.rlJumpCardHtml(run('x', 1, { needs: 'Resume' }), true), /rl-pill-need/);
});

// ---- am7 (PANEL-BUILD.md section O, am7; fwdloop M11 am7 e9b91d9): any day form, brackets ignored, real hidden-run range, plainer hints ----

test('am7 item 1: 10-13, 10/13 and 2026-10-13 all mean the same local day', () => {
  const rows = [run('a', 1, { at: local(2026, 10, 13) }), run('a', 2, { at: local(2026, 10, 12) }), run('a', 3, { at: local(2025, 10, 13) })];
  assert.deepEqual(hit(rows, '10-13'), ['a-1', 'a-3']);
  assert.deepEqual(hit(rows, '10-13'), hit(rows, '10/13'));
  assert.deepEqual(hit(rows, '2026-10-13'), ['a-1']);
  assert.deepEqual(hit([run('a', 4, { at: null })], '10-13'), [], 'a run with no date never matches a day word');
});

test('am7 item 2: brackets are ignored: `aging-live-4 (run-2)` finds what `aging-live-4 run-2` finds', () => {
  const rows = [run('aging-live-4', 2), run('aging-live-4', 20), run('kyc', 2)];
  assert.deepEqual(hit(rows, 'aging-live-4 run-2'), ['aging-live-4-2']);
  assert.deepEqual(hit(rows, 'aging-live-4 (run-2)'), ['aging-live-4-2']);
  assert.deepEqual(hit(rows, '(run-2)'), hit(rows, 'run-2'));
  assert.deepEqual(hit(rows, '(aging-live-4) (run-2)'), ['aging-live-4-2'], 'a bracket around any word, as a title shows it');
});

test('am7 items 3-4: the range is the hidden runs\' oldest to newest real day, whatever the list order; plainer words', () => {
  // 12 runs; run-n on a day; the 4 hidden (run-4..run-1) are on 10/11, 10/13, 10/12, 10/11 so the list order is not the date order
  const days = { 1: 11, 2: 13, 3: 12, 4: 11 };
  const rows = runsOf('f', 12, (n) => ({ at: local(2026, 10, days[n] || 14) }));
  assert.match(text(lib.rlJobsHtml(model(rows, { open: { f: true } }))), /4 more older runs, 10\/11 to 10\/13\. Search to find one\./, 'min to max, not first to last');
});

test('am7 item 4: all hidden runs on one day read `k more runs on MM/DD`, never `10/11 to 10/11`; singular for one; undated drops the date', () => {
  const same = runsOf('f', 14, (n) => ({ at: local(2026, 10, n > 6 ? 14 : 11) }));
  const html = text(lib.rlJobsHtml(model(same, { open: { f: true } })));
  assert.match(html, /6 more runs on 10\/11\. Search to find one\./);
  assert.doesNotMatch(html, /10\/11 to 10\/11/);
  assert.match(text(lib.rlJobsHtml(model(runsOf('f', 9, () => ({ at: local(2026, 10, 11) })), { open: { f: true } }))), /1 more run on 10\/11\. Search to find one\./);
  const undated = runsOf('g', 12, (n) => ({ at: n === 2 ? null : local(2026, 9, n) }));
  assert.match(text(lib.rlJobsHtml(model(undated, { open: { g: true } }))), /4 more older runs\. Search to find one\./);
  assert.match(text(lib.rlJobsHtml(model(runsOf('h', 9, () => ({ at: null })), { open: { h: true } }))), /1 more older run\. Search to find one\./);
});

test('am7 item 4: the search box reads `job, run-23, or date 10/13` (words per am8); no old word is left (the searching words are am9\'s)', () => {
  const html = text(lib.rlJobsHtml(model(runsOf('f', 30), { filters: S('f') })));
  assert.doesNotMatch(html, /more match\.|add a day|search above\)|\(and /);
  assert.match(lib.filterBarHTML('runs'), /placeholder="job, run-23, or date 10\/13"/);
  assert.doesNotMatch(lib.filterBarHTML('runs'), /a day 10\/12|search: job name/);
});

test('M11 am8: the Runs placeholder fits a 320 px phone: at most 32 characters', () => {
  // measured at 320 px: room about 270 px, 14px monospace about 8.4 px per character; 270 / 8.4 = 32.
  const ph = lib.filterBarHTML('runs').match(/placeholder="([^"]*)"/)[1];
  assert.equal(ph, 'job, run-23, or date 10/13');
  assert.ok(ph.length <= 32, `placeholder is ${ph.length} chars: "${ph}"`);
});

// M11 am9 (fwd M11 am9, signed by hamr 2026-10-15): the searching line shows the hidden matches' real start days.
test('am9: searching, hidden matches over several days: `k more matches, MM/DD to MM/DD. Add a date or run number to narrow it.` (min to max of the HIDDEN ones only)', () => {
  const rows = runsOf('f', 12, (n) => ({ at: local(2026, 9, n) })); // run-n on 09/n; 11 older, 7 shown (run-11..run-5), hidden run-4..run-1
  const html = text(lib.rlJobsHtml(model(rows, { filters: S('f') })));
  assert.match(html, /4 more matches, 09\/01 to 09\/04\. Add a date or run number to narrow it\./);
  assert.doesNotMatch(html, /more match\./, 'the am7 undated line is gone');
});

test('am9: searching, the range is the MIN to the MAX of the hidden matches whatever their order', () => {
  const days = { 1: 20, 2: 3, 3: 28, 4: 11 };
  const rows = runsOf('f', 12, (n) => ({ at: local(2026, 9, days[n] || n) }));
  assert.match(text(lib.rlJobsHtml(model(rows, { filters: S('f') }))), /4 more matches, 09\/03 to 09\/28\. Add a date or run number to narrow it\./);
});

test('am9: searching, all hidden matches on one day: `k more matches on MM/DD. Add a run number to narrow it.` never "10/09 to 10/09"', () => {
  const html = text(lib.rlJobsHtml(model(runsOf('f', 58, (n) => ({ at: n <= 50 ? local(2026, 10, 9) : local(2026, 10, 12) })), { filters: S('f') })));
  assert.match(html, /50 more matches on 10\/09\. Add a run number to narrow it\./);
  assert.doesNotMatch(html, /10\/09 to 10\/09/);
});

test('am9: searching, a hidden match with no date drops the date part: `k more matches. Add a date or run number to narrow it.`', () => {
  const rows = runsOf('f', 12, (n) => ({ at: n === 2 ? null : local(2026, 9, n) }));
  const html = text(lib.rlJobsHtml(model(rows, { filters: S('f') })));
  assert.match(html, /4 more matches\. Add a date or run number to narrow it\./);
  assert.doesNotMatch(html, /more matches[,]? ?(on )?\d\d\//);
});

test('am9: the no-search hint is unchanged by am9 (am7 item 4 words)', () => {
  const rows = runsOf('f', 12, (n) => ({ at: local(2026, 9, n) }));
  assert.match(text(lib.rlJobsHtml(model(rows, { open: { f: true } }))), /4 more older runs, 09\/01 to 09\/04\. Search to find one\./);
});
