// hamr 2026-11-26 ("No per-case patches: one owner", Addendum 2026-11-26j): every part's and every attempt's result sign + word is minted ONCE,
// server-side, from the status table (src/panel/status.js partStatusFor / attemptStatusFor, attached in getRunDetail). The page renders what it is
// given. This file holds (1) the owner's rules, (2) the page rendering the server's sign for a capped part, a stopped try and its map chip,
// (3) the guard: the page never derives a sign from `outcome` / `stopReason` again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from '../src/panel/status.js';

const { partStatusFor, STATUS } = S;
// a namespace read, so a missing owner fails its own tests (red) instead of the whole file
const attemptStatusFor = (/** @type {any[]} */ ...args) => /** @type {any} */ (S).attemptStatusFor(...args);

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  if (start === -1) return null;
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
// the page's own functions, extracted verbatim and run against plain data (no DOM)
const NAMES = ['escapeXml', 'attemptGlyph', 'signOf', 'tryGlyph', 'glyphSpan', 'attemptsInlineText', 'stepTitleText', 'partBoxState', 'partHasNoVerdict', 'partResultGlyph', 'buildOrderedBoxes', 'gridStepTryOf', 'gridFixTryOf'];
// eslint-disable-next-line no-new-func
const P = new Function(`${NAMES.map(fnSrc).filter((s) => s !== null).join('\n')}\nreturn { ${NAMES.filter((n) => fnSrc(n) !== null).join(', ')} };`)();
const strip = (/** @type {string} */ s) => String(s).replace(/<[^>]+>/g, '');
const T = (/** @type {string} */ key) => ({ key, ...STATUS[/** @type {keyof typeof STATUS} */ (key)] });
const stepPart = (/** @type {any} */ extra) => ({ kind: 'step', id: 's1', label: 's1', occurrence: 1, blocked: 0, ...extra });
const glyphOf = (/** @type {any} */ part) => strip(P.partResultGlyph(part, P.buildOrderedBoxes([part])[0]));

// ---------------------------------------------------------------- the owner
test('owner: a part a cap ended wears capped on ANY outcome (a fix piece ends red, a step escalated); a passed one never does', () => {
  assert.equal(partStatusFor({ kind: 'fix', outcome: 'red', stopReason: 'time cap' }).key, 'capped');
  assert.equal(partStatusFor({ kind: 'fix', outcome: 'red', stopReason: 'money cap' }).key, 'capped');
  assert.equal(partStatusFor({ kind: 'step', outcome: 'escalated', stopReason: 'time cap' }).key, 'capped');
  assert.equal(partStatusFor({ kind: 'step', outcome: 'green', stopReason: 'time cap' }).key, 'passed');
  assert.equal(partStatusFor({ kind: 'fix', outcome: 'red' }).key, 'failed');
  assert.equal(partStatusFor({ kind: 'fix', outcome: 'red', stopReason: 'the model provider failed' }).key, 'failed');
});

test('owner: the live part is running (the server says it, the page no longer decides)', () => {
  assert.equal(partStatusFor({ kind: 'step', outcome: null }, { live: true }).key, 'running');
  assert.equal(partStatusFor({ kind: 'step', outcome: null }).key, 'passed');
  assert.equal(partStatusFor({ kind: 'step', outcome: null, stopReason: 'you stopped it' }, { live: true }).key, 'stopped');
});

test('owner: an attempt wears the table entry its own end earned (passed, stopped, capped, failed, running, no-verdict ?)', () => {
  const part = { stopReason: null };
  assert.equal(attemptStatusFor({ outcome: 'green' }, part).key, 'passed');
  assert.equal(attemptStatusFor({ outcome: 'red' }, part).key, 'failed');
  // a step try the person's Stop cut: the replay marks its outcome 'stopped', the part says why
  assert.equal(attemptStatusFor({ outcome: 'stopped' }, { stopReason: 'you stopped it' }).key, 'stopped');
  assert.equal(attemptStatusFor({ outcome: 'stopped' }, { stopReason: 'time cap' }).key, 'capped');
  assert.equal(attemptStatusFor({ outcome: 'stopped' }, { stopReason: 'the model provider failed' }).key, 'failed');
  // a fix try its own window's end names
  assert.equal(attemptStatusFor({ outcome: 'red', stop: { by: 'escalation', what: 'stopped' }, noVerdict: 'x' }, part).key, 'stopped');
  assert.equal(attemptStatusFor({ outcome: 'red', stop: { by: 'escalation', what: 'wall-halt' }, noVerdict: 'x' }, part).key, 'capped');
  assert.equal(attemptStatusFor({ outcome: 'red', stop: { by: 'escalation', what: 'cap-halt' }, noVerdict: 'x' }, part, { runCapped: true }).key, 'capped');
  assert.equal(attemptStatusFor({ outcome: 'red', stop: { by: 'escalation', what: 'cap-halt' }, noVerdict: 'x' }, part).key, 'died', 'a strike ladder\'s cap-halt is not the money cap');
  assert.equal(attemptStatusFor({ outcome: 'red', stop: { by: 'escalation', what: 'provider-red' }, noVerdict: 'x' }, part).sign, '?');
  // a cut-off graded try follows its part
  assert.equal(attemptStatusFor({ outcome: null, cutOff: true }, { stopReason: 'you stopped it' }).key, 'stopped');
  assert.equal(attemptStatusFor({ outcome: null, cutOff: true }, part).sign, '?');
  // open: running only while the part is live
  assert.equal(attemptStatusFor({ outcome: null }, part, { live: true }).key, 'running');
  assert.equal(attemptStatusFor({ outcome: null }, part).sign, '?');
});

