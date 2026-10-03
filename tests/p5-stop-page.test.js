// P5 item 5 — the PAGE side of Stop: the run's action area (Run tab). Same posture as p5r-page.test.js: the page's
// own `renderRunActions` is extracted VERBATIM from src/panel/index.html and run against a tiny fake DOM.
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

function load() {
  const bar = { innerHTML: '', hidden: true, querySelector: () => null, insertAdjacentHTML() {} };
  const opened = [];
  // eslint-disable-next-line no-new-func
  const f = new Function('document', 'authorPost', 'openResumeOnJobTab', `var stopAsked = {};\n${fnSrc('escapeXml')}\n${fnSrc('renderRunActions')}\nreturn renderRunActions;`)(
    { getElementById: (id) => { assert.equal(id, 'run-actions'); return bar; } }, () => Promise.resolve({ status: 200, body: { ok: true } }), (d) => opened.push(d),
  );
  return { render: f, bar, opened };
}

test('page: a LIVE run shows [Stop]; once asked (or the server says stopping) it reads "stopping after this turn…" and no button', () => {
  const { render, bar } = load();
  render({ runid: 'r1', live: true, died: false, ended: null, resume: null });
  assert.match(bar.innerHTML, /data-testid="btn-stop">Stop</);
  assert.equal(bar.hidden, false);
  render({ runid: 'r1', live: true, stopping: true, died: false, ended: null, resume: null });
  assert.match(bar.innerHTML, /stopping after this turn…/);
  assert.doesNotMatch(bar.innerHTML, /btn-stop/);
});

test('page: the run card carries [Resume] only when the engine would accept it; a green or refused run has no action', () => {
  const { render, bar } = load();
  const ended = { reason: 'You stopped it.', next: 'Resume.', actions: [{ id: 'resume', label: 'Resume' }] };
  render({ runid: 'r2', live: false, died: false, ended, resume: { budgetUsd: 4 } });
  assert.match(bar.innerHTML, /data-testid="btn-resume-run">Resume</);
  assert.match(bar.innerHTML, /btn-start-from">Start from this</);
  render({ runid: 'r3', live: false, died: false, ended: { reason: 'Goal met.', next: 'Nothing to do.', actions: [] }, resume: null });
  assert.doesNotMatch(bar.innerHTML, /btn-resume-run|btn-stop"/, 'no Resume and no Stop on a green run');
  assert.match(bar.innerHTML, /btn-start-from">Start from this</, 'Start from this is on EVERY run');
});

test('page: Stop is wired to the stop route and Resume to the Job-tab resume mode', () => {
  assert.match(fnSrc('renderRunActions'), /"\/api\/runs\/" \+ encodeURIComponent\(detail\.runid\) \+ "\/stop"/);
  assert.match(fnSrc('renderRunActions'), /openResumeOnJobTab\(detail\)/);
  assert.match(fnSrc('renderRun'), /renderRunActions\(detail\)/, 'renderRun paints the action area on every render');
});
