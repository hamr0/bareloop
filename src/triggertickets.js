// borrowed-from: fwdloop src/trigger-tickets.js@v0.29.0 (adapted: bareloop's ticketmcp.js / ticketshape.js / triggerfiles.js; an ISSUES list only)
// MCP + tickets piece 3 (ITEM33-BUILD): the ticket trigger. Proven first in the R6 POC (.claude/scratch/mcp-tickets/r6/live.mjs, fwd F103/F104/F94b).
//
// This file only says WHAT is new on a ticket list: `lookTickets` is ONE $0 look through the person's own MCP server, started with `allow` = only the
// signed `list_issues` tool, and it writes nothing. The ledger rows (baseline / arrived / ran / unreadable / looked) are the scheduler's, written by the functions
// below, the same rows as the file trigger's (src/triggerfiles.js): a ticket is `sha: ticket:<number>` (a re-arrival by a watched change: `ticket:<number>:<k>`),
// `name: #<number>`, `size: 0`, so `queueOf` and `recordDropped` work on it unchanged. Every row carries `sig`; the ids are unique within one signing.
import { createMCPBridge, discoverServers } from 'bare-agent/mcp';

import {
  configForServer, remoteRefusal, mcpStartOpts, startRefusal, firstLine, isDeviceLogin, mcpToolName,
} from './ticketmcp.js';
import { parseTicketList, isTicketNumber, TICKET_MAX } from './ticketshape.js';
import { appendSeen, queueOf, readSeen } from './triggerfiles.js';

/** A look every 15 minutes, fixed (item 8). */
export const TICKET_LOOK_MS = 15 * 60_000;
/** The tool the look reads with: the signed `mcp.tools` must contain it (a schedule on a ticket job is refused at sign time otherwise). */
export const LOOK_TOOL = 'list_issues';
/** The most pages one look follows (a flood bigger than this is `unreadable`, never silently cut). */
const MAX_PAGES = 20;

/** @param {unknown} reply */
const textOf = (reply) => (typeof reply === 'string' ? reply : (Array.isArray(reply) ? reply : /** @type {any} */ (reply)?.content ?? []).map((/** @type {any} */ c) => c?.text ?? '').join(''));
/** @param {any} i */
const labelsOf = (i) => (Array.isArray(i?.labels) ? i.labels : []).map((/** @type {any} */ l) => (typeof l === 'string' ? l : l?.name)).filter((/** @type {unknown} */ n) => typeof n === 'string').sort();
/** @param {any} i the typed values of the watched fields */
export const watchedOf = (i) => ({ state: String(i?.state ?? '').toLowerCase(), labels: labelsOf(i) });

/**
 * Why a ticket changed, in words, only for the watched fields; '' = nothing changed. @param {{state: string, labels: string[]}} prev @param {{state: string, labels: string[]}} cur @param {string[]} watch
 */
export function reasonFor(prev, cur, watch) {
  const r = [];
  if (watch.includes('state') && prev.state !== cur.state) r.push(`state ${prev.state}→${cur.state}`);
  if (watch.includes('labels')) {
    for (const l of cur.labels) if (!prev.labels.includes(l)) r.push(`label added: ${l}`);
    for (const l of prev.labels) if (!cur.labels.includes(l)) r.push(`label removed: ${l}`);
  }
  return r.join('; ');
}

/**
 * One look. `seen` null = the first look after signing (the first page is the starting point, nothing runs). Otherwise newest first with the cursor, stopping at a seen
 * number; with watched fields the walk goes on past it only as far as the oldest tracked ticket, comparing each tracked ticket's watched values with `last`.
 * Every failure is `{ok:false, error}` naming its cause, at $0; none reads as "0 new".
 * `cut` (first look only) = the highest ticket number the job's first green run read: the first look goes on past a page whose tickets are all above it, so every ticket
 * that came in after that run started is seen; `recordLook` then baselines the ones up to `cut` and lets the rest arrive (fwd F114f).
 * @param {{listUrl: string, mcp: {server: string, tool?: string}, configPath?: string, seen: Set<number>|null, last: Map<number, {state: string, labels: string[]}>, watch: string[], cut?: number, perPage?: number, timeoutMs?: number}} o
 * @returns {Promise<{ok: true, first: boolean, cut?: number, ignored?: number[], found: Array<{number: number, state: string, labels: string[], createdAt: string|null}>, changed: Array<{number: number, reason: string, state: string, labels: string[]}>, pages: number} | {ok: false, error: string}>}
 */
