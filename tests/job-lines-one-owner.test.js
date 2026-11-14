// One owner for the job lines the person SEES (live run mwgp0au6): after an Agree that replaced "not a red-eye", the answers message, the plan card, the persisted card.json and the box a
// Revise reopens all read the check list's rebuilt lines, never the lines typed at the start. A re-draft from the reopened box asks nothing for that rule.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { parseMapAnswer } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { lookFactOf } from '../src/inputlook.js';
import { ANTH_CFG } from './helpers.js';

const CLOSE_DECL = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8')).closeDecl;

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'part5');
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'jlo-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const rawReal = readFileSync(join(FX, 'mve5y8fa.draft-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.label === 'page-map').raw;
const page = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const m = JSON.parse(rawReal);
m.facts.find((f) => f.name === 'departure time').reading = { op: 'between', lo: '05:00', hi: '23:59' };
const kept = applyPageRules(page, /** @type {any} */ (parseMapAnswer(JSON.stringify(m))).mapping, spec.jobLines);
const LOOK_FACTS = kept.facts.map((f) => lookFactOf(f, 'flights'));
const READ = 'departure time between 05:00 and 23:59';
const JOB = '1. List 3 flights from Boston to Chicago\n~ under $450\n~ not a red-eye';
/** a real signed declaration shape (run mv5bk400's), cut to this one-line job, so the session can reach `prepared` and write card.json */
const decl = () => { const c = JSON.parse(JSON.stringify(CLOSE_DECL)); c.stages = c.stages.slice(0, 2); c.stages[1].params.parts = [{ text: 'under 120 words', class: 'countable', check: 'maxWords', value: 120 }]; return { stages: c.stages, notes: [] }; };
const PLAN = { goal: 'List flights.', checks: [{ text: 'three flights are listed', fromLine: [1] }], notChecked: [], questions: [] };

function sessionOver(jobText, extra = {}) {
  const sessionsRoot = extra.sessionsRoot ?? tmp('jlo-sess-');
  const home = tmp('jlo-home-');
  writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG));
  const file = join(tmp(), 'flights.txt');
  copyFileSync(join(FX, 'mve5y8fa.flights.txt'), file);
  /** @type {any[]} */ const legs = [];
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'flights' }], look: { facts: LOOK_FACTS, prose: [], notFound: [], dropped: [] } } };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'jlo-job', jobText, inputs: `flights: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: true, declaration: decl(), genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }; },
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
    ...extra.deps,
  });
  const sessionDir = () => join(sessionsRoot, readdirSync(sessionsRoot)[0]);
  return { session, legs, sessionsRoot, sessionDir };
}
const seen = (/** @type {any} */ msg) => JSON.stringify(msg);

test('Agree on "not a red-eye": every view the person sees holds the agreed words, none holds the old ones', async () => {
  const { session, legs, sessionDir } = sessionOver(JOB);
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  session.send('agree');
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'));
  // the answers message
  const answered = session.state.messages.filter((x) => /Your answers are in/.test(x.text ?? ''));
  assert.equal(answered.length, 1);
  assert.doesNotMatch(seen(answered[0]), /red-eye/, 'the answers message');
  assert.match(seen(answered[0]), new RegExp(READ), 'the answers message');
  // every plan card the chat shows
  for (const msg of session.state.messages.filter((x) => x.plan)) assert.doesNotMatch(seen(msg), /red-eye/, 'a plan card');
  // the card the page reopens, in memory
  assert.equal(session.state.card.jobText, `1. List 3 flights from Boston to Chicago\n~ under $450\n~ ${READ}`);
  session.signPrepare();
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase)));
  assert.equal(session.state.phase, 'prepared', `${session.state.phase} / ${session.state.error}`);
  assert.deepEqual(legs[0].jobLines[0].rules, ['under $450', READ]);
  // the final plan card (the signed close's) and the signed jobLines
  for (const msg of session.state.messages.filter((x) => x.plan)) assert.doesNotMatch(seen(msg), /red-eye/, 'a plan card after drafting');
  // the card on disk (what Reuse reopens)
  const disk = JSON.parse(readFileSync(join(sessionDir(), 'card.json'), 'utf8'));
  assert.doesNotMatch(disk.jobText, /red-eye/, 'card.json');
  assert.match(disk.jobText, new RegExp(READ), 'card.json');
});

test('Revise after Agree reopens with the agreed words and a re-draft from them asks nothing for that rule', async () => {
  const first = sessionOver(JOB);
  assert.ok(await until(() => first.session.state.pendingAsk?.kind === 'answer'));
  first.session.send('agree');
  assert.ok(await until(() => first.session.state.pendingAsk?.kind === 'menu'));
  const reopened = first.session.state.card.jobText;
  assert.doesNotMatch(reopened, /red-eye/);
  const id = readdirSync(first.sessionsRoot)[0];
  const again = sessionOver(reopened, { sessionsRoot: first.sessionsRoot, deps: { carryFrom: id, carryKind: 'revise' } });
  const state = await until(() => ['answer', 'menu'].includes(again.session.state.pendingAsk?.kind));
  assert.ok(state, `${again.session.state.phase} / ${again.session.state.error}`);
  assert.equal(again.session.state.pendingAsk.kind, 'menu', `asked again: ${again.session.state.pendingAsk?.question}`);
});
