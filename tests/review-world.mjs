// Shared scaffolding of the review-the-code run tests (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): a real git repo, a drafted review on the rubric road over the repo source, a scripted worker and the real runner (`main` of src/userrun.js).
// Nothing here is a model or a paid seam; the worker is a scripted provider. Every call to the runner uses a scratch HOME (`runlistHome`).
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSource } from '../src/source.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { rubricGoal } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';
import { main } from '../src/userrun.js';
import { scriptedProvider } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
/** remove every scratch dir this world made (call from the test file's `after`) */
export const cleanup = () => { for (const d of made) rmSync(d, { recursive: true, force: true }); };
export const tmp = (/** @type {string} */ p = 'review-w-') => { const d = mkdtempSync(path.join(tmpdir(), p)); made.push(d); return d; };
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
export const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: GIT_ENV });
export const SLOW = 'export function slow(list) {\n  return list.filter((x) => x.ok).map((x) => x.id).sort();\n}\n';
/** a real repo with src/slow.js, docs/keep.md and a package.json, one commit on main */
export function repo() {
  const dir = path.join(tmp(), 'repo');
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'docs'));
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}\n');
  writeFileSync(path.join(dir, 'src', 'slow.js'), SLOW);
  writeFileSync(path.join(dir, 'docs', 'keep.md'), 'keep\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const SPEC0 = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));
export const LINE = { n: 1, text: 'List the slow code in src/', rule: '', rules: [] };
export const GOOD_ANSWER = { results: [{ file: 'src/slow.js', quote: 'return list.filter((x) => x.ok)', why: 'it sorts on every call' }] };

/**
 * The whole run of a drafted review: prepared in a worktree of a real repo, drafted through `authorCloseForJob` with `source: 'repo'`, signed, run by the real runner with a scripted worker.
 * `before` = worker tool calls tried first (a write to a file, to see the fence refuse it); `answer` = the worker's answer file.
 * @param {{before?: {file: string, content: string}[], destination?: string, answer?: any}} [o]
 */
export async function runReview({ before = [], destination = 'docs/', answer = GOOD_ANSWER } = {}) {
  const dir = tmp('review-run-');
  const src = repo();
  const into = path.join(dir, 'source-seed');
  const prep = await prepareSource({ source: src, into, destination, worktree: path.join(src, '.bareloop', 'wt', 's1') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'repo' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List the slow code in src/' }, verdictType: 'soft-green', repoPath: prep.tree, lang: RUBRIC_LANG, source: 'repo',
    jobLines: [JSON.parse(JSON.stringify(LINE))], inputs: [{ n: 1, label: 'repo', value: src }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    lookFn: async () => survey, shapeFn: async () => ({ state: 'PRESENT', shapes: [], reason: null, cause: null, raws: [], calls: [] }),
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === 'row_edits' || t.name.includes('edit')).execute({ edits: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  /** @type {any} */
  const cd = { ...SPEC0.closeDecl, stages: r.closeDecl.stages, list: r.closeDecl.list, ...(r.closeDecl.refused ? { refused: r.closeDecl.refused } : {}), lang: RUBRIC_LANG, source: r.closeDecl.source };
  delete cd.picks;
  /** @type {any} */
  const spec = { ...SPEC0, job: 'review-job', jobLines: [LINE], inputs: [{ n: 1, label: 'repo', value: src }], provider: 'anthropic-api', writeScope: ['output/'], closeDecl: cd, goal: rubricGoal({ jobLines: [LINE], files: [], closeDecl: cd }) };
  delete spec.baseUrl; delete spec.model;
  const specPath = path.join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const stage = cd.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
  const provider = scriptedProvider([{ text: 'src/slow.js holds the code' }, { text: plan }, ...before.map((b, k) => ({ toolCalls: [{ id: `b${k}`, name: 'shell_write', arguments: { path: path.join(prep.tree, b.file), content: b.content } }] })), { toolCalls: [{ id: 't1', name: 'shell_write', arguments: { path: path.join(prep.tree, 'output', 'steps', '1.json'), content: JSON.stringify(answer) } }] }, { text: 'wrote' }]);
  const home = tmp('review-run-home-');
  /** @type {string[]} */ const outl = []; /** @type {string[]} */ const errl = [];
  const rc = await main(['--spec', specPath, '--approve', jobSpecHash(spec)], { provider, env: {}, out: (/** @type {any} */ s) => outl.push(String(s)), err: (/** @type {any} */ s) => errl.push(String(s)), runlistHome: home });
  const text = `${errl.join('\n')}\n${outl.join('\n')}`;
  return { rc, text, src, prep, spec, home, dir, branch: /final commit \w+ on (\S+?);/.exec(text)?.[1] ?? null };
}