export async function lookTickets({
  listUrl, mcp, configPath: explicitConfig, seen, last, watch, cut, perPage = 10, timeoutMs = 90000,
}) {
  const parsed = parseTicketList(listUrl);
  if (!parsed.ok) return parsed;
  if (parsed.kind !== 'issue') return { ok: false, error: `${listUrl} is a pull request list; the new-ticket look reads an issues list` };
  const { owner, repo } = parsed;
  const { server } = mcp;
  const tool = mcp.tool ?? LOOK_TOOL;
  const { file: configPath, remote } = configForServer(server, explicitConfig);
  if (!discoverServers([configPath]).has(server)) return { ok: false, error: `${server} is not in ~/.mcp.json` };
  if (remote) return { ok: false, error: remoteRefusal(server) };
  const first = seen === null;
  let bridge;
  try {
    bridge = await createMCPBridge({ configPaths: [configPath], ...mcpStartOpts(), timeout: timeoutMs, callTimeout: timeoutMs, confirmServer: () => true, allow: { [server]: [tool] } });
    const failed = bridge.errors.find((/** @type {any} */ e) => e.server === server);
    if (failed) return { ok: false, error: `${server} did not start: ${firstLine(failed.error)}` };
    if (bridge.missing?.[0]) return { ok: false, error: `${server} does not offer ${bridge.missing[0].tool}` };
    const list = bridge.tools.find((/** @type {any} */ t) => t.name === mcpToolName(server, tool));
    if (!list) return { ok: false, error: `${server} does not offer ${tool}` };

    /** @param {Record<string, unknown>} args @returns {Promise<{issues: any[], pageInfo?: any}|{error: string}>} one page; a page with no list is asked for once more (F103) */
    const page = async (args) => {
      let cause = 'no ticket list in the answer';
      for (let n = 0; n < 2; n++) {
        let text;
        try { text = textOf(await list.execute(args)); } catch (e) { cause = `${server}: ${tool} failed: ${firstLine(e)}`; continue; }
        if (isDeviceLogin(text)) return { error: 'GitHub token unavailable — is pass locked?' };
        let o;
        try { o = JSON.parse(text); } catch { o = null; }
        if (o && Array.isArray(o.issues)) return o;
        cause = text.trim() === '' ? 'no ticket list in the answer (it was empty)' : `no ticket list in the answer: ${firstLine(text)}`;
        if (/^\S*Could not|error/i.test(text)) break; // an error text will not change by asking again
      }
      return { error: cause };
    };

    const found = [];
    /** @type {number[]} */
    const ignored = [];
    /** @type {Array<{number: number, reason: string, state: string, labels: string[]}>} */
    const changed = [];
    const tracked = new Set(first ? [] : last.keys());
    const oldestTracked = tracked.size > 0 ? Math.min(...tracked) : Infinity;
    const stillNeeded = new Set(tracked);
    let after;
    let pages = 0;
    let hitSeen = false;
    // a ticket is new only if its number is higher than the highest seen (closed seen tickets leave an OPEN-only list; older open ones are not new)
    const maxSeen = first ? 0 : Math.max(0, ...seen);
    for (;;) {
      const args = {
        owner, repo, orderBy: 'CREATED_AT', direction: 'DESC', perPage, ...(watch.length === 0 ? { state: 'OPEN' } : {}), fields: ['number', 'created_at', 'state', 'labels'], ...(after ? { after } : {}),
      };
      // eslint-disable-next-line no-await-in-loop
      const r = await page(args);
      if ('error' in r) return { ok: false, error: r.error };
      pages++;
      if (pages === 1 && r.issues.length === 0) return { ok: false, error: `the list at ${listUrl} came back empty; an empty list is unreadable, not "no new tickets"` };
      let lowest = Infinity;
      for (const i of r.issues) {
        const n = i.number;
        if (!Number.isInteger(n)) continue;
        // a number over the one cap is ignored, never a crash; the look records one reason (fwd 9.7)
        if (!isTicketNumber(n)) { ignored.push(n); continue; }
        lowest = Math.min(lowest, n);
        const rec = { number: n, ...watchedOf(i), createdAt: typeof i.created_at === 'string' ? i.created_at : null };
        if (first) { found.push(rec); continue; }
        if (seen.has(n)) {
          hitSeen = true;
          const prev = last.get(n);
          stillNeeded.delete(n);
          if (prev && watch.length > 0) {
            const reason = reasonFor(prev, rec, watch);
            if (reason) changed.push({ number: n, reason, state: rec.state, labels: rec.labels });
          }
        } else if (!hitSeen && n > maxSeen) found.push(rec);
      }
      if (first && (cut === undefined || lowest <= cut)) break;
      const done = (hitSeen || lowest <= maxSeen) && (watch.length === 0 || stillNeeded.size === 0 || lowest < oldestTracked);
      if (done || !r.pageInfo?.hasNextPage || !r.pageInfo?.endCursor) break;
      if (pages >= MAX_PAGES) return { ok: false, error: `more than ${MAX_PAGES} pages of new tickets in one look` };
      after = r.pageInfo.endCursor;
    }
    return {
      ok: true, first, ...(first && cut !== undefined ? { cut } : {}), ...(ignored.length ? { ignored } : {}), found, changed: changed.sort((a, b) => a.number - b.number), pages,
    };
  } catch (e) {
    return { ok: false, error: startRefusal(server, e) };
  } finally {
    try { await bridge?.close(); } catch { /* already closed */ }
  }
}

