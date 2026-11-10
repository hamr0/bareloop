// Piece 12, the parts that need no git: the head-sha accessor, the address and remote readers, the subcommand allowlist, the words, and the "never pushes" grep over src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PR_GIT_SUBCOMMANDS, PR_FETCH_DEADLINE_MS, prHeadSha, prBaseOf, parsePrAddress, remotesOfConfig, remoteNames, matchRemote,
  urlCarriesLogin, maskUrl, prGitArgs, prGitEnv, fetchRest, firstReason,
} from '../src/prcheckout.js';

const SHA = 'a'.repeat(40);

test('prHeadSha is the ONE accessor: head.sha of the frozen record, a full 40-hex sha or null', () => {
  assert.equal(prHeadSha({ head: { sha: SHA } }), SHA);
  for (const bad of [null, undefined, {}, { head: null }, { head: { sha: 'abc' } }, { head: { sha: SHA.toUpperCase() } }, { head: { sha: 123 } }, { sha: SHA }, { headRefOid: SHA }]) assert.equal(prHeadSha(bad), null, JSON.stringify(bad));
  assert.deepEqual(prBaseOf({ base: { ref: 'main', sha: SHA } }), { ref: 'main', sha: SHA });
  assert.equal(prBaseOf({ base: { sha: 'x' } }), null);
});

test('no other file in src/ reads a PR head sha by its own spelling: the accessor is the only reader of `head.sha`', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const hits = srcFiles(join(here, '..', 'src')).filter((f) => /\.head\??\.sha\b|headRefOid/.test(readFileSync(f, 'utf8')) && !f.endsWith('prcheckout.js'));
  assert.deepEqual(hits, []);
});

test('parsePrAddress: only https://github.com/<owner>/<repo>/pull/<n>', () => {
  assert.deepEqual(parsePrAddress('https://github.com/octo/widgets/pull/12'), { ok: true, owner: 'octo', repo: 'widgets', number: 12 });
  assert.deepEqual(parsePrAddress('https://github.com/octo/widgets/pull/12/'), { ok: true, owner: 'octo', repo: 'widgets', number: 12 });
  for (const bad of ['https://github.com/octo/widgets/issues/12', 'https://github.com/octo/widgets/pull/0', 'https://github.com/octo/widgets/pull/x', 'http://github.com/octo/widgets/pull/1', 'https://github.com/octo/widgets/pull/1/files', null, 5]) {
    assert.deepEqual(parsePrAddress(bad), { ok: false, error: 'This is not a GitHub pull request address.' }, String(bad));
  }
});

test('remotesOfConfig reads remote sections as written; url/insteadOf/submodule sections are not remotes', () => {
  const cfg = '[core]\n\turl = nope\n[remote "origin"]\n\turl = https://github.com/octo/widgets.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[remote "up"]\n\turl = git@github.com:a/b.git\n[url "file:///x"]\n\tinsteadOf = https://github.com/octo/widgets.git\n[submodule "s"]\n\turl = https://github.com/evil/s.git\n';
  assert.deepEqual(remotesOfConfig(cfg), [{ name: 'origin', url: 'https://github.com/octo/widgets.git' }, { name: 'up', url: 'git@github.com:a/b.git' }]);
});

test('remoteNames: https, ssh://, scp-like, .git optional, case-blind; another host, owner or repo does not match', () => {
  for (const u of ['https://github.com/octo/widgets.git', 'https://github.com/octo/widgets', 'git@github.com:octo/widgets.git', 'ssh://git@github.com/octo/widgets.git', 'https://github.com/Octo/Widgets/']) assert.equal(remoteNames(u, 'octo', 'widgets'), true, u);
  for (const u of ['https://gitlab.com/octo/widgets.git', 'https://github.com/octo/widgets-extra.git', 'https://github.com/other/widgets.git', 'https://evil.com/github.com/octo/widgets.git', 'https://github.com.evil.com/octo/widgets.git', 'file:///tmp/octo/widgets.git', '/tmp/github.com/octo/widgets.git']) assert.equal(remoteNames(u, 'octo', 'widgets'), false, u);
});

test('matchRemote prefers origin, else the first match, else null', () => {
  const rs = [{ name: 'fork', url: 'https://github.com/octo/widgets.git' }, { name: 'origin', url: 'https://github.com/octo/widgets.git' }, { name: 'x', url: 'https://github.com/a/b.git' }];
  assert.equal(matchRemote(rs, 'octo', 'widgets')?.name, 'origin');
  assert.equal(matchRemote(rs.slice(0, 1), 'octo', 'widgets')?.name, 'fork');
  assert.equal(matchRemote(rs, 'no', 'one'), null);
});

