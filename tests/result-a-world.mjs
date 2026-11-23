// The Result tab A test world ("Result tab A + Job type everywhere", docs/product/ITEM33-BUILD.md): the REAL archived spine of hamr's live walk-branch review (run mwqnkvx5, a green repo review whose
// report holds 4 findings; tests/fixtures/result-a, trimmed of worker rounds only), laid out the way a panel-authored run is, in a scratch dir with an injected scratch HOME. A CHANGE run is tests/result-tab-world.mjs's mvkj03w7.
// Never writes outside the scratch dir.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';
import { track } from './tmp-track.mjs';

export const FX_A = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'result-a');

/**
 * @param {{ spine?: string, manifest?: Record<string, any> }} [o] `spine` = a spine file of FX_A to lay out (default the archived one); `manifest` = fields added to the run's `source.json` (the recorded range)
 * @returns {{home: string, root: string, runid: string, spine: string}}
 */
export function makeReviewWorld(o = {}) {
  const runid = 'mwqnkvx5';
  const root = track(mkdtempSync(join(tmpdir(), 'result-a-')));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const out = join(root, 'session-a');
  const into = join(out, 'source-seed');
  const dir = join(into, 'walk-branch-bareloop');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'repo', source: '/x', destination: 'docs/', ...(o.manifest ?? {}) }));
  copyFileSync(join(FX_A, 'mwqnkvx5.resolved-spec.json'), join(out, 'resolved-spec.json'));
  const spine = join(dir, `u-${runid}.jsonl`);
  copyFileSync(join(FX_A, o.spine ?? `u-${runid}.jsonl`), spine);
  appendRun({ at: '2026-11-21T16:59:31.097Z', runid, job: 'walk-branch', spine, patient: null, via: 'run-u' }, { home });
  return { home, root, runid, spine };
}
