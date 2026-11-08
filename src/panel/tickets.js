// borrowed-from: fwdloop src/panel/tickets.js@v0.29.0 (adapted: GROUP_OF is keyed by bareloop's STATUS keys (src/panel/status.js), the one table; the ticket list itself is NOT taken, the grid
// (src/panel/jobgrid.js) is the one view; the queue seam is the schedule door's `arriveAnyway`, which writes the ledger row (src/triggertickets.js `recordAnyway`) or, while the schedule is off, starts at once)
// ITEM33-BUILD piece 4 (R8): the four buckets of a ticket job's grid and `POST /api/author/ticket-anyway`.
import { isTicketNumber, TICKET_NUMBER_WORDS } from '../ticketshape.js';

/** the four buckets, in the mockup's order: key, label, open at first. The page draws them; it types none of these words. */
export const TICKET_GROUPS = Object.freeze([
  Object.freeze({ key: 'wait', label: 'Needs you', open: true }),
  Object.freeze({ key: 'stop', label: 'Stopped', open: true }),
  Object.freeze({ key: 'done', label: 'Passed', open: false }),
  Object.freeze({ key: 'skip', label: 'Skipped', open: false }),
]);

/**
 * A run's STATUS KEY (src/panel/status.js, the one table) -> its bucket. A running run still needs a person or is still going: Needs you. A run waiting at its review door is `passed` in the table
 * but needs the person's Accept: the grid moves it to Needs you from the run list's own `needs` tag (`bucketOf`, src/panel/jobgrid.js), never from a second outcome reader.
 */
export const GROUP_OF = Object.freeze({
  running: 'wait', waiting: 'wait', passed: 'done', failed: 'stop', capped: 'stop', stopped: 'stop', died: 'stop', skipped: 'skip',
});

/** a "Run it anyway" reason: short, never blank. The same bar as a rerun's. */
export const ANYWAY_REASON_MAX = 500;

/**
 * `POST /api/author/ticket-anyway {job, ticket, reason}`: a SKIPPED ticket is run anyway, after a short reason. Without a reason nothing starts. `isSkipped(job, number)` says whether the
 * job's grid holds that ticket as a skipped row nobody has run since; `door.arriveAnyway({job, number, reason})` is the ONE seam (production: the schedule door's).
 * @param {{body: any, isSkipped: (job: string, number: number) => boolean, door: {arriveAnyway: (a: {job: string, number: number, reason: string}) => Promise<{ok: boolean, say: string, started?: boolean}>}}} a
 * @returns {Promise<{status: number, body: Record<string, any>}>}
 */
export async function ticketAnyway({ body, isSkipped, door }) {
  const b = body !== null && typeof body === 'object' ? body : {};
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason === '') return { status: 400, body: { ok: false, refused: 'reason-required', say: 'Please write a reason to run it anyway. Nothing started.' } };
  if (reason.length > ANYWAY_REASON_MAX) return { status: 400, body: { ok: false, refused: 'reason-too-long', say: `Keep the reason under ${ANYWAY_REASON_MAX} characters. Nothing started.` } };
  if (typeof b.job !== 'string' || b.job === '' || !isTicketNumber(b.ticket)) return { status: 400, body: { ok: false, refused: 'bad-request', say: `Name the job and the ticket number (${TICKET_NUMBER_WORDS}). Nothing started.` } };
  if (!isSkipped(b.job, b.ticket)) return { status: 409, body: { ok: false, refused: 'not-skipped', say: `Ticket #${b.ticket} is not a skipped ticket of this job. Nothing started.` } };
  const r = await door.arriveAnyway({ job: b.job, number: b.ticket, reason });
  if (!r.ok) return { status: 409, body: { ok: false, refused: 'queue', say: r.say } };
  return r.started === true
    ? { status: 202, body: { ok: true, started: true, number: b.ticket, say: r.say } }
    : { status: 202, body: { ok: true, queued: true, number: b.ticket, say: r.say } };
}
