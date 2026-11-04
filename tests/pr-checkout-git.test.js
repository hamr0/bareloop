// MCP + tickets piece 12 (ITEM33-BUILD "Piece 12"): the PR-head checkout, against REAL git and a LOCAL bare repo that serves refs/pull/1/head (no network).
// Cases from the spec's Tests list: fetch ok, fork-shaped head, sha mismatch, no matching remote, unreachable remote, credential in URL, ref cleanup, resume ancestor,
// the guard follows the PR head. Every commit in the fixture forces a neutral identity (tests/helpers.js patientGitEnv).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { checkoutPrHead, prHeadIsAncestor, recordPrOnManifest } from '../src/prcheckout.js';
import { removePrRef, prRefName } from '../src/worktree.js';
import { spawnClose } from '../src/ralph.js';
import { gatedShellOptions, trackedAtSeedGuard } from '../src/tools.js';
import { seedAtHead, seedListing, GATE_AUDIT_FILE } from '../src/kinds.js';
import { gitInPatient, patientGitEnv } from './helpers.js';
import { makeWorld, setRemote, record, out, ADDRESS, BIG } from './pr-checkout-world.mjs';

const require = createRequire(import.meta.url);
const { Gate } = require('bareguard');
const { createShellTools } = require('bare-agent/tools');

const refs = (/** @type {string} */ repo, /** @type {string} */ pattern) => out(repo, ['for-each-ref', '--format=%(refname) %(objectname)', pattern]);
const NOTHING = 'Nothing spent.';

test('fetch ok: the worktree stands detached on the PR head, the private ref points there, and nothing else in the person\'s repo moved', async (t) => {
  const w = makeWorld(t);
  const branches = out(w.repo, ['branch', '--list']);
  const head = out(w.repo, ['rev-parse', 'HEAD']);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(/** @type {any} */ (r).checkout.sha, w.prSha);
  assert.equal(/** @type {any} */ (r).checkout.ownerRepo, 'octo/widgets');
  assert.equal(/** @type {any} */ (r).checkout.mergeBase, w.baseSha, 'the merge-base with the recorded base is read for the readout');
  assert.equal(out(w.wt, ['rev-parse', 'HEAD']), w.prSha);
  assert.equal(out(w.wt, ['rev-parse', '--abbrev-ref', 'HEAD']), 'HEAD', 'detached, no branch made');
  assert.equal(refs(w.repo, 'refs/bareloop'), `refs/bareloop/pr-1 ${w.prSha}`, 'the private ref keeps the object alive');
  assert.ok(existsSync(join(w.wt, 'src', 'only-on-pr.js')), 'the PR\'s code is in the run\'s tree');
  assert.ok(!existsSync(join(w.wt, 'src', 'gone-on-pr.js')));
  assert.equal(out(w.repo, ['branch', '--list']), branches, 'no new branch in the person\'s repo');
  assert.equal(out(w.repo, ['rev-parse', 'HEAD']), head, 'the person\'s own HEAD did not move');
  assert.equal(out(w.repo, ['tag', '--list']), '');
  assert.ok(!existsSync(join(w.repo, '.git', 'FETCH_HEAD')), '--no-write-fetch-head: the person\'s FETCH_HEAD is not written');
  assert.equal(out(w.wt, ['status', '--porcelain']), '', 'the worktree is clean at the PR head');
});

test('fork-shaped PR: the head is on no branch of the base repo, yet the base repo\'s pull ref serves it (the fork is never contacted)', async (t) => {
  const w = makeWorld(t);
  assert.equal(out(w.bare, ['branch', '--contains', w.prSha]), '', 'fixture check: no branch of the base repo holds the PR head');
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(out(w.wt, ['rev-parse', 'HEAD']), w.prSha);
  assert.equal(out(w.repo, ['branch', '--all', '--contains', w.prSha]), '', 'and no branch of the person\'s repo holds it either');
});

