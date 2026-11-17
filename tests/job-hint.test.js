// R2 (Addendum 2026-11-17 (b)): the job box says, always, what is checked; the Not checked line of a step with no `~` rule says so (one owner: rubricstep.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROSE_WORDS, proseLine } from '../src/rubricstep.js';

const HTML = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('the job box carries the approved hint, always shown, right after the box', () => {
  const m = /<textarea[^>]*id="jf-job"[\s\S]*?<div class="hint"[^>]*data-testid="jf-job-hint"[^>]*>([^<]*)<\/div>/.exec(HTML);
  assert.ok(m, 'a hint div with data-testid jf-job-hint follows the job box');
  assert.equal(m[1].trim(), 'Only lines starting with ~ are checked. Other lines say what to do.');
  assert.doesNotMatch(/<div class="hint"[^>]*data-testid="jf-job-hint"[^>]*>/.exec(HTML)[0], /hidden|display\s*:\s*none/);
});

test('the Not checked wording of a step with no ~ rule: approved text, real line number', () => {
  assert.equal(PROSE_WORDS, 'No ~ rule here. What the text says, you judge it at Accept.');
  assert.equal(proseLine(2), 'Line 2: no ~ rule here. What the text says, you judge it at Accept.');
});
