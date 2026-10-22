// Real archived runs for the learnings tests (tests/fixtures/learn/README.md says how they were cut): the spine records
// buildCards reads, and the gate-audit allow write/edit rows. Never authored; a test that edits one says so.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSpineText } from '../src/legs.js';
import { buildCards } from '../src/learn.js';

export const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'learn');
export const MANIFEST = JSON.parse(readFileSync(join(FIX, 'manifest.json'), 'utf8'));

/** @param {string} id @returns {{events: any[], audit: any[], workdir: string|null, job: string}} */
export function loadRun(id) {
  const events = parseSpineText(readFileSync(join(FIX, `${id}.jsonl`), 'utf8')).records;
  const ap = join(FIX, `${id}-audit.jsonl`);
  const audit = existsSync(ap) ? readFileSync(ap, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { events, audit, workdir: MANIFEST[id].patient ?? null, job: MANIFEST[id].job };
}

/**
 * Build a run's cards from its fixture; `over` replaces any input.
 * @param {string} id @param {Record<string, any>} [over]
 */
export function cardsOf(id, over = {}) {
  const r = loadRun(id);
  return buildCards({ runid: id, events: r.events, audit: r.audit, workdir: r.workdir, ...over });
}
