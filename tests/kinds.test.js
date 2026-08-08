// The KIND EXECUTOR (M1, close-authoring gate 4). Arbiter-adjacent: the close IS
// the verdict, so what is under test here is not "does the count come out right"
// but the THREE RUNTIME CONTRACTS every kind inherits (design record, gate-1
// Result 3) — each one paid for by a live run:
//
//   (a) instrument-stop — a broken instrument is a CASUALTY, never a red (F45),
//       and `judged` is deliberately withheld with it (F17). The sharp edge is
//       the zero-match split: `sum` over nothing is a counted 0, `first` over
//       nothing is UNKNOWN, and unknown is never zero (F6).
//   (b) the gap — every line carries the spec's gapKeep, and a trim is ANNOUNCED
//       (F28: a bound that silently eats the failure names defeats the arbiter).
//   (c) the changed set — `git diff <seed>` PLUS untracked, minus two arbiter
//       books. `gate-audit.jsonl` is an EXACT path and never a basename: a
//       worker-authored `src/gate-audit.jsonl` must still count (u-msdonzxl
//       burned a run to the wall on the other half of this rule).
//
// Every fixture is a REAL temp git repo with real commits and real child
// processes — the close spawns worker-authored code for a living, and a mocked
// spawn cannot fail the way a real one does. Expected numbers are derived from
// each fixture's own state, never hardcoded (a spec edit must not silently red
// the suite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  runStage, seedRead, runDeclaredClose, normalizeParser, regexGroups, parseValue,
  changedSet, isArbiterBook, makeSeedTrees, seedAtHead, addedLines,
  EXIT_GREEN, EXIT_RED, EXIT_STOP, GAP_LINE_CAP, MAX_TERMS,
} from '../src/kinds.js';

// ── fixtures: real repos, isolated from the operator's own git config ─────────

/** @param {string} dir @param {string[]} args */
const git = (dir, args) => execFileSync('git', args, {
  cwd: dir,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'kinds-test', GIT_AUTHOR_EMAIL: 'kinds@test',
    GIT_COMMITTER_NAME: 'kinds-test', GIT_COMMITTER_EMAIL: 'kinds@test',
  },
});

/** @param {string} dir @param {Record<string,string>} files */
function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

/**
 * A throwaway repo with one commit. Returns the seed SHA read back from git,
 * never assumed.
 * @param {any} t @param {Record<string,string>} files
 */
function makeRepo(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-kinds-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  write(dir, files);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return { dir, seed: git(dir, ['rev-parse', 'HEAD']).trim() };
}

const KEEP = 'CLOSE:: ';
/** @param {{dir: string, seed: string}} r @param {object} [more] */
const ctxFor = (r, more = {}) => ({ workdir: r.dir, seedRef: r.seed, gapKeep: KEEP, timeoutMsDefault: 30_000, ...more });

/** a node one-liner that prints a file from ITS OWN cwd — so the seed worktree
 * measures the seed's bytes and the workdir measures the worker's */
