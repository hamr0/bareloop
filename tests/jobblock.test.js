// P7: the job block's one parser (src/jobblock.js) — numbered lines, `~` rules, PASS/FAIL examples, numbered inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseJobBlock, parseInputs, renderJobLines, renderExamples, renderInputs } from '../src/jobblock.js';
import { proveInputFiles } from '../src/source.js';
import { redactSecrets } from '../src/validate.js';

test('plain lines are numbered 1, 2, 3 and empty lines are ignored', () => {
  const r = parseJobBlock('Fix the tests\n\n  Keep the API  \nMake npm test pass\n');
  assert.ok(r.ok);
  assert.deepEqual(r.lines.map((l) => [l.n, l.text, l.rule]), [[1, 'Fix the tests', ''], [2, 'Keep the API', ''], [3, 'Make npm test pass', '']]);
});

test('consecutive ~ lines join into ONE rule with "; " and belong to the line above', () => {
  const r = parseJobBlock("Fix it\n~ don't edit tests\n~ no new dependencies\nRun npm test");
  assert.ok(r.ok);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].rule, "don't edit tests; no new dependencies");
  assert.equal(r.lines[1].rule, '');
});

test('PASS:/FAIL: ~ lines are judge examples kept with their line number; other ~ lines are not', () => {
  const r = parseJobBlock('Find flights\n~ PASS: price quoted from the page\n~ FAIL: a price not on the page\nSort them\n~ direct only');
  assert.ok(r.ok);
  assert.deepEqual(r.lines[0].examples, [{ verdict: 'PASS', text: 'price quoted from the page' }, { verdict: 'FAIL', text: 'a price not on the page' }]);
  assert.equal(r.lines[0].rule, 'PASS: price quoted from the page; FAIL: a price not on the page');
  assert.deepEqual(r.lines[1].examples, []);
  assert.equal(r.lines[1].rule, 'direct only');
});

test('a ~ before line 1 is a red; an empty box is a red; a bare PASS: is a red', () => {
  assert.equal(parseJobBlock('~ nope\nFix it').ok, false);
  assert.match(String((/** @type {any} */ (parseJobBlock('\n~ nope'))).error), /line 1/);
  assert.equal(parseJobBlock('  \n\n').ok, false);
  assert.equal(parseJobBlock(undefined).ok, false);
  assert.equal(parseJobBlock('Do it\n~ PASS:').ok, false);
});

test('inputs: one label: value per line, numbered; the value may hold colons', () => {
  const r = parseInputs('repo: /home/me/myrepo\n\nspec: docs/spec.md\nsearch: flights A to B at 10:30');
  assert.ok(r.ok);
  assert.deepEqual(r.inputs, [
    { n: 1, label: 'repo', value: '/home/me/myrepo' }, { n: 2, label: 'spec', value: 'docs/spec.md' },
    { n: 3, label: 'search', value: 'flights A to B at 10:30' },
  ]);
});

test('inputs: a line without label: value is a red naming its number', () => {
  const r = parseInputs('repo: /x\njust-a-path');
  assert.equal(r.ok, false);
  assert.match(String((/** @type {any} */ (r)).error), /line 2/);
  assert.equal(parseInputs('repo:').ok, false);
  assert.equal(parseInputs('').ok, false);
});

test('renderers: numbered lines with rules, examples with their line number, inputs as the drafter is told', () => {
  const r = parseJobBlock('Find flights\n~ PASS: price quoted\n~ FAIL: invented price\nSort them\n~ direct only');
  assert.ok(r.ok);
  assert.equal(renderJobLines(r.lines), '1. Find flights\n   rule: PASS: price quoted; FAIL: invented price\n2. Sort them\n   rule: direct only');
  assert.equal(renderExamples(r.lines), 'line 1 PASS: price quoted\nline 1 FAIL: invented price');
  assert.equal(renderInputs([{ n: 1, label: 'repo', value: '/r' }, { n: 2, label: 'spec', value: 'docs/spec.md' }]),
    'the person pointed at these inputs: 1 repo /r · 2 spec docs/spec.md');
});

// ── $0 proving of the Inputs (src/source.js proveInputFiles) — real git, real filesystem ──
const GIT_ID = ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', '-c', 'commit.gpgsign=false'];
const gitIn = (cwd, args) => execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' });

test('proveInputFiles: line 1 the repo, lines 2+ tracked files inside it; each miss is a red naming its line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobblock-'));
  try {
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs/spec.md'), '# spec\n');
    writeFileSync(join(repo, 'docs/loose.md'), 'untracked\n');
    writeFileSync(join(repo, '.env'), 'A=1\n');
    writeFileSync(join(repo, 'docs/keys.md'), `key sk-ant-api03-${'B'.repeat(95)}\n`);
    writeFileSync(join(repo, 'docs/bin.dat'), Buffer.from([1, 0, 2]));
    writeFileSync(join(dir, 'outside.md'), 'x');
    symlinkSync(join(repo, 'docs/spec.md'), join(repo, 'docs/link.md'));
    gitIn(dir, ['init', '-q', 'repo']);
    gitIn(repo, ['add', 'docs/spec.md', 'docs/keys.md', 'docs/bin.dat', 'docs/link.md', '.env']);
    gitIn(repo, ['commit', '-q', '-m', 'init']);
    const run = (/** @type {string} */ text) => {
      const p = parseInputs(text);
      assert.ok(p.ok, text);
      return proveInputFiles(p.inputs);
    };
    const err = async (/** @type {string} */ t) => /** @type {any} */ (await run(t)).error;

    const ok = await run(`repo: ${repo}\nspec: docs/spec.md\ndocs: docs`);
    assert.equal(ok.ok, true);
    assert.match(await err('repo: relative/path'), /line 1: the repo must be an absolute path/);
    assert.match(await err(`repo: ${join(dir, 'nope')}`), /line 1: .* does not exist/);
    assert.match(await err(`repo: ${repo}\nspec: docs/missing.md`), /line 2: docs\/missing\.md does not exist/);
    assert.match(await err(`repo: ${repo}\nspec: docs/loose.md`), /line 2: .* not tracked/);
    assert.match(await err(`repo: ${repo}\nspec: docs/spec.md\nx: ../outside.md`), /line 3: only files inside the repo for now/);
    assert.match(await err(`repo: ${repo}\nsearch: flights to Lisbon`), /line 2: only files inside the repo for now/);
    assert.match(await err(`repo: ${repo}\nu: https://example.com/a`), /line 2: only files inside the repo for now/);
    assert.match(await err(`repo: ${repo}\nenv: .env`), /line 2: .* environment file/);
    assert.match(await err(`repo: ${repo}\nl: docs/link.md`), /line 2: .* symlink/);
    assert.match(await err(`repo: ${repo}\nb: docs/bin.dat`), /line 2: .* not a text file/);
    // a secret-shaped CONTENT is masked where recorded, never refused (P6 worktree door ruling); .env by name and symlinks stay refused
    const keyed = await run(`repo: ${repo}\nk: docs/keys.md`);
    assert.equal(keyed.ok, true, JSON.stringify(keyed));
    assert.ok(!JSON.stringify(keyed).includes('sk-ant'), 'the file\'s text is never carried into the result');
    assert.equal(redactSecrets(`key sk-ant-api03-${'B'.repeat(95)}`).includes('sk-ant'), false, 'the ONE masking owner masks that very shape');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
