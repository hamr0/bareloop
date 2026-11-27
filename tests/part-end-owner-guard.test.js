// hamr 2026-11-26 (rulings 1-4, ITEM33-BUILD Addendum 2026-11-26m): "how did this part / piece / try end" is decided in ONE place, `endOf` in
// src/legs.js. This guard fails the moment a src file other than legs.js reads an escalation `category` (compared to a literal) or the
// `money-halt` / `wall-halt` / `stop-requested` records to decide a part's or attempt's end, unless the site is named below WITH the reason it is
// not that decision. A new reader must ask `endOf` (or be added here with its reason: a deliberate, reviewed act, never a silent second spelling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (/** @type {string} */ d, /** @type {string[]} */ out = []) => {
  for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|html)$/.test(p)) out.push(p); }
  return out;
};
/** a literal record name, or an escalation category compared with a literal (a `typeof x.category === 'string'` check is not a decision) */
const READ = /'(?:money-halt|wall-halt|stop-requested)'|category\s*(?:===|==|!==|!=)\s*'(?!string')/;

/** files that WRITE these records or decide a policy that is not "how did a window end": exempt as a whole, each with its reason */
const EXEMPT = {
  'src/planrun.js': 'the engine: writes the money-halt / wall-halt / stop-requested records and the escalations; its own halt routing is the writer, not a reader of a part end',
  'src/ralph.js': 'the engine loop: writes the escalation and the ladder halt',
  'src/stall.js': 'the engine watchdog: sets the wall-halt category on the error it throws',
  'src/run.js': 'the engine: documents and writes the outcome lists',
  'src/userrun.js': 'the CLI runner: writes leg-resume / job-end and prints the footer (the legs-current-guard names its reads)',
  'src/reuse.js': 'resumability policy (CHECKPOINT_OUTCOMES): which job-end outcomes can be resumed, a different question from how a window ended',
  'src/ledger.js': 'ledger classes of a leg\'s spend (a budget story), read from job-end outcomes',
};

/** @type {Record<string, {n: number, why: string}>} the decider files (replay, panel): the sites that read one of these on purpose, and are not a part or attempt end */
const ALLOWED = {
  'src/replay.js': { n: 4, why: 'the run-level wall CLOCK report (lines 364, 567-573, 2099): it reads the `wall-halt` RECORD\'s elapsed / cutMidCall figures, not a part\'s end' },
  'src/panel/server.js': { n: 1, why: 'endedBase\'s job-end OUTCOME table (`outcome === \'wall-halt\'`: the run\'s resume sentence), not a part or attempt end; the run-level kind still comes from endOf above it' },
};

test('no src file other than legs.js reads an escalation category / money-halt / wall-halt / stop-requested to decide a part or attempt end', () => {
  /** @type {Record<string, string[]>} */
  const found = {};
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file);
    if (rel === 'src/legs.js' || rel in EXEMPT) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || !READ.test(line)) return;
      (found[rel] ??= []).push(`${i + 1}: ${t.slice(0, 110)}`);
    });
  }
  const problems = [];
  for (const [rel, lines] of Object.entries(found)) {
    const allowed = ALLOWED[rel]?.n ?? 0;
    if (lines.length !== allowed) problems.push(`${rel}: ${lines.length} read(s), allow-list says ${allowed}\n    ${lines.join('\n    ')}`);
  }
  for (const [rel, a] of Object.entries(ALLOWED)) if (a.n > 0 && !(rel in found)) problems.push(`${rel}: allow-listed (${a.why}) but no longer found - remove it`);
  assert.deepEqual(problems, [], `ask src/legs.js endOf instead of reading the category / halt records:\n${problems.join('\n')}`);
});

test('the exempt files exist (a renamed file must not silently leave the guard)', () => {
  for (const rel of Object.keys(EXEMPT)) assert.ok(statSync(join(ROOT, rel)).isFile(), rel);
});

test('replay, the panel server and the status table do not spell a cap sentence: they read END_WORDS / endOf', () => {
  for (const rel of ['src/replay.js', 'src/panel/server.js', 'src/panel/status.js']) {
    const text = readFileSync(join(ROOT, rel), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(text, /===\s*'(?:money cap|time cap|you stopped it)'|'(?:money cap|time cap)'\s*:/, `${rel} spells a stop sentence on its own`);
  }
});
