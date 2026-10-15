// T Part 7 (PANEL-BUILD.md T addendum, G.8): the PAGE side of scheduling. The page's own functions are extracted VERBATIM from
// src/panel/index.html (brace-scan by name) and run against a tiny fake DOM; nothing here re-implements the page.
// hamr's found-by-clicking rules (A.8) each have a test: no Run/Sign & run after a sign, a visible change on each click,
// `[▶] starting` never `[?]`, a red NEXT, and every button word read from the server's one table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEDULE_WORDS } from '../src/schedulewords.js';

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
/** the server's words, as the page receives them (JSON round trip: plain data) */
const W = JSON.parse(JSON.stringify(SCHEDULE_WORDS));

/** a fake DOM: elements on demand with value/hidden/disabled/textContent/innerHTML, option lists, listeners, querySelector */
function fakeDom() {
  const els = {};
  const clicks = [];
  const events = [];
  const added = [];
  const mk = (id) => {
    const el = {
      id, hidden: false, value: '', disabled: false, readOnly: false, textContent: '', innerHTML: '', placeholder: '', handlers: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener(ev, fn) { el.handlers[ev] = fn; },
      appendChild(c) { el.children.push(c); },
      click() { clicks.push(id); },
      querySelector: (sel) => ({ classList: { add: (c) => added.push(`${sel}:${c}`) } }),
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._h ?? ''; }, set(v) { el._h = v; if (v === '') el.children = []; },
    });
    return el;
  };
  const document = {
    getElementById(id) { if (!els[id]) els[id] = mk(id); return els[id]; },
    createElement: () => ({ value: '', textContent: '' }),
    dispatchEvent(e) { events.push(e); },
  };
  return { document, els, clicks, events, added };
}

// ------------------------------------------------------------------ markup: where things sit
test('markup: ONE summary block (ENDED, NEXT, SCHEDULE rows) in the Run tab container ABOVE #run-actions; no second sched block, no note; the Audit tab holds none of it', () => {
  const run = PAGE.slice(PAGE.indexOf('id="panel-run"'), PAGE.indexOf('id="panel-audit"'));
  const audit = PAGE.slice(PAGE.indexOf('id="panel-audit"'), PAGE.indexOf('id="panel-details"'));
  assert.match(run, /id="summary-blocks"/);
  assert.ok(run.indexOf('id="summary-blocks"') < run.indexOf('id="ended-block"') && run.indexOf('id="ended-block"') < run.indexOf('id="run-actions"'));
  assert.doesNotMatch(run, /id="sched-block"|id="catchup-note"/, 'the twin block and the note are gone (RULED 2026-10-15)');
  assert.ok(run.indexOf('id="run-content"') < run.indexOf('id="summary-blocks"'), 'inside run-content');
  assert.doesNotMatch(audit, /ended-block/, 'gone from Audit');
});

test('markup: the When field sits between Destination and the cap row, hidden until the card is in schedule mode; its words are filled by the page from the server', () => {
  const card = PAGE.slice(PAGE.indexOf('id="job-card"'), PAGE.indexOf('id="chat-card-error"'));
  const dest = card.indexOf('id="jf-dest"');
  const when = card.indexOf('id="jf-when-field"');
  const caps = card.indexOf('data-testid="cap-row"');
  assert.ok(dest < when && when < caps);
  assert.match(card, /id="jf-when-field"[^>]*hidden/);
  assert.match(card, /<select id="jf-when"[^>]*><\/select>/, 'options come from the server table, none typed in the page');
  assert.doesNotMatch(card, /Every day at HH:MM|Sign schedule|Cancel schedule|By hand/, 'no schedule word typed into the markup');
});

// ------------------------------------------------------------------ the Run tab buttons
function runActions() {
  const bar = { innerHTML: '', hidden: true, querySelector: (sel) => { const m = /data-testid="([\w-]+)"/g; void m; return null; }, insertAdjacentHTML() {} };
  const opened = [];
  const f = new Function('document', 'authorPost', 'resumeInChat', 'scheduleInChat', `var stopAsked = {};\n${fnSrc('escapeXml')}\n${fnSrc('renderRunActions')}\nreturn renderRunActions;`)(
    { getElementById: () => bar }, () => Promise.resolve({ status: 200, body: { ok: true } }), () => {}, (d) => opened.push(d),
  );
  return { render: f, bar, opened };
}
const GREEN = { runid: 'r1', job: 'j', live: false, died: false, resume: null, ended: { reason: 'Goal met.', next: 'x', actions: [{ id: 'reuse' }] } };

