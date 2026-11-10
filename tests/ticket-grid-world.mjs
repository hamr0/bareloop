// R8 (piece 10): the ticket grid's scratch world. NOT named test-*.mjs (node's glob). REAL archived ticket spines (tests/fixtures/ticket-grid: mw6lmvdg = stopped, #17, two steps, a replan; mw3gso0m =
// passed, #7, one step, six close stages), laid out the way a panel run is under ONE job name in a scratch home, plus run-list rows for tickets the job's filter skipped (no spine; a `settled`
// event carries the words, exactly as `run-u` writes it). Never writes outside the scratch dir.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun, appendRunEvent, runlistPath } from '../src/runlist.js';

export const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ticket-grid');
export const JOB = 'tk-grid';
export const REAL = {
  mw6lmvdg: { at: '2026-11-07T16:09:40.948Z', ticket: 17 },
  mw3gso0m: { at: '2026-11-05T11:30:00.000Z', ticket: 7 },
};
const DEAD = 2 ** 22 + 12345;

/**
 * @param {{ skipped?: Array<{runid: string, ticket: number, at: string, words: string}>, real?: string[], refused?: boolean }} [o]
 */
export function makeGridWorld(o = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ticket-grid-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  for (const id of o.real ?? Object.keys(REAL)) {
    const { at, ticket } = REAL[/** @type {keyof typeof REAL} */ (id)];
    const out = join(root, `session-${id}`);
    const into = join(out, 'source-seed');
    const dir = join(into, `${JOB}-bareloop`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'folder', source: '/x', destination: '/y' }));
    copyFileSync(join(FX, `${id}.resolved-spec.json`), join(out, 'resolved-spec.json'));
    copyFileSync(join(FX, `u-${id}.jsonl`), join(dir, `u-${id}.jsonl`));
    appendRun({ at, runid: id, job: JOB, spine: join(dir, `u-${id}.jsonl`), patient: null, via: 'run-u', pid: DEAD, ticket }, { home });
  }
  for (const s of o.skipped ?? []) {
    appendRun({ at: s.at, runid: s.runid, job: JOB, spine: join(root, `no-spine-${s.runid}.jsonl`), patient: null, via: 'run-u', pid: DEAD, ticket: s.ticket }, { home });
    appendRunEvent({ runid: s.runid, type: 'settled', by: s.runid, reason: 'skipped', words: s.words, spentUsd: 0, spendComplete: true, at: s.at }, { home });
  }
  // the two REAL rows hamr's panel listed for a ticket job that read no ticket (src/panel fixture r7-sched-refused.jsonl, copied from his runs.jsonl): a run row + its `settled` event, no spine on disk
  if (o.refused) {
    for (const line of readFileSync(join(FX, 'r7-sched-refused.jsonl'), 'utf8').split('\n').filter(Boolean)) {
      const x = JSON.parse(line);
      if (x.type === undefined) { x.job = JOB; x.spine = join(root, `no-spine-${x.runid}.jsonl`); }
      appendFileSync(runlistPath(home), `${JSON.stringify(x)}\n`);
    }
  }
  return { home, root };
}
