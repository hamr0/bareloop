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
