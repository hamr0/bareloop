// REVIEW THE CODE, clean build item 1 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the ONE signed field, `closeDecl.source` ('files' | 'repo'). Validated (only those two, only on the text close), written by the
// crossroads' caller (authorCloseForJob stamps it from the `source` it is given), and absent on a files job so a file job's signed hash does not move. $0: every model seam throws if reached.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCloseDecl, CLOSE_DECL_FIELDS } from '../src/declaredclose.js';
import { authorCloseForJob } from '../src/authorjob.js';
import { proveRubricInputs } from '../src/source.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { SOURCES, sourceOf } from '../src/sourcedefaults.js';

/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'review-source-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

const decl = (/** @type {string} */ lang, /** @type {any} */ extra = {}) => ({
  genre: lang === 'text' ? 'TEXT' : 'TYPES', lang,
  stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }],
  refused: [{ line: 1, reason: 'nothing in this fixture can check it' }],
  ...extra,
});
const check = (/** @type {any} */ d) => validateCloseDecl(d, { listing: ['input/a.txt', 'output/.gitkeep'], verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1 }] });

test('closeDecl.source is a signed field: only "files" or "repo", and only on the text close', () => {
  assert.ok(CLOSE_DECL_FIELDS.includes('source'));
  assert.deepEqual([...SOURCES], ['files', 'repo']);
  for (const ok of ['files', 'repo']) assert.equal(check(decl('text', { source: ok })).ok, true, ok);
  assert.equal(check(decl('text')).ok, true, 'absent = files');
  for (const bad of ['Repo', 'both', '', null, 1]) {
    const r = check(decl('text', { source: bad }));
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.reds.some((x) => x.path === 'closeDecl.source'), `${String(bad)} reds at closeDecl.source`);
  }
  const code = validateCloseDecl(decl('js', { source: 'repo' }), { listing: ['src/a.js'], verdictType: 'green', writeScope: ['src/'], jobLines: [{ n: 1 }] });
  assert.ok(code.reds.some((x) => x.path === 'closeDecl.source'), 'a code close has no source');
});

test('sourceOf reads the signed field: files when a text close has none, repo when signed, null for a code close', () => {
  assert.equal(sourceOf({ lang: 'text' }), 'files');
  assert.equal(sourceOf({ lang: 'text', source: 'files' }), 'files');
  assert.equal(sourceOf({ lang: 'text', source: 'repo' }), 'repo');
  assert.equal(sourceOf({ lang: 'js', source: 'repo' }), null);
  assert.equal(sourceOf(null), null);
});

/** one drafting run on a frozen file; `source` is what the door hands authorCloseForJob; the authorFn spy returns a one-guard close */
async function draft(/** @type {any} */ extra) {
  const file = join(tmp(), 'a.txt');
  writeFileSync(file, 'one line of input\n');
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: 'Notes', value: file }], into: join(tmp(), 'seed') });
  if (!proved.ok) throw new Error('inputs');
  /** @type {any} */ let seen = null;
  const r = await authorCloseForJob({
    answers: { 1: '1. Summarize the notes' }, verdictType: 'soft-green', repoPath: proved.prep.tree, lang: RUBRIC_LANG,
    jobLines: [{ n: 1, text: 'Summarize the notes' }], inputs: [{ n: 1, label: 'Notes', value: file }], writeScope: ['output/'],
    scoutFn: async () => { throw new Error('no scout'); }, generate: async () => { throw new Error('no model call'); },
    authorFn: async (/** @type {any} */ o) => { seen = o; return { ok: true, declaration: { stages: [{ name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } }], refused: [{ line: 1, reason: 'fixture' }] }, genreEnv: null, cost: { calls: [] }, reds: [], stop: null }; },
    ...extra,
  });
  return { r, seen };
}

test('authorCloseForJob signs the source it is handed (repo) and hands it on to the draft; a files job signs none, so its hash does not move', async () => {
  const repo = await draft({ source: 'repo' });
  assert.equal(repo.r.closeDecl?.source, 'repo');
  assert.equal(repo.seen.source, 'repo', 'the drafting close runs (seed reads) are told the source');
  const files = await draft({});
  assert.equal(Object.hasOwn(files.r.closeDecl ?? {}, 'source'), false, 'absent on a files job');
  assert.equal(files.seen.source, 'files');
  const explicit = await draft({ source: 'files' });
  assert.equal(Object.hasOwn(explicit.r.closeDecl ?? {}, 'source'), false, 'an explicit files is absent too');
});
