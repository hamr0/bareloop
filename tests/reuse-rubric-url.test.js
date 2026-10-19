// A Reuse (and so a scheduled fire, which is exactly a Reuse) of a green RUBRIC job whose Inputs line 1 is a URL or file must take the
// rubric/files path, decided from the signed spec's verdict type; a repo job still has its line 1 proven as a repo. Live failure
// 2026-10-19: Reuse of flight-revised was refused at $0 with "the repo must be an absolute path". No model is reached (bad key, fake fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthorRoutes } from '../src/panel/authorroutes.js';
import { parseInputs } from '../src/jobblock.js';
import { ANTH_CFG } from './helpers.js';
import { makeRun, panel, specOf, tmp } from './trigger-world.mjs';

function badKeyHome() {
  const d = tmp('rru-home-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=bad key\n', { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}
const URL_LINE = 'page: https://www.google.com/travel/flights?q=x';
const deps = { fetchUrl: async () => ({ ok: false, error: 'no network in tests' }) };

test('POST start: Reuse of a green rubric job whose line 1 is a URL starts a session (no repo-path refusal)', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g1', spec: specOf({ job: 'flight-revised', files: true, input: 'https://www.google.com/travel/flights?q=x' }), outcome: 'green' });
  const p = await panel({ home, sessionDeps: deps });
  const pre = (await p.get('/api/author/start-from?runid=g1')).body;
  const r = await p.post('/api/author/start', { ...pre.card, startFrom: 'g1', inputs: URL_LINE, destination: tmp('rru-dest-'), capUsd: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reuse, true);
  await p.post(`/api/author/${r.body.sessionId}/abandon`, {});
});

test('POST start: Reuse of a green REPO job still refuses a line 1 that is not a repo path', async () => {
  const home = badKeyHome();
  makeRun(home, { runid: 'g2', spec: specOf({ job: 'repo-job' }), outcome: 'green' });
  const p = await panel({ home, sessionDeps: deps });
  const pre = (await p.get('/api/author/start-from?runid=g2')).body;
  const r = await p.post('/api/author/start', { ...pre.card, startFrom: 'g2', inputs: URL_LINE, destination: 'src/', capUsd: 1 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /repo must be an absolute path/);
});

test('startSession (the scheduled fire\'s shared start): a rubric URL reuse is not refused; a repo reuse with a URL is', async () => {
  const routes = createAuthorRoutes({ port: 1, token: 'tok', home: badKeyHome(), sessionsRoot: tmp('rru-sess-'), sessionDeps: deps });
  const card = { jobName: 'flight-revised', provider: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-5', jobText: '1. read the page', inputs: URL_LINE, destination: tmp('rru-dest-'), capUsd: 1 };
  const ip = parseInputs(card.inputs);
  assert.ok(ip.ok);
  const rubricSpec = specOf({ job: 'flight-revised', files: true, input: 'https://www.google.com/travel/flights?q=x' });
  const ok = await routes.startSession({ ...card, checkType: 'rubric' }, { spec: rubricSpec, workflowKey: 'k' }, ip.inputs, { headless: true });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const bad = await routes.startSession({ ...card, checkType: 'rubric' }, { spec: specOf({ job: 'repo-job' }), workflowKey: 'k' }, ip.inputs, { headless: true });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /repo must be an absolute path/);
});
