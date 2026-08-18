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
// L2 (ship a diff when the content changed) is here, under the SAME flag and
// deliberately narrow. It never fired on the real corpus and was worth 3–5% on
// the money replay, so it is built to be worthless-but-harmless rather than
// clever: it fires only where the ledger already proves the worker holds the
// complete previous version, and only when the diff is smaller than the slice
// it would replace. A diff is a statement ABOUT bytes the worker has — assert
// it over bytes it never had and you have re-invented the path+hash lie in a
// costlier form, because a worker told "line 900 changed" about a file it only
// ever saw 24 KB of has no way to notice it was told a fiction.

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

/** The diff's own TRUSTED framing, same `bareloop:` register as the notices
 * above. It says what the payload IS (a diff, not the file) and what it is
 * against (the copy the worker already holds), because a worker that reads a
 * hunk as the file's contents has been read-blinded by a saving. */
const diffNotice = (path, total) =>
  `[bareloop: ${path} changed since you read it. Below is a DIFF against the version you already hold IN FULL — not the file. `
  + "Lines starting '-' were removed, '+' were added, ' ' are unchanged context; '@@ -a +b @@' gives the line numbers in the old and new file. "
  + `Apply it to the copy you have and you hold the current ${total} bytes; there is nothing else to read.]`;

/** Lines of unchanged context on each side of a hunk — enough to place the
 * change without re-sending the file around it. */
const DIFF_CONTEXT = 2;

/** The LCS table is old-lines × new-lines cells. Bounded because this runs
 * INSIDE a tool call the worker is waiting on: a 20k-line file rewritten whole
 * is 400M cells, which is a stall and a heap spike in exchange for a diff that
 * would blow the size bound anyway. Over the bound we decline and re-deliver —
 * the same answer, reached without the arithmetic. */
const DIFF_CELL_BOUND = 1_000_000;

/**
 * A line-based diff of `oldText` → `newText`, or null if it cannot be produced
 * within `maxBytes`. Stdlib only, and deliberately not byte-compatible with
 * GNU `diff -u`: hunk headers here are plain 1-based `-start,count +start,count`
 * with no attempt to match GNU's empty-range convention, because the reader is
 * a model reading prose, not `patch`.
 *
 * The byte budget is enforced WHILE rendering, not checked afterwards, so an
 * enormous diff is abandoned rather than built and then thrown away.
 * @param {string} oldText
 * @param {string} newText
 * @param {number} maxBytes
 * @returns {string|null}
 */
