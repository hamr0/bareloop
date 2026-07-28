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
// litectx's rank-tiered render — a free function, not a ctx method (its contract's
// own recipe: the caller slices the chunk body, compress renders the signature tier)
const { compress: compressNode } = require('litectx');

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
// read/grep/write are bare-agent's shell tools; the ctx_* verbs are litectx's,
// composed from the SAME LiteCtx the retrieval pair already uses. P (design
// record 2026-07-28) widened this from six to the full four-component catalog —
// every verb an EXISTING implementation (menu-is-inventory, hamr's #3), grouped:
//   write    write · edit                                  (tree, writeScope fence)
//   select   read · grep · recall · get · impact · related · recent   (read-only)
//   compress compress · peek                                          (read-only)
//   isolate  stash · remember · forget          (store-write class, own action types)
export const TOOL_BY_VERB = Object.freeze({
  read: 'shell_read', grep: 'shell_grep', write: 'shell_write', edit: 'shell_edit',
  recall: 'ctx_recall', get: 'ctx_get',
  impact: 'ctx_impact', related: 'ctx_related', recent: 'ctx_recent',
  compress: 'ctx_compress', peek: 'ctx_peek',
  stash: 'ctx_stash', remember: 'ctx_remember', forget: 'ctx_forget',
});
export const CTX_TOOLS = Object.freeze(['ctx_recall', 'ctx_get', 'ctx_impact', 'ctx_related', 'ctx_recent', 'ctx_compress', 'ctx_peek', 'ctx_stash', 'ctx_remember', 'ctx_forget']);

