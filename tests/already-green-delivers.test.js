// An `already-green` ending delivers what a `green` delivers (live bug, run mwvwcxvy): a resumed review run whose tree already passes the close
// must write its `review-findings` record and stage the ONE markdown report, and "is this outcome a green" has ONE owner (isReusableGreen).
// REAL runner and real git (tests/range-run-world.mjs); the worker is scripted.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rangeSession, cleanup, tmp, ANSWER_AT_END } from './range-run-world.mjs';
import { main } from '../src/userrun.js';
import { copyOut } from '../src/source.js';
import { jobSpecHash } from '../src/job.js';
import { readRunList } from '../src/runlist.js';
import { stopFilePath } from '../src/legs.js';
import { scriptedProvider, reply } from './helpers.js';

after(cleanup);
const spineOf = (/** @type {string} */ out) => { const p = /^spine\s+(\S+)/m.exec(out)?.[1]; return p ? readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; };
const answerPath = (/** @type {any} */ f) => path.join(f.prep.tree, 'output', 'steps', '1.json');
const putAnswer = (/** @type {any} */ f) => { mkdirSync(path.dirname(answerPath(f)), { recursive: true }); writeFileSync(answerPath(f), JSON.stringify(ANSWER_AT_END)); };

test('(a)(b) a RESUMED already-green worktree review run writes its review-findings record before the door and stages the .md report under output/ like a green with a door open', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const home = tmp('ag-home-');
  /** @type {string|null} */ let spine = null;
  let calls = 0;
  const leg1 = { name: 'queue', async generate() { calls += 1; if (calls === 2) { spine = readRunList({ home }).rows[0].spine; writeFileSync(stopFilePath(spine), ''); } return reply(calls === 1 ? { text: 'scout notes' } : { text: f.plan }); } };
  const o1 = /** @type {string[]} */ ([]);
  await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], { provider: leg1, env: {}, out: (/** @type {any} */ s) => o1.push(String(s)), err: () => {}, runlistHome: home });
  assert.match(o1.join('\n'), /outcome\s+stopped/, o1.join('\n'));
  assert.ok(spine);
  putAnswer(f); // the answer is in the tree, so on resume the close already passes
  const o2 = /** @type {string[]} */ ([]);
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec), '--resume', spine], { provider: scriptedProvider([{ text: 'never reached' }]), env: {}, out: (/** @type {any} */ s) => o2.push(String(s)), err: () => {}, runlistHome: home });
  const out = o2.join('\n');
  assert.equal(rc, 0, out);
  assert.match(out, /outcome\s+already-green/, out);
  const recs = spineOf(out);
  const types = recs.map((e) => e.type);
  assert.equal(recs.filter((e) => e.type === 'review-findings').length, 1, types.join(' '));
  assert.ok(types.lastIndexOf('review-findings') < types.lastIndexOf('review-door'), types.join(' '));
  assert.equal(recs.filter((e) => e.type === 'report-staged').length, 1, 'the report is staged for the Accept');
  const staged = recs.find((e) => e.type === 'report-staged').path;
  assert.ok(existsSync(staged), staged);
  assert.match(staged, /output[\\/][^\\/]+\.md$/);
  assert.deepEqual(readdirSync(f.prep.tree).includes('docs') ? readdirSync(path.join(f.prep.tree, 'docs')).filter((n) => n.endsWith('.md') && n.includes('range-job')) : [], [], 'nothing landed at Destination yet');
});

test('(c) a COLD already-green has no step files: the report staging refuses in plain words, throws nothing and writes nothing', async (t) => {
  const f = await rangeSession(t, { lineText: 'Review range: v0..v1 for bugs' });
  const before = readdirSync(f.prep.tree).sort();
  const co = await copyOut({ tree: f.prep.tree, destination: 'docs/', inRepo: true, stage: true, report: { name: 'range-job', render: () => '# report\n' } });
  assert.equal(co.files?.length ?? 0, 0);
  assert.match(String(co.stop), /no non-empty file exists under/);
  assert.deepEqual(readdirSync(f.prep.tree).sort(), before, 'the tree is untouched');
});

