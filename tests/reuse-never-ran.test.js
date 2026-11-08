// R9 9b.2 (fwd 7a98141, test/m13-p7-reuse.test.js): a run that ended BEFORE ITS FIRST STEP at $0 (refused before start: a refused run-start fetch, a locked-token look; or a skipped ticket) never ran its plan,
// so Reuse workflow with the job unchanged signs and goes with the signed job (reuse true, no drafting) instead of a paid redraft. A red run that DID run (it has a spine), a refusal that spent money,
// and a changed job still draft. The real panel server and a real signed spec; the model boundary stubbed. $0.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { appendRunEvent } from '../src/runlist.js';
import { neverRanPlan, getStartFrom } from '../src/panel/server.js';
import { readRunList } from '../src/runlist.js';
import { world, makeRepo, keysHome, draftSeams, draftSpec, makeRun, baseCard } from './flowtype-world.mjs';

async function setup(t) {
  const seen = {};
  const w = await world(t, { serve: false });
  const keys = keysHome(w.cfg);
  const repo = makeRepo(path.join(w.base, 'repo'));
  const card = baseCard({ source: repo, jobName: 'plain-job' });
  const spec = (await draftSpec(w, keys, card, null)).spec;
  const mk = (runid, outcome = 'green') => { const out = path.join(w.base, `o-${runid}`); mkdirSync(out); return makeRun(w.cfg, { runid, spec, card, outcome, out }); };
  mk('green01');
  mk('red01', 'cap-halt');
  // refused before start: a listed row and a `settled` event, NO spine on disk (what run-u leaves); skipped: the same with the other reason; a refusal that spent money: not this case
  const never = (runid, over = {}) => {
    const { spine } = mk(runid);
    rmSync(spine);
    appendRunEvent({ runid, type: 'settled', by: runid, reason: 'refused before start', words: 'Nothing spent.', spentUsd: 0, spendComplete: true, at: '2026-10-01T10:01:00.000Z', ...over }, { home: w.cfg });
  };
  never('refused1');
  never('skipped1', { reason: 'skipped', words: 'the ticket is closed' });
  never('paid1', { spentUsd: 0.5 });
  never('unknown1', { spendComplete: false });
  const srv = await world(t, { panel: { home: w.cfg, sessionDeps: draftSeams(seen) }, serve: true });
  return { w, srv, repo, card };
}
const start = (s, startFrom, over = {}) => s.srv.post('/api/author/start', { ...s.card, startFrom, ...over });

test('neverRanPlan: no spine + a leg-1 settled refused/skipped at exactly $0 and a complete spend; every other row is false', async (t) => {
  const s = await setup(t);
  const { rows, events } = readRunList({ home: s.w.cfg });
  const verdict = Object.fromEntries(rows.map((r) => [r.runid, neverRanPlan(events, r)]));
  assert.deepEqual(verdict, { green01: false, red01: false, refused1: true, skipped1: true, paid1: false, unknown1: false });
});

test('Must fail: start-from on a refused-before-start run says green (Run now) with the job unchanged; a red run that ran a step does not; a refusal that spent money does not', async (t) => {
  const s = await setup(t);
  const g = async (id) => (await s.srv.get(`/api/author/start-from?runid=${id}`)).body;
  assert.equal((await g('refused1')).green, true, 'refused before start: its signed job stands');
  assert.equal((await g('skipped1')).green, true, 'a skipped ticket ran no step either');
  assert.equal((await g('green01')).green, true);
  assert.equal((await g('red01')).green, false, 'a red run that ran drafts');
  assert.equal((await g('paid1')).ok, false, 'a refusal that spent money has no log and is not the never-ran case');
  assert.equal(getStartFrom('refused1', { home: s.w.cfg }).neverRan, true);
  assert.equal(getStartFrom('green01', { home: s.w.cfg }).neverRan, false);
});

test('Must fail: POST start on a refused-before-start run, job unchanged, signs the reused job (reuse true), keeping the origin name; red after a step drafts; a changed job drafts under a new name', async (t) => {
  const s = await setup(t);
  const refused = await start(s, 'refused1');
  assert.equal(refused.status, 200, JSON.stringify(refused.body));
  assert.equal(refused.body.reuse, true);
  await s.srv.post(`/api/author/${refused.body.sessionId}/abandon`, {});
  const skipped = await start(s, 'skipped1');
  assert.equal(skipped.body.reuse, true);
  await s.srv.post(`/api/author/${skipped.body.sessionId}/abandon`, {});
  const red = await start(s, 'red01');
  assert.equal(red.status, 200, JSON.stringify(red.body));
  assert.equal(red.body.reuse, false, 'red always drafts');
  await s.srv.post(`/api/author/${red.body.sessionId}/abandon`, {});
  const changed = await start(s, 'refused1', { jobText: `${s.card.jobText ?? 'do the thing'}\nand one more step`, jobName: 'plain-job-2' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.reuse, false, 'a changed job on a refused run drafts');
});
