// MCP + tickets piece 1a (ITEM33-BUILD addendum 2026-11-02, "Piece 1a"): a ticket for a deterministic (code-repo) job.
// The ticket is NOT a tracked repo file and must never reach the person's repo, so it lives OUTSIDE the tracked tree: a frozen file in the run's worktree under
// `.bareloop-input/<label>.txt`, hidden by git's PRIVATE exclude (the common dir's info/exclude, as installed `node_modules` is). The worker reads it (it sits inside
// readScope), cannot write it (no signed write fence can contain a folder that is not in the job's listing; see the gate test), and the close never reads or names it.
// This file: the $0 proof of the Inputs line, and the run-start freeze.
import { discoverServers } from 'bare-agent/mcp';
import { parseTicketList } from './ticketshape.js';
import { configForServer, remoteRefusal } from './ticketmcp.js';

/** the folder inside a repo job's worktree that holds a frozen ticket (one spelling; the private exclude line is derived from it) */
export const TICKET_INPUT_DIR = '.bareloop-input';

/** the file a ticket line freezes to, relative to the worktree: the label made file-safe, the way a rubric input is named @param {string} label @returns {string} */
export function ticketInputRel(label) {
  const stem = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ticket';
  return `${TICKET_INPUT_DIR}/${stem}.txt`;
}

/**
 * The $0 proof of a repo job's ticket line: the job's server is named in the person's MCP config (a file is read; nothing is started), it is not a remote one,
 * and `issue_read` is among the tools the job signed. The address itself parsed already (the caller only asks for an issues address).
 * @param {{server: string, tools: string[]}} mcp @param {{configPath?: string}} [deps] test seam
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function proveTicketLine(mcp, deps = {}) {
  const { file, remote } = configForServer(mcp.server, deps.configPath);
  if (!discoverServers([file]).has(mcp.server)) return { ok: false, error: `${mcp.server} is not in ~/.mcp.json` };
  if (remote) return { ok: false, error: remoteRefusal(mcp.server) };
  if (!mcp.tools.includes('issue_read')) return { ok: false, error: 'issue_read, the tool that reads a ticket, is not among the tools this job signed' };
  return { ok: true };
}

/**
 * The ONE ticket line of a repo job's Inputs: a line 2+ whose value is a GitHub issues address.
 * @param {{n: number, label: string, value: string}[]} inputs
 * @returns {{ok: true, line: {n: number, label: string, value: string}}|{ok: false, error: string}}
 */
export function repoTicketLine(inputs) {
  const lines = inputs.slice(1).filter((l) => parseTicketList(l.value).ok);
  if (lines.length === 0) return { ok: false, error: 'This job reads a ticket, but none of its Inputs (after the repo) is the issues page of a GitHub repository (owner/repo/issues).' };
  if (lines.length > 1) return { ok: false, error: 'This job reads one ticket, but more than one of its Inputs is a GitHub issues address.' };
  return { ok: true, line: lines[0] };
}
