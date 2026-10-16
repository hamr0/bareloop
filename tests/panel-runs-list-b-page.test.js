// PANEL-BUILD.md P9 v2 — the page half of the runs list (copied from fwdloop M11). The page's own functions are pulled out of src/panel/index.html
// BY NAME with a brace-scan helper (never an end-marker string search, which broke ~15 fwdloop tests silently) and driven against tiny fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

/** the source of `function <name>(...) {...}`: brace-scan from the first `{` after the name, so nested braces and strings with `}` cannot end it early */
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

const NAMES = ['escapeXml', 'runLabel', 'glyphClass', 'dotPulses', 'dotClass', 'panelMoney', 'panelMoneyWithDraft', 'liveSpendText', 'liveWallPhrase', 'duration', 'rowIsLive', 'rowWallText', 'rowSpendText',
  'rlShortDate', 'runAtText', 'rlRunParts', 'runMatchesSearch', 'groupRunsByJob', 'filterRuns', 'filterWorkflows', 'filtersActive', 'rlModel', 'rlSectHtml', 'rlJumpCardHtml', 'rlRunTagHtml', 'rlScheduledCardHtml', 'rlTopHtml',
  'rlRunCardHtml', 'rlJobCardHtml', 'rlJobsHtml', 'tickSince', 'withFocusPreserved', 'paintRunsList', 'rlRowOf', 'rlJump', 'rlClick', 'setRunsData'];

const LIMITS = { quietDays: 30, olderRuns: 7, needsYouDays: 7 };
const FILTERS = { checkTypes: [], results: [], time: 'all', search: '' };

/** the list's own functions in one scope, with a fake document: boxes count their writes, `selectRun` records, clicks are recorded */
function mount({ filters = FILTERS, current = null } = {}) {
  const writes = { top: 0, wf: 0 };
  const boxes = {
    'rl-top': { _h: '', set innerHTML(v) { this._h = v; writes.top += 1; }, get innerHTML() { return this._h; }, contains: () => false },
    'wf-list': { _h: '', set innerHTML(v) { this._h = v; writes.wf += 1; }, get innerHTML() { return this._h; }, contains: () => false },
  };
  const log = [];
  const cards = {};
  const document = {
    activeElement: null,
    getElementById: (id) => boxes[id] ?? cards[id] ?? { click: () => log.push(`click:${id}`), addEventListener() {} },
    querySelectorAll: () => [],
  };
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'selectRun', 'scrollRunIntoViewMobile', 'currentFilters', 'state', `
    var rlData = { runs: [], jobs: [], scheduled: [], limits: { quietDays: 0, olderRuns: 0, needsYouDays: 0 } };
    var rlOpen = {}; var rlLast = { top: null, jobs: null };
    var currentRunid = state.current;
    function currentRunsFilters(){ return currentFilters(); }
    ${NAMES.map(fnSrc).join('\n')}
    return { setRunsData: setRunsData, rlModel: rlModel, rlTopHtml: rlTopHtml, rlJobsHtml: rlJobsHtml, rlJobCardHtml: rlJobCardHtml, rlRunCardHtml: rlRunCardHtml, rlJumpCardHtml: rlJumpCardHtml,
      groupRunsByJob: groupRunsByJob, filterWorkflows: filterWorkflows, paintRunsList: paintRunsList, rlJump: rlJump, rlClick: rlClick, tickSince: tickSince,
      setCurrent: function(v){ currentRunid = v; }, open: rlOpen };
  `)(document, (id) => log.push(`select:${id}`), () => log.push('mobile'), () => filters, { current });
  return { f, writes, boxes, log, cards };
}

