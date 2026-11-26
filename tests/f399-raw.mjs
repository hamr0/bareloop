// F399 parity pins: shared scaffolding. `raw*` read a spine with NO reader in sight (plain JSON scans), so a parity test compares a view's fact against the record itself, never against the reader it is testing.
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { track } from './tmp-track.mjs';

export const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
/** @param {string} rel path under tests/fixtures @returns {any[]} */
export const spineAt = (rel) => readFileSync(join(FX, rel), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** @param {string} rel @returns {any} */
export const specAt = (rel) => JSON.parse(readFileSync(join(FX, rel), 'utf8'));
/** the records of the LAST leg (after the last `leg-resume` marker), by a plain scan @param {any[]} recs */
export const rawLeg = (recs) => { const i = recs.findLastIndex((r) => r.type === 'leg-resume'); return i < 0 ? recs : recs.slice(i); };
/** the last leg's final staged close, by a plain scan (not an already-green leg) @param {any[]} recs */
export const rawClose = (recs) => {
  const leg = rawLeg(recs);
  if (leg.findLast((r) => r.type === 'job-end')?.outcome === 'already-green') return leg.findLast((r) => r.type === 'close-precheck') ?? null;
  return leg.findLast((r) => (r.type === 'close-verdict' && Array.isArray(r.stages)) || r.type === 'outer-close') ?? null;
};

/**
 * A panel-authored run laid out in a scratch dir with a scratch HOME, from IN-MEMORY records and spec. Used where no real run has the case: the records are a real spine plus the planted ones, said in the test.
 * @param {{id: string, job: string, records: any[], spec: any, source?: Record<string, any>, at?: string}} o
 * @returns {{home: string, opts: {home: string}, dir: string, spine: string, runid: string}}
 */
export function world({ id, job, records, spec, source = { kind: 'folder', source: '/x', destination: '/y' }, at = '2026-11-01T08:00:00.000Z' }) {
  const root = track(mkdtempSync(join(tmpdir(), 'f399p-')));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session');
  const into = join(out, 'source-seed');
  const dir = join(into, `${job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify(source));
  writeFileSync(join(out, 'resolved-spec.json'), JSON.stringify(spec));
  const spine = join(dir, `u-${id}.jsonl`);
  writeFileSync(spine, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  appendRun({ at, runid: id, job, spine, patient: null, via: 'run-u' }, { home });
  return { home, opts: { home }, dir, spine, runid: id };
}
export { copyFileSync };
