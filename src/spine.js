// The floor's event spine: append-only JSONL, one event per line (PRD §4).
// Single source for every UI — the panel is a pure observer of this file.
// Contract (carried from adaptlearn/relayfact — the pattern, not the code):
// `seq` is monotonic per spine, `ts` is stamped last and is always the final
// key, and consumers are pure listeners — nothing here reads the file back.
// Secrets never enter the spine (PRD §4): an append-only record that captures
// a key captures it forever.

import { appendFileSync } from 'node:fs';

/**
 * Create an emitter bound to one JSONL file.
 * @param {string} file absolute path; created on first emit
 * @param {{startSeq?: number}} [opts] `startSeq`: the last `seq` already IN the file, for a
 *   process that CONTINUES an existing spine (a resumed run appends to the dead run's own
 *   log — module C). `seq` is monotonic per SPINE, so a second series restarting at 1
 *   would give one append-only log two rows with the same number and silently break every
 *   reader that orders by it. Default 0: a fresh file, which is every other caller.
 * @returns {(type: string, data?: object) => object} emit — returns the event as written
 */
export function makeSpine(file, { startSeq = 0 } = {}) {
  let seq = typeof startSeq === 'number' && Number.isFinite(startSeq) && startSeq > 0 ? Math.floor(startSeq) : 0;
  return function emit(type, data = {}) {
    // type/seq/ts are the envelope's, by mechanism not comment: callers spread
    // foreign objects into events, and a payload that grows one of these keys
    // must never relabel or mis-stamp a row in the append-only record.
    const { type: _type, seq: _seq, ts: _ts, ...payload } = /** @type {Record<string, unknown>} */ (data);
    /** @type {Record<string, unknown>} */
    const ev = { type, ...payload, seq: ++seq };
    ev.ts = new Date().toISOString();
    appendFileSync(file, JSON.stringify(ev) + '\n');
    return ev;
  };
}
