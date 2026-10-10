// hamr 2026-10-06 (option A): the PAGE side of the drafting part — map box, card, Audit group and its table. Same
// posture as the other page tests (functions extracted verbatim from src/panel/index.html, no jsdom). The part under
// test is built by the REAL server-side builder (`draftingPartFor`) over a real session folder, so the page reads the
// exact shape the server serves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftingPartFor, DRAFT_LOG_FILE } from '../src/draftspend.js';

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
  const start = PAGE.indexOf('function escapeXml');
  const end = PAGE.indexOf('function renderStepMap(');
  const names = ['escapeXml', 'panelMoney', 'duration', 'toolBreakdownLine', 'draftingMoneyText', 'draftingLine1Text', 'partLine2Text', 'draftingCallCost', 'draftingTableHtml', 'partLine1Text'];
  // eslint-disable-next-line no-new-func
  return new Function(`var MIN_BOX_W=100,CHAR_W=7,TITLE_HPAD=24,MAP_MARGIN=10,MAP_GAP=40,BOX_H=40,BOX_H_2LINE=52,ROW_GAP=40,stepMapUidCounter=0;
    function toolDisplayLabel(k){return k;}
    function attemptChecksLine(){return "";}
    ${PAGE.slice(start, end)}\n${names.map(fnSrc).join('\n')}
    return { buildStepMapHTML: buildStepMapHTML, buildOrderedBoxes: buildOrderedBoxes, stepNumberIndices: stepNumberIndices, partResultGlyph: partResultGlyph,
      ${names.join(', ')} };`)();
}