test('no hook of the person\'s ran, and the run did not try the remote\'s push address (the belt overrides it)', async (t) => {
  const w = makeWorld(t);
  const marker = join(w.root, 'HOOK-RAN');
  for (const h of ['post-checkout', 'reference-transaction', 'post-merge']) {
    writeFileSync(join(w.repo, '.git', 'hooks', h), `#!/bin/sh\ntouch ${marker}-${h}\n`, { mode: 0o755 });
  }
  gitInPatient(w.repo, ['config', 'remote.origin.pushurl', 'ssh://invalid.invalid/never.git']);
  /** @type {string[][]} */ const calls = [];
  const spy = (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => { calls.push(args); return spawnClose(cmd, args, o); };
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: spy });
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const h of ['post-checkout', 'reference-transaction', 'post-merge']) assert.ok(!existsSync(`${marker}-${h}`), `${h} must not run`);
  const fetch = calls.find((a) => a.includes('fetch'));
  assert.ok(fetch, 'a fetch ran');
  const text = fetch.join(' ');
  assert.match(text, /-c remote\.origin\.pushurl=no-push-by-bareloop/);
  assert.match(text, /fetch --no-tags --no-recurse-submodules --no-write-fetch-head origin \+refs\/pull\/1\/head:refs\/bareloop\/pr-1$/);
  assert.match(text, /core\.hooksPath=\/dev\/null\//);
  assert.equal(out(w.repo, ['config', '--get', 'remote.origin.pushurl']), 'ssh://invalid.invalid/never.git', 'the person\'s config is untouched');
  for (const a of calls) assert.ok(!a.includes('push'), `no git push: ${a.join(' ')}`);
});

test('sha mismatch: the PR moved after it was read; no re-read = the exact refusal and no private ref left', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.laterSha, w.baseSha) } });
  assert.deepEqual(r, { ok: false, error: `The pull request changed while the run was starting. Run it again. ${NOTHING}` });
  assert.equal(refs(w.repo, 'refs/bareloop'), '', 'the refusal leaves no private ref behind');
  assert.equal(out(w.wt, ['rev-parse', 'HEAD']), w.baseSha, 'and the worktree did not move');
});

test('sha mismatch with a re-read: ONE re-read of the record and ONE re-fetch; the new sha is accepted only if the fetch agrees', async (t) => {
  const w = makeWorld(t);
  let reads = 0;
  const ok = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.laterSha, w.baseSha), reread: async () => { reads += 1; return record(w.prSha, w.baseSha); } } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(reads, 1);
  assert.equal(out(w.wt, ['rev-parse', 'HEAD']), w.prSha);
  const w2 = makeWorld(t);
  const bad = await checkoutPrHead({ repo: w2.repo, worktree: w2.wt, pr: { url: ADDRESS, record: record(w2.laterSha, w2.baseSha), reread: async () => record(w2.baseSha, w2.baseSha) } });
  assert.deepEqual(bad, { ok: false, error: `The pull request changed while the run was starting. Run it again. ${NOTHING}` }, 'a re-read that still disagrees with the fetch is a refusal');
  assert.equal(refs(w2.repo, 'refs/bareloop'), '');
});

test('a record with no head sha (or a short one) has no code to fetch: the spec\'s words, git never called', async (t) => {
  const w = makeWorld(t);
  let calls = 0;
  const spy = (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => { calls += 1; return spawnClose(cmd, args, o); };
  const words = `Pull request #1 has no code to fetch (GitHub did not offer its head). ${NOTHING}`;
  for (const rec of [{ number: 1 }, { number: 1, head: {} }, { number: 1, head: { sha: 'abc123' } }, null]) {
    assert.deepEqual(await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: rec }, run: spy }), { ok: false, error: words });
  }
  assert.equal(calls, 0);
});

