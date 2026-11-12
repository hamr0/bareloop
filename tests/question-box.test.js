// hamr 2026-11-12 (as fwdloop M10 am29): a question asked while drafting gets its own box in the panel. Item A: the box itself (what the server says it shows, the static
// markup, and how the page opens, fills and closes it). Real panel sessions over a real rubric job; the page's own functions run against stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boxFor } from '../src/questionbox.js';
import { rubricSession, until } from './qbox-world.mjs';

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

test('boxFor: a question the person answers has a box (head "i of n", the job line, the question); every other ask keeps the chat input', () => {
  const b = boxFor({ kind: 'answer', source: 'look', index: 2, total: 3, line: 4, question: 'Which one?' });
  assert.equal(b?.head, 'A question the plan raised (2 of 3)');
  assert.equal(b?.line, 'About job line 4');
  assert.equal(b?.text, 'Which one?');
  assert.equal(boxFor({ kind: 'answer', source: 'try-3', index: 1, total: 1, question: 'q' })?.line, '', 'no line, no "About job line" row');
  assert.equal(boxFor({ kind: 'language', field: {} }), null);
  assert.equal(boxFor({ kind: 'menu' }), null);
  assert.equal(boxFor({ kind: 'install-needed' }), null);
});

test('the static markup: head, line, question, the labelled one-line box, an alert error line and a wide primary Send; the chat input row stays beside it for other asks', () => {
  for (const id of ['chat-question', 'chat-q-head', 'chat-q-line', 'chat-q-text', 'chat-q-choices', 'chat-q-or', 'chat-q-answer', 'chat-q-error', 'chat-q-send']) assert.match(PAGE, new RegExp(`id="${id}"`), id);
  assert.match(PAGE, /<div class="hint q-err" id="chat-q-error"[^>]*role="alert"><\/div>/);
  assert.match(PAGE, /<button class="btn primary wide" type="button" id="chat-q-send"[^>]*>Send<\/button>/);
  assert.match(PAGE, /placeholder="Your answer, on one line"/);
  assert.match(PAGE, /<div class="chat-input-row">/, 'the chat input stays for the asks that have no box');
  assert.ok(PAGE.indexOf('id="chat-question"') < PAGE.indexOf('class="chat-input-row"'), 'the box sits where the chat input is');
  assert.match(PAGE, /\.chat-question\{[^}]*box-sizing:border-box/);
  assert.match(PAGE, /\.chat-question \.q-text\{[^}]*overflow-wrap:anywhere/);
  assert.match(PAGE, /\.chat-question \.q-choices \.btn\{[^}]*white-space:normal/, 'long button words wrap instead of scrolling the page sideways');
});

