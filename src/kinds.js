// THE KIND EXECUTOR — close-authoring v1, module M1 (design record
// 2026-08-07, gate-1 Result 3; gate-2 POC closed 2026-08-08).
//
// A close stops being a hand-written script and becomes a DECLARATION over
// kinds whose implementations we own. This module is those implementations.
// The agent never authors a stage body — it parameterises four kinds, and
// anything it could not say here it cannot make the arbiter do (the
// `check-passes(name)` move: illegal is inexpressible, not rejected late).
//
// The four kinds are the small part. The load-bearing part is the THREE
// RUNTIME CONTRACTS every kind inherits — they live HERE, in the executor,
// never in a kind, and no declaration can weaken them:
//
//   (a) THE INSTRUMENT-STOP CONTRACT. exit 97 with `judged` deliberately
//       WITHHELD — for a timeout, a null exit code, unreadable or
//       unparseable required output, a buffer overrun, a missing seed
//       commit, a region anchor that located nothing, and a `first` term
//       that was never reported. A broken instrument is a CASUALTY, never a
//       red (F45); a close that reports one as a red manufactures fake
//       evidence, and the judged floor (F17) is what makes the difference
//       visible downstream. The sharp edge is the zero-match split: `sum`
//       over nothing is a COUNTED zero (the region was searched), `first`
//       over nothing is UNKNOWN — and unknown is never zero (F6).
//
//   (b) THE GAP OUTPUT CONTRACT. Every line carries the spec's `gapKeep`, a
//       trim is ANNOUNCED with its counts and never silent (F28 — a bound
//       that eats the failure names deletes exactly the mechanical detail
//       that converts, F38/F46), and no culprit is named beyond what the
//       instrument itself reported.
//
//   (c) THE CHANGED-SET PRIMITIVE. `git diff --name-only <seed>` PLUS
//       untracked files, MINUS two arbiter books. Both exclusions were paid
//       for live: the `gate-audit.jsonl` one red-carded the arbiter's own
//       file mid-run (u-msdonzxl) and burned a run to the wall. No user
//       could know to exclude them, which is why they sit below the stage
//       level in a shared primitive rather than in anyone's parameters.
//
// D12 rides on top of (a): the close stores the COUNTING RULE, never the
// number. `baseline: "seed"` is MEASURED at this run's own seed every run —
// in a detached worktree, or in place when the tree is verifiably identical
// to the seed — and WHICH route was taken is recorded (`baselineSource`),
// never silent. A frozen constant would judge run 5 against run 1's tree.
//
// Two deliberate divergences from the gate-2 POC executor, both for shipped
// reasons (this module is a graduation — a rewrite, never a copy):
//   - it is ASYNC. `spawnSync` blocks the host event loop for the child's
//     whole duration (F68 measured 9 loop freezes in one green run, worst
//     74.3s), which is precisely when the stall fuse's timers cannot fire.
//     Only the WAIT is async; every observable semantic is spawnSync's.
//   - seed worktrees live in a caller-scoped holder under the OS temp dir
//     and are removed, never in a module-global cache inside the package.
//
// Secrets: this module does NOT scrub. A stage's output is redacted by the
// CALLER at the emission boundary, through the one `SECRET_PATTERNS`
// inventory, before anything reaches the append-only spine — the same split
// `src/exits.js` documents. The env handed to the child IS blinded here,
// because a stage runs worker-authored code (`npm test`, `pytest`) and the
// operator's credentials have no business in it: `CLOSE_ENV_DENY` is
// imported from the arbiter's shell, never re-spelled — two inventories are
// two instruments.