/** a run row as /api/runs sends it */
function row(job, n, extra = {}) {
  const word = extra.word ?? 'failed';
  return {
    runid: `${job}-${n}`, job, runNo: n, at: new Date(Date.UTC(2026, 8, 1, 10, 0) + n * 3600_000).toISOString(), model: 'deepseek-flash', checkType: 'deterministic',
    glyph: word === 'passed' ? '✓' : '✗', status: { sign: word === 'passed' ? '✓' : '✗', word }, endedLine: word === 'passed' ? 'goal met' : 'checks said no', spentUsd: 0.1, spendComplete: true, wall: '2m00s', live: false, needs: null, ...extra,
  };
}
/** a job with `n` runs, newest first (the server's order), and the matching jobs entry */
function job(name, n, quiet = false) {
  const runs = Array.from({ length: n }, (_, i) => row(name, n - i));
  return { runs, entry: { job: name, headRunid: runs[0].runid, quiet, activityMs: 1 } };
}
function model(m, runs, jobs, { filters = FILTERS, sel = { runid: null }, open = {}, limits = LIMITS } = {}) {
  const data = { runs, jobs, scheduled: [] };
  return m.f.rlModel(data, m.f.filterWorkflows(m.f.groupRunsByJob(runs, jobs), filters, Date.now()), filters, limits, sel, open);
}
const count = (html, re) => (html.match(re) || []).length;

test('a section with nothing in it draws nothing, not even its header; an empty list says so', () => {
  const m = mount();
  const mod = model(m, [], []);
  assert.equal(m.f.rlTopHtml(mod), '');
  assert.equal(m.f.rlJobsHtml(mod), '<div class="hint">no runs listed yet</div>');
  const j = job('a', 1);
  assert.doesNotMatch(m.f.rlTopHtml(model(m, j.runs, [j.entry])), /Running now|Needs you/);
});

test('Must-fail: the page works out nothing — the server\'s `live` and `needs` decide the sections, never the sign or the word', () => {
  const m = mount();
  const stopped = row('p', 1, { glyph: '■', status: { sign: '■', word: 'stopped' }, needs: null });
  const resume = row('q', 1, { glyph: '■', status: { sign: '■', word: 'stopped' }, needs: 'Resume' });
  const running = row('r', 1, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: true });
  const sneaky = row('s', 1, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: false });
  const mod = model(m, [stopped, resume, running, sneaky], [stopped, resume, running, sneaky].map((r) => ({ job: r.job, headRunid: r.runid, quiet: false, activityMs: 1 })));
  assert.deepEqual(mod.running.map((r) => r.job), ['r']);
  assert.deepEqual(mod.needs.map((r) => r.job), ['q']);
});

test('Must-fail: a filter or a search never hides a Running now or a Needs you card — they act on Jobs and quiet jobs only', () => {
  const m = mount();
  const running = row('r', 1, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: true });
  const need = row('q', 1, { needs: 'Resume' });
  const entries = [running, need].map((r) => ({ job: r.job, headRunid: r.runid, quiet: false, activityMs: 1 }));
  const mod = model(m, [running, need], entries, { filters: { ...FILTERS, search: 'zzz-nothing', results: ['✓'] } });
  assert.equal(mod.running.length, 1);
  assert.equal(mod.needs.length, 1);
  assert.equal(mod.jobs.length, 0, 'the jobs list IS filtered');
});

test('cards: a jump card is a button that jumps; the Needs you tag is a label (a span), never a button; a Resume card reads `why · MM/DD HH:MM`', () => {
  const m = mount();
  const need = row('q', 2, { needs: 'Resume', status: { sign: '■', word: 'capped' }, endedLine: 'money cap $0.50', stoppedAt: '2026-10-11T16:40:00.000Z' });
  const html = m.f.rlJumpCardHtml(need, true);
  assert.match(html, /^<button class="rl-card rl-need"[^>]*data-rl-jump="q-2"[^>]*data-testid="rl-need-q-q-2"/);
  assert.match(html, /<span class="rl-pill rl-pill-need">Resume<\/span>/);
  assert.equal(count(html, /<button/g), 1, 'the pill is not a second button');
  assert.match(html, /<span class="rl-l2">capped · money cap \$0\.50 &middot; \d\d\/\d\d \d\d:\d\d<\/span>/);
});

