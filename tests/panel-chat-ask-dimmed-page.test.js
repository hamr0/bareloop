// hamr's live click-through 2026-10-05: the ask box is dimmed until something asks for a reply. Same posture as p5-startfrom-page.test.js (page functions extracted, fake DOM).
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

function renderMainWith(state) {
  const msg = { value: state.typed || '', disabled: false, style: {}, scrollHeight: 10, offsetHeight: 0, clientHeight: 0 };
  const mainBtn = { textContent: '', disabled: false };
  const mainHint = { textContent: '' };
  const src = `${fnSrc('mainButtonFor')}\n${fnSrc('askBoxOpenFor')}\n${fnSrc('reviseShownFor')}\n${fnSrc('fitBox')}\n${fnSrc('renderMain')}\n`
    + 'var mainAction = "none"; var reopenBtn = { hidden: true }; var fitCardBoxes = function(){}; var verdictValue = function(){ return "deterministic"; };\nrenderMain();\nreturn mainAction;';
  // eslint-disable-next-line no-new-func
  new Function('msgInput', 'mainBtn', 'mainHint', 'sessionLive', 'lastState', 'startOk', 'startFrom', 'signClickedOnce', 'window', src)(
    msg, mainBtn, mainHint, state.sessionLive, state.lastState, true, null, false, { getComputedStyle: () => ({ maxHeight: '200px' }) });
  return { msg, mainBtn };
}

test('ask box: disabled (and emptied) with no session, no pending ask, or while waiting on install', () => {
  const none = renderMainWith({ sessionLive: false, lastState: null, typed: 'leftover' });
  assert.equal(none.msg.disabled, true);
  assert.equal(none.msg.value, '', 'cleared when disabled');
  assert.equal(none.mainBtn.textContent, 'Start drafting', 'mainButtonFor still sees typed-text-empty');
  const working = renderMainWith({ sessionLive: true, lastState: { phase: 'drafting', pendingAsk: null } });
  assert.equal(working.msg.disabled, true);
  const install = renderMainWith({ sessionLive: true, lastState: { phase: 'install-needed', pendingAsk: { kind: 'install-needed' } } });
  assert.equal(install.msg.disabled, true);
  assert.equal(install.mainBtn.textContent, 'Check again');
});

test('ask box: dimmed at the plan menu (Sign & run or Revise, never typed text), enabled for any question the session asks', () => {
  const menu = renderMainWith({ sessionLive: true, lastState: { phase: 'confirming', pendingAsk: { kind: 'menu' } } });
  assert.equal(menu.msg.disabled, true);
  const typed = renderMainWith({ sessionLive: true, typed: 'shorter goal', lastState: { phase: 'confirming', pendingAsk: { kind: 'menu' } } });
  assert.equal(typed.msg.value, '', 'a change request typed at the plan is dropped, not sent');
  assert.equal(typed.mainBtn.textContent, 'Sign & run');
  const typedQ = renderMainWith({ sessionLive: true, typed: 'my answer', lastState: { phase: 'asking', pendingAsk: { kind: 'question' } } });
  assert.equal(typedQ.msg.value, 'my answer', 'enabled keeps typed text');
  assert.equal(typedQ.mainBtn.textContent, 'Send');
  const q = renderMainWith({ sessionLive: true, lastState: { phase: 'asking', pendingAsk: { kind: 'question' } } });
  assert.equal(q.msg.disabled, false);
});

test('ask box dimmed style: the disabled rule keeps the placeholder readable and out-ranks the soft-white rules', () => {
  assert.match(PAGE, /#chat-msg:disabled\{[^}]*opacity:\.55/);
  assert.match(PAGE, /#chat-msg:disabled\{[^}]*cursor:not-allowed/);
});
