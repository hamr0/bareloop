// borrowed-from: fwdloop src/mcp-use.js@105f81a (re-shaped: fwd scans its run folders; bareloop reads the run list's spines. fwd's post-tag 4a06ae7 `hasOwnProperty` fix is NOT copied: tool counts are read with Object.hasOwn from the start)
// How often each MCP server's tools were used, read from what runs already record. Nothing new is written, nothing is started.
//   - a ticket read: `source.json` (beside the run's prepared copy) `mcp.calls` (a plain-folder / rubric job) or `inputs[].mcp.calls`; for a CODE-REPO job the
//     frozen ticket's `mcp.calls` ride on the spine's FIRST `job-start` record (`ticket.mcp`), and only that one (a resumed leg repeats it). The file holds no time,
//     so `last` is the file's mtime (the job-start's `ts` for a repo job);
//   - a step's tool call: a gate-audit row (`phase:"gate"`) in the run's work folder whose action type is `<server>_<tool>` (the step bridge names a tool so);
//     `decision:"deny"` is a denied call, counted apart and not as a use.
// A torn or unreadable file is skipped, row by row (its rows go missing from the count; it never breaks the page). A run whose spine is not under a `source-<seed>`
// folder (a bundle run) has no source.json and no work folder to find: it is not counted, never guessed.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sourceNearSpine } from './runfiles.js';
import { GATE_AUDIT_FILE } from './kinds.js';

/** @param {string} p */
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** the ticket-read records of one run: `[{server, tool, at}]` @param {string} spine @returns {Array<{server: string, tool: string, at: string}>} */
function ticketCalls(spine) {
  /** @type {Array<{server: string, tool: string, at: string}>} */
  const out = [];
  const near = sourceNearSpine(spine);
  const add = (/** @type {any} */ m, /** @type {string} */ at) => {
    if (!m || typeof m.server !== 'string') return;
    for (const c of Array.isArray(m.calls) ? m.calls : []) if (c && typeof c === 'object' && Object.hasOwn(c, 'tool') && typeof c.tool === 'string') out.push({ server: m.server, tool: c.tool, at });
  };
  if (near.sourceJsonPath) {
    const j = readJson(near.sourceJsonPath);
    let at = '';
    try { at = statSync(near.sourceJsonPath).mtime.toISOString(); } catch { /* no time */ }
    if (j && typeof j === 'object') {
      add(j.mcp, at);
      for (const i of Array.isArray(j.inputs) ? j.inputs : []) add(i?.mcp, at);
    }
  }
  let text = '';
  try { text = readFileSync(spine, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.includes('"type":"job-start"')) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r?.type !== 'job-start') continue;
    if (r.ticket?.mcp) add(r.ticket.mcp, typeof r.ts === 'string' ? r.ts : '');
    break; // the first leg's job-start only
  }
  return out;
}

/** the gate-audit files of one run's work folder(s) @param {string} spine @returns {string[]} */
function auditFiles(spine) {
  const near = sourceNearSpine(spine);
  if (!near.sourceJsonPath) return [];
  const files = [join(dirname(near.sourceJsonPath), 'tree', GATE_AUDIT_FILE)];
  const wt = readJson(near.sourceJsonPath)?.worktree;
  if (typeof wt === 'string' && wt !== '') files.push(join(wt, GATE_AUDIT_FILE));
  return files;
}

/**
 * @param {Array<{ spine?: string, runid?: string }>} rows the run list's rows (`readRunList().rows`)
 * @param {string[]} servers the server names to count for; a step tool row belongs to the LONGEST name that prefixes it with `_`
 * @returns {Map<string, { calls: number, runs: number, last: string|null, denied: number, tools: Map<string, number> }>}
 */
export function countMcpUse(rows, servers) {
  const byLength = [...servers].sort((a, b) => b.length - a.length);
  /** @type {Map<string, { calls: number, runSet: Set<string>, last: string, denied: number, tools: Map<string, number> }>} */
  const acc = new Map(servers.map((s) => [s, { calls: 0, runSet: new Set(), last: '', denied: 0, tools: new Map() }]));
  const use = (/** @type {string} */ server, /** @type {string} */ tool, /** @type {string} */ run, /** @type {string} */ at, /** @type {boolean} */ denied) => {
    const a = acc.get(server);
    if (!a) return;
    if (denied) { a.denied++; return; }
    a.calls++; a.runSet.add(run); a.tools.set(tool, (a.tools.get(tool) ?? 0) + 1);
    if (at && at > a.last) a.last = at;
  };
  const seenRuns = new Set();
  for (const row of rows) {
    if (typeof row?.spine !== 'string') continue;
    const key = String(row.runid ?? row.spine);
    if (seenRuns.has(key)) continue;
    seenRuns.add(key);
    for (const c of ticketCalls(row.spine)) use(c.server, c.tool, key, c.at, false);
    for (const file of auditFiles(row.spine)) {
      let text;
      try { text = readFileSync(file, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"phase":"gate"')) continue;
        let r;
        try { r = JSON.parse(line); } catch { continue; }
        const type = r?.action?.type;
        if (r?.phase !== 'gate' || typeof type !== 'string') continue;
        const server = byLength.find((s) => type.startsWith(`${s}_`) && type.length > s.length + 1);
        if (server) use(server, type.slice(server.length + 1), key, typeof r.ts === 'string' ? r.ts : '', r.decision === 'deny');
      }
    }
  }
  return new Map([...acc].map(([s, a]) => [s, { calls: a.calls, runs: a.runSet.size, last: a.last || null, denied: a.denied, tools: a.tools }]));
}
