// REVIEW THE CODE, clean build item 4 (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the fence. The worker's write scope on the rubric road is `output/` for BOTH sources: a review's Destination is where CODE writes the report, never a place the worker
// may write, so every code file AND Destination itself are refused by the gate that enforces the signed `writeScope` (hamr 2026-11-20: ruling 2A's ".md under Destination" is gone; POC A2: in 5 live runs every worker write was under output/).
// $0: a scripted worker through the real runner, the real worktree, the real gate.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runReview, cleanup, git } from './review-world.mjs';

after(cleanup);

test('FENCE: a worker\'s write to a code file AND to Destination is refused by the gate (neither file exists, neither is on the branch); the signed spec carries output/ alone', async () => {
  const { text, src, prep, spec, branch } = await runReview({ before: [{ file: 'src/slow.js', content: 'export const hacked = true;\n' }, { file: 'docs/sneak.md', content: '# sneaked\n' }] });
  assert.deepEqual(spec.writeScope, ['output/'], 'the fence is the rubric road\'s own');
  assert.equal(spec.closeDecl.source, 'repo');
  assert.equal(readFileSync(path.join(prep.tree, 'src', 'slow.js'), 'utf8').includes('hacked'), false, 'the code file was not written');
  assert.equal(existsSync(path.join(prep.tree, 'docs', 'sneak.md')), false, 'Destination is not the worker\'s to write');
  assert.match(text, /outcome\s+green/, text);
  assert.ok(branch, text);
  const files = git(src, ['diff', '--name-only', `main..${branch}`]).trim().split('\n').filter(Boolean);
  assert.equal(files.includes('src/slow.js'), false);
  assert.equal(files.includes('docs/sneak.md'), false);
});

test('FENCE with Destination src/: a .js and a .md worker write under src/ are both refused (no .md carve-out); the answer under output/ is the only thing the worker wrote', async () => {
  const { text, prep } = await runReview({ before: [{ file: 'src/a.js', content: 'export const a = 1;\n' }, { file: 'src/notes.md', content: '# notes\n' }], destination: 'src/' });
  assert.match(text, /outcome\s+green/, text);
  assert.equal(existsSync(path.join(prep.tree, 'src', 'a.js')), false);
  assert.equal(existsSync(path.join(prep.tree, 'src', 'notes.md')), false);
  assert.equal(existsSync(path.join(prep.tree, 'output', 'steps', '1.json')), true);
});
