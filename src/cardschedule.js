// MCP + tickets piece 9 (ITEM33-BUILD R7, port of fwd's `cardSchedule`, src/panel/authortrigger.js@v0.29.0): the $0 check of the New job card's Schedule row, before any session exists.
// The row's pick becomes the typed trigger the job is signed with (`spec.trigger`): "Every day at HH:MM" is the card's own data, "When a new ticket arrives" is filled from the card's
// Inputs (exactly one issues-list line) and the pick's tools, the same `ticketLookOf` the sign-time check and the scheduler's look read. By hand = no schedule at all: the key stays absent,
// so a job with no schedule hashes exactly as before. Pure; writes nothing.
import { validateTrigger, isClockTrigger, isTicketTrigger } from './trigger.js';
import { ticketInputLabels, ticketLookOf } from './ticketschedule.js';

/**
 * @param {any} card the card as submitted (`card.schedule` = {kind, hour?, minute?, day?} or absent / null / {kind: 'hand'})
 * @param {{ flowType: 'plain'|'mcp'|'tickets', pick: {server: string, tools: string[]}|null, inputs: Array<{label: string, value: string}>, hasSchedule?: (job: string) => boolean }} o
 *   `hasSchedule(job)` = the job (by the card's name) already has a schedule file: the card does not overwrite it
 * @returns {{ok: true, trigger: import('./trigger.js').Trigger|null} | {ok: false, error: string}}
 */
export function cardScheduleOf(card, o) {
  const pick = card?.schedule;
  if (pick === undefined || pick === null || pick.kind === 'hand') return { ok: true, trigger: null };
  /** @param {string} error */
  const no = (error) => ({ ok: /** @type {const} */ (false), error });
  if (typeof pick !== 'object' || Array.isArray(pick)) return no('The Schedule is not something this card can sign. Nothing spent.');
  if (typeof card.jobName === 'string' && card.jobName !== '' && o.hasSchedule?.(card.jobName)) {
    return no(`The job "${card.jobName}" already has a schedule. Change it with Cancel / modify schedule on one of its runs. Nothing spent.`);
  }
  /** @type {unknown} */
  let want = pick;
  if (pick.kind === 'new-ticket') {
    const spec = { flowType: o.flowType, mcp: o.pick, inputs: o.inputs };
    const labels = ticketInputLabels(spec);
    if (labels.length === 0) {
      // the same sentence the sign-time check would say (not a Tickets job, no issues list, no list_issues signed)
      const first = o.inputs.find((i) => i.label)?.label ?? '';
      const look = ticketLookOf(spec, { kind: 'new-ticket', input: first });
      return no(`${look.ok ? 'This job cannot start on a new ticket.' : look.say.replace(/ Nothing was changed\.$/, '')} Nothing spent.`);
    }
    if (labels.length !== 1) return no('When a new ticket arrives needs exactly one ticket list in Inputs. Nothing spent.');
    want = { kind: 'new-ticket', input: labels[0] };
  }
  const tv = validateTrigger(want);
  if (!tv.ok) return no(`${tv.say}. Nothing spent.`);
  if (!isClockTrigger(tv.trigger) && !isTicketTrigger(tv.trigger)) return no('The New job card can start a job every day or on a new ticket. A file trigger is set after the first good run. Nothing spent.');
  return { ok: true, trigger: tv.trigger };
}
