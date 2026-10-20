// PRD v1.106 Part 3 — thinking shown in the Audit tab and the Job tab, read from the run's own spine records (never guessed).
// The replay half runs on a REAL archived spine (u-mvcugnu2, a live code run on deepseek-flash); the Job tab half runs the real panel route;
// the page half pulls the page's own drawing code out of src/panel/index.html by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayRun } from '../src/replay.js';
import { thinkingJobText, thinkingRowText, thinkingWordsFrom } from '../src/thinking.js';
import { keysHome, makeRun, panel, specOf } from './trigger-world.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/mvcugnu2-thinking.jsonl', import.meta.url));
const load = () => readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PAGE = readFileSync(fileURLToPath(new URL('../src/panel/index.html', import.meta.url)), 'utf8');

/** the words per part id and per attempt, as the replay hands them to the page */
const wordsOf = (spine) => Object.fromEntries(replayRun(spine, [], { runId: 'mvcugnu2' }).parts.map((p) => [p.id, { part: p.thinking, attempts: p.attempts.map((a) => a.thinking) }]));

test('Part 3: each Audit part and attempt carries the thinking its spine recorded (real run mvcugnu2)', () => {
  const w = wordsOf(load());
  assert.equal(w.scout.part, 'thinking off', 'the scout is off');
  assert.equal(w.plan.part, 'thinking on', 'the planner thinks');
  assert.deepEqual(w['step:annotate-checks-js:1'], { part: 'thinking off', attempts: ['thinking off'] }, 'a one-attempt step says it on its header line');
  assert.deepEqual(w['step:strict-clean-checks:1'], { part: undefined, attempts: ['thinking off', 'thinking on'] }, 'attempt 1 off, attempt 2 on; a multi-attempt part has no header word');
  assert.deepEqual(w.fix.attempts, [undefined, 'thinking on', 'thinking on', 'thinking on'], 'the opening precheck made no call; every fix iteration thinks');
  assert.equal(w.fix.part, undefined);
});

test('Part 3: the mode shown is the mode RECORDED, and a status word is drafting\'s own words (thinkingRowText), not retyped', () => {
  // flip the recorded mode of step 2 attempt 2 to off: the Audit must follow the spine
  const spine = load().map((r) => (r.type === 'thinking-decision' && r.phase === 'step:strict-clean-checks' && r.iteration === 2 ? { ...r, mode: 'off' } : r));
  assert.equal(wordsOf(spine)['step:strict-clean-checks:1'].attempts[1], 'thinking off');
  // every status bare-agent can report gives drafting's exact words for that mode
  for (const status of ['applied', 'unsupported', 'ignored', 'unknown']) {
    const s = load().map((r) => (r.type === 'thinking-status' && r.phase === 'plan' ? { ...r, thinkingStatus: status } : r));
    assert.equal(wordsOf(s).plan.part, thinkingRowText({ mode: 'on', status }), status);
  }
  assert.equal(thinkingRowText({ mode: 'on', status: 'unsupported' }), "thinking on (this model can't change it)");
});

test('Part 3: an attempt whose own call recorded nothing shows no word, never its neighbour\'s', () => {
  const spine = load().filter((r) => !(r.type === 'thinking-decision' && r.phase === 'step:strict-clean-checks' && r.iteration === 2));
  assert.deepEqual(wordsOf(spine)['step:strict-clean-checks:1'].attempts, ['thinking off', undefined]);
});

test('Part 3: a run from before the records (none in its spine) shows no thinking word anywhere', () => {
  const spine = load().filter((r) => r.type !== 'thinking-decision' && r.type !== 'thinking-status');
  const parts = replayRun(spine, [], { runId: 'old' }).parts;
  assert.ok(parts.length >= 4, 'the parts still exist');
  for (const p of parts) {
    assert.equal('thinking' in p, false, `${p.id} has no thinking word`);
    for (const a of p.attempts) assert.equal('thinking' in a, false, `${p.id} attempt ${a.n} has no thinking word`);
  }
});

test('Part 3: thinkingWordsFrom reads a decision only inside its window and pairs the status that follows it', () => {
  const spine = [
    { type: 'thinking-decision', phase: 'plan', iteration: 'draft', mode: 'on', seq: 5 },
    { type: 'thinking-status', phase: 'plan', iteration: 'draft', mode: 'on', thinkingStatus: 'ignored', seq: 6 },
    { type: 'thinking-decision', phase: 'plan', iteration: 'replan', mode: 'off', seq: 20 },
  ];
  assert.equal(thinkingWordsFrom(spine, { phase: 'plan', hi: 10 }), 'thinking on (the model thought anyway)');
  assert.equal(thinkingWordsFrom(spine, { phase: 'plan', lo: 10 }), 'thinking off', 'the later decision has no status of its own');
  assert.equal(thinkingWordsFrom(spine, { phase: 'scout' }), null, 'another phase');
  assert.equal(thinkingWordsFrom(spine, { phase: 'plan', lo: 6, hi: 20 }), null, 'an empty window');
});

