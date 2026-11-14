// Build 2026-11-14 (b), live run mwgjlezb: a facts-only rubric line ("Write a one-sentence triage note ... quoting its title word for word") produced results and no note.
// The note question (src/noteask.js) is ONE typed call, only when a line is facts-only; code decides (src/checkblock.js buildNote). Real CheckBlock, real bareguard grading; the model boundary is a stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CheckBlock, renderCard } from '../src/checkblock.js';
import { askNotes, decideNote, notePrompt, runNoteAsk } from '../src/noteask.js';
import { lineBriefs, gradeStep, checksOfClose, lineCarriesText, listMatchesClose } from '../src/rubricstep.js';
import { confirmProtections } from '../src/authorflow.js';
import { RUBRIC_LANG } from '../src/authoring.js';

const PAGE = 'Issue #19\nTitle: Crash on start when config is empty\nOpened by alice\nThe app crashes when config.json is empty.\n';
const LINES = [{ n: 1, text: 'Write a one-sentence triage note for the ticket, quoting its title word for word', rules: ['the title must be quoted'] }];
const LOOK = { facts: [{ line: 1, name: 'title', shape: 'phrase', source: 'Ticket', words: ['Crash on start when config is empty'], forRule: 1 }], dropped: [] };

function made(lines = LINES, look = LOOK) {
  const b = new CheckBlock({ texts: { Ticket: PAGE }, labels: ['Ticket'], asks: false, split: true });
  b.fromJob(lines);
  b.addLook(look.facts, look.dropped);
  b.reconcile();
  return b;
}
const close = (b) => ({ stages: b.closeView().stages, picks: b.closeView().picks, list: b.closeView().list });
const stub = (answer) => { const seen = []; const fn = async (o) => { seen.push(o); return answer; }; fn.seen = seen; return fn; };
const yes = () => ({ state: 'answered', answers: new Map([[1, 'yes']]), reason: null, calls: [] });
const no = () => ({ state: 'answered', answers: new Map([[1, 'no']]), reason: null, calls: [] });
const grade = (params, file) => gradeStep({ params, bytes: JSON.stringify(file), outputBytes: null, inputs: { Ticket: PAGE } }, { Ticket: createHash('sha256').update(PAGE).digest('hex') });
const results = [{ quote: 'Title: Crash on start when config is empty', values: { title: 'Crash on start when config is empty' } }];

test('before the question, line 1 is facts-only: results and no text, and the brief says so', () => {
  const b = made();
  assert.deepEqual(b.factOnlyLines(), [1]);
  const brief = lineBriefs(close(b)).find((x) => x.line === 1).text;
  assert.match(brief, /is a FACTS line\. Write/);
  assert.doesNotMatch(brief, /FACTS line AND a TEXT line/);
});

test('a stubbed yes: a countable nonEmpty text part, the brief says FACTS AND TEXT, a results-only file grades red, results plus a note grades green, the row is [default]', async () => {
  const b = made();
  const fn = stub(yes());
  await askNotes({ block: b, jobLines: LINES, noteFn: fn });
  assert.equal(fn.seen.length, 1);
  assert.deepEqual(fn.seen[0].lines, [{ n: 1, text: LINES[0].text }], 'the AI sees line text only, never the ~ rules');
  const c = close(b);
  const params = c.stages[0].params;
  const note = params.parts.find((p) => p.class === 'countable' && p.check === 'nonEmpty');
  assert.ok(note, 'a countable nonEmpty text part');
  assert.equal(note.text, 'line 1 writes a note — the note must be there');
  assert.match(lineBriefs(c).find((x) => x.line === 1).text, /FACTS line AND a TEXT line/);
  assert.equal(lineCarriesText(c, 1), true);
  const red = await grade(params, { results });
  assert.equal(red.verdict, 'red', 'a results-only file is red');
  assert.match(red.gapLines.join('\n'), /"text" is missing or empty/);
  const green = await grade(params, { results, text: 'Crash on start when config is empty: please triage.' });
  assert.equal(green.verdict, 'green', JSON.stringify(green.gapLines));
  const row = checksOfClose(c).find((x) => x.text === note.text);
  assert.equal(row?.by, 'default');
  assert.deepEqual(listMatchesClose(c), { ok: true });
  assert.ok(renderCard(b.rows).some((r) => r.text === '$ line 1 writes a note — the note must be there'));
  assert.equal(b.picksOf(b.reconcile()).length, 0, 'a default is not the person\'s pick');
});