test('urlCarriesLogin / maskUrl: a password or an https user is a login; a bare ssh user is not; the mask never shows it', () => {
  for (const u of ['https://u:p@github.com/o/r.git', 'https://tok@github.com/o/r.git', 'ssh://u:p@github.com/o/r.git']) { assert.equal(urlCarriesLogin(u), true, u); assert.ok(!/u:p|tok/.test(maskUrl(u)), maskUrl(u)); }
  for (const u of ['https://github.com/o/r.git', 'ssh://git@github.com/o/r.git', 'git@github.com:o/r.git']) assert.equal(urlCarriesLogin(u), false, u);
  assert.equal(maskUrl('https://u:p@github.com/o/r.git'), 'https://***@github.com/o/r.git');
});

test('the subcommand allowlist: only fetch|rev-parse|checkout|merge-base|update-ref|worktree; anything else throws before a process exists', () => {
  assert.deepEqual([...PR_GIT_SUBCOMMANDS], ['fetch', 'rev-parse', 'checkout', 'merge-base', 'update-ref', 'worktree']);
  for (const sub of PR_GIT_SUBCOMMANDS) assert.equal(prGitArgs(sub, ['x']).includes(sub), true);
  for (const bad of ['push', 'remote', 'config', 'add', 'commit', 'reset', 'clone', 'pull', 'merge', 'tag', 'branch', '', 'fetch --all', 'FETCH']) assert.throws(() => prGitArgs(bad, []), /not one of the git calls/, bad);
  assert.deepEqual(prGitArgs('fetch', ['a'], ['k=v']).slice(0, 4), ['-c', 'core.hooksPath=/dev/null/bareloop-no-hooks', '-c', 'k=v']);
});

test('the fetch argv is the spec\'s, with a forced private ref; --no-write-fetch-head can be dropped for an old git', () => {
  assert.deepEqual(fetchRest('origin', 7), ['--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', 'origin', '+refs/pull/7/head:refs/bareloop/pr-7']);
  assert.ok(!fetchRest('origin', 7, { writeFetchHead: true }).includes('--no-write-fetch-head'));
  assert.equal(PR_FETCH_DEADLINE_MS, 120_000);
});

test('prGitEnv strips what CLOSE_ENV_DENY names, KEEPS HOME / PATH / SSH_AUTH_SOCK, turns prompts off', () => {
  const e = prGitEnv({ HOME: '/h', PATH: '/bin', SSH_AUTH_SOCK: '/s', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', GITHUB_TOKEN: 'g', MY_DEPLOY_TOKEN: 't', AWS_REGION: 'r', GIT_DIR: '/d', GIT_WORK_TREE: '/w', GIT_INDEX_FILE: '/i' });
  assert.deepEqual({ HOME: e.HOME, PATH: e.PATH, SSH_AUTH_SOCK: e.SSH_AUTH_SOCK, T: e.GIT_TERMINAL_PROMPT, A: e.SSH_ASKPASS_REQUIRE }, { HOME: '/h', PATH: '/bin', SSH_AUTH_SOCK: '/s', T: '0', A: 'never' });
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GITHUB_TOKEN', 'MY_DEPLOY_TOKEN', 'AWS_REGION', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) assert.ok(!(k in e), k);
});

test('firstReason: the first line only, secret shapes and logins in addresses masked', () => {
  assert.equal(firstReason('\nfatal: bad\nsecond line\n'), 'fatal: bad');
  assert.equal(firstReason(''), 'no reason given');
  assert.ok(!/ghp_/.test(firstReason('fatal: https://u:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/o/r.git')));
  assert.ok(!/u:/.test(firstReason('fatal: https://u:pw@github.com/o/r.git')));
});

test('the run never pushes: no git call anywhere in src/ names push, and nothing there spells a remote write', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const bad = [];
  for (const f of srcFiles(join(here, '..', 'src'))) {
    const text = readFileSync(f, 'utf8');
    // an argv word 'push' (any quote), or a shell-ish "git push" in a string
    if (/['"`]push['"`]/.test(text) || /\bgit\s+push\b/.test(text)) bad.push(f);
    if (/['"`]remote['"`]\s*,\s*['"`](add|set-url|remove|rename)['"`]/.test(text)) bad.push(`${f} (remote write)`);
  }
  assert.deepEqual(bad.map((f) => f.replace(/.*\/src\//, 'src/')), []);
});

/** @param {string} dir @returns {string[]} every .js under dir */
function srcFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? srcFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}
