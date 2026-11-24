// hamr 2026-11-24 (ITEM33 Part B D3 + Part A item 4, F394): the Run tab's "Checks not run again: ..." line sits INSIDE the NOW row, above the NOW text, and reads ONLY the run's
// CURRENT leg (the spine's records after the last `leg-resume`, src/legs.js). An earlier Resume's line never shows on a later one. The old whole-spine reader and the grey
// #map-reused line under the step map are gone.
// No archived spine holds a `check-reused` record yet, so the record is written in the exact shape `tellReuse` emits, appended to real live run mwrkv1zh's first records.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunDetail } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HERE, 'fixtures', 'check-running-spine.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
const TEXT = 'Checks not run again: same files as the last check at 14:05.';

/** @type {string[]} */
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
let n = 0;
/** @param {any[]} records @param {number} [now] */
function detailOf(records, now) {
  const home = mkdtempSync(join(tmpdir(), 'chk-reuse-')); dirs.push(home);
  const dir = join(home, 'src-x', 'job-bareloop');
  mkdirSync(dir, { recursive: true });
  const spine = join(dir, 'u-chk.jsonl');
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  n += 1;
  appendRun({ at: records[0].ts, runid: `rus${n}`, job: 'job', spine, patient: null, via: 'run-u', capUsd: 8 }, { home });
  return getRunDetail(`rus${n}`, { home, ...(now === undefined ? {} : { now }) });
}
const reused = (seq, text = TEXT) => ({ type: 'check-reused', commands: 2, savedAt: '2026-11-23T14:05:00.000Z', text, ts: FIXTURE[0].ts, seq });
const resume = (seq) => ({ type: 'leg-resume', leg: 0, after: 'provider-red', ts: FIXTURE[0].ts, seq });
// the first records of the real run end inside a worker attempt, so a live run shows a NOW row
const upto = FIXTURE.findIndex((r) => r.seq === 56);
const live = FIXTURE.slice(0, upto + 1);
const nowMs = Date.parse(FIXTURE[upto].ts) + 95_000;

test('F394: a leg-3 spine whose only check-reused record belongs to leg 2 shows NO reused line; one in leg 3 shows it', () => {
  const leg2 = [...live, resume(900), reused(901)];
  assert.equal(detailOf(leg2, nowMs).nowReused, TEXT, 'leg 2 reused a saved check: its own line shows');
  const leg3 = [...leg2, resume(902)];
  const d = detailOf(leg3, nowMs);
  assert.equal(d.nowReused, null, 'leg 3 took nothing from a saved result: leg 2\'s line must not show');
  assert.equal('checkReused' in d, false, 'the whole-spine field is gone');
  assert.equal(detailOf([...leg3, reused(903, 'Checks not run again: same files as the last check at 15:00.')], nowMs).nowReused, 'Checks not run again: same files as the last check at 15:00.');
});

test('the line is part of the NOW row: it is null with no NOW (the run ended or no stretch is counted)', () => {
  assert.equal(detailOf([...live, reused(900)], nowMs).nowReused, TEXT);
  const ended = [...live, reused(900), { type: 'job-end', outcome: 'escalated', spentUsd: 1, spendComplete: true, ts: FIXTURE[upto].ts, seq: 901 }];
  const d = detailOf(ended, nowMs);
  assert.equal(d.now, null);
  assert.equal(d.nowReused, null);
});

test('page: #map-reused and its painter are gone; the NOW row draws the line above the NOW text, only with a NOW', () => {
  assert.doesNotMatch(PAGE, /map-reused|paintCheckReused|detail\.checkReused/);
  const fnSrc = (/** @type {string} */ name) => {
    const a = PAGE.indexOf(`function ${name}(`); let d = 0; let j = PAGE.indexOf('{', a);
    for (; j < PAGE.length; j += 1) { if (PAGE[j] === '{') d += 1; else if (PAGE[j] === '}') { d -= 1; if (d === 0) break; } }
    return PAGE.slice(a, j + 1);
  };
  const src = ['renderEnded', 'summaryRow', 'nextRow', 'escapeXml'].map(fnSrc).join('\n');
  const box = { hidden: true, innerHTML: '', className: '' };
  // eslint-disable-next-line no-new-func
  const render = new Function('document', `var lastEndedSig = null;\n${src}\nreturn renderEnded;`)({ getElementById: () => box });
  render({ runid: 'r1', now: 'AI working \u00B7 1:30', nowReused: TEXT, ended: null, schedule: null, resume: null });
  const html = box.innerHTML;
  assert.ok(html.indexOf(TEXT) !== -1 && html.indexOf(TEXT) < html.indexOf('AI working'), 'above the NOW text');
  assert.match(html, /<span class="ended-label">NOW<\/span><span class="ended-text" data-testid="now-row"><span class="now-reused" data-testid="check-reused">/);
  render({ runid: 'r1', now: 'AI working \u00B7 1:30', nowReused: null, ended: null, schedule: null, resume: null });
  assert.doesNotMatch(box.innerHTML, /Checks not run again/, 'redrawn without it when the server stops sending it');
  render({ runid: 'r1', now: null, nowReused: TEXT, ended: null, schedule: null, resume: null });
  assert.equal(box.hidden, true, 'no NOW: nothing shows, the line does not float alone');
});

test('hamr 2026-11-24: the reused line wears the NOW text\'s own size and color (one block): its CSS rule sets neither', () => {
  const rule = /\.ended-text \.now-reused\{([^}]*)\}/.exec(PAGE);
  assert.ok(rule, 'the rule exists');
  assert.doesNotMatch(rule[1], /font-size|color/);
});
