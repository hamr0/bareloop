// MCP + tickets piece 3 (ITEM33-BUILD): what a `new-ticket` schedule is made of, DERIVED from the signed spec so the trigger `{kind:'new-ticket', input}` holds nothing the spec does not
// already sign. The server is `spec.mcp.server`; the ticket list is the value of the Inputs line labelled `trigger.input` (an ISSUES list address); the look's tool is `list_issues`,
// which the signed `mcp.tools` must contain (the look reads with the tools the person signed); the fields to watch are `spec.ticketWatch`.
// One owner, read by the sign-time check (src/panel/schedules.js) and by the scheduler's look (src/panel/scheduler.js).
import { parseTicketList } from './ticketshape.js';
import { LOOK_TOOL } from './triggertickets.js';

/**
 * @param {any} spec the signed job @param {{kind: 'new-ticket', input: string}} trigger
 * @returns {{ok: true, listUrl: string, server: string, watch: string[]} | {ok: false, say: string}}
 */
export function ticketLookOf(spec, trigger) {
  if (spec?.flowType !== 'tickets' || !spec.mcp || typeof spec.mcp.server !== 'string') return { ok: false, say: 'Only a Tickets MCP job can start on a new ticket. Nothing was changed.' };
  const line = (Array.isArray(spec.inputs) ? spec.inputs : []).find((/** @type {any} */ i) => i?.label === trigger.input);
  if (!line) return { ok: false, say: `The input "${trigger.input}" is not one of this job's Inputs, so no new ticket can start a run from it. Nothing was changed.` };
  const list = parseTicketList(line.value);
  if (!list.ok || list.kind !== 'issue') return { ok: false, say: `The input "${trigger.input}" is not a ticket list (a GitHub issues page), so no new ticket can start a run from it. Nothing was changed.` };
  if (!Array.isArray(spec.mcp.tools) || !spec.mcp.tools.includes(LOOK_TOOL)) {
    return { ok: false, say: `This job's signed tools do not include ${LOOK_TOOL}, the tool that looks for new tickets, so a new ticket cannot start a run. Draft the job again as a Tickets MCP job. Nothing was changed.` };
  }
  return { ok: true, listUrl: String(line.value).trim(), server: spec.mcp.server, watch: Array.isArray(spec.ticketWatch) ? [...spec.ticketWatch] : [] };
}
