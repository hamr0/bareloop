// The Audit grid's test world: ONE real archived run (tests/fixtures/audit-grid, copied unmodified from hamr's own panel session of the live run
// mvtatlxw, job pulselog-strict-live-3) laid out the way a panel-authored run is, in a scratch dir with an injected scratch HOME.
// What it holds: a step retried once (zero-target-errors: try 1 red with 11 reasons, try 2 green), a fix part of four tries (the opening close red,
// two fix tries red, the fourth dropped by the provider: "socket hang up"), where no fix try ran all 8 declared checks (first-red-wins).
// Never writes outside the scratch dir.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'audit-grid');
export const RUNID = 'mvtatlxw';
const JOB = 'pulselog-strict-live-3';

/** @returns {{ home: string, opts: { home: string } }} */
export function makeAuditGridWorld() {
  const root = mkdtempSync(join(tmpdir(), 'audit-grid-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session');
  const into = join(out, 'source-seed');
  const dir = join(into, `${JOB}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'folder', source: '/x', destination: '/y' }));
  copyFileSync(join(FX, `${RUNID}.resolved-spec.json`), join(out, 'resolved-spec.json'));
  copyFileSync(join(FX, `u-${RUNID}.jsonl`), join(dir, `u-${RUNID}.jsonl`));
  copyFileSync(join(FX, `u-${RUNID}-gate-audit.jsonl`), join(dir, `u-${RUNID}-gate-audit.jsonl`));
  appendRun({
    at: '2026-10-29T08:45:59.252Z', runid: RUNID, job: JOB, spine: join(dir, `u-${RUNID}.jsonl`), patient: null, via: 'run-u',
  }, { home });
  return { home, opts: { home } };
}
