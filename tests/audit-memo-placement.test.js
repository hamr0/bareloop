// Where the Audit puts the memory fold (hamr's ruling 2026-11-02): INSIDE its own try, right under that try's "try N rounds" fold, in the
// SAME light style (details.rounds-fold) - not a boxed fold grouped at the bottom of the part. Real archived spine (run mvy0cx24) through
// the real getRunDetail, then the page's own buildGridBody extracted verbatim and run over a small fake DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { getRunDetail } from '../src/panel/server.js';

const RUNID = 'mvy0cx24';
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');
function fnSrc(name) {
  const start = PAGE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name}`);
  let depth = 0;
  let i = PAGE.indexOf('{', start);
  for (; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return PAGE.slice(start, i + 1);
}
function mk(tag = 'div') {
  const el = {
    tag, className: '', hidden: false, textContent: '', style: {}, attrs: {}, children: [], listeners: {}, hosts: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; },
    // the wrap's try hosts: one per data-fxtry in its html, the same object every time it is asked for
    querySelector(sel) { const m = /\[data-fxtry="(\d+)"\]/.exec(sel); if (!m) return null; return (this.hosts[m[1]] ??= mk('div')); },
    querySelectorAll() { return []; },
    find(testid) { return this.all().find((e) => e.attrs['data-testid'] === testid); },
    all() { return this.children.flatMap((c) => [c, ...c.all()]); },
  };
  return el;
}

const NAMES = ['escapeXml', 'attemptGlyph', 'tryGlyph', 'stageQuestionText', 'stageNumberText', 'gridGlyph', 'gridPlural', 'gridStepTryOf', 'gridFixTryOf', 'gridRowsOf', 'gridModelOf', 'gridCellOf', 'gridFailsOf', 'gridDefaultOpen', 'gridTableHtml', 'gridErrorsHtml', 'gridJudgedHtml', 'gridRoundsHtml', 'gridPartHtml', 'handedFold', 'memoFoldEl', 'buildGridBody'];
const document = { getElementById: () => null, createElement: (t) => mk(t) };
// eslint-disable-next-line no-new-func
const { buildGridBody } = new Function('document', `function renderGridErrors(){}\nfunction loadRounds(){}\n${NAMES.map(fnSrc).join('\n')}\nreturn { buildGridBody };`)(document);

function detail() {
  const root = mkdtempSync(join(tmpdir(), 'audit-memo-place-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const dir = join(root, 'session', 'source-seed', 'pulselog-panel-strict-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(fileURLToPath(new URL(`./fixtures/audit-memo/u-${RUNID}.jsonl`, import.meta.url)), join(dir, `u-${RUNID}.jsonl`));
  appendRun({ at: '2026-11-01T16:51:00.000Z', runid: RUNID, job: 'pulselog-panel-strict', spine: join(dir, `u-${RUNID}.jsonl`), patient: null, via: 'run-u' }, { home });
  return getRunDetail(RUNID, { home });
}

test('fix loop: each fix try carries its memo fold INSIDE the try block that holds its rounds fold, same class, label without the "Try N" prefix', () => {
  const part = detail().parts.find((p) => p.kind === 'fix');
  const body = mk();
  buildGridBody(body, 9, part, false);
  const wrap = body.children[body.children.length - 1];
  const html = wrap.innerHTML;
  const block = (n) => new RegExp(`<div data-fxtry="${n}">(?:(?!<div data-fxtry=).)*?<details class="rounds-fold" data-fxrounds="${n}">`, 's').test(html);
  assert.ok(block(2) && block(3), 'tries 2 and 3 each sit in a try block with their rounds fold');
  for (const n of [2, 3]) {
    const host = wrap.hosts[n];
    assert.ok(host, `try ${n} has a memo host`);
    const fold = host.children[0];
    assert.equal(fold.tag, 'details');
    assert.equal(fold.className, 'rounds-fold', 'the rounds fold\'s own class');
    assert.match(fold.find(`audit-memo-9-${n}-toggle`).innerHTML, /^Memory this worker got \(\d+ chars\)$/);
    assert.equal(fold.find(`audit-memo-9-${n}-text`).textContent.split(' for ')[1], `fix try ${n - 1}`);
  }
  assert.equal(wrap.hosts[1], undefined, 'the opening close ran no model: no memo fold');
  assert.ok(!body.all().some((e) => e.className === 'handed-fold'), 'no boxed fold grouped at the bottom');
});
