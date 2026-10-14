// T Part 3 (PANEL-BUILD.md T addendum, C.3 / C.6): the WORDS of a schedule. ONE owner of these strings. Pure
// functions: typed facts in, a fixed sentence out. No model text ever reaches a sentence (the only slot-fills are
// numbers, a file or folder name and the person's own path). `home` is injected (never a default inside a test).
// Rewritten from fwdloop src/summary-words.js (`scheduledWords`, `slotWords`). Part 6 adds the rest (next time,
// next-in, NEXT sentence, catch-up).
import { basename } from 'node:path';

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
