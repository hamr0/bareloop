// The files that sit beside a run's spine, found the one way (panel and CLI both ask here): the source
// door's manifest, and the signed spec the run's latest leg ran under. Moved out of src/panel/server.js so
// `bareloop export` and the panel share ONE spelling (PRD v1.114). Pure reads, $0.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { legsOf } from './legs.js';
import { jobSpecHash } from './job.js';

/**
 * `<out>/source-<seed>/<job>-bareloop/u-<runid>.jsonl` -> the two files an
 * authoring session leaves BESIDE that layout — `<out>/resolved-spec.json`
 * (the signed spec `--spec`/a JOBS-table row ran) and
 * `<out>/source-<seed>/source.json` (the source front door's manifest) —
 * verified against `src/userrun.js`'s own construction (`specWorkdir = join(into,
 * 'tree')`, `spineDir = join(wd, '..', target.spine)`, both `--spec` and the
 * `pulselog-person-strict` JOBS-table row read `into` the same way) and a real
 * archived run (pulselog-person-live-2, run mu2p83go): `dirname(spine)` is
 * `<into>/<job>-bareloop`, `dirname(dirname(spine))` is `<into>` itself
 * (`source-<seed>`, carrying `source.json`), and `dirname(dirname(dirname(spine)))`
 * is `<out>` (carrying `resolved-spec.json`).
 *
 * Only resolves when `<into>`'s own name starts with `source-` — the one
 * shape marker this convention always carries — and each file is checked to
 * actually exist before being handed back; any other spine layout (the bundle
 * `spine.jsonl`, a JOBS-table row whose workdir has no source-seed copy, e.g.
 * `litectx-u`) returns both fields `null`, never a guessed path (build spec
 * item 2, 2026-09-25: "don't search the disk broadly — fall through").
 * @param {string} spinePath
 * @returns {{ specPath: string|null, sourceJsonPath: string|null }}
 */
export function sourceNearSpine(spinePath) {
  const into = dirname(dirname(spinePath)); // <into>/<job>-bareloop/u-x.jsonl -> <into>
  if (!basename(into).startsWith('source-')) return { specPath: null, sourceJsonPath: null };
  const sourceJsonPath = join(into, 'source.json');
  const specPath = join(dirname(into), 'resolved-spec.json'); // <into> -> <out>
  return {
    specPath: existsSync(specPath) ? specPath : null,
    sourceJsonPath: existsSync(sourceJsonPath) ? sourceJsonPath : null,
  };
}
/**
 * The signed spec a run's LATEST leg ran under — the `resolved-spec*.json` beside the run whose hash is the one its
 * latest `job-start` carries (the same lookup `resumePlanFor` does). `null` = no such file.
 * @param {{ spine: string }} row
 * @param {any[]} records
 * @returns {{spec: any, specPath: string, specHash: string}|null}
 */
export function signedSpecForRun(row, records) {
  const jobStart = (legsOf(records).findLast((l) => l.jobStart !== null) ?? null)?.jobStart ?? null;
  if (!jobStart || typeof jobStart.specHash !== 'string') return null;
  const near = sourceNearSpine(row.spine);
  if (!near.specPath) return null;
  const dir = dirname(near.specPath);
  /** @type {string[]} */
  let names = [];
  try { names = readdirSync(dir).filter((n) => n === 'resolved-spec.json' || /^resolved-spec-r\d+\.json$/.test(n)); } catch { names = []; }
  for (const n of names) {
    let spec;
    try { spec = JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { continue; }
    if (!spec || typeof spec !== 'object') continue;
    if (jobSpecHash(spec) === jobStart.specHash) return { spec, specPath: join(dir, n), specHash: jobStart.specHash };
  }
  return null;
}