test('a stubbed no keeps the line facts-only: no row, no text part, results alone grade green', async () => {
  const b = made();
  await askNotes({ block: b, jobLines: LINES, noteFn: stub(no()) });
  assert.equal(b.rowsOn(1, 'note').length, 0);
  const params = close(b).stages[0].params;
  assert.equal(params.parts.some((p) => p.class === 'countable'), false);
  assert.equal((await grade(params, { results })).verdict, 'green');
});

test('a job with no facts-only line makes no call', async () => {
  const b = made([{ n: 1, text: 'Summarise the ticket', rules: [] }], { facts: [], dropped: [] });
  assert.deepEqual(b.factOnlyLines(), []);
  const fn = stub(yes());
  assert.deepEqual(await askNotes({ block: b, jobLines: [{ n: 1, text: 'Summarise the ticket' }], noteFn: fn }), []);
  assert.equal(fn.seen.length, 0);
  assert.deepEqual(await askNotes({ block: made(), jobLines: LINES, noteFn: null }), [], 'no noteFn, no call');
});

test('a failed call leaves the line facts-only with a Not checked row in plain words', async () => {
  const b = made();
  await askNotes({ block: b, jobLines: LINES, noteFn: stub({ state: 'failed', answers: new Map(), reason: 'the note question call failed: x', calls: [] }) });
  const row = b.rowsOn(1, 'note')[0];
  assert.equal(row.state, 'not-checked');
  assert.equal(row.reason, 'could not ask whether line 1 also wants a note');
  assert.equal(close(b).stages[0].params.parts.some((p) => p.class === 'countable'), false, 'still facts-only');
  assert.ok(b.signedRows().some((r) => r.kind === 'note' && r.state === 'not-checked'));
});

test('the protections line says "carry text" only for a line whose signed close has text-present', async () => {
  const facts = made();
  const jl = [{ n: 1 }];
  const before = confirmProtections({ verdictType: 'soft-green', lang: RUBRIC_LANG, jobLines: jl, closeDecl: close(facts) }).filter((l) => l.startsWith('line 1 file'));
  assert.deepEqual(before, ['line 1 file — output/steps/1.json must exist, be complete JSON'], 'absent on a facts-only line');
  await askNotes({ block: facts, jobLines: LINES, noteFn: stub(yes()) });
  const after = confirmProtections({ verdictType: 'soft-green', lang: RUBRIC_LANG, jobLines: jl, closeDecl: close(facts) }).filter((l) => l.startsWith('line 1 file'));
  assert.deepEqual(after, ['line 1 file — output/steps/1.json must exist, be complete JSON, and carry text']);
});

test('the call: the POC wording, one retry on a malformed reply, no repair; a second malformed reply fails', async () => {
  assert.match(notePrompt([{ n: 1, text: 'a' }]), /^THE JOB:\nLINE 1: a\n\nFor EACH line answer ONE question: does the line also ask for written words/);
  assert.equal(decideNote('{"lines":[{"line":1,"writtenWords":"maybe"}]}', [{ n: 1 }]), null);
  assert.equal(decideNote('```json\n{"lines":[]}\n```', [{ n: 1 }]), null, 'no repair');
  let n = 0;
  const loops = (replies) => () => ({ run: async () => ({ text: replies[Math.min(n++, replies.length - 1)], metrics: { costUsd: 0.001, unpricedRounds: 0 } }) });
  const ok = await runNoteAsk({ lines: [{ n: 1, text: 'a' }], createLoop: loops(['nope', '{"lines":[{"line":1,"writtenWords":"yes"}]}']) });
  assert.equal(ok.state, 'answered');
  assert.equal(ok.answers.get(1), 'yes');
  assert.equal(n, 2);
  n = 0;
  const bad = await runNoteAsk({ lines: [{ n: 1, text: 'a' }], createLoop: loops(['nope']) });
  assert.equal(bad.state, 'failed');
  assert.equal(n, 2);
});
