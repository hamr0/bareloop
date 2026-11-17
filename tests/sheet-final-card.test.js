// S4 call sites, through the panel session over the REAL drafting path (authorCloseForJob -> authorClose, real check block, real bareguard builder, real seed read of the sheet stage), a scripted model:
//   the AI's `sheetChecks` become the signed sheet part and the list's rows; the FINAL card draws each `~` rule once with [you] / [agent] / [default] tags; Drop and Add on a final-card [agent] row cost $0 and call
//   no model seam (every seam counts its calls); the spec file and the hash come back from the gates; a Revise keeps a Drop of the very same check. Ported in spirit from fwdloop m16-am4-sheet-route.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { readSheetDropped, RECORD_FILE } from '../src/pickrecord.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'sheet-final-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const until = async (/** @type {() => boolean} */ fn, ms = 20000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

const W500 = [{ column: 'Amount', cmp: 'gt', value: 500 }];
const SUGGESTIONS = [
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'over', op: 'rows', where: W500, covers: [1] },
  { line: 1, rule: 'cells', table: 'Expenses', claim: 'total', op: 'sumIf', column: 'Amount', where: W500, covers: [] },
  { line: 1, rule: 'table', table: 'Expenses', op: 'noDuplicates', column: 'Date', covers: [] },
];
const okSigning = (/** @type {string} */ hash) => ({ ok: true, specHash: hash, seedRef: 'deadbeef', work: [], guards: [], stops: [], reds: [], refusal: null, gates: {} });