test('session: a look question carries its box and its thread message is held back until it is answered; the answer closes it', async () => {
  const { session, bot } = rubricSession({ jobText: '1. Find the last 3 releases\n~ one per week' });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  const box = session.state.pendingAsk.box;
  assert.equal(box.head, 'A question the plan raised (1 of 1)');
  assert.equal(box.line, 'About job line 1');
  assert.match(box.text, /^Your line 1 says "one per week"\. I can't check this on the page\./);
  assert.equal(bot().at(-1).askOpen, true, 'the box shows the question, so the thread holds the message back');
  assert.equal(session.send('each release is a weekly build').ok, true);
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  assert.equal(bot().some((m) => m.askOpen === true), false, 'answered: the question joins the thread');
  assert.equal(session.state.pendingAsk.box, undefined);
});

/** renderQuestionBox against stubs: the DOM it touches, one fake element each */
function boxHarness() {
  const el = () => ({ hidden: true, textContent: '', value: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const e = { qBox: el(), qHead: el(), qLine: el(), qText: el(), qChoices: el(), qC1: el(), qC2: el(), qOr: el(), qAnswer: el(), qError: el(), qSend: el(), mainBtn: el(), mainHint: el(), row: el() };
  const names = 'qBox,qHead,qLine,qText,qChoices,qC1,qC2,qOr,qAnswer,qError,qSend,mainBtn,mainHint,sessionId';
  const run = new Function(...names.split(','), 'document', 'state', `var qKey = null;\n${fnSrc('renderQuestionBox')}\nreturn function(s){ renderQuestionBox(s); };`);
  const doc = { querySelector: () => e.row };
  const render = run(e.qBox, e.qHead, e.qLine, e.qText, e.qChoices, e.qC1, e.qC2, e.qOr, e.qAnswer, e.qError, e.qSend, e.mainBtn, e.mainHint, 'sess', doc);
  return { e, render };
}
const ASK = (text, over = {}) => ({ pendingAsk: { kind: 'answer', index: 1, source: 'look', box: { head: 'A question the plan raised (1 of 2)', line: 'About job line 1', text, choices: [], orLabel: 'Type your answer:' }, ...over } });

test('page: an open question shows the box and takes the chat input\'s place; closing brings the chat input back', () => {
  const { e, render } = boxHarness();
  render(ASK('Which one?'));
  assert.equal(e.qBox.hidden, false);
  assert.equal(e.row.hidden, true, 'the chat input is hidden while the box is open');
  assert.equal(e.mainBtn.hidden, true, 'the box has its own Send');
  assert.equal(e.qHead.textContent, 'A question the plan raised (1 of 2)');
  assert.equal(e.qLine.textContent, 'About job line 1');
  assert.equal(e.qText.textContent, 'Which one?');
  render({ pendingAsk: { kind: 'menu' } });
  assert.equal(e.qBox.hidden, true);
  assert.equal(e.row.hidden, false);
  assert.equal(e.mainBtn.hidden, false);
  render(null);
  assert.equal(e.qBox.hidden, true);
});

test('page: a poll tick for the SAME question never rewrites what the person is typing; a NEW question clears the box and the error', () => {
  const { e, render } = boxHarness();
  render(ASK('Which one?'));
  e.qAnswer.value = 'half typed'; e.qError.textContent = 'a refusal';
  render(ASK('Which one?'));
  assert.equal(e.qAnswer.value, 'half typed');
  assert.equal(e.qError.textContent, 'a refusal');
  render(ASK('Which folder?', { index: 2 }));
  assert.equal(e.qAnswer.value, '');
  assert.equal(e.qError.textContent, '');
  assert.equal(e.qText.textContent, 'Which folder?');
});

test('page: the thread skips a message whose question is still open, and renderActions draws the box on every poll', () => {
  assert.match(fnSrc('renderMessages'), /filter\(function\(m\)\{ return m\.askOpen !== true; \}\)/);
  assert.match(fnSrc('renderActions'), /renderQuestionBox\(state\)/);
  assert.match(fnSrc('openNewCard'), /renderQuestionBox\(null\)/);
});

test('page: a question with choices shows its buttons (labels, data-choice); a question with no box words (the fit check) hides the answer box and Send', () => {
  const { e, render } = boxHarness();
  render({ pendingAsk: { kind: 'answer', index: 1, source: 'fit-check', box: { head: 'A question before drafting', line: '', text: 'Found 2 of 4.', choices: [{ choice: 'go-on', label: 'Go on' }, { choice: 'stop', label: 'Stop' }], orLabel: null, sendChoice: 'stop' } } });
  assert.deepEqual([e.qC1.hidden, e.qC1.textContent, e.qC1.attrs['data-choice'], e.qC2.textContent, e.qC2.attrs['data-choice']], [false, 'Go on', 'go-on', 'Stop', 'stop']);
  assert.deepEqual([e.qChoices.hidden, e.qAnswer.hidden, e.qSend.hidden, e.qOr.hidden], [false, true, true, true]);
  render({ pendingAsk: { kind: 'answer', index: 1, source: 'dest-point', box: { head: 'h', line: '', text: 'Dest?', choices: [{ choice: 'yes', label: 'Yes, set it to src/' }, { choice: 'no', label: 'No, keep docs/' }], orLabel: 'Or type a different Destination:', sendChoice: 'path' } } });
  assert.deepEqual([e.qAnswer.hidden, e.qSend.hidden, e.qOr.textContent], [false, false, 'Or type a different Destination:']);
  render(ASK('plain'));
  assert.equal(e.qChoices.hidden, true, 'a question without choices has no button row');
});
