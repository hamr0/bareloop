// A signed list never says "waiting for your answer" (run mwnlw2mo, flights-shape-walk, walk 2026-11-27): the reason was stored while
// drafting and a finished run's Result tab read it back as if it still waited. One owner of the words (src/checklist.js), one signed reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refusedOf } from '../src/rubricstep.js';
import { planFromSpec } from '../src/panel/jobplan.js';
import { REASON } from '../src/checkblock.js';

const SIGNED_WORDS = 'not answered while drafting — you judge it at Accept';
const row = (/** @type {string} */ reason) => ({ key: 'L1.~1', line: 1, kind: 'rule', rule: 1, by: 'you', state: 'not-checked', reason });
const spec = (/** @type {string} */ reason) => ({
  jobLines: [{ n: 1, text: 'Find a flight\n~ departure not a red-eye', rule: 'departure not a red-eye', rules: ['departure not a red-eye'] }],
  closeDecl: { genre: 'TYPES', lang: 'js', stages: [], list: [row(reason)] },
});

test('a SIGNED list reads a waiting reason as not answered while drafting, for both waiting words', () => {
  for (const w of ['waiting for your answer on the reading', 'waiting for your answer on the proposed check']) {
    const r = refusedOf(spec(w).closeDecl, { signed: true });
    assert.equal(r.length, 1);
    assert.equal(r[0].reason, SIGNED_WORDS);
    assert.match(JSON.stringify(planFromSpec(spec(w), null, { signed: true }).lines[0].refused), /not answered while drafting/);
  }
});

test('other signed reasons are untouched, and DRAFTING keeps the waiting words', () => {
  assert.equal(refusedOf(spec(REASON.noRule).closeDecl, { signed: true })[0].reason, REASON.noRule);
  for (const w of [REASON.waitingReading, REASON.waitingPick]) {
    assert.equal(refusedOf(spec(w).closeDecl)[0].reason, w);
    assert.match(JSON.stringify(planFromSpec(spec(w)).lines[0].refused), /waiting for your answer/);
  }
  assert.equal(REASON.waitingReading, 'waiting for your answer on the reading');
  assert.equal(REASON.waitingPick, 'waiting for your answer on the proposed check');
});

test('guard: the literal "waiting for your answer" lives only in src/checklist.js (src/panel/index.html keeps its drafting-time progress label for a pending ask, which never reaches a signed list)', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const hits = [];
  const walk = (/** @type {string} */ d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.js') && /waiting for your answer/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(src.length + 1));
    }
  };
  walk(src);
  // runroutes.js: the Accept door's "not waiting for your answer" refusal is a different sentence about a run, not a row reason
  assert.deepEqual(hits.sort(), ['checklist.js', 'panel/runroutes.js']);
});
