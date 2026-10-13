// Run mv5bk400 (live, DeepSeek deepseek-flash, a rubric on a copy of CHANGELOG.md): the confirm turn showed THREE checks for
// line 1 ("text under 120 words", "every version quoted ... backed by a quote", "output/steps/1.json lists 3 releases") and the
// signed close had ONE stage for it; "lists 3 releases" had gone to the stage's free-text notes. Nothing counted the releases
// and nothing told the person. These tests pin the repair on the REAL signed close of that run (tests/fixtures/mv5bk400-resolved-spec.json,
// a byte copy): (a) a count of listed claims is a real check (bareguard min/max over a count the CODE takes); (b) a confirmed check
// that does not become a real check is moved to Not checked in code, the card after drafting is built from the close, and signing
// refuses when what was shown differs from what would run.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStage } from '../src/kinds.js';
import { proveRubricInputs } from '../src/source.js';
import {
  reconcileRubricPlan, planMatchesClose, checksOfClose, partSentence, rubricStepShapeReds, stepFileRel,
} from '../src/rubricstep.js';
import { confirmedBlock } from '../src/authorflow.js';
import { createSession } from '../src/panel/authorsession.js';
import { signRun } from '../src/panel/authorroutes.js';
import { ANTH_CFG } from './helpers.js';

// PART 1b (RF5): every prose step says what is not checked — its text
const TEXT_NOT_CHECKED = ['line 1: what the text says — you judge it at Accept', 'line 2: what the text says — you judge it at Accept'];
const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'rubric-sync-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const REAL = JSON.parse(readFileSync(join(HERE, 'fixtures', 'mv5bk400-resolved-spec.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

/** the checks the confirm turn showed for run mv5bk400 */
const CONFIRMED = [
  { text: 'text under 120 words', fromLine: [1] },
  { text: 'every version quoted from the changelog, backed by a quote from input 1', fromLine: [1] },
  { text: 'output/steps/1.json lists 3 releases', fromLine: [1] },
  { text: 'text under 80 words', fromLine: [2] },
];

test('the real signed close of mv5bk400 has no check that counts releases — the shape of the defect, on real data', () => {
  assert.equal(REAL.closeDecl.stages.length, 3);
  assert.equal(REAL.closeDecl.stages[1].name, 'line-1-versions-quoted-and-under-120-words');
  assert.deepEqual(REAL.closeDecl.stages[1].params.parts.map((p) => p.check), ['cited', 'maxWords']);
  assert.ok(!JSON.stringify(REAL.closeDecl.stages).includes('releases'), 'nothing in any stage counts releases');
  assert.ok(JSON.stringify(REAL.closeDecl.notes).includes('lists 3 releases'), 'it went to the free-text notes, which no card shows');
});

test('(b) reconcile: with the real mv5bk400 close, a confirmed check no part covers is MOVED to Not checked in the person\'s words, and the card lists only what the close runs', () => {
  const closeDecl = clone(REAL.closeDecl);
  // the composer says which confirmed checks its parts carry out: #1, #2 and #4 — not #3
  closeDecl.stages[1].params.parts[1].covers = [1];
  closeDecl.stages[1].params.parts[0].covers = [2];
  closeDecl.stages[2].params.parts[0].covers = [4];
  const rec = reconcileRubricPlan({ confirmed: CONFIRMED, notChecked: ['be friendly'], closeDecl });
  assert.deepEqual(rec.checkItems, [
    { text: 'every claim is backed by a quote copied from "Changelog"', fromLine: [1] },
    { text: 'the text is at most 120 words', fromLine: [1] },
    { text: 'the text is at most 80 words', fromLine: [2] },
  ]);
  assert.deepEqual(rec.moved.map((m) => m.text), ['output/steps/1.json lists 3 releases']);
  assert.deepEqual(rec.notChecked, ['be friendly', ...TEXT_NOT_CHECKED, 'line 1: output/steps/1.json lists 3 releases — nothing in this close counts it or checks it against a quote']);
  // and the card and the close agree
  assert.deepEqual(planMatchesClose(rec.checkItems, closeDecl), { ok: true });
});

test('(b) a composer that says nothing about covers drops NOTHING silently: every confirmed check lands in Not checked', () => {
  const rec = reconcileRubricPlan({ confirmed: CONFIRMED, notChecked: [], closeDecl: clone(REAL.closeDecl) });
  assert.equal(rec.moved.length, 4);
  assert.equal(rec.notChecked.length, 6, 'the 4 moved checks and the two prose steps\' "what the text says"');
  assert.ok(rec.notChecked.some((n) => n.includes('lists 3 releases')));
  assert.ok(rec.checkItems.every((c) => !c.text.includes('releases')));
});

