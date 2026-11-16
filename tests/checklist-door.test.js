// The one check list at both doors: the panel keeps the list in the drafting log (kind `ledger` per row at build and at the end, `ledger-try` per try), and the author CLI builds the same list with no ask.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { LEDGER_TOOL } from '../src/checklist.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'checklist-door-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const keysHome = () => { const d = tmp('checklist-door-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 15); }); return fn(); };
const ok = { text: '', error: null, msgs: [], metrics: { costUsd: 0.002, unpricedRounds: 0 } };

test('panel door: the list is built once with its call, every row is in the drafting log at build and at the end, each try is logged, and the card is the close\'s', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const sessionsRoot = tmp('checklist-door-sess-');
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], prose: [], notFound: [], dropped: [] } } };
  /** @type {string[]} */ const drafterPrompts = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'checklist-door-job', jobText: '1. Find the latest release heading',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    lookFn: async () => survey,
    ledgerGenerate: async (m, tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [{ line: 1, kind: 'count', min: 1, max: 1 }] }); return ok; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'Find the latest release heading.', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    generate: async (m, tools) => {
      drafterPrompts.push(m[0].content);
      // the drafter's reply is ROW EDITS (src/rowedit.js): the first try sends one edit the page cannot prove (refused alone), the revise sends none
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: drafterPrompts.length === 1 ? [{ op: 'add', kind: 'phrase', line: 1, name: 'made up', source: 'Changelog', words: ['zzz'] }] : [] });
      return ok;
    },
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  // the model's own plan is the goal only; the card draws the block's rows (hamr 2026-11-12, session smwe2qz5g3xrq: it used to show none of them)
  // pick A (hamr 2026-11-15, 545f13f8): the phrase "## [" is in no job text, so it is NOT job-derived: no fact row is built on the card; it waits under Suggested with its Add
  assert.deepEqual(session.state.pendingAsk.plan.checkItems.map((/** @type {any} */ c) => c.text).filter((/** @type {string} */ t) => /^fact · /.test(t)), [], 'no fact row is job-derived on the confirm card');
  const items = session.state.pendingAsk.plan.checkItems;
  assert.equal(items.filter((/** @type {any} */ c) => c.key === 'L1.$floor' && c.by === 'default').length, 1, 'the line\'s floor row is on the card');
  assert.equal(items.filter((/** @type {any} */ c) => c.key === 'J.$guard.changed-from-seed' && c.by === 'default').length, 1, 'the guard is one job-level row on the card');
  assert.equal(items.filter((/** @type {any} */ c) => c.key === 'J.$fence').length, 1, 'the write fence is one job-level row');
  assert.equal(items.filter((/** @type {any} */ c) => c.key === 'L1.$cited' && c.by === 'default').length, 1, 'with no job-derived fact the line is a text line: its `$` cited default shows instead of the fact');
  assert.equal(items.length, 4, 'the cited default, the floor, the guard and the fence: no row the list does not hold');
  // N-1: the result count of 1 is not in the job line; the fact on its line is built, so code can build it and it waits under Suggested (with its Add), not checked
  assert.deepEqual(session.state.pendingAsk.plan.suggested.map((/** @type {any} */ x) => x.text), ['fact · release heading — phrase, must say "## [", quoted from "Changelog"']); // the result count of 1 no longer waits here: with no job-derived fact the line is a text line (`$` cited default shown) and the count is not built
  session.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase)));
  assert.equal(session.state.phase, 'prepared', `${session.state.phase} / ${session.state.error}`);
  // the draft readout (hamr 2026-11-15) rides on the final plan message, once, above the card: the signed spec's own words, the session's hash and its round count
  const planMsgs = session.state.messages.filter((/** @type {any} */ m) => m.kind === 'plan');
  assert.equal(planMsgs.length, 1);
  assert.match(planMsgs[0].readout.text, /^DRAFT READOUT \u2014 NOT SIGNED \u2014 job checklist-door-job\n/);
  assert.match(planMsgs[0].readout.text, /Plan hash: abc123def4567890/);
  assert.match(planMsgs[0].readout.text, /\(line 1\) .*Find the latest release heading\n {5}writes: output\/steps\/1\.json/);
  assert.equal(planMsgs[0].readout.heads.length, 6, 'the header line, INPUTS, STEPS, WRITE FENCE, NOT CHECKED and JOB LINES (no answers were asked)');
  // invariant 5: no injected text restates the list of checks (the drafter sees the job, the look and the inputs, never the rows)
  assert.doesNotMatch(drafterPrompts[0].split('INPUT "Changelog"')[0], /THE LIST OF CHECKS|result count|\$ default|! fact/);
  assert.equal(drafterPrompts.length, 2, 'a refused edit starts exactly one revise; the empty reply settles it');
  const dir = join(sessionsRoot, readdirSync(sessionsRoot)[0]);
  const log = readFileSync(join(dir, DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const rows = log.filter((e) => e.kind === 'ledger');
  const built = rows.filter((e) => e.phase === 'built');
  const final = rows.filter((e) => e.phase === 'final');
  assert.ok(built.length > 0 && built.length === final.length, 'each row at build and at the end');
  assert.ok(built.every((e) => e.key && e.rowKind && e.from && e.by && e.state));
  assert.equal(final.find((e) => e.key === 'L1.fact.release heading').state, 'suggested'); // pick A: not job-derived, so it is offered under Suggested
  assert.equal(final.find((e) => e.rowKind === 'count').state, 'not-checked'); // pick A: with no job-derived fact on the line the results count is no longer built (a direct result of the ruling)
  const tries = log.filter((e) => e.kind === 'ledger-try');
  assert.equal(tries.length, 2);
  assert.deepEqual(tries[0].refused.map((x) => x.op), ['add']);
  assert.match(tries[0].refused[0].reason, /not in the input/);
  assert.deepEqual([tries[0].kept, tries[1].kept, tries[1].refused.length], [0, 0, 0]);
  assert.ok(log.some((e) => e.label === 'ledger-suggest'), 'the list call is a booked call in the draft log');
});