test('draw-only: an Accept pill draws when the payload says so (the server produces none today); its line 2 is the mockup\'s', () => {
  const m = mount();
  const html = m.f.rlJumpCardHtml(row('c', 2, { needs: 'Accept', status: { sign: '✓', word: 'passed' }, glyph: '✓' }), true);
  assert.match(html, /rl-pill rl-pill-need">Accept</);
  assert.match(html, /passed · waiting for your Accept &middot; /);
});

test('RULED 2026-10-15: in Running now and Needs you a run\'s name reads `job · run-N` (job, space, middle dot, space, run-N); the Jobs list run card is unchanged', () => {
  const m = mount();
  const text = (html) => html.match(/<span class="rl-l1">([\s\S]*?)<\/span><span class="rl-l2">/)[1].replace(/<[^>]*>/g, '').replace(/&middot;/g, '\u00B7');
  const need = row('change2', 2, { needs: 'Resume', status: { sign: '■', word: 'capped' }, endedLine: 'money cap $0.50', stoppedAt: '2026-10-11T16:40:00.000Z' });
  assert.match(text(m.f.rlJumpCardHtml(need, true)), /^change2 \u00B7 run-2 ?Resume$/);
  const live = row('change2', 2, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: true, liveSince: '2026-10-14T11:58:00.000Z', priorWallMs: 0 });
  assert.match(text(m.f.rlJumpCardHtml(live, false)), /^change2 \u00B7 run-2 \u00B7 /);
  assert.doesNotMatch(m.f.rlJumpCardHtml(need, true), /dot [a-z]+ pulse/, 'a Resume card rests');
  assert.match(m.f.rlJumpCardHtml(row('c', 2, { needs: 'Accept', status: { sign: '✓', word: 'passed' }, glyph: '✓' }), true), /class="dot green pulse"/, 'waiting for your Accept blinks');
  assert.match(m.f.rlJumpCardHtml(live, false), /class="dot amber pulse"/, 'running blinks');
  assert.match(m.f.rlRunCardHtml(need, false, false), /class="rl-rn">run-2<\/span>/, 'the Jobs list card still reads run-N alone');
});

test('Running now: line 1 carries the in-place wall (data-rl-since + the server\'s prior wall) and the cost, an unknown cost reads `unknown`; line 2 is the server\'s plain why', () => {
  const m = mount();
  const live = row('r', 1, { glyph: '▶', status: { sign: '▶', word: 'running' }, live: true, liveSince: '2026-10-14T11:58:00.000Z', priorWallMs: 120000, liveWhy: 'step 2 of 3', spentUsd: null, spendFloorUsd: null, wall: undefined });
  const html = m.f.rlJumpCardHtml(live, false);
  assert.match(html, /data-rl-since="2026-10-14T11:58:00.000Z" data-rl-prior="120000"/);
  assert.match(html, /&middot; unknown<\/span>/);
  assert.match(html, /<span class="rl-l2">step 2 of 3<\/span>/);
  assert.match(m.f.rlJumpCardHtml({ ...live, liveWhy: null }, false), /<span class="rl-l2">running<\/span>/);
  assert.match(m.f.rlJumpCardHtml({ ...live, priorWallMs: null }, false), /data-rl-prior="leg"/, 'inexact earlier legs: the card counts this leg only and says so');
});

test('tickSince: the wall counts up in place from the server\'s start time plus the earlier legs; "this leg" when they are not exact', () => {
  const m = mount();
  const els = [
    { attrs: { 'data-rl-since': new Date(Date.now() - 60_000).toISOString(), 'data-rl-prior': '120000' }, textContent: '' },
    { attrs: { 'data-rl-since': new Date(Date.now() - 60_000).toISOString(), 'data-rl-prior': 'leg' }, textContent: '' },
    { attrs: { 'data-rl-since': 'garbage', 'data-rl-prior': '0' }, textContent: '' },
  ];
  els.forEach((e) => { e.getAttribute = (k) => e.attrs[k]; });
  // eslint-disable-next-line no-new-func
  const tick = new Function('document', `${['duration', 'tickSince'].map(fnSrc).join('\n')}\nreturn tickSince;`)({ querySelectorAll: () => els });
  tick();
  assert.match(els[0].textContent, /^3m0\d(\.\ds|s)?$|^3m00s$/);
  assert.match(els[1].textContent, /^1m0\ds this leg$|^1m00s this leg$/);
  assert.equal(els[2].textContent, 'time unknown');
  assert.ok(m);
});

