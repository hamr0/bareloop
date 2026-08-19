// THE READ SHIM (L1 pointer + L4 cap) — a per-worker delivery ledger over the
// read tool. ARM-gated and OFF by default; nothing here runs unless `readShim`
// names an arm on the run (src/planrun.js wires it, src/run.js plumbs it). WHICH
// levers an arm carries is `readShimArm` below, and the reasoning for each arm's
// membership sits with it.
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
// L2 (ship a diff when the content changed) is here — its own lever, live under
// the `'diff'` and `true` arms — and deliberately narrow. It never fired on the real corpus and was worth 3–5% on
// the money replay, so it is built to be worthless-but-harmless rather than
// clever: it fires only where the ledger already proves the worker holds the
// complete previous version, and only when the diff is smaller than the slice
// it would replace. A diff is a statement ABOUT bytes the worker has — assert
// it over bytes it never had and you have re-invented the path+hash lie in a
// costlier form, because a worker told "line 900 changed" about a file it only
// ever saw 24 KB of has no way to notice it was told a fiction.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** The delivery cap, in bytes. Equal to `NATIVE_READ_CAP` by construction — the
 * native path's CLI display bound and this cap bound the SAME seam, so one
 * number keeps them from double-truncating each other (see planrun's wiring). */
export const READ_SHIM_CAP = 24 * 1024;

// ── THE ARMS (Phase 2 pre-registration, 2026-08-18) ────────────────────────
// The frozen battery names four arms — A0 off, A1 cap+pointer+slice+G1, A2 diff
// only, A3 everything — and a single boolean can express exactly two of them.
// So `readShim` is an ARM NAME that still accepts the two booleans it used to:
// `false` is A0 and `true` is A3, both byte-identical to what they meant before
// this file learned the word "arm", because a flag whose meaning shifts under a
// caller written against the old spelling is a silent treatment change.
//
// Every lever is a separate field rather than a level on a dial, because the
// arms are not nested: A2 is not "less of" A1, it is a different lever entirely.
//
// Why A2 carries neither the pointer nor G1, stated so it can be argued with
// rather than discovered in a result:
//   - POINTER: the prereg's table lists "pointer" inside A1 and A2 as "diff
//     only". The pointer is the lever that answers the 48% of reads that
//     re-read an UNCHANGED file — the single biggest saving in the replay. Fold
//     it into A2 and A2 stops being the diff's own read: A2-vs-A1 would compare
//     (diff + the big saving) against (cap + the big saving) and attribute the
//     shared term to neither. So an unchanged re-read under A2 re-delivers.
//   - G1: G1 exists because a CAP blinds a worker that cannot aim — it forces
//     the retrieval pair onto any step granting `read`. A2 caps nothing, so
//     there is nothing to be blind about, and firing it would make A2 a
//     different treatment than the prereg names (a narrower admissible plan
//     space, on top of the diff). An admission rule is not free.
/** @typedef {{on: boolean, cap: boolean, pointer: boolean, diff: boolean, g1: boolean}} ReadShimArm */
/** @type {ReadShimArm} */
const ARM_OFF = Object.freeze({ on: false, cap: false, pointer: false, diff: false, g1: false });
/** @type {ReadShimArm} */
const ARM_CAP = Object.freeze({ on: true, cap: true, pointer: true, diff: false, g1: true });
/** @type {ReadShimArm} */
const ARM_DIFF = Object.freeze({ on: true, cap: false, pointer: false, diff: true, g1: false });
/** @type {ReadShimArm} */
const ARM_ALL = Object.freeze({ on: true, cap: true, pointer: true, diff: true, g1: true });

/** The legal spellings, in one place so an error message cannot drift from the
 * set it describes. */
export const READ_SHIM_ARMS = Object.freeze(['false (A0 — off)', "'cap' (A1)", "'diff' (A2)", 'true (A3 — all levers)']);

/**
 * Resolve the `readShim` flag into its arm. THROWS on anything else — the BA-4
 * param-guard class, and deliberately not a red.
 *
 * An unrecognised value is OPERATOR input, arriving before a single token is
 * spent, and there is exactly one safe way to fail on it: loudly, at once. The
 * failure this guard exists to prevent is `readShim: 'diff '` (or 'Diff', or
 * 'cap+diff') coerced by truthiness into A3 — a battery row that RAN the wrong
 * arm, recorded the arm it was asked for, and is invisible in the results
 * afterwards. That is the blind-instrument class this programme keeps paying
 * for, and it would corrupt the contrast rather than merely fail a run.
 *
 * A red was the alternative and is wrong here twice over: a red is a verdict on
 * the AGENT's work (the plan, the artifact), and this is the operator's own
 * argument; and a red would need a terminal outcome name, which is arbiter
 * territory and out of this change's scope.
 * @param {boolean|'cap'|'diff'|undefined} [flag]
 * @returns {ReadShimArm}
 */
export function readShimArm(flag) {
  if (flag === undefined || flag === false) return ARM_OFF;
  if (flag === true) return ARM_ALL;
  if (flag === 'cap') return ARM_CAP;
  if (flag === 'diff') return ARM_DIFF;
  throw new TypeError(`readShim: unknown arm ${JSON.stringify(flag)} — legal values are ${READ_SHIM_ARMS.join(', ')}`);
}

/** F19 at the bound rather than the verb (the NATIVE_READ_STRATEGY precedent):
 * a cap the worker does not know about is a worker that reads the same file
 * three times wondering why it keeps starting over. It states the bound, what a
 * re-read does, and the two verbs that read a symbol whole — the capability the
 * cap makes mandatory (G1). */
export const READ_SHIM_STRATEGY = '\nREAD LIMIT: a shell_read of a file over 24KB returns only the next 24KB of it, followed by a notice saying which bytes you got. This is NOT the whole file. Reading the same path again continues where the last read stopped, and once you hold all of it a re-read says so instead of re-sending the bytes. To read a function IN FULL, use ctx_recall(<symbol>) then ctx_get(<pointer>) — that returns the entire function however large its file is. To locate a line, use shell_grep(<pattern>). Never try to understand a large file by reading it whole.';

/** The DIFF arm's own line. It says nothing about a 24KB limit and nothing about
 * continuation reads, because under A2 neither exists — a persona describing
 * machinery that is off is a lie to the worker, and a worker rationing its reads
 * against an imaginary cap is a different treatment than the arm names.
 *
 * It does not repeat the steer at ctx_recall/ctx_get either: that steer is the
 * CAP's compensation (G1's other half), and offering it here would import half
 * of A1 into A2. The delivery itself carries `diffNotice`'s framing inline; this
 * line exists so the first diff is not a surprise. */
export const READ_SHIM_DIFF_STRATEGY = '\nRE-READS: if you shell_read a file you have already been shown in full and it has changed since, the result is a unified DIFF against the copy you already hold — not the file itself. It is labelled as one. Lines starting \'-\' were removed, \'+\' were added, \' \' are unchanged context; apply it to the copy you have and you hold the current file.';

/**
 * The persona line this arm is entitled to — empty when the arm changes nothing
 * the worker can perceive. One arm, one line: the two are never concatenated,
 * because a cap arm has no diff and a diff arm has no cap.
 * @param {ReadShimArm} arm
 * @returns {string}
 */
export function readShimStrategy(arm) {
  if (arm.cap) return READ_SHIM_STRATEGY;
  if (arm.diff) return READ_SHIM_DIFF_STRATEGY;
  return '';
}

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

/** The stale-serve's TRUSTED framing, same `bareloop:` register as the notices
 * above. Everything it has to say is load-bearing and none of it can be dropped
 * for brevity:
 *   - the pointer is STALE, so the worker knows why it is not getting a chunk;
 *   - the range may now hold DIFFERENT code than the symbol it asked for. This
 *     is the sentence that makes the serve legal at all. litectx refuses to
 *     slice a drifted range itself, and says why in `StalePointerError`'s own
 *     docstring: an UNLABELLED line slice can silently be another symbol's body,
 *     which is worse than an exception. Labelled, it is a raw slice the worker
 *     can judge; unlabelled it would be the same lie the ledger exists to stop;
 *   - which lines it actually got, and how long the file is now;
 *   - that NOTHING here was recorded as delivered, so the worker cannot read the
 *     serve as progress against the read seam's cap;
 *   - how to get a real pointer back.
 * No `]` appears before the end: the bracket is the notice's own terminator. */
const staleServeNotice = (path, startLine, shownEnd, lines, cut, cap) =>
  `[bareloop: the ctx_get pointer for ${path} lines ${startLine}-${shownEnd} is STALE — that file changed on disk after it was indexed, `
  + 'so the recorded line range may now hold DIFFERENT code than the symbol you asked for. '
  + `Rather than nothing, below are lines ${startLine}-${shownEnd} of ${path} exactly as they stand on disk right now `
  + `(0-based line indexes, as ctx_recall prints them; the file has ${lines} lines, so its last index is ${lines - 1})`
  + `${cut ? `, cut at the ${cap}-byte read limit` : ''}. `
  + 'This is a raw line slice — not a chunk, not the whole file — and none of it was recorded as delivered to you, '
  + 'so a shell_read of this path is unaffected. Re-run ctx_recall(<symbol>) for a fresh pointer.]';

/** The two refusals. Both are RESULTS the worker reads, never throws — a stale
 * pointer on a vanished or shrunken file is ordinary worker feedback, and a
 * throw here would look exactly like a verb that was never reached (the F18
 * blindness rule that put `emit` in `createCtxTools` in the first place). */
const staleAbsentNotice = (path, startLine, endLine, detail) =>
  `[bareloop: the ctx_get pointer for ${path} lines ${startLine}-${endLine} is stale (${detail}), `
  + `and ${path} is no longer on disk — there is nothing to show you. Re-run ctx_recall(<symbol>) for a fresh pointer.]`;

const stalePastEofNotice = (path, startLine, endLine, lines, detail) =>
  `[bareloop: the ctx_get pointer for ${path} lines ${startLine}-${endLine} is stale (${detail}), `
  + `and that file ${lines === 0 ? 'is now empty' : `is now only ${lines} lines long, so its last 0-based index is ${lines - 1}`}, `
  + 'so that range is entirely past its end — there is nothing to show you. '
  + 'Re-run ctx_recall(<symbol>) for a fresh pointer.]';

/** @typedef {{file: string, path: string, startLine: number, endLine: number, detail: string}} StaleReq */
/** @typedef {{text: string, outcome: 'stale-served'|'stale-absent'|'stale-past-eof'}} StaleServe */

/**
 * Create the shim: one delivery ledger, and the two seams that speak for it.
 *
 * `wrapRead` is the read tool's wrapper (the ledger's only writer). `serveStale`
 * is the answer to a stale `ctx_get` pointer, and it deliberately holds NO
 * reference to the ledger — see its own note. Both live in one object because
 * they are one worker's shim: the read seam and the retrieval seam the cap
 * steers a capped worker towards.
 * @param {{cap?: number, arm?: ReadShimArm}} [opts] `cap`: delivery bound in bytes (the
 *   shipped value is `READ_SHIM_CAP`; the option exists so the native path can pin the
 *   two bounds to one number rather than two constants drifting apart). `arm`: which
 *   levers are live (`readShimArm`). Defaults to ALL of them, so every caller written
 *   before the arms existed keeps the behaviour it was written against.
 */
export function createReadShim({ cap = READ_SHIM_CAP, arm = ARM_ALL } = {}) {
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

  /**
   * THE STALE-POINTER SERVE. When `ctx_get` throws `StalePointerError` — the file
   * changed on disk after indexing — hand back the REQUESTED LINE RANGE read
   * fresh from disk, labelled, instead of nothing.
   *
   * WHY IT EXISTS: the cap's own strategy line steers a capped worker at
   * `ctx_recall` → `ctx_get` for a whole function. A worker that has just EDITED
   * the file it is working on — the normal case — then gets a stale pointer and
   * zero bytes. Measured on the A1 arm's three green runs: 10 `ctx_get` calls, 5
   * stale, 0 bytes each, every one a file the worker had just written. The round
   * is paid for and returns nothing, and the steer is what walked it there.
   *
   * WHY IT NEVER TOUCHES THE LEDGER, and why that is the whole design: the
   * ledger's `full` is the licence for the pointer response ("you already hold
   * all of it"), and it is held ONLY while `delivered === total`. A ranged serve
   * hands over a SLICE — of a file the read seam may never have delivered a byte
   * of, from the MIDDLE rather than the next unseen prefix. Record it and the
   * next read answers "unchanged, you already have it" to a worker holding 90
   * lines of 900: exactly the untruthful-pointer failure this module was built
   * to prevent (250 of them in the $0 replay, median 73,348 bytes hidden). So
   * `ledger` is not in scope here — not "we are careful not to write it", but no
   * reference at all — and the cost is that a later `shell_read` may re-deliver
   * bytes the serve already showed. That is the fail-safe direction: the shim
   * over-delivers rather than lies.
   *
   * Gated on the CAP lever, not on `arm.on`: the serve is the cap's own
   * compensation (the same argument G1 and `READ_SHIM_STRATEGY` are made of). An
   * arm that caps nothing never steered the worker at `ctx_get` and must keep
   * `ctx_get`'s untouched contract.
   *
   * Never throws — a vanished or shrunken file is a refusal RESULT.
   * @param {StaleReq} req `file` is the ABSOLUTE path the gate already judged
   *   for this call; `path` is the repo-relative spelling shown to the worker.
   * @returns {StaleServe|null} null when this arm carries no cap
   */
  const serveStale = ({ file, path, startLine, endLine, detail }) => {
    if (!arm.cap) return null;
    // THE LINE SPACE, verified against real litectx rather than read off a
    // comment: `ctx_recall`/`ctx_get` handles are 0-BASED and INCLUSIVE (a probe
    // indexed a file, took recall's pointer, and matched `get`'s text against
    // `lines.slice(start, end + 1)` — the 1-based reading returned the wrong two
    // lines). The worker's numbers are echoed back in that same space, because
    // `LINE_SPACE` already told it that is the space it is in, and a serve that
    // silently renumbered would be the off-by-one that doc exists to prevent.
    const a = Math.max(0, Math.floor(Number(startLine) || 0));
    const b = Math.max(a, Math.floor(Number(endLine) || a));
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      return { text: staleAbsentNotice(path, a, b, detail), outcome: 'stale-absent' };
    }
    const lines = content.split('\n');
    // A trailing newline yields a final empty element that is not a line.
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (a >= lines.length) {
      return { text: stalePastEofNotice(path, a, b, lines.length, detail), outcome: 'stale-past-eof' };
    }
    const shownEnd = Math.min(b, lines.length - 1);
    let body = `${lines.slice(a, shownEnd + 1).join('\n')}\n`;
    // The same cap as every other delivery this module makes, on the same
    // UTF-8-safe boundary. A requested range is worker-chosen and unbounded.
    const buf = Buffer.from(body, 'utf8');
    const cut = buf.length > cap;
    if (cut) body = buf.subarray(0, utf8Boundary(buf, cap)).toString('utf8');
    return {
      text: `${staleServeNotice(path, a, shownEnd, lines.length, cut, cap)}\n\n${body}`,
      outcome: 'stale-served',
    };
  };

  /**
   * Wrap a read tool with the delivery ledger. MUTATES `tool.execute` and returns
   * the tool, which is safe because the caller builds fresh tool objects per
   * worker (`createShellTools()` inside `mkWorker`) — so the ledger's lifetime is
   * one worker, matching the fresh-Loop-per-step reset the replay segmented on.
   * A process-wide ledger would carry one step's coverage into the next step's
   * transcript, which never held those bytes.
   * @param {{name: string, execute: (args: any) => Promise<any>}} tool the read tool
   * @returns {{name: string, execute: (args: any) => Promise<any>}} the same tool
   */
  const wrapRead = (tool) => {
    // An OFF arm wraps nothing at all — not a wrapper that passes through, which
    // would still be a `tool.execute` this module owns. A0 has to be the seam
    // untouched, and "untouched" is the assertion, not "behaves the same".
    if (!arm.on) return tool;
    const inner = tool.execute;
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
      //
      // Without the CAP lever (A2) there is no such thing as partial coverage: a
      // read hands over the file, so `start` is always 0 and `end` is always the
      // end. Everything below then falls out unchanged — the slice IS the file,
      // and the diff's budget below is the whole re-delivery it replaces, which is
      // the same sentence the capped arm's budget says, at a different size.
      const start = arm.cap && seen && seen.hash === hash ? seen.delivered : 0;
      const end = arm.cap ? utf8Boundary(buf, Math.min(start + cap, total)) : total;

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
      if (arm.diff && seen && seen.hash !== hash && seen.full !== null) {
        const d = lineDiff(seen.full, r, Math.max(0, (end - start) - Buffer.byteLength(diffNotice(path, total), 'utf8') - 2));
        if (d !== null) {
          ledger.set(path, { hash, total, delivered: total, full: r });
          return `${diffNotice(path, total)}\n\n${d}`;
        }
      }

      // The POINTER lever. Reachable only when the ledger already covers the
      // current content — under A2 that is an unchanged re-read of a file handed
      // over whole, and the arm answers it by handing the bytes over again. Saying
      // "you already have it" there would be TRUE and still wrong: it is the
      // pointer's saving, and A2 is the diff's own read (see the arm table above).
      if (arm.pointer && start >= total) {
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
  };

  return { arm, cap, wrapRead, serveStale };
}

/**
 * The one-tool spelling, kept for every caller written before the shim became an
 * object: wrap this read tool with its own private ledger and hand it back.
 * @param {{name: string, execute: (args: any) => Promise<any>}} tool
 * @param {{cap?: number, arm?: ReadShimArm}} [opts]
 * @returns {{name: string, execute: (args: any) => Promise<any>}} the same tool
 */
export function wrapReadTool(tool, opts = {}) {
  return createReadShim(opts).wrapRead(tool);
}
