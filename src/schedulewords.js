// T Part 3 (PANEL-BUILD.md T addendum, C.3 / C.6): the WORDS of a schedule. ONE owner of these strings. Pure
// functions: typed facts in, a fixed sentence out. No model text ever reaches a sentence (the only slot-fills are
// numbers, a file or folder name and the person's own path). `home` is injected (never a default inside a test).
// Rewritten from fwdloop src/summary-words.js (`scheduledWords`, `slotWords`, `nextTimeWords`, `nextInWords`,
// `editClearsWords`, `scheduledNextFor`, `catchUpWords`), minus `endedWords` and every ask (bareloop has neither:
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

/** Every schedule button/word the page shows lives here, so a reword is one edit (hamr will reword on his walk). */
export const SCHEDULE_WORDS = Object.freeze({
  byHand: 'By hand',
  cancelSchedule: 'Cancel schedule',
  cancelWords: 'Cancel schedule',
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

/** Said BEFORE a person signs an edit of a job that has a trigger (D.7). `null` when the job is by hand. @param {Trigger|null|undefined} t @param {string} [home] */
export function editClearsWords(t, home) {
  const w = scheduledWords(t, home);
  if (w === null) return null;
  return `This job runs by itself (${w}). Signing this edit clears that back to By hand. You can set it again once the new job has had one good run.`;
}

/**
 * NEXT of a scheduled job: one sentence, first match wins.
 *  1. a run of this job is waiting for the person's Accept (the next scheduled run does NOT wait for it, T7);
 *  2. the latest outcome this month is `monthly-exhausted` (amounts from the row), RED;
 *  3. a clock kind with a next slot; 4. a file kind that is armed; 5. not armed yet.
 * A last outcome of `refused` goes in front of 3-5, so a trigger that cannot start is never silent.
 * `red` is the typed flag for "the person must act": the page paints it and never guesses from the text.
 * @param {{trigger: Trigger, armed: boolean, nextSlotMs: number|null, lastOutcome: any, waitingRunNo: number|null, now: number}} f
 *   `lastOutcome` = the newest outcome row of the CURRENT signing (`kind`, `at` in ms, `why`, `leftUsd`, `needUsd`, `atLeast`)
 * @returns {{text: string, red: boolean}}
 */
export function scheduledNextFor(f) {
  const { trigger, armed, nextSlotMs, lastOutcome, waitingRunNo, now } = f;
  /** @param {string} text @param {boolean} [red] */
  const say = (text, red = false) => ({ text, red });
  if (waitingRunNo !== null) return say(`Run ${waitingRunNo} is waiting for your Accept. The next scheduled run does not wait for it.`);
  const last = lastOutcome && typeof lastOutcome === 'object' ? lastOutcome : null;
  const sameMonth = last !== null && typeof last.at === 'number' && Number.isFinite(last.at)
    && new Date(last.at).getFullYear() === new Date(now).getFullYear() && new Date(last.at).getMonth() === new Date(now).getMonth();
  if (last !== null && last.kind === 'monthly-exhausted' && sameMonth && typeof last.leftUsd === 'number' && typeof last.needUsd === 'number') {
    const left = last.atLeast === true ? `at most ${panelMoney2(last.leftUsd)} left` : `${panelMoney2(last.leftUsd)} left`;
    return say(`Paused: not enough money left this month (${left}, a run needs up to ${panelMoney2(last.needUsd)}). Raise the monthly limit in Settings, or it starts again on the 1st.`, true);
  }
  const lead = last !== null && last.kind === 'refused' && typeof last.why === 'string' && last.why !== '' ? `The last try did not start: ${last.why} ` : '';
  const red = lead !== '';
  if (!armed) return say(`${lead}Not armed yet: the panel arms it on its next check.`, red);
  if (trigger.kind === 'file-updated') return say(`${lead}Watching for it. A run starts when its contents change.`, red);
  if (trigger.kind === 'new-file') return say(`${lead}Watching for it. A run starts for each new file.`, red);
  if (nextSlotMs === null) return say(`${lead}Not armed yet: the panel arms it on its next check.`, red);
  return say(`${lead}Next run ${slotWords(nextSlotMs)}.`, red);
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
