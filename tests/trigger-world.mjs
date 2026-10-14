// Shared fixture for the trigger suites (PANEL-BUILD.md T addendum, G.11). NOT named test-*.mjs (node's glob).
// A scratch HOME (the run-list home), an injectable clock, a real runs.jsonl writer, signed specs on disk laid out
// the way a panel run is, and a panel server over real HTTP. Nothing here touches ~/.config/bareloop.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPanelServer } from '../src/panel/server.js';
import { appendRun } from '../src/runlist.js';
import { jobSpecHash } from '../src/job.js';
import { ANTH_CFG } from './helpers.js';

/** @type {string[]} */ const dirs = [];
test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
export const tmp = (p = 'tw-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

/** a home holding the keys file and config.json with one ticked, priced model line */
export function keysHome() {
  const d = tmp('tw-home-');
  writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 });
  writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG));
  return d;
}

/** a fake clock the test moves by hand */
export function clock(start = Date.UTC(2026, 9, 14, 12, 0, 0)) {
  let t = start;
  const now = () => t;
  now.set = (ms) => { t = ms; };
  now.add = (ms) => { t += ms; };
  return now;
}

/** a valid signed spec: plain-files rubric (`files: true`) or a repo-shaped deterministic job */
export function specOf({ job = 'sched-job', files = false, goal = 'summarise the input', cap = 1.5, input = null } = {}) {
  return {
    schema: 'job-v1', job, description: 'd', provider: 'anthropic-api', model: 'claude-sonnet-5', budgetUsd: cap, maxWallMs: 600000,
    writeScope: files ? ['output/'] : ['src/'], goal, verdictType: files ? 'soft-green' : 'green',
    close: [{ name: 'suite-green', cmd: 'npm test', expect: 0, sha256: 'a'.repeat(64) }],
    tools: ['read', 'grep', 'write', 'edit'], escalation: { mode: 'decision-ready' },
    // a signed rubric job always names its judge (a reuse of one without would pin it and change the workflow key)
    ...(files ? { judge: { provider: 'anthropic-api', model: 'claude-sonnet-5' } } : {}),
    inputs: [{ n: 1, label: files ? 'notes' : 'repo', value: input ?? (files ? '/tw/in/notes.txt' : '/tw/repo') }],
  };
}

/**
 * One listed run, laid out the way a panel run is: the spine at `<out>/source-seed/<job>-bareloop/u-<runid>.jsonl`, the
 * signed spec at `<out>/resolved-spec.json`. `accepted` appends an honoured door-decision accept.
 */
export function makeRun(home, { runid, spec, outcome = 'green', accepted = false, at = '2026-10-01T10:00:00.000Z' }) {
  const out = tmp('tw-out-');
  const into = join(out, 'source-seed');
  const dir = join(into, `${spec.job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ source: '/tw/in', destination: 'src/' }));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const sh = jobSpecHash(spec);
  const ts = (n) => `2026-10-01T10:0${n}:00.000Z`;
  const recs = [
    { type: 'job-start', job: spec.job, specHash: sh, budgetUsd: spec.budgetUsd, shape: 'plan', goal: spec.goal, ts: ts(0), seq: 1 },
    { type: 'worker-round', kind: 'turn', costUsd: 0.5, ts: ts(1), seq: 2 },
    { type: 'job-end', outcome, spentUsd: 0.5, spendComplete: true, ts: ts(5), seq: 3 },
  ];
  if (accepted) recs.push({ type: 'door-decision', decision: 'accept', honoured: true, ts: ts(6), seq: 4 });
  const spine = join(dir, `u-${runid}.jsonl`);
  writeFileSync(spine, `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(spine, old, old);
  appendRun({ at, runid, job: spec.job, spine, patient: null, via: 'run-u' }, { home });
  return { out, spine, specHash: sh };
}

/** a panel server over real HTTP on a scratch home; `post`/`get` carry the human-click token. */
export async function panel({ home, env = {}, spawnFn } = {}) {
  const h = home ?? keysHome();
  const { close, port, token } = await createPanelServer({ port: 0, env, home: h, sessionsRoot: tmp('tw-sess-'), ...(spawnFn ? { spawnFn } : {}) });
  test.after(() => close());
  const base = `http://127.0.0.1:${port}`;
  const hdr = { 'content-type': 'application/json', 'x-bareloop-token': token };
  return {
    home: h,
    noToken: async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.status; },
    get: async (p) => { const r = await fetch(`${base}${p}`, { headers: hdr }); return { status: r.status, body: await r.json() }; },
    post: async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: hdr, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; },
  };
}