test('Must-fail: a job\'s 9th-newest run is not shown without a search: 9 runs = newest + 7 older, then the hint with the hidden run\'s day (am5 item 5, words per am7 item 4)', () => {
  const m = mount();
  const j = job('flights', 9);
  const mod = model(m, j.runs, [j.entry], { open: { flights: true } });
  const html = m.f.rlJobsHtml(mod);
  assert.equal(count(html, /data-rl-run=/g), 8, 'the newest + 7 older');
  assert.match(html, /older runs \(8\)/);
  assert.match(html, /<div class="rl-hint">1 more run on 09\/01\. Search to find one\.<\/div>/);
  assert.doesNotMatch(html, /data-rl-run="flights-1"/);
});

test('a selected run past the 7 is still shown; with the fold shut a selected older run opens it', () => {
  const m = mount();
  const j = job('flights', 12);
  const withSel = m.f.rlJobsHtml(model(m, j.runs, [j.entry], { sel: { runid: 'flights-2' }, open: { flights: true } }));
  assert.match(withSel, /data-rl-run="flights-2"/);
  assert.equal(count(withSel, /data-rl-run=/g), 9, 'newest + 7 + the selected one');
  const shut = m.f.rlJobsHtml(model(m, j.runs, [j.entry], { sel: { runid: 'flights-5' } }));
  assert.match(shut, /aria-expanded="true"/);
  assert.match(shut, /data-rl-run="flights-5"/);
  assert.match(m.f.rlJobsHtml(model(m, j.runs, [j.entry])), /aria-expanded="false"/, 'no selection, no search: shut');
});

test('search for an older run opens the fold and MARKS it (rl-hit), never selects it; the job card still describes its newest run', () => {
  const m = mount();
  const j = job('flights', 5);
  const f = { ...FILTERS, search: 'run-2' };
  const html = m.f.rlJobsHtml(model(m, j.runs, [j.entry], { filters: f }));
  assert.match(html, /aria-expanded="true"/);
  const hit = html.match(/<button class="rl-card[^"]*rl-hit[^"]*"[^>]*data-rl-run="([^"]+)"/);
  assert.equal(hit[1], 'flights-2');
  assert.doesNotMatch(html, /rl-sel/, 'a match highlights; it never selects');
  assert.match(html, /id="rl-job-flights"[^]*<span class="rl-l2"><b class="st-word">failed<\/b> &middot; checks said no/);
});

test('search when the head also matches still opens the fold and shows the older match; 20-run job, search `run-2` (am5 item 2: run-2 is exact, so the head run-20 does not match)', () => {
  const m = mount();
  const j = job('flights', 20);
  const f = { ...FILTERS, search: 'run-2' };
  const mod = model(m, j.runs, [j.entry], { filters: f });
  const c = mod.jobs[0];
  assert.equal(c.older.open, true);
  assert.deepEqual(c.older.shown.map((r) => r.runid), ['flights-2'], 'run-2 is the only older match (item 4: matches only)');
  assert.equal(c.hits.includes('flights-20'), false, 'run-20 is not run-2');
  const both = model(m, j.runs, [j.entry], { filters: { ...FILTERS, search: 'flights' } }).jobs[0];
  assert.equal(both.hits.includes('flights-20'), true, 'a plain word still matches the head');
  assert.equal(both.older.open, true, 'the fold still opens when the head also matches');
});

test('300-run job, search `run`: only 7 older shown (am5 item 4: no extra newest match), the hint counts the rest (292 more matches, dated per am9)', () => {
  const m = mount();
  const j = job('big', 300);
  const html = m.f.rlJobsHtml(model(m, j.runs, [j.entry], { filters: { ...FILTERS, search: 'run' } }));
  assert.equal(count(html, /data-rl-run=/g), 8, 'the newest + 7 older');
  assert.match(html, /292 more matches( on \d\d\/\d\d\. Add a run number|, \d\d\/\d\d to \d\d\/\d\d\. Add a date or run number) to narrow it\./, 'am9: the hidden matches\' real days are shown');
});

test('the selected run past the 7 is shown with the 7 matches (am5 item 4 replaces the "one newest match past the 7" rule): 30-run job, search `flights`, selected flights-3', () => {
  const m = mount();
  const j = job('flights', 30);
  const mod = model(m, j.runs, [j.entry], { filters: { ...FILTERS, search: 'flights' }, sel: { runid: 'flights-3' } });
  const ids = mod.jobs[0].older.shown.map((r) => r.runid);
  assert.equal(ids.length, 8, '7 matches + the selected run');
  assert.deepEqual(ids.slice(0, 7), ['flights-29', 'flights-28', 'flights-27', 'flights-26', 'flights-25', 'flights-24', 'flights-23']);
  assert.equal(ids[7], 'flights-3');
  assert.equal(mod.jobs[0].older.hidden, 21, '29 older matches - 7 shown - the selected one');
});

