// hamr's live click-through 2026-10-05: the chat message box looked dimmed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

test('#chat-msg: white in light mode, the theme input background in dark, one constant solid border (not focus-only)', () => {
  const rule = PAGE.match(/#chat-msg\{([^}]*)\}/)[1];
  assert.match(rule, /background:var\(--field-bg\)/);
  assert.match(rule, /border:2px solid var\(--field-border\)/);
  assert.doesNotMatch(rule, /border-color:transparent/);
  // dark default token = the theme's normal input background (input,select use var(--bg))
  assert.match(PAGE, /:root\{[^]*?--field-bg:var\(--bg\);[^]*?\}/);
  // both light blocks override it to white
  assert.equal((PAGE.match(/--field-bg:#ffffff;/g) || []).length, 2);
  // no other input rule was touched
  assert.match(PAGE, /input,select\{font:inherit;padding:6px 8px;border:1px solid var\(--border-strong\);border-radius:0;background:var\(--bg\);color:var\(--text\);\}/);
});