test('(a) "lists 3 releases" becomes a REAL check: a minClaims part counts the claims under the input, and the card shows it as a check, not as Not checked', async () => {
  const closeDecl = clone(REAL.closeDecl);
  closeDecl.stages[1].params.parts.push({ text: 'lists 3 releases', class: 'countable', check: 'minClaims', source: 'Changelog', value: 3, covers: [3] });
  closeDecl.stages[1].params.parts[1].covers = [1];
  closeDecl.stages[1].params.parts[0].covers = [2];
  closeDecl.stages[2].params.parts[0].covers = [4];
  const rec = reconcileRubricPlan({ confirmed: CONFIRMED, notChecked: [], closeDecl });
  assert.deepEqual(rec.moved, []);
  assert.ok(rec.checkItems.some((c) => c.text === 'at least 3 claim(s) are listed under "Changelog"' && c.fromLine[0] === 1));
  assert.deepEqual(rec.notChecked, TEXT_NOT_CHECKED, 'only the prose steps\' own Not-checked lines');
  assert.equal(partSentence({ check: 'maxClaims', source: 'Changelog', value: 5 }), 'at most 5 claim(s) are listed under "Changelog"');
});

async function freeze() {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const r = await proveRubricInputs({ inputs: [{ n: 1, label: 'Changelog', value: file }], into: join(tmp(), 'seed') });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('unreachable');
  return { tree: r.prep.tree, seed: r.prep.manifest.seed, text: readFileSync(file, 'utf8') };
}
const stageOf = (parts) => ({ name: 'line-1', kind: 'rubric-step', params: { step: 1, parts } });
const writeStep = (f, body) => { mkdirSync(join(f.tree, 'output', 'steps'), { recursive: true }); writeFileSync(join(f.tree, stepFileRel(1)), JSON.stringify(body)); };
const claim = (i) => ({ claim: `release ${i}`, quote: 'Keep a Changelog' });

test('(a) minClaims / maxClaims at run time: the CODE counts the list, bareguard\'s min/max compares it; 2 of 3 is red naming both numbers, 3 is green, an absent list counts 0', async () => {
  const f = await freeze();
  const ctx = { workdir: f.tree, seedRef: f.seed, gapKeep: '' };
  const min3 = stageOf([{ text: 'lists 3 releases', class: 'countable', check: 'minClaims', source: 'Changelog', value: 3 }]);
  writeStep(f, { text: 'x', cites: { Changelog: [claim(1), claim(2)] } });
  let r = await runStage(min3, ctx);
  assert.equal(r.verdict, 'red');
  assert.deepEqual(r.gapLines, ['line 1: only 2 claim(s) are listed under "Changelog" in "cites", at least 3 are required'].map((l) => `line-1: ${l}`));
  assert.equal(r.detail.redCount, 1);
  writeStep(f, { text: 'x', cites: { Changelog: [claim(1), claim(2), claim(3)] } });
  assert.equal((await runStage(min3, ctx)).verdict, 'green');
  writeStep(f, { text: 'x', cites: {} });
  assert.match((await runStage(min3, ctx)).gapLines[0], /only 0 claim\(s\) are listed under "Changelog"/);
  const max2 = stageOf([{ text: 'at most 2', class: 'countable', check: 'maxClaims', source: 'Changelog', value: 2 }]);
  writeStep(f, { text: 'x', cites: { Changelog: [claim(1), claim(2), claim(3)] } });
  assert.match((await runStage(max2, ctx)).gapLines[0], /3 claims are listed under "Changelog" in "cites", at most 2 are allowed/);
  writeStep(f, { text: 'x', cites: { Changelog: [claim(1)] } });
  assert.equal((await runStage(max2, ctx)).verdict, 'green');
});

