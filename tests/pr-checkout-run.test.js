// Piece 12 at the run-start seam: the REAL engine (`run-u --spec`, in-process) on a worktree job whose run is given a PR (deps.pr, the door the PR reader will use).
// Real git and the local bare repo of tests/pr-checkout-world.mjs; a scripted provider that must never be called (the close is green on the PR code before any token).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { prepareSource } from '../src/source.js';
import { main } from '../src/userrun.js';
import { scriptedProvider, gitInPatient } from './helpers.js';
import { makeWorld, record, out, ADDRESS } from './pr-checkout-world.mjs';
import { worktreePath } from '../src/worktree.js';

// green only on code that has the PR's file: the close judges the TREE the run starts with
const CLOSE_SOURCE = `import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('FIXTURE judged=1');
process.exit(existsSync(join(process.cwd(), 'src', 'only-on-pr.js')) ? 0 : 1);
`;

const sink = () => {
  /** @type {string[]} */ const chunks = [];
  return { push: (/** @type {string} */ s) => { chunks.push(s); }, text: () => chunks.join('\n') };
};

/** a session laid out like the panel's, over the world's repo: the real source door in worktree mode @param {import('node:test').TestContext} t */
async function session(t) {
  const w = makeWorld(t);
  // the world made a worktree for the unit tests; this session makes its own through the source door
  gitInPatient(w.repo, ['worktree', 'remove', '--force', w.wt]);
  const dir = mkdtempSync(join(tmpdir(), 'pr-run-session-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const closeScript = join(dir, 'close.mjs');
  writeFileSync(closeScript, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'pr-head-job', description: 'piece 12 fixture: the close is green on the PR code.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['src/**'], goal: 'Make src/only-on-pr.js exist.', verdictType: 'green',
    close: [{ name: 'has-pr-file', cmd: `node ${closeScript} has-pr-file`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = join(dir, 'source-seed');
  const worktree = worktreePath(w.repo, 'sess1');
  const prep = await prepareSource({ source: w.repo, into, destination: 'src/', worktree });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  return { ...w, dir, spec, specPath, into, worktree };
}

const go = async (/** @type {any} */ f, /** @type {any} */ pr, /** @type {import('node:test').TestContext} */ t) => {
  const o = sink(); const e = sink();
  const home = mkdtempSync(join(tmpdir(), 'pr-run-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec)], { provider: scriptedProvider([]), env: {}, out: o.push, err: e.push, runlistHome: home, pr });
  return { rc, out: o.text(), err: e.text() };
};

test('a PR run: the seed is the PR head, the close judges the PR\'s code before any token, source.json and job-start name the PR, the private ref goes with the worktree', async (t) => {
  const f = await session(t);
  assert.equal(out(f.worktree, ['rev-parse', 'HEAD']), f.baseSha, 'the session starts at the person\'s HEAD');
  const r = await go(f, { url: ADDRESS, record: record(f.prSha, f.baseSha) }, t);
  assert.equal(r.rc, 0, `${r.out}\n${r.err}`);
  assert.match(r.out, /outcome\s+already-green/, 'the close was green on the PR head with no worker turn');
  const clean = /patient reset — clean at ([0-9a-f]{7,})/.exec(r.out);
  assert.ok(clean && f.prSha.startsWith(clean[1]), `the patient was reset to the PR head, not the person's HEAD: ${clean?.[1]}`);
  const m = JSON.parse(readFileSync(join(f.into, 'source.json'), 'utf8'));
  assert.equal(m.seed, f.prSha);
  assert.equal(m.prHead, f.prSha);
  assert.equal(m.prNumber, 1);
  assert.deepEqual(m.prBase, { ref: 'main', sha: f.baseSha });
  const spineDir = join(f.into, 'pr-head-job-bareloop');
  const spine = readdirSync(spineDir).filter((n) => /^u-.*\.jsonl$/.test(n)).flatMap((n) => readFileSync(join(spineDir, n), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  const start = spine.find((e) => e.type === 'job-start');
  assert.deepEqual(start.pr, { number: 1, ownerRepo: 'octo/widgets', head: f.prSha, base: { ref: 'main', sha: f.baseSha }, mergeBase: f.baseSha });
  assert.equal(out(f.repo, ['for-each-ref', 'refs/bareloop']), '', 'worktree removed on green, private ref removed with it');
  assert.equal(existsSync(f.worktree), false);
  assert.equal(out(f.repo, ['symbolic-ref', '--short', 'HEAD']), 'main', 'the person\'s checkout never moved');
});

test('a PR that moved before the run started: a $0 refusal in the spec\'s words, no ref left, the provider never called', async (t) => {
  const f = await session(t);
  const r = await go(f, { url: ADDRESS, record: record(f.laterSha, f.baseSha) }, t);
  assert.equal(r.rc, 2, `${r.out}\n${r.err}`);
  assert.match(r.err, /The pull request changed while the run was starting\. Run it again\. Nothing spent\./);
  assert.doesNotMatch(r.err, /The run did not start\. Nothing spent\./, 'the spec\'s own words end the line; nothing is appended');
  assert.equal(out(f.repo, ['for-each-ref', 'refs/bareloop']), '');
  const m = JSON.parse(readFileSync(join(f.into, 'source.json'), 'utf8'));
  assert.equal(m.prHead, undefined, 'a refused checkout records nothing');
  assert.equal(m.seed, f.baseSha);
});

test('a record with no head: the "no code to fetch" refusal at the seam', async (t) => {
  const f = await session(t);
  const r = await go(f, { url: ADDRESS, record: { number: 1 } }, t);
  assert.equal(r.rc, 2);
  assert.match(r.err, /Pull request #1 has no code to fetch \(GitHub did not offer its head\)\. Nothing spent\./);
});
