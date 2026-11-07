// borrowed-from: fwdloop src/ticket-next.js@v0.29.0 (adapted: "has run" is the job's run-list rows, which carry the ticket number; the look is bareloop's triggertickets.js)
// MCP + tickets piece 8 / piece 1 (ITEM33-BUILD, R6): a by-hand run of a Tickets job with no ticket number takes the NEWEST UNRUN ticket - the schedule's own look (`lookTickets`, the
// job's signed `list_issues`, newest first, open tickets), above the highest number this job has already run (a skipped run included: its row carries the number too). A job with no
// ticket run yet takes the newest open ticket of the first page (the first run reads the newest ticket at the time it starts; older ones never run). Nothing new = one plain line, $0, no run.
// A typed number still works and never reaches this file. ONE owner: `run-u` calls it for a fresh Tickets run that names no ticket, whether the CLI or the panel started it.
import { parseTicketList } from './ticketshape.js';
import { LOOK_TOOL, lookTickets } from './triggertickets.js';

/**
 * The ticket numbers this job's runs have read.
 * @param {ReadonlyArray<{job?: string, ticket?: unknown}>} rows the run list's rows @param {string} job @returns {Set<number>}
 */
export function ranTicketNumbers(rows, job) {
  const out = new Set();
  for (const r of rows) if (r && r.job === job && Number.isInteger(r.ticket)) out.add(r.ticket);
  return /** @type {Set<number>} */ (out);
}

/**
 * @param {{job: string, rows: ReadonlyArray<any>, inputs: Array<{value: string}>, mcp: {server: string, tools: string[]}, configPath?: string, look?: typeof lookTickets}} o `look` is a test seam
 * @returns {Promise<{ok: true, number: number} | {ok: false, say: string}>}
 */
export async function newestUnrunTicket({ job, rows, inputs, mcp, configPath, look = lookTickets }) {
  const again = 'Fix that, then start the job again.';
  const list = inputs.map((i) => ({ value: String(i.value).trim(), p: parseTicketList(i.value) })).find((x) => x.p.ok && x.p.kind === 'issue');
  if (!list) return { ok: false, say: `The newest ticket can only be found on an issues list, so this job cannot pick the newest one. ${again}` };
  if (!mcp.tools.includes(LOOK_TOOL)) return { ok: false, say: `This job's signed tools do not include ${LOOK_TOOL}, the tool that finds the newest ticket. ${again}` };
  const ran = ranTicketNumbers(rows, job);
  const r = await look({ listUrl: list.value, mcp: { server: mcp.server, tool: LOOK_TOOL }, ...(configPath ? { configPath } : {}), seen: ran.size === 0 ? null : ran, last: new Map(), watch: [] });
  // the cause is the look's own words (a locked pass names itself); one full stop at the end, never a doubled `?.`
  if (!r.ok) return { ok: false, say: `The newest ticket could not be looked up. The reason: ${/[.?!]$/.test(r.error) ? r.error : `${r.error}.`} ${again}` };
  const numbers = r.found.map((f) => f.number);
  if (numbers.length === 0) return { ok: false, say: ran.size === 0 ? `No open ticket at ${list.value}.` : `Nothing new: no ticket newer than #${Math.max(...ran)} has come in.` };
  return { ok: true, number: Math.max(...numbers) };
}