import { spawn } from 'node:child_process';
import { readFile, stat, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { globToPrefix } from './validate.js';
import { CLOSE_ENV_DENY } from './ralph.js';

/** the close's two judgment exits — a stage's verdict, in the shape the
 * hand-written closes already spoke (exit code is truth) */
export const EXIT_GREEN = 0;
export const EXIT_RED = 1;
/** contract (a): the instrument-stop exit. `judged` is withheld with it. */
export const EXIT_STOP = 97;
/** The judgment-rendered marker a rendered close prints, for ralph's
 * `runClose` judged floor (src/ralph.js). It rides EVERY real judgment, green or red,
 * and NEVER a stop — this module reports the same fact as the boolean
 * `judged`; the marker exists so a renderer and the floor agree on one
 * spelling. */
export const JUDGED_MARKER = 'judged=1';

/** contract (b): the per-stage gap ceiling. Trims are announced, never silent. */
export const GAP_LINE_CAP = 40;
/**
 * The exact phrase this executor's trim announcement carries. Exported for the
 * same reason ralph exports `GAP_KEEP_TRIM_MARKER`: Layer R's detector must be
 * able to see that a gap window was TRIMMED, because failures beyond the window
 * can move while the visible lines stay identical — and an undetected trim makes
 * the detector claim "reds unchanged" off an instrument that was blind (F43,
 * finding 5). A magic string on the reading side would drift the day this
 * wording changes; the renderer below is its only other use.
 */
export const GAP_TRIM_MARKER = 'gap trimmed:';
/** used when neither the stage nor the ctx names a bound. A stage that could
 * run forever is not a red — it is a stop, and something must decide when. */
export const DEFAULT_TIMEOUT_MS = 300_000;
/** PER STREAM, like the arbiter's own close runner. An overrun truncates the
 * output mid-summary, so any number read out of it is unknown, not zero. */
export const MAX_BUFFER = 16 * 1024 * 1024;
/** an untracked file larger than this is not scanned line-by-line; the skip
 * is ANNOUNCED in the gap rather than passing as a clean scan */
export const MAX_SCAN_BYTES = 2 * 1024 * 1024;
/** ceiling on a parser's term list — a runaway parser is a red, not a bill */
export const MAX_TERMS = 8;

/**
 * WHICH KIND of instrument stop, in the ARBITER's own four-row vocabulary
 * (`CLOSE_FAULTS`, src/ralph.js). Stamped at the site that OBSERVES the fault —
 * never sniffed out of the stop's prose downstream (the typed-attribution rule:
 * a `lib`/fault field is stamped at the throw site, and prose is a fallback for
 * pre-typed spines only).
 *
 * The rows are kept apart for the reason `CLOSE_FAULTS` keeps them apart: they
 * are DIFFERENT HUMAN DECISIONS. "raise the close timeout", "fix the argv" and
 * "re-run, it was OOM-killed" are three answers, and a declared close that
 * pooled all three into `failed` would hand every one of them the same option
 * list. `failed` is the default because "the close cannot run" is the safe
 * reading of a fault nothing else claimed.
 */
export const STOP_FAULTS = Object.freeze({
  /** the stage cannot RUN at all: spawn failure, a missing seed commit, git refusing */
  FAILED: 'failed',
  /** it ran and never finished judging */
  TIMED_OUT: 'timed-out',
  /** it died by signal — no opinion was ever rendered */
  KILLED: 'killed',
  /** it ran, came back, and judged nothing: unreadable output, a blown buffer,
   * a number that was never reported, a parser that does not normalise */
  CRASHED: 'crashed',
});

export const AGGREGATES = Object.freeze(['first', 'sum']);
export const SIGNS = Object.freeze([1, -1]);
/** every kind this executor implements. `judged-floor` / `human-confirms`
 * are catalogue entries and are deliberately absent here: declaring one is
 * counted demand (the request-red path), and reaching one at runtime is a
 * stop — never a red, and never a silent pass. */
export const LIVE_KINDS = Object.freeze(['command-exit', 'count-not-worse', 'pattern-absent-in-diff', 'files-changed']);

/**
 * @typedef {{code: string, path: string, detail: string}} Red
 * @typedef {{workdir: string, seedRef: string, gapKeep: string,
 *   timeoutMsDefault?: number, baselineMode?: 'auto'|'worktree',
 *   gapCap?: number, maxBuffer?: number, seedTrees?: SeedTrees}} Ctx
 *   The arbiter's half of a stage run. Every field here is operator/runner
 *   territory: a declaration parameterises kinds, never the contracts.
 * @typedef {{verdict: 'green'|'red'|'instrument-stop'|'not-reached',
 *   exitCode: number|null, value: number|null, baseline: number|null,
 *   baselineSource: string|null, gapLines: string[], judged: boolean,
 *   stage: string|null, kind: string|null, detail: Record<string, any>}} StageResult
 * @typedef {{ensure: (workdir: string, seedRef: string) => Promise<{stop: string, fault: string}|{stop: null, dir: string}>,
 *   cleanup: () => Promise<void>}} SeedTrees
 */

// ── contract (b): the gap ────────────────────────────────────────────────────

/**
 * Gap lines, prefixed and capped, with the trim ANNOUNCED. Embedded newlines
 * are split so one pushed blob cannot smuggle past the line cap.
 */
class Gap {
  /** @param {string} keep @param {number} [cap] */
  constructor(keep, cap = GAP_LINE_CAP) {
    this.keep = keep;
    this.cap = cap > 0 ? cap : GAP_LINE_CAP;
    /** @type {string[]} */
    this.lines = [];
  }

  /** @param {string} line */
  push(line) {
    for (const part of String(line).split('\n')) this.lines.push(part);
    return this;
  }

  /** @returns {string[]} */
  render() {
    const p = (/** @type {string} */ l) => `${this.keep}${l}`;
    if (this.lines.length <= this.cap) return this.lines.map(p);
    const kept = this.lines.slice(0, this.cap - 1);
    const withheld = this.lines.length - kept.length;
    return [...kept.map(p), p(`[${GAP_TRIM_MARKER} ${withheld} of ${this.lines.length} lines withheld — the cap is ${this.cap}]`)];
  }
}

// ── the child process: only the WAIT is async (F68) ──────────────────────────

/**
 * The environment a stage's child receives. Two strips, both deliberate:
 *
 *  - `NODE_TEST_CONTEXT`: inherited from a host test runner, a `node --test`
 *    stage silently no-ops — a confident fake green.
 *  - `CLOSE_ENV_DENY` (imported, never re-spelled): a stage runs
 *    worker-authored code, and none of git/tsc/mypy/pytest needs the
 *    operator's provider key to judge a tree.
 *
 * A DECLARED env var whose name is on the deny list is dropped too — the
 * declaration is authored, and an authored close must not be able to hand
 * worker code a credential — and the drop is ANNOUNCED by name (never the
 * value) rather than applied silently.
 * @param {Record<string, string>} [declared]
 * @returns {{env: NodeJS.ProcessEnv, dropped: string[]}}
 */
function stageEnv(declared = {}) {
  const denied = (/** @type {string} */ name) => CLOSE_ENV_DENY.names.includes(name)
    || CLOSE_ENV_DENY.prefixes.some((p) => name.startsWith(p))
    || CLOSE_ENV_DENY.shape.test(name);
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const name of Object.keys(env)) if (denied(name)) delete env[name];
  // NO_COLOR keeps ANSI escapes out of the text every parser reads. Anything
  // the stage declared rides on top of it and may override it.
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  /** @type {string[]} */
  const dropped = [];
  for (const [name, value] of Object.entries(declared)) {
    if (denied(name)) { dropped.push(name); continue; }
    env[name] = String(value);
  }
  return { env, dropped };
}

/**
 * Run a command and read its world. Faithful to `spawnSync`'s observable
 * result — the same `{status, signal, stdout, stderr}`, the same per-stream
 * ceiling, SIGTERM at the deadline — but without freezing the host loop
 * (F68). Every fault comes back as a `stop` STRING; nothing throws, because
 * a throw here would have to be caught and turned back into a stop anyway.
 * @param {string} cmd @param {string[]} args
 * @param {{cwd: string, env?: Record<string,string>, timeoutMs?: number, maxBuffer?: number}} o
 * @returns {Promise<{stop: string, fault: string}|{stop: null, code: number, out: string, dropped: string[]}>}
 */
async function sh(cmd, args, { cwd, env: declared = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = MAX_BUFFER }) {
  const { env, dropped } = stageEnv(declared);
  const r = await new Promise((/** @type {(v: {error: (Error & {code?: string})|null, status: number|null, signal: string|null, stdout: string, stderr: string}) => void} */ resolve) => {
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    try {
      child = spawn(cmd, args, { cwd, env });
    } catch (e) {
      resolve({ error: /** @type {any} */ (e), status: null, signal: null, stdout: '', stderr: '' });
      return;
    }
    /** @type {Buffer[]} */ const outChunks = [];
    /** @type {Buffer[]} */ const errChunks = [];
    let outBytes = 0; let errBytes = 0;
    /** @type {(Error & {code?: string})|null} */
    let error = null;
    /** @type {NodeJS.Timeout|undefined} */ let timer;
    /** @type {NodeJS.Timeout|undefined} */ let killTimer;
    // FIRST FAULT WINS: a child that blew the buffer and then hit the
    // deadline is one story, not two.
    const fault = (/** @type {string} */ code) => {
      if (error) return;
      error = Object.assign(new Error(`spawn ${cmd} ${code}`), { code });
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 2000);
      killTimer.unref();
    };
    child.stdout?.on('data', (/** @type {Buffer} */ c) => { outBytes += c.length; outChunks.push(c); if (outBytes > maxBuffer) fault('ENOBUFS'); });
    child.stderr?.on('data', (/** @type {Buffer} */ c) => { errBytes += c.length; errChunks.push(c); if (errBytes > maxBuffer) fault('ENOBUFS'); });
    child.on('error', (e) => { if (!error) error = e; });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      // Concat-then-decode, never per chunk: a multi-byte character across a
      // chunk boundary must not become two replacement characters in the text
      // every parser reads.
      resolve({ error, status, signal, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') });
    });
    if (typeof timeoutMs === 'number' && timeoutMs > 0 && Number.isFinite(timeoutMs)) timer = setTimeout(() => fault('ETIMEDOUT'), timeoutMs);
    child.stdin?.on('error', () => {});
    child.stdin?.end();
  });

  const argv = `${cmd}${args.length ? ` ${args.join(' ')}` : ''}`;
  if (r.error) {
    const code = /** @type {any} */ (r.error).code;
    if (code === 'ETIMEDOUT') return { stop: `INSTRUMENT: "${cmd}" did not finish inside ${timeoutMs}ms`, fault: STOP_FAULTS.TIMED_OUT };
    if (code === 'ENOBUFS') return { stop: `INSTRUMENT: "${cmd}" output exceeded the ${maxBuffer}B ceiling — the output is truncated, so any number read from it is unknown, not zero`, fault: STOP_FAULTS.CRASHED };
    return { stop: `INSTRUMENT: "${argv}" could not be run (${code ?? String(r.error.message)})`, fault: STOP_FAULTS.FAILED };
  }
  if (r.status === null) return { stop: `INSTRUMENT: "${cmd}" returned a null exit code (killed by ${r.signal ?? 'an unknown signal'})`, fault: STOP_FAULTS.KILLED };
  if (typeof r.stdout !== 'string' || typeof r.stderr !== 'string') return { stop: `INSTRUMENT: "${cmd}" produced unreadable output`, fault: STOP_FAULTS.CRASHED };
  return { stop: null, code: r.status, out: `${r.stdout}${r.stderr}`, dropped };
}

