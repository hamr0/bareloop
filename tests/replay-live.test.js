// scripts/replay-live.mjs --live-audit — the $0 replay must be able to show the
// panel's LIVE gate-audit fallback (resolveAuditPathForRow's during-run branch)
// mid-replay, then the finished sibling sidecar after the end; the default
// replay (no flag) is unchanged. Driven through the real script as a child
// process against a scratch HOME, read back through the real getRunAudit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunAudit } from '../src/panel/server.js';
import { readRunList } from '../src/runlist.js';

const SCRIPT = fileURLToPath(new URL('../scripts/replay-live.mjs', import.meta.url));
const T0 = Date.parse('2026-09-01T00:00:00.000Z');
const iso = (ms) => new Date(T0 + ms).toISOString();

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'replay-live-'));
  const spine = join(dir, 'u-src1.jsonl');
  // a 2s gap before job-end (speed 1 => a real 2s pause) so "mid-replay" is deterministic
  writeFileSync(spine, [
    { type: 'job-start', ts: iso(0), job: 'j' },
    { type: 'job-end', ts: iso(2000), outcome: 'green' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(dir, 'u-src1-gate-audit.jsonl'),
    `${JSON.stringify({ ts: iso(500), phase: 'gate', decision: 'allow', action: { type: 'read', path: '/x/a.txt' } })}\n`);
  return { dir, spine };
}

function run(args, home) {
  const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, HOME: home }, stdio: 'ignore' });
  const done = new Promise((res) => { child.on('exit', res); });
  return { child, done };
}

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => { setTimeout(r, 25); });
  }
  throw new Error('timed out waiting');
}

test('replay-live --live-audit: live fallback reads the sidecar mid-replay; sibling holds it after the end', async () => {
  const { dir, spine } = fixture();
  const home = mkdtempSync(join(tmpdir(), 'replay-home-'));
  const cfg = join(home, '.config', 'bareloop');
  const out = join(dir, 'out');
  const { done } = run([spine, out, '--speed', '1', '--live-audit'], home);

  const row = await until(() => readRunList({ home: cfg }).rows[0]);
  assert.ok(row.patient && row.patient.endsWith('-patient'), 'row carries the scratch patient dir');
  // mid-replay: job-end not written yet, no sibling sidecar, live path holds the file
  await until(() => existsSync(row.spine) && readFileSync(row.spine, 'utf8').includes('job-start'));
  assert.ok(!readFileSync(row.spine, 'utf8').includes('job-end'), 'still mid-replay');
  assert.ok(existsSync(join(row.patient, 'gate-audit.jsonl')));
  const mid = getRunAudit(row.runid, { home: cfg });
  assert.equal(mid.reason, null, `live fallback must find the sidecar mid-replay, got ${mid.reason}`);
  assert.equal(mid.rows.length, 1);

  await done;
  const sibling = row.spine.replace(/\.jsonl$/, '-gate-audit.jsonl');
  assert.ok(existsSync(sibling), 'end-of-run rename lands the sidecar at the sibling name');
  assert.ok(!existsSync(join(row.patient, 'gate-audit.jsonl')), 'the live copy was MOVED, not left behind');
  const end = getRunAudit(row.runid, { home: cfg });
  assert.equal(end.reason, null);
  assert.equal(end.rows.length, 1);
});

test('replay-live WITHOUT the flag is unchanged: patient null, sibling sidecar present from the start, no patient dir', async () => {
  const { dir, spine } = fixture();
  const home = mkdtempSync(join(tmpdir(), 'replay-home-'));
  const cfg = join(home, '.config', 'bareloop');
  const out = join(dir, 'out');
  const { done } = run([spine, out, '--speed', '1'], home);
  const row = await until(() => readRunList({ home: cfg }).rows[0]);
  assert.equal(row.patient, null);
  assert.ok(existsSync(row.spine.replace(/\.jsonl$/, '-gate-audit.jsonl')));
  await done;
  assert.deepEqual(readdirSync(out).filter((f) => f.endsWith('-patient')), []);
});
