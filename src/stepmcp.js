// A plan step's MCP tools (MCP+tickets piece 6, ITEM33-BUILD addendum 2026-11-02, R2c). A step that carries `mcpTools` starts the person's own MCP server ONCE for
// the step, with exactly those tools (`allow`), and hands the worker the bridge tools beside its shell and ctx tools; the bridge closes after the step's last try.
// "Only granted names reach the Loop" (menu-is-inventory): an unsigned tool does not exist for the worker, and the gate's allowlist (below) is the second wall.
// The start options are the one set every place bareloop starts an MCP uses (src/ticketmcp.js): PATH+HOME only, no provider key; cwd = the home folder.
import { createMCPBridge, discoverServers } from 'bare-agent/mcp';
import { TOOL_BY_VERB, toolAction } from './tools.js';
import { configForServer, remoteRefusal, startRefusal, firstLine, mcpStartOpts, mcpToolName, MCP_TIMEOUT_MS } from './ticketmcp.js';

/**
 * The gate `tools.allowlist` for a step that grants MCP tools. bareguard's allowlist is EXCLUSIVE for every action (fwd F116 measured it denying fs too), and its
 * identity for an action is `action.tool ?? action.type` — bareloop's `toolAction` sets no `tool`, so the identity is the action TYPE (`read`, `write`, `edit`,
 * `ctx_stash`...), never the tool name (`shell_read`): a list of names denies the step's own reads (tested against the real Gate). A bridge tool has no
 * translation, so its type IS its name (`github_issue_read`). So: the types of the step's granted verbs, taken from `toolAction` itself (no second spelling that
 * could drift), plus the signed bridge names. Anything else, an unsigned bridge tool included, is denied by `tools.allowlist.exclusive`.
 * @param {string[]} granted the step's verbs @param {string} server @param {string[]} mcpTools @param {string} workdir @returns {string[]}
 */
export function mcpAllowlist(granted, server, mcpTools, workdir) {
  const types = new Set(granted.map((v) => /** @type {string} */ (toolAction(/** @type {Record<string, string>} */ (TOOL_BY_VERB)[v], { path: workdir }, workdir).type)));
  return [...types, ...mcpTools.map((t) => mcpToolName(server, t))];
}

/**
 * Start the bridge for one step. Throws an Error in plain words (the cause named, at $0, before any token) when the server is not configured, will not start, or
 * lacks a tool the job signed; the bridge is closed before it throws.
 * @param {{mcp: {server: string, tools: string[]}, mcpTools: string[], configPath?: string, home?: string, timeoutMs?: number}} o
 *   `configPath`/`home` are test seams (an explicit MCP config file; the config home); production passes neither.
 * @returns {Promise<{server: string, mcpTools: string[], tools: any[], names: string[], close: () => Promise<void>}>}
 */
export async function startStepMcp({ mcp, mcpTools, configPath: explicit, home, timeoutMs = MCP_TIMEOUT_MS }) {
  const { server } = mcp;
  const { file, remote } = configForServer(server, explicit, home);
  if (!discoverServers([file]).has(server)) throw refusal(`${server} is not in ~/.mcp.json`);
  if (remote) throw refusal(remoteRefusal(server));
  /** @type {any} */ let bridge;
  try {
    // confirmServer must return exactly `true` (bare-agent), and only for the server the job signed
    bridge = await createMCPBridge({ configPaths: [file], ...mcpStartOpts(), timeout: timeoutMs, callTimeout: timeoutMs, confirmServer: (/** @type {string} */ n) => n === server, allow: { [server]: mcpTools } });
    const failed = bridge.errors.find((/** @type {any} */ e) => e.server === server);
    if (failed) throw refusal(`${server} did not start: ${firstLine(failed.error)}`);
    const lacking = bridge.missing?.[0];
    if (lacking) throw refusal(`${server} does not offer ${lacking.tool}`);
    const names = mcpTools.map((t) => mcpToolName(server, t));
    const tools = bridge.tools.filter((/** @type {{name: string}} */ t) => names.includes(t.name));
    const absent = names.find((n) => !tools.some((/** @type {{name: string}} */ t) => t.name === n));
    if (absent) throw refusal(`${server} does not offer ${absent.slice(server.length + 1)}`);
    const b = bridge;
    return { server, mcpTools, tools, names, close: async () => { try { await b.close(); } catch { /* already closed */ } } };
  } catch (e) {
    try { await bridge?.close(); } catch { /* already closed */ }
    throw /** @type {any} */ (e)?.category ? e : refusal(startRefusal(server, e));
  }
}

/** an Error whose message is the plain-words cause; `interpreter-red` is the class a step-setup fault already lands in @param {string} message */
function refusal(message) {
  const err = /** @type {Error & {category?: string}} */ (new Error(message));
  err.category = 'interpreter-red';
  return err;
}