function lineDiff(oldText, newText, maxBytes) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // Common head and tail come off first: real edits touch a fraction of a file,
  // and trimming is what keeps the quadratic middle small enough to be legal.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const ar = a.slice(head, a.length - tail);
  const br = b.slice(head, b.length - tail);
  if (ar.length * br.length > DIFF_CELL_BOUND) return null;

  // Longest common subsequence over the changed middle, classic DP.
  const w = br.length + 1;
  const dp = new Uint32Array((ar.length + 1) * w);
  for (let i = ar.length - 1; i >= 0; i--) {
    for (let j = br.length - 1; j >= 0; j--) {
      dp[i * w + j] = ar[i] === br[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  /** @type {{t: string, line: string, ai: number, bi: number}[]} */
  const rows = [];
  let ai = 0, bi = 0;
  const push = (/** @type {string} */ t, /** @type {string} */ line) => {
    rows.push({ t, line, ai, bi });
    if (t !== '+') ai++;
    if (t !== '-') bi++;
  };
  for (let k = 0; k < head; k++) push(' ', a[k]);
  let i = 0, j = 0;
  while (i < ar.length && j < br.length) {
    if (ar[i] === br[j]) { push(' ', ar[i]); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { push('-', ar[i]); i++; }
    else { push('+', br[j]); j++; }
  }
  while (i < ar.length) { push('-', ar[i]); i++; }
  while (j < br.length) { push('+', br[j]); j++; }
  for (let k = a.length - tail; k < a.length; k++) push(' ', a[k]);

  // Group the changed rows into hunks, each padded with context; two changes
  // closer than twice the context share one hunk rather than repeating lines.
  const changed = rows.map((r, k) => (r.t === ' ' ? -1 : k)).filter((k) => k >= 0);
  if (changed.length === 0) return null;
  /** @type {[number, number][]} */
  const hunks = [];
  for (const k of changed) {
    const last = hunks[hunks.length - 1];
    if (last && k - last[1] <= DIFF_CONTEXT * 2 + 1) last[1] = k;
    else hunks.push([k, k]);
  }

  let out = '';
  let bytes = 0;
  const emit = (/** @type {string} */ s) => {
    bytes += Buffer.byteLength(s, 'utf8');
    out += s;
    return bytes <= maxBytes;
  };
  for (const [lo, hi] of hunks) {
    const from = Math.max(0, lo - DIFF_CONTEXT);
    const to = Math.min(rows.length - 1, hi + DIFF_CONTEXT);
    let aCount = 0, bCount = 0;
    for (let k = from; k <= to; k++) {
      if (rows[k].t !== '+') aCount++;
      if (rows[k].t !== '-') bCount++;
    }
    if (!emit(`@@ -${rows[from].ai + 1},${aCount} +${rows[from].bi + 1},${bCount} @@\n`)) return null;
    for (let k = from; k <= to; k++) if (!emit(`${rows[k].t}${rows[k].line}\n`)) return null;
  }
  return out;
}

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
  /** path → what the worker has been handed of the CURRENT content. `full` is
   * the delivered text itself, kept ONLY while the worker holds the whole file
   * (null otherwise) because that is the only state a diff is legal from.
   *
   * MEMORY COST, stated rather than waved at: one copy of every fully-delivered
   * file, for the lifetime of one worker. The ceiling is real but it is not a
   * new one — those exact bytes are already sitting in the worker's transcript,
   * where they are the expensive copy (they are billed every round; this one is
   * billed never). A partly-delivered file stores nothing, so the pathological
   * case — a worker paging through many huge files — is precisely the case that
   * holds no copies. The map dies with the worker along with the rest of the
   * ledger; nothing here is process-wide.
   * @type {Map<string, {hash: string, total: number, delivered: number, full: string|null}>} */
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
    const end = utf8Boundary(buf, Math.min(start + cap, total));

    // L2, THE DIFF LEVER. Two guards, both refusals rather than adjustments:
    //   - `seen.full !== null` IS the coverage guard: the previous bytes are
    //     retained only when every one of them was delivered, so a partly-seen
    //     old version has nothing to diff against and re-delivers from 0.
    //   - the budget is the slice this diff REPLACES, `end - start` bytes of a
    //     fresh capped re-delivery. Bounding by the cap alone would let a diff
    //     be several times a small file and still ship; bounding by the slice
    //     makes "smaller than what it replaces" true by construction, and is
    //     never looser than the cap.
    // A consequence worth naming rather than tuning away: the framing itself is
    // ~350 bytes, so a file smaller than that can never produce a legal diff and
    // always re-delivers whole. That is the rule working, not a gap — a diff of
    // a 78-byte file costs more than the file.
    //
    // A rendered diff is always COMPLETE — the renderer returns the whole thing
    // or null, never a prefix — which is what licenses the ledger line below:
    // the worker holds the new content whole, so the next unchanged read is a
    // truthful pointer. Anything less than complete falls through to the slice
    // path and records only what that path actually handed over.
    if (seen && seen.hash !== hash && seen.full !== null) {
      const d = lineDiff(seen.full, r, Math.max(0, (end - start) - Buffer.byteLength(diffNotice(path, total), 'utf8') - 2));
      if (d !== null) {
        ledger.set(path, { hash, total, delivered: total, full: r });
        return `${diffNotice(path, total)}\n\n${d}`;
      }
    }

    if (start >= total) {
      ledger.set(path, { hash, total, delivered: total, full: r });
      return pointer(path, total);
    }
    ledger.set(path, { hash, total, delivered: end, full: end === total ? r : null });
    const slice = buf.subarray(start, end).toString('utf8');
    // A first read that fits under the cap is the tool's own bytes, untouched —
    // no notice, no reframing. That is the overwhelming majority of reads, and
    // it keeps the shim invisible where it buys nothing.
    if (start === 0 && end === total) return slice;
    return slice + (end < total ? capNotice(start, end, total) : doneNotice(start, total));
  };
  return tool;
}