test('not a pull request address: the spec\'s words', async (t) => {
  const w = makeWorld(t);
  for (const url of ['https://github.com/octo/widgets/issues/1', 'https://example.com/octo/widgets/pull/1', 'nonsense', '']) {
    assert.deepEqual(await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url, record: record(w.prSha, w.baseSha) } }), { ok: false, error: 'This is not a GitHub pull request address.' });
  }
});

test('no remote points at owner/repo: the exact refusal (a remote on another repo or another host does not count)', async (t) => {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['remote', 'remove', 'origin']);
  setRemote(w.repo, 'other', 'https://github.com/someone/else.git', w.bare);
  setRemote(w.repo, 'lab', 'https://gitlab.com/octo/widgets.git', w.bare);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.deepEqual(r, { ok: false, error: `No remote in this repo points at octo/widgets, so the pull request's code cannot be fetched. ${NOTHING}` });
});

test('the remote may be named anything and written as ssh: matched by owner/repo, not by name', async (t) => {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['remote', 'remove', 'origin']);
  setRemote(w.repo, 'upstream', 'git@github.com:Octo/Widgets.git', w.bare);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(/** @type {any} */ (r).checkout.remote, 'upstream');
});

test('unreachable remote: git\'s own reason (first line) in the exact refusal, and no private ref', async (t) => {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['config', `url.${join(w.root, 'nowhere.git')}.insteadOf`, 'https://github.com/octo/widgets.git']);
  gitInPatient(w.repo, ['config', '--unset', `url.${w.bare}.insteadOf`]);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, false);
  assert.match(/** @type {any} */ (r).error, /^Git could not fetch pull request #1 \(.+\)\. Check your git login for this repo\. Nothing spent\.$/);
  assert.equal(refs(w.repo, 'refs/bareloop'), '');
});

test('a pull ref the remote does not have is the same refusal (a PR number the host never offered)', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: 'https://github.com/octo/widgets/pull/99', record: { head: { sha: w.prSha } } } });
  assert.equal(r.ok, false);
  assert.match(/** @type {any} */ (r).error, /^Git could not fetch pull request #99 \(.*couldn't find remote ref.*\)\. Check your git login for this repo\. Nothing spent\.$/);
});

test('ssh with the network off (GIT_SSH_COMMAND=false) is a refusal in seconds, never a prompt or a hang', async (t) => {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['remote', 'remove', 'origin']);
  gitInPatient(w.repo, ['remote', 'add', 'origin', 'git@github.com:octo/widgets.git']);
  const t0 = Date.now();
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, env: { ...process.env, GIT_SSH_COMMAND: 'false' } });
  assert.ok(Date.now() - t0 < 20_000, `took ${Date.now() - t0} ms`);
  assert.equal(r.ok, false);
  assert.match(/** @type {any} */ (r).error, /^Git could not fetch pull request #1 \(.+\)\. Check your git login for this repo\. Nothing spent\.$/);
});

test('the deadline: a fetch that outlives it is the "took longer" refusal naming the seconds', async (t) => {
  const w = makeWorld(t);
  const slow = async (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => (args.includes('fetch')
    ? { error: Object.assign(new Error('spawn git ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: '', stderr: '' }
    : spawnClose(cmd, args, o));
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: slow });
  assert.deepEqual(r, { ok: false, error: `Fetching pull request #1 took longer than 120 seconds. ${NOTHING}` });
  const r2 = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: slow, timeoutMs: 30_000 });
  assert.match(/** @type {any} */ (r2).error, /took longer than 30 seconds/);
});

