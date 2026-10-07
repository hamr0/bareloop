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
  const f = new Function('document', 'authorPost', 'resumeInChat', `var stopAsked = {};\n${fnSrc('escapeXml')}\n${fnSrc('renderRunActions')}\nreturn renderRunActions;`)(
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
  assert.doesNotMatch(bar.innerHTML, /btn-reuse/, 'a stopped (not green) run has no Reuse workflow');
  render({ runid: 'r3', live: false, died: false, ended: { reason: 'Goal met.', next: 'Nothing to do.', actions: [{ id: 'reuse', label: 'Reuse workflow' }] }, resume: null });
  assert.doesNotMatch(bar.innerHTML, /btn-resume-run|btn-stop"/, 'no Resume and no Stop on a green run');
  assert.match(bar.innerHTML, /btn-reuse">Reuse workflow</, 'a green run has Reuse workflow');
  render({ runid: 'r4', live: false, died: false, ended: { reason: 'Goal not met', next: 'Change the job: Clear the card and draft a new one.', actions: [] }, resume: null });
  assert.doesNotMatch(bar.innerHTML, /btn-reuse|Start from this/, 'a red run has no button at all');
  assert.equal(bar.hidden, true, 'an empty action row is not shown');
  render({ runid: 'r5', live: true, died: false, ended: null, resume: null });
  assert.doesNotMatch(bar.innerHTML, /btn-reuse/, 'a live run has Stop, not Reuse workflow');
});

test('page: Stop is wired to the stop route and Resume to the Chat-card resume mode', () => {
  assert.match(fnSrc('renderRunActions'), /"\/api\/runs\/" \+ encodeURIComponent\(detail\.runid\) \+ "\/stop"/);
  assert.match(fnSrc('renderRunActions'), /resumeInChat\(detail\)/);
  assert.match(fnSrc('renderRun'), /renderRunActions\(detail\)/, 'renderRun paints the action area on every render');
});

test('page: [Stop] sits in the Run tab\'s action row, Reuse workflow beside it for a green run — one row, the same plain .btn style, Stop only while live', () => {
  const { render, bar } = load();
  render({ runid: 'r1', live: true, died: false, ended: null, resume: null });
  assert.equal(bar.innerHTML, '<button class="btn" type="button" data-testid="btn-stop">Stop</button>');
  render({ runid: 'r1', live: false, died: false, ended: { actions: [{ id: 'reuse' }] }, resume: null });
  assert.equal(bar.innerHTML, '<button class="btn" type="button" data-testid="btn-reuse">Reuse workflow</button>');
  const runTab = PAGE.slice(PAGE.indexOf('<section id="panel-run"'), PAGE.indexOf('<section id="panel-audit"'));
  assert.ok(runTab.includes('id="run-actions"'), 'the action row is inside the Run tab');
  assert.equal(PAGE.split('btn-stop').length - 1, fnSrc('renderRunActions').split('btn-stop').length - 1, 'Stop is built nowhere but the action row');
  render({ runid: 'r1', live: false, died: false, ended: null, resume: null });
  assert.doesNotMatch(bar.innerHTML, /btn-stop/, 'not live: no Stop');
});
