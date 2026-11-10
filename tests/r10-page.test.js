// R10 (fwd am17 + am20) on the page: Revise reopens the boxes WITH the `~` lines the answers added (the server's card) and the next Start drafting names the draft it follows;
// Start over does the same and drafts at once. The page's own functions run against stubs (the page works out nothing: the server decides what is kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('there is no separate Start over button: the Revise button becomes Start over after the second revise (fwd am14 item 3)', () => {
  assert.doesNotMatch(PAGE, /chat-startover/);
  assert.doesNotMatch(PAGE, /startOverBtn/);
  assert.match(PAGE, /id="chat-reopen-btn"[^>]*hidden>Revise<\/button>/);
  assert.match(PAGE, /id="chat-left-count"/);
});

test('the words: "2 revises left", "1 revise left", and none left reads Start over', () => {
  const f = new Function(`${fnSrc('reviseButtonFor')}\nreturn reviseButtonFor;`)();
  assert.deepEqual(f(2), { text: 'Revise', kind: 'revise', left: '2 revises left' });
  assert.deepEqual(f(1), { text: 'Revise', kind: 'revise', left: '1 revise left' });
  assert.deepEqual(f(0), { text: 'Start over', kind: 'startover', left: '' });
  assert.equal(f(undefined).left, '2 revises left', 'a state from before the count reads as a fresh draft');
});

/** renderMain at a plan menu with `left` revises */
function menuRender(left) {
  const reopenBtn = { hidden: true, textContent: 'Revise' };
  const revisesLeftEl = { hidden: true, textContent: '' };
  const src = `${fnSrc('mainButtonFor')}\n${fnSrc('askBoxOpenFor')}\n${fnSrc('reviseShownFor')}\n${fnSrc('reviseButtonFor')}\n${fnSrc('fitBox')}\n${fnSrc('renderMain')}\n`
    + 'var sched = null; var whenLocked = false; var mainAction = "none"; var fitCardBoxes = function(){}; var verdictValue = function(){ return "deterministic"; }; var reusePathNow = function(){ return false; };\nrenderMain();';
  new Function('msgInput', 'mainBtn', 'mainHint', 'sessionLive', 'lastState', 'startOk', 'startFrom', 'signClickedOnce', 'window', 'reopenBtn', 'revisesLeftEl', src)(
    { value: '', disabled: false, style: {}, scrollHeight: 10, offsetHeight: 0, clientHeight: 0 }, { textContent: '', disabled: false }, { textContent: '' }, true,
    { phase: 'confirming', pendingAsk: { kind: 'menu' }, specHash: 'h', revisesLeft: left }, true, null, false, { getComputedStyle: () => ({ maxHeight: '200px' }) }, reopenBtn, revisesLeftEl);
  return { reopenBtn, revisesLeftEl };
}
test('at the plan menu: the count shows beside Revise; with none left the same button reads Start over and the count is gone', () => {
  const two = menuRender(2);
  assert.equal(two.reopenBtn.hidden, false);
  assert.equal(two.reopenBtn.textContent, 'Revise');
  assert.equal(two.revisesLeftEl.textContent, '2 revises left');
  assert.equal(two.revisesLeftEl.hidden, false);
  assert.equal(menuRender(1).revisesLeftEl.textContent, '1 revise left');
  const none = menuRender(0);
  assert.equal(none.reopenBtn.textContent, 'Start over');
  assert.equal(none.reopenBtn.hidden, false);
  assert.equal(none.revisesLeftEl.hidden, true);
});

