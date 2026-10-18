// PRD v1.106 Part 5 G: the one extra line on each step card ("N tries · last try: …"), from the same tries[] the Audit reads, on the two real runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRunDetail, triesLineOf } from '../src/panel/server.js';
import { makePart5World } from './part5-world.mjs';

const world = makePart5World();
const opts = { home: world.home };
const red = getRunDetail('mvdg1xo3', opts);
const green = getRunDetail('mve5y8fa', opts);
const steps = (d) => d.parts.filter((p) => p.kind === 'step');

test('step cards: five tries, each 1 passed 1 failed; the cut-off fourth try of step 2 is named; the green run is one try, two checks passed', () => {
  assert.equal(steps(red)[0].triesLine, '5 tries · last try: 1 check passed, 1 failed');
  assert.equal(steps(red)[1].triesLine, '4 tries (the 4th cut off before its checks ran) · last try: no checks ran');
  assert.equal(steps(green)[0].triesLine, '1 try · last try: 2 checks passed');
});

test('the card line equals the last try\'s own checks (counted from the raw spine, not from tries[])', () => {
  const recs = readFileSync(world.spine('mvdg1xo3'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const lastOfStep1 = recs.filter((r) => r.type === 'exit-eval').filter((r) => r.seq < 111).at(-1);
  const p = lastOfStep1.results.filter((x) => x.pass).length;
  const f = lastOfStep1.results.length - p;
  assert.equal(steps(red)[0].triesLine.split('last try: ')[1], `${p} check passed, ${f} failed`);
});

test('triesLineOf words: all passed, all failed, plural, no tries', () => {
  assert.equal(triesLineOf([]), null);
  assert.equal(triesLineOf([{ n: 1, cutOff: false, ran: 2, passed: 0, failed: 2 }]), '1 try · last try: 2 checks failed');
  assert.equal(triesLineOf([{ n: 1, cutOff: false, ran: 1, passed: 1, failed: 0 }, { n: 2, cutOff: false, ran: 3, passed: 2, failed: 1 }]), '2 tries · last try: 2 checks passed, 1 failed');
  assert.equal(triesLineOf([{ n: 12, cutOff: true, ran: 0, passed: 0, failed: 0 }]), '1 try (the 12th cut off before its checks ran) · last try: no checks ran');
});

test('the card headline (the page\'s own attemptChecksLine) now names the failing check by its declared position; it was empty for a plan step before D1', () => {
  const page = readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(page, /part-tries-/);
  const src = (name) => { const st = page.indexOf(`function ${name}(`); let d = 0; let i = page.indexOf('{', st); for (; i < page.length; i += 1) { if (page[i] === '{') d += 1; else if (page[i] === '}') { d -= 1; if (d === 0) break; } } return page.slice(st, i + 1); };
  const f = new Function('escapeXml', `${['declaredPosition', 'stageQuestionText', 'stageNumberText', 'attemptChecksLine'].map(src).join('\n')}\nreturn attemptChecksLine;`)((x) => String(x));
  assert.equal(f(steps(red)[0].attempts[0]), "check #2 line 1 — does its output pass the line's checks?");
  assert.equal(f(steps(green)[0].attempts[0]), 'all 2 checks passed');
});