/**
 * git, read-only, in a repository. Faults come back as `ok:false` with the
 * stderr — a caller decides whether that is a stop.
 * @param {string} cwd @param {string[]} args
 */
async function git(cwd, args) {
  const r = await sh('git', args, { cwd, timeoutMs: 120_000 });
  // git refusing IS "the close cannot run": the changed-set primitive is not an
  // optional enrichment, so a non-zero git carries FAILED rather than inheriting
  // whatever the spawn layer said about the process itself.
  if (r.stop !== null) return { ok: false, out: '', err: r.stop, code: null, fault: r.fault };
  return { ok: r.code === 0, out: r.out, err: r.out, code: r.code, fault: STOP_FAULTS.FAILED };
}

/**
 * D8's seed, READ rather than typed: HEAD at run start. A close stores the
 * counting rule and never the number (D12), so which commit the run is measured
 * from is a fact about THIS run — recorded and shown, never carried in a signed
 * spec where it would judge run 5 against run 1's tree.
 *
 * A fault is a named `stop`, never a fallback ref: measuring against the wrong
 * baseline is the failure direction that reads as a clean tree.
 * @param {string} workdir
 * @returns {Promise<{stop: string, seedRef: null}|{stop: null, seedRef: string}>}
 */
export async function seedAtHead(workdir) {
  const r = await git(workdir, ['rev-parse', 'HEAD']);
  if (!r.ok) return { stop: `INSTRUMENT: could not read HEAD in ${workdir}: ${String(r.err).trim()}`, seedRef: null };
  const sha = r.out.trim().split('\n')[0].trim();
  if (!/^[0-9a-f]{7,64}$/.test(sha)) {
    return { stop: `INSTRUMENT: git rev-parse HEAD in ${workdir} did not return a commit sha`, seedRef: null };
  }
  return { stop: null, seedRef: sha };
}

/**
 * The files that exist AT THE SEED COMMIT. Deliberately not `ls-files`, which
 * reads the index and the working tree: this listing is what a declared path is
 * judged against, and it must describe the tree the close measures from rather
 * than whatever is lying around today.
 *
 * ONE spelling, here beside the other git reads (`src/authorscout.js`'s
 * `seedFileList` delegates to it) — a second listing command is a second
 * instrument, and the one that grades would be the one nobody validated.
 * @param {string} workdir @param {string} seedRef
 * @returns {Promise<{stop: string, files: null}|{stop: null, files: string[]}>}
 */
export async function seedListing(workdir, seedRef) {
  const r = await git(workdir, ['ls-tree', '-r', '--name-only', seedRef]);
  if (!r.ok) {
    return { stop: `INSTRUMENT: git ls-tree -r ${seedRef} failed in ${workdir}: ${String(r.err).trim()}`, files: null };
  }
  return { stop: null, files: r.out.split('\n').map((s) => s.trim()).filter(Boolean) };
}

// ── contract (c): the changed-set primitive ──────────────────────────────────

/**
 * The two arbiter books, and the shape of each exclusion is the whole point.
 *
 * `.litectx/` is a PREFIX — everything beneath the store belongs to the
 * arbiter. `gate-audit.jsonl` is an EXACT repo-relative path and never a
 * basename or a pattern: the gate audit is written to
 * `join(workdir, 'gate-audit.jsonl')` and nowhere else, so a worker-authored
 * `src/gate-audit.jsonl` is NOT an arbiter book and must still count as work.
 * Matching by basename would swallow it — and swallowing a worker's real
 * write is the failure direction that reads as a clean tree.
 * @param {string} rel a repo-relative POSIX path
 * @returns {string|null} the book it belongs to, or null
 */
export function isArbiterBook(rel) {
  if (rel === '.litectx' || rel.startsWith('.litectx/')) return '.litectx/';
  if (rel === 'gate-audit.jsonl') return 'gate-audit.jsonl';
  return null;
}

/**
 * Everything this run changed against the seed: the tracked diff PLUS
 * untracked files (an untracked file has no diff — the case a naive
 * `git diff` scan silently misses), minus the arbiter's own books.
 * @param {string} workdir @param {string} seedRef
 * @returns {Promise<{stop: string, fault: string}|{stop: null, paths: string[], tracked: string[], untracked: string[], excluded: {path: string, book: string}[]}>}
 */
export async function changedSet(workdir, seedRef) {
  const verify = await git(workdir, ['rev-parse', '--verify', `${seedRef}^{commit}`]);
  if (!verify.ok) return { stop: `INSTRUMENT: the seed commit "${seedRef}" does not exist in ${workdir}`, fault: STOP_FAULTS.FAILED };
  const d = await git(workdir, ['diff', '--name-only', seedRef]);
  if (!d.ok) return { stop: `INSTRUMENT: git diff against "${seedRef}" failed: ${String(d.err).trim()}`, fault: d.fault };
  const u = await git(workdir, ['ls-files', '--others', '--exclude-standard']);
  if (!u.ok) return { stop: `INSTRUMENT: git ls-files --others failed: ${String(u.err).trim()}`, fault: u.fault };
  const split = (/** @type {string} */ s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  /** @type {{path: string, book: string}[]} */
  const excluded = [];
  const keep = (/** @type {string[]} */ list) => list.filter((p) => {
    const book = isArbiterBook(p);
    if (book) { excluded.push({ path: p, book }); return false; }
    return true;
  });
  const tracked = keep(split(d.out));
  const untracked = keep(split(u.out));
  return { stop: null, tracked, untracked, excluded, paths: [...new Set([...tracked, ...untracked])].sort() };
}

/**
 * The lines this run ADDED to one file. A tracked file's additions come from
 * its own unified diff; an UNTRACKED file has no diff at all, so its ENTIRE
 * body is added — the half of this primitive a diff-only scan misses.
 * @param {string} workdir @param {string} seedRef @param {string} rel
 * @param {{untracked?: boolean}} [o]
 * @returns {Promise<{stop: string, fault: string}|{stop: null, lines: {n: number, text: string}[], note: string|null}>}
 */
export async function addedLines(workdir, seedRef, rel, { untracked = false } = {}) {
  if (untracked) {
    const abs = join(workdir, rel);
    let st;
    try { st = await stat(abs); } catch { return { stop: null, lines: [], note: null }; }
    if (!st.isFile()) return { stop: null, lines: [], note: null };
    if (st.size > MAX_SCAN_BYTES) return { stop: null, lines: [], note: `${rel}: ${st.size}B exceeds the ${MAX_SCAN_BYTES}B scan cap — NOT scanned` };
    let buf;
    try { buf = await readFile(abs); } catch (e) { return { stop: `INSTRUMENT: ${rel} could not be read: ${String(/** @type {any} */ (e)?.message ?? e)}`, fault: STOP_FAULTS.CRASHED }; }
    if (buf.includes(0)) return { stop: null, lines: [], note: `${rel}: binary — NOT scanned` };
    return { stop: null, lines: buf.toString('utf8').split('\n').map((text, i) => ({ n: i + 1, text })), note: null };
  }
  const d = await git(workdir, ['diff', '-U0', '--no-color', seedRef, '--', rel]);
  if (!d.ok && d.code !== 0) return { stop: `INSTRUMENT: git diff -U0 for ${rel} failed: ${String(d.err).trim()}`, fault: d.fault };
  /** @type {{n: number, text: string}[]} */
  const lines = [];
  let n = 0;
  for (const raw of d.out.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { n = Number(hunk[1]); continue; }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) { lines.push({ n, text: raw.slice(1) }); n += 1; }
  }
  return { stop: null, lines, note: null };
}

