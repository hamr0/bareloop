// borrowed-from: fwdloop src/mcp-pick.js@d18d65b (imports are bareloop's: the config home is `keysHome`, the person's home folder is `mcpHome`)
// The ONE place that decides the tools a job gets from its MCP. A job with an MCP gets ALL the tools of that MCP's newest OK line in `mcp-checks.jsonl` (src/mcpchecks.js),
// set by code: never chosen by the drafter, never reviewed by the person, and no server is ever started here (a server starts only on a press of `check tools`).
// A tool the server gains later is not in the job. Read-only; writes nothing.
import { newestOkMcpTools } from './mcpchecks.js';
import { mcpSources, mcpConfigFor } from './mcpsources.js';
import { remoteRefusal } from './ticketmcp.js';

/** the one refusal for an MCP nobody has checked (or whose check never succeeded) */
export const NEVER_CHECKED_SAY = 'press check tools in Settings > MCP first';

/**
 * @param {string} server
 * @param {{ home?: string, mcpHome?: string }} [o] `home` the config home (undefined = `~/.config/bareloop`); `mcpHome` the person's home folder the MCP config places live under (tests inject one)
 * @returns {{ ok: true, server: string, tools: string[] } | { ok: false, say: string }}
 */
export function mcpPickFor(server, o = {}) {
  const place = mcpSources(o).places.find((p) => p.servers.some((s) => s.name === server));
  if (!place) return { ok: false, say: `${server} is not in any MCP config (Settings > MCP lists the ones found)` };
  if (mcpConfigFor(server, o)?.remote) return { ok: false, say: remoteRefusal(server) };
  const tools = newestOkMcpTools(o.home, server, place.path);
  return tools === null ? { ok: false, say: NEVER_CHECKED_SAY } : { ok: true, server, tools };
}

/**
 * The spec with the card's flow type and MCP pick signed into it. A `plain` pick writes NOTHING (no `flowType` key, no `mcp`), so every plain job keeps the hash it had before
 * the card had these controls. The `mcp` block is the pick's server and EVERY tool of its newest check; the agent never sets it (`assembleSpec` refuses a draft that carries it).
 * @template {Record<string, any>} T
 * @param {T} spec @param {'plain'|'mcp'|'tickets'} flowType @param {{ server: string, tools: string[] }|null} pick
 * @returns {T}
 */
export function signFlow(spec, flowType, pick) {
  if (flowType === 'plain' || pick === null) return spec;
  return { ...spec, flowType, mcp: { server: pick.server, tools: [...pick.tools] } };
}
