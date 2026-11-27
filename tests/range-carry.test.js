// Part 2 item 7 (ITEM33-BUILD "Part 2 build spec"): the carry memo's EDITS owner (`workingEdits`) treats the files CODE wrote under output/review-diff/ as inputs, never as the worker's edits; reads of them are still listed.
// Fixture = the REAL record of live round C pair 3 (run mwpzc91g, the 79-file range v0.60.0..v0.61.0 of bareloop's own history): its changed-file list and its gate audit's allowed read actions (tests/fixtures/range-carry/).
// The bug it fixed: 80 code-written diff files read as 80 worker "edits" (11,4xx of the memo's 12,000 chars) and pushed all 29 reads out. The tree here is a real git repo whose range changes those same 79 paths.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workingEdits, createCarryStore } from '../src/carrystore.js';
import { writeRangeDiffs } from '../src/rangereview.js';
import { DIFF_DIR } from '../src/repocite.js';
import { gitInPatient, initPatientRepo } from './helpers.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'range-carry');
const files = readFileSync(path.join(FIX, 'mwpzc91g-files.txt'), 'utf8').split('\n').filter(Boolean);
const rows = readFileSync(path.join(FIX, 'mwpzc91g-reads.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** a real repo whose range c0..c1 changes exactly the real run's 79 files; the person's HEAD stays at c1 (the range end) */
function world(/** @type {import('node:test').TestContext} */ t) {
  const root = mkdtempSync(path.join(tmpdir(), 'range-carry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  initPatientRepo(root);
  const put = (/** @type {string} */ body) => { for (const f of files) { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), body); } };
  put('one\n'); gitInPatient(root, ['add', '-A']); gitInPatient(root, ['commit', '-q', '-m', 'c0']);
  const a = gitInPatient(root, ['rev-parse', 'HEAD']).trim();
  put('two\n'); gitInPatient(root, ['add', '-A']); gitInPatient(root, ['commit', '-q', '-m', 'c1']);
  const b = gitInPatient(root, ['rev-parse', 'HEAD']).trim();
  return { root, a, b };
}

test('the real pair-3 record: the memo lists the worker\'s reads and NO review-diff edit (the diffs code wrote are inputs)', async (t) => {
  const w = world(t);
  const wrote = await writeRangeDiffs({ repo: w.root, worktree: w.root, a: w.a, b: w.b });
  assert.equal(wrote.ok && wrote.files.length, 79, 'the diffs are there: files.txt + one .diff per file = 80 untracked files');
  const edits = await workingEdits(w.root, w.b);
  assert.deepEqual(edits.filter((e) => e.path.startsWith(`${DIFF_DIR}/`)), [], 'not one code-written diff reads as a worker edit');
  assert.equal(edits.length, 0);

  // replay the real read actions through the real carry store (paths re-rooted into this tree)
  const emitted = /** @type {any[]} */ ([]);
  const store = createCarryStore({ workdir: w.root, emit: (type, rec) => emitted.push({ type, ...rec }), strikeLimit: 3 });
  store.setBase(w.b);
  const tools = [{ name: 'shell_read', execute: async () => 'file text' }, { name: 'ctx_get', execute: async () => 'chunk' }];
  store.wrapTools(tools);
  const OLD = /^.*\/patient\/\.bareloop\/wt\/[a-z0-9]+\//;
  let n = 0; let diffReads = 0;
  for (const j of rows) {
    const p = String(j.action.path);
    if (!OLD.test(p)) continue;
    const rel = p.replace(OLD, '');
    const tool = j.action.args?.tool;
    if (tool === 'shell_read') { await tools[0].execute({ path: path.join(w.root, rel) }); n++; if (rel.startsWith(DIFF_DIR)) diffReads++; }
    else if (tool === 'ctx_get') { await tools[1].execute({ path: path.join(w.root, rel) }); n++; }
  }
  assert.ok(n >= 25, `the replay read the real record's reads (${n})`);
  assert.ok(diffReads > 0, 'the real run did read code-written diffs');
  const text = await store.beginAsk({ phase: 'step:survey-diffs-draft-findings', iteration: 1, prompt: 'x' });
  const note = emitted.find((e) => e.type === 'carry-note');
  assert.ok(note.sections.reads > 0, `reads are listed: ${JSON.stringify(note.sections)}`);
  assert.equal(note.sections.edits, 0);
  assert.equal(note.capped, false);
  assert.ok(text.length < 6000, `the memo is small, not capped at 12,000 (${text.length})`);
  assert.doesNotMatch(text, /Edits made in this run:[\s\S]*output\/review-diff/);
  assert.match(text, /review-diff/, 'the reads of the diffs are still listed');
});

test('a worker\'s own edit and its own untracked answer file are still edits (the exclusion is the code-written directory only)', async (t) => {
  const w = world(t);
  await writeRangeDiffs({ repo: w.root, worktree: w.root, a: w.a, b: w.b });
  mkdirSync(path.join(w.root, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(w.root, 'output', 'steps', '1.json'), '{"results":[]}\n');
  writeFileSync(path.join(w.root, files[0]), 'changed by the worker\n');
  const edits = (await workingEdits(w.root, w.b)).map((e) => e.path).sort();
  assert.deepEqual(edits, [files[0], 'output/steps/1.json'].sort());
});

test('INVARIANT: a non-range run\'s memo is byte-identical to the parent commit\'s (golden captured on 4ba2da23 over the same tree: a worker edit, an untracked answer file, three reads)', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'plain-memo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  initPatientRepo(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 1;\nexport const b = 2;\n');
  writeFileSync(path.join(root, 'src', 'b.js'), 'export const c = 3;\n');
  gitInPatient(root, ['add', '-A']); gitInPatient(root, ['commit', '-q', '-m', 'c0']);
  const base = gitInPatient(root, ['rev-parse', 'HEAD']).trim();
  appendFileSync(path.join(root, 'src', 'a.js'), 'export const worker = true;\n');
  mkdirSync(path.join(root, 'output', 'steps'), { recursive: true });
  writeFileSync(path.join(root, 'output', 'steps', '1.json'), '{"results":[]}\n');
  const store = createCarryStore({ workdir: root, emit: () => {}, strikeLimit: 3 });
  store.setBase(base);
  const tools = [{ name: 'shell_read', execute: async () => 'file text' }, { name: 'ctx_get', execute: async () => 'chunk' }];
  store.wrapTools(tools);
  await tools[0].execute({ path: path.join(root, 'src', 'a.js') });
  await tools[0].execute({ path: path.join(root, 'src', 'b.js') });
  await tools[1].execute({ path: path.join(root, 'src', 'a.js'), startLine: 1, endLine: 2 });
  const text = await store.beginAsk({ phase: 'step:x', iteration: 1, prompt: 'x' });
  assert.equal(text, readFileSync(path.join(FIX, 'plain-memo-golden.txt'), 'utf8'));
});
