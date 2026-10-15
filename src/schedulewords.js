// T Part 3 (PANEL-BUILD.md T addendum, C.3 / C.6): the WORDS of a schedule. ONE owner of these strings. Pure
// functions: typed facts in, a fixed sentence out. No model text ever reaches a sentence (the only slot-fills are
// numbers, a file or folder name and the person's own path). `home` is injected (never a default inside a test).
// Rewritten from fwdloop src/summary-words.js (`scheduledWords`, `slotWords`, `nextTimeWords`, `nextInWords`,
// `scheduledNextFor`, `catchUpWords`), minus `endedWords` and every ask (bareloop has neither:
// its ENDED block is `endedFor` in src/panel/server.js).
import { basename } from 'node:path';
import { panelMoney2 } from './panel/authorroutes.js';

/** @typedef {import('./trigger.js').Trigger} Trigger */

const DAY_PLURAL = { mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' };
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');
/** @param {{hour: number, minute: number}} s */
const hhmm = (s) => `${two(s.hour)}:${two(s.minute)}`;

/** A path with the home folder shown as `~`. @param {string} p @param {string|undefined} home */
function tilde(p, home) {
  if (home && (p === home || p.startsWith(`${home}/`))) return `~${p.slice(home.length)}`;
  return p;
}

/**
 * Every schedule button/word the page shows lives here, so a reword is ONE edit (hamr will reword on his walk).
 * The server sends this table with the run detail and the schedule card; the page reads every label from it.
 */
export const SCHEDULE_WORDS = Object.freeze({
  byHand: 'By hand',
  cancelSchedule: 'Cancel schedule',
  cancelWords: 'Cancel schedule',
  // the Run tab's buttons (never relabelled in place: a different state is a different button)
  scheduleRun: 'Schedule run',
  cancelModify: 'Cancel / modify schedule',
  // the one main button of the schedule card
  signSchedule: 'Sign schedule',
  nothingChanged: 'Nothing changed yet. This card only sets or adjusts the schedule; it never runs the job.',
  confirmPrefix: 'Confirm: ',
  // the When field and the blocks
  whenLabel: 'When',
  nowPrefix: 'Now: ',
  scheduledLabel: 'SCHEDULE',
  nextLabel: 'NEXT',
  options: Object.freeze({
    hand: 'By hand',
    daily: 'Every day at HH:MM',
    weekdays: 'Weekdays at HH:MM',
    weekly: 'Every <day> at HH:MM',
    'file-updated': 'When <file> is updated',
    'new-file': 'When a new file arrives in <folder>',
  }),
  // RULED 2026-10-15: the Needs-you pill of a schedule that gave up (hamr may reword)
  gaveUpPill: 'Check',
  // RULED 2026-10-15 (aligned with fwdloop M9 am7): the SCHEDULE row's second line when the last fire started nothing
  problemNext: 'next: fix it in Cancel / modify schedule',
  monthNext: 'next: raise the limit in Settings, or it starts on the 1st',
  acceptWaiting: 'waiting for your Accept (the next run does not wait)',
  scheduleGroup: 'schedule',
  notGreen: 'This job has not had a good run yet. Run it by hand and get it right first; then you can set when it runs. A rubric job also needs your Accept once. Nothing was changed.',
  stale: 'What you were shown is not what is on the card now. Nothing was signed. Look again, then sign.',
});

/**
 * What starts the job, in words. `null` (by hand) has no sentence.
 * @param {Trigger|null|undefined} t @param {string} [home]
 * @returns {string|null}
 */
export function scheduledWords(t, home) {
  if (!t) return null;
  if (t.kind === 'daily') return `Every day at ${hhmm(t)}`;
  if (t.kind === 'weekdays') return `Weekdays at ${hhmm(t)}`;
  if (t.kind === 'weekly') return `${DAY_PLURAL[/** @type {keyof typeof DAY_PLURAL} */ (t.day)] ?? t.day} at ${hhmm(t)}`;
  if (t.kind === 'file-updated') return `When ${basename(t.path)} is updated`;
  const folder = tilde(/** @type {{folder: string}} */ (t).folder, home);
  return `When a new file arrives in ${folder.endsWith('/') ? folder : `${folder}/`}`;
}

/** "Mon 13 Oct, 09:00" — local time, fixed English names (never the machine's locale). @param {number} ms */
export function slotWords(ms) {
  const d = new Date(ms);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * The Scheduled card's first line: "today 17:00", "tomorrow 09:00", else the date the NEXT line already says
 * ("Tue 20 Oct, 09:05"). Local time, by calendar day. @param {number} ms the next run @param {number} now
 */
export function nextTimeWords(ms, now) {
  const d = new Date(ms);
  const day = (/** @type {Date} */ x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const apart = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  if (apart === 0) return `today ${two(d.getHours())}:${two(d.getMinutes())}`;
  if (apart === 1) return `tomorrow ${two(d.getHours())}:${two(d.getMinutes())}`;
  return slotWords(ms);
}

/** "next in 20m" / "next in 3h" / "next in 3d" (whole units, rounded down, never "0m"). @param {number} ms @param {number} now */
export function nextInWords(ms, now) {
  const mins = Math.max(1, Math.floor((ms - now) / 60_000));
  if (mins < 60) return `next in ${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `next in ${hours}h` : `next in ${Math.floor(hours / 24)}d`;
}

/**
 * NEXT of a scheduled job: one sentence, first match wins.
 *  1. a run of this job is waiting for the person's Accept (the next scheduled run does NOT wait for it, T7);
 *  2. the latest outcome this month is `monthly-exhausted` (amounts from the row), RED;
 *  3. a clock kind with a next slot; 4. a file kind that is armed; 5. not armed yet.
 * A last outcome of `refused` goes in front of 3-5, so a trigger that cannot start is never silent.
 * `red` is the typed flag for "the person must act": the page paints it and never guesses from the text.
 * @param {{trigger: Trigger, armed: boolean, nextSlotMs: number|null, lastOutcome: any, waitingRunNo: number|null, now: number, retryInMs?: number|null, gaveUp?: any}} f
 *   `lastOutcome` = the newest outcome row of the CURRENT signing (`kind`, `at` in ms, `why`, `leftUsd`, `needUsd`, `atLeast`)
 * @returns {{text: string, red: boolean}}
 */
export function scheduledNextFor(f) {
  const { trigger, armed, nextSlotMs, lastOutcome, waitingRunNo, now, retryInMs = null, gaveUp = null } = f;
  /** @param {string} text @param {boolean} [red] */
  const say = (text, red = false) => ({ text, red });
  if (waitingRunNo !== null) return say(`Run ${waitingRunNo} is waiting for your Accept. The next scheduled run does not wait for it.`);
  if (gaveUp && typeof gaveUp === 'object') return say(gaveUpNextWords(gaveUp.why), true);
  const last = lastOutcome && typeof lastOutcome === 'object' ? lastOutcome : null;
  const sameMonth = last !== null && sameMonthAs(last.at, now);
  if (last !== null && last.kind === 'monthly-exhausted' && sameMonth && typeof last.leftUsd === 'number' && typeof last.needUsd === 'number') {
    const left = last.atLeast === true ? `at most ${panelMoney2(last.leftUsd)} left` : `${panelMoney2(last.leftUsd)} left`;
    return say(`Paused: not enough money left this month (${left}, a run needs up to ${panelMoney2(last.needUsd)}). Raise the monthly limit in Settings, or it starts again on the 1st.`, true);
  }
  const lead = last !== null && last.kind === 'refused' && typeof last.why === 'string' && last.why !== '' ? `The last try did not start: ${last.why} ${retryWords(retryInMs)}` : '';
  const red = lead !== '';
  if (!armed) return say(`${lead}Not armed yet: the panel arms it on its next check.`, red);
  if (trigger.kind === 'file-updated') return say(`${lead}Watching for it. A run starts when its contents change.`, red);
  if (trigger.kind === 'new-file') return say(`${lead}Watching for it. A run starts for each new file.`, red);
  if (nextSlotMs === null) return say(`${lead}Not armed yet: the panel arms it on its next check.`, red);
  return say(`${lead}Next run ${slotWords(nextSlotMs)}.`, red);
}

/** Is `atMs` in the same local calendar month as `nowMs`? A non-number is never. @param {unknown} atMs @param {number} nowMs */
export function sameMonthAs(atMs, nowMs) {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
  const a = new Date(atMs); const n = new Date(nowMs);
  return a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth();
}

/** RULED 2026-10-15: the red NEXT of a schedule that gave up. @param {unknown} why the refusal's own words */
export function gaveUpNextWords(why) {
  const w = typeof why === 'string' ? why.trim().replace(/\.$/, '') : '';
  return `Stopped trying after 60 minutes: ${w}. Fix it, then Cancel / modify schedule to start again.`;
}

/** The give-up date on the Needs-you card, local `MM/DD HH:MM`. @param {number} ms */
export function gaveUpDateWords(ms) {
  const d = new Date(ms);
  return `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** RULED 2026-10-15: after an install-needed refusal, the wait that is left, in whole minutes rounded up; '' when no wait. @param {number|null|undefined} ms */
export function retryWords(ms) {
  if (typeof ms !== 'number' || !(ms > 0)) return '';
  const m = Math.ceil(ms / 60_000);
  return `Trying again in ${m} minute${m === 1 ? '' : 's'}. `;
}

/** The fixed catch-up sentence from a run's `trigger.json`. @param {any} rec */
export function catchUpWords(rec) {
  return rec && typeof rec === 'object' && rec.catchUp === true ? 'This run was a catch-up: it started more than 2 minutes after its set time (the panel was off).' : null;
}

/**
 * A spawn error AFTER the consuming row: `tries` releases so far, `max` the bound. Under the bound it will be tried again;
 * at the bound it stays consumed and says so. @param {string} why @param {number} tries @param {number} max
 */
export function lateRefusalWords(why, tries, max) {
  return tries < max ? `${why} It will be tried again.` : `${why} It was tried ${max} times and is given up on.`;
}

// ---------------------------------------------------------------------------------------------------------------------------
// RULED 2026-10-15 (aligned with fwdloop M9 am7): the schedule on the Run, Job and Audit tabs. ONE owner of these sentences.

/** "10/15 13:40" — local time. @param {number} ms */
export const dateTimeWords = (ms) => gaveUpDateWords(ms);

/** @param {string} s */
export const lowerFirst = (s) => (s === '' ? s : s[0].toLowerCase() + s.slice(1));

/** "Thu 10/16 08:15" — local time, fixed English day names. @param {number} ms */
export function nextSlotShort(ms) {
  const d = new Date(ms);
  return `${DAY_SHORT[d.getDay()]} ${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** @param {any} rec a run's `trigger.json` @returns {boolean} */
function isNewFile(rec) {
  if (rec.triggerKind) return rec.triggerKind === 'new-file';
  return typeof rec.trigger === 'string' && rec.trigger.startsWith('When a new file arrives');
}

/**
 * Job tab, "Started": how the run began, then its local start time. `rec` = the run's `trigger.json` (null on a hand run).
 * @param {any} rec @param {number|null} atMs the run's start
 */
export function startedWords(rec, atMs) {
  const when = atMs === null ? '' : ` · ${dateTimeWords(atMs)}`;
  if (!rec || typeof rec !== 'object') return `${SCHEDULE_WORDS.byHand}${when}`;
  const trig = typeof rec.trigger === 'string' ? rec.trigger : '';
  let how;
  if (rec.kind === 'file') {
    const name = basename(String(rec.file ?? ''));
    how = isNewFile(rec) ? `By a new file: ${name}` : `By a file update: ${name}`;
  } else {
    how = `By the schedule: ${lowerFirst(trig)}`;
    if (rec.catchUp === true) {
      const min = typeof rec.lateMs === 'number' && rec.lateMs > 0 ? Math.round(rec.lateMs / 60_000) : null;
      how += min === null ? ' · catch-up' : ` · catch-up, ${min} min late`;
    }
  }
  return `${how}${when}`;
}

/**
 * Audit, first row of a run a schedule started. @param {any} rec `trigger.json` @param {number|null} originNo the origin run's number
 */
export function startedAuditWords(rec, originNo) {
  const from = originNo === null ? '' : ` · from run-${originNo}`;
  if (rec.kind === 'file') return `started by the schedule · ${isNewFile(rec) ? 'new file' : 'file update'} ${basename(String(rec.file ?? ''))}${from}`;
  const slot = typeof rec.slot === 'number' ? ` · slot ${two(new Date(rec.slot).getHours())}:${two(new Date(rec.slot).getMinutes())}` : '';
  return `started by the schedule · ${lowerFirst(String(rec.trigger ?? ''))}${slot}${from}${rec.catchUp === true ? ' · catch-up' : ''}`;
}

/** a refusal's own words without its trailing "Nothing started." @param {unknown} why */
function reasonOf(why) {
  return String(why ?? '').replace(/\s*Nothing (started|spent)\.\s*$/, '').trim().replace(/\.$/, '');
}

/**
 * A fire that started nothing, in plain words. `short` = the SCHEDULE row's `last` reason; else the Audit group's line.
 * @param {any} row a ledger row (`busy` | `monthly-exhausted` | `refused` | `gave-up`) @param {boolean} [short]
 */
export function skippedWords(row, short = false) {
  if (row.kind === 'busy') return short ? 'busy: a run of this job was still working' : 'busy — a run of this job was still going. Nothing started.';
  if (row.kind === 'monthly-exhausted') {
    const left = typeof row.leftUsd === 'number' ? `${row.atLeast === true ? 'at most ' : ''}${panelMoney2(row.leftUsd)}` : 'little';
    const need = typeof row.needUsd === 'number' ? panelMoney2(row.needUsd) : 'more';
    return short ? `month used up: ${left} left, needs ${need}` : `month used up — ${left} left, needs ${need}. Nothing spent.`;
  }
  const r = lowerFirst(reasonOf(row.why));
  return short ? `refused: ${r}` : `refused: ${r}. Nothing started.`;
}

/**
 * Job tab, "Schedule": the job's schedule NOW and what it is bound to. The first part IS the Run tab's line ({@link scheduledWords}),
 * first letter lowered, so the two can never disagree.
 * @param {{trigger: Trigger|null, originNo: number|null, model: string|null, destination: string|null, home?: string}} f
 */
export function jobScheduleWords(f) {
  const w = f.trigger ? scheduledWords(f.trigger, f.home) : null;
  if (w === null) return 'none';
  const parts = [lowerFirst(w)];
  if (f.originNo !== null) parts.push(`from run-${f.originNo}`);
  if (f.model) parts.push(f.model);
  if (f.destination) parts.push(tilde(f.destination, f.home));
  return parts.join(' · ');
}

/** RULED 2026-10-15: the SCHEDULE row's `next` while an install-needed refusal is waiting to be tried again. @param {number} ms */
export function retryNextWords(ms) {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return `next: tries again in ${m} min`;
}
