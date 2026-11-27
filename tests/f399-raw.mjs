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

import { existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * A REAL archived run (a fixture folder holding `resolved-spec.json`, optional `draft-log.jsonl`, `u-<id>.jsonl`, optional gate-audit) laid out the way a panel session is, in a scratch HOME.
 * `mutate` edits the parsed records first (a planted record or a planted file path); `files` writes planted delivered files into the scratch dir and points the `destination-written` records at them.
 * @param {{fixture: string, id: string, job: string, mutate?: (recs: any[]) => any[], source?: Record<string, any>, spineName?: string}} o
 */
export function realWorld({ fixture, id, job, mutate = (r) => r, source = { kind: 'folder', source: '/x', destination: '/y' }, spineName }) {
  const root = track(mkdtempSync(join(tmpdir(), 'f399r-')));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session');
  const into = join(out, 'source-seed');
  const dir = join(into, `${job}-bareloop`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify(source));
  const src = join(FX, fixture);
  const names = readdirSync(src);
  const specName = names.find((n) => n.endsWith('resolved-spec.json')) ?? 'resolved-spec.json';
  copyFileSync(join(src, specName), join(out, 'resolved-spec.json'));
  if (names.includes('draft-log.jsonl')) copyFileSync(join(src, 'draft-log.jsonl'), join(out, 'draft-log.jsonl'));
  const sp = spineName ?? `u-${id}.jsonl`;
  const recs = readFileSync(join(src, sp), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const spine = join(dir, `u-${id}.jsonl`);
  writeFileSync(spine, `${mutate(recs).map((r) => JSON.stringify(r)).join('\n')}\n`);
  const ga = `u-${id}-gate-audit.jsonl`;
  if (names.includes(ga)) copyFileSync(join(src, ga), join(dir, ga));
  appendRun({ at: '2026-11-13T07:34:26.189Z', runid: id, job, spine, patient: null, via: 'run-u' }, { home });
  return { home, opts: { home }, root, dir, spine, runid: id, session: out };
}

/**
 * Point each `destination-written` record (in order) at a planted file in `dir`, with the planted bytes' size and sha256. A planted copy of a real run's output.
 * @param {any[]} recs @param {string} dir @param {Record<string, string|Buffer>[]|(string|Buffer)[]} contents one file's bytes per destination-written record, in order
 */
export function plantDelivered(recs, dir, contents) {
  mkdirSync(dir, { recursive: true });
  let k = 0;
  return recs.map((r) => {
    if (r.type !== 'destination-written') return r;
    const body = /** @type {string|Buffer} */ (contents[k]);
    k += 1;
    mkdirSync(join(dir, String(k)), { recursive: true });
    const path = join(dir, String(k), String(r.path).split('/').pop() ?? 'x');
    writeFileSync(path, body);
    return { ...r, path, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') };
  });
}
export { existsSync };