test('no search: 7 shown and the fold is not opened by itself', () => {
  const m = mount();
  const j = job('flights', 12);
  const mod = model(m, j.runs, [j.entry]);
  assert.equal(mod.jobs[0].older.open, false);
  assert.equal(mod.jobs[0].older.shown.length, 7);
});

test('the limits and the quiet split are the server\'s: a payload that says 3 shows 3; quiet comes only from `jobs[].quiet`; the page has no literal 7 or 30 for them', () => {
  const m = mount();
  const j = job('flights', 12);
  const html = m.f.rlJobsHtml(model(m, j.runs, [j.entry], { limits: { quietDays: 14, olderRuns: 3, needsYouDays: 7 }, open: { flights: true } }));
  assert.equal(count(html, /data-rl-run=/g), 4, 'newest + 3');
  assert.match(html, /run in the last 14 days/);
  const q = job('old', 2, true);
  const mod = model(m, [...j.runs, ...q.runs], [j.entry, q.entry]);
  assert.deepEqual(mod.quiet.map((c) => c.job), ['old']);
  assert.deepEqual(mod.jobs.map((c) => c.job), ['flights']);
  assert.match(m.f.rlJobsHtml(mod), /▸ quiet jobs \(1\) · no run in 30 days/);
  for (const name of ['rlModel', 'rlJobsHtml']) assert.doesNotMatch(fnSrc(name), /\b(7|30)\b/, `${name} carries no literal 7 or 30`);
});

test('the quiet fold opens by itself when the selected run is inside it; a manual click wins', () => {
  const m = mount();
  const q = job('old', 2, true);
  assert.equal(model(m, q.runs, [q.entry], { sel: { runid: 'old-1' } }).quietOpen, true);
  assert.equal(model(m, q.runs, [q.entry], { sel: { runid: 'old-1' }, open: { __quiet: false } }).quietOpen, false);
});

test('a job with no run is one plain card; a missing-file row and a starting row draw and count in `k runs`', () => {
  const m = mount();
  const empty = m.f.rlJobCardHtml({ job: 'ghost', empty: true, head: null, sel: { runid: null }, hits: [] });
  assert.match(empty, /no runs yet/);
  assert.equal(count(empty, /data-rl-run/g), 0, 'never a made-up run');
  const missing = { runid: 'm1', job: 'j', runNo: 2, at: '2026-10-01T10:00:00.000Z', fileMissing: true };
  const starting = { runid: 's1', job: 'j', runNo: 3, at: '2026-10-02T10:00:00.000Z', starting: true, glyph: '▶', live: true };
  assert.match(m.f.rlRunCardHtml(missing, false, false), /<span class="rl-l2">file missing<\/span>/);
  assert.match(m.f.rlRunCardHtml(starting, false, false), /<b class="st-word">running<\/b> — starting…/);
  const html = m.f.rlJobsHtml(model(m, [starting, missing], [{ job: 'j', headRunid: 's1', quiet: false, activityMs: 1 }]));
  assert.match(html, /&middot; 2 runs/);
});

test('book text is escaped: a job name with markup never becomes markup', () => {
  const m = mount();
  const r = row('<img src=x>', 1);
  const html = m.f.rlJobsHtml(model(m, [r], [{ job: r.job, headRunid: r.runid, quiet: false, activityMs: 1 }])) + m.f.rlJumpCardHtml({ ...r, needs: 'Resume' }, true);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x&gt;/);
});

