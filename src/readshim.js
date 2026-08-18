// THE READ SHIM (L1 pointer + L4 cap) — a per-worker delivery ledger over the
// read tool. Flag-gated OFF by default; nothing here runs unless `readShim` is
// set on the run (src/planrun.js wires it, src/run.js plumbs it).
//
// The measured shape ($0 replay, 1,844 real `shell_read` actions from 143
// archived gate audits, cap 24,576 B):
//   - 48% of all reads re-read a file that had not changed since the worker
//     last saw it — those bytes are already in the transcript, re-sent and
//     re-billed every round after.
//   - cap + pointer, keyed on WHAT WAS DELIVERED: 51,853,154 → 17,834,409 bytes
//     (65.6% saved) with ZERO untruthful responses.
//   - cap + pointer, keyed on PATH+HASH (the naive design): 8.2 points cheaper
//     and **250 untruthful responses** — median 73,348 bytes hidden each, 234 of
//     them over 10 KB, worst case a worker holding 24,576 of 105,426 bytes told
//     "unchanged, you already have it". That is BA-17 read-blinding, and the
//     extra savings ARE the lie.
//
// So the ledger keys on DELIVERY, never on the path's content hash alone: a
// pointer is legal only once every byte of the CURRENT content has been handed
// over. A partly-seen file gets its next unseen slice instead — the response the
// naive design converts into a lie (194 of them across the corpus).
//
// What the shim can and cannot claim, stated plainly: it is truthful about what
// THIS SEAM delivered. The underlying tool applies its own `maxBytes` bound and
// says so in its own notice; the shim treats that returned text as the content,
// because it is exactly what the worker gets. It never claims the worker holds
// bytes the tool itself withheld.
//
// L2 (ship a diff when the content changed) is deliberately NOT here: it never
// fired on the real corpus, is proven synthetically only, and was worth 3–5% on
// the money replay. It needs its own eval before it earns a seam.

import { createHash } from 'node:crypto';

/** The delivery cap, in bytes. Equal to `NATIVE_READ_CAP` by construction — the
 * native path's CLI display bound and this cap bound the SAME seam, so one
 * number keeps them from double-truncating each other (see planrun's wiring). */
export const READ_SHIM_CAP = 24 * 1024;

/** F19 at the bound rather than the verb (the NATIVE_READ_STRATEGY precedent):
 * a cap the worker does not know about is a worker that reads the same file
 * three times wondering why it keeps starting over. It states the bound, what a
 * re-read does, and the two verbs that read a symbol whole — the capability the
 * cap makes mandatory (G1). */
export const READ_SHIM_STRATEGY = '\nREAD LIMIT: a shell_read of a file over 24KB returns only the next 24KB of it, followed by a notice saying which bytes you got. This is NOT the whole file. Reading the same path again continues where the last read stopped, and once you hold all of it a re-read says so instead of re-sending the bytes. To read a function IN FULL, use ctx_recall(<symbol>) then ctx_get(<pointer>) — that returns the entire function however large its file is. To locate a line, use shell_grep(<pattern>). Never try to understand a large file by reading it whole.';

/** A slice that ends the file needs no steer — the worker has it all now. */
const doneNotice = (start, total) =>
  `\n\n[bareloop: bytes ${start}-${total} of ${total} shown — the rest of this file, which you had not seen. You now hold all of it.]`;

/** The capped-slice notice. TRUSTED framing (the `bareloop:` prefix, the same
 * register as the native truncation notice): a worker that reads this as
 * untrusted spill goes hunting instead of aiming, which is the failure BA-17
 * already paid for. It names the two verbs that read a symbol IN FULL, because a
 * capped worker with no way to aim is read-blinding on purpose — G1 in
 * `validatePlan` makes sure those verbs are actually granted. */
const capNotice = (start, end, total) =>
  `\n\n[bareloop: bytes ${start}-${end} of ${total} shown — this read is capped at ${READ_SHIM_CAP} bytes. `
  + 'To read a specific function IN FULL use ctx_recall(<symbol>) then ctx_get(<pointer>); to find a line use shell_grep(<pattern>). '
  + `Reading this path again continues from byte ${end}.]`;

/** The pointer. Legal ONLY when the ledger says every current byte was handed
 * over — the one claim this module exists to keep honest. */
const pointer = (path, total) =>
  `[bareloop: ${path} is unchanged since you read it — you already hold all ${total} bytes of it. Nothing new to show.]`;

/** A UTF-8 sequence split across a slice boundary decodes to a replacement
 * character on BOTH sides — the byte is then delivered twice and read as
 * garbage once. Walk back to the last lead byte instead. `end` moves by at most
 * 3, which no cap this module ships can drive to zero progress. */
function utf8Boundary(buf, end) {
  if (end >= buf.length) return buf.length;
  let e = end;
  while (e > 0 && (buf[e] & 0xc0) === 0x80) e--;
  return e;
}

/**
 * Wrap a read tool with the delivery ledger. MUTATES `tool.execute` and returns
 * the tool, which is safe because the caller builds fresh tool objects per
 * worker (`createShellTools()` inside `mkWorker`) — so the ledger's lifetime is
 * one worker, matching the fresh-Loop-per-step reset the replay segmented on.
 * A process-wide ledger would carry one step's coverage into the next step's
 * transcript, which never held those bytes.
 * @param {{name: string, execute: (args: any) => Promise<any>}} tool the read tool
 * @param {{cap?: number}} [opts] `cap`: delivery bound in bytes (the shipped
 *   value is `READ_SHIM_CAP`; the option exists so the native path can pin the
 *   two bounds to one number rather than two constants drifting apart).
 * @returns {{name: string, execute: (args: any) => Promise<any>}} the same tool
 */
export function wrapReadTool(tool, { cap = READ_SHIM_CAP } = {}) {
  const inner = tool.execute;
  /** path → what the worker has been handed of the CURRENT content.
   * @type {Map<string, {hash: string, total: number, delivered: number}>} */
  const ledger = new Map();

  tool.execute = async (/** @type {any} */ args) => {
    const path = typeof args?.path === 'string' ? args.path : null;
    const r = await inner(args);
    // Anything that is not text (or a call with no path to key on) is the tool's
    // own business — pass it through and record nothing. A throw never reaches
    // here at all: the worker gets the failure, and the ledger stays clean of a
    // path nobody ever received bytes for.
    if (path === null || typeof r !== 'string') return r;

    const buf = Buffer.from(r, 'utf8');
    const total = buf.length;
    const hash = createHash('sha256').update(buf).digest('hex');
    const seen = ledger.get(path);
    // Same content as last time — and only then does coverage mean anything.
    // Any change (grown, shrunk, edited) resets to zero: coverage that survives
    // a content change is the masking direction, because a file that shrank
    // under stale coverage would answer as "fully delivered".
    const start = seen && seen.hash === hash ? seen.delivered : 0;

    if (start >= total) {
      ledger.set(path, { hash, total, delivered: total });
      return pointer(path, total);
    }
    const end = utf8Boundary(buf, Math.min(start + cap, total));
    ledger.set(path, { hash, total, delivered: end });
    const slice = buf.subarray(start, end).toString('utf8');
    // A first read that fits under the cap is the tool's own bytes, untouched —
    // no notice, no reframing. That is the overwhelming majority of reads, and
    // it keeps the shim invisible where it buys nothing.
    if (start === 0 && end === total) return slice;
    return slice + (end < total ? capNotice(start, end, total) : doneNotice(start, total));
  };
  return tool;
}
