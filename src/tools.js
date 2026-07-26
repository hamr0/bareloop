// The worker tool menu — the machinery a plan step's worker is built from: the
// verb→tool map, the litectx retrieval tools, the gate's action translator, and
// the personas/strategy lines that ship with a granted verb (F19: capability
// without strategy is inert).
//
// This file WAS interpret.js, the config-v1 interpreter. That path — the
// operator-authored steps[] chain and the drafted workflow config — was deleted
// 2026-07-26 (PRD v1.32); what remains is the tool machinery the plan flow
// imports, kept because it is the worker's surface, not the dead path's.
//
// One trap encoded here, paid for in adaptlearn: `onLlmResult` is a Loop
// CONSTRUCTOR option — passed to run() it is silently ignored and the budget
// axis goes blind (F3). The consumer (planrun) wires it at construction.

import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);

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
export const PERSONA_TOOLS = 'You are a senior engineer working in a repository through file tools. '
  + 'ALWAYS use absolute paths — relative paths resolve against the process, not the repository, and will be denied. '
  + 'You are ONE attempt inside an automated loop: when you finish, a test suite runs and, if it still fails, you are called again with its output. '
  + 'So do not try to be certain before acting. Read only what you need to form your best hypothesis, make the change with the write tool, and stop. '
  + 'A wrong cheap attempt is corrected by the next round; exhaustive reading is not — every file you read is re-sent on every later round and the run has a hard budget it can exhaust before you ever write. '
  + 'Make the required changes with the write tool, then reply with a short summary of what you changed. Never put file contents in your reply.';

// The retrieval verbs only pay if the worker reaches for them INSTEAD of paging a file.
// F18 measured the failure they exist to fix: the worker read one 117 KB file NINE times
// and dragged 1.37 MB of source through context to reach an 8-line function. The tool
// descriptions carry the mechanics; the persona has to carry the STRATEGY, or a model
// with a familiar `read` and an unfamiliar `recall` will simply keep reading.
// (Module-level + exported since Layer 2: the plan-step worker shares the SAME
// personas/strategies — two spellings of the loop contract would drift, F16.)
export const RETRIEVAL_STRATEGY = '\nYou also have a repository index. To read a function, do NOT read its whole file: '
  + 'call ctx_recall with the function name to get a pointer, then ctx_get with that pointer to read that function alone '
  + '(it comes with its doc-comment, which states what the function is SUPPOSED to do — compare it against what the code does). '
  + 'Reserve shell_read for whole files that are genuinely small, and for files you cannot name a symbol in yet. '
  + 'Search only finds what you can NAME: a failing test names the symptom, not the cause, so read the failing test first, '
  + 'see which function it calls, and recall THAT.';
// BA-13: like retrieval, the edit verb only pays if the worker reaches for it INSTEAD
// of a whole-file rewrite. F31 measured the default: 4 of 5 big-file whole-writes
// broke the tree, and every one was a rewrite to change ~one line. The tool
// description carries the mechanics; the persona carries the strategy.
export const EDIT_STRATEGY = '\nPrefer the edit tool over whole-file writes: quote the EXACT text to change (it must match exactly once) and its replacement. '
  + 'Rewriting a whole file to change one line is how trees get broken and budgets get burned — reserve the write tool for genuinely new files.';

// ---- tool mode (2b): the spec-side grant menu mapped to the underlying tools ----
// read/grep/write are bare-agent's shell tools; recall/get are litectx's retrieval
// verbs (F19), composed from the SAME LiteCtx the memory hooks already use.
export const TOOL_BY_VERB = Object.freeze({ read: 'shell_read', grep: 'shell_grep', write: 'shell_write', edit: 'shell_edit', recall: 'ctx_recall', get: 'ctx_get' });
export const CTX_TOOLS = Object.freeze(['ctx_recall', 'ctx_get']);

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
export function createCtxTools(lc, workdir, emit) {
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
        // resolved absolute path, exactly as toolAction resolves it. Boundary-aware
        // prefix (workdir + sep, the line-247 pattern): bare startsWith would garble a
        // sibling like `${workdir}-backup/x` into `ackup/x` — the gate independently
        // denies such a path before execute() runs, so this is defense in depth only.
        const rel = String(p).startsWith(workdir + sep) ? String(p).slice(workdir.length + 1) : String(p);
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
export const toolAction = (name, args, workdir) => {
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
