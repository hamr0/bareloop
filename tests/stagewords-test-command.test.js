// A failing-test count must never read "type errors" (run mwue75ih, walk 2026-11-27): its plan had no
// `command-exit` stage, only the genre's tests-kept floor sharing the suite command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageQuestionsByName } from '../src/stagewords.js';

const count = (name, cmd, args, scope, direction, baseline) => ({
  name, kind: 'count-not-worse', params: { cmd, args, parser: { terms: [] }, scope, direction, baseline },
});
const spec = (stages) => ({ closeDecl: { genre: 'TYPES', lang: 'js', stages } });

test('mwue75ih shape: no command-exit stage, the tests-kept floor shares the suite command -> both failing-test counts read "no failing tests?"', () => {
  const q = stageQuestionsByName(spec([
    count('typecheck-errors-in-scope', 'npm', ['run', 'typecheck'], { includePrefixes: ['src/', 'bin/'] }, 'lower-is-better', 0),
    count('tests-executed-floor', 'npm', ['test'], { includePrefixes: ['tests/'] }, 'higher-is-better', 'seed'),
    count('failing-tests-zero', 'npm', ['test'], { includePrefixes: ['tests/'] }, 'lower-is-better', 0),
    count('suite-failed-lines-zero', 'npm', ['test'], { includePrefixes: ['tests/'] }, 'lower-is-better', 0),
  ]));
  assert.equal(q.get('failing-tests-zero'), 'no failing tests?');
  assert.equal(q.get('suite-failed-lines-zero'), 'no failing tests?');
  assert.equal(q.get('tests-executed-floor'), 'did all the old tests still exist?');
});

test('a real typecheck count keeps its words, with or without the floor', () => {
  const q = stageQuestionsByName(spec([
    count('typecheck-errors-in-scope', 'npm', ['run', 'typecheck'], { includePrefixes: ['src/'] }, 'lower-is-better', 0),
    count('tests-executed-floor', 'npm', ['test'], { includePrefixes: ['tests/'] }, 'higher-is-better', 'seed'),
  ]));
  assert.equal(q.get('typecheck-errors-in-scope'), 'src/ has 0 type errors?');
});