test('the shape: minClaims needs value and source; covers is distinct integers; the prompt numbers the confirmed checks so a part can cite them', () => {
  const bad = (parts) => rubricStepShapeReds({ step: 1, parts }, 'p').map((r) => r.path);
  assert.deepEqual(bad([{ text: 'x', class: 'countable', check: 'minClaims', value: 3 }]), ['p.parts[0].source']);
  assert.deepEqual(bad([{ text: 'x', class: 'countable', check: 'minClaims', source: 'C' }]), ['p.parts[0].value']);
  assert.deepEqual(bad([{ text: 'x', class: 'countable', check: 'minClaims', source: 'C', value: 3, covers: [1, 1] }]), ['p.parts[0].covers']);
  assert.deepEqual(bad([{ text: 'x', class: 'countable', check: 'minClaims', source: 'C', value: 3, covers: [3] }]), []);
  const block = confirmedBlock({ checks: [], checkItems: CONFIRMED, protections: [] }, { numbered: true });
  assert.match(block, /#3 \[line 1\] output\/steps\/1\.json lists 3 releases/);
  assert.doesNotMatch(confirmedBlock({ checks: [], checkItems: CONFIRMED, protections: [] }), /#3/);
});

// ── the sign-time invariant ──────────────────────────────────────────────────

function preparedSession(shown, closeDecl) {
  const dir = tmp('rubric-sync-sess-');
  const specPath = join(dir, 'resolved-spec.json');
  writeFileSync(specPath, JSON.stringify({ ...clone(REAL), closeDecl }));
  return { state: { phase: 'prepared', specHash: 'abc123', resolvedSpecPath: specPath, outDir: dir, steps: [], draftSpentUsd: 0, finalPlan: { checkItems: shown } } };
}

test('signRun REFUSES, spawning nothing, when the card showed a check the signed close does not run (the mv5bk400 drop) — and signs when card and close agree', () => {
  const closeDecl = clone(REAL.closeDecl);
  const real = checksOfClose(closeDecl).map((c) => ({ text: c.text, fromLine: [c.line] }));
  let spawned = 0;
  const o = { env: {}, spawnFn: () => { spawned += 1; return { unref() {} }; }, bareloopBin: '/x/bareloop.mjs', home: tmp('rubric-sync-home-') };
  // the old behaviour: the card still carries the confirmed check, the close does not
  const dropped = preparedSession([...real, { text: 'output/steps/1.json lists 3 releases', fromLine: [1] }], closeDecl);
  const refused = signRun(dropped, 'abc123', o);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /^The checks you were shown do not match the checks the signed close would run \(shown to you but not in the signed close: line 1: output\/steps\/1\.json lists 3 releases\)\. Nothing was signed — draft again\.$/);
  assert.equal(spawned, 0);
  assert.equal(dropped.state.phase, 'prepared', 'still unsigned');
  // the opposite drift: the close grew a check the card never showed
  const grown = clone(closeDecl);
  grown.stages[2].params.parts.push({ text: 'x', class: 'countable', check: 'maxLines', value: 3 });
  const g = signRun(preparedSession(real, grown), 'abc123', o);
  assert.equal(g.ok, false);
  assert.match(g.error, /in the signed close but not shown to you: line 2: the text is at most 3 lines/);
  // agreement signs
  const ok = signRun(preparedSession(real, closeDecl), 'abc123', o);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(spawned, 1);
});

// ── end to end through the session: the mv5bk400 shape ──────────────────────

function keysHome() {
  const d = tmp('rubric-sync-keys-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 15); }); return fn(); };

test('through the session: confirm shows 3 checks for line 1, the composer writes ONE stage (the mv5bk400 drop), and the card AFTER drafting lists "lists 3 releases" under Not checked — never as a check — and signing then works', async () => {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const plan = { goal: 'List the last 3 releases and summarize.', checks: CONFIRMED, notChecked: [], questions: [] };
  const closeDecl = clone(REAL.closeDecl);
  closeDecl.stages[1].params.parts[1].covers = [1];
  closeDecl.stages[1].params.parts[0].covers = [2];
  closeDecl.stages[2].params.parts[0].covers = [4];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'rubric-sync-session', jobText: '1. List the last 3 releases\n~ every version quoted\n~ under 120 words\n2. Write a one-paragraph summary\n~ under 80 words',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'out'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot: tmp('rubric-sync-sess-'),
    generate: async () => { throw new Error('no authoring model call'); },
    confirmGenerate: async (_c, tools) => { await tools[0].execute(plan); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async () => ({ ok: true, declaration: { stages: closeDecl.stages, notes: closeDecl.notes }, genreEnv: null, cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] }),
    prepareSigningFn: async () => ({ ok: true, specHash: 'abc123def4567890', seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} }),
  });
  assert.ok(await waitFor(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  const confirmedCard = session.state.pendingAsk.plan;
  assert.ok(confirmedCard.checkItems.some((c) => c.text.includes('lists 3 releases')), 'the confirm card DID show it as a check');
  session.signPrepare();
  assert.ok(await waitFor(() => ['prepared', 'refused', 'error'].includes(session.state.phase)));
  assert.equal(session.state.phase, 'prepared', `${session.state.phase} / ${session.state.error}`);
  const planBubbles = session.state.messages.filter((m) => m.kind === 'plan');
  assert.equal(planBubbles.length, 1, 'the confirm turn\'s drafter-worded bubble is gone: the code-worded card is the only plan on screen');
  const finalCard = planBubbles.at(-1);
  assert.match(finalCard.text, /checks the signed close will run/);
  const allChecks = finalCard.plan.lines.flatMap((l) => l.checks.map((c) => c.name));
  assert.ok(allChecks.length >= 3);
  assert.ok(!allChecks.some((n) => n.includes('releases')), `the dropped check must not be shown as a check: ${allChecks}`);
  assert.ok(finalCard.plan.notChecked.some((n) => n.includes('lists 3 releases')), 'it is listed under Not checked');
  assert.equal(session.state.finalPlan.moved.length, 1);
  // card == close, so signing is allowed
  const r = signRun(session, session.state.specHash, { env: {}, spawnFn: () => ({ unref() {} }), bareloopBin: '/x/bareloop.mjs', home: tmp('rubric-sync-home-') });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('partSentence is correct English for a count of one (run mv5e1ktb: "at most 1 lines")', () => {
  assert.equal(partSentence({ check: 'maxLines', value: 1 }), 'the text is at most 1 line');
  assert.equal(partSentence({ check: 'maxLines', value: 3 }), 'the text is at most 3 lines');
  assert.equal(partSentence({ check: 'maxWords', value: 1 }), 'the text is at most 1 word');
  assert.equal(partSentence({ check: 'minWords', value: 1 }), 'the text is at least 1 word');
  assert.equal(partSentence({ check: 'maxWords', value: 120 }), 'the text is at most 120 words');
});