const CAT = (/** @type {string} */ rel) => ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(rel)},'utf8'))`];
/** a node one-liner that prints literal text and exits with a chosen code */
const SAY = (/** @type {string} */ text, code = 0) => ['-e', `process.stdout.write(${JSON.stringify(text)});process.exit(${code})`];

const norm = (/** @type {any} */ parser) => {
  const r = normalizeParser(parser);
  assert.equal(r.ok, true, `parser did not normalise: ${JSON.stringify(r.reds)}`);
  return /** @type {any[]} */ (r.terms);
};

// ── normalizeParser — ONE spelling, shared by validator and executor ──────────

test('the short form resolves to exactly one +1 / first / whole-output term (the pre-amendment semantics, unchanged)', () => {
  const r = normalizeParser({ lineMatch: 'error TS\\d+', capture: undefined });
  assert.equal(r.ok, true);
  assert.equal(r.terms.length, 1);
  assert.deepEqual(r.terms[0].sign, 1);
  assert.equal(r.terms[0].aggregate, 'first');
  assert.equal(r.terms[0].region, 'whole-output');
});

test('a parser declaring BOTH terms and the short form is a red, never a guess', () => {
  const r = normalizeParser({ lineMatch: 'x', terms: [] });
  assert.equal(r.ok, false);
  assert.match(r.reds.map((x) => x.detail).join(' '), /EITHER|never both/i);
});

test('a lineMatch with no capture group tallies 1 per match (capture resolves to null)', () => {
  const r = normalizeParser({ terms: [{ lineMatch: 'FAILED', sign: 1, aggregate: 'sum', region: 'whole-output' }] });
  assert.equal(r.ok, true);
  assert.equal(r.terms[0].capture, null);
});

test('a capture group the pattern does not have reds, naming the real group count', () => {
  const r = normalizeParser({ terms: [{ lineMatch: '(\\d+) errors', capture: 3, sign: 1, aggregate: 'first', region: 'whole-output' }] });
  assert.equal(r.ok, false);
  assert.match(r.reds[0].detail, /1 capture group/);
});

test('an invalid regex reds at NORMALISATION, before any process is spawned', () => {
  const r = normalizeParser({ lineMatch: '([unclosed' });
  assert.equal(r.ok, false);
  assert.equal(r.terms, null);
});

test('a long-form term missing sign / aggregate / region reds as missing-field, never defaulted', () => {
  const r = normalizeParser({ terms: [{ lineMatch: '(\\d+)' }] });
  assert.equal(r.ok, false);
  assert.equal(r.reds[0].code, 'missing-field');
});

test('a term list beyond the ceiling reds (a runaway parser is a red, not a bill)', () => {
  const one = { lineMatch: '(\\d+)', sign: 1, aggregate: 'sum', region: 'whole-output' };
  const r = normalizeParser({ terms: Array.from({ length: MAX_TERMS + 1 }, () => ({ ...one })) });
  assert.equal(r.ok, false);
  assert.match(r.reds.map((x) => x.detail).join(' '), new RegExp(String(MAX_TERMS)));
});

test('regexGroups counts groups without running the pattern against real input', () => {
  assert.equal(regexGroups('(\\d+) of (\\d+)').count, 2);
  assert.equal(regexGroups('no groups').count, 0);
  assert.ok(regexGroups('([').red);
});

// ── the parser — signed arithmetic, aggregates, regions, scope ────────────────

test('sign arithmetic: executed = collected − skipped − deselected, summed across terms', () => {
  const out = 'collected 100 items\n3 skipped\n7 deselected\n';
  const terms = norm({
    terms: [
      { lineMatch: 'collected (\\d+) items', capture: 1, sign: 1, aggregate: 'first', region: 'whole-output' },
      { lineMatch: '(\\d+) skipped', capture: 1, sign: -1, aggregate: 'first', region: 'whole-output' },
      { lineMatch: '(\\d+) deselected', capture: 1, sign: -1, aggregate: 'first', region: 'whole-output' },
    ],
  });
  const r = parseValue(out, terms);
  assert.equal(r.stop, null);
  assert.equal(r.value, 100 - 3 - 7);
});

test('aggregate "sum" adds EVERY match — on one line and across lines (a first-match read of "2 failed, 2 errors" reports half the reds)', () => {
  const out = '= 2 failed, 5 passed, 2 errors =\n= 1 failed =\n';
  const terms = norm({ terms: [{ lineMatch: '(\\d+) (?:failed|errors)', capture: 1, sign: 1, aggregate: 'sum', region: 'whole-output' }] });
  const r = parseValue(out, terms);
  assert.equal(r.value, 2 + 2 + 1);
  const first = parseValue(out, norm({ lineMatch: '(\\d+) (?:failed|errors)', capture: 1 }));
  assert.equal(first.value, 2, 'the short form is first-match by construction');
});

test('a "first" term matching NOTHING is an instrument stop — the number was never reported, and unknown is not zero (F6)', () => {
  const terms = norm({ lineMatch: 'total (\\d+)', capture: 1 });
  const r = parseValue('nothing here at all\n', terms);
  assert.ok(r.stop, 'expected a stop');
  assert.match(r.stop, /never reported|unknown/i);
});

test('a "sum" term matching nothing is a COUNTED zero — the region was searched and nothing was there', () => {
  const terms = norm({ terms: [{ lineMatch: '(\\d+) failed', capture: 1, sign: 1, aggregate: 'sum', region: 'whole-output' }] });
  const r = parseValue('all good\n', terms);
  assert.equal(r.stop, null);
  assert.equal(r.value, 0);
});

test('region is PER TERM: one term reads the whole output, another only inside its anchored region', () => {
  const out = [
    'collected 42 items',
    'Traceback: file.py line 9 in frame 3',   // digits that must NOT be tallied
    '=== 2 failed, 40 passed in 1.20s ===',
  ].join('\n');
  const terms = norm({
    terms: [
      { lineMatch: 'collected (\\d+) items', capture: 1, sign: 1, aggregate: 'first', region: 'whole-output' },
      { lineMatch: '(\\d+) failed', capture: 1, sign: -1, aggregate: 'sum', region: { anchor: '^=+ (.*) =+$', capture: 1 } },
    ],
  });
  const r = parseValue(out, terms);
  assert.equal(r.stop, null);
  assert.equal(r.value, 42 - 2);
});

test('a region anchor that matches nothing is an instrument stop — the region could not be located', () => {
  const terms = norm({ terms: [{ lineMatch: '(\\d+) failed', capture: 1, sign: 1, aggregate: 'sum', region: { anchor: '^SUMMARY (.*)$', capture: 1 } }] });
  const r = parseValue('no summary line was printed\n', terms);
  assert.ok(r.stop);
  assert.match(r.stop, /matched nothing|could not be located/i);
});

test('the scope filter drops out-of-scope lines and ANNOUNCES the dropped count; unattributable lines are KEPT and said so', () => {
  const out = [
    'src/a.js:3:1 - error TS2322: bad',
    'vendor/b.js:9:1 - error TS2322: bad',
    'error TS2322: reported against no file at all',  // MATCHES, names no path
  ].join('\n');
  const terms = norm({ terms: [{ lineMatch: 'error TS\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] });
  const r = parseValue(out, terms, { scope: { includePrefixes: ['src/'] }, workdir: '/nowhere' });
  assert.equal(r.stop, null);
  assert.equal(r.value, 2, 'the in-scope error, plus the unattributable one the filter cannot judge');
  assert.match(r.notes.join('\n'), /1 matching line\(s\) dropped/);
  assert.match(r.notes.join('\n'), /named no path.*KEPT/s);
});

test('a "first" term whose every match was SCOPE-FILTERED says exactly that, and keeps the notes it already computed', () => {
  const out = [
    'vendor/b.js:9:1 - total 7',
    'vendor/c.js:1:1 - total 9',
  ].join('\n');
  const terms = norm({ lineMatch: 'total (\\d+)', capture: 1 });
  const r = parseValue(out, terms, { scope: { includePrefixes: ['src/'] }, workdir: '/nowhere' });
  assert.ok(r.stop, 'unknown is still not zero');
  assert.doesNotMatch(r.stop, /matched nothing/,
    'the lines DID match — saying otherwise sends the reader hunting a parser bug that is not there');
  assert.match(r.stop, /2/, 'the counts are named, mechanically');
  assert.match(r.stop, /scope/i);
  assert.deepEqual(r.notes, ['term 0: 2 matching line(s) dropped by the scope filter'],
    'the diagnostic the function had already computed must not be thrown away on the way out');

  // and the genuine no-match reading is UNCHANGED — the branch must not eat it
  const none = parseValue('nothing here at all\n', terms, { scope: { includePrefixes: ['src/'] }, workdir: '/nowhere' });
  assert.match(none.stop, /matched nothing/);
  assert.deepEqual(none.notes, []);
});

test('a capture group that did not participate is a stop, never a zero', () => {
  const terms = norm({ terms: [{ lineMatch: '(?:total (\\d+))|(?:none)', capture: 1, sign: 1, aggregate: 'sum', region: 'whole-output' }] });
  const r = parseValue('none\n', terms);
  assert.ok(r.stop);
  assert.match(r.stop, /did not participate|unknown/i);
});

// ── the seed itself: D8's HEAD, READ rather than typed ───────────────────────

test('seedAtHead reads HEAD off the real repository and hands back the sha git itself reports', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  const got = await seedAtHead(r.dir);
  assert.equal(got.stop, null, 'a readable HEAD is never a stop');
  assert.equal(got.seedRef, r.seed, 'the seed is git\'s own answer, never a spelling of our own');
  assert.match(/** @type {string} */ (got.seedRef), /^[0-9a-f]{7,64}$/, 'and it passes the sha-shape guard');
});

test('seedAtHead: a repository with NO COMMITS is a named stop, never a fallback ref', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-kinds-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  const got = await seedAtHead(dir);
  assert.equal(got.seedRef, null, 'measuring against the wrong baseline reads as a clean tree — there is no default');
  assert.match(/** @type {string} */ (got.stop), /^INSTRUMENT: could not read HEAD/);
  assert.ok(got.stop.includes(dir), 'the stop names the directory it could not read');
});

test('seedAtHead: a directory that is not a repository at all is the SAME named stop', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bareloop-kinds-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const got = await seedAtHead(dir);
  assert.equal(got.seedRef, null);
  assert.match(/** @type {string} */ (got.stop), /^INSTRUMENT: could not read HEAD/);
});

// ── contract (c): the changed-set primitive ──────────────────────────────────

test('isArbiterBook: `.litectx/` is a PREFIX, `gate-audit.jsonl` an EXACT path — a worker-authored src/gate-audit.jsonl is not a book', () => {
  assert.equal(isArbiterBook('.litectx/store/index.json'), '.litectx/');
  assert.equal(isArbiterBook('gate-audit.jsonl'), 'gate-audit.jsonl');
  assert.equal(isArbiterBook('src/gate-audit.jsonl'), null);
  assert.equal(isArbiterBook('litectx/x.json'), null);
});

test('the changed set is diff PLUS untracked, MINUS the two arbiter books — and the decoy still counts', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n', 'README.md': 'r\n' });
  write(r.dir, {
    'src/a.js': 'a changed\n',                 // tracked, modified
    'src/new.js': 'brand new\n',               // untracked
    '.litectx/store.json': '{}\n',             // arbiter book (prefix)
    'gate-audit.jsonl': '{"a":1}\n',           // arbiter book (exact path)
    'src/gate-audit.jsonl': '{"worker":1}\n',  // the DECOY — not a book
  });
  const cs = await changedSet(r.dir, r.seed);
  assert.equal(cs.stop, null);
  assert.deepEqual(cs.paths, ['src/a.js', 'src/gate-audit.jsonl', 'src/new.js']);
  assert.deepEqual(cs.excluded.map((e) => e.path).sort(), ['.litectx/store.json', 'gate-audit.jsonl']);
});

test('a seed commit that does not exist is an instrument stop, on every kind that reads the changed set', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const cs = await changedSet(r.dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  assert.ok(cs.stop);
  const res = await runStage(
    { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } },
    ctxFor({ dir: r.dir, seed: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }),
  );
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.exitCode, EXIT_STOP);
  assert.equal(res.judged, false);
});

// ── command-exit ─────────────────────────────────────────────────────────────

test('command-exit: the declared exit is green and judged; another exit is red, judged, and carries the output', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const ok = await runStage({ name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SAY('all good\n', 0), expectExit: 0 } }, ctxFor(r));
  assert.equal(ok.verdict, 'green');
  assert.equal(ok.exitCode, EXIT_GREEN);
  assert.equal(ok.judged, true);
  assert.deepEqual(ok.gapLines, []);

  const bad = await runStage({ name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SAY('not ok 3 - the thing\n', 1), expectExit: 0 } }, ctxFor(r));
  assert.equal(bad.verdict, 'red');
  assert.equal(bad.exitCode, EXIT_RED);
  assert.equal(bad.judged, true);
  assert.match(bad.gapLines.join('\n'), /exited 1, expected 0/);
  assert.match(bad.gapLines.join('\n'), /not ok 3 - the thing/);
});

test('command-exit: a command that outruns its timeout is an instrument stop, never a red', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const res = await runStage(
    { name: 'slow', kind: 'command-exit', params: { cmd: 'node', args: ['-e', 'setTimeout(() => {}, 60000)'], expectExit: 0, timeoutMs: 300 } },
    ctxFor(r),
  );
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.match(res.gapLines.join('\n'), /did not finish/i);
});

test('command-exit: a binary that cannot be run is an instrument stop naming it', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const res = await runStage({ name: 'typecheck', kind: 'command-exit', params: { cmd: 'definitely-not-a-real-binary-xyz', args: [], expectExit: 0 } }, ctxFor(r));
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.match(res.gapLines.join('\n'), /definitely-not-a-real-binary-xyz/);
});

test('command-exit: a NULL exit code (death by signal) is an instrument stop, not exit-0-adjacent', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const res = await runStage(
    { name: 'oom', kind: 'command-exit', params: { cmd: 'node', args: ['-e', "process.kill(process.pid, 'SIGKILL')"], expectExit: 0 } },
    ctxFor(r),
  );
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.match(res.gapLines.join('\n'), /null exit code|signal/i);
});

test('command-exit: output past the buffer ceiling is an instrument stop — a truncated read is unknown, not zero', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const res = await runStage(
    { name: 'loud', kind: 'command-exit', params: { cmd: 'node', args: ['-e', "process.stdout.write('x'.repeat(200000))"], expectExit: 0 } },
    ctxFor(r, { maxBuffer: 1024 }),
  );
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.match(res.gapLines.join('\n'), /truncated|exceeded/i);
});

// ── the time ceiling: a declaration may only TIGHTEN it ──────────────────────

test('a declared timeoutMs may only TIGHTEN the operator ceiling, never widen it — on every kind that spawns', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 1\n' });
  const CEILING = 400;
  const SLEEP = ['-e', 'setTimeout(() => {}, 3000)'];

  const exitStage = await runStage(
    { name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SLEEP, expectExit: 0, timeoutMs: 60_000 } },
    ctxFor(r, { timeoutMsDefault: CEILING }),
  );
  assert.equal(exitStage.verdict, 'instrument-stop', 'the declared 60s must not outrank the operator ceiling');
  assert.match(exitStage.gapLines.join('\n'), new RegExp(`did not finish inside ${CEILING}ms`));

  const countStage = await runStage(
    { name: 'typecheck', kind: 'count-not-worse', params: { cmd: 'node', args: SLEEP, parser: { lineMatch: 'total (\\d+)', capture: 1 }, scope: {}, direction: 'lower-is-better', baseline: 0, timeoutMs: 60_000 } },
    ctxFor(r, { timeoutMsDefault: CEILING }),
  );
  assert.equal(countStage.verdict, 'instrument-stop', 'the second spawning site obeys the same ceiling');
  assert.match(countStage.gapLines.join('\n'), new RegExp(`did not finish inside ${CEILING}ms`));

  // and it still TIGHTENS: below the ceiling, the declaration is the bound that fires
  const tighter = await runStage(
    { name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SLEEP, expectExit: 0, timeoutMs: 250 } },
    ctxFor(r, { timeoutMsDefault: 30_000 }),
  );
  assert.equal(tighter.verdict, 'instrument-stop');
  assert.match(tighter.gapLines.join('\n'), /did not finish inside 250ms/);
});

// ── count-not-worse ──────────────────────────────────────────────────────────

const COUNT_STAGE = (/** @type {object} */ params) => ({ name: 'typecheck', kind: 'count-not-worse', params: { cmd: 'node', args: CAT('report.txt'), scope: { includePrefixes: ['src/'] }, direction: 'lower-is-better', baseline: 0, ...params } });

test('count-not-worse: baseline 0 lower-is-better reds above zero and greens at zero, with value and baseline reported', async (t) => {
  const errors = ['src/a.js:1 - error TS2322: x', 'src/b.js:2 - error TS2345: y'];
  const r = makeRepo(t, { 'report.txt': `${errors.join('\n')}\n`, 'src/a.js': 'a\n', 'src/b.js': 'b\n' });
  const stage = COUNT_STAGE({ parser: { terms: [{ lineMatch: 'error TS\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] } });

  const red = await runStage(stage, ctxFor(r));
  assert.equal(red.verdict, 'red');
  assert.equal(red.value, errors.length);
  assert.equal(red.baseline, 0);
  assert.equal(red.judged, true);
  assert.match(red.gapLines.join('\n'), new RegExp(`${errors.length} against a baseline of 0`));

  write(r.dir, { 'report.txt': 'clean\n' });
  const green = await runStage(stage, ctxFor(r));
  assert.equal(green.verdict, 'green');
  assert.equal(green.value, 0);
  assert.equal(green.judged, true);
});

test('count-not-worse: higher-is-better is a FLOOR — dropping below the baseline reds', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 10\n' });
  const stage = {
    name: 'tests-kept',
    kind: 'count-not-worse',
    params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' },
  };
  const same = await runStage(stage, ctxFor(r));
  assert.equal(same.verdict, 'green', 'the tree is at seed, so value === baseline');
  assert.equal(same.value, same.baseline);

  write(r.dir, { 'report.txt': '# tests 4\n', 'src/x.js': 'moved\n' });
  const dropped = await runStage(stage, ctxFor(r));
  assert.equal(dropped.verdict, 'red');
  assert.equal(dropped.value, 4);
  assert.equal(dropped.baseline, 10, 'the baseline is the SEED tree, measured fresh');
});

test('baseline "seed" is measured IN PLACE when the tree is verifiably identical to the seed, and the route is RECORDED', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 7\n' });
  const res = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' },
  }, ctxFor(r));
  assert.equal(res.baseline, 7);
  assert.match(res.baselineSource, /IN PLACE/i);
});

test('baseline "seed" is measured in a DETACHED WORKTREE once the tree has moved — the seed number, not the current one', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 7\n' });
  write(r.dir, { 'report.txt': '# tests 9\n' });
  const res = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' },
  }, ctxFor(r));
  assert.equal(res.value, 9);
  assert.equal(res.baseline, 7);
  assert.match(res.baselineSource, /worktree/i);
  assert.equal(res.verdict, 'green');
});

test('count-not-worse: the scope filter drops out-of-scope lines and the drop is announced in the GAP, green or red', async (t) => {
  const r = makeRepo(t, {
    'report.txt': 'src/a.js:1 - error TS1: x\nvendor/v.js:1 - error TS1: y\n',
    'src/a.js': 'a\n',
  });
  const res = await runStage(COUNT_STAGE({ parser: { terms: [{ lineMatch: 'error TS\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] } }), ctxFor(r));
  assert.equal(res.value, 1);
  assert.match(res.gapLines.join('\n'), /1 matching line\(s\) dropped by the scope filter/);
  assert.ok(res.gapLines.every((l) => l.startsWith(KEEP)));
});

test('count-not-worse: a parser that cannot read its number stops the stage instead of grading it 0', async (t) => {
  const r = makeRepo(t, { 'report.txt': 'the tool crashed before printing a total\n' });
  const res = await runStage(COUNT_STAGE({ parser: { lineMatch: 'total (\\d+)', capture: 1 }, direction: 'lower-is-better', baseline: 0 }), ctxFor(r));
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.equal(res.value, null, 'an unread number is null, never 0');
});

test('count-not-worse: a stop while measuring the SEED baseline names the seed, and never grades the run', async (t) => {
  // the seed tree has no report.txt at all, so the parser finds nothing THERE
  const r = makeRepo(t, { 'placeholder.txt': 'x\n' });
  write(r.dir, { 'report.txt': '# tests 3\n' });
  const res = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' },
  }, ctxFor(r));
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.match(res.gapLines.join('\n'), /seed/i);
});

test('count-not-worse: a command that CRASHED while matching NOTHING is an instrument stop — a broken ruler never certifies zero', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  const parser = { terms: [{ lineMatch: 'error TS\\d+', sign: 1, aggregate: 'sum', region: 'whole-output' }] };

  // the shape of a type-checker that died before it ever looked at the tree:
  // non-zero exit, and nothing the parser can read. `sum` over nothing is a
  // counted zero ONLY when the tool itself came back clean — 0 against a
  // baseline of 0 would otherwise read GREEN off a checker that never ran.
  const crashed = await runStage(COUNT_STAGE({ args: SAY('config error: cannot find tsconfig\n', 2), parser }), ctxFor(r));
  assert.equal(crashed.verdict, 'instrument-stop');
  assert.equal(crashed.judged, false);
  assert.equal(crashed.value, null, 'a crashed ruler reads unknown, never 0');
  assert.match(crashed.gapLines.join('\n'), /exited 2/);

  // BOTH directions: the same crash under higher-is-better would have minted a
  // fake RED instead of a fake green, and a casualty is never evidence either
  // way (F45)
  const floor = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: { cmd: 'node', args: SAY('config error: cannot find tsconfig\n', 2), parser, scope: {}, direction: 'higher-is-better', baseline: 5 },
  }, ctxFor(r));
  assert.equal(floor.verdict, 'instrument-stop');
  assert.equal(floor.judged, false);

  // the two neighbours that must NOT move
  const found = await runStage(COUNT_STAGE({ args: SAY('src/a.js:1 - error TS2322: x\n', 2), parser }), ctxFor(r));
  assert.equal(found.verdict, 'red', 'a non-zero exit WITH findings is a checker doing its job, not a casualty');
  assert.equal(found.value, 1);
  const clean = await runStage(COUNT_STAGE({ args: SAY('no errors\n', 0), parser }), ctxFor(r));
  assert.equal(clean.verdict, 'green', 'zero matches from a tool that exited 0 is a genuine counted zero');
  assert.equal(clean.value, 0);
});

test('count-not-worse: a CRASHED seed measurement never mints a baseline of 0 — the bar is unknown, so the run stops', async (t) => {
  // the seed tree has no report.txt, so the command DIES there: exit 1, and a
  // `sum` parser matching nothing. Minting 0 from that hands the run a bar
  // anything clears.
  const r = makeRepo(t, { 'placeholder.txt': 'x\n' });
  write(r.dir, { 'report.txt': 'PASS\nPASS\nPASS\n' });
  const res = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: {
      cmd: 'node', args: CAT('report.txt'),
      parser: { terms: [{ lineMatch: 'PASS', sign: 1, aggregate: 'sum', region: 'whole-output' }] },
      scope: {}, direction: 'higher-is-better', baseline: 'seed',
    },
  }, ctxFor(r));
  assert.equal(res.verdict, 'instrument-stop');
  assert.equal(res.judged, false);
  assert.equal(res.baseline, null, 'a baseline read off a crashed tool is unknown, never 0');
  assert.match(res.gapLines.join('\n'), /seed/i);
});

// ── pattern-absent-in-diff ───────────────────────────────────────────────────

const GUARD = (/** @type {object} */ params) => ({
  name: 'no-suppressions',
  kind: 'pattern-absent-in-diff',
  params: {
    patterns: [{ id: 'ts-expect-error', regex: '@ts-expect-error' }, { id: 'ts-ignore', regex: '@ts-ignore' }],
    extensions: ['.js'],
    scope: {},
    ...params,
  },
});

test('pattern-absent-in-diff: a suppression that was ALREADY at the seed is not reported — only ADDED lines count', async (t) => {
  const r = makeRepo(t, { 'src/legacy.js': '// @ts-ignore\nconst a = 1;\n' });
  write(r.dir, { 'src/legacy.js': '// @ts-ignore\nconst a = 1;\nconst b = 2;\n' });
  const res = await runStage(GUARD({}), ctxFor(r));
  assert.equal(res.verdict, 'green');
  assert.equal(res.judged, true);
});

test('pattern-absent-in-diff: an added suppression reds naming the pattern id, the file, and the line', async (t) => {
  const r = makeRepo(t, { 'src/email.js': 'const a = 1;\nconst b = 2;\n' });
  write(r.dir, { 'src/email.js': 'const a = 1;\n// @ts-expect-error\nconst b = 2;\n' });
  const res = await runStage(GUARD({}), ctxFor(r));
  assert.equal(res.verdict, 'red');
  assert.equal(res.exitCode, EXIT_RED);
  assert.equal(res.judged, true);
  const gap = res.gapLines.join('\n');
  assert.match(gap, /\[ts-expect-error\] src\/email\.js:2/);
});

test('pattern-absent-in-diff: an UNTRACKED file has no diff, so its WHOLE body is added — the line a diff-only scan misses', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'ok\n' });
  write(r.dir, { 'src/helper.js': 'line one\nline two\n// @ts-ignore\n' });
  const res = await runStage(GUARD({}), ctxFor(r));
  assert.equal(res.verdict, 'red');
  assert.match(res.gapLines.join('\n'), /\[ts-ignore\] src\/helper\.js:3/);
});

test('pattern-absent-in-diff: the extension filter and the scope filter each exclude a file the other would scan', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'ok\n' });
  write(r.dir, { 'docs/notes.md': '@ts-ignore in prose\n', 'vendor/v.js': '// @ts-ignore\n' });
  const byExt = await runStage(GUARD({}), ctxFor(r));
  assert.equal(byExt.verdict, 'red', 'vendor/v.js is a .js file and is in scope by default');
  assert.match(byExt.gapLines.join('\n'), /vendor\/v\.js/);
  assert.doesNotMatch(byExt.gapLines.join('\n'), /docs\/notes\.md/);

  const scoped = await runStage(GUARD({ scope: { includePrefixes: ['src/'] } }), ctxFor(r));
  assert.equal(scoped.verdict, 'green', 'the scope filter excludes vendor/');
});

// ── files-changed ────────────────────────────────────────────────────────────

test('files-changed: an empty changed set reds — nothing moved against the seed', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  const res = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r));
  assert.equal(res.verdict, 'red');
  assert.equal(res.judged, true);
  assert.match(res.gapLines.join('\n'), /nothing changed|empty/i);
});

test('files-changed: containment — inside the allowed prefixes is green, outside reds naming every stray file', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n', 'other/b.js': 'b\n' });
  write(r.dir, { 'src/a.js': 'a2\n' });
  const inside = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r));
  assert.equal(inside.verdict, 'green');

  write(r.dir, { 'other/b.js': 'b2\n' });
  const outside = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r));
  assert.equal(outside.verdict, 'red');
  assert.match(outside.gapLines.join('\n'), /other\/b\.js/);
});

test('files-changed: the arbiter books never count as work, and the decoy src/gate-audit.jsonl still does', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  write(r.dir, { 'gate-audit.jsonl': '{}\n', '.litectx/i.json': '{}\n' });
  const booksOnly = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r));
  assert.equal(booksOnly.verdict, 'red', 'the arbiter writing its own books is not the worker changing the tree');
  assert.match(booksOnly.gapLines.join('\n'), /nothing changed|empty/i);

  write(r.dir, { 'src/gate-audit.jsonl': '{"worker":1}\n' });
  const decoy = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r));
  assert.equal(decoy.verdict, 'green', 'a worker-authored src/gate-audit.jsonl is a real change inside src/');
});

test('addedLines: an untracked path that cannot be STATTED is ANNOUNCED, never scanned-clean in silence', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  // a dangling symlink: it exists to git ls-files --others, and stat() throws
  symlinkSync(join(r.dir, 'nowhere-at-all'), join(r.dir, 'dangling.js'));
  const got = await addedLines(r.dir, r.seed, 'dangling.js', { untracked: true });
  assert.equal(got.stop, null, 'a dangling link has no content to hide — the note keeps it honest, a stop would be a lie');
  assert.deepEqual(got.lines, []);
  assert.match(/** @type {string} */ (got.note), /^dangling\.js: could not stat \(ENOENT\) — NOT scanned$/,
    'every other unscannable branch announces itself; this one returned note:null and read as clean');
});

// ── contract (b): the gap ────────────────────────────────────────────────────

test('every gap line carries the spec gapKeep — the arbiter\'s own token, on every kind', async (t) => {
  const r = makeRepo(t, { 'src/a.js': 'a\n' });
  const res = await runStage({ name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } }, ctxFor(r, { gapKeep: 'XYZ| ' }));
  assert.ok(res.gapLines.length > 0);
  assert.ok(res.gapLines.every((l) => l.startsWith('XYZ| ')), res.gapLines.join('\n'));
});

test('an over-cap gap is trimmed with the trim ANNOUNCED and counted (F28: a silent bound eats the failure names)', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const lines = Array.from({ length: GAP_LINE_CAP * 2 }, (_, i) => `not ok ${i + 1} - case ${i + 1}`);
  const res = await runStage(
    { name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SAY(`${lines.join('\n')}\n`, 1), expectExit: 0 } },
    ctxFor(r),
  );
  assert.equal(res.verdict, 'red');
  assert.equal(res.gapLines.length, GAP_LINE_CAP, 'the cap holds');
  const last = res.gapLines.at(-1);
  assert.match(last, /trimmed/i);
  assert.match(last, /withheld/i);
  // the counts are the fixture's own, not a constant
  assert.match(last, new RegExp(`of ${lines.length + 1} lines`));
});

// ── contract (a): the judged marker, both directions ─────────────────────────

test('judged rides EVERY real judgment (green and red) and is withheld from EVERY stop', async (t) => {
  const r = makeRepo(t, { 'report.txt': 'error TS1: x\n', 'src/a.js': 'a\n' });
  write(r.dir, { 'src/a.js': 'a2\n' });
  /** @type {Array<{label: string, stage: any, verdict: string}>} */
  const cases = [
    { label: 'green', stage: { name: 's', kind: 'command-exit', params: { cmd: 'node', args: SAY('', 0), expectExit: 0 } }, verdict: 'green' },
    { label: 'red', stage: { name: 's', kind: 'command-exit', params: { cmd: 'node', args: SAY('', 3), expectExit: 0 } }, verdict: 'red' },
    { label: 'timeout', stage: { name: 's', kind: 'command-exit', params: { cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], expectExit: 0, timeoutMs: 250 } }, verdict: 'instrument-stop' },
    { label: 'spawn-fault', stage: { name: 's', kind: 'command-exit', params: { cmd: 'no-such-binary-abc', args: [], expectExit: 0 } }, verdict: 'instrument-stop' },
    { label: 'locked kind', stage: { name: 's', kind: 'judged-floor', params: {} }, verdict: 'instrument-stop' },
    { label: 'unknown kind', stage: { name: 's', kind: 'vibes-check', params: {} }, verdict: 'instrument-stop' },
    { label: 'malformed params', stage: { name: 's', kind: 'pattern-absent-in-diff', params: { patterns: 'not-an-array', extensions: ['.js'], scope: {} } }, verdict: 'instrument-stop' },
    { label: 'parser stop', stage: { name: 's', kind: 'count-not-worse', params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: 'total (\\d+)', capture: 1 }, scope: {}, direction: 'lower-is-better', baseline: 0 } }, verdict: 'instrument-stop' },
  ];
  for (const c of cases) {
    const res = await runStage(c.stage, ctxFor(r));
    assert.equal(res.verdict, c.verdict, `${c.label}: ${res.gapLines.join('\n')}`);
    assert.equal(res.judged, c.verdict !== 'instrument-stop', `${c.label}: judged`);
    assert.equal(res.exitCode, c.verdict === 'green' ? EXIT_GREEN : c.verdict === 'red' ? EXIT_RED : EXIT_STOP, c.label);
  }
});

test('a stop still explains itself on the gap channel — a silent casualty is unreadable', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  const res = await runStage({ name: 's', kind: 'judged-floor', params: {} }, ctxFor(r));
  assert.ok(res.gapLines.length > 0);
  assert.match(res.gapLines.join('\n'), /judged-floor/);
  assert.ok(res.gapLines.every((l) => l.startsWith(KEEP)));
});

// ── seedRead vs runDeclaredClose (D12) ───────────────────────────────────────────────

const TWO_STAGE_DECL = {
  stages: [
    { name: 'changed-from-seed', kind: 'files-changed', params: { allowPrefixes: ['src/'], requireNonEmpty: true } },
    { name: 'tests-kept', kind: 'count-not-worse', params: { cmd: 'node', args: CAT('report.txt'), parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' } },
    { name: 'suite-green', kind: 'command-exit', params: { cmd: 'node', args: SAY('ok\n', 0), expectExit: 0 } },
  ],
};

test('seedRead runs EVERY stage regardless of reds — changed-from-seed is red at its own seed by construction, so first-red-wins would measure nothing', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 11\n', 'src/a.js': 'a\n' });
  const rows = await seedRead(TWO_STAGE_DECL, ctxFor(r));
  assert.equal(rows.length, TWO_STAGE_DECL.stages.length);
  assert.equal(rows[0].verdict, 'red', 'nothing has changed at the seed');
  assert.equal(rows[1].verdict, 'green');
  assert.equal(rows[1].baseline, 11, 'the baseline was minted even though stage 1 redded');
  assert.equal(rows[2].verdict, 'green');
  assert.ok(rows.every((x) => x.verdict !== 'not-reached'));
});

test('runDeclaredClose is first-red-wins: the deciding stage names the verdict and later stages are NOT REACHED', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 11\n', 'src/a.js': 'a\n' });
  const res = await runDeclaredClose(TWO_STAGE_DECL, ctxFor(r));
  assert.equal(res.verdict, 'red');
  assert.equal(res.exitCode, EXIT_RED);
  assert.equal(res.firstRed, 'changed-from-seed');
  assert.equal(res.judged, true);
  assert.deepEqual(res.stages.map((s) => s.verdict), ['red', 'not-reached', 'not-reached']);
});

test('runDeclaredClose greens only when every stage greens, and an instrument stop ends it UNJUDGED', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 11\n', 'src/a.js': 'a\n' });
  write(r.dir, { 'src/a.js': 'a2\n' });
  const green = await runDeclaredClose(TWO_STAGE_DECL, ctxFor(r));
  assert.equal(green.verdict, 'green');
  assert.equal(green.exitCode, EXIT_GREEN);
  assert.equal(green.judged, true);

  const stopped = await runDeclaredClose({ stages: [...TWO_STAGE_DECL.stages, { name: 'oops', kind: 'command-exit', params: { cmd: 'no-such-binary-abc', args: [], expectExit: 0 } }] }, ctxFor(r));
  assert.equal(stopped.verdict, 'instrument-stop');
  assert.equal(stopped.exitCode, EXIT_STOP);
  assert.equal(stopped.judged, false);
});

test('a shared seed-tree holder is created and REMOVED — a run never leaves worktrees behind', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 5\n', 'src/a.js': 'a\n' });
  write(r.dir, { 'report.txt': '# tests 6\n' });
  const seeds = makeSeedTrees();
  const res = await runStage(TWO_STAGE_DECL.stages[1], ctxFor(r, { seedTrees: seeds }));
  assert.equal(res.baseline, 5);
  await seeds.cleanup();
  const listed = git(r.dir, ['worktree', 'list']).trim().split('\n');
  assert.equal(listed.length, 1, `expected only the main worktree, saw:\n${listed.join('\n')}`);
});

test('runStage cleans up after itself when no holder is supplied', async (t) => {
  const r = makeRepo(t, { 'report.txt': '# tests 5\n', 'src/a.js': 'a\n' });
  write(r.dir, { 'report.txt': '# tests 6\n' });
  const res = await runStage(TWO_STAGE_DECL.stages[1], ctxFor(r));
  assert.equal(res.baseline, 5);
  assert.equal(git(r.dir, ['worktree', 'list']).trim().split('\n').length, 1);
});

// ── cleanup runs in a `finally`, so it must NEVER throw ──────────────────────
//
// Every call site (runStage, seedRead, runDeclaredClose here; declaredclose.js
// and authorflow.js outside) removes the holder in a `finally`. A rejection
// there propagates OUT of the finally and discards an ALREADY-COMPUTED verdict
// — a paid green vanishing into something that reads like a transport failure
// downstream. A cleanup hiccup never outranks a paid verdict; the fixtures
// below make the removal genuinely fail (a chmod-000 directory the remover
// cannot descend into) and assert the verdict survives and the leak is DATA.

/** the seed-tree roots these fixtures deliberately made unremovable (`tree/locked`) */
function plantedSeedRoots() {
  /** @type {string[]} */
  const found = [];
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith('bareloop-seed-')) continue;
    const root = join(tmpdir(), name);
    if (existsSync(join(root, 'tree', 'locked'))) found.push(root);
  }
  return found;
}

/** give the permissions back so the tmpdir can actually be emptied */
function unplant() {
  for (const root of plantedSeedRoots()) {
    try { chmodSync(join(root, 'tree', 'locked'), 0o700); } catch { /* already gone */ }
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {any} t */
const skipIfRoot = (t) => {
  // root ignores mode 000, so the removal would succeed and the test could not
  // fail — a guard built to prove failure is possible must not pass vacuously
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('running as root: chmod 000 cannot deny the remover, so this fixture cannot fail');
    return true;
  }
  return false;
};

test('cleanup() NEVER throws — a tree it cannot remove comes back as DATA (ok:false + the leaked root), never as a rejection', async (t) => {
  if (skipIfRoot(t)) return;
  const r = makeRepo(t, { 'report.txt': '# tests 5\n' });
  t.after(unplant);
  const seeds = makeSeedTrees();
  const st = await seeds.ensure(r.dir, r.seed);
  assert.equal(st.stop, null, 'the fixture needs a real worktree to fail on');
  const root = dirname(st.dir);
  mkdirSync(join(st.dir, 'locked'), { recursive: true });
  writeFileSync(join(st.dir, 'locked', 'x.txt'), 'x');
  chmodSync(join(st.dir, 'locked'), 0o000);

  const res = await seeds.cleanup();
  assert.equal(res.ok, false, 'a failed removal is reported, never swallowed into a silent ok');
  assert.deepEqual(res.leaked, [root], 'the leaked root is NAMED, so a caller that looks can attach a note');
  assert.match(String(res.detail), /EACCES|permission/i, 'the real error is carried, not erased');
});

test('a cleanup that cannot remove the seed tree never discards the verdict — the paid green survives the finally', async (t) => {
  if (skipIfRoot(t)) return;
  const r = makeRepo(t, { 'report.txt': '# tests 7\n' });
  t.after(unplant);
  write(r.dir, { 'report.txt': '# tests 9\n' });  // the tree has moved → the detached-worktree route
  // the stage's own command plants the unremovable directory, and ONLY inside
  // the seed worktree (basename "tree") — the measurement itself is untouched,
  // and the sabotage lands AFTER every number the verdict is made of
  const SABOTAGE = ['-e', [
    "const fs=require('fs'),path=require('path');",
    "if(path.basename(process.cwd())==='tree'){fs.mkdirSync('locked',{recursive:true});fs.writeFileSync('locked/x.txt','x');fs.chmodSync('locked',0);}",
    "process.stdout.write(fs.readFileSync('report.txt','utf8'));",
  ].join('')];
  const res = await runStage({
    name: 'tests-kept', kind: 'count-not-worse',
    params: { cmd: 'node', args: SABOTAGE, parser: { lineMatch: '# tests (\\d+)', capture: 1 }, scope: {}, direction: 'higher-is-better', baseline: 'seed' },
  }, ctxFor(r));
  assert.equal(res.verdict, 'green', 'the verdict was already computed — a cleanup hiccup must not delete it');
  assert.equal(res.value, 9);
  assert.equal(res.baseline, 7);
  assert.equal(res.judged, true);
  assert.ok(plantedSeedRoots().length > 0, 'the fixture really did leave a tree the remover could not remove');
});

// ── the env the close hands worker-authored code ─────────────────────────────

test('the stage child never sees the operator\'s credentials (CLOSE_ENV_DENY), and a declared env naming one is DROPPED, announced', async (t) => {
  const r = makeRepo(t, { 'a.js': 'a\n' });
  process.env.BARELOOP_TEST_FAKE_API_KEY = 'sk-must-not-reach-the-child';
  t.after(() => { delete process.env.BARELOOP_TEST_FAKE_API_KEY; });
  const probe = ['-e', "process.stdout.write(String(process.env.BARELOOP_TEST_FAKE_API_KEY ?? 'absent') + '|' + String(process.env.MYPYPATH ?? 'unset'))"];
  const res = await runStage(
    { name: 'probe', kind: 'command-exit', params: { cmd: 'node', args: probe, expectExit: 1, env: { MYPYPATH: 'src', ANTHROPIC_API_KEY: 'sk-nope' } } },
    ctxFor(r),
  );
  const gap = res.gapLines.join('\n');
  assert.match(gap, /absent\|src/, 'the credential is stripped; a legitimate declared var survives');
  assert.match(gap, /ANTHROPIC_API_KEY/, 'the dropped declared name is ANNOUNCED, never silent');
});

test('NODE_TEST_CONTEXT never reaches the child — inherited, a `node --test` stage silently no-ops into a fake green', async (t) => {
  // This assertion is only worth anything while the host runner actually
  // SETS the variable; if it ever stops, the test must red rather than pass
  // vacuously (a guard built to prove failure is possible has to be checked
  // for its own inertness).
  assert.ok(process.env.NODE_TEST_CONTEXT, 'the host runner no longer sets NODE_TEST_CONTEXT — this test can no longer fail');
  const r = makeRepo(t, { 'a.js': 'a\n' });
  // the marker is ASSEMBLED at runtime: the gap echoes the command line, so a
  // literal answer sitting in argv would satisfy the match whatever the child
  // saw — the whole string `SEEN=none` exists only if the child printed it
  const res = await runStage(
    { name: 'probe', kind: 'command-exit', params: { cmd: 'node', args: ['-e', "process.stdout.write('SEEN=' + String(process.env.NODE_TEST_CONTEXT ?? 'none'))"], expectExit: 1 } },
    ctxFor(r),
  );
  assert.match(res.gapLines.join('\n'), /SEEN=none/);
});