test('the old view is gone: no switch, no History list, no saved view key, no second copy of the run card, no old fold/cap code', () => {
  assert.doesNotMatch(PAGE, /data-runs-view|runsViewMode|bareloop-panel-runs-view|history-list|renderHistory|buildRunRowEl|renderWorkflows|autoExpandJob|representedRun|activeOlderRun|wfExpanded|WF_SUB_CAP|capSubRuns/);
  assert.equal(count(PAGE, /function rlRunCardHtml\(/g), 1);
  assert.match(PAGE, /select a run from the Runs list/);
  assert.doesNotMatch(PAGE, /select a run from Workflows or History/);
});

test('refresh writes nothing when nothing changed: an identical repaint leaves both boxes untouched; a real change writes only the box that changed', () => {
  const m = mount();
  const j = job('a', 2);
  m.f.setRunsData({ runs: j.runs, jobs: [j.entry], limits: LIMITS });
  m.f.paintRunsList();
  assert.deepEqual([m.writes.top, m.writes.wf], [1, 1]);
  m.f.paintRunsList();
  assert.deepEqual([m.writes.top, m.writes.wf], [1, 1], 'identical markup: no write');
  m.f.setCurrent('a-2');
  m.f.paintRunsList();
  assert.deepEqual([m.writes.top, m.writes.wf], [1, 2], 'the selection changed the jobs box only');
});

test('a jump selects the run, opens the Run tab and scrolls to the job card; a run card click selects it, opens the Run tab and scrolls on phones', () => {
  const m = mount();
  const j = job('a', 2);
  m.f.setRunsData({ runs: j.runs, jobs: [j.entry], limits: LIMITS });
  m.cards['rl-job-a'] = { scrollIntoView: () => m.log.push('scroll'), click() {} };
  m.f.rlJump('a-1');
  assert.deepEqual(m.log, ['select:a-1', 'click:tab-run', 'scroll']);
  m.log.length = 0;
  const target = (attr) => ({ closest: (sel) => (sel === `[${attr}]` ? { getAttribute: () => 'a-2' } : null) });
  m.f.rlClick({ target: target('data-rl-run') });
  assert.deepEqual(m.log, ['select:a-2', 'click:tab-run', 'mobile']);
});

test('a manual fold click wins over the automatic open and repaints', () => {
  const m = mount();
  const j = job('a', 3);
  m.f.setRunsData({ runs: j.runs, jobs: [j.entry], limits: LIMITS });
  const fold = { getAttribute: (k) => ({ 'data-rl-fold': 'a', 'aria-expanded': 'false' }[k]) };
  m.f.rlClick({ target: { closest: (sel) => (sel === '[data-rl-fold]' ? fold : null) } });
  assert.equal(m.f.rlJobsHtml === undefined, false);
  assert.match(m.boxes['wf-list'].innerHTML, /aria-expanded="true"/);
});

test('CSS: the section header is one rule (bold, normal case, 12 px, dim, no letter-spacing); the count on a job card is the name\'s own size; cards are 44 px tall; the fold is 44 px on phones', () => {
  const css = PAGE.match(/<style>[\s\S]*?<\/style>/)[0];
  const sect = css.match(/\.rl-sect\{[^}]*\}/)[0];
  assert.match(sect, /font-size:12px/);
  assert.match(sect, /font-weight:700/);
  assert.doesNotMatch(sect, /uppercase|letter-spacing/);
  assert.match(css.match(/\.rl-cnt\{[^}]*\}/)[0], /font-size:inherit/);
  assert.match(css.match(/\.rl-card\{[^}]*\}/)[0], /min-height:44px/);
  assert.match(css, /@media \(max-width:899px\)\{ \.rl-fold\{min-height:44px;\} \}/);
  assert.match(css.match(/\.rl-card\.rl-hit\{[^}]*\}/)[0], /inset 3px 0 0 var\(--accent\)/);
});

test('the Scheduled section (T Part 7): the model takes `scheduled` from the payload; empty draws nothing, a filled one draws after Needs you; the top sections come from one ordered list', () => {
  const m = mount();
  const mod = model(m, [], []);
  assert.deepEqual(mod.scheduled, []);
  assert.doesNotMatch(m.f.rlTopHtml(mod), /Scheduled/, 'an empty section draws nothing, not even its header');
  assert.match(m.f.rlTopHtml({ ...mod, scheduled: [{ job: 'x', at: 'today 15:00', in: 'next in 3h', words: 'Every day at 15:00', runId: 'r1' }] }), /Scheduled \(1\)[\s\S]*rl-sched-x/);
  assert.match(fnSrc('rlTopHtml'), /var sections = \[/);
});
