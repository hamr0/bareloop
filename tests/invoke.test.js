// `src/invoke.js` — the one owner of how a printed re-invocation is spelled: the CLI spelling
// only when the flow was actually reached through `bareloop`, the source-tree script otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandFor } from '../src/invoke.js';

test('commandFor: reached through the bareloop CLI -> `bareloop <flow>`, for all three flows', () => {
  assert.equal(commandFor('run-u', 'bareloop run-u'), 'bareloop run-u');
  assert.equal(commandFor('interview', 'bareloop interview'), 'bareloop interview');
  assert.equal(commandFor('author', 'bareloop author'), 'bareloop author');
  // a sibling flow is spelled the same way its caller was entered
  assert.equal(commandFor('run-u', 'bareloop author'), 'bareloop run-u');
});

test('commandFor: no invokedAs (the scripts/*.mjs adapters) -> the script spelling', () => {
  assert.equal(commandFor('run-u', undefined), 'node scripts/run-u.mjs');
  assert.equal(commandFor('interview', undefined), 'node scripts/run-interview.mjs');
  assert.equal(commandFor('author', 'node scripts/run-author.mjs'), 'node scripts/run-author.mjs');
});
