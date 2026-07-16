// The interpreter — the ONLY code that reads a workflow config (PRD §4's
// emergent middle, executed). It composes the suite, never invents: litectx is
// the store, bareguard is the leash, bareagent is the worker loop (design law
// #10). The provider arrives from the SHELL (never the config — it is
// arbiter-adjacent), and the close never runs here: the shell runs it and
// feeds the verdict back as `gap`.
//
// Two traps this encodes, both paid for in adaptlearn: `onLlmResult` is a Loop
// CONSTRUCTOR option — passed to run() it is silently ignored and the budget
// axis goes blind (F3); and a budget-exhausted gate deny must surface as
// cap-halt, its own category, never a generic error (design law #8).

import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { Gate, redact } from 'bareguard';
import { LiteCtx, compress } from 'litectx';
import { validateConfig, diffPaths, globToPrefix, SECRET_PATTERNS } from './validate.js';
import { ralph } from './ralph.js';

/** @typedef {Error & {category?: string}} CategorizedError the failure map's carrier: ralph relays by `category` */

// consecutive close reds that count as a stall; one revision per run
export const STALL_REDS = 2;

const require = createRequire(import.meta.url);
const { Loop, wireGate, HaltError } = require('bare-agent');
const { createShellTools } = require('bare-agent/tools');

import { extractArtifact, priceOf } from './text.js';

/** @typedef {{body?: string|null, text?: string|null}} RecallHit litectx recall hit — body present only with `{body: true}` */

const PERSONA = 'You are a senior engineer. Reply with ONLY the complete contents of the requested JavaScript file — no markdown fences, no commentary. ESM.';
// The tool persona states the LOOP CONTRACT (F16): the worker is one attempt inside
// `while close-red and under-cap`, not a one-shot. Without knowing that, a model does
// the rational one-shot thing — read everything, be certain, then act — and the real
// run spent its ENTIRE budget on 12 rounds of reading without one write, never once
// reaching the close. Every round re-pays for every earlier tool result, so reads
// compound: that run's context grew 2k → 121k tokens and its last round cost $0.25.
// Telling the worker it will be re-run with the close's verdict makes an early,
// cheap, wrong attempt the rational move — which is exactly what the loop wants.
const PERSONA_TOOLS = 'You are a senior engineer working in a repository through file tools. '
  + 'ALWAYS use absolute paths — relative paths resolve against the process, not the repository, and will be denied. '
  + 'You are ONE attempt inside an automated loop: when you finish, a test suite runs and, if it still fails, you are called again with its output. '
  + 'So do not try to be certain before acting. Read only what you need to form your best hypothesis, make the change with the write tool, and stop. '
  + 'A wrong cheap attempt is corrected by the next round; exhaustive reading is not — every file you read is re-sent on every later round and the run has a hard budget it can exhaust before you ever write. '
  + 'Make the required changes with the write tool, then reply with a short summary of what you changed. Never put file contents in your reply.';

// ---- tool mode (2b): the spec-side grant menu mapped to the underlying tools ----
// read/grep/write are bare-agent's shell tools; recall/get are litectx's retrieval
// verbs (F19), composed from the SAME LiteCtx the memory hooks already use.
const TOOL_BY_VERB = Object.freeze({ read: 'shell_read', grep: 'shell_grep', write: 'shell_write', edit: 'shell_edit', recall: 'ctx_recall', get: 'ctx_get' });
const CTX_TOOLS = Object.freeze(['ctx_recall', 'ctx_get']);

/**
 * The retrieval pair (F19). `shell_read` cannot seek — it starts at byte zero — so a
 * pointer at a symbol was inert and the worker paged whole files to reach one function.
 * `ctx_recall` hands back a POINTER (no body: a search index returns pointers, and bodies
 * on every hit rebuild the bloat — measured, a 5-hit recall dumps ~15k tokens unbidden);
 * `ctx_get` trades that pointer for ONE chunk. A chunk starts at its doc-comment, so the
 * body arrives WITH the docstring that says what it was supposed to do.
 * @param {any} lc the run's LiteCtx (rooted at workdir)
 * @param {string} workdir
 * @param {(type: string, data: object) => void} emit the spine — a retrieval verb whose
 *   RESULT is invisible cannot be judged: a `ctx_get` that silently reds (stale pointer,
 *   bad range) looks exactly like one that worked, and the worker's fallback to a
 *   whole-file read looks like a free choice instead of a forced one.
 */
