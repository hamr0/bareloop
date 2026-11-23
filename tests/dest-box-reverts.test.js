// hamr 2026-11-23, live panel defect.
// A: after a refused draft the Destination box kept reverting to the refused draft's Destination (the page re-synced it from the ended session on every poll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '../src/panel/index.html'), 'utf8');
function fnSrc(/** @type {string} */ name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
}

/** the page's own renderActions, run over a fake document; every other helper it calls is a recorder */
function page(boxes) {
  const els = Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, { value: v }]));
  const doc = { getElementById: (/** @type {string} */ id) => els[id] };
  const src = `var sessionLive = false, lastState = null; var CLIENT_TERMINAL_PHASES = ["refused", "abandoned", "error", "signed", "signing-failed"];
var errEl = {}; function renderProgress(){ return false; } function renderQuestionBox(){} function refreshStartEnabled(){} function fitCardBoxes(){}
var progressRow = {};
function setVal(id, v){ document.getElementById(id).value = v; }
${fnSrc('syncDestinationFromSession')}\n${fnSrc('syncJobBoxFromSession')}\n${fnSrc('renderActions')}
return { render: renderActions };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('document', src)(doc);
  return { els, api };
}

test('A: a refused session leaves the Destination box to the person — a poll of the ended state never reverts what they typed', () => {
  const { els, api } = page({ 'jf-dest': 'old/refused', 'jf-job': '1. x' });
  const refused = { phase: 'refused', card: { destination: 'old/refused', jobText: '1. x' } };
  els['jf-dest'].value = 'new/typed';
  api.render(refused);
  api.render(refused);
  assert.equal(els['jf-dest'].value, 'new/typed');
});

test('A: a live session still re-fills Destination from its own card (the "yes" to the folder question)', () => {
  const { els, api } = page({ 'jf-dest': 'a', 'jf-job': '1. x' });
  api.render({ phase: 'confirm', card: { destination: 'b', jobText: '1. x' } });
  assert.equal(els['jf-dest'].value, 'b');
});