// ── scope: one prefix spelling, the shipped one ──────────────────────────────

/** normalise a declared prefix through the SHIPPED spelling, never a second
 * one — `globToPrefix`'s collapse order is fence territory (F9). */
const normPrefix = (/** @type {string} */ p) => globToPrefix(String(p)).replace(/^\.\//, '');

/** @param {string} rel @param {string} prefix */
function underPrefix(rel, prefix) {
  const pre = normPrefix(prefix);
  if (pre === '' || pre === '.' || pre === '/') return true;
  const p = pre.endsWith('/') ? pre : `${pre}/`;
  return rel === pre.replace(/\/$/, '') || rel.startsWith(p);
}

/** @param {string} rel @param {any} scope */
function inScope(rel, scope) {
  if (!scope || typeof scope !== 'object') return true;
  const inc = Array.isArray(scope.includePrefixes) ? scope.includePrefixes : null;
  const exc = Array.isArray(scope.excludePrefixes) ? scope.excludePrefixes : null;
  if (inc && !inc.some((/** @type {string} */ p) => underPrefix(rel, p))) return false;
  if (exc && exc.some((/** @type {string} */ p) => underPrefix(rel, p))) return false;
  return true;
}

/**
 * The first repository-relative path a tool named on a line, or null. At
 * least one `/` is required, so prose ("Found 3 errors in 2 files") never
 * reads as a path — a false path would silently steer the scope filter.
 * @param {string} line @param {string} workdir
 */
function linePath(line, workdir) {
  const m = /(?:^|[\s"'(\[<])((?:\.\/)?\/?(?:[\w.@+~-]+\/)+[\w.@+~-]+)/.exec(line);
  if (!m) return null;
  let p = m[1].replace(/^\.\//, '');
  const wd = workdir.endsWith(sep) ? workdir : `${workdir}${sep}`;
  if (p.startsWith(wd)) p = p.slice(wd.length);
  else if (p.startsWith('/')) return null; // absolute, outside the patient — attributes to nothing
  return p;
}

// ── the parser: ONE spelling, shared by validator and executor ───────────────

/**
 * Count a pattern's capture groups without running it against real input:
 * `src + '|'` always matches the empty string, so the result array's length
 * names the group count. Also the ONE place a declared regex is compiled at
 * validation time, so a broken pattern reds before any process is spawned.
 * @param {any} src
 * @returns {{count: number, red: string|null}}
 */
export function regexGroups(src) {
  if (typeof src !== 'string' || src === '') return { count: 0, red: 'a regular expression, as a string' };
  try {
    const m = new RegExp(`${src}|`).exec('');
    return { count: (m?.length ?? 1) - 1, red: null };
  } catch (e) {
    return { count: 0, red: `/${src}/ is not a valid regular expression: ${String(/** @type {any} */ (e)?.message ?? e)}` };
  }
}

/**
 * THE normalisation of a `count-not-worse` parser (gate-1 amendment #5).
 * The declaration validator and this executor both call it, so there is
 * exactly one spelling of what a parser MEANS — two normalisers that
 * disagree are two instruments, and the one that grades is the one nobody
 * validated.
 *
 *     value = Σ over terms of  sign × (first | sum of that term's captures,
 *                                      inside that term's region)
 *
 * Backwards compatible by construction: the short form
 * `{lineMatch, capture?}` resolves to exactly one term with
 * `sign +1, aggregate "first", region "whole-output"`, which is the
 * pre-amendment semantics unchanged.
 *
 * Never throws — reds come back in the shipped `{ok, reds, ...}` shape.
 * @param {any} parser @param {string} [at] path prefix for reds
 * @returns {{ok: boolean, reds: Red[], terms: any[]|null}}
 */
export function normalizeParser(parser, at = 'parser') {
  /** @type {Red[]} */
  const reds = [];
  const red = (/** @type {string} */ path, /** @type {string} */ detail, code = 'invalid-value') => reds.push({ code, path, detail });
  if (parser === null || typeof parser !== 'object' || Array.isArray(parser)) {
    red(at, 'a parser object: {terms:[...]} or the short form {lineMatch, capture?}', 'missing-field');
    return { ok: false, reds, terms: null };
  }
  const hasTerms = Object.hasOwn(parser, 'terms');
  const hasShort = Object.hasOwn(parser, 'lineMatch');
  if (hasTerms && hasShort) {
    red(at, 'a parser declares EITHER terms or the short form lineMatch — never both');
    return { ok: false, reds, terms: null };
  }
  /** @type {any[]} */
  let raw;
  if (hasShort) {
    for (const k of Object.keys(parser)) if (!['lineMatch', 'capture'].includes(k)) red(`${at}.${k}`, 'the short form takes lineMatch and capture only');
    raw = [{ lineMatch: parser.lineMatch, ...(Object.hasOwn(parser, 'capture') ? { capture: parser.capture } : {}), sign: 1, aggregate: 'first', region: 'whole-output' }];
  } else if (hasTerms) {
    for (const k of Object.keys(parser)) if (k !== 'terms') red(`${at}.${k}`, 'the long form takes terms only');
    if (!Array.isArray(parser.terms) || parser.terms.length === 0) {
      red(`${at}.terms`, 'a non-empty array of terms');
      return { ok: false, reds, terms: null };
    }
    if (parser.terms.length > MAX_TERMS) red(`${at}.terms`, `${parser.terms.length} terms exceeds the ceiling of ${MAX_TERMS}`);
    raw = parser.terms;
  } else {
    red(at, 'a parser object: {terms:[...]} or the short form {lineMatch, capture?}', 'missing-field');
    return { ok: false, reds, terms: null };
  }

  /** @type {any[]} */
  const terms = [];
  raw.forEach((t, i) => {
    const p = `${at}${hasShort ? '' : `.terms[${i}]`}`;
    if (t === null || typeof t !== 'object' || Array.isArray(t)) { red(p, 'a term object'); return; }
    for (const k of Object.keys(t)) if (!['lineMatch', 'capture', 'sign', 'aggregate', 'region'].includes(k)) red(`${p}.${k}`, 'a term takes lineMatch, capture, sign, aggregate, region');
    const groups = regexGroups(t.lineMatch);
    if (groups.red) { red(`${p}.lineMatch`, groups.red); return; }
    // capture defaults to group 1; a pattern with NO group tallies 1 per match,
    // which is how a stage COUNTS occurrences instead of reading a printed figure
    const capture = Object.hasOwn(t, 'capture') && t.capture !== null && t.capture !== undefined
      ? t.capture
      : (groups.count === 0 ? null : 1);
    if (capture !== null && !(Number.isInteger(capture) && capture >= 0)) { red(`${p}.capture`, 'a non-negative integer capture-group index'); return; }
    if (capture !== null && capture > groups.count) { red(`${p}.capture`, `group ${capture} does not exist — /${t.lineMatch}/ has ${groups.count} capture group(s)`); return; }
    const sign = Object.hasOwn(t, 'sign') ? t.sign : undefined;
    if (!SIGNS.includes(sign)) { red(`${p}.sign`, `one of ${SIGNS.join(' | ')}`, Object.hasOwn(t, 'sign') ? 'invalid-value' : 'missing-field'); return; }
    const aggregate = Object.hasOwn(t, 'aggregate') ? t.aggregate : undefined;
    if (!AGGREGATES.includes(aggregate)) { red(`${p}.aggregate`, `one of ${AGGREGATES.join(' | ')}`, Object.hasOwn(t, 'aggregate') ? 'invalid-value' : 'missing-field'); return; }
    const rawRegion = Object.hasOwn(t, 'region') ? t.region : undefined;
    /** @type {any} */
    let region;
    if (rawRegion === 'whole-output') region = 'whole-output';
    else if (rawRegion !== null && typeof rawRegion === 'object' && !Array.isArray(rawRegion)) {
      const ag = regexGroups(rawRegion.anchor);
      if (ag.red) { red(`${p}.region.anchor`, ag.red); return; }
      const rc = Object.hasOwn(rawRegion, 'capture') && rawRegion.capture !== null ? rawRegion.capture : 0;
      if (!(Number.isInteger(rc) && rc >= 0)) { red(`${p}.region.capture`, 'a non-negative integer capture-group index (0 = the whole anchor match)'); return; }
      if (rc > ag.count) { red(`${p}.region.capture`, `group ${rc} does not exist — /${rawRegion.anchor}/ has ${ag.count} capture group(s)`); return; }
      for (const k of Object.keys(rawRegion)) if (!['anchor', 'capture'].includes(k)) red(`${p}.region.${k}`, 'a region takes anchor and capture only');
      region = { anchor: rawRegion.anchor, capture: rc };
    } else { red(`${p}.region`, '"whole-output" or {anchor, capture}', Object.hasOwn(t, 'region') ? 'invalid-value' : 'missing-field'); return; }
    terms.push({ lineMatch: t.lineMatch, capture, sign, aggregate, region });
  });

  if (reds.length) return { ok: false, reds, terms: null };
  return { ok: true, reds, terms };
}

/**
 * Read ONE number out of a command's output, as signed arithmetic over
 * normalised terms.
 *
 * The zero-match split is contract (a), not a convenience:
 *   - `sum` over zero matches is a COUNTED zero. The region was searched and
 *     nothing was there; that is legitimately 0.
 *   - `first` over zero matches is UNKNOWN — the number was never reported —
 *     and unknown is an instrument stop, never a defaulted 0 (F6).
 *   - a region whose anchor matches nothing was never LOCATED: stop.
 * The scope filter runs per OUTPUT LINE, before aggregation, and both its
 * drop count and its unattributable count are ANNOUNCED: a line naming no
 * path is KEPT (no filter can exclude what it cannot locate) and the notes
 * say so, rather than the number quietly meaning something else.
 * @param {string} output @param {any[]} terms normalised terms
 * Every stop here is `crashed` in the arbiter's vocabulary — the command RAN,
 * came back, and the number could not be read out of it. Nothing in this
 * function can observe a spawn failure, a timeout or a signal, so it never
 * claims one.
 * @param {{scope?: any, workdir?: string}} [o]
 * @returns {{stop: string, fault: string}|{stop: null, value: number, breakdown: any[], notes: string[]}}
 */
export function parseValue(output, terms, { scope = null, workdir = '' } = {}) {
  let value = 0;
  /** @type {any[]} */
  const breakdown = [];
  /** @type {string[]} */
  const notes = [];
  const filtering = !!scope && (Array.isArray(scope.includePrefixes) || Array.isArray(scope.excludePrefixes));

  for (const [i, t] of terms.entries()) {
    // 1. locate the region
    let region = output;
    if (t.region !== 'whole-output') {
      let anchor;
      try { anchor = new RegExp(t.region.anchor, 'm'); } catch (e) { return { stop: `INSTRUMENT: term ${i} region anchor /${t.region.anchor}/ is not a valid regex: ${String(/** @type {any} */ (e)?.message ?? e)}`, fault: STOP_FAULTS.CRASHED }; }
      const m = anchor.exec(output);
      if (!m) return { stop: `INSTRUMENT: term ${i} region anchor /${t.region.anchor}/ matched nothing — the region the number lives in could not be located`, fault: STOP_FAULTS.CRASHED };
      const got = m[t.region.capture];
      if (typeof got !== 'string') return { stop: `INSTRUMENT: term ${i} region anchor matched but capture group ${t.region.capture} did not participate`, fault: STOP_FAULTS.CRASHED };
      region = got;
    }

    // 2. collect matches line by line, so the scope filter can read each
    //    line's own path
    let re;
    try { re = new RegExp(t.lineMatch, 'g'); } catch (e) { return { stop: `INSTRUMENT: term ${i} lineMatch /${t.lineMatch}/ is not a valid regex: ${String(/** @type {any} */ (e)?.message ?? e)}`, fault: STOP_FAULTS.CRASHED }; }
    /** @type {number[]} */
    const values = [];
    let dropped = 0;
    let unattributable = 0;
    for (const line of region.split('\n')) {
      const hits = [...line.matchAll(re)];
      if (!hits.length) continue;
      if (filtering) {
        const p = linePath(line, workdir);
        if (p === null) unattributable += 1;
        else if (!inScope(p, scope)) { dropped += 1; continue; }
      }
      for (const h of hits) {
        if (t.capture === null) { values.push(1); continue; }
        const rawCapture = h[t.capture];
        if (typeof rawCapture !== 'string') return { stop: `INSTRUMENT: term ${i} matched but capture group ${t.capture} did not participate — the number is unknown, not zero`, fault: STOP_FAULTS.CRASHED };
        const n = Number.parseInt(rawCapture, 10);
        if (!Number.isFinite(n)) return { stop: `INSTRUMENT: term ${i} captured "${rawCapture}", which is not an integer`, fault: STOP_FAULTS.CRASHED };
        values.push(n);
      }
    }
    if (filtering) {
      if (dropped) notes.push(`term ${i}: ${dropped} matching line(s) dropped by the scope filter`);
      if (unattributable) notes.push(`term ${i}: ${unattributable} matching line(s) named no path, so the scope filter could not judge them — they were KEPT`);
    }

    // 3. aggregate
    let subtotal;
    if (t.aggregate === 'sum') subtotal = values.reduce((a, b) => a + b, 0);
    else {
      if (!values.length) return { stop: `INSTRUMENT: term ${i} (/${t.lineMatch}/, aggregate "first") matched nothing — the number was never reported, so it is unknown, not zero`, fault: STOP_FAULTS.CRASHED };
      subtotal = values[0];
    }
    breakdown.push({ term: i, lineMatch: t.lineMatch, aggregate: t.aggregate, sign: t.sign, matches: values.length, subtotal, contribution: t.sign * subtotal });
    value += t.sign * subtotal;
  }
  return { stop: null, value, breakdown, notes };
}

// ── D12: the baseline is MEASURED at this run's own seed, every run ──────────

/**
 * A caller-scoped holder for detached seed worktrees. Scoped rather than
 * module-global on purpose: a global cache in a published library leaks
 * worktrees into whatever process imported it, and nothing would ever remove
 * them. `seedRead`/`runClose` create one, share it across stages (so a
 * multi-stage close pays for one checkout), and remove it in a `finally`.
 * @returns {SeedTrees}
 */
export function makeSeedTrees() {
  /** @type {Map<string, {workdir: string, root: string, dir: string}>} */
  const made = new Map();
  /** @type {Map<string, {stop: string, fault: string}|{stop: null, dir: string}>} */
  const answers = new Map();
  return {
    async ensure(workdir, seedRef) {
      const key = `${workdir}::${seedRef}`;
      const cached = answers.get(key);
      if (cached) return cached;
      const verify = await git(workdir, ['rev-parse', '--verify', `${seedRef}^{commit}`]);
      if (!verify.ok) {
        const v = { stop: `INSTRUMENT: the seed commit "${seedRef}" does not exist in ${workdir}`, fault: STOP_FAULTS.FAILED };
        answers.set(key, v);
        return v;
      }
      const root = await mkdtemp(join(tmpdir(), 'bareloop-seed-'));
      const dir = join(root, 'tree');
      const add = await git(workdir, ['worktree', 'add', '--detach', dir, seedRef]);
      if (!add.ok) {
        await rm(root, { recursive: true, force: true });
        const v = { stop: `INSTRUMENT: could not create a seed worktree at ${seedRef}: ${String(add.err).trim()}`, fault: add.fault };
        answers.set(key, v);
        return v;
      }
      // A checkout without its toolchain measures a BROKEN toolchain, which
      // would read as an instrument stop on every single run rather than a
      // baseline. Best effort: a missing link surfaces loudly as that stop.
      for (const dep of ['node_modules', '.venv', 'venv']) {
        try { await symlink(join(workdir, dep), join(dir, dep)); } catch { /* absent, or already there */ }
      }
      made.set(key, { workdir, root, dir });
      const v = { stop: null, dir };
      answers.set(key, v);
      return v;
    },
    async cleanup() {
      for (const { workdir, root, dir } of made.values()) {
        await git(workdir, ['worktree', 'remove', '--force', dir]);
        await rm(root, { recursive: true, force: true });
      }
      made.clear();
      answers.clear();
    },
  };
}

/**
 * Is the working tree byte-identical to the seed (the arbiter's own books
 * aside)? When it is, the baseline can honestly be taken in place — and the
 * record SAYS which route was taken.
 * @param {string} workdir @param {string} seedRef
 */
async function treeIsAtSeed(workdir, seedRef) {
  const cs = await changedSet(workdir, seedRef);
  if (cs.stop !== null) return { at: false, stop: cs.stop, fault: cs.fault };
  return { at: cs.paths.length === 0, stop: null, fault: STOP_FAULTS.FAILED };
}

// ── results ─────────────────────────────────────────────────────────────────

/**
 * @param {any} stage @param {Partial<StageResult>} over
 * @returns {StageResult}
 */
const result = (stage, over) => ({
  verdict: 'green',
  exitCode: EXIT_GREEN,
  value: null,
  baseline: null,
  baselineSource: null,
  gapLines: [],
  judged: true,
  stage: stage?.name ?? null,
  kind: stage?.kind ?? null,
  detail: {},
  ...over,
});

/**
 * Contract (a). The stop's own reason still rides the gap channel — an
 * operator reading the close's output must see WHY nothing was judged — and
 * what it never carries is the judged marker.
 *
 * `fault` is the arbiter's four-row vocabulary (`STOP_FAULTS`), stamped by the
 * site that OBSERVED the fault. It defaults to `failed` — "the close cannot
 * run" is the safe reading — and it is carried on `detail` so a consumer routes
 * the stop by a typed field instead of pattern-matching the stop's prose.
 * @param {any} stage @param {Ctx} ctx @param {string} stop @param {Record<string, any>} [detail]
 * @param {string} [fault]
 * @returns {StageResult}
 */
const stopped = (stage, ctx, stop, detail = {}, fault = STOP_FAULTS.FAILED) => result(stage, {
  verdict: 'instrument-stop',
  exitCode: EXIT_STOP,
  judged: false,
  gapLines: new Gap(ctx.gapKeep, ctx.gapCap).push(stop).render(),
  detail: { ...detail, stop, fault },
});

// ── the four kinds ──────────────────────────────────────────────────────────

/** @param {any} stage @param {Ctx} ctx @returns {Promise<StageResult>} */
async function runCommandExit(stage, ctx) {
  const p = stage.params;
  const r = await sh(p.cmd, p.args ?? [], {
    cwd: ctx.workdir,
    env: p.env ?? {},
    timeoutMs: p.timeoutMs ?? ctx.timeoutMsDefault ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: ctx.maxBuffer ?? MAX_BUFFER,
  });
  if (r.stop !== null) return stopped(stage, ctx, r.stop, {}, r.fault);
  const gap = new Gap(ctx.gapKeep, ctx.gapCap);
  for (const name of r.dropped) gap.push(`${stage.name}: declared env var ${name} was DROPPED — the close never hands worker code a credential`);
  const green = r.code === p.expectExit;
  if (!green) {
    gap.push(`${stage.name}: "${p.cmd}${(p.args ?? []).length ? ` ${(p.args ?? []).join(' ')}` : ''}" exited ${r.code}, expected ${p.expectExit}`);
    for (const l of r.out.split('\n').filter((x) => x.trim() !== '')) gap.push(`  ${l}`);
  }
  return result(stage, {
    verdict: green ? 'green' : 'red',
    exitCode: green ? EXIT_GREEN : EXIT_RED,
    gapLines: gap.render(),
    detail: { exit: r.code, expected: p.expectExit, envDropped: r.dropped },
  });
}

/** @param {any} stage @param {Ctx} ctx @returns {Promise<StageResult>} */
async function runCountNotWorse(stage, ctx) {
  const p = stage.params;
  const norm = normalizeParser(p.parser, `${stage.name}.parser`);
  if (!norm.ok) {
    return stopped(stage, ctx, `INSTRUMENT: ${stage.name}'s parser does not normalise: ${norm.reds.map((r) => `${r.path} — ${r.detail}`).join('; ')}`,
      {}, STOP_FAULTS.CRASHED);
  }
  const terms = /** @type {any[]} */ (norm.terms);

  /** @param {string} cwd @param {string} where */
  const measure = async (cwd, where) => {
    const r = await sh(p.cmd, p.args ?? [], {
      cwd,
      env: p.env ?? {},
      timeoutMs: p.timeoutMs ?? ctx.timeoutMsDefault ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: ctx.maxBuffer ?? MAX_BUFFER,
    });
    if (r.stop !== null) return { stop: `${r.stop} (measuring ${where})`, fault: r.fault };
    const v = parseValue(r.out, terms, { scope: p.scope, workdir: cwd });
    if (v.stop !== null) return { stop: `${v.stop} (measuring ${where})`, fault: v.fault };
    return { stop: null, value: v.value, breakdown: v.breakdown, notes: v.notes, exit: r.code, dropped: r.dropped, fault: STOP_FAULTS.FAILED };
  };

  const now = await measure(ctx.workdir, 'the current tree');
  if (now.stop !== null) return stopped(stage, ctx, now.stop, {}, now.fault);

  // D12 — the close stores the COUNTING RULE, never the number, so "seed" is
  // MEASURED at this run's own seed. Which route measured it is recorded.
  let baseline = 0;
  let baselineSource = 'declared 0';
  /** @type {any} */
  let baselineDetail = null;
  if (p.baseline === 'seed') {
    const at = await treeIsAtSeed(ctx.workdir, ctx.seedRef);
    if (at.stop !== null) return stopped(stage, ctx, at.stop, {}, at.fault);
    if ((ctx.baselineMode ?? 'auto') === 'auto' && at.at) {
      baseline = /** @type {number} */ (now.value);
      baselineSource = 'measured IN PLACE — the working tree is verifiably identical to the seed';
      baselineDetail = { breakdown: now.breakdown };
    } else {
      const seedTrees = /** @type {SeedTrees} */ (ctx.seedTrees);
      const st = await seedTrees.ensure(ctx.workdir, ctx.seedRef);
      if (st.stop !== null) return stopped(stage, ctx, st.stop, {}, st.fault);
      const b = await measure(st.dir, `the seed tree at ${ctx.seedRef}`);
      if (b.stop !== null) return stopped(stage, ctx, b.stop, {}, b.fault);
      baseline = /** @type {number} */ (b.value);
      baselineSource = `measured in a detached worktree at ${ctx.seedRef}`;
      baselineDetail = { breakdown: b.breakdown, notes: b.notes };
    }
  }

  const value = /** @type {number} */ (now.value);
  const worse = p.direction === 'lower-is-better' ? value > baseline : value < baseline;
  const gap = new Gap(ctx.gapKeep, ctx.gapCap);
  for (const name of /** @type {string[]} */ (now.dropped ?? [])) gap.push(`${stage.name}: declared env var ${name} was DROPPED — the close never hands worker code a credential`);
  // the scope filter's own arithmetic is announced whichever way the stage
  // lands: a green measured over a filtered population is still a filtered
  // number, and the operator reads why
  for (const n of /** @type {string[]} */ (now.notes)) gap.push(`${stage.name}: ${n}`);
  if (worse) {
    gap.push(`${stage.name}: ${value} against a baseline of ${baseline} (${p.direction}) — worse`);
    gap.push(`  baseline ${baselineSource}`);
    for (const b of /** @type {any[]} */ (now.breakdown)) {
      gap.push(`  term ${b.term} /${b.lineMatch}/ ${b.aggregate}: ${b.matches} match(es), subtotal ${b.subtotal}, contributes ${b.contribution >= 0 ? '+' : ''}${b.contribution}`);
    }
  }
  return result(stage, {
    verdict: worse ? 'red' : 'green',
    exitCode: worse ? EXIT_RED : EXIT_GREEN,
    value,
    baseline,
    baselineSource,
    gapLines: gap.render(),
    detail: {
      direction: p.direction,
      breakdown: now.breakdown,
      baselineBreakdown: baselineDetail,
      notes: now.notes,
      commandExit: now.exit,
      envDropped: now.dropped ?? [],
    },
  });
}

/** @param {any} stage @param {Ctx} ctx @returns {Promise<StageResult>} */
async function runPatternAbsentInDiff(stage, ctx) {
  const p = stage.params;
  const cs = await changedSet(ctx.workdir, ctx.seedRef);
  if (cs.stop !== null) return stopped(stage, ctx, cs.stop, {}, cs.fault);

  const untracked = new Set(cs.untracked);
  const exts = p.extensions.map((/** @type {string} */ e) => (String(e).startsWith('.') ? String(e) : `.${e}`));
  const scanned = cs.paths.filter((rel) => exts.some((e) => rel.endsWith(e)) && inScope(rel, p.scope));

  /** @type {RegExp[]} */
  const res = [];
  for (const q of p.patterns) {
    try { res.push(new RegExp(q.regex)); } catch (e) { return stopped(stage, ctx, `INSTRUMENT: pattern "${q.id}" is not a valid regex: ${String(/** @type {any} */ (e)?.message ?? e)}`, {}, STOP_FAULTS.CRASHED); }
  }

  const gap = new Gap(ctx.gapKeep, ctx.gapCap);
  /** @type {any[]} */
  const hits = [];
  /** @type {string[]} */
  const notes = [];
  for (const rel of scanned) {
    const a = await addedLines(ctx.workdir, ctx.seedRef, rel, { untracked: untracked.has(rel) });
    if (a.stop !== null) return stopped(stage, ctx, a.stop, {}, a.fault);
    if (a.note) notes.push(a.note);
    for (const { n, text } of a.lines) {
      p.patterns.forEach((/** @type {any} */ q, /** @type {number} */ i) => {
        if (res[i].test(text)) hits.push({ id: q.id, path: rel, line: n, text: text.trim().slice(0, 200) });
      });
    }
  }
  for (const n of notes) gap.push(`${stage.name}: ${n}`);
  if (hits.length) {
    gap.push(`${stage.name}: ${hits.length} forbidden pattern occurrence(s) in lines this run ADDED`);
    // the file is named because the SCAN itself reported it — contract (b)'s
    // limit bars naming a culprit the instrument did not name, not echoing
    // one it did
    for (const h of hits) gap.push(`  [${h.id}] ${h.path}:${h.line}: ${h.text}`);
  }
  return result(stage, {
    verdict: hits.length ? 'red' : 'green',
    exitCode: hits.length ? EXIT_RED : EXIT_GREEN,
    gapLines: gap.render(),
    detail: { scannedFiles: scanned, hits, notes, changedTotal: cs.paths.length, excluded: cs.excluded },
  });
}

/** @param {any} stage @param {Ctx} ctx @returns {Promise<StageResult>} */
async function runFilesChanged(stage, ctx) {
  const p = stage.params;
  const cs = await changedSet(ctx.workdir, ctx.seedRef);
  if (cs.stop !== null) return stopped(stage, ctx, cs.stop, {}, cs.fault);
  const outside = cs.paths.filter((rel) => !p.allowPrefixes.some((/** @type {string} */ pre) => underPrefix(rel, pre)));
  const empty = p.requireNonEmpty === true && cs.paths.length === 0;
  const gap = new Gap(ctx.gapKeep, ctx.gapCap);
  if (empty) gap.push(`${stage.name}: nothing changed against the seed — the changed set is empty`);
  if (outside.length) {
    gap.push(`${stage.name}: ${outside.length} changed file(s) lie outside ${p.allowPrefixes.join(', ')}`);
    for (const o of outside) gap.push(`  ${o}`);
  }
  const red = empty || outside.length > 0;
  return result(stage, {
    verdict: red ? 'red' : 'green',
    exitCode: red ? EXIT_RED : EXIT_GREEN,
    gapLines: gap.render(),
    detail: { changed: cs.paths, outside, excluded: cs.excluded, empty },
  });
}

/** @type {Record<string, (stage: any, ctx: Ctx) => Promise<StageResult>>} */
const RUNNERS = {
  'command-exit': runCommandExit,
  'count-not-worse': runCountNotWorse,
  'pattern-absent-in-diff': runPatternAbsentInDiff,
  'files-changed': runFilesChanged,
};

/**
 * Run ONE declared stage against a workdir at a seed.
 *
 * It never throws. An unexpected throw inside a kind — a malformed parameter
 * the validator did not catch, an unreachable path — is an INSTRUMENT STOP,
 * not a red: that is the casualty-vs-evidence split at its narrowest, and
 * the direction that matters, because a crash rendered as a red is fake
 * evidence about the worker.
 * @param {any} stage `{name, kind, params}`
 * @param {Ctx} ctx
 * @returns {Promise<StageResult>}
 */
export async function runStage(stage, ctx) {
  const owned = !ctx.seedTrees;
  const seedTrees = ctx.seedTrees ?? makeSeedTrees();
  try {
    return await runStageIn(stage, { ...ctx, seedTrees });
  } finally {
    if (owned) await seedTrees.cleanup();
  }
}

/** @param {any} stage @param {Ctx} ctx @returns {Promise<StageResult>} */
async function runStageIn(stage, ctx) {
  if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) return stopped(null, ctx, 'INSTRUMENT: a stage must be an object {name, kind, params}', {}, STOP_FAULTS.CRASHED);
  const fn = RUNNERS[stage.kind];
  if (!fn) {
    return stopped(stage, ctx, `INSTRUMENT: stage "${stage.name}" declares kind "${stage.kind}", which this executor does not implement (locked or unknown) — the live kinds are ${LIVE_KINDS.join(', ')}`,
      { kind: stage.kind }, STOP_FAULTS.CRASHED);
  }
  if (stage.params === null || typeof stage.params !== 'object') return stopped(stage, ctx, `INSTRUMENT: stage "${stage.name}" declares no params object`, {}, STOP_FAULTS.CRASHED);
  try {
    return await fn(stage, ctx);
  } catch (e) {
    return stopped(stage, ctx, `INSTRUMENT: stage "${stage.name}" threw: ${String(/** @type {any} */ (e)?.stack ?? e)}`, {}, STOP_FAULTS.CRASHED);
  }
}

/**
 * D12's seed-verdict read: run EVERY declared stage at the seed, regardless
 * of reds, and hand back one row per stage.
 *
 * Not first-red-wins, and the reason is structural rather than a preference:
 * every shipped close opens with `changed-from-seed`, which is RED at its own
 * seed by construction (nothing has changed yet), so a first-red-wins seed
 * read measures exactly one stage and mints no baseline for any other. The
 * baseline every `baseline: "seed"` stage is later graded against comes from
 * here, so a stage that never ran is a stage with no bar.
 * @param {any} declaration `{stages: [...]}`
 * @param {Ctx} ctx
 * @returns {Promise<StageResult[]>}
 */
export async function seedRead(declaration, ctx) {
  const owned = !ctx.seedTrees;
  const seedTrees = ctx.seedTrees ?? makeSeedTrees();
  const inner = { ...ctx, seedTrees };
  try {
    /** @type {StageResult[]} */
    const rows = [];
    for (const stage of declaration?.stages ?? []) rows.push(await runStageIn(stage, inner));
    return rows;
  } finally {
    if (owned) await seedTrees.cleanup();
  }
}

/**
 * The GRADING path: stages in declared order, FIRST RED WINS. The deciding
 * stage names the verdict; everything after it is `not-reached` and is
 * reported as such rather than as a green nobody ran.
 *
 * An instrument stop ends the close UNJUDGED — the run has no verdict to
 * carry, which is the whole point of keeping a casualty out of the evidence.
 *
 * NAMED `runDeclaredClose`, not `runClose` (M4's export-surface decision): the
 * arbiter's shell already ships a public `runClose(argv, redact, opts)` that
 * adopters import, and the two take different things and mean different things
 * — one runs a DECLARATION, the other an argv. Renaming the shipped one to make
 * room would break a documented adopter contract for nothing; the new name says
 * exactly what differs. `src/declaredclose.js` is what bridges the two shapes.
 * @param {any} declaration @param {Ctx} ctx
 * @returns {Promise<{verdict: 'green'|'red'|'instrument-stop', exitCode: number, judged: boolean, firstRed: string|null, stages: StageResult[]}>}
 */
export async function runDeclaredClose(declaration, ctx) {
  const owned = !ctx.seedTrees;
  const seedTrees = ctx.seedTrees ?? makeSeedTrees();
  const inner = { ...ctx, seedTrees };
  try {
    /** @type {StageResult[]} */
    const stages = [];
    let ended = false;
    for (const stage of declaration?.stages ?? []) {
      if (ended) {
        stages.push(result(stage, { verdict: 'not-reached', exitCode: null, judged: false }));
        continue;
      }
      const r = await runStageIn(stage, inner);
      stages.push(r);
      if (r.verdict !== 'green') ended = true;
    }
    const deciding = stages.find((s) => s.verdict === 'red' || s.verdict === 'instrument-stop');
    return {
      verdict: /** @type {'green'|'red'|'instrument-stop'} */ (deciding ? deciding.verdict : 'green'),
      exitCode: deciding ? /** @type {number} */ (deciding.exitCode) : EXIT_GREEN,
      judged: deciding ? deciding.judged : true,
      firstRed: deciding ? deciding.stage : null,
      stages,
    };
  } finally {
    if (owned) await seedTrees.cleanup();
  }
}