/** a session over the real expenses.csv, parked at the confirm menu, then signPrepare'd to the FINAL card */
async function finalCard(/** @type {{sessionsRoot?: string, home?: string, carryFrom?: string, hashes?: string[]}} */ o = {}) {
  const home = o.home ?? tmp('sheet-final-home-');
  if (!o.home) { writeFileSync(join(home, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(home, 'config.json'), JSON.stringify(ANTH_CFG)); }
  const file = join(tmp(), 'expenses.csv');
  copyFileSync(join(HERE, 'fixtures', 'sheets', 'expenses.csv'), file);
  const sessionsRoot = o.sessionsRoot ?? tmp('sheet-final-sess-');
  const calls = { look: 0, edit: 0, confirm: 0, generate: 0, ledger: 0 };
  let signs = 0;
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Expenses' }], look: { facts: [], prose: [], notFound: [], dropped: [], sheetAsks: [] } } };
  const PLAN = { goal: 'List the expenses over 500.', checks: [], notChecked: [], questions: [] };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'sheet-final-job', jobText: '1. List every expense over 500 and what they add up to\n~ Amount over 500', inputs: `Expenses: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home, sessionsRoot,
    ...(o.carryFrom ? { carryFrom: o.carryFrom, carryKind: 'revise' } : {}),
    generate: async () => { calls.generate += 1; throw new Error('no model call'); },
    lookFn: async () => { calls.look += 1; return survey; },
    ledgerGenerate: async () => { calls.ledger += 1; throw new Error('no ledger call'); },
    confirmGenerate: async (/** @type {any} */ _c, /** @type {any[]} */ tools) => { calls.confirm += 1; await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    editGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => {
      calls.edit += 1;
      await tools.find((t) => t.name === ROW_EDIT_TOOL).execute({ edits: [], sheetChecks: SUGGESTIONS });
      return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
    },
    prepareSigningFn: async () => { signs += 1; return signs === o.refuseNth ? { ok: false, reds: [], refusal: null, specHash: null } : okSigning(`hash${signs}`); },
  });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.signPrepare().ok, true);
  assert.ok(await until(() => ['prepared', 'refused', 'error'].includes(session.state.phase)), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.phase, 'prepared', String(session.state.error));
  const plan = () => /** @type {any} */ ([...session.state.messages].reverse().find((m) => m.kind === 'plan')).plan;
  const spec = () => JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
  return { session, calls, plan, spec, sessionsRoot, home, signs: () => signs };
}

test('the FINAL card of a sheet job: the `~` rule once as [you], the AI\'s other checks as [agent] rows with a Drop key, a [default] row; the signed close carries the sheet part, with the rows that point at it', async () => {
  const { session, plan, spec } = await finalCard();
  const p = plan();
  const checks = p.lines[0].checks;
  assert.deepEqual(checks.filter((/** @type {any} */ c) => c.by === 'you').map((/** @type {any} */ c) => c.key), ['L1.~1']);
  assert.equal(checks.filter((/** @type {any} */ c) => /Amount over 500/.test(c.name)).length, 1, 'the rule is shown once');
  const agent = checks.filter((/** @type {any} */ c) => c.by === 'agent');
  assert.equal(agent.length, 2, JSON.stringify(checks.map((/** @type {any} */ c) => [c.by, c.name])));
  assert.ok(agent.every((/** @type {any} */ c) => /^L1\.sheet\./.test(c.key)));
  assert.ok(checks.some((/** @type {any} */ c) => c.by === 'default' && c.key === 'L1.$sheet'));
  assert.equal(p.editable, true, 'the final sheet card offers Drop on the agent rows');
  assert.deepEqual(p.suggested ?? [], []);
  const s = spec();
  const part = s.closeDecl.stages.find((/** @type {any} */ x) => x.kind === 'rubric-step').params.parts.find((/** @type {any} */ x) => x.class === 'sheet');
  assert.ok(part, 'the signed close carries a sheet part');
  assert.deepEqual(part.checks.map((/** @type {any} */ c) => c.op).sort(), ['noDuplicates', 'rows', 'sumIf']);
  assert.ok(s.closeDecl.list.every((/** @type {any} */ r) => r.kind !== 'cited' || r.state !== 'built' || r.line !== 1), 'no built $cited row on a sheet line');
  assert.equal(JSON.stringify(s.closeDecl).includes('"check":"cited"'), false, 'no cited part on a sheet line');
  session.abandon();
});

test('Drop on a final [agent] row and Add are $0 (every model seam counted), the gates run again, Add restores the spec byte for byte, a [you] or [default] row says why it stays', async () => {
  const { session, calls, plan, spec, signs } = await finalCard();
  const before = readFileSync(session.state.resolvedSpecPath, 'utf8');
  const seams = { ...calls };
  const key = plan().lines[0].checks.find((/** @type {any} */ c) => c.by === 'agent' && /duplicate/.test(c.name)).key;
  const r = await session.finalEdit('drop', key);
  assert.deepEqual([r.ok, r.error], [true, undefined], JSON.stringify(r));
  assert.equal(signs(), 2, 'the signing gates ran again');
  assert.equal(session.state.specHash, 'hash2');
  assert.equal(spec().closeDecl.stages.find((/** @type {any} */ x) => x.kind === 'rubric-step').params.parts.find((/** @type {any} */ x) => x.class === 'sheet').checks.some((/** @type {any} */ c) => c.op === 'noDuplicates'), false);
  assert.equal(spec().closeDecl.list.find((/** @type {any} */ x) => x.key === key).state, 'dropped');
  assert.ok(!plan().lines[0].checks.some((/** @type {any} */ c) => c.key === key), 'off the card');
  assert.deepEqual(plan().suggested.map((/** @type {any} */ x) => x.key), [key], 'waiting under Suggested for Add');
  assert.deepEqual(readSheetDropped(join(dirname(session.state.resolvedSpecPath), RECORD_FILE))?.map((d) => d.check.op), ['noDuplicates'], 'the record a Revise reads');
  const back = await session.finalEdit('add', key);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(readFileSync(session.state.resolvedSpecPath, 'utf8'), before, 'Drop + Add: the signed spec file is byte-identical');
  assert.deepEqual(plan().suggested ?? [], []);
  assert.deepEqual(calls, seams, 'not one model seam was called by a Drop or an Add');
  const you = await session.finalEdit('drop', 'L1.~1');
  assert.deepEqual([you.ok, you.refused, you.error], [false, 'bad-row', 'that check comes from a rule you wrote; edit the job to change it']);
  assert.equal((await session.finalEdit('drop', 'L1.$sheet')).ok, false);
  assert.equal((await session.finalEdit('drop', 'L1.sheet.nope')).refused, 'bad-row');
  assert.equal(readFileSync(session.state.resolvedSpecPath, 'utf8'), before);
  session.abandon();
});

test('a Drop the gates refuse changes nothing: the spec file, the hash and the card stay, the refusal is plain words', async () => {
  const { session, plan } = await finalCard({ refuseNth: 2 });
  const before = readFileSync(session.state.resolvedSpecPath, 'utf8');
  const key = plan().lines[0].checks.find((/** @type {any} */ c) => c.by === 'agent').key;
  // the signing gates answer red on the second call (the first is the draft's own)
  const orig = session.state.specHash;
  const r = await session.finalEdit('drop', key);
  assert.equal(r.ok, false);
  assert.equal(r.refused, 'gates');
  assert.match(String(r.error), /^Dropping that check is refused: /);
  assert.equal(readFileSync(session.state.resolvedSpecPath, 'utf8'), before);
  assert.equal(session.state.specHash, orig);
  assert.ok(plan().lines[0].checks.some((/** @type {any} */ c) => c.key === key), 'the row is still on the card');
  // and the block still has it: an Add finds nothing to add
  assert.equal((await session.finalEdit('add', key)).ok, false);
  session.abandon();
});

test('over the real route: row-edit on the prepared sheet card answers 200 for a Drop and an Add, 400 in plain words for a [you] row', async () => {
  const { session, plan } = await finalCard();
  const routes = createAuthorRoutes({ port: 1, token: 'tok' });
  routes.sessions.set(session.id, session);
  const post = async (/** @type {any} */ body) => {
    /** @type {any} */ let out = null; let status = 0;
    const req = { method: 'POST', headers: { 'x-bareloop-token': 'tok', host: '127.0.0.1:1', 'content-type': 'application/json' } };
    const res = { writeHead(/** @type {number} */ s) { status = s; }, end(/** @type {string} */ txt) { out = JSON.parse(txt); } };
    assert.equal(routes.handle(req, res, `/api/author/${session.id}/row-edit`, body), true);
    await until(() => out !== null);
    return { status, out };
  };
  const key = plan().lines[0].checks.find((/** @type {any} */ c) => c.by === 'agent').key;
  const d = await post({ op: 'drop', key });
  assert.equal(d.status, 200, JSON.stringify(d.out));
  assert.deepEqual(plan().suggested.map((/** @type {any} */ x) => x.key), [key]);
  const a = await post({ op: 'add', key });
  assert.equal(a.status, 200, JSON.stringify(a.out));
  const you = await post({ op: 'drop', key: 'L1.~1' });
  assert.equal(you.status, 400);
  assert.equal(you.out.error, 'that check comes from a rule you wrote; edit the job to change it');
  session.abandon();
});

test('a Revise keeps a Drop of the very same check: the next draft (same suggestions) starts with it dropped and waiting under Suggested', async () => {
  const first = await finalCard();
  const key = first.plan().lines[0].checks.find((/** @type {any} */ c) => c.by === 'agent' && /duplicate/.test(c.name)).key;
  assert.equal((await first.session.finalEdit('drop', key)).ok, true);
  first.session.abandon();
  const next = await finalCard({ sessionsRoot: first.sessionsRoot, home: first.home, carryFrom: first.session.id });
  const p = next.plan();
  assert.ok(!p.lines[0].checks.some((/** @type {any} */ c) => /duplicate/.test(c.name)), 'the dropped check stays dropped');
  assert.equal(p.suggested.length, 1);
  assert.match(p.suggested[0].text, /duplicate/);
  assert.equal(p.suggested[0].dropped, true);
  assert.equal(next.spec().closeDecl.stages.find((/** @type {any} */ x) => x.kind === 'rubric-step').params.parts.find((/** @type {any} */ x) => x.class === 'sheet').checks.some((/** @type {any} */ c) => c.op === 'noDuplicates'), false);
  next.session.abandon();
});
