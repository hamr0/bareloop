// REVIEW THE CODE, clean build item 3 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): reading inputs. `readFrozenInputs`, the rubric-step runner (src/kinds.js) and the draft read the SIGNED source: `repo` reads the repo (the tracked paths
// for the drafting looks; for the cite, the whole of ONLY the files the items name, from the run's tree, 5 MB cap), `files` reads the frozen input record. The ENOENT / no-inputs sniffing is gone: a repo stage whose source was
// not given is an INSTRUMENT STOP, never a guess. The source reaches every place a close runs (runStage, runDeclaredClose, runDeclaredStages, seedRead). $0: a real git repo, the real runner, gates and bareguard.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { namedFilesText, itemPath, repoListingText, trackedFiles, CITE_CAP_BYTES } from '../src/repocite.js';
import { REPO_LABEL } from '../src/sourcedefaults.js';
import { CheckBlock } from '../src/checkblock.js';
import { buildShapes } from '../src/shapebuild.js';
import { defaultsOf } from '../src/sourcedefaults.js';
import { readFrozenInputs, citedLabels, gradeStep, sha256Of } from '../src/rubricstep.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { runStage, runDeclaredClose, seedRead } from '../src/kinds.js';
import { runDeclaredStages } from '../src/declaredclose.js';

/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'review-read-') => { const d = mkdtempSync(path.join(tmpdir(), p)); made.push(d); return d; };
const git = (/** @type {string} */ dir, /** @type {string[]} */ args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { stdio: 'ignore' });
const SLOW = 'export function slow(list) {\n  return list.filter((x) => x.ok).map((x) => x.id).sort();\n}\n';
const OTHER = 'export const other = () => "elsewhere";\n';
/** a real repo: the tree is `<root>/tree` so that no `source.json` sits beside it (a repo worktree has none) */
function repo() {
  const root = tmp();
  const dir = path.join(root, 'tree');
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'docs'));
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}\n');
  writeFileSync(path.join(dir, 'src', 'slow.js'), SLOW);
  writeFileSync(path.join(dir, 'src', 'other.js'), OTHER);
  writeFileSync(path.join(dir, 'docs', 'notes.md'), 'notes\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}
const LINE = { n: 1, text: 'List the slow code in src/', rule: 'at least 3 items', rules: ['at least 3 items'] };
const PLAIN = { n: 1, text: 'List the slow code in src/' };
const item = (/** @type {string} */ file, /** @type {string} */ quote) => ({ file, quote, why: 'it sorts a list on every call' });
const answer = (/** @type {any[]} */ items) => JSON.stringify({ results: items });
const three = (/** @type {string} */ q) => [item('src/slow.js', q), item('src/slow.js', q), item('src/slow.js', q)];

test('repocite: the cite text is the whole of ONLY the files the items name; a path is read as the repo lists it (./ and :line dropped), never guessed', () => {
  const dir = repo();
  assert.equal(itemPath('./src/slow.js:12-14'), 'src/slow.js');
  assert.equal(itemPath('  src/slow.js '), 'src/slow.js');
  assert.equal(REPO_LABEL, 'repo');
  assert.deepEqual(trackedFiles(dir).sort(), ['docs/notes.md', 'package.json', 'src/other.js', 'src/slow.js']);
  assert.equal(repoListingText(dir), trackedFiles(dir).join('\n'));
  const one = namedFilesText(dir, [{ file: 'src/slow.js:2' }, { file: './src/slow.js' }]);
  assert.deepEqual([one.text, one.reds, one.files], [SLOW, [], ['src/slow.js']], 'one file, read whole, once');
  assert.equal(one.text.includes('elsewhere'), false, 'a file no item names is never read');
  const reds = namedFilesText(dir, [{ file: 'src/slow.js' }, { file: 'src/nothere.js' }, { file: '' }, { nofile: 1 }, 'x']);
  assert.equal(reds.reds.length, 4);
  assert.match(reds.reds[0], /^item 2: "file" names no file of the repo \("src\/nothere\.js"\); write the path of one tracked file as the repo lists it/);
  assert.match(reds.reds[1], /^item 3: .*\(it is empty\)/);
  assert.equal(reds.text, SLOW, 'the good item still reads');
});

test('repocite: a link or an over-cap text is a plain-words red, never a throw and never a silent skip', () => {
  const dir = repo();
  symlinkSync('/etc/hostname', path.join(dir, 'src', 'link.js'));
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'link']);
  const l = namedFilesText(dir, [{ file: 'src/link.js' }]);
  assert.match(l.reds[0], /^"src\/link\.js" is not a regular file/);
  assert.equal(l.text, '');
  writeFileSync(path.join(dir, 'src', 'big.js'), 'x'.repeat(CITE_CAP_BYTES + 10));
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'big']);
  const b = namedFilesText(dir, [{ file: 'src/big.js' }]);
  assert.match(b.reds[0], /^the files the items name are 5\.0 MB together, over the 5 MB the quote check can read; name fewer or smaller files$/);
  assert.equal(b.text, '');
});