test('Run tab: Schedule run shows only when the server says canSchedule; Cancel / modify only when it says scheduled; neither otherwise; the label comes from the server table', () => {
  const { render, bar } = runActions();
  render({ ...GREEN, schedule: { scheduled: false, canSchedule: true, words: W } });
  assert.match(bar.innerHTML, /data-testid="run-schedule">Schedule run</);
  assert.doesNotMatch(bar.innerHTML, /run-cancel-schedule/);
  render({ ...GREEN, schedule: { scheduled: true, canSchedule: false, words: W } });
  assert.match(bar.innerHTML, /data-testid="run-cancel-schedule">Cancel \/ modify schedule</);
  assert.doesNotMatch(bar.innerHTML, /run-schedule"/);
  render({ ...GREEN, schedule: { scheduled: false, canSchedule: false, words: W } });
  assert.doesNotMatch(bar.innerHTML, /run-schedule|run-cancel-schedule/, 'a job with no good run has no Schedule button');
  render({ ...GREEN });
  assert.doesNotMatch(bar.innerHTML, /run-schedule|run-cancel-schedule/, 'no schedule block at all = no button');
  // a reword is ONE edit: the page prints whatever the server table says
  render({ ...GREEN, schedule: { scheduled: false, canSchedule: true, words: { ...W, scheduleRun: 'Put on a timer' } } });
  assert.match(bar.innerHTML, />Put on a timer</);
});

test('Run tab: the schedule button is LAST, right after Reuse workflow; Cancel / modify shows on a red run and while a run is live', () => {
  const { render, bar } = runActions();
  render({ ...GREEN, schedule: { scheduled: false, canSchedule: true, words: W } });
  assert.ok(bar.innerHTML.indexOf('btn-reuse') < bar.innerHTML.indexOf('run-schedule'));
  render({ runid: 'r2', job: 'j', live: false, died: false, resume: null, ended: { reason: 'no', next: 'x', actions: [{ id: 'reuse' }] }, schedule: { scheduled: true, canSchedule: false, words: W } });
  assert.match(bar.innerHTML, /btn-reuse[\s\S]*run-cancel-schedule/, 'a red run of a scheduled job still has Cancel / modify, after Reuse workflow');
  render({ runid: 'r3', job: 'j', live: true, died: false, resume: null, ended: null, schedule: { scheduled: true, canSchedule: false, words: W } });
  assert.match(bar.innerHTML, /btn-stop[\s\S]*run-cancel-schedule/, 'cancel is never refused, so it shows while a run is live');
});

test('Run tab: the button starts and signs NOTHING — it only asks the server for the card and opens the Chat tab in schedule mode', async () => {
  const dom = fakeDom();
  const gets = [];
  const authorGet = (p) => { gets.push(p); return Promise.resolve({ ok: true, card: { jobName: 'j' }, scheduleCard: { scheduled: false } }); };
  class CE { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  const scheduleInChat = new Function('document', 'authorGet', 'CustomEvent', `${fnSrc('scheduleInChat')}\nreturn scheduleInChat;`)(dom.document, authorGet, CE);
  await scheduleInChat({ runid: 'r9', job: 'j', schedule: { fromRunid: 'r1' } });
  await new Promise((r) => { setImmediate(r); });
  assert.deepEqual(gets, ['/api/author/start-from?mode=schedule&runid=r1'], 'GET only, from the green the server named');
  assert.deepEqual(dom.clicks, ['tab-chat']);
  assert.equal(dom.events[0].type, 'bareloop-schedule');
  assert.equal(dom.events[0].detail.runid, 'r1');
});

// ------------------------------------------------------------------ the blocks
const endedRender = (dom) => new Function('document', `${fnSrc('escapeXml')}\n${fnSrc('summaryRow')}\n${fnSrc('renderEnded')}\nvar lastEndedSig = null;\nreturn renderEnded;`)(dom.document);

test('the ONE block: ENDED, NEXT, SCHEDULE in that order; ENDED paints the server\'s dated text; a schedule shows its words and its second line (RULED 2026-10-15)', () => {
  const dom = fakeDom();
  const render = endedRender(dom);
  const box = dom.document.getElementById('ended-block');
  render({
    runid: 'a', glyph: '\u2713', ended: { reason: 'Goal met.', next: 'Accept it, or Reuse workflow.' }, endedText: '10/15 13:40 \u00b7 passed \u00b7 Goal met.', resume: null,
    schedule: { scheduled: true, text: 'When a new file arrives in ~/bareloop-inbox/', line2: 'last 10/15 13:40 \u00b7 run-4 \u00b7 passed \u00b7 next: waiting for a new file', problem: false, words: W },
  });
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, />ENDED<[\s\S]*data-testid="ended-reason">10\/15 13:40 \u00b7 passed \u00b7 Goal met\.<[\s\S]*>NEXT<[\s\S]*>SCHEDULE<[\s\S]*data-testid="sched-text">When a new file arrives in ~\/bareloop-inbox\/<[\s\S]*data-testid="sched-line2">last 10\/15 13:40/);
  assert.equal(box.className, 'ended-block green');
  assert.doesNotMatch(box.innerHTML, /is-red/);
});

test('no schedule: SCHEDULE By hand is still a row, for a finished run AND a running one (no ENDED yet)', () => {
  const dom = fakeDom();
  const render = endedRender(dom);
  const box = dom.document.getElementById('ended-block');
  render({ runid: 'a', glyph: '\u2713', ended: { reason: 'Goal met.', next: 'x' }, endedText: '10/15 13:40 \u00b7 passed \u00b7 Goal met.', schedule: { scheduled: false, canSchedule: true, words: W } });
  assert.match(box.innerHTML, />SCHEDULE<[\s\S]*data-testid="sched-text">By hand</);
  render({ runid: 'b', glyph: '\u25b6', ended: null, endedText: null, schedule: { scheduled: false, canSchedule: false, words: W } });
  assert.equal(box.hidden, false);
  assert.doesNotMatch(box.innerHTML, />ENDED<|>NEXT</);
  assert.match(box.innerHTML, />SCHEDULE<[\s\S]*>By hand</);
});

test('a schedule problem: the SCHEDULE row (label and text) AND the frame are red; a fixed schedule goes back to the run\'s own colours', () => {
  const dom = fakeDom();
  const render = endedRender(dom);
  const box = dom.document.getElementById('ended-block');
  const base = { runid: 'a', glyph: '\u2713', ended: { reason: 'Goal met.', next: 'x' }, endedText: '10/15 13:40 \u00b7 passed \u00b7 Goal met.' };
  render({ ...base, schedule: { scheduled: true, text: 'Every day at 08:15', line2: 'last 10/15 13:25 \u00b7 refused: the destination does not exist \u00b7 next: fix it in Cancel / modify schedule', problem: true, words: W } });
  assert.equal(box.className, 'ended-block red');
  const sched = box.innerHTML.slice(box.innerHTML.indexOf('>SCHEDULE<') - 80);
  assert.match(sched, /^[^]*class="ended-row is-red"><span class="ended-label">SCHEDULE</, 'the whole row (label and both lines) is red');
  assert.equal((box.innerHTML.match(/is-red/g) || []).length, 1, 'only the SCHEDULE row');
  render({ ...base, schedule: { scheduled: true, text: 'Every day at 08:15', line2: 'last 10/15 13:50 \u00b7 run-5 \u00b7 passed \u00b7 next Thu 10/16 08:15', problem: false, words: W } });
  assert.equal(box.className, 'ended-block green');
  assert.doesNotMatch(box.innerHTML, /is-red/);
});

test('ENDED is painted by renderRun into the Run tab block; the old SCHEDULED twin renderer is gone', () => {
  const src = fnSrc('renderRun');
  assert.ok(src.indexOf('renderEnded(detail);') !== -1);
  assert.doesNotMatch(PAGE, /renderScheduled|summaryRows\(/);
});

// ------------------------------------------------------------------ the runs list
test('runs list: Scheduled is one more section after Needs you; a card jumps to the job\'s head run; a file trigger shows no clock time; a job with no run is a plain box', () => {
  const rlScheduledCardHtml = new Function('escapeXml', `${fnSrc('runLabel')}\n${fnSrc('rlRunTagHtml')}\n${fnSrc('rlScheduledCardHtml')}\nreturn rlScheduledCardHtml;`)((x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const clock = rlScheduledCardHtml({ job: 'changelog-a', at: 'today 15:00', in: 'next in 3h', words: 'Every day at 15:00', runId: 'r7' });
  assert.match(clock, /^<button class="rl-card" type="button" data-rl-jump="r7" data-testid="rl-sched-changelog-a">/);
  assert.match(clock, /class="dot grey"/);
  assert.match(clock, /rl-rest">&middot; today 15:00</, 'P9 v2 O item 7 (fwd am6): same size as the job name, after a middot');
  assert.doesNotMatch(clock, /rl-faint/);
  assert.match(clock, /rl-l2">next in 3h · Every day at 15:00</);
  // RULED 2026-10-15: the name reads `job · run-N` when the server names the run the card opens
  const named = rlScheduledCardHtml({ job: 'change2', at: 'today 15:00', in: 'next in 3h', words: 'w', runId: 'r7', runNo: 2 });
  assert.equal(named.match(/<span class="rl-l1">([\s\S]*?)<\/span><span class="rl-l2">/)[1].replace(/<[^>]*>/g, '').replace(/&middot;/g, '\u00B7'), 'change2 \u00B7 run-2 \u00B7 today 15:00');
  const file = rlScheduledCardHtml({ job: 'inbox', at: null, in: null, words: 'When a new file arrives in ~/reports/inbox/', runId: 'r8' });
  assert.doesNotMatch(file, /rl-faint|rl-rest/, 'a file trigger has no clock time, nothing is made up');
  assert.match(file, /rl-l2">When a new file arrives in ~\/reports\/inbox\/</);
  const plain = rlScheduledCardHtml({ job: 'orphan', at: null, in: null, words: 'Every day at 09:00', runId: null });
  assert.match(plain, /^<div class="rl-card"/);
  assert.doesNotMatch(plain, /data-rl-jump/);
  // the section list order
  const top = fnSrc('rlTopHtml');
  assert.ok(top.indexOf('"Running now"') < top.indexOf('"Needs you"') && top.indexOf('"Needs you"') < top.indexOf('"Scheduled"'));
});

test('runs list: rlTopHtml draws Scheduled (N) with the cards, after Needs you', () => {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = new Function('escapeXml', 'rlJumpCardHtml', `${fnSrc('rlSectHtml')}\n${fnSrc('runLabel')}\n${fnSrc('rlRunTagHtml')}\n${fnSrc('rlScheduledCardHtml')}\n${fnSrc('rlTopHtml')}\nreturn rlTopHtml;`)(esc, (r) => `<j ${r.runid}>`);
  const html = f({ running: [{ runid: 'a' }], needs: [{ runid: 'b' }], scheduled: [{ job: 'x', at: 'today 15:00', in: 'next in 1h', words: 'w', runId: 'r1' }, { job: 'y', at: null, in: null, words: 'v', runId: 'r2' }] });
  assert.match(html, /Running now \(1\)[\s\S]*Needs you \(1\)[\s\S]*Scheduled \(2\)[\s\S]*rl-sched-x[\s\S]*rl-sched-y/);
  assert.doesNotMatch(f({ running: [], needs: [], scheduled: [] }), /Scheduled/);
});

test('a fired run that is still spawning reads [▶] starting, never [?]: the page paints a starting detail as a running glyph with the starting words', () => {
  const src = fnSrc('renderRun');
  assert.match(src, /detail\.starting/);
  assert.match(src, /setRunHeader\("\\u25B6"/, 'the starting header uses the running glyph');
  assert.doesNotMatch(src.slice(src.indexOf('if(detail.starting)'), src.indexOf('document.getElementById("audit-select-empty").hidden = true;')), /died|\?/);
});

// ------------------------------------------------------------------ the card: When field, one main button, two clicks
/** the chat-card functions under test, over a fake DOM, with every outside call recorded */
function card({ post } = {}) {
  const dom = fakeDom();
  const g = (id) => dom.document.getElementById(id);
  const posts = [];
  const log = { reset: 0, failed: [], refreshed: 0, selected: [], renders: 0, timers: [] };
  const authorPost = (path, body) => { posts.push({ path, body }); return Promise.resolve(post ? post(path, body, posts) : { status: 200, body: { ok: true, words: 'Every day at 13:15', hash: 'h1', cancel: false } }); };
  const src = [
    fnSrc('byId'), fnSrc('whenTriggerFromBoxes'), fnSrc('whenCanon'), fnSrc('whenChanged'), fnSrc('whenShowSubs'), fnSrc('paintWhen'),
    fnSrc('whenEdited'), fnSrc('doWhenSign'), fnSrc('mainButtonFor'),
  ].join('\n');
  const ctx = new Function('document', 'authorPost', 'resetCard', 'chatActionFailed', 'refreshRunsList', 'selectRun', 'renderMain', 'setTimeout', `
    var sched = null, whenHash = null, whenConfirm = null, whenBusy = false, whenLocked = false, currentRunid = 'r1';
    var WHEN_KINDS = ["hand", "daily", "weekdays", "weekly", "file-updated", "new-file"];
    ${src}
    return {
      mainButtonFor: mainButtonFor, doWhenSign: doWhenSign, paintWhen: paintWhen, whenEdited: whenEdited, whenChanged: whenChanged, whenTriggerFromBoxes: whenTriggerFromBoxes,
      get: function(){ return {sched: sched, whenHash: whenHash, whenConfirm: whenConfirm, whenBusy: whenBusy, whenLocked: whenLocked}; },
      setSched: function(s){ sched = s; }, setLocked: function(v){ whenLocked = v; },
      stateForButton: function(){ return {changed: whenChanged(), refused: !!sched.refusal, cancel: byId("jf-when").value === "hand", confirm: whenConfirm, busy: whenBusy, words: sched.words}; },
    };`)(dom.document, authorPost, () => { log.reset += 1; }, (s) => log.failed.push(s), () => { log.refreshed += 1; }, (id) => log.selected.push(id), () => { log.renders += 1; }, (fn, ms) => { log.timers.push({ fn, ms }); });
  return { ...ctx, dom, g, posts, log };
}
const SCHED_NONE = { job: 'j', runid: 'r1', words: W, cur: null, scheduled: false, refusal: null, now: null };
const SCHED_DAILY = { job: 'j', runid: 'r1', words: W, cur: { kind: 'daily', hour: 9, minute: 0 }, scheduled: true, refusal: null, now: 'Every day at 09:00', base: { inputs: 'notes: /in/n.txt', dest: '/out/', capUsd: '0.5', capTime: '20' } };
const button = (c, extra = {}) => c.mainButtonFor({ session: false, startOk: true, when: { ...c.stateForButton(), ...extra } }, true, true);

test('card: When options come from the server table; the first option reads Cancel schedule on a scheduled job, By hand otherwise; Now: shows the current words', () => {
  const c = card();
  c.setSched(SCHED_DAILY);
  c.paintWhen();
  assert.equal(c.g('jf-when-field').hidden, false);
  const sel = c.g('jf-when');
  assert.deepEqual(sel.children.map((o) => o.textContent), ['Cancel schedule', 'Every day at HH:MM', 'Weekdays at HH:MM', 'Every <day> at HH:MM', 'When <file> is updated', 'When a new file arrives in <folder>']);
  assert.equal(sel.value, 'daily');
  assert.equal(c.g('jf-when-time').value, '09:00');
  assert.equal(c.g('jf-when-now').textContent, 'Now: Every day at 09:00');
  const d = card();
  d.setSched(SCHED_NONE);
  d.paintWhen();
  assert.equal(d.g('jf-when').children[0].textContent, 'By hand');
  assert.equal(d.g('jf-when').value, 'hand');
  assert.equal(d.g('jf-when-now').textContent, '');
});

test('card: sub-boxes show and hide with the kind — the day only for weekly, the time for the three clock kinds, the path for the two file kinds', () => {
  const c = card();
  c.setSched(SCHED_NONE);
  c.paintWhen();
  const seen = (kind) => { c.g('jf-when').value = kind; c.whenEdited(); return [c.g('jf-when-clock').hidden, c.g('jf-when-day').hidden, c.g('jf-when-filebox').hidden]; };
  assert.deepEqual(seen('hand'), [true, true, true]);
  assert.deepEqual(seen('daily'), [false, true, true]);
  assert.deepEqual(seen('weekdays'), [false, true, true]);
  assert.deepEqual(seen('weekly'), [false, false, true]);
  assert.deepEqual(seen('file-updated'), [true, true, false]);
  assert.deepEqual(seen('new-file'), [true, true, false]);
  assert.equal(c.g('jf-when-path').placeholder, '/full/path/to/folder');
});

test('card: a refused job (no good run) disables the select and every sub-box and shows the reason where Now: would be', () => {
  const c = card();
  c.setSched({ ...SCHED_NONE, refusal: 'This job has not had a good run yet. Nothing was changed.' });
  c.paintWhen();
  for (const id of ['jf-when', 'jf-when-day', 'jf-when-time', 'jf-when-path']) assert.equal(c.g(id).disabled, true, id);
  assert.equal(c.g('jf-when-now').textContent, 'This job has not had a good run yet. Nothing was changed.');
  assert.equal(c.whenChanged(), false, 'a refused card never offers Sign schedule');
});

test('main button: a schedule card never reads Sign & run: unchanged = disabled Sign schedule with the nothing-changed words; changed = Sign schedule; By hand on a scheduled job = Cancel schedule', () => {
  const c = card();
  c.setSched(SCHED_NONE);
  c.paintWhen();
  const idle = c.mainButtonFor({ session: false, startOk: true, when: c.stateForButton() }, true, true);
  assert.deepEqual([idle.text, idle.action, idle.disabled, idle.hint], ['Sign schedule', 'none', true, W.nothingChanged]);
  c.g('jf-when').value = 'daily'; c.g('jf-when-time').value = '13:15'; c.whenEdited();
  assert.deepEqual([button(c).text, button(c).action], ['Sign schedule', 'when-sign-prepare']);
  // a scheduled job: unchanged is disabled, By hand is Cancel schedule
  const d = card();
  d.setSched(SCHED_DAILY);
  d.paintWhen();
  d.g('jf-inputs').value = 'notes: /in/n.txt'; d.g('jf-dest').value = '/out/'; d.g('jf-cap-money').value = '0.5'; d.g('jf-cap-time').value = '20'; // the boxes as the card opened
  assert.deepEqual([button(d).text, button(d).action, button(d).disabled], ['Sign schedule', 'none', true]);
  d.g('jf-when').value = 'hand'; d.whenEdited();
  assert.deepEqual([button(d).text, button(d).action], ['Cancel schedule', 'when-sign-prepare']);
  // a different time is a change too
  d.g('jf-when').value = 'daily'; d.g('jf-when-time').value = '10:30'; d.whenEdited();
  assert.equal(button(d).text, 'Sign schedule');
  d.g('jf-when-time').value = '09:00'; d.whenEdited();
  assert.deepEqual([button(d).text, button(d).action, button(d).disabled], ['Sign schedule', 'none', true], 'back to the signed value = unchanged = disabled');
  // every button word is the server\'s: a reword is one edit
  const e = card();
  e.setSched({ ...SCHED_NONE, words: { ...W, signSchedule: 'Lock it in' } });
  e.paintWhen();
  e.g('jf-when').value = 'daily'; e.whenEdited();
  assert.equal(button(e).text, 'Lock it in');
});

test('two clicks: click 1 posts schedule-prepare ($0) and the label becomes "Confirm: <words>"; the button dims while the request is out; editing When drops the hash', async () => {
  const c = card();
  c.setSched(SCHED_NONE);
  c.paintWhen();
  c.g('jf-when').value = 'daily'; c.g('jf-when-time').value = '13:15'; c.whenEdited();
  c.g('jf-inputs').value = 'notes: /in/n.txt'; c.g('jf-dest').value = 'output/'; c.g('jf-cap-money').value = '1.5'; c.g('jf-cap-time').value = '10';
  const p = c.doWhenSign();
  assert.equal(c.get().whenBusy, true, 'busy while the request is out');
  assert.equal(button(c).disabled, true, 'dimmed');
  await p;
  assert.equal(c.get().whenBusy, false);
  assert.equal(c.posts.length, 1);
  assert.equal(c.posts[0].path, '/api/author/schedule-prepare');
  assert.deepEqual(c.posts[0].body, { runid: 'r1', when: { kind: 'daily', hour: 13, minute: 15 }, inputs: 'notes: /in/n.txt', destination: 'output/', capUsd: 1.5, maxWallMs: 600000 });
  assert.equal(c.get().whenHash, 'h1');
  assert.deepEqual([button(c).text, button(c).action], ['Confirm: every day at 13:15', 'when-sign']);
  assert.equal(c.log.reset, 0, 'nothing cleared yet');
  c.g('jf-when-time').value = '14:00'; c.whenEdited();
  assert.equal(c.get().whenHash, null, 'editing a When box drops the hash');
  assert.equal(button(c).text, 'Sign schedule');
});

test('click 2 posts /api/author/schedule with the hash, clears the card to the empty New job card, locks the button ~1.5 s, and touches NO run route', async () => {
  const c = card({ post: (path) => (path.endsWith('schedule-prepare') ? { status: 200, body: { ok: true, words: 'Every day at 13:15', hash: 'h1' } } : { status: 200, body: { ok: true, armed: true } }) });
  c.setSched(SCHED_NONE);
  c.paintWhen();
  c.g('jf-when').value = 'daily'; c.g('jf-when-time').value = '13:15'; c.whenEdited();
  await c.doWhenSign();
  await c.doWhenSign();
  assert.deepEqual(c.posts.map((x) => x.path), ['/api/author/schedule-prepare', '/api/author/schedule']);
  assert.equal(c.posts[1].body.hash, 'h1');
  assert.ok(c.posts.every((x) => /\/api\/author\/schedule(-prepare)?$/.test(x.path)), 'it never reaches /api/author/start or the run routes');
  assert.equal(c.log.reset, 1, 'the card clears (resetCard -> the default empty New job card)');
  assert.equal(c.get().whenLocked, true);
  assert.deepEqual(c.log.timers.map((t) => t.ms), [1500]);
  assert.equal(c.log.refreshed, 1, 'the lists refresh so the Scheduled card and the SCHEDULED block appear');
  assert.deepEqual(c.log.selected, ['r1']);
  // after the clear the card is the New job card: the button is DEAD and reads Start drafting — no Run / Sign & run invitation anywhere
  c.setSched(null);
  const dead = c.mainButtonFor({ session: false, startOk: true, whenLocked: true }, true, false);
  assert.deepEqual([dead.text, dead.disabled], ['Start drafting', true]);
  assert.doesNotMatch(dead.text, /run/i);
  c.log.timers[0].fn();
  assert.equal(c.get().whenLocked, false, 'alive again after 1.5 s');
  assert.equal(c.mainButtonFor({ session: false, startOk: true, whenLocked: false }, true, false).disabled, false);
});

test('cancel: By hand on a scheduled job sends when null; click 1 label "Confirm: cancel schedule"', async () => {
  const c = card({ post: (path) => ({ status: 200, body: { ok: true, words: 'Cancel schedule', hash: 'hc', cancel: true } }) });
  c.setSched(SCHED_DAILY);
  c.paintWhen();
  c.g('jf-when').value = 'hand'; c.whenEdited();
  await c.doWhenSign();
  assert.equal(c.posts[0].body.when, null);
  assert.equal(button(c).text, 'Confirm: cancel schedule');
});

test('a refusal says why on the card, drops the hash, and the card stays (nothing cleared, nothing signed)', async () => {
  const c = card({ post: () => ({ status: 409, body: { ok: false, say: 'What you were shown is not what is on the card now. Nothing was signed. Look again, then sign.' } }) });
  c.setSched(SCHED_NONE);
  c.paintWhen();
  c.g('jf-when').value = 'daily'; c.whenEdited();
  await c.doWhenSign();
  assert.match(c.g('jf-err-when').textContent, /^What you were shown is not what is on the card now/);
  assert.equal(c.get().whenHash, null);
  assert.equal(c.log.reset, 0);
  assert.equal(button(c).text, 'Sign schedule');
});

test('the main button\'s click handler routes the two schedule actions to doWhenSign and nothing else', () => {
  const src = PAGE.slice(PAGE.indexOf('mainBtn.addEventListener("click"'));
  assert.match(src, /mainAction === "when-sign-prepare" \|\| mainAction === "when-sign"\) doWhenSign\(\)/);
});

test('Edit in chat is gone from the page (v1.101): no editInChat, no btn-edit-chat, no bareloop-edit event; Reuse workflow never mentions an edit note', () => {
  assert.doesNotMatch(PAGE, /Edit in chat|editInChat|btn-edit-chat|bareloop-edit|applyEdit|mode=edit/);
  assert.doesNotMatch(fnSrc('reuseWorkflow'), /editNote/);
});

test('the scheduling words live in ONE table: the page types none of them', () => {
  const scriptStart = PAGE.indexOf('<script>');
  const script = PAGE.slice(scriptStart);
  for (const w of ['Sign schedule', 'Schedule run', 'Cancel / modify schedule', 'Confirm: ', 'Every day at HH:MM']) {
    assert.equal(script.includes(`"${w}"`), false, `"${w}" must come from SCHEDULE_WORDS, not the page`);
  }
});

// hamr's live bug 2026-10-15 (run mv9euoam): on a card opened by Cancel / modify schedule he changed only Destination and Inputs, left When
// as signed, pressed the main button and a plain hand run started; the schedule was not re-signed. Root cause: whenChanged() looked at
// the When field alone, so the button stayed the Reuse card's Sign & run (action "start", POST /api/author/start).
test('modify schedule: changing only Inputs / Destination / a cap (When as signed) makes the button Sign schedule and click 1 posts schedule-prepare, never the start route', async () => {
  const c = card();
  c.setSched(SCHED_DAILY);
  c.paintWhen();
  c.g('jf-inputs').value = 'notes: /in/n.txt'; c.g('jf-dest').value = '/out/'; c.g('jf-cap-money').value = '0.5'; c.g('jf-cap-time').value = '20';
  assert.deepEqual([button(c).action, button(c).disabled], ['none', true], 'nothing edited = disabled, never the run button');
  c.g('jf-dest').value = '/home/hamr/bareloop-out';
  c.g('jf-inputs').value = 'changelog: /home/hamr/x/CHANGELOG.md';
  assert.deepEqual([button(c).text, button(c).action], ['Sign schedule', 'when-sign-prepare']);
  await c.doWhenSign();
  assert.deepEqual(c.posts.map((x) => x.path), ['/api/author/schedule-prepare']);
  assert.equal(c.posts[0].body.destination, '/home/hamr/bareloop-out');
  assert.deepEqual(c.posts[0].body.when, { kind: 'daily', hour: 9, minute: 0 });
  // putting the boxes back to the signed values is unchanged again
  c.g('jf-dest').value = '/out/'; c.g('jf-inputs').value = 'notes: /in/n.txt';
  assert.deepEqual([button(c).action, button(c).disabled], ['none', true]);
  // a job with no schedule (Schedule run card): box edits alone give nothing to sign; the button is still never a run
  const d = card();
  d.setSched({ ...SCHED_NONE, base: { inputs: 'a: /x', dest: '/o/', capUsd: '1', capTime: '' } });
  d.paintWhen();
  d.g('jf-dest').value = '/elsewhere/';
  assert.deepEqual([button(d).action, button(d).disabled], ['none', true]);
});

test('schedule card: no state of the card ever yields the start or sign (run) actions', () => {
  for (const base of [SCHED_NONE, SCHED_DAILY, { ...SCHED_NONE, refusal: 'no good run' }]) {
    const c = card();
    c.setSched(base);
    c.paintWhen();
    for (const kind of ['hand', 'daily', 'weekly', 'new-file']) {
      c.g('jf-when').value = kind; c.g('jf-when-time').value = '10:00'; c.g('jf-when-path').value = '/p'; c.whenEdited();
      for (const confirm of [null, 'every day at 10:00']) {
        const b = c.mainButtonFor({ session: false, startOk: true, when: { ...c.stateForButton(), confirm } }, true, true);
        assert.equal(['start', 'sign', 'sign-prepare'].includes(b.action), false, `${kind}/${confirm}: ${b.action}`);
      }
    }
  }
  const r = card();
  r.setSched({ ...SCHED_NONE, refusal: 'no good run' });
  assert.equal(r.mainButtonFor({ session: false, startOk: true, when: r.stateForButton() }, true, true).hint, '', 'a refused card shows its own reason, not the nothing-changed words');
});

test('modify schedule: the page captures the card\'s starting boxes when it opens the schedule card, and any box edit repaints the main button', () => {
  const open = fnSrc('applyScheduleCard');
  assert.match(open, /base:\s*\{[^}]*jf-inputs[^}]*jf-dest/);
  assert.match(PAGE, /\["jf-inputs", "jf-dest", "jf-cap-money", "jf-cap-time"\]\.forEach\(function\(id\)\{ byId\(id\)\.addEventListener\("input", function\(\)\{ if\(!sched\) return; if\(whenHash !== null\) whenEdited\(\); else renderMain\(\); \}\); \}\);/);
});

test('RULED 2026-10-15 (v1.104): the Audit draws the server\'s schedule section FIRST and FOLDED, with the drafting/step toggle look; the old folded group and first row are gone', () => {
  const src = fnSrc('renderAuditGroups');
  assert.ok(src.indexOf('detail.scheduleSection') !== -1 && src.indexOf('detail.scheduleSection') < src.indexOf('detail.needsAudit'), 'at the top, the Needs-you line stays after it');
  assert.match(src, /gBtn\.className = "btn audit-part-toggle";\s*gBtn\.setAttribute\("aria-expanded", "false"\)/, 'same toggle class as the step sections; folded on open');
  assert.match(src, /gBody\.hidden = true/);
  assert.doesNotMatch(src, /scheduleGroup/);
});

test('live defect 2026-10-15 (mv9vzze6): the schedule section rows use the same table classes as the drafting/step rows (label column, dotted separators), not bare flex spans', () => {
  const src = fnSrc('renderAuditGroups');
  assert.match(src, /audit-table-scroll/, 'wrapped in the same scroll wrapper as the step tables');
  assert.match(src, /<table class="rounds-table"[^>]*data-testid="audit-schedule-table"/, 'the same rounds-table class');
  assert.match(src, /<tr><td class="hint"/, 'one table row per try, label in the first cell');
  assert.doesNotMatch(src, /audit-sched-row/, 'no run-together flex rows');
});