/** run doReopen(kind) against stubs; returns what it did */
async function reopen(kind, jobText = 'Summarise\n~ under 80 words\n~ at most 80 words', refuse = false) {
  const log = [];
  const factory = new Function('stubs', `
    var sessionId = "sabc1"; var lastMsgSig = "x"; var carryFromId = null; var carryKindVal = null; var mainBtn = stubs.mainBtn; var thread = stubs.thread;
    var authorGet = stubs.authorGet, authorPost = stubs.authorPost, chatPostOutcome = stubs.chatPostOutcome, openNewCard = stubs.openNewCard, setVal = stubs.setVal,
      fitCardBoxes = stubs.fitCardBoxes, chatActionOk = stubs.chatActionOk, chatActionFailed = stubs.chatActionFailed, refreshStartEnabled = stubs.refreshStartEnabled, doStart = stubs.doStart, escapeXml = stubs.escapeXml;
    ${fnSrc('doReopen')}
    return { doReopen: doReopen, carry: function(){ return [carryFromId, carryKindVal]; } };`);
  const w = factory({
    mainBtn: { disabled: false }, thread: { innerHTML: '' },
    authorGet: async (u) => { log.push(['get', u]); return { state: { card: { jobText } } }; },
    authorPost: async (u, b) => { log.push(['post', u, b]); return refuse ? { status: 409, body: { ok: false, error: 'used its 2 revises' } } : { status: 200, body: { ok: true } }; },
    chatPostOutcome: (r) => (r.status === 200 ? { ok: true } : { ok: false, error: r.body.error }), openNewCard: () => log.push(['open']), setVal: (id, v) => log.push(['set', id, v]),
    fitCardBoxes: () => {}, chatActionOk: () => {}, chatActionFailed: (e) => log.push(['failed', e]), refreshStartEnabled: () => {}, doStart: () => log.push(['start']), escapeXml: (x) => x,
  });
  w.doReopen(kind);
  await new Promise((r) => { setTimeout(r, 20); });
  return { log, carry: w.carry() };
}
test('Revise: the boxes reopen holding the card the server holds (the answered ~ lines), the draft is ended AS A REVISE, the next draft is told it follows by revise - and nothing starts', async () => {
  const r = await reopen('revise');
  assert.deepEqual(r.log.map((x) => x[0]), ['get', 'post', 'open', 'set']);
  assert.deepEqual(r.log[3], ['set', 'jf-job', 'Summarise\n~ under 80 words\n~ at most 80 words']);
  assert.equal(r.log[1][1], '/api/author/sabc1/abandon');
  assert.deepEqual(r.log[1][2], { kind: 'revise' });
  assert.deepEqual(r.carry, ['sabc1', 'revise']);
});
test('Start over: the same reopen (fields open, the person edits and drafts), told it is a start over - it does not draft at once', async () => {
  const r = await reopen('startover');
  assert.deepEqual(r.log.map((x) => x[0]), ['get', 'post', 'open', 'set']);
  assert.deepEqual(r.log[1][2], { kind: 'startover' });
  assert.deepEqual(r.carry, ['sabc1', 'startover']);
});
test('a revise the server refuses (the third) opens nothing and says why', async () => {
  const r = await reopen('revise', undefined, true);
  assert.deepEqual(r.log.map((x) => x[0]), ['get', 'post', 'failed']);
  assert.deepEqual(r.carry, [null, null]);
});
test('the Revise button posts the kind its words say: Start over when none are left', () => {
  assert.match(PAGE, /reopenBtn\.addEventListener\("click", function\(\)\{ doReopen\(reviseButtonFor\(lastState && lastState\.revisesLeft\)\.kind\); \}\);/);
});
test('the card sends the draft it follows and how, a cleared card forgets both, and a started draft takes over the link (a red revise redrafted is the next revise)', () => {
  assert.match(fnSrc('currentCard'), /carryFromId \? \{carryFrom: carryFromId, carryKind: carryKindVal === "startover" \? "startover" : "revise"\} : \{\}/);
  assert.match(fnSrc('resetCard'), /carryFromId = null;\s*carryKindVal = null/);
  assert.match(fnSrc('doStart'), /if\(carryFromId\) carryFromId = r\.body\.sessionId;/);
});