test('panel door Add/Drop: a Suggested phrase brings the line back to a facts line and the count back (offered, then built); Drop puts it back (hamr 2026-11-15, live run mwi76vh8)', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const sessionsRoot = tmp('checklist-door-sess-');
  const guard = { name: 'changed-from-seed', kind: 'files-changed', params: { requireNonEmpty: true, allowPrefixes: ['output/'] } };
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [{ line: 1, name: 'release heading', shape: 'phrase', source: 'Changelog', words: ['## ['] }], prose: [], notFound: [], dropped: [] } } };
  /** @type {string[]} */ const drafterPrompts = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'checklist-door-job', jobText: '1. Find the latest release heading',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    lookFn: async () => survey,
    ledgerGenerate: async (m, tools) => { await tools.find((t) => t.name === LEDGER_TOOL).execute({ extra: [{ line: 1, kind: 'count', min: 1, max: 1 }] }); return ok; },
    confirmGenerate: async (_c, tools) => { await tools[0].execute({ goal: 'Find the latest release heading.', checks: [], notChecked: [], questions: [] }); return { text: '', error: null, cost: 0.0005 }; },
    generate: async (m, tools) => {
      drafterPrompts.push(m[0].content);
      // the drafter's reply is ROW EDITS (src/rowedit.js): the first try sends one edit the page cannot prove (refused alone), the revise sends none
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: drafterPrompts.length === 1 ? [{ op: 'add', kind: 'phrase', line: 1, name: 'made up', source: 'Changelog', words: ['zzz'] }] : [] });
      return ok;
    },
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  const plan = () => session.state.pendingAsk.plan;
  const keys = () => plan().checkItems.map((/** @type {any} */ c) => c.key);
  const sugg = () => plan().suggested.map((/** @type {any} */ x) => x.key);
  const dir = join(sessionsRoot, readdirSync(sessionsRoot)[0]);
  const log0 = readFileSync(join(dir, DRAFT_LOG_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  // before Add: the phrase is Suggested, the line is a text line (cited default shown), the count is Not checked with the true reason (a fact exists, only Suggested)
  assert.deepEqual(sugg(), ['L1.fact.release heading']);
  assert.ok(keys().includes('L1.$cited'));
  const countBefore = log0.filter((e) => e.kind === 'ledger' && e.phase === 'built' && e.rowKind === 'count').at(-1);
  assert.equal(countBefore.state, 'not-checked');
  assert.match(countBefore.reason, /add the suggested fact on this line/);
  assert.doesNotMatch(countBefore.reason, /has none/);
  // Add on the phrase: built by agent, the line is a facts line again (no cited default), the count is offered under Suggested
  assert.deepEqual(session.rowEdit('add', 'L1.fact.release heading'), { ok: true });
  assert.equal(plan().checkItems.find((/** @type {any} */ c) => c.key === 'L1.fact.release heading')?.by, 'agent');
  assert.ok(!keys().includes('L1.$cited'));
  assert.match(plan().checkItems.find((/** @type {any} */ c) => c.key === 'L1.$floor').text, /finds facts/);
  assert.deepEqual(sugg(), ['L1.count.1-1']);
  // Add on the count: built, nothing left under Suggested
  assert.deepEqual(session.rowEdit('add', 'L1.count.1-1'), { ok: true });
  assert.ok(keys().includes('L1.count.1-1'));
  assert.deepEqual(sugg(), []);
  // Drop on the phrase: back to the first state, and the phrase can be added again
  assert.deepEqual(session.rowEdit('drop', 'L1.fact.release heading'), { ok: true });
  assert.ok(keys().includes('L1.$cited'));
  assert.deepEqual(sugg(), ['L1.fact.release heading']);
  assert.deepEqual(session.rowEdit('add', 'L1.fact.release heading'), { ok: true });
  assert.ok(!keys().includes('L1.$cited'));
});

// ---- the CLI door: the same list, no ask -------------------------------------------------------------------------------------------------------
import { phaseLine } from '../src/authorreadout.js';

test('CLI door: the author runner brings the list call its own model boundary (LEDGER_SYSTEM) for a rubric job and asks nothing for it; its phases read in plain lines', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'authorrun.js'), 'utf8');
  assert.match(src, /import \{ LEDGER_SYSTEM \} from '\.\/checklist\.js';/);
  assert.match(src, /ledgerGenerate: RUBRIC_FILES \? makeLoopGenerate\(provider, \{ system: LEDGER_SYSTEM, rates: authorPrice\?\.rates \?\? null \}\) : null,/);
  assert.equal(phaseLine('ledger-suggest', {}), '· suggesting extra checks from your input…');
  assert.equal(phaseLine('ledger-built', { rows: [{ rowKind: 'rule', state: 'built' }, { rowKind: 'fact', state: 'not-checked' }, { rowKind: 'floor', state: 'built' }] }), '· the list of checks: 3 row(s), 1 not checked');
  assert.equal(phaseLine('draft-ledger-try', { label: 'author', kept: 4, refused: [{}, {}] }), '·   author: 4 edit(s) kept, 2 refused');
  assert.equal(phaseLine('draft-ledger', { rows: [{ state: 'built' }, { state: 'not-checked' }, { state: 'not-checked' }] }), '· the list at the end: 1 built, 2 not checked');
});