function createCtxTools(lc, workdir, emit) {
  return [
    {
      name: 'ctx_recall',
      description: 'Search the repository index for a symbol or phrase. Returns POINTERS (path, symbol, line range) — not code. '
        + 'Pass a pointer to ctx_get to read that one function. Search finds what you can NAME: it will not find a bug from a failing '
        + "test's output (the symptom and the cause live in different files) — read the failing test first, then recall the function it calls.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Symbol name or phrase, e.g. "keywords" or "stopword filter".' },
          n: { type: 'integer', description: 'Max pointers to return (default 5, max 20).' },
        },
        required: ['query'],
      },
      execute: async (/** @type {{query: string, n?: number}} */ { query, n }) => {
        const hits = await lc.recall(String(query), { kind: 'code', n: Math.min(Math.max(Number(n) || 5, 1), 20) });
        const out = hits.length
          ? hits.map((/** @type {any} */ h) => (h.chunk
            ? `${h.path}\t${h.chunk.symbol ?? '(anonymous)'}\t${h.chunk.nodeType}\tlines ${h.chunk.startLine}-${h.chunk.endLine}`
            : `${h.path}\t(whole file — no chunk)`)).join('\n')
          : 'no hits';
        emit('ctx-tool', { tool: 'ctx_recall', query: String(query), hits: hits.length, paths: hits.map((/** @type {any} */ h) => h.path), bytes: Buffer.byteLength(out) });
        return out;
      },
    },
    {
      name: 'ctx_get',
      description: 'Read ONE function by the line range ctx_recall gave you — code plus its doc-comment, without the rest of the file. '
        + 'The line range is a HANDLE you copy from ctx_recall, never one you compute: a range that is not a chunk boundary is refused, '
        + 'and a file edited since it was indexed is refused (re-run ctx_recall for a fresh pointer).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repository-relative path, exactly as ctx_recall printed it.' },
          startLine: { type: 'integer', description: 'From ctx_recall.' },
          endLine: { type: 'integer', description: 'From ctx_recall.' },
        },
        required: ['path', 'startLine', 'endLine'],
      },
      execute: async (/** @type {{path: string, startLine: number, endLine: number}} */ { path: p, startLine, endLine }) => {
        // The path is spelled as recall printed it (repo-relative); the gate judges the
        // resolved absolute path, exactly as toolAction resolves it.
        const rel = String(p).startsWith(workdir) ? String(p).slice(workdir.length + 1) : String(p);
        try {
          const item = lc.get(rel, { startLine: Number(startLine), endLine: Number(endLine) });
          if (!item?.text) {
            emit('ctx-tool', { tool: 'ctx_get', path: rel, startLine, endLine, outcome: 'no-chunk', bytes: 0 });
            return `no chunk at ${startLine}-${endLine} in "${rel}" — copy a line range from ctx_recall, do not compute one`;
          }
          emit('ctx-tool', { tool: 'ctx_get', path: rel, startLine, endLine, outcome: 'ok', bytes: Buffer.byteLength(item.text) });
          return item.text;
        } catch (e) {
          // StalePointerError: the file changed after indexing, so these lines now describe
          // DIFFERENT code. Its message IS the recovery instruction — hand it to the worker.
          const detail = String(/** @type {Error} */ (e)?.message || e);
          emit('ctx-tool', { tool: 'ctx_get', path: rel, startLine, endLine, outcome: 'stale', bytes: 0, detail });
          return `stale pointer: ${detail}`;
        }
      },
    },
  ];
}

