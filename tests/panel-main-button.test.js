// hamr's live click-through 2026-10-05: ONE wide button below the message box, wording from ONE pure function.
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
const mainButtonFor = () => new Function(`${fnSrc('mainButtonFor')}\nreturn mainButtonFor;`)();
const ask = (kind) => ({ kind });

test('mainButtonFor: the table (state, typed-text-empty, reuse) -> wording, action, disabled, hint', () => {
  const f = mainButtonFor();
  const rows = [
    // [state, textEmpty, reuse, expected]
    [{ session: false, startOk: true }, true, false, { text: 'Start drafting', action: 'start', disabled: false, hint: '' }],
    [{ session: false, startOk: false }, true, false, { text: 'Start drafting', action: 'start', disabled: true, hint: '' }],
    [{ session: false, startOk: true }, false, false, { text: 'Start drafting', action: 'start', disabled: false, hint: '' }],
    [{ session: false, startOk: true }, true, true, { text: 'Sign & run', action: 'start', disabled: false, hint: '' }],
    [{ session: true, phase: 'install-needed', pendingAsk: ask('install-needed') }, true, false, { text: 'Check again', action: 'check-deps', disabled: false, hint: '' }],
    [{ session: true, phase: 'install-needed', pendingAsk: ask('install-needed') }, false, false, { text: 'Check again', action: 'check-deps', disabled: false, hint: '' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('question') }, false, false, { text: 'Send', action: 'send', disabled: false, hint: '' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('question') }, true, false, { text: 'Send', action: 'send', disabled: true, hint: '' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('menu'), revisesLeft: 2 }, false, false, { text: 'Send', action: 'revise', disabled: false, hint: '2 changes left' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('menu'), revisesLeft: 1 }, false, false, { text: 'Send', action: 'revise', disabled: false, hint: '1 change left' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('menu'), revisesLeft: 0 }, false, false, { text: 'Send', action: 'revise', disabled: true, hint: '0 changes left' }],
    [{ session: true, phase: 'confirming', pendingAsk: ask('menu'), revisesLeft: 2 }, true, false, { text: 'Sign & run', action: 'sign-prepare', disabled: false, hint: '2 changes left' }],
    [{ session: true, phase: 'prepared', signClicked: false }, true, false, { text: 'Sign & run', action: 'sign-prepare', disabled: false, hint: '' }],
    [{ session: true, phase: 'prepared', signClicked: true, specHash: 'abcdef0123456789' }, true, false, { text: 'Sign abcdef01 & run', action: 'sign', disabled: false, hint: '' }],
    [{ session: true, phase: 'prepared', signClicked: true, specHash: 'abcdef0123456789' }, true, true, { text: 'Sign abcdef01 & run', action: 'sign', disabled: false, hint: '' }],
    [{ session: true, phase: 'drafting' }, true, false, { text: 'Sign & run', action: 'none', disabled: true, hint: '' }],
    [{ session: true }, true, false, { text: 'Sign & run', action: 'none', disabled: true, hint: '' }],
  ];
  for (const [st, empty, reuse, want] of rows) assert.deepEqual(f(st, empty, reuse), want, JSON.stringify([st, empty, reuse]));
});

test('page: ONE button below the message box; Send, Check again, Revise, the sign pair and the card start button are gone', () => {
  assert.equal((PAGE.match(/data-testid="chat-main"/g) || []).length, 1);
  assert.doesNotMatch(PAGE, /chat-send|chat-start-btn|chat-start"|btn-revise|chat-check-deps|btn-sign-run|sign-pair|chat-revise|chat-sign-btn/);
  assert.doesNotMatch(PAGE, /Revise \(/);
  const msg = PAGE.indexOf('id="chat-msg"');
  const main = PAGE.indexOf('id="chat-main-btn"');
  assert.ok(main > msg, 'below the message box');
  assert.ok(PAGE.indexOf('Only your click signs. The chat can\'t.') > main);
  assert.match(PAGE, /id="chat-main-hint"/);
  assert.match(PAGE, /\.btn\.wide\{[^}]*width:100%/);
  assert.match(PAGE, /id="chat-main-btn"[^>]*class="btn primary wide"|class="btn primary wide"[^>]*id="chat-main-btn"/);
});

test('page: the button is dispatched from mainButtonFor and re-rendered on typing', () => {
  assert.match(PAGE, /msgInput\.addEventListener\("input", renderMain\)/);
  assert.match(fnSrc('renderMain'), /mainButtonFor\(/);
});