/** the check block of a repo-source job, as the drafter makes it, and its first stage's params */
function partOf() {
  const b = new CheckBlock({ texts: { repo: 'src/slow.js' }, labels: ['repo'], asks: false, split: true, source: 'repo' });
  b.fromJob([PLAIN]); b.setGuards([], ['output/']); b.reconcile();
  b.setShape(buildShapes({ lines: [PLAIN], labels: ['repo'], suggestions: [], defaultFields: defaultsOf('repo').fields })); b.reconcile();
  return b.build().stages[0].params;
}

test('the cite is checked in the real bareguard `cited` check against ONLY the files the items name: a real quote is green; a made-up quote reds naming the item; a real quote of a file the item does NOT name reds', async () => {
  const dir = repo();
  const p = partOf();
  assert.deepEqual(citedLabels(p), ['repo']);
  const run = async (/** @type {any[]} */ items) => {
    const nf = namedFilesText(dir, items);
    return gradeStep({ params: p, bytes: answer(items), outputBytes: answer(items), inputs: { repo: nf.text }, extraReds: nf.reds }, { repo: sha256Of(Buffer.from(nf.text, 'utf8')) });
  };
  assert.equal((await run(three('return list.filter((x) => x.ok)'))).verdict, 'green');
  const made1 = await run([...three('return list.filter((x) => x.ok)').slice(0, 2), item('src/slow.js', 'this line is not in the file')]);
  assert.equal(made1.verdict, 'red');
  assert.deepEqual(made1.gapLines, ['line 1: item 3: its quote is not found word for word in the files the items name - copy the quote exactly from the file the item names']);
  assert.equal((await run([item('src/other.js', 'return list.filter((x) => x.ok)')])).verdict, 'red', 'a quote in a file the item does not name is not found');
  const nofile = await run([item('src/nothere.js', 'return list.filter((x) => x.ok)')]);
  assert.equal(nofile.verdict, 'red');
  assert.ok(nofile.gapLines.some((l) => /item 1: "file" names no file of the repo/.test(l)), nofile.gapLines.join('|'));
});

/** the rubric-step stage as the runner runs it, in a repo worktree with no source record beside it */
async function run(/** @type {string} */ dir, /** @type {any[]|null} */ items, /** @type {any} */ ctxExtra = { source: 'repo' }) {
  if (items !== null) {
    mkdirSync(path.join(dir, 'output', 'steps'), { recursive: true });
    writeFileSync(path.join(dir, 'output', 'steps', '1.json'), answer(items));
  }
  const stage = { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: partOf() };
  return runStage(stage, { workdir: dir, seedRef: 'HEAD', gapKeep: 'close: ', gapCap: 20, list: null, ...ctxExtra });
}

test('the runner reads the SIGNED source: repo = green on a real quote, red (not a stop) on a made-up one, a file no item can be read from is a plain-words red, a missing answer file is the usual red', async () => {
  const dir = repo();
  const ok = await run(dir, three('return list.filter((x) => x.ok)'));
  assert.equal(ok.verdict, 'green', JSON.stringify(ok.gapLines));
  const bad = await run(dir, [...three('return list.filter((x) => x.ok)').slice(0, 2), item('src/other.js', 'not in that file at all')]);
  assert.equal(bad.verdict, 'red', JSON.stringify(bad.gapLines));
  assert.ok(bad.gapLines.some((l) => /item 3: its quote is not found word for word/.test(l)), bad.gapLines.join('|'));
  const none = await run(dir, [item('src/nope.js', 'x')]);
  assert.equal(none.verdict, 'red');
  assert.ok(none.gapLines.some((l) => /"file" names no file of the repo/.test(l)));
  const dir2 = repo();
  assert.equal((await run(dir2, null)).verdict, 'red', 'no answer file: the red the `happened` check always gave, not a stop');
});

test('NO sniffing: a repo stage whose source was not given (no signed source, no record beside the tree) is an INSTRUMENT STOP naming the record, never a guess; files is the same stop', async () => {
  const dir = repo();
  for (const ctx of [{}, { source: 'files' }]) {
    const r = await run(dir, three('return list.filter((x) => x.ok)'), ctx);
    assert.equal(r.verdict, 'instrument-stop', JSON.stringify(ctx));
    assert.match(JSON.stringify(r.gapLines ?? r.detail ?? r), /source record|source\.json/);
  }
});

