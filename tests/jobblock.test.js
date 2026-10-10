// P7: the job block's one parser (src/jobblock.js) — numbered lines, `~` rules, PASS/FAIL examples, numbered inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobBlock, parseInputs } from '../src/jobblock.js';

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