test('a login in the remote\'s address is refused at $0 with the address masked, and git is never asked to fetch', async (t) => {
  const w = makeWorld(t);
  gitInPatient(w.repo, ['remote', 'remove', 'origin']);
  gitInPatient(w.repo, ['remote', 'add', 'origin', 'https://octo:hunter2-s3cret@github.com/octo/widgets.git']);
  /** @type {string[][]} */ const calls = [];
  const spy = (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => { calls.push(args); return spawnClose(cmd, args, o); };
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: spy });
  assert.equal(r.ok, false);
  const e = /** @type {any} */ (r).error;
  assert.match(e, /^The remote origin \(https:\/\/\*\*\*@github\.com\/octo\/widgets\.git\) has a login in its address/);
  assert.ok(e.endsWith(NOTHING));
  assert.ok(!e.includes('hunter2') && !e.includes('octo:'), 'neither the password nor the user is shown');
  assert.ok(!calls.some((a) => a.includes('fetch')), 'no fetch was made');
  // a token as the https user is a login too
  gitInPatient(w.repo, ['remote', 'remove', 'origin']);
  gitInPatient(w.repo, ['remote', 'add', 'origin', 'https://ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/octo/widgets.git']);
  const r2 = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: spy });
  assert.equal(r2.ok, false);
  assert.ok(!/ghp_/.test(/** @type {any} */ (r2).error));
});

test('git\'s stderr is masked before it is shown: a token and a login in an address never reach the words', async (t) => {
  const w = makeWorld(t);
  const noisy = async (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => (args.includes('fetch')
    ? { error: null, status: 128, signal: null, stdout: '', stderr: 'fatal: unable to access https://octo:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/octo/widgets.git/: denied\n' }
    : spawnClose(cmd, args, o));
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: noisy });
  assert.equal(r.ok, false);
  const e = /** @type {any} */ (r).error;
  assert.ok(!/ghp_|octo:/.test(e), e);
  assert.match(e, /denied/);
});

test('ref cleanup: removePrRef deletes the private ref, and deleting one that is not there is not an error', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true);
  assert.equal(prRefName(1), 'refs/bareloop/pr-1');
  assert.equal(removePrRef(w.repo, 1), true);
  assert.equal(refs(w.repo, 'refs/bareloop'), '');
  assert.equal(removePrRef(w.repo, 1), true, 'idempotent');
  assert.equal(removePrRef(w.repo, 7), true);
});

test('a Rerun against a force-pushed PR moves the private ref (the refspec is forced)', async (t) => {
  const w = makeWorld(t);
  const first = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(first.ok, true);
  // the base repo's pull/1 now points at a commit that is NOT a descendant of the old head
  gitInPatient(w.bare, ['update-ref', 'refs/pull/1/head', w.laterSha, w.prSha]);
  gitInPatient(w.bare, ['update-ref', 'refs/pull/1/head', w.baseSha, w.laterSha]);
  const second = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.baseSha, w.baseSha) } });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(refs(w.repo, 'refs/bareloop'), `refs/bareloop/pr-1 ${w.baseSha}`);
});

test('resume: the recorded PR head is an ancestor of the worktree HEAD, no fetch needed; a worktree that left it fails', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true);
  assert.equal(await prHeadIsAncestor(w.wt, w.prSha), true);
  // the work branch commits on top: still an ancestor
  gitInPatient(w.wt, ['checkout', '-q', '-b', 'work']);
  writeFileSync(join(w.wt, 'src', 'work.js'), 'export const w = 1;\n');
  gitInPatient(w.wt, ['add', 'src/work.js']);
  gitInPatient(w.wt, ['commit', '-q', '-m', 'work']);
  assert.equal(await prHeadIsAncestor(w.wt, w.prSha), true);
  // a branch that lost the PR's code is not
  gitInPatient(w.wt, ['checkout', '-q', '--detach', w.baseSha]);
  assert.equal(await prHeadIsAncestor(w.wt, w.prSha), false);
  assert.equal(await prHeadIsAncestor(w.wt, 'not-a-sha'), false);
});

test('source.json: seed, prHead, prNumber and prBase are recorded; every other field is kept', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true);
  const file = join(w.root, 'source.json');
  writeFileSync(file, JSON.stringify({ kind: 'repo', seed: w.baseSha, worktree: w.wt, repo: w.repo, files: [] }));
  recordPrOnManifest(w.root, /** @type {any} */ (r).checkout);
  const m = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(m.seed, w.prSha);
  assert.equal(m.prHead, w.prSha);
  assert.equal(m.prNumber, 1);
  assert.deepEqual(m.prBase, { ref: 'main', sha: w.baseSha });
  assert.equal(m.kind, 'repo');
  assert.equal(m.repo, w.repo);
  assert.deepEqual(m.files, []);
});

