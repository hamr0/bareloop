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
