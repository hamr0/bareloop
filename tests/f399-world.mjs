// F399 bug fixtures: ONE real archived run (trimmed copy under tests/fixtures/f399/<runid>: its spine and signed spec, copied unmodified from hamr's own panel session)
// laid out the way a panel-authored run is, in a scratch dir with an injected scratch HOME. Never writes outside the scratch dir.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { track } from './tmp-track.mjs';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'f399');
/** @param {string} runid @param {string} job @returns {{home: string, opts: {home: string}, spine: string, runid: string}} */
export function f399World(runid, job) {
  const root = track(mkdtempSync(join(tmpdir(), 'f399-')));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session');
  const into = join(out, 'source-seed');
  const dir = join(into, `${job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'folder', source: '/x', destination: '/y' }));
  copyFileSync(join(FX, runid, 'resolved-spec.json'), join(out, 'resolved-spec.json'));
  const spine = join(dir, `u-${runid}.jsonl`);
  copyFileSync(join(FX, runid, `u-${runid}.jsonl`), spine);
  appendRun({ at: '2026-11-01T08:00:00.000Z', runid, job, spine, patient: null, via: 'run-u' }, { home });
  return { home, opts: { home }, spine, runid };
}