test('the tracked-at-seed guard follows the PR head, not the person\'s stale HEAD: a gutting write to a file that exists ONLY on the PR is refused', async (t) => {
  const w = makeWorld(t);
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) } });
  assert.equal(r.ok, true);
  const wd = realpathSync(w.wt);
  const seed = await seedAtHead(wd);
  assert.equal(seed.stop, null);
  assert.equal(/** @type {any} */ (seed).seedRef, w.prSha, 'the seed is the PR head');
  const listing = await seedListing(wd, /** @type {any} */ (seed).seedRef);
  assert.equal(listing.stop, null);
  const files = /** @type {any} */ (listing).files;
  assert.ok(files.includes('src/only-on-pr.js'), 'tracked at the seed: a file only the PR has');
  assert.ok(!files.includes('src/gone-on-pr.js'), 'a file the PR deleted is not tracked at the seed, so a worker may create it');
  const guard = await trackedAtSeedGuard(wd, files);
  const gate = new Gate({ fs: { writeScope: [wd], readScope: [wd], deny: [] }, limits: { maxTurns: 50 }, audit: { path: join(wd, GATE_AUDIT_FILE) }, humanChannel: async () => ({ decision: 'terminate' }) });
  await gate.init();
  const write = createShellTools(gatedShellOptions(gate, wd, guard)).tools.find((x) => x.name === 'shell_write');
  const target = join(wd, 'src', 'only-on-pr.js');
  await assert.rejects(() => write.execute({ path: target, content: 'export {};\n' }), /refusing: this would replace .*only-on-pr\.js/);
  assert.equal(readFileSync(target, 'utf8'), BIG, 'byte-identical after the refusal');
  // control: the stale HEAD's listing does not know the file, so the same write goes through (the instrument can see the harm)
  const stale = await seedListing(wd, w.baseSha);
  const staleGuard = await trackedAtSeedGuard(wd, /** @type {any} */ (stale).files);
  const staleWrite = createShellTools(gatedShellOptions(gate, wd, staleGuard)).tools.find((x) => x.name === 'shell_write');
  await staleWrite.execute({ path: target, content: 'export {};\n' });
  assert.equal(readFileSync(target, 'utf8'), 'export {};\n');
});

test('the env of every git child keeps HOME and SSH_AUTH_SOCK and drops the provider keys (checked on the argv-spawning seam, not only the helper)', async (t) => {
  const w = makeWorld(t);
  /** @type {any[]} */ const envs = [];
  const spy = (/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {any} */ o) => { envs.push(o.env); return spawnClose(cmd, args, o); };
  const base = { ...process.env, ANTHROPIC_API_KEY: 'k1', GITHUB_TOKEN: 'k2', NPM_TOKEN: 'k3', SSH_AUTH_SOCK: '/tmp/agent.sock', HOME: process.env.HOME, GIT_DIR: '/nowhere' };
  const r = await checkoutPrHead({ repo: w.repo, worktree: w.wt, pr: { url: ADDRESS, record: record(w.prSha, w.baseSha) }, run: spy, env: base });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(envs.length >= 4);
  for (const e of envs) {
    assert.equal(e.SSH_AUTH_SOCK, '/tmp/agent.sock');
    assert.equal(e.HOME, process.env.HOME);
    assert.equal(e.GIT_TERMINAL_PROMPT, '0');
    for (const k of ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'NPM_TOKEN', 'GIT_DIR']) assert.ok(!(k in e), `${k} must not reach git`);
  }
  assert.ok(patientGitEnv().GIT_AUTHOR_NAME, 'fixture identity is neutral');
});
