// T Part 3 (PANEL-BUILD.md T addendum, G.9): the words of a schedule, one owner. Part 6 extends this file.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduledWords, slotWords, SCHEDULE_WORDS } from '../src/schedulewords.js';
import { doorAccepted } from '../src/reviewdoor.js';

test('scheduledWords: every kind, home shown as ~, by hand has no sentence', () => {
  assert.equal(scheduledWords(null), null);
  assert.equal(scheduledWords({ kind: 'daily', hour: 9, minute: 5 }), 'Every day at 09:05');
  assert.equal(scheduledWords({ kind: 'weekdays', hour: 13, minute: 15 }), 'Weekdays at 13:15');
  assert.equal(scheduledWords({ kind: 'weekly', day: 'mon', hour: 9, minute: 0 }), 'Mondays at 09:00');
  assert.equal(scheduledWords({ kind: 'file-updated', path: '/h/me/data/invoices.xlsx' }), 'When invoices.xlsx is updated');
  assert.equal(scheduledWords({ kind: 'new-file', folder: '/h/me/inbox' }, '/h/me'), 'When a new file arrives in ~/inbox/');
  assert.equal(scheduledWords({ kind: 'new-file', folder: '/srv/in/' }, '/h/me'), 'When a new file arrives in /srv/in/');
});

test('slotWords: fixed English, local time', () => {
  assert.equal(slotWords(new Date(2026, 9, 13, 9, 0).getTime()), 'Tue 13 Oct, 09:00');
});

test('every schedule sentence ends in the promise or sits in the one table', () => {
  assert.match(SCHEDULE_WORDS.notGreen, /Nothing was changed\.$/);
  assert.match(SCHEDULE_WORDS.stale, /Nothing was signed/);
});

test('doorAccepted: only an honoured accept counts', () => {
  assert.equal(doorAccepted([{ type: 'review-door' }]), false);
  assert.equal(doorAccepted([{ type: 'door-decision', decision: 'accept', honoured: false }]), false);
  assert.equal(doorAccepted([{ type: 'door-decision', decision: 'rerun', honoured: true }]), false);
  assert.equal(doorAccepted([{ type: 'door-decision', decision: 'accept', honoured: true }]), true);
  assert.equal(doorAccepted(null), false);
});

// ---- T Part 6: the rest of the words module ----
import {
  nextTimeWords, nextInWords, scheduledNextFor, catchUpWords, lateRefusalWords,
} from '../src/schedulewords.js';

const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();

test('nextTimeWords: today / tomorrow by calendar day, else the date', () => {
  const now = at(14, 12, 0);
  assert.equal(nextTimeWords(at(14, 15, 0), now), 'today 15:00');
  assert.equal(nextTimeWords(at(15, 9, 0), now), 'tomorrow 09:00');
  assert.equal(nextTimeWords(at(20, 9, 5), now), 'Tue 20 Oct, 09:05');
  assert.equal(nextTimeWords(at(15, 0, 5), at(14, 23, 59)), 'tomorrow 00:05', 'by calendar day, not by 24 hours');
});

test('nextInWords: whole units rounded down, never 0m', () => {
  const now = at(14, 12, 0);
  assert.equal(nextInWords(now + 5_000, now), 'next in 1m');
  assert.equal(nextInWords(now + 20 * 60_000, now), 'next in 20m');
  assert.equal(nextInWords(now + 3 * 3600_000 + 1000, now), 'next in 3h');
  assert.equal(nextInWords(now + 47 * 3600_000, now), 'next in 47h');
  assert.equal(nextInWords(now + 72 * 3600_000, now), 'next in 3d');
});

test('scheduledNextFor: first match wins; a refused lead and money-used-up are RED, typed, not guessed from text', () => {
  const now = at(14, 12, 0);
  const base = { trigger: { kind: 'daily', hour: 15, minute: 0 }, armed: true, nextSlotMs: at(14, 15, 0), lastOutcome: null, waitingRunNo: null, now };
  assert.deepEqual(scheduledNextFor(base), { text: 'Next run Wed 14 Oct, 15:00.', red: false });
  // 1: a run is waiting for Accept; the next scheduled run does not wait (T7)
  assert.deepEqual(scheduledNextFor({ ...base, waitingRunNo: 4 }), { text: 'Run 4 is waiting for your Accept. The next scheduled run does not wait for it.', red: false });
  // 2: the month is used up: RED, amounts two-decimal
  const month = { kind: 'monthly-exhausted', at: at(14, 9, 0), leftUsd: 0.12, needUsd: 0.5 };
  assert.deepEqual(scheduledNextFor({ ...base, lastOutcome: month }), { text: 'Paused: not enough money left this month ($0.12 left, a run needs up to $0.50). Raise the monthly limit in Settings, or it starts again on the 1st.', red: true });
  assert.match(scheduledNextFor({ ...base, lastOutcome: { ...month, atLeast: true, leftUsd: 0.004 } }).text, /at most \$0\.0040 left/);
  // waiting-for-Accept outranks the money line
  assert.equal(scheduledNextFor({ ...base, waitingRunNo: 2, lastOutcome: month }).red, false);
  // last month's exhausted row no longer paints this month red
  assert.deepEqual(scheduledNextFor({ ...base, lastOutcome: { ...month, at: new Date(2026, 8, 20).getTime() } }), { text: 'Next run Wed 14 Oct, 15:00.', red: false });
  // refused lead, then the usual 3-5
  const refused = { kind: 'refused', at: at(14, 9, 0), why: 'The key is gone.' };
  assert.deepEqual(scheduledNextFor({ ...base, lastOutcome: refused }), { text: 'The last try did not start: The key is gone. Next run Wed 14 Oct, 15:00.', red: true });
  // 4: file kinds
  assert.equal(scheduledNextFor({ ...base, trigger: { kind: 'new-file', folder: '/in' }, nextSlotMs: null }).text, 'Watching for it. A run starts for each new file.');
  assert.equal(scheduledNextFor({ ...base, trigger: { kind: 'file-updated', path: '/in/a' }, nextSlotMs: null }).text, 'Watching for it. A run starts when its contents change.');
  // 5: not armed
  assert.equal(scheduledNextFor({ ...base, armed: false, nextSlotMs: null }).text, 'Not armed yet: the panel arms it on its next check.');
  // a non-monthly last outcome is not red
  assert.equal(scheduledNextFor({ ...base, lastOutcome: { kind: 'busy', at: now } }).red, false);
});

test('catchUpWords: only a catch-up run says so; lateRefusalWords: under the bound it will retry, at the bound it is given up', () => {
  assert.equal(catchUpWords({ catchUp: false }), null);
  assert.equal(catchUpWords(null), null);
  assert.match(catchUpWords({ catchUp: true }), /^This run was a catch-up: it started more than 2 minutes after its set time/);
  assert.equal(lateRefusalWords('Spawn failed.', 1, 3), 'Spawn failed. It will be tried again.');
  assert.equal(lateRefusalWords('Spawn failed.', 3, 3), 'Spawn failed. It was tried 3 times and is given up on.');
});