// ---- the ledger rows (THE writers; only the scheduler calls them) ----------------------------------------------------------------------------------------------

/** The numbers a signing has a baseline or an arrived row for. @param {string} ledger @param {string} sig */
export function seenNumbers(ledger, sig) {
  return new Set(readSeen(ledger, sig).filter((r) => (r.kind === 'baseline' || r.kind === 'arrived') && Number.isInteger(/** @type {any} */ (r).number)).map((r) => /** @type {any} */ (r).number));
}
/** Last-seen watched values per number: the newest baseline/arrived row's. @param {string} ledger @param {string} sig @returns {Map<number, {state: string, labels: string[]}>} */
export function lastSeen(ledger, sig) {
  const m = new Map();
  for (const r of /** @type {any[]} */ (readSeen(ledger, sig))) if ((r.kind === 'baseline' || r.kind === 'arrived') && r.watch) m.set(r.number, r.watch);
  return m;
}
/** Has this signing had its first look (its baseline written)? @param {string} ledger @param {string} sig */
export const hasBaseline = (ledger, sig) => readSeen(ledger, sig).some((r) => r.kind === 'baseline');

/**
 * The cause of the newest look when it could not read, else null. The newest look row decides: an `unreadable` row is the problem until a later look reads
 * (its `looked`, `baseline` or `arrived` row). @param {import('./triggerfiles.js').SeenRow[]} rows @returns {{at: number, why: string}|null}
 */
export function lookProblemOf(rows) {
  const last = /** @type {any[]} */ (rows).findLast((r) => r.kind === 'unreadable' || r.kind === 'looked' || r.kind === 'baseline' || r.kind === 'arrived');
  return last?.kind === 'unreadable' ? { at: last.at, why: String(last.why ?? 'it could not read the list') } : null;
}

/**
 * Write what a look found, once. First look: a `baseline` row per ticket on the page (never runs). Later: an `arrived` row per new ticket, oldest first (its arrival
 * time is this clock), and one `arrived` row per watched change with its `reason`. A look that could not read writes one `unreadable` row with its cause and NO `baseline`.
 * @param {string} ledger @param {string} sig @param {Awaited<ReturnType<typeof lookTickets>>} look @param {number} at the scheduler's clock
 * @returns {{arrived: number[], unreadable: string|null}}
 */
