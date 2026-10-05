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

test('#chat-msg is a wrapping <textarea> (hamr 2026-10-05: long ask text must wrap, not scroll sideways), Enter sends, Shift+Enter is a newline', () => {
  assert.match(PAGE, /<textarea id="chat-msg"[^>]*rows="2"[^>]*placeholder="Ask for a change, or reply to the plan…"[^>]*data-testid="chat-msg"[^>]*><\/textarea>/);
  assert.doesNotMatch(PAGE, /<input id="chat-msg"/);
  const rule = PAGE.match(/textarea\[data-testid="chat-msg"\]\{([^}]*)\}/)[1];
  assert.match(rule, /width:100%/);
  assert.match(rule, /box-sizing:border-box/);
  assert.match(rule, /resize:vertical/);
  // the soft-white Chat-card rule must not out-rank the ask box's own background
  assert.match(PAGE, /#panel-chat textarea:not\(:disabled\):not\(\[readonly\]\):not\(#chat-msg\)\{/);
  assert.match(PAGE, /msgInput\.addEventListener\("keydown", function\(e\)\{\s*if\(e\.key === "Enter" && !e\.shiftKey && !e\.isComposing\)\{\s*e\.preventDefault\(\);\s*if\(mainAction !== "start"\) mainBtn\.click\(\);/);
  assert.match(PAGE, /function fitBox\(el\)/); // generalized from fitMsg (card boxes share it)
});
