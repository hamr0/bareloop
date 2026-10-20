// PRD v1.106 Part 5 test world: the two REAL archived runs (tests/fixtures/part5, copied unmodified from hamr's own panel sessions) laid out
// the way a panel-authored run is, in a scratch dir, with an injected scratch HOME. mvdg1xo3 = red, 2 plan steps, 8 graded tries and one cut off;
// mve5y8fa = green, one try, ends at the review door. Never writes outside the scratch dir.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRun } from '../src/runlist.js';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'part5');
export const RUNS = { mvdg1xo3: 'flights-bos-ord', mve5y8fa: 'flight-idea1' };

/**
 * @returns {{ home: string, out: (id: string) => string, spine: (id: string) => string }}
 */
export function makePart5World() {
  const root = mkdtempSync(join(tmpdir(), 'part5-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  for (const [id, job] of Object.entries(RUNS)) {
    const out = join(root, `session-${id}`);
    const into = join(out, 'source-seed');
    const dir = join(into, `${job}-bareloop`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(into, 'source.json'), JSON.stringify({ kind: 'folder', source: '/x', destination: '/y' }));
    copyFileSync(join(FX, `${id}.resolved-spec.json`), join(out, 'resolved-spec.json'));
    copyFileSync(join(FX, `${id}.draft-log.jsonl`), join(out, 'draft-log.jsonl'));
    copyFileSync(join(FX, `u-${id}.jsonl`), join(dir, `u-${id}.jsonl`));
    copyFileSync(join(FX, `u-${id}-gate-audit.jsonl`), join(dir, `u-${id}-gate-audit.jsonl`));
    appendRun({
      at: '2026-10-18T06:28:06.963Z', runid: id, job, spine: join(dir, `u-${id}.jsonl`), patient: null, via: 'run-u',
    }, { home });
  }
  const spineOf = (/** @type {string} */ id) => join(root, `session-${id}`, 'source-seed', `${RUNS[/** @type {keyof typeof RUNS} */ (id)]}-bareloop`, `u-${id}.jsonl`);
  return { home, out: (id) => join(root, `session-${id}`), spine: spineOf };
}
