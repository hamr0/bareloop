// hamr 2026-11-15, item 4: every row label reads `~ [you]`, `! [agent]`, `$ [default]` (the sign before the tag), one spelling (byTagOf in the page; rowTag in the CLI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as AR from '../src/authorrun.js';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
const start = PAGE.indexOf('function byTagOf(');
let i = PAGE.indexOf('{', start); let d = 0;
for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') d += 1; else if (PAGE[i] === '}') { d -= 1; if (d === 0) break; } }
const byTagOf = new Function(`${PAGE.slice(start, i + 1)}\nreturn byTagOf;`)();

test('the page tags read `~ [you]`, `! [agent]`, `$ [default]`; no tag for an unknown row', () => {
  assert.match(byTagOf('you'), />~ \[you\]<\/span>/);
  assert.match(byTagOf('agent'), />! \[agent\]<\/span>/);
  assert.match(byTagOf('default'), />\$ \[default\]<\/span>/);
  assert.equal(byTagOf(null), '');
});

test('the CLI plan print uses the same three spellings', () => {
  const t = AR.confirmPlanLines({ goal: 'g', checkItems: [{ text: 'a', fromLine: [1], by: 'you' }, { text: 'b', fromLine: [1], by: 'agent' }, { text: 'c', fromLine: [1], by: 'default' }], protections: [], notChecked: [], questions: [] }).join('\n');
  assert.match(t, /line 1: ~ \[you\] a/);
  assert.match(t, /line 1: ! \[agent\] b/);
  assert.match(t, /line 1: \$ \[default\] c/);
});