test('the signed source reaches every place a close runs: runDeclaredClose, runDeclaredStages and seedRead each hand it to the stage', async () => {
  const dir = repo();
  mkdirSync(path.join(dir, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(dir, 'output', 'steps', '1.json'), answer(three('return list.filter((x) => x.ok)')));
  const stage = { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: partOf() };
  const ctx = { workdir: dir, seedRef: 'HEAD', gapKeep: 'close: ', gapCap: 20, list: null };
  const closed = await runDeclaredClose({ stages: [stage], source: 'repo' }, ctx);
  assert.equal(closed.verdict, 'green', JSON.stringify(closed.stages.map((s) => s.gapLines)));
  const unsigned = await runDeclaredClose({ stages: [stage] }, ctx);
  assert.equal(unsigned.verdict, 'instrument-stop', 'the same close with no signed source stops');
  const stages = await runDeclaredStages([stage], (s) => s, { cwd: dir, seedRef: 'HEAD', source: 'repo' });
  assert.equal(stages.verdict, 'satisfied', JSON.stringify(stages));
  assert.notEqual((await runDeclaredStages([stage], (s) => s, { cwd: dir, seedRef: 'HEAD' })).verdict, 'satisfied');
  const rows = await seedRead({ stages: [stage], source: 'repo' }, ctx);
  assert.equal(rows[0].verdict, 'green');
  assert.equal((await seedRead({ stages: [stage] }, ctx))[0].verdict, 'instrument-stop');
});

test('readFrozenInputs reads the repo for the signed source repo (the tracked paths, for every asked label); files still reads the record and refuses a missing one', async () => {
  const dir = repo();
  const r = await readFrozenInputs(dir, ['repo', 'notes'], 'repo');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok ? r.texts : null, { repo: repoListingText(dir), notes: repoListingText(dir) });
  const files = await readFrozenInputs(dir, ['repo']);
  assert.equal(files.ok, false, 'files with no source record is a refusal, not a guess');
  assert.match(files.ok ? '' : files.why, /^the source record could not be read/);
  const bare = tmp();
  mkdirSync(path.join(bare, 'tree'));
  const nogit = await readFrozenInputs(path.join(bare, 'tree'), ['repo'], 'repo');
  assert.equal(nogit.ok, false);
  assert.match(nogit.ok ? '' : nogit.why, /^the repo's files could not be listed/);
});

test('DRAFT, end to end: a repo-source review drafted through authorCloseForJob SIGNS (the gates accept the shape part with its cite), is signed `source: repo`, and carries Part A as `[default]` rows', async () => {
  const dir = repo();
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'repo' }], look: { facts: [], prose: [], notFound: [], dropped: [] } } };
  const r = await authorCloseForJob({
    answers: { 1: '1. List the slow code in src/\n   ~ at least 3 items' }, verdictType: 'soft-green', repoPath: dir, lang: RUBRIC_LANG, source: 'repo',
    jobLines: [JSON.parse(JSON.stringify(LINE))], inputs: [{ n: 1, label: 'repo', value: dir }], writeScope: ['output/'], provider: { fake: true }, ceilingUsd: 1,
    lookFn: async () => survey,
    shapeFn: async () => ({ state: 'PRESENT', shapes: [], reason: null, cause: null, raws: [], calls: [] }),
    generate: async () => { throw new Error('no drafting-model call'); },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === 'row_edits' || t.name.includes('edit')).execute({ edits: [] }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } }; },
  });
  assert.equal(r.ok, true, JSON.stringify(r.reds ?? r.refusal ?? r.authoring?.iterations?.map((/** @type {any} */ i) => i.validation)));
  assert.equal(r.closeDecl.source, 'repo');
  const stage = r.closeDecl.stages.find((/** @type {any} */ s) => s.kind === 'rubric-step');
  assert.deepEqual(stage.params.parts.map((/** @type {any} */ p) => p.class), ['shape']);
  assert.equal(stage.params.parts[0].cite, 'repo');
  assert.deepEqual(stage.params.parts[0].fields.map((/** @type {any} */ f) => f.name), ['file', 'quote', 'why']);
  assert.deepEqual(r.closeDecl.list.filter((/** @type {any} */ x) => x.by === 'default' && ['shape', 'cited'].includes(x.kind)).map((/** @type {any} */ x) => x.key), ['L1.$cited', 'L1.shape.file', 'L1.shape.quote', 'L1.shape.why']);
});
