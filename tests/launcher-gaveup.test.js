// L fix — the launcher's "need you" is the panel's Needs-you: runs tagged `needs` PLUS schedules that gave up (runsListPayload.gaveUp).
// Real door, fake session factory that always fails the install, scratch HOME; the launcher reads it with the panel's scheduler off.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_DOOR } from '../src/kinds.js';
import { buildHeader } from '../src/launcher.js';
import { createStarter } from '../src/panel/schedulestart.js';
import { createScheduler } from '../src/panel/scheduler.js';
import { getStartFrom, runsListPayload } from '../src/panel/server.js';
import { keysForDoor, keysHome as kHome } from '../src/keysfile.js';
import { rowsForHome } from '../src/providerrows.js';
import { jobSpecHash } from '../src/job.js';
import { fireWorld, makeRun, specOf, tmp } from './trigger-world.mjs';

const MIN = 60_000;
// the fixtures' own dates are 2026-10-01; the door's 60-day TTL is read against THIS clock, not the machine's
const NOW = Number(process.env.GAVEUP_TEST_NOW) || Date.UTC(2026, 9, 2);
test('launcher header: one run needing Accept plus one gave-up schedule reads "2 need you", the panel\'s own count', async () => {
  const w = await fireWorld({});
  let n = 0;
  const root = tmp('lg-sess-');
  const startSession = async (_card, reuse) => {
    n += 1;
    const outDir = join(root, `s${n}`);
    mkdirSync(outDir, { recursive: true });
    const resolvedSpecPath = join(outDir, 'resolved-spec.json');
    writeFileSync(resolvedSpecPath, JSON.stringify(reuse.spec));
    return { ok: true, session: { state: { id: `s${n}`, phase: 'install-needed', specHash: jobSpecHash(reuse.spec), resolvedSpecPath, outDir }, abandon() {} } };
  };
  const envNow = () => keysForDoor({ env: {}, keysHome: w.home }).env;
  const starter = createStarter({
    door: w.door, startSession, envNow, spawnFn: () => ({ unref() {}, once() { return this; } }), bareloopBin: '/x/bareloop.mjs', sessionsRoot: tmp('lg-root-'), home: w.home, childGraceMs: 40,
    rowsFor: () => rowsForHome(kHome(w.home), envNow()), startFrom: (runid) => getStartFrom(runid, { home: w.home }),
  });
  w.door.attachStarter(starter);
  const s = createScheduler({ door: w.door, now: w.now, intervalMs: 0 });
  for (let ms = 0; ms <= 200 * MIN; ms += 5000) { await s.tick(); w.now.add(5000); }
  // a second job's green rubric run waits for Accept
  const other = specOf({ job: 'other-job', files: true, input: '/tw/in/o.txt' });
  const r2 = makeRun(w.home, { runid: 'r2', spec: other, accepted: false, at: '2026-10-02T10:00:00.000Z' });
  appendFileSync(r2.spine, `${JSON.stringify({ type: REVIEW_DOOR, outcome: 'green', ts: '2026-10-01T10:05:30.000Z', seq: 9 })}\n`);
  const p = runsListPayload({ home: w.home, now: NOW, schedules: w.door });
  const panelCount = p.runs.filter((r) => typeof r.needs === 'string' && r.needs !== '').length + p.gaveUp.length;
  assert.equal(p.gaveUp.length, 1);
  assert.equal(panelCount, 2);
  const h = await buildHeader({ home: w.home, ports: [1], version: '0.0.0', nodeVersion: '22.1.0', timeoutMs: 100, now: NOW });
  assert.match(h.lines.at(-1), /· 2 need you ·/);
});
