// The generic Result tab's test world (R7b item 4): REAL archived spines (tests/fixtures/result-tab, trimmed of worker rounds only) laid out the way a
// panel-authored run is, in a scratch dir with an injected scratch HOME. Never writes outside the scratch dir.
//   mvkj03w7  green, 2 steps, 3 attempt-diffs (the last cut), 7 passing close stages, spendComplete false (the mockup's run)
//   mvy0cx24  escalated: one close stage (no-suppressions) said no, one replan
//   mw1zse2m  green, a repo job on a ticket (job-start carries the ticket record), one close stage
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'result-tab');
export const RUNS = {
  mvkj03w7: { job: 'pulselog-panel-strict', at: '2026-10-23T05:25:04.000Z' },
  mvy0cx24: { job: 'pulselog-panel-strict-b', at: '2026-11-01T15:50:00.000Z' },
  mw1zse2m: { job: 'r2-ticket-repo', at: '2026-11-04T10:46:00.000Z' },
};

/** a neutralized git identity: CI has no global gitconfig */
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
export const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: GIT_ENV }).trim();

/**
 * @param {string[]} [ids] which runs to lay out (default all three)
 * @param {{ repoFor?: Record<string, boolean> }} [o] `repoFor[id]` = true: the run's source.json names `<root>/repo` as its repo (a worktree run); {@link makeRepoWithBranch} makes it
 */
export function makeResultWorld(ids = Object.keys(RUNS), o = {}) {
  const root = mkdtempSync(join(tmpdir(), 'result-tab-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  /** @type {Record<string, string>} */
  const spines = {};
  for (const id of ids) {
    const { job, at } = RUNS[/** @type {keyof typeof RUNS} */ (id)];
    const out = join(root, `session-${id}`);
    const into = join(out, 'source-seed');
    const dir = join(into, `${job}-bareloop`);
    mkdirSync(dir, { recursive: true });
    const repo = o.repoFor?.[id] ? join(root, 'repo') : undefined;
    writeFileSync(join(into, 'source.json'), JSON.stringify(repo ? { kind: 'repo', repo, worktree: join(repo, '.bareloop', 'wt', 's1') } : { kind: 'folder', source: '/x', destination: '/y' }));
    copyFileSync(join(FX, `${id}.resolved-spec.json`), join(out, 'resolved-spec.json'));
    copyFileSync(join(FX, `u-${id}.jsonl`), join(dir, `u-${id}.jsonl`));
    spines[id] = join(dir, `u-${id}.jsonl`);
    appendRun({ at, runid: id, job, spine: spines[id], patient: null, via: 'run-u' }, { home });
  }
  return { home, root, spine: (/** @type {string} */ id) => spines[id] };
}

/** a real repo holding the work branch a run named (and `main`), so the work box can see it; returns { repo, branch, final, base } */
export function makeRepoWithBranch(/** @type {string} */ root, /** @type {string} */ branch) {
  const repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', 'a.txt'); git(repo, 'commit', '-q', '-m', 'seed');
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', branch);
  writeFileSync(join(repo, 'a.txt'), 'b\n');
  git(repo, 'commit', '-q', '-am', 'the run');
  const final = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', 'main');
  return { repo, branch, final, base };
}
