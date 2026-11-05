// borrowed-from: fwdloop test/m12-p3-skipped.test.js + m12-p3-readout.test.js@v0.29.0 (the status word and sign; bareloop's table is src/panel/status.js)
// MCP + tickets piece 2 (R5): what the panel says about a skipped run. ONE status table (`skipped`, sign `–`, grey, no blink); the run has a row and a `settled`
// event and NO spine, so the run detail and the runs list build it from the event (like a refusal before start, with its own word). Skipped is terminal, never in
// Needs you, never a reusable green, never a green for a schedule. The words come from code (`skipWords`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATUS, statusFor, partStatusFor, isReusableGreen, skipWords } from '../src/panel/status.js';
import { appendRun, appendRunEvent } from '../src/runlist.js';
import { getRunDetail, listRuns, glyphForOutcome } from '../src/panel/server.js';

const tmp = (/** @type {import('node:test').TestContext} */ t) => { const d = mkdtempSync(join(tmpdir(), 'skipped-panel-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

describe('the status table', () => {
  test('skipped is its own word and sign: [–], not failed, not passed', () => {
    assert.deepEqual({ ...STATUS.skipped }, { sign: '–', word: 'skipped' });
    assert.deepEqual(statusFor({ outcome: 'skipped' }), { key: 'skipped', sign: '–', word: 'skipped' });
    assert.equal(glyphForOutcome('skipped'), '–');
    assert.equal(partStatusFor({ outcome: 'skipped' }).key, 'skipped');
  });
  test('skipped is never a reusable green; the other words are unmoved', () => {
    assert.equal(isReusableGreen('skipped'), false);
    assert.equal(statusFor({ outcome: 'green' }).key, 'passed');
    assert.equal(statusFor({ outcome: 'refused-before-start' }).key, 'failed');
    assert.equal(statusFor({ outcome: 'stopped' }).key, 'stopped');
    assert.equal(statusFor({ outcome: null }).key, 'running');
    assert.equal(statusFor({ outcome: 'skipped', died: true }).key, 'died', 'a dead runner is still died');
  });
});

describe('the words come from code', () => {
  const table = [
    ['priority P3, not P1', { priority: ['P1'] }, 'priority P3, not P1'],
    ['closed', { priority: ['P1'] }, 'the ticket is closed'],
    ['closed', undefined, 'the ticket is closed'],
    ['no P1 label', { priority: ['P1'] }, 'no P1 label on the ticket'],
    ['no P1 or P2 label', { priority: ['P1', 'P2'] }, 'no P1 or P2 label on the ticket'],
    ['no bug label', { labels: ['bug'] }, 'label bug not on the ticket'],
    ['no bug or crash label', { labels: ['bug', 'crash'] }, 'label bug or crash not on the ticket'],
  ];
  for (const [reason, filter, want] of table) test(`${reason} -> ${want}`, () => assert.equal(skipWords(reason, filter), want));
});

describe('a skipped run in the runs list and the run detail', () => {
  /** a listed run with a pid and cap, then ONE settled event: what the engine writes (src/userrun.js) */
  function skippedRun(/** @type {import('node:test').TestContext} */ t) {
    const home = tmp(t);
    const row = { at: new Date().toISOString(), runid: 'skiprun1', job: 'triage', spine: join(home, 'gone', 'u-skiprun1.jsonl'), patient: join(home, 'p'), via: 'run-u', pid: 999999, capUsd: 2 };
    appendRun(row, { home });
    appendRunEvent({ runid: row.runid, type: 'settled', by: row.runid, reason: 'skipped', words: 'priority P3, not P1', spentUsd: 0, spendComplete: true, at: new Date().toISOString() }, { home });
    return { home, row };
  }
  test('the detail: status skipped, sign [–], the words as the Ended line, $0, terminal, not live, no Needs-you tag, no spine claimed', (t) => {
    const { home, row } = skippedRun(t);
    const d = getRunDetail(row.runid, { home });
    assert.equal(d.status.key, 'skipped');
    assert.equal(d.status.word, 'skipped');
    assert.equal(d.glyph, '–');
    assert.equal(d.outcome, 'skipped');
    assert.equal(d.endedLine, 'priority P3, not P1');
    assert.equal(d.skipped, true);
    assert.equal(d.refused, false, 'not a refusal');
    assert.equal(d.fileMissing, false);
    assert.equal(d.live, false);
    assert.equal(d.died, false);
    assert.equal(d.needs, null);
    assert.equal(d.spend, '$0');
    assert.equal(d.spentUsd, 0);
    assert.equal(d.spendComplete, true);
  });
  test('the list row says the same and is not in Needs you', (t) => {
    const { home, row } = skippedRun(t);
    const l = listRuns({ home }).find((r) => r.runid === row.runid);
    assert.ok(l);
    assert.equal(l.status.word, 'skipped');
    assert.equal(l.glyph, '–');
    assert.equal(l.needs, null);
    assert.equal(l.endedLine, 'priority P3, not P1');
    assert.equal(l.fileMissing, false);
  });
  test('the row reads the word ONCE: the list row is `skipped` + the words, the words do not repeat it (the page prints `word - words`)', (t) => {
    const { home, row } = skippedRun(t);
    const l = listRuns({ home }).find((r) => r.runid === row.runid);
    assert.equal(`${l.status.word} \u2014 ${l.endedLine}`, 'skipped \u2014 priority P3, not P1');
    for (const w of ['closed', 'no P1 label']) assert.doesNotMatch(skipWords(w, { priority: ['P1'] }), /^skipped/i);
    const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
    assert.match(html, /p\.word = r\.status && r\.status\.word/);
    assert.match(html, /p\.why = r\.endedLine/);
  });
  test('a refusal before start still wears failed and refused:true (the skipped branch did not take it over)', (t) => {
    const home = tmp(t);
    const row = { at: new Date().toISOString(), runid: 'refuse01', job: 'triage', spine: join(home, 'gone', 'u-refuse01.jsonl'), patient: join(home, 'p'), via: 'run-u', pid: 999999, capUsd: 2 };
    appendRun(row, { home });
    appendRunEvent({ runid: row.runid, type: 'settled', by: row.runid, reason: 'refused before start', words: 'No page. The run did not start. Nothing spent.', spentUsd: 0, spendComplete: true, at: new Date().toISOString() }, { home });
    const d = getRunDetail(row.runid, { home });
    assert.equal(d.refused, true);
    assert.equal(d.skipped, false);
    assert.equal(d.status.word, 'failed');
    assert.equal(d.glyph, '✗');
  });
});

describe('the page reads the table, never maps an outcome itself', () => {
  const html = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  test('the sign [–] has its class and its grey dot', () => {
    assert.match(html, /\.dot\.skipped::before\{content:"\[–\]";color:var\(--grey-dot\);\}/);
    assert.match(html, /if\(g === "–"\) return "skipped";/);
  });
  test('a no-spine detail with skipped takes the same early branch as a refusal', () => {
    assert.match(html, /if\(detail\.refused \|\| detail\.skipped\)\{/);
  });
  test('no page-side outcome-to-word map for skipped (the word is the server\'s status.word)', () => {
    assert.doesNotMatch(html, /outcome === ["']skipped["']/);
  });
});