test('(d) the "is this outcome a green" test has ONE owner: no src file outside src/panel/status.js hand-spells green with already-green', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  /** @type {string[]} */ const files = [];
  const walk = (/** @type {string} */ d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
  walk(root);
  const owner = path.join(root, 'panel', 'status.js');
  const spelled = /===\s*'green'\s*\|\|[^;\n]*===\s*'already-green'|===\s*'already-green'\s*\|\|[^;\n]*===\s*'green'|!==\s*'green'\s*&&[^;\n]*!==\s*'already-green'|!==\s*'already-green'\s*&&[^;\n]*!==\s*'green'/;
  const hits = files.filter((p) => p !== owner).flatMap((p) => readFileSync(p, 'utf8').split('\n').map((l, i) => (spelled.test(l) ? `${path.relative(root, p)}:${i + 1}: ${l.trim()}` : null)).filter((x) => x !== null));
  assert.deepEqual(hits, [], 'use isReusableGreen from src/panel/status.js');
});

// (e) EVERY test of a run OUTCOME against 'green' alone (`outcome === 'green'`, `!== 'green'`, in any spelling ending in "outcome") must be a classified, deliberate one. "The run passed" is
// isReusableGreen (green or already-green); a site that means MINTED green only, or that reads a different thing named outcome (a bridge ROW, a step, a fix-loop result), is listed here with
// its reason. A NEW green-only test fails until its author reads this list and either calls isReusableGreen or adds the site WITH a reason (key = file + the line's own text).
const GREEN_ONLY = [
  // minted green only, on purpose
  ['bundlerun.js', "if (outcome === 'green' && !bundle.blessing) {", 'signing a bundle is arbiter territory; an already-green proves nothing about the bundle\'s own work'],
  ['userrun.js', "if (outcome === 'green' && plan && !leaks.length && !ctx.bundle) {", 'an already-green mints no bridge: accept confirms a verdict, it never mints one'],
  ['reuse.js', "if (outcome !== 'green') {", 'writeRunGreenRow: an already-green predates the run and mints no registry row (reason green-predates-run)'],
  [path.join('panel', 'schedules.js'), 'r.outcome === \'green\'', 'the schedule gate takes a real green only (T3)'],
  [path.join('panel', 'server.js'), "outcome: outcome === 'green' && heldScheduled(", 'the schedule gate\'s held-green rule (T D.2)'],
  // a bridge ROW's own outcome (appendGreen mints only 'green' rows; an already-green never becomes one)
  ['bridges.js', "r.outcome === 'green'", 'bridge history rows: only minted greens are rows'],
  ['bridges.js', "h.outcome === 'green'", 'bridge history rows: only minted greens are rows'],
  ['bridges.js', "o.outcome === 'green' && o.failingStage", 'bridge row validation'],
  ['bridges.js', "o.outcome !== 'green'", 'bridge row validation'],
  ['bridges.js', "o.outcome === 'green') red(", 'bridge row validation'],
  ['userrun.js', "h.outcome === 'green' && h.quarantined === true", 'a bridge history row held for the door'],
  [path.join('panel', 'importrun.js'), "h.outcome === 'green'", 'a bridge history row of an imported bundle'],
  [path.join('panel', 'importroutes.js'), "r.outcome === 'green'", 'a bridge history row of an imported bundle'],
  // a different thing named outcome: a STEP's, a fix attempt's, the fix loop's own result (never the run's ending)
  ['replay.js', "a.outcome === 'green'", 'a fix attempt\'s own result'],
  ['planrun.js', 'res.outcome === \'green\'', 'a step\'s own result'],
  ['planrun.js', "fixOutcome", 'the fix loop\'s own result; the run ending is decided from it just below'],
  ['reuse.js', "e.type === 'step-end' && e.outcome === 'green'", 'a step-end record\'s own result'],
  // the owner
  [path.join('panel', 'status.js'), "return outcome === 'green' || outcome === 'already-green';", 'isReusableGreen itself'],
];

test('(e) every green-only test of an outcome is classified: a new one fails until it uses isReusableGreen or is listed with its reason', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  /** @type {string[]} */ const files = [];
  const walk = (/** @type {string} */ d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
  walk(root);
  const greenOnly = /[oO]utcome\s*[!=]==\s*'green'/;
  /** @type {string[]} */ const unclassified = [];
  const used = new Set();
  for (const p of files) {
    const rel = path.relative(root, p);
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (!greenOnly.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const k = GREEN_ONLY.findIndex(([f, snip]) => f === rel && line.includes(snip));
      if (k < 0) unclassified.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`); else used.add(k);
    });
  }
  assert.deepEqual(unclassified, [], 'a green-only outcome test: use isReusableGreen (src/panel/status.js) if the run PASSED means green or already-green, else add the site to GREEN_ONLY with its reason');
  assert.deepEqual(GREEN_ONLY.map((_, k) => k).filter((k) => !used.has(k)).map((k) => GREEN_ONLY[k][1]), [], 'a stale allow-list entry (the site is gone or reworded): remove or fix it');
});
