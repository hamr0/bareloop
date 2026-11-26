// F399 guard: no src file other than src/runread.js hand-scans spine records of the types the two readers own. A view asks checksOf / outputOf. Same style as
// tests/legs-final-close.test.js and tests/legs-current-guard.test.js: a walk of src, EXACT scan counts per file, an ALLOWED map with a reason per entry, and a stale entry fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; };
const TYPES = ['check-run', 'exit-eval', 'close-verdict', 'outer-close', 'close-precheck', 'rubric-evidence', 'output-judged', 'review-findings', 'destination-written', 'report-staged', 'attempt-diff', 'work-branch', 'destination-refused', 'fence', 'shape-items', 'work-committed'];
// a hand scan: the type is compared (=== / !==) or handed to last()/a finder, on a code line that is not an emit and not a comment
const SCAN = /(\btype\s*[!=]==\s*'|\blast\('|\.type\)\s*&&|\bincludes\()/;
/** @type {Record<string, {n: number, why: string}>} */
const ALLOWED = {
  'src/legs.js': { n: 2, why: 'owner of `finalCloseOf`: runread.js asks it, it scans for the final close of the current leg once, here' },
  'src/replay.js': { n: 12, why: 'history parts (each try\'s checks, per-iteration closes, the fix loop, the run header\'s branch): replay shows every try on purpose, so it is not "the reading" of what the run checked' },
  'src/panel/server.js': { n: 1, why: 'the rounds drill-down stamps each round with its exit-eval time (`stepRoundsPage`, `closeStageDetail`): per-round history, not a reading of the run' },
  'src/reuse.js': { n: 4, why: 'the resume checkpoint reader (598, 625) and the close-trend governor `readGrade` (726, 731): engine and arbiter territory; moving them would change close semantics' },
  'src/learn.js': { n: 5, why: 'builds learning cards from per-try failure events at run end: it folds history into a ledger and is not a view' },
  'src/userrun.js': { n: 5, why: 'writer-side lines in the run itself: the door accept reads its own staged report (1346-1347), the work-committed record names the work branch it just made (2232), and the leg\'s own stdout readout (2281, 2285)' },
};

test('no src file other than runread.js hand-scans spine records of the types the readers own, outside the named allow-list', () => {
  /** @type {Record<string, string[]>} */
  const found = {};
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (rel === 'src/runread.js') continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /\bemit\(|\bdoorEmit\(/.test(line) || !SCAN.test(line)) return;
      if (TYPES.some((type) => line.includes(`'${type}'`))) (found[rel] ??= []).push(`${i + 1}: ${t.slice(0, 120)}`);
    });
  }
  const problems = [];
  for (const [rel, lines] of Object.entries(found)) {
    const allowed = ALLOWED[rel]?.n ?? 0;
    if (lines.length !== allowed) problems.push(`${rel}: ${lines.length} scan(s), allow-list says ${allowed}\n    ${lines.join('\n    ')}`);
  }
  for (const [rel, a] of Object.entries(ALLOWED)) if (!found[rel]) problems.push(`${rel}: allow-listed (${a.why}) but no scan found - drop the entry`);
  assert.deepEqual(problems, [], 'a reader of these records asks checksOf / outputOf (src/runread.js), or is named in ALLOWED with its reason');
});

test('every ALLOWED entry carries a reason', () => {
  for (const [rel, a] of Object.entries(ALLOWED)) assert.ok(a.why.length > 20, rel);
});
