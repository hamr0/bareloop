// hamr's live click-through 2026-10-05: (1) the job card's free-text boxes wrap like the ask box; (2) the ask box is
// dimmed until something asks for a reply. Same posture as p5-startfrom-page.test.js (page functions extracted, fake DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name} in the page`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}

const WRAP_IDS = ['jf-job', 'jf-inputs', 'jf-dest'];

test('the three free-text card boxes (The job, Inputs, Destination) are wrapping <textarea>s; Job name stays a one-line input; ids and placeholders kept', () => {
  for (const id of WRAP_IDS) {
    assert.match(PAGE, new RegExp(`<textarea[^>]*id="${id}"[^>]*></textarea>`), `${id} is a textarea`);
    assert.doesNotMatch(PAGE, new RegExp(`<input[^>]*id="${id}"`), `${id} is no longer an input`);
  }
  assert.match(PAGE, /<input id="jf-name" type="text" placeholder="kebab-case, unique">/);
  assert.match(PAGE, /<textarea[^>]*id="jf-dest"[^>]*placeholder="the write fence/);
  // P7: the empty-box examples are set by the page and change with the Check type radio (setJobPlaceholders)
  assert.match(PAGE, /deterministic: "Fix the failing date tests in src\/date\.js\\n~ don't edit any test file\\nMake npm test pass"/);
  assert.match(PAGE, /rubric: "Write a one-page summary of docs\/plan\.md\\n~ PASS: every number is quoted from the file\\n~ FAIL: a number that is not in the file\\nKeep it under 300 words"/);
  assert.match(PAGE, /INPUTS_PLACEHOLDER = "repo: \/home\/me\/myrepo\\nspec: docs\/spec\.md"/);
  // no Enter handler on them: Enter is a newline
  assert.doesNotMatch(PAGE, /getElementById\("jf-(job|inputs|dest)"\)\.addEventListener\("keydown"/);
  const rule = PAGE.match(/\.job-card textarea\.jf-wrap\{([^}]*)\}/)[1];
  assert.match(rule, /resize:vertical/);
  assert.match(rule, /overflow-y:auto/);
  assert.match(rule, /max-height:200px/);
});

test('ONE fit function serves the ask box and the card boxes (no copy-paste, fitMsg generalized)', () => {
  assert.doesNotMatch(PAGE, /function fitMsg\(/);
  assert.equal((PAGE.match(/style\.height = Math\.min\(/g) || []).length, 1, 'no second copy of the fit logic');
  assert.equal((PAGE.match(/function fit\w+\(/g) || []).length, 2, 'fitBox + the card-box loop that calls it');
  assert.match(fnSrc('fitCardBoxes'), /fitBox\(document\.getElementById\(id\)\)/);
  // eslint-disable-next-line no-new-func
  const fitBox = new Function(`${fnSrc('fitBox')}\nreturn fitBox;`)();
  const mk = (scroll) => ({ scrollHeight: scroll, offsetHeight: 0, clientHeight: 0, style: {} });
  const one = mk(20); fitBox(one);
  assert.ok(parseFloat(one.style.height) <= 40, 'one line stays small');
  const many = mk(900); fitBox(many);
  assert.equal(many.style.height, '200px', 'capped, then scrolls inside');
  const hidden = mk(0); fitBox(hidden);
  assert.equal(hidden.style.height, '', 'a hidden box measures 0 and gets no height');
});

test('card fields (hamr 2026-10-05): editable = soft white + the ordinary 1px border, no added thick/grey border; focused = blue border', () => {
  const rule = PAGE.match(/\.job-card textarea\.jf-wrap\{([^}]*)\}/)[1];
  assert.match(rule, /border:1px solid var\(--border-strong\)/, 'the same ordinary border as the one-line inputs');
  assert.doesNotMatch(rule, /field-border|2px/);
  assert.match(PAGE, /#panel-chat textarea:not\(:disabled\):not\(\[readonly\]\):not\(#chat-msg\)\{background:var\(--field-soft-bg\)\}|#panel-chat textarea:not\(:disabled\):not\(\[readonly\]\):not\(#chat-msg\)\{background:var\(--field-soft-bg\);\}/);
  assert.match(PAGE, /#panel-chat :is\(input,select,textarea\):focus\{border-color:var\(--accent\);outline:none;\}/);
  // only the ask box carries --field-border (its own constant border, asked for earlier)
  assert.deepEqual([...PAGE.matchAll(/^\s*([^{\n]*)\{[^}]*var\(--field-border\)[^}]*\}/gm)].map((m) => m[1].trim()), ['#chat-msg']);
});

test('card box default heights (hamr 2026-10-05): The job at 3 rows, Inputs at 2, Destination at 1; fitBox only sets height from auto, so rows is the floor', () => {
  const rowsOf = (id) => Number(PAGE.match(new RegExp(`<textarea[^>]*id="${id}"[^>]*rows="(\\d+)"`))[1]);
  assert.equal(rowsOf('jf-job'), 3, 'The job defaults to 3 lines');
  assert.equal(rowsOf('jf-inputs'), 2, 'Inputs defaults to 2 lines');
  assert.equal(rowsOf('jf-dest'), 1, 'jf-dest stays 1 line');
  // fitBox resets to "auto" (the rows attribute then sizes the box) and measures scrollHeight, which the browser never
  // reports below the rows-sized client height; a hidden box clears the inline height so rows rule again.
  assert.match(fnSrc('fitBox'), /style\.height = "auto"/);
  // eslint-disable-next-line no-new-func
  const fitBox = new Function(`${fnSrc('fitBox')}\nreturn fitBox;`)();
  const el = { scrollHeight: 40, offsetHeight: 0, clientHeight: 0, style: { height: '999px' } }; // empty 2-row box measures its rows height
  fitBox(el);
  assert.equal(el.style.height, '40px', 'an empty 2-row box keeps its 2-row height');
});

test('live growth (hamr 2026-10-06): an input event on each card textarea calls fitBox on THAT box', () => {
  const m = PAGE.match(/\/\/ live growth:[^\n]*\n([\s\S]*?)window\.addEventListener\("resize"/);
  assert.ok(m, 'a per-box input wiring sits before the resize handler');
  const calls = [];
  const boxes = {};
  for (const id of WRAP_IDS) {
    boxes[id] = { id, handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
  }
  const document = { getElementById: (id) => boxes[id] };
  const fitBox = (el) => calls.push(el.id);
  // eslint-disable-next-line no-new-func
  const gutters = [];
  new Function('document', 'fitBox', 'FIT_IDS', 'NUMBERED_IDS', 'gutterSync', m[1])(document, fitBox, WRAP_IDS, ['jf-job', 'jf-inputs'], (id) => gutters.push(id));
  for (const id of WRAP_IDS) {
    assert.equal(typeof boxes[id].handlers.input, 'function', `${id} listens for input`);
    calls.length = 0;
    gutters.length = 0;
    boxes[id].handlers.input();
    assert.deepEqual(calls, [id], `${id}: input fits that box`);
    assert.deepEqual(gutters, id === 'jf-dest' ? [] : [id], `${id}: a numbered box re-measures its gutter, Destination has none`);
  }
});