// F19 applied per component: a granted verb ships WITH the line that says WHEN to
// reach for it, or the model keeps using the familiar tool. planrun composes the
// strategies whose component has at least one granted verb.
export const COMPONENT_STRATEGIES = Object.freeze({
  select: '\nBefore changing a function, ask what depends on it: ctx_impact(<symbol>) names its callers and importers, '
    + 'ctx_related(<path>) walks the import graph around a file, and ctx_recent lists recently-edited symbols. '
    + 'A fix that type-checks but breaks a dependent you never looked at is the failure these exist to prevent.',
  compress: '\nWhen you only need what a function IS rather than how it works, ctx_compress(<path>,<symbol>) returns its '
    + 'signature and doc without the body — far cheaper than reading it. ctx_peek(<id>) shows the head and tail of '
    + 'something you stashed without paying for its bytes again.',
  isolate: '\nYour context is re-sent and re-billed every round. Park bulky intermediate results with ctx_stash(<id>,<text>) '
    + 'and check them later with ctx_peek(<id>) instead of carrying them in conversation. Record a durable conclusion '
    + 'with ctx_remember(<id>,<text>) so a later step can ctx_recall it; ctx_forget(<id>) retracts a note that proved wrong.',
});

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
    {
      name: 'ctx_impact',
      description: 'Before changing a symbol, see what depends on it: callers, importers, and mention sites across the repository. '
        + 'Returns a text readout of the blast radius — a fix that compiles but breaks an unseen dependent is what this prevents.',
      parameters: {
        type: 'object',
        properties: { symbol: { type: 'string', description: 'Function/class/identifier name, e.g. "addNums".' } },
        required: ['symbol'],
      },
      execute: async (/** @type {{symbol: string}} */ { symbol }) => {
        const imp = await lc.impact(String(symbol));
        if (!imp) {
          emit('ctx-tool', { tool: 'ctx_impact', symbol: String(symbol), outcome: 'unknown-symbol', bytes: 0 });
          return `no indexed symbol "${symbol}" — check the spelling with ctx_recall first`;
        }
        // the readout is the shape the POC measured: defs/callers/callees are arrays of
        // {path, line}; confirmed/mentions are COUNTS; risk is the one-word summary
        const lines = [];
        for (const d of imp.defs ?? []) lines.push(`defined\t${d.path}:${d.startLine}`);
        for (const c of imp.callers ?? []) lines.push(`called by\t${c.path}:${c.line}${c.symbol ? ` (in ${c.symbol})` : ''}`);
        for (const c of imp.callees ?? []) lines.push(`calls\t${c.path}:${c.line}`);
        lines.push(`risk ${imp.risk} — ${imp.confirmed} confirmed caller(s), ${imp.mentions} mention(s)`);
        const out = lines.join('\n');
        emit('ctx-tool', { tool: 'ctx_impact', symbol: String(symbol), hits: lines.length, bytes: Buffer.byteLength(out) });
        return out;
      },
    },
    {
      name: 'ctx_related',
      description: 'Walk the import graph around one file: what it imports and what imports it (1 hop). '
        + 'Use before editing a file to know its neighbourhood; use ctx_impact for a specific symbol instead.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Repository-relative path, e.g. "src/chunker.js".' } },
        required: ['path'],
      },
      execute: async (/** @type {{path: string}} */ { path: p }) => {
        const rel = String(p).startsWith(workdir + sep) ? String(p).slice(workdir.length + 1) : String(p);
        const r = lc.related(rel, { dir: 'both', hops: 1 });
        if (!r || !r.items.length) {
          emit('ctx-tool', { tool: 'ctx_related', path: rel, hits: 0, bytes: 0 });
          return `no import edges recorded for "${rel}" — the file is isolated or the path is not indexed`;
        }
        const out = r.items.map((/** @type {any} */ i) => `${i.via === 'in' ? 'imported by' : 'imports'}\t${i.id}`).join('\n');
        emit('ctx-tool', { tool: 'ctx_related', path: rel, hits: r.items.length, bytes: Buffer.byteLength(out) });
        return out;
      },
    },
    {
      name: 'ctx_recent',
      description: 'List recently-edited symbols in this repository, most recent first — where the churn is.',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        const rows = lc.recentActivity() ?? [];
        const out = rows.length
          ? rows.map((/** @type {any} */ r) => `${r.id ?? r.symbol}\t${r.kind ?? ''}\tedits ${r.edits ?? '?'}`).join('\n')
          : 'no recent edit activity recorded';
        emit('ctx-tool', { tool: 'ctx_recent', hits: rows.length, bytes: Buffer.byteLength(out) });
        return out;
      },
    },
    {
      name: 'ctx_compress',
      description: 'Read a function\'s SIGNATURE — declaration head plus doc-comment, implementation body elided. '
        + 'Far cheaper than the body when you only need what it is, not how it works. Give the path and the symbol name.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repository-relative path.' },
          symbol: { type: 'string', description: 'The function/class name inside that file.' },
        },
        required: ['path', 'symbol'],
      },
      execute: async (/** @type {{path: string, symbol: string}} */ { path: p, symbol }) => {
        const rel = String(p).startsWith(workdir + sep) ? String(p).slice(workdir.length + 1) : String(p);
        // recall→chunk→slice→compress: the contract's own recipe (compress takes a
        // body the CALLER slices; recall/nodesForPath give the range, not the text)
        const node = lc.getNode(rel);
        const chunk = node?.chunks.find((/** @type {any} */ c) => c.symbol === String(symbol));
        if (!chunk) {
          emit('ctx-tool', { tool: 'ctx_compress', path: rel, symbol: String(symbol), outcome: 'no-symbol', bytes: 0 });
          return `no symbol "${symbol}" in "${rel}" — ctx_recall the name to find where it lives`;
        }
        const file = lc.get(rel);
        if (!file?.text) {
          emit('ctx-tool', { tool: 'ctx_compress', path: rel, symbol: String(symbol), outcome: 'no-body', bytes: 0 });
          return `"${rel}" has no readable body in the index`;
        }
        const body = file.text.split('\n').slice(chunk.startLine, chunk.endLine + 1).join('\n');
        const sig = await compressNode({ text: body, format: node.format, symbol: String(symbol) }, { level: 'signature' });
        emit('ctx-tool', { tool: 'ctx_compress', path: rel, symbol: String(symbol), bytes: Buffer.byteLength(sig), savedBytes: Buffer.byteLength(body) - Buffer.byteLength(sig) });
        return sig;
      },
    },
    {
      name: 'ctx_stash',
      description: 'Park a payload OUT of your context under a key — it is stored, not lost, and costs nothing per round while parked. '
        + 'Use for bulky intermediate results (long outputs, gathered evidence) you may need later. Retrieve its head/tail with ctx_peek.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Key to park under, e.g. "step2-tsc-output".' },
          text: { type: 'string', description: 'The payload to park.' },
        },
        required: ['id', 'text'],
      },
      execute: async (/** @type {{id: string, text: string}} */ { id, text }) => {
        lc.stash(String(id), String(text));
        const out = `parked ${Buffer.byteLength(String(text))} bytes under "${id}"`;
        emit('ctx-tool', { tool: 'ctx_stash', id: String(id), bytes: Buffer.byteLength(String(text)) });
        return out;
      },
    },
    {
      name: 'ctx_peek',
      description: 'Look at the head and tail of a stashed payload WITHOUT paying for its full bytes. '
        + 'The cheap check on something you parked with ctx_stash.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The key it was stashed under.' } },
        required: ['id'],
      },
      execute: async (/** @type {{id: string}} */ { id }) => {
        const p = lc.peek(String(id));
        if (!p) {
          emit('ctx-tool', { tool: 'ctx_peek', id: String(id), outcome: 'no-key', bytes: 0 });
          return `nothing stashed under "${id}"`;
        }
        const out = `stash "${id}": ${p.bytes} bytes\nhead: ${p.head}\ntail: ${p.tail}`;
        emit('ctx-tool', { tool: 'ctx_peek', id: String(id), bytes: Buffer.byteLength(out) });
        return out;
      },
    },
    {
      name: 'ctx_remember',
      description: 'Record a durable note under a key — it survives this step and a later step can find it with ctx_recall. '
        + 'Use for conclusions worth keeping (root causes, decisions), never for bulk data (use ctx_stash for that).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Note key, e.g. "root-cause".' },
          text: { type: 'string', description: 'The note.' },
        },
        required: ['id', 'text'],
      },
      execute: async (/** @type {{id: string, text: string}} */ { id, text }) => {
        await lc.remember(String(id), String(text), { kind: 'fact', by: 'agent' });
        emit('ctx-tool', { tool: 'ctx_remember', id: String(id), bytes: Buffer.byteLength(String(text)) });
        return `remembered "${id}"`;
      },
    },
    {
      name: 'ctx_forget',
      description: 'Retract a note recorded with ctx_remember — use when a conclusion proved wrong.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The note key to retract.' } },
        required: ['id'],
      },
      execute: async (/** @type {{id: string}} */ { id }) => {
        const n = lc.forget(String(id));
        emit('ctx-tool', { tool: 'ctx_forget', id: String(id), removed: n });
        return `forgot ${n} note(s) under "${id}"`;
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
  // P's select/compress verbs are READS like the retrieval pair: the path-naming ones
  // are judged against the named file (the deny list applies through every door), the
  // index-wide ones against the run directory. `tool` rides along for the audit (F18).
  if (name === 'ctx_related' || name === 'ctx_compress') return { type: 'read', path: resolve(String(workdir ?? ''), expandHome(String(args?.path ?? ''))), args: { tool: name } };
  if (name === 'ctx_impact' || name === 'ctx_recent' || name === 'ctx_peek') return { type: 'read', path: resolve(String(workdir ?? '')), args: { tool: name } };
  // Isolate verbs write to the litectx STORE, never the tree — they get their OWN
  // action types (default-allow through the gate; admission is the signed spec's
  // tools array). Judging them as 'write' would count store parks as tree writes in
  // the F32 workerWrites instrument and corrupt worker-crash routing; judging them
  // as 'read' would hide a write-class act from the audit. `bytes` rides so the
  // audit can read the isolate economy.
  if (name === 'ctx_stash' || name === 'ctx_remember') return { type: name, args: { id: String(args?.id ?? ''), bytes: String(args?.text ?? '').length } };
  if (name === 'ctx_forget') return { type: name, args: { id: String(args?.id ?? '') } };
  return { type: name, args };
};
