// Part 2 (review by git range or branch) at the RUN seam: the real runner (`main` of src/userrun.js) over a real repo with history (tests/range-world.mjs), prepared through the real source door in a worktree,
// a review drafted through `authorCloseForJob` (source 'repo') whose step line carries the typed token, a scripted worker. Nothing here is a model or a paid seam; every runner call uses a scratch HOME.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSource } from '../src/source.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { rubricGoal } from '../src/rubricstep.js';
import { jobSpecHash } from '../src/job.js';
import { hashCloseScriptBytes } from '../src/close-integrity.js';
import { main } from '../src/userrun.js';
import { scriptedProvider, gitInPatient } from './helpers.js';
import { makeRangeWorld } from './range-world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
export const cleanup = () => { for (const d of made) rmSync(d, { recursive: true, force: true }); };
export const tmp = (/** @type {string} */ p) => { const d = mkdtempSync(path.join(tmpdir(), p)); made.push(d); return d; };
const SPEC0 = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'part5', 'mve5y8fa.resolved-spec.json'), 'utf8'));

/** a worker's answer quoting a line that exists ONLY at the end of the range (src/a.js at c1/feat: `export const a = 2;`; main has `a = 1`) */
export const ANSWER_AT_END = { results: [{ file: 'src/a.js', quote: 'export const a = 2;', why: 'the range changed a to 2' }] };

/**
 * The world: the range repo (tag v0 = c0, v1 = c1, branch feat = c2, HEAD on main = c0), prepared in a worktree; a signed review spec whose step line is `lineText`.
 * @param {import('node:test').TestContext} _t
 * @param {{lineText: string}} o
 */
export async function rangeSession(_t, { lineText }) {
  const w = makeRangeWorld(/** @type {import('node:test').TestContext} */ (_t));
  gitInPatient(w.repo, ['worktree', 'remove', '--force', w.wt]);
  gitInPatient(w.repo, ['tag', 'v0', w.c0]);
  const dir = tmp('range-run-');
  const into = path.join(dir, 'source-seed');
  const prep = await prepareSource({ source: w.repo, into, destination: 'docs/', worktree: path.join(w.repo, '.bareloop', 'wt', 's1') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  const line = { n: 1, text: lineText, rule: '', rules: [] };
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'repo' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: `1. ${lineText}` }, verdictType: 'soft-green', repoPath: prep.tree, lang: RUBRIC_LANG, source: 'repo',
    jobLines: [JSON.parse(JSON.stringify(line))], inputs: [{ n: 1, label: 'repo', value: w.repo }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    lookFn: async () => survey, shapeFn: async () => ({ state: 'PRESENT', shapes: [], reason: null, cause: null, raws: [], calls: [] }),
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((x) => x.name === 'row_edits' || x.name.includes('edit')).execute({ edits: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal));
  /** @type {any} */
  const cd = { ...SPEC0.closeDecl, stages: r.closeDecl.stages, list: r.closeDecl.list, ...(r.closeDecl.refused ? { refused: r.closeDecl.refused } : {}), lang: RUBRIC_LANG, source: r.closeDecl.source };
  delete cd.picks;
  /** @type {any} */
  const spec = { ...SPEC0, job: 'range-job', jobLines: [line], inputs: [{ n: 1, label: 'repo', value: w.repo }], provider: 'anthropic-api', writeScope: ['output/'], closeDecl: cd, goal: rubricGoal({ jobLines: [line], files: [], closeDecl: cd }) };
  delete spec.baseUrl; delete spec.model;
  const specPath = path.join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const stage = cd.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  const plan = JSON.stringify({ schema: 'plan-v1', steps: [{ id: 'line-1', action: 'Write output/steps/1.json', tools: ['write', 'read', 'recall', 'get'], rounds: 6, target: 'output/steps/1.json', exit: [{ type: 'tree-changed', scope: 'output/**' }, { type: 'check-passes', name: stage.name }] }] });
  return { ...w, dir, into, prep, spec, specPath, plan, stage };
}

/** run the real runner on a session; `script` = the scripted worker's replies AFTER the scout and the plan; `argv` extra flags */
export async function runIt(/** @type {any} */ f, { script, argv = [], provider = null, home = null }) {
  const p = provider ?? scriptedProvider([{ text: 'scout notes' }, { text: f.plan }, ...script]);
  const h = home ?? tmp('range-run-home-');
  /** @type {string[]} */ const outl = []; /** @type {string[]} */ const errl = [];
  const rc = await main(['--spec', f.specPath, '--approve', jobSpecHash(f.spec), ...argv], { provider: p, env: {}, out: (/** @type {any} */ s) => outl.push(String(s)), err: (/** @type {any} */ s) => errl.push(String(s)), runlistHome: h });
  const out = outl.join('\n'); const err = errl.join('\n');
  const spinePath = /^spine\s+(\S+)/m.exec(out)?.[1] ?? null;
  const spine = spinePath === null ? [] : readFileSync(spinePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { rc, out, err, spine, text: `${err}\n${out}`, provider: p, home: h, branch: /final commit \w+ on (\S+?);/.exec(out)?.[1] ?? null };
}

/** green only on code that has `src/new file.js` (added by feat's first commit; main does not have it): the close judges the TREE the run starts with */
const CLOSE_SOURCE = `import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('FIXTURE judged=1');
process.exit(existsSync(join(process.cwd(), 'src', 'new file.js')) ? 0 : 1);
`;

/** a CHANGE job (green, a command close) over the same repo, whose step line is `lineText` (a `branch:` here starts the work branch at that tip) @param {import('node:test').TestContext} _t @param {{lineText: string}} o */
export async function changeSession(_t, { lineText }) {
  const w = makeRangeWorld(_t);
  gitInPatient(w.repo, ['worktree', 'remove', '--force', w.wt]);
  const dir = tmp('range-change-');
  const closeScript = path.join(dir, 'close.mjs');
  writeFileSync(closeScript, CLOSE_SOURCE);
  const spec = {
    schema: 'job-v1', job: 'change-job', description: 'Part 2 fixture: the close is green on code that has src/new file.js.', provider: 'anthropic-api',
    cadence: { unit: 'day', every: 1 }, budgetUsd: 2, maxWallMs: 1_800_000, writeScope: ['src/**'], goal: 'Make src/new file.js exist.', verdictType: 'green',
    jobLines: [{ n: 1, text: lineText, rule: '', rules: [] }],
    close: [{ name: 'has-new-file', cmd: `node ${closeScript} has-new-file`, expect: 0, sha256: hashCloseScriptBytes(CLOSE_SOURCE) }],
    tools: ['read', 'grep', 'write', 'edit', 'recall', 'get'], escalation: { mode: 'decision-ready' },
  };
  const specPath = path.join(dir, 'resolved-spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const into = path.join(dir, 'source-seed');
  const prep = await prepareSource({ source: w.repo, into, destination: 'src/', worktree: path.join(w.repo, '.bareloop', 'wt', 's1') });
  assert.equal(prep.stop, null, JSON.stringify(prep));
  return { ...w, dir, into, prep, spec, specPath, plan: '' };
}
