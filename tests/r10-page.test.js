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

test('the Start over button sits beside Revise, shown by the same pure function, with fwd\'s words', () => {
  assert.match(PAGE, /id="chat-startover-btn"[^>]*hidden>Start over<\/button>/);
  assert.match(fnSrc('renderMain'), /startOverBtn\.hidden = !reviseShownFor\(st\)/);
});

/** run doReopen against stubs; returns what it did */
async function reopen(thenStart, jobText = 'Summarise\n~ under 80 words\n~ at most 80 words') {
  const log = [];
  let carry = null;
  const factory = new Function('stubs', `
    var sessionId = "sabc1"; var lastMsgSig = "x"; var carryFromId = null; var mainBtn = stubs.mainBtn; var thread = stubs.thread;
    var authorGet = stubs.authorGet, authorPost = stubs.authorPost, chatPostOutcome = stubs.chatPostOutcome, openNewCard = stubs.openNewCard, setVal = stubs.setVal,
      fitCardBoxes = stubs.fitCardBoxes, chatActionOk = stubs.chatActionOk, chatActionFailed = stubs.chatActionFailed, refreshStartEnabled = stubs.refreshStartEnabled, doStart = stubs.doStart, escapeXml = stubs.escapeXml;
    ${fnSrc('doReopen')}
    return { doReopen: doReopen, carry: function(){ return carryFromId; } };`);
  const w = factory({
    mainBtn: { disabled: false }, thread: { innerHTML: '' },
    authorGet: async (u) => { log.push(['get', u]); return { state: { card: { jobText } } }; },
    authorPost: async (u) => { log.push(['post', u]); return { status: 200, body: { ok: true } }; },
    chatPostOutcome: (r) => ({ ok: r.status === 200 }), openNewCard: () => log.push(['open']), setVal: (id, v) => log.push(['set', id, v]),
    fitCardBoxes: () => {}, chatActionOk: () => {}, chatActionFailed: (e) => log.push(['failed', e]), refreshStartEnabled: () => {}, doStart: () => log.push(['start']), escapeXml: (x) => x,
  });
  w.doReopen(thenStart);
  await new Promise((r) => { setTimeout(r, 20); });
  carry = w.carry();
  return { log, carry };
}
test('Revise: the boxes reopen holding the card the server holds (the answered ~ lines), the draft is ended, the next draft is told what it follows - and nothing starts', async () => {
  const r = await reopen(false);
  assert.deepEqual(r.log.map((x) => x[0]), ['get', 'post', 'open', 'set']);
  assert.deepEqual(r.log[3], ['set', 'jf-job', 'Summarise\n~ under 80 words\n~ at most 80 words']);
  assert.equal(r.log[1][1], '/api/author/sabc1/abandon');
  assert.equal(r.carry, 'sabc1');
});
test('Start over: the same, and the card is drafted at once', async () => {
  const r = await reopen(true);
  assert.deepEqual(r.log.map((x) => x[0]), ['get', 'post', 'open', 'set', 'start']);
  assert.equal(r.carry, 'sabc1');
});
test('the card sends the draft it follows, and a cleared card forgets it', () => {
  assert.match(fnSrc('currentCard'), /carryFromId \? \{carryFrom: carryFromId\} : \{\}/);
  assert.match(fnSrc('resetCard'), /carryFromId = null/);
});
