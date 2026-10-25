// `src/invoke.js` — the one owner of how a printed re-invocation is spelled: the CLI spelling
// only when the flow was actually reached through `bareloop`, the source-tree script otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandFor } from '../src/invoke.js';

test('commandFor: run-u reached through the bareloop CLI -> `bareloop run-u`; interview and author left the CLI (PRD v1.114) so they are always the scripts', () => {
  assert.equal(commandFor('run-u', 'bareloop run-u'), 'bareloop run-u');
  assert.equal(commandFor('interview', 'bareloop run-u'), 'node scripts/run-interview.mjs');
  assert.equal(commandFor('author', 'bareloop run-u'), 'node scripts/run-author.mjs');
  assert.equal(commandFor('run-u', 'bareloop panel'), 'bareloop run-u');
});

test('commandFor: no invokedAs (the scripts/*.mjs adapters) -> the script spelling', () => {
  assert.equal(commandFor('run-u', undefined), 'node scripts/run-u.mjs');
  assert.equal(commandFor('interview', undefined), 'node scripts/run-interview.mjs');
  assert.equal(commandFor('author', 'node scripts/run-author.mjs'), 'node scripts/run-author.mjs');
});
