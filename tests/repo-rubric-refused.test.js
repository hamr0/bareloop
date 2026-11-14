// hamr 2026-11-14 (rubric vs deterministic split, piece 4): Deterministic means anything a machine can check, including PR and ticket jobs that lint or
// test; a repo job is Deterministic. Rubric on a repo is allowed ONLY for a Tickets job. A repo + rubric start is refused at $0, in plain words from code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateJobCard } from '../src/panel/authorsession.js';
import { REPO_RUBRIC_WORDS } from '../src/jobblock.js';
import { ANTH_CFG } from './helpers.js';
import { keyRows } from '../src/providerrows.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'rr', GIT_AUTHOR_EMAIL: 'rr@test', GIT_COMMITTER_NAME: 'rr', GIT_COMMITTER_EMAIL: 'rr@test' } });
function makeRepo() {
  const dir = tmp('repo-rubric-');
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'mod.js'), '// nothing yet\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const rows = keyRows({ filled: ['ANTHROPIC_API_KEY'], config: ANTH_CFG });
const card = (over) => ({ checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'repo-rubric-job', jobText: 'Summarise the changes', destination: 'src/', capUsd: 1, ...over });

test('a rubric card whose Inputs line 1 is a repo is refused at $0 in the exact words; the same card as Deterministic is fine', () => {
  const repo = makeRepo();
  const r = validateJobCard(card({ inputs: `repo: ${repo}` }), { rows });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'A repo job uses a Deterministic check.');
  assert.equal(REPO_RUBRIC_WORDS, 'A repo job uses a Deterministic check.');
  assert.equal(validateJobCard(card({ checkType: 'deterministic', inputs: `repo: ${repo}` }), { rows }).ok, true);
});

test('the CLI interview refuses a soft-green (rubric) class on a repo the same way, before any question is asked', () => {
  const repo = makeRepo();
  const out = join(tmp('repo-rubric-out-'), 'o');
  const r = spawnSync(process.execPath, [join(HERE, '..', 'scripts', 'run-interview.mjs'), '--verdict', 'soft-green', '--out', out, '--budget', '2.50', '--provider', 'anthropic-api', '--model', 'claude-sonnet-5'], {
    encoding: 'utf8', timeout: 60_000, input: `repo: ${repo}\n\n`, env: { ...process.env, HOME: tmp('repo-rubric-home-'), ANTHROPIC_API_KEY: '' },
  });
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /A repo job uses a Deterministic check\./);
  assert.equal(existsSync(join(out, 'answers.json')), false, 'nothing was written');
});