// ---------------------------------------------------------------- the page renders the server's sign
test('page: a capped part wears the capped sign on its result glyph, not the ✗ its outcome would give', () => {
  const capped = stepPart({ outcome: 'escalated', stopReason: 'time cap', status: T('capped'), attempts: [{ n: 1, outcome: 'stopped', status: T('capped') }] });
  assert.equal(glyphOf(capped), '■');
});

test('page: a stopped try inside a multi-try part wears the stopped sign', () => {
  const part = stepPart({ outcome: 'escalated', stopReason: 'you stopped it', status: T('stopped'), attempts: [{ n: 1, outcome: 'red', status: T('failed') }, { n: 2, outcome: 'stopped', status: T('stopped') }] });
  assert.equal(glyphOf(part), '✗■');
});

test('page: the step-map chip of a stopped attempt shows the stopped sign (mwue75ih step 2)', () => {
  const part = stepPart({ outcome: 'escalated', stopReason: 'you stopped it', status: T('stopped'), attempts: [{ n: 1, outcome: 'stopped', status: T('stopped') }] });
  const box = P.buildOrderedBoxes([part])[0];
  assert.equal(P.stepTitleText(1, box), '2 s1 — attempt 1 ■');
  assert.equal(box.status.sign, '■');
});

test('page: the Audit grid\'s try columns wear the server\'s sign (a cut-off try the person stopped, a graded try)', () => {
  const part = { attempts: [{ n: 1, outcome: 'red', checks: [], status: T('failed') }] };
  assert.equal(P.gridStepTryOf(part, { n: 2, cutOff: true, outcome: null, status: T('stopped') }, false).glyph, '■');
  assert.equal(P.gridStepTryOf(part, { n: 1, cutOff: false, outcome: 'red', status: T('failed') }, false).glyph, '✗');
  assert.equal(P.gridFixTryOf({ n: 3, outcome: 'red', noVerdict: 'cut', status: T('capped') }, false).glyph, '■');
});

test('page: failed, passed, live and died parts and attempts read as before', () => {
  assert.equal(glyphOf(stepPart({ outcome: 'escalated', status: T('failed'), attempts: [{ n: 1, outcome: 'red', status: T('failed') }] })), '✗');
  assert.equal(glyphOf(stepPart({ outcome: 'green', status: T('passed'), attempts: [{ n: 1, outcome: 'green', status: T('passed') }] })), '✓');
  assert.equal(glyphOf(stepPart({ outcome: 'green', status: T('passed'), attempts: [{ n: 1, outcome: 'red', status: T('failed') }, { n: 2, outcome: 'green', status: T('passed') }] })), '✗✓');
  assert.equal(glyphOf(stepPart({ outcome: null, stopReason: 'died', status: T('died'), attempts: [{ n: 1, outcome: null, status: T('died') }] })), '?');
  assert.equal(P.buildOrderedBoxes([stepPart({ outcome: 'green', status: T('passed'), attempts: [] })])[0].state, 'done');
  assert.equal(P.buildOrderedBoxes([stepPart({ outcome: 'escalated', status: T('capped'), attempts: [] })])[0].state, 'stopped');
});

test('page: the live part reads running from the server\'s status (no isLive flag on the page)', () => {
  const live = stepPart({ outcome: null, status: T('running'), attempts: [{ n: 1, outcome: null, status: T('running') }] });
  assert.equal(glyphOf(live), '▶');
  assert.equal(P.buildOrderedBoxes([live])[0].state, 'running');
  assert.equal(P.buildOrderedBoxes([live])[0].status.word, 'running');
});

// ---------------------------------------------------------------- the guard
test('guard: the page derives no sign from outcome / stopReason (the server owns it); the sign readers read `.status` only', () => {
  assert.equal(fnSrc('attemptGlyph'), null, 'attemptGlyph (outcome -> sign) is gone: the server mints the sign');
  assert.doesNotMatch(PAGE, /attemptGlyph/);
  // the sign/state readers may not look at an outcome, a stop reason, a live flag or a hand-written sign
  for (const name of ['signOf', 'tryGlyph', 'attemptsInlineText', 'stepTitleText', 'partBoxState', 'partResultGlyph', 'buildOrderedBoxes', 'stepStateHTML', 'gridStepTryOf']) {
    const src = fnSrc(name);
    assert.ok(src, `expected function ${name} in the page`);
    // comments (// ...) are words, not code
    const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert.doesNotMatch(code, /\.outcome\b|\.stopReason\b|\boutcome\s*===|"escalated"|u2713|u2717|✓|✗/, `${name} must read the server's status, never derive a sign`);
  }
  // no line of the page maps an outcome to a result glyph literal
  const noComments = PAGE.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const line of noComments.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, ''))) {
    if (/\boutcome\b/.test(line) && /["'](?:✓|✗|▶)["']/.test(line)) assert.fail(`a line derives a glyph from outcome: ${line.trim()}`);
  }
});