export function recordLook(ledger, sig, look, at) {
  /** @param {string} id @param {string} kind @param {string} sha @param {number} number @param {{state: string, labels: string[]}} w @param {Record<string, unknown>} [more] */
  const ticketRow = (id, kind, sha, number, w, more = {}) => appendSeen(ledger, /** @type {any} */ ({
    id, kind, sha, name: `#${number}`, path: `#${number}`, size: 0, at, number, watch: { state: w.state, labels: w.labels }, ...more,
  }), sig);
  if (!look.ok) {
    appendSeen(ledger, /** @type {any} */ ({ id: `unreadable:${at}`, kind: 'unreadable', sha: `unreadable:${at}`, name: '', size: 0, at, why: look.error }), sig);
    return { arrived: [], unreadable: look.error };
  }
  // a look that read, after one that could not: one `looked` row ends the problem even when nothing is new; ticket numbers over the cap were ignored by the look, ONE reason is recorded on the same row
  const note = look.ignored?.length ? `ignored ${look.ignored.length} ticket number${look.ignored.length === 1 ? '' : 's'} over ${TICKET_MAX.toLocaleString('en-US')}: ${look.ignored.slice(0, 5).join(', ')}` : null;
  if (note !== null || lookProblemOf(readSeen(ledger, sig))) appendSeen(ledger, /** @type {any} */ ({ id: `looked:${at}`, kind: 'looked', sha: `looked:${at}`, name: '', size: 0, at, ...(note !== null ? { why: note } : {}) }), sig);
  const arrived = [];
  if (look.first) {
    for (const i of [...look.found].reverse()) {
      if (look.cut !== undefined && i.number > look.cut) {
        // above the number the first green run read = it came in after that run began, so it runs once the schedule is on
        ticketRow(`arrived:ticket:${i.number}`, 'arrived', `ticket:${i.number}`, i.number, i);
        arrived.push(i.number);
        continue;
      }
      ticketRow(`baseline:ticket:${i.number}`, 'baseline', `ticket:${i.number}`, i.number, i);
    }
    return { arrived, unreadable: null };
  }
  for (const i of [...look.found].reverse()) {
    ticketRow(`arrived:ticket:${i.number}`, 'arrived', `ticket:${i.number}`, i.number, i);
    arrived.push(i.number);
  }
  for (const c of look.changed) {
    const rows = readSeen(ledger, sig);
    if (queueOf(rows).some((q) => /** @type {any} */ (q).number === c.number)) {
      // already waiting: the queued run reads the ticket as it is when it starts, so no second run. Advance the last-seen value (a `baseline` row, same writer) so the
      // next look does not re-fire this same change once that run has started; a LATER change still differs from it and arrives once.
      const b = rows.filter((r) => r.kind === 'baseline' && /** @type {any} */ (r).number === c.number).length;
      ticketRow(`baseline:ticket:${c.number}:${b}`, 'baseline', `ticket:${c.number}`, c.number, c);
      continue;
    }
    // k = how many `arrived` rows this number already has: `arrived:ticket:<n>` (the first arrival) and `arrived:ticket:<n>:<k>` (a watched change) never share an id
    const k = rows.filter((r) => r.kind === 'arrived' && /** @type {any} */ (r).number === c.number).length;
    ticketRow(`arrived:ticket:${c.number}:${k}`, 'arrived', `ticket:${c.number}:${k}`, c.number, c, { reason: c.reason });
    arrived.push(c.number);
  }
  return { arrived, unreadable: null };
}

/**
 * The consuming row of a ticket's turn. Called ONLY by the starter's `beforeSpawn` hook, after busy, monthly and wouldAccept said yes (T16), exactly as for a file.
 * @param {string} ledger @param {string} sig @param {{sha: string, name: string}} item @param {number} at
 */
export const recordTicketRan = (ledger, sig, item, at) => appendSeen(ledger, { id: `ran:${item.sha}`, kind: 'ran', sha: item.sha, name: item.name, size: 0, at }, sig);

/**
 * "Run it anyway" (ITEM33-BUILD piece 4, borrowed-from fwdloop trigger-tickets.js@v0.29.0 `recordAnyway`): queue a ticket as a NEW arrival with the person's reason and `anyway: true`
 * (the starter then says `--anyway`, so the job's filter never skips it). ONE `arrived` row; a ticket that is already in the queue is refused, never a second run.
 * @param {string} ledger @param {string} sig @param {{number: number, reason: string}} a @param {number} at
 * @returns {{ok: true} | {ok: false, say: string}}
 */
export function recordAnyway(ledger, sig, a, at) {
  const rows = readSeen(ledger, sig);
  if (queueOf(rows).some((q) => /** @type {any} */ (q).number === a.number)) return { ok: false, say: `Ticket #${a.number} is already queued. Nothing more was queued.` };
  const n = rows.filter((r) => r.kind === 'arrived' && /** @type {any} */ (r).number === a.number).length;
  const watch = lastSeen(ledger, sig).get(a.number);
  appendSeen(ledger, /** @type {any} */ ({
    id: `arrived:ticket:${a.number}:${n}`, kind: 'arrived', sha: `ticket:${a.number}:${n}`, name: `#${a.number}`, path: `#${a.number}`, size: 0, at, number: a.number, ...(watch ? { watch } : {}), reason: a.reason, anyway: true,
  }), sig);
  return { ok: true };
}
