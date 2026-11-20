// REVIEW THE CODE, clean build item 1b (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the gate. A repo's own seed listing never holds the engine's `output/` directory, so for the SIGNED source `repo` the engine's own
// directories (the source table's `engineDirs`) select without being listed; for `files` (a hidden tree that lists them) nothing is exempt, and a code close has none. No review flag: the signed source is the only thing read. $0, no model.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDeclaration, classGuards, catalogueForLang, RUBRIC_LANG } from '../src/authoring.js';
import { validateCloseDecl } from '../src/declaredclose.js';
import { defaultsOf } from '../src/sourcedefaults.js';

const LISTING = ['package.json', 'src/a.js', 'src/b.js', 'docs/notes.md'];
const [GUARD] = classGuards({ verdictType: 'soft-green', lang: RUBRIC_LANG });
const fenced = (/** @type {string[]} */ prefixes) => ({ name: GUARD.name, kind: GUARD.kind, params: { ...GUARD.params, allowPrefixes: prefixes } });
const STEP = { name: 'line-1', kind: 'rubric-step', fromLine: [1], params: { step: 1, parts: [{ text: 'list the slow code', class: 'countable', check: 'cited', source: 'repo' }] } };
const codes = (/** @type {any} */ r) => r.reds.map((/** @type {any} */ x) => `${x.code}@${x.path}`).filter((/** @type {string} */ c) => /^path-not-in-listing/.test(c));

test('the repo source row names the engine\'s own directories; files names none', () => {
  assert.deepEqual([...defaultsOf('repo').engineDirs], ['output', 'output/steps']);
  assert.deepEqual([...defaultsOf('files').engineDirs], []);
  assert.deepEqual([...defaultsOf(undefined).engineDirs], []);
});

test('drafting: with the repo row, output/ selects without being in the repo listing; Destination is still read off the repo; only the engine\'s own directories are exempt', () => {
  const base = { catalogue: catalogueForLang(RUBRIC_LANG), listing: LISTING, guards: [GUARD], envOwned: [], verdictType: 'soft-green', jobLines: [{ n: 1, text: 'List the slow code', rules: [] }], inputLabels: ['repo'], engineDirs: defaultsOf('repo').engineDirs };
  assert.deepEqual(codes(validateDeclaration({ stages: [fenced(['output/', 'docs/']), STEP] }, base)), []);
  assert.deepEqual(codes(validateDeclaration({ stages: [fenced(['output/', 'reports/']), STEP] }, base)), ['path-not-in-listing@stages[0].params.allowPrefixes[1]']);
  assert.deepEqual(codes(validateDeclaration({ stages: [fenced(['output/', 'outputs/']), STEP] }, base)), ['path-not-in-listing@stages[0].params.allowPrefixes[1]'], 'outputs/ is not the engine directory');
  assert.deepEqual(codes(validateDeclaration({ stages: [fenced(['output/']), STEP] }, { ...base, engineDirs: defaultsOf('files').engineDirs })), ['path-not-in-listing@stages[0].params.allowPrefixes[0]'], 'the files row exempts nothing');
});

test('signing: the SIGNED source decides: a repo close fenced to output/ grounds against a listing without it, the same close signed as files does not, a code close never', () => {
  const decl = (/** @type {any} */ extra) => ({ genre: 'TEXT', lang: 'text', stages: [fenced(['output/']), STEP], refused: [], ...extra });
  const opts = { listing: LISTING, verdictType: 'soft-green', writeScope: ['output/'], jobLines: [{ n: 1, text: 'List the slow code' }], inputLabels: ['repo'] };
  const repo = validateCloseDecl(decl({ source: 'repo' }), opts);
  assert.deepEqual(codes(repo), [], JSON.stringify(repo.reds));
  assert.ok(codes(validateCloseDecl(decl({}), opts)).length > 0, 'no signed source = files: output/ must be listed');
  const g = classGuards({ verdictType: 'green', lang: 'js' }).find((x) => (x.fill ?? []).includes('allowPrefixes'));
  assert.ok(g);
  const code = validateCloseDecl({ genre: 'TYPES', lang: 'js', stages: [{ name: g.name, kind: g.kind, params: { ...g.params, allowPrefixes: ['output/'] } }] }, { listing: LISTING, verdictType: 'green', writeScope: ['output/'], jobLines: [{ n: 1, text: 'x' }] });
  assert.ok(codes(code).length > 0, 'a code close that names output/ still reds');
});
