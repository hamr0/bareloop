// MCP + tickets piece 9 (R7): the scratch world of the schedule-on-the-card suites. NOT named test-*.mjs (node's glob). The REAL panel server (flowtype-world), the REAL card routes
// (`POST /api/author/start` .. `/sign`), a recorded spawn (no run starts), the model boundary stubbed (flowtype-world `draftSeams`, with the REAL spec hash), an injected schedule clock, a
// fake MCP server for the card's ticket-line proof (tests/fixtures/ticket-write-mcp.mjs) and ANOTHER, the ticket look's (tests/fixtures/fake-mcp-server.mjs, `ticketWorld`).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { appendMcpCheck } from '../src/mcpchecks.js';
import { jobSpecHash } from '../src/job.js';
import { createScheduler } from '../src/panel/scheduler.js';
import {
  world, makeRepo, keysHome, draftSeams, baseCard, until, FAKE_TOOLS,
} from './flowtype-world.mjs';
import { clock, makeRun, recordingSpawn } from './trigger-world.mjs';
import { ticketWorld, newestFirst, LIST } from './ticket-world.mjs';

export { LIST, newestFirst, until };

/** seams whose signing reports the spec's REAL hash (the real `prepareSigning` does), so the schedule's hash is the signed one */
function seams(seen) {
  const d = draftSeams(seen);
  const inner = d.prepareSigningFn;
  return { ...d, prepareSigningFn: async (o) => ({ ...(await inner(o)), specHash: jobSpecHash(o.spec) }) };
}

/**
 * @param {import('node:test').TestContext} t
 * @param {{ issues?: any[], start?: number }} [o] `issues` = what the ticket look's fake server lists; `start` = the schedule clock's start
 */
export async function cardWorld(t, o = {}) {
  const now = clock(o.start);
  const spawnFn = recordingSpawn();
  const seen = {};
  const w = await world(t, { panel: { sessionDeps: seams(seen), spawnFn, scheduleNow: now, schedulerIntervalMs: 0 } });
  keysHome(w.cfg);
  const oldHome = process.env.HOME;
  process.env.HOME = w.home;   // the card's ticket-line proof reads the person's MCP config from the process home
  t.after(() => { process.env.HOME = oldHome; });
  appendMcpCheck(w.cfg, { server: 'github', path: '~/.mcp.json', at: '2026-11-05T10:00:00Z', ok: true, tools: FAKE_TOOLS.map((name) => ({ name, hint: null })) });
  const repo = makeRepo(path.join(w.base, 'repo'));
  const tw = ticketWorld(t, { issues: o.issues ?? newestFirst(5), prefix: 'bareloop-r7-' });
  /** a scheduler over THIS panel's door whose ticket look reads the look's fake server */
  const scheduler = createScheduler({ door: w.srv.schedules, now, intervalMs: 0, mcpConfig: tw.configPath });
  t.after(() => scheduler.stop());
  const card = (over = {}) => baseCard({ source: repo, jobName: 'tk-job', flowType: 'tickets', mcp: 'github', inputs: `repo: ${repo}\nissues: ${LIST}`, ...over });

  /** the card's whole path: start, draft to the menu, sign-prepare, Sign & run. Returns what each step answered. */
  async function signCard(c) {
    const started = await w.post('/api/author/start', c);
    if (started.status !== 200) return { started };
    const id = started.body.sessionId;
    const get = async () => (await w.get(`/api/author/${id}`)).body.state;
    if (!started.body.reuse) {
      let st = await get();
      const t0 = Date.now();
      while (Date.now() - t0 < 8000 && !(st.pendingAsk?.kind === 'menu' || ['refused', 'error', 'prepared'].includes(st.phase))) { await new Promise((r) => { setTimeout(r, 20); }); st = await get(); }
      if (st.pendingAsk?.kind === 'menu') await w.post(`/api/author/${id}/sign-prepare`, {});
    }
    let st = await get();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && !['prepared', 'refused', 'error'].includes(st.phase)) { await new Promise((r) => { setTimeout(r, 20); }); st = await get(); }
    if (st.phase !== 'prepared') return { started, state: st };
    const signed = await w.post(`/api/author/${id}/sign`, { specHash: st.specHash });
    return { started, state: st, signed, spec: JSON.parse(readFileSync(st.resolvedSpecPath, 'utf8')) };
  }
  /** the job's schedule files */
  const dir = (job = 'tk-job') => path.join(w.cfg, 'triggers', job);
  return {
    w, now, spawnFn, scheduler, tw, repo, card, signCard, dir, door: w.srv.schedules, seen,
    /** one run row of the job, laid out the way a panel run is */
    run: (spec, over = {}) => makeRun(w.cfg, { runid: over.runid ?? 'r1', spec, ...over }),
  };
}
