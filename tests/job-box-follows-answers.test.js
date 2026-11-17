// hamr 2026-11-17: after an answer (e.g. the column tie) the locked "The job" box shows the updated `~` rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}
function harness(boxValue) {
  const box = { value: boxValue };
  let fits = 0;
  const doc = { getElementById: () => box };
  const src = `var sessionLive = false; var __fits = function(){}; function fitCardBoxes(){ __fits(); }
${fnSrc('setVal')}\n${fnSrc('renderActions').includes('syncJobBoxFromSession') ? fnSrc('syncJobBoxFromSession') : 'function syncJobBoxFromSession(){}'}
return { sync: syncJobBoxFromSession, live: function(v){ sessionLive = v; }, hook: ${JSON.stringify(fnSrc('renderActions').includes('syncJobBoxFromSession(state)'))} };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('document', src.replace('__fits = function(){}', '__fits = function(){ globalThis.__fitCount = (globalThis.__fitCount || 0) + 1; }'))(doc);
  void fits;
  return { box, api };
}
const NEW = '1. Rows\n~ Amount over 500';
const OLD = '1. Rows\n~ Price over 500';

test('live session: the locked job box takes the updated rule from state.card.jobText', () => {
  const { box, api } = harness(OLD);
  api.live(true);
  api.sync({ card: { jobText: NEW } });
  assert.equal(box.value, NEW);
});

test('renderActions calls the job-box sync', () => {
  assert.ok(harness(OLD).api.hook, 'renderActions must call syncJobBoxFromSession(state)');
});

test('no live session (open box before Start drafting): the box is untouched', () => {
  const { box, api } = harness('what I am typing');
  api.live(false);
  api.sync({ card: { jobText: NEW } });
  assert.equal(box.value, 'what I am typing');
});

test('live session without a string jobText: the box is untouched', () => {
  const { box, api } = harness(OLD);
  api.live(true);
  api.sync({ card: {} }); api.sync({});
  assert.equal(box.value, OLD);
});
