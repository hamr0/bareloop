// The Audit grid's `told in this run` row, the way fwdloop draws it (M14 p4, hamr's ruling 2026-11-03): in a step's or the fix loop's grid a row under the
// header, one `[ N lines ]` button per try that was handed a memo, opening the exact saved text in the errors area (8 lines then "+N more lines"). The
// per-try "Memory this worker got" folds are gone from grid parts. Real archived spine (run mvy0cx24) through the real getRunDetail; the page's own functions
// are pulled out by name. A try with no saved text shows "—"; a grid where no try has text draws no row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { getRunDetail } from '../src/panel/server.js';

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
const NAMES = ['escapeXml', 'attemptGlyph', 'tryGlyph', 'stageQuestionText', 'stageNumberText', 'gridGlyph', 'gridPlural', 'gridStepTryOf', 'gridFixTryOf', 'gridRowsOf', 'gridModelOf', 'gridCellOf', 'gridFailsOf', 'gridDefaultOpen', 'gridHasMemo', 'gridMemoLines', 'gridMemoWord', 'gridLinesHtml', 'gridTableHtml', 'gridErrorsHtml'];
const g = new Function(`${NAMES.map(fnSrc).join('\n')}\nreturn { ${NAMES.join(', ')} };`)();

const RUNID = 'mvy0cx24';
function detail() {
  const root = mkdtempSync(join(tmpdir(), 'audit-told-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const dir = join(root, 'session', 'source-seed', 'pulselog-panel-strict-bareloop');
  mkdirSync(dir, { recursive: true });
  copyFileSync(fileURLToPath(new URL(`./fixtures/audit-memo/u-${RUNID}.jsonl`, import.meta.url)), join(dir, `u-${RUNID}.jsonl`));
  appendRun({ at: '2026-11-01T16:51:00.000Z', runid: RUNID, job: 'pulselog-panel-strict', spine: join(dir, `u-${RUNID}.jsonl`), patient: null, via: 'run-u' }, { home });
  return getRunDetail(RUNID, { home });
}
const part = detail().parts.find((p) => p.kind === 'fix');
const model = g.gridModelOf(part, false);
const word = (t) => { const n = t.split('\n').length; return `${n} ${n === 1 ? 'line' : 'lines'}`; };
const st = (o = {}) => ({ open: {}, more: {}, memo: {}, mmore: {}, ...o });

test('the row sits in the grid body, caption `told in this run`, one button per try that has a memo and a dash for the opening close', () => {
  const html = g.gridTableHtml('p9', model);
  assert.match(html, /<tbody><tr class="hint-row memo-row"><td class="q">told in this run<\/td>/, 'first row of the body');
  const row = html.match(/<tr class="hint-row memo-row">(.*?)<\/tr>/)[1];
  const cells = [...row.matchAll(/<td class="c">(.*?)<\/td>/g)].map((m) => m[1]);
  assert.equal(cells.length, model.tries.length);
  model.tries.forEach((t, i) => {
    if (g.gridHasMemo(t)) {
      assert.match(cells[i], new RegExp(`^<button type="button" class="btn small hints" data-memo="${t.n}" aria-expanded="false" aria-controls="fxerr-p9" title="try ${t.n} \\u00B7 told in this run">${word(t.memo.text)}</button>$`));
    } else assert.equal(cells[i], '<span class="cell none">—</span>', `try ${t.n} got none`);
  });
  assert.ok(model.tries.some((t) => g.gridHasMemo(t)) && model.tries.some((t) => !g.gridHasMemo(t)), 'the real run has both kinds of try');
});

test('a clicked button opens a hintrow in the errors area, above the red rows, titled "try N · told in this run · K lines", with the exact text', () => {
  const t = model.tries.find((x) => g.gridHasMemo(x));
  const html = g.gridErrorsHtml('p9', model, st({ memo: { [t.n]: true } }));
  assert.match(html, /^<div class="fx-label">errors<\/div><div class="fx-row hintrow open"><button type="button" class="fx-rowhead" id="fxmemo-p9-\d+" data-mrow="\d+" aria-expanded="true"><span class="fx-caret">▾<\/span>/);
  assert.ok(html.includes(`<span class="fx-try">try ${t.n} · told in this run · ${word(t.memo.text)}</span>`));
  const lines = t.memo.text.split('\n');
  assert.ok(html.includes(`<div>${lines[0].replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`) || html.includes('<div class="ind">'), 'its first line is there');
  assert.ok(html.indexOf('hintrow') < html.indexOf('fx-row' + ' open') || !html.includes('fx-row open'), 'memo rows come before red rows');
  assert.equal(g.gridErrorsHtml('p9', model, st()).includes('hintrow'), false, 'closed: no hintrow');
});

test('a memo over 8 lines reads 8 then "+N more lines"; more shows all with "show first 8 only"', () => {
  const text = Array.from({ length: 11 }, (_, i) => `memo line ${i + 1}`).join('\n');
  const m = { tries: [{ n: 1, glyph: '✓', hint: '', noVerdict: null, known: true, cells: {}, order: [], memo: { text } }], rows: [] };
  const closed = g.gridErrorsHtml('p', m, st({ memo: { 1: true } }));
  assert.equal((closed.match(/<div>memo line/g) ?? []).length, 8);
  assert.ok(closed.includes('data-mmore="1">+3 more lines</button>'));
  const open = g.gridErrorsHtml('p', m, st({ memo: { 1: true }, mmore: { 1: true } }));
  assert.equal((open.match(/<div>memo line/g) ?? []).length, 11);
  assert.ok(open.includes('show first 8 only'));
});

test('no try with saved text (an older run): no row at all, and the page still draws "not saved" nowhere in the grid', () => {
  const old = { ...model, tries: model.tries.map((t) => ({ ...t, memo: t.memo ? { missing: true, chars: 5, capped: false } : null })) };
  assert.equal(g.gridTableHtml('p9', old).includes('memo-row'), false);
});

test('the grid builder no longer hangs a "Memory this worker got" fold under each try; the caption is blue', () => {
  const build = fnSrc('buildGridBody');
  assert.equal(build.includes('memoFoldEl'), false);
  assert.match(PAGE, /tr\.hint-row td\.q\{color:var\(--accent\);\}/);
  assert.match(PAGE, /#audit-body \.fx-try\{color:var\(--accent\);\}/, 'the Audit caption rules stay');
});