test('Part 3: the Job tab row: always a row; the rule from the tick when the spine recorded decisions, an em dash on a run from before the rule', async () => {
  const home = keysHome();
  const p = await panel({ home });
  const ticked = { ...specOf({ job: 'tj' }), thinking: true };
  const a = makeRun(home, { runid: 'ra', spec: specOf({ job: 'tj' }) });
  const b = makeRun(home, { runid: 'rb', spec: ticked });
  makeRun(home, { runid: 'rc', spec: specOf({ job: 'tj' }) });
  makeRun(home, { runid: 'rc2', spec: ticked });
  const d = makeRun(home, { runid: 'rd', spec: ticked });
  rmSync(join(d.out, 'resolved-spec.json'));
  const rec = (phase) => `${JSON.stringify({ type: 'thinking-decision', phase, iteration: 1, mode: 'off', ts: '2026-10-01T10:02:00.000Z', seq: 9 })}\n`;
  for (const r of [a, b, d]) appendFileSync(r.spine, rec('scout'));
  const job = async (id) => (await p.get(`/api/runs/${id}/job`)).body;
  assert.equal((await job('ra')).thinking, thinkingJobText(false, true));
  assert.equal((await job('ra')).thinking, 'on retries', 'records, not ticked');
  assert.equal((await job('rb')).thinking, 'always on', 'records, ticked');
  assert.equal((await job('rc')).thinking, '\u2014', 'no records: an em dash, still a row');
  assert.equal((await job('rc2')).thinking, '\u2014', 'no records and the job is ticked: still an em dash, never read from the tick');
  assert.equal((await job('rd')).thinking, 'on retries', 'a tick that cannot be read counts as not ticked, never an empty row');
  assert.equal('thinkingTick' in (await job('ra')), false, 'the internal flag is not sent');
  
});

test('Part 3: the page draws the words it is handed: header bit, attempt line right after the glyph, a Job row; it types no thinking word', () => {
  assert.match(PAGE, /part\.thinking === "string"[\s\S]{0,120}bits\.push\(escapeXml\(part\.thinking\)\)/);
  assert.match(PAGE, /attemptGlyph\(a\.outcome, boxIsLive\) \+\s*\(a\.thinking \? ' &middot; ' \+ escapeXml\(a\.thinking\) : ''\) \+\s*\(checksText/);
  assert.match(PAGE, /<div class="field-row">\s*<div class="field"><label>Model<\/label>[^\n]*\n\s*<div class="field" id="details-thinking-field"><label>Thinking<\/label>/, 'Model then Thinking in one field-row, never hidden');
  assert.doesNotMatch(PAGE, /id="details-thinking-field" hidden/);
  assert.match(PAGE, /getElementById\("details-thinking"\)\.textContent = typeof job\.thinking === "string"/);
  assert.doesNotMatch(PAGE, /thinking (on|off)|on retries|always on|on everywhere/, 'every thinking word comes from src/thinking.js');
});

/** the source of `function <name>(...) {...}` out of the page, brace-scanned */
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

test('Part 3: the real attempt-line and part-line drawing: `attempt 2 [glyph] · thinking on`, and a one-call part says it on its header', () => {
  const rows = [];
  const document = { createElement: () => { const el = { querySelector: () => ({ addEventListener() {} }), appendChild() {}, setAttribute() {}, set className(v) {}, set innerHTML(v) { el.html = v; } }; rows.push(el); return el; } };
  const f = new Function('document', 'attemptChecksLine', 'fullStageList', 'stageLineHtml', 'attemptGlyph', 'escapeXml', 'loadRounds', `${fnSrc('buildAttemptsList')}\nreturn buildAttemptsList;`)(
    document, () => '', () => [], () => '', () => '[X]', (x) => String(x), () => {});
  f({ innerHTML: '', appendChild() {} }, 3, [{ n: 1, outcome: 'red', thinking: 'thinking off' }, { n: 2, outcome: 'red', thinking: "thinking on (this model can't change it)" }, { n: 3, outcome: 'green' }], false);
  const text = rows.map((r) => r.html).filter(Boolean).join('|');
  assert.match(text, /attempt 1 \[X\] &middot; thinking off</);
  assert.match(text, /attempt 2 \[X\] &middot; thinking on \(this model can't change it\)</);
  assert.match(text, /attempt 3 \[X\]</);
  assert.doesNotMatch(text, /attempt 3 \[X\] &middot;/, 'an attempt with no record shows no thinking word');
  const part = new Function('draftingLine1Text', 'duration', 'panelMoney', 'liveWallPhrase', 'liveSpendText', 'attemptChecksLine', 'escapeXml', `${fnSrc('partLine1Text')}\nreturn partLine1Text;`)(
    () => '', () => '1s', () => '$0.01', () => '', () => '', () => '', (x) => String(x));
  assert.match(part({ kind: 'plan', rounds: 1, toolCalls: 0, wallMs: 1000, spentUsd: 0.01, thinking: 'thinking on', attempts: [{ n: 1 }] }), /1s &middot; \$0\.01 &middot; thinking on$/);
  assert.doesNotMatch(part({ kind: 'plan', rounds: 1, toolCalls: 0, wallMs: 1000, spentUsd: 0.01, attempts: [{ n: 1 }] }), /thinking/);
});
