// R9 9.4 (fwd 83b6d02, m13-p7-unsure-cap): the ticket grid wears a grey "unsure" mark on a row whose run ran with an unsure filter verdict, and its opened row says so in the one set of words.
// Server side on the REAL archived spine (one record patched), page side by cutting the page's own functions. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGridWorld } from './ticket-grid-world.mjs';
import { getJobGrid } from '../src/panel/server.js';
import { FILTER_UNSURE_SAY, filterUnsure } from '../src/ticketlabels.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const NOW = Date.parse('2026-11-08T12:00:00Z');

test('the words and the reader are one owner: unsure also when the ticket was sent anyway over an unsure verdict; a torn entry is false', () => {
  assert.equal(FILTER_UNSURE_SAY, 'the filter was unsure about this ticket');
  assert.equal(filterUnsure({ filter: { unsure: 'x' } }), true);
  assert.equal(filterUnsure({ filter: { outcome: 'anyway', was: { unsure: 'x' } } }), true);
  assert.equal(filterUnsure({}), false);
  assert.equal(filterUnsure(null), false);
});

test('grid row: a run whose job-start carries ticketFilter.unsure is unsure with the words; the same world without it is not', () => {
  const plain = makeGridWorld({ real: ['mw3gso0m'] });
  const none = getJobGrid('mw3gso0m', { home: plain.home, now: NOW }).groups.flatMap((g) => g.rows)[0];
  assert.equal(none.unsure, false);
  assert.equal('unsureSay' in none, false);
  const w = makeGridWorld({ real: ['mw3gso0m'] });
  const spine = readFileSync(join(w.home, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.runid === 'mw3gso0m').spine;
  const lines = readFileSync(spine, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const i = lines.findIndex((x) => x.type === 'job-start');
  lines[i] = { ...lines[i], ticketFilter: { unsure: 'a priority label is not on the P0-P3 scale, or two priorities are present' } };
  writeFileSync(spine, `${lines.map((x) => JSON.stringify(x)).join('\n')}\n`);
  const row = getJobGrid('mw3gso0m', { home: w.home, now: NOW }).groups.flatMap((g) => g.rows)[0];
  assert.equal(row.unsure, true);
  assert.equal(row.unsureSay, FILTER_UNSURE_SAY);
});

// the page's own drawing functions, cut out by name
const src = (name) => {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `page function ${name}`);
  let depth = 0; let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') depth += 1; else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return PAGE.slice(start, i + 1);
};
const ESC = 'function escapeXml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}';
const names = ['gridGlyph', 'stateDotHTML', 'resultField', 'resultDoorHtml', 'resultDiffHtml', 'stageQuestionText', 'stageNumberText', 'stageTriedText', 'tgMark', 'tgCell', 'tgRowData', 'tgChecksLine', 'tgOpenHtml', 'tgRowHTML'];
const fns = new Function('resultData', 'gridRowData', 'gridUi', `${ESC}\n${names.map(src).join('\n')}\nreturn {${names.join(', ')}};`)(null, {}, { rows: {}, open: {}, ownFor: null });

test('page: an unsure row wears the grey mark with the words as its title and says it again when opened; a sure row wears neither', () => {
  const base = { runId: 'r1', name: '#7', ref: 'run-1', title: 'a title', number: 7, bucket: 'done', status: { key: 'passed', sign: '✓', word: 'passed' }, needs: null, steps: { mark: 'g', text: '1 of 1' }, checks: { mark: 'g', text: '2 of 2' }, cost: { mark: 'g', text: '$0.01' }, time: { mark: 'g', text: '1m' }, reason: null, url: null };
  const ui = { rows: { r1: true }, open: {}, anyway: null, msg: '' };
  const on = fns.tgRowHTML({ ...base, unsure: true, unsureSay: FILTER_UNSURE_SAY }, ui, null);
  assert.match(on, /<span class="badge grey tg-unsure" data-testid="grid-unsure" title="the filter was unsure about this ticket">unsure<\/span>/);
  assert.match(on, /data-testid="grid-unsure-line">the filter was unsure about this ticket</);
  const off = fns.tgRowHTML({ ...base, unsure: false }, ui, null);
  assert.equal(/grid-unsure/.test(off), false);
});