// The load-bearing containment line (2b POC, scenario B): bare-agent's built-in
// tools are deliberately ungated and their action type is their own NAME, which
// never trips bareguard's fs primitives — this translator maps them onto
// write/read actions so the SAME fence text mode enforces manually governs
// every tool call. Paths resolve exactly as the tools resolve them
// (path.resolve(expandHome(p)), POC scenario F) so the gate judges the same
// file the tool would touch; a relative spelling resolves against the process
// cwd and reds at the fence, and the deny reason teaches the retry.
/** @param {string} p */
const expandHome = (p) => (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p;
/** @param {string} name @param {any} args @param {string} [workdir] */
const toolAction = (name, args, workdir) => {
  if (name === 'shell_write') return { type: 'write', path: resolve(expandHome(String(args?.path ?? ''))), args: { bytes: String(args?.content ?? '').length } };
  // shell_edit (BA-13) is judged as bareguard's own 'edit' action type — the SAME
  // fs.writeScope fence as write, decided upstream (bareguard FS_TYPES). `bytes` is
  // the replacement's size so the audit can read the edit economy (a 40-byte splice
  // vs an 8KB rewrite is the variable BA-13 exists to move — F18 blindness rule).
  if (name === 'shell_edit') return { type: 'edit', path: resolve(expandHome(String(args?.path ?? ''))), args: { bytes: String(args?.newText ?? '').length } };
  // `tool` rides the action so the AUDIT can tell the read tools apart. Without it every
  // read tool collapses to {type:'read', path} and a whole-file shell_read is
  // indistinguishable from a bounded ctx_get chunk — the ledger cannot see the one
  // variable the retrieval arm exists to test (the F18 blindness, repeated).
  if (name === 'shell_read' || name === 'shell_grep') return { type: 'read', path: resolve(expandHome(String(args?.path ?? ''))), args: { tool: name } };
  // The retrieval verbs are READS and are judged as reads by the SAME fence (F14/F19):
  // ctx_get names a file, so the gate judges that file — the deny list (gate audit,
  // primitive smoke, the litectx store itself) applies to a chunk read exactly as it
  // applies to shell_read, or the worker would read the arbiter's books through the
  // other door. ctx_recall names no file: it is a read OF THE INDEX, judged against the
  // run directory, so it is contained by readScope and cannot reach outside the repo.
  if (name === 'ctx_get') return { type: 'read', path: resolve(String(workdir ?? ''), expandHome(String(args?.path ?? ''))), args: { tool: name } };
  if (name === 'ctx_recall') return { type: 'read', path: resolve(String(workdir ?? '')), args: { tool: name } };
  return { type: name, args };
};

/**
 * Execute a workflow config against one task under the dumb shell.
 *
 * @param {object|string} configRaw schema v1 config (object or raw JSON text)
 * @param {object} opts
 * @param {string} opts.task implement instruction shown to the worker
 * @param {string} [opts.target] absolute path the artifact is written to —
 *        required in text mode; unused in tool mode (the worker writes through
 *        the gated tools, wherever the fence allows)
 * @param {string[]} opts.close argv whose exit code is truth (shell-owned)
 * @param {number} [opts.closeExpect] the exit code the SIGNED spec calls success
 * @param {{pattern: string, min: number}} [opts.closeJudged] the signed spec's
 *   judgment-rendered signal — proof the close actually judged something before
 *   its exit code is believed in EITHER direction (PRD v1.11; the drafted config
 *   cannot express it, and must not: it is the arbiter's own honesty check)
 * @param {string} [opts.closeGapKeep] the signed spec's kept-failures pattern (F28):
 *   close-output lines matching it survive the gap bound, so a large suite's
 *   `not ok` names reach the worker instead of being elided into "N fail" — also
 *   arbiter territory, inexpressible in the drafted config
 * @param {string} opts.workdir run directory (litectx root, gate audit, scope base)
 * @param {number} opts.capRuns shell iteration budget; the config may tighten via loop.maxIterations, never exceed
 * @param {(type: string, data?: object) => object} opts.emit spine emitter
 * @param {object} opts.provider a bareagent provider — SHELL-owned binding (adaptlearn F8: an unsealed binding is a gate bypass)
 * @param {number} [opts.shellCapUsd=2] the shell's USD cap; a config budgetUsd above it REDS at validation (bounds — no silent clamping)
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap, threaded to the shell
 *        (shell/operator territory — the workflow config cannot express it)
 * @param {string[]} [opts.jobWriteScope] the job spec's outer write fence (operator law,
 *        job-v1) — enforced HERE, the one choke point where a config becomes a Gate:
 *        every workflow scope must fit inside it (scope-escape config-red otherwise),
 *        on entry validation and on every revision candidate alike
 * @param {(o: {config: object, gaps: string[], policy: any, onLlmResult: any}) => Promise<{candidate: object|null, parseError?: string|null, costUsd?: number}>} [opts.revisor]
 *        optional mid-run revision seam. Fires ONCE per run after STALL_REDS consecutive
 *        close reds. The interpreter — never the revisor — owns acceptance: the candidate
 *        must validate, and gate/escalation/loop.maxIterations must be unchanged
 *        (arbiter-touch / cap-touch revision-reds otherwise; the run continues on the old
 *        config). Revisor spend rides the run's own gate handlers — same budget axis as
 *        the worker.
 * @param {string} [opts.closeState] the close's CURRENT output on the tree as it stands
 *        (the shell's pre-token close check, F13) — shown to the first attempt only, and
 *        never framed as an attempt: the worker cannot run the close itself (`run` is a
 *        locked verb), so without this it is asked to fix a failure it cannot see
 * @param {'text'|'tools'} [opts.mode] middle mode (2b): 'text' (default) writes the ONE
 *        target from the response artifact; 'tools' gives the worker Gate-governed file
 *        tools — SPEC-side territory (the step declares it; the config cannot express it)
 * @param {string[]} [opts.tools] the spec's tool grant (subset of read|grep|write,
 *        job-v1 validated); defaults to the full menu in tool mode
 * @returns {Promise<'green'|'escalated'|'config-red'>}
 */
export async function interpret(configRaw, { task, target, close, workdir, capRuns, emit, provider, shellCapUsd = 2, jobWriteScope, revisor, closeTimeoutMs, mode = 'text', tools, closeState, closeExpect, closeJudged, closeGapKeep }) {
  // Reds-before-tokens: text mode writes ONE artifact — a missing target is a
  // caller bug that must be loud NOW, not a TypeError after a paid worker call
  // that ralph would misfile as interpreter-red (the gate skips an absent path,
  // so nothing downstream catches it before writeFileSync(undefined)).
  if (mode === 'text' && (typeof target !== 'string' || !target)) {
    throw new TypeError('interpret: text mode requires target (the absolute artifact path)');
  }
  // Normalize ONCE: a trailing slash or a relative spelling must mean the same
  // directory everywhere below — the enforcement belt compares string prefixes,
  // and "/run/" vs "/run" would false-red every legal scope (release review).
  workdir = resolve(workdir);
  const v = validateConfig(configRaw, { shellCapUsd, jobWriteScope });
  emit('config-validate', { ok: v.ok, reds: v.reds });
  if (!v.ok) {
    for (const r of v.reds) emit('config-red', r);
    emit('run-end', { outcome: 'config-red', iterations: 0 });
    return 'config-red';
  }
  let config = /** @type {any} */ (v.config); // single parse — validateConfig returns the parsed config on ok

  const lc = new LiteCtx({ root: workdir });
  // Enforcement belt (law #1, un-gameable gate): resolve every scope and prove
  // it stays under workdir BEFORE building the Gate. validateConfig already
  // rejects escaping scopes, so this is defense in depth — a future globToPrefix
  // regression (a spelling that normalizes to an absolute path) can never reach
  // a live Gate fence. The interpreter and the validator must never disagree (F9).
  const resolvedScopes = config.gate.writeScope.map((/** @type {string} */ g) => resolve(workdir, globToPrefix(g)));
  // equality counts as escaped: no legal scope resolves to workdir itself (the
  // close lives there), so a scope normalizing to ''/'.' is a regression, not a grant
  const escaped = resolvedScopes.filter((/** @type {string} */ abs) => !abs.startsWith(workdir + sep));
  if (escaped.length) {
    for (const abs of escaped) emit('config-red', { code: 'scope-escape', path: 'gate.writeScope', detail: `resolved scope ${abs} escapes the run directory` });
    emit('run-end', { outcome: 'config-red', iterations: 0 });
    return 'config-red';
  }
  // The attempt's round bound — ONE number for the Gate's run-wide maxTurns and the
  // per-attempt cutoff below (two literals here once drifted apart in kind: the
  // advertised/enforced class). 24→40 on hamr's word 2026-07-16 (TESTGEN amendment
  // 2026-07-16e): the curve measured that prompting cannot buy readability at 24 —
  // the read-first prelude eats the window before the first write.
  const TURNS_PER_ATTEMPT = mode === 'tools' ? 40 : 8;
  const gate = new Gate({
    // bareguard fs.writeScope is prefix-containment, not glob (adaptlearn F4); globToPrefix
    // is the ONE transform shared with the validator's legality rule — mid-path wildcards
    // and workdir-escaping scopes were already rejected up front (adaptlearn F9, law #1).
    // Tool mode adds readScope: the worker's reads stay inside the run directory —
    // the stray-read secrets channel (~/.ssh, /etc) closes with one field (2b POC D).
    // Tool mode adds readScope (the stray-read secrets channel, 2b POC D) AND
    // deny (F14): readScope is the whole workdir, which CONTAINS the run's own
    // machinery — the gate's audit ledger, the primitive-smoke store, the litectx
    // memory store. The real run's worker read its own gate audit and spine. The
    // emergent middle does not author the arbiter, and it does not get to read the
    // arbiter's books either: that is an invitation to fit-to-pass and it fills the
    // context with the run's own bookkeeping instead of the repository's code.
    fs: {
      writeScope: resolvedScopes,
      ...(mode === 'tools'
        ? { readScope: [workdir], deny: [join(workdir, 'gate-audit.jsonl'), join(workdir, '.smoke'), join(workdir, '.litectx')] }
        : {}),
    },
    budget: { maxCostUsd: config.gate.budgetUsd },
    // text mode is ~1-2 rounds per attempt; tool mode is N rounds (read→write→…)
    limits: { maxTurns: TURNS_PER_ATTEMPT * (capRuns + 1) },
    audit: { path: join(workdir, 'gate-audit.jsonl') },
    humanChannel: async () => ({ decision: 'terminate' }), // no human mid-run: a tripped cap terminates → decision-ready escalation
  });
  await gate.init();
  // The crash-attribution instrument (F32): which files has the worker written this
  // run? Answered from the arbiter's OWN books — the gate audit's allow-decision
  // write lines, run_id-scoped because the audit file appends across steps and runs.
  // Both middles land here: tool-mode writes are policy-checked, text-mode writes go
  // through gate.check. Read on demand (only ever at a crashed verdict) and
  // fail-closed: an unreadable audit attributes nothing, so the crash escalates
  // exactly as it did before F32 — attribution can only ADD a recovery path, never
  // swallow an instrument stop.
  const auditPath = join(workdir, 'gate-audit.jsonl');
  const workerWrites = () => {
    try {
      const paths = new Set();
      for (const line of readFileSync(auditPath, 'utf8').split('\n')) {
        if (!line) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        if (rec.run_id === gate.runId && rec.phase === 'gate' && rec.decision === 'allow'
            && (rec.action?.type === 'write' || rec.action?.type === 'edit')
            && typeof rec.action.path === 'string') paths.add(rec.action.path);
      }
      return [...paths];
    } catch { return []; }
  };
  const { policy, onLlmResult } = wireGate(gate, mode === 'tools' ? { actionTranslator: (/** @type {string} */ n, /** @type {any} */ a) => toolAction(n, a, workdir) } : {});
  // Money is metered as it is SPENT — per ROUND, not per attempt (F12). A
  // multi-round attempt that halts (or throws) never returns, so its rounds
  // never reach `worker-result`: the real run bought $1.4375 of tokens inside a
  // halted attempt and the job ledger reported $0.0048. `onLlmResult` is the one
  // seam that sees every round, and it fires BEFORE the gate records the round —
  // so even the round that trips the cap lands on the spine. Emitted first, then
  // forwarded verbatim: the gate's own accounting is never altered. costUsd/
  // pricing ride AS-IS (a null is the honest unknown, never $0 — F6).
  /** @type {number|undefined} the attempt a round belongs to (display only) */
  let roundIteration;
  // F20 — THE ATTEMPT HAD NO BOUND, so ralph never ralphed. `limits.maxTurns` is bareguard's,
  // and the Gate is constructed ONCE for the whole RUN: it is a run-wide HALT, not a
  // per-attempt cap. Nothing else ended an attempt — a tool-mode attempt ran until the model
  // CHOSE to stop calling tools. A worker that has never been told it is wrong does not stop:
  // measured, attempt #1 ran 55 rounds, spent the entire $1.50 budget, and the close NEVER RAN
  // ONCE (zero verdicts, zero gaps, zero writes). The loop's whole premise — a cheap wrong
  // attempt corrected by the next round — was unreachable, and the persona's promise ("a test
  // suite runs and you are called again") was a lie the shell never kept.
  // `loop.stop()` breaks at the round boundary and — since bare-agent 0.27.0 (BA-3/BA-5) —
  // returns the transcript with `error: null` and the produced text preserved, so the attempt
  // ends cleanly, its summary stands, and the close renders the verdict that feeds the next
  // attempt. (Before 0.27.0 stop() fell through to a HARD_ROUND_LIMIT return carrying a bogus
  // error, which bareloop had to un-lie behind a `stoppedByBound` flag — the upgrade removed
  // both the lie and the shim; see ask().) Per-attempt, because each attempt is a FRESH
  // conversation (the context resets), which is what keeps four bounded attempts inside a
  // budget one unbounded attempt exhausts.
  /** rounds spent inside the CURRENT attempt (reset per attempt, unlike the gate's run-wide tick) */
  let roundsThisAttempt = 0;
  /** @type {number|undefined} the attempt that was cut short by the bound (spine + gap note) */
  let attemptBounded;
  // `tokens` alone cannot answer the question the ledger exists to answer.
  // bare-agent's `inputTokens` is the UNCACHED prompt remainder — re-sent context
  // is billed as a cache READ and never appears in it. So a round that re-pays for
  // half the repo and a round that reads it fresh can carry the same `tokens`, at
  // very different cost. Record the four tiers the provider actually prices
  // separately, and record the `kind` (a summarizer fold is an LLM call too, and
  // must never hide inside the worker's own numbers).
  /** @param {{costUsd?: number|null, pricing?: string|null, usage?: any, kind?: string}} arg */
  const meteredOnLlmResult = async (arg) => {
    const u = arg?.usage ?? {};
    emit('worker-round', {
      iteration: roundIteration,
      kind: arg?.kind ?? 'turn',
      costUsd: arg?.costUsd ?? null,
      pricing: arg?.pricing ?? null,
      tokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
      usage: {
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        cacheReadTokens: u.cacheReadTokens ?? 0,
        cacheCreationTokens: u.cacheCreationTokens ?? 0,
      },
    });
    // The attempt's own bound (F20). A summarizer fold is an LLM call but not a worker
    // ROUND — counting it would let a fold shorten the attempt that paid for it.
    if ((arg?.kind ?? 'turn') === 'turn' && mode === 'tools') {
      roundsThisAttempt += 1;
      if (roundsThisAttempt >= TURNS_PER_ATTEMPT) {
        // Clean stop at the round boundary: since 0.27.0 (BA-3/BA-5) run() returns the
        // transcript with error=null and the text preserved, so this is an attempt that
        // ENDED, not one that FAILED. The close now runs and its verdict becomes the next
        // attempt's gap — which is the entire point.
        attemptBounded = roundIteration;
        emit('attempt-bounded', { iteration: roundIteration, rounds: roundsThisAttempt, cap: TURNS_PER_ATTEMPT });
        loop.stop();
      }
    }
    return onLlmResult(arg);
  };
  // The offered tools ARE the grant (2b decision #2): an ungranted tool is never
  // in the menu the model sees — a call to it is "unknown tool", not a deny.
  const toolDefs = mode === 'tools'
    ? await (async () => {
      const granted = new Set((tools ?? Object.keys(TOOL_BY_VERB)).map((v) => /** @type {Record<string, string>} */ (TOOL_BY_VERB)[v]));
      const shell = createShellTools().tools.filter((/** @type {{name: string}} */ t) => granted.has(t.name));
      const ctx = CTX_TOOLS.some((t) => granted.has(t))
        ? createCtxTools(lc, workdir, emit).filter((t) => granted.has(t.name))
        : [];
      // A retrieval verb with no index is a tool that always answers "no hits". Index is
      // incremental (unchanged files skipped) and BM25-only: measured on the real repo, the
      // semantic tier costs 26s of embedding and does NOT find a symbol the lexical tier
      // misses (for code it only RE-RANKS a BM25-gated pool — it cannot nominate), and it
      // demoted the exact-symbol hit from rank 1 to rank 4. Lexical is the better instrument here.
      if (ctx.length) await lc.index();
      return [...shell, ...ctx];
    })()
    : [];

  // The retrieval verbs only pay if the worker reaches for them INSTEAD of paging a file.
  // F18 measured the failure they exist to fix: the worker read one 117 KB file NINE times
  // and dragged 1.37 MB of source through context to reach an 8-line function. The tool
  // descriptions carry the mechanics; the persona has to carry the STRATEGY, or a model
  // with a familiar `read` and an unfamiliar `recall` will simply keep reading.
  const RETRIEVAL_STRATEGY = '\nYou also have a repository index. To read a function, do NOT read its whole file: '
    + 'call ctx_recall with the function name to get a pointer, then ctx_get with that pointer to read that function alone '
    + '(it comes with its doc-comment, which states what the function is SUPPOSED to do — compare it against what the code does). '
    + 'Reserve shell_read for whole files that are genuinely small, and for files you cannot name a symbol in yet. '
    + 'Search only finds what you can NAME: a failing test names the symptom, not the cause, so read the failing test first, '
    + 'see which function it calls, and recall THAT.';
  // BA-13: like retrieval, the edit verb only pays if the worker reaches for it INSTEAD
  // of a whole-file rewrite. F31 measured the default: 4 of 5 big-file whole-writes
  // broke the tree, and every one was a rewrite to change ~one line. The tool
  // description carries the mechanics; the persona carries the strategy.
  const EDIT_STRATEGY = '\nPrefer the edit tool over whole-file writes: quote the EXACT text to change (it must match exactly once) and its replacement. '
    + 'Rewriting a whole file to change one line is how trees get broken and budgets get burned — reserve the write tool for genuinely new files.';
  const usesCtx = toolDefs.some((/** @type {{name: string}} */ t) => CTX_TOOLS.includes(t.name));
  const usesEdit = toolDefs.some((/** @type {{name: string}} */ t) => t.name === 'shell_edit');
  const loop = new Loop({
    provider,
    system: mode === 'tools' ? PERSONA_TOOLS + (usesEdit ? EDIT_STRATEGY : '') + (usesCtx ? RETRIEVAL_STRATEGY : '') : PERSONA,
    policy,
    onLlmResult: meteredOnLlmResult,
  });

  /** @param {string} slot */
  const slotOps = (slot) => config.hooks?.[slot] ?? [];
  /** @param {{kinds?: string[]}} op */
  const recallKinds = (op) => op.kinds ?? config.memory.recall?.kinds ?? ['fact'];

  /** @param {string} prompt */
  async function ask(prompt) {
    let r;
    try {
      // cacheMessages (BA-1, bare-agent 0.27.0): roll an Anthropic cache breakpoint onto the
      // transcript so a tool loop stops re-buying its whole growing history at full price every
      // round — F18 measured 754k full-price tokens, $1.55, and the job died at the cap without
      // one write. Opt-in and provider-routed (loop.run forwards options to generate): a
      // non-Anthropic binding ignores it, and it is safe because bareloop wires no trim/compaction
      // fold — the one interaction (a fold that rewrites the cached prefix) that would defeat it.
      // maxTokens (F30): the provider's 4096 default cannot hold a whole-file
      // shell_write of a real source file — the API cuts the round, BA-6 surfaces
      // `truncated:max_tokens`, and doctrine reads it provider-red: run over.
      // Battery pass 1 lost 3/3 rows to exactly this. Output budget is shell
      // territory (never the config's); 32k fits any single-file write the
      // writeScope admits, and output tokens are only paid when generated.
      r = await loop.run([{ role: 'user', content: prompt }], toolDefs, { cacheMessages: true, maxTokens: 32000 });
    } catch (e) {
      const err = /** @type {CategorizedError} */ (e);
      // A throw OUT OF loop.run() is provider/loop territory by definition — the
      // interpreter's own code is not on that stack. The real run died `read
      // ENETUNREACH` mid-call and was filed interpreter-red ("fix the middle"),
      // when the honest decision was "the network failed — retry" (F11). A
      // governance halt keeps its own category; everything else is provider-red,
      // the same class the drafting path already names.
      err.category = e instanceof HaltError ? 'cap-halt' : (err.category ?? 'provider-red');
      throw err;
    }
    // bare-agent NEVER throws HaltError out of run() — a governance halt comes
    // back as an error RETURN ({text: '', error: 'halt:<rule>'}; loop.js: "no
    // throw even when throwOnError: true"). Read it, or the failure map goes
    // blind and a cap story masquerades as a worker result (design law #8).
    // A denial streak ('denied:<tool>', BA-11) is a governance deny, not a
    // broken interpreter — gate-red, same category as text mode's fence deny.
    // A TRUNCATED round ('truncated:max_tokens', BA-6, bare-agent 0.27.0) is the
    // API cutting the generation off at the output cap — not a middle fault. It is
    // provider-red (retry), the same class as an ENETUNREACH transport failure
    // (F11): no verdict exists and the failed round's spend is only partly known.
    // Before 0.27.0 this round was laundered into a clean finish with error:null
    // (F25) — every prior sonnet arm ran on that bug; the fix surfaces it as its
    // own error, so the middle can escalate instead of scoring an empty attempt.
    // OUR OWN stop is not a fault (F20), and since 0.27.0 (BA-3/BA-5) `loop.stop()`
    // returns `error: null` with the run's text preserved — so a bounded attempt
    // lands on the clean-return path below with no special-casing (the 0.26.2
    // `stoppedByBound` shim that un-lied the HARD_ROUND_LIMIT return is gone).
    if (r.error) {
      const err = /** @type {CategorizedError} */ (new Error(`worker loop: ${r.error}`));
      err.category = r.error.startsWith('halt:') ? 'cap-halt'
        : r.error.startsWith('denied:') ? 'gate-red'
        : r.error.startsWith('truncated:') ? 'provider-red'
        : 'interpreter-red';
      throw err;
    }
    return r;
  }

  /**
   * @param {string} slot
   * @param {{iteration?: number, gap?: string, context?: any}} o
   */
  async function runOps(slot, { iteration, gap, context }) {
    for (const op of slotOps(slot)) {
      if (op.op === 'recall') {
        /** @type {RecallHit[]} */
        const hits = [];
        for (const kind of recallKinds(op)) {
          hits.push(...await lc.recall(task, { kind, n: op.k ?? config.memory.recall?.k ?? 5, body: true }));
        }
        context.text = hits.map((h) => h.body ?? h.text ?? '').filter(Boolean).join('\n');
        context.level = null;
        // paths ride on the event: a recall whose CONTENT is invisible blinds every
        // downstream instrument to what the worker was handed (F33 — P5's green looked
        // like an impossible sight-unseen edit until recall_log forensics explained it)
        emit('hook-op', { slot, op: 'recall', hits: hits.length, paths: hits.map((h) => /** @type {any} */ (h).path).filter(Boolean), iteration });
      } else if (op.op === 'compress') {
        const level = op.level ?? config.memory.compressLevel ?? 'verbatim';
        if (context.text) context.text = await compress({ text: context.text, format: 'js' }, { level });
        emit('hook-op', { slot, op: 'compress', level, iteration });
      } else if (op.op === 'stash') {
        if (gap) lc.stash(`gap-${iteration}`, gap);
        emit('hook-op', { slot, op: 'stash', iteration });
      } else if (op.op === 'remember') {
        // tool mode has no single target to read back — the green's retained
        // form is the worker's own change summary (its final loop text), which
        // is what a future recall can actually use
        const content = mode === 'tools' ? (lastText ?? '') : readFileSync(/** @type {string} */ (target), 'utf8');
        await lc.remember(`green-${iteration ?? 'final'}-${mode === 'tools' ? 'tools' : /** @type {string} */ (target).split('/').at(-1)}`, content, { kind: op.kind ?? 'fact' });
        emit('hook-op', { slot, op: 'remember' });
      }
    }
  }

  // Mid-run revision: interpreter-owned acceptance — a revisor cannot vouch for
  // its own output. The gate is already constructed and the iteration budget
  // already snapshotted, so gate/escalation (arbiter) and loop.maxIterations
  // (cap) must be byte-identical; anything else that validates is a legal
  // free-axis revision.
  /** @param {any} candidate
   *  @returns {{ red: {code: string, reds?: object[]} } | { red?: undefined, config: any }} */
  const acceptRevision = (candidate) => {
    if (!candidate) return { red: { code: 'parse-error' } };
    const cv = validateConfig(candidate, { shellCapUsd, jobWriteScope });
    if (!cv.ok) return { red: { code: 'validation', reds: cv.reds } };
    // judged and installed on the PARSED form (single-parse contract) — a
    // string candidate compared raw would false-red arbiter-touch (its .gate
    // is undefined), and installing it raw would crash every later read
    const cand = /** @type {any} */ (cv.config);
    if (JSON.stringify(cand.gate) !== JSON.stringify(config.gate)
        || JSON.stringify(cand.escalation) !== JSON.stringify(config.escalation)) {
      return { red: { code: 'arbiter-touch' } };
    }
    if (cand.loop?.maxIterations !== config.loop.maxIterations) return { red: { code: 'cap-touch' } };
    return { config: cand };
  };

  /** @type {string[]} */
  const gaps = [];
  let revised = false;
  /** @type {string|undefined} set on artifact-red, consumed by the next attempt's prompt */
  let artifactNote;
  /** @type {string|undefined} tool mode: the last attempt's summary text (retention source) */
  let lastText;
  /**
   * @param {number} iteration
   * @param {string} [gap]
   */
  const middle = async (iteration, gap) => {
    roundIteration = iteration; // stamps every round of this attempt (F12)
    roundsThisAttempt = 0;      // the bound is PER ATTEMPT — a fresh conversation, a fresh budget (F20)
    if (gap) gaps.push(gap);
    if (revisor && !revised && gaps.length >= STALL_REDS) {
      emit('stall-detected', { iteration, consecutiveReds: gaps.length });
      revised = true; // one revision per run, spent even if rejected
      let rv;
      try {
        // the run's own gate handlers ride along: revisor spend hits the same
        // budget axis as the worker; a budget halt mid-revision is a cap story,
        // not a revision bug
        // the METERED handler: revisor rounds are real money on the same axis (F12)
        rv = await revisor({ config, gaps: [...gaps], policy, onLlmResult: meteredOnLlmResult });
      } catch (e) {
        if (e instanceof HaltError) /** @type {CategorizedError} */ (e).category = 'cap-halt';
        throw e;
      }
      const rr = acceptRevision(rv.candidate);
      if (rr.red) {
        emit('revision-red', { iteration, ...rr.red, detail: rv.parseError ?? undefined, costUsd: rv.costUsd ?? 0 });
      } else {
        emit('revision-accepted', { iteration, changedPaths: diffPaths(config, rr.config), costUsd: rv.costUsd ?? 0 });
        config = rr.config;
      }
    }
    if (gap) await runOps('after-red', { iteration, gap, context: {} });
    const context = {};
    await runOps('before-attempt', { iteration, context });
    // F10 (first real-model run): a tool-mode worker must be TOLD where the
    // repository is. The persona demands absolute paths, but bare-agent's shell
    // tools resolve relative paths against the PROCESS cwd — not the workdir —
    // so a worker with no root is working blind: the real run groped for the repo
    // (/home/hamr, the runner's own directory, then /) and the fence denied every
    // guess until the denial streak stopped it. Containment held; the task was
    // impossible. Text mode is told nothing: it has no tools to point anywhere,
    // and the shell alone chooses its one target.
    // (parts[0] stays the task: the plan shape re-orders around it)
    const parts = [
      task,
      mode === 'tools' && `Repository root (absolute): ${workdir}\nEvery path you pass to a tool MUST be absolute and inside this root — a relative path resolves against a different directory and will be denied by the gate.`,
      // F13: what the close says about the tree RIGHT NOW — the state a human
      // maintainer reads first. Given only until an attempt of our own exists
      // (then `gap` is the truer, attributable evidence). The real run withheld
      // this on the grounds that "no attempt has happened", and the worker — which
      // cannot run the suite itself, the `run` verb being locked — groped through
      // the repository and burned the entire cap without one write. Attributing an
      // attempt and describing the tree are different claims; this is the second.
      !gap && closeState && `The close is currently failing. This is its output on the tree as it stands (not an attempt of yours):\n${closeState}`,
      context.text && `Possibly relevant notes:\n${context.text}`, gap && `Previous attempt failed the test suite:\n${gap}`,
      artifactNote && `Previous attempt never reached the close:\n${artifactNote}`,
      // F20: a bounded attempt must SAY it was bounded. Otherwise the worker reads its own
      // truncated transcript as a finished one, learns nothing from being cut off, and spends
      // the next attempt investigating exactly as far and stopping exactly as short.
      attemptBounded !== undefined && attemptBounded === iteration - 1
        && `Your previous attempt was CUT OFF after ${TURNS_PER_ATTEMPT} tool rounds without making a change. Reading is bounded; writing is not. `
          + `Form a hypothesis EARLY and make the edit — a wrong cheap edit is corrected by the next round, but an attempt that never writes teaches this loop nothing.`];

    if (config.loop.shape === 'plan') {
      // plan-then-execute: one call to decompose, one to implement following the plan
      const p = await ask([`Produce a SHORT numbered implementation plan (2-4 steps) for this task. Plan only, no code.`, ...parts.slice(1), parts[0]].filter(Boolean).join('\n\n'));
      emit('worker-plan', { iteration, ...priceOf(p) }); // priceOf: the ONE honest-null cost read (F6)
      parts.push(`Follow this plan:\n${p.text}`);
    }
    const r = await ask(parts.filter(Boolean).join('\n\n'));
    emit('worker-result', { iteration, ...priceOf(r), toolCalls: r.metrics?.toolCalls ?? 0, tokens: r.usage?.outputTokens ?? null });

    // Tool mode: the worker already wrote through the gated tools (every call
    // policy-checked against the fence); its final text is a change summary,
    // not an artifact — there is nothing to extract and artifact-red genuinely
    // does not exist here (2b decision #3). The close judges the tree as-is.
    if (mode === 'tools') {
      lastText = r.text ?? '';
      return;
    }

    // Fence-robust extraction BEFORE the gate: what gets written is the
    // artifact, not the response (F2 #2). A response with no artifact reds on
    // its OWN axis — artifact-red — and writes nothing: the close will red
    // against the stale/missing target, but the spine names the true cause,
    // so the contrast evidence stays clean (F21's instrument caveat).
    const ex = extractArtifact(r.text);
    if (ex.red) {
      emit('artifact-red', { iteration, category: 'artifact-red', reason: ex.red });
      artifactNote = `your response was rejected as a non-artifact (${ex.red}) — emit ONLY the code artifact`;
      return; // retryable: the next attempt carries the note; ralph's cap still governs
    }
    artifactNote = undefined;
    const code = /** @type {string} */ (ex.code); // non-null: ex.red was checked above
    const t = /** @type {string} */ (target); // text mode contract: target is required
    const decision = await gate.check({ type: 'write', path: t, args: { bytes: code.length } });
    if (decision.outcome !== 'allow') {
      const err = /** @type {CategorizedError} */ (new Error(`gate ${decision.outcome} write to ${t} (${decision.rule ?? 'no rule'})`));
      err.category = decision.severity === 'halt' ? 'cap-halt' : 'gate-red';
      throw err;
    }
    writeFileSync(t, code);
    emit('artifact-written', { iteration, path: t });
  };

  // the config may tighten the shell's iteration budget, never exceed it (mirrors budgetUsd)
  const effectiveCap = Math.min(capRuns, config.loop.maxIterations ?? capRuns);
  // Secrets never enter the spine (hard line): the shell scrubs close output at
  // the source with bareguard's redactor — BG-1 defaults (Bearer/sk-…) PLUS the
  // validator's whole shape inventory (SECRET_PATTERNS), so redaction can never
  // pass a shape detection reds (a git close echoing a ghp_ token was the gap).
  // Injected here (the layer that owns bareguard) so ralph stays stdlib-only and
  // the scrub is a fixed shell primitive, not an emergent component (V4 holds).
  // cwd: workdir — the close judges the tree the work happened in (F8). A close
  // is a repository command (`npm test`); run from anywhere else it silently
  // judges another repo and exit-code-is-truth stops being true.
  // expect/judged/gapKeep are the SIGNED spec's, threaded verbatim — the drafted
  // config cannot express any of them (they are arbiter territory, PRD v1.11; F28
  // for gapKeep, which keeps a large suite's failure NAMES in the gap the worker
  // sees instead of letting the bound elide them into a bare "N fail").
  const outcome = await ralph({ middle, close, capRuns: effectiveCap, emit, closeTimeoutMs, cwd: workdir, expect: closeExpect, judged: closeJudged, gapKeep: closeGapKeep, workerWrites, redact: (/** @type {string} */ s) => redact(s, { patterns: SECRET_PATTERNS }) });
  if (outcome === 'green') {
    // The close already passed — a retention hiccup must not un-green a real
    // green (it would corrupt the learning curve). It degrades loudly:
    // retention-red on the spine means this green mints NO inheritance, but
    // the delivery stands (adaptlearn F5).
    try {
      await runOps('on-green', {});
    } catch (e) {
      emit('retention-red', { category: 'retention-red', detail: String(/** @type {Error} */ (e).message || e) });
    }
  }
  // Design law #2 (adaptlearn F18): the run-as-executed record. A mid-run
  // revision changes `config`; without this event the revised config dies with
  // the run and every inheritance channel reads only the config-as-authored.
  emit('config-final', { config, revised });
  return outcome;
}