const at = (m, s) => `2026-10-01T09:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`;
/** the real server-built drafting part over a real session folder; `calls` = [stepNo, label, costUsd, unpricedRounds] */
function realPart(t, { extra = [], figure = 0.0755, complete = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'drafting-page-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sess = join(root, 'panel-sessions', 's1');
  mkdirSync(join(sess, 'source-x'), { recursive: true });
  const ev = [
    { kind: 'step-start', no: 0, id: 'setup', label: 'checking setup', at: at(0, 0) },
    { kind: 'step-end', no: 0, status: 'done', label: 'checking setup', at: at(0, 5) },
    { kind: 'step-start', no: 1, id: 'confirm', label: 'confirming plan', at: at(0, 5) },
    { kind: 'call', no: 1, step: 'confirm', label: 'confirm', model: 'deepseek-flash', costUsd: 0.0055, unpricedRounds: 0, at: at(1, 0) },
    { kind: 'call', no: 1, step: 'confirm', label: 'confirm#2', model: 'deepseek-flash', costUsd: 0.02, unpricedRounds: 0, at: at(2, 0) },
    { kind: 'step-end', no: 1, status: 'done', label: 'confirming plan', at: at(2, 10) },
    { kind: 'step-start', no: 2, id: 'draft', label: 'drafting', at: at(2, 10) },
    { kind: 'call', no: 2, step: 'draft', label: 'author', model: 'deepseek-flash', costUsd: 0.05, unpricedRounds: 0, at: at(4, 38) },
    { kind: 'step-end', no: 2, status: 'done', label: 'drafting', at: at(4, 38) },
    ...extra,
  ];
  writeFileSync(join(sess, DRAFT_LOG_FILE), `${ev.map((e) => JSON.stringify(e)).join('\n')}\n`);
  const part = draftingPartFor({ spine: join(sess, 'source-x', 'u.jsonl'), patient: null }, { draftSpentUsd: figure, draftSpendComplete: complete }, { home: root });
  assert.ok(part, 'the real builder made the part');
  return part;
}
const scout = { kind: 'scout', label: 'scout', outcome: null, attempts: [{ n: 1, outcome: null }], blocked: 0 };
const step = { kind: 'step', id: 's1', label: 's1', occurrence: 1, outcome: 'green', blocked: 0, attempts: [{ n: 1, outcome: 'green' }] };

test('page map: a drafting box comes FIRST with an arrow to scout; it is done, unnumbered, and the first real step is still step 1', (t) => {
  const { buildOrderedBoxes, stepNumberIndices, buildStepMapHTML } = load();
  const boxes = buildOrderedBoxes([realPart(t), scout, step], false);
  assert.deepEqual(boxes.map((b) => b.kind), ['drafting', 'scout', 'step']);
  assert.equal(boxes[0].title, 'drafting');
  assert.equal(boxes[0].state, 'done');
  assert.equal(boxes[0].noNumber, true);
  assert.deepEqual(boxes.map((b) => b.partIndex), [0, 1, 2], 'a box\'s partIndex IS its index in the shown list (the server shifted the rest)');
  assert.deepEqual(stepNumberIndices(boxes), [-1, -1, 0], 'drafting is not a numbered step');
  const svg = buildStepMapHTML(boxes, 900);
  assert.ok(svg.indexOf(' drafting]') !== -1 && svg.indexOf(' drafting]') < svg.indexOf(' scout]'), 'drafting is drawn before scout');
  assert.equal((svg.match(/<button /g) ?? []).length, 3, 'drafting, scout and step: one chip each, in that order');
  assert.equal((svg.match(/data-part-index="0"/g) ?? []).length, 1, 'clicking the drafting box opens part 0');
});

test('page card + Audit header: `<time> · <money> · <N> calls` and [✓]; line 2 names the drafting steps; money is the spine figure', (t) => {
  const { partLine1Text, partResultGlyph, partLine2Text, buildOrderedBoxes } = load();
  const part = realPart(t);
  const box = buildOrderedBoxes([part], false)[0];
  assert.equal(partLine1Text(part, {}), '4m38s &middot; $0.08 &middot; 3 calls', 'the header time, money and call count');
  assert.match(partResultGlyph(part, box), />✓</);
  assert.equal(partLine2Text(part), 'checking setup · confirming plan · drafting');
  // a floor reads "at least", never as an exact figure
  const floor = realPart(t, { figure: 0.05, complete: false });
  assert.match(partLine1Text(floor, {}), /at least \$0\.05/);
  assert.match(PAGE.match(/step-meta">' \+ escapeXml\(partLine2Text\(box\.part\)\)/)?.[0] ?? '', /partLine2Text/, 'the card\'s line 2 reads the one owner');
});

test('page Audit table: one row per step ("–" when it made no call), a further call on its own row, a total equal to the header money; no Tokens column', (t) => {
  const { draftingTableHtml, partLine1Text } = load();
  const part = realPart(t);
  const html = draftingTableHtml(part);
  assert.match(html, /<th>Step<\/th><th>Time<\/th><th>Calls<\/th><th>Model<\/th><th>Cost<\/th>/);
  assert.doesNotMatch(html, /Tokens/, 'the call path carries no token counts, so the column is dropped');
  const rows = html.slice(html.indexOf('<tbody>')).match(/<tr>.*?<\/tr>|<tr class="drafting-total">.*?<\/tr>/g);
  assert.equal(rows.length, 5, 'setup, confirm, confirm\'s 2nd call, draft, total');
  assert.match(rows[0], /checking setup<\/td><td>5\.0s<\/td><td>–<\/td><td>–<\/td><td>–<\/td>/, 'a step with no call shows – in Calls / Model / Cost');
  assert.match(rows[1], /confirming plan<\/td><td>2m05s<\/td><td>1<\/td><td>deepseek-flash<\/td><td>&lt;\$0\.01<\/td>|confirming plan<\/td><td>2m05s<\/td><td>1<\/td><td>deepseek-flash<\/td><td><\$0\.01<\/td>/, 'the step row carries its first call and the panel\'s <$0.01 rule');
  assert.match(rows[2], /confirming plan \(confirm#2\)<\/td><td>–<\/td><td>1<\/td><td>deepseek-flash<\/td><td>\$0\.02<\/td>/, 'a repeated call gets its own row, named by its own label');
  assert.match(rows[4], /drafting-total.*<b>total<\/b>.*<td>3<\/td><td>–<\/td><td>\$0\.08<\/td>/);
  const header = partLine1Text(part, {}).split(' &middot; ')[1];
  assert.equal(rows[4].match(/<td>(\$[\d.]+|at least \$[\d.]+)<\/td><\/tr>$/)?.[1], header, 'the total row\'s cost IS the header\'s money');
});

test('page Audit table: an unpriced call reads "unknown", never $0; an incomplete figure is "at least"', (t) => {
  const { draftingTableHtml } = load();
  const part = realPart(t, {
    figure: 0.05, complete: false,
    extra: [{ kind: 'call', no: 2, step: 'draft', label: 'revise-1', model: 'deepseek-flash', costUsd: null, unpricedRounds: 0, at: at(4, 39) }],
  });
  const html = draftingTableHtml(part);
  assert.match(html, /drafting \(revise-1\)<\/td><td>–<\/td><td>1<\/td><td>deepseek-flash<\/td><td>unknown<\/td>/);
  assert.match(html, /<td>at least \$0\.05<\/td><\/tr>/);
});

test('page Audit group: a drafting body shows the table instead of loading rounds; the flat view is untouched', () => {
  const body = fnSrc('renderAuditGroups');
  assert.match(body, /if\(part\.kind === "drafting"\)\{[\s\S]*draftingTableHtml\(part\)[\s\S]*\} else if\(attempts\.length > 1\)/);
  assert.match(body, /loadRounds\(roundsEl, idx,/, 'every other part still lazy-loads its rounds by the shown index');
  assert.doesNotMatch(fnSrc('renderAudit'), /drafting/, 'drafting makes no tool calls: the flat table never mentions it');
  assert.match(PAGE, /\.audit-table-scroll\{overflow:auto/, 'the table scrolls inside its own box on a phone');
});
